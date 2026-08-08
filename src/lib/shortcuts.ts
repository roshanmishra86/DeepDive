/**
 * Pure predicates for the global keyboard shortcuts (Space toggles the
 * pomodoro timer, Escape exits the full-session overlay). Each function is
 * DOM-free: it takes a minimal struct describing the event and target rather
 * than a real KeyboardEvent/HTMLElement, so the whole layer is unit-testable
 * on the node environment. The single window listener that extracts those
 * structs from real events lives in `useGlobalShortcuts` (App.tsx).
 */

/**
 * The minimal description of a key event the predicates need. `key` is the
 * `KeyboardEvent.key` value — note that for the space bar this is `' '` (a
 * single space character), not `'Space'`.
 */
export interface KeyEventLike {
  key: string
  repeat: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

/**
 * The minimal description of an event target the predicates need. `tagName`
 * is the element's upper-case tag name (`'INPUT'`, `'DIV'`, …) as the DOM
 * reports it; `isContentEditable` is the element's `isContentEditable`
 * property, which already accounts for contentEditable ancestors. A null
 * target (events dispatched at the window/document level) is represented by
 * passing `null`.
 */
export interface EventTargetLike {
  tagName: string
  isContentEditable: boolean
}

const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'])

/**
 * True when the event target is an interactive element that should keep its
 * own keyboard behaviour: an INPUT, TEXTAREA, SELECT, BUTTON or A, or any
 * element inside a contentEditable region. A null target is NOT interactive.
 */
export function isInteractiveTarget(target: EventTargetLike | null): boolean {
  if (target === null) return false
  if (target.isContentEditable) return true
  return INTERACTIVE_TAGS.has(target.tagName)
}

/**
 * True when a key event should toggle the pomodoro timer: the key is Space
 * (`' '`), the press is not a held-key repeat, no ctrl/meta/alt modifier is
 * held, the target is not interactive, and no `[role="dialog"]` modal is
 * open (dialogs own their own keys; a global Space would leak through them).
 */
export function spaceTogglesTimer(
  event: KeyEventLike,
  target: EventTargetLike | null,
  dialogOpen: boolean
): boolean {
  if (event.key !== ' ') return false
  if (event.repeat) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (dialogOpen) return false
  if (isInteractiveTarget(target)) return false
  return true
}

/**
 * True when an Escape press should exit the full-session overlay: the
 * overlay is open AND no `[role="dialog"]` modal is open. Dialogs handle
 * their own Escape; a global handler that also fired would double-close.
 */
export function escapeExitsSession(dialogOpen: boolean, sessionOpen: boolean): boolean {
  return sessionOpen && !dialogOpen
}
