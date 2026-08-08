import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { DayBlock } from '../db/types'
import * as sessionsRepo from '../db/repos/sessions'
import { isFreshCycle, pomodoroTargetFor } from '../lib/timer'
import { usePlayerStore } from './player'
import { useLibraryStore } from './library'

/** Defaults from the mockup: 25 min focus / 5 min rest, 3 pomodoros per block. */
export const FOCUS_SEC = 1500
export const REST_SEC = 300
export const POMODOROS_PER_BLOCK = 3

export type TimerPhase = 'focus' | 'rest'

/**
 * Pomodoro countdown for the right-rail widget and the session overlay.
 * The tick is computed from a wall-clock deadline (`endsAt`) rather than by
 * decrementing, so it does not drift when the window is minimised.
 *
 * Phase 9: a fresh focus start attaches to the currently-active work block
 * (the caller passes `activeWorkBlock(...)` or null) and snapshots its
 * title/start/duration/quiet into state, so the session survives the block
 * being edited or deleted mid-session (`ON DELETE SET NULL` covers the DB
 * side). Each pomodoro (and each rest) is one `pomodoro_session` row whose
 * started_at→ended_at wall-clock span includes pauses; the row is completed
 * when the phase elapses and abandoned (completed = 0) when the user rests
 * or resets out of it.
 *
 * All actions update state synchronously BEFORE any await, so the UI stays
 * snappy and existing synchronous callers keep working; the returned
 * promise only flushes persistence for tests. No action ever rejects —
 * persistence failures are caught and logged (the project's P2-A contract).
 */
interface TimerState {
  phase: TimerPhase
  totalSec: number
  remainingSec: number
  running: boolean
  /** Wall-clock deadline (ms epoch) while running; null when paused/stopped. */
  endsAt: number | null
  pomodorosDone: number
  pomodorosPerBlock: number
  /** Attached block snapshot; all null when unattached. */
  blockId: number | null
  blockTitle: string | null
  blockStartMin: number | null
  blockDurationMin: number | null
  blockQuiet: boolean
  /** Id of the currently-open pomodoro_session row; null when none is open. */
  openSessionId: number | null

  hydrate: (driver: SqlDriver | null) => Promise<void>
  start: (candidate?: DayBlock | null) => Promise<void>
  pause: () => Promise<void>
  toggle: (candidate?: DayBlock | null) => Promise<void>
  rest: () => Promise<void>
  reset: () => Promise<void>
  /** Recompute remaining time from the wall clock. Called on an interval. */
  tick: (now?: number) => Promise<void>
}

let persistenceDriver: SqlDriver | null = null

/** Fire-and-forget persistence that never rejects (P2-A). */
function persist(label: string, fn: (driver: SqlDriver) => Promise<void>): Promise<void> {
  if (!persistenceDriver) return Promise.resolve()
  return fn(persistenceDriver).catch((err) => {
    console.error(`Failed to persist timer session (${label}):`, err)
  })
}

export const useTimerStore = create<TimerState>()((set, get) => ({
  phase: 'focus',
  totalSec: FOCUS_SEC,
  remainingSec: FOCUS_SEC,
  running: false,
  endsAt: null,
  pomodorosDone: 0,
  pomodorosPerBlock: POMODOROS_PER_BLOCK,
  blockId: null,
  blockTitle: null,
  blockStartMin: null,
  blockDurationMin: null,
  blockQuiet: false,
  openSessionId: null,

  hydrate: async (driver) => {
    persistenceDriver = driver
  },

  start: async (candidate = null) => {
    const state = get()

    // Resuming a paused timer (same phase, time left): state only, no DB
    // writes — the open row's wall-clock span simply includes the pause.
    const isResume =
      state.remainingSec > 0 && state.remainingSec < state.totalSec

    if (isResume) {
      set({ running: true, endsAt: Date.now() + state.remainingSec * 1000 })
      return
    }

    if (state.phase === 'rest') {
      // Rest is over (or the user bailed on a fresh rest): begin a fresh
      // focus with the attachment kept. The open rest row — if any — is
      // completed here only when it already hit zero (tick handles that);
      // a rest that never ran has no row yet when remainingSec === totalSec.
      const openId = state.openSessionId
      set({
        phase: 'focus',
        totalSec: FOCUS_SEC,
        remainingSec: FOCUS_SEC,
        running: true,
        endsAt: Date.now() + FOCUS_SEC * 1000,
        openSessionId: null,
      })
      const writes: Promise<void>[] = []
      if (openId !== null) {
        // Abandoned rest (user pressed Start before the rest elapsed).
        writes.push(
          persist('abandon-rest', (driver) =>
            sessionsRepo.finishSession(driver, openId, {
              endedAt: new Date().toISOString(),
              completed: false,
            })
          )
        )
      }
      writes.push(
        (async () => {
          if (!persistenceDriver) return
          try {
            const id = await sessionsRepo.startSession(persistenceDriver, {
              blockId: get().blockId,
              phase: 'focus',
              startedAt: new Date().toISOString(),
            })
            set({ openSessionId: id })
          } catch (err) {
            console.error('Failed to persist timer session (start-focus-after-rest):', err)
          }
        })()
      )
      writes.push(usePlayerStore.getState().resumeFromRest())
      await Promise.all(writes)
      return
    }

    // Focus phase, not a resume: either a fresh cycle start (attach to the
    // candidate) or the next pomodoro of an attached cycle (remainingSec 0).
    const fresh = isFreshCycle(state)
    const attachment = fresh
      ? candidate
        ? {
            blockId: candidate.id,
            blockTitle: candidate.title,
            blockStartMin: candidate.startMin,
            blockDurationMin: candidate.durationMin,
            blockQuiet: candidate.quiet,
            pomodorosPerBlock: pomodoroTargetFor(candidate),
          }
        : {
            blockId: null,
            blockTitle: null,
            blockStartMin: null,
            blockDurationMin: null,
            blockQuiet: false,
            pomodorosPerBlock: POMODOROS_PER_BLOCK,
          }
      : {}

    set({
      ...attachment,
      phase: 'focus',
      totalSec: FOCUS_SEC,
      remainingSec: FOCUS_SEC,
      running: true,
      endsAt: Date.now() + FOCUS_SEC * 1000,
      openSessionId: null,
    })

    if (!persistenceDriver) return
    try {
      const id = await sessionsRepo.startSession(persistenceDriver, {
        blockId: get().blockId,
        phase: 'focus',
        startedAt: new Date().toISOString(),
      })
      set({ openSessionId: id })
    } catch (err) {
      console.error('Failed to persist timer session (start-focus):', err)
    }
  },

  pause: async () => {
    const { running, endsAt } = get()
    if (!running || endsAt === null) return
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    // State only: the row STAYS OPEN — one row per pomodoro, its
    // started_at→ended_at wall-clock span includes pauses.
    set({ running: false, endsAt: null, remainingSec: remaining })
  },

  toggle: async (candidate = null) => {
    if (get().running) await get().pause()
    else await get().start(candidate)
  },

  rest: async () => {
    const { openSessionId, blockId } = get()
    const abandonedId = openSessionId
    // Pressing Rest mid-focus abandons the open pomodoro.
    set({
      phase: 'rest',
      totalSec: REST_SEC,
      remainingSec: REST_SEC,
      running: true,
      endsAt: Date.now() + REST_SEC * 1000,
      openSessionId: null,
    })
    const writes: Promise<void>[] = []
    if (abandonedId !== null) {
      writes.push(
        persist('abandon-focus', (driver) =>
          sessionsRepo.finishSession(driver, abandonedId, {
            endedAt: new Date().toISOString(),
            completed: false,
          })
        )
      )
    }
    writes.push(
      (async () => {
        if (!persistenceDriver) return
        try {
          const id = await sessionsRepo.startSession(persistenceDriver, {
            blockId,
            phase: 'rest',
            startedAt: new Date().toISOString(),
          })
          set({ openSessionId: id })
        } catch (err) {
          console.error('Failed to persist timer session (start-rest):', err)
        }
      })()
    )
    if (useLibraryStore.getState().silenceDuringRest) {
      usePlayerStore.getState().pauseForRest()
    }
    await Promise.all(writes)
  },

  reset: async () => {
    const { openSessionId } = get()
    set({
      phase: 'focus',
      totalSec: FOCUS_SEC,
      remainingSec: FOCUS_SEC,
      running: false,
      endsAt: null,
      pomodorosDone: 0,
      pomodorosPerBlock: POMODOROS_PER_BLOCK,
      blockId: null,
      blockTitle: null,
      blockStartMin: null,
      blockDurationMin: null,
      blockQuiet: false,
      openSessionId: null,
    })
    const writes: Promise<void>[] = [usePlayerStore.getState().resumeFromRest()]
    if (openSessionId !== null) {
      writes.push(
        persist('abandon-reset', (driver) =>
          sessionsRepo.finishSession(driver, openSessionId, {
            endedAt: new Date().toISOString(),
            completed: false,
          })
        )
      )
    }
    await Promise.all(writes)
  },

  tick: async (now = Date.now()) => {
    const { running, endsAt, phase, pomodorosDone, openSessionId } = get()
    if (!running || endsAt === null) return
    const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))
    if (remaining > 0) {
      set({ remainingSec: remaining })
      return
    }
    // Phase elapsed: stop on zero. A completed focus counts a pomodoro and
    // completes its row; a completed rest completes its row and brings the
    // sound back.
    set({
      running: false,
      endsAt: null,
      remainingSec: 0,
      pomodorosDone: phase === 'focus' ? pomodorosDone + 1 : pomodorosDone,
      openSessionId: null,
    })
    const writes: Promise<void>[] = []
    if (openSessionId !== null) {
      writes.push(
        persist('complete', (driver) =>
          sessionsRepo.finishSession(driver, openSessionId, {
            endedAt: new Date(now).toISOString(),
            completed: true,
          })
        )
      )
    }
    if (phase === 'rest') {
      writes.push(usePlayerStore.getState().resumeFromRest())
    }
    await Promise.all(writes)
  },
}))

/** Label for the widget counter, e.g. "2 / 3" while the 2nd pomodoro runs. */
export function pomodoroCounterLabel(done: number, perBlock: number): string {
  return `${Math.min(done + 1, perBlock)} / ${perBlock}`
}
