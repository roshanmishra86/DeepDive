import { describe, expect, it } from 'vitest'
import { nextRepeatMode, resolveEndedAction } from './player'

const tracks = [{ id: 1 }, { id: 2 }, { id: 3 }]

describe('player repeat routing', () => {
  it('cycles through off, queue, one', () => {
    expect(nextRepeatMode('off')).toBe('queue')
    expect(nextRepeatMode('queue')).toBe('one')
    expect(nextRepeatMode('one')).toBe('off')
  })

  it('covers queue/library routing and one-track replay', () => {
    expect(resolveEndedAction('off', [1, 2], 0, 1, tracks)).toEqual({ type: 'queue', index: 1 })
    expect(resolveEndedAction('off', [1, 2], 1, 2, tracks)).toEqual({ type: 'stop' })
    expect(resolveEndedAction('queue', [1, 2], 1, 2, tracks)).toEqual({ type: 'queue', index: 0 })
    expect(resolveEndedAction('off', [], 0, 1, tracks)).toEqual({ type: 'library', id: 2 })
    expect(resolveEndedAction('queue', [], 0, 3, tracks)).toEqual({ type: 'library', id: 1 })
    expect(resolveEndedAction('one', [], 0, 2, tracks)).toEqual({ type: 'replay' })
  })

  it('skips missing queue entries', () => {
    expect(resolveEndedAction('off', [1, 2, 3], 0, 1, [tracks[0], tracks[2]])).toEqual({ type: 'queue', index: 2 })
  })
})
