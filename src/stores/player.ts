import { create } from 'zustand'

/**
 * Music-bar playback state. The library is empty until Phase 8 (tracks come
 * from disk via the dialog plugin), so the bar renders an empty state and the
 * transport is inert until a track exists.
 */
interface PlayerState {
  volume: number // 0–100
  playing: boolean
  hasTrack: boolean
  trackName: string | null
  trackMeta: string | null
  setVolume: (volume: number) => void
  togglePlay: () => void
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  volume: 62,
  playing: false,
  hasTrack: false,
  trackName: null,
  trackMeta: null,
  setVolume: (volume) => set({ volume: Math.min(100, Math.max(0, Math.round(volume))) }),
  togglePlay: () => set((s) => (s.hasTrack ? { playing: !s.playing } : s)),
}))
