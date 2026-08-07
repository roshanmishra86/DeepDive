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

  /**
   * Folds every statement into ONE `execute()` call:
   * `'BEGIN; ' + stmts.join('; ') + '; COMMIT'`, with params flattened in
   * statement order. This is not a style choice — it's required by how the
   * underlying stack works (verified directly against
   * tauri-plugin-sql-2.4.0/src/wrapper.rs, sqlx-sqlite-0.8.6's
   * `connection/execute.rs`, and sqlx-core-0.8.6's `pool/connection.rs`):
   *
   * 1. The plugin runs `sqlx::query(&query)` with all values bound
   *    positionally, on ONE connection taken from the pool for the duration
   *    of that single `execute()` call.
   * 2. sqlx-sqlite's `ExecuteIter` prepares statements one at a time via
   *    `prepare_next` and binds arguments with a running `args_used`
   *    offset, so a single multi-statement string with `?` placeholders
   *    distributed across statements binds correctly.
   *
   * Therefore issuing separate `execute()` calls for BEGIN/COMMIT/the
   * statements would be wrong: the pool is free to hand different calls
   * different connections, so a `COMMIT` could land on a connection that
   * never saw the `BEGIN`.
   *
   * KNOWN RESIDUAL LIMITATION: if a statement fails mid-string, `COMMIT`
   * never runs, and sqlx does NOT roll back on pool release — the
   * connection's `in_transaction` flag is only consulted inside sqlx's own
   * `Transaction::begin`, and the on-release `ping()` doesn't clear it. The
   * already-applied statements are left sitting in an uncommitted
   * transaction on that pooled connection. This is still strictly better
   * than the F1 bug being fixed here — the partial write never commits, so
   * it can never corrupt persisted order — but it can leave a pooled
   * connection stuck mid-transaction. Mitigated with a best-effort
   * `ROLLBACK`, issued in the catch and swallowed if it fails (it may land
   * on a different pooled connection, where it errors harmlessly).
   */
  async transaction(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
    if (statements.length === 0) return
    if (!this.db) throw new Error('Database not connected')

    const sql = 'BEGIN; ' + statements.map((s) => s.sql).join('; ') + '; COMMIT'
    const params = statements.flatMap((s) => s.params ?? [])

    try {
      await this.db.execute(sql, params)
    } catch (err) {
      try {
        await this.db.execute('ROLLBACK')
      } catch {
        // Best-effort only — may land on a different pooled connection,
        // where it errors harmlessly. Swallowed intentionally.
      }
      throw err
    }
  }
}
