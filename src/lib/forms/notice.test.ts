import { describe, expect, it } from 'vitest'
import { MAX_CARDS, MAX_NAME, MAX_STATUS, THEME_IDS, type ClosureNotice, type DraftCard, type NoticeCard } from '@/types/forms'
import {
  checkCard,
  checkNotice,
  dateLabel,
  fileNameOf,
  noticeMonthOf,
  noticeTitle,
  resolveEnd,
  resolveYear,
  sortCards,
} from './notice'

// 서식 탭 휴진 안내의 안내 내용 규칙 (specs/forms REQ-3503·3506·3507, design.md 2·3절, TASK-1)

const draft = (over: Partial<DraftCard> = {}): DraftCard => ({ start: '2027-05-05', end: '', name: '어린이날', status: '휴진', ...over })
const card = (over: Partial<NoticeCard> = {}): NoticeCard => ({ start: '2027-05-05', end: null, name: '어린이날', status: '휴진', ...over })
const notice = (over: Record<string, unknown> = {}) => ({ year: 2027, month: 5, cards: [card()], theme: null, ...over })
const errorKeys = (result: ReturnType<typeof checkCard>) => ('errors' in result ? Object.keys(result.errors).sort() : [])

describe('AC-3503.3: 날짜 글은 요일을 붙여 만든다', () => {
  it('AC-3503.3: 하루는 "5월 5일(수)"', () => {
    expect(dateLabel(card({ start: '2027-05-05' }))).toBe('5월 5일(수)')
  })

  it('AC-3503.3: 같은 달 이어진 날은 "10월 3일(토)~5일(월)"', () => {
    expect(dateLabel(card({ start: '2026-10-03', end: '2026-10-05' }))).toBe('10월 3일(토)~5일(월)')
  })

  it('AC-3503.3: 다른 달로 넘어가면 "1월 31일(일)~2월 2일(화)"', () => {
    expect(dateLabel(card({ start: '2027-01-31', end: '2027-02-02' }))).toBe('1월 31일(일)~2월 2일(화)')
  })

  it('AC-3503.3: 요일은 일~토를 모두 맞게 쓴다(2026-11-08 일요일부터 이레)', () => {
    const labels = ['08', '09', '10', '11', '12', '13', '14'].map((d) => dateLabel(card({ start: `2026-11-${d}` })))
    expect(labels).toEqual(['11월 8일(일)', '11월 9일(월)', '11월 10일(화)', '11월 11일(수)', '11월 12일(목)', '11월 13일(금)', '11월 14일(토)'])
  })

  it('AC-3503.3: 해를 넘는 범위도 다른 달처럼 쓴다', () => {
    expect(dateLabel(card({ start: '2026-12-31', end: '2027-01-01' }))).toBe('12월 31일(목)~1월 1일(금)')
  })
})

describe('AC-3503.4: 카드 칸 검사', () => {
  it('AC-3503.4: 맞는 칸은 앞뒤 공백을 뗀 카드가 되고, 빈 끝 날짜는 null', () => {
    expect(checkCard(draft({ name: ' 어린이날 ', status: ' 휴진 ' }))).toEqual({ card: card() })
  })

  it('AC-3503.4: 시작 날짜는 있는 날짜여야 한다', () => {
    expect(errorKeys(checkCard(draft({ start: '' })))).toEqual(['start'])
    expect(errorKeys(checkCard(draft({ start: '2027-02-30' })))).toEqual(['start'])
    expect(errorKeys(checkCard(draft({ start: '5/5' })))).toEqual(['start'])
  })

  it('AC-3503.4: 끝 날짜는 시작보다 뒤이고 시작부터 31일 안', () => {
    expect(checkCard(draft({ start: '2026-10-03', end: '2026-10-05' }))).toEqual({ card: card({ start: '2026-10-03', end: '2026-10-05' }) })
    expect(checkCard(draft({ start: '2027-01-01', end: '2027-01-31' }))).toEqual({ card: card({ start: '2027-01-01', end: '2027-01-31' }) })
    expect(errorKeys(checkCard(draft({ start: '2027-01-01', end: '2027-02-01' })))).toEqual(['end'])
    expect(errorKeys(checkCard(draft({ start: '2027-05-05', end: '2027-05-05' })))).toEqual(['end'])
    expect(errorKeys(checkCard(draft({ start: '2027-05-05', end: '2027-05-04' })))).toEqual(['end'])
    expect(errorKeys(checkCard(draft({ end: '2027-13-01' })))).toEqual(['end'])
  })

  it('AC-3503.4: 시작 날짜가 틀리면 끝 날짜는 모양만 본다', () => {
    expect(errorKeys(checkCard(draft({ start: '', end: '2027-05-06' })))).toEqual(['start'])
    expect(errorKeys(checkCard(draft({ start: '', end: 'x' })))).toEqual(['end', 'start'])
  })

  it(`AC-3503.4: 이름은 1~${MAX_NAME}자`, () => {
    expect(errorKeys(checkCard(draft({ name: '' })))).toEqual(['name'])
    expect(errorKeys(checkCard(draft({ name: '   ' })))).toEqual(['name'])
    expect(checkCard(draft({ name: '가나다라마바사아자차' }))).toEqual({ card: card({ name: '가나다라마바사아자차' }) })
    expect(errorKeys(checkCard(draft({ name: '가나다라마바사아자차카' })))).toEqual(['name'])
  })

  it(`AC-3503.4: 아래 글은 1~${MAX_STATUS}자이고 '휴진' 말고도 쓸 수 있다`, () => {
    expect(errorKeys(checkCard(draft({ status: '' })))).toEqual(['status'])
    expect(checkCard(draft({ status: '13시까지' }))).toEqual({ card: card({ status: '13시까지' }) })
    expect(checkCard(draft({ status: '오전진료만해' }))).toEqual({ card: card({ status: '오전진료만해' }) })
    expect(errorKeys(checkCard(draft({ status: '오전만진료합니다' })))).toEqual(['status'])
  })

  it('AC-3503.4: 이름·아래 글에 제어 문자가 있으면 안 된다', () => {
    expect(errorKeys(checkCard(draft({ name: '어린이\u0007날' })))).toEqual(['name'])
    expect(errorKeys(checkCard(draft({ status: '휴\n진' })))).toEqual(['status'])
  })

  it('AC-3503.4: 이름·아래 글에 전화·주민번호(붙여 쓴 13자리 포함)·메일 모양이 있으면 안 된다', () => {
    expect(errorKeys(checkCard(draft({ name: '010-1234-5678' })))).toEqual(['name'])
    expect(errorKeys(checkCard(draft({ name: '01012345678' })))).toEqual(['name'])
    expect(errorKeys(checkCard(draft({ name: '9001011234567' })))).toEqual(['name'])
    expect(errorKeys(checkCard(draft({ status: 'a@b.kr' })))).toEqual(['status'])
  })

  it('AC-3503.4: 어긋난 칸마다 까닭 글이 있다', () => {
    const result = checkCard(draft({ start: '', name: '', status: '' }))
    expect(errorKeys(result)).toEqual(['name', 'start', 'status'])
    if ('errors' in result) for (const message of Object.values(result.errors)) expect(message).toMatch(/\S/)
  })
})

describe('AC-3507.6: 서버에서 읽은 줄·저장 직전 값 검사(checkNotice)', () => {
  it('AC-3507.6: 맞는 값은 새 객체로 그대로 돌려준다', () => {
    const value = notice({ cards: [card({ start: '2026-10-03', end: '2026-10-05', name: '추석', status: '휴진' }), card()], theme: 'chuseok' })
    const checked = checkNotice(value)
    expect(checked).toEqual(value)
    expect(checked).not.toBe(value)
    expect(checked?.cards[0]).not.toBe(value.cards[0])
  })

  it('AC-3507.6: theme은 null 또는 23개 열쇠 중 하나', () => {
    for (const theme of THEME_IDS) expect(checkNotice(notice({ theme }))?.theme).toBe(theme)
    expect(checkNotice(notice({ theme: 'nope' }))).toBeNull()
    expect(checkNotice(notice({ theme: '' }))).toBeNull()
  })

  it('AC-3507.6: 열쇠가 정확히 맞아야 한다', () => {
    const without = (o: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))
    expect(checkNotice(without(notice(), 'theme'))).toBeNull()
    expect(checkNotice(notice({ id: 'x' }))).toBeNull()
    expect(checkNotice(notice({ cards: [{ ...card(), memo: '메모' }] }))).toBeNull()
    expect(checkNotice(notice({ cards: [without(card(), 'end')] }))).toBeNull()
  })

  it(`AC-3507.6: 카드는 1~${MAX_CARDS}장`, () => {
    expect(checkNotice(notice({ cards: [] }))).toBeNull()
    expect(checkNotice(notice({ cards: Array.from({ length: MAX_CARDS }, () => card()) }))).not.toBeNull()
    expect(checkNotice(notice({ cards: Array.from({ length: MAX_CARDS + 1 }, () => card()) }))).toBeNull()
    expect(checkNotice(notice({ cards: 'x' }))).toBeNull()
  })

  it('AC-3507.6: 카드마다 카드 검사를 넘어야 하고, 고쳐 쓰지 않는다', () => {
    expect(checkNotice(notice({ cards: [card({ name: ' 어린이날' })] }))).toBeNull()
    expect(checkNotice(notice({ cards: [card({ end: '' as unknown as null })] }))).toBeNull()
    expect(checkNotice(notice({ cards: [card({ end: '2027-05-04' })] }))).toBeNull()
    expect(checkNotice(notice({ cards: [card({ name: '010-1234-5678' })] }))).toBeNull()
    expect(checkNotice(notice({ cards: [card({ start: 20270505 as unknown as string })] }))).toBeNull()
    expect(checkNotice(notice({ cards: [null] }))).toBeNull()
  })

  it('AC-3507.6: 연도는 2020~2100, 달은 1~12의 정수', () => {
    expect(checkNotice(notice({ year: 2019 }))).toBeNull()
    expect(checkNotice(notice({ year: 2101 }))).toBeNull()
    expect(checkNotice(notice({ year: '2027' }))).toBeNull()
    expect(checkNotice(notice({ month: 0 }))).toBeNull()
    expect(checkNotice(notice({ month: 13 }))).toBeNull()
    expect(checkNotice(notice({ month: 1.5 }))).toBeNull()
    expect(checkNotice(notice({ year: 2020, month: 1 }))).not.toBeNull()
    expect(checkNotice(notice({ year: 2100, month: 12 }))).not.toBeNull()
  })

  it('AC-3507.6: 객체가 아니면 null', () => {
    for (const value of [null, undefined, 'x', 1, [], [notice()]]) expect(checkNotice(value)).toBeNull()
  })
})

// ---------- 고른 그림 값 (specs/forms-themes REQ-4602 AC-4602.4, design.md 2절, TASK-3) ----------

describe('AC-4602.4: checkNotice는 theme이 null이거나 고른 그림 값(isThemePick)일 때만 받는다', () => {
  const UUID = '0f8e7d6c-5b4a-4392-8170-a1b2c3d4e5f6'

  it('AC-4602.4: 지금 저장된 값(null·테마 열쇠 23개)은 그대로 통과한다', () => {
    expect(checkNotice(notice({ theme: null }))?.theme).toBeNull()
    expect(THEME_IDS).toHaveLength(23)
    for (const theme of THEME_IDS) expect(checkNotice(notice({ theme })), theme).toEqual(notice({ theme }))
  })

  it('AC-4602.4: 그림 2(<열쇠>-2 23개·auto-2)와 내 배경(bg-<소문자 uuid>)도 받는다', () => {
    for (const theme of [...THEME_IDS.map((id) => `${id}-2`), 'auto-2', `bg-${UUID}`]) {
      expect(checkNotice(notice({ theme }))?.theme, theme).toBe(theme)
    }
  })

  it('AC-4602.4: 고른 그림 값이 아니면 받지 않는다(bg- 대문자 uuid 포함)', () => {
    for (const theme of [`bg-${UUID.toUpperCase()}`, `BG-${UUID}`, 'bg-xyz', 'auto', 'm05-3', 'M05', '', 5, true, {}, ['m05']]) {
      expect(checkNotice(notice({ theme })), String(theme)).toBeNull()
    }
  })
})

// ---------- 글자 색 (specs/forms-accent REQ-4703 AC-4703.1·AC-4703.3, design.md 3절, TASK-2) ----------

describe('AC-4703.1·AC-4703.3: checkNotice의 글자 색(accent) 열쇠', () => {
  const NOTICE_KEYS = ['cards', 'month', 'theme', 'year']

  it('AC-4703.3: accent 열쇠가 없으면 지금처럼 받고, 돌려준 값에도 accent 열쇠가 없다', () => {
    const checked = checkNotice(notice({ theme: 'children' }))
    expect(checked).toEqual(notice({ theme: 'children' }))
    expect(Object.keys(checked ?? {}).sort()).toEqual(NOTICE_KEYS)
  })

  it('AC-4703.3: accent가 null이면 자동 — 받되, 돌려준 값에는 accent 열쇠를 넣지 않는다', () => {
    const checked = checkNotice(notice({ theme: 'children', accent: null }))
    expect(checked).toEqual(notice({ theme: 'children' }))
    expect(Object.keys(checked ?? {}).sort()).toEqual(NOTICE_KEYS)
  })

  it('AC-4703.1: accent가 # + 소문자 16진수 6자리면 그 값을 담은 새 객체를 돌려준다(옅은 색도 받는다)', () => {
    for (const accent of ['#c62f2f', '#000000', '#ffffff', '#ffff00', '#2f4a7a']) {
      const value = notice({ theme: 'christmas', accent })
      const checked = checkNotice(value)
      expect(checked, accent).toEqual(value)
      expect(checked, accent).not.toBe(value)
      expect(checked?.accent, accent).toBe(accent)
      expect(Object.keys(checked ?? {}).sort(), accent).toEqual(['accent', ...NOTICE_KEYS])
    }
  })

  it('AC-4703.1: 테마 저절로(null)·그림 2·내 배경 값과 함께여도 글자 색을 받는다', () => {
    for (const theme of [null, 'auto-2', 'm05-2', 'bg-0f8e7d6c-5b4a-4392-8170-a1b2c3d4e5f6']) {
      expect(checkNotice(notice({ theme, accent: '#c62f2f' })), String(theme)).toEqual(notice({ theme, accent: '#c62f2f' }))
    }
  })

  it('AC-4703.3: accent 모양이 틀리면 null(대문자·3자리·8자리·# 없음·색 이름·빈 글·undefined·글이 아닌 값)', () => {
    for (const accent of ['#C62F2F', '#c62F2f', '#abc', '#c62f2f00', 'c62f2f', 'red', '', ' #c62f2f', undefined, 0xc62f2f, true, {}, ['#c62f2f']]) {
      expect(checkNotice(notice({ accent })), `accent ${String(accent)}`).toBeNull()
    }
  })

  it('AC-4703.3: 열쇠는 넷 또는 accent를 더한 다섯뿐 — 여섯이거나 accent 대신 다른 열쇠·theme 대신 accent면 null', () => {
    const without = (o: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))
    expect(checkNotice(notice({ accent: '#c62f2f', id: 'x' }))).toBeNull()
    expect(checkNotice(notice({ accent: null, memo: '메모' }))).toBeNull()
    expect(checkNotice(notice({ color: '#c62f2f' }))).toBeNull()
    expect(checkNotice(without(notice({ accent: '#c62f2f' }), 'theme'))).toBeNull()
    expect(checkNotice(without(notice({ accent: null }), 'cards'))).toBeNull()
  })

  it('AC-4703.3: accent가 맞아도 다른 칸 규칙(연도·달·테마·카드)은 그대로 본다', () => {
    const accent = '#c62f2f'
    expect(checkNotice(notice({ accent, year: 2019 }))).toBeNull()
    expect(checkNotice(notice({ accent, month: 13 }))).toBeNull()
    expect(checkNotice(notice({ accent, theme: 'nope' }))).toBeNull()
    expect(checkNotice(notice({ accent, cards: [] }))).toBeNull()
    expect(checkNotice(notice({ accent, cards: [card({ status: 'a@b.kr' })] }))).toBeNull()
  })
})

// ---------- 글씨·로고 값 (spec form-style REQ-6806 AC-6806.3, design.md 2절, TASK-3) ----------

describe('AC-6806.3: checkNotice의 글씨·로고 값(style) 열쇠', () => {
  const NOTICE_KEYS = ['cards', 'month', 'theme', 'year']
  const DEFAULT = { titleScale: 100, bodyScale: 100, logoScale: 100, titleColor: null, bodyColor: null, logoColor: null }
  const STYLE = { titleScale: 115, bodyScale: 90, logoScale: 150, titleColor: '#dc2626', bodyColor: null, logoColor: '#ffffff' }

  it('AC-6806.3: style 열쇠가 없는 옛 값은 지금처럼 받고, 돌려준 값에도 style 열쇠가 없다', () => {
    const checked = checkNotice(notice({ theme: 'children' }))
    expect(checked).toEqual(notice({ theme: 'children' }))
    expect(Object.keys(checked ?? {}).sort()).toEqual(NOTICE_KEYS)
    expect(Object.keys(checkNotice(notice({ accent: '#c62f2f' })) ?? {}).sort()).toEqual(['accent', ...NOTICE_KEYS])
  })

  it('AC-6806.3: 처음대로인 style은 받되, 돌려준 값에는 style 열쇠를 넣지 않는다', () => {
    const checked = checkNotice(notice({ theme: 'children', style: { ...DEFAULT } }))
    expect(checked).toEqual(notice({ theme: 'children' }))
    expect(Object.keys(checked ?? {}).sort()).toEqual(NOTICE_KEYS)
    const withAccent = checkNotice(notice({ accent: null, style: { ...DEFAULT } }))
    expect(Object.keys(withAccent ?? {}).sort()).toEqual(NOTICE_KEYS)
  })

  it('AC-6806.3: 바꾼 style은 그 값을 담은 새 객체로 돌려준다(글자 색 accent와 함께여도)', () => {
    const input = { ...STYLE }
    const value = notice({ theme: 'christmas', style: input })
    const checked = checkNotice(value)
    expect(checked).toEqual(value)
    expect(checked?.style).toEqual(STYLE)
    expect(checked?.style).not.toBe(input)
    expect(Object.keys(checked ?? {}).sort()).toEqual([...NOTICE_KEYS, 'style'].sort())

    const both = notice({ accent: '#c62f2f', style: { ...STYLE } })
    expect(checkNotice(both)).toEqual(both)
    expect(Object.keys(checkNotice(both) ?? {}).sort()).toEqual(['accent', ...NOTICE_KEYS, 'style'].sort())
    // accent가 null(자동)이면 accent 열쇠만 빠진다
    expect(checkNotice(notice({ accent: null, style: { ...STYLE } }))).toEqual(notice({ style: STYLE }))
  })

  it('AC-6806.3: 크기 하나·색 하나만 바꿔도 바꾼 것으로 본다', () => {
    for (const over of [{ titleScale: 80 }, { bodyScale: 130 }, { logoScale: 60 }, { titleColor: '#111111' }, { bodyColor: '#ffffff' }, { logoColor: '#7c3aed' }]) {
      const style = { ...DEFAULT, ...over }
      expect(checkNotice(notice({ style }))?.style, JSON.stringify(over)).toEqual(style)
    }
  })

  it('AC-6806.3: 틀린 style이면 null — 범위 밖·5의 배수 아님·색 모양 틀림·null·객체 아님', () => {
    for (const bad of [
      { ...DEFAULT, titleScale: 79 },
      { ...DEFAULT, bodyScale: 131 },
      { ...DEFAULT, titleScale: 82 },
      { ...DEFAULT, logoScale: 55 },
      { ...DEFAULT, logoScale: 155 },
      { ...DEFAULT, logoScale: 83 },
      { ...DEFAULT, titleColor: '#DC2626' },
      { ...DEFAULT, bodyColor: 'red' },
      { ...DEFAULT, logoColor: '#fff' },
      null,
      undefined,
      'style',
      [],
    ]) {
      expect(checkNotice(notice({ style: bad })), String(JSON.stringify(bad))).toBeNull()
    }
  })

  it('AC-6806.3: style 열쇠는 정확히 여섯 — 하나 빠지거나 하나 더 있으면 null', () => {
    const five = Object.fromEntries(Object.entries(DEFAULT).filter(([key]) => key !== 'logoColor'))
    expect(checkNotice(notice({ style: five }))).toBeNull()
    expect(checkNotice(notice({ style: { ...DEFAULT, accent: null } }))).toBeNull()
  })

  it('AC-6806.3: style을 더해도 다른 열쇠·칸 규칙은 그대로 본다', () => {
    expect(checkNotice(notice({ style: STYLE, id: 'x' }))).toBeNull()
    expect(checkNotice(notice({ accent: '#c62f2f', style: STYLE, memo: '메모' }))).toBeNull()
    expect(checkNotice(notice({ style: STYLE, accent: '#C62F2F' }))).toBeNull()
    expect(checkNotice(notice({ style: STYLE, year: 2019 }))).toBeNull()
    expect(checkNotice(notice({ style: STYLE, cards: [] }))).toBeNull()
    const without = (o: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))
    expect(checkNotice(without(notice({ style: STYLE }), 'theme'))).toBeNull()
  })
})

describe('AC-3509.4: 연도 정하기(글에 연도가 없을 때, 오늘 2026-11-10)', () => {
  const today = '2026-11-10'

  it('AC-3509.4: 30일 넘게 지난 날은 다음 해, 아니면 올해', () => {
    expect(resolveYear(5, 5, today)).toBe('2027-05-05')
    expect(resolveYear(11, 3, today)).toBe('2026-11-03')
    expect(resolveYear(1, 1, today)).toBe('2027-01-01')
    expect(resolveYear(12, 25, today)).toBe('2026-12-25')
    expect(resolveYear(10, 11, today)).toBe('2026-10-11') // 꼭 30일 지남
    expect(resolveYear(10, 10, today)).toBe('2027-10-10') // 31일 지남
  })

  it('AC-3509.4: 없는 날짜는 null', () => {
    expect(resolveYear(2, 30, today)).toBeNull()
    expect(resolveYear(13, 1, today)).toBeNull()
    expect(resolveYear(0, 1, today)).toBeNull()
    expect(resolveYear(4, 31, today)).toBeNull()
  })

  it('AC-3509.4: 다음 해에 그 날이 없으면 null(윤날)', () => {
    expect(resolveYear(2, 29, '2028-02-29')).toBe('2028-02-29')
    expect(resolveYear(2, 29, '2028-11-10')).toBeNull()
  })

  it('AC-3509.4: 끝 날짜는 시작의 해로, 끝 달이 시작 달보다 작으면 다음 해', () => {
    expect(resolveEnd('2026-10-03', 10, 5)).toBe('2026-10-05')
    expect(resolveEnd('2026-12-31', 1, 2)).toBe('2027-01-02')
    expect(resolveEnd('2027-01-31', 2, 2)).toBe('2027-02-02')
    expect(resolveEnd('2027-01-31', 2, 30)).toBeNull()
  })
})

describe('AC-3503.5: 안내 달', () => {
  it('AC-3503.5: 가장 이른 시작 날짜의 연·월', () => {
    expect(noticeMonthOf([{ start: '2027-06-06' }, { start: '2027-05-05' }], '2026-11-10')).toEqual({ year: 2027, month: 5 })
    expect(noticeMonthOf([{ start: '2026-12-31' }, { start: '2027-01-01' }], '2026-11-10')).toEqual({ year: 2026, month: 12 })
  })

  it('AC-3503.5: 날짜가 없거나 틀린 카드는 보지 않고, 하나도 없으면 오늘의 달', () => {
    expect(noticeMonthOf([{ start: '' }, { start: '2027-05-05' }], '2026-11-10')).toEqual({ year: 2027, month: 5 })
    expect(noticeMonthOf([{ start: '' }], '2026-11-10')).toEqual({ year: 2026, month: 11 })
    expect(noticeMonthOf([], '2026-11-10')).toEqual({ year: 2026, month: 11 })
  })
})

describe('AC-3503.6: 카드 차례', () => {
  it('AC-3503.6: 시작 날짜 차례, 같으면 적은 차례 그대로, 새 배열', () => {
    const a = card({ start: '2027-05-15', name: '가' })
    const b = card({ start: '2027-05-05', name: '나' })
    const c = card({ start: '2027-05-15', name: '다' })
    const input = [a, b, c]
    const sorted = sortCards(input)
    expect(sorted.map((x) => x.name)).toEqual(['나', '가', '다'])
    expect(sorted).not.toBe(input)
    expect(input.map((x) => x.name)).toEqual(['가', '나', '다'])
  })
})

describe('AC-3507.2: 목록 제목', () => {
  it('AC-3507.2: "2027년 5월 · 어린이날"', () => {
    expect(noticeTitle({ year: 2027, month: 5, cards: [card()], theme: null })).toBe('2027년 5월 · 어린이날')
  })

  it('AC-3507.2: 시작 날짜 차례로 앞 둘의 이름을 "·"로', () => {
    const cards = [card({ start: '2027-05-15', name: '학회' }), card({ start: '2027-05-05', name: '어린이날' }), card({ start: '2027-05-24', name: '부처님오신날' })]
    expect(noticeTitle({ year: 2027, month: 5, cards, theme: null })).toBe('2027년 5월 · 어린이날·학회')
  })
})

describe('AC-3506.2: 그림 파일 이름', () => {
  it('AC-3506.2: 휴진안내_YYYY-MM.png(안내 달)', () => {
    const fiveMonth: ClosureNotice = { year: 2027, month: 5, cards: [card()], theme: null }
    expect(fileNameOf(fiveMonth)).toBe('휴진안내_2027-05.png')
    expect(fileNameOf({ year: 2026, month: 12 })).toBe('휴진안내_2026-12.png')
  })
})
