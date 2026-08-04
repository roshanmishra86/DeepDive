import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { DayBlock } from '../db/types'
import * as blocksRepo from '../db/repos/blocks'
import { nudge, moveBlock as moveBlockPure, sortBlocks } from '../lib/today'

/**
 * Today's blocks store. Hydrates from the database via `day_block` table.
 * Blocks maintain their absolute startMin values (persisted as-is). Gaps
 * between blocks are first-class and preserved across mutations.
 * Changes persist to the database while updating state immediately for responsive UI.
 * In-memory fallback when driver is null allows `vite dev` to work without Tauri.
 */
interface TodayState {
  day: string | null
  blocks: DayBlock[]
  loading: boolean
  error: string | null
  hydrate: (driver: SqlDriver | null, day: string) => Promise<void>
  addBlock: (input: {
    title: string
    kind: 'deep' | 'shallow' | 'ritual' | 'break'
    durationMin: number
    startMin?: number
    pomodoros?: number
  }) => Promise<void>
  editBlock: (id: number, patch: Partial<Omit<DayBlock, 'id' | 'day' | 'sort'>>, ripple?: boolean) => Promise<void>
  removeBlock: (id: number) => Promise<void>
  move: (id: number, direction: -1 | 1) => Promise<void>
  toggleCompleted: (id: number) => Promise<void>
  applyTemplate: (templateId: number) => Promise<void>
  nudgeBlock: (id: number, deltaMin: number, ripple?: boolean) => Promise<void>
}

// Optimistic local ids for rows not yet persisted. Negative and
// monotonically decreasing, so they can never collide with a real SQLite
// AUTOINCREMENT id (always positive) — unlike a positive counter seeded
// from the current max id, which is only collision-free until the real
// autoincrement counter catches up to it. See the Phase 4 defect list.
let nextLocalId = -1
let persistenceDriver: SqlDriver | null = null
let hydratedDay: string | null = null

export const useTodayStore = create<TodayState>()((set, get) => ({
  day: null,
  blocks: [],
  loading: false,
  error: null,

  hydrate: async (driver, day) => {
    persistenceDriver = driver
    hydratedDay = day
    set({ day, loading: true, error: null })

    if (!driver) {
      // In-memory mode: keep empty state for vite dev
      set({ loading: false })
      return
    }

    try {
      const blocks = await blocksRepo.listBlocksForDay(driver, day)
      set({ blocks: sortBlocks(blocks), loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ error: message, loading: false })
      console.error('Failed to hydrate today store:', err)
    }
  },

  addBlock: async (input) => {
    const state = get()
    if (!state.day) return

    // Optimistically add to in-memory state
    const localId = nextLocalId--
    const blocks = state.blocks
    // Default startMin: after the last block's end, or 5:00 AM if empty
    let startMin = input.startMin
    if (startMin === undefined) {
      if (blocks.length > 0) {
        const lastBlock = blocks[blocks.length - 1]
        startMin = lastBlock.startMin + lastBlock.durationMin
      } else {
        startMin = 300 // 5:00 AM
      }
    }

    const newBlock: DayBlock = {
      id: localId,
      day: state.day,
      taskId: null,
      title: input.title,
      kind: input.kind,
      startMin,
      durationMin: input.durationMin,
      pomodoros: input.pomodoros ?? 0,
      completed: false,
      sort: blocks.length,
    }
    const withNew = sortBlocks([...blocks, newBlock])
    set({ blocks: withNew })

    // Persist to database if available
    if (persistenceDriver && hydratedDay) {
      try {
        const driver = persistenceDriver
        const day = hydratedDay
        const realId = await blocksRepo.createBlock(driver, {
          day,
          title: input.title,
          kind: input.kind,
          startMin,
          durationMin: input.durationMin,
          pomodoros: input.pomodoros ?? 0,
          sort: withNew.length - 1,
        })
        // Update state with real id
        set((_s) => ({
          blocks: get().blocks.map((b) => (b.id === localId ? { ...b, id: realId } : b)),
        }))
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist new block:', err)
        // Revert optimistic update
        set({ blocks })
      }
    }
  },

  editBlock: async (id, patch, ripple = true) => {
    const state = get()
    if (!state.day) return

    // For startMin or durationMin changes with ripple, apply nudge logic
    let blocks = state.blocks
    if (ripple && (patch.startMin !== undefined || patch.durationMin !== undefined)) {
      if (patch.startMin !== undefined) {
        const block = blocks.find((b) => b.id === id)
        if (block) {
          const delta = patch.startMin - block.startMin
          blocks = nudge(blocks, id, delta, true)
        }
      } else if (patch.durationMin !== undefined) {
        const block = blocks.find((b) => b.id === id)
        if (block) {
          const durationDelta = patch.durationMin - block.durationMin
          // Ripple downstream blocks by the duration change
          const index = blocks.findIndex((b) => b.id === id)
          if (index !== -1 && index < blocks.length - 1) {
            blocks = blocks.map((b, i) => {
              if (i === index) {
                return { ...b, durationMin: patch.durationMin! }
              }
              if (i > index) {
                return { ...b, startMin: Math.max(0, b.startMin + durationDelta) }
              }
              return b
            })
          } else {
            blocks = blocks.map((b) => (b.id === id ? { ...b, durationMin: patch.durationMin! } : b))
          }
        }
      }
    } else {
      // No ripple; just update this block
      const safePatch = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined)
      ) as Partial<DayBlock>
      blocks = blocks.map((b) => (b.id === id ? { ...b, ...safePatch } : b))
    }
    // Re-sort: startMin/durationMin changes above can change canonical order.
    blocks = sortBlocks(blocks)
    set({ blocks })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        // Only persist changed fields
        const persistPatch: Partial<DayBlock> = {}
        if (patch.title !== undefined) persistPatch.title = patch.title
        if (patch.kind !== undefined) persistPatch.kind = patch.kind
        if (patch.startMin !== undefined) persistPatch.startMin = patch.startMin
        if (patch.durationMin !== undefined) persistPatch.durationMin = patch.durationMin
        if (patch.pomodoros !== undefined) persistPatch.pomodoros = patch.pomodoros
        if (patch.completed !== undefined) persistPatch.completed = patch.completed
        if (Object.keys(persistPatch).length > 0) {
          await blocksRepo.updateBlock(driver, id, persistPatch)
        }
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist block edit:', err)
        // Revert optimistic update
        set({ blocks: state.blocks })
      }
    }
  },

  removeBlock: async (id) => {
    const state = get()
    if (!state.day) return

    const blocks = state.blocks.filter((b) => b.id !== id)
    set({ blocks })

    // Persist to database if available
    if (persistenceDriver && hydratedDay) {
      try {
        const driver = persistenceDriver
        await blocksRepo.deleteBlock(driver, id)
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Delete failed' }))
        console.error('Failed to persist block deletion:', err)
        // Revert optimistic update
        set({ blocks: state.blocks })
      }
    }
  },

  move: async (id, direction) => {
    const state = get()
    if (!state.day) return

    // state.blocks is kept in canonical order (see sortBlocks) by every
    // mutation in this store, so this index matches what the timeline and
    // its up/down controls display — moveBlockPure requires that.
    const index = state.blocks.findIndex((b) => b.id === id)
    if (index === -1) return

    const moved = moveBlockPure(state.blocks, index, direction)
    if (moved === state.blocks) return // No-op at boundary
    // Stamp `sort` to match the final array position. moveBlockPure only
    // touches startMin, so without this the in-memory blocks would keep
    // their old `sort` values while reorderBlocks() below persists a fresh
    // 0..n-1 sequence matching the new order — a real memory/database
    // divergence, since sortBlocks() uses `sort` as its tie-breaker for
    // equal startMin. Caught by the hydrate-round-trip regression test.
    const blocks = sortBlocks(moved).map((b, i) => ({ ...b, sort: i }))

    set({ blocks })

    // Persist to database if available
    if (persistenceDriver && hydratedDay) {
      try {
        const driver = persistenceDriver
        const day = hydratedDay
        // Persist only the startMin values that changed
        const changed = blocks.filter((b) => {
          const before = state.blocks.find((sb) => sb.id === b.id)
          return before !== undefined && before.startMin !== b.startMin
        })
        for (const block of changed) {
          await blocksRepo.updateBlock(driver, block.id, { startMin: block.startMin })
        }
        // Also update sort order to match the new canonical order
        const orderedIds = blocks.map((b) => b.id)
        await blocksRepo.reorderBlocks(driver, day, orderedIds)
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Reorder failed' }))
        console.error('Failed to persist move:', err)
        // Revert optimistic update
        set({ blocks: state.blocks })
      }
    }
  },

  toggleCompleted: async (id) => {
    const state = get()
    const block = state.blocks.find((b) => b.id === id)
    if (!block) return

    const newCompleted = !block.completed
    const blocks = state.blocks.map((b) =>
      b.id === id ? { ...b, completed: newCompleted } : b
    )
    set({ blocks })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        await blocksRepo.setBlockCompleted(driver, id, newCompleted)
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Toggle failed' }))
        console.error('Failed to persist completion toggle:', err)
        // Revert optimistic update
        set({ blocks: state.blocks })
      }
    }
  },

  applyTemplate: async (templateId) => {
    const state = get()
    if (!state.day) return

    set({ loading: true, error: null })

    if (!persistenceDriver || !hydratedDay) {
      set({ loading: false, error: 'No database connection' })
      return
    }

    try {
      const driver = persistenceDriver
      const day = hydratedDay
      await blocksRepo.applyTemplateToDay(driver, templateId, day)
      // Reload blocks
      const blocks = await blocksRepo.listBlocksForDay(driver, day)
      set({ blocks: sortBlocks(blocks), loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ error: message, loading: false })
      console.error('Failed to apply template:', err)
    }
  },

  nudgeBlock: async (id, deltaMin, ripple = true) => {
    const state = get()
    const nudged = nudge(state.blocks, id, deltaMin, ripple)
    if (nudged === state.blocks) return // No change
    const blocks = sortBlocks(nudged)

    set({ blocks })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        // Only persist blocks whose startMin changed (matched by id, not
        // position — sortBlocks above can reorder the array)
        const changed = blocks.filter((b) => {
          const before = state.blocks.find((sb) => sb.id === b.id)
          return before !== undefined && before.startMin !== b.startMin
        })
        for (const block of changed) {
          await blocksRepo.updateBlock(driver, block.id, { startMin: block.startMin })
        }
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Nudge failed' }))
        console.error('Failed to persist nudge:', err)
        // Revert optimistic update
        set({ blocks: state.blocks })
      }
    }
  },
}))
