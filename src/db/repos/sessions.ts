/**
 * Pomodoro session repository — tracks focus and rest phases across blocks.
 * Sessions persist to the database so timers survive app restarts.
 */

import type { SqlDriver } from '../driver'
import type { PomodoroSession, SessionPhase } from '../types'

interface SessionRow {
  id: number
  block_id: number | null
  started_at: string
  ended_at: string | null
  phase: SessionPhase
  completed: number
}

function rowToSession(row: SessionRow): PomodoroSession {
  return {
    id: row.id,
    blockId: row.block_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    phase: row.phase,
    completed: row.completed === 1,
  }
}

export async function startSession(
  driver: SqlDriver,
  session: { blockId?: number | null; phase: SessionPhase; startedAt: string }
): Promise<number> {
  const result = await driver.execute(
    'INSERT INTO pomodoro_session (block_id, started_at, phase) VALUES (?, ?, ?)',
    [session.blockId ?? null, session.startedAt, session.phase]
  )
  return result.lastInsertId
}

export async function finishSession(
  driver: SqlDriver,
  id: number,
  finish: { endedAt: string; completed: boolean }
): Promise<void> {
  await driver.execute(
    'UPDATE pomodoro_session SET ended_at = ?, completed = ? WHERE id = ?',
    [finish.endedAt, finish.completed ? 1 : 0, id]
  )
}

export async function countSessionsForDay(
  driver: SqlDriver,
  day: string
): Promise<number> {
  const rows = await driver.select<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM pomodoro_session ps
     JOIN day_block db ON ps.block_id = db.id
     WHERE db.day = ?`,
    [day]
  )
  return rows[0]?.count ?? 0
}

export async function listSessionsForBlock(
  driver: SqlDriver,
  blockId: number
): Promise<PomodoroSession[]> {
  const rows = await driver.select<SessionRow>(
    'SELECT * FROM pomodoro_session WHERE block_id = ? ORDER BY started_at',
    [blockId]
  )
  return rows.map(rowToSession)
}
