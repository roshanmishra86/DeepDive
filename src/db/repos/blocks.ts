/**
 * Day block repository — scheduled time blocks on a calendar day.
 * Handles block CRUD, reordering, template application, and daily aggregates.
 */

import type { SqlDriver } from '../driver'
import type { DayBlock, BlockKind } from '../types'

// Internal row type matching SQL schema (0|1 for booleans)
interface BlockRow {
  id: number
  day: string
  task_id: number | null
  title: string
  kind: BlockKind
  start_min: number
  duration_min: number
  pomodoros: number
  completed: number
  sort: number
}

function rowToBlock(row: BlockRow): DayBlock {
  return {
    id: row.id,
    day: row.day,
    taskId: row.task_id,
    title: row.title,
    kind: row.kind,
    startMin: row.start_min,
    durationMin: row.duration_min,
    pomodoros: row.pomodoros,
    completed: row.completed === 1,
    sort: row.sort,
  }
}

export async function listBlocksForDay(
  driver: SqlDriver,
  day: string
): Promise<DayBlock[]> {
  // Note: this is the persisted manual-sort order (used by, e.g., the
  // reorder repo test), not necessarily the app's canonical display order.
  // The today store re-sorts every result via sortBlocks() (start_min, then
  // sort as tie-breaker — see src/lib/today.ts) immediately after fetching,
  // so the timeline, conflict detection, and move controls always agree.
  const rows = await driver.select<BlockRow>(
    'SELECT * FROM day_block WHERE day = ? ORDER BY sort, start_min',
    [day]
  )
  return rows.map(rowToBlock)
}

export async function createBlock(
  driver: SqlDriver,
  block: {
    day: string
    taskId?: number | null
    title: string
    kind: BlockKind
    startMin: number
    durationMin: number
    pomodoros?: number
    sort?: number
  }
): Promise<number> {
  const result = await driver.execute(
    'INSERT INTO day_block (day, task_id, title, kind, start_min, duration_min, pomodoros, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      block.day,
      block.taskId ?? null,
      block.title,
      block.kind,
      block.startMin,
      block.durationMin,
      block.pomodoros ?? 0,
      block.sort ?? 0,
    ]
  )
  return result.lastInsertId
}

export async function updateBlock(
  driver: SqlDriver,
  id: number,
  patch: Partial<Omit<DayBlock, 'id' | 'day'>>
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []

  if (patch.taskId !== undefined) {
    updates.push('task_id = ?')
    values.push(patch.taskId)
  }
  if (patch.title !== undefined) {
    updates.push('title = ?')
    values.push(patch.title)
  }
  if (patch.kind !== undefined) {
    updates.push('kind = ?')
    values.push(patch.kind)
  }
  if (patch.startMin !== undefined) {
    updates.push('start_min = ?')
    values.push(patch.startMin)
  }
  if (patch.durationMin !== undefined) {
    updates.push('duration_min = ?')
    values.push(patch.durationMin)
  }
  if (patch.pomodoros !== undefined) {
    updates.push('pomodoros = ?')
    values.push(patch.pomodoros)
  }
  if (patch.completed !== undefined) {
    updates.push('completed = ?')
    values.push(patch.completed ? 1 : 0)
  }
  if (patch.sort !== undefined) {
    updates.push('sort = ?')
    values.push(patch.sort)
  }

  if (updates.length === 0) return

  values.push(id)
  await driver.execute(
    `UPDATE day_block SET ${updates.join(', ')} WHERE id = ?`,
    values
  )
}

export async function deleteBlock(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM day_block WHERE id = ?', [id])
}

export async function setBlockCompleted(
  driver: SqlDriver,
  id: number,
  completed: boolean
): Promise<void> {
  await driver.execute(
    'UPDATE day_block SET completed = ? WHERE id = ?',
    [completed ? 1 : 0, id]
  )
}

export async function reorderBlocks(
  driver: SqlDriver,
  day: string,
  orderedIds: number[]
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await driver.execute('UPDATE day_block SET sort = ? WHERE id = ? AND day = ?', [
      i,
      orderedIds[i],
      day,
    ])
  }
}

export async function applyTemplateToDay(
  driver: SqlDriver,
  templateId: number,
  day: string
): Promise<void> {
  // Delete existing blocks for this day
  await driver.execute('DELETE FROM day_block WHERE day = ?', [day])

  // Copy template blocks to day blocks
  await driver.execute(
    `INSERT INTO day_block (day, title, kind, start_min, duration_min, pomodoros, sort)
     SELECT ?, title, kind, start_min, duration_min, pomodoros, sort
     FROM template_block
     WHERE template_id = ?
     ORDER BY sort`,
    [day, templateId]
  )
}

export interface DayTotals {
  plannedMin: number
  deepMin: number
  endMin: number
  blockCount: number
  completedCount: number
}

export async function dayTotals(driver: SqlDriver, day: string): Promise<DayTotals> {
  const rows = await driver.select<{
    plannedMin: number
    deepMin: number
    endMin: number
    blockCount: number
    completedCount: number
  }>(
    `SELECT
       COALESCE(SUM(duration_min), 0) as plannedMin,
       COALESCE(SUM(CASE WHEN kind = 'deep' THEN duration_min ELSE 0 END), 0) as deepMin,
       COALESCE(MAX(start_min + duration_min), 0) as endMin,
       COUNT(*) as blockCount,
       COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) as completedCount
     FROM day_block
     WHERE day = ?`,
    [day]
  )
  return rows[0]
}
