import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import { ACCENTS, DEFAULT_ACCENT, type AccentKey } from '../lib/accents'
import * as settingsRepo from '../db/repos/settings'

// 'todo' is the Eisenhower backlog (formerly the 'week' view); 'week' is the
// Mon–Sun calendar of real time blocks.
export type View = 'today' | 'todo' | 'week' | 'templates' | 'archive' | 'library'
export type TimerStyle = 'ring' | 'numeric' | 'bar'
export type RepeatStyle = 'chip' | 'icon' | 'none'
export type PlanTarget =
  | { kind: 'task'; id: number }
  | { kind: 'block'; id: number }
  | null

// 20 h of planned deep work per week — matches migration 0006's seeded value.
export const DEFAULT_WEEKLY_GOAL_MIN = 1200

// Module-level driver reference for persistence callbacks
let persistenceDriver: SqlDriver | null = null
let planFlush: (() => Promise<boolean>) | null = null
let planSwitchRevision = 0

export function registerPlanFlush(flush: (() => Promise<boolean>) | null): () => void {
  planFlush = flush
  return () => {
    if (planFlush === flush) planFlush = null
  }
}

/**
 * Cross-view chrome state: which view is showing, the three user settings
 * (accent, timer style, repeat-badge style), and whether the settings panel
 * or full-session overlay is up.
 *
 * Hydrate from the database on app mount; setters update both state and persist
 * to the `setting` table via fire-and-forget writes (state updates immediately
 * so the UI stays responsive).
 */
interface AppState {
  view: View
  accent: AccentKey
  timerStyle: TimerStyle
  repeatStyle: RepeatStyle
  weeklyGoalMin: number
  settingsOpen: boolean
  planTarget: PlanTarget
  sessionOpen: boolean
  setView: (view: View) => void
  setAccent: (accent: AccentKey) => void
  setTimerStyle: (style: TimerStyle) => void
  setRepeatStyle: (style: RepeatStyle) => void
  setWeeklyGoalMin: (minutes: number) => void
  openSettings: () => void
  closeSettings: () => void
  openPlan: (target: Exclude<PlanTarget, null>) => void
  closePlan: () => void
  setPlanTarget: (target: Exclude<PlanTarget, null>) => void
  enterSession: () => void
  exitSession: () => void
  hydrate: (driver: SqlDriver | null) => Promise<void>
}

export const useAppStore = create<AppState>()((set) => ({
  view: 'today',
  accent: DEFAULT_ACCENT,
  timerStyle: 'ring',
  repeatStyle: 'chip',
  weeklyGoalMin: DEFAULT_WEEKLY_GOAL_MIN,
  settingsOpen: false,
  planTarget: null,
  sessionOpen: false,
  setView: (view) => set({ view }),
  setAccent: (accent) => {
    set({ accent })
    // Fire-and-forget persistence
    if (persistenceDriver) {
      settingsRepo.setSetting(persistenceDriver, 'accent', accent).catch((err) =>
        console.error('Failed to persist accent:', err)
      )
    }
  },
  setTimerStyle: (timerStyle) => {
    set({ timerStyle })
    // Fire-and-forget persistence
    if (persistenceDriver) {
      settingsRepo.setSetting(persistenceDriver, 'timerStyle', timerStyle).catch((err) =>
        console.error('Failed to persist timerStyle:', err)
      )
    }
  },
  setRepeatStyle: (repeatStyle) => {
    set({ repeatStyle })
    // Fire-and-forget persistence
    if (persistenceDriver) {
      settingsRepo.setSetting(persistenceDriver, 'repeatStyle', repeatStyle).catch((err) =>
        console.error('Failed to persist repeatStyle:', err)
      )
    }
  },
  setWeeklyGoalMin: (weeklyGoalMin) => {
    set({ weeklyGoalMin })
    // Fire-and-forget persistence
    if (persistenceDriver) {
      settingsRepo.setSetting(persistenceDriver, 'weeklyGoalMin', String(weeklyGoalMin)).catch((err) =>
        console.error('Failed to persist weeklyGoalMin:', err)
      )
    }
  },
  openSettings: () => {
    const switchRevision = ++planSwitchRevision
    if (!planFlush) {
      set({ settingsOpen: true, planTarget: null })
      return
    }
    void planFlush().then((ok) => {
      if (ok && switchRevision === planSwitchRevision) set({ settingsOpen: true, planTarget: null })
    })
  },
  closeSettings: () => set({ settingsOpen: false }),
  openPlan: (planTarget) => {
    const switchRevision = ++planSwitchRevision
    if (!planFlush) {
      set({ planTarget, settingsOpen: false })
      return
    }
    void planFlush().then((ok) => {
      if (ok && switchRevision === planSwitchRevision) set({ planTarget, settingsOpen: false })
    })
  },
  closePlan: () => set({ planTarget: null }),
  setPlanTarget: (planTarget) => set({ planTarget, settingsOpen: false }),
  enterSession: () => set({ sessionOpen: true }),
  exitSession: () => set({ sessionOpen: false }),
  hydrate: async (driver) => {
    persistenceDriver = driver
    if (!driver) return

    try {
      const settings = await settingsRepo.getAllSettings(driver)

      // Validate and apply accent
      const accentValue = settings.accent
      const validAccent = accentValue && accentValue in ACCENTS ? (accentValue as AccentKey) : DEFAULT_ACCENT

      // Validate and apply timerStyle
      const timerStyleValue = settings.timerStyle
      const validTimerStyle =
        timerStyleValue && ['ring', 'numeric', 'bar'].includes(timerStyleValue)
          ? (timerStyleValue as TimerStyle)
          : 'ring'

      // Validate and apply repeatStyle
      const repeatStyleValue = settings.repeatStyle
      const validRepeatStyle =
        repeatStyleValue && ['chip', 'icon', 'none'].includes(repeatStyleValue)
          ? (repeatStyleValue as RepeatStyle)
          : 'chip'

      // Validate and apply weeklyGoalMin — a corrupt or absent row falls back
      // to the default rather than putting NaN in front of a progress bar.
      const weeklyGoalValue = Number(settings.weeklyGoalMin)
      const validWeeklyGoalMin =
        Number.isFinite(weeklyGoalValue) && weeklyGoalValue > 0
          ? Math.round(weeklyGoalValue)
          : DEFAULT_WEEKLY_GOAL_MIN

      set({
        accent: validAccent,
        timerStyle: validTimerStyle,
        repeatStyle: validRepeatStyle,
        weeklyGoalMin: validWeeklyGoalMin,
      })
    } catch (err) {
      console.error('Failed to hydrate app store:', err)
    }
  },
}))
