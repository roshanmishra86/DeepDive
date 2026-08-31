import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdaterController, type UpdaterDependencies } from './updater'

function harness(update: Record<string, unknown> | null = null) {
  const check = vi.fn(async () => update as never)
  const dependencies: UpdaterDependencies = {
    supported: () => true,
    currentVersion: async () => '1.0.0',
    check,
    prepareForExit: async () => ({ safe: true }),
    relaunch: async () => undefined,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
  }
  return { controller: new UpdaterController(dependencies), check, dependencies }
}

describe('updater controller', () => {
  beforeEach(() => vi.useRealTimers())

  it('deduplicates checks and reports manual no-update state', async () => {
    let resolve!: (value: null) => void
    const pending = new Promise<null>((done) => { resolve = done })
    const { controller, check } = harness()
    check.mockImplementation(() => pending as never)
    const first = controller.check(true)
    const second = controller.check(true)
    expect(check).toHaveBeenCalledOnce()
    resolve(null)
    await Promise.all([first, second])
    expect(controller.getSnapshot().manualMessage).toBe('DeepDive is up to date.')
  })

  it('tracks known and unknown download sizes and supports deferral', async () => {
    const download = vi.fn(async (onEvent: (event: never) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } } as never)
      onEvent({ event: 'Progress', data: { chunkLength: 40 } } as never)
      onEvent({ event: 'Progress', data: { chunkLength: 60 } } as never)
    })
    const { controller } = harness({ version: '1.1.0', body: 'Fixes', download, install: vi.fn() })
    await controller.check()
    await controller.download()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', downloadedBytes: 100, totalBytes: 100 })
    controller.defer()
    expect(controller.getSnapshot().deferred).toBe(true)
  })

  it('keeps automatic errors quiet and exposes manual errors', async () => {
    const { controller, check } = harness()
    check.mockRejectedValue(new Error('offline'))
    await controller.check(false)
    expect(controller.getSnapshot().phase).toBe('idle')
    await controller.check(true)
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', failedOperation: 'check', error: 'offline' })
  })

  it('never installs after an unsafe save result', async () => {
    const install = vi.fn()
    const { controller, dependencies } = harness({ version: '1.1.0', download: vi.fn(), install })
    dependencies.prepareForExit = async () => ({ safe: false, error: 'save failed' })
    await controller.check()
    await controller.installAndRelaunch()
    expect(install).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', failedOperation: 'save' })
  })

  it('checks after five seconds and every six hours', async () => {
    vi.useFakeTimers()
    const { controller, check } = harness()
    controller.startSchedule()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1_000)
    expect(check).toHaveBeenCalledTimes(2)
  })
})
