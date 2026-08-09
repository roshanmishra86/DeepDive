import { describe, it, expect, vi, beforeEach } from 'vitest'

// `@tauri-apps/plugin-sql` talks to a real Tauri webview/Rust backend that
// doesn't exist in this Node test environment, so `Database.load` is mocked
// (still needed for `connect()`). `@tauri-apps/api/core`'s `invoke` is also
// mocked. What THIS test proves: `transaction()` forwards the statement
// list unchanged to the Rust `execute_transaction` command — the one part
// of the strategy this driver controls and that a regression could silently
// break. Real atomicity (begin / commit / rollback-on-error on one owned
// connection) is proven natively by the Rust tests in src-tauri/src/tx.rs
// against a real SQLite file.
const executeMock = vi.fn().mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
const invokeMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: class MockDatabase {
    static async load() {
      return new MockDatabase()
    }
    execute = executeMock
    select = vi.fn().mockResolvedValue([])
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

describe('TauriDriver.transaction', () => {
  beforeEach(() => {
    executeMock.mockClear()
    invokeMock.mockClear()
  })

  it('forwards the statement list unchanged to the execute_transaction command', async () => {
    const { TauriDriver } = await import('./tauriDriver')
    const driver = new TauriDriver()
    await driver.connect()

    const statements = [
      { sql: 'UPDATE template_block SET start_min = ? WHERE id = ?', params: [999, 1] },
      {
        sql: 'UPDATE template_block SET sort = ? WHERE id = ? AND template_id = ?',
        params: [0, 2, 5],
      },
    ]
    await driver.transaction(statements)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('execute_transaction', { statements })
    // Params preserved in order, per statement.
    const passed = invokeMock.mock.calls[0][1].statements
    expect(passed[0].params).toEqual([999, 1])
    expect(passed[1].params).toEqual([0, 2, 5])
  })

  it('is a no-op for an empty statement list', async () => {
    const { TauriDriver } = await import('./tauriDriver')
    const driver = new TauriDriver()
    await driver.connect()

    await driver.transaction([])

    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('propagates a rejection from the Rust command to the caller', async () => {
    const { TauriDriver } = await import('./tauriDriver')
    const driver = new TauriDriver()
    await driver.connect()

    invokeMock.mockRejectedValueOnce(new Error('statement 1 failed, transaction rolled back'))
    await expect(
      driver.transaction([{ sql: 'INSERT INTO t (n) VALUES (?)', params: [1] }])
    ).rejects.toThrow('statement 1 failed, transaction rolled back')
  })
})
