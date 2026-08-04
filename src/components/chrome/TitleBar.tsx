import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '../../lib/platform'
import { formatTitleDate } from '../../lib/time'
import { Minus } from '@phosphor-icons/react/dist/csr/Minus'
import { Square } from '@phosphor-icons/react/dist/csr/Square'
import { X } from '@phosphor-icons/react/dist/csr/X'

/**
 * Custom Windows-style title bar (the window runs with `decorations: false`).
 * The left/center region is a drag region; the three window controls sit
 * outside it so they stay clickable. Double-clicking the drag region toggles
 * maximise, matching native behaviour.
 */
export function TitleBar() {
  // Re-render once a minute so the date stays honest across midnight.
  const [, forceRefresh] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => forceRefresh((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const today = formatTitleDate(new Date())

  const minimize = () => {
    if (isTauri()) void getCurrentWindow().minimize()
  }
  const toggleMaximize = () => {
    if (isTauri()) void getCurrentWindow().toggleMaximize()
  }
  const close = () => {
    if (isTauri()) void getCurrentWindow().close()
  }

  return (
    <header className="titlebar">
      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onDoubleClick={toggleMaximize}
      >
        <span className="titlebar-dot" aria-hidden />
        <span className="titlebar-name">Deep Work</span>
        <span className="titlebar-dash">—</span>
        <span className="titlebar-date" data-testid="titlebar-date">
          {today}
        </span>
      </div>
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          onClick={minimize}
          aria-label="Minimize"
          data-testid="win-minimize"
        >
          <Minus size={11} weight="light" />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          onClick={toggleMaximize}
          aria-label="Maximize"
          data-testid="win-maximize"
        >
          <Square size={11} weight="light" />
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          onClick={close}
          aria-label="Close"
          data-testid="win-close"
        >
          <X size={11} weight="light" />
        </button>
      </div>
    </header>
  )
}
