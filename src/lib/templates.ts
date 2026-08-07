/**
 * Pure functions for template list and detail manipulation.
 * All functions are deterministic and testable without DOM or React.
 *
 * Weekday mask is 7 bits, Monday = bit 0 through Sunday = bit 6.
 */

import type { Template, TemplateBlock } from '../db/types'
import { sortBlocks } from './today'
import { minutesToClock } from './time'

/**
 * Weekday metadata with bit position, short label (single letter), and full label.
 * Monday = bit 0, Sunday = bit 6.
 * Short labels for chip rendering: M/T/W/T/F/S/S
 * Full labels for detail pane buttons: Mon/Tue/Wed/Thu/Fri/Sat/Sun
 */
export const WEEKDAYS = [
  { bit: 0 as const, short: 'M' as const, label: 'Mon' as const },
  { bit: 1 as const, short: 'T' as const, label: 'Tue' as const },
  { bit: 2 as const, short: 'W' as const, label: 'Wed' as const },
  { bit: 3 as const, short: 'T' as const, label: 'Thu' as const },
  { bit: 4 as const, short: 'F' as const, label: 'Fri' as const },
  { bit: 5 as const, short: 'S' as const, label: 'Sat' as const },
  { bit: 6 as const, short: 'S' as const, label: 'Sun' as const },
] as const satisfies readonly { readonly bit: number; readonly short: string; readonly label: string }[]

/**
 * Checks if a given weekday bit is set in the mask.
 */
export function hasWeekday(mask: number, bit: number): boolean {
  return (mask & (1 << bit)) !== 0
}

/**
 * Toggles a weekday bit in the mask, returning the new mask.
 */
export function toggleWeekday(mask: number, bit: number): number {
  return mask ^ (1 << bit)
}

/**
 * Returns the WEEKDAYS entries whose bit is set in the mask, in Mon..Sun order.
 */
export function activeWeekdays(mask: number) {
  return WEEKDAYS.filter((d) => hasWeekday(mask, d.bit))
}

/**
 * Formats the active weekdays as a readable string.
 * Examples: "Mon, Wed, Fri", "Every day", "No repeat"
 */
export function formatWeekdays(mask: number): string {
  if (mask === 127) return 'Every day' // All 7 bits set
  if (mask === 0) return 'No repeat'

  const active = activeWeekdays(mask)
  return active.map((d) => d.label).join(', ')
}

/**
 * Template subtitle line combining weekday info and start time.
 * Matches the mockup (`mock-ups/Deep Work.dc.html` line ~465):
 * "Applies on Mon, Wed, Fri · starts 5:00 AM"
 *
 * - mask non-zero, not "every day": "Applies on <days> · starts <time>"
 * - mask 127 (every day): "Every day · starts <time>" — deliberately NOT
 *   "Applies on Every day", which reads badly.
 * - mask 0 (no repeat): "No repeat · starts <time>" — also without the
 *   "Applies on " prefix, since "Applies on No repeat" is nonsensical.
 */
export function templateSubtitle(mask: number, startMin: number): string {
  const weekdayText = formatWeekdays(mask)
  const startTime = minutesToClock(startMin)
  const prefix = mask !== 0 && mask !== 127 ? 'Applies on ' : ''
  return `${prefix}${weekdayText} · starts ${startTime}`
}

/**
 * Summary statistics for template blocks.
 * totalMin: sum of all block durations (excludes gap time)
 * blockCount: number of blocks
 * deepMin: sum of durations where kind === 'deep'
 * endMin: max(startMin + durationMin) across all blocks, 0 for empty
 */
export function templateTotals(
  blocks: TemplateBlock[]
): { totalMin: number; blockCount: number; deepMin: number; endMin: number } {
  if (blocks.length === 0) {
    return { totalMin: 0, blockCount: 0, deepMin: 0, endMin: 0 }
  }

  const totalMin = blocks.reduce((sum, b) => sum + b.durationMin, 0)
  const blockCount = blocks.length
  const deepMin = blocks.filter((b) => b.kind === 'deep').reduce((sum, b) => sum + b.durationMin, 0)

  const sorted = sortBlocks(blocks)
  let endMin = 0
  for (const block of sorted) {
    endMin = Math.max(endMin, block.startMin + block.durationMin)
  }

  return { totalMin, blockCount, deepMin, endMin }
}

/**
 * Finds the start time for a newly added template block.
 * If there are no blocks, returns template.startMin.
 * Otherwise, returns the end time of the last block in canonical order.
 */
export function nextTemplateBlockStart(blocks: TemplateBlock[], template: Template): number {
  if (blocks.length === 0) return template.startMin

  const sorted = sortBlocks(blocks)
  const last = sorted[sorted.length - 1]
  return last.startMin + last.durationMin
}

