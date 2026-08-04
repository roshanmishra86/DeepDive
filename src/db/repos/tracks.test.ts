import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as tracks from './tracks'

describe('tracks repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('lists tracks', async () => {
    const id = await tracks.addTrack(driver, {
      path: '/music/song.mp3',
      displayName: 'Song',
      category: 'ambient',
    })

    const list = await tracks.listTracks(driver)
    const track = list.find((t) => t.id === id)
    expect(track?.displayName).toBe('Song')
  })

  it('adds a track', async () => {
    const id = await tracks.addTrack(driver, {
      path: '/music/track.mp3',
      displayName: 'Track',
      category: 'focus',
      durationSec: 300,
    })

    expect(id).toBeGreaterThan(0)

    const list = await tracks.listTracks(driver)
    const track = list.find((t) => t.id === id)
    expect(track?.path).toBe('/music/track.mp3')
    expect(track?.durationSec).toBe(300)
  })

  it('updates a track', async () => {
    const id = await tracks.addTrack(driver, {
      path: '/music/original.mp3',
      displayName: 'Original',
    })

    await tracks.updateTrack(driver, id, { displayName: 'Updated', category: 'chill' })

    const list = await tracks.listTracks(driver)
    const track = list.find((t) => t.id === id)
    expect(track?.displayName).toBe('Updated')
    expect(track?.category).toBe('chill')
  })

  it('deletes a track', async () => {
    const id = await tracks.addTrack(driver, {
      path: '/music/delete.mp3',
      displayName: 'Delete me',
    })

    await tracks.deleteTrack(driver, id)

    const list = await tracks.listTracks(driver)
    expect(list.find((t) => t.id === id)).toBeUndefined()
  })

  it('gets track by path', async () => {
    const path = '/music/unique.mp3'
    const id = await tracks.addTrack(driver, {
      path,
      displayName: 'Unique track',
    })

    const track = await tracks.getTrackByPath(driver, path)
    expect(track?.id).toBe(id)
    expect(track?.displayName).toBe('Unique track')
  })

  it('ignores duplicate path on add', async () => {
    const path = '/music/dup.mp3'
    const id1 = await tracks.addTrack(driver, {
      path,
      displayName: 'First',
    })

    const id2 = await tracks.addTrack(driver, {
      path,
      displayName: 'Second',
    })

    // Should update the existing record, not create a duplicate
    expect(id1).toBe(id2)

    const track = await tracks.getTrackByPath(driver, path)
    expect(track?.displayName).toBe('Second')
  })
})
