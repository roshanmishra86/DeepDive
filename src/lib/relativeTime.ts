import { MONTHS } from './time'

/**
 * Formats a relative time label for "Last edited …" footers.
 *
 * Given an ISO timestamp and the current moment, returns a human-readable
 * relative time like "5 minutes ago" or "on 12 Aug 2026".
 *
 * - Invalid ISO strings or dates → returns empty string (caller omits footer)
 * - Future instants (delta < 0) → returns "just now" (clock skew safety)
 * - Recent (delta < 60s) → returns "just now"
 * - < 60 min → "N minutes ago" (with proper singular "1 minute ago")
 * - < 24 h → "N hours ago" (with proper singular "1 hour ago")
 * - < 7 days → "N days ago" (with proper singular "1 day ago")
 * - >= 7 days → "on 12 Aug 2026" style absolute date
 */
export function formatRelativeLabel(iso: string, now: Date): string {
  // Parse the ISO string
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  // Calculate delta in seconds (use floor for whole units)
  const deltaMs = now.getTime() - parsed.getTime()
  const deltaSec = Math.floor(deltaMs / 1000)

  // Future or within 60 seconds
  if (deltaSec < 60) {
    return 'just now'
  }

  const deltaMin = Math.floor(deltaSec / 60)
  if (deltaMin < 60) {
    const label = deltaMin === 1 ? 'minute' : 'minutes'
    return `${deltaMin} ${label} ago`
  }

  const deltaHour = Math.floor(deltaMin / 60)
  if (deltaHour < 24) {
    const label = deltaHour === 1 ? 'hour' : 'hours'
    return `${deltaHour} ${label} ago`
  }

  const deltaDay = Math.floor(deltaHour / 24)
  if (deltaDay < 7) {
    const label = deltaDay === 1 ? 'day' : 'days'
    return `${deltaDay} ${label} ago`
  }

  // Absolute date: "on 12 Aug 2026"
  const date = parsed.getDate()
  const month = MONTHS[parsed.getMonth()]
  const year = parsed.getFullYear()
  return `on ${date} ${month} ${year}`
}
