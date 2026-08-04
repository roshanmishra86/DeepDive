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
}
