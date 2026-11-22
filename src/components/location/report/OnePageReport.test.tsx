// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calcCosts, checkCosts } from '@/lib/location/costs'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import { flagInputOf, scoreFactsOf } from '@/lib/location/facts'
import { pickFlags } from '@/lib/location/flags'
import { REPORT, weightsText } from '@/lib/location/method'
import { manText } from '@/lib/location/money'
import { DEFAULT_SCORE_RULE, SCORE_GROUPS, scoreItems, type ScoreRule } from '@/lib/location/score'
import { sourceText } from '@/components/location/common/text'
import type { Candidate, DeptRule, Listing, LocationNote, Rival, Snapshot, SnapshotValue } from '@/types/location'
import { OnePageReport, type OnePageReportProps } from './OnePageReport'

// 한 장 보고서(specs/location TASK-40·TASK-75 · REQ-7914·REQ-7920·REQ-7905 · AC-7914.2·AC-7920.5·AC-7905.7, 시안 docs/mockups/location ?s=report).
// 첫 장 A4 한 장(요약·점수·위험·비용·출처 기준 날짜, 예상 환자 줄 없음, 경쟁 줄은 고른 과목) + 둘째 장 '이렇게 분석했어요'(method.ts REPORT 글).
// [인쇄]·[PDF로 저장]은 window.print()만 · 앱 틀은 print: 클래스로 숨김 · 둘째 장은 새 쪽에서 시작, 인쇄 때 92%.
// 점수·위험 신호·비용은 lib/location(scoreFactsOf·scoreItems·flagInputOf·pickFlags·calcCosts)을 그대로 불러 견준다. 이름·숫자는 모두 지어낸 값이다

const CAND = '11111111-1111-4111-8111-111111111111'
const TODAY = '2026-11-22'
const P = { lat: 37.5, lng: 127.0 }

const ok = <T,>(v: T, src: string, asOf: string) => ({ ok: true as const, v, src, asOf })

// 월~일 + 공휴일 8칸(분). 정형외과: 평일 9~18시·토 9~13시 / 통증: 평일 9~20시
type Week = NonNullable<Rival['detail']>['week']
const ORTHO_WEEK: Week = [[540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 780], null, null]
const PAIN_WEEK: Week = [[540, 1200], [540, 1200], [540, 1200], [540, 1200], [540, 1200], null, null, null]
const detail = (over: Partial<NonNullable<Rival['detail']>> = {}): NonNullable<Rival['detail']> => ({
  therapists: null,
  mri: null,
  ct: null,
  week: null,
  priced: false,
  eswt: null,
  manual: null,
  ...over,
})

// 범위 1km 안: 정형외과(20m, 같은 건물)·통증(450m)·신경외과(700m, 진료 시간 없음) = 처음 설정의 경쟁 셋 · 한의원(300m) · 내과(120m) / 범위 밖 피부과(1.2km)
const RIVALS: Rival[] = [
  {
    name: '예시정형외과의원',
    depts: ['ortho'],
    at: P,
    distM: 20,
    sameBuilding: true,
    address: '예시로 1',
    doctors: 2,
    openedYear: 2019,
    detail: detail({ mri: true, ct: false, week: ORTHO_WEEK, priced: true, eswt: 60000 }),
  },
  {
    name: '예시통증의학과의원',
    depts: ['pain'],
    at: P,
    distM: 450,
    sameBuilding: false,
    address: '',
    doctors: 1,
    openedYear: 2024,
    detail: detail({ therapists: 2, mri: false, ct: false, week: PAIN_WEEK, priced: true, eswt: 80000 }),
  },
  { name: '예시신경외과의원', depts: ['ns'], at: P, distM: 700, sameBuilding: false, address: '', doctors: 1, openedYear: 2018, detail: detail() },
  { name: '예시한의원', depts: ['korean'], at: P, distM: 300, sameBuilding: false, address: '', doctors: 1, openedYear: 2015 },
  { name: '예시내과의원', depts: ['im'], at: P, distM: 120, sameBuilding: false, address: '', doctors: 1, openedYear: 2020 },
  { name: '예시피부과의원', depts: ['derm'], at: P, distM: 1200, sameBuilding: false, address: '', doctors: 1, openedYear: 2021 },
]

const SNAP: Snapshot = {
  v: 1,
  at: '2026-11-15T01:00:00.000Z', // 한국 2026-11-15 10시
  radiusM: 1000,
  // 30,000명 · 60세 이상(6~10칸) 10,000명 · 40세 이상(4~10칸) 19,000명
  people: ok({ total: 30000, bands: [2000, 2500, 3000, 3500, 4500, 4500, 4000, 3000, 2000, 800, 200], households: 12000, unmatched: 0 }, 'pop-age', '2026-10-31'),
  trend: ok([{ ym: '2026-10', total: 30000 }, { ym: '2022-10', total: 29000 }, { ym: '2024-10', total: 29500 }], 'pop-age', '2026-10-31'),
  flow: { ok: false, why: 'outside', src: 'flow-volume' },
  income: ok({ sggName: '예시구', won: 45_000_000, year: 2024 }, 'income', '2025-12-31'),
  aptPrice: ok({ perM2: 8_000_000, deals: 12 }, 'apt-trade', '2026-10-31'),
  bizPrice: { ok: false, why: 'failed', src: 'biz-trade' },
  apts: ok([{ name: '예시아파트', households: 1200, builtYear: 2010, bdongName: '가람동' }], 'apt-list', '2026-11-15'),
  presale: ok(
    [
      { name: '예시파크', households: 640, moveIn: '2028-09' },
      { name: '예시힐', households: 1120, moveIn: '2027-03' },
    ],
    'presale',
    '2026-11-01',
  ),
  seniors: ok(12, 'senior', '2026-11-15'),
  gyms: ok(8, 'gym', '2026-11-15'),
  schools: ok(6, 'school', '2026-11-15'),
  accidents: ok({ spots: 2, cases: 9 }, 'accident', '2025-09-25'),
  industry: ok({ sggName: '예시구', employees: 3000, parks: 1, quarter: '2026-09' }, 'industry', '2026-09-30'),
  pharmacies: ok(1, 'stores', '2026-09-30'),
  rivals: ok(RIVALS, 'hosp-list', '2026-11-15'),
  place: ok({ sido: '11', sidoName: '서울특별시', sgg: '11000', sggName: '예시구', dong: '1100000001', dongName: '가람동' }, 'dongs', '2026-07-01'),
  sggAvg: { ok: false, why: 'failed', src: 'pop-age' },
  history: ok(
    [
      { kind: 'open', name: '예시재활의학과의원', dept: '재활의학과', on: '2025-03-02', distM: 600 },
      { kind: 'close', name: '예시▣▣의원', dept: '정형외과', on: '2024-03-31', distM: 10 },
      { kind: 'open', name: '예시가람내과의원', dept: '내과', on: '2024-06-01', distM: 300 },
    ],
    'clinic-license',
    '2026-11-20',
  ),
  // 이번에 못 받아 지난 값을 그대로 쓴다
  station: {
    ok: false,
    why: 'failed',
    src: 'rail-stations',
    prev: { v: { name: '예시역', line: '2호선', distM: 1400, at: P }, asOf: '2026-05-01' },
  },
  bus: ok(5, 'bus-stops', '2026-11-09'),
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
// 후보 매물 = 이 후보에 이어진 매물 가운데 마지막으로 고친 것
const LISTING = listingOf({})
const OLD_LISTING = listingOf({ id: 'L0', deposit: 70_000_000, rent: 4_000_000, updatedAt: '2026-11-01T01:00:00.000Z' })
// 38평 · 월세 330만 원 → 평당 86,842원 · 셋 평균은 (100,000 + 86,842 + 76,923) ÷ 3
const OTHER = listingOf({ id: 'L2', candidateId: null, title: '예시센터 5층', areaM2: 125.61, floorLabel: '5층', rent: 3_300_000, deposit: 50_000_000 })

const NOTES: LocationNote[] = [
  { id: 'n1', candidateId: CAND, day: '2026-11-14', body: '후보로 저장.', createdAt: '2026-11-14T01:00:00.000Z' },
  { id: 'n2', candidateId: CAND, day: '2026-11-20', body: '중개사와 통화. 무상 3개월 가능.', createdAt: '2026-11-20T01:00:00.000Z' },
  { id: 'n3', candidateId: CAND, day: '2026-11-18', body: '보러 감. 엘리베이터 넓음.', createdAt: '2026-11-18T01:00:00.000Z' },
  { id: 'n4', candidateId: 'other', day: '2026-11-21', body: '다른 후보 메모', createdAt: '2026-11-21T01:00:00.000Z' },
]

const copyRule = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule
const deptRuleOf = (rival: DeptRule['rival'], hide: DeptRule['hide'] = []): DeptRule => ({ v: 1, rival, hide })
const DEPT = (): DeptRule => structuredClone(DEFAULT_DEPT_RULE) as DeptRule

const baseProps = (over: Partial<OnePageReportProps> = {}): OnePageReportProps => ({
  candidate: CANDIDATE,
  letter: 'A',
  listings: [OLD_LISTING, LISTING, OTHER],
  notes: NOTES,
  rule: copyRule(),
  deptRule: DEPT(),
  homeEswt: 80000,
  today: TODAY,
  hospitalName: '샘플정형외과의원',
  onBack: () => {},
  ...over,
})

/** 부르는 쪽 없이 lib으로 같은 셈(점수 값·위험 신호) — 보고서가 같은 값을 그리는지 견준다 */
const factsOf = (p: OnePageReportProps) =>
  scoreFactsOf({ candidate: p.candidate, listings: p.listings, homeEswt: p.homeEswt, today: p.today, deptRule: p.deptRule })
const flagsOf = (p: OnePageReportProps) => pickFlags(flagInputOf({ candidate: p.candidate, listings: p.listings, today: p.today, deptRule: p.deptRule }))

const paper = () => screen.getByRole('article', { name: '한 장 보고서' })
const paper2 = () => screen.getByRole('article', { name: '이렇게 분석했어요' })
const region = (name: string) => within(paper()).getByRole('region', { name })
const region2 = (name: string) => within(paper2()).getByRole('region', { name })
/** 종이 머리(header)·맨 아래(footer) — 종이(article) 안이라 banner·contentinfo 역할이 없다 */
function part(tag: 'header' | 'footer', sheet: HTMLElement = paper()): HTMLElement {
  const el = sheet.querySelector<HTMLElement>(tag)
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
const labels = (area: HTMLElement) => [...area.querySelectorAll('dt')].map(text)
const classes = (el: Element) => el.className.split(/\s+/)
/** 둘째 장 표의 몸 줄: 칸 글 다섯씩 */
function basisRows(): string[][] {
  const table = within(region2(REPORT.tableTitle)).getByRole('table')
  const body = table.querySelector('tbody')
  if (!body) throw new Error('표 몸이 없어요')
  return [...body.querySelectorAll('tr')].map((tr) => [...tr.children].map(text))
}
const basisRow = (name: string) => {
  const row = basisRows().find((r) => r[0] === name)
  if (!row) throw new Error(`${name} 줄이 없어요`)
  return row
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
  it('AC-7914.2: 종이 머리에 보고서·후보 글자·진행 상태, 후보 이름·적은 주소, 뽑은 날·저장한 날·살필 범위·병원 이름이 있다', () => {
    render(<OnePageReport {...baseProps()} />)
    const head = part('header')
    expect(text(head)).toContain('입지 분석 보고서 · 후보 A · 보러 감')
    expect(within(head).getByRole('heading', { name: '예시빌딩 3층' })).toBeTruthy()
    expect(text(head)).toContain('가람동 12-3')
    expect(text(head)).toContain('2026년 11월 22일 뽑음 · 자료는 2026년 11월 15일(저장한 날) 값 · 살필 범위 1km · 샘플정형외과의원')
  })

  it('AC-7914.2: 병원 이름이 비면 그 조각을, 그날 값이 없으면 저장한 날 조각을, 글자가 비면 후보 글자 조각을 뺀다', () => {
    render(<OnePageReport {...baseProps({ letter: '', hospitalName: '  ', candidate: { ...CANDIDATE, snapshot: null, snapshotAt: null } })} />)
    const head = text(part('header'))
    expect(head).toContain('입지 분석 보고서 · 보러 감')
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

  it('AC-7914.2: 빈 층은 빈 칸 짐작 묶음과 같은 셈 — 주차장만 있는 층과 층 모름은 짐작하지 않고, 건물에 없는 층의 가게는 세지 않는다', () => {
    const building = SNAP.building.ok ? SNAP.building.v : null
    if (!building) throw new Error('건물 값이 없어요')
    const snapshot: Snapshot = {
      ...SNAP,
      // 1층 = 주차장 + 소매점(짐작함) · 층 모름 줄은 짐작하지 않음 · 5층 가게는 건물에 없는 층 → 1·2·3·4층 가운데 가게 없는 층 = 2·4층
      building: ok({ ...building, floors: [...building.floors, { label: '1', usage: '주차장', m2: 50 }, { label: '층 모름', usage: '창고', m2: 10 }] }, 'building', '2026-11-15'),
      stores: ok([{ floor: '1', count: 2 }, { floor: '3', count: 1 }, { floor: '5', count: 4 }], 'stores', '2026-09-30'),
    }
    render(<OnePageReport {...baseProps({ candidate: { ...CANDIDATE, snapshot } })} />)
    expect(dd(region('자리·교통'), '빈 층')).toBe('2개 층(짐작)')
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
    expect(dd(region('경쟁'), '경쟁 의원(정형외과·신경외과·마취통증·재활)')).toBe("공공데이터포털에서 '병원정보서비스' 활용신청을 하면 보여요.")
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
    expect(labels(memo)).toEqual(['2026년 11월 20일', '2026년 11월 18일'])
    expect(dd(memo, '2026년 11월 20일')).toBe('중개사와 통화. 무상 3개월 가능.')
    expect(text(memo)).not.toContain('다른 후보 메모')
  })
})

describe('AC-7914.2: A4 한 장 — 경쟁 줄은 고른 과목(과목 고르기 설정)', () => {
  it('AC-7914.2: 처음 설정 — `경쟁 의원(정형외과·신경외과·마취통증·재활)` 범위 안 수와 1곳당 사는 사람, `한의원(따로)`, 3년 개폐업(경쟁 과목만), 진료 시간 빈틈, 체외충격파 평균', () => {
    render(<OnePageReport {...baseProps()} />)
    const r = region('경쟁')
    expect(labels(r)).toEqual(['경쟁 의원(정형외과·신경외과·마취통증·재활)', '한의원(따로)', '3년 개폐업', '진료 시간 빈틈', '체외충격파 평균'])
    // 범위 안 경쟁 셋(정형외과·통증·신경외과) — 내과·범위 밖 피부과·한의원은 세지 않는다
    expect(dd(r, '경쟁 의원(정형외과·신경외과·마취통증·재활)')).toBe('3곳 · 1곳당 10,000명')
    expect(dd(r, '한의원(따로)')).toBe('1곳')
    // 내과 개업은 경쟁 과목이 아니라 빠진다
    expect(dd(r, '3년 개폐업')).toBe('문 엶 1 · 문 닫음 1')
    // 진료 시간을 아는 경쟁 의원 둘(정형외과·통증)로 센 빈틈
    expect(dd(r, '진료 시간 빈틈')).toBe('평일 아침 8~9시, 평일 밤 20~21시, 토요일 오후, 일요일')
    // 비급여를 받은 경쟁 의원(60,000·80,000원) 평균 — 원 칸이라 wonText
    expect(dd(r, '체외충격파 평균')).toBe('70,000원 (지금 의원 80,000원)')
  })

  it('AC-7914.2: 한의원을 경쟁 의원으로 고르면 `한의원(따로)` 줄이 없고 경쟁 수·짧은 이름에 같이 든다', () => {
    render(<OnePageReport {...baseProps({ deptRule: deptRuleOf(['ortho', 'ns', 'pain', 'rehab', 'korean']) })} />)
    const r = region('경쟁')
    expect(labels(r)).not.toContain('한의원(따로)')
    expect(dd(r, '경쟁 의원(정형외과·신경외과·마취통증·재활·한의원)')).toBe('4곳 · 1곳당 7,500명')
  })

  it('AC-7914.2: 한의원을 안 보기로 고르면 `한의원(따로)` 줄도 없다', () => {
    render(<OnePageReport {...baseProps({ deptRule: deptRuleOf(['ortho', 'ns', 'pain', 'rehab'], ['korean']) })} />)
    expect(labels(region('경쟁'))).not.toContain('한의원(따로)')
  })

  it('AC-7914.2: 경쟁 과목을 줄이면 다시 부르지 않고 수·3년 개폐업·빈틈·체외충격파가 그 과목만으로 바로 바뀐다', () => {
    const { rerender } = render(<OnePageReport {...baseProps()} />)
    rerender(<OnePageReport {...baseProps({ deptRule: deptRuleOf(['ortho']) })} />)
    const r = region('경쟁')
    expect(dd(r, '경쟁 의원(정형외과)')).toBe('1곳 · 1곳당 30,000명')
    // 재활 개업은 이제 경쟁 과목이 아니다(정형외과 폐업만)
    expect(dd(r, '3년 개폐업')).toBe('문 엶 0 · 문 닫음 1')
    // 통증(평일 20시까지)이 빠져 저녁 18~21시가 빈다
    expect(dd(r, '진료 시간 빈틈')).toBe('평일 아침 8~9시, 평일 저녁 19~20시, 평일 밤 20~21시, 토요일 오후, 일요일')
    expect(dd(r, '체외충격파 평균')).toBe('60,000원 (지금 의원 80,000원)')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('AC-7914.2: 3년 개폐업은 그 줄의 업태(type)로 치과의원·한의원을 가른다 — 업태 칸이 없는 옛 줄은 과목 글로 센다', () => {
    // 외과까지 경쟁: 업태가 없으면 '구강악안면외과'는 외과, '한방재활의학과'는 재활로 센다
    const history = ok<SnapshotValue<'history'>>(
      [
        { kind: 'open', name: '예시튼튼한의원', dept: '한방재활의학과', type: '한의원', on: '2026-01-05', distM: 200 },
        { kind: 'close', name: '예시미소치과의원', dept: '구강악안면외과', type: '치과의원', on: '2025-09-01', distM: 300 },
        { kind: 'open', name: '예시바른정형외과의원', dept: '정형외과', type: '의원', on: '2025-06-01', distM: 350 },
        { kind: 'open', name: '예시옛한의원', dept: '한방재활의학과', on: '2025-03-01', distM: 400 },
      ],
      'clinic-license',
      '2026-11-20',
    )
    const candidate: Candidate = { ...CANDIDATE, snapshot: { ...SNAP, history } }
    render(<OnePageReport {...baseProps({ candidate, deptRule: deptRuleOf(['gs', 'ortho', 'ns', 'pain', 'rehab']) })} />)
    expect(dd(region('경쟁'), '3년 개폐업')).toBe('문 엶 2 · 문 닫음 0')
  })

  it('AC-7914.2: 경쟁 과목이 하나도 없으면 `경쟁 의원(고른 과목 없음)`이고 경쟁 칸은 `–`, 빈틈은 과목을 고르라는 글이다', () => {
    render(<OnePageReport {...baseProps({ deptRule: deptRuleOf([]) })} />)
    const r = region('경쟁')
    expect(dd(r, '경쟁 의원(고른 과목 없음)')).toBe('–')
    expect(dd(r, '한의원(따로)')).toBe('1곳')
    expect(dd(r, '3년 개폐업')).toBe('–')
    expect(dd(r, '진료 시간 빈틈')).toBe('경쟁 의원 과목을 고르면 보여요.')
    expect(dd(r, '체외충격파 평균')).toBe('–')
  })

  it('AC-7914.2: 경쟁 의원 진료 시간을 하나도 모르면 빈틈은 `–`(말하지 않음)', () => {
    render(<OnePageReport {...baseProps({ deptRule: deptRuleOf(['ns']) })} />)
    expect(dd(region('경쟁'), '진료 시간 빈틈')).toBe('–')
  })
})

describe('AC-7914.2: A4 한 장 — 점수', () => {
  it('AC-7914.2: 종합 점수는 lib facts.ts scoreFactsOf(과목 설정 포함)로 받은 설정에 매긴 scoreItems 종합이고 / 100점이다', () => {
    const props = baseProps()
    render(<OnePageReport {...props} />)
    const result = scoreItems(factsOf(props), props.rule, 'candidate')
    expect(result.total).not.toBeNull()
    const box = within(paper()).getByRole('group', { name: '종합 점수' })
    expect(text(box)).toBe(`종합 점수${result.total}/ 100점`)
  })

  it('AC-7914.2: 항목 다섯은 SCORE_GROUPS 차례로 `{보탠 점수}/{만점}`이다', () => {
    const props = baseProps()
    render(<OnePageReport {...props} />)
    const result = scoreItems(factsOf(props), props.rule, 'candidate')
    const sum = result.groups.reduce((s, g) => (g.score === null ? s : s + props.rule.weights[g.id]), 0)
    const items = within(within(paper()).getByRole('list', { name: '항목 점수' })).getAllByRole('listitem')
    expect(items.map(text)).toEqual(
      SCORE_GROUPS.map((g) => {
        const got = result.groups.find((x) => x.id === g.id)!
        return `${g.name}${got.points}/${Math.floor((props.rule.weights[g.id] * 100) / sum)}`
      }),
    )
  })

  it('AC-7914.2: 설정(무게)을 바꿔 다시 그리면 종합 점수가 바로 다시 매겨진다', () => {
    const { rerender } = render(<OnePageReport {...baseProps()} />)
    const before = text(within(paper()).getByRole('group', { name: '종합 점수' }))
    const rule = copyRule()
    rule.weights = { people: 0, rivals: 0, transit: 100, site: 0, cost: 0 }
    const props = baseProps({ rule })
    rerender(<OnePageReport {...props} />)
    const after = scoreItems(factsOf(props), rule, 'candidate').total
    expect(text(within(paper()).getByRole('group', { name: '종합 점수' }))).toBe(`종합 점수${after}/ 100점`)
    expect(text(within(paper()).getByRole('group', { name: '종합 점수' }))).not.toBe(before)
  })

  it('AC-7914.2: 과목 고르기를 바꿔 다시 그리면 경쟁 점수·종합이 그 설정으로 다시 매겨진다', () => {
    const { rerender } = render(<OnePageReport {...baseProps()} />)
    const props = baseProps({ deptRule: deptRuleOf(['ortho', 'ns', 'pain', 'rehab', 'korean', 'im']) })
    rerender(<OnePageReport {...props} />)
    const result = scoreItems(factsOf(props), props.rule, 'candidate')
    expect(factsOf(props).rivals).toBe(5)
    expect(text(within(paper()).getByRole('group', { name: '종합 점수' }))).toBe(`종합 점수${result.total}/ 100점`)
  })

  it('AC-7914.2: 경쟁 과목이 0개면 경쟁 항목은 `과목 없음`으로 빠진다', () => {
    render(<OnePageReport {...baseProps({ deptRule: deptRuleOf([]) })} />)
    const items = within(within(paper()).getByRole('list', { name: '항목 점수' })).getAllByRole('listitem')
    expect(text(items[1])).toBe('경쟁과목 없음')
  })

  it('AC-7914.2: 값이 하나도 없으면 `점수 없음`, 항목은 `값 없음`(매물이 없는 비용은 `매물 없음`)', () => {
    const bare: Candidate = { ...CANDIDATE, snapshot: null, snapshotAt: null, floorLabel: '', signVisible: null, violation: null }
    render(<OnePageReport {...baseProps({ candidate: bare, listings: [], homeEswt: null })} />)
    expect(text(within(paper()).getByRole('group', { name: '종합 점수' }))).toBe('종합 점수점수 없음')
    const items = within(within(paper()).getByRole('list', { name: '항목 점수' })).getAllByRole('listitem')
    expect(items.map(text)).toEqual(['사는 사람·수요값 없음', '경쟁값 없음', '교통·흐름값 없음', '자리값 없음', '비용매물 없음'])
  })
})

describe('AC-7914.2: A4 한 장 — 위험 신호', () => {
  it('AC-7914.2: 위험 신호는 flagInputOf(과목 설정 포함) → pickFlags 차례·글 그대로이고, 확인 필요는 `{제목} (확인 필요) — {설명}`이다', () => {
    const props = baseProps()
    render(<OnePageReport {...props} />)
    const flags = flagsOf(props)
    expect(flags.map((f) => f.id)).toEqual(['violation-check', 'same-building', 'closed-here', 'far-station'])
    const area = region(`위험 신호 ${flags.length}개`)
    const lines = within(area).getAllByRole('listitem').map(text)
    expect(lines).toEqual(flags.map((f) => `${f.title}${f.level === 'check' ? ' (확인 필요)' : ''} — ${f.detail}`))
    expect(lines[0]).toBe(
      '위반 건축물인지 (확인 필요) — 건축물대장을 떼어 확인하세요. 위반 건축물이면 의원 개설 신고가 막힐 수 있어요. 확인한 뒤 건물 서류에서 골라요(아직 안 고름).',
    )
    expect(lines[2]).toBe('이 자리(3층)에서 2024년 3월에 의원이 문을 닫았어요 — 예시▣▣의원 · 왜 닫았는지 중개사에게 물어봐요.')
  })

  it('AC-7914.2: 같은 건물 정형외과를 경쟁에서 빼면 `30m 안에 …` 신호가 빠진다(위험 신호도 과목 설정을 따름)', () => {
    const props = baseProps({ deptRule: deptRuleOf(['pain']) })
    render(<OnePageReport {...props} />)
    const flags = flagsOf(props)
    expect(flags.map((f) => f.id)).not.toContain('same-building')
    const area = region(`위험 신호 ${flags.length}개`)
    expect(text(area)).not.toContain('30m 안에')
  })

  it('AC-7914.2: 위반 건축물을 `없음`으로 고르면 그 신호가 빠지고 수가 줄어든다', () => {
    render(<OnePageReport {...baseProps({ candidate: { ...CANDIDATE, violation: 'no' } })} />)
    const area = region('위험 신호 3개')
    expect(text(area)).not.toContain('위반 건축물')
  })
})

describe('AC-7905.7: A4 한 장 — 비용(만 원 칸 금액은 manText)', () => {
  it('AC-7905.7: 매물·비용 묶음 — 층·전용(평과 ㎡)·보증금/월세·관리비·권리금(manText)·평당 월세(wonText)·처음에 드는 돈(manText)·손익분기·중개사', () => {
    render(<OnePageReport {...baseProps()} />)
    const r = region('매물·비용')
    const sum = calcCosts(checkCosts(CANDIDATE.costs), CANDIDATE.areaM2)
    expect(sum.startTotal).toBe(533_880_000)
    expect(dd(r, '층 · 전용')).toBe('3층 · 52평 (171.9㎡)')
    // 후보에 이어진 매물 둘 가운데 마지막으로 고친 것(L1)
    expect(dd(r, '보증금 / 월세')).toBe('1억 원 / 520만 원')
    expect(dd(r, '관리비 · 권리금')).toBe('78만 원 · 없음')
    expect(dd(r, '평당 월세')).toBe('100,000원 (저장한 매물 평균 87,921원)')
    expect(dd(r, '처음에 드는 돈')).toBe(manText(533_880_000))
    expect(dd(r, '처음에 드는 돈')).toBe('5억 3,388만 원')
    expect(dd(r, '손익분기')).toBe('하루 26.8명')
    expect(dd(r, '중개사')).toBe('예시부동산 김예시 010-0000-0011')
  })

  it('AC-7905.7: 만 원으로 안 나눠지는 값은 wonText 그대로, 값이 없으면 `–`', () => {
    const listing = listingOf({ deposit: null, rent: 5_200_000, mgmt: 112_500, premium: 25_000_000 })
    render(<OnePageReport {...baseProps({ listings: [listing] })} />)
    const r = region('매물·비용')
    expect(dd(r, '보증금 / 월세')).toBe('– / 520만 원')
    expect(dd(r, '관리비 · 권리금')).toBe('112,500원 · 2,500만 원')
  })

  it('AC-7914.2: 매물이 없고 비용 칸이 비면 그 값은 `–`이고, 매물 하나뿐이면 평균을 붙이지 않는다', () => {
    render(<OnePageReport {...baseProps({ listings: [], candidate: { ...CANDIDATE, costs: {} } })} />)
    const r = region('매물·비용')
    expect(dd(r, '층 · 전용')).toBe('3층 · 52평 (171.9㎡)')
    for (const label of ['보증금 / 월세', '관리비 · 권리금', '평당 월세', '처음에 드는 돈', '손익분기', '중개사']) expect(dd(r, label), label).toBe('–')
    cleanup()
    render(<OnePageReport {...baseProps({ listings: [LISTING] })} />)
    expect(dd(region('매물·비용'), '평당 월세')).toBe('100,000원')
  })
})

describe('AC-7914.2: A4 한 장 — 출처 기준 날짜 · 첫 장 끝 문장 · 예상 환자 줄 없음', () => {
  const END = '. 숫자는 저장한 날 값이고 버림으로 적었어요. 어떻게 분석했는지는 둘째 장에 있어요.'

  it('AC-7920.5: 맨 아래 출처 줄은 값이 있는 그날 값마다 `{기관} {자료} · 기준 {날짜}`(지난 값은 그 날짜)이고 내가 적은 값으로 끝나며, 끝 문장에 `어떻게 분석했는지는 둘째 장에 있어요.`가 붙는다', () => {
    render(<OnePageReport {...baseProps()} />)
    const foot = text(part('footer'))
    expect(foot.startsWith('출처: ')).toBe(true)
    expect(foot.endsWith(END)).toBe(true)
    expect(foot.endsWith(REPORT.firstPageEnd)).toBe(true)
    const parts = foot.slice('출처: '.length, -END.length).split(' / ')
    expect(parts).toContain(sourceText('pop-age', '2026-10-31'))
    expect(parts).toContain(sourceText('rail-stations', '2026-05-01'))
    expect(parts).toContain(sourceText('hosp-list', '2026-11-15'))
    expect(parts).toContain(sourceText('building', '2026-11-15'))
    expect(parts.at(-1)).toBe(sourceText('user'))
    // 같은 줄은 한 번만(사는 사람·4년 추세는 같은 출처·같은 날짜)
    expect(parts.filter((p) => p === sourceText('pop-age', '2026-10-31'))).toHaveLength(1)
    // 받지 못하고 지난 값도 없는 자료는 적지 않는다
    for (const id of ['biz-trade', 'market', 'welfare', 'flow-volume']) expect(parts.some((p) => p.startsWith(sourceText(id)!)), id).toBe(false)
  })

  it('AC-7914.2: 예상 환자 줄이 없다(손익분기만 있다)', () => {
    render(<OnePageReport {...baseProps()} />)
    for (const sheet of [paper(), paper2()]) {
      expect(text(sheet)).not.toContain('예상')
      expect(text(sheet)).not.toContain('하루 평균 환자')
    }
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

describe("AC-7920.5: 둘째 장 '이렇게 분석했어요'", () => {
  it('AC-7920.5: 첫 장 바로 뒤에 둘째 장 종이가 있다', () => {
    render(<OnePageReport {...baseProps()} />)
    const first = paper()
    const second = paper2()
    expect(first.nextElementSibling).toBe(second)
  })

  it("AC-7920.5: 머리 — `입지 분석 보고서 · 둘째 장 · 후보 {글자} {이름}` · 제목 `이렇게 분석했어요` · `자료는 {저장한 날}(저장한 날) 값 · 살필 범위 {범위} · …`", () => {
    render(<OnePageReport {...baseProps()} />)
    const head = part('header', paper2())
    expect(text(head.querySelector('p'))).toBe('입지 분석 보고서 · 둘째 장 · 후보 A 예시빌딩 3층')
    expect(within(head).getByRole('heading', { name: REPORT.head.title }).textContent).toBe('이렇게 분석했어요')
    expect(text(head)).toContain("자료는 2026년 11월 15일(저장한 날) 값 · 살필 범위 1km · 기관 자료 이름과 이용 조건은 앱의 '근거와 출처'에 모두 있어요")
  })

  it('AC-7920.5: 그날 값이 없으면 머리에서 저장한 날 조각을 뺀다', () => {
    render(<OnePageReport {...baseProps({ candidate: { ...CANDIDATE, snapshot: null, snapshotAt: null } })} />)
    const head = text(part('header', paper2()))
    expect(head).not.toContain('자료는')
    expect(head).toContain("살필 범위 1km · 기관 자료 이름과 이용 조건은 앱의 '근거와 출처'에 모두 있어요")
  })

  it('AC-7920.5: 점수 매기는 법 세 줄 — 다섯 항목(지금 무게 + `(무게는 내가 정해요)`)·매기는 법·근거(REPORT 글 그대로)', () => {
    const props = baseProps()
    render(<OnePageReport {...props} />)
    const r = region2(REPORT.scoringTitle)
    expect(labels(r)).toEqual(['다섯 항목', '매기는 법', '근거'])
    expect(dd(r, '다섯 항목')).toBe(`${weightsText(props.rule.weights)} (무게는 내가 정해요)`)
    expect(dd(r, '매기는 법')).toBe(REPORT.scoring[1].text)
    expect(dd(r, '근거')).toBe(REPORT.scoring[2].text)
    expect(dd(r, '근거')).toContain('이선경 외, 가정의학회지 2009')
  })

  it('AC-7920.5: 점수 매기는 법의 무게는 지금 설정 — 무게를 바꾸면 바로 그 숫자다', () => {
    const rule = copyRule()
    rule.weights = { people: 40, rivals: 20, transit: 20, site: 10, cost: 10 }
    render(<OnePageReport {...baseProps({ rule })} />)
    expect(dd(region2(REPORT.scoringTitle), '다섯 항목')).toBe('사는 사람·수요 40 · 경쟁 20 · 교통·흐름 20 · 자리 10 · 비용 10 (무게는 내가 정해요)')
  })

  it('AC-7920.5: 묶음마다 본 자료 표 — 칸 이름 다섯과 묶음 열셋 + 매물·비용 열넷 줄(REPORT 차례)', () => {
    render(<OnePageReport {...baseProps()} />)
    const table = within(region2(REPORT.tableTitle)).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map(text)).toEqual(['묶음', '자료(기관)', '기준 날짜', '방법 한 줄', '못 본 것'])
    const rows = basisRows()
    expect(rows).toHaveLength(14)
    expect(rows.map((r) => r[0])).toEqual([
      '사는 사람',
      '소득·쓸 힘',
      '정형외과 수요',
      '경쟁 의원',
      '둘레 다른 과 의원',
      '경쟁 의원 진료비',
      '진료 시간 빈틈',
      '교통·둘레 시설',
      '거리 사진',
      '건물 서류',
      '빈 칸 짐작',
      '땅 쓰임·계획',
      '앞으로 바뀔 것',
      '매물·비용',
    ])
    expect(rows.map((r) => r[0])).toEqual(REPORT.rows.map((r) => r.name))
    expect(basisRow('사는 사람')).toEqual([
      '사는 사람',
      '행정안전부 · 국가데이터처 · 국토교통부 · 한국부동산원',
      '2026년 10월 31일',
      '범위에 걸친 동을 겹친 넓이만큼 나눠 더한 어림',
      '1인 세대 수 · 2022년 10월 전 나이대',
    ])
    expect(basisRow('매물·비용')).toEqual([
      '매물·비용',
      '내가 붙여 넣은 매물 · 내가 적은 값',
      '적은 날',
      '평당 월세 = 월세 ÷ 전용 평수, 저장한 매물끼리 견줌',
      '실제 임대료 시세(매물 사이트를 저절로 가져오지 않음)',
    ])
  })

  it('AC-7920.5: 기준 날짜 칸은 그 후보 그날 값의 출처별 기준 날짜(같은 묶음에 여럿이면 ` · `, 지난 값은 그 날짜, 못 받은 것은 뺌)', () => {
    render(<OnePageReport {...baseProps()} />)
    const dates = Object.fromEntries(basisRows().map((r) => [r[0], r[2]]))
    expect(dates).toEqual({
      '사는 사람': '2026년 10월 31일',
      '소득·쓸 힘': '2025년 12월 31일 · 2026년 10월 31일',
      '정형외과 수요': '2025년 9월 25일 · 2026년 9월 30일',
      '경쟁 의원': '2026년 11월 15일 · 2026년 11월 20일',
      '둘레 다른 과 의원': '2026년 11월 15일',
      // 진료비·진료 시간은 의원 목록(rivals) 칸 안에 담겨 그 칸의 기준 날짜다
      '경쟁 의원 진료비': '2026년 11월 15일',
      '진료 시간 빈틈': '2026년 11월 15일',
      // 사람 흐름은 이 지역 자료가 없어 정류장 날짜만
      '교통·둘레 시설': '2026년 11월 9일',
      '거리 사진': '열 때마다',
      '건물 서류': '2026년 11월 15일',
      '빈 칸 짐작': '2026년 9월 30일',
      '땅 쓰임·계획': '링크만',
      '앞으로 바뀔 것': '2026년 11월 1일',
      '매물·비용': '적은 날',
    })
  })

  it('AC-7920.5: 의료급여·차상위를 받았으면 소득·쓸 힘 기준 날짜 칸 끝에 그 기준 날짜(welfare 칸)가 붙는다', () => {
    const welfare = ok(
      { sggName: '예시구', ym: '2025-12', medical: 9000, basic: 12000, nearPoor: 4000, population: 400000, basis: null },
      'welfare',
      '2025-12-01',
    )
    render(<OnePageReport {...baseProps({ candidate: { ...CANDIDATE, snapshot: { ...SNAP, welfare } } })} />)
    expect(basisRow('소득·쓸 힘')[2]).toBe('2025년 12월 31일 · 2026년 10월 31일 · 2025년 12월 1일')
  })

  it('AC-7920.5: 그날 값이 없으면 출처 날짜 칸은 `–`이고 글로 정한 칸(열 때마다·링크만·적은 날)은 그대로다', () => {
    render(<OnePageReport {...baseProps({ candidate: { ...CANDIDATE, snapshot: null, snapshotAt: null } })} />)
    const dates = basisRows().map((r) => r[2])
    expect(dates).toEqual(['–', '–', '–', '–', '–', '–', '–', '–', '열 때마다', '–', '–', '링크만', '–', '적은 날'])
  })

  it('AC-7920.5: 경쟁 의원 줄의 방법 한 줄은 `{경쟁}` = 고른 과목 짧은 이름이고, 과목을 바꾸면 바로 바뀐다', () => {
    const { rerender } = render(<OnePageReport {...baseProps()} />)
    expect(basisRow('경쟁 의원')[3]).toBe('범위 안 경쟁 의원(정형외과·신경외과·마취통증·재활) 수, 1곳당 사는 사람, 3년 개폐업')
    rerender(<OnePageReport {...baseProps({ deptRule: deptRuleOf(['ortho', 'korean']) })} />)
    expect(basisRow('경쟁 의원')[3]).toBe('범위 안 경쟁 의원(정형외과·한의원) 수, 1곳당 사는 사람, 3년 개폐업')
    rerender(<OnePageReport {...baseProps({ deptRule: deptRuleOf([]) })} />)
    expect(basisRow('경쟁 의원')[3]).toBe('범위 안 경쟁 의원(고른 과목 없음) 수, 1곳당 사는 사람, 3년 개폐업')
  })

  it('AC-7920.5: 표 아래 늘 못 보는 셋(걷는 사람 수 · 위반 건축물 · 실제 임대료) 한 줄', () => {
    render(<OnePageReport {...baseProps()} />)
    const foot = text(part('footer', paper2()))
    expect(foot).toBe(REPORT.always)
    expect(foot).toContain('걷는 사람 수')
    expect(foot).toContain('위반 건축물')
    expect(foot).toContain('실제 임대료')
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

  it("AC-7920.5: 도구 줄 도움말이 `A4 한 장 + 둘째 장 '이렇게 분석했어요' · 인쇄하면 앱 틀은 빠지고 종이만 나와요`이고 [후보 {글자}로 돌아가기]를 누르면 돌아가기 콜백", () => {
    const onBack = vi.fn()
    render(<OnePageReport {...baseProps({ onBack })} />)
    const tools = screen.getByRole('group', { name: '보고서 도구' })
    expect(text(tools)).toContain("A4 한 장 + 둘째 장 '이렇게 분석했어요' · 인쇄하면 앱 틀은 빠지고 종이만 나와요")
    fireEvent.click(within(tools).getByRole('button', { name: '후보 A로 돌아가기' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(printSpy).not.toHaveBeenCalled()
  })

  it('AC-7914.2: 돌아가기 단추는 시안대로 `후보 {글자}로 돌아가기`, 후보 글자가 없으면 `후보로 돌아가기`', () => {
    const { unmount } = render(<OnePageReport {...baseProps({ letter: 'B' })} />)
    expect(within(screen.getByRole('group', { name: '보고서 도구' })).getAllByRole('button')[0]!.textContent).toBe('후보 B로 돌아가기')
    unmount()
    render(<OnePageReport {...baseProps({ letter: '' })} />)
    expect(within(screen.getByRole('group', { name: '보고서 도구' })).getAllByRole('button')[0]!.textContent).toBe('후보로 돌아가기')
  })
})

describe('AC-7914.2: 인쇄에서 앱 틀은 빠지고 종이 두 장만 A4로', () => {
  it('AC-7914.2: 도구 줄·안내 줄은 print:hidden이고, 두 종이와 그 감싸개는 숨지 않고 인쇄 때 여백·테두리·바탕을 뺀다', () => {
    render(<OnePageReport {...baseProps()} />)
    expect(screen.getByRole('group', { name: '보고서 도구' }).className).toContain('print:hidden')
    expect(screen.getByRole('status').className).toContain('print:hidden')
    for (const sheet of [paper(), paper2()]) {
      expect(classes(sheet)).toEqual(expect.arrayContaining(['w-[210mm]', 'print:w-auto', 'print:border-0', 'print:p-0']))
      for (let el: HTMLElement | null = sheet; el && el !== document.body; el = el.parentElement) {
        expect(classes(el), el.tagName).not.toContain('print:hidden')
      }
    }
    const wrap = paper().parentElement as HTMLElement
    expect(paper2().parentElement).toBe(wrap)
    expect(classes(wrap)).toEqual(expect.arrayContaining(['print:m-0', 'print:p-0', 'print:bg-transparent']))
  })

  it('AC-7914.2: 둘째 장은 인쇄하면 새 쪽에서 시작하고(break-before: page) 화면에서는 첫 장과 24px 띄운다', () => {
    render(<OnePageReport {...baseProps()} />)
    expect(classes(paper2())).toEqual(expect.arrayContaining(['print:break-before-page', 'mt-6', 'print:mt-0']))
    expect(classes(paper())).not.toContain('print:break-before-page')
  })

  it('AC-7914.2: 두 장 모두 A4 한 쪽 안에 들게 인쇄 때 92%로 줄인다', () => {
    render(<OnePageReport {...baseProps()} />)
    for (const sheet of [paper(), paper2()]) expect(classes(sheet)).toContain('print:[zoom:0.92]')
  })

  it('AC-7914.2: 이 화면이 붙어 있을 때만 인쇄 종이를 A4 세로로 정한다(@page)', () => {
    const { container } = render(<OnePageReport {...baseProps()} />)
    const style = container.querySelector('style')
    expect(text(style)).toMatch(/@media print\s*\{\s*@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*12mm\s*\}\s*\}/)
  })

  it('AC-7914.2: 화면에 보고서 저장·서버로 보내기 단추가 없다([후보 {글자}로 돌아가기]·[PDF로 저장]·[인쇄] 셋뿐)', () => {
    render(<OnePageReport {...baseProps()} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['후보 A로 돌아가기', 'PDF로 저장', '인쇄'])
    expect(screen.queryAllByRole('link')).toEqual([])
  })
})
