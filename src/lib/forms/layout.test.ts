import { describe, expect, it } from 'vitest'
import type { ClosureNotice, NoticeCard } from '@/types/forms'
import { MIN_FONT, POSTER, TEXT_AREA, fitSize, layoutPoster, textWidth } from './layout'

// 서식 탭 휴진 안내 그림의 배치와 글자 크기 맞추기 (specs/forms REQ-3505, design.md 5절, TASK-3).
// 자리 값은 승인 시안(794×1123)을 브라우저에서 잰 값(design.md 5절 표)

const card = (start: string, name = '어린이날', end: string | null = null, status = '휴진'): NoticeCard => ({ start, end, name, status })
const noticeOf = (cards: NoticeCard[], month = 5): ClosureNotice => ({ year: 2027, month, cards, theme: null })
const days = (n: number) => Array.from({ length: n }, (_, i) => card(`2027-05-${String(10 + i).padStart(2, '0')}`, `학회${i + 1}`))
const box = (c: ReturnType<typeof layoutPoster>['cards'][number]) => ({ x: c.x, y: c.y, w: c.w, headH: c.headH, bodyH: c.bodyH })
const sizes = (c: ReturnType<typeof layoutPoster>['cards'][number]) => [c.date.size, c.name.size, c.status.size]

describe('AC-3505.2: 카드 수에 따른 자리', () => {
  it('AC-3505.2: 1장은 가운데(폭 318, 띠 79, 몸통 224, y=534)', () => {
    const { cards } = layoutPoster(noticeOf(days(1)))
    expect(cards.map(box)).toEqual([{ x: 238, y: 534, w: 318, headH: 79, bodyH: 224 }])
    expect(sizes(cards[0])).toEqual([33, 46, 50])
  })

  it('AC-3505.2: 2장은 가로 둘(사이 36)', () => {
    const { cards } = layoutPoster(noticeOf(days(2)))
    expect(cards.map(box)).toEqual([
      { x: 61, y: 534, w: 318, headH: 79, bodyH: 224 },
      { x: 415, y: 534, w: 318, headH: 79, bodyH: 224 },
    ])
    expect(cards.map(sizes)).toEqual([[33, 46, 50], [33, 46, 50]])
  })

  it('AC-3505.2: 3장은 가로 셋(폭 226, 사이 24, 띠 70, 몸통 196)', () => {
    const { cards } = layoutPoster(noticeOf(days(3)))
    expect(cards.map(box)).toEqual([
      { x: 34, y: 534, w: 226, headH: 70, bodyH: 196 },
      { x: 284, y: 534, w: 226, headH: 70, bodyH: 196 },
      { x: 534, y: 534, w: 226, headH: 70, bodyH: 196 },
    ])
    expect(cards.map(sizes)).toEqual([[28, 38, 44], [28, 38, 44], [28, 38, 44]])
  })

  it('AC-3505.2: 4장은 2×2(y=510·734, 띠 60, 몸통 140)', () => {
    const { cards } = layoutPoster(noticeOf(days(4)))
    expect(cards.map(box)).toEqual([
      { x: 61, y: 510, w: 318, headH: 60, bodyH: 140 },
      { x: 415, y: 510, w: 318, headH: 60, bodyH: 140 },
      { x: 61, y: 734, w: 318, headH: 60, bodyH: 140 },
      { x: 415, y: 734, w: 318, headH: 60, bodyH: 140 },
    ])
    expect(cards.map(sizes)).toEqual(Array.from({ length: 4 }, () => [30, 38, 42]))
  })

  it.each([1, 2, 3, 4])('AC-3505.2: %i장일 때 모든 카드가 글자 자리(x 24~770, y 80~960)와 794×1123 안', (n) => {
    expect(TEXT_AREA).toEqual({ left: 24, right: 770, top: 80, bottom: 960 })
    expect(POSTER).toMatchObject({ width: 794, height: 1123 })
    for (const c of layoutPoster(noticeOf(days(n))).cards) {
      expect(c.x).toBeGreaterThanOrEqual(TEXT_AREA.left)
      expect(c.x + c.w).toBeLessThanOrEqual(TEXT_AREA.right)
      expect(c.y).toBeGreaterThanOrEqual(TEXT_AREA.top)
      expect(c.y + c.headH + c.bodyH).toBeLessThanOrEqual(TEXT_AREA.bottom)
    }
  })

  it('AC-3505.2: 카드가 없으면 카드 자리도 없다', () => {
    expect(layoutPoster(noticeOf([])).cards).toEqual([])
  })

  it('AC-3505.2: 제목 글은 안내 달로', () => {
    const layout = layoutPoster(noticeOf(days(1), 5))
    expect(layout.monthText).toBe('5월')
    expect(layout.leadLines).toEqual(['5월 진료일정을 안내드리오니', '진료 및 내원에 참고해주시길 바랍니다'])
  })
})

describe('AC-3505.3: 글자 크기 맞추기', () => {
  it('AC-3505.3: 글자 폭 어림(한글 1.0em, 숫자 0.62em, 괄호 0.38em, ~ 0.6em, 빈칸 0.3em, 그 밖 0.6em)', () => {
    expect(textWidth('가', 10)).toBeCloseTo(10)
    expect(textWidth('1', 10)).toBeCloseTo(6.2)
    expect(textWidth('()', 10)).toBeCloseTo(7.6)
    expect(textWidth('~', 10)).toBeCloseTo(6)
    expect(textWidth(' ', 10)).toBeCloseTo(3)
    expect(textWidth('A', 10)).toBeCloseTo(6)
    expect(textWidth('5월 5일(수)', 10)).toBeCloseTo(53)
  })

  it('AC-3505.3: 넘치지 않으면 시안 크기 그대로, 넘치면 1px씩 줄이되 18px 아래로는 내려가지 않는다', () => {
    expect(MIN_FONT).toBe(18)
    expect(fitSize('휴진', 50, 286)).toBe(50)
    expect(fitSize('가나다라마바사아자차', 46, 286)).toBe(28)
    expect(fitSize('가나다라마바사아자차', 46, 100)).toBe(18)
  })

  it('AC-3505.3: 10자 이름·6자 아래 글·다른 달 범위가 카드 안쪽 폭(폭 − 32) 안으로 줄어든다', () => {
    // 카드 수 → [날짜, 이름, 아래 글] 크기. 4장 아래 글(시안 42px)은 넘치지 않아 그대로
    const expected: Record<number, number[]> = { 1: [24, 28, 47], 2: [24, 28, 47], 4: [24, 28, 42] }
    for (const n of [1, 2, 4]) {
      const cards = days(n).map((c, i) => (i === 0 ? card('2027-01-31', '가나다라마바사아자차', '2027-02-02', '오전진료만해') : c))
      const first = layoutPoster(noticeOf(cards, 1)).cards[0]
      const inner = first.w - 32
      expect(first.date.text).toBe('1월 31일(일)~2월 2일(화)')
      expect(sizes(first)).toEqual(expected[n])
      for (const part of [first.date, first.name, first.status]) expect(textWidth(part.text, part.size)).toBeLessThanOrEqual(inner)
      for (const part of [first.date, first.name]) expect(textWidth(part.text, part.size + 1)).toBeGreaterThan(inner)
    }
  })

  it('AC-3505.3: 3장 카드의 긴 범위는 18px에서 멈춘다', () => {
    const cards = [card('2027-01-31', '가나다라마바사아자차', '2027-02-02'), ...days(2)]
    const first = layoutPoster(noticeOf(cards, 1)).cards[0]
    expect(first.date.size).toBe(18)
    expect(first.name.size).toBe(19)
  })
})

describe('AC-3503.6: 카드는 시작 날짜 차례로 그린다', () => {
  it('AC-3503.6: 적은 차례와 상관없이 시작 날짜 차례', () => {
    const cards = [card('2027-05-24', '부처님오신날'), card('2027-05-05', '어린이날'), card('2027-05-15', '학회')]
    expect(layoutPoster(noticeOf(cards)).cards.map((c) => c.name.text)).toEqual(['어린이날', '학회', '부처님오신날'])
    expect(layoutPoster(noticeOf(cards)).cards.map((c) => c.date.text)).toEqual(['5월 5일(수)', '5월 15일(토)', '5월 24일(월)'])
  })
})
