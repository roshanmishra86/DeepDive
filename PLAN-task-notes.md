# Implementation plan — task plans, archive, drag ordering, subtasks, and repeat modes

Status: **implemented on `feat/task-planning-release`; local validation complete.**

This document replaces the earlier phased proposal. The work still has an internal dependency order, but every item below belongs to one change set, one migration, and one release. Nothing is intended to ship partially.

## 1. Outcome

The finished app will provide all of the following:

- A right-side plan editor for Markdown source attached to a week task or Today block.
- DB-backed notes that remain reachable after a task is archived.
- Markdown import and export with a stable round-trip format.
- Drag reordering for Today blocks, template blocks, and week task rows, with keyboard controls retained.
- Subtasks with hour estimates, progress, manual ordering, and allocation into Today blocks.
- A three-state repeat control: off, repeat queue/library, and repeat one track.
- A fix for queues stalling on the first track.

The implementation must preserve the current Tauri/React/Zustand/SQLite architecture and the existing browser-preview fallback.

## 2. Verified current baseline

These are facts from the current repository, not assumptions:

- `task.notes` already exists and is read and written through the task repository and store. No new notes table is needed.
- Task completion currently changes only `task.done`. It does not archive a task or record when completion happened.
- `archiveTask()` exists only at repository level and is not called by the application.
- The Archive view is based on `day_block` and `day_note`; it has no task archive UI.
- Week tasks have no persisted manual order. Their canonical order is currently incomplete first, then due date, then ID.
- Today and template blocks already support one-step up/down reordering. Reordering changes `start_min`, so it reschedules blocks rather than merely changing presentation.
- Template block moves are persisted atomically. Today block moves are not: changed start times and dense sort positions are currently separate writes.
- Today blocks already have their own `note` and optional `task_id`.
- Subtasks do not exist.
- `playTrack()` currently copies `loopUntilBlockEnd` into `audio.loop`. With looping enabled, the browser does not emit `ended`, so queue advancement cannot run.
- The repository currently contains migrations `0001` through `0004`.

## 3. Resolved product behavior

These decisions are part of the scope. They are not left for implementation-time interpretation.

### Plans and Markdown

- SQLite is canonical. The application does not maintain permanently linked files or watch external editors.
- Editing is Markdown source only. No rendered preview or Markdown parser is added in this release.
- A linked Today block opens its parent task plan. A standalone Today block opens its own `day_block.note`.
- Subtasks do not have separate plan notes in this release; their context belongs in the parent task plan.
- The plan panel is non-modal and replaces the existing right rail while open. It does not cover the main content.
- Archived task plans remain editable. Editing a plan does not unarchive the task.

### Archive

- Archiving is manual and available only when a task is complete.
- Completing a task records `completed_at` but leaves it visible in This Week.
- Archiving records `archived_at` and removes the task from This Week.
- Restoring clears `archived_at`, preserves `completed_at`, and returns the still-completed task to This Week.
- The Archive displays completion time and archive time as different facts.
- Archive emptiness is based on both day records and archived tasks. Archived tasks must remain visible even when no day record exists.

### Drag semantics

- “Templates are draggable” means blocks inside a selected template. Whole template cards remain alphabetically ordered and are out of scope.
- Today and template block drops reschedule the list using the same gap-preserving semantics as the existing move buttons.
- Week rows can be reordered within any visible group.
- In matrix mode, dropping into another quadrant also updates `important` and `urgent` to match the destination.
- In deadline mode, cross-bucket drops are rejected because the app must not invent a due date.
- Dragging a week task onto Today is out of scope; the existing Plan today action remains.
- Existing up/down buttons remain the keyboard-accessible alternative on all three surfaces.

### Estimates and subtasks

- Every subtask requires an estimate from 0.25 to 24 hours, in 0.25-hour steps, stored as minutes.
- When a task has subtasks, its displayed effective estimate is the sum of subtask estimates. `task.estimate_min` remains the fallback used only when no subtasks exist.
- Completing every subtask does not automatically complete the parent task.
- Completing a linked Today block does not automatically complete its subtask. The two checkboxes remain explicit user decisions.
- A subtask can be allocated into Today more than once so work can be split across days.
- Scheduling opens a compact duration popover, prefilled with the unallocated remainder and capped by available time before shutdown. The user can change the duration in 0.25-hour steps before adding the block.
- “Allocated” is derived from the total duration of existing `day_block` rows linked to the subtask across all days. If the estimate is already fully allocated, another allocation is allowed only after explicit confirmation and is labelled extra time.

### Repeat

- The repeat button cycles on single clicks: `off -> queue -> one -> off`.
- `queue` means repeat the explicit queue when it is non-empty, otherwise repeat the library order.
- `one` repeats only the current track.
- `off` advances normally and stops at the end of the queue or library.
- Manual next/previous always advances, including in `one` mode.
- Repeat mode persists in `setting` and defaults to `off`.
- The old `loopUntilBlockEnd` control is removed. It conflicts with truthful three-state repeat behavior and is the cause of the queue stall. Its setting row is removed by the migration.

The playback truth table is authoritative:

| Mode | Explicit queue | Natural track end | `audio.loop` |
| --- | --- | --- | --- |
| `off` | non-empty | next queue item; stop after last | `false` |
| `off` | empty | next library item; stop after last | `false` |
| `queue` | non-empty | next queue item; wrap after last | `false` |
| `queue` | empty | next library item; wrap after last | `false` |
| `one` | either | repeat current track | `true` |

## 4. One migration: `0005_task_planning.sql`

All schema and setting changes ship in a single migration registered as version 5 in `src-tauri/src/lib.rs`.

```sql
ALTER TABLE task ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task ADD COLUMN completed_at TEXT;
ALTER TABLE task ADD COLUMN archived_at TEXT;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY archived
      ORDER BY
        done ASC,
        CASE WHEN due_at IS NULL THEN 1 ELSE 0 END ASC,
        due_at ASC,
        id ASC
    ) - 1 AS position
  FROM task
)
UPDATE task
SET sort = (SELECT position FROM ranked WHERE ranked.id = task.id);

CREATE INDEX idx_task_archived_sort ON task(archived, sort);
CREATE INDEX idx_task_archived_at ON task(archived, archived_at);

CREATE TABLE subtask (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  estimate_min INTEGER NOT NULL CHECK (estimate_min BETWEEN 15 AND 1440),
  done INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_subtask_task_id_sort ON subtask(task_id, sort);

ALTER TABLE day_block
  ADD COLUMN subtask_id INTEGER REFERENCES subtask(id) ON DELETE SET NULL;

CREATE INDEX idx_day_block_subtask_id ON day_block(subtask_id);

DELETE FROM setting WHERE key = 'loopUntilBlockEnd';
INSERT INTO setting (key, value)
VALUES ('repeatMode', 'off')
ON CONFLICT(key) DO NOTHING;
```

Migration requirements:

- Existing notes, tasks, archived flags, and blocks must remain intact.
- The task sort backfill must reproduce the current canonical task order before manual reordering is introduced.
- Legacy completed/archived rows may have null timestamps because the old schema recorded only booleans. Do not invent historical dates; render those timestamps as “Unknown” until a future user action supplies a real value.
- A dedicated upgrade test must apply `0001` through `0004`, insert representative data, apply `0005`, and verify preservation and backfills. Merely testing a fresh database is insufficient.
- `src/db/migrations.test.ts` must update its table/index expectations and add foreign-key behavior tests. It does not contain a migration-count assertion.

## 5. Domain and persistence work

### Types

Update `src/db/types.ts`:

- Add `sort`, `completedAt`, and `archivedAt` to `Task`.
- Add a `Subtask` interface.
- Add `subtaskId` to `DayBlock`.
- Add `RepeatMode = 'off' | 'queue' | 'one'` in the player domain module.

Every optimistic object and row mapper must populate the new non-optional fields. TypeScript exhaustiveness is expected to catch missed `DayBlock` persistence fields.

### Task repository

Update `src/db/repos/tasks.ts` to provide:

- Active tasks ordered by `sort`, then ID.
- Archived tasks ordered by known `archived_at DESC`, then legacy null-timestamp rows by ID.
- New tasks assigned `MAX(sort) + 1` among active tasks.
- `setTaskDone(id, done, completedAt)` that sets or clears `completed_at` with `done` in one statement.
- `archiveTask(id, archivedAt)` guarded by `done = 1` and reporting whether a row changed.
- `unarchiveTask(id)` that clears `archived_at` and `archived` and assigns the task to `MAX(sort) + 1` among active tasks in the same transaction.
- `reorderTasksAtomic(orderedIds, flagPatch?: { id: number; important: boolean; urgent: boolean })` using `driver.transaction()` so quadrant changes and dense sort updates either all persist or all roll back.

`sortTasks()` in `src/lib/week.ts` becomes: incomplete before complete, then manual `sort`, then ID. Deadline bucketing remains derived from `dueAt`; due date is no longer a hidden secondary ordering after the user has established an order.

### Subtask repository

Add `src/db/repos/subtasks.ts` and export it from `src/db/index.ts`:

- `listSubtasks(taskId)` and `listSubtasksForTasks(taskIds)`.
- `createSubtask`, `updateSubtask`, `setSubtaskDone`, and `deleteSubtask`.
- `reorderSubtasks` using a transaction and dense sort positions.
- `getSubtaskAllocation(subtaskId)` returning total allocated minutes and block count across all days.

Repository tests must cover ordering, validation, cascade deletion from a task, `SET NULL` on historical blocks, allocation totals, and transaction rollback.

### Day-block repository

Carry `subtask_id` through the row mapper, create input, update patch, template-copy defaults, tests, and all exhaustive persistence maps.

Add `moveDayBlocksAtomic(day, changedStarts, orderedIds)` matching `moveTemplateBlocksAtomic`. Today drag and the existing Today move buttons must both use this operation. Do not retain the current separate start-time and sort write path.

## 6. Store contracts

### Tasks store

Extend `useTasksStore` with:

- `archivedTasks`, with separate loading/error state from the active list.
- `hydrateActive()` and `hydrateArchived()`; app startup loads active tasks, while Archive loads archived tasks on entry.
- `archiveTask(id, nowIso)` and `unarchiveTask(id)` that move rows between the two arrays only after repository success.
- `toggleDone(id, nowIso)` so tests and callers provide the clock explicitly.
- `moveTask(id, destination: { group: Quadrant | DeadlineBucket; beforeId: number | null })` using the atomic repository operation. The store derives a complete active-task ID order, moves relative to destination-group neighbors, and restamps every active task densely; it never treats grouped render indices as global indices.
- `subtasksByTask` plus per-task loading/error state and request deduplication.
- Subtask CRUD/reorder actions that keep each list canonically ordered.
- `saveTaskNotes(id, notes): Promise<boolean>`, able to update active or archived rows and report failure to the panel.

### Today store

Extend `useTodayStore` with:

- `moveTo(id, targetIndex)` using the same pure ordering function and atomic repository path as up/down moves.
- `saveBlockNote(id, note): Promise<boolean>`.
- `addBlock()` support for `subtaskId`.

### Plan target state

Add to `useAppStore`:

```ts
type PlanTarget =
  | { kind: 'task'; id: number }
  | { kind: 'block'; id: number }
  | null
```

`openPlan` closes Settings; `openSettings` closes the plan. Switching plan targets must flush the current draft before changing the target.

## 7. Plan panel and safe saving

Add `src/components/plan/PlanPanel.tsx` and render it in the right-rail slot in `App.tsx`:

- Header: title, active/archived or standalone-block context, save state, and close button.
- Body: monospace textarea, word count, and character count.
- Footer: Import Markdown and Export Markdown.
- Task buttons use `NotePencil` and show a filled state when notes are non-empty.
- A linked Timeline block opens `{ kind: 'task' }`; a standalone block opens `{ kind: 'block' }`.
- Remove the notes textarea from `TaskEditor` so there is one editing path.
- Escape flushes and closes. Space in the textarea must never toggle the timer.
- The panel is non-modal: it must have a clear accessible label but must not claim `aria-modal` or trap focus.

Saving behavior:

- Maintain a local draft and monotonically increasing revision number.
- Debounce writes by 500 ms, but serialize them so an older write cannot finish after a newer one.
- The save indicator has `Saved`, `Saving...`, and `Save failed` states.
- Blur, target switching, and panel close await the newest revision.
- On save failure, keep the panel open and preserve the draft.
- Register a Tauri `onCloseRequested` handler while a dirty/saving panel exists. Prevent close, flush, set a one-shot bypass guard, then close once after success without recursively intercepting the second close request. If saving fails, keep the window open and show the error.
- Do not claim that `beforeunload` guarantees an asynchronous SQLite flush; it does not.

## 8. Markdown import and export

Add pure helpers in `src/lib/markdownExport.ts`:

- Stable filename slug with `task-{id}.md` fallback.
- Task heading and metadata for due date, effective estimate, flags, completion time, and archive time.
- Subtasks as GFM checklist items.
- Explicit note-body markers:

```md
<!-- deep-work:notes:start -->
User-authored plan text
<!-- deep-work:notes:end -->
```

Import behavior:

- If both markers exist, import only the text between them.
- Otherwise, treat the entire selected file as the note body.
- Import never overwrites title, flags, dates, estimates, subtasks, or completion state.
- After import, save through the same serialized note-saving path as typing.

Tauri wiring:

- `dialog.open()` plus `readTextFile()` for import.
- `dialog.save()` plus `writeTextFile()` for export.
- Add `fs:allow-read-text-file` and `fs:allow-write-text-file` to `src-tauri/capabilities/default.json`; `fs:default` does not grant these commands.
- In browser preview, disable import/export with a desktop-only explanation instead of throwing.
- Verify import and export in a real Tauri build because unit tests cannot prove runtime scope behavior.

## 9. Drag implementation

Add a shared native HTML drag layer in `src/components/common/useDragList.ts` and pure helpers in `src/lib/dragList.ts`:

- Drag starts only from a visible handle, not from the whole interactive row.
- Track source ID and target index rather than trusting DOM indices that may include Today gap rows.
- Clear drag state on drop, cancel, and `dragend`.
- Expose a local preview order during `dragover`; persist only once on drop.
- Render a drop indicator and update previewed Today/template start times so the user can see that the drop reschedules the day.
- Continue showing conflict and shutdown information against the preview schedule.

Add `moveBlockTo(blocks, fromIndex, toIndex)` to `src/lib/today.ts`:

- Input must be canonical order.
- Remove and insert the block at the destination.
- Preserve each block's prior gap keyed by block ID.
- Anchor the result to the original first start time.
- Return the original array on an invalid/no-op move.
- Reimplement one-step `moveBlock()` through `moveBlockTo()`.

Week drag requirements:

- Use task IDs, not rendered indices, across grouped lists.
- Render valid drop zones for empty matrix quadrants.
- Matrix cross-quadrant drop updates flags and order in one transaction.
- Deadline cross-bucket hover and drop show a visible “Move by editing the due date” explanation and do not mutate state.
- Add up/down controls to week rows and subtasks; they use the same store operations as drag.

## 10. Subtask UI and scheduling

Add `src/components/week/SubtaskList.tsx`:

- Task-row disclosure control with `done/total` and effective estimated hours.
- Lazy load on first expansion with visible loading and retry states.
- Inline creation with required title and estimate.
- Checkbox, edit, drag handle, up/down controls, delete confirmation, and Add to today.
- Parent task archive view renders its subtasks read-only except for the plan itself; restoring the task makes subtask controls available again.

Lift estimate constants and conversions from `TaskEditor.tsx` into `src/lib/week.ts` so tasks and subtasks share validation and formatting.

Add pure helpers:

- `effectiveTaskEstimate(task, subtasks)`.
- `blockDraftFromSubtask(task, subtask, durationMin)`; parent importance determines deep versus shallow kind.
- `remainingSubtaskEstimate(estimateMin, allocatedMin)`.

Do not duplicate `TaskRow.handlePlanToday`. Extract a shared scheduling helper/action that performs:

1. Duration validation.
2. `nextFreeStart` calculation.
3. Shutdown check.
4. Block creation with `taskId` and optional `subtaskId`.
5. Navigation to Today after success only.

The duration popover shows estimated, already allocated, remaining, proposed duration, prospective start/end, and any shutdown warning.

## 11. Repeat implementation

Add pure player routing helpers in `src/lib/player.ts`:

- `nextRepeatMode(mode)`.
- `resolveEndedAction(mode, queue, queueIndex, trackId, tracks)`.
- An explicit action result such as play queue index, play library ID, replay current, or stop.

Update `usePlayerStore`:

- Replace `repeat: boolean` with `repeatMode`.
- Hydrate and persist `repeatMode` with validation and `off` fallback.
- `applyLoopFlag()` is the only function allowed to write `audio.loop`; it sets true only for `one`.
- Reapply it after track selection, repeat changes, enqueue, dequeue, queue clear, and stop/reset paths.
- Add an explicit `clearQueue` action.
- Route `ended` through the pure resolver and the truth table in section 3.
- Keep manual next/previous wrapping independent of repeat mode.

Update UI:

- Music bar click cycles modes.
- Use Phosphor `Repeat` for `off`/`queue` and `RepeatOnce` for `one`; no custom superscript overlay is required.
- Remove boolean `aria-pressed`. Use mode-specific `aria-label` and `title` text.
- Remove the old Loop track until block ends toggle from Library settings.
- Update all render fixtures and tests that currently initialize `repeat` or `loopUntilBlockEnd`.

## 12. Archive integration

Add a completed-tasks section without weakening the existing day archive:

- A completed `TaskRow` exposes an Archive action; incomplete rows do not. The action passes the current ISO instant explicitly and remains visible if persistence fails.
- ArchiveView hydrates day records and archived tasks independently.
- Loading or failure in one section does not erase the other section.
- The overall empty state appears only when both sources are empty.
- Archived rows show title, completed timestamp, archived timestamp, effective estimate, subtask progress, and notes indicator.
- Clicking a row opens the editable plan panel.
- Restore is an explicit action with confirmation.
- Archived subtasks are fetched in one batch for the visible archived task IDs to avoid an N+1 query.

## 13. Tests and acceptance criteria

### Database and repositories

- Upgrade migration preserves representative pre-0005 data.
- New columns, table, indexes, setting changes, checks, and foreign keys are asserted.
- Active/archive ordering, completion timestamps, archive guard, restore, and note persistence are covered.
- Today, template, task, and subtask reorder failures prove full transaction rollback.
- Deleting a task cascades subtasks and preserves linked historical blocks with null task/subtask IDs.

### Pure logic

- `moveBlockTo` covers long moves, boundaries, gaps, overlaps, equal start times, and stable day start.
- Task manual ordering remains stable across matrix/deadline grouping.
- Effective and remaining estimates cover empty, partial, full, and over-allocation.
- Markdown round-trip extracts only the marked note body.
- Repeat transition and ended routing exhaust every truth-table row, missing queued tracks, empty library, and single-track library.

### Stores

- Optimistic failures restore the correct current state without overwriting a later successful mutation.
- Archived and active task collections stay synchronized across archive/restore.
- Lazy subtask loads deduplicate concurrent requests.
- Note saves are serialized; close waits; failure retains the draft.
- Enqueueing while a track is playing sets `audio.loop = false` unless mode is `one`.

### Render and interaction

- Plan buttons work from Week, linked Today blocks, standalone Today blocks, and Archive.
- The plan panel replaces/restores the right rail and does not leak Space/Escape shortcuts.
- Import/export disabled state is clear outside Tauri.
- Drag previews, drops, cancellation, keyboard moves, empty quadrants, and rejected deadline cross-drops are covered.
- Subtask allocation creates a Today block carrying both IDs and navigates only after success.
- Archive renders tasks even with zero day records.
- Repeat icon and accessible label match all three modes.

### Required gates

Run locally using the direct binaries documented in `README.md`:

```bash
./node_modules/.bin/oxlint
./node_modules/.bin/tsc -b
./node_modules/.bin/tsc -p tsconfig.test.json
./node_modules/.bin/vitest run
node scripts/check-css-classes.mjs
./node_modules/.bin/vite build
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
```

Also run a real Tauri desktop smoke test covering database upgrade, plan save on window close, Markdown import/export, audio queue advancement, and at least one drag operation.

## 14. Internal implementation order for the single change set

This is dependency order, not a release sequence:

1. Add and verify migration `0005`.
2. Update types, row mappers, and repositories.
3. Add pure ordering, estimate, Markdown, and player-routing helpers with tests.
4. Update stores and atomic persistence contracts.
5. Build plan panel and safe-save/window-close handling.
6. Build subtasks and shared Today scheduling.
7. Add drag interactions to Today, template blocks, subtasks, and week rows.
8. Integrate archived tasks and plans into ArchiveView.
9. Replace repeat/loop behavior and update MusicBar/Library UI.
10. Complete render tests, Tauri smoke tests, CSS, and all project gates.

No intermediate step is considered shippable. The release is complete only when every acceptance criterion above passes.
