/**
 * User-selectable accent themes. Values come from the mockup's `accent` prop
 * options; hover/surface companions are derived to match the green originals
 * (#264a40 hover / #eef2f0 surface sit at the same lightness offsets).
 */
export const ACCENTS = {
  green: { label: 'Forest', accent: '#2f5d50', hover: '#264a40', surface: '#eef2f0' },
  blue: { label: 'Slate blue', accent: '#3b4a7a', hover: '#303c62', surface: '#eef0f6' },
  sienna: { label: 'Sienna', accent: '#8a4a2c', hover: '#6f3b23', surface: '#f6efe9' },
  charcoal: { label: 'Charcoal', accent: '#3f3a33', hover: '#322e29', surface: '#efece8' },
} as const

export type AccentKey = keyof typeof ACCENTS

export const DEFAULT_ACCENT: AccentKey = 'green'

/** Applies the accent triplet to the given element's CSS custom properties. */
export function applyAccent(key: AccentKey, target: Pick<HTMLElement, 'style'>): void {
  const a = ACCENTS[key]
  target.style.setProperty('--accent', a.accent)
  target.style.setProperty('--accent-hover', a.hover)
  target.style.setProperty('--accent-surface', a.surface)
}
