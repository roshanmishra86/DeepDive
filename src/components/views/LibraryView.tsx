import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { UploadSimple } from '@phosphor-icons/react/dist/csr/UploadSimple'
import { useLibraryStore } from '../../stores/library'
import { isTauri } from '../../lib/platform'
import { fileNameFromPath } from '../../lib/library'
import { TrackCard } from '../library/TrackCard'
import { ToggleSwitch } from '../library/ToggleSwitch'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'm4a']

/**
 * Reads a file's duration by loading metadata on a throwaway audio element.
 * Returns null outside Tauri or when the metadata cannot be read — a null
 * duration is representable (`track.durationSec` is nullable), so a failed
 * probe never blocks a registration.
 */
async function readAudioDurationSec(path: string): Promise<number | null> {
  if (!isTauri() || typeof Audio === 'undefined') return null
  try {
    const el = new Audio()
    el.preload = 'metadata'
    const duration = await new Promise<number>((resolve, reject) => {
      const cleanup = () => {
        el.removeEventListener('loadedmetadata', onMeta)
        el.removeEventListener('error', onError)
      }
      const onMeta = () => {
        cleanup()
        resolve(el.duration)
      }
      const onError = () => {
        cleanup()
        reject(new Error('metadata load failed'))
      }
      el.addEventListener('loadedmetadata', onMeta)
      el.addEventListener('error', onError)
      el.src = convertFileSrc(path)
    })
    return Number.isFinite(duration) ? Math.round(duration) : null
  } catch {
    return null
  }
}

export function LibraryView() {
  const tracks = useLibraryStore((s) => s.tracks)
  const loading = useLibraryStore((s) => s.loading)
  const error = useLibraryStore((s) => s.error)
  const fadeInSec = useLibraryStore((s) => s.fadeInSec)
  const silenceDuringRest = useLibraryStore((s) => s.silenceDuringRest)
  const loopUntilBlockEnd = useLibraryStore((s) => s.loopUntilBlockEnd)
  const registerTrack = useLibraryStore((s) => s.registerTrack)
  const setFadeIn = useLibraryStore((s) => s.setFadeIn)
  const setSilenceDuringRest = useLibraryStore((s) => s.setSilenceDuringRest)
  const setLoopUntilBlockEnd = useLibraryStore((s) => s.setLoopUntilBlockEnd)

  const [notice, setNotice] = useState<string | null>(null)
  const [lastLoadedName, setLastLoadedName] = useState<string | null>(null)

  const handlePick = async () => {
    if (!isTauri()) {
      // Plain `vite dev`: the dialog plugin and disk access do not exist.
      // Say so instead of crashing.
      setNotice('Loading audio files needs the Deep Work desktop app — this browser preview cannot read your disk.')
      return
    }
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
      })
      if (typeof selected !== 'string' || selected === '') return // cancelled
      const durationSec = await readAudioDurationSec(selected)
      const id = await registerTrack(selected, durationSec)
      if (id !== null) {
        setLastLoadedName(fileNameFromPath(selected))
        setNotice(null)
      }
    } catch (err) {
      console.error('Failed to load audio file:', err)
      setNotice('Could not load that file.')
    }
  }

  const header = (
    <div className="lib-header">
      <div>
        <div className="lib-title">Sound library</div>
        <div className="lib-subtitle">Local mp3 files, loaded from disk. Nothing streams.</div>
      </div>
      <button type="button" className="lib-load-btn" onClick={() => void handlePick()}>
        <UploadSimple size={13} />
        Load mp3
      </button>
    </div>
  )

  // Same loading/error contract as ArchiveView: without these branches a
  // failed hydrate renders as an empty library, indistinguishable from a
  // genuinely empty one.
  if (loading) {
    return (
      <div className="lib-view">
        {header}
        <div className="lib-body">
          <div className="view-empty">
            <div className="view-empty-title">Loading library…</div>
          </div>
        </div>
      </div>
    )
  }

  if (error && tracks.length === 0) {
    return (
      <div className="lib-view">
        {header}
        <div className="lib-body">
          <div className="view-empty">
            <div className="view-empty-title" style={{ color: 'var(--danger)' }}>
              Error: {error}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lib-view">
      {header}

      <div className="lib-body">
        {notice && (
          <div className="lib-notice" role="status">
            {notice}
          </div>
        )}
        {/* Mutator failures (remove/category/toggles) land here; hydrate
            failures with an empty library take the full error view above. */}
        {!notice && error && (
          <div className="lib-notice" role="alert">
            {error}
          </div>
        )}

        <button type="button" className="lib-dropzone" onClick={() => void handlePick()}>
          <span className="lib-dropzone-title">Drop an .mp3 here</span>
          <span className="lib-dropzone-sub">
            {lastLoadedName ?? 'No file loaded yet — mp3, wav or flac'}
          </span>
        </button>

        {tracks.length === 0 ? (
          <div className="view-empty">
            <div className="view-empty-title">No tracks yet</div>
            <div className="view-empty-text">
              Load an mp3, wav or flac from disk — the file stays where it is; the library keeps
              the path.
            </div>
          </div>
        ) : (
          <>
            <div className="lib-section-label">On this machine</div>
            <div className="lib-grid">
              {tracks.map((t) => (
                <TrackCard key={t.id} track={t} />
              ))}
              <button type="button" className="lib-card-add" onClick={() => void handlePick()}>
                + Add from disk
              </button>
            </div>
          </>
        )}

        <div className="lib-section-label">Session defaults</div>
        <div className="lib-defaults">
          <div className="lib-default-row">
            <span
              className={
                fadeInSec > 0 ? 'lib-default-label' : 'lib-default-label lib-default-label-off'
              }
            >
              Fade in over 8 s when a block starts
            </span>
            <ToggleSwitch
              checked={fadeInSec > 0}
              onChange={(on) => void setFadeIn(on)}
              label="Fade in over 8 s when a block starts"
            />
          </div>
          <div className="lib-default-row">
            <span
              className={
                silenceDuringRest ? 'lib-default-label' : 'lib-default-label lib-default-label-off'
              }
            >
              Silence during rest
            </span>
            <ToggleSwitch
              checked={silenceDuringRest}
              onChange={(on) => void setSilenceDuringRest(on)}
              label="Silence during rest"
            />
          </div>
          <div className="lib-default-row">
            <span
              className={
                loopUntilBlockEnd ? 'lib-default-label' : 'lib-default-label lib-default-label-off'
              }
            >
              Loop the track until the block ends
            </span>
            <ToggleSwitch
              checked={loopUntilBlockEnd}
              onChange={(on) => void setLoopUntilBlockEnd(on)}
              label="Loop the track until the block ends"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
