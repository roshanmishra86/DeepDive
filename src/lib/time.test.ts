import { describe, it, expect } from 'vitest'
import { formatClock, formatTitleDate } from './time'

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
