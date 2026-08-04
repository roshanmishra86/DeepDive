/**
 * Pure functions for Today view logic. All functions are deterministic and
 * testable without DOM or React, using the node environment.
 *
 * Model: each block has an absolute startMin (persisted as-is). Gaps between
 * blocks are first-class — they can be positive (buffer), zero (contiguous),
 * or negative (overlap). Editing ripples to downstream blocks by default, or
 * can be confined to a single block.
 */

import type { DayBlock } from '../db/types'

/**
 * Block height in pixels proportional to duration.
 * Formula: max(34, duration_minutes * 1.6)
 * Matches mockup literals: 5→34, 30→48, 60→96, 90→144
 */
export function blockHeight(durationMin: number): number {
  return Math.max(34, durationMin * 1.6)
}

/**
 * Gap time in minutes before a block, relative to its predecessor's end.
 * For the first block, returns 0 (by definition).
 * Positive = buffer, 0 = contiguous, negative = overlap.
 */
export function gapBefore(block: DayBlock, prev: DayBlock | null): number {
  if (!prev) return 0
  return block.startMin - (prev.startMin + prev.durationMin)
}

/**
 * The single canonical ordering for a day's blocks: by startMin, then by
 * `sort` as a tie-breaker. Every consumer that needs "the order blocks
 * appear in" — the timeline layout, conflict detection, day summaries, the
 * store's in-memory array, and the up/down reorder controls — must use this
 * same function. Diverging orderings (e.g. sorting here but reading
 * insertion order elsewhere) is what caused the up/down controls to act on
 * the wrong block; see the Phase 4 defect list in TASKS.md.
 * Returns a new array; does not mutate the input.
 */
export function sortBlocks(blocks: DayBlock[]): DayBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.startMin !== b.startMin) return a.startMin - b.startMin
    return a.sort - b.sort
  })
}

/**
 * Layout row type: either a gap (visible time offset) or a block.
 */
export type LayoutRow =
  | { type: 'gap'; minutes: number; height: number }
  | { type: 'block'; block: DayBlock; height: number }

/**
 * Computes the visual timeline layout. Blocks are ordered by startMin (with sort
 * as tie-breaker). Positive gaps are rendered as visual rows with proportional
 * height (gapMin * 1.6, floored to 8px minimum). Contiguous and overlapping
 * blocks produce no gap rows.
 * Returns a flat list of rows for the timeline to render sequentially.
 */
export function layout(blocks: DayBlock[]): LayoutRow[] {
  if (blocks.length === 0) return []

  const sorted = sortBlocks(blocks)

  const rows: LayoutRow[] = []
  let prev: DayBlock | null = null

  for (const block of sorted) {
    const gap = gapBefore(block, prev)
    if (gap > 0) {
      const gapHeight = Math.max(8, gap * 1.6)
      rows.push({ type: 'gap', minutes: gap, height: gapHeight })
    }
    rows.push({ type: 'block', block, height: blockHeight(block.durationMin) })
    prev = block
  }

  return rows
}

/**
 * Adds deltaMin to the startMin of the block at fromIndex and all blocks after it.
 * Preserves all gaps; ripples downstream. Clamps so startMin never goes below 0.
 * Returns a new array; does not mutate the input.
 */
export function shiftFrom(blocks: DayBlock[], fromIndex: number, deltaMin: number): DayBlock[] {
  return blocks.map((block, i) => {
    if (i < fromIndex) return block
    return {
      ...block,
      startMin: Math.max(0, block.startMin + deltaMin),
    }
  })
}

/**
 * Moves one block's start by deltaMin, optionally rippling to downstream blocks.
 * With ripple=true (default), all later blocks shift by the same delta.
 * With ripple=false, only this block moves and gaps may become negative.
 * Clamps so startMin never goes below 0.
 * Returns a new array; does not mutate the input.
 */
export function nudge(blocks: DayBlock[], id: number, deltaMin: number, ripple: boolean = true): DayBlock[] {
  const index = blocks.findIndex((b) => b.id === id)
  if (index === -1) return blocks

  const edited = { ...blocks[index], startMin: Math.max(0, blocks[index].startMin + deltaMin) }
  const result = [...blocks.slice(0, index), edited, ...blocks.slice(index + 1)]

  if (ripple && index < blocks.length - 1) {
    // Shift all downstream blocks by the same delta
    const actualDelta = edited.startMin - blocks[index].startMin
    return shiftFrom(result, index + 1, actualDelta)
  }

  return result
}

/**
 * Reorders blocks by moving the block at `index` one step in `direction`.
 * `blocks` must already be in canonical order (see `sortBlocks`) — `index`
 * is a position in that order, and "up"/"down" only mean the right thing
 * relative to it.
 *
 * After the move, each block preserves its gap-to-predecessor as it had
 * before (keyed by id, so this is correct regardless of position changes).
 *
 * First-block semantics (deliberately chosen, see the Phase 4 defect list):
 * the block that ends up first keeps the *day's original first startMin*,
 * not its own prior startMin. The alternative — letting whichever block
 * lands at index 0 keep its own original startMin — silently pushes the
 * whole day later whenever you promote a later block to the front (e.g.
 * swapping a 5:00 AM block and an 8:00 AM block would make the day start
 * at 8:00 AM). Anchoring on the original day-start and re-deriving every
 * other block's startMin from its preserved gap keeps the day's start time
 * stable across reordering, which matches how a "move up/down" control is
 * expected to behave. Covered by the "preserves the day's original start
 * time" test below.
 *
 * No-op if index is at the boundary in the given direction.
 * Returns a new array; does not mutate the input.
 */
export function moveBlock(blocks: DayBlock[], index: number, direction: -1 | 1): DayBlock[] {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= blocks.length) {
    return blocks // At boundary; no-op
  }

  // Capture the gap each block currently has to its predecessor in the array order
  const gaps = new Map<number, number>()
  for (let i = 0; i < blocks.length; i++) {
    const prev = i > 0 ? blocks[i - 1] : null
    gaps.set(blocks[i].id, gapBefore(blocks[i], prev))
  }

  const originalDayStart = blocks[0].startMin

  // Swap in the array order
  const result = [...blocks]
  ;[result[index], result[newIndex]] = [result[newIndex], result[index]]

  // Recompute startMin to preserve each block's gap-to-its-new-predecessor,
  // anchored on the day's original first start time (not the new first
  // block's own prior startMin — see doc comment above).
  let currentEnd = originalDayStart
  return result.map((block, i) => {
    if (i === 0) {
      currentEnd = originalDayStart + block.durationMin
      return { ...block, startMin: originalDayStart }
    }
    const gap = gaps.get(block.id) ?? 0
    const newStart = Math.max(0, currentEnd + gap)
    currentEnd = newStart + block.durationMin
    return { ...block, startMin: newStart }
  })
}

/**
 * Overlapping blocks (negative gaps). Returns the block ID and overlap minutes.
 */
export interface Conflict {
  blockId: number
  overlapMin: number
}

/**
 * Finds all overlapping blocks. Returns an empty array if the day is well-formed.
 */
export function conflicts(blocks: DayBlock[]): Conflict[] {
  const sorted = sortBlocks(blocks)

  const result: Conflict[] = []
  let prev: DayBlock | null = null

  for (const block of sorted) {
    const gap = gapBefore(block, prev)
    if (gap < 0) {
      result.push({ blockId: block.id, overlapMin: Math.abs(gap) })
    }
    prev = block
  }

  return result
}

/**
 * Summary statistics for a day's blocks.
 * plannedMin: sum of all block durations (excludes gap time)
 * deepMin: sum of durations where kind === 'deep'
 * endMin: max(startMin + durationMin) across all blocks, 0 for empty day
 * idleMin: total buffer time (sum of positive gaps)
 */
export function daySummary(blocks: DayBlock[]): {
  plannedMin: number
  deepMin: number
  endMin: number
  idleMin: number
} {
  if (blocks.length === 0) {
    return { plannedMin: 0, deepMin: 0, endMin: 0, idleMin: 0 }
  }

  const plannedMin = blocks.reduce((sum, b) => sum + b.durationMin, 0)
  const deepMin = blocks
    .filter((b) => b.kind === 'deep')
    .reduce((sum, b) => sum + b.durationMin, 0)

  let endMin = 0
  let idleMin = 0

  // Sort by startMin to compute endMin and gaps
  const sorted = sortBlocks(blocks)

  let prev: DayBlock | null = null
  for (const block of sorted) {
    endMin = Math.max(endMin, block.startMin + block.durationMin)
    const gap = gapBefore(block, prev)
    if (gap > 0) {
      idleMin += gap
    }
    prev = block
  }

  return { plannedMin, deepMin, endMin, idleMin }
}

/**
 * Block state based on completion and timing.
 * Precedence (checked in order):
 * 1. If completed, state is 'completed' (regardless of time)
 * 2. If active (now is within the block's time window), state is 'active'
 * 3. If kind is 'break', state is 'break'
 * 4. Otherwise, state is 'planned'
 */
export type BlockState = 'completed' | 'active' | 'break' | 'planned'

export function blockState(block: DayBlock, nowMin: number): BlockState {
  if (block.completed) return 'completed'
  const isActive = nowMin >= block.startMin && nowMin < block.startMin + block.durationMin
  if (isActive) return 'active'
  if (block.kind === 'break') return 'break'
  return 'planned'
}

/**
 * Progress metrics for an active block.
 * elapsedMin: minutes from the block's start to now, clamped to [0, durationMin]
 * remainingMin: durationMin - elapsedMin, always >= 0
 * pct: percentage of block elapsed, clamped to [0, 100]
 */
export function blockProgress(block: DayBlock, nowMin: number): {
  elapsedMin: number
  remainingMin: number
  pct: number
} {
  const raw = nowMin - block.startMin
  const elapsedMin = Math.max(0, Math.min(raw, block.durationMin))
  const remainingMin = block.durationMin - elapsedMin
  const pct = (elapsedMin / block.durationMin) * 100
  return { elapsedMin, remainingMin, pct: Math.max(0, Math.min(pct, 100)) }
}
