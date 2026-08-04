/**
 * Task repository — CRUD operations for task records.
 * Converts SQLite 0|1 integers to/from TypeScript booleans at the boundary.
 */

import type { SqlDriver } from '../driver'
import type { Task } from '../types'

// Internal row type matching SQL schema (0|1 for booleans)
interface TaskRow {
  id: number
  title: string
  notes: string
  important: number
  urgent: number
  due_at: string | null
  estimate_min: number | null
  done: number
  created_at: string
  archived: number
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    important: row.important === 1,
    urgent: row.urgent === 1,
    dueAt: row.due_at,
    estimateMin: row.estimate_min,
    done: row.done === 1,
    createdAt: row.created_at,
    archived: row.archived === 1,
  }
}

export async function listTasks(
  driver: SqlDriver,
  options?: { archived?: boolean }
): Promise<Task[]> {
  const archived = options?.archived ?? false
  const rows = await driver.select<TaskRow>(
    'SELECT * FROM task WHERE archived = ? ORDER BY created_at DESC',
    [archived ? 1 : 0]
  )
  return rows.map(rowToTask)
}

export async function getTask(driver: SqlDriver, id: number): Promise<Task | null> {
  const rows = await driver.select<TaskRow>(
    'SELECT * FROM task WHERE id = ?',
    [id]
  )
  return rows.length > 0 ? rowToTask(rows[0]) : null
}

export async function createTask(
  driver: SqlDriver,
  input: {
    title: string
    notes?: string
    important?: boolean
    urgent?: boolean
    dueAt?: string | null
    estimateMin?: number | null
    createdAt: string
  }
): Promise<number> {
  const result = await driver.execute(
    'INSERT INTO task (title, notes, important, urgent, due_at, estimate_min, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      input.title,
      input.notes ?? '',
      input.important ? 1 : 0,
      input.urgent ? 1 : 0,
      input.dueAt ?? null,
      input.estimateMin ?? null,
      input.createdAt,
    ]
  )
  return result.lastInsertId
}

export async function updateTask(
  driver: SqlDriver,
  id: number,
  patch: Partial<Omit<Task, 'id' | 'createdAt' | 'archived'>>
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []

  if (patch.title !== undefined) {
    updates.push('title = ?')
    values.push(patch.title)
  }
  if (patch.notes !== undefined) {
    updates.push('notes = ?')
    values.push(patch.notes)
  }
  if (patch.important !== undefined) {
    updates.push('important = ?')
    values.push(patch.important ? 1 : 0)
  }
  if (patch.urgent !== undefined) {
    updates.push('urgent = ?')
    values.push(patch.urgent ? 1 : 0)
  }
  if (patch.dueAt !== undefined) {
    updates.push('due_at = ?')
    values.push(patch.dueAt)
  }
  if (patch.estimateMin !== undefined) {
    updates.push('estimate_min = ?')
    values.push(patch.estimateMin)
  }
  if (patch.done !== undefined) {
    updates.push('done = ?')
    values.push(patch.done ? 1 : 0)
  }

  if (updates.length === 0) return

  values.push(id)
  await driver.execute(
    `UPDATE task SET ${updates.join(', ')} WHERE id = ?`,
    values
  )
}

export async function setTaskFlags(
  driver: SqlDriver,
  id: number,
  flags: { important?: boolean; urgent?: boolean }
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []

  if (flags.important !== undefined) {
    updates.push('important = ?')
    values.push(flags.important ? 1 : 0)
  }
  if (flags.urgent !== undefined) {
    updates.push('urgent = ?')
    values.push(flags.urgent ? 1 : 0)
  }

  if (updates.length === 0) return

  values.push(id)
  await driver.execute(
    `UPDATE task SET ${updates.join(', ')} WHERE id = ?`,
    values
  )
}

export async function setTaskDone(
  driver: SqlDriver,
  id: number,
  done: boolean
): Promise<void> {
  await driver.execute('UPDATE task SET done = ? WHERE id = ?', [done ? 1 : 0, id])
}

export async function deleteTask(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM task WHERE id = ?', [id])
}

export async function archiveTask(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('UPDATE task SET archived = 1 WHERE id = ?', [id])
}
