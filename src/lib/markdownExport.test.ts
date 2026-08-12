import { describe, expect, it } from 'vitest'
import type { Subtask, Task } from '../db/types'
import { exportTaskMarkdown, importMarkdownNotes, markdownFilename, NOTES_END, NOTES_START } from './markdownExport'
import { notePlainText, noteToMarkdown, serializeNote } from './richText'

const task: Task = { id: 4, title: 'Ship feature', notes: 'Write the plan', important: true, urgent: false, priority: 'high', dueAt: null, estimateMin: 60, done: true, createdAt: 'now', archived: true, sort: 0, completedAt: 'done', archivedAt: 'archived' }
const subtasks: Subtask[] = [{ id: 1, taskId: 4, title: 'Test it', estimateMin: 30, done: false, sort: 0, createdAt: 'now', dueAt: null }]

describe('markdown plan helpers', () => {
  it('exports stable metadata, checklists, and markers', () => {
    const markdown = exportTaskMarkdown(task, subtasks)
    expect(markdown).toContain('# Ship feature')
    expect(markdown).toContain('- [ ] Test it — 30 min')
    expect(markdown).toContain('<!-- deep-work:notes:start -->\nWrite the plan')
    expect(markdownFilename('Ship feature', 4)).toBe('ship-feature.md')
    expect(markdownFilename('!!!', 4)).toBe('task-4.md')
  })

  it('imports only marked notes and treats unmarked files as body text', () => {
    expect(notePlainText(importMarkdownNotes('header\n<!-- deep-work:notes:start -->\nbody\n<!-- deep-work:notes:end -->\nfooter'))).toBe('body')
    expect(notePlainText(importMarkdownNotes('plain markdown'))).toBe('plain markdown')
  })

  // Without this the .md a human is meant to read contains the raw envelope JSON.
  it('writes rich notes as markdown, never as envelope JSON', () => {
    const rich = serializeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Plan' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'step', marks: [{ type: 'bold' }] }] }] }] },
      ],
    })
    const markdown = exportTaskMarkdown({ ...task, notes: rich }, subtasks)
    expect(markdown).toContain(`${NOTES_START}\n# Plan\n\n- **step**\n${NOTES_END}`)
    expect(markdown).not.toContain('"v":1')
  })

  // Symmetrically, import must not store markdown source the editor would render literally.
  it('round-trips formatting through export then import', () => {
    const rich = serializeNote({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'see ' }, { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ship it' }] }] }] },
      ],
    })
    const imported = importMarkdownNotes(exportTaskMarkdown({ ...task, notes: rich }, subtasks))
    expect(noteToMarkdown(imported)).toBe(noteToMarkdown(rich))
  })

  it('keeps a legacy plain-text note byte-for-byte on export', () => {
    const legacy = 'raw <b>text</b> with * and _ chars'
    expect(exportTaskMarkdown({ ...task, notes: legacy }, subtasks)).toContain(`${NOTES_START}\n${legacy}\n${NOTES_END}`)
  })
})
