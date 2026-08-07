import { useState, useEffect, useRef } from 'react'
import { useTodayStore } from '../../stores/today'
import { openDatabase } from '../../db/index'
import { listTemplates } from '../../db/repos/templates'
import type { Template } from '../../db/types'

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

interface ApplyTemplateMenuProps {
  onClose: () => void
}

export function ApplyTemplateMenu({ onClose }: ApplyTemplateMenuProps) {
  const blocks = useTodayStore((s) => s.blocks)
  const applyTemplate = useTodayStore((s) => s.applyTemplate)

  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (driver) {
          const list = await listTemplates(driver)
          setTemplates(list)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleApply = async () => {
    if (!selectedId) return
    const ok = await applyTemplate(selectedId)
    if (ok) {
      onClose()
    } else {
      setError(useTodayStore.getState().error ?? 'Failed to apply template')
    }
  }

  const hasBlocks = blocks.length > 0

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Apply template"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 className="modal-title">Apply template</h2>
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

        <div className="modal-body">
          {error && (
            <div className="modal-error">{error}</div>
          )}

          {loading ? (
            <div>Loading templates…</div>
          ) : templates.length === 0 ? (
            <div>No templates available</div>
          ) : confirming ? (
            <div>
              {hasBlocks && (
                <div className="modal-warning">
                  <strong>Warning:</strong> Applying this template will delete all {blocks.length} existing blocks. This cannot be undone.
                </div>
              )}
              <div style={{ marginTop: '16px' }}>
                <strong>Selected template:</strong> {templates.find((t) => t.id === selectedId)?.name}
              </div>
            </div>
          ) : (
            <div className="template-list">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`template-item ${selectedId === template.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(template.id)}
                  role="radio"
                  aria-checked={selectedId === template.id}
                >
                  <input
                    type="radio"
                    name="template"
                    value={template.id}
                    checked={selectedId === template.id}
                    onChange={() => setSelectedId(template.id)}
                  />
                  <label>
                    <strong>{template.name}</strong>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {confirming ? (
            <>
              <button
                className="btn-secondary"
                onClick={() => {
                  setConfirming(false)
                  setSelectedId(null)
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleApply}
              >
                Yes, apply
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => setConfirming(true)}
                disabled={!selectedId}
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
