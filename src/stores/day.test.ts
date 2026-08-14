import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as blocksRepo from '../db/repos/blocks'
import * as notesRepo from '../db/repos/notes'
import * as settingsRepo from '../db/repos/settings'
import { useDayStore } from './day'
import { useBlocksStore } from './blocks'
import { useRitualsStore } from './rituals'
import { useTimerStore } from './timer'

/**
 * A local Date for a day key at a given minute-of-day. `tick` is driven with
 * these explicitly — `vi.useFakeTimers` is banned project-wide because it
 * breaks RTL's async utilities, and faking the clock would also hide the very
 * "who reads Date" boundary this store exists to enforce.
 */
function at(day: string, minuteOfDay: number): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0)
}

/** Lets the fire-and-forget rollover chain settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

const DAY = '2026-08-04'
const NEXT_DAY = '2026-08-05'

describe('day store', () => {
  let driver: SqlDriver
  // The stores are module-level singletons: the real actions are restored in
  // afterEach so the recording stand-ins below can't leak into other tests.
  const realRitualsHydrate = useRitualsStore.getState().hydrate
  const realTimerHydrate = useTimerStore.getState().hydrate
  const realEnsureDays = useBlocksStore.getState().ensureDays

  beforeEach(() => {
    driver = createTestDb().driver
    useDayStore.setState({
      currentDay: DAY,
      nowMin: 540,
      shutdownMin: null,
      shutdownIsDefault: true,
      error: null,
    })
    useBlocksStore.setState({ blocksByDay: {}, loadedDays: [], loading: false, error: null })
  })

  afterEach(() => {
    useDayStore.getState().stop()
    useRitualsStore.setState({ hydrate: realRitualsHydrate })
    useTimerStore.setState({ hydrate: realTimerHydrate })
    useBlocksStore.setState({ ensureDays: realEnsureDays })
  })

  it('hydrate resolves the global default shutdown when there is no per-day override', async () => {
    await settingsRepo.setSetting(driver, 'shutdownMin', '1350')

    await useDayStore.getState().hydrate(driver, DAY, 540)

    const state = useDayStore.getState()
    expect(state.currentDay).toBe(DAY)
    expect(state.nowMin).toBe(540)
    expect(state.shutdownMin).toBe(1350)
    expect(state.shutdownIsDefault).toBe(true)
  })

  it('hydrate resolves the per-day override in preference to the global default', async () => {
    await settingsRepo.setSetting(driver, 'shutdownMin', '1350')
    await notesRepo.setDayShutdown(driver, DAY, 1200)

    await useDayStore.getState().hydrate(driver, DAY, 540)

    expect(useDayStore.getState().shutdownMin).toBe(1200)
    expect(useDayStore.getState().shutdownIsDefault).toBe(false)
  })

  it('hydrate with neither a per-day override nor a global default leaves shutdownMin null', async () => {
    await useDayStore.getState().hydrate(driver, DAY, 540)

    expect(useDayStore.getState().shutdownMin).toBeNull()
    expect(useDayStore.getState().shutdownIsDefault).toBe(true)
  })

  it('hydrate with a null driver leaves shutdownMin null (vite-dev case)', async () => {
    await useDayStore.getState().hydrate(null, DAY, 540)

    expect(useDayStore.getState().shutdownMin).toBeNull()
    expect(useDayStore.getState().shutdownIsDefault).toBe(true)
  })

  it('setShutdown with scope "default" updates state and persists to the settings table', async () => {
    await useDayStore.getState().hydrate(driver, DAY, 540)

    await useDayStore.getState().setShutdown(1320, 'default')

    expect(useDayStore.getState().shutdownMin).toBe(1320)
    expect(useDayStore.getState().shutdownIsDefault).toBe(true)
    expect(await settingsRepo.getSetting(driver, 'shutdownMin')).toBe('1320')
  })

  it('setShutdown with scope "day" persists to day_note against currentDay and does not touch the global setting', async () => {
    await useDayStore.getState().hydrate(driver, DAY, 540)

    await useDayStore.getState().setShutdown(1260, 'day')

    expect(useDayStore.getState().shutdownMin).toBe(1260)
    expect(useDayStore.getState().shutdownIsDefault).toBe(false)
    expect(await notesRepo.getDayShutdown(driver, DAY)).toBe(1260)
    expect(await settingsRepo.getSetting(driver, 'shutdownMin')).toBeNull()
  })

  it('tick recomputes nowMin within the same day without touching currentDay', () => {
    useDayStore.getState().tick(at(DAY, 613))
    expect(useDayStore.getState().nowMin).toBe(613)
    expect(useDayStore.getState().currentDay).toBe(DAY)

    useDayStore.getState().tick(at(DAY, 1439))
    expect(useDayStore.getState().nowMin).toBe(1439)
  })

  it('rolls over exactly once per day change, refreshing blocks, rituals and the timer', async () => {
    const ensured: string[][] = []
    const ritualDays: string[] = []
    const timerHydrations: { day?: string; nowMin?: number }[] = []
    useBlocksStore.setState({ ensureDays: async (days) => { ensured.push(days) } })
    useRitualsStore.setState({ hydrate: async (_driver, day) => { ritualDays.push(day) } })
    useTimerStore.setState({ hydrate: async (_driver, day, nowMin) => { timerHydrations.push({ day, nowMin }) } })

    await useDayStore.getState().hydrate(driver, DAY, 1439)

    useDayStore.getState().tick(at(NEXT_DAY, 3))
    await flush()

    // The sidebar's deep-hours card has no store of its own — `currentDay` IS
    // its refresh trigger (its effect is keyed on it), so publishing the new
    // day key is what the card observes.
    expect(useDayStore.getState().currentDay).toBe(NEXT_DAY)
    expect(useDayStore.getState().nowMin).toBe(3)
    expect(ensured).toEqual([[NEXT_DAY]])
    expect(ritualDays).toEqual([NEXT_DAY])
    expect(timerHydrations).toEqual([{ day: NEXT_DAY, nowMin: 3 }])

    // Every later tick on the same day must NOT roll over again.
    useDayStore.getState().tick(at(NEXT_DAY, 4))
    useDayStore.getState().tick(at(NEXT_DAY, 5))
    await flush()

    expect(ensured).toHaveLength(1)
    expect(ritualDays).toHaveLength(1)
    expect(timerHydrations).toHaveLength(1)
  })

  it('rollover loads the new day\'s blocks and re-resolves the per-day shutdown', async () => {
    await blocksRepo.createBlock(driver, {
      day: NEXT_DAY, title: 'Tomorrow', kind: 'deep', startMin: 300, durationMin: 60, sort: 0,
    })
    await notesRepo.setDayShutdown(driver, DAY, 1200)
    await notesRepo.setDayShutdown(driver, NEXT_DAY, 1290)

    await useDayStore.getState().hydrate(driver, DAY, 1439)
    await useBlocksStore.getState().hydrate(driver, [DAY])
    expect(useDayStore.getState().shutdownMin).toBe(1200)

    useDayStore.getState().tick(at(NEXT_DAY, 1))
    await flush()

    expect(useBlocksStore.getState().blocksByDay[NEXT_DAY]?.map((b) => b.title)).toEqual(['Tomorrow'])
    // Yesterday's per-day override must not carry into the new day.
    expect(useDayStore.getState().shutdownMin).toBe(1290)
    expect(useDayStore.getState().shutdownIsDefault).toBe(false)
  })

  it('start installs exactly one interval and its disposer clears it', () => {
    // These tests run in the node environment, so `window` is stubbed here
    // rather than pulling in a DOM just to count intervals.
    const live: number[] = []
    let nextId = 1
    const host = globalThis as { window?: unknown }
    const realWindow = host.window
    host.window = {
      setInterval: () => { const id = nextId++; live.push(id); return id },
      clearInterval: (id: number) => { live.splice(live.indexOf(id), 1) },
    }
    try {
      const dispose = useDayStore.getState().start()
      useDayStore.getState().start() // second call must not add a second interval
      expect(live).toHaveLength(1)
      dispose()
      expect(live).toHaveLength(0)
    } finally {
      host.window = realWindow
    }
  })
})
