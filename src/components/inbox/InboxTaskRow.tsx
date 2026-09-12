import { useState, useRef, useEffect } from 'react'
import type { DayBlock, InboxGroup } from '../../db/types'
import { getTagPillClass, formatEstimateTime, formatLoggedTime } from '../../lib/inbox'
import { notePlainText, isEmptyNote } from '../../lib/richText'
import { useTimerStore } from '../../stores/timer'
import { DotsSixVertical } from '@phosphor-icons/react/dist/csr/DotsSixVertical'
import { DotsThreeVertical } from '@phosphor-icons/react/dist/csr/DotsThreeVertical'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Play } from '@phosphor-icons/react/dist/csr/Play'
import { Square } from '@phosphor-icons/react/dist/csr/Square'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { TrashSimple } from '@phosphor-icons/react/dist/csr/TrashSimple'

interface InboxTaskRowProps {
  block: DayBlock
  isWorking?: boolean
  onToggleComplete: () => void
  onStartFocus: () => void
  onStopFocus: () => void
  onSetGroup: (group: InboxGroup) => void
  onDelete: () => void
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
}

export function InboxTaskRow({
  block,
  isWorking: isWorkingProp,
  onToggleComplete,
  onStartFocus,
  onStopFocus,
  onSetGroup,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: InboxTaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const timerRunning = useTimerStore((s) => s.running)
  const timerBlockTitle = useTimerStore((s) => s.blockTitle)
  const pomodorosDone = useTimerStore((s) => s.pomodorosDone)
  const pomodorosPerBlock = useTimerStore((s) => s.pomodorosPerBlock)

  // Is this block the currently active working block?
  const isWorking = isWorkingProp ?? block.inboxGroup === 'working'
  const isAttachedToTimer = isWorking && timerBlockTitle === block.title

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  // Format due date if any
  let formattedDue: string | null = null
  if (block.inboxGroup === 'waiting') {
    // If dueAt exists or block has a wait note
    formattedDue = 'Later'
  }

  const hasNote = Boolean(block.note && !isEmptyNote(block.note))
  const plainNote = hasNote && block.note ? notePlainText(block.note).trim() : ''

  let rowClassName = 'inbox-task-row'
  if (isWorking) rowClassName += ' inbox-task-row-working'
  if (block.completed) rowClassName += ' inbox-task-row-done'

  return (
    <div
      className={rowClassName}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver?.()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop?.()
      }}
    >
      <div
        className="inbox-task-drag-handle"
        draggable
        onDragStart={onDragStart}
        aria-label="Drag to reorder"
      >
        <DotsSixVertical size={14} />
      </div>

      <button
        type="button"
        className={`inbox-task-checkbox ${block.completed ? 'inbox-task-checkbox-checked' : ''}`}
        onClick={onToggleComplete}
        aria-label={block.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {block.completed && <Check size={11} />}
      </button>

      <div className="inbox-task-main">
        <div className="inbox-task-title-row">
          <span className={`inbox-task-title ${block.completed ? 'inbox-task-title-done' : ''}`}>
            {block.title}
          </span>

          {block.tags && block.tags.length > 0 && (
            <div className="inbox-task-tags">
              {block.tags.map((tag) => (
                <span key={tag} className={`tag-pill ${getTagPillClass(tag)}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {hasNote && plainNote && (
          <div className="inbox-task-notes">
            <span>○</span>
            <span>{plainNote}</span>
          </div>
        )}
      </div>

      <div className="inbox-task-meta">
        <span className="inbox-task-time" title="Estimated duration">
          <Clock size={12} />
          <span>{formatEstimateTime(block.durationMin)}</span>
        </span>

        {isWorking ? (
          <span className="inbox-task-working-indicator">
            <Clock size={12} />
            <span>{formatLoggedTime(block.loggedSec ?? 0)}</span>
            <span>
              Pomodoro {Math.min(pomodorosDone + 1, Math.max(1, pomodorosPerBlock))}/{Math.max(1, pomodorosPerBlock)}
            </span>
          </span>
        ) : formattedDue ? (
          <span className="inbox-task-time" title="Scheduled/Due">
            <CalendarBlank size={12} />
            <span>{formattedDue}</span>
          </span>
        ) : (
          <span className="inbox-task-time" title="Time spent">
            <Clock size={12} />
            <span>{formatLoggedTime(block.loggedSec ?? 0)}</span>
          </span>
        )}

        {isWorking && timerRunning && isAttachedToTimer ? (
          <button
            type="button"
            className="inbox-task-action-btn inbox-task-stop-btn"
            onClick={onStopFocus}
          >
            <Square size={10} weight="fill" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            type="button"
            className="inbox-task-action-btn inbox-task-start-btn"
            onClick={onStartFocus}
          >
            <Play size={10} weight="fill" />
            <span>Start focus</span>
          </button>
        )}

        <div className="inbox-task-more-wrap" ref={menuRef}>
          <button
            type="button"
            className="inbox-task-more-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Task options"
          >
            <DotsThreeVertical size={14} />
          </button>

          {menuOpen && (
            <div className="inbox-task-more-menu">
              {block.inboxGroup !== 'working' && (
                <div
                  className="inbox-task-more-item"
                  onClick={() => {
                    onSetGroup('working')
                    setMenuOpen(false)
                  }}
                >
                  Move to Working Now
                </div>
              )}
              {block.inboxGroup !== 'next' && (
                <div
                  className="inbox-task-more-item"
                  onClick={() => {
                    onSetGroup('next')
                    setMenuOpen(false)
                  }}
                >
                  Move to Do Next
                </div>
              )}
              {block.inboxGroup !== 'capture' && (
                <div
                  className="inbox-task-more-item"
                  onClick={() => {
                    onSetGroup('capture')
                    setMenuOpen(false)
                  }}
                >
                  Move to Capture
                </div>
              )}
              {block.inboxGroup !== 'waiting' && (
                <div
                  className="inbox-task-more-item"
                  onClick={() => {
                    onSetGroup('waiting')
                    setMenuOpen(false)
                  }}
                >
                  Move to Waiting / Later
                </div>
              )}
              <div
                className="inbox-task-more-item inbox-task-more-item-danger"
                onClick={() => {
                  onDelete()
                  setMenuOpen(false)
                }}
              >
                <TrashSimple size={12} />
                <span>Delete</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
