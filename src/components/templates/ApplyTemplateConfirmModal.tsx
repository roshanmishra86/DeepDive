import { useRef, useEffect } from 'react'

interface ApplyTemplateConfirmModalProps {
  templateName: string
  existingBlockCount: number
  onConfirm: () => void
  onCancel: () => void
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function ApplyTemplateConfirmModal({
  templateName,
  existingBlockCount,
  onConfirm,
  onCancel,
}: ApplyTemplateConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const first = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    first?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
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
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-panel"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm apply template"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 className="modal-title">Apply "{templateName}"?</h2>
          <button className="btn-icon" onClick={onCancel} aria-label="Close" type="button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M2 14l12-12M14 14L2 2" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {existingBlockCount > 0 && (
            <div className="modal-warning">
              <strong>Warning:</strong> This will delete all {existingBlockCount}{' '}
              {existingBlockCount === 1 ? 'block' : 'blocks'} already scheduled for today. This cannot be undone.
            </div>
          )}
          <p>Apply this template to today's schedule?</p>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="btn-primary" onClick={onConfirm} type="button">
            Yes, apply
          </button>
        </div>
      </div>
    </div>
  )
}
