import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './app'
import { DEFAULT_ACCENT } from '../lib/accents'

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStore.setState({
      view: 'today',
      accent: DEFAULT_ACCENT,
      timerStyle: 'ring',
      repeatStyle: 'chip',
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
})
