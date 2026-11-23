import { usePreferences } from '../../data/usePreferences'
import { addToPalette } from './colors'

/** Category colors and the saved palette (part of the user's preferences). */
export function useColorPrefs() {
  const { prefs, update, error } = usePreferences()
  return {
    prefs,
    error,
    /** Update any other preference through the same queue. */
    update,
    isCustom: (key: string) => key in prefs.categoryColors,
    setCategoryColor: (key: string, hex: string | null) =>
      update((p) => {
        const categoryColors = { ...p.categoryColors }
        if (hex) categoryColors[key] = hex
        else delete categoryColors[key]
        return { ...p, categoryColors }
      }),
    /** Several categories at once (a 대분류's common colour, or random colours for all of them). */
    setCategoryColors: (entries: [string, string | null][]) =>
      update((p) => {
        const categoryColors = { ...p.categoryColors }
        for (const [key, hex] of entries) {
          if (hex) categoryColors[key] = hex
          else delete categoryColors[key]
        }
        return { ...p, categoryColors }
      }),
    savePreset: (hex: string) => update((p) => ({ ...p, palette: addToPalette(p.palette, hex) })),
    removePreset: (hex: string) => update((p) => ({ ...p, palette: p.palette.filter((x) => x.toUpperCase() !== hex.toUpperCase()) })),
  }
}
