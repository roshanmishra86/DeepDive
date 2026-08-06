import { describe, it, expect } from 'vitest'
import { validateBlockInput, isPomodoroCountValid, ensureMinimumDuration } from './templates-ui'
import type { BlockKind } from '../db/types'

describe('templates-ui library', () => {
  describe('validateBlockInput', () => {
    it('returns no errors for a valid deep block', () => {
      const result = validateBlockInput({
        title: 'Morning focus',
        kind: 'deep',
        startText: '5:00 AM',
        durationText: '90',
      })
      expect(result).toHaveLength(0)
    })

    it('returns no errors for a break block without title', () => {
      const result = validateBlockInput({
        title: '',
        kind: 'break',
        startText: '7:30 AM',
        durationText: '15',
      })
      expect(result).toHaveLength(0)
    })

    it('returns error for non-break block without title', () => {
      const result = validateBlockInput({
        title: '',
        kind: 'deep',
        startText: '5:00 AM',
        durationText: '90',
      })
      expect(result).toContain('Title is required for non-break, non-ritual blocks')
    })

    it('returns error for shallow block with only whitespace title', () => {
      const result = validateBlockInput({
        title: '   ',
        kind: 'shallow',
        startText: '9:00 AM',
        durationText: '60',
      })
      expect(result).toContain('Title is required for non-break, non-ritual blocks')
    })

    it('allows empty title for ritual blocks', () => {
      const result = validateBlockInput({
        title: '',
        kind: 'ritual',
        startText: '5:00 PM',
        durationText: '5',
      })
      expect(result).toHaveLength(0)
    })
  })

  describe('isPomodoroCountValid', () => {
    it('returns true for 0 pomodoros with break block', () => {
      expect(isPomodoroCountValid(0, 15, 'break')).toBe(true)
    })

    it('returns false for non-zero pomodoros with break block', () => {
      expect(isPomodoroCountValid(1, 15, 'break')).toBe(false)
    })

    it('returns true for 0 pomodoros with ritual block', () => {
      expect(isPomodoroCountValid(0, 5, 'ritual')).toBe(true)
    })

    it('returns false for non-zero pomodoros with ritual block', () => {
      expect(isPomodoroCountValid(2, 5, 'ritual')).toBe(false)
    })

    it('returns true for valid pomodoro count with deep block', () => {
      expect(isPomodoroCountValid(3, 90, 'deep')).toBe(true)
    })

    it('returns false for count exceeding max with deep block', () => {
      expect(isPomodoroCountValid(100, 90, 'deep')).toBe(false)
    })

    it('returns true for 0 pomodoros with deep block', () => {
      expect(isPomodoroCountValid(0, 90, 'deep')).toBe(true)
    })

    it('returns false for negative pomodoro count', () => {
      expect(isPomodoroCountValid(-1, 90, 'deep')).toBe(false)
    })

    it('returns true for max pomodoros with shallow block', () => {
      const duration = 60
      const kinds: BlockKind[] = ['shallow', 'deep']
      for (const kind of kinds) {
        const max = Math.floor(duration / 25)
        expect(isPomodoroCountValid(max, duration, kind)).toBe(true)
      }
    })
  })

  describe('ensureMinimumDuration', () => {
    it('returns input duration if >= minimum', () => {
      expect(ensureMinimumDuration(90, 'deep')).toBe(90)
    })

    it('returns minimum duration if input is below', () => {
      expect(ensureMinimumDuration(15, 'deep')).toBe(30)
    })

    it('respects minimum for shallow blocks', () => {
      expect(ensureMinimumDuration(20, 'shallow')).toBe(30)
    })

    it('allows small durations for break blocks', () => {
      expect(ensureMinimumDuration(5, 'break')).toBe(5)
    })

    it('enforces minimum for ritual blocks', () => {
      expect(ensureMinimumDuration(1, 'ritual')).toBe(5)
    })

    it('returns exact minimum when input is exactly minimum', () => {
      expect(ensureMinimumDuration(30, 'deep')).toBe(30)
    })
  })
})
