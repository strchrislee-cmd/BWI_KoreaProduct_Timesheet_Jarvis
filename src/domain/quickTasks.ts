// Quick add (빠른 등록 in Korean; formerly 빠른 등록 / 반복 업무): saved Project · Type · Task combinations a user
// applies to rows of the 30-min log in one click.
import type { TaskTemplate } from './types'

/** the name inside Korean sentences; the window title follows the screen language (tr('Quick add')) */
export const QUICK_TASKS = '빠른 등록'
/** shown for a quick task saved without a Task (instead of falling back to the project's name) */
export const EMPTY_TASK_LABEL = '(내용 없음)'

export const quickTaskName = (t: Pick<TaskTemplate, 'description'>) => t.description.trim() || EMPTY_TASK_LABEL

/** asked before saving a row whose Task is empty */
export const EMPTY_TASK_CONFIRM = `Task(업무)가 비어 있습니다. 그래도 ${QUICK_TASKS}에 저장할까요?\n목록에는 "${EMPTY_TASK_LABEL}"으로 보입니다.`
