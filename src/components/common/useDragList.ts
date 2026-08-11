import { useCallback, useState } from 'react'

export interface DragListState<T> {
  sourceId: T | null
  targetIndex: number | null
}

export function useDragList<T>() {
  const [drag, setDrag] = useState<DragListState<T>>({ sourceId: null, targetIndex: null })
  const start = useCallback((sourceId: T) => setDrag({ sourceId, targetIndex: null }), [])
  const over = useCallback((targetIndex: number) => setDrag((state) => ({ ...state, targetIndex })), [])
  const clear = useCallback(() => setDrag({ sourceId: null, targetIndex: null }), [])
  return { drag, start, over, clear }
}
