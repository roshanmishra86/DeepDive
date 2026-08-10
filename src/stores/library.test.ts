import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as tracksRepo from '../db/repos/tracks'
import * as settingsRepo from '../db/repos/settings'
import { BUILTIN_SEED_VERSION, BUILTIN_TRACKS, builtinPath, isBuiltinPath } from '../lib/builtinTracks'
import { useLibraryStore } from './library'
import { usePlayerStore } from './player'

function resetLibraryStore() {
  // Merge setState, never replace: true (which would drop the actions).
  useLibraryStore.setState({
    tracks: [],
    loading: false,
    error: null,
    fadeInSec: 8,
    silenceDuringRest: true,
  })
}

describe('library store', () => {
  let driver: SqlDriver

  beforeEach(async () => {
    const db = createTestDb()
    driver = db.driver
    resetLibraryStore()
    usePlayerStore.getState().stop()
    // Clear any driver reference leaked by a previous test.
    await useLibraryStore.getState().hydrate(null)
  })

  it('hydrates tracks and session defaults from the database', async () => {
    await tracksRepo.addTrack(driver, {
      path: '/music/rain.mp3',
      displayName: 'rain',
      category: 'ambient',
      durationSec: 2700,
    })

    await useLibraryStore.getState().hydrate(driver)

    const state = useLibraryStore.getState()
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    // hydrate also seeds the BUILTIN_TRACKS built-ins into a fresh DB (see
    // the "hydrate seeds the built-in tracks" test below) — filter down to
    // this test's own row rather than asserting an exact total length.
    const userTracks = state.tracks.filter((t) => !isBuiltinPath(t.path))
    expect(userTracks).toHaveLength(1)
    expect(userTracks[0].displayName).toBe('rain')
    // Seeded defaults from 0002_seed.sql
    expect(state.fadeInSec).toBe(8)
    expect(state.silenceDuringRest).toBe(true)
  })

  it('hydrate(null) leaves an empty, non-loading library', async () => {
    await useLibraryStore.getState().hydrate(null)
    const state = useLibraryStore.getState()
    expect(state.tracks).toEqual([])
    expect(state.loading).toBe(false)
  })

  it('registerTrack persists the row and derives the display name from the filename', async () => {
    await useLibraryStore.getState().hydrate(driver)

    const id = await useLibraryStore
      .getState()
      .registerTrack('C:\\Users\\user\\Music\\brown-deep.mp3', 7200)

    expect(id).not.toBeNull()
    // Read back out of real SQLite, not just in-memory state.
    const row = await tracksRepo.getTrackByPath(driver, 'C:\\Users\\user\\Music\\brown-deep.mp3')
    expect(row).not.toBeNull()
    expect(row?.displayName).toBe('brown-deep')
    expect(row?.category).toBe('other')
    expect(row?.durationSec).toBe(7200)
    expect(useLibraryStore.getState().tracks.map((t) => t.id)).toContain(id)
  })

  it('registerTrack keeps a null duration as NULL', async () => {
    await useLibraryStore.getState().hydrate(driver)

    await useLibraryStore.getState().registerTrack('/music/rain.mp3', null)

    const row = await tracksRepo.getTrackByPath(driver, '/music/rain.mp3')
    expect(row?.durationSec).toBeNull()
  })

  it('registerTrack on a known path refreshes duration instead of duplicating', async () => {
    await useLibraryStore.getState().hydrate(driver)

    const first = await useLibraryStore.getState().registerTrack('/music/rain.mp3', 100)
    const second = await useLibraryStore.getState().registerTrack('/music/rain.mp3', 200)

    expect(second).toBe(first)
    // hydrate above also seeded the built-ins; only this test's own path
    // should have duplicated (or not) under repeated registration.
    const all = (await tracksRepo.listTracks(driver)).filter((t) => !isBuiltinPath(t.path))
    expect(all).toHaveLength(1)
    expect(all[0].durationSec).toBe(200)
  })

  it('registerTrack on a known path with a failed duration probe keeps the old duration', async () => {
    await useLibraryStore.getState().hydrate(driver)

    await useLibraryStore.getState().registerTrack('/music/rain.mp3', 100)
    // Second load: metadata unreadable this time (null). The previously
    // known duration must survive — a NULL overwrite would be data loss.
    await useLibraryStore.getState().registerTrack('/music/rain.mp3', null)

    const row = await tracksRepo.getTrackByPath(driver, '/music/rain.mp3')
    expect(row?.durationSec).toBe(100)
  })

  it('registerTrack without a driver returns null and sets an error', async () => {
    const id = await useLibraryStore.getState().registerTrack('/music/rain.mp3', 60)
    expect(id).toBeNull()
    expect(useLibraryStore.getState().error).not.toBeNull()
  })

  it('removeTrack deletes the row and returns true', async () => {
    await useLibraryStore.getState().hydrate(driver)
    const id = await useLibraryStore.getState().registerTrack('/music/rain.mp3', 60)
    expect(id).not.toBeNull()

    const ok = await useLibraryStore.getState().removeTrack(id as number)

    expect(ok).toBe(true)
    // hydrate above also seeded the built-ins, which removeTrack must not
    // touch — only this test's own row is expected to be gone.
    expect(await tracksRepo.getTrackByPath(driver, '/music/rain.mp3')).toBeNull()
    expect(useLibraryStore.getState().tracks.some((t) => t.id === id)).toBe(false)
  })

  it('removeTrack stops the player when the removed track is loaded', async () => {
    await useLibraryStore.getState().hydrate(driver)
    const id = (await useLibraryStore.getState().registerTrack('/music/rain.mp3', 60)) as number
    const track = useLibraryStore.getState().tracks.find((t) => t.id === id)
    expect(track).toBeDefined()

    // Simulate the track being loaded in the player (no Audio in node, so
    // playTrack sets selection state without playback).
    await usePlayerStore.getState().playTrack(track!)
    expect(usePlayerStore.getState().trackId).toBe(id)

    await useLibraryStore.getState().removeTrack(id)

    const player = usePlayerStore.getState()
    expect(player.trackId).toBeNull()
    expect(player.playing).toBe(false)
    expect(player.trackName).toBeNull()
  })

  it('removeTrack leaves the player alone when a different track is loaded', async () => {
    await useLibraryStore.getState().hydrate(driver)
    const keepId = (await useLibraryStore
      .getState()
      .registerTrack('/music/keep.mp3', 60)) as number
    const dropId = (await useLibraryStore
      .getState()
      .registerTrack('/music/drop.mp3', 60)) as number
    const keep = useLibraryStore.getState().tracks.find((t) => t.id === keepId)
    await usePlayerStore.getState().playTrack(keep!)

    await useLibraryStore.getState().removeTrack(dropId)

    expect(usePlayerStore.getState().trackId).toBe(keepId)
  })

  it('setCategory without a driver bails with an error instead of keeping an in-memory-only change', async () => {
    // No hydrate(driver): no persistence driver, no tracks. Same contract
    // as registerTrack/removeTrack for the same condition.
    useLibraryStore.setState({
      tracks: [
        { id: 1, path: '/music/rain.mp3', displayName: 'rain', category: 'other', durationSec: 60 },
      ],
    })

    const ok = await useLibraryStore.getState().setCategory(1, 'binaural')

    expect(ok).toBe(false)
    // The exact message matters: without the explicit no-driver bail the
    // call falls into a TypeError on the null driver, which the catch
    // converts into the same observable shape for the wrong reason. Only
    // the bail produces this string.
    expect(useLibraryStore.getState().error).toBe('Editing tracks requires the desktop app.')
    expect(useLibraryStore.getState().tracks[0].category).toBe('other')
  })

  it('setCategory persists and re-lists in repo order', async () => {
    await useLibraryStore.getState().hydrate(driver)
    const id = (await useLibraryStore.getState().registerTrack('/music/rain.mp3', 60)) as number

    const ok = await useLibraryStore.getState().setCategory(id, 'binaural')

    expect(ok).toBe(true)
    const row = await tracksRepo.getTrackByPath(driver, '/music/rain.mp3')
    expect(row?.category).toBe('binaural')
    // hydrate above also seeded the built-ins (all 'ambient'/'other'), so
    // this track is not necessarily first in the re-listed order — find it
    // by id instead of assuming index 0.
    const updated = useLibraryStore.getState().tracks.find((t) => t.id === id)
    expect(updated?.category).toBe('binaural')
  })

  it('setFadeIn toggles between 8 and 0 and persists the setting', async () => {
    await useLibraryStore.getState().hydrate(driver)

    expect(await useLibraryStore.getState().setFadeIn(false)).toBe(true)
    expect(useLibraryStore.getState().fadeInSec).toBe(0)
    expect(await settingsRepo.getSetting(driver, 'fadeInSec')).toBe('0')

    expect(await useLibraryStore.getState().setFadeIn(true)).toBe(true)
    expect(useLibraryStore.getState().fadeInSec).toBe(8)
    expect(await settingsRepo.getSetting(driver, 'fadeInSec')).toBe('8')
  })

  it('setSilenceDuringRest persists 1/0', async () => {
    await useLibraryStore.getState().hydrate(driver)

    expect(await useLibraryStore.getState().setSilenceDuringRest(false)).toBe(true)
    expect(useLibraryStore.getState().silenceDuringRest).toBe(false)
    expect(await settingsRepo.getSetting(driver, 'silenceDuringRest')).toBe('0')

    expect(await useLibraryStore.getState().setSilenceDuringRest(true)).toBe(true)
    expect(await settingsRepo.getSetting(driver, 'silenceDuringRest')).toBe('1')
  })

  it('rolls back a toggle and reports failure when persistence fails', async () => {
    await useLibraryStore.getState().hydrate(driver)
    const failing: SqlDriver = {
      execute: () => Promise.reject(new Error('disk full')),
      select: driver.select.bind(driver),
      transaction: () => Promise.reject(new Error('disk full')),
    }
    await useLibraryStore.getState().hydrate(failing)

    const ok = await useLibraryStore.getState().setSilenceDuringRest(false)

    expect(ok).toBe(false)
    expect(useLibraryStore.getState().silenceDuringRest).toBe(true)
    expect(useLibraryStore.getState().error).toContain('disk full')
  })

  it('hydrate seeds the built-in tracks into a fresh DB and marks the seed version', async () => {
    await useLibraryStore.getState().hydrate(driver)

    const state = useLibraryStore.getState()
    expect(state.tracks).toHaveLength(BUILTIN_TRACKS.length)
    for (const t of BUILTIN_TRACKS) {
      const row = await tracksRepo.getTrackByPath(driver, builtinPath(t.file))
      expect(row).not.toBeNull()
      expect(row?.displayName).toBe(t.title)
      expect(row?.category).toBe(t.category)
      expect(row?.durationSec).toBe(t.durationSec)
    }
    expect(await settingsRepo.getSetting(driver, 'builtinSeedVersion')).toBe(
      String(BUILTIN_SEED_VERSION)
    )
  })

  it('does not re-seed (and does not resurrect a user deletion) once the seed version is current', async () => {
    await useLibraryStore.getState().hydrate(driver)
    const first = useLibraryStore.getState().tracks.find((t) => t.path === builtinPath(BUILTIN_TRACKS[0].file))
    expect(first).toBeDefined()

    // User deletes a built-in — this must stick across a later hydrate.
    await useLibraryStore.getState().removeTrack(first!.id)
    expect(await tracksRepo.getTrackByPath(driver, builtinPath(BUILTIN_TRACKS[0].file))).toBeNull()

    resetLibraryStore()
    await useLibraryStore.getState().hydrate(driver)

    expect(
      await tracksRepo.getTrackByPath(driver, builtinPath(BUILTIN_TRACKS[0].file))
    ).toBeNull()
    // The other 9 built-ins are still present — this was a targeted
    // deletion, not a full re-seed skip artifact.
    expect(useLibraryStore.getState().tracks).toHaveLength(BUILTIN_TRACKS.length - 1)
  })

  it('a seeding failure still leaves the user\'s own tracks hydrated', async () => {
    await tracksRepo.addTrack(driver, {
      path: '/music/mine.mp3',
      displayName: 'mine',
      category: 'other',
      durationSec: 60,
    })
    const failingInsert: SqlDriver = {
      select: driver.select.bind(driver),
      execute: (sql, params) =>
        sql.includes('INSERT INTO track')
          ? Promise.reject(new Error('disk full'))
          : driver.execute(sql, params),
      transaction: driver.transaction.bind(driver),
    }

    await useLibraryStore.getState().hydrate(failingInsert)

    const state = useLibraryStore.getState()
    expect(state.error).toContain('disk full')
    expect(state.tracks.some((t) => t.displayName === 'mine')).toBe(true)
    expect(state.loading).toBe(false)
  })

  it('removeTrack reports failure instead of throwing when persistence fails', async () => {
    await useLibraryStore.getState().hydrate(driver)
    const id = (await useLibraryStore.getState().registerTrack('/music/rain.mp3', 60)) as number
    const failing: SqlDriver = {
      execute: () => Promise.reject(new Error('disk full')),
      select: driver.select.bind(driver),
      transaction: () => Promise.reject(new Error('disk full')),
    }
    await useLibraryStore.getState().hydrate(failing)

    const ok = await useLibraryStore.getState().removeTrack(id)

    expect(ok).toBe(false)
    expect(useLibraryStore.getState().error).toContain('disk full')
  })
})
