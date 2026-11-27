import { KeyRound, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, ErrorNote, Field } from '../components/ui'
import { useStore } from '../data/StoreContext'
import { koreaDayStart } from '../domain/aiCleanup'
import type { OrgSettings, Profile } from '../domain/types'
import { useAsync } from '../lib/hooks'

const DAYS = 30
/** the AI tables are missing in the database (migration 0014 not run yet) */
const missing = (e: Error | null | undefined) => !!e && /ai_usage|ai_key_hint|schema cache|does not exist/i.test(e.message)

/**
 * Admin → AI: turn AI 정리 on, set the company's Anthropic API key (kept on the server, only its last 4
 * characters are shown), the uses per person per day, and who used how much in the last 30 days.
 */
export function AdminAi({ profiles }: { profiles: Profile[] }) {
  const { store } = useStore()
  const since = useMemo(() => new Date(Date.now() - DAYS * 86_400_000).toISOString(), [])
  const org = useAsync(() => store.getOrgSettings(), [store])
  const hint = useAsync(() => store.aiKeyHint(), [store])
  const usage = useAsync(() => store.listAiUsage(since), [store, since])
  const [form, setForm] = useState<OrgSettings | null>(null)
  useEffect(() => {
    if (org.data) setForm(org.data)
  }, [org.data])
  const [key, setKey] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState<Error | null>(null)

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn()
      setNotice(done)
      setError(null)
    } catch (e) {
      setError(e as Error)
      setNotice('')
    }
  }

  const today = koreaDayStart(new Date()).toISOString()
  const rows = profiles
    .map((p) => {
      const mine = (usage.data ?? []).filter((u) => u.user_id === p.id)
      return {
        p,
        today: mine.filter((u) => u.created_at >= today).length,
        uses: mine.length,
        tokens: mine.reduce((n, u) => n + u.input_tokens + u.output_tokens, 0),
        cost: mine.reduce((n, u) => n + u.cost_usd, 0),
      }
    })
    .filter((r) => r.uses > 0)
    .sort((a, b) => b.cost - a.cost)
  const total = rows.reduce((n, r) => n + r.cost, 0)

  if (missing(usage.error) || missing(hint.error)) {
    return (
      <Card title={<span className="flex items-center gap-2"><Sparkles size={18} /> AI 정리</span>}>
        <p className="rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="ai-setup">
          AI 정리를 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/0014_ai_assist.sql</code>을 한 번 실행해야 합니다.
        </p>
      </Card>
    )
  }

  return (
    <Card title={<span className="flex items-center gap-2"><Sparkles size={18} /> AI 정리</span>} action={<span className="text-xs text-muted">모델: Claude Haiku 5.5 (가장 저렴) · 회사 Anthropic 계정으로 청구</span>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]" data-testid="admin-ai">
        <div className="space-y-4">
          <ErrorNote error={error ?? org.error} />
          {notice && (
            <p className="rounded-control bg-sage px-3 py-1.5 text-sm font-semibold text-primary" role="status">
              {notice}
            </p>
          )}
          {form && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => store.updateOrgSettings({ ai_enabled: form.ai_enabled, ai_daily_limit: form.ai_daily_limit }), 'AI 설정을 저장했습니다')
              }}
            >
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" aria-label="Enable AI cleanup" checked={form.ai_enabled} onChange={(e) => setForm({ ...form, ai_enabled: e.target.checked })} />
                AI 정리 쓰기 (직원은 Daily Log의 AI 정리 버튼으로 자기 기록만)
              </label>
              <Field label="1인당 하루 사용 횟수">
                <input
                  type="number"
                  min={0}
                  max={200}
                  aria-label="Daily AI uses per person"
                  className="field"
                  value={form.ai_daily_limit}
                  onChange={(e) => setForm({ ...form, ai_daily_limit: Math.max(0, Math.min(200, Math.round(Number(e.target.value) || 0))) })}
                />
              </Field>
              <Button type="submit" variant="outline">
                설정 저장
              </Button>
            </form>
          )}
          <form
            className="space-y-2 border-t border-black/10 pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await store.setAiKey(key)
                setKey('')
                hint.reload()
              }, 'API 키를 저장했습니다')
            }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound size={16} /> Anthropic API 키
            </div>
            <p className="text-sm" data-testid="ai-key-hint">
              {hint.data ? (
                <>
                  저장된 키: <code>{hint.data}</code>
                </>
              ) : (
                <span className="text-muted">저장된 키가 없습니다</span>
              )}
            </p>
            <input
              type="password"
              autoComplete="off"
              aria-label="Anthropic API key"
              className="field"
              placeholder="sk-ant-… (새 키를 넣으면 바뀝니다)"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={key.trim().length < 20}>
                키 저장
              </Button>
              {hint.data && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => window.confirm('저장된 API 키를 지울까요? AI 정리가 멈춥니다.') && void run(async () => (await store.setAiKey(null), hint.reload()), 'API 키를 지웠습니다')}
                >
                  키 지우기
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">키는 서버에만 저장되고 화면·브라우저에는 다시 보이지 않습니다(끝 4자리만). Claude Console(platform.claude.com)에서 회사 계정으로 발급하세요.</p>
          </form>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold">최근 {DAYS}일 사용량</h3>
          <ErrorNote error={usage.error} />
          {rows.length === 0 ? (
            <p className="text-sm text-muted">아직 사용 기록이 없습니다.</p>
          ) : (
            <table className="sheet w-full text-sm" aria-label="AI usage by person">
              <thead>
                <tr>
                  <th>사람</th>
                  <th className="num">오늘</th>
                  <th className="num">{DAYS}일</th>
                  <th className="num">토큰</th>
                  <th className="num">비용 (US$)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.id} data-testid="ai-usage-row" data-person={r.p.name}>
                    <td>{r.p.name}</td>
                    <td className="num">
                      {r.today} / {form?.ai_daily_limit ?? '–'}
                    </td>
                    <td className="num">{r.uses}</td>
                    <td className="num">{r.tokens.toLocaleString()}</td>
                    <td className="num">{r.cost.toFixed(4)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>합계</td>
                  <td className="num" />
                  <td className="num">{rows.reduce((n, r) => n + r.uses, 0)}</td>
                  <td className="num">{rows.reduce((n, r) => n + r.tokens, 0).toLocaleString()}</td>
                  <td className="num">{total.toFixed(4)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Card>
  )
}
