import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from './driver'

describe('migrations', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('creates all spec-required indexes', async () => {
    const indexes = await driver.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      []
    )
    const indexNames = indexes.map((i) => i.name).sort()
    const expected = [
      'idx_day_block_day',
      'idx_day_block_day_sort',
      'idx_day_block_task_id',
      'idx_template_block_template_id_sort',
      'idx_ritual_log_day',
      'idx_distraction_day',
      'idx_pomodoro_session_block_id',
      'idx_pomodoro_session_started_at',
      'idx_task_archived_done',
      'idx_task_archived_sort',
      'idx_task_archived_at',
      'idx_subtask_task_id_sort',
      'idx_day_block_subtask_id',
      'idx_subtask_due_at',
    ].sort()
    expect(indexNames).toEqual(expected)
  })

  it('creates all 12 tables', async () => {
    const tables = await driver.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      []
    )

    const tableNames = tables.map((t) => t.name).sort()
    const expected = [
      'day_block',
      'day_note',
      'distraction',
      'pomodoro_session',
      'ritual',
      'ritual_log',
      'setting',
      'subtask',
      'task',
      'template',
      'template_block',
      'track',
    ].sort()

    expect(tableNames).toEqual(expected)
  })

  it('seeds 3 rituals', async () => {
    const rituals = await driver.select<{ count: number }>(
      'SELECT COUNT(*) as count FROM ritual',
      []
    )
    expect(rituals[0].count).toBe(3)
  })

  it('seeds 1 template', async () => {
    const templates = await driver.select<{ count: number }>(
      'SELECT COUNT(*) as count FROM template',
      []
    )
    expect(templates[0].count).toBe(1)
  })

  it('seeds 5 template blocks', async () => {
    const blocks = await driver.select<{ count: number }>(
      'SELECT COUNT(*) as count FROM template_block',
      []
    )
    expect(blocks[0].count).toBe(5)
  })

  it('seeds 8 settings', async () => {
    const settings = await driver.select<{ count: number }>(
      'SELECT COUNT(*) as count FROM setting',
      []
    )
    expect(settings[0].count).toBe(8)
  })

  it('seeds weeklyGoalMin at 20 hours', async () => {
    const rows = await driver.select<{ value: string }>(
      'SELECT value FROM setting WHERE key = ?',
      ['weeklyGoalMin']
    )
    expect(rows).toEqual([{ value: '1200' }])
  })

  it('defaults task.priority to medium and enforces its CHECK constraint', async () => {
    const inserted = await driver.execute(
      'INSERT INTO task (title, created_at) VALUES (?, ?)',
      ['Priority default', '2026-08-11T09:00:00Z']
    )
    const rows = await driver.select<{ priority: string }>(
      'SELECT priority FROM task WHERE id = ?',
      [inserted.lastInsertId]
    )
    expect(rows[0].priority).toBe('medium')

    let error: unknown = null
    try {
      await driver.execute(
        'INSERT INTO task (title, created_at, priority) VALUES (?, ?, ?)',
        ['Bad priority', '2026-08-11T09:00:00Z', 'urgent']
      )
    } catch (e) {
      error = e
    }
    expect(error).not.toBeNull()
  })

  it('adds nullable subtask.due_at and day_block.note_updated_at', async () => {
    const task = await driver.execute(
      'INSERT INTO task (title, created_at) VALUES (?, ?)',
      ['Parent', '2026-08-11T09:00:00Z']
    )
    const subtask = await driver.execute(
      'INSERT INTO subtask (task_id, title, estimate_min, created_at) VALUES (?, ?, ?, ?)',
      [task.lastInsertId, 'Child', 30, '2026-08-11T09:00:00Z']
    )
    const subtaskRows = await driver.select<{ due_at: string | null }>(
      'SELECT due_at FROM subtask WHERE id = ?',
      [subtask.lastInsertId]
    )
    expect(subtaskRows[0].due_at).toBeNull()

    const block = await driver.execute(
      'INSERT INTO day_block (day, title, kind, start_min, duration_min) VALUES (?, ?, ?, ?, ?)',
      ['2026-08-11', 'Block', 'deep', 540, 90]
    )
    const blockRows = await driver.select<{ note: string; note_updated_at: string | null }>(
      'SELECT note, note_updated_at FROM day_block WHERE id = ?',
      [block.lastInsertId]
    )
    expect(blockRows[0]).toEqual({ note: '', note_updated_at: null })
  })

  it('enforces CHECK constraint on day_block.kind', async () => {
    let error: any = null
    try {
      await driver.execute(
        'INSERT INTO day_block (day, title, kind, start_min, duration_min) VALUES (?, ?, ?, ?, ?)',
        ['2026-08-03', 'Invalid', 'invalid_kind', 300, 90]
      )
    } catch (e) {
      error = e
    }
    expect(error).not.toBeNull()
  })

  it('enforces CHECK constraint on pomodoro_session.phase', async () => {
    let error: any = null
    try {
      await driver.execute(
        'INSERT INTO pomodoro_session (started_at, phase) VALUES (?, ?)',
        ['2026-08-03T10:00:00Z', 'invalid_phase']
      )
    } catch (e) {
      error = e
    }
    expect(error).not.toBeNull()
  })

  it('enforces foreign key: template_block CASCADE deletes with template', async () => {
    // Get the Maker Day template
    const templates = await driver.select<{ id: number }>(
      'SELECT id FROM template WHERE name = ?',
      ['Maker Day']
    )
    const templateId = templates[0].id

    // Get count of blocks before delete
    const beforeRows = await driver.select<{ count: number }>(
      'SELECT COUNT(*) as count FROM template_block WHERE template_id = ?',
      [templateId]
    )
    expect(beforeRows[0].count).toBe(5)

    // Delete the template
    await driver.execute('DELETE FROM template WHERE id = ?', [templateId])

    // Verify blocks are gone (cascade delete)
    const afterRows = await driver.select<{ count: number }>(
      'SELECT COUNT(*) as count FROM template_block WHERE template_id = ?',
      [templateId]
    )
    expect(afterRows[0].count).toBe(0)
  })

  it('enforces foreign key: day_block.task_id NULLs out on task delete', async () => {
    // Create a task
    const taskResult = await driver.execute(
      'INSERT INTO task (title, created_at) VALUES (?, ?)',
      ['Test task', new Date().toISOString()]
    )
    const taskId = taskResult.lastInsertId

    // Create a block referencing the task
    const blockResult = await driver.execute(
      'INSERT INTO day_block (day, task_id, title, kind, start_min, duration_min) VALUES (?, ?, ?, ?, ?, ?)',
      ['2026-08-03', taskId, 'Block', 'deep', 300, 90]
    )
    const blockId = blockResult.lastInsertId

    // Verify block references the task
    let block = await driver.select<{ task_id: number | null }>(
      'SELECT task_id FROM day_block WHERE id = ?',
      [blockId]
    )
    expect(block[0].task_id).toBe(taskId)

    // Delete the task
    await driver.execute('DELETE FROM task WHERE id = ?', [taskId])

    // Verify task_id is NULL (SET NULL)
    block = await driver.select<{ task_id: number | null }>(
      'SELECT task_id FROM day_block WHERE id = ?',
      [blockId]
    )
    expect(block[0].task_id).toBeNull()
  })
})
