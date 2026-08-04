import { useState, useEffect, useRef } from 'react'
import { useTodayStore } from '../../stores/today'
import { minutesToClock } from '../../lib/time'
import type { BlockKind } from '../../db/types'

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

interface BlockEditorProps {
  blockId: number | null
  onClose: () => void
}

export function BlockEditor({ blockId, onClose }: BlockEditorProps) {
  const blocks = useTodayStore((s) => s.blocks)
  const addBlock = useTodayStore((s) => s.addBlock)
  const editBlock = useTodayStore((s) => s.editBlock)

  const block = blockId ? blocks.find((b) => b.id === blockId) : null

  const [title, setTitle] = useState(block?.title || '')
  const [kind, setKind] = useState<BlockKind>(block?.kind || 'deep')
  const [durationMin, setDurationMin] = useState(block?.durationMin || 60)
  const [startMin, setStartMin] = useState(block?.startMin || 300)
  const [pomodoros, setPomodoros] = useState(block?.pomodoros || 0)
  const [rippleEnabled, setRippleEnabled] = useState(true)
  const [error, setError] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (block) {
      setTitle(block.title)
      setKind(block.kind)
      setDurationMin(block.durationMin)
      setStartMin(block.startMin)
      setPomodoros(block.pomodoros)
    }
  }, [block])

  const validate = () => {
    if (!title.trim()) {
      setError('Title is required')
      return false
    }
    if (durationMin < 1 || durationMin > 600) {
      setError('Duration must be between 1 and 600 minutes')
      return false
    }
    if (pomodoros < 0 || pomodoros > 12) {
      setError('Pomodoros must be between 0 and 12')
      return false
    }
    if (startMin < 0 || startMin >= 1440) {
      setError('Start time must be between 12:00 AM and 11:59 PM')
      return false
    }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return

    try {
      if (block) {
        // Edit existing block
        await editBlock(
          block.id,
          {
            title,
            kind,
            durationMin,
            startMin,
            pomodoros,
          },
          rippleEnabled
        )
      } else {
        // Create new block
        await addBlock({
          title,
          kind,
          durationMin,
          startMin,
          pomodoros,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  // Escape closes and Ctrl/Cmd+Enter saves regardless of which field has
  // focus; Tab is trapped inside the modal so keyboard users can't tab
  // through to the (still-visible, non-interactive) view behind it.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave()
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

  return (
    <div className="editor-overlay" onClick={onClose}>
      <div
        className="editor-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={block ? 'Edit block' : 'New block'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="editor-header">
          <h2 className="editor-title">
            {block ? 'Edit block' : 'New block'}
          </h2>
          <button
            className="btn-icon"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M2 14l12-12M14 14L2 2" />
            </svg>
          </button>
        </div>

        <div className="editor-body">
          {error && <div className="editor-error">{error}</div>}

          <div className="editor-field">
            <label className="editor-label">Title</label>
            <input
              type="text"
              className="editor-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError('')
              }}
              placeholder="Block title"
              autoFocus
            />
          </div>

          <div className="editor-field">
            <label className="editor-label">Type</label>
            <select
              className="editor-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as BlockKind)}
            >
              <option value="deep">Deep work</option>
              <option value="shallow">Shallow work</option>
              <option value="ritual">Ritual</option>
              <option value="break">Break</option>
            </select>
          </div>

          <div className="editor-field">
            <label className="editor-label">Duration (minutes)</label>
            <input
              type="number"
              className="editor-input"
              value={durationMin}
              onChange={(e) => {
                setDurationMin(Math.max(1, Math.min(600, parseInt(e.target.value) || 1)))
                setError('')
              }}
              min="1"
              max="600"
              step="5"
            />
          </div>

          <div className="editor-field">
            <label className="editor-label">Start time</label>
            <div className="editor-time-input">
              <input
                type="range"
                className="editor-range"
                min="0"
                max="1439"
                value={startMin}
                onChange={(e) => {
                  setStartMin(parseInt(e.target.value))
                  setError('')
                }}
              />
              <div className="editor-time-display">{minutesToClock(startMin)}</div>
            </div>
          </div>

          <div className="editor-field">
            <label className="editor-label">Pomodoros</label>
            <input
              type="number"
              className="editor-input"
              value={pomodoros}
              onChange={(e) => {
                setPomodoros(Math.max(0, Math.min(12, parseInt(e.target.value) || 0)))
                setError('')
              }}
              min="0"
              max="12"
              step="1"
            />
          </div>

          {block && (
            <div className="editor-field">
              <label className="editor-checkbox">
                <input
                  type="checkbox"
                  checked={rippleEnabled}
                  onChange={(e) => setRippleEnabled(e.target.checked)}
                />
                Apply changes to later blocks (ripple)
              </label>
            </div>
          )}
        </div>

        <div className="editor-footer">
          <button
            className="btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
          >
            {block ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
