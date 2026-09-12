import { useEffect, useMemo, useRef, useState } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { useAppStore } from '../../stores/app'
import { useDayStore } from '../../stores/day'
import { openDatabase } from '../../db/index'
import { fromDayKey } from '../../lib/time'
import type { Task } from '../../db/types'
import {
  type Quadrant,
  filterTasksByGtdNav,
  groupByPriorityGtd,
  groupByProjectGtd,
  groupByDeadlineGtd,
  groupByBoardGtd,
  formatTaskDueDate,
  formatTaskEstimate,
  extractTaskProject,
  sortGroup,
} from '../../lib/todo'
import { TodoHeader } from '../todo/TodoHeader'
import { TodoTabs, type TodoTabId, type TodoSortMode, type TodoGroupMode } from '../todo/TodoTabs'
import { TodoGroupSection } from '../todo/TodoGroupSection'
import { TaskEditor } from '../todo/TaskEditor'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'

export const TODO_FOCUS_FADE_MS = 2000

export function TodoView() {
  const tasks = useTasksStore((s) => s.tasks)
  const loading = useTasksStore((s) => s.loading)
  const error = useTasksStore((s) => s.error)
  const hydrate = useTasksStore((s) => s.hydrate)
  const activeGtdFilter = useTasksStore((s) => s.activeGtdFilter)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId)
  const expandedTaskIds = useTasksStore((s) => s.expandedTaskIds)
  const toggleTaskExpanded = useTasksStore((s) => s.toggleTaskExpanded)
  const subtasksByTask = useTasksStore((s) => s.subtasksByTask)
  const moveTask = useTasksStore((s) => s.moveTask)
  const sortByGroup = useTasksStore((s) => s.sortByGroup)

  const pendingTodoFocus = useAppStore((s) => s.pendingTodoFocus)
  const clearTodoFocus = useAppStore((s) => s.clearTodoFocus)

  const nowMin = useDayStore((s) => s.nowMin)
  const currentDay = useDayStore((s) => s.currentDay)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TodoTabId>('all')
  const [sortMode, setSortMode] = useState<TodoSortMode>('priority')
  const [groupMode, setGroupMode] = useState<TodoGroupMode>('priority')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTaskId, setEditorTaskId] = useState<number | null>(null)
  const [focusedTaskId, setFocusedTaskId] = useState<number | null>(null)

  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)

  const bodyRef = useRef<HTMLDivElement>(null)

  const now = useMemo(() => {
    const date = fromDayKey(currentDay)
    date.setMinutes(nowMin)
    return date
  }, [currentDay, nowMin])

  // Hydrate on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        await hydrate(driver)
      } catch (err) {
        console.error('Failed to hydrate tasks:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate])

  // Pending focus target
  useEffect(() => {
    if (pendingTodoFocus === null) return
    const target = tasks.find((t) => t.id === pendingTodoFocus)
    if (target) {
      setSelectedTaskId(target.id)
      setFocusedTaskId(target.id)
    }
    clearTodoFocus()
  }, [pendingTodoFocus, tasks, clearTodoFocus, setSelectedTaskId])

  // Focus fade timer
  useEffect(() => {
    if (focusedTaskId === null) return
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-task-id="${focusedTaskId}"]`)
    el?.scrollIntoView?.({ block: 'center' })
    el?.focus?.()
    const timer = setTimeout(() => setFocusedTaskId(null), TODO_FOCUS_FADE_MS)
    return () => clearTimeout(timer)
  }, [focusedTaskId])

  // Tab switches can default groupMode
  const handleTabChange = (tab: TodoTabId) => {
    setActiveTab(tab)
    if (tab === 'priority') setGroupMode('priority')
    else if (tab === 'project') setGroupMode('project')
    else if (tab === 'deadline') setGroupMode('deadline')
  }

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let list = activeTab === 'completed'
      ? tasks.filter((t) => t.done)
      : tasks.filter((t) => !t.done)

    list = filterTasksByGtdNav(list, activeGtdFilter, now)

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((t) => {
        if (t.title.toLowerCase().includes(q)) return true
        if (t.notes.toLowerCase().includes(q)) return true
        if (t.tags?.some((tag) => tag.toLowerCase().includes(q))) return true
        return false
      })
    }

    return list
  }, [tasks, activeGtdFilter, now, searchQuery, activeTab])

  // Sort tasks within a group
  const sortTasksList = (list: Task[]): Task[] => {
    return sortGroup(list, sortMode)
  }

  const openEditor = (taskId: number | null = null) => {
    setEditorTaskId(taskId)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditorTaskId(null)
  }

  // Drag handlers
  const handleDragStart = (id: number) => {
    setDraggingId(id)
    setDropTargetId(null)
  }
  const handleDragOver = (id: number) => {
    if (draggingId !== null && draggingId !== id) {
      setDropTargetId(id)
    }
  }
  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }
  const handleDrop = async (targetId: number, group: Quadrant) => {
    if (draggingId === null || draggingId === targetId) {
      setDraggingId(null)
      setDropTargetId(null)
      return
    }
    await moveTask(draggingId, { group, beforeId: targetId }, now)
    setDraggingId(null)
    setDropTargetId(null)
  }

  const dragDisabledReason =
    (sortByGroup.do && sortByGroup.do !== 'manual')
      ? 'Set sort to Manual to reorder by hand.'
      : null

  // Board columns
  const boardColumns = useMemo(() => {
    return groupByBoardGtd(filteredTasks)
  }, [filteredTasks])

  // Section groups
  const effectiveGroupMode: TodoGroupMode =
    activeTab === 'priority'
      ? 'priority'
      : activeTab === 'project'
      ? 'project'
      : activeTab === 'deadline'
      ? 'deadline'
      : groupMode

  if (loading) {
    return (
      <div className="todo-gtd-view">
        <div className="view-state" role="status">
          <div className="view-state-eyebrow">TODO</div>
          <div className="view-state-title">Loading tasks…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="todo-gtd-view">
        <div className="view-state view-state-error" role="alert">
          <div className="view-state-eyebrow">TODO</div>
          <div className="view-state-title">Could not load tasks</div>
          <div className="view-state-description">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="todo-gtd-view" ref={bodyRef}>
      <TodoHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddTask={() => openEditor(null)}
      />

      <TodoTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        sortMode={sortMode}
        onSortChange={setSortMode}
        groupMode={effectiveGroupMode}
        onGroupChange={setGroupMode}
      />

      {activeTab === 'completed' ? (
        <div className="todo-sections-list">
          <TodoGroupSection
            id="completed"
            label="Completed tasks"
            hint="Finished work stays here. Uncheck a task to return it to To do."
            colorTheme="muted"
            iconType="archive"
            tasks={filteredTasks}
            now={now}
            selectedTaskId={selectedTaskId}
            focusedTaskId={focusedTaskId}
            expandedTaskIds={expandedTaskIds}
            subtasksByTask={subtasksByTask}
            dropTargetId={dropTargetId}
            dragDisabledReason={dragDisabledReason}
            onSelectTask={setSelectedTaskId}
            onToggleExpandTask={toggleTaskExpanded}
            onEditTask={openEditor}
            onDragStartTask={handleDragStart}
            onDragOverTask={handleDragOver}
            onDropOnTask={(id) => void handleDrop(id, 'do')}
            onDragEndTask={handleDragEnd}
          />
        </div>
      ) : activeTab === 'board' ? (
        <div className="todo-board-container">
          {boardColumns.map((col) => (
            <div key={col.id} className="todo-board-column">
              <div className="todo-board-col-head">
                <span>{col.label}</span>
                <span className="todo-board-col-count">{col.tasks.length}</span>
              </div>
              <div className="todo-board-cards">
                {col.tasks.map((task) => {
                  const dueInfo = formatTaskDueDate(task.dueAt, now)
                  const estimateStr = formatTaskEstimate(task.estimateMin)
                  const project = extractTaskProject(task)

                  return (
                    <div
                      key={task.id}
                      className="todo-board-card"
                      onClick={() => setSelectedTaskId(task.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelectedTaskId(task.id)
                      }}
                    >
                      <div className="todo-board-card-title">{task.title}</div>
                      <div className="todo-board-card-meta">
                        {dueInfo.text !== 'No date' && (
                          <span className={`todo-due-pill${dueInfo.isUrgent ? ' urgent' : ''}`}>
                            <CalendarBlank size={11} />
                            {dueInfo.text}
                          </span>
                        )}
                        {estimateStr && (
                          <span className="todo-estimate-pill">
                            <Flag size={11} />
                            {estimateStr}
                          </span>
                        )}
                        {project && (
                          <span className="todo-project-pill">{project}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : effectiveGroupMode === 'project' ? (
        <div className="todo-sections-list">
          {groupByProjectGtd(filteredTasks).map((group) => (
            <TodoGroupSection
              key={group.id}
              id={group.id}
              label={group.label}
              hint={group.hint}
              colorTheme="info"
              iconType="folder"
              tasks={sortTasksList(group.tasks)}
              now={now}
              selectedTaskId={selectedTaskId}
              focusedTaskId={focusedTaskId}
              expandedTaskIds={expandedTaskIds}
              subtasksByTask={subtasksByTask}
              dropTargetId={dropTargetId}
              dragDisabledReason={dragDisabledReason}
              onSelectTask={setSelectedTaskId}
              onToggleExpandTask={toggleTaskExpanded}
              onEditTask={openEditor}
              onDragStartTask={handleDragStart}
              onDragOverTask={handleDragOver}
              onDropOnTask={(id) => void handleDrop(id, 'do')}
              onDragEndTask={handleDragEnd}
            />
          ))}
        </div>
      ) : effectiveGroupMode === 'deadline' ? (
        <div className="todo-sections-list">
          {groupByDeadlineGtd(filteredTasks, now).map((group) => (
            <TodoGroupSection
              key={group.id}
              id={group.id}
              label={group.label}
              hint={group.hint}
              colorTheme={group.color}
              iconType="calendar"
              tasks={sortTasksList(group.tasks)}
              now={now}
              selectedTaskId={selectedTaskId}
              focusedTaskId={focusedTaskId}
              expandedTaskIds={expandedTaskIds}
              subtasksByTask={subtasksByTask}
              dropTargetId={dropTargetId}
              dragDisabledReason={dragDisabledReason}
              onSelectTask={setSelectedTaskId}
              onToggleExpandTask={toggleTaskExpanded}
              onEditTask={openEditor}
              onDragStartTask={handleDragStart}
              onDragOverTask={handleDragOver}
              onDropOnTask={(id) => void handleDrop(id, 'do')}
              onDragEndTask={handleDragEnd}
            />
          ))}
        </div>
      ) : effectiveGroupMode === 'none' ? (
        <div className="todo-sections-list">
          <TodoGroupSection
            id="all"
            label="All tasks"
            hint={`${filteredTasks.length} total tasks`}
            colorTheme="muted"
            iconType="star"
            tasks={sortTasksList(filteredTasks)}
            now={now}
            selectedTaskId={selectedTaskId}
            focusedTaskId={focusedTaskId}
            expandedTaskIds={expandedTaskIds}
            subtasksByTask={subtasksByTask}
            dropTargetId={dropTargetId}
            dragDisabledReason={dragDisabledReason}
            onSelectTask={setSelectedTaskId}
            onToggleExpandTask={toggleTaskExpanded}
            onEditTask={openEditor}
            onDragStartTask={handleDragStart}
            onDragOverTask={handleDragOver}
            onDropOnTask={(id) => void handleDrop(id, 'do')}
            onDragEndTask={handleDragEnd}
          />
        </div>
      ) : (
        /* Default: Priority accordion matching newScreen_Todo.png */
        <div className="todo-sections-list">
          {groupByPriorityGtd(filteredTasks).map((group) => (
            <TodoGroupSection
              key={group.id}
              id={group.id}
              label={group.label}
              hint={group.hint}
              colorTheme={group.color}
              iconType={group.iconName}
              tasks={sortTasksList(group.tasks)}
              now={now}
              selectedTaskId={selectedTaskId}
              focusedTaskId={focusedTaskId}
              expandedTaskIds={expandedTaskIds}
              subtasksByTask={subtasksByTask}
              dropTargetId={dropTargetId}
              dragDisabledReason={dragDisabledReason}
              onSelectTask={setSelectedTaskId}
              onToggleExpandTask={toggleTaskExpanded}
              onEditTask={openEditor}
              onDragStartTask={handleDragStart}
              onDragOverTask={handleDragOver}
              onDropOnTask={(id) => void handleDrop(id, 'do')}
              onDragEndTask={handleDragEnd}
            />
          ))}
        </div>
      )}

      {editorOpen && <TaskEditor taskId={editorTaskId} onClose={closeEditor} />}
    </div>
  )
}
