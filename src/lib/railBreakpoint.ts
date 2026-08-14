// Right-rail collapse breakpoint. Below this width the rail auto-collapses
// to a toggle strip; at or above it, the rail auto-expands. An explicit user
// toggle (`setRailCollapsed`) wins until the window next crosses this width,
// which `nextRailCollapsed` detects by comparing which side of the
// breakpoint the previous and current widths fall on.
export const RAIL_BREAKPOINT = 1320

/**
 * Decide whether the right rail's collapsed state should change in response
 * to a resize, without touching any store or DOM.
 *
 * Returns `null` when `width` and `previousWidth` are on the same side of
 * `RAIL_BREAKPOINT` — no crossing happened, so the caller must leave
 * whatever `current` is (including an explicit user toggle) alone. Returns
 * `true`/`false` only when a crossing occurred, giving the new auto value.
 */
export function nextRailCollapsed(args: {
  width: number
  previousWidth: number
  current: boolean
}): boolean | null {
  const { width, previousWidth } = args
  const wasBelow = previousWidth < RAIL_BREAKPOINT
  const isBelow = width < RAIL_BREAKPOINT
  if (wasBelow === isBelow) return null
  return isBelow
}

/**
 * Decide the right rail's collapsed state on initial mount, once the
 * persisted `setting` row has hydrated.
 *
 * A narrow window (`width < RAIL_BREAKPOINT`) always starts collapsed,
 * regardless of what was persisted — otherwise a launch at, say, 1100px
 * with a persisted `railCollapsed: false` would render the rail expanded
 * and starve `.app-main` of width. A wide window honours the persisted
 * value, which is what makes persistence meaningful: a user who
 * deliberately collapsed a wide window still gets it collapsed after a
 * restart.
 */
export function initialRailCollapsed(args: {
  width: number
  persisted: boolean
}): boolean {
  const { width, persisted } = args
  if (width < RAIL_BREAKPOINT) return true
  return persisted
}
