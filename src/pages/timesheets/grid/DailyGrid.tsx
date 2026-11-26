import { ChevronDown, GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { ColorMenu } from '../../../components/ColorMenu'
import { cx } from '../../../components/ui'
import { DEFAULT_GRID, GRID_LIMITS, ROW_HEIGHTS, type GridPrefs } from '../../../data/preferences'
import { isSelectable, projectNumbers } from '../../../domain/projects'
import { slotToTime } from '../../../domain/time'
import { WORK_TYPE_GRAY, findWorkType, selectableWorkTypes } from '../../../domain/workTypes'
import type { ProjectKind, TaskTemplate, TimeSlot } from '../../../domain/types'
import { QUICK_TASKS, quickTaskName } from '../../../domain/quickTasks'
import { useT } from '../../../lib/i18n'
import { SORT_LABELS, moveItem, sortItems, type SortMode } from '../../../lib/ordering'
import { useDragReorder } from '../../../lib/useDragReorder'
import { NONWORK_KEY, chipBg, rowBg } from '../colors'
import { KIND_LABEL, displayName } from '../projectUi'
import {
  COLS,
  applyTemplate,
  buildChanges,
  cellText,
  effectiveSlot,
  inRange,
  isLunchDefault,
  parseClipboard,
  planPaste,
  toRange,
  toTsv,
  type CellChange,
  type CellOp,
  type GridContext,
} from './gridModel'

// Excel/Notion-like grid for the 30-min log.
// A single <input> follows the active cell: it receives every keystroke (so Korean IME
// composition works), becomes the visible editor while editing, and gets copy/paste events.

export const NONWORK_CHOICES = ['점심', '휴식', '퇴근']
/** what this grid last put on the clipboard: pasting it back keeps its columns (see planPaste) */
let lastCopied = ''
const sameText = (a: string, b: string) => !!b && a.replace(/\r\n/g, '\n').trimEnd() === b.replace(/\r\n/g, '\n').trimEnd()

/** the narrow column in front of Time with each row's + (add to repeated tasks) */
const GUTTER = 24
/** columns whose width can be dragged: Time, Category, MID */
const RESIZABLE = ['timeWidth', 'categoryWidth', 'midWidth'] as const

const GROUPS: { id: ProjectKind | 'nonwork'; label: string }[] = [
  { id: 'project', label: KIND_LABEL.project },
  { id: 'timelog', label: KIND_LABEL.timelog },
  { id: 'local_section', label: KIND_LABEL.local_section },
  { id: 'nonwork', label: 'Non-work' },
]

interface Sel {
  i: number // slot index
  c: number // column index
}

interface Option {
  key: string
  group: string // reorder group id
  groupLabel: string
  label: string
  hint?: string
  tooltip?: string
  color?: string
  value?: string // category text to apply
  template?: TaskTemplate // task column: apply the template
  create?: 'template' | 'category'
  colorKey?: string // category options: preference key for its color
  no?: number // category options: the project's No in Projects → Project mapping
}

interface Editing {
  text: string
  dirty: boolean
}

/** Color settings the grid can change (personal preferences). */
export interface GridColors {
  saved: string[]
  isCustom: (key: string) => boolean
  setCategory: (key: string, hex: string | null) => void
  save: (hex: string) => void
  removeSaved: (hex: string) => void
  template: (t: TaskTemplate) => string
}

/** Sorting, ordering and template actions for the dropdowns. */
export interface GridOptionsApi {
  sort: { category: SortMode; template: SortMode }
  categoryOrder: string[]
  setSort: (list: 'category' | 'template', mode: SortMode) => void
  reorderCategories: (keys: string[]) => void
  reorderTemplates: (ids: string[]) => void
  renameTemplate: (id: string, name: string) => void
  deleteTemplate: (id: string) => void
  setTemplateColor: (id: string, hex: string | null) => void
}

export interface DailyGridProps {
  rows: number[]
  ctx: GridContext
  templates: TaskTemplate[]
  colors: GridColors
  options: GridOptionsApi
  layout: GridPrefs
  onLayoutChange: (layout: GridPrefs) => void
  /** current time when the grid shows today (draws the "now" line), else null */
  now: { slot: number; frac: number; time: string } | null
  readOnly: boolean
  onChange: (changes: CellChange[]) => void
  onUndo: () => void
  onCreateTemplate: (t: Pick<TaskTemplate, 'kind' | 'group_project_id' | 'label' | 'description' | 'work_type_id'>) => void
  /** the + in front of a row: save its category, MID and sub category as a repeated task; resolves to a status line */
  onRowToTemplate?: (index: number) => Promise<string>
  onSelectionChange: (indexes: number[], active: number) => void
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function templateCategory(t: TaskTemplate, ctx: GridContext): string {
  if (t.kind === 'nonwork') return t.label
  const p = t.group_project_id ? ctx.byId.get(t.group_project_id) : undefined
  return p ? displayName(p) : t.label
}

export function DailyGrid({
  rows,
  ctx,
  templates,
  colors,
  options: api,
  layout,
  onLayoutChange,
  now,
  readOnly,
  onChange,
  onUndo,
  onCreateTemplate,
  onRowToTemplate,
  onSelectionChange,
}: DailyGridProps) {
  const tr = useT()
  const [anchor, setAnchor] = useState<Sel>({ i: rows[0], c: 0 })
  const [focus, setFocus] = useState<Sel>({ i: rows[0], c: 0 })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [hi, setHi] = useState(-1)
  const [status, setStatus] = useState('')
  const [menu, setMenu] = useState<{ key: string; anchor: DOMRect } | null>(null)
  const [sortOpen, setSortOpen] = useState(false)
  const [live, setLive] = useState<GridPrefs | null>(null) // column widths while resizing
  const drag = useRef<'cell' | 'row' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<string, HTMLDivElement>())
  const size = live ?? layout
  const gridColumns = `${GUTTER}px ${size.timeWidth}px ${size.categoryWidth}px ${size.midWidth}px minmax(140px, 1fr) minmax(160px, 1.4fr)`

  // Selection is stored by slot index so it survives rows being added (e.g. pasting past 16:30).
  const pos = (i: number) => {
    const p = rows.findIndex((x) => x >= i)
    return p === -1 ? rows.length - 1 : p
  }
  const a = { r: pos(anchor.i), c: anchor.c }
  const f = { r: pos(focus.i), c: focus.c }
  const sel = toRange(a, f)
  const selRows = rows.slice(sel.r1, sel.r2 + 1)
  const activeIndex = rows[a.r]
  const activeCol = COLS[a.c]
  const listKind: 'category' | 'template' = activeCol === 'task' ? 'template' : 'category'

  useEffect(() => {
    onSelectionChange(selRows, activeIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selRows.join(','), activeIndex])

  useEffect(() => {
    const up = () => (drag.current = null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  useEffect(() => {
    cellRefs.current.get(`${focus.i}:${focus.c}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [focus.i, focus.c])

  useEffect(() => {
    listRef.current?.querySelector(`[data-opt="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi])

  useEffect(() => {
    if (!editing) {
      setMenu(null)
      setSortOpen(false)
    }
  }, [editing])

  // ── dropdown options ──────────────────────────────────────────────────────
  function buildOptions(state: Editing | null): Option[] {
    if (!state) return []
    const text = state.dirty ? state.text.trim() : ''
    const q = text.toLowerCase()
    const match = (...xs: string[]) => !q || xs.some((x) => x.toLowerCase().includes(q))
    const list: Option[] = []

    if (activeCol === 'category') {
      const numbers = projectNumbers(ctx.projects)
      for (const g of GROUPS) {
        const items: Option[] =
          g.id === 'nonwork'
            ? NONWORK_CHOICES.filter((l) => match(l)).map((l) => ({
                key: `nw:${l}`,
                group: g.id,
                groupLabel: g.id === 'nonwork' ? tr('Non-work') : g.label,
                label: l,
                color: ctx.color('nonwork', null),
                value: l,
                colorKey: NONWORK_KEY,
              }))
            : ctx.projects
                .filter((p) => isSelectable(p) && p.kind === g.id)
                .map((p) => ({ p, aliases: ctx.aliases.filter((x) => x.group_project_id === p.id).map((x) => x.alias) }))
                .filter(({ p, aliases }) => match(displayName(p), p.name, ...aliases))
                .map(({ p, aliases }) => ({
                  key: p.id,
                  group: g.id,
                  groupLabel: g.id === 'nonwork' ? tr('Non-work') : g.label,
                  label: displayName(p),
                  hint: aliases.join(', '),
                  color: ctx.color('work', p.id),
                  value: displayName(p),
                  colorKey: p.id,
                  no: numbers.get(p.id),
                }))
        const created = new Map(ctx.projects.map((p) => [p.id, p.created_at]))
        list.push(
          ...sortItems(
            items,
            api.sort.category,
            { key: (o) => o.key, name: (o) => o.label, created: (o) => created.get(o.key) ?? '', number: (o) => o.no ?? 0 },
            api.categoryOrder,
          ),
        )
      }
      if (text && !list.some((o) => o.label.toLowerCase() === q))
        list.push({ key: 'create', group: 'create', groupLabel: '', label: `+ “${text}” 생성`, hint: '미매핑 — 나중에 프로젝트에 연결', value: text, create: 'category' })
      return list
    }

    if (activeCol === 'mid') {
      // the admin's list in its own order (Projects → MID); no create, reorder or option menu here
      for (const w of selectableWorkTypes(ctx.workTypes).filter((x) => match(x.name)))
        list.push({ key: w.id, group: 'mid', groupLabel: tr('Type'), label: w.name, color: w.color ?? WORK_TYPE_GRAY, value: w.name })
      if (!text && effectiveSlot(ctx, activeIndex)?.work_type_id)
        list.push({ key: 'mid-clear', group: 'mid-clear', groupLabel: '', label: '— 비우기', value: '' })
      return list
    }

    if (activeCol === 'task') {
      const items: Option[] = templates
        .filter((t) => match(t.description, t.label, templateCategory(t, ctx)))
        .map((t) => ({ key: t.id, group: 'template', groupLabel: tr('Quick add'), label: quickTaskName(t), tooltip: templateCategory(t, ctx), color: colors.template(t), template: t }))
      const created = new Map(templates.map((t) => [t.id, t.created_at]))
      list.push(...sortItems(items, api.sort.template, { key: (o) => o.key, name: (o) => o.label, created: (o) => created.get(o.key) ?? '' }, templates.map((t) => t.id)))
      if (text && !templates.some((t) => t.description === text))
        list.push({ key: 'create', group: 'create', groupLabel: '', label: `+ “${text}” 생성 · ${QUICK_TASKS}에 추가`, create: 'template' })
      return list
    }
    return []
  }
  const options = buildOptions(editing)
  const filtering = !!editing?.dirty && !!editing.text.trim()

  // drag reorder inside a group (disabled while a search filter is active)
  const reorder = useDragReorder(popRef, (group, from, to) => {
    const keys = moveItem(
      options.filter((o) => o.group === group).map((o) => o.key),
      from,
      to,
    )
    if (group === 'template') api.reorderTemplates(keys)
    else api.reorderCategories(keys)
  })
  const groupIndex = new Map<string, number>()
  {
    const counters = new Map<string, number>()
    for (const o of options) {
      const n = counters.get(o.group) ?? 0
      groupIndex.set(o.key, n)
      counters.set(o.group, n + 1)
    }
  }

  // ── selection & editing ───────────────────────────────────────────────────
  function setSel(next: Sel, extend: boolean) {
    if (!extend) setAnchor(next)
    setFocus(next)
  }

  function move(dr: number, dc: number, extend: boolean) {
    const base = extend ? f : a
    setSel({ i: rows[clamp(base.r + dr, 0, rows.length - 1)], c: clamp(base.c + dc, 0, COLS.length - 1) }, extend)
  }

  function tab(back: boolean) {
    let r = a.r
    let c = a.c + (back ? -1 : 1)
    if (c >= COLS.length) [r, c] = [Math.min(r + 1, rows.length - 1), 0]
    if (c < 0) [r, c] = [Math.max(r - 1, 0), COLS.length - 1]
    setSel({ i: rows[r], c }, false)
  }

  function openEditor() {
    if (readOnly) return
    if (activeCol === 'category' || activeCol === 'mid') {
      const state = { text: '', dirty: false }
      const current = cellText(effectiveSlot(ctx, activeIndex), activeCol, ctx.byId, ctx.workTypeById)
      setEditing(state)
      setHi(buildOptions(state).findIndex((o) => o.value === current))
    } else {
      setEditing({ text: cellText(effectiveSlot(ctx, activeIndex), activeCol, ctx.byId, ctx.workTypeById), dirty: false })
      setHi(-1)
    }
    inputRef.current?.focus({ preventScroll: true })
  }

  function commit(next: 'down' | 'right' | 'left' | 'none', pick?: number) {
    if (!editing) return
    const opt = options[pick ?? hi]
    setEditing(null)
    if (!readOnly && (opt || editing.dirty)) {
      if (opt?.template) {
        const t = opt.template
        onChange(selRows.map((i) => ({ index: i, slot: applyTemplate(effectiveSlot(ctx, i), i, t, ctx) })))
      } else {
        const text = opt?.value ?? editing.text
        if (opt?.create === 'template') {
          const base = effectiveSlot(ctx, activeIndex)
          onCreateTemplate({
            kind: base?.kind ?? 'work',
            group_project_id: base?.group_project_id ?? null,
            label: base?.label ?? '',
            description: text.trim(),
            work_type_id: base?.work_type_id ?? null,
          })
        }
        onChange(buildChanges(selRows.map((i) => ({ index: i, col: activeCol, text })), ctx))
        if (selRows.length > 1) setStatus(`${selRows.length}칸에 적용`)
      }
    }
    if (next === 'down' && selRows.length === 1) move(1, 0, false)
    if (next === 'right') tab(false)
    if (next === 'left') tab(true)
  }

  function clearSelection() {
    if (readOnly) return
    const ops: CellOp[] = []
    for (const i of selRows) for (let c = sel.c1; c <= sel.c2; c++) ops.push({ index: i, col: COLS[c], text: '' })
    onChange(buildChanges(ops, ctx))
  }

  function fillDown() {
    if (readOnly || sel.r2 === sel.r1) return
    const top = effectiveSlot(ctx, rows[sel.r1])
    const ops: CellOp[] = []
    for (let r = sel.r1 + 1; r <= sel.r2; r++)
      for (let c = sel.c1; c <= sel.c2; c++) ops.push({ index: rows[r], col: COLS[c], text: cellText(top, COLS[c], ctx.byId, ctx.workTypeById) })
    onChange(buildChanges(ops, ctx))
    setStatus(`${sel.r2 - sel.r1}행 아래로 채움`)
  }

  // ── keyboard ──────────────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return // Korean IME is composing
    const mod = e.ctrlKey || e.metaKey
    if (editing) {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit('down')
      } else if (e.key === 'Tab') {
        e.preventDefault()
        commit(e.shiftKey ? 'left' : 'right')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (menu || sortOpen) {
          setMenu(null)
          setSortOpen(false)
        } else setEditing(null)
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length) {
        e.preventDefault()
        setHi((h) => clamp(h + (e.key === 'ArrowDown' ? 1 : -1), -1, options.length - 1))
      }
      return
    }
    const key = e.key.toLowerCase()
    if (mod && key === 'z') {
      e.preventDefault()
      onUndo()
      setStatus('되돌림')
    } else if (mod && key === 'd') {
      e.preventDefault()
      fillDown()
    } else if (mod && key === 'a') {
      e.preventDefault()
      setAnchor({ i: rows[0], c: 0 })
      setFocus({ i: rows[rows.length - 1], c: COLS.length - 1 })
    } else if (mod) {
      return // Ctrl+C / X / V arrive as copy / cut / paste events
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key] ?? [0, 0]
      move(d[0], d[1], e.shiftKey)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      tab(e.shiftKey)
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      openEditor()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      clearSelection()
    } else if (e.key === 'Escape') {
      setFocus(anchor)
    }
  }

  // ── clipboard ─────────────────────────────────────────────────────────────
  function onCopy(e: ClipboardEvent<HTMLInputElement>) {
    if (editing) return
    e.preventDefault()
    const cols = COLS.slice(sel.c1, sel.c2 + 1)
    const matrix = selRows.map((i) => {
      const s = effectiveSlot(ctx, i)
      return cols.map((col) => cellText(s, col, ctx.byId, ctx.workTypeById))
    })
    const tsv = toTsv(matrix)
    e.clipboardData.setData('text/plain', tsv)
    lastCopied = tsv
    setStatus(`${selRows.length * cols.length}칸 복사됨`)
  }

  function onCut(e: ClipboardEvent<HTMLInputElement>) {
    if (editing) return
    onCopy(e)
    clearSelection()
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    if (editing || readOnly) return
    e.preventDefault()
    const matrix = parseClipboard(e.clipboardData.getData('text/plain'))
    if (!matrix.length) return
    const fromGrid = sameText(e.clipboardData.getData('text/plain'), lastCopied) // copied here: columns are known
    const ops = planPaste(matrix, sel, rows, (t) => !!findWorkType(t, ctx.workTypes), fromGrid)
    onChange(buildChanges(ops, ctx))
    if (matrix.length > 1 || matrix[0].length > 1) {
      setAnchor({ i: rows[sel.r1], c: sel.c1 })
      const last = ops.at(-1)
      if (last) setFocus({ i: last.index, c: COLS.indexOf(last.col) })
    }
    setStatus(`${ops.length}칸 붙여넣음`)
  }

  function onBlur(e: FocusEvent<HTMLInputElement>) {
    // focus moved into the dropdown / an option menu (e.g. renaming) → keep editing
    const to = e.relatedTarget as HTMLElement | null
    if (to && (popRef.current?.contains(to) || to.closest('[data-grid-popover]'))) return
    // typed text is saved; a dropdown only looked at closes without applying the hovered option
    if (editing?.dirty) commit('none')
    else if (editing) setEditing(null)
  }

  // ── mouse ─────────────────────────────────────────────────────────────────
  function onCellDown(e: MouseEvent, i: number, c: number) {
    if (e.button !== 0) return
    e.preventDefault()
    if (editing) commit('none')
    setSel({ i, c }, e.shiftKey)
    drag.current = 'cell'
    inputRef.current?.focus({ preventScroll: true })
  }

  function onRowDown(e: MouseEvent, i: number) {
    if (e.button !== 0) return
    e.preventDefault()
    if (editing) commit('none')
    if (!e.shiftKey) setAnchor({ i, c: 0 })
    setFocus({ i, c: COLS.length - 1 })
    drag.current = 'row'
    inputRef.current?.focus({ preventScroll: true })
  }

  function onCellEnter(i: number, c: number) {
    if (drag.current === 'cell') setFocus({ i, c })
    if (drag.current === 'row') setFocus({ i, c: COLS.length - 1 })
  }

  // ── column resize ─────────────────────────────────────────────────────────
  function startResize(e: PointerEvent<HTMLDivElement>, which: (typeof RESIZABLE)[number]) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const start = size[which]
    const [lo, hi] = GRID_LIMITS[which]
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let latest = size
    const move = (ev: globalThis.PointerEvent) => {
      latest = { ...size, [which]: clamp(start + ev.clientX - startX, lo, hi) }
      setLive(latest)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      setLive(null)
      if (latest[which] !== layout[which]) onLayoutChange(latest)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  // ── render ────────────────────────────────────────────────────────────────
  const activeEl = cellRefs.current.get(`${activeIndex}:${a.c}`)
  // Cells sit inside positioned rows (for the "now" line), so add the row's offset to get the
  // position inside the grid — otherwise the editor and dropdown open over the first row.
  const row = activeEl?.parentElement
  const box = activeEl
    ? {
        top: (row?.offsetTop ?? 0) + activeEl.offsetTop,
        left: (row?.offsetLeft ?? 0) + activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        height: activeEl.offsetHeight,
      }
    : { top: 0, left: 0, width: 0, height: 0 }
  // Open the dropdown upwards when the visible space under the cell is too small (lower rows).
  const dropUp = (() => {
    if (!editing || !activeEl) return false
    let sc: HTMLElement | null = activeEl.parentElement
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement
    const r = activeEl.getBoundingClientRect()
    const limit = sc?.getBoundingClientRect()
    const below = Math.min(limit?.bottom ?? window.innerHeight, window.innerHeight) - r.bottom
    const above = r.top - Math.max(limit?.top ?? 0, 0)
    return below < 340 && above > below
  })()

  function renderCell(col: (typeof COLS)[number], s: TimeSlot | undefined, lunchDefault: boolean) {
    if (col === 'details') return s?.details ? <span title={s.details}>{s.details}</span> : ''
    if (col === 'mid') {
      const w = s?.work_type_id ? ctx.workTypeById.get(s.work_type_id) : undefined
      if (!w) return ''
      return (
        <span className={cx('rounded-chip px-1.5 py-0.5 text-[12.5px] font-medium', w.hidden && 'opacity-60')} style={{ backgroundColor: chipBg(w.color ?? WORK_TYPE_GRAY) }}>
          {w.name}
        </span>
      )
    }
    if (col === 'task') return s?.description ?? ''
    if (!s) return <span className="text-muted/60">—</span>
    const text = cellText(s, 'category', ctx.byId)
    if (s.kind === 'work' && !s.group_project_id) return <span className="font-semibold text-[#9a3a0e]">{text ? `⚠ ${text}` : '⚠ 카테고리 없음'}</span>
    return (
      <span className="font-medium">
        {text}
        {lunchDefault && <span className="ml-1 text-xs text-muted">(기본)</span>}
      </span>
    )
  }

  const menuOption = menu ? options.find((o) => o.key === menu.key) : undefined
  const menuCategoryKey = menuOption?.colorKey
  // the chosen row height is the minimum: long text wraps inside its cell and the whole row grows
  // 자동 줄바꿈 on: rows grow with long text; off: every row keeps its height and text is cut with …
  const rowStyle = size.wrap ? { minHeight: size.rowHeight } : { height: size.rowHeight }

  return (
    <div>
      <div className={cx('relative select-none text-[13px]', readOnly ? 'cursor-default' : 'cursor-cell')} role="grid" aria-label="30-min log">
        <div className="sticky top-0 z-10 grid rounded-t-control bg-sage-light/90 font-semibold backdrop-blur" style={{ gridTemplateColumns: gridColumns }}>
          {/* the + column, with the same line as between the other columns */}
          <div aria-hidden className="border-r border-dashed border-black/10" />
          {(['Time', 'Project', 'Type', 'Task', 'Content'] as const).map((h, k) => (
            <div key={h} className={cx('relative px-2.5 py-2', k > 0 && 'border-l border-dashed border-black/10')}>
              {tr(h)}
              {k < RESIZABLE.length && (
                <div
                  role="separator"
                  aria-label={`Resize ${h} column`}
                  className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-primary/30"
                  onPointerDown={(e) => startResize(e, RESIZABLE[k])}
                  onDoubleClick={() => onLayoutChange({ ...layout, [RESIZABLE[k]]: DEFAULT_GRID[RESIZABLE[k]] })}
                />
              )}
            </div>
          ))}
        </div>

        {rows.map((i, r) => {
          const s = effectiveSlot(ctx, i)
          const lunchDefault = isLunchDefault(ctx, i)
          const isNow = now?.slot === i
          return (
            <div
              key={i}
              data-slot={i}
              role="row"
              className={cx('group/row relative grid border-t border-dashed border-black/15', lunchDefault && 'text-muted')}
              style={{ gridTemplateColumns: gridColumns, backgroundColor: s ? rowBg(ctx.color(s.kind, s.group_project_id)) : undefined }}
            >
              <div className="flex items-center justify-center border-r border-dashed border-black/10" style={rowStyle} data-row-add>
                {onRowToTemplate && !readOnly && s && !lunchDefault && (s.label || s.group_project_id || s.description) && (
                  <button
                    aria-label={`Add ${slotToTime(i)} to quick tasks`}
                    title={`이 행을 ${QUICK_TASKS}에 추가 (프로젝트·유형·업무, 업무내용은 제외)`}
                    className="flex h-5 w-5 items-center justify-center rounded-chip text-muted opacity-40 hover:bg-white hover:text-primary group-hover/row:opacity-100"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={() => void onRowToTemplate(i).then(setStatus)}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              <div
                className={cx('flex cursor-pointer items-center px-2.5 font-mono text-[12.5px] font-semibold tabular-nums', isNow && 'text-now')}
                style={rowStyle}
                onMouseDown={(e) => onRowDown(e, i)}
                onMouseEnter={() => onCellEnter(i, COLS.length - 1)}
              >
                {slotToTime(i)}
              </div>
              {COLS.map((col, c) => {
                const selected = inRange(sel, r, c)
                const active = r === a.r && c === a.c
                return (
                  <div
                    key={col}
                    ref={(el) => {
                      if (el) cellRefs.current.set(`${i}:${c}`, el)
                      else cellRefs.current.delete(`${i}:${c}`)
                    }}
                    role="gridcell"
                    aria-selected={selected}
                    data-cell={`${i}:${col}`}
                    className={cx(
                      'relative flex items-center border-l border-dashed border-black/10 px-2.5 py-1',
                      !size.wrap && 'overflow-hidden',
                      selected && 'shadow-[inset_0_0_0_9999px_rgba(31,77,58,0.12)]',
                      active && 'outline outline-2 -outline-offset-2 outline-primary',
                    )}
                    style={rowStyle}
                    onMouseDown={(e) => onCellDown(e, i, c)}
                    onMouseEnter={() => onCellEnter(i, c)}
                    onDoubleClick={openEditor}
                  >
                    <span
                      className={cx('relative z-[1] min-w-0', size.wrap ? 'whitespace-pre-wrap break-words' : 'truncate', active && !editing && col !== 'details' && 'pr-5')}
                      title={size.wrap ? undefined : cellText(s, col, ctx.byId, ctx.workTypeById) || undefined}
                    >
                      {renderCell(col, s, lunchDefault)}
                    </span>
                    {active && !editing && col !== 'details' && (
                      <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                        {!readOnly && (
                          <button
                            aria-label="Open options"
                            className="rounded-chip p-0.5 text-muted hover:bg-white"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              openEditor()
                            }}
                          >
                            <ChevronDown size={14} />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
              {isNow && (
                // starts after the Time column (whose label turns red) and runs under the cell text
                <div
                  aria-hidden
                  data-testid="now-line"
                  className="pointer-events-none absolute right-0 z-0 h-0 border-t-2 border-now"
                  style={{ top: `${now!.frac * 100}%`, left: GUTTER + size.timeWidth }}
                >
                  <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-now" />
                  <span className="absolute -top-[9px] right-1 rounded-chip bg-now px-1.5 font-mono text-[10px] font-bold leading-4 text-white">{now!.time}</span>
                </div>
              )}
            </div>
          )
        })}

        <input
          ref={inputRef}
          aria-label="Cell editor"
          autoComplete="off"
          spellCheck={false}
          value={editing?.text ?? ''}
          placeholder={editing && (activeCol === 'category' || activeCol === 'mid') ? cellText(effectiveSlot(ctx, activeIndex), activeCol, ctx.byId, ctx.workTypeById) || '옵션 검색…' : ''}
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly) return
            setEditing({ text: e.target.value, dirty: true })
            setHi(activeCol === 'category' || activeCol === 'mid' ? 0 : -1)
          }}
          onCompositionStart={() => !editing && !readOnly && setEditing({ text: '', dirty: true })}
          onKeyDown={onKeyDown}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
          onBlur={onBlur}
          className={cx(
            'absolute z-20 rounded-chip px-2.5 text-[13px] outline-none',
            editing ? 'border-2 border-primary bg-white shadow-lg' : 'pointer-events-none opacity-0',
          )}
          // Same size whether hidden or editing: if the input grows after the first inserted
          // character, Chrome moves the caret to the start ("워크" became "크워" with Korean IME).
          style={{ top: box.top, left: box.left, width: Math.max(box.width, 200), height: box.height }}
        />

        {editing && activeCol !== 'details' && (
          <div
            ref={popRef}
            className="glass-strong absolute z-30 rounded-menu p-1"
            data-drop={dropUp ? 'up' : 'down'}
            style={{
              top: dropUp ? box.top - 4 : box.top + box.height + 4,
              transform: dropUp ? 'translateY(-100%)' : undefined,
              left: box.left,
              width: Math.max(box.width, 340),
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="relative flex items-center justify-between px-2 pb-1 pt-1.5 text-[11px] font-semibold text-muted">
              <span>{activeCol === 'mid' ? `${tr('Type')} 선택 · 목록은 Projects 화면에서 관리` : '옵션 선택 또는 생성'}</span>
              <button
                aria-label="Sort options"
                title={`정렬: ${SORT_LABELS[api.sort[listKind]]}`}
                className={cx('rounded-chip p-0.5 hover:bg-black/5', activeCol === 'mid' && 'hidden')}
                onClick={() => setSortOpen((o) => !o)}
              >
                <MoreHorizontal size={16} />
              </button>
              {sortOpen && (
                <div role="menu" aria-label="Sort menu" className="glass-strong absolute right-1 top-7 z-40 w-52 rounded-menu p-1 text-[13px] font-normal text-ink">
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted">정렬</div>
                  {(Object.keys(SORT_LABELS) as SortMode[]).filter((m) => m !== 'number' || listKind === 'category').map((m) => (
                    <button
                      key={m}
                      role="menuitemradio"
                      aria-checked={api.sort[listKind] === m}
                      className="flex w-full items-center justify-between rounded-chip px-2 py-1 text-left hover:bg-black/5"
                      onClick={() => {
                        api.setSort(listKind, m)
                        setSortOpen(false)
                      }}
                    >
                      {SORT_LABELS[m]}
                      {api.sort[listKind] === m && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div ref={listRef} role="listbox" className="max-h-72 overflow-auto">
              {options.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted">
                  {activeCol === 'task' ? `${QUICK_TASKS}에 등록된 업무가 없습니다. 입력하면 새로 만들 수 있어요.` : activeCol === 'mid' ? '목록에 없는 이름입니다. 유형 목록은 관리자가 Projects 화면에서 관리합니다.' : '일치하는 옵션이 없습니다.'}
                </p>
              )}
              {options.map((o, k) => {
                const gi = groupIndex.get(o.key) ?? 0
                const d = reorder.state
                const dragging = d?.group === o.group && d.from === gi
                const dropLine = d && d.group === o.group && d.over === gi && d.over !== d.from ? (d.over > d.from ? 'after' : 'before') : null
                const canReorder = !filtering && !readOnly && o.group !== 'create' && o.group !== 'mid' && o.group !== 'mid-clear'
                const hasMenu = !!o.colorKey || !!o.template
                return (
                  <div key={o.key}>
                    {(k === 0 || options[k - 1].group !== o.group) && o.groupLabel && (
                      <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted">{o.groupLabel}</div>
                    )}
                    <div
                      role="option"
                      aria-selected={k === hi}
                      data-opt={k}
                      data-reorder={canReorder ? o.group : undefined}
                      className={cx(
                        'group flex cursor-pointer items-center gap-1.5 rounded-chip px-1.5 py-1',
                        k === hi ? 'bg-black/[0.07]' : 'hover:bg-black/[0.04]',
                        dragging && 'opacity-40',
                        dropLine === 'before' && 'shadow-[inset_0_2px_0_#1f4d3a]',
                        dropLine === 'after' && 'shadow-[inset_0_-2px_0_#1f4d3a]',
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        commit('none', k)
                      }}
                      onMouseEnter={() => setHi(k)}
                      title={o.tooltip}
                    >
                      {canReorder ? (
                        <span
                          aria-label={`Drag ${o.label}`}
                          className="cursor-grab touch-none text-muted opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          {...reorder.bind(o.group, gi)}
                        >
                          <GripVertical size={14} />
                        </span>
                      ) : (
                        <span className="w-[14px]" />
                      )}
                      {o.no !== undefined && <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted">{o.no}</span>}
                      <span className="truncate rounded-chip px-1.5 py-0.5 text-[13px] font-medium" style={o.color ? { backgroundColor: chipBg(o.color) } : undefined}>
                        {o.label}
                      </span>
                      {o.hint && <span className="ml-auto shrink-0 truncate pl-2 text-xs text-muted">{o.hint}</span>}
                      {hasMenu && (
                        <button
                          aria-label={`Options for ${o.label}`}
                          className={cx('shrink-0 rounded-chip p-0.5 text-muted opacity-0 hover:bg-black/10 group-hover:opacity-100 group-aria-selected:opacity-100', !o.hint && 'ml-auto')}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          onClick={(e) => setMenu({ key: o.key, anchor: (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect() })}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {menu && menuOption?.template && (
          <ColorMenu
            key={menu.key}
            anchor={menu.anchor}
            placement="right"
            title={menuOption.template.description || menuOption.template.label}
            onRename={(name) => api.renameTemplate(menuOption.template!.id, name)}
            onDelete={() => {
              api.deleteTemplate(menuOption.template!.id)
              setMenu(null)
            }}
            value={colors.template(menuOption.template)}
            isCustom={menuOption.template.color !== null}
            saved={colors.saved}
            onPick={(hex) => api.setTemplateColor(menuOption.template!.id, hex)}
            onSave={colors.save}
            onRemoveSaved={colors.removeSaved}
            onClose={() => {
              setMenu(null)
              inputRef.current?.focus({ preventScroll: true })
            }}
          />
        )}
        {menu && menuCategoryKey && !menuOption?.template && (
          <ColorMenu
            key={menu.key}
            anchor={menu.anchor}
            placement="right"
            title={
              menuCategoryKey === NONWORK_KEY
                ? 'Non-work (점심·휴식·퇴근)'
                : ctx.byId.get(menuCategoryKey)
                  ? displayName(ctx.byId.get(menuCategoryKey)!)
                  : menuCategoryKey
            }
            note="그룹 프로젝트 이름은 마스터 시트에서 관리되어 여기서는 색만 바꿀 수 있습니다."
            value={menuCategoryKey === NONWORK_KEY ? ctx.color('nonwork', null) : ctx.color('work', menuCategoryKey)}
            isCustom={colors.isCustom(menuCategoryKey)}
            saved={colors.saved}
            onPick={(hex) => colors.setCategory(menuCategoryKey, hex)}
            onSave={colors.save}
            onRemoveSaved={colors.removeSaved}
            onClose={() => {
              setMenu(null)
              inputRef.current?.focus({ preventScroll: true })
            }}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1" role="group" aria-label="Row height">
          행 높이
          {ROW_HEIGHTS.map((h) => (
            <button
              key={h.value}
              aria-pressed={size.rowHeight === h.value}
              className={cx('rounded-chip px-2 py-0.5', size.rowHeight === h.value ? 'bg-primary text-white' : 'bg-black/5 hover:bg-black/10')}
              onClick={() => onLayoutChange({ ...layout, rowHeight: h.value })}
            >
              {h.label}
            </button>
          ))}
        </span>
        <label className="flex cursor-pointer items-center gap-1">
          <input type="checkbox" checked={size.wrap} onChange={(e) => onLayoutChange({ ...layout, wrap: e.target.checked })} />
          자동 줄바꿈
        </label>
        <span>열 경계를 끌어 너비 조절</span>
        <span>클릭·드래그·Shift로 여러 칸 선택 · 입력/Enter → 선택한 칸 모두 적용</span>
        <span>Ctrl+C / Ctrl+V · Delete · Ctrl+D · Ctrl+Z</span>
        {status && <span className="font-semibold text-primary" role="status">{status}</span>}
      </div>
    </div>
  )
}
