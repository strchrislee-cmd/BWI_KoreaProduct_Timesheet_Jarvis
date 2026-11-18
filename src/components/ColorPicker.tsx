import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PRESET_COLORS, hexToRgb, normalizeHex, rgbToHex } from '../pages/timesheets/colors'
import { Button, cx } from './ui'

/** Round swatch that opens a ColorPicker. */
export function Swatch({ color, label, onClick, size = 16 }: { color: string; label: string; onClick?: () => void; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep focus where it is (e.g. the grid)
      onClick={onClick}
      className="shrink-0 rounded-full border border-black/15 shadow-sm hover:scale-110"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  )
}

/**
 * Popover: preset colors, the user's saved colors, and a custom color by wheel, RGB or hex.
 * Render inside a `relative` wrapper; it positions itself below.
 */
export function ColorPicker({
  value,
  isCustom,
  saved,
  onPick,
  onSave,
  onRemoveSaved,
  onClose,
  align = 'left',
  side = 'bottom',
}: {
  value: string
  isCustom: boolean
  saved: string[]
  onPick: (hex: string | null) => void // null = back to the default color
  onSave: (hex: string) => void
  onRemoveSaved: (hex: string) => void
  onClose: () => void
  align?: 'left' | 'right'
  side?: 'bottom' | 'top'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(value.toUpperCase())
  const [hexText, setHexText] = useState(value.toUpperCase())
  const rgb = hexToRgb(draft)

  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [onClose])

  const setColor = (hex: string) => {
    setDraft(hex)
    setHexText(hex)
  }
  const pick = (hex: string | null) => {
    onPick(hex)
    onClose()
  }

  const SwatchGrid = ({ colors, removable }: { colors: string[]; removable?: boolean }) => (
    <div className="grid grid-cols-8 gap-1.5">
      {colors.map((c) => (
        <div key={c} className="group relative">
          <button
            type="button"
            aria-label={`Color ${c}`}
            title={c}
            onClick={() => pick(c)}
            className={cx('h-6 w-6 rounded-full border border-black/15 hover:scale-110', c.toUpperCase() === value.toUpperCase() && 'ring-2 ring-primary ring-offset-1')}
            style={{ backgroundColor: c }}
          />
          {removable && (
            <button
              type="button"
              aria-label={`Remove saved color ${c}`}
              onClick={() => onRemoveSaved(c)}
              className="absolute -right-1 -top-1 hidden rounded-full bg-white p-0.5 shadow group-hover:block"
            >
              <X size={9} />
            </button>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Color picker"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className={cx(
        'pointer-events-auto absolute z-40 w-[320px] cursor-default select-text rounded-2xl border border-line bg-white p-3 text-left text-xs font-normal shadow-xl',
        align === 'right' ? 'right-0' : 'left-0',
        side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
      )}
    >
      <div className="mb-1 font-semibold text-muted">기본 색상</div>
      <SwatchGrid colors={PRESET_COLORS} />
      <div className="mb-1 mt-3 font-semibold text-muted">내 색상</div>
      {saved.length ? <SwatchGrid colors={saved} removable /> : <p className="text-muted">아직 저장한 색상이 없습니다.</p>}

      <div className="mb-1 mt-3 font-semibold text-muted">직접 지정 (RGB)</div>
      <div className="flex items-center gap-1.5">
        <input type="color" aria-label="Color wheel" value={draft.toLowerCase()} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
        {(['R', 'G', 'B'] as const).map((ch, k) => (
          <input
            key={ch}
            aria-label={`Color ${ch}`}
            type="number"
            min={0}
            max={255}
            value={rgb[k]}
            onChange={(e) => {
              const next = [...rgb] as [number, number, number]
              next[k] = Number(e.target.value)
              setColor(rgbToHex(...next))
            }}
            className="field !w-12 shrink-0 !rounded-lg !px-1 !py-1 text-center"
          />
        ))}
        <input
          aria-label="Hex"
          value={hexText}
          onChange={(e) => {
            setHexText(e.target.value)
            const h = normalizeHex(e.target.value)
            if (h) setDraft(h)
          }}
          className="field !w-[80px] shrink-0 !rounded-lg !px-1.5 !py-1 font-mono"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-6 w-6 rounded-full border border-black/15" style={{ backgroundColor: draft }} />
        <span className="font-mono text-muted">{draft}</span>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
        <Button type="button" variant="ghost" className="!px-2.5 !py-1 text-xs" disabled={!isCustom} onClick={() => pick(null)}>
          기본값
        </Button>
        <Button type="button" variant="outline" className="!px-2.5 !py-1 text-xs" onClick={() => (onSave(draft), pick(draft))}>
          프리셋에 저장
        </Button>
        <Button type="button" className="!px-2.5 !py-1 text-xs" onClick={() => pick(draft)}>
          적용
        </Button>
      </div>
    </div>
  )
}
