import { useEffect, useRef, useSyncExternalStore } from 'react'
import { ArrowClockwise } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { DownloadSimple } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { updaterController } from '../../lib/updater'
import { getSaveState, prepareForExit, subscribeSaveState } from '../../lib/saveCoordinator'
import { useUpdateSnapshot } from './useUpdateSnapshot'

function Progress({ downloaded = 0, total }: { downloaded?: number; total?: number }) {
  const determinate = typeof total === 'number' && total > 0
  const percent = determinate ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined
  return (
    <div className="update-progress" role="status" aria-label={determinate ? `Update download ${percent}% complete` : 'Downloading update'}>
      <span className={determinate ? 'update-progress-fill' : 'update-progress-fill update-progress-indeterminate'} style={determinate ? { width: `${percent}%` } : undefined} />
    </div>
  )
}

export function UpdateExperience() {
  const update = useUpdateSnapshot()
  const save = useSyncExternalStore(subscribeSaveState, getSaveState)
  const laterRef = useRef<HTMLButtonElement>(null)
  const showAvailable = update.phase === 'available' && update.dismissedVersion !== update.availableVersion
  const showReady = update.phase === 'ready' && !update.deferred

  useEffect(() => {
    if (!showReady) return
    laterRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        updaterController.defer()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showReady])

  return (
    <>
      {(showAvailable || update.phase === 'downloading') && (
        <section className="update-toast" aria-label="Software update" role="status">
          <div className="update-toast-copy">
            <strong>{update.phase === 'downloading' ? `Downloading Deep Work v${update.availableVersion}` : `Deep Work v${update.availableVersion} is available`}</strong>
            {update.phase === 'downloading' && <Progress downloaded={update.downloadedBytes} total={update.totalBytes} />}
          </div>
          {showAvailable && (
            <div className="update-toast-actions">
              <button type="button" className="btn-primary" onClick={() => void updaterController.download()}><DownloadSimple size={13} /> Download update</button>
              <button type="button" className="btn-secondary" onClick={() => updaterController.dismissAvailable()}>Not now</button>
            </div>
          )}
        </section>
      )}

      {save.error && !save.preparing && update.failedOperation !== 'save' && (
        <section className="update-toast update-toast-error" role="alert">
          <div className="update-toast-copy"><strong>Some changes were not saved</strong><span>{save.error}</span></div>
          <button type="button" className="btn-secondary" onClick={() => void prepareForExit()}>Retry</button>
        </section>
      )}

      {showReady && (
        <div className="update-dialog-backdrop">
          <div className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-ready-title">
            <div className="update-dialog-mark" aria-hidden><ArrowClockwise size={18} /></div>
            <h2 id="update-ready-title">Deep Work v{update.availableVersion} is ready to install</h2>
            <p>Restart now to finish. Your pending changes will be saved first.</p>
            <div className="update-dialog-actions">
              <button ref={laterRef} type="button" className="btn-secondary" onClick={() => updaterController.defer()}>Later</button>
              <button type="button" className="btn-primary" onClick={() => void updaterController.installAndRelaunch()}>Restart now</button>
            </div>
          </div>
        </div>
      )}

      {(save.preparing || update.phase === 'preparing' || update.phase === 'installing') && (
        <div className="exit-barrier" role="alert" aria-live="assertive">
          <span className="exit-barrier-spinner" aria-hidden />
          <strong>{update.phase === 'installing' ? 'Installing update…' : 'Saving your work…'}</strong>
          <span>Please keep Deep Work open.</span>
        </div>
      )}
    </>
  )
}
