import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import { ACCENTS, DEFAULT_ACCENT, type AccentKey } from '../lib/accents'
import * as settingsRepo from '../db/repos/settings'

export type View = 'today' | 'week' | 'templates' | 'archive' | 'library'
export type TimerStyle = 'ring' | 'numeric' | 'bar'
export type RepeatStyle = 'chip' | 'icon' | 'none'

// Module-level driver reference for persistence callbacks
let persistenceDriver: SqlDriver | null = null

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
  settingsOpen: boolean
  sessionOpen: boolean
  setView: (view: View) => void
  setAccent: (accent: AccentKey) => void
  setTimerStyle: (style: TimerStyle) => void
  setRepeatStyle: (style: RepeatStyle) => void
  openSettings: () => void
  closeSettings: () => void
  enterSession: () => void
  exitSession: () => void
  hydrate: (driver: SqlDriver | null) => Promise<void>
}

export const useAppStore = create<AppState>()((set) => ({
  view: 'today',
  accent: DEFAULT_ACCENT,
  timerStyle: 'ring',
  repeatStyle: 'chip',
  settingsOpen: false,
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
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
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

      set({
        accent: validAccent,
        timerStyle: validTimerStyle,
        repeatStyle: validRepeatStyle,
      })
    } catch (err) {
      console.error('Failed to hydrate app store:', err)
    }
  },
}))
