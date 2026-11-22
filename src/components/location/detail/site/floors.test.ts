import { describe, expect, it } from 'vitest'
import { buildingAge, floorRows, floorText, sameFloor, vacancyOf } from './floors'

// 건물 층 글·이 자리 찾기·빈 층 짐작(specs/location AC-7909.4, design.md 6절 building·stores).
// 층 이름은 건축물대장 층별개요와 상가정보가 같은 모양이다: 지1 · 1 · 옥탑 · 옥탑2, 모르면 '층 모름'

const FLOORS = [
  { label: '지2', usage: '주차장', m2: 380 },
  { label: '지1', usage: '주차장', m2: 380 },
  { label: '1', usage: '소매점', m2: 300 },
  { label: '1', usage: '휴게음식점', m2: 80 },
  { label: '2', usage: '의원', m2: 412 },
  { label: '3', usage: '의원', m2: 412 },
  { label: '4', usage: '사무소', m2: 412 },
  { label: '옥탑', usage: '계단실', m2: 20 },
  { label: '층 모름', usage: '창고', m2: 10 },
]

describe('AC-7909.4: 층 글', () => {
  it('AC-7909.4: 층 이름을 화면 글로 — 1 → 1층 · 지1 → 지하 1층 · 옥탑 · 옥탑2 → 옥탑 2층 · 모르는 글은 그대로', () => {
    expect(['1', '12', '지1', '지3', '옥탑', '옥탑2', '층 모름', 'M1'].map(floorText)).toEqual([
      '1층',
      '12층',
      '지하 1층',
      '지하 3층',
      '옥탑',
      '옥탑 2층',
      '층 모름',
      'M1',
    ])
  })

  it('AC-7909.4: 후보 층 글(사용자가 적음)과 건물 층이 같은지 — 숫자로 견주고, 지하·옥탑은 따로', () => {
    expect(sameFloor('3층', '3')).toBe(true)
    expect(sameFloor(' 3 ', '3')).toBe(true)
    expect(sameFloor('지상 3층', '3')).toBe(true)
    expect(sameFloor('지하 1층', '지1')).toBe(true)
    expect(sameFloor('B1', '지1')).toBe(true)
    expect(sameFloor('옥탑', '옥탑')).toBe(true)
    expect(sameFloor('옥탑 2층', '옥탑2')).toBe(true)
    expect(sameFloor('3층', '지3')).toBe(false)
    expect(sameFloor('2층', '옥탑2')).toBe(false)
    expect(sameFloor('옥탑', '1')).toBe(false)
    expect(sameFloor('', '1')).toBe(false)
    expect(sameFloor(null, '1')).toBe(false)
    expect(sameFloor('층 모름', '층 모름')).toBe(false)
  })

  it('AC-7909.4: 사용승인 뒤 햇수 — 해끼리 뺀다(시안 그대로), 날짜가 없거나 틀리면 없음', () => {
    expect(buildingAge('2009-05-20', '2026-11-22')).toBe(17)
    expect(buildingAge('2026-01-02', '2026-11-22')).toBe(0)
    expect(buildingAge(null, '2026-11-22')).toBeNull()
    expect(buildingAge('2009', '2026-11-22')).toBeNull()
  })
})

describe('AC-7909.4: 층별 표', () => {
  it('AC-7909.4: 위층부터(시안 차례), 같은 층 줄은 받은 차례 그대로, 층 모름은 맨 끝 · 이 자리 표시', () => {
    expect(floorRows(FLOORS, '3층')).toEqual([
      { label: '옥탑', usage: '계단실', m2: 20, here: false },
      { label: '4', usage: '사무소', m2: 412, here: false },
      { label: '3', usage: '의원', m2: 412, here: true },
      { label: '2', usage: '의원', m2: 412, here: false },
      { label: '1', usage: '소매점', m2: 300, here: false },
      { label: '1', usage: '휴게음식점', m2: 80, here: false },
      { label: '지1', usage: '주차장', m2: 380, here: false },
      { label: '지2', usage: '주차장', m2: 380, here: false },
      { label: '층 모름', usage: '창고', m2: 10, here: false },
    ])
  })

  it('AC-7909.4: 후보 층을 안 적었으면 이 자리 표시가 없다', () => {
    expect(floorRows(FLOORS, '').some((r) => r.here)).toBe(false)
  })
})

describe('AC-7909.4: 빈 칸 짐작(상가정보만 — 공실률 없음)', () => {
  it('AC-7909.4: 층마다 들어선 가게 수, 가게 없는 층은 빈 층 같음 — 주차장만 있는 층·층 모름은 빼고 위층부터', () => {
    const stores = [
      { floor: '1', count: 2 },
      { floor: '2', count: 1 },
      { floor: '1', count: 1 },
      { floor: '9', count: 4 },
      { floor: '층 모름', count: 3 },
    ]
    expect(vacancyOf(FLOORS, stores, '3층')).toEqual({
      rows: [
        { label: '옥탑', stores: 0, empty: true, here: false },
        { label: '4', stores: 0, empty: true, here: false },
        { label: '3', stores: 0, empty: true, here: true },
        { label: '2', stores: 1, empty: false, here: false },
        { label: '1', stores: 3, empty: false, here: false },
      ],
      empty: 3,
      unknownStores: 3,
    })
  })

  it('AC-7909.4: 둘레에 가게가 하나도 없으면 모든 층이 빈 층 같다', () => {
    const v = vacancyOf(FLOORS.slice(2, 5), [], '')
    expect(v.rows.map((r) => [r.label, r.stores, r.empty])).toEqual([
      ['2', 0, true],
      ['1', 0, true],
    ])
    expect(v.empty).toBe(2)
    expect(v.unknownStores).toBe(0)
  })

  it('AC-7909.4: 층이 주차장뿐이면 짐작할 줄이 없다', () => {
    expect(vacancyOf(FLOORS.slice(0, 2), [{ floor: '지1', count: 1 }], '')).toEqual({ rows: [], empty: 0, unknownStores: 0 })
  })
})
