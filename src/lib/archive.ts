/**
 * Pure functions for Archive view — calendar calculations, date formatting,
 * and histogram rendering. All testable without DOM or React.
 */

import { MONTHS, toDayKey, fromDayKey, addDays, formatTitleDate, splitDeepHours } from './time'

/**
 * Adds n months to a Date, clamping to the last valid day of the target month
 * if the source month has more days than the target. E.g., Jan 31 + 1 month = Feb 28,
 * not Mar 3.
 */
export function addMonths(d: Date, n: number): Date {
  const result = new Date(d)
  const startMonth = result.getMonth()
  const startYear = result.getFullYear()

  // Calculate target month and year
  const totalMonths = startYear * 12 + startMonth + n
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = totalMonths % 12

  // Set year and month
  result.setFullYear(targetYear, targetMonth)

  // Check if we overshot (e.g., Jan 31 → Mar 3 when aiming for Feb 28)
  if (result.getMonth() !== targetMonth) {
    // We overshot — set to the last day of the target month (day 0 of next month)
    result.setDate(0)
  }

  return result
}

/**
 * Format a month and year as "February 2026".
 */
export function monthLabel(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`
}

/**
 * Grid cell for a month view. Monday-first calendar with 7 columns, covering whole weeks.
 * The grid spans from the Monday on/before the 1st to the Sunday on/after the last day.
 */
export interface MonthGridCell {
  day: string // YYYY-MM-DD day key
  dayOfMonth: number // The cell's actual calendar day number (1..31), always honest — even
  // for leading/trailing cells outside the displayed month (see `inMonth`).
  inMonth: boolean
}

/**
 * Returns a whole-weeks grid for a month, Monday-first (Mon=0, Sun=6): every
 * day from the Monday on/before the 1st through the Sunday on/after the last
 * day of the month. This is naturally 28, 35, or 42 cells depending on the
 * month — no cell count is hardcoded, and no padding is ever appended past
 * the real last day. (A 42-cell grid with a bogus trailing week was a
 * confirmed defect: see TASKS.md Phase 7 review.)
 */
export function monthGrid(year: number, month0: number): MonthGridCell[] {
  const firstOfMonth = new Date(year, month0, 1)
  const lastOfMonth = new Date(year, month0 + 1, 0)

  // Monday on or before the 1st.
  const startDow = firstOfMonth.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysBeforeFirst = startDow === 0 ? 6 : startDow - 1
  const gridStart = fromDayKey(toDayKey(addDays(firstOfMonth, -daysBeforeFirst)))

  // Sunday on or after the last day.
  const endDow = lastOfMonth.getDay()
  const daysAfterLast = endDow === 0 ? 0 : 7 - endDow
  const gridEnd = fromDayKey(toDayKey(addDays(lastOfMonth, daysAfterLast)))

  const cells: MonthGridCell[] = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    const day = toDayKey(cursor)
    const inMonth = cursor.getMonth() === month0 && cursor.getFullYear() === year
    cells.push({ day, dayOfMonth: cursor.getDate(), inMonth })
    cursor = addDays(cursor, 1)
  }

  return cells
}

/**
 * The day-key range (`fromDay`..`toDay`) a `monthGrid(year, month0)` call
 * spans — i.e. the range to query `dayStatuses` over so every visible cell
 * has status data. Shared by `monthGrid` callers so the "grid boundary"
 * computation exists in exactly one place (it was previously duplicated,
 * byte-for-byte, in both `hydrate` and `setMonth` in `stores/archive.ts`).
 */
export function monthGridRange(year: number, month0: number): { fromDay: string; toDay: string } {
  const firstOfMonth = new Date(year, month0, 1)
  const lastOfMonth = new Date(year, month0 + 1, 0)

  const startDow = firstOfMonth.getDay()
  const daysBeforeFirst = startDow === 0 ? 6 : startDow - 1
  const gridStart = addDays(firstOfMonth, -daysBeforeFirst)

  const endDow = lastOfMonth.getDay()
  const daysAfterLast = endDow === 0 ? 0 : 7 - endDow
  const gridEnd = addDays(lastOfMonth, daysAfterLast)

  return { fromDay: toDayKey(gridStart), toDay: toDayKey(gridEnd) }
}

/**
 * Title for a day in archive, e.g. "Thursday, 12 February".
 */
export function dayRecordTitle(day: string): string {
  const d = fromDayKey(day)
  return formatTitleDate(d)
}

/**
 * Meta line for a day record, e.g. "4 of 5 blocks completed · 6.5 h deep · 9 pomodoros".
 */
export function dayRecordMeta(record: {
  blockCount: number
  completedCount: number
  deepMin: number
  pomodoros: number
}): string {
  const blocksStr = `${record.completedCount} of ${record.blockCount} blocks completed`
  const deepHours = splitDeepHours(record.deepMin)
  const deepStr = `${deepHours.whole}${deepHours.frac} h deep`
  const pomStr = `${record.pomodoros} pomodoro${record.pomodoros === 1 ? '' : 's'}`
  return `${blocksStr} · ${deepStr} · ${pomStr}`
}

/**
 * Histogram bar data type: week-indexed with a computed heightPct and tier.
 */
export interface HistogramBar {
  weekStart: string
  hours: number
  heightPct: number
  tier: 0 | 1 | 2 | 3
}

/**
 * Computes histogram bars from 12-week deep-hour data. Bars are scaled to fit
 * the tallest in 100%, and assigned a tier (0–3) based on quartiles.
 * `heightPct = max === 0 ? 0 : round(hours / max * 100)`.
 * `tier`: 0–25% → tier 0, 26–50% → tier 1, 51–75% → tier 2, 76–100% → tier 3.
 */
export function histogramBars(weeks: { weekStart: string; hours: number }[]): HistogramBar[] {
  const max = Math.max(...weeks.map((w) => w.hours), 0)

  const bars = weeks.map((week) => {
    const heightPct = max === 0 ? 0 : Math.round((week.hours / max) * 100)
    let tier: 0 | 1 | 2 | 3 = 0
    if (heightPct > 75) {
      tier = 3
    } else if (heightPct > 50) {
      tier = 2
    } else if (heightPct > 25) {
      tier = 1
    }

    return { weekStart: week.weekStart, hours: week.hours, heightPct, tier }
  })

  return bars
}
