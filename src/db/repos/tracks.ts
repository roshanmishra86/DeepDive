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
}

function rowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    path: row.path,
    displayName: row.display_name,
    category: row.category,
    durationSec: row.duration_sec,
  }
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
    'INSERT INTO track (path, display_name, category, duration_sec) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET display_name = excluded.display_name',
    [track.path, track.displayName, track.category ?? 'other', track.durationSec ?? null]
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
