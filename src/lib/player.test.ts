import { describe, expect, it } from 'vitest'
import { nextRepeatMode, resolveEndedAction } from './player'

const tracks = [{ id: 1 }, { id: 2 }, { id: 3 }]

describe('player repeat routing', () => {
  it('cycles through off, queue, one', () => {
    expect(nextRepeatMode('off')).toBe('queue')
    expect(nextRepeatMode('queue')).toBe('one')
    expect(nextRepeatMode('one')).toBe('off')
  })

  it('exhausts the natural-end repeat truth table', () => {
    // off: explicit queue advances then stops at the last entry
    expect(resolveEndedAction('off', [1, 2], 0, 1, tracks)).toEqual({ type: 'queue', index: 1 })
    expect(resolveEndedAction('off', [1, 2], 1, 2, tracks)).toEqual({ type: 'stop' })
    // off: no queue advances through the library and stops at its end
    expect(resolveEndedAction('off', [], -1, 1, tracks)).toEqual({ type: 'library', id: 2 })
    expect(resolveEndedAction('off', [], -1, 3, tracks)).toEqual({ type: 'stop' })
    // queue: explicit queue and library both wrap
    expect(resolveEndedAction('queue', [1, 2], 1, 2, tracks)).toEqual({ type: 'queue', index: 0 })
    expect(resolveEndedAction('queue', [], -1, 3, tracks)).toEqual({ type: 'library', id: 1 })
    // one always replays the current track and never advances.
    expect(resolveEndedAction('one', [1, 2], 1, 2, tracks)).toEqual({ type: 'replay' })
    expect(resolveEndedAction('one', [], -1, 2, tracks)).toEqual({ type: 'replay' })
  })

  it('skips missing queue entries', () => {
    expect(resolveEndedAction('off', [1, 2, 3], 0, 1, [tracks[0], tracks[2]])).toEqual({ type: 'queue', index: 2 })
    expect(resolveEndedAction('queue', [1, 2, 3], 2, 3, [tracks[0], tracks[2]])).toEqual({ type: 'queue', index: 0 })
  })

  it('stops for no current track, an empty library, and an off-mode single-track library', () => {
    expect(resolveEndedAction('one', [], -1, null, tracks)).toEqual({ type: 'stop' })
    expect(resolveEndedAction('off', [], -1, 1, [])).toEqual({ type: 'stop' })
    expect(resolveEndedAction('queue', [], -1, 1, [{ id: 1 }])).toEqual({ type: 'library', id: 1 })
    expect(resolveEndedAction('off', [], -1, 1, [{ id: 1 }])).toEqual({ type: 'stop' })
  })
})
