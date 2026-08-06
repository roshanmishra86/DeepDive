/**
 * Template repository — schedule templates for repeated day patterns.
 * Includes template blocks (individual events within a template).
 */

import type { SqlDriver } from '../driver'
import type { Template, TemplateBlock, BlockKind } from '../types'

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

export async function updateTemplateBlock(
  driver: SqlDriver,
  id: number,
  patch: Partial<Omit<TemplateBlock, 'id' | 'templateId'>>
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []

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
  if (patch.sort !== undefined) {
    updates.push('sort = ?')
    values.push(patch.sort)
  }

  if (updates.length === 0) return

  values.push(id)
  await driver.execute(
    `UPDATE template_block SET ${updates.join(', ')} WHERE id = ?`,
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
  // Derive start_min from the day's earliest block; fall back to 300
  const blockRows = await driver.select<{ start_min: number }>(
    'SELECT MIN(start_min) as start_min FROM day_block WHERE day = ?',
    [day]
  )
  const startMin = blockRows.length > 0 && blockRows[0].start_min !== null ? blockRows[0].start_min : 300

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
