import { describe, it, expect, vi, beforeEach } from 'vitest'

// `@tauri-apps/plugin-sql` talks to a real Tauri webview/Rust backend that
// doesn't exist in this Node test environment, so `Database.load` is mocked.
// This test therefore cannot prove real atomicity through the Rust sqlx
// pool — that's established by reading the plugin's source (see the
// comment above `TauriDriver.transaction` and the Phase 6 F1 writeup in
// TASKS.md). What THIS test proves: `transaction()` folds every statement,
// including literal BEGIN/COMMIT, into exactly one `execute()` call with
// positionally-flattened params — the one part of the strategy this driver
// controls and that a regression could silently break (e.g. reverting to
// one execute() call per statement, which is exactly the F1 bug).
const executeMock = vi.fn().mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: class MockDatabase {
    static async load() {
      return new MockDatabase()
    }
    execute = executeMock
    select = vi.fn().mockResolvedValue([])
  },
}))

describe('TauriDriver.transaction', () => {
  beforeEach(() => {
    executeMock.mockClear()
  })

  it('issues exactly one execute() call with BEGIN/COMMIT wrapped around every statement', async () => {
    const { TauriDriver } = await import('./tauriDriver')
    const driver = new TauriDriver()
    await driver.connect()

    await driver.transaction([
      { sql: 'UPDATE template_block SET start_min = ? WHERE id = ?', params: [999, 1] },
      {
        sql: 'UPDATE template_block SET sort = ? WHERE id = ? AND template_id = ?',
        params: [0, 2, 5],
      },
    ])

    expect(executeMock).toHaveBeenCalledTimes(1)
    const [sql, params] = executeMock.mock.calls[0]
    expect(sql).toBe(
      'BEGIN; UPDATE template_block SET start_min = ? WHERE id = ?; ' +
        'UPDATE template_block SET sort = ? WHERE id = ? AND template_id = ?; COMMIT'
    )
    // Params flattened in statement order — this is what lets `?` binding
    // line up correctly across the merged multi-statement string.
    expect(params).toEqual([999, 1, 0, 2, 5])
  })

  it('is a no-op for an empty statement list', async () => {
    const { TauriDriver } = await import('./tauriDriver')
    const driver = new TauriDriver()
    await driver.connect()

    await driver.transaction([])

    expect(executeMock).not.toHaveBeenCalled()
  })
})
