import { MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Button, Card, ErrorNote, Loading, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { syncKanban } from '../../data/kanbanSync'
import { KANBAN_LABEL, KANBAN_STATUSES, boardColumns, isTaskSlot, nextSortOrder, onDayBoard, replayDay, teamBlocks, type KanbanCard, type KanbanStatus } from '../../domain/kanban'
import { KANBAN_CHANGED } from '../../components/DoingLogToast'
import { SHOW_REMINDER_TOAST, SLOTS_CHANGED } from '../../components/ReminderToast'
import { orgRows } from '../../domain/org'
import { isSelectable } from '../../domain/projects'
import { EMPTY_TASK_LABEL } from '../../domain/quickTasks'
import { currentSlot, slotToTime, timeToSlot, todayLocal } from '../../domain/time'
import { WORK_TYPE_GRAY, selectableWorkTypes, withPersonalColors } from '../../domain/workTypes'
import { useAsync } from '../../lib/hooks'
import { useT } from '../../lib/i18n'
import { categoryColor, chipBg, personColor } from './colors'
import { PersonColorDot, usePersonOrder } from './PersonColor'
import { displayName } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'
import { useColorPrefs } from './useColorPrefs'
import { KanbanFlow } from './KanbanFlow'

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
 * Team: check people you may read to see their cards on the same board (read-only, with their name in
 * the colour you gave them); the colour chips show only the cards of the people with that colour.
 */
export function DailyKanban() {
  const tr = useT()
  const { store } = useStore()
  const user = useUser()
  const { date, engineer, projects, workTypes, profiles, visible } = useTimesheets()
  const { prefs, update } = useColorPrefs()
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
  /** the board owner's cards only: places are counted among these */
  const mine = useMemo(() => boardColumns(cards, [engineer.id]), [cards, engineer.id])

  // Team: the people you may read (Org Chart order); the checked ones' cards join this board
  const teamPeople = useMemo(
    () => orgRows(profiles).map((r) => r.person).filter((p) => p.id !== user.id && p.id !== engineer.id && visible.has(p.id)),
    [profiles, visible, user.id, engineer.id],
  )
  const shownIds = prefs.kanbanTeam.filter((id) => teamPeople.some((p) => p.id === id))
  const setTeam = (ids: string[]) => void update((p) => ({ ...p, kanbanTeam: ids }))
  const teamQ = useAsync(() => Promise.all(shownIds.map((id) => store.listKanban(id))).then((r) => r.flat()), [store, shownIds.join('|')])
  const withTeam = shownIds.length > 0
  const people = [engineer.id, ...shownIds]
  const nameOf = (id: string) => (id === user.id ? '나' : (profiles.find((p) => p.id === id)?.name ?? ''))
  const personOrder = usePersonOrder()
  const colorOf = (id: string) => personColor(id, prefs, personOrder).toUpperCase()
  const colorsInUse = [...new Set(people.map(colorOf))]
  const [colorFilter, setColorFilter] = useState<string[]>([])
  const filter = withTeam ? colorFilter.filter((h) => colorsInUse.includes(h)) : []

  // The day (the date at the top): its Daily Log and the moves made by hand replay the board half hour
  // by half hour, and only that day's cards show (plus Backlog and ToDo), not every card ever.
  const allCards = useMemo(() => [...cards, ...(withTeam ? (teamQ.data ?? []) : [])], [cards, withTeam, teamQ.data])
  const dayStart = useMemo(() => new Date(`${date}T00:00:00`), [date])
  const dayQ = useAsync(
    () => Promise.all(people.map(async (id) => ({ id, slots: await store.listSlots(id, date, date), moves: await store.listKanbanMoves(id, dayStart.toISOString()) }))),
    [store, date, dayStart, people.join('|'), cards],
  )
  const replays = useMemo(
    () => new Map((dayQ.data ?? []).map((d) => [d.id, replayDay(allCards.filter((c) => c.user_id === d.id), d.moves, d.slots, dayStart, d.id)])),
    [dayQ.data, allCards, dayStart],
  )
  const logged = (dayQ.data ?? []).flatMap((d) => d.slots.filter(isTaskSlot).map((s) => s.slot_index))
  const first = Math.min(timeToSlot(engineer.work_start), ...logged)
  const last = Math.max(timeToSlot(engineer.work_end) - 1, ...logged)
  const range = Array.from({ length: last - first + 1 }, (_, k) => first + k)
  const isToday = date === todayLocal(new Date())
  /** the half hour being replayed; null = the board now (today) or at the end of that day */
  const [pos, setPos] = useState<number | null>(null)
  useEffect(() => setPos(null), [date])
  const [showAll, setShowAll] = useState(false)
  const live = pos === null && isToday
  const shown: KanbanCard[] = live
    ? allCards
    : people.flatMap((id) => (replays.get(id)?.at[pos ?? 47] ?? []).map((r) => ({ ...r.card, status: r.status })))
  const movedNow = new Set(pos === null ? [] : people.flatMap((id) => (replays.get(id)?.at[pos] ?? []).filter((r) => r.moved).map((r) => r.card.id)))
  // teammates show only while Doing; the same task Doing for several people is one block with their avatars
  const shownPeople = people.filter((id) => !filter.length || filter.includes(colorOf(id)))
  const blocks = teamBlocks(
    shown.filter((c) => showAll || onDayBoard(c, replays.get(c.user_id)?.touched)),
    engineer.id,
    shownPeople,
  )
  const columns = boardColumns(blocks, people)
  const own = (c: KanbanCard) => live && canEdit && c.user_id === engineer.id
  const initial = (id: string) => (nameOf(id) || '?').trim().charAt(0).toUpperCase()

  // the Log Enable popup (any page) logs and moves cards: show it here at once
  useEffect(() => {
    const reload = () => q.reload()
    window.addEventListener(KANBAN_CHANGED, reload)
    window.addEventListener(SLOTS_CHANGED, reload)
    return () => {
      window.removeEventListener(KANBAN_CHANGED, reload)
      window.removeEventListener(SLOTS_CHANGED, reload)
    }
  }, [q.reload])

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
    const list = (mine.get(to) ?? []).filter((c) => c.id !== card.id)
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

  /** a drop place among the shown cards (teammates' too) → the place among the owner's own cards */
  function ownIndex(status: KanbanStatus, shownIndex: number) {
    const next = (columns.get(status) ?? []).slice(shownIndex).find(own)
    const list = mine.get(status) ?? []
    return next ? list.findIndex((c) => c.id === next.id) : list.length
  }

  function onDrop(e: DragEvent, status: KanbanStatus) {
    e.preventDefault()
    const card = cards.find((c) => c.id === (drag?.id ?? e.dataTransfer.getData('text/plain')))
    const index = over?.status === status ? ownIndex(status, over.index) : (mine.get(status)?.length ?? 0)
    setDrag(null)
    setOver(null)
    if (card) place(card, status, index)
  }

  if ((q.loading && !q.data) || (!dayQ.data && !dayQ.error)) return <Loading />

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
          <ErrorNote error={error ?? q.error ?? teamQ.error ?? dayQ.error} />
          {/* stays at the top while scrolling down to Kanban Flow (like frozen panes) */}
          <div className="sticky top-2 z-20 -mx-2 mb-3 rounded-card bg-white/92 px-2 pt-2 shadow-md backdrop-blur-md" data-testid="kanban-controls">
          {canEdit && (
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-sm" data-testid="kanban-log">
              <label className="flex items-center gap-1.5 font-semibold" title="정각·30분마다 Doing 카드를 Daily Log에 기록할지 묻습니다 (앱 어느 화면에서나)">
                <input type="checkbox" aria-label="Log Enable" checked={prefs.kanbanLog} onChange={(e) => void update((p) => ({ ...p, kanbanLog: e.target.checked }))} />
                Log Enable
              </label>
              <span className="text-xs text-muted">
                {prefs.kanbanLog ? '정각·30분마다 방금 끝난 30분을 Doing 업무로 기록할지 묻습니다 (앱 어느 화면에서나)' : '켜면 정각·30분마다 Doing 업무를 Daily Log에 기록할지 묻습니다'}
              </span>
              {prefs.kanbanLog && (
                <button type="button" className="rounded-chip px-2 py-0.5 text-xs font-semibold text-primary hover:bg-white" onClick={() => window.dispatchEvent(new Event(SHOW_REMINDER_TOAST))}>
                  지금 해 보기
                </button>
              )}
            </div>
          )}
          {teamPeople.length > 0 && (
            <div className="mb-3 space-y-1.5 text-sm" data-testid="kanban-team">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Team on this board">
                <span className="mr-1 text-xs font-semibold text-muted">{tr('Team')}</span>
                <span className="flex items-center gap-1.5 rounded-chip bg-white px-2 py-1 shadow-sm">
                  <PersonColorDot person={engineer} size={10} />
                  {nameOf(engineer.id)}
                </span>
                {teamPeople.map((p) => {
                  const on = shownIds.includes(p.id)
                  return (
                    <label key={p.id} className={cx('flex cursor-pointer items-center gap-1.5 rounded-chip px-2 py-1', on ? 'bg-white shadow-sm' : 'bg-white/40 text-muted hover:bg-white/70')}>
                      <input type="checkbox" checked={on} aria-label={p.name} onChange={() => setTeam(on ? shownIds.filter((x) => x !== p.id) : [...shownIds, p.id])} />
                      <PersonColorDot person={p} size={10} />
                      <span className="te-clip" title={p.name}>
                        {p.name}
                      </span>
                    </label>
                  )
                })}
                {withTeam && (
                  <button type="button" className="ml-1 text-xs font-semibold text-primary hover:underline" onClick={() => setTeam([])}>
                    모두 해제
                  </button>
                )}
              </div>
              {withTeam && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Color filter">
                  <span className="mr-1 text-xs font-semibold text-muted">색으로 보기</span>
                  {[null, ...colorsInUse].map((hex) => {
                    const names = hex ? people.filter((id) => colorOf(id) === hex).map(nameOf) : []
                    const on = hex ? filter.includes(hex) : !filter.length
                    return (
                      <button
                        key={hex ?? 'all'}
                        type="button"
                        aria-pressed={on}
                        aria-label={hex ? `Show ${names.join(', ')}` : 'Show everyone'}
                        title={hex ? `${names.join(', ')}의 카드만` : '모두'}
                        className={cx('flex items-center gap-1.5 rounded-chip px-2 py-1 text-xs font-semibold', on ? 'bg-primary text-white' : 'bg-white/60 hover:bg-white')}
                        onClick={() => setColorFilter(!hex ? [] : on ? filter.filter((h) => h !== hex) : [...filter, hex])}
                      >
                        {hex ? (
                          <>
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white" style={{ backgroundColor: hex }} />
                            <span className="te-clip">{names.join(' · ')}</span>
                          </>
                        ) : (
                          '전체'
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <div className="mb-2 rounded-control bg-white/60 px-3 py-2" data-testid="kanban-replay">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs font-semibold text-muted">하루 되감기</span>
              <div className="min-w-48 flex-1">
                <input
                  type="range"
                  aria-label="Replay time"
                  className="w-full accent-[#1f4d3a]"
                  min={0}
                  max={range.length}
                  step={1}
                  value={pos === null ? range.length : Math.max(0, range.indexOf(pos))}
                  onChange={(e) => {
                    const k = Number(e.target.value)
                    setPos(k >= range.length ? null : range[k])
                  }}
                />
                <div className="flex justify-between text-[10px] text-muted" aria-hidden>
                  <span>{slotToTime(first)}</span>
                  <span>{isToday ? '지금' : '하루 끝'}</span>
                </div>
              </div>
              <span className="w-28 font-mono text-sm font-semibold" data-testid="replay-time">
                {pos === null ? (isToday ? '지금' : '하루 끝') : `${slotToTime(pos)}–${slotToTime(pos + 1)}`}
              </span>
              {pos !== null && (
                <button type="button" className="rounded-chip px-2 py-0.5 text-xs font-semibold text-primary hover:bg-white" onClick={() => setPos(null)}>
                  {isToday ? '지금으로' : '하루 끝으로'}
                </button>
              )}
              <label className="flex items-center gap-1 text-xs text-muted" title="이날 움직이지 않은 지난 카드(Wait·Done 등)도 함께 보기">
                <input type="checkbox" aria-label="Show earlier cards" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 지난 카드도 보기
              </label>
            </div>
            {!live && (
              <p className="mt-1 text-xs text-muted" data-testid="replay-note">
                {pos === null ? `${date} 하루가 끝났을 때의 보드` : `${date} ${slotToTime(pos)} 시점의 보드`} · Daily Log 기준 · 읽기 전용
                {pos !== null && ' · 노란 테두리 = 이 30분에 옮겨진 카드'}
              </p>
            )}
          </div>
          </div>
          <KanbanFlow people={shownPeople.map((id) => ({ id, name: nameOf(id) || engineer.name }))} replays={replays} slots={range} pos={pos} until={isToday ? currentSlot(new Date()).slot : null} onPick={setPos} />
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
                      const moved = c.cardIds.some((id) => movedNow.has(id))
                      const w = c.work_type_id ? typeById.get(c.work_type_id) : undefined
                      return (
                        <li
                          key={c.id}
                          data-card={c.id}
                          data-testid="kanban-card"
                          data-person={withTeam ? nameOf(c.people[0]) : undefined}
                          data-people={withTeam ? c.people.map(nameOf).join(',') : undefined}
                          data-moved={moved || undefined}
                          title={own(c) || c.user_id === engineer.id ? undefined : `${c.people.map(nameOf).join(', ')}의 Doing (읽기 전용)`}
                          draggable={own(c)}
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
                            own(c) && 'cursor-grab active:cursor-grabbing',
                            drag?.id === c.id && 'opacity-40',
                            drag && over?.status === status && over.index === i && 'shadow-[inset_0_2px_0_#1f4d3a]',
                            drag && over?.status === status && over.index === i + 1 && i === list.length - 1 && 'shadow-[inset_0_-2px_0_#1f4d3a]',
                            status === 'doing' && 'ring-1 ring-primary/40',
                            moved && 'ring-2 ring-amber-400',
                          )}
                        >
                          <div className={cx('flex items-start gap-1.5', own(c) && 'pr-5')}>
                            <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere] [word-break:keep-all]">{c.description.trim() || EMPTY_TASK_LABEL}</span>
                            {withTeam && (
                              // like collaborators on a Figma frame: whose block this is / who is Doing it
                              <span className="flex shrink-0 -space-x-1.5" data-testid="avatars">
                                {c.people.map((id) => (
                                  <span
                                    key={id}
                                    data-testid="avatar"
                                    data-person={nameOf(id)}
                                    title={nameOf(id)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow ring-2 ring-white"
                                    style={{ backgroundColor: colorOf(id) }}
                                  >
                                    {initial(id)}
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
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
                          {own(c) && (
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
                  {status === 'backlog' && canEdit && live && (
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
