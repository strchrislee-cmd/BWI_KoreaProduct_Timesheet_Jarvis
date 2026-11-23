import { Shuffle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ColorMenu } from '../../components/ColorMenu'
import { randomColor, randomPastel } from './colors'
import type { useColorPrefs } from './useColorPrefs'

/**
 * Colour control for a 대분류 (major group): one swatch that paints every 소분류 in the group with a
 * common colour (each item can still be changed on its own afterwards), and a button that gives
 * every item its own random colour.
 */
export function GroupColorControl({
  label,
  items,
  colors,
  children,
}: {
  label: string
  /** the 소분류 in the group: preference key (project id) and current colour */
  items: { key: string; color: string }[]
  colors: ReturnType<typeof useColorPrefs>
  /** shown between the swatch and the random button (the group's name) */
  children?: ReactNode
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  if (!items.length) return <>{children}</>
  const keys = items.map((it) => it.key)
  const current = items.map((it) => it.color)
  const same = current.every((c) => c.toUpperCase() === current[0].toUpperCase())
  const apply = (pick: () => string | null) => void colors.setCategoryColors(keys.map((k) => [k, pick()]))
  return (
    <>
      <button
        type="button"
        aria-label={`Group color of ${label}`}
        title="대분류 공통 색"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        className="h-[18px] w-[18px] shrink-0 rounded-chip border border-black/15 shadow-sm hover:scale-110"
        style={
          same
            ? { backgroundColor: current[0] }
            : {
                backgroundImage: `conic-gradient(${current.slice(0, 8).join(', ')})`,
              }
        }
      />
      {children}
      <button
        type="button"
        aria-label={`Randomize colors in ${label}`}
        title="하위 항목을 각각 랜덤 색으로"
        onClick={() => apply(randomColor)}
        className="inline-flex items-center gap-1 rounded-chip bg-black/5 px-1.5 py-0.5 text-[11px] font-semibold normal-case text-muted hover:bg-black/10"
      >
        <Shuffle size={12} /> 모두 랜덤
      </button>
      {anchor && (
        <ColorMenu
          anchor={anchor}
          title={`${label} · ${keys.length}개`}
          note="고른 색이 이 대분류의 모든 항목에 적용됩니다. 항목별로 다시 바꿀 수 있습니다."
          value={current[0]}
          isCustom={keys.some((k) => colors.isCustom(k))}
          saved={colors.prefs.palette}
          onPick={(hex) => apply(() => hex)}
          onSave={(hex) => void colors.savePreset(hex)}
          onRemoveSaved={(hex) => void colors.removePreset(hex)}
          onClose={() => setAnchor(null)}
          actions={[
            { label: '하위 항목 모두 랜덤', onClick: () => apply(randomColor) },
            {
              label: '하위 항목 모두 랜덤 (파스텔)',
              onClick: () => apply(randomPastel),
            },
          ]}
        />
      )}
    </>
  )
}
