/**
 * Test SQL driver backed by Node.js built-in `node:sqlite` (DatabaseSync).
 * Reads the real migration files from disk and applies them on startup.
 * This ensures tests validate against the exact schema that ships to production.
 */

import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SqlDriver, SqlResult } from '../db/driver'

class NodeSqliteDriver implements SqlDriver {
  private db: DatabaseSync

  constructor() {
    this.db = new DatabaseSync(':memory:')
    this.db.exec('PRAGMA foreign_keys = ON')

    // Apply migrations from the real files
    const migrationsDir = join(import.meta.dirname, '../../src-tauri/migrations')
    const init = readFileSync(join(migrationsDir, '0001_init.sql'), 'utf-8')
    const seed = readFileSync(join(migrationsDir, '0002_seed.sql'), 'utf-8')

    this.db.exec(init)
    this.db.exec(seed)
  }

  execute(sql: string, params?: unknown[]): Promise<SqlResult> {
    const stmt = this.db.prepare(sql)
    const info = stmt.run(...((params ?? []) as Parameters<typeof stmt.run>))
    return Promise.resolve({
      rowsAffected: Number(info.changes),
      lastInsertId: Number(info.lastInsertRowid),
    })
  }

  select<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...((params ?? []) as Parameters<typeof stmt.all>)) as T[]
    return Promise.resolve(rows)
  }
}

export function createTestDb(): { driver: SqlDriver; close(): void } {
  const driver = new NodeSqliteDriver()
  return {
    driver,
    close: () => {
      // node:sqlite handles cleanup automatically
    },
  }
}
