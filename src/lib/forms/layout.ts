import type { ClosureNotice } from '@/types/forms'
import { dateLabel, sortCards } from './notice'

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

export type LogoBox = { x: number; y: number; width: number; height: number }
// 로고 자리 값(spec clinic-profile design.md 6절): 병원 정보 로고 그림(PNG data: 주소) 또는 로고가 없을 때 병원 이름 글자.
// 그림의 width·height는 그림 크기(점 수, spec logo-fit AC-6702.1). 모르면 비운다 → 원래 로고 상자(AC-6703.3)
export type PosterLogo = { kind: 'image'; href: string; width?: number; height?: number } | { kind: 'text'; text: string }

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
export type PosterLayout = { monthText: string; leadLines: [string, string]; cards: CardLayout[] }

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

// 로고가 없을 때 로고 상자에 넣는 병원 이름 글자 크기. 가장 작은 크기로도 넘치면 squeeze(그리는 쪽이 상자 폭으로 눌러 그린다)
export function logoTextFit(text: string, box: { width: number; height: number }): { size: number; squeeze: boolean } {
  const size = fitSize(text, Math.floor(box.height * LOGO_TEXT_SHARE), box.width)
  return { size, squeeze: textWidth(text, size) > box.width }
}

export function layoutPoster(notice: ClosureNotice): PosterLayout {
  const monthText = `${notice.month}월`
  const leadLines: [string, string] = [`${notice.month}월 진료일정을 안내드리오니`, '진료 및 내원에 참고해주시길 바랍니다']
  const shape = SHAPES[notice.cards.length]
  if (!shape) return { monthText, leadLines, cards: [] }

  const rowWidth = shape.cols * shape.w + (shape.cols - 1) * shape.gap
  const x0 = (POSTER.width - rowWidth) / 2
  const inner = shape.w - CARD_PADDING
  const fit = (text: string, size: number): FittedText => ({ text, size: fitSize(text, size, inner) })
  const cards = sortCards(notice.cards).map((card, i) => ({
    x: x0 + (i % shape.cols) * (shape.w + shape.gap),
    y: shape.rows[Math.floor(i / shape.cols)],
    w: shape.w,
    headH: shape.headH,
    bodyH: shape.bodyH,
    date: fit(dateLabel(card), shape.fonts[0]),
    name: fit(card.name, shape.fonts[1]),
    status: fit(card.status, shape.fonts[2]),
  }))
  return { monthText, leadLines, cards }
}
