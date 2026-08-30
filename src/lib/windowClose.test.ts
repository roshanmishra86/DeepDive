import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  destroy: vi.fn<() => Promise<void>>(),
  confirm: vi.fn<(message: string, options: unknown) => Promise<boolean>>(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ destroy: mocks.destroy }),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: mocks.confirm }))

import { flushAndDestroyWindow } from './windowClose'

describe('flushAndDestroyWindow', () => {
  beforeEach(() => {
    mocks.destroy.mockReset().mockResolvedValue(undefined)
    mocks.confirm.mockReset()
  })

  it('destroys the window after pending work saves', async () => {
    await flushAndDestroyWindow(async () => true)

    expect(mocks.destroy).toHaveBeenCalledOnce()
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it('keeps the window open when saving fails and discard is declined', async () => {
    mocks.confirm.mockResolvedValue(false)

    await flushAndDestroyWindow(async () => false)

    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.destroy).not.toHaveBeenCalled()
  })

  it('allows the user to close without saving after a failed flush', async () => {
    mocks.confirm.mockResolvedValue(true)

    await flushAndDestroyWindow(async () => false)

    expect(mocks.destroy).toHaveBeenCalledOnce()
  })
})
