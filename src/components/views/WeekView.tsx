import { useEffect, useState } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { openDatabase } from '../../db/index'
import { groupByMatrix, groupByDeadline, QUADRANTS, DEADLINE_BUCKETS } from '../../lib/week'
import type { Task } from '../../db/types'
import { TaskRow } from '../week/TaskRow'
import { TaskEditor } from '../week/TaskEditor'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'

export function WeekView() {
  const tasks = useTasksStore((s) => s.tasks)
  const groupBy = useTasksStore((s) => s.groupBy)
  const loading = useTasksStore((s) => s.loading)
  const error = useTasksStore((s) => s.error)
  const hydrate = useTasksStore((s) => s.hydrate)
  const setGroupBy = useTasksStore((s) => s.setGroupBy)
  const moveTask = useTasksStore((s) => s.moveTask)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTaskId, setEditorTaskId] = useState<number | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropHint, setDropHint] = useState<string | null>(null)

  // Refresh `now` on an interval so deadline buckets and due labels don't
  // get stuck across the 48h boundary or midnight while the view stays open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(id)
  }, [])

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
  const beginDrag = (id: number) => { setDraggingId(id); setDropHint(null) }
  const finishDrag = () => setDraggingId(null)
  const dropOn = async (group: 'do' | 'plan' | 'delegate' | 'drop' | 'soon' | 'week' | 'later' | 'none', beforeId: number | null) => {
    if (draggingId === null) return
    const ok = await moveTask(draggingId, { group, beforeId })
    if (!ok && groupBy === 'deadline') setDropHint('Move by editing the due date')
    else setDropHint(null)
    setDraggingId(null)
  }

  if (loading) {
    return (
      <div className="week-view">
        <div className="week-body">
          <div className="view-empty">
            <div className="view-empty-title">Loading tasks…</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="week-view">
        <div className="week-body">
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
    <div className="week-view">
      <div className="week-header">
        <div>
          <h1 className="week-title">This week</h1>
          <p className="week-subtitle">
            A list to remember, not a schedule. Tag by urgency and importance, then pull what today can hold.
          </p>
        </div>
        <div className="week-controls">
          <div className="week-group-by">
            <span className="week-group-label">Group by</span>
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

      <div className="week-body">
        {!hasAnyTasks ? (
          <div className="week-empty">
            <div className="week-empty-text">No tasks yet</div>
            <button
              type="button"
              className="btn-accent"
              onClick={() => openEditor(null)}
            >
              Create your first task
            </button>
          </div>
        ) : (
          <div className="week-groups">
            {groupBy === 'matrix'
              ? groupByMatrix(tasks).map((group) => {
                  const meta = QUADRANTS.find((q) => q.quadrant === group.quadrant)
                  if (!meta) return null
                  const isDrop = group.quadrant === 'drop'

                  return (
                    <section key={group.quadrant} className="week-group">
                      <div className="week-group-head">
                        <span className="week-group-dot" style={{ backgroundColor: meta.dot }} />
                        <h2 className="week-group-label">{meta.label}</h2>
                      </div>
                      <div className="week-group-rows" onDragOver={(event) => { if (group.tasks.length === 0) event.preventDefault() }} onDrop={() => { if (group.tasks.length === 0) void dropOn(group.quadrant, null) }}>
                        {group.tasks.length === 0 && draggingId !== null && <div className="week-empty-drop-zone">Drop here</div>}
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
                    <section key={group.bucket} className="week-group">
                      <div className="week-group-head">
                        <span className="week-group-dot" style={{ backgroundColor: meta.dot }} />
                        <h2 className="week-group-label">{meta.label}</h2>
                      </div>
                      <div className="week-group-rows" onDragOver={(event) => { if (group.tasks.length === 0) event.preventDefault() }} onDrop={() => { if (group.tasks.length === 0) void dropOn(group.bucket, null) }}>
                        {group.tasks.length === 0 && draggingId !== null && <div className="week-empty-drop-zone">Drop here</div>}
                        {group.tasks.map((task: Task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onEdit={openEditor}
                            now={now}
                            onDragStart={() => beginDrag(task.id)}
                            onDragOver={() => setDropHint('Move by editing the due date')}
                            onDrop={() => void dropOn(group.bucket, task.id)}
                            onDragEnd={finishDrag}
                            dragTarget={draggingId !== null && draggingId !== task.id}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
          </div>
        )}

        {dropHint && <div className="week-drag-hint" role="status">{dropHint}</div>}

        <div className="week-footer">
          Tags decide the quadrant. Nothing here is scheduled — blocks only exist for today.
        </div>
      </div>

      {editorOpen && <TaskEditor taskId={editorTaskId} onClose={closeEditor} />}
    </div>
  )
}
