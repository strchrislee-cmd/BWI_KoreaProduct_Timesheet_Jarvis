import { Eye, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Button, Card, ErrorNote, Pill, cx } from '../../components/ui'
import { LocalStore } from '../../data/localStore'
import { useStore, useUser } from '../../data/StoreContext'
import { GRANT_HOURS, canPropose, canRequest, managerOptions, orgRows, requestState } from '../../domain/org'
import { roleLabel } from '../../domain/roles'
import type { Profile } from '../../domain/types'
import { useTimesheets } from './TimesheetsLayout'
import { useAsync } from '../../lib/hooks'
import { ProposalDiff, fieldNames } from './ProposalDiff'
import type { CorrectionProposal } from '../../domain/aiCleanup'

const LEVEL_TONE = { admin: 'orange', l3: 'blue', l2: 'yellow', l1: 'grey' } as const

const untilText = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Org Chart: everyone sees the whole organisation (reporting line + team). Admins set each person's
 * manager and team. An L2 reads the L1s below them and an L3 the L2s and L1s below them; an L1 asks an
 * L2 to read their time, and that L2 approves for 1 hour, 1 day or 1 week (or declines).
 */
export function OrgChart() {
  const { store } = useStore()
  const user = useUser()
  const { search } = useLocation()
  const { date, profiles, visible, requests, orgReady, reloadMaster, projects, workTypes } = useTimesheets()
  const proposalsQ = useAsync(() => store.listProposals().catch(() => [] as CorrectionProposal[]), [store])
  const sent = (proposalsQ.data ?? []).filter((p) => p.author_id === user.id)
  const canSend = profiles.some((p) => canPropose(user, p, profiles))
  const [openSent, setOpenSent] = useState<string | null>(null)
  const names = fieldNames(new Map(projects.map((p) => [p.id, p])), new Map(workTypes.map((w) => [w.id, w])))
  const [error, setError] = useState<Error | null>(null)
  const isAdmin = user.role === 'admin'
  const now = new Date()
  const byId = new Map(profiles.map((p) => [p.id, p]))
  const teams = [...new Set(profiles.map((p) => p.team).filter(Boolean))].sort()
  const received = requests.filter((r) => r.owner_id === user.id && r.status === 'pending')

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
      setError(null)
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  const viewLink = (p: Profile) => {
    const q = new URLSearchParams(search)
    q.set('eng', p.id)
    q.set('date', date)
    return { pathname: '/timesheets', search: `?${q}` }
  }

  function requestCell(p: Profile) {
    if (!canRequest(user, p)) return null
    const st = requestState(requests, user.id, p.id, now)
    if (st.state === 'pending') return <Pill tone="yellow">요청 중</Pill>
    if (st.state === 'approved') return <span className="text-xs text-muted">{untilText(st.until!)}까지 열람</span>
    return (
      <Button variant="outline" className="!px-2 !py-0.5 text-xs" onClick={() => void run(() => store.requestAccess(p.id))} aria-label={`Ask ${p.name} for access`}>
        {st.state === 'denied' ? '거절됨 · 다시 요청' : st.state === 'expired' ? '기간 끝 · 다시 요청' : '열람 요청'}
      </Button>
    )
  }

  if (!orgReady) {
    return (
      <Card title="조직도">
        <p className="rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="org-setup">
          조직도와 단계별 열람을 쓰려면 관리자가 Supabase SQL Editor에서 <code>supabase/migrations/0013_org_access.sql</code>을 한 번 실행해야 합니다. 그 전까지는 모두 자기 기록만 봅니다.
        </p>
      </Card>
    )
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card
        title={
          <span className="flex items-center gap-2">
            <Users size={18} /> 조직도
          </span>
        }
        action={<span className="text-xs text-muted">L2는 아래 L1, L3는 아래 L2·L1의 기록을 볼 수 있습니다 (읽기 전용){isAdmin && ' · 관리자만 보고 라인과 팀을 바꿉니다'}</span>}
      >
        <ErrorNote error={error} />
        {store.mode === 'demo' && profiles.length === 1 && store instanceof LocalStore && (
          <p className="mb-3 flex flex-wrap items-center gap-2 rounded-control bg-white/70 px-3 py-2 text-sm">
            데모에는 나 혼자뿐입니다. 가상의 팀원을 만들어 단계별 열람을 해 볼 수 있습니다.
            <Button variant="outline" className="!py-1 text-xs" onClick={() => void run(() => store.seedDemoTeam(date))}>
              데모 팀원 만들기
            </Button>
          </p>
        )}
        <ul className="space-y-1" aria-label="Org chart">
          {orgRows(profiles).map(({ person: p, depth }) => {
            const me = p.id === user.id
            const options = managerOptions(profiles, p)
            return (
              <li
                key={p.id}
                data-testid="org-row"
                data-person={p.name}
                className={cx('flex flex-wrap items-center gap-2 rounded-control px-2 py-1.5', me ? 'bg-primary/10' : 'hover:bg-white/60')}
                style={{ marginLeft: `${depth * 1.5}rem` }}
              >
                {depth > 0 && <span aria-hidden className="-ml-4 h-px w-3 bg-ink/25" />}
                <span className="font-semibold">{p.name}</span>
                {p.engineer_code && <span className="font-mono text-xs text-muted">{p.engineer_code}</span>}
                <Pill tone={LEVEL_TONE[p.role]}>{roleLabel(p.role)}</Pill>
                {p.team && !isAdmin && <Pill tone="green">{p.team}</Pill>}
                {me && <span className="text-xs font-bold text-primary">나</span>}
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {!me && visible.has(p.id) &&
                    (isAdmin ? (
                      <Link to={viewLink(p)} className="flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-semibold text-primary hover:bg-white" aria-label={`View ${p.name}`}>
                        <Eye size={14} /> 보기
                      </Link>
                    ) : (
                      // L1–L3 read them in the Daily Log Team window and the Daily Kanban team row
                      <span className="flex items-center gap-1 px-2 py-0.5 text-xs text-muted" title="Daily Log의 팀원 창, 데일리 칸반의 팀원 줄에서 볼 수 있습니다">
                        <Eye size={14} /> 볼 수 있음
                      </span>
                    ))}
                  {requestCell(p)}
                  {isAdmin && (
                    <>
                      <input
                        key={p.team}
                        aria-label={`Team of ${p.name}`}
                        className="field !h-7 !w-28 !py-0 text-xs"
                        placeholder="팀"
                        list="org-teams"
                        defaultValue={p.team}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        onBlur={(e) => {
                          const team = e.target.value.trim()
                          if (team !== p.team) void run(() => store.updateProfile(p.id, { team }))
                        }}
                      />
                      <select
                        aria-label={`Manager of ${p.name}`}
                        className="field !h-7 !w-auto !py-0 text-xs"
                        value={p.manager_id ?? ''}
                        onChange={(e) => void run(() => store.updateProfile(p.id, { manager_id: e.target.value || null }))}
                      >
                        <option value="">상위 없음</option>
                        {/* a manager saved before (e.g. a level changed later) stays listed */}
                        {[...options, ...(p.manager_id && !options.some((o) => o.id === p.manager_id) && byId.get(p.manager_id) ? [byId.get(p.manager_id)!] : [])].map((m) => (
                          <option key={m.id} value={m.id}>
                            ↑ {m.name} ({roleLabel(m.role)})
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        <datalist id="org-teams">
          {teams.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Card>

      <div className="flex flex-col gap-4">
        <Card title="받은 열람 요청">
          {received.length === 0 ? (
            <p className="text-sm text-muted">받은 요청이 없습니다. L1이 내 기록을 보려고 요청하면 여기에 나옵니다.</p>
          ) : (
            <ul className="space-y-3" aria-label="Received requests">
              {received.map((r) => {
                const who = byId.get(r.requester_id)
                return (
                  <li key={r.id} className="rounded-control bg-white/70 p-3" data-testid="access-request">
                    <p className="mb-2 text-sm">
                      <strong>{who?.name ?? '알 수 없음'}</strong> {who && <span className="text-muted">({roleLabel(who.role)}{who.team && ` · ${who.team}`})</span>}님이 내 기록 열람을 요청했습니다.
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted">승인:</span>
                      {GRANT_HOURS.map((g) => (
                        <Button key={g.hours} className="!px-2 !py-0.5 text-xs" onClick={() => void run(() => store.decideAccessRequest(r.id, true, g.hours))}>
                          {g.label}
                        </Button>
                      ))}
                      <Button variant="ghost" className="ml-auto !px-2 !py-0.5 text-xs" onClick={() => void run(() => store.decideAccessRequest(r.id, false))}>
                        거절
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        {(canSend || sent.length > 0) && (
          <Card title="보낸 수정 제안">
            {sent.length === 0 ? (
              <p className="text-sm text-muted">Daily Log의 팀원 기록에서 <strong>수정 제안</strong>을 누르면 비교 화면으로 보낼 수 있습니다.</p>
            ) : (
              <ul className="space-y-2" aria-label="Sent proposals">
                {sent.map((p) => {
                  const applied = p.applied ?? []
                  const status =
                    p.status === 'open' ? '기다리는 중' : applied.length === p.items.length ? '모두 적용' : applied.length ? `${applied.length}/${p.items.length}줄 적용` : '적용 안 함'
                  return (
                    <li key={p.id} className="rounded-control bg-white/70 p-2 text-sm" data-testid="sent-proposal">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{byId.get(p.owner_id)?.name ?? '알 수 없음'}</strong>
                        <span className="text-muted">
                          {p.work_date} · {p.items.length}줄{p.by_ai && ' · AI'}
                        </span>
                        <Pill tone={p.status === 'open' ? 'yellow' : 'green'}>{status}</Pill>
                        <span className="ml-auto flex gap-1">
                          <button type="button" className="rounded-chip px-2 py-0.5 text-xs font-semibold text-primary hover:bg-white" onClick={() => setOpenSent(openSent === p.id ? null : p.id)}>
                            {openSent === p.id ? '접기' : '비교 보기'}
                          </button>
                          {p.status === 'open' && (
                            <button
                              type="button"
                              className="rounded-chip px-2 py-0.5 text-xs font-semibold text-muted hover:bg-white"
                              onClick={() => void run(() => store.withdrawProposal(p.id)).then(() => proposalsQ.reload())}
                            >
                              취소
                            </button>
                          )}
                        </span>
                      </div>
                      {openSent === p.id && (
                        <div className="mt-2 space-y-2">
                          {p.note && <p className="rounded-control bg-white px-3 py-2">📝 {p.note}</p>}
                          <ProposalDiff items={p.items} names={names} applied={p.status === 'answered' ? applied : null} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        )}
        <Card title="열람 규칙" tone="sage">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>L1: 자기 기록만</li>
            <li>L2: + 아래에 있는 L1</li>
            <li>L3: + 아래에 있는 L2와 그 아래 L1</li>
            <li>L1이 L2의 기록을 보려면 조직도에서 <strong>열람 요청</strong> → 그 L2가 1시간·하루·1주 중 골라 승인</li>
            <li>보는 곳: Daily Log의 팀원 창 · 데일리 칸반의 팀원 줄 (읽기만)</li>
            <li>관리자와 상위자는 아래 사람의 기록에 <strong>수정 제안</strong>(비교 화면)을 보낼 수 있고, 받은 사람이 줄마다 골라 적용합니다</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
