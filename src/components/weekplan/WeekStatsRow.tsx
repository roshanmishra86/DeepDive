import type { WeekStats } from '../../lib/weekPlan'

/**
 * `1 h 05 m` — zero-padded minutes, unlike lib/time's `formatDuration`
 * ("1 h 5 m"). Kept local to this component rather than touching
 * src/lib/time.ts, which is out of scope for this phase.
 */
function formatAverageBlock(min: number): string {
  const hours = Math.floor(min / 60)
  const minutes = Math.round(min % 60)
  if (hours === 0) return `${minutes} m`
  return `${hours} h ${String(minutes).padStart(2, '0')} m`
}

function formatGoalHours(weeklyGoalMin: number): string {
  const hours = weeklyGoalMin / 60
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`
}

interface WeekStatsRowProps {
  stats: WeekStats
  weeklyGoalMin: number
}

export function WeekStatsRow({ stats, weeklyGoalMin }: WeekStatsRowProps) {
  return (
    <div className="week-stats-row">
      <div className="week-stat-card">
        {/* Distinct label from the sidebar's "Deep hours" card (completed-only,
            historical) — this one counts all PLANNED deep minutes for the
            week, so the two numbers must never read as the same metric. */}
        <span className="week-stat-label">Focus hours — planned</span>
        <span className="week-stat-value">{stats.focusHours.toFixed(1)} h</span>
        <span className="week-stat-sub">of {formatGoalHours(weeklyGoalMin)} goal</span>
      </div>

      <div className="week-stat-card">
        <span className="week-stat-label">Tasks scheduled</span>
        <span className="week-stat-value">{stats.blocksScheduled}</span>
        <span className="week-stat-sub">blocks</span>
      </div>

      <div className="week-stat-card">
        <span className="week-stat-label">Completion estimate</span>
        <span className="week-stat-value">
          {stats.completionEstimate === null ? '—' : `${stats.completionEstimate}%`}
        </span>
        <span className="week-stat-sub">based on time</span>
      </div>

      <div className="week-stat-card">
        <span className="week-stat-label">Average block</span>
        <span className="week-stat-value">{formatAverageBlock(stats.averageBlockMin)}</span>
        <span className="week-stat-sub">average duration</span>
      </div>
    </div>
  )
}
