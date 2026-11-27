import { MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Button, Card, ErrorNote, Loading, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { syncKanban } from '../../data/kanbanSync'
import { KANBAN_LABEL, KANBAN_STATUSES, nextSortOrder, type KanbanCard, type KanbanStatus } from '../../domain/kanban'
import { isSelectable } from '../../domain/projects'
import { EMPTY_TASK_LABEL } from '../../domain/quickTasks'
import { currentSlot, todayLocal } from '../../domain/time'
import { WORK_TYPE_GRAY, selectableWorkTypes, withPersonalColors } from '../../domain/workTypes'
import { useAsync } from '../../lib/hooks'
import { useT } from '../../lib/i18n'
import { categoryColor, chipBg } from './colors'
import { displayName } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'
import { useColorPrefs } from './useColorPrefs'

/** what a column is for (tooltip on its title) */
const COLUMN_HINT: Record<KanbanStatus, string> = {
  backlog: '언젠가 할 일',
  todo: '곧 할 일',
  wait: '하다가 멈춘 일 (Daily Log에서 다른 업무로 넘어가면 여기로)',
  doing: '지금 하는 일 (Daily Log에 지금 시간으로 기록한 업무)',
  donecheck: '끝났는지 확인할 일',
  done: '끝난 일',
}

/** a board missing in the database (migration 0012 not run yet) */
const missingTable = (e: Error | null | undefined) => !!e && /kanban_(cards|moves)|schema cache|does not exist/i.test(e.message)

/**
 * Daily Kanban: one card per task (Project · Type · Task) in Backlog · ToDo · Wait · Doing · DoneCheck ·
 * Done. Follows the Daily Log (the task logged now is Doing, the one before it Wait); cards are
 * dragged between columns or moved with … . One board per person, kept across days.
 */
export function DailyKanban() {
  const tr = useT()
  const { store } = useStore()
  const user = useUser()
  const { engineer, projects, workTypes } = useTimesheets()
  const { prefs } = useColorPrefs()
  const canEdit = engineer.id === user.id
  const q = useAsync(() => store.listKanban(engineer.id), [store, engineer.id])
  const [error, setError] = useState<Error | null>(null)
  const [drag, setDrag] = useState<{ id: string } | null>(null)
  const [over, setOver] = useState<{ status: KanbanStatus; index: number } | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const types = useMemo(() => withPersonalColors(workTypes, prefs.categoryColors), [workTypes, prefs.categoryColors])
  const typeById = useMemo(() => new Map(types.map((w) => [w.id, w])), [types])
  const cards = useMemo(() => q.data ?? [], [q.data])
  const columns = useMemo(() => {
    const m = new Map<KanbanStatus, KanbanCard[]>(KANBAN_STATUSES.map((s) => [s, []]))
    for (const c of [...cards].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))) m.get(c.status)!.push(c)
    return m
  }, [cards])

  // your own board catches up with today's log when it opens (entries from the phone or the reminder)
  useEffect(() => {
    if (!canEdit) return
    const now = new Date()
    let alive = true
    store
      .listSlots(user.id, todayLocal(now), todayLocal(now))
      .then((day) => syncKanban(store, user.id, day, currentSlot(now).slot))
      .then((changed) => alive && changed && q.reload())
      .catch(() => {}) // shown by the board's own load error
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board
  }, [store, user.id, canEdit])

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
    q.reload()
  }

  /** Put a card at `index` of a column (a move to another column is recorded in its journey). */
  function place(card: KanbanCard, to: KanbanStatus, index: number) {
    const list = (columns.get(to) ?? []).filter((c) => c.id !== card.id)
    const at = Math.max(0, Math.min(index, list.length))
    const ordered = [...list.slice(0, at), card, ...list.slice(at)]
    void run(async () => {
      for (const [i, c] of ordered.entries()) {
        if (c.id === card.id) await store.moveKanbanCard(card, to, i + 1, 'manual')
        else if (c.sort_order !== i + 1) await store.moveKanbanCard(c, to, i + 1, 'manual')
      }
    })
  }

  const projectOf = (c: KanbanCard) => (c.group_project_id ? byId.get(c.group_project_id) : undefined)
  const projectName = (c: KanbanCard) => {
    const p = projectOf(c)
    return p ? displayName(p) : c.label ? `⚠ ${c.label}` : ''
  }

  function onDrop(e: DragEvent, status: KanbanStatus) {
    e.preventDefault()
    const card = cards.find((c) => c.id === (drag?.id ?? e.dataTransfer.getData('text/plain')))
    const index = over?.status === status ? over.index : (columns.get(status)?.length ?? 0)
    setDrag(null)
    setOver(null)
    if (card) place(card, status, index)
  }

  if (q.loading && !q.data) return <Loading />

  return (
    <Card
      title={tr('Daily Kanban')}
      action={<span className="text-xs text-muted">Daily Log에 지금 시간으로 기록한 업무는 Doing, 그 전 업무는 Wait로 옮겨집니다 · 카드를 끌어서 옮기기</span>}
    >
      {missingTable(q.error) ? (
        <p className="rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="kanban-setup">
          Daily Kanban을 쓰려면 관리자가 Supabase SQL Editor에서 <code>supabase/migrations/0012_kanban.sql</code>을 한 번 실행해야 합니다. Daily Log는 그대로 쓸 수 있습니다.
        </p>
      ) : (
        <>
          <ErrorNote error={error ?? q.error} />
          {!canEdit && <p className="mb-2 text-xs text-muted">{engineer.name}의 보드 (읽기 전용)</p>}
          <div className="flex gap-3 overflow-x-auto pb-2" data-testid="kanban-board">
            {KANBAN_STATUSES.map((status) => {
              const list = columns.get(status) ?? []
              return (
                <section
                  key={status}
                  aria-label={`${KANBAN_LABEL[status]} column`}
                  data-column={status}
                  className={cx(
                    'flex min-h-[220px] w-[220px] shrink-0 flex-col rounded-card bg-black/[0.04] p-2 xl:w-auto xl:min-w-0 xl:flex-1',
                    drag && over?.status === status && 'ring-2 ring-primary/50',
                  )}
                  onDragOver={(e) => {
                    if (!drag) return
                    e.preventDefault()
                    if (over?.status !== status) setOver({ status, index: list.length })
                  }}
                  onDrop={(e) => onDrop(e, status)}
                >
                  <header className="mb-2 flex items-center justify-between px-1" title={COLUMN_HINT[status]}>
                    <h3 className={cx('text-sm font-bold', status === 'doing' && 'text-primary')}>{KANBAN_LABEL[status]}</h3>
                    <span className="rounded-full bg-white/70 px-1.5 text-[11px] tabular-nums text-muted" data-testid={`count-${status}`}>
                      {list.length}
                    </span>
                  </header>
                  <ul className="flex flex-1 flex-col gap-1.5">
                    {list.map((c, i) => {
                      const p = projectOf(c)
                      const w = c.work_type_id ? typeById.get(c.work_type_id) : undefined
                      return (
                        <li
                          key={c.id}
                          data-card={c.id}
                          data-testid="kanban-card"
                          draggable={canEdit}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', c.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setDrag({ id: c.id })
                          }}
                          onDragEnd={() => {
                            setDrag(null)
                            setOver(null)
                          }}
                          onDragOver={(e) => {
                            if (!drag) return
                            e.preventDefault()
                            e.stopPropagation()
                            const r = e.currentTarget.getBoundingClientRect()
                            const index = e.clientY < r.top + r.height / 2 ? i : i + 1
                            if (over?.status !== status || over.index !== index) setOver({ status, index })
                          }}
                          onDrop={(e) => {
                            e.stopPropagation()
                            onDrop(e, status)
                          }}
                          className={cx(
                            'group relative rounded-control bg-white/90 px-2.5 py-2 text-sm shadow-sm',
                            canEdit && 'cursor-grab active:cursor-grabbing',
                            drag?.id === c.id && 'opacity-40',
                            drag && over?.status === status && over.index === i && 'shadow-[inset_0_2px_0_#1f4d3a]',
                            drag && over?.status === status && over.index === i + 1 && i === list.length - 1 && 'shadow-[inset_0_-2px_0_#1f4d3a]',
                            status === 'doing' && 'ring-1 ring-primary/40',
                          )}
                        >
                          <div className="pr-5 font-semibold [overflow-wrap:anywhere] [word-break:keep-all]">{c.description.trim() || EMPTY_TASK_LABEL}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {projectName(c) && (
                              <span className="te-clip rounded-chip px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: chipBg(categoryColor('work', p, prefs)) }} title={projectName(c)}>
                                {projectName(c)}
                              </span>
                            )}
                            {w && (
                              <span className="rounded-chip px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: chipBg(w.color ?? WORK_TYPE_GRAY) }}>
                                {w.name}
                              </span>
                            )}
                          </div>
                          {status === 'done' && c.done_at && <div className="mt-1 text-[11px] text-muted">완료 {new Date(c.done_at).toLocaleDateString()}</div>}
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={`Options for ${c.description.trim() || EMPTY_TASK_LABEL}`}
                              className="absolute right-1 top-1 rounded-chip p-0.5 text-muted opacity-50 hover:bg-black/5 hover:opacity-100 group-hover:opacity-100"
                              onClick={() => setMenu(menu === c.id ? null : c.id)}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          )}
                          {menu === c.id && (
                            <div role="menu" aria-label="Card menu" className="glass-strong absolute right-1 top-7 z-20 w-40 rounded-menu p-1 text-[13px]">
                              <div className="px-2 py-1 text-[11px] font-semibold text-muted">옮기기</div>
                              {KANBAN_STATUSES.filter((s) => s !== status).map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  role="menuitem"
                                  className="block w-full rounded-chip px-2 py-1 text-left hover:bg-black/5"
                                  onClick={() => {
                                    setMenu(null)
                                    place(c, s, nextSortOrder(cards, s))
                                  }}
                                >
                                  → {KANBAN_LABEL[s]}
                                </button>
                              ))}
                              <div className="my-1 border-t border-black/10" />
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full rounded-chip px-2 py-1 text-left text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  setMenu(null)
                                  void run(() => store.deleteKanbanCard(c.id))
                                }}
                              >
                                카드 삭제
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {status === 'backlog' && canEdit && (
                    <div className="mt-2">
                      {adding ? (
                        <AddCardForm
                          projects={projects.filter(isSelectable)}
                          types={selectableWorkTypes(types)}
                          onCancel={() => setAdding(false)}
                          onAdd={(task) =>
                            void run(async () => {
                              await store.addKanbanCard({ ...task, user_id: user.id, status: 'backlog', sort_order: nextSortOrder(cards, 'backlog') }, 'manual')
                              setAdding(false)
                            })
                          }
                        />
                      ) : (
                        <Button variant="ghost" className="w-full !justify-start !px-2 !py-1 text-xs" onClick={() => setAdding(true)}>
                          <Plus size={14} /> 카드 추가
                        </Button>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

/** A new Backlog card: the Task, and optionally its project and Type (as in the Daily Log). */
function AddCardForm({
  projects,
  types,
  onAdd,
  onCancel,
}: {
  projects: { id: string; name: string; code: string | null }[]
  types: { id: string; name: string }[]
  onAdd: (task: { group_project_id: string | null; label: string; work_type_id: string | null; description: string }) => void
  onCancel: () => void
}) {
  const [task, setTask] = useState('')
  const [project, setProject] = useState('')
  const [type, setType] = useState('')
  const ok = task.trim() || project
  return (
    <form
      aria-label="New card"
      className="space-y-1.5 rounded-control bg-white/90 p-2 text-sm shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onAdd({ group_project_id: project || null, label: '', work_type_id: type || null, description: task.trim() })
      }}
    >
      <input autoFocus aria-label="Task" className="field !px-2 !py-1 text-sm" placeholder="Task (업무)" value={task} onChange={(e) => setTask(e.target.value)} />
      <select aria-label="Project" className="field !px-2 !py-1 text-sm" value={project} onChange={(e) => setProject(e.target.value)}>
        <option value="">Project (선택)</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {displayName(p as never)}
          </option>
        ))}
      </select>
      <select aria-label="Type" className="field !px-2 !py-1 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">Type (선택)</option>
        {types.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" className="!px-2 !py-1 text-xs" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" className="!px-2 !py-1 text-xs" disabled={!ok}>
          추가
        </Button>
      </div>
    </form>
  )
}
