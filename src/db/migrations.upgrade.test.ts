import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDb } from '../test/nodeDriver'

describe('migration 0005 upgrade', () => {
  it('preserves legacy rows and backfills manual task order', async () => {
    const db = createTestDb(4)
    const { driver } = db
    const first = await driver.execute('INSERT INTO task (title, notes, due_at, done, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['Later', 'keep me', '2026-08-12', 0, 0, '2026-08-10T08:00:00Z'])
    const second = await driver.execute('INSERT INTO task (title, notes, due_at, done, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['Done', 'archive me', '2026-08-11', 1, 1, '2026-08-10T09:00:00Z'])
    const block = await driver.execute('INSERT INTO day_block (day, task_id, title, kind, start_min, duration_min) VALUES (?, ?, ?, ?, ?, ?)', ['2026-08-10', first.lastInsertId, 'Legacy block', 'deep', 300, 30])
    await driver.execute('INSERT INTO day_note (day, note) VALUES (?, ?)', ['2026-08-10', 'Legacy note'])
    db.applySql(readFileSync(join(import.meta.dirname, '../../src-tauri/migrations/0005_task_planning.sql'), 'utf8'))

    const taskRows = await driver.select<{ id: number; notes: string; sort: number }>('SELECT id, notes, sort FROM task ORDER BY id', [])
    expect(taskRows).toEqual([
      { id: first.lastInsertId, notes: 'keep me', sort: 0 },
      { id: second.lastInsertId, notes: 'archive me', sort: 0 },
    ])
    const blockRow = await driver.select<{ task_id: number | null; subtask_id: number | null }>('SELECT task_id, subtask_id FROM day_block WHERE id = ?', [block.lastInsertId])
    expect(blockRow[0]).toEqual({ task_id: first.lastInsertId, subtask_id: null })
    expect(await driver.select<{ value: string }>('SELECT value FROM setting WHERE key = ?', ['repeatMode'])).toEqual([{ value: 'off' }])
    expect(await driver.select<{ value: string }>('SELECT value FROM setting WHERE key = ?', ['loopUntilBlockEnd'])).toEqual([])
  })
})
