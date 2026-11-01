import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { aggregate } from '@/lib/analytics/aggregate'
import { addDays, addMonths, isYmd, monthOf } from '@/lib/analytics/dates'
import { createPatientIds } from '@/lib/parsers/bit'
import { findHeaderRow } from '@/lib/parsers/bit/header'
import { parseBitGrid } from '@/lib/parsers/bit/parseBit'
import { readGrid } from '@/lib/parsers/common'
import type { Aggregates } from '@/types/analysis'
import type { Cell } from '@/types/parse'
import { StatsDataError } from './assemble'
import { MAX_STATS_ROWS, parseStatsRows, toConsumptionRows, toVisitRows } from './helperData'

const FROM = '2026-09-01'
const TO = '2026-11-01'
const REQ = { from: FROM, to: TO }
const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
const SLOW = { timeout: 60_000 }
const AMOUNT_LIMIT = 10 ** 14
const FAKE_DIR = fileURLToPath(new URL('../../../fixtures/fake-bit/', import.meta.url))

// 가짜 차트번호(9로 시작하는 6자리). 소스에 통째로 쓰지 않고 이어 만든다
const chart = (n: number) => '9' + String(n).padStart(5, '0')

const okSet = (period: string) => ({
  ok: true,
  period,
  totalVisits: 10,
  newPatients: 2,
  returnPatients: 8,
  totalAmount: 100_000,
  insurerAmount: 70_000,
  noncoveredAmount: 30_000,
  cashAmount: 10_000,
  cardAmount: 15_000,
  transferAmount: 5_000,
  treatments: { manual: 1, eswt: 2, carm: 3, sono: 4, cryo: 5 },
  laCodes: [{ code: 'LA01', count: 2 }],
  financeUnconfirmed: false,
  notes: [],
})

const reportOf = (to: string) => ({
  daily: [okSet(to), okSet(addDays(to, -1))],
  monthly: [okSet(monthOf(to)), okSet(addMonths(monthOf(to), -1))],
})

const good = () => ({
  v: 1,
  from: FROM,
  to: TO,
  summary: { visits: 2, patients: 1, newPatients: 1, noChart: 0, duplicate: 0, noFirst: 0 },
  days: [
    ['20260901', 1, 1, 1],
    ['20260902', 1, 1, 0],
  ],
  codes: [['MM042', '표층열치료']],
  rows: [
    [chart(1), '20260901', 'MM042', '20260901'],
    [chart(1), '20260902', 'MM042', '20260901'],
  ],
  report: reportOf(TO),
})

const DROP = Symbol('drop')

// good()의 한 자리만 바꾼 JSON 글자
function changed(path: ReadonlyArray<string | number>, value: unknown): string {
  const draft = good() as unknown
  let at = draft as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (value === DROP) Reflect.deleteProperty(at, last)
  else at[last] = value
  return JSON.stringify(draft)
}

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (e) {
    expect(e).toBeInstanceOf(StatsDataError)
    return (e as StatsDataError).code
  }
  throw new Error('거절해야 하는데 받았어요')
}

describe('AC-505.2 parseStatsRows: 정해 둔 모양만 받는다', () => {
  it('맞는 자료를 받는다', () => {
    const data = parseStatsRows(JSON.stringify(good()), REQ)
    expect(data.from).toBe(FROM)
    expect(data.to).toBe(TO)
    expect(data.rows).toHaveLength(2)
    expect(data.summary.visits).toBe(2)
    expect(data.report.daily).toHaveLength(2)
    expect(data.report.monthly[1].period).toBe('2026-10')
  })

  it.each<[string, ReadonlyArray<string | number>, unknown]>([
    ['첫 내원일 null + 기간 합계 noFirst', ['rows'], [[chart(1), '20260901', 'MM042', null]]],
    ['처방코드 40자', ['rows', 0, 2], 'M'.repeat(40)],
    ['첫 내원일이 기간보다 앞', ['rows'], [[chart(1), '20260901', 'MM042', '20200101']]],
    ['기간 끝날의 진료', ['rows'], [[chart(1), '20261101', 'MM042', '20261101']]],
    ['금액 확인 필요 + 사유', ['report', 'daily', 0, 'financeUnconfirmedReason'], 'unsupported_finance'],
    ['보고를 확정 못 한 벌', ['report', 'daily', 1], { ok: false, period: '2026-10-31', reason: 'invalid_aggregate' }],
    ['진료 줄 없음', ['rows'], []],
    ['처방 이름에 빈 글자', ['codes', 0], ['MM042', '']],
  ])('받는다: %s', (name, path, value) => {
    const draft = JSON.parse(changed(path, value)) as { summary: { noFirst: number } }
    if (name.includes('null')) draft.summary.noFirst = 1
    expect(() => parseStatsRows(JSON.stringify(draft), REQ)).not.toThrow()
  })

  it.each<[string, ReadonlyArray<string | number>, unknown]>([
    ['맨 위 열쇠가 더 있음', ['extra'], 1],
    ['맨 위 열쇠가 없음', ['days'], DROP],
    ['버전이 다름', ['v'], 2],
    ['기간 시작이 요청과 다름', ['from'], '2026-09-02'],
    ['기간 끝이 요청과 다름', ['to'], '2026-10-31'],
    ['합계 열쇠가 더 있음', ['summary', 'extra'], 0],
    ['합계 열쇠가 없음', ['summary', 'noFirst'], DROP],
    ['합계가 음수', ['summary', 'visits'], -1],
    ['합계가 소수', ['summary', 'visits'], 1.5],
    ['합계가 글자', ['summary', 'duplicate'], '0'],
    ['합계가 안전한 정수를 넘음', ['summary', 'patients'], Number.MAX_SAFE_INTEGER + 2],
    ['날짜별 칸이 모자람', ['days', 0], ['20260901', 1, 1]],
    ['날짜별 날짜 모양', ['days', 0, 0], '2026-09-01'],
    ['날짜별 없는 날', ['days', 0, 0], '20260230'],
    ['날짜별 기간 밖', ['days', 0, 0], '20260831'],
    ['날짜별 숫자가 음수', ['days', 0, 1], -1],
    ['처방 이름 칸이 더 있음', ['codes', 0], ['MM042', '이름', 'x']],
    ['처방 이름의 코드가 빔', ['codes', 0, 0], ''],
    ['처방 이름의 코드가 41자', ['codes', 0, 0], 'M'.repeat(41)],
    ['처방 이름이 null', ['codes', 0, 1], null],
    ['줄이 객체', ['rows', 0], { chart: chart(1) }],
    ['줄이 3칸', ['rows', 0], [chart(1), '20260901', 'MM042']],
    ['줄이 5칸', ['rows', 0], [chart(1), '20260901', 'MM042', '20260901', '가짜']],
    ['차트번호가 숫자', ['rows', 0, 0], Number(chart(1))],
    ['차트번호가 빔', ['rows', 0, 0], ''],
    ['차트번호가 공백뿐', ['rows', 0, 0], '   '],
    ['진료일 모양', ['rows', 0, 1], '2026-09-01'],
    ['진료일이 없는 날', ['rows', 0, 1], '20260230'],
    ['진료일이 null', ['rows', 0, 1], null],
    ['진료일이 기간 앞', ['rows', 0, 1], '20260831'],
    ['진료일이 기간 뒤', ['rows', 0, 1], '20261102'],
    ['처방코드가 빔', ['rows', 0, 2], ''],
    ['처방코드가 41자', ['rows', 0, 2], 'M'.repeat(41)],
    ['처방코드가 숫자', ['rows', 0, 2], 42],
    ['첫 내원일이 숫자', ['rows', 0, 3], 20260901],
    ['첫 내원일 모양', ['rows', 0, 3], '2026-09-01'],
    ['첫 내원일이 없는 날', ['rows', 0, 3], '20260230'],
    ['첫 내원일이 진료일보다 뒤', ['rows', 0, 3], '20260902'],
    ['한 환자의 첫 내원일이 둘', ['rows', 1, 3], '20260815'],
    ['한 환자의 첫 내원일이 null과 날짜', ['rows', 1, 3], null],
    ['첫 내원일 null인데 합계 noFirst가 0', ['rows'], [[chart(1), '20260901', 'MM042', null]]],
    ['보고 열쇠가 더 있음', ['report', 'extra'], []],
    ['일일이 한 벌', ['report', 'daily'], [okSet(TO)]],
    ['월말이 세 벌', ['report', 'monthly'], [okSet('2026-11'), okSet('2026-10'), okSet('2026-09')]],
    ['일일 기간이 to가 아님', ['report', 'daily', 0, 'period'], '2026-10-30'],
    ['일일 둘째 기간이 to-1이 아님', ['report', 'daily', 1, 'period'], TO],
    ['월말 기간이 to가 든 달이 아님', ['report', 'monthly', 0, 'period'], '2026-10'],
    ['월말 둘째 기간이 앞 달이 아님', ['report', 'monthly', 1, 'period'], '2026-09'],
    ['벌 열쇠가 더 있음', ['report', 'daily', 0, 'extra'], 1],
    ['벌 숫자 칸이 없음', ['report', 'daily', 0, 'cashAmount'], DROP],
    ['금액이 10^14를 넘음', ['report', 'daily', 0, 'totalAmount'], AMOUNT_LIMIT + 1],
    ['금액이 -10^14 아래', ['report', 'daily', 0, 'totalAmount'], -(AMOUNT_LIMIT + 1)],
    ['금액이 소수', ['report', 'monthly', 0, 'cardAmount'], 0.5],
    ['재진이 음수', ['report', 'monthly', 1, 'returnPatients'], -1],
    ['치료 열쇠가 없음', ['report', 'daily', 0, 'treatments', 'cryo'], DROP],
    ['치료 열쇠가 더 있음', ['report', 'daily', 0, 'treatments', 'extra'], 1],
    ['치료 숫자가 음수', ['report', 'daily', 0, 'treatments', 'manual'], -1],
    ['LA 건수가 음수', ['report', 'daily', 0, 'laCodes', 0, 'count'], -1],
    ['LA 코드가 빔', ['report', 'daily', 0, 'laCodes', 0, 'code'], ''],
    ['LA 열쇠가 더 있음', ['report', 'daily', 0, 'laCodes', 0, 'extra'], 1],
    ['확인 필요가 글자', ['report', 'daily', 0, 'financeUnconfirmed'], 'false'],
    ['확인 사유가 숫자', ['report', 'daily', 0, 'financeUnconfirmedReason'], 1],
    ['안내 글이 숫자', ['report', 'daily', 0, 'notes'], [1]],
    ['ok가 글자', ['report', 'daily', 0, 'ok'], 'true'],
    ['못 만든 벌에 숫자가 있음', ['report', 'daily', 1], { ok: false, period: '2026-10-31', reason: 'x', totalVisits: 1 }],
    ['못 만든 벌의 이유가 없음', ['report', 'daily', 1], { ok: false, period: '2026-10-31' }],
  ])('E-BRIDGE-BAD-REPLY: %s', (_name, path, value) => {
    expect(codeOf(() => parseStatsRows(changed(path, value), REQ))).toBe(BAD_REPLY)
  })

  it.each([
    ['JSON이 아님', '{"v":1,'],
    ['빈 글자', ''],
    ['null', 'null'],
    ['배열', '[]'],
    ['글자', '"x"'],
  ])('E-BRIDGE-BAD-REPLY: %s', (_name, text) => {
    expect(codeOf(() => parseStatsRows(text, REQ))).toBe(BAD_REPLY)
  })

  it('요청과 기간이 다르면 거절한다(자료는 그대로, 요청만 다름)', () => {
    const text = JSON.stringify(good())
    expect(codeOf(() => parseStatsRows(text, { from: FROM, to: '2026-10-31' }))).toBe(BAD_REPLY)
  })

  it('차트번호 앞뒤 공백은 같은 환자다: 첫 내원일이 다르면 거절한다', () => {
    const text = changed(['rows'], [
      [`${chart(1)} `, '20260901', 'MM042', '20260901'],
      [chart(1), '20260902', 'MM042', '20260815'],
    ])
    expect(codeOf(() => parseStatsRows(text, REQ))).toBe(BAD_REPLY)
  })

  it('줄 수는 700,000까지 받고 하나 넘으면 거절한다', SLOW, () => {
    expect(MAX_STATS_ROWS).toBe(700_000)
    const row = [chart(1), '20260901', 'MM042', '20260901']
    const full = parseStatsRows(changed(['rows'], Array(MAX_STATS_ROWS).fill(row)), REQ)
    expect(full.rows).toHaveLength(MAX_STATS_ROWS)
    expect(codeOf(() => parseStatsRows(changed(['rows'], Array(MAX_STATS_ROWS + 1).fill(row)), REQ))).toBe(BAD_REPLY)
  })

  it('오류에 자료가 섞이지 않는다', () => {
    const text = changed(['rows', 0, 1], chart(7))
    let error: unknown
    try {
      parseStatsRows(text, REQ)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(StatsDataError)
    expect((error as Error).message).toBe(BAD_REPLY)
    expect(String((error as Error).stack)).not.toContain(chart(7))
  })
})

describe('AC-505.2 금액 6칸은 음수도 되고 절댓값 10^14까지, 건수는 0 이상', () => {
  const AMOUNTS = ['totalAmount', 'insurerAmount', 'noncoveredAmount', 'cashAmount', 'cardAmount', 'transferAmount'] as const

  it('음수 금액이 든 벌은 받아들이고 값은 그대로다. 진료 줄과 다른 벌도 그대로다', () => {
    const draft = good()
    AMOUNTS.forEach((field, i) => {
      draft.report.daily[0][field] = -(i + 1) * 1_000
    })
    const data = parseStatsRows(JSON.stringify(draft), REQ)
    expect(AMOUNTS.map((field) => (data.report.daily[0] as unknown as Record<string, number>)[field])).toEqual([
      -1_000, -2_000, -3_000, -4_000, -5_000, -6_000,
    ])
    expect(data.report.daily[0]).toEqual(draft.report.daily[0])
    expect(data.rows).toEqual(good().rows)
    expect(data.report.daily[1]).toEqual(good().report.daily[1])
    expect(data.report.monthly).toEqual(good().report.monthly)
  })

  it.each(AMOUNTS)('%s: 정확히 +10^14와 -10^14는 받는다', (field) => {
    for (const value of [AMOUNT_LIMIT, -AMOUNT_LIMIT]) {
      const data = parseStatsRows(changed(['report', 'monthly', 1, field], value), REQ)
      expect((data.report.monthly[1] as unknown as Record<string, number>)[field]).toBe(value)
    }
  })

  it.each(AMOUNTS)('%s: 10^14를 넘거나 정수가 아니면 거절한다', (field) => {
    for (const value of [AMOUNT_LIMIT + 1, -(AMOUNT_LIMIT + 1), -0.5, '-1', null]) {
      expect(codeOf(() => parseStatsRows(changed(['report', 'daily', 1, field], value), REQ))).toBe(BAD_REPLY)
    }
  })

  it.each(['totalVisits', 'newPatients', 'returnPatients'])('%s: 건수는 음수면 거절한다', (field) => {
    expect(codeOf(() => parseStatsRows(changed(['report', 'daily', 0, field], -1), REQ))).toBe(BAD_REPLY)
  })
})

describe('AC-505.3 toConsumptionRows: 도우미 줄 → ConsumptionRow', () => {
  const twoPatients = () =>
    parseStatsRows(
      JSON.stringify({
        ...good(),
        summary: { visits: 3, patients: 3, newPatients: 1, noChart: 0, duplicate: 0, noFirst: 1 },
        codes: [['MM042', '표층열치료']],
        rows: [
          [chart(1), '20260901', 'MM042', '20260901'],
          [chart(1), '20260902', 'B4001', '20260901'],
          [chart(2), '20260902', 'MM042', '20250101'],
          [chart(3), '20260903', 'MM042', null],
        ],
      }),
      REQ,
    )

  it('첫 내원일 = 진료일이면 신환, 외래, 동네 없음, 유형 없음, 이름은 codes(없으면 코드), 번호는 PatientIds', () => {
    const ids = createPatientIds()
    const patientOne = ids.idOf(chart(1))
    const patientTwo = ids.idOf(chart(2))
    const patientThree = ids.idOf(chart(3))
    const base = { rxType: '', outpatient: true, region: null }
    expect(toConsumptionRows(twoPatients(), ids)).toEqual([
      { ...base, rxCode: 'MM042', rxName: '표층열치료', date: '2026-09-01', firstVisit: true, patient: patientOne },
      { ...base, rxCode: 'B4001', rxName: 'B4001', date: '2026-09-02', firstVisit: false, patient: patientOne },
      { ...base, rxCode: 'MM042', rxName: '표층열치료', date: '2026-09-02', firstVisit: false, patient: patientTwo },
      { ...base, rxCode: 'MM042', rxName: '표층열치료', date: '2026-09-03', firstVisit: false, patient: patientThree }, // 첫 내원 null = 신환 아님
    ])
  })

  it('처방 이름이 빈 글자면 코드를 이름으로 쓴다', () => {
    const data = parseStatsRows(changed(['codes', 0], ['MM042', '']), REQ)
    expect(toConsumptionRows(data, createPatientIds())[0].rxName).toBe('MM042')
  })

  it('바꾼 줄에 차트번호 글자가 없다', () => {
    expect(JSON.stringify(toConsumptionRows(twoPatients(), createPatientIds()))).not.toContain(chart(1))
  })

  it('toVisitRows: 메모리 번호·YYYY-MM-DD. 첫 내원일 없음은 빈 글자(어떤 날과도 같지 않고 어떤 기간 첫날보다 앞이라 신환이 아니다)', () => {
    const ids = createPatientIds()
    const patientOne = ids.idOf(chart(1))
    const patientThree = (ids.idOf(chart(2)), ids.idOf(chart(3)))
    const rows = toVisitRows(twoPatients(), ids)
    expect(rows[0]).toEqual({ p: patientOne, d: '2026-09-01', c: 'MM042', f: '2026-09-01' })
    expect(rows[3]).toEqual({ p: patientThree, d: '2026-09-03', c: 'MM042', f: '' })
    expect(JSON.stringify(rows)).not.toContain(chart(1))
  })
})

// 동네만 뺀다(도우미 길에는 동네가 없다)
function withoutRegions(aggregates: Aggregates) {
  const strip = (buckets: Aggregates['day']) =>
    buckets.map((bucket) => ({
      ...bucket,
      regions: [],
      rx: bucket.rx.map((x) => ({ ...x, regions: [] })),
    }))
  return { day: strip(aggregates.day), week: strip(aggregates.week), month: strip(aggregates.month) }
}

// 가짜 파일 하나 → 같은 줄을 두 길로.
// 도우미 SQL은 외래만 읽고 신환·재진을 첫 내원일로 정하며 유형 칸을 읽지 않는다. 그래서 두 길에 넣는 줄을 이것으로 맞춘다:
// 입원 줄·초재진 값이 표에 없는 줄은 뺀다. 파일 길의 유형 칸(없어도 되는 칸)은 지운다
function sameLinesBothWays() {
  const read = readGrid(new Uint8Array(readFileSync(join(FAKE_DIR, 'fake-utf8.csv'))))
  if (!read.ok) throw new Error(read.code)
  const headerAt = findHeaderRow(read.value)
  const header = read.value[headerAt]
  const at = (name: string) => {
    const found = header.indexOf(name)
    if (found === -1) throw new Error(name)
    return found
  }
  const textOf = (row: readonly Cell[], name: string) => String(row[at(name)] ?? '').trim()
  const lines = read.value.slice(headerAt + 1).filter((row) => {
    const visit = textOf(row, '초재진구분')
    return isYmd(textOf(row, '처방일자')) && textOf(row, '외래/입원') === '외래' && (visit === '신환' || visit === '재진')
  })

  const withoutType = (row: Cell[]) => row.filter((_, i) => i !== at('유형'))
  const file = parseBitGrid(
    [...read.value.slice(0, headerAt), withoutType(header), ...lines.map(withoutType)],
    createPatientIds(),
  )
  if (!file.ok) throw new Error(file.code)

  const compact = (date: string) => date.replaceAll('-', '')
  // 신환 줄이 남은 환자는 그날이 첫 내원일, 없으면(옛 환자) 기간보다 앞날
  const firsts = new Map<string, string>()
  const codes = new Map<string, string>()
  const seen = new Set<string>()
  const rows: [string, string, string, string][] = []
  for (const row of lines) {
    if (textOf(row, '초재진구분') === '신환') firsts.set(textOf(row, '차트번호'), compact(textOf(row, '처방일자')))
    codes.set(textOf(row, '처방코드'), textOf(row, '처방명칭'))
  }
  for (const row of lines) {
    const [person, day, code] = [textOf(row, '차트번호'), compact(textOf(row, '처방일자')), textOf(row, '처방코드')]
    // SQL처럼 환자·날·코드 한 줄씩(SELECT DISTINCT)
    const key = `${person}|${day}|${code}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push([person, day, code, firsts.get(person) ?? '20250101'])
  }
  rows.sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1)) // SQL의 ORDER BY처럼 환자 순

  const [from, to] = ['2026-09-01', '2026-10-24']
  const text = JSON.stringify({
    v: 1,
    from,
    to,
    summary: { visits: rows.length, patients: firsts.size, newPatients: firsts.size, noChart: 0, duplicate: 0, noFirst: 0 },
    days: [],
    codes: [...codes],
    rows,
    report: reportOf(to),
  })
  return { fileRows: file.value.rows, text, range: { from, to }, lineCount: lines.length }
}

describe('AC-505.3 파일 길과 도우미 길의 결과가 같다(동네 빼고)', () => {
  it('fixtures/fake-bit 가짜 파일 → parseBit → aggregate = 같은 줄의 도우미 JSON → toConsumptionRows → aggregate', SLOW, () => {
    const { fileRows, text, range, lineCount } = sameLinesBothWays()
    expect(lineCount).toBeGreaterThan(2000) // 빈 비교로 통과하지 않게
    const fromFile = aggregate(fileRows)
    const fromHelper = aggregate(toConsumptionRows(parseStatsRows(text, range), createPatientIds()))

    expect(fromFile.day.length).toBeGreaterThan(30)
    expect(fromFile.month.reduce((sum, bucket) => sum + bucket.totals.newPatients, 0)).toBeGreaterThan(100)
    expect(fromFile.month.reduce((sum, bucket) => sum + bucket.totals.returning, 0)).toBeGreaterThan(100)
    expect(fromFile.month.reduce((sum, bucket) => sum + bucket.revisit.cohort, 0)).toBeGreaterThan(100)
    expect(withoutRegions(fromHelper)).toEqual(withoutRegions(fromFile))
  })
})
