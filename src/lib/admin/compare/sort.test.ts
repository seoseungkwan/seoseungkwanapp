import { describe, expect, it } from 'vitest'
import { FIRST_SORT, nextSort, ownFirst, sortRows } from './sort'

// 의원 비교 줄 차례(spec admin-view REQ-8014 AC-8014.3, design.md 기본값 15). 의원 이름·숫자는 모두 지어낸 것이다

type Row = { id: string; name: string; own: boolean; values: Record<string, number | null | undefined> }

const row = (id: string, name: string, values: Row['values'], own = false): Row => ({ id, name, own, values })

const ROWS: Row[] = [
  row('b', '다라정형외과의원', { total: null, visits: 900, 'pay:간호사': null }),
  row('a', '가나정형외과의원', { total: 300, visits: 1_200, 'pay:간호사': 2_600_000 }),
  row('e', '자차정형외과의원', { visits: 700 }), // 열쇠 없음 = 빈 값
  row('c', '마바정형외과의원', { total: 100, visits: 1_200, 'pay:간호사': 2_400_000 }, true),
  row('d', '사아정형외과의원', { total: 300, visits: 800, 'pay:간호사': null }),
]
const names = (rows: readonly Row[]) => rows.map((r) => r.id)

describe('AC-8014.3 sortRows: 고른 칸으로 줄 세우기', () => {
  it('AC-8014.3: 처음 차례는 총진료비 내림차순이다', () => {
    expect(FIRST_SORT).toEqual({ key: 'total', dir: 'desc' })
    expect(names(sortRows(ROWS, FIRST_SORT.key, FIRST_SORT.dir))).toEqual(['a', 'd', 'c', 'b', 'e'])
  })

  it('AC-8014.3: 오름차순이면 작은 값부터, 같은 값은 이름 차례다', () => {
    expect(names(sortRows(ROWS, 'total', 'asc'))).toEqual(['c', 'a', 'd', 'b', 'e'])
    expect(names(sortRows(ROWS, 'visits', 'asc'))).toEqual(['e', 'd', 'b', 'a', 'c'])
    expect(names(sortRows(ROWS, 'visits', 'desc'))).toEqual(['a', 'c', 'b', 'd', 'e'])
  })

  it('AC-8014.3: 빈 값(null·없는 열쇠·급여 없음)은 차례와 상관없이 늘 맨 아래이고 그끼리는 이름 차례다', () => {
    expect(names(sortRows(ROWS, 'pay:간호사', 'asc'))).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(names(sortRows(ROWS, 'pay:간호사', 'desc'))).toEqual(['a', 'c', 'b', 'd', 'e'])
    // 아무도 값이 없는 칸은 이름 차례
    expect(names(sortRows(ROWS, 'nonpay', 'desc'))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('AC-8014.3: 넘긴 줄 목록을 바꾸지 않고 새 목록을 준다', () => {
    const before = names(ROWS)
    const sorted = sortRows(ROWS, 'total', 'asc')
    expect(sorted).not.toBe(ROWS)
    expect(names(ROWS)).toEqual(before)
  })
})

describe('AC-8014.3 nextSort: 칸 이름을 누를 때', () => {
  it('AC-8014.3: 다른 칸이면 오름, 같은 칸 오름이면 내림, 같은 칸 내림이면 오름이다', () => {
    expect(nextSort({ key: 'total', dir: 'desc' }, 'visits')).toEqual({ key: 'visits', dir: 'asc' })
    expect(nextSort({ key: 'visits', dir: 'asc' }, 'visits')).toEqual({ key: 'visits', dir: 'desc' })
    expect(nextSort({ key: 'visits', dir: 'desc' }, 'visits')).toEqual({ key: 'visits', dir: 'asc' })
    // 처음 차례(총진료비 내림)에서 총진료비를 누르면 오름
    expect(nextSort(FIRST_SORT, 'total')).toEqual({ key: 'total', dir: 'asc' })
  })
})

describe('AC-8014.3 ownFirst: 월급·매출 표·나란히 보기 차례', () => {
  it('AC-8014.3: 내 의원 먼저, 나머지는 이름 차례다(값과 상관없음)', () => {
    expect(names(ownFirst(ROWS))).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(names(ownFirst(ROWS.map((r) => ({ ...r, own: false }))))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('AC-8014.3: 넘긴 줄 목록을 바꾸지 않는다', () => {
    const before = names(ROWS)
    ownFirst(ROWS)
    expect(names(ROWS)).toEqual(before)
  })
})
