import { ArrowDown, ArrowUp, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ColorMenu } from '../../components/ColorMenu'
import { Button, Card, ErrorNote, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import type { WorkType } from '../../domain/types'
import { WORK_TYPE_GRAY, sortWorkTypes } from '../../domain/workTypes'
import { useT } from '../../lib/i18n'
import { useTimesheets } from './TimesheetsLayout'
import { useColorPrefs } from './useColorPrefs'

/**
 * Projects → MID (중분류): the list of work kinds everyone picks from in Daily Log.
 * Admins add, rename (double-click), reorder, recolor and remove (hidden when already used);
 * L1–L3 see it read-only.
 */
export function WorkTypesCard() {
  const tr = useT()
  const { store } = useStore()
  const user = useUser()
  const isAdmin = user.role === 'admin'
  const { workTypes, reloadMaster } = useTimesheets()
  const colors = useColorPrefs()
  const [error, setError] = useState<Error | null>(null)
  const [note, setNote] = useState('')
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [colorOf, setColorOf] = useState<{ w: WorkType; anchor: DOMRect } | null>(null)

  const visible = sortWorkTypes(workTypes.filter((w) => !w.hidden))
  const hidden = sortWorkTypes(workTypes.filter((w) => w.hidden))
  const rows = showHidden ? [...visible, ...hidden] : visible

  /** fn may return the message to show (else `ok`) */
  async function run(fn: () => Promise<string | void>, ok?: string) {
    try {
      const msg = await fn()
      setError(null)
      setNote((typeof msg === 'string' ? msg : ok) ?? '')
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  const add = () =>
    run(async () => {
      await store.addWorkType(newName)
      setNewName('')
    }, `추가했습니다: ${newName.trim()}`)

  const rename = (w: WorkType, name: string) => {
    setRenaming(null)
    if (name.trim() && name.trim() !== w.name) void run(() => store.updateWorkType(w.id, { name }))
  }

  /** move one step up/down among the visible ones and renumber them 1..n */
  const move = (w: WorkType, step: -1 | 1) => {
    const ids = visible.map((x) => x.id)
    const at = ids.indexOf(w.id)
    const to = at + step
    if (to < 0 || to >= ids.length) return
    ;[ids[at], ids[to]] = [ids[to], ids[at]]
    void run(() => store.reorderWorkTypes(ids.map((id, i) => ({ id, sort_order: i + 1 })).filter((u) => workTypes.find((x) => x.id === u.id)?.sort_order !== u.sort_order)))
  }

  const remove = (w: WorkType) =>
    run(async () => {
      const result = await store.removeWorkType(w.id)
      return result === 'hidden' ? `${w.name}: 이미 쓰인 기록이 있어 숨겼습니다(기존 기록은 그대로, 숨긴 항목 보기 → 되돌리기).` : `${w.name}: 삭제했습니다.`
    })

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {tr('MID')} <span className="text-sm font-normal text-muted">{visible.length}개 · Daily Log에서 대분류 다음 칸</span>
        </span>
      }
      action={
        isAdmin && hidden.length > 0 ? (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> 숨긴 항목 보기 ({hidden.length})
          </label>
        ) : undefined
      }
    >
      {!isAdmin && (
        <p className="mb-3 flex items-start gap-2 rounded-control bg-black/[0.04] px-3 py-2 text-sm text-muted" data-testid="mid-lock-note">
          <Lock size={14} className="mt-0.5 shrink-0" /> 관리자 설정입니다. Daily Log에서 골라 쓸 수 있고, 목록은 관리자만 바꿀 수 있습니다.
        </p>
      )}
      <ErrorNote error={error} />
      {note && (
        <p className="mb-2 rounded-control bg-sage px-3 py-2 text-sm font-semibold text-primary" role="status">
          {note}
        </p>
      )}
      <table className="sheet" aria-label="MID list">
        <thead>
          <tr>
            <th className="w-14">{tr('Color')}</th>
            <th className="num w-12">No</th>
            <th>{tr('MID')}</th>
            {isAdmin && <th className="w-28" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const no = visible.indexOf(w) + 1
            return (
              <tr key={w.id} className={cx(w.hidden && 'text-muted')}>
                <td>
                  {isAdmin && !w.hidden ? (
                    <button
                      aria-label={`Color of ${w.name}`}
                      title="색 바꾸기"
                      className="block h-4 w-4 rounded-chip border border-black/15 shadow-sm hover:scale-110"
                      style={{ backgroundColor: w.color ?? WORK_TYPE_GRAY }}
                      onClick={(e) => setColorOf({ w, anchor: e.currentTarget.getBoundingClientRect() })}
                    />
                  ) : (
                    <span aria-label={`Color of ${w.name}`} className="block h-4 w-4 rounded-chip border border-black/15" style={{ backgroundColor: w.color ?? WORK_TYPE_GRAY }} />
                  )}
                </td>
                <td className="num font-mono text-xs text-muted">{w.hidden ? '–' : no}</td>
                <td>
                  {renaming?.id === w.id ? (
                    <input
                      autoFocus
                      className="field !py-1"
                      aria-label={`Rename ${w.name}`}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: w.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') rename(w, renaming.name)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={() => rename(w, renaming.name)}
                    />
                  ) : (
                    <span
                      className={cx('rounded-chip px-1.5 py-0.5 font-medium', isAdmin && !w.hidden && 'cursor-text')}
                      style={{ backgroundColor: `color-mix(in srgb, ${w.color ?? WORK_TYPE_GRAY} 42%, white)` }}
                      title={isAdmin ? (w.hidden ? undefined : '더블클릭해서 이름 바꾸기') : '관리자 설정 · 수정 불가'}
                      onDoubleClick={() => isAdmin && !w.hidden && setRenaming({ id: w.id, name: w.name })}
                    >
                      {w.name}
                    </span>
                  )}
                  {w.hidden && <span className="ml-2 text-xs">숨김</span>}
                </td>
                {isAdmin && (
                  <td className="whitespace-nowrap text-right">
                    {w.hidden ? (
                      <Button variant="ghost" className="!px-2 !py-1 text-xs" aria-label={`Restore ${w.name}`} onClick={() => void run(() => store.updateWorkType(w.id, { hidden: false }), `되돌렸습니다: ${w.name}`)}>
                        <RotateCcw size={14} /> 되돌리기
                      </Button>
                    ) : (
                      <span className="inline-flex gap-0.5">
                        <button aria-label={`Move ${w.name} up`} disabled={no === 1} className="rounded-control p-1.5 text-muted hover:bg-black/5 disabled:opacity-30" onClick={() => move(w, -1)}>
                          <ArrowUp size={14} />
                        </button>
                        <button aria-label={`Move ${w.name} down`} disabled={no === visible.length} className="rounded-control p-1.5 text-muted hover:bg-black/5 disabled:opacity-30" onClick={() => move(w, 1)}>
                          <ArrowDown size={14} />
                        </button>
                        <button aria-label={`Remove ${w.name}`} title="삭제 (이미 쓰였으면 숨김)" className="rounded-control p-1.5 text-muted hover:bg-black/5 hover:text-[#9a3a0e]" onClick={() => void remove(w)}>
                          <Trash2 size={14} />
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {isAdmin && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (newName.trim()) void add()
          }}
        >
          <input className="field" aria-label="New MID" placeholder="새 MID 이름 (예: 개발-원가절감)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button type="submit" className="shrink-0" disabled={!newName.trim()}>
            <Plus size={16} /> MID 추가
          </Button>
        </form>
      )}

      {colorOf && (
        <ColorMenu
          key={colorOf.w.id}
          anchor={colorOf.anchor}
          title={colorOf.w.name}
          note="팀 공통 색입니다. 모두의 Daily Log와 Weekly Result에 같이 바뀝니다."
          value={colorOf.w.color ?? WORK_TYPE_GRAY}
          isCustom={colorOf.w.color !== null}
          saved={colors.prefs.palette}
          onPick={(hex) => {
            void run(() => store.updateWorkType(colorOf.w.id, { color: hex ?? WORK_TYPE_GRAY }))
            setColorOf(null)
          }}
          onSave={(hex) => void colors.savePreset(hex)}
          onRemoveSaved={(hex) => void colors.removePreset(hex)}
          onClose={() => setColorOf(null)}
        />
      )}
    </Card>
  )
}
