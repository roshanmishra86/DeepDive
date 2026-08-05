import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as notes from './notes'

describe('notes repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('gets a day note', async () => {
    const day = '2026-08-03'
    await notes.setDayNote(driver, day, 'Great day!')

    const note = await notes.getDayNote(driver, day)
    expect(note?.note).toBe('Great day!')
    expect(note?.day).toBe(day)
  })

  it('returns null for a day with no note', async () => {
    const note = await notes.getDayNote(driver, '2026-12-25')
    expect(note).toBeNull()
  })

  it('sets and updates a day note', async () => {
    const day = '2026-08-03'
    await notes.setDayNote(driver, day, 'First version')
    await notes.setDayNote(driver, day, 'Updated version')

    const note = await notes.getDayNote(driver, day)
    expect(note?.note).toBe('Updated version')
  })

  it('returns null shutdown for a day with no row', async () => {
    const shutdown = await notes.getDayShutdown(driver, '2026-12-25')
    expect(shutdown).toBeNull()
  })

  it('returns null shutdown for a day that has a note but no shutdown set', async () => {
    const day = '2026-08-03'
    await notes.setDayNote(driver, day, 'Just a note')

    const shutdown = await notes.getDayShutdown(driver, day)
    expect(shutdown).toBeNull()
  })

  it('sets and gets a day shutdown time', async () => {
    const day = '2026-08-03'
    await notes.setDayShutdown(driver, day, 1200)

    const shutdown = await notes.getDayShutdown(driver, day)
    expect(shutdown).toBe(1200)
  })

  it('sets a day shutdown twice without erroring, keeping the latest value', async () => {
    const day = '2026-08-03'
    await notes.setDayShutdown(driver, day, 1200)
    await notes.setDayShutdown(driver, day, 1260)

    const shutdown = await notes.getDayShutdown(driver, day)
    expect(shutdown).toBe(1260)
  })

  it('preserves the note when setting shutdown after setDayNote', async () => {
    const day = '2026-08-03'
    await notes.setDayNote(driver, day, 'Great day!')
    await notes.setDayShutdown(driver, day, 1200)

    const note = await notes.getDayNote(driver, day)
    expect(note?.note).toBe('Great day!')
    expect(note?.shutdownMin).toBe(1200)
  })

  it('preserves the shutdown when setting note after setDayShutdown', async () => {
    const day = '2026-08-03'
    await notes.setDayShutdown(driver, day, 1200)
    await notes.setDayNote(driver, day, 'Great day!')

    const note = await notes.getDayNote(driver, day)
    expect(note?.note).toBe('Great day!')
    expect(note?.shutdownMin).toBe(1200)
  })

  it('adds a distraction', async () => {
    const day = '2026-08-03'
    const id = await notes.addDistraction(driver, {
      day,
      text: 'Social media',
      createdAt: new Date().toISOString(),
    })
    expect(id).toBeGreaterThan(0)

    const distractions = await notes.listDistractions(driver, day)
    const distraction = distractions.find((d) => d.id === id)
    expect(distraction?.text).toBe('Social media')
    expect(distraction?.resolved).toBe(false)
  })

  it('lists distractions for a day', async () => {
    const day = '2026-08-03'
    const now = new Date().toISOString()
    const id1 = await notes.addDistraction(driver, {
      day,
      text: 'Distraction 1',
      createdAt: now,
    })
    const id2 = await notes.addDistraction(driver, {
      day,
      text: 'Distraction 2',
      createdAt: now,
    })

    const list = await notes.listDistractions(driver, day)
    expect(list.length).toBe(2)
    expect(list.find((d) => d.id === id1)).not.toBeUndefined()
    expect(list.find((d) => d.id === id2)).not.toBeUndefined()
  })

  it('resolves a distraction', async () => {
    const day = '2026-08-03'
    const id = await notes.addDistraction(driver, {
      day,
      text: 'Resolve me',
      createdAt: new Date().toISOString(),
    })

    await notes.resolveDistraction(driver, id, true)

    const distractions = await notes.listDistractions(driver, day)
    const distraction = distractions.find((d) => d.id === id)
    expect(distraction?.resolved).toBe(true)
  })

  it('deletes a distraction', async () => {
    const day = '2026-08-03'
    const id = await notes.addDistraction(driver, {
      day,
      text: 'Delete me',
      createdAt: new Date().toISOString(),
    })

    await notes.deleteDistraction(driver, id)

    const distractions = await notes.listDistractions(driver, day)
    expect(distractions.find((d) => d.id === id)).toBeUndefined()
  })
})
