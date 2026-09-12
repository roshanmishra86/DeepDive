import { describe, it, expect } from 'vitest'
import {
  groupInboxBlocks,
  sortInboxGroup,
  filterInboxBlocks,
  computeInboxMetrics,
  formatLoggedTime,
  formatEstimateTime,
  getTagPillClass,
} from './inbox'
import type { DayBlock } from '../db/types'

function makeBlock(overrides: Partial<DayBlock> = {}): DayBlock {
  return {
    id: 1,
    day: '2026-09-11',
    taskId: null,
    subtaskId: null,
    title: 'Test Block',
    kind: 'deep',
    startMin: 0,
    durationMin: 30,
    pomodoros: 1,
    completed: false,
    sort: 0,
    note: '',
    noteUpdatedAt: null,
    repeat: 'once',
    trackId: null,
    quiet: false,
    inboxGroup: 'capture',
    energy: 'medium',
    tags: [],
    loggedSec: 0,
    carriedOver: false,
    importedFromTodo: false,
    ...overrides,
  }
}

describe('groupInboxBlocks', () => {
  it('groups blocks correctly according to inboxGroup property', () => {
    const b1 = makeBlock({ id: 1, inboxGroup: 'working' })
    const b2 = makeBlock({ id: 2, inboxGroup: 'next' })
    const b3 = makeBlock({ id: 3, inboxGroup: 'capture' })
    const b4 = makeBlock({ id: 4, inboxGroup: 'waiting' })
    const b5 = makeBlock({ id: 5, inboxGroup: undefined }) // fallback to capture

    const grouped = groupInboxBlocks([b1, b2, b3, b4, b5])
    expect(grouped.working).toEqual([b1])
    expect(grouped.next).toEqual([b2])
    expect(grouped.capture).toEqual([b3, b5])
    expect(grouped.waiting).toEqual([b4])
  })
})

describe('sortInboxGroup', () => {
  it('sorts by added (id)', () => {
    const b1 = makeBlock({ id: 20 })
    const b2 = makeBlock({ id: 5 })
    const sorted = sortInboxGroup([b1, b2], 'added')
    expect(sorted.map((b) => b.id)).toEqual([5, 20])
  })

  it('sorts by priority / energy (high > medium > low)', () => {
    const bLow = makeBlock({ id: 1, energy: 'low' })
    const bHigh = makeBlock({ id: 2, energy: 'high' })
    const bMed = makeBlock({ id: 3, energy: 'medium' })
    const sorted = sortInboxGroup([bLow, bHigh, bMed], 'priority')
    expect(sorted.map((b) => b.id)).toEqual([2, 3, 1])
  })

  it('sorts by estimate duration descending', () => {
    const b1 = makeBlock({ id: 1, durationMin: 15 })
    const b2 = makeBlock({ id: 2, durationMin: 90 })
    const b3 = makeBlock({ id: 3, durationMin: 45 })
    const sorted = sortInboxGroup([b1, b2, b3], 'estimate')
    expect(sorted.map((b) => b.id)).toEqual([2, 3, 1])
  })

  it('sorts alphabetically by title', () => {
    const b1 = makeBlock({ id: 1, title: 'Write docs' })
    const b2 = makeBlock({ id: 2, title: 'Answer email' })
    const sorted = sortInboxGroup([b1, b2], 'title')
    expect(sorted.map((b) => b.title)).toEqual(['Answer email', 'Write docs'])
  })
})

describe('filterInboxBlocks', () => {
  it('filters by energy level', () => {
    const b1 = makeBlock({ id: 1, energy: 'high' })
    const b2 = makeBlock({ id: 2, energy: 'low' })
    expect(filterInboxBlocks([b1, b2], { energy: 'high' })).toEqual([b1])
    expect(filterInboxBlocks([b1, b2], { energy: 'all' })).toEqual([b1, b2])
  })

  it('filters by tag', () => {
    const b1 = makeBlock({ id: 1, tags: ['Deep Work', 'Writing'] })
    const b2 = makeBlock({ id: 2, tags: ['Admin'] })
    expect(filterInboxBlocks([b1, b2], { tag: 'Writing' })).toEqual([b1])
    expect(filterInboxBlocks([b1, b2], { tag: 'Admin' })).toEqual([b2])
  })

  it('filters by completion status', () => {
    const b1 = makeBlock({ id: 1, completed: true })
    const b2 = makeBlock({ id: 2, completed: false })
    expect(filterInboxBlocks([b1, b2], { completed: 'active' })).toEqual([b2])
    expect(filterInboxBlocks([b1, b2], { completed: 'done' })).toEqual([b1])
  })
})

describe('computeInboxMetrics', () => {
  it('correctly calculates captured, completed, focus time, and imported count', () => {
    const b1 = makeBlock({ id: 1, completed: true, loggedSec: 1800, importedFromTodo: true })
    const b2 = makeBlock({ id: 2, completed: false, loggedSec: 1080, importedFromTodo: true })
    const b3 = makeBlock({ id: 3, completed: true, loggedSec: 0, importedFromTodo: false })

    const metrics = computeInboxMetrics([b1, b2, b3])
    expect(metrics.capturedToday).toBe(3)
    expect(metrics.completedToday).toBe(2)
    expect(metrics.focusSecLogged).toBe(2880) // 48 min
    expect(metrics.focusHoursLogged).toBe('0.8 h')
    expect(metrics.importedFromTodoCount).toBe(2)
  })
})

describe('formatLoggedTime & formatEstimateTime', () => {
  it('formats logged time seconds properly', () => {
    expect(formatLoggedTime(0)).toBe('0 min')
    expect(formatLoggedTime(120)).toBe('2 min')
    expect(formatLoggedTime(1080)).toBe('18 min')
    expect(formatLoggedTime(3600)).toBe('1.0 h')
    expect(formatLoggedTime(5400)).toBe('1.5 h')
  })

  it('formats estimate duration properly', () => {
    expect(formatEstimateTime(0)).toBe('0 min')
    expect(formatEstimateTime(15)).toBe('15 min')
    expect(formatEstimateTime(45)).toBe('45 min')
    expect(formatEstimateTime(60)).toBe('1 h')
    expect(formatEstimateTime(90)).toBe('90 min')
    expect(formatEstimateTime(120)).toBe('2 h')
  })
})

describe('getTagPillClass', () => {
  it('maps categories to CSS classes', () => {
    expect(getTagPillClass('Deep Work')).toBe('tag-deep-work')
    expect(getTagPillClass('Admin')).toBe('tag-admin')
    expect(getTagPillClass('Research')).toBe('tag-research')
    expect(getTagPillClass('Reading')).toBe('tag-reading')
    expect(getTagPillClass('Communication')).toBe('tag-communication')
    expect(getTagPillClass('Planning')).toBe('tag-planning')
    expect(getTagPillClass('Errand')).toBe('tag-errand')
    expect(getTagPillClass('Waiting')).toBe('tag-waiting')
    expect(getTagPillClass('Custom Project')).toBe('tag-neutral')
  })
})
