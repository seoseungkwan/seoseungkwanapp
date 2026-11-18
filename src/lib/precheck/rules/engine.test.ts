import { beforeAll, describe, expect, it } from 'vitest'
import { monthOf as monthOfDay } from '@/lib/analytics/dates'
import type { CatalogCode, ClaimMonth, DxLine, Grade, RuleDef, RxLine, Tables, Visit } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { NO_SETTINGS, runRules } from './engine'
import type { RuleParams } from './types'

// 규칙 엔진 작은 단위 시험(REQ-010). 설정 · 이력 · 정규식처럼 골든에서 한눈에 안 보이는 것을 손으로 만든 진료로 본다.
// 원본과 같은지는 golden.test.ts가 본다

let tables: Tables
beforeAll(async () => {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(loaded.code)
  tables = loaded.value
}, 60_000) // 약 표 JSON이 커서 바쁜 기계에서는 첫 읽기가 10초를 넘는다

type RxSeed = [code: string, name: string, qty?: number | null, benefit?: boolean]
type VisitSeed = { key: string; chart?: string; date?: string; lines: string[]; rx: RxSeed[]; dx?: [string, DxLine['m']][] }
type HistorySeed = [chart: string, date: string, codes: string[], memo?: string]

const rxLine = ([code, name, qty, benefit]: RxSeed): RxLine => ({
  code,
  name,
  qty: qty === undefined ? 1 : qty,
  benefit: benefit !== false,
  pay: benefit === false ? '비급여' : '급여',
})

/** 도우미 표를 거치지 않고 점검용 모양을 바로 만든다. 표의 줄 차례는 사례 차례다 */
function month(seeds: VisitSeed[], history: HistorySeed[] = []): ClaimMonth {
  const rxByDay: ClaimMonth['rxByDay'] = new Map()
  const rxDayOrder: ClaimMonth['rxDayOrder'] = []
  const visits: Visit[] = seeds.map((seed) => {
    const chart = seed.chart ?? '900001'
    const date = seed.date ?? '2026-10-05'
    const rx = seed.rx.map(rxLine)
    const days = rxByDay.get(chart) ?? new Map<string, RxLine[]>()
    days.set(date, rx)
    rxByDay.set(chart, days)
    rxDayOrder.push(rx)
    return {
      key: seed.key,
      chart,
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
    catalog: { codes: [], la: [] },
    hasDx: true,
  }
}

const KK090_LIDO: RxSeed[] = [['KK090', '관절강내주사'], ['A15', '리도카인주']]
const KK090_PT: RxSeed[] = [['MM010', '표층열'], ['KK090', '관절강내주사'], ['A21', '트리암주']]
const MANIPULATION: RxSeed[] = [['X7801', '비관혈적관절수동술']]

const hits = (m: ClaimMonth, key: string, settings = NO_SETTINGS, t = tables) => runRules(m, t, settings).perVisit.get(key)!.hits
const ids = (m: ClaimMonth, key: string, settings = NO_SETTINGS, t = tables) => hits(m, key, settings, t).map((h) => h.ruleId)
const gradeOf = (m: ClaimMonth, key: string, rule: string, settings = NO_SETTINGS) =>
  hits(m, key, settings).find((h) => h.ruleId === rule)?.grade

const settingsWith = (patch: Partial<{ off: string[]; on: string[]; grade: Record<string, Grade> }>) => ({
  ...NO_SETTINGS,
  ...patch,
})

const listed = (m: ClaimMonth, codes: Partial<CatalogCode>[]): ClaimMonth => ({
  ...m,
  catalog: { codes: codes.map((row) => ({ code: '', name: '', kind: 'procedure' as const, active: true, standardCode: '', ...row })), la: [] },
})

describe('AC-010.1 결과 모양', () => {
  it('AC-010.1: 결과 한 줄(Finding)은 진료 번호·규칙 번호·등급·내용·세부·근거를 담는다', () => {
    const m = month([{ key: 'a', lines: ['Rt knee IA'], rx: KK090_LIDO }])
    const finding = hits(m, 'a').find((h) => h.ruleId === 'IJ-05')!
    const rule = tables.rules.rules.find((r) => r.id === 'IJ-05')!
    expect(finding).toEqual({ visitKey: 'a', ruleId: 'IJ-05', grade: '확인필요', message: rule.message, detail: 'KK090 + A15', basis: rule.basis })
  })

  it('AC-010.1: 처방이 없는 진료는 돌지 않아 점검한 수가 0이다', () => {
    const m = month([{ key: 'a', lines: ['S) knee pain'], rx: [] }])
    expect(runRules(m, tables, NO_SETTINGS).perVisit.get('a')).toEqual({ hits: [], skippedNoHistory: 0, skippedNoDx: 0, checked: 0 })
  })

  it('AC-010.1: 증상 줄이 빈 진료는 CL-15로 걸린다(원본 시험 v17. 도우미 표로는 이런 진료가 생기지 않아 골든 밖이다)', () => {
    const m = month([{ key: 'a', lines: [], rx: [['MM010', '표층열']], dx: [] }])
    expect(gradeOf(m, 'a', 'CL-15')).toBe('알림')
  })

  it('AC-010.1: 상병 자료가 아예 없으면(83D 없음) 상병을 보는 규칙은 건너뛴 수로 센다', () => {
    const m = { ...month([{ key: 'a', lines: ['Rt knee IA'], rx: KK090_LIDO }]), hasDx: false }
    const result = runRules(m, tables, NO_SETTINGS).perVisit.get('a')!
    expect(result.skippedNoDx).toBeGreaterThan(0)
    expect(result.hits.map((h) => h.ruleId)).not.toContain('DX-06')
  })

  it('AC-010.1: 병원 처방 목록의 보험코드(standardCode)로 규칙을 맞춘다 — 병원 코드가 달라도 같은 행위로 본다', () => {
    const m = month([{ key: 'a', lines: ['Rt knee IA'], rx: [['Z900', '병원주사코드'], ['A15', '리도카인주']] }])
    expect(ids(m, 'a')).not.toContain('IJ-05')
    const mapped = { ...m, catalog: { codes: [{ code: 'Z900', name: '병원주사코드', kind: 'procedure' as const, active: true, standardCode: 'KK090' }], la: [] } }
    const finding = hits(mapped, 'a').find((h) => h.ruleId === 'IJ-05')!
    expect(finding.detail).toBe('Z900 + A15') // 내용에는 병원 코드를 그대로 보인다
  })

  it('AC-010.1: 처방코드 사전은 대소문자를 가리지 않는다(원본 cm)', () => {
    const m = month([{ key: 'a', lines: ['Rt knee IA'], rx: [['kk090', '관절강내주사'], ['a15', '리도카인주']] }])
    expect(ids(m, 'a')).toContain('IJ-05')
  })

  it('AC-010.1: 처방 목록이 있으면 기본 사전을 보지 않는다(원본 병원 모드는 사전을 통째로 바꾼다)', () => {
    // 기본 사전에 HA280 '관절조영술'이 있어 이름에 '조영'이 든다. 목록이 없을 때만 조영제로 읽힌다
    const seed: VisitSeed = { key: 'a', lines: ['Rt shoulder'], rx: [['HA280', 'HA280']], dx: [['M750', true]] }
    const noList = hits(month([seed]), 'a').find((h) => h.ruleId === 'AG-06')
    expect(noList?.message).toContain('(투시 기록 확인)')
    const withList = hits(listed(month([seed]), [{ code: 'Z900', name: '다른 코드' }]), 'a').find((h) => h.ruleId === 'AG-06')
    expect(withList?.message).not.toContain('(투시 기록 확인)')
  })

  it('AC-010.1: 처방 목록 코드는 대소문자를 접어 찾는다(원본 병원 모드 cm). 비트 목록의 Zm5도 보험코드를 읽는다', () => {
    const seed: VisitSeed = { key: 'a', lines: ['Rt knee IA'], rx: [['Zm5', '병원주사'], ['A15', '리도카인주']] }
    const finding = hits(listed(month([seed]), [{ code: 'Zm5', name: '병원주사', standardCode: 'KK090' }]), 'a').find((h) => h.ruleId === 'IJ-05')
    expect(finding?.grade).toBe('확인필요')
    expect(finding?.detail).toBe('ZM5 + A15') // 처방 줄 코드는 대문자로 읽는다
  })

  it('AC-010.1: 이력에만 있는 코드도 목록에서 대소문자를 접어 찾는다(이력 코드는 도우미가 대문자로 준다)', () => {
    const seed: VisitSeed = { key: 'a', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['A21', '트리암주']] }
    const past: HistorySeed[] = [['900001', '2026-09-28', ['ZM6', 'A21'], 'Rt knee']]
    expect(gradeOf(listed(month([seed], past), [{ code: 'Zm6', name: '병원주사', standardCode: 'KK090' }]), 'a', 'IJ-01')).toBe('확인필요')
    // 목록에 없는 코드는 찾지 못해 보험코드를 모른다(기본 사전으로 돌아가지 않는다)
    expect(gradeOf(listed(month([seed], past), [{ code: 'Zm7', name: '병원주사', standardCode: 'KK090' }]), 'a', 'IJ-01')).toBeUndefined()
  })

  // 코드 5000개짜리 달은 가짜 자료 파일이 너무 커져 골든으로 두지 않는다. 같은 달을 원본에 넣어 돌린 결과와 같음을 확인한 사례다
  it('AC-010.1: 약 표에는 이번 달 처방의 9자리 코드를 나온 차례로 5000개까지만 묻는다(원본 requestDrugInfo)', () => {
    const seed: VisitSeed = { key: 'a', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['A21', '트리암주']] }
    const past: HistorySeed[] = [['900001', '2026-09-28', ['KK090', '642306741'], 'Rt knee']]
    const afterOthers = (count: number) => {
      const m = month([seed], past)
      m.rxDayOrder.push(Array.from({ length: count }, (_, i) => rxLine([String(900000000 + i), '가상약'])), [rxLine(['642306741', '가상약'])])
      return m
    }
    expect(gradeOf(afterOthers(4999), 'a', 'IJ-01')).toBe('확인필요')
    expect(gradeOf(afterOthers(5000), 'a', 'IJ-01')).toBeUndefined()
  })

  // 오늘 규칙 표로는 결과가 달라지지 않는 갈림길은 골든이 볼 수 없다. 규칙 표 사본을 고쳐 본다
  // (같은 고침을 원본 CAT에 넣어 돌린 결과와 같음을 확인한 사례들이다)
  const variant = (id: string, change: (rule: RuleDef, params: RuleParams) => void): Tables => {
    const rules = structuredClone(tables.rules)
    const rule = rules.rules.find((item) => item.id === id) as RuleDef
    change(rule, rule.params as RuleParams)
    return { ...tables, rules }
  }

  it('AC-010.2: same_day_pair의 차트 쪽 짝을 본다(쓰는 규칙이 꺼진 수동 규칙 LA-12뿐이라 오늘 표로는 돌지 않는다)', () => {
    const t = variant('LA-12', (rule, params) => {
      delete params.code_mapping_pending
      rule.enabled_default = true
    })
    const m = (line: string) => month([{ key: 'a', lines: [line], rx: [['LA322', '경막외 차단'], ['A21', '트리암주']], dx: [['M5456', true]] }])
    expect(ids(m('caudal block'), 'a', NO_SETTINGS, t)).toContain('LA-12')
    expect(ids(m('LBP'), 'a', NO_SETTINGS, t)).not.toContain('LA-12')
    expect(ids(m('caudal block'), 'a')).not.toContain('LA-12')
  })

  it('AC-010.2: interval은 오늘 약 조건을 따로 본다(오늘 표는 네 규칙 모두 오늘·지난 조건이 같아 드러나지 않는다)', () => {
    const t = variant('IJ-01', (_, params) => {
      ;(params.previous as NonNullable<RuleParams['previous']>).drug_condition = { drug_classes_any: ['local_anesthetic'] }
    })
    const m = (rx: RxSeed[]) => month([{ key: 'a', lines: ['Rt knee'], rx }], [['900001', '2026-09-28', ['KK090', 'A15'], 'Rt knee']])
    expect(ids(m(KK090_LIDO), 'a', NO_SETTINGS, t)).not.toContain('IJ-01')
    expect(ids(m([...KK090_LIDO, ['A21', '트리암주']]), 'a', NO_SETTINGS, t)).toContain('IJ-01')
  })

  it('AC-010.2: interval same_cycle은 14일이 넘으면 같은 주기로 보지 않는다(오늘 표는 HY-08 7일뿐이라 드러나지 않는다)', () => {
    const t = variant('HY-08', (_, params) => {
      params.min_days = 30
    })
    const m = (day: string) => month([{ key: 'a', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['A49', '아라간플러스주']] }], [['900001', day, ['KK090', 'A49'], 'Rt knee']])
    expect(ids(m('2026-09-20'), 'a', NO_SETTINGS, t)).not.toContain('HY-08') // 15일
    expect(ids(m('2026-09-21'), 'a', NO_SETTINGS, t)).toContain('HY-08') // 14일
    expect(ids(m('2026-09-25'), 'a', NO_SETTINGS, t)).toContain('HY-08')
  })

  it('AC-6608.3: 코드만으로는 약 역할이 없다 — 규칙 표의 병원 코드(clinic_codes) 없이 처방 목록 보험코드의 성분으로 정한다', () => {
    const insurance: Record<string, string> = { A15: '670603485', A21: '645903001', A19: '650500301', A99: '645100741' }
    const m = (drugs: string[], standard: (code: string) => string) =>
      listed(
        month([{ key: 'a', lines: ['Rt knee IA'], rx: [['KK090', '가상시술'], ...drugs.map((code): RxSeed => [code, '가상주사'])] }]),
        ['KK090', ...Object.keys(insurance)].map((code) => ({ code, name: '가상주사', kind: 'drug' as const, standardCode: standard(code) })),
      )
    const byCode = (code: string) => code
    expect(ids(m(['A15'], byCode), 'a')).not.toContain('IJ-05')
    const byInsurance = (code: string) => insurance[code] ?? code
    expect(ids(m(['A15'], byInsurance), 'a')).toContain('IJ-05')
    expect(ids(m(['A15', 'A21'], byInsurance), 'a')).not.toContain('IJ-05')
    expect(ids(m(['A15', 'A19'], byInsurance), 'a')).not.toContain('IJ-05')
    expect(ids(m(['A99'], byInsurance), 'a')).not.toContain('IJ-05')
  })
})

describe('AC-6608.2·AC-6608.3 처방 목록 보험코드 성분으로 약 역할 정하기', () => {
  // 무릎이 아닌 상병이라 연골주사로 읽히면 약값 상병 규칙(HY-01)이 걸린다
  const cartilageVisit = (code: string, name: string): ClaimMonth => month([{ key: 'a', lines: ['Rt knee'], rx: [[code, name]], dx: [['M5456', true]] }])
  const cartilageHit = (row: Partial<CatalogCode>) => ids(listed(cartilageVisit(row.code ?? '', row.name ?? ''), [row]), 'a').includes('HY-01')
  // 이력에만 있는 코드는 약 표에 묻지 않아 성분 이름이 줄 이름표에 없다. 지난 내원의 스테로이드 주사로 읽히면 IJ-01이 걸린다
  const pastShotGrade = (row: Partial<CatalogCode>, code = row.code ?? '') => {
    const seed: VisitSeed = { key: 'a', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['A21', '트리암주']] }
    const past: HistorySeed[] = [['900001', '2026-09-28', ['KK090', code], 'Rt knee']]
    return gradeOf(listed(month([seed], past), [row]), 'a', 'IJ-01')
  }
  const TRIAMCINOLONE = '645903001'

  it.each(['drug', 'lab', 'unknown', 'procedure', 'other'] as const)("AC-6608.3: 이름으로 역할을 추측하지 않는다 — 종류 %s의 '히알주'·'아라간주'·'덱사히알주'·이름 없는 '히알01'은 연골주사가 아니다", (kind) => {
    for (const [code, name] of [['Z701', '히알주'], ['Z702', '아라간주'], ['Z715', '덱사히알주'], ['히알01', '']]) expect(cartilageHit({ code, name, kind }), `${code} ${name}`).toBe(false)
  })

  it("AC-6608.3: 줄 이름을 기본 약 이름으로 바꾸지 않는다 — 이력의 '덱사메타손정'·'트리암패치'는 먹는 약·바르는 약으로 읽혀 주사 분류에서 빠진다", () => {
    expect(pastShotGrade({ code: 'Z730', name: '덱사메타손정', kind: 'drug' })).toBeUndefined()
    expect(pastShotGrade({ code: 'Z731', name: '트리암패치', kind: 'drug' })).toBeUndefined()
  })

  it.each(['drug', 'lab', 'unknown', 'procedure'] as const)('AC-6608.2: 대기 줄 종류 %s는 보험코드 성분이 스테로이드 주사면 이력에만 있어도 그 역할로 점검한다', (kind) => {
    expect(pastShotGrade({ code: 'Z730', name: '가상약', kind, standardCode: TRIAMCINOLONE })).toBe('확인필요')
  })

  it('AC-6608.2: 이름 없는 줄은 종류와 상관없이 보험코드 성분을 보고, 이름 있는 other 줄은 처방코드 탭 역할 없이는 보지 않는다(원본 대기 줄)', () => {
    expect(pastShotGrade({ code: 'Z732', name: '', kind: 'other', standardCode: TRIAMCINOLONE })).toBe('확인필요')
    expect(pastShotGrade({ code: 'Z733', name: '가상약', kind: 'other', standardCode: TRIAMCINOLONE })).toBeUndefined()
  })

  it('AC-6608.2: 보험코드 성분이 역할이 아니면(에피네프린 245) 역할이 없다', () => {
    expect(pastShotGrade({ code: 'Z734', name: '가상약', kind: 'drug', standardCode: '645100741' })).toBeUndefined()
  })

  it('AC-6608.2: 대소문자가 섞인 코드도 찾아 성분 역할을 정한다', () => {
    expect(pastShotGrade({ code: 'Zm6', name: '가상약', kind: 'drug', standardCode: TRIAMCINOLONE }, 'ZM6')).toBe('확인필요')
  })

  it('AC-6608.2: 처방 목록이 없는 달은 성분 역할이 없다(줄 이름표의 분류 낱말만 본다)', () => {
    expect(ids(cartilageVisit('Z701', '히알주'), 'a')).not.toContain('HY-01')
  })
})

describe('AC-010.4 설정 {off, on, grade}', () => {
  it('AC-010.4: 끈 규칙은 결과가 없다', () => {
    const m = month([{ key: 'a', lines: ['Rt knee IA'], rx: KK090_LIDO }])
    expect(ids(m, 'a')).toContain('IJ-05')
    expect(ids(m, 'a', settingsWith({ off: ['IJ-05'] }))).not.toContain('IJ-05')
  })

  it('AC-010.4: 켠 규칙은 enabled_default가 꺼져 있어도 돈다', () => {
    expect(tables.rules.rules.find((r) => r.id === 'HD-08')?.enabled_default).toBe(false)
    const m = month([{ key: 'a', lines: ['Rt knee'], rx: MANIPULATION }])
    expect(ids(m, 'a')).not.toContain('HD-08')
    expect(ids(m, 'a', settingsWith({ on: ['HD-08'] }))).toContain('HD-08')
  })

  it('AC-010.4: 끄기가 켜기보다 먼저다(원본 enabled)', () => {
    const m = month([{ key: 'a', lines: ['Rt knee'], rx: MANIPULATION }])
    expect(ids(m, 'a', settingsWith({ on: ['HD-08'], off: ['HD-08'] }))).not.toContain('HD-08')
  })

  it('AC-010.4: 등급을 바꾼 규칙은 바뀐 등급으로 나오고 정렬도 바뀐 등급을 따른다', () => {
    const m = month([{ key: 'a', lines: ['Rt knee IA', 'knee pain'], rx: KK090_PT }])
    const before = hits(m, 'a')
    expect(before.find((h) => h.ruleId === 'PH-01')?.grade).toBe('알림')
    const after = hits(m, 'a', settingsWith({ grade: { 'PH-01': '확인필요' } }))
    expect(after.find((h) => h.ruleId === 'PH-01')?.grade).toBe('확인필요')
    const order = (grade: Grade) => ['확인필요', '알림', '참고'].indexOf(grade)
    for (let i = 1; i < after.length; i++) expect(order(after[i - 1].grade)).toBeLessThanOrEqual(order(after[i].grade))
    expect(after[0].ruleId).toBe('PH-01')
  })

  it('AC-010.4: 묶음(collect)도 바뀐 등급으로 세고 놓는다', () => {
    const m = month([{ key: 'a', lines: ['Rt knee IA', 'knee pain'], rx: KK090_PT }])
    const result = runRules(m, tables, settingsWith({ grade: { 'PH-01': '확인필요' } }))
    expect(result.groups.find((g) => g.ruleId === 'PH-01')?.grade).toBe('확인필요')
    expect(result.totals.hi).toBe(result.perVisit.get('a')!.hits.filter((h) => h.grade === '확인필요').length)
    expect(result.totals.patients).toBe(1)
  })

  it('AC-010.4: 등급은 원본 저장 모양([[규칙, 등급]])으로 받아도 같다', () => {
    const m = month([{ key: 'a', lines: ['Rt knee IA', 'knee pain'], rx: KK090_PT }])
    const pairs = { schema: 1 as const, off: [], on: [], grade: [['PH-01', '확인필요']] as [string, Grade][] }
    expect(gradeOf(m, 'a', 'PH-01', pairs)).toBe('확인필요')
  })

  it('AC-010.4: 시작 날짜(effective_from) 전의 진료에는 돌지 않는다', () => {
    const rx: RxSeed[] = [['KR006', '도수치료']]
    const dx: VisitSeed['dx'] = [['G510', true]]
    const m = month([
      { key: 'before', chart: '900001', date: '2026-06-30', lines: ['도수'], rx, dx },
      { key: 'on', chart: '900002', date: '2026-07-01', lines: ['도수'], rx, dx },
    ])
    expect(ids(m, 'before')).not.toContain('MN-05')
    expect(ids(m, 'on')).toContain('MN-05')
  })

  it('AC-010.4: 끝 날짜(effective_to) 뒤의 진료에는 돌지 않는다', () => {
    const rules = structuredClone(tables.rules)
    rules.rules.find((r) => r.id === 'IJ-05')!.effective_to = '2026-10-05'
    const changed = { ...tables, rules }
    const m = month([
      { key: 'last', chart: '900001', date: '2026-10-05', lines: ['Rt knee IA'], rx: KK090_LIDO },
      { key: 'after', chart: '900002', date: '2026-10-06', lines: ['Rt knee IA'], rx: KK090_LIDO },
    ])
    expect(ids(m, 'last', NO_SETTINGS, changed)).toContain('IJ-05')
    expect(ids(m, 'after', NO_SETTINGS, changed)).not.toContain('IJ-05')
  })
})

describe('AC-010.5 12개월 이력', () => {
  const MBB: RxSeed[] = [['LA358', '후지내측지', 1.5], ['A21', '트리암주']]

  it('AC-010.5: 이력이 필요한 규칙은 늘 함께 오는 12개월 이력(AC-008.1)으로 센다', () => {
    const seed: VisitSeed = { key: 'a', chart: '900015', lines: ['S) LBP L4,5 Rt'], rx: MBB, dx: [['M5456', true]] }
    expect(ids(month([seed]), 'a')).not.toContain('LA-19')
    const withHistory = month([seed], [['900015', '2026-10-01', ['LA358', 'A21'], 'MBB L4,5 Rt']])
    expect(gradeOf(withHistory, 'a', 'LA-19')).toBe('확인필요')
  })

  it('AC-010.5: 그 환자 이력이 없어도 건너뛰지 않는다 — 이력 건너뜀 수는 늘 0이고 묶음의 historySkips도 0이다', () => {
    const m = month([{ key: 'a', chart: '900015', lines: ['MBB L4,5 Rt'], rx: MBB, dx: [['M5456', true]] }])
    const result = runRules(m, tables, NO_SETTINGS)
    expect(result.perVisit.get('a')!.skippedNoHistory).toBe(0)
    expect(result.totals.historySkips).toBe(0)
  })

  it("AC-010.5: 횟수 글에 '이번 달 자료만'을 붙이지 않는다(이력을 늘 받으므로)", () => {
    const dates = ['2026-10-05', '2026-10-06', '2026-10-07']
    const m = month(dates.map((date, i) => ({ key: `v${i}`, date, lines: ['도수'], rx: [['KR006', '도수치료']] as RxSeed[] })))
    const finding = hits(m, 'v2').find((h) => h.ruleId === 'MN-03')!
    expect(finding.detail).toBe('3회째')
  })

  it('AC-010.5: 이력 메모는 그날 처방이 이미 있으면 차트 글에 더해 읽는다(원본 pastOf)', () => {
    const shoulder: RxSeed[] = [['MM410', '수압팽창술'], ['A41', '조영제']]
    const seeds: VisitSeed[] = [
      { key: 'first', date: '2026-10-01', lines: ['S) pain'], rx: shoulder, dx: [['M750', true]] },
      { key: 'next', date: '2026-10-05', lines: ['Rt shoulder'], rx: shoulder, dx: [['M750', true]] },
    ]
    // 첫 진료 차트에 부위가 없을 때 비트 메모가 왼쪽 무릎이면 다른 관절이라 간격 규칙이 걸리지 않는다
    expect(ids(month(seeds), 'next')).toContain('HD-03')
    const memo = month(seeds, [['900001', '2026-10-01', ['MM410'], 'Lt knee 시행']])
    expect(ids(memo, 'next')).not.toContain('HD-03')
  })
})

describe('AC-010.6 Python식 정규식과 regions 경로', () => {
  it('AC-010.6: (?i)가 든 규칙 글을 대소문자 없이 읽는다', () => {
    const rx: RxSeed[] = [['HA280', '관절조영술'], ['A41', '조영제']]
    const dx: VisitSeed['dx'] = [['M750', true]]
    const m = month([{ key: 'a', lines: ['Rt shoulder MRI C-ARM DIAGNOSTIC'], rx, dx }])
    const finding = hits(m, 'a').find((h) => h.ruleId === 'AG-03')
    expect(finding).toBeUndefined()
    const missing = month([{ key: 'a', lines: ['Rt shoulder MRI C-ARM'], rx, dx }])
    expect(hits(missing, 'a').find((h) => h.ruleId === 'AG-03')?.detail).toBe('HA280 · 빠진 기록: 진단 목적')
  })

  it('AC-010.6: regions.* 경로를 따라 낱말을 찾고, 원본이 더한 낱말(아프·pain)도 증상 기록으로 본다', () => {
    const rx: RxSeed[] = [['LA247', '견갑상신경차단'], ['A21', '트리암주']]
    const dx: VisitSeed['dx'] = [['M7581', true]]
    expect(ids(month([{ key: 'a', lines: ['Rt shoulder'], rx, dx }]), 'a')).toContain('LA-22')
    expect(ids(month([{ key: 'a', lines: ['Rt shoulder 아프다'], rx, dx }]), 'a')).not.toContain('LA-22')
    expect(ids(month([{ key: 'a', lines: ['Rt shoulder 압통'], rx, dx }]), 'a')).not.toContain('LA-22')
  })

  it('AC-010.6: 낱말을 더해도 불러 둔 표는 그대로다(표는 읽기만 한다)', () => {
    const before = JSON.stringify(tables.rules.regions)
    runRules(month([{ key: 'a', lines: ['Rt shoulder'], rx: KK090_LIDO }]), tables, NO_SETTINGS)
    runRules(month([{ key: 'a', lines: ['Rt shoulder'], rx: KK090_LIDO }]), tables, NO_SETTINGS)
    expect(JSON.stringify(tables.rules.regions)).toBe(before)
  })

  it('AC-010.6: 표가 같으면 두 번 돌려도 같은 결과다(정규식 lastIndex 등이 남지 않는다)', () => {
    const m = month([{ key: 'a', lines: ['MBB L4,5 both', 'LBP'], rx: [['LA358', '후지내측지', 2.5], ['LA357', '척추부신경', 1], ['A21', '트리암주']], dx: [['M5456', true]] }])
    expect(hits(m, 'a')).toEqual(hits(m, 'a'))
  })
})
