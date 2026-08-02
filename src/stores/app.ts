import { create } from 'zustand'
import { DEFAULT_ACCENT, type AccentKey } from '../lib/accents'

export type View = 'today' | 'week' | 'templates' | 'archive' | 'library'
export type TimerStyle = 'ring' | 'numeric' | 'bar'
export type RepeatStyle = 'chip' | 'icon' | 'none'

/**
 * Cross-view chrome state: which view is showing, the three user settings
 * (accent, timer style, repeat-badge style), and whether the settings panel
 * or full-session overlay is up.
 *
 * Settings live in memory only until Phase 3 hydrates them from the SQLite
 * `setting` table.
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
}

export const useAppStore = create<AppState>()((set) => ({
  view: 'today',
  accent: DEFAULT_ACCENT,
  timerStyle: 'ring',
  repeatStyle: 'chip',
  settingsOpen: false,
  sessionOpen: false,
  setView: (view) => set({ view }),
  setAccent: (accent) => set({ accent }),
  setTimerStyle: (timerStyle) => set({ timerStyle }),
  setRepeatStyle: (repeatStyle) => set({ repeatStyle }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  enterSession: () => set({ sessionOpen: true }),
  exitSession: () => set({ sessionOpen: false }),
}))
