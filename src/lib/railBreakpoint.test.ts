import { describe, it, expect } from 'vitest'
import { initialRailCollapsed, nextRailCollapsed, RAIL_BREAKPOINT } from './railBreakpoint'

describe('nextRailCollapsed', () => {
  it('leaves state alone when there is no crossing (both sides wide)', () => {
    expect(
      nextRailCollapsed({ width: 1440, previousWidth: 1400, current: false })
    ).toBeNull()
  })

  it('leaves state alone when there is no crossing (both sides narrow)', () => {
    expect(
      nextRailCollapsed({ width: 1150, previousWidth: 1200, current: true })
    ).toBeNull()
  })

  it('collapses on a downward crossing', () => {
    expect(
      nextRailCollapsed({ width: 1200, previousWidth: 1400, current: false })
    ).toBe(true)
  })

  it('restores on an upward crossing', () => {
    expect(
      nextRailCollapsed({ width: 1400, previousWidth: 1200, current: true })
    ).toBe(false)
  })

  it('does not undo an explicit toggle at a wide width when the resize stays on the wide side', () => {
    // User explicitly collapsed at a wide width; a small resize that stays
    // above the breakpoint must not force it back open.
    expect(
      nextRailCollapsed({ width: 1500, previousWidth: 1450, current: true })
    ).toBeNull()
  })

  it('does not undo an explicit toggle at a narrow width when the resize stays on the narrow side', () => {
    expect(
      nextRailCollapsed({ width: 1150, previousWidth: 1180, current: false })
    ).toBeNull()
  })

  it('treats the breakpoint itself as the "wide" side (exclusive lower bound)', () => {
    expect(
      nextRailCollapsed({ width: RAIL_BREAKPOINT, previousWidth: RAIL_BREAKPOINT - 1, current: true })
    ).toBe(false)
  })
})

describe('initialRailCollapsed', () => {
  it('forces collapsed at a narrow width even when persisted value is false', () => {
    expect(
      initialRailCollapsed({ width: 1100, persisted: false })
    ).toBe(true)
  })

  it('stays collapsed at a narrow width when persisted value is true', () => {
    expect(
      initialRailCollapsed({ width: 1100, persisted: true })
    ).toBe(true)
  })

  it('honours a persisted collapse at a wide width', () => {
    expect(
      initialRailCollapsed({ width: 1440, persisted: true })
    ).toBe(true)
  })

  it('honours a persisted expand at a wide width', () => {
    expect(
      initialRailCollapsed({ width: 1440, persisted: false })
    ).toBe(false)
  })

  it('treats the breakpoint itself as the "wide" side, consistent with nextRailCollapsed', () => {
    expect(
      initialRailCollapsed({ width: RAIL_BREAKPOINT, persisted: false })
    ).toBe(false)
    expect(
      initialRailCollapsed({ width: RAIL_BREAKPOINT - 1, persisted: false })
    ).toBe(true)
  })
})
