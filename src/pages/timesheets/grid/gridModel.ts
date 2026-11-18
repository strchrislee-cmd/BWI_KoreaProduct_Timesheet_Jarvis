// Pure spreadsheet logic for the Daily Log grid (selection ranges, clipboard, cell edits).
// Kept free of React so it can be unit-tested (tests/grid.test.ts).
import { resolveLabel } from '../../../domain/labels'
import { SLOTS_PER_DAY } from '../../../domain/time'
import type { GroupProject, ProjectAlias, TaskTemplate, TimeSlot } from '../../../domain/types'
import { displayName, labelFor } from '../projectUi'

export const COLS = ['category', 'task', 'focus'] as const
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
  /** Saved slots of the day. */
  saved: Map<number, TimeSlot>
  /** Slot indexes that default to lunch when nothing is saved. */
  lunch: Set<number>
  blank: (index: number) => TimeSlot
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
export function cellText(slot: TimeSlot | undefined, col: Col, byId: Map<string, GroupProject>): string {
  if (!slot) return ''
  if (col === 'task') return slot.description
  if (col === 'focus') return slot.focus === null ? '' : String(slot.focus)
  if (slot.kind === 'nonwork') return slot.label
  const p = slot.group_project_id ? byId.get(slot.group_project_id) : undefined
  return p ? displayName(p) : slot.label
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
      if (!base.description) return null
      return { ...base, kind: 'work', group_project_id: null, label: '' }
    }
    const r = resolveLabel(t, ctx.aliases, ctx.projects)!
    const b = base ?? ctx.blank(index)
    if (r.kind === 'nonwork') return { ...b, kind: 'nonwork', group_project_id: null, label: t }
    const p = r.group_project_id ? ctx.byId.get(r.group_project_id) : undefined
    if (p) return { ...b, kind: 'work', group_project_id: p.id, label: labelFor(p, ctx.aliases) }
    return { ...b, kind: 'work', group_project_id: null, label: t }
  }
  if (col === 'task') {
    if (!base) return t ? { ...ctx.blank(index), description: t } : undefined
    if (!t && base.kind === 'work' && !base.group_project_id && !base.label) return null
    return { ...base, description: t }
  }
  // focus
  if (!base) return undefined
  if (!t) return { ...base, focus: null }
  const n = Number(t)
  if (!Number.isInteger(n) || n < 0 || n > 3) return undefined
  return { ...base, focus: n }
}

export function applyTemplate(base: TimeSlot | undefined, index: number, t: TaskTemplate, ctx: GridContext): TimeSlot {
  return { ...(base ?? ctx.blank(index)), kind: t.kind, group_project_id: t.group_project_id, label: t.label, description: t.description }
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
 */
export function planPaste(matrix: string[][], sel: Range, rows: number[]): CellOp[] {
  const ops: CellOp[] = []
  if (matrix.length === 1 && matrix[0].length === 1) {
    for (let r = sel.r1; r <= sel.r2; r++)
      for (let c = sel.c1; c <= sel.c2; c++) ops.push({ index: rows[r], col: COLS[c], text: matrix[0][0] })
    return ops
  }
  matrix.forEach((cells, i) => {
    const index = slotAt(rows, sel.r1 + i)
    if (index === null) return
    cells.forEach((text, j) => {
      const c = sel.c1 + j
      if (c < COLS.length) ops.push({ index, col: COLS[c], text })
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
