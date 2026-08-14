import { useAppStore } from '../../stores/app'
import { useTimerStore } from '../../stores/timer'
import { useDayStore } from '../../stores/day'
import { useTodayBlocks } from '../../stores/useTodayBlocks'
import { usePlayerStore } from '../../stores/player'
import { formatClock } from '../../lib/time'
import {
  activeWorkBlock,
  displayPomodoroTarget,
  isFreshCycle,
  nextBlockHint,
  nextHintLine,
  sessionMetaLine,
  sessionTagLabel,
} from '../../lib/timer'

const RING_R = 132
const RING_C = 829.4 // 2π · 132

/**
 * Full-session overlay (dark focus mode). Shows the attached block (or, while
 * the cycle is still fresh, a preview of the currently-active block), the
 * countdown ring, the session tag, and a bottom row with the in-session
 * music chip and the next-block hint. Escape exits the session via the
 * global shortcut layer in App.tsx (single Escape path; not handled here).
 */
export function SessionOverlay() {
  const exitSession = useAppStore((s) => s.exitSession)
  const blocks = useTodayBlocks()
  const {
    phase,
    totalSec,
    remainingSec,
    running,
    pomodorosDone,
    pomodorosPerBlock,
    blockId,
    blockTitle,
    blockStartMin,
    blockDurationMin,
    blockQuiet,
    toggle,
    rest,
  } = useTimerStore()
  const trackId = usePlayerStore((s) => s.trackId)
  const trackName = usePlayerStore((s) => s.trackName)
  const playing = usePlayerStore((s) => s.playing)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Single app-wide clock, owned by the day store (App.tsx starts it).
  const nowMin = useDayStore((s) => s.nowMin)

  const activeBlock = activeWorkBlock(blocks, nowMin)
  const fresh = isFreshCycle({ phase, running, remainingSec, totalSec, pomodorosDone })

  // Once a cycle is attached, display the snapshot (it survives the block
  // being edited or deleted mid-session); while fresh, preview the active
  // block.
  const displayBlock =
    !fresh && blockId !== null
      ? {
          title: blockTitle!,
          startMin: blockStartMin!,
          durationMin: blockDurationMin!,
          quiet: blockQuiet,
        }
      : activeBlock

  const hint = nextBlockHint(
    blocks,
    !fresh && blockId !== null ? blockId : (activeBlock?.id ?? null),
    nowMin
  )

  const progress = totalSec > 0 ? 1 - remainingSec / totalSec : 0
  const startLabel = running ? 'Pause' : remainingSec < totalSec ? 'Continue' : 'Start'
  const showBottom = trackId !== null || hint !== null

  return (
    <div className="session-overlay" data-testid="session-overlay">
      <div className="session-tag">
        Deep Work · {sessionTagLabel(pomodorosDone, displayPomodoroTarget(fresh, activeBlock, pomodorosPerBlock))}
      </div>
      <button type="button" className="session-exit" onClick={exitSession} data-testid="exit-session">
        Exit session
      </button>

      <div className="session-title">{displayBlock?.title ?? 'Focus session'}</div>
      {displayBlock && <div className="session-meta">{sessionMetaLine(displayBlock)}</div>}

      <div className="session-ring">
        <svg width="300" height="300" viewBox="0 0 300 300" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="150" cy="150" r={RING_R} fill="none" stroke="#31473f" strokeWidth="6" />
          <circle
            cx="150"
            cy="150"
            r={RING_R}
            fill="none"
            stroke="#c9dbd2"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress)}
            style={{ transition: 'stroke-dashoffset .5s linear' }}
          />
        </svg>
        <div className="session-ring-center">
          <div className="session-clock">{formatClock(remainingSec)}</div>
          <div className="session-phase">{phase === 'focus' ? 'Focus' : 'Rest'}</div>
        </div>
      </div>

      <div className="session-actions">
        <button
          type="button"
          className="session-primary"
          onClick={() => void toggle(activeBlock)}
          data-testid="session-toggle"
        >
          {startLabel}
        </button>
        <button type="button" className="session-secondary" onClick={() => void rest()}>
          Rest 5 min
        </button>
      </div>

      {showBottom && (
        <div className="session-bottom">
          {trackId !== null && (
            <button
              type="button"
              className="session-chip"
              onClick={() => void togglePlay()}
              aria-label={playing ? `Pause ${trackName}` : `Play ${trackName}`}
            >
              <span
                className={playing ? 'session-chip-dot session-chip-dot-playing' : 'session-chip-dot'}
              />
              {trackName}
            </button>
          )}
          {hint !== null && <span className="session-next">{nextHintLine(hint)}</span>}
        </div>
      )}
    </div>
  )
}
