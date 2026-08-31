# DeepDive design system

## Product character

DeepDive is a calm, information-dense desktop planner. It should feel closer to an editorial daybook than a generic analytics dashboard. The schedule is always the primary object; supporting tools remain visually quiet until needed.

## Visual principles

1. **Warm, paper-like foundation.** Use warm off-whites rather than pure white or cool grey.
2. **One dominant accent.** Forest green identifies selection, primary actions, progress, and live focus. Category colours are muted supporting tints, not competing accents.
3. **Editorial hierarchy.** Newsreader is reserved for page-level titles and selected display moments. IBM Plex Sans is the interface face; IBM Plex Mono is used only for clocks and compact numeric metadata.
4. **Borders before shadows.** Normal surfaces use a one-pixel warm neutral border. Shadows appear only on hover, modal elevation, and the active work session.
5. **Dense but uncramped.** Compact rows, clear alignment, and a consistent 4/8/12/16/24/32 spacing rhythm preserve information density.
6. **Function remains visible.** Hover controls may become quieter, but primary actions, state labels, keyboard focus, and selected states must remain unambiguous.

## Core tokens

| Role | Token | Value |
| --- | --- | --- |
| Window | `--bg-window` | `#F7F5EF` |
| Card | `--bg-card` | `#FBFAF6` |
| Secondary surface | `--bg-panel` | `#F3F1EA` |
| Primary text | `--text` | warm near-black |
| Muted text | `--text-muted` | WCAG-adjusted warm grey |
| Border | `--border` | `#E4E1D8` |
| Soft border | `--border-subtle` | `#ECE9E1` |
| Primary green | `--accent` | `#174D3A` |
| Hover green | `--accent-hover` | `#205C47` |
| Sage surface | `--accent-surface` | `#E8EEE6` |

Existing semantic warning and danger tokens remain in use. Peach, ochre, and lavender are category tints only and must not replace semantic status colours.

## Typography

- Page title: Newsreader Variable, 36 px, weight 520, tight tracking.
- Section title: IBM Plex Sans, 13–16 px, weight 600.
- Body and controls: IBM Plex Sans, 12–14 px, weight 400–600.
- Clocks and tabular figures: IBM Plex Mono or `font-variant-numeric: tabular-nums`.
- Labels: sentence case by default. Uppercase with tracking is reserved for very small structural labels such as Daily ritual or In session.

## Application shell

- Title bar: 58 px, light card surface, one-pixel bottom border.
- Sidebar: 238 px on wide screens; quiet paper-like surface. Navigation rows are 42 px high with an 8 px radius. The active row uses sage fill and forest text.
- Right utility rail: 354 px on wide screens. Tools sit in independent bordered surfaces with 10 px radii and 12 px gaps.
- Music player: 78 px, persistent, card surface, top border, 44 px artwork, and a 46 px forest play control.

The existing collapse and responsive behavior remains authoritative. At narrower desktop widths, the right rail overlays or collapses according to the current application breakpoint.

## Page composition

All primary pages share the same header treatment: 30 px horizontal inset, editorial title, short muted description, and compact right-aligned actions. Page bodies use the warm window surface.

### Today

- Four compact summary metrics precede the page heading and remain in one horizontal row on desktop.
- The timeline receives the most horizontal space.
- Today displays blocks as a compact ordered plan. Real start times remain visible, but elapsed-time gaps must not create proportional blank spacer rows.
- Normal blocks are compact bordered rows; the active block uses deep forest green. Every block includes a category icon, category text, and a muted category tint.
- Block height follows a capped proportional scale: up to 30 minutes is 58 px, 30–90 minutes grows linearly, and 90 minutes or more is capped at 116 px.
- The full block surface uses pointer-driven dragging so it works reliably in the Tauri WebView. Reordering previews in place while dragging and the existing schedule logic adjusts subsequent blocks when released.
- Block notes retain the existing autosave and selection behavior but render as the first card in the right utility rail, above the focus timer and Up next card. Notes must never consume a separate planner column.
- Quick notes reserves a 25% taller writing viewport than the original compact rail treatment, keeps visible bottom separation from the timer, and scrolls vertically inside the writing surface when content exceeds its fixed height.
- Focus timer and upcoming tasks remain connected to their existing stores in the right utility rail.

### Week

Retain the existing seven-day planning model, drag behavior, statistics, and allocation data. Use the shared card treatment. Today is identified by a forest inset rule rather than a heavy filled panel.

### TODO

Retain grouping, filtering, drag behavior, task editing, and completion flows. Groups are quiet bordered surfaces; task rows remain flat within them to avoid cards nested inside cards.

### Templates

Keep the master-detail structure and all template operations. List and detail surfaces use the shared border, radius, and typography rules.

### Archive

Keep calendar, deep-hours histogram, day records, restore behavior, and export behavior. Analytical elements should remain simple and editorial rather than adopting dashboard decoration.

### Sound

Keep local, radio, and Archive sources, queueing, playback, rights notices, and session defaults. Artwork can carry visual texture; controls and surrounding surfaces stay restrained.

## States and interaction

- Hover: slightly stronger border or subtle warm shadow; no large movement.
- Pressed: at most a 1 px vertical shift.
- Selected: sage surface plus forest text/border.
- Active session: deep forest surface, off-white text, explicit `IN SESSION` label.
- Completed: text treatment plus reduced emphasis; never colour alone.
- Focus: visible 2 px forest outline with sufficient offset.
- Disabled: reduced contrast while keeping the control recognizable.

Animations should use opacity and transform, complete in 150–300 ms, and never interfere with planning or timer use.

## Accessibility and implementation constraints

- Preserve semantic buttons, labels, tooltips, and ARIA attributes.
- Maintain a practical 4.5:1 contrast target for body text.
- Do not identify block types or state through colour alone.
- Reuse the existing Phosphor icon family and consistent stroke weights.
- Do not introduce new product concepts from visual mock-up placeholder content.
- Preserve the existing architecture, Zustand stores, repositories, routing/view model, persistence, and business rules.
