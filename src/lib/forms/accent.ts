import { BACKGROUND_FALLBACK_ACCENT, contrastRatio, contrastWithWhite } from './themes'

// AI 배경 그림의 강조색 뽑기 (specs/forms-themes REQ-4605 AC-4605.1~4605.4, design.md 5-1절).
// 순수 함수. 16진수 색 글자를 두지 않는다 — 대신 강조색은 themes.ts, 흰색과의 대비는 contrastWithWhite

// 강조색을 뽑을 작게 줄인 그림 크기
export const ACCENT_SAMPLE = { width: 40, height: 57 } as const

type Box = { x0: number; x1: number; y0: number; y1: number }
type Rgb = [number, number, number]
type Hsl = { h: number; s: number; l: number }

// 가운데 사각형(이 밖이 장식 구역)과 'N월' 자리 — 점의 가운데 자리 비율로 본다
const CENTER: Box = { x0: 0.1, x1: 0.9, y0: 0.1, y1: 0.8 }
const PANEL: Box = { x0: 0.3, x1: 0.7, y0: 0.1, y1: 0.19 }
const PANEL_WHITE = 0.55 // 판은 흰색 55%
const MIN_SATURATION = 0.25
const MIN_LIGHTNESS = 0.12
const MAX_LIGHTNESS = 0.88
const HUE_STEP = 15 // 색상 15°마다 한 칸(24칸)
const MIN_COLORED_PER = 50 // 색 있는 점이 장식 구역 점의 1/50(2%) 이상이어야 그 색을 쓴다
const WHITE_CONTRAST = 4.5
const PANEL_CONTRAST = 3
const DARKEN_STEP = 0.02
const LIGHTNESS_FLOOR = 0.1
const FULL = 255

const inBox = (box: Box, fx: number, fy: number) => fx >= box.x0 && fx <= box.x1 && fy >= box.y0 && fy <= box.y1

// 상자 안의 알파 0이 아닌 점마다 부른다
function eachPoint(pixels: Uint8ClampedArray, width: number, height: number, keep: (fx: number, fy: number) => boolean, visit: (rgb: Rgb) => void) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (pixels[i + 3] === 0 || !keep((x + 0.5) / width, (y + 0.5) / height)) continue
      visit([pixels[i], pixels[i + 1], pixels[i + 2]])
    }
  }
}

// [r, g, b](0~255) → '#' + 소문자 6자리(반올림)
function toHex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(Math.min(FULL, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

function fromHex(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

function hslOf([r, g, b]: Rgb): Hsl {
  const [rr, gg, bb] = [r / FULL, g / FULL, b / FULL]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const sector = max === rr ? ((gg - bb) / d + 6) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
  return { h: sector * 60, s, l }
}

function fromHsl({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor(h / 60) % 6
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector]
  return [(r + m) * FULL, (g + m) * FULL, (b + m) * FULL]
}

// 'N월' 자리(x 30~70%·y 10~19%) 평균 RGB × 0.45 + 흰색 × 0.55. 그 자리에 보이는 점이 없으면 흰색
export function panelColor(pixels: Uint8ClampedArray, width: number, height: number): string {
  const sum: Rgb = [0, 0, 0]
  let count = 0
  eachPoint(pixels, width, height, (fx, fy) => inBox(PANEL, fx, fy), (rgb) => {
    for (let c = 0; c < 3; c++) sum[c] += rgb[c]
    count++
  })
  const average: Rgb = count === 0 ? [FULL, FULL, FULL] : (sum.map((v) => v / count) as Rgb)
  return toHex(average.map((v) => v * (1 - PANEL_WHITE) + FULL * PANEL_WHITE) as Rgb)
}

// 장식 구역에서 채도 합이 가장 큰 15° 칸의 평균색. 색 있는 점이 2% 밑이면 null
function decorationColor(pixels: Uint8ClampedArray, width: number, height: number): Rgb | null {
  const bins = Array.from({ length: 360 / HUE_STEP }, () => ({ weight: 0, count: 0, sum: [0, 0, 0] as Rgb }))
  let points = 0
  let colored = 0
  eachPoint(pixels, width, height, (fx, fy) => !inBox(CENTER, fx, fy), (rgb) => {
    points++
    const { h, s, l } = hslOf(rgb)
    if (s < MIN_SATURATION || l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) return
    colored++
    const bin = bins[Math.min(bins.length - 1, Math.floor(h / HUE_STEP))]
    bin.weight += s
    bin.count++
    for (let c = 0; c < 3; c++) bin.sum[c] += rgb[c]
  })
  if (colored === 0 || colored * MIN_COLORED_PER < points) return null
  // 같으면 색상이 작은 칸(앞 칸)을 둔다
  const best = bins.reduce((top, bin) => (bin.weight > top.weight ? bin : top))
  return best.sum.map((v) => v / best.count) as Rgb
}

// HSL 밝기를 0.02씩 내려 흰색 4.5 이상·판 색 3 이상이 되면 멈춘다. 밝기 0.10이 바닥이다
function readable(start: string, panel: string): string {
  const passes = (hex: string) => contrastWithWhite(hex) >= WHITE_CONTRAST && contrastRatio(hex, panel) >= PANEL_CONTRAST
  const { h, s, l } = hslOf(fromHex(start))
  let hex = start
  for (let k = 1; !passes(hex) && l - DARKEN_STEP * (k - 1) > LIGHTNESS_FLOOR; k++) {
    hex = toHex(fromHsl({ h, s, l: Math.max(LIGHTNESS_FLOOR, l - DARKEN_STEP * k) }))
  }
  return hex
}

// 그림 점(RGBA)에서 강조색을 뽑는다. 같은 점이면 늘 같은 색('#' + 소문자 6자리)
export function pickAccent(pixels: Uint8ClampedArray, width: number, height: number): string {
  const color = decorationColor(pixels, width, height)
  const start = color === null ? BACKGROUND_FALLBACK_ACCENT : toHex(color)
  return readable(start, panelColor(pixels, width, height))
}
