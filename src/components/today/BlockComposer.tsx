import { useEffect, useState } from 'react'
import { useTodayStore } from '../../stores/today'
import { useTasksStore } from '../../stores/tasks'
import { openDatabase } from '../../db/index'
import * as tracksRepo from '../../db/repos/tracks'
import { minutesToClock, parseClock, parseDuration } from '../../lib/time'
import {
  maxPomodoros,
  minDurationFor,
  checkShutdown,
  composerSummary,
  initialComposerDraft,
  resolveTaskAction,
  DURATION_PRESETS,
} from '../../lib/today'
import type { BlockKind, BlockRepeat, Track } from '../../db/types'

interface BlockComposerProps {
  blockId: number | null
  startMin: number
  onDone: () => void
}

const KIND_OPTIONS: { value: BlockKind; label: string }[] = [
  { value: 'deep', label: 'Deep' },
  { value: 'shallow', label: 'Shallow' },
  { value: 'break', label: 'Break' },
  { value: 'ritual', label: 'Ritual' },
]

const REPEAT_OPTIONS: { value: BlockRepeat; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
]

export function BlockComposer({ blockId, startMin: startMinProp, onDone }: BlockComposerProps) {
  const blocks = useTodayStore((s) => s.blocks)
  const addBlock = useTodayStore((s) => s.addBlock)
  const editBlock = useTodayStore((s) => s.editBlock)
  const removeBlock = useTodayStore((s) => s.removeBlock)
  const shutdownMin = useTodayStore((s) => s.shutdownMin)
  const setShutdown = useTodayStore((s) => s.setShutdown)

  const tasks = useTasksStore((s) => s.tasks)
  const addTask = useTasksStore((s) => s.addTask)
  const editTask = useTasksStore((s) => s.editTask)

  const block = blockId !== null ? blocks.find((b) => b.id === blockId) ?? null : null
  const linkedTask = block?.taskId ? tasks.find((t) => t.id === block.taskId) ?? null : null

  const [draft, setDraft] = useState(() =>
    initialComposerDraft(
      block,
      startMinProp,
      linkedTask ? { important: linkedTask.important, urgent: linkedTask.urgent } : null
    )
  )

  const [startText, setStartText] = useState(() => minutesToClock(draft.startMin))
  const [durationText, setDurationText] = useState(() => String(draft.durationMin))
  const [rippleEnabled, setRippleEnabled] = useState(true)

  const [shutdownInputText, setShutdownInputText] = useState('')
  const [shutdownAlert, setShutdownAlert] = useState(false)

  const [tracks, setTracks] = useState<Track[]>([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!driver || !mounted) return
        const list = await tracksRepo.listTracks(driver)
        if (mounted) setTracks(list)
      } catch (err) {
        console.error('Failed to load tracks:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const startValid = parseClock(startText, 0) !== null
  const durationValid = parseDuration(durationText) !== null
  const shutdownNeeded = !block && shutdownMin === null
  const shutdownParsed = shutdownNeeded ? parseClock(shutdownInputText, 0) : null
  const showPomodoros = draft.kind !== 'break' && draft.kind !== 'ritual'

  const handleStartTextChange = (raw: string) => {
    setStartText(raw)
    const parsed = parseClock(raw, 0)
    if (parsed !== null) setDraft((d) => ({ ...d, startMin: parsed }))
  }

  const handleDurationTextChange = (raw: string) => {
    setDurationText(raw)
    const parsed = parseDuration(raw)
    if (parsed !== null) {
      const clamped = Math.max(minDurationFor(draft.kind), parsed)
      setDraft((d) => ({ ...d, durationMin: clamped, pomodoros: Math.min(d.pomodoros, maxPomodoros(clamped)) }))
    }
  }

  const applyDurationPreset = (preset: number) => {
    const next = Math.max(minDurationFor(draft.kind), preset)
    setDraft((d) => ({ ...d, durationMin: next, pomodoros: Math.min(d.pomodoros, maxPomodoros(next)) }))
    setDurationText(String(next))
  }

  const stepPomodoros = (delta: number) => {
    if (!showPomodoros) return
    setDraft((d) => {
      const max = maxPomodoros(d.durationMin)
      const next = Math.max(0, Math.min(max, d.pomodoros + delta))
      return { ...d, pomodoros: next }
    })
  }

  const handleKindChange = (kind: BlockKind) => {
    const minDur = minDurationFor(kind)
    const nextDuration = Math.max(minDur, draft.durationMin)
    const nextPomodoros = kind === 'break' || kind === 'ritual' ? 0 : Math.min(draft.pomodoros, maxPomodoros(nextDuration))
    setDraft((d) => ({ ...d, kind, durationMin: nextDuration, pomodoros: nextPomodoros }))
    if (nextDuration !== draft.durationMin) setDurationText(String(nextDuration))
  }

  const canSave =
    draft.title.trim() !== '' &&
    startValid &&
    durationValid &&
    (!shutdownNeeded || shutdownParsed !== null)

  const doSave = async () => {
    const title = draft.title.trim()
    const effectivePomodoros = showPomodoros ? draft.pomodoros : 0

    if (block) {
      const action = resolveTaskAction(block.taskId, draft.important, draft.urgent)
      let taskId = block.taskId
      if (action === 'edit' && block.taskId !== null) {
        await editTask(block.taskId, { important: draft.important, urgent: draft.urgent })
      } else if (action === 'create') {
        taskId = await addTask({
          title,
          notes: draft.note,
          important: draft.important,
          urgent: draft.urgent,
          estimateMin: draft.durationMin,
        })
      }
      await editBlock(
        block.id,
        {
          title,
          kind: draft.kind,
          durationMin: draft.durationMin,
          startMin: draft.startMin,
          pomodoros: effectivePomodoros,
          note: draft.note,
          repeat: draft.repeat,
          trackId: draft.trackId,
          quiet: draft.quiet,
          taskId,
        },
        rippleEnabled
      )
      onDone()
      return
    }

    // Creating: shutdown gate.
    let effectiveShutdown = shutdownMin
    if (shutdownNeeded) {
      if (shutdownParsed === null) return
      effectiveShutdown = shutdownParsed
      await setShutdown(shutdownParsed, 'default')
    }

    const check = checkShutdown(draft.startMin, draft.durationMin, effectiveShutdown)
    if (!check.fits) {
      setShutdownAlert(true)
      return
    }

    const action = resolveTaskAction(null, draft.important, draft.urgent)
    let taskId: number | null = null
    if (action === 'create') {
      taskId = await addTask({
        title,
        notes: draft.note,
        important: draft.important,
        urgent: draft.urgent,
        estimateMin: draft.durationMin,
      })
    }

    await addBlock({
      title,
      kind: draft.kind,
      durationMin: draft.durationMin,
      startMin: draft.startMin,
      pomodoros: effectivePomodoros,
      note: draft.note,
      repeat: draft.repeat,
      trackId: draft.trackId,
      quiet: draft.quiet,
      taskId,
    })
    onDone()
  }

  const handleAddToThisWeek = async () => {
    await addTask({ title: draft.title.trim(), estimateMin: draft.durationMin })
    onDone()
  }

  const handleShorten = () => {
    if (shutdownMin === null) return
    const check = checkShutdown(draft.startMin, draft.durationMin, shutdownMin)
    const next = Math.max(minDurationFor(draft.kind), check.fitDurationMin)
    setDraft((d) => ({ ...d, durationMin: next, pomodoros: Math.min(d.pomodoros, maxPomodoros(next)) }))
    setDurationText(String(next))
    setShutdownAlert(false)
  }

  const handleDelete = () => {
    if (!block) return
    void removeBlock(block.id)
    onDone()
  }

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onDone()
      return
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      void doSave()
    }
  }

  const fitCheck =
    !block && shutdownMin !== null ? checkShutdown(draft.startMin, draft.durationMin, shutdownMin) : null
  const canShorten = fitCheck !== null && fitCheck.fitDurationMin >= minDurationFor(draft.kind)

  return (
    <div className="composer-overlay" onClick={onDone}>
      <div
        className="composer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={block ? `Edit block: ${block.title}` : 'New block'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleContainerKeyDown}
      >
        <div className="composer-header">
          <div className="composer-header-left">
            <span className="composer-header-icon">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="2" y="2.6" width="10" height="9.2" rx="1.4" />
                <path d="M4.6 6.4h4.8M4.6 8.8h3" />
              </svg>
            </span>
            <span className="composer-header-title">{block ? 'Edit block' : 'New block'}</span>
          </div>
          <button type="button" className="composer-close" onClick={onDone} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>

        <div className="composer-name-block">
          <input
            type="text"
            className="composer-name-input"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="What is this block for?"
            autoFocus
          />
          <input
            type="text"
            className="composer-note-input"
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            placeholder="One line of intent — what does done look like?"
          />
        </div>

        {shutdownNeeded && (
          <div className="composer-shutdown-gate">
            <label className="composer-field-label" htmlFor="composer-shutdown">
              When do you shut down today?
            </label>
            <input
              id="composer-shutdown"
              type="text"
              className="composer-mono-input"
              value={shutdownInputText}
              onChange={(e) => setShutdownInputText(e.target.value)}
              onBlur={() => {
                const parsed = parseClock(shutdownInputText, 0)
                if (parsed !== null) void setShutdown(parsed, 'default')
              }}
              placeholder="8pm"
            />
            {shutdownInputText !== '' && shutdownParsed === null && (
              <span className="composer-hint composer-hint-error">Try 5pm, 17:30, or 9:05 am</span>
            )}
          </div>
        )}

        <div className="composer-grid-3">
          <div className="composer-field">
            <span className="composer-field-label">Start</span>
            <input
              id="composer-start"
              type="text"
              className="composer-mono-input"
              value={startText}
              onChange={(e) => handleStartTextChange(e.target.value)}
              placeholder="5pm"
            />
            {startValid ? (
              <span className="composer-resolved">{minutesToClock(draft.startMin)}</span>
            ) : (
              <span className="composer-hint composer-hint-error">Try 5pm, 17:30, or 9:05 am</span>
            )}
          </div>

          <div className="composer-field">
            <span className="composer-field-label">Duration</span>
            <div className="composer-duration-chips">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`composer-chip-btn${draft.durationMin === preset ? ' composer-chip-btn-active' : ''}`}
                  onClick={() => applyDurationPreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="composer-mono-input"
              value={durationText}
              onChange={(e) => handleDurationTextChange(e.target.value)}
              placeholder="90"
            />
            {!durationValid && (
              <span className="composer-hint composer-hint-error">Try 90, 1.5h, or 1h30</span>
            )}
          </div>

          <div className="composer-field">
            <span className="composer-field-label" id="composer-pomodoros-label">
              Pomodoros
            </span>
            <div className="composer-pomodoro-stepper">
              <button
                type="button"
                className="composer-stepper-btn"
                aria-label="Decrease pomodoros"
                disabled={!showPomodoros}
                onClick={() => stepPomodoros(-1)}
              >
                −
              </button>
              <span className="composer-stepper-label" aria-labelledby="composer-pomodoros-label">
                {showPomodoros ? Math.min(draft.pomodoros, maxPomodoros(draft.durationMin)) : 0}
              </span>
              <button
                type="button"
                className="composer-stepper-btn"
                aria-label="Increase pomodoros"
                disabled={!showPomodoros}
                onClick={() => stepPomodoros(1)}
              >
                +
              </button>
            </div>
            <span className="composer-hint">
              {showPomodoros ? `max ${maxPomodoros(draft.durationMin)}` : 'not for this type'}
            </span>
          </div>
        </div>

        <div className="composer-grid-2">
          <div className="composer-field">
            <span className="composer-field-label">Repeats</span>
            <div className="composer-segmented">
              {REPEAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`composer-segmented-btn${draft.repeat === opt.value ? ' composer-segmented-btn-active' : ''}`}
                  onClick={() => setDraft((d) => ({ ...d, repeat: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="composer-field">
            <span className="composer-field-label" id="composer-track-label">
              Sound
            </span>
            <select
              className="composer-track-select"
              aria-labelledby="composer-track-label"
              value={draft.trackId ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, trackId: e.target.value === '' ? null : Number(e.target.value) }))
              }
            >
              <option value="">None</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="composer-tags-row">
          <span className="composer-tags-label">Tags</span>
          <div className="composer-tags">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`composer-tag${draft.kind === opt.value ? ' composer-tag-active' : ''}`}
                aria-pressed={draft.kind === opt.value}
                onClick={() => handleKindChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              className={`composer-tag${draft.important ? ' composer-tag-active' : ''}`}
              aria-pressed={draft.important}
              onClick={() => setDraft((d) => ({ ...d, important: !d.important }))}
            >
              Important
            </button>
            <button
              type="button"
              className={`composer-tag${draft.urgent ? ' composer-tag-active' : ''}`}
              aria-pressed={draft.urgent}
              onClick={() => setDraft((d) => ({ ...d, urgent: !d.urgent }))}
            >
              Urgent
            </button>
            <button
              type="button"
              className={`composer-tag${draft.quiet ? ' composer-tag-active' : ''}`}
              aria-pressed={draft.quiet}
              onClick={() => setDraft((d) => ({ ...d, quiet: !d.quiet }))}
            >
              No notifications
            </button>
          </div>
        </div>

        {block && (
          <label className="composer-checkbox">
            <input
              type="checkbox"
              checked={rippleEnabled}
              onChange={(e) => setRippleEnabled(e.target.checked)}
            />
            Apply changes to later blocks (ripple)
          </label>
        )}

        {shutdownAlert && fitCheck && shutdownMin !== null ? (
          <div className="composer-alert" role="alert">
            <div>
              This runs {fitCheck.overrunMin} min past your {minutesToClock(shutdownMin)} shutdown.
            </div>
            <div className="composer-alert-actions">
              <button type="button" className="btn-primary" onClick={handleAddToThisWeek}>
                Add to This Week
              </button>
              {canShorten && (
                <button type="button" className="btn-secondary" onClick={handleShorten}>
                  Shorten to fit
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setShutdownAlert(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="composer-footer">
            <span className="composer-summary">
              {composerSummary(draft.startMin, draft.durationMin, showPomodoros ? draft.pomodoros : 0)}
            </span>
            <div className="composer-footer-actions">
              {block && (
                <button type="button" className="composer-delete-btn" onClick={handleDelete}>
                  Delete
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={onDone}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void doSave()} disabled={!canSave}>
                {block ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
