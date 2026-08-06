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
   * Phase 6 F1 writeup in TASKS.md and the comment above
   * `TauriDriver.transaction` for why this exists and its residual
   * limitation under the Tauri SQL plugin.
   */
  transaction(statements: { sql: string; params?: unknown[] }[]): Promise<void>
}
