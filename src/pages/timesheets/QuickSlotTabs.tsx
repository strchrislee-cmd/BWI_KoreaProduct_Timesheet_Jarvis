import { useState } from 'react'
import { cx } from '../../components/ui'
import { QUICK_SLOTS, defaultSlotName, slotLabel, type QuickSlots } from '../../domain/quickTasks'

/**
 * Quick add preset slots (e.g. one per quarter): pick the one in use; double-click to give it a
 * name. Each tab shows how many items the slot holds.
 */
export function QuickSlotTabs({
  slots,
  counts,
  onPick,
  onRename,
}: {
  slots: QuickSlots
  counts: number[]
  onPick: (i: number) => void
  onRename: (i: number, name: string) => void
}) {
  const [renaming, setRenaming] = useState<{ i: number; name: string } | null>(null)
  const save = () => {
    if (renaming) onRename(renaming.i, renaming.name.trim().slice(0, 20))
    setRenaming(null)
  }
  return (
    <div role="tablist" aria-label="Quick add presets" className="mb-3 flex gap-0.5 rounded-control bg-black/5 p-0.5" data-testid="quick-slots">
      {Array.from({ length: QUICK_SLOTS }, (_, i) =>
        renaming?.i === i ? (
          <input
            key={i}
            aria-label={`Name of preset ${i + 1}`}
            autoFocus
            maxLength={20}
            placeholder={defaultSlotName(i)}
            className="field min-w-0 flex-1 !rounded-[7px] !px-1.5 !py-0.5 text-xs"
            value={renaming.name}
            onChange={(e) => setRenaming({ i, name: e.target.value })}
            onFocus={(e) => e.target.select()}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setRenaming(null)
            }}
          />
        ) : (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={slots.active === i}
            aria-label={`Preset ${i + 1}${slots.names[i] ? ` ${slots.names[i]}` : ''}`}
            title={`${slotLabel(slots, i)} · ${counts[i]}개 — 더블클릭해서 이름 바꾸기 (예: 2026 1Q, 여름 시즌)`}
            className={cx(
              'flex min-w-0 items-center justify-center gap-0.5 rounded-[7px] px-1 py-1 text-xs font-semibold',
              // the slot in use gets more room, so its name shows whole; the others show it on hover
              slots.active === i ? 'flex-[1.7] bg-white text-primary shadow-sm' : 'flex-1 text-muted hover:text-ink',
            )}
            onClick={() => onPick(i)}
            onDoubleClick={() => setRenaming({ i, name: slots.names[i] })}
          >
            <span className="te-clip">{slotLabel(slots, i)}</span>
            <span className={cx('shrink-0 rounded-full px-[3px] text-[9px] font-normal leading-[13px] tabular-nums', slots.active === i ? 'bg-primary/10' : 'bg-black/5')}>{counts[i]}</span>
          </button>
        ),
      )}
    </div>
  )
}
