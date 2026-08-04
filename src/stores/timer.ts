import { create } from 'zustand'

/** Defaults from the mockup: 25 min focus / 5 min rest, 3 pomodoros per block. */
export const FOCUS_SEC = 1500
export const REST_SEC = 300
export const POMODOROS_PER_BLOCK = 3

export type TimerPhase = 'focus' | 'rest'

/**
 * Pomodoro countdown for the right-rail widget (and later the session
 * overlay). The tick is computed from a wall-clock deadline (`endsAt`) rather
 * than by decrementing, so it does not drift when the window is minimised.
 *
 * Phase 9 adds session persistence and block attachment; this store is the
 * chrome-level countdown.
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
  start: () => void
  pause: () => void
  toggle: () => void
  rest: () => void
  reset: () => void
  /** Recompute remaining time from the wall clock. Called on an interval. */
  tick: (now?: number) => void
}

export const useTimerStore = create<TimerState>()((set, get) => ({
  phase: 'focus',
  totalSec: FOCUS_SEC,
  remainingSec: FOCUS_SEC,
  running: false,
  endsAt: null,
  pomodorosDone: 0,
  pomodorosPerBlock: POMODOROS_PER_BLOCK,

  start: () => {
    const { remainingSec, totalSec } = get()
    const remaining = remainingSec > 0 ? remainingSec : totalSec
    set({ running: true, remainingSec: remaining, endsAt: Date.now() + remaining * 1000 })
  },

  pause: () => {
    const { running, endsAt } = get()
    if (!running || endsAt === null) return
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    set({ running: false, endsAt: null, remainingSec: remaining })
  },

  toggle: () => {
    if (get().running) get().pause()
    else get().start()
  },

  rest: () => {
    set({
      phase: 'rest',
      totalSec: REST_SEC,
      remainingSec: REST_SEC,
      running: true,
      endsAt: Date.now() + REST_SEC * 1000,
    })
  },

  reset: () => {
    set({
      phase: 'focus',
      totalSec: FOCUS_SEC,
      remainingSec: FOCUS_SEC,
      running: false,
      endsAt: null,
      pomodorosDone: 0,
    })
  },

  tick: (now = Date.now()) => {
    const { running, endsAt, phase, pomodorosDone } = get()
    if (!running || endsAt === null) return
    const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))
    if (remaining > 0) {
      set({ remainingSec: remaining })
      return
    }
    // Phase elapsed: stop on zero. A completed focus counts a pomodoro.
    set({
      running: false,
      endsAt: null,
      remainingSec: 0,
      pomodorosDone: phase === 'focus' ? pomodorosDone + 1 : pomodorosDone,
    })
  },
}))

/** Label for the widget counter, e.g. "2 / 3" while the 2nd pomodoro runs. */
export function pomodoroCounterLabel(done: number, perBlock: number): string {
  return `${Math.min(done + 1, perBlock)} / ${perBlock}`
}
