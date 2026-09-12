import { useState, useEffect, useMemo } from 'react'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { addDays, fromDayKey, toDayKey } from '../../lib/time'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import type { DayBlock } from '../../db/types'

interface IncompleteYesterdayModalProps {
  isOpen: boolean
  onClose: () => void
}

export function IncompleteYesterdayModal({ isOpen, onClose }: IncompleteYesterdayModalProps) {
  const currentDay = useDayStore((s) => s.currentDay)
  const ensureDays = useBlocksStore((s) => s.ensureDays)
  const blocksByDay = useBlocksStore((s) => s.blocksByDay)
  const addInboxTask = useBlocksStore((s) => s.addInboxTask)

  const yesterdayKey = useMemo(() => {
    return toDayKey(addDays(fromDayKey(currentDay), -1))
  }, [currentDay])

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (isOpen) {
      void ensureDays([yesterdayKey])
      setSelectedIds(new Set())
    }
  }, [isOpen, yesterdayKey, ensureDays])

  if (!isOpen) return null

  const yesterdayBlocks = blocksByDay[yesterdayKey] ?? []
  const incompleteBlocks = yesterdayBlocks.filter((b) => !b.completed)

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const handleImport = async () => {
    const toImport = incompleteBlocks.filter((b) => selectedIds.has(b.id))
    for (const block of toImport) {
      await addInboxTask(currentDay, {
        title: block.title,
        estimateMin: block.durationMin,
        tags: block.tags,
        energy: block.energy,
        group: 'next',
      })
    }
    onClose()
  }

  return (
    <div className="inbox-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="inbox-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="inbox-modal-header">
          <h2 className="inbox-modal-title">Incomplete from Yesterday</h2>
          <button
            type="button"
            className="inbox-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="inbox-modal-body">
          {incompleteBlocks.length === 0 ? (
            <div className="inbox-modal-empty">
              No incomplete tasks found from yesterday ({yesterdayKey}).
            </div>
          ) : (
            incompleteBlocks.map((block: DayBlock) => {
              const isSelected = selectedIds.has(block.id)
              return (
                <div
                  key={block.id}
                  className={`inbox-modal-item ${isSelected ? 'inbox-modal-item-selected' : ''}`}
                  onClick={() => toggleSelect(block.id)}
                >
                  <div
                    className={`inbox-task-checkbox ${isSelected ? 'inbox-task-checkbox-checked' : ''}`}
                  >
                    {isSelected && <Check size={11} />}
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--text)', flex: 1 }}>
                    {block.title}
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {block.durationMin}m
                  </span>
                </div>
              )
            })
          )}
        </div>

        <div className="inbox-modal-footer">
          <button type="button" className="inbox-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="inbox-btn-submit"
            onClick={() => void handleImport()}
            disabled={selectedIds.size === 0}
          >
            Import to Today {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
