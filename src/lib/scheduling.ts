import type { DayBlock } from '../db/types'
import { checkShutdown, nextFreeStart } from './today'
import { minutesToClock } from './time'

export interface TodaySchedulePreview {
  valid: boolean
  fits: boolean
  durationMin: number
  startMin: number
  endMin: number
  shutdownMin: number | null
  reason: string | null
}

/**
 * Computes a proposed Today placement without mutating store state. Both task
 * and subtask scheduling use this exact result so their shutdown messaging
 * cannot disagree with the block that is eventually created.
 */
export function previewTodaySchedule(
  blocks: DayBlock[],
  fromMin: number,
  durationMin: number,
  shutdownMin: number | null,
  options: { minDurationMin?: number; stepMin?: number } = {}
): TodaySchedulePreview {
  const minDurationMin = options.minDurationMin ?? 1
  const stepMin = options.stepMin ?? 1
  const valid = Number.isInteger(durationMin)
    && durationMin >= minDurationMin
    && durationMin <= 1440
    && durationMin % stepMin === 0
  if (!valid) {
    return {
      valid: false,
      fits: false,
      durationMin,
      startMin: fromMin,
      endMin: fromMin + durationMin,
      shutdownMin,
      reason: `Choose a duration from ${minDurationMin} to 1440 minutes${stepMin > 1 ? ` in ${stepMin}-minute steps` : ''}.`,
    }
  }
  const startMin = nextFreeStart(blocks, fromMin, durationMin)
  const shutdown = checkShutdown(startMin, durationMin, shutdownMin)
  return {
    valid: true,
    fits: shutdown.fits,
    durationMin,
    startMin,
    endMin: startMin + durationMin,
    shutdownMin,
    reason: shutdown.fits ? null : `Doesn't fit before shutdown${shutdownMin === null ? '' : ` (${minutesToClock(shutdownMin)})`}.`,
  }
}
