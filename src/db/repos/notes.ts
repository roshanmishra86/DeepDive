/**
 * Notes repository — day summaries and distraction logging.
 * day_note is a shut-down reflection per day; distraction logs capture thought interrupts.
 */

import type { SqlDriver } from '../driver'
import type { DayNote, Distraction } from '../types'

interface DayNoteRow {
  day: string
  note: string
  shutdown_min: number | null
}

function dayNoteRowToDayNote(row: DayNoteRow): DayNote {
  return {
    day: row.day,
    note: row.note,
    shutdownMin: row.shutdown_min,
  }
}

interface DistractionRow {
  id: number
  day: string
  text: string
  created_at: string
  resolved: number
}

function distractionRowToDistraction(row: DistractionRow): Distraction {
  return {
    id: row.id,
    day: row.day,
    text: row.text,
    createdAt: row.created_at,
    resolved: row.resolved === 1,
  }
}

export async function getDayNote(driver: SqlDriver, day: string): Promise<DayNote | null> {
  const rows = await driver.select<DayNoteRow>(
    'SELECT * FROM day_note WHERE day = ?',
    [day]
  )
  return rows.length > 0 ? dayNoteRowToDayNote(rows[0]) : null
}

export async function setDayNote(
  driver: SqlDriver,
  day: string,
  note: string
): Promise<void> {
  await driver.execute(
    'INSERT INTO day_note (day, note) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET note = excluded.note',
    [day, note]
  )
}

export async function getDayShutdown(driver: SqlDriver, day: string): Promise<number | null> {
  const rows = await driver.select<{ shutdown_min: number | null }>(
    'SELECT shutdown_min FROM day_note WHERE day = ?',
    [day]
  )
  return rows.length > 0 ? rows[0].shutdown_min : null
}

export async function setDayShutdown(driver: SqlDriver, day: string, min: number): Promise<void> {
  await driver.execute(
    'INSERT INTO day_note (day, shutdown_min) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET shutdown_min = excluded.shutdown_min',
    [day, min]
  )
}

export async function listDistractions(driver: SqlDriver, day: string): Promise<Distraction[]> {
  const rows = await driver.select<DistractionRow>(
    'SELECT * FROM distraction WHERE day = ? ORDER BY created_at DESC',
    [day]
  )
  return rows.map(distractionRowToDistraction)
}

export async function addDistraction(
  driver: SqlDriver,
  distraction: { day: string; text: string; createdAt: string }
): Promise<number> {
  const result = await driver.execute(
    'INSERT INTO distraction (day, text, created_at) VALUES (?, ?, ?)',
    [distraction.day, distraction.text, distraction.createdAt]
  )
  return result.lastInsertId
}

export async function resolveDistraction(
  driver: SqlDriver,
  id: number,
  resolved: boolean
): Promise<void> {
  await driver.execute('UPDATE distraction SET resolved = ? WHERE id = ?', [
    resolved ? 1 : 0,
    id,
  ])
}

export async function deleteDistraction(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM distraction WHERE id = ?', [id])
}
