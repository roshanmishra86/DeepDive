import { useState, useEffect } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { notePlainText } from '../../lib/richText'
import { formatTaskDueDate, extractTaskProject } from '../../lib/todo'
import { Article } from '@phosphor-icons/react/dist/csr/Article'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'

export function TodoDetailCard() {
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const tasks = useTasksStore((s) => s.tasks)
  const editTask = useTasksStore((s) => s.editTask)
  const subtasksByTask = useTasksStore((s) => s.subtasksByTask)
  const createSubtask = useTasksStore((s) => s.createSubtask)
  const setSubtaskDone = useTasksStore((s) => s.setSubtaskDone)
  const deleteSubtask = useTasksStore((s) => s.deleteSubtask)

  const task = tasks.find((t) => t.id === selectedTaskId)
  const subtasks = selectedTaskId ? subtasksByTask[selectedTaskId] ?? [] : []

  const [titleDraft, setTitleDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

  useEffect(() => {
    if (task) {
      setTitleDraft(task.title)
      setNotesDraft(notePlainText(task.notes))
    }
  }, [task?.id, task?.title, task?.notes])

  if (!task) {
    return (
      <div className="todo-rail-card">
        <h3 className="todo-rail-card-title">Task details</h3>
        <div className="todo-details-empty">
          <div className="todo-details-empty-icon">
            <Article size={44} weight="light" />
          </div>
          <h4 className="todo-details-empty-title">No task selected</h4>
          <p className="todo-details-empty-sub">
            Select a task to view details, add notes, or create subtasks.
          </p>
        </div>
      </div>
    )
  }

  const now = new Date()
  const dueInfo = formatTaskDueDate(task.dueAt, now)
  const projectName = extractTaskProject(task)

  const handleTitleBlur = async () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== task.title) {
      await editTask(task.id, { title: trimmed })
    }
  }

  const handleNotesBlur = async () => {
    if (notesDraft !== notePlainText(task.notes)) {
      await editTask(task.id, { notes: notesDraft })
    }
  }

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newSubtaskTitle.trim()
    if (!trimmed) return
    await createSubtask({
      taskId: task.id,
      title: trimmed,
      estimateMin: 30,
    })
    setNewSubtaskTitle('')
  }

  const priorityClass =
    task.priority === 'high'
      ? 'todo-priority-high'
      : task.priority === 'medium'
      ? 'todo-priority-medium'
      : 'todo-priority-low'

  return (
    <div className="todo-rail-card">
      <h3 className="todo-rail-card-title">Task details</h3>

      <div className="todo-details-content">
        <input
          type="text"
          className="todo-details-title-input"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={handleTitleBlur}
          aria-label="Task title"
        />

        <div className="todo-details-meta-row">
          <span className={`todo-priority-pill ${priorityClass}`}>
            {task.priority.toUpperCase()}
          </span>

          <span className={`todo-due-pill${dueInfo.isUrgent ? ' urgent' : ''}`}>
            <CalendarBlank size={12} />
            {dueInfo.text}
          </span>

          {projectName && (
            <span className="todo-project-pill">
              {projectName}
            </span>
          )}
        </div>

        <div>
          <label className="todo-details-notes-label" htmlFor="task-notes-textarea">
            Notes
          </label>
          <textarea
            id="task-notes-textarea"
            className="todo-details-notes-textarea"
            placeholder="Add notes, links, or context..."
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={handleNotesBlur}
          />
        </div>

        <div>
          <div className="todo-details-subtasks-head">
            <span className="todo-details-notes-label">
              Subtasks ({subtasks.filter((s) => s.done).length}/{subtasks.length})
            </span>
          </div>

          <div className="todo-details-subtasks-list">
            {subtasks.map((subtask) => (
              <div key={subtask.id} className="todo-details-subtask-item">
                <div className="todo-details-subtask-left">
                  <input
                    type="checkbox"
                    className="todo-subtask-checkbox"
                    checked={subtask.done}
                    onChange={() => void setSubtaskDone(subtask.id, task.id, !subtask.done)}
                    aria-label={`Complete subtask ${subtask.title}`}
                  />
                  <span className={`todo-subtask-title${subtask.done ? ' done' : ''}`}>
                    {subtask.title}
                  </span>
                </div>
                <button
                  type="button"
                  className="todo-details-subtask-del"
                  onClick={() => void deleteSubtask(subtask.id, task.id)}
                  aria-label={`Delete subtask ${subtask.title}`}
                >
                  <Trash size={12} />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddSubtask} style={{ marginTop: '8px' }}>
            <input
              type="text"
              className="todo-details-subtask-input"
              placeholder="+ Add subtask (Press Enter)..."
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
            />
          </form>
        </div>
      </div>
    </div>
  )
}
