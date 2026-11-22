import { describe, expect, it } from 'vitest'
import {
  AGE_BANDS,
  DEFAULT_SCORE_RULE,
  RULE_TEXT,
  SCORE_GROUPS,
  checkScoreRule,
  fillScoreRule,
  floorNumber,
  scoreItems,
  subScore,
  type ScoreFacts,
  type ScoreResult,
  type ScoreRule,
  type SubId,
} from './score'

// 입지 분석 점수(design.md 8절). 숫자는 손으로 센 값이다 — 식이 바뀌면 이 시험이 먼저 깨진다

const clone = (rule: ScoreRule): ScoreRule => structuredClone(rule)
const sub = (r: ScoreResult, id: SubId) => r.groups.flatMap((g) => g.subs).find((s) => s.id === id)
const group = (r: ScoreResult, id: string) => r.groups.find((g) => g.id === id)

// 후보 하나의 값을 모두 채운 견본(범위 1km² — 셈을 쉽게). 세부 점수는 줄 끝 주석
const FULL: ScoreFacts = {
  areaM2: 1_000_000,
  // 40세 이상 = 2,000 + 2,000 + 1,000 × 3 + 500 × 2 = 8,000명/km² → 80 · 60세 이상 4,000 ÷ 16,000 = 25% → 100 · 세대 5,000 → 25
  people: { total: 16000, bands: [2000, 2000, 2000, 2000, 2000, 2000, 1000, 1000, 1000, 500, 500], households: 5000 },
  apartments: 3000, // + 입주 예정 1,000 = 4,000세대 → 40
  presale: 1000,
  trend: [
    { ym: '2023-10', total: 15200 },
    { ym: '2022-10', total: 15000 },
    { ym: '2025-10', total: 15600 },
  ], // 4% → 80
  accidentSpots: 1, // 33
  industryEmployees: 5000, // 25
  schools: 2, // 40
  seniorCenters: 10, // + 체력단련장 5 = 15곳 → 50
  gyms: 5,
  welfareRate: 4.2, // 많을수록 · 5% → 84(처음 무게 0이라 항목 점수는 그대로)
  rivals: 3, // 적을수록 0~6 → 50 · 1곳당 16,000 ÷ 4 = 4,000명 → 20
  newRivals: 1, // 적을수록 0~3 → 66
  gapCells: 5, // 50
  rivalEswt: 60000, // (60,000 − 50,000) ÷ 50,000 = 20% → 100
  homeEswt: 50000,
  stationM: 850, // 적을수록 200~1,500 → 50
  stops: 4, // 40
  flow: null, // 군 지역 — 값 없음
  floorLabel: '3층', // 적을수록 1~5 → 50
  elevators: 1, // 100
  parking: 12, // 40
  buildingAge: 10, // 적을수록 5~30 → 80
  pharmacies: 0, // 0
  sign: 'yes', // 100
  violation: 'unknown', // 값 없음
  clinicsNear: 2, // 같은 건물·옆 건물 의원 2곳 → 66(처음 무게 0이라 자리 점수에는 안 들어감)
  rentPerPy: 80000, // 적을수록 5만~20만 → 80
  deposit: 50_000_000, // 적을수록 3,000만~2억 → 88
  premium: 20_000_000, // 적을수록 0~1억 → 80
  savedRentsPerPy: [80000, 60000, 100000], // 평균 80,000 → 0% → 적을수록 −20~20 → 50
}

describe('AC-7911.1 DEFAULT_SCORE_RULE·SCORE_GROUPS — design.md 8절 표 그대로', () => {
  it('AC-7911.1: 처음 설정은 바깥 무게 30·25·20·15·10, 나이대 40세 이상, 세부 무게·기준이 표 그대로다', () => {
    expect(DEFAULT_SCORE_RULE).toEqual({
      v: 1,
      weights: { people: 30, rivals: 25, transit: 20, site: 15, cost: 10 },
      bands: [4, 5, 6, 7, 8, 9, 10],
      items: {
        'p-density': { w: 40, full: 10000 },
        'p-senior': { w: 15, full: 25 },
        'p-households': { w: 5, full: 20000 },
        'p-apts': { w: 10, full: 10000 },
        'p-trend': { w: 10, full: 5 },
        'p-accidents': { w: 5, full: 3 },
        'p-industry': { w: 5, full: 20000 },
        'p-schools': { w: 5, full: 5 },
        'p-facilities': { w: 5, full: 30 },
        'p-welfare': { w: 0, full: 5 },
        'c-count': { w: 30, best: 0, worst: 6 },
        'c-perRival': { w: 35, full: 20000 },
        'c-newOpen': { w: 15, best: 0, worst: 3 },
        'c-gaps': { w: 10, full: 10 },
        'c-price': { w: 10, full: 20 },
        't-station': { w: 40, best: 200, worst: 1500 },
        't-stops': { w: 20, full: 10 },
        't-flow': { w: 40, full: 30000 },
        's-floor': { w: 25, best: 1, worst: 5 },
        's-elevator': { w: 20, full: 1 },
        's-parking': { w: 15, full: 30 },
        's-age': { w: 10, best: 5, worst: 30 },
        's-neighbors': { w: 10, full: 1 },
        's-sign': { w: 10, full: 1 },
        's-violation': { w: 10, full: 1 },
        's-clinics': { w: 0, full: 3 },
        'k-rentPy': { w: 35, best: 50000, worst: 200000 },
        'k-deposit': { w: 15, best: 30_000_000, worst: 200_000_000 },
        'k-premium': { w: 20, best: 0, worst: 100_000_000 },
        'k-vsAvg': { w: 30, best: -20, worst: 20 },
      },
    })
  })

  it('AC-7911.1: 처음 설정 JSON은 DB 한도 4,000바이트 안이다', () => {
    expect(new TextEncoder().encode(JSON.stringify(DEFAULT_SCORE_RULE)).length).toBeLessThanOrEqual(4000)
  })

  it('AC-7911.1: 항목 다섯은 이름·무게·훑기 여부가 표 그대로이고, 세부 항목 차례가 처음 설정과 같다(목록 한 곳)', () => {
    expect(SCORE_GROUPS.map((g) => [g.id, g.name, g.w, g.scan])).toEqual([
      ['people', '사는 사람·수요', 30, true],
      ['rivals', '경쟁', 25, true],
      ['transit', '교통·흐름', 20, true],
      ['site', '자리', 15, false],
      ['cost', '비용', 10, false],
    ])
    expect(SCORE_GROUPS.flatMap((g) => g.subs.map((s) => s.id))).toEqual(Object.keys(DEFAULT_SCORE_RULE.items))
    for (const g of SCORE_GROUPS) {
      expect(DEFAULT_SCORE_RULE.weights[g.id]).toBe(g.w)
      // 세부 무게는 항목마다 합 100(표의 처음 값)
      expect(g.subs.reduce((a, s) => a + s.w, 0)).toBe(100)
    }
  })

  it('AC-7911.1: 세부 항목마다 값 설명·까닭·방향이 있고, 많을수록은 기준 하나(full)·적을수록은 둘(best·worst)이다', () => {
    for (const s of SCORE_GROUPS.flatMap((g) => g.subs)) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.why.length).toBeGreaterThan(0)
      const item = DEFAULT_SCORE_RULE.items[s.id]
      expect(item.w).toBe(s.w)
      if (s.dir === 'more') expect(item).toEqual({ w: s.w, full: s.full })
      else expect(item).toEqual({ w: s.w, best: s.best, worst: s.worst })
    }
    expect(
      SCORE_GROUPS.flatMap((g) => g.subs)
        .filter((s) => s.dir === 'less')
        .map((s) => s.id),
    ).toEqual(['c-count', 'c-newOpen', 't-station', 's-floor', 's-age', 'k-rentPy', 'k-deposit', 'k-premium', 'k-vsAvg'])
  })

  it('AC-7911.1: 동네 훑기(○)에 쓰는 세부 항목은 표의 열셋뿐이다 — 나머지는 후보에서만', () => {
    expect(
      SCORE_GROUPS.flatMap((g) => g.subs)
        .filter((s) => s.scan)
        .map((s) => s.id),
    ).toEqual([
      'p-density',
      'p-senior',
      'p-households',
      'p-trend',
      'p-accidents',
      'p-industry',
      'p-schools',
      'p-facilities',
      'c-count',
      'c-perRival',
      'c-newOpen',
      't-station',
      't-stops',
    ])
  })

  it('AC-7911.1: 나이대는 10세 11칸이다', () => {
    expect(AGE_BANDS).toEqual(['0~9세', '10~19세', '20~29세', '30~39세', '40~49세', '50~59세', '60~69세', '70~79세', '80~89세', '90~99세', '100세 이상'])
  })

  it('AC-7911.1: 처음 설정은 고칠 수 없다(되돌리기 값이 몰래 바뀌지 않음)', () => {
    expect(() => {
      ;(DEFAULT_SCORE_RULE.weights as Record<string, number>).people = 99
    }).toThrow()
    expect(() => {
      DEFAULT_SCORE_RULE.bands.push(3)
    }).toThrow()
    expect(DEFAULT_SCORE_RULE.weights.people).toBe(30)
  })
})

describe('AC-7919.2 subScore — 많을수록·적을수록 식의 끝', () => {
  it('AC-7919.2: 많을수록 좋음 = 버림(min(100, max(0, 값) × 100 ÷ 기준)) — 기준과 같음·넘음·사이·0·음수', () => {
    const item = { w: 10, full: 10 }
    expect(subScore(10, item)).toBe(100)
    expect(subScore(15, item)).toBe(100)
    expect(subScore(5, item)).toBe(50)
    expect(subScore(3.33, item)).toBe(33)
    expect(subScore(9.999, item)).toBe(99)
    expect(subScore(0, item)).toBe(0)
    expect(subScore(-4, item)).toBe(0)
  })

  it('AC-7919.2: 적을수록 좋음 = 값 ≤ 100점 값이면 100 · ≥ 0점 값이면 0 · 사이는 버림(곧은 줄)', () => {
    const item = { w: 40, best: 200, worst: 1500 }
    expect(subScore(200, item)).toBe(100)
    expect(subScore(100, item)).toBe(100)
    expect(subScore(-50, item)).toBe(100)
    expect(subScore(1500, item)).toBe(0)
    expect(subScore(2000, item)).toBe(0)
    expect(subScore(850, item)).toBe(50)
    expect(subScore(1000, item)).toBe(38) // 500 × 100 ÷ 1,300 = 38.46
    expect(subScore(201, item)).toBe(99)
  })

  it('AC-7919.2: 적을수록 좋음의 기준이 음수여도 곧은 줄이다(매물 평균 대비 −20% ~ +20%)', () => {
    const item = { w: 30, best: -20, worst: 20 }
    expect(subScore(-30, item)).toBe(100)
    expect(subScore(-20, item)).toBe(100)
    expect(subScore(0, item)).toBe(50)
    expect(subScore(10, item)).toBe(25)
    expect(subScore(20, item)).toBe(0)
  })
})

describe('AC-7911.1·AC-7919.2 scoreItems — 후보(항목 다섯)', () => {
  it('AC-7919.2: 세부 값은 표의 식 그대로 나온다', () => {
    const r = scoreItems(FULL, DEFAULT_SCORE_RULE)
    const values = Object.fromEntries(r.groups.flatMap((g) => g.subs.map((s) => [s.id, s.value])))
    expect(values).toEqual({
      'p-density': 8000,
      'p-senior': 25,
      'p-households': 5000,
      'p-apts': 4000,
      'p-trend': 4,
      'p-accidents': 1,
      'p-industry': 5000,
      'p-schools': 2,
      'p-facilities': 15,
      'p-welfare': 4.2,
      'c-count': 3,
      'c-perRival': 4000,
      'c-newOpen': 1,
      'c-gaps': 5,
      'c-price': 20,
      't-station': 850,
      't-stops': 4,
      't-flow': null,
      's-floor': 3,
      's-elevator': 1,
      's-parking': 12,
      's-age': 10,
      's-neighbors': 0,
      's-sign': 1,
      's-violation': null,
      's-clinics': 2,
      'k-rentPy': 80000,
      'k-deposit': 50_000_000,
      'k-premium': 20_000_000,
      'k-vsAvg': 0,
    })
  })

  it('AC-7919.2: 세부 점수 0~100(버림)과 항목 점수 = Σ 버림(세부 점수 × 무게 ÷ 값 있는 세부 무게 합)', () => {
    const r = scoreItems(FULL, DEFAULT_SCORE_RULE)
    const scores = Object.fromEntries(r.groups.flatMap((g) => g.subs.map((s) => [s.id, s.score])))
    expect(scores).toEqual({
      'p-density': 80,
      'p-senior': 100,
      'p-households': 25,
      'p-apts': 40,
      'p-trend': 80,
      'p-accidents': 33,
      'p-industry': 25,
      'p-schools': 40,
      'p-facilities': 50,
      'p-welfare': 84,
      'c-count': 50,
      'c-perRival': 20,
      'c-newOpen': 66,
      'c-gaps': 50,
      'c-price': 100,
      't-station': 50,
      't-stops': 40,
      't-flow': null,
      's-floor': 50,
      's-elevator': 100,
      's-parking': 40,
      's-age': 80,
      's-neighbors': 0,
      's-sign': 100,
      's-violation': null,
      's-clinics': 66,
      'k-rentPy': 80,
      'k-deposit': 88,
      'k-premium': 80,
      'k-vsAvg': 50,
    })
    // 사는 사람 32+15+1+4+8+1+1+2+2(+의료급여 무게 0) · 경쟁 15+7+9+5+10 · 교통(흐름 없음 → 무게 60) 33+13
    // 자리(위반 모름 → 무게 90, 같은 건물·옆 건물 의원 무게 0) 13+22+6+8+0+11+0 · 비용 28+13+16+15
    expect(r.groups.map((g) => [g.id, g.score])).toEqual([
      ['people', 66],
      ['rivals', 46],
      ['transit', 46],
      ['site', 60],
      ['cost', 72],
    ])
  })

  it('AC-7911.1: 종합 = Σ 버림(항목 점수 × 무게 ÷ 값 있는 항목 무게 합), 항목마다 몇 점을 보탰는지도 준다', () => {
    const r = scoreItems(FULL, DEFAULT_SCORE_RULE)
    // 66×30/100=19.8 · 46×25/100=11.5 · 46×20/100=9.2 · 60×15/100=9 · 72×10/100=7.2
    expect(r.groups.map((g) => g.points)).toEqual([19, 11, 9, 9, 7])
    expect(r.total).toBe(55)
    expect(r.used).toBe(5)
  })

  it('AC-7911.1: 무게를 바꾸면 다시 부르지 않고 같은 값으로 바로 다시 센다', () => {
    const rule = clone(DEFAULT_SCORE_RULE)
    rule.weights.people = 0
    const r = scoreItems(FULL, rule)
    // 무게 합 70: 0 · 46×25/70=16.4 · 46×20/70=13.1 · 60×15/70=12.9 · 72×10/70=10.3
    expect(r.groups.map((g) => g.points)).toEqual([0, 16, 13, 12, 10])
    expect(r.total).toBe(51)
  })

  it('AC-7919.2: 기준을 바꾸면 세부 점수가 그 기준으로 바뀐다', () => {
    const rule = clone(DEFAULT_SCORE_RULE)
    rule.items['p-density'] = { w: 40, full: 16000 }
    rule.items['t-station'] = { w: 40, best: 850, worst: 2000 }
    const r = scoreItems(FULL, rule)
    expect(sub(r, 'p-density')?.score).toBe(50)
    expect(sub(r, 't-station')?.score).toBe(100)
  })
})

describe('AC-7911.2·AC-7919.2 값 없는 것은 빼고 남은 무게로', () => {
  it('AC-7919.2: 자료 없는 세부 항목은 빼고 남은 세부 무게로 다시 나눈다', () => {
    // 사는 사람에 학교(2곳 → 40, 무게 5)·시설(15곳 → 50, 무게 5)만 → 40×5/10 + 50×5/10
    const r = scoreItems({ schools: 2, seniorCenters: 10, gyms: 5 }, DEFAULT_SCORE_RULE)
    expect(group(r, 'people')?.score).toBe(45)
    expect(sub(r, 'p-density')).toEqual({ id: 'p-density', value: null, score: null })
  })

  it('AC-7919.2: 세부 항목이 다 없으면 그 항목은 값 없음이다', () => {
    const r = scoreItems({ schools: 2 }, DEFAULT_SCORE_RULE)
    expect(group(r, 'rivals')).toMatchObject({ score: null, points: null })
  })

  it('AC-7919.2: 값 있는 세부 항목의 무게 합이 0이면 그 항목은 값 없음이다', () => {
    const rule = clone(DEFAULT_SCORE_RULE)
    rule.items['p-schools'] = { w: 0, full: 5 }
    rule.items['p-facilities'] = { w: 0, full: 30 }
    const r = scoreItems({ schools: 2, seniorCenters: 10, gyms: 5 }, rule)
    expect(group(r, 'people')?.score).toBeNull()
    expect(sub(r, 'p-schools')?.score).toBe(40)
  })

  it('AC-7911.2: 값 없는 항목은 빼고 남은 항목 무게로 종합을 센다', () => {
    const { floorLabel, elevators, parking, buildingAge, pharmacies, sign, violation, rentPerPy, deposit, premium, savedRentsPerPy, ...rest } = FULL
    void [floorLabel, elevators, parking, buildingAge, pharmacies, sign, violation, rentPerPy, deposit, premium, savedRentsPerPy]
    const r = scoreItems(rest, DEFAULT_SCORE_RULE)
    expect(group(r, 'site')).toMatchObject({ score: null, points: null })
    expect(group(r, 'cost')).toMatchObject({ score: null, points: null })
    // 무게 합 75: 66×30/75=26.4 · 46×25/75=15.3 · 46×20/75=12.3
    expect(r.groups.map((g) => g.points)).toEqual([26, 15, 12, null, null])
    expect(r.total).toBe(53)
    expect(r.used).toBe(3)
  })

  it('AC-7911.2: 항목이 다 없으면 종합은 점수 없음(null)이다', () => {
    const r = scoreItems({}, DEFAULT_SCORE_RULE)
    expect(r.total).toBeNull()
    expect(r.used).toBe(0)
    expect(r.groups.every((g) => g.score === null && g.points === null)).toBe(true)
  })

  it('AC-7911.2: 항목 무게가 모두 0이면 종합은 점수 없음이다(항목 점수는 그대로 보인다)', () => {
    const rule = clone(DEFAULT_SCORE_RULE)
    rule.weights = { people: 0, rivals: 0, transit: 0, site: 0, cost: 0 }
    const r = scoreItems(FULL, rule)
    expect(r.total).toBeNull()
    expect(group(r, 'people')).toMatchObject({ score: 66, points: null })
  })

  it('AC-7919.2: 숫자가 아닌 값(NaN·무한)은 자료 없음으로 본다', () => {
    const r = scoreItems({ schools: Number.NaN, seniorCenters: Number.POSITIVE_INFINITY, stops: 4 }, DEFAULT_SCORE_RULE)
    expect(sub(r, 'p-schools')?.value).toBeNull()
    expect(sub(r, 'p-facilities')?.value).toBeNull()
    expect(group(r, 'people')?.score).toBeNull()
    expect(group(r, 'transit')?.score).toBe(40)
  })
})

describe('AC-7919.2 세부 값 만들기', () => {
  it('AC-7919.2: 밀도에는 고른 나이대만 들어간다', () => {
    const only60s = clone(DEFAULT_SCORE_RULE)
    only60s.bands = [6]
    expect(sub(scoreItems(FULL, only60s), 'p-density')).toEqual({ id: 'p-density', value: 1000, score: 10 })
    const young = clone(DEFAULT_SCORE_RULE)
    young.bands = [0, 1]
    expect(sub(scoreItems(FULL, young), 'p-density')).toEqual({ id: 'p-density', value: 4000, score: 40 })
    // 60세 이상 비율·1곳당 인구는 나이대 고름과 상관없다
    expect(sub(scoreItems(FULL, young), 'p-senior')?.value).toBe(25)
    expect(sub(scoreItems(FULL, young), 'c-perRival')?.value).toBe(4000)
  })

  it('AC-7919.2: 밀도는 범위 넓이로 나눈다(1km 범위 ≈ 3.14km²), 넓이가 없으면 값 없음', () => {
    const r = scoreItems({ ...FULL, areaM2: Math.PI * 1000 * 1000 }, DEFAULT_SCORE_RULE)
    expect(sub(r, 'p-density')?.score).toBe(25) // 8,000 ÷ 3.14 = 2,546명/km²
    expect(sub(scoreItems({ ...FULL, areaM2: null }, DEFAULT_SCORE_RULE), 'p-density')?.value).toBeNull()
    expect(sub(scoreItems({ ...FULL, areaM2: 0 }, DEFAULT_SCORE_RULE), 'p-density')?.value).toBeNull()
  })

  it('AC-7919.2: 인구 추세는 가장 이른 10월 대비 최근 10월이고 줄면 0, 한 해뿐이면 값 없음', () => {
    const down = scoreItems({ trend: [{ ym: '2022-10', total: 15000 }, { ym: '2025-10', total: 14000 }] }, DEFAULT_SCORE_RULE)
    expect(sub(down, 'p-trend')).toEqual({ id: 'p-trend', value: 0, score: 0 })
    expect(sub(scoreItems({ trend: [{ ym: '2025-10', total: 14000 }] }, DEFAULT_SCORE_RULE), 'p-trend')?.value).toBeNull()
  })

  it('AC-7919.2: 아파트 세대·시설 수는 있는 쪽만 더하고, 둘 다 없으면 값 없음', () => {
    const r = scoreItems({ apartments: 3000, presale: null, seniorCenters: null, gyms: 6 }, DEFAULT_SCORE_RULE)
    expect(sub(r, 'p-apts')?.value).toBe(3000)
    expect(sub(r, 'p-facilities')?.value).toBe(6)
    expect(sub(scoreItems({}, DEFAULT_SCORE_RULE), 'p-apts')?.value).toBeNull()
  })

  it('AC-7919.2: 경쟁 의원이 0곳이면 1곳당 인구 = 범위 인구 전부', () => {
    const r = scoreItems({ people: FULL.people, rivals: 0 }, DEFAULT_SCORE_RULE)
    expect(sub(r, 'c-perRival')).toEqual({ id: 'c-perRival', value: 16000, score: 80 })
    expect(sub(r, 'c-count')?.score).toBe(100)
  })

  it('AC-7919.2: 체외충격파 값 차이는 0 아래면 0, 지금 의원 값을 안 적으면 값 없음', () => {
    expect(sub(scoreItems({ rivalEswt: 40000, homeEswt: 50000 }, DEFAULT_SCORE_RULE), 'c-price')).toEqual({ id: 'c-price', value: 0, score: 0 })
    expect(sub(scoreItems({ rivalEswt: 40000, homeEswt: null }, DEFAULT_SCORE_RULE), 'c-price')?.value).toBeNull()
    expect(sub(scoreItems({ rivalEswt: null, homeEswt: 50000 }, DEFAULT_SCORE_RULE), 'c-price')?.value).toBeNull()
  })

  it('AC-7919.2: 지하층은 s-floor 0점이다(기준과 상관없음), 지상 층은 숫자로', () => {
    const floor = (floorLabel: string | null) => sub(scoreItems({ floorLabel }, DEFAULT_SCORE_RULE), 's-floor')
    expect(floor('지1층')).toEqual({ id: 's-floor', value: -1, score: 0 })
    expect(floor('지하 2층')).toEqual({ id: 's-floor', value: -2, score: 0 })
    expect(floor('지하')).toEqual({ id: 's-floor', value: -1, score: 0 })
    expect(floor('B1')).toEqual({ id: 's-floor', value: -1, score: 0 })
    expect(floor('1층')).toEqual({ id: 's-floor', value: 1, score: 100 })
    expect(floor('지상 2층')).toEqual({ id: 's-floor', value: 2, score: 75 })
    expect(floor('5층')).toEqual({ id: 's-floor', value: 5, score: 0 })
    expect(floor('')?.value).toBeNull()
    expect(floor('옥탑')?.value).toBeNull()
    expect(floor(null)?.value).toBeNull()
    const loose = clone(DEFAULT_SCORE_RULE)
    loose.items['s-floor'] = { w: 25, best: 1, worst: 10 }
    expect(sub(scoreItems({ floorLabel: '지1층' }, loose), 's-floor')?.score).toBe(0)
  })

  it('AC-7919.2: 간판은 보여요 1·가려요 0, 위반 건축물은 없음 1·있음 0, 모름은 값 없음', () => {
    const r = (sign: ScoreFacts['sign'], violation: ScoreFacts['violation']) => scoreItems({ sign, violation }, DEFAULT_SCORE_RULE)
    expect([sub(r('yes', 'no'), 's-sign')?.score, sub(r('yes', 'no'), 's-violation')?.score]).toEqual([100, 100])
    expect([sub(r('no', 'yes'), 's-sign')?.score, sub(r('no', 'yes'), 's-violation')?.score]).toEqual([0, 0])
    expect([sub(r('unknown', 'unknown'), 's-sign')?.value, sub(r(null, null), 's-violation')?.value]).toEqual([null, null])
  })

  it('AC-7919.2: 매물이 1개뿐이면 k-vsAvg는 값 없음, 2개 이상이면 평균(버림) 대비 %', () => {
    expect(sub(scoreItems({ rentPerPy: 80000, savedRentsPerPy: [80000] }, DEFAULT_SCORE_RULE), 'k-vsAvg')?.value).toBeNull()
    expect(sub(scoreItems({ rentPerPy: 80000, savedRentsPerPy: [] }, DEFAULT_SCORE_RULE), 'k-vsAvg')?.value).toBeNull()
    // 평균 70,000 → 14.28% 비쌈 → (20 − 14.28) × 100 ÷ 40 = 14.28
    expect(sub(scoreItems({ rentPerPy: 80000, savedRentsPerPy: [80000, 60000] }, DEFAULT_SCORE_RULE), 'k-vsAvg')?.score).toBe(14)
    // 평균 70,000.5 → 버림 70,000 · 30% 싸면 100
    expect(sub(scoreItems({ rentPerPy: 49000, savedRentsPerPy: [80000, 60001] }, DEFAULT_SCORE_RULE), 'k-vsAvg')).toEqual({ id: 'k-vsAvg', value: -30, score: 100 })
    expect(sub(scoreItems({ rentPerPy: null, savedRentsPerPy: [80000, 60000] }, DEFAULT_SCORE_RULE), 'k-vsAvg')?.value).toBeNull()
  })
})

describe('AC-7911.1·AC-7919.2 동네 훑기(동 단위 — 항목 셋·훑기 ○만)', () => {
  it('AC-7911.1: 훑기는 사는 사람·수요·경쟁·교통·흐름 셋만 매긴다', () => {
    const r = scoreItems(FULL, DEFAULT_SCORE_RULE, 'scan')
    expect(r.groups.map((g) => g.id)).toEqual(['people', 'rivals', 'transit'])
    expect(r.used).toBe(3)
  })

  it('AC-7919.2: 훑기는 ○ 세부 항목만 쓴다 — 값이 와도 후보에서만 쓰는 것은 뺀다', () => {
    const r = scoreItems({ ...FULL, flow: 30000 }, DEFAULT_SCORE_RULE, 'scan')
    expect(r.groups.flatMap((g) => g.subs.map((s) => s.id))).toEqual([
      'p-density',
      'p-senior',
      'p-households',
      'p-trend',
      'p-accidents',
      'p-industry',
      'p-schools',
      'p-facilities',
      'c-count',
      'c-perRival',
      'c-newOpen',
      't-station',
      't-stops',
    ])
    // 사는 사람(아파트 뺌, 무게 90) 35+16+1+8+1+1+2+2 · 경쟁(빈틈·값 뺌, 무게 80) 18+8+12 · 교통(흐름 뺌, 무게 60) 33+13
    expect(r.groups.map((g) => g.score)).toEqual([66, 38, 46])
    // 무게 합 75: 66×30/75=26.4 · 38×25/75=12.7 · 46×20/75=12.3
    expect(r.groups.map((g) => g.points)).toEqual([26, 12, 12])
    expect(r.total).toBe(50)
  })

  it('AC-7919.2: 같은 값이라도 후보는 흐름을 넣어 센다', () => {
    const r = scoreItems({ ...FULL, flow: 30000 }, DEFAULT_SCORE_RULE)
    expect(group(r, 'transit')?.score).toBe(68) // 20 + 8 + 40
  })
})

describe('AC-7919.2 checkScoreRule — 기준 칸 검사 글(AC-7919.4 안내 글)', () => {
  it('AC-7919.2: 처음 설정은 문제없다', () => {
    expect(checkScoreRule(DEFAULT_SCORE_RULE)).toEqual([])
  })

  it('AC-7919.2: 안내 글은 design.md 8절 글 그대로다', () => {
    expect(RULE_TEXT.full).toBe('0보다 큰 숫자를 적어 주세요. 비우면 저장되지 않아요.')
    expect(RULE_TEXT.order).toBe("'100점' 값이 '0점' 값보다 작아야 해요.")
    expect(RULE_TEXT.bands).toBe('나이대를 하나 이상 골라 주세요.')
  })

  it('AC-7919.2: 많을수록 좋음의 기준이 0·빈칸·음수·소수면 그 칸 글', () => {
    for (const full of [0, -3, 1.5, Number.NaN, null]) {
      const rule = clone(DEFAULT_SCORE_RULE)
      ;(rule.items as Record<string, unknown>)['p-density'] = { w: 40, full }
      expect(checkScoreRule(rule)).toEqual([{ at: 'p-density', field: 'full', text: RULE_TEXT.full }])
    }
  })

  it("AC-7919.2: 적을수록 좋음은 '100점' 값 ≥ '0점' 값이면 글, 빈칸이면 그 칸 글(0·음수는 된다)", () => {
    const same = clone(DEFAULT_SCORE_RULE)
    same.items['c-count'] = { w: 30, best: 6, worst: 6 }
    expect(checkScoreRule(same)).toEqual([{ at: 'c-count', text: RULE_TEXT.order }])
    const flipped = clone(DEFAULT_SCORE_RULE)
    flipped.items['t-station'] = { w: 40, best: 1500, worst: 200 }
    expect(checkScoreRule(flipped)).toEqual([{ at: 't-station', text: RULE_TEXT.order }])
    const blank = clone(DEFAULT_SCORE_RULE)
    ;(blank.items as Record<string, unknown>)['k-vsAvg'] = { w: 30, best: null, worst: 20.5 }
    expect(checkScoreRule(blank)).toEqual([
      { at: 'k-vsAvg', field: 'best', text: RULE_TEXT.blank },
      { at: 'k-vsAvg', field: 'worst', text: RULE_TEXT.blank },
    ])
    const negative = clone(DEFAULT_SCORE_RULE)
    negative.items['k-vsAvg'] = { w: 30, best: -40, worst: 0 }
    expect(checkScoreRule(negative)).toEqual([])
  })

  it('AC-7919.2: 나이대가 하나도 없거나 0~10 밖·겹침이면 나이대 글', () => {
    for (const bands of [[], [11], [-1], [3, 3], [2.5]]) {
      const rule = clone(DEFAULT_SCORE_RULE)
      rule.bands = bands
      expect(checkScoreRule(rule)).toEqual([{ at: 'bands', text: RULE_TEXT.bands }])
    }
  })

  it('AC-7919.2: 무게는 0~100 정수 — 밖이면 무게 글', () => {
    const rule = clone(DEFAULT_SCORE_RULE)
    rule.weights.people = 101
    rule.items['p-density'] = { w: 1.5, full: 10000 }
    expect(checkScoreRule(rule)).toEqual([
      { at: 'people', field: 'w', text: RULE_TEXT.weight },
      { at: 'p-density', field: 'w', text: RULE_TEXT.weight },
    ])
    const zero = clone(DEFAULT_SCORE_RULE)
    zero.weights.cost = 0
    zero.items['k-premium'] = { w: 0, best: 0, worst: 100_000_000 }
    expect(checkScoreRule(zero)).toEqual([])
  })

  it('AC-7919.2: 세부 항목 칸이 아예 없거나 모양이 틀리면 빈칸으로 본다', () => {
    const rule = clone(DEFAULT_SCORE_RULE)
    delete (rule.items as Partial<ScoreRule['items']>)['s-age']
    ;(rule.items as Record<string, unknown>)['s-parking'] = { w: 15, best: 1, worst: 30 }
    expect(checkScoreRule(rule)).toEqual([
      { at: 's-parking', field: 'full', text: RULE_TEXT.full },
      { at: 's-age', field: 'w', text: RULE_TEXT.weight },
      { at: 's-age', field: 'best', text: RULE_TEXT.blank },
      { at: 's-age', field: 'worst', text: RULE_TEXT.blank },
    ])
  })
})

describe('AC-7919.2 fillScoreRule — 저장된 설정에 빠진 칸은 처음 값으로', () => {
  it('AC-7919.2: 설정이 없거나 모양이 아니면 처음 설정', () => {
    expect(fillScoreRule(null)).toEqual(DEFAULT_SCORE_RULE)
    expect(fillScoreRule('x')).toEqual(DEFAULT_SCORE_RULE)
    expect(fillScoreRule([])).toEqual(DEFAULT_SCORE_RULE)
  })

  it('AC-7919.2: 맞는 값은 남기고, 빠지거나 틀린 칸만 처음 값으로 채운다(나중에 더한 세부 항목도)', () => {
    const saved = {
      v: 1,
      weights: { people: 50, rivals: 101, transit: 20 },
      bands: [8, 6, 6, 12],
      items: {
        'p-density': { w: 60, full: 5000 },
        'c-count': { w: 30, best: 4, worst: 2 },
        't-station': { w: 10, best: 100, worst: 800 },
        'x-old': { w: 5, full: 3 },
      },
    }
    const rule = fillScoreRule(saved)
    expect(rule.weights).toEqual({ people: 50, rivals: 25, transit: 20, site: 15, cost: 10 })
    expect(rule.bands).toEqual([6, 8])
    expect(rule.items['p-density']).toEqual({ w: 60, full: 5000 })
    expect(rule.items['c-count']).toEqual({ w: 30, best: 0, worst: 6 })
    expect(rule.items['t-station']).toEqual({ w: 10, best: 100, worst: 800 })
    expect(rule.items['k-vsAvg']).toEqual({ w: 30, best: -20, worst: 20 })
    expect(Object.keys(rule.items)).toEqual(Object.keys(DEFAULT_SCORE_RULE.items))
    expect(checkScoreRule(rule)).toEqual([])
  })

  it('AC-7919.2: 나이대가 모두 틀리면 처음 나이대, 채운 설정을 고쳐도 처음 설정은 그대로', () => {
    const rule = fillScoreRule({ bands: [20] })
    expect(rule.bands).toEqual([4, 5, 6, 7, 8, 9, 10])
    rule.bands.push(1)
    rule.weights.people = 1
    expect(DEFAULT_SCORE_RULE.bands).toEqual([4, 5, 6, 7, 8, 9, 10])
    expect(DEFAULT_SCORE_RULE.weights.people).toBe(30)
  })

  it('AC-7919.2: scoreItems는 틀린 칸을 처음 값으로 보고 센다(고치는 중인 칸 때문에 점수가 깨지지 않음)', () => {
    const rule = clone(DEFAULT_SCORE_RULE)
    rule.items['p-schools'] = { w: 5, full: 0 }
    expect(sub(scoreItems({ schools: 2 }, rule), 'p-schools')?.score).toBe(40)
  })
})

describe('AC-7911.4 floorNumber — 층 읽기 한 곳(점수 s-floor·위험 신호 barrier가 같이 씀)', () => {
  it('AC-7911.4: 층 글의 숫자, 지하는 음수(숫자 없으면 −1), 숫자가 없으면 null', () => {
    expect(floorNumber('3층')).toBe(3)
    expect(floorNumber(' 2층 ')).toBe(2)
    expect(floorNumber('지상 2층')).toBe(2)
    expect(floorNumber('지1층')).toBe(-1)
    expect(floorNumber('지하 2층')).toBe(-2)
    expect(floorNumber('지하')).toBe(-1)
    expect(floorNumber('B1')).toBe(-1)
    expect(floorNumber('b 2')).toBe(-2)
    for (const label of ['', '옥탑', null, undefined]) expect(floorNumber(label), String(label)).toBeNull()
  })
})

describe('AC-7919.6 p-welfare 의료급여·차상위 비율 — 이 세부 항목만 방향 두 모양', () => {
  const welfare = (rule: ScoreRule, welfareRate: number | null) => sub(scoreItems({ welfareRate }, rule), 'p-welfare')
  const less = () => {
    const rule = clone(DEFAULT_SCORE_RULE)
    rule.items['p-welfare'] = { w: 10, best: 1, worst: 5 }
    return rule
  }

  it('AC-7919.6: 처음 설정은 무게 0·많을수록 좋음·5%면 100점이고, 사는 사람·수요 항목의 열째 세부 항목이다', () => {
    expect(DEFAULT_SCORE_RULE.items['p-welfare']).toEqual({ w: 0, full: 5 })
    const people = SCORE_GROUPS.find((g) => g.id === 'people')
    expect(people?.subs.map((s) => s.id).indexOf('p-welfare')).toBe(9)
    const def = people?.subs.find((s) => s.id === 'p-welfare')
    expect(def).toMatchObject({ dir: 'more', full: 5, w: 0, scan: false, unit: '%' })
  })

  it('AC-7919.6: 적을수록 좋음으로 바꿀 때의 처음 기준은 1% 이하면 100점 · 5% 이상이면 0점이다', () => {
    const def = SCORE_GROUPS.flatMap((g) => g.subs).find((s) => s.id === 'p-welfare')
    expect(def?.flip).toEqual({ best: 1, worst: 5 })
    // 다른 세부 항목은 방향을 고르지 않는다
    expect(SCORE_GROUPS.flatMap((g) => g.subs).filter((s) => s.flip !== undefined).map((s) => s.id)).toEqual(['p-welfare'])
  })

  it('AC-7919.6: 많을수록 좋음 = 버림(비율 × 100 ÷ 5), 적을수록 좋음 = 1%~5% 곧은 줄', () => {
    expect(welfare(DEFAULT_SCORE_RULE, 4.2)).toEqual({ id: 'p-welfare', value: 4.2, score: 84 })
    expect(welfare(DEFAULT_SCORE_RULE, 6)?.score).toBe(100)
    expect(welfare(less(), 3)).toEqual({ id: 'p-welfare', value: 3, score: 50 })
    expect(welfare(less(), 0.5)?.score).toBe(100)
    expect(welfare(less(), 5)?.score).toBe(0)
    expect(welfare(less(), null)).toEqual({ id: 'p-welfare', value: null, score: null })
  })

  it('AC-7919.6: 처음 무게 0이라 값이 있어도 사는 사람·수요 점수가 그대로이고, 무게를 주면 들어간다', () => {
    const base = group(scoreItems({ schools: 2 }, DEFAULT_SCORE_RULE), 'people')?.score
    expect(group(scoreItems({ schools: 2, welfareRate: 0 }, DEFAULT_SCORE_RULE), 'people')?.score).toBe(base)
    expect(group(scoreItems({ welfareRate: 4 }, DEFAULT_SCORE_RULE), 'people')?.score).toBeNull()
    // 학교 40점(무게 5) + 적을수록 의료급여 3% → 50점(무게 10): 버림(40×5/15) + 버림(50×10/15) = 13 + 33
    expect(group(scoreItems({ schools: 2, welfareRate: 3 }, less()), 'people')?.score).toBe(46)
  })

  it('AC-7919.6: 동네 훑기에서는 쓰지 않는다(시군구 값이라 동마다 같음 — 후보에서만)', () => {
    const r = scoreItems({ welfareRate: 3 }, less(), 'scan')
    expect(r.groups.flatMap((g) => g.subs.map((s) => s.id))).not.toContain('p-welfare')
  })

  it('AC-7919.6: 칸 검사는 p-welfare만 두 모양을 받는다(다른 세부 항목은 바꾼 모양이면 빈칸 글)', () => {
    expect(checkScoreRule(less())).toEqual([])
    const flipped = clone(less())
    flipped.items['p-welfare'] = { w: 10, best: 5, worst: 1 }
    expect(checkScoreRule(flipped)).toEqual([{ at: 'p-welfare', text: RULE_TEXT.order }])
    const zero = clone(DEFAULT_SCORE_RULE)
    zero.items['p-welfare'] = { w: 0, full: 0 }
    expect(checkScoreRule(zero)).toEqual([{ at: 'p-welfare', field: 'full', text: RULE_TEXT.full }])
    const blank = clone(DEFAULT_SCORE_RULE)
    ;(blank.items as Record<string, unknown>)['p-welfare'] = { w: 10, best: null, worst: 5 }
    expect(checkScoreRule(blank)).toEqual([{ at: 'p-welfare', field: 'best', text: RULE_TEXT.blank }])
    const other = clone(DEFAULT_SCORE_RULE)
    other.items['p-senior'] = { w: 15, best: 1, worst: 5 }
    expect(checkScoreRule(other)).toEqual([{ at: 'p-senior', field: 'full', text: RULE_TEXT.full }])
  })

  it('AC-7919.6: 고른 방향이 저장된 설정에서 그대로 남고, 예전 설정에 없으면 처음 값(많을수록 5%)으로 채운다', () => {
    expect(fillScoreRule(less()).items['p-welfare']).toEqual({ w: 10, best: 1, worst: 5 })
    expect(fillScoreRule({ items: { 'p-welfare': { w: 20, full: 8 } } }).items['p-welfare']).toEqual({ w: 20, full: 8 })
    const old = structuredClone(DEFAULT_SCORE_RULE) as unknown as { items: Record<string, unknown> }
    delete old.items['p-welfare']
    expect(fillScoreRule(old).items['p-welfare']).toEqual({ w: 0, full: 5 })
    // 적을수록 모양인데 기준이 틀리면 적을수록 처음 기준, 많을수록 모양인데 기준이 틀리면 많을수록 처음 기준
    expect(fillScoreRule({ items: { 'p-welfare': { w: 10, best: 5, worst: 1 } } }).items['p-welfare']).toEqual({ w: 10, best: 1, worst: 5 })
    expect(fillScoreRule({ items: { 'p-welfare': { w: 10, full: 0 } } }).items['p-welfare']).toEqual({ w: 10, full: 5 })
    // 다른 세부 항목은 바꾼 모양을 받지 않고 처음 모양으로
    expect(fillScoreRule({ items: { 'p-senior': { w: 15, best: 1, worst: 5 } } }).items['p-senior']).toEqual({ w: 15, full: 25 })
  })
})

describe('AC-7919.1 세부 항목 이름 — requirements 화면 글 기본값 그대로(값 설명은 why로)', () => {
  const subs = () => SCORE_GROUPS.flatMap((g) => g.subs)
  const def = (id: SubId) => subs().find((s) => s.id === id)

  it("AC-7919.1: 세부 항목 이름(label)은 '화면 글 기본값' 이름 그대로이고 design.md 8절 id 차례다", () => {
    expect(subs().map((s) => [s.id, s.label])).toEqual([
      ['p-density', '고른 나이대 인구 밀도'],
      ['p-senior', '60세 이상 비율'],
      ['p-households', '세대 수'],
      ['p-apts', '아파트 세대(입주 예정 포함)'],
      ['p-trend', '인구 추세(4년)'],
      ['p-accidents', '교통사고 다발 지점'],
      ['p-industry', '산업단지 고용 인원'],
      ['p-schools', '학교 수'],
      ['p-facilities', '경로당·체력단련장 수'],
      ['p-welfare', '의료급여·차상위 비율'],
      ['c-count', '경쟁 의원 수'],
      ['c-perRival', '1곳당 사는 사람'],
      ['c-newOpen', '3년 새로 연 곳'],
      ['c-gaps', '진료 시간 빈틈'],
      ['c-price', '진료비 차이(둘레 평균이 지금 의원보다)'],
      ['t-station', '역까지 거리'],
      ['t-stops', '400m 안 정류장 수'],
      ['t-flow', '하루 승하차(사람 흐름)'],
      ['s-floor', '층'],
      ['s-elevator', '엘리베이터'],
      ['s-parking', '주차'],
      ['s-age', '지은 해(건물 나이)'],
      ['s-neighbors', '이웃 약국(30m 안)'],
      ['s-sign', '간판 보임'],
      ['s-violation', '위반 건축물'],
      ['s-clinics', '같은 건물·옆 건물 의원 수'],
      ['k-rentPy', '평당 월세'],
      ['k-deposit', '보증금'],
      ['k-premium', '권리금'],
      ['k-vsAvg', '저장 매물 평균과의 차이(평당 월세)'],
    ])
  })

  it("AC-7919.1: 예전 이름에 들어 있던 값 설명(셈·출처)은 why로 옮겨 '근거와 출처'에 남는다", () => {
    expect(def('s-neighbors')?.why).toContain('후보 30m 안 약국 수(상가정보 업종)')
    expect(def('p-density')?.why).toContain('고른 나이대 인구 ÷ 범위 km²')
    expect(def('p-welfare')?.why).toContain('(기초 의료급여 + 차상위 3종) ÷ 주민등록 인구 × 100(%)')
    expect(def('s-floor')?.why).toContain("'지'로 시작하면 지하 = 0점")
    expect(def('k-vsAvg')?.why).toContain('2개 미만이면 값 없음')
    // 이름에는 셈 글자가 없다
    for (const s of subs()) expect(s.label, s.id).not.toMatch(/[÷×+=]|\(%\)|\(n\)|\(원\)/)
  })
})

describe('AC-7921.7 s-clinics 같은 건물·옆 건물 의원 수 — 자리 맨 아래, 처음 무게 0', () => {
  const site = () => SCORE_GROUPS.find((g) => g.id === 'site')

  it('AC-7921.7: 자리 세부 항목 맨 아래에 s-clinics(많을수록 좋음 · 3곳 · 처음 무게 0 · 후보에서만)가 있다', () => {
    const last = site()?.subs.at(-1)
    expect(last).toMatchObject({ id: 's-clinics', label: '같은 건물·옆 건물 의원 수', dir: 'more', full: 3, w: 0, unit: '곳', scan: false })
    expect(last?.why).toContain('후보 30m 안 의원 수(안 보기 뺌, 경쟁 포함, 약국 뺌)')
    expect(DEFAULT_SCORE_RULE.items['s-clinics']).toEqual({ w: 0, full: 3 })
    // 처음 설정의 자리 세부 항목도 s-violation 다음 맨 끝
    const keys = Object.keys(DEFAULT_SCORE_RULE.items).filter((id) => id.startsWith('s-'))
    expect(keys.at(-1)).toBe('s-clinics')
    expect(keys.at(-2)).toBe('s-violation')
  })

  it('AC-7921.7: 값은 clinicsNear(후보 30m 안 의원 수)이고, 많을수록 좋음 3곳이면 100점, 값이 없으면 값 없음', () => {
    const one = (clinicsNear: number | null | undefined) => sub(scoreItems({ clinicsNear }, DEFAULT_SCORE_RULE), 's-clinics')
    expect(one(0)).toEqual({ id: 's-clinics', value: 0, score: 0 })
    expect(one(1)).toEqual({ id: 's-clinics', value: 1, score: 33 })
    expect(one(3)).toEqual({ id: 's-clinics', value: 3, score: 100 })
    expect(one(7)?.score).toBe(100)
    expect(one(null)).toEqual({ id: 's-clinics', value: null, score: null })
    expect(one(undefined)).toEqual({ id: 's-clinics', value: null, score: null })
  })

  it('AC-7921.7: 처음 무게가 0이라 값이 있어도 자리·종합 점수는 그대로이고, 무게를 주면 들어간다', () => {
    const { clinicsNear: _skip, ...without } = FULL
    expect(_skip).toBe(2)
    const base = scoreItems(without, DEFAULT_SCORE_RULE)
    for (const n of [0, 2, 3, 9]) {
      const r = scoreItems({ ...without, clinicsNear: n }, DEFAULT_SCORE_RULE)
      expect([n, group(r, 'site')?.score, r.total]).toEqual([n, group(base, 'site')?.score, base.total])
    }
    expect(group(base, 'site')?.score).toBe(60)
    const rule = clone(DEFAULT_SCORE_RULE)
    rule.items['s-clinics'] = { w: 10, full: 3 }
    // 무게 합 100: 50×25 + 100×20 + 40×15 + 80×10 + 0×10 + 100×10 + 100×10(의원 3곳) → 12+20+6+8+0+10+10
    expect(group(scoreItems({ ...without, clinicsNear: 3 }, rule), 'site')?.score).toBe(66)
  })

  it('AC-7921.7: 동네 훑기에서는 쓰지 않는다(자리 항목은 후보에서만)', () => {
    const r = scoreItems({ clinicsNear: 3 }, DEFAULT_SCORE_RULE, 'scan')
    expect(r.groups.flatMap((g) => g.subs.map((s) => s.id))).not.toContain('s-clinics')
  })

  it('AC-7921.7: 예전에 저장한 설정에 s-clinics가 없으면 처음 값(무게 0 · 3곳)으로 채우고, 저장한 값은 남긴다', () => {
    const old = structuredClone(DEFAULT_SCORE_RULE) as unknown as { items: Record<string, unknown> }
    delete old.items['s-clinics']
    expect(fillScoreRule(old).items['s-clinics']).toEqual({ w: 0, full: 3 })
    expect(fillScoreRule({ items: { 's-clinics': { w: 25, full: 5 } } }).items['s-clinics']).toEqual({ w: 25, full: 5 })
    expect(fillScoreRule({ items: { 's-clinics': { w: 25, full: 0 } } }).items['s-clinics']).toEqual({ w: 25, full: 3 })
    // 칸 검사: 기준 0은 그 칸 글
    const zero = clone(DEFAULT_SCORE_RULE)
    zero.items['s-clinics'] = { w: 0, full: 0 }
    expect(checkScoreRule(zero)).toEqual([{ at: 's-clinics', field: 'full', text: RULE_TEXT.full }])
  })

  it("AC-7921.7: 경쟁 과목이 0개면(부르는 쪽이 경쟁 값을 비움) '경쟁' 항목은 값 없음으로 빠지고 남은 무게로 종합을 센다", () => {
    const r = scoreItems({ ...FULL, rivals: null, newRivals: null, gapCells: null, rivalEswt: null }, DEFAULT_SCORE_RULE)
    expect(group(r, 'rivals')).toMatchObject({ score: null, points: null })
    expect(group(r, 'rivals')?.subs.every((s) => s.value === null)).toBe(true)
    // 무게 합 75: 66×30/75=26.4 · 46×20/75=12.2 · 60×15/75=12 · 72×10/75=9.6
    expect(r.groups.map((g) => g.points)).toEqual([26, null, 12, 12, 9])
    expect(r.total).toBe(59)
    expect(r.used).toBe(4)
  })

  it("AC-7921.7: 경쟁 항목 글은 과목 이름 대신 '경쟁 의원'이라 쓴다(어느 과목이 경쟁인지는 과목 고르기 설정이 정함)", () => {
    const rivals = SCORE_GROUPS.find((g) => g.id === 'rivals')
    expect(rivals?.note).toContain('경쟁 의원')
    const texts = [rivals?.note ?? '', ...(rivals?.subs ?? []).flatMap((s) => [s.label, s.why])]
    for (const t of texts) expect(t).not.toMatch(/정형외과|신경외과|마취통증|재활의학|한의원/)
    for (const id of ['c-count', 'c-newOpen', 'c-gaps', 'c-price'] as const) {
      const s = rivals?.subs.find((x) => x.id === id)
      expect(`${s?.label} ${s?.why}`, id).toContain('경쟁 의원')
    }
  })
})
