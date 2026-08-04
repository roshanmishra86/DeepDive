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
