import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as blocks from './blocks'

interface BlockRowSnapshot {
  id: number
  day: string
  start_min: number
  sort: number
}

describe('blocks repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('creates and retrieves a block', async () => {
    const day = '2026-08-03'
    const id = await blocks.createBlock(driver, {
      day,
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      pomodoros: 3,
    })

    const retrieved = await blocks.listBlocksForDay(driver, day)
    const block = retrieved.find((b) => b.id === id)
    expect(block).not.toBeUndefined()
    expect(block?.title).toBe('Deep work')
    expect(block?.kind).toBe('deep')
    expect(block?.completed).toBe(false)
  })

  it('lists blocks ordered by sort and start_min', async () => {
    const day = '2026-08-03'
    const id2 = await blocks.createBlock(driver, {
      day,
      title: 'Second',
      kind: 'deep',
      startMin: 400,
      durationMin: 60,
      sort: 1,
    })
    const id1 = await blocks.createBlock(driver, {
      day,
      title: 'First',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      sort: 0,
    })

    const dayBlocks = await blocks.listBlocksForDay(driver, day)
    expect(dayBlocks[0].id).toBe(id1)
    expect(dayBlocks[1].id).toBe(id2)
  })

  it('deletes a block', async () => {
    const day = '2026-08-03'
    const id = await blocks.createBlock(driver, {
      day,
      title: 'Delete me',
      kind: 'break',
      startMin: 500,
      durationMin: 30,
    })

    await blocks.deleteBlock(driver, id)

    const dayBlocks = await blocks.listBlocksForDay(driver, day)
    expect(dayBlocks.some((b) => b.id === id)).toBe(false)
  })

  it('marks block as completed', async () => {
    const day = '2026-08-03'
    const id = await blocks.createBlock(driver, {
      day,
      title: 'Complete me',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })

    await blocks.setBlockCompleted(driver, id, true)

    const retrieved = await blocks.listBlocksForDay(driver, day)
    const block = retrieved.find((b) => b.id === id)
    expect(block?.completed).toBe(true)
  })

  it('reorders blocks on a day', async () => {
    const day = '2026-08-03'
    const id1 = await blocks.createBlock(driver, {
      day,
      title: 'First',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      sort: 0,
    })
    const id2 = await blocks.createBlock(driver, {
      day,
      title: 'Second',
      kind: 'deep',
      startMin: 400,
      durationMin: 60,
      sort: 1,
    })

    await blocks.reorderBlocks(driver, day, [id2, id1])

    const dayBlocks = await blocks.listBlocksForDay(driver, day)
    expect(dayBlocks[0].id).toBe(id2)
    expect(dayBlocks[1].id).toBe(id1)
  })

  it('applies template to day', async () => {
    // Maker Day template is seeded with 5 blocks
    const templateId = 1 // Maker Day

    const day = '2026-08-04'
    await blocks.applyTemplateToDay(driver, templateId, day)

    const dayBlocks = await blocks.listBlocksForDay(driver, day)
    expect(dayBlocks.length).toBe(5)
    expect(dayBlocks[0].title).toBe('Morning pages')
    expect(dayBlocks[1].title).toBe('Deep block — main project')
  })

  it('replaces existing blocks when applying template', async () => {
    const day = '2026-08-05'

    // Create initial blocks
    await blocks.createBlock(driver, {
      day,
      title: 'Old block',
      kind: 'break',
      startMin: 600,
      durationMin: 30,
    })

    // Apply template
    const templateId = 1 // Maker Day
    await blocks.applyTemplateToDay(driver, templateId, day)

    const dayBlocks = await blocks.listBlocksForDay(driver, day)
    expect(dayBlocks.length).toBe(5)
    expect(dayBlocks.every((b) => b.title !== 'Old block')).toBe(true)
  })

  it('computes day totals', async () => {
    const day = '2026-08-06'

    await blocks.createBlock(driver, {
      day,
      title: 'Deep 90m',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.createBlock(driver, {
      day,
      title: 'Break 30m',
      kind: 'break',
      startMin: 390,
      durationMin: 30,
    })
    await blocks.createBlock(driver, {
      day,
      title: 'Shallow 60m',
      kind: 'shallow',
      startMin: 420,
      durationMin: 60,
    })

    const totals = await blocks.dayTotals(driver, day)
    expect(totals.plannedMin).toBe(180)
    expect(totals.deepMin).toBe(90)
    expect(totals.endMin).toBe(480)
    expect(totals.blockCount).toBe(3)
    expect(totals.completedCount).toBe(0)
  })

  it('computes day totals as all-zero for a day with no blocks', async () => {
    const totals = await blocks.dayTotals(driver, '2026-08-09')
    expect(totals).toEqual({
      plannedMin: 0,
      deepMin: 0,
      endMin: 0,
      blockCount: 0,
      completedCount: 0,
    })
  })

  it('round-trips the block composer fields (note, repeat, trackId, quiet) through real SQLite', async () => {
    const day = '2026-08-12'
    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/focus.mp3', 'Focus', 'ambient']
    )

    const id = await blocks.createBlock(driver, {
      day,
      title: 'Composed block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      note: 'Ship the thing',
      repeat: 'daily',
      trackId: trackId.lastInsertId,
      quiet: true,
    })

    const retrieved = await blocks.listBlocksForDay(driver, day)
    const block = retrieved.find((b) => b.id === id)
    expect(block?.note).toBe('Ship the thing')
    expect(block?.repeat).toBe('daily')
    expect(block?.trackId).toBe(trackId.lastInsertId)
    expect(block?.quiet).toBe(true)
  })

  it('defaults the block composer fields when not provided', async () => {
    const day = '2026-08-13'
    const id = await blocks.createBlock(driver, {
      day,
      title: 'Plain block',
      kind: 'shallow',
      startMin: 300,
      durationMin: 30,
    })

    const retrieved = await blocks.listBlocksForDay(driver, day)
    const block = retrieved.find((b) => b.id === id)
    expect(block?.note).toBe('')
    expect(block?.repeat).toBe('once')
    expect(block?.trackId).toBeNull()
    expect(block?.quiet).toBe(false)
  })

  it('updateBlock persists note, repeat, trackId, and quiet', async () => {
    const day = '2026-08-14'
    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/deep.mp3', 'Deep', 'ambient']
    )
    const id = await blocks.createBlock(driver, {
      day,
      title: 'Editable block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })

    await blocks.updateBlock(driver, id, {
      note: 'Updated note',
      repeat: 'weekdays',
      trackId: trackId.lastInsertId,
      quiet: true,
    })

    const retrieved = await blocks.listBlocksForDay(driver, day)
    const block = retrieved.find((b) => b.id === id)
    expect(block?.note).toBe('Updated note')
    expect(block?.repeat).toBe('weekdays')
    expect(block?.trackId).toBe(trackId.lastInsertId)
    expect(block?.quiet).toBe(true)
  })

  it('round-trips noteUpdatedAt, and updateBlock persists it alongside note', async () => {
    const day = '2026-08-17'
    const id = await blocks.createBlock(driver, {
      day,
      title: 'Noted block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      note: 'First draft',
      noteUpdatedAt: '2026-08-17T09:00:00.000Z',
    })

    let block = (await blocks.listBlocksForDay(driver, day)).find((b) => b.id === id)
    expect(block?.noteUpdatedAt).toBe('2026-08-17T09:00:00.000Z')

    await blocks.updateBlock(driver, id, {
      note: 'Second draft',
      noteUpdatedAt: '2026-08-17T10:30:00.000Z',
    })

    block = (await blocks.listBlocksForDay(driver, day)).find((b) => b.id === id)
    expect(block?.note).toBe('Second draft')
    expect(block?.noteUpdatedAt).toBe('2026-08-17T10:30:00.000Z')
  })

  it('defaults noteUpdatedAt to null when not provided', async () => {
    const day = '2026-08-18'
    const id = await blocks.createBlock(driver, {
      day,
      title: 'Unnoted block',
      kind: 'shallow',
      startMin: 300,
      durationMin: 30,
    })

    const block = (await blocks.listBlocksForDay(driver, day)).find((b) => b.id === id)
    expect(block?.noteUpdatedAt).toBeNull()
  })

  it('enforces the repeat CHECK constraint at the SQL boundary', async () => {
    const day = '2026-08-15'
    let error: unknown = null
    try {
      await driver.execute(
        'INSERT INTO day_block (day, title, kind, start_min, duration_min, "repeat") VALUES (?, ?, ?, ?, ?, ?)',
        [day, 'Bad repeat', 'deep', 300, 90, 'weekly']
      )
    } catch (e) {
      error = e
    }
    expect(error).not.toBeNull()
  })

  it('nulls out trackId when the referenced track is deleted', async () => {
    const day = '2026-08-16'
    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/gone.mp3', 'Gone', 'ambient']
    )
    const id = await blocks.createBlock(driver, {
      day,
      title: 'Track-linked block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      trackId: trackId.lastInsertId,
    })

    await driver.execute('DELETE FROM track WHERE id = ?', [trackId.lastInsertId])

    const retrieved = await blocks.listBlocksForDay(driver, day)
    const block = retrieved.find((b) => b.id === id)
    expect(block?.trackId).toBeNull()
  })

  describe('listBlocksForRange', () => {
    it('returns blocks across multiple days ordered by day, then start_min, then sort', async () => {
      const idB = await blocks.createBlock(driver, {
        day: '2026-08-20',
        title: 'Day 20, later start',
        kind: 'deep',
        startMin: 400,
        durationMin: 60,
        sort: 0,
      })
      const idA = await blocks.createBlock(driver, {
        day: '2026-08-19',
        title: 'Day 19, sort 1',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 1,
      })
      const idA0 = await blocks.createBlock(driver, {
        day: '2026-08-19',
        title: 'Day 19, sort 0',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })
      const idC = await blocks.createBlock(driver, {
        day: '2026-08-21',
        title: 'Day 21',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
      })

      const range = await blocks.listBlocksForRange(driver, '2026-08-19', '2026-08-21')
      expect(range.map((b) => b.id)).toEqual([idA0, idA, idB, idC])
    })

    it('is inclusive at both bounds', async () => {
      const idFrom = await blocks.createBlock(driver, {
        day: '2026-08-22',
        title: 'From bound',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
      })
      const idTo = await blocks.createBlock(driver, {
        day: '2026-08-23',
        title: 'To bound',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
      })
      await blocks.createBlock(driver, {
        day: '2026-08-24',
        title: 'Outside range',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
      })

      const range = await blocks.listBlocksForRange(driver, '2026-08-22', '2026-08-23')
      expect(range.map((b) => b.id)).toEqual([idFrom, idTo])
    })

    it('returns an empty array for a range with no blocks', async () => {
      const range = await blocks.listBlocksForRange(driver, '2099-01-01', '2099-01-02')
      expect(range).toEqual([])
    })
  })

  describe('moveBlockToDayAtomic', () => {
    it('moves the block to toDay, keeps start_min unchanged, and resequences both days', async () => {
      const fromDay = '2026-08-25'
      const toDay = '2026-08-26'
      const otherDay = '2026-08-27'

      const moving = await blocks.createBlock(driver, {
        day: fromDay,
        title: 'Moving block',
        kind: 'deep',
        startMin: 540, // 09:00
        durationMin: 60,
        sort: 0,
      })
      const staysOnFrom = await blocks.createBlock(driver, {
        day: fromDay,
        title: 'Stays on fromDay',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 1,
      })
      const alreadyOnTo = await blocks.createBlock(driver, {
        day: toDay,
        title: 'Already on toDay',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })
      const untouched = await blocks.createBlock(driver, {
        day: otherDay,
        title: 'Untouched day',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })

      const ok = await blocks.moveBlockToDayAtomic(driver, {
        blockId: moving,
        fromDay,
        toDay,
        fromDayOrderedIds: [staysOnFrom],
        toDayOrderedIds: [alreadyOnTo, moving],
      })
      expect(ok).toBe(true)

      const movedBlock = (await blocks.listBlocksForRange(driver, toDay, toDay)).find(
        (b) => b.id === moving
      )
      expect(movedBlock).not.toBeUndefined()
      expect(movedBlock?.day).toBe(toDay)
      expect(movedBlock?.startMin).toBe(540) // unchanged by the move

      const fromDayBlocks = await blocks.listBlocksForDay(driver, fromDay)
      expect(fromDayBlocks.map((b) => b.id)).toEqual([staysOnFrom])
      expect(fromDayBlocks[0].sort).toBe(0)

      const toDayBlocks = await blocks.listBlocksForDay(driver, toDay)
      expect(toDayBlocks.map((b) => b.id)).toEqual([alreadyOnTo, moving])
      expect(toDayBlocks[0].sort).toBe(0)
      expect(toDayBlocks[1].sort).toBe(1)

      const otherDayBlocks = await blocks.listBlocksForDay(driver, otherDay)
      expect(otherDayBlocks.map((b) => b.id)).toEqual([untouched])
      expect(otherDayBlocks[0].sort).toBe(0)
    })

    it('returns false and mutates nothing when fromDay does not match (guard miss)', async () => {
      const actualDay = '2026-08-28'
      const wrongFromDay = '2026-08-29'
      const toDay = '2026-08-30'

      const blockId = await blocks.createBlock(driver, {
        day: actualDay,
        title: 'Not actually on wrongFromDay',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })
      const otherOnActualDay = await blocks.createBlock(driver, {
        day: actualDay,
        title: 'Sibling on actualDay',
        kind: 'deep',
        startMin: 400,
        durationMin: 60,
        sort: 1,
      })

      const before = await driver.select<BlockRowSnapshot>(
        'SELECT id, day, start_min, sort FROM day_block ORDER BY id'
      )

      const ok = await blocks.moveBlockToDayAtomic(driver, {
        blockId,
        fromDay: wrongFromDay,
        toDay,
        fromDayOrderedIds: [otherOnActualDay, blockId], // deliberately wrong day binding
        toDayOrderedIds: [blockId],
      })
      expect(ok).toBe(false)

      const after = await driver.select<BlockRowSnapshot>(
        'SELECT id, day, start_min, sort FROM day_block ORDER BY id'
      )
      expect(after).toEqual(before)
    })

    it('returns false and resequences NOTHING when the block has already been moved onto toDay', async () => {
      // The realistic stale case: another client already moved the block to
      // toDay. The guarded day move affects 0 rows, and because that
      // statement carries requireRowsAffected the whole transaction rolls
      // back — including the resequences, which are scoped per day and would
      // otherwise match rows on both days and commit this caller's proposed
      // ordering from an already-stale view. Regression guard: `false` must
      // mean the database is untouched.
      const fromDay = '2026-09-10'
      const toDay = '2026-09-11'

      const alreadyMoved = await blocks.createBlock(driver, {
        day: toDay,
        title: 'Already moved by someone else',
        kind: 'deep',
        startMin: 540,
        durationMin: 60,
        sort: 0,
      })
      const otherOnTo = await blocks.createBlock(driver, {
        day: toDay,
        title: 'Other block on toDay',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 1,
      })
      const siblingOnFrom = await blocks.createBlock(driver, {
        day: fromDay,
        title: 'Sibling still on fromDay',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 5,
      })

      const before = await driver.select<BlockRowSnapshot>(
        'SELECT id, day, start_min, sort FROM day_block ORDER BY id'
      )

      const ok = await blocks.moveBlockToDayAtomic(driver, {
        blockId: alreadyMoved,
        fromDay,
        toDay,
        fromDayOrderedIds: [siblingOnFrom],
        toDayOrderedIds: [otherOnTo, alreadyMoved],
      })
      expect(ok).toBe(false)

      // Every row on both days is exactly as it was — the caller's proposed
      // ordering (otherOnTo 1 -> 0, alreadyMoved 0 -> 1, siblingOnFrom
      // 5 -> 0) was rolled back with the move it belonged to.
      const after = await driver.select<BlockRowSnapshot>(
        'SELECT id, day, start_min, sort FROM day_block ORDER BY id'
      )
      expect(after).toEqual(before)
      expect(after.find((r) => r.id === alreadyMoved)?.sort).toBe(0)
      expect(after.find((r) => r.id === otherOnTo)?.sort).toBe(1)
      expect(after.find((r) => r.id === siblingOnFrom)?.sort).toBe(5)
    })

    // moveBlockToDayAtomic has no natural way to fail mid-transaction through
    // its public signature (blockId/day are always well-typed strings and
    // numbers). Directly drive driver.transaction with the same statement
    // shape it builds, but inject a genuine NOT NULL violation on the sort
    // resequence, to prove the whole commit — including the day move that
    // ran first — rolls back together.
    it('rolls back the day move when a resequence statement genuinely fails', async () => {
      const fromDay = '2026-08-31'
      const toDay = '2026-09-01'
      const blockId = await blocks.createBlock(driver, {
        day: fromDay,
        title: 'Should stay put',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })

      await expect(
        driver.transaction([
          {
            sql: 'UPDATE day_block SET day = ? WHERE id = ? AND day = ?',
            params: [toDay, blockId, fromDay],
          },
          {
            // sort is NOT NULL — this genuinely fails.
            sql: 'UPDATE day_block SET sort = ? WHERE id = ? AND day = ?',
            params: [null, blockId, toDay],
          },
        ])
      ).rejects.toThrow()

      const rows = await driver.select<BlockRowSnapshot>(
        'SELECT id, day, start_min, sort FROM day_block WHERE id = ?',
        [blockId]
      )
      // If the day move had leaked through despite the resequence failing,
      // this would read toDay. It must still read fromDay.
      expect(rows[0].day).toBe(fromDay)
      expect(rows[0].sort).toBe(0)
    })
  })

  it('preserves pomodoros and sort when applying a template to a day', async () => {
    const day = '2026-08-11'
    await blocks.applyTemplateToDay(driver, 1, day) // Maker Day
    const dayBlocks = await blocks.listBlocksForDay(driver, day)
    // Block 1 of Maker Day: "Deep block — main project", 3 pomodoros, sort 1
    const deepBlock = dayBlocks.find((b) => b.title === 'Deep block — main project')
    expect(deepBlock?.pomodoros).toBe(3)
    expect(deepBlock?.sort).toBe(1)
    expect(deepBlock?.kind).toBe('deep')
    expect(deepBlock?.durationMin).toBe(90)
  })
})
