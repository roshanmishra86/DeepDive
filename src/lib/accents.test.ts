import { describe, it, expect } from 'vitest'
import { applyAccent, ACCENTS, type AccentKey } from './accents'

describe('applyAccent', () => {

  it('applies green accent correctly', () => {
    const calls: Array<[string, string]> = []
    const element = {
      style: {
        setProperty: (prop: string, value: string) => {
          calls.push([prop, value])
        },
      } as any,
    }
    applyAccent('green', element)
    expect(calls).toContainEqual(['--accent', ACCENTS.green.accent])
    expect(calls).toContainEqual(['--accent-hover', ACCENTS.green.hover])
    expect(calls).toContainEqual(['--accent-surface', ACCENTS.green.surface])
  })

  it('applies blue accent correctly', () => {
    const calls: Array<[string, string]> = []
    const element = {
      style: {
        setProperty: (prop: string, value: string) => {
          calls.push([prop, value])
        },
      } as any,
    }
    applyAccent('blue', element)
    expect(calls).toContainEqual(['--accent', ACCENTS.blue.accent])
    expect(calls).toContainEqual(['--accent-hover', ACCENTS.blue.hover])
    expect(calls).toContainEqual(['--accent-surface', ACCENTS.blue.surface])
  })

  it('applies sienna accent correctly', () => {
    const calls: Array<[string, string]> = []
    const element = {
      style: {
        setProperty: (prop: string, value: string) => {
          calls.push([prop, value])
        },
      } as any,
    }
    applyAccent('sienna', element)
    expect(calls).toContainEqual(['--accent', ACCENTS.sienna.accent])
    expect(calls).toContainEqual(['--accent-hover', ACCENTS.sienna.hover])
    expect(calls).toContainEqual(['--accent-surface', ACCENTS.sienna.surface])
  })

  it('applies charcoal accent correctly', () => {
    const calls: Array<[string, string]> = []
    const element = {
      style: {
        setProperty: (prop: string, value: string) => {
          calls.push([prop, value])
        },
      } as any,
    }
    applyAccent('charcoal', element)
    expect(calls).toContainEqual(['--accent', ACCENTS.charcoal.accent])
    expect(calls).toContainEqual(['--accent-hover', ACCENTS.charcoal.hover])
    expect(calls).toContainEqual(['--accent-surface', ACCENTS.charcoal.surface])
  })

  it('sets all three properties for any accent', () => {
    const calls: Array<[string, string]> = []
    const element = {
      style: {
        setProperty: (prop: string, value: string) => {
          calls.push([prop, value])
        },
      } as any,
    }
    applyAccent('green', element)
    expect(calls).toHaveLength(3)
    const props = calls.map(([prop]) => prop)
    expect(props).toContain('--accent')
    expect(props).toContain('--accent-hover')
    expect(props).toContain('--accent-surface')
  })

  it('matches the accent table values exactly', () => {
    const accentKeys: AccentKey[] = ['green', 'blue', 'sienna', 'charcoal']
    accentKeys.forEach((key) => {
      const calls: Array<[string, string]> = []
      const element = {
        style: {
          setProperty: (prop: string, value: string) => {
            calls.push([prop, value])
          },
        } as any,
      }
      applyAccent(key, element)
      const expected = ACCENTS[key]
      expect(calls).toContainEqual(['--accent', expected.accent])
      expect(calls).toContainEqual(['--accent-hover', expected.hover])
      expect(calls).toContainEqual(['--accent-surface', expected.surface])
    })
  })
})
