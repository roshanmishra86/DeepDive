import { describe, it, expect } from 'vitest'
import {
  WEEKDAYS,
  hasWeekday,
  toggleWeekday,
  activeWeekdays,
  formatWeekdays,
  templateSubtitle,
  templateTotals,
  nextTemplateBlockStart,
} from './templates'
import type { TemplateBlock, Template } from '../db/types'

describe('templates library', () => {
  describe('WEEKDAYS constant', () => {
    it('has 7 entries', () => {
      expect(WEEKDAYS).toHaveLength(7)
    })

    it('has correct bits (Monday = 0, Sunday = 6)', () => {
      expect(WEEKDAYS[0].bit).toBe(0) // Monday
      expect(WEEKDAYS[6].bit).toBe(6) // Sunday
    })

    it('has single-letter short labels', () => {
      expect(WEEKDAYS[0].short).toBe('M')
      expect(WEEKDAYS[2].short).toBe('W')
      expect(WEEKDAYS[4].short).toBe('F')
    })

    it('has 3-letter full labels', () => {
      expect(WEEKDAYS[0].label).toBe('Mon')
      expect(WEEKDAYS[1].label).toBe('Tue')
      expect(WEEKDAYS[6].label).toBe('Sun')
    })
  })

  describe('hasWeekday', () => {
    it('returns true for set bits', () => {
      const mask = 0b0010101 // bits 0, 2, 4 (Mon, Wed, Fri)
      expect(hasWeekday(mask, 0)).toBe(true)
      expect(hasWeekday(mask, 2)).toBe(true)
      expect(hasWeekday(mask, 4)).toBe(true)
    })

    it('returns false for unset bits', () => {
      const mask = 0b0010101 // bits 0, 2, 4 (Mon, Wed, Fri)
      expect(hasWeekday(mask, 1)).toBe(false)
      expect(hasWeekday(mask, 3)).toBe(false)
      expect(hasWeekday(mask, 6)).toBe(false)
    })

    it('handles mask 0 (no days)', () => {
      expect(hasWeekday(0, 0)).toBe(false)
      expect(hasWeekday(0, 6)).toBe(false)
    })

    it('handles mask 127 (all 7 bits)', () => {
      const allDays = 0b1111111 // 127
      expect(hasWeekday(allDays, 0)).toBe(true)
      expect(hasWeekday(allDays, 6)).toBe(true)
    })
  })

  describe('toggleWeekday', () => {
    it('sets an unset bit', () => {
      const mask = 0 // no days
      const result = toggleWeekday(mask, 2) // toggle Wed
      expect(hasWeekday(result, 2)).toBe(true)
      expect(result).toBe(0b0000100)
    })

    it('clears a set bit', () => {
      const mask = 0b0000100 // Wed only
      const result = toggleWeekday(mask, 2)
      expect(hasWeekday(result, 2)).toBe(false)
      expect(result).toBe(0)
    })

    it('toggling twice returns the original', () => {
      const original = 0b0010101 // Mon, Wed, Fri
      const toggled = toggleWeekday(original, 3) // toggle Thu
      const restored = toggleWeekday(toggled, 3)
      expect(restored).toBe(original)
    })

    it('handles multiple bits', () => {
      const initialMask = 0b0101010 // Tue, Thu, Sat
      const after1 = toggleWeekday(initialMask, 0) // add Mon
      expect(hasWeekday(after1, 0)).toBe(true)
      const after2 = toggleWeekday(after1, 1) // remove Tue
      expect(hasWeekday(after2, 1)).toBe(false)
    })
  })

  describe('activeWeekdays', () => {
    it('returns entries for set bits', () => {
      const mask = 0b0010101 // bits 0, 2, 4 (Mon, Wed, Fri)
      const result = activeWeekdays(mask)
      expect(result).toHaveLength(3)
      expect(result[0].label).toBe('Mon')
      expect(result[1].label).toBe('Wed')
      expect(result[2].label).toBe('Fri')
    })

    it('returns empty array for mask 0', () => {
      const result = activeWeekdays(0)
      expect(result).toHaveLength(0)
    })

    it('returns all 7 for mask 127', () => {
      const result = activeWeekdays(127)
      expect(result).toHaveLength(7)
    })

    it('maintains Mon..Sun order', () => {
      const allDays = 0b1111111 // all days
      const result = activeWeekdays(allDays)
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].bit).toBeLessThan(result[i + 1].bit)
      }
    })
  })

  describe('formatWeekdays', () => {
    it('formats multiple days', () => {
      const mask = 0b0010101 // Mon, Wed, Fri
      const result = formatWeekdays(mask)
      expect(result).toBe('Mon, Wed, Fri')
    })

    it('returns "Every day" for all 7 bits', () => {
      const result = formatWeekdays(127)
      expect(result).toBe('Every day')
    })

    it('returns "No repeat" for mask 0', () => {
      const result = formatWeekdays(0)
      expect(result).toBe('No repeat')
    })

    it('formats single day', () => {
      const mask = 0b0000001 // Monday only
      const result = formatWeekdays(mask)
      expect(result).toBe('Mon')
    })

    it('formats weekdays mask (Mon-Fri)', () => {
      const mask = 0b0011111 // Mon-Fri
      const result = formatWeekdays(mask)
      expect(result).toBe('Mon, Tue, Wed, Thu, Fri')
    })
  })

  describe('templateSubtitle', () => {
    it('combines weekday text and start time with "Applies on " prefix', () => {
      const mask = 0b0010101 // Mon, Wed, Fri
      const result = templateSubtitle(mask, 300) // 5:00 AM
      expect(result).toBe('Applies on Mon, Wed, Fri · starts 5:00 AM')
    })

    it('handles "Every day"', () => {
      const result = templateSubtitle(127, 300)
      expect(result).toBe('Every day · starts 5:00 AM')
    })

    it('handles "No repeat"', () => {
      const result = templateSubtitle(0, 300)
      expect(result).toBe('No repeat · starts 5:00 AM')
    })

    it('converts minutes correctly to clock time', () => {
      const result = templateSubtitle(0b0000001, 570) // 9:30 AM
      expect(result).toContain('9:30 AM')
    })

    it('handles afternoon times', () => {
      const result = templateSubtitle(0b0011111, 1020) // 5:00 PM
      expect(result).toContain('5:00 PM')
    })

    it('handles noon', () => {
      const result = templateSubtitle(0, 720) // 12:00 PM
      expect(result).toContain('12:00 PM')
    })

    it('handles midnight', () => {
      const result = templateSubtitle(0, 0) // 12:00 AM
      expect(result).toContain('12:00 AM')
    })
  })

  describe('templateTotals', () => {
    it('returns zeros for empty blocks', () => {
      const result = templateTotals([])
      expect(result.totalMin).toBe(0)
      expect(result.blockCount).toBe(0)
      expect(result.deepMin).toBe(0)
      expect(result.endMin).toBe(0)
    })

    it('sums durations correctly', () => {
      const blocks: TemplateBlock[] = [
        { id: 1, templateId: 1, title: 'Block 1', kind: 'deep', startMin: 300, durationMin: 90, pomodoros: 3, sort: 0 },
        { id: 2, templateId: 1, title: 'Block 2', kind: 'break', startMin: 390, durationMin: 30, pomodoros: 0, sort: 1 },
      ]
      const result = templateTotals(blocks)
      expect(result.totalMin).toBe(120)
      expect(result.blockCount).toBe(2)
      expect(result.deepMin).toBe(90)
    })

    it('counts deep blocks only', () => {
      const blocks: TemplateBlock[] = [
        { id: 1, templateId: 1, title: 'Deep', kind: 'deep', startMin: 300, durationMin: 90, pomodoros: 3, sort: 0 },
        { id: 2, templateId: 1, title: 'Shallow', kind: 'shallow', startMin: 390, durationMin: 30, pomodoros: 0, sort: 1 },
        { id: 3, templateId: 1, title: 'Break', kind: 'break', startMin: 420, durationMin: 15, pomodoros: 0, sort: 2 },
      ]
      const result = templateTotals(blocks)
      expect(result.deepMin).toBe(90) // only the deep block
    })

    it('calculates endMin correctly', () => {
      const blocks: TemplateBlock[] = [
        { id: 1, templateId: 1, title: 'Block 1', kind: 'deep', startMin: 300, durationMin: 90, pomodoros: 3, sort: 0 },
        { id: 2, templateId: 1, title: 'Block 2', kind: 'break', startMin: 420, durationMin: 30, pomodoros: 0, sort: 1 },
      ]
      const result = templateTotals(blocks)
      expect(result.endMin).toBe(450) // 420 + 30
    })

    it('handles unsorted blocks', () => {
      const blocks: TemplateBlock[] = [
        { id: 2, templateId: 1, title: 'Block 2', kind: 'break', startMin: 420, durationMin: 30, pomodoros: 0, sort: 1 },
        { id: 1, templateId: 1, title: 'Block 1', kind: 'deep', startMin: 300, durationMin: 90, pomodoros: 3, sort: 0 },
      ]
      const result = templateTotals(blocks)
      expect(result.endMin).toBe(450) // still 420 + 30
    })
  })

  describe('nextTemplateBlockStart', () => {
    it('returns template startMin for empty blocks', () => {
      const template: Template = { id: 1, name: 'Test', description: '', startMin: 300, weekdays: 0 }
      const result = nextTemplateBlockStart([], template)
      expect(result).toBe(300)
    })

    it('returns the end of the last block in canonical order', () => {
      const blocks: TemplateBlock[] = [
        { id: 1, templateId: 1, title: 'Block 1', kind: 'deep', startMin: 300, durationMin: 90, pomodoros: 3, sort: 0 },
        { id: 2, templateId: 1, title: 'Block 2', kind: 'break', startMin: 390, durationMin: 30, pomodoros: 0, sort: 1 },
      ]
      const template: Template = { id: 1, name: 'Test', description: '', startMin: 300, weekdays: 0 }
      const result = nextTemplateBlockStart(blocks, template)
      expect(result).toBe(420) // 390 + 30
    })

    it('sorts blocks before finding the end', () => {
      const blocks: TemplateBlock[] = [
        { id: 2, templateId: 1, title: 'Block 2', kind: 'break', startMin: 390, durationMin: 30, pomodoros: 0, sort: 1 },
        { id: 1, templateId: 1, title: 'Block 1', kind: 'deep', startMin: 300, durationMin: 90, pomodoros: 3, sort: 0 },
      ]
      const template: Template = { id: 1, name: 'Test', description: '', startMin: 300, weekdays: 0 }
      const result = nextTemplateBlockStart(blocks, template)
      expect(result).toBe(420) // still 390 + 30, regardless of input order
    })

    it('uses startMin as the proposed start for a new block', () => {
      const blocks: TemplateBlock[] = [
        { id: 1, templateId: 1, title: 'Block 1', kind: 'deep', startMin: 500, durationMin: 60, pomodoros: 2, sort: 0 },
      ]
      const template: Template = { id: 1, name: 'Test', description: '', startMin: 480, weekdays: 0 }
      const result = nextTemplateBlockStart(blocks, template)
      expect(result).toBe(560) // 500 + 60
    })
  })

})
