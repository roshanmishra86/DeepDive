import { useArchiveStore } from '../../stores/archive'
import { monthLabel, monthGrid } from '../../lib/archive'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

export function MonthCalendar() {
  const year = useArchiveStore((s) => s.year)
  const month0 = useArchiveStore((s) => s.month0)
  const statuses = useArchiveStore((s) => s.statuses)
  const selectedDay = useArchiveStore((s) => s.selectedDay)
  const prevMonth = useArchiveStore((s) => s.prevMonth)
  const nextMonth = useArchiveStore((s) => s.nextMonth)
  const selectDay = useArchiveStore((s) => s.selectDay)

  const cells = monthGrid(year, month0)
  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const dotColor = (day: string): string => {
    const status = statuses[day]
    if (status === 'full') return 'var(--accent)'
    if (status === 'part') return 'var(--warn)'
    if (status === 'miss') return 'var(--border-strong)'
    if (status === 'note') return 'var(--text-faint)'
    return 'transparent'
  }

  const handlePrev = async () => {
    await prevMonth()
  }

  const handleNext = async () => {
    await nextMonth()
  }

  return (
    <div className="arc-card">
      <div className="arc-calendar-header">
        <button
          className="arc-nav-btn"
          onClick={handlePrev}
          aria-label={`Go to previous month`}
          type="button"
        >
          <CaretLeft size={12} weight="bold" />
        </button>
        <span className="arc-month-label">{monthLabel(year, month0)}</span>
        <button
          className="arc-nav-btn"
          onClick={handleNext}
          aria-label={`Go to next month`}
          type="button"
        >
          <CaretRight size={12} weight="bold" />
        </button>
      </div>

      <div className="arc-calendar-grid">
        {weekdayLabels.map((label, i) => (
          <div key={i} className="arc-weekday-label">
            {label}
          </div>
        ))}

        {cells.map((cell, i) => {
          const isOutside = !cell.inMonth
          const isSelected = selectedDay === cell.day
          let classString = 'arc-calendar-day'
          if (isOutside) classString += ' arc-outside-month'
          if (isSelected) classString += ' arc-selected'

          const getAriaLabel = (): string => {
            if (isOutside) return ''
            const dateStr = new Date(year, month0, cell.dayOfMonth).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })
            const status = statuses[cell.day]
            if (!status) return `${dateStr} — No record`
            const statusStr =
              status === 'full'
                ? 'All blocks done'
                : status === 'part'
                  ? 'Partial'
                  : status === 'note'
                    ? 'Note only, no blocks planned'
                    : 'Planned, missed'
            return `${dateStr} — ${statusStr}`
          }

          return (
            <button
              key={i}
              className={classString}
              onClick={() => {
                if (cell.inMonth && statuses[cell.day]) {
                  void selectDay(cell.day)
                }
              }}
              disabled={isOutside || !statuses[cell.day]}
              aria-label={getAriaLabel()}
              aria-pressed={isSelected}
            >
              <span className="arc-day-number">{cell.dayOfMonth}</span>
              <span
                className="arc-day-dot"
                style={{
                  backgroundColor: dotColor(cell.day),
                }}
              />
            </button>
          )
        })}
      </div>

      <div className="arc-calendar-legend">
        <div className="arc-legend-item">
          <span className="arc-legend-dot" style={{ backgroundColor: 'var(--accent)' }} />
          <span>All blocks done</span>
        </div>
        <div className="arc-legend-item">
          <span className="arc-legend-dot" style={{ backgroundColor: 'var(--warn)' }} />
          <span>Partial</span>
        </div>
        <div className="arc-legend-item">
          <span className="arc-legend-dot" style={{ backgroundColor: 'var(--border-strong)' }} />
          <span>Planned, missed</span>
        </div>
        <div className="arc-legend-item">
          <span className="arc-legend-dot" style={{ backgroundColor: 'var(--text-faint)' }} />
          <span>Note only</span>
        </div>
      </div>
    </div>
  )
}
