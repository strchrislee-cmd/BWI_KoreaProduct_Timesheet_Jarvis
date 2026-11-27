// POST /api/ai/cleanup { date, owner_id? }: AI 정리 of one day's 30-min log with the company's Claude key.
// The server loads the day itself, checks who may ask (yourself, or someone you may send proposals to),
// counts the use against the daily limit and records tokens and cost. The answer is a list of proposed
// changes; nothing is written to the log here (the person applies what they accept).
import { AI_MODEL, changedFields, costUsd, fieldsOf, runTime, slotRuns, type AiCleanupResult, type ProposalItem, type Run, type TaskFields } from '../../src/domain/aiCleanup.js'
import type { TimeSlot } from '../../src/domain/types.js'

export interface DayContext {
  slots: TimeSlot[]
  projects: { id: string; name: string }[]
  types: { id: string; name: string }[]
  /** the person's usual Task names (recent days, quick add), to keep naming consistent */
  vocabulary: string[]
}

export interface ModelRequest {
  system: string
  user: string
  schema: Record<string, unknown>
}
export interface ModelAnswer {
  json: unknown
  refused: boolean
  input_tokens: number
  output_tokens: number
}

export interface AiCleanupDeps {
  /** the signed-in user (from the bearer token), or null */
  userId: string | null
  settings(): Promise<{ enabled: boolean; dailyLimit: number }>
  canPropose(author: string, owner: string): Promise<boolean>
  apiKey(): Promise<string | null>
  loadDay(owner: string, date: string): Promise<DayContext>
  /** records one use if today's count is under the limit; null when it is not */
  begin(user: string, owner: string, date: string, model: string, limit: number): Promise<number | null>
  finish(id: number, usage: AiCleanupResult['usage']): Promise<void>
  /** a use that failed before the model answered does not count */
  release(id: number): Promise<void>
  usedToday(user: string): Promise<number>
  /** throws an Error with a message for the person when the call fails */
  callModel(key: string, req: ModelRequest): Promise<ModelAnswer>
}

type Out = { status: number; body: AiCleanupResult | { error: string } }

const SYSTEM = `You tidy one person's 30-minute work log for a Korean engineering team. The log is given as runs: half hours in a row with the same Project, Type and Task.
Suggest a change only when it clearly makes the log more correct or consistent:
- Project: a run may have unmapped project text (text:"..."). Pick the matching project from the list when one clearly fits; otherwise leave it. Move a run that already has a project only when its Task plainly belongs to another listed project.
- Type: fill an empty Type when the Task clearly implies one from the list. Do not change a Type that is already set unless it plainly contradicts the Task.
- Task: fix typos, spacing and inconsistent naming, preferring the person's usual task names when they mean the same thing. Keep the meaning and the language, keep it short, never invent details.
Never change times. Return only the runs that change; return an empty list when nothing needs changing.
For each change: run = the run number; project = a project id from the list, or null to keep the run's project; type = a type id from the list, or null to keep the run's type; task = the Task text to use (the same text when it does not change); reason = one short sentence in Korean.`

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          run: { type: 'integer' },
          project: { type: ['string', 'null'] },
          type: { type: ['string', 'null'] },
          task: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['run', 'project', 'type', 'task', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['changes'],
  additionalProperties: false,
}

const oneLine = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)

/** The request for the model: short ids (p1, t1) stand for projects and types to keep the prompt small. */
export function buildRequest(runs: Run[], day: DayContext): ModelRequest & { projectIds: Map<string, string>; typeIds: Map<string, string> } {
  const projectIds = new Map(day.projects.map((p, i) => [`p${i + 1}`, p.id]))
  const typeIds = new Map(day.types.map((t, i) => [`t${i + 1}`, t.id]))
  const pShort = new Map(day.projects.map((p, i) => [p.id, `p${i + 1}`]))
  const tShort = new Map(day.types.map((t, i) => [t.id, `t${i + 1}`]))
  const project = (r: TaskFields) => (r.group_project_id ? (pShort.get(r.group_project_id) ?? '(other project)') : r.label ? `text:"${oneLine(r.label, 80)}"` : '-')
  const user = [
    'Projects (id | name):',
    ...day.projects.map((p, i) => `p${i + 1} | ${oneLine(p.name, 120)}`),
    '',
    'Types (id | name):',
    ...day.types.map((t, i) => `t${i + 1} | ${oneLine(t.name, 60)}`),
    '',
    `Usual task names: ${day.vocabulary.map((v) => oneLine(v, 60)).join(' ; ') || '-'}`,
    '',
    'Runs (run | time | project | type | task):',
    ...runs.map((r, i) => `${i} | ${runTime(r.slots)} | ${project(r)} | ${r.work_type_id ? (tShort.get(r.work_type_id) ?? '-') : '-'} | ${oneLine(r.description, 200) || '-'}`),
  ].join('\n')
  return { system: SYSTEM, user, schema: SCHEMA, projectIds, typeIds }
}

/** The model's changes as proposal items; unknown runs or ids and changes that change nothing are dropped. */
export function readChanges(json: unknown, runs: Run[], projectIds: Map<string, string>, typeIds: Map<string, string>): ProposalItem[] {
  const changes = (json as { changes?: unknown })?.changes
  if (!Array.isArray(changes)) return []
  const seen = new Set<number>()
  const items: ProposalItem[] = []
  for (const c of changes as Record<string, unknown>[]) {
    const i = c?.run
    if (typeof i !== 'number' || !Number.isInteger(i) || !runs[i] || seen.has(i)) continue
    const before = fieldsOf(runs[i])
    const projectId = typeof c.project === 'string' ? projectIds.get(c.project) : undefined
    const typeId = typeof c.type === 'string' ? typeIds.get(c.type) : undefined
    const task = typeof c.task === 'string' ? oneLine(c.task, 200) : ''
    const after = fieldsOf({
      group_project_id: projectId ?? before.group_project_id,
      label: projectId ? '' : before.label,
      work_type_id: typeId ?? before.work_type_id,
      description: task || before.description,
    })
    if (!changedFields(before, after).length) continue
    seen.add(i)
    items.push({ slots: runs[i].slots, before, after, reason: typeof c.reason === 'string' ? oneLine(c.reason, 200) : '' })
  }
  return items
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function aiCleanupCore(body: Record<string, unknown>, deps: AiCleanupDeps): Promise<Out> {
  const user = deps.userId
  if (!user) return { status: 401, body: { error: '로그인이 필요합니다.' } }
  const date = typeof body.date === 'string' && DATE.test(body.date) ? body.date : null
  if (!date) return { status: 400, body: { error: '날짜가 필요합니다.' } }
  const owner = typeof body.owner_id === 'string' && body.owner_id ? body.owner_id : user

  const settings = await deps.settings()
  if (!settings.enabled) return { status: 403, body: { error: 'AI 정리가 꺼져 있습니다. 관리자에게 알려 주세요.' } }
  if (owner !== user && !(await deps.canPropose(user, owner))) return { status: 403, body: { error: '이 사람의 기록에는 제안할 수 없습니다.' } }
  const key = await deps.apiKey()
  if (!key) return { status: 503, body: { error: 'AI 키가 아직 없습니다. 관리자에게 알려 주세요.' } }

  const day = await deps.loadDay(owner, date)
  const runs = slotRuns(day.slots)
  const zero = { input_tokens: 0, output_tokens: 0, cost_usd: 0 }
  if (!runs.length) return { status: 200, body: { items: [], remaining: Math.max(0, settings.dailyLimit - (await deps.usedToday(user))), usage: zero } }

  const id = await deps.begin(user, owner, date, AI_MODEL, settings.dailyLimit)
  if (id === null) return { status: 429, body: { error: `오늘 AI 정리 ${settings.dailyLimit}회를 모두 썼습니다. 내일 다시 쓸 수 있습니다.` } }

  const req = buildRequest(runs, day)
  let answer: ModelAnswer
  try {
    answer = await deps.callModel(key, req)
  } catch (e) {
    await deps.release(id)
    return { status: 502, body: { error: (e as Error).message || 'AI에 연결하지 못했습니다.' } }
  }
  const usage = { input_tokens: answer.input_tokens, output_tokens: answer.output_tokens, cost_usd: costUsd(answer.input_tokens, answer.output_tokens) }
  await deps.finish(id, usage)
  if (answer.refused || answer.json === null) return { status: 502, body: { error: 'AI가 이번 요청에 답하지 않았습니다. 잠시 후 다시 해 주세요.' } }
  const items = readChanges(answer.json, runs, req.projectIds, req.typeIds)
  return { status: 200, body: { items, remaining: Math.max(0, settings.dailyLimit - (await deps.usedToday(user))), usage } }
}
