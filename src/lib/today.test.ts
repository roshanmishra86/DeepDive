import { describe, it, expect } from 'vitest'
import {
  blockHeight,
  gapBefore,
  layout,
  shiftFrom,
  nudge,
  moveBlock,
  conflicts,
  daySummary,
  blockState,
  blockProgress,
  sortBlocks,
  nextFreeStart,
  maxPomodoros,
  minDurationFor,
  checkShutdown,
  composerSummary,
  initialComposerDraft,
  resolveTaskAction,
} from './today'
import type { DayBlock, BlockKind } from '../db/types'

describe('blockHeight', () => {
  it('returns 34px minimum for short blocks', () => {
    expect(blockHeight(5)).toBe(34)
    expect(blockHeight(10)).toBe(34)
  })

  it('scales with duration: 30→48', () => {
    expect(blockHeight(30)).toBe(48)
  })

  it('scales with duration: 60→96', () => {
    expect(blockHeight(60)).toBe(96)
  })

  it('scales with duration: 90→144', () => {
    expect(blockHeight(90)).toBe(144)
  })

  it('handles zero duration', () => {
    expect(blockHeight(0)).toBe(34)
  })
})

describe('gapBefore', () => {
  const makeBlock = (id: number, startMin: number, durationMin: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('returns 0 for the first block (no predecessor)', () => {
    const block = makeBlock(1, 300, 60)
    expect(gapBefore(block, null)).toBe(0)
  })

  it('returns 0 for contiguous blocks', () => {
    const prev = makeBlock(1, 300, 60) // ends at 360
    const block = makeBlock(2, 360, 60)
    expect(gapBefore(block, prev)).toBe(0)
  })

  it('returns positive for a buffer', () => {
    const prev = makeBlock(1, 300, 60) // ends at 360
    const block = makeBlock(2, 370, 60) // 10-minute buffer
    expect(gapBefore(block, prev)).toBe(10)
  })

  it('returns negative for an overlap', () => {
    const prev = makeBlock(1, 300, 60) // ends at 360
    const block = makeBlock(2, 350, 60) // overlaps by 10 minutes
    expect(gapBefore(block, prev)).toBe(-10)
  })
})

describe('layout', () => {
  const makeBlock = (id: number, startMin: number, durationMin: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('returns empty array for empty blocks', () => {
    expect(layout([])).toEqual([])
  })

  it('renders a single block', () => {
    const blocks = [makeBlock(1, 300, 60)]
    const rows = layout(blocks)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      type: 'block',
      block: blocks[0],
      height: 96,
    })
  })

  it('renders contiguous blocks without gap rows', () => {
    const blocks = [
      makeBlock(1, 300, 60), // ends at 360
      makeBlock(2, 360, 60), // starts at 360
    ]
    const rows = layout(blocks)
    expect(rows).toHaveLength(2)
    expect(rows[0].type).toBe('block')
    expect(rows[1].type).toBe('block')
  })

  it('renders a gap row for a buffer', () => {
    const blocks = [
      makeBlock(1, 300, 60), // ends at 360
      makeBlock(2, 370, 60), // starts at 370, 10-minute gap
    ]
    const rows = layout(blocks)
    expect(rows).toHaveLength(3) // gap + block + block
    expect(rows[0].type).toBe('block')
    expect(rows[1]).toEqual({
      type: 'gap',
      minutes: 10,
      height: Math.max(8, 10 * 1.6),
    })
    expect(rows[2].type).toBe('block')
  })

  it('gap row height is at least 8px', () => {
    const blocks = [
      makeBlock(1, 300, 60), // ends at 360
      makeBlock(2, 365, 60), // starts at 365, 5-minute gap
    ]
    const rows = layout(blocks)
    const gapRow = rows.find((r) => r.type === 'gap')
    expect(gapRow?.type).toBe('gap')
    expect(gapRow?.height).toBe(8) // 5 * 1.6 = 8, exactly
  })

  it('does not render a gap row for negative gaps (overlaps)', () => {
    const blocks = [
      makeBlock(1, 300, 60), // ends at 360
      makeBlock(2, 350, 60), // starts at 350 (overlap)
    ]
    const rows = layout(blocks)
    // Should be just 2 block rows; no gap row for overlap
    const gapRows = rows.filter((r) => r.type === 'gap')
    expect(gapRows).toHaveLength(0)
  })

  it('sorts by startMin then sort field', () => {
    const blocks = [
      makeBlock(2, 360, 60), // starts second chronologically
      makeBlock(1, 300, 60), // starts first chronologically
    ]
    const rows = layout(blocks)
    expect(rows[0].type).toBe('block')
    if (rows[0].type === 'block') {
      expect(rows[0].block.id).toBe(1)
    }
  })
})

describe('shiftFrom', () => {
  const makeBlock = (id: number, startMin: number, durationMin: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('does not mutate the input', () => {
    const blocks = [makeBlock(1, 300, 60), makeBlock(2, 360, 60)]
    const original = JSON.parse(JSON.stringify(blocks))
    shiftFrom(blocks, 1, 30)
    expect(blocks).toEqual(original)
  })

  it('shifts block at index and all downstream blocks', () => {
    const blocks = [makeBlock(1, 300, 60), makeBlock(2, 360, 60), makeBlock(3, 420, 60)]
    const shifted = shiftFrom(blocks, 1, 30)
    expect(shifted[0].startMin).toBe(300) // unchanged
    expect(shifted[1].startMin).toBe(390) // 360 + 30
    expect(shifted[2].startMin).toBe(450) // 420 + 30
  })

  it('clamps startMin to 0', () => {
    const blocks = [makeBlock(1, 50, 60), makeBlock(2, 110, 60)]
    const shifted = shiftFrom(blocks, 0, -100)
    expect(shifted[0].startMin).toBe(0)
    expect(shifted[1].startMin).toBe(10) // max(0, 110 - 100) = 10
  })
})

describe('nudge', () => {
  const makeBlock = (id: number, startMin: number, durationMin: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('moves one block with ripple=true by default', () => {
    const blocks = [makeBlock(1, 300, 60), makeBlock(2, 360, 60), makeBlock(3, 420, 60)]
    const nudged = nudge(blocks, 2, 30)
    expect(nudged[0].startMin).toBe(300) // unchanged
    expect(nudged[1].startMin).toBe(390) // 360 + 30
    expect(nudged[2].startMin).toBe(450) // 420 + 30
  })

  it('moves one block without ripple when ripple=false', () => {
    const blocks = [makeBlock(1, 300, 60), makeBlock(2, 360, 60), makeBlock(3, 420, 60)]
    const nudged = nudge(blocks, 2, 30, false)
    expect(nudged[0].startMin).toBe(300) // unchanged (block 1)
    expect(nudged[1].startMin).toBe(390) // 360 + 30 (block 2 moved, no ripple)
    expect(nudged[2].startMin).toBe(420) // unchanged (block 3, no ripple)
  })

  it('clamps startMin to 0', () => {
    const blocks = [makeBlock(1, 50, 60)]
    const nudged = nudge(blocks, 1, -100)
    expect(nudged[0].startMin).toBe(0)
  })

  it('returns unchanged array if id not found', () => {
    const blocks = [makeBlock(1, 300, 60)]
    const nudged = nudge(blocks, 999, 30)
    expect(nudged).toEqual(blocks)
  })
})

describe('moveBlock', () => {
  const makeBlock = (id: number, startMin: number, durationMin: number, sort: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('swaps adjacent blocks and recomputes start times', () => {
    // Block 1: 300–360 (60 min), Block 2: 360–420 (60 min, contiguous)
    const blocks = [
      makeBlock(1, 300, 60, 0),
      makeBlock(2, 360, 60, 1),
    ]
    const moved = moveBlock(blocks, 0, 1)
    // After swap: [Block 2, Block 1]
    // When recomputed, both should be re-laid out preserving any gaps
    expect(moved[0].id).toBe(2)
    expect(moved[1].id).toBe(1)
    // Block 1's gap-to-predecessor should be preserved (was contiguous, should remain so)
    expect(moved[1].startMin).toBe(moved[0].startMin + moved[0].durationMin)
  })

  it('is no-op at the top boundary', () => {
    const blocks = [
      makeBlock(1, 300, 60, 0),
      makeBlock(2, 360, 60, 1),
    ]
    const moved = moveBlock(blocks, 0, -1)
    expect(moved).toEqual(blocks)
  })

  it('is no-op at the bottom boundary', () => {
    const blocks = [
      makeBlock(1, 300, 60, 0),
      makeBlock(2, 360, 60, 1),
    ]
    const moved = moveBlock(blocks, 1, 1)
    expect(moved).toEqual(blocks)
  })

  it('does not mutate the input', () => {
    const blocks = [
      makeBlock(1, 300, 60, 0),
      makeBlock(2, 360, 60, 1),
    ]
    const original = JSON.parse(JSON.stringify(blocks))
    moveBlock(blocks, 0, 1)
    expect(blocks).toEqual(original)
  })

  it('preserves the day\'s original start time when the first block changes', () => {
    // Regression test for the chosen first-block semantics: promoting a
    // later block to the front must not push the whole day later by
    // letting that block keep its own (later) original startMin. Block 1
    // starts the day at 300 with a 40-min gap before block 2 (400-460).
    const blocks = [
      makeBlock(1, 300, 60, 0), // 5:00-6:00, day starts at 300
      makeBlock(2, 400, 60, 1), // 6:40-7:40, 40-min gap after block 1
    ]
    const moved = moveBlock(blocks, 0, 1) // swap: block 2 becomes first
    expect(moved[0].id).toBe(2)
    expect(moved[1].id).toBe(1)
    // The day must still start at 300, not at block 2's original 400.
    expect(moved[0].startMin).toBe(300)
    // Block 1 (now second) had no predecessor in its original position, so
    // its recorded "gap to predecessor" is 0 (gapBefore's documented
    // definition for a first block) — it lands contiguous with whatever is
    // now ahead of it, rather than re-deriving a gap it never had.
    expect(moved[1].startMin).toBe(moved[0].startMin + moved[0].durationMin)
  })
})

describe('sortBlocks', () => {
  const makeBlock = (id: number, startMin: number, sort: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin,
    durationMin: 60,
    pomodoros: 0,
    completed: false,
    sort,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('sorts by startMin regardless of input order', () => {
    const blocks = [makeBlock(3, 420, 0), makeBlock(1, 300, 0), makeBlock(2, 360, 0)]
    const sorted = sortBlocks(blocks)
    expect(sorted.map((b) => b.id)).toEqual([1, 2, 3])
  })

  it('uses sort as a tie-breaker for equal startMin', () => {
    const blocks = [makeBlock(2, 300, 1), makeBlock(1, 300, 0)]
    const sorted = sortBlocks(blocks)
    expect(sorted.map((b) => b.id)).toEqual([1, 2])
  })

  it('does not mutate the input', () => {
    const blocks = [makeBlock(2, 360, 0), makeBlock(1, 300, 0)]
    const original = JSON.parse(JSON.stringify(blocks))
    sortBlocks(blocks)
    expect(blocks).toEqual(original)
  })
})

describe('conflicts', () => {
  const makeBlock = (id: number, startMin: number, durationMin: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('returns empty array for well-formed days', () => {
    const blocks = [
      makeBlock(1, 300, 60), // ends at 360
      makeBlock(2, 360, 60), // starts at 360 (contiguous)
      makeBlock(3, 420, 60), // starts at 420 (10-min buffer)
    ]
    expect(conflicts(blocks)).toEqual([])
  })

  it('detects overlapping blocks', () => {
    const blocks = [
      makeBlock(1, 300, 60), // ends at 360
      makeBlock(2, 350, 60), // starts at 350, overlaps by 10 min
    ]
    const conf = conflicts(blocks)
    expect(conf).toHaveLength(1)
    expect(conf[0]).toEqual({ blockId: 2, overlapMin: 10 })
  })

  it('returns empty array for empty blocks', () => {
    expect(conflicts([])).toEqual([])
  })
})

describe('daySummary', () => {
  const makeBlock = (id: number, startMin: number, durationMin: number, kind: 'deep' | 'shallow' | 'break' = 'deep'): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind,
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('returns all zeros for empty blocks', () => {
    const summary = daySummary([])
    expect(summary).toEqual({
      plannedMin: 0,
      deepMin: 0,
      endMin: 0,
      idleMin: 0,
    })
  })

  it('computes plannedMin excluding gaps', () => {
    const blocks = [
      makeBlock(1, 300, 60), // ends at 360
      makeBlock(2, 370, 60), // 10-min buffer, ends at 430
    ]
    const summary = daySummary(blocks)
    expect(summary.plannedMin).toBe(120) // 60 + 60, gaps not included
  })

  it('computes deepMin correctly', () => {
    const blocks = [
      makeBlock(1, 300, 60, 'deep'),
      makeBlock(2, 360, 30, 'shallow'),
      makeBlock(3, 390, 60, 'deep'),
    ]
    const summary = daySummary(blocks)
    expect(summary.deepMin).toBe(120) // 60 + 60
  })

  it('computes endMin as the latest block end time', () => {
    const blocks = [
      makeBlock(1, 300, 60),
      makeBlock(2, 360, 90), // ends at 450, the latest
    ]
    const summary = daySummary(blocks)
    expect(summary.endMin).toBe(450)
  })

  it('computes idleMin as the sum of positive gaps', () => {
    const blocks = [
      makeBlock(1, 300, 60), // ends at 360
      makeBlock(2, 370, 60), // 10-min buffer
      makeBlock(3, 430, 60), // contiguous
      makeBlock(4, 500, 60), // 10-min buffer
    ]
    const summary = daySummary(blocks)
    expect(summary.idleMin).toBe(20) // 10 + 10
  })

  it('handles over-planned days (endMin > 1440)', () => {
    const blocks = [makeBlock(1, 1200, 360)]
    const summary = daySummary(blocks)
    expect(summary.endMin).toBe(1560)
  })
})

describe('blockState', () => {
  const makeBlock = (id: number, completed: boolean, kind: 'deep' | 'shallow' | 'break', startMin: number, durationMin: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind,
    startMin,
    durationMin,
    pomodoros: 0,
    completed,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('returns completed when completed=true (even if active)', () => {
    const block = makeBlock(1, true, 'deep', 500, 60)
    expect(blockState(block, 530)).toBe('completed')
  })

  it('returns active when within time window and not completed', () => {
    const block = makeBlock(1, false, 'deep', 500, 60)
    expect(blockState(block, 500)).toBe('active')
    expect(blockState(block, 530)).toBe('active')
    expect(blockState(block, 559)).toBe('active')
  })

  it('returns planned when before the time window', () => {
    const block = makeBlock(1, false, 'deep', 500, 60)
    expect(blockState(block, 499)).toBe('planned')
  })

  it('returns planned when after the time window', () => {
    const block = makeBlock(1, false, 'deep', 500, 60)
    expect(blockState(block, 560)).toBe('planned')
  })

  it('returns active over break for active breaks', () => {
    const block = makeBlock(1, false, 'break', 500, 30)
    expect(blockState(block, 500)).toBe('active')
  })

  it('returns break for planned breaks', () => {
    const block = makeBlock(1, false, 'break', 500, 30)
    expect(blockState(block, 450)).toBe('break')
  })
})

describe('blockProgress', () => {
  const makeBlock = (startMin: number, durationMin: number): DayBlock => ({
    id: 1,
    day: '2026-08-04',
    taskId: null,
    title: 'Test block',
    kind: 'deep',
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('computes progress at the start', () => {
    const block = makeBlock(300, 60)
    const prog = blockProgress(block, 300)
    expect(prog.elapsedMin).toBe(0)
    expect(prog.remainingMin).toBe(60)
    expect(prog.pct).toBe(0)
  })

  it('computes progress at the midpoint', () => {
    const block = makeBlock(300, 60)
    const prog = blockProgress(block, 330)
    expect(prog.elapsedMin).toBe(30)
    expect(prog.remainingMin).toBe(30)
    expect(prog.pct).toBe(50)
  })

  it('computes progress at the end', () => {
    const block = makeBlock(300, 60)
    const prog = blockProgress(block, 360)
    expect(prog.elapsedMin).toBe(60)
    expect(prog.remainingMin).toBe(0)
    expect(prog.pct).toBe(100)
  })

  it('clamps when before start', () => {
    const block = makeBlock(300, 60)
    const prog = blockProgress(block, 250)
    expect(prog.elapsedMin).toBe(0)
    expect(prog.remainingMin).toBe(60)
    expect(prog.pct).toBe(0)
  })

  it('clamps when after end', () => {
    const block = makeBlock(300, 60)
    const prog = blockProgress(block, 400)
    expect(prog.elapsedMin).toBe(60)
    expect(prog.remainingMin).toBe(0)
    expect(prog.pct).toBe(100)
  })
})

describe('nextFreeStart', () => {
  const makeBlock = (id: number, startMin: number, durationMin: number): DayBlock => ({
    id,
    day: '2026-08-04',
    taskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin,
    durationMin,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    repeat: 'once',
    trackId: null,
    quiet: false,
  })

  it('returns the reference minute unchanged on an empty day', () => {
    expect(nextFreeStart([], 617, 60)).toBe(617)
  })

  it('returns the end time of a block that is in progress', () => {
    const blocks = [makeBlock(1, 500, 60)] // 500-560
    expect(nextFreeStart(blocks, 530, 30)).toBe(560)
  })

  it('skips a chain of three back-to-back blocks as a unit', () => {
    const blocks = [
      makeBlock(1, 300, 60), // 300-360
      makeBlock(2, 360, 60), // 360-420
      makeBlock(3, 420, 60), // 420-480
    ]
    expect(nextFreeStart(blocks, 300, 60)).toBe(480)
  })

  it('uses a gap large enough for the requested duration', () => {
    const blocks = [
      makeBlock(1, 300, 60), // 300-360
      makeBlock(2, 480, 60), // 480-540, 120-min gap after block 1
    ]
    expect(nextFreeStart(blocks, 300, 60)).toBe(360)
  })

  it('skips past a gap too small for the requested duration', () => {
    const blocks = [
      makeBlock(1, 300, 60), // 300-360
      makeBlock(2, 400, 60), // 400-460, only a 40-min gap; 60-min block does not fit
    ]
    expect(nextFreeStart(blocks, 300, 60)).toBe(460)
  })

  it('gives the same answer for an unsorted input array as for the sorted one', () => {
    const sorted = [
      makeBlock(1, 300, 60),
      makeBlock(2, 360, 60),
      makeBlock(3, 420, 60),
    ]
    const unsorted = [sorted[2], sorted[0], sorted[1]]
    expect(nextFreeStart(unsorted, 300, 60)).toBe(nextFreeStart(sorted, 300, 60))
  })

  it('does not mutate the input array or its block objects', () => {
    const blocks = [makeBlock(1, 300, 60), makeBlock(2, 360, 60)]
    const original = JSON.parse(JSON.stringify(blocks))
    nextFreeStart(blocks, 300, 60)
    expect(blocks).toEqual(original)
  })

  it('does not treat touching endpoints as a collision', () => {
    const blocks = [makeBlock(1, 300, 60)] // ends at 360
    expect(nextFreeStart(blocks, 360, 60)).toBe(360)
  })

  it('ignores blocks that end at or before fromMin', () => {
    const blocks = [makeBlock(1, 100, 60)] // ends at 160, well before fromMin
    expect(nextFreeStart(blocks, 300, 60)).toBe(300)
  })
})

describe('maxPomodoros', () => {
  it('computes floor(duration / 30) for various durations', () => {
    expect(maxPomodoros(0)).toBe(0)
    expect(maxPomodoros(29)).toBe(0)
    expect(maxPomodoros(30)).toBe(1)
    expect(maxPomodoros(59)).toBe(1)
    expect(maxPomodoros(60)).toBe(2)
    expect(maxPomodoros(90)).toBe(3)
  })
})

describe('minDurationFor', () => {
  it('is 30 for deep blocks', () => {
    expect(minDurationFor('deep' as BlockKind)).toBe(30)
  })

  it('is 30 for shallow blocks', () => {
    expect(minDurationFor('shallow' as BlockKind)).toBe(30)
  })

  it('is 5 for break blocks', () => {
    expect(minDurationFor('break' as BlockKind)).toBe(5)
  })

  it('is 5 for ritual blocks (e.g. a 5-minute Shut Down Ritual)', () => {
    expect(minDurationFor('ritual' as BlockKind)).toBe(5)
  })
})

describe('checkShutdown', () => {
  it('fits exactly when startMin + durationMin === shutdownMin', () => {
    const result = checkShutdown(500, 60, 560)
    expect(result).toEqual({ fits: true, overrunMin: 0, fitDurationMin: 60 })
  })

  it('reports an overrun when the block runs past shutdown', () => {
    const result = checkShutdown(500, 90, 560)
    expect(result.fits).toBe(false)
    expect(result.overrunMin).toBe(30)
    expect(result.fitDurationMin).toBe(60)
  })

  it('always fits when shutdownMin is null', () => {
    const result = checkShutdown(500, 90, null)
    expect(result).toEqual({ fits: true, overrunMin: 0, fitDurationMin: 90 })
  })

  it('reports fitDurationMin of 0 when the start is already past shutdown', () => {
    const result = checkShutdown(600, 30, 560)
    expect(result.fits).toBe(false)
    expect(result.fitDurationMin).toBe(0)
    expect(result.overrunMin).toBe(70)
  })
})

describe('composerSummary', () => {
  it('formats start–end range, duration, and a plural pomodoro count', () => {
    expect(composerSummary(540, 90, 3)).toBe('9:00 AM – 10:30 AM · 1 h 30 m · 3 pomodoros')
  })

  it('uses the singular "pomodoro" for a count of 1', () => {
    expect(composerSummary(540, 30, 1)).toBe('9:00 AM – 9:30 AM · 30 min · 1 pomodoro')
  })

  it('omits the pomodoro segment entirely when pomodoros is 0', () => {
    expect(composerSummary(540, 60, 0)).toBe('9:00 AM – 10:00 AM · 1 h')
  })
})

describe('initialComposerDraft', () => {
  const block: DayBlock = {
    id: 7,
    day: '2026-08-04',
    taskId: 42,
    title: 'Chapter 3 — first draft',
    kind: 'deep',
    startMin: 540,
    durationMin: 90,
    pomodoros: 3,
    completed: false,
    sort: 0,
    note: 'Finish the outline',
    repeat: 'daily',
    trackId: 5,
    quiet: true,
  }

  it('creating (no block): defaults to a 30-min deep block at the fallback start, pomodoros pre-filled to the max', () => {
    const draft = initialComposerDraft(null, 480, null)
    expect(draft).toEqual({
      title: '',
      note: '',
      kind: 'deep',
      durationMin: 30,
      startMin: 480,
      pomodoros: 1,
      repeat: 'once',
      trackId: null,
      quiet: false,
      important: false,
      urgent: false,
    })
  })

  it('editing (block given): every field mirrors the block', () => {
    const draft = initialComposerDraft(block, 0, null)
    expect(draft.title).toBe(block.title)
    expect(draft.note).toBe(block.note)
    expect(draft.kind).toBe(block.kind)
    expect(draft.durationMin).toBe(block.durationMin)
    expect(draft.startMin).toBe(block.startMin)
    expect(draft.pomodoros).toBe(block.pomodoros)
    expect(draft.repeat).toBe(block.repeat)
    expect(draft.trackId).toBe(block.trackId)
    expect(draft.quiet).toBe(block.quiet)
  })

  it('editing with no linked task: important/urgent default to false', () => {
    const draft = initialComposerDraft(block, 0, null)
    expect(draft.important).toBe(false)
    expect(draft.urgent).toBe(false)
  })

  it('editing with a linked task: important/urgent mirror the task', () => {
    const draft = initialComposerDraft(block, 0, { important: true, urgent: false })
    expect(draft.important).toBe(true)
    expect(draft.urgent).toBe(false)
  })
})

describe('resolveTaskAction', () => {
  it('edits the linked task when the block already has a taskId, regardless of chip state', () => {
    expect(resolveTaskAction(5, false, false)).toBe('edit')
    expect(resolveTaskAction(5, true, true)).toBe('edit')
  })

  it('creates a task when there is no taskId but a chip is on', () => {
    expect(resolveTaskAction(null, true, false)).toBe('create')
    expect(resolveTaskAction(null, false, true)).toBe('create')
    expect(resolveTaskAction(null, true, true)).toBe('create')
  })

  it('does nothing when there is no taskId and neither chip is on', () => {
    expect(resolveTaskAction(null, false, false)).toBe('none')
  })
})
