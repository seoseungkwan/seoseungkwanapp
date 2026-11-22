// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calcCosts, checkCosts } from '@/lib/location/costs'
import { pickFlags } from '@/lib/location/flags'
import { wonText } from '@/lib/location/money'
import { DEFAULT_SCORE_RULE, SCORE_GROUPS, scoreItems, type ScoreRule } from '@/lib/location/score'
import { sourceText } from '@/components/location/common/text'
import type { Candidate, Listing, LocationNote, Rival, ScoreFacts, Snapshot } from '@/types/location'
import { OnePageReport, type OnePageReportProps } from './OnePageReport'

// 한 장 보고서(specs/location TASK-40 · REQ-7914 · AC-7914.2, 시안 docs/mockups/location ?s=report).
// A4 한 장(요약·점수·위험·비용·출처 기준 날짜, 예상 환자 줄 없음) · [인쇄]·[PDF로 저장]은 window.print()만 · 앱 틀은 print: 클래스로 숨김.
// 점수·위험 신호·비용은 lib/location(scoreItems·pickFlags·calcCosts)을 그대로 불러 견준다. 이름·숫자는 모두 지어낸 값이다

const CAND = '11111111-1111-4111-8111-111111111111'
const TODAY = '2026-11-22'

const ok = <T,>(v: T, src: string, asOf: string) => ({ ok: true as const, v, src, asOf })

// 월~일 + 공휴일 8칸(분). 정형외과: 평일 9~18시·토 9~13시 / 통증: 평일 9~20시
const ORTHO_WEEK: Rival['week'] = [[540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 780], null, null]
const PAIN_WEEK: Rival['week'] = [[540, 1200], [540, 1200], [540, 1200], [540, 1200], [540, 1200], null, null, null]

const RIVALS: Rival[] = [
  { name: '예시정형외과의원', kind: 'ortho', doctors: 2, therapists: null, mri: true, ct: false, openedYear: 2019, distM: 20, sameBuilding: true, week: ORTHO_WEEK, eswt: 60000 },
  { name: '예시통증의학과의원', kind: 'pain', doctors: 1, therapists: 2, mri: false, ct: false, openedYear: 2024, distM: 450, sameBuilding: false, week: PAIN_WEEK, eswt: 80000 },
  { name: '예시한의원', kind: 'korean', doctors: 1, therapists: null, mri: null, ct: null, openedYear: 2015, distM: 300, sameBuilding: false, week: null, eswt: null },
]

const SNAP: Snapshot = {
  v: 1,
  at: '2026-11-15T01:00:00.000Z', // 한국 2026-11-15 10시
  radiusM: 1000,
  // 30,000명 · 60세 이상(6~10칸) 10,000명 · 40세 이상(4~10칸) 19,000명
  people: ok({ total: 30000, bands: [2000, 2500, 3000, 3500, 4500, 4500, 4000, 3000, 2000, 800, 200], households: 12000, unmatched: 0 }, 'pop-age', '2026-10'),
  trend: ok([{ ym: '2026-10', total: 30000 }, { ym: '2022-10', total: 29000 }, { ym: '2024-10', total: 29500 }], 'pop-age', '2026-10'),
  flow: { ok: false, why: 'outside', src: 'flow-volume' },
  income: ok({ sggName: '예시구', won: 45_000_000, year: 2024 }, 'income', '2024년 귀속'),
  aptPrice: ok({ perM2: 8_000_000, deals: 12 }, 'apt-trade', '2026-10'),
  bizPrice: { ok: false, why: 'failed', src: 'biz-trade' },
  apts: ok([{ name: '예시아파트', households: 1200, builtYear: 2010, bdongName: '가람동' }], 'apt-info', '2026-11-15'),
  presale: ok(
    [
      { name: '예시파크', households: 640, moveIn: '2028-09' },
      { name: '예시힐', households: 1120, moveIn: '2027-03' },
    ],
    'presale',
    '2026-11',
  ),
  seniors: ok(12, 'senior', '2026-11-15'),
  gyms: ok(8, 'gym', '2026-11-15'),
  schools: ok(6, 'school', '2026-11-15'),
  accidents: ok({ spots: 2, cases: 9 }, 'accident', '2025'),
  industry: ok({ sggName: '예시구', employees: 3000, parks: 1, quarter: '2025-06' }, 'industry', '2025년 2분기'),
  pharmacies: ok(1, 'stores', '2026-09-30'),
  rivals: ok(RIVALS, 'hosp-list', '2026-11-15'),
  history: ok(
    [
      { kind: 'open', name: '예시재활의학과의원', dept: '재활의학과', on: '2025-03-02', distM: 600 },
      { kind: 'close', name: '예시▣▣의원', dept: '정형외과', on: '2024-03-31', distM: 10 },
    ],
    'clinic-license',
    '2026-11-15',
  ),
  // 이번에 못 받아 지난 값을 그대로 쓴다
  station: { ok: false, why: 'failed', src: 'rail-stations', prev: { v: { name: '예시역', line: '2호선', distM: 1400 }, asOf: '2026-05-01' } },
  bus: ok(5, 'bus-stops', '2026-10-01'),
  market: { ok: false, why: 'none', src: 'market' },
  building: ok(
    {
      usage: '제1종 근린생활시설',
      structure: '철근콘크리트',
      above: 7,
      below: 2,
      totalM2: 3980,
      approvedOn: '2009-05-20',
      elevators: 2,
      parking: 42,
      floors: [
        { label: '지1', usage: '주차장', m2: 400 },
        { label: '1', usage: '소매점', m2: 380 },
        { label: '2', usage: '의원', m2: 412 },
        { label: '3', usage: '의원', m2: 412 },
        { label: '4', usage: '사무소', m2: 412 },
      ],
    },
    'building',
    '2026-11-15',
  ),
  // 1층·2층에만 가게 → 3·4층이 빈 층(지하 주차장은 세지 않음)
  stores: ok([{ floor: '1', count: 3 }, { floor: '2', count: 1 }, { floor: '4', count: 0 }], 'stores', '2026-09-30'),
  welfare: { ok: false, why: 'not-applied', src: 'welfare' },
}

const CANDIDATE: Candidate = {
  id: CAND,
  name: '예시빌딩 3층',
  addressNote: '가람동 12-3',
  lat: 37.5,
  lng: 127.0,
  radiusM: 1000,
  status: 'visited',
  floorLabel: '3층',
  areaM2: 171.9, // 52평
  signVisible: 'unknown',
  violation: null,
  costs: {
    deposit: 100_000_000,
    premium: 0,
    interior: 1_500_000,
    equipment: 200_000_000,
    otherStart: 30_000_000,
    rent: 5_200_000,
    mgmt: 780_000,
    payroll: 12_000_000,
    otherMonth: 3_000_000,
    perPatient: 30_000,
    workDays: 26,
  },
  terms: {
    freeRent: { now: '2개월', want: '3개월' },
    mgmt: { now: '78만 원', want: '' },
    raise: { now: '해마다 5%', want: '2년마다 5%' },
    memo: '관리비 따로',
  },
  checks: {},
  openOn: null,
  tasksDone: [],
  snapshot: SNAP,
  snapshotAt: SNAP.at,
  watchCheckedOn: null,
  createdAt: '2026-11-15T01:00:00.000Z',
  updatedAt: '2026-11-15T01:00:00.000Z',
}

const listingOf = (over: Partial<Listing>): Listing => ({
  id: 'L1',
  candidateId: CAND,
  title: '예시빌딩 3층',
  url: '',
  areaM2: 171.9,
  floorLabel: '3층',
  deposit: 100_000_000,
  rent: 5_200_000,
  premium: 0,
  mgmt: 780_000,
  brokerId: null,
  brokerNote: '예시부동산 김예시 010-0000-0011',
  memo: '',
  lat: null,
  lng: null,
  createdAt: '2026-11-12T01:00:00.000Z',
  updatedAt: '2026-11-12T01:00:00.000Z',
  ...over,
})
const LISTING = listingOf({})
// 38평 · 월세 330만 원 → 평당 86,842원 · 둘 평균 93,421원
const OTHER = listingOf({ id: 'L2', candidateId: null, title: '예시센터 5층', areaM2: 125.61, floorLabel: '5층', rent: 3_300_000, deposit: 50_000_000 })

const NOTES: LocationNote[] = [
  { id: 'n1', candidateId: CAND, day: '2026-11-14', body: '후보로 저장.', createdAt: '2026-11-14T01:00:00.000Z' },
  { id: 'n2', candidateId: CAND, day: '2026-11-20', body: '중개사와 통화. 무상 3개월 가능.', createdAt: '2026-11-20T01:00:00.000Z' },
  { id: 'n3', candidateId: CAND, day: '2026-11-18', body: '보러 감. 엘리베이터 넓음.', createdAt: '2026-11-18T01:00:00.000Z' },
  { id: 'n4', candidateId: 'other', day: '2026-11-21', body: '다른 후보 메모', createdAt: '2026-11-21T01:00:00.000Z' },
]

// 부르는 쪽(잇기)이 그날 값 + 후보 줄·매물·지금 의원 값으로 채우는 점수 값
const FACTS: ScoreFacts = {
  areaM2: Math.PI * 1000 * 1000,
  people: { total: 30000, bands: [2000, 2500, 3000, 3500, 4500, 4500, 4000, 3000, 2000, 800, 200], households: 12000 },
  apartments: 1200,
  presale: 1760,
  trend: [{ ym: '2022-10', total: 29000 }, { ym: '2024-10', total: 29500 }, { ym: '2026-10', total: 30000 }],
  accidentSpots: 2,
  industryEmployees: 3000,
  schools: 6,
  seniorCenters: 12,
  gyms: 8,
  welfareRate: null,
  rivals: 2,
  newRivals: 1,
  gapCells: 12,
  rivalEswt: 70000,
  homeEswt: 80000,
  stationM: 1400,
  stops: 5,
  flow: null,
  floorLabel: '3층',
  elevators: 2,
  parking: 42,
  buildingAge: 17,
  pharmacies: 1,
  sign: 'unknown',
  violation: null,
  rentPerPy: 100000,
  deposit: 100_000_000,
  premium: 0,
  savedRentsPerPy: [100000, 86842],
}

const copyRule = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule

const baseProps = (over: Partial<OnePageReportProps> = {}): OnePageReportProps => ({
  candidate: CANDIDATE,
  listing: LISTING,
  listings: [LISTING, OTHER],
  notes: NOTES,
  facts: FACTS,
  rule: copyRule(),
  today: TODAY,
  hospitalName: '샘플정형외과의원',
  onBack: () => {},
  ...over,
})

const paper = () => screen.getByRole('article', { name: '한 장 보고서' })
const region = (name: string) => within(paper()).getByRole('region', { name })
/** 종이 머리(header)·맨 아래(footer) — 종이(article) 안이라 banner·contentinfo 역할이 없다 */
function part(tag: 'header' | 'footer'): HTMLElement {
  const el = paper().querySelector<HTMLElement>(tag)
  if (!el) throw new Error(`종이에 ${tag}가 없어요`)
  return el
}
const text = (el: Element | null) => el?.textContent ?? ''
/** 그 칸(dt) 옆 값(dd) 글 */
function dd(area: HTMLElement, label: string): string {
  const dt = within(area).getAllByText(label, { selector: 'dt' })
  expect(dt, label).toHaveLength(1)
  return text(dt[0].nextElementSibling)
}

let printSpy: ReturnType<typeof vi.fn>
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  printSpy = vi.fn()
  window.print = printSpy as unknown as typeof window.print
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-7914.2: A4 한 장 — 요약', () => {
  it('AC-7914.2: 종이 머리에 보고서·진행 상태, 후보 이름·적은 주소, 뽑은 날·저장한 날·살필 범위·병원 이름이 있다', () => {
    render(<OnePageReport {...baseProps()} />)
    const head = part('header')
    expect(text(head)).toContain('입지 분석 보고서 · 보러 감')
    expect(within(head).getByRole('heading', { name: '예시빌딩 3층' })).toBeTruthy()
    expect(text(head)).toContain('가람동 12-3')
    expect(text(head)).toContain('2026년 11월 22일 뽑음 · 자료는 2026년 11월 15일(저장한 날) 값 · 살필 범위 1km · 샘플정형외과의원')
  })

  it('AC-7914.2: 병원 이름이 비면 그 조각을 빼고, 그날 값이 없으면 저장한 날 조각을 뺀다', () => {
    render(<OnePageReport {...baseProps({ hospitalName: '  ', candidate: { ...CANDIDATE, snapshot: null, snapshotAt: null } })} />)
    const head = text(part('header'))
    expect(head).toContain('2026년 11월 22일 뽑음 · 살필 범위 1km')
    expect(head).not.toContain('자료는')
    expect(head).not.toContain('샘플')
  })

  it('AC-7914.2: 사는 사람·수요 묶음 — 사는 사람·60세 이상·고른 나이대 밀도·4년 추세·입주 예정·교통사고 다발', () => {
    render(<OnePageReport {...baseProps()} />)
    const r = region('사는 사람·수요')
    expect(dd(r, '사는 사람')).toBe('30,000명 · 12,000세대')
    expect(dd(r, '60세 이상')).toBe('10,000명 (33%)')
    // 처음 나이대(40세 이상) 19,000명 ÷ 3.14km² = 6,047.8…
    expect(dd(r, '40세 이상 밀도')).toBe('1km²당 6,047명')
    expect(dd(r, '4년 추세')).toBe('+3.4% (2022년 10월부터)')
    expect(dd(r, '입주 예정')).toBe('2027년 3월 1,120세대, 2028년 9월 640세대')
    expect(dd(r, '교통사고 다발')).toBe('2곳 · 사고 9건')
  })

  it('AC-7914.2: 경쟁 묶음 — 정형외과·통증·재활 수와 1곳당 사는 사람, 한의원, 3년 개폐업, 진료 시간 빈틈, 체외충격파 평균', () => {
    render(<OnePageReport {...baseProps()} />)
    const r = region('경쟁')
    expect(dd(r, '정형외과·통증·재활')).toBe('2곳 · 1곳당 15,000명')
    expect(dd(r, '한의원')).toBe('1곳')
    expect(dd(r, '3년 개폐업')).toBe('문 엶 1 · 문 닫음 1')
    expect(dd(r, '진료 시간 빈틈')).toBe('평일 아침 8~9시, 평일 밤 20~21시, 토요일 오후, 일요일')
    expect(dd(r, '체외충격파 평균')).toBe('70,000원 (지금 의원 80,000원)')
  })

  it('AC-7914.2: 자리·교통 묶음 — 역(지난 값)·버스·사람 흐름(자료 없는 지역)·건물·엘리베이터·주차·위반 건축물·빈 층', () => {
    render(<OnePageReport {...baseProps()} />)
    const r = region('자리·교통')
    expect(dd(r, '역')).toBe('예시역 · 1.4km')
    expect(dd(r, '버스')).toBe('400m 안 정류장 5곳')
    expect(dd(r, '사람 흐름')).toBe('이 지역은 자료 없음')
    expect(dd(r, '건물')).toBe('2009년 · 지하 2층 · 지상 7층')
    expect(dd(r, '엘리베이터·주차')).toBe('엘리베이터 2대 · 주차 42대')
    expect(dd(r, '위반 건축물')).toBe('안 고름 — 건축물대장을 떼어 확인하세요')
    expect(dd(r, '빈 층')).toBe('2개 층(짐작)')
  })

  it('AC-7914.2: 위반 건축물은 고른 값 그대로(있음·없음·모름)', () => {
    const cases = [
      ['yes', '있음'],
      ['no', '없음'],
      ['unknown', '모름 — 건축물대장을 떼어 확인하세요'],
    ] as const
    for (const [violation, shown] of cases) {
      render(<OnePageReport {...baseProps({ candidate: { ...CANDIDATE, violation } })} />)
      expect(dd(region('자리·교통'), '위반 건축물'), violation).toBe(shown)
      cleanup()
    }
  })

  it('AC-7914.2: 받지 못한 자료는 그 칸에 자료 없음 글(design.md 15절)이고 다른 칸은 그대로다', () => {
    const snapshot: Snapshot = { ...SNAP, rivals: { ok: false, why: 'not-applied', src: 'hosp-list' }, bus: { ok: false, why: 'failed', src: 'bus-stops' } }
    render(<OnePageReport {...baseProps({ candidate: { ...CANDIDATE, snapshot } })} />)
    expect(dd(region('경쟁'), '정형외과·통증·재활')).toBe("공공데이터포털에서 '병원정보서비스' 활용신청을 하면 보여요.")
    expect(dd(region('자리·교통'), '버스')).toBe('지금 받지 못했어요.')
    expect(dd(region('사는 사람·수요'), '사는 사람')).toBe('30,000명 · 12,000세대')
  })

  it('AC-7914.2: 임대 조건(제안 → 바람) 여섯 줄과 진행 메모는 이 후보의 최근 2개만', () => {
    render(<OnePageReport {...baseProps()} />)
    const terms = region('임대 조건(제안 → 바람)')
    expect(dd(terms, '무상 기간')).toBe('2개월 → 3개월')
    expect(dd(terms, '관리비')).toBe('78만 원')
    expect(dd(terms, '월세 올리는 비율')).toBe('해마다 5% → 2년마다 5%')
    expect(dd(terms, '원상 복구')).toBe('–')
    expect(dd(terms, '계약 기간')).toBe('–')
    expect(dd(terms, '권리금')).toBe('–')
    const memo = region('진행 메모')
    expect([...memo.querySelectorAll('dt')].map(text)).toEqual(['2026년 11월 20일', '2026년 11월 18일'])
    expect(dd(memo, '2026년 11월 20일')).toBe('중개사와 통화. 무상 3개월 가능.')
    expect(text(memo)).not.toContain('다른 후보 메모')
  })
})

describe('AC-7914.2: A4 한 장 — 점수', () => {
  it('AC-7914.2: 종합 점수는 받은 설정으로 매긴 scoreItems 종합이고 / 100점이다', () => {
    const rule = copyRule()
    render(<OnePageReport {...baseProps({ rule })} />)
    const result = scoreItems(FACTS, rule, 'candidate')
    expect(result.total).not.toBeNull()
    const box = within(paper()).getByRole('group', { name: '종합 점수' })
    expect(text(box)).toBe(`종합 점수${result.total}/ 100점`)
  })

  it('AC-7914.2: 항목 다섯은 SCORE_GROUPS 차례로 `{보탠 점수}/{만점}`이다', () => {
    const rule = copyRule()
    render(<OnePageReport {...baseProps({ rule })} />)
    const result = scoreItems(FACTS, rule, 'candidate')
    const sum = result.groups.reduce((s, g) => (g.score === null ? s : s + rule.weights[g.id]), 0)
    const items = within(within(paper()).getByRole('list', { name: '항목 점수' })).getAllByRole('listitem')
    expect(items.map(text)).toEqual(
      SCORE_GROUPS.map((g) => {
        const got = result.groups.find((x) => x.id === g.id)!
        return `${g.name}${got.points}/${Math.floor((rule.weights[g.id] * 100) / sum)}`
      }),
    )
  })

  it('AC-7914.2: 설정(무게)을 바꿔 다시 그리면 종합 점수가 바로 다시 매겨진다', () => {
    const { rerender } = render(<OnePageReport {...baseProps()} />)
    const before = text(within(paper()).getByRole('group', { name: '종합 점수' }))
    const rule = copyRule()
    rule.weights = { people: 0, rivals: 0, transit: 100, site: 0, cost: 0 }
    rerender(<OnePageReport {...baseProps({ rule })} />)
    const after = scoreItems(FACTS, rule, 'candidate').total
    expect(text(within(paper()).getByRole('group', { name: '종합 점수' }))).toBe(`종합 점수${after}/ 100점`)
    expect(text(within(paper()).getByRole('group', { name: '종합 점수' }))).not.toBe(before)
  })

  it('AC-7914.2: 값이 하나도 없으면 `점수 없음`, 항목은 `값 없음`(매물이 없는 비용은 `매물 없음`)', () => {
    render(<OnePageReport {...baseProps({ facts: {}, listing: null })} />)
    expect(text(within(paper()).getByRole('group', { name: '종합 점수' }))).toBe('종합 점수점수 없음')
    const items = within(within(paper()).getByRole('list', { name: '항목 점수' })).getAllByRole('listitem')
    expect(items.map(text)).toEqual(['사는 사람·수요값 없음', '경쟁값 없음', '교통·흐름값 없음', '자리값 없음', '비용매물 없음'])
  })
})

describe('AC-7914.2: A4 한 장 — 위험 신호', () => {
  it('AC-7914.2: 위험 신호는 pickFlags 차례·글 그대로이고, 확인 필요는 `{제목} (확인 필요) — {설명}`이다', () => {
    render(<OnePageReport {...baseProps()} />)
    const flags = pickFlags({
      rivals: RIVALS,
      history: SNAP.history.ok ? SNAP.history.v : null,
      building: SNAP.building.ok ? SNAP.building.v : null,
      people: SNAP.people.ok ? SNAP.people.v : null,
      station: { name: '예시역', line: '2호선', distM: 1400 },
      bus: 5,
      today: TODAY,
      radiusM: 1000,
      violation: null,
      floorLabel: '3층',
      listing: LISTING,
      listings: [LISTING, OTHER],
    })
    expect(flags.map((f) => f.id)).toEqual(['violation-check', 'same-building', 'closed-here', 'far-station'])
    const area = region(`위험 신호 ${flags.length}개`)
    const lines = within(area).getAllByRole('listitem').map(text)
    expect(lines).toEqual(flags.map((f) => `${f.title}${f.level === 'check' ? ' (확인 필요)' : ''} — ${f.detail}`))
    expect(lines[0]).toBe(
      '위반 건축물인지 (확인 필요) — 건축물대장을 떼어 확인하세요. 위반 건축물이면 의원 개설 신고가 막힐 수 있어요. 확인한 뒤 건물 서류에서 골라요(아직 안 고름).',
    )
    expect(lines[2]).toBe('이 자리(3층)에서 2024년 3월에 의원이 문을 닫았어요 — 예시▣▣의원 · 왜 닫았는지 중개사에게 물어봐요.')
  })

  it('AC-7914.2: 위반 건축물을 `없음`으로 고르면 그 신호가 빠지고 수가 줄어든다', () => {
    render(<OnePageReport {...baseProps({ candidate: { ...CANDIDATE, violation: 'no' } })} />)
    const area = region('위험 신호 3개')
    expect(text(area)).not.toContain('위반 건축물')
  })
})

describe('AC-7914.2: A4 한 장 — 비용', () => {
  it('AC-7914.2: 매물·비용 묶음 — 층·전용(평과 ㎡)·보증금/월세·관리비·권리금·평당 월세(저장한 매물 평균)·처음에 드는 돈·손익분기·중개사', () => {
    render(<OnePageReport {...baseProps()} />)
    const r = region('매물·비용')
    const sum = calcCosts(checkCosts(CANDIDATE.costs), CANDIDATE.areaM2)
    expect(sum.startTotal).toBe(533_880_000)
    expect(dd(r, '층 · 전용')).toBe('3층 · 52평 (171.9㎡)')
    expect(dd(r, '보증금 / 월세')).toBe('1억 원 / 520만 원')
    expect(dd(r, '관리비 · 권리금')).toBe('780,000원 · 0원')
    expect(dd(r, '평당 월세')).toBe('100,000원 (저장한 매물 평균 93,421원)')
    expect(dd(r, '처음에 드는 돈')).toBe(wonText(533_880_000))
    expect(dd(r, '처음에 드는 돈')).toBe('5억 3,388만 원')
    expect(dd(r, '손익분기')).toBe('하루 26.8명')
    expect(dd(r, '중개사')).toBe('예시부동산 김예시 010-0000-0011')
  })

  it('AC-7914.2: 매물이 없고 비용 칸이 비면 그 값은 `–`이고, 매물 하나뿐이면 평균을 붙이지 않는다', () => {
    render(<OnePageReport {...baseProps({ listing: null, listings: [], candidate: { ...CANDIDATE, costs: {} } })} />)
    const r = region('매물·비용')
    expect(dd(r, '층 · 전용')).toBe('3층 · 52평 (171.9㎡)')
    for (const label of ['보증금 / 월세', '관리비 · 권리금', '평당 월세', '처음에 드는 돈', '손익분기', '중개사']) expect(dd(r, label), label).toBe('–')
    cleanup()
    render(<OnePageReport {...baseProps({ listings: [LISTING] })} />)
    expect(dd(region('매물·비용'), '평당 월세')).toBe('100,000원')
  })
})

describe('AC-7914.2: A4 한 장 — 출처 기준 날짜 · 예상 환자 줄 없음', () => {
  it('AC-7914.2: 맨 아래 출처 줄은 값이 있는 그날 값마다 `{기관} {자료} · 기준 {날짜}`(지난 값은 그 날짜)이고 내가 적은 값으로 끝난다', () => {
    render(<OnePageReport {...baseProps()} />)
    const foot = text(part('footer'))
    expect(foot.startsWith('출처: ')).toBe(true)
    expect(foot.endsWith('. 숫자는 저장한 날 값이고 버림으로 적었어요.')).toBe(true)
    const parts = foot.slice('출처: '.length, -'. 숫자는 저장한 날 값이고 버림으로 적었어요.'.length).split(' / ')
    expect(parts).toContain(sourceText('pop-age', '2026-10'))
    expect(parts).toContain(sourceText('rail-stations', '2026-05-01'))
    expect(parts).toContain(sourceText('hosp-list', '2026-11-15'))
    expect(parts).toContain(sourceText('building', '2026-11-15'))
    expect(parts.at(-1)).toBe(sourceText('user'))
    // 같은 줄은 한 번만(사는 사람·4년 추세는 같은 출처·같은 날짜)
    expect(parts.filter((p) => p === sourceText('pop-age', '2026-10'))).toHaveLength(1)
    // 받지 못하고 지난 값도 없는 자료는 적지 않는다
    for (const id of ['biz-trade', 'market', 'welfare', 'flow-volume']) expect(parts.some((p) => p === sourceText(id)), id).toBe(false)
    expect(parts.some((p) => p.startsWith(sourceText('biz-trade')!))).toBe(false)
  })

  it('AC-7914.2: 예상 환자 줄이 없다(손익분기만 있다)', () => {
    render(<OnePageReport {...baseProps()} />)
    expect(text(paper())).not.toContain('예상')
    expect(text(paper())).not.toContain('하루 평균 환자')
  })

  it('AC-7914.2: 화면 글에 영어 낱말이 없다(PDF·A4·km·m와 기관이 붙인 이름만)', () => {
    const { container } = render(<OnePageReport {...baseProps()} />)
    // 보이는 글만(<style> 안 인쇄 규칙 글자는 화면 글이 아니다)
    const shown = container.cloneNode(true) as HTMLElement
    for (const style of shown.querySelectorAll('style')) style.remove()
    const words = (shown.textContent ?? '').match(/[A-Za-z]+/g) ?? []
    const allowed = new Set(['PDF', 'A', 'km', 'm', 'HUB', 'SGIS', 'TASIS', 'KTX', 'MRI', 'CT'])
    expect(words.filter((w) => !allowed.has(w))).toEqual([])
  })
})

describe('AC-7914.2: [인쇄]·[PDF로 저장]은 브라우저 인쇄 창만', () => {
  it('AC-7914.2: [인쇄]를 누르면 window.print()를 한 번 부르고 바깥을 부르지 않는다', () => {
    render(<OnePageReport {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }))
    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("AC-7914.2: [PDF로 저장]은 'PDF로 저장'을 고르라는 안내를 먼저 보이고 잠시 뒤 window.print()를 한 번 부른다", () => {
    vi.useFakeTimers()
    render(<OnePageReport {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'PDF로 저장' }))
    expect(screen.getByRole('status').textContent).toBe("인쇄 창이 열리면 프린터(대상)를 'PDF로 저장'으로 골라요.")
    expect(printSpy).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('AC-7914.2: [PDF로 저장]을 누른 뒤 화면을 떠나면 인쇄 창을 열지 않는다', () => {
    vi.useFakeTimers()
    const { unmount } = render(<OnePageReport {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'PDF로 저장' }))
    unmount()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(printSpy).not.toHaveBeenCalled()
  })

  it('AC-7914.2: 도구 줄에 `A4 한 장 · 인쇄하면 앱 틀은 빠지고 종이만 나와요`와 [후보로 돌아가기]가 있고 누르면 돌아가기 콜백', () => {
    const onBack = vi.fn()
    render(<OnePageReport {...baseProps({ onBack })} />)
    const tools = screen.getByRole('group', { name: '보고서 도구' })
    expect(text(tools)).toContain('A4 한 장 · 인쇄하면 앱 틀은 빠지고 종이만 나와요')
    fireEvent.click(within(tools).getByRole('button', { name: '후보로 돌아가기' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(printSpy).not.toHaveBeenCalled()
  })
})

describe('AC-7914.2: 인쇄에서 앱 틀은 빠지고 종이만 A4로', () => {
  it('AC-7914.2: 도구 줄·안내 줄은 print:hidden이고, 종이와 그 감싸개는 숨지 않고 인쇄 때 여백·테두리·바탕을 뺀다', () => {
    render(<OnePageReport {...baseProps()} />)
    expect(screen.getByRole('group', { name: '보고서 도구' }).className).toContain('print:hidden')
    expect(screen.getByRole('status').className).toContain('print:hidden')
    const sheet = paper()
    expect(sheet.className.split(/\s+/)).toEqual(expect.arrayContaining(['w-[210mm]', 'print:w-auto', 'print:border-0', 'print:p-0']))
    const wrap = sheet.parentElement as HTMLElement
    expect(wrap.className.split(/\s+/)).toEqual(expect.arrayContaining(['print:m-0', 'print:p-0', 'print:bg-transparent']))
    for (let el: HTMLElement | null = sheet; el && el !== document.body; el = el.parentElement) {
      expect(el.className.split(/\s+/), el.tagName).not.toContain('print:hidden')
    }
  })

  it('AC-7914.2: 이 화면이 붙어 있을 때만 인쇄 종이를 A4 세로로 정한다(@page)', () => {
    const { container } = render(<OnePageReport {...baseProps()} />)
    const style = container.querySelector('style')
    expect(text(style)).toMatch(/@media print\s*\{\s*@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*12mm\s*\}\s*\}/)
  })

  it('AC-7914.2: 화면에 보고서 저장·서버로 보내기 단추가 없다([후보로 돌아가기]·[PDF로 저장]·[인쇄] 셋뿐)', () => {
    render(<OnePageReport {...baseProps()} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['후보로 돌아가기', 'PDF로 저장', '인쇄'])
    expect(screen.queryAllByRole('link')).toEqual([])
  })
})
