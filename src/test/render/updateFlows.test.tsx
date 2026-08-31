// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateSnapshot } from '../../lib/updater'

const mock = vi.hoisted(() => {
  let snapshot: UpdateSnapshot = { phase: 'idle', currentVersion: '1.0.0' }
  const listeners = new Set<() => void>()
  return {
    controller: {
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
      getSnapshot: () => snapshot,
      download: vi.fn(async () => undefined),
      dismissAvailable: vi.fn(),
      defer: vi.fn(),
      installAndRelaunch: vi.fn(async () => undefined),
      retry: vi.fn(async () => undefined),
      check: vi.fn(async () => undefined),
    },
    set(next: UpdateSnapshot) {
      snapshot = next
      listeners.forEach((listener) => listener())
    },
  }
})

vi.mock('../../lib/updater', () => ({ updaterController: mock.controller }))

import { UpdateExperience } from '../../components/chrome/UpdateExperience'
import { SettingsPanel } from '../../components/chrome/SettingsPanel'

describe('update interface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    act(() => mock.set({ phase: 'idle', currentVersion: '1.0.0' }))
  })

  it('offers an available update without stealing focus', () => {
    const existing = document.createElement('button')
    document.body.append(existing)
    existing.focus()
    act(() => mock.set({ phase: 'available', currentVersion: '1.0.0', availableVersion: '1.1.0' }))
    render(<UpdateExperience />)
    expect(screen.getByRole('status', { name: 'Software update' })).toHaveTextContent('Deep Work v1.1.0 is available')
    expect(screen.getByRole('button', { name: 'Download update' })).toBeVisible()
    expect(existing).toHaveFocus()
    existing.remove()
  })

  it('focuses the safer Later action and treats Escape as deferral', () => {
    act(() => mock.set({ phase: 'ready', currentVersion: '1.0.0', availableVersion: '1.1.0', deferred: false }))
    render(<UpdateExperience />)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Deep Work v1.1.0 is ready to install')
    expect(screen.getByRole('button', { name: 'Later' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mock.controller.defer).toHaveBeenCalledOnce()
  })

  it('shows installed version and the applicable Settings action', () => {
    act(() => mock.set({ phase: 'available', currentVersion: '1.0.0', availableVersion: '1.1.0' }))
    render(<SettingsPanel />)
    expect(screen.getByRole('status')).toHaveTextContent('Deep Work v1.0.0')
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }))
    expect(mock.controller.download).toHaveBeenCalledOnce()
  })
})
