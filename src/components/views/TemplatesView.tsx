import { useEffect, useState } from 'react'
import { useTemplatesStore } from '../../stores/templates'
import { openDatabase } from '../../db/index'
import { TemplateListCard } from '../templates/TemplateListCard'
import { TemplateDetailPane } from '../templates/TemplateDetailPane'
import { NewTemplateModal } from '../templates/NewTemplateModal'

export function TemplatesView() {
  const templates = useTemplatesStore((s) => s.templates)
  const selectedId = useTemplatesStore((s) => s.selectedId)
  const detail = useTemplatesStore((s) => s.detail)
  const select = useTemplatesStore((s) => s.select)
  const duplicateTemplate = useTemplatesStore((s) => s.duplicateTemplate)
  const hydrate = useTemplatesStore((s) => s.hydrate)
  const loading = useTemplatesStore((s) => s.loading)
  // P2-A: createTemplate never throws — it reports failure via `null` and
  // sets this. NewTemplateModal now subscribes to the store's `error`
  // directly and displays it within the modal, so failed creates are visible.
  const error = useTemplatesStore((s) => s.error)

  const [newTemplateOpen, setNewTemplateOpen] = useState(false)

  // Hydrate on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        await hydrate(driver)
      } catch (err) {
        console.error('Failed to hydrate templates view:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate])

  if (loading) {
    return (
      <div className="tpl-view">
        <div className="tpl-header">
          <div>
            <div className="tpl-title">Day templates</div>
            <div className="tpl-subtitle">Repetition lives here: build a day once, apply it whenever it fits.</div>
          </div>
        </div>
        <div className="tpl-body">
          <div className="view-empty">
            <div className="view-empty-title">Loading templates…</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tpl-view">
      <div className="tpl-header">
        <div>
          <div className="tpl-title">Day templates</div>
          <div className="tpl-subtitle">Repetition lives here: build a day once, apply it whenever it fits.</div>
        </div>
      </div>

      {error && <div className="modal-error">{error}</div>}

      <div className="tpl-body">
        {/* Left column: template list */}
        <div className="tpl-list-column">
          {templates.length === 0 ? (
            <button
              className="tpl-new-btn"
              onClick={() => setNewTemplateOpen(true)}
              aria-label="Create new template"
            >
              + New template
            </button>
          ) : (
            <>
              <div className="tpl-list">
                {templates.map((template) => (
                  <TemplateListCard
                    key={template.id}
                    template={template}
                    isSelected={selectedId === template.id}
                    onSelect={() => select(template.id)}
                    onDuplicate={() => void duplicateTemplate(template.id)}
                  />
                ))}
              </div>
              <button
                className="tpl-new-btn"
                onClick={() => setNewTemplateOpen(true)}
                aria-label="Create new template"
              >
                + New template
              </button>
            </>
          )}
        </div>

        {/* Right column: detail pane */}
        {templates.length === 0 ? (
          <div className="tpl-empty-state">
            <div className="view-empty-text">
              Create your first template to get started
            </div>
          </div>
        ) : detail ? (
          <TemplateDetailPane template={detail} />
        ) : (
          <div className="tpl-empty-state">
            <div className="view-empty-text">
              Select a template to edit
            </div>
          </div>
        )}
      </div>

      {newTemplateOpen && (
        <NewTemplateModal onClose={() => setNewTemplateOpen(false)} />
      )}
    </div>
  )
}
