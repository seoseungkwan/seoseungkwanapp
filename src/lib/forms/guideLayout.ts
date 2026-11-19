import type { GuideContent, GuideProblems } from '@/types/formGuide'
import { DEFAULT_STYLE, scaled, type FormStyle } from './style'

// 서식 탭 환자 안내문 그림(A4 세로 794×1123)의 배치 (specs/forms-guide design.md 4절, AC-4503).
// 값은 승인 시안 docs/mockups/forms-guide/index.html의 emOf()·measure()·fit()·layout()과 같다.
// 글자는 한 줄짜리만 그린다(줄바꿈 없음). 넘치면 최소 크기까지 줄이고, 그래도 넘치면 그 칸 열쇠에 까닭을 붙인다.
// 빈 칸 금지·윗줄만·강조 낱말·줄 없음 같은 칸 규칙 까닭은 lib/forms/guide.ts(checkGuide) 몫이다

// 세 구역: 노랑 0~bandY, 진회색 띠 bandY~logoY(288), 흰 로고 칸 logoY~height(169). 글자는 x부터 안쪽 폭 inner. 띠 안 글은 bandEnd(logoY − 16)까지
export const GUIDE_PAGE = { width: 794, height: 1123, x: 51, inner: 692, bandY: 666, logoY: 954, bandEnd: 938 } as const
// 병원 로고(가로형 1033×175)를 400 폭으로, 로고 칸 가운데. 크기 모르는 로고 그림·병원 이름 글자·옛 로고 그림이 쓴다(spec logo-fit AC-6703.3·AC-6703.5)
export const GUIDE_LOGO = { x: 197, y: 1005, width: 400, height: 68 } as const
// 크기를 아는 로고 그림의 자리(spec logo-fit design.md 4절, AC-6703.2): 가운데 397·1039(GUIDE_LOGO와 같다), 흰 로고 칸 954~1123에서 위 30·아래 29 띄움
export const GUIDE_LOGO_AREA = { x: 197, y: 984, width: 400, height: 110 } as const
// 로고 크기(%)를 키워도 넘지 않는 최대 폭·높이 — 글자 안쪽 폭 692, 흰 로고 칸 169 안(spec form-style AC-6804.5)
export const GUIDE_LOGO_MAX = { width: 692, height: 140 } as const
// 그림 170×170: 오른쪽 여백 58, 윗단 바닥에서 28 위
const PICTURE = { x: 566, y: 468, size: 170 } as const

const { x: X, inner: INNER } = GUIDE_PAGE
const BIG_SPACING = -0.03 // 작은 제목·큰 문구 자간(em)
const PILL = { y: 41, h: 65, pad: 58 } as const // 머리표 알약: 폭 = 글 폭 + 좌우 안쪽 29씩
const BOX = { bottom: 621, gap: 16, pad: 66, text: 33 } as const // 흰 상자: 아래 끝, 그림과 사이, 폭 = 글 폭 + 66, 글 x = 상자 x + 33
const COL_GAP = 13 // 두 열 사이
const COL_W = (INNER - COL_GAP) / 2 // 339.5
const ROW = { check: { base: 59.5, min: 44 }, number: { base: 67, min: 54 } } as const
const NOTE_H = 11.5 + 31 // 아래 작은 글 블록 높이
// 큰 문구 처음 크기 × 제목 %의 한도(spec form-style AC-6804.3): 보통 두 줄·'윗줄 작게' 윗줄·아랫줄
const BIG_MAX = 120
const SMALL_TOP_MAX = 88
const SMALL_BOTTOM_MAX = 165

const TOO_LONG = '한 줄에 들어가지 않아요. 줄여 주세요'
const BAND_OVER = '띠에 다 들어가지 않아요. 줄을 하나 빼거나, 띠 제목·아래 작은 글을 비워 주세요'

export type Fitted = { text: string; size: number; x: number; y: number } // y는 글 가운데(dominant-baseline central)
export type GuideLayout = {
  pill: { x: number; y: number; w: number; h: number; text: Fitted } // text.x는 알약 가운데(text-anchor middle)
  subtitle: Fitted
  big: [Fitted, Fitted]
  box: { x: number; y: number; w: number; h: number; top: Fitted | null; bottom: Fitted } | null
  picture: { x: number; y: number; size: number } | null
  bandTitle: Fitted | null
  // markX: 줄 표시 왼쪽 끝. 체크는 ✓ 글자 크기가 markSize, 번호는 지름 circle의 노랑 원 + 원 안 숫자 크기 markSize
  rows: { n: number; markX: number; markSize: number; circle: number | null; text: Fitted; em: string }[]
  note: Fitted | null
  twoCols: boolean
  problems: GuideProblems
}

// 글자 하나의 어림 폭(em): 안내문 글꼴 Black(900)의 실제 글자 폭을 조금 넉넉하게 올린 표 (design.md 4절)
function emOf(ch: string): number {
  if (/[ㄱ-힣一-鿿]/.test(ch)) return 0.87
  if (/[0-9]/.test(ch)) return 0.71
  if (/[MW]/.test(ch)) return 0.95
  if (/[A-Z]/.test(ch)) return 0.8
  if (/[a-z]/.test(ch)) return 0.62
  if (ch === ' ') return 0.22
  if (/[,.·:;'!]/.test(ch)) return 0.31
  if (ch === '"') return 0.38
  if (ch === '(' || ch === ')') return 0.43
  if (ch === '~' || ch === '-') return 0.68
  return 0.9 // ※ ✓ % 와 그 밖
}

// (Σ em + 자간 × 글자 수) × 크기
export function guideTextWidth(text: string, size: number, spacing = 0): number {
  let em = 0
  let count = 0
  for (const ch of text) {
    em += emOf(ch)
    count += 1
  }
  return (em + spacing * count) * size
}

// start에서 1px씩 줄여 room 안에 들면 그 크기. min 아래로는 줄이지 않고, min에서도 넘으면 ok: false
export function fitGuide(text: string, start: number, min: number, room: number, spacing = 0): { size: number; ok: boolean } {
  let size = start
  while (size > min && guideTextWidth(text, size, spacing) > room) size -= 1
  return { size, ok: guideTextWidth(text, size, spacing) <= room }
}

const fitted = (text: string, size: number, x: number, y: number): Fitted => ({ text, size, x, y })
const filled = (value: string) => value.trim() !== ''

// 빈 글 칸·빈 줄도 배치는 한다(빈 줄은 그리지 않는다).
// 글씨 크기(c.style, spec form-style AC-6804.3·AC-6804.4): 큰 문구·띠 줄 글의 처음 크기만 바꾸고 가장 작은 크기·까닭 규칙은 그대로다. 처음대로면 지금과 같다
export function layoutGuide(c: GuideContent & { style?: FormStyle }): GuideLayout {
  const { titleScale, bodyScale } = c.style ?? DEFAULT_STYLE
  const problems: GuideProblems = {}
  const say = (key: string, message: string) => {
    if (problems[key] === undefined) problems[key] = message
  }

  // 머리표 알약: 37 → 30
  const tag = fitGuide(c.tag, 37, 30, INNER - PILL.pad)
  if (!tag.ok) say('tag', '머리표가 한 줄에 들어가지 않아요. 줄여 주세요')
  const pillW = Math.min(INNER, Math.ceil(guideTextWidth(c.tag, tag.size)) + PILL.pad)
  const pill = { x: X, y: PILL.y, w: pillW, h: PILL.h, text: fitted(c.tag, tag.size, X + pillW / 2, PILL.y + PILL.h / 2) }

  // 작은 제목: 67 → 56
  const sub = fitGuide(c.subtitle, 67, 56, INNER, BIG_SPACING)
  if (!sub.ok) say('subtitle', '작은 제목이 한 줄에 들어가지 않아요. 줄여 주세요')
  const subtitle = fitted(c.subtitle, sub.size, X, 161.5)

  // 큰 문구 두 줄: 보통은 109 → 72에서 두 줄 같은 크기(작은 쪽), '윗줄 작게'면 윗줄 80 → 56 · 아랫줄 150 → 72 따로.
  // 처음 크기는 제목 %를 곱하고 한도(120·88·165)로 묶는다
  let big: [Fitted, Fitted]
  if (c.firstSmall) {
    const a = fitGuide(c.big1, Math.min(scaled(80, titleScale), SMALL_TOP_MAX), 56, INNER, BIG_SPACING)
    const b = fitGuide(c.big2, Math.min(scaled(150, titleScale), SMALL_BOTTOM_MAX), 72, INNER, BIG_SPACING)
    if (!a.ok) say('big1', TOO_LONG)
    if (!b.ok) say('big2', TOO_LONG)
    big = [fitted(c.big1, a.size, X, 252), fitted(c.big2, b.size, X, 381)]
  } else {
    const start = Math.min(scaled(109, titleScale), BIG_MAX)
    const a = fitGuide(c.big1, start, 72, INNER, BIG_SPACING)
    const b = fitGuide(c.big2, start, 72, INNER, BIG_SPACING)
    if (!a.ok) say('big1', TOO_LONG)
    if (!b.ok) say('big2', TOO_LONG)
    const size = Math.min(a.size, b.size)
    big = [fitted(c.big1, size, X, 260), fitted(c.big2, size, X, 382)]
  }

  // 흰 상자(아랫줄이 있을 때만): 윗줄 24 → 20(700), 아랫줄 40 → 30. 그림이 있으면 오른쪽 끝이 그림 왼쪽 − 16
  let box: GuideLayout['box'] = null
  if (filled(c.boxBottom)) {
    const maxW = c.picture ? PICTURE.x - BOX.gap - X : INNER
    const room = maxW - BOX.pad
    const tooWide = c.picture ? '그림 옆 상자에 들어가지 않아요. 줄이거나 그림을 빼 주세요' : '상자에 들어가지 않아요. 줄여 주세요'
    const top = filled(c.boxTop) ? fitGuide(c.boxTop, 24, 20, room) : null
    const bottom = fitGuide(c.boxBottom, 40, 30, room)
    if (top && !top.ok) say('boxTop', tooWide)
    if (!bottom.ok) say('boxBottom', tooWide)
    const textW = Math.max(top ? guideTextWidth(c.boxTop, top.size) : 0, guideTextWidth(c.boxBottom, bottom.size))
    const h = top ? 124 : 92
    const y = BOX.bottom - h
    box = {
      x: X,
      y,
      w: Math.min(maxW, Math.ceil(textW) + BOX.pad),
      h,
      top: top ? fitted(c.boxTop, top.size, X + BOX.text, y + 36.5) : null,
      bottom: fitted(c.boxBottom, bottom.size, X + BOX.text, y + (top ? 78 : 46)),
    }
  }
  const picture = c.picture ? { ...PICTURE } : null

  // 띠: 위 여백 24, 띠 제목(있으면) 35 → 28 · 줄 45.5 + 9, 줄들, 아래 작은 글(있으면) 11.5 + 31, 아래 여백 16
  let y: number = GUIDE_PAGE.bandY + 24
  let bandTitle: Fitted | null = null
  if (filled(c.bandTitle)) {
    const f = fitGuide(c.bandTitle, 35, 28, INNER)
    if (!f.ok) say('bandTitle', '띠 제목이 한 줄에 들어가지 않아요. 줄여 주세요')
    bandTitle = fitted(c.bandTitle, f.size, X, y + 22.75)
    y += 45.5 + 9
  }
  // 빈 줄은 그리지 않지만, 까닭 열쇠(line<i>)는 원래 자리 번호를 쓴다
  const lines = c.lines.map((line, index) => ({ ...line, index })).filter((line) => filled(line.text))
  const noteH = filled(c.note) ? NOTE_H : 0
  const avail = GUIDE_PAGE.bandEnd - y - noteH
  const check = c.mark === 'check'
  // 두 열: 체크이고 줄 2개 이상이고 모든 줄이 34px로 반 칸의 글자 자리(339.5 − 43) 안
  const twoCols = check && lines.length >= 2 && lines.every((line) => guideTextWidth(line.text, 34) <= COL_W - 43)
  const rowCount = Math.max(1, twoCols ? Math.ceil(lines.length / 2) : lines.length)
  const { base, min } = check ? ROW.check : ROW.number
  // 줄 높이는 기본에서 남은 높이 / 줄 수까지 줄이고, 최소보다 작으면 까닭을 붙이고 최소로 그린다
  let rowH = Math.min(base, avail / rowCount)
  if (rowH < min) {
    say('band', BAND_OVER)
    rowH = min
  }
  // 줄 글 처음 크기 × 본문 %: 체크는 줄 높이 / 1.35까지, 번호는 키울 때만 max(35, 줄 높이 / 1.35)까지
  const fit = Math.floor(rowH / 1.35)
  const numberSize = scaled(35, bodyScale)
  const font = check ? Math.min(scaled(34, bodyScale), fit) : bodyScale <= 100 ? numberSize : Math.min(numberSize, Math.max(35, fit))
  const circle = Math.min(49, rowH - 8)
  const checkSize = font + 2
  const checkW = 0.855 * checkSize
  const rows = lines.map((line, i) => {
    const row = twoCols ? Math.floor(i / 2) : i
    const col = twoCols ? i % 2 : 0
    const x0 = X + col * (COL_W + COL_GAP)
    const textX = check ? x0 + checkW + 12 : X + circle + 17
    const room = check ? (twoCols ? COL_W : INNER) - checkW - 12 : INNER - circle - 17
    const f = fitGuide(line.text, font, 26, room)
    if (!f.ok) say(`line${line.index}`, TOO_LONG)
    return {
      n: i + 1,
      markX: check ? x0 : X,
      markSize: check ? checkSize : Math.round(circle * 0.63),
      circle: check ? null : circle,
      text: fitted(line.text, f.size, textX, y + rowH * (row + 0.5)),
      em: line.text.includes(line.em) ? line.em : '', // 그 줄 안에 없는 강조는 그리지 않는다(까닭은 칸 검사가 붙인다)
    }
  })

  // 아래 작은 글: '※ ' + 글, 24 → 20(700), 줄들 끝 + 11.5 + 15.5(가운데)
  let note: Fitted | null = null
  if (noteH) {
    const text = `※ ${c.note.trim()}`
    const f = fitGuide(text, 24, 20, INNER)
    if (!f.ok) say('note', '아래 작은 글이 한 줄에 들어가지 않아요. 줄여 주세요')
    const bandRows = twoCols ? Math.ceil(lines.length / 2) : lines.length
    note = fitted(text, f.size, X, y + bandRows * rowH + 11.5 + 15.5)
  }

  return { pill, subtitle, big, box, picture, bandTitle, rows, note, twoCols, problems }
}
