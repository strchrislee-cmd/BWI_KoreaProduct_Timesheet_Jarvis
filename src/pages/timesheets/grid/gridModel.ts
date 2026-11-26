// Pure spreadsheet logic for the Daily Log grid (selection ranges, clipboard, cell edits).
// Kept free of React so it can be unit-tested (tests/grid.test.ts).
import { resolveLabel } from '../../../domain/labels'
import { SLOTS_PER_DAY } from '../../../domain/time'
import type { GroupProject, ProjectAlias, SlotKind, TaskTemplate, TimeSlot, WorkType } from '../../../domain/types'
import { findWorkType } from '../../../domain/workTypes'
import { displayName, labelFor } from '../projectUi'

/** category · MID (중분류) · sub category · content */
export const COLS = ['category', 'mid', 'task', 'details'] as const
export type Col = (typeof COLS)[number]

/** Grid coordinate: r = row position in the displayed rows, c = column index. */
export interface Pos {
  r: number
  c: number
}
export interface Range {
  r1: number
  r2: number
  c1: number
  c2: number
}

export function toRange(a: Pos, b: Pos): Range {
  return { r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) }
}

export function inRange(range: Range, r: number, c: number): boolean {
  return r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2
}

export interface CellChange {
  index: number
  slot: TimeSlot | null // null = delete the saved slot
}

export interface GridContext {
  projects: GroupProject[]
  aliases: ProjectAlias[]
  byId: Map<string, GroupProject>
  /** MID list (hidden ones too: old slots still show them) */
  workTypes: WorkType[]
  workTypeById: Map<string, WorkType>
  /** Saved slots of the day. */
  saved: Map<number, TimeSlot>
  /** Slot indexes that default to lunch when nothing is saved. */
  lunch: Set<number>
  blank: (index: number) => TimeSlot
  /** Display color (#RRGGBB) of a category for the signed-in user. */
  color: (kind: SlotKind, projectId: string | null) => string
}

export const LUNCH_LABEL = '점심'

/** What a row shows: the saved slot, else the lunch default, else nothing. */
export function effectiveSlot(ctx: GridContext, index: number): TimeSlot | undefined {
  const saved = ctx.saved.get(index)
  if (saved) return saved
  if (ctx.lunch.has(index)) return { ...ctx.blank(index), kind: 'nonwork', label: LUNCH_LABEL }
  return undefined
}

export function isLunchDefault(ctx: GridContext, index: number): boolean {
  return !ctx.saved.has(index) && ctx.lunch.has(index)
}

/** Text shown in / copied from a cell. */
export function cellText(slot: TimeSlot | undefined, col: Col, byId: Map<string, GroupProject>, workTypeById?: Map<string, WorkType>): string {
  if (!slot) return ''
  if (col === 'mid') return (slot.work_type_id && workTypeById?.get(slot.work_type_id)?.name) || ''
  if (col === 'task') return slot.description
  if (col === 'details') return slot.details
  if (slot.kind === 'nonwork') return slot.label
  const p = slot.group_project_id ? byId.get(slot.group_project_id) : undefined
  return p ? displayName(p) : slot.label
}

/** A slot with nothing left in it (no category, MID, task or details) is deleted. */
function orDelete(slot: TimeSlot): TimeSlot | null {
  const empty = slot.kind === 'work' && !slot.group_project_id && !slot.label && !slot.work_type_id && !slot.description && !slot.details
  return empty ? null : slot
}

/**
 * Apply typed/pasted text to one cell. Returns the new slot, null to delete the saved slot,
 * or undefined when nothing changes.
 */
export function applyText(base: TimeSlot | undefined, index: number, col: Col, text: string, ctx: GridContext): TimeSlot | null | undefined {
  const t = text.trim()
  if (col === 'category') {
    if (!t) {
      if (!base) return undefined
      return orDelete({ ...base, kind: 'work', group_project_id: null, label: '' })
    }
    const r = resolveLabel(t, ctx.aliases, ctx.projects)!
    const b = base ?? ctx.blank(index)
    if (r.kind === 'nonwork') return { ...b, kind: 'nonwork', group_project_id: null, label: t }
    const p = r.group_project_id ? ctx.byId.get(r.group_project_id) : undefined
    if (p) return { ...b, kind: 'work', group_project_id: p.id, label: labelFor(p, ctx.aliases) }
    return { ...b, kind: 'work', group_project_id: null, label: t }
  }
  if (col === 'mid') {
    if (!t) return base ? orDelete({ ...base, work_type_id: null }) : undefined
    const w = findWorkType(t, ctx.workTypes)
    if (!w) return undefined // not a MID in the list: left as it was
    return { ...(base ?? ctx.blank(index)), work_type_id: w.id }
  }
  if (col === 'task') {
    if (!base) return t ? { ...ctx.blank(index), description: t } : undefined
    return orDelete({ ...base, description: t })
  }
  // details (업무내용): free text
  if (!base) return t ? { ...ctx.blank(index), details: t } : undefined
  return orDelete({ ...base, details: t })
}

export function applyTemplate(base: TimeSlot | undefined, index: number, t: TaskTemplate, ctx: GridContext): TimeSlot {
  const b = base ?? ctx.blank(index)
  // a repeated task without a MID leaves the row's MID alone
  return { ...b, kind: t.kind, group_project_id: t.group_project_id, label: t.label, description: t.description, work_type_id: t.work_type_id ?? b.work_type_id }
}

export interface CellOp {
  index: number
  col: Col
  text: string
}

/** Turn cell operations into slot changes (several ops on one row are combined). */
export function buildChanges(ops: CellOp[], ctx: GridContext): CellChange[] {
  const byIndex = new Map<number, CellOp[]>()
  for (const op of ops) byIndex.set(op.index, [...(byIndex.get(op.index) ?? []), op])
  const changes: CellChange[] = []
  for (const [index, rowOps] of byIndex) {
    let slot = effectiveSlot(ctx, index)
    let changed = false
    for (const op of rowOps.sort((a, b) => COLS.indexOf(a.col) - COLS.indexOf(b.col))) {
      const next = applyText(slot, index, op.col, op.text, ctx)
      if (next === undefined) continue
      changed = true
      slot = next ?? undefined
    }
    if (changed) changes.push({ index, slot: slot ?? null })
  }
  return changes
}

/** Slot index for row position r (rows past the end continue with the following slots). */
export function slotAt(rows: number[], r: number): number | null {
  if (r < rows.length) return rows[r]
  const index = rows[rows.length - 1] + (r - rows.length + 1)
  return index < SLOTS_PER_DAY ? index : null
}

/**
 * Where pasted cells go. A single value fills the whole selection (like Excel);
 * a block is placed from the selection's top-left cell.
 * A 2- or 3-column block pasted into the Category column is the layout from before MID existed
 * (category, sub category[, content]), unless its second column holds MID names (`isMid`) or the
 * block was copied from this grid (`fromGrid`: its columns are known, so it goes back in order).
 */
export function planPaste(matrix: string[][], sel: Range, rows: number[], isMid: (text: string) => boolean = () => false, fromGrid = false): CellOp[] {
  const ops: CellOp[] = []
  if (matrix.length === 1 && matrix[0].length === 1) {
    for (let r = sel.r1; r <= sel.r2; r++)
      for (let c = sel.c1; c <= sel.c2; c++) ops.push({ index: rows[r], col: COLS[c], text: matrix[0][0] })
    return ops
  }
  const width = Math.max(...matrix.map((cells) => cells.length))
  const second = matrix.map((cells) => (cells[1] ?? '').trim()).filter(Boolean)
  const oldLayout = !fromGrid && sel.c1 === 0 && (width === 2 || width === 3) && !(second.length && second.every(isMid))
  const cols: readonly Col[] = oldLayout ? ['category', 'task', 'details'] : COLS.slice(sel.c1)
  matrix.forEach((cells, i) => {
    const index = slotAt(rows, sel.r1 + i)
    if (index === null) return
    cells.forEach((text, j) => {
      if (j < cols.length) ops.push({ index, col: cols[j], text })
    })
  })
  return ops
}

// ── Clipboard (TSV, compatible with Excel / Google Sheets) ──────────────────

/** Parse tab-separated text; handles Excel quoting ("a""b", cells with tabs/newlines). */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function toTsv(matrix: string[][]): string {
  const quote = (s: string) => (/[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return matrix.map((r) => r.map(quote).join('\t')).join('\n')
}
