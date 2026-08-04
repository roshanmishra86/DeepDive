import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useTimerStore,
  FOCUS_SEC,
  REST_SEC,
  POMODOROS_PER_BLOCK,
  pomodoroCounterLabel,
} from './timer'

describe('useTimerStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useTimerStore.setState({
      phase: 'focus',
      totalSec: FOCUS_SEC,
      remainingSec: FOCUS_SEC,
      running: false,
      endsAt: null,
      pomodorosDone: 0,
      pomodorosPerBlock: POMODOROS_PER_BLOCK,
    })
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
      useTimerStore.setState({
        phase: 'rest',
        totalSec: 300,
        remainingSec: 300,
        pomodorosDone: 2,
      })
      useTimerStore.getState().start()
      const endsAt = useTimerStore.getState().endsAt!
      useTimerStore.getState().tick(endsAt + 1000)
      expect(useTimerStore.getState().pomodorosDone).toBe(2)
    })

    it('keeps phase as "rest" when rest ends', () => {
      vi.setSystemTime(1000000)
      useTimerStore.setState({ phase: 'rest', totalSec: 300, remainingSec: 300 })
      useTimerStore.getState().start()
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
