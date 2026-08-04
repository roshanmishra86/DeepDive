import { useEffect } from 'react'
import { useAppStore } from '../../stores/app'
import { useTimerStore, pomodoroCounterLabel } from '../../stores/timer'
import { formatClock } from '../../lib/time'

const RING_R = 132
const RING_C = 829.4 // 2π · 132

/**
 * Full-session overlay (dark focus mode). This is the chrome-level shell:
 * ring, clock, phase, and the basic controls. Phase 9 completes it with the
 * attached block name, next-block hint, and in-session music chip.
 */
export function SessionOverlay() {
  const exitSession = useAppStore((s) => s.exitSession)
  const {
    phase,
    totalSec,
    remainingSec,
    running,
    pomodorosDone,
    pomodorosPerBlock,
    toggle,
    rest,
  } = useTimerStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSession()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exitSession])

  const progress = totalSec > 0 ? 1 - remainingSec / totalSec : 0
  const startLabel = running ? 'Pause' : remainingSec < totalSec ? 'Continue' : 'Start'

  return (
    <div className="session-overlay" data-testid="session-overlay">
      <div className="session-tag">
        Deep Work · session {pomodoroCounterLabel(pomodorosDone, pomodorosPerBlock)}
      </div>
      <button type="button" className="session-exit" onClick={exitSession} data-testid="exit-session">
        Exit session
      </button>

      <div className="session-title">Focus session</div>
      <div className="session-meta">Notifications off · phone in the drawer</div>

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
        <button type="button" className="session-primary" onClick={toggle} data-testid="session-toggle">
          {startLabel}
        </button>
        <button type="button" className="session-secondary" onClick={rest}>
          Rest 5 min
        </button>
      </div>
    </div>
  )
}
