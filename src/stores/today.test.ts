import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as blocksRepo from '../db/repos/blocks'
import * as tasksRepo from '../db/repos/tasks'
import * as templatesRepo from '../db/repos/templates'
import * as notesRepo from '../db/repos/notes'
import * as settingsRepo from '../db/repos/settings'
import { useTodayStore } from './today'

describe('today store', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
    // The store is a module-level singleton; without an explicit reset here,
    // state (and the local-id counter's effects) leaks between tests and
    // makes them order-dependent — e.g. a later test asserting `blocks`
    // starts empty would silently pass or fail depending on what an earlier
    // test in this file left behind.
    useTodayStore.setState({
      day: null,
      blocks: [],
      loading: false,
      error: null,
      shutdownMin: null,
      shutdownIsDefault: true,
    })
  })

  it('hydrates blocks from the database for a given day', async () => {
    // Create some blocks in the database
    const day = '2026-08-04'
    const blocks = useTodayStore.getState().blocks
    expect(blocks).toHaveLength(0)

    // Hydrate
    await useTodayStore.getState().hydrate(driver, day)

    // No pre-existing blocks in a fresh database, but state should be set
    const state = useTodayStore.getState()
    expect(state.day).toBe(day)
    expect(state.blocks).toEqual([])
  })

  it('adds a block and persists it', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add a block
    await useTodayStore.getState().addBlock({
      title: 'Deep work',
      kind: 'deep',
      durationMin: 90,
      startMin: 300,
      pomodoros: 3,
    })

    // Check in-memory state
    let state = useTodayStore.getState()
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].title).toBe('Deep work')

    // Verify it persisted to the database
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb).toHaveLength(1)
    expect(fromDb[0].title).toBe('Deep work')
  })

  it('adds a block with taskId and persists it', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Create a task first so FK constraint is satisfied
    const taskId = await tasksRepo.createTask(driver, {
      title: 'Dummy task',
      createdAt: new Date().toISOString(),
    })

    // Add a block with a taskId
    await useTodayStore.getState().addBlock({
      title: 'Task-backed block',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
      taskId,
    })

    // Check in-memory state
    let state = useTodayStore.getState()
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].taskId).toBe(taskId)

    // Verify it persisted to the database
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb).toHaveLength(1)
    expect(fromDb[0].taskId).toBe(taskId)
  })

  it('adds block with default startMin after the last block, when fromMin is at or past its end', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add first block with explicit startMin
    await useTodayStore.getState().addBlock({
      title: 'First',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })

    // Add second block without startMin, with fromMin at the first block's end
    await useTodayStore.getState().addBlock({
      title: 'Second',
      kind: 'shallow',
      durationMin: 30,
      fromMin: 360,
    })

    const state = useTodayStore.getState()
    expect(state.blocks).toHaveLength(2)
    // Second block should start at 300 + 60 = 360
    expect(state.blocks[1].startMin).toBe(360)
  })

  it('addBlock with no startMin and no blocks lands exactly at fromMin (no rounding)', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().addBlock({
      title: 'First',
      kind: 'deep',
      durationMin: 60,
      fromMin: 617,
    })

    const state = useTodayStore.getState()
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].startMin).toBe(617)
  })

  it('addBlock with no startMin over an in-progress block lands at that block\'s end time, not at fromMin', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Existing block occupies 300..360
    await useTodayStore.getState().addBlock({
      title: 'Existing',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })

    // fromMin (e.g. "now") falls inside the existing block's window
    await useTodayStore.getState().addBlock({
      title: 'New',
      kind: 'shallow',
      durationMin: 30,
      fromMin: 320,
    })

    const state = useTodayStore.getState()
    const newBlock = state.blocks.find((b) => b.title === 'New')
    expect(newBlock?.startMin).toBe(360) // Existing block's end, not fromMin (320)
  })

  it('addBlock with no startMin and no fromMin still works (defaults to 0)', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().addBlock({
      title: 'First',
      kind: 'deep',
      durationMin: 60,
    })

    const state = useTodayStore.getState()
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].startMin).toBe(0)
  })

  it('edits a block without ripple', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add three blocks in sequence
    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useTodayStore.getState().addBlock({
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })
    await useTodayStore.getState().addBlock({
      title: 'C',
      kind: 'break',
      durationMin: 60,
      startMin: 390,
    })

    // Edit block B's duration without ripple
    const blockB = useTodayStore.getState().blocks.find((b) => b.title === 'B')
    expect(blockB).toBeDefined()
    if (blockB) {
      await useTodayStore.getState().editBlock(blockB.id, { durationMin: 60 }, false)
    }

    // B should be updated, but C should stay at 390 (no ripple)
    const state = useTodayStore.getState()
    const updated = state.blocks.find((b) => b.title === 'B')
    const blockC = state.blocks.find((b) => b.title === 'C')
    expect(updated?.durationMin).toBe(60)
    expect(blockC?.startMin).toBe(390) // Unchanged

    // Verify the edit actually persisted — and that the un-rippled block was
    // not touched in the database either.
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    const persistedB = fromDb.find((b) => b.title === 'B')
    const persistedC = fromDb.find((b) => b.title === 'C')
    expect(persistedB?.durationMin).toBe(60)
    expect(persistedC?.startMin).toBe(390)
    expect(persistedC?.durationMin).toBe(60)
  })

  it('ripple edit applies every changed field to in-memory state, not just startMin (defect 1)', async () => {
    // Mirrors BlockComposer.doSave, which always sends both startMin and
    // durationMin and lets ripple default to true.
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    const taskId = await tasksRepo.createTask(driver, {
      title: 'Linked task',
      createdAt: new Date().toISOString(),
    })
    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/x.mp3', 'X', 'ambient']
    )

    await useTodayStore.getState().addBlock({
      title: 'Original',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    const blockId = useTodayStore.getState().blocks[0].id

    await useTodayStore.getState().editBlock(blockId, {
      title: 'Renamed',
      note: 'A note',
      kind: 'shallow',
      quiet: true,
      repeat: 'daily',
      trackId: trackId.lastInsertId,
      pomodoros: 2,
      taskId,
      startMin: 300,
      durationMin: 60,
    })

    const block = useTodayStore.getState().blocks.find((b) => b.id === blockId)
    expect(block?.title).toBe('Renamed')
    expect(block?.note).toBe('A note')
    expect(block?.kind).toBe('shallow')
    expect(block?.quiet).toBe(true)
    expect(block?.repeat).toBe('daily')
    expect(block?.trackId).toBe(trackId.lastInsertId)
    expect(block?.pomodoros).toBe(2)
    expect(block?.taskId).toBe(taskId)
  })

  it('ripple edit applies durationMin in-memory even when startMin is also patched (defect 2)', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    const blockId = useTodayStore.getState().blocks[0].id

    await useTodayStore.getState().editBlock(blockId, { startMin: 300, durationMin: 90 })

    const block = useTodayStore.getState().blocks.find((b) => b.id === blockId)
    expect(block?.durationMin).toBe(90)
  })

  it('ripple edit with start and duration changed together shifts downstream by the combined end-delta (defect 3)', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // A: 300..360, B: 360..390, C: 390..450
    await useTodayStore.getState().addBlock({ title: 'A', kind: 'deep', durationMin: 60, startMin: 300 })
    await useTodayStore.getState().addBlock({ title: 'B', kind: 'shallow', durationMin: 30, startMin: 360 })
    await useTodayStore.getState().addBlock({ title: 'C', kind: 'break', durationMin: 60, startMin: 390 })

    const blockA = useTodayStore.getState().blocks.find((b) => b.title === 'A')
    expect(blockA).toBeDefined()
    if (blockA) {
      // A's start moves +10 and duration moves +30 -> end moves from 360 to 400, a +40 delta.
      await useTodayStore.getState().editBlock(blockA.id, { startMin: 310, durationMin: 90 })
    }

    const state = useTodayStore.getState()
    const updatedA = state.blocks.find((b) => b.title === 'A')
    const updatedB = state.blocks.find((b) => b.title === 'B')
    const updatedC = state.blocks.find((b) => b.title === 'C')
    expect(updatedA?.startMin).toBe(310)
    expect(updatedA?.durationMin).toBe(90)
    expect(updatedB?.startMin).toBe(400) // 360 + 40 combined end-delta
    expect(updatedC?.startMin).toBe(430) // 390 + 40
  })

  it('ripple edit persists downstream shifts to the database, not just in-memory state (defect 3, persistence)', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().addBlock({ title: 'A', kind: 'deep', durationMin: 60, startMin: 300 })
    await useTodayStore.getState().addBlock({ title: 'B', kind: 'shallow', durationMin: 30, startMin: 360 })
    await useTodayStore.getState().addBlock({ title: 'C', kind: 'break', durationMin: 60, startMin: 390 })

    const blockA = useTodayStore.getState().blocks.find((b) => b.title === 'A')
    expect(blockA).toBeDefined()
    if (blockA) {
      await useTodayStore.getState().editBlock(blockA.id, { startMin: 310, durationMin: 90 })
    }

    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    const persistedA = fromDb.find((b) => b.title === 'A')
    const persistedB = fromDb.find((b) => b.title === 'B')
    const persistedC = fromDb.find((b) => b.title === 'C')
    expect(persistedA?.startMin).toBe(310)
    expect(persistedA?.durationMin).toBe(90)
    expect(persistedB?.startMin).toBe(400)
    expect(persistedC?.startMin).toBe(430)

    // Simulate an app restart to be doubly sure disk agrees with what was on screen.
    useTodayStore.setState({ day: null, blocks: [], loading: false, error: null })
    await useTodayStore.getState().hydrate(driver, day)
    const reloaded = useTodayStore.getState().blocks
    expect(reloaded.find((b) => b.title === 'B')?.startMin).toBe(400)
    expect(reloaded.find((b) => b.title === 'C')?.startMin).toBe(430)
  })

  it('editBlock with ripple: false leaves downstream blocks untouched even when start and duration both change', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().addBlock({ title: 'A', kind: 'deep', durationMin: 60, startMin: 300 })
    await useTodayStore.getState().addBlock({ title: 'B', kind: 'shallow', durationMin: 30, startMin: 360 })
    await useTodayStore.getState().addBlock({ title: 'C', kind: 'break', durationMin: 60, startMin: 390 })

    const blockA = useTodayStore.getState().blocks.find((b) => b.title === 'A')
    expect(blockA).toBeDefined()
    if (blockA) {
      await useTodayStore.getState().editBlock(blockA.id, { startMin: 310, durationMin: 90 }, false)
    }

    const state = useTodayStore.getState()
    const updatedB = state.blocks.find((b) => b.title === 'B')
    const updatedC = state.blocks.find((b) => b.title === 'C')
    expect(updatedB?.startMin).toBe(360)
    expect(updatedC?.startMin).toBe(390)

    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb.find((b) => b.title === 'B')?.startMin).toBe(360)
    expect(fromDb.find((b) => b.title === 'C')?.startMin).toBe(390)
  })

  it('toggles block completion', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add a block
    await useTodayStore.getState().addBlock({
      title: 'Task',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })

    let state = useTodayStore.getState()
    const blockId = state.blocks[0].id
    expect(state.blocks[0].completed).toBe(false)

    // Toggle completion
    await useTodayStore.getState().toggleCompleted(blockId)

    state = useTodayStore.getState()
    expect(state.blocks[0].completed).toBe(true)

    // Persisted row must round-trip the same boolean (the repo maps SQLite's
    // 0/1 to a real boolean at the boundary — assert the mapped value, not
    // the raw column).
    let fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb[0].completed).toBe(true)

    // Toggle again
    await useTodayStore.getState().toggleCompleted(blockId)

    state = useTodayStore.getState()
    expect(state.blocks[0].completed).toBe(false)

    // A toggle back to false must persist as false, not be silently
    // skipped as a no-op.
    fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb[0].completed).toBe(false)
  })

  it('removes a block', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add two blocks
    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useTodayStore.getState().addBlock({
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })

    const state = useTodayStore.getState()
    const blockId = state.blocks[0].id
    expect(state.blocks).toHaveLength(2)

    // Remove first block
    await useTodayStore.getState().removeBlock(blockId)

    const updated = useTodayStore.getState()
    expect(updated.blocks).toHaveLength(1)
    expect(updated.blocks[0].title).toBe('B')

    // The row must actually be gone from the database, and the surviving
    // row must be untouched (not just "still present" — same values).
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb).toHaveLength(1)
    expect(fromDb.some((b) => b.id === blockId)).toBe(false)
    expect(fromDb[0].title).toBe('B')
    expect(fromDb[0].startMin).toBe(360)
    expect(fromDb[0].durationMin).toBe(30)
    expect(fromDb[0].kind).toBe('shallow')
  })

  it('nudges a block with ripple', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add three blocks
    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useTodayStore.getState().addBlock({
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })
    await useTodayStore.getState().addBlock({
      title: 'C',
      kind: 'break',
      durationMin: 60,
      startMin: 390,
    })

    const state = useTodayStore.getState()
    const blockB = state.blocks.find((b) => b.title === 'B')
    expect(blockB).toBeDefined()

    // Nudge B forward by 10 minutes (ripple on by default)
    if (blockB) {
      await useTodayStore.getState().nudgeBlock(blockB.id, 10)
    }

    const updated = useTodayStore.getState()
    const updatedB = updated.blocks.find((b) => b.title === 'B')
    const blockC = updated.blocks.find((b) => b.title === 'C')
    expect(updatedB?.startMin).toBe(370) // 360 + 10
    expect(blockC?.startMin).toBe(400) // 390 + 10 (rippled)

    // Verify persisted to database
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    const persistedB = fromDb.find((b: typeof fromDb[number]) => b.title === 'B')
    const persistedC = fromDb.find((b: typeof fromDb[number]) => b.title === 'C')
    expect(persistedB?.startMin).toBe(370)
    expect(persistedC?.startMin).toBe(400)
  })

  it('nudges a block without ripple', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add three blocks
    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useTodayStore.getState().addBlock({
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })
    await useTodayStore.getState().addBlock({
      title: 'C',
      kind: 'break',
      durationMin: 60,
      startMin: 390,
    })

    const state = useTodayStore.getState()
    const blockB = state.blocks.find((b) => b.title === 'B')
    expect(blockB).toBeDefined()

    // Nudge B forward by 10 minutes (ripple off)
    if (blockB) {
      await useTodayStore.getState().nudgeBlock(blockB.id, 10, false)
    }

    const updated = useTodayStore.getState()
    const updatedB = updated.blocks.find((b) => b.title === 'B')
    const blockC = updated.blocks.find((b) => b.title === 'C')
    expect(updatedB?.startMin).toBe(370) // 360 + 10
    expect(blockC?.startMin).toBe(390) // Unchanged (no ripple)

    // Exactly one row changed in the database — A and C are byte-identical
    // to what they were added with.
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    const persistedA = fromDb.find((b) => b.title === 'A')
    const persistedB = fromDb.find((b) => b.title === 'B')
    const persistedC = fromDb.find((b) => b.title === 'C')
    expect(persistedA?.startMin).toBe(300)
    expect(persistedB?.startMin).toBe(370)
    expect(persistedC?.startMin).toBe(390)
  })

  it('moves a block up', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add two blocks
    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useTodayStore.getState().addBlock({
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })

    let state = useTodayStore.getState()
    const blockBId = state.blocks[1].id

    // Move B up (direction -1, swap with A)
    await useTodayStore.getState().move(blockBId, -1)

    state = useTodayStore.getState()
    // After move, B and A swap positions in the array
    expect(state.blocks[0].title).toBe('B')
    expect(state.blocks[1].title).toBe('A')
    // Verify that they maintain their contiguous relationship
    expect(state.blocks[1].startMin).toBe(state.blocks[0].startMin + state.blocks[0].durationMin)

    // `move()` writes both `sort` and `start_min` (via reorderBlocks and
    // updateBlock respectively) — assert both persisted, not just the
    // in-memory order. This is the case most likely to hide a bug: a
    // mismatch here would mean the timeline shows one order on screen and a
    // different order after the next reload.
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb.map((b) => b.title)).toEqual(['B', 'A'])
    expect(fromDb.map((b) => b.sort)).toEqual([0, 1])
    expect(fromDb[0].startMin).toBe(300) // B: day's original start, unchanged
    expect(fromDb[1].startMin).toBe(330) // A: 300 + B's 30-min duration, contiguous
  })

  it('applies a template', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add a block first
    await useTodayStore.getState().addBlock({
      title: 'Existing',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })

    let state = useTodayStore.getState()
    expect(state.blocks).toHaveLength(1)

    // Get the "Maker Day" template (should be seed id 1)
    const templates = await templatesRepo.listTemplates(driver)
    const makerDay = templates[0] // First template
    if (makerDay) {
      await useTodayStore.getState().applyTemplate(makerDay.id)
    }

    state = useTodayStore.getState()
    // After applying template, existing blocks should be deleted and template blocks added
    expect(state.blocks.length).toBeGreaterThan(1)

    // Verify the database actually reflects the swap: the prior "Existing"
    // block is gone, and the persisted rows are the Maker Day template's
    // real seed blocks (0002_seed.sql), not just "some rows".
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb.some((b) => b.title === 'Existing')).toBe(false)
    expect(fromDb).toHaveLength(5)
    expect(fromDb.map((b) => b.title)).toEqual([
      'Morning pages',
      'Deep block — main project',
      'Walk & reset',
      'Deep block — secondary',
      'Shut Down Ritual',
    ])
    expect(fromDb.map((b) => b.kind)).toEqual(['ritual', 'deep', 'break', 'deep', 'ritual'])
    expect(fromDb.map((b) => b.startMin)).toEqual([300, 330, 420, 450, 780])
    expect(fromDb.map((b) => b.durationMin)).toEqual([30, 90, 30, 60, 5])

    // And in-memory state must match the database exactly, not just "more
    // than one block".
    expect(state.blocks.map((b) => b.title)).toEqual(fromDb.map((b) => b.title))
  })

  // --- P2-A (PR review): applyTemplate reports success/failure via its
  // return value rather than throwing, so a caller (TemplateDetailPane) can
  // gate navigation on it. -----------------------------------------------

  it('applyTemplate returns true on success and false on failure, and never throws (P2-A)', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)
    const templates = await templatesRepo.listTemplates(driver)
    const makerDay = templates[0]

    const ok = await useTodayStore.getState().applyTemplate(makerDay.id)
    expect(ok).toBe(true)

    // Failure path: no persistence driver at all (matches the existing
    // "No database connection" branch this store already had).
    await useTodayStore.getState().hydrate(null, day)
    const failed = await useTodayStore.getState().applyTemplate(makerDay.id)
    expect(failed).toBe(false)
    expect(useTodayStore.getState().error).toBe('No database connection')
  })

  it('clamps nudge startMin to 0', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add a block at a low startMin
    await useTodayStore.getState().addBlock({
      title: 'Early',
      kind: 'deep',
      durationMin: 60,
      startMin: 50,
    })

    const state = useTodayStore.getState()
    const blockId = state.blocks[0].id

    // Try to nudge it to before midnight (negative startMin)
    await useTodayStore.getState().nudgeBlock(blockId, -100)

    const updated = useTodayStore.getState()
    expect(updated.blocks[0].startMin).toBe(0)
  })

  it('keeps the store in canonical (startMin) order regardless of insertion order, so move() acts on the right block', async () => {
    // Regression test for the Phase 4 defect: TimelineBlock computed its
    // index via `blocks.findIndex` on the store's array, while `layout()`
    // displays blocks sorted by startMin. If the store's array order ever
    // diverges from startMin order, the up/down controls act on the wrong
    // block. Insert blocks out of chronological order (C, then A, then B)
    // — under the old array-order-is-insertion-order behavior this would
    // leave the store as [C, A, B], not [A, B, C].
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().addBlock({
      title: 'C',
      kind: 'deep',
      durationMin: 60,
      startMin: 420, // chronologically last
    })
    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300, // chronologically first
    })
    await useTodayStore.getState().addBlock({
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360, // chronologically second
    })

    // The store's array order must already be chronological, matching what
    // the timeline displays — not insertion order [C, A, B].
    const afterAdd = useTodayStore.getState().blocks
    expect(afterAdd.map((b) => b.title)).toEqual(['A', 'B', 'C'])

    const blockA = afterAdd.find((b) => b.title === 'A')
    expect(blockA).toBeDefined()

    // "Move A down" should swap it with the chronologically-next block (B),
    // exactly what a user looking at the on-screen order would expect.
    if (blockA) {
      await useTodayStore.getState().move(blockA.id, 1)
    }

    const afterMove = useTodayStore.getState()
    expect(afterMove.blocks.map((b) => b.title)).toEqual(['B', 'A', 'C'])

    // The bug this test guards against was precisely a mismatch between
    // in-memory order and persisted order — assert the database agrees too.
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb.map((b) => b.title)).toEqual(['B', 'A', 'C'])
  })

  it('assigns negative, non-colliding ids in null-driver (vite dev) mode', async () => {
    // Regression test for the Phase 4 id-collision defect: optimistic local
    // ids used to be a positive counter starting at 1000, which SQLite's
    // AUTOINCREMENT id sequence will eventually reach, letting the
    // `b.id === localId` swap in addBlock() land on the wrong row. Negative
    // ids can never collide with a real (always-positive) SQLite id.
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(null, day)

    await useTodayStore.getState().addBlock({ title: 'A', kind: 'deep', durationMin: 30, startMin: 300 })
    await useTodayStore.getState().addBlock({ title: 'B', kind: 'deep', durationMin: 30, startMin: 330 })
    await useTodayStore.getState().addBlock({ title: 'C', kind: 'deep', durationMin: 30, startMin: 360 })

    const ids = useTodayStore.getState().blocks.map((b) => b.id)
    for (const id of ids) {
      expect(id).toBeLessThan(0)
    }
    // All distinct
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is a safe no-op under a null driver (plain vite dev, no Tauri)', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(null, day)
    expect(useTodayStore.getState().error).toBeNull()
    expect(useTodayStore.getState().blocks).toEqual([])

    await useTodayStore.getState().addBlock({ title: 'Local only', kind: 'deep', durationMin: 30, startMin: 300 })
    const state = useTodayStore.getState()
    expect(state.blocks).toHaveLength(1)
    expect(state.error).toBeNull()

    const blockId = state.blocks[0].id
    await useTodayStore.getState().toggleCompleted(blockId)
    await useTodayStore.getState().nudgeBlock(blockId, 5)
    await useTodayStore.getState().move(blockId, -1)
    await useTodayStore.getState().removeBlock(blockId)

    expect(useTodayStore.getState().error).toBeNull()
  })

  it('reloads to exactly what was on screen after add + nudge + move (hydrate round trip)', async () => {
    // The most direct way to catch memory/database divergence: do a
    // sequence of mutations, snapshot the in-memory state, throw the store
    // away (simulating an app restart / view remount), hydrate fresh from
    // the same database, and assert the reload matches the snapshot
    // exactly — same order, same values, not just "same length".
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useTodayStore.getState().addBlock({
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })

    const blockA = useTodayStore.getState().blocks.find((b) => b.title === 'A')
    expect(blockA).toBeDefined()
    if (blockA) {
      // Ripple nudge: A moves to 310, B (downstream) follows to 370.
      await useTodayStore.getState().nudgeBlock(blockA.id, 10)
    }

    const blockB = useTodayStore.getState().blocks.find((b) => b.title === 'B')
    expect(blockB).toBeDefined()
    if (blockB) {
      // Move B up, swapping with A.
      await useTodayStore.getState().move(blockB.id, -1)
    }

    const snapshot = useTodayStore.getState().blocks.map((b) => ({
      id: b.id,
      title: b.title,
      kind: b.kind,
      startMin: b.startMin,
      durationMin: b.durationMin,
      completed: b.completed,
      sort: b.sort,
    }))
    // Sanity: the mutations above actually did something, so this test can't
    // pass by the reload trivially matching an untouched snapshot.
    expect(snapshot.map((b) => b.title)).toEqual(['B', 'A'])
    expect(snapshot[0].startMin).toBe(310)
    expect(snapshot[1].startMin).toBe(340)

    // Simulate an app restart / view remount: reset the store and hydrate
    // fresh from the same database and day.
    useTodayStore.setState({ day: null, blocks: [], loading: false, error: null })
    await useTodayStore.getState().hydrate(driver, day)

    const reloaded = useTodayStore.getState().blocks.map((b) => ({
      id: b.id,
      title: b.title,
      kind: b.kind,
      startMin: b.startMin,
      durationMin: b.durationMin,
      completed: b.completed,
      sort: b.sort,
    }))
    expect(reloaded).toEqual(snapshot)
  })

  it('is no-op when moving at boundaries', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    // Add two blocks
    await useTodayStore.getState().addBlock({
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useTodayStore.getState().addBlock({
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })

    let state = useTodayStore.getState()
    const blockAId = state.blocks[0].id
    const blockBId = state.blocks[1].id

    // Try to move A up (at boundary)
    await useTodayStore.getState().move(blockAId, -1)
    let afterMove = useTodayStore.getState()
    expect(afterMove.blocks[0].title).toBe('A') // Unchanged

    // Try to move B down (at boundary)
    await useTodayStore.getState().move(blockBId, 1)
    afterMove = useTodayStore.getState()
    expect(afterMove.blocks[1].title).toBe('B') // Unchanged
  })

  it('setShutdown with scope "default" updates state and persists to the settings table', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().setShutdown(1320, 'default')

    const state = useTodayStore.getState()
    expect(state.shutdownMin).toBe(1320)
    expect(state.shutdownIsDefault).toBe(true)

    const persisted = await settingsRepo.getSetting(driver, 'shutdownMin')
    expect(persisted).toBe('1320')
  })

  it('setShutdown with scope "day" updates state, persists to day_note, and does not touch the global setting', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    await useTodayStore.getState().setShutdown(1260, 'day')

    const state = useTodayStore.getState()
    expect(state.shutdownMin).toBe(1260)
    expect(state.shutdownIsDefault).toBe(false)

    const persisted = await notesRepo.getDayShutdown(driver, day)
    expect(persisted).toBe(1260)

    const globalSetting = await settingsRepo.getSetting(driver, 'shutdownMin')
    expect(globalSetting).toBeNull()
  })

  it('hydrate resolves the global default shutdown when there is no per-day override', async () => {
    const day = '2026-08-04'
    await settingsRepo.setSetting(driver, 'shutdownMin', '1350')

    await useTodayStore.getState().hydrate(driver, day)

    const state = useTodayStore.getState()
    expect(state.shutdownMin).toBe(1350)
    expect(state.shutdownIsDefault).toBe(true)
  })

  it('hydrate resolves the per-day override in preference to the global default', async () => {
    const day = '2026-08-04'
    await settingsRepo.setSetting(driver, 'shutdownMin', '1350')
    await notesRepo.setDayShutdown(driver, day, 1200)

    await useTodayStore.getState().hydrate(driver, day)

    const state = useTodayStore.getState()
    expect(state.shutdownMin).toBe(1200)
    expect(state.shutdownIsDefault).toBe(false)
  })

  it('hydrate with neither a per-day override nor a global default leaves shutdownMin null', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    const state = useTodayStore.getState()
    expect(state.shutdownMin).toBeNull()
    expect(state.shutdownIsDefault).toBe(true)
  })

  it('addBlock accepts and persists note, repeat, trackId, and quiet', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/focus.mp3', 'Focus', 'ambient']
    )

    await useTodayStore.getState().addBlock({
      title: 'Composed',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
      note: 'Ship it',
      repeat: 'daily',
      trackId: trackId.lastInsertId,
      quiet: true,
    })

    const state = useTodayStore.getState()
    expect(state.blocks[0].note).toBe('Ship it')
    expect(state.blocks[0].repeat).toBe('daily')
    expect(state.blocks[0].trackId).toBe(trackId.lastInsertId)
    expect(state.blocks[0].quiet).toBe(true)

    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb[0].note).toBe('Ship it')
    expect(fromDb[0].repeat).toBe('daily')
    expect(fromDb[0].trackId).toBe(trackId.lastInsertId)
    expect(fromDb[0].quiet).toBe(true)
  })

  it('addBlock returns the real id when persisted, and a negative optimistic id under a null driver', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    const id = await useTodayStore.getState().addBlock({
      title: 'Persisted',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    expect(id).not.toBeNull()
    expect(id!).toBeGreaterThan(0)

    useTodayStore.setState({ day: null, blocks: [], loading: false, error: null })
    await useTodayStore.getState().hydrate(null, day)
    const localId = await useTodayStore.getState().addBlock({
      title: 'Local only',
      kind: 'deep',
      durationMin: 30,
      startMin: 300,
    })
    expect(localId).not.toBeNull()
    expect(localId!).toBeLessThan(0)
  })

  it('editBlock persists taskId, note, repeat, trackId, and quiet — not just the in-memory state', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(driver, day)

    const taskId = await tasksRepo.createTask(driver, {
      title: 'Linked task',
      createdAt: new Date().toISOString(),
    })
    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/deep.mp3', 'Deep', 'ambient']
    )

    await useTodayStore.getState().addBlock({
      title: 'Editable',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    const blockId = useTodayStore.getState().blocks[0].id

    await useTodayStore.getState().editBlock(
      blockId,
      {
        taskId,
        note: 'Edited note',
        repeat: 'weekdays',
        trackId: trackId.lastInsertId,
        quiet: true,
      },
      false
    )

    const state = useTodayStore.getState()
    expect(state.blocks[0].taskId).toBe(taskId)
    expect(state.blocks[0].note).toBe('Edited note')
    expect(state.blocks[0].repeat).toBe('weekdays')
    expect(state.blocks[0].trackId).toBe(trackId.lastInsertId)
    expect(state.blocks[0].quiet).toBe(true)

    // Assert against the repo, not just in-memory state — this is the bug
    // class the brief called out: fields silently dropped from the persist
    // whitelist survive in memory but vanish on reload.
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb[0].taskId).toBe(taskId)
    expect(fromDb[0].note).toBe('Edited note')
    expect(fromDb[0].repeat).toBe('weekdays')
    expect(fromDb[0].trackId).toBe(trackId.lastInsertId)
    expect(fromDb[0].quiet).toBe(true)
  })

  it('hydrate with a null driver leaves shutdownMin null (vite-dev case)', async () => {
    const day = '2026-08-04'
    await useTodayStore.getState().hydrate(null, day)

    const state = useTodayStore.getState()
    expect(state.shutdownMin).toBeNull()
    expect(state.shutdownIsDefault).toBe(true)
  })
})
