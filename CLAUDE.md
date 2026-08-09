# Deep Work — Tauri v2 + React desktop app

- Scope and plan: `TASKS.md`
- Setup, workflows, release process: `README.md`
- Scripts: `package.json` · Lint: `.oxlintrc.json` · Bundle/version: `src-tauri/tauri.conf.json` · Icon: `python3 scripts/generate-icon.py` then `./node_modules/.bin/tauri icon assets/icon.png` (regenerate + commit together)
- `pnpm check:css` (`scripts/check-css-classes.mjs`) fails if a class used in `src/components/` has no rule in `src/styles/`. Every other gate passes on missing CSS — it ships as broken UI. Runs in CI.
- Requires pnpm 11. `pnpm-workspace.yaml` must use `allowBuilds`, never `ignoredBuiltDependencies`.
- When workflows, scripts, or toolchain config change, update `README.md` and this file in the same commit.
- Requires Node.js 24+ (CI uses Node 24): tests import `node:sqlite`, listed in `module.builtinModules` only on Node 24+, which Vitest needs to externalize it.
