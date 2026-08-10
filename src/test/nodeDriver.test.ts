import { describe, it, expect } from 'vitest'
import { createTestDb } from './nodeDriver'

// Phase 6 F1 (TASKS.md): the node driver backs `createTestDb()`, which every
// store/repo test uses to assert against real SQLite. Before relying on
// `driver.transaction()` anywhere, prove — against this exact driver, not a
// mock — that a mid-transaction failure genuinely rolls back statements that
// already ran, not just whatever the caller happens to hold in memory.
describe('NodeSqliteDriver.transaction', () => {
  it('commits every statement when all succeed', async () => {
    const { driver } = createTestDb()
    const { lastInsertId: templateId } = await driver.execute(
      "INSERT INTO template (name, description, start_min, weekdays) VALUES ('Probe', '', 300, 0)"
    )

    const results = await driver.transaction([
      {
        sql: 'INSERT INTO template_block (template_id, title, kind, start_min, duration_min, pomodoros, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [templateId, 'A', 'deep', 300, 90, 0, 0],
      },
      {
        sql: 'INSERT INTO template_block (template_id, title, kind, start_min, duration_min, pomodoros, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [templateId, 'B', 'break', 390, 30, 0, 1],
      },
    ])

    expect(results).toHaveLength(2)
    expect(results[0].lastInsertId).toBeGreaterThan(0)
    expect(results[1].lastInsertId).toBeGreaterThan(results[0].lastInsertId)

    const rows = await driver.select<{ title: string }>(
      'SELECT title FROM template_block WHERE template_id = ? ORDER BY sort',
      [templateId]
    )
    expect(rows.map((r) => r.title)).toEqual(['A', 'B'])
  })

  it('rejects when a statement fails', async () => {
    const { driver } = createTestDb()
    const { lastInsertId: templateId } = await driver.execute(
      "INSERT INTO template (name, description, start_min, weekdays) VALUES ('Probe', '', 300, 0)"
    )
    const { lastInsertId: blockId } = await driver.execute(
      'INSERT INTO template_block (template_id, title, kind, start_min, duration_min, pomodoros, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [templateId, 'A', 'deep', 300, 90, 0, 0]
    )

    await expect(
      driver.transaction([
        { sql: 'UPDATE template_block SET start_min = ? WHERE id = ?', params: [999, blockId] },
        // title is NOT NULL — this statement genuinely fails.
        { sql: 'UPDATE template_block SET title = ? WHERE id = ?', params: [null, blockId] },
      ])
    ).rejects.toThrow()
  })

  it('PROBE: a rejected transaction genuinely rolls back prior statements in the SAME call — reading back from a fresh select(), not from any in-memory value', async () => {
    const { driver } = createTestDb()
    const { lastInsertId: templateId } = await driver.execute(
      "INSERT INTO template (name, description, start_min, weekdays) VALUES ('Probe', '', 300, 0)"
    )
    const { lastInsertId: blockId } = await driver.execute(
      'INSERT INTO template_block (template_id, title, kind, start_min, duration_min, pomodoros, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [templateId, 'A', 'deep', 300, 90, 0, 0]
    )

    await expect(
      driver.transaction([
        // Statement 1 succeeds on its own — if this weren't atomic, it
        // would land regardless of statement 2's outcome.
        { sql: 'UPDATE template_block SET start_min = ? WHERE id = ?', params: [999, blockId] },
        // Statement 2 fails: title is NOT NULL.
        { sql: 'UPDATE template_block SET title = ? WHERE id = ?', params: [null, blockId] },
      ])
    ).rejects.toThrow()

    const rows = await driver.select<{ start_min: number; title: string }>(
      'SELECT start_min, title FROM template_block WHERE id = ?',
      [blockId]
    )
    // If statement 1 had leaked through despite statement 2 failing, this
    // would read 999. It must read the original 300 — proof the ROLLBACK
    // undid the already-applied write, not just that the call rejected.
    expect(rows[0].start_min).toBe(300)
    expect(rows[0].title).toBe('A')
  })
})
