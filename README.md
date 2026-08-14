# Deep Work

A desktop application for managing deep work sessions, built with Tauri v2 and React.

## Download

Installers for every tagged release are published on the
**[Releases page](https://github.com/roshanmishra86/DeepDive/releases)** —
[latest release](https://github.com/roshanmishra86/DeepDive/releases/latest).

| Platform | File |
| --- | --- |
| Windows | `Deep.Work_<version>_x64-setup.exe` (NSIS, installs per-user) |
| Linux | `Deep.Work_<version>_amd64.AppImage` or `Deep.Work_<version>_amd64.deb` |

The installers are unsigned, so Windows SmartScreen shows a "Windows protected
your PC" warning on first run — choose **More info → Run anyway**. To build
from source instead, see [Development](#development).

## Prerequisites

- Node.js 24+ with **pnpm 11+** (pinned to `pnpm@11.18.0` via `packageManager`; CI uses Node 24) — 24 is the floor because the test suite imports `node:sqlite`, which only appears in `module.builtinModules` on Node 24+, and Vitest relies on that list to externalize it
- Rust stable (1.77.2 or later) via rustup
- On Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `build-essential`, `pkg-config`, `libssl-dev`

## Development

Install dependencies:
```bash
pnpm install
```

Run the dev server:
```bash
pnpm tauri dev
```

Build the application:
```bash
pnpm tauri build
```

### Running the gates locally

CI invokes the `pnpm` scripts, and that is correct there. **Locally on the WSL2
`/mnt/c` mount, call the binaries directly instead:**

```bash
./node_modules/.bin/oxlint                      # lint
./node_modules/.bin/tsc -b                      # typecheck (app)
./node_modules/.bin/tsc -p tsconfig.test.json   # typecheck (tests)
./node_modules/.bin/vitest run                  # tests
node scripts/check-css-classes.mjs              # CSS class resolution
./node_modules/.bin/vite build                  # build
```

`check-css-classes.mjs` fails if any class referenced in `src/components/`
has no rule in `src/styles/`. It exists because three components shipped
referencing classes that were never written, and every other gate passed on
all three: unstyled markup is valid TypeScript, valid CSS, and renders
without error. It reads static, template-literal and string-expression
`className` forms. Add genuinely style-free classes to the allowlist at the
top of the script, with a reason.

pnpm 11 runs a dependency-status check before every script, which spawns a
synchronous `pnpm install`. On this 9p mount that install is glacial, and two or
more concurrent ones deadlock on the pnpm store lock — a `pnpm lint` that would
finish in under a second as `oxlint` instead hangs for 30+ minutes. Worse, the
wrapper can **exit 0 without ever reaching the underlying tool**, so a "passing"
gate may not have run at all. Always confirm you saw real tool output before
believing a local gate. If things are already wedged: `pkill -f "bin/pnpm install"`.

## Workflows

Two workflows. Everyday checks run on `main`; installers are built only at tag time.

- **CI** (`.github/workflows/ci.yml`) — push to `main` or `release`, PRs targeting either, plus manual dispatch. Runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:css`, `pnpm build`, then `cargo fmt --check` and `cargo clippy -D warnings`. Ubuntu only; does not bundle the app.
- **Release** (`.github/workflows/release.yml`) — push of a tag matching `v*`. Builds on `windows-latest` and `ubuntu-22.04`, then publishes a **draft** GitHub Release with the installers attached. The matrix sets `fail-fast: false` so one platform failing cannot cancel the other and leave a half-populated release.

Because bundling only happens on a tag, a cross-platform packaging break will not
surface until you tag. To rehearse without publishing anything, push a throwaway
tag — the release is created as a draft, so nothing goes public:

```bash
git tag v0.0.1-test && git push origin v0.0.1-test
```

Delete the draft release and the tag afterwards.

### Cutting a release

The version in the artifact filenames comes from `src-tauri/tauri.conf.json`
(mirrored in `src-tauri/Cargo.toml`) — **not** from the tag and not from
`package.json`. Bump it to match the tag before pushing, or a `v1.2.0` release
will ship binaries named `0.1.0`.

1. Bump `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Commit, then tag with the matching `v<version>` and push the tag.
3. Download the draft's installers and confirm the app launches — CI proves the
   binaries build and upload, not that they run.
4. Publish the draft.

## App icon

The mark (a cream 270° progress-ring arc on the accent-green rounded square) is
generated, not hand-exported:

```bash
python3 scripts/generate-icon.py          # writes assets/icon.png (1024x1024)
./node_modules/.bin/tauri icon assets/icon.png   # regenerates src-tauri/icons/*
```

`public/favicon.svg` is the same geometry as a hand-written vector. Regenerate
after changing the script, and commit both.

## Sound library

The app ships with 10 built-in background tracks, encoded to 96 kbps MP3 and
stored at `public/audio/*.mp3` (Pixabay Content License — free for commercial
use, no attribution required). Vite serves `public/` at the app origin, so
they play from `/audio/<file>.mp3` both under `vite dev` and inside the
bundled Tauri app; they are deliberately not shipped as Tauri
`bundle.resources`, since AppImage remounts at a fresh path on every launch,
which would break a seeded absolute path.

`src/lib/builtinTracks.ts` is the single source of truth for the built-in
list; `src/stores/library.ts` seeds it into the `track` table during
`hydrate`, gated by the `builtinSeedVersion` setting: seeding runs only when
the stored version is behind `BUILTIN_SEED_VERSION`, so it happens once and a
user's deletion of a built-in sticks. To add, remove, or edit a built-in track: update
`BUILTIN_TRACKS` in `src/lib/builtinTracks.ts` and bump
`BUILTIN_SEED_VERSION` — there is no SQL migration for this.

## Keyboard shortcuts

- **Space** — start/pause the pomodoro timer (ignored while typing, on key
  repeat, with modifiers held, or while any dialog is open)
- **Esc** — exit the full-session overlay (dialogs keep their own Esc handling)

## Toolchain notes

`pnpm-workspace.yaml` uses pnpm 11's `allowBuilds` key to declare that esbuild's
postinstall script is skipped. This replaced pnpm 10's `ignoredBuiltDependencies`,
which pnpm 11 silently stops honouring — leaving it in place makes
`pnpm install --frozen-lockfile` fail with `ERR_PNPM_IGNORED_BUILDS`. esbuild
resolves its platform binary through optional dependencies, so skipping the script
is safe. Do not downgrade this key to the old syntax.

`.gitattributes` pins `*.sql` to LF on every platform. sqlx checksums each
applied migration by hashing the exact bytes embedded via `include_str!`
(`src-tauri/src/lib.rs`). If a checkout flips `src-tauri/migrations/*.sql` to
CRLF, those hashes stop matching the `_sqlx_migrations` rows written by an
earlier run, `Migrator::run` aborts with a version mismatch, and **every later
migration silently never applies** — the app then runs against an outdated
schema and fails only at the first statement that touches a new column. Never
edit an already-released migration file for the same reason.

## Build Artifacts

Built artifacts are located in:
- Windows: `src-tauri/target/release/bundle/nsis/`
- Linux (deb): `src-tauri/target/release/bundle/deb/`
- Linux (AppImage): `src-tauri/target/release/bundle/appimage/`

## License

The source code is MIT — see [LICENSE](LICENSE).

The bundled audio in `public/audio/` is **not** covered by that grant. Those ten
tracks come from [Pixabay](https://pixabay.com/music/) and are used under the
[Pixabay Content License](https://pixabay.com/service/license-summary/), which
permits commercial use and redistribution without attribution but forbids
redistributing them as standalone audio files or on a competing stock-media
service. Artist and title are embedded in each file's ID3 tags, and the source
metadata is listed in `src/lib/builtinTracks.ts`. Forks that redistribute this
repository inherit those terms for the audio.
