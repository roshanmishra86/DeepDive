import { useEffect } from 'react'
import { useAppStore } from './stores/app'
import { useRitualsStore } from './stores/rituals'
import { useTasksStore } from './stores/tasks'
import { useTodayStore } from './stores/today'
import { useTemplatesStore } from './stores/templates'
import { useTimerStore } from './stores/timer'
import { useLibraryStore } from './stores/library'
import { usePlayerStore } from './stores/player'
import { openDatabase } from './db/index'
import { applyAccent } from './lib/accents'
import { toDayKey } from './lib/time'
import { activeWorkBlock } from './lib/timer'
import { spaceTogglesTimer, escapeExitsSession } from './lib/shortcuts'
import { TitleBar } from './components/chrome/TitleBar'
import { Sidebar } from './components/chrome/Sidebar'
import { RightRail } from './components/chrome/RightRail'
import { MusicBar } from './components/chrome/MusicBar'
import { SettingsPanel } from './components/chrome/SettingsPanel'
import { SessionOverlay } from './components/chrome/SessionOverlay'
import { TodayView } from './components/views/TodayView'
import { WeekView } from './components/views/WeekView'
import { TemplatesView } from './components/views/TemplatesView'
import { ArchiveView } from './components/views/ArchiveView'
import { LibraryView } from './components/views/LibraryView'

const VIEWS = {
  today: TodayView,
  week: WeekView,
  templates: TemplatesView,
  archive: ArchiveView,
  library: LibraryView,
} as const

/**
 * Owns the app's single global keydown listener. Space toggles the pomodoro
 * timer (suppressed on interactive targets, held-key repeats, modifier
 * chords, and while any `[role="dialog"]` modal is open); Escape exits the
 * full-session overlay (suppressed while a dialog is open, since dialogs
 * handle their own Escape). All branch logic lives in the pure, node-tested
 * predicates in `lib/shortcuts.ts`; this hook only extracts the structs from
 * the real event and dispatches.
 */
function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const target =
        el && typeof el.tagName === 'string'
          ? { tagName: el.tagName, isContentEditable: el.isContentEditable }
          : null
      const dialogOpen = document.querySelector('[role="dialog"]') !== null

      if (
        spaceTogglesTimer(
          {
            key: e.key,
            repeat: e.repeat,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            altKey: e.altKey,
          },
          target,
          dialogOpen
        )
      ) {
        e.preventDefault()
        const now = new Date()
        const nowMin = now.getHours() * 60 + now.getMinutes()
        const candidate = activeWorkBlock(useTodayStore.getState().blocks, nowMin)
        void useTimerStore.getState().toggle(candidate)
        return
      }

      if (e.key === 'Escape' && escapeExitsSession(dialogOpen, useAppStore.getState().sessionOpen)) {
        useAppStore.getState().exitSession()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

function App() {
  const view = useAppStore((s) => s.view)
  const accent = useAppStore((s) => s.accent)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const sessionOpen = useAppStore((s) => s.sessionOpen)

  // On mount, open the database and hydrate stores. Render normally while
  // it resolves; failures are logged but non-fatal.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        const hydrationDay = toDayKey(new Date())
        await Promise.all([
          useAppStore.getState().hydrate(driver),
          useRitualsStore.getState().hydrate(driver, hydrationDay),
          useTasksStore.getState().hydrate(driver),
          useTodayStore.getState().hydrate(driver, hydrationDay),
          useTemplatesStore.getState().hydrate(driver),
          useLibraryStore.getState().hydrate(driver),
          usePlayerStore.getState().hydrate(driver),
          useTimerStore.getState().hydrate(driver),
        ])
      } catch (err) {
        console.error('Failed to initialize database:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Reflect the chosen accent into the CSS custom properties.
  useEffect(() => {
    applyAccent(accent, document.documentElement)
  }, [accent])

  // Wall-clock timer tick. The store recomputes from `endsAt`, so a
  // suspended/minimised window catches up instead of drifting.
  useEffect(() => {
    const id = window.setInterval(() => useTimerStore.getState().tick(), 500)
    return () => window.clearInterval(id)
  }, [])

  useGlobalShortcuts()

  const ActiveView = VIEWS[view]

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-middle">
        <Sidebar />
        <main className="app-main">
          <ActiveView />
        </main>
        <RightRail />
      </div>
      <MusicBar />
      {settingsOpen && <SettingsPanel />}
      {sessionOpen && <SessionOverlay />}
    </div>
  )
}

export default App
