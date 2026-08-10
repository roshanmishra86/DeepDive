import { usePlayerStore } from '../../stores/player'
import { useAppStore } from '../../stores/app'
import { formatClockSec } from '../../lib/library'
import { MusicNotes } from '@phosphor-icons/react/dist/csr/MusicNotes'
import { SkipBack } from '@phosphor-icons/react/dist/csr/SkipBack'
import { SkipForward } from '@phosphor-icons/react/dist/csr/SkipForward'
import { Play } from '@phosphor-icons/react/dist/csr/Play'
import { Pause } from '@phosphor-icons/react/dist/csr/Pause'
import { SpeakerHigh } from '@phosphor-icons/react/dist/csr/SpeakerHigh'
import { Repeat } from '@phosphor-icons/react/dist/csr/Repeat'
import { RepeatOnce } from '@phosphor-icons/react/dist/csr/RepeatOnce'

/**
 * 66px footer. Renders the player store: real elapsed/duration times, a
 * click-to-seek progress bar, working transport, and a volume slider that
 * persists. Empty state ("Nothing loaded" + link to the library) shows until
 * a track has been selected.
 */
export function MusicBar() {
  const trackId = usePlayerStore((s) => s.trackId)
  const trackName = usePlayerStore((s) => s.trackName)
  const trackMeta = usePlayerStore((s) => s.trackMeta)
  const playing = usePlayerStore((s) => s.playing)
  const volume = usePlayerStore((s) => s.volume)
  const positionSec = usePlayerStore((s) => s.positionSec)
  const durationSec = usePlayerStore((s) => s.durationSec)
  const missing = usePlayerStore((s) => s.missing)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const seek = usePlayerStore((s) => s.seek)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const repeatMode = usePlayerStore((s) => s.repeatMode)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const queueLength = usePlayerStore((s) => s.queue.length)
  const setView = useAppStore((s) => s.setView)

  const hasTrack = trackId !== null
  const seekable = hasTrack && durationSec > 0
  const pct = seekable ? Math.min(100, (positionSec / durationSec) * 100) : 0

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekable) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    seek(fraction * durationSec)
  }

  const handleSeekKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!seekable) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      seek(positionSec - 5)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      seek(positionSec + 5)
    }
  }

  return (
    <footer className="musicbar">
      <div className="musicbar-track">
        <div className="musicbar-art" aria-hidden>
          <MusicNotes size={18} />
        </div>
        <div className="musicbar-names">
          <div className="musicbar-name" data-testid="musicbar-name">
            {hasTrack ? trackName : 'Nothing loaded'}
          </div>
          <div className="musicbar-meta">
            {hasTrack ? (
              missing ? (
                `File not found — ${trackMeta}`
              ) : (
                trackMeta
              )
            ) : (
              <button type="button" className="musicbar-goto" onClick={() => setView('library')}>
                Sound Library → Load mp3
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="musicbar-transport">
        <button
          type="button"
          className="musicbar-skip"
          disabled={!hasTrack}
          aria-label="Previous track"
          onClick={() => void prev()}
        >
          <SkipBack size={14} weight="fill" />
        </button>
        <button
          type="button"
          className="musicbar-play"
          onClick={() => void togglePlay()}
          disabled={!hasTrack}
          aria-label={playing ? 'Pause' : 'Play'}
          data-testid="musicbar-play"
        >
          {playing ? (
            <Pause size={13} weight="fill" />
          ) : (
            <Play size={13} weight="fill" />
          )}
        </button>
        <button
          type="button"
          className="musicbar-skip"
          disabled={!hasTrack}
          aria-label="Next track"
          onClick={() => void next()}
        >
          <SkipForward size={14} weight="fill" />
        </button>
        {/* Always available, queue or not: with a queue it decides whether
            the queue wraps or stops at its end; without one it repeats the
            loaded track. */}
        <button
          type="button"
          className={repeatMode !== 'off' ? 'musicbar-repeat musicbar-repeat-on' : 'musicbar-repeat'}
          aria-label={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'queue' ? 'Repeat queue' : 'Repeat one'}
          title={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'queue' ? 'Repeat queue' : 'Repeat one'}
          onClick={toggleRepeat}
          data-testid="musicbar-repeat"
        >
          {repeatMode === 'one' ? <RepeatOnce size={14} weight="bold" /> : <Repeat size={14} weight="bold" />}
        </button>
        {queueLength > 0 && (
          <span className="musicbar-queue-count" title={`${queueLength} in queue`}>
            {queueLength}
          </span>
        )}
      </div>

      <div className="musicbar-progress">
        <span className="musicbar-time">{formatClockSec(positionSec)}</span>
        <div
          className="musicbar-progress-track"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationSec)}
          aria-valuenow={Math.round(positionSec)}
          aria-disabled={!seekable}
          tabIndex={seekable ? 0 : -1}
          onClick={handleSeekClick}
          onKeyDown={handleSeekKey}
        >
          <div className="musicbar-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="musicbar-time">{formatClockSec(durationSec)}</span>
      </div>

      <div className="musicbar-volume">
        <SpeakerHigh size={15} />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          data-testid="musicbar-volume"
        />
      </div>
    </footer>
  )
}
