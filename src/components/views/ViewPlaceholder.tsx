import type { ReactElement } from 'react'

/**
 * Scaffold for views whose phases haven't landed yet (Today → Phase 4,
 * Week → 5, Templates → 6, Archive → 7, Library → 8). Keeps the real header
 * copy from the mockup so the chrome is navigable and honest about scope.
 */
export function ViewPlaceholder(props: {
  title: string
  subtitle: string
  phase: string
  children?: ReactElement
}) {
  return (
    <div className="view">
      <div className="view-header">
        <div>
          <div className="view-title">{props.title}</div>
          <div className="view-subtitle">{props.subtitle}</div>
        </div>
      </div>
      <div className="view-body">
        <div className="view-empty">
          <div className="view-empty-title">Arrives in {props.phase}</div>
          <div className="view-empty-text">
            The shell is ready — this view lands in a later phase of the plan.
          </div>
        </div>
        {props.children}
      </div>
    </div>
  )
}
