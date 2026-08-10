import { describe, expect, it } from 'vitest'
import { insertIdBefore, moveIdTo } from './dragList'

describe('drag list helpers', () => {
  it('previews a long move without mutating the source ids', () => {
    const ids = [1, 2, 3, 4]
    expect(moveIdTo(ids, 0, 3)).toEqual([2, 3, 4, 1])
    expect(ids).toEqual([1, 2, 3, 4])
  })

  it('inserts by id for grouped drop targets', () => {
    expect(insertIdBefore([1, 2, 3], 3, 2)).toEqual([1, 3, 2])
    expect(insertIdBefore([1, 2, 3], 1, null)).toEqual([2, 3, 1])
  })
})
