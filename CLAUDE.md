# Deep Work — Tauri v2 + React desktop app

- Scope and plan: `TASKS.md`
- Setup, workflows, release process: `README.md`
- Scripts: `package.json` · Lint: `.oxlintrc.json` · Bundle/version: `src-tauri/tauri.conf.json` · Icon: `python3 scripts/generate-icon.py` then `./node_modules/.bin/tauri icon assets/icon.png` (regenerate + commit together)
- `pnpm check:css` (`scripts/check-css-classes.mjs`) fails if a class used in `src/components/` has no rule in `src/styles/`. Every other gate passes on missing CSS — it ships as broken UI. Runs in CI.
- `.gitattributes` pins `*.sql` to LF: sqlx checksums applied migrations by their exact bytes, so a CRLF checkout (or editing a released migration) makes `Migrator::run` abort and every later migration silently never apply. See README.md "Toolchain notes".
- Requires pnpm 11. `pnpm-workspace.yaml` must use `allowBuilds`, never `ignoredBuiltDependencies`.
- When workflows, scripts, or toolchain config change, update `README.md` and this file in the same commit.
- Signed updater releases require `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; never commit the private key. The release workflow validates tag/config/Cargo versions and all three signed manifest entries before a draft may be published. Draft assets must be resolved through the authenticated Releases list/asset APIs because GitHub's release-by-tag download endpoint excludes drafts, and the manifest validator needs `contents: write` because read-only workflow tokens cannot see draft releases.
- Requires Node.js 24+ (CI uses Node 24): tests import `node:sqlite`, listed in `module.builtinModules` only on Node 24+, which Vitest needs to externalize it.
- Built-in sound library: `src/lib/builtinTracks.ts` is the source of truth for the 10 bundled tracks (`public/audio/*.mp3`, not touched by app code). Adding/changing a built-in means editing that file and bumping `BUILTIN_SEED_VERSION` — no SQL migration. See README.md "Sound library".
