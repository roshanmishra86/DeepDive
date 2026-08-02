# Deep Work

> **⚠️ Work in progress — not ready for day-to-day use.**
>
> This project is under active development. Features are incomplete, behaviour may
> change without notice, and there is no stable release yet. Do not rely on it for
> real work, and expect data formats to break between commits.

A desktop application for managing deep work sessions, built with Tauri v2 and React.

## Prerequisites

- Node.js 20+ with pnpm 10+
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

All CI/build automation is tuned to the `release` branch, which does not exist yet.
Nothing runs on `main` — the workflows stay dormant until a `release` branch is
created, at which point they start building automatically.

- **CI** (`.github/workflows/ci.yml`): Triggers on push to `release` and pull requests targeting `release`. Runs TypeScript type checking, Rust formatting, and Clippy linting.
- **Build** (`.github/workflows/build.yml`): Triggers on push to `release`, pull requests targeting `release`, and manual dispatch. Builds installers for Windows (NSIS) and Linux (deb + AppImage), uploads as workflow artifacts.
- **Release** (`.github/workflows/release.yml`): Triggers on version tags (`v*`). Builds and publishes to GitHub Releases as draft.

## Build Artifacts

Built artifacts are located in:
- Windows: `src-tauri/target/release/bundle/nsis/`
- Linux (deb): `src-tauri/target/release/bundle/deb/`
- Linux (AppImage): `src-tauri/target/release/bundle/appimage/`
