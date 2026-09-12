import { useEffect, useRef } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'

interface TodoHeaderProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onAddTask: () => void
}

export function TodoHeader({ searchQuery, onSearchChange, onAddTask }: TodoHeaderProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="todo-header-row">
      <div className="todo-header-title-block">
        <h1 className="todo-header-title">TODO</h1>
        <p className="todo-header-subtitle">
          Everything you want to get done. Capture, organize, and turn them into action.
        </p>
      </div>

      <div className="todo-header-actions">
        <div className="todo-search-box">
          <MagnifyingGlass size={15} className="todo-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="todo-search-input"
            placeholder="Search tasks, projects, tags..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search tasks"
          />
          <span className="todo-search-badge">Ctrl + K</span>
        </div>

        <button
          type="button"
          className="btn-add-task-primary"
          onClick={onAddTask}
          aria-label="Add task"
        >
          <Plus size={15} weight="bold" />
          Add task
          <CaretDown size={12} />
        </button>
      </div>
    </div>
  )
}
