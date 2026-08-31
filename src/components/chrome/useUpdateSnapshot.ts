import { useSyncExternalStore } from 'react'
import { updaterController } from '../../lib/updater'

export function useUpdateSnapshot() {
  return useSyncExternalStore(updaterController.subscribe, updaterController.getSnapshot)
}
