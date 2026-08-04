import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as settings from './settings'

describe('settings repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('gets all settings', async () => {
    const all = await settings.getAllSettings(driver)
    expect(all['accent']).toBe('green')
    expect(all['timerStyle']).toBe('ring')
    expect(all['volume']).toBe('0.7')
  })

  it('gets a single setting', async () => {
    const value = await settings.getSetting(driver, 'accent')
    expect(value).toBe('green')
  })

  it('returns null for missing setting', async () => {
    const value = await settings.getSetting(driver, 'nonexistent')
    expect(value).toBeNull()
  })

  it('sets a new setting', async () => {
    await settings.setSetting(driver, 'customKey', 'customValue')

    const value = await settings.getSetting(driver, 'customKey')
    expect(value).toBe('customValue')
  })

  it('updates an existing setting', async () => {
    await settings.setSetting(driver, 'accent', 'blue')

    const value = await settings.getSetting(driver, 'accent')
    expect(value).toBe('blue')
  })
})
