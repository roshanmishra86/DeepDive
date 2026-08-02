import { useState, type ReactElement } from 'react'
import { useAppStore, type View } from '../../stores/app'
import { useRitualsStore } from '../../stores/rituals'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Cards } from '@phosphor-icons/react/dist/csr/Cards'
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { MusicNotes } from '@phosphor-icons/react/dist/csr/MusicNotes'
import { Gear } from '@phosphor-icons/react/dist/csr/Gear'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Check } from '@phosphor-icons/react/dist/csr/Check'

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

/** Placeholder mini-histogram until Phase 3 computes real weekly deep hours. */
const WEEK_BARS: (number | null)[] = [60, 85, 45, 72, null, null, null]

function RitualChecklist() {
  const rituals = useRitualsStore((s) => s.rituals)
  const toggle = useRitualsStore((s) => s.toggle)
  const add = useRitualsStore((s) => s.add)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const title = draft.trim()
    if (title) add(title)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="sidebar-section">
      <div className="sidebar-label">Today's ritual</div>
      <div className="ritual-list">
        {rituals.map((r) => (
          <button
            key={r.id}
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
        <div className="deep-card">
          <div className="sidebar-label">Deep hours this week</div>
          <div className="deep-hours" data-testid="deep-hours">
            18<span className="deep-hours-unit">.5 h</span>
          </div>
          <div className="deep-bars">
            {WEEK_BARS.map((h, i) => (
              <div key={i} className="deep-bar-track">
                {h !== null && (
                  <div
                    className={`deep-bar-fill${i === 3 ? ' deep-bar-today' : ''}`}
                    style={{ height: `${h}%` }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
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
