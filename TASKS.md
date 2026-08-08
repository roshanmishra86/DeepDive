# Deep Work — Implementation Plan & Task List

Desktop app (Windows + Linux) built with Tauri v2, ported from the Claude Design mockup
`Deep Work.dc.html` (project `9f967962-9aed-45d6-8c9e-7495e0b0ad9f`).

---

## 0. What the mockup actually is

Read before implementing. The source is a **static mockup**, not an app:

- Fixed `1440px × 840px` canvas with `min-width:1440px`. Not responsive.
- Archive data (Feb 2026), week tasks, template blocks, and the sound library are **hardcoded literals**.
- Timeline block heights are literal pixels (`48px`, `96px`, `144px`, `34px`), not derived.
- Real logic present: view switching, importance/urgency tag toggles, a `setInterval` countdown,
  archive day selection, and an `<input type="file">` + `URL.createObjectURL` audio player.
- Nothing persists. Reloading resets everything.

**Consequence:** this is a rewrite that preserves the visual design, not a file conversion.
The mockup is the source of truth for *layout, palette, typography, spacing* — nothing else.

### Derived rules extracted from the mockup

| Rule | Value |
| --- | --- |
| Timeline block height | `max(34, duration_minutes * 1.6)` px — matches 30→48, 60→96, 90→144, 5→34 |
| Sidebar width | 212px (fixed) |
| Right rail width | 318px (fixed) |
| Title bar height | 40px |
| Music bar height | 66px |
| Pomodoro ring | r=86, circumference 540.35; session overlay r=132, circumference 829.4 |
| Default timer | 1500s focus / 300s rest, 3 pomodoros per block |

### Design tokens (extracted palette)

```
--accent            #2f5d50   (user-selectable: #2f5d50 #3b4a7a #8a4a2c #3f3a33)
--accent-hover      #264a40
--accent-surface    #eef2f0
--bg-app            #e2ded6
--bg-window         #f7f5f1
--bg-chrome         #efece5
--bg-panel          #f2efe8
--bg-card           #fbfaf7
--border            #e0d9ca
--border-strong     #d8d1c2
--border-subtle     #ece6da
--text              #221f19
--text-muted        #8b8375
--text-faint        #a09889
--warn              #b8862f
--danger            #a84a30
--close             #c8493b
fonts: Newsreader (serif display), IBM Plex Sans (UI), IBM Plex Mono (numerals/time)
```

---

## 1. Architecture decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Shell | **Tauri v2** | Required by user. |
| Frontend | **React 19.2 + TypeScript 6 + Vite 8** | Mockup logic is already a React class component; ports directly. (Plan originally said React 18; the current Vite template ships 19 — kept, not downgraded.) |
| Styling | **Plain CSS + custom properties** (no Tailwind) | Mockup is inline-style driven; tokens map 1:1. Tailwind would add a translation layer for zero gain. |
| State | **Zustand** | Timer, player, and active view are cross-view global state; Context+reducer would need 3 providers. |
| Persistence | **SQLite via `tauri-plugin-sql`** (bundled sqlx) | Archive, streaks, completion %, and deep-hours rollups are aggregate queries. A JSON store would force full-file reads and in-JS aggregation. |
| Windows installer | **NSIS `.exe`**, MSI disabled | Smaller artifact than WiX MSI, per-user install without admin, cleaner WebView2 bootstrap. Answers "whichever is lightweight". |
| Linux artifacts | **`.deb` + `.AppImage`** (RPM off) | deb for Debian/Ubuntu; AppImage for everything else. |
| CI Linux runner | **`ubuntu-22.04`**, not `ubuntu-latest` | 24.04 links glibc 2.39; the AppImage would refuse to start on older distros. 22.04 gives glibc 2.35. |
| Package manager | **pnpm** | User requirement. Lockfile is `pnpm-lock.yaml`; CI uses `pnpm/action-setup@v4` before `setup-node` with `cache: 'pnpm'`. |
| Fonts | **Bundled via `@fontsource`** | Mockup loads Google Fonts over CDN. An offline desktop app must not. |
| Window chrome | **`decorations: false`** + custom title bar | The design draws its own Windows-style title bar with minimize/maximize/close. |
| Audio source | **`tauri-plugin-dialog` + `convertFileSrc()`** on an absolute path | Mockup uses `URL.createObjectURL`, which dies on restart. Storing the path lets the library survive relaunch. Requires `assetProtocol` scope in capabilities. |

### Deviations from the mockup (deliberate)

- Layout becomes fluid; fixed `1440px` is replaced by a min window size of `1100×720`.
- The library's five hardcoded tracks become an empty state until the user adds files.
- The Feb 2026 archive becomes real recorded history; a fresh install shows an empty calendar.

---

## 2. Data model (SQLite)

```
task(id, title, notes, important INT, urgent INT, due_at TEXT NULL,
     estimate_min INT NULL, done INT, created_at TEXT, archived INT)

day_block(id, day TEXT, task_id INT NULL, title, kind TEXT,       -- deep|shallow|ritual|break
          start_min INT, duration_min INT, pomodoros INT,
          completed INT, sort INT)

template(id, name, start_min INT, weekdays INT)                   -- 7-bit mask, Mon = bit 0
template_block(id, template_id, title, kind, start_min, duration_min, pomodoros, sort)

ritual(id, title, active INT, sort INT)
ritual_log(day TEXT, ritual_id INT, done INT)

pomodoro_session(id, block_id INT NULL, started_at, ended_at NULL, phase TEXT, completed INT)

day_note(day TEXT PRIMARY KEY, note TEXT)                          -- shut-down note
distraction(id, day TEXT, text TEXT, created_at TEXT, resolved INT)

track(id, path TEXT UNIQUE, display_name, category TEXT, duration_sec INT NULL)
setting(key TEXT PRIMARY KEY, value TEXT)                          -- accent, timerStyle, repeatStyle, volume, fades
```

Derived (SQL aggregates, no stored duplicates): deep hours per week, completion %,
day streak, 12-week deep-hours histogram, per-day archive status (`full`/`part`/`miss`).

---

## 3. Task list

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

### Phase 0 — Toolchain & repo *(owner: main session)*
- [x] Verify Linux Tauri deps (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `build-essential`, `pkg-config`, `libssl-dev`) — all present
- [x] Verify WSLg present (`/mnt/wslg`, `DISPLAY=:0`) so the app can be run and screenshotted locally
- [x] Install Rust stable toolchain — `rustc 1.97.1` / `cargo 1.97.1` via rustup, minimal profile
- [x] Confirm Node 24 available; install **pnpm 11.18.0** globally (project uses pnpm, not npm)
- [x] Extract design tokens, layout metrics, and the block-height rule from the mockup

### Phase 1 — Tauri scaffold + CI *(owner: Haiku sub-agent, verified by main session)*
- [x] `pnpm create vite` → React + TypeScript in repo root, source in `src/`; `pnpm-lock.yaml` present, no `package-lock.json`
- [x] Add Tauri v2 (`src-tauri/`), `productName: "Deep Work"`, identifier `com.roshanmishra.deepwork` — Tauri CLI 2.11.4, tauri crate 2.11.5
- [x] `tauri.conf.json`: window 1440×900, min 1100×720, `decorations: false`, `resizable: true`
- [x] Bundle targets: `nsis` (Windows), `deb` + `appimage` (Linux); MSI and RPM off
- [x] Windows `webviewInstallMode: downloadBootstrapper` + NSIS `installMode: currentUser`
- [x] Install plugins: `sql` (sqlite), `dialog`, `fs`, `opener` — all four registered in `lib.rs`
- [x] Capabilities file granting sql/dialog/fs/opener + window controls; `assetProtocol` scope `["**"]` and a media-src CSP for audio
- [x] Add `@fontsource-variable/newsreader`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`
- [x] `src/styles/tokens.css` with the palette above; imported in `main.tsx`
- [x] Placeholder app icons (`src-tauri/icons/`) generated from a solid `#2f5d50` square
- [x] `.gitignore` covering `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`
- [x] `.github/workflows/build.yml` — **on push/PR to `main` or `release`, plus `workflow_dispatch`**: matrix (`windows-latest` → NSIS exe, `ubuntu-22.04` → deb + AppImage) via `tauri-apps/tauri-action`; uploads installers as workflow artifacts (30-day retention). This is the primary "push and get a Windows build" path.
- [x] `.github/workflows/release.yml` — on tag `v*` **only**: same matrix, publishes a draft GitHub Release with the installers attached. Deliberately *not* branch-triggered — `tauri-action` publishes whenever `tagName` is set, so a branch push would cut a release named after the branch.
- [x] `.github/workflows/ci.yml` — on push/PR to `main` or `release`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `cargo fmt --check`, `cargo clippy -D warnings`
- [x] Rust cache (`Swatinem/rust-cache`) + pnpm store cache in all workflows; `pnpm/action-setup@v4` runs **before** `setup-node`, version resolved from the `packageManager` field
- [x] `README.md` with dev/build/release instructions

#### Defects found in verification and fixed
- [x] **`--font-display` never matched a loaded face.** `@fontsource-variable/newsreader` registers the family as `Newsreader Variable`, not `Newsreader`, so every headline silently fell back to generic serif. Fixed, with real fallback stacks on all three font tokens.
- [x] **`package.json` name was `dwscaffold`** (leftover temp scaffold dir) → `deep-work`.
- [x] **CI pinned pnpm 10 while local is 11.18.0.** Replaced the hardcoded `version:` input in all three workflows with an authoritative `packageManager: "pnpm@11.18.0"` field.
- [x] **Removed an unrequested `pnpm-workspace.yaml`** containing an unverified `allowBuilds` key. Proven unnecessary: `pnpm install` and `pnpm build` are clean without it, with no ignored-build-script warning. (Note: pnpm silently ignores unknown keys in that file, so "no warning" is never evidence a key is valid.)
  - **Reopened in Phase 2:** the file was back, again with the `allowBuilds` key, and was rewritten to `ignoredBuiltDependencies: [esbuild]`.
  - **Both of the above verdicts were wrong — corrected in Phase 3.** `allowBuilds` *is* a valid pnpm 11 key and `ignoredBuiltDependencies` is *not*. Verified against pnpm 11.18.0's own bundle (`dist/pnpm.mjs`): `allowBuilds` occurs 87 times, including in `MIGRATED_PNPM_FIELD_KEYS` and `createAllowBuildFunction()`, which reads it as `Record<string, boolean>`; `ignoredBuiltDependencies` occurs **0 times** — it was a pnpm 10 key removed in 11. So the Phase 2 "fix" replaced a working key with a dead one, and the file has been a silent no-op ever since. Empirically confirmed: with `ignoredBuiltDependencies` alone, `pnpm install` still emits `ERR_PNPM_IGNORED_BUILDS`; with `allowBuilds: {esbuild: false}` it is clean. Correct content is now:
    ```yaml
    allowBuilds:
      esbuild: false
    ```
    The *original* warning still stands and is in fact what hid this: pnpm silently ignores unknown keys here, so "no error" never proves a key is live. Check the key against the installed pnpm's source, not against whether the command succeeds.
- [x] **clippy was declared passing without being run.** Component installed locally; `cargo clippy --all-targets -- -D warnings` verified clean.

**Phase 1 acceptance — MET (independently verified, not taken on the sub-agent's report):**

| Check | Result |
| --- | --- |
| `cargo check` | pass |
| `cargo clippy --all-targets -- -D warnings` | pass |
| `cargo fmt --all -- --check` | pass |
| `pnpm build` | pass |
| `pnpm exec tsc --noEmit` | clean |
| `pnpm install --frozen-lockfile` | pass |
| 3 workflow YAML files parse | pass |
| `pnpm tauri dev` launches on WSLg | pass — process healthy for 24 min, 186 MB RSS, Vite dev server HTTP 200, no panics |

Note: WSLg emits `libEGL`/`MESA ZINK`/`gdk_seat_get_keyboard` warnings on startup. These are
software-rendering noise from the WSL GPU passthrough, not app faults, and do not appear on
native Linux or Windows. No screenshot was captured — no screenshot tool is installed and
`sudo` requires a password in this environment.

### Phase 2 — App chrome *(owner: Haiku sub-agents, verified by Sonnet + main session)*
- [x] Custom title bar: drag region, app dot, date, minimize/maximize/close wired to the window API
- [x] Sidebar: nav (Today / This Week / Day Templates / Archive / Sound Library), today's ritual checklist, deep-hours-this-week card
- [x] Right rail: pomodoro widget, "Upcoming this week", distraction log
- [x] Music bar (66px footer)
- [x] Router/view switching + active-nav highlighting
- [x] Settings: accent picker, timer style (`ring`/`numeric`/`bar`), repeat badge style (`chip`/`icon`/`none`)
- [x] `src/styles/chrome.css` — the full chrome stylesheet (~114 classes) driven entirely by the tokens
- [x] Placeholder views for Today / Week / Templates / Archive / Library via `ViewPlaceholder`
- [x] Phosphor icons (`@phosphor-icons/react`) replace all hand-rolled inline SVGs, via per-icon deep imports
- [x] Vitest test layer (`node` environment, isolation on); 111 unit tests over `lib/` and `stores/`, ~12s. jsdom and `@testing-library/*` stay installed for the component tests that arrive with Phase 4; those files opt in per-file with `// @vitest-environment jsdom`.

#### Notes on what is real vs. placeholder
Phase 2 is chrome only. These render with hardcoded data and become real in later phases:
the deep-hours figure and 7-bar histogram (Phase 3), "Upcoming this week" (Phase 5),
the distraction log (local component state, not persisted), and the ritual checklist
(in-memory, seeded from the mockup). Window controls are guarded by `isTauri()` and no-op
under plain `vite dev`. Settings live in the app store until Phase 3 persists them.

#### Defects found in verification and fixed
- [x] **`.ritual-check` done/not-done states were inverted, and hardcoded the accent.** Incomplete rituals rendered as filled accent circles; completed ones as grey circles with a white tick on grey. The literal `#2f5d50` also meant the checkbox ignored the accent picker. Corrected against the mockup: not-done = unfilled with a `#cfc7b8` border, done = `var(--accent)` fill.
- [x] **`pnpm build` was broken while `pnpm exec tsc --noEmit` passed.** `tsconfig.app.json` included `src/**`, so the production `tsc -b` type-checked test files and failed on 8 `TS6133` unused bindings. Tests are now excluded from `tsconfig.app.json` and type-checked by a separate `tsconfig.test.json` via `pnpm typecheck`. **`tsc --noEmit` is not a proxy for `pnpm build`** — CI now runs the real build.
- [x] **`isolate: false` in `vitest.config.ts` was masking nondeterministic test loss.** With isolation on, a forked worker timed out and one test file silently never ran (111 → 97 → 87 tests across three runs). Root cause was jsdom environment startup on the slow `/mnt/c` WSL2 filesystem — `tests 152ms` against `environment 113s`. No current test needs a DOM, so the suite runs on the `node` environment with isolation restored.
- [x] **Dead Tauri mock in test setup.** `vi.mock('@tauri-apps/api', …)` never applied — the only real import is `@tauri-apps/api/window`, a different specifier. Removed.
- [x] **Accent-independent hexes.** Swept every literal in `chrome.css`; token-backed ones replaced with `var(--…)`, and a `--on-accent` token added for text on accent backgrounds. The session overlay keeps literals by design (fixed dark theme, no tokens).

#### Known issue, deliberately not fixed in Phase 2
- [ ] **`--text-muted` (#8b8375) and `--text-faint` (#a09889) fail WCAG AA** for body text: 3.26–3.59:1 and 2.49–2.74:1 respectively against the panel backgrounds, versus the 4.5:1 threshold. These values come straight from the mockup palette, so this is a design-token decision affecting every view including unbuilt ones. Resolve before the Phase 10 QA pass, not piecemeal.

**Phase 2 acceptance — MET (independently verified, not taken on the sub-agents' reports):**

| Check | Result |
| --- | --- |
| `pnpm build` | pass — 272 KB JS / 27.8 KB CSS (gzip 81.6 / 5.0) |
| `pnpm test` | pass — 111 tests, 5 files |
| `pnpm typecheck` | pass (`tsc -b` + `tsc -p tsconfig.test.json`) |
| `pnpm lint` | clean, zero warnings |
| `cargo fmt --all -- --check` | pass |
| `cargo clippy --all-targets -- -D warnings` | pass |
| `pnpm install --frozen-lockfile` | pass |
| All ~114 chrome classes present in the built CSS | pass |
| Only remaining `#2f5d50` in the bundle is the token definition | pass — 31 `var(--accent)` uses |
| `pnpm tauri dev` launches on WSLg | pass — 8m23s uptime, 186 MB RSS, 0 panics, Vite HTTP 200 |

Note: WSLg still emits the `libEGL` / `MESA ZINK` / `gdk_seat_get_keyboard` warnings recorded in
Phase 1. Same software-rendering noise, not app faults.

### Phase 3 — Persistence layer *(owner: Haiku sub-agents, verified by Sonnet + main session)*
- [x] SQLite migrations for the schema in §2 — `src-tauri/migrations/0001_init.sql` (11 tables, CHECK constraints on `kind`/`phase`, FK cascades, 9 indexes), registered in `lib.rs` via `add_migrations("sqlite:deepwork.db", …)` with `include_str!`
- [x] SQL layer for tasks, blocks, templates, rituals, sessions, notes, archive, tracks, settings — 9 repositories under `src/db/repos/`
- [x] Typed TS client wrapper over the SQL calls — `SqlDriver` interface + `TauriDriver`; `openDatabase()` returns `null` outside Tauri so `vite dev` still runs
- [x] Seed defaults on first run (3 rituals, one "Maker Day" template with its 5 mockup blocks, 7 settings) — `0002_seed.sql`
- [x] Wiring deferred to this phase by the Phase 2 notes: settings and the ritual checklist now persist; the sidebar's deep-hours figure and 7-bar histogram are computed from `day_block` (a fresh DB correctly shows `0 h` and empty bars)
- [x] Local-date helpers in `src/lib/time.ts` (`toDayKey`, `fromDayKey`, `addDays`, `startOfWeek`, `minutesToClock`, `formatDuration`, `splitDeepHours`)

#### Deliberate reading of "Rust commands / SQL layer"
The SQL layer is **TypeScript over `tauri-plugin-sql`; Rust owns migrations only.** The plugin
already registers `execute`/`select` as Tauri commands, so hand-written `#[tauri::command]`
wrappers would add a second serialization hop and a second place for the schema to drift,
for no gain. This follows the plugin choice already made in §1.

All statements use **`?` positional placeholders**, not the `$1` form the plugin docs show.
`?` is SQLite's native placeholder and is the only style that behaves identically under sqlx
(production) and `node:sqlite` (tests) — which is what lets the tests exercise the real SQL.

#### Testing approach
Tests run the **real** `src-tauri/migrations/*.sql` files against an in-memory database via
Node 24's built-in `node:sqlite` (`src/test/nodeDriver.ts`), so they verify the schema that
actually ships — real CHECK constraints, real FK cascades, real aggregate SQL — rather than a
TS re-declaration of it. No new dependencies. The driver lives under `src/test/`, which
`tsconfig.app.json` already excludes, so `node:sqlite` never reaches the vite build.

#### Defects found in verification and fixed
- [x] **`sql:default` does not grant write access.** Per `tauri-plugin-sql-2.4.0/permissions/default.toml` it is only `["allow-close", "allow-load", "allow-select"]`. The capability file granted just `sql:default`, so every INSERT/UPDATE/DELETE would have failed at runtime — a live defect carried in since Phase 1. Added `sql:allow-execute`.
- [x] **The day-streak query was wrong and a tautological test hid it.** The recursive CTE seeded one anchor row per *distinct day present in `day_block`* and expanded each, producing a duplicate-counting fan-out; it also never walked back from today stopping at the first break. Probed directly: a 3-day streak returned **6**. The only test asserted `expect(typeof stats.dayStreak).toBe('number')`, which cannot fail. Replaced with `SELECT DISTINCT day … WHERE completed = 1` plus a short backward walk in TS — O(streak) and reviewable at a glance.
- [x] **UTC day-keys where local dates are required.** `new Date().toISOString().split('T')[0]` in four places in `archive.ts` computed the wrong calendar day for any user behind/ahead of UTC near midnight. `headlineStats` now takes the day as an explicit parameter instead of reading the clock. **Regressed once** into `stores/rituals.ts` after being fixed, and was caught again on review — `toISOString` is legitimate only for `created_at`/`started_at` *instants*, never for a day key.
- [x] **"Deep minutes" meant two different things.** `dayRecord` summed deep blocks regardless of `completed`, while the sidebar and 12-week histogram required `completed = 1`. Unified on completed-only.
- [x] **`dayTotals.completedCount` returned SQL `NULL` on an empty day** instead of `0` — missing `COALESCE`. Found by an adversarial empty-input test, not by any happy-path test.
- [x] **The rituals store invented its own ids.** `add()` assigned a local `nextId++` while `addRitual()` returned the real autoincrement id; the two counters diverge, and `toggle()` then wrote `ritual_log.ritual_id` = the local id — a column declared `NOT NULL REFERENCES ritual(id)`, so the write would either violate the FK or land on a different ritual's row. Now uses the id returned by the database.
- [x] **`hydrate(driver, day)` discarded its `day`**, so `toggle` recomputed "today" independently and could write to a day the checklist was not displaying. The hydrated day is now retained.
- [x] **The deep-hours figure could be a full hour off.** Integer and fractional parts were rounded independently: at 1138 minutes `Math.floor` gave `18` while `(0.966).toFixed(1)` gave `"1.0"`, rendering "18.0 h" for 19.0. Now rounds once via `splitDeepHours` and splits that single value.
- [x] **A failed database connection was memoised forever.** `openDatabase()` cached the rejected promise, so the app could never retry. Resets on error.
- [x] **Untyped rows.** `select<any>` / `(row: any)` in `archive.ts` replaced with a declared row interface, matching every other repo.

#### Note on `pnpm-workspace.yaml`
Corrected in this phase — see the Phase 1 defect entry above. `allowBuilds` is the valid
pnpm 11 key; `ignoredBuiltDependencies` does not exist in pnpm 11 and had been a silent
no-op since Phase 2.

### Phase 4 — Today view *(owner: Haiku sub-agent, verified by Sonnet + main session)*
- [x] Proportional timeline (gutter times + `max(34, min*1.6)` block heights) — gutter and block column render from one `layout()` row list so they cannot drift apart
- [x] Block states: completed (struck through), active/in-session, break (dashed), planned
- [x] Header summary: planned total, deep total, end time — computed via `daySummary()`
- [x] New block / edit block / delete / reorder
- [x] Apply template to today — behind a confirm step, since it deletes the day's existing blocks
- [x] Complete-block toggle
- [x] **Beyond the checklist:** ±5 min nudge per block, per-block ripple toggle, and visible overlap conflicts (see the model note below)

#### The timeline model — gaps are first-class *(corrected mid-phase)*
The first implementation pass was built on a **contiguity model**: `startMin` derived from a
single per-day anchor plus the running sum of durations, with a `repack()` after every mutation.
**That was wrong and was thrown out.** It was over-generalised from the mockup, whose day happens
to be exactly contiguous (5:30+90=7:00, 7:00+30=7:30, …) — one data point, not a rule. It also
discarded information the schema already stores, since `day_block.start_min` is an absolute
per-block value, making the model *further* from the data model than the naive reading. Above all
it made a buffer impossible to express, which is a real requirement: the user needs to slip a
5–10 minute gap in when a task demands it or when a block finishes early.

The shipped model instead treats gaps as first-class:

| Concept | Rule |
| --- | --- |
| `startMin` | Absolute per block, persisted as-is. Never derived. |
| Gap before a block | `block.startMin - (prev.startMin + prev.durationMin)` |
| Positive gap | Buffer — rendered as proportional whitespace (`max(8, gapMin * 1.6)` px) in both the gutter and the block column |
| Zero gap | Contiguous — what a template naturally produces. A *default*, not a constraint. |
| Negative gap | Overlap — surfaced as a visible `role="alert"` badge plus a day-level notice. **Never silently auto-corrected.** |
| Ripple | Editing a start/duration shifts all later blocks by the same delta, preserving their gaps. On by default (the "I ran over / I finished early" case), toggleable per block. |
| Nudge | ±5 min buttons on every block, honouring the ripple toggle. The primary way a buffer gets inserted. |

`sortBlocks()` (by `startMin`, tie-broken by `sort`) is the **single** canonical ordering. The
timeline layout, conflict detection, day summary, the store's in-memory array, and the up/down
reorder controls all call it. Three independent copies of that sort were the root cause of the
worst defect below.

#### Defects found in verification and fixed
Every one of these was found by independent inspection **after** the implementing sub-agent
reported all six checklist items complete and all four gate commands passing. The gates really
did pass; they simply could not see any of this.
- [x] **The ±5 min nudge buttons were never rendered.** `nudge()` in `lib/today.ts` and
  `nudgeBlock()` in `stores/today.ts` were both written and unit-tested, but no component ever
  called them — pure dead code. This was *the* explicitly requested feature. The sub-agent's own
  report described it as "±5 min affordance ready in CSS, logic in store", which reads as done and
  is not. **Logic plus tests plus CSS is not a feature until something renders a button.**
- [x] **`conflicts()` was dead code too.** Overlaps were computed and tested, never displayed.
- [x] **Latent id collision.** The store minted optimistic ids from `let nextId = 1000` and then
  swapped in the real row id by matching `b.id === localId`. SQLite `AUTOINCREMENT` ids are
  positive and monotonic, so on a busy enough database a real id reaches 1000+ and the match lands
  on the wrong block. This is the Phase 3 "rituals store invented its own ids" defect wearing a
  different hat. Now uses negative, decrementing local ids, so collision with a positive SQLite id
  is structurally impossible rather than merely unlikely.
- [x] **Three different orderings for one list.** `layout()` sorted by `(startMin, sort)`,
  `TimelineBlock` took its index from the **unsorted** store array via `findIndex`, and
  `moveBlock()` computed gap-to-predecessor in whatever array order it was handed. Whenever those
  diverged the up/down buttons moved the wrong block and gaps were measured against the wrong
  neighbour. Fixed by making `sortBlocks()` the one canonical order everywhere. A second instance
  of the same bug class surfaced during the fix: `move()` and `nudgeBlock()` decided *which rows
  to persist* with `blocks.filter((b, i) => b.startMin !== state.blocks[i].startMin)` — a
  positional comparison between two arrays that need not share an order. Now matched by id.
- [x] **`move()` persisted a `sort` sequence it did not apply in memory.** It wrote a fresh
  `0..n-1` order through `reorderBlocks()` while the in-memory objects kept their stale pre-move
  `sort` values. Because `sortBlocks()` uses `sort` as its tie-breaker for equal `startMin`, this
  was a live memory/database divergence: a reload would silently reorder the day out from under
  the user. **Found only by the hydrate-round-trip test**, which did not exist until it was
  specifically asked for — every other store test asserted in-memory state alone and passed
  throughout.
- [x] **`moveBlock()` could push the whole day later.** Whichever block landed at index 0 kept its
  own prior `startMin`, so promoting a later block to the front moved the day's start time. Now
  anchored on the day's original first `startMin`.
- [x] **Store tests were order-dependent.** `beforeEach` reset the SQLite driver but not the
  Zustand singleton, so tests silently relied on execution order. Reset added (merge `setState`,
  not `replace: true`, which would drop the store's actions).
- [x] **`#fff` literal reintroduced into `chrome.css`** (`.btn-icon.btn-danger:hover`), regressing
  the Phase 2 token sweep. Now `var(--on-accent)`.
- [x] **Ten identical accessible names.** Every block rendered `aria-label="Move up"` / `"Edit"` /
  `"Delete"`, so a screen-reader user heard the same button ten times. All now include the block
  title, which the completion checkbox had been doing correctly all along.
- [x] **Modals were not really modal.** `BlockEditor`'s Escape handler was bound to the title
  `<input>`'s `onKeyDown`, so Escape did nothing from any other field, and Tab walked focus out
  behind the dialog. `ApplyTemplateMenu` had neither. Both now `role="dialog"` + `aria-modal`,
  with Escape from anywhere and a real focus trap.

#### Note on test coverage — the recurring lesson
Store tests initially numbered 15 with only **2** reading rows back out of SQLite; the rest
asserted in-memory Zustand state alone. Since every defect class this project has hit in Phases 3
and 4 has been memory/database drift, that is precisely the blind spot that matters here, and the
`node:sqlite` driver built in Phase 3 exists to cover it. Read-backs are now at 10, plus a
hydrate-round-trip test. **Adding them immediately exposed the `move()`/`sort` divergence above.**
The regression test was confirmed genuine by reverting the one-line fix and watching it fail
(`1 failed | 303 passed`) — per the Phase 3 lesson that an assertion never observed failing is not
yet known to be capable of failing.

**Phase 4 acceptance — MET (independently verified, not taken on the sub-agents' reports):**

| Check | Result |
| --- | --- |
| `pnpm lint` | clean, zero warnings |
| `pnpm typecheck` | pass (`tsc -b` + `tsc -p tsconfig.test.json`) |
| `pnpm test` ×3 | 304 tests, 17 files — identical counts all three runs, ~16s |
| `pnpm build` | pass — 301.6 KB JS / 38.0 KB CSS (gzip 89.9 / 6.5) |
| `cargo fmt --all -- --check` | pass |
| `cargo clippy --all-targets -- -D warnings` | pass |
| New hex literals in `chrome.css` | zero |
| Block heights vs mockup literals | 5→34, 30→48, 60→96, 90→144 — exact |
| Regression test proven able to fail | pass — fix reverted, suite went red, fix restored |
| `pnpm tauri dev` launches on WSLg | pass — app process healthy, 185 MB RSS, Vite HTTP 200, 0 panics, 0 Rust errors |

Note: the WSLg `libEGL` / `MESA ZINK` / `gdk_seat_get_keyboard` warnings from Phases 1–2 persist.
Same software-rendering noise, not app faults. Also note that a cold `pnpm tauri dev` on this
`/mnt/c` 9p mount spends several minutes linking a ~297 MB debug binary — two verification runs
were killed by their own timeouts mid-link before the binary was pre-built with `cargo build`.
That is environment slowness, not a fault.

### Phase 5 — This Week view *(owner: Haiku sub-agent, fixes by Sonnet, verified by Sonnet + main session)*
- [x] Task list grouped by Eisenhower matrix (4 quadrants) — `groupByMatrix()` over `quadrantOf()`
- [x] Alternate grouping by deadline (48h / later this week / no deadline) — plus a 4th bucket, see below
- [x] Important + Urgent tag toggles persisting to DB — per-row chips writing through `updateTask`
- [x] "Plan today" → creates a block from the task, linking `day_block.task_id`
- [x] Add / edit / complete / delete task — `TaskEditor` modal + per-row controls
- [x] **Beyond the checklist:** the right rail's "Upcoming this week" placeholder is now real data

#### Deliberate deviation — a fourth deadline bucket
The checklist names three buckets (48h / later this week / no deadline), but `due_at` is an
arbitrary instant, so a task due in three weeks has no honest home among them. Filing it under
"Later this week" would be a false label. A fourth bucket, **"Beyond this week"**, is rendered
only when non-empty. Empty groups are skipped in both groupings.

#### `due_at` is an instant, not a day key
`day` columns stay local `YYYY-MM-DD` via `toDayKey` (the Phase 3 rule). `task.due_at` is a
different kind of value — a point in time with a time-of-day — and is stored as a full ISO
instant. The conversion in both directions lives in **one** place, `composeDueAt()` /
`decomposeDueAt()` in `lib/week.ts`, which `TaskEditor` and the tests both call. That is
deliberate: the worst defect in this phase was the serializer and the parser being written
against two different assumed shapes, and a shared helper makes that divergence unrepresentable.

#### Defects found in verification and fixed
As in Phase 4, every one of these was found by independent inspection **after** the implementing
sub-agent reported all five checklist items complete with all four gate commands passing. The
gates did pass — 371 tests green — and could not see any of this.
- [x] **The deadline grouping was entirely non-functional.** `TaskEditor` wrote `due_at` as a full
  ISO instant (`2026-08-06T17:00:00.000Z`) while `deadlineBucket()` and `formatDueLabel()` parsed
  it with `dueAt.split('-').map(Number)` — which yields `["2026","08","06T17:00:00.000Z"]`, so
  `Number()` on the third element is `NaN` and the resulting `Date` is `Invalid`. Every comparison
  against an Invalid Date is `false`, so **every dated task fell through to the last bucket**: the
  two buckets the checklist actually names could never contain a task. The same parse rendered the
  literal string **`due NaN undefined`** on screen — visible immediately to anyone who set a due
  date. Fixed by parsing with `new Date()`, reading local getters, explicitly guarding
  `Number.isNaN(d.getTime())`, and routing both directions through `composeDueAt`/`decomposeDueAt`.
- [x] **The root cause was in the tests, not the code.** All **22** `dueAt` fixtures in
  `week.test.ts` were hand-written day-keys (`'2026-08-05'`) — *the one shape the application never
  writes*. The suite validated a format that existed only inside the suite. Every date fixture now
  goes through `composeDueAt()`, the same helper the editor uses, so a fixture cannot drift from
  production shape again. **Confirmed genuine by reverting the parser and watching the suite go red
  (8 failed | 372 passed), then restoring it** — per the Phase 3 lesson that an assertion never
  observed failing is not yet known to be capable of failing.
- [x] **Local wall-clock time stamped as UTC.** `` `${date}T${time}:00.000Z` `` asserts that a
  value taken from `<input type="date">`/`<input type="time">` — which are local — is UTC, so every
  due instant was wrong by the user's offset. Invisible in this environment, which runs at
  GMT+0000. `composeDueAt` now builds a local `Date` and calls `.toISOString()`.
- [x] **Three implementations of duration formatting.** `lib/time.ts` already exported
  `formatDuration`; `lib/week.ts` re-implemented it verbatim; `RightRail` hand-rolled a third that
  rendered a 30-minute estimate as `≈0h 30m` and a bare `0` for a zero estimate. This is the Phase 4
  "three different orderings for one list" defect in a new costume. One implementation now, imported.
- [x] **`App.tsx` never hydrated the today store**, despite it being specified and reported done.
  `addBlock` returns early while `day` is `null`, so "Plan today" would have created no block and
  raised no error. It appeared to work only because `view` defaults to `'today'`, so `TodayView`
  mounted first and hydrated as a side effect — an implicit coupling that any future change to the
  default view would have broken silently.
- [x] **Escape was bound per-input, not to the dialog.** `TaskEditor` attached its key handler to
  five inputs but not to the two checkboxes or any of the three buttons, and the container handled
  only Tab. Escape did nothing from a checkbox or a button. This is the Phase 4 "modals were not
  really modal" defect repeating. Escape and Cmd/Ctrl+Enter now live on the dialog container
  alongside the focus trap.
- [x] **`let groups: any[]`** in `WeekView`, regressing the Phase 3 untyped-rows fix on the single
  most important derived value in the view. Replaced with two separately-typed branches, no casts.
- [x] **`now` was frozen at mount** (`useState(() => new Date())`), so deadline buckets and due
  labels never re-evaluated while the window stayed open — across midnight, and across the 48h
  boundary, tasks sat in the wrong bucket indefinitely. Now refreshed on a 60s interval, matching
  `TodayView`'s `nowMin`.
- [x] **Controls changed identity between groupings.** `TaskRow` hid the Important/Urgent chips and
  "Plan today" for drop-quadrant rows, but `isDrop` is only set in the matrix grouping — so the same
  task showed different controls depending on the active grouping, and an untagged task could not be
  planned or re-tagged from its row at all. The checklist puts no quadrant carve-out on either
  feature. All rows now render all controls; the de-emphasised dashed styling stays.
- [x] **Barrel icon imports** (`from '@phosphor-icons/react'`) in two files, against the Phase 2
  per-icon deep-import convention. Switched to deep imports. **Note the convention's stated rationale
  did not reproduce:** rebuilding both ways gave a byte-identical bundle, because rolldown-vite
  tree-shakes the barrel. The 301.6 → 323.7 KB growth is the Phase 5 code itself, not the import
  style. The convention is kept for consistency, but "barrel imports bloat the bundle" is not
  currently true of this toolchain and should not be repeated as a justification without measuring.

#### Known minor, deliberately not fixed
- [ ] `RightRail` calls `taskMeta()` twice per row (guard + render). Pure and cheap; not worth a
  round trip. Fold into the Phase 10 polish pass.

**Phase 5 acceptance — MET (independently verified, not taken on the sub-agents' reports):**

| Check | Result |
| --- | --- |
| `pnpm lint` | clean, zero warnings |
| `pnpm typecheck` | pass (`tsc -b` + `tsc -p tsconfig.test.json`) |
| `pnpm test` ×2 | 380 tests, 19 files — identical both runs, ~21s |
| `pnpm build` | pass — 323.7 KB JS / 43.2 KB CSS |
| `cargo fmt --all -- --check` | pass |
| `cargo clippy --all-targets -- -D warnings` | pass |
| New hex literals in `chrome.css` or components | zero |
| Editor-produced `due_at` → correct bucket + label | verified end-to-end by ad-hoc probe: `soon`/`week`/`later` correct, labels render `today, 5:00 PM` / `tomorrow, 5:00 PM` / `Fri` / `overdue`, never `NaN` |
| Regression test proven able to fail | pass — parser reverted, suite went red (8 failed), fix restored |
| Optimistic ids negative and decrementing | pass |
| Store read-backs from real SQLite + hydrate round-trip | pass |
| Accessible names include the task title | pass — checkbox, both chips, plan, edit, delete |

### Phase 5.5 — Today composer *(owner: Sonnet sub-agents, verified by main session)*
> **Superseded in part by Phase 5.6.** The inline-composer decision below was reversed: the
> composer is a modal again. Everything else in this section still holds. Kept as written because
> the reasoning and the defect list remain the record of how the scheduling model was arrived at.

- [x] ~~The `BlockEditor` modal is gone. Blocks are composed **inline on the timeline**, in the row
  the block will occupy — for creating *and* editing.~~ **Reversed in 5.6.** `BlockEditor.tsx` and
  the `.editor-*` CSS family are still deleted; the replacement modal is `BlockComposer.tsx` with a
  `.composer-*` family, not a revival of the old editor.
- [x] New blocks auto-schedule: the first block of a day starts at the **current minute**, and
  every later block lands in the **next free slot** — `nextFreeStart()`
- [x] A user-declared **shutdown time** bounds the day; a block that would cross it is refused and
  offered to the This Week list instead
- [x] Durations step in 30-minute Pomodoro units; times are typed free-form ("5pm", "17:30",
  "1h30") rather than dragged on a slider
- [x] Pomodoro count is derived from duration (`floor(duration / 30)`), offered as a dropdown
  defaulting to the maximum

#### Scheduling model
`nextFreeStart(blocks, fromMin, durationMin)` returns the earliest `t >= fromMin` whose
half-open interval `[t, t + durationMin)` intersects no existing block. Consequences:

| Case | Result |
| --- | --- |
| Empty day | `fromMin` **exact and unrounded** — 10:17 AM means 10:17 AM. The 30-minute grid governs *duration*, not clock alignment. |
| A block in progress | The new block starts when that block ends. |
| A run of back-to-back blocks | Skipped as a chain, not one block at a time. |
| A mid-day gap | Used only if the whole duration fits, so default placement never manufactures an overlap. |

The Phase 4 overlap model is untouched: a user can still *type* a colliding start time and get the
visible conflict badge. Auto-placement simply never creates one on its own.

The algorithm is **order-independent by construction** — it rescans from the top of the list after
every collision, so it returns the same answer for an unsorted input. The internal `sortBlocks()`
call is therefore defensive rather than load-bearing. This was confirmed by mutation, not assumed:
removing the sort leaves the whole suite green.

#### Shutdown time: global default, per-day override
`setting.shutdownMin` holds the default; `day_note.shutdown_min` (new, nullable, migration
`0003`) holds a per-day override that wins when present. The setting is deliberately **not
seeded** — its absence is the signal that the user has never been asked, which is what makes the
composer's one-time "When do you shut down today?" prompt fire exactly once ever.

`minDurationFor(kind)` floors deep/shallow at 30 minutes but break/ritual at 5, because the seeded
"Maker Day" template contains a 5-minute Shut Down Ritual that a blanket 30-minute floor would
make unrepresentable.

#### Defects found in verification and fixed
Both were found by independent inspection **after** the implementing sub-agent reported all items
complete with all gates passing. The gates did pass and could not see either.
- [x] **The draft-row sentinel id collided with real block ids.** The composer splices a synthetic
  `DayBlock` into `layout()`'s input so it lands in the right position in both the gutter and the
  block column. That draft used `id: -1` — but the store mints optimistic ids negatively *from -1
  downward*, and under `vite dev` (null driver) those negative ids are never swapped for SQLite
  ones, so `-1` is a live id there. Opening the composer would render it over an existing block's
  row. This is the Phase 4 "latent id collision" defect in a third costume. Now
  `DRAFT_BLOCK_ID = Number.MIN_SAFE_INTEGER`, which the store's decrementing counter cannot reach
  in any realistic session.
- [x] **"Plan today" would schedule at 12:00 AM.** `TaskRow` computed the prospective start with
  `nextFreeStart(blocks, 0, …)` and called `addBlock` without a `fromMin`, so on an empty day a
  planned task landed at midnight — a regression from the old hardcoded 5:00 AM. It already
  receives a refreshed `now` prop, which now drives both the check and the insert. The store still
  never reads the clock itself (the Phase 3 rule).

#### Note on the `fromMin` parameter
`addBlock` takes the current minute-of-day from its **caller** rather than calling `new Date()`.
A store reading the clock directly is what produced the Phase 3 UTC-day-key defect, and it also
makes the action untestable — the "lands exactly at `fromMin`" test uses 617 specifically to prove
there is no hidden rounding.

#### Note on proving a regression test can fail
Per the Phase 3 lesson, the new tests were checked by mutation. Two candidate mutations to
`nextFreeStart` (dropping the rescan, dropping the sort) left the suite **green** — correctly, as
both are redundant with each other, and a third (`<` → `<=` on the collision bound) turns the loop
infinite, which is its own proof that the strict bound is load-bearing. Failability was
demonstrated on `maxPomodoros` (`floor` → `ceil` ⇒ `1 failed | 68 passed`), then restored. Worth
recording: *a mutation that does not turn the suite red is not automatically a weak test* — it can
equally mean the mutated line was not load-bearing.

**Phase 5.5 acceptance — MET (independently verified, not taken on the sub-agents' reports):**

| Check | Result |
| --- | --- |
| `oxlint` | clean, zero warnings |
| `tsc -b` + `tsc -p tsconfig.test.json` | pass |
| `vitest run` | 437 tests, 19 files (395 before) |
| `vite build` | pass — 330.4 KB JS / 44.0 KB CSS (gzip 97.3 / 7.5) |
| `cargo fmt --all -- --check` | pass |
| `cargo clippy --all-targets -- -D warnings` | pass |
| New hex literals in `chrome.css` | zero |
| `.editor-*` rules remaining | zero — `.task-editor-*` and `.modal-*` are separate families, untouched |
| Dangling `BlockEditor` imports | zero |
| Regression test proven able to fail | pass — `maxPomodoros` mutated, suite went red, fix restored |
| Store read-backs from real SQLite | pass — `setShutdown` verified through `notesRepo`/`settingsRepo`, plus hydrate precedence |

#### Known, deliberately not fixed
- [ ] No component-level test covers the composer's render path, including the draft-id collision
  above — it was caught by inspection. The suite runs on the `node` environment because jsdom
  startup costs ~113s on this `/mnt/c` mount (Phase 2). Revisit with the Phase 10 QA pass rather
  than reintroducing jsdom for one file.
- [ ] Typing a below-minimum duration (e.g. `5` on a deep block) silently clamps to 30 while the
  text field still reads `5`. The stepper label shows the true value; the input does not
  re-render its raw text. Cosmetic.

### Phase 5.6 — Composer modal from the Claude Design source *(owner: Sonnet sub-agents, verified by main session)*

Implements `Deep Work.dc.html` (Claude Design project `Deepwork Desktop Application UI`), composer
at lines 809–908. The design is the source of truth for layout and type scale; the behaviour rules
from 5.5 win wherever the two disagree.

- [x] The composer is a **centred modal** over a scrim, opened by "+ New block" — reversing 5.5's
  inline-on-the-timeline decision. `TodayView` no longer splices a synthetic draft row into
  `layout()`; the `DRAFT_BLOCK_ID` sentinel and its collision hazard are gone with it.
- [x] Serif title input, one-line intent `note`, Start / Duration / Pomodoros row, Repeats + Sound
  row, tag row, mono summary footer
- [x] **Delete** action in edit mode — present in the design, absent from the 5.5 composer
- [x] Migration `0004` adds `note`, `repeat`, `track_id`, `quiet` to `day_block`

#### Why the reversal
The inline composer put an editing surface inside a row whose height encodes duration, so the form
had to be floored at 150px and the row it displaced no longer read as proportional. The modal
decouples form size from block duration. This is a UI-shape change only: auto-scheduling, the
shutdown gate, free-form time parsing and the 30-minute duration grid are untouched.

#### Preserved from 5.5, deliberately
The design shows duration as three presets (30/60/90). Shipping only those would have dropped
`parseDuration` ("1h30", "1.5h") and every non-preset length, so the presets are rendered as chips
**beside** the free-text field rather than replacing it. Same for Start: the design draws a static
mono box; it is a real input so `parseClock` ("5pm", "17:30") survives. The shutdown gate's
**"Add to This Week"** hand-off is intact — that path is why a block that cannot fit today becomes
a task instead of being lost.

#### Kind and the Eisenhower flags
The design's tag row is Deep / Shallow / Important / Urgent / No notifications. Taken literally,
break and ritual blocks would have become uncreatable while the timeline still renders both, so
the row carries **four** exclusive kind chips (Deep · Shallow · Break · Ritual) plus three
independent toggles.

`important`/`urgent` live on `task`, not `day_block`. Rather than duplicating them, the chips
write through to a backing task — `resolveTaskAction(taskId, important, urgent)` returns
`edit` (block already linked), `create` (no link, a flag is set), or `none`. A created task's id is
attached to the block, which is why `addTask` and `addBlock` now return `Promise<number | null>`.
Consequence: a block tagged Important appears in This Week's matrix automatically, and the two
views cannot disagree.

#### Defects found in verification
- [x] **`editBlock`'s persist whitelist silently dropped the new fields.** It forwarded only
  title/kind/startMin/durationMin/pomodoros/completed, so `taskId`, `note`, `repeat`, `trackId` and
  `quiet` would have updated in memory and vanished on reload. Found by inspection before the UI
  landed. This is the third variant of the same class in this project — a mutation path that
  type-checks because the patch type is `Partial<…>` but persists a hand-maintained subset.
- [x] **`archive.ts` keeps a second, hand-rolled `DayBlock` row mapping** used by `dayRecord()`.
  It broke at `tsc -b` when `DayBlock` gained four fields and was extended identically. Not
  deduplicated in this pass — flagged below.

#### Verified, not taken on the sub-agents' reports
Both agents reported all gates passing while the other was still editing the tree, so their
figures were snapshots of a moving target and were re-run from scratch.

| Check | Result |
| --- | --- |
| `oxlint` | exit 0, zero warnings |
| `tsc -b` + `tsc -p tsconfig.test.json` | pass |
| `vitest run` | 456 tests, 19 files (437 before) |
| `vite build` | pass |
| `cargo fmt --all -- --check` / `cargo clippy --all-targets -- -D warnings` | pass |
| New hex literals in `chrome.css` | zero |
| Dangling `DRAFT_BLOCK_ID` / `BlockEditor` refs | zero |
| Migration `0004` on `node:sqlite` | applies clean; `CHECK` on the added `repeat` column **is** enforced; pre-existing rows backfill to `''`/`'once'`/`NULL`/`0` |
| Modal dismiss semantics | scrim click closes, panel `stopPropagation` — clicking inside does not dismiss |

#### Known, deliberately not fixed
- [ ] `blocks.ts` and `archive.ts` maintain two independent mappings of the same `day_block` row.
  A future column added to one and not the other yields a field that works in Today and is missing
  in Archive. Worth collapsing to one shared `rowToBlock` in the Phase 10 pass.
- [ ] Still no component-level test of the composer's render path — the suite runs on `node`
  because jsdom costs ~113s on this `/mnt/c` mount. The extracted pure helpers
  (`composerSummary`, `initialComposerDraft`, `resolveTaskAction`, `DURATION_PRESETS`) are tested;
  the JSX around them is not.
- [ ] `--danger-surface` is a literal `rgba()` of `--danger` rather than being derived from it, so
  the two can drift. `color-mix(in srgb, var(--danger) 10%, transparent)` would tie them together.

### Phase 6 — Day Templates *(owner: Haiku sub-agents, fixes by Sonnet, verified by Sonnet + main session)*
- [x] Template list + detail pane — `TemplatesView` (290px list column + flex detail pane, per the mockup)
- [x] Weekday repeat selector (7-bit mask) — `WEEKDAYS` / `toggleWeekday` in `lib/templates.ts`, Mon = bit 0
- [x] Add / edit / reorder / delete template blocks — `BlockModal` + `TemplateDetailPane` row controls
- [x] "Apply to today" — behind a confirm step naming how many blocks will be lost
- [x] "Save today as template" — **entry point is the Today header, not Archive; see the deviation below**

#### The repo layer already existed
Phase 3 shipped `db/repos/templates.ts` with full CRUD, `reorderTemplateBlocks` and `saveDayAsTemplate`.
Phase 6 is therefore store + UI, not schema — no migration was needed.

#### Deliberate deviation — where "Save today as template" lives
The checklist places this entry point in Archive. **Archive is still a Phase 7 `ViewPlaceholder`**, so
shipping it there would have produced a feature nothing could reach — the Phase 4 "logic plus tests plus
CSS is not a feature until something renders a button" defect, committed deliberately. The button lives in
`TodayView`'s `.today-actions` group instead, disabled when the day has no blocks. Phase 7's Archive should
call the same `saveDayAsTemplate` store action rather than growing a second implementation.

#### One ordering, now generic
Template blocks need exactly the day-block ordering semantics. Rather than a fourth copy of it —
the defect class that produced the worst bugs in Phases 4 and 5 — `sortBlocks`, `gapBefore`,
`shiftFrom`, `nudge`, `moveBlock`, `conflicts` and `nextFreeStart` in `lib/today.ts` are now generic
over a structural `Schedulable { id, startMin, durationMin, sort }`. `DayBlock` and `TemplateBlock`
both satisfy it. Verified no call site widened its type and no cast was introduced; `layout`,
`blockState` and `blockProgress` stay `DayBlock`-specific because they read `kind`/`completed`.

#### `SqlDriver.transaction()` — new, and why it is shaped the way it is
Added to the driver interface and implemented on both drivers. The Tauri implementation folds every
statement into **one** `execute()` call (`BEGIN; …; COMMIT`, params flattened in statement order).
That is forced by the stack, not a style choice — verified by reading the dependency sources directly:

| Fact | Source |
| --- | --- |
| The plugin runs `sqlx::query(&query)` with all values bound positionally, on **one** pooled connection per `execute()` call | `tauri-plugin-sql-2.4.0/src/wrapper.rs` |
| sqlx-sqlite prepares statements one at a time via `prepare_next` and binds arguments with a running `args_used` offset, so one multi-statement string with `?` placeholders binds correctly | `sqlx-sqlite-0.8.6/src/connection/execute.rs` |
| sqlx does **not** roll back on pool release — `in_transaction` is consulted only inside sqlx's own `Transaction::begin`; the on-release `ping()` does not clear it | `sqlx-core-0.8.6/src/pool/connection.rs` |

Separate `execute()` calls for BEGIN/COMMIT would be wrong: the pool may hand them different connections.

- [ ] **Known residual limitation.** If a statement fails mid-string, `COMMIT` never runs and the
  already-applied statements sit in an uncommitted transaction on that pooled connection. This is
  strictly better than the bug it replaces — the partial write never commits, so it cannot corrupt
  persisted order — but it can leave a connection stuck mid-transaction. Mitigated with a best-effort
  `ROLLBACK` in the catch, swallowed if it fails. Revisit in the Phase 10 pass.

Note the Tauri-side test necessarily mocks `Database.load`, so it proves only that the driver folds
statements into a single call with correctly flattened params. **Real atomicity on the Tauri path is
established by the source reading above, not by that test.** The node driver's rollback *is* proven
directly, by a probe that reads the row back after a mid-transaction failure.

#### Defects found in verification and fixed
As in every prior phase, all of these were found **after** the implementing sub-agents reported every
checklist item complete with all gates passing. The gates did pass and could not see any of it.

**Found in the foundation, before the UI was built on it:**
- [x] **Template list stats went stale.** `totalMin`/`blockCount` come from the `listTemplates` SQL
  aggregate at hydrate time; every block mutation updated `detail.blocks` and never the matching list
  row, so after adding a block the card kept rendering the old "6 h 30 m" until remount. Fixed with
  `syncListStats()`, deriving from `templateTotals()` after every mutation including rollback paths.
- [x] **`TemplateWithStats` / `TemplateDetail` re-declared in the store** while already exported
  identically from the repo. Two sources of truth for one shape.
- [x] **Helpers written, then not used.** `addBlock` inlined `nextTemplateBlockStart()`'s rule and
  `setWeekday` inlined `toggleWeekday()` — both written by the same agent in the same change.
- [x] **`templateSubtitle` did not match the mockup** — missing the "Applies on" prefix the design renders.
- [x] `setWeekday` silently no-opped when the list row was missing; `deleteTemplate` briefly assigned the
  deleted template's detail to the new selection; `removeBlock` left a sparse `sort` sequence while a
  later `reorderTemplateBlocks` wrote a dense one (the shape of the Phase 4 divergence); `hydrate` did
  not refresh an already-selected detail.
- [x] **`saveDayAsTemplate` hardcoded `start_min = 300`** regardless of the day, so a template saved from
  a 9:00 AM day rendered "starts 5:00 AM". Now derives from the day's earliest block, 300 only as the
  empty-day fallback.

**Found in verification of the finished phase:**
- [x] **Non-atomic reorder corrupted the database while the rollback hid it.** `moveBlock` persisted the
  swapped `startMin` values and the `sort` renumbering as two separate awaited round trips. If the second
  failed, the catch reverted only *in-memory* state — the screen looked correct while SQLite kept swapped
  starts with stale sort. Since `getTemplate()` reads `ORDER BY sort`, the next reload rendered a timeline
  **running backwards**, with no error shown. `removeBlock` had the same shape. Proven by probe before
  being fixed: seed A(300,sort 0)/B(360,sort 1), move B up, fail the sort write, reload → `times[0] > times[1]`.
  Both now go through `moveTemplateBlocksAtomic` / `removeTemplateBlockAtomic`, one transaction each.
- [x] **Two delete paths that disagreed.** The block row's ✕ called `removeBlock` with **no confirmation**
  — a silent irreversible delete — while the identical call inside `BlockModal` sat behind a native
  `window.confirm`, which nothing else in this app uses. Both now route through one shared
  `ConfirmDeleteBlockModal`.
- [x] **Ten identical accessible names** on the block rows ("Move up" / "Edit block" / "Delete block") —
  the Phase 4 defect repeating, and inconsistent *within this phase*, since the weekday toggles and
  `TemplateListCard` in the same change already included the name. All now include `block.title`.
- [x] **One modal gated by two independent booleans** (`blockModalOpen`, `editingBlockId`). Not
  exploitable through the UI, but able to stack two dialogs if either were ever set programmatically.
  Collapsed to a `BlockModalState` discriminated union, matching `ComposerState` in `TodayView`.

#### Checked and found correct (each proven by probe, not by inspection)
Weekday bit order end-to-end (Mon+Wed persists as `0b101`, matching schema and render); the
`saveDayAsTemplate` derived start and its empty-day fallback; the reorder happy path against a fresh
`getTemplate()` read; the `Schedulable` generalization; and `lib/templates-ui.ts`, which delegates to
`minDurationFor`/`maxPomodoros` rather than being a fourth duration formatter.

#### Process note — an agent stalled mid-proof and left the tree broken
The fix agent implemented the F1 transaction work, reverted it to prove the regression test could fail,
then stalled before restoring. The tree was left with three test files calling `driver.transaction()`
and **no implementation of it anywhere**. Recorded because the failability discipline this project
relies on has a real failure mode: a revert that is never undone. Restore before reporting, and check
the tree state rather than the agent's summary.

#### Post-phase defect — components referencing CSS classes that were never written

Found only when the user screenshotted the Templates block dialog and asked why it looked nothing like
Today's. It was not styled *differently*; it was not styled *at all*. `BlockModal` referenced
`.modal-field/-label/-input/-hint/-segmented*/-chip-btn*`, none of which existed, so the kind buttons
rendered as the run-together text `DeepShallowBreakRitual` and the duration presets as `306090`.

Sweeping the whole tree found **three** components shipped this way, across two phases:

| Component | Undefined classes | Symptom |
| --- | --- | --- |
| `templates/BlockModal` (Phase 6) | `.modal-field/-label/-input/-hint/-segmented*/-chip-btn*` | bare labels, buttons run together |
| `week/TaskEditor` (Phase 5) | `.modal-backdrop`, `.modal`, `.modal-close` | no overlay, no positioning, no panel chrome |
| `views/WeekView` (Phase 5) | `.view-placeholder`, `-text`, `-error` | loading and error states as unstyled bare text |

**All three passed every gate, in every phase, every time.** Unstyled markup is valid TypeScript, valid
CSS, and renders without error. The Phase 6 acceptance table below checked that the CSS diff added no
new hex literals — but never that the classes components reference actually *resolve*. That is how a
dialog nobody could read was recorded as independently verified.

Fixed by pointing all three at classes that already exist and already work, adding no new design
language: `BlockModal` onto the Today composer's `composer-*` family (so template block editing is the
same visual component family as Today's, not a lookalike), `TaskEditor` onto
`.modal-overlay`/`.modal-panel`/`.btn-icon`, and `WeekView` onto `.view-empty*`, matching `TodayView`'s
handling of the same two states. The five `.modal-*` form rules were still added for the sibling
New/Edit/SaveTemplateModal, which had the same bug. The orphaned `.task-editor` rule was deleted.

Four further defects surfaced while reviewing the `BlockModal` rewrite:

- [x] **Duration field became untypeable** (regression introduced by the restyle). The rewrite collapsed
  the composer's raw-text and committed-number state into one field, so the clamp wrote back into the
  input: with `minDurationFor('deep') === 30`, typing `90` went `9` → `"30"` → `"300"`. Fixed with
  `nextDurationTextState()`, the pure core of the separation `BlockComposer` already had.
- [x] **A new Break block could persist `NaN` duration** — `durationValid` is unconditionally true for
  breaks, save did `parseInt('', 10)`, and the guard `NaN < minDurationFor('break')` is `false`, so
  nothing caught it. **Pre-existing since Phase 6**, not caused by the restyle. Closed at source
  (`breakDurationOnKindSwitch`) and defended at save (`resolveBreakDurationMin`).
- [x] **Footer summary claimed a 12:00 AM start** when start time was left blank, which is legal in
  templates. `composerSummaryNoStart()` omits the range.
- [x] **A mount focus effect silently overrode `autoFocus`**, landing focus on Close instead of the title.

Both substantive fixes proven red-then-green. New logic went into shared helpers in `lib/today.ts` built
on the existing `nearestBreakDuration`; `pomodoroLabel` was extracted out of `composerSummary` to remove
a duplicated pluralization literal.

**A sixth gate now exists because of this:** `pnpm check:css` (`scripts/check-css-classes.mjs`) fails if
any class referenced in `src/components/` has no rule in `src/styles/`. It handles static, template
literal and string-expression `className` forms, and runs in CI between `test` and `build`. Proven able
to fail on both a static `className` and a string inside a template-literal ternary — the form most
likely to hide one. One allowlisted exception: `.settings-entry` on `Sidebar`, an inert modifier beside
`.nav-item`, which carries all the styling.

The lesson generalizes past CSS: **every gate here checks that code is well-formed, and none check that
its references resolve.** Worth asking, each phase, what else is silently unresolvable.

#### External PR review — findings, all confirmed and fixed

An external review of PR #6 requested changes and was **correct on every checkable claim**. It found
defects that four gate runs and two internal verification passes did not.

- [x] **[P1] `editBlock` never re-stamped or persisted `sort`.** It re-sorted the in-memory array but
  — unlike `removeBlock` and `moveBlock` — never renumbered `sort` or persisted it, and `select()`
  assigned `getTemplate()`'s `ORDER BY sort` result verbatim. Reload showed the old order with new
  start times. **This is the same defect class as the F1 reorder bug fixed earlier in this same phase:
  one instance was fixed and its sibling in the adjacent function was left.** Fixed with a new
  `editTemplateBlockAtomic()` writing patch + renumbering in one `driver.transaction()`, plus
  `sortBlocks()` normalization in `select()` as defence in depth.
- [x] **[P1] Confirm-delete backdrop click closed the parent modal**, discarding the in-progress block
  edit. `ConfirmDeleteBlockModal`'s overlay `onClick={onCancel}` did not `stopPropagation`, and it
  renders inside `BlockModal`'s overlay. The Escape path *was* guarded — the click path was simply
  missed. Fixed at the source so it is safe wherever nested.
- [x] **[P1] A new standalone `.btn-danger` rule restyled pre-existing buttons on two untouched
  screens.** Equal specificity `(0,1,0)` to `.btn-icon` and later in source, so it won `background`,
  `color`, `padding`, and `border` on every `btn-icon btn-danger` in `TimelineBlock` and `TaskRow` —
  solid red at rest, no border, `8px 14px` padding on a 28×28 button, and hover feedback dead.
  Renamed to `.btn-danger-solid`.
- [x] **[P2] Store actions swallowed errors while five component paths assumed they threw** — failed
  create/save/delete/apply closed modals and navigated as if successful. Resolved by extending the
  `id | null` convention the store already used: `updateTemplate`, `deleteTemplate` and `applyTemplate`
  now return `boolean`, and every call site checks it. A sub-agent correctly **rejected** the
  main-session suggestion to make these throw, on the evidence that no mutator anywhere in this app
  rejects; rethrowing would have invented a third contract.
- [x] **[P2] `select()` had no stale-response guard** — out-of-order resolution could leave `detail`
  holding template A's blocks while `selectedId` was B, after which `addBlock` would persist a row
  under B with a `startMin` computed from A.
- [x] **[P3]** `deleteTemplate` partial rollback; dead `templateId` prop; untrimmed template name;
  unclassed loading state; inline styles where siblings use classes; dead `templates-ui.ts` (whose
  validator already *disagreed* with the live `BlockModal` rules) and dead `templates.ts` exports.

**A defect introduced by the fix round itself, found in review of the fix:** `editTemplateBlockAtomic`
duplicated the six-branch column mapping from `updateTemplateBlock` verbatim — the project's signature
failure mode, reintroduced while fixing a bug of the same family. Extracted to one
`TEMPLATE_BLOCK_COLUMNS` table typed `Record<keyof Omit<TemplateBlock, 'id' | 'templateId'>, string>`,
matching the existing `PERSISTABLE_BLOCK_FIELDS` convention. Exhaustiveness proven by adding a probe
field and observing `tsc -b` fail with TS2741.

**Two mock-up deviations**, both fixed: weekday chips rendered accent on every list card because
`.tpl-card-active .tpl-weekday-active` was byte-identical to the base rule — a dead rule that was also
a visible bug. Sat/Sun were left toggleable rather than given the mock-up's disabled treatment: the
7-bit mask supports weekends and a weekend template is legitimate.

**One review claim corrected, on evidence:** `DEFAULT_TEMPLATE_START_MIN` was described as a second
source of truth for the 300 default. It was already dead at `HEAD` — `TemplatesView` hardcoded
`startMin: 300` and never imported it. Deleting it removed misleading dead code; the two real magic
`300`s (`NewTemplateModal`, `saveDayAsTemplate`) predate this PR and are worth consolidating later.

**What the gates could not see, again.** Every one of these passed `oxlint`, `tsc`, the suite,
`check:css` and `vite build`. `check:css` verifies that referenced classes *resolve*; it cannot see a
CSS collision between two rules that both exist, styling that was never a class, or a
verification claim stated more strongly than its check supports — the "zero new colour literals" grep
used `#` and `rgb` and so missed a `color: white` in the very rule causing the P1 collision. The colour
grep now includes named colours.

#### Process note — a second agent revert destroyed uncommitted work
The agent that wrote `check-css-classes.mjs` proved it could fail by planting a bad class in a
component, then cleaned up with a tree-wide `git` revert rather than restoring just that file. It wiped
four uncommitted documentation edits in the process. The code changes survived only because they had
already been committed. This is the same failure mode as the Phase 6 stall recorded above, and the
second time a revert-based proof has damaged the tree: **commit or stash before handing a tree to an
agent that will revert anything, and require agents to restore by file, never tree-wide.**

**Phase 6 acceptance — MET (independently verified, not taken on the sub-agents' reports):**

| Check | Result |
| --- | --- |
| `oxlint` | clean, zero warnings |
| `tsc -b` + `tsc -p tsconfig.test.json` | pass |
| `vitest run` | 573 tests, 24 files (456 at phase start) |
| `vite build` | pass — 368.7 KB JS / 52.6 KB CSS (gzip 104.8 / 8.5) |
| `cargo fmt --all -- --check` | pass |
| `cargo clippy --all-targets -- -D warnings` | pass |
| New hex literals in `chrome.css` | zero |
| Every class referenced in components resolves to a CSS rule | **not checked at the time — three components were broken.** Added afterwards as `pnpm check:css`; now passes |
| Every templates-store action reachable from a component | pass — all 11 wired |
| `window.confirm` remaining in components | zero |
| Regression test proven able to fail | pass — atomic repo fns reverted to the two-round-trip shape, suite went red (`expected 999 to be 300`), fix restored, 573 green |
| Node-driver rollback proven by read-back probe | pass |
| `tauri dev` launches on WSLg | pass — 189 MB RSS, 0 panics, 0 Rust errors, Vite HTTP 200, Phase 6 icon set bundled |

Note: the WSLg `libEGL` / `MESA ZINK` / `gdk_seat_get_keyboard` warnings from Phases 1–5 persist —
software-rendering noise, not app faults. A transient `EACCES` renaming `node_modules/.vite/deps` on the
`/mnt/c` 9p mount appeared once and resolved on retry; it is a filesystem artifact, not an app fault.

#### Known, deliberately not fixed
- [ ] No component-level test of the Templates render path. The suite runs on the `node` environment
  because jsdom costs ~113s on this `/mnt/c` mount (Phase 2). Pure helpers are tested; the JSX is not.
  Same standing exception as Phases 5.5 and 5.6.
- [ ] The Tauri-side `transaction()` test mocks the plugin and so cannot prove real atomicity — see the
  driver note above.

### Phase 7 — Archive *(owner: Haiku sub-agent, verified and fixed by Sonnet + main session)*
- [x] Month calendar with per-day status dots (full / partial / missed) — `MonthCalendar`, Monday-first grid
- [x] Month navigation — prev/next, via `addMonths`
- [x] Selected-day record: completed count, deep hours, pomodoros, block list, shut-down note — `DayRecordPane`
- [x] Header stats: blocks done, completion %, day streak — from the existing `headlineStats`
- [x] 12-week deep-hours histogram — `DeepHoursHistogram` over `histogramBars`
- [x] **Beyond the checklist:** "Save as template" from a past day, reusing Phase 6's `saveDayAsTemplate`

#### The repo layer already existed
As in Phase 6, Phase 3 had already shipped `db/repos/archive.ts` with `dayStatuses`, `dayRecord`,
`headlineStats`, `deepMinutesByWeekday` and `deepHoursLast12Weeks`. Phase 7 is store + UI + CSS —
**no migration was needed**. Three defects in that pre-existing repo layer were fixed here, since
Phase 7 is the first code to actually read it.

#### `saveDayAsTemplate` reused, not reimplemented
Phase 6 put "Save today as template" on the Today header because Archive was still a placeholder,
and recorded that Archive must call the same store action. It does: `SaveTemplateModal` was
generalized with an optional `day` prop (defaulting to today, so `TodayView`'s call site is
unchanged) rather than being copied.

#### `DayStatus` gained a fourth value — `'note'`
A day can have a shut-down note and zero planned blocks. None of `full`/`part`/`miss` is honest for
that: the mockup's own legend reads `miss` as "Planned, missed", which asserts blocks were planned
and failed. `DayStatus` is now `'full' | 'part' | 'miss' | 'note'`. Blast radius checked before
widening — the type is referenced only by `db/types.ts`, a re-export in `db/index.ts`,
`repos/archive.ts` and `stores/archive.ts`. The calendar legend therefore carries **four** items
against the mockup's three; a deliberate deviation, since the mockup's hardcoded Feb 2026 data never
exercises this case.

#### Defects found in verification and fixed
As in every prior phase, all of these were found **after** the implementing sub-agent reported every
checklist item complete with all six gates passing. The gates did pass and could not see any of it.
The sub-agent's self-report was independently unreliable in two checkable ways: it reported the test
delta as **+8** when it was **+28**, and it reported "Deviations from brief: None" while deviating on
an explicit instruction (D2 below).

- [x] **`monthGrid()` always returned 42 cells and appended a bogus trailing week.** The `break`
  conditions fired only at exactly 35 cells, and when they did, a second `while (cells.length < 42)`
  loop immediately refilled to 42 with cells hardcoded `inMonth: false` — so the 35-cell path was
  unreachable and every month rendered a dead row. Proven by probe before being fixed:
  `Feb2026 cells=42 last=2026-03-08` (should be 35, ending 2026-03-01) and
  `Feb2027 cells=42 last=2027-03-14` (Feb 2027 starts on a Monday and has 28 days — should be 28
  cells). The sub-agent's report defended 42 as correct with arithmetic that does not hold. Rewritten
  to walk `gridStart` → `gridEnd` with no hardcoded count; now 28/35/42 naturally. Out-of-month cells
  also now carry their real calendar day number instead of a magic `0`.
- [x] **Two SQL sources of truth for one value, and they disagreed.** `dayRecord` stamped a
  note-only day `'miss'` while `dayStatuses`' SQL required `COUNT(*) > 0` and silently omitted it —
  so the calendar cell rendered disabled and unclickable while `dayRecord` simultaneously claimed the
  day was planned and missed. **The shut-down note was unreachable dead UI**, which is the one thing
  the Phase 7 checklist names explicitly. This is the project's signature defect class in the
  calendar's primary data path. Both now derive the same four-way status, and a probe test asserts
  the two functions agree across full/part/miss/note/empty days against real SQLite.
- [x] **The `'miss'` dot was never painted.** `dotColor()` fell through to `transparent` for anything
  but `full`/`part`, while the legend advertised a grey "Planned, missed" dot. Days with *no* record
  at all were also mislabeled `"Planned, missed"` in their aria-label, by the same fall-through.
- [x] **`DayRecordPane` re-implemented `splitDeepHours` inline, incorrectly** — the exact failure mode
  that helper's own doc comment warns about. Proven by probe: at `deepMin = 1138` the duplicate
  rendered `"18.10"` where the canonical helper gives `"19.0"`. This is the Phase 3 deep-hours defect
  reintroduced in a new file, and the fourth instance of the duplicated-helper class.
- [x] **`addMonths` was dead code** — exported and unit-tested, never called, while
  `prevMonth`/`nextMonth` reimplemented month arithmetic inline. The Phase 4 "logic plus tests is not
  a feature until something calls it" defect, plus a duplicated implementation. Now wired.
- [x] **The grid-boundary computation was duplicated byte-for-byte** across `hydrate`, `setMonth` and
  `monthGrid`. Collapsed to one `monthGridRange()`.
- [x] **The stale-response guard's test proved nothing.** It awaited two calls in issue order
  (`await p1; await p2`), which passes identically whether the guard exists or not, since with no
  reordering the later call always resolves last. This is the Phase 3 tautological-test lesson
  repeating — an assertion that cannot fail. Rewritten with a driver wrapper that delays the *first*
  call's response past the second's, the only ordering that exercises the guard.

#### Checked and found correct
`addMonths` negative `n`, Dec→Jan, Jan→Dec and the Jan 31 → Feb 28 clamp (probed); the
`SaveTemplateModal` `day` prop defaulting so `TodayView` is behaviourally unchanged; the
`BlockRow`/`rowToBlock` extraction into `blocks.ts` (byte-identical logic, no shape change); the
exported `MONTHS` leaving no duplicate copy (`WEEKDAYS` had no consumer outside `formatTitleDate`
and was later made module-private); the store's P2-A error contract matching
`stores/templates.ts`; store tests reading back through real SQLite; no `toISOString()` day keys
anywhere in the diff; and every `lib/archive.ts` export and store action reachable from a rendered
component (`setMonth` via `prevMonth`/`nextMonth`, which are the mockup's only affordances).

**Phase 7 acceptance — MET (independently verified, not taken on the sub-agents' reports):**

| Check | Result |
| --- | --- |
| `oxlint` | exit 0, zero warnings |
| `tsc -b` + `tsc -p tsconfig.test.json` | exit 0 |
| `vitest run` ×2 | 603 tests, 25 files — identical both runs, ~43s (573 at phase start) |
| `check:css` | exit 0 — all 37 `.arc-*` classes resolve |
| `vite build` | pass — built in 44s |
| `cargo fmt --all -- --check` / `cargo clippy --all-targets -- -D warnings` | pass |
| New colour literals in the diff (`#`, `rgb`, named) | zero — histogram ramp uses `color-mix()` over `var(--accent)` |
| `monthGrid` cell counts re-probed after the fix | Feb2026 **35** (ends 2026-03-01), Feb2027 **28**, Mar/Aug/Nov 2026 **42** |
| `dayStatuses` agrees with `dayRecord` for every day-kind | pass — probe test against real SQLite |
| `DayStatus` widening blast radius | pass — Archive-scoped only, grepped before widening |
| Regression tests proven able to fail | pass ×3 — grid padding restored (`expected 42 to be 35`), `dayRecord` status reverted (`expected 'miss' to be 'note'`), stale guard commented out (`expected '2026-08-10' to be '2026-08-15'`); all restored, suite green |

#### Known, deliberately not fixed
- [ ] `stores/archive.ts` initialises `year`/`month0` from `new Date()` at module scope, against the
  Phase 3 rule that a store never reads the clock. It is inert — `hydrate(driver, today)` overwrites
  it — but the *first* render does read it, so the rule is bent rather than merely decorated. The
  value is correct in every timezone, so this is a convention violation, not a live defect.
- [ ] A zero-hour week renders as a 0%-height (invisible) histogram bar. The mockup's shortest bar is
  38%, but that is placeholder data, not a spec; flooring the bar would misrepresent a genuine
  zero-output week. Revisit in the Phase 10 polish pass if it reads as a rendering fault.
- [ ] Still no component-level test of the Archive render path — the suite runs on the `node`
  environment because jsdom costs ~113s on this `/mnt/c` mount (Phase 2). Pure helpers are tested;
  the JSX is not. Same standing exception as Phases 5.5, 5.6 and 6.

### Phase 8 — Sound library
- [ ] "Load mp3" via dialog plugin; persist absolute path + metadata
- [ ] Track grid with categories; empty state
- [ ] Playback via `convertFileSrc()` + `<audio>`; play/pause/seek/volume in the music bar
- [ ] Session defaults: fade-in 8s, silence during rest, loop until block ends
- [ ] Remove track; handle a file that has since been deleted

### Phase 9 — Pomodoro & full session
- [ ] Timer store: focus/rest phases, pomodoro counter, drift-free tick from wall clock
- [ ] Three timer styles (ring / numeric / bar) driven by settings
- [ ] Start / pause / continue / rest / reset
- [ ] Full-session overlay (dark `#22332d`, 300px ring, next-block hint)
- [ ] Persist completed pomodoros to `pomodoro_session`
- [ ] Timer survives view switches and window minimise

### Phase 10 — Release
- [ ] Real app icon set (all sizes, `.ico` + `.png` + `.icns`-optional)
- [ ] Keyboard shortcuts (space = start/pause, Esc = exit session)
- [ ] Empty states for every view
- [ ] Manual QA pass on Linux (WSLg) and Windows
- [ ] Tag `v0.1.0`, confirm CI publishes NSIS exe + deb + AppImage
- [ ] Verify installed artifacts launch on clean Windows and Linux

---

## 4. Known risks

| Risk | Mitigation |
| --- | --- |
| `decorations: false` breaks resize edges / snapping on Windows | Test early in Phase 2; fall back to native decorations if snap layouts break. |
| AppImage built on a too-new runner won't launch on older distros | Pinned `ubuntu-22.04`. |
| WebView2 absent on older Windows 10 | `downloadBootstrapper` install mode. |
| `convertFileSrc` blocked by CSP / asset scope | Explicit `assetProtocol` scope in the capability file, verified in Phase 8. |
| `setInterval` timer drifts when the window is minimised | Compute remaining time from a stored wall-clock deadline, not by decrementing. |
| Google-Fonts-dependent typography fails offline | Bundled `@fontsource` packages. |
