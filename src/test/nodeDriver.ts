/**
 * Test SQL driver backed by Node.js built-in `node:sqlite` (DatabaseSync).
 * Reads the real migration files from disk and applies them on startup.
 * This ensures tests validate against the exact schema that ships to production.
 */

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SqlDriver, SqlResult } from '../db/driver'

class NodeSqliteDriver implements SqlDriver {
  private db: DatabaseSync

  constructor() {
    this.db = new DatabaseSync(':memory:')
    this.db.exec('PRAGMA foreign_keys = ON')

    // Apply every migration from the real files, in order. This ensures tests
    // validate against the exact schema that ships to production.
    const migrationsDir = join(import.meta.dirname, '../../src-tauri/migrations')
    const migrationFiles = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8')
      this.db.exec(sql)
    }
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

  // Real BEGIN/ROLLBACK/COMMIT on the single node:sqlite handle. Unlike
  // TauriDriver (which cannot guarantee rollback — see the comment above
  // `TauriDriver.transaction`), this driver owns one connection directly,
  // so a failure genuinely undoes every statement already applied in this
  // call, verified by src/test/nodeDriver.test.ts's PROBE case reading back
  // via a fresh select().
  transaction(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
    if (statements.length === 0) return Promise.resolve()

    this.db.exec('BEGIN')
    try {
      for (const { sql, params } of statements) {
        const stmt = this.db.prepare(sql)
        stmt.run(...((params ?? []) as Parameters<typeof stmt.run>))
      }
      this.db.exec('COMMIT')
      return Promise.resolve()
    } catch (err) {
      this.db.exec('ROLLBACK')
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
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
