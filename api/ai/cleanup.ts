import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AI_MODEL, koreaDayStart } from '../../src/domain/aiCleanup.js'
import { addDays } from '../../src/domain/time.js'
import type { TimeSlot } from '../../src/domain/types.js'
import { aiCleanupCore, type ModelAnswer, type ModelRequest } from '../_lib/aiCleanupCore.js'
import { adminClient } from '../_lib/server.js'

/** Claude with the company key: structured JSON, low effort (a small, simple job). */
async function callModel(key: string, req: ModelRequest): Promise<ModelAnswer> {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 25_000 })
  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      system: req.system,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
      messages: [{ role: 'user', content: req.user }],
    })
    const u = msg.usage
    const input_tokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
    if (msg.stop_reason === 'refusal') return { json: null, refused: true, input_tokens, output_tokens: u.output_tokens }
    const text = msg.content.find((b) => b.type === 'text')
    let json: unknown = null
    try {
      json = text && text.type === 'text' ? JSON.parse(text.text) : null
    } catch {
      json = null
    }
    return { json, refused: false, input_tokens, output_tokens: u.output_tokens }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new Error('AI 키가 올바르지 않습니다. 관리자에게 알려 주세요.')
    if (e instanceof Anthropic.RateLimitError) throw new Error('AI 요청이 많습니다. 잠시 후 다시 해 주세요.')
    if (e instanceof Anthropic.APIConnectionError) throw new Error('AI에 연결하지 못했습니다. 잠시 후 다시 해 주세요.')
    if (e instanceof Anthropic.APIError) throw new Error(`AI 오류가 났습니다 (${e.status ?? '?'}). 잠시 후 다시 해 주세요.`)
    throw e
  }
}

/**
 * POST /api/ai/cleanup { date, owner_id? } with "Authorization: Bearer <access token>".
 * See api/_lib/aiCleanupCore.ts (who may ask, the daily limit, what is returned).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = adminClient()
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = token ? await sb.auth.getUser(token) : { data: { user: null } }
    const must = <T>(r: { data: T | null; error: { message: string } | null }): T | null => {
      if (r.error) throw new Error(r.error.message)
      return r.data
    }
    const list = <T>(r: { data: T[] | null; error: { message: string } | null }): T[] => must(r) ?? []
    const out = await aiCleanupCore((req.body ?? {}) as Record<string, unknown>, {
      userId: auth.user?.id ?? null,
      settings: async () => {
        const s = must(await sb.from('org_settings').select('ai_enabled, ai_daily_limit').eq('id', 1).single()) as { ai_enabled: boolean; ai_daily_limit: number } | null
        return { enabled: !!s?.ai_enabled, dailyLimit: Number(s?.ai_daily_limit ?? 0) }
      },
      canPropose: async (author, owner) => must(await sb.rpc('can_propose', { p_author: author, p_owner: owner })) === true,
      apiKey: async () => (must(await sb.rpc('get_ai_key')) as string | null) ?? null,
      loadDay: async (owner, date) => {
        const [slots, projects, types, recent, templates] = await Promise.all([
          sb.from('time_slots').select('*').eq('user_id', owner).eq('work_date', date),
          sb.from('group_projects').select('id, name').eq('status', 'active').eq('hidden', false).order('sort_order'),
          sb.from('work_types').select('id, name').eq('hidden', false).order('sort_order'),
          sb.from('time_slots').select('description').eq('user_id', owner).gte('work_date', addDays(date, -14)).lte('work_date', date).neq('description', ''),
          sb.from('task_templates').select('description').eq('user_id', owner).neq('description', ''),
        ])
        const names = [...list(templates), ...list(recent)].map((r) => String(r.description).trim()).filter(Boolean)
        return {
          slots: list(slots) as TimeSlot[],
          projects: list(projects),
          types: list(types),
          vocabulary: [...new Set(names)].slice(0, 40),
        }
      },
      begin: async (user, owner, date, model, limit) =>
        (must(await sb.rpc('ai_begin', { p_user: user, p_owner: owner, p_work_date: date, p_model: model, p_limit: limit })) as number | null) ?? null,
      finish: async (id, usage) => void must(await sb.from('ai_usage').update(usage).eq('id', id)),
      release: async (id) => void must(await sb.from('ai_usage').delete().eq('id', id)),
      usedToday: async (user) => {
        const { count, error } = await sb.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user).gte('created_at', koreaDayStart(new Date()).toISOString())
        if (error) throw new Error(error.message)
        return count ?? 0
      },
      callModel,
    })
    return res.status(out.status).json(out.body)
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
