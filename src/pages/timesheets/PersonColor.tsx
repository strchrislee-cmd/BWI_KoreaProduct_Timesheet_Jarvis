import { useMemo, useRef, useState } from 'react'
import { ColorMenu, Swatch } from '../../components/ColorMenu'
import { orgRows } from '../../domain/org'
import type { Profile } from '../../domain/types'
import { personColor, personColorKey } from './colors'
import { useTimesheets } from './TimesheetsLayout'
import { useColorPrefs } from './useColorPrefs'

/** people in Org Chart order: the order default person colours follow */
export function usePersonOrder(): string[] {
  const { profiles } = useTimesheets()
  return useMemo(() => orgRows(profiles).map((r) => r.person.id), [profiles])
}

/** A person's colour dot (Team window, Daily Kanban); click it to give them a colour — yours only, like project colours. */
export function PersonColorDot({ person, size = 12 }: { person: Pick<Profile, 'id' | 'name'>; size?: number }) {
  const colorPrefs = useColorPrefs()
  const { prefs } = colorPrefs
  const ref = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const order = usePersonOrder()
  const key = personColorKey(person.id)
  const color = personColor(person.id, prefs, order)
  return (
    <>
      <span ref={ref} className="inline-flex" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Swatch color={color} label={`Color of ${person.name}`} size={size} onClick={() => setAnchor(ref.current?.getBoundingClientRect() ?? null)} />
      </span>
      {anchor && (
        <ColorMenu
          title={person.name}
          note="이 사람의 색 (나에게만 적용 · 팀원 창과 데일리 칸반)"
          value={color}
          isCustom={colorPrefs.isCustom(key)}
          saved={prefs.palette}
          onPick={(hex) => void colorPrefs.setCategoryColor(key, hex)}
          onSave={(hex) => void colorPrefs.savePreset(hex)}
          onRemoveSaved={(hex) => void colorPrefs.removePreset(hex)}
          onClose={() => setAnchor(null)}
          anchor={anchor}
        />
      )}
    </>
  )
}
