import { CircleAlert, MoreHorizontal, Plus, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ColorMenu } from '../../components/ColorMenu'
import { TimeRangePicker } from '../../components/TimeRangePicker'
import { Button, Card, ErrorNote, Loading, Pill, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { isNewProject, isSelectable } from '../../domain/projects'
import { SLOTS_PER_DAY, SLOT_HOURS, currentSlot, timeToSlot, todayLocal } from '../../domain/time'
import type { TaskTemplate, TimeSlot } from '../../domain/types'
import { useAsync, useFillToViewport, useIsMobile, useMinuteClock } from '../../lib/hooks'
import { useT } from '../../lib/i18n'
import { moveItem, sortItems } from '../../lib/ordering'
import { useDragReorder } from '../../lib/useDragReorder'
import { categoryColor, chipBg, templateColor } from './colors'
import { DailyGrid, templateCategory, type GridColors, type GridOptionsApi } from './grid/DailyGrid'
import { applyTemplate, effectiveSlot, type CellChange, type GridContext } from './grid/gridModel'
import { ImportWizard } from './ImportWizard'
import { MobileDayLog } from './mobile/MobileDayLog'
import { displayName } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'
import { useColorPrefs } from './useColorPrefs'

export function DailyLog() {
  const tr = useT()
  const { store } = useStore()
  const user = useUser()
  const { search } = useLocation()
  const { date, engineer, projects, aliases, latestImport, reloadMaster } = useTimesheets()
  const canEdit = user.role !== 'viewer' && (engineer.id === user.id || user.role === 'admin')

  const q = useAsync(() => store.listSlots(engineer.id, date, date), [store, engineer.id, date])
  const templatesQ = useAsync(() => store.listTemplates(user.id), [store, user.id])
  const [localOrder, setLocalOrder] = useState<string[] | null>(null) // optimistic drag order
  useEffect(() => setLocalOrder(null), [templatesQ.data])
  const templates = useMemo(() => {
    const list = [...(templatesQ.data ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    if (!localOrder) return list
    const rank = new Map(localOrder.map((id, i) => [id, i]))
    return list.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))
  }, [templatesQ.data, localOrder])
  const [slots, setSlots] = useState<Map<number, TimeSlot>>(new Map())
  const [error, setError] = useState<Error | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selection, setSelection] = useState<{ rows: number[]; active: number }>({ rows: [], active: 0 })
  const [chipMenu, setChipMenu] = useState<{ id: string; anchor: DOMRect } | null>(null)
  const chipBox = useRef<HTMLUListElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const fillHeight = useFillToViewport(page) // wide screens: end where the left navigation ends
  const filled = fillHeight !== undefined
  const isMobile = useIsMobile() // phones get a tap-friendly list instead of the spreadsheet
  const undoStack = useRef<CellChange[][]>([])
  const colorPrefs = useColorPrefs()
  const { prefs } = colorPrefs
  const clock = useMinuteClock()
  const now = date === todayLocal(clock) ? currentSlot(clock) : null

  // Working hours of this day: saved per day, else the profile default (Settings → Work hours).
  const workDayQ = useAsync(() => store.getWorkDay(engineer.id, date), [store, engineer.id, date])
  const [hoursEdit, setHoursEdit] = useState<{ key: string; start: string; end: string } | null>(null)
  const dayKey = `${engineer.id}-${date}`
  const hours =
    hoursEdit?.key === dayKey
      ? hoursEdit
      : workDayQ.data
        ? { start: workDayQ.data.start_time, end: workDayQ.data.end_time }
        : { start: engineer.work_start, end: engineer.work_end }

  async function changeHours(range: { start: string; end: string }) {
    setHoursEdit({ key: dayKey, ...range })
    try {
      await store.saveWorkDay({ user_id: engineer.id, work_date: date, start_time: range.start, end_time: range.end })
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
  }

  useEffect(() => {
    if (q.data) setSlots(new Map(q.data.map((s) => [s.slot_index, s])))
  }, [q.data])
  useEffect(() => {
    undoStack.current = []
  }, [date, engineer.id])

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const newProjects = projects.filter((p) => !p.hidden && isNewProject(p, latestImport))

  // Lunch (Settings → Work hours, default 12:00–13:00) shows as 점심 unless something else is saved.
  const lunch = useMemo(() => {
    const set = new Set<number>()
    for (let i = timeToSlot(engineer.lunch_start); i < timeToSlot(engineer.lunch_end); i++) set.add(i)
    return set
  }, [engineer.lunch_start, engineer.lunch_end])

  const ctx = useMemo<GridContext>(
    () => ({
      projects,
      aliases,
      byId,
      saved: slots,
      lunch,
      blank: (index) => ({ user_id: engineer.id, work_date: date, slot_index: index, kind: 'work', group_project_id: null, label: '', description: '', details: '', focus: null }),
      color: (kind, projectId) => categoryColor(kind, projectId ? byId.get(projectId) : undefined, prefs),
    }),
    [projects, aliases, byId, slots, lunch, engineer.id, date, prefs],
  )

  const colorOfTemplate = (t: TaskTemplate) => templateColor(t, t.group_project_id ? byId.get(t.group_project_id) : undefined, prefs)
  const gridColors: GridColors = {
    saved: prefs.palette,
    isCustom: colorPrefs.isCustom,
    setCategory: (key, hex) => void colorPrefs.setCategoryColor(key, hex),
    save: (hex) => void colorPrefs.savePreset(hex),
    removeSaved: (hex) => void colorPrefs.removePreset(hex),
    template: colorOfTemplate,
  }

  const rows = useMemo(() => {
    if (showAll) return Array.from({ length: SLOTS_PER_DAY }, (_, i) => i)
    const first = timeToSlot(hours.start)
    const last = Math.max(first, timeToSlot(hours.end) - 1)
    const set = new Set<number>(slots.keys())
    for (let i = first; i <= last; i++) set.add(i)
    return [...set].sort((a, b) => a - b)
  }, [showAll, hours.start, hours.end, slots])

  /** Save changes optimistically; `record` keeps the previous state for Ctrl+Z. */
  async function persist(changes: CellChange[], record = true) {
    const real = changes.filter((c) => c.slot || slots.has(c.index)) // deleting nothing is a no-op
    if (!real.length) return
    if (record) undoStack.current.push(real.map((c) => ({ index: c.index, slot: slots.get(c.index) ?? null })))
    setSlots((prev) => {
      const m = new Map(prev)
      for (const c of real) (c.slot ? m.set(c.index, c.slot) : m.delete(c.index))
      return m
    })
    try {
      await store.saveSlots(real.flatMap((c) => (c.slot ? [c.slot] : [])))
      await store.clearSlots(engineer.id, date, real.filter((c) => !c.slot).map((c) => c.index))
      setError(null)
    } catch (e) {
      setError(e as Error)
      q.reload()
    }
  }

  function undo() {
    const last = undoStack.current.pop()
    if (last) void persist(last, false)
  }

  const onSelectionChange = useCallback((rowsSel: number[], active: number) => setSelection({ rows: rowsSel, active }), [])

  async function createTemplate(t: Pick<TaskTemplate, 'kind' | 'group_project_id' | 'label' | 'description'>) {
    const exists = templates.some(
      (x) => x.kind === t.kind && x.group_project_id === t.group_project_id && x.label === t.label && x.description === t.description,
    )
    if (exists) return
    try {
      await store.addTemplate({ ...t, user_id: user.id, sort_order: templates.length + 1, color: null })
      templatesQ.reload()
    } catch (e) {
      setError(e as Error)
    }
  }

  function saveSelectedRowAsTemplate() {
    const s = effectiveSlot(ctx, selection.active)
    if (!s || (!s.description.trim() && !s.label.trim() && !s.group_project_id)) {
      setError(new Error('선택한 행에 카테고리나 업무 내용이 없습니다.'))
      return
    }
    void createTemplate({ kind: s.kind, group_project_id: s.group_project_id, label: s.label, description: s.description })
  }

  async function updateTemplate(id: string, patch: Parameters<typeof store.updateTemplate>[1]) {
    try {
      await store.updateTemplate(id, patch)
      templatesQ.reload()
    } catch (e) {
      setError(e as Error)
    }
  }

  /** New manual order of repeated tasks (drag in the dropdown or the chips). */
  async function reorderTemplates(ids: string[]) {
    setLocalOrder(ids)
    if (prefs.sort.template !== 'manual') void colorPrefs.update((p) => ({ ...p, sort: { ...p.sort, template: 'manual' } }))
    try {
      for (const [i, id] of ids.entries()) {
        const t = templates.find((x) => x.id === id)
        if (t && t.sort_order !== i + 1) await store.updateTemplate(id, { sort_order: i + 1 })
      }
      templatesQ.reload()
    } catch (e) {
      setError(e as Error)
    }
  }

  const optionsApi: GridOptionsApi = {
    sort: prefs.sort,
    categoryOrder: prefs.categoryOrder,
    setSort: (list, mode) => void colorPrefs.update((p) => ({ ...p, sort: { ...p.sort, [list]: mode } })),
    reorderCategories: (keys) =>
      void colorPrefs.update((p) => ({
        ...p,
        categoryOrder: [...keys, ...p.categoryOrder.filter((k) => !keys.includes(k))],
        sort: { ...p.sort, category: 'manual' },
      })),
    reorderTemplates: (ids) => void reorderTemplates(ids),
    renameTemplate: (id, name) => void updateTemplate(id, { description: name }),
    deleteTemplate: (id) => void deleteTemplate(id),
    setTemplateColor: (id, hex) => void updateTemplate(id, { color: hex }),
  }

  // chips on the right follow the same sort as the Task dropdown
  const chips = sortItems(templates, prefs.sort.template, { key: (t) => t.id, name: (t) => t.description || t.label, created: (t) => t.created_at }, templates.map((t) => t.id))
  const chipDrag = useDragReorder(chipBox, (_, from, to) => void reorderTemplates(moveItem(chips.map((t) => t.id), from, to)), 5)
  const chipMenuTemplate = chipMenu ? templates.find((t) => t.id === chipMenu.id) : undefined

  async function deleteTemplate(id: string) {
    try {
      await store.deleteTemplate(id)
      templatesQ.reload()
    } catch (e) {
      setError(e as Error)
    }
  }

  async function mapLabel(label: string, groupProjectId: string) {
    try {
      await store.addAlias(groupProjectId, label)
      await persist(
        [...slots.values()]
          .filter((s) => s.kind === 'work' && !s.group_project_id && s.label === label)
          .map((s) => ({ index: s.slot_index, slot: { ...s, group_project_id: groupProjectId } })),
      )
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  const work = [...slots.values()].filter((s) => s.kind === 'work')
  const total = work.length * SLOT_HOURS
  const breakdown = new Map<string, { hours: number; color: string }>()
  for (const s of work) {
    const key = s.group_project_id ? displayName(byId.get(s.group_project_id)!) : `⚠ ${s.label || 'Unmapped'}`
    const cur = breakdown.get(key) ?? { hours: 0, color: ctx.color(s.kind, s.group_project_id) }
    breakdown.set(key, { ...cur, hours: cur.hours + SLOT_HOURS })
  }
  const unmappedLabels = [...new Set(work.filter((s) => !s.group_project_id && s.label).map((s) => s.label))]

  return (
    <div ref={page} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" style={filled ? { height: fillHeight } : undefined} data-testid="daily-log-page">
      <Card
        className={cx('flex min-h-0 flex-col', filled && 'h-full')}
        title={tr('30-min Log')}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TimeRangePicker
              start={hours.start}
              end={hours.end}
              targetHours={engineer.daily_target_hours}
              lunchStart={engineer.lunch_start}
              lunchEnd={engineer.lunch_end}
              disabled={!canEdit}
              onChange={(r) => void changeHours(r)}
            />
            <label className="flex items-center gap-1 text-sm text-muted">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 24h
            </label>
            {canEdit && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                <Upload size={16} /> Import .xlsx
              </Button>
            )}
          </div>
        }
      >
        <ErrorNote error={error ?? q.error ?? colorPrefs.error} />
        {q.loading && !q.data ? (
          <Loading />
        ) : isMobile ? (
          <MobileDayLog
            key={`${engineer.id}-${date}`}
            rows={rows}
            ctx={ctx}
            templates={templates}
            templateColor={colorOfTemplate}
            now={now}
            readOnly={!canEdit}
            onChange={(changes) => void persist(changes)}
          />
        ) : (
          <div className={cx('min-h-0 flex-1 overflow-auto', !filled && 'max-h-[70vh]')} data-testid="grid-scroll">
            <DailyGrid
              key={`${engineer.id}-${date}`}
              rows={rows}
              ctx={ctx}
              templates={templates}
              colors={gridColors}
              options={optionsApi}
              layout={prefs.grid}
              onLayoutChange={(grid) => void colorPrefs.update((p) => ({ ...p, grid }))}
              now={now}
              readOnly={!canEdit}
              onChange={(changes) => void persist(changes)}
              onUndo={undo}
              onCreateTemplate={(t) => void createTemplate(t)}
              onSelectionChange={onSelectionChange}
            />
          </div>
        )}
      </Card>

      <div className={cx('flex flex-col gap-4', filled && 'min-h-0 overflow-y-auto')}>
        <Card title={tr('Today')}>
          <div className="font-display text-5xl font-extrabold text-primary" data-testid="today-total">
            {Math.floor(total)}h {total % 1 ? '30m' : '00m'}
          </div>
          <p className="mb-3 text-sm text-muted">{tr('target')} {engineer.daily_target_hours}h</p>
          <ul className="space-y-1.5 text-sm">
            {[...breakdown.entries()]
              .sort((a, b) => b[1].hours - a[1].hours)
              .map(([name, v]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: v.color }} />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="font-semibold tabular-nums">{v.hours.toFixed(1)}h</span>
                </li>
              ))}
          </ul>
        </Card>

        {/* phones apply repeated tasks from the entry sheet; managing them stays on the desktop layout */}
        <Card
          className="max-md:hidden"
          title="반복 업무"
          action={
            canEdit && (
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={saveSelectedRowAsTemplate}>
                <Plus size={14} /> 선택한 행 저장
              </Button>
            )
          }
        >
          {templates.length === 0 ? (
            <p className="text-sm text-muted">
              자주 하는 업무를 등록해 두세요. 행을 고르고 <strong>선택한 행 저장</strong>을 누르거나, {tr('Sub Category')} 칸에 입력한 뒤 <strong>+ 반복 업무로 등록</strong>을 고르면 됩니다.
            </p>
          ) : (
            <ul ref={chipBox} className="flex flex-wrap gap-2" data-testid="templates">
              {chips.map((t, i) => {
                const d = chipDrag.state
                const name = t.description || t.label
                return (
                  <li
                    key={t.id}
                    data-reorder="chips"
                    className={cx(
                      'group flex touch-none items-center rounded-chip text-sm font-semibold shadow-sm',
                      d?.from === i && 'opacity-40',
                      d && d.over === i && d.from !== i && 'ring-2 ring-primary',
                    )}
                    style={{ backgroundColor: chipBg(colorOfTemplate(t)) }}
                    {...(canEdit ? chipDrag.bind('chips', i) : {})}
                  >
                    <button
                      className="max-w-[220px] truncate py-1 pl-3 pr-1 text-left"
                      title={`${templateCategory(t, ctx)} · ${t.description}`}
                      disabled={!canEdit}
                      onClick={() => {
                        if (chipDrag.consumeDragged()) return
                        void persist(selection.rows.map((r) => ({ index: r, slot: applyTemplate(effectiveSlot(ctx, r), r, t, ctx) })))
                      }}
                    >
                      {name}
                    </button>
                    <button
                      aria-label={`Options for ${name}`}
                      className="rounded-chip p-1 pr-2 opacity-50 hover:opacity-100 group-hover:opacity-100"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => setChipMenu({ id: t.id, anchor: (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect() })}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {templates.length > 0 && <p className="mt-2 text-xs text-muted">칩을 누르면 선택한 {selection.rows.length}개 행에 적용 · 끌어서 순서 변경 · … 에서 이름·색·삭제</p>}
          {chipMenu && chipMenuTemplate && (
            <ColorMenu
              key={chipMenu.id}
              anchor={chipMenu.anchor}
              title={chipMenuTemplate.description || chipMenuTemplate.label}
              onRename={(n) => void updateTemplate(chipMenuTemplate.id, { description: n })}
              onDelete={() => {
                void deleteTemplate(chipMenuTemplate.id)
                setChipMenu(null)
              }}
              value={colorOfTemplate(chipMenuTemplate)}
              isCustom={chipMenuTemplate.color !== null}
              saved={prefs.palette}
              onPick={(hex) => void updateTemplate(chipMenuTemplate.id, { color: hex })}
              onSave={(hex) => void colorPrefs.savePreset(hex)}
              onRemoveSaved={(hex) => void colorPrefs.removePreset(hex)}
              onClose={() => setChipMenu(null)}
            />
          )}
        </Card>

        {newProjects.length > 0 && (
          <Card tone="accent" title={`${newProjects.length} new group project${newProjects.length > 1 ? 's' : ''} detected`}>
            <ul className="mb-3 space-y-1.5">
              {newProjects.map((p) => (
                <li key={p.id} className="truncate rounded-control bg-white/90 px-3 py-1.5 text-sm font-semibold text-ink">
                  {p.name}
                </li>
              ))}
            </ul>
            <Link to={{ pathname: '/timesheets/projects', search }} className="inline-block rounded-control bg-white px-4 py-1.5 text-sm font-semibold text-ink">
              Map now
            </Link>
          </Card>
        )}

        {unmappedLabels.length > 0 && (
          <Card tone="sage" title={<span className="flex items-center gap-2"><CircleAlert size={18} /> {tr('Unmapped categories')}</span>}>
            <p className="mb-2 text-sm text-muted">These hours are not in any group project yet. Pick one to save an alias for everyone.</p>
            <ul className="space-y-2">
              {unmappedLabels.map((label) => (
                <li key={label} className="flex items-center gap-2">
                  <Pill tone="orange">{label}</Pill>
                  <select
                    aria-label={`Map ${label}`}
                    className="field !py-1 text-sm"
                    defaultValue=""
                    disabled={!canEdit}
                    onChange={(e) => e.target.value && void mapLabel(label, e.target.value)}
                  >
                    <option value="">Map to…</option>
                    {projects
                      .filter(isSelectable)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {displayName(p)}
                        </option>
                      ))}
                  </select>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {importing && (
        <ImportWizard
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false)
            reloadMaster()
            q.reload()
          }}
        />
      )}
    </div>
  )
}
