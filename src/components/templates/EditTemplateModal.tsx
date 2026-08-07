import { useState, useRef, useEffect } from 'react'
import { useTemplatesStore } from '../../stores/templates'
import { minutesToClock, parseClock } from '../../lib/time'
import type { TemplateDetail } from '../../stores/templates'

interface EditTemplateModalProps {
  template: TemplateDetail
  onClose: () => void
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function EditTemplateModal({ template, onClose }: EditTemplateModalProps) {
  const updateTemplate = useTemplatesStore((s) => s.updateTemplate)
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate)

  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description)
  const [startText, setStartText] = useState(minutesToClock(template.startMin))
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const startValid = parseClock(startText, 0) !== null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (deleting) {
        setDeleting(false)
      } else {
        onClose()
      }
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

    if (!startValid) {
      setError('Please enter a valid start time')
      return
    }

    // P2-A: updateTemplate never throws — it catches its own persistence
    // errors and reports success via its return value. Only close the
    // modal (discarding the form) when the save actually landed; on
    // failure, surface the store's error instead of closing over it.
    const startMin = parseClock(startText, 0)!
    const ok = await updateTemplate(template.id, {
      name: name.trim(),
      description: description.trim(),
      startMin,
    })
    if (ok) {
      onClose()
    } else {
      setError(useTemplatesStore.getState().error ?? 'Failed to save template')
    }
  }

  const handleDelete = async () => {
    const ok = await deleteTemplate(template.id)
    if (ok) {
      onClose()
    } else {
      setError(useTemplatesStore.getState().error ?? 'Failed to delete template')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit template"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 className="modal-title">Edit template</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close" type="button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M2 14l12-12M14 14L2 2" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}

          {deleting ? (
            <div>
              <strong>Are you sure?</strong>
              <p>
                Deleting "{template.name}" will permanently remove this template and cannot be undone.
              </p>
            </div>
          ) : (
            <>
              <div className="modal-field">
                <label htmlFor="tpl-name" className="modal-label">
                  Template name
                </label>
                <input
                  id="tpl-name"
                  ref={inputRef}
                  type="text"
                  className="modal-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="tpl-desc" className="modal-label">
                  Description
                </label>
                <input
                  id="tpl-desc"
                  type="text"
                  className="modal-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — what makes this day special?"
                />
              </div>

              <div className="modal-field">
                <label htmlFor="tpl-start" className="modal-label">
                  Start time
                </label>
                <input
                  id="tpl-start"
                  type="text"
                  className="modal-input"
                  value={startText}
                  onChange={(e) => setStartText(e.target.value)}
                />
                {!startValid && (
                  <span className="modal-hint modal-hint-error">Try 5pm, 17:30, or 9:05 am</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          {deleting ? (
            <>
              <button
                className="btn-secondary"
                onClick={() => setDeleting(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn-danger-solid"
                onClick={() => void handleDelete()}
                type="button"
              >
                Yes, delete
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-danger-solid"
                onClick={() => setDeleting(true)}
                type="button"
              >
                Delete template
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn-secondary" onClick={onClose} type="button">
                Cancel
              </button>
              <button className="btn-primary" onClick={() => void handleSave()} type="button">
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
