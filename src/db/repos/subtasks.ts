import type { SqlDriver } from '../driver'
import type { Subtask } from '../types'

interface SubtaskRow {
  id: number
  task_id: number
  title: string
  estimate_min: number
  done: number
  sort: number
  created_at: string
  due_at: string | null
}

function rowToSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    estimateMin: row.estimate_min,
    done: row.done === 1,
    sort: row.sort,
    createdAt: row.created_at,
    dueAt: row.due_at,
  }
}

export function validateSubtaskEstimate(estimateMin: number): void {
  if (!Number.isInteger(estimateMin) || estimateMin < 15 || estimateMin > 1440 || estimateMin % 15 !== 0) {
    throw new Error('Subtask estimates must be 0.25 to 24 hours in 0.25-hour steps')
  }
}

function validateTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Subtask title is required')
  return trimmed
}

export async function listSubtasks(driver: SqlDriver, taskId: number): Promise<Subtask[]> {
  const rows = await driver.select<SubtaskRow>(
    'SELECT * FROM subtask WHERE task_id = ? ORDER BY sort ASC, id ASC',
    [taskId]
  )
  return rows.map(rowToSubtask)
}

export async function listSubtasksForTasks(driver: SqlDriver, taskIds: number[]): Promise<Subtask[]> {
  if (taskIds.length === 0) return []
  const placeholders = taskIds.map(() => '?').join(', ')
  const rows = await driver.select<SubtaskRow>(
    `SELECT * FROM subtask WHERE task_id IN (${placeholders}) ORDER BY task_id ASC, sort ASC, id ASC`,
    taskIds
  )
  return rows.map(rowToSubtask)
}

export async function createSubtask(
  driver: SqlDriver,
  input: { taskId: number; title: string; estimateMin: number; createdAt: string; dueAt?: string | null }
): Promise<number> {
  const title = validateTitle(input.title)
  validateSubtaskEstimate(input.estimateMin)
  const result = await driver.execute(
    `INSERT INTO subtask (task_id, title, estimate_min, created_at, due_at, sort)
     VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort) + 1 FROM subtask WHERE task_id = ?), 0))`,
    [input.taskId, title, input.estimateMin, input.createdAt, input.dueAt ?? null, input.taskId]
  )
  return result.lastInsertId
}

export async function updateSubtask(
  driver: SqlDriver,
  id: number,
  patch: { title?: string; estimateMin?: number; dueAt?: string | null }
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []
  if (patch.title !== undefined) {
    updates.push('title = ?')
    values.push(validateTitle(patch.title))
  }
  if (patch.estimateMin !== undefined) {
    validateSubtaskEstimate(patch.estimateMin)
    updates.push('estimate_min = ?')
    values.push(patch.estimateMin)
  }
  if (patch.dueAt !== undefined) {
    updates.push('due_at = ?')
    values.push(patch.dueAt)
  }
  if (updates.length === 0) return
  values.push(id)
  await driver.execute(`UPDATE subtask SET ${updates.join(', ')} WHERE id = ?`, values)
}

export async function setSubtaskDone(driver: SqlDriver, id: number, done: boolean): Promise<void> {
  await driver.execute('UPDATE subtask SET done = ? WHERE id = ?', [done ? 1 : 0, id])
}

export async function deleteSubtask(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM subtask WHERE id = ?', [id])
}

export async function reorderSubtasks(driver: SqlDriver, taskId: number, orderedIds: number[]): Promise<void> {
  await driver.transaction(
    orderedIds.map((id, index) => ({
      sql: 'UPDATE subtask SET sort = ? WHERE id = ? AND task_id = ?',
      params: [index, id, taskId],
    }))
  )
}

export async function getSubtaskAllocation(
  driver: SqlDriver,
  subtaskId: number
): Promise<{ allocatedMin: number; blockCount: number }> {
  const rows = await driver.select<{ allocated_min: number; block_count: number }>(
    `SELECT COALESCE(SUM(duration_min), 0) AS allocated_min, COUNT(*) AS block_count
     FROM day_block WHERE subtask_id = ?`,
    [subtaskId]
  )
  return { allocatedMin: rows[0]?.allocated_min ?? 0, blockCount: rows[0]?.block_count ?? 0 }
}
