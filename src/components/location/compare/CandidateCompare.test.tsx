// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import { flagInputOf, rivalCount, scoreFactsOf } from '@/lib/location/facts'
import { pickFlags } from '@/lib/location/flags'
import { DEFAULT_SCORE_RULE, scoreItems, type ScoreRule } from '@/lib/location/score'
import type { Candidate, CandidateStatus, DeptRule, Got, Listing, Rival, Snapshot } from '@/types/location'
import { CandidateCompare, type CandidateCompareProps } from './CandidateCompare'

// 후보 견주기 (spec location REQ-7914 AC-7914.1, REQ-7919 AC-7919.3, REQ-7921 AC-7921.2, design.md 14·18절, 시안 ?s=compare).
// 부품은 props·콜백만: 후보 줄(candidates), 저장한 매물(listings), 점수 설정(rule), 과목 고르기(deptRule), 지금 의원 체외충격파 값(homeEswt),
// 오늘(today)을 받고 진행 단계 바꾸기·내려놓기·다시 올리기는 onStatus, [무게 바꾸기]는 onEditWeights로 넘긴다.
// 점수 값·경쟁 수·위험 신호·후보 매물은 lib/location/facts.ts(scoreFactsOf·rivalCount·flagInputOf·candidateListing)에 받은 deptRule을 넣어
// 부품 안에서 센다 → 무게·과목 고르기를 바꾸면 다시 부르지 않고 바로 다시 센다. 만 원 칸 금액은 manText

const TODAY = '2026-11-22'
const HOME_ESWT = 50_000
const freshRule = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule
const firstDepts = (): DeptRule => structuredClone(DEFAULT_DEPT_RULE) as DeptRule
const deptRule = (rival: DeptRule['rival']): DeptRule => ({ v: 1, rival, hide: [] })

const SNAPSHOT_KEYS = [
  'people', 'trend', 'flow', 'income', 'aptPrice', 'bizPrice', 'apts', 'presale', 'seniors', 'gyms', 'schools', 'accidents',
  'industry', 'pharmacies', 'rivals', 'place', 'sggAvg', 'history', 'station', 'bus', 'market', 'building', 'stores', 'welfare',
] as const
const NONE: Got<never> = { ok: false, why: 'none', src: 'hosp-list' }
const ok = <T,>(v: T, src: string): Got<T> => ({ ok: true, v, src, asOf: '2026-11-01' })
function snap(at: string, radiusM: number, over: Partial<Snapshot> = {}): Snapshot {
  return { v: 1, at, radiusM, ...Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, NONE])), ...over } as Snapshot
}
const peopleOf = (bands: number[], households: number): Snapshot['people'] =>
  ok({ total: bands.reduce((a, b) => a + b, 0), bands, households, unmatched: 0 }, 'pop-age')
const stationOf = (name: string, distM: number): Snapshot['station'] => ok({ name, line: '2호선', distM, at: { lat: 37.5, lng: 127 } }, 'rail-stations')
function clinic(name: string, depts: Rival['depts'], distM: number, over: Partial<Rival> = {}): Rival {
  return { name, depts, at: { lat: 37.5, lng: 127 }, distM, sameBuilding: distM <= 30, address: '', doctors: 1, openedYear: 2015, ...over }
}

function cand(id: string, name: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    name,
    addressNote: '',
    lat: 37.5,
    lng: 127,
    radiusM: 1000,
    status: 'watching',
    floorLabel: '',
    areaM2: null,
    signVisible: null,
    violation: null,
    costs: {},
    terms: {},
    checks: {},
    openOn: null,
    tasksDone: [],
    snapshot: null,
    snapshotAt: null,
    watchCheckedOn: null,
    createdAt: '2026-11-10T01:00:00.000Z',
    updatedAt: '2026-11-10T01:00:00.000Z',
    ...over,
  }
}

function listing(id: string, over: Partial<Listing> = {}): Listing {
  return {
    id,
    candidateId: null,
    title: '매물',
    url: '',
    areaM2: null,
    floorLabel: '',
    deposit: null,
    rent: null,
    premium: null,
    mgmt: null,
    brokerId: null,
    brokerNote: '',
    memo: '',
    lat: null,
    lng: null,
    createdAt: '2026-11-10T01:00:00.000Z',
    updatedAt: '2026-11-10T01:00:00.000Z',
    ...over,
  }
}

// ── 시안 ?s=compare 같은 후보 셋 + 내려놓은 후보 하나 ──
// 매물: A 30평 월세 300만 원(평당 100,000원) · B 40평 월세 320만 원(평당 80,000원) · 이어지지 않은 매물 30평 360만 원(평당 120,000원) → 평균 100,000원
const LA = listing('l-a', { candidateId: 'id-a', areaM2: 99.17, deposit: 50_000_000, rent: 3_000_000, premium: 30_000_000 })
const LB = listing('l-b', { candidateId: 'id-b', areaM2: 132.23, deposit: 30_000_000, rent: 3_200_000, premium: 0 })
const LX = listing('l-x', { areaM2: 99.17, deposit: 40_000_000, rent: 3_600_000 })
const LISTINGS = [LA, LB, LX]

const A_BANDS = [2000, 2500, 3000, 3500, 4000, 4500, 4000, 3000, 2000, 1000, 500] // 30,000명 · 60세 이상 10,500명(35%)
const B_BANDS = [2000, 2000, 2000, 2500, 2500, 3000, 1500, 1200, 800, 400, 100] // 18,000명 · 60세 이상 4,000명(22%)

// A 범위 1km 안 의원: 처음 경쟁(정형외과·신경외과·마취통증·재활) 5곳 + 내과·한의원(둘레로 보기) + 범위 밖 정형외과 1곳
// → 처음 설정: 경쟁 5곳(위험 신호 '경쟁 5곳 이상') · 내과·정형외과만 경쟁이면 3곳
const A_RIVALS: Rival[] = [
  clinic('가람내과의원', ['im'], 200),
  clinic('가람정형외과의원', ['ortho'], 300, {
    openedYear: 2025,
    detail: { therapists: 2, mri: false, ct: false, week: null, priced: true, eswt: 60_000, manual: null },
  }),
  clinic('가람한의원', ['korean'], 400),
  clinic('가람신경외과의원', ['ns'], 500),
  clinic('바른정형외과의원', ['ortho'], 600),
  clinic('편한마취통증의학과의원', ['pain'], 700),
  clinic('튼튼재활의학과의원', ['rehab'], 900),
  clinic('먼정형외과의원', ['ortho'], 1200),
]
// B 범위 500m 안: 내과 1곳(처음엔 둘레로 보기) · 정형외과는 범위 밖 → 처음 설정 경쟁 0곳, 내과·정형외과면 1곳
const B_RIVALS: Rival[] = [clinic('나래내과의원', ['im'], 100), clinic('나래정형외과의원', ['ortho'], 700)]

const A = cand('id-a', '예시빌딩 3층', {
  addressNote: '가람동',
  status: 'contacted',
  floorLabel: '3층',
  snapshot: snap('2026-11-15T01:00:00.000Z', 1000, {
    people: peopleOf(A_BANDS, 12_000),
    rivals: ok(A_RIVALS, 'hosp-list'),
    station: stationOf('가람역', 400),
    bus: ok(8, 'bus-stops'),
  }),
  snapshotAt: '2026-11-15T01:00:00.000Z',
  createdAt: '2026-11-15T01:00:00.000Z',
})
const B = cand('id-b', '나래상가 2층', {
  addressNote: '나래동',
  radiusM: 500,
  floorLabel: '2층',
  violation: 'no',
  snapshot: snap('2026-11-16T05:00:00.000Z', 500, {
    people: peopleOf(B_BANDS, 7_000),
    rivals: ok(B_RIVALS, 'hosp-list'),
    station: stationOf('나래역', 800),
    bus: ok(3, 'bus-stops'),
  }),
  snapshotAt: '2026-11-16T05:00:00.000Z',
  createdAt: '2026-11-16T05:00:00.000Z',
})
// 교통·흐름 값만 있는 후보(손으로 센다): 역 200m → 100점 · 정류장 10곳 → 100점 · 승하차 없음 →
// 교통·흐름 = 버림(100 × 40 ÷ 60) + 버림(100 × 20 ÷ 60) = 66 + 33 = 99점, 종합 = 버림(99 × 20 ÷ 20) = 99점 / 만점 100
const C = cand('id-c', '다온타워 4층', {
  addressNote: '다온동',
  status: 'visited',
  radiusM: 1500,
  snapshot: snap('2026-11-14T03:00:00.000Z', 1500, { station: stationOf('다온역', 200), bus: ok(10, 'bus-stops') }),
  snapshotAt: '2026-11-14T03:00:00.000Z',
  createdAt: '2026-11-14T03:00:00.000Z',
})
const D = cand('id-d', '예시상가 2층', { addressNote: '바다동', status: 'dropped' })
const CANDS = [A, B, C, D]

const factsOf = (c: Candidate, rule: DeptRule = firstDepts(), listings: readonly Listing[] = LISTINGS) =>
  scoreFactsOf({ candidate: c, listings, homeEswt: HOME_ESWT, today: TODAY, deptRule: rule })

function setup(over: Partial<CandidateCompareProps> = {}) {
  const onStatus = vi.fn<(id: string, status: CandidateStatus) => void>()
  const onEditWeights = vi.fn<() => void>()
  const props: CandidateCompareProps = {
    candidates: CANDS,
    listings: LISTINGS,
    rule: freshRule(),
    deptRule: firstDepts(),
    homeEswt: HOME_ESWT,
    today: TODAY,
    onStatus,
    onEditWeights,
    ...over,
  }
  const view = render(<CandidateCompare {...props} />)
  return { onStatus, onEditWeights, props, ...view }
}

const table = () => screen.getByRole('table')
const clean = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()
/** 몸 줄 머리(이름 그대로 또는 정규식)로 줄을 찾는다 */
const rowHeader = (name: string | RegExp) => within(table()).getByRole('rowheader', { name })
/** 그 줄의 칸 글자 — 무게 칸 뒤 후보 칸들만 */
function cells(name: string | RegExp): string[] {
  const row = rowHeader(name).closest('tr') as HTMLElement
  return within(row).getAllByRole('cell').slice(1).map((c) => clean(c.textContent))
}
function weightCell(name: string): string {
  const row = rowHeader(name).closest('tr') as HTMLElement
  return clean(within(row).getAllByRole('cell')[0].textContent)
}
const heads = () => within(table()).getAllByRole('columnheader').map((h) => clean(h.textContent))
const RIVAL_ROW = /^경쟁 의원/
const GROUP_NAMES = ['사는 사람·수요', '경쟁', '교통·흐름', '자리', '비용']
const GROUP_IDS = ['people', 'rivals', 'transit', 'site', 'cost'] as const

/** 받은 값·설정으로 센 항목 점수 칸 글(부품과 같은 모양: '{점}점 / {만점}' + 가장 높음) */
function expectedScoreCells(rows: readonly Candidate[], rule: ScoreRule, depts: DeptRule, gi: number): (string | null)[] {
  const results = rows.map((c) => scoreItems(factsOf(c, depts), rule, 'candidate'))
  const pts = results.map((r) => r.groups[gi].points)
  const best = Math.max(...pts.map((p) => p ?? -1))
  return results.map((r) => {
    const g = r.groups[gi]
    if (g.points === null) return null
    const sum = r.groups.reduce((a, x, i) => (x.score === null ? a : a + rule.weights[GROUP_IDS[i]]), 0)
    const max = Math.floor((rule.weights[g.id] * 100) / sum)
    return `${g.points}점 / ${max}${g.points === best && best > 0 ? ' · 가장 높음' : ''}`
  })
}

afterEach(() => {
  cleanup()
})

describe('AC-7914.1: 후보 2~4곳을 나란히 놓는다', () => {
  it('AC-7914.1: 내려놓지 않은 후보 셋이 차례대로 칸이 되고, 내려놓은 후보는 칸에 없다', () => {
    setup()
    expect(heads()).toEqual([
      '항목',
      '무게',
      '후보 A 예시빌딩 3층 가람동 · 중개사 연락',
      '후보 B 나래상가 2층 나래동 · 보는 중',
      '후보 C 다온타워 4층 다온동 · 보러 감',
    ])
  })

  it('AC-7914.1: 후보가 다섯 곳이면 처음에는 앞 4곳만 견주고, 다섯째는 4곳을 고른 동안 고를 수 없다', () => {
    const E = cand('id-e', '바람빌딩 5층')
    const F = cand('id-f', '하늘빌딩 1층')
    setup({ candidates: [A, B, C, E, F] })
    expect(heads().slice(2).map((h) => h.split(' ').slice(0, 3).join(' '))).toEqual(['후보 A 예시빌딩', '후보 B 나래상가', '후보 C 다온타워', '후보 D 바람빌딩'])
    const pick = screen.getByRole('group', { name: '견줄 후보' })
    expect(within(pick).getByText('2곳에서 4곳까지 골라 견줘요')).toBeTruthy()
    const fifth = within(pick).getByRole('button', { name: /하늘빌딩 1층/ })
    expect(fifth.getAttribute('aria-pressed')).toBe('false')
    expect((fifth as HTMLButtonElement).disabled).toBe(true)
    // 하나를 빼면 다섯째를 고를 수 있다
    fireEvent.click(within(pick).getByRole('button', { name: /나래상가 2층/ }))
    expect((fifth as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(fifth)
    expect(fifth.getAttribute('aria-pressed')).toBe('true')
    expect(heads().slice(2).map((h) => h.split(' ').slice(0, 3).join(' '))).toEqual(['후보 A 예시빌딩', '후보 C 다온타워', '후보 D 바람빌딩', '후보 E 하늘빌딩'])
  })

  it('AC-7914.1: 2곳 밑으로는 뺄 수 없다', () => {
    setup()
    const pick = screen.getByRole('group', { name: '견줄 후보' })
    fireEvent.click(within(pick).getByRole('button', { name: /다온타워 4층/ }))
    expect(heads()).toHaveLength(4)
    const left = within(pick).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(left).toHaveLength(2)
    for (const b of left) expect((b as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(left[0])
    expect(heads()).toHaveLength(4)
  })

  it('AC-7914.1: 고르기 단추에는 내려놓은 후보가 없다', () => {
    setup()
    const pick = screen.getByRole('group', { name: '견줄 후보' })
    expect(within(pick).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true'])
    expect(within(pick).queryByText(/예시상가 2층/)).toBeNull()
  })

  it('AC-7914.1: 고른 후보를 내려놓으면(다시 그림) 칸에서 빠지고 남은 후보로 견준다', () => {
    const { rerender, props } = setup()
    const next = [A, { ...B, status: 'dropped' as const }, C, D]
    rerender(<CandidateCompare {...props} candidates={next} />)
    expect(heads().slice(2).map((h) => h.split(' ').slice(0, 3).join(' '))).toEqual(['후보 A 예시빌딩', '후보 C 다온타워'])
  })

  it('AC-7914.1: 견줄 후보가 2곳보다 적으면 점수표 대신 안내 글이고, 진행 상태는 그대로 있다', () => {
    setup({ candidates: [A, D] })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('후보를 2곳 이상 저장하면 나란히 견줘 드려요')).toBeTruthy()
    expect(screen.getByRole('group', { name: '예시빌딩 3층 진행 상태' })).toBeTruthy()
  })
})

describe('AC-7914.1·AC-7919.3: 항목 점수·종합은 받은 설정(무게) 그대로', () => {
  it('AC-7914.1: 무게 칸과 머리 글은 받은 무게 그대로이고, 합계 줄은 무게 합이다', () => {
    setup()
    expect(GROUP_NAMES.map(weightCell)).toEqual(['30', '25', '20', '15', '10'])
    expect(weightCell('합계')).toBe('100')
    expect(screen.getByText(/무게 사는 사람·수요 30 · 경쟁 25 · 교통·흐름 20 · 자리 15 · 비용 10/)).toBeTruthy()
  })

  it('AC-7914.1: 항목 점수는 종합에 보탠 점수 / 그 항목 만점, 손으로 센 후보(교통·흐름만)는 99점 / 100', () => {
    setup()
    expect(cells('교통·흐름')[2]).toBe('99점 / 100 · 가장 높음')
    expect(cells('사는 사람·수요')[2]).toBe('값 없음')
    expect(cells('경쟁')[2]).toBe('값 없음')
    expect(cells('비용')[2]).toBe('매물 없음')
    expect(cells('합계')[2]).toMatch(/^99점/)
  })

  it('AC-7914.1: 점수는 scoreItems(facts.ts scoreFactsOf(후보·매물·지금 의원 값·오늘·과목 고르기), 받은 설정)와 같고, 가장 높은 점수·등수가 보인다', () => {
    setup()
    const rule = freshRule()
    GROUP_NAMES.forEach((name, gi) => {
      const want = expectedScoreCells([A, B, C], rule, firstDepts(), gi)
      const shown = cells(name)
      want.forEach((w, k) => {
        if (w !== null) expect(shown[k], `${name} ${k}`).toBe(w)
      })
    })
    const totals = [A, B, C].map((c) => scoreItems(factsOf(c), rule, 'candidate').total!)
    const rank = (t: number) => totals.filter((x) => x > t).length + 1
    expect(cells('합계')).toEqual(totals.map((t) => `${t}점 ${rank(t)}등`))
  })

  it('AC-7914.1: 경쟁 점수는 지금 의원 체외충격파 값(homeEswt)과 오늘(today)도 받아 센다', () => {
    const rule = freshRule()
    const withHome = scoreItems(factsOf(A), rule, 'candidate').groups[1].points
    const noHome = scoreItems(scoreFactsOf({ candidate: A, listings: LISTINGS, homeEswt: null, today: TODAY, deptRule: firstDepts() }), rule, 'candidate').groups[1].points
    expect(withHome).not.toBe(noHome) // 시험 준비: 값이 달라야 받은 것을 알 수 있다
    const { rerender, props } = setup()
    expect(cells('경쟁')[0]).toMatch(new RegExp(`^${withHome}점`))
    rerender(<CandidateCompare {...props} homeEswt={null} />)
    expect(cells('경쟁')[0]).toMatch(new RegExp(`^${noHome}점`))
  })

  it('AC-7914.1: 항목 막대 길이는 그 항목 점수(0~100)다', () => {
    setup()
    const row = rowHeader('교통·흐름').closest('tr') as HTMLElement
    const bar = within(row).getAllByRole('cell')[3].querySelector('[data-bar] > i') as HTMLElement
    expect(bar.style.width).toBe('99%')
  })

  it('AC-7919.3: 다른 설정을 받으면 다시 부르지 않고 바로 다시 센다(교통·흐름 무게 0 → 교통만 있는 후보는 점수 없음)', () => {
    const { rerender, props, onStatus, onEditWeights } = setup()
    const rule = freshRule()
    rule.weights.transit = 0
    rule.weights.people = 50
    rerender(<CandidateCompare {...props} rule={rule} />)
    expect(weightCell('교통·흐름')).toBe('0')
    expect(weightCell('사는 사람·수요')).toBe('50')
    expect(weightCell('합계')).toBe('100')
    expect(screen.getByText(/무게 사는 사람·수요 50 · 경쟁 25 · 교통·흐름 0/)).toBeTruthy()
    expect(cells('합계')[2]).toBe('점수 없음')
    const a = scoreItems(factsOf(A), rule, 'candidate')
    expect(cells('합계')[0]).toMatch(new RegExp(`^${a.total}점`))
    expect(onStatus).not.toHaveBeenCalled()
    expect(onEditWeights).not.toHaveBeenCalled()
  })

  it('AC-7914.1: [무게 바꾸기]를 누르면 onEditWeights', () => {
    const { onEditWeights } = setup()
    fireEvent.click(screen.getByRole('button', { name: '무게 바꾸기' }))
    expect(onEditWeights).toHaveBeenCalledTimes(1)
  })

  it('AC-7914.1: onEditWeights가 없으면 [무게 바꾸기]도 없다', () => {
    setup({ onEditWeights: undefined })
    expect(screen.queryByRole('button', { name: '무게 바꾸기' })).toBeNull()
  })
})

describe('AC-7921.2: 과목 고르기(deptRule)를 따른다 — 줄 이름 경쟁 의원 + 고른 과목 짧은 이름', () => {
  it('AC-7921.2: 경쟁 줄 이름은 `경쟁 의원`, 작은 글은 고른 과목 짧은 이름(목록 차례, ·로 이음)이고 옛 이름·한의원 뺌 글이 없다', () => {
    setup()
    expect(clean(rowHeader(RIVAL_ROW).textContent)).toBe('경쟁 의원 정형외과·신경외과·마취통증·재활')
    expect(rowHeader(RIVAL_ROW).querySelector('span')?.textContent).toBe('정형외과·신경외과·마취통증·재활')
    expect(document.body.textContent).not.toMatch(/정형외과·통증·재활|한의원 뺌/)
  })

  it('AC-7921.2: 경쟁 수는 facts.ts rivalCount(후보, 과목 고르기)와 같고 1곳당 사는 사람 = 사는 사람 ÷ 경쟁 수(버림)', () => {
    setup()
    expect([A, B, C].map((c) => rivalCount(c, firstDepts()))).toEqual([5, 0, null]) // 시험 준비
    expect(cells(RIVAL_ROW)).toEqual(['5곳', '0곳', '자료 없음'])
    expect(cells('1곳당 사는 사람')).toEqual(['6,000명', '경쟁 의원 없음', '자료 없음'])
  })

  it('AC-7921.2: 위험 신호 수는 pickFlags(flagInputOf(…과목 고르기))와 같다', () => {
    setup()
    const want = [A, B, C].map((c) => pickFlags(flagInputOf({ candidate: c, listings: LISTINGS, today: TODAY, deptRule: firstDepts() })).length)
    expect(want).toEqual([2, 0, 1]) // 시험 준비: A = 위반 건축물인지 + 경쟁 5곳 이상
    expect(cells('위험 신호')).toEqual(['2개', '없음', '1개'])
  })

  it('AC-7921.2: 과목 고르기를 바꾼 설정을 받으면 다시 부르지 않고 줄 작은 글·경쟁 수·1곳당·경쟁 점수·종합·위험 신호 수가 바로 다시 그려진다', () => {
    const { rerender, props, onStatus, onEditWeights } = setup()
    const next = deptRule(['ortho', 'im'])
    rerender(<CandidateCompare {...props} deptRule={next} />)
    expect(clean(rowHeader(RIVAL_ROW).textContent)).toBe('경쟁 의원 내과·정형외과')
    expect([A, B, C].map((c) => rivalCount(c, next))).toEqual([3, 1, null])
    expect(cells(RIVAL_ROW)).toEqual(['3곳', '1곳', '자료 없음'])
    expect(cells('1곳당 사는 사람')).toEqual(['10,000명', '18,000명', '자료 없음'])
    expect(cells('위험 신호')).toEqual(['1개', '없음', '1개'])
    const rule = freshRule()
    const want = expectedScoreCells([A, B, C], rule, next, 1)
    expect(want.slice(0, 2)).not.toEqual(expectedScoreCells([A, B, C], rule, firstDepts(), 1).slice(0, 2)) // 시험 준비: 경쟁 점수가 달라진다
    expect(cells('경쟁').slice(0, 2)).toEqual(want.slice(0, 2))
    expect(cells('합계')[0]).toMatch(new RegExp(`^${scoreItems(factsOf(A, next), rule, 'candidate').total}점`))
    expect(onStatus).not.toHaveBeenCalled()
    expect(onEditWeights).not.toHaveBeenCalled()
  })

  it('AC-7921.2: 경쟁 과목을 하나도 안 고르면 작은 글 `고른 과목 없음`, 경쟁 0곳·경쟁 의원 없음, 점수의 경쟁은 `과목 없음`(값 없는 항목처럼 빠짐)', () => {
    setup({ deptRule: deptRule([]) })
    expect(clean(rowHeader(RIVAL_ROW).textContent)).toBe('경쟁 의원 고른 과목 없음')
    expect(cells(RIVAL_ROW)).toEqual(['0곳', '0곳', '0곳'])
    expect(cells('1곳당 사는 사람')).toEqual(['경쟁 의원 없음', '경쟁 의원 없음', '경쟁 의원 없음'])
    expect(cells('경쟁')).toEqual(['과목 없음', '과목 없음', '과목 없음'])
    const a = scoreItems(factsOf(A, deptRule([])), freshRule(), 'candidate')
    expect(a.groups[1].score).toBeNull() // 시험 준비
    expect(cells('합계')[0]).toMatch(new RegExp(`^${a.total}점`))
    expect(cells('위험 신호')).toEqual(['1개', '없음', '1개'])
  })
})

describe('AC-7914.1: 숫자로 견주기 — 평당 월세·위험 신호 수 등', () => {
  it('AC-7914.1: 무리 줄과 살필 범위·사는 사람·60세 이상·가장 가까운 역(그날 값)', () => {
    setup()
    expect(within(table()).getByText('숫자로 견주기 (후보마다 살필 범위 안)')).toBeTruthy()
    expect(cells('살필 범위')).toEqual(['1km', '500m', '1.5km'])
    expect(cells('사는 사람')).toEqual(['30,000명', '18,000명', '자료 없음'])
    expect(cells('60세 이상')).toEqual(['35%', '22%', '자료 없음'])
    expect(cells('가장 가까운 역')).toEqual(['가람역 · 400m', '나래역 · 800m', '다온역 · 200m'])
  })

  it('AC-7914.1: 받다가 실패한 칸은 지난 값(prev)을 보인다(facts.ts와 같음)', () => {
    const failed = { ok: false, why: 'failed', src: 'rail-stations', prev: { v: { name: '옛가람역', line: '2호선', distM: 450, at: { lat: 37.5, lng: 127 } }, asOf: '2026-10-01' } } as const
    const A2 = { ...A, snapshot: { ...A.snapshot!, station: failed } } as Candidate
    setup({ candidates: [A2, B] })
    expect(cells('가장 가까운 역')).toEqual(['옛가람역 · 450m', '나래역 · 800m'])
  })

  it('AC-7914.1: 층·넓이(평과 ㎡)·보증금·월세·권리금 — 만 원 칸 금액은 manText(0이면 없음), 매물이 없으면 매물 없음', () => {
    setup()
    expect(cells('층 · 전용 평수')).toEqual(['3층 · 30평 (99.17㎡)', '2층 · 40평 (132.23㎡)', '–'])
    expect(cells('보증금 / 월세')).toEqual(['5,000만 원 / 300만 원', '3,000만 원 / 320만 원', '매물 없음'])
    expect(cells('권리금')).toEqual(['3,000만 원', '없음', '매물 없음'])
  })

  it('AC-7914.1: 만 원 칸 금액은 100만 원 아래도 `78만 원`, 만 원으로 안 나눠지면 원 글, 값이 없으면 –', () => {
    const E = cand('id-e', '바람빌딩 5층')
    const F = cand('id-f', '하늘빌딩 1층')
    const LE = listing('l-e', { candidateId: 'id-e', areaM2: 99.17, deposit: 0, rent: 780_000, premium: 150_000_000 })
    const LF = listing('l-f', { candidateId: 'id-f', areaM2: 99.17, deposit: 5_000_000, rent: 785_500, premium: null })
    setup({ candidates: [E, F], listings: [LE, LF] })
    expect(cells('보증금 / 월세')).toEqual(['없음 / 78만 원', '500만 원 / 785,500원'])
    expect(cells('권리금')).toEqual(['1억 5,000만 원', '–'])
    expect(cells('평당 월세')).toEqual(['26,000원 평균과 같아요', '26,183원 평균과 같아요'])
  })

  it('AC-7914.1: 후보 매물은 그 후보에 이어진 매물 가운데 마지막으로 고친 것(facts.ts candidateListing)', () => {
    const old = listing('l-a-old', { candidateId: 'id-a', areaM2: 99.17, deposit: 10_000_000, rent: 1_000_000, premium: 0, updatedAt: '2026-11-01T01:00:00.000Z' })
    setup({ listings: [old, ...LISTINGS] })
    expect(cells('보증금 / 월세')[0]).toBe('5,000만 원 / 300만 원')
  })

  it('AC-7914.1: 평당 월세와 저장한 매물 평균 견주기 글(listings.ts)', () => {
    setup()
    expect(cells('평당 월세')).toEqual(['100,000원 평균과 같아요', '80,000원 저장한 매물 평균보다 20% 싸요', '매물 없음'])
  })

  it('AC-7914.1: 저장한 매물이 2개보다 적으면 평당 월세만 보이고 견주는 글은 없다', () => {
    // B 매물은 넓이가 없어 평당 월세를 셀 수 없다 → 평당 월세가 있는 매물은 A 하나
    setup({ listings: [LA, { ...LB, areaM2: null }] })
    expect(cells('평당 월세')).toEqual(['100,000원', '–', '매물 없음'])
  })

  it('AC-7914.1: 위험 신호 수(확인 필요 포함), 없으면 없음', () => {
    setup()
    expect(cells('위험 신호')).toEqual(['2개', '없음', '1개'])
  })

  it('AC-7914.1: 표 아래에 후보마다 그날 값 기준 날짜(한국 날짜)', () => {
    setup()
    expect(screen.getByText('각 후보 숫자는 그 후보를 저장한 날 값이에요(A 11월 15일 · B 11월 16일 · C 11월 14일)')).toBeTruthy()
  })

  it('AC-7914.1: 그날 값이 없는 후보는 받은 값 없음', () => {
    const E = cand('id-e', '바람빌딩 5층')
    setup({ candidates: [A, E] })
    expect(screen.getByText('각 후보 숫자는 그 후보를 저장한 날 값이에요(A 11월 15일 · B 받은 값 없음)')).toBeTruthy()
  })

  it('AC-7914.1: 예상 환자 줄이 없다', () => {
    setup()
    expect(document.body.textContent).not.toMatch(/예상 환자|하루 환자|예상 내원/)
  })
})

describe('AC-7914.1: 진행 상태 — 단계 바꾸기·내려놓기·다시 올리기 콜백', () => {
  it('AC-7914.1: 후보마다 네 단계, 지금 단계가 눌려 있고 앞 단계는 지난 단계다', () => {
    setup()
    const g = screen.getByRole('group', { name: '예시빌딩 3층 진행 상태' })
    const steps = within(g).getAllByRole('button')
    expect(steps.map((b) => b.textContent)).toEqual(['1. 보는 중', '2. 중개사 연락', '3. 보러 감', '4. 계약 검토'])
    expect(steps.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
    expect(steps[0].getAttribute('data-done')).toBe('true')
    expect(screen.getByText('가람동 · 저장 11월 15일')).toBeTruthy()
  })

  it('AC-7914.1: 다른 단계를 누르면 onStatus(id, 그 단계), 지금 단계를 다시 누르면 부르지 않는다', () => {
    const { onStatus } = setup()
    const g = screen.getByRole('group', { name: '나래상가 2층 진행 상태' })
    fireEvent.click(within(g).getByRole('button', { name: '1. 보는 중' }))
    expect(onStatus).not.toHaveBeenCalled()
    fireEvent.click(within(g).getByRole('button', { name: '4. 계약 검토' }))
    expect(onStatus).toHaveBeenCalledWith('id-b', 'reviewing')
    expect(onStatus).toHaveBeenCalledTimes(1)
  })

  it('AC-7914.1: [내려놓기]는 onStatus(id, dropped)', () => {
    const { onStatus } = setup()
    const rows = screen.getAllByRole('button', { name: '내려놓기' })
    expect(rows).toHaveLength(3)
    fireEvent.click(rows[2])
    expect(onStatus).toHaveBeenCalledWith('id-c', 'dropped')
  })

  it('AC-7914.1: 내려놓은 후보는 접힌 목록에 있고 [다시 올리기]는 onStatus(id, watching)', () => {
    const { onStatus } = setup()
    const box = screen.getByText('내려놓은 후보 1곳').closest('details') as HTMLDetailsElement
    expect(box.open).toBe(false)
    expect(within(box).getByText('예시상가 2층')).toBeTruthy()
    expect(within(box).getByText('바다동')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '예시상가 2층 진행 상태' })).toBeNull()
    fireEvent.click(within(box).getByRole('button', { name: '다시 올리기', hidden: true }))
    expect(onStatus).toHaveBeenCalledWith('id-d', 'watching')
  })

  it('AC-7914.1: 내려놓은 후보가 없으면 접힌 목록도 없다', () => {
    setup({ candidates: [A, B, C] })
    expect(screen.queryByText(/내려놓은 후보/)).toBeNull()
  })

  it('AC-7914.1: 그리기만으로는 콜백을 부르지 않는다', () => {
    const { onStatus, onEditWeights } = setup()
    expect(onStatus).not.toHaveBeenCalled()
    expect(onEditWeights).not.toHaveBeenCalled()
  })
})

describe('AC-7914.1: 화면 글 — 영어 낱말 없음', () => {
  it('AC-7914.1: 화면 글에 영어 낱말이 없다(단위 km·m는 된다)', () => {
    setup()
    const words = (document.body.textContent ?? '').match(/[A-Za-z]+/g) ?? []
    expect(words.filter((w) => !['km', 'm', 'A', 'B', 'C', 'D'].includes(w))).toEqual([])
  })
})

// ── 소스 글자: props·콜백만 · 셈은 lib 한 곳 · PC 모양 하나 ──
const DIR = 'src/components/location/compare'
const FILES = readdirSync(join(process.cwd(), DIR)).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (f: string) => withoutComments(readFileSync(join(process.cwd(), DIR, f), 'utf8'))

describe('AC-7914.1: 견주기 부품 소스', () => {
  it('AC-7914.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toContain('CandidateCompare.tsx')
  })

  it('AC-7914.1: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase를 쓰지 않는다', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\.\.\/clients|XMLHttpRequest|process\.env/
    expect(FILES.filter((f) => banned.test(read(f)))).toEqual([])
  })

  it('AC-7921.2: 점수 값·경쟁 수·위험 신호·후보 매물은 lib/location/facts.ts(과목 고르기)로 — snapshotFacts·옛 화면 셈을 쓰지 않는다', () => {
    const code = read('CandidateCompare.tsx')
    expect(code).toMatch(/from '@\/lib\/location\/facts'/)
    for (const fn of ['scoreFactsOf', 'flagInputOf', 'rivalCount', 'candidateListing', 'shownValue', 'pickFlags', 'rivalShortText', 'manText']) {
      expect(code, fn).toMatch(new RegExp(`\\b${fn}\\(`))
    }
    const all = FILES.map(read).join('\n')
    expect(all).not.toMatch(/snapshotFacts|detail\/frame\/facts|SENIOR_BAND|\.bands\b/)
  })

  it('AC-7914.1: PC 모양 하나 — 화면 폭 앞말(max-md: 등)이 없고, 가져다 쓰는 ds 묶음에도 없다(ds.button·ds.input·ds.textButton 안 씀)', () => {
    const variant = /(?<![\w\-[])(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/
    for (const f of FILES) {
      const code = read(f)
      expect(code, f).not.toMatch(variant)
      expect(code, f).not.toMatch(/\bds\.(?:button|input|textButton)\b/)
      for (const m of code.matchAll(/\bds\.([A-Za-z]\w*(?:\.[A-Za-z]\w*)*)/g)) {
        const value = m[1].split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), ds)
        expect(typeof value, `ds.${m[1]}`).toBe('string')
        expect(String(value), `ds.${m[1]}`).not.toMatch(/(?:^|\s)(?:max-|min-)?(?:sm|md|lg|\d*xl):/)
      }
    }
  })

  it('AC-7914.1: 색은 토큰만 — 소스에 # 색·rgb·기본 팔레트 이름이 없다', () => {
    const raw = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\b(?:bg|text|border|ring)-(?:white|black|gray|slate|red|blue|green|yellow|amber|orange|zinc|neutral|stone|sky|indigo)\b/
    expect(FILES.filter((f) => raw.test(read(f)))).toEqual([])
  })
})

// 시험 준비 확인: 위 후보 값이 facts.ts·score.ts에서 기대한 모양인지(시험 자체가 틀리지 않게)
describe('AC-7914.1: 시험 준비', () => {
  it('AC-7914.1: 교통·흐름만 있는 후보는 99점, 매물 없는 후보는 비용 값 없음', () => {
    const r = scoreItems(factsOf(C), freshRule(), 'candidate')
    expect(r.total).toBe(99)
    expect(r.groups.find((g) => g.id === 'cost')!.score).toBeNull()
  })
})
