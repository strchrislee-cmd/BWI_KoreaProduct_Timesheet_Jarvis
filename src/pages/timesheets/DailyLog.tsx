import { CircleAlert, Plus, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Button, Card, ErrorNote, Loading, Pill, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { isNewProject } from '../../domain/projects'
import { SLOTS_PER_DAY, SLOT_HOURS, timeToSlot } from '../../domain/time'
import type { TaskTemplate, TimeSlot } from '../../domain/types'
import { useAsync } from '../../lib/hooks'
import { DailyGrid, templateCategory, templateTone } from './grid/DailyGrid'
import { applyTemplate, effectiveSlot, type CellChange, type GridContext } from './grid/gridModel'
import { ImportWizard } from './ImportWizard'
import { displayName } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'

export function DailyLog() {
  const { store } = useStore()
  const user = useUser()
  const { search } = useLocation()
  const { date, engineer, projects, aliases, latestImport, reloadMaster } = useTimesheets()
  const canEdit = user.role !== 'viewer' && (engineer.id === user.id || user.role === 'admin')

  const q = useAsync(() => store.listSlots(engineer.id, date, date), [store, engineer.id, date])
  const templatesQ = useAsync(() => store.listTemplates(user.id), [store, user.id])
  const templates = templatesQ.data ?? []
  const [slots, setSlots] = useState<Map<number, TimeSlot>>(new Map())
  const [error, setError] = useState<Error | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selection, setSelection] = useState<{ rows: number[]; active: number }>({ rows: [], active: 0 })
  const undoStack = useRef<CellChange[][]>([])

  useEffect(() => {
    if (q.data) setSlots(new Map(q.data.map((s) => [s.slot_index, s])))
  }, [q.data])
  useEffect(() => {
    undoStack.current = []
  }, [date, engineer.id])

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const newProjects = projects.filter((p) => isNewProject(p, latestImport))

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
      blank: (index) => ({ user_id: engineer.id, work_date: date, slot_index: index, kind: 'work', group_project_id: null, label: '', description: '', focus: null }),
    }),
    [projects, aliases, byId, slots, lunch, engineer.id, date],
  )

  const rows = useMemo(() => {
    if (showAll) return Array.from({ length: SLOTS_PER_DAY }, (_, i) => i)
    const first = timeToSlot(engineer.work_start)
    const [eh, em] = engineer.work_end.split(':').map(Number)
    const last = Math.max(first, Math.ceil((eh * 60 + em) / 30) - 1)
    const set = new Set<number>(slots.keys())
    for (let i = first; i <= last; i++) set.add(i)
    return [...set].sort((a, b) => a - b)
  }, [showAll, engineer.work_start, engineer.work_end, slots])

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
      await store.addTemplate({ ...t, user_id: user.id, sort_order: templates.length + 1 })
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
  const breakdown = new Map<string, number>()
  for (const s of work) {
    const key = s.group_project_id ? displayName(byId.get(s.group_project_id)!) : `⚠ ${s.label || 'Unmapped'}`
    breakdown.set(key, (breakdown.get(key) ?? 0) + SLOT_HOURS)
  }
  const unmappedLabels = [...new Set(work.filter((s) => !s.group_project_id && s.label).map((s) => s.label))]

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card
        title="30-min Log"
        action={
          <div className="flex items-center gap-2">
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
        <ErrorNote error={error ?? q.error} />
        {q.loading && !q.data ? (
          <Loading />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <DailyGrid
              key={`${engineer.id}-${date}`}
              rows={rows}
              ctx={ctx}
              templates={templates}
              readOnly={!canEdit}
              onChange={(changes) => void persist(changes)}
              onUndo={undo}
              onCreateTemplate={(t) => void createTemplate(t)}
              onSelectionChange={onSelectionChange}
            />
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        <Card title="Today">
          <div className="text-5xl font-extrabold text-primary" data-testid="today-total">
            {Math.floor(total)}h {total % 1 ? '30m' : '00m'}
          </div>
          <p className="mb-3 text-sm text-muted">target {engineer.daily_target_hours}h</p>
          <ul className="space-y-1.5 text-sm">
            {[...breakdown.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, h]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="font-semibold tabular-nums">{h.toFixed(1)}h</span>
                </li>
              ))}
          </ul>
        </Card>

        <Card
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
              자주 하는 업무를 등록해 두세요. 행을 고르고 <strong>선택한 행 저장</strong>을 누르거나, Task 칸에 입력한 뒤 <strong>+ 반복 업무로 등록</strong>을 고르면 됩니다.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2" data-testid="templates">
              {templates.map((t) => (
                <li key={t.id} className={cx('flex items-center rounded-full text-sm font-semibold', templateTone(t, ctx))}>
                  <button
                    className="max-w-[240px] truncate py-1 pl-3 pr-1 text-left"
                    title={`${templateCategory(t, ctx)} · ${t.description}`}
                    disabled={!canEdit}
                    onClick={() => void persist(selection.rows.map((i) => ({ index: i, slot: applyTemplate(effectiveSlot(ctx, i), i, t, ctx) })))}
                  >
                    {t.description || t.label}
                  </button>
                  <button aria-label={`Delete template ${t.description || t.label}`} className="rounded-full p-1 pr-2 opacity-60 hover:opacity-100" onClick={() => void deleteTemplate(t.id)}>
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {templates.length > 0 && <p className="mt-2 text-xs text-muted">칩을 누르면 선택한 {selection.rows.length}개 행에 적용 · Task 칸 드롭다운에서도 선택</p>}
        </Card>

        {newProjects.length > 0 && (
          <Card tone="accent" title={`${newProjects.length} new group project${newProjects.length > 1 ? 's' : ''} detected`}>
            <ul className="mb-3 space-y-1.5">
              {newProjects.map((p) => (
                <li key={p.id} className="truncate rounded-xl bg-white/90 px-3 py-1.5 text-sm font-semibold text-ink">
                  {p.name}
                </li>
              ))}
            </ul>
            <Link to={{ pathname: '/timesheets/projects', search }} className="inline-block rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-ink">
              Map now
            </Link>
          </Card>
        )}

        {unmappedLabels.length > 0 && (
          <Card tone="sage" title={<span className="flex items-center gap-2"><CircleAlert size={18} /> Unmapped categories</span>}>
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
                      .filter((p) => p.status === 'active')
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
