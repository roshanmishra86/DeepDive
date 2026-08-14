import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDb } from '../test/nodeDriver'

describe('migration 0005 upgrade', () => {
  it('preserves legacy rows and backfills manual task order', async () => {
    const db = createTestDb(4)
    const { driver } = db
    const first = await driver.execute('INSERT INTO task (title, notes, due_at, done, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['Later', 'keep me', '2026-08-12', 0, 0, '2026-08-10T08:00:00Z'])
    const second = await driver.execute('INSERT INTO task (title, notes, due_at, done, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['Done active', 'keep active', '2026-08-09', 1, 0, '2026-08-10T08:30:00Z'])
    const third = await driver.execute('INSERT INTO task (title, notes, due_at, done, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['No deadline', 'keep no due', null, 0, 0, '2026-08-10T08:45:00Z'])
    const archivedFirst = await driver.execute('INSERT INTO task (title, notes, due_at, done, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['Archived done', 'archive me', '2026-08-11', 1, 1, '2026-08-10T09:00:00Z'])
    const archivedSecond = await driver.execute('INSERT INTO task (title, notes, due_at, done, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['Archived open', 'archive open', '2026-08-10', 0, 1, '2026-08-10T09:10:00Z'])
    const block = await driver.execute('INSERT INTO day_block (day, task_id, title, kind, start_min, duration_min) VALUES (?, ?, ?, ?, ?, ?)', ['2026-08-10', first.lastInsertId, 'Legacy block', 'deep', 300, 30])
    await driver.execute('INSERT INTO day_note (day, note) VALUES (?, ?)', ['2026-08-10', 'Legacy note'])
    db.applySql(readFileSync(join(import.meta.dirname, '../../src-tauri/migrations/0005_task_planning.sql'), 'utf8'))

    const taskRows = await driver.select<{ id: number; notes: string; sort: number }>('SELECT id, notes, sort FROM task ORDER BY id', [])
    expect(taskRows).toEqual([
      { id: first.lastInsertId, notes: 'keep me', sort: 0 },
      { id: second.lastInsertId, notes: 'keep active', sort: 2 },
      { id: third.lastInsertId, notes: 'keep no due', sort: 1 },
      { id: archivedFirst.lastInsertId, notes: 'archive me', sort: 1 },
      { id: archivedSecond.lastInsertId, notes: 'archive open', sort: 0 },
    ])
    const blockRow = await driver.select<{ task_id: number | null; subtask_id: number | null }>('SELECT task_id, subtask_id FROM day_block WHERE id = ?', [block.lastInsertId])
    expect(blockRow[0]).toEqual({ task_id: first.lastInsertId, subtask_id: null })
    expect(await driver.select<{ value: string }>('SELECT value FROM setting WHERE key = ?', ['repeatMode'])).toEqual([{ value: 'off' }])
    expect(await driver.select<{ value: string }>('SELECT value FROM setting WHERE key = ?', ['loopUntilBlockEnd'])).toEqual([])
  })
})

describe('migration 0006 upgrade', () => {
  it('backfills priority from every quadrant and leaves existing notes untouched', async () => {
    const db = createTestDb(5)
    const { driver } = db
    const insertTask = (title: string, important: number, urgent: number) =>
      driver.execute(
        'INSERT INTO task (title, notes, important, urgent, created_at) VALUES (?, ?, ?, ?, ?)',
        [title, `${title} notes`, important, urgent, '2026-08-10T08:00:00Z']
      )
    const both = await insertTask('Important and urgent', 1, 1)
    const importantOnly = await insertTask('Important only', 1, 0)
    const urgentOnly = await insertTask('Urgent only', 0, 1)
    const neither = await insertTask('Neither', 0, 0)
    const block = await driver.execute(
      'INSERT INTO day_block (day, title, kind, start_min, duration_min, note) VALUES (?, ?, ?, ?, ?, ?)',
      ['2026-08-10', 'Legacy block', 'deep', 540, 90, 'Plain text note with <p> in it']
    )

    db.applySql(readFileSync(join(import.meta.dirname, '../../src-tauri/migrations/0006_notes_priority_and_week.sql'), 'utf8'))

    const taskRows = await driver.select<{ id: number; notes: string; priority: string }>(
      'SELECT id, notes, priority FROM task ORDER BY id',
      []
    )
    expect(taskRows).toEqual([
      { id: both.lastInsertId, notes: 'Important and urgent notes', priority: 'high' },
      { id: importantOnly.lastInsertId, notes: 'Important only notes', priority: 'medium' },
      { id: urgentOnly.lastInsertId, notes: 'Urgent only notes', priority: 'medium' },
      { id: neither.lastInsertId, notes: 'Neither notes', priority: 'low' },
    ])

    // Existing note text survives verbatim, and note_updated_at stays NULL —
    // the migration must not claim a note was edited when it was not.
    const blockRows = await driver.select<{ note: string; note_updated_at: string | null }>(
      'SELECT note, note_updated_at FROM day_block WHERE id = ?',
      [block.lastInsertId]
    )
    expect(blockRows[0]).toEqual({ note: 'Plain text note with <p> in it', note_updated_at: null })

    expect(await driver.select<{ value: string }>('SELECT value FROM setting WHERE key = ?', ['weeklyGoalMin'])).toEqual([{ value: '1200' }])
  })
})
