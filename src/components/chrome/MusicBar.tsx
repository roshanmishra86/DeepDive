import { usePlayerStore } from '../../stores/player'
import { useAppStore } from '../../stores/app'
import { MusicNotes } from '@phosphor-icons/react/dist/csr/MusicNotes'
import { SkipBack } from '@phosphor-icons/react/dist/csr/SkipBack'
import { SkipForward } from '@phosphor-icons/react/dist/csr/SkipForward'
import { Play } from '@phosphor-icons/react/dist/csr/Play'
import { Pause } from '@phosphor-icons/react/dist/csr/Pause'
import { SpeakerHigh } from '@phosphor-icons/react/dist/csr/SpeakerHigh'

/**
 * 66px footer. The library starts empty (Phase 8 loads real files), so the
 * bar shows an empty state and the transport stays inert until a track
 * exists. Volume is live and will drive the <audio> element added in Phase 8.
 */
export function MusicBar() {
  const { volume, playing, hasTrack, trackName, trackMeta, setVolume, togglePlay } =
    usePlayerStore()
  const setView = useAppStore((s) => s.setView)

  return (
    <footer className="musicbar">
      <div className="musicbar-track">
        <div className="musicbar-art" aria-hidden>
          <MusicNotes size={18} color="#8b8375" />
        </div>
        <div className="musicbar-names">
          <div className="musicbar-name" data-testid="musicbar-name">
            {hasTrack ? trackName : 'Nothing loaded'}
          </div>
          <div className="musicbar-meta">
            {hasTrack ? (
              trackMeta
            ) : (
              <button type="button" className="musicbar-goto" onClick={() => setView('library')}>
                Sound Library → Load mp3
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="musicbar-transport">
        <button type="button" className="musicbar-skip" disabled={!hasTrack} aria-label="Previous track">
          <SkipBack size={14} weight="fill" />
        </button>
        <button
          type="button"
          className="musicbar-play"
          onClick={togglePlay}
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
        <button type="button" className="musicbar-skip" disabled={!hasTrack} aria-label="Next track">
          <SkipForward size={14} weight="fill" />
        </button>
      </div>

      <div className="musicbar-progress">
        <span className="musicbar-time">0:00</span>
        <div className="musicbar-progress-track">
          <div className="musicbar-progress-fill" style={{ width: '0%' }} />
        </div>
        <span className="musicbar-time">0:00</span>
      </div>

      <div className="musicbar-volume">
        <SpeakerHigh size={15} color="#8b8375" />
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
