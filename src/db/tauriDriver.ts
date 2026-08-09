/**
 * SQL driver implementation for Tauri, wrapping `@tauri-apps/plugin-sql`.
 * Uses positional ? placeholders compatible with SQLite and sqlx.
 */

import Database from '@tauri-apps/plugin-sql'
import { invoke } from '@tauri-apps/api/core'
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

  /**
   * Phase 11 P0-1 retired the previous BEGIN/…/COMMIT folding strategy (and
   * its stranded-pooled-connection residual) in favour of the app command
   * `execute_transaction` (src-tauri/src/tx.rs). That command owns ONE fresh
   * connection per transaction — begin, run every statement, commit, or roll
   * back on any failure — so a mid-transaction failure genuinely rolls back
   * and can never strand a pooled connection. Real atomicity is proven by
   * the Rust tests in tx.rs against a real SQLite file.
   */
  async transaction(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
    if (statements.length === 0) return
    if (!this.db) throw new Error('Database not connected')
    await invoke('execute_transaction', { statements })
  }
}
