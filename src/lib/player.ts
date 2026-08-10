import type { RepeatMode, Track } from '../db/types'

export type EndedAction =
  | { type: 'queue'; index: number }
  | { type: 'library'; id: number }
  | { type: 'replay' }
  | { type: 'stop' }

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === 'off') return 'queue'
  if (mode === 'queue') return 'one'
  return 'off'
}

export function resolveEndedAction(
  mode: RepeatMode,
  queue: number[],
  queueIndex: number,
  trackId: number | null,
  tracks: ReadonlyArray<Pick<Track, 'id'>>
): EndedAction {
  if (mode === 'one') return trackId === null ? { type: 'stop' } : { type: 'replay' }

  if (queue.length > 0) {
    const start = queueIndex < 0 ? 0 : queueIndex + 1
    for (let offset = 0; offset < queue.length; offset += 1) {
      const index = start + offset
      if (index >= queue.length) break
      if (tracks.some((track) => track.id === queue[index])) return { type: 'queue', index }
    }
    if (mode === 'queue') {
      for (let offset = 0; offset < queue.length; offset += 1) {
        const index = offset
        if (tracks.some((track) => track.id === queue[index])) return { type: 'queue', index }
      }
    }
    return { type: 'stop' }
  }

  if (tracks.length === 0) return { type: 'stop' }
  const currentIndex = tracks.findIndex((track) => track.id === trackId)
  const nextIndex = currentIndex + 1
  if (nextIndex < tracks.length) return { type: 'library', id: tracks[nextIndex].id }
  if (mode === 'queue') return { type: 'library', id: tracks[0].id }
  return { type: 'stop' }
}
