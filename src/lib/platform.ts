/**
 * True when running inside the Tauri webview. The frontend also runs under
 * plain `vite dev` (browser) for design iteration and e2e checks, where the
 * window IPC bridge does not exist and every control must degrade to a no-op.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
