import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { Track } from '../db/types'
import * as tracksRepo from '../db/repos/tracks'
import * as settingsRepo from '../db/repos/settings'
import { defaultCategory, displayNameFromPath } from '../lib/library'
import { usePlayerStore } from './player'

/** Fade-in length when the "Fade in" session default is on (the mockup's 8 s). */
const FADE_IN_DEFAULT_SEC = 8

/**
 * Sound library store: the user's local audio files plus the three session
 * defaults (fade-in, silence during rest, loop until block ends) hydrated
 * from the `setting` table and persisted on toggle.
 *
 * Error contract (P2-A): every mutator catches its own persistence errors,
 * sets `error`, reverts any optimistic update, and RETURNS — it never
 * throws. Actions that gate a UI transition return `boolean` or `id | null`.
 *
 * This store and the player store import each other (the library stops
 * playback when the playing track is removed; the player reads the track
 * list and session defaults). Both only dereference the other inside action
 * bodies, so the circularity is safe.
 */
interface LibraryState {
  tracks: Track[]
  loading: boolean
  error: string | null
  /** Seconds of volume ramp when a track starts; 0 means fade-in is off. */
  fadeInSec: number
  silenceDuringRest: boolean
  loopUntilBlockEnd: boolean

  hydrate: (driver: SqlDriver | null) => Promise<void>

  // Persists a new track from an absolute path, deriving its display name
  // from the filename. Re-registering an already-known path refreshes its
  // duration instead of duplicating the row. Returns the track id.
  registerTrack: (path: string, durationSec: number | null) => Promise<number | null>

  // Deletes the track row (never the file). Stops playback first when the
  // removed track is the one currently loaded in the player.
  removeTrack: (id: number) => Promise<boolean>

  setCategory: (id: number, category: string) => Promise<boolean>
  setFadeIn: (enabled: boolean) => Promise<boolean>
  setSilenceDuringRest: (on: boolean) => Promise<boolean>
  setLoopUntilBlockEnd: (on: boolean) => Promise<boolean>
}

let persistenceDriver: SqlDriver | null = null

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  tracks: [],
  loading: false,
  error: null,
  fadeInSec: FADE_IN_DEFAULT_SEC,
  silenceDuringRest: true,
  loopUntilBlockEnd: true,

  hydrate: async (driver) => {
    persistenceDriver = driver
    set({ loading: true, error: null })
    if (!driver) {
      set({ loading: false })
      return
    }
    try {
      const [tracks, settings] = await Promise.all([
        tracksRepo.listTracks(driver),
        settingsRepo.getAllSettings(driver),
      ])
      const fade = Number.parseInt(settings.fadeInSec ?? '', 10)
      set({
        tracks,
        fadeInSec: Number.isFinite(fade) && fade >= 0 ? fade : FADE_IN_DEFAULT_SEC,
        silenceDuringRest: settings.silenceDuringRest !== '0',
        loopUntilBlockEnd: settings.loopUntilBlockEnd !== '0',
        loading: false,
      })
    } catch (err) {
      console.error('Failed to hydrate library store:', err)
      set({ error: String(err), loading: false })
    }
  },

  registerTrack: async (path, durationSec) => {
    if (!persistenceDriver) {
      set({ error: 'Loading audio files requires the desktop app.' })
      return null
    }
    try {
      const existing = await tracksRepo.getTrackByPath(persistenceDriver, path)
      if (existing) {
        // Known path: refresh metadata rather than duplicating the row. A
        // failed duration probe (null) must not erase a duration that was
        // read successfully on an earlier load.
        if (durationSec !== null) {
          await tracksRepo.updateTrack(persistenceDriver, existing.id, { durationSec })
        }
        const tracks = await tracksRepo.listTracks(persistenceDriver)
        set({ tracks, error: null })
        return existing.id
      }
      const id = await tracksRepo.addTrack(persistenceDriver, {
        path,
        displayName: displayNameFromPath(path),
        category: defaultCategory(),
        durationSec,
      })
      // Re-list rather than splicing locally, so the in-memory order always
      // matches the repo's ORDER BY (one ordering, owned by the SQL).
      const tracks = await tracksRepo.listTracks(persistenceDriver)
      set({ tracks, error: null })
      return id
    } catch (err) {
      console.error('Failed to register track:', err)
      set({ error: String(err) })
      return null
    }
  },

  removeTrack: async (id) => {
    if (!persistenceDriver) {
      set({ error: 'Removing tracks requires the desktop app.' })
      return false
    }
    // Stop playback first when the removed track is the loaded one —
    // otherwise the player would keep pointing at a row that no longer
    // exists. Deferred cross-store access; see the module doc comment.
    const player = usePlayerStore.getState()
    if (player.trackId === id) {
      player.stop()
    }
    try {
      await tracksRepo.deleteTrack(persistenceDriver, id)
      set({ tracks: get().tracks.filter((t) => t.id !== id), error: null })
      return true
    } catch (err) {
      console.error('Failed to remove track:', err)
      set({ error: String(err) })
      return false
    }
  },

  setCategory: async (id, category) => {
    const prev = get().tracks
    set({ tracks: prev.map((t) => (t.id === id ? { ...t, category } : t)), error: null })
    if (!persistenceDriver) return true
    try {
      await tracksRepo.updateTrack(persistenceDriver, id, { category })
      // Re-list: changing the category changes the ORDER BY position.
      const tracks = await tracksRepo.listTracks(persistenceDriver)
      set({ tracks })
      return true
    } catch (err) {
      console.error('Failed to set track category:', err)
      set({ tracks: prev, error: String(err) })
      return false
    }
  },

  setFadeIn: async (enabled) => {
    const prev = get().fadeInSec
    const nextSec = enabled ? FADE_IN_DEFAULT_SEC : 0
    set({ fadeInSec: nextSec, error: null })
    if (!persistenceDriver) return true
    try {
      await settingsRepo.setSetting(persistenceDriver, 'fadeInSec', String(nextSec))
      return true
    } catch (err) {
      console.error('Failed to persist fade-in setting:', err)
      set({ fadeInSec: prev, error: String(err) })
      return false
    }
  },

  setSilenceDuringRest: async (on) => {
    const prev = get().silenceDuringRest
    set({ silenceDuringRest: on, error: null })
    if (!persistenceDriver) return true
    try {
      await settingsRepo.setSetting(persistenceDriver, 'silenceDuringRest', on ? '1' : '0')
      return true
    } catch (err) {
      console.error('Failed to persist silence-during-rest setting:', err)
      set({ silenceDuringRest: prev, error: String(err) })
      return false
    }
  },

  setLoopUntilBlockEnd: async (on) => {
    const prev = get().loopUntilBlockEnd
    set({ loopUntilBlockEnd: on, error: null })
    // Apply to the live element too — otherwise a mid-playback toggle would
    // only take effect at the next playTrack. Deferred cross-store access;
    // see the module doc comment.
    usePlayerStore.getState().setLoop(on)
    if (!persistenceDriver) return true
    try {
      await settingsRepo.setSetting(persistenceDriver, 'loopUntilBlockEnd', on ? '1' : '0')
      return true
    } catch (err) {
      console.error('Failed to persist loop setting:', err)
      set({ loopUntilBlockEnd: prev, error: String(err) })
      return false
    }
  },
}))
