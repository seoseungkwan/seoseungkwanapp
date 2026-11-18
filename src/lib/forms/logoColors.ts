import { contrastRatio, contrastWithWhite } from './themes'

// 병원 로고 그림의 점에서 환자 안내문 두 색 뽑기 (spec clinic-profile REQ-6604 AC-6604.4·AC-6604.5, design.md 6절).
// 순수 함수. accent.ts와 같은 색상 칸 나누기: 투명·흰색·검은색·회색에 가까운 점을 빼고 15° 칸 24개 중 점이 가장 많은 칸의 평균색이
// 바탕색(main, 노란 윗단 자리), 같은 색상의 아주 진한 색이 띠 색(dark, 진회색 띠 자리)이다. 16진수 색 글자를 두지 않는다

// 안내문 두 색('#' + 소문자 16진수 6자리)
export type GuideColors = { main: string; dark: string }

type Rgb = [number, number, number]
type Hsl = { h: number; s: number; l: number }

const FULL = 255
const MIN_ALPHA = 128 // 이보다 투명한 점은 보이지 않는 점(세지 않는다)
const MIN_SATURATION = 0.25
const MIN_LIGHTNESS = 0.12
const MAX_LIGHTNESS = 0.88
const HUE_STEP = 15 // 색상 15°마다 한 칸(24칸)
const MIN_COLORED_PER = 50 // 색 있는 점이 보이는 점의 1/50(2%) 이상이어야 그 색을 쓴다
const DARK_SATURATION = 0.35
const DARK_LIGHTNESS = 0.16
const CONTRAST = 4.5
const STEP = 0.02 // 밝히기·어둡게 하기 한 번에 바꾸는 밝기
const LIGHTEST = 0.97
const DARKEST = 0

// [r, g, b](0~255) → '#' + 소문자 6자리(반올림)
function toHex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(Math.min(FULL, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
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

// 점이 가장 많은 15° 칸의 평균색. 색 있는 점이 보이는 점의 2% 밑이면 null
function mainColor(rgba: Uint8ClampedArray, width: number, height: number): Rgb | null {
  const bins = Array.from({ length: 360 / HUE_STEP }, () => ({ count: 0, sum: [0, 0, 0] as Rgb }))
  const points = Math.min(width * height, Math.floor(rgba.length / 4))
  let visible = 0
  let colored = 0
  for (let p = 0; p < points; p++) {
    const i = p * 4
    if (rgba[i + 3] < MIN_ALPHA) continue
    visible++
    const rgb: Rgb = [rgba[i], rgba[i + 1], rgba[i + 2]]
    const { h, s, l } = hslOf(rgb)
    if (s < MIN_SATURATION || l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) continue
    colored++
    const bin = bins[Math.min(bins.length - 1, Math.floor(h / HUE_STEP))]
    bin.count++
    for (let c = 0; c < 3; c++) bin.sum[c] += rgb[c]
  }
  if (colored === 0 || colored * MIN_COLORED_PER < visible) return null
  // 같으면 색상이 작은 칸(앞 칸)을 둔다
  const best = bins.reduce((top, bin) => (bin.count > top.count ? bin : top))
  return best.sum.map((v) => v / best.count) as Rgb
}

// 바탕색 글자(띠 위 강조·체크)·진한 글자(노란 윗단 위)·흰 글자(띠 위 줄)가 모두 읽히는지(대비 4.5 이상)
export function readableColors({ main, dark }: GuideColors): boolean {
  return contrastRatio(main, dark) >= CONTRAST && contrastWithWhite(dark) >= CONTRAST
}

// 로고 그림 점(RGBA, 가로 width·세로 height)에서 두 색을 뽑는다. 같은 점이면 늘 같은 색, 쓸 색이 없으면 null.
// 띠 색과 바탕색의 대비가 모자라면 바탕색을 밝히고(색상·채도는 그대로), 그래도 모자라거나 흰 글자가 묻히면 띠 색을 어둡게 한다
export function logoPalette(rgba: Uint8ClampedArray, width: number, height: number): GuideColors | null {
  const color = mainColor(rgba, width, height)
  if (color === null) return null
  const base = hslOf(color)
  let main = toHex(color)
  const darkOf = (l: number) => toHex(fromHsl({ h: base.h, s: DARK_SATURATION, l }))
  let darkLightness = DARK_LIGHTNESS
  let dark = darkOf(darkLightness)
  for (let l = base.l; contrastRatio(main, dark) < CONTRAST && l < LIGHTEST; ) {
    l = Math.min(LIGHTEST, l + STEP)
    main = toHex(fromHsl({ ...base, l }))
  }
  while (!readableColors({ main, dark }) && darkLightness > DARKEST) {
    darkLightness = Math.max(DARKEST, darkLightness - STEP)
    dark = darkOf(darkLightness)
  }
  return { main, dark }
}
