import { describe, expect, it } from 'vitest'
import { logoPalette, logoSwatches, onWhite, readableColors, type GuideColors } from './logoColors'
import { contrastRatio, contrastWithWhite } from './themes'

// 병원 로고 그림의 점에서 환자 안내문 두 색(바탕색 main·띠 색 dark) 뽑기 (spec clinic-profile REQ-6604 AC-6604.4, design.md 6절).
// 순수 함수라 점 배열만 넣어 본다. 점은 지어낸 값이다(실제 로고 그림이 아니다)

type Px = [number, number, number, number]
const many = (px: Px, n: number): Px[] => Array.from({ length: n }, () => px)
// 한 줄짜리 그림(가로 = 점 수, 세로 1)
const paletteOf = (pixels: Px[]) => logoPalette(Uint8ClampedArray.from(pixels.flat()), pixels.length, 1)

// 시험 쪽 HSL(0~360, 0~1, 0~1)
function hslOf(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const sector = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: sector * 60, s, l }
}
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
const WHITE = '#ffffff'

const BLUE: Px = [31, 95, 191, 255]
const WHITE_PX: Px = [255, 255, 255, 255]

describe('AC-6604.4: logoPalette — 투명·흰색·검은색·회색 점은 뺀다', () => {
  it('AC-6604.4: 투명(알파 128 미만)·흰색·검은색·회색에 가까운 점만 있으면 null이다', () => {
    expect(
      paletteOf([
        ...many([31, 95, 191, 0], 10), // 투명한 파랑
        ...many([31, 95, 191, 127], 10), // 거의 투명한 파랑
        ...many(WHITE_PX, 10),
        ...many([240, 240, 232, 255], 10), // 밝기 0.88 넘음
        ...many([10, 10, 10, 255], 10), // 검정
        ...many([30, 12, 12, 255], 10), // 밝기 0.12 아래
        ...many([128, 128, 128, 255], 10), // 회색
        ...many([140, 128, 120, 255], 10), // 채도 0.25 아래
      ]),
    ).toBeNull()
  })

  it('AC-6604.4: 빈 그림·모두 투명한 그림은 null이다', () => {
    expect(logoPalette(new Uint8ClampedArray(0), 0, 0)).toBeNull()
    expect(paletteOf(many([0, 0, 0, 0], 20))).toBeNull()
  })

  it('AC-6604.4: 알파 128 이상인 색 점은 센다(128은 들고 127은 빠진다)', () => {
    expect(paletteOf(many([31, 95, 191, 128], 4))).not.toBeNull()
    expect(paletteOf(many([31, 95, 191, 127], 4))).toBeNull()
  })
})

describe('AC-6604.4: logoPalette — 색 있는 점이 2% 미만이면 null', () => {
  it('AC-6604.4: 보이는 점 50개 중 색 점 1개(2%)면 색을 주고, 51개 중 1개(2% 미만)면 null이다', () => {
    expect(paletteOf([BLUE, ...many(WHITE_PX, 49)])).not.toBeNull()
    expect(paletteOf([BLUE, ...many(WHITE_PX, 50)])).toBeNull()
  })

  it('AC-6604.4: 투명한 점은 2%를 셀 때 들지 않는다(투명 바탕 로고)', () => {
    expect(paletteOf([BLUE, ...many(WHITE_PX, 49), ...many([255, 255, 255, 0], 500)])).not.toBeNull()
  })

  it('AC-6604.4: 가로·세로가 점 수를 정한다(2×2 그림)', () => {
    const data = Uint8ClampedArray.from([...BLUE, ...BLUE, ...BLUE, ...BLUE])
    expect(logoPalette(data, 2, 2)).toEqual(logoPalette(data, 4, 1))
  })
})

describe('AC-6604.4: logoPalette — 가장 많은 색상 칸의 평균색이 바탕색, 같은 색상의 아주 진한 색이 띠 색', () => {
  it('AC-6604.4: 바탕색은 가장 많은 15° 칸 점들의 평균색이다(대비가 넉넉하면 그대로)', () => {
    // 노랑 두 가지(색상 58° 근처, 같은 칸)의 평균 = (220, 214, 16)
    expect(paletteOf([...many([230, 224, 6, 255], 5), ...many([210, 204, 26, 255], 5)])?.main).toBe('#dcd610')
    expect(paletteOf(many([230, 224, 6, 255], 3))?.main).toBe('#e6e006')
  })

  it('AC-6604.4: 점이 더 많은 색상 칸이 이긴다(빨강 30 · 노랑 20 → 빨강 계열, 노랑 30 · 빨강 20 → 노랑)', () => {
    const red: Px = [220, 40, 40, 255]
    const yellow: Px = [230, 224, 6, 255]
    expect(hueGap(hslOf(paletteOf([...many(red, 30), ...many(yellow, 20)])!.main).h, 0)).toBeLessThan(3)
    expect(paletteOf([...many(red, 20), ...many(yellow, 30)])!.main).toBe('#e6e006')
  })

  it('AC-6604.4: 띠 색은 바탕색과 같은 색상에 채도 0.35·밝기 0.16이다(대비가 넉넉할 때)', () => {
    const colors = paletteOf(many([230, 224, 6, 255], 3))!
    const main = hslOf(colors.main)
    const dark = hslOf(colors.dark)
    expect(hueGap(dark.h, main.h)).toBeLessThan(3)
    expect(dark.s).toBeCloseTo(0.35, 1)
    expect(dark.l).toBeCloseTo(0.16, 2)
  })

  it("AC-6604.4: 두 색은 '#' + 소문자 16진수 6자리이고, 같은 점이면 늘 같은 색이며 받은 점을 고치지 않는다", () => {
    const pixels = Uint8ClampedArray.from([...many(BLUE, 6), ...many(WHITE_PX, 6)].flat())
    const before = Uint8ClampedArray.from(pixels)
    const a = logoPalette(pixels, 12, 1)
    const b = logoPalette(pixels, 12, 1)
    expect(a).toEqual(b)
    expect(a!.main).toMatch(/^#[0-9a-f]{6}$/)
    expect(a!.dark).toMatch(/^#[0-9a-f]{6}$/)
    expect(Object.keys(a!).sort()).toEqual(['dark', 'main'])
    expect(pixels).toEqual(before)
  })
})

describe('AC-6604.4: logoPalette — 대비 4.5 맞추기', () => {
  it('AC-6604.4: 진한 로고색이면 띠 색(진한 글자)과의 대비가 4.5가 될 때까지 바탕색을 밝힌다(색상·채도는 그대로)', () => {
    const start = '#1e3c8c' // (30, 60, 140): 진한 파랑
    const colors = paletteOf(many([30, 60, 140, 255], 4))!
    expect(contrastRatio(colors.main, colors.dark)).toBeGreaterThanOrEqual(4.5)
    const before = hslOf(start)
    const after = hslOf(colors.main)
    expect(after.l).toBeGreaterThan(before.l)
    expect(hueGap(after.h, before.h)).toBeLessThan(3)
    expect(after.s).toBeCloseTo(before.s, 1)
  })

  it.each(Array.from({ length: 24 }, (_, i) => [i * 15] as const))(
    'AC-6604.4: 색상 %i° 로고(진한·보통·밝은 셋)도 바탕색 글자·흰 글자와 띠 색의 대비가 4.5 이상이다',
    (hue) => {
      for (const [s, l] of [[0.9, 0.2], [0.7, 0.45], [0.5, 0.8]] as const) {
        const c = (1 - Math.abs(2 * l - 1)) * s
        const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
        const m = l - c / 2
        const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60) % 6]
        const px: Px = [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), 255]
        const colors = paletteOf(many(px, 4))
        expect(colors, `${hue}° ${s} ${l}`).not.toBeNull()
        expect(contrastRatio(colors!.main, colors!.dark), `${hue}° ${s} ${l} 바탕색↔띠 색`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(WHITE, colors!.dark), `${hue}° ${s} ${l} 흰 글자↔띠 색`).toBeGreaterThanOrEqual(4.5)
        expect(readableColors(colors!)).toBe(true)
      }
    },
  )
})

describe('AC-6604.5: readableColors — 직접 고른 두 색의 대비 검사', () => {
  it('AC-6604.5: 바탕색↔띠 색, 흰 글자↔띠 색이 모두 4.5 이상이면 참이다(지금 색 노랑·진회색 포함)', () => {
    const ok: GuideColors[] = [
      { main: '#e6e006', dark: '#2e2e2e' },
      { main: '#ffffff', dark: '#000000' },
      { main: '#9fc3ff', dark: '#1b2740' },
    ]
    for (const colors of ok) expect(readableColors(colors), JSON.stringify(colors)).toBe(true)
  })

  it('AC-6604.5: 바탕색이 어둡거나(진한 글자가 묻힘) 띠 색이 밝으면(흰 글자가 묻힘) 거짓이다', () => {
    const bad: GuideColors[] = [
      { main: '#555555', dark: '#2e2e2e' }, // 바탕색↔띠 색 부족
      { main: '#ffffff', dark: '#999999' }, // 흰 글자↔띠 색 부족
      { main: '#e6e006', dark: '#e6e006' },
    ]
    for (const colors of bad) expect(readableColors(colors), JSON.stringify(colors)).toBe(false)
  })
})

// ---------- 로고 색 칩 (spec form-style REQ-6802 AC-6802.1·AC-6802.2, design.md 3절, TASK-3) ----------

const swatchesOf = (pixels: Px[]) => logoSwatches(Uint8ClampedArray.from(pixels.flat()), pixels.length, 1)
const RED: Px = [220, 30, 30, 255] // 묶음 번호 13<<8 | 1<<4 | 1 = 3345
const BLUE2: Px = [30, 60, 200, 255] // 1<<8 | 3<<4 | 12 = 316
const GREEN: Px = [30, 160, 60, 255] // 1<<8 | 10<<4 | 3 = 419

describe('AC-6802.1: logoSwatches — 투명한 점·옅은 점은 뺀다', () => {
  it('AC-6802.1: 불투명도 128 미만인 점과 R·G·B 가장 작은 값이 200 이상인 점만 있으면 빈 목록이다', () => {
    expect(
      swatchesOf([
        ...many([31, 95, 191, 0], 5),
        ...many([31, 95, 191, 127], 5),
        ...many(WHITE_PX, 5),
        ...many([200, 200, 200, 255], 5),
        ...many([210, 220, 250, 255], 5),
      ]),
    ).toEqual([])
  })

  it('AC-6802.1: 불투명도 128은 들고, 가장 작은 값 199는 든다(회색·검정도 옅지만 않으면 칩이 된다)', () => {
    expect(swatchesOf([[31, 95, 191, 128]])).toEqual(['#1f5fbf'])
    expect(swatchesOf([[199, 255, 255, 255]])).toEqual(['#c7ffff'])
    expect(swatchesOf([[128, 128, 128, 255]])).toEqual(['#808080'])
    expect(swatchesOf([[10, 10, 10, 255]])).toEqual(['#0a0a0a'])
  })
})

describe('AC-6802.1: logoSwatches — 위 4비트 묶음, 점이 많은 묶음부터, 평균색(반올림)', () => {
  it('AC-6802.1: 같은 묶음(R·G·B 각 위 4비트가 같은) 점들은 평균색 하나가 된다(반올림)', () => {
    // (16, 32, 48)과 (31, 47, 63)은 같은 묶음(1, 2, 3) → 평균 (23.5, 39.5, 55.5) → (24, 40, 56)
    expect(swatchesOf([[16, 32, 48, 255], [31, 47, 63, 255]])).toEqual(['#182838'])
    // (32, 32, 48)은 다른 묶음(2, 2, 3)이지만 첫 칩과 거리가 60 미만이라 칩이 되지 않는다
    expect(swatchesOf([[16, 32, 48, 255], [16, 32, 48, 255], [32, 32, 48, 255]])).toEqual(['#102030'])
  })

  it('AC-6802.1: 점이 많은 묶음부터 낸다(파랑 5 · 초록 4 · 빨강 3)', () => {
    expect(swatchesOf([...many(RED, 3), ...many(BLUE2, 5), ...many(GREEN, 4)])).toEqual(['#1e3cc8', '#1ea03c', '#dc1e1e'])
    expect(swatchesOf([...many(BLUE2, 1), ...many(RED, 6), ...many(GREEN, 2)])).toEqual(['#dc1e1e', '#1ea03c', '#1e3cc8'])
  })

  it('AC-6802.1: 점 수가 같으면 묶음 번호가 작은 차례다(파랑 316 → 초록 419 → 빨강 3345, 넣은 차례와 상관없다)', () => {
    expect(swatchesOf([...many(RED, 2), ...many(GREEN, 2), ...many(BLUE2, 2)])).toEqual(['#1e3cc8', '#1ea03c', '#dc1e1e'])
    expect(swatchesOf([GREEN, RED, BLUE2])).toEqual(['#1e3cc8', '#1ea03c', '#dc1e1e'])
  })
})

describe('AC-6802.1: logoSwatches — 이미 고른 색 모두와 거리 60 이상, 4개까지', () => {
  const A: Px = [100, 100, 100, 255]

  it('AC-6802.1: 거리가 정확히 60이면 고르고, 59면 건너뛴다', () => {
    expect(swatchesOf([...many(A, 5), ...many([160, 100, 100, 255], 4)])).toEqual(['#646464', '#a06464'])
    expect(swatchesOf([...many(A, 5), ...many([159, 100, 100, 255], 4)])).toEqual(['#646464'])
  })

  it('AC-6802.1: 첫째와는 멀어도 이미 고른 다른 색과 가까우면 건너뛴다', () => {
    // (200, 100, 130)은 A와 거리 104지만 (160, 100, 100)과는 50
    expect(swatchesOf([...many(A, 5), ...many([160, 100, 100, 255], 4), ...many([200, 100, 130, 255], 3)])).toEqual(['#646464', '#a06464'])
  })

  it('AC-6802.1: 칩은 4개까지다(다섯째 묶음은 내지 않는다)', () => {
    const out = swatchesOf([...many([10, 10, 10, 255], 9), ...many(RED, 8), ...many(BLUE2, 7), ...many(GREEN, 6), ...many([190, 190, 10, 255], 5)])
    expect(out).toEqual(['#0a0a0a', '#dc1e1e', '#1e3cc8', '#1ea03c'])
  })

  it("AC-6802.1: 칩은 '#' + 소문자 16진수 6자리이고, 같은 점이면 늘 같은 결과이며 받은 점을 고치지 않는다", () => {
    const pixels = Uint8ClampedArray.from([...many(RED, 3), ...many(BLUE2, 2), ...many([250, 170, 10, 255], 4), ...many(WHITE_PX, 9)].flat())
    const before = Uint8ClampedArray.from(pixels)
    const a = logoSwatches(pixels, 18, 1)
    expect(a).toEqual(logoSwatches(pixels, 18, 1))
    expect(a).toHaveLength(3)
    for (const hex of a) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(pixels).toEqual(before)
  })

  it('AC-6802.1: 가로·세로가 점 수를 정한다(넘치는 점은 보지 않는다)', () => {
    const data = Uint8ClampedArray.from([...RED, ...BLUE2, ...BLUE2])
    expect(logoSwatches(data, 1, 1)).toEqual(['#dc1e1e'])
    expect(logoSwatches(data, 3, 1)).toEqual(['#1e3cc8', '#dc1e1e'])
  })
})

describe('AC-6802.2: logoSwatches — 남는 점이 없으면 빈 목록', () => {
  it('AC-6802.2: 빈 그림·모두 투명·모두 옅은 그림은 빈 목록이다', () => {
    expect(logoSwatches(new Uint8ClampedArray(0), 0, 0)).toEqual([])
    expect(swatchesOf(many([0, 0, 0, 0], 20))).toEqual([])
    expect(swatchesOf(many(WHITE_PX, 20))).toEqual([])
  })
})

// ---------- 흰 바탕 위 색 (spec form-style REQ-6803 AC-6803.3, design.md 3절, TASK-3) ----------

// 시험 쪽 HSL → '#rrggbb'
function hexOfHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

describe('AC-6803.3: onWhite — 흰색과 대비 3 이상이 되게 어둡게', () => {
  it('AC-6803.3: 이미 흰색과 대비가 3 이상이면 그대로다', () => {
    for (const hex of ['#1f2a44', '#dc2626', '#000000', '#2563eb', '#7c3aed']) {
      expect(contrastWithWhite(hex), hex).toBeGreaterThanOrEqual(3)
      expect(onWhite(hex), hex).toBe(hex)
    }
  })

  it('AC-6803.3: 옅은 색(노랑·하늘·주황)은 색상·채도는 두고 밝기만 낮춰 대비 3 이상이 되는 첫 색이다', () => {
    for (const hex of ['#eab308', '#e6e006', '#ffff00', '#0ea5e9', '#f97316', '#9fc3ff']) {
      expect(contrastWithWhite(hex), hex).toBeLessThan(3)
      const out = onWhite(hex)
      expect(out, hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrastWithWhite(out), hex).toBeGreaterThanOrEqual(3)
      const before = hslOf(hex)
      const after = hslOf(out)
      expect(after.l, hex).toBeLessThan(before.l)
      expect(hueGap(after.h, before.h), hex).toBeLessThan(3)
      expect(after.s, hex).toBeCloseTo(before.s, 1)
      // 첫 색: 한 걸음(0.02)보다 조금 더 밝으면 대비가 3에 못 미친다
      expect(contrastWithWhite(hexOfHsl(before.h, before.s, after.l + 0.03)), hex).toBeLessThan(3)
    }
  })

  it('AC-6803.3: 흰색은 대비 3 이상이 되는 첫 회색이다', () => {
    const out = onWhite('#ffffff')
    expect(out).toMatch(/^#([0-9a-f]{2})\1\1$/)
    expect(contrastWithWhite(out)).toBeGreaterThanOrEqual(3)
    expect(contrastWithWhite(hexOfHsl(0, 0, hslOf(out).l + 0.03))).toBeLessThan(3)
  })

  it('AC-6803.3: 대비 기준을 줄 수 있다(기본 3)', () => {
    expect(onWhite('#eab308')).toBe(onWhite('#eab308', 3))
    const strict = onWhite('#2563eb', 7)
    expect(contrastWithWhite('#2563eb')).toBeLessThan(7)
    expect(contrastWithWhite(strict)).toBeGreaterThanOrEqual(7)
    expect(hueGap(hslOf(strict).h, hslOf('#2563eb').h)).toBeLessThan(3)
    expect(onWhite('#2563eb', 4.5)).toBe('#2563eb')
  })

  it('AC-6803.3: 같은 색이면 늘 같은 결과다', () => {
    expect(onWhite('#eab308')).toBe(onWhite('#eab308'))
  })
})
