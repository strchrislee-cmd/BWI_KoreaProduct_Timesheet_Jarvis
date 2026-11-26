// Phone version of the 30-min log: one tappable row per half hour and a bottom sheet to edit it.
// Uses the same pure grid model as the desktop spreadsheet, so saving rules are identical.
import { ChevronRight, Minus, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../../components/ui'
import { isSelectable, projectNumbers } from '../../../domain/projects'
import { SLOTS_PER_DAY, slotToTime } from '../../../domain/time'
import { selectableWorkTypes } from '../../../domain/workTypes'
import type { TaskTemplate } from '../../../domain/types'
import { QUICK_TASKS, quickTaskName } from '../../../domain/quickTasks'
import { chipBg, rowBg } from '../colors'
import { NONWORK_CHOICES, templateCategory } from '../grid/DailyGrid'
import { buildChanges, cellText, effectiveSlot, isLunchDefault, type CellChange, type CellOp, type GridContext } from '../grid/gridModel'
import { KIND_LABEL, displayName } from '../projectUi'
import { useT } from '../../../lib/i18n'

interface Draft {
  category: string
  /** MID name ('' = none) */
  mid: string
  task: string
  details: string
}

const MAX_SPAN = 8 // apply to up to 4 hours at once

export function MobileDayLog({
  rows,
  ctx,
  templates,
  templateColor,
  now,
  readOnly,
  onChange,
}: {
  rows: number[]
  ctx: GridContext
  templates: TaskTemplate[]
  templateColor: (t: TaskTemplate) => string
  now: { slot: number; frac: number; time: string } | null
  readOnly: boolean
  onChange: (changes: CellChange[]) => void
}) {
  const [open, setOpen] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // today: bring the current half hour into view once
  useEffect(() => {
    if (now) listRef.current?.querySelector(`[data-slot="${now.slot}"]`)?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div ref={listRef} className="space-y-1.5" role="list" aria-label="30-min log">
        {rows.map((i) => {
          const s = effectiveSlot(ctx, i)
          const lunch = isLunchDefault(ctx, i)
          const category = s ? cellText(s, 'category', ctx.byId) : ''
          const unmapped = !!s && s.kind === 'work' && !s.group_project_id
          const isNow = now?.slot === i
          return (
            <button
              key={i}
              role="listitem"
              data-slot={i}
              disabled={readOnly}
              aria-label={`${slotToTime(i)} ${category || '비어 있음'}`}
              onClick={() => setOpen(i)}
              className={cx(
                'relative flex w-full items-center gap-3 rounded-control border border-white/60 px-3 py-2 text-left disabled:opacity-100',
                !s && 'bg-white/35',
                isNow && 'ring-2 ring-now',
              )}
              style={s ? { backgroundColor: rowBg(ctx.color(s.kind, s.group_project_id)) } : undefined}
            >
              <span className={cx('w-12 shrink-0 font-mono text-[13px] font-semibold', isNow && 'text-now')}>{slotToTime(i)}</span>
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-sm font-semibold', !s && 'font-normal text-muted/70', lunch && 'text-muted', unmapped && 'text-[#9a3a0e]')}>
                  {s ? (unmapped ? `⚠ ${category || '카테고리 없음'}` : category) : '—'}
                  {lunch && <span className="ml-1 text-xs font-normal">(기본)</span>}
                </span>
                {s?.work_type_id && <span className="block truncate text-xs font-semibold text-ink/70">{cellText(s, 'mid', ctx.byId, ctx.workTypeById)}</span>}
                {s?.description && <span className="block truncate text-xs text-ink/80">{s.description}</span>}
                {s?.details && <span className="block truncate text-xs text-muted">{s.details}</span>}
              </span>
              {isNow && <span className="rounded-chip bg-now px-1.5 font-mono text-[10px] font-bold text-white">{now!.time}</span>}
              {!readOnly && <ChevronRight size={16} className="shrink-0 text-muted" />}
            </button>
          )
        })}
      </div>
      {open !== null && (
        <SlotSheet
          key={open}
          index={open}
          rows={rows}
          ctx={ctx}
          templates={templates}
          templateColor={templateColor}
          onClose={() => setOpen(null)}
          onSave={(changes, next) => {
            if (changes.length) onChange(changes)
            setOpen(next)
          }}
        />
      )}
    </div>
  )
}

function SlotSheet({
  index,
  rows,
  ctx,
  templates,
  templateColor,
  onClose,
  onSave,
}: {
  index: number
  rows: number[]
  ctx: GridContext
  templates: TaskTemplate[]
  templateColor: (t: TaskTemplate) => string
  onClose: () => void
  onSave: (changes: CellChange[], next: number | null) => void
}) {
  const tr = useT()
  const current = effectiveSlot(ctx, index)
  const [draft, setDraft] = useState<Draft>({
    category: current ? cellText(current, 'category', ctx.byId) : '',
    mid: current ? cellText(current, 'mid', ctx.byId, ctx.workTypeById) : '',
    task: current?.description ?? '',
    details: current?.details ?? '',
  })
  const [query, setQuery] = useState('')
  const [span, setSpan] = useState(1)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hit = (...xs: string[]) => !q || xs.some((x) => x.toLowerCase().includes(q))
    const numbers = projectNumbers(ctx.projects)
    const projectGroups = (['project', 'timelog', 'local_section'] as const).map((kind) => ({
      label: KIND_LABEL[kind],
      items: ctx.projects
        .filter((p) => isSelectable(p) && p.kind === kind)
        .filter((p) => hit(displayName(p), p.name, ...ctx.aliases.filter((a) => a.group_project_id === p.id).map((a) => a.alias)))
        .map((p) => ({ key: p.id, text: displayName(p), color: ctx.color('work', p.id), no: numbers.get(p.id) })),
    }))
    const nonwork = { label: tr('Non-work'), items: NONWORK_CHOICES.filter((l) => hit(l)).map((l) => ({ key: `nw:${l}`, text: l, color: ctx.color('nonwork', null), no: undefined })) }
    return [...projectGroups, nonwork].filter((g) => g.items.length)
  }, [query, ctx])
  const exact = groups.some((g) => g.items.some((o) => o.text.toLowerCase() === query.trim().toLowerCase()))

  // the half hours this edit covers (consecutive slots, not past 23:30)
  const targets = Array.from({ length: span }, (_, k) => index + k).filter((i) => i < SLOTS_PER_DAY)
  const last = targets[targets.length - 1]
  const nextIndex = rows.find((i) => i > last) ?? (last + 1 < SLOTS_PER_DAY ? last + 1 : null)

  function changesFor(d: Draft): CellChange[] {
    const ops: CellOp[] = targets.flatMap((i) => [
      { index: i, col: 'category' as const, text: d.category },
      { index: i, col: 'mid' as const, text: d.mid },
      { index: i, col: 'task' as const, text: d.task },
      { index: i, col: 'details' as const, text: d.details },
    ])
    return buildChanges(ops, ctx)
  }

  const applyTemplate = (t: TaskTemplate) =>
    set({ category: templateCategory(t, ctx), task: t.description, ...(t.work_type_id ? { mid: ctx.workTypeById.get(t.work_type_id)?.name ?? '' } : {}) })

  // portal: inside a glass card (backdrop-filter) `fixed` would be relative to the card, not the screen
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="30-min entry"
        className="glass-strong max-h-[90vh] w-full overflow-y-auto rounded-t-card p-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/15" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">
            <span className="font-mono">{slotToTime(index)}</span> – <span className="font-mono">{slotToTime(last + 1 === SLOTS_PER_DAY ? 0 : last + 1)}</span>
            {span > 1 && <span className="ml-2 text-sm font-normal text-muted">{span}칸 · {span * 30}분</span>}
          </h2>
          <button aria-label="Close" className="rounded-control p-1.5 hover:bg-black/5" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {templates.length > 0 && (
          <section className="mb-3">
            <h3 className="mb-1.5 text-xs font-semibold text-muted">{QUICK_TASKS}</h3>
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" data-testid="sheet-templates">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="shrink-0 rounded-chip px-2.5 py-1.5 text-sm font-semibold"
                  style={{ backgroundColor: chipBg(templateColor(t)) }}
                >
                  {quickTaskName(t)}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mb-3">
          <h3 className="mb-1.5 text-xs font-semibold text-muted">
            {tr('Project')} {draft.category && <span className="ml-1 font-semibold text-ink">· {draft.category}</span>}
          </h3>
          <input className="field mb-1.5 !py-2 text-[16px]" aria-label="Search category" placeholder="검색 (별칭도 됨)" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-44 space-y-2 overflow-y-auto rounded-control bg-white/40 p-1.5" role="listbox" aria-label="Categories">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase text-muted">{g.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((o) => (
                    <button
                      key={o.key}
                      role="option"
                      aria-selected={draft.category === o.text}
                      onClick={() => set({ category: o.text })}
                      className={cx('max-w-full truncate rounded-chip px-2 py-1 text-left text-[13px] font-medium', draft.category === o.text && 'ring-2 ring-primary')}
                      style={{ backgroundColor: chipBg(o.color) }}
                    >
                      {o.no !== undefined && <span className="mr-1 font-mono text-[11px] text-ink/50">{o.no}</span>}
                      {o.text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {query.trim() && !exact && (
              <button className="w-full rounded-chip px-2 py-1.5 text-left text-[13px] hover:bg-black/5" onClick={() => set({ category: query.trim() })}>
                + “{query.trim()}” 사용 <span className="text-xs text-muted">(미매핑 — 나중에 프로젝트에 연결)</span>
              </button>
            )}
            {!groups.length && !query.trim() && <p className="px-1 text-xs text-muted">카테고리가 없습니다.</p>}
          </div>
        </section>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">{tr('Type')}</span>
          <select className="field !py-2 text-[16px]" aria-label="Type" value={draft.mid} onChange={(e) => set({ mid: e.target.value })}>
            <option value="">—</option>
            {selectableWorkTypes(ctx.workTypes).map((w) => (
              <option key={w.id} value={w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">{tr('Task')}</span>
          <input className="field !py-2 text-[16px]" aria-label="Task" value={draft.task} onChange={(e) => set({ task: e.target.value })} placeholder="예: INT | Daily_Scrum" />
        </label>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">{tr('Content')}</span>
          <textarea className="field min-h-[72px] !py-2 text-[16px]" aria-label="업무내용" value={draft.details} onChange={(e) => set({ details: e.target.value })} placeholder="이 30분 동안 한 일" maxLength={2000} />
        </label>

        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">같은 내용으로 이어서 채우기</span>
          <div className="flex items-center gap-1" role="group" aria-label="Slots">
            <button aria-label="Fewer slots" className="rounded-control bg-black/5 p-2 disabled:opacity-40" disabled={span <= 1} onClick={() => setSpan((n) => n - 1)}>
              <Minus size={14} />
            </button>
            <span className="w-14 text-center font-mono text-sm font-semibold" data-testid="span">
              {span}칸
            </span>
            <button aria-label="More slots" className="rounded-control bg-black/5 p-2 disabled:opacity-40" disabled={span >= MAX_SPAN || index + span >= SLOTS_PER_DAY} onClick={() => setSpan((n) => n + 1)}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
          <button className="rounded-control bg-black/5 px-3 py-3 text-sm font-semibold text-[#9a3a0e]" onClick={() => onSave(changesFor({ category: '', mid: '', task: '', details: '' }), null)}>
            지우기
          </button>
          <button className="rounded-control border border-primary bg-white/80 px-3 py-3 text-sm font-semibold text-primary" onClick={() => onSave(changesFor(draft), null)}>
            저장
          </button>
          <button className="rounded-control bg-primary px-3 py-3 text-sm font-semibold text-white" disabled={nextIndex === null} onClick={() => onSave(changesFor(draft), nextIndex)}>
            저장 후 다음 칸
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
