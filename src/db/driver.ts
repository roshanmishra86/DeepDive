/**
 * SQL driver abstraction. Allows the app to run against Tauri's `tauri-plugin-sql`
 * in production and Node.js `node:sqlite` in tests, with compatible interfaces.
 */

export interface SqlResult {
  rowsAffected: number
  lastInsertId: number
}

export interface TxStatement {
  sql: string
  params?: unknown[]
  /**
   * Makes this statement the transaction's guard: if it affects zero rows,
   * the whole transaction rolls back and `transaction` rejects with a
   * guard-unmet error (see `isGuardUnmet`) instead of committing the rest.
   *
   * A guard written only as an extra `WHERE` clause does NOT do this — it
   * aborts itself while every following statement still commits, which is
   * exactly how a rejected cross-day block move once left both days
   * resequenced (`moveBlockToDayAtomic`).
   */
  requireRowsAffected?: boolean
}

/**
 * Sentinel prefix carried by the error a `requireRowsAffected` violation
 * produces. Must stay identical to `GUARD_UNMET` in `src-tauri/src/tx.rs` —
 * this is a cross-language contract, and the test doubles in
 * `src/test/nodeDriver.ts` reproduce it.
 */
export const GUARD_UNMET = 'TX_GUARD_UNMET'

/**
 * True when a rejection is an unmet row guard rather than a SQL failure. An
 * unmet guard is an expected outcome ("someone else got there first") that
 * the caller turns into a return value; anything else is a real error and
 * must keep propagating.
 */
export function isGuardUnmet(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return message.startsWith(GUARD_UNMET)
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
   * commit, or genuinely roll back on any failure. Returns one result per
   * statement in execution order after a successful commit.
   */
  transaction(statements: TxStatement[]): Promise<SqlResult[]>
}
