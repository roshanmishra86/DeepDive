import { useEffect, useState } from 'react'
import { useTemplatesStore } from '../../stores/templates'
import { openDatabase } from '../../db/index'
import { TemplatesHeader } from '../templates/TemplatesHeader'
import { TemplatesStats } from '../templates/TemplatesStats'
import { TemplateCatalog } from '../templates/TemplateCatalog'
import { TemplateDetailView } from '../templates/TemplateDetailView'
import { TemplateBottomCards } from '../templates/TemplateBottomCards'
import { NewGtdTemplateModal } from '../templates/NewGtdTemplateModal'
import { ImportTodoToTemplateModal } from '../templates/ImportTodoToTemplateModal'
import { EditTemplateModal } from '../templates/EditTemplateModal'
import type { TemplateDestination } from '../../db/types'

export function TemplatesView() {
  const templates = useTemplatesStore((s) => s.templates)
  const selectedId = useTemplatesStore((s) => s.selectedId)
  const detail = useTemplatesStore((s) => s.detail)
  const select = useTemplatesStore((s) => s.select)
  const duplicateTemplate = useTemplatesStore((s) => s.duplicateTemplate)
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate)
  const toggleFavourite = useTemplatesStore((s) => s.toggleFavourite)
  const setDestination = useTemplatesStore((s) => s.setDestination)
  const addBlock = useTemplatesStore((s) => s.addBlock)
  const removeBlock = useTemplatesStore((s) => s.removeBlock)
  const applyTemplateGtd = useTemplatesStore((s) => s.applyTemplateGtd)
  const hydrate = useTemplatesStore((s) => s.hydrate)
  const loading = useTemplatesStore((s) => s.loading)
  const error = useTemplatesStore((s) => s.error)

  const [newTemplateOpen, setNewTemplateOpen] = useState(false)
  const [importTodoOpen, setImportTodoOpen] = useState(false)
  const [editTemplateOpen, setEditTemplateOpen] = useState(false)

  // Hydrate on mount if empty
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        if (templates.length === 0) {
          await hydrate(driver)
        }
      } catch (err) {
        console.error('Failed to hydrate templates view:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate, templates.length])

  const handleApply = async (dest?: TemplateDestination) => {
    if (!selectedId) return
    await applyTemplateGtd(selectedId, dest)
  }

  const handleAddTask = async (title: string, tag: string) => {
    await addBlock({
      title,
      kind: 'deep',
      durationMin: 25,
      tag,
    })
  }

  if (loading) {
    return (
      <div className="tpl-gtd-view">
        <div className="view-state" role="status">
          <div className="view-state-eyebrow">Templates</div>
          <div className="view-state-title">Loading templates…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="tpl-gtd-view">
      <div className="tpl-gtd-inner">
        {/* Header */}
        <TemplatesHeader
          onNewTemplate={() => setNewTemplateOpen(true)}
          onImportTodo={() => setImportTodoOpen(true)}
          onManageTags={() => {}}
        />

        {error && <div className="modal-error">{error}</div>}

        {/* Top 4 Summary Stat Cards */}
        <TemplatesStats templates={templates} />

        {/* Two-Column Middle Section (Catalog + Detail) */}
        <div className="tpl-workspace-grid">
          {/* Left: Template Catalog */}
          <TemplateCatalog
            templates={templates}
            selectedId={selectedId}
            onSelect={(id) => void select(id)}
            onToggleFavourite={(id) => void toggleFavourite(id)}
            onDuplicate={(id) => void duplicateTemplate(id)}
            onDelete={(id) => void deleteTemplate(id)}
          />

          {/* Right: Selected Template Detail */}
          {detail ? (
            <TemplateDetailView
              template={detail}
              onApply={(dest) => void handleApply(dest)}
              onDuplicate={() => {
                if (selectedId) void duplicateTemplate(selectedId)
              }}
              onEdit={() => setEditTemplateOpen(true)}
              onDestinationChange={(dest) => {
                if (selectedId) void setDestination(selectedId, dest)
              }}
              onAddTask={(title, tag) => void handleAddTask(title, tag)}
              onDeleteBlock={(blockId) => void removeBlock(blockId)}
            />
          ) : (
            <div className="tpl-detail-card" style={{ justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Select a template to view and manage its checklist.
              </div>
            </div>
          )}
        </div>

        {/* Bottom Analytics & Guidance (3 Cards) */}
        <TemplateBottomCards
          templates={templates}
          onSelectTemplate={(id) => void select(id)}
        />
      </div>

      {/* Modals */}
      {newTemplateOpen && (
        <NewGtdTemplateModal onClose={() => setNewTemplateOpen(false)} />
      )}

      {importTodoOpen && (
        <ImportTodoToTemplateModal onClose={() => setImportTodoOpen(false)} />
      )}

      {editTemplateOpen && detail && (
        <EditTemplateModal
          template={detail}
          onClose={() => setEditTemplateOpen(false)}
        />
      )}
    </div>
  )
}
