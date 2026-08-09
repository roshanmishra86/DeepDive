/**
 * SQL driver abstraction. Allows the app to run against Tauri's `tauri-plugin-sql`
 * in production and Node.js `node:sqlite` in tests, with compatible interfaces.
 */

export interface SqlResult {
  rowsAffected: number
  lastInsertId: number
}

export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<SqlResult>
  select<T>(sql: string, params?: unknown[]): Promise<T[]>
  /**
   * Runs every statement atomically. An empty list is a no-op. See the
   * Phase 6 F1 writeup in TASKS.md for why this exists. Phase 11 P0-1
   * retired the stranded-pooled-connection residual the Tauri side used to
   * carry: `TauriDriver.transaction` now forwards to the app's
   * `execute_transaction` Rust command (src-tauri/src/tx.rs), which owns
   * one fresh connection per transaction — begin, run every statement,
   * commit, or genuinely roll back on any failure.
   */
  transaction(statements: { sql: string; params?: unknown[] }[]): Promise<void>
}
