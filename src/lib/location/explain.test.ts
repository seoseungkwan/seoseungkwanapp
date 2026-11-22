import { describe, expect, it } from 'vitest'
import type { Listing, ScoreFacts, SggAvg } from '@/types/location'
import { pyeongToM2 } from './area'
import { explainCandidate, explainScan, listingAverages, subCompareText, subFullText, subValueText, type ExplainAvg } from './explain'
import { DEFAULT_SCORE_RULE, fillScoreRule, SCORE_GROUPS, scoreItems, type ScoreItemRule, type ScoreRule } from './score'

// 점수 풀이(design.md 19절, requirements '화면 글 기본값' 점수 풀이 표). 순수 함수라 화면 없이 본다. 지어낸 이름·숫자만

const labelOf = (id: string) => SCORE_GROUPS.flatMap((g) => g.subs).find((s) => s.id === id)?.label
const BANDS = [1000, 1500, 2000, 2500, 3000, 3000, 2500, 2000, 1500, 700, 300] // 합 20,000 · 40세 이상 13,000 · 60세 이상 7,000

// 시군구 전체(견줄 값): 24.6km² · 380,000명 · 40세 이상 233,000 · 60세 이상 128,000
const SGG: SggAvg = {
  sggName: '예시구',
  areaM2: 24_600_000,
  total: 380000,
  bands: [30000, 32000, 40000, 45000, 50000, 55000, 45000, 35000, 28000, 15000, 5000],
  trendPct: 1.4,
  accidents: 14,
  schools: 52,
  seniors: 168,
  gyms: 142,
  stationM: 620,
  stops: 5,
}
const AVG: ExplainAvg = { sgg: SGG, listings: { rentPerPy: 100614, deposit: 105_000_000, premium: 25_000_000 } }

// 항목 다섯 모두 값이 있는 후보(범위 1km² — 밀도 셈을 쉽게)
const FACTS: ScoreFacts = {
  areaM2: 1_000_000,
  people: { total: 20000, bands: BANDS, households: 9000 },
  apartments: 2000,
  presale: 500,
  trend: [
    { ym: '2022-10', total: 19000 },
    { ym: '2026-10', total: 20000 },
  ],
  accidentSpots: 2,
  industryEmployees: 5000,
  schools: 4,
  seniorCenters: 12,
  gyms: 8,
  welfareRate: 3.2,
  rivals: 2,
  newRivals: 1,
  gapCells: 26,
  rivalEswt: 60000,
  homeEswt: 50000,
  stationM: 450,
  stops: 6,
  flow: 15000,
  floorLabel: '3층',
  elevators: 1,
  parking: 20,
  buildingAge: 18,
  pharmacies: 1,
  clinicsNear: 2,
  sign: 'yes',
  violation: null,
  rentPerPy: 100000,
  deposit: 100_000_000,
  premium: 0,
  savedRentsPerPy: [100000, 80000],
}

const withItem = (id: string, item: Record<string, number>): ScoreRule => {
  const r = fillScoreRule(DEFAULT_SCORE_RULE)
  return fillScoreRule({ ...r, items: { ...r.items, [id]: item } })
}

describe('AC-7920.3: 후보 점수 풀이(explainCandidate)', () => {
  it('AC-7920.3: 몫 = 항목 무게 몫 × 세부 무게 몫 × 100 — 세부 50점 이상은 올린 것(보탠 점수), 아래는 내린 것(놓친 점수) 큰 차례 셋', () => {
    const { up, down } = explainCandidate(FACTS, DEFAULT_SCORE_RULE, AVG)
    expect(up).toEqual([
      {
        id: 'p-density',
        label: labelOf('p-density'),
        valueText: '1km²에 13,000명',
        groupLabel: '사는 사람·수요',
        sub: 100,
        fullText: '1km²에 10,000명이면 100점',
        compareText: '예시구 전체 1km²에 9,471명',
        points: 12, // 100 × 30/100 × 40/100
        pointsText: '+12점',
      },
      {
        id: 't-station',
        label: labelOf('t-station'),
        valueText: '450m',
        groupLabel: '교통·흐름',
        sub: 80,
        fullText: '200m 이하면 100점 · 1,500m 이상이면 0점',
        compareText: '예시구 행정동 가운데 평균 620m',
        points: 6, // 80 × 20/100 × 40/100 = 6.4
        pointsText: '+6점',
      },
      {
        id: 'c-count',
        label: labelOf('c-count'),
        valueText: '2곳',
        groupLabel: '경쟁',
        sub: 66,
        fullText: '0곳이면 100점 · 6곳 이상이면 0점',
        compareText: null,
        points: 4, // 66 × 25/100 × 30/100 = 4.95
        pointsText: '+4점',
      },
    ])
    expect(down).toEqual([
      {
        id: 'c-perRival',
        label: labelOf('c-perRival'),
        valueText: '6,666명',
        groupLabel: '경쟁',
        sub: 33,
        fullText: '20,000명이면 100점',
        compareText: null,
        points: 5, // (100 − 33) × 25/100 × 35/100 = 5.86
        pointsText: '−5점',
      },
      {
        id: 'k-vsAvg',
        label: labelOf('k-vsAvg'),
        valueText: '평균보다 11% 비싸요',
        groupLabel: '비용',
        sub: 22,
        fullText: '−20% 이하면 100점 · 20% 이상이면 0점',
        compareText: null,
        points: 2, // 78 × 10/100 × 30/100 = 2.34
        pointsText: '−2점',
      },
      {
        id: 'p-apts',
        label: labelOf('p-apts'),
        valueText: '2,500세대',
        groupLabel: '사는 사람·수요',
        sub: 25,
        fullText: '10,000세대면 100점',
        compareText: null,
        points: 2, // 75 × 30/100 × 10/100 = 2.25
        pointsText: '−2점',
      },
    ])
  })

  it('AC-7920.3: 무게 0·값 없는 세부 항목은 빼고 남은 세부 무게로 몫을 나누며, 1점이 안 되면 `1점 아래`다', () => {
    const facts: ScoreFacts = { areaM2: 1_000_000, people: { total: 20000, bands: BANDS, households: 9000 }, welfareRate: 3.2 }
    // 처음 무게: 의료급여·차상위 비율(무게 0)은 값이 있어도 안 나온다
    const first = explainCandidate(facts, DEFAULT_SCORE_RULE, { sgg: null, listings: null })
    expect([...first.up, ...first.down].map((r) => r.id)).toEqual(['p-density', 'p-senior', 'p-households'])
    // 세대 수 무게 1: 몫 = 30/30 × 1/56 × 100 → 놓친 점수 55 × 1/56 = 0.98
    const small = explainCandidate(facts, withItem('p-households', { w: 1, full: 20000 }), { sgg: null, listings: null })
    expect(small.up.map((r) => [r.id, r.points, r.pointsText])).toEqual([
      ['p-density', 71, '+71점'], // 100 × 40/56
      ['p-senior', 26, '+26점'], // 100 × 15/56
    ])
    expect(small.down.map((r) => [r.id, r.points, r.pointsText, r.compareText])).toEqual([['p-households', 0, '1점 아래', null]])
    // 무게를 올리면 나온다: 3.2 ÷ 5 → 64점(올린 것)
    const welfare = explainCandidate(facts, withItem('p-welfare', { w: 10, full: 5 }), { sgg: null, listings: null })
    expect(welfare.up.find((r) => r.id === 'p-welfare')).toMatchObject({ valueText: '3.2%', sub: 64, fullText: '5%면 100점' })
  })

  it('AC-7920.3: 값 있는 항목 무게 합으로 나눈다 — 항목 무게가 0이면 그 항목 세부 항목은 안 나오고, 다 없으면 빈 풀이', () => {
    const r = fillScoreRule(DEFAULT_SCORE_RULE)
    const noCost = fillScoreRule({ ...r, weights: { ...r.weights, cost: 0 } })
    const rows = explainCandidate(FACTS, noCost, AVG)
    expect([...rows.up, ...rows.down].some((x) => x.groupLabel === '비용')).toBe(false)
    // 비용을 빼면 항목 무게 합 90: 밀도 100 × 30/90 × 40/100 = 13.3
    expect(rows.up[0]).toMatchObject({ id: 'p-density', points: 13 })
    expect(explainCandidate({}, DEFAULT_SCORE_RULE, { sgg: null, listings: null })).toEqual({ up: [], down: [] })
  })

  it('AC-7920.3: 줄마다 세부 점수는 score.ts scoreItems와 같은 값이다', () => {
    const score = scoreItems(FACTS, DEFAULT_SCORE_RULE)
    const subs = new Map(score.groups.flatMap((g) => g.subs).map((s) => [s.id, s.score]))
    const { up, down } = explainCandidate(FACTS, DEFAULT_SCORE_RULE, AVG)
    for (const row of [...up, ...down]) expect(row.sub).toBe(subs.get(row.id))
  })
})

describe('AC-7920.3: 값 글 · 만점 기준 글 · 견줄 값 글', () => {
  it("AC-7920.3: 값 글은 '화면 글 기본값' 점수 풀이 표 그대로(거리 distText, 원 wonText, 만 원 manText)", () => {
    const cases: [string, number, string][] = [
      ['p-density', 13000.7, '1km²에 13,000명'],
      ['p-senior', 35.9, '35%'],
      ['p-households', 9000, '9,000세대'],
      ['p-apts', 2500, '2,500세대'],
      ['p-accidents', 2, '2곳'],
      ['p-industry', 5000, '5,000명'],
      ['p-schools', 4, '4곳'],
      ['p-facilities', 20, '20곳'],
      ['p-welfare', 3.2, '3.2%'],
      ['p-welfare', 2, '2%'],
      ['c-count', 2, '2곳'],
      ['c-perRival', 20000 / 3, '6,666명'],
      ['c-newOpen', 1, '1곳'],
      ['c-gaps', 26, '26칸'],
      ['t-station', 450, '450m'],
      ['t-station', 1450, '1.4km'],
      ['t-stops', 6, '6곳'],
      ['t-flow', 15000, '하루 15,000명'],
      ['s-floor', 3, '3층'],
      ['s-floor', -1, '지하 1층'],
      ['s-elevator', 1, '1대'],
      ['s-parking', 20, '20대'],
      ['s-age', 18, '18년'],
      ['s-neighbors', 1, '1곳'],
      ['s-sign', 1, '보여요'],
      ['s-sign', 0, '가려요'],
      ['s-violation', 1, '없음'],
      ['s-violation', 0, '있음'],
      ['s-clinics', 2, '2곳'],
      ['k-rentPy', 100000, '평당 100,000원'],
      ['k-deposit', 100_000_000, '1억 원'],
      ['k-deposit', 30_500_000, '3,050만 원'],
      ['k-premium', 0, '없음'],
      ['k-premium', 50_000_000, '5,000만 원'],
      ['k-vsAvg', 11.11, '평균보다 11% 비싸요'],
      ['k-vsAvg', -25.5, '평균보다 25% 싸요'],
      ['k-vsAvg', 0.5, '저장한 매물 평균과 같아요'],
    ]
    for (const [id, value, text] of cases) expect([id, subValueText(id, value)]).toEqual([id, text])
  })

  it('AC-7920.3: 인구 추세·진료비 차이는 점수가 0에서 멈춘 값 대신 후보 값으로 늘고 준 것을 쓴다(0.1 버림)', () => {
    const trend = (from: number, to: number): ScoreFacts => ({ trend: [{ ym: '2022-10', total: from }, { ym: '2026-10', total: to }] })
    expect(subValueText('p-trend', 5.26, trend(19000, 20000))).toBe('4년 사이 +5.2%')
    expect(subValueText('p-trend', 0, trend(20000, 19000))).toBe('4년 사이 −5%')
    expect(subValueText('p-trend', 0, trend(20000, 19975))).toBe('4년 사이 −0.1%')
    const price = (rivalEswt: number, homeEswt: number): ScoreFacts => ({ rivalEswt, homeEswt })
    expect(subValueText('c-price', 20, price(60000, 50000))).toBe('둘레 평균이 20% 비싸요')
    expect(subValueText('c-price', 1.5, price(50750, 50000))).toBe('둘레 평균이 1.5% 비싸요')
    expect(subValueText('c-price', 0, price(45000, 50000))).toBe('둘레 평균이 10% 싸요')
    expect(subValueText('c-price', 0.6, price(50300, 50000))).toBe('둘레 평균과 지금 의원 값이 같아요')
  })

  it('AC-7920.3: 만점 기준 글 — 많을수록 `{앞 글} {기준}{단위}면 100점`, 적을수록 둘(좋은 값 0이면 `0곳이면`·`없으면`), 고른 값 하나, 음수는 −', () => {
    const cases: [string, ScoreItemRule, string][] = [
      ['p-density', { w: 40, full: 10000 }, '1km²에 10,000명이면 100점'],
      ['p-senior', { w: 15, full: 25 }, '25%면 100점'],
      ['p-households', { w: 5, full: 20000 }, '20,000세대면 100점'],
      ['p-trend', { w: 10, full: 5 }, '4년 사이 5% 늘면 100점'],
      ['p-accidents', { w: 5, full: 3 }, '3곳이면 100점'],
      ['p-industry', { w: 5, full: 20000 }, '20,000명이면 100점'],
      ['p-welfare', { w: 0, full: 5 }, '5%면 100점'],
      ['p-welfare', { w: 0, best: 1, worst: 5 }, '1% 이하면 100점 · 5% 이상이면 0점'],
      ['c-count', { w: 30, best: 0, worst: 6 }, '0곳이면 100점 · 6곳 이상이면 0점'],
      ['c-newOpen', { w: 15, best: 0, worst: 3 }, '0곳이면 100점 · 3곳 이상이면 0점'],
      ['c-gaps', { w: 10, full: 10 }, '10칸이면 100점'],
      ['c-price', { w: 10, full: 20 }, '둘레 평균이 20% 비싸면 100점'],
      ['t-station', { w: 40, best: 200, worst: 1500 }, '200m 이하면 100점 · 1,500m 이상이면 0점'],
      ['t-flow', { w: 40, full: 30000 }, '30,000명이면 100점'],
      ['s-floor', { w: 25, best: 1, worst: 5 }, '1층 이하면 100점 · 5층 이상이면 0점'],
      ['s-elevator', { w: 20, full: 1 }, '1대면 100점'],
      ['s-age', { w: 10, best: 5, worst: 30 }, '5년 이하면 100점 · 30년 이상이면 0점'],
      ['s-sign', { w: 10, full: 1 }, "'보여요'이면 100점"],
      ['s-violation', { w: 10, full: 1 }, "'없음'이면 100점"],
      ['s-clinics', { w: 0, full: 3 }, '3곳이면 100점'],
      ['k-rentPy', { w: 35, best: 50000, worst: 200000 }, '50,000원 이하면 100점 · 200,000원 이상이면 0점'],
      ['k-deposit', { w: 15, best: 30_000_000, worst: 200_000_000 }, '3,000만 원 이하면 100점 · 2억 원 이상이면 0점'],
      ['k-premium', { w: 20, best: 0, worst: 100_000_000 }, '없으면 100점 · 1억 원 이상이면 0점'],
      ['k-vsAvg', { w: 30, best: -20, worst: 20 }, '−20% 이하면 100점 · 20% 이상이면 0점'],
    ]
    for (const [id, item, text] of cases) expect([id, subFullText(id, item)]).toEqual([id, text])
  })

  it('AC-7920.3: 견줄 값은 시군구 전체(sggAvg)·저장한 매물 평균으로 셀 수 있는 세부 항목만, 나머지는 null', () => {
    const facts: ScoreFacts = { areaM2: Math.PI * 1000 * 1000 }
    const cmp = (id: string, avg: ExplainAvg = AVG, rule: ScoreRule = DEFAULT_SCORE_RULE) => subCompareText(id, facts, rule, avg)
    expect(cmp('p-density')).toBe('예시구 전체 1km²에 9,471명') // 233,000 ÷ 24.6km²
    expect(cmp('p-senior')).toBe('예시구 전체 33%') // 128,000 ÷ 380,000
    expect(cmp('p-trend')).toBe('예시구 전체 4년 사이 +1.4%')
    expect(cmp('p-trend', { ...AVG, sgg: { ...SGG, trendPct: -0.3 } })).toBe('예시구 전체 4년 사이 −0.3%')
    expect(cmp('p-accidents')).toBe('예시구 평균 밀도면 1곳') // 14 ÷ 24.6km² × 3.14km²
    expect(cmp('p-schools')).toBe('예시구 평균 밀도면 6곳')
    expect(cmp('p-facilities')).toBe('예시구 평균 밀도면 39곳') // (경로당 168 + 체력단련장 142)
    expect(cmp('t-station')).toBe('예시구 행정동 가운데 평균 620m')
    expect(cmp('t-stops')).toBe('예시구 행정동 가운데 평균 5곳')
    expect(cmp('k-rentPy')).toBe('저장한 매물 평균 평당 100,614원')
    expect(cmp('k-deposit')).toBe('저장한 매물 평균 1억 500만 원')
    expect(cmp('k-premium')).toBe('저장한 매물 평균 2,500만 원')
    // 고른 나이대를 따른다: 60세 이상만 → 128,000 ÷ 24.6km²
    const r = fillScoreRule(DEFAULT_SCORE_RULE)
    expect(cmp('p-density', AVG, fillScoreRule({ ...r, bands: [6, 7, 8, 9, 10] }))).toBe('예시구 전체 1km²에 5,203명')
    for (const id of ['p-households', 'p-apts', 'p-industry', 'p-welfare', 'c-count', 'c-perRival', 'c-newOpen', 'c-gaps', 'c-price', 't-flow', 's-floor', 's-clinics', 'k-vsAvg'])
      expect([id, cmp(id)]).toEqual([id, null])
    // 견줄 값이 없으면 null
    const none: ExplainAvg = { sgg: null, listings: null }
    for (const id of ['p-density', 'p-senior', 't-station', 'k-rentPy']) expect([id, cmp(id, none)]).toEqual([id, null])
    expect(cmp('p-schools', { ...AVG, sgg: { ...SGG, schools: null } })).toBeNull()
    expect(cmp('k-deposit', { ...AVG, listings: { rentPerPy: 100614, deposit: null, premium: null } })).toBeNull()
  })

  it('AC-7920.3: 저장한 매물 평균(listingAverages) — 평당 월세는 listings.ts 평균, 보증금·권리금은 금액 평균(버림), 2개 미만이면 null', () => {
    const base: Listing = {
      id: 'a',
      candidateId: null,
      title: '예시빌딩 3층',
      url: '',
      areaM2: pyeongToM2(52),
      floorLabel: '3층',
      deposit: 100_000_000,
      rent: 5_200_000,
      premium: 0,
      mgmt: null,
      brokerId: null,
      brokerNote: '',
      memo: '',
      lat: null,
      lng: null,
      createdAt: '2026-11-14T00:00:00.000Z',
      updatedAt: '2026-11-14T00:00:00.000Z',
    }
    const other: Listing = { ...base, id: 'b', areaM2: pyeongToM2(30), rent: 2_400_000, deposit: 50_000_001, premium: 30_000_000 }
    expect(listingAverages([base, other])).toEqual({ rentPerPy: 90000, deposit: 75_000_000, premium: 15_000_000 })
    expect(listingAverages([base])).toEqual({ rentPerPy: null, deposit: null, premium: null })
    expect(listingAverages([base, { ...other, areaM2: null, premium: null }])).toEqual({ rentPerPy: null, deposit: 75_000_000, premium: null })
  })
})

describe('AC-7920.4: 동네 훑기 순위 풀이(explainScan)', () => {
  // 세 동(1km²): 사는 사람(밀도·60세 이상·세대) + 교통(역·정류장)만 값이 있다
  const dong = (band4: number, band6: number, stationM: number, stops: number): ScoreFacts => ({
    areaM2: 1_000_000,
    people: { total: 20000, bands: [20000 - band4 - band6, 0, 0, 0, band4, 0, band6, 0, 0, 0, 0], households: 10000 },
    stationM,
    stops,
  })
  const DONGS = [dong(8000, 2000, 200, 5), dong(3000, 5000, 850, 5), dong(2500, 3500, 1500, 8)]
  const results = DONGS.map((f) => scoreItems(f, DEFAULT_SCORE_RULE, 'scan'))

  it('AC-7920.4: 행정동 평균 세부 점수보다 (차이 × 세부 몫)이 가장 큰 것은 올린 것, 가장 작은 것은 내린 것', () => {
    // 세부 점수: 밀도 100·80·60(평균 80) · 60세 이상 40·100·70(70) · 세대 50 · 역 100·50·0(50) · 정류장 50·50·80(60)
    // 몫: 밀도 40 · 60세 이상 15 · 세대 5 · 역 26.7 · 정류장 13.3
    const rows = explainScan(results, DEFAULT_SCORE_RULE)
    expect(rows.map((r) => [r.up?.id ?? null, r.down?.id ?? null])).toEqual([
      ['t-station', 'p-senior'], // +13.3 · −4.5
      ['p-senior', 't-stops'], // +4.5 · −1.3
      ['t-stops', 't-station'], // +2.7 · −13.3
    ])
    expect(rows[0]!.up).toEqual({ id: 't-station', label: labelOf('t-station'), valueText: '200m', text: `${labelOf('t-station')} 200m` })
    expect(rows[0]!.down).toMatchObject({ id: 'p-senior', valueText: '10%', text: `${labelOf('p-senior')} 10%` })
    expect(rows[2]!.down).toMatchObject({ valueText: '1.5km' })
  })

  it('AC-7920.4: 차이가 0.5점 이상·−0.5점 이하일 때만 쓰고(없는 쪽은 null), 평균은 값 있는 동만으로 낸다', () => {
    const rule = withItem('t-stops', { w: 20, full: 100 }) // 정류장 1곳 = 1점
    const only = (stops: number | null): ScoreFacts => ({ stops })
    const rows = explainScan([only(1), only(0), only(null)].map((f) => scoreItems(f, rule, 'scan')), rule)
    // 평균 0.5(값 없는 동은 뺌), 몫 100 → +0.5 · −0.5
    expect(rows.map((r) => [r.up?.id ?? null, r.down?.id ?? null])).toEqual([
      ['t-stops', null],
      [null, 't-stops'],
      [null, null],
    ])
    const same = explainScan([only(5), only(5)].map((f) => scoreItems(f, DEFAULT_SCORE_RULE, 'scan')), DEFAULT_SCORE_RULE)
    expect(same).toEqual([
      { up: null, down: null },
      { up: null, down: null },
    ])
    expect(explainScan([], DEFAULT_SCORE_RULE)).toEqual([])
  })

  it('AC-7920.4: 동 값(facts)을 같이 주면 인구 추세 값 글이 준 것도 보인다', () => {
    const trend = (from: number, to: number): ScoreFacts => ({ trend: [{ ym: '2022-10', total: from }, { ym: '2026-10', total: to }] })
    const facts = [trend(19000, 20000), trend(20000, 19000)]
    const rows = explainScan(facts.map((f) => scoreItems(f, DEFAULT_SCORE_RULE, 'scan')), DEFAULT_SCORE_RULE, facts)
    expect(rows[0]!.up).toMatchObject({ id: 'p-trend', valueText: '4년 사이 +5.2%' })
    expect(rows[1]!.down).toMatchObject({ id: 'p-trend', valueText: '4년 사이 −5%' })
  })
})
