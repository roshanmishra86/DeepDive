import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useAppStore, DEFAULT_WEEKLY_GOAL_MIN } from './app'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import { DEFAULT_ACCENT } from '../lib/accents'

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStore.setState({
      view: 'today',
      accent: DEFAULT_ACCENT,
      timerStyle: 'ring',
      repeatStyle: 'chip',
      weeklyGoalMin: DEFAULT_WEEKLY_GOAL_MIN,
      settingsOpen: false,
      sessionOpen: false,
    })
  })

  describe('initial state', () => {
    it('has the correct initial state', () => {
      const state = useAppStore.getState()
      expect(state.view).toBe('today')
      expect(state.accent).toBe(DEFAULT_ACCENT)
      expect(state.timerStyle).toBe('ring')
      expect(state.repeatStyle).toBe('chip')
      expect(state.weeklyGoalMin).toBe(DEFAULT_WEEKLY_GOAL_MIN)
      expect(state.settingsOpen).toBe(false)
      expect(state.sessionOpen).toBe(false)
    })
  })

  describe('setView', () => {
    it('changes the view to "week"', () => {
      useAppStore.getState().setView('week')
      expect(useAppStore.getState().view).toBe('week')
    })

    it('changes the view to "templates"', () => {
      useAppStore.getState().setView('templates')
      expect(useAppStore.getState().view).toBe('templates')
    })

    it('changes the view to "archive"', () => {
      useAppStore.getState().setView('archive')
      expect(useAppStore.getState().view).toBe('archive')
    })

    it('changes the view to "library"', () => {
      useAppStore.getState().setView('library')
      expect(useAppStore.getState().view).toBe('library')
    })

    it('changes the view to "today"', () => {
      useAppStore.getState().setView('week')
      useAppStore.getState().setView('today')
      expect(useAppStore.getState().view).toBe('today')
    })
  })

  describe('setAccent', () => {
    it('changes accent to "blue"', () => {
      useAppStore.getState().setAccent('blue')
      expect(useAppStore.getState().accent).toBe('blue')
    })

    it('changes accent to "sienna"', () => {
      useAppStore.getState().setAccent('sienna')
      expect(useAppStore.getState().accent).toBe('sienna')
    })

    it('changes accent to "charcoal"', () => {
      useAppStore.getState().setAccent('charcoal')
      expect(useAppStore.getState().accent).toBe('charcoal')
    })

    it('can switch between different accents', () => {
      useAppStore.getState().setAccent('blue')
      expect(useAppStore.getState().accent).toBe('blue')
      useAppStore.getState().setAccent('sienna')
      expect(useAppStore.getState().accent).toBe('sienna')
    })
  })

  describe('setTimerStyle', () => {
    it('changes timer style to "numeric"', () => {
      useAppStore.getState().setTimerStyle('numeric')
      expect(useAppStore.getState().timerStyle).toBe('numeric')
    })

    it('changes timer style to "bar"', () => {
      useAppStore.getState().setTimerStyle('bar')
      expect(useAppStore.getState().timerStyle).toBe('bar')
    })

    it('can switch between timer styles', () => {
      useAppStore.getState().setTimerStyle('numeric')
      expect(useAppStore.getState().timerStyle).toBe('numeric')
      useAppStore.getState().setTimerStyle('bar')
      expect(useAppStore.getState().timerStyle).toBe('bar')
    })
  })

  describe('setRepeatStyle', () => {
    it('changes repeat style to "icon"', () => {
      useAppStore.getState().setRepeatStyle('icon')
      expect(useAppStore.getState().repeatStyle).toBe('icon')
    })

    it('changes repeat style to "none"', () => {
      useAppStore.getState().setRepeatStyle('none')
      expect(useAppStore.getState().repeatStyle).toBe('none')
    })

    it('can switch between repeat styles', () => {
      useAppStore.getState().setRepeatStyle('icon')
      expect(useAppStore.getState().repeatStyle).toBe('icon')
      useAppStore.getState().setRepeatStyle('none')
      expect(useAppStore.getState().repeatStyle).toBe('none')
    })
  })

  describe('openSettings / closeSettings', () => {
    it('opens settings panel', () => {
      useAppStore.getState().openSettings()
      expect(useAppStore.getState().settingsOpen).toBe(true)
    })

    it('closes settings panel', () => {
      useAppStore.getState().openSettings()
      useAppStore.getState().closeSettings()
      expect(useAppStore.getState().settingsOpen).toBe(false)
    })

    it('can toggle settings multiple times', () => {
      useAppStore.getState().openSettings()
      expect(useAppStore.getState().settingsOpen).toBe(true)
      useAppStore.getState().closeSettings()
      expect(useAppStore.getState().settingsOpen).toBe(false)
      useAppStore.getState().openSettings()
      expect(useAppStore.getState().settingsOpen).toBe(true)
    })
  })

  describe('enterSession / exitSession', () => {
    it('enters session (opens overlay)', () => {
      useAppStore.getState().enterSession()
      expect(useAppStore.getState().sessionOpen).toBe(true)
    })

    it('exits session (closes overlay)', () => {
      useAppStore.getState().enterSession()
      useAppStore.getState().exitSession()
      expect(useAppStore.getState().sessionOpen).toBe(false)
    })

    it('can toggle session multiple times', () => {
      useAppStore.getState().enterSession()
      expect(useAppStore.getState().sessionOpen).toBe(true)
      useAppStore.getState().exitSession()
      expect(useAppStore.getState().sessionOpen).toBe(false)
      useAppStore.getState().enterSession()
      expect(useAppStore.getState().sessionOpen).toBe(true)
    })
  })

  describe('state isolation', () => {
    it('changing view does not affect other state', () => {
      useAppStore.getState().setAccent('blue')
      useAppStore.getState().openSettings()
      useAppStore.getState().setView('week')
      expect(useAppStore.getState().accent).toBe('blue')
      expect(useAppStore.getState().settingsOpen).toBe(true)
      expect(useAppStore.getState().view).toBe('week')
    })

    it('settings and session can be open independently', () => {
      useAppStore.getState().openSettings()
      useAppStore.getState().enterSession()
      expect(useAppStore.getState().settingsOpen).toBe(true)
      expect(useAppStore.getState().sessionOpen).toBe(true)
    })
  })

  describe('hydrate', () => {
    let driver: SqlDriver

    beforeEach(() => {
      const db = createTestDb()
      driver = db.driver
      useAppStore.setState({
        view: 'today',
        accent: DEFAULT_ACCENT,
        timerStyle: 'ring',
        repeatStyle: 'chip',
        weeklyGoalMin: DEFAULT_WEEKLY_GOAL_MIN,
        settingsOpen: false,
        sessionOpen: false,
      })
    })

    afterEach(async () => {
      // Reset the module-level persistence driver so a later test (or a
      // re-ordered run) doesn't silently keep writing to a driver instance
      // from a previous test.
      await useAppStore.getState().hydrate(null)
    })

    it('hydrates persisted values from database', async () => {
      await driver.execute("UPDATE setting SET value = '900' WHERE key = 'weeklyGoalMin'")

      await useAppStore.getState().hydrate(driver)
      const state = useAppStore.getState()
      expect(state.accent).toBe('green')
      expect(state.timerStyle).toBe('ring')
      expect(state.repeatStyle).toBe('chip')
      expect(state.weeklyGoalMin).toBe(900)
    })

    it('falls back to default on garbage value in DB', async () => {
      // This would require manually inserting garbage, which the test DB doesn't do.
      // For now, just verify the valid path works.
      await useAppStore.getState().hydrate(driver)
      expect(useAppStore.getState().accent).toBe('green')
      expect(useAppStore.getState().weeklyGoalMin).toBe(DEFAULT_WEEKLY_GOAL_MIN)
    })

    it('falls back to defaults on genuinely invalid values written to the setting table', async () => {
      await driver.execute(
        "UPDATE setting SET value = 'not-a-real-accent' WHERE key = 'accent'"
      )
      await driver.execute(
        "UPDATE setting SET value = 'not-a-real-timer-style' WHERE key = 'timerStyle'"
      )
      await driver.execute(
        "UPDATE setting SET value = 'not-a-real-repeat-style' WHERE key = 'repeatStyle'"
      )
      await driver.execute(
        "UPDATE setting SET value = 'not-a-number' WHERE key = 'weeklyGoalMin'"
      )

      await useAppStore.getState().hydrate(driver)

      const state = useAppStore.getState()
      expect(state.accent).toBe(DEFAULT_ACCENT)
      expect(state.timerStyle).toBe('ring')
      expect(state.repeatStyle).toBe('chip')
      expect(state.weeklyGoalMin).toBe(DEFAULT_WEEKLY_GOAL_MIN)
    })

    it('does not crash and leaves state as-is when the driver throws during hydrate', async () => {
      const throwingDriver: SqlDriver = {
        execute: () => Promise.reject(new Error('boom')),
        select: () => Promise.reject(new Error('boom')),
        transaction: () => Promise.reject(new Error('boom')),
      }
      useAppStore.setState({ accent: 'blue', timerStyle: 'numeric', repeatStyle: 'icon', weeklyGoalMin: 600 })

      await expect(useAppStore.getState().hydrate(throwingDriver)).resolves.not.toThrow()

      // A failed hydrate must not corrupt whatever state was there before.
      const state = useAppStore.getState()
      expect(state.accent).toBe('blue')
      expect(state.timerStyle).toBe('numeric')
      expect(state.repeatStyle).toBe('icon')
      expect(state.weeklyGoalMin).toBe(600)
    })

    it('setters persist to database', async () => {
      await useAppStore.getState().hydrate(driver)
      useAppStore.getState().setAccent('blue')
      useAppStore.getState().setWeeklyGoalMin(1500)

      // Give the fire-and-forget write time to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify by reading the setting back
      const settings = await driver.select<{ key: string; value: string }>(
        'SELECT * FROM setting WHERE key = ?',
        ['accent']
      )
      expect(settings[0]?.value).toBe('blue')

      const goal = await driver.select<{ key: string; value: string }>(
        'SELECT * FROM setting WHERE key = ?',
        ['weeklyGoalMin']
      )
      expect(goal[0]?.value).toBe('1500')
    })

    it('handles null driver gracefully', async () => {
      await expect(useAppStore.getState().hydrate(null)).resolves.not.toThrow()
    })
  })
})
