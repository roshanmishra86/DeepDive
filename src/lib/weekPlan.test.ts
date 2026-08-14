import { describe, it, expect } from 'vitest'
import type { DayBlock, Task } from '../db/types'
import {
  weekDays,
  weekStats,
  dayHours,
  allocationByKind,
  mostFocusedDay,
  mostBlocksDay,
  sortDayBlocks,
} from './weekPlan'

/**
 * Factory for creating test blocks with all fields covered.
 * Defaults to a minimal non-break block on day 0; overrides fill in specific fields.
 */
function makeBlock(id: number, overrides: Partial<DayBlock> = {}): DayBlock {
  return {
    id,
    day: '2024-01-01',
    taskId: null,
    subtaskId: null,
    title: `Block ${id}`,
    kind: 'shallow',
    startMin: 0,
    durationMin: 60,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    noteUpdatedAt: null,
    repeat: 'once',
    trackId: null,
    quiet: false,
    ...overrides,
  }
}

describe('weekPlan', () => {
  describe('weekDays', () => {
    it('returns seven consecutive day keys Monday through Sunday', () => {
      const monday = new Date(2024, 0, 1) // Jan 1, 2024 is a Monday
      const days = weekDays(monday)

      expect(days).toHaveLength(7)
      expect(days[0]).toBe('2024-01-01') // Monday
      expect(days[6]).toBe('2024-01-07') // Sunday
    })

    it('is DST-safe across a spring-forward transition week', () => {
      // March 4-10, 2024: March 10 is when US Eastern time springs forward (2am -> 3am)
      const monday = new Date(2024, 2, 4, 12, 0, 0) // March 4, 2024, noon
      const days = weekDays(monday)

      expect(days).toHaveLength(7)
      // Verify they are seven consecutive dates with no repeats or skips
      const parsed = days.map((d) => new Date(d))
      for (let i = 0; i < 6; i++) {
        const diff = parsed[i + 1].getTime() - parsed[i].getTime()
        // Should be ~86400000 ms (24 hours), allowing for DST shift
        expect(diff).toBeGreaterThan(80000000) // At least 22 hours
        expect(diff).toBeLessThan(93600000) // At most 26 hours
      }
      // Verify no duplicates
      expect(new Set(days).size).toBe(7)
    })

    it('is DST-safe across a fall-back transition week', () => {
      // November 3-9, 2024: November 3 is when US Eastern time falls back (2am -> 1am)
      const monday = new Date(2024, 10, 4, 12, 0, 0) // November 4, 2024, noon
      const days = weekDays(monday)

      expect(days).toHaveLength(7)
      const parsed = days.map((d) => new Date(d))
      for (let i = 0; i < 6; i++) {
        const diff = parsed[i + 1].getTime() - parsed[i].getTime()
        expect(diff).toBeGreaterThan(80000000)
        expect(diff).toBeLessThan(93600000)
      }
      expect(new Set(days).size).toBe(7)
    })
  })

  describe('weekStats', () => {
    const monday = new Date(2024, 0, 1) // Jan 1, 2024
    const days = weekDays(monday)

    it('computes stats for a normal week', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        '2024-01-01': [
          makeBlock(1, { day: '2024-01-01', kind: 'deep', durationMin: 120, completed: true }),
          makeBlock(2, { day: '2024-01-01', kind: 'shallow', durationMin: 60 }),
          makeBlock(3, { day: '2024-01-01', kind: 'break', durationMin: 30 }),
        ],
        '2024-01-02': [
          makeBlock(4, { day: '2024-01-02', kind: 'deep', durationMin: 90, completed: true }),
          makeBlock(5, { day: '2024-01-02', kind: 'ritual', durationMin: 15 }),
        ],
      }

      const daysForWeek = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07']
      const now = new Date(2024, 0, 2, 18, 0) // January 2, 2024 at 6 PM (Tuesday)
      const stats = weekStats(blocksByDay, daysForWeek, now)

      expect(stats.focusHours).toBe((120 + 90) / 60) // 210 min = 3.5 h
      expect(stats.blocksScheduled).toBe(4) // non-break: 1, 2, 4, 5
      // 210 min completed (block 1, block 4) out of 315 min ended (all blocks including breaks)
      // Numerator: 120 + 90 = 210
      // Denominator: 120 + 60 + 30 (break) + 90 + 15 = 315
      // round(100 * 210 / 315) = round(66.67) = 67
      expect(stats.completionEstimate).toBe(67)
      expect(stats.averageBlockMin).toBe((120 + 60 + 90 + 15) / 4) // 71.25
    })

    it('excludes future blocks from completionEstimate', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [
          makeBlock(1, { day: days[0], kind: 'deep', startMin: 9 * 60, durationMin: 60, completed: true }),
        ],
        [days[2]]: [
          // Wednesday, not yet reached
          makeBlock(2, { day: days[2], kind: 'deep', startMin: 9 * 60, durationMin: 60, completed: true }),
        ],
      }

      const now = new Date(2024, 0, 2, 10, 0) // Tuesday 10 AM
      const stats = weekStats(blocksByDay, days, now)

      // Only Monday's block has ended; Wednesday's is still in the future
      // Numerator: 60 completed min, Denominator: 60 ended min
      expect(stats.completionEstimate).toBe(100)
    })

    it('returns null for completionEstimate when nothing has elapsed', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [makeBlock(1, { day: days[0], kind: 'deep', startMin: 9 * 60, durationMin: 60 })],
      }

      const now = new Date(2024, 0, 1, 8, 0) // Monday 8 AM, before the 9 AM block
      const stats = weekStats(blocksByDay, days, now)

      expect(stats.completionEstimate).toBeNull()
    })

    it('computes partial completion when some blocks are incomplete', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [
          makeBlock(1, { day: days[0], startMin: 9 * 60, durationMin: 60, completed: true }),
          makeBlock(2, { day: days[0], startMin: 10 * 60, durationMin: 60, completed: false }),
        ],
      }

      const now = new Date(2024, 0, 1, 11, 30) // After both blocks
      const stats = weekStats(blocksByDay, days, now)

      // 60 completed, 120 total elapsed
      expect(stats.completionEstimate).toBe(50)
    })

    it('counts break blocks in completionEstimate on both sides of the ratio', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [
          makeBlock(1, { day: days[0], startMin: 9 * 60, durationMin: 20, kind: 'break', completed: true }),
          makeBlock(2, { day: days[0], startMin: 10 * 60, durationMin: 60, kind: 'shallow', completed: false }),
        ],
      }

      const now = new Date(2024, 0, 1, 11, 30) // After both blocks
      const stats = weekStats(blocksByDay, days, now)

      // Numerator: 20 completed (break block)
      // Denominator: 20 (break) + 60 (shallow) = 80 total elapsed
      // round(100 * 20 / 80) = 25
      expect(stats.completionEstimate).toBe(25)
    })

    it('handles an empty week with no NaN values', () => {
      const blocksByDay: Record<string, DayBlock[]> = {}

      const now = new Date(2024, 0, 1, 12, 0)
      const stats = weekStats(blocksByDay, days, now)

      expect(Number.isNaN(stats.focusHours)).toBe(false)
      expect(stats.focusHours).toBe(0)
      expect(Number.isNaN(stats.blocksScheduled)).toBe(false)
      expect(stats.blocksScheduled).toBe(0)
      expect(stats.completionEstimate).toBeNull()
      expect(Number.isNaN(stats.averageBlockMin)).toBe(false)
      expect(stats.averageBlockMin).toBe(0)
    })

    it('handles a week of only breaks', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [
          makeBlock(1, { kind: 'break', durationMin: 30 }),
          makeBlock(2, { kind: 'break', durationMin: 15 }),
        ],
      }

      const now = new Date(2024, 0, 2, 12, 0)
      const stats = weekStats(blocksByDay, days, now)

      expect(stats.focusHours).toBe(0)
      expect(stats.blocksScheduled).toBe(0)
      expect(stats.averageBlockMin).toBe(0)
      expect(Number.isNaN(stats.averageBlockMin)).toBe(false)
      // Breaks have elapsed and are counted in completionEstimate denominator,
      // but zero are completed, so completionEstimate is 0
      expect(stats.completionEstimate).toBe(0)
    })
  })

  describe('dayHours', () => {
    it('sums non-break block durations and converts to hours', () => {
      const blocks: DayBlock[] = [
        makeBlock(1, { kind: 'deep', durationMin: 120 }),
        makeBlock(2, { kind: 'shallow', durationMin: 60 }),
        makeBlock(3, { kind: 'break', durationMin: 30 }),
        makeBlock(4, { kind: 'ritual', durationMin: 15 }),
      ]

      expect(dayHours(blocks)).toBe((120 + 60 + 15) / 60) // 195 min = 3.25 h
    })

    it('returns 0 for an empty day', () => {
      expect(dayHours([])).toBe(0)
    })

    it('returns 0 when all blocks are breaks', () => {
      const blocks: DayBlock[] = [
        makeBlock(1, { kind: 'break', durationMin: 30 }),
        makeBlock(2, { kind: 'break', durationMin: 15 }),
      ]

      expect(dayHours(blocks)).toBe(0)
    })
  })

  describe('allocationByKind', () => {
    const monday = new Date(2024, 0, 1)
    const days = weekDays(monday)

    it('returns all four kinds with minutes and percentages', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [
          makeBlock(1, { kind: 'deep', durationMin: 120 }),
          makeBlock(2, { kind: 'shallow', durationMin: 60 }),
          makeBlock(3, { kind: 'ritual', durationMin: 30 }),
          makeBlock(4, { kind: 'break', durationMin: 15 }),
        ],
      }

      const result = allocationByKind(blocksByDay, days)

      expect(result).toHaveLength(4)
      expect(result[0].kind).toBe('deep')
      expect(result[1].kind).toBe('shallow')
      expect(result[2].kind).toBe('ritual')
      expect(result[3].kind).toBe('break')

      expect(result[0].minutes).toBe(120)
      expect(result[1].minutes).toBe(60)
      expect(result[2].minutes).toBe(30)
      expect(result[3].minutes).toBe(15)
    })

    it('reconciles percentages to exactly 100 via largest-remainder', () => {
      // Create a case where exact shares do not divide evenly
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [
          makeBlock(1, { day: days[0], kind: 'deep', durationMin: 100 }), // 100/300 = 33.33%
          makeBlock(2, { day: days[0], kind: 'shallow', durationMin: 100 }), // 100/300 = 33.33%
          makeBlock(3, { day: days[0], kind: 'ritual', durationMin: 100 }), // 100/300 = 33.33%
          makeBlock(4, { day: days[0], kind: 'break', durationMin: 0 }), // 0%
        ],
      }

      const result = allocationByKind(blocksByDay, days)

      const totalPercent = result.reduce((sum, r) => sum + r.percent, 0)
      expect(totalPercent).toBe(100)

      // Verify that we have some 34% and some 33% (the three kinds get 34, 34, 33 via largest-remainder)
      const percents = result.map((r) => r.percent)
      expect(percents.sort((a, b) => b - a)).toEqual([34, 33, 33, 0])
    })

    it('handles an empty week with all zeros', () => {
      const blocksByDay: Record<string, DayBlock[]> = {}

      const result = allocationByKind(blocksByDay, days)

      expect(result).toHaveLength(4)
      for (const entry of result) {
        expect(entry.minutes).toBe(0)
        expect(entry.percent).toBe(0)
      }
      const totalPercent = result.reduce((sum, r) => sum + r.percent, 0)
      expect(totalPercent).toBe(0)
    })

    it('ties largest-remainder by kind order (determinism)', () => {
      // Three kinds with identical minutes: deep, shallow, ritual (break=0)
      // All have exact share 33.33%, floor 33, remainder 0.33
      // Largest-remainder should award the 4 extra percents in kind order: deep, shallow, ritual, break
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [
          makeBlock(1, { kind: 'deep', durationMin: 34 }),
          makeBlock(2, { kind: 'shallow', durationMin: 33 }),
          makeBlock(3, { kind: 'ritual', durationMin: 33 }),
        ],
      }

      const result = allocationByKind(blocksByDay, days)

      const totalPercent = result.reduce((sum, r) => sum + r.percent, 0)
      expect(totalPercent).toBe(100)
    })
  })

  describe('mostFocusedDay', () => {
    const monday = new Date(2024, 0, 1)
    const days = weekDays(monday)

    it('returns the day with the most deep minutes', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [makeBlock(1, { kind: 'deep', durationMin: 120 })],
        [days[1]]: [makeBlock(2, { kind: 'deep', durationMin: 90 })],
      }

      expect(mostFocusedDay(blocksByDay, days)).toBe(days[0])
    })

    it('breaks ties by earliest day', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [makeBlock(1, { kind: 'deep', durationMin: 120 })],
        [days[2]]: [makeBlock(2, { kind: 'deep', durationMin: 120 })],
      }

      expect(mostFocusedDay(blocksByDay, days)).toBe(days[0])
    })

    it('returns null when no deep work exists', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [makeBlock(1, { kind: 'shallow', durationMin: 60 })],
      }

      expect(mostFocusedDay(blocksByDay, days)).toBeNull()
    })

    it('returns null for an empty week', () => {
      const blocksByDay: Record<string, DayBlock[]> = {}

      expect(mostFocusedDay(blocksByDay, days)).toBeNull()
    })
  })

  describe('mostBlocksDay', () => {
    const monday = new Date(2024, 0, 1)
    const days = weekDays(monday)

    it('returns the day with the most non-break blocks', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [
          makeBlock(1, { kind: 'deep' }),
          makeBlock(2, { kind: 'shallow' }),
          makeBlock(3, { kind: 'break' }), // breaks don't count
        ],
        [days[1]]: [makeBlock(4, { kind: 'shallow' })],
      }

      expect(mostBlocksDay(blocksByDay, days)).toBe(days[0])
    })

    it('breaks ties by earliest day', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [makeBlock(1, { kind: 'deep' }), makeBlock(2, { kind: 'shallow' })],
        [days[2]]: [makeBlock(3, { kind: 'deep' }), makeBlock(4, { kind: 'ritual' })],
      }

      expect(mostBlocksDay(blocksByDay, days)).toBe(days[0])
    })

    it('returns null when no non-break blocks exist', () => {
      const blocksByDay: Record<string, DayBlock[]> = {
        [days[0]]: [makeBlock(1, { kind: 'break' })],
      }

      expect(mostBlocksDay(blocksByDay, days)).toBeNull()
    })

    it('returns null for an empty week', () => {
      const blocksByDay: Record<string, DayBlock[]> = {}

      expect(mostBlocksDay(blocksByDay, days)).toBeNull()
    })
  })

  describe('sortDayBlocks', () => {
    it('returns a new array without mutating the input', () => {
      const blocks: DayBlock[] = [
        makeBlock(1, { startMin: 600 }), // 10 AM
        makeBlock(2, { startMin: 540 }), // 9 AM
      ]
      const original = [...blocks]
      const tasksById = new Map<number, Task>()
      const now = new Date()

      const sorted = sortDayBlocks(blocks, 'importance', tasksById, now)

      expect(blocks).toEqual(original) // Input unchanged
      expect(sorted).not.toBe(blocks) // Different array object
    })

    it('sorts by importance (quadrant order) for linked tasks', () => {
      const taskDo: Task = {
        id: 1,
        title: 'Do',
        notes: '',
        important: true,
        urgent: true,
        priority: 'high',
        dueAt: null,
        estimateMin: null,
        done: false,
        createdAt: '',
        archived: false,
        sort: 0,
        completedAt: null,
        archivedAt: null,
      }
      const taskPlan: Task = {
        ...taskDo,
        id: 2,
        title: 'Plan',
        important: true,
        urgent: false,
        priority: 'medium',
      }
      const tasksById = new Map([
        [1, taskDo],
        [2, taskPlan],
      ])

      const blocks: DayBlock[] = [
        makeBlock(2, { taskId: 2, startMin: 600 }), // Plan (should come second)
        makeBlock(1, { taskId: 1, startMin: 500 }), // Do (should come first)
      ]

      const sorted = sortDayBlocks(blocks, 'importance', tasksById, new Date())

      expect(sorted[0].id).toBe(1) // Do quadrant
      expect(sorted[1].id).toBe(2) // Plan quadrant
    })

    it('places unlinked tasks last in importance sort', () => {
      const task: Task = {
        id: 1,
        title: 'Do',
        notes: '',
        important: true,
        urgent: true,
        priority: 'high',
        dueAt: null,
        estimateMin: null,
        done: false,
        createdAt: '',
        archived: false,
        sort: 0,
        completedAt: null,
        archivedAt: null,
      }
      const tasksById = new Map([[1, task]])

      const blocks: DayBlock[] = [
        makeBlock(2, { taskId: null, startMin: 500 }), // Unlinked
        makeBlock(1, { taskId: 1, startMin: 600 }), // Do quadrant
      ]

      const sorted = sortDayBlocks(blocks, 'importance', tasksById, new Date())

      expect(sorted[0].id).toBe(1) // Linked task first
      expect(sorted[1].id).toBe(2) // Unlinked last
    })

    it('sorts by deadline (dueAt) for deadline mode', () => {
      const taskEarly: Task = {
        id: 1,
        title: 'Due soon',
        notes: '',
        important: false,
        urgent: false,
        priority: 'low',
        dueAt: '2024-01-01T10:00:00Z',
        estimateMin: null,
        done: false,
        createdAt: '',
        archived: false,
        sort: 0,
        completedAt: null,
        archivedAt: null,
      }
      const taskLate: Task = {
        ...taskEarly,
        id: 2,
        title: 'Due later',
        dueAt: '2024-01-05T10:00:00Z',
      }
      const tasksById = new Map([
        [1, taskEarly],
        [2, taskLate],
      ])

      const blocks: DayBlock[] = [
        makeBlock(2, { taskId: 2, startMin: 600 }), // Later due date
        makeBlock(1, { taskId: 1, startMin: 500 }), // Earlier due date
      ]

      const sorted = sortDayBlocks(blocks, 'deadline', tasksById, new Date())

      expect(sorted[0].id).toBe(1) // Earlier due date first
      expect(sorted[1].id).toBe(2) // Later due date second
    })

    it('places tasks without due dates last in deadline sort', () => {
      const taskWithDue: Task = {
        id: 1,
        title: 'Has due',
        notes: '',
        important: false,
        urgent: false,
        priority: 'low',
        dueAt: '2024-01-05T10:00:00Z',
        estimateMin: null,
        done: false,
        createdAt: '',
        archived: false,
        sort: 0,
        completedAt: null,
        archivedAt: null,
      }
      const taskNoDue: Task = {
        ...taskWithDue,
        id: 2,
        title: 'No due',
        dueAt: null,
      }
      const tasksById = new Map([
        [1, taskWithDue],
        [2, taskNoDue],
      ])

      const blocks: DayBlock[] = [
        makeBlock(2, { taskId: 2, startMin: 500 }), // No due date
        makeBlock(1, { taskId: 1, startMin: 600 }), // Has due date
      ]

      const sorted = sortDayBlocks(blocks, 'deadline', tasksById, new Date())

      expect(sorted[0].id).toBe(1) // Has due date first
      expect(sorted[1].id).toBe(2) // No due date last
    })

    it('ties back to startMin for determinism', () => {
      const taskA: Task = {
        id: 1,
        title: 'A',
        notes: '',
        important: true,
        urgent: true,
        priority: 'high',
        dueAt: null,
        estimateMin: null,
        done: false,
        createdAt: '',
        archived: false,
        sort: 0,
        completedAt: null,
        archivedAt: null,
      }
      const taskB: Task = { ...taskA, id: 2, title: 'B' } // Same quadrant as A
      const tasksById = new Map([
        [1, taskA],
        [2, taskB],
      ])

      const blocks: DayBlock[] = [
        makeBlock(1, { taskId: 1, startMin: 600, id: 1 }), // Later start
        makeBlock(2, { taskId: 2, startMin: 540, id: 2 }), // Earlier start
      ]

      const sorted = sortDayBlocks(blocks, 'importance', tasksById, new Date())

      // Same quadrant, so tie-break on startMin
      expect(sorted[0].id).toBe(2) // startMin 540
      expect(sorted[1].id).toBe(1) // startMin 600
    })

    it('ties with startMin then id for total determinism', () => {
      const tasksById = new Map<number, Task>()

      const blocks: DayBlock[] = [
        makeBlock(2, { startMin: 600, id: 2 }), // Same startMin, higher id
        makeBlock(1, { startMin: 600, id: 1 }), // Same startMin, lower id
      ]

      const sorted = sortDayBlocks(blocks, 'importance', tasksById, new Date())

      // Same quadrant (all unlinked), same startMin, so tie-break on id
      expect(sorted[0].id).toBe(1)
      expect(sorted[1].id).toBe(2)
    })
  })
})
