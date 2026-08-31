import { beforeEach, describe, expect, it } from 'vitest'
import {
  prepareForExit,
  registerSaveParticipant,
  resetSaveCoordinatorForTests,
  trackDatabaseWrite,
} from './saveCoordinator'

describe('save coordinator', () => {
  beforeEach(resetSaveCoordinatorForTests)

  it('flushes every editor and waits for writes created by a flush', async () => {
    const events: string[] = []
    registerSaveParticipant('plan', async () => {
      events.push('plan')
      trackDatabaseWrite(new Promise<void>((resolve) => setTimeout(() => {
        events.push('write')
        resolve()
      }, 5)))
      return true
    })
    registerSaveParticipant('today', async () => {
      events.push('today')
      return true
    })

    expect(await prepareForExit()).toEqual({ safe: true })
    expect(events).toContain('write')
    expect(events.slice(0, 2).sort()).toEqual(['plan', 'today'])
  })

  it('is unsafe when an editor or database write fails', async () => {
    registerSaveParticipant('editor', async () => false)
    await expect(prepareForExit()).resolves.toMatchObject({ safe: false })

    resetSaveCoordinatorForTests()
    registerSaveParticipant('editor', async () => {
      void trackDatabaseWrite(Promise.reject(new Error('disk full'))).catch(() => undefined)
      return true
    })
    await expect(prepareForExit()).resolves.toMatchObject({ safe: false })
  })

  it('deduplicates concurrent preparations', async () => {
    let calls = 0
    registerSaveParticipant('editor', async () => {
      calls += 1
      return true
    })
    await Promise.all([prepareForExit(), prepareForExit()])
    expect(calls).toBe(1)
  })
})
