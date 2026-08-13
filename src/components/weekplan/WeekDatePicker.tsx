import { addDays, MONTHS, toDayKey } from '../../lib/time'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/**
 * `11 – 17 AUGUST` for a week inside one month, or `28 JULY – 3 AUGUST`
 * when the week spans two months.
 */
function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6)
  const startDay = monday.getDate()
  const endDay = sunday.getDate()
  const startMonth = MONTHS[monday.getMonth()].toUpperCase()
  const endMonth = MONTHS[sunday.getMonth()].toUpperCase()

  if (startMonth === endMonth) {
    return `${startDay} – ${endDay} ${endMonth}`
  }
  return `${startDay} ${startMonth} – ${endDay} ${endMonth}`
}

interface WeekDatePickerProps {
  anchorMonday: Date
  todayKey: string
  onPrev: () => void
  onNext: () => void
}

export function WeekDatePicker({ anchorMonday, todayKey, onPrev, onNext }: WeekDatePickerProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(anchorMonday, i))

  return (
    <div className="week-date-picker">
      <div className="week-date-range">
        <button type="button" className="week-nav-btn" onClick={onPrev} aria-label="Previous week">
          <CaretLeft size={12} weight="bold" />
        </button>
        <span className="week-date-range-label">{formatWeekRange(anchorMonday)}</span>
        <button type="button" className="week-nav-btn" onClick={onNext} aria-label="Next week">
          <CaretRight size={12} weight="bold" />
        </button>
      </div>

      <div className="week-date-pills">
        {days.map((d, i) => {
          const key = toDayKey(d)
          const isToday = key === todayKey
          return (
            <div key={key} className={`week-date-pill${isToday ? ' week-date-pill-today' : ''}`} aria-current={isToday ? 'date' : undefined}>
              <span className="week-date-pill-weekday">{WEEKDAY_LABELS[i]}</span>
              <span className="week-date-pill-day">{d.getDate()}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
