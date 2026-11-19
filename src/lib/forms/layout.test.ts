import { describe, expect, it } from 'vitest'
import type { ClosureNotice, NoticeCard } from '@/types/forms'
import {
  LOGO,
  LOGO_AREA,
  LOGO_MAX,
  LOGO_TEXT_SHARE,
  MIN_FONT,
  POSTER,
  TEXT_AREA,
  fitSize,
  layoutPoster,
  logoRect,
  logoTextFit,
  logoTextWidth,
  scaleLogoRect,
  textWidth,
} from './layout'
import { DEFAULT_STYLE, type FormStyle } from './style'

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

// ---------- 글씨·로고 크기 (spec form-style REQ-6804 AC-6804.1·AC-6804.2·AC-6804.5·AC-6804.6, design.md 5-1절, TASK-4) ----------

const styleOf = (patch: Partial<FormStyle>): FormStyle => ({ ...DEFAULT_STYLE, ...patch })
const styled = (notice: ClosureNotice, patch: Partial<FormStyle>): ClosureNotice => ({ ...notice, style: styleOf(patch) })

describe("AC-6804.1: '진료일정안내' 크기 = fitSize('진료일정안내', round(120 × t / 100), 746)", () => {
  it('AC-6804.1: 처음대로(style 없음·처음대로 값)면 120 그대로다', () => {
    expect(layoutPoster(noticeOf(days(1))).title).toEqual({ text: '진료일정안내', size: 120 })
    expect(layoutPoster({ ...noticeOf(days(1)), style: { ...DEFAULT_STYLE } }).title).toEqual({ text: '진료일정안내', size: 120 })
  })

  it('AC-6804.1: 80%는 96, 90%는 108이다', () => {
    expect(layoutPoster(styled(noticeOf(days(1)), { titleScale: 80 })).title.size).toBe(96)
    expect(layoutPoster(styled(noticeOf(days(1)), { titleScale: 90 })).title.size).toBe(108)
  })

  it('AC-6804.1: 105% 이상은 746 폭에 묶여 124에서 멈춘다(6글자 × 124 = 744)', () => {
    for (const t of [105, 115, 130]) {
      const { title } = layoutPoster(styled(noticeOf(days(1)), { titleScale: t }))
      expect(title.size, `${t}%`).toBe(fitSize('진료일정안내', Math.round((120 * t) / 100), 746))
      expect(title.size, `${t}%`).toBe(124)
      expect(textWidth('진료일정안내', title.size)).toBeLessThanOrEqual(746)
    }
  })

  it("AC-6804.1: 'N월'과 안내 두 줄·카드는 제목 크기를 따르지 않는다", () => {
    const now = layoutPoster(noticeOf(days(2)))
    const big = layoutPoster(styled(noticeOf(days(2)), { titleScale: 130 }))
    expect(big.monthText).toBe(now.monthText)
    expect(big.lead).toEqual(now.lead)
    expect(big.cards).toEqual(now.cards)
  })
})

describe('AC-6804.2: 본문 크기 — 안내 두 줄·카드 날짜·이름·아래 글', () => {
  const LEAD = ['5월 진료일정을 안내드리오니', '진료 및 내원에 참고해주시길 바랍니다']

  it('AC-6804.2: 안내 두 줄은 각각 fitSize(줄, round(27 × b / 100), 746) — 80·100·130%는 22·27·35, 글은 leadLines와 같다', () => {
    expect(layoutPoster(noticeOf(days(1))).lead).toEqual(LEAD.map((text) => ({ text, size: 27 })))
    expect(layoutPoster(styled(noticeOf(days(1)), { bodyScale: 80 })).lead).toEqual(LEAD.map((text) => ({ text, size: 22 })))
    expect(layoutPoster(styled(noticeOf(days(1)), { bodyScale: 130 })).lead).toEqual(LEAD.map((text) => ({ text, size: 35 })))
    expect(layoutPoster(styled(noticeOf(days(1)), { bodyScale: 130 })).leadLines).toEqual(LEAD)
  })

  it('AC-6804.2: 카드가 없어도 제목·안내 두 줄 크기는 있다', () => {
    const layout = layoutPoster(styled(noticeOf([]), { titleScale: 80, bodyScale: 80 }))
    expect(layout.cards).toEqual([])
    expect(layout.title.size).toBe(96)
    expect(layout.lead.map((l) => l.size)).toEqual([22, 22])
  })

  // 본문 % → 카드 수 → [날짜, 이름, 아래 글] 크기(학회1… · 5월 10일(월) · 휴진)
  const EXPECTED: Record<number, Record<number, number[]>> = {
    80: { 1: [26, 37, 40], 2: [26, 37, 40], 3: [22, 30, 35], 4: [24, 30, 34] },
    100: { 1: [33, 46, 50], 2: [33, 46, 50], 3: [28, 38, 44], 4: [30, 38, 42] },
    // 4장: 날짜 39 → 띠 60 × 0.6 = 36, 아래 글 55 → 몸통 140 × 0.37 = 51에 묶인다. 3장 날짜 36은 안쪽 폭 194에 들게 32로
    130: { 1: [43, 60, 65], 2: [43, 60, 65], 3: [32, 49, 57], 4: [36, 49, 51] },
  }

  it.each([80, 100, 130])('AC-6804.2: 본문 %i% — 카드 1~4장의 날짜·이름·아래 글 크기', (b) => {
    for (const n of [1, 2, 3, 4]) {
      const { cards } = layoutPoster(styled(noticeOf(days(n)), { bodyScale: b }))
      expect(cards.map(sizes), `${n}장`).toEqual(Array.from({ length: n }, () => EXPECTED[b][n]))
    }
  })

  it.each([80, 85, 95, 105, 115, 125, 130])('AC-6804.2: 본문 %i% — 크기는 식(카드 수별 처음 크기 × b, 띠 × 0.6·몸통 × 0.37 한도, 안쪽 폭 맞추기)대로다', (b) => {
    const fonts: Record<number, number[]> = { 1: [33, 46, 50], 2: [33, 46, 50], 3: [28, 38, 44], 4: [30, 38, 42] }
    for (const n of [1, 2, 3, 4]) {
      const cards = days(n).map((c, i) => (i === 0 ? card('2027-01-31', '가나다라마바사아자차', '2027-02-02', '오전진료만해') : c))
      for (const c of layoutPoster(styled(noticeOf(cards, 1), { bodyScale: b })).cards) {
        const inner = c.w - 32
        const [fd, fn, fs] = fonts[n]
        const head = Math.floor(c.headH * 0.6)
        const body = Math.floor(c.bodyH * 0.37)
        expect(c.date.size, `${n}장 ${c.date.text}`).toBe(fitSize(c.date.text, Math.min(Math.round((fd * b) / 100), head), inner))
        expect(c.name.size, `${n}장 ${c.name.text}`).toBe(fitSize(c.name.text, Math.min(Math.round((fn * b) / 100), body), inner))
        expect(c.status.size, `${n}장 ${c.status.text}`).toBe(fitSize(c.status.text, Math.min(Math.round((fs * b) / 100), body), inner))
        for (const part of [c.date, c.name, c.status]) if (part.size > MIN_FONT) expect(textWidth(part.text, part.size)).toBeLessThanOrEqual(inner)
      }
    }
  })

  it('AC-6804.2: 본문 크기는 카드 자리(x·y·폭·띠·몸통)와 제목을 바꾸지 않는다', () => {
    for (const n of [1, 2, 3, 4]) {
      const now = layoutPoster(noticeOf(days(n)))
      const big = layoutPoster(styled(noticeOf(days(n)), { bodyScale: 130 }))
      expect(big.cards.map(box)).toEqual(now.cards.map(box))
      expect(big.title).toEqual(now.title)
    }
  })

  it('AC-6804.6: 처음대로 style이면 배치가 style 없을 때와 한 값도 다르지 않다', () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(layoutPoster({ ...noticeOf(days(n)), style: { ...DEFAULT_STYLE } }), `${n}장`).toEqual(layoutPoster(noticeOf(days(n))))
    }
  })
})

describe('AC-6804.5: 로고 크기 — scaleLogoRect(가운데를 지킨 채 s = min(L/100, 최대 폭 ÷ 폭, 최대 높이 ÷ 높이)배)', () => {
  const WIDE = logoRect(LOGO_AREA, { width: 1033, height: 175 }) // 227, 1011.2 · 340×57.6
  const TALL = logoRect(LOGO_AREA, { width: 1080, height: 501 }) // 289.2, 990 · 215.6×100

  it('AC-6804.5: 휴진 안내 로고 최대는 600×130이다', () => {
    expect(LOGO_MAX).toEqual({ width: 600, height: 130 })
  })

  it('AC-6804.5: 100%면 네모 그대로다(크기를 아는 그림·원래 상자)', () => {
    expect(scaleLogoRect(WIDE, 100, LOGO_MAX)).toEqual(WIDE)
    expect(scaleLogoRect(TALL, 100, LOGO_MAX)).toEqual(TALL)
    expect(scaleLogoRect(LOGO, 100, LOGO_MAX)).toEqual({ x: 227, y: 1011, width: 340, height: 58 })
  })

  it('AC-6804.5: 150%면 1.5배(가운데 397·1040 그대로), 60%면 0.6배다', () => {
    expect(scaleLogoRect(WIDE, 150, LOGO_MAX)).toEqual({ x: 142, y: 996.8, width: 510, height: 86.4 })
    expect(scaleLogoRect(WIDE, 60, LOGO_MAX)).toEqual({ x: 295, y: 1022.7, width: 204, height: 34.6 })
    expect(scaleLogoRect(TALL, 60, LOGO_MAX)).toEqual({ x: 332.3, y: 1010, width: 129.4, height: 60 })
    expect(scaleLogoRect(LOGO, 150, LOGO_MAX)).toEqual({ x: 142, y: 996.5, width: 510, height: 87 })
    expect(scaleLogoRect(LOGO, 60, LOGO_MAX)).toEqual({ x: 295, y: 1022.6, width: 204, height: 34.8 })
  })

  it('AC-6804.5: 최대 높이 130에 묶이면 1.5배보다 덜 커진다(세로로 긴 쪽 로고 150% → 1.3배)', () => {
    const r = scaleLogoRect(TALL, 150, LOGO_MAX)
    expect(r).toEqual({ x: 256.9, y: 975, width: 280.3, height: 130 })
    expect(r.x + r.width / 2).toBeCloseTo(397, 1)
    expect(r.y + r.height / 2).toBe(1040)
  })

  it('AC-6804.5: 최대 폭에 묶이는 아주 납작한 네모도 가운데를 지키고 최대 폭을 넘지 않는다', () => {
    const flat = { x: 100, y: 200, width: 500, height: 10 }
    expect(scaleLogoRect(flat, 150, LOGO_MAX)).toEqual({ x: 50, y: 199, width: 600, height: 12 })
  })

  it('AC-6804.5: 네 값은 소수 첫째 자리까지이고 최대를 넘지 않는다', () => {
    for (const size of [{ width: 1033, height: 175 }, { width: 777, height: 333 }, { width: 123, height: 457 }, { width: 3, height: 7 }])
      for (const pct of [60, 65, 85, 115, 135, 150]) {
        const r = scaleLogoRect(logoRect(LOGO_AREA, size), pct, LOGO_MAX)
        for (const [name, value] of Object.entries(r)) expect(Math.round(value * 10) / 10, `${size.width}×${size.height} ${pct}% ${name}`).toBe(value)
        expect(r.width).toBeLessThanOrEqual(LOGO_MAX.width)
        expect(r.height).toBeLessThanOrEqual(LOGO_MAX.height)
      }
  })
})

describe('AC-6804.5: 이름 글자 로고 — 맞출 폭 W = min(최대 폭, 상자 폭 × L / 100), 크기 fitSize(이름, min(floor(높이 × 0.8 × L / 100), floor(최대 높이 × 0.8)), W)', () => {
  const BOX = { width: LOGO.width, height: LOGO.height }

  it('AC-6804.5: logoTextWidth — 처음대로(pct·max 없음)·100%면 상자 폭, 150%·60%면 510·204, 최대 폭에서 멈춘다', () => {
    expect(logoTextWidth(BOX)).toBe(340)
    expect(logoTextWidth(BOX, 100, LOGO_MAX)).toBe(340)
    expect(logoTextWidth(BOX, 150, LOGO_MAX)).toBe(510)
    expect(logoTextWidth(BOX, 60, LOGO_MAX)).toBe(204)
    expect(logoTextWidth({ width: 500, height: 58 }, 150, LOGO_MAX)).toBe(600)
  })

  it('AC-6804.5: logoTextFit은 돌려주는 모양 { size, squeeze } 그대로이고 100%면 지금 값과 같다', () => {
    for (const name of ['서승관', '서승관정형외과의원', '가'.repeat(50)]) {
      expect(logoTextFit(name, BOX, 100, LOGO_MAX), name).toEqual(logoTextFit(name, BOX))
      expect(Object.keys(logoTextFit(name, BOX, 150, LOGO_MAX)).sort()).toEqual(['size', 'squeeze'])
    }
  })

  it('AC-6804.5: 150%면 46 → 69에서 510 폭에, 60%면 27에서 204 폭에 맞춘다', () => {
    expect(logoTextFit('서승관', BOX, 150, LOGO_MAX)).toEqual({ size: 69, squeeze: false })
    expect(logoTextFit('서승관', BOX, 60, LOGO_MAX)).toEqual({ size: 27, squeeze: false })
    const name = '서승관정형외과의원'
    expect(logoTextFit(name, BOX, 150, LOGO_MAX)).toEqual({ size: fitSize(name, 69, 510), squeeze: false })
    expect(logoTextFit(name, BOX, 150, LOGO_MAX).size).toBe(56)
    expect(logoTextFit(name, BOX, 60, LOGO_MAX)).toEqual({ size: 22, squeeze: false })
  })

  it('AC-6804.5: 처음 크기는 최대 높이 × 0.8을 넘지 않는다', () => {
    expect(logoTextFit('가', BOX, 150, { width: 600, height: 50 })).toEqual({ size: 40, squeeze: false })
  })

  it('AC-6804.5: 가장 작은 크기로도 W를 넘치면 squeeze가 참이다(그리는 쪽이 W로 눌러 그린다)', () => {
    expect(logoTextFit('가'.repeat(50), BOX, 150, LOGO_MAX)).toEqual({ size: MIN_FONT, squeeze: true })
    expect(logoTextFit('가'.repeat(25), BOX, 150, LOGO_MAX)).toEqual({ size: 20, squeeze: false }) // 25 × 20 = 500 ≤ 510
    expect(logoTextFit('가'.repeat(25), BOX)).toEqual({ size: MIN_FONT, squeeze: true }) // 25 × 18 = 450 > 340
  })
})
