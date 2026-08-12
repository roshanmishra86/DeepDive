import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { DayBlock, BlockRepeat } from '../db/types'
import * as blocksRepo from '../db/repos/blocks'
import { nudge, moveBlockTo as moveBlockToPure, sortBlocks, nextFreeStart, shiftFrom } from '../lib/today'
import { addDays, fromDayKey, toDayKey } from '../lib/time'

/**
 * Canonical multi-day block store, keyed by day. Hydrates from the database
 * via the `day_block` table. Blocks maintain their absolute startMin values
 * (persisted as-is). Gaps between blocks are first-class and preserved
 * across mutations. Changes persist to the database while updating state
 * immediately for responsive UI. In-memory fallback when driver is null
 * allows `vite dev` to work without Tauri.
 *
 * This store NEVER reads the clock: every action takes the day key (and any
 * minute-of-day) from its caller. A store reading `new Date()` itself is what
 * produced this project's past UTC-day-key defect. The clock lives in
 * `stores/day.ts`, which is deliberately NOT imported here — the day store
 * imports this one, and a cycle between them is fragile under Vite. The
 * "blocks for the day on screen" selector lives in `stores/useTodayBlocks.ts`
 * for the same reason.
 */
interface BlocksState {
  /** Every loaded day's blocks, each array kept in canonical sortBlocks order. */
  blocksByDay: Record<string, DayBlock[]>
  /** Days present in `blocksByDay` — a day with no rows is `[]`, never absent. */
  loadedDays: string[]
  loading: boolean
  error: string | null
  hydrate: (driver: SqlDriver | null, days: string[]) => Promise<void>
  /** Loads only the days not already in `loadedDays`; no-op when all present. */
  ensureDays: (dayKeys: string[]) => Promise<void>
  /** Unconditional reload of those days. */
  reloadDays: (dayKeys: string[]) => Promise<void>
  addBlock: (
    day: string,
    input: {
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
      subtaskId?: number | null
      note?: string
      repeat?: BlockRepeat
      trackId?: number | null
      quiet?: boolean
    }
  ) => Promise<number | null>
  editBlock: (
    day: string,
    id: number,
    patch: Partial<Omit<DayBlock, 'id' | 'day' | 'sort'>>,
    ripple?: boolean
  ) => Promise<void>
  removeBlock: (day: string, id: number) => Promise<void>
  move: (day: string, id: number, direction: -1 | 1) => Promise<void>
  moveWithinDay: (day: string, id: number, targetIndex: number) => Promise<void>
  /**
   * `updatedAt` is the "last edited" instant, supplied by the caller for the
   * same reason as `addBlock`'s `fromMin` — the store must never read the
   * clock itself. Persisted in the same UPDATE as `note`.
   */
  saveBlockNote: (day: string, id: number, note: string, updatedAt: string) => Promise<boolean>
  toggleCompleted: (day: string, id: number) => Promise<void>
  // P2-A (PR review, stores/templates.ts): returns `true`/`false` rather
  // than throwing — never rejects, same as every other action in this
  // store — so TemplateDetailPane can gate its "navigate to Today" on
  // whether the apply actually landed instead of assuming it always does.
  applyTemplate: (day: string, templateId: number) => Promise<boolean>
  nudgeBlock: (day: string, id: number, deltaMin: number, ripple?: boolean) => Promise<void>
  /**
   * Moves one block to another day, keeping its startMin. Both resulting
   * orderings are resolved from store state here so the repo never
   * re-derives them. Returns false (and reverts both days) when the
   * source-day guard misses or the write throws.
   */
  moveToDay: (input: { blockId: number; fromDay: string; toDay: string }) => Promise<boolean>
}

// Optimistic local ids for rows not yet persisted. Negative and
// monotonically decreasing, so they can never collide with a real SQLite
// AUTOINCREMENT id (always positive) — unlike a positive counter seeded
// from the current max id, which is only collision-free until the real
// autoincrement counter catches up to it. See the Phase 4 defect list.
let nextLocalId = -1
let persistenceDriver: SqlDriver | null = null

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
  subtaskId: true,
  note: true,
  noteUpdatedAt: true,
  repeat: true,
  trackId: true,
  quiet: true,
}

/** Sorted, de-duplicated day keys. */
function normalizeDays(days: string[]): string[] {
  return [...new Set(days)].sort()
}

/** True when `sorted` is a run of consecutive calendar days. */
function isContiguous(sorted: string[]): boolean {
  for (let i = 1; i < sorted.length; i++) {
    if (toDayKey(addDays(fromDayKey(sorted[i - 1]), 1)) !== sorted[i]) return false
  }
  return true
}

function mergeLoadedDays(loaded: string[], added: string[]): string[] {
  return [...new Set([...loaded, ...added])].sort()
}

/**
 * Fetches the given days. A contiguous span goes through ONE range query
 * rather than N per-day queries: the week view loads seven days at once, and
 * seven round trips through the Tauri SQL bridge is seven times the IPC for
 * the same rows. A non-contiguous set falls back to per-day queries, because
 * a range query over its span would drag in every day between the endpoints.
 */
async function fetchDays(driver: SqlDriver, sortedDays: string[]): Promise<Record<string, DayBlock[]>> {
  const byDay: Record<string, DayBlock[]> = {}
  for (const day of sortedDays) byDay[day] = []
  if (sortedDays.length === 0) return byDay

  if (isContiguous(sortedDays)) {
    const rows = await blocksRepo.listBlocksForRange(driver, sortedDays[0], sortedDays[sortedDays.length - 1])
    for (const row of rows) {
      const bucket = byDay[row.day]
      if (bucket) bucket.push(row)
    }
  } else {
    for (const day of sortedDays) {
      byDay[day] = await blocksRepo.listBlocksForDay(driver, day)
    }
  }

  for (const day of sortedDays) byDay[day] = sortBlocks(byDay[day])
  return byDay
}

export const useBlocksStore = create<BlocksState>()((set, get) => {
  /**
   * Writes back a single day's slice. Never replaces the whole map wholesale:
   * unrelated days keep their array identity so selectors watching another
   * day don't re-render on this mutation.
   */
  const setDay = (day: string, blocks: DayBlock[]) => {
    set((s) => ({ blocksByDay: { ...s.blocksByDay, [day]: blocks } }))
  }

  const loadDays = async (dayKeys: string[]) => {
    const days = normalizeDays(dayKeys)
    if (days.length === 0) return
    if (!persistenceDriver) {
      // In-memory mode: nothing to read, but the days still become "loaded"
      // so callers can rely on loadedDays. Existing in-memory slices are
      // kept — with no database they ARE the data.
      set((s) => {
        const blocksByDay = { ...s.blocksByDay }
        for (const day of days) blocksByDay[day] ??= []
        return { blocksByDay, loadedDays: mergeLoadedDays(s.loadedDays, days) }
      })
      return
    }
    const driver = persistenceDriver
    try {
      const byDay = await fetchDays(driver, days)
      set((s) => ({
        blocksByDay: { ...s.blocksByDay, ...byDay },
        loadedDays: mergeLoadedDays(s.loadedDays, days),
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' })
      console.error('Failed to load blocks for days:', err)
    }
  }

  return {
    blocksByDay: {},
    loadedDays: [],
    loading: false,
    error: null,

    hydrate: async (driver, days) => {
      persistenceDriver = driver
      const wanted = normalizeDays(days)
      set({ loading: true, error: null })

      if (!driver) {
        // In-memory mode for vite dev: keep whatever is already in state for
        // these days (it is the only copy) and mark them loaded.
        set((s) => {
          const blocksByDay = { ...s.blocksByDay }
          for (const day of wanted) blocksByDay[day] ??= []
          return {
            blocksByDay,
            loadedDays: mergeLoadedDays(s.loadedDays, wanted),
            loading: false,
          }
        })
        return
      }

      try {
        const byDay = await fetchDays(driver, wanted)
        set((s) => ({
          blocksByDay: { ...s.blocksByDay, ...byDay },
          loadedDays: mergeLoadedDays(s.loadedDays, wanted),
          loading: false,
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        set({ error: message, loading: false })
        console.error('Failed to hydrate blocks store:', err)
      }
    },

    ensureDays: async (dayKeys) => {
      const loaded = new Set(get().loadedDays)
      const missing = normalizeDays(dayKeys).filter((day) => !loaded.has(day))
      if (missing.length === 0) return
      await loadDays(missing)
    },

    reloadDays: async (dayKeys) => {
      await loadDays(dayKeys)
    },

    addBlock: async (day, input) => {
      // Optimistically add to in-memory state
      const localId = nextLocalId--
      const blocks = get().blocksByDay[day] ?? []
      // Default startMin: earliest free slot at or after fromMin (0 if not given)
      let startMin = input.startMin
      if (startMin === undefined) {
        startMin = nextFreeStart(blocks, input.fromMin ?? 0, input.durationMin)
      }

      const newBlock: DayBlock = {
        id: localId,
        day,
        taskId: input.taskId ?? null,
        subtaskId: input.subtaskId ?? null,
        title: input.title,
        kind: input.kind,
        startMin,
        durationMin: input.durationMin,
        pomodoros: input.pomodoros ?? 0,
        completed: false,
        sort: blocks.length,
        note: input.note ?? '',
        // A block created with a note has not been *edited*, so there is no
        // truthful "last edited" instant yet. The first saveBlockNote stamps it
        // with the instant its caller supplies.
        noteUpdatedAt: null,
        repeat: input.repeat ?? 'once',
        trackId: input.trackId ?? null,
        quiet: input.quiet ?? false,
      }
      const withNew = sortBlocks([...blocks, newBlock])
      setDay(day, withNew)

      // Persist to database if available
      if (persistenceDriver) {
        try {
          const driver = persistenceDriver
          const realId = await blocksRepo.createBlock(driver, {
            day,
            taskId: input.taskId ?? null,
            subtaskId: input.subtaskId ?? null,
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
          setDay(day, (get().blocksByDay[day] ?? []).map((b) => (b.id === localId ? { ...b, id: realId } : b)))
          return realId
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Save failed' })
          console.error('Failed to persist new block:', err)
          // Revert optimistic update
          setDay(day, blocks)
          return null
        }
      }

      return localId
    },

    editBlock: async (day, id, patch, ripple = true) => {
      const previous = get().blocksByDay[day] ?? []

      // Same "drop undefined keys" approach regardless of ripple — there is no
      // longer a separate ripple/no-ripple path for *which fields* land on the
      // edited block. Ripple only ever controls whether downstream blocks move.
      const safePatch = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined)
      ) as Partial<DayBlock>

      // Index in the PRE-EDIT canonical order (this day's slice, always kept
      // sorted by this store). A startMin change can move the edited block to
      // a different canonical position, so this index must be captured before
      // the patch is applied. Applying the patch via .map() below preserves
      // array positions, so this index still points at the edited block (and
      // everything after it in pre-edit order) in the patched array.
      const preEditIndex = previous.findIndex((b) => b.id === id)
      const before = preEditIndex !== -1 ? previous[preEditIndex] : null

      let blocks = previous.map((b) => (b.id === id ? { ...b, ...safePatch } : b))

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
      setDay(day, blocks)

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
          // position) — same pattern as moveWithinDay() and nudgeBlock() below.
          const shifted = blocks.filter((b) => {
            if (b.id === id) return false
            const prior = previous.find((sb) => sb.id === b.id)
            return prior !== undefined && prior.startMin !== b.startMin
          })
          for (const block of shifted) {
            await blocksRepo.updateBlock(driver, block.id, { startMin: block.startMin })
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Save failed' })
          console.error('Failed to persist block edit:', err)
          // Revert optimistic update
          setDay(day, previous)
        }
      }
    },

    removeBlock: async (day, id) => {
      const previous = get().blocksByDay[day] ?? []
      setDay(day, previous.filter((b) => b.id !== id))

      // Persist to database if available
      if (persistenceDriver) {
        try {
          const driver = persistenceDriver
          await blocksRepo.deleteBlock(driver, id)
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Delete failed' })
          console.error('Failed to persist block deletion:', err)
          // Revert optimistic update
          setDay(day, previous)
        }
      }
    },

    move: async (day, id, direction) => {
      const index = (get().blocksByDay[day] ?? []).findIndex((b) => b.id === id)
      if (index === -1) return
      await get().moveWithinDay(day, id, index + direction)
    },

    moveWithinDay: async (day, id, targetIndex) => {
      const previous = get().blocksByDay[day] ?? []

      const index = previous.findIndex((b) => b.id === id)
      if (index === -1) return

      const moved = moveBlockToPure(previous, index, targetIndex)
      if (moved === previous) return // No-op at boundary
      // Stamp `sort` to match the final array position. moveBlockPure only
      // touches startMin, so without this the in-memory blocks would keep
      // their old `sort` values while the resequence below persists a fresh
      // 0..n-1 sequence matching the new order — a real memory/database
      // divergence, since sortBlocks() uses `sort` as its tie-breaker for
      // equal startMin. Caught by the hydrate-round-trip regression test.
      const blocks = sortBlocks(moved).map((b, i) => ({ ...b, sort: i }))

      setDay(day, blocks)

      // Persist to database if available
      if (persistenceDriver) {
        try {
          const driver = persistenceDriver
          const changed = blocks.filter((b) => {
            const before = previous.find((sb) => sb.id === b.id)
            return before !== undefined && before.startMin !== b.startMin
          })
          const orderedIds = blocks.map((b) => b.id)
          await blocksRepo.moveDayBlocksAtomic(
            driver,
            day,
            changed.map((block) => ({ id: block.id, startMin: block.startMin })),
            orderedIds
          )
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Reorder failed' })
          console.error('Failed to persist move:', err)
          // Revert optimistic update
          setDay(day, previous)
        }
      }
    },

    saveBlockNote: async (day, id, note, updatedAt) => {
      const previous = get().blocksByDay[day] ?? []
      if (!previous.some((block) => block.id === id)) return false
      setDay(day, previous.map((block) => block.id === id ? { ...block, note, noteUpdatedAt: updatedAt } : block))
      if (!persistenceDriver) return true
      try {
        // Both fields in ONE patch: updateBlock emits a single UPDATE, so the
        // note and its "last edited" stamp can never diverge.
        await blocksRepo.updateBlock(persistenceDriver, id, { note, noteUpdatedAt: updatedAt })
        return true
      } catch (err) {
        setDay(day, previous)
        set({ error: err instanceof Error ? err.message : 'Could not save block note' })
        return false
      }
    },

    toggleCompleted: async (day, id) => {
      const previous = get().blocksByDay[day] ?? []
      const block = previous.find((b) => b.id === id)
      if (!block) return

      const newCompleted = !block.completed
      setDay(day, previous.map((b) => (b.id === id ? { ...b, completed: newCompleted } : b)))

      // Persist to database if available
      if (persistenceDriver) {
        try {
          const driver = persistenceDriver
          await blocksRepo.setBlockCompleted(driver, id, newCompleted)
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Toggle failed' })
          console.error('Failed to persist completion toggle:', err)
          // Revert optimistic update
          setDay(day, previous)
        }
      }
    },

    applyTemplate: async (day, templateId) => {
      set({ loading: true, error: null })

      if (!persistenceDriver) {
        set({ loading: false, error: 'No database connection' })
        return false
      }

      try {
        const driver = persistenceDriver
        await blocksRepo.applyTemplateToDay(driver, templateId, day)
        // Reload blocks
        const blocks = await blocksRepo.listBlocksForDay(driver, day)
        setDay(day, sortBlocks(blocks))
        set((s) => ({ loadedDays: mergeLoadedDays(s.loadedDays, [day]), loading: false }))
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        set({ error: message, loading: false })
        console.error('Failed to apply template:', err)
        return false
      }
    },

    nudgeBlock: async (day, id, deltaMin, ripple = true) => {
      const previous = get().blocksByDay[day] ?? []
      const nudged = nudge(previous, id, deltaMin, ripple)
      if (nudged === previous) return // No change
      const blocks = sortBlocks(nudged)

      setDay(day, blocks)

      // Persist to database if available
      if (persistenceDriver) {
        try {
          const driver = persistenceDriver
          // Only persist blocks whose startMin changed (matched by id, not
          // position — sortBlocks above can reorder the array)
          const changed = blocks.filter((b) => {
            const before = previous.find((sb) => sb.id === b.id)
            return before !== undefined && before.startMin !== b.startMin
          })
          for (const block of changed) {
            await blocksRepo.updateBlock(driver, block.id, { startMin: block.startMin })
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Nudge failed' })
          console.error('Failed to persist nudge:', err)
          // Revert optimistic update
          setDay(day, previous)
        }
      }
    },

    moveToDay: async ({ blockId, fromDay, toDay }) => {
      // Same-day "moves" have no meaning here — reordering within a day is
      // moveWithinDay's job, and the two orderings below would contradict
      // each other on one slice.
      if (fromDay === toDay) return false

      const previousFrom = get().blocksByDay[fromDay] ?? []
      const block = previousFrom.find((b) => b.id === blockId)
      if (!block) return false
      const previousTo = get().blocksByDay[toDay] ?? []

      // Both orderings are resolved HERE, from store state, so the repo never
      // re-derives them: source order is this day minus the block, destination
      // order is that day plus the block re-sorted by the canonical rule.
      // The block keeps its original startMin — an overlap on the destination
      // day is intentional and gets badged by conflicts() in lib/today.
      const nextFrom = previousFrom.filter((b) => b.id !== blockId).map((b, i) => ({ ...b, sort: i }))
      const nextTo = sortBlocks([...previousTo, { ...block, day: toDay }]).map((b, i) => ({ ...b, sort: i }))

      set((s) => ({ blocksByDay: { ...s.blocksByDay, [fromDay]: nextFrom, [toDay]: nextTo } }))

      if (!persistenceDriver) return true

      const revert = (message: string) => {
        set((s) => ({
          blocksByDay: { ...s.blocksByDay, [fromDay]: previousFrom, [toDay]: previousTo },
          error: message,
        }))
      }

      try {
        const ok = await blocksRepo.moveBlockToDayAtomic(persistenceDriver, {
          blockId,
          fromDay,
          toDay,
          fromDayOrderedIds: nextFrom.map((b) => b.id),
          toDayOrderedIds: nextTo.map((b) => b.id),
        })
        if (!ok) {
          // Source-day guard missed: the row is no longer on fromDay, so this
          // client's view of both days is stale by definition — and the
          // transaction already resequenced `sort` on both days before the
          // guard aborted the move itself. Restoring the pre-move arrays
          // (revert) would reinstate that stale view; reload from disk so
          // both slices reflect what actually happened there.
          set({ error: 'Block already moved' })
          await get().reloadDays([fromDay, toDay])
          return false
        }
        return true
      } catch (err) {
        console.error('Failed to persist cross-day move:', err)
        revert(err instanceof Error ? err.message : 'Move failed')
        return false
      }
    },
  }
})
