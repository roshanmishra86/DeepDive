import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as blocksRepo from '../db/repos/blocks'
import * as tasksRepo from '../db/repos/tasks'
import * as templatesRepo from '../db/repos/templates'
import { useBlocksStore } from './blocks'

/** This day's slice, in the store's canonical order. */
function blocksOf(day: string) {
  return useBlocksStore.getState().blocksByDay[day] ?? []
}

/**
 * Stand-in for the old single-day store's `getState()` in the ported tests:
 * everything they read off `state` is that one day's blocks.
 */
function snapshot(day: string) {
  return { blocks: blocksOf(day) }
}

describe('blocks store', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
    // The store is a module-level singleton; without an explicit reset here,
    // state (and the local-id counter's effects) leaks between tests and
    // makes them order-dependent — e.g. a later test asserting `blocks`
    // starts empty would silently pass or fail depending on what an earlier
    // test in this file left behind.
    useBlocksStore.setState({
      blocksByDay: {},
      loadedDays: [],
      loading: false,
      error: null,
    })
  })

  it('hydrates blocks from the database for a given day', async () => {
    // Create some blocks in the database
    const day = '2026-08-04'
    const blocks = blocksOf(day)
    expect(blocks).toHaveLength(0)

    // Hydrate
    await useBlocksStore.getState().hydrate(driver, [day])

    // No pre-existing blocks in a fresh database, but state should be set
    expect(useBlocksStore.getState().loadedDays).toEqual([day])
    expect(blocksOf(day)).toEqual([])
  })

  it('adds a block and persists it', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add a block
    await useBlocksStore.getState().addBlock(day, {
      title: 'Deep work',
      kind: 'deep',
      durationMin: 90,
      startMin: 300,
      pomodoros: 3,
    })

    // Check in-memory state
    let state = snapshot(day)
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].title).toBe('Deep work')

    // Verify it persisted to the database
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb).toHaveLength(1)
    expect(fromDb[0].title).toBe('Deep work')
  })

  it('adds a block with taskId and persists it', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    // Create a task first so FK constraint is satisfied
    const taskId = await tasksRepo.createTask(driver, {
      title: 'Dummy task',
      createdAt: new Date().toISOString(),
    })

    // Add a block with a taskId
    await useBlocksStore.getState().addBlock(day, {
      title: 'Task-backed block',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
      taskId,
    })

    // Check in-memory state
    let state = snapshot(day)
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].taskId).toBe(taskId)

    // Verify it persisted to the database
    const fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb).toHaveLength(1)
    expect(fromDb[0].taskId).toBe(taskId)
  })

  it('adds block with default startMin after the last block, when fromMin is at or past its end', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add first block with explicit startMin
    await useBlocksStore.getState().addBlock(day, {
      title: 'First',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })

    // Add second block without startMin, with fromMin at the first block's end
    await useBlocksStore.getState().addBlock(day, {
      title: 'Second',
      kind: 'shallow',
      durationMin: 30,
      fromMin: 360,
    })

    const state = snapshot(day)
    expect(state.blocks).toHaveLength(2)
    // Second block should start at 300 + 60 = 360
    expect(state.blocks[1].startMin).toBe(360)
  })

  it('addBlock with no startMin and no blocks lands exactly at fromMin (no rounding)', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    await useBlocksStore.getState().addBlock(day, {
      title: 'First',
      kind: 'deep',
      durationMin: 60,
      fromMin: 617,
    })

    const state = snapshot(day)
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].startMin).toBe(617)
  })

  it('addBlock with no startMin over an in-progress block lands at that block\'s end time, not at fromMin', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    // Existing block occupies 300..360
    await useBlocksStore.getState().addBlock(day, {
      title: 'Existing',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })

    // fromMin (e.g. "now") falls inside the existing block's window
    await useBlocksStore.getState().addBlock(day, {
      title: 'New',
      kind: 'shallow',
      durationMin: 30,
      fromMin: 320,
    })

    const state = snapshot(day)
    const newBlock = state.blocks.find((b) => b.title === 'New')
    expect(newBlock?.startMin).toBe(360) // Existing block's end, not fromMin (320)
  })

  it('addBlock with no startMin and no fromMin still works (defaults to 0)', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    await useBlocksStore.getState().addBlock(day, {
      title: 'First',
      kind: 'deep',
      durationMin: 60,
    })

    const state = snapshot(day)
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].startMin).toBe(0)
  })

  it('edits a block without ripple', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add three blocks in sequence
    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'C',
      kind: 'break',
      durationMin: 60,
      startMin: 390,
    })

    // Edit block B's duration without ripple
    const blockB = blocksOf(day).find((b) => b.title === 'B')
    expect(blockB).toBeDefined()
    if (blockB) {
      await useBlocksStore.getState().editBlock(day, blockB.id, { durationMin: 60 }, false)
    }

    // B should be updated, but C should stay at 390 (no ripple)
    const state = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    const taskId = await tasksRepo.createTask(driver, {
      title: 'Linked task',
      createdAt: new Date().toISOString(),
    })
    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/x.mp3', 'X', 'ambient']
    )

    await useBlocksStore.getState().addBlock(day, {
      title: 'Original',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    const blockId = blocksOf(day)[0].id

    await useBlocksStore.getState().editBlock(day, blockId, {
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

    const block = blocksOf(day).find((b) => b.id === blockId)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    const blockId = blocksOf(day)[0].id

    await useBlocksStore.getState().editBlock(day, blockId, { startMin: 300, durationMin: 90 })

    const block = blocksOf(day).find((b) => b.id === blockId)
    expect(block?.durationMin).toBe(90)
  })

  it('ripple edit with start and duration changed together shifts downstream by the combined end-delta (defect 3)', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    // A: 300..360, B: 360..390, C: 390..450
    await useBlocksStore.getState().addBlock(day, { title: 'A', kind: 'deep', durationMin: 60, startMin: 300 })
    await useBlocksStore.getState().addBlock(day, { title: 'B', kind: 'shallow', durationMin: 30, startMin: 360 })
    await useBlocksStore.getState().addBlock(day, { title: 'C', kind: 'break', durationMin: 60, startMin: 390 })

    const blockA = blocksOf(day).find((b) => b.title === 'A')
    expect(blockA).toBeDefined()
    if (blockA) {
      // A's start moves +10 and duration moves +30 -> end moves from 360 to 400, a +40 delta.
      await useBlocksStore.getState().editBlock(day, blockA.id, { startMin: 310, durationMin: 90 })
    }

    const state = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    await useBlocksStore.getState().addBlock(day, { title: 'A', kind: 'deep', durationMin: 60, startMin: 300 })
    await useBlocksStore.getState().addBlock(day, { title: 'B', kind: 'shallow', durationMin: 30, startMin: 360 })
    await useBlocksStore.getState().addBlock(day, { title: 'C', kind: 'break', durationMin: 60, startMin: 390 })

    const blockA = blocksOf(day).find((b) => b.title === 'A')
    expect(blockA).toBeDefined()
    if (blockA) {
      await useBlocksStore.getState().editBlock(day, blockA.id, { startMin: 310, durationMin: 90 })
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
    useBlocksStore.setState({ blocksByDay: {}, loadedDays: [], loading: false, error: null })
    await useBlocksStore.getState().hydrate(driver, [day])
    const reloaded = blocksOf(day)
    expect(reloaded.find((b) => b.title === 'B')?.startMin).toBe(400)
    expect(reloaded.find((b) => b.title === 'C')?.startMin).toBe(430)
  })

  it('editBlock with ripple: false leaves downstream blocks untouched even when start and duration both change', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    await useBlocksStore.getState().addBlock(day, { title: 'A', kind: 'deep', durationMin: 60, startMin: 300 })
    await useBlocksStore.getState().addBlock(day, { title: 'B', kind: 'shallow', durationMin: 30, startMin: 360 })
    await useBlocksStore.getState().addBlock(day, { title: 'C', kind: 'break', durationMin: 60, startMin: 390 })

    const blockA = blocksOf(day).find((b) => b.title === 'A')
    expect(blockA).toBeDefined()
    if (blockA) {
      await useBlocksStore.getState().editBlock(day, blockA.id, { startMin: 310, durationMin: 90 }, false)
    }

    const state = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add a block
    await useBlocksStore.getState().addBlock(day, {
      title: 'Task',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })

    let state = snapshot(day)
    const blockId = state.blocks[0].id
    expect(state.blocks[0].completed).toBe(false)

    // Toggle completion
    await useBlocksStore.getState().toggleCompleted(day, blockId)

    state = snapshot(day)
    expect(state.blocks[0].completed).toBe(true)

    // Persisted row must round-trip the same boolean (the repo maps SQLite's
    // 0/1 to a real boolean at the boundary — assert the mapped value, not
    // the raw column).
    let fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb[0].completed).toBe(true)

    // Toggle again
    await useBlocksStore.getState().toggleCompleted(day, blockId)

    state = snapshot(day)
    expect(state.blocks[0].completed).toBe(false)

    // A toggle back to false must persist as false, not be silently
    // skipped as a no-op.
    fromDb = await blocksRepo.listBlocksForDay(driver, day)
    expect(fromDb[0].completed).toBe(false)
  })

  it('removes a block', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add two blocks
    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })

    const state = snapshot(day)
    const blockId = state.blocks[0].id
    expect(state.blocks).toHaveLength(2)

    // Remove first block
    await useBlocksStore.getState().removeBlock(day, blockId)

    const updated = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add three blocks
    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'C',
      kind: 'break',
      durationMin: 60,
      startMin: 390,
    })

    const state = snapshot(day)
    const blockB = state.blocks.find((b) => b.title === 'B')
    expect(blockB).toBeDefined()

    // Nudge B forward by 10 minutes (ripple on by default)
    if (blockB) {
      await useBlocksStore.getState().nudgeBlock(day, blockB.id, 10)
    }

    const updated = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add three blocks
    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'C',
      kind: 'break',
      durationMin: 60,
      startMin: 390,
    })

    const state = snapshot(day)
    const blockB = state.blocks.find((b) => b.title === 'B')
    expect(blockB).toBeDefined()

    // Nudge B forward by 10 minutes (ripple off)
    if (blockB) {
      await useBlocksStore.getState().nudgeBlock(day, blockB.id, 10, false)
    }

    const updated = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add two blocks
    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })

    let state = snapshot(day)
    const blockBId = state.blocks[1].id

    // Move B up (direction -1, swap with A)
    await useBlocksStore.getState().move(day, blockBId, -1)

    state = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add a block first
    await useBlocksStore.getState().addBlock(day, {
      title: 'Existing',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })

    let state = snapshot(day)
    expect(state.blocks).toHaveLength(1)

    // Get the "Maker Day" template (should be seed id 1)
    const templates = await templatesRepo.listTemplates(driver)
    const makerDay = templates[0] // First template
    if (makerDay) {
      await useBlocksStore.getState().applyTemplate(day, makerDay.id)
    }

    state = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])
    const templates = await templatesRepo.listTemplates(driver)
    const makerDay = templates[0]

    const ok = await useBlocksStore.getState().applyTemplate(day, makerDay.id)
    expect(ok).toBe(true)

    // Failure path: no persistence driver at all (matches the existing
    // "No database connection" branch this store already had).
    await useBlocksStore.getState().hydrate(null, [day])
    const failed = await useBlocksStore.getState().applyTemplate(day, makerDay.id)
    expect(failed).toBe(false)
    expect(useBlocksStore.getState().error).toBe('No database connection')
  })

  it('clamps nudge startMin to 0', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add a block at a low startMin
    await useBlocksStore.getState().addBlock(day, {
      title: 'Early',
      kind: 'deep',
      durationMin: 60,
      startMin: 50,
    })

    const state = snapshot(day)
    const blockId = state.blocks[0].id

    // Try to nudge it to before midnight (negative startMin)
    await useBlocksStore.getState().nudgeBlock(day, blockId, -100)

    const updated = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    await useBlocksStore.getState().addBlock(day, {
      title: 'C',
      kind: 'deep',
      durationMin: 60,
      startMin: 420, // chronologically last
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300, // chronologically first
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360, // chronologically second
    })

    // The store's array order must already be chronological, matching what
    // the timeline displays — not insertion order [C, A, B].
    const afterAdd = blocksOf(day)
    expect(afterAdd.map((b) => b.title)).toEqual(['A', 'B', 'C'])

    const blockA = afterAdd.find((b) => b.title === 'A')
    expect(blockA).toBeDefined()

    // "Move A down" should swap it with the chronologically-next block (B),
    // exactly what a user looking at the on-screen order would expect.
    if (blockA) {
      await useBlocksStore.getState().move(day, blockA.id, 1)
    }

    const afterMove = snapshot(day)
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
    await useBlocksStore.getState().hydrate(null, [day])

    await useBlocksStore.getState().addBlock(day, { title: 'A', kind: 'deep', durationMin: 30, startMin: 300 })
    await useBlocksStore.getState().addBlock(day, { title: 'B', kind: 'deep', durationMin: 30, startMin: 330 })
    await useBlocksStore.getState().addBlock(day, { title: 'C', kind: 'deep', durationMin: 30, startMin: 360 })

    const ids = blocksOf(day).map((b) => b.id)
    for (const id of ids) {
      expect(id).toBeLessThan(0)
    }
    // All distinct
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is a safe no-op under a null driver (plain vite dev, no Tauri)', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(null, [day])
    expect(useBlocksStore.getState().error).toBeNull()
    expect(blocksOf(day)).toEqual([])

    await useBlocksStore.getState().addBlock(day, { title: 'Local only', kind: 'deep', durationMin: 30, startMin: 300 })
    const state = snapshot(day)
    expect(state.blocks).toHaveLength(1)
    expect(useBlocksStore.getState().error).toBeNull()

    const blockId = state.blocks[0].id
    await useBlocksStore.getState().toggleCompleted(day, blockId)
    await useBlocksStore.getState().nudgeBlock(day, blockId, 5)
    await useBlocksStore.getState().move(day, blockId, -1)
    await useBlocksStore.getState().removeBlock(day, blockId)

    expect(useBlocksStore.getState().error).toBeNull()
  })

  it('reloads to exactly what was on screen after add + nudge + move (hydrate round trip)', async () => {
    // The most direct way to catch memory/database divergence: do a
    // sequence of mutations, snapshot the in-memory state, throw the store
    // away (simulating an app restart / view remount), hydrate fresh from
    // the same database, and assert the reload matches the snapshot
    // exactly — same order, same values, not just "same length".
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })

    const blockA = blocksOf(day).find((b) => b.title === 'A')
    expect(blockA).toBeDefined()
    if (blockA) {
      // Ripple nudge: A moves to 310, B (downstream) follows to 370.
      await useBlocksStore.getState().nudgeBlock(day, blockA.id, 10)
    }

    const blockB = blocksOf(day).find((b) => b.title === 'B')
    expect(blockB).toBeDefined()
    if (blockB) {
      // Move B up, swapping with A.
      await useBlocksStore.getState().move(day, blockB.id, -1)
    }

    const snapshot = blocksOf(day).map((b) => ({
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
    useBlocksStore.setState({ blocksByDay: {}, loadedDays: [], loading: false, error: null })
    await useBlocksStore.getState().hydrate(driver, [day])

    const reloaded = blocksOf(day).map((b) => ({
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
    await useBlocksStore.getState().hydrate(driver, [day])

    // Add two blocks
    await useBlocksStore.getState().addBlock(day, {
      title: 'A',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    await useBlocksStore.getState().addBlock(day, {
      title: 'B',
      kind: 'shallow',
      durationMin: 30,
      startMin: 360,
    })

    let state = snapshot(day)
    const blockAId = state.blocks[0].id
    const blockBId = state.blocks[1].id

    // Try to move A up (at boundary)
    await useBlocksStore.getState().move(day, blockAId, -1)
    let afterMove = snapshot(day)
    expect(afterMove.blocks[0].title).toBe('A') // Unchanged

    // Try to move B down (at boundary)
    await useBlocksStore.getState().move(day, blockBId, 1)
    afterMove = snapshot(day)
    expect(afterMove.blocks[1].title).toBe('B') // Unchanged
  })

  it('addBlock accepts and persists note, repeat, trackId, and quiet', async () => {
    const day = '2026-08-04'
    await useBlocksStore.getState().hydrate(driver, [day])

    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/focus.mp3', 'Focus', 'ambient']
    )

    await useBlocksStore.getState().addBlock(day, {
      title: 'Composed',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
      note: 'Ship it',
      repeat: 'daily',
      trackId: trackId.lastInsertId,
      quiet: true,
    })

    const state = snapshot(day)
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
    await useBlocksStore.getState().hydrate(driver, [day])

    const id = await useBlocksStore.getState().addBlock(day, {
      title: 'Persisted',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    expect(id).not.toBeNull()
    expect(id!).toBeGreaterThan(0)

    useBlocksStore.setState({ blocksByDay: {}, loadedDays: [], loading: false, error: null })
    await useBlocksStore.getState().hydrate(null, [day])
    const localId = await useBlocksStore.getState().addBlock(day, {
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
    await useBlocksStore.getState().hydrate(driver, [day])

    const taskId = await tasksRepo.createTask(driver, {
      title: 'Linked task',
      createdAt: new Date().toISOString(),
    })
    const trackId = await driver.execute(
      'INSERT INTO track (path, display_name, category) VALUES (?, ?, ?)',
      ['/music/deep.mp3', 'Deep', 'ambient']
    )

    await useBlocksStore.getState().addBlock(day, {
      title: 'Editable',
      kind: 'deep',
      durationMin: 60,
      startMin: 300,
    })
    const blockId = blocksOf(day)[0].id

    await useBlocksStore.getState().editBlock(day,
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

    const state = snapshot(day)
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


  // --- Multi-day: cross-day moves, lazy loading, and slice identity --------

  it('moveToDay moves the block across days in memory and in the database, keeping startMin', async () => {
    const fromDay = '2026-08-04'
    const toDay = '2026-08-05'
    await useBlocksStore.getState().hydrate(driver, [fromDay, toDay])

    const movingId = await useBlocksStore.getState().addBlock(fromDay, {
      title: 'Moving', kind: 'deep', durationMin: 60, startMin: 540,
    })
    await useBlocksStore.getState().addBlock(fromDay, {
      title: 'Stays', kind: 'deep', durationMin: 60, startMin: 300,
    })
    await useBlocksStore.getState().addBlock(toDay, {
      title: 'Already there', kind: 'deep', durationMin: 60, startMin: 300,
    })

    const ok = await useBlocksStore.getState().moveToDay({ blockId: movingId!, fromDay, toDay })
    expect(ok).toBe(true)

    expect(blocksOf(fromDay).map((b) => b.title)).toEqual(['Stays'])
    expect(blocksOf(toDay).map((b) => b.title)).toEqual(['Already there', 'Moving'])
    // The move must not reschedule the block — an overlap on toDay is
    // intentional and is badged by conflicts(), not silently avoided.
    expect(blocksOf(toDay).find((b) => b.title === 'Moving')?.startMin).toBe(540)
    expect(blocksOf(toDay).find((b) => b.title === 'Moving')?.day).toBe(toDay)

    const persistedFrom = await blocksRepo.listBlocksForDay(driver, fromDay)
    const persistedTo = await blocksRepo.listBlocksForDay(driver, toDay)
    expect(persistedFrom.map((b) => b.title)).toEqual(['Stays'])
    expect(persistedTo.map((b) => b.title)).toEqual(['Already there', 'Moving'])
    expect(persistedTo.map((b) => b.sort)).toEqual([0, 1])
    expect(persistedTo.find((b) => b.title === 'Moving')?.startMin).toBe(540)
  })

  it('moveToDay leaves startMin untouched even when the destination day is empty', async () => {
    const fromDay = '2026-08-04'
    const toDay = '2026-08-06'
    await useBlocksStore.getState().hydrate(driver, [fromDay, toDay])

    const id = await useBlocksStore.getState().addBlock(fromDay, {
      title: 'Keeps its time', kind: 'deep', durationMin: 45, startMin: 1005,
    })

    expect(await useBlocksStore.getState().moveToDay({ blockId: id!, fromDay, toDay })).toBe(true)
    expect(blocksOf(toDay)[0].startMin).toBe(1005)
    expect((await blocksRepo.listBlocksForDay(driver, toDay))[0].startMin).toBe(1005)
  })

  it('moveToDay reconciles BOTH days from disk when the source-day guard reports 0 rows affected', async () => {
    const fromDay = '2026-08-04'
    const toDay = '2026-08-05'
    await useBlocksStore.getState().hydrate(driver, [fromDay, toDay])

    const movingId = await useBlocksStore.getState().addBlock(fromDay, {
      title: 'Moving', kind: 'deep', durationMin: 60, startMin: 540,
    })
    await useBlocksStore.getState().addBlock(toDay, {
      title: 'Already there', kind: 'deep', durationMin: 60, startMin: 300,
    })

    // Another client already moved the row onto toDay (and resequenced sort
    // there), so this client's in-memory view of both days is stale and the
    // repo's WHERE day = fromDay guard misses. The store must not just revert
    // to its pre-move (now-stale) arrays — it must reflect what's on disk.
    await driver.execute('UPDATE day_block SET day = ?, sort = 1 WHERE id = ?', [toDay, movingId])

    const ok = await useBlocksStore.getState().moveToDay({ blockId: movingId!, fromDay, toDay })
    expect(ok).toBe(false)
    expect(useBlocksStore.getState().error).toBe('Block already moved')

    const persistedFrom = await blocksRepo.listBlocksForDay(driver, fromDay)
    const persistedTo = await blocksRepo.listBlocksForDay(driver, toDay)
    expect(blocksOf(fromDay).map((b) => b.id)).toEqual(persistedFrom.map((b) => b.id))
    expect(blocksOf(toDay).map((b) => b.id)).toEqual(persistedTo.map((b) => b.id))

    // Reconciled from disk: block is on toDay, absent from fromDay — the
    // opposite of what a revert-to-stale-arrays would show.
    expect(blocksOf(fromDay).map((b) => b.title)).toEqual([])
    expect(blocksOf(toDay).map((b) => b.title)).toEqual(['Already there', 'Moving'])
    expect(blocksOf(toDay).find((b) => b.id === movingId)?.day).toBe(toDay)
  })

  it('moveToDay is a no-op returning false when the block is not on fromDay', async () => {
    const fromDay = '2026-08-04'
    const toDay = '2026-08-05'
    await useBlocksStore.getState().hydrate(driver, [fromDay, toDay])

    const before = useBlocksStore.getState().blocksByDay
    expect(await useBlocksStore.getState().moveToDay({ blockId: 999, fromDay, toDay })).toBe(false)
    expect(useBlocksStore.getState().blocksByDay).toBe(before)
  })

  it('ensureDays loads only days not already in loadedDays', async () => {
    const loaded = '2026-08-04'
    const fresh = '2026-08-07'
    await useBlocksStore.getState().hydrate(driver, [loaded])
    await useBlocksStore.getState().addBlock(loaded, {
      title: 'Local only', kind: 'deep', durationMin: 30, startMin: 300,
    })
    // Written behind the store's back: a reload of `loaded` would pick it up,
    // so its absence afterwards proves ensureDays skipped that day.
    await blocksRepo.createBlock(driver, {
      day: loaded, title: 'Written behind the store', kind: 'deep', startMin: 600, durationMin: 30, sort: 9,
    })
    await blocksRepo.createBlock(driver, {
      day: fresh, title: 'On the fresh day', kind: 'deep', startMin: 300, durationMin: 30, sort: 0,
    })

    const loadedSliceBefore = blocksOf(loaded)
    await useBlocksStore.getState().ensureDays([loaded, fresh])

    expect(blocksOf(loaded)).toBe(loadedSliceBefore)
    expect(blocksOf(loaded).map((b) => b.title)).toEqual(['Local only'])
    expect(blocksOf(fresh).map((b) => b.title)).toEqual(['On the fresh day'])
    expect(useBlocksStore.getState().loadedDays).toEqual([loaded, fresh])

    // reloadDays is the unconditional counterpart.
    await useBlocksStore.getState().reloadDays([loaded])
    expect(blocksOf(loaded).map((b) => b.title)).toEqual(['Local only', 'Written behind the store'])
  })

  it('hydrate populates every requested day, including days with no rows', async () => {
    await useBlocksStore.getState().hydrate(driver, ['2026-08-04', '2026-08-05', '2026-08-06'])
    const { blocksByDay, loadedDays } = useBlocksStore.getState()
    expect(loadedDays).toEqual(['2026-08-04', '2026-08-05', '2026-08-06'])
    expect(blocksByDay['2026-08-05']).toEqual([])
  })

  it('a single-day mutation preserves every other day\'s array identity', async () => {
    const day = '2026-08-04'
    const other = '2026-08-05'
    await useBlocksStore.getState().hydrate(driver, [day, other])
    await useBlocksStore.getState().addBlock(other, {
      title: 'Elsewhere', kind: 'deep', durationMin: 60, startMin: 300,
    })

    const otherBefore = blocksOf(other)
    const id = await useBlocksStore.getState().addBlock(day, {
      title: 'Here', kind: 'deep', durationMin: 60, startMin: 300,
    })
    expect(blocksOf(other)).toBe(otherBefore)

    await useBlocksStore.getState().editBlock(day, id!, { title: 'Renamed' })
    expect(blocksOf(other)).toBe(otherBefore)

    await useBlocksStore.getState().nudgeBlock(day, id!, 5)
    expect(blocksOf(other)).toBe(otherBefore)

    await useBlocksStore.getState().removeBlock(day, id!)
    expect(blocksOf(other)).toBe(otherBefore)
  })
})
