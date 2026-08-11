export function moveIdTo<T>(ids: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length || fromIndex === toIndex) return [...ids]
  const result = [...ids]
  const [item] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, item)
  return result
}

export function insertIdBefore<T>(ids: readonly T[], id: T, beforeId: T | null): T[] {
  const without = ids.filter((item) => item !== id)
  const index = beforeId === null ? without.length : Math.max(0, without.indexOf(beforeId))
  without.splice(index, 0, id)
  return without
}
