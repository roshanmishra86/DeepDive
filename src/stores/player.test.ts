import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import type { Track } from '../db/types'
import * as settingsRepo from '../db/repos/settings'
import { usePlayerStore, injectAudioElementForTests } from './player'
import { useLibraryStore } from './library'

type Listener = () => void

/**
 * Minimal HTMLAudioElement stand-in for the node test environment, which has
 * no `Audio` constructor. Records the properties the player store writes and
 * lets tests fire the media events the store listens to.
 */
class FakeAudioElement {
  src = ''
  loop = false
  volume = 1
  currentTime = 0
  duration = 0
  paused = true
  preload = ''
  playRejects = false
  playRejectName = 'NotSupportedError'
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
    // A real rejection is a DOMException whose `name` carries the cause
    // (NotAllowedError = autoplay policy, NotSupportedError = bad source).
    if (this.playRejects) {
      return Promise.reject(new DOMException('play failed', this.playRejectName))
    }
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    this.paused = true
  }
}

function makeTrack(id: number, overrides: Partial<Track> = {}): Track {
  return {
    id,
    path: `/music/track-${id}.mp3`,
    displayName: `track-${id}`,
    category: 'other',
    durationSec: 3600,
    ...overrides,
  }
}

function resetPlayerStore() {
  // Merge setState, never replace: true (which would drop the actions).
  usePlayerStore.setState({
    trackId: null,
    trackName: null,
    trackMeta: null,
    playing: false,
    volume: 70,
    positionSec: 0,
    durationSec: 0,
    missing: false,
  })
}

function resetLibraryStore() {
  useLibraryStore.setState({
    tracks: [],
    loading: false,
    error: null,
    fadeInSec: 8,
    silenceDuringRest: true,
    loopUntilBlockEnd: true,
  })
}

describe('player store', () => {
  let driver: SqlDriver
  let fake: FakeAudioElement

  beforeEach(async () => {
    const db = createTestDb()
    driver = db.driver
    resetPlayerStore()
    resetLibraryStore()
    fake = new FakeAudioElement()
    injectAudioElementForTests(fake as unknown as HTMLAudioElement)
    // Clear any driver reference leaked by a previous test.
    await usePlayerStore.getState().hydrate(null)
    await useLibraryStore.getState().hydrate(null)
  })

  afterEach(() => {
    injectAudioElementForTests(null)
    vi.useRealTimers()
  })

  it('hydrates the persisted volume (0–1 setting becomes 0–100)', async () => {
    await usePlayerStore.getState().hydrate(driver) // seeded volume = 0.7
    expect(usePlayerStore.getState().volume).toBe(70)
  })

  it('hydrate never loads or plays a track', async () => {
    await usePlayerStore.getState().hydrate(driver)
    const state = usePlayerStore.getState()
    expect(state.trackId).toBeNull()
    expect(state.playing).toBe(false)
    expect(fake.src).toBe('')
  })

  it('setVolume clamps to 0–100, drives the element and persists 0–1', async () => {
    await usePlayerStore.getState().hydrate(driver)

    usePlayerStore.getState().setVolume(45)
    expect(usePlayerStore.getState().volume).toBe(45)
    expect(fake.volume).toBeCloseTo(0.45)

    usePlayerStore.getState().setVolume(140)
    expect(usePlayerStore.getState().volume).toBe(100)
    usePlayerStore.getState().setVolume(-3)
    expect(usePlayerStore.getState().volume).toBe(0)

    // Fire-and-forget persistence: flush the microtask queue, then read back.
    await vi.waitFor(async () => {
      expect(await settingsRepo.getSetting(driver, 'volume')).toBe('0')
    })
  })

  it('playTrack selects the track, sets the source and starts playback', async () => {
    await usePlayerStore.getState().playTrack(makeTrack(1))

    const state = usePlayerStore.getState()
    expect(state.trackId).toBe(1)
    expect(state.trackName).toBe('track-1')
    expect(state.trackMeta).toBe('track-1.mp3 · 60 min')
    expect(state.playing).toBe(true)
    expect(state.missing).toBe(false)
    // Not Tauri in tests: the raw path is used instead of convertFileSrc.
    expect(fake.src).toBe('/music/track-1.mp3')
    expect(fake.paused).toBe(false)
  })

  it('playTrack applies the library loop default to the element', async () => {
    useLibraryStore.setState({ loopUntilBlockEnd: false })
    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(fake.loop).toBe(false)

    useLibraryStore.setState({ loopUntilBlockEnd: true })
    await usePlayerStore.getState().playTrack(makeTrack(2))
    expect(fake.loop).toBe(true)
  })

  it('playTrack with fade-in ramps volume from 0 to target over fadeInSec', async () => {
    vi.useFakeTimers()
    useLibraryStore.setState({ fadeInSec: 8 })
    usePlayerStore.getState().setVolume(80)

    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(fake.volume).toBe(0)

    await vi.advanceTimersByTimeAsync(4000)
    expect(fake.volume).toBeGreaterThan(0)
    expect(fake.volume).toBeLessThan(0.8)

    await vi.advanceTimersByTimeAsync(4000)
    expect(fake.volume).toBeCloseTo(0.8)
  })

  it('playTrack with fade-in off sets the target volume immediately', async () => {
    vi.useFakeTimers()
    useLibraryStore.setState({ fadeInSec: 0 })
    usePlayerStore.getState().setVolume(50)

    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(fake.volume).toBeCloseTo(0.5)

    // No ramp is scheduled: time passing changes nothing.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fake.volume).toBeCloseTo(0.5)
  })

  it('togglePlay pauses and resumes the current track', async () => {
    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(usePlayerStore.getState().playing).toBe(true)

    await usePlayerStore.getState().togglePlay()
    expect(usePlayerStore.getState().playing).toBe(false)
    expect(fake.paused).toBe(true)

    await usePlayerStore.getState().togglePlay()
    expect(usePlayerStore.getState().playing).toBe(true)
    expect(fake.paused).toBe(false)
  })

  it('togglePlay is a no-op with no track selected', async () => {
    await usePlayerStore.getState().togglePlay()
    expect(usePlayerStore.getState().playing).toBe(false)
    expect(fake.src).toBe('')
  })

  it('seek clamps to the duration and drives the element', async () => {
    await usePlayerStore.getState().playTrack(makeTrack(1, { durationSec: 100 }))

    usePlayerStore.getState().seek(40)
    expect(usePlayerStore.getState().positionSec).toBe(40)
    expect(fake.currentTime).toBe(40)

    usePlayerStore.getState().seek(250)
    expect(usePlayerStore.getState().positionSec).toBe(100)

    usePlayerStore.getState().seek(-5)
    expect(usePlayerStore.getState().positionSec).toBe(0)
  })

  it('seek is a no-op with no track selected', () => {
    usePlayerStore.getState().seek(30)
    expect(usePlayerStore.getState().positionSec).toBe(0)
  })

  it('position and duration flow from element events', async () => {
    await usePlayerStore.getState().playTrack(makeTrack(1))

    fake.currentTime = 123
    fake.emit('timeupdate')
    expect(usePlayerStore.getState().positionSec).toBe(123)

    fake.duration = 999
    fake.emit('durationchange')
    expect(usePlayerStore.getState().durationSec).toBe(999)
  })

  it('next/prev walk the library track list with wrap-around', async () => {
    const tracks = [makeTrack(1), makeTrack(2), makeTrack(3)]
    useLibraryStore.setState({ tracks })

    await usePlayerStore.getState().playTrack(tracks[0])
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().trackId).toBe(2)

    await usePlayerStore.getState().next()
    await usePlayerStore.getState().next() // wraps
    expect(usePlayerStore.getState().trackId).toBe(1)

    await usePlayerStore.getState().prev() // wraps back
    expect(usePlayerStore.getState().trackId).toBe(3)
  })

  it('next/prev are no-ops when the library is empty', async () => {
    await usePlayerStore.getState().playTrack(makeTrack(1))
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().trackId).toBe(1)
    await usePlayerStore.getState().prev()
    expect(usePlayerStore.getState().trackId).toBe(1)
  })

  it('a rejected play() marks the track missing and stops playback', async () => {
    fake.playRejects = true
    await usePlayerStore.getState().playTrack(makeTrack(1))

    const state = usePlayerStore.getState()
    expect(state.missing).toBe(true)
    expect(state.playing).toBe(false)
  })

  it('an autoplay-policy rejection does NOT mark the track missing', async () => {
    // NotAllowedError fires without a user gesture even for a healthy file
    // (e.g. auto-advance from `ended`). Labelling that "File not found"
    // accuses a good file.
    fake.playRejects = true
    fake.playRejectName = 'NotAllowedError'
    await usePlayerStore.getState().playTrack(makeTrack(1))

    const state = usePlayerStore.getState()
    expect(state.trackId).toBe(1)
    expect(state.missing).toBe(false)
    expect(state.playing).toBe(false)
  })

  it('a rejection with MediaError code 4 marks missing even for an unknown error name', async () => {
    fake.playRejects = true
    fake.playRejectName = 'AbortError' // not a name isSrcFailure recognises
    fake.error = { code: 4 } // MEDIA_ERR_SRC_NOT_SUPPORTED
    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(usePlayerStore.getState().missing).toBe(true)
  })

  it('a rejection with MediaError code 1 (aborted) does not mark missing', async () => {
    fake.playRejects = true
    fake.playRejectName = 'AbortError'
    fake.error = { code: 1 } // MEDIA_ERR_ABORTED — the load was interrupted, not bad
    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(usePlayerStore.getState().missing).toBe(false)
    expect(usePlayerStore.getState().playing).toBe(false)
  })

  it('an element error event marks the track missing', async () => {
    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(usePlayerStore.getState().playing).toBe(true)

    fake.emit('error')
    expect(usePlayerStore.getState().missing).toBe(true)
    expect(usePlayerStore.getState().playing).toBe(false)
  })

  it('an error event with code 1 (aborted) does NOT mark missing', async () => {
    // Reassigning src aborts the previous track's load; some engines fire
    // `error` for the abort. trackId already points at the new track by
    // then — marking missing would falsely label a healthy file.
    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(usePlayerStore.getState().playing).toBe(true)

    fake.error = { code: 1 } // MEDIA_ERR_ABORTED
    fake.emit('error')

    expect(usePlayerStore.getState().missing).toBe(false)
    expect(usePlayerStore.getState().playing).toBe(true)
  })

  it('an error event with code 3 (decode) marks missing — the file is unplayable', async () => {
    // Deliberately included on the error path although isSrcFailure
    // excludes it on the play() path: a decode failure means the file can
    // never play, and this listener is where it surfaces.
    await usePlayerStore.getState().playTrack(makeTrack(1))

    fake.error = { code: 3 } // MEDIA_ERR_DECODE
    fake.emit('error')

    expect(usePlayerStore.getState().missing).toBe(true)
    expect(usePlayerStore.getState().playing).toBe(false)
  })

  it('markMissing is a no-op when no track is selected', () => {
    usePlayerStore.getState().markMissing()
    expect(usePlayerStore.getState().missing).toBe(false)
  })

  it('playing another track clears the missing state', async () => {
    fake.playRejects = true
    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(usePlayerStore.getState().missing).toBe(true)

    fake.playRejects = false
    await usePlayerStore.getState().playTrack(makeTrack(2))

    const state = usePlayerStore.getState()
    expect(state.trackId).toBe(2)
    expect(state.missing).toBe(false)
    expect(state.playing).toBe(true)
  })

  it('toggling the loop session default applies to the live element', async () => {
    useLibraryStore.setState({ loopUntilBlockEnd: true })
    await usePlayerStore.getState().playTrack(makeTrack(1))
    expect(fake.loop).toBe(true)

    await useLibraryStore.getState().setLoopUntilBlockEnd(false)
    expect(fake.loop).toBe(false)

    await useLibraryStore.getState().setLoopUntilBlockEnd(true)
    expect(fake.loop).toBe(true)
  })

  it('ended advances to the next library track when not looping', async () => {
    const tracks = [makeTrack(1), makeTrack(2)]
    useLibraryStore.setState({ tracks, loopUntilBlockEnd: false })

    await usePlayerStore.getState().playTrack(tracks[0])
    fake.emit('ended')

    // playTrack is async; flush so the follow-on play lands.
    await vi.waitFor(() => {
      expect(usePlayerStore.getState().trackId).toBe(2)
    })
    expect(usePlayerStore.getState().playing).toBe(true)
    expect(fake.src).toBe('/music/track-2.mp3')
  })

  it('ended stops when there is no next track', async () => {
    useLibraryStore.setState({ tracks: [makeTrack(1)], loopUntilBlockEnd: false })

    await usePlayerStore.getState().playTrack(makeTrack(1))
    fake.emit('ended')

    expect(usePlayerStore.getState().playing).toBe(false)
    expect(usePlayerStore.getState().trackId).toBe(1)
    expect(usePlayerStore.getState().positionSec).toBe(0)
  })

  it('stop clears the selection and halts playback', async () => {
    await usePlayerStore.getState().playTrack(makeTrack(1))
    usePlayerStore.getState().stop()

    const state = usePlayerStore.getState()
    expect(state.trackId).toBeNull()
    expect(state.trackName).toBeNull()
    expect(state.trackMeta).toBeNull()
    expect(state.playing).toBe(false)
    expect(state.positionSec).toBe(0)
    expect(state.missing).toBe(false)
    expect(fake.paused).toBe(true)
  })

  it('setVolume interrupts an in-progress fade-in', async () => {
    vi.useFakeTimers()
    useLibraryStore.setState({ fadeInSec: 8 })
    await usePlayerStore.getState().playTrack(makeTrack(1))
    await vi.advanceTimersByTimeAsync(2000)
    expect(fake.volume).toBeLessThan(0.7)

    usePlayerStore.getState().setVolume(30)
    expect(fake.volume).toBeCloseTo(0.3)

    // The cancelled ramp must not resurrect later.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fake.volume).toBeCloseTo(0.3)
  })
})
