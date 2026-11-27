import { Send, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button, ErrorNote, Modal, cx } from '../../components/ui'
import { useStore } from '../../data/StoreContext'
import { changedFields, fieldsOf, runTime, slotRuns, type ProposalItem, type TaskFields } from '../../domain/aiCleanup'
import type { GroupProject, Profile, TimeSlot, WorkType } from '../../domain/types'
import { ProposalDiff, type FieldNames } from './ProposalDiff'
import { displayName } from './projectUi'

/**
 * Proposed changes to your own log (AI 정리, or a proposal you received): the diff with a checkbox per
 * run; apply the checked ones. Nothing changes until you press apply.
 */
export function ApplyItemsDialog({
  title,
  intro,
  items,
  names,
  onApply,
  onDismissAll,
  onClose,
}: {
  title: string
  intro?: ReactNode
  items: ProposalItem[]
  names: FieldNames
  onApply: (indexes: number[]) => Promise<void>
  /** a received proposal: answer it without applying anything */
  onDismissAll?: () => Promise<void>
  onClose: () => void
}) {
  const [checked, setChecked] = useState(() => items.map(() => true))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const chosen = checked.flatMap((c, i) => (c ? [i] : []))
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(e as Error)
      setBusy(false)
    }
  }
  return (
    <Modal title={title} wide onClose={onClose}>
      <div className="space-y-3" data-testid="apply-dialog">
        {intro}
        <ErrorNote error={error} />
        {items.length === 0 ? (
          <p className="rounded-control bg-emerald-50 px-3 py-2 text-sm text-emerald-900">고칠 곳이 없습니다 ✓</p>
        ) : (
          <ProposalDiff items={items} names={names} checked={checked} onToggle={(i) => setChecked((c) => c.map((v, k) => (k === i ? !v : v)))} />
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {onDismissAll && (
            <Button variant="ghost" disabled={busy} onClick={() => void run(onDismissAll)}>
              모두 적용 안 함
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          {items.length > 0 && (
            <Button disabled={busy || !chosen.length} onClick={() => void run(() => onApply(chosen))}>
              선택한 {chosen.length}개 적용
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/**
 * A correction proposal for someone's day (admins, or a higher level above them): change Project / Type
 * / Task per run, or let AI fill it in, add a note, see the diff they will get, and send it.
 */
export function ProposalEditor({
  person,
  date,
  slots,
  projects,
  types,
  names,
  aiEnabled,
  onClose,
  onSent,
}: {
  person: Profile
  date: string
  slots: TimeSlot[]
  projects: GroupProject[]
  types: WorkType[]
  names: FieldNames
  aiEnabled: boolean
  onClose: () => void
  onSent: () => void
}) {
  const { store } = useStore()
  const runs = useMemo(() => slotRuns(slots), [slots])
  const [after, setAfter] = useState<TaskFields[]>(() => runs.map((r) => fieldsOf(r)))
  const [reasons, setReasons] = useState<string[]>(() => runs.map(() => ''))
  const [byAi, setByAi] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'' | 'ai' | 'send'>('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const items: ProposalItem[] = runs.flatMap((r, i) => {
    const before = fieldsOf(r)
    return changedFields(before, after[i]).length ? [{ slots: r.slots, before, after: after[i], reason: reasons[i] }] : []
  })
  const set = (i: number, patch: Partial<TaskFields>) => setAfter((a) => a.map((f, k) => (k === i ? { ...f, ...patch } : f)))

  async function fillWithAi() {
    setBusy('ai')
    try {
      const res = await store.aiCleanup(date, person.id)
      setAfter((a) => a.map((f, i) => res.items.find((it) => it.slots[0] === runs[i].slots[0])?.after ?? f))
      setReasons((rs) => rs.map((r, i) => res.items.find((it) => it.slots[0] === runs[i].slots[0])?.reason ?? r))
      setByAi(true)
      setRemaining(res.remaining)
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
    setBusy('')
  }

  async function send() {
    setBusy('send')
    try {
      await store.sendProposal({ owner_id: person.id, work_date: date, items, note: note.trim(), by_ai: byAi })
      onSent()
    } catch (e) {
      setError(e as Error)
      setBusy('')
    }
  }

  return (
    <Modal title={`수정 제안 · ${person.name}`} wide onClose={onClose}>
      <div className="space-y-4" data-testid="proposal-editor">
        <p className="text-sm text-muted">
          {date} 기록에서 바꿀 곳을 고치거나 AI로 채운 뒤 보냅니다. {person.name}님은 아래 미리보기와 같은 비교 화면을 보고 줄마다 적용할지 고릅니다.
        </p>
        <ErrorNote error={error} />
        {runs.length === 0 ? (
          <p className="text-sm text-muted">이날 기록이 없습니다.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {aiEnabled && (
                <Button variant="outline" disabled={!!busy} onClick={() => void fillWithAi()}>
                  <Sparkles size={16} /> {busy === 'ai' ? 'AI가 살펴보는 중…' : 'AI로 채우기'}
                </Button>
              )}
              {remaining !== null && <span className="text-xs text-muted">오늘 남은 AI 정리 {remaining}회</span>}
            </div>
            <table className="sheet w-full text-sm" aria-label="Edit the proposal">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Task</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => {
                  const changed = changedFields(fieldsOf(r), after[i]).length > 0
                  return (
                    <tr key={r.slots[0]} data-testid="proposal-row" className={cx(changed && 'bg-emerald-50/70')}>
                      <td className="whitespace-nowrap font-mono text-xs">{runTime(r.slots)}</td>
                      <td>
                        <select
                          aria-label={`Project at ${runTime(r.slots)}`}
                          className="field !py-1 text-sm"
                          value={after[i].group_project_id ?? ''}
                          onChange={(e) => set(i, e.target.value ? { group_project_id: e.target.value, label: '' } : { group_project_id: null, label: r.label })}
                        >
                          <option value="">{r.label ? `⚠ ${r.label}` : '—'}</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {displayName(p)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select aria-label={`Type at ${runTime(r.slots)}`} className="field !py-1 text-sm" value={after[i].work_type_id ?? ''} onChange={(e) => set(i, { work_type_id: e.target.value || null })}>
                          <option value="">—</option>
                          {types.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input aria-label={`Task at ${runTime(r.slots)}`} className="field !py-1 text-sm" value={after[i].description} onChange={(e) => set(i, { description: e.target.value })} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-muted">메모 (선택)</span>
              <textarea aria-label="Note" className="field min-h-16" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 회의 시간은 회의 섹션으로 적어 주세요" />
            </label>
            <section data-testid="proposal-preview">
              <h3 className="mb-2 text-sm font-bold">미리보기 · {person.name}님에게 이렇게 보입니다</h3>
              {items.length ? <ProposalDiff items={items} names={names} /> : <p className="text-sm text-muted">아직 바꾼 곳이 없습니다.</p>}
              {note.trim() && <p className="mt-2 rounded-control bg-white/80 px-3 py-2 text-sm">📝 {note.trim()}</p>}
            </section>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button disabled={!items.length || !!busy} onClick={() => void send()}>
            <Send size={16} /> 제안 보내기 ({items.length}줄)
          </Button>
        </div>
      </div>
    </Modal>
  )
}
