import type { BlockPlace, LayoutBlock } from './shapes'

// 일·주 보기에서 한 날의 칸을 옆으로 나란히 놓는다(spec clinic-calendar AC-5902.1, 시안 lay). 순수 함수다.
// 비트 예약 칸·취소 칸도 같이 넣는다. 겹침은 [시작, 끝)끼리라 끝이 다음 시작과 같으면 겹치지 않는다

// 10분 = 한 칸 높이. 그보다 짧은 칸(5분)도 그리면 한 칸이라 놓을 때는 10분으로 본다(시안 lay와 같다)
const MIN_ROW = 10

type Item = { key: string; s: number; e: number; at: number; col: number }

/** 칸마다 {col, cols, span}. 시작 이른 차례(같으면 긴 칸 먼저)로 겹치는 묶음을 만들고, 묶음 안에서 비어 있는 가장 왼쪽 열에 둔다.
 * cols = 묶음의 열 수, span = 오른쪽 열들이 그 시간에 비어 있는 만큼 넓힘 */
export function layoutDay(blocks: readonly LayoutBlock[]): Map<string, BlockPlace> {
  const items: Item[] = blocks
    .map((b, at) => ({ key: b.key, s: b.start, e: b.start + Math.max(b.len, MIN_ROW), at, col: 0 }))
    .sort((a, b) => a.s - b.s || b.e - a.e || a.at - b.at)
  const out = new Map<string, BlockPlace>()
  let group: Item[] = []
  let groupEnd = -Infinity
  for (const item of items) {
    if (group.length > 0 && item.s >= groupEnd) {
      placeGroup(group, out)
      group = []
    }
    groupEnd = group.length === 0 ? item.e : Math.max(groupEnd, item.e)
    group.push(item)
  }
  placeGroup(group, out)
  return out
}

function placeGroup(group: Item[], out: Map<string, BlockPlace>): void {
  const colEnds: number[] = []
  for (const item of group) {
    let col = colEnds.findIndex((end) => end <= item.s)
    if (col < 0) col = colEnds.push(item.e) - 1
    else colEnds[col] = item.e
    item.col = col
  }
  const cols = colEnds.length
  for (const item of group) {
    let span = 1
    while (item.col + span < cols && !group.some((o) => o.col === item.col + span && o.s < item.e && item.s < o.e)) span++
    out.set(item.key, { col: item.col, cols, span })
  }
}
