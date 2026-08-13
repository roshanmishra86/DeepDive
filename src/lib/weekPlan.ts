/**
 * Pure functions for the This Week calendar view. All functions are deterministic and
 * testable without DOM or React, using the node environment.
 *
 * Metrics track planning and completion across a seven-day week. Time and dates
 * are never read from the clock; all functions take `now: Date` as an explicit parameter.
 * No input mutation. All divisions guard against zero and return `0`, never `NaN`.
 */

import type { DayBlock, BlockKind, Task } from '../db/types'
import { addDays, toDayKey } from './time'
import { quadrantOf } from './todo'

/**
 * Returns seven `YYYY-MM-DD` day keys spanning the week starting at anchorMonday,
 * ordered Monday → Sunday. Uses addDays (date-component arithmetic) so it is DST-safe.
 */
export function weekDays(anchorMonday: Date): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(anchorMonday, i)
    days.push(toDayKey(date))
  }
  return days
}

/**
 * Summary metrics for a week of blocks.
 */
export interface WeekStats {
  focusHours: number // hours, e.g. 12.5; not rounded here
  blocksScheduled: number // count of non-break blocks
  completionEstimate: number | null // 0-100 integer, or null when nothing has elapsed
  averageBlockMin: number // minutes, 0 when no non-break blocks
}

/**
 * Computes weekly metrics from blocksByDay, the seven days, and the current time.
 *
 * focusHours: sum of durationMin where kind === 'deep', planned, in hours.
 * blocksScheduled: count of blocks where kind !== 'break'.
 * completionEstimate: elapsed-scoped, time-weighted.
 *   Numerator: sum(durationMin where completed && ended)
 *   Denominator: sum(durationMin where ended)
 *   where ended means startMin + durationMin has passed for that block's day relative to now.
 *   Includes all blocks (including breaks) in both numerator and denominator.
 *   Returns 0-100 integer, or null when denominator is 0 (nothing has elapsed).
 * averageBlockMin: sum(durationMin where kind !== 'break') / count(kind !== 'break'),
 *   or 0 when there are no non-break blocks.
 */
export function weekStats(
  blocksByDay: Record<string, DayBlock[]>,
  days: string[],
  now: Date
): WeekStats {
  const nowDayKey = toDayKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  let focusMin = 0
  let blocksScheduled = 0
  let completedEndedMin = 0
  let totalEndedMin = 0
  let nonBreakMin = 0
  let nonBreakCount = 0

  for (const day of days) {
    const blocks = blocksByDay[day] ?? []

    for (const block of blocks) {
      const { kind, durationMin, completed } = block

      // Focus hours: sum deep minutes
      if (kind === 'deep') {
        focusMin += durationMin
      }

      // Blocks scheduled: count non-break
      if (kind !== 'break') {
        blocksScheduled += 1
      }

      // Average block: sum non-break minutes and count
      if (kind !== 'break') {
        nonBreakMin += durationMin
        nonBreakCount += 1
      }

      // Completion estimate: count all blocks that have ended
      const blockEnded =
        block.day < nowDayKey || (block.day === nowDayKey && block.startMin + durationMin <= nowMin)
      if (blockEnded) {
        totalEndedMin += durationMin
        if (completed) {
          completedEndedMin += durationMin
        }
      }
    }
  }

  const focusHours = focusMin / 60
  const averageBlockMin = nonBreakCount > 0 ? nonBreakMin / nonBreakCount : 0
  const completionEstimate =
    totalEndedMin > 0 ? Math.round((100 * completedEndedMin) / totalEndedMin) : null

  return {
    focusHours,
    blocksScheduled,
    completionEstimate,
    averageBlockMin,
  }
}

/**
 * Sums durationMin for all non-break blocks in the day, converted to hours.
 */
export function dayHours(blocks: DayBlock[]): number {
  let min = 0
  for (const block of blocks) {
    if (block.kind !== 'break') {
      min += block.durationMin
    }
  }
  return min / 60
}

/**
 * Per-kind time allocation with percentages summing to exactly 100 via the
 * largest-remainder method.
 */
export interface KindAllocation {
  kind: BlockKind
  minutes: number
  percent: number
}

/**
 * Computes time allocation by BlockKind for the week. Returns all four kinds
 * (deep, shallow, ritual, break) in that fixed order, with percentages
 * reconciled by largest-remainder so they sum to exactly 100.
 *
 * When total minutes is 0, every percent is 0 (do not force 100).
 */
export function allocationByKind(
  blocksByDay: Record<string, DayBlock[]>,
  days: string[]
): KindAllocation[] {
  const kinds: BlockKind[] = ['deep', 'shallow', 'ritual', 'break']
  const kindMinutes: Record<BlockKind, number> = {
    deep: 0,
    shallow: 0,
    ritual: 0,
    break: 0,
  }

  for (const day of days) {
    const blocks = blocksByDay[day] ?? []
    for (const block of blocks) {
      kindMinutes[block.kind] += block.durationMin
    }
  }

  const totalMinutes = Object.values(kindMinutes).reduce((a, b) => a + b, 0)

  if (totalMinutes === 0) {
    return kinds.map((kind) => ({ kind, minutes: 0, percent: 0 }))
  }

  // Compute exact shares and floors
  const shares = kinds.map((kind) => ({
    kind,
    minutes: kindMinutes[kind],
    exact: (kindMinutes[kind] / totalMinutes) * 100,
    floor: Math.floor((kindMinutes[kind] / totalMinutes) * 100),
  }))

  // Distribute remainder by largest-remainder method
  const remainders = shares.map((s, i) => ({
    index: i,
    remainder: s.exact - s.floor,
  }))
  remainders.sort((a, b) => {
    // Sort by remainder descending, then by kind order (index) ascending for determinism
    if (b.remainder !== a.remainder) return b.remainder - a.remainder
    return a.index - b.index
  })

  const totalFloor = shares.reduce((sum, s) => sum + s.floor, 0)
  const remainderSlotsNeeded = 100 - totalFloor

  // Mark the top remainderSlotsNeeded entries for +1
  const getBonus = new Set(remainders.slice(0, remainderSlotsNeeded).map((r) => r.index))

  return shares.map((s) => ({
    kind: s.kind,
    minutes: s.minutes,
    percent: s.floor + (getBonus.has(shares.indexOf(s)) ? 1 : 0),
  }))
}

/**
 * The day key with the most deep-work minutes in the week. Ties broken by
 * earliest day in the input order. Returns null if every day has 0 deep minutes.
 */
export function mostFocusedDay(
  blocksByDay: Record<string, DayBlock[]>,
  days: string[]
): string | null {
  let maxDeepMin = 0
  let candidate: string | null = null

  for (const day of days) {
    const blocks = blocksByDay[day] ?? []
    let deepMin = 0
    for (const block of blocks) {
      if (block.kind === 'deep') {
        deepMin += block.durationMin
      }
    }
    if (deepMin > maxDeepMin) {
      maxDeepMin = deepMin
      candidate = day
    }
  }

  return maxDeepMin > 0 ? candidate : null
}

/**
 * The day key with the most non-break blocks in the week. Ties broken by
 * earliest day in the input order. Returns null if there are no non-break blocks.
 */
export function mostBlocksDay(
  blocksByDay: Record<string, DayBlock[]>,
  days: string[]
): string | null {
  let maxBlockCount = 0
  let candidate: string | null = null

  for (const day of days) {
    const blocks = blocksByDay[day] ?? []
    let blockCount = 0
    for (const block of blocks) {
      if (block.kind !== 'break') {
        blockCount += 1
      }
    }
    if (blockCount > maxBlockCount) {
      maxBlockCount = blockCount
      candidate = day
    }
  }

  return maxBlockCount > 0 ? candidate : null
}

/**
 * Grouping mode for blocks in the week view. Controls sorting and metadata display
 * within each day column, without affecting the persisted `sort` column or day grouping.
 */
export type WeekGroupBy = 'importance' | 'deadline'

/**
 * Sorts blocks within a day for display, with mode determining the primary key and
 * tying back to startMin for stability. Must return a new array and never mutate
 * the input or touch the persisted `sort` column.
 *
 * 'importance': sort by the linked task's Eisenhower quadrant (do → plan → delegate → drop),
 *   with unlinked/missing tasks LAST. Tie-break on startMin, then id.
 * 'deadline': sort by the linked task's dueAt instant (nulls/unparseable LAST). Tie-break on startMin, then id.
 */
export function sortDayBlocks(
  blocks: DayBlock[],
  mode: WeekGroupBy,
  tasksById: Map<number, Task>,
  _now: Date
): DayBlock[] {
  const copy = [...blocks]

  copy.sort((a, b) => {
    if (mode === 'importance') {
      const taskA = a.taskId ? tasksById.get(a.taskId) : null
      const taskB = b.taskId ? tasksById.get(b.taskId) : null

      const quadrantOrder: Record<string, number> = {
        do: 0,
        plan: 1,
        delegate: 2,
        drop: 3,
      }

      const quadA = taskA ? quadrantOrder[quadrantOf(taskA)] : 4 // Unlinked last
      const quadB = taskB ? quadrantOrder[quadrantOf(taskB)] : 4

      if (quadA !== quadB) return quadA - quadB
    } else if (mode === 'deadline') {
      const taskA = a.taskId ? tasksById.get(a.taskId) : null
      const taskB = b.taskId ? tasksById.get(b.taskId) : null

      const dueA = taskA?.dueAt ? new Date(taskA.dueAt) : null
      const dueB = taskB?.dueAt ? new Date(taskB.dueAt) : null
      const dueAValid = dueA && !Number.isNaN(dueA.getTime())
      const dueBValid = dueB && !Number.isNaN(dueB.getTime())

      // Valid dueAt comes before invalid/null
      if (dueAValid && dueBValid) {
        const cmp = dueA!.getTime() - dueB!.getTime()
        if (cmp !== 0) return cmp
      } else if (dueAValid) {
        return -1
      } else if (dueBValid) {
        return 1
      }
    }

    // Tie-break on startMin, then id
    if (a.startMin !== b.startMin) return a.startMin - b.startMin
    return a.id - b.id
  })

  return copy
}
