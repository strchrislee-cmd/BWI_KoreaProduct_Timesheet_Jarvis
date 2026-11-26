import { ChartPie, CircleAlert, GripVertical, LayoutDashboard, List, Plus, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { SLOTS_CHANGED } from '../../components/ReminderToast'
import { TimeRangePicker } from '../../components/TimeRangePicker'
import { Button, Card, ErrorNote, Loading, Pill, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { isNewProject, isSelectable } from '../../domain/projects'
import { SLOTS_PER_DAY, SLOT_HOURS, currentSlot, timeToSlot, todayLocal } from '../../domain/time'
import type { TaskTemplate, TimeSlot } from '../../domain/types'
import { useAsync, useFillToViewport, useIsMobile, useMinuteClock } from '../../lib/hooks'
import { useT } from '../../lib/i18n'
import { sortItems } from '../../lib/ordering'
import { categoryColor, templateColor } from './colors'
import { DailyGrid, type GridColors, type GridOptionsApi } from './grid/DailyGrid'
import { applyTemplate, cellText, effectiveSlot, type CellChange, type GridContext } from './grid/gridModel'
import { ImportWizard } from './ImportWizard'
import { TemplatesTable } from './TemplatesTable'
import { TodayDonut } from './TodayDonut'
import { DotGrid, EdgeDock, EdgeDropHint, LayoutToast, LayoutWindow, SidePanel, useWindowLayout } from './layout/WindowLayout'
import { canvasHeight, type PanelId, type SidePanelId } from '../../lib/layout'
import { MobileDayLog } from './mobile/MobileDayLog'
import { displayName } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'
import { useColorPrefs } from './useColorPrefs'
import { EMPTY_TASK_CONFIRM, QUICK_TASKS, quickTaskName } from '../../domain/quickTasks'

export function DailyLog() {
  const tr = useT()
  const { store } = useStore()
  const user = useUser()
  const { search } = useLocation()
  const { date, engineer, projects, aliases, workTypes, latestImport, reloadMaster } = useTimesheets()
  const canEdit = engineer.id === user.id || user.role === 'admin'

  const q = useAsync(() => store.listSlots(engineer.id, date, date), [store, engineer.id, date])
  // the reminder toast saved something for this day: show it
  useEffect(() => {
    const onSaved = (e: Event) => (e as CustomEvent<{ date: string }>).detail.date === date && q.reload()
    window.addEventListener(SLOTS_CHANGED, onSaved)
    return () => window.removeEventListener(SLOTS_CHANGED, onSaved)
  }, [date, q.reload])
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
  const workTypeById = useMemo(() => new Map(workTypes.map((w) => [w.id, w])), [workTypes])
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
      workTypes,
      workTypeById,
      saved: slots,
      lunch,
      blank: (index) => ({ user_id: engineer.id, work_date: date, slot_index: index, kind: 'work', group_project_id: null, label: '', description: '', details: '', focus: null, work_type_id: null }),
      color: (kind, projectId) => categoryColor(kind, projectId ? byId.get(projectId) : undefined, prefs),
    }),
    [projects, aliases, byId, workTypes, workTypeById, slots, lunch, engineer.id, date, prefs],
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

  /** Save a repeated task (category, MID, sub category — never the content); returns false when it already exists. */
  async function createTemplate(t: Pick<TaskTemplate, 'kind' | 'group_project_id' | 'label' | 'description' | 'work_type_id'>): Promise<boolean> {
    const exists = templates.some(
      (x) =>
        x.kind === t.kind &&
        x.group_project_id === t.group_project_id &&
        x.label === t.label &&
        x.description === t.description &&
        x.work_type_id === t.work_type_id,
    )
    if (exists) return false
    try {
      await store.addTemplate({ ...t, user_id: user.id, sort_order: templates.length + 1, color: null })
      templatesQ.reload()
      return true
    } catch (e) {
      setError(e as Error)
      return false
    }
  }

  /** the + in front of a row: everything but the time and the content becomes a repeated task */
  async function rowToTemplate(index: number): Promise<string> {
    const s = effectiveSlot(ctx, index)
    if (!s || (!s.description.trim() && !s.label.trim() && !s.group_project_id)) return ''
    const t = { kind: s.kind, group_project_id: s.group_project_id, label: s.label, description: s.description, work_type_id: s.work_type_id }
    if (!s.description.trim() && !window.confirm(EMPTY_TASK_CONFIRM)) return ''
    const name = [cellText(s, 'category', ctx.byId), cellText(s, 'mid', ctx.byId, ctx.workTypeById), quickTaskName(s)].filter(Boolean).join(' · ')
    return (await createTemplate(t)) ? `${QUICK_TASKS}에 추가: ${name}` : `이미 ${QUICK_TASKS}에 있습니다: ${name}`
  }

  function saveSelectedRowAsTemplate() {
    const s = effectiveSlot(ctx, selection.active)
    if (!s || (!s.description.trim() && !s.label.trim() && !s.group_project_id)) {
      setError(new Error('선택한 행에 프로젝트나 업무 내용이 없습니다.'))
      return
    }
    if (!s.description.trim() && !window.confirm(EMPTY_TASK_CONFIRM)) return
    void createTemplate({ kind: s.kind, group_project_id: s.group_project_id, label: s.label, description: s.description, work_type_id: s.work_type_id })
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

  // the repeated-task table on the right follows the same sort as the Task dropdown
  const chips = sortItems(templates, prefs.sort.template, { key: (t) => t.id, name: quickTaskName, created: (t) => t.created_at }, templates.map((t) => t.id))

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
      await store.addAlias(groupProjectId, label, user.role !== 'admin') // L1–L3: personal alias
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

  // windows on a dot grid (move / resize / right-edge dock), saved per user; phones keep the fixed layout
  const layout = useWindowLayout({
    saved: prefs.layout,
    onSave: (next) => void colorPrefs.update((p) => ({ ...p, layout: next })),
    page,
    enabled: !isMobile,
  })
  const inEdge = (id: SidePanelId) => layout.enabled && layout.cur.edge[id]
  const onPage: PanelId[] = ['log', ...(['today', 'quick'] as const).filter((id) => !inEdge(id))]
  const canvas = layout.canvas && layout.rects
  const fitHeight = filled || !!canvas

  const work = [...slots.values()].filter((s) => s.kind === 'work')
  const total = work.length * SLOT_HOURS
  const breakdown = new Map<string, { hours: number; color: string }>()
  for (const s of work) {
    const key = s.group_project_id ? displayName(byId.get(s.group_project_id)!) : `⚠ ${s.label || 'Unmapped'}`
    const cur = breakdown.get(key) ?? { hours: 0, color: ctx.color(s.kind, s.group_project_id) }
    breakdown.set(key, { ...cur, hours: cur.hours + SLOT_HOURS })
  }
  const unmappedLabels = [...new Set(work.filter((s) => !s.group_project_id && s.label).map((s) => s.label))]

  const logCard = (
    <Card
      className={cx('flex min-h-0 flex-col', fitHeight && 'h-full')}
      title={
        <span
          className={cx('flex items-center gap-2', layout.enabled && 'cursor-grab touch-none select-none')}
          onPointerDown={(e) => layout.startMove('log', e)}
          title={layout.enabled ? '끌어서 옮기기 (배치 편집)' : undefined}
          data-testid="log-handle"
        >
          {layout.enabled && <GripVertical size={16} className="-ml-1 text-muted" aria-hidden />}
          {tr('30-min Log')}
        </span>
      }
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
          {layout.enabled && !layout.editing && (
            <Button variant="ghost" onClick={layout.beginEdit} title="창을 옮기고 크기를 바꿉니다">
              <LayoutDashboard size={16} /> 배치 편집
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
        <div className={cx('min-h-0 flex-1 overflow-auto', !fitHeight && 'max-h-[70vh]')} data-testid="grid-scroll">
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
            onRowToTemplate={rowToTemplate}
            onSelectionChange={onSelectionChange}
          />
        </div>
      )}
    </Card>
  )
  const todayPanel = (
    <SidePanel
      id="today"
      layout={layout}
      title={tr('Today')}
      testId="today-panel"
      actions={
        <span className="flex rounded-control bg-black/5 p-0.5" role="group" aria-label="Today view">
          {(
            [
              ['list', '목록', <List key="l" size={14} />],
              ['graph', '그래프', <ChartPie key="g" size={14} />],
            ] as const
          ).map(([v, label, icon]) => (
            <button
              key={v}
              type="button"
              aria-pressed={prefs.todayView === v}
              aria-label={label}
              title={label}
              className={cx('rounded-[7px] p-1', prefs.todayView === v ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-ink')}
              onClick={() => void colorPrefs.update((p) => ({ ...p, todayView: v }))}
            >
              {icon}
            </button>
          ))}
        </span>
      }
    >
      {prefs.todayView === 'graph' ? (
        <>
          <TodayDonut items={[...breakdown].map(([name, v]) => ({ name, hours: v.hours, color: v.color }))} total={total} />
          <p className="mt-2 text-center text-xs text-muted">
            {tr('target')} {engineer.daily_target_hours}h · % = 오늘 기록한 시간 중 비율
          </p>
        </>
      ) : (
        <>
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
        </>
      )}
    </SidePanel>
  )

  const quickPanel = (
    <SidePanel
      id="quick"
      layout={layout}
      title={QUICK_TASKS}
      testId="templates-panel"
      actions={
        canEdit && (
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={saveSelectedRowAsTemplate}>
            <Plus size={14} /> 선택한 행 저장
          </Button>
        )
      }
    >
      {templates.length === 0 ? (
        <p className="text-sm text-muted">
          자주 하는 업무를 등록해 두세요. 행 앞 <strong>+</strong>를 누르거나, 행을 고르고 <strong>선택한 행 저장</strong>, 또는 {tr('Task')} 칸에 입력한 뒤 <strong>{QUICK_TASKS}에 추가</strong>를 고르면 됩니다.
        </p>
      ) : (
        <TemplatesTable
          items={chips}
          ctx={ctx}
          colorOf={colorOfTemplate}
          canEdit={canEdit}
          selectedCount={selection.rows.length}
          onApply={(t) => void persist(selection.rows.map((r) => ({ index: r, slot: applyTemplate(effectiveSlot(ctx, r), r, t, ctx) })))}
          onReorder={(ids) => void reorderTemplates(ids)}
          onRename={(id, n) => void updateTemplate(id, { description: n })}
          onDelete={(id) => void deleteTemplate(id)}
          onColor={(id, hex) => void updateTemplate(id, { color: hex })}
          palette={{ saved: prefs.palette, onSave: (hex) => void colorPrefs.savePreset(hex), onRemove: (hex) => void colorPrefs.removePreset(hex) }}
        />
      )}
    </SidePanel>
  )

  // shown under the windows (default layout: in the right column)
  const notices = (
    <>
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
            <p className="mb-2 text-sm text-muted">
              {user.role === 'admin'
                ? 'These hours are not in any group project yet. Pick one to save an alias for everyone.'
                : '아직 그룹 프로젝트에 연결되지 않은 시간입니다. 하나를 고르면 내 별칭(나에게만 적용)으로 저장됩니다.'}
            </p>
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
    </>
  )

  return (
    <>
      {canvas ? (
        <>
          <div
            ref={page}
            className="relative"
            style={{ height: Math.max(canvasHeight(canvas, onPage), layout.editing ? (fillHeight ?? 0) : 0) }}
            data-testid="daily-log-page"
            data-layout="grid"
          >
            {layout.editing && <DotGrid />}
            {onPage.map((id) => (
              <LayoutWindow key={id} id={id} layout={layout}>
                {id === 'log' ? logCard : id === 'today' ? todayPanel : quickPanel}
              </LayoutWindow>
            ))}
          </div>
          {(newProjects.length > 0 || unmappedLabels.length > 0) && <div className="mt-4 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{notices}</div>}
        </>
      ) : (
        <div
          ref={page}
          className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"
          style={filled ? { height: fillHeight } : undefined}
          data-testid="daily-log-page"
          data-layout="default"
        >
          <LayoutWindow id="log" layout={layout} flowClassName={cx('flex min-h-0 flex-col', filled && 'h-full')}>
            {logCard}
          </LayoutWindow>
          <div className={cx('flex flex-col gap-4', filled && 'min-h-0 overflow-y-auto')}>
            {!inEdge('today') && (
              <LayoutWindow id="today" layout={layout}>
                {todayPanel}
              </LayoutWindow>
            )}
            {/* phones apply quick tasks from the entry sheet; managing them stays on the desktop layout */}
            {!inEdge('quick') && (
              <LayoutWindow id="quick" layout={layout} flowClassName="max-md:hidden">
                {quickPanel}
              </LayoutWindow>
            )}
            {notices}
          </div>
        </div>
      )}

      {layout.enabled && (inEdge('today') || inEdge('quick')) && (
        <EdgeDock>
          {(['today', 'quick'] as const)
            .filter(inEdge)
            .map((id) => (
              <div key={id} ref={layout.register(id)} data-window={id}>
                {id === 'today' ? todayPanel : quickPanel}
              </div>
            ))}
        </EdgeDock>
      )}
      {layout.editing && <LayoutToast layout={layout} />}
      {layout.near && <EdgeDropHint />}

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
    </>
  )
}
