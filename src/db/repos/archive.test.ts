import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as archive from './archive'
import * as blocks from './blocks'

describe('archive repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('computes day statuses correctly', async () => {
    const day1 = '2026-08-01'
    const day2 = '2026-08-02'
    const day3 = '2026-08-03'

    // day1: all completed (full)
    const b1 = await blocks.createBlock(driver, {
      day: day1,
      title: 'Block 1',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, b1, true)

    // day2: none completed (miss)
    await blocks.createBlock(driver, {
      day: day2,
      title: 'Block 2',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })

    // day3: some completed (part)
    const b3a = await blocks.createBlock(driver, {
      day: day3,
      title: 'Block 3a',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.createBlock(driver, {
      day: day3,
      title: 'Block 3b',
      kind: 'deep',
      startMin: 390,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, b3a, true)

    const statuses = await archive.dayStatuses(driver, day1, day3)
    expect(statuses[day1]).toBe('full')
    expect(statuses[day2]).toBe('miss')
    expect(statuses[day3]).toBe('part')
  })

  it('omits days with no blocks from statuses', async () => {
    const day = '2026-08-10'
    const statuses = await archive.dayStatuses(driver, day, day)
    expect(statuses[day]).toBeUndefined()
  })

  it('dayRecord.deepMin counts only completed deep blocks (matches weekday/12wk aggregates)', async () => {
    const day = '2026-08-10'
    const completedDeep = await blocks.createBlock(driver, {
      day,
      title: 'Deep work (done)',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, completedDeep, true)
    // planned but never completed — must NOT count toward deepMin
    await blocks.createBlock(driver, {
      day,
      title: 'Deep work (planned)',
      kind: 'deep',
      startMin: 450,
      durationMin: 60,
    })

    const record = await archive.dayRecord(driver, day)
    expect(record?.deepMin).toBe(90)
  })

  it('returns zeroed headline stats for an empty db', async () => {
    const stats = await archive.headlineStats(driver, '2026-08-10')
    expect(stats).toEqual({ blocksDone: 0, completionPct: 0, dayStreak: 0 })
  })

  it('computes completionPct as a rounded percentage', async () => {
    // 3 of 4 blocks completed => 75%
    for (let i = 0; i < 4; i++) {
      const id = await blocks.createBlock(driver, {
        day: '2026-08-10',
        title: `Block ${i}`,
        kind: 'deep',
        startMin: 300 + i * 60,
        durationMin: 30,
      })
      if (i < 3) await blocks.setBlockCompleted(driver, id, true)
    }
    const stats = await archive.headlineStats(driver, '2026-08-10')
    expect(stats.blocksDone).toBe(3)
    expect(stats.completionPct).toBe(75)
  })

  it('counts a 3-day streak ending today', async () => {
    const today = '2026-08-10'
    const days = ['2026-08-08', '2026-08-09', '2026-08-10']
    for (const day of days) {
      const id = await blocks.createBlock(driver, {
        day,
        title: 'Deep work',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
      })
      await blocks.setBlockCompleted(driver, id, true)
    }
    const stats = await archive.headlineStats(driver, today)
    expect(stats.dayStreak).toBe(3)
  })

  it('breaks the streak at a gap', async () => {
    const today = '2026-08-10'
    // completed on 08-08 and 08-10, but a gap on 08-09
    for (const day of ['2026-08-08', '2026-08-10']) {
      const id = await blocks.createBlock(driver, {
        day,
        title: 'Deep work',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
      })
      await blocks.setBlockCompleted(driver, id, true)
    }
    // 08-09 has a block, but it is not completed
    await blocks.createBlock(driver, {
      day: '2026-08-09',
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })
    const stats = await archive.headlineStats(driver, today)
    expect(stats.dayStreak).toBe(1) // only today counts; yesterday breaks it
  })

  it('does not zero a streak that ran through yesterday when today is empty', async () => {
    const today = '2026-08-10'
    for (const day of ['2026-08-08', '2026-08-09']) {
      const id = await blocks.createBlock(driver, {
        day,
        title: 'Deep work',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
      })
      await blocks.setBlockCompleted(driver, id, true)
    }
    // today has no blocks at all
    const stats = await archive.headlineStats(driver, today)
    expect(stats.dayStreak).toBe(2)
  })

  it('computes deep minutes by weekday', async () => {
    // Create blocks for a week (Mon 2026-08-04 to Sun 2026-08-10)
    const monday = '2026-08-04'

    // Monday: 90 deep minutes
    const monBlock = await blocks.createBlock(driver, {
      day: monday,
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, monBlock, true)

    // Tuesday: 60 deep minutes
    const tueBlock = await blocks.createBlock(driver, {
      day: '2026-08-05',
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })
    await blocks.setBlockCompleted(driver, tueBlock, true)

    const minutes = await archive.deepMinutesByWeekday(driver, monday)
    expect(minutes.length).toBe(7)
    expect(minutes[0]).toBe(90) // Monday
    expect(minutes[1]).toBe(60) // Tuesday
    expect(minutes[2]).toBe(0) // Wednesday
  })

  it('computes deep hours last 12 weeks with real values in the right slots', async () => {
    const mondayStr = '2026-08-04' // Monday, current week

    // Current week: 120 completed deep minutes = 2.0 h
    const curBlock = await blocks.createBlock(driver, {
      day: '2026-08-04',
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 120,
    })
    await blocks.setBlockCompleted(driver, curBlock, true)

    // 3 weeks ago (Monday 2026-07-14): 90 completed deep minutes = 1.5 h
    const pastBlock = await blocks.createBlock(driver, {
      day: '2026-07-14',
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, pastBlock, true)

    const weeks = await archive.deepHoursLast12Weeks(driver, mondayStr)
    expect(weeks.length).toBe(12)
    // Oldest first, newest (current week) last
    expect(weeks[11].weekStart).toBe('2026-08-04')
    expect(weeks[11].hours).toBe(2.0)
    expect(weeks[8].weekStart).toBe('2026-07-14') // 11 - 3 = index 8
    expect(weeks[8].hours).toBe(1.5)
    // Weeks with no data are exactly 0
    expect(weeks[0].hours).toBe(0)
    expect(new Date(weeks[0].weekStart).getTime()).toBeLessThan(
      new Date(weeks[11].weekStart).getTime()
    )
  })

  it('deepMinutesByWeekday ignores non-deep and non-completed blocks', async () => {
    const monday = '2026-08-04'
    // Monday: a completed deep block (counts) and a completed shallow block (ignored)
    const deepBlock = await blocks.createBlock(driver, {
      day: monday,
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, deepBlock, true)
    await blocks.createBlock(driver, {
      day: monday,
      title: 'Email',
      kind: 'shallow',
      startMin: 400,
      durationMin: 45,
    })
    // Tuesday: a deep block that is never completed (ignored)
    await blocks.createBlock(driver, {
      day: '2026-08-05',
      title: 'Deep work (planned)',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })

    const minutes = await archive.deepMinutesByWeekday(driver, monday)
    expect(minutes[0]).toBe(90)
    expect(minutes[1]).toBe(0)
  })
})
