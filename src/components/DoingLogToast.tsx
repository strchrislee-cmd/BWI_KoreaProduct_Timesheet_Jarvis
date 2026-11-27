import { ClipboardCheck, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore, useUser } from '../data/StoreContext'
import { KANBAN_LABEL, nextSortOrder, type KanbanCard } from '../domain/kanban'
import { EMPTY_TASK_LABEL } from '../domain/quickTasks'
import { slotToTime } from '../domain/time'
import { useAsync } from '../lib/hooks'
import { displayName } from '../pages/timesheets/projectUi'
import { SLOTS_CHANGED } from './ReminderToast'
import { Button, ErrorNote, cx } from './ui'

/** Fired after the Daily Kanban changed from outside the board (this toast), so an open board reloads. */
export const KANBAN_CHANGED = 'teamembedded:kanban'

/**
 * Daily Kanban → Log Enable: every :00 / :30, log the half hour that just ended with the card in
 * Doing (one click), or pick another card — it moves to Doing (the one Doing before waits) and that
 * task is logged instead. Shown on any page, bottom right, like the 30-minute reminder it replaces.
 */
export function DoingLogToast({ date, slot, onClose }: { date: string; slot: number; onClose: () => void }) {
  const { store } = useStore()
  const user = useUser()
  const data = useAsync(() => Promise.all([store.listKanban(user.id), store.listProjects(), store.listWorkTypes()]), [store, user.id])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const cards = data.data?.[0] ?? []
  const byId = new Map((data.data?.[1] ?? []).map((p) => [p.id, p]))
  const typeName = new Map((data.data?.[2] ?? []).map((w) => [w.id, w.name]))
  const doing = cards.filter((c) => c.status === 'doing').sort((a, b) => a.sort_order - b.sort_order)[0]
  const order = (c: KanbanCard) => ['wait', 'todo', 'backlog', 'donecheck', 'done', 'doing'].indexOf(c.status)
  const others = cards.filter((c) => c.id !== doing?.id).sort((a, b) => order(a) - order(b) || a.sort_order - b.sort_order)
  const project = (c: KanbanCard) => {
    const p = c.group_project_id ? byId.get(c.group_project_id) : undefined
    return p ? displayName(p) : c.label ? `⚠ ${c.label}` : ''
  }
  const detail = (c: KanbanCard) => [project(c), c.work_type_id ? typeName.get(c.work_type_id) : ''].filter(Boolean).join(' · ')

  /** log the half hour with this card; a card that was not Doing moves there (the Doing one waits) */
  async function record(card: KanbanCard) {
    setBusy(true)
    try {
      await store.saveSlots([
        {
          user_id: user.id,
          work_date: date,
          slot_index: slot,
          kind: 'work',
          group_project_id: card.group_project_id,
          label: card.group_project_id ? '' : card.label,
          description: card.description,
          details: '',
          focus: null,
          work_type_id: card.work_type_id,
        },
      ])
      if (card.status !== 'doing') {
        for (const c of cards) if (c.status === 'doing') await store.moveKanbanCard(c, 'wait', nextSortOrder(cards, 'wait'), 'manual')
        await store.moveKanbanCard(card, 'doing', nextSortOrder(cards, 'doing'), 'manual')
      }
      window.dispatchEvent(new CustomEvent(SLOTS_CHANGED, { detail: { date } }))
      window.dispatchEvent(new CustomEvent(KANBAN_CHANGED))
      onClose()
    } catch (e) {
      setError(e as Error)
      setBusy(false)
    }
  }

  const time = (
    <>
      <span className="font-mono">{slotToTime(slot)}</span>–<span className="font-mono">{slotToTime(slot + 1)}</span>
    </>
  )

  return createPortal(
    <div
      role="dialog"
      aria-label="Log the Doing card"
      className="glass-strong fixed inset-x-3 bottom-24 z-50 rounded-card p-4 shadow-xl md:inset-x-auto md:bottom-5 md:right-5 md:w-[380px]"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="mb-3 flex items-start gap-2">
        <ClipboardCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">TeamEmbedded · Daily Kanban 기록</div>
          <div className="break-keep font-display text-base font-bold">{time} 을 Doing 업무로 기록할까요?</div>
        </div>
        <button aria-label="Close" className="rounded-control p-1 text-muted hover:bg-black/5" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <ErrorNote error={error ?? data.error} />
      {!data.data ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : picking || !doing ? (
        <div>
          <p className="mb-2 text-sm text-muted">{doing ? '이 시간에 한 업무를 고르면 Doing으로 옮기고 그 업무로 기록합니다.' : 'Doing에 업무가 없습니다. 이 시간에 한 업무를 골라 주세요.'}</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Choose a card">
            {others.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full rounded-control bg-white/80 px-3 py-1.5 text-left text-sm shadow-sm hover:bg-white"
                  onClick={() => void record(c)}
                  data-testid="pick-card"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{c.description.trim() || EMPTY_TASK_LABEL}</span>
                    <span className="shrink-0 text-[11px] text-muted">{KANBAN_LABEL[c.status]}</span>
                  </span>
                  {detail(c) && <span className="block truncate text-xs text-muted">{detail(c)}</span>}
                </button>
              </li>
            ))}
            {!others.length && <li className="text-sm text-muted">카드가 없습니다. Daily Kanban에서 카드를 먼저 만들어 주세요.</li>}
          </ul>
          <div className="mt-3 flex justify-end gap-2">
            {doing && (
              <Button variant="ghost" onClick={() => setPicking(false)}>
                돌아가기
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              건너뛰기
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="rounded-control bg-white/85 px-3 py-2 shadow-sm" data-testid="doing-card">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Doing</div>
            <div className="font-semibold [overflow-wrap:anywhere]">{doing.description.trim() || EMPTY_TASK_LABEL}</div>
            {detail(doing) && <div className="text-xs text-muted">{detail(doing)}</div>}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              건너뛰기
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setPicking(true)}>
              수정
            </Button>
            <Button className={cx(busy && 'opacity-60')} disabled={busy} onClick={() => void record(doing)}>
              기록
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
