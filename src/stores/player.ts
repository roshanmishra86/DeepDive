import { create } from 'zustand'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { SqlDriver } from '../db/driver'
import type { RepeatMode, Track } from '../db/types'
import * as settingsRepo from '../db/repos/settings'
import { isTauri } from '../lib/platform'
import { isSrcFailure, nextTrackId, trackMeta as describeTrack } from '../lib/library'
import { builtinSrc, isBuiltinPath } from '../lib/builtinTracks'
import { useLibraryStore } from './library'
import { nextRepeatMode, resolveEndedAction } from '../lib/player'

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
  /** True when WE paused playback for a rest phase (so only we resume it). */
  restPaused: boolean
  /** Track ids queued up, in play order. No duplicates. */
  queue: number[]
  /** Index into `queue` of the playing track, or -1 when playing off-queue. */
  queueIndex: number
  /**
   * Queue repeat. On: the queue wraps to its first entry when the last one
   * ends (and with an empty queue, the current track replays). Off: playback
   * stops at the end of the queue.
   */
  repeatMode: RepeatMode

  // Loads the persisted volume. Never autoplays and never loads a track.
  hydrate: (driver: SqlDriver | null) => Promise<void>

  // Selects and starts a track, honouring the library's session defaults
  // (loop, fade-in). A failed load marks the track missing instead of throwing.
  // `queueIndex` is supplied by the queue walker; callers outside it let the
  // track's own position in the queue (if any) decide.
  playTrack: (track: Track, queueIndex?: number) => Promise<void>

  togglePlay: () => Promise<void>
  seek: (sec: number) => void
  setVolume: (volume: number) => void
  next: () => Promise<void>
  prev: () => Promise<void>

  // Appends a track to the queue (no-op if already queued). With nothing
  // loaded, the appended track starts playing immediately.
  enqueue: (track: Track) => Promise<void>

  // Drops a track from the queue, keeping queueIndex pointing at the same
  // entry it did before.
  dequeue: (trackId: number) => void
  clearQueue: () => void

  toggleRepeat: () => void

  // Clears the current track and halts playback. Called by the library
  // store's removeTrack when the removed track is the one playing.
  stop: () => void

  // Marks the current track's file as unreadable and stops playback.
  markMissing: () => void

  // Pauses playback for a rest phase ("Silence during rest"). Sets
  // restPaused ONLY when we actually paused — a user-paused player is never
  // auto-resumed at rest end.
  pauseForRest: () => void

  // Resumes a rest-paused player. No-op unless restPaused is set.
  resumeFromRest: () => Promise<void>
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

function haltPlayback() {
  clearFade()
  if (audio) audio.pause()
  usePlayerStore.setState({ playing: false, positionSec: 0 })
}

/**
 * Plays the first queue entry at or after `from` whose track still exists in
 * the library (a queued track can be removed while it waits). Wraps to the
 * head of the queue once when `wrap` is set — the wrap costs one full extra
 * scan at most, so this always terminates. Returns false when nothing in the
 * queue is playable.
 */
async function playQueueFrom(from: number, wrap: boolean): Promise<boolean> {
  const { queue } = usePlayerStore.getState()
  const tracks = useLibraryStore.getState().tracks
  const limit = wrap ? queue.length : queue.length - from
  for (let step = 0; step < limit; step += 1) {
    const index = wrap ? (from + step) % queue.length : from + step
    const track = tracks.find((t) => t.id === queue[index])
    if (!track) continue
    await usePlayerStore.getState().playTrack(track, index)
    return true
  }
  return false
}

function applyLoopFlag() {
  if (!audio) return
  const state = usePlayerStore.getState()
  audio.loop = state.repeatMode === 'one'
}

function handleEnded() {
  const state = usePlayerStore.getState()
  const action = resolveEndedAction(state.repeatMode, state.queue, state.queueIndex, state.trackId, useLibraryStore.getState().tracks)
  if (action.type === 'queue') {
    void playQueueFrom(action.index, false)
  } else if (action.type === 'library') {
    const track = useLibraryStore.getState().tracks.find((item) => item.id === action.id)
    if (track) void state.playTrack(track)
  } else if (action.type === 'replay') {
    const current = useLibraryStore.getState().tracks.find((item) => item.id === state.trackId)
    if (current) void state.playTrack(current)
    else haltPlayback()
  } else {
    haltPlayback()
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
  restPaused: false,
  queue: [],
  queueIndex: -1,
  repeatMode: 'off',

  hydrate: async (driver) => {
    persistenceDriver = driver
    if (!driver) return
    try {
      const raw = await settingsRepo.getSetting(driver, 'volume')
      const parsed = raw === null ? NaN : Number.parseFloat(raw)
      if (Number.isFinite(parsed)) {
        set({ volume: Math.min(100, Math.max(0, Math.round(parsed * 100))) })
      }
      const repeatRaw = await settingsRepo.getSetting(driver, 'repeatMode')
      const repeatMode: RepeatMode = repeatRaw === 'queue' || repeatRaw === 'one' ? repeatRaw : 'off'
      set({ repeatMode })
    } catch (err) {
      console.error('Failed to hydrate player store:', err)
    }
  },

  playTrack: async (track, queueIndex) => {
    const el = ensureAudio()
    clearFade()
    const { fadeInSec } = useLibraryStore.getState()
    set({
      trackId: track.id,
      // Playing a queued track directly (card play button) keeps the queue
      // running from that point; an unqueued track plays off-queue and the
      // queue resumes from its head when the track ends.
      queueIndex: queueIndex ?? get().queue.indexOf(track.id),
      trackName: track.displayName,
      trackMeta: describeTrack(track),
      playing: false,
      positionSec: 0,
      durationSec: track.durationSec ?? 0,
      missing: false,
      // Selecting a track is a user transport action: the user has taken
      // over playback, so any timer-owned rest pause is forfeited — a later
      // resumeFromRest must not fire. (next/prev route through here.)
      restPaused: false,
    })
    if (!el) return // no Audio in this environment; selection state still shows
    applyLoopFlag()
    // Three cases for resolving a track's playable src:
    //  1. Built-in track: a `builtin:<file>.mp3` path, resolved to the
    //     same-origin `/audio/<file>.mp3` URL Vite serves from `public/` —
    //     never convertFileSrc, since this is not a filesystem path.
    //  2. Tauri, user file: convertFileSrc turns the absolute disk path
    //     into an asset:// URL the webview is allowed to load.
    //  3. Outside Tauri (browser preview), user file: the raw path is set
    //     as-is, so the element errors and the track surfaces as missing
    //     rather than crashing (unreachable in practice: no tracks exist
    //     without the database, which only exists inside Tauri).
    el.src = isBuiltinPath(track.path)
      ? builtinSrc(track.path)
      : isTauri()
        ? convertFileSrc(track.path)
        : track.path
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
    // Any user transport action forfeits a timer-owned rest pause —
    // otherwise a user who plays then pauses during a rest would still be
    // force-resumed at rest end (the exact case restPaused exists to
    // prevent). Cleared once here so both branches below are covered.
    if (get().restPaused) set({ restPaused: false })
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
    // A queue overrides the library order for the transport buttons. Manual
    // skips always wrap, regardless of repeat — repeat governs what happens
    // when a track ends on its own, not what the user can reach by hand.
    const { queue, queueIndex } = get()
    if (queue.length > 0) {
      const from = queueIndex < 0 ? 0 : (queueIndex + 1) % queue.length
      if (await playQueueFrom(from, true)) return
    }
    const tracks = useLibraryStore.getState().tracks
    const id = nextTrackId(tracks, get().trackId, 1)
    const track = tracks.find((t) => t.id === id)
    if (track) await get().playTrack(track)
  },

  prev: async () => {
    const { queue, queueIndex } = get()
    if (queue.length > 0) {
      const from =
        queueIndex < 0 ? queue.length - 1 : (queueIndex - 1 + queue.length) % queue.length
      if (await playQueueFrom(from, true)) return
    }
    const tracks = useLibraryStore.getState().tracks
    const id = nextTrackId(tracks, get().trackId, -1)
    const track = tracks.find((t) => t.id === id)
    if (track) await get().playTrack(track)
  },

  enqueue: async (track) => {
    const { queue, trackId } = get()
    if (queue.includes(track.id)) return
    const nextQueue = [...queue, track.id]
    set({ queue: nextQueue })
    applyLoopFlag()
    // Nothing loaded: the first queued track starts straight away, so the
    // queue button doubles as "play this" on an idle player.
    if (trackId === null) {
      await get().playTrack(track, nextQueue.length - 1)
    } else if (trackId === track.id) {
      // The playing track was just queued — anchor the queue on it.
      set({ queueIndex: nextQueue.length - 1 })
    }
  },

  dequeue: (trackId) => {
    const { queue, queueIndex } = get()
    const index = queue.indexOf(trackId)
    if (index === -1) return
    const nextQueue = queue.filter((id) => id !== trackId)
    // Keep queueIndex on the same entry: removing something ahead of the
    // cursor does not move it, removing the cursor itself leaves the cursor
    // just before whatever slid into its slot.
    const nextIndex = queueIndex === -1 || index > queueIndex ? queueIndex : queueIndex - 1
    set({ queue: nextQueue, queueIndex: nextQueue.length === 0 ? -1 : nextIndex })
    applyLoopFlag()
  },

  toggleRepeat: () => {
    const mode = nextRepeatMode(get().repeatMode)
    set({ repeatMode: mode })
    applyLoopFlag()
    if (persistenceDriver) {
      settingsRepo.setSetting(persistenceDriver, 'repeatMode', mode).catch((err) =>
        console.error('Failed to persist repeat mode:', err)
      )
    }
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: -1 })
    applyLoopFlag()
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
      restPaused: false,
      // The queue itself survives — only the cursor into it is dropped.
      queueIndex: -1,
    })
    applyLoopFlag()
  },

  markMissing: () => {
    if (get().trackId === null) return
    clearFade()
    if (audio) audio.pause()
    set({ missing: true, playing: false, restPaused: false })
  },

  pauseForRest: () => {
    if (!get().playing) return
    const el = ensureAudio()
    if (!el) return
    clearFade()
    el.pause()
    set({ playing: false, restPaused: true })
  },

  resumeFromRest: async () => {
    if (!get().restPaused) return
    set({ restPaused: false })
    if (get().trackId === null) return
    const el = ensureAudio()
    if (!el) return
    try {
      el.volume = get().volume / 100
      await el.play()
      set({ playing: true })
    } catch (err) {
      handlePlayRejection(el, err)
    }
  },
}))
