import { GripVertical, MoreHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import { ColorMenu } from '../../components/ColorMenu'
import { cx } from '../../components/ui'
import type { TaskTemplate } from '../../domain/types'
import { WORK_TYPE_GRAY } from '../../domain/workTypes'
import { useT } from '../../lib/i18n'
import { moveItem } from '../../lib/ordering'
import { useDragReorder } from '../../lib/useDragReorder'
import { chipBg } from './colors'
import { templateCategory } from './grid/DailyGrid'
import type { GridContext } from './grid/gridModel'

export interface TemplatesTableProps {
  /** in the order shown; No 1 is the first */
  items: TaskTemplate[]
  ctx: GridContext
  colorOf: (t: TaskTemplate) => string
  canEdit: boolean
  /** how many rows of the log are selected (a click applies the task to them) */
  selectedCount: number
  onApply: (t: TaskTemplate) => void
  onReorder: (ids: string[]) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onColor: (id: string, hex: string | null) => void
  palette: { saved: string[]; onSave: (hex: string) => void; onRemove: (hex: string) => void }
}

/**
 * Repeated tasks as a short table: No · Task (long names wrap, nothing is cut off). A click applies
 * the task to the selected rows of the log; drag a row, or double-click its No and type a number, to
 * move it (frequent ones up front); … shows the task's Project · Type, then name, colour and delete.
 */
export function TemplatesTable({ items, ctx, colorOf, canEdit, selectedCount, onApply, onReorder, onRename, onDelete, onColor, palette }: TemplatesTableProps) {
  const tr = useT()
  const ids = items.map((t) => t.id)
  const body = useRef<HTMLTableSectionElement>(null)
  const drag = useDragReorder(body, (_, from, to) => onReorder(moveItem(ids, from, to)), 5)
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null)
  const [editingNo, setEditingNo] = useState<{ id: string; value: string } | null>(null)
  const menuItem = menu ? items.find((t) => t.id === menu.id) : undefined

  const typeOf = (t: TaskTemplate) => (t.work_type_id ? ctx.workTypeById.get(t.work_type_id) : undefined)
  const nameOf = (t: TaskTemplate) => t.description || t.label

  function commitNo(t: TaskTemplate) {
    const edit = editingNo
    setEditingNo(null)
    const n = Number.parseInt(edit?.value ?? '', 10)
    if (!Number.isFinite(n)) return
    const from = ids.indexOf(t.id)
    const to = Math.min(Math.max(n, 1), ids.length) - 1
    if (to !== from) onReorder(moveItem(ids, from, to))
  }

  const projectChip = (t: TaskTemplate) => (
    <span className="inline-block max-w-full rounded-chip px-1.5 py-0.5 text-xs font-semibold [overflow-wrap:anywhere] [word-break:keep-all]" style={{ backgroundColor: chipBg(colorOf(t)) }}>
      {templateCategory(t, ctx)}
    </span>
  )
  const typeChip = (t: TaskTemplate) => {
    const w = typeOf(t)
    return w ? (
      <span className="inline-block max-w-full rounded-chip px-1.5 py-0.5 text-xs font-semibold [overflow-wrap:anywhere] [word-break:keep-all]" style={{ backgroundColor: chipBg(w.color ?? WORK_TYPE_GRAY) }}>
        {w.name}
      </span>
    ) : (
      <span className="text-muted">—</span>
    )
  }

  return (
    <>
      <table className="sheet table-fixed" aria-label="Repeated tasks" data-testid="templates">
        <colgroup>
          <col style={{ width: 36 }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="num !px-1.5">No</th>
            <th className="!px-1.5">{tr('Task')}</th>
            <th aria-label="Options" />
          </tr>
        </thead>
        <tbody ref={body}>
          {items.map((t, i) => {
            const d = drag.state
            const name = nameOf(t)
            return (
              <tr
                key={t.id}
                data-reorder="templates"
                data-testid="template-row"
                className={cx(
                  'group touch-none',
                  canEdit && 'cursor-pointer hover:bg-white/60',
                  d?.from === i && 'opacity-40',
                  d && d.over === i && d.from !== i && 'outline outline-2 -outline-offset-2 outline-primary',
                )}
                title={canEdit ? `누르면 선택한 ${selectedCount}개 행에 적용` : undefined}
                {...(canEdit ? drag.bind('templates', i) : {})}
                onClick={() => {
                  if (drag.consumeDragged() || !canEdit) return
                  onApply(t)
                }}
              >
                <td
                  className={cx('num !px-1.5 font-mono text-xs text-muted', canEdit && 'cursor-text')}
                  title={canEdit ? '더블클릭해서 번호 바꾸기 · 끌어서 옮기기' : undefined}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => editingNo?.id === t.id && e.stopPropagation()}
                  onDoubleClick={() => canEdit && setEditingNo({ id: t.id, value: String(i + 1) })}
                >
                  {editingNo?.id === t.id ? (
                    <input
                      aria-label={`No of ${name}`}
                      type="number"
                      min={1}
                      max={items.length}
                      autoFocus
                      className="field !w-10 !px-1 !py-0.5 text-right font-mono text-xs"
                      value={editingNo.value}
                      onChange={(e) => setEditingNo({ id: t.id, value: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => commitNo(t)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditingNo(null)
                      }}
                    />
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      {canEdit && <GripVertical size={12} className="opacity-0 group-hover:opacity-60" aria-hidden />}
                      {i + 1}
                    </span>
                  )}
                </td>
                <td className="!px-1.5 !py-1.5">
                  {/* a button so the keyboard can apply it too (Enter bubbles to the row); the chip
                      carries the task's colour, Project · Type are in the … menu */}
                  <button
                    type="button"
                    className="inline-block max-w-full rounded-chip px-2 py-0.5 text-left text-[13px] font-semibold [overflow-wrap:anywhere] [word-break:keep-all]"
                    style={{ backgroundColor: chipBg(colorOf(t)) }}
                    disabled={!canEdit}
                  >
                    {name}
                  </button>
                </td>
                <td className="!px-0.5">
                  <button
                    type="button"
                    aria-label={`Options for ${name}`}
                    className="rounded-chip p-1 opacity-50 hover:bg-black/5 hover:opacity-100 group-hover:opacity-100"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenu({ id: t.id, anchor: (e.currentTarget.closest('tr') as HTMLElement).getBoundingClientRect() })
                    }}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">행을 누르면 선택한 {selectedCount}개 행에 적용 · 끌거나 No를 더블클릭해서 순서 변경 · … 에서 이름·색·삭제</p>
      {menu && menuItem && (
        <ColorMenu
          key={menu.id}
          anchor={menu.anchor}
          context={
            <>
              {projectChip(menuItem)}
              <span className="text-muted">·</span>
              {typeChip(menuItem)}
            </>
          }
          title={nameOf(menuItem)}
          onRename={(n) => onRename(menuItem.id, n)}
          onDelete={() => {
            onDelete(menuItem.id)
            setMenu(null)
          }}
          value={colorOf(menuItem)}
          isCustom={menuItem.color !== null}
          saved={palette.saved}
          onPick={(hex) => onColor(menuItem.id, hex)}
          onSave={palette.onSave}
          onRemoveSaved={palette.onRemove}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
