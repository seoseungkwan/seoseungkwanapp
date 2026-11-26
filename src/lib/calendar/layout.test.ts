import { describe, expect, it } from 'vitest'
import { layoutDay } from './layout'

// 시각은 분(0시부터). design.md '예' layoutDay 숫자 그대로
const at = (hh: number, mm = 0) => hh * 60 + mm
const block = (key: string, start: number, end: number) => ({ key, start, len: end - start })
const places = (blocks: ReturnType<typeof block>[]) => Object.fromEntries(layoutDay(blocks))

describe('AC-5902.1 layoutDay: 겹치는 묶음마다 col·cols·span', () => {
  it('AC-5902.1: A 14:00–14:30, B 14:20–14:40, C 14:30–15:00, D 15:00–15:30 → A·B·C는 두 열, D는 혼자', () => {
    const result = places([
      block('A', at(14), at(14, 30)),
      block('B', at(14, 20), at(14, 40)),
      block('C', at(14, 30), at(15)),
      block('D', at(15), at(15, 30)),
    ])
    expect(result).toEqual({
      A: { col: 0, cols: 2, span: 1 },
      B: { col: 1, cols: 2, span: 1 },
      C: { col: 0, cols: 2, span: 1 },
      D: { col: 0, cols: 1, span: 1 },
    })
  })

  it('AC-5902.1: 같은 시작이면 긴 칸 먼저 — E 09:00–09:30, F 09:00–09:10, G 09:10–09:20 → E 왼쪽, F·G 오른쪽', () => {
    const result = places([block('F', at(9), at(9, 10)), block('G', at(9, 10), at(9, 20)), block('E', at(9), at(9, 30))])
    expect(result).toEqual({
      E: { col: 0, cols: 2, span: 1 },
      F: { col: 1, cols: 2, span: 1 },
      G: { col: 1, cols: 2, span: 1 },
    })
  })

  it('AC-5902.1: 오른쪽 열이 그 시간에 비면 넓힌다 — K 11:00–12:00, L·M 11:00–11:30, N 11:30–12:00 → N은 span 2', () => {
    const result = places([
      block('K', at(11), at(12)),
      block('L', at(11), at(11, 30)),
      block('M', at(11), at(11, 30)),
      block('N', at(11, 30), at(12)),
    ])
    expect(result).toEqual({
      K: { col: 0, cols: 3, span: 1 },
      L: { col: 1, cols: 3, span: 1 },
      M: { col: 2, cols: 3, span: 1 },
      N: { col: 1, cols: 3, span: 2 },
    })
  })

  it('AC-5902.1: 아무와도 겹치지 않는 칸은 cols 1이고, 끝이 다음 시작과 같으면 겹침이 아니다', () => {
    const result = places([block('P', at(9), at(9, 30)), block('Q', at(9, 30), at(10)), block('R', at(13), at(13, 15))])
    expect(result).toEqual({
      P: { col: 0, cols: 1, span: 1 },
      Q: { col: 0, cols: 1, span: 1 },
      R: { col: 0, cols: 1, span: 1 },
    })
  })

  it('AC-5902.1: 들어온 차례와 상관없이 같은 자리다(시작 이른 차례로 놓는다)', () => {
    const blocks = [
      block('A', at(14), at(14, 30)),
      block('B', at(14, 20), at(14, 40)),
      block('C', at(14, 30), at(15)),
      block('D', at(15), at(15, 30)),
    ]
    expect(places([...blocks].reverse())).toEqual(places(blocks))
  })

  it('AC-5902.1: 10분보다 짧은 칸도 그리면 한 칸(10분) 높이라 10분으로 놓는다(시안 lay) — 5분 칸 둘은 나란히', () => {
    const result = places([block('S', at(9), at(9, 5)), block('T', at(9, 5), at(9, 10))])
    expect(result).toEqual({
      S: { col: 0, cols: 2, span: 1 },
      T: { col: 1, cols: 2, span: 1 },
    })
  })

  it('AC-5902.1: 빈 목록은 빈 결과', () => {
    expect(layoutDay([]).size).toBe(0)
  })
})

describe('AC-8532.4 layoutDay: 시작 5분 단위(spec google-link)', () => {
  it('AC-8532.4: 09:15–09:45와 09:40–10:10은 두 열, 09:45 시작 칸은 09:15 칸과 겹치지 않아 그 열을 이어 쓴다', () => {
    const result = places([block('A', at(9, 15), at(9, 45)), block('B', at(9, 40), at(10, 10)), block('C', at(9, 45), at(10, 15))])
    expect(result).toEqual({
      A: { col: 0, cols: 2, span: 1 },
      B: { col: 1, cols: 2, span: 1 },
      C: { col: 0, cols: 2, span: 1 },
    })
  })

  it('AC-8532.4: 5분 칸(09:05–09:10)도 그리면 10분 높이라 09:10 시작 칸과 나란히, 09:15 시작 칸과는 겹치지 않는다', () => {
    const result = places([block('S', at(9, 5), at(9, 10)), block('T', at(9, 10), at(9, 40)), block('U', at(13, 5), at(13, 10)), block('V', at(13, 15), at(13, 45))])
    expect(result).toEqual({
      S: { col: 0, cols: 2, span: 1 },
      T: { col: 1, cols: 2, span: 1 },
      U: { col: 0, cols: 1, span: 1 },
      V: { col: 0, cols: 1, span: 1 },
    })
  })
})
