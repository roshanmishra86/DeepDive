import { useEffect, useMemo, useRef, useState } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { useDayStore } from '../../stores/day'
import { openDatabase } from '../../db/index'
import { groupByMatrix, groupByDeadline, QUADRANTS, DEADLINE_BUCKETS } from '../../lib/todo'
import { fromDayKey } from '../../lib/time'
import type { Task } from '../../db/types'
import { TaskRow } from '../todo/TaskRow'
import { TaskEditor } from '../todo/TaskEditor'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'

export function TodoView() {
  const tasks = useTasksStore((s) => s.tasks)
  const groupBy = useTasksStore((s) => s.groupBy)
  const loading = useTasksStore((s) => s.loading)
  const error = useTasksStore((s) => s.error)
  const hydrate = useTasksStore((s) => s.hydrate)
  const setGroupBy = useTasksStore((s) => s.setGroupBy)
  const moveTask = useTasksStore((s) => s.moveTask)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTaskId, setEditorTaskId] = useState<number | null>(null)
  const nowMin = useDayStore((s) => s.nowMin)
  const currentDay = useDayStore((s) => s.currentDay)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropHint, setDropHint] = useState<string | null>(null)
  const dropCompleted = useRef(false)

  // Deadline buckets and due labels need a full Date, but the app has one
  // clock (the day store) and one interval. Rebuild it from the day store's
  // published tick rather than reading `new Date()` here, so nothing gets
  // stuck across the 48h boundary or midnight while the view stays open and
  // every surface agrees on what "now" is.
  const now = useMemo(() => {
    const date = fromDayKey(currentDay)
    date.setMinutes(nowMin)
    return date
  }, [currentDay, nowMin])

  // Hydrate on mount (idempotent; already hydrated at App level but safety for if this view opens first)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        await hydrate(driver)
      } catch (err) {
        console.error('Failed to hydrate week view:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate])

  const openEditor = (taskId: number | null = null) => {
    setEditorTaskId(taskId)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditorTaskId(null)
  }

  const hasAnyTasks = tasks.length > 0
  const beginDrag = (id: number) => { dropCompleted.current = false; setDraggingId(id); setDropHint(null) }
  const finishDrag = () => {
    setDraggingId(null)
    if (!dropCompleted.current) setDropHint(null)
  }
  const dropOn = async (group: 'do' | 'plan' | 'delegate' | 'drop' | 'soon' | 'week' | 'later' | 'none', beforeId: number | null) => {
    if (draggingId === null) return
    const ok = await moveTask(draggingId, { group, beforeId })
    dropCompleted.current = true
    if (!ok && groupBy === 'deadline') setDropHint('Move by editing the due date')
    else setDropHint(null)
    setDraggingId(null)
  }
  const moveWithin = async (group: 'do' | 'plan' | 'delegate' | 'drop' | 'soon' | 'week' | 'later' | 'none', groupTasks: Task[], index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= groupTasks.length) return
    const beforeId = direction === -1
      ? groupTasks[targetIndex].id
      : groupTasks[targetIndex + 1]?.id ?? null
    await moveTask(groupTasks[index].id, { group, beforeId })
  }
  const hoverDeadline = (bucket: 'soon' | 'week' | 'later' | 'none') => {
    if (draggingId === null) return
    const source = groupByDeadline(tasks, now).find((group) => group.tasks.some((task) => task.id === draggingId))?.bucket
    setDropHint(source && source !== bucket ? 'Move by editing the due date' : null)
  }

  if (loading) {
    return (
      <div className="todo-view">
        <div className="todo-body">
          <div className="view-empty">
            <div className="view-empty-title">Loading tasks…</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="todo-view">
        <div className="todo-body">
          <div className="view-empty">
            <div className="view-empty-title" style={{ color: 'var(--danger)' }}>
              Error: {error}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="todo-view">
      <div className="todo-header">
        <div>
          <h1 className="todo-title">TODO</h1>
          <p className="todo-subtitle">
            Capture everything. Organize by importance, add a tentative deadline, and break it down.
          </p>
        </div>
        <div className="todo-controls">
          <div className="todo-group-by">
            <span className="todo-group-label">Group by</span>
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-btn${groupBy === 'matrix' ? ' segmented-btn-active' : ''}`}
                onClick={() => setGroupBy('matrix')}
              >
                Importance
              </button>
              <button
                type="button"
                className={`segmented-btn${groupBy === 'deadline' ? ' segmented-btn-active' : ''}`}
                onClick={() => setGroupBy('deadline')}
              >
                Deadline
              </button>
            </div>
          </div>
          <button
            type="button"
            className="btn-accent btn-new-task"
            onClick={() => openEditor(null)}
          >
            <Plus size={16} />
            New task
          </button>
        </div>
      </div>

      <div className="todo-body">
        {!hasAnyTasks ? (
          <div className="todo-empty">
            <div className="todo-empty-text">No tasks yet</div>
            <button
              type="button"
              className="btn-accent"
              onClick={() => openEditor(null)}
            >
              Create your first task
            </button>
          </div>
        ) : (
          <div className="todo-groups">
            {groupBy === 'matrix'
              ? groupByMatrix(tasks).map((group) => {
                  const meta = QUADRANTS.find((q) => q.quadrant === group.quadrant)
                  if (!meta) return null
                  const isDrop = group.quadrant === 'drop'

                  return (
                    <section key={group.quadrant} className="todo-group">
                      <div className="todo-group-head">
                        <span className="todo-group-dot" style={{ backgroundColor: meta.dot }} />
                        <h2 className="todo-group-label">{meta.label}</h2>
                      </div>
                      <div className="todo-group-rows" onDragOver={(event) => { if (group.tasks.length === 0) event.preventDefault() }} onDrop={(event) => { if (group.tasks.length === 0) { event.preventDefault(); void dropOn(group.quadrant, null) } }}>
                        {group.tasks.length === 0 && draggingId !== null && <div className="todo-empty-drop-zone">Drop here</div>}
                        {group.tasks.map((task: Task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            isDrop={isDrop}
                            onEdit={openEditor}
                            now={now}
                            onDragStart={() => beginDrag(task.id)}
                            onDragOver={() => setDropHint(null)}
                            onDrop={() => void dropOn(group.quadrant, task.id)}
                            onDragEnd={finishDrag}
                            dragTarget={draggingId !== null && draggingId !== task.id}
                            onMoveUp={() => moveWithin(group.quadrant, group.tasks, group.tasks.findIndex((item) => item.id === task.id), -1)}
                            onMoveDown={() => moveWithin(group.quadrant, group.tasks, group.tasks.findIndex((item) => item.id === task.id), 1)}
                            canMoveUp={group.tasks[0]?.id !== task.id}
                            canMoveDown={group.tasks[group.tasks.length - 1]?.id !== task.id}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })
              : groupByDeadline(tasks, now).map((group) => {
                  const meta = DEADLINE_BUCKETS.find((b) => b.bucket === group.bucket)
                  if (!meta) return null

                  return (
                    <section key={group.bucket} className="todo-group">
                      <div className="todo-group-head">
                        <span className="todo-group-dot" style={{ backgroundColor: meta.dot }} />
                        <h2 className="todo-group-label">{meta.label}</h2>
                      </div>
                      <div className="todo-group-rows" onDragOver={(event) => { if (group.tasks.length === 0) { event.preventDefault(); hoverDeadline(group.bucket) } }} onDrop={(event) => { if (group.tasks.length === 0) { event.preventDefault(); void dropOn(group.bucket, null) } }}>
                        {group.tasks.length === 0 && draggingId !== null && <div className="todo-empty-drop-zone">Drop here</div>}
                        {group.tasks.map((task: Task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onEdit={openEditor}
                            now={now}
                            onDragStart={() => beginDrag(task.id)}
                            onDragOver={() => hoverDeadline(group.bucket)}
                            onDrop={() => void dropOn(group.bucket, task.id)}
                            onDragEnd={finishDrag}
                            dragTarget={draggingId !== null && draggingId !== task.id}
                            onMoveUp={() => moveWithin(group.bucket, group.tasks, group.tasks.findIndex((item) => item.id === task.id), -1)}
                            onMoveDown={() => moveWithin(group.bucket, group.tasks, group.tasks.findIndex((item) => item.id === task.id), 1)}
                            canMoveUp={group.tasks[0]?.id !== task.id}
                            canMoveDown={group.tasks[group.tasks.length - 1]?.id !== task.id}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
          </div>
        )}

        {dropHint && <div className="todo-drag-hint" role="status">{dropHint}</div>}

        <div className="todo-footer">
          Tags decide the quadrant. Nothing here is scheduled — blocks only exist for today.
        </div>
      </div>

      {editorOpen && <TaskEditor taskId={editorTaskId} onClose={closeEditor} />}
    </div>
  )
}
