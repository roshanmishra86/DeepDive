import { useState, useRef, useEffect } from 'react'
import { useTemplatesStore } from '../../stores/templates'
import { minutesToClock, parseClock, parseDuration } from '../../lib/time'
import {
  minDurationFor,
  maxPomodoros,
  durationPresetsFor,
  resolveBlockTitle,
} from '../../lib/today'
import type { BlockKind } from '../../db/types'
import { ConfirmDeleteBlockModal } from './ConfirmDeleteBlockModal'

interface BlockModalProps {
  templateId?: number
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

  useEffect(() => {
    const first = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    first?.focus()
  }, [])

  const startValid = startText === '' || parseClock(startText, 0) !== null
  const durationValid = kind === 'break' || parseDuration(durationText) !== null
  const showPomodoros = kind !== 'break' && kind !== 'ritual'

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
      const durationMin = kind === 'break' ? parseInt(durationText, 10) : parseDuration(durationText)!

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={editingBlock ? `Edit block: ${editingBlock.title}` : 'New block'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 className="modal-title">{editingBlock ? 'Edit block' : 'New block'}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close" type="button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M2 14l12-12M14 14L2 2" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}

          {/* Kind selector */}
          <div className="modal-field">
            <label className="modal-label">Type</label>
            <div className="modal-segmented">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`modal-segmented-btn ${kind === opt.value ? 'modal-segmented-btn-active' : ''}`}
                  onClick={() => setKind(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title input */}
          {kind !== 'break' && (
            <div className="modal-field">
              <label htmlFor="block-title" className="modal-label">
                Title
              </label>
              <input
                id="block-title"
                type="text"
                className="modal-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is this block for?"
              />
            </div>
          )}

          {/* Start time */}
          <div className="modal-field">
            <label htmlFor="block-start" className="modal-label">
              Start time (optional)
            </label>
            <input
              id="block-start"
              type="text"
              className="modal-input"
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              placeholder="5:00 AM"
            />
            {startText !== '' && !startValid && (
              <span className="modal-hint modal-hint-error">Try 5pm, 17:30, or 9:05 am</span>
            )}
          </div>

          {/* Duration */}
          <div className="modal-field">
            <label htmlFor="block-duration" className="modal-label">
              Duration
            </label>
            <div className="modal-duration-chips">
              {durationPresetsFor(kind).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`modal-chip-btn ${durationText === String(preset) ? 'modal-chip-btn-active' : ''}`}
                  onClick={() => setDurationText(String(preset))}
                >
                  {preset}
                </button>
              ))}
            </div>
            {kind !== 'break' && (
              <input
                id="block-duration"
                type="text"
                className="modal-input"
                value={durationText}
                onChange={(e) => setDurationText(e.target.value)}
                placeholder="90"
              />
            )}
            {!durationValid && (
              <span className="modal-hint modal-hint-error">Try 90, 1.5h, or 1h30</span>
            )}
          </div>

          {/* Pomodoros */}
          {showPomodoros && (
            <div className="modal-field">
              <label htmlFor="block-pomodoros" className="modal-label">
                Pomodoros
              </label>
              <select
                id="block-pomodoros"
                className="modal-input"
                value={pomodoros}
                onChange={(e) => setPomodoros(Math.min(maxPoms, parseInt(e.target.value, 10)))}
              >
                {Array.from({ length: maxPoms + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? 'None' : i}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {editingBlock && (
            <button
              className="btn-danger"
              onClick={() => setConfirmingDelete(true)}
              type="button"
            >
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void handleSave()} type="button">
            {editingBlock ? 'Save' : 'Add'}
          </button>
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
