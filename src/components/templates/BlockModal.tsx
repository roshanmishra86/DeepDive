import { useState, useRef } from 'react'
import { useTemplatesStore } from '../../stores/templates'
import { minutesToClock, parseClock, parseDuration } from '../../lib/time'
import {
  minDurationFor,
  maxPomodoros,
  durationPresetsFor,
  resolveBlockTitle,
  composerSummary,
  composerSummaryNoStart,
  nextDurationTextState,
  resolveBreakDurationMin,
  breakDurationOnKindSwitch,
} from '../../lib/today'
import type { BlockKind } from '../../db/types'
import { ConfirmDeleteBlockModal } from './ConfirmDeleteBlockModal'

interface BlockModalProps {
  editingBlockId: number | null
  onClose: () => void
}

const KIND_OPTIONS: { value: BlockKind; label: string }[] = [
  { value: 'deep', label: 'Deep' },
  { value: 'shallow', label: 'Shallow' },
  { value: 'break', label: 'Break' },
  { value: 'ritual', label: 'Ritual' },
]

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function BlockModal({ editingBlockId, onClose }: BlockModalProps) {
  const detail = useTemplatesStore((s) => s.detail)
  const addBlock = useTemplatesStore((s) => s.addBlock)
  const editBlock = useTemplatesStore((s) => s.editBlock)
  const removeBlock = useTemplatesStore((s) => s.removeBlock)

  const editingBlock = editingBlockId ? detail?.blocks.find((b) => b.id === editingBlockId) : null
  const modalRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState(editingBlock?.title ?? '')
  const [kind, setKind] = useState<BlockKind>(editingBlock?.kind ?? 'deep')
  const [startText, setStartText] = useState(editingBlock ? minutesToClock(editingBlock.startMin) : '')
  const [durationText, setDurationText] = useState(editingBlock ? String(editingBlock.durationMin) : '')
  const [pomodoros, setPomodoros] = useState(editingBlock?.pomodoros ?? 0)
  const [error, setError] = useState('')
  // Uses the same ConfirmDeleteBlockModal as TemplateDetailPane's row ✕,
  // rather than `window.confirm` — no other destructive action in this app
  // uses the native dialog. See the Phase 6 F2 defect in TASKS.md.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Initial focus is handled by `autoFocus` on the title input below — no
  // mount-time effect here. A `querySelector(FOCUSABLE_SELECTOR)` effect
  // previously raced with that `autoFocus`: in DOM order the header Close
  // button is the first focusable element, and effects run after the
  // initial render, so the effect always won and silently focused Close
  // instead of the title field. BlockComposer (the reference
  // implementation) has no such effect and relies on `autoFocus` alone —
  // matched here for the same reason: focusing the title input on open is
  // what's wanted. The Tab/Shift-Tab focus trap in handleKeyDown is
  // unaffected; it only matters once the user starts tabbing.
  const startValid = startText === '' || parseClock(startText, 0) !== null
  const durationValid = kind === 'break' || parseDuration(durationText) !== null
  const showPomodoros = kind !== 'break' && kind !== 'ritual'

  const handleStartTextChange = (raw: string) => {
    setStartText(raw)
  }

  const handleDurationTextChange = (raw: string) => {
    const next = nextDurationTextState(raw, kind, pomodoros)
    setDurationText(next.durationText)
    setPomodoros(next.pomodoros)
  }

  const applyDurationPreset = (preset: number) => {
    const next = Math.max(minDurationFor(kind), preset)
    setDurationText(String(next))
    setPomodoros(Math.min(pomodoros, maxPomodoros(next)))
  }

  const stepPomodoros = (delta: number) => {
    if (!showPomodoros) return
    const durationParsed = parseDuration(durationText)
    const max = durationParsed ? maxPomodoros(durationParsed) : maxPomodoros(30)
    const next = Math.max(0, Math.min(max, pomodoros + delta))
    setPomodoros(next)
  }

  const handleKindChange = (newKind: BlockKind) => {
    if (newKind === 'break' && kind !== 'break') {
      // Switching TO break is a deliberate action — snap the duration to a
      // sensible break preset rather than keeping an out-of-range value
      // (e.g. a 90-minute deep block staying 90 minutes as a break), and
      // this also guarantees durationText is never empty for a break block,
      // closing off the NaN-duration path in handleSave. See
      // breakDurationOnKindSwitch in lib/today.ts.
      setDurationText(String(breakDurationOnKindSwitch(durationText)))
    }
    setKind(newKind)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const handleSave = async () => {
    if (kind !== 'break' && !title.trim()) {
      setError('Please enter a title')
      return
    }

    if (!startValid) {
      setError('Please enter a valid start time')
      return
    }

    if (!durationValid) {
      setError('Please enter a valid duration')
      return
    }

    try {
      const startMin = startText === '' ? undefined : parseClock(startText, 0) ?? undefined
      const durationMin = kind === 'break' ? resolveBreakDurationMin(durationText) : parseDuration(durationText)!

      if (durationMin < minDurationFor(kind)) {
        setError(`Minimum duration for ${kind} blocks is ${minDurationFor(kind)} min`)
        return
      }

      if (editingBlock) {
        await editBlock(editingBlock.id, {
          title: resolveBlockTitle(title, kind),
          kind,
          startMin,
          durationMin,
          pomodoros: showPomodoros ? pomodoros : 0,
        })
      } else {
        await addBlock({
          title: resolveBlockTitle(title, kind),
          kind,
          startMin,
          durationMin,
          pomodoros: showPomodoros ? pomodoros : 0,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save block')
    }
  }

  const handleDelete = async () => {
    if (!editingBlock) return
    try {
      await removeBlock(editingBlock.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete block')
    }
  }

  const durationParsed = parseDuration(durationText)
  const maxPoms = durationParsed ? maxPomodoros(durationParsed) : maxPomodoros(30)
  const startParsed = startText === '' ? undefined : parseClock(startText, 0) ?? undefined

  return (
    <div className="composer-overlay" onClick={onClose}>
      <div
        className="composer-panel"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={editingBlock ? `Edit block: ${editingBlock.title}` : 'New block'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="composer-header">
          <div className="composer-header-left">
            <span className="composer-header-icon">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="2" y="2.6" width="10" height="9.2" rx="1.4" />
                <path d="M4.6 6.4h4.8M4.6 8.8h3" />
              </svg>
            </span>
            <span className="composer-header-title">{editingBlock ? 'Edit block' : 'New block'}</span>
          </div>
          <button type="button" className="composer-close" onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>

        <div className="composer-name-block">
          <input
            type="text"
            className="composer-name-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'break' ? 'Optional — what kind of break?' : 'What is this block for?'}
            autoFocus
          />
          {error && <div className="composer-hint composer-hint-error" role="alert">{error}</div>}
        </div>

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
            {startText !== '' && startValid ? (
              <span className="composer-resolved">{minutesToClock(parseClock(startText, 0)!)}</span>
            ) : startText !== '' ? (
              <span className="composer-hint composer-hint-error">Try 5pm, 17:30, or 9:05 am</span>
            ) : (
              <span className="composer-hint">Optional</span>
            )}
          </div>

          <div className="composer-field">
            <span className="composer-field-label">Duration</span>
            <div className="composer-duration-chips">
              {durationPresetsFor(kind).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`composer-chip-btn${durationText === String(preset) ? ' composer-chip-btn-active' : ''}`}
                  onClick={() => applyDurationPreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            {kind === 'break' ? (
              !(durationPresetsFor(kind) as readonly number[]).includes(parseInt(durationText, 10)) && durationText && (
                <span className="composer-hint">{durationText} min (kept as-is; pick a chip to change)</span>
              )
            ) : (
              <>
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
              </>
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
                {showPomodoros ? Math.min(pomodoros, maxPoms) : 0}
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
              {showPomodoros ? `max ${maxPoms}` : 'not for this type'}
            </span>
          </div>
        </div>

        <div className="composer-tags-row">
          <span className="composer-tags-label">Type</span>
          <div className="composer-tags">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`composer-tag${kind === opt.value ? ' composer-tag-active' : ''}`}
                aria-pressed={kind === opt.value}
                onClick={() => handleKindChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="composer-footer">
          <span className="composer-summary">
            {startParsed !== undefined
              ? composerSummary(startParsed, durationParsed ?? 0, showPomodoros ? pomodoros : 0)
              : composerSummaryNoStart(durationParsed ?? 0, showPomodoros ? pomodoros : 0)}
          </span>
          <div className="composer-footer-actions">
            {editingBlock && (
              <button type="button" className="composer-delete-btn" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void handleSave()}>
              {editingBlock ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      {confirmingDelete && editingBlock && (
        <ConfirmDeleteBlockModal
          blockTitle={editingBlock.title}
          onConfirm={() => {
            setConfirmingDelete(false)
            void handleDelete()
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
