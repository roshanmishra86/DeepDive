/**
 * Database connection pool and repository namespace exports.
 * Memoizes the driver connection so repeated calls share one instance.
 */

import { isTauri } from '../lib/platform'
import type { SqlDriver } from './driver'
import { TauriDriver } from './tauriDriver'

let driverPromise: Promise<SqlDriver | null> | null = null

export async function openDatabase(): Promise<SqlDriver | null> {
  // Return cached promise if already initiated
  if (driverPromise) {
    return driverPromise
  }

  // Create and cache the connection promise. If connecting fails, clear the cache
  // so the next call retries instead of re-throwing the same rejection forever.
  driverPromise = (async () => {
    if (!isTauri()) {
      return null
    }

    try {
      const driver = new TauriDriver()
      await driver.connect()
      return driver
    } catch (err) {
      driverPromise = null
      throw err
    }
  })()

  return driverPromise
}

// Re-export types and repositories
export type { SqlDriver, SqlResult } from './driver'
export type {
  Task,
  DayBlock,
  Template,
  TemplateBlock,
  Ritual,
  RitualLog,
  PomodoroSession,
  DayNote,
  Distraction,
  Track,
  Setting,
  BlockKind,
  SessionPhase,
  DayStatus,
} from './types'

// Re-export all repositories
export * as tasks from './repos/tasks'
export * as blocks from './repos/blocks'
export * as templates from './repos/templates'
export * as rituals from './repos/rituals'
export * as sessions from './repos/sessions'
export * as notes from './repos/notes'
export * as tracks from './repos/tracks'
export * as settings from './repos/settings'
export * as archive from './repos/archive'
