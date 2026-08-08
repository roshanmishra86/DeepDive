import { X } from '@phosphor-icons/react/dist/csr/X'
import type { Track } from '../../db/types'
import { CATEGORIES, trackMeta } from '../../lib/library'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'

/**
 * One track in the "On this machine" grid. The main area is a real button
 * (play/pause); the remove button and category select are siblings, so no
 * interactive element is nested inside another. The currently-playing card
 * gets the accent border, a "Now playing" label and a pulsing dot per the
 * mockup; a track whose file failed to load renders a "File not found"
 * state with the remove affordance still available.
 */
export function TrackCard({ track }: { track: Track }) {
  const isCurrent = usePlayerStore((s) => s.trackId === track.id)
  const playing = usePlayerStore((s) => s.playing)
  const playerMissing = usePlayerStore((s) => s.missing)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const removeTrack = useLibraryStore((s) => s.removeTrack)
  const setCategory = useLibraryStore((s) => s.setCategory)

  const missing = isCurrent && playerMissing
  const nowPlaying = isCurrent && playing && !missing

  // A category from outside the offered list (e.g. an older row) still gets
  // an option, so the select never renders a value it cannot display.
  const categoryOptions = (CATEGORIES as readonly string[]).includes(track.category)
    ? CATEGORIES
    : [...CATEGORIES, track.category]

  const cardClass = nowPlaying
    ? 'lib-card lib-card-playing'
    : missing
      ? 'lib-card lib-card-missing'
      : 'lib-card'

  const handleActivate = () => {
    if (isCurrent) {
      void togglePlay()
    } else {
      void playTrack(track)
    }
  }

  return (
    <div className={cardClass}>
      <div className="lib-card-top">
        {nowPlaying ? (
          <span className="lib-card-now">
            Now playing
            <span className="lib-card-dot" aria-hidden />
          </span>
        ) : (
          <span className="lib-card-cat">{track.category}</span>
        )}
        <button
          type="button"
          className="btn-icon lib-card-remove"
          aria-label={`Remove ${track.displayName}`}
          onClick={() => void removeTrack(track.id)}
        >
          <X size={12} />
        </button>
      </div>

      <button
        type="button"
        className="lib-card-main"
        aria-label={
          nowPlaying ? `Pause ${track.displayName}` : `Play ${track.displayName}`
        }
        onClick={handleActivate}
      >
        <span className={nowPlaying ? 'lib-card-name lib-card-name-playing' : 'lib-card-name'}>
          {track.displayName}
        </span>
        <span className={missing ? 'lib-card-meta lib-card-meta-missing' : 'lib-card-meta'}>
          {missing ? 'File not found' : trackMeta(track)}
        </span>
      </button>

      <select
        className="lib-card-select"
        value={track.category}
        aria-label={`Category for ${track.displayName}`}
        onChange={(e) => void setCategory(track.id, e.target.value)}
      >
        {categoryOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  )
}
