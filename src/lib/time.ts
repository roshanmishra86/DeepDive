/** Formats a seconds count as `m:ss` (e.g. 1500 -> "25:00"). */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS = [
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
 * Parses a free-typed clock-time string into minutes-of-day (0..1439), or
 * null if unparseable. Accepts bare hours ("5"), meridiem forms ("5pm",
 * "5:30pm", "9:05 am"), 24-hour with colon ("17:30"), and 4-digit 24-hour
 * ("1730", "0930"). Case-insensitive and tolerant of surrounding/internal
 * whitespace.
 *
 * When no meridiem is given and the hour is 1..12 ("5", "5:30"), the
 * ambiguity is resolved against `referenceMin`: pick whichever of the AM/PM
 * interpretation is >= referenceMin, preferring AM when both qualify; if
 * neither qualifies, fall back to the AM interpretation. This lets a typed
 * time default to "the next occurrence at or after now" rather than always
 * snapping to the morning. "17:30" and "1730" are unambiguous 24-hour and
 * bypass this rule; "0930" (leading zero / 4-digit form) is always 24-hour.
 */
export function parseClock(input: string, referenceMin = 0): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  // 4-digit 24-hour form, e.g. "1730", "0930".
  const fourDigit = /^(\d{2})(\d{2})$/.exec(trimmed)
  if (fourDigit) {
    const hour = Number(fourDigit[1])
    const minute = Number(fourDigit[2])
    if (hour > 23 || minute > 59) return null
    return hour * 60 + minute
  }

  // Meridiem or 24-hour colon form, e.g. "5pm", "5:30pm", "9:05 am", "17:30", "5".
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(trimmed)
  if (!match) return null

  const hour = Number(match[1])
  const minute = match[2] === undefined ? 0 : Number(match[2])
  const meridiem = match[3] ? match[3].toLowerCase() : null

  if (minute > 59) return null

  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    const isPM = meridiem === 'pm'
    const hour24 = isPM ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour
    return hour24 * 60 + minute
  }

  // No meridiem: 24-hour if hour is out of the 1..12 ambiguous range.
  if (hour > 12) {
    if (hour > 23) return null
    return hour * 60 + minute
  }

  // Ambiguous hour (1..12): resolve using referenceMin.
  const amMin = (hour === 12 ? 0 : hour) * 60 + minute
  const pmMin = (hour === 12 ? 12 : hour + 12) * 60 + minute
  if (amMin >= referenceMin) return amMin
  if (pmMin >= referenceMin) return pmMin
  return amMin
}

/**
 * Parses a free-typed duration string into whole minutes (> 0), or null if
 * unparseable. Accepts a bare number as minutes ("90"), explicit minutes
 * ("90m", "90 min", "90 minutes"), hours ("2h", "2 hours", "1.5h",
 * "1.5 hours"), and combined hour+minute forms ("1h30", "1h30m", "1h 30m").
 * Fractional hours round to the nearest whole minute.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase()
  if (trimmed === '') return null

  // Combined hour+minute form, e.g. "1h30", "1h30m", "1h 30m".
  const combined = /^(\d+(?:\.\d+)?)\s*h\s*(\d+)\s*m?$/.exec(trimmed)
  if (combined) {
    const hours = Number(combined[1])
    const minutes = Number(combined[2])
    const total = Math.round(hours * 60 + minutes)
    return total > 0 ? total : null
  }

  // Hours only, e.g. "2h", "2 hours", "1.5h", "1.5 hours".
  const hoursOnly = /^(\d+(?:\.\d+)?)\s*(?:h|hours?)$/.exec(trimmed)
  if (hoursOnly) {
    const total = Math.round(Number(hoursOnly[1]) * 60)
    return total > 0 ? total : null
  }

  // Minutes, explicit or bare, e.g. "90", "90m", "90 min", "90 minutes".
  const minutesForm = /^(\d+(?:\.\d+)?)\s*(?:m|min|minutes?)?$/.exec(trimmed)
  if (minutesForm) {
    const total = Math.round(Number(minutesForm[1]))
    return total > 0 ? total : null
  }

  return null
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
