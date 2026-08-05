/**
 * Pure functions for Today view logic. All functions are deterministic and
 * testable without DOM or React, using the node environment.
 *
 * Model: each block has an absolute startMin (persisted as-is). Gaps between
 * blocks are first-class — they can be positive (buffer), zero (contiguous),
 * or negative (overlap). Editing ripples to downstream blocks by default, or
 * can be confined to a single block.
 */

import type { DayBlock, BlockKind, BlockRepeat } from '../db/types'
import { minutesToClock, formatDuration } from './time'

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
 * Earliest free start time at or after `fromMin` for a block of length
 * `durationMin`, i.e. the smallest `t >= fromMin` such that the half-open
 * interval [t, t + durationMin) intersects no existing block's
 * [b.startMin, b.startMin + b.durationMin). Touching endpoints do not count
 * as a collision.
 *
 * Always re-sorts via `sortBlocks()` rather than trusting the caller's array
 * order — see the canonical-ordering note on `sortBlocks` and the Phase 4
 * defect list in TASKS.md ("three different orderings for one list").
 * Returns a new value; does not mutate the input.
 */
export function nextFreeStart(blocks: DayBlock[], fromMin: number, durationMin: number): number {
  const sorted = sortBlocks(blocks)

  let t = fromMin
  let i = 0
  while (i < sorted.length) {
    const b = sorted[i]
    const blockEnd = b.startMin + b.durationMin
    const collides = t < blockEnd && b.startMin < t + durationMin
    if (collides) {
      t = blockEnd
      i = 0
      continue
    }
    i++
  }
  return t
}

/**
 * Maximum whole pomodoros (25 min focus + 5 min rest = 30 min) that fit in
 * durationMin. Matches FOCUS_SEC/REST_SEC in src/stores/timer.ts.
 */
export function maxPomodoros(durationMin: number): number {
  return Math.max(0, Math.floor(durationMin / 30))
}

/**
 * Minimum allowed duration for a block of the given kind. Deep and shallow
 * work blocks floor at 30 minutes; breaks and rituals floor at 5 minutes.
 * The seeded "Maker Day" template contains a 5-minute Shut Down Ritual, so a
 * blanket 30-minute floor would make it unrepresentable.
 */
export function minDurationFor(kind: BlockKind): number {
  return kind === 'deep' || kind === 'shallow' ? 30 : 5
}

/**
 * Result of checking whether a block fits before a shutdown time.
 * fits: whether the block ends at or before shutdownMin (always true when
 *   shutdownMin is null, i.e. no shutdown configured).
 * overrunMin: minutes the block runs past shutdownMin, 0 if it fits.
 * fitDurationMin: how long a block starting at startMin could be and still
 *   fit before shutdownMin; 0 when startMin is already at or past shutdown.
 */
export interface ShutdownCheck {
  fits: boolean
  overrunMin: number
  fitDurationMin: number
}

export function checkShutdown(startMin: number, durationMin: number, shutdownMin: number | null): ShutdownCheck {
  if (shutdownMin === null) {
    return { fits: true, overrunMin: 0, fitDurationMin: durationMin }
  }
  const endMin = startMin + durationMin
  const fits = endMin <= shutdownMin
  const overrunMin = Math.max(0, endMin - shutdownMin)
  const fitDurationMin = Math.max(0, shutdownMin - startMin)
  return { fits, overrunMin, fitDurationMin }
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

/**
 * Quick-pick duration chips shown in the block composer, in addition to the
 * free-form editable duration field.
 */
export const DURATION_PRESETS = [30, 60, 90] as const

/**
 * Mono summary line for the composer footer, e.g.
 * "9:00 AM – 10:30 AM · 90 min · 3 pomodoros". The pomodoro segment is
 * omitted when pomodoros is 0 (always true for break/ritual blocks).
 */
export function composerSummary(startMin: number, durationMin: number, pomodoros: number): string {
  const range = `${minutesToClock(startMin)} – ${minutesToClock(startMin + durationMin)}`
  const parts = [range, formatDuration(durationMin)]
  if (pomodoros > 0) {
    parts.push(`${pomodoros} pomodoro${pomodoros === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

/**
 * The composer's editable draft state, derived once when the composer opens
 * and thereafter owned by the component. Kept as a plain data shape (rather
 * than assembled ad hoc from several `useState` initializers) so the
 * derivation itself — "editing an existing block vs. starting a new one,
 * with the linked task's important/urgent flags folded in" — is a pure,
 * unit-testable function instead of logic embedded in a component.
 */
export interface ComposerDraft {
  title: string
  note: string
  kind: BlockKind
  durationMin: number
  startMin: number
  pomodoros: number
  repeat: BlockRepeat
  trackId: number | null
  quiet: boolean
  important: boolean
  urgent: boolean
}

/**
 * Derives the composer's initial draft.
 * - Editing (`block` non-null): every field mirrors the block, and the
 *   important/urgent chips mirror the linked task, if any.
 * - Creating (`block` null): defaults to a 30-minute deep work block
 *   starting at `fallbackStartMin`, with pomodoros pre-filled to the max
 *   that fits (matching the pre-modal composer's behavior).
 */
export function initialComposerDraft(
  block: DayBlock | null,
  fallbackStartMin: number,
  linkedTask: { important: boolean; urgent: boolean } | null
): ComposerDraft {
  if (block) {
    return {
      title: block.title,
      note: block.note,
      kind: block.kind,
      durationMin: block.durationMin,
      startMin: block.startMin,
      pomodoros: block.pomodoros,
      repeat: block.repeat,
      trackId: block.trackId,
      quiet: block.quiet,
      important: linkedTask?.important ?? false,
      urgent: linkedTask?.urgent ?? false,
    }
  }
  return {
    title: '',
    note: '',
    kind: 'deep',
    durationMin: 30,
    startMin: fallbackStartMin,
    pomodoros: maxPomodoros(30),
    repeat: 'once',
    trackId: null,
    quiet: false,
    important: false,
    urgent: false,
  }
}

/**
 * What the composer should do to the linked task on save, given the
 * block's current `taskId` and the important/urgent chip state:
 * - 'edit': the block already links a task — always sync its flags, even if
 *   the user turned both chips off (that's a real edit, not a no-op).
 * - 'create': no linked task yet, but at least one chip is on — a task must
 *   be created so the flag has somewhere to live.
 * - 'none': no linked task and neither chip is on — nothing to do.
 */
export type TaskAction = 'edit' | 'create' | 'none'

export function resolveTaskAction(taskId: number | null, important: boolean, urgent: boolean): TaskAction {
  if (taskId !== null) return 'edit'
  if (important || urgent) return 'create'
  return 'none'
}
