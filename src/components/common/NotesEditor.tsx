import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { ArrowClockwise } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { Link } from '@phosphor-icons/react/dist/csr/Link'
import { LinkBreak } from '@phosphor-icons/react/dist/csr/LinkBreak'
import { ListBullets } from '@phosphor-icons/react/dist/csr/ListBullets'
import { ListChecks } from '@phosphor-icons/react/dist/csr/ListChecks'
import { ListNumbers } from '@phosphor-icons/react/dist/csr/ListNumbers'
import { TextB } from '@phosphor-icons/react/dist/csr/TextB'
import { TextItalic } from '@phosphor-icons/react/dist/csr/TextItalic'
import { parseNote, serializeNote } from '../../lib/richText'

interface NotesEditorProps {
  /** The *stored* note — a rich-text envelope or a legacy plain-text note. */
  value: string
  onChange: (stored: string) => void
  placeholder?: string
  editable?: boolean
  /** Names the contenteditable surface; ProseMirror gives it none of its own. */
  ariaLabel?: string
}

interface ToolbarItem {
  id: string
  label: string
  icon: ReactNode
  pressed?: boolean
  disabled?: boolean
  run: () => void
}

// StarterKit 3.x already registers Link and Underline; adding
// @tiptap/extension-link alongside it throws a duplicate-name error at
// construction. Only the task list lives outside the kit.
// Built per editor: a configured extension instance binds to the editor that
// created it, so a shared module-level array leaves the second editor (a
// reopened plan panel) reporting the first one's active marks.
const createExtensions = () => [
  StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
  TaskList.configure({}),
  TaskItem.configure({ nested: true }),
]

export function NotesEditor({ value, onChange, placeholder, editable = true, ariaLabel }: NotesEditorProps) {
  // The editor is created once; `onUpdate` would otherwise close over the first
  // render's callback and save against a stale plan target.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // Guards the external-value sync loop: `setContent` on every `value` change
  // re-emits through `onUpdate`, whose output comes back as `value` and sets
  // content again. We only push content the editor did not itself produce.
  const lastEmitted = useRef(value)
  const applyingExternal = useRef(false)
  const extensions = useRef(createExtensions())
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)
  const didAutofocus = useRef(false)

  const editor = useEditor({
    extensions: extensions.current,
    content: parseNote(value),
    editable,
    // Autofocus is applied ourselves below, not via TipTap's `autofocus`
    // option — see the layout effect for why.
    autofocus: false,
    onUpdate: ({ editor: instance }) => {
      if (applyingExternal.current) return
      const stored = serializeNote(instance.getJSON())
      lastEmitted.current = stored
      onChangeRef.current(stored)
    },
  })

  // Parity with the textarea this replaced, which carried `autoFocus`. This
  // is deliberately NOT TipTap's own `autofocus: 'end'` option: `mount()`
  // re-applies that option from a `window.setTimeout(..., 0)` queued *after*
  // mount, unconditionally, regardless of anything that happened to the
  // selection in the meantime. If a toolbar click (e.g. a reopened plan
  // panel's Bold button) lands before that timeout fires — which it
  // reliably can once other pending timers are queued ahead of it — the
  // deferred autofocus stomps the selection back to the document end,
  // silently discarding the click's caret placement. A synchronous,
  // one-time `useLayoutEffect` runs before paint, so no click can ever land
  // before it, and it never re-fires to fight a later, real selection.
  useLayoutEffect(() => {
    if (!editor || didAutofocus.current) return
    didAutofocus.current = true
    editor.commands.focus('end')
  }, [editor])

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance?.isActive('bold') ?? false,
      italic: instance?.isActive('italic') ?? false,
      bulletList: instance?.isActive('bulletList') ?? false,
      orderedList: instance?.isActive('orderedList') ?? false,
      taskList: instance?.isActive('taskList') ?? false,
      link: instance?.isActive('link') ?? false,
      href: String(instance?.getAttributes('link').href ?? ''),
      canUndo: instance?.can().undo() ?? false,
      canRedo: instance?.can().redo() ?? false,
      empty: instance?.isEmpty ?? true,
    }),
  })

  useEffect(() => {
    if (!editor || value === lastEmitted.current) return
    lastEmitted.current = value
    applyingExternal.current = true
    editor.commands.setContent(parseNote(value), { emitUpdate: false })
    applyingExternal.current = false
  }, [editor, value])

  useEffect(() => {
    // `setEditable`'s default `emitUpdate` is true, so this fires a full
    // `update` event on every mount/prop change — reporting an
    // editor-lifecycle change through `onUpdate` as if the user had typed.
    // That marks the notes/plan panel dirty and can persist an unedited
    // draft on the next debounce or blur flush.
    editor?.setEditable(editable, false)
  }, [editable, editor])

  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    dom.setAttribute('role', 'textbox')
    dom.setAttribute('aria-multiline', 'true')
    if (ariaLabel) dom.setAttribute('aria-label', ariaLabel)
  }, [ariaLabel, editor])

  useEffect(() => {
    if (linkDraft !== null) linkInputRef.current?.focus()
  }, [linkDraft])

  if (!editor || !state) return null

  const items: ToolbarItem[] = [
    { id: 'bold', label: 'Bold', icon: <TextB size={13} />, pressed: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { id: 'italic', label: 'Italic', icon: <TextItalic size={13} />, pressed: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { id: 'bulletList', label: 'Bullet list', icon: <ListBullets size={13} />, pressed: state.bulletList, run: () => editor.chain().focus().toggleBulletList().run() },
    { id: 'orderedList', label: 'Numbered list', icon: <ListNumbers size={13} />, pressed: state.orderedList, run: () => editor.chain().focus().toggleOrderedList().run() },
    { id: 'taskList', label: 'Task list', icon: <ListChecks size={13} />, pressed: state.taskList, run: () => editor.chain().focus().toggleTaskList().run() },
    { id: 'link', label: 'Link', icon: <Link size={13} />, pressed: state.link, run: () => setLinkDraft(state.href) },
    { id: 'unlink', label: 'Remove link', icon: <LinkBreak size={13} />, disabled: !state.link, run: () => editor.chain().focus().extendMarkRange('link').unsetLink().run() },
    { id: 'undo', label: 'Undo', icon: <ArrowCounterClockwise size={13} />, disabled: !state.canUndo, run: () => editor.chain().focus().undo().run() },
    { id: 'redo', label: 'Redo', icon: <ArrowClockwise size={13} />, disabled: !state.canRedo, run: () => editor.chain().focus().redo().run() },
  ]

  // Roving tabindex: the toolbar is one tab stop, arrows move within it. A
  // disabled button cannot take focus, so stepping skips over them.
  const moveFocus = (delta: number) => {
    const buttons = Array.from(toolbarRef.current?.querySelectorAll('button') ?? [])
    if (buttons.length === 0) return
    let next = focusIndex
    for (let step = 0; step < buttons.length; step += 1) {
      next = (next + delta + buttons.length) % buttons.length
      if (!buttons[next].disabled) break
    }
    if (buttons[next].disabled) return
    setFocusIndex(next)
    buttons[next].focus()
  }

  const onToolbarKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') moveFocus(1)
    else if (event.key === 'ArrowLeft') moveFocus(-1)
    else return
    event.preventDefault()
  }

  const applyLink = () => {
    const href = (linkDraft ?? '').trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (href === '') chain.unsetLink().run()
    else chain.setLink({ href }).run()
    setLinkDraft(null)
  }

  const rovingIndex = Math.min(focusIndex, items.length - 1)

  return (
    <div className="notes-editor">
      {editable && (
        <div className="notes-editor-toolbar" role="toolbar" aria-label="Formatting" ref={toolbarRef} onKeyDown={onToolbarKeyDown}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={item.pressed ? 'notes-editor-tool notes-editor-tool-on' : 'notes-editor-tool'}
              aria-label={item.label}
              {...(item.pressed === undefined ? {} : { 'aria-pressed': item.pressed })}
              disabled={item.disabled}
              tabIndex={index === rovingIndex ? 0 : -1}
              onFocus={() => setFocusIndex(index)}
              onClick={item.run}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}
      {editable && linkDraft !== null && (
        <div className="notes-editor-link-row">
          <input
            ref={linkInputRef}
            className="notes-editor-link-input"
            type="url"
            value={linkDraft}
            placeholder="https://"
            aria-label="Link URL"
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              // Escape here must not reach PlanPanel, which reads it as "close".
              event.stopPropagation()
              if (event.key === 'Enter') applyLink()
              else if (event.key === 'Escape') setLinkDraft(null)
            }}
          />
          <button type="button" className="btn-secondary" onClick={applyLink}>Apply</button>
          <button type="button" className="btn-secondary" onClick={() => setLinkDraft(null)}>Cancel</button>
        </div>
      )}
      <div className="notes-editor-surface">
        <EditorContent editor={editor} className="notes-editor-content" />
        {placeholder && state.empty && <div className="notes-editor-placeholder" aria-hidden="true">{placeholder}</div>}
      </div>
    </div>
  )
}
