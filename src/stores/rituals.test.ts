import { describe, it, expect, beforeEach } from 'vitest'
import { useRitualsStore } from './rituals'

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
})
