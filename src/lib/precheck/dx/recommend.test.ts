import { describe, expect, it } from 'vitest'
import type { DxLine, DxLink, DxTrend, RxLine, Visit } from '@/types/precheck'
import {
  EX_SHARE,
  LIFT,
  TOP,
  dxContext,
  dxIssues,
  missingDx,
  needsCheck,
  packDxLinks,
  readDxLinks,
  recommendDx,
  rulesFor,
  visitDxView,
} from './recommend'

// 추천 상병·상병 확인 단위 시험(REQ-011). 사례는 원본 tests/test_claim_dx_recommend.py의 가짜 사례를 옮겼다.
// 원본과 결과를 나란히 견주는 것은 golden.test.ts

const HA = '아라간플러스주(히알루론산나트륨)(프리필드시린지)_(20mg/2mL)'

const rx = (code: string, name = '', benefit = true): RxLine => ({ code, name, qty: 1, benefit, pay: benefit ? '급여' : '비급여' })
const dx = (c: string, m: DxLine['m'], n = `합성 ${c}`): DxLine => ({ c, n, m, s: '', d: '05', t: '' })
const visitOf = (rxLines: RxLine[], dxLines: DxLine[]): Visit => ({
  key: '900001',
  chart: '900777',
  date: '2026-10-01',
  month: '2026-10',
  name: '가상환자77',
  lines: ['S) pain'],
  hints: [null],
  rx: rxLines,
  dx: dxLines,
  memosInBit: [],
})

type TrendRow = [c: string, nm: string, m: number, s: number, x: number, l?: number]
const trendOf = (entries: [code: string, n: number, rows: TrendRow[]][]): DxTrend => ({
  from: '2025-10-19',
  to: '2026-10-18',
  visits: 1000,
  codes: new Map(entries.map(([code, n, rows]) => [code, { n, d: rows.map(([c, nm, m, s, x, l = null]) => ({ c, nm, m, s, x, l })) }])),
  suggestions: [],
})

type Options = { trend?: DxTrend | null; links?: DxLink[]; visits?: Visit[]; hasDx?: boolean; hasMemo?: (visit: Visit) => boolean }
const ctxOf = ({ trend = null, links = [], visits = [], hasDx = true, hasMemo }: Options = {}) =>
  dxContext({ trend, links, visits, hasDx, hasMemo })

const A49_TREND = trendOf([
  ['A49', 200, [['M1700', '양쪽 원발성 무릎관절증', 50, 10, 0], ['M2556', '관절통/ 아래다리', 5, 20, 0], ['M750', '유착성', 2, 2, 0]]],
])

describe('AC-011.1 recommendDx: 원본 recommend와 같은 {visits, list}', () => {
  it('AC-011.1: 상수는 원본 값 그대로다', () => {
    expect([TOP, LIFT, EX_SHARE]).toEqual([3, 150, 700])
  })

  it('AC-011.1: 고시 — 히알루론산 이름이면 M17·M750, 점안액은 아니다. MM410은 M750', () => {
    const ctx = ctxOf()
    expect(rulesFor('A49', HA, ctx).map((r) => r.dx)).toEqual(['M17', 'M750'])
    expect(rulesFor('Z1', '히알루론산나트륨 점안액', ctx)).toEqual([])
    expect(rulesFor('MM410', '', ctx).map((r) => r.dx)).toEqual(['M750'])
  })

  it('AC-011.1: 고시 → 우리 병원 경향(많이 쓴 순). 내원 수·비율·이름이 원본과 같다', () => {
    const rec = recommendDx('a49', HA, ctxOf({ trend: A49_TREND }))
    expect(rec.visits).toBe(200)
    expect(rec.list.map((r) => r.dx)).toEqual(['M17', 'M750', 'M1700', 'M2556'])
    expect(rec.list[1].t).toEqual({ n: 4, m: 2, s: 2, x: 0, share: 0.02, common: false })
    expect(rec.list[2].t?.share).toBe(0.3)
    expect(rec.list[0].src).toEqual(['gosi'])
    expect(rec.list[0].basis).toMatch(/고시 제2020-79호/)
    expect(rec.list[2].nm).toBe('양쪽 원발성 무릎관절증')
    expect(rec.list[2].src).toEqual([])
  })

  it('AC-011.1: LIFT 미만은 흔한 상병이라 맨 뒤로. 150은 아니고 배수가 없어도 아니다', () => {
    const trend = trendOf([
      ['AB17', 100, [['K219', '식도역류', 40, 10, 0, 149], ['M1990', '관절증', 20, 5, 0, 400], ['M2000', '경계', 1, 0, 0, 150], ['M3000', '배수 없음', 1, 0, 0]]],
    ])
    const { list } = recommendDx('AB17', '', ctxOf({ trend }))
    expect(list.map((r) => [r.dx, r.t?.common])).toEqual([
      ['M1990', false],
      ['M2000', false],
      ['M3000', false],
      ['K219', true],
    ])
  })

  it('AC-011.1: 상병 이름은 진료의 상병 → 경향 → 연결표 → 고시 순서로 찾는다', () => {
    const trend = trendOf([['A49', 10, [['M750', '경향 이름', 1, 0, 0], ['M1700', '경향 M1700', 1, 0, 0]]]])
    const links: DxLink[] = [['A49', 'M750', '연결표 이름', 0, 't'], ['A49', 'M1700', '연결표 M1700', 0, 't'], ['A49', 'M2000', '연결표 M2000', 0, 't']]
    const visits = [visitOf([], [dx('M750', true, '진료 이름')])]
    const names = (ctx: ReturnType<typeof ctxOf>) => Object.fromEntries(recommendDx('A49', HA, ctx).list.map((r) => [r.dx, r.nm]))
    expect(names(ctxOf({ trend, links, visits }))).toEqual({
      M17: '무릎관절증 (M17 전체)',
      M750: '진료 이름',
      M1700: '경향 M1700',
      M2000: '연결표 M2000',
    })
    expect(names(ctxOf({ links })).M750).toBe('연결표 이름')
    expect(names(ctxOf()).M750).toBe('어깨의 유착성 관절낭염 (견관절주위염)')
  })

  it('AC-011.1: 고시가 아닌 처방의 연결표 줄에 이름이 없으면 고시의 상병 이름을 쓴다', () => {
    const links: DxLink[] = [['G6604', 'M750', '', 0, 't']]
    expect(recommendDx('G6604', '', ctxOf({ links })).list.map((r) => [r.dx, r.nm])).toEqual([['M750', '어깨의 유착성 관절낭염 (견관절주위염)']])
  })

  it('AC-011.1: 추천은 진료 자료를 바꾸지 않는다', () => {
    const visit = visitOf([rx('A49', HA)], [dx('M5436', true)])
    const before = structuredClone(visit)
    visitDxView(visit, ctxOf({ trend: A49_TREND, visits: [visit] }))
    expect(visit).toEqual(before)
  })
})

describe('AC-011.2 dxIssues·needsCheck·missingDx: 원본 issues·needsCheck·missingDx와 같다', () => {
  it('AC-011.2: 고시·연결표 규칙이 있는 급여 처방에 그 상병이 없으면 확인필요, 추천은 TOP개까지', () => {
    const visit = visitOf([rx('a49', HA), rx('AA254', '재진진찰료'), rx('X99', '비급여 히알루론산 주사', false)], [dx('M5436', true), dx('K219', false)])
    const found = dxIssues(visit, ctxOf({ trend: A49_TREND }))
    expect(found.map((x) => [x.code, x.name, x.gosi, x.record])).toEqual([['A49', HA, true, false]])
    expect(found[0].rec.map((r) => r.dx)).toEqual(['M17', 'M750', 'M1700'])
    expect(found[0].rec).toHaveLength(TOP)
  })

  it('AC-011.2: 앞자리가 같으면 인정하고, 배제상병 자리도 인정한다', () => {
    expect(dxIssues(visitOf([rx('A49', HA)], [dx('M5436', true), dx('M1710', 'x')]), ctxOf())).toEqual([])
  })

  it('AC-011.2: 같은 처방은 한 번만, 비급여 줄은 보지 않고 다음 급여 줄을 본다', () => {
    const links: DxLink[] = [['G6604', 'S6350', '', 0, 't']]
    const visit = visitOf([rx('G6604', '수근골', false), rx('g6604', '수근골4매'), rx('G6604', '수근골4매 둘째')], [dx('M1990', true)])
    expect(dxIssues(visit, ctxOf({ links })).map((x) => [x.code, x.name])).toEqual([['G6604', '수근골4매']])
  })

  it('AC-011.2: 연결표 규칙은 같은 질환군도 인정한다(M1998 규칙에 M1990)', () => {
    const links: DxLink[] = [['AB17', 'M1998', '', 0, 't']]
    expect(dxIssues(visitOf([rx('AB17', '셀코르정')], [dx('M1990', false)]), ctxOf({ links }))).toEqual([])
  })

  it('AC-011.2: 연결표 규칙 상병이 없어도 경향 상병(같은 질환군 포함)이 있으면 통과, 흔한 상병만 있으면 확인필요', () => {
    const links: DxLink[] = [['AA17', 'M1390', '', 0, 't']]
    const trend = trendOf([['AA17', 300, [['K219', '식도역류', 10, 90, 0, 110], ['M5422', '경추통', 60, 10, 0, 400], ['M1990', '관절증', 5, 40, 0, 300]]]])
    const ctx = ctxOf({ links, trend })
    const of = (...codes: DxLine[]) => dxIssues(visitOf([rx('AA17', '합성에페리손정')], codes), ctx)
    expect(of(dx('M5422', true), dx('K219', false))).toEqual([])
    expect(of(dx('M5428', true))).toEqual([])
    expect(of(dx('K219', true)).map((x) => [x.code, x.rec.map((r) => r.dx)])).toEqual([['AA17', ['M1390', 'M5422', 'M1990']]])
  })

  it('AC-011.2: 고시는 경향 상병만으로 통과하지 않고, 이미 있는 상병은 추천에서 뺀다', () => {
    const trend = trendOf([['A49', 100, [['M2556', '관절통', 50, 0, 0, 300], ['M1700', '무릎관절증', 40, 0, 0, 500]]]])
    const found = dxIssues(visitOf([rx('A49', '합성 히알루론산나트륨주')], [dx('M2556', true)]), ctxOf({ trend }))
    expect(found).toHaveLength(1)
    expect(found[0].rec.map((r) => r.dx)).toEqual(['M17', 'M750', 'M1700'])
  })

  it('AC-011.2: 상병이 없는 진료는 dxIssues가 비고 missingDx로 본다', () => {
    const visit = visitOf([rx('A49', HA)], [])
    const ctx = ctxOf()
    expect(dxIssues(visit, ctx)).toEqual([])
    expect(missingDx(visit, ctx)).toBe(true)
    expect(needsCheck(visit, ctx)).toBe(true)
  })

  it('AC-011.2: 비급여뿐이면 missingDx가 아니고, 메모가 있으면 맞다(원본 v.memos)', () => {
    const visit = visitOf([rx('KR006', '도수', false)], [])
    expect(missingDx(visit, ctxOf())).toBe(false)
    expect(needsCheck(visit, ctxOf())).toBe(false)
    expect(missingDx(visit, ctxOf({ hasMemo: () => true }))).toBe(true)
    expect(missingDx(visitOf([], []), ctxOf())).toBe(false)
  })

  it('AC-011.2: 상병 자료가 없으면 아무것도 표시하지 않는다', () => {
    const visit = visitOf([rx('A49', HA)], [])
    const ctx = ctxOf({ hasDx: false, hasMemo: () => true })
    expect(dxIssues(visit, ctx)).toEqual([])
    expect(missingDx(visit, ctx)).toBe(false)
    expect(needsCheck(visit, ctx)).toBe(false)
  })

  it('AC-011.2: 규칙의 상병이 빠진 진료는 needsCheck, 들어 있으면 아니다', () => {
    const links: DxLink[] = [['LA358', 'M54', '', 0, 'r'], ['LA358', 'M51', '', 0, 'r']]
    const ctx = ctxOf({ links })
    const line = rx('LA358', '후지내측지')
    const issue = dxIssues(visitOf([line], [dx('S637', true)]), ctx)
    expect(issue.map((x) => x.record)).toEqual([true])
    expect(needsCheck(visitOf([line], [dx('S637', true)]), ctx)).toBe(true)
    expect(needsCheck(visitOf([line], [dx('M5456', true)]), ctx)).toBe(false)
  })
})

describe('AC-011.3 상병 연결표(원본 snapshot.rules 모양 [rx, dx, nm, ex, src])', () => {
  it('AC-011.3: 고시 → 연결표(넣은 순서) → 경향. 고시와 같은 상병의 연결표 줄은 무시되고, 경향과 같은 상병은 연결표 자리에 경향 숫자가 붙는다', () => {
    const links: DxLink[] = [['A49', 'M2556', '연결 M2556', 0, 's'], ['A49', 'M750', '연결 M750', 1, 't'], ['A49', 'M1000', '', 0, 'r']]
    const { list } = recommendDx('A49', HA, ctxOf({ trend: A49_TREND, links }))
    expect(list.map((r) => [r.dx, r.src, r.ex])).toEqual([
      ['M17', ['gosi'], false],
      ['M750', ['gosi'], false],
      ['M2556', ['staff'], false],
      ['M1000', ['record'], false],
      ['M1700', [], false],
    ])
    expect(list[2].t?.n).toBe(25)
  })

  it('AC-011.3: 처방·상병이 같은 줄이 또 있으면 앞 줄이 이긴다(고시가 먼저)', () => {
    const links: DxLink[] = [['G6604', 'S6350', '앞 줄', 0, 't'], ['G6604', 'S6350', '뒤 줄', 1, 's'], ['MM410', 'M750', '연결', 1, 't']]
    const ctx = ctxOf({ links })
    expect(rulesFor('g6604', '', ctx)).toEqual([{ dx: 'S6350', nm: '앞 줄', ex: false, src: 'table', basis: '' }])
    expect(rulesFor('MM410', '', ctx).map((r) => [r.src, r.ex])).toEqual([['gosi', false]])
  })

  it('AC-011.3: 연결표를 읽을 때 처방코드를 대문자로 바꾸고 이름은 80자까지, 상병=처방코드인 줄은 뺀다', () => {
    const rules = readDxLinks([['g6604', 'S6350', 'x'.repeat(100), 1, 's'], ['G3304', 'G3304', '', 0, 't'], ['G3304', 'M1991', '', 0, 'r']])
    expect(rules).toEqual([
      { rx: 'G6604', dx: 'S6350', nm: 'x'.repeat(80), ex: true, src: 'staff' },
      { rx: 'G3304', dx: 'M1991', nm: '', ex: false, src: 'record' },
    ])
    expect(packDxLinks(rules)).toEqual([['G6604', 'S6350', 'x'.repeat(80), 1, 's'], ['G3304', 'M1991', '', 0, 'r']])
  })

  it.each([
    ['배열이 아님', 'x'],
    ['줄이 배열이 아님', [{ rx: 'G6604' }]],
    ['칸이 모자람', [['G6604', 'S6350', '', 0]]],
    ['처방코드 모양', [['G 6604', 'S6350', '', 0, 't']]],
    ['상병코드 모양', [['G6604', 'bad', '', 0, 't']]],
    ['이름이 글자가 아님', [['G6604', 'S6350', 1, 0, 't']]],
    ['배제가 0·1이 아님', [['G6604', 'S6350', '', 2, 't']]],
    ['출처가 s·t·r이 아님', [['G6604', 'S6350', '', 0, 'x']]],
    ['5000줄 넘음', Array.from({ length: 5001 }, () => ['G6604', 'S6350', '', 0, 't'])],
  ])('AC-011.3: 틀린 연결표는 통째로 거절한다(원본 restore): %s', (_, rows) => {
    expect(() => readDxLinks(rows)).toThrow(TypeError)
  })
})

describe('AC-011.4 상병 추세가 없음', () => {
  const links: DxLink[] = [['A49', 'M2556', '연결 M2556', 0, 't']]

  it.each([
    ['추세 null', null],
    ['추세에 처방이 없음', trendOf([])],
  ])('AC-011.4: %s → 고시·연결표만으로 추천하고 오류를 내지 않는다', (_, trend) => {
    const rec = recommendDx('A49', HA, ctxOf({ trend, links }))
    expect(rec.visits).toBe(0)
    expect(rec.list.map((r) => [r.dx, r.t])).toEqual([['M17', null], ['M750', null], ['M2556', null]])
    expect(dxIssues(visitOf([rx('A49', HA)], [dx('S637', true)]), ctxOf({ trend, links })).map((x) => x.code)).toEqual(['A49'])
  })

  it('AC-011.4: 고시도 연결표도 없는 처방은 빈 목록이다', () => {
    expect(recommendDx('NONE99', '없는 처방', ctxOf())).toEqual({ visits: 0, list: [] })
  })

  it('AC-011.4: 추세 내원이 0이면 비율은 0이다', () => {
    const rec = recommendDx('ZZ001', '', ctxOf({ trend: trendOf([['ZZ001', 0, [['M1000', '이름', 0, 0, 0, 200]]]]) }))
    expect(rec.list[0].t?.share).toBe(0)
  })
})

describe('AC-011.1 visitDxView: 진료 한 건의 보기 모양', () => {
  it('AC-011.1: 처방마다(같은 코드는 한 번) 추천이 있고, 추천이 없는 처방은 넣지 않는다', () => {
    const visit = visitOf([rx('a49', HA), rx('A49', HA), rx('NONE99', '없는 처방')], [dx('M5436', true)])
    const view = visitDxView(visit, ctxOf({ trend: A49_TREND, visits: [visit] }))
    expect(view.visitKey).toBe('900001')
    expect(view.recommendations.map((r) => [r.code, r.name, r.visits, r.list.length])).toEqual([['A49', HA, 200, 4]])
    expect(view.issues.map((x) => x.code)).toEqual(['A49'])
    expect(view.missingDx).toBe(false)
    expect(view.needsCheck).toBe(true)
  })

  it('AC-011.2: 상병이 없는 급여 진료는 경고가 없어도 보기 모양에서 needsCheck다', () => {
    const visit = visitOf([rx('NONE99', '없는 처방')], [])
    const view = visitDxView(visit, ctxOf({ visits: [visit] }))
    expect(view.issues).toEqual([])
    expect(view.missingDx).toBe(true)
    expect(view.needsCheck).toBe(true)
  })
})
