import { describe, it, expect } from 'vitest'
import { formatRelativeLabel } from './relativeTime'

describe('formatRelativeLabel', () => {
  // Reference time for all tests: August 12, 2026, 14:30:00
  const now = new Date(2026, 7, 12, 14, 30, 0)

  describe('invalid input', () => {
    it('returns empty string for empty input', () => {
      expect(formatRelativeLabel('', now)).toBe('')
    })

    it('returns empty string for nonsense input', () => {
      expect(formatRelativeLabel('not a date', now)).toBe('')
    })

    it('returns empty string for invalid ISO format', () => {
      expect(formatRelativeLabel('2026-13-32T25:70:70Z', now)).toBe('')
    })
  })

  describe('future and "just now" boundary', () => {
    it('returns "just now" for future instant (negative delta)', () => {
      const future = new Date(now.getTime() + 1000) // 1 second in the future
      expect(formatRelativeLabel(future.toISOString(), now)).toBe('just now')
    })

    it('returns "just now" for far future instant (clock skew)', () => {
      const farFuture = new Date(now.getTime() + 60000) // 60 seconds in the future
      expect(formatRelativeLabel(farFuture.toISOString(), now)).toBe('just now')
    })

    it('returns "just now" for exactly now', () => {
      expect(formatRelativeLabel(now.toISOString(), now)).toBe('just now')
    })

    it('returns "just now" for 30 seconds ago', () => {
      const thirtySecsAgo = new Date(now.getTime() - 30000)
      expect(formatRelativeLabel(thirtySecsAgo.toISOString(), now)).toBe('just now')
    })

    it('returns "just now" for 59 seconds ago', () => {
      const fiftyNineSecsAgo = new Date(now.getTime() - 59000)
      expect(formatRelativeLabel(fiftyNineSecsAgo.toISOString(), now)).toBe('just now')
    })
  })

  describe('minutes boundary', () => {
    it('returns "1 minute ago" for exactly 60 seconds ago', () => {
      const oneMinAgo = new Date(now.getTime() - 60000)
      expect(formatRelativeLabel(oneMinAgo.toISOString(), now)).toBe('1 minute ago')
    })

    it('returns singular "1 minute ago" for just over 60 seconds', () => {
      const justOver = new Date(now.getTime() - 61000)
      expect(formatRelativeLabel(justOver.toISOString(), now)).toBe('1 minute ago')
    })

    it('returns plural "2 minutes ago" for 120 seconds ago', () => {
      const twoMinsAgo = new Date(now.getTime() - 120000)
      expect(formatRelativeLabel(twoMinsAgo.toISOString(), now)).toBe('2 minutes ago')
    })

    it('returns "59 minutes ago" for 59 minutes ago', () => {
      const fiftyNineMinsAgo = new Date(now.getTime() - 59 * 60000)
      expect(formatRelativeLabel(fiftyNineMinsAgo.toISOString(), now)).toBe('59 minutes ago')
    })
  })

  describe('hours boundary', () => {
    it('returns "1 hour ago" for exactly 60 minutes ago', () => {
      const oneHourAgo = new Date(now.getTime() - 60 * 60000)
      expect(formatRelativeLabel(oneHourAgo.toISOString(), now)).toBe('1 hour ago')
    })

    it('returns singular "1 hour ago" for just over 60 minutes', () => {
      const oneHourPlus = new Date(now.getTime() - 61 * 60000)
      expect(formatRelativeLabel(oneHourPlus.toISOString(), now)).toBe('1 hour ago')
    })

    it('returns plural "2 hours ago" for 120 minutes ago', () => {
      const twoHoursAgo = new Date(now.getTime() - 120 * 60000)
      expect(formatRelativeLabel(twoHoursAgo.toISOString(), now)).toBe('2 hours ago')
    })

    it('returns "23 hours ago" for 23 hours ago', () => {
      const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 3600000)
      expect(formatRelativeLabel(twentyThreeHoursAgo.toISOString(), now)).toBe('23 hours ago')
    })
  })

  describe('days boundary', () => {
    it('returns "1 day ago" for exactly 24 hours ago', () => {
      const oneDayAgo = new Date(now.getTime() - 24 * 3600000)
      expect(formatRelativeLabel(oneDayAgo.toISOString(), now)).toBe('1 day ago')
    })

    it('returns singular "1 day ago" for just over 24 hours', () => {
      const oneDayPlus = new Date(now.getTime() - 25 * 3600000)
      expect(formatRelativeLabel(oneDayPlus.toISOString(), now)).toBe('1 day ago')
    })

    it('returns plural "2 days ago" for 48 hours ago', () => {
      const twoDaysAgo = new Date(now.getTime() - 48 * 3600000)
      expect(formatRelativeLabel(twoDaysAgo.toISOString(), now)).toBe('2 days ago')
    })

    it('returns "6 days ago" for 6 days ago', () => {
      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 3600000)
      expect(formatRelativeLabel(sixDaysAgo.toISOString(), now)).toBe('6 days ago')
    })
  })

  describe('absolute date fallback', () => {
    it('returns absolute date for exactly 7 days ago', () => {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600000)
      expect(formatRelativeLabel(sevenDaysAgo.toISOString(), now)).toBe('on 5 August 2026')
    })

    it('returns absolute date for more than 7 days ago', () => {
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600000)
      expect(formatRelativeLabel(twoWeeksAgo.toISOString(), now)).toBe('on 29 July 2026')
    })

    it('returns absolute date for a month ago', () => {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 3600000)
      expect(formatRelativeLabel(oneMonthAgo.toISOString(), now)).toBe('on 13 July 2026')
    })

    it('formats date with correct month name', () => {
      const january = new Date(2026, 0, 15, 14, 30, 0) // January 15
      const referenceDate = new Date(2026, 7, 12, 14, 30, 0) // August 12
      expect(formatRelativeLabel(january.toISOString(), referenceDate)).toBe('on 15 January 2026')
    })

    it('formats December correctly', () => {
      const december = new Date(2025, 11, 25, 10, 0, 0) // December 25, 2025
      const referenceDate = new Date(2026, 7, 12, 14, 30, 0) // August 12, 2026
      expect(formatRelativeLabel(december.toISOString(), referenceDate)).toBe('on 25 December 2025')
    })

    it('preserves leading digit in date', () => {
      const earlyMonth = new Date(2026, 5, 3, 10, 0, 0) // June 3, 2026
      const referenceDate = new Date(2026, 7, 12, 14, 30, 0)
      expect(formatRelativeLabel(earlyMonth.toISOString(), referenceDate)).toBe('on 3 June 2026')
    })

    it('preserves double-digit date', () => {
      const midMonth = new Date(2026, 5, 15, 10, 0, 0) // June 15, 2026
      const referenceDate = new Date(2026, 7, 12, 14, 30, 0)
      expect(formatRelativeLabel(midMonth.toISOString(), referenceDate)).toBe('on 15 June 2026')
    })
  })

  describe('floor division (whole units only)', () => {
    it('floors minutes: 119 seconds is "1 minute ago", not "2 minutes ago"', () => {
      const oneMinPlus = new Date(now.getTime() - 119000) // 119 seconds
      expect(formatRelativeLabel(oneMinPlus.toISOString(), now)).toBe('1 minute ago')
    })

    it('floors hours: 119 minutes is "1 hour ago", not "2 hours ago"', () => {
      const oneHourPlus = new Date(now.getTime() - 119 * 60000) // 119 minutes
      expect(formatRelativeLabel(oneHourPlus.toISOString(), now)).toBe('1 hour ago')
    })

    it('floors days: 47 hours is "1 day ago", not "2 days ago"', () => {
      const oneDayPlus = new Date(now.getTime() - 47 * 3600000) // 47 hours
      expect(formatRelativeLabel(oneDayPlus.toISOString(), now)).toBe('1 day ago')
    })
  })
})
