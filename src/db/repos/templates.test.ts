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
})
