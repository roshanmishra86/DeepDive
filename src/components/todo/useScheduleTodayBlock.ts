import type { BlockKind } from '../../db/types'
import { previewTodaySchedule, type TodaySchedulePreview } from '../../lib/scheduling'
import { useAppStore } from '../../stores/app'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { useTodayBlocks } from '../../stores/useTodayBlocks'

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
  const blocks = useTodayBlocks()
  const day = useDayStore((state) => state.currentDay)
  const shutdownMin = useDayStore((state) => state.shutdownMin)
  const addBlock = useBlocksStore((state) => state.addBlock)
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
    const id = await addBlock(day, { ...draft, fromMin })
    if (id === null) return { ok: false, preview: placement }
    setView('today')
    return { ok: true, preview: placement }
  }

  return { preview, schedule }
}
