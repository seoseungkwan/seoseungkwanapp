import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_IDS, type ThemeArt, type ThemeId, type ThemePick } from '@/types/forms'
import {
  autoTheme,
  BACKGROUND_FALLBACK_ACCENT,
  backgroundPick,
  contrastRatio,
  contrastWithWhite,
  isAccentHex,
  isLightAccent,
  isThemePick,
  lookOfPick,
  THEMES,
  themeHref,
  themeInUse,
  themeOf,
  withArt,
  withTheme,
} from './themes'

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

// ---------- 고른 그림 값 (specs/forms-themes REQ-4602, design.md 2절, TASK-3) ----------

const UUID = '0f8e7d6c-5b4a-4392-8170-a1b2c3d4e5f6'
const BG = `bg-${UUID}` as ThemePick
const SECOND_ART = THEME_IDS.map((id) => `${id}-2`)
const ALL_PICKS = [...THEME_IDS, ...SECOND_ART, 'auto-2', BG]
const childrenCards = cardsOf(['2027-05-05', '어린이날'])
const lookOf = (theme: ThemePick | null, month = 5, cards = childrenCards) => lookOfPick({ month, cards, theme })

describe('AC-4602.1: 고른 그림 값의 모양(isThemePick)', () => {
  it('AC-4602.1: 테마 열쇠 23개, <열쇠>-2 23개, auto-2, bg-<소문자 uuid>만 참이다', () => {
    expect(ALL_PICKS).toHaveLength(48)
    expect(new Set(ALL_PICKS).size).toBe(48)
    for (const value of ALL_PICKS) expect(isThemePick(value), value).toBe(true)
  })

  it('AC-4602.1: 다른 소문자 uuid도 bg-를 붙이면 참이다', () => {
    expect(isThemePick('bg-00000000-0000-0000-0000-000000000000')).toBe(true)
    expect(isThemePick('bg-ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true)
  })

  it.each([
    'auto',
    'auto-1',
    'auto-3',
    'm05-1',
    'm05-3',
    'm05-2-2',
    'm05-22',
    'm13',
    'M05',
    'nope',
    '',
    ' m05',
    'm05 ',
    'bg-xyz',
    'bg-',
    `bg-${UUID.toUpperCase()}`,
    `BG-${UUID}`,
    `bg-${UUID}0`,
    `bg-${UUID.slice(1)}`,
    `bg-${UUID.replace(/-/g, '')}`,
    `bg-${UUID}-2`,
    `bg-${UUID.replace('0f8e', '0g8e')}`,
    UUID,
  ])('AC-4602.1: "%s"는 거짓이다', (value) => {
    expect(isThemePick(value)).toBe(false)
  })

  it('AC-4602.1: 글자가 아닌 값(숫자·null·undefined·참거짓·객체·배열)은 거짓이다', () => {
    for (const value of [5, 0, Number.NaN, null, undefined, true, false, {}, [], ['m05'], { theme: 'm05' }]) {
      expect(isThemePick(value), String(value)).toBe(false)
    }
  })
})

describe('AC-4602.2: 고른 그림 값 풀기(lookOfPick·themeInUse)', () => {
  it('AC-4602.2: null → 저절로 고른 테마·그림 1', () => {
    expect(lookOf(null)).toEqual({ kind: 'theme', theme: 'children', art: 1 })
    expect(lookOf(null, 7, cardsOf(['2027-07-10', '학회']))).toEqual({ kind: 'theme', theme: 'm07', art: 1 })
  })

  it('AC-4602.2: auto-2 → 저절로 고른 테마·그림 2', () => {
    expect(lookOf('auto-2')).toEqual({ kind: 'theme', theme: 'children', art: 2 })
    expect(lookOf('auto-2', 7, cardsOf(['2027-07-10', '학회']))).toEqual({ kind: 'theme', theme: 'm07', art: 2 })
  })

  it.each([...THEME_IDS])('AC-4602.2: %s → 그 테마·그림 1이고, 뒤에 -2를 붙이면 그 테마·그림 2다(카드와 상관없이)', (id) => {
    expect(lookOf(id)).toEqual({ kind: 'theme', theme: id, art: 1 })
    expect(lookOf(`${id}-2`)).toEqual({ kind: 'theme', theme: id, art: 2 })
  })

  it('AC-4602.2: bg-<id> → 내 배경 id(앞의 bg-를 뗀 uuid)', () => {
    expect(lookOf(BG)).toEqual({ kind: 'background', id: UUID })
  })

  it('AC-4602.2: themeInUse는 내 배경이면 저절로 테마를, 아니면 그 테마 열쇠를 돌려준다', () => {
    expect(themeInUse({ month: 5, cards: childrenCards, theme: BG })).toBe('children')
    expect(themeInUse({ month: 7, cards: cardsOf(['2027-07-10', '학회']), theme: BG })).toBe('m07')
    expect(themeInUse({ month: 5, cards: childrenCards, theme: 'auto-2' })).toBe('children')
    expect(themeInUse({ month: 5, cards: childrenCards, theme: 'm05-2' })).toBe('m05')
    expect(themeInUse({ month: 5, cards: childrenCards, theme: 'christmas' })).toBe('christmas')
    expect(themeInUse({ month: 5, cards: childrenCards, theme: null })).toBe('children')
  })

  it('AC-4602.2: themeHref는 풀린 테마·그림 번호의 그림 주소다(그림 1은 지금 주소 그대로)', () => {
    expect(themeHref('m05')).toBe('/poster/themes/m05.svg')
    expect(themeHref('m05', 1)).toBe('/poster/themes/m05.svg')
    expect(themeHref('m05', 2)).toBe('/poster/themes/m05-2.svg')
    for (const id of THEME_IDS) {
      expect(themeHref(id, 1)).toBe(`/poster/themes/${id}.svg`)
      expect(themeHref(id, 2)).toBe(`/poster/themes/${id}-2.svg`)
    }
  })
})

describe('AC-4602.3: 그림 번호·테마 바꾸기(withArt·withTheme)', () => {
  it.each<[ThemePick | null, ThemeArt, ThemePick | null]>([
    [null, 1, null],
    [null, 2, 'auto-2'],
    ['auto-2', 1, null],
    ['auto-2', 2, 'auto-2'],
    ['m05', 1, 'm05'],
    ['m05', 2, 'm05-2'],
    ['m05-2', 1, 'm05'],
    ['m05-2', 2, 'm05-2'],
    ['christmas', 2, 'christmas-2'],
    ['christmas-2', 1, 'christmas'],
  ])('AC-4602.3: withArt(%s, %s) → %s (테마는 그대로 그림만 바뀐다)', (pick, art, expected) => {
    expect(withArt(pick, art)).toBe(expected)
  })

  it('AC-4602.3: 내 배경 값은 withArt로 바뀌지 않는다', () => {
    expect(withArt(BG, 1)).toBe(BG)
    expect(withArt(BG, 2)).toBe(BG)
  })

  it.each<[ThemePick | null, ThemeId | null, ThemePick | null]>([
    [null, 'm06', 'm06'],
    [null, null, null],
    ['auto-2', 'm06', 'm06-2'],
    ['auto-2', null, 'auto-2'],
    ['m05', 'm06', 'm06'],
    ['m05', null, null],
    ['m05-2', 'm06', 'm06-2'],
    ['m05-2', null, 'auto-2'],
    ['m05-2', 'chuseok', 'chuseok-2'],
    ['chuseok-2', 'm05', 'm05-2'],
  ])('AC-4602.3: withTheme(%s, %s) → %s (그림 번호는 그대로 테마만 바뀐다)', (pick, theme, expected) => {
    expect(withTheme(pick, theme)).toBe(expected)
  })

  it('AC-4602.3: 내 배경 값에서 테마를 고르면 그림 1이다(저절로 고르면 null)', () => {
    expect(withTheme(BG, 'm06')).toBe('m06')
    expect(withTheme(BG, 'christmas')).toBe('christmas')
    expect(withTheme(BG, null)).toBeNull()
  })

  it.each([...THEME_IDS])('AC-4602.3: %s에서 그림 번호와 테마를 차례로 바꿔도 서로를 지키고, 풀면 맞는 그림이다', (id) => {
    const second = withArt(withTheme(null, id), 2)
    expect(second).toBe(`${id}-2`)
    expect(isThemePick(second)).toBe(true)
    expect(lookOf(second)).toEqual({ kind: 'theme', theme: id, art: 2 })
    expect(withTheme(second, null)).toBe('auto-2')
    expect(withArt(second, 1)).toBe(id)
  })

  it('AC-4602.3: backgroundPick(id)는 bg-<id>이고, 고른 그림 값으로 참이며 풀면 그 id다', () => {
    expect(backgroundPick(UUID)).toBe(BG)
    expect(isThemePick(backgroundPick(UUID))).toBe(true)
    expect(lookOf(backgroundPick(UUID))).toEqual({ kind: 'background', id: UUID })
  })
})

describe('AC-4605.2·AC-4605.3: 명암비와 대신 강조색(themes.ts)', () => {
  it('AC-4605.2: contrastRatio는 WCAG 명암비 — 흰색·검정 21, 같은 색 1, 차례와 상관없다', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#2f4a7a', '#2f4a7a')).toBeCloseTo(1, 5)
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it.each(THEMES.map((t) => [t.id, t.accent] as const))('AC-4605.2: contrastRatio(%s 강조색, 흰색)는 contrastWithWhite와 같다', (_, accent) => {
    expect(contrastRatio(accent, '#ffffff')).toBeCloseTo(contrastWithWhite(accent), 10)
    expect(contrastRatio('#ffffff', accent)).toBeCloseTo(contrastWithWhite(accent), 10)
  })

  it('AC-4605.3: BACKGROUND_FALLBACK_ACCENT는 #+소문자 16진수 6자리이고 흰색과 4.5 이상이다', () => {
    expect(BACKGROUND_FALLBACK_ACCENT).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastRatio(BACKGROUND_FALLBACK_ACCENT, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------- 글자 색 (specs/forms-accent REQ-4702·REQ-4703, design.md 2절, TASK-2) ----------

describe('AC-4702.3·AC-4703.3: 글자 색 모양(isAccentHex)', () => {
  it('AC-4702.3: # + 소문자 16진수 6자리만 참이다(테마 강조색 23개·대신 강조색 포함)', () => {
    for (const ok of ['#000000', '#ffffff', '#c62f2f', '#0a1b2c', '#ffff00', ...THEMES.map((t) => t.accent), BACKGROUND_FALLBACK_ACCENT]) {
      expect(isAccentHex(ok), ok).toBe(true)
    }
  })

  it('AC-4702.3: 대문자·3자리·8자리·# 없음·색 이름·앞뒤 공백·줄바꿈·16진수 아닌 글자는 거짓이다', () => {
    for (const bad of ['#C62F2F', '#c62F2f', '#abc', '#c62f', '#c62f2', '#c62f2f0', '#c62f2f00', 'c62f2f', '##c62f2f', 'red', '', ' #c62f2f', '#c62f2f ', '#c62f2f\n', '#gggggg']) {
      expect(isAccentHex(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('AC-4703.3: 글이 아닌 값(null·undefined·숫자·배열·객체·참거짓)은 거짓이다', () => {
    for (const bad of [null, undefined, 0xc62f2f, ['#c62f2f'], { accent: '#c62f2f' }, true]) {
      expect(isAccentHex(bad), String(bad)).toBe(false)
    }
  })
})

describe('AC-4701.4: 옅은 글자 색(isLightAccent, 흰색과 4.5 미만)', () => {
  it('AC-4701.4: 흰색과 명암비 4.5 미만이면 참, 4.5 이상이면 거짓이다(경계 #777777 4.48 · #767676 4.54)', () => {
    for (const light of ['#ffffff', '#ffff00', '#f9d71c', '#777777', '#ff0000']) expect(isLightAccent(light), light).toBe(true)
    for (const dark of ['#767676', '#000000', '#c62f2f', BACKGROUND_FALLBACK_ACCENT]) expect(isLightAccent(dark), dark).toBe(false)
  })

  it.each(THEMES.map((t) => [t.id, t.accent] as const))('AC-4701.4: %s 강조색도 contrastRatio(색, 흰색) < 4.5와 같은 답이다', (_, accent) => {
    expect(isLightAccent(accent)).toBe(contrastRatio(accent, '#ffffff') < 4.5)
  })
})
