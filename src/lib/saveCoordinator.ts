export type SaveFlush = () => Promise<boolean>

export interface ExitPreparation {
  safe: boolean
  error?: string
}

type SaveState = { preparing: boolean; error?: string }

const participants = new Map<string, SaveFlush>()
const writes = new Set<Promise<unknown>>()
const listeners = new Set<() => void>()
let writeFailed = false
let state: SaveState = { preparing: false }
let preparation: Promise<ExitPreparation> | null = null

function publish(next: SaveState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function registerSaveParticipant(id: string, flush: SaveFlush): () => void {
  participants.set(id, flush)
  return () => {
    if (participants.get(id) === flush) participants.delete(id)
  }
}

export function flushSaveParticipant(id: string): Promise<boolean> {
  return participants.get(id)?.() ?? Promise.resolve(true)
}

export function hasSaveParticipant(id: string): boolean {
  return participants.has(id)
}

export function trackDatabaseWrite<T>(operation: Promise<T>): Promise<T> {
  const tracked = operation.catch((error) => {
    writeFailed = true
    throw error
  })
  writes.add(tracked)
  void tracked.finally(() => writes.delete(tracked)).catch(() => undefined)
  return tracked
}

async function settleWrites(): Promise<void> {
  // A completing write may synchronously schedule another write. Re-snapshot
  // until the set is empty so the barrier includes work spawned by a flush.
  while (writes.size > 0) await Promise.allSettled([...writes])
}

export function prepareForExit(): Promise<ExitPreparation> {
  if (preparation) return preparation
  preparation = (async () => {
    writeFailed = false
    publish({ preparing: true })
    try {
      const results = await Promise.allSettled([...participants.values()].map((flush) => flush()))
      await settleWrites()
      const flushFailed = results.some(
        (result) => result.status === 'rejected' || result.value !== true
      )
      if (flushFailed || writeFailed) {
        const error = 'Deep Work could not save every pending change. Try again before closing.'
        publish({ preparing: false, error })
        return { safe: false, error }
      }
      publish({ preparing: false })
      return { safe: true }
    } catch {
      const error = 'Deep Work could not finish saving your work. Try again before closing.'
      publish({ preparing: false, error })
      return { safe: false, error }
    } finally {
      preparation = null
    }
  })()
  return preparation
}

export function subscribeSaveState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSaveState(): SaveState {
  return state
}

/** Test-only reset; kept explicit so production code cannot accidentally clear a barrier. */
export function resetSaveCoordinatorForTests(): void {
  participants.clear()
  writes.clear()
  writeFailed = false
  state = { preparing: false }
  preparation = null
}
