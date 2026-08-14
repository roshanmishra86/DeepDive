/**
 * Task repository — CRUD operations for task records.
 * Converts SQLite 0|1 integers to/from TypeScript booleans at the boundary.
 */

import type { SqlDriver } from '../driver'
import type { Task, TaskPriority } from '../types'

// Internal row type matching SQL schema (0|1 for booleans)
interface TaskRow {
  id: number
  title: string
  notes: string
  important: number
  urgent: number
  priority: TaskPriority
  due_at: string | null
  estimate_min: number | null
  done: number
  created_at: string
  archived: number
  sort: number
  completed_at: string | null
  archived_at: string | null
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    important: row.important === 1,
    urgent: row.urgent === 1,
    priority: row.priority,
    dueAt: row.due_at,
    estimateMin: row.estimate_min,
    done: row.done === 1,
    createdAt: row.created_at,
    archived: row.archived === 1,
    sort: row.sort,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
  }
}

export async function listTasks(
  driver: SqlDriver,
  options?: { archived?: boolean }
): Promise<Task[]> {
  const archived = options?.archived ?? false
  const rows = await driver.select<TaskRow>(
    archived
      ? 'SELECT * FROM task WHERE archived = 1 ORDER BY archived_at IS NULL, archived_at DESC, id ASC'
      : 'SELECT * FROM task WHERE archived = 0 ORDER BY sort ASC, id ASC',
    []
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
    priority?: TaskPriority
    dueAt?: string | null
    estimateMin?: number | null
    createdAt: string
  }
): Promise<number> {
  const result = await driver.execute(
    `INSERT INTO task (title, notes, important, urgent, priority, due_at, estimate_min, created_at, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort) + 1 FROM task WHERE archived = 0), 0))`,
    [input.title, input.notes ?? '', input.important ? 1 : 0, input.urgent ? 1 : 0,
      input.priority ?? 'medium', input.dueAt ?? null, input.estimateMin ?? null, input.createdAt]
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
  if (patch.priority !== undefined) {
    updates.push('priority = ?')
    values.push(patch.priority)
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
  if (patch.sort !== undefined) {
    updates.push('sort = ?')
    values.push(patch.sort)
  }
  if (patch.completedAt !== undefined) {
    updates.push('completed_at = ?')
    values.push(patch.completedAt)
  }
  if (patch.archivedAt !== undefined) {
    updates.push('archived_at = ?')
    values.push(patch.archivedAt)
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
  done: boolean,
  completedAt: string | null = done ? new Date().toISOString() : null
): Promise<void> {
  await driver.execute(
    'UPDATE task SET done = ?, completed_at = ? WHERE id = ?',
    [done ? 1 : 0, done ? completedAt : null, id]
  )
}

export async function deleteTask(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM task WHERE id = ?', [id])
}

export async function archiveTask(
  driver: SqlDriver,
  id: number,
  archivedAt: string = new Date().toISOString()
): Promise<boolean> {
  const result = await driver.execute(
    'UPDATE task SET archived = 1, archived_at = ? WHERE id = ? AND done = 1 AND archived = 0',
    [archivedAt, id]
  )
  return result.rowsAffected > 0
}

export async function unarchiveTask(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.execute(
    `UPDATE task
     SET archived = 0,
         archived_at = NULL,
         sort = COALESCE((SELECT MAX(sort) + 1 FROM task WHERE archived = 0), 0)
     WHERE id = ? AND archived = 1`,
    [id]
  )
  return result.rowsAffected > 0
}

export async function reorderTasksAtomic(
  driver: SqlDriver,
  orderedIds: number[],
  flagPatch?: { id: number; important: boolean; urgent: boolean }
): Promise<void> {
  const statements = [] as { sql: string; params: unknown[] }[]
  if (flagPatch) {
    statements.push({
      sql: 'UPDATE task SET important = ?, urgent = ? WHERE id = ? AND archived = 0',
      params: [flagPatch.important ? 1 : 0, flagPatch.urgent ? 1 : 0, flagPatch.id],
    })
  }
  statements.push(
    ...orderedIds.map((id, index) => ({
      sql: 'UPDATE task SET sort = ? WHERE id = ? AND archived = 0',
      params: [index, id],
    }))
  )
  await driver.transaction(statements)
}
