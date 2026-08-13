import type { KindAllocation } from '../../lib/weekPlan'
import type { BlockKind } from '../../db/types'

/**
 * Inline SVG donut for weekly time allocation by BlockKind. There is no
 * chart library in this project (see DeepHoursHistogram for the precedent);
 * this is hand-rolled from stroke-dasharray arcs on stacked circles.
 *
 * Legend reads exactly Deep Work / Shallow Work / Rituals / Breaks — the
 * schema's four BlockKind values, in that fixed order. There is no
 * "Meetings" kind, so the mock's label is dropped rather than faked.
 *
 * Colors reuse existing semantic tokens as arbitrary category colors, the
 * same convention lib/todo.ts's QUADRANTS/PRIORITIES already use (e.g.
 * `--danger` colors the "do" quadrant dot, not an error). No hex literals.
 */
const KIND_LABELS: Record<BlockKind, string> = {
  deep: 'Deep Work',
  shallow: 'Shallow Work',
  ritual: 'Rituals',
  break: 'Breaks',
}

const KIND_COLORS: Record<BlockKind, string> = {
  deep: 'var(--accent)',
  shallow: 'var(--warn)',
  ritual: 'var(--danger)',
  break: 'var(--border-strong)',
}

const RADIUS = 34
const STROKE = 12
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface WeekAllocationDonutProps {
  allocation: KindAllocation[]
}

export function WeekAllocationDonut({ allocation }: WeekAllocationDonutProps) {
  const totalMinutes = allocation.reduce((sum, a) => sum + a.minutes, 0)

  // Cumulative offset in "percent of circumference", built up as we walk the
  // segments so each arc starts where the previous one ended.
  let cumulativePercent = 0

  return (
    <div className="week-donut-row">
      <svg
        className="week-donut"
        width="96"
        height="96"
        viewBox="0 0 96 96"
        role="img"
        aria-label="Time allocation by kind"
      >
        <circle
          cx="48"
          cy="48"
          r={RADIUS}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={STROKE}
        />
        {totalMinutes > 0 &&
          allocation
            .filter((a) => a.percent > 0)
            .map((a) => {
              const dash = (a.percent / 100) * CIRCUMFERENCE
              const offset = -((cumulativePercent / 100) * CIRCUMFERENCE)
              cumulativePercent += a.percent
              return (
                <circle
                  key={a.kind}
                  cx="48"
                  cy="48"
                  r={RADIUS}
                  fill="none"
                  stroke={KIND_COLORS[a.kind]}
                  strokeWidth={STROKE}
                  strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                  strokeDashoffset={offset}
                  transform="rotate(-90 48 48)"
                />
              )
            })}
      </svg>

      <ul className="week-donut-legend">
        {allocation.map((a) => (
          <li key={a.kind} className="week-donut-legend-item">
            <span className="week-donut-legend-dot" style={{ backgroundColor: KIND_COLORS[a.kind] }} />
            <span className="week-donut-legend-label">{KIND_LABELS[a.kind]}</span>
            <span className="week-donut-legend-value">
              {(a.minutes / 60).toFixed(1)} h ({a.percent}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
