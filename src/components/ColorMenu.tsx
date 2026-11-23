import { Check, Info, Shuffle, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NAMED_COLORS, hexToRgb, normalizeHex, randomColor, randomPastel, rgbToHex } from '../pages/timesheets/colors'
import { Button, cx } from './ui'

/** Round color dot (optionally a button). */
export function Swatch({ color, label, onClick, size = 16 }: { color: string; label: string; onClick?: () => void; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep focus where it is (e.g. the grid)
      onClick={onClick}
      className="shrink-0 rounded-chip border border-black/15 shadow-sm hover:scale-110"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  )
}

export interface ColorMenuProps {
  title: string
  /** Given → the name is editable (repeated tasks). */
  onRename?: (name: string) => void
  onDelete?: () => void
  note?: string
  value: string
  isCustom: boolean
  saved: string[]
  onPick: (hex: string | null) => void // null = default color
  onSave: (hex: string) => void
  onRemoveSaved: (hex: string) => void
  onClose: () => void
  /** Viewport rect of the element the menu belongs to. */
  anchor: DOMRect
  placement?: 'right' | 'below'
  /** extra commands shown above the colour list (e.g. "randomise every item in this group") */
  actions?: { label: string; onClick: () => void }[]
}

/**
 * Notion-style option menu: name, delete, and a color list
 * (random, random pastel, default, named colors, saved colors, custom RGB).
 */
export function ColorMenu({ title, onRename, onDelete, note, value, isCustom, saved, onPick, onSave, onRemoveSaved, onClose, anchor, placement = 'below', actions }: ColorMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState(title)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Rendered in a portal with fixed positioning so scroll containers never clip it;
  // flips to the other side / shifts up when it would leave the viewport.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left: number
    let top: number
    if (placement === 'right') {
      left = anchor.right + 6
      if (left + w > vw - 8) left = anchor.left - w - 6
      top = anchor.top
    } else {
      left = anchor.left
      if (left + w > vw - 8) left = anchor.right - w
      top = anchor.bottom + 6
      if (top + h > vh - 8 && anchor.top - h - 6 >= 8) top = anchor.top - h - 6
    }
    top = Math.max(8, Math.min(top, vh - h - 8))
    left = Math.max(8, left)
    setPos({ top, left })
  }, [anchor, placement, custom])

  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [onClose])

  const rename = () => {
    const n = name.trim()
    if (onRename && n && n !== title) onRename(n)
  }
  const current = value.toUpperCase()

  const Row = ({ label, color, checked, onClick, icon }: { label: string; color?: string; checked?: boolean; onClick: () => void; icon?: ReactNode }) => (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-chip px-2 py-0.5 text-left text-[13px] hover:bg-black/5">
      {icon ?? <span className="h-4 w-4 shrink-0 rounded-[4px] border border-black/10" style={{ backgroundColor: color }} />}
      <span className="flex-1">{label}</span>
      {checked && <Check size={14} />}
    </button>
  )

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Option menu"
      data-grid-popover=""
      // keep keyboard focus (e.g. the grid editor) unless a text field is clicked
      onMouseDown={(e) => !(e.target instanceof HTMLInputElement) && e.preventDefault()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="glass-strong fixed z-[60] max-h-[calc(100vh-16px)] w-[260px] cursor-default select-text overflow-auto rounded-menu p-2 text-left text-xs font-normal text-ink"
      style={pos ? { top: pos.top, left: pos.left } : { top: anchor.bottom, left: anchor.left, visibility: 'hidden' }}
    >
      <div className="flex items-center gap-1 px-1 pb-1">
        {onRename ? (
          <input
            aria-label="Option name"
            className="field !rounded-control !px-2 !py-1 text-[13px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                rename()
              }
            }}
          />
        ) : (
          <span className="truncate px-1 py-1 text-[13px] font-semibold">{title}</span>
        )}
        {note && (
          <span title={note} className="ml-auto shrink-0 text-muted">
            <Info size={14} />
          </span>
        )}
      </div>
      {onDelete && (
        <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 rounded-chip px-2 py-1 text-[13px] hover:bg-black/5">
          <Trash2 size={14} /> 삭제
        </button>
      )}
      {actions?.map((a) => (
        <button key={a.label} type="button" onClick={a.onClick} className="flex w-full items-center gap-2 rounded-chip px-2 py-1 text-[13px] hover:bg-black/5">
          <Shuffle size={14} className="text-primary" /> {a.label}
        </button>
      ))}
      <div className="my-1 border-t border-dashed border-black/10" />
      <div className="px-2 pb-1 text-[11px] font-semibold text-muted">색</div>
      <Row label="랜덤" icon={<Shuffle size={14} className="text-primary" />} onClick={() => onPick(randomColor())} />
      <Row label="랜덤 (파스텔)" icon={<Shuffle size={14} className="text-[#C14C8A]" />} onClick={() => onPick(randomPastel())} />
      <Row label="기본" color="#ffffff" checked={!isCustom} onClick={() => onPick(null)} />
      {NAMED_COLORS.map((c) => (
        <Row key={c.hex} label={c.name} color={c.hex} checked={isCustom && current === c.hex} onClick={() => onPick(c.hex)} />
      ))}
      {saved.length > 0 && (
        <>
          <div className="px-2 pb-1 pt-2 text-[11px] font-semibold text-muted">내 색상</div>
          <div className="grid grid-cols-8 gap-1.5 px-2">
            {saved.map((c) => (
              <div key={c} className="group relative">
                <button
                  type="button"
                  aria-label={`Color ${c}`}
                  title={c}
                  onClick={() => onPick(c)}
                  className={cx('h-5 w-5 rounded-chip border border-black/15 hover:scale-110', isCustom && c.toUpperCase() === current && 'ring-2 ring-primary ring-offset-1')}
                  style={{ backgroundColor: c }}
                />
                <button
                  type="button"
                  aria-label={`Remove saved color ${c}`}
                  onClick={() => onRemoveSaved(c)}
                  className="absolute -right-1 -top-1 hidden rounded-chip bg-white p-0.5 shadow group-hover:block"
                >
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="my-1 border-t border-dashed border-black/10" />
      {custom ? (
        <CustomColor value={value} onApply={onPick} onSave={onSave} />
      ) : (
        <button type="button" onClick={() => setCustom(true)} className="w-full rounded-chip px-2 py-1 text-left text-[13px] hover:bg-black/5">
          직접 지정 (RGB)…
        </button>
      )}
    </div>,
    document.body,
  )
}

/** Color wheel + R/G/B + hex, with "save to presets". */
function CustomColor({ value, onApply, onSave }: { value: string; onApply: (hex: string) => void; onSave: (hex: string) => void }) {
  const [draft, setDraft] = useState(value.toUpperCase())
  const [hexText, setHexText] = useState(value.toUpperCase())
  const rgb = hexToRgb(draft)
  const set = (hex: string) => {
    setDraft(hex)
    setHexText(hex)
  }
  return (
    <div className="space-y-2 px-2 pb-1">
      <div className="flex items-center gap-1">
        <input type="color" aria-label="Color wheel" value={draft.toLowerCase()} onChange={(e) => set(e.target.value.toUpperCase())} className="h-7 w-7 shrink-0 cursor-pointer rounded-chip border-0 bg-transparent p-0" />
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
              set(rgbToHex(...next))
            }}
            className="field !w-11 shrink-0 !rounded-chip !px-1 !py-0.5 text-center"
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
          className="field !w-[74px] shrink-0 !rounded-chip !px-1 !py-0.5 font-mono"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-5 w-5 rounded-chip border border-black/15" style={{ backgroundColor: draft }} />
        <span className="flex-1 font-mono text-muted">{draft}</span>
        <Button type="button" variant="outline" className="!px-2 !py-0.5 text-[11px]" onClick={() => (onSave(draft), onApply(draft))}>
          프리셋에 저장
        </Button>
        <Button type="button" className="!px-2 !py-0.5 text-[11px]" onClick={() => onApply(draft)}>
          적용
        </Button>
      </div>
    </div>
  )
}
