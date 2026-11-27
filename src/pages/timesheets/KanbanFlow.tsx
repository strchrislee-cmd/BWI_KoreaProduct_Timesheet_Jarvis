import type { CSSProperties, MouseEvent } from 'react'
import { cx } from '../../components/ui'
import { taskKey, type DayReplay, type KanbanCard } from '../../domain/kanban'
import { EMPTY_TASK_LABEL } from '../../domain/quickTasks'
import { slotToTime } from '../../domain/time'
import { NAMED_COLORS, chipBg } from './colors'

/** the colours tasks get, in the order they first appear (gray reads as "nothing") */
const TASK_COLORS = NAMED_COLORS.slice(1).map((c) => c.hex)

interface Run {
  card: KanbanCard
  /** index into `slots` where it starts, and how many half hours it lasts */
  start: number
  len: number
}

/**
 * Kanban Flow: only what was Doing. One row per person; along the day, each task they were Doing is a
 * block with its name (the same task has the same colour for everyone). Pressing a half hour replays the
 * board at that time. Today, nothing is Doing after the half hour now.
 */
export function KanbanFlow({
  people,
  replays,
  slots,
  pos,
  until,
  onPick,
}: {
  people: { id: string; name: string }[]
  replays: Map<string, DayReplay>
  /** the half hours shown (the slider's range) */
  slots: number[]
  /** the half hour being replayed, or null for the board as it is */
  pos: number | null
  /** today: the half hour now (later ones have not happened yet); null for a past day */
  until: number | null
  onPick: (slot: number) => void
}) {
  const rows = people.map((p) => {
    const r = replays.get(p.id)
    const runs: Run[] = []
    slots.forEach((slot, k) => {
      const card = r?.at[slot]?.find((x) => x.status === 'doing')?.card
      const last = runs[runs.length - 1]
      if (!card || (until !== null && slot > until)) return
      if (last && last.start + last.len === k && taskKey(last.card) === taskKey(card)) last.len++
      else runs.push({ card, start: k, len: 1 })
    })
    return { p, runs }
  })
  const colorOf = new Map<string, string>()
  for (const { runs } of rows) for (const r of runs) if (!colorOf.has(taskKey(r.card))) colorOf.set(taskKey(r.card), TASK_COLORS[colorOf.size % TASK_COLORS.length])
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }
  const at = (e: MouseEvent<HTMLElement>, run: Run) => {
    const box = e.currentTarget.getBoundingClientRect()
    return slots[run.start + Math.min(run.len - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * run.len)))]
  }
  const empty = rows.every((r) => !r.runs.length)

  return (
    <section className="mt-5 border-t border-black/10 pt-4" aria-label="Kanban Flow" data-testid="kanban-flow">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display text-base font-bold">Kanban Flow</h3>
        <span className="text-xs text-muted">사람마다 시간에 따라 Doing이던 업무 (Daily Log 기준) · 같은 업무는 같은 색 · 누르면 그 시간으로 되감기</span>
      </header>
      {empty ? (
        <p className="text-sm text-muted">이날 Doing이던 업무가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[36rem] grid-cols-[minmax(5rem,9rem)_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
            <span />
            <div className="grid text-[10px] text-muted" style={grid} aria-hidden>
              {slots.map((i) => (
                <span key={i} className={cx('text-left', pos === i && 'font-bold text-primary')}>
                  {slotToTime(i).endsWith(':00') ? slotToTime(i).slice(0, 2) : ''}
                </span>
              ))}
            </div>
            {rows.map(({ p, runs }) => (
              <div key={p.id} className="contents" data-testid="flow-person" data-person={p.name}>
                <span className="te-clip text-sm font-semibold" title={p.name}>
                  {p.name}
                </span>
                <div className="relative grid h-8 rounded-control bg-black/[0.03]" style={grid}>
                  {/* every half hour can be pressed, also where nothing was Doing */}
                  {slots.map((slot, k) => (
                    <button
                      key={slot}
                      type="button"
                      aria-label={`${p.name} ${slotToTime(slot)}`}
                      className={cx('row-start-1 h-8 hover:bg-black/5', pos === slot && 'bg-primary/15')}
                      style={{ gridColumn: `${k + 1} / span 1` }}
                      onClick={() => onPick(slot)}
                    />
                  ))}
                  {runs.map((run) => {
                    const name = run.card.description.trim() || EMPTY_TASK_LABEL
                    const color = colorOf.get(taskKey(run.card))!
                    const from = slots[run.start]
                    return (
                      <button
                        key={`${run.start}-${run.card.id}`}
                        type="button"
                        data-testid="flow-block"
                        data-task={name}
                        data-start={from}
                        data-len={run.len}
                        title={`${name} · ${slotToTime(from)}–${slotToTime(from + run.len)}`}
                        className="row-start-1 z-10 mx-px flex h-8 min-w-0 items-center rounded-[6px] border-l-[3px] px-1.5 text-left text-[11px] font-semibold text-ink shadow-sm hover:brightness-95"
                        style={{ gridColumn: `${run.start + 1} / span ${run.len}`, backgroundColor: chipBg(color), borderLeftColor: color }}
                        onClick={(e) => onPick(at(e, run))}
                      >
                        <span className="truncate">{name}</span>
                      </button>
                    )
                  })}
                  {pos !== null && slots.includes(pos) && (
                    <span
                      aria-hidden
                      data-testid="flow-now"
                      className="pointer-events-none row-start-1 z-20 h-8 rounded-[4px] outline outline-2 outline-[#1f4d3a]"
                      style={{ gridColumn: `${slots.indexOf(pos) + 1} / span 1` }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
