import { getVersion } from '@tauri-apps/api/app'
import { check as tauriCheck, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauri } from './platform'
import { prepareForExit } from './saveCoordinator'

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'preparing'
  | 'installing'
  | 'error'

export interface UpdateSnapshot {
  phase: UpdatePhase
  currentVersion: string
  availableVersion?: string
  notes?: string
  downloadedBytes?: number
  totalBytes?: number
  error?: string
  failedOperation?: 'check' | 'download' | 'save' | 'install'
  manualMessage?: string
  dismissedVersion?: string
  deferred?: boolean
}

export interface UpdaterDependencies {
  supported: () => boolean
  currentVersion: () => Promise<string>
  check: () => Promise<Update | null>
  prepareForExit: typeof prepareForExit
  relaunch: () => Promise<void>
  setTimeout: typeof globalThis.setTimeout
  setInterval: typeof globalThis.setInterval
  clearTimeout: typeof globalThis.clearTimeout
  clearInterval: typeof globalThis.clearInterval
}

const defaults: UpdaterDependencies = {
  supported: isTauri,
  currentVersion: getVersion,
  check: () => tauriCheck(),
  prepareForExit,
  relaunch,
  setTimeout: globalThis.setTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export class UpdaterController {
  private readonly dependencies: UpdaterDependencies
  private snapshot: UpdateSnapshot = { phase: 'idle', currentVersion: '—' }
  private update: Update | null = null
  private listeners = new Set<() => void>()
  private checkPromise: Promise<void> | null = null
  private downloadPromise: Promise<void> | null = null
  private initialTimer?: ReturnType<typeof globalThis.setTimeout>
  private intervalTimer?: ReturnType<typeof globalThis.setInterval>

  constructor(dependencies: UpdaterDependencies = defaults) {
    this.dependencies = dependencies
  }

  getSnapshot = (): UpdateSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(patch: Partial<UpdateSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  async initialize(): Promise<void> {
    if (!this.dependencies.supported()) return
    try {
      this.publish({ currentVersion: await this.dependencies.currentVersion() })
    } catch (error) {
      console.warn('Could not read application version', error)
    }
  }

  check(manual = false): Promise<void> {
    if (!this.dependencies.supported()) {
      if (manual) this.publish({ manualMessage: 'Updates are available in the Deep Work desktop app.' })
      return Promise.resolve()
    }
    if (this.checkPromise) return this.checkPromise
    this.publish({ phase: 'checking', error: undefined, failedOperation: undefined, manualMessage: undefined })
    this.checkPromise = this.dependencies.check().then((update) => {
      this.update = update
      if (!update) {
        this.publish({ phase: 'idle', availableVersion: undefined, notes: undefined,
          manualMessage: manual ? 'Deep Work is up to date.' : undefined })
        return
      }
      this.publish({
        phase: 'available',
        availableVersion: update.version,
        notes: update.body ?? undefined,
      })
    }).catch((error) => {
      const message = errorMessage(error, 'Could not check for updates.')
      if (manual) {
        this.publish({ phase: 'error', error: message, failedOperation: 'check' })
      } else {
        console.warn('Automatic update check failed', error)
        this.publish({ phase: 'idle' })
      }
    }).finally(() => {
      this.checkPromise = null
    })
    return this.checkPromise
  }

  download(): Promise<void> {
    if (this.downloadPromise) return this.downloadPromise
    if (!this.update) return Promise.resolve()
    let downloadedBytes = 0
    this.publish({ phase: 'downloading', downloadedBytes: 0, totalBytes: undefined, error: undefined })
    this.downloadPromise = this.update.download((event) => {
      if (event.event === 'Started') {
        this.publish({ totalBytes: event.data.contentLength ?? undefined })
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength
        this.publish({ downloadedBytes })
      } else if (event.event === 'Finished') {
        this.publish({ downloadedBytes })
      }
    }).then(() => {
      this.publish({ phase: 'ready', deferred: false, error: undefined, failedOperation: undefined })
    }).catch((error) => {
      this.publish({ phase: 'error', error: errorMessage(error, 'Could not download the update.'), failedOperation: 'download' })
    }).finally(() => {
      this.downloadPromise = null
    })
    return this.downloadPromise
  }

  dismissAvailable(): void {
    if (this.snapshot.availableVersion) this.publish({ dismissedVersion: this.snapshot.availableVersion })
  }

  defer(): void {
    if (this.snapshot.phase === 'ready') this.publish({ deferred: !this.snapshot.deferred })
  }

  async retry(): Promise<void> {
    if (this.snapshot.failedOperation === 'check') return this.check(true)
    if (this.snapshot.failedOperation === 'download') return this.download()
    if (this.snapshot.failedOperation === 'save' || this.snapshot.failedOperation === 'install') {
      return this.installAndRelaunch()
    }
  }

  async installAndRelaunch(): Promise<void> {
    if (!this.update) return
    this.publish({ phase: 'preparing', deferred: false, error: undefined, failedOperation: undefined })
    const result = await this.dependencies.prepareForExit()
    if (!result.safe) {
      this.publish({ phase: 'error', error: result.error, failedOperation: 'save' })
      return
    }
    this.publish({ phase: 'installing' })
    try {
      // Windows exits the process while install() launches NSIS, so the next
      // line is not reached there. AppImage/deb return after installation and
      // need an explicit process relaunch.
      await this.update.install()
      await this.dependencies.relaunch()
    } catch (error) {
      this.publish({ phase: 'error', error: errorMessage(error, 'Could not install the update.'), failedOperation: 'install' })
    }
  }

  startSchedule(initialDelay = 5_000, interval = 6 * 60 * 60 * 1_000): () => void {
    if (!this.dependencies.supported() || this.initialTimer || this.intervalTimer) return () => undefined
    this.initialTimer = this.dependencies.setTimeout(() => {
      void this.check(false)
      this.intervalTimer = this.dependencies.setInterval(() => void this.check(false), interval)
    }, initialDelay)
    return () => {
      if (this.initialTimer) this.dependencies.clearTimeout(this.initialTimer)
      if (this.intervalTimer) this.dependencies.clearInterval(this.intervalTimer)
      this.initialTimer = undefined
      this.intervalTimer = undefined
    }
  }
}

export const updaterController = new UpdaterController()
