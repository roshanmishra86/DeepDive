import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import * as notesRepo from '../db/repos/notes'
import * as settingsRepo from '../db/repos/settings'
import { toDayKey } from '../lib/time'
import { useBlocksStore } from './blocks'
import { useRitualsStore } from './rituals'
import { useTimerStore } from './timer'

/**
 * The app's clock owner: the ONLY place `new Date()` drives state. Every
 * other store takes its day key and minute-of-day from a caller, which is
 * what keeps the UTC-day-key defect class closed.
 *
 * Shutdown lives here rather than in the blocks store because it is a
 * today-only, day-scoped concept (a `day_note.shutdown_min` override on top
 * of the global `shutdownMin` setting).
 */
interface DayState {
  currentDay: string
  nowMin: number
  /** Effective shutdown time for `currentDay` (null if none configured). */
  shutdownMin: number | null
  /**
   * true when shutdownMin came from the global 'shutdownMin' setting, false
   * when it came from a per-day override (day_note.shutdown_min).
   */
  shutdownIsDefault: boolean
  /** Last shutdown-persistence failure; cleared on the next successful save. */
  error: string | null
  hydrate: (driver: SqlDriver | null, day: string, nowMin: number) => Promise<void>
  setShutdown: (min: number, scope: 'day' | 'default') => Promise<void>
  /**
   * Recomputes `nowMin` and, when the day key changed, performs the midnight
   * rollover. `now` is a parameter (not read from the clock here) so tests
   * can drive it directly — `vi.useFakeTimers` is banned in this project
   * because it breaks RTL's async utilities.
   */
  tick: (now: Date) => void
  /** Installs the single 30s clock interval; returns a disposer. */
  start: () => () => void
  stop: () => void
}

/** One interval for the whole app — see start(). */
const TICK_MS = 30000
let intervalId: number | null = null
let persistenceDriver: SqlDriver | null = null

function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

/**
 * Per-day `day_note.shutdown_min` override, else the global `shutdownMin`
 * setting. Secondary to everything else the caller does, so a failure here
 * must never be fatal — it resolves to "no shutdown configured".
 */
async function resolveShutdown(
  driver: SqlDriver,
  day: string
): Promise<{ shutdownMin: number | null; shutdownIsDefault: boolean }> {
  try {
    const dayShutdown = await notesRepo.getDayShutdown(driver, day)
    if (dayShutdown !== null) return { shutdownMin: dayShutdown, shutdownIsDefault: false }
    const raw = await settingsRepo.getSetting(driver, 'shutdownMin')
    const parsed = raw !== null && raw.trim() !== '' ? Number(raw) : NaN
    if (!Number.isNaN(parsed)) return { shutdownMin: parsed, shutdownIsDefault: true }
  } catch (err) {
    console.error('Failed to hydrate shutdown time:', err)
  }
  return { shutdownMin: null, shutdownIsDefault: true }
}

const initialNow = new Date()

export const useDayStore = create<DayState>()((set, get) => ({
  currentDay: toDayKey(initialNow),
  nowMin: minuteOfDay(initialNow),
  shutdownMin: null,
  shutdownIsDefault: true,
  error: null,

  hydrate: async (driver, day, nowMin) => {
    persistenceDriver = driver
    set({ currentDay: day, nowMin, shutdownMin: null, shutdownIsDefault: true })
    if (!driver) return
    set(await resolveShutdown(driver, day))
  },

  setShutdown: async (min, scope) => {
    const state = get()
    const prev = { shutdownMin: state.shutdownMin, shutdownIsDefault: state.shutdownIsDefault }

    if (scope === 'day') {
      const day = state.currentDay
      set({ shutdownMin: min, shutdownIsDefault: false })
      if (persistenceDriver) {
        try {
          await notesRepo.setDayShutdown(persistenceDriver, day, min)
        } catch (err) {
          console.error('Failed to persist day shutdown time:', err)
          set({ ...prev, error: err instanceof Error ? err.message : 'Save failed' })
          return
        }
      }
    } else {
      set({ shutdownMin: min, shutdownIsDefault: true })
      if (persistenceDriver) {
        try {
          await settingsRepo.setSetting(persistenceDriver, 'shutdownMin', String(min))
        } catch (err) {
          console.error('Failed to persist default shutdown time:', err)
          set({ ...prev, error: err instanceof Error ? err.message : 'Save failed' })
          return
        }
      }
    }
  },

  tick: (now) => {
    const nowMin = minuteOfDay(now)
    const day = toDayKey(now)
    if (day === get().currentDay) {
      if (nowMin !== get().nowMin) set({ nowMin })
      return
    }
    // Publish the new day BEFORE the async rollover work, so every later tick
    // takes the branch above — the rollover fires exactly once per day change,
    // not on every subsequent tick.
    set({ currentDay: day, nowMin })
    void rollover(day, nowMin)
  },

  start: () => {
    if (intervalId === null) {
      intervalId = window.setInterval(() => useDayStore.getState().tick(new Date()), TICK_MS)
    }
    return () => useDayStore.getState().stop()
  },

  stop: () => {
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  },
}))

/**
 * Midnight rollover. Today, rituals, the sidebar and the timer must all move
 * to the new day without an app restart, in this order:
 *  1. `currentDay` — already published by tick() above.
 *  2. the new day's blocks.
 *  3. rituals, which are day-scoped (`ritual_log` rows are per day).
 *  4. the sidebar's deep-hours card, which re-reads whenever `currentDay`
 *     changes (its effect is keyed on it) — nothing to call here.
 *  5. the timer's block attachment, re-derived from the new day's rows.
 * Never rejects: each step logs and moves on.
 */
async function rollover(day: string, nowMin: number): Promise<void> {
  try {
    await useBlocksStore.getState().ensureDays([day])
  } catch (err) {
    console.error('Failed to load blocks after midnight rollover:', err)
  }
  try {
    await useRitualsStore.getState().hydrate(persistenceDriver, day)
  } catch (err) {
    console.error('Failed to reload rituals after midnight rollover:', err)
  }
  // The shutdown override is per-day, so yesterday's must not carry over.
  if (persistenceDriver) {
    useDayStore.setState(await resolveShutdown(persistenceDriver, day))
  } else {
    useDayStore.setState({ shutdownMin: null, shutdownIsDefault: true })
  }
  try {
    // Re-derives the attachment from the NEW day's rows. A no-op while a
    // cycle is running or already attached (see timer.hydrate's guards), so
    // rollover can never yank a session out from under the user.
    await useTimerStore.getState().hydrate(persistenceDriver, day, nowMin)
  } catch (err) {
    console.error('Failed to re-evaluate timer attachment after midnight rollover:', err)
  }
}
