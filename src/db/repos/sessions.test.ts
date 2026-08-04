import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as sessions from './sessions'
import * as blocks from './blocks'

describe('sessions repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('starts a session', async () => {
    const id = await sessions.startSession(driver, {
      blockId: null,
      phase: 'focus',
      startedAt: new Date().toISOString(),
    })
    expect(id).toBeGreaterThan(0)
  })

  it('finishes a session', async () => {
    const blockId = await blocks.createBlock(driver, {
      day: '2026-08-03',
      title: 'Test block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    const sessionId = await sessions.startSession(driver, {
      blockId,
      phase: 'focus',
      startedAt: '2026-08-03T10:00:00Z',
    })

    const endedAt = '2026-08-03T10:25:00Z'
    await sessions.finishSession(driver, sessionId, { endedAt, completed: true })

    const list = await sessions.listSessionsForBlock(driver, blockId)
    const session = list.find((s) => s.id === sessionId)
    expect(session?.endedAt).toBe(endedAt)
    expect(session?.completed).toBe(true)
  })

  it('lists sessions for a block', async () => {
    // Create a block first
    const blockId = await blocks.createBlock(driver, {
      day: '2026-08-03',
      title: 'Test block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })

    const s1 = await sessions.startSession(driver, {
      blockId,
      phase: 'focus',
      startedAt: '2026-08-03T10:00:00Z',
    })
    const s2 = await sessions.startSession(driver, {
      blockId,
      phase: 'rest',
      startedAt: '2026-08-03T10:30:00Z',
    })

    const list = await sessions.listSessionsForBlock(driver, blockId)
    expect(list.length).toBe(2)
    expect(list.find((s) => s.id === s1)).not.toBeUndefined()
    expect(list.find((s) => s.id === s2)).not.toBeUndefined()
  })

  it('counts sessions for a day', async () => {
    const day = '2026-08-03'
    // Create a block for the day
    const blockId = await blocks.createBlock(driver, {
      day,
      title: 'Test block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })

    // Create sessions for that block
    await sessions.startSession(driver, {
      blockId,
      phase: 'focus',
      startedAt: new Date().toISOString(),
    })
    await sessions.startSession(driver, {
      blockId,
      phase: 'rest',
      startedAt: new Date().toISOString(),
    })

    const count = await sessions.countSessionsForDay(driver, day)
    expect(count).toBe(2)
  })

  it('excludes sessions with no block from countSessionsForDay', async () => {
    // A session with blockId: null cannot join to any day and must not be counted.
    await sessions.startSession(driver, {
      blockId: null,
      phase: 'focus',
      startedAt: new Date().toISOString(),
    })
    const count = await sessions.countSessionsForDay(driver, '2026-08-03')
    expect(count).toBe(0)
  })
})
