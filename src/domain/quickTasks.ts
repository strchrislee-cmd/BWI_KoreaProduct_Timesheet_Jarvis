// Quick add (빠른 등록 in Korean; formerly 빠른 등록 / 반복 업무): saved Project · Type · Task combinations a user
// applies to rows of the 30-min log in one click.
import type { TaskTemplate } from './types'

/** the name inside Korean sentences; the window title follows the screen language (tr('Quick add')) */
export const QUICK_TASKS = '빠른 등록'
/** shown for a quick task saved without a Task (instead of falling back to the project's name) */
export const EMPTY_TASK_LABEL = '(내용 없음)'

export const quickTaskName = (t: Pick<TaskTemplate, 'description'>) => t.description.trim() || EMPTY_TASK_LABEL

/** preset slots (e.g. one per quarter): each keeps its own quick-add items, one is in use */
export const QUICK_SLOTS = 4

export interface QuickSlots {
  /** the slot in use, 0 … QUICK_SLOTS − 1 */
  active: number
  /** optional names ('' = the default 1Q … 4Q) */
  names: string[]
  /** quick-add item id → its slot; items not listed are in slot 0 (everything saved before slots) */
  of: Record<string, number>
}

export const DEFAULT_QUICK_SLOTS: QuickSlots = { active: 0, names: ['', '', '', ''], of: {} }
export const slotOf = (slots: QuickSlots, id: string) => slots.of[id] ?? 0
/** default names follow the quarters (1Q … 4Q); a name the user gave wins */
export const defaultSlotName = (i: number) => `${i + 1}Q`
export const slotLabel = (slots: QuickSlots, i: number) => slots.names[i]?.trim() || defaultSlotName(i)
const slotIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < QUICK_SLOTS

/** Saved slots, read defensively. */
export function readQuickSlots(v: unknown): QuickSlots {
  const r = (v ?? {}) as Record<string, unknown>
  const names = Array.isArray(r.names) ? r.names : []
  const of = r.of && typeof r.of === 'object' ? (r.of as Record<string, unknown>) : {}
  return {
    active: slotIndex(r.active) ? r.active : 0,
    names: Array.from({ length: QUICK_SLOTS }, (_, i) => (typeof names[i] === 'string' ? (names[i] as string).trim().slice(0, 20) : '')),
    of: Object.fromEntries(Object.entries(of).filter((e): e is [string, number] => slotIndex(e[1]) && e[1] !== 0)),
  }
}

/** asked before saving a row whose Task is empty */
export const EMPTY_TASK_CONFIRM = `Task(업무)가 비어 있습니다. 그래도 ${QUICK_TASKS}에 저장할까요?\n목록에는 "${EMPTY_TASK_LABEL}"으로 보입니다.`
