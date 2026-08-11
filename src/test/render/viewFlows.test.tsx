// @vitest-environment happy-dom
/**
 * Render-level user-flow regression tests for the previously uncovered view
 * surfaces: ArchiveView states (loading / empty / populated / error),
 * LibraryView + TrackCard (render, transport, missing-file), the RightRail
 * pomodoro widget, and the SessionOverlay.
 *
 * Environment: happy-dom (measured ~13-21s startup per FILE on this mount,
 * versus ~113s/file for jsdom in Phase 2 — the reason the whole render
 * suite is consolidated into two files). `globalThis.IS_REACT_ACT_ENVIRONMENT`
 * is required by React 19 + @testing-library/react 16.
 *
 * Harness rules honoured here:
 * - fireEvent only (user-event's async timing is flaky under happy-dom on
 *   this mount).
 * - No vi.useFakeTimers (breaks RTL async utils). The timer store is driven
 *   with explicit args (`tick(nowMs)`) and direct store actions instead.
 * - Store-mutating interactions are wrapped in `await act(async ...)` and
 *   async appearances are awaited with `findBy*`.
 * - Every touched store singleton is reset in beforeEach with that store's
 *   own test-file merge-setState pattern (never `replace: true`).
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createTestDb } from '../nodeDriver'
import type { SqlDriver } from '../../db/driver'
import * as blocksRepo from '../../db/repos/blocks'
import { toDayKey } from '../../lib/time'
import { useArchiveStore } from '../../stores/archive'
import { useAppStore } from '../../stores/app'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore, injectAudioElementForTests } from '../../stores/player'
import { useTimerStore, FOCUS_SEC, POMODOROS_PER_BLOCK } from '../../stores/timer'
import { useTodayStore } from '../../stores/today'
import { useTasksStore } from '../../stores/tasks'
import { DEFAULT_ACCENT } from '../../lib/accents'
import { ArchiveView } from '../../components/views/ArchiveView'
import { LibraryView } from '../../components/views/LibraryView'
import { RightRail } from '../../components/chrome/RightRail'
import { SessionOverlay } from '../../components/chrome/SessionOverlay'

/**
 * ArchiveView hydrates through `openDatabase()` from src/db/index, which
 * returns null outside Tauri. The null-driver fallthrough renders
 * identically to the genuinely-empty archive but is a DIFFERENT code path
 * (Phase 10 lesson), so the empty/populated tests below mock openDatabase
 * to return a seeded node driver and thereby exercise the REAL query path
 * (hasAnyRecords, headlineStats, dayStatuses, dayRecord). The error test
 * makes the mocked openDatabase reject, landing in ArchiveView's own catch
 * (the same setState error contract TodayView/TodoView use).
 */
const dbMock = vi.hoisted(() => ({
  driver: null as SqlDriver | null,
  error: null as Error | null,
}))

vi.mock('../../db/index', () => ({
  openDatabase: async () => {
    if (dbMock.error) throw dbMock.error
    return dbMock.driver
  },
}))

function resetArchiveStore() {
  // Merge setState, never replace: true (archive.test.ts pattern).
  useArchiveStore.setState({
    year: new Date().getFullYear(),
    month0: new Date().getMonth(),
    statuses: {},
    selectedDay: null,
    record: null,
    headline: null,
    trend: [],
    hasRecords: false,
    hasDayRecords: false,
    loading: false,
    error: null,
  })
}

function resetAppStore() {
  useAppStore.setState({
    view: 'today',
    accent: DEFAULT_ACCENT,
    timerStyle: 'ring',
    repeatStyle: 'chip',
    settingsOpen: false,
    sessionOpen: false,
  })
}

function resetLibraryStore() {
  useLibraryStore.setState({
    tracks: [],
    loading: false,
    error: null,
    fadeInSec: 8,
    silenceDuringRest: true,
  })
}

function resetPlayerStore() {
  usePlayerStore.setState({
    trackId: null,
    trackName: null,
    trackMeta: null,
    playing: false,
    volume: 70,
    positionSec: 0,
    durationSec: 0,
    missing: false,
    restPaused: false,
    queue: [],
    queueIndex: -1,
    repeatMode: 'off',
  })
}

function resetTimerStore() {
  useTimerStore.setState({
    phase: 'focus',
    totalSec: FOCUS_SEC,
    remainingSec: FOCUS_SEC,
    running: false,
    endsAt: null,
    pomodorosDone: 0,
    pomodorosPerBlock: POMODOROS_PER_BLOCK,
    blockId: null,
    blockTitle: null,
    blockStartMin: null,
    blockDurationMin: null,
    blockQuiet: false,
    openSessionId: null,
  })
}

function resetTodayStore() {
  useTodayStore.setState({
    day: null,
    blocks: [],
    loading: false,
    error: null,
    shutdownMin: null,
    shutdownIsDefault: true,
  })
}

function resetTasksStore() {
  useTasksStore.setState({
    tasks: [],
    groupBy: 'matrix',
    loading: false,
    error: null,
  })
}

/**
 * Minimal HTMLAudioElement stand-in (same fake-element pattern as
 * src/stores/player.test.ts): records the properties the player store
 * writes and lets tests fire the media events the store listens to.
 */
type Listener = () => void

class FakeAudioElement {
  src = ''
  loop = false
  volume = 1
  currentTime = 0
  duration = 0
  paused = true
  preload = ''
  error: { code: number } | null = null
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn)
  }

  emit(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn()
  }

  play(): Promise<void> {
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    this.paused = true
  }
}

describe('ArchiveView states', () => {
  beforeEach(() => {
    resetArchiveStore()
    resetAppStore()
    dbMock.driver = null
    dbMock.error = null
  })

  it('loading: initial store state (loading true, headline null) renders "Loading archive…"', () => {
    // The store's true initial state has loading: true (the view always
    // hydrates on mount); the shared reset pattern zeroes it, so restore it.
    useArchiveStore.setState({ loading: true, headline: null })
    render(<ArchiveView />)
    // Assert synchronously after render: the hydrate effect's first await
    // has not resolved yet, so the loading branch is still on screen.
    expect(screen.getByText('Loading archive…')).toBeDefined()
  })

  it('empty: a fresh empty database renders "No recorded days yet" via the real hasAnyRecords query path', async () => {
    // NOT the null-driver fallthrough: openDatabase returns a real, empty
    // node driver, so hydrate runs hasAnyRecords/headlineStats/dayStatuses
    // against real SQLite and they genuinely return nothing.
    dbMock.driver = createTestDb().driver
    render(<ArchiveView />)

    expect(await screen.findByText('No recorded days yet')).toBeDefined()
    expect(useArchiveStore.getState().hasRecords).toBe(false)
    expect(useArchiveStore.getState().loading).toBe(false)
  })

  it('populated: a completed block today renders the non-zero headline and today\'s calendar cell', async () => {
    const driver = createTestDb().driver
    const today = toDayKey(new Date())
    const id = await blocksRepo.createBlock(driver, {
      day: today,
      title: 'Deep work',
      kind: 'deep',
      startMin: 540,
      durationMin: 90,
    })
    await blocksRepo.setBlockCompleted(driver, id, true)
    dbMock.driver = driver

    render(<ArchiveView />)

    // Headline stats region: the blocks-done figure reads 1, next to its label.
    const blocksDoneLabel = await screen.findByText('Blocks done')
    const stat = blocksDoneLabel.parentElement!
    expect(stat.querySelector('.arc-stat-value')!.textContent).toBe('1')

    // Calendar: today's cell has an accessible label naming the date and
    // its all-blocks-done status.
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    const cell = screen.getByRole('button', { name: `${dateStr} — All blocks done` })
    expect(cell).toBeDefined()
  })

  it('error: a failing openDatabase renders the error branch (sibling-view error copy)', async () => {
    dbMock.error = new Error('db open failed')
    render(<ArchiveView />)

    // ArchiveView's catch surfaces String(err) through the store's error
    // contract; the branch renders "Error: <message>" like Today/Week.
    expect(await screen.findByText(/Error: Error: db open failed/)).toBeDefined()
  })
})

describe('LibraryView / TrackCard', () => {
  let driver: SqlDriver
  let fake: FakeAudioElement

  beforeEach(async () => {
    driver = createTestDb().driver
    resetLibraryStore()
    resetPlayerStore()
    fake = new FakeAudioElement()
    injectAudioElementForTests(fake as unknown as HTMLAudioElement)
    // Clear any driver reference leaked by a previous test (player.test.ts
    // pattern), then hydrate the library against the fresh driver and
    // register one track through the store's real register path.
    await usePlayerStore.getState().hydrate(null)
    await useLibraryStore.getState().hydrate(null)
    await useLibraryStore.getState().hydrate(driver)
    const id = await useLibraryStore.getState().registerTrack('/music/rain.mp3', 2700)
    expect(id).not.toBeNull()
  })

  afterEach(() => {
    injectAudioElementForTests(null)
  })

  it('renders the registered track card by name', () => {
    render(<LibraryView />)
    expect(screen.getByText('rain')).toBeDefined()
    // The card's main play control is a button with an accessible name.
    expect(screen.getByRole('button', { name: 'Play rain' })).toBeDefined()
  })

  it('transport: clicking the card plays (store playing, "Now playing"), clicking again pauses', async () => {
    render(<LibraryView />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play rain' }))
    })

    expect(usePlayerStore.getState().playing).toBe(true)
    // hydrate also seeds the built-ins, so 'rain' is not necessarily
    // tracks[0] — find it by displayName instead of assuming index 0.
    const rain = useLibraryStore.getState().tracks.find((t) => t.displayName === 'rain')
    expect(usePlayerStore.getState().trackId).toBe(rain?.id)
    expect(await screen.findByText('Now playing')).toBeDefined()

    // The now-playing card's main control becomes a pause button.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pause rain' }))
    })

    expect(usePlayerStore.getState().playing).toBe(false)
    expect(screen.queryByText('Now playing')).toBeNull()
  })

  it('missing: the element error event flips the card to "File not found"', async () => {
    render(<LibraryView />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play rain' }))
    })
    expect(usePlayerStore.getState().playing).toBe(true)

    // Same drive as player.test.ts: a genuine source failure surfaces via
    // the element's error event.
    await act(async () => {
      fake.emit('error')
    })

    expect(usePlayerStore.getState().missing).toBe(true)
    expect(await screen.findByText('File not found')).toBeDefined()
  })
})

describe('RightRail pomodoro widget', () => {
  beforeEach(async () => {
    resetTimerStore()
    resetTodayStore()
    resetTasksStore()
    resetAppStore()
    // No driver needed for the widget; hydrate(null) also clears any leaked
    // session-run token (timer.test.ts pattern).
    await useTimerStore.getState().hydrate(null)
    await useTasksStore.getState().hydrate(null)
  })

  it('fresh state: "1 / 3" counter, 25:00 clock, a Start button, and the empty upcoming list', () => {
    render(<RightRail />)

    expect(screen.getByTestId('pomodoro-count').textContent).toBe('1 / 3')
    expect(screen.getByTestId('timer-clock').textContent).toBe('25:00')
    expect(screen.getByRole('button', { name: 'Start' })).toBeDefined()

    // Tasks store is empty: the rail renders its empty state.
    expect(screen.getByText('No incomplete tasks')).toBeDefined()
  })

  it('running state: clock reflects remaining, button reads "Pause"; clicking it pauses to "Continue"', async () => {
    await act(async () => {
      await useTimerStore.getState().start(null)
    })
    // Drive the clock deterministically (no fake timers allowed): mid-cycle
    // state with a known remaining time and a matching wall-clock deadline,
    // so pause() recomputes a remaining that is still < totalSec.
    const remainingSec = 1490
    useTimerStore.setState({
      remainingSec,
      endsAt: Date.now() + remainingSec * 1000,
    })

    render(<RightRail />)

    expect(screen.getByTestId('timer-clock').textContent).toBe('24:50')
    const pauseBtn = screen.getByRole('button', { name: 'Pause' })

    await act(async () => {
      fireEvent.click(pauseBtn)
    })

    expect(useTimerStore.getState().running).toBe(false)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDefined()
  })

  it('a completed pomodoro advances the counter to "2 / 3"', async () => {
    await act(async () => {
      await useTimerStore.getState().start(null)
    })
    const endsAt = useTimerStore.getState().endsAt!

    render(<RightRail />)
    expect(screen.getByTestId('pomodoro-count').textContent).toBe('1 / 3')

    // Drive the phase to its deadline with an explicit timestamp.
    await act(async () => {
      await useTimerStore.getState().tick(endsAt)
    })

    expect(useTimerStore.getState().pomodorosDone).toBe(1)
    expect(screen.getByTestId('pomodoro-count').textContent).toBe('2 / 3')
  })
})

describe('SessionOverlay', () => {
  beforeEach(async () => {
    resetTimerStore()
    resetTodayStore()
    resetAppStore()
    resetLibraryStore()
    resetPlayerStore()
    await useTimerStore.getState().hydrate(null)
  })

  it('renders the focus phase, the session tag, and Exit session — which closes the session', async () => {
    useAppStore.getState().enterSession()
    expect(useAppStore.getState().sessionOpen).toBe(true)

    render(<SessionOverlay />)

    expect(screen.getByText('Focus')).toBeDefined()
    expect(screen.getByText(/session 1 of 3/)).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit session' }))
    })
    expect(useAppStore.getState().sessionOpen).toBe(false)
  })

  it('after rest() the phase label reads "Rest"', async () => {
    useAppStore.getState().enterSession()
    render(<SessionOverlay />)

    await act(async () => {
      await useTimerStore.getState().rest()
    })

    expect(screen.getByText('Rest')).toBeDefined()
    expect(screen.queryByText('Focus')).toBeNull()
  })
})
