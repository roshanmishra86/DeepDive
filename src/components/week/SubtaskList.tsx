import { useEffect, useState } from 'react'
import type { Subtask, Task } from '../../db/types'
import { blockDraftFromSubtask, effectiveTaskEstimate, remainingSubtaskEstimate } from '../../lib/week'
import { checkShutdown, nextFreeStart } from '../../lib/today'
import { minutesToClock } from '../../lib/time'
import { useTasksStore } from '../../stores/tasks'
import { useTodayStore } from '../../stores/today'
import { useAppStore } from '../../stores/app'

interface SubtaskListProps {
  task: Task
}

function hoursLabel(minutes: number): string {
  return `${(minutes / 60).toFixed(2).replace(/\.00$/, '')}h`
}

export function SubtaskList({ task }: SubtaskListProps) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState('0.25')
  const subtasks = useTasksStore((state) => state.subtasksByTask[task.id] ?? [])
  const loading = useTasksStore((state) => state.subtaskLoading[task.id] ?? false)
  const error = useTasksStore((state) => state.subtaskError[task.id] ?? null)
  const load = useTasksStore((state) => state.loadSubtasks)
  const create = useTasksStore((state) => state.createSubtask)
  const setDone = useTasksStore((state) => state.setSubtaskDone)
  const update = useTasksStore((state) => state.updateSubtask)
  const remove = useTasksStore((state) => state.deleteSubtask)
  const reorder = useTasksStore((state) => state.reorderSubtasks)
  const allocation = useTasksStore((state) => state.getSubtaskAllocation)
  const addBlock = useTodayStore((state) => state.addBlock)
  const blocks = useTodayStore((state) => state.blocks)
  const shutdownMin = useTodayStore((state) => state.shutdownMin)
  const setView = useAppStore((state) => state.setView)

  useEffect(() => {
    if (expanded) void load(task.id)
  }, [expanded, load, task.id])

  const createNew = async () => {
    const estimateMin = Math.round(Number(estimate) * 60)
    if (!title.trim() || !Number.isFinite(estimateMin) || estimateMin < 15 || estimateMin > 1440 || estimateMin % 15 !== 0) return
    const id = await create({ taskId: task.id, title, estimateMin })
    if (id !== null) {
      setTitle('')
      setEstimate('0.25')
    }
  }

  const move = async (index: number, direction: -1 | 1) => {
    const next = index + direction
    if (next < 0 || next >= subtasks.length) return
    const ids = subtasks.map((subtask) => subtask.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    await reorder(task.id, ids)
  }

  const addToToday = async (subtask: Subtask) => {
    const current = await allocation(subtask.id)
    const remaining = remainingSubtaskEstimate(subtask.estimateMin, current.allocatedMin)
    const durationMin = remaining > 0 ? remaining : subtask.estimateMin
    if (remaining <= 0 && typeof window !== 'undefined' && !window.confirm('This subtask is fully allocated. Add extra time anyway?')) return
    const fromMin = new Date().getHours() * 60 + new Date().getMinutes()
    const startMin = nextFreeStart(blocks, fromMin, durationMin)
    const check = checkShutdown(startMin, durationMin, shutdownMin)
    if (!check.fits) return
    const draft = blockDraftFromSubtask(task, subtask, durationMin)
    const id = await addBlock({ ...draft, fromMin })
    if (id !== null) setView('today')
  }

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
            <div key={subtask.id} className="subtask-row">
              <input type="checkbox" checked={subtask.done} disabled={task.archived} onChange={() => void setDone(subtask.id, task.id, !subtask.done)} aria-label={`Complete subtask: ${subtask.title}`} />
              <input className="subtask-title" value={subtask.title} readOnly={task.archived} onChange={(event) => void update(subtask.id, task.id, { title: event.target.value })} aria-label="Subtask title" />
              <span className="subtask-estimate">{hoursLabel(subtask.estimateMin)}</span>
              {!task.archived && <>
                <button type="button" className="btn-icon" onClick={() => void move(index, -1)} disabled={index === 0} aria-label="Move subtask up">↑</button>
                <button type="button" className="btn-icon" onClick={() => void move(index, 1)} disabled={index === subtasks.length - 1} aria-label="Move subtask down">↓</button>
                <button type="button" className="btn-icon" onClick={() => void addToToday(subtask)} aria-label={`Add ${subtask.title} to today`}>＋</button>
                <button type="button" className="btn-icon btn-danger" onClick={() => void remove(subtask.id, task.id)} aria-label={`Delete ${subtask.title}`}>×</button>
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
          {shutdownMin !== null && <div className="subtask-muted">Today shuts down at {minutesToClock(shutdownMin)}.</div>}
        </div>
      )}
    </div>
  )
}
