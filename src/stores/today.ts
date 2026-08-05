import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { DayBlock, BlockRepeat } from '../db/types'
import * as blocksRepo from '../db/repos/blocks'
import * as notesRepo from '../db/repos/notes'
import * as settingsRepo from '../db/repos/settings'
import { nudge, moveBlock as moveBlockPure, sortBlocks, nextFreeStart, shiftFrom } from '../lib/today'

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
  // Effective shutdown time for the loaded day (null if none configured).
  shutdownMin: number | null
  // true when shutdownMin came from the global 'shutdownMin' setting, false
  // when it came from a per-day override (day_note.shutdown_min).
  shutdownIsDefault: boolean
  hydrate: (driver: SqlDriver | null, day: string) => Promise<void>
  addBlock: (input: {
    title: string
    kind: 'deep' | 'shallow' | 'ritual' | 'break'
    durationMin: number
    startMin?: number
    /**
     * Current minute-of-day, supplied by the caller, used to compute a
     * default startMin when none is given. The store must never call
     * `new Date()` itself — a store reading the clock directly is what
     * produced this project's past UTC-day-key defect, and it makes this
     * action untestable. Defaults to 0 for back-compat.
     */
    fromMin?: number
    pomodoros?: number
    taskId?: number | null
    note?: string
    repeat?: BlockRepeat
    trackId?: number | null
    quiet?: boolean
  }) => Promise<number | null>
  setShutdown: (min: number, scope: 'day' | 'default') => Promise<void>
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

// Every DayBlock field that editBlock is allowed to persist, i.e. every
// field except the immutable/derived ones (id, day, sort). This is an
// exhaustively-typed key set rather than a hand-maintained list of
// `if (patch.X !== undefined)` lines: if a field is ever added to DayBlock
// without updating this object, `tsc -b` fails at this declaration instead
// of silently dropping the new field on every edit (three separate
// incidents of this exact bug class — see TASKS.md Phase 5.6).
const PERSISTABLE_BLOCK_FIELDS: Record<keyof Omit<DayBlock, 'id' | 'day' | 'sort'>, true> = {
  title: true,
  kind: true,
  startMin: true,
  durationMin: true,
  pomodoros: true,
  completed: true,
  taskId: true,
  note: true,
  repeat: true,
  trackId: true,
  quiet: true,
}

export const useTodayStore = create<TodayState>()((set, get) => ({
  day: null,
  blocks: [],
  loading: false,
  error: null,
  shutdownMin: null,
  shutdownIsDefault: true,

  hydrate: async (driver, day) => {
    persistenceDriver = driver
    hydratedDay = day
    set({ day, loading: true, error: null, shutdownMin: null, shutdownIsDefault: true })

    if (!driver) {
      // In-memory mode: keep empty state for vite dev
      set({ loading: false })
      return
    }

    // Resolve the shutdown time. This is secondary to the day's blocks, so a
    // failure here must not abort block hydration below.
    try {
      const dayShutdown = await notesRepo.getDayShutdown(driver, day)
      if (dayShutdown !== null) {
        set({ shutdownMin: dayShutdown, shutdownIsDefault: false })
      } else {
        const raw = await settingsRepo.getSetting(driver, 'shutdownMin')
        const parsed = raw !== null && raw.trim() !== '' ? Number(raw) : NaN
        if (!Number.isNaN(parsed)) {
          set({ shutdownMin: parsed, shutdownIsDefault: true })
        }
      }
    } catch (err) {
      console.error('Failed to hydrate shutdown time:', err)
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
    if (!state.day) return null

    // Optimistically add to in-memory state
    const localId = nextLocalId--
    const blocks = state.blocks
    // Default startMin: earliest free slot at or after fromMin (0 if not given)
    let startMin = input.startMin
    if (startMin === undefined) {
      startMin = nextFreeStart(blocks, input.fromMin ?? 0, input.durationMin)
    }

    const newBlock: DayBlock = {
      id: localId,
      day: state.day,
      taskId: input.taskId ?? null,
      title: input.title,
      kind: input.kind,
      startMin,
      durationMin: input.durationMin,
      pomodoros: input.pomodoros ?? 0,
      completed: false,
      sort: blocks.length,
      note: input.note ?? '',
      repeat: input.repeat ?? 'once',
      trackId: input.trackId ?? null,
      quiet: input.quiet ?? false,
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
          taskId: input.taskId ?? null,
          title: input.title,
          kind: input.kind,
          startMin,
          durationMin: input.durationMin,
          pomodoros: input.pomodoros ?? 0,
          sort: withNew.length - 1,
          note: input.note ?? '',
          repeat: input.repeat ?? 'once',
          trackId: input.trackId ?? null,
          quiet: input.quiet ?? false,
        })
        // Update state with real id
        set((_s) => ({
          blocks: get().blocks.map((b) => (b.id === localId ? { ...b, id: realId } : b)),
        }))
        return realId
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist new block:', err)
        // Revert optimistic update
        set({ blocks })
        return null
      }
    }

    return localId
  },

  editBlock: async (id, patch, ripple = true) => {
    const state = get()
    if (!state.day) return

    // Same "drop undefined keys" approach regardless of ripple — there is no
    // longer a separate ripple/no-ripple path for *which fields* land on the
    // edited block. Ripple only ever controls whether downstream blocks move.
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    ) as Partial<DayBlock>

    // Index in the PRE-EDIT canonical order (state.blocks, always kept
    // sorted by this store). A startMin change can move the edited block to
    // a different canonical position, so this index must be captured before
    // the patch is applied. Applying the patch via .map() below preserves
    // array positions, so this index still points at the edited block (and
    // everything after it in pre-edit order) in the patched array.
    const preEditIndex = state.blocks.findIndex((b) => b.id === id)
    const before = preEditIndex !== -1 ? state.blocks[preEditIndex] : null

    let blocks = state.blocks.map((b) => (b.id === id ? { ...b, ...safePatch } : b))

    if (ripple && before && preEditIndex < blocks.length - 1) {
      const after = blocks[preEditIndex]
      // Ripple on the edited block's END time so simultaneous start+duration
      // changes shift downstream blocks correctly — this reduces to a pure
      // start delta or pure duration delta when only one of them changes.
      const delta = after.startMin + after.durationMin - (before.startMin + before.durationMin)
      if (delta !== 0) {
        blocks = shiftFrom(blocks, preEditIndex + 1, delta)
      }
    }

    // Re-sort: startMin changes above (on the edited block or its ripple
    // targets) can change canonical order.
    blocks = sortBlocks(blocks)
    set({ blocks })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        // Only persist changed fields, restricted to the exhaustive
        // PERSISTABLE_BLOCK_FIELDS key set (see its doc comment).
        const persistPatch = Object.fromEntries(
          Object.entries(safePatch).filter(([key]) => key in PERSISTABLE_BLOCK_FIELDS)
        ) as Partial<DayBlock>
        if (Object.keys(persistPatch).length > 0) {
          await blocksRepo.updateBlock(driver, id, persistPatch)
        }

        // Persist any downstream ripple shifts, matched by id (not array
        // position) — same pattern as move() and nudgeBlock() below.
        const shifted = blocks.filter((b) => {
          if (b.id === id) return false
          const prior = state.blocks.find((sb) => sb.id === b.id)
          return prior !== undefined && prior.startMin !== b.startMin
        })
        for (const block of shifted) {
          await blocksRepo.updateBlock(driver, block.id, { startMin: block.startMin })
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

  setShutdown: async (min, scope) => {
    const state = get()
    const prev = { shutdownMin: state.shutdownMin, shutdownIsDefault: state.shutdownIsDefault }

    if (scope === 'day') {
      if (!hydratedDay) return
      set({ shutdownMin: min, shutdownIsDefault: false })
      if (persistenceDriver) {
        try {
          await notesRepo.setDayShutdown(persistenceDriver, hydratedDay, min)
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Save failed' })
          console.error('Failed to persist day shutdown time:', err)
          set(prev)
        }
      }
    } else {
      set({ shutdownMin: min, shutdownIsDefault: true })
      if (persistenceDriver) {
        try {
          await settingsRepo.setSetting(persistenceDriver, 'shutdownMin', String(min))
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Save failed' })
          console.error('Failed to persist default shutdown time:', err)
          set(prev)
        }
      }
    }
  },
}))
