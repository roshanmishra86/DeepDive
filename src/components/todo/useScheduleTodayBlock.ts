import type { BlockKind } from '../../db/types'
import { previewTodaySchedule, type TodaySchedulePreview } from '../../lib/scheduling'
import { useAppStore } from '../../stores/app'
import { useTodayStore } from '../../stores/today'

export interface SchedulableTaskBlock {
  title: string
  kind: BlockKind
  durationMin: number
  pomodoros: number
  taskId: number
  subtaskId?: number
}

export interface ScheduleTodayResult {
  ok: boolean
  preview: TodaySchedulePreview
}

/** Shared creation action for week tasks and subtasks. */
export function useScheduleTodayBlock(now: Date) {
  const blocks = useTodayStore((state) => state.blocks)
  const shutdownMin = useTodayStore((state) => state.shutdownMin)
  const addBlock = useTodayStore((state) => state.addBlock)
  const setView = useAppStore((state) => state.setView)
  const fromMin = now.getHours() * 60 + now.getMinutes()

  const preview = (durationMin: number, subtask = false) => previewTodaySchedule(
    blocks,
    fromMin,
    durationMin,
    shutdownMin,
    subtask ? { minDurationMin: 15, stepMin: 15 } : undefined
  )

  const schedule = async (draft: SchedulableTaskBlock, subtask = false): Promise<ScheduleTodayResult> => {
    const placement = preview(draft.durationMin, subtask)
    if (!placement.valid || !placement.fits) return { ok: false, preview: placement }
    const id = await addBlock({ ...draft, fromMin })
    if (id === null) return { ok: false, preview: placement }
    setView('today')
    return { ok: true, preview: placement }
  }

  return { preview, schedule }
}
