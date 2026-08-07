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

  it('dayRecord returns a record for a zero-block day with a shut-down note', async () => {
    // Phase 7 requirement: a day with a note but no blocks should return a record
    const day = '2026-08-15'

    // Create only a note, no blocks
    await driver.execute(
      'INSERT INTO day_note (day, note) VALUES (?, ?)',
      [day, 'Rest day. Needed time off.']
    )

    const record = await archive.dayRecord(driver, day)
    expect(record).not.toBeNull()
    expect(record?.day).toBe(day)
    expect(record?.blockCount).toBe(0)
    expect(record?.completedCount).toBe(0)
    expect(record?.note).toBe('Rest day. Needed time off.')
    // A zero-block day with a note is 'note', never 'miss' — 'miss' asserts
    // blocks were planned and none landed, which is false here: nothing was
    // planned at all. See the Phase 7 review in TASKS.md.
    expect(record?.status).toBe('note')
  })

  it('dayStatuses agrees with dayRecord on status for every day-kind: full, part, miss, note-only, zero-block-no-note', async () => {
    // dayStatuses and dayRecord are two independent SQL implementations of
    // "what is this day's status" — the project's documented recurring
    // defect class is exactly this kind of two-sources-of-truth drift.
    const fullDay = '2026-09-01'
    const partDay = '2026-09-02'
    const missDay = '2026-09-03'
    const noteDay = '2026-09-04'
    const emptyDay = '2026-09-05'

    // full: all blocks completed
    const fullId = await blocks.createBlock(driver, {
      day: fullDay,
      title: 'Full',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })
    await blocks.setBlockCompleted(driver, fullId, true)

    // part: one completed, one not
    const partId1 = await blocks.createBlock(driver, {
      day: partDay,
      title: 'Part 1',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })
    await blocks.createBlock(driver, {
      day: partDay,
      title: 'Part 2',
      kind: 'deep',
      startMin: 400,
      durationMin: 60,
    })
    await blocks.setBlockCompleted(driver, partId1, true)

    // miss: blocks exist, none completed
    await blocks.createBlock(driver, {
      day: missDay,
      title: 'Miss',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })

    // note-only: zero blocks, a shut-down note
    await driver.execute('INSERT INTO day_note (day, note) VALUES (?, ?)', [noteDay, 'Off today.'])

    // emptyDay: nothing at all -> dayRecord returns null, dayStatuses has no entry

    const statuses = await archive.dayStatuses(driver, fullDay, emptyDay)

    const fullRecord = await archive.dayRecord(driver, fullDay)
    const partRecord = await archive.dayRecord(driver, partDay)
    const missRecord = await archive.dayRecord(driver, missDay)
    const noteRecord = await archive.dayRecord(driver, noteDay)
    const emptyRecord = await archive.dayRecord(driver, emptyDay)

    expect(statuses[fullDay]).toBe('full')
    expect(fullRecord?.status).toBe('full')

    expect(statuses[partDay]).toBe('part')
    expect(partRecord?.status).toBe('part')

    expect(statuses[missDay]).toBe('miss')
    expect(missRecord?.status).toBe('miss')

    expect(statuses[noteDay]).toBe('note')
    expect(noteRecord?.status).toBe('note')

    expect(statuses[emptyDay]).toBeUndefined()
    expect(emptyRecord).toBeNull()
  })

  it('dayRecord returns null for a day with no blocks and no note', async () => {
    const day = '2026-08-20'
    const record = await archive.dayRecord(driver, day)
    expect(record).toBeNull()
  })

  it('dayRecord orders blocks by sortBlocks (startMin, then sort)', async () => {
    const day = '2026-08-25'

    // Create blocks out of chronological order
    // Block 2: starts at 390 (7:30 AM), sort = 0
    await blocks.createBlock(driver, {
      day,
      title: 'Block 2',
      kind: 'deep',
      startMin: 390,
      durationMin: 60,
      sort: 0,
    })

    // Block 1: starts at 300 (5:00 AM), sort = 0
    await blocks.createBlock(driver, {
      day,
      title: 'Block 1',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
      sort: 0,
    })

    // Block 3: starts at 300 (5:00 AM), sort = 1 (should come after Block 1)
    await blocks.createBlock(driver, {
      day,
      title: 'Block 3',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
      sort: 1,
    })

    const record = await archive.dayRecord(driver, day)
    expect(record).not.toBeNull()
    expect(record?.blocks.length).toBe(3)

    // Verify order: Block 1 (300, sort 0), Block 3 (300, sort 1), Block 2 (390, sort 0)
    expect(record?.blocks[0].title).toBe('Block 1')
    expect(record?.blocks[1].title).toBe('Block 3')
    expect(record?.blocks[2].title).toBe('Block 2')
  })
})
