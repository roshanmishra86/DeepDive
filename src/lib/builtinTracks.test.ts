import { describe, it, expect } from 'vitest'
import { CATEGORIES } from './library'
import {
  BUILTIN_PREFIX,
  BUILTIN_TRACKS,
  builtinByPath,
  builtinPath,
  builtinSrc,
  isBuiltinPath,
} from './builtinTracks'

describe('builtinPath / isBuiltinPath / builtinSrc round-trip', () => {
  it('builtinPath prefixes the file, isBuiltinPath recognises it, builtinSrc strips it back', () => {
    const file = 'rain-forest-ambient.mp3'
    const path = builtinPath(file)

    expect(path).toBe(`${BUILTIN_PREFIX}${file}`)
    expect(isBuiltinPath(path)).toBe(true)
    expect(builtinSrc(path)).toBe(`/audio/${file}`)
  })

  it('produces a root-relative URL for every bundled track', () => {
    for (const t of BUILTIN_TRACKS) {
      expect(builtinSrc(builtinPath(t.file))).toBe(`/audio/${t.file}`)
    }
  })
})

describe('isBuiltinPath negative cases', () => {
  it('rejects a real Windows path', () => {
    expect(isBuiltinPath('C:\\Users\\user\\Music\\rain.mp3')).toBe(false)
  })

  it('rejects a real POSIX path', () => {
    expect(isBuiltinPath('/home/user/music/rain.mp3')).toBe(false)
  })
})

describe('BUILTIN_TRACKS', () => {
  it('assigns every track a category that is a member of CATEGORIES', () => {
    for (const t of BUILTIN_TRACKS) {
      expect(CATEGORIES).toContain(t.category)
    }
  })

  it('has 10 tracks with unique files', () => {
    expect(BUILTIN_TRACKS).toHaveLength(10)
    expect(new Set(BUILTIN_TRACKS.map((t) => t.file)).size).toBe(BUILTIN_TRACKS.length)
  })
})

describe('builtinByPath', () => {
  it('looks up a built-in track by its prefixed path', () => {
    const t = BUILTIN_TRACKS[0]
    expect(builtinByPath(builtinPath(t.file))).toEqual(t)
  })

  it('returns null for a path that is not a built-in', () => {
    expect(builtinByPath('/home/user/music/rain.mp3')).toBeNull()
    expect(builtinByPath(`${BUILTIN_PREFIX}unknown-file.mp3`)).toBeNull()
  })
})
