/**
 * Template repository — schedule templates for repeated day patterns.
 * Includes template blocks (individual events within a template).
 */

import type { SqlDriver } from '../driver'
import type { Template, TemplateBlock, BlockKind } from '../types'
import { DEFAULT_TEMPLATE_START_MIN } from '../../lib/templates'

interface TemplateRow {
  id: number
  name: string
  description: string
  start_min: number
  weekdays: number
}

interface TemplateBlockRow {
  id: number
  template_id: number
  title: string
  kind: BlockKind
  start_min: number
  duration_min: number
  pomodoros: number
  sort: number
}

function templateRowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    startMin: row.start_min,
    weekdays: row.weekdays,
  }
}

function templateBlockRowToBlock(row: TemplateBlockRow): TemplateBlock {
  return {
    id: row.id,
    templateId: row.template_id,
    title: row.title,
    kind: row.kind,
    startMin: row.start_min,
    durationMin: row.duration_min,
    pomodoros: row.pomodoros,
    sort: row.sort,
  }
}

export interface TemplateWithStats extends Template {
  totalMin: number
  blockCount: number
}

export async function listTemplates(driver: SqlDriver): Promise<TemplateWithStats[]> {
  const rows = await driver.select<TemplateRow & { totalMin: number; blockCount: number }>(
    `SELECT t.*,
            COALESCE(SUM(tb.duration_min), 0) as totalMin,
            COUNT(tb.id) as blockCount
     FROM template t
     LEFT JOIN template_block tb ON t.id = tb.template_id
     GROUP BY t.id
     ORDER BY t.name`
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    startMin: row.start_min,
    weekdays: row.weekdays,
    totalMin: row.totalMin,
    blockCount: row.blockCount,
  }))
}

export interface TemplateDetail extends Template {
  blocks: TemplateBlock[]
}

export async function getTemplate(
  driver: SqlDriver,
  id: number
): Promise<TemplateDetail | null> {
  const tRows = await driver.select<TemplateRow>('SELECT * FROM template WHERE id = ?', [id])
  if (tRows.length === 0) return null

  const template = templateRowToTemplate(tRows[0])
  const bRows = await driver.select<TemplateBlockRow>(
    'SELECT * FROM template_block WHERE template_id = ? ORDER BY sort',
    [id]
  )

  return {
    ...template,
    blocks: bRows.map(templateBlockRowToBlock),
  }
}

export async function createTemplate(
  driver: SqlDriver,
  template: { name: string; description?: string; startMin: number; weekdays?: number }
): Promise<number> {
  const result = await driver.execute(
    'INSERT INTO template (name, description, start_min, weekdays) VALUES (?, ?, ?, ?)',
    [template.name, template.description ?? '', template.startMin, template.weekdays ?? 0]
  )
  return result.lastInsertId
}

export async function updateTemplate(
  driver: SqlDriver,
  id: number,
  patch: Partial<Omit<Template, 'id'>>
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []

  if (patch.name !== undefined) {
    updates.push('name = ?')
    values.push(patch.name)
  }
  if (patch.description !== undefined) {
    updates.push('description = ?')
    values.push(patch.description)
  }
  if (patch.startMin !== undefined) {
    updates.push('start_min = ?')
    values.push(patch.startMin)
  }
  if (patch.weekdays !== undefined) {
    updates.push('weekdays = ?')
    values.push(patch.weekdays)
  }

  if (updates.length === 0) return

  values.push(id)
  await driver.execute(
    `UPDATE template SET ${updates.join(', ')} WHERE id = ?`,
    values
  )
}

export async function deleteTemplate(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM template WHERE id = ?', [id])
}

export async function addTemplateBlock(
  driver: SqlDriver,
  block: {
    templateId: number
    title: string
    kind: BlockKind
    startMin: number
    durationMin: number
    pomodoros?: number
    sort?: number
  }
): Promise<number> {
  const result = await driver.execute(
    'INSERT INTO template_block (template_id, title, kind, start_min, duration_min, pomodoros, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      block.templateId,
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

// Column mapping for every persistable TemplateBlock field (i.e. every field
// except the immutable/derived ones, id and templateId). Typed as
// Record<keyof Omit<TemplateBlock, 'id' | 'templateId'>, string> — the same
// exhaustive-key convention as PERSISTABLE_BLOCK_FIELDS in stores/templates.ts
// and stores/today.ts — so adding a field to TemplateBlock without adding it
// here fails `tsc -b` instead of the new field being silently dropped on
// persist by whichever caller forgets to handle it.
const TEMPLATE_BLOCK_COLUMNS: Record<keyof Omit<TemplateBlock, 'id' | 'templateId'>, string> = {
  title: 'title',
  kind: 'kind',
  startMin: 'start_min',
  durationMin: 'duration_min',
  pomodoros: 'pomodoros',
  sort: 'sort',
}

// Single source of truth for mapping a TemplateBlock patch to SQL `SET`
// fragments + params. Shared by updateTemplateBlock (single driver.execute)
// and editTemplateBlockAtomic (contributes to a driver.transaction()
// alongside the sort renumbering) so the two can never drift out of sync —
// see the doc comment on TEMPLATE_BLOCK_COLUMNS above.
function buildTemplateBlockUpdate(
  patch: Partial<Omit<TemplateBlock, 'id' | 'templateId'>>
): { setClauses: string[]; values: unknown[] } {
  const setClauses: string[] = []
  const values: unknown[] = []

  for (const key of Object.keys(TEMPLATE_BLOCK_COLUMNS) as (keyof typeof TEMPLATE_BLOCK_COLUMNS)[]) {
    const value = patch[key]
    if (value !== undefined) {
      setClauses.push(`${TEMPLATE_BLOCK_COLUMNS[key]} = ?`)
      values.push(value)
    }
  }

  return { setClauses, values }
}

export async function updateTemplateBlock(
  driver: SqlDriver,
  id: number,
  patch: Partial<Omit<TemplateBlock, 'id' | 'templateId'>>
): Promise<void> {
  const { setClauses, values } = buildTemplateBlockUpdate(patch)

  if (setClauses.length === 0) return

  values.push(id)
  await driver.execute(
    `UPDATE template_block SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  )
}

export async function deleteTemplateBlock(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM template_block WHERE id = ?', [id])
}

export async function reorderTemplateBlocks(
  driver: SqlDriver,
  templateId: number,
  orderedIds: number[]
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await driver.execute(
      'UPDATE template_block SET sort = ? WHERE id = ? AND template_id = ?',
      [i, orderedIds[i], templateId]
    )
  }
}

// Phase 6 F1 (TASKS.md): moveBlock used to persist changed startMin values
// and the sort renumbering as two separate awaited round trips — if the
// second failed, SQLite kept the first's write with no way to revert it,
// corrupting the persisted order while only in-memory state got rolled
// back. This writes both in ONE `driver.transaction()` call so either both
// land or neither does.
export async function moveTemplateBlocksAtomic(
  driver: SqlDriver,
  templateId: number,
  changedStarts: { id: number; startMin: number }[],
  orderedIds: number[]
): Promise<void> {
  const statements = [
    ...changedStarts.map((c) => ({
      sql: 'UPDATE template_block SET start_min = ? WHERE id = ?',
      params: [c.startMin, c.id],
    })),
    ...orderedIds.map((id, i) => ({
      sql: 'UPDATE template_block SET sort = ? WHERE id = ? AND template_id = ?',
      params: [i, id, templateId],
    })),
  ]
  await driver.transaction(statements)
}

// PR-review P1-A fix: editBlock used to patch the edited block's fields and
// then, separately, re-sort the in-memory array and stop — it never
// persisted the renumbered `sort` at all, so a startMin change that altered
// canonical order left the database's `sort` column pointing at the OLD
// order while `start_min` said otherwise. `getTemplate()` reads
// `ORDER BY sort`, so a reload rendered blocks in the wrong order — the same
// "timeline runs backwards, silently" defect class as F1. This writes the
// field patch AND the renumbered sort sequence in ONE `driver.transaction()`
// call, matching moveTemplateBlocksAtomic/removeTemplateBlockAtomic above,
// so a failure partway through can never leave the field patch persisted
// with a stale sort order (or vice versa).
export async function editTemplateBlockAtomic(
  driver: SqlDriver,
  blockId: number,
  patch: Partial<Omit<TemplateBlock, 'id' | 'templateId' | 'sort'>>,
  templateId: number,
  orderedIds: number[]
): Promise<void> {
  const { setClauses, values } = buildTemplateBlockUpdate(patch)

  const statements: { sql: string; params?: unknown[] }[] = []
  if (setClauses.length > 0) {
    statements.push({
      sql: `UPDATE template_block SET ${setClauses.join(', ')} WHERE id = ?`,
      params: [...values, blockId],
    })
  }
  statements.push(
    ...orderedIds.map((id, i) => ({
      sql: 'UPDATE template_block SET sort = ? WHERE id = ? AND template_id = ?',
      params: [i, id, templateId],
    }))
  )

  await driver.transaction(statements)
}

// Phase 6 F1 (TASKS.md): removeBlock had the same non-atomic shape as
// moveBlock — delete then a separate reorder round trip. One transaction
// for both.
export async function removeTemplateBlockAtomic(
  driver: SqlDriver,
  blockId: number,
  templateId: number,
  remainingOrderedIds: number[]
): Promise<void> {
  const statements = [
    { sql: 'DELETE FROM template_block WHERE id = ?', params: [blockId] },
    ...remainingOrderedIds.map((id, i) => ({
      sql: 'UPDATE template_block SET sort = ? WHERE id = ? AND template_id = ?',
      params: [i, id, templateId],
    })),
  ]
  await driver.transaction(statements)
}


export async function saveDayAsTemplate(
  driver: SqlDriver,
  day: string,
  name: string,
  description?: string
): Promise<number> {
  // Derive start_min from the day's earliest block; fall back to the default
  const blockRows = await driver.select<{ start_min: number }>(
    'SELECT MIN(start_min) as start_min FROM day_block WHERE day = ?',
    [day]
  )
  const startMin =
    blockRows.length > 0 && blockRows[0].start_min !== null
      ? blockRows[0].start_min
      : DEFAULT_TEMPLATE_START_MIN

  // Create template
  const templateResult = await driver.execute(
    'INSERT INTO template (name, description, start_min, weekdays) VALUES (?, ?, ?, ?)',
    [name, description ?? '', startMin, 0]
  )
  const templateId = templateResult.lastInsertId

  // Copy blocks from day_block to template_block
  await driver.execute(
    `INSERT INTO template_block (template_id, title, kind, start_min, duration_min, pomodoros, sort)
     SELECT ?, title, kind, start_min, duration_min, pomodoros, sort
     FROM day_block
     WHERE day = ?
     ORDER BY sort`,
    [templateId, day]
  )

  return templateId
}
