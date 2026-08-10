import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/app'
import { useTasksStore } from '../../stores/tasks'
import { useTodayStore } from '../../stores/today'
import {
  useTimerStore,
  pomodoroCounterLabel,
} from '../../stores/timer'
import { formatClock } from '../../lib/time'
import { activeWorkBlock, displayPomodoroTarget, isFreshCycle } from '../../lib/timer'
import { upcomingTasks, taskMeta } from '../../lib/week'
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { X } from '@phosphor-icons/react/dist/csr/X'

const RING_R = 86
const RING_C = 540.35 // 2π · 86

function PomodoroWidget() {
  const timerStyle = useAppStore((s) => s.timerStyle)
  const enterSession = useAppStore((s) => s.enterSession)
  const blocks = useTodayStore((s) => s.blocks)
  const {
    phase,
    totalSec,
    remainingSec,
    running,
    pomodorosDone,
    pomodorosPerBlock,
    blockTitle,
    toggle,
    rest,
    reset,
  } = useTimerStore()

  const [nowMin, setNowMin] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })

  // Update nowMin every 30s (same pattern as TodayView).
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 30000)
    return () => window.clearInterval(id)
  }, [])

  const activeBlock = activeWorkBlock(blocks, nowMin)
  const fresh = isFreshCycle({ phase, running, remainingSec, totalSec, pomodorosDone })

  const progress = totalSec > 0 ? 1 - remainingSec / totalSec : 0
  const clock = formatClock(remainingSec)
  const phaseLabel = phase === 'focus' ? 'Focus' : 'Rest'
  // While fresh, preview the currently-active block; once a cycle starts,
  // the attachment snapshot takes over (it survives the block ending).
  const blockLabel = fresh
    ? (activeBlock?.title ?? 'No block attached')
    : (blockTitle ?? 'No block attached')
  const counterTarget = displayPomodoroTarget(fresh, activeBlock, pomodorosPerBlock)
  const startLabel = running ? 'Pause' : remainingSec < totalSec ? 'Continue' : 'Start'

  return (
    <div className="pomodoro">
      <div className="pomodoro-head">
        <span className="rail-label">{phaseLabel}</span>
        <span className="pomodoro-count" data-testid="pomodoro-count">
          {pomodoroCounterLabel(pomodorosDone, counterTarget)}
        </span>
      </div>

      {timerStyle === 'ring' && (
        <div className="pomodoro-ring" data-testid="timer-ring">
          <svg width="198" height="198" viewBox="0 0 198 198" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="99" cy="99" r={RING_R} fill="none" stroke="#e2dbcd" strokeWidth="7" />
            <circle
              cx="99"
              cy="99"
              r={RING_R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - progress)}
              style={{ transition: 'stroke-dashoffset .5s linear' }}
            />
          </svg>
          <div className="pomodoro-ring-center">
            <div className="pomodoro-clock" data-testid="timer-clock">{clock}</div>
            <div className="pomodoro-block">{blockLabel}</div>
          </div>
        </div>
      )}

      {timerStyle === 'numeric' && (
        <div className="pomodoro-numeric" data-testid="timer-numeric">
          <div className="pomodoro-clock-numeric" data-testid="timer-clock">{clock}</div>
          <div className="pomodoro-block">{blockLabel}</div>
        </div>
      )}

      {timerStyle === 'bar' && (
        <div className="pomodoro-bar" data-testid="timer-bar">
          <div className="pomodoro-bar-row">
            <span className="pomodoro-clock-bar" data-testid="timer-clock">{clock}</span>
            <span className="pomodoro-block">{blockLabel}</span>
          </div>
          <div className="pomodoro-bar-track">
            <div className="pomodoro-bar-fill" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
          </div>
        </div>
      )}

      <div className="pomodoro-actions">
        <button
          type="button"
          className="btn-accent pomodoro-start"
          onClick={() => void toggle(activeBlock)}
          data-testid="timer-toggle"
        >
          {startLabel}
        </button>
        <button type="button" className="btn-outline" onClick={() => void rest()} data-testid="timer-rest">
          Rest
        </button>
        <button
          type="button"
          className="btn-outline pomodoro-reset"
          onClick={() => void reset()}
          aria-label="Reset timer"
          data-testid="timer-reset"
        >
          <ArrowCounterClockwise size={14} />
        </button>
      </div>
      <button type="button" className="btn-session" onClick={enterSession} data-testid="enter-session">
        Enter full session →
      </button>
    </div>
  )
}

// Stable ids for parked entries — a module-scope counter, not the array
// index, so removing an entry doesn't reassign keys to the remaining items
// and trigger React reconciliation bugs (e.g. an input mid-edit jumping to
// the wrong row).
let nextParkedId = 1

function DistractionLog() {
  const [parked, setParked] = useState<{ id: number; text: string }[]>([])
  const [draft, setDraft] = useState('')

  const park = () => {
    const text = draft.trim()
    if (text) setParked((p) => [...p, { id: nextParkedId++, text }])
    setDraft('')
  }

  const removeParked = (id: number) => {
    setParked((p) => p.filter((entry) => entry.id !== id))
  }

  return (
    <div className="distraction">
      <div className="rail-label">Distraction log</div>
      <div className="distraction-summary" data-testid="distraction-summary">
        {parked.length === 0
          ? 'Nothing parked — capture urges before they pull you away.'
          : `${parked.length} urge${parked.length === 1 ? '' : 's'} parked · check at shut-down`}
      </div>
      {parked.length > 0 && (
        <ul className="distraction-list">
          {parked.map(({ id, text }) => (
            <li key={id} className="distraction-item">
              <span className="distraction-text">{text}</span>
              <button
                type="button"
                className="distraction-remove"
                onClick={() => removeParked(id)}
                aria-label={`Remove ${text}`}
                data-testid={`distraction-remove-${id}`}
              >
                <X size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className="distraction-input"
        placeholder="Park a thought…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') park()
        }}
        data-testid="distraction-input"
      />
    </div>
  )
}

export function RightRail() {
  const setView = useAppStore((s) => s.setView)
  const tasks = useTasksStore((s) => s.tasks)

  const now = new Date()
  const upcoming = upcomingTasks(tasks, now, 5)

  return (
    <aside className="right-rail">
      <PomodoroWidget />

      <div className="rail-scroll">
        <div className="rail-upcoming-head">
          <span className="rail-label">Upcoming this week</span>
          <button type="button" className="rail-all" onClick={() => setView('week')}>
            All
          </button>
        </div>
        {upcoming.length === 0 ? (
          <div className="rail-upcoming-empty">
            <div className="rail-upcoming-empty-text">No incomplete tasks</div>
          </div>
        ) : (
          <div className="rail-upcoming">
            {upcoming.map((item, i) => {
              const meta = taskMeta(item.task, now)
              return (
                <div key={item.task.id} className="rail-upcoming-item">
                  <span className="rail-upcoming-n" style={{ color: item.rankColor }}>
                    {i + 1}
                  </span>
                  <div>
                    <div className="rail-upcoming-title">
                      {item.task.title}
                    </div>
                    {meta && (
                      <div className="rail-upcoming-meta">{meta}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <DistractionLog />
      </div>
    </aside>
  )
}
