import { describe, expect, it } from 'vitest'
import { DEFAULT_SCORE_RULE, scoreItems, type ScoreRule } from '@/lib/location/score'
import type { ScoreFacts } from '@/types/location'
import { bandsText, UNMATCHED_TEXT, whyLine } from './why'
import { GARAM_FACTS, HANEUL_FACTS } from './scanData.test.data'

// 동마다 까닭 한 줄(spec location REQ-7907 AC-7907.1, 시안 ?s=scan 순위의 .why).
// 점수에 가장 크게 보탠 세부 항목(좋음 = 50점 이상)과 가장 크게 깎은 세부 항목(나쁨 = 50점 아래)을 값과 함께 한 줄로

const fresh = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule
const line = (facts: ScoreFacts, rule = fresh(), unmatched = false) => whyLine({ unmatched }, scoreItems(facts, rule, 'scan'), rule)

describe('AC-7907.1: 동마다 까닭 한 줄', () => {
  it('AC-7907.1: 좋은 것만 있으면 가장 크게 보탠 둘을 잇는다', () => {
    expect(line(GARAM_FACTS)).toBe('40세 이상 인구가 1km²에 10,000명으로 많고 역까지 200m로 가까워요.')
  })

  it('AC-7907.1: 좋은 것과 나쁜 것이 있으면 "~지만"으로 잇는다(거리는 distText)', () => {
    expect(line(HANEUL_FACTS)).toBe('60세 이상이 25%로 많지만 역까지 1.4km로 멀어요.')
  })

  it('AC-7907.1: 나쁜 것만 있으면 가장 크게 깎은 둘을 잇는다', () => {
    expect(line({ rivals: 6, newRivals: 3 })).toBe('경쟁 의원이 이미 6곳으로 많고 3년 새 문을 연 경쟁 의원이 3곳으로 많아요.')
    expect(line({ stationM: 1500, stops: 0 })).toBe('역까지 1.5km로 멀고 400m 안 정류장이 없어요.')
  })

  it('AC-7907.1: 하나뿐이면 그 한 문장', () => {
    expect(line({ stationM: 850 })).toBe('역까지 850m로 가까워요.')
    expect(line({ rivals: 0 })).toBe('경쟁 의원이 없어요.')
    expect(line({ trend: [{ ym: '2022-10', total: 100 }, { ym: '2026-10', total: 90 }] })).toBe('4년 사이 사람이 늘지 않았어요.')
    expect(line({ trend: [{ ym: '2022-10', total: 1000 }, { ym: '2026-10', total: 1090 }] })).toBe('4년 사이 사람이 9% 늘었어요.')
  })

  it('AC-7907.1: 값이 하나도 없으면 매길 자료가 없다고 적는다', () => {
    expect(line({})).toBe('점수를 매길 자료가 없어요.')
  })

  it('AC-7907.1: 무게 0인 세부 항목·항목과 시군구 값(산업단지 고용)은 까닭에 쓰지 않는다', () => {
    const rule = fresh()
    rule.items['t-station'] = { w: 0, best: 200, worst: 1500 }
    expect(line({ stationM: 200, stops: 10 }, rule)).toBe('400m 안 정류장이 10곳으로 많아요.')
    const noTransit = fresh()
    noTransit.weights.transit = 0
    expect(line({ stationM: 200, rivals: 0 }, noTransit)).toBe('경쟁 의원이 없어요.')
    // 점수는 있어도 적을 까닭이 없으면 빈 글(화면은 까닭 줄을 그리지 않음)
    expect(line({ industryEmployees: 50_000 })).toBe('')
  })

  it('AC-7907.1: 못 이은 동은 `이 동은 인구 자료와 잇지 못했어요`', () => {
    expect(UNMATCHED_TEXT).toBe('이 동은 인구 자료와 잇지 못했어요')
    expect(line(GARAM_FACTS, fresh(), true)).toBe(UNMATCHED_TEXT)
  })

  it('AC-7907.1: 밀도 문장의 나이는 고른 나이대를 따른다', () => {
    expect(bandsText([4, 5, 6, 7, 8, 9, 10])).toBe('40세 이상 인구')
    expect(bandsText([6, 7, 8, 9, 10])).toBe('60세 이상 인구')
    expect(bandsText([3, 2])).toBe('20~39세 인구')
    expect(bandsText([1, 3])).toBe('고른 나이대 인구')
    expect(bandsText([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe('인구')
    const rule = fresh()
    rule.bands = [6, 7, 8, 9, 10]
    // 60세 이상만 세면 가람동 1km²에 6,000명 → 60점
    expect(line({ areaM2: 1_000_000, people: GARAM_FACTS.people }, rule)).toBe('60세 이상이 60%로 많고 60세 이상 인구가 1km²에 6,000명으로 많아요.')
  })
})
