import { describe, it, expect } from 'vitest'
import {
  isInteractiveTarget,
  spaceTogglesTimer,
  escapeExitsSession,
  type KeyEventLike,
  type EventTargetLike,
} from './shortcuts'

function keyEvent(overrides: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key: ' ',
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
  }
}

function target(tagName: string, isContentEditable = false): EventTargetLike {
  return { tagName, isContentEditable }
}

describe('isInteractiveTarget', () => {
  it('treats INPUT as interactive', () => {
    expect(isInteractiveTarget(target('INPUT'))).toBe(true)
  })

  it('treats TEXTAREA as interactive', () => {
    expect(isInteractiveTarget(target('TEXTAREA'))).toBe(true)
  })

  it('treats SELECT as interactive', () => {
    expect(isInteractiveTarget(target('SELECT'))).toBe(true)
  })

  it('treats BUTTON as interactive', () => {
    expect(isInteractiveTarget(target('BUTTON'))).toBe(true)
  })

  it('treats A as interactive', () => {
    expect(isInteractiveTarget(target('A'))).toBe(true)
  })

  it('treats a contentEditable element as interactive regardless of tag', () => {
    expect(isInteractiveTarget(target('DIV', true))).toBe(true)
    expect(isInteractiveTarget(target('SPAN', true))).toBe(true)
  })

  it('treats non-interactive tags as non-interactive', () => {
    expect(isInteractiveTarget(target('DIV'))).toBe(false)
    expect(isInteractiveTarget(target('MAIN'))).toBe(false)
    expect(isInteractiveTarget(target('SVG'))).toBe(false)
  })

  it('treats a null target as non-interactive', () => {
    expect(isInteractiveTarget(null)).toBe(false)
  })
})

describe('spaceTogglesTimer', () => {
  it('fires for a plain Space press on a non-interactive target', () => {
    expect(spaceTogglesTimer(keyEvent(), target('DIV'), false)).toBe(true)
  })

  it('fires when the target is null (window-level event)', () => {
    expect(spaceTogglesTimer(keyEvent(), null, false)).toBe(true)
  })

  it('does not fire for any other key', () => {
    expect(spaceTogglesTimer(keyEvent({ key: 'Spacebar' }), target('DIV'), false)).toBe(false)
    expect(spaceTogglesTimer(keyEvent({ key: 'Enter' }), target('DIV'), false)).toBe(false)
    expect(spaceTogglesTimer(keyEvent({ key: 'a' }), target('DIV'), false)).toBe(false)
  })

  it('does not fire on key repeat (held key)', () => {
    expect(spaceTogglesTimer(keyEvent({ repeat: true }), target('DIV'), false)).toBe(false)
  })

  it('does not fire with ctrl held', () => {
    expect(spaceTogglesTimer(keyEvent({ ctrlKey: true }), target('DIV'), false)).toBe(false)
  })

  it('does not fire with meta held', () => {
    expect(spaceTogglesTimer(keyEvent({ metaKey: true }), target('DIV'), false)).toBe(false)
  })

  it('does not fire with alt held', () => {
    expect(spaceTogglesTimer(keyEvent({ altKey: true }), target('DIV'), false)).toBe(false)
  })

  it('does not fire on an interactive target', () => {
    expect(spaceTogglesTimer(keyEvent(), target('INPUT'), false)).toBe(false)
    expect(spaceTogglesTimer(keyEvent(), target('BUTTON'), false)).toBe(false)
    expect(spaceTogglesTimer(keyEvent(), target('DIV', true), false)).toBe(false)
  })

  it('does not fire while a dialog is open', () => {
    expect(spaceTogglesTimer(keyEvent(), target('DIV'), true)).toBe(false)
    expect(spaceTogglesTimer(keyEvent(), null, true)).toBe(false)
  })
})

describe('escapeExitsSession', () => {
  it('exits when the overlay is open and no dialog is open', () => {
    expect(escapeExitsSession(false, true)).toBe(true)
  })

  it('does nothing when the overlay is open but a dialog is open', () => {
    expect(escapeExitsSession(true, true)).toBe(false)
  })

  it('does nothing when the overlay is closed and no dialog is open', () => {
    expect(escapeExitsSession(false, false)).toBe(false)
  })

  it('does nothing when the overlay is closed and a dialog is open', () => {
    expect(escapeExitsSession(true, false)).toBe(false)
  })
})
