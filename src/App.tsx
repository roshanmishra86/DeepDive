import { useEffect } from 'react'
import { useAppStore } from './stores/app'
import { useRitualsStore } from './stores/rituals'
import { useTimerStore } from './stores/timer'
import { openDatabase } from './db/index'
import { applyAccent } from './lib/accents'
import { toDayKey } from './lib/time'
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
