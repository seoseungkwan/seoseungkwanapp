import { describe, expect, it } from 'vitest'
import { ACCENT_SAMPLE, panelColor, pickAccent } from './accent'
import { BACKGROUND_FALLBACK_ACCENT, contrastRatio, contrastWithWhite } from './themes'

// AI 배경 그림의 강조색 뽑기 (specs/forms-themes REQ-4605 AC-4605.1~4605.4, design.md 5-1절, TASK-4).
// 16진수 색 글자를 쓰지 않는다: 시험 그림은 RGBA 숫자로 만들고, 기대 색은 contrastRatio·색상 각도로 본다

const { width: W, height: H } = ACCENT_SAMPLE
type Rgba = readonly [number, number, number, number]
type Rgb = readonly [number, number, number]

// 점마다 가운데 자리의 비율(fx·fy, 0~1)과 자리(x·y)로 색을 정해 RGBA 배열을 만든다
function image(paint: (fx: number, fy: number, x: number, y: number) => Rgba, w = W, h = H): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.set(paint((x + 0.5) / w, (y + 0.5) / h, x, y), (y * w + x) * 4)
  }
  return out
}
// 가운데 사각형(x 10~90%·y 10~80%) — 그 밖이 장식 구역
const inCenter = (fx: number, fy: number) => fx >= 0.1 && fx <= 0.9 && fy >= 0.1 && fy <= 0.8
// 장식 구역 / 가운데를 따로 칠한다
const framed = (decoration: Rgba, center: Rgba) => image((fx, fy) => (inCenter(fx, fy) ? center : decoration))

const opaque = ([r, g, b]: Rgb): Rgba => [r, g, b, 255]
const WHITE: Rgba = [255, 255, 255, 255]
const BLACK: Rgba = [0, 0, 0, 255]
const GRAY: Rgba = [128, 128, 128, 255]
const PINK: Rgba = [236, 72, 153, 255] // 색상 약 330°
const BLUE: Rgba = [40, 110, 230, 255] // 색상 약 218°
const CLEAR: Rgba = [0, 0, 0, 0]

// '#rrggbb' → [r, g, b]
const channels = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb
// HSL 값: 색상 0~360, 채도·밝기 0~1
function hslOf([r, g, b]: Rgb): { h: number; s: number; l: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === rr ? ((gg - bb) / d + 6) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
  return { h: h * 60, s, l }
}
function fromHslValues(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}
const hueOf = (hex: string) => hslOf(channels(hex)).h
// 두 색상 각도의 거리(0~180)
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
const toHexText = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

const HEX6 = /^#[0-9a-f]{6}$/
const FALLBACK_HUE = hueOf(BACKGROUND_FALLBACK_ACCENT)

// 뽑은 색이 두 대비 조건을 넘는다: 흰색 4.5 이상, 판 색 3 이상
function expectReadable(accent: string, pixels: Uint8ClampedArray) {
  expect(accent).toMatch(HEX6)
  expect(contrastWithWhite(accent)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(accent, panelColor(pixels, W, H))).toBeGreaterThanOrEqual(3)
}
// 대신 색 계열: 색상이 대신 강조색과 같고(반올림 오차 3° 안) 두 조건을 넘는다
function expectFallbackSeries(accent: string, pixels: Uint8ClampedArray) {
  expectReadable(accent, pixels)
  expect(hueGap(hueOf(accent), FALLBACK_HUE)).toBeLessThanOrEqual(3)
}

describe('AC-4605.1: 장식 구역의 색에서 시작한다', () => {
  it('AC-4605.1: 작게 줄인 그림 크기 ACCENT_SAMPLE은 40×57이다', () => {
    expect(ACCENT_SAMPLE).toEqual({ width: 40, height: 57 })
  })

  it('AC-4605.1: 흰색과 이미 4.5 이상인 장식 색이면 그 평균색 그대로다(같은 15° 칸 두 색의 평균)', () => {
    const a = opaque([30, 60, 140])
    const b = opaque([50, 80, 160])
    const pixels = image((fx, fy, x) => (inCenter(fx, fy) ? WHITE : x % 2 === 0 ? a : b))
    expect(channels(pickAccent(pixels, W, H))).toEqual([40, 70, 150])
  })

  it('AC-4605.1: 채도 합이 가장 큰 15° 칸의 색을 고른다(점이 많아도 채도가 낮은 칸은 진다)', () => {
    const dull = opaque([120, 150, 120]) // 초록, 채도 약 0.11 → 색 있는 점 아님
    const mild = opaque([90, 140, 90]) // 초록, 채도 약 0.22 → 색 있는 점 아님
    const green = opaque([70, 150, 70]) // 초록, 채도 약 0.36
    const red = opaque([200, 20, 20]) // 빨강, 채도 약 0.82
    // 장식 구역의 60%는 채도 낮은 초록, 40%는 빨강
    const pixels = image((fx, fy, x) => (inCenter(fx, fy) ? WHITE : x % 5 < 3 ? green : red))
    expect(hueGap(hueOf(pickAccent(pixels, W, H)), 0)).toBeLessThanOrEqual(7.5)
    // 채도가 0.25 밑인 초록은 아무리 많아도 세지 않는다
    const weak = image((fx, fy, x) => (inCenter(fx, fy) ? WHITE : x % 10 === 0 ? red : x % 2 === 0 ? dull : mild))
    expect(hueGap(hueOf(pickAccent(weak, W, H)), 0)).toBeLessThanOrEqual(7.5)
  })

  it('AC-4605.1: 채도 합이 같으면 색상이 작은 칸이다', () => {
    const red = opaque([255, 0, 0])
    const blue = opaque([0, 0, 255])
    const pixels = image((fx, fy, x) => (inCenter(fx, fy) ? WHITE : x % 2 === 0 ? blue : red))
    expect(hueGap(hueOf(pickAccent(pixels, W, H)), 0)).toBeLessThanOrEqual(7.5)
  })

  it('AC-4605.1: 밝기 0.12~0.88 밖(아주 밝은 색·아주 어두운 색)은 색 있는 점이 아니다 → 대신 색', () => {
    const pale = opaque(fromHslValues(330, 0.9, 0.93))
    const deep = opaque(fromHslValues(120, 0.9, 0.08))
    for (const deco of [pale, deep]) {
      const pixels = framed(deco, WHITE)
      expect(pickAccent(pixels, W, H)).toBe(BACKGROUND_FALLBACK_ACCENT)
    }
  })

  it('AC-4605.1: 가운데만 색이면 가운데는 세지 않는다 → 대신 색 계열', () => {
    // 가운데 사각형 안쪽 깊숙이(x 20~80%·y 20~70%)만 분홍, 나머지는 회색
    const pixels = image((fx, fy) => (fx >= 0.2 && fx <= 0.8 && fy >= 0.2 && fy <= 0.7 ? PINK : GRAY))
    expectFallbackSeries(pickAccent(pixels, W, H), pixels)
  })

  it('AC-4605.1: 알파 0인 점은 뺀다 — 투명한 분홍 장식은 세지 않고, 투명 점만인 그림도 대신 색 계열이다', () => {
    const clearPink: Rgba = [236, 72, 153, 0]
    const ghost = framed(clearPink, WHITE)
    expectFallbackSeries(pickAccent(ghost, W, H), ghost)
    const empty = image(() => CLEAR)
    expectFallbackSeries(pickAccent(empty, W, H), empty)
  })

  it('AC-4605.1: 같은 입력이면 늘 같은 결과이고 입력 점을 바꾸지 않는다', () => {
    const pixels = framed(BLUE, BLACK)
    const copy = new Uint8ClampedArray(pixels)
    const first = pickAccent(pixels, W, H)
    expect(pickAccent(pixels, W, H)).toBe(first)
    expect(pickAccent(copy, W, H)).toBe(first)
    expect(pixels).toEqual(copy)
  })

  it('AC-4605.1: 결과는 늘 #와 소문자 16진수 6자리다(24칸·흰·검은·회색 가운데·회색뿐·투명)', () => {
    const results: string[] = []
    for (let k = 0; k < 24; k++) {
      const deco = opaque(fromHslValues(k * 15 + 7.5, 0.9, 0.6))
      for (const center of [WHITE, BLACK, GRAY]) results.push(pickAccent(framed(deco, center), W, H))
    }
    results.push(pickAccent(framed(GRAY, GRAY), W, H), pickAccent(image(() => CLEAR), W, H))
    for (const accent of results) expect(accent).toMatch(HEX6)
    expect(panelColor(framed(PINK, BLACK), W, H)).toMatch(HEX6)
  })
})

describe('AC-4605.2: 흰색 4.5·판 색 3이 될 때까지 어둡게 한다', () => {
  it('AC-4605.2: panelColor는 N월 자리(x 30~70%·y 10~19%) 평균색에 흰색을 55% 섞은 색이다', () => {
    expect(channels(panelColor(framed(WHITE, BLACK), W, H))).toEqual([140, 140, 140])
    expect(channels(panelColor(framed(BLACK, WHITE), W, H))).toEqual([255, 255, 255])
    expect(channels(panelColor(framed(BLACK, opaque([100, 200, 0])), W, H))).toEqual([185, 230, 140])
    // N월 자리 밖(같은 가운데라도 y 30% 아래)은 섞지 않는다
    const lower = image((fx, fy) => (fx >= 0.3 && fx <= 0.7 && fy >= 0.1 && fy <= 0.19 ? WHITE : BLACK))
    expect(channels(panelColor(lower, W, H))).toEqual([255, 255, 255])
  })

  it('AC-4605.2: 판 색은 N월 자리 점의 평균이다(두 색이 반씩이면 그 가운데)', () => {
    const pixels = image((fx, fy, x) => (inCenter(fx, fy) ? (x % 2 === 0 ? opaque([0, 0, 0]) : opaque([200, 100, 0])) : WHITE))
    // 평균 (100, 50, 0) × 0.45 + 255 × 0.55
    expect(channels(panelColor(pixels, W, H))).toEqual([185, 163, 140])
  })

  it('AC-4605.4: 분홍 장식·흰 가운데 → 색상 330°±15° 안·흰색과 4.5 이상', () => {
    const pixels = framed(PINK, WHITE)
    const accent = pickAccent(pixels, W, H)
    expect(hueGap(hueOf(accent), 330)).toBeLessThanOrEqual(15)
    expect(contrastRatio(accent, toHexText([255, 255, 255]))).toBeGreaterThanOrEqual(4.5)
    expectReadable(accent, pixels)
    // 시작 색(분홍)은 흰색과 4.5가 안 돼 어둡게 했다
    expect(contrastWithWhite(toHexText([236, 72, 153]))).toBeLessThan(4.5)
  })

  it('AC-4605.4: 파랑 장식·검은 가운데 → 판 색과 3 이상·흰색과 4.5 이상이고 색상은 파랑 칸 그대로', () => {
    const pixels = framed(BLUE, BLACK)
    const accent = pickAccent(pixels, W, H)
    expect(contrastRatio(accent, panelColor(pixels, W, H))).toBeGreaterThanOrEqual(3)
    expect(contrastWithWhite(accent)).toBeGreaterThanOrEqual(4.5)
    expect(hueGap(hueOf(accent), hslOf([40, 110, 230]).h)).toBeLessThanOrEqual(7.5)
    // 흰 가운데보다 더 어둡다(판이 어두워서 더 내렸다)
    const onWhite = pickAccent(framed(BLUE, WHITE), W, H)
    expect(hslOf(channels(accent)).l).toBeLessThan(hslOf(channels(onWhite)).l)
  })

  it('AC-4605.2: 24칸 어느 색이든 흰·검은·회색 가운데에서 두 조건을 넘고 색상 칸이 바뀌지 않는다', () => {
    for (let k = 0; k < 24; k++) {
      const hue = k * 15 + 7.5
      for (const lightness of [0.3, 0.6, 0.86]) {
        const deco = opaque(fromHslValues(hue, 1, lightness))
        for (const center of [WHITE, BLACK, GRAY]) {
          const pixels = framed(deco, center)
          const accent = pickAccent(pixels, W, H)
          expectReadable(accent, pixels)
          expect(hueGap(hueOf(accent), hue), `${hue}° ${lightness}`).toBeLessThanOrEqual(7.5)
          // 바닥 밝기 0.10 밑으로 내리지 않는다(반올림 오차 0.01)
          expect(hslOf(channels(accent)).l).toBeGreaterThanOrEqual(0.09)
        }
      }
    }
  })

  it('AC-4605.2: 밝기 0.10 바닥이면 어떤 색상·채도도 흰색 4.5·가장 어두운 판(검은 가운데) 3을 넘는다', () => {
    const darkest = panelColor(framed(WHITE, BLACK), W, H)
    for (let hue = 0; hue < 360; hue++) {
      for (const saturation of [0.25, 0.5, 0.75, 1]) {
        const floor = toHexText(fromHslValues(hue, saturation, 0.1))
        expect(contrastWithWhite(floor), `${hue}° ${saturation}`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(floor, darkest), `${hue}° ${saturation}`).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

describe('AC-4605.3: 색 있는 점이 2% 밑이면 대신 강조색에서 시작한다', () => {
  it('AC-4605.4: 회색뿐인 그림 → 대신 강조색(BACKGROUND_FALLBACK_ACCENT) 그대로', () => {
    const pixels = framed(GRAY, GRAY)
    expect(pickAccent(pixels, W, H)).toBe(BACKGROUND_FALLBACK_ACCENT)
    expect(pickAccent(framed(WHITE, WHITE), W, H)).toBe(BACKGROUND_FALLBACK_ACCENT)
  })

  it('AC-4605.3: 회색뿐·검은 가운데 → 대신 색에서 시작해 같은 대비 맞추기(대신 색 계열, 더 어둡게)', () => {
    const pixels = framed(GRAY, BLACK)
    const accent = pickAccent(pixels, W, H)
    expectFallbackSeries(accent, pixels)
    expect(contrastRatio(BACKGROUND_FALLBACK_ACCENT, panelColor(pixels, W, H))).toBeLessThan(3)
    expect(hslOf(channels(accent)).l).toBeLessThan(hslOf(channels(BACKGROUND_FALLBACK_ACCENT)).l)
  })

  it('AC-4605.3: 장식 구역 색 있는 점이 1%뿐이면 대신 색, 3%면 그 색', () => {
    const decoCount = (pixels: Uint8ClampedArray) => {
      let n = 0
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!inCenter((x + 0.5) / W, (y + 0.5) / H) && pixels[(y * W + x) * 4 + 3] > 0) n++
      return n
    }
    const sprinkle = (share: number) => {
      const base = framed(GRAY, WHITE)
      const want = Math.round(decoCount(base) * share)
      let placed = 0
      // 맨 위 줄(장식 구역)부터 왼쪽에서 차례로 분홍을 놓는다
      return image((fx, fy, x, y) => {
        if (inCenter(fx, fy)) return WHITE
        if (y < 3 && placed < want) {
          placed++
          return PINK
        }
        return GRAY
      })
    }
    const few = sprinkle(0.01)
    expect(pickAccent(few, W, H)).toBe(BACKGROUND_FALLBACK_ACCENT)
    const some = sprinkle(0.03)
    expect(hueGap(hueOf(pickAccent(some, W, H)), 330)).toBeLessThanOrEqual(15)
  })
})
