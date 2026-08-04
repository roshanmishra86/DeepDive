/**
 * SQL driver implementation for Tauri, wrapping `@tauri-apps/plugin-sql`.
 * Uses positional ? placeholders compatible with SQLite and sqlx.
 */

import Database from '@tauri-apps/plugin-sql'
import type { SqlDriver, SqlResult } from './driver'

export class TauriDriver implements SqlDriver {
  private db: Database | null = null

  async connect(): Promise<void> {
    this.db = await Database.load('sqlite:deepwork.db')
  }

  async execute(sql: string, params?: unknown[]): Promise<SqlResult> {
    if (!this.db) throw new Error('Database not connected')
    const result = await this.db.execute(sql, params)
    return {
      rowsAffected: result.rowsAffected,
      lastInsertId: result.lastInsertId ?? 0,
    }
  }

  async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.db) throw new Error('Database not connected')
    const result = await this.db.select<T>(sql, params)
    return result as T[]
  }
}
