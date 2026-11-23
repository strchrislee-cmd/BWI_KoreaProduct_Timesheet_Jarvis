// Panel opacity (Settings → 화면 스타일): how much of the background shows through the glass
// panels, kept per UI style. The style's default keeps its designed look, 100% makes panels solid
// and lower values make them clearer. Applied through CSS variables read by .glass / .glass-sage.
import type { UiStyle } from '../data/preferences'

export const PANEL_OPACITY_DEFAULT: Record<UiStyle, number> = { blur: 58, liquid: 22 }
export const PANEL_OPACITY_MIN = 10

/** Scale one of a style's own alpha values for an opacity (%) whose default is `def`. */
export function scaleAlpha(alpha: number, opacity: number, def: number): number {
  const a = opacity <= def ? alpha * (opacity / def) : alpha + (1 - alpha) * ((opacity - def) / (100 - def))
  return Math.round(a * 1000) / 1000
}

const WHITE = '255, 255, 255'
const SAGE = '220, 229, 218'

/** CSS backgrounds of the plain and sage glass panels for a style at an opacity (%). */
export function panelBackgrounds(style: UiStyle, opacity: number): { glass: string; sage: string } {
  const a = (alpha: number) => scaleAlpha(alpha, opacity, PANEL_OPACITY_DEFAULT[style])
  if (style === 'blur') return { glass: `rgba(${WHITE}, ${a(0.58)})`, sage: `rgba(${SAGE}, ${a(0.62)})` }
  const sheen = (rgb: string, [s0, s1, s2]: number[]) =>
    `linear-gradient(135deg, rgba(${rgb}, ${a(s0)}), rgba(${rgb}, ${a(s1)}) 45%, rgba(${rgb}, ${a(s2)}))`
  return { glass: sheen(WHITE, [0.36, 0.1, 0.22]), sage: sheen(SAGE, [0.55, 0.2, 0.35]) }
}

export function applyPanelOpacity(style: UiStyle, opacity: number): void {
  const { glass, sage } = panelBackgrounds(style, opacity)
  const root = document.documentElement.style
  root.setProperty('--glass-bg', glass)
  root.setProperty('--glass-sage-bg', sage)
}
