import { describe, expect, it } from 'vitest'
import {
  ALPHA_MIN,
  BORDER_SHARE,
  EDGE_MIN,
  OPAQUE_MIN,
  PEEL_MAX,
  PEEL_OUTER,
  WHITE_MIN,
  clearWhiteBackground,
  fitLogo,
  peelEdgeLines,
  trimLogo,
  type LogoBitmap,
} from './logoFit'

// 서식 로고 준비: 가장자리 얇은 선 떼기 → 흰 배경 지우기 → 여백 자르기 (spec logo-fit REQ-6701·REQ-6702, design.md 2절).
// 순수 함수라 손으로 만든 작은 RGBA 그림만 넣어 본다. 그림은 지어낸 것이다(실제 병원 로고가 아니다).
// 그림은 글자 한 줄 = 가로줄 하나, 글자 하나 = 점 하나로 그린다

type Px = readonly [number, number, number, number]
const W: Px = [255, 255, 255, 255] // 흰 점
const GRAY: Px = [245, 245, 245, 255] // 밝은 회색 #F5F5F5
const K: Px = [0, 0, 0, 255] // 검은 점
const T: Px = [0, 0, 0, 0] // 투명한 점
const BLUE: Px = [31, 95, 191, 255]
const NAVY: Px = [10, 30, 90, 255]
const CLEARED_W: Px = [255, 255, 255, 0] // 지운 흰 점(색은 그대로, 불투명도만 0)
const CLEARED_GRAY: Px = [245, 245, 245, 0]

type Key = Record<string, Px>

function draw(rows: readonly string[], key: Key): LogoBitmap {
  const height = rows.length
  const width = height > 0 ? rows[0].length : 0
  const data = new Uint8ClampedArray(width * height * 4)
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`줄 ${y} 길이가 다르다`)
    Array.from(row).forEach((ch, x) => {
      const p = key[ch]
      if (!p) throw new Error(`'${ch}' 점 색이 없다`)
      data.set(p, (y * width + x) * 4)
    })
  })
  return { data, width, height }
}

// 비교용(Uint8ClampedArray → 숫자 배열)
const plain = (b: LogoBitmap | null) => (b === null ? null : { width: b.width, height: b.height, data: Array.from(b.data) })

const pixelAt = (b: LogoBitmap, x: number, y: number) => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))

// 그림의 (x0, y0)부터 width × height 네모를 잘라 낸 것(기대값 만들기)
function crop(b: LogoBitmap, x0: number, y0: number, width: number, height: number): LogoBitmap {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixelAt(b, x0 + x, y0 + y), (y * width + x) * 4)
  }
  return { data, width, height }
}

// 흰(또는 회색) 바탕 width × height, 오른쪽 끝 thick 칸 검은 세로줄, (3,2)~(4,3) 2×2 검은 점
function rightLineLogo(width: number, height: number, thick: number, bg: Px = W): LogoBitmap {
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x >= width - thick || ((x === 3 || x === 4) && (y === 2 || y === 3)) ? '#' : '.')).join(''),
  )
  return draw(rows, { '.': bg, '#': K })
}

describe('AC-6701.1: 정해 둔 값', () => {
  it('AC-6701.1: 거의 흰 점·둘레 비율·반투명·보이는 점·선 떼기 값이 design.md 2절과 같다', () => {
    expect({ WHITE_MIN, OPAQUE_MIN, BORDER_SHARE, EDGE_MIN, ALPHA_MIN, PEEL_MAX, PEEL_OUTER }).toEqual({
      WHITE_MIN: 230,
      OPAQUE_MIN: 200,
      BORDER_SHARE: 0.9,
      EDGE_MIN: 200,
      ALPHA_MIN: 16,
      PEEL_MAX: 3,
      PEEL_OUTER: 0.5,
    })
  })
})

describe('AC-6701.1: clearWhiteBackground — 둘레와 이어진 거의 흰 점만 지운다', () => {
  it('AC-6701.1: 흰 둘레와 이어진 흰 점은 투명이 되고, 검은 점과 검은 고리 안 흰 칸은 그대로 남는다', () => {
    const key: Key = { '.': W, '#': K, o: W, _: CLEARED_W }
    const src = draw(['........', '.###..#.', '.#o#....', '.###....', '........'], key)
    const out = clearWhiteBackground(src)
    expect(plain(out)).toEqual(plain(draw(['________', '_###__#_', '_#o#____', '_###____', '________'], key)))
  })

  it('AC-6701.1: 위·아래·왼쪽·오른쪽으로만 이어 간다 — 대각선으로만 닿은 흰 칸은 남는다', () => {
    const key: Key = { '.': W, '#': K, o: W, _: CLEARED_W }
    const src = draw(['.......', '...#...', '..#o#..', '...#...', '.......'], key)
    expect(plain(clearWhiteBackground(src))).toEqual(plain(draw(['_______', '___#___', '__#o#__', '___#___', '_______'], key)))
  })

  it('AC-6701.1: 밝은 회색(#F5F5F5) 바탕도 거의 흰 점이라 지운다', () => {
    const key: Key = { '.': GRAY, '#': K, _: CLEARED_GRAY }
    const src = draw(['......', '..##..', '..##..', '......'], key)
    expect(plain(clearWhiteBackground(src))).toEqual(plain(draw(['______', '__##__', '__##__', '______'], key)))
  })

  // 검은 고리에 틈 하나(a)가 있고 그 안에 흰 칸(o): a가 거의 흰 점이면 채우기가 틈을 지나 o까지 지우고, 아니면 o는 남는다
  it.each([
    { name: '불투명도 200 흰 점', a: [255, 255, 255, 200] as Px, passes: true },
    { name: 'R 230 점', a: [230, 255, 255, 255] as Px, passes: true },
    { name: '불투명도 199 흰 점', a: [255, 255, 255, 199] as Px, passes: false },
    { name: 'R 229 점', a: [229, 255, 255, 255] as Px, passes: false },
  ])('AC-6701.1: 거의 흰 점 = 불투명도 200 이상이고 R·G·B 가장 작은 값 230 이상 — 틈이 $name', ({ a, passes }) => {
    const src = draw(['.......', '.####..', '.#oa...', '.####..', '.......'], { '.': W, '#': K, o: W, a })
    const out = clearWhiteBackground(src)
    expect(pixelAt(out, 2, 2)).toEqual(passes ? [...CLEARED_W] : [...W])
    expect(pixelAt(out, 4, 2)).toEqual([...CLEARED_W])
  })

  it('AC-6701.1: 1×1 흰 그림은 지워지고, 1×1 검은 그림·한 줄 그림도 깨지지 않는다', () => {
    expect(plain(clearWhiteBackground(draw(['.'], { '.': W })))).toEqual(plain(draw(['_'], { _: CLEARED_W })))
    expect(plain(clearWhiteBackground(draw(['#'], { '#': K })))).toEqual(plain(draw(['#'], { '#': K })))
    // 한 줄(10 × 1): 둘레 10점 중 9점(90%)이 흰 점 → 지운다
    const key: Key = { '.': W, '#': K, _: CLEARED_W }
    expect(plain(clearWhiteBackground(draw(['....#.....'], key)))).toEqual(plain(draw(['____#_____'], key)))
  })
})

describe('AC-6701.2: clearWhiteBackground — 둘레의 거의 흰 점이 90% 미만이면 지우지 않는다', () => {
  // 26 × 26: 둘레 = 26 + 26 + 24 + 24 = 100점. 맨 윗줄 왼쪽 n점을 검게
  const squareWithTopBlack = (n: number) =>
    draw(
      Array.from({ length: 26 }, (_, y) => Array.from({ length: 26 }, (_, x) => (y === 0 && x < n ? '#' : '.')).join('')),
      { '.': W, '#': K },
    )

  it('AC-6701.2: 둘레 흰 점 90%(100점 중 90점)면 지우고, 89%면 하나도 바꾸지 않는다', () => {
    const at90 = clearWhiteBackground(squareWithTopBlack(10))
    expect(pixelAt(at90, 13, 13)).toEqual([...CLEARED_W])
    expect(pixelAt(at90, 0, 0)).toEqual([...K])

    const src89 = squareWithTopBlack(11)
    expect(plain(clearWhiteBackground(src89))).toEqual(plain(src89))
  })

  it('AC-6701.2: 이미 투명한 둘레의 로고는 흰 점까지 그대로다', () => {
    const src = draw(['......', '.ww#..', '.w##..', '......'], { '.': T, w: W, '#': K })
    const out = clearWhiteBackground(src)
    expect(plain(out)).toEqual(plain(src))
    expect(out.data).not.toBe(src.data)
  })

  it('AC-6701.2: 색 배경 로고는 그대로다(밝은 점이 있어도 반투명으로 바꾸지 않는다)', () => {
    const src = draw(['bbbbbb', 'bwwb.b', 'bbbbbb'], { b: BLUE, w: W, '.': [220, 220, 220, 255] })
    expect(plain(clearWhiteBackground(src))).toEqual(plain(src))
  })
})

describe('AC-6701.3: clearWhiteBackground — 지운 자리와 맞닿은 밝은 점은 반투명', () => {
  it('AC-6701.3: 불투명도 = 원래 불투명도 × (255 − 가장 작은 값) ÷ 55 (반올림, 0~255), 색은 그대로', () => {
    const key: Key = {
      '.': W,
      _: CLEARED_W,
      '#': K,
      a: [229, 240, 250, 255], // 255 × 26 ÷ 55 = 120.5… → 121
      b: [210, 220, 230, 200], // 200 × 45 ÷ 55 = 163.6… → 164
      c: [200, 200, 200, 255], // 255 × 55 ÷ 55 = 255
      d: [199, 255, 255, 255], // 가장 작은 값 199 < 200 → 그대로
      e: [255, 255, 255, 150], // 불투명도 150이라 거의 흰 점이 아님, 맞닿음 → 150 × 0 ÷ 55 = 0
      f: [220, 220, 220, 255], // 대각선으로만 닿음 → 그대로
      A: [229, 240, 250, 121],
      B: [210, 220, 230, 164],
      E: [255, 255, 255, 0],
    }
    const src = draw(['.........', '.abcde...', '.........', '...#.....', '..#f#....', '...#.....', '.........'], key)
    const out = clearWhiteBackground(src)
    expect(plain(out)).toEqual(
      plain(draw(['_________', '_ABcdE___', '_________', '___#_____', '__#f#____', '___#_____', '_________'], key)),
    )
  })

  it('AC-6701.3: 검은 고리 안 밝은 점(지운 자리와 안 닿음)은 그대로다', () => {
    const key: Key = { '.': W, _: CLEARED_W, '#': K, g: [225, 225, 225, 255] }
    const src = draw(['.....', '.###.', '.#g#.', '.###.', '.....'], key)
    expect(plain(clearWhiteBackground(src))).toEqual(plain(draw(['_____', '_###_', '_#g#_', '_###_', '_____'], key)))
  })
})

describe('AC-6701.5: peelEdgeLines — 가장자리 1~3점 두께 선 떼기', () => {
  it.each([1, 2, 3])('AC-6701.5: 오른쪽 %i점 두께 검은 세로줄은 떼고(그 줄만), 그다음 흰 배경이 지워진다', (thick) => {
    const src = rightLineLogo(10, 6, thick)
    // 떼지 않으면 둘레 흰 점이 90% 미만이라 배경이 남는다
    expect(plain(clearWhiteBackground(src))).toEqual(plain(src))

    const peeled = peelEdgeLines(src)
    expect(plain(peeled)).toEqual(plain(crop(src, 0, 0, 10 - thick, 6)))

    expect(plain(fitLogo(src))).toEqual(plain(draw(['##', '##'], { '#': K })))
  })

  it('AC-6701.5: 밝은 회색(#F5F5F5) 바탕 + 오른쪽 1점 검은 세로줄도 떼고 지운다', () => {
    expect(plain(fitLogo(rightLineLogo(10, 6, 1, GRAY)))).toEqual(plain(draw(['##', '##'], { '#': K })))
  })

  it('AC-6701.5: 4점 두께 줄은 떼지 않는다(배경도 그대로 남는다)', () => {
    const src = rightLineLogo(10, 6, 4)
    expect(plain(peelEdgeLines(src))).toEqual(plain(src))
    expect(plain(fitLogo(src))).toEqual(plain(src))
  })

  it('AC-6701.5: 색 배경의 바깥 색 줄(안쪽 줄도 색)은 떼지 않는다', () => {
    const src = draw(['bbbbbbbbbn', 'bbbbbbbbbn', 'bbbwwbbbbn', 'bbbbbbbbbn', 'bbbbbbbbbn'], { b: BLUE, n: NAVY, w: W })
    expect(plain(peelEdgeLines(src))).toEqual(plain(src))
  })

  it('AC-6701.5: 바깥 줄의 거의 흰 점이 50% 이상이면 떼지 않고, 50% 미만이면 뗀다', () => {
    // 오른쪽 끝 칸 6점 중 흰 점 3점(50%) → 그대로
    const half = draw(['.....#', '......', '.....#', '......', '.....#', '......'], { '.': W, '#': K })
    expect(plain(peelEdgeLines(half))).toEqual(plain(half))
    // 6점 중 흰 점 2점(33%) → 뗀다
    const third = draw(['.....#', '......', '.....#', '.....#', '.....#', '......'], { '.': W, '#': K })
    expect(plain(peelEdgeLines(third))).toEqual(plain(crop(third, 0, 0, 5, 6)))
  })

  it('AC-6701.5: 안쪽 줄의 거의 흰 점이 90%면 떼고, 80%면 떼지 않는다', () => {
    // 10 × 10, 오른쪽 끝 칸 검정, 그 옆 칸(x 8)에 검은 점 1개(90%) 또는 2개(80%)
    const logo = (dots: number) =>
      draw(
        Array.from({ length: 10 }, (_, y) =>
          Array.from({ length: 10 }, (_, x) => (x === 9 || (x === 8 && y >= 4 && y < 4 + dots) ? '#' : '.')).join(''),
        ),
        { '.': W, '#': K },
      )
    expect(plain(peelEdgeLines(logo(1)))).toEqual(plain(crop(logo(1), 0, 0, 9, 10)))
    expect(plain(peelEdgeLines(logo(2)))).toEqual(plain(logo(2)))
  })

  it('AC-6701.5: 위 → 왼쪽 차례로, 앞에서 뗀 줄은 뒤 차례 줄 길이에서 빠진다', () => {
    // 10 × 6, 맨 윗줄과 맨 왼쪽 칸이 검정. 위: 윗줄 0% · 둘째 줄 9/10 = 90% → 뗌.
    // 왼쪽: 위를 뗀 뒤 5점 기준 둘째 칸 5/5 → 뗌 (윗줄을 셌다면 5/6 = 83%라 못 뗀다. 왼쪽을 먼저 했어도 못 뗀다)
    const src = draw(['##########', '#.........', '#.........', '#....##...', '#.........', '#.........'], { '.': W, '#': K })
    const out = peelEdgeLines(src)
    expect(plain(out)).toEqual(plain(crop(src, 1, 1, 9, 5)))
    expect(plain(fitLogo(src))).toEqual(plain(draw(['##'], { '#': K })))
  })

  it('AC-6701.5: 아래쪽 2점 두께 가로줄도 뗀다', () => {
    const src = draw(['......', '..##..', '......', '......', '######', '######'], { '.': W, '#': K })
    expect(plain(peelEdgeLines(src))).toEqual(plain(crop(src, 0, 0, 6, 4)))
  })

  it.each([
    { name: '폭 4 − 1줄 = 3 → 뗀다', width: 4, thick: 1, peeled: true },
    { name: '폭 3 − 1줄 = 2 → 안 뗀다', width: 3, thick: 1, peeled: false },
    { name: '폭 5 − 2줄 = 3 → 뗀다', width: 5, thick: 2, peeled: true },
    { name: '폭 4 − 2줄 = 2 → 안 뗀다', width: 4, thick: 2, peeled: false },
  ])('AC-6701.5: 떼고 남는 폭이 3 미만이면 떼지 않는다 — $name', ({ width, thick, peeled }) => {
    const src = draw(
      Array.from({ length: 5 }, () => '.'.repeat(width - thick) + '#'.repeat(thick)),
      { '.': W, '#': K },
    )
    expect(plain(peelEdgeLines(src))).toEqual(plain(peeled ? crop(src, 0, 0, width - thick, 5) : src))
  })

  it('AC-6701.5: 떼고 남는 높이가 3 미만이면 떼지 않는다(높이 4는 뗌, 3은 안 뗌)', () => {
    const tall = draw(['##########', '..........', '..........', '..........'], { '.': W, '#': K })
    expect(plain(peelEdgeLines(tall))).toEqual(plain(crop(tall, 0, 1, 10, 3)))
    const short = draw(['##########', '..........', '..........'], { '.': W, '#': K })
    expect(plain(peelEdgeLines(short))).toEqual(plain(short))
  })

  it('AC-6701.5: 뗄 것이 없어도 새 배열(복사본)을 돌려주고, 1×1도 깨지지 않는다', () => {
    const src = draw(['....', '.##.', '....'], { '.': W, '#': K })
    const out = peelEdgeLines(src)
    expect(plain(out)).toEqual(plain(src))
    expect(out.data).not.toBe(src.data)
    expect(plain(peelEdgeLines(draw(['#'], { '#': K })))).toEqual(plain(draw(['#'], { '#': K })))
  })
})

describe('AC-6702.1: trimLogo — 불투명도 16 이상인 점이 닿는 가장 작은 네모만 남긴다', () => {
  const key: Key = { '.': T, k: K, v: [0, 0, 0, 16], h: [0, 0, 0, 15] }

  it('AC-6702.1: 투명한 둘레를 잘라 크기와 점을 넘긴다(불투명도 15 점은 안 보이는 점, 16 점은 보이는 점)', () => {
    const src = draw(['.......', '....k..', '..h....', '.......', '.v.....', '.....h.'], key)
    const out = trimLogo(src)
    expect(plain(out)).toEqual(plain(draw(['...k', '.h..', '....', 'v...'], key)))
  })

  it('AC-6702.1: 보이는 점이 없으면 null', () => {
    expect(trimLogo(draw(['...', '...'], key))).toBeNull()
    expect(trimLogo(draw(['hh', 'hh'], key))).toBeNull()
    expect(trimLogo(draw(['.'], key))).toBeNull()
  })

  it('AC-6702.1: 자를 둘레가 없으면 같은 크기의 새 배열, 1×1 불투명 점은 1×1', () => {
    const src = draw(['kv', 'vk'], key)
    const out = trimLogo(src)
    expect(plain(out)).toEqual(plain(src))
    expect(out?.data).not.toBe(src.data)
    expect(plain(trimLogo(draw(['k'], key)))).toEqual(plain(draw(['k'], key)))
  })
})

describe('AC-6702.1: fitLogo — 선 떼기 → 흰 배경 지우기 → 여백 자르기', () => {
  it('AC-6702.1: 흰 배경 로고는 지운 뒤 로고가 닿는 네모만 남고, 흰 바탕 칸은 투명으로 남는다', () => {
    const key: Key = { '.': W, '#': K, o: W, _: CLEARED_W }
    const src = draw(['........', '.###..#.', '.#o#....', '.###....', '........'], key)
    expect(plain(fitLogo(src))).toEqual(plain(draw(['###__#', '#o#___', '###___'], key)))
  })

  it('AC-6701.2: 투명 둘레 로고는 지우지 않고 자르기만 한다(흰 점 그대로)', () => {
    const src = draw(['......', '.ww#..', '.w##..', '......'], { '.': T, w: W, '#': K })
    expect(plain(fitLogo(src))).toEqual(plain(draw(['ww#', 'w##'], { w: W, '#': K })))
  })

  it('AC-6701.2: 선을 뗀 뒤에도 둘레 흰 점이 90% 미만이면 지우지 않는다(뗀 것은 그대로 잘린 채)', () => {
    // 10 × 6: 왼쪽 5칸 파랑, 오른쪽 4칸 흰색, 오른쪽 끝 1칸 검정 → 오른쪽 줄만 떼고 배경은 남는다
    const src = draw(Array.from({ length: 6 }, () => 'bbbbb....#'), { b: BLUE, '.': W, '#': K })
    expect(plain(fitLogo(src))).toEqual(plain(crop(src, 0, 0, 9, 6)))
  })

  it('AC-6702.1: 모두 흰(또는 밝은 회색) 그림·1×1 흰 그림은 남는 점이 없어 null', () => {
    expect(fitLogo(draw(['....', '....', '....'], { '.': W }))).toBeNull()
    expect(fitLogo(draw(['....', '....', '....'], { '.': GRAY }))).toBeNull()
    expect(fitLogo(draw(['.'], { '.': W }))).toBeNull()
    expect(plain(fitLogo(draw(['#'], { '#': K })))).toEqual(plain(draw(['#'], { '#': K })))
  })

  it('AC-6701.1: 넣은 그림 배열은 어느 함수에서도 바뀌지 않는다', () => {
    const src = rightLineLogo(10, 6, 1)
    const white = draw(['.....', '.###.', '.....'], { '.': W, '#': K })
    const transparentEdge = draw(['...', '.k.', '...'], { '.': T, k: K })
    const before = [src, white, transparentEdge].map((b) => Array.from(b.data))

    for (const b of [src, white, transparentEdge]) {
      const outs = [peelEdgeLines(b), clearWhiteBackground(b), trimLogo(b), fitLogo(b)]
      for (const out of outs) if (out) expect(out.data).not.toBe(b.data)
    }
    expect([src, white, transparentEdge].map((b) => Array.from(b.data))).toEqual(before)
  })
})
