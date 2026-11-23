// Body font choice (Settings → 화면 스타일 → 글꼴). Titles keep Bricolage Grotesque for Latin
// letters and use the chosen font for Hangul; times stay JetBrains Mono. Font files are bundled
// with the app and only downloaded when a font is chosen (or previewed in Settings).

export type FontChoice = 'pretendard' | 'plex' | 'gowun' | 'myeongjo'

export const FONT_CHOICES: { value: FontChoice; label: string; desc: string; family: string }[] = [
  { value: 'pretendard', label: 'Pretendard', desc: '깔끔한 고딕 (기본)', family: '"Pretendard Variable", Pretendard, sans-serif' },
  { value: 'plex', label: 'IBM Plex Sans KR', desc: '단정한 업무용 고딕', family: '"IBM Plex Sans KR", sans-serif' },
  { value: 'gowun', label: '고운돋움', desc: '둥글고 부드러운 느낌', family: '"Gowun Dodum", sans-serif' },
  { value: 'myeongjo', label: '나눔명조', desc: '차분한 명조(세리프)', family: '"Nanum Myeongjo", serif' },
]

export const isFontChoice = (v: unknown): v is FontChoice => FONT_CHOICES.some((f) => f.value === v)

const loaders: Partial<Record<FontChoice, () => Promise<unknown>>> = {
  plex: () =>
    Promise.all([import('@fontsource/ibm-plex-sans-kr/400.css'), import('@fontsource/ibm-plex-sans-kr/600.css'), import('@fontsource/ibm-plex-sans-kr/700.css')]),
  gowun: () => import('@fontsource/gowun-dodum/400.css'),
  myeongjo: () => Promise.all([import('@fontsource/nanum-myeongjo/400.css'), import('@fontsource/nanum-myeongjo/700.css')]),
}

/** Make a font's files available (Pretendard is always loaded). */
export function loadFont(font: FontChoice): Promise<unknown> {
  return loaders[font]?.() ?? Promise.resolve()
}

/** Switch the page's body font (see :root[data-font] in styles.css). */
export function applyFont(font: FontChoice): void {
  document.documentElement.dataset.font = font
  void loadFont(font)
}
