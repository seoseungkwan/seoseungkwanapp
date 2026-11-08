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
import {
  MAX_STATS_ROWS,
  parseStatsRows,
  toConsumptionRows,
  toFirstVisits,
  toPatientDays,
  toStatsExtra,
  toVisitRows,
} from './helperData'

const FROM = '2026-09-01'
const TO = '2026-11-01'
const REQ = { from: FROM, to: TO }
const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
const CHANGED = 'E-STATS-CHANGED'
const SLOW = { timeout: 60_000 }
const AMOUNT_LIMIT = 10 ** 14
const FAKE_DIR = fileURLToPath(new URL('../../../fixtures/fake-bit/', import.meta.url))

// 가짜 차트번호(9로 시작하는 6자리). 소스에 통째로 쓰지 않고 이어 만든다
const chart = (n: number) => '9' + String(n).padStart(5, '0')

type HelperRow = readonly [person: string, day: string, code: string, first: string | null]

// 진료 줄이 있는 환자·날마다 접수 한 건(처방 없는 접수가 없는 답)
function receptionsOf(rows: readonly HelperRow[]): [string, string, number, string | null][] {
  const lines = new Map<string, [string, string, number, string | null]>()
  for (const [person, day, , first] of rows) lines.set(`${person}|${day}`, [person, day, 1, first])
  return [...lines.values()]
}

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
  v: 2,
  from: FROM,
  to: TO,
  summary: { visits: 2, patients: 1, newPatients: 1, noChart: 0, duplicate: 0, noFirst: 0 },
  days: [
    ['20260901', 1, 1, 1],
    ['20260902', 1, 1, 0],
  ],
  patientDays: [
    [chart(1), '20260901', 1, '20260901'],
    [chart(1), '20260902', 1, '20260901'],
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
    const draft = JSON.parse(changed(path, value)) as { summary: { noFirst: number }; rows: HelperRow[]; patientDays: unknown }
    if (name.includes('null')) draft.summary.noFirst = 1
    draft.patientDays = receptionsOf(draft.rows) // 진료 줄을 바꾼 자리는 접수 줄도 같이 맞춘다(어긋남은 아래 E-STATS-CHANGED에서 본다)
    expect(() => parseStatsRows(JSON.stringify(draft), REQ)).not.toThrow()
  })

  it.each<[string, ReadonlyArray<string | number>, unknown]>([
    ['맨 위 열쇠가 더 있음', ['extra'], 1],
    ['맨 위 열쇠가 없음', ['days'], DROP],
    ['버전이 1(옛 도우미)', ['v'], 1],
    ['버전이 3', ['v'], 3],
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

describe('AC-505.2 접수 줄 patientDays의 모양', () => {
  it.each<[string, ReadonlyArray<string | number>, unknown]>([
    ['열쇠가 없음', ['patientDays'], DROP],
    ['배열이 아님', ['patientDays'], {}],
    ['null', ['patientDays'], null],
    ['줄이 객체', ['patientDays', 0], { chart: chart(1) }],
    ['줄이 3칸', ['patientDays', 0], [chart(1), '20260901', 1]],
    ['줄이 5칸', ['patientDays', 0], [chart(1), '20260901', 1, '20260901', '가짜']],
    ['차트번호가 숫자', ['patientDays', 0, 0], Number(chart(1))],
    ['차트번호가 빔', ['patientDays', 0, 0], ''],
    ['차트번호가 공백뿐', ['patientDays', 0, 0], '   '],
    ['진료일 모양', ['patientDays', 0, 1], '2026-09-01'],
    ['진료일이 없는 날', ['patientDays', 0, 1], '20260230'],
    ['진료일이 null', ['patientDays', 0, 1], null],
    ['진료일이 기간 앞', ['patientDays', 0, 1], '20260831'],
    ['진료일이 기간 뒤', ['patientDays', 0, 1], '20261102'],
    ['접수 건수 0', ['patientDays', 0, 2], 0],
    ['접수 건수가 음수', ['patientDays', 0, 2], -1],
    ['접수 건수가 소수', ['patientDays', 0, 2], 1.5],
    ['접수 건수가 글자', ['patientDays', 0, 2], '1'],
    ['접수 건수가 안전한 정수를 넘음', ['patientDays', 0, 2], Number.MAX_SAFE_INTEGER + 2],
    ['첫 내원일이 숫자', ['patientDays', 0, 3], 20260901],
    ['첫 내원일 모양', ['patientDays', 0, 3], '2026-09-01'],
    ['첫 내원일이 없는 날', ['patientDays', 0, 3], '20260230'],
    ['첫 내원일이 진료일보다 뒤', ['patientDays', 0, 3], '20260902'],
    ['같은 환자·날 두 줄', ['patientDays', 1, 1], '20260901'],
    ['앞뒤 공백만 다른 같은 환자·날 두 줄', ['patientDays', 1], [` ${chart(1)}`, '20260901', 1, '20260901']],
    ['한 배열 안에서 한 환자의 첫 내원일이 둘', ['patientDays', 1, 3], '20260815'],
    ['한 배열 안에서 한 환자의 첫 내원일이 null과 날짜', ['patientDays', 1, 3], null],
  ])('E-BRIDGE-BAD-REPLY이고 E-STATS-CHANGED가 아니다: %s', (_name, path, value) => {
    expect(codeOf(() => parseStatsRows(changed(path, value), REQ))).toBe(BAD_REPLY)
  })

  it('줄 수는 700,000까지 받고 하나 넘으면 거절한다', SLOW, () => {
    // 가짜 환자 100,000명(9로 시작하는 6자리) × 날 여덟, 환자·날마다 한 줄이라 줄 수 말고는 맞는 답이다
    const text = (count: number) =>
      JSON.stringify({
        ...good(),
        rows: [],
        patientDays: Array.from({ length: count }, (_, i) => [chart(i % 100_000), `2026090${1 + Math.floor(i / 100_000)}`, 1, '20260901']),
      })
    expect(parseStatsRows(text(MAX_STATS_ROWS), REQ).patientDays).toHaveLength(MAX_STATS_ROWS)
    expect(codeOf(() => parseStatsRows(text(MAX_STATS_ROWS + 1), REQ))).toBe(BAD_REPLY)
  })

  it('처방 없는 접수(patientDays에만 있는 환자·날)는 받아들인다', () => {
    const noRx = [
      [chart(1), '20260905', 1, '20260901'], // 진료 줄이 있는 환자의 처방 없는 날
      [chart(2), '20260903', 1, '20250101'], // 진료 줄이 아예 없는 환자
    ]
    const data = parseStatsRows(JSON.stringify({ ...good(), patientDays: [...good().patientDays, ...noRx] }), REQ)
    expect(data.patientDays).toHaveLength(4)
    expect(data.rows).toHaveLength(2)
  })

  it('같은 환자·날의 접수 여러 건은 한 줄의 건수로 받는다', () => {
    const data = parseStatsRows(changed(['patientDays', 0, 2], 2), REQ)
    expect(data.patientDays[0][2]).toBe(2)
  })

  it('차트번호 앞뒤 공백은 두 배열 사이에서도 같은 환자다', () => {
    const data = parseStatsRows(changed(['patientDays', 0, 0], ` ${chart(1)} `), REQ)
    expect(data.patientDays).toHaveLength(2)
  })

  it('days와는 대조하지 않는다: 날짜별 합계와 달라도 받는다', () => {
    expect(() => parseStatsRows(changed(['days'], [['20260905', 9, 9, 9]]), REQ)).not.toThrow()
    expect(() => parseStatsRows(changed(['days'], []), REQ)).not.toThrow()
  })

  // 첫 내원일이 더 이른 날이라 '첫 내원일 ≤ 진료일'로는 걸리지 않는다. 기간 첫날만 이 줄을 막는다
  it.each<[string, Record<string, unknown>]>([
    ['접수 줄', { rows: [], patientDays: [[chart(1), '20260831', 1, '20250101']] }],
    ['진료 줄', { rows: [[chart(1), '20260831', 'MM042', '20250101']], patientDays: [] }],
  ])('%s의 진료일이 기간 앞이면 첫 내원일이 더 일러도 E-BRIDGE-BAD-REPLY다', (_name, over) => {
    expect(codeOf(() => parseStatsRows(JSON.stringify({ ...good(), ...over }), REQ))).toBe(BAD_REPLY)
  })

  it('차트번호 앞뒤 공백이 rows에만 있어도 두 배열 사이에서 같은 환자다', () => {
    const rows = [
      [` ${chart(1)} `, '20260901', 'MM042', '20260901'],
      [chart(1), '20260902', 'MM042', '20260901'],
    ]
    const data = parseStatsRows(JSON.stringify({ ...good(), rows }), REQ)
    expect(data.rows).toHaveLength(2)
  })
})

describe('AC-505.2 두 배열이 어긋나면 E-STATS-CHANGED', () => {
  const answer = (over: Record<string, unknown>) => JSON.stringify({ ...good(), ...over })

  it.each<[string, Record<string, unknown>]>([
    ['rows의 환자가 patientDays에 없음', { patientDays: [[chart(2), '20260901', 1, '20260901']] }],
    ['rows의 환자는 있는데 그날이 patientDays에 없음', { patientDays: [[chart(1), '20260901', 1, '20260901']] }],
    ['patientDays가 비었음', { patientDays: [] }],
    [
      '두 배열에서 첫 내원일이 다름',
      {
        patientDays: [
          [chart(1), '20260901', 1, '20250101'],
          [chart(1), '20260902', 1, '20250101'],
        ],
      },
    ],
    [
      '첫 내원일이 rows는 날짜, patientDays는 null',
      {
        summary: { ...good().summary, noFirst: 1 },
        patientDays: [
          [chart(1), '20260901', 1, null],
          [chart(1), '20260902', 1, null],
        ],
      },
    ],
    [
      '첫 내원일이 rows는 null, patientDays는 날짜',
      {
        summary: { ...good().summary, noFirst: 1 },
        rows: [[chart(1), '20260901', 'MM042', null]],
      },
    ],
  ])('%s: E-STATS-CHANGED이고 E-BRIDGE-BAD-REPLY가 아니다', (_name, over) => {
    expect(codeOf(() => parseStatsRows(answer(over), REQ))).toBe(CHANGED)
  })

  it.each<[string, Record<string, unknown>]>([
    [
      '접수 줄 모양이 틀림',
      {
        patientDays: [
          [chart(1), '20260901', 0, '20260901'],
          [chart(2), '20260901', 1, '20260901'],
        ],
      },
    ],
    ['진료 줄 모양이 틀림', { rows: [[chart(1), '20260901', '', '20260901']], patientDays: [] }],
    ['보고 모양이 틀림', { patientDays: [], report: { ...reportOf(TO), daily: [] } }],
    ['합계 모양이 틀림', { patientDays: [], summary: { ...good().summary, noChart: -1 } }],
  ])('어긋난 데다 %s이면 모양을 먼저 봐서 E-BRIDGE-BAD-REPLY다', (_name, over) => {
    expect(codeOf(() => parseStatsRows(answer(over), REQ))).toBe(BAD_REPLY)
  })

  it('대조를 먼저 본다: 어긋난 답은 noFirst를 넘어도 E-STATS-CHANGED다', () => {
    // 첫 내원일 null인 환자가 하나인데 noFirst는 0이다. 이 답은 두 배열도 어긋난다
    const text = answer({ rows: [[chart(1), '20260901', 'MM042', null]] })
    expect(codeOf(() => parseStatsRows(text, REQ))).toBe(CHANGED)
  })

  it('오류에 자료가 섞이지 않는다', () => {
    let error: unknown
    try {
      parseStatsRows(answer({ patientDays: [] }), REQ)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(StatsDataError)
    expect((error as Error).message).toBe(CHANGED)
    expect(String((error as Error).stack)).not.toContain(chart(1))
  })
})

describe('AC-505.2 첫 내원일 null인 환자 수는 두 배열의 환자를 모두 세어 noFirst 이하', () => {
  const answer = (noFirst: number, rows: readonly HelperRow[], patientDays: readonly unknown[]) =>
    JSON.stringify({ ...good(), summary: { ...good().summary, noFirst }, rows, patientDays })
  const nullRow: HelperRow = [chart(1), '20260901', 'MM042', null]
  const nullDay = [chart(1), '20260901', 1, null]

  it('두 배열에 다 나온 환자는 한 명이다', () => {
    expect(() => parseStatsRows(answer(1, [nullRow], [nullDay, [chart(1), '20260902', 1, null]]), REQ)).not.toThrow()
    expect(codeOf(() => parseStatsRows(answer(0, [nullRow], [nullDay]), REQ))).toBe(BAD_REPLY)
  })

  it('patientDays에만 있는 환자도 센다', () => {
    const onlyDay = [chart(2), '20260903', 1, null]
    expect(() => parseStatsRows(answer(1, [], [onlyDay]), REQ)).not.toThrow()
    expect(codeOf(() => parseStatsRows(answer(0, [], [onlyDay]), REQ))).toBe(BAD_REPLY)
    expect(() => parseStatsRows(answer(2, [nullRow], [nullDay, onlyDay]), REQ)).not.toThrow()
    expect(codeOf(() => parseStatsRows(answer(1, [nullRow], [nullDay, onlyDay]), REQ))).toBe(BAD_REPLY)
  })

  it('앞뒤 공백만 다른 환자는 한 명이다', () => {
    const rows: HelperRow[] = [[` ${chart(1)} `, '20260901', 'MM042', null]]
    const patientDays = [
      [chart(1), '20260901', 1, null],
      [` ${chart(1)}`, '20260902', 1, null],
    ]
    expect(() => parseStatsRows(answer(1, rows, patientDays), REQ)).not.toThrow()
    expect(codeOf(() => parseStatsRows(answer(0, rows, patientDays), REQ))).toBe(BAD_REPLY)
  })

  it('줄 없는 환자도 합계에 들므로 합계가 더 커도 받는다', () => {
    expect(() => parseStatsRows(answer(5, [nullRow], [nullDay]), REQ)).not.toThrow()
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
  const twoPatientRows: HelperRow[] = [
    [chart(1), '20260901', 'MM042', '20260901'],
    [chart(1), '20260902', 'B4001', '20260901'],
    [chart(2), '20260902', 'MM042', '20250101'],
    [chart(3), '20260903', 'MM042', null],
  ]
  const twoPatients = () =>
    parseStatsRows(
      JSON.stringify({
        ...good(),
        summary: { visits: 3, patients: 3, newPatients: 1, noChart: 0, duplicate: 0, noFirst: 1 },
        codes: [['MM042', '표층열치료']],
        rows: twoPatientRows,
        patientDays: receptionsOf(twoPatientRows),
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

describe('AC-505.3 toPatientDays: 접수 줄 → PatientDay', () => {
  const lines = () =>
    parseStatsRows(
      JSON.stringify({
        ...good(),
        summary: { ...good().summary, noFirst: 1 },
        rows: [[chart(1), '20260901', 'MM042', '20260901']],
        patientDays: [
          [chart(1), '20260901', 2, '20260901'],
          [` ${chart(1)} `, '20260902', 1, '20260901'],
          [chart(2), '20260902', 3, '20250101'],
          [chart(3), '20260903', 1, null],
        ],
      }),
      REQ,
    )

  it('환자는 PatientIds 번호, 날짜는 YYYY-MM-DD, 건수는 그대로, 첫 내원일 = 진료일이면 firstVisit, null이면 아니다', () => {
    const ids = createPatientIds()
    const [one, two, three] = [ids.idOf(chart(1)), ids.idOf(chart(2)), ids.idOf(chart(3))]
    expect(toPatientDays(lines(), ids)).toEqual([
      { patient: one, date: '2026-09-01', receptions: 2, firstVisit: true },
      { patient: one, date: '2026-09-02', receptions: 1, firstVisit: false },
      { patient: two, date: '2026-09-02', receptions: 3, firstVisit: false },
      { patient: three, date: '2026-09-03', receptions: 1, firstVisit: false },
    ])
  })

  it('진료 줄과 같은 ids를 넘기면 같은 환자는 같은 번호다', () => {
    const ids = createPatientIds()
    const data = lines()
    expect(toPatientDays(data, ids)[0].patient).toBe(toConsumptionRows(data, ids)[0].patient)
  })

  it('바꾼 줄에 차트번호 글자가 없다', () => {
    expect(JSON.stringify(toPatientDays(lines(), createPatientIds()))).not.toContain(chart(1))
  })
})

describe('AC-505.4 접수 줄을 넘긴 aggregate의 주·달 totals는 일 칸의 합이다', () => {
  it('한 주·한 달에 여러 번 온 환자는 그 횟수만큼 든다', () => {
    const rows: HelperRow[] = [
      [chart(1), '20260901', 'MM042', '20260901'],
      [chart(1), '20260902', 'MM042', '20260901'],
      [chart(2), '20260902', 'MM042', '20250101'],
    ]
    const data = parseStatsRows(
      JSON.stringify({
        ...good(),
        rows,
        patientDays: [
          [chart(1), '20260901', 1, '20260901'],
          [chart(1), '20260902', 2, '20260901'],
          [chart(2), '20260902', 1, '20250101'],
        ],
      }),
      REQ,
    )
    const ids = createPatientIds()
    const { day, week, month } = aggregate(toConsumptionRows(data, ids), [], toPatientDays(data, ids))
    expect(day.map((bucket) => bucket.totals.patients)).toEqual([1, 3])
    expect(week.map((bucket) => bucket.totals)).toEqual([{ patients: 4, newPatients: 1, returning: 3, unknown: 0 }])
    expect(month.map((bucket) => bucket.totals)).toEqual([{ patients: 4, newPatients: 1, returning: 3, unknown: 0 }])
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
    v: 2,
    from,
    to,
    summary: { visits: rows.length, patients: firsts.size, newPatients: firsts.size, noChart: 0, duplicate: 0, noFirst: 0 },
    days: [],
    patientDays: receptionsOf(rows), // 도우미 JSON은 환자·날마다 접수 한 건이고 처방 없는 접수가 없다
    codes: [...codes],
    rows,
    report: reportOf(to),
  })
  return { fileRows: file.value.rows, text, range: { from, to }, lineCount: lines.length }
}

describe('AC-505.3 파일 길과 도우미 길의 결과가 같다(동네 빼고)', () => {
  it('fixtures/fake-bit 가짜 파일 → parseBit → aggregate = 같은 줄의 도우미 JSON → toConsumptionRows·toPatientDays → aggregate(일·주·월)', SLOW, () => {
    const { fileRows, text, range, lineCount } = sameLinesBothWays()
    expect(lineCount).toBeGreaterThan(2000) // 빈 비교로 통과하지 않게
    const fromFile = aggregate(fileRows)
    const data = parseStatsRows(text, range)
    const ids = createPatientIds()
    const fromHelper = aggregate(toConsumptionRows(data, ids), [], toPatientDays(data, ids))

    expect(fromFile.day.length).toBeGreaterThan(30)
    expect(fromFile.month.reduce((sum, bucket) => sum + bucket.totals.newPatients, 0)).toBeGreaterThan(100)
    expect(fromFile.month.reduce((sum, bucket) => sum + bucket.totals.returning, 0)).toBeGreaterThan(100)
    expect(fromFile.month.reduce((sum, bucket) => sum + bucket.revisit.cohort, 0)).toBeGreaterThan(100)
    expect(withoutRegions(fromHelper)).toEqual(withoutRegions(fromFile))
  })
})

// ── v3 답(stats-bit-sections): v2 열쇠 그대로 + visits·people·doctors·doctorDays ──
// 접수 줄 [차트번호|null, 진료일, 접수 시각 HHmm|null, 보험 이름|null, 진료의 코드|null] · 사람 줄 [차트번호, 생년월일|null, 주소 앞부분|null]
// 원장님 줄 [코드, 이름|null] · 날·원장님 금액 [수납일, 진료의 코드, 총진료비]. 이름·주소·금액은 모두 지어낸 값이다

const goodV3 = () => ({
  ...good(),
  v: 3,
  visits: [
    [chart(1), '20260901', '0930', '건강보험', 'D01'],
    [chart(1), '20260902', null, null, null],
    [null, '20260902', '1405', '자동차보험', 'D01'],
  ],
  people: [[chart(1), '19800505', '경기 수원시 영통구 가람동']],
  doctors: [
    ['D01', '김가상'],
    ['D02', null],
  ],
  doctorDays: [
    ['20260901', 'D01', 120_000],
    ['20260902', 'D02', -5_000],
  ],
})

// goodV3()의 한 자리만 바꾼 JSON 글자
function changedV3(path: ReadonlyArray<string | number>, value: unknown): string {
  const draft = goodV3() as unknown
  let at = draft as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (value === DROP) Reflect.deleteProperty(at, last)
  else at[last] = value
  return JSON.stringify(draft)
}

describe('AC-2702.1 v2 답(옛 도우미)은 지금처럼 받는다', () => {
  it('AC-2702.1: v2 답에는 새 자료가 없고 toStatsExtra는 null이다', () => {
    const data = parseStatsRows(JSON.stringify(good()), REQ)
    expect(data.v).toBe(2)
    expect(data.extra).toBeUndefined()
    expect(toStatsExtra(data, createPatientIds())).toBeNull()
  })

  it.each(['visits', 'people', 'doctors', 'doctorDays'] as const)('AC-2702.1: v2 답에 v3 열쇠(%s)가 있으면 모르는 열쇠라 E-BRIDGE-BAD-REPLY다', (key) => {
    expect(codeOf(() => parseStatsRows(JSON.stringify({ ...good(), [key]: goodV3()[key] }), REQ))).toBe(BAD_REPLY)
  })
})

describe('AC-2708.3 v3 답의 v2 열쇠는 v2 답과 같게 읽힌다', () => {
  it('AC-2708.3: v2 열쇠의 값과 진료 줄·접수 줄 바꾸기 결과가 v2 답과 같다', () => {
    const v2 = parseStatsRows(JSON.stringify(good()), REQ)
    const v3 = parseStatsRows(JSON.stringify(goodV3()), REQ)
    const { extra, v, ...rest } = v3
    expect(v).toBe(3)
    expect(extra).toBeDefined()
    expect({ v: 2, ...rest }).toEqual(v2)
    expect(toConsumptionRows(v3, createPatientIds())).toEqual(toConsumptionRows(v2, createPatientIds()))
    expect(toPatientDays(v3, createPatientIds())).toEqual(toPatientDays(v2, createPatientIds()))
    expect(toVisitRows(v3, createPatientIds())).toEqual(toVisitRows(v2, createPatientIds()))
  })
})

describe('AC-2702.2 v3 새 열쇠 넷의 모양', () => {
  it('AC-2702.2: 맞는 v3 답은 받고 toStatsExtra가 메모리 번호·YYYY-MM-DD·접수 시로 바꾼다(차트번호 글자는 남지 않는다)', () => {
    const data = parseStatsRows(JSON.stringify(goodV3()), REQ)
    const ids = createPatientIds()
    const one = ids.idOf(chart(1))
    const extra = toStatsExtra(data, ids)
    if (extra === null) throw new Error('v3 자료가 없어요')
    expect(extra.visits).toEqual([
      { p: one, d: '2026-09-01', h: 9, ins: '건강보험', doc: 'D01' },
      { p: one, d: '2026-09-02', h: null, ins: null, doc: null },
      { p: -1, d: '2026-09-02', h: 14, ins: '자동차보험', doc: 'D01' },
    ])
    expect([...extra.people]).toEqual([[one, { birth: '1980-05-05', area: '경기 수원시 영통구 가람동' }]])
    expect([...extra.doctors]).toEqual([
      ['D01', '김가상'],
      ['D02', null],
    ])
    expect(extra.doctorDays).toEqual([
      { d: '2026-09-01', doc: 'D01', amount: 120_000 },
      { d: '2026-09-02', doc: 'D02', amount: -5_000 },
    ])
    expect(JSON.stringify({ visits: extra.visits, people: [...extra.people] })).not.toContain(chart(1))
  })

  it('AC-2702.2: 차트번호 앞뒤 공백은 같은 환자다(접수 줄·사람 줄·진료 줄이 같은 번호)', () => {
    const draft = goodV3()
    draft.visits[0][0] = ` ${chart(1)} `
    draft.people[0][0] = `${chart(1)} `
    const ids = createPatientIds()
    const data = parseStatsRows(JSON.stringify(draft), REQ)
    const extra = toStatsExtra(data, ids)
    const patient = toVisitRows(data, ids)[0].p
    expect(extra?.visits[0].p).toBe(patient)
    expect([...(extra?.people.keys() ?? [])]).toEqual([patient])
  })

  it.each<[string, ReadonlyArray<string | number>, unknown]>([
    ['접수 시각 0000', ['visits', 0, 2], '0000'],
    ['접수 시각 2359', ['visits', 0, 2], '2359'],
    ['보험 이름 빈 글자', ['visits', 0, 3], ''],
    ['보험 이름 100자', ['visits', 0, 3], '가'.repeat(100)],
    ['원장님 코드 40자', ['doctors', 2], ['D'.repeat(40), null]],
    ['생년월일 없음', ['people', 0, 1], null],
    ['주소 앞부분 없음', ['people', 0, 2], null],
    ['주소 앞부분 80자', ['people', 0, 2], '가'.repeat(80)],
    ['원장님 이름 40자', ['doctors', 0, 1], '가'.repeat(40)],
    ['접수 줄에 없는 환자의 사람 줄', ['people', 1], [chart(2), null, null]],
    ['금액 +10^14', ['doctorDays', 0, 2], AMOUNT_LIMIT],
    ['금액 -10^14', ['doctorDays', 0, 2], -AMOUNT_LIMIT],
    ['금액 0', ['doctorDays', 0, 2], 0],
    ['수납일 기간 끝날', ['doctorDays', 0, 0], '20261101'],
  ])('AC-2702.2: 받는다: %s', (_name, path, value) => {
    expect(() => parseStatsRows(changedV3(path, value), REQ)).not.toThrow()
  })

  it('AC-2702.2: 받는다: 새 열쇠 넷이 모두 빈 배열', () => {
    const text = JSON.stringify({ ...goodV3(), visits: [], people: [], doctors: [], doctorDays: [] })
    expect(toStatsExtra(parseStatsRows(text, REQ), createPatientIds())).toEqual({ visits: [], people: new Map(), doctors: new Map(), doctorDays: [] })
  })

  it('AC-2702.2: 접수 시각의 앞 두 자리가 접수 시다', () => {
    const extra = toStatsExtra(parseStatsRows(changedV3(['visits', 0, 2], '2359'), REQ), createPatientIds())
    expect(extra?.visits[0].h).toBe(23)
  })

  it.each<[string, ReadonlyArray<string | number>, unknown]>([
    ['새 열쇠 doctorDays가 없음', ['doctorDays'], DROP],
    ['새 열쇠 people이 없음', ['people'], DROP],
    ['모르는 열쇠가 더 있음', ['extra'], 1],
    ['접수 줄 목록이 배열이 아님', ['visits'], {}],
    ['접수 줄 목록이 null', ['visits'], null],
    ['접수 줄이 객체', ['visits', 0], { chart: chart(1) }],
    ['접수 줄이 4칸', ['visits', 0], [chart(1), '20260901', '0930', '건강보험']],
    ['접수 줄이 6칸', ['visits', 0], [chart(1), '20260901', '0930', '건강보험', 'D01', '가짜']],
    ['접수 줄 차트번호가 숫자', ['visits', 0, 0], Number(chart(1))],
    ['접수 줄 차트번호가 빔', ['visits', 0, 0], ''],
    ['접수 줄 차트번호가 공백뿐', ['visits', 0, 0], '   '],
    ['접수 줄 차트번호가 사람 줄에 없음', ['visits', 0, 0], chart(2)],
    ['접수 줄 진료일 모양', ['visits', 0, 1], '2026-09-01'],
    ['접수 줄 진료일이 없는 날', ['visits', 0, 1], '20260230'],
    ['접수 줄 진료일이 null', ['visits', 0, 1], null],
    ['접수 줄 진료일이 기간 앞', ['visits', 0, 1], '20260831'],
    ['접수 줄 진료일이 기간 뒤', ['visits', 0, 1], '20261102'],
    ['접수 시각이 세 자리', ['visits', 0, 2], '930'],
    ['접수 시각이 다섯 자리', ['visits', 0, 2], '09300'],
    ['접수 시각이 2400', ['visits', 0, 2], '2400'],
    ['접수 시각이 숫자', ['visits', 0, 2], 930],
    ['접수 시각에 쌍점', ['visits', 0, 2], '09:3'],
    ['접수 시각이 빈 글자', ['visits', 0, 2], ''],
    ['보험 이름이 숫자', ['visits', 0, 3], 1],
    ['보험 이름이 101자', ['visits', 0, 3], '가'.repeat(101)],
    ['접수 줄 진료의 코드가 원장님 줄에 없음', ['visits', 0, 4], 'D09'],
    ['접수 줄 진료의 코드가 빔', ['visits', 0, 4], ''],
    ['접수 줄 진료의 코드가 숫자', ['visits', 0, 4], 1],
    ['사람 줄 목록이 배열이 아님', ['people'], {}],
    ['사람 줄이 2칸', ['people', 0], [chart(1), '19800505']],
    ['사람 줄이 4칸', ['people', 0], [chart(1), '19800505', null, '가짜']],
    ['사람 줄 차트번호가 null', ['people', 0, 0], null],
    ['사람 줄 차트번호가 빔', ['people', 0, 0], ''],
    ['사람 줄 차트번호가 공백뿐', ['people', 0, 0], '  '],
    ['같은 환자 두 줄(앞뒤 공백만 다름)', ['people', 1], [` ${chart(1)}`, null, null]],
    ['생년월일 모양', ['people', 0, 1], '1980-05-05'],
    ['생년월일이 없는 날', ['people', 0, 1], '19800230'],
    ['생년월일이 숫자', ['people', 0, 1], 19800505],
    ['주소 앞부분이 81자', ['people', 0, 2], '가'.repeat(81)],
    ['주소 앞부분이 숫자', ['people', 0, 2], 1],
    ['원장님 줄 목록이 배열이 아님', ['doctors'], {}],
    ['원장님 줄이 1칸', ['doctors', 0], ['D01']],
    ['원장님 줄이 3칸', ['doctors', 0], ['D01', '김가상', '가짜']],
    ['원장님 코드가 빔', ['doctors', 1, 0], ''],
    ['원장님 코드가 41자', ['doctors', 1, 0], 'D'.repeat(41)],
    ['원장님 코드가 숫자', ['doctors', 1, 0], 2],
    ['원장님 이름이 41자', ['doctors', 0, 1], '가'.repeat(41)],
    ['원장님 이름이 숫자', ['doctors', 0, 1], 1],
    ['같은 원장님 코드 두 줄', ['doctors', 1, 0], 'D01'],
    ['금액 줄 목록이 배열이 아님', ['doctorDays'], {}],
    ['금액 줄이 2칸', ['doctorDays', 0], ['20260901', 'D01']],
    ['금액 줄이 4칸', ['doctorDays', 0], ['20260901', 'D01', 1, 2]],
    ['수납일 모양', ['doctorDays', 0, 0], '2026-09-01'],
    ['수납일이 없는 날', ['doctorDays', 0, 0], '20260931'],
    ['수납일이 기간 앞', ['doctorDays', 0, 0], '20260831'],
    ['수납일이 기간 뒤', ['doctorDays', 0, 0], '20261102'],
    ['금액 진료의 코드가 원장님 줄에 없음', ['doctorDays', 0, 1], 'D09'],
    ['금액 진료의 코드가 null', ['doctorDays', 0, 1], null],
    ['금액이 소수', ['doctorDays', 0, 2], 0.5],
    ['금액이 글자', ['doctorDays', 0, 2], '120000'],
    ['금액이 null', ['doctorDays', 0, 2], null],
    ['금액이 10^14를 넘음', ['doctorDays', 0, 2], AMOUNT_LIMIT + 1],
    ['금액이 -10^14 아래', ['doctorDays', 0, 2], -(AMOUNT_LIMIT + 1)],
  ])('AC-2702.2: E-BRIDGE-BAD-REPLY: %s', (_name, path, value) => {
    expect(codeOf(() => parseStatsRows(changedV3(path, value), REQ))).toBe(BAD_REPLY)
  })

  it('AC-2702.2: 새 열쇠 모양이 틀린 데다 두 배열이 어긋나도 모양을 먼저 봐서 E-BRIDGE-BAD-REPLY다', () => {
    const text = JSON.stringify({ ...goodV3(), patientDays: [], doctorDays: [['20260901', 'D09', 1]] })
    expect(codeOf(() => parseStatsRows(text, REQ))).toBe(BAD_REPLY)
  })

  it('AC-2702.2: 새 열쇠가 맞고 두 배열이 어긋나면 지금처럼 E-STATS-CHANGED다', () => {
    expect(codeOf(() => parseStatsRows(JSON.stringify({ ...goodV3(), patientDays: [] }), REQ))).toBe(CHANGED)
  })

  it('AC-2702.2: 접수 줄 수는 700,000까지 받고 하나 넘으면 거절한다', SLOW, () => {
    const line = [chart(1), '20260901', '0930', '건강보험', 'D01']
    const full = toStatsExtra(parseStatsRows(changedV3(['visits'], Array(MAX_STATS_ROWS).fill(line)), REQ), createPatientIds())
    expect(full?.visits).toHaveLength(MAX_STATS_ROWS)
    expect(codeOf(() => parseStatsRows(changedV3(['visits'], Array(MAX_STATS_ROWS + 1).fill(line)), REQ))).toBe(BAD_REPLY)
  })

  it('AC-2702.2: 오류에 자료가 섞이지 않는다', () => {
    let error: unknown
    try {
      parseStatsRows(changedV3(['visits', 0, 0], chart(7)), REQ)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(StatsDataError)
    expect((error as Error).message).toBe(BAD_REPLY)
    expect(String((error as Error).stack)).not.toContain(chart(7))
  })
})

describe('AC-2702.2 toFirstVisits: 접수 줄의 첫 내원일 표', () => {
  it('AC-2702.2: 환자 → 첫 내원일(YYYY-MM-DD)이고 첫 내원을 못 찾은 환자는 없다', () => {
    const data = parseStatsRows(
      JSON.stringify({
        ...goodV3(),
        summary: { ...good().summary, noFirst: 1 },
        patientDays: [...good().patientDays, [chart(3), '20260903', 1, null]],
      }),
      REQ,
    )
    const ids = createPatientIds()
    const one = ids.idOf(chart(1))
    expect([...toFirstVisits(data, ids)]).toEqual([[one, '2026-09-01']])
  })
})
