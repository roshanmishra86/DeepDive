import { useEffect } from 'react'
import { useArchiveStore } from '../../stores/archive'
import { openDatabase } from '../../db/index'
import { toDayKey } from '../../lib/time'
import { MonthCalendar } from '../archive/MonthCalendar'
import { DeepHoursHistogram } from '../archive/DeepHoursHistogram'
import { DayRecordPane } from '../archive/DayRecordPane'

export function ArchiveView() {
  const hydrate = useArchiveStore((s) => s.hydrate)
  const loading = useArchiveStore((s) => s.loading)
  const error = useArchiveStore((s) => s.error)
  const headline = useArchiveStore((s) => s.headline)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        const today = toDayKey(new Date())
        await hydrate(driver, today)
      } catch (err) {
        console.error('Failed to hydrate archive view:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate])

  // Gate on "never hydrated", not the shared loading flag: setMonth also
  // sets loading on every prev/next click, and unmounting the whole view
  // (nav buttons included) for one local SQLite read flashes
  // "Loading archive…" mid-navigation. Month changes update in place.
  if (loading && headline === null) {
    return (
      <div className="arc-view">
        <div className="arc-header">
          <div>
            <div className="arc-title">Archive</div>
            <div className="arc-subtitle">
              Every day you planned blocks. A dot means the day has a record — open it to see what actually landed.
            </div>
          </div>
        </div>
        <div className="arc-body">
          <div className="view-empty">
            <div className="view-empty-title">Loading archive…</div>
          </div>
        </div>
      </div>
    )
  }

  // Same error contract as the sibling views (TodayView, WeekView): without
  // this branch a failed hydrate/setMonth rendered as an empty archive,
  // indistinguishable from a genuinely empty one.
  if (error) {
    return (
      <div className="arc-view">
        <div className="arc-header">
          <div>
            <div className="arc-title">Archive</div>
            <div className="arc-subtitle">
              Every day you planned blocks. A dot means the day has a record — open it to see what actually landed.
            </div>
          </div>
        </div>
        <div className="arc-body">
          <div className="view-empty">
            <div className="view-empty-title" style={{ color: 'var(--danger)' }}>
              Error: {error}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="arc-view">
      <div className="arc-header">
        <div>
          <div className="arc-title">Archive</div>
          <div className="arc-subtitle">
            Every day you planned blocks. A dot means the day has a record — open it to see what actually landed.
          </div>
        </div>

        {headline && (
          <div className="arc-headline">
            <div className="arc-stat">
              <div className="arc-stat-value">{headline.blocksDone}</div>
              <div className="arc-stat-label">Blocks done</div>
            </div>
            <div className="arc-stat">
              <div className="arc-stat-value">
                {headline.completionPct}
                <span className="arc-stat-pct">%</span>
              </div>
              <div className="arc-stat-label">Completion</div>
            </div>
            <div className="arc-stat">
              <div className="arc-stat-value">{headline.dayStreak}</div>
              <div className="arc-stat-label">Day streak</div>
            </div>
          </div>
        )}
      </div>

      <div className="arc-body">
        <div className="arc-left-column">
          <MonthCalendar />
          <DeepHoursHistogram />
        </div>

        <DayRecordPane />
      </div>
    </div>
  )
}
