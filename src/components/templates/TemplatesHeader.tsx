import { Plus } from '@phosphor-icons/react/dist/csr/Plus'

interface TemplatesHeaderProps {
  onNewTemplate: () => void
  onImportTodo: () => void
  onManageTags: () => void
}

export function TemplatesHeader({
  onNewTemplate,
  onImportTodo,
  onManageTags,
}: TemplatesHeaderProps) {
  return (
    <header className="tpl-gtd-header">
      <div className="tpl-gtd-title-area">
        <h1 className="tpl-gtd-title">Templates</h1>
        <p className="tpl-gtd-subtitle">
          Build reusable task sets, routines, and starter lists you can drop into Today or TODO in one step.
        </p>
      </div>

      <div className="tpl-gtd-actions">
        <button
          type="button"
          className="tpl-btn-secondary"
          onClick={onImportTodo}
          aria-label="Import from TODO"
        >
          <span>Import from TODO</span>
        </button>

        <button
          type="button"
          className="tpl-btn-secondary"
          onClick={onManageTags}
          aria-label="Manage tags"
        >
          <span>Manage tags</span>
        </button>

        <button
          type="button"
          className="tpl-btn-primary"
          onClick={onNewTemplate}
          aria-label="Create new template"
        >
          <Plus size={16} weight="bold" />
          <span>New template</span>
        </button>
      </div>
    </header>
  )
}
