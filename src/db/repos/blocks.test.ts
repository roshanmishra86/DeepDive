import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as blocks from './blocks'

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
