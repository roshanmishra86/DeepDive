// Rich notes live in the same TEXT columns as the old plain-text notes
// (`day_block.note`, `task.notes`). Sniffing whether stored text "looks like
// HTML" would corrupt a plain note that happens to mention <p> or <b>, so rich
// content is stored as a versioned JSON envelope and anything that is not a
// recognised envelope is treated as legacy plain text. Every ambiguous input
// must degrade to plain text — never to empty, never to a throw.
// `@tiptap/core` is not a direct dependency; `@tiptap/react` re-exports it and
// this is a type-only import, so nothing from React reaches the bundle.
import type { JSONContent } from '@tiptap/react'

export const RICH_NOTE_VERSION = 1

// Nodes whose children run together on one line; everything else is a block
// and gets a newline between siblings.
const INLINE_TYPES = new Set(['text', 'hardBreak'])
const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList'])

const isInline = (node: JSONContent): boolean => INLINE_TYPES.has(node.type ?? '')
const isList = (node: JSONContent): boolean => LIST_TYPES.has(node.type ?? '')

function plainTextToDoc(text: string): JSONContent {
  // A blank line is an *empty* paragraph: ProseMirror represents that as a
  // paragraph with no `content` key at all, not an empty array.
  const paragraphs = text.split('\n').map((line): JSONContent =>
    line === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text: line }] }
  )
  return { type: 'doc', content: paragraphs }
}

function isEnvelope(value: unknown): value is JSONContent & { v: number } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.v === RICH_NOTE_VERSION && record.type === 'doc'
}

/**
 * Rich when the stored text parses to an object with `v === 1` and
 * `type === 'doc'`. Note that `JSON.parse` happily accepts `123`, `"text"` and
 * `null` — all of those are still legacy plain text.
 * The `v` key belongs to the envelope and is stripped from the returned doc.
 */
export function parseNote(stored: string): JSONContent {
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return plainTextToDoc(stored)
  }
  if (!isEnvelope(parsed)) return plainTextToDoc(stored)
  const { v: _v, ...doc } = parsed
  return doc
}

export function serializeNote(doc: JSONContent): string {
  return JSON.stringify({ v: RICH_NOTE_VERSION, ...doc })
}

function nodeText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  const children = node.content ?? []
  const separator = children.every(isInline) ? '' : '\n'
  return children.map(nodeText).join(separator)
}

/** Flattened text for word/character counts and future search. */
export function notePlainText(stored: string): string {
  return nodeText(parseNote(stored))
}

// Anything that is not a doc/paragraph/text wrapper counts as content even when
// it carries no text, so the has-notes indicator errs towards "there is
// something here" rather than hiding a note the user can see.
function hasContent(node: JSONContent): boolean {
  if (node.type === 'text') return (node.text ?? '').trim() !== ''
  if (node.type !== 'doc' && node.type !== 'paragraph') return true
  return (node.content ?? []).some(hasContent)
}

/**
 * `TimelineBlock` shows its has-notes pencil on `block.note ? ...`, which is
 * truthy for a serialized *empty* doc. Callers must use this instead.
 */
export function isEmptyNote(stored: string): boolean {
  return !hasContent(parseNote(stored))
}

// ---------------------------------------------------------------------------
// Markdown — supported subset: headings, bold, italic, links, bullet list,
// ordered list, task list. Anything else degrades to its plain text.
// ---------------------------------------------------------------------------

// `_` is escaped too: leaving it bare would make `snake_case_name` re-import as
// italic. Correctness of the round trip beats a slightly noisier .md file.
const escapeInline = (text: string): string => text.replace(/([\\*_[\]])/g, '\\$1')

// A paragraph that starts with `#`, `- `, `1.` etc. would re-import as a
// heading or a list item, silently changing the note's structure.
const escapeBlockStart = (line: string): string =>
  line.replace(/^(\s*)(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/, (_m, pad: string, token: string) => `${pad}\\${token}`)

const unescape = (text: string): string => text.replace(/\\(.)/g, '$1')

function markNames(node: JSONContent): string[] {
  return (node.marks ?? []).map((mark) => mark.type)
}

function renderTextNode(node: JSONContent): string {
  const names = markNames(node)
  let out = escapeInline(node.text ?? '')
  if (names.includes('italic')) out = `*${out}*`
  if (names.includes('bold')) out = `**${out}**`
  const link = (node.marks ?? []).find((mark) => mark.type === 'link')
  if (link) out = `[${out}](${String(link.attrs?.href ?? '')})`
  return out
}

function inlineToMarkdown(nodes: JSONContent[]): string {
  // Merge runs of identically-marked text first, otherwise a doc that stores
  // "bold" as two adjacent text nodes exports as `**a****b**`.
  const merged: JSONContent[] = []
  for (const node of nodes) {
    const previous = merged[merged.length - 1]
    if (
      node.type === 'text' &&
      previous?.type === 'text' &&
      JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      merged[merged.length - 1] = { ...previous, text: (previous.text ?? '') + (node.text ?? '') }
      continue
    }
    merged.push(node)
  }
  return merged
    .map((node) => {
      if (node.type === 'text') return renderTextNode(node)
      if (node.type === 'hardBreak') return '\n'
      return escapeInline(nodeText(node))
    })
    .join('')
}

function listToMarkdown(list: JSONContent, depth: number): string[] {
  const pad = '  '.repeat(depth)
  const start = typeof list.attrs?.start === 'number' ? list.attrs.start : 1
  const lines: string[] = []
  ;(list.content ?? []).forEach((item, index) => {
    const children = item.content ?? []
    const own = children.filter((child) => !isList(child))
    const nested = children.filter(isList)
    const marker =
      list.type === 'orderedList'
        ? `${start + index}.`
        : list.type === 'taskList'
          ? `- [${item.attrs?.checked ? 'x' : ' '}]`
          : '-'
    lines.push(`${pad}${marker} ${own.map((child) => inlineToMarkdown(child.content ?? [])).join(' ')}`.trimEnd())
    for (const child of nested) lines.push(...listToMarkdown(child, depth + 1))
  })
  return lines
}

function blockToMarkdown(node: JSONContent): string {
  if (node.type === 'heading') {
    const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
    return `${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${inlineToMarkdown(node.content ?? [])}`
  }
  if (node.type === 'paragraph') return escapeBlockStart(inlineToMarkdown(node.content ?? []))
  if (isList(node)) return listToMarkdown(node, 0).join('\n')
  // Unsupported node (code block, quote, image…): keep the words rather than
  // dropping the node or throwing.
  return escapeBlockStart(escapeInline(nodeText(node)))
}

/**
 * A legacy plain-text note is returned byte-for-byte: it was never markdown and
 * re-encoding it would escape characters the user typed on purpose.
 */
export function noteToMarkdown(stored: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return stored
  }
  if (!isEnvelope(parsed)) return stored
  return (parsed.content ?? []).map(blockToMarkdown).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const TASK_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s*(.*)$/
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/
// Ordered by precedence: a link's label may itself contain emphasis.
const INLINE_RE =
  /\[((?:\\.|[^\]\\])*)\]\(([^)]*)\)|\*\*((?:\\.|[^\\])+?)\*\*|\*((?:\\.|[^*\\])+?)\*|_((?:\\.|[^_\\])+?)_/

function parseInline(text: string, marks: JSONContent['marks'] = []): JSONContent[] {
  if (text === '') return []
  const match = INLINE_RE.exec(text)
  if (!match) return [{ type: 'text', text: unescape(text), ...(marks?.length ? { marks } : {}) }]
  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  let inner: JSONContent[]
  if (match[1] !== undefined) {
    inner = parseInline(match[1], [...(marks ?? []), { type: 'link', attrs: { href: unescape(match[2] ?? '') } }])
  } else if (match[3] !== undefined) {
    inner = parseInline(match[3], [...(marks ?? []), { type: 'bold' }])
  } else {
    inner = parseInline(match[4] ?? match[5] ?? '', [...(marks ?? []), { type: 'italic' }])
  }
  return [...parseInline(before, marks), ...inner, ...parseInline(after, marks)]
}

const paragraph = (text: string): JSONContent => {
  const content = parseInline(text)
  return content.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content }
}

interface ListFrame {
  indent: number
  type: string
  node: JSONContent
}

/** Markdown outside the supported subset survives as paragraph text. */
export function markdownToNote(md: string): JSONContent {
  const blocks: JSONContent[] = []
  const stack: ListFrame[] = []

  const closeLists = (): void => {
    stack.length = 0
  }

  const pushItem = (indent: number, type: string, item: JSONContent): void => {
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (top.indent > indent || (top.indent === indent && top.type !== type)) stack.pop()
      else break
    }
    let top = stack[stack.length - 1]
    if (!top || top.indent < indent) {
      const list: JSONContent = { type, content: [] }
      if (top) {
        const parentItems = top.node.content ?? []
        const parentItem = parentItems[parentItems.length - 1]
        // A nested list with no parent item (over-indented first line) would be
        // orphaned; treat it as a sibling of the outer list instead.
        if (parentItem) parentItem.content = [...(parentItem.content ?? []), list]
        else blocks.push(list)
      } else {
        blocks.push(list)
      }
      top = { indent, type, node: list }
      stack.push(top)
    }
    top.node.content = [...(top.node.content ?? []), item]
  }

  for (const line of md.split('\n')) {
    if (line.trim() === '') {
      closeLists()
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading) {
      closeLists()
      blocks.push({ type: 'heading', attrs: { level: heading[1].length }, content: parseInline(heading[2]) })
      continue
    }
    const task = TASK_RE.exec(line)
    if (task) {
      pushItem(task[1].length, 'taskList', {
        type: 'taskItem',
        attrs: { checked: task[2].toLowerCase() === 'x' },
        content: [paragraph(task[3])],
      })
      continue
    }
    const ordered = ORDERED_RE.exec(line)
    if (ordered) {
      pushItem(ordered[1].length, 'orderedList', { type: 'listItem', content: [paragraph(ordered[3])] })
      continue
    }
    const bullet = BULLET_RE.exec(line)
    if (bullet) {
      pushItem(bullet[1].length, 'bulletList', { type: 'listItem', content: [paragraph(bullet[2])] })
      continue
    }
    closeLists()
    blocks.push(paragraph(line))
  }

  return { type: 'doc', content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }] }
}
