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

  constructor(maxMigration = Number.POSITIVE_INFINITY) {
    this.db = new DatabaseSync(':memory:')
    this.db.exec('PRAGMA foreign_keys = ON')

    // Apply every migration from the real files, in order. This ensures tests
    // validate against the exact schema that ships to production.
    const migrationsDir = join(import.meta.dirname, '../../src-tauri/migrations')
    const migrationFiles = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()

    for (const file of migrationFiles.slice(0, maxMigration)) {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8')
      this.db.exec(sql)
    }
  }

  applySql(sql: string): void {
    this.db.exec(sql)
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

  // Real BEGIN/ROLLBACK/COMMIT on the single node:sqlite handle. This
  // driver owns one connection directly, so a failure genuinely undoes
  // every statement already applied in this call, verified by
  // src/test/nodeDriver.test.ts's PROBE case reading back via a fresh
  // select(). The production TauriDriver gained the same guarantee in
  // Phase 11 P0-1 via the `execute_transaction` Rust command
  // (src-tauri/src/tx.rs), which owns one fresh connection per
  // transaction — the two drivers' rollback semantics now match.
  transaction(statements: { sql: string; params?: unknown[] }[]): Promise<SqlResult[]> {
    if (statements.length === 0) return Promise.resolve([])

    this.db.exec('BEGIN')
    try {
      const results: SqlResult[] = []
      for (const { sql, params } of statements) {
        const stmt = this.db.prepare(sql)
        const info = stmt.run(...((params ?? []) as Parameters<typeof stmt.run>))
        results.push({
          rowsAffected: Number(info.changes),
          lastInsertId: Number(info.lastInsertRowid),
        })
      }
      this.db.exec('COMMIT')
      return Promise.resolve(results)
    } catch (err) {
      this.db.exec('ROLLBACK')
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }
}

export function createTestDb(maxMigration?: number): { driver: SqlDriver; close(): void; applySql(sql: string): void } {
  const nodeDriver = new NodeSqliteDriver(maxMigration)
  const driver = nodeDriver
  return {
    driver,
    applySql: (sql) => nodeDriver.applySql(sql),
    close: () => {
      // node:sqlite handles cleanup automatically
    },
  }
}
