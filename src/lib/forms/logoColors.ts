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

// ---------- 로고 색 칩·흰 바탕 위 색 (spec form-style REQ-6802·REQ-6803, design.md 3절) ----------

const SWATCH_MAX = 4 // 칩은 4개까지
const SWATCH_DISTANCE = 60 // 이미 고른 색 모두와 R·G·B 거리가 이 이상이어야 고른다
const SWATCH_LIGHT = 200 // R·G·B 가장 작은 값이 이 이상이면 글자로 쓰기엔 옅은 점
const ON_WHITE = 3 // 흰 바탕 위 글자 대비

// '#rrggbb' → [r, g, b]
const rgbOf = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// 로고 그림 점(RGBA, 가로 width·세로 height)에서 색 고르기 칩을 최대 4개 뽑는다(AC-6802.1). 같은 점이면 늘 같은 결과, 남는 점이 없으면 빈 목록.
// 투명한 점(128 미만)·옅은 점을 빼고 R·G·B 각 위 4비트로 묶어, 점이 많은 묶음부터(같으면 묶음 번호 차례) 평균색이 고른 것들과 멀면 고른다
export function logoSwatches(rgba: Uint8ClampedArray, width: number, height: number): string[] {
  const groups = new Map<number, { key: number; count: number; sum: Rgb }>()
  const points = Math.min(width * height, Math.floor(rgba.length / 4))
  for (let p = 0; p < points; p++) {
    const i = p * 4
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
    if (a < MIN_ALPHA || Math.min(r, g, b) >= SWATCH_LIGHT) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    let group = groups.get(key)
    if (group === undefined) {
      group = { key, count: 0, sum: [0, 0, 0] }
      groups.set(key, group)
    }
    group.count++
    group.sum[0] += r
    group.sum[1] += g
    group.sum[2] += b
  }
  const picked: Rgb[] = []
  const ordered = [...groups.values()].sort((x, y) => y.count - x.count || x.key - y.key)
  for (const group of ordered) {
    if (picked.length === SWATCH_MAX) break
    const color = group.sum.map((v) => Math.round(v / group.count)) as Rgb
    if (picked.every((other) => distance(color, other) >= SWATCH_DISTANCE)) picked.push(color)
  }
  return picked.map(toHex)
}

// 흰 바탕 위 글자로 읽히는 색(AC-6803.3): 흰색과의 대비가 ratio 이상이면 그대로, 아니면 색상·채도는 두고
// HSL 밝기를 0.02씩 낮춰 ratio 이상이 되는 첫 색(밝기 0까지). '#' + 소문자 16진수 6자리
export function onWhite(hex: string, ratio = ON_WHITE): string {
  if (contrastWithWhite(hex) >= ratio) return hex
  const base = hslOf(rgbOf(hex))
  let out = hex
  for (let l = base.l; l > DARKEST; ) {
    l = Math.max(DARKEST, l - STEP)
    out = toHex(fromHsl({ ...base, l }))
    if (contrastWithWhite(out) >= ratio) return out
  }
  return out
}
