/** Formats a seconds count as `m:ss` (e.g. 1500 -> "25:00"). */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Title-bar date in the mockup's shape: "Wednesday, 12 March". */
export function formatTitleDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Converts a Date to YYYY-MM-DD using local time, not UTC. */
export function toDayKey(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parses YYYY-MM-DD and returns a Date at local midnight. */
export function fromDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/** Adds n days to a Date (preserves time of day). */
export function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}

/** Returns the Date of the Monday of the week containing d, at local midnight. */
export function startOfWeek(d: Date): Date {
  const dayOfWeek = d.getDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(d)
  monday.setDate(monday.getDate() - daysSinceMonday)
  monday.setHours(0, 0, 0, 0)
  return monday
}

/** Converts minutes since local midnight to "h:mm AM/PM" format. */
export function minutesToClock(min: number): string {
  const hours = Math.floor(min / 60)
  const minutes = min % 60
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  const period = hours < 12 ? 'AM' : 'PM'
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}

/** Formats minutes as "Xh Ym", omitting zero parts. */
export function formatDuration(min: number): string {
  if (min < 60) {
    return `${min} min`
  }
  const hours = Math.floor(min / 60)
  const minutes = min % 60
  if (minutes === 0) {
    return `${hours} h`
  }
  return `${hours} h ${minutes} m`
}

/**
 * Splits total deep-work minutes into a whole-hours part and a one-decimal
 * fractional suffix, rounding once on the combined value so the two halves
 * of the sidebar's split display (large face + small unit) never disagree.
 * Rounding the integer and fractional parts independently (`Math.floor` +
 * `.toFixed(1)` on the remainder) can carry the fraction into the next whole
 * hour without the whole-hours part following — e.g. 1138 min = 18.966... h
 * would render "18" + ".0 h" instead of "19" + ".0 h".
 */
export function splitDeepHours(totalMinutes: number): { whole: number; frac: string } {
  const tenths = Math.round(totalMinutes / 6) // minutes -> tenths of an hour
  const whole = Math.floor(tenths / 10)
  const fracDigit = tenths % 10
  return { whole, frac: `.${fracDigit}` }
}
