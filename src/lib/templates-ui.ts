/**
 * Pure UI helper functions for templates views.
 * These are extracted for testability without React or DOM dependencies.
 */

import { minDurationFor, maxPomodoros } from './today'
import type { BlockKind } from '../db/types'

/**
 * Validates a block input and returns errors, if any.
 * Returns an empty array if valid, or an array of error messages if invalid.
 */
export function validateBlockInput(input: {
  title: string
  kind: BlockKind
  startText: string
  durationText: string
}): string[] {
  const errors: string[] = []

  if (input.kind !== 'break' && input.kind !== 'ritual' && !input.title.trim()) {
    errors.push('Title is required for non-break, non-ritual blocks')
  }

  return errors
}

/**
 * Determines whether a pomodoro count is valid for a given duration.
 * Returns true if count is valid, false otherwise.
 */
export function isPomodoroCountValid(
  count: number,
  durationMin: number,
  kind: BlockKind
): boolean {
  if (kind === 'break' || kind === 'ritual') {
    return count === 0
  }
  const max = maxPomodoros(durationMin)
  return count >= 0 && count <= max
}

/**
 * Clamps a duration to the minimum allowed for a given kind.
 */
export function ensureMinimumDuration(durationMin: number, kind: BlockKind): number {
  const min = minDurationFor(kind)
  return Math.max(durationMin, min)
}
