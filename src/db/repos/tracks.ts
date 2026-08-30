/**
 * Track repository — audio library management.
 * Tracks are identified by absolute path and persist metadata for the player.
 */

import type { SqlDriver } from '../driver'
import type { Track } from '../types'

interface TrackRow {
  id: number
  path: string
  display_name: string
  category: string
  duration_sec: number | null
  source_kind: NonNullable<Track['sourceKind']>; source_id: string | null; playback_url: string | null
  creator: string | null; artwork_url: string | null; source_page_url: string | null
  country: string | null; codec: string | null; bitrate: number | null
  license_url: string | null; tags_json: string
}

function rowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    path: row.path,
    displayName: row.display_name,
    category: row.category,
    durationSec: row.duration_sec,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    playbackUrl: row.playback_url,
    creator: row.creator,
    artworkUrl: row.artwork_url,
    sourcePageUrl: row.source_page_url,
    country: row.country,
    codec: row.codec,
    bitrate: row.bitrate,
    licenseUrl: row.license_url,
    tags: (() => { try { const value: unknown = JSON.parse(row.tags_json); return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [] } catch { return [] } })(),
  }
}

export async function upsertRemoteTrack(driver: SqlDriver, item: import('../types').PlayableItem): Promise<number> {
  if (item.sourceKind !== 'radio' && item.sourceKind !== 'archive') throw new Error('Remote source required')
  await driver.execute(
    `INSERT INTO track (path, display_name, category, duration_sec, source_kind, source_id, playback_url, creator, artwork_url, source_page_url, country, codec, bitrate, license_url, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_kind, source_id) WHERE source_kind IN ('radio', 'archive') DO UPDATE SET
       display_name=excluded.display_name, duration_sec=excluded.duration_sec, playback_url=excluded.playback_url,
       creator=excluded.creator, artwork_url=excluded.artwork_url, source_page_url=excluded.source_page_url,
       country=excluded.country, codec=excluded.codec, bitrate=excluded.bitrate, license_url=excluded.license_url, tags_json=excluded.tags_json`,
    [`${item.sourceKind}:${item.sourceId}`, item.title, item.category, item.durationSec, item.sourceKind, item.sourceId, item.playbackUrl, item.creator, item.artworkUrl, item.sourcePageUrl, item.country, item.codec, item.bitrate, item.licenseUrl, JSON.stringify(item.tags)]
  )
  const rows = await driver.select<{ id: number }>('SELECT id FROM track WHERE source_kind = ? AND source_id = ?', [item.sourceKind, item.sourceId])
  if (!rows[0]) throw new Error('Saved track could not be read back')
  return rows[0].id
}

export async function listTracks(driver: SqlDriver): Promise<Track[]> {
  const rows = await driver.select<TrackRow>(
    'SELECT * FROM track ORDER BY category, display_name',
    []
  )
  return rows.map(rowToTrack)
}

export async function addTrack(
  driver: SqlDriver,
  track: {
    path: string
    displayName: string
    category?: string
    durationSec?: number | null
  }
): Promise<number> {
  const result = await driver.execute(
    'INSERT INTO track (path, display_name, category, duration_sec, source_kind) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET display_name = excluded.display_name',
    [track.path, track.displayName, track.category ?? 'other', track.durationSec ?? null, track.path.startsWith('builtin:') ? 'builtin' : 'local']
  )
  return result.lastInsertId
}

export async function updateTrack(
  driver: SqlDriver,
  id: number,
  patch: Partial<Omit<Track, 'id' | 'path'>>
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []

  if (patch.displayName !== undefined) {
    updates.push('display_name = ?')
    values.push(patch.displayName)
  }
  if (patch.category !== undefined) {
    updates.push('category = ?')
    values.push(patch.category)
  }
  if (patch.durationSec !== undefined) {
    updates.push('duration_sec = ?')
    values.push(patch.durationSec)
  }

  if (updates.length === 0) return

  values.push(id)
  await driver.execute(
    `UPDATE track SET ${updates.join(', ')} WHERE id = ?`,
    values
  )
}

export async function deleteTrack(driver: SqlDriver, id: number): Promise<void> {
  await driver.execute('DELETE FROM track WHERE id = ?', [id])
}

export async function getTrackByPath(driver: SqlDriver, path: string): Promise<Track | null> {
  const rows = await driver.select<TrackRow>(
    'SELECT * FROM track WHERE path = ?',
    [path]
  )
  return rows.length > 0 ? rowToTrack(rows[0]) : null
}
