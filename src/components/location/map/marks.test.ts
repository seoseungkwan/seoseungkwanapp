import { describe, expect, it } from 'vitest'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import type { DeptId, DeptRule, Point, Rival } from '@/types/location'
import { clinicMarks, mapLegend } from './marks'

// 작은 지도의 의원 점(specs/location AC-7916.1 · AC-7921.4, design.md 13·18절, 시안 miniMap):
// 대표 과목(lib/location/depts.ts deptOf)이 경쟁 = 주황(rival) · 한의원이 둘레로 보기 = 회색(korean) · 그 밖 둘레로 보기 = 연보라 작은 점(other) ·
// 안 보기 = 안 찍음. 점 자리는 그날 값의 심평원 좌표(at, 공공 자료). 범례 글은 시안 그대로

const at = (n: number): Point => ({ lat: 37.5 + n / 1000, lng: 127.03 + n / 1000 })
const clinic = (name: string, depts: DeptId[], distM: number, n = 0): Rival => ({
  name,
  depts,
  at: at(n),
  distM,
  sameBuilding: distM <= 30,
  address: '',
  doctors: null,
  openedYear: null,
})
const kindsOf = (marks: ReturnType<typeof clinicMarks>) => marks.map((m) => [m.label, m.kind])

describe('AC-7916.1 clinicMarks 의원 점 종류', () => {
  it('AC-7916.1 처음 설정: 경쟁 과목 = 주황(rival) · 한의원 = 회색(korean) · 그 밖 둘레로 보기 = 연보라(other), 점 = 심평원 좌표(at)', () => {
    const rivals = [
      clinic('예시정형외과의원', ['ortho'], 120, 1),
      clinic('예시재활의학과의원', ['rehab'], 300, 2),
      clinic('예시한의원', ['korean'], 200, 3),
      clinic('예시내과의원', ['im'], 80, 4),
      clinic('예시치과의원', ['dental'], 90, 5),
    ]
    const marks = clinicMarks(rivals, DEFAULT_DEPT_RULE, 1000)
    expect(kindsOf(marks)).toEqual([
      ['예시정형외과의원', 'rival'],
      ['예시재활의학과의원', 'rival'],
      ['예시한의원', 'korean'],
      ['예시내과의원', 'other'],
      ['예시치과의원', 'other'],
    ])
    expect(marks.map((m) => m.at)).toEqual(rivals.map((r) => r.at))
    expect(new Set(marks.map((m) => m.id)).size).toBe(marks.length)
    expect(marks.every((m) => m.outside !== true)).toBe(true)
  })

  it('AC-7921.4 대표 과목은 deptOf: 이름에 든 과목이 먼저 — 찾은 과목에 경쟁 과목이 있어도 이름이 내과면 연보라', () => {
    const marks = clinicMarks(
      [
        clinic('예시내과의원', ['im', 'ortho'], 100, 1),
        clinic('예시신경외과의원', ['im', 'ns'], 100, 2),
        clinic('예시의원', ['im', 'pain'], 100, 3),
      ],
      DEFAULT_DEPT_RULE,
      1000,
    )
    expect(kindsOf(marks)).toEqual([
      ['예시내과의원', 'other'],
      ['예시신경외과의원', 'rival'],
      ['예시의원', 'rival'],
    ])
  })

  it('AC-7916.1 안 보기 과목은 찍지 않는다 — 과목이 모두 안 보기면 빠지고, 남은 과목이 있으면 그 과목으로', () => {
    const rule: DeptRule = { v: 1, rival: ['ortho'], hide: ['im', 'dental'] }
    const marks = clinicMarks(
      [
        clinic('예시내과의원', ['im'], 100, 1),
        clinic('예시치과의원', ['dental'], 100, 2),
        clinic('예시의원', ['im', 'ent'], 100, 3),
        clinic('예시정형외과의원', ['ortho'], 100, 4),
        clinic('예시마취통증의학과의원', ['pain'], 100, 5),
      ],
      rule,
      1000,
    )
    expect(kindsOf(marks)).toEqual([
      ['예시의원', 'other'],
      ['예시정형외과의원', 'rival'],
      ['예시마취통증의학과의원', 'other'],
    ])
  })

  it('AC-7916.1 한의원을 경쟁 의원으로 고르면 주황, 안 보기면 안 찍는다', () => {
    const rivals = [clinic('예시한의원', ['korean'], 100)]
    expect(kindsOf(clinicMarks(rivals, { v: 1, rival: ['ortho', 'korean'], hide: [] }, 1000))).toEqual([['예시한의원', 'rival']])
    expect(clinicMarks(rivals, { v: 1, rival: ['ortho'], hide: ['korean'] }, 1000)).toEqual([])
  })

  it('AC-7916.1 경쟁 과목이 하나도 없으면 주황 점이 없다(모두 둘레로 보기)', () => {
    const marks = clinicMarks([clinic('예시정형외과의원', ['ortho'], 100), clinic('예시한의원', ['korean'], 100, 1)], { v: 1, rival: [], hide: [] }, 1000)
    expect(kindsOf(marks)).toEqual([
      ['예시정형외과의원', 'other'],
      ['예시한의원', 'korean'],
    ])
  })

  it('AC-7916.1 범위 밖(거리 > 반지름)은 흐리게(outside), 경계 딱 그 거리는 범위 안', () => {
    const marks = clinicMarks(
      [clinic('예시정형외과의원', ['ortho'], 500, 1), clinic('예시내과의원', ['im'], 501, 2), clinic('예시한의원', ['korean'], 2400, 3)],
      DEFAULT_DEPT_RULE,
      500,
    )
    expect(marks.map((m) => m.outside === true)).toEqual([false, true, true])
  })

  it('AC-7916.1 의원이 없으면 점도 없다', () => {
    expect(clinicMarks([], DEFAULT_DEPT_RULE, 1000)).toEqual([])
  })
})

describe('AC-7916.1 mapLegend 범례 글(시안 그대로)', () => {
  it('AC-7916.1 처음 설정(한의원 둘레로 보기): 회색 점 = 한의원(따로 셈)이 있다', () => {
    expect(mapLegend(DEFAULT_DEPT_RULE)).toBe(
      '파란 표시 = 후보 · 주황 점 = 경쟁 의원 · 회색 점 = 한의원(따로 셈) · 연보라 작은 점 = 둘레 다른 과 의원 · 검은 네모 = 역 · 흐린 점 = 범위 밖',
    )
  })

  it('AC-7916.1 한의원이 경쟁 의원이거나 안 보기면 회색 점 글이 없다', () => {
    const without = '파란 표시 = 후보 · 주황 점 = 경쟁 의원 · 연보라 작은 점 = 둘레 다른 과 의원 · 검은 네모 = 역 · 흐린 점 = 범위 밖'
    expect(mapLegend({ v: 1, rival: ['ortho', 'korean'], hide: [] })).toBe(without)
    expect(mapLegend({ v: 1, rival: ['ortho'], hide: ['korean'] })).toBe(without)
  })

  it('AC-7916.1 범례 글에 영어 낱말이 없다', () => {
    for (const rule of [DEFAULT_DEPT_RULE, { v: 1, rival: [], hide: ['korean'] } as DeptRule]) expect(mapLegend(rule)).not.toMatch(/[A-Za-z]/)
  })
})
