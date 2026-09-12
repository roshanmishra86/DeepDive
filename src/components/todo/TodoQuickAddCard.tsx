import { useState, useRef, useEffect } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { composeDueAt } from '../../lib/todo'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Sun } from '@phosphor-icons/react/dist/csr/Sun'
import { Tray } from '@phosphor-icons/react/dist/csr/Tray'

type QuickAddTarget = 'today' | 'tomorrow' | 'inbox'

export function TodoQuickAddCard() {
  const addTask = useTasksStore((s) => s.addTask)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<QuickAddTarget>('today')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if already in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
        return
      }
      if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    let dueAt: string | null = null
    const now = new Date()

    if (target === 'today') {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      dueAt = composeDueAt(todayStr, '17:00')
    } else if (target === 'tomorrow') {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
      dueAt = composeDueAt(tomStr, '17:00')
    }

    await addTask({
      title: trimmed,
      priority: 'medium',
      dueAt,
      tags: target === 'inbox' ? ['inbox'] : [],
    })

    setTitle('')
  }

  return (
    <div className="todo-rail-card">
      <h3 className="todo-rail-card-title">Quick add</h3>
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="todo-quick-add-input"
          placeholder="Add a task quickly..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="todo-quick-targets-row">
          <div className="todo-quick-targets-group">
            <button
              type="button"
              className={`todo-quick-target-btn${target === 'today' ? ' active' : ''}`}
              onClick={() => setTarget('today')}
            >
              <CalendarBlank size={12} />
              Today
            </button>
            <button
              type="button"
              className={`todo-quick-target-btn${target === 'tomorrow' ? ' active' : ''}`}
              onClick={() => setTarget('tomorrow')}
            >
              <Sun size={12} />
              Tomorrow
            </button>
            <button
              type="button"
              className={`todo-quick-target-btn${target === 'inbox' ? ' active' : ''}`}
              onClick={() => setTarget('inbox')}
            >
              <Tray size={12} />
              Inbox
            </button>
          </div>

          <button type="submit" className="todo-quick-add-submit">
            Add
          </button>
        </div>
      </form>
    </div>
  )
}
