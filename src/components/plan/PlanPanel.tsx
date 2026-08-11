import { useCallback, useEffect, useRef, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { DownloadSimple } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { UploadSimple } from '@phosphor-icons/react/dist/csr/UploadSimple'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { useAppStore, registerPlanFlush } from '../../stores/app'
import { useTasksStore } from '../../stores/tasks'
import { useTodayStore } from '../../stores/today'
import { exportTaskMarkdown, importMarkdownNotes, markdownFilename } from '../../lib/markdownExport'
import { isTauri } from '../../lib/platform'
import type { Subtask } from '../../db/types'

type SaveState = 'Saved' | 'Saving…' | 'Save failed'

const NO_SUBTASKS: Subtask[] = []

export function PlanPanel() {
  const target = useAppStore((state) => state.planTarget)
  const closePlan = useAppStore((state) => state.closePlan)
  const task = useTasksStore((state) => target?.kind === 'task'
    ? state.tasks.find((item) => item.id === target.id) ?? state.archivedTasks.find((item) => item.id === target.id) ?? null
    : null)
  const subtasks = useTasksStore((state) => target?.kind === 'task' ? state.subtasksByTask[target.id] ?? NO_SUBTASKS : NO_SUBTASKS)
  const loadSubtasks = useTasksStore((state) => state.loadSubtasks)
  const saveTaskNotes = useTasksStore((state) => state.saveTaskNotes)
  const blocks = useTodayStore((state) => state.blocks)
  const saveBlockNote = useTodayStore((state) => state.saveBlockNote)
  const block = target?.kind === 'block' ? blocks.find((item) => item.id === target.id) ?? null : null
  const noteOwner = task
  const [draft, setDraft] = useState(noteOwner?.notes ?? block?.note ?? '')
  const [saveState, setSaveState] = useState<SaveState>('Saved')
  const [notice, setNotice] = useState<string | null>(null)
  const revision = useRef(0)
  const savedRevision = useRef(0)
  const initializedTarget = useRef<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writeChain = useRef(Promise.resolve(true))
  const bypassClose = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    if (target?.kind === 'task') void loadSubtasks(target.id)
  }, [loadSubtasks, target])

  const targetKey = target ? `${target.kind}:${target.id}` : null

  // Only seed the editor when its identity changes. `saveTaskNotes` and
  // `saveBlockNote` optimistically update their store rows, so listening to
  // `notes` here would replace a newer local keystroke with the older value
  // currently being persisted. Waiting for the owner also covers a plan
  // target opened just before its task/block collection has hydrated.
  useEffect(() => {
    if (!targetKey) {
      initializedTarget.current = null
      return
    }
    if ((!noteOwner && !block) || initializedTarget.current === targetKey) return
    const notes = noteOwner?.notes ?? block?.note ?? ''
    initializedTarget.current = targetKey
    draftRef.current = notes
    setDraft(notes)
    setSaveState('Saved')
    setNotice(null)
    revision.current = 0
    savedRevision.current = 0
  }, [block, noteOwner, targetKey])

  const saveRevision = useCallback((targetAtRevision = target, notes = draftRef.current, rev = revision.current): Promise<boolean> => {
    if (!targetAtRevision || rev <= savedRevision.current) return Promise.resolve(true)
    setSaveState('Saving…')
    writeChain.current = writeChain.current.then(async () => {
      const ok = targetAtRevision.kind === 'task'
        ? await saveTaskNotes(targetAtRevision.id, notes)
        : await saveBlockNote(targetAtRevision.id, notes)
      if (ok) {
        savedRevision.current = Math.max(savedRevision.current, rev)
        if (rev === revision.current) setSaveState('Saved')
      } else {
        setSaveState('Save failed')
      }
      return ok
    }).catch(() => {
      setSaveState('Save failed')
      return false
    })
    return writeChain.current
  }, [saveBlockNote, saveTaskNotes, target])

  const flush = useCallback(async () => {
    if (debounce.current) {
      clearTimeout(debounce.current)
      debounce.current = null
    }
    return saveRevision()
  }, [saveRevision])

  useEffect(() => registerPlanFlush(flush), [flush])

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

  if (!target || (!noteOwner && !block)) return null

  const title = noteOwner?.title ?? block?.title ?? 'Plan'
  const context = noteOwner?.archived ? 'Archived task' : noteOwner ? 'Task' : 'Today block'

  const onChange = (value: string) => {
    // Update the ref synchronously as well as React state. Import followed by
    // flush and a rapid blur can otherwise save the previous render's draft.
    draftRef.current = value
    setDraft(value)
    revision.current += 1
    setSaveState('Saving…')
    if (debounce.current) clearTimeout(debounce.current)
    const scheduledRevision = revision.current
    debounce.current = setTimeout(() => {
      debounce.current = null
      void saveRevision(target, value, scheduledRevision)
    }, 500)
  }

  const handleImport = async () => {
    if (!isTauri()) {
      setNotice('Markdown import is available in the Deep Work desktop app.')
      return
    }
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }] })
      if (typeof selected !== 'string') return
      onChange(importMarkdownNotes(await readTextFile(selected)))
      await flush()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not import Markdown')
    }
  }

  const handleExport = async () => {
    if (!isTauri()) {
      setNotice('Markdown export is available in the Deep Work desktop app.')
      return
    }
    if (!noteOwner) {
      setNotice('Standalone block export is not available without a task.')
      return
    }
    try {
      await flush()
      const path = await save({ defaultPath: markdownFilename(noteOwner.title, noteOwner.id), filters: [{ name: 'Markdown', extensions: ['md'] }] })
      if (typeof path !== 'string') return
      await writeTextFile(path, exportTaskMarkdown({ ...noteOwner, notes: draftRef.current }, subtasks))
      setNotice('Markdown exported.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not export Markdown')
    }
  }

  const close = async () => {
    const ok = await flush()
    if (ok) closePlan()
  }

  return (
    <aside className="plan-panel" aria-label="Plan editor">
      <div className="plan-panel-head">
        <div>
          <div className="plan-panel-kicker">{context}</div>
          <h2>{title}</h2>
        </div>
        <button type="button" className="btn-icon" onClick={() => void close()} aria-label="Close plan">
          <X size={16} />
        </button>
      </div>
      <div className="plan-panel-state" role="status">{saveState}</div>
      <textarea
        className="plan-panel-textarea"
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => void flush()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            void close()
          }
        }}
        aria-label={`Plan notes for ${title}`}
        autoFocus
      />
      <div className="plan-panel-counts">{draft.trim() ? draft.trim().split(/\s+/).length : 0} words · {draft.length} characters</div>
      {!isTauri() && <div className="plan-panel-notice">Markdown import/export needs the Deep Work desktop app.</div>}
      {notice && <div className="plan-panel-notice" role="status">{notice}</div>}
      <div className="plan-panel-foot">
        <button type="button" className="btn-secondary" onClick={() => void handleImport()} disabled={!isTauri()} title={isTauri() ? 'Import Markdown' : 'Desktop app required'}>
          <UploadSimple size={13} /> Import Markdown
        </button>
        <button type="button" className="btn-secondary" onClick={() => void handleExport()} disabled={!isTauri()} title={isTauri() ? 'Export Markdown' : 'Desktop app required'}>
          <DownloadSimple size={13} /> Export Markdown
        </button>
      </div>
    </aside>
  )
}
