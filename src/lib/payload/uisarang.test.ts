import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateDayPayload } from '@/lib/payload/validate'
import type { RevenueDayRow } from '@/types/revenue'
import type { UisAgePayload, UisFileResult, UisRxPayload, UisRxRow, UisSpan } from '@/types/uisarang'
import {
  UIS_PAYLOAD_MAX_BYTES,
  planUisSave,
  toUisDayPayload,
  uisUnitOf,
  validateUisAgePayload,
  validateUisRxPayload,
} from './uisarang'

// 의사랑 저장 모양(specs/uisarang-upload design.md §6). 순수 함수 — 환자 자료 구역 규칙 안이다.
// 처방 코드·이름은 지어낸 것이고(의원이 정한 글자 모양: 빈칸·'/' 들어감), 환자 글자는 없다

const rxRow = (code: string, over: Partial<UisRxRow> = {}): UisRxRow => ({ code, name: `${code} 처방`, qty: 1, amount: 1000, ...over })
const rxPayload = (rows: UisRxRow[] = [rxRow('CRYO 대관절'), rxRow('ESWT 1부위', { qty: 12.5 }), rxRow('carm', { qty: 0.125 })], total: number | null = 3000): UisRxPayload => ({
  v: 1,
  rows,
  total,
})
const agePayload = (over: Partial<UisAgePayload> = {}): UisAgePayload => ({
  v: 1,
  patients: 12,
  newPatients: 3,
  bands: [0, 1, 1, 2, 3, 2, 2, 1, 0, 0],
  newBands: [0, 0, 1, 0, 1, 1, 0, 0, 0, 0],
  ...over,
})

// 표가 재는 크기(octet_length(payload::text))를 jsonbText를 쓰지 않고 따로 잰다: 콤마·콜론 뒤 빈칸 하나씩.
// 아래 자료의 글자에는 콤마·콜론이 없어 JSON의 콤마·콜론 수만큼 더하면 같다
const tableBytes = (value: unknown) => {
  const json = JSON.stringify(value)
  return new TextEncoder().encode(json).length + (json.match(/[,:]/g) ?? []).length
}

// 처방 이름을 채워 표 기준 정확히 target바이트인 처방 모양(줄 수는 3,000 안)
function rxOfBytes(target: number): UisRxPayload {
  const rowsFor = (names: string[]) => names.map((name, i) => rxRow(`C${String(i).padStart(4, '0')}`, { name }))
  const full = 'a'.repeat(100)
  let count = 1
  while (tableBytes(rxPayload(rowsFor(Array<string>(count).fill(full)), null)) < target) count += 1
  const names = Array<string>(count).fill(full)
  let excess = tableBytes(rxPayload(rowsFor(names), null)) - target
  for (let i = names.length - 1; excess > 0; i -= 1) {
    const cut = Math.min(excess, names[i].length - 1)
    names[i] = names[i].slice(cut)
    excess -= cut
  }
  const payload = rxPayload(rowsFor(names), null)
  expect(tableBytes(payload)).toBe(target)
  return payload
}

describe('AC-8808.2 validateUisRxPayload: 처방 저장 모양', () => {
  it('AC-8808.2: 맞는 모양은 같은 값의 새 객체로 돌려준다(넣은 객체를 그대로 넘기지 않는다)', () => {
    const payload = rxPayload()
    const checked = validateUisRxPayload(payload)
    expect(checked).toEqual(payload)
    expect(checked).not.toBe(payload)
    expect(checked?.rows[0]).not.toBe(payload.rows[0])
  })

  it.each<[string, UisRxPayload]>([
    ['줄이 없음·합계 없음', rxPayload([], null)],
    ['음수 처방량·음수 총액·음수 합계', rxPayload([rxRow('A001', { qty: -2.5, amount: -1500 })], -1500)],
    ['처방량 셋째 자리까지·10억', rxPayload([rxRow('A001', { qty: 0.001 }), rxRow('A002', { qty: 1_000_000_000 }), rxRow('A003', { qty: -1_000_000_000 })])],
    ['총액·합계 1조', rxPayload([rxRow('A001', { amount: 1_000_000_000_000 })], 1_000_000_000_000)],
    ['코드·이름 100자', rxPayload([rxRow('가'.repeat(100), { name: 'a'.repeat(100) })])],
    ['코드에 빈칸·/ 가 든 의원 코드', rxPayload([rxRow('mm010 100/100'), rxRow('mm020 / 5')])],
    ['3,000줄', rxPayload(Array.from({ length: 3000 }, (_, i) => rxRow(`C${String(i).padStart(4, '0')}`)))],
  ])('AC-8808.2: %s → 받는다', (_name, payload) => {
    expect(validateUisRxPayload(payload)).toEqual(payload)
  })

  const phone = ['010', '1234', '5678'].join('-')
  const rrn = ['900101', '1234567'].join('-')
  it.each<[string, () => unknown]>([
    ['객체가 아님', () => [rxPayload()]],
    ['null', () => null],
    ['v가 2', () => ({ ...rxPayload(), v: 2 })],
    ['v 열쇠가 없음', () => ({ rows: [], total: null })],
    ['열쇠가 더 있음(파일 이름)', () => ({ ...rxPayload(), fileName: '기간별처방통계.xls' })],
    ['rows가 배열이 아님', () => ({ ...rxPayload(), rows: {} })],
    ['3,001줄', () => rxPayload(Array.from({ length: 3001 }, (_, i) => rxRow(`C${String(i).padStart(4, '0')}`)))],
    ['줄에 열쇠가 더 있음(환자 수)', () => rxPayload([{ ...rxRow('A001'), patients: 3 } as UisRxRow])],
    ['줄에 열쇠가 빠짐', () => rxPayload([{ code: 'A001', name: 'x', qty: 1 } as UisRxRow])],
    ['코드가 빈 글자', () => rxPayload([rxRow('')])],
    ['코드 101자', () => rxPayload([rxRow('a'.repeat(101))])],
    ['이름이 빈 글자', () => rxPayload([rxRow('A001', { name: '' })])],
    ['이름 101자', () => rxPayload([rxRow('A001', { name: 'a'.repeat(101) })])],
    ['코드에 제어 글자', () => rxPayload([rxRow('A0\u000101')])],
    ['이름에 줄 나눔', () => rxPayload([rxRow('A001', { name: '가\n나' })])],
    ['이름이 전화 모양', () => rxPayload([rxRow('A001', { name: phone })])],
    ['코드가 주민번호 모양', () => rxPayload([rxRow(rrn)])],
    ['이름이 메일 모양', () => rxPayload([rxRow('A001', { name: 'fake@example.com' })])],
    ['코드가 글자가 아님', () => rxPayload([{ ...rxRow('A001'), code: 1001 } as unknown as UisRxRow])],
    ['같은 코드 두 줄', () => rxPayload([rxRow('A001'), rxRow('A001')])],
    ['코드 차례가 아님', () => rxPayload([rxRow('B001'), rxRow('A001')])],
    ['처방량이 NaN', () => rxPayload([rxRow('A001', { qty: Number.NaN })])],
    ['처방량이 무한', () => rxPayload([rxRow('A001', { qty: Number.POSITIVE_INFINITY })])],
    ['처방량이 10억 넘음', () => rxPayload([rxRow('A001', { qty: 1_000_000_000.001 })])],
    ['처방량 넷째 자리', () => rxPayload([rxRow('A001', { qty: 0.0005 })])],
    ['처방량이 글자', () => rxPayload([{ ...rxRow('A001'), qty: '1' } as unknown as UisRxRow])],
    ['총액이 소수', () => rxPayload([rxRow('A001', { amount: 10.5 })])],
    ['총액이 1조 넘음', () => rxPayload([rxRow('A001', { amount: 1_000_000_000_001 })])],
    ['합계가 소수', () => rxPayload([rxRow('A001')], 0.5)],
    ['합계가 글자', () => ({ ...rxPayload(), total: '3000' })],
    ['합계 열쇠가 없음', () => ({ v: 1, rows: [] })],
  ])('AC-8808.2: %s → null', (_name, value) => {
    expect(validateUisRxPayload(value())).toBeNull()
  })

  it('AC-8808.2: jsonb 글 모양으로 정확히 262,144바이트는 받고 262,145바이트는 null이다(DB octet_length(payload::text)와 같은 셈)', () => {
    expect(UIS_PAYLOAD_MAX_BYTES).toBe(262_144)
    const fits = rxOfBytes(262_144)
    expect(validateUisRxPayload(fits)).toEqual(fits)
    const over = rxOfBytes(262_145)
    // JSON.stringify로 재면 한도 안이다 — 그래도 표는 받지 않는다
    expect(new TextEncoder().encode(JSON.stringify(over)).length).toBeLessThan(262_144)
    expect(validateUisRxPayload(over)).toBeNull()
  })
})

describe('AC-8808.2 validateUisAgePayload: 나이대 저장 모양', () => {
  it('AC-8808.2: 맞는 모양(열 칸씩 · 합 = 환자 · 신환 합 = 신환 · 띠마다 신환 ≤ 내원)은 새 객체로 돌려준다', () => {
    const payload = agePayload()
    const checked = validateUisAgePayload(payload)
    expect(checked).toEqual(payload)
    expect(checked).not.toBe(payload)
    expect(checked?.bands).not.toBe(payload.bands)
  })

  it('AC-8808.2: 신환이 없는 날·모두 생년월일 없음도 받는다', () => {
    const none = agePayload({ newPatients: 0, newBands: Array<number>(10).fill(0) })
    expect(validateUisAgePayload(none)).toEqual(none)
    const unknown = agePayload({ patients: 2, newPatients: 1, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2], newBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1] })
    expect(validateUisAgePayload(unknown)).toEqual(unknown)
  })

  it.each<[string, () => unknown]>([
    ['객체가 아님', () => 'age'],
    ['v가 2', () => ({ ...agePayload(), v: 2 })],
    ['v 열쇠가 없음', () => ({ patients: 12, newPatients: 3, bands: agePayload().bands, newBands: agePayload().newBands })],
    ['열쇠가 더 있음(차트번호)', () => ({ ...agePayload(), chartNo: '87654321' })],
    ['띠가 아홉 칸', () => agePayload({ bands: [1, 1, 2, 3, 2, 2, 1, 0, 0] })],
    ['신환 띠가 열한 칸', () => agePayload({ newBands: [0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0] })],
    ['음수 칸', () => agePayload({ bands: [-1, 2, 1, 2, 3, 2, 2, 1, 0, 0] })],
    ['소수 칸', () => agePayload({ bands: [0.5, 0.5, 1, 2, 3, 2, 2, 1, 0, 0] })],
    ['띠 합 ≠ 환자', () => agePayload({ patients: 13 })],
    ['신환 띠 합 ≠ 신환', () => agePayload({ newPatients: 4 })],
    ['그 띠의 신환 > 내원', () => agePayload({ bands: [0, 1, 1, 2, 3, 2, 2, 1, 0, 0], newBands: [1, 0, 0, 0, 1, 1, 0, 0, 0, 0] })],
    ['환자 수가 글자', () => ({ ...agePayload(), patients: '12' })],
  ])('AC-8808.2: %s → null', (_name, value) => {
    expect(validateUisAgePayload(value())).toBeNull()
  })
})

describe('AC-8805.3 toUisDayPayload: 위쪽 표 날 줄 → 지금 날 저장 모양', () => {
  it('AC-8805.3: 날 줄은 validateDayPayload를 그대로 지나는 모양이다(재진 = 인원수 − 신규환자 · 처방 없음 · 재방문 셀 수 없음 · partial 거짓)', () => {
    const payload = toUisDayPayload({ day: '2026-11-02', patients: 30, newPatients: 4 })
    expect(payload).toEqual({
      schemaVersion: 2,
      quality: 'valid',
      day: '2026-11-02',
      partial: false,
      totals: { patients: 30, newPatients: 4, returning: 26, unknown: 0 },
      rx: [],
      groups: [],
      revisit: { cohort: 0, within7: null, within14: null },
    })
    expect(validateDayPayload(payload)).not.toBeNull()
    expect(Object.keys(payload).sort()).toEqual(Object.keys(validateDayPayload(payload) ?? {}).sort())
  })

  it.each([
    { day: '2026-11-27', patients: 5, newPatients: 0 },
    { day: '2020-01-01', patients: 7, newPatients: 7 },
    { day: '2026-11-03', patients: 0, newPatients: 0 },
  ])('AC-8805.3: $day 인원 $patients · 신환 $newPatients도 검사를 지나고, 오늘 파일도 partial 거짓이다', (day) => {
    const payload = toUisDayPayload(day)
    expect(payload.partial).toBe(false)
    expect(payload.totals.returning).toBe(day.patients - day.newPatients)
    expect(validateDayPayload(payload)).not.toBeNull()
  })
})

describe('AC-8808.1 uisUnitOf: 조회일 기간 모양', () => {
  it.each<[string, string, string | null]>([
    ['2026-11-02', '2026-11-02', 'day'],
    ['2026-11-02', '2026-11-08', 'week'],
    ['2026-11-03', '2026-11-09', null],
    ['2026-11-01', '2026-11-30', 'month'],
    ['2026-02-01', '2026-02-28', 'month'],
    ['2028-02-01', '2028-02-28', null],
    ['2026-11-01', '2026-11-29', null],
    ['2026-11-09', '2026-11-02', null],
    ['2026-13-01', '2026-13-01', null],
  ])('AC-8808.1: %s ~ %s → %s', (from, to, unit) => {
    expect(uisUnitOf(from, to)).toBe(unit)
  })
})

const span = (from: string, to: string, unit: UisSpan['unit']): UisSpan => ({ from, to, unit })
const revenueRow = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow => ({
  date,
  visits: 40,
  newPatients: null,
  returnVisits: null,
  total: 1_200_000,
  insurer: 800_000,
  copay: 250_000,
  noncovered: 150_000,
  otherTotal: 0,
  cash: 300_000,
  card: 100_000,
  transfer: 0,
  receivableIn: 0,
  unconfirmed: false,
  splitUnconfirmed: false,
  ...over,
})
const income = (date: string, over: Partial<RevenueDayRow> = {}): UisFileResult => ({
  status: 'read',
  read: { kind: 'income', span: span(date, date, 'day'), row: revenueRow(date, over) },
})
const rxRead = (from: string, to: string, unit: UisSpan['unit'], payload: UisRxPayload = rxPayload()): UisFileResult => ({
  status: 'read',
  read: { kind: 'rx', span: span(from, to, unit), payload },
})
const visits = (from: string, to: string, unit: UisSpan['unit'], days: { day: string; patients: number; newPatients: number }[]): UisFileResult => ({
  status: 'read',
  read: { kind: 'visits', span: span(from, to, unit), days },
})
const lower = (day: string, payload: UisAgePayload = agePayload()): UisFileResult => ({
  status: 'read',
  read: { kind: 'visitPatients', span: span(day, day, 'day'), payload },
})
const same = (kind: 'income' | 'rx' | 'visitPatients', from: string, to: string, unit: UisSpan['unit']): UisFileResult => ({
  status: 'skipped',
  why: 'same',
  kind,
  span: span(from, to, unit),
})

describe('AC-8808.1 planUisSave: 파일마다의 결과 → 저장 계획', () => {
  it('AC-8808.1: 위쪽 표마다 {덮은 기간 = 조회일, 날 줄}, 일일수입통계마다 매출 한 날 줄, 처방·나이대마다 {kind, from, to, payload}이고 줄마다 파일 차례 번호가 붙는다', () => {
    const results: UisFileResult[] = [
      income('2026-11-02'),
      rxRead('2026-10-01', '2026-10-31', 'month'),
      visits('2026-11-02', '2026-11-08', 'week', [
        { day: '2026-11-02', patients: 30, newPatients: 4 },
        { day: '2026-11-03', patients: 25, newPatients: 2 },
      ]),
      lower('2026-11-02'),
      same('income', '2026-11-02', '2026-11-02', 'day'),
      { status: 'skipped', why: 'rsv', kind: 'rsv', span: null },
      { status: 'refused', code: 'E-UIS-KIND', kind: null, span: null },
      same('rx', '2026-10-01', '2026-10-31', 'month'),
    ]
    const plan = planUisSave(results)
    expect(plan.stats).toEqual([
      {
        files: [2],
        covered: { from: '2026-11-02', to: '2026-11-08' },
        days: [
          toUisDayPayload({ day: '2026-11-02', patients: 30, newPatients: 4 }),
          toUisDayPayload({ day: '2026-11-03', patients: 25, newPatients: 2 }),
        ],
      },
    ])
    expect(plan.revenue).toEqual([{ files: [0, 4], row: revenueRow('2026-11-02') }])
    expect(plan.periods).toEqual([
      { files: [1, 7], kind: 'rx', from: '2026-10-01', to: '2026-10-31', payload: rxPayload() },
      { files: [3], kind: 'age', from: '2026-11-02', to: '2026-11-02', payload: agePayload() },
    ])
    expect(plan.refused).toEqual([])
  })

  it('AC-8808.1: 휴진만 있는 위쪽 표도 덮은 기간 줄이 된다(날 줄 없음 — 그 기간은 휴진)', () => {
    const plan = planUisSave([visits('2026-11-09', '2026-11-09', 'day', [])])
    expect(plan.stats).toEqual([{ files: [0], covered: { from: '2026-11-09', to: '2026-11-09' }, days: [] }])
  })

  it('AC-8808.1: 결과가 없으면 계획도 비었다', () => {
    expect(planUisSave([])).toEqual({ stats: [], revenue: [], periods: [], refused: [] })
  })

  it('AC-8808.1: 매출 줄은 정해 둔 열다섯 칸(REVENUE_DAY_KEYS)만 새 객체로 옮긴다(더 붙은 칸은 버리고 참고 금액 열쇠도 없다)', () => {
    const sneaky = { ...revenueRow('2026-11-02'), patientName: '홍길동', fileName: '일일수입통계.xls' } as RevenueDayRow
    const plan = planUisSave([{ status: 'read', read: { kind: 'income', span: span('2026-11-02', '2026-11-02', 'day'), row: sneaky } }])
    expect(plan.revenue[0].row).toEqual(revenueRow('2026-11-02'))
    expect(JSON.stringify(plan)).not.toMatch(/홍길동|일일수입통계/)
  })

  it('AC-8808.1: 검사를 못 지난 모양은 계획에 넣지 않고 그 파일(같은 엑셀로 건너뛴 파일 포함) 번호를 refused로 돌린다', () => {
    const badRx = rxPayload([{ ...rxRow('A001'), chartNo: '87654321' } as UisRxRow])
    const badAge = agePayload({ patients: 99 })
    const plan = planUisSave([
      rxRead('2026-11-02', '2026-11-02', 'day', badRx),
      same('rx', '2026-11-02', '2026-11-02', 'day'),
      visits('2026-11-02', '2026-11-02', 'day', [{ day: '2026-11-02', patients: 3, newPatients: 5 }]),
      lower('2026-11-02', badAge),
      income('2026-11-02'),
    ])
    expect(plan.periods).toEqual([])
    expect(plan.stats).toEqual([])
    expect(plan.revenue).toEqual([{ files: [4], row: revenueRow('2026-11-02') }])
    expect(plan.refused).toEqual([0, 1, 2, 3])
    expect(JSON.stringify(plan)).not.toContain('87654321')
  })

  it('AC-8808.1: 계획에 든 처방·나이대 모양은 검사가 돌려준 새 값이다', () => {
    const payload = rxPayload()
    const plan = planUisSave([rxRead('2026-11-02', '2026-11-02', 'day', payload)])
    expect(plan.periods[0].payload).toEqual(payload)
    expect(plan.periods[0].payload).not.toBe(payload)
  })
})

describe('AC-8808.2 환자 자료 구역 규칙', () => {
  it('AC-8808.2: lib/payload/uisarang.ts는 React·supabase·lib/storage·네트워크·저장소·console을 쓰지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/payload/uisarang.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"][^'"]*(react|next|supabase|storage|auth|parsers|workers)/)
    expect(source).not.toMatch(/\b(fetch|localStorage|sessionStorage|indexedDB|console)\b/)
  })
})
