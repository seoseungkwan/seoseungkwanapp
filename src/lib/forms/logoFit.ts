// 서식 로고 준비: 가장자리 얇은 선 떼기 → 흰 배경 지우기 → 여백 자르기 (spec logo-fit REQ-6701·REQ-6702, design.md 2절).
// 순수 함수. DOM·네트워크·저장소·console을 쓰지 않는다. 넣은 그림 배열은 바꾸지 않고 언제나 새 배열을 돌려준다

// RGBA 점 배열(점 하나 = 4칸, 줄 차례), 가로·세로 점 수
export type LogoBitmap = { data: Uint8ClampedArray; width: number; height: number }

export const WHITE_MIN = 230 // 거의 흰 점: min(R,G,B) ≥ 230
export const OPAQUE_MIN = 200 // 그리고 불투명도 ≥ 200
export const BORDER_SHARE = 0.9 // 둘레 점 중 거의 흰 점 비율 ≥ 0.9 일 때만 지운다
export const EDGE_MIN = 200 // 지운 자리와 맞닿은 밝은 점: min(R,G,B) ≥ 200 → 반투명
export const ALPHA_MIN = 16 // 자를 때 '보이는 점'
export const PEEL_MAX = 3 // 가장자리 얇은 선: 한 쪽에 3줄까지
export const PEEL_OUTER = 0.5 // 바깥 줄의 거의 흰 점 < 50% 이고 안쪽 줄 ≥ 90% 면 바깥 줄을 뗀다

const FULL = 255
const EDGE_SPAN = FULL - EDGE_MIN // 반투명 식의 나눗수 55
const PEEL_KEEP = 3 // 떼고 남는 높이·폭이 이보다 작으면 떼지 않는다

// 점 번호 i(줄 차례)의 R·G·B 가장 작은 값
function minRgb(data: Uint8ClampedArray, i: number): number {
  return Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
}

function isNearWhite(data: Uint8ClampedArray, i: number): boolean {
  return data[i * 4 + 3] >= OPAQUE_MIN && minRgb(data, i) >= WHITE_MIN
}

// 그림에서 (x0, y0)부터 width × height 네모의 줄을 복사한 새 그림
function cropBitmap(px: LogoBitmap, x0: number, y0: number, width: number, height: number): LogoBitmap {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const start = ((y0 + y) * px.width + x0) * 4
    data.set(px.data.subarray(start, start + width * 4), y * width * 4)
  }
  return { data, width, height }
}

// 둘레 점 번호: 맨 위·맨 아래 줄과 맨 왼쪽·오른쪽 칸(겹치는 모서리는 한 번)
function borderIndexes(width: number, height: number): number[] {
  const border: number[] = []
  for (let x = 0; x < width; x++) {
    border.push(x)
    if (height > 1) border.push((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    border.push(y * width)
    if (width > 1) border.push(y * width + width - 1)
  }
  return border
}

// AC-6701.1·6701.2·6701.3: 둘레의 거의 흰 점이 90% 이상이면 둘레에서 이어진 거의 흰 점을 투명으로, 맞닿은 밝은 점은 반투명으로
export function clearWhiteBackground(px: LogoBitmap): LogoBitmap {
  const { width, height } = px
  const out = new Uint8ClampedArray(px.data)
  const border = borderIndexes(width, height)
  const nearCount = border.filter((i) => isNearWhite(out, i)).length
  if (border.length === 0 || nearCount / border.length < BORDER_SHARE) return { data: out, width, height }

  // 둘레의 거의 흰 점을 씨앗으로 위·아래·왼쪽·오른쪽 채우기(되부름 없이 스택)
  const total = width * height
  const seen = new Uint8Array(total)
  const stack = new Int32Array(total)
  let top = 0
  for (const i of border) {
    if (!seen[i] && isNearWhite(out, i)) {
      seen[i] = 1
      stack[top++] = i
    }
  }
  const visit = (j: number) => {
    if (!seen[j] && isNearWhite(out, j)) {
      seen[j] = 1
      stack[top++] = j
    }
  }
  while (top > 0) {
    const i = stack[--top]
    const x = i % width
    const y = (i - x) / width
    if (x > 0) visit(i - 1)
    if (x < width - 1) visit(i + 1)
    if (y > 0) visit(i - width)
    if (y < height - 1) visit(i + width)
  }

  // 채운 점은 불투명도 0, 채운 점과 맞닿은 밝은 점은 불투명도 × (255 − 가장 작은 값) ÷ 55
  for (let i = 0; i < total; i++) {
    if (seen[i]) {
      out[i * 4 + 3] = 0
      continue
    }
    const x = i % width
    const y = (i - x) / width
    const touches =
      (x > 0 && seen[i - 1] === 1) ||
      (x < width - 1 && seen[i + 1] === 1) ||
      (y > 0 && seen[i - width] === 1) ||
      (y < height - 1 && seen[i + width] === 1)
    if (!touches) continue
    const m = minRgb(px.data, i)
    if (m < EDGE_MIN) continue
    const alpha = Math.round((px.data[i * 4 + 3] * (FULL - m)) / EDGE_SPAN)
    out[i * 4 + 3] = Math.max(0, Math.min(FULL, alpha))
  }
  return { data: out, width, height }
}

// AC-6701.5: 위 → 아래 → 왼쪽 → 오른쪽 차례로 한 번씩, 가장자리 1~3점 두께 선을 뗀다(비율은 지금 남은 네모 안에서 잰다)
export function peelEdgeLines(px: LogoBitmap): LogoBitmap {
  const { data, width, height } = px
  let x0 = 0
  let x1 = width - 1
  let y0 = 0
  let y1 = height - 1
  const near = (x: number, y: number) => isNearWhite(data, y * width + x)
  const rowShare = (y: number) => {
    let n = 0
    for (let x = x0; x <= x1; x++) if (near(x, y)) n++
    return n / (x1 - x0 + 1)
  }
  const colShare = (x: number) => {
    let n = 0
    for (let y = y0; y <= y1; y++) if (near(x, y)) n++
    return n / (y1 - y0 + 1)
  }
  // 바깥 줄 line에서 안쪽(step 방향)으로: k번째 줄 ≥ 50%면 멈춤, 아니고 k+1번째 줄 ≥ 90%면 k줄 뗌
  const peelCount = (share: (line: number) => number, line: number, step: 1 | -1, length: number): number => {
    for (let k = 1; k <= PEEL_MAX; k++) {
      if (length - k < PEEL_KEEP) return 0
      if (share(line + (k - 1) * step) >= PEEL_OUTER) return 0
      if (share(line + k * step) >= BORDER_SHARE) return k
    }
    return 0
  }
  y0 += peelCount(rowShare, y0, 1, y1 - y0 + 1)
  y1 -= peelCount(rowShare, y1, -1, y1 - y0 + 1)
  x0 += peelCount(colShare, x0, 1, x1 - x0 + 1)
  x1 -= peelCount(colShare, x1, -1, x1 - x0 + 1)
  if (x0 === 0 && y0 === 0 && x1 === width - 1 && y1 === height - 1) {
    return { data: new Uint8ClampedArray(data), width, height }
  }
  return cropBitmap(px, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
}

// AC-6702.1: 불투명도 16 이상인 점이 닿는 가장 작은 네모만 남긴다. 보이는 점이 없으면 null
export function trimLogo(px: LogoBitmap): LogoBitmap | null {
  const { data, width, height } = px
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < ALPHA_MIN) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  return cropBitmap(px, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
}

// 선 떼기 → 흰 배경 지우기 → 여백 자르기. 남는 점이 없으면 null
export function fitLogo(px: LogoBitmap): LogoBitmap | null {
  return trimLogo(clearWhiteBackground(peelEdgeLines(px)))
}
