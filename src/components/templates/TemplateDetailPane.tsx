import { useState } from 'react'
import { useTemplatesStore } from '../../stores/templates'
import { useTodayStore } from '../../stores/today'
import { useAppStore } from '../../stores/app'
import { minutesToClock } from '../../lib/time'
import { templateSubtitle, WEEKDAYS, hasWeekday } from '../../lib/templates'
import type { TemplateDetail } from '../../stores/templates'
import { BlockModal } from './BlockModal'
import { EditTemplateModal } from './EditTemplateModal'
import { ApplyTemplateConfirmModal } from './ApplyTemplateConfirmModal'
import { ConfirmDeleteBlockModal } from './ConfirmDeleteBlockModal'

interface TemplateDetailPaneProps {
  template: TemplateDetail
}

// Discriminated union modelling "which block modal, if any, is open" as one
// state value instead of two independently-settable booleans/ids. The
// previous `blockModalOpen` + `editingBlockId` pair could stack two modals
// if either were ever set programmatically without the other — see the
// Phase 6 F4 defect in TASKS.md. Matches the `ComposerState` union already
// used in TodayView.tsx.
type BlockModalState = { mode: 'add' } | { mode: 'edit'; blockId: number } | null

export function TemplateDetailPane({ template }: TemplateDetailPaneProps) {
  const setWeekday = useTemplatesStore((s) => s.setWeekday)
  const removeBlock = useTemplatesStore((s) => s.removeBlock)
  const moveBlock = useTemplatesStore((s) => s.moveBlock)
  const moveBlockTo = useTemplatesStore((s) => s.moveBlockTo)
  const applyTemplate = useTodayStore((s) => s.applyTemplate)
  const todayBlocks = useTodayStore((s) => s.blocks)
  // P2-A: applyTemplate reports failure via the today store's `error` field
  // (it never throws) — subscribe so a failed apply is visible instead of
  // silently doing nothing when handleApply below declines to navigate.
  const applyError = useTodayStore((s) => s.error)
  const setView = useAppStore((s) => s.setView)

  const [blockModal, setBlockModal] = useState<BlockModalState>(null)
  const [editTemplateOpen, setEditTemplateOpen] = useState(false)
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false)
  // Block pending delete confirmation — the row's ✕ opens the same shared
  // confirm dialog BlockModal uses, rather than deleting immediately. See
  // the Phase 6 F2 defect in TASKS.md.
  const [deleteConfirmBlockId, setDeleteConfirmBlockId] = useState<number | null>(null)
  const [draggingBlockId, setDraggingBlockId] = useState<number | null>(null)

  const subtitle = templateSubtitle(template.weekdays, template.startMin)
  const deleteConfirmBlock = template.blocks.find((b) => b.id === deleteConfirmBlockId) ?? null

  const handleApply = async () => {
    // P2-A: applyTemplate never throws — it reports success via its return
    // value. Only navigate to Today when the apply actually landed; a
    // failed apply used to still navigate, hiding the failure entirely.
    const ok = await applyTemplate(template.id)
    if (ok) {
      setView('today')
    }
  }

  const handleBlockDelete = async (blockId: number) => {
    setDeleteConfirmBlockId(null)
    await removeBlock(blockId)
  }

  const handleBlockMove = async (blockId: number, direction: -1 | 1) => {
    await moveBlock(blockId, direction)
  }

  const handleBlockDrop = async (targetIndex: number) => {
    if (draggingBlockId === null) return
    await moveBlockTo(draggingBlockId, targetIndex)
    setDraggingBlockId(null)
  }

  return (
    <div className="tpl-detail-pane">
      <div className="tpl-detail-header">
        <div>
          <div className="tpl-detail-title">{template.name}</div>
          <div className="tpl-detail-subtitle">{subtitle}</div>
        </div>
        <button className="btn-primary" onClick={() => setApplyConfirmOpen(true)}>
          Apply to today
        </button>
      </div>

      {applyError && <div className="modal-error">{applyError}</div>}

      {/* Repeats on section */}
      <div className="tpl-detail-section">
        <div className="tpl-section-label">Repeats on</div>
        <div className="tpl-weekday-toggles">
          {WEEKDAYS.map((day) => (
            <button
              key={day.bit}
              className={`tpl-weekday-toggle ${hasWeekday(template.weekdays, day.bit) ? 'tpl-weekday-toggle-active' : ''}`}
              onClick={() => setWeekday(template.id, day.bit)}
              aria-pressed={hasWeekday(template.weekdays, day.bit)}
              aria-label={`${day.label} for ${template.name}`}
              type="button"
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      {/* Blocks section */}
      <div className="tpl-detail-section">
        <div className="tpl-section-label">Blocks in this template</div>
        <div className="tpl-blocks-list">
          {template.blocks.length === 0 ? (
            <div className="tpl-empty-blocks">
              <div style={{ fontSize: '12.5px' }}>
                No blocks yet — add one to get started
              </div>
            </div>
          ) : (
            template.blocks.map((block, index) => (
              <div key={block.id} className="tpl-block-row" onDragOver={(event) => { event.preventDefault() }} onDrop={(event) => { event.preventDefault(); void handleBlockDrop(index) }}>
                <button type="button" className="tpl-block-drag-handle" draggable onDragStart={() => setDraggingBlockId(block.id)} onDragEnd={() => setDraggingBlockId(null)} aria-label={`Drag ${block.title}`}>⠿</button>
                <span className="tpl-block-time">{minutesToClock(block.startMin)}</span>
                <span className="tpl-block-title">{block.title}</span>
                {block.pomodoros > 0 && (
                  <span className="tpl-block-pomodoro-pill">
                    {block.pomodoros} {block.pomodoros === 1 ? 'pomodoro' : 'pomodoros'}
                  </span>
                )}
                <span className="tpl-block-duration">{block.durationMin} min</span>
                <div className="tpl-block-controls">
                  {index > 0 && (
                    <button
                      className="tpl-block-control-btn"
                      onClick={() => handleBlockMove(block.id, -1)}
                      aria-label={`Move ${block.title} up`}
                      type="button"
                      title="Move up"
                    >
                      ↑
                    </button>
                  )}
                  {index < template.blocks.length - 1 && (
                    <button
                      className="tpl-block-control-btn"
                      onClick={() => handleBlockMove(block.id, 1)}
                      aria-label={`Move ${block.title} down`}
                      type="button"
                      title="Move down"
                    >
                      ↓
                    </button>
                  )}
                  <button
                    className="tpl-block-control-btn"
                    onClick={() => setBlockModal({ mode: 'edit', blockId: block.id })}
                    aria-label={`Edit ${block.title}`}
                    type="button"
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    className="tpl-block-control-btn tpl-block-control-delete"
                    onClick={() => setDeleteConfirmBlockId(block.id)}
                    aria-label={`Delete ${block.title}`}
                    type="button"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
          <button
            className="tpl-add-block-btn"
            onClick={() => setBlockModal({ mode: 'add' })}
            type="button"
          >
            + Add block
          </button>
        </div>
      </div>

      {/* Template controls */}
      <div className="tpl-detail-footer">
        <button className="btn-secondary" onClick={() => setEditTemplateOpen(true)}>
          Edit template
        </button>
      </div>

      {/* Modals */}
      {blockModal && (
        <BlockModal
          editingBlockId={blockModal.mode === 'edit' ? blockModal.blockId : null}
          onClose={() => setBlockModal(null)}
        />
      )}

      {editTemplateOpen && (
        <EditTemplateModal
          template={template}
          onClose={() => setEditTemplateOpen(false)}
        />
      )}

      {applyConfirmOpen && (
        <ApplyTemplateConfirmModal
          templateName={template.name}
          existingBlockCount={todayBlocks.length}
          onConfirm={() => {
            setApplyConfirmOpen(false)
            handleApply()
          }}
          onCancel={() => setApplyConfirmOpen(false)}
        />
      )}

      {deleteConfirmBlock && (
        <ConfirmDeleteBlockModal
          blockTitle={deleteConfirmBlock.title}
          onConfirm={() => void handleBlockDelete(deleteConfirmBlock.id)}
          onCancel={() => setDeleteConfirmBlockId(null)}
        />
      )}
    </div>
  )
}
