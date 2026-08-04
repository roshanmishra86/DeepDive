/**
 * Ritual repository — recurring daily check-ins with per-day completion tracking.
 * Rituals are seeded on first run; the ritual_log tracks completion per day.
 */

import type { SqlDriver } from '../driver'
import type { Ritual } from '../types'

interface RitualRow {
  id: number
  title: string
  active: number
  sort: number
}

function ritualRowToRitual(row: RitualRow): Ritual {
  return {
    id: row.id,
    title: row.title,
    active: row.active === 1,
    sort: row.sort,
  }
}

export async function listActiveRituals(driver: SqlDriver): Promise<Ritual[]> {
  const rows = await driver.select<RitualRow>(
    'SELECT * FROM ritual WHERE active = 1 ORDER BY sort',
    []
  )
  return rows.map(ritualRowToRitual)
}

export async function listRitualsForDay(
  driver: SqlDriver,
  day: string
): Promise<{ id: number; title: string; done: boolean }[]> {
  const rows = await driver.select<{ id: number; title: string; done: number }>(
    `SELECT r.id, r.title, COALESCE(rl.done, 0) as done
     FROM ritual r
     LEFT JOIN ritual_log rl ON r.id = rl.ritual_id AND rl.day = ?
     WHERE r.active = 1
     ORDER BY r.sort`,
    [day]
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    done: row.done === 1,
  }))
}

export async function toggleRitual(
  driver: SqlDriver,
  day: string,
  ritualId: number,
  done: boolean
): Promise<void> {
  await driver.execute(
    'INSERT INTO ritual_log (day, ritual_id, done) VALUES (?, ?, ?) ON CONFLICT(day, ritual_id) DO UPDATE SET done = excluded.done',
    [day, ritualId, done ? 1 : 0]
  )
}

export async function addRitual(driver: SqlDriver, title: string): Promise<number> {
  // Get the maximum sort value
  const maxRows = await driver.select<{ maxSort: number }>(
    'SELECT COALESCE(MAX(sort), -1) as maxSort FROM ritual',
    []
  )
  const maxSort = maxRows[0]?.maxSort ?? -1

  const result = await driver.execute(
    'INSERT INTO ritual (title, active, sort) VALUES (?, 1, ?)',
    [title, maxSort + 1]
  )
  return result.lastInsertId
}

export async function renameRitual(
  driver: SqlDriver,
  id: number,
  title: string
): Promise<void> {
  await driver.execute('UPDATE ritual SET title = ? WHERE id = ?', [title, id])
}

export async function deactivateRitual(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('UPDATE ritual SET active = 0 WHERE id = ?', [id])
}

export async function deleteRitual(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM ritual WHERE id = ?', [id])
}
