/**
 * Phase 11 P1-3 regression tests: rehydrating per-block pomodoro progress
 * after a relaunch. hydrate(driver, day, nowMin) re-derives the attachment
 * from the CURRENT database block and counts only that block's completed
 * focus rows — rest rows, abandoned rows, other blocks' rows, unattached
 * rows, deleted blocks' rows, and yesterday's rows are all excluded. It
 * never writes to the DB and never resumes a countdown.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as blocksRepo from '../db/repos/blocks'
import * as sessionsRepo from '../db/repos/sessions'
import { pomodoroTargetFor } from '../lib/timer'
import { useTimerStore, FOCUS_SEC, POMODOROS_PER_BLOCK } from './timer'

const DAY = '2026-08-10'
const YESTERDAY = '2026-08-09'
/** 10:00 — inside the standard 9:00–10:30 (540–630) block used below. */
const NOW_MIN = 600

function resetTimerStore() {
  // Merge setState, never replace: true (which would drop the actions).
  useTimerStore.setState({
    phase: 'focus',
    totalSec: FOCUS_SEC,
    remainingSec: FOCUS_SEC,
    running: false,
    endsAt: null,
    pomodorosDone: 0,
    pomodorosPerBlock: POMODOROS_PER_BLOCK,
    blockId: null,
    blockTitle: null,
    blockStartMin: null,
    blockDurationMin: null,
    blockQuiet: false,
    openSessionId: null,
  })
}

/** The standard active block: 9:00–10:30, deep, explicit target of 3. */
async function seedActiveBlock(
  driver: SqlDriver,
  overrides: Partial<Parameters<typeof blocksRepo.createBlock>[1]> = {}
): Promise<number> {
  return blocksRepo.createBlock(driver, {
    day: DAY,
    title: 'Deep block',
    kind: 'deep',
    startMin: 540,
    durationMin: 90,
    pomodoros: 3,
    quiet: true,
    ...overrides,
  })
}

async function seedSession(
  driver: SqlDriver,
  session: { blockId?: number | null; phase: 'focus' | 'rest'; completed: boolean }
): Promise<number> {
  const id = await sessionsRepo.startSession(driver, {
    blockId: session.blockId ?? null,
    phase: session.phase,
    startedAt: new Date().toISOString(),
  })
  if (session.completed || session.phase === 'focus') {
    // Abandoned rows also get an ended_at; only a still-open row stays NULL.
    await sessionsRepo.finishSession(driver, id, {
      endedAt: new Date().toISOString(),
      completed: session.completed,
    })
  }
  return id
}

describe('timer rehydrate (P1-3)', () => {
  let driver: SqlDriver

  beforeEach(async () => {
    const db = createTestDb()
    driver = db.driver
    resetTimerStore()
    await useTimerStore.getState().hydrate(null)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores the count and attachment from completed focus rows only', async () => {
    const blockId = await seedActiveBlock(driver)
    // 2 completed focus rows — the ones that count.
    await seedSession(driver, { blockId, phase: 'focus', completed: true })
    await seedSession(driver, { blockId, phase: 'focus', completed: true })
    // Noise that must NOT count: a completed rest row, an abandoned focus
    // row, a different block's completed row, and an unattached row.
    await seedSession(driver, { blockId, phase: 'rest', completed: true })
    await seedSession(driver, { blockId, phase: 'focus', completed: false })
    const otherBlock = await blocksRepo.createBlock(driver, {
      day: DAY,
      title: 'Other block',
      kind: 'deep',
      startMin: 700,
      durationMin: 60,
    })
    await seedSession(driver, { blockId: otherBlock, phase: 'focus', completed: true })
    await seedSession(driver, { blockId: null, phase: 'focus', completed: true })

    await useTimerStore.getState().hydrate(driver, DAY, NOW_MIN)

    const state = useTimerStore.getState()
    expect(state.pomodorosDone).toBe(2)
    expect(state.blockId).toBe(blockId)
    expect(state.blockTitle).toBe('Deep block')
    expect(state.blockStartMin).toBe(540)
    expect(state.blockDurationMin).toBe(90)
    expect(state.blockQuiet).toBe(true)
    expect(state.pomodorosPerBlock).toBe(3)
    // Never resumes a countdown.
    expect(state.running).toBe(false)
    expect(state.endsAt).toBeNull()
  })

  it('keeps the raw count when it meets the target (display clamps)', async () => {
    const blockId = await seedActiveBlock(driver) // pomodoros: 3
    await seedSession(driver, { blockId, phase: 'focus', completed: true })
    await seedSession(driver, { blockId, phase: 'focus', completed: true })
    await seedSession(driver, { blockId, phase: 'focus', completed: true })

    await useTimerStore.getState().hydrate(driver, DAY, NOW_MIN)

    expect(useTimerStore.getState().pomodorosDone).toBe(3)
    expect(useTimerStore.getState().pomodorosPerBlock).toBe(3)
  })

  it('no active work block at nowMin → stays fresh', async () => {
    // Block window 9:00–10:30 does not contain 12:00.
    const blockId = await seedActiveBlock(driver)
    await seedSession(driver, { blockId, phase: 'focus', completed: true })

    await useTimerStore.getState().hydrate(driver, DAY, 720)

    const state = useTimerStore.getState()
    expect(state.pomodorosDone).toBe(0)
    expect(state.blockId).toBeNull()
  })

  it('only break/ritual blocks active → stays fresh (breaks are not attachable)', async () => {
    await blocksRepo.createBlock(driver, {
      day: DAY,
      title: 'Lunch',
      kind: 'break',
      startMin: 540,
      durationMin: 90,
    })

    await useTimerStore.getState().hydrate(driver, DAY, NOW_MIN)

    const state = useTimerStore.getState()
    expect(state.pomodorosDone).toBe(0)
    expect(state.blockId).toBeNull()
  })

  it('a deleted block’s rows are never counted (FK NULLs block_id)', async () => {
    const deletedId = await seedActiveBlock(driver, { title: 'Deleted block' })
    await seedSession(driver, { blockId: deletedId, phase: 'focus', completed: true })
    await seedSession(driver, { blockId: deletedId, phase: 'focus', completed: true })
    await blocksRepo.deleteBlock(driver, deletedId)

    // Hydrate with NO block active: the deleted block's rows must not
    // attach to anything.
    await useTimerStore.getState().hydrate(driver, DAY, 720)
    expect(useTimerStore.getState().pomodorosDone).toBe(0)
    expect(useTimerStore.getState().blockId).toBeNull()

    // And with a DIFFERENT block active, the orphaned rows still must not
    // leak into its count.
    const survivorId = await blocksRepo.createBlock(driver, {
      day: DAY,
      title: 'Survivor',
      kind: 'deep',
      startMin: 700,
      durationMin: 60,
      pomodoros: 2,
    })
    await useTimerStore.getState().hydrate(driver, DAY, 710)
    const state = useTimerStore.getState()
    expect(state.blockId).toBe(survivorId)
    expect(state.pomodorosDone).toBe(0)
  })

  it('day rollover: yesterday’s rows are not counted today', async () => {
    const oldId = await blocksRepo.createBlock(driver, {
      day: YESTERDAY,
      title: 'Yesterday’s block',
      kind: 'deep',
      startMin: 540,
      durationMin: 90,
    })
    await seedSession(driver, { blockId: oldId, phase: 'focus', completed: true })
    await seedSession(driver, { blockId: oldId, phase: 'focus', completed: true })

    const todayId = await seedActiveBlock(driver)
    await useTimerStore.getState().hydrate(driver, DAY, NOW_MIN)

    const state = useTimerStore.getState()
    expect(state.blockId).toBe(todayId)
    expect(state.pomodorosDone).toBe(0)
  })

  it('hydrate writes nothing to the database', async () => {
    const blockId = await seedActiveBlock(driver)
    await seedSession(driver, { blockId, phase: 'focus', completed: true })

    const before = await driver.select<{ count: number }>(
      'SELECT COUNT(*) as count FROM pomodoro_session'
    )
    await useTimerStore.getState().hydrate(driver, DAY, NOW_MIN)
    const after = await driver.select<{ count: number }>(
      'SELECT COUNT(*) as count FROM pomodoro_session'
    )
    expect(after[0].count).toBe(before[0].count)
  })

  it('a late hydrate does not clobber a started cycle', async () => {
    const blockId = await seedActiveBlock(driver)
    await seedSession(driver, { blockId, phase: 'focus', completed: true })

    // Wire the real driver first (beforeEach hydrated null) so the cycle's
    // row is actually inserted.
    await useTimerStore.getState().hydrate(driver)
    // Start a cycle first (running, attached to the real active block —
    // the same candidate activeWorkBlock would hand the caller; a real id
    // so the INSERT passes the FK and the row exists to be finalised).
    vi.setSystemTime(1000000)
    const blocks = await blocksRepo.listBlocksForDay(driver, DAY)
    const candidate = blocks.find((b) => b.id === blockId)!
    await useTimerStore.getState().start(candidate)
    expect(useTimerStore.getState().running).toBe(true)
    expect(useTimerStore.getState().openSessionId).not.toBeNull()

    await useTimerStore.getState().hydrate(driver, DAY, NOW_MIN)

    const state = useTimerStore.getState()
    expect(state.running).toBe(true)
    expect(state.blockId).toBe(blockId)
    expect(state.blockTitle).toBe('Deep block')
    expect(state.pomodorosDone).toBe(0)

    // The started cycle's run token must survive the late hydrate: ticking
    // to zero finalises its row instead of leaking it open (ended_at NULL
    // forever) — the same leak class P0-2 exists to close.
    const endsAt = useTimerStore.getState().endsAt!
    await useTimerStore.getState().tick(endsAt)
    expect(useTimerStore.getState().pomodorosDone).toBe(1)
    const rows = await driver.select<{ id: number; completed: number; ended_at: string | null }>(
      'SELECT id, completed, ended_at FROM pomodoro_session WHERE block_id = ? ORDER BY id',
      [blockId]
    )
    expect(rows.length).toBe(2)
    expect(rows.every((r) => r.completed === 1 && r.ended_at !== null)).toBe(true)
  })

  it('the archive’s day count is untouched by hydrate', async () => {
    const blockId = await seedActiveBlock(driver)
    await seedSession(driver, { blockId, phase: 'focus', completed: true })
    await seedSession(driver, { blockId, phase: 'focus', completed: true })
    await seedSession(driver, { blockId, phase: 'rest', completed: true })
    await seedSession(driver, { blockId: null, phase: 'focus', completed: true })

    const before = await sessionsRepo.countSessionsForDay(driver, DAY)
    await useTimerStore.getState().hydrate(driver, DAY, NOW_MIN)
    const after = await sessionsRepo.countSessionsForDay(driver, DAY)
    // 3 attached rows (the unattached one joins to no block); unchanged.
    expect(before).toBe(3)
    expect(after).toBe(before)
  })

  it('a block without an explicit pomodoros target gets pomodoroTargetFor’s default', async () => {
    const blockId = await blocksRepo.createBlock(driver, {
      day: DAY,
      title: 'Untargeted',
      kind: 'shallow',
      startMin: 540,
      durationMin: 90,
    })
    await seedSession(driver, { blockId, phase: 'focus', completed: true })

    await useTimerStore.getState().hydrate(driver, DAY, NOW_MIN)

    const state = useTimerStore.getState()
    expect(state.pomodorosDone).toBe(1)
    // floor(90/30) = 3 via maxPomodoros — the derived target.
    const blocks = await blocksRepo.listBlocksForDay(driver, DAY)
    expect(state.pomodorosPerBlock).toBe(pomodoroTargetFor(blocks[0]))
  })
})
