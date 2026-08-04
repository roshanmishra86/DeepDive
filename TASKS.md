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
  - **Reopened in Phase 2:** the file was back, again with the invalid `allowBuilds` key. `allowBuilds` is not a pnpm option; the real key is `ignoredBuiltDependencies`. Rewritten to `ignoredBuiltDependencies: [esbuild]`, which actually expresses the intent (skip esbuild's postinstall). Confirms the original warning: an unknown key here is silently a no-op.
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

### Phase 3 — Persistence layer
- [ ] SQLite migrations for the schema in §2
- [ ] Rust commands / SQL layer for tasks, blocks, templates, rituals, archive, tracks, settings
- [ ] Typed TS client wrapper over the SQL calls
- [ ] Seed defaults on first run (rituals, one "Maker Day" template)

### Phase 4 — Today view
- [ ] Proportional timeline (gutter times + `max(34, min*1.6)` block heights)
- [ ] Block states: completed (struck through), active/in-session, break (dashed), planned
- [ ] Header summary: planned total, deep total, end time — computed
- [ ] New block / edit block / delete / reorder
- [ ] Apply template to today
- [ ] Complete-block toggle

### Phase 5 — This Week view
- [ ] Task list grouped by Eisenhower matrix (4 quadrants)
- [ ] Alternate grouping by deadline (48h / later this week / no deadline)
- [ ] Important + Urgent tag toggles persisting to DB
- [ ] "Plan today" → creates a block from the task
- [ ] Add / edit / complete / delete task

### Phase 6 — Day Templates
- [ ] Template list + detail pane
- [ ] Weekday repeat selector (7-bit mask)
- [ ] Add / edit / reorder / delete template blocks
- [ ] "Apply to today"
- [ ] "Save today as template" (entry point lives in Archive)

### Phase 7 — Archive
- [ ] Month calendar with per-day status dots (full / partial / missed)
- [ ] Month navigation
- [ ] Selected-day record: completed count, deep hours, pomodoros, block list, shut-down note
- [ ] Header stats: blocks done, completion %, day streak
- [ ] 12-week deep-hours histogram

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
