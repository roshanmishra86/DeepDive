import { useState, useRef, useEffect } from 'react'
import { useTemplatesStore } from '../../stores/templates'
import { useAppStore } from '../../stores/app'
import { toDayKey } from '../../lib/time'

interface SaveTemplateModalProps {
  day?: string // Day to save as template. Defaults to today if not provided.
  onClose: () => void
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function SaveTemplateModal({ day, onClose }: SaveTemplateModalProps) {
  const saveDayAsTemplate = useTemplatesStore((s) => s.saveDayAsTemplate)
  const setView = useAppStore((s) => s.setView)

  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    if (!name.trim()) {
      setError('Please enter a template name')
      return
    }

    setSaving(true)
    // saveDayAsTemplate never throws — it catches its own persistence
    // errors, sets the store's `error`, and returns `null` (same contract
    // as createTemplate). This path already checked the return value, but
    // did nothing on `null` — reachable in the no-driver dev path, which
    // resolves to null with "No database connection" — leaving the modal
    // open with no feedback at all. Surface the store's error instead.
    const dayToSave = day ?? toDayKey(new Date())
    const templateId = await saveDayAsTemplate(dayToSave, name.trim())
    if (templateId) {
      setView('templates')
      onClose()
    } else {
      setError(useTemplatesStore.getState().error ?? 'Failed to save template')
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Save today as template"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 className="modal-title">Save today as template</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close" type="button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M2 14l12-12M14 14L2 2" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-field">
            <label htmlFor="save-template-name" className="modal-label">
              Template name
            </label>
            <input
              id="save-template-name"
              ref={inputRef}
              type="text"
              className="modal-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleSave()
                }
              }}
              placeholder="e.g., Deep work day"
              disabled={saving}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} type="button" disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void handleSave()} type="button" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
