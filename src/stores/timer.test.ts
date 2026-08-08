import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import type { DayBlock, Track } from '../db/types'
import * as blocksRepo from '../db/repos/blocks'
import * as sessionsRepo from '../db/repos/sessions'
import {
  useTimerStore,
  FOCUS_SEC,
  REST_SEC,
  POMODOROS_PER_BLOCK,
  pomodoroCounterLabel,
} from './timer'
import { usePlayerStore, injectAudioElementForTests } from './player'
import { useLibraryStore } from './library'

function resetTimerStore() {
  // Merge setState, never replace: true (which would drop the actions).
  useTimerStore.setState({
    phase: 'focus',
    totalSec: FOCUS_SEC,
    remainingSec: FOCUS_SEC,
    running: false,
    endsAt: null,
    pomodorosDone: 0,
    pomodorosPerBlock: POMODOROS_PER_BLOCK,
    blockId: null,
    blockTitle: null,
    blockStartMin: null,
    blockDurationMin: null,
    blockQuiet: false,
    openSessionId: null,
  })
}

describe('useTimerStore', () => {
  beforeEach(async () => {
    resetTimerStore()
    // Clear any driver reference leaked by a previous test.
    await useTimerStore.getState().hydrate(null)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('has correct focus duration (1500s = 25min)', () => {
      expect(FOCUS_SEC).toBe(1500)
    })

    it('has correct rest duration (300s = 5min)', () => {
      expect(REST_SEC).toBe(300)
    })

    it('has 3 pomodoros per block', () => {
      expect(POMODOROS_PER_BLOCK).toBe(3)
    })

    it('starts in focus phase', () => {
      expect(useTimerStore.getState().phase).toBe('focus')
    })

    it('starts with full focus time remaining', () => {
      expect(useTimerStore.getState().remainingSec).toBe(1500)
      expect(useTimerStore.getState().totalSec).toBe(1500)
    })

    it('starts not running', () => {
      expect(useTimerStore.getState().running).toBe(false)
    })

    it('starts with no end time', () => {
      expect(useTimerStore.getState().endsAt).toBe(null)
    })

    it('starts with zero pomodoros done', () => {
      expect(useTimerStore.getState().pomodorosDone).toBe(0)
    })
  })

  describe('start', () => {
    it('sets running to true', () => {
      useTimerStore.getState().start()
      expect(useTimerStore.getState().running).toBe(true)
    })

    it('sets endsAt to a future timestamp', () => {
      vi.setSystemTime(1000000)
      useTimerStore.getState().start()
      const endsAt = useTimerStore.getState().endsAt
      expect(endsAt).not.toBeNull()
      expect(endsAt).toBeGreaterThan(1000000)
    })

    it('uses remainingSec if > 0', () => {
      // Manually set remaining to a specific value
      useTimerStore.setState({ remainingSec: 500 })
      vi.setSystemTime(1000000)
      useTimerStore.getState().start()
      const endsAt = useTimerStore.getState().endsAt!
      // endsAt should be 1000000 + 500*1000 = 1000500000
      expect(endsAt).toBe(1000000 + 500 * 1000)
    })

    it('falls back to totalSec if remainingSec is 0', () => {
      useTimerStore.setState({ remainingSec: 0, totalSec: 1500 })
      vi.setSystemTime(2000000)
      useTimerStore.getState().start()
      const endsAt = useTimerStore.getState().endsAt!
      // endsAt should be 2000000 + 1500*1000 = 3500000
      expect(endsAt).toBe(2000000 + 1500 * 1000)
    })
  })

  describe('pause', () => {
    it('sets running to false', () => {
      useTimerStore.getState().start()
      useTimerStore.getState().pause()
      expect(useTimerStore.getState().running).toBe(false)
    })

    it('clears endsAt', () => {
      useTimerStore.getState().start()
      useTimerStore.getState().pause()
      expect(useTimerStore.getState().endsAt).toBe(null)
    })

    it('updates remainingSec based on time elapsed', () => {
      vi.setSystemTime(1000000)
      useTimerStore.getState().start()
      // Verify timer started and has deadline
      expect(useTimerStore.getState().endsAt).not.toBeNull()
      // Fast forward 500 seconds
      vi.setSystemTime(1000000 + 500000)
      useTimerStore.getState().pause()
      // Remaining should be roughly 1500 - 500 = 1000
      expect(useTimerStore.getState().remainingSec).toBe(1000)
    })

    it('does nothing if not running', () => {
      useTimerStore.setState({ running: false, endsAt: null })
      useTimerStore.getState().pause()
      expect(useTimerStore.getState().running).toBe(false)
      expect(useTimerStore.getState().endsAt).toBe(null)
    })

    it('does nothing if endsAt is null', () => {
      useTimerStore.setState({ running: true, endsAt: null })
      useTimerStore.getState().pause()
      expect(useTimerStore.getState().running).toBe(true)
    })
  })

  describe('toggle', () => {
    it('starts a paused timer', () => {
      expect(useTimerStore.getState().running).toBe(false)
      useTimerStore.getState().toggle()
      expect(useTimerStore.getState().running).toBe(true)
    })

    it('pauses a running timer', () => {
      useTimerStore.getState().start()
      expect(useTimerStore.getState().running).toBe(true)
      useTimerStore.getState().toggle()
      expect(useTimerStore.getState().running).toBe(false)
    })

    it('can toggle multiple times', () => {
      useTimerStore.getState().toggle()
      expect(useTimerStore.getState().running).toBe(true)
      useTimerStore.getState().toggle()
      expect(useTimerStore.getState().running).toBe(false)
      useTimerStore.getState().toggle()
      expect(useTimerStore.getState().running).toBe(true)
    })
  })

  describe('tick', () => {
    it('is a no-op when not running', () => {
      vi.setSystemTime(1000000)
      useTimerStore.setState({ running: false })
      const remainingBefore = useTimerStore.getState().remainingSec
      useTimerStore.getState().tick(1000000 + 100000)
      const remainingAfter = useTimerStore.getState().remainingSec
      expect(remainingBefore).toBe(remainingAfter)
    })

    it('is a no-op when endsAt is null', () => {
      useTimerStore.setState({ running: true, endsAt: null })
      const remainingBefore = useTimerStore.getState().remainingSec
      useTimerStore.getState().tick(1000000)
      const remainingAfter = useTimerStore.getState().remainingSec
      expect(remainingBefore).toBe(remainingAfter)
    })

    it('updates remainingSec based on wall-clock time', () => {
      vi.setSystemTime(1000000)
      useTimerStore.getState().start()
      const startEndsAt = useTimerStore.getState().endsAt
      // Fast-forward 500 seconds
      useTimerStore.getState().tick(1000000 + 500000)
      // Remaining should drop by 500 seconds
      expect(useTimerStore.getState().remainingSec).toBe(1000)
      // Verify endsAt was set during start
      expect(startEndsAt).not.toBeNull()
    })

    it('handles large time jumps correctly', () => {
      vi.setSystemTime(1000000)
      useTimerStore.setState({ totalSec: 1500, remainingSec: 1500 })
      useTimerStore.getState().start()
      // Verify endsAt is set correctly
      expect(useTimerStore.getState().endsAt).toBe(1000000 + 1500 * 1000)
      // Jump forward by 800 seconds in a single tick
      useTimerStore.getState().tick(1000000 + 800000)
      // Should have 1500 - 800 = 700 seconds remaining
      expect(useTimerStore.getState().remainingSec).toBe(700)
    })

    it('keeps remaining > 0 when time is left', () => {
      vi.setSystemTime(1000000)
      useTimerStore.getState().start()
      useTimerStore.getState().tick(1000000 + 100000)
      expect(useTimerStore.getState().remainingSec).toBeGreaterThan(0)
      expect(useTimerStore.getState().running).toBe(true)
    })

    it('stops timer when focus phase hits zero', () => {
      vi.setSystemTime(1000000)
      useTimerStore.setState({ phase: 'focus', totalSec: 1500, remainingSec: 1500 })
      useTimerStore.getState().start()
      const endsAt = useTimerStore.getState().endsAt!
      // Tick past the end time
      useTimerStore.getState().tick(endsAt + 1000)
      expect(useTimerStore.getState().running).toBe(false)
      expect(useTimerStore.getState().endsAt).toBe(null)
      expect(useTimerStore.getState().remainingSec).toBe(0)
    })

    it('increments pomodorosDone when focus phase ends', () => {
      vi.setSystemTime(1000000)
      useTimerStore.setState({
        phase: 'focus',
        totalSec: 1500,
        remainingSec: 1500,
        pomodorosDone: 0,
      })
      useTimerStore.getState().start()
      const endsAt = useTimerStore.getState().endsAt!
      useTimerStore.getState().tick(endsAt + 1000)
      expect(useTimerStore.getState().pomodorosDone).toBe(1)
    })

    it('keeps phase as "focus" when focus ends (no auto-transition)', () => {
      vi.setSystemTime(1000000)
      useTimerStore.setState({ phase: 'focus', totalSec: 1500, remainingSec: 1500 })
      useTimerStore.getState().start()
      const endsAt = useTimerStore.getState().endsAt!
      useTimerStore.getState().tick(endsAt + 1000)
      expect(useTimerStore.getState().phase).toBe('focus')
    })

    it('does NOT increment pomodorosDone when rest phase ends', () => {
      vi.setSystemTime(1000000)
      useTimerStore.setState({ pomodorosDone: 2 })
      useTimerStore.getState().rest()
      const endsAt = useTimerStore.getState().endsAt!
      useTimerStore.getState().tick(endsAt + 1000)
      expect(useTimerStore.getState().pomodorosDone).toBe(2)
    })

    it('keeps phase as "rest" when rest ends', () => {
      vi.setSystemTime(1000000)
      useTimerStore.getState().rest()
      const endsAt = useTimerStore.getState().endsAt!
      useTimerStore.getState().tick(endsAt + 1000)
      expect(useTimerStore.getState().phase).toBe('rest')
    })

    it('uses Date.now() by default', () => {
      vi.setSystemTime(5000000)
      useTimerStore.getState().start()
      // Call tick without argument - should use Date.now()
      useTimerStore.getState().tick()
      // Should not crash and should calculate based on Date.now()
      const remaining = useTimerStore.getState().remainingSec
      expect(remaining).toBeLessThanOrEqual(1500)
      expect(remaining).toBeGreaterThanOrEqual(0)
    })
  })

  describe('rest', () => {
    it('switches to rest phase', () => {
      useTimerStore.getState().rest()
      expect(useTimerStore.getState().phase).toBe('rest')
    })

    it('sets totalSec to REST_SEC (300)', () => {
      useTimerStore.getState().rest()
      expect(useTimerStore.getState().totalSec).toBe(300)
    })

    it('sets remainingSec to REST_SEC (300)', () => {
      useTimerStore.getState().rest()
      expect(useTimerStore.getState().remainingSec).toBe(300)
    })

    it('starts the timer running', () => {
      useTimerStore.getState().rest()
      expect(useTimerStore.getState().running).toBe(true)
    })

    it('sets endsAt to a future timestamp', () => {
      vi.setSystemTime(1000000)
      useTimerStore.getState().rest()
      const endsAt = useTimerStore.getState().endsAt!
      expect(endsAt).toBe(1000000 + 300 * 1000)
    })

    it('does not reset pomodorosDone', () => {
      useTimerStore.setState({ pomodorosDone: 3 })
      useTimerStore.getState().rest()
      expect(useTimerStore.getState().pomodorosDone).toBe(3)
    })
  })

  describe('reset', () => {
    it('resets phase to "focus"', () => {
      useTimerStore.setState({ phase: 'rest' })
      useTimerStore.getState().reset()
      expect(useTimerStore.getState().phase).toBe('focus')
    })

    it('resets totalSec to FOCUS_SEC (1500)', () => {
      useTimerStore.setState({ totalSec: 300 })
      useTimerStore.getState().reset()
      expect(useTimerStore.getState().totalSec).toBe(1500)
    })

    it('resets remainingSec to FOCUS_SEC (1500)', () => {
      useTimerStore.setState({ remainingSec: 100 })
      useTimerStore.getState().reset()
      expect(useTimerStore.getState().remainingSec).toBe(1500)
    })

    it('sets running to false', () => {
      useTimerStore.setState({ running: true })
      useTimerStore.getState().reset()
      expect(useTimerStore.getState().running).toBe(false)
    })

    it('clears endsAt', () => {
      useTimerStore.setState({ endsAt: 999999 })
      useTimerStore.getState().reset()
      expect(useTimerStore.getState().endsAt).toBe(null)
    })

    it('resets pomodorosDone to 0', () => {
      useTimerStore.setState({ pomodorosDone: 5 })
      useTimerStore.getState().reset()
      expect(useTimerStore.getState().pomodorosDone).toBe(0)
    })

    it('restores complete initial state', () => {
      useTimerStore.setState({
        phase: 'rest',
        totalSec: 300,
        remainingSec: 50,
        running: true,
        endsAt: 999999,
        pomodorosDone: 3,
      })
      useTimerStore.getState().reset()
      const state = useTimerStore.getState()
      expect(state.phase).toBe('focus')
      expect(state.totalSec).toBe(1500)
      expect(state.remainingSec).toBe(1500)
      expect(state.running).toBe(false)
      expect(state.endsAt).toBe(null)
      expect(state.pomodorosDone).toBe(0)
    })
  })

  describe('restart after reaching zero', () => {
    it('restarts with full totalSec when remainingSec is 0', () => {
      vi.setSystemTime(1000000)
      useTimerStore.setState({ totalSec: 1500, remainingSec: 1500 })
      useTimerStore.getState().start()
      const endsAt = useTimerStore.getState().endsAt!
      // Tick past end time to bring remainingSec to 0
      useTimerStore.getState().tick(endsAt + 1000)
      expect(useTimerStore.getState().remainingSec).toBe(0)
      // Now start again
      vi.setSystemTime(2000000)
      useTimerStore.getState().start()
      // Should restart with full duration
      expect(useTimerStore.getState().remainingSec).toBe(1500)
      const newEndsAt = useTimerStore.getState().endsAt!
      expect(newEndsAt).toBe(2000000 + 1500 * 1000)
    })
  })
})

describe('pomodoroCounterLabel', () => {
  it('shows "1 / 3" at the start', () => {
    expect(pomodoroCounterLabel(0, 3)).toBe('1 / 3')
  })

  it('shows "2 / 3" after first pomodoro', () => {
    expect(pomodoroCounterLabel(1, 3)).toBe('2 / 3')
  })

  it('shows "3 / 3" after two pomodoros', () => {
    expect(pomodoroCounterLabel(2, 3)).toBe('3 / 3')
  })

  it('clamps to perBlock when done exceeds it', () => {
    expect(pomodoroCounterLabel(3, 3)).toBe('3 / 3')
    expect(pomodoroCounterLabel(5, 3)).toBe('3 / 3')
  })

  it('works with different block sizes', () => {
    expect(pomodoroCounterLabel(0, 4)).toBe('1 / 4')
    expect(pomodoroCounterLabel(1, 4)).toBe('2 / 4')
    expect(pomodoroCounterLabel(3, 4)).toBe('4 / 4')
    expect(pomodoroCounterLabel(4, 4)).toBe('4 / 4')
  })

  it('works with block size of 1', () => {
    expect(pomodoroCounterLabel(0, 1)).toBe('1 / 1')
    expect(pomodoroCounterLabel(1, 1)).toBe('1 / 1')
  })
})

/** Minimal HTMLAudioElement stand-in (same shape as player.test.ts's). */
class FakeAudioElement {
  src = ''
  loop = false
  volume = 1
  currentTime = 0
  duration = 0
  paused = true
  preload = ''
  playCalls = 0
  playRejects = false
  error: { code: number } | null = null
  private listeners = new Map<string, Set<() => void>>()

  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn)
  }

  emit(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn()
  }

  play(): Promise<void> {
    if (this.playRejects) {
      return Promise.reject(new DOMException('play failed', 'NotSupportedError'))
    }
    this.playCalls += 1
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    this.paused = true
  }
}

function makeTrack(id: number): Track {
  return {
    id,
    path: `/music/track-${id}.mp3`,
    displayName: `track-${id}`,
    category: 'other',
    durationSec: 3600,
  }
}

function makeCandidate(id: number, overrides: Partial<DayBlock> = {}): DayBlock {
  return {
    id,
    day: '2026-08-10',
    taskId: null,
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

function resetPlayerStore() {
  usePlayerStore.setState({
    trackId: null,
    trackName: null,
    trackMeta: null,
    playing: false,
    volume: 70,
    positionSec: 0,
    durationSec: 0,
    missing: false,
    restPaused: false,
  })
}

function resetLibraryStore() {
  useLibraryStore.setState({
    tracks: [],
    loading: false,
    error: null,
    fadeInSec: 8,
    silenceDuringRest: true,
    loopUntilBlockEnd: true,
  })
}

describe('useTimerStore persistence', () => {
  let driver: SqlDriver
  let fake: FakeAudioElement

  beforeEach(async () => {
    const db = createTestDb()
    driver = db.driver
    resetTimerStore()
    resetPlayerStore()
    resetLibraryStore()
    fake = new FakeAudioElement()
    injectAudioElementForTests(fake as unknown as HTMLAudioElement)
    await usePlayerStore.getState().hydrate(null)
    await useLibraryStore.getState().hydrate(null)
    await useTimerStore.getState().hydrate(driver)
    vi.useFakeTimers()
  })

  afterEach(() => {
    injectAudioElementForTests(null)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fresh start with a candidate attaches and inserts a focus row', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Write the spec',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      pomodoros: 2,
      quiet: true,
    })
    const candidate = makeCandidate(blockId, {
      title: 'Write the spec',
      pomodoros: 2,
      quiet: true,
    })

    await useTimerStore.getState().start(candidate)

    const state = useTimerStore.getState()
    expect(state.blockId).toBe(blockId)
    expect(state.blockTitle).toBe('Write the spec')
    expect(state.blockStartMin).toBe(300)
    expect(state.blockDurationMin).toBe(90)
    expect(state.blockQuiet).toBe(true)
    expect(state.pomodorosPerBlock).toBe(2)
    expect(state.running).toBe(true)

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    expect(rows.length).toBe(1)
    expect(rows[0].blockId).toBe(blockId)
    expect(rows[0].phase).toBe('focus')
    expect(rows[0].endedAt).toBeNull()
    expect(rows[0].completed).toBe(false)
    expect(state.openSessionId).toBe(rows[0].id)
  })

  it('fresh start with a null candidate attaches nothing and inserts an unattached row', async () => {
    vi.setSystemTime(1000000)
    await useTimerStore.getState().start(null)

    const state = useTimerStore.getState()
    expect(state.blockId).toBeNull()
    expect(state.blockTitle).toBeNull()
    expect(state.pomodorosPerBlock).toBe(POMODOROS_PER_BLOCK)

    const rows = await driver.select<{
      block_id: number | null
      phase: string
      ended_at: string | null
      completed: number
    }>('SELECT * FROM pomodoro_session')
    expect(rows.length).toBe(1)
    expect(rows[0].block_id).toBeNull()
    expect(rows[0].phase).toBe('focus')
    expect(rows[0].ended_at).toBeNull()
    expect(rows[0].completed).toBe(0)
  })

  it('pause keeps the row open; continue opens no second row', async () => {
    vi.setSystemTime(1000000)
    await useTimerStore.getState().start(null)

    vi.setSystemTime(1000000 + 60000)
    await useTimerStore.getState().pause()
    expect(useTimerStore.getState().running).toBe(false)

    let rows = await driver.select<{ ended_at: string | null }>(
      'SELECT ended_at FROM pomodoro_session'
    )
    expect(rows.length).toBe(1)
    expect(rows[0].ended_at).toBeNull()

    await useTimerStore.getState().start(null) // resume
    expect(useTimerStore.getState().running).toBe(true)
    rows = await driver.select<{ ended_at: string | null }>(
      'SELECT ended_at FROM pomodoro_session'
    )
    expect(rows.length).toBe(1)
  })

  it('focus tick to zero completes the row with the tick time and counts a pomodoro', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      pomodoros: 3,
    })
    await useTimerStore
      .getState()
      .start(makeCandidate(blockId, { title: 'Deep block', pomodoros: 3 }))

    const endsAt = useTimerStore.getState().endsAt!
    const tickNow = endsAt + 1000
    await useTimerStore.getState().tick(tickNow)

    const state = useTimerStore.getState()
    expect(state.pomodorosDone).toBe(1)
    expect(state.running).toBe(false)
    expect(state.openSessionId).toBeNull()

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    expect(rows.length).toBe(1)
    expect(rows[0].completed).toBe(true)
    expect(rows[0].endedAt).toBe(new Date(tickNow).toISOString())

    // Second pomodoro start (remaining 0 → start) opens a SECOND row; the
    // attachment is unchanged.
    vi.setSystemTime(tickNow + 5000)
    await useTimerStore.getState().start(null)
    const state2 = useTimerStore.getState()
    expect(state2.blockId).toBe(blockId)
    expect(state2.blockTitle).toBe('Deep block')
    expect(state2.pomodorosPerBlock).toBe(3)
    expect(state2.running).toBe(true)

    const rows2 = await sessionsRepo.listSessionsForBlock(driver, blockId)
    expect(rows2.length).toBe(2)
    expect(rows2[1].phase).toBe('focus')
    expect(rows2[1].completed).toBe(false)
    expect(rows2[1].endedAt).toBeNull()
  })

  it('rest() mid-focus abandons the focus row and opens a rest row', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await useTimerStore.getState().start(makeCandidate(blockId))
    await useTimerStore.getState().rest()

    const state = useTimerStore.getState()
    expect(state.phase).toBe('rest')
    expect(state.running).toBe(true)

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    expect(rows.length).toBe(2)
    const focusRow = rows.find((r) => r.phase === 'focus')!
    const restRow = rows.find((r) => r.phase === 'rest')!
    expect(focusRow.completed).toBe(false)
    expect(focusRow.endedAt).not.toBeNull()
    expect(restRow.completed).toBe(false)
    expect(restRow.endedAt).toBeNull()

    // Rest tick to zero completes the rest row.
    const restEndsAt = useTimerStore.getState().endsAt!
    await useTimerStore.getState().tick(restEndsAt + 1000)
    const rows2 = await sessionsRepo.listSessionsForBlock(driver, blockId)
    const restRow2 = rows2.find((r) => r.phase === 'rest')!
    expect(restRow2.completed).toBe(true)
    expect(restRow2.endedAt).toBe(new Date(restEndsAt + 1000).toISOString())
    expect(useTimerStore.getState().pomodorosDone).toBe(0)
  })

  it('start after rest ends switches to focus with the attachment kept and a new row', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      pomodoros: 2,
    })
    await useTimerStore.getState().start(makeCandidate(blockId, { pomodoros: 2 }))
    await useTimerStore.getState().rest()

    // Run the rest to completion.
    const restEndsAt = useTimerStore.getState().endsAt!
    await useTimerStore.getState().tick(restEndsAt + 1000)
    expect(useTimerStore.getState().phase).toBe('rest')
    expect(useTimerStore.getState().remainingSec).toBe(0)

    // Press Start: fresh focus, attachment kept, new focus row.
    vi.setSystemTime(restEndsAt + 60000)
    await useTimerStore.getState().start(null)
    const state = useTimerStore.getState()
    expect(state.phase).toBe('focus')
    expect(state.totalSec).toBe(FOCUS_SEC)
    expect(state.remainingSec).toBe(FOCUS_SEC)
    expect(state.running).toBe(true)
    expect(state.blockId).toBe(blockId)
    expect(state.pomodorosPerBlock).toBe(2)

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    expect(rows.length).toBe(3)
    const focusRows = rows.filter((r) => r.phase === 'focus')
    expect(focusRows.length).toBe(2)
    expect(focusRows[1].completed).toBe(false)
    expect(focusRows[1].endedAt).toBeNull()
  })

  it('toggle on a paused mid-rest timer resumes REST with no new row', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await useTimerStore.getState().start(makeCandidate(blockId))
    await useTimerStore.getState().rest()

    // Pause mid-rest, then toggle to resume.
    vi.setSystemTime(1000000 + 60000)
    await useTimerStore.getState().pause()
    expect(useTimerStore.getState().phase).toBe('rest')
    expect(useTimerStore.getState().running).toBe(false)

    await useTimerStore.getState().toggle(null)
    const state = useTimerStore.getState()
    expect(state.phase).toBe('rest')
    expect(state.running).toBe(true)

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    // Still exactly one focus row + one rest row.
    expect(rows.length).toBe(2)
  })

  it('start → pause within the same second → start resumes the SAME row (no orphan)', async () => {
    // pause() ceils the remaining time, so a pause within the first
    // wall-clock second leaves remainingSec === totalSec even though a row
    // is open. start() must treat that as a resume, not a fresh start —
    // otherwise the open row is dropped without being closed and a second
    // row is inserted for the same run (found in Phase 9 verification).
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await useTimerStore.getState().start(makeCandidate(blockId))
    await useTimerStore.getState().pause()
    expect(useTimerStore.getState().remainingSec).toBe(FOCUS_SEC)
    expect(useTimerStore.getState().openSessionId).not.toBeNull()

    await useTimerStore.getState().start(makeCandidate(blockId))
    expect(useTimerStore.getState().running).toBe(true)

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    expect(rows.length).toBe(1)
    expect(rows[0].endedAt).toBeNull()
    expect(useTimerStore.getState().openSessionId).toBe(rows[0].id)
  })

  it('toggle on an instantly-paused rest resumes the rest (no abandon, no focus jump)', async () => {
    // Same sub-second pause case, but in the rest phase: the paused rest is
    // resumed rather than abandoned into a fresh focus.
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await useTimerStore.getState().start(makeCandidate(blockId))
    await useTimerStore.getState().rest()
    await useTimerStore.getState().pause()
    expect(useTimerStore.getState().remainingSec).toBe(REST_SEC)

    await useTimerStore.getState().toggle(null)
    const state = useTimerStore.getState()
    expect(state.phase).toBe('rest')
    expect(state.running).toBe(true)

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    // One abandoned focus row + ONE rest row still open.
    expect(rows.length).toBe(2)
    const restRow = rows.find((r) => r.phase === 'rest')!
    expect(restRow.endedAt).toBeNull()
    expect(state.openSessionId).toBe(restRow.id)
  })

  it('reset abandons the open row and clears attachment, counter and target', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      pomodoros: 2,
    })
    await useTimerStore.getState().start(makeCandidate(blockId, { pomodoros: 2 }))
    await useTimerStore.getState().reset()

    const state = useTimerStore.getState()
    expect(state.phase).toBe('focus')
    expect(state.running).toBe(false)
    expect(state.pomodorosDone).toBe(0)
    expect(state.pomodorosPerBlock).toBe(POMODOROS_PER_BLOCK)
    expect(state.blockId).toBeNull()
    expect(state.blockTitle).toBeNull()
    expect(state.blockStartMin).toBeNull()
    expect(state.blockDurationMin).toBeNull()
    expect(state.blockQuiet).toBe(false)
    expect(state.openSessionId).toBeNull()

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    expect(rows.length).toBe(1)
    expect(rows[0].completed).toBe(false)
    expect(rows[0].endedAt).not.toBeNull()
  })

  it('survives a window minimise: one tick after 26 idle minutes completes the pomodoro', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(driver, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await useTimerStore.getState().start(makeCandidate(blockId))

    // Window minimised: no ticks for 26 minutes, then a single tick.
    vi.setSystemTime(1000000 + 26 * 60 * 1000)
    await useTimerStore.getState().tick()

    const state = useTimerStore.getState()
    expect(state.pomodorosDone).toBe(1)
    expect(state.remainingSec).toBe(0)
    expect(state.running).toBe(false)

    const rows = await sessionsRepo.listSessionsForBlock(driver, blockId)
    expect(rows.length).toBe(1)
    expect(rows[0].completed).toBe(true)
  })

  it('works fully in-memory with a null driver', async () => {
    await useTimerStore.getState().hydrate(null)
    vi.setSystemTime(1000000)
    await useTimerStore.getState().start(makeCandidate(42))
    const endsAt = useTimerStore.getState().endsAt!
    await useTimerStore.getState().tick(endsAt + 1000)
    expect(useTimerStore.getState().pomodorosDone).toBe(1)
    expect(useTimerStore.getState().blockId).toBe(42)
  })

  it('a failing driver never breaks the timer (state stays correct, errors logged)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingDriver: SqlDriver = {
      execute: () => Promise.reject(new Error('disk full')),
      select: <T,>() => Promise.resolve([] as T[]),
      transaction: () => Promise.reject(new Error('disk full')),
    }
    await useTimerStore.getState().hydrate(failingDriver)

    vi.setSystemTime(1000000)
    await useTimerStore.getState().start(makeCandidate(7))
    expect(useTimerStore.getState().running).toBe(true)

    const endsAt = useTimerStore.getState().endsAt!
    await useTimerStore.getState().tick(endsAt + 1000)
    expect(useTimerStore.getState().pomodorosDone).toBe(1)
    expect(consoleSpy).toHaveBeenCalled()
  })

  describe('silence during rest', () => {
    it('rest() pauses a playing track when silenceDuringRest is on; rest end resumes it', async () => {
      useLibraryStore.setState({ silenceDuringRest: true, fadeInSec: 0 })
      await usePlayerStore.getState().playTrack(makeTrack(1))
      expect(usePlayerStore.getState().playing).toBe(true)
      expect(fake.paused).toBe(false)

      vi.setSystemTime(1000000)
      await useTimerStore.getState().start(null)
      await useTimerStore.getState().rest()

      expect(fake.paused).toBe(true)
      expect(usePlayerStore.getState().playing).toBe(false)
      expect(usePlayerStore.getState().restPaused).toBe(true)

      // Rest elapses: playback resumes.
      const restEndsAt = useTimerStore.getState().endsAt!
      await useTimerStore.getState().tick(restEndsAt + 1000)
      expect(usePlayerStore.getState().restPaused).toBe(false)
      expect(usePlayerStore.getState().playing).toBe(true)
      expect(fake.paused).toBe(false)
    })

    it('rest() does NOT pause when silenceDuringRest is off', async () => {
      useLibraryStore.setState({ silenceDuringRest: false, fadeInSec: 0 })
      await usePlayerStore.getState().playTrack(makeTrack(1))

      vi.setSystemTime(1000000)
      await useTimerStore.getState().start(null)
      await useTimerStore.getState().rest()

      expect(fake.paused).toBe(false)
      expect(usePlayerStore.getState().playing).toBe(true)
      expect(usePlayerStore.getState().restPaused).toBe(false)
    })

    it('a user-paused player is never auto-resumed at rest end', async () => {
      useLibraryStore.setState({ silenceDuringRest: true, fadeInSec: 0 })
      await usePlayerStore.getState().playTrack(makeTrack(1))
      await usePlayerStore.getState().togglePlay() // user pause
      expect(usePlayerStore.getState().playing).toBe(false)
      const playCallsBefore = fake.playCalls

      vi.setSystemTime(1000000)
      await useTimerStore.getState().start(null)
      await useTimerStore.getState().rest()
      // rest() did not mark restPaused (we did not pause).
      expect(usePlayerStore.getState().restPaused).toBe(false)

      const restEndsAt = useTimerStore.getState().endsAt!
      await useTimerStore.getState().tick(restEndsAt + 1000)
      expect(usePlayerStore.getState().playing).toBe(false)
      expect(fake.playCalls).toBe(playCallsBefore)
    })

    it('reset() resumes a rest-paused player', async () => {
      useLibraryStore.setState({ silenceDuringRest: true, fadeInSec: 0 })
      await usePlayerStore.getState().playTrack(makeTrack(1))

      vi.setSystemTime(1000000)
      await useTimerStore.getState().start(null)
      await useTimerStore.getState().rest()
      expect(usePlayerStore.getState().restPaused).toBe(true)

      await useTimerStore.getState().reset()
      expect(usePlayerStore.getState().restPaused).toBe(false)
      expect(usePlayerStore.getState().playing).toBe(true)
      expect(fake.paused).toBe(false)
    })

    it('start after rest ends resumes a rest-paused player', async () => {
      useLibraryStore.setState({ silenceDuringRest: true, fadeInSec: 0 })
      await usePlayerStore.getState().playTrack(makeTrack(1))

      vi.setSystemTime(1000000)
      await useTimerStore.getState().start(null)
      await useTimerStore.getState().rest()
      expect(usePlayerStore.getState().restPaused).toBe(true)

      // Press Start while the rest is still fresh (defensive path): fresh
      // focus begins and the sound returns.
      await useTimerStore.getState().start(null)
      expect(useTimerStore.getState().phase).toBe('focus')
      expect(usePlayerStore.getState().restPaused).toBe(false)
      expect(usePlayerStore.getState().playing).toBe(true)
    })
  })
})
