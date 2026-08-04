import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as rituals from './rituals'

describe('rituals repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('lists active rituals', async () => {
    const list = await rituals.listActiveRituals(driver)
    // 3 rituals are seeded
    expect(list.length).toBe(3)
    expect(list[0].title).toBe('Morning pages')
    expect(list[0].active).toBe(true)
  })

  it('lists rituals for a day with defaults when no log entry', async () => {
    const day = '2026-08-03'
    const list = await rituals.listRitualsForDay(driver, day)
    expect(list.length).toBe(3)
    // All should default to done=false when no log row exists
    expect(list.every((r) => r.done === false)).toBe(true)
    // Verify titles come back in sort order
    expect(list[0].title).toBe('Morning pages')
    expect(list[1].title).toBe('Phone in drawer')
    expect(list[2].title).toBe('Shut down ritual')
  })

  it('toggles ritual for a day', async () => {
    const day = '2026-08-03'
    const ritualId = 1 // Morning pages

    await rituals.toggleRitual(driver, day, ritualId, true)

    const list = await rituals.listRitualsForDay(driver, day)
    const ritual = list.find((r) => r.id === ritualId)
    expect(ritual?.done).toBe(true)
  })

  it('updates ritual toggle on subsequent calls (UPSERT)', async () => {
    const day = '2026-08-03'
    const ritualId = 1

    // First toggle
    await rituals.toggleRitual(driver, day, ritualId, true)
    let list = await rituals.listRitualsForDay(driver, day)
    let ritual = list.find((r) => r.id === ritualId)
    expect(ritual?.done).toBe(true)

    // Second toggle (should update, not duplicate)
    await rituals.toggleRitual(driver, day, ritualId, false)
    list = await rituals.listRitualsForDay(driver, day)
    ritual = list.find((r) => r.id === ritualId)
    expect(ritual?.done).toBe(false)

    // Verify no duplicates
    const todayLogs = list.filter((r) => r.id === ritualId)
    expect(todayLogs.length).toBe(1)
  })

  it('adds a ritual', async () => {
    const id = await rituals.addRitual(driver, 'New ritual')
    expect(id).toBeGreaterThan(0)

    const list = await rituals.listActiveRituals(driver)
    const ritual = list.find((r) => r.id === id)
    expect(ritual?.title).toBe('New ritual')
    expect(ritual?.active).toBe(true)
  })

  it('renames a ritual', async () => {
    const id = await rituals.addRitual(driver, 'Original name')
    await rituals.renameRitual(driver, id, 'New name')

    const list = await rituals.listActiveRituals(driver)
    const ritual = list.find((r) => r.id === id)
    expect(ritual?.title).toBe('New name')
  })

  it('deactivates a ritual', async () => {
    const id = await rituals.addRitual(driver, 'Deactivate me')
    await rituals.deactivateRitual(driver, id)

    const list = await rituals.listActiveRituals(driver)
    expect(list.find((r) => r.id === id)).toBeUndefined()
  })

  it('deletes a ritual', async () => {
    const id = await rituals.addRitual(driver, 'Delete me')
    await rituals.deleteRitual(driver, id)

    const list = await rituals.listActiveRituals(driver)
    expect(list.find((r) => r.id === id)).toBeUndefined()
  })
})
