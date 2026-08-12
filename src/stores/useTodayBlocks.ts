import type { DayBlock } from '../db/types'
import { useBlocksStore } from './blocks'
import { useDayStore } from './day'

// One frozen array for every "day not loaded yet" read. A fresh `[]` inside
// the selector would be a new reference on every store notification, which
// zustand treats as a changed slice — an infinite re-render loop.
const EMPTY: DayBlock[] = []
Object.freeze(EMPTY)

/**
 * The blocks of the day currently on screen. `currentDay` is read through the
 * hook (not `getState()`) so Today re-renders on midnight rollover.
 *
 * Lives outside `blocks.ts` on purpose: the day store imports the blocks
 * store, and a cycle between the two modules is fragile under Vite.
 */
export function useTodayBlocks(): DayBlock[] {
  const currentDay = useDayStore((d) => d.currentDay)
  return useBlocksStore((s) => s.blocksByDay[currentDay] ?? EMPTY)
}
