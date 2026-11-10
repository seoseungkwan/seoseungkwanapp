import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_IDS, type ThemeId } from '@/types/forms'
import { autoTheme, contrastWithWhite, THEMES, themeInUse, themeOf } from './themes'

// 서식 탭 휴진 안내의 테마 23개와 저절로 고르기 (specs/forms REQ-3504, design.md 4절, TASK-2)

const HOLIDAYS = ['신정', '설날', '삼일절', '어린이날', '부처님오신날', '현충일', '광복절', '추석', '개천절', '한글날', '성탄절']

// 승인된 테마 시안의 열쇠·이름·강조색(docs/mockups/forms/themes.html)
function approvedThemes(): Array<{ id: string; name: string; accent: string }> {
  const html = readFileSync(join(process.cwd(), 'docs/mockups/forms/themes.html'), 'utf8')
  return [...html.matchAll(/\{ id: '([a-z0-9]+)',\s*name: '([^']+)',\s*accent: '(#[0-9a-f]{6})'/g)].map(([, id, name, accent]) => ({ id, name, accent }))
}

const cardsOf = (...items: Array<[string, string]>) => items.map(([start, name]) => ({ start, end: null, name, status: '휴진' }))
const pick = (month: number, ...items: Array<[string, string]>) => autoTheme({ month, cards: cardsOf(...items) })

describe('AC-3504.1: 테마 목록', () => {
  it('AC-3504.1: 공휴일 11개 뒤 달 12개, 모두 23개이고 열쇠는 겹치지 않는다', () => {
    expect(THEMES).toHaveLength(23)
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS])
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(23)
    expect(THEMES.slice(0, 11).map((t) => t.name)).toEqual(HOLIDAYS)
    expect(THEMES.slice(0, 11).every((t) => t.kind === 'holiday' && t.month === null && t.words.length > 0)).toBe(true)
    expect(THEMES.slice(11).map((t) => t.name)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}월`))
    expect(THEMES.slice(11).map((t) => t.month)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(THEMES.slice(11).every((t) => t.kind === 'month' && t.words.length === 0)).toBe(true)
  })

  it('AC-3504.1: 열쇠·이름·강조색은 승인된 테마 시안(themes.html)과 같다', () => {
    const approved = approvedThemes()
    expect(approved).toHaveLength(23)
    expect(THEMES.map(({ id, name, accent }) => ({ id, name, accent }))).toEqual(approved)
  })

  it('AC-3504.1: themeOf는 열쇠로 테마를 찾는다', () => {
    expect(themeOf('children').name).toBe('어린이날')
    expect(themeOf('m07')).toMatchObject({ name: '7월', kind: 'month', month: 7 })
  })
})

describe('AC-3504.4: 강조색과 흰 글자', () => {
  it('AC-3504.4: contrastWithWhite는 WCAG 명암비', () => {
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 5)
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 5)
    expect(contrastWithWhite('#767676')).toBeCloseTo(4.54, 2)
  })

  it.each(THEMES.map((t) => [t.id, t.accent] as const))('AC-3504.4: %s 강조색 %s는 흰 글자와 3:1 이상', (_, accent) => {
    expect(accent).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastWithWhite(accent)).toBeGreaterThanOrEqual(3)
  })
})

describe('AC-3504.2: 테마 저절로 고르기', () => {
  it('AC-3504.2: 광복절 + 대체공휴일 → 광복절(차례가 바뀌어도)', () => {
    expect(pick(8, ['2026-08-15', '광복절'], ['2026-08-17', '대체공휴일'])).toBe('liberation')
    expect(pick(8, ['2026-08-14', '대체공휴일'], ['2026-08-15', '광복절'])).toBe('liberation')
  })

  it('AC-3504.2: 공휴일 낱말이 없으면 안내 달의 달 테마', () => {
    expect(pick(7, ['2027-07-10', '학회'])).toBe('m07')
    expect(pick(12, ['2026-12-31', '연말'])).toBe('m12')
    expect(pick(3, ['2027-03-03', '임시공휴일'], ['2027-03-04', '선거일'])).toBe('m03')
  })

  it('AC-3504.2: 설 낱말 — 설 연휴·설·구정은 설날, 설명회는 아니다', () => {
    expect(pick(2, ['2026-02-16', '설 연휴'])).toBe('seollal')
    expect(pick(2, ['2026-02-17', '설'])).toBe('seollal')
    expect(pick(2, ['2026-02-17', '구정'])).toBe('seollal')
    expect(pick(2, ['2026-02-17', '설 명절'])).toBe('seollal')
    expect(pick(4, ['2027-04-10', '설명회'])).toBe('m04')
  })

  it.each<[ThemeId, string]>([
    ['newyear', '새해'],
    ['newyear', '양력설'],
    ['samiljeol', '3·1절'],
    ['samiljeol', '3.1절'],
    ['children', '어린이 날'],
    ['buddha', '석가탄신일'],
    ['buddha', '초파일'],
    ['memorial', '현충일'],
    ['chuseok', '한가위'],
    ['chuseok', '추석 연휴'],
    ['foundation', '개천절'],
    ['hangul', '한글날'],
    ['christmas', '크리스마스'],
    ['christmas', 'Merry 크리스마스'],
    ['christmas', '성탄'],
  ])('AC-3504.2: %s ← "%s"', (theme, name) => {
    expect(pick(1, ['2027-01-20', name])).toBe(theme)
  })

  it('AC-3504.2: 시작 날짜 차례로 처음 찾은 공휴일', () => {
    expect(pick(5, ['2027-05-13', '부처님오신날'], ['2027-05-05', '어린이날'])).toBe('children')
  })

  it('AC-3504.2: themeInUse는 고른 테마가 있으면 그것, 없으면 저절로', () => {
    const cards = cardsOf(['2027-05-05', '어린이날'])
    expect(themeInUse({ month: 5, cards, theme: null })).toBe('children')
    expect(themeInUse({ month: 5, cards, theme: 'm05' })).toBe('m05')
  })
})
