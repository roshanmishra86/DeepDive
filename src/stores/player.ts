import { create } from 'zustand'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { SqlDriver } from '../db/driver'
import type { Track } from '../db/types'
import * as settingsRepo from '../db/repos/settings'
import { isTauri } from '../lib/platform'
import { isSrcFailure, nextTrackId, trackMeta as describeTrack } from '../lib/library'
import { useLibraryStore } from './library'

/**
 * Playback store driving the music bar. Plays against ONE lazily-created
 * HTMLAudioElement; position/duration flow from the element's own events
 * (`timeupdate`/`durationchange`/`ended`/`error`), never from a polling
 * timer. A missing file is detected by the element's `error` event
 * (anything but MEDIA_ERR_ABORTED, which only means a load was
 * interrupted), or by a rejected `play()` whose cause points at the source
 * (`isSrcFailure`) — an autoplay-policy rejection is not a missing file.
 * The fs plugin cannot stat arbitrary absolute paths, so no pre-flight
 * existence check is possible.
 *
 * The element is injectable for tests (`injectAudioElementForTests`) because
 * node has no `Audio` constructor.
 *
 * This store and the library store import each other (the library stops
 * playback when the playing track is removed; the player reads the track
 * list and session defaults). Both only dereference the other inside action
 * bodies, which run long after both modules finish evaluating, so the
 * circularity is safe.
 */
interface PlayerState {
  trackId: number | null
  trackName: string | null
  trackMeta: string | null
  playing: boolean
  volume: number // 0–100
  positionSec: number
  durationSec: number
  /** True when the current track's file failed to load (e.g. deleted). */
  missing: boolean

  // Loads the persisted volume. Never autoplays and never loads a track.
  hydrate: (driver: SqlDriver | null) => Promise<void>

  // Selects and starts a track, honouring the library's session defaults
  // (loop, fade-in). A failed load marks the track missing instead of throwing.
  playTrack: (track: Track) => Promise<void>

  togglePlay: () => Promise<void>
  seek: (sec: number) => void
  setVolume: (volume: number) => void
  next: () => Promise<void>
  prev: () => Promise<void>

  // Applies the loop session default to the live element. Called by the
  // library store's setLoopUntilBlockEnd so toggling it mid-playback takes
  // effect immediately instead of at the next playTrack.
  setLoop: (on: boolean) => void

  // Clears the current track and halts playback. Called by the library
  // store's removeTrack when the removed track is the one playing.
  stop: () => void

  // Marks the current track's file as unreadable and stops playback.
  markMissing: () => void
}

let persistenceDriver: SqlDriver | null = null
let audio: HTMLAudioElement | null = null
let fadeTimer: ReturnType<typeof setInterval> | null = null

const FADE_STEP_MS = 100

function clearFade() {
  if (fadeTimer !== null) {
    clearInterval(fadeTimer)
    fadeTimer = null
  }
}

/** Ramps the element's volume from 0 to `target` (0–1) over `seconds`. */
function startFadeIn(el: HTMLAudioElement, target: number, seconds: number) {
  clearFade()
  if (seconds <= 0) {
    el.volume = target
    return
  }
  el.volume = 0
  const steps = Math.max(1, Math.round((seconds * 1000) / FADE_STEP_MS))
  let step = 0
  fadeTimer = setInterval(() => {
    step += 1
    if (step >= steps) {
      el.volume = target
      clearFade()
      return
    }
    el.volume = target * (step / steps)
  }, FADE_STEP_MS)
}

function wireAudio(el: HTMLAudioElement): HTMLAudioElement {
  el.addEventListener('timeupdate', () => {
    usePlayerStore.setState({ positionSec: el.currentTime })
  })
  el.addEventListener('durationchange', () => {
    const d = el.duration
    usePlayerStore.setState({ durationSec: Number.isFinite(d) ? d : 0 })
  })
  el.addEventListener('ended', () => {
    handleEnded()
  })
  el.addEventListener('error', () => {
    // MEDIA_ERR_ABORTED (1) is not a source failure: reassigning src aborts
    // the previous track's load, and some engines fire `error` for the
    // abort. By then trackId already points at the new track, so marking
    // missing here would falsely label a healthy file. Codes 2/3/4
    // (network / decode / unsupported) are genuine failures of the current
    // source — the event is the authoritative missing signal for them,
    // which is exactly what lets the play()-rejection path stay
    // conservative (isSrcFailure excludes 1 and 3; decode failures arrive
    // here instead).
    const code = el.error ? el.error.code : null
    if (code === 1) return
    usePlayerStore.getState().markMissing()
  })
  return el
}

function ensureAudio(): HTMLAudioElement | null {
  if (audio) return audio
  if (typeof Audio === 'undefined') return null
  audio = wireAudio(new Audio())
  audio.preload = 'auto'
  return audio
}

/**
 * Test hook: node has no `Audio`, so tests swap in a fake element. Passing
 * null restores the never-created state. Production code never calls this.
 */
export function injectAudioElementForTests(fake: HTMLAudioElement | null): void {
  clearFade()
  audio = fake === null ? null : wireAudio(fake)
}

/**
 * Routes a rejected `play()` by cause. Only a genuine source failure marks
 * the track missing; an autoplay-policy (or unknown) rejection just means
 * playback did not start, so the track stays selectable and a later
 * user-gesture play can succeed. Never rethrows — no mutator in this app
 * rejects.
 */
function handlePlayRejection(el: HTMLAudioElement, err: unknown) {
  const errName = err instanceof DOMException ? err.name : undefined
  const mediaErrorCode = el.error ? el.error.code : null
  if (isSrcFailure(errName, mediaErrorCode)) {
    usePlayerStore.getState().markMissing()
  } else {
    usePlayerStore.setState({ playing: false })
  }
}

function handleEnded() {
  // `ended` only fires when `loop` is false. Advance to the next track if
  // one exists, else stop. A single-track list wraps to itself, which is
  // not "a next track", so playback stops.
  const state = usePlayerStore.getState()
  const tracks = useLibraryStore.getState().tracks
  const nextId = nextTrackId(tracks, state.trackId, 1)
  const nextTrack = tracks.find((t) => t.id === nextId)
  if (nextTrack && nextTrack.id !== state.trackId) {
    void state.playTrack(nextTrack)
  } else {
    clearFade()
    usePlayerStore.setState({ playing: false, positionSec: 0 })
  }
}

export const usePlayerStore = create<PlayerState>()((set, get) => ({
  trackId: null,
  trackName: null,
  trackMeta: null,
  playing: false,
  volume: 70,
  positionSec: 0,
  durationSec: 0,
  missing: false,

  hydrate: async (driver) => {
    persistenceDriver = driver
    if (!driver) return
    try {
      const raw = await settingsRepo.getSetting(driver, 'volume')
      const parsed = raw === null ? NaN : Number.parseFloat(raw)
      if (Number.isFinite(parsed)) {
        set({ volume: Math.min(100, Math.max(0, Math.round(parsed * 100))) })
      }
    } catch (err) {
      console.error('Failed to hydrate player store:', err)
    }
  },

  playTrack: async (track) => {
    const el = ensureAudio()
    clearFade()
    const { loopUntilBlockEnd, fadeInSec } = useLibraryStore.getState()
    set({
      trackId: track.id,
      trackName: track.displayName,
      trackMeta: describeTrack(track),
      playing: false,
      positionSec: 0,
      durationSec: track.durationSec ?? 0,
      missing: false,
    })
    if (!el) return // no Audio in this environment; selection state still shows
    el.loop = loopUntilBlockEnd
    // convertFileSrc is Tauri-only. Outside the webview the raw path is set
    // instead, so the element errors and the track surfaces as missing
    // rather than crashing (unreachable in practice: no tracks exist
    // without the database, which only exists inside Tauri).
    el.src = isTauri() ? convertFileSrc(track.path) : track.path
    // No `el.currentTime = 0` here: assigning src already resets the
    // position, and setting currentTime at HAVE_NOTHING is exactly where
    // WebKit historically threw InvalidStateError — outside the try below,
    // that would escape the action and silently never start playback.
    const target = get().volume / 100
    el.volume = fadeInSec > 0 ? 0 : target
    try {
      await el.play()
      set({ playing: true })
      startFadeIn(el, target, fadeInSec)
    } catch (err) {
      handlePlayRejection(el, err)
    }
  },

  togglePlay: async () => {
    const { trackId, playing } = get()
    if (trackId === null) return
    const el = ensureAudio()
    if (!el) return
    clearFade()
    if (playing) {
      el.pause()
      set({ playing: false })
      return
    }
    try {
      el.volume = get().volume / 100
      await el.play()
      set({ playing: true })
    } catch (err) {
      handlePlayRejection(el, err)
    }
  },

  seek: (sec) => {
    if (get().trackId === null) return
    const { durationSec } = get()
    const clamped = Math.max(0, durationSec > 0 ? Math.min(sec, durationSec) : sec)
    set({ positionSec: clamped })
    if (audio) audio.currentTime = clamped
  },

  setVolume: (volume) => {
    const v = Math.min(100, Math.max(0, Math.round(volume)))
    clearFade()
    set({ volume: v })
    if (audio) audio.volume = v / 100
    if (persistenceDriver) {
      // Fire-and-forget, matching the app store's settings persistence.
      settingsRepo.setSetting(persistenceDriver, 'volume', String(v / 100)).catch((err) =>
        console.error('Failed to persist volume:', err)
      )
    }
  },

  next: async () => {
    const tracks = useLibraryStore.getState().tracks
    const id = nextTrackId(tracks, get().trackId, 1)
    const track = tracks.find((t) => t.id === id)
    if (track) await get().playTrack(track)
  },

  prev: async () => {
    const tracks = useLibraryStore.getState().tracks
    const id = nextTrackId(tracks, get().trackId, -1)
    const track = tracks.find((t) => t.id === id)
    if (track) await get().playTrack(track)
  },

  setLoop: (on) => {
    if (audio) audio.loop = on
  },

  stop: () => {
    clearFade()
    if (audio) audio.pause()
    set({
      trackId: null,
      trackName: null,
      trackMeta: null,
      playing: false,
      positionSec: 0,
      durationSec: 0,
      missing: false,
    })
  },

  markMissing: () => {
    if (get().trackId === null) return
    clearFade()
    if (audio) audio.pause()
    set({ missing: true, playing: false })
  },
}))
