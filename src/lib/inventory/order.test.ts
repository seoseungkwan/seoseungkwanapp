import { describe, expect, it } from 'vitest'
import { moveBy, moveItem, sortItems } from './order'

// 물품·분류 차례(spec inventory REQ-7502 AC-7502.5). 물품은 같은 분류 안에서만 옮긴다. 이름은 지어낸 값

const categories = [
  { id: 'c2', name: '치료 소모품', sortOrder: 1 },
  { id: 'c1', name: '약품', sortOrder: 0 },
  { id: 'c3', name: '사무·생활', sortOrder: 2 },
]
const item = (id: string, categoryId: string, sortOrder: number, name: string) => ({ id, categoryId, sortOrder, name })
const items = [
  item('s2', 'c2', 1, '주사침 25G'),
  item('m1', 'c1', 0, '히알루론산 주사'),
  item('s1', 'c2', 0, '주사기 3cc'),
  item('m3', 'c1', 1, '케토프로펜 패치'),
  item('m2', 'c1', 1, '리도카인 주사'),
  item('o1', 'c3', 0, 'A4 용지'),
  item('x1', 'zz', 0, '분류 모름'),
]
const ids = (list: { id: string }[]) => list.map((x) => x.id)

describe('AC-7502.5 sortItems', () => {
  it('AC-7502.5: 분류 차례 → 물품 sort_order → 이름 차례, 목록에 없는 분류의 물품은 맨 뒤', () => {
    expect(ids(sortItems(items, categories))).toEqual(['m1', 'm2', 'm3', 's1', 's2', 'o1', 'x1'])
  })

  it('AC-7502.5: 받은 배열을 바꾸지 않고 같은 물품 그대로 담은 새 배열', () => {
    const before = ids(items)
    const sorted = sortItems(items, categories)
    expect(ids(items)).toEqual(before)
    expect(sorted).not.toBe(items)
    expect(sorted[0]).toBe(items[1])
  })
})

describe('AC-7502.5 moveItem', () => {
  const sorted = sortItems(items, categories) // m1 m2 m3 | s1 s2 | o1 | x1

  it('AC-7502.5: 같은 분류 안 새 자리(전체 목록 자리)로 옮긴 전체 id 차례', () => {
    expect(moveItem(sorted, 'm3', 0)).toEqual(['m3', 'm1', 'm2', 's1', 's2', 'o1', 'x1'])
    expect(moveItem(sorted, 'm1', 2)).toEqual(['m2', 'm3', 'm1', 's1', 's2', 'o1', 'x1'])
    expect(moveItem(sorted, 's1', 4)).toEqual(['m1', 'm2', 'm3', 's2', 's1', 'o1', 'x1'])
  })

  it('AC-7502.5: 분류 밖 자리를 주면 그 분류 끝·첫 자리에서 멈춘다(다른 분류로 넘어가지 않는다)', () => {
    expect(moveItem(sorted, 'm1', 5)).toEqual(['m2', 'm3', 'm1', 's1', 's2', 'o1', 'x1'])
    expect(moveItem(sorted, 's2', 0)).toEqual(['m1', 'm2', 'm3', 's2', 's1', 'o1', 'x1'])
    expect(moveItem(sorted, 'o1', 0)).toEqual(['m1', 'm2', 'm3', 's1', 's2', 'o1', 'x1'])
  })

  it('AC-7502.5: 제자리·없는 id면 그대로', () => {
    expect(moveItem(sorted, 'm2', 1)).toEqual(ids(sorted))
    expect(moveItem(sorted, 'nope', 0)).toEqual(ids(sorted))
  })
})

describe('AC-7502.5 moveBy', () => {
  const sorted = sortItems(items, categories)

  it('AC-7502.5: ±1은 같은 분류 안에서 한 칸 위·아래', () => {
    expect(moveBy(sorted, 'm2', -1)).toEqual(['m2', 'm1', 'm3', 's1', 's2', 'o1', 'x1'])
    expect(moveBy(sorted, 'm2', 1)).toEqual(['m1', 'm3', 'm2', 's1', 's2', 'o1', 'x1'])
    expect(moveBy(sorted, 's2', -1)).toEqual(['m1', 'm2', 'm3', 's2', 's1', 'o1', 'x1'])
  })

  it('AC-7502.5: 분류 첫 줄에서 위·끝 줄에서 아래는 그대로(옆 분류로 넘어가지 않는다)', () => {
    expect(moveBy(sorted, 'm1', -1)).toEqual(ids(sorted))
    expect(moveBy(sorted, 'm3', 1)).toEqual(ids(sorted))
    expect(moveBy(sorted, 's1', -1)).toEqual(ids(sorted))
    expect(moveBy(sorted, 'o1', 1)).toEqual(ids(sorted))
    expect(moveBy(sorted, 'nope', 1)).toEqual(ids(sorted))
  })

  it('AC-7502.5: 분류 목록(categoryId 없음)도 같은 규칙으로 전체 안에서 옮긴다', () => {
    const cats = [
      { id: 'c1', name: '약품', sortOrder: 0 },
      { id: 'c2', name: '치료 소모품', sortOrder: 1 },
      { id: 'c3', name: '사무·생활', sortOrder: 2 },
    ]
    expect(moveBy(cats, 'c2', -1)).toEqual(['c2', 'c1', 'c3'])
    expect(moveBy(cats, 'c2', 1)).toEqual(['c1', 'c3', 'c2'])
    expect(moveBy(cats, 'c1', -1)).toEqual(['c1', 'c2', 'c3'])
    expect(moveBy(cats, 'c3', 1)).toEqual(['c1', 'c2', 'c3'])
    expect(moveItem(cats, 'c1', 2)).toEqual(['c2', 'c3', 'c1'])
  })

  it('AC-7502.5: 받은 배열을 바꾸지 않는다', () => {
    const before = ids(sorted)
    moveBy(sorted, 'm2', 1)
    moveItem(sorted, 'm1', 2)
    expect(ids(sorted)).toEqual(before)
  })
})
