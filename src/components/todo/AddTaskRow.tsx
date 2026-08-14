import { useState } from 'react'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'

interface AddTaskRowProps {
  label: string
  onAdd: (title: string) => void
}

/** Per-group inline "+ Add task" row. Seeding of flags/priority is the caller's job. */
export function AddTaskRow({ label, onAdd }: AddTaskRowProps) {
  const [value, setValue] = useState('')

  const submit = () => {
    const title = value.trim()
    if (!title) return
    onAdd(title)
    setValue('')
  }

  return (
    <form
      className="todo-add-task"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Plus size={14} />
      <input
        className="todo-add-task-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={label}
        aria-label={label}
      />
      <button type="submit" className="btn-secondary todo-add-task-btn" disabled={!value.trim()}>
        Add
      </button>
    </form>
  )
}
