import { useState } from 'react'
import { cx } from '../../components/ui'
import { WORK_TYPE_GRAY } from '../../domain/workTypes'

export interface DonutItem {
  name: string
  hours: number
  /** the project's colour, as in the 30-min log */
  color: string
}

/** at most this many slices; the rest fold into 기타 so close slices stay readable */
const MAX_SLICES = 6
const SIZE = 136
const STROKE = 18
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R
/** surface gap between slices (px along the ring) */
const GAP = 2

export const hoursText = (h: number) => `${Math.floor(h)}h ${h % 1 ? '30m' : '00m'}`

/** largest first; past MAX_SLICES the smallest fold into one 기타 slice */
export function donutSlices(items: DonutItem[]): DonutItem[] {
  const sorted = [...items].filter((i) => i.hours > 0).sort((a, b) => b.hours - a.hours)
  if (sorted.length <= MAX_SLICES) return sorted
  const head = sorted.slice(0, MAX_SLICES - 1)
  const rest = sorted.slice(MAX_SLICES - 1).reduce((n, i) => n + i.hours, 0)
  return [...head, { name: '기타', hours: rest, color: WORK_TYPE_GRAY }]
}

/** share of the logged total, rounded to whole percent */
export const percent = (hours: number, total: number) => (total > 0 ? Math.round((hours / total) * 100) : 0)

/**
 * Today as a donut: how today's logged hours split across projects (% of the hours logged so far),
 * with the total in the middle. Hovering a slice or a legend row shows that item in the middle.
 * The legend lists every slice with its % and hours, so close slices can still be told apart.
 */
export function TodayDonut({ items, total }: { items: DonutItem[]; total: number }) {
  const slices = donutSlices(items)
  const [hover, setHover] = useState<number | null>(null)
  const focus = hover !== null ? slices[hover] : undefined

  let offset = 0
  const arcs = slices.map((s, i) => {
    const len = (s.hours / total) * C
    const arc = { i, s, dash: Math.max(len - (slices.length > 1 ? GAP : 0), 0.5), offset }
    offset += len
    return arc
  })

  return (
    // a wide window (≥ 28rem): the donut on the left, the hours on the right
    <div data-testid="today-donut" className="flex flex-col gap-3 @md:flex-row @md:items-center @md:gap-6">
      <div className="flex shrink-0 justify-center">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`오늘 ${hoursText(total)}: ${slices.map((s) => `${s.name} ${percent(s.hours, total)}%`).join(', ') || '기록 없음'}`}
            className="-rotate-90"
          >
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-black/[0.06]" />
            {arcs.map(({ i, s, dash, offset: o }) => (
              <circle
                key={s.name}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? STROKE + 4 : STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-o}
                className={cx('cursor-default transition-[stroke-width,opacity] duration-150', hover !== null && hover !== i && 'opacity-40')}
                data-slice={s.name}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              >
                <title>{`${s.name} · ${percent(s.hours, total)}% · ${s.hours.toFixed(1)}h`}</title>
              </circle>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center leading-tight" data-testid="donut-center">
            {focus ? (
              <>
                <span className="font-display text-2xl font-extrabold text-ink">{percent(focus.hours, total)}%</span>
                <span className="line-clamp-2 text-[11px] text-muted">{focus.name}</span>
              </>
            ) : (
              <>
                <span className="font-display text-2xl font-extrabold text-primary">{hoursText(total)}</span>
                <span className="text-[11px] text-muted">{total > 0 ? '오늘 기록' : '기록 없음'}</span>
              </>
            )}
          </div>
        </div>
      </div>
      {slices.length > 0 && (
        <ul className="min-w-0 space-y-1 text-sm @md:flex-1" aria-label="Today breakdown">
          {slices.map((s, i) => (
            <li
              key={s.name}
              className={cx('flex items-center gap-2 rounded-chip px-1 transition-colors', hover === i && 'bg-black/5')}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1">
                <span className="te-clip" title={s.name}>
                  {s.name}
                </span>
              </span>
              <span className="w-10 text-right font-semibold tabular-nums">{percent(s.hours, total)}%</span>
              <span className="w-10 text-right tabular-nums text-muted">{s.hours.toFixed(1)}h</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
