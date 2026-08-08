/**
 * Pure helpers for the pomodoro timer's block attachment: which block a
 * fresh cycle attaches to, how many pomodoros that block targets, whether
 * the cycle is still "fresh" (previewing the active block rather than
 * frozen onto an attachment), and the overlay's copy lines. All functions
 * are deterministic and unit-tested on the node environment.
 */

import type { DayBlock } from '../db/types'
import { sortBlocks, maxPomodoros } from './today'
import { minutesToClock } from './time'

/**
 * The non-completed deep/shallow block whose window contains `nowMin`
 * (`nowMin >= startMin && nowMin < startMin + durationMin`), in canonical
 * `sortBlocks` order. Break/ritual blocks are NOT attachable — you don't
 * pomodoro a break — so they return null here even when active. Returns
 * null when none.
 */
export function activeWorkBlock(blocks: DayBlock[], nowMin: number): DayBlock | null {
  for (const block of sortBlocks(blocks)) {
    if (block.completed) continue
    if (block.kind !== 'deep' && block.kind !== 'shallow') continue
    if (nowMin >= block.startMin && nowMin < block.startMin + block.durationMin) {
      return block
    }
  }
  return null
}

/**
 * The pomodoro target for an attached block: its explicit `pomodoros` when
 * set, else the most that fit its duration (floored at 1 so even a short
 * block targets at least one).
 */
export function pomodoroTargetFor(block: DayBlock): number {
  return block.pomodoros > 0 ? block.pomodoros : Math.max(1, maxPomodoros(block.durationMin))
}

/**
 * True while the timer has never been started in this cycle: fresh focus,
 * untouched remaining time, zero pomodoros done. While fresh, the widget
 * and overlay preview the currently-active block; once a cycle starts, the
 * attachment freezes onto its snapshot.
 */
export function isFreshCycle(s: {
  phase: string
  running: boolean
  remainingSec: number
  totalSec: number
  pomodorosDone: number
}): boolean {
  return (
    s.phase === 'focus' &&
    !s.running &&
    s.remainingSec === s.totalSec &&
    s.pomodorosDone === 0
  )
}

/**
 * The block to tease as "next" in the session overlay. If `currentId` is
 * found in `sortBlocks(blocks)`, the first non-completed block AFTER it in
 * canonical order (any kind — the mockup's hint is a break). If `currentId`
 * is null or not found (deleted mid-session), the first non-completed block
 * that hasn't ended yet (`startMin + durationMin > nowMin`). Null when no
 * such block exists.
 */
export function nextBlockHint(
  blocks: DayBlock[],
  currentId: number | null,
  nowMin: number
): DayBlock | null {
  const sorted = sortBlocks(blocks)
  if (currentId !== null) {
    const index = sorted.findIndex((b) => b.id === currentId)
    if (index !== -1) {
      for (let i = index + 1; i < sorted.length; i++) {
        if (!sorted[i].completed) return sorted[i]
      }
      return null
    }
  }
  for (const block of sorted) {
    if (block.completed) continue
    if (block.startMin + block.durationMin > nowMin) return block
  }
  return null
}

/** Overlay session tag, e.g. "session 2 of 3" while the 2nd pomodoro runs. */
export function sessionTagLabel(pomodorosDone: number, target: number): string {
  return `session ${Math.min(pomodorosDone + 1, target)} of ${target}`
}

/**
 * The pomodoro target to DISPLAY, shared by the widget counter and the
 * overlay session tag so the two surfaces can never disagree. While the
 * cycle is fresh, the target previews the currently-active block's; once a
 * cycle is running, the store's frozen `pomodorosPerBlock` (set at attach
 * time) is the truth. Extracted as a helper after PR #10 review found the
 * widget previewing `pomodoroTargetFor(activeBlock)` while the overlay used
 * the raw store value — "1 / 6" beside "session 1 of 3" on the same block.
 */
export function displayPomodoroTarget(
  fresh: boolean,
  activeBlock: DayBlock | null,
  storeTarget: number
): number {
  return fresh && activeBlock ? pomodoroTargetFor(activeBlock) : storeTarget
}

/**
 * Overlay meta line under the block title, e.g.
 * "5:30 AM – 7:00 AM · 90 min block · notifications off". The duration is
 * raw `${durationMin} min` (NOT formatDuration) — the mockup says
 * "90 min block".
 */
export function sessionMetaLine(block: {
  startMin: number
  durationMin: number
  quiet: boolean
}): string {
  const range = `${minutesToClock(block.startMin)} – ${minutesToClock(block.startMin + block.durationMin)}`
  return `${range} · ${block.durationMin} min block${block.quiet ? ' · notifications off' : ''}`
}

/** Overlay next-block hint, e.g. "next: Walk & reset, 7:00 AM". */
export function nextHintLine(block: DayBlock): string {
  return `next: ${block.title}, ${minutesToClock(block.startMin)}`
}
