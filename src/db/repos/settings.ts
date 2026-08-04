/**
 * Settings repository — key-value store for app configuration.
 * Seeded with defaults on first run; updated as the user changes preferences.
 */

import type { SqlDriver } from '../driver'

export async function getAllSettings(driver: SqlDriver): Promise<Record<string, string>> {
  const rows = await driver.select<{ key: string; value: string }>(
    'SELECT key, value FROM setting',
    []
  )
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

export async function getSetting(driver: SqlDriver, key: string): Promise<string | null> {
  const rows = await driver.select<{ value: string }>(
    'SELECT value FROM setting WHERE key = ?',
    [key]
  )
  return rows.length > 0 ? rows[0].value : null
}

export async function setSetting(
  driver: SqlDriver,
  key: string,
  value: string
): Promise<void> {
  await driver.execute(
    'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  )
}
