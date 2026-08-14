import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { Template, TemplateBlock } from '../db/types'
import * as templatesRepo from '../db/repos/templates'
import type { TemplateWithStats, TemplateDetail } from '../db/repos/templates'
import { moveBlockTo as moveBlockToPure, sortBlocks } from '../lib/today'
import { nextTemplateBlockStart, toggleWeekday, templateTotals } from '../lib/templates'

// TemplateWithStats and TemplateDetail are defined once, in
// `db/repos/templates.ts` (they mirror the SQL shape returned by
// `listTemplates`/`getTemplate`). Re-exported here so store consumers can
// keep importing them from the store without a second declaration existing
// anywhere in the tree — see the Phase 3/4 "duplicated interface" defect
// class in TASKS.md.
export type { TemplateWithStats, TemplateDetail }

/**
 * Templates store. Hydrates templates from the database and manages CRUD operations.
 * Blocks maintain their absolute startMin values. Changes persist to the database while
 * updating state immediately for responsive UI. In-memory fallback when driver is null.
 *
 * Error contract (P2-A, PR review): every mutator here catches its own
 * persistence errors, sets `error`, reverts the optimistic update, and
 * RETURNS rather than throwing — this matches every other store in the app
 * (`stores/blocks.ts`, `stores/tasks.ts`), none of which ever rejects from an
 * action. That existing convention, not "make it throw," is what this store
 * stays consistent with. What changed here: actions that need to report
 * success/failure to a caller that gates a UI transition on it (closing a
 * modal, navigating away) do so via their RETURN VALUE, generalizing the
 * pattern `createTemplate`/`saveDayAsTemplate` already used (`number | null`)
 * to the void-returning mutators (`updateTemplate`, `deleteTemplate` here;
 * `applyTemplate` in `stores/blocks.ts`), which now return `boolean`. Callers
 * that only need the immediate optimistic state (e.g. `setWeekday`,
 * `addBlock`'s callers that don't need to know if the DB write landed) can
 * still just await and ignore the return value.
 */
interface TemplatesState {
  templates: TemplateWithStats[]
  selectedId: number | null
  detail: TemplateDetail | null
  loading: boolean
  error: string | null
  hydrate: (driver: SqlDriver | null) => Promise<void>
  select: (id: number | null) => Promise<void>
  createTemplate: (input: {
    name: string
    description?: string
    startMin: number
    weekdays?: number
  }) => Promise<number | null>
  // P2-A: neither of these throws (see the doc comment above the store for
  // the chosen contract) — they return `true`/`false` so a caller that must
  // gate a UI transition (closing a modal, navigating away) on success can
  // do so without relying on a rejection that will never come.
  updateTemplate: (id: number, patch: Partial<Omit<Template, 'id'>>) => Promise<boolean>
  deleteTemplate: (id: number) => Promise<boolean>
  setWeekday: (id: number, bit: number) => Promise<void>
  addBlock: (input: {
    title: string
    kind: 'deep' | 'shallow' | 'ritual' | 'break'
    startMin?: number
    durationMin: number
    pomodoros?: number
  }) => Promise<number | null>
  editBlock: (id: number, patch: Partial<Omit<TemplateBlock, 'id' | 'templateId'>>) => Promise<void>
  removeBlock: (id: number) => Promise<void>
  moveBlock: (id: number, direction: -1 | 1) => Promise<void>
  moveBlockTo: (id: number, targetIndex: number) => Promise<void>
  saveDayAsTemplate: (day: string, name: string) => Promise<number | null>
  duplicateTemplate: (id: number) => Promise<number | null>
}

// Optimistic local ids for rows not yet persisted. Negative and
// monotonically decreasing, so they can never collide with a real SQLite
// AUTOINCREMENT id (always positive).
let nextLocalId = -1
let persistenceDriver: SqlDriver | null = null

// Every TemplateBlock field that editBlock is allowed to persist, i.e. every
// field except the immutable/derived ones (id, templateId).
const PERSISTABLE_BLOCK_FIELDS: Record<keyof Omit<TemplateBlock, 'id' | 'templateId'>, true> = {
  title: true,
  kind: true,
  startMin: true,
  durationMin: true,
  pomodoros: true,
  sort: true,
}

/**
 * Recomputes `totalMin`/`blockCount` for the `templates` list row matching
 * `templateId` from `blocks` (the just-mutated detail's blocks), via the
 * same `templateTotals()` helper the detail pane would use. Every block
 * mutator (add/edit/remove/move) must call this after touching
 * `detail.blocks`, so the list card can never show stale stats — see the
 * Phase 6 D2 defect: the list and detail used to disagree until the whole
 * view remounted. A targeted derive-from-detail update, not a full
 * `listTemplates()` requery, so add/edit/remove stay O(1) SQL-free on every
 * keystroke.
 */
function syncListStats(
  templates: TemplateWithStats[],
  templateId: number,
  blocks: TemplateBlock[]
): TemplateWithStats[] {
  const { totalMin, blockCount } = templateTotals(blocks)
  return templates.map((t) => (t.id === templateId ? { ...t, totalMin, blockCount } : t))
}

export const useTemplatesStore = create<TemplatesState>()((set, get) => ({
  templates: [],
  selectedId: null,
  detail: null,
  loading: false,
  error: null,

  hydrate: async (driver) => {
    persistenceDriver = driver
    set({ loading: true, error: null })

    if (!driver) {
      // In-memory mode: keep empty state for vite dev
      set({ loading: false })
      return
    }

    try {
      const templates = await templatesRepo.listTemplates(driver)
      set({ templates, loading: false })
      const currentSelectedId = get().selectedId
      if (currentSelectedId !== null) {
        // Re-select the current id so `detail` is refreshed too — a
        // re-hydrate (e.g. after `saveDayAsTemplate`) must not leave the
        // detail pane showing pre-hydrate blocks while the list is fresh.
        await get().select(currentSelectedId)
      } else if (templates.length > 0) {
        // Select the first template if none is currently selected
        await get().select(templates[0].id)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ error: message, loading: false })
      console.error('Failed to hydrate templates store:', err)
    }
  },

  select: async (id) => {
    set({ selectedId: id, detail: null })

    if (!id || !persistenceDriver) return

    try {
      const detail = await templatesRepo.getTemplate(persistenceDriver, id)
      // P2-B: two rapid selections can resolve out of order (e.g. the Tauri
      // SQL pool has no ordering guarantee across concurrent queries). If a
      // later `select()` call has already moved `selectedId` on while this
      // one's `getTemplate()` was in flight, applying this stale response
      // would leave `detail` holding the WRONG template's blocks while
      // `selectedId` points at the right one — and every block mutator
      // trusts that `detail` belongs to `selectedId`. Discard it instead.
      if (get().selectedId !== id) return
      if (detail) {
        // Defence in depth, matching today.ts hydrate's `sortBlocks(blocks)`
        // on load: normalize to canonical order here too, so a `sort`
        // column that ever drifts from `startMin` order (e.g. a bug, or a
        // direct DB edit) can't render the detail pane backwards.
        set({ detail: { ...detail, blocks: sortBlocks(detail.blocks) } })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ error: message })
      console.error('Failed to load template detail:', err)
    }
  },

  createTemplate: async (input) => {
    const state = get()
    set({ error: null })

    // Optimistically add to in-memory state. A brand-new template has no
    // blocks yet, so its stats are `templateTotals([])` — computed via the
    // same helper the other mutators use (D2), rather than hardcoded 0s
    // that would silently drift if templateTotals' shape ever changed.
    const localId = nextLocalId--
    const { totalMin, blockCount } = templateTotals([])
    const newTemplate: TemplateWithStats = {
      id: localId,
      name: input.name,
      description: input.description ?? '',
      startMin: input.startMin,
      weekdays: input.weekdays ?? 0,
      totalMin,
      blockCount,
    }
    const withNew = [...state.templates, newTemplate]
    set({ templates: withNew })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        const realId = await templatesRepo.createTemplate(driver, input)
        // Update state with real id
        set((_s) => ({
          templates: get().templates.map((t) => (t.id === localId ? { ...t, id: realId } : t)),
        }))
        // Select the new template
        await get().select(realId)
        return realId
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist new template:', err)
        // Revert optimistic update
        set({ templates: state.templates })
        return null
      }
    }

    // Select the new template even without persistence
    await get().select(localId)
    return localId
  },

  updateTemplate: async (id, patch) => {
    const state = get()
    set({ error: null })

    // Update in-memory templates list
    const templates = state.templates.map((t) => (t.id === id ? { ...t, ...patch } : t))
    set({ templates })

    // Update detail if it's the selected template
    if (state.detail?.id === id) {
      set({ detail: { ...state.detail, ...patch } })
    }

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        await templatesRepo.updateTemplate(driver, id, patch)
        return true
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist template update:', err)
        // Revert optimistic update
        set({ templates: state.templates, detail: state.detail })
        return false
      }
    }

    return true
  },

  deleteTemplate: async (id) => {
    const state = get()
    set({ error: null })

    // Remove from templates list
    const templates = state.templates.filter((t) => t.id !== id)
    set({ templates })

    // Clear selection if it was the deleted template
    if (state.selectedId === id) {
      const nextId = templates.length > 0 ? templates[0].id : null
      // Always null out detail here — it still holds the *deleted*
      // template's blocks. Assigning `state.detail` (the pre-delete value)
      // to the new selection would briefly render the wrong template's
      // detail pane for any render between this `set` and `select()`
      // resolving. `select()` below repopulates it correctly.
      set({ selectedId: nextId, detail: null })
      if (nextId) {
        await get().select(nextId)
      }
    }

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        await templatesRepo.deleteTemplate(driver, id)
        return true
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Delete failed' }))
        console.error('Failed to persist template deletion:', err)
        // Revert optimistic update. P3: every other mutator restores the
        // EXACT prior state on failure; this used to restore only
        // `templates`, leaving `selectedId`/`detail` stuck on the
        // optimistically-moved-to selection even though the delete that
        // triggered the move never actually landed in the database.
        set({ templates: state.templates, selectedId: state.selectedId, detail: state.detail })
        return false
      }
    }

    return true
  },

  setWeekday: async (id, bit) => {
    const state = get()
    // Look up the list row first; fall back to `detail` if the id isn't
    // (yet) in `templates` — e.g. a freshly-created template whose list row
    // hasn't landed, or a list row momentarily missing during a refresh.
    // This keeps the detail pane's weekday buttons working even when the
    // list is out of sync, instead of silently no-opping.
    const template = state.templates.find((t) => t.id === id) ?? (state.detail?.id === id ? state.detail : null)
    if (!template) {
      set({ error: `setWeekday: no template found for id ${id}` })
      return
    }

    const newWeekdays = toggleWeekday(template.weekdays, bit)
    await get().updateTemplate(id, { weekdays: newWeekdays })
  },

  addBlock: async (input) => {
    const state = get()
    if (!state.selectedId || !state.detail) return null

    // Optimistically add to detail
    const localId = nextLocalId--
    // If no startMin provided: no blocks -> template.startMin, else end of
    // the last block in canonical order. Delegates to the shared helper
    // (src/lib/templates.ts) rather than re-deriving the same rule here.
    const startMin = input.startMin ?? nextTemplateBlockStart(state.detail.blocks, state.detail)

    const newBlock: TemplateBlock = {
      id: localId,
      templateId: state.selectedId,
      title: input.title,
      kind: input.kind,
      startMin,
      durationMin: input.durationMin,
      pomodoros: input.pomodoros ?? 0,
      sort: state.detail.blocks.length,
    }
    const withNew = sortBlocks([...state.detail.blocks, newBlock])
    set({
      detail: { ...state.detail, blocks: withNew },
      templates: syncListStats(state.templates, state.selectedId, withNew),
    })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        const realId = await templatesRepo.addTemplateBlock(driver, {
          templateId: state.selectedId,
          title: input.title,
          kind: input.kind,
          startMin,
          durationMin: input.durationMin,
          pomodoros: input.pomodoros ?? 0,
          sort: withNew.length - 1,
        })
        // Update state with real id
        const currentDetail = get().detail
        if (currentDetail) {
          const updatedBlocks = currentDetail.blocks.map((b) =>
            b.id === localId ? { ...b, id: realId } : b
          )
          set({
            detail: {
              id: currentDetail.id,
              name: currentDetail.name,
              description: currentDetail.description,
              startMin: currentDetail.startMin,
              weekdays: currentDetail.weekdays,
              blocks: updatedBlocks,
            },
          })
        }
        return realId
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist new template block:', err)
        // Revert optimistic update (detail AND the list stats derived from it)
        set({ detail: state.detail, templates: state.templates })
        return null
      }
    }

    return localId
  },

  editBlock: async (id, patch) => {
    const state = get()
    if (!state.selectedId || !state.detail) return

    // Same approach as today store: drop undefined keys
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    ) as Partial<TemplateBlock>

    let blocks = state.detail.blocks.map((b) => (b.id === id ? { ...b, ...safePatch } : b))

    // P1-A: re-sort AND re-stamp `sort` densely to match the resulting
    // canonical order — a startMin change can move the edited block to a
    // different position, and unlike removeBlock/moveBlock this used to
    // stop at re-sorting the in-memory array without ever re-stamping or
    // persisting `sort`. getTemplate() reads `ORDER BY sort`, so a reload
    // rendered blocks in the OLD order while startMin said otherwise (the
    // same "timeline runs backwards, silently" defect class as F1) — and
    // moveBlock afterward would then operate on the wrong positions.
    blocks = sortBlocks(blocks).map((b, i) => ({ ...b, sort: i }))
    set({
      detail: { ...state.detail, blocks },
      templates: syncListStats(state.templates, state.selectedId, blocks),
    })

    // Persist to database if available. The field patch and the renumbered
    // sort sequence are written as one atomic transaction (matching
    // moveTemplateBlocksAtomic/removeTemplateBlockAtomic, Phase 6 F1) so a
    // failure partway through can never leave the DB with the patch applied
    // but a stale sort order, or vice versa.
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        // Only persist changed fields (excluding `sort`, which is always
        // handled via the full `orderedIds` renumbering below).
        const persistPatch = Object.fromEntries(
          Object.entries(safePatch).filter(([key]) => key in PERSISTABLE_BLOCK_FIELDS && key !== 'sort')
        ) as Partial<Omit<TemplateBlock, 'id' | 'templateId' | 'sort'>>
        const orderedIds = blocks.map((b) => b.id)
        await templatesRepo.editTemplateBlockAtomic(driver, id, persistPatch, state.selectedId, orderedIds)
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist block edit:', err)
        // Revert optimistic update (detail AND the list stats derived from it)
        set({ detail: state.detail, templates: state.templates })
      }
    }
  },

  removeBlock: async (id) => {
    const state = get()
    if (!state.selectedId || !state.detail) return

    // Renumber `sort` densely to 0..n-1 in memory, matching what
    // `reorderTemplateBlocks` below writes to the database. Leaving stale
    // sort values here would let the in-memory sequence diverge from the
    // persisted one — the Phase 4 move()-style memory/database divergence
    // (see D7 in the Phase 6 defect list / TASKS.md).
    const remaining = sortBlocks(state.detail.blocks.filter((b) => b.id !== id))
    const blocks = remaining.map((b, i) => ({ ...b, sort: i }))
    set({
      detail: { ...state.detail, blocks },
      templates: syncListStats(state.templates, state.selectedId, blocks),
    })

    // Persist to database if available. Delete + sort renumbering are
    // written as one atomic transaction (Phase 6 F1) so a failure partway
    // through can never leave SQLite with the block deleted but a stale
    // sort sequence.
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        await templatesRepo.removeTemplateBlockAtomic(
          driver,
          id,
          state.selectedId,
          blocks.map((b) => b.id)
        )
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Delete failed' }))
        console.error('Failed to persist block deletion:', err)
        // Revert optimistic update (detail AND the list stats derived from it)
        set({ detail: state.detail, templates: state.templates })
      }
    }
  },

  moveBlock: async (id, direction) => {
    const state = get()
    if (!state.selectedId || !state.detail) return

    // detail.blocks is kept in canonical order by editBlock, so moveBlockPure requires that
    const index = state.detail.blocks.findIndex((b) => b.id === id)
    if (index === -1) return

    await get().moveBlockTo(id, index + direction)
  },

  moveBlockTo: async (id, targetIndex) => {
    const state = get()
    if (!state.selectedId || !state.detail) return

    const index = state.detail.blocks.findIndex((b) => b.id === id)
    if (index === -1) return

    const moved = moveBlockToPure(state.detail.blocks, index, targetIndex)
    if (moved === state.detail.blocks) return // No-op at boundary

    // Stamp sort to match the final array position
    const blocks = sortBlocks(moved).map((b, i) => ({ ...b, sort: i }))
    // moveBlock never changes durations or block count, so totalMin/blockCount
    // cannot drift here — synced anyway to keep the invariant "list stats are
    // always derived from detail.blocks after any block mutation" explicit
    // and mutation-proof rather than relying on that being true today.
    set({
      detail: { ...state.detail, blocks },
      templates: syncListStats(state.templates, state.selectedId, blocks),
    })

    // Persist to database if available. Changed startMin values and the
    // sort renumbering are written as one atomic transaction (Phase 6 F1)
    // so a failure partway through can never leave SQLite with swapped
    // starts and a stale sort — see moveTemplateBlocksAtomic.
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        const templateId = state.selectedId
        // Persist only the startMin values that changed
        const changed = blocks
          .filter((b) => {
            const before = state.detail?.blocks.find((sb) => sb.id === b.id)
            return before !== undefined && before.startMin !== b.startMin
          })
          .map((b) => ({ id: b.id, startMin: b.startMin }))
        const orderedIds = blocks.map((b) => b.id)
        await templatesRepo.moveTemplateBlocksAtomic(driver, templateId, changed, orderedIds)
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Reorder failed' }))
        console.error('Failed to persist move:', err)
        // Revert optimistic update (detail AND the list stats derived from it)
        set({ detail: state.detail, templates: state.templates })
      }
    }
  },

  saveDayAsTemplate: async (day, name) => {
    set({ loading: true, error: null })

    if (!persistenceDriver) {
      set({ loading: false, error: 'No database connection' })
      return null
    }

    try {
      const driver = persistenceDriver
      const templateId = await templatesRepo.saveDayAsTemplate(driver, day, name)
      // Refresh the templates list. Unlike addBlock/editBlock/removeBlock,
      // this is a one-off action (not called per keystroke), and the repo
      // call above already inserted both the template row and its copied
      // blocks, so a full `listTemplates()` requery here gives the new
      // row's totalMin/blockCount correctly (D2) without a second source of
      // truth for the aggregate — a targeted `templateTotals()` derive isn't
      // even possible yet since `detail` for this new template hasn't been
      // loaded.
      const templates = await templatesRepo.listTemplates(driver)
      set({ templates, loading: false })
      // Select the newly created template
      await get().select(templateId)
      return templateId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ error: message, loading: false })
      console.error('Failed to save day as template:', err)
      return null
    }
  },

  duplicateTemplate: async (id) => {
    // Unlike saveDayAsTemplate, this deliberately does NOT touch `loading`.
    // saveDayAsTemplate is only ever invoked from the Today view's
    // SaveTemplateModal, where the `loading` branch of TemplatesView is
    // never on screen — but duplicateTemplate is invoked from a button
    // inside TemplatesView itself, which early-returns a full-page "Loading
    // templates…" screen whenever `loading` is true. Setting it here would
    // blank and remount the whole Templates page on every duplicate click.
    set({ error: null })

    // Duplicating requires the DB, same as saveDayAsTemplate — there's no
    // sensible in-memory-only duplication story since the new row needs a
    // real id to select into.
    if (!persistenceDriver) {
      set({ error: 'No database connection' })
      return null
    }

    try {
      const driver = persistenceDriver
      const newId = await templatesRepo.duplicateTemplate(driver, id)
      // Refresh the templates list and select the copy, same shape as
      // saveDayAsTemplate — block stats for the new row come from the
      // requery rather than a targeted derive.
      const templates = await templatesRepo.listTemplates(driver)
      set({ templates })
      await get().select(newId)
      return newId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ error: message })
      console.error('Failed to duplicate template:', err)
      return null
    }
  },
}))
