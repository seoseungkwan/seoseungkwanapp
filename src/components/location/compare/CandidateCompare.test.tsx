// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import type { Flag } from '@/lib/location/flags'
import { DEFAULT_SCORE_RULE, scoreItems, type ScoreRule } from '@/lib/location/score'
import type { Candidate, CandidateStatus, Got, Listing, ScoreFacts, Snapshot } from '@/types/location'
import { CandidateCompare, type CandidateCompareProps, type CompareRow } from './CandidateCompare'

// 후보 견주기 (spec location REQ-7914 AC-7914.1, REQ-7919 AC-7919.3, design.md 14절, 시안 ?s=compare).
// 부품은 props·콜백만: 후보 줄·점수에 쓰는 값·위험 신호·후보 매물(rows), 저장한 매물(listings), 설정(rule)을 받고
// 진행 단계 바꾸기·내려놓기·다시 올리기는 onStatus, [무게 바꾸기]는 onEditWeights로 넘긴다.
// 점수는 받은 설정 그대로 score.ts scoreItems로 센다(동네 훑기와 같은 설정 → 무게를 바꾸면 바로 다시 센다)

const freshRule = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule

const SNAPSHOT_KEYS = [
  'people', 'trend', 'flow', 'income', 'aptPrice', 'bizPrice', 'apts', 'presale', 'seniors', 'gyms', 'schools',
  'accidents', 'industry', 'pharmacies', 'rivals', 'history', 'station', 'bus', 'market', 'building', 'stores', 'welfare',
] as const
const NONE: Got<never> = { ok: false, why: 'none', src: 'rail-stations' }
function snap(at: string, over: Partial<Snapshot> = {}): Snapshot {
  return { v: 1, at, radiusM: 1000, ...Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, NONE])), ...over } as Snapshot
}
const station = (name: string, distM: number): Snapshot['station'] => ({ ok: true, v: { name, line: '2호선', distM }, src: 'rail-stations', asOf: '2026-11-01' })

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

const flag = (id: Flag['id'], level: Flag['level'] = 'red'): Flag => ({ id, level, title: '제목', detail: '설명', law: null, src: null })

// ── 시안 ?s=compare 같은 후보 셋 + 내려놓은 후보 하나 ──
// 매물: A 30평 월세 300만 원(평당 100,000원) · B 40평 월세 320만 원(평당 80,000원) · 이어지지 않은 매물 30평 360만 원(평당 120,000원) → 평균 100,000원
const LA = listing('l-a', { candidateId: 'id-a', areaM2: 99.17, deposit: 50_000_000, rent: 3_000_000, premium: 30_000_000 })
const LB = listing('l-b', { candidateId: 'id-b', areaM2: 132.23, deposit: 30_000_000, rent: 3_200_000, premium: 0 })
const LX = listing('l-x', { areaM2: 99.17, deposit: 40_000_000, rent: 3_600_000 })
const LISTINGS = [LA, LB, LX]
const SAVED = [100_000, 80_000, 120_000]

const A_BANDS = [2000, 2500, 3000, 3500, 4000, 4500, 4000, 3000, 2000, 1000, 500] // 30,000명 · 60세 이상 10,500명(35%)
const B_BANDS = [2000, 2000, 2500, 3000, 3000, 3500, 1000, 500, 300, 150, 50] // 18,000명 · 60세 이상 2,000명(11%)

const A: CompareRow = {
  candidate: cand('id-a', '예시빌딩 3층', {
    addressNote: '가람동',
    status: 'contacted',
    floorLabel: '3층',
    snapshot: snap('2026-11-15T01:00:00.000Z', { station: station('가람역', 400) }),
    snapshotAt: '2026-11-15T01:00:00.000Z',
    createdAt: '2026-11-15T01:00:00.000Z',
  }),
  facts: {
    areaM2: Math.PI * 1000 * 1000,
    people: { total: 30_000, bands: A_BANDS, households: 12_000 },
    rivals: 3,
    newRivals: 1,
    stationM: 400,
    stops: 8,
    floorLabel: '3층',
    elevators: 1,
    rentPerPy: 100_000,
    deposit: 50_000_000,
    premium: 30_000_000,
    savedRentsPerPy: SAVED,
  },
  flags: [flag('violation-check', 'check'), flag('many-rivals')],
  listing: LA,
}
const B: CompareRow = {
  candidate: cand('id-b', '나래상가 2층', {
    addressNote: '나래동',
    radiusM: 500,
    floorLabel: '2층',
    snapshot: snap('2026-11-16T05:00:00.000Z', { station: station('나래역', 1400) }),
    snapshotAt: '2026-11-16T05:00:00.000Z',
    createdAt: '2026-11-16T05:00:00.000Z',
  }),
  facts: {
    areaM2: Math.PI * 500 * 500,
    people: { total: 18_000, bands: B_BANDS, households: 7_000 },
    rivals: 0,
    newRivals: 0,
    stationM: 1400,
    stops: 3,
    floorLabel: '2층',
    elevators: 2,
    rentPerPy: 80_000,
    deposit: 30_000_000,
    premium: 0,
    savedRentsPerPy: SAVED,
  },
  flags: [],
  listing: LB,
}
// 교통·흐름 값만 있는 후보(손으로 센다): 역 200m → 100점 · 정류장 10곳 → 100점 · 승하차 없음 →
// 교통·흐름 = 버림(100 × 40 ÷ 60) + 버림(100 × 20 ÷ 60) = 66 + 33 = 99점, 종합 = 버림(99 × 20 ÷ 20) = 99점 / 만점 100
const C: CompareRow = {
  candidate: cand('id-c', '다온타워 4층', {
    addressNote: '다온동',
    status: 'visited',
    radiusM: 1500,
    floorLabel: '4층',
    snapshot: snap('2026-11-14T03:00:00.000Z'),
    snapshotAt: '2026-11-14T03:00:00.000Z',
    createdAt: '2026-11-14T03:00:00.000Z',
  }),
  facts: { stationM: 200, stops: 10 },
  flags: [flag('far-station')],
  listing: null,
}
const D: CompareRow = {
  candidate: cand('id-d', '예시상가 2층', { addressNote: '바다동', status: 'dropped' }),
  facts: {},
  flags: [],
  listing: null,
}
const ROWS = [A, B, C, D]

function setup(over: Partial<CandidateCompareProps> = {}) {
  const onStatus = vi.fn<(id: string, status: CandidateStatus) => void>()
  const onEditWeights = vi.fn<() => void>()
  const props: CandidateCompareProps = { rows: ROWS, listings: LISTINGS, rule: freshRule(), onStatus, onEditWeights, ...over }
  const view = render(<CandidateCompare {...props} />)
  return { onStatus, onEditWeights, props, ...view }
}

const table = () => screen.getByRole('table')
/** 몸 줄 이름(첫 칸 머리)으로 줄을 찾아 칸 글자를 — 무게 칸 뒤 후보 칸들만 */
function cells(rowName: string): string[] {
  const row = within(table()).getByRole('rowheader', { name: new RegExp(`^${rowName}(?: |$)`) }).closest('tr')!
  return within(row as HTMLElement).getAllByRole('cell').slice(1).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
}
function weightCell(rowName: string): string {
  const row = within(table()).getByRole('rowheader', { name: new RegExp(`^${rowName}(?: |$)`) }).closest('tr')!
  return (within(row as HTMLElement).getAllByRole('cell')[0].textContent ?? '').trim()
}
const heads = () => within(table()).getAllByRole('columnheader').map((h) => (h.textContent ?? '').replace(/\s+/g, ' ').trim())

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
    const E: CompareRow = { ...C, candidate: cand('id-e', '바람빌딩 5층') }
    const F: CompareRow = { ...C, candidate: cand('id-f', '하늘빌딩 1층') }
    setup({ rows: [A, B, C, E, F] })
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
    const next = [A, { ...B, candidate: { ...B.candidate, status: 'dropped' as const } }, C, D]
    rerender(<CandidateCompare {...props} rows={next} />)
    expect(heads().slice(2).map((h) => h.split(' ').slice(0, 3).join(' '))).toEqual(['후보 A 예시빌딩', '후보 C 다온타워'])
  })

  it('AC-7914.1: 견줄 후보가 2곳보다 적으면 점수표 대신 안내 글이고, 진행 상태는 그대로 있다', () => {
    setup({ rows: [A, D] })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('후보를 2곳 이상 저장하면 나란히 견줘 드려요')).toBeTruthy()
    expect(screen.getByRole('group', { name: '예시빌딩 3층 진행 상태' })).toBeTruthy()
  })
})

describe('AC-7914.1·AC-7919.3: 항목 점수·종합은 받은 설정(무게) 그대로', () => {
  it('AC-7914.1: 무게 칸과 머리 글은 받은 무게 그대로이고, 합계 줄은 무게 합이다', () => {
    setup()
    expect(['사는 사람·수요', '경쟁', '교통·흐름', '자리', '비용'].map(weightCell)).toEqual(['30', '25', '20', '15', '10'])
    expect(weightCell('합계')).toBe('100')
    expect(screen.getByText(/무게 사는 사람·수요 30 · 경쟁 25 · 교통·흐름 20 · 자리 15 · 비용 10/)).toBeTruthy()
  })

  it('AC-7914.1: 항목 점수는 종합에 보탠 점수 / 그 항목 만점, 손으로 센 후보(교통·흐름만)는 99점 / 100', () => {
    setup()
    expect(cells('교통·흐름')[2]).toBe('99점 / 100 · 가장 높음')
    expect(cells('사는 사람·수요')[2]).toBe('값 없음')
    expect(cells('비용')[2]).toBe('매물 없음')
    expect(cells('합계')[2]).toMatch(/^99점/)
  })

  it('AC-7914.1: 점수는 score.ts scoreItems(받은 값, 받은 설정)와 같고, 가장 높은 점수·등수가 보인다', () => {
    setup()
    const rule = freshRule()
    const results = [A, B, C].map((r) => scoreItems(r.facts, rule, 'candidate'))
    const names = ['사는 사람·수요', '경쟁', '교통·흐름', '자리', '비용']
    names.forEach((name, gi) => {
      const pts = results.map((r) => r.groups[gi].points)
      const best = Math.max(...pts.map((p) => p ?? -1))
      const shown = cells(name)
      results.forEach((r, k) => {
        const g = r.groups[gi]
        if (g.points === null) return
        const sum = r.groups.reduce((a, x, i) => (x.score === null ? a : a + rule.weights[(['people', 'rivals', 'transit', 'site', 'cost'] as const)[i]]), 0)
        const max = Math.floor((rule.weights[g.id] * 100) / sum)
        expect(shown[k], `${name} ${k}`).toBe(`${g.points}점 / ${max}${g.points === best && best > 0 ? ' · 가장 높음' : ''}`)
      })
    })
    const totals = results.map((r) => r.total!)
    const rank = (t: number) => totals.filter((x) => x > t).length + 1
    expect(cells('합계')).toEqual(totals.map((t) => `${t}점 ${rank(t)}등`))
  })

  it('AC-7914.1: 항목 막대 길이는 그 항목 점수(0~100)다', () => {
    setup()
    const row = within(table()).getByRole('rowheader', { name: /^교통·흐름/ }).closest('tr')!
    const bar = within(row as HTMLElement).getAllByRole('cell')[3].querySelector('[data-bar] > i') as HTMLElement
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
    const a = scoreItems(A.facts, rule, 'candidate')
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

describe('AC-7914.1: 숫자로 견주기 — 평당 월세·위험 신호 수 등', () => {
  it('AC-7914.1: 무리 줄과 살필 범위·사는 사람·60세 이상·경쟁 수·1곳당 사는 사람·가장 가까운 역', () => {
    setup()
    expect(within(table()).getByText('숫자로 견주기 (후보마다 살필 범위 안)')).toBeTruthy()
    expect(cells('살필 범위')).toEqual(['1km', '500m', '1.5km'])
    expect(cells('사는 사람')).toEqual(['30,000명', '18,000명', '자료 없음'])
    expect(cells('60세 이상')).toEqual(['35%', '11%', '자료 없음'])
    expect(cells('정형외과·통증·재활')).toEqual(['3곳', '0곳', '자료 없음'])
    expect(within(table()).getByRole('rowheader', { name: /^정형외과·통증·재활/ }).textContent).toContain('한의원 뺌')
    expect(cells('1곳당 사는 사람')).toEqual(['10,000명', '경쟁 의원 없음', '자료 없음'])
    expect(cells('가장 가까운 역')).toEqual(['가람역 · 400m', '나래역 · 1.4km', '자료 없음'])
  })

  it('AC-7914.1: 층·넓이(평과 ㎡)·보증금·월세·권리금 — 매물이 없으면 매물 없음', () => {
    setup()
    expect(cells('층 · 전용 평수')).toEqual(['3층 · 30평 (99.17㎡)', '2층 · 40평 (132.23㎡)', '4층'])
    expect(cells('보증금 / 월세')).toEqual(['5,000만 원 / 300만 원', '3,000만 원 / 320만 원', '매물 없음'])
    expect(cells('권리금')).toEqual(['3,000만 원', '0원', '매물 없음'])
  })

  it('AC-7914.1: 평당 월세와 저장한 매물 평균 견주기 글(listings.ts)', () => {
    setup()
    expect(cells('평당 월세')).toEqual(['100,000원 평균과 같아요', '80,000원 저장한 매물 평균보다 20% 싸요', '매물 없음'])
  })

  it('AC-7914.1: 저장한 매물이 2개보다 적으면 평당 월세만 보이고 견주는 글은 없다', () => {
    setup({ listings: [LA] })
    expect(cells('평당 월세')).toEqual(['100,000원', '80,000원', '매물 없음'])
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
    const E: CompareRow = { ...C, candidate: cand('id-e', '바람빌딩 5층') }
    setup({ rows: [A, E] })
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
    setup({ rows: [A, B, C] })
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

// ── 소스 글자: props·콜백만 · PC 모양 하나 ──
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

  it('AC-7914.1: PC 모양 하나 — 화면 폭 앞말(max-md: 등)이 없고, 가져다 쓰는 ds 묶음에도 없다', () => {
    const variant = /(?<![\w\-[])(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/
    for (const f of FILES) {
      const code = read(f)
      expect(code, f).not.toMatch(variant)
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

// 시험 준비 확인: 위 후보 값이 scoreItems에서 기대한 모양인지(시험 자체가 틀리지 않게)
describe('AC-7914.1: 시험 준비', () => {
  it('AC-7914.1: 교통·흐름만 있는 후보는 99점, 매물 없는 후보는 비용 값 없음', () => {
    const r = scoreItems(C.facts as ScoreFacts, freshRule(), 'candidate')
    expect(r.total).toBe(99)
    expect(r.groups.find((g) => g.id === 'cost')!.score).toBeNull()
  })
})
