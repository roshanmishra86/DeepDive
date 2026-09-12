import { Lightbulb } from '@phosphor-icons/react/dist/csr/Lightbulb'

export function TodoTipsShortcuts() {
  return (
    <>
      <div className="todo-rail-card">
        <div className="todo-tips-head">
          <Lightbulb size={17} className="todo-tips-icon" weight="fill" />
          <span>Productivity tips</span>
        </div>
        <p className="todo-tips-body">
          Use priority to focus on what matters. Break big tasks into smaller actionable steps.
        </p>
      </div>

      <div className="todo-rail-card">
        <h3 className="todo-rail-card-title">Keyboard shortcuts</h3>
        <div className="todo-shortcuts-list">
          <div className="todo-shortcut-row">
            <span>Quick add</span>
            <span className="todo-shortcut-key">Press Q</span>
          </div>
          <div className="todo-shortcut-row">
            <span>Search</span>
            <span className="todo-shortcut-key">Ctrl + K</span>
          </div>
          <div className="todo-shortcut-row">
            <span>Mark complete</span>
            <span className="todo-shortcut-key">Ctrl + Enter</span>
          </div>
          <div className="todo-shortcut-row">
            <span>Add subtask</span>
            <span className="todo-shortcut-key">Tab</span>
          </div>
          <div className="todo-shortcut-row">
            <span>Focus timer</span>
            <span className="todo-shortcut-key">Ctrl + P</span>
          </div>
        </div>
      </div>

      <div className="todo-quote-card">
        <blockquote className="todo-quote-text">
          “You can do anything, but not everything.”
        </blockquote>
        <div className="todo-quote-author">— David Allen</div>
      </div>
    </>
  )
}
