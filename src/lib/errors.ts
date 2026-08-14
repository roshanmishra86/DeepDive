/**
 * One place that turns an unknown rejection into user-facing text.
 *
 * The subtlety this exists for: Tauri's IPC bridge rejects with a plain
 * *string*, never an Error. Code that only unwrapped `err instanceof Error`
 * therefore threw away every message coming back from the SQL plugin and
 * showed its generic fallback instead — which is how a real
 * "table subtask has no column named due_at" surfaced as the useless
 * "Could not create subtask".
 */
export function messageFor(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (typeof err === 'string' && err.trim()) return err
  // Some plugin errors arrive as a bare `{ message }` object rather than a
  // string or a real Error.
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string' &&
    (err as { message: string }).message.trim()
  ) {
    return (err as { message: string }).message
  }
  return fallback
}
