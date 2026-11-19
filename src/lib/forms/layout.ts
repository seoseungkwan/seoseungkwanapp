import type { ClosureNotice } from '@/types/forms'
import { dateLabel, sortCards } from './notice'
import { DEFAULT_STYLE, scaled } from './style'

// 서식 탭 휴진 안내 그림(A4 세로 794×1123)의 배치 (specs/forms design.md 5절).
// 자리 값은 승인 시안을 브라우저에서 잰 값이고, 테마 시안 themes.html이 같은 표로 그렸다

export const POSTER = { width: 794, height: 1123, cx: 397 } as const
// 테마 그림이 비워 둔 글자 자리. 모든 카드가 이 안에 든다
export const TEXT_AREA = { left: 24, right: 770, top: 80, bottom: 960 } as const
export const MIN_FONT = 18
const CARD_PADDING = 32 // 카드 폭 − 안쪽 폭(양옆 16)
// 병원 로고(가로형 1033×175): 맨 아래 가운데, 아래 끝에서 54 위. 카드 수와 상관없이 같은 자리 (specs/forms-logo design.md 3절)
// 크기 모르는 로고 그림·병원 이름 글자·옛 로고 그림이 이 상자를 쓴다(spec logo-fit AC-6703.3·AC-6703.5).
// href는 로고를 넘기지 않은 옛 부르기(logo prop 없음)만 쓴다 — 서식 화면은 늘 병원 정보 로고를 넘긴다(spec clinic-profile AC-6604.1)
export const LOGO = { href: '/poster/logo.png', x: 227, y: 1011, width: 340, height: 58 } as const
// 크기를 아는 로고 그림의 자리(spec logo-fit design.md 4절, AC-6703.1): 가운데 397·1040(LOGO와 같다).
// 글자 자리 아래 끝 960에서 30 띄워 시작하고 종이 끝 1123에서 33 위에서 끝난다. 가로형 로고는 폭에 묶여 LOGO와 같은 자리다
export const LOGO_AREA = { x: 227, y: 990, width: 340, height: 100 } as const
// 로고 크기(%)를 키워도 넘지 않는 최대 폭·높이(spec form-style AC-6804.5)
export const LOGO_MAX = { width: 600, height: 130 } as const

export type LogoBox = { x: number; y: number; width: number; height: number }
// 로고 자리 값(spec clinic-profile design.md 6절): 병원 정보 로고 그림(PNG data: 주소) 또는 로고가 없을 때 병원 이름 글자.
// 그림의 width·height는 그림 크기(점 수, spec logo-fit AC-6702.1). 모르면 비운다 → 원래 로고 상자(AC-6703.3)
// tintable(spec form-style AC-6805.3): 서식 화면이 준비에 성공한 그림 중 비어 있는 점이 넉넉한 것에만 true를 넣는다 — 로고 색을 칠해도 되는 그림
export type PosterLogo = { kind: 'image'; href: string; width?: number; height?: number; tintable?: boolean } | { kind: 'text'; text: string }

const tenth = (value: number) => Math.round(value * 10) / 10
// 크기(가로·세로 점 수)인 그림을 자리 안에 비율을 지켜 가장 크게, 가운데 맞춰 놓은 네모. 네 값 모두 소수 첫째 자리 (AC-6703.1·AC-6703.2)
export function logoRect(area: LogoBox, size: { width: number; height: number }): LogoBox {
  const scale = Math.min(area.width / size.width, area.height / size.height)
  const width = size.width * scale
  const height = size.height * scale
  return {
    x: tenth(area.x + area.width / 2 - width / 2),
    y: tenth(area.y + area.height / 2 - height / 2),
    width: tenth(width),
    height: tenth(height),
  }
}
// 로고 크기 pct%(spec form-style AC-6804.5): 네모를 가운데를 지킨 채 s = min(pct / 100, 최대 폭 ÷ 폭, 최대 높이 ÷ 높이)배. 네 값 모두 소수 첫째 자리
export function scaleLogoRect(rect: LogoBox, pct: number, max: { width: number; height: number }): LogoBox {
  const scale = Math.min(pct / 100, max.width / rect.width, max.height / rect.height)
  const width = rect.width * scale
  const height = rect.height * scale
  return {
    x: tenth(rect.x + rect.width / 2 - width / 2),
    y: tenth(rect.y + rect.height / 2 - height / 2),
    width: tenth(width),
    height: tenth(height),
  }
}
// 이름 글자는 상자 높이의 80%에서 시작해 상자 폭에 맞춘다
export const LOGO_TEXT_SHARE = 0.8

type Shape = { w: number; gap: number; headH: number; bodyH: number; rows: number[]; cols: number; fonts: [number, number, number] }
// 카드 수 → 폭·사이·띠·몸통·줄 y·한 줄 칸 수·처음 글자 크기(날짜·이름·아래 글)
const SHAPES: Record<number, Shape> = {
  1: { w: 318, gap: 0, headH: 79, bodyH: 224, rows: [534], cols: 1, fonts: [33, 46, 50] },
  2: { w: 318, gap: 36, headH: 79, bodyH: 224, rows: [534], cols: 2, fonts: [33, 46, 50] },
  3: { w: 226, gap: 24, headH: 70, bodyH: 196, rows: [534], cols: 3, fonts: [28, 38, 44] },
  4: { w: 318, gap: 36, headH: 60, bodyH: 140, rows: [510, 734], cols: 2, fonts: [30, 38, 42] },
}

export type FittedText = { text: string; size: number }
export type CardLayout = { x: number; y: number; w: number; headH: number; bodyH: number; date: FittedText; name: FittedText; status: FittedText }
// title·lead: 글씨 크기(style)를 넣은 '진료일정안내'·안내 두 줄 크기(spec form-style AC-6804.1·AC-6804.2). leadLines는 같은 글(옛 시험)
export type PosterLayout = { monthText: string; leadLines: [string, string]; title: FittedText; lead: [FittedText, FittedText]; cards: CardLayout[] }

const TITLE_TEXT = '진료일정안내'
const TITLE_SIZE = 120 // '진료일정안내' 처음 크기
const LEAD_SIZE = 27 // 안내 두 줄 처음 크기
const TEXT_ROOM = 746 // 제목·안내 두 줄을 맞출 폭(글자 자리 24~770)
const DATE_SHARE = 0.6 // 카드 날짜는 띠 높이의 60%를 넘지 않는다
const BODY_SHARE = 0.37 // 카드 이름·아래 글은 몸통 높이의 37%를 넘지 않는다

// 글자별 어림 폭(em)의 합 × 크기. 실제보다 넉넉하게 잡는다(한글 1.0em)
export function textWidth(text: string, size: number): number {
  let em = 0
  for (const ch of text) {
    if (/[ㄱ-힣一-鿿]/.test(ch)) em += 1.0
    else if (/[0-9]/.test(ch)) em += 0.62
    else if (ch === '(' || ch === ')') em += 0.38
    else if (ch === ' ') em += 0.3
    else em += 0.6 // '~'와 그 밖
  }
  return em * size
}

// 시안 크기에서 시작해 안쪽 폭을 넘지 않을 때까지 1px씩 줄인다. 가장 작게 MIN_FONT
export function fitSize(text: string, size: number, inner: number): number {
  let fitted = size
  while (fitted > MIN_FONT && textWidth(text, fitted) > inner) fitted -= 1
  return fitted
}

type Size = { width: number; height: number }

// 이름 글자를 맞출 폭 W = min(최대 폭, 상자 폭 × pct / 100) (spec form-style AC-6804.5). pct·max가 없으면 상자 폭
export function logoTextWidth(box: Size, pct = 100, max: Size = box): number {
  return Math.min(max.width, (box.width * pct) / 100)
}

// 로고가 없을 때 로고 상자에 넣는 병원 이름 글자 크기. 가장 작은 크기로도 넘치면 squeeze(그리는 쪽이 W로 눌러 그린다).
// 로고 크기 pct%(spec form-style AC-6804.5): 처음 크기 min(floor(높이 × 0.8 × pct / 100), floor(최대 높이 × 0.8))에서 W에 맞춘다. 100%면 지금 값 그대로
export function logoTextFit(text: string, box: Size, pct = 100, max: Size = box): { size: number; squeeze: boolean } {
  const room = logoTextWidth(box, pct, max)
  const start = Math.min(Math.floor((box.height * LOGO_TEXT_SHARE * pct) / 100), Math.floor(max.height * LOGO_TEXT_SHARE))
  const size = fitSize(text, start, room)
  return { size, squeeze: textWidth(text, size) > room }
}

// 글씨 크기(notice.style, spec form-style AC-6804.1·AC-6804.2): 제목 t%·본문 b%. 처음대로(100%)면 지금 크기와 같다
export function layoutPoster(notice: ClosureNotice): PosterLayout {
  const { titleScale, bodyScale } = notice.style ?? DEFAULT_STYLE
  const monthText = `${notice.month}월`
  const leadLines: [string, string] = [`${notice.month}월 진료일정을 안내드리오니`, '진료 및 내원에 참고해주시길 바랍니다']
  const title: FittedText = { text: TITLE_TEXT, size: fitSize(TITLE_TEXT, scaled(TITLE_SIZE, titleScale), TEXT_ROOM) }
  const leadOf = (text: string): FittedText => ({ text, size: fitSize(text, scaled(LEAD_SIZE, bodyScale), TEXT_ROOM) })
  const lead: [FittedText, FittedText] = [leadOf(leadLines[0]), leadOf(leadLines[1])]
  const shape = SHAPES[notice.cards.length]
  if (!shape) return { monthText, leadLines, title, lead, cards: [] }

  const rowWidth = shape.cols * shape.w + (shape.cols - 1) * shape.gap
  const x0 = (POSTER.width - rowWidth) / 2
  const inner = shape.w - CARD_PADDING
  // 처음 크기 × b%를 띠·몸통 높이 한도로 묶은 뒤 안쪽 폭에 맞춘다
  const dateMax = Math.floor(shape.headH * DATE_SHARE)
  const bodyMax = Math.floor(shape.bodyH * BODY_SHARE)
  const fit = (text: string, size: number, limit: number): FittedText => ({ text, size: fitSize(text, Math.min(scaled(size, bodyScale), limit), inner) })
  const cards = sortCards(notice.cards).map((card, i) => ({
    x: x0 + (i % shape.cols) * (shape.w + shape.gap),
    y: shape.rows[Math.floor(i / shape.cols)],
    w: shape.w,
    headH: shape.headH,
    bodyH: shape.bodyH,
    date: fit(dateLabel(card), shape.fonts[0], dateMax),
    name: fit(card.name, shape.fonts[1], bodyMax),
    status: fit(card.status, shape.fonts[2], bodyMax),
  }))
  return { monthText, leadLines, title, lead, cards }
}
