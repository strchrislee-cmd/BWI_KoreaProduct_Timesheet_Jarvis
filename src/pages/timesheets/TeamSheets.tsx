import { GripVertical, X } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { Card, ErrorNote, Loading, Pill, cx } from '../../components/ui'
import { useStore } from '../../data/StoreContext'
import { roleLabel } from '../../domain/roles'
import { SLOTS_PER_DAY, SLOT_HOURS, timeToSlot } from '../../domain/time'
import type { Profile } from '../../domain/types'
import { useAsync } from '../../lib/hooks'
import { moveItem } from '../../lib/ordering'
import { useDragReorder } from '../../lib/useDragReorder'
import { DailyGrid, type GridColors, type GridOptionsApi } from './grid/DailyGrid'
import type { GridContext } from './grid/gridModel'
import type { GridPrefs } from '../../data/preferences'
import { MobileDayLog } from './mobile/MobileDayLog'

/**
 * Team window: the people you may read, with a checkbox each. Checked people are listed first in the
 * order they were checked (drag to change it); their 30-min logs show under your own in that order.
 */
export function TeamPicker({ people, checked, onChange }: { people: { person: Profile; depth: number }[]; checked: string[]; onChange: (ids: string[]) => void }) {
  const list = useRef<HTMLOListElement>(null)
  const byId = new Map(people.map((x) => [x.person.id, x.person]))
  const order = checked.filter((id) => byId.has(id))
  const drag = useDragReorder(list, (_, from, to) => onChange(moveItem(order, from, to)), 5)
  const rest = people.filter((x) => !order.includes(x.person.id))

  const row = (p: Profile) => (
    <>
      <span className="min-w-0 flex-1">
        <span className="te-clip font-semibold" title={p.name}>
          {p.name}
        </span>
      </span>
      <span className="text-[11px] text-muted">
        {roleLabel(p.role)}
        {p.team && ` · ${p.team}`}
      </span>
    </>
  )

  return (
    <div className="text-sm">
      {order.length > 0 && (
        <ol ref={list} className="mb-2 space-y-0.5" aria-label="Shown people">
          {order.map((id, i) => {
            const p = byId.get(id)!
            const d = drag.state
            return (
              <li
                key={id}
                data-reorder="team"
                data-testid="team-shown"
                className={cx('flex cursor-grab touch-none items-center gap-1.5 rounded-control bg-white/70 px-1.5 py-1', d && d.over === i && d.from !== i && 'ring-2 ring-primary')}
                title="끌어서 순서 바꾸기"
                {...drag.bind('team', i)}
              >
                <GripVertical size={12} className="shrink-0 text-muted" aria-hidden />
                <span className="w-4 shrink-0 text-center font-mono text-xs text-muted">{i + 1}</span>
                <input
                  type="checkbox"
                  checked
                  aria-label={p.name}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={() => !drag.consumeDragged() && onChange(order.filter((x) => x !== id))}
                />
                {row(p)}
              </li>
            )
          })}
        </ol>
      )}
      <ul className="space-y-0.5" aria-label="Other people">
        {rest.map(({ person: p, depth }) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-control px-1.5 py-1 hover:bg-white/60" style={{ paddingLeft: `${0.375 + depth}rem` }}>
              <input type="checkbox" checked={false} aria-label={p.name} onChange={() => onChange([...order, p.id])} />
              {row(p)}
            </label>
          </li>
        ))}
      </ul>
      {order.length > 0 && (
        <button type="button" className="mt-2 text-xs font-semibold text-primary hover:underline" onClick={() => onChange([])}>
          모두 해제
        </button>
      )}
    </div>
  )
}

/** What a read-only 30-min log needs from the page (the viewer's own colours and column widths). */
export interface SheetBase {
  date: string
  base: Omit<GridContext, 'saved' | 'lunch' | 'blank'>
  colors: GridColors
  options: GridOptionsApi
  layout: GridPrefs
  onLayoutChange: (layout: GridPrefs) => void
  now: { slot: number; frac: number; time: string } | null
  isMobile: boolean
}

/** The checked people's 30-min logs for the day, one under the other (reading only). */
export function TeamSheets({ people, sheet, onHide }: { people: Profile[]; sheet: SheetBase; onHide: (id: string) => void }) {
  if (!people.length) return null
  return (
    <div className="mt-4 space-y-4" data-testid="team-sheets">
      {people.map((p) => (
        <PersonSheet key={p.id} person={p} sheet={sheet} onHide={() => onHide(p.id)} />
      ))}
    </div>
  )
}

const noop = () => {}

function PersonSheet({ person, sheet, onHide }: { person: Profile; sheet: SheetBase; onHide: () => void }) {
  const { store } = useStore()
  const { search } = useLocation()
  const { date } = sheet
  const q = useAsync(() => Promise.all([store.listSlots(person.id, date, date), store.getWorkDay(person.id, date)]), [store, person.id, date])
  const slots = useMemo(() => new Map((q.data?.[0] ?? []).map((s) => [s.slot_index, s])), [q.data])
  const lunch = useMemo(() => {
    const set = new Set<number>()
    for (let i = timeToSlot(person.lunch_start); i < timeToSlot(person.lunch_end); i++) set.add(i)
    return set
  }, [person.lunch_start, person.lunch_end])
  const ctx = useMemo<GridContext>(
    () => ({
      ...sheet.base,
      saved: slots,
      lunch,
      blank: (index) => ({ user_id: person.id, work_date: date, slot_index: index, kind: 'work', group_project_id: null, label: '', description: '', details: '', focus: null, work_type_id: null }),
    }),
    [sheet.base, slots, lunch, person.id, date],
  )
  const day = q.data?.[1]
  const rows = useMemo(() => {
    const first = timeToSlot(day?.start_time ?? person.work_start)
    const last = Math.min(SLOTS_PER_DAY - 1, Math.max(first, timeToSlot(day?.end_time ?? person.work_end) - 1))
    const set = new Set<number>(slots.keys())
    for (let i = first; i <= last; i++) set.add(i)
    return [...set].sort((a, b) => a - b)
  }, [day, person.work_start, person.work_end, slots])
  const total = [...slots.values()].filter((s) => s.kind === 'work').length * SLOT_HOURS
  const open = new URLSearchParams(search)
  open.set('eng', person.id)

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2" data-testid="team-sheet-title">
          {person.name}
          <Pill tone="grey">{roleLabel(person.role)}</Pill>
          {person.team && <Pill tone="green">{person.team}</Pill>}
          <span className="text-sm font-semibold text-muted">{total.toFixed(1)}h · 읽기 전용</span>
        </span>
      }
      action={
        <span className="flex items-center gap-1">
          <Link to={{ pathname: '/timesheets', search: `?${open}` }} className="rounded-chip px-2 py-1 text-xs font-semibold text-primary hover:bg-white">
            크게 보기
          </Link>
          <button type="button" className="rounded-control p-1 text-muted hover:bg-black/5" aria-label={`Hide ${person.name}`} title="이 사람 숨기기" onClick={onHide}>
            <X size={16} />
          </button>
        </span>
      }
    >
      <div data-testid="team-sheet" data-person={person.name}>
        <ErrorNote error={q.error} />
        {q.loading && !q.data ? (
          <Loading />
        ) : sheet.isMobile ? (
          <MobileDayLog key={`${person.id}-${date}`} rows={rows} ctx={ctx} templates={[]} templateColor={sheet.colors.template} now={sheet.now} readOnly onChange={noop} />
        ) : (
          <div className="overflow-x-auto">
            <DailyGrid
              key={`${person.id}-${date}`}
              rows={rows}
              ctx={ctx}
              templates={[]}
              colors={sheet.colors}
              options={sheet.options}
              layout={sheet.layout}
              onLayoutChange={sheet.onLayoutChange}
              now={sheet.now}
              readOnly
              onChange={noop}
              onUndo={noop}
              onCreateTemplate={noop}
              onSelectionChange={noop}
            />
          </div>
        )}
      </div>
    </Card>
  )
}
