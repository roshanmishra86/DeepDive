/**
 * Phase 11 P0-2 regression tests: the session run-token model. Every test
 * drives a deterministic race with GatedDriver — the first action's INSERT
 * is held in flight while a second action lands, then the gate is released
 * and the resulting rows are read back from real SQLite. Under the old
 * model the late INSERT published its id into the newer run's state and the
 * old row stayed open forever; under run tokens every inserted row is
 * finalised exactly once and a late INSERT never publishes into a newer
 * run.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import type { DayBlock } from '../db/types'
import * as blocksRepo from '../db/repos/blocks'
import { useTimerStore, FOCUS_SEC, POMODOROS_PER_BLOCK } from './timer'

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

function makeCandidate(id: number, overrides: Partial<DayBlock> = {}): DayBlock {
  return {
    id,
    day: '2026-08-10',
    taskId: null,
    subtaskId: null,
    title: `Block ${id}`,
    kind: 'deep',
    startMin: 300,
    durationMin: 90,
    pomodoros: 0,
    completed: false,
    sort: 0,
    note: '',
    noteUpdatedAt: null,
    repeat: 'once',
    trackId: null,
    quiet: false,
    ...overrides,
  }
}

/**
 * Holds `INSERT INTO pomodoro_session` statements on a manually-released
 * gate; every other statement passes straight through. This makes the
 * in-flight-INSERT window deterministic: the first action runs un-awaited
 * (its INSERT parked), the closer runs, then `releaseInserts()` lets the
 * parked INSERT resolve into whatever state the closer left behind.
 */
class GatedDriver implements SqlDriver {
  private gate: Promise<void> | null = null
  private open: (() => void) | null = null
  private inner: SqlDriver
  constructor(inner: SqlDriver) {
    this.inner = inner
  }
  holdInserts() {
    this.gate = new Promise((r) => {
      this.open = r
    })
  }
  releaseInserts() {
    this.open?.()
    this.gate = null
    this.open = null
  }
  async execute(sql: string, params?: unknown[]) {
    if (this.gate && sql.startsWith('INSERT INTO pomodoro_session')) await this.gate
    return this.inner.execute(sql, params)
  }
  select<T>(sql: string, params?: unknown[]) {
    return this.inner.select<T>(sql, params)
  }
  transaction(stmts: { sql: string; params?: unknown[] }[]) {
    return this.inner.transaction(stmts)
  }
}

interface RawSessionRow {
  id: number
  block_id: number | null
  phase: string
  ended_at: string | null
  completed: number
}

async function allRows(driver: SqlDriver): Promise<RawSessionRow[]> {
  return driver.select<RawSessionRow>(
    'SELECT id, block_id, phase, ended_at, completed FROM pomodoro_session ORDER BY id'
  )
}

describe('timer sequencing (P0-2 run tokens)', () => {
  let inner: SqlDriver
  let driver: GatedDriver

  beforeEach(async () => {
    const db = createTestDb()
    inner = db.driver
    driver = new GatedDriver(inner)
    resetTimerStore()
    await useTimerStore.getState().hydrate(driver)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('start→reset with INSERT in flight: one row, abandoned, none published', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(inner, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    const candidate = makeCandidate(blockId)

    driver.holdInserts()
    const p1 = useTimerStore.getState().start(candidate)
    await useTimerStore.getState().reset()
    driver.releaseInserts()
    await p1

    const rows = await allRows(inner)
    expect(rows.length).toBe(1)
    expect(rows[0].block_id).toBe(blockId)
    expect(rows[0].phase).toBe('focus')
    expect(rows[0].completed).toBe(0)
    expect(rows[0].ended_at).not.toBeNull()

    const state = useTimerStore.getState()
    expect(state.openSessionId).toBeNull()
    expect(state.pomodorosDone).toBe(0)
    expect(state.blockId).toBeNull()
  })

  it('start→rest with INSERT in flight: focus abandoned, rest open and tracked', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(inner, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    const candidate = makeCandidate(blockId)

    driver.holdInserts()
    const p1 = useTimerStore.getState().start(candidate)
    const p2 = useTimerStore.getState().rest()
    driver.releaseInserts()
    await Promise.all([p1, p2])

    const rows = await allRows(inner)
    expect(rows.length).toBe(2)
    const focusRow = rows.find((r) => r.phase === 'focus')!
    const restRow = rows.find((r) => r.phase === 'rest')!
    expect(focusRow.completed).toBe(0)
    expect(focusRow.ended_at).not.toBeNull()
    expect(restRow.ended_at).toBeNull()
    // The late focus INSERT must NOT have published into the rest run.
    expect(useTimerStore.getState().openSessionId).toBe(restRow.id)
  })

  it('start→tick-to-zero with INSERT in flight: one row, completed, counter +1', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(inner, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    const candidate = makeCandidate(blockId)

    driver.holdInserts()
    const p1 = useTimerStore.getState().start(candidate)
    const endsAt = useTimerStore.getState().endsAt!
    const p2 = useTimerStore.getState().tick(endsAt)
    driver.releaseInserts()
    await Promise.all([p1, p2])

    const rows = await allRows(inner)
    expect(rows.length).toBe(1)
    expect(rows[0].completed).toBe(1)
    expect(rows[0].ended_at).not.toBeNull()

    const state = useTimerStore.getState()
    expect(state.pomodorosDone).toBe(1)
    expect(state.openSessionId).toBeNull()
  })

  it('start→start (direct, while running): first abandoned, second open and tracked', async () => {
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(inner, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    const candidate = makeCandidate(blockId)

    driver.holdInserts()
    const p1 = useTimerStore.getState().start(candidate)
    const p2 = useTimerStore.getState().start(candidate)
    driver.releaseInserts()
    await Promise.all([p1, p2])

    const rows = await allRows(inner)
    expect(rows.length).toBe(2)
    expect(rows[0].completed).toBe(0)
    expect(rows[0].ended_at).not.toBeNull()
    expect(rows[1].ended_at).toBeNull()
    expect(useTimerStore.getState().openSessionId).toBe(rows[1].id)
  })

  it('sub-second pause→start with INSERT in flight resumes the pending run', async () => {
    // pause() ceils the remaining time, so remainingSec === totalSec here
    // and openSessionId is still null — only the live run token tells
    // start() this is a resume, not a fresh start.
    vi.setSystemTime(1000000)
    const blockId = await blocksRepo.createBlock(inner, {
      day: '2026-08-10',
      title: 'Deep block',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    const candidate = makeCandidate(blockId)

    driver.holdInserts()
    const p1 = useTimerStore.getState().start(candidate)
    await useTimerStore.getState().pause()
    const p2 = useTimerStore.getState().start(candidate)
    driver.releaseInserts()
    await Promise.all([p1, p2])

    const rows = await allRows(inner)
    expect(rows.length).toBe(1)
    expect(rows[0].ended_at).toBeNull()

    const state = useTimerStore.getState()
    expect(state.openSessionId).toBe(rows[0].id)
    expect(state.running).toBe(true)
  })

  it('null driver: state transitions behave exactly as before, nothing persists', async () => {
    await useTimerStore.getState().hydrate(null)
    vi.setSystemTime(1000000)
    const candidate = makeCandidate(42)

    await useTimerStore.getState().start(candidate)
    expect(useTimerStore.getState().running).toBe(true)
    expect(useTimerStore.getState().blockId).toBe(42)

    await useTimerStore.getState().pause()
    expect(useTimerStore.getState().running).toBe(false)

    await useTimerStore.getState().start(candidate)
    expect(useTimerStore.getState().running).toBe(true)

    await useTimerStore.getState().rest()
    expect(useTimerStore.getState().phase).toBe('rest')

    await useTimerStore.getState().reset()
    const state = useTimerStore.getState()
    expect(state.phase).toBe('focus')
    expect(state.running).toBe(false)
    expect(state.pomodorosDone).toBe(0)
    expect(state.blockId).toBeNull()
    expect(state.openSessionId).toBeNull()

    // Nothing to read back — the gated driver saw no writes at all.
    const rows = await allRows(inner)
    expect(rows.length).toBe(0)
  })
})
