import { useEffect, useState } from 'react'
import { useAppStore } from './stores/app'
import { useRitualsStore } from './stores/rituals'
import { useTasksStore } from './stores/tasks'
import { useBlocksStore } from './stores/blocks'
import { useDayStore } from './stores/day'
import { useTemplatesStore } from './stores/templates'
import { useTimerStore } from './stores/timer'
import { useLibraryStore } from './stores/library'
import { usePlayerStore } from './stores/player'
import { openDatabase } from './db/index'
import { messageFor } from './lib/errors'
import { applyAccent } from './lib/accents'
import { activeWorkBlock } from './lib/timer'
import { spaceTogglesTimer, escapeExitsSession } from './lib/shortcuts'
import { TitleBar } from './components/chrome/TitleBar'
import { Sidebar } from './components/chrome/Sidebar'
import { RightRail, RailToggleStrip } from './components/chrome/RightRail'
import { initialRailCollapsed, nextRailCollapsed, RAIL_BREAKPOINT } from './lib/railBreakpoint'
import { PlanPanel } from './components/plan/PlanPanel'
import { MusicBar } from './components/chrome/MusicBar'
import { SettingsPanel } from './components/chrome/SettingsPanel'
import { SessionOverlay } from './components/chrome/SessionOverlay'
import { TodayView } from './components/views/TodayView'
import { TodoView } from './components/views/TodoView'
import { WeekPlanView } from './components/views/WeekPlanView'
import { TemplatesView } from './components/views/TemplatesView'
import { ArchiveView } from './components/views/ArchiveView'
import { LibraryView } from './components/views/LibraryView'

const VIEWS = {
  today: TodayView,
  todo: TodoView,
  week: WeekPlanView,
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
        // Event handler, not a render path: both stores are read via
        // getState() so this listener never has to re-subscribe.
        const day = useDayStore.getState().currentDay
        const candidate = activeWorkBlock(useBlocksStore.getState().blocksByDay[day] ?? [], nowMin)
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
  const planTarget = useAppStore((s) => s.planTarget)
  const railCollapsed = useAppStore((s) => s.railCollapsed)
  const timerRunning = useTimerStore((s) => s.running)
  const [initError, setInitError] = useState<string | null>(null)

  // On mount, open the database and hydrate stores. Render normally while
  // it resolves.
  //
  // A failure here is NOT cosmetic and must never be console-only. This is
  // the app's single hydrate for the library, player, timer, rituals and day
  // stores — the views that open the database themselves (Today, Todo,
  // Templates, Archive) silently paper over it, so a swallowed failure looks
  // exactly like "the sound library shipped empty". It is also the call that
  // runs the SQL migrations, so it is where a failed/blocked migration
  // announces itself; anything opening the database after it connects to an
  // un-migrated schema and fails later in confusing ways. Surface the real
  // message.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        // The day store owns the clock; every other store takes the day key
        // and minute-of-day from it.
        const { currentDay: hydrationDay, nowMin } = useDayStore.getState()
        await Promise.all([
          useDayStore.getState().hydrate(driver, hydrationDay, nowMin),
          useAppStore.getState().hydrate(driver),
          useRitualsStore.getState().hydrate(driver, hydrationDay),
          useTasksStore.getState().hydrate(driver),
          useBlocksStore.getState().hydrate(driver, [hydrationDay]),
          useTemplatesStore.getState().hydrate(driver),
          useLibraryStore.getState().hydrate(driver),
          usePlayerStore.getState().hydrate(driver),
          // day + nowMin let the timer restore the active block's pomodoro
          // progress after a relaunch (Phase 11 P1-3).
          useTimerStore.getState().hydrate(driver, hydrationDay, nowMin),
        ])
        if (!mounted) return
        // Sync the rail's collapsed state from the actual window width now
        // that the persisted value has hydrated (Phase 9 gap fix). A narrow
        // window always starts collapsed; a wide window keeps whatever was
        // persisted. Must run after hydrate resolves, or this would just be
        // overwritten by useAppStore.hydrate's persisted value.
        useAppStore.getState().setRailCollapsed(
          initialRailCollapsed({
            width: window.innerWidth,
            persisted: useAppStore.getState().railCollapsed,
          })
        )
      } catch (err) {
        console.error('Failed to initialize database:', err)
        if (mounted) setInitError(messageFor(err, 'Failed to initialize the database.'))
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

  // The idle rail stays compact so the day plan is the primary surface. As
  // soon as a focus cycle begins, reveal the timer automatically; an active
  // session should never be hidden behind a secondary control.
  useEffect(() => {
    if (timerRunning && useAppStore.getState().railCollapsed) {
      useAppStore.getState().setRailCollapsed(false)
    }
  }, [timerRunning])

  // The single app-wide 30s clock: recomputes nowMin and rolls Today,
  // rituals, the sidebar and the timer over at midnight.
  useEffect(() => useDayStore.getState().start(), [])

  // Wall-clock timer tick. The store recomputes from `endsAt`, so a
  // suspended/minimised window catches up instead of drifting.
  useEffect(() => {
    const id = window.setInterval(() => useTimerStore.getState().tick(), 500)
    return () => window.clearInterval(id)
  }, [])

  useGlobalShortcuts()

  // Single shell-owned resize listener for the right rail's collapse
  // breakpoint (1320px). Uses matchMedia so it only fires on an actual
  // crossing, not on every resize pixel. `nextRailCollapsed` is the pure,
  // unit-tested decision: null means no crossing, so an explicit user
  // toggle (setRailCollapsed) is left untouched until the next one.
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${RAIL_BREAKPOINT}px)`)
    let previousWidth = window.innerWidth
    const handleChange = () => {
      const width = window.innerWidth
      const decision = nextRailCollapsed({
        width,
        previousWidth,
        current: useAppStore.getState().railCollapsed,
      })
      previousWidth = width
      if (decision !== null) useAppStore.getState().setRailCollapsed(decision)
    }
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  const ActiveView = VIEWS[view]

  return (
    <div className="app-shell">
      <TitleBar />
      {initError && (
        <div className="app-init-error" role="alert">
          <strong>Database unavailable.</strong> Your tasks, sounds and timer history are not
          loaded and nothing you change will be saved. {initError}
        </div>
      )}
      <div className="app-middle">
        <Sidebar />
        <main className="app-main">
          <ActiveView />
        </main>
        {planTarget ? (
          <PlanPanel />
        ) : railCollapsed ? (
          <RailToggleStrip onExpand={() => useAppStore.getState().setRailCollapsed(false)} />
        ) : (
          <RightRail onCollapse={() => useAppStore.getState().setRailCollapsed(true)} />
        )}
      </div>
      <MusicBar />
      {settingsOpen && <SettingsPanel />}
      {sessionOpen && <SessionOverlay />}
    </div>
  )
}

export default App
