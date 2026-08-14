import { useEffect, useState } from 'react'
import { useAppStore, type RepeatStyle, type TimerStyle } from '../../stores/app'
import { ACCENTS, type AccentKey } from '../../lib/accents'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { Check } from '@phosphor-icons/react/dist/csr/Check'

const TIMER_STYLES: { key: TimerStyle; label: string }[] = [
  { key: 'ring', label: 'Ring' },
  { key: 'numeric', label: 'Numeric' },
  { key: 'bar', label: 'Bar' },
]

const REPEAT_STYLES: { key: RepeatStyle; label: string }[] = [
  { key: 'chip', label: 'Chip' },
  { key: 'icon', label: 'Icon' },
  { key: 'none', label: 'None' },
]

// Bounded so a typo can't send the sidebar's progress bar into nonsense
// (a 0.001 h goal, a 10,000 h goal). The value is stored in minutes but
// presented to the user in hours.
const MIN_GOAL_HOURS = 1
const MAX_GOAL_HOURS = 100

function WeeklyGoalControl() {
  const weeklyGoalMin = useAppStore((s) => s.weeklyGoalMin)
  const setWeeklyGoalMin = useAppStore((s) => s.setWeeklyGoalMin)
  const [draft, setDraft] = useState(() => String(weeklyGoalMin / 60))

  // Keep the draft in sync if the stored goal changes from elsewhere (e.g.
  // hydration finishing after this panel is already mounted).
  useEffect(() => {
    setDraft(String(weeklyGoalMin / 60))
  }, [weeklyGoalMin])

  const commit = () => {
    const hours = Number(draft)
    if (!Number.isFinite(hours) || hours <= 0) {
      setDraft(String(weeklyGoalMin / 60))
      return
    }
    const clampedHours = Math.min(MAX_GOAL_HOURS, Math.max(MIN_GOAL_HOURS, hours))
    const minutes = Math.round(clampedHours * 60)
    setWeeklyGoalMin(minutes)
    setDraft(String(clampedHours))
  }

  return (
    <div className="settings-section">
      <div className="settings-label">Weekly focus goal</div>
      <div className="settings-goal-row">
        <input
          type="number"
          className="settings-goal-input"
          min={MIN_GOAL_HOURS}
          max={MAX_GOAL_HOURS}
          step="0.5"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          aria-label="Weekly focus goal in hours"
          data-testid="weekly-goal-input"
        />
        <span className="settings-goal-suffix">hours / week</span>
      </div>
      <div className="settings-hint">
        Drives the "of N h goal" progress bar on the sidebar's deep-hours card.
      </div>
    </div>
  )
}

/**
 * Modal settings panel (the mockup exposes these as design-time props; the
 * app needs a real UI). Values live in the app store until Phase 3 persists
 * them to the `setting` table.
 */
export function SettingsPanel() {
  const { accent, timerStyle, repeatStyle, setAccent, setTimerStyle, setRepeatStyle, closeSettings } =
    useAppStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSettings])

  return (
    <div className="settings-backdrop" onClick={closeSettings} data-testid="settings-backdrop">
      <div
        className="settings-panel"
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <span className="settings-title">Settings</span>
          <button
            type="button"
            className="settings-close"
            onClick={closeSettings}
            aria-label="Close settings"
            data-testid="settings-close"
          >
            <X size={11} />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-label">Accent</div>
          <div className="settings-swatches">
            {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`settings-swatch${accent === key ? ' settings-swatch-active' : ''}`}
                style={{ background: ACCENTS[key].accent }}
                onClick={() => setAccent(key)}
                aria-label={`Accent: ${ACCENTS[key].label}`}
                title={ACCENTS[key].label}
                data-testid={`accent-${key}`}
              >
                {accent === key && (
                  <Check size={10} weight="bold" color="#fbfaf7" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">Timer style</div>
          <div className="settings-segment">
            {TIMER_STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`settings-option${timerStyle === s.key ? ' settings-option-active' : ''}`}
                onClick={() => setTimerStyle(s.key)}
                data-testid={`timer-style-${s.key}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">Repeat badge</div>
          <div className="settings-segment">
            {REPEAT_STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`settings-option${repeatStyle === s.key ? ' settings-option-active' : ''}`}
                onClick={() => setRepeatStyle(s.key)}
                data-testid={`repeat-style-${s.key}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="settings-hint">
            How repeating blocks are marked on the timeline (Phase 4).
          </div>
        </div>

        <WeeklyGoalControl />
      </div>
    </div>
  )
}
