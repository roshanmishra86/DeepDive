import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import * as ritualsRepo from '../db/repos/rituals'

export interface Ritual {
  id: number
  title: string
  done: boolean
}

/**
 * Today's ritual checklist in the sidebar. Hydrates from the database via
 * `ritual` / `ritual_log` tables on app mount. Toggle and add operations
 * persist to the database while updating state immediately for responsive UI.
 * In-memory fallback when driver is null allows `vite dev` to work without Tauri.
 */
interface RitualsState {
  rituals: Ritual[]
  toggle: (id: number) => void
  add: (title: string) => Promise<void>
  remove: (id: number) => Promise<void>
  hydrate: (driver: SqlDriver | null, day: string) => Promise<void>
}

let nextId = 4
let persistenceDriver: SqlDriver | null = null
let nextRemovalToken = 1
const removalTokens = new Map<number, number>()
// The calendar day the store last hydrated against. `toggle` must persist
// against this day, not whatever the machine's clock says "now" is — the two
// can disagree if the day is displayed via a different source than Date.now()
// (and the UTC-vs-local gap around local midnight makes recomputing it in
// `toggle` an outright bug; see the day-key note on `toDayKey`).
let hydratedDay: string | null = null

export const useRitualsStore = create<RitualsState>()((set) => ({
  rituals: [
    { id: 1, title: 'Morning pages', done: true },
    { id: 2, title: 'Phone in drawer', done: true },
    { id: 3, title: 'Shut down ritual', done: false },
  ],
  toggle: (id) => {
    set((s) => ({
      rituals: s.rituals.map((r) => (r.id === id ? { ...r, done: !r.done } : r)),
    }))
    // Fire-and-forget persistence when driver is available
    if (persistenceDriver && hydratedDay) {
      const driver = persistenceDriver
      const day = hydratedDay
      const state = useRitualsStore.getState()
      const ritual = state.rituals.find((r) => r.id === id)
      if (ritual) {
        ritualsRepo
          .toggleRitual(driver, day, id, ritual.done)
          .catch((err) => console.error('Failed to persist ritual toggle:', err))
      }
    }
  },
  add: async (title) => {
    if (persistenceDriver) {
      // Insert into the database first and use the real autoincrement id in
      // state. Inventing a local id here (as the old code did) can diverge
      // from `ritual.id` and later writes a foreign-key-violating or
      // wrong-row `ritual_log` entry.
      const driver = persistenceDriver
      try {
        const id = await ritualsRepo.addRitual(driver, title)
        set((s) => ({ rituals: [...s.rituals, { id, title, done: false }] }))
      } catch (err) {
        console.error('Failed to persist ritual:', err)
      }
      return
    }
    // In-memory fallback for vite dev mode (no driver).
    set((s) => {
      const ritual = { id: nextId++, title, done: false }
      return { rituals: [...s.rituals, ritual] }
    })
  },
  remove: async (id) => {
    const prior = useRitualsStore.getState().rituals
    const removedIndex = prior.findIndex((r) => r.id === id)
    const removed = prior[removedIndex]
    if (!removed) return
    const removalToken = nextRemovalToken++
    removalTokens.set(id, removalToken)
    // Optimistically drop the ritual from state.
    set((s) => ({ rituals: s.rituals.filter((r) => r.id !== id) }))

    if (persistenceDriver) {
      const driver = persistenceDriver
      try {
        // Soft delete — sets active=0, preserves ritual_log history. Never
        // deleteRitual, which would drop the FK-referenced log rows too.
        await ritualsRepo.deactivateRitual(driver, id)
      } catch (err) {
        console.error('Failed to persist ritual removal:', err)
        // Restore only this item. Restoring the whole `prior` snapshot would
        // resurrect independent changes (such as another ritual successfully
        // removed while this write was in flight). A newer removal of this
        // same item owns the current state, so an older failure must not undo
        // it either.
        if (removalTokens.get(id) !== removalToken) return
        set((state) => {
          if (state.rituals.some((r) => r.id === id)) return state
          const rituals = [...state.rituals]
          rituals.splice(Math.min(removedIndex, rituals.length), 0, removed)
          return { rituals }
        })
      }
    }
  },
  hydrate: async (driver, day) => {
    persistenceDriver = driver
    hydratedDay = day
    if (!driver) {
      // Keep in-memory defaults for vite dev mode
      return
    }

    try {
      const rituals = await ritualsRepo.listRitualsForDay(driver, day)
      set({ rituals })
      // Update nextId for future adds
      const maxId = Math.max(...rituals.map((r) => r.id), 3)
      nextId = maxId + 1
    } catch (err) {
      console.error('Failed to hydrate rituals store:', err)
    }
  },
}))
