import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { monthOf as monthOfDay } from '@/lib/analytics/dates'
import { drugRoles, type DrugRole } from '@/lib/precheck/drugRoles'
import type { CatalogCode, ClaimMonth, DxLine, RxLine, Tables, Visit } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { compiled } from './compile'
import { NO_SETTINGS, runRules } from './engine'
import { createRun } from './run'

// 약 역할을 성분으로(REQ-6608, design.md 10절). 가짜 달로 점검 결과와 약 분류를 본다.
// 우리 의원 다섯 코드(AC-6608.4)는 고치기 전 점검이 낸 분류·결과를 그대로 적어 두고 고친 뒤에도 같은지 본다

let tables: Tables
beforeAll(async () => {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(loaded.code)
  tables = loaded.value
}, 60_000) // 약 표 JSON이 커서 바쁜 기계에서는 첫 읽기가 10초를 넘는다

type RxSeed = [code: string, name: string, qty?: number]
type VisitSeed = { key: string; chart: string; date?: string; lines: string[]; rx: RxSeed[]; dx?: [string, DxLine['m']][] }
type HistorySeed = [chart: string, date: string, codes: string[], memo?: string]

const rxLine = ([code, name, qty]: RxSeed): RxLine => ({ code, name, qty: qty ?? 1, benefit: true, pay: '급여' })

/** 도우미 표를 거치지 않고 점검용 모양을 바로 만든다 */
function month(seeds: VisitSeed[], history: HistorySeed[], catalog: Partial<CatalogCode>[]): ClaimMonth {
  const rxByDay: ClaimMonth['rxByDay'] = new Map()
  const rxDayOrder: ClaimMonth['rxDayOrder'] = []
  const visits: Visit[] = seeds.map((seed) => {
    const date = seed.date ?? '2026-10-12'
    const rx = seed.rx.map(rxLine)
    const days = rxByDay.get(seed.chart) ?? new Map<string, RxLine[]>()
    days.set(date, rx)
    rxByDay.set(seed.chart, days)
    rxDayOrder.push(rx)
    return {
      key: seed.key,
      chart: seed.chart,
      date,
      month: monthOfDay(date),
      name: '가상환자01',
      lines: seed.lines,
      hints: seed.lines.map(() => null),
      rx,
      dx: (seed.dx ?? [['M1706', true]]).map(([c, m]) => ({ c, n: '', m, s: '', d: '', t: '' })),
      memosInBit: [],
    }
  })
  const byChart: ClaimMonth['history'] = new Map()
  for (const [chart, date, codes, memo] of history) {
    const days = byChart.get(chart) ?? new Map<string, { codes: string[]; memo: string }>()
    days.set(date, { codes, memo: memo ?? '' })
    byChart.set(chart, days)
  }
  return {
    period: { from: '2026-10-01', to: '2026-10-31' },
    visits,
    history: byChart,
    historyRange: { from: '2025-10-01', to: '2026-10-31' },
    rxByDay,
    rxDayOrder,
    dxTrend: { from: '2025-11-01', to: '2026-11-01', visits: 0, codes: new Map(), suggestions: [] },
    catalog: { codes: catalog.map((row) => ({ code: '', name: '', kind: 'drug' as const, active: true, standardCode: '', ...row })), la: [] },
    hasDx: true,
  }
}

/** 진료마다 결과(규칙:등급:세부) */
const results = (m: ClaimMonth, roles?: Map<string, DrugRole | 'none'>) => {
  const out: Record<string, string[]> = {}
  for (const [key, visit] of runRules(m, tables, NO_SETTINGS, roles).perVisit) out[key] = visit.hits.map((h) => `${h.ruleId}:${h.grade}:${h.detail}`)
  return out
}

/** 진료마다 오늘 처방 줄의 약 분류, 지난 날 처방 줄의 약 분류 */
const classes = (m: ClaimMonth, run = createRun(m, tables)) => {
  const out: Record<string, { today: string[]; past: string[] }> = {}
  for (const v of m.visits) {
    const c = run.contextOf(v)
    const list = (lines: { code: string; classes: Set<string> }[]) => lines.filter((l) => l.classes.size).map((l) => `${l.code}=${[...l.classes].sort().join(',')}`)
    out[v.key] = { today: list(c.lines), past: run.pastOf(c).flatMap((p) => list(p.lines).map((x) => `${p.date} ${x}`)) }
  }
  return out
}

// ── 우리 의원(AC-6608.4): 처방 목록의 보험코드는 2026-11-18 비트 DB에서 확인한 값. 이름은 일부러 성분이 드러나지 않게 둔다 ──
const OUR_CATALOG: Partial<CatalogCode>[] = [
  { code: 'KK090', name: '관절강내주사', kind: 'procedure', standardCode: 'KK090' },
  { code: 'HA280', name: '관절조영술', kind: 'procedure', standardCode: 'HA280' },
  { code: 'MM410', name: '수압팽창술', kind: 'procedure', standardCode: 'MM410' },
  { code: 'A15', name: '가상주사', standardCode: '670603485' },
  { code: 'A19', name: '가상주사', standardCode: '650500301' },
  { code: 'A21', name: '가상주사', standardCode: '645903001' },
  { code: 'A41', name: '가상주사', standardCode: '650100641' },
  { code: 'a49', name: '가상주사', standardCode: '645902041' },
]
const OUR_VISITS: VisitSeed[] = [
  { key: 'lido-only', chart: '900101', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사'], ['A15', '가상주사']] },
  { key: 'lido-a21', chart: '900102', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사'], ['A15', '가상주사'], ['A21', '가상주사']] },
  { key: 'lido-a19', chart: '900103', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사'], ['A15', '가상주사'], ['A19', '가상주사']] },
  { key: 'a49-hip-dx', chart: '900104', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['A49', '가상주사']], dx: [['M5456', true]] },
  { key: 'a41-ha280', chart: '900105', lines: ['Rt shoulder'], rx: [['HA280', '관절조영술'], ['A41', '가상주사']], dx: [['M750', true]] },
  { key: 'a21-interval', chart: '900106', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['A21', '가상주사']] },
  { key: 'a19-interval', chart: '900107', lines: ['Lt knee'], rx: [['KK090', '관절강내주사'], ['A19', '가상주사']] },
  { key: 'a41-history', chart: '900108', lines: ['Rt shoulder'], rx: [['MM410', '수압팽창술'], ['A41', '가상주사']], dx: [['M750', true]] },
  { key: 'a49-cycle', chart: '900109', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['A49', '가상주사']] },
]
const OUR_HISTORY: HistorySeed[] = [
  ['900106', '2026-10-05', ['KK090', 'A21'], 'Rt knee'],
  ['900107', '2026-10-01', ['KK090', 'A19'], 'Lt knee'],
  ['900108', '2026-10-02', ['MM410', 'A41'], 'Rt shoulder'],
  ['900109', '2026-10-08', ['KK090', 'A49'], 'Rt knee'],
]
const ourMonth = () => month(OUR_VISITS, OUR_HISTORY, OUR_CATALOG)
/** 이번 달에 처방하지 않은 코드(약 표에 묻지 않음)가 지난 날에만 있는 달 */
const historyOnlyMonth = () =>
  month(
    [{ key: 'a19-after-others', chart: '900201', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['A19', '가상주사']] }],
    [['900201', '2026-10-07', ['KK090', 'A15', 'A21', 'A49'], 'Rt knee']],
    OUR_CATALOG,
  )

// 고치기 전(STEROID·LIDO_CODES·clinic_codes가 있던 점검)에 이 달을 돌려 나온 값
const OUR_RESULTS: Record<string, string[]> = {
  'lido-only': ['IJ-05:확인필요:KK090 + A15'],
  'lido-a21': [],
  'lido-a19': [],
  'a49-hip-dx': ['HY-01:확인필요:A49 · 필요한 상병 M17·M750', 'HY-12:알림:HY-01 기준 밖 → 약값 U항(전액 본인부담) 처리 확인', 'IJ-17:알림:KK090 · 상병 부위 요천추'],
  'a41-ha280': ['AG-03:확인필요:HA280 · 빠진 기록: 비침습 검사·대체 사유, 진단 목적', 'AG-06:알림:HA280'],
  'a21-interval': ['IJ-01:확인필요:직전 2026-10-05 · 7일 간격 (기준 14일 이상)'],
  'a19-interval': ['IJ-01:확인필요:직전 2026-10-01 · 11일 간격 (기준 14일 이상)'],
  'a41-history': ['HD-03:확인필요:직전 2026-10-02 · 10일 간격 (기준 14일 이상)', 'HD-05:알림:MM410 · 빠진 기록: 투시 영상, 관절낭 변화', 'HD-06:알림:MM410'],
  'a49-cycle': ['HY-08:알림:직전 2026-10-08 · 4일 간격 (기준 7일 이상)'],
}
const OUR_CLASSES: Record<string, { today: string[]; past: string[] }> = {
  'lido-only': { today: ['A15=local_anesthetic'], past: [] },
  'lido-a21': { today: ['A15=local_anesthetic', 'A21=steroid_injection'], past: [] },
  'lido-a19': { today: ['A15=local_anesthetic', 'A19=steroid_injection'], past: [] },
  'a49-hip-dx': { today: ['A49=hyaluronate_20mg,viscosupplement_any'], past: [] },
  'a41-ha280': { today: ['HA280=contrast', 'A41=contrast'], past: [] }, // HA280 '관절조영술'은 이름의 '조영'으로 조영제 분류(지금 그대로)
  'a21-interval': { today: ['A21=steroid_injection'], past: ['2026-10-05 A21=steroid_injection'] },
  'a19-interval': { today: ['A19=steroid_injection'], past: ['2026-10-01 A19=steroid_injection'] },
  'a41-history': { today: ['A41=contrast'], past: ['2026-10-02 A41=contrast'] },
  'a49-cycle': { today: ['A49=hyaluronate_20mg,viscosupplement_any'], past: ['2026-10-08 A49=hyaluronate_20mg,viscosupplement_any'] },
}

// 지난 날에만 있는 코드는 약 표에 묻지 않아 성분 이름이 줄 이름표에 붙지 않는다(역할만으로 분류가 남는다)
const HISTORY_ONLY_CLASSES = {
  'a19-after-others': {
    today: ['A19=steroid_injection'],
    past: ['2026-10-07 A15=local_anesthetic', '2026-10-07 A21=steroid_injection', '2026-10-07 A49=hyaluronate_20mg,viscosupplement_any'],
  },
}

describe('AC-6608.4 우리 의원 다섯 코드는 고치기 전과 같은 분류·결과', () => {
  it('AC-6608.4: 우리 의원 처방 목록(보험코드)으로 돌린 점검 결과가 고치기 전과 같다', () => {
    expect(results(ourMonth())).toEqual(OUR_RESULTS)
    expect(results(historyOnlyMonth())).toEqual({ 'a19-after-others': ['IJ-01:확인필요:직전 2026-10-07 · 5일 간격 (기준 14일 이상)'] })
  })

  it('AC-6608.4: 오늘·지난 처방 줄의 약 분류가 고치기 전과 같다', () => {
    expect(classes(ourMonth())).toEqual(OUR_CLASSES)
    expect(classes(historyOnlyMonth())).toEqual(HISTORY_ONLY_CLASSES)
  })
})

describe('AC-6608.4 처방코드 탭 역할을 넘겨도 우리 의원은 같다', () => {
  const withRoles = (m: ClaimMonth) => classes(m, createRun(m, tables, drugRoles(m.catalog, tables.drugInfo, {})))

  it('AC-6608.4: 처방 목록으로 만든 역할(drugRoles)을 넘겨 돌린 약 분류가 고치기 전과 같다', () => {
    expect(withRoles(ourMonth())).toEqual(OUR_CLASSES)
    expect(withRoles(historyOnlyMonth())).toEqual(HISTORY_ONLY_CLASSES)
  })
})

// ── 다른 병원(AC-6608.3): 'A15'가 에피네프린 주사, 'X7'이 히알루론산나트륨 주사 ──
const OTHER_CATALOG: Partial<CatalogCode>[] = [
  { code: 'KK090', name: '관절강내주사', kind: 'procedure', standardCode: 'KK090' },
  { code: 'A15', name: '가상주사', standardCode: '645100741' },
  { code: 'X7', name: '가상주사', standardCode: '642904921' },
  { code: 'X8', name: '가상주사', standardCode: '645902041' },
]
const otherMonth = () =>
  month(
    [
      { key: 'a15-alone', chart: '900301', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사'], ['A15', '가상주사']] },
      { key: 'x7-hip-dx', chart: '900302', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['X7', '가상주사']], dx: [['M5456', true]] },
    ],
    [],
    OTHER_CATALOG,
  )
/** X7·A15는 이번 달에 처방하지 않아 약 표에 묻지 않는다(성분 이름이 줄 이름표에 붙지 않는다) */
const otherHistoryMonth = () =>
  month([{ key: 'x8-after-x7', chart: '900303', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['X8', '가상주사']] }], [['900303', '2026-10-09', ['KK090', 'X7', 'A15'], 'Rt knee']], OTHER_CATALOG)

describe('AC-6608.3 다른 병원은 그 병원 보험코드 성분으로 본다', () => {
  it("AC-6608.3: 'A15'가 리도카인이 아닌 병원은 'A15'를 마취약으로 보지 않는다(국소마취제 단독 IJ-05가 없다)", () => {
    expect(results(otherMonth())['a15-alone']).toEqual([])
    expect(classes(otherMonth())['a15-alone']).toEqual({ today: [], past: [] })
  })

  it("AC-6608.3: 성분이 히알루론산나트륨 주사인 'X7'은 연골주사로 본다(무릎이 아닌 상병이면 HY-01·HY-12)", () => {
    const ids = results(otherMonth())['x7-hip-dx'].map((x) => x.split(':').slice(0, 2).join(':'))
    expect(ids).toEqual(expect.arrayContaining(['HY-01:확인필요', 'HY-12:알림']))
  })

  it("AC-6608.3: 약 표에 묻지 않은 지난 날의 'X7'도 보험코드 성분으로 연골주사, 'A15'는 역할 없음", () => {
    expect(classes(otherHistoryMonth())['x8-after-x7'].past).toEqual(['2026-10-09 X7=hyaluronate_20mg,viscosupplement_any'])
  })

  it('AC-6608.3: 점검 코드 안에 우리 의원 코드(A15·A19·A21·A41·A49)와 약 이름 추측이 없다', () => {
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8')
    for (const path of ['./run.ts', './compile.ts', '../drugRoles.ts']) {
      expect(source(path), path).not.toMatch(/['"`]A(15|19|21|41|49)['"`]/i)
      expect(source(path), path).not.toMatch(/clinic_codes|DEFAULT_DRUG_NAMES|LIDO_CODES|아라간|히알/)
    }
  })

  it('AC-6608.3: 규칙 표의 clinic_codes는 자료로 남지만 약 분류의 코드 묶음에 더하지 않는다', () => {
    const raw = tables.rules.drug_classes as Record<string, { clinic_codes?: Record<string, string> }>
    expect(Object.keys(raw.local_anesthetic.clinic_codes ?? {})).toEqual(['A15'])
    const C = compiled(tables.rules)
    const codes = (name: string) => [...(C.CLASSES.get(name)?.codes ?? [])]
    expect(codes('local_anesthetic')).toEqual([])
    expect(codes('steroid_injection')).toEqual([])
    expect(codes('contrast')).toEqual([])
    expect(codes('hyaluronate_20mg')).toEqual(['645902041']) // 보험코드(edi_codes)는 그대로
  })
})

describe('AC-6608.2 처방코드 탭에서 고른 역할로 점검한다', () => {
  const run = (m: ClaimMonth, roles: [string, DrugRole | 'none'][]) => classes(m, createRun(m, tables, new Map(roles)))
  const chosenMonth = () =>
    month(
      [{ key: 'q', chart: '900401', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['X7', '가상주사']] }],
      [['900401', '2026-10-09', ['Q1', 'Q2', 'Q3', 'A15'], 'Rt knee']],
      [...OUR_CATALOG, { code: 'X7', name: '가상주사', standardCode: '642904921' }, { code: 'Q1', name: '가상주사' }, { code: 'Q2', name: '가상주사' }, { code: 'Q3', name: '가상주사' }],
    )

  it('AC-6608.2: 고른 역할이 보험코드 성분보다 먼저다 — 스테로이드·마취약·연골주사', () => {
    const past = run(chosenMonth(), [['Q1', 'steroid'], ['Q2', 'localAnesthetic'], ['Q3', 'cartilage'], ['A15', 'steroid']]).q.past
    expect(past).toEqual([
      '2026-10-09 Q1=steroid_injection',
      '2026-10-09 Q2=local_anesthetic',
      '2026-10-09 Q3=hyaluronate_20mg,viscosupplement_any',
      '2026-10-09 A15=steroid_injection',
    ])
  })

  it("AC-6608.2: [아님]('none')은 성분·이름으로 붙은 스테로이드·마취약·연골주사 분류를 모두 뺀다", () => {
    expect(classes(chosenMonth()).q.today).toEqual(['X7=hyaluronate_25mg,viscosupplement_any'])
    const out = run(chosenMonth(), [['X7', 'none'], ['A15', 'none']]).q
    expect(out.today).toEqual([])
    expect(out.past).toEqual([])
  })

  it('AC-6608.2: 역할이 없는 코드는 그대로다(넘긴 역할이 비어 있으면 처방 목록 성분만 본다)', () => {
    expect(run(chosenMonth(), []).q).toEqual(classes(chosenMonth()).q)
  })
})

describe('AC-6608.2 runRules가 넘겨받은 역할로 점검한다', () => {
  const ruleIds = (list: string[]) => list.map((x) => x.split(':')[0])

  it("AC-6608.2: 넷째 값에서 [아님]('none')인 스테로이드는 빠져 국소마취제만 남은 관절강 주사(IJ-05)가 걸린다", () => {
    expect(ruleIds(results(ourMonth())['lido-a21'])).not.toContain('IJ-05')
    expect(ruleIds(results(ourMonth(), new Map([['A21', 'none']]))['lido-a21'])).toContain('IJ-05')
  })

  it('AC-6608.2: 넷째 값에서 연골주사로 고른 코드는 히알루론산으로 읽혀 무릎이 아닌 상병이면 HY-01·HY-12가 걸린다', () => {
    const m = month([{ key: 'q', chart: '900501', lines: ['Rt knee'], rx: [['Q9', '가상주사']], dx: [['M5456', true]] }], [], [{ code: 'Q9', name: '가상주사' }])
    expect(ruleIds(results(m).q)).not.toContain('HY-01')
    expect(ruleIds(results(m, new Map([['Q9', 'cartilage']])).q)).toEqual(expect.arrayContaining(['HY-01', 'HY-12']))
  })

  it('AC-6608.2: 넷째 값을 주지 않으면 빈 역할 표와 같다(지금 부르는 곳이 그대로 돈다)', () => {
    expect(results(ourMonth())).toEqual(results(ourMonth(), new Map()))
  })
})
