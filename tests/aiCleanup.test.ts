import { describe, expect, it } from 'vitest'
import { aiCleanupCore, buildRequest, readChanges, type AiCleanupDeps, type DayContext } from '../api/_lib/aiCleanupCore'
import { applyItems, changedFields, costUsd, koreaDayStart, readItems, runTime, slotRuns, type ProposalItem } from '../src/domain/aiCleanup'
import type { TimeSlot } from '../src/domain/types'

const slot = (i: number, p: Partial<TimeSlot>): TimeSlot =>
  ({ user_id: 'u', work_date: '2026-11-27', slot_index: i, kind: 'work', group_project_id: null, label: '', description: '', details: '', focus: null, work_type_id: null, ...p }) as TimeSlot

const day: DayContext = {
  slots: [
    slot(18, { label: '회의', description: '주간 회의' }),
    slot(19, { label: '회의', description: '주간 회의' }),
    slot(20, { group_project_id: 'P-design', description: '도면검토' }),
    slot(24, { kind: 'nonwork', label: '점심' }),
    slot(26, { group_project_id: 'P-design', description: '도면검토' }),
  ],
  projects: [{ id: 'P-meeting', name: '회의(개발, 품질)' }, { id: 'P-design', name: '설계 프로젝트' }],
  types: [{ id: 'T-int', name: '회의-INT' }],
  vocabulary: ['도면 검토'],
}

describe('AI 정리: runs, diffs, applying', () => {
  it('a day as runs of the same Project · Type · Task (lunch and gaps split runs)', () => {
    const runs = slotRuns(day.slots)
    expect(runs.map((r) => [r.slots, r.label || r.group_project_id, r.description])).toEqual([
      [[18, 19], '회의', '주간 회의'],
      [[20], 'P-design', '도면검토'],
      [[26], 'P-design', '도면검토'],
    ])
    expect(runTime([18, 19])).toBe('09:00–10:00')
  })

  it('what changed, and stored items read defensively', () => {
    const before = { group_project_id: null, label: '회의', work_type_id: null, description: '주간 회의' }
    expect(changedFields(before, { ...before, group_project_id: 'P-meeting', label: '' })).toEqual(['project'])
    expect(changedFields(before, { ...before, work_type_id: 'T-int', description: '주간회의' })).toEqual(['type', 'task'])
    expect(readItems([{ slots: [18, 99], before, after: before, reason: 'r' }, { slots: [], before, after: before }, 'junk'])).toEqual([{ slots: [18], before, after: before, reason: 'r' }])
  })

  it('applies accepted items, but not to half hours changed since', () => {
    const saved = new Map(day.slots.map((s) => [s.slot_index, s]))
    saved.set(19, slot(19, { label: '회의', description: '다른 걸로 바꿈' }))
    const item: ProposalItem = {
      slots: [18, 19],
      before: { group_project_id: null, label: '회의', work_type_id: null, description: '주간 회의' },
      after: { group_project_id: 'P-meeting', label: '', work_type_id: 'T-int', description: '주간 회의' },
      reason: '',
    }
    const out = applyItems(saved, [item])
    expect(out.slots.map((s) => [s.slot_index, s.group_project_id, s.label, s.work_type_id])).toEqual([[18, 'P-meeting', '', 'T-int']])
    expect(out.skipped).toBe(1)
  })

  it('uses are counted per Korean day; cost of the cheapest model', () => {
    expect(koreaDayStart(new Date('2026-11-27T16:30:00Z')).toISOString()).toBe('2026-11-27T15:00:00.000Z') // 01:30 KST on the 28th
    expect(koreaDayStart(new Date('2026-11-27T14:30:00Z')).toISOString()).toBe('2026-11-26T15:00:00.000Z')
    expect(costUsd(4000, 600)).toBeCloseTo(0.0007, 6)
  })

  it('the prompt uses short ids, and the answer maps back (unknown ids, runs and no-ops dropped)', () => {
    const runs = slotRuns(day.slots)
    const req = buildRequest(runs, day)
    expect(req.user).toContain('p1 | 회의(개발, 품질)')
    expect(req.user).toContain('0 | 09:00–10:00 | text:"회의" | - | 주간 회의')
    expect(req.user).not.toContain('P-design')
    const items = readChanges(
      {
        changes: [
          { run: 0, project: 'p1', type: 't1', task: '주간 회의', reason: '회의 섹션' },
          { run: 1, project: null, type: null, task: '도면 검토', reason: '띄어쓰기' },
          { run: 2, project: 'p9', type: 'x', task: '도면검토', reason: '바뀐 게 없음' },
          { run: 7, project: 'p1', type: null, task: 'x', reason: '' },
          { run: 0, project: 'p2', type: null, task: 'dup', reason: '' },
        ],
      },
      runs,
      req.projectIds,
      req.typeIds,
    )
    expect(items.map((i) => [i.slots, i.after.group_project_id, i.after.label, i.after.work_type_id, i.after.description, i.reason])).toEqual([
      [[18, 19], 'P-meeting', '', 'T-int', '주간 회의', '회의 섹션'],
      [[20], 'P-design', '', null, '도면 검토', '띄어쓰기'],
    ])
  })
})

function deps(over: Partial<AiCleanupDeps> = {}) {
  const log: string[] = []
  let used = 0
  const d: AiCleanupDeps = {
    userId: 'u',
    settings: async () => ({ enabled: true, dailyLimit: 3 }),
    canPropose: async (a, o) => a === 'lead' && o === 'u',
    apiKey: async () => 'sk-ant-test',
    loadDay: async () => day,
    begin: async (user, owner) => (log.push(`begin:${user}:${owner}`), used < 3 ? (used++, 1) : null),
    finish: async (_, usage) => void log.push(`finish:${usage.input_tokens}/${usage.output_tokens}`),
    release: async () => void (log.push('release'), used--),
    usedToday: async () => used,
    callModel: async () => ({ json: { changes: [{ run: 0, project: 'p1', type: null, task: '주간 회의', reason: '회의 섹션' }] }, refused: false, input_tokens: 900, output_tokens: 120 }),
    ...over,
  }
  return { d, log }
}

describe('POST /api/ai/cleanup core', () => {
  it('your own day: proposed changes, the use recorded with tokens and cost, uses left', async () => {
    const { d, log } = deps()
    const out = await aiCleanupCore({ date: '2026-11-27' }, d)
    expect(out.status).toBe(200)
    const body = out.body as { items: ProposalItem[]; remaining: number; usage: { cost_usd: number } }
    expect(body.items).toHaveLength(1)
    expect(body.remaining).toBe(2)
    expect(body.usage.cost_usd).toBeCloseTo(costUsd(900, 120), 8)
    expect(log).toEqual(['begin:u:u', 'finish:900/120'])
  })

  it('refuses: not signed in, no date, AI off, no key, someone you may not propose to', async () => {
    expect((await aiCleanupCore({ date: '2026-11-27' }, deps({ userId: null }).d)).status).toBe(401)
    expect((await aiCleanupCore({}, deps().d)).status).toBe(400)
    expect((await aiCleanupCore({ date: '2026-11-27' }, deps({ settings: async () => ({ enabled: false, dailyLimit: 3 }) }).d)).status).toBe(403)
    expect((await aiCleanupCore({ date: '2026-11-27' }, deps({ apiKey: async () => null }).d)).status).toBe(503)
    expect((await aiCleanupCore({ date: '2026-11-27', owner_id: 'other' }, deps().d)).status).toBe(403)
    // a lead may ask for a proposal for someone below them
    expect((await aiCleanupCore({ date: '2026-11-27', owner_id: 'u' }, deps({ userId: 'lead' }).d)).status).toBe(200)
  })

  it('the daily limit; an empty day or a failed call does not use it up', async () => {
    const { d, log } = deps()
    for (let i = 0; i < 3; i++) expect((await aiCleanupCore({ date: '2026-11-27' }, d)).status).toBe(200)
    const over = await aiCleanupCore({ date: '2026-11-27' }, d)
    expect(over).toEqual({ status: 429, body: { error: '오늘 AI 정리 3회를 모두 썼습니다. 내일 다시 쓸 수 있습니다.' } })

    const empty = deps({ loadDay: async () => ({ ...day, slots: [] }) })
    expect((await aiCleanupCore({ date: '2026-11-27' }, empty.d)).body).toMatchObject({ items: [], remaining: 3 })
    expect(empty.log).toEqual([])

    const failing = deps({ callModel: async () => Promise.reject(new Error('AI에 연결하지 못했습니다.')) })
    expect(await aiCleanupCore({ date: '2026-11-27' }, failing.d)).toEqual({ status: 502, body: { error: 'AI에 연결하지 못했습니다.' } })
    expect(failing.log).toEqual(['begin:u:u', 'release'])
    expect(log.filter((l) => l.startsWith('finish'))).toHaveLength(3)
  })

  it('a refusal is billed and reported, not applied', async () => {
    const { d, log } = deps({ callModel: async () => ({ json: null, refused: true, input_tokens: 500, output_tokens: 10 }) })
    const out = await aiCleanupCore({ date: '2026-11-27' }, d)
    expect(out.status).toBe(502)
    expect(log).toEqual(['begin:u:u', 'finish:500/10'])
  })
})
