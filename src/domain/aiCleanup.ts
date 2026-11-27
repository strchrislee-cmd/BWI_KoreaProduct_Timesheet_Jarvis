// AI 정리 and correction proposals (migration 0014): a day's 30-min log as runs of the same task, the
// changes proposed for a run (Project / Type / Task), and applying the accepted ones. Shared by the
// browser and the server (/api/ai/cleanup), so imports carry .js.
import { slotToTime } from './time.js'
import type { TimeSlot } from './types.js'

/** the cheapest Claude model (an admin choice, see org_settings.ai_model); US$ per million tokens */
export const AI_MODEL = 'claude-haiku-5-5'
export const AI_PRICE = { input: 0.1, output: 0.5 }
export const costUsd = (input: number, output: number) => (input * AI_PRICE.input + output * AI_PRICE.output) / 1_000_000

/** what AI 정리 and proposals change: the Project (or unmapped text), the Type and the Task */
export interface TaskFields {
  group_project_id: string | null
  label: string
  work_type_id: string | null
  description: string
}

/** half hours in a row with the same Project · Type · Task */
export interface Run extends TaskFields {
  slots: number[]
}

/** one proposed change: the run's half hours, how they read, how they should read, and why */
export interface ProposalItem {
  slots: number[]
  before: TaskFields
  after: TaskFields
  reason: string
}

export interface CorrectionProposal {
  id: string
  owner_id: string
  author_id: string
  work_date: string
  items: ProposalItem[]
  note: string
  by_ai: boolean
  status: 'open' | 'answered'
  /** indexes of the items the person applied */
  applied: number[] | null
  created_at: string
  answered_at: string | null
}

export interface AiUsage {
  id: number
  user_id: string
  owner_id: string | null
  work_date: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  created_at: string
}

/** what the server answers: the proposed changes, and how many uses are left today */
export interface AiCleanupResult {
  items: ProposalItem[]
  remaining: number
  usage: { input_tokens: number; output_tokens: number; cost_usd: number }
}

export const fieldsOf = (s: TaskFields): TaskFields => ({
  group_project_id: s.group_project_id,
  label: s.group_project_id ? '' : s.label.trim(),
  work_type_id: s.work_type_id,
  description: s.description.trim(),
})

/** same Project (a mapped project ignores the typed text), Type and Task */
export function sameFields(a: TaskFields, b: TaskFields): boolean {
  const x = fieldsOf(a)
  const y = fieldsOf(b)
  return x.group_project_id === y.group_project_id && x.label === y.label && x.work_type_id === y.work_type_id && x.description === y.description
}

const hasTask = (s: TimeSlot) => s.kind === 'work' && !!(s.group_project_id || s.label.trim() || s.description.trim())

/** the day's work as runs (lunch, breaks and empty half hours are left out) */
export function slotRuns(slots: TimeSlot[]): Run[] {
  const runs: Run[] = []
  for (const s of [...slots].filter(hasTask).sort((a, b) => a.slot_index - b.slot_index)) {
    const last = runs[runs.length - 1]
    if (last && last.slots[last.slots.length - 1] === s.slot_index - 1 && sameFields(last, s)) last.slots.push(s.slot_index)
    else runs.push({ ...fieldsOf(s), slots: [s.slot_index] })
  }
  return runs
}

/** 09:00–11:00 for the half hours 18..21 */
export const runTime = (slots: number[]) => `${slotToTime(slots[0])}–${slotToTime(slots[slots.length - 1] + 1)}`

export type ChangedField = 'project' | 'type' | 'task'
export function changedFields(before: TaskFields, after: TaskFields): ChangedField[] {
  const b = fieldsOf(before)
  const a = fieldsOf(after)
  const out: ChangedField[] = []
  if (b.group_project_id !== a.group_project_id || b.label !== a.label) out.push('project')
  if (b.work_type_id !== a.work_type_id) out.push('type')
  if (b.description !== a.description) out.push('task')
  return out
}

const isFields = (v: unknown): v is TaskFields => {
  const f = v as Record<string, unknown> | null
  return (
    !!f &&
    (f.group_project_id === null || typeof f.group_project_id === 'string') &&
    typeof f.label === 'string' &&
    (f.work_type_id === null || typeof f.work_type_id === 'string') &&
    typeof f.description === 'string'
  )
}

/** items read back from a stored proposal, defensively (anything malformed is left out) */
export function readItems(v: unknown): ProposalItem[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((x) => {
    const i = x as Record<string, unknown>
    const slots = Array.isArray(i?.slots) ? i.slots.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 48) : []
    if (!slots.length || !isFields(i.before) || !isFields(i.after)) return []
    return [{ slots, before: fieldsOf(i.before), after: fieldsOf(i.after), reason: typeof i.reason === 'string' ? i.reason : '' }]
  })
}

/**
 * The slots after applying the accepted items. A half hour changed since the proposal was made (it no
 * longer reads as `before`) is left as it is; `skipped` counts the items with such half hours.
 */
export function applyItems(saved: Map<number, TimeSlot>, items: ProposalItem[]): { slots: TimeSlot[]; skipped: number } {
  const out: TimeSlot[] = []
  let skipped = 0
  for (const item of items) {
    let missed = false
    for (const i of item.slots) {
      const cur = saved.get(i)
      if (!cur || cur.kind !== 'work' || !sameFields(cur, item.before)) {
        missed = true
        continue
      }
      out.push({ ...cur, ...fieldsOf(item.after) })
    }
    if (missed) skipped++
  }
  return { slots: out, skipped }
}

/** start of today in Korea (uses are counted per Korean day, as in ai_begin) */
export function koreaDayStart(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 3_600_000)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3_600_000)
}
