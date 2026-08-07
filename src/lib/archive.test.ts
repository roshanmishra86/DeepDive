import { describe, it, expect } from 'vitest'
import { addMonths, monthLabel, monthGrid, dayRecordTitle, dayRecordMeta, histogramBars } from './archive'

describe('archive helpers', () => {
  describe('addMonths', () => {
    it('adds months normally', () => {
      const jan31 = new Date(2026, 0, 31) // Jan 31, 2026
      const mar31 = addMonths(jan31, 2)
      expect(mar31.getFullYear()).toBe(2026)
      expect(mar31.getMonth()).toBe(2) // March
      expect(mar31.getDate()).toBe(31)
    })

    it('clamps to last day when target month has fewer days', () => {
      const jan31 = new Date(2026, 0, 31) // Jan 31, 2026
      const feb28 = addMonths(jan31, 1) // Feb only has 28 days
      expect(feb28.getFullYear()).toBe(2026)
      expect(feb28.getMonth()).toBe(1) // February
      expect(feb28.getDate()).toBe(28)
    })

    it('clamps leap year correctly', () => {
      const jan31 = new Date(2024, 0, 31) // Jan 31, 2024 (leap year)
      const feb29 = addMonths(jan31, 1)
      expect(feb29.getFullYear()).toBe(2024)
      expect(feb29.getMonth()).toBe(1) // February
      expect(feb29.getDate()).toBe(29)
    })

    it('subtracts months', () => {
      const mar15 = new Date(2026, 2, 15) // Mar 15
      const jan15 = addMonths(mar15, -2)
      expect(jan15.getFullYear()).toBe(2026)
      expect(jan15.getMonth()).toBe(0)
      expect(jan15.getDate()).toBe(15)
    })

    it('handles year boundaries', () => {
      const jan15 = new Date(2026, 0, 15)
      const dec15 = addMonths(jan15, -1)
      expect(dec15.getFullYear()).toBe(2025)
      expect(dec15.getMonth()).toBe(11) // December
      expect(dec15.getDate()).toBe(15)
    })
  })

  describe('monthLabel', () => {
    it('formats month and year', () => {
      expect(monthLabel(2026, 1)).toBe('February 2026')
      expect(monthLabel(2024, 0)).toBe('January 2024')
      expect(monthLabel(2026, 11)).toBe('December 2026')
    })
  })

  describe('monthGrid', () => {
    it('generates an exact 35-cell grid for Feb 2026 (no bogus trailing week)', () => {
      // Feb 2026: 1st is a Sunday, 28th is a Saturday. Grid spans Mon Jan 26
      // -> Sun Mar 1, exactly 5 weeks. A prior bug always padded to 42 cells
      // by appending a fabricated 6th week with dayOfMonth: 0 cells.
      const cells = monthGrid(2026, 1)
      expect(cells.length).toBe(35)
      expect(cells[0].day).toBe('2026-01-26')
      expect(cells[cells.length - 1].day).toBe('2026-03-01')

      const inMonthCells = cells.filter((c) => c.inMonth)
      expect(inMonthCells.length).toBe(28) // Feb 2026 has 28 days
      expect(inMonthCells[inMonthCells.length - 1].dayOfMonth).toBe(28)

      expect(cells.length % 7).toBe(0)
    })

    it('generates an exact 28-cell grid when the month starts on Monday and needs no padding', () => {
      // Feb 2027: 1st is a Monday, 28 days, 28th is a Sunday -> exactly 4 weeks.
      const cells = monthGrid(2027, 1)
      expect(cells.length).toBe(28)
      expect(cells.every((c) => c.inMonth)).toBe(true)
      expect(cells[0].day).toBe('2027-02-01')
      expect(cells[cells.length - 1].day).toBe('2027-02-28')
    })

    it('generates a 42-cell grid when the month genuinely spans 6 weeks', () => {
      // Aug 2026: 1st is a Saturday, 31st is a Monday -> spans 6 full weeks.
      const cells = monthGrid(2026, 7)
      expect(cells.length).toBe(42)
      const inMonthCells = cells.filter((c) => c.inMonth)
      expect(inMonthCells.length).toBe(31)
    })

    it('all cells have valid day keys', () => {
      const cells = monthGrid(2026, 1)
      cells.forEach((cell) => {
        const dayKey = cell.day
        const parts = dayKey.split('-')
        expect(parts.length).toBe(3)
        const [y, m, d] = parts.map(Number)
        expect(y).toBeGreaterThan(2000)
        expect(m).toBeGreaterThanOrEqual(1)
        expect(m).toBeLessThanOrEqual(12)
        expect(d).toBeGreaterThanOrEqual(1)
        expect(d).toBeLessThanOrEqual(31)
      })
    })

    it('dayOfMonth is the real calendar day number even for outside-month cells', () => {
      // Feb 2026 grid starts Jan 26 — those leading cells are outside the
      // month but must carry their true day-of-month (26..31), not a magic 0.
      const cells = monthGrid(2026, 1)
      const leading = cells.slice(0, 6) // Jan 26-31
      expect(leading.every((c) => !c.inMonth)).toBe(true)
      expect(leading.map((c) => c.dayOfMonth)).toEqual([26, 27, 28, 29, 30, 31])

      cells.forEach((cell) => {
        expect(cell.dayOfMonth).toBeGreaterThanOrEqual(1)
        expect(cell.dayOfMonth).toBeLessThanOrEqual(31)
      })
    })
  })

  describe('dayRecordTitle', () => {
    it('formats day as title', () => {
      const title = dayRecordTitle('2026-02-12')
      expect(title).toMatch(/Thursday.*12.*February/)
    })
  })

  describe('dayRecordMeta', () => {
    it('formats the meta line correctly', () => {
      const meta = dayRecordMeta({
        blockCount: 5,
        completedCount: 4,
        deepMin: 180,
        pomodoros: 5,
      })
      expect(meta).toMatch(/4 of 5 blocks completed/)
      expect(meta).toMatch(/3\.0 h deep/)
      expect(meta).toMatch(/5 pomodoros/)
    })

    it('formats zero blocks correctly', () => {
      const meta = dayRecordMeta({
        blockCount: 0,
        completedCount: 0,
        deepMin: 0,
        pomodoros: 0,
      })
      expect(meta).toMatch(/0 of 0 blocks completed/)
      expect(meta).toMatch(/0\.0 h deep/)
      expect(meta).toMatch(/0 pomodoros/)
    })

    it('handles fractional hours via splitDeepHours', () => {
      const meta = dayRecordMeta({
        blockCount: 1,
        completedCount: 1,
        deepMin: 90, // 1.5 hours
        pomodoros: 3,
      })
      expect(meta).toMatch(/1\.5 h deep/)
    })

    it('pluralizes pomodoros correctly', () => {
      const meta1 = dayRecordMeta({
        blockCount: 1,
        completedCount: 1,
        deepMin: 30,
        pomodoros: 1,
      })
      expect(meta1).toMatch(/1 pomodoro(?![s])/) // 1 pomodoro (no 's')

      const meta2 = dayRecordMeta({
        blockCount: 1,
        completedCount: 1,
        deepMin: 60,
        pomodoros: 2,
      })
      expect(meta2).toMatch(/2 pomodoros/)
    })
  })

  describe('histogramBars', () => {
    it('computes heightPct relative to max', () => {
      const bars = histogramBars([
        { weekStart: '2026-01-26', hours: 10 },
        { weekStart: '2026-02-02', hours: 20 },
        { weekStart: '2026-02-09', hours: 5 },
      ])

      expect(bars[0].heightPct).toBe(50) // 10/20 * 100
      expect(bars[1].heightPct).toBe(100) // 20/20 * 100
      expect(bars[2].heightPct).toBe(25) // 5/20 * 100
    })

    it('handles all-zero case without dividing by zero', () => {
      const bars = histogramBars([
        { weekStart: '2026-01-26', hours: 0 },
        { weekStart: '2026-02-02', hours: 0 },
      ])

      expect(bars[0].heightPct).toBe(0)
      expect(bars[1].heightPct).toBe(0)
    })

    it('assigns tiers based on heightPct quartiles', () => {
      const bars = histogramBars([
        { weekStart: '2026-01-26', hours: 12.5 }, // 12.5/100 = 12.5% → tier 0
        { weekStart: '2026-02-02', hours: 37.5 }, // 37.5/100 = 37.5% → tier 1 (>25, <=50)
        { weekStart: '2026-02-09', hours: 62.5 }, // 62.5/100 = 62.5% → tier 2 (>50, <=75)
        { weekStart: '2026-02-16', hours: 100 }, // 100/100 = 100% → tier 3 (>75)
      ])

      expect(bars[0].tier).toBe(0) // 12.5% → tier 0
      expect(bars[1].tier).toBe(1) // 37.5% → tier 1
      expect(bars[2].tier).toBe(2) // 62.5% → tier 2
      expect(bars[3].tier).toBe(3) // 100% → tier 3
    })

    it('handles single data point', () => {
      const bars = histogramBars([{ weekStart: '2026-01-26', hours: 15 }])

      expect(bars.length).toBe(1)
      expect(bars[0].heightPct).toBe(100)
      expect(bars[0].tier).toBe(3)
    })

    it('preserves weekStart and hours in output', () => {
      const input = { weekStart: '2026-02-16', hours: 12.5 }
      const bars = histogramBars([input])

      expect(bars[0].weekStart).toBe('2026-02-16')
      expect(bars[0].hours).toBe(12.5)
    })
  })
})
