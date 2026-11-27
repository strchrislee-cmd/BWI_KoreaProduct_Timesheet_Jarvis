import { ClipboardCheck, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { syncKanban } from '../data/kanbanSync'
import { useStore, useUser } from '../data/StoreContext'
import type { KanbanCard } from '../domain/kanban'
import { EMPTY_TASK_LABEL } from '../domain/quickTasks'
import { currentSlot, slotToTime } from '../domain/time'
import type { TimeSlot } from '../domain/types'
import { useAsync } from '../lib/hooks'
import { buildChanges } from '../pages/timesheets/grid/gridModel'
import { displayName } from '../pages/timesheets/projectUi'
import { ProjectSelect, TypeSelect, useEntryForm } from './entryForm'
import { SLOTS_CHANGED } from './ReminderToast'
import { Button, ErrorNote, cx } from './ui'

/** Fired after the Daily Kanban changed from outside the board (this toast), so an open board reloads. */
export const KANBAN_CHANGED = 'teamembedded:kanban'

/**
 * Daily Kanban → Log Enable: every :00 / :30, log the half hour that just ended with the card in
 * Doing (one click), or 수정: type what was done instead (Project · Type · Task, as in the Daily Log).
 * Either way it goes into the Daily Log and the board follows the log (that task is Doing, the one
 * before waits). Shown on any page, bottom right, like the 30-minute reminder it replaces.
 */
export function DoingLogToast({ date, slot, onClose }: { date: string; slot: number; onClose: () => void }) {
  const { store } = useStore()
  const user = useUser()
  const form = useEntryForm(date)
  const kanban = useAsync(() => store.listKanban(user.id), [store, user.id])
  const [editing, setEditing] = useState(false)
  const [category, setCategory] = useState('')
  const [mid, setMid] = useState('')
  const [task, setTask] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const projects = form.data.data?.[0] ?? []
  const workTypes = form.data.data?.[4] ?? []
  const byId = new Map(projects.map((p) => [p.id, p]))
  const typeName = new Map(workTypes.map((w) => [w.id, w.name]))
  const doing = (kanban.data ?? []).filter((c) => c.status === 'doing').sort((a, b) => a.sort_order - b.sort_order)[0]
  const projectText = (c: KanbanCard) => {
    const p = c.group_project_id ? byId.get(c.group_project_id) : undefined
    return p ? displayName(p) : c.label
  }
  const detail = (c: KanbanCard) => [projectText(c), c.work_type_id ? typeName.get(c.work_type_id) : ''].filter(Boolean).join(' · ')
  const showForm = editing || !doing

  function edit() {
    setCategory(doing ? projectText(doing) : '')
    setMid(doing?.work_type_id ? (typeName.get(doing.work_type_id) ?? '') : '')
    setTask(doing?.description ?? '')
    setEditing(true)
  }

  /** save the half hour, bring the board in line with the log, tell open pages */
  async function save(build: (saved: TimeSlot[]) => TimeSlot[]) {
    setBusy(true)
    try {
      const rows = build(await store.listSlots(user.id, date, date))
      if (rows.length) await store.saveSlots(rows)
      await syncKanban(store, user.id, await store.listSlots(user.id, date, date), currentSlot(new Date()).slot)
      window.dispatchEvent(new CustomEvent(SLOTS_CHANGED, { detail: { date } }))
      window.dispatchEvent(new CustomEvent(KANBAN_CHANGED))
      onClose()
    } catch (e) {
      setError(e as Error)
      setBusy(false)
    }
  }

  /** 기록: the Doing card as it is */
  const recordDoing = (card: KanbanCard) =>
    save(() => [
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

  /** 수정 → 기록: what was typed, read exactly like a Daily Log row */
  const recordTyped = () =>
    save((saved) => {
      const ctx = form.ctxFor(saved)
      if (!ctx) return []
      return buildChanges(
        [
          { index: slot, col: 'category', text: category },
          { index: slot, col: 'mid', text: mid },
          { index: slot, col: 'task', text: task },
        ],
        ctx,
      ).flatMap((c) => (c.slot ? [c.slot] : []))
    })

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
      <ErrorNote error={error ?? kanban.error ?? form.data.error} />
      {!kanban.data || !form.data.data ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : showForm ? (
        <form
          className="space-y-2"
          aria-label="Type what you did"
          onSubmit={(e) => {
            e.preventDefault()
            void recordTyped()
          }}
        >
          <p className="text-sm text-muted">{doing ? '이 시간에 한 업무로 고쳐 주세요. 그 업무가 Doing이 되고 Daily Log에 기록됩니다.' : 'Doing에 업무가 없습니다. 이 시간에 한 업무를 적어 주세요.'}</p>
          <ProjectSelect groups={form.groups} value={category} onChange={setCategory} />
          <TypeSelect workTypes={workTypes} value={mid} onChange={setMid} />
          <input aria-label="Task" className="field" placeholder="업무 (Task)" value={task} onChange={(e) => setTask(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            {doing && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                돌아가기
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              건너뛰기
            </Button>
            <Button type="submit" className={cx(busy && 'opacity-60')} disabled={busy || !(category || mid || task.trim())}>
              기록
            </Button>
          </div>
        </form>
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
            <Button variant="outline" disabled={busy} onClick={edit}>
              수정
            </Button>
            <Button className={cx(busy && 'opacity-60')} disabled={busy} onClick={() => void recordDoing(doing)}>
              기록
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
