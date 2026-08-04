import { describe, it, expect } from 'vitest'
import {
  formatClock,
  formatTitleDate,
  toDayKey,
  fromDayKey,
  addDays,
  startOfWeek,
  minutesToClock,
  formatDuration,
  splitDeepHours,
} from './time'

describe('formatClock', () => {
  it('formats zero seconds as 0:00', () => {
    expect(formatClock(0)).toBe('0:00')
  })

  it('formats sub-minute values (< 60 seconds)', () => {
    expect(formatClock(30)).toBe('0:30')
    expect(formatClock(45)).toBe('0:45')
    expect(formatClock(59)).toBe('0:59')
  })

  it('formats exactly 60 seconds as 1:00', () => {
    expect(formatClock(60)).toBe('1:00')
  })

  it('formats 1500 seconds (25 minutes) as 25:00', () => {
    expect(formatClock(1500)).toBe('25:00')
  })

  it('formats values over an hour', () => {
    expect(formatClock(3600)).toBe('60:00')
    expect(formatClock(3661)).toBe('61:01')
  })

  it('clamps negative values to 0', () => {
    expect(formatClock(-1)).toBe('0:00')
    expect(formatClock(-100)).toBe('0:00')
  })

  it('rounds decimal values', () => {
    expect(formatClock(30.4)).toBe('0:30')
    expect(formatClock(30.5)).toBe('0:31')
    expect(formatClock(1500.6)).toBe('25:01')
  })

  it('pads seconds with leading zero', () => {
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(125)).toBe('2:05')
  })
})

describe('formatTitleDate', () => {
  it('formats a Sunday correctly', () => {
    const sunDate = new Date(2025, 0, 5) // January 5, 2025 is a Sunday
    expect(formatTitleDate(sunDate)).toBe('Sunday, 5 January')
  })

  it('formats a Wednesday correctly', () => {
    const wedDate = new Date(2025, 0, 1) // January 1, 2025 is a Wednesday
    expect(formatTitleDate(wedDate)).toBe('Wednesday, 1 January')
  })

  it('formats dates with double-digit dates', () => {
    const date = new Date(2025, 0, 15) // January 15, 2025
    expect(formatTitleDate(date)).toBe('Wednesday, 15 January')
  })

  it('formats December dates correctly', () => {
    const decDate = new Date(2024, 11, 25) // December 25, 2024
    expect(formatTitleDate(decDate)).toBe('Wednesday, 25 December')
  })

  it('formats all weekdays', () => {
    const dates = [
      [new Date(2025, 0, 5), 'Sunday'],      // Sunday
      [new Date(2025, 0, 6), 'Monday'],      // Monday
      [new Date(2025, 0, 7), 'Tuesday'],     // Tuesday
      [new Date(2025, 0, 8), 'Wednesday'],   // Wednesday
      [new Date(2025, 0, 9), 'Thursday'],    // Thursday
      [new Date(2025, 0, 10), 'Friday'],     // Friday
      [new Date(2025, 0, 11), 'Saturday'],   // Saturday
    ]
    dates.forEach(([date, expectedDay]) => {
      const result = formatTitleDate(date as Date)
      expect(result).toContain(expectedDay as string)
    })
  })

  it('formats all months', () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    months.forEach((month, monthIndex) => {
      const date = new Date(2025, monthIndex, 1)
      const result = formatTitleDate(date)
      expect(result).toContain(month)
    })
  })
})

describe('toDayKey', () => {
  it('formats a date as YYYY-MM-DD using local time', () => {
    const date = new Date(2026, 7, 3) // August 3, 2026
    expect(toDayKey(date)).toBe('2026-08-03')
  })

  it('pads month and day with zeros', () => {
    const date = new Date(2026, 0, 1) // January 1, 2026
    expect(toDayKey(date)).toBe('2026-01-01')
  })

  it('handles December correctly', () => {
    const date = new Date(2025, 11, 25) // December 25, 2025
    expect(toDayKey(date)).toBe('2025-12-25')
  })

  it('is local-time correct (does not use UTC)', () => {
    // Create a date late in the evening in local time
    const date = new Date(2026, 7, 3, 23, 30, 0)
    const key = toDayKey(date)
    // Should be 2026-08-03, not shifted to the next day
    expect(key).toBe('2026-08-03')
  })
})

describe('fromDayKey', () => {
  it('parses YYYY-MM-DD to a Date at local midnight', () => {
    const date = fromDayKey('2026-08-03')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(7) // August (0-indexed)
    expect(date.getDate()).toBe(3)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
    expect(date.getSeconds()).toBe(0)
  })

  it('round-trips with toDayKey', () => {
    const original = new Date(2026, 7, 15, 12, 30, 0)
    const key = toDayKey(original)
    const restored = fromDayKey(key)
    expect(restored.toDateString()).toBe(new Date(2026, 7, 15).toDateString())
  })
})

describe('addDays', () => {
  it('adds positive days', () => {
    const date = new Date(2026, 7, 3)
    const result = addDays(date, 5)
    expect(result.getDate()).toBe(8)
  })

  it('subtracts via negative days', () => {
    const date = new Date(2026, 7, 10)
    const result = addDays(date, -3)
    expect(result.getDate()).toBe(7)
  })

  it('handles month boundaries', () => {
    const date = new Date(2026, 7, 28) // August 28
    const result = addDays(date, 5)
    expect(result.getMonth()).toBe(8) // September
    expect(result.getDate()).toBe(2)
  })

  it('does not mutate the original', () => {
    const date = new Date(2026, 7, 3)
    const original = date.getTime()
    addDays(date, 10)
    expect(date.getTime()).toBe(original)
  })
})

describe('startOfWeek', () => {
  it('returns Monday for a Monday', () => {
    const monday = new Date(2026, 7, 3) // August 3, 2026 is a Monday
    const result = startOfWeek(monday)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(3)
  })

  it('returns Monday for a Wednesday', () => {
    const wednesday = new Date(2026, 7, 5)
    const result = startOfWeek(wednesday)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(3)
  })

  it('returns Monday for a Sunday', () => {
    const sunday = new Date(2026, 7, 9) // August 9 is a Sunday
    const result = startOfWeek(sunday)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(3) // Back to Aug 3
  })

  it('returns midnight', () => {
    const date = new Date(2026, 7, 5, 14, 30, 45)
    const result = startOfWeek(date)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})

describe('minutesToClock', () => {
  it('formats 300 as 5:00 AM', () => {
    expect(minutesToClock(300)).toBe('5:00 AM')
  })

  it('formats 780 as 1:00 PM', () => {
    expect(minutesToClock(780)).toBe('1:00 PM')
  })

  it('formats 0 as 12:00 AM', () => {
    expect(minutesToClock(0)).toBe('12:00 AM')
  })

  it('formats 720 as 12:00 PM', () => {
    expect(minutesToClock(720)).toBe('12:00 PM')
  })

  it('formats with leading zero on minutes', () => {
    expect(minutesToClock(605)).toBe('10:05 AM')
  })

  it('handles afternoon times', () => {
    expect(minutesToClock(900)).toBe('3:00 PM')
    expect(minutesToClock(1020)).toBe('5:00 PM')
  })
})

describe('formatDuration', () => {
  it('formats 390 as "6 h 30 m"', () => {
    expect(formatDuration(390)).toBe('6 h 30 m')
  })

  it('formats 240 as "4 h"', () => {
    expect(formatDuration(240)).toBe('4 h')
  })

  it('formats 30 as "30 min"', () => {
    expect(formatDuration(30)).toBe('30 min')
  })

  it('formats 60 as "1 h"', () => {
    expect(formatDuration(60)).toBe('1 h')
  })

  it('formats 90 as "1 h 30 m"', () => {
    expect(formatDuration(90)).toBe('1 h 30 m')
  })

  it('formats values under 60 as minutes', () => {
    expect(formatDuration(1)).toBe('1 min')
    expect(formatDuration(59)).toBe('59 min')
  })
})

describe('splitDeepHours', () => {
  // Regression for W4: rounding the whole and fractional parts independently
  // (Math.floor(hours) + (hours % 1).toFixed(1)) can disagree when the
  // fraction rounds up into the next whole hour. 1138 min = 18.9666... h,
  // which must render as 19 / .0, not 18 / .0 (which reads as 18.0 h, wrong
  // by a full hour).
  it('1138 minutes splits to 19 whole and .0 fraction', () => {
    expect(splitDeepHours(1138)).toEqual({ whole: 19, frac: '.0' })
  })

  it('1110 minutes splits to 18 whole and .5 fraction', () => {
    expect(splitDeepHours(1110)).toEqual({ whole: 18, frac: '.5' })
  })

  it('0 minutes splits to 0 whole and .0 fraction', () => {
    expect(splitDeepHours(0)).toEqual({ whole: 0, frac: '.0' })
  })

  it('360 minutes splits to 6 whole and .0 fraction', () => {
    expect(splitDeepHours(360)).toEqual({ whole: 6, frac: '.0' })
  })

  it('rounds a half-tenth exactly on the hour boundary up (carry case)', () => {
    // 1137 min = 18.95 h exactly, which rounds to 19.0 h. Rounding once on
    // the combined value must carry into the whole part; rounding the parts
    // independently (as the old code did) instead floors to 18 and rounds
    // the leftover 0.95 down to "0.9" (a float artifact), producing "18.9 h"
    // — never landing on the correct "19.0 h".
    expect(splitDeepHours(1137)).toEqual({ whole: 19, frac: '.0' })
  })

  it('does not carry when the fraction genuinely rounds down', () => {
    // 1129 min = 18.8166... h -> tenths round to 188 -> 18 / .8
    expect(splitDeepHours(1129)).toEqual({ whole: 18, frac: '.8' })
  })
})
