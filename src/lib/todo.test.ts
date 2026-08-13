import { describe, it, expect } from 'vitest'
import {
  sortTasks,
  quadrantOf,
  deadlineBucket,
  groupByMatrix,
  groupByDeadline,
  formatDueLabel,
  formatDueChipLabel,
  taskMeta,
  blockDraftFromTask,
  upcomingTasks,
  composeDueAt,
  decomposeDueAt,
  priorityFromQuadrant,
  applyFilters,
  filtersActive,
  sortGroup,
  dragDisabledReason,
  QUADRANTS,
  DEADLINE_BUCKETS,
  DEFAULT_TODO_FILTERS,
} from './todo'
import { formatDuration } from './time'
import type { Task } from '../db/types'

const makeTask = (
  id: number,
  overrides: Partial<Task> = {}
): Task => ({
  id,
  title: `Task ${id}`,
  notes: '',
  important: false,
  urgent: false,
  priority: 'medium',
  dueAt: null,
  estimateMin: null,
  done: false,
  createdAt: '2026-08-04T00:00:00.000Z',
  archived: false,
  sort: 0,
  completedAt: null,
  archivedAt: null,
  ...overrides,
})

// The real app never writes a bare 'YYYY-MM-DD' string as `dueAt` — it
// always writes a full ISO instant via `composeDueAt` (see TaskEditor).
// Every fixture below goes through the same helper so these tests exercise
// the shape the app actually produces.
const due = (dateStr: string, timeStr = '17:00'): string => {
  const iso = composeDueAt(dateStr, timeStr)
  if (iso === null) throw new Error(`composeDueAt returned null for ${dateStr}`)
  return iso
}

describe('sortTasks', () => {
  it('sorts incomplete before done', () => {
    const tasks = [
      makeTask(1, { done: true }),
      makeTask(2, { done: false }),
    ]
    const sorted = sortTasks(tasks)
    expect(sorted[0].id).toBe(2)
    expect(sorted[1].id).toBe(1)
  })

  it('sorts by manual order within the same done state', () => {
    const tasks = [
      makeTask(1, { done: false, dueAt: due('2026-08-10') }),
      makeTask(2, { done: false, dueAt: due('2026-08-05') }),
      makeTask(3, { done: false, dueAt: due('2026-08-08') }),
    ]
    const sorted = sortTasks(tasks)
    expect(sorted.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('uses id as a stable tie-breaker when manual order is equal', () => {
    const tasks = [
      makeTask(1, { done: false, dueAt: null }),
      makeTask(2, { done: false, dueAt: due('2026-08-05') }),
      makeTask(3, { done: false, dueAt: null }),
    ]
    const sorted = sortTasks(tasks)
    expect(sorted.map((task) => task.id)).toEqual([1, 2, 3])
  })

  it('breaks ties by id ascending', () => {
    const tasks = [
      makeTask(5, { done: false, dueAt: due('2026-08-05') }),
      makeTask(2, { done: false, dueAt: due('2026-08-05') }),
      makeTask(3, { done: false, dueAt: due('2026-08-05') }),
    ]
    const sorted = sortTasks(tasks)
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 5])
  })

  it('does not mutate the input', () => {
    const tasks = [makeTask(2), makeTask(1)]
    const original = JSON.parse(JSON.stringify(tasks))
    sortTasks(tasks)
    expect(tasks).toEqual(original)
  })
})

describe('quadrantOf', () => {
  it('returns do for important && urgent', () => {
    const task = makeTask(1, { important: true, urgent: true })
    expect(quadrantOf(task)).toBe('do')
  })

  it('returns plan for important && !urgent', () => {
    const task = makeTask(1, { important: true, urgent: false })
    expect(quadrantOf(task)).toBe('plan')
  })

  it('returns delegate for !important && urgent', () => {
    const task = makeTask(1, { important: false, urgent: true })
    expect(quadrantOf(task)).toBe('delegate')
  })

  it('returns drop for !important && !urgent', () => {
    const task = makeTask(1, { important: false, urgent: false })
    expect(quadrantOf(task)).toBe('drop')
  })
})

describe('composeDueAt / decomposeDueAt', () => {
  it('composes a local wall-clock date+time into an ISO instant', () => {
    const iso = composeDueAt('2026-08-06', '09:30')
    expect(iso).not.toBeNull()
    // Round-trips back to a Date whose local getters match the input.
    const d = new Date(iso!)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // 0-indexed: August
    expect(d.getDate()).toBe(6)
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(30)
  })

  it('returns null for a blank date', () => {
    expect(composeDueAt('', '09:30')).toBeNull()
    expect(composeDueAt('   ', '09:30')).toBeNull()
  })

  it('defaults a blank time to 17:00', () => {
    const iso = composeDueAt('2026-08-06', '')
    const d = new Date(iso!)
    expect(d.getHours()).toBe(17)
    expect(d.getMinutes()).toBe(0)
  })

  it('decomposes an ISO instant back into local date and time', () => {
    const iso = composeDueAt('2026-08-06', '09:30')!
    expect(decomposeDueAt(iso)).toEqual({ date: '2026-08-06', time: '09:30' })
  })

  it('returns the none-default shape for an invalid dueAt', () => {
    expect(decomposeDueAt('not-a-date')).toEqual({ date: '', time: '17:00' })
  })

  it('round-trips local wall-clock date and time unchanged', () => {
    const cases: Array<[string, string]> = [
      ['2026-01-01', '00:00'],
      ['2026-08-06', '17:00'],
      ['2026-12-31', '23:59'],
      ['2026-08-06', '09:05'],
    ]
    for (const [date, time] of cases) {
      const iso = composeDueAt(date, time)!
      expect(decomposeDueAt(iso)).toEqual({ date, time })
    }
  })
})

describe('deadlineBucket', () => {
  const baseDate = new Date(2026, 7, 4, 12, 0, 0) // Tuesday Aug 4, 2026 noon

  it('returns none for no dueAt', () => {
    const task = makeTask(1, { dueAt: null })
    expect(deadlineBucket(task, baseDate)).toBe('none')
  })

  it('returns none for an invalid dueAt instead of emitting garbage', () => {
    const task = makeTask(1, { dueAt: 'not-a-date' })
    expect(deadlineBucket(task, baseDate)).toBe('none')
  })

  it('returns soon for an overdue (past) instant', () => {
    const task = makeTask(1, { dueAt: due('2026-08-03', '09:00') })
    expect(deadlineBucket(task, baseDate)).toBe('soon')
  })

  it('returns soon for an instant just inside the 48-hour boundary', () => {
    const justInside = new Date(baseDate.getTime() + 48 * 60 * 60 * 1000 - 60 * 1000)
    const task = makeTask(1, { dueAt: justInside.toISOString() })
    expect(deadlineBucket(task, baseDate)).toBe('soon')
  })

  it('returns soon exactly at the 48-hour boundary', () => {
    const exactly = new Date(baseDate.getTime() + 48 * 60 * 60 * 1000)
    const task = makeTask(1, { dueAt: exactly.toISOString() })
    expect(deadlineBucket(task, baseDate)).toBe('soon')
  })

  it('returns week for an instant just outside the 48-hour boundary but within this week', () => {
    // baseDate is Tuesday; one minute past 48h lands Thursday, still within the week.
    const justOutside = new Date(baseDate.getTime() + 48 * 60 * 60 * 1000 + 60 * 1000)
    const task = makeTask(1, { dueAt: justOutside.toISOString() })
    expect(deadlineBucket(task, baseDate)).toBe('week')
  })

  it('returns week for due Sunday of the current week', () => {
    // Aug 4, 2026 is a Tuesday; Sunday of that week is Aug 9.
    const task = makeTask(1, { dueAt: due('2026-08-09', '23:00') })
    expect(deadlineBucket(task, baseDate)).toBe('week')
  })

  it('returns later for due Monday of next week', () => {
    const task = makeTask(1, { dueAt: due('2026-08-10', '00:00') })
    expect(deadlineBucket(task, baseDate)).toBe('later')
  })

  it('returns later for far-future dates', () => {
    const task = makeTask(1, { dueAt: due('2026-12-25') })
    expect(deadlineBucket(task, baseDate)).toBe('later')
  })
})

describe('groupByMatrix', () => {
  it('returns all 4 quadrants in order', () => {
    const groups = groupByMatrix([])
    expect(groups).toHaveLength(4)
    expect(groups[0].quadrant).toBe('do')
    expect(groups[1].quadrant).toBe('plan')
    expect(groups[2].quadrant).toBe('delegate')
    expect(groups[3].quadrant).toBe('drop')
  })

  it('distributes tasks to their quadrants', () => {
    const tasks = [
      makeTask(1, { important: true, urgent: true }),
      makeTask(2, { important: true, urgent: false }),
      makeTask(3, { important: false, urgent: true }),
      makeTask(4, { important: false, urgent: false }),
    ]
    const groups = groupByMatrix(tasks)
    expect(groups[0].tasks.map((t) => t.id)).toEqual([1])
    expect(groups[1].tasks.map((t) => t.id)).toEqual([2])
    expect(groups[2].tasks.map((t) => t.id)).toEqual([3])
    expect(groups[3].tasks.map((t) => t.id)).toEqual([4])
  })

  it('sorts tasks within each quadrant', () => {
    const tasks = [
      makeTask(3, { important: true, urgent: true, done: true }),
      makeTask(1, { important: true, urgent: true, done: false, dueAt: due('2026-08-05') }),
      makeTask(2, { important: true, urgent: true, done: false, dueAt: due('2026-08-10') }),
    ]
    const groups = groupByMatrix(tasks)
    // First group is 'do' — should have incomplete before done
    expect(groups[0].tasks.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('does not mutate the input', () => {
    const tasks = [makeTask(1), makeTask(2)]
    const original = JSON.parse(JSON.stringify(tasks))
    groupByMatrix(tasks)
    expect(tasks).toEqual(original)
  })
})

describe('groupByDeadline', () => {
  const now = new Date(2026, 7, 4, 12, 0, 0) // Aug 4 noon

  it('returns all 4 buckets in order', () => {
    const groups = groupByDeadline([], now)
    expect(groups).toHaveLength(4)
    expect(groups[0].bucket).toBe('soon')
    expect(groups[1].bucket).toBe('week')
    expect(groups[2].bucket).toBe('later')
    expect(groups[3].bucket).toBe('none')
  })

  it('distributes tasks to their deadline buckets', () => {
    const tasks = [
      makeTask(1, { dueAt: due('2026-08-04', '13:00') }), // soon
      makeTask(2, { dueAt: due('2026-08-09') }), // week
      makeTask(3, { dueAt: due('2026-08-20') }), // later
      makeTask(4, { dueAt: null }), // none
    ]
    const groups = groupByDeadline(tasks, now)
    expect(groups[0].tasks.map((t) => t.id)).toEqual([1])
    expect(groups[1].tasks.map((t) => t.id)).toEqual([2])
    expect(groups[2].tasks.map((t) => t.id)).toEqual([3])
    expect(groups[3].tasks.map((t) => t.id)).toEqual([4])
  })

  it('does not mutate the input', () => {
    const tasks = [makeTask(1), makeTask(2)]
    const original = JSON.parse(JSON.stringify(tasks))
    groupByDeadline(tasks, now)
    expect(tasks).toEqual(original)
  })
})

describe('formatDueLabel', () => {
  const baseDate = new Date(2026, 7, 4, 12, 0, 0) // Aug 4 noon

  it('returns overdue for past instants', () => {
    expect(formatDueLabel(due('2026-08-03', '09:00'), baseDate)).toBe('overdue')
  })

  it('returns today with time for same day', () => {
    const label = formatDueLabel(due('2026-08-04', '18:00'), baseDate)
    expect(label).toMatch(/today, \d+:\d{2} (AM|PM)/)
  })

  it('returns tomorrow with time for next day', () => {
    const label = formatDueLabel(due('2026-08-05'), baseDate)
    expect(label).toMatch(/tomorrow, \d+:\d{2} (AM|PM)/)
  })

  it('returns a 3-letter weekday abbreviation for dates within 7 days', () => {
    // Aug 4 is Tuesday, Aug 8 is Saturday
    expect(formatDueLabel(due('2026-08-08'), baseDate)).toBe('Sat')
  })

  it('returns date and month for dates beyond 7 days', () => {
    // Aug 15 is beyond 7 days from Aug 4
    expect(formatDueLabel(due('2026-08-15'), baseDate)).toBe('15 Aug')
  })

  it('returns an empty string for an invalid dueAt instead of NaN/undefined', () => {
    expect(formatDueLabel('not-a-date', baseDate)).toBe('')
  })
})

describe('formatDueChipLabel', () => {
  const baseDate = new Date(2026, 7, 4, 12, 0, 0) // Aug 4 noon

  it('prefixes overdue instants with "Overdue"', () => {
    expect(formatDueChipLabel(due('2026-08-03', '09:00'), baseDate)).toBe('Overdue')
  })

  it('prefixes same-day instants with "Due"', () => {
    expect(formatDueChipLabel(due('2026-08-04', '18:00'), baseDate)).toMatch(/^Due today, \d+:\d{2} (AM|PM)$/)
  })

  it('prefixes next-day instants with "Due"', () => {
    expect(formatDueChipLabel(due('2026-08-05'), baseDate)).toMatch(/^Due tomorrow, \d+:\d{2} (AM|PM)$/)
  })

  it('appends the day/month to weekday-abbreviation labels', () => {
    // Aug 8 is Saturday.
    expect(formatDueChipLabel(due('2026-08-08'), baseDate)).toBe('Due Sat, 8 Aug')
  })

  it('prefixes date-and-month labels with "Due"', () => {
    expect(formatDueChipLabel(due('2026-08-15'), baseDate)).toBe('Due 15 Aug')
  })

  it('returns an empty string for an invalid dueAt', () => {
    expect(formatDueChipLabel('not-a-date', baseDate)).toBe('')
  })
})

describe('taskMeta', () => {
  const now = new Date(2026, 7, 4, 12, 0, 0)

  it('returns null when no estimate and no dueAt', () => {
    const task = makeTask(1, { estimateMin: null, dueAt: null })
    expect(taskMeta(task, now)).toBeNull()
  })

  it('includes estimate when set', () => {
    const task = makeTask(1, { estimateMin: 90, dueAt: null })
    expect(taskMeta(task, now)).toContain('≈1 h 30 m left')
  })

  it('includes due label when set', () => {
    const task = makeTask(1, { estimateMin: null, dueAt: due('2026-08-04', '18:00') })
    expect(taskMeta(task, now)).toContain('due')
  })

  it('joins estimate and due with ·', () => {
    const task = makeTask(1, { estimateMin: 60, dueAt: due('2026-08-04', '18:00') })
    const meta = taskMeta(task, now)
    expect(meta).toContain('≈1 h left')
    expect(meta).toContain('due')
    expect(meta).toContain(' · ')
  })

  it('omits the due segment for an invalid dueAt rather than emitting garbage', () => {
    const task = makeTask(1, { estimateMin: 60, dueAt: 'not-a-date' })
    const meta = taskMeta(task, now)
    expect(meta).toBe('≈1 h left')
  })

  // Regression test for the shipped defect: dueAt was written as a full ISO
  // instant but parsed with `.split('-')`, which fed `Number(...)` a
  // fragment like "06T17:00:00.000Z" and produced NaN -> Invalid Date ->
  // "due NaN undefined" in the rendered meta line. This must never happen
  // for any due task, regardless of how far in the past/future.
  it('never contains "NaN" or "undefined" for a task with a due date', () => {
    const fixtures = [
      makeTask(1, { dueAt: due('2026-08-04', '09:00') }),
      makeTask(2, { dueAt: due('2026-08-05', '00:00') }),
      makeTask(3, { dueAt: due('2026-08-09', '23:59') }),
      makeTask(4, { dueAt: due('2026-08-20', '17:00') }),
      makeTask(5, { dueAt: due('2026-01-01', '00:00') }),
      makeTask(6, { estimateMin: 45, dueAt: due('2026-08-03', '08:00') }), // overdue
    ]
    for (const task of fixtures) {
      const meta = taskMeta(task, now)
      expect(meta).not.toContain('NaN')
      expect(meta).not.toContain('undefined')
    }
  })
})

describe('formatDuration (re-exported from lib/time)', () => {
  it('formats minutes only for < 60', () => {
    expect(formatDuration(30)).toBe('30 min')
  })

  it('formats hours only for exact hours', () => {
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(120)).toBe('2 h')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1 h 30 m')
    expect(formatDuration(150)).toBe('2 h 30 m')
  })
})

describe('blockDraftFromTask', () => {
  it('sets kind to deep for important tasks', () => {
    const task = makeTask(1, { important: true, estimateMin: 60 })
    const draft = blockDraftFromTask(task)
    expect(draft.kind).toBe('deep')
  })

  it('sets kind to shallow for non-important tasks', () => {
    const task = makeTask(1, { important: false, estimateMin: 60 })
    const draft = blockDraftFromTask(task)
    expect(draft.kind).toBe('shallow')
  })

  it('uses estimateMin when set, clamped to minimum 5', () => {
    const task = makeTask(1, { estimateMin: 2 })
    const draft = blockDraftFromTask(task)
    expect(draft.durationMin).toBe(5)
  })

  it('defaults to 60 min when estimateMin is null', () => {
    const task = makeTask(1, { estimateMin: null })
    const draft = blockDraftFromTask(task)
    expect(draft.durationMin).toBe(60)
  })

  it('computes deep pomodoros as Math.max(1, Math.round(durationMin / 30))', () => {
    const deep = makeTask(1, { important: true, estimateMin: 90 })
    expect(blockDraftFromTask(deep).pomodoros).toBe(3)

    const deep2 = makeTask(2, { important: true, estimateMin: 45 })
    expect(blockDraftFromTask(deep2).pomodoros).toBe(2)

    const deep3 = makeTask(3, { important: true, estimateMin: 10 })
    expect(blockDraftFromTask(deep3).pomodoros).toBe(1)
  })

  it('sets pomodoros to 0 for shallow tasks', () => {
    const task = makeTask(1, { important: false, estimateMin: 60 })
    const draft = blockDraftFromTask(task)
    expect(draft.pomodoros).toBe(0)
  })

  it('includes task id', () => {
    const task = makeTask(42, { estimateMin: 60 })
    const draft = blockDraftFromTask(task)
    expect(draft.taskId).toBe(42)
  })
})

describe('priorityFromQuadrant', () => {
  it('maps do to high', () => {
    expect(priorityFromQuadrant('do')).toBe('high')
  })

  it('maps plan to medium', () => {
    expect(priorityFromQuadrant('plan')).toBe('medium')
  })

  it('maps delegate to medium', () => {
    expect(priorityFromQuadrant('delegate')).toBe('medium')
  })

  it('maps drop to low', () => {
    expect(priorityFromQuadrant('drop')).toBe('low')
  })
})

describe('applyFilters', () => {
  const now = new Date(2026, 7, 4, 12, 0, 0)

  it('filters out done tasks when showCompleted is false', () => {
    const tasks = [
      makeTask(1, { done: true }),
      makeTask(2, { done: false }),
    ]
    const filtered = applyFilters(tasks, { ...DEFAULT_TODO_FILTERS, showCompleted: false }, now)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(2)
  })

  it('includes done tasks when showCompleted is true', () => {
    const tasks = [
      makeTask(1, { done: true }),
      makeTask(2, { done: false }),
    ]
    const filtered = applyFilters(tasks, { ...DEFAULT_TODO_FILTERS, showCompleted: true }, now)
    expect(filtered).toHaveLength(2)
  })

  it('filters to tasks with parseable dueAt when deadline is has', () => {
    const tasks = [
      makeTask(1, { dueAt: due('2026-08-05') }),
      makeTask(2, { dueAt: null }),
      makeTask(3, { dueAt: 'invalid' }),
    ]
    const filtered = applyFilters(tasks, { ...DEFAULT_TODO_FILTERS, deadline: 'has' }, now)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(1)
  })

  it('filters to tasks without parseable dueAt when deadline is none', () => {
    const tasks = [
      makeTask(1, { dueAt: due('2026-08-05') }),
      makeTask(2, { dueAt: null }),
      makeTask(3, { dueAt: 'invalid' }),
    ]
    const filtered = applyFilters(tasks, { ...DEFAULT_TODO_FILTERS, deadline: 'none' }, now)
    expect(filtered).toHaveLength(2)
    expect(filtered.map((t) => t.id)).toEqual([2, 3])
  })

  it('filters to overdue tasks when overdueOnly is true', () => {
    const tasks = [
      makeTask(1, { dueAt: due('2026-08-03', '09:00') }), // past
      makeTask(2, { dueAt: due('2026-08-10', '09:00') }), // future
      makeTask(3, { dueAt: null }),
    ]
    const filtered = applyFilters(tasks, { ...DEFAULT_TODO_FILTERS, overdueOnly: true }, now)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(1)
  })

  it('combines filters: showCompleted=false and deadline=has', () => {
    const tasks = [
      makeTask(1, { done: true, dueAt: due('2026-08-05') }),
      makeTask(2, { done: false, dueAt: due('2026-08-05') }),
      makeTask(3, { done: false, dueAt: null }),
    ]
    const filtered = applyFilters(tasks, { showCompleted: false, deadline: 'has', overdueOnly: false }, now)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(2)
  })

  it('does not mutate the input array', () => {
    const tasks = [
      makeTask(1, { done: true }),
      makeTask(2, { done: false }),
    ]
    const original = JSON.parse(JSON.stringify(tasks))
    applyFilters(tasks, { showCompleted: false, deadline: 'any', overdueOnly: false }, now)
    expect(tasks).toEqual(original)
  })
})

describe('filtersActive', () => {
  it('returns false when all filters match defaults', () => {
    expect(filtersActive(DEFAULT_TODO_FILTERS)).toBe(false)
  })

  it('returns true when showCompleted differs from default', () => {
    expect(filtersActive({ ...DEFAULT_TODO_FILTERS, showCompleted: false })).toBe(true)
  })

  it('returns true when deadline differs from default', () => {
    expect(filtersActive({ ...DEFAULT_TODO_FILTERS, deadline: 'has' })).toBe(true)
  })

  it('returns true when overdueOnly differs from default', () => {
    expect(filtersActive({ ...DEFAULT_TODO_FILTERS, overdueOnly: true })).toBe(true)
  })
})

describe('sortGroup', () => {
  it('manual mode uses sortTasks', () => {
    const tasks = [
      makeTask(3, { done: false, sort: 2 }),
      makeTask(1, { done: false, sort: 0 }),
      makeTask(2, { done: false, sort: 1 }),
    ]
    const sorted = sortGroup(tasks, 'manual')
    expect(sorted.map((t) => t.id)).toEqual([1, 2, 3])
  })

  it('due mode sorts by dueAt instant ascending', () => {
    const tasks = [
      makeTask(1, { dueAt: due('2026-08-10') }),
      makeTask(2, { dueAt: due('2026-08-05') }),
      makeTask(3, { dueAt: due('2026-08-08') }),
    ]
    const sorted = sortGroup(tasks, 'due')
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1])
  })

  it('due mode puts tasks without dueAt at the end', () => {
    const tasks = [
      makeTask(1, { dueAt: due('2026-08-10') }),
      makeTask(2, { dueAt: null }),
      makeTask(3, { dueAt: due('2026-08-05') }),
    ]
    const sorted = sortGroup(tasks, 'due')
    expect(sorted.map((t) => t.id)).toEqual([3, 1, 2])
  })

  it('priority mode sorts by priority order', () => {
    const tasks = [
      makeTask(1, { priority: 'low' }),
      makeTask(2, { priority: 'high' }),
      makeTask(3, { priority: 'medium' }),
    ]
    const sorted = sortGroup(tasks, 'priority')
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1])
  })

  it('title mode sorts case-insensitively', () => {
    const tasks = [
      makeTask(1, { title: 'zebra' }),
      makeTask(2, { title: 'Apple' }),
      makeTask(3, { title: 'Banana' }),
    ]
    const sorted = sortGroup(tasks, 'title')
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1])
  })

  it('preserves input order for ties', () => {
    const tasks = [
      makeTask(3, { dueAt: due('2026-08-10') }),
      makeTask(1, { dueAt: due('2026-08-10') }),
      makeTask(2, { dueAt: due('2026-08-10') }),
    ]
    const sorted = sortGroup(tasks, 'due')
    expect(sorted.map((t) => t.id)).toEqual([3, 1, 2])
  })

  it('does not mutate the input array', () => {
    const tasks = [
      makeTask(3, { dueAt: due('2026-08-10') }),
      makeTask(1, { dueAt: due('2026-08-05') }),
    ]
    const original = JSON.parse(JSON.stringify(tasks))
    sortGroup(tasks, 'due')
    expect(tasks).toEqual(original)
  })
})

describe('dragDisabledReason', () => {
  it('returns null when sort is manual and filters are not active', () => {
    const reason = dragDisabledReason({ sort: 'manual', filters: DEFAULT_TODO_FILTERS })
    expect(reason).toBeNull()
  })

  it('returns sort message when sort is not manual', () => {
    const reason = dragDisabledReason({ sort: 'due', filters: DEFAULT_TODO_FILTERS })
    expect(reason).toContain('Set sort to Manual')
  })

  it('returns filter message when filters are active and sort is manual', () => {
    const reason = dragDisabledReason({ sort: 'manual', filters: { ...DEFAULT_TODO_FILTERS, showCompleted: false } })
    expect(reason).toContain('Clear filters')
  })

  it('prioritizes sort over filters in precedence', () => {
    const reason = dragDisabledReason({
      sort: 'due',
      filters: { ...DEFAULT_TODO_FILTERS, showCompleted: false },
    })
    expect(reason).toContain('Set sort to Manual')
  })
})

describe('upcomingTasks', () => {
  const now = new Date(2026, 7, 4, 12, 0, 0)

  it('returns empty for no tasks', () => {
    expect(upcomingTasks([], now)).toEqual([])
  })

  it('excludes done tasks', () => {
    const tasks = [
      makeTask(1, { done: false, important: true, urgent: true }),
      makeTask(2, { done: true, important: true, urgent: true }),
    ]
    const upcoming = upcomingTasks(tasks, now)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0].task.id).toBe(1)
  })

  it('ranks by quadrant priority: do, plan, delegate, drop', () => {
    const tasks = [
      makeTask(1, { important: false, urgent: false }),
      makeTask(2, { important: true, urgent: false }),
      makeTask(3, { important: false, urgent: true }),
      makeTask(4, { important: true, urgent: true }),
    ]
    const upcoming = upcomingTasks(tasks, now)
    expect(upcoming.map((u) => u.task.id)).toEqual([4, 2, 3, 1])
  })

  it('uses transitive comparator for tie-breaking within quadrants', () => {
    const tasks = [
      makeTask(5, { sort: 2, important: true, urgent: true }),
      makeTask(3, { sort: 0, important: true, urgent: true }),
      makeTask(4, { sort: 1, important: true, urgent: true }),
    ]
    const upcoming = upcomingTasks(tasks, now)
    expect(upcoming.map((u) => u.task.id)).toEqual([3, 4, 5])
  })

  it('caps at default limit of 5', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask(i + 1))
    const upcoming = upcomingTasks(tasks, now)
    expect(upcoming).toHaveLength(5)
  })

  it('respects custom limit', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask(i + 1))
    const upcoming = upcomingTasks(tasks, now, 3)
    expect(upcoming).toHaveLength(3)
  })

  it('includes rankColor for each task', () => {
    const tasks = [makeTask(1, { important: true, urgent: true })]
    const upcoming = upcomingTasks(tasks, now)
    expect(upcoming[0].rankColor).toBe('var(--danger)')
  })
})

describe('QUADRANTS metadata', () => {
  it('has exactly 4 quadrants in expected order', () => {
    expect(QUADRANTS).toHaveLength(4)
    expect(QUADRANTS.map((q) => q.quadrant)).toEqual(['do', 'plan', 'delegate', 'drop'])
  })

  it('all have labels and dot tokens', () => {
    for (const q of QUADRANTS) {
      expect(q.label).toBeTruthy()
      expect(q.dot).toBeTruthy()
    }
  })
})

describe('DEADLINE_BUCKETS metadata', () => {
  it('has exactly 4 buckets in expected order', () => {
    expect(DEADLINE_BUCKETS).toHaveLength(4)
    expect(DEADLINE_BUCKETS.map((b) => b.bucket)).toEqual(['soon', 'week', 'later', 'none'])
  })

  it('all have labels and dot tokens', () => {
    for (const b of DEADLINE_BUCKETS) {
      expect(b.label).toBeTruthy()
      expect(b.dot).toBeTruthy()
    }
  })
})
