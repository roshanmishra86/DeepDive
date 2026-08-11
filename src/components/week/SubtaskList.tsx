import { useEffect, useRef, useState } from 'react'
import type { Subtask, Task } from '../../db/types'
import { blockDraftFromSubtask, effectiveTaskEstimate, remainingSubtaskEstimate } from '../../lib/week'
import { formatDuration, minutesToClock } from '../../lib/time'
import { insertIdBefore } from '../../lib/dragList'
import { useDragList } from '../common/useDragList'
import { ConfirmActionModal } from '../common/ConfirmActionModal'
import { useTasksStore } from '../../stores/tasks'
import { useScheduleTodayBlock } from './useScheduleTodayBlock'

interface SubtaskListProps {
  task: Task
  now: Date
}

interface AllocationDraft {
  subtask: Subtask
  allocatedMin: number
  durationMin: number
}

function hoursLabel(minutes: number): string {
  return `${(minutes / 60).toFixed(2).replace(/\.00$/, '')}h`
}

export function SubtaskList({ task, now }: SubtaskListProps) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState('0.25')
  const [titleDrafts, setTitleDrafts] = useState<Record<number, string>>({})
  const [allocationDraft, setAllocationDraft] = useState<AllocationDraft | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [deleteSubtaskId, setDeleteSubtaskId] = useState<number | null>(null)
  const titleTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const subtasks = useTasksStore((state) => state.subtasksByTask[task.id] ?? [])
  const hasLoadedSubtasks = useTasksStore((state) => Object.hasOwn(state.subtasksByTask, task.id))
  const loading = useTasksStore((state) => state.subtaskLoading[task.id] ?? false)
  const error = useTasksStore((state) => state.subtaskError[task.id] ?? null)
  const load = useTasksStore((state) => state.loadSubtasks)
  const create = useTasksStore((state) => state.createSubtask)
  const setDone = useTasksStore((state) => state.setSubtaskDone)
  const update = useTasksStore((state) => state.updateSubtask)
  const remove = useTasksStore((state) => state.deleteSubtask)
  const reorder = useTasksStore((state) => state.reorderSubtasks)
  const allocation = useTasksStore((state) => state.getSubtaskAllocation)
  const { drag, start, over, clear } = useDragList<number>()
  const { preview, schedule } = useScheduleTodayBlock(now)

  useEffect(() => {
    if (expanded && !hasLoadedSubtasks) void load(task.id)
  }, [expanded, hasLoadedSubtasks, load, task.id])

  useEffect(() => () => {
    for (const timer of titleTimers.current.values()) clearTimeout(timer)
    titleTimers.current.clear()
  }, [])

  const createNew = async () => {
    const estimateMin = Math.round(Number(estimate) * 60)
    if (!title.trim() || !Number.isFinite(estimateMin) || estimateMin < 15 || estimateMin > 1440 || estimateMin % 15 !== 0) return
    const id = await create({ taskId: task.id, title, estimateMin })
    if (id !== null) {
      setTitle('')
      setEstimate('0.25')
    }
  }

  const commitTitle = async (subtask: Subtask, value: string) => {
    const timer = titleTimers.current.get(subtask.id)
    if (timer) clearTimeout(timer)
    titleTimers.current.delete(subtask.id)
    const ok = await update(subtask.id, task.id, { title: value })
    if (ok) {
      setTitleDrafts((drafts) => {
        if (drafts[subtask.id] !== value) return drafts
        const { [subtask.id]: _ignored, ...rest } = drafts
        return rest
      })
    }
  }

  const scheduleTitleSave = (subtask: Subtask, value: string) => {
    setTitleDrafts((drafts) => ({ ...drafts, [subtask.id]: value }))
    const prior = titleTimers.current.get(subtask.id)
    if (prior) clearTimeout(prior)
    titleTimers.current.set(subtask.id, setTimeout(() => {
      titleTimers.current.delete(subtask.id)
      void commitTitle(subtask, value)
    }, 400))
  }

  const move = async (index: number, direction: -1 | 1) => {
    const next = index + direction
    if (next < 0 || next >= subtasks.length) return
    const ids = subtasks.map((subtask) => subtask.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    await reorder(task.id, ids)
  }

  const openAllocation = async (subtask: Subtask) => {
    const current = await allocation(subtask.id)
    const remaining = remainingSubtaskEstimate(subtask.estimateMin, current.allocatedMin)
    setScheduleError(null)
    setAllocationDraft({
      subtask,
      allocatedMin: current.allocatedMin,
      durationMin: remaining > 0 ? remaining : subtask.estimateMin,
    })
  }

  const confirmAllocation = async () => {
    if (!allocationDraft) return
    const draft = blockDraftFromSubtask(task, allocationDraft.subtask, allocationDraft.durationMin)
    const result = await schedule(draft, true)
    if (!result.ok) {
      setScheduleError(result.preview.reason ?? 'Could not add this subtask to Today.')
      return
    }
    setAllocationDraft(null)
    setScheduleError(null)
  }

  const deleteSubtask = subtasks.find((subtask) => subtask.id === deleteSubtaskId) ?? null
  const allocationPreview = allocationDraft ? preview(allocationDraft.durationMin, true) : null
  const remaining = allocationDraft
    ? remainingSubtaskEstimate(allocationDraft.subtask.estimateMin, allocationDraft.allocatedMin)
    : 0

  return (
    <div className="subtask-list">
      <button type="button" className="subtask-disclosure" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span>{expanded ? '▾' : '▸'} Subtasks</span>
        <span>{subtasks.filter((subtask) => subtask.done).length}/{subtasks.length} · {hoursLabel(effectiveTaskEstimate(task, subtasks) ?? 0)}</span>
      </button>
      {expanded && (
        <div className="subtask-body">
          {loading && <div className="subtask-muted">Loading subtasks…</div>}
          {error && <div className="subtask-error">{error} <button type="button" onClick={() => void load(task.id)}>Retry</button></div>}
          {!loading && subtasks.map((subtask, index) => (
            <div key={subtask.id} className={`subtask-row ${drag.targetIndex === index && drag.sourceId !== subtask.id ? 'subtask-row-drag-target' : ''}`} onDragOver={(event) => { event.preventDefault(); over(index) }} onDrop={(event) => { event.preventDefault(); if (drag.sourceId !== null && drag.sourceId !== subtask.id) void reorder(task.id, insertIdBefore(subtasks.map((item) => item.id), drag.sourceId, subtask.id)); clear() }}>
              {!task.archived && <button type="button" className="subtask-drag-handle" draggable onDragStart={() => start(subtask.id)} onDragEnd={clear} aria-label={`Drag ${subtask.title}`} title="Drag to reorder">⠿</button>}
              <input type="checkbox" checked={subtask.done} disabled={task.archived} onChange={() => void setDone(subtask.id, task.id, !subtask.done)} aria-label={`Complete subtask: ${subtask.title}`} />
              <input className="subtask-title" value={titleDrafts[subtask.id] ?? subtask.title} readOnly={task.archived} onChange={(event) => scheduleTitleSave(subtask, event.target.value)} onBlur={() => { const value = titleDrafts[subtask.id]; if (value !== undefined) void commitTitle(subtask, value) }} aria-label="Subtask title" />
              <span className="subtask-estimate">{hoursLabel(subtask.estimateMin)}</span>
              {!task.archived && <>
                <button type="button" className="btn-icon" onClick={() => void move(index, -1)} disabled={index === 0} aria-label="Move subtask up">↑</button>
                <button type="button" className="btn-icon" onClick={() => void move(index, 1)} disabled={index === subtasks.length - 1} aria-label="Move subtask down">↓</button>
                <button type="button" className="btn-icon" onClick={() => void openAllocation(subtask)} aria-label={`Add ${subtask.title} to today`}>＋</button>
                <button type="button" className="btn-icon btn-danger" onClick={() => setDeleteSubtaskId(subtask.id)} aria-label={`Delete ${subtask.title}`}>×</button>
              </>}
            </div>
          ))}
          {!task.archived && (
            <div className="subtask-create">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New subtask" aria-label="New subtask title" />
              <input type="number" min="0.25" max="24" step="0.25" value={estimate} onChange={(event) => setEstimate(event.target.value)} aria-label="Subtask estimate in hours" />
              <button type="button" className="btn-secondary" onClick={() => void createNew()} disabled={!title.trim()}>Add</button>
            </div>
          )}
          {subtasks.length === 0 && !loading && <div className="subtask-muted">No subtasks yet.</div>}
        </div>
      )}

      {allocationDraft && allocationPreview && (
        <div className="subtask-allocation-popover" role="dialog" aria-label={`Schedule ${allocationDraft.subtask.title}`}>
          <div className="subtask-allocation-title">Add “{allocationDraft.subtask.title}” to Today</div>
          <div className="subtask-allocation-grid">
            <span>Estimated</span><strong>{formatDuration(allocationDraft.subtask.estimateMin)}</strong>
            <span>Already allocated</span><strong>{formatDuration(allocationDraft.allocatedMin)}</strong>
            <span>Remaining</span><strong>{formatDuration(remaining)}</strong>
            <span>Proposed</span><strong>{formatDuration(allocationPreview.durationMin)}</strong>
            <span>Today</span><strong>{minutesToClock(allocationPreview.startMin)} – {minutesToClock(allocationPreview.endMin)}</strong>
          </div>
          <label className="subtask-allocation-duration">Duration (hours)
            <input type="number" min="0.25" max="24" step="0.25" value={String(allocationDraft.durationMin / 60)} onChange={(event) => setAllocationDraft((draft) => draft ? { ...draft, durationMin: Math.round(Number(event.target.value) * 60) } : null)} aria-label="Allocation duration in hours" />
          </label>
          {remaining <= 0 && <div className="subtask-allocation-warning">Fully allocated already — this will be recorded as extra time.</div>}
          {!allocationPreview.fits && <div className="subtask-allocation-warning">{allocationPreview.reason}</div>}
          {scheduleError && <div className="subtask-error" role="alert">{scheduleError}</div>}
          <div className="subtask-allocation-actions">
            <button type="button" className="btn-secondary" onClick={() => { setAllocationDraft(null); setScheduleError(null) }}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!allocationPreview.valid || !allocationPreview.fits} onClick={() => void confirmAllocation()}>{remaining <= 0 ? 'Add extra time' : 'Add to today'}</button>
          </div>
        </div>
      )}

      {deleteSubtask && (
        <ConfirmActionModal
          title={`Delete “${deleteSubtask.title}”?`}
          description="This permanently removes the subtask. Existing historical blocks stay on your timeline."
          confirmLabel="Delete subtask"
          onCancel={() => setDeleteSubtaskId(null)}
          onConfirm={() => { setDeleteSubtaskId(null); void remove(deleteSubtask.id, task.id) }}
        />
      )}
    </div>
  )
}
