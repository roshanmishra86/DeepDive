/**
 * Pure helpers for the sound library: display strings, categories, and
 * track-list navigation. Every piece of derived-string logic for the
 * library view and the music bar lives here, not inline in components.
 */

import type { Track } from '../db/types'

/** Categories offered by the per-track category control. */
export const CATEGORIES = ['ambient', 'binaural', 'classical', 'noise', 'other'] as const

/** Category assigned to a freshly loaded track. */
export function defaultCategory(): string {
  return 'other'
}

/**
 * `m:ss` clock for elapsed/duration readouts. Minutes may exceed 59 (a
 * 62-minute track reads `62:00`, matching the mockup's "62 min" style).
 * Non-finite or negative input clamps to `0:00`.
 */
export function formatClockSec(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Basename of an absolute path, tolerating both `/` and `\` separators. */
export function fileNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter((s) => s.length > 0)
  return segments.length > 0 ? segments[segments.length - 1] : path
}

/** Display name derived from a file path: basename minus its extension. */
export function displayNameFromPath(path: string): string {
  const file = fileNameFromPath(path)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

/**
 * `file.mp3 · 62 min` meta line. The duration segment is omitted when the
 * track's duration is unknown (metadata unreadable or never loaded).
 */
export function trackMeta(track: Pick<Track, 'path' | 'durationSec'>): string {
  const file = fileNameFromPath(track.path)
  if (track.durationSec === null) return file
  const minutes = Math.round(track.durationSec / 60)
  return `${file} · ${minutes} min`
}

/**
 * Id of the track `dir` steps from `currentId` in `tracks`, wrapping around
 * both ends. Returns null for an empty list. An unknown (or null) current
 * id starts from the first track when stepping forward, the last when
 * stepping back.
 */
export function nextTrackId(
  tracks: ReadonlyArray<Pick<Track, 'id'>>,
  currentId: number | null,
  dir: 1 | -1
): number | null {
  if (tracks.length === 0) return null
  const index = tracks.findIndex((t) => t.id === currentId)
  if (index === -1) return dir === 1 ? tracks[0].id : tracks[tracks.length - 1].id
  return tracks[(index + dir + tracks.length) % tracks.length].id
}
