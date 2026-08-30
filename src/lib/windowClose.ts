import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm } from '@tauri-apps/plugin-dialog'

/**
 * Flush pending editor work before terminating the desktop window.
 *
 * `Window.close()` emits another close-request event, so it must not be used
 * after the first request has been cancelled. `destroy()` completes the
 * already-approved close without recursively entering the same handler.
 */
export async function flushAndDestroyWindow(flush: () => Promise<boolean>): Promise<void> {
  const appWindow = getCurrentWindow()
  if (await flush()) {
    await appWindow.destroy()
    return
  }

  const discard = await confirm(
    'Your latest note could not be saved. Close the application and discard those changes?',
    { title: 'Deep Work', kind: 'warning' }
  )
  if (discard) await appWindow.destroy()
}
