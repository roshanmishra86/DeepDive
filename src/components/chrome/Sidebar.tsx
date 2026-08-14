import { useState, useEffect, type ReactElement } from 'react'
import { useAppStore, type View } from '../../stores/app'
import { useRitualsStore } from '../../stores/rituals'
import { useDayStore } from '../../stores/day'
import { openDatabase } from '../../db/index'
import * as archive from '../../db/repos/archive'
import { toDayKey, startOfWeek, splitDeepHours, goalProgressPercent } from '../../lib/time'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Cards } from '@phosphor-icons/react/dist/csr/Cards'
import { ListChecks } from '@phosphor-icons/react/dist/csr/ListChecks'
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { MusicNotes } from '@phosphor-icons/react/dist/csr/MusicNotes'
import { Gear } from '@phosphor-icons/react/dist/csr/Gear'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { X } from '@phosphor-icons/react/dist/csr/X'

const NAV_ITEMS: { view: View; label: string; icon: ReactElement }[] = [
  {
    view: 'today',
    label: 'Today',
    icon: <Clock size={14} />,
  },
  {
    view: 'week',
    label: 'This Week',
    icon: <CalendarBlank size={14} />,
  },
  {
    view: 'todo',
    label: 'TODO',
    icon: <ListChecks size={14} />,
  },
  {
    view: 'templates',
    label: 'Day Templates',
    icon: <Cards size={14} />,
  },
  {
    view: 'archive',
    label: 'Archive',
    icon: <Archive size={14} />,
  },
  {
    view: 'library',
    label: 'Sound Library',
    icon: <MusicNotes size={14} />,
  },
]

function RitualChecklist() {
  const rituals = useRitualsStore((s) => s.rituals)
  const toggle = useRitualsStore((s) => s.toggle)
  const add = useRitualsStore((s) => s.add)
  const remove = useRitualsStore((s) => s.remove)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const title = draft.trim()
    if (title) void add(title)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="sidebar-section">
      <div className="sidebar-label">Today's ritual</div>
      <div className="ritual-list">
        {rituals.map((r) => (
          <div key={r.id} className="ritual-row">
            <button
              type="button"
              className={`ritual-item${r.done ? ' ritual-item-done' : ''}`}
              onClick={() => toggle(r.id)}
              data-testid={`ritual-${r.id}`}
            >
              <span className="ritual-check" aria-hidden>
                {r.done && (
                  <Check size={8} weight="bold" color="#fff" />
                )}
              </span>
              {r.title}
            </button>
            <button
              type="button"
              className="ritual-remove"
              onClick={() => void remove(r.id)}
              aria-label={`Remove ${r.title}`}
              data-testid={`ritual-remove-${r.id}`}
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {adding ? (
          <input
            className="ritual-input"
            autoFocus
            value={draft}
            placeholder="Ritual name…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft('')
                setAdding(false)
              }
            }}
            onBlur={commit}
            data-testid="ritual-input"
          />
        ) : (
          <button
            type="button"
            className="ritual-add"
            onClick={() => setAdding(true)}
            data-testid="ritual-add"
          >
            <Plus size={11} />
            Add ritual
          </button>
        )}
      </div>
    </div>
  )
}

function DeepHoursCard() {
  const [weekMinutes, setWeekMinutes] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  // Re-read on midnight rollover: the day store publishes the new day key,
  // and this card's week window (and "today" bar) move with it. This is the
  // card's only refresh entry point — it has no store of its own.
  const currentDay = useDayStore((s) => s.currentDay)
  const weeklyGoalMin = useAppStore((s) => s.weeklyGoalMin)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted || !driver) {
          return
        }
        const monday = toDayKey(startOfWeek(new Date()))
        const minutes = await archive.deepMinutesByWeekday(driver, monday)
        if (mounted) {
          setWeekMinutes(minutes)
        }
      } catch (err) {
        console.error('Failed to load deep hours:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [currentDay])

  // Compute total hours and bar heights as percentages
  const totalMinutes = weekMinutes.reduce((sum, m) => sum + m, 0)
  const { whole, frac } = splitDeepHours(totalMinutes)
  const maxMinutes = Math.max(...weekMinutes, 1) // Avoid division by zero
  const barHeights = weekMinutes.map((m) => (m / maxMinutes) * 100)
  const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1 // Mon=0, Sun=6

  // Weekly goal: "of 20 h goal" + a progress bar of completed vs. weeklyGoalMin.
  // This is a *different* metric from the This Week header's planned-minutes
  // figure — it counts only completed deep blocks, historical fact.
  const goalHours = splitDeepHours(weeklyGoalMin)
  const goalLabel = goalHours.frac === '.0' ? `${goalHours.whole} h` : `${goalHours.whole}${goalHours.frac} h`
  const goalPercent = goalProgressPercent(totalMinutes, weeklyGoalMin)

  return (
    <div className="deep-card">
      <div className="sidebar-label">Deep hours this week</div>
      <div className="deep-hours" data-testid="deep-hours">
        {whole}
        <span className="deep-hours-unit">{frac} h</span>
      </div>
      {weeklyGoalMin > 0 && (
        <div className="deep-goal">
          <div className="deep-goal-label">of {goalLabel} goal</div>
          <div
            className="deep-goal-track"
            role="progressbar"
            aria-label="Weekly deep-hours goal progress"
            aria-valuenow={Math.round(goalPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="deep-goal-progress"
          >
            <div className="deep-goal-fill" style={{ width: `${goalPercent}%` }} />
          </div>
        </div>
      )}
      <div className="deep-bars">
        {barHeights.map((height, i) => (
          <div key={i} className="deep-bar-track">
            <div
              className={`deep-bar-fill${i === today ? ' deep-bar-today' : ''}`}
              style={{ height: `${height}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function Sidebar() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const openSettings = useAppStore((s) => s.openSettings)

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Views</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              className={`nav-item${view === item.view ? ' nav-item-active' : ''}`}
              onClick={() => setView(item.view)}
              data-testid={`nav-${item.view}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-divider" />

      <RitualChecklist />

      <div className="sidebar-bottom">
        <DeepHoursCard />
        <button
          type="button"
          className="nav-item settings-entry"
          onClick={openSettings}
          data-testid="open-settings"
        >
          <Gear size={14} />
          Settings
        </button>
      </div>
    </aside>
  )
}
