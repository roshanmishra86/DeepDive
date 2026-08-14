import { describe, expect, it } from 'vitest'
import { messageFor } from './errors'

describe('messageFor', () => {
  it('uses an Error message', () => {
    expect(messageFor(new Error('boom'), 'fallback')).toBe('boom')
  })

  // The regression this module exists for: Tauri IPC rejects with a plain
  // string, so a bare `err instanceof Error` check hid every SQL error.
  it('uses a bare string rejection, as Tauri IPC produces', () => {
    expect(messageFor('table subtask has no column named due_at', 'Could not create subtask')).toBe(
      'table subtask has no column named due_at'
    )
  })

  it('uses a plain object with a string message', () => {
    expect(messageFor({ message: 'no such table: subtask' }, 'fallback')).toBe(
      'no such table: subtask'
    )
  })

  it('falls back for empty, blank and unusable values', () => {
    expect(messageFor(new Error(''), 'fallback')).toBe('fallback')
    expect(messageFor('   ', 'fallback')).toBe('fallback')
    expect(messageFor({ message: '' }, 'fallback')).toBe('fallback')
    expect(messageFor({ code: 5 }, 'fallback')).toBe('fallback')
    expect(messageFor(null, 'fallback')).toBe('fallback')
    expect(messageFor(undefined, 'fallback')).toBe('fallback')
    expect(messageFor(42, 'fallback')).toBe('fallback')
  })
})
