import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as templates from './templates'

describe('templates repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('lists templates with aggregates', async () => {
    const list = await templates.listTemplates(driver)
    // Maker Day is seeded
    const makerDay = list.find((t) => t.name === 'Maker Day')
    expect(makerDay).not.toBeUndefined()
    expect(makerDay?.blockCount).toBe(5)
    expect(makerDay?.totalMin).toBe(30 + 90 + 30 + 60 + 5) // 215
  })

  it('gets a template with blocks', async () => {
    const template = await templates.getTemplate(driver, 1) // Maker Day
    expect(template?.name).toBe('Maker Day')
    expect(template?.blocks.length).toBe(5)
    expect(template?.blocks[0].title).toBe('Morning pages')
    expect(template?.blocks[0].kind).toBe('ritual')
  })

  it('creates a template', async () => {
    const id = await templates.createTemplate(driver, {
      name: 'New template',
      description: 'A test template',
      startMin: 480,
      weekdays: 63, // All days
    })

    const template = await templates.getTemplate(driver, id)
    expect(template?.name).toBe('New template')
    expect(template?.description).toBe('A test template')
    expect(template?.startMin).toBe(480)
  })

  it('updates a template', async () => {
    const id = await templates.createTemplate(driver, {
      name: 'Original name',
      startMin: 300,
    })

    await templates.updateTemplate(driver, id, { name: 'Updated name' })

    const template = await templates.getTemplate(driver, id)
    expect(template?.name).toBe('Updated name')
  })

  it('deletes a template and its blocks', async () => {
    const id = await templates.createTemplate(driver, {
      name: 'Delete me',
      startMin: 300,
    })

    await templates.addTemplateBlock(driver, {
      templateId: id,
      title: 'Block 1',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })

    await templates.deleteTemplate(driver, id)

    const template = await templates.getTemplate(driver, id)
    expect(template).toBeNull()
  })

  it('adds a template block', async () => {
    const templateId = 1 // Maker Day
    const blockId = await templates.addTemplateBlock(driver, {
      templateId,
      title: 'New block',
      kind: 'deep',
      startMin: 500,
      durationMin: 90,
      pomodoros: 3,
      sort: 5,
    })

    const template = await templates.getTemplate(driver, templateId)
    const block = template?.blocks.find((b) => b.id === blockId)
    expect(block).not.toBeUndefined()
    expect(block?.title).toBe('New block')
  })

  it('updates a template block', async () => {
    const templateId = 1
    const blockId = await templates.addTemplateBlock(driver, {
      templateId,
      title: 'Original',
      kind: 'break',
      startMin: 600,
      durationMin: 30,
    })

    await templates.updateTemplateBlock(driver, blockId, { title: 'Updated' })

    const template = await templates.getTemplate(driver, templateId)
    const block = template?.blocks.find((b) => b.id === blockId)
    expect(block?.title).toBe('Updated')
  })

  it('deletes a template block', async () => {
    const templateId = 1
    const blockId = await templates.addTemplateBlock(driver, {
      templateId,
      title: 'Delete me',
      kind: 'break',
      startMin: 700,
      durationMin: 30,
    })

    await templates.deleteTemplateBlock(driver, blockId)

    const template = await templates.getTemplate(driver, templateId)
    const block = template?.blocks.find((b) => b.id === blockId)
    expect(block).toBeUndefined()
  })

  it('reorders template blocks', async () => {
    const id = await templates.createTemplate(driver, {
      name: 'Reorder test',
      startMin: 300,
    })

    const b1 = await templates.addTemplateBlock(driver, {
      templateId: id,
      title: 'First',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
      sort: 0,
    })

    const b2 = await templates.addTemplateBlock(driver, {
      templateId: id,
      title: 'Second',
      kind: 'break',
      startMin: 390,
      durationMin: 30,
      sort: 1,
    })

    await templates.reorderTemplateBlocks(driver, id, [b2, b1])

    const template = await templates.getTemplate(driver, id)
    expect(template?.blocks[0].id).toBe(b2)
    expect(template?.blocks[1].id).toBe(b1)
  })

  it('saves a day as a template', async () => {
    // First, apply a template to a day to get blocks
    const day = '2026-08-07'
    const blockModule = await import('./blocks')
    await blockModule.applyTemplateToDay(driver, 1, day) // Maker Day

    // Save as new template
    const newTemplateId = await templates.saveDayAsTemplate(driver, day, 'Saved from day')

    const newTemplate = await templates.getTemplate(driver, newTemplateId)
    expect(newTemplate?.name).toBe('Saved from day')
    expect(newTemplate?.blocks.length).toBe(5)
    expect(newTemplate?.blocks[0].title).toBe('Morning pages')
  })

  it('derives start_min from the day\'s earliest block', async () => {
    // Create a day with blocks starting at 9:00 AM (540 minutes)
    const day = '2026-08-08'
    const blockModule = await import('./blocks')
    await blockModule.createBlock(driver, {
      day,
      title: 'Late morning block',
      kind: 'deep',
      startMin: 540,
      durationMin: 90,
    })
    await blockModule.createBlock(driver, {
      day,
      title: 'Another block',
      kind: 'break',
      startMin: 630,
      durationMin: 15,
    })

    // Save as template
    const templateId = await templates.saveDayAsTemplate(driver, day, 'Late start')

    // Verify startMin is 540, not the default 300
    const template = await templates.getTemplate(driver, templateId)
    expect(template?.startMin).toBe(540)
  })

  it('falls back to 300 when the day has no blocks', async () => {
    const day = '2026-08-09'

    // Save an empty day as template
    const templateId = await templates.saveDayAsTemplate(driver, day, 'Empty day')

    // Verify startMin is 300 (the default)
    const template = await templates.getTemplate(driver, templateId)
    expect(template?.startMin).toBe(300)
  })

  it('accepts an optional description parameter', async () => {
    const day = '2026-08-10'

    // Save with a description
    const templateId = await templates.saveDayAsTemplate(driver, day, 'With description', 'My custom description')

    const template = await templates.getTemplate(driver, templateId)
    expect(template?.description).toBe('My custom description')
  })

  // Phase 6 F1 (TASKS.md): moveBlock used to persist the swapped startMin
  // values and the sort renumbering as two separate awaited round trips —
  // if the second failed, SQLite kept the first's write with no way to
  // revert it, corrupting the persisted order while only in-memory state
  // got rolled back. moveTemplateBlocksAtomic/removeTemplateBlockAtomic fix
  // this by writing both as one transaction.
  describe('moveTemplateBlocksAtomic', () => {
    it('persists changed startMin values and sort renumbering together', async () => {
      const id = await templates.createTemplate(driver, { name: 'Move test', startMin: 300 })
      const a = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'A',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })
      const b = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'B',
        kind: 'deep',
        startMin: 360,
        durationMin: 60,
        sort: 1,
      })

      // Move B up: B takes A's old start, A takes B's old start, order flips.
      await templates.moveTemplateBlocksAtomic(
        driver,
        id,
        [
          { id: b, startMin: 300 },
          { id: a, startMin: 360 },
        ],
        [b, a]
      )

      const template = await templates.getTemplate(driver, id)
      expect(template?.blocks.map((blk) => blk.id)).toEqual([b, a])
      expect(template?.blocks[0].startMin).toBe(300)
      expect(template?.blocks[1].startMin).toBe(360)
    })

    it('rolls back the whole write — including already-applied statements — when a later statement fails', async () => {
      const id = await templates.createTemplate(driver, { name: 'Move fail test', startMin: 300 })
      const a = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'A',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })
      const b = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'B',
        kind: 'deep',
        startMin: 360,
        durationMin: 60,
        sort: 1,
      })

      // The first startMin write (A) is valid and would succeed on its own.
      // The second is forced to fail via a genuine NOT NULL violation
      // (start_min has no default and can't be null) — proving the FIRST
      // statement's write doesn't survive when the SECOND one fails.
      await expect(
        templates.moveTemplateBlocksAtomic(
          driver,
          id,
          [
            { id: a, startMin: 999 },
            { id: b, startMin: null as unknown as number },
          ],
          [b, a]
        )
      ).rejects.toThrow()

      // Fresh read via getTemplate() — not the store, not any cached value —
      // must show NEITHER write landed and the sort order is untouched.
      const template = await templates.getTemplate(driver, id)
      expect(template?.blocks.map((blk) => blk.id)).toEqual([a, b])
      expect(template?.blocks.find((blk) => blk.id === a)?.startMin).toBe(300)
      expect(template?.blocks.find((blk) => blk.id === b)?.startMin).toBe(360)
    })
  })

  describe('removeTemplateBlockAtomic', () => {
    it('deletes the block and renumbers the remaining sort together', async () => {
      const id = await templates.createTemplate(driver, { name: 'Delete test', startMin: 300 })
      const a = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'A',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })
      const b = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'B',
        kind: 'deep',
        startMin: 360,
        durationMin: 60,
        sort: 1,
      })
      const c = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'C',
        kind: 'deep',
        startMin: 420,
        durationMin: 60,
        sort: 2,
      })

      await templates.removeTemplateBlockAtomic(driver, b, id, [a, c])

      const template = await templates.getTemplate(driver, id)
      expect(template?.blocks.map((blk) => blk.id)).toEqual([a, c])
      expect(template?.blocks.map((blk) => blk.sort)).toEqual([0, 1])
    })

    it('leaves the database completely unchanged when the reorder half fails', async () => {
      const id = await templates.createTemplate(driver, { name: 'Delete fail test', startMin: 300 })
      const a = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'A',
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
        sort: 0,
      })
      const b = await templates.addTemplateBlock(driver, {
        templateId: id,
        title: 'B',
        kind: 'deep',
        startMin: 360,
        durationMin: 60,
        sort: 1,
      })

      // Directly drive the transaction primitive with the same shape
      // removeTemplateBlockAtomic builds, but with a forced NOT NULL
      // violation on the reorder step (real production code has no natural
      // way to fail this specific statement, so the failure is injected at
      // the statement level, exactly as the repo function would build it).
      await expect(
        driver.transaction([
          { sql: 'DELETE FROM template_block WHERE id = ?', params: [a] },
          {
            sql: 'UPDATE template_block SET sort = ? WHERE id = ? AND template_id = ?',
            params: [null, b, id],
          },
        ])
      ).rejects.toThrow()

      // Fresh read: A must still exist (the delete was rolled back) and B's
      // sort must be untouched.
      const template = await templates.getTemplate(driver, id)
      expect(template?.blocks.map((blk) => blk.id)).toEqual([a, b])
      expect(template?.blocks.find((blk) => blk.id === b)?.sort).toBe(1)
    })
  })
})
