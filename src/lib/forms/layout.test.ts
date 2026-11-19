import { describe, expect, it } from 'vitest'
import type { ClosureNotice, NoticeCard } from '@/types/forms'
import { LOGO, LOGO_AREA, LOGO_TEXT_SHARE, MIN_FONT, POSTER, TEXT_AREA, fitSize, layoutPoster, logoRect, logoTextFit, textWidth } from './layout'

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

describe('AC-3602.2: 병원 로고 자리 (specs/forms-logo design.md 3절)', () => {
  it('AC-3602.2: 로고는 /poster/logo.png, 맨 아래 가운데 340×58(원본 1033×175 비율), 아래 끝에서 54 위', () => {
    expect(LOGO).toEqual({ href: '/poster/logo.png', x: 227, y: 1011, width: 340, height: 58 })
    expect(LOGO.x + LOGO.width / 2).toBe(POSTER.cx)
    expect(LOGO.height).toBe(Math.round((LOGO.width * 175) / 1033))
    expect(POSTER.height - (LOGO.y + LOGO.height)).toBe(54)
  })

  it('AC-3602.2: 카드 1~4장 어느 배치에서도 로고는 카드 아래 끝보다 아래에서 시작하고 종이 안에서 끝난다', () => {
    for (const n of [1, 2, 3, 4]) {
      const { cards } = layoutPoster(noticeOf(days(n)))
      const bottom = Math.max(...cards.map((c) => c.y + c.headH + c.bodyH))
      expect(bottom, `${n}장`).toBeLessThan(LOGO.y)
      expect(LOGO.y + LOGO.height, `${n}장`).toBeLessThanOrEqual(POSTER.height)
    }
  })
})

describe('AC-6604.1: 로고가 없을 때 로고 자리의 병원 이름 글자 크기 (spec clinic-profile design.md 6절)', () => {
  const BOX = { width: LOGO.width, height: LOGO.height }

  it('AC-6604.1: 글자 크기는 상자 높이의 80%(LOGO_TEXT_SHARE)에서 시작한다 — 짧은 이름은 그 크기 그대로(58 × 0.8 → 46)', () => {
    expect(LOGO_TEXT_SHARE).toBe(0.8)
    expect(logoTextFit('서승관', BOX)).toEqual({ size: 46, squeeze: false })
  })

  it('AC-6604.1: 긴 이름은 상자 폭(340)에 들 때까지 1px씩 줄인 가장 큰 크기다(fitSize와 같다)', () => {
    const name = '서승관정형외과의원'
    const { size, squeeze } = logoTextFit(name, BOX)
    expect(size).toBe(fitSize(name, 46, 340))
    expect(size).toBeLessThan(46)
    expect(textWidth(name, size)).toBeLessThanOrEqual(340)
    expect(textWidth(name, size + 1)).toBeGreaterThan(340)
    expect(squeeze).toBe(false)
  })

  it('AC-6604.1: 가장 작은 크기(MIN_FONT)로도 넘치면 squeeze가 참이다(그리는 쪽이 상자 폭으로 눌러 그린다)', () => {
    const long = '가'.repeat(50)
    expect(logoTextFit(long, BOX)).toEqual({ size: MIN_FONT, squeeze: true })
  })

  it('AC-6604.1: 다른 상자(환자 안내문 400×68)면 그 높이·폭으로 맞춘다(68 × 0.8 → 54)', () => {
    expect(logoTextFit('서승관', { width: 400, height: 68 })).toEqual({ size: 54, squeeze: false })
  })
})

describe('AC-6703.1: 크기를 아는 로고는 340×100 자리에 비율을 지켜 가장 크게 (spec logo-fit design.md 4절)', () => {
  it('AC-6703.1: 휴진 안내 로고 자리는 x 227·y 990·340×100, 가운데 397·1040이다', () => {
    expect(LOGO_AREA).toEqual({ x: 227, y: 990, width: 340, height: 100 })
    expect(LOGO_AREA.x + LOGO_AREA.width / 2).toBe(POSTER.cx)
    expect(LOGO_AREA.y + LOGO_AREA.height / 2).toBe(1040)
    expect(LOGO_AREA.y + LOGO_AREA.height / 2).toBe(LOGO.y + LOGO.height / 2) // 원래 로고 상자와 가운데가 같다
  })

  it('AC-6703.1: 자리는 글자 자리 아래 끝(960)에서 30 띄워 시작하고 종이 끝(1123)에서 33 위에서 끝난다 — 카드 1~4장 어느 배치보다 아래', () => {
    expect(LOGO_AREA.y - TEXT_AREA.bottom).toBe(30)
    expect(POSTER.height - (LOGO_AREA.y + LOGO_AREA.height)).toBe(33)
    for (const n of [1, 2, 3, 4]) {
      const { cards } = layoutPoster(noticeOf(days(n)))
      expect(Math.max(...cards.map((c) => c.y + c.headH + c.bodyH)), `${n}장`).toBeLessThan(LOGO_AREA.y)
    }
  })

  it('AC-6703.1: 가로형 1033×175는 폭에 묶여 지금과 같은 자리(227, 1011.2 · 340×57.6)다', () => {
    expect(logoRect(LOGO_AREA, { width: 1033, height: 175 })).toEqual({ x: 227, y: 1011.2, width: 340, height: 57.6 })
  })

  it('AC-6703.1: 세로로 긴 쪽 로고(1080×501)는 높이 100에 묶여 가운데 397·1040에 그린다', () => {
    // 배율 = min(340/1080, 100/501) = 100/501 → 폭 1080 × 100/501 = 215.57…
    const r = logoRect(LOGO_AREA, { width: 1080, height: 501 })
    expect(r).toEqual({ x: 289.2, y: 990, width: 215.6, height: 100 })
    expect(r.x + r.width / 2).toBeCloseTo(397, 1)
  })

  it('AC-6703.1: 정사각 로고는 높이에 묶여 100×100, 그림 위·아래로 긴 로고도 높이 100이다', () => {
    expect(logoRect(LOGO_AREA, { width: 200, height: 200 })).toEqual({ x: 347, y: 990, width: 100, height: 100 })
    expect(logoRect(LOGO_AREA, { width: 300, height: 600 })).toEqual({ x: 372, y: 990, width: 50, height: 100 })
  })

  it('AC-6703.1: 작은 로고도 자리에 맞게 키운다(비율 그대로) — 아주 납작한 로고는 폭 340에 묶인다', () => {
    expect(logoRect(LOGO_AREA, { width: 34, height: 10 })).toEqual({ x: 227, y: 990, width: 340, height: 100 })
    expect(logoRect(LOGO_AREA, { width: 1000, height: 10 })).toEqual({ x: 227, y: 1038.3, width: 340, height: 3.4 })
  })

  it('AC-6703.1: x·y·폭·높이 네 값 모두 소수 첫째 자리까지다', () => {
    for (const size of [
      { width: 1033, height: 175 },
      { width: 1080, height: 501 },
      { width: 777, height: 333 },
      { width: 123, height: 457 },
      { width: 3, height: 7 },
    ]) {
      const r = logoRect(LOGO_AREA, size)
      for (const [name, value] of Object.entries(r)) expect(Math.round(value * 10) / 10, `${size.width}×${size.height} ${name}`).toBe(value)
      // 자리 밖으로 나가지 않는다(반올림 0.05 안)
      expect(r.x).toBeGreaterThanOrEqual(LOGO_AREA.x - 0.05)
      expect(r.y).toBeGreaterThanOrEqual(LOGO_AREA.y - 0.05)
      expect(r.x + r.width).toBeLessThanOrEqual(LOGO_AREA.x + LOGO_AREA.width + 0.1)
      expect(r.y + r.height).toBeLessThanOrEqual(LOGO_AREA.y + LOGO_AREA.height + 0.1)
    }
  })
})

describe('AC-6703.3·AC-6703.5: 크기 모르는 로고와 병원 이름 글자는 원래 로고 상자 그대로', () => {
  it('AC-6703.3·AC-6703.5: 원래 로고 상자(227,1011 · 340×58)는 바뀌지 않는다', () => {
    expect(LOGO).toEqual({ href: '/poster/logo.png', x: 227, y: 1011, width: 340, height: 58 })
  })

  it('AC-6703.5: 병원 이름 글자 크기는 원래 상자(340×58) 기준이다(새 자리 100 높이가 아니다)', () => {
    expect(logoTextFit('서승관', LOGO)).toEqual({ size: 46, squeeze: false })
    expect(logoTextFit('서승관', LOGO_AREA).size).not.toBe(46)
  })
})
