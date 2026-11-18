import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, useUser } from '../../data/StoreContext'
import { addToPalette, readColorPrefs, type ColorPrefs } from './colors'

/** The signed-in user's category colors and saved palette, saved in profiles.preferences. */
export function useColorPrefs() {
  const { store, refreshUser } = useStore()
  const user = useUser()
  const prefs = useMemo(() => readColorPrefs(user.preferences), [user.preferences])
  const latest = useRef<ColorPrefs>(prefs) // so quick successive changes don't overwrite each other
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    latest.current = prefs
  }, [prefs])

  async function update(fn: (p: ColorPrefs) => ColorPrefs) {
    const next = fn(latest.current)
    latest.current = next
    try {
      await store.updateProfile(user.id, { preferences: { ...user.preferences, ...next } })
      await refreshUser()
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
  }

  return {
    prefs,
    error,
    isCustom: (key: string) => key in prefs.categoryColors,
    setCategoryColor: (key: string, hex: string | null) =>
      update((p) => {
        const categoryColors = { ...p.categoryColors }
        if (hex) categoryColors[key] = hex
        else delete categoryColors[key]
        return { ...p, categoryColors }
      }),
    savePreset: (hex: string) => update((p) => ({ ...p, palette: addToPalette(p.palette, hex) })),
    removePreset: (hex: string) => update((p) => ({ ...p, palette: p.palette.filter((x) => x.toUpperCase() !== hex.toUpperCase()) })),
  }
}
