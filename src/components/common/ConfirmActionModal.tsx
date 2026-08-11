import { useEffect, useRef } from 'react'

interface ConfirmActionModalProps {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Reusable explicit-confirmation dialog for destructive or stateful actions. */
export function ConfirmActionModal({ title, description, confirmLabel, destructive = true, onConfirm, onCancel }: ConfirmActionModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="modal-header"><h2 className="modal-title">{title}</h2></div>
        <div className="modal-body"><p>{description}</p></div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} type="button">Cancel</button>
          <button className={destructive ? 'btn-danger-solid' : 'btn-primary'} onClick={onConfirm} type="button">{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
