import { describe, expect, it } from 'vitest'
import { DEFAULT_SCORE_RULE, scoreItems, type ScoreRule } from '@/lib/location/score'
import { maxPoints, rankDongs, scoreDongs, TONE_LABELS, toneOf } from './rank'
import { CHAMI, GARAM, GARAM_FACTS, HANEUL, noTransit, SCAN_DONGS } from './scanData.test.data'

// 동네 훑기 동 점수·색 칸·순위(spec location REQ-7907 AC-7907.1·AC-7907.2·AC-7907.4, REQ-7919 AC-7919.3, design.md 8절).
// 동 점수는 score.ts scoreItems(값, 받은 설정, 'scan') 그대로 — 세 항목·'훑기 ○' 세부 항목만

const fresh = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule

describe('AC-7907.1: 동 점수 · 색 칸', () => {
  it('AC-7907.1: 동 점수는 scoreItems(값, 설정, scan) 그대로이고 손으로 센 값과 같다(89 · 23 · 68)', () => {
    const rows = scoreDongs(SCAN_DONGS, fresh())
    expect(rows.map((r) => [r.code10, r.total])).toEqual([
      [GARAM, 89],
      [HANEUL, 23],
      [CHAMI, 68],
    ])
    for (const [i, r] of rows.entries()) expect(r.result).toEqual(scoreItems(SCAN_DONGS[i].facts, fresh(), 'scan'))
    expect(rows[0].result.groups.map((g) => g.id)).toEqual(['people', 'rivals', 'transit'])
  })

  it('AC-7907.1: 훑기에서 안 쓰는 세부 값(승하차·아파트·진료 시간 빈틈)은 점수를 바꾸지 않는다', () => {
    const more = { ...GARAM_FACTS, flow: 999_999, apartments: 50_000, presale: 9000, gapCells: 30, welfareRate: 9 }
    const [a] = scoreDongs([{ code10: GARAM, name: '가람동', unmatched: false, facts: more }], fresh())
    expect(a.total).toBe(89)
  })

  it('AC-7907.1: 색 칸은 80 넘게 · 75~79 · 70~74 · 60~69 · 59 아래 다섯(점수 없음은 가장 연한 칸)', () => {
    expect([100, 80, 79, 75, 74, 70, 69, 60, 59, 0, null].map(toneOf)).toEqual([4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0])
    expect(TONE_LABELS).toEqual(['59 아래', '60~69', '70~74', '75~79', '80 넘게'])
  })

  it('AC-7907.1: 순위는 점수 높은 차례, 같으면 받은 차례, 점수 없는 동은 맨 뒤', () => {
    const rows = scoreDongs(
      [
        { code10: 'a', name: '가', unmatched: false, facts: {} },
        ...SCAN_DONGS,
        { code10: 'b', name: '나', unmatched: false, facts: { stationM: 200 } },
        { code10: 'c', name: '다', unmatched: false, facts: { stationM: 200 } },
      ],
      fresh(),
    )
    expect(rankDongs(rows).map((r) => r.code10)).toEqual(['b', 'c', GARAM, CHAMI, HANEUL, 'a'])
    expect(rows.find((r) => r.code10 === 'a')?.total).toBeNull()
  })
})

describe('AC-7907.4: 값 없는 항목은 빼고 남은 무게로', () => {
  it('AC-7907.4: 항목마다 만점 = 버림(100 × 무게 ÷ 값 있는 항목 무게 합), 값 없는 항목은 null', () => {
    const [garam] = scoreDongs(SCAN_DONGS, fresh())
    expect(maxPoints(garam.result, fresh())).toEqual([40, 33, 26])
    const [cut] = scoreDongs(noTransit().dongs, fresh())
    expect(cut.total).toBe(86)
    expect(cut.result.used).toBe(2)
    expect(maxPoints(cut.result, fresh())).toEqual([54, 45, null])
  })
})

describe('AC-7919.3: 설정을 바꾸면 바로 다시 센다', () => {
  it('AC-7919.3: 바깥 무게·나이대를 바꾸면 같은 값으로 점수·순위가 바뀐다', () => {
    const rule = fresh()
    rule.weights.people = 0
    rule.weights.transit = 0
    expect(rankDongs(scoreDongs(SCAN_DONGS, rule)).map((r) => [r.code10, r.total])).toEqual([
      [CHAMI, 99],
      [GARAM, 76],
      [HANEUL, 21],
    ])
    const ages = fresh()
    ages.bands = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(scoreDongs(SCAN_DONGS, ages).map((r) => r.total)).toEqual([89, 27, 68])
  })
})
