import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { DayBlock, SessionPhase } from '../db/types'
import * as sessionsRepo from '../db/repos/sessions'
import * as blocksRepo from '../db/repos/blocks'
import { isFreshCycle, pomodoroTargetFor, activeWorkBlock } from '../lib/timer'
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
 * Phase 11 P0-2: session rows are owned by an explicit run token
 * (`SessionRun` below), not by the `openSessionId` state field alone. The
 * old model set `openSessionId: null` synchronously, awaited the INSERT,
 * then published the id — so a closer firing while the INSERT was in flight
 * read null, closed nothing, and the late-resolving INSERT published its id
 * into the NEWER run's state: the old row stayed open forever and was
 * mis-associated. Now every start routes through `beginSessionRun` and
 * every close through `endSessionRun`: a run closed while its INSERT is in
 * flight records the outcome on the token, and the resolving INSERT
 * finalises that row instead of publishing it. A late INSERT can therefore
 * never leak into a newer run, and every inserted row is finalised exactly
 * once.
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

  /**
   * Wire the persistence driver, and — when `day`/`nowMin` are given —
   * restore the active block's pomodoro progress from completed focus rows
   * (Phase 11 P1-3). Existing one-argument call sites keep working.
   */
  hydrate: (driver: SqlDriver | null, day?: string, nowMin?: number) => Promise<void>
  start: (candidate?: DayBlock | null) => Promise<void>
  pause: () => Promise<void>
  toggle: (candidate?: DayBlock | null) => Promise<void>
  rest: () => Promise<void>
  reset: () => Promise<void>
  /** Recompute remaining time from the wall clock. Called on an interval. */
  tick: (now?: number) => Promise<void>
}

let persistenceDriver: SqlDriver | null = null

/**
 * The run token for the currently-open (or being-opened) session row.
 * `id` is published when the INSERT resolves; `close` records the outcome
 * when the run is ended before that. Exactly one finalisation path runs
 * per token, so every inserted row is finalised exactly once and a late
 * INSERT can never publish into a newer run.
 */
interface SessionRun {
  /** Row id, published when the INSERT resolves; null while in flight. */
  id: number | null
  /** Outcome recorded when the run is closed before its INSERT resolved. */
  close: { endedAt: string; completed: boolean } | null
}
let currentRun: SessionRun | null = null

/**
 * The store's `set`, captured at creation so the module-level run helpers
 * can publish the resolved row id. Assigned once inside `create(...)`
 * before any action can run.
 */
let setState: (partial: Partial<TimerState>) => void = () => {}

/** Fire-and-forget persistence that never rejects (P2-A). */
function persist(label: string, fn: (driver: SqlDriver) => Promise<void>): Promise<void> {
  if (!persistenceDriver) return Promise.resolve()
  return fn(persistenceDriver).catch((err) => {
    console.error(`Failed to persist timer session (${label}):`, err)
  })
}

/**
 * Open a new session run: INSERT the row and publish its id into state —
 * unless the run was already ended while the INSERT was in flight, in which
 * case the recorded outcome is flushed to the row instead and nothing is
 * published (a newer run owns `openSessionId` by then).
 *
 * Never rejects (P2-A): a failing INSERT is logged and the run is simply
 * dropped, matching the old behavior of a failed startSession.
 */
function beginSessionRun(
  blockId: number | null,
  phase: SessionPhase,
  startedAt: string,
  label: string
): Promise<void> {
  const run: SessionRun = { id: null, close: null }
  currentRun = run
  if (!persistenceDriver) {
    // No database: no run tracking (exact old null-driver behavior).
    currentRun = null
    return Promise.resolve()
  }
  const driver = persistenceDriver
  return (async () => {
    let id: number
    try {
      id = await sessionsRepo.startSession(driver, { blockId, phase, startedAt })
    } catch (err) {
      console.error(`Failed to persist timer session (${label}):`, err)
      return
    }
    if (run.close !== null) {
      // The run ended while the INSERT was in flight: finalise the row with
      // the recorded outcome and do NOT publish — a newer run owns state.
      const outcome = run.close
      await persist('close-late', (d) => sessionsRepo.finishSession(d, id, outcome))
      return
    }
    if (currentRun !== run) {
      // Defensive: reachable only if a run is orphaned without
      // endSessionRun (the hydrate(null) isolation path). Abandon the row
      // rather than leak it open.
      await persist('close-late', (d) =>
        sessionsRepo.finishSession(d, id, {
          endedAt: new Date().toISOString(),
          completed: false,
        })
      )
      return
    }
    run.id = id
    setState({ openSessionId: id })
  })()
}

/**
 * Close the current run with `outcome`. If the row id is already known the
 * UPDATE is flushed now; if the INSERT is still in flight the outcome is
 * recorded on the token and `beginSessionRun` flushes it on resolve. A
 * no-op when no run exists. Never rejects.
 */
function endSessionRun(
  outcome: { endedAt: string; completed: boolean },
  label: string
): Promise<void> {
  const run = currentRun
  currentRun = null
  if (!run) return Promise.resolve()
  if (run.id !== null) {
    const id = run.id // local const so TS narrowing survives the closure
    return persist(label, (d) => sessionsRepo.finishSession(d, id, outcome))
  }
  run.close = outcome
  return Promise.resolve()
}

export const useTimerStore = create<TimerState>()((set, get) => {
  setState = set
  return {
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

    hydrate: async (driver, day, nowMin) => {
      persistenceDriver = driver
      if (!driver || day === undefined || nowMin === undefined) {
        // Isolation/rewire path: a fresh hydrate supersedes any leaked run
        // token — tests call hydrate(null) in beforeEach and rely on it. A
        // run orphaned this way with its INSERT still in flight is abandoned
        // by beginSessionRun's defensive branch when the INSERT resolves.
        currentRun = null
        return
      }
      // The rehydrate path must NEVER clear currentRun: a cycle started
      // before hydrate landed keeps its run token, so its row is still
      // finalised when the phase ends. (Clearing it here would orphan the
      // open row — ended_at NULL forever — while leaving openSessionId set,
      // the same leak class P0-2 exists to close.)

      // Phase 11 P1-3: restore the active block's pomodoro progress after
      // a relaunch. Pure reads — hydrate NEVER writes to the DB and never
      // resumes a countdown (no running/endsAt). The attachment is
      // re-derived from the CURRENT database block, so edits, deletion (the
      // FK NULLs block_id, excluding those rows from the count), and day
      // rollover (the block belongs to `day`) cannot revive a stale
      // snapshot.
      try {
        const blocks = await blocksRepo.listBlocksForDay(driver, day)
        const active = activeWorkBlock(blocks, nowMin)
        if (!active) return // no work block active → stay fresh, counter 0
        const done = await sessionsRepo.countCompletedFocusForBlock(driver, active.id)
        // Guard against a cycle having started while we awaited: only a
        // still-fresh, unattached, run-less store may be rehydrated.
        const s = get()
        if (!isFreshCycle(s) || s.blockId !== null || currentRun !== null) return
        // The raw count is kept even when it meets/exceeds the target —
        // the display helpers already clamp via Math.min.
        set({
          blockId: active.id,
          blockTitle: active.title,
          blockStartMin: active.startMin,
          blockDurationMin: active.durationMin,
          blockQuiet: active.quiet,
          pomodorosPerBlock: pomodoroTargetFor(active),
          pomodorosDone: done,
        })
      } catch (err) {
        // Hydrate must never reject — a rehydrate failure leaves the fresh
        // defaults, which are always safe.
        console.error('Failed to rehydrate timer progress:', err)
      }
    },

    start: async (candidate = null) => {
      const state = get()

      // Resuming a paused timer: state only, no DB writes — the open row's
      // wall-clock span simply includes the pause. The first clause is the
      // ordinary mid-phase pause. The second covers every paused-with-a-
      // live-run state where remainingSec alone misleads:
      //   · a pause within the first wall-clock second of a run — pause()
      //     ceils the remaining time, so remainingSec can still equal
      //     totalSec while a row is open; treating it as fresh would drop
      //     the open row's id without closing it (an orphaned, never-ended
      //     row) and insert a second row for the same run;
      //   · a pause AT the deadline (remainingSec === 0) — resuming with
      //     endsAt = now lets the next tick complete the row and count the
      //     pomodoro, which the wall clock says already happened. Settles
      //     the design question the b946ed3 fix left open: pausing at zero
      //     completes the pomodoro.
      //   · a pause while the run's INSERT is still in flight (Phase 11
      //     P0-2): the row id isn't published yet, so openSessionId reads
      //     null, but currentRun is live — resuming keeps the pending row
      //     instead of abandoning it unseen.
      // A phase that already COMPLETED via tick (remainingSec 0, no live
      // run) fails both clauses and takes the fresh/next-pomodoro path
      // below — dropping the `remainingSec > 0` requirement from the first
      // clause instead of reassociating would route that case into a
      // zero-length resume that increments the counter with no row.
      const isResume =
        (state.remainingSec > 0 && state.remainingSec < state.totalSec) ||
        (!state.running && currentRun !== null)

      if (isResume) {
        set({ running: true, endsAt: Date.now() + state.remainingSec * 1000 })
        return
      }

      if (state.phase === 'rest') {
        // Rest is over (or the user bailed on a running rest): begin a
        // fresh focus with the attachment kept. A PAUSED rest with a live
        // run was handled by the resume branch above, so reaching here
        // means the rest either elapsed (tick already completed its row) or
        // is being abandoned mid-run — the run, if any, is ended below.
        const blockId = state.blockId
        set({
          phase: 'focus',
          totalSec: FOCUS_SEC,
          remainingSec: FOCUS_SEC,
          running: true,
          endsAt: Date.now() + FOCUS_SEC * 1000,
          openSessionId: null,
        })
        // endSessionRun BEFORE beginSessionRun: both are synchronous up to
        // their first await, so the ending run is captured before the new
        // one replaces currentRun.
        const writes: Promise<void>[] = [
          endSessionRun(
            { endedAt: new Date().toISOString(), completed: false },
            'abandon-rest'
          ),
          beginSessionRun(blockId, 'focus', new Date().toISOString(), 'start-focus-after-rest'),
          usePlayerStore.getState().resumeFromRest(),
        ]
        await Promise.all(writes)
        return
      }

      // Focus phase, not a resume: either a fresh cycle start (attach to
      // the candidate) or the next pomodoro of an attached cycle
      // (remainingSec 0).
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

      // Unconditionally end any live run first: a no-op when none exists,
      // and the correct abandon when a rapid start→start (or the old
      // "direct start() while running" residual) left one behind. By
      // construction the superseded run can no longer leak an open row.
      await Promise.all([
        endSessionRun(
          { endedAt: new Date().toISOString(), completed: false },
          'abandon-superseded'
        ),
        beginSessionRun(get().blockId, 'focus', new Date().toISOString(), 'start-focus'),
      ])
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
      const { blockId } = get()
      // Pressing Rest mid-focus abandons the open pomodoro.
      set({
        phase: 'rest',
        totalSec: REST_SEC,
        remainingSec: REST_SEC,
        running: true,
        endsAt: Date.now() + REST_SEC * 1000,
        openSessionId: null,
      })
      // endSessionRun BEFORE beginSessionRun: both are synchronous up to
      // their first await, so the focus run is captured before the rest run
      // replaces currentRun.
      const writes: Promise<void>[] = [
        endSessionRun(
          { endedAt: new Date().toISOString(), completed: false },
          'abandon-focus'
        ),
        beginSessionRun(blockId, 'rest', new Date().toISOString(), 'start-rest'),
      ]
      if (useLibraryStore.getState().silenceDuringRest) {
        usePlayerStore.getState().pauseForRest()
      }
      await Promise.all(writes)
    },

    reset: async () => {
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
      await Promise.all([
        endSessionRun(
          { endedAt: new Date().toISOString(), completed: false },
          'abandon-reset'
        ),
        usePlayerStore.getState().resumeFromRest(),
      ])
    },

    tick: async (now = Date.now()) => {
      const { running, endsAt, phase, pomodorosDone } = get()
      if (!running || endsAt === null) return
      const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))
      if (remaining > 0) {
        set({ remainingSec: remaining })
        return
      }
      // Phase elapsed: stop on zero. A completed focus counts a pomodoro
      // and completes its row; a completed rest completes its row and
      // brings the sound back.
      set({
        running: false,
        endsAt: null,
        remainingSec: 0,
        pomodorosDone: phase === 'focus' ? pomodorosDone + 1 : pomodorosDone,
        openSessionId: null,
      })
      const writes: Promise<void>[] = [
        endSessionRun({ endedAt: new Date(now).toISOString(), completed: true }, 'complete'),
      ]
      if (phase === 'rest') {
        writes.push(usePlayerStore.getState().resumeFromRest())
      }
      await Promise.all(writes)
    },
  }
})

/** Label for the widget counter, e.g. "2 / 3" while the 2nd pomodoro runs. */
export function pomodoroCounterLabel(done: number, perBlock: number): string {
  return `${Math.min(done + 1, perBlock)} / ${perBlock}`
}
