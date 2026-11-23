import { describe, expect, it } from 'vitest'
import { readPrefs } from '../src/data/preferences'
import { translate } from '../src/lib/i18n'

describe('screen language', () => {
  it('English by default, Korean on request', () => {
    expect(readPrefs({}).language).toBe('en')
    expect(readPrefs({ language: 'ko' }).language).toBe('ko')
    expect(readPrefs({ language: 'fr' }).language).toBe('en')
  })

  it('translates the Daily Log labels the way they were asked for', () => {
    expect(['30-min Log', 'Time', 'Category', 'Sub Category', 'Content'].map((k) => translate('ko', k as never))).toEqual(['30분 간격 기록', '시간', '대분류', '업무분류', '업무내용'])
    expect(translate('ko', 'Daily Log')).toBe('일일 기록')
    expect(translate('en', 'Daily Log')).toBe('Daily Log')
  })
})
