/**
 * Built-in sound library — 10 tracks bundled with the app under
 * `public/audio/`. Vite serves `public/` at the app origin, so every file
 * here is reachable at `/audio/<file>.mp3` both under `vite dev` and inside
 * the bundled Tauri app (frontendDist = ../dist); the CSP already allows it
 * (`media-src 'self'`). All ten are Pixabay Content License — free for
 * commercial use, no attribution required.
 *
 * These are deliberately NOT shipped as Tauri `bundle.resources` with a
 * seeded absolute path: AppImage remounts at a fresh `/tmp/.mount_XXXX` on
 * every launch, so an absolute path seeded at install time goes stale on
 * the very next run. A same-origin URL has no such lifetime problem.
 *
 * `path` values for built-in track rows are never the bare filename or a
 * real filesystem path — they carry the `builtin:` prefix so every layer
 * (player, library store, UI) can tell a built-in apart from a user's file
 * without a database column. `builtinByPath` is the one place that undoes
 * the prefix to look up the source metadata; `builtinSrc` is the one place
 * that turns it into a playable URL.
 */

// Type-only: avoids a runtime circular import with library.ts, which itself
// imports isBuiltinPath/builtinByPath from this module for trackMeta().
import type { CATEGORIES } from './library'

export const BUILTIN_PREFIX = 'builtin:'

export interface BuiltinTrack {
  file: string
  title: string
  artist: string
  category: (typeof CATEGORIES)[number]
  durationSec: number
}

export const BUILTIN_TRACKS: readonly BuiltinTrack[] = [
  {
    file: 'alex-morgan-jazz-focus-study-music-556237.mp3',
    title: 'Jazz Focus Study Music',
    artist: 'Alex Morgan',
    category: 'other',
    durationSec: 128,
  },
  {
    file: 'echowavemutawe-deep-focus-vintage-recordings-558080.mp3',
    title: 'Deep Focus Vintage Recordings',
    artist: 'Echowavemutawe',
    category: 'ambient',
    durationSec: 215,
  },
  {
    file: 'leberch-ambient-deep-375261.mp3',
    title: 'Ambient Deep',
    artist: 'Leberch',
    category: 'ambient',
    durationSec: 214,
  },
  {
    file: 'leberch-deep-concentration-263073.mp3',
    title: 'Deep Concentration',
    artist: 'Leberch',
    category: 'ambient',
    durationSec: 252,
  },
  {
    file: 'leberch-deep-meditation-375362.mp3',
    title: 'Deep Meditation',
    artist: 'Leberch',
    category: 'ambient',
    durationSec: 290,
  },
  {
    file: 'poorartistt-no-copyright-deep-focus-music-for-work-552529.mp3',
    title: 'Deep Focus Music for Work',
    artist: 'Poorartistt',
    category: 'ambient',
    durationSec: 175,
  },
  {
    file: 'quietphase-deep-instrumental-496353.mp3',
    title: 'Deep Instrumental',
    artist: 'Quietphase',
    category: 'ambient',
    durationSec: 541,
  },
  {
    file: 'ronaldoreyz-focus-matrix-deep-house-for-study-amp-productivity-561235.mp3',
    title: 'Focus Matrix — Deep House for Study & Productivity',
    artist: 'Ronaldoreyz',
    category: 'other',
    durationSec: 332,
  },
  {
    file: 'the_mountain-deep-emotions-146990.mp3',
    title: 'Deep Emotions',
    artist: 'The Mountain',
    category: 'ambient',
    durationSec: 166,
  },
  {
    file: 'the_mountain-inspiring-focus-137045.mp3',
    title: 'Inspiring Focus',
    artist: 'The Mountain',
    category: 'ambient',
    durationSec: 151,
  },
] as const

/**
 * Bumped whenever BUILTIN_TRACKS changes (a track added, removed, or its
 * metadata edited). The library store compares this against the persisted
 * `builtinSeedVersion` setting to decide whether to seed again — see
 * `src/stores/library.ts`. There is no SQL migration for this: TypeScript
 * is the source of truth, and bumping this constant is how future built-ins
 * ship.
 */
export const BUILTIN_SEED_VERSION = 1

const byPath = new Map<string, BuiltinTrack>(
  BUILTIN_TRACKS.map((t) => [builtinPath(t.file), t])
)

/** Track-table `path` value for a built-in file. */
export function builtinPath(file: string): string {
  return `${BUILTIN_PREFIX}${file}`
}

/** True when `path` identifies a built-in track rather than a user file. */
export function isBuiltinPath(path: string): boolean {
  return path.startsWith(BUILTIN_PREFIX)
}

/**
 * Root-relative URL for a built-in track's `path`, playable directly as an
 * `<audio>` src both under `vite dev` and inside the bundled app. Assumes
 * `isBuiltinPath(path)` — callers branch on that first (see
 * `stores/player.ts`).
 */
export function builtinSrc(path: string): string {
  return `/audio/${path.slice(BUILTIN_PREFIX.length)}`
}

/** Metadata for a built-in track's `path`, or null if it is not one. */
export function builtinByPath(path: string): BuiltinTrack | null {
  return byPath.get(path) ?? null
}
