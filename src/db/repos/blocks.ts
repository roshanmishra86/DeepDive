/**
 * Day block repository — scheduled time blocks on a calendar day.
 * Handles block CRUD, reordering, template application, and daily aggregates.
 */

import { isGuardUnmet, type SqlDriver } from '../driver'
import type { DayBlock, BlockKind, BlockRepeat, InboxGroup, EnergyLevel } from '../types'

// Row type matching SQL schema (0|1 for booleans). Exported so archive.ts
// can reuse it rather than maintaining a duplicate mapping.
export interface BlockRow {
  id: number
  day: string
  task_id: number | null
  subtask_id: number | null
  title: string
  kind: BlockKind
  start_min: number
  duration_min: number
  pomodoros: number
  completed: number
  sort: number
  note: string
  note_updated_at: string | null
  repeat: BlockRepeat
  track_id: number | null
  quiet: number
  inbox_group?: string
  energy?: string | null
  tags?: string
  logged_sec?: number
  carried_over?: number
  imported_from_todo?: number
}

export function rowToBlock(row: BlockRow): DayBlock {
  const parseTags = (raw?: string): string[] => {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === 'string')
    } catch {}
    return raw.split(',').map((t) => t.trim()).filter(Boolean)
  }

  return {
    id: row.id,
    day: row.day,
    taskId: row.task_id,
    subtaskId: row.subtask_id,
    title: row.title,
    kind: row.kind,
    startMin: row.start_min,
    durationMin: row.duration_min,
    pomodoros: row.pomodoros,
    completed: row.completed === 1,
    sort: row.sort,
    note: row.note,
    noteUpdatedAt: row.note_updated_at,
    repeat: row.repeat,
    trackId: row.track_id,
    quiet: row.quiet === 1,
    inboxGroup: (row.inbox_group as InboxGroup) ?? 'capture',
    energy: (row.energy as EnergyLevel) ?? null,
    tags: parseTags(row.tags),
    loggedSec: row.logged_sec ?? 0,
    carriedOver: row.carried_over === 1,
    importedFromTodo: row.imported_from_todo === 1,
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
    subtaskId?: number | null
    title: string
    kind: BlockKind
    startMin: number
    durationMin: number
    pomodoros?: number
    sort?: number
    note?: string
    noteUpdatedAt?: string | null
    repeat?: BlockRepeat
    trackId?: number | null
    quiet?: boolean
    inboxGroup?: InboxGroup
    energy?: EnergyLevel | null
    tags?: string[]
    loggedSec?: number
    carriedOver?: boolean
    importedFromTodo?: boolean
  }
): Promise<number> {
  const tagsStr = block.tags && block.tags.length > 0 ? block.tags.join(',') : ''
  const result = await driver.execute(
    'INSERT INTO day_block (day, task_id, subtask_id, title, kind, start_min, duration_min, pomodoros, sort, note, note_updated_at, "repeat", track_id, quiet, inbox_group, energy, tags, logged_sec, carried_over, imported_from_todo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      block.day,
      block.taskId ?? null,
      block.subtaskId ?? null,
      block.title,
      block.kind,
      block.startMin,
      block.durationMin,
      block.pomodoros ?? 0,
      block.sort ?? 0,
      block.note ?? '',
      block.noteUpdatedAt ?? null,
      block.repeat ?? 'once',
      block.trackId ?? null,
      block.quiet ? 1 : 0,
      block.inboxGroup ?? 'capture',
      block.energy ?? null,
      tagsStr,
      block.loggedSec ?? 0,
      block.carriedOver ? 1 : 0,
      block.importedFromTodo ? 1 : 0,
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
  if (patch.subtaskId !== undefined) {
    updates.push('subtask_id = ?')
    values.push(patch.subtaskId)
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
  if (patch.note !== undefined) {
    updates.push('note = ?')
    values.push(patch.note)
  }
  // Written alongside `note` in the same UPDATE — never as a separate statement,
  // or a crash between the two makes "Last edited" describe the wrong revision.
  if (patch.noteUpdatedAt !== undefined) {
    updates.push('note_updated_at = ?')
    values.push(patch.noteUpdatedAt)
  }
  if (patch.repeat !== undefined) {
    updates.push('"repeat" = ?')
    values.push(patch.repeat)
  }
  if (patch.trackId !== undefined) {
    updates.push('track_id = ?')
    values.push(patch.trackId)
  }
  if (patch.quiet !== undefined) {
    updates.push('quiet = ?')
    values.push(patch.quiet ? 1 : 0)
  }
  if (patch.inboxGroup !== undefined) {
    updates.push('inbox_group = ?')
    values.push(patch.inboxGroup)
  }
  if (patch.energy !== undefined) {
    updates.push('energy = ?')
    values.push(patch.energy)
  }
  if (patch.tags !== undefined) {
    updates.push('tags = ?')
    values.push(patch.tags.join(','))
  }
  if (patch.loggedSec !== undefined) {
    updates.push('logged_sec = ?')
    values.push(patch.loggedSec)
  }
  if (patch.carriedOver !== undefined) {
    updates.push('carried_over = ?')
    values.push(patch.carriedOver ? 1 : 0)
  }
  if (patch.importedFromTodo !== undefined) {
    updates.push('imported_from_todo = ?')
    values.push(patch.importedFromTodo ? 1 : 0)
  }

  if (updates.length === 0) return

  values.push(id)
  await driver.execute(
    `UPDATE day_block SET ${updates.join(', ')} WHERE id = ?`,
    values
  )
}

export async function updateBlockInboxGroup(
  driver: SqlDriver,
  id: number,
  inboxGroup: InboxGroup
): Promise<void> {
  await driver.execute('UPDATE day_block SET inbox_group = ? WHERE id = ?', [inboxGroup, id])
}

export async function incrementBlockLoggedTime(
  driver: SqlDriver,
  id: number,
  addedSec: number
): Promise<void> {
  await driver.execute('UPDATE day_block SET logged_sec = logged_sec + ? WHERE id = ?', [addedSec, id])
}

export async function markUnfinishedAsCarriedOver(
  driver: SqlDriver,
  day: string
): Promise<void> {
  await driver.execute(
    'UPDATE day_block SET carried_over = 1 WHERE day = ? AND completed = 0',
    [day]
  )
}

export interface InboxStats {
  capturedToday: number
  completedToday: number
  focusSecLogged: number
  importedFromTodo: number
}

export async function getInboxStats(
  driver: SqlDriver,
  day: string
): Promise<InboxStats> {
  const rows = await driver.select<{
    captured: number
    completed: number
    focus_sec: number
    imported: number
  }>(
    `SELECT
       COUNT(*) as captured,
       SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
       COALESCE(SUM(logged_sec), 0) as focus_sec,
       SUM(CASE WHEN imported_from_todo = 1 THEN 1 ELSE 0 END) as imported
     FROM day_block
     WHERE day = ?`,
    [day]
  )
  const r = rows[0]
  return {
    capturedToday: r?.captured ?? 0,
    completedToday: r?.completed ?? 0,
    focusSecLogged: r?.focus_sec ?? 0,
    importedFromTodo: r?.imported ?? 0,
  }
}

export async function listIncompleteForDay(
  driver: SqlDriver,
  day: string
): Promise<DayBlock[]> {
  const rows = await driver.select<BlockRow>(
    'SELECT * FROM day_block WHERE day = ? AND completed = 0 ORDER BY sort ASC, id ASC',
    [day]
  )
  return rows.map(rowToBlock)
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

export async function listBlocksForRange(
  driver: SqlDriver,
  fromDay: string,
  toDay: string
): Promise<DayBlock[]> {
  const rows = await driver.select<BlockRow>(
    'SELECT * FROM day_block WHERE day >= ? AND day <= ? ORDER BY day, start_min, sort',
    [fromDay, toDay]
  )
  return rows.map(rowToBlock)
}

export async function moveBlockToDayAtomic(
  driver: SqlDriver,
  input: {
    blockId: number
    fromDay: string
    toDay: string
    fromDayOrderedIds: number[]
    toDayOrderedIds: number[]
  }
): Promise<boolean> {
  const { blockId, fromDay, toDay, fromDayOrderedIds, toDayOrderedIds } = input
  // Guard on fromDay so a stale client can't move a block that's already
  // moved elsewhere. `requireRowsAffected` makes that guard cover the WHOLE
  // transaction: a miss rolls the resequencing back too, so `false` means
  // "nothing happened" — the database is byte-for-byte what it was.
  //
  // It did not always. The guard used to be nothing but the extra `AND day =
  // ?`, which aborts only its own statement; the resequences that followed
  // are scoped `WHERE id = ? AND day = ?` per day and committed anyway, so a
  // rejected move still rewrote `sort` on both days from a view of the world
  // already known to be stale. Never corrupting (sort is only a within-day
  // tie-breaker for equal start_min) but a lie all the same. Both outcomes
  // are verified in blocks.test.ts against a real SQLite database, and the
  // guard's rollback again in src-tauri/src/tx.rs against a real file.
  const statements = [
    {
      sql: 'UPDATE day_block SET day = ? WHERE id = ? AND day = ?',
      params: [toDay, blockId, fromDay],
      requireRowsAffected: true,
    },
    ...fromDayOrderedIds.map((id, index) => ({
      sql: 'UPDATE day_block SET sort = ? WHERE id = ? AND day = ?',
      params: [index, id, fromDay],
    })),
    ...toDayOrderedIds.map((id, index) => ({
      sql: 'UPDATE day_block SET sort = ? WHERE id = ? AND day = ?',
      params: [index, id, toDay],
    })),
  ]
  try {
    await driver.transaction(statements)
    return true
  } catch (err) {
    // An unmet guard is the expected "someone else got there first" outcome,
    // reported as false with the database untouched. Anything else is a real
    // SQL failure and must keep propagating to the store's error path.
    if (isGuardUnmet(err)) return false
    throw err
  }
}

export async function moveDayBlocksAtomic(
  driver: SqlDriver,
  day: string,
  changedStarts: { id: number; startMin: number }[],
  orderedIds: number[]
): Promise<void> {
  const statements = [
    ...changedStarts.map(({ id, startMin }) => ({
      sql: 'UPDATE day_block SET start_min = ? WHERE id = ? AND day = ?',
      params: [startMin, id, day],
    })),
    ...orderedIds.map((id, index) => ({
      sql: 'UPDATE day_block SET sort = ? WHERE id = ? AND day = ?',
      params: [index, id, day],
    })),
  ]
  await driver.transaction(statements)
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
    `INSERT INTO day_block (day, task_id, subtask_id, title, kind, start_min, duration_min, pomodoros, sort)
     SELECT ?, NULL, NULL, title, kind, start_min, duration_min, pomodoros, sort
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
