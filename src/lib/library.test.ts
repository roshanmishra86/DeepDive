import { describe, it, expect } from 'vitest'
import {
  AUDIO_EXTENSIONS,
  AUDIO_EXTENSIONS_LABEL,
  CATEGORIES,
  audioFilePaths,
  defaultCategory,
  formatClockSec,
  fileNameFromPath,
  displayNameFromPath,
  isSrcFailure,
  trackMeta,
  nextTrackId,
} from './library'

describe('formatClockSec', () => {
  it('formats zero as 0:00', () => {
    expect(formatClockSec(0)).toBe('0:00')
  })

  it('pads seconds below 10', () => {
    expect(formatClockSec(5)).toBe('0:05')
    expect(formatClockSec(61)).toBe('1:01')
  })

  it('formats whole minutes', () => {
    expect(formatClockSec(60)).toBe('1:00')
    expect(formatClockSec(600)).toBe('10:00')
  })

  it('lets minutes exceed 59 (no hours segment)', () => {
    expect(formatClockSec(3720)).toBe('62:00')
    expect(formatClockSec(3599)).toBe('59:59')
    expect(formatClockSec(3600)).toBe('60:00')
  })

  it('floors fractional seconds', () => {
    expect(formatClockSec(61.9)).toBe('1:01')
  })

  it('clamps negative, NaN and infinite input to 0:00', () => {
    expect(formatClockSec(-5)).toBe('0:00')
    expect(formatClockSec(NaN)).toBe('0:00')
    expect(formatClockSec(Infinity)).toBe('0:00')
  })
})

describe('fileNameFromPath', () => {
  it('takes the basename of a posix path', () => {
    expect(fileNameFromPath('/home/user/music/rain.mp3')).toBe('rain.mp3')
  })

  it('takes the basename of a windows path', () => {
    expect(fileNameFromPath('C:\\Users\\user\\Music\\rain.mp3')).toBe('rain.mp3')
  })

  it('handles mixed separators', () => {
    expect(fileNameFromPath('C:\\Users/user/Music\\rain.mp3')).toBe('rain.mp3')
  })

  it('returns a bare filename unchanged', () => {
    expect(fileNameFromPath('rain.mp3')).toBe('rain.mp3')
  })

  it('tolerates a trailing separator', () => {
    expect(fileNameFromPath('/home/user/music/')).toBe('music')
  })

  it('returns the input when it has no usable segments', () => {
    expect(fileNameFromPath('')).toBe('')
  })
})

describe('displayNameFromPath', () => {
  it('strips the extension from the basename', () => {
    expect(displayNameFromPath('/music/brown-deep.mp3')).toBe('brown-deep')
  })

  it('keeps the basename when there is no extension', () => {
    expect(displayNameFromPath('/music/brown-deep')).toBe('brown-deep')
  })

  it('strips only the last extension', () => {
    expect(displayNameFromPath('/music/take.final.flac')).toBe('take.final')
  })

  it('leaves dotfiles alone (leading dot is not an extension)', () => {
    expect(displayNameFromPath('/music/.hidden')).toBe('.hidden')
  })
})

describe('trackMeta', () => {
  it('joins file name and rounded minutes', () => {
    expect(trackMeta({ path: '/music/binaural-40hz.mp3', durationSec: 3720 })).toBe(
      'binaural-40hz.mp3 · 62 min'
    )
  })

  it('rounds seconds to the nearest minute', () => {
    expect(trackMeta({ path: '/music/rain.mp3', durationSec: 2699 })).toBe('rain.mp3 · 45 min')
    expect(trackMeta({ path: '/music/rain.mp3', durationSec: 89 })).toBe('rain.mp3 · 1 min')
    expect(trackMeta({ path: '/music/rain.mp3', durationSec: 29 })).toBe('rain.mp3 · 0 min')
  })

  it('omits the duration segment when durationSec is null', () => {
    expect(trackMeta({ path: '/music/rain.mp3', durationSec: null })).toBe('rain.mp3')
  })
})

describe('nextTrackId', () => {
  const tracks = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('returns null for an empty list', () => {
    expect(nextTrackId([], 1, 1)).toBeNull()
    expect(nextTrackId([], null, -1)).toBeNull()
  })

  it('steps forward and backward', () => {
    expect(nextTrackId(tracks, 1, 1)).toBe(2)
    expect(nextTrackId(tracks, 2, -1)).toBe(1)
  })

  it('wraps around both ends', () => {
    expect(nextTrackId(tracks, 3, 1)).toBe(1)
    expect(nextTrackId(tracks, 1, -1)).toBe(3)
  })

  it('starts from an end when the current id is unknown or null', () => {
    expect(nextTrackId(tracks, null, 1)).toBe(1)
    expect(nextTrackId(tracks, null, -1)).toBe(3)
    expect(nextTrackId(tracks, 999, 1)).toBe(1)
    expect(nextTrackId(tracks, 999, -1)).toBe(3)
  })

  it('wraps a single-track list to itself', () => {
    expect(nextTrackId([{ id: 7 }], 7, 1)).toBe(7)
    expect(nextTrackId([{ id: 7 }], 7, -1)).toBe(7)
  })
})

describe('categories', () => {
  it('offers a stable category list containing the default', () => {
    expect(CATEGORIES).toContain(defaultCategory())
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length)
  })
})

describe('audioFilePaths', () => {
  it('keeps only accepted audio extensions', () => {
    expect(
      audioFilePaths([
        '/music/rain.mp3',
        '/music/notes.txt',
        '/music/cover.png',
        'C:\\Music\\cello.FLAC',
        '/music/tone.WAV',
      ])
    ).toEqual(['/music/rain.mp3', 'C:\\Music\\cello.FLAC', '/music/tone.WAV'])
  })

  it('rejects extensionless and dotfile names', () => {
    expect(audioFilePaths(['/music/README', '/music/.mp3'])).toEqual([])
  })

  it('accepts every extension the picker offers, and the label lists them all', () => {
    for (const ext of AUDIO_EXTENSIONS) {
      expect(audioFilePaths([`/x/track.${ext}`])).toHaveLength(1)
      expect(AUDIO_EXTENSIONS_LABEL).toContain(ext)
    }
  })
})

describe('isSrcFailure', () => {
  it('treats autoplay-policy rejections as NOT a source failure', () => {
    expect(isSrcFailure('NotAllowedError', null)).toBe(false)
    // Even a MediaError code does not override an explicit autoplay cause.
    expect(isSrcFailure('NotAllowedError', 4)).toBe(false)
  })

  it('treats NotSupportedError as a source failure', () => {
    expect(isSrcFailure('NotSupportedError', null)).toBe(true)
  })

  it('reads the MediaError code when present: 2 and 4 fail, 1 and 3 do not', () => {
    expect(isSrcFailure(undefined, 2)).toBe(true) // NETWORK
    expect(isSrcFailure(undefined, 4)).toBe(true) // SRC_NOT_SUPPORTED
    expect(isSrcFailure(undefined, 1)).toBe(false) // ABORTED
    expect(isSrcFailure(undefined, 3)).toBe(false) // DECODE — ambiguous; the element's error event is authoritative
  })

  it('defaults unknown causes to NOT a source failure', () => {
    expect(isSrcFailure(undefined, null)).toBe(false)
    expect(isSrcFailure('AbortError', null)).toBe(false)
  })
})
