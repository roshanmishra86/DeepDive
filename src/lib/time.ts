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
