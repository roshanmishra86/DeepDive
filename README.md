# Deep Work

> **⚠️ Work in progress — not ready for day-to-day use.**
>
> This project is under active development. Features are incomplete, behaviour may
> change without notice, and there is no stable release yet. Do not rely on it for
> real work, and expect data formats to break between commits.

A desktop application for managing deep work sessions, built with Tauri v2 and React.

## Prerequisites

- Node.js 20+ with **pnpm 11+** (pinned to `pnpm@11.18.0` via `packageManager`; CI uses Node 22)
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

## Workflows

Two workflows. Everyday checks run on `main`; installers are built only at tag time.

- **CI** (`.github/workflows/ci.yml`) — push to `main` or `release`, PRs targeting either, plus manual dispatch. Runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then `cargo fmt --check` and `cargo clippy -D warnings`. Ubuntu only; does not bundle the app.
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

## Toolchain notes

`pnpm-workspace.yaml` uses pnpm 11's `allowBuilds` key to declare that esbuild's
postinstall script is skipped. This replaced pnpm 10's `ignoredBuiltDependencies`,
which pnpm 11 silently stops honouring — leaving it in place makes
`pnpm install --frozen-lockfile` fail with `ERR_PNPM_IGNORED_BUILDS`. esbuild
resolves its platform binary through optional dependencies, so skipping the script
is safe. Do not downgrade this key to the old syntax.

## Build Artifacts

Built artifacts are located in:
- Windows: `src-tauri/target/release/bundle/nsis/`
- Linux (deb): `src-tauri/target/release/bundle/deb/`
- Linux (AppImage): `src-tauri/target/release/bundle/appimage/`
