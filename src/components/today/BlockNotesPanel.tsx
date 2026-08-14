import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAppStore } from '../../stores/app'
import { useBlocksStore } from '../../stores/blocks'
import { formatDuration } from '../../lib/time'
import { formatRelativeLabel } from '../../lib/relativeTime'
import { isTauri } from '../../lib/platform'
import { NotesEditor } from '../common/NotesEditor'
import type { DayBlock } from '../../db/types'
import { ArrowSquareOut } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'

type SaveState = 'Saved' | 'Saving…' | 'Save failed'

interface BlockNotesPanelProps {
  /** The block whose note is shown, or null for the empty state. */
  block: DayBlock | null
  /** Current instant, derived by the caller from the day store's clock. */
  now: Date
  /**
   * Populated with this panel's flush function so the caller (TodayView) can
   * flush a pending debounce before changing the selection — mirrors
   * PlanPanel's `registerPlanFlush`, but scoped locally since this panel's
   * selection lifecycle is owned by TodayView, not global chrome state.
   */
  flushRef?: MutableRefObject<(() => Promise<boolean>) | null>
  /** Reports whether the notes editor currently holds focus. */
  onFocusChange?: (focused: boolean) => void
}

/**
 * Per-block notes panel for the Today view. Mirrors PlanPanel's save
 * lifecycle (500ms debounce, a revision guard so a slow write cannot clobber
 * a newer edit, explicit flush, Saved/Saving…/Save failed indicator) but
 * scoped to a single day block's own note — never the linked task's notes.
 */
export function BlockNotesPanel({ block, now, flushRef, onFocusChange }: BlockNotesPanelProps) {
  const saveBlockNote = useBlocksStore((s) => s.saveBlockNote)
  const focusTask = useAppStore((s) => s.focusTask)
  const setView = useAppStore((s) => s.setView)

  const [draft, setDraft] = useState(block?.note ?? '')
  const [saveState, setSaveState] = useState<SaveState>('Saved')
  const revision = useRef(0)
  const savedRevision = useRef(0)
  const initializedBlockId = useRef<number | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writeChain = useRef(Promise.resolve(true))
  const bypassClose = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft
  // Sticky block identity: updated only when `block` is non-null, so a
  // flush triggered right after the selected block is rendered away (e.g.
  // deleted, or dropped by a midnight/day-key rollover) still saves against
  // the block it belongs to — including its own `day` — instead of silently
  // reporting success for a save that never happened.
  const blockRef = useRef(block)
  if (block) blockRef.current = block

  // Only seed the editor when the selected block's identity changes — same
  // reasoning as PlanPanel: `saveBlockNote` optimistically updates the store
  // row, so reacting to `block.note` here would replace a newer local
  // keystroke with the value currently being persisted.
  useEffect(() => {
    if (!block) {
      initializedBlockId.current = null
      return
    }
    if (initializedBlockId.current === block.id) return
    initializedBlockId.current = block.id
    draftRef.current = block.note
    setDraft(block.note)
    setSaveState('Saved')
    revision.current = 0
    savedRevision.current = 0
  }, [block])

  const saveRevision = useCallback(
    (targetBlock = blockRef.current, note = draftRef.current, rev = revision.current): Promise<boolean> => {
      if (rev <= savedRevision.current) return Promise.resolve(true)
      if (!targetBlock) {
        // There is an unsaved revision but no block identity to save it
        // against — this must not report success for a save that did not
        // happen, or the caller (TodayView) would silently drop the draft.
        setSaveState('Save failed')
        return Promise.resolve(false)
      }
      setSaveState('Saving…')
      writeChain.current = writeChain.current
        .then(async () => {
          // Save by the target block's OWN day, not whatever day is
          // currently displayed — a save racing a midnight rollover must
          // still land on the day the block actually belongs to.
          const ok = await saveBlockNote(targetBlock.day, targetBlock.id, note, new Date().toISOString())
          if (ok) {
            savedRevision.current = Math.max(savedRevision.current, rev)
            if (rev === revision.current) setSaveState('Saved')
          } else {
            setSaveState('Save failed')
          }
          return ok
        })
        .catch(() => {
          setSaveState('Save failed')
          return false
        })
      return writeChain.current
    },
    [saveBlockNote]
  )

  const flush = useCallback(async () => {
    if (debounce.current) {
      clearTimeout(debounce.current)
      debounce.current = null
    }
    return saveRevision()
  }, [saveRevision])

  useEffect(() => {
    if (!flushRef) return
    flushRef.current = flush
    return () => {
      if (flushRef.current === flush) flushRef.current = null
    }
  }, [flush, flushRef])

  // Mirrors PlanPanel's window-close handling: closing the app must not
  // lose an in-flight or debounced edit to the selected block's note.
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (bypassClose.current || (revision.current <= savedRevision.current && saveState !== 'Saving…')) return
      event.preventDefault()
      const ok = await flush()
      if (!ok) return
      bypassClose.current = true
      await getCurrentWindow().close()
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [flush, saveState])

  if (!block) {
    return (
      <div className="block-notes-panel block-notes-panel-empty">
        <div className="block-notes-header">Notes</div>
        <div className="block-notes-empty-text">Select a block to see its notes.</div>
      </div>
    )
  }

  const onChange = (value: string) => {
    // Update the ref synchronously as well as React state — a rapid switch
    // followed by a flush could otherwise save the previous render's draft.
    draftRef.current = value
    setDraft(value)
    revision.current += 1
    setSaveState('Saving…')
    if (debounce.current) clearTimeout(debounce.current)
    const scheduledRevision = revision.current
    const targetBlock = block
    debounce.current = setTimeout(() => {
      debounce.current = null
      void saveRevision(targetBlock, value, scheduledRevision)
    }, 500)
  }

  // Annotated: inferred from `block.kind` alone this would be `BlockKind[]`,
  // and the pomodoro/duration segments below are plain strings.
  const metaParts: string[] = [block.kind]
  if (block.pomodoros > 0) metaParts.push(`${block.pomodoros} pomodoro${block.pomodoros === 1 ? '' : 's'}`)
  metaParts.push(formatDuration(block.durationMin))

  const lastEdited = block.noteUpdatedAt ? formatRelativeLabel(block.noteUpdatedAt, now) : ''

  return (
    <div
      className="block-notes-panel"
      onFocus={() => onFocusChange?.(true)}
      onBlur={(event) => {
        // The toolbar lives inside this wrapper; flushing on every internal
        // focus move would fire a write per toolbar click — same guard as
        // PlanPanel.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onFocusChange?.(false)
          void flush()
        }
      }}
    >
      <div className="block-notes-header">
        Notes
        {block.taskId !== null && (
          <button
            type="button"
            className="block-notes-task-link"
            onClick={() => {
              // This button lives inside the blur-flush wrapper above, so
              // clicking it only moves focus within the panel — the blur
              // guard suppresses the flush there. Flush explicitly before
              // navigating away: switching views must never lose a pending
              // debounced edit. On failure, stay put so the user keeps the
              // failed draft and the visible "Save failed" state.
              void (async () => {
                const ok = await flush()
                if (!ok) return
                focusTask(block.taskId!)
                setView('todo')
              })()
            }}
          >
            This is a task. <ArrowSquareOut size={12} />
          </button>
        )}
      </div>
      <div className="block-notes-title">{block.title}</div>
      <div className="block-notes-meta">{metaParts.join(' · ')}</div>
      <div className="block-notes-editor">
        <NotesEditor
          value={draft}
          onChange={onChange}
          placeholder="Add notes for this block…"
          ariaLabel={`Notes for ${block.title}`}
        />
      </div>
      <div className="block-notes-footer">
        {lastEdited !== '' && <span>Last edited {lastEdited} · </span>}
        <span className="block-notes-save-state" role="status">{saveState}</span>
      </div>
    </div>
  )
}
