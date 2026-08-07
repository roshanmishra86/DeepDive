import { useArchiveStore } from '../../stores/archive'
import { histogramBars } from '../../lib/archive'

export function DeepHoursHistogram() {
  const trend = useArchiveStore((s) => s.trend)

  const bars = histogramBars(trend)

  // Footer: show the first month of the 12-week range and "this week"
  let footerFirst = ''
  let footerLast = ''

  if (bars.length > 0) {
    const [year, month, day] = bars[0].weekStart.split('-').map(Number)
    const firstWeek = new Date(year, month - 1, day)
    footerFirst = firstWeek.toLocaleDateString('en-US', { month: 'short' })

    const lastBar = bars[bars.length - 1]
    footerLast = `this week · ${lastBar.hours.toFixed(1)} h`
  }

  return (
    <div className="arc-card" style={{ marginTop: '10px' }}>
      <div className="arc-histogram-title">Deep hours, last 12 weeks</div>

      <div className="arc-histogram-bars">
        {bars.map((bar, i) => {
          const tierClass = `arc-bar-tier-${bar.tier}`
          return (
            <div key={i} className="arc-bar-container">
              <div
                className={`arc-bar ${tierClass}`}
                style={{ height: `${bar.heightPct}%` }}
              />
            </div>
          )
        })}
      </div>

      <div className="arc-histogram-footer">
        <span>{footerFirst}</span>
        <span>{footerLast}</span>
      </div>
    </div>
  )
}
