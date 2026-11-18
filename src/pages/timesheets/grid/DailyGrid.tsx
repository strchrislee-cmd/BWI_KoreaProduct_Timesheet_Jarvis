import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { ColorPicker, Swatch } from '../../../components/ColorPicker'
import { cx } from '../../../components/ui'
import { slotToTime } from '../../../domain/time'
import type { TaskTemplate, TimeSlot } from '../../../domain/types'
import { categoryKey, chipBg, rowBg } from '../colors'
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

const NONWORK_CHOICES = ['점심', '휴식', '퇴근']
const GRID_COLS = 'grid-cols-[64px_minmax(200px,280px)_minmax(240px,1fr)_88px]'

interface Sel {
  i: number // slot index
  c: number // column index
}

interface Option {
  key: string
  group: string
  label: string
  hint?: string
  color?: string
  value?: string // category text to apply
  template?: TaskTemplate // task column: apply the template
  create?: boolean // task column: save typed text as a template
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

export interface DailyGridProps {
  rows: number[]
  ctx: GridContext
  templates: TaskTemplate[]
  colors: GridColors
  readOnly: boolean
  onChange: (changes: CellChange[]) => void
  onUndo: () => void
  onCreateTemplate: (t: Pick<TaskTemplate, 'kind' | 'group_project_id' | 'label' | 'description'>) => void
  onSelectionChange: (indexes: number[], active: number) => void
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function templateCategory(t: TaskTemplate, ctx: GridContext): string {
  if (t.kind === 'nonwork') return t.label
  const p = t.group_project_id ? ctx.byId.get(t.group_project_id) : undefined
  return p ? displayName(p) : t.label
}

export function DailyGrid({ rows, ctx, templates, colors, readOnly, onChange, onUndo, onCreateTemplate, onSelectionChange }: DailyGridProps) {
  const [anchor, setAnchor] = useState<Sel>({ i: rows[0], c: 0 })
  const [focus, setFocus] = useState<Sel>({ i: rows[0], c: 0 })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [hi, setHi] = useState(-1)
  const [status, setStatus] = useState('')
  const [colorKey, setColorKey] = useState<string | null>(null) // category whose color picker is open
  const drag = useRef<'cell' | 'row' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<string, HTMLDivElement>())

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

  // ── dropdown options ──────────────────────────────────────────────────────
  function buildOptions(state: Editing | null): Option[] {
    if (!state) return []
    const q = state.dirty ? state.text.trim().toLowerCase() : ''
    const match = (...xs: string[]) => !q || xs.some((x) => x.toLowerCase().includes(q))
    if (activeCol === 'category') {
      const list: Option[] = []
      for (const p of ctx.projects) {
        if (p.status !== 'active') continue
        const aliases = ctx.aliases.filter((x) => x.group_project_id === p.id).map((x) => x.alias)
        if (match(displayName(p), p.name, ...aliases))
          list.push({ key: p.id, group: KIND_LABEL[p.kind], label: displayName(p), hint: aliases.join(', '), color: ctx.color('work', p.id), value: displayName(p) })
      }
      for (const l of NONWORK_CHOICES) if (match(l)) list.push({ key: `nw:${l}`, group: 'Non-work', label: l, color: ctx.color('nonwork', null), value: l })
      return list
    }
    if (activeCol === 'task') {
      const list: Option[] = templates
        .filter((t) => match(t.description, t.label, templateCategory(t, ctx)))
        .map((t) => ({ key: t.id, group: '반복 업무', label: t.description || t.label, hint: templateCategory(t, ctx), color: colors.template(t), template: t }))
      const text = state.text.trim()
      if (state.dirty && text && !templates.some((t) => t.description === text))
        list.push({ key: 'create', group: '새 반복 업무', label: `+ 반복 업무로 등록: “${text}”`, create: true })
      return list
    }
    return []
  }
  const options = buildOptions(editing)

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
    if (activeCol === 'category') {
      const state = { text: '', dirty: false }
      const current = cellText(effectiveSlot(ctx, activeIndex), 'category', ctx.byId)
      setEditing(state)
      setHi(buildOptions(state).findIndex((o) => o.value === current))
    } else {
      setEditing({ text: cellText(effectiveSlot(ctx, activeIndex), activeCol, ctx.byId), dirty: false })
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
        if (opt?.create) {
          const base = effectiveSlot(ctx, activeIndex)
          onCreateTemplate({ kind: base?.kind ?? 'work', group_project_id: base?.group_project_id ?? null, label: base?.label ?? '', description: text.trim() })
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
      for (let c = sel.c1; c <= sel.c2; c++) ops.push({ index: rows[r], col: COLS[c], text: cellText(top, COLS[c], ctx.byId) })
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
        setEditing(null)
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
      return cols.map((col) => cellText(s, col, ctx.byId))
    })
    e.clipboardData.setData('text/plain', toTsv(matrix))
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
    const ops = planPaste(matrix, sel, rows)
    onChange(buildChanges(ops, ctx))
    if (matrix.length > 1 || matrix[0].length > 1) {
      setAnchor({ i: rows[sel.r1], c: sel.c1 })
      const last = ops.at(-1)
      if (last) setFocus({ i: last.index, c: COLS.indexOf(last.col) })
    }
    setStatus(`${ops.length}칸 붙여넣음`)
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

  // ── render ────────────────────────────────────────────────────────────────
  const activeEl = cellRefs.current.get(`${activeIndex}:${a.c}`)
  const box = activeEl
    ? { top: activeEl.offsetTop, left: activeEl.offsetLeft, width: activeEl.offsetWidth, height: activeEl.offsetHeight }
    : { top: 0, left: 0, width: 0, height: 0 }

  function renderCell(col: (typeof COLS)[number], s: TimeSlot | undefined, lunchDefault: boolean) {
    if (col === 'focus') return s?.focus ? <span className="tracking-widest text-primary">{'●'.repeat(s.focus)}</span> : s?.focus === 0 ? '0' : ''
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

  return (
    <div>
      <div ref={wrapRef} className={cx('relative select-none text-[13px]', readOnly ? 'cursor-default' : 'cursor-cell')} role="grid" aria-label="30-min log">
        <div className={cx('sticky top-0 z-10 grid bg-sage-light font-semibold', GRID_COLS)}>
          <div className="px-2.5 py-2">Time</div>
          <div className="px-2.5 py-2">Category</div>
          <div className="px-2.5 py-2">Task</div>
          <div className="px-2.5 py-2">Focus</div>
        </div>

        {rows.map((i, r) => {
          const s = effectiveSlot(ctx, i)
          const lunchDefault = isLunchDefault(ctx, i)
          return (
            <div
              key={i}
              data-slot={i}
              role="row"
              className={cx('grid border-t border-line', GRID_COLS, lunchDefault && 'text-muted')}
              style={s ? { backgroundColor: rowBg(ctx.color(s.kind, s.group_project_id)) } : undefined}
            >
              <div className="cursor-pointer px-2.5 py-2 font-semibold tabular-nums" onMouseDown={(e) => onRowDown(e, i)} onMouseEnter={() => onCellEnter(i, COLS.length - 1)}>
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
                      'relative min-h-9 truncate px-2.5 py-2',
                      selected && 'shadow-[inset_0_0_0_9999px_rgba(31,77,58,0.12)]',
                      active && 'outline outline-2 -outline-offset-2 outline-primary',
                    )}
                    onMouseDown={(e) => onCellDown(e, i, c)}
                    onMouseEnter={() => onCellEnter(i, c)}
                    onDoubleClick={openEditor}
                  >
                    {renderCell(col, s, lunchDefault)}
                    {active && !editing && col !== 'focus' && (
                      <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                        {col === 'category' && s && categoryKey(s.kind, s.group_project_id) && (
                          <Swatch color={ctx.color(s.kind, s.group_project_id)} label="Category color" onClick={() => setColorKey(categoryKey(s.kind, s.group_project_id))} />
                        )}
                        {!readOnly && (
                          <button
                            aria-label="Open options"
                            className="rounded p-0.5 text-muted hover:bg-white"
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
            </div>
          )
        })}

        <input
          ref={inputRef}
          aria-label="Cell editor"
          autoComplete="off"
          spellCheck={false}
          value={editing?.text ?? ''}
          placeholder={editing && activeCol === 'category' ? cellText(effectiveSlot(ctx, activeIndex), 'category', ctx.byId) || '카테고리 검색…' : ''}
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly) return
            setEditing({ text: e.target.value, dirty: true })
            setHi(activeCol === 'category' ? 0 : -1)
          }}
          onCompositionStart={() => !editing && !readOnly && setEditing({ text: '', dirty: true })}
          onKeyDown={onKeyDown}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
          onBlur={() => editing && commit('none')}
          className={cx(
            'absolute z-20 rounded-md px-2.5 text-[13px] outline-none',
            editing ? 'border-2 border-primary bg-white shadow-lg' : 'pointer-events-none opacity-0',
          )}
          // Same size whether hidden or editing: if the input grows after the first inserted
          // character, Chrome moves the caret to the start ("워크" became "크워" with Korean IME).
          style={{ top: box.top, left: box.left, width: Math.max(box.width, 200), height: box.height }}
        />

        {colorKey && (
          // laid over the active cell (cells clip overflow); opens upward near the bottom
          <div className="pointer-events-none absolute z-40" style={{ top: box.top, left: box.left, width: box.width, height: box.height }}>
            <ColorPicker
              value={colorKey === 'nonwork' ? ctx.color('nonwork', null) : ctx.color('work', colorKey)}
              isCustom={colors.isCustom(colorKey)}
              saved={colors.saved}
              align="right"
              side={box.top > (wrapRef.current?.offsetHeight ?? 0) - 380 && box.top > 380 ? 'top' : 'bottom'}
              onPick={(hex) => colors.setCategory(colorKey, hex)}
              onSave={colors.save}
              onRemoveSaved={colors.removeSaved}
              onClose={() => {
                setColorKey(null)
                inputRef.current?.focus({ preventScroll: true })
              }}
            />
          </div>
        )}

        {editing && options.length > 0 && (
          <div
            ref={listRef}
            role="listbox"
            className="absolute z-30 max-h-72 overflow-auto rounded-2xl border border-line bg-white p-1 shadow-xl"
            style={{ top: box.top + box.height + 4, left: box.left, width: Math.max(box.width, 320) }}
          >
            {options.map((o, k) => (
              <div key={o.key}>
                {(k === 0 || options[k - 1].group !== o.group) && o.group && <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted">{o.group}</div>}
                <div
                  role="option"
                  aria-selected={k === hi}
                  data-opt={k}
                  className={cx('flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5', k === hi ? 'bg-sage' : 'hover:bg-sage-light')}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    commit('none', k)
                  }}
                  onMouseEnter={() => setHi(k)}
                >
                  <span className="truncate rounded-full px-2 py-0.5 text-[13px] font-medium" style={o.color ? { backgroundColor: chipBg(o.color) } : undefined}>
                    {o.label}
                  </span>
                  {o.hint && <span className="ml-auto shrink-0 truncate text-xs text-muted">{o.hint}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
        <span>클릭·드래그·Shift로 여러 칸 선택</span>
        <span>입력/Enter → 선택한 칸 모두 적용</span>
        <span>Ctrl+C / Ctrl+V (엑셀 호환)</span>
        <span>Delete 지우기 · Ctrl+D 아래로 채우기 · Ctrl+Z 되돌리기</span>
        {status && <span className="font-semibold text-primary" role="status">{status}</span>}
      </p>
    </div>
  )
}
