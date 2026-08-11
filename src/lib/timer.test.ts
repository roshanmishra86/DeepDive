import { describe, it, expect } from 'vitest'
import type { DayBlock } from '../db/types'
import {
  activeWorkBlock,
  pomodoroTargetFor,
  isFreshCycle,
  nextBlockHint,
  sessionTagLabel,
  sessionMetaLine,
  nextHintLine,
  displayPomodoroTarget,
} from './timer'

function makeBlock(id: number, overrides: Partial<DayBlock> = {}): DayBlock {
  return {
    id,
    day: '2026-08-10',
    taskId: null,
    subtaskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin: 300,
    durationMin: 90,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
    ...overrides,
  }
}

describe('activeWorkBlock', () => {
  it('returns the block whose window contains nowMin', () => {
    const block = makeBlock(1, { startMin: 300, durationMin: 90 })
    expect(activeWorkBlock([block], 300)?.id).toBe(1)
    expect(activeWorkBlock([block], 350)?.id).toBe(1)
    expect(activeWorkBlock([block], 389)?.id).toBe(1)
  })

  it('uses a half-open window: startMin inclusive, end exclusive', () => {
    const block = makeBlock(1, { startMin: 300, durationMin: 90 })
    expect(activeWorkBlock([block], 299)).toBeNull()
    expect(activeWorkBlock([block], 390)).toBeNull()
  })

  it('excludes completed blocks even when in-window', () => {
    const block = makeBlock(1, { startMin: 300, durationMin: 90, completed: true })
    expect(activeWorkBlock([block], 350)).toBeNull()
  })

  it('excludes break blocks even when in-window', () => {
    const block = makeBlock(1, { kind: 'break', startMin: 300, durationMin: 15 })
    expect(activeWorkBlock([block], 305)).toBeNull()
  })

  it('excludes ritual blocks even when in-window', () => {
    const block = makeBlock(1, { kind: 'ritual', startMin: 300, durationMin: 15 })
    expect(activeWorkBlock([block], 305)).toBeNull()
  })

  it('includes shallow blocks', () => {
    const block = makeBlock(1, { kind: 'shallow', startMin: 300, durationMin: 60 })
    expect(activeWorkBlock([block], 330)?.id).toBe(1)
  })

  it('returns null when no block matches', () => {
    const block = makeBlock(1, { startMin: 300, durationMin: 90 })
    expect(activeWorkBlock([block], 600)).toBeNull()
    expect(activeWorkBlock([], 350)).toBeNull()
  })

  it('uses canonical order (startMin, then sort) when blocks overlap', () => {
    // Both windows contain 350; the earlier-starting block wins regardless
    // of array order.
    const later = makeBlock(2, { startMin: 330, durationMin: 60, sort: 0 })
    const earlier = makeBlock(1, { startMin: 300, durationMin: 90, sort: 0 })
    expect(activeWorkBlock([later, earlier], 350)?.id).toBe(1)
  })

  it('breaks startMin ties by sort', () => {
    const b2 = makeBlock(2, { startMin: 300, durationMin: 90, sort: 1 })
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90, sort: 0 })
    expect(activeWorkBlock([b2, b1], 350)?.id).toBe(1)
  })
})

describe('pomodoroTargetFor', () => {
  it('uses the explicit pomodoros when set', () => {
    expect(pomodoroTargetFor(makeBlock(1, { pomodoros: 2, durationMin: 90 }))).toBe(2)
  })

  it('falls back to the duration-derived count when pomodoros is 0', () => {
    // 90 min / 30 = 3
    expect(pomodoroTargetFor(makeBlock(1, { pomodoros: 0, durationMin: 90 }))).toBe(3)
    // 60 min / 30 = 2
    expect(pomodoroTargetFor(makeBlock(1, { pomodoros: 0, durationMin: 60 }))).toBe(2)
  })

  it('floors at 1 for short blocks', () => {
    expect(pomodoroTargetFor(makeBlock(1, { pomodoros: 0, durationMin: 15 }))).toBe(1)
    expect(pomodoroTargetFor(makeBlock(1, { pomodoros: 0, durationMin: 29 }))).toBe(1)
  })
})

describe('isFreshCycle', () => {
  const fresh = {
    phase: 'focus',
    running: false,
    remainingSec: 1500,
    totalSec: 1500,
    pomodorosDone: 0,
  }

  it('is true for a pristine focus state', () => {
    expect(isFreshCycle(fresh)).toBe(true)
  })

  it('is false in rest phase', () => {
    expect(isFreshCycle({ ...fresh, phase: 'rest', remainingSec: 300, totalSec: 300 })).toBe(false)
  })

  it('is false while running', () => {
    expect(isFreshCycle({ ...fresh, running: true })).toBe(false)
  })

  it('is false once time has elapsed (remaining < total)', () => {
    expect(isFreshCycle({ ...fresh, remainingSec: 1400 })).toBe(false)
  })

  it('is false once a pomodoro has completed', () => {
    expect(isFreshCycle({ ...fresh, pomodorosDone: 1 })).toBe(false)
  })
})

describe('nextBlockHint', () => {
  it('returns the first non-completed block after the current one in canonical order', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90, sort: 0 })
    const b2 = makeBlock(2, { startMin: 400, durationMin: 60, sort: 0 })
    const b3 = makeBlock(3, { startMin: 500, durationMin: 60, sort: 0 })
    expect(nextBlockHint([b3, b1, b2], 1, 350)?.id).toBe(2)
  })

  it('skips completed blocks after the current one', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90 })
    const b2 = makeBlock(2, { startMin: 400, durationMin: 60, completed: true })
    const b3 = makeBlock(3, { startMin: 500, durationMin: 60 })
    expect(nextBlockHint([b1, b2, b3], 1, 350)?.id).toBe(3)
  })

  it('includes break blocks as hints', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90 })
    const brk = makeBlock(2, { kind: 'break', startMin: 400, durationMin: 15, title: 'Walk & reset' })
    expect(nextBlockHint([b1, brk], 1, 350)?.id).toBe(2)
  })

  it('returns null when nothing follows the current block', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90 })
    expect(nextBlockHint([b1], 1, 350)).toBeNull()
  })

  it('falls back to time-based lookup when currentId is null', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90 })
    const b2 = makeBlock(2, { startMin: 500, durationMin: 60 })
    expect(nextBlockHint([b1, b2], null, 350)?.id).toBe(1)
  })

  it('falls back to time-based lookup when currentId is not found (deleted mid-session)', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90 })
    const b2 = makeBlock(2, { startMin: 500, durationMin: 60 })
    expect(nextBlockHint([b1, b2], 999, 350)?.id).toBe(1)
  })

  it('time-based fallback excludes blocks already over', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90 }) // ends 390
    const b2 = makeBlock(2, { startMin: 500, durationMin: 60 })
    expect(nextBlockHint([b1, b2], null, 400)?.id).toBe(2)
  })

  it('time-based fallback excludes completed blocks', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90, completed: true })
    const b2 = makeBlock(2, { startMin: 500, durationMin: 60 })
    expect(nextBlockHint([b1, b2], null, 350)?.id).toBe(2)
  })

  it('a block ending exactly at nowMin counts as over', () => {
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90 }) // ends 390
    expect(nextBlockHint([b1], null, 390)).toBeNull()
  })

  it('returns null when no block qualifies', () => {
    expect(nextBlockHint([], null, 350)).toBeNull()
    const b1 = makeBlock(1, { startMin: 300, durationMin: 90, completed: true })
    expect(nextBlockHint([b1], null, 350)).toBeNull()
  })
})

describe('sessionTagLabel', () => {
  it('labels the in-flight pomodoro', () => {
    expect(sessionTagLabel(0, 3)).toBe('session 1 of 3')
    expect(sessionTagLabel(1, 3)).toBe('session 2 of 3')
    expect(sessionTagLabel(2, 3)).toBe('session 3 of 3')
  })

  it('clamps at the target', () => {
    expect(sessionTagLabel(3, 3)).toBe('session 3 of 3')
    expect(sessionTagLabel(9, 3)).toBe('session 3 of 3')
  })
})

describe('sessionMetaLine', () => {
  it('formats range, raw duration and quiet suffix', () => {
    // 5:30 AM – 7:00 AM · 90 min block · notifications off
    expect(sessionMetaLine({ startMin: 330, durationMin: 90, quiet: true })).toBe(
      '5:30 AM – 7:00 AM · 90 min block · notifications off'
    )
  })

  it('omits the quiet suffix when not quiet', () => {
    expect(sessionMetaLine({ startMin: 330, durationMin: 90, quiet: false })).toBe(
      '5:30 AM – 7:00 AM · 90 min block'
    )
  })

  it('uses raw "N min" even for hour-plus durations (not formatDuration)', () => {
    const line = sessionMetaLine({ startMin: 0, durationMin: 120, quiet: false })
    expect(line).toContain('120 min block')
    expect(line).not.toContain('2 h')
  })
})

describe('nextHintLine', () => {
  it('formats the mockup copy', () => {
    const block = makeBlock(1, { title: 'Walk & reset', startMin: 420 })
    expect(nextHintLine(block)).toBe('next: Walk & reset, 7:00 AM')
  })
})

describe('displayPomodoroTarget', () => {
  it('previews the active block target while fresh', () => {
    // A 3-hour block with no explicit pomodoros derives 6 — the widget and
    // overlay must both show it (PR #10 review: they disagreed, 6 vs 3).
    const block = makeBlock(1, { pomodoros: 0, durationMin: 180 })
    expect(displayPomodoroTarget(true, block, 3)).toBe(6)
  })

  it('honours the block explicit pomodoros while fresh', () => {
    const block = makeBlock(1, { pomodoros: 2, durationMin: 90 })
    expect(displayPomodoroTarget(true, block, 3)).toBe(2)
  })

  it('falls back to the store target when fresh with no active block', () => {
    expect(displayPomodoroTarget(true, null, 3)).toBe(3)
  })

  it('uses the frozen store target once a cycle is running', () => {
    const block = makeBlock(1, { pomodoros: 0, durationMin: 180 })
    expect(displayPomodoroTarget(false, block, 3)).toBe(3)
    expect(displayPomodoroTarget(false, null, 5)).toBe(5)
  })
})
