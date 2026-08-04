import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useRitualsStore } from './rituals'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'

describe('useRitualsStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useRitualsStore.setState({
      rituals: [
        { id: 1, title: 'Morning pages', done: true },
        { id: 2, title: 'Phone in drawer', done: true },
        { id: 3, title: 'Shut down ritual', done: false },
      ],
    })
  })

  describe('initial state', () => {
    it('has three initial rituals from the mockup', () => {
      const state = useRitualsStore.getState()
      expect(state.rituals).toHaveLength(3)
    })

    it('has correct initial ritual data', () => {
      const { rituals } = useRitualsStore.getState()
      expect(rituals[0]).toEqual({ id: 1, title: 'Morning pages', done: true })
      expect(rituals[1]).toEqual({ id: 2, title: 'Phone in drawer', done: true })
      expect(rituals[2]).toEqual({ id: 3, title: 'Shut down ritual', done: false })
    })
  })

  describe('add', () => {
    it('adds a new ritual with done=false', () => {
      useRitualsStore.getState().add('New ritual')
      const rituals = useRitualsStore.getState().rituals
      expect(rituals).toHaveLength(4)
      expect(rituals[3]).toMatchObject({ title: 'New ritual', done: false })
    })

    it('assigns a unique id to each new ritual', () => {
      useRitualsStore.getState().add('First ritual')
      const firstId = useRitualsStore.getState().rituals[3].id
      useRitualsStore.getState().add('Second ritual')
      const secondId = useRitualsStore.getState().rituals[4].id
      expect(firstId).not.toBe(secondId)
      expect(secondId).toBe(firstId + 1)
    })

    it('increments id counter with each add', () => {
      useRitualsStore.getState().add('Ritual 1')
      useRitualsStore.getState().add('Ritual 2')
      useRitualsStore.getState().add('Ritual 3')
      const rituals = useRitualsStore.getState().rituals
      expect(rituals[3].id).toBeLessThan(rituals[4].id)
      expect(rituals[4].id).toBeLessThan(rituals[5].id)
    })

    it('adds ritual with whitespace-only title (no trimming)', () => {
      // NOTE: This test documents that add() does NOT trim or reject empty titles.
      // The Sidebar component guards against this, but the store itself doesn't validate.
      useRitualsStore.getState().add('   ')
      const rituals = useRitualsStore.getState().rituals
      expect(rituals[3].title).toBe('   ')
    })

    it('adds ritual with empty string title (no validation)', () => {
      // NOTE: This documents that the store accepts empty titles.
      // The Sidebar guards it, but this is worth flagging.
      useRitualsStore.getState().add('')
      const rituals = useRitualsStore.getState().rituals
      expect(rituals[3].title).toBe('')
    })

    it('can add multiple rituals in sequence', () => {
      useRitualsStore.getState().add('Ritual A')
      useRitualsStore.getState().add('Ritual B')
      useRitualsStore.getState().add('Ritual C')
      const rituals = useRitualsStore.getState().rituals
      expect(rituals).toHaveLength(6)
      expect(rituals[3].title).toBe('Ritual A')
      expect(rituals[4].title).toBe('Ritual B')
      expect(rituals[5].title).toBe('Ritual C')
    })
  })

  describe('toggle', () => {
    it('toggles done state from true to false', () => {
      useRitualsStore.getState().toggle(1)
      const ritual = useRitualsStore.getState().rituals.find((r) => r.id === 1)
      expect(ritual?.done).toBe(false)
    })

    it('toggles done state from false to true', () => {
      useRitualsStore.getState().toggle(3)
      const ritual = useRitualsStore.getState().rituals.find((r) => r.id === 3)
      expect(ritual?.done).toBe(true)
    })

    it('can toggle the same ritual multiple times', () => {
      useRitualsStore.getState().toggle(1)
      expect(useRitualsStore.getState().rituals[0].done).toBe(false)
      useRitualsStore.getState().toggle(1)
      expect(useRitualsStore.getState().rituals[0].done).toBe(true)
      useRitualsStore.getState().toggle(1)
      expect(useRitualsStore.getState().rituals[0].done).toBe(false)
    })

    it('toggles a newly added ritual', () => {
      useRitualsStore.getState().add('New ritual')
      const newId = useRitualsStore.getState().rituals[3].id
      expect(useRitualsStore.getState().rituals[3].done).toBe(false)
      useRitualsStore.getState().toggle(newId)
      const toggled = useRitualsStore.getState().rituals.find((r) => r.id === newId)
      expect(toggled?.done).toBe(true)
    })

    it('only toggles the targeted ritual', () => {
      useRitualsStore.getState().toggle(1)
      const state = useRitualsStore.getState()
      expect(state.rituals[0].done).toBe(false) // toggled
      expect(state.rituals[1].done).toBe(true) // unchanged
      expect(state.rituals[2].done).toBe(false) // unchanged
    })

    it('does not affect ritual title or id when toggling', () => {
      const originalRitual = useRitualsStore.getState().rituals[0]
      useRitualsStore.getState().toggle(1)
      const toggled = useRitualsStore.getState().rituals[0]
      expect(toggled.id).toBe(originalRitual.id)
      expect(toggled.title).toBe(originalRitual.title)
    })
  })

  describe('state persistence', () => {
    it('maintains added rituals after adding', () => {
      useRitualsStore.getState().add('Persistent ritual')
      const state1 = useRitualsStore.getState()
      expect(state1.rituals).toHaveLength(4)
      // Get state again
      const state2 = useRitualsStore.getState()
      expect(state2.rituals).toHaveLength(4)
      expect(state2.rituals[3].title).toBe('Persistent ritual')
    })

    it('maintains toggled state after toggling', () => {
      useRitualsStore.getState().toggle(3)
      const state1 = useRitualsStore.getState()
      expect(state1.rituals[2].done).toBe(true)
      // Verify it persists
      const state2 = useRitualsStore.getState()
      expect(state2.rituals[2].done).toBe(true)
    })
  })

  describe('database hydration', () => {
    let driver: SqlDriver

    beforeEach(() => {
      const db = createTestDb()
      driver = db.driver
      useRitualsStore.setState({
        rituals: [
          { id: 1, title: 'Morning pages', done: true },
          { id: 2, title: 'Phone in drawer', done: true },
          { id: 3, title: 'Shut down ritual', done: false },
        ],
      })
    })

    afterEach(async () => {
      // The store keeps its persistence driver / hydrated day in module-level
      // state (not in the zustand store itself, so `setState` in other
      // `beforeEach`s can't reset it). Explicitly hydrate back to a null
      // driver so later tests in this file — or a re-ordered run — don't
      // silently pick up a driver instance from a previous test.
      await useRitualsStore.getState().hydrate(null, '2026-01-01')
    })

    it('hydrates rituals from database for a day', async () => {
      const day = '2026-08-03'
      await useRitualsStore.getState().hydrate(driver, day)
      const state = useRitualsStore.getState()
      expect(state.rituals).toHaveLength(3)
      expect(state.rituals[0].title).toBe('Morning pages')
      expect(state.rituals[1].title).toBe('Phone in drawer')
      expect(state.rituals[2].title).toBe('Shut down ritual')
    })

    it('hydrate with null driver keeps in-memory defaults', async () => {
      const day = '2026-08-03'
      await useRitualsStore.getState().hydrate(null, day)
      const state = useRitualsStore.getState()
      // Should keep the initial in-memory values
      expect(state.rituals).toHaveLength(3)
      expect(state.rituals[0].title).toBe('Morning pages')
    })

    it('toggle persists to database', async () => {
      const day = '2026-08-03'
      await useRitualsStore.getState().hydrate(driver, day)

      // Hydrated rituals start with done=false (no log entry), toggle makes them true
      useRitualsStore.getState().toggle(1)
      const state = useRitualsStore.getState()
      expect(state.rituals[0].done).toBe(true)

      // Give fire-and-forget time to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify in database
      const rows = await driver.select<{ done: number }>(
        'SELECT done FROM ritual_log WHERE day = ? AND ritual_id = ?',
        [day, 1]
      )
      expect(rows[0]?.done).toBe(1)
    })

    it('toggle updates existing log row (UPSERT)', async () => {
      const day = '2026-08-03'
      await useRitualsStore.getState().hydrate(driver, day)

      // First toggle
      useRitualsStore.getState().toggle(1)
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Second toggle
      useRitualsStore.getState().toggle(1)
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify no duplicates in database
      const rows = await driver.select<{ id: string }>(
        'SELECT day FROM ritual_log WHERE day = ? AND ritual_id = ?',
        [day, 1]
      )
      expect(rows).toHaveLength(1)
    })

    it('add persists to database', async () => {
      await useRitualsStore.getState().hydrate(driver, '2026-08-03')
      const initialCount = useRitualsStore.getState().rituals.length

      await useRitualsStore.getState().add('New ritual')

      // Verify in database
      const rows = await driver.select<{ title: string }>(
        'SELECT title FROM ritual WHERE title = ?',
        ['New ritual']
      )
      expect(rows[0]?.title).toBe('New ritual')
      expect(useRitualsStore.getState().rituals).toHaveLength(initialCount + 1)
    })

    // --- W2 regression -----------------------------------------------------
    // The old `add` invented its own id via a local `nextId++` counter that
    // is completely independent of SQLite's autoincrement sequence on
    // `ritual`. Assert against the real `ritual` table, not the store's own
    // state — a bug that mirrors the store's (wrong) id back at itself would
    // pass a same-state-only assertion.
    it('add: the id held in store state is the real database id, not an invented one', async () => {
      await useRitualsStore.getState().hydrate(driver, '2026-08-03')

      // Advance SQLite's autoincrement sequence well past what a naive local
      // counter (seeded from the 3 hydrated rituals, so it would predict 4)
      // could ever guess — inserting directly via the driver, bypassing the
      // store, mirrors another session or a deleted-then-reinserted row
      // having pushed the real sequence ahead.
      await driver.execute('INSERT INTO ritual (title, active, sort) VALUES (?, 1, 10)', ['x1'])
      await driver.execute('INSERT INTO ritual (title, active, sort) VALUES (?, 1, 11)', ['x2'])
      await driver.execute('INSERT INTO ritual (title, active, sort) VALUES (?, 1, 12)', ['x3'])

      await useRitualsStore.getState().add('Reconciled ritual')

      const stateRitual = useRitualsStore
        .getState()
        .rituals.find((r) => r.title === 'Reconciled ritual')
      expect(stateRitual).toBeDefined()

      const dbRows = await driver.select<{ id: number; title: string }>(
        'SELECT id, title FROM ritual WHERE title = ?',
        ['Reconciled ritual']
      )
      expect(dbRows).toHaveLength(1)
      // The id in state must be the actual autoincrement id SQLite assigned,
      // not a value derived from the store's own bookkeeping.
      expect(stateRitual?.id).toBe(dbRows[0].id)
    })

    it('toggle after add: writes ritual_log against the real ritual_id, and re-toggling updates in place', async () => {
      const day = '2026-08-03'
      await useRitualsStore.getState().hydrate(driver, day)
      // Advance the DB sequence past what a local counter would predict, and
      // make sure that predicted id already belongs to a different ritual —
      // so a local-id bug would misfile the log against the wrong row
      // instead of merely failing a foreign key check.
      await driver.execute('INSERT INTO ritual (title, active, sort) VALUES (?, 1, 10)', ['x1'])
      await driver.execute('INSERT INTO ritual (title, active, sort) VALUES (?, 1, 11)', ['x2'])
      await driver.execute('INSERT INTO ritual (title, active, sort) VALUES (?, 1, 12)', ['x3'])

      await useRitualsStore.getState().add('Session ritual')
      const added = useRitualsStore
        .getState()
        .rituals.find((r) => r.title === 'Session ritual')
      expect(added).toBeDefined()
      const dbId = added!.id

      // The id the store thinks "Session ritual" has must actually belong to
      // "Session ritual" in the ritual table — not to one of the x1/x2/x3
      // rows a locally-invented id would collide with.
      const ownerRow = await driver.select<{ title: string }>(
        'SELECT title FROM ritual WHERE id = ?',
        [dbId]
      )
      expect(ownerRow[0]?.title).toBe('Session ritual')

      // Toggling a ritual added in the same session must not violate the
      // ritual_log -> ritual foreign key, and must log against the real id.
      useRitualsStore.getState().toggle(dbId)
      await new Promise((resolve) => setTimeout(resolve, 100))

      let rows = await driver.select<{ ritual_id: number; day: string; done: number }>(
        'SELECT ritual_id, day, done FROM ritual_log WHERE ritual_id = ?',
        [dbId]
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].day).toBe(day)
      expect(rows[0].done).toBe(1)

      // Toggle twice more: back to false, then true again — must update the
      // same row, not duplicate it.
      useRitualsStore.getState().toggle(dbId)
      await new Promise((resolve) => setTimeout(resolve, 100))
      useRitualsStore.getState().toggle(dbId)
      await new Promise((resolve) => setTimeout(resolve, 100))

      rows = await driver.select<{ ritual_id: number; day: string; done: number }>(
        'SELECT ritual_id, day, done FROM ritual_log WHERE ritual_id = ?',
        [dbId]
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].done).toBe(1)
    })

    // --- W3 regression -----------------------------------------------------
    // `toggle` must persist against the day the store hydrated with, not a
    // freshly-recomputed "now". Hydrate with a day far from the real
    // machine date and confirm the write lands on the hydrated day.
    it('toggle persists against the hydrated day, not the machine clock', async () => {
      const hydratedDay = '2026-03-12'
      await useRitualsStore.getState().hydrate(driver, hydratedDay)

      useRitualsStore.getState().toggle(1)
      await new Promise((resolve) => setTimeout(resolve, 100))

      const rows = await driver.select<{ day: string }>(
        'SELECT day FROM ritual_log WHERE ritual_id = ?',
        [1]
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].day).toBe(hydratedDay)

      // And nothing was written against today's real UTC/local date instead.
      const todayKey = new Date().toISOString().split('T')[0]
      if (todayKey !== hydratedDay) {
        const wrongDayRows = await driver.select<{ day: string }>(
          'SELECT day FROM ritual_log WHERE ritual_id = ? AND day = ?',
          [1, todayKey]
        )
        expect(wrongDayRows).toHaveLength(0)
      }
    })
  })
})
