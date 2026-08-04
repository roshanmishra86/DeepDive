import { create } from 'zustand'

export interface Ritual {
  id: number
  title: string
  done: boolean
}

/**
 * Today's ritual checklist in the sidebar. In-memory until Phase 3 wires the
 * `ritual` / `ritual_log` tables; seeded with the mockup's three rituals.
 */
interface RitualsState {
  rituals: Ritual[]
  toggle: (id: number) => void
  add: (title: string) => void
}

let nextId = 4

export const useRitualsStore = create<RitualsState>()((set) => ({
  rituals: [
    { id: 1, title: 'Morning pages', done: true },
    { id: 2, title: 'Phone in drawer', done: true },
    { id: 3, title: 'Shut down ritual', done: false },
  ],
  toggle: (id) =>
    set((s) => ({
      rituals: s.rituals.map((r) => (r.id === id ? { ...r, done: !r.done } : r)),
    })),
  add: (title) =>
    set((s) => ({
      rituals: [...s.rituals, { id: nextId++, title, done: false }],
    })),
}))
