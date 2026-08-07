import { useRef, useEffect } from 'react'

interface ConfirmDeleteBlockModalProps {
  blockTitle: string
  onConfirm: () => void
  onCancel: () => void
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Single confirm-delete dialog for template blocks. Both the block row's ✕
 * (TemplateDetailPane) and BlockModal's "Delete" button render this same
 * component instead of each rolling their own confirmation — see the
 * Phase 6 F2 defect in TASKS.md: those two paths used to disagree (one was
 * a silent, unconfirmed delete; the other gated behind native
 * `window.confirm`, which no other destructive action in this app uses).
 * Routing every delete path through this one component means a third path
 * can't drift from the other two the same way.
 */
export function ConfirmDeleteBlockModal({
  blockTitle,
  onConfirm,
  onCancel,
}: ConfirmDeleteBlockModalProps) {
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

  // P1-B: this dialog is rendered both standalone (TemplateDetailPane) and
  // NESTED inside BlockModal's `composer-overlay` (whose own onClick is
  // `onClose`). A bare `onClick={onCancel}` here fires onCancel correctly
  // but then keeps bubbling up through the DOM to the parent overlay's
  // onClick, closing BlockModal too and discarding the in-progress edit.
  // The Escape key path already guarded against the equivalent problem
  // (`e.stopPropagation()` in handleKeyDown); the click path needs the same
  // guard so this component is safe regardless of what it's nested inside.
  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCancel()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        className="modal-panel"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${blockTitle}?`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 className="modal-title">Delete "{blockTitle}"?</h2>
        </div>

        <div className="modal-body">
          <p>This will permanently remove this block and cannot be undone.</p>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="btn-danger-solid" onClick={onConfirm} type="button">
            Yes, delete
          </button>
        </div>
      </div>
    </div>
  )
}
