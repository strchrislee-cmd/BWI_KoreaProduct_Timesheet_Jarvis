import type { CSSProperties } from 'react'
import { cx } from '../../components/ui'
import { KANBAN_LABEL, type DayReplay, type KanbanCard, type KanbanStatus } from '../../domain/kanban'
import { EMPTY_TASK_LABEL } from '../../domain/quickTasks'
import { slotToTime } from '../../domain/time'

const fill = (status: KanbanStatus | undefined, color: string): CSSProperties => {
  switch (status) {
    case 'doing':
      return { backgroundColor: color }
    case 'wait':
      return { backgroundColor: `color-mix(in srgb, ${color} 28%, white)` }
    case 'donecheck':
      return { backgroundColor: '#cbd5e1' }
    case 'done':
      return { backgroundColor: '#94a3b8' }
    case 'backlog':
    case 'todo':
      return { boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }
    default:
      return {}
  }
}

/**
 * Kanban Flow: for each person, the cards that moved during the day, one row each, coloured by the
 * column they were in every half hour (Doing in the person's colour, Wait light, DoneCheck / Done gray).
 * Pressing a half hour replays the board at that time.
 */
export function KanbanFlow({
  people,
  replays,
  slots,
  pos,
  onPick,
}: {
  people: { id: string; name: string; color: string }[]
  replays: Map<string, DayReplay>
  /** the half hours shown (the slider's range) */
  slots: number[]
  /** the half hour being replayed, or null for the board as it is */
  pos: number | null
  onPick: (slot: number) => void
}) {
  const grid = { gridTemplateColumns: `minmax(7rem, 12rem) repeat(${slots.length}, minmax(0, 1fr))` }
  const sections = people.map((p) => {
    const r = replays.get(p.id)
    if (!r) return { p, rows: [] as { card: KanbanCard; cells: (KanbanStatus | undefined)[] }[] }
    const rows = [...r.touched].map((id) => {
      const card = r.at.flatMap((snap) => snap.filter((x) => x.card.id === id))[0]?.card
      const cells = slots.map((i) => r.at[i]?.find((x) => x.card.id === id)?.status)
      return { card, cells, first: cells.findIndex((c) => c === 'doing') }
    })
    const ordered = rows
      .filter((x): x is typeof x & { card: KanbanCard } => !!x.card)
      .sort((a, b) => (a.first < 0 ? 1e9 : a.first) - (b.first < 0 ? 1e9 : b.first))
    return { p, rows: ordered }
  })
  const empty = sections.every((s) => !s.rows.length)

  return (
    <section className="mt-5 border-t border-black/10 pt-4" aria-label="Kanban Flow" data-testid="kanban-flow">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display text-base font-bold">Kanban Flow</h3>
        <span className="text-xs text-muted">30분마다 카드가 어느 칸에 있었는지 (Daily Log 기준) · 칸을 누르면 그 시간으로 되감기</span>
      </header>
      {empty ? (
        <p className="text-sm text-muted">이날 움직인 카드가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[36rem] space-y-3">
            <div className="grid items-end gap-px text-[10px] text-muted" style={grid} aria-hidden>
              <span />
              {slots.map((i) => (
                <span key={i} className={cx('text-center', pos === i && 'font-bold text-primary')}>
                  {slotToTime(i).endsWith(':00') ? slotToTime(i).slice(0, 2) : ''}
                </span>
              ))}
            </div>
            {sections
              .filter((s) => s.rows.length)
              .map(({ p, rows }) => (
                <div key={p.id} data-testid="flow-person" data-person={p.name}>
                  <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                    {p.name}
                  </div>
                  {rows.map(({ card, cells }) => {
                    const name = card.description.trim() || EMPTY_TASK_LABEL
                    return (
                      <div key={card.id} className="grid items-center gap-px" style={grid} data-testid="flow-row" data-task={name}>
                        <span className="te-clip pr-2 text-xs" title={name}>
                          {name}
                        </span>
                        {cells.map((status, k) => (
                          <button
                            key={slots[k]}
                            type="button"
                            data-status={status ?? ''}
                            data-slot={slots[k]}
                            title={`${slotToTime(slots[k])} ${status ? KANBAN_LABEL[status] : '—'}`}
                            aria-label={`${name} ${slotToTime(slots[k])}`}
                            className={cx('h-4 rounded-[3px] hover:opacity-80', pos === slots[k] && 'outline outline-2 outline-offset-0 outline-[#1f4d3a]')}
                            style={fill(status, p.color)}
                            onClick={() => onPick(slots[k])}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
              {(['doing', 'wait', 'donecheck', 'done'] as const).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="h-2.5 w-4 rounded-[3px]" style={fill(s, people[0]?.color ?? '#5b8def')} />
                  {KANBAN_LABEL[s]}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-4 rounded-[3px]" style={fill('todo', '#000')} />
                Backlog · ToDo
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
