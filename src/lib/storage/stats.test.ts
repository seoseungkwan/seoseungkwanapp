import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, addMonths, eachDay } from '@/lib/analytics/dates'
import { validateDayPayload, validateMonthPayload } from '@/lib/payload/validate'
import type { DayPayload, MonthPayload } from '@/types/payload'
import { StorageError, readCoverage, readDays, readMonths, saveStats, type SupabaseLike } from './stats'

// 통계 숫자 저장·읽기(브라우저 → Supabase). 실제 Supabase에 붙지 않는다 — 가짜 클라이언트가 어느 표에 어떤 칸이
// 몇 번 나갔는지 적어 두고, 읽기는 받은 조건대로 걸러 돌려준다. 권한·제약 자체는 supabase/stats-rls.test.ts가 증명한다
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

beforeEach(() => {
  supabaseBrowser.mockReset()
})

const RAW = 'permission denied for table stats_days (secret detail)' // 서버 답에 섞여 온 글자. 옮겨지면 안 된다
const SERVER_MAX_ROWS = 1000 // Supabase가 한 번에 주는 줄 수 기본값. 넘는 줄은 알리지 않고 잘라 준다

type Stored = Record<string, unknown>
type WriteCall = { table: string; op: 'upsert' | 'insert'; rows: Stored[]; options?: unknown }
type Filter = ['gte' | 'lte', string, string]
type ReadCall = { table: string; op: 'select'; columns: string; filters: Filter[]; orders: [string, unknown][]; range: [number, number] | null }
type Call = WriteCall | ReadCall
type Setup = { stored?: Record<string, Stored[]>; fail?: (call: Call) => 'error' | 'throw' | null }

function fakeClient({ stored = {}, fail = () => null }: Setup = {}) {
  const calls: Call[] = []

  // 진짜 빌더처럼 await할 때 나간다
  const answer = (call: Call, data: () => unknown) => ({
    then(ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) {
      return Promise.resolve()
        .then(() => {
          calls.push(call)
          const how = fail(call)
          if (how === 'throw') throw new Error(RAW)
          return how === 'error' ? { data: null, error: { message: RAW } } : { data: data(), error: null }
        })
        .then(ok, no)
    },
  })

  const compare = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)

  const read = (table: string, columns: string) => {
    const call: ReadCall = { table, op: 'select', columns, filters: [], orders: [], range: null }
    const rows = () => {
      const kept = (stored[table] ?? []).filter((row) =>
        call.filters.every(([op, column, value]) => (op === 'gte' ? compare(row[column], value) >= 0 : compare(row[column], value) <= 0)),
      )
      for (const [column] of [...call.orders].reverse()) kept.sort((a, b) => compare(a[column], b[column]))
      const [start, end] = call.range ?? [0, SERVER_MAX_ROWS - 1]
      return kept.slice(start, Math.min(end + 1, start + SERVER_MAX_ROWS))
    }
    const builder = {
      gte(column: string, value: string) {
        call.filters.push(['gte', column, value])
        return builder
      },
      lte(column: string, value: string) {
        call.filters.push(['lte', column, value])
        return builder
      },
      order(column: string, options?: unknown) {
        call.orders.push([column, options])
        return builder
      },
      range(start: number, end: number) {
        call.range = [start, end]
        return builder
      },
      ...answer(call, rows),
    }
    return builder
  }

  const from = (table: string) => ({
    upsert: (rows: Stored[], options?: unknown) => answer({ table, op: 'upsert', rows, options }, () => null),
    insert: (rows: Stored | Stored[]) => answer({ table, op: 'insert', rows: [rows].flat() }, () => null),
    select: (columns: string) => read(table, columns),
  })

  return { client: { from } as unknown as SupabaseLike, calls }
}

const writesTo = (calls: Call[], table: string) => calls.filter((c): c is WriteCall => c.op !== 'select' && c.table === table)
const readsOf = (calls: Call[]) => calls as ReadCall[]

function dayPayload(day: string, over: Partial<DayPayload> = {}): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day,
    partial: false,
    totals: { patients: 3, newPatients: 1, returning: 2, unknown: 0 },
    rx: [{ code: 'AA154', name: '가짜 처치', type: '행위', patients: 3, newPatients: 1, returning: 2 }],
    groups: [],
    revisit: { cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 },
    ...over,
  }
}

function monthPayload(month: string, over: Partial<MonthPayload> = {}): MonthPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    month,
    partial: false,
    totals: { patients: 3, newPatients: 1, returning: 2, unknown: 0 },
    rx: [{ code: 'AA154', name: '가짜 처치', type: '행위', patients: 3, newPatients: 1, returning: 2, followup: [2, 1, 0, 0] }],
    groups: [],
    revisit: { cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 },
    regions: [{ name: '가짜동', patients: 5 }],
    ...over,
  }
}

const AT = '2026-10-01T00:00:00+00:00'
const storedDay = (day: string, over: Stored = {}): Stored => ({
  day,
  partial: false,
  source: 'bit',
  payload: dayPayload(day),
  updated_at: AT,
  ...over,
})
const storedMonth = (month: string, over: Stored = {}): Stored => ({
  month,
  partial: false,
  source: 'bit',
  payload: monthPayload(month),
  updated_at: AT,
  ...over,
})

type SaveInput = Parameters<typeof saveStats>[0]

const saveInput = (over: Record<string, unknown> = {}) =>
  ({
    months: [monthPayload('2026-09')],
    days: [dayPayload('2026-09-30')],
    covered: { from: '2026-09-01', to: '2026-09-30' },
    source: 'bit',
    ...over,
  }) as unknown as SaveInput

async function failure(work: Promise<unknown>): Promise<StorageError> {
  const error: unknown = await work.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(StorageError)
  return error as StorageError
}

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length

// 표가 재는 크기(octet_length(payload::text)). jsonb 글자는 콤마·콜론 뒤에 빈칸이 하나 있다.
// 아래 자료의 글자에는 콤마·콜론이 없어, JSON의 콤마·콜론 수만큼 더하면 같다
function tableBytes(payload: unknown): number {
  const json = JSON.stringify(payload)
  return utf8Bytes(json) + (json.match(/[,:]/g) ?? []).length
}

const RX_ROWS = 400
const NAME_CHARS = 100 // 검사가 받는 처방 이름 길이

// 처방 이름을 채워 표 기준 정확히 target바이트인 값을 만든다. a는 1바이트, 가는 3바이트
function sized<P>(target: number, unit: 'a' | '가', build: (names: string[]) => P): P {
  const width = utf8Bytes(unit)
  const need = target - tableBytes(build(Array<string>(RX_ROWS).fill('')))
  const text = unit.repeat(Math.floor(need / width)) + 'a'.repeat(need % width)
  const payload = build(Array.from({ length: RX_ROWS }, (_, i) => text.slice(i * NAME_CHARS, (i + 1) * NAME_CHARS)))
  expect(tableBytes(payload)).toBe(target)
  return payload
}

const rxRow = (i: number, name: string) => ({
  code: `C${String(i).padStart(4, '0')}`,
  name,
  type: '',
  patients: 0,
  newPatients: 0,
  returning: 0,
})
const dayOfBytes = (target: number, unit: 'a' | '가' = 'a') =>
  sized(target, unit, (names) => dayPayload('2026-09-30', { rx: names.map((name, i) => rxRow(i, name)) }))
const monthOfBytes = (target: number, unit: 'a' | '가' = 'a') =>
  sized(target, unit, (names) =>
    monthPayload('2026-09', { rx: names.map((name, i) => ({ ...rxRow(i, name), followup: [0, 0, 0, 0] })) }),
  )

describe('AC-507.1 saveStats', () => {
  it('AC-507.1 달 → 일 → 덮은 기간 순으로 표 이름·충돌 열쇠를 지켜 보내고, 저장한 줄 수를 준다', async () => {
    const { client, calls } = fakeClient()
    const result = await saveStats(saveInput(), { client })

    expect(calls.map((c) => [c.table, c.op])).toEqual([
      ['stats_months', 'upsert'],
      ['stats_days', 'upsert'],
      ['stats_coverage', 'insert'],
    ])
    expect((calls[0] as WriteCall).options).toEqual({ onConflict: 'hospital_id,month' })
    expect((calls[1] as WriteCall).options).toEqual({ onConflict: 'hospital_id,day' })
    expect(result).toEqual({ saved: 2 })
  })

  it('AC-507.1 보내는 줄의 칸은 month|day·partial·source·payload, 덮은 기간은 from_day·to_day·source뿐이다(hospital_id 없음)', async () => {
    const { client, calls } = fakeClient()
    await saveStats(saveInput({ source: 'file' }), { client })

    const [monthRow] = writesTo(calls, 'stats_months')[0].rows
    const [dayRow] = writesTo(calls, 'stats_days')[0].rows
    const [coverageRow] = writesTo(calls, 'stats_coverage')[0].rows
    expect(Object.keys(monthRow).sort()).toEqual(['month', 'partial', 'payload', 'source'])
    expect(Object.keys(dayRow).sort()).toEqual(['day', 'partial', 'payload', 'source'])
    expect(Object.keys(coverageRow).sort()).toEqual(['from_day', 'source', 'to_day'])
    expect(monthRow).toEqual({ month: '2026-09', partial: false, source: 'file', payload: validateMonthPayload(monthPayload('2026-09')) })
    expect(dayRow).toEqual({ day: '2026-09-30', partial: false, source: 'file', payload: validateDayPayload(dayPayload('2026-09-30')) })
    expect(coverageRow).toEqual({ from_day: '2026-09-01', to_day: '2026-09-30', source: 'file' })
  })

  it('AC-507.1 payload는 검사가 돌려준 값이고, 줄의 month|day·partial은 그 값과 같다', async () => {
    const { client, calls } = fakeClient()
    const day = dayPayload('2026-09-30', { partial: true, revisit: { cohort: 1, within7: 1, within14: 1 } })
    const month = monthPayload('2026-09', { partial: true, revisit: { cohort: 1, within7: 1, within14: 1 } })
    await saveStats(saveInput({ days: [day], months: [month] }), { client })

    const [dayRow] = writesTo(calls, 'stats_days')[0].rows
    const [monthRow] = writesTo(calls, 'stats_months')[0].rows
    expect(dayRow.partial).toBe(true)
    expect(monthRow.partial).toBe(true)
    // 검사가 선택 칸을 null로 채워 돌려준다 — 넣은 값을 그대로 보내면 이 칸이 없다
    expect(dayRow.payload).not.toBe(day)
    expect((dayRow.payload as DayPayload).revisit).toEqual({ cohort: 1, within7: 1, within14: 1, within30: null, after30: null })
    expect((monthRow.payload as MonthPayload).revisit).toEqual({ cohort: 1, within7: 1, within14: 1, within30: null, after30: null })
  })

  it('AC-507.1 덮은 기간이 null이면 stats_coverage에 쓰지 않는다', async () => {
    const { client, calls } = fakeClient()
    await saveStats(saveInput({ covered: null }), { client })

    expect(writesTo(calls, 'stats_coverage')).toEqual([])
    expect(calls.map((c) => c.table)).toEqual(['stats_months', 'stats_days'])
  })

  it('AC-507.1 숫자가 없어도 덮은 기간은 쓴다(그 기간은 휴진이다). 빈 upsert는 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    const result = await saveStats(saveInput({ months: [], days: [] }), { client })

    expect(calls.map((c) => [c.table, c.op])).toEqual([['stats_coverage', 'insert']])
    expect(result).toEqual({ saved: 0 })
  })

  it('AC-507.1 저장할 것도 덮은 기간도 없으면 아무것도 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    expect(await saveStats(saveInput({ months: [], days: [], covered: null }), { client })).toEqual({ saved: 0 })
    expect(calls).toEqual([])
  })

  it('AC-507.1 200줄씩 나눠 보내고, 덮은 기간은 다 된 뒤 한 줄이다', async () => {
    const { client, calls } = fakeClient()
    const dayList = eachDay({ from: '2025-01-01', to: addDays('2025-01-01', 449) })
    const monthList = Array.from({ length: 201 }, (_, i) => addMonths('2010-01', i))
    const result = await saveStats(saveInput({ days: dayList.map((d) => dayPayload(d)), months: monthList.map((m) => monthPayload(m)) }), { client })

    expect(writesTo(calls, 'stats_months').map((c) => c.rows.length)).toEqual([200, 1])
    expect(writesTo(calls, 'stats_days').map((c) => c.rows.length)).toEqual([200, 200, 50])
    expect(writesTo(calls, 'stats_days').flatMap((c) => c.rows.map((row) => row.day))).toEqual(dayList)
    expect(writesTo(calls, 'stats_months').flatMap((c) => c.rows.map((row) => row.month))).toEqual(monthList)
    expect(calls.at(-1)?.table).toBe('stats_coverage')
    expect(writesTo(calls, 'stats_coverage')).toHaveLength(1)
    expect(result).toEqual({ saved: 651 })
  })

  it.each(['bit', 'file'])('AC-507.1 덮은 기간은 양 끝을 합쳐 정확히 800일까지 보낸다(%s, 표의 제약과 같다)', async (source) => {
    const { client, calls } = fakeClient()
    const to = addDays('2024-01-01', 799)
    expect(eachDay({ from: '2024-01-01', to })).toHaveLength(800)
    await saveStats(saveInput({ source, covered: { from: '2024-01-01', to } }), { client })

    expect(calls.map((c) => c.table)).toEqual(['stats_months', 'stats_days', 'stats_coverage'])
  })

  it.each(['bit', 'file'])('AC-507.1 양 끝을 합쳐 801일이면(%s) 달·일 숫자도 보내지 않고 E-STATS-SAVE-FAILED다', async (source) => {
    const { client, calls } = fakeClient()
    const to = addDays('2024-01-01', 800)
    expect(eachDay({ from: '2024-01-01', to })).toHaveLength(801)
    const error = await failure(saveStats(saveInput({ source, covered: { from: '2024-01-01', to } }), { client }))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-507.1 saved는 보낸 줄 수다(완전한 줄을 지키는 트리거가 옛 줄을 남겨도 서버는 오류 없이 답한다)', async () => {
    const { client, calls } = fakeClient()
    const days = [dayPayload('2026-09-29', { partial: true }), dayPayload('2026-09-30', { partial: true })]
    const { saved } = await saveStats(saveInput({ days, months: [], covered: null }), { client })

    expect(saved).toBe(2)
    expect(calls.every((c) => c.op === 'upsert')).toBe(true) // 다시 읽어 보지 않는다
  })

  it('AC-507.1 덮은 기간에 다른 칸이 붙어 와도 날짜 둘과 출처만 보낸다', async () => {
    const { client, calls } = fakeClient()
    const covered = { from: '2026-09-01', to: '2026-09-30', fileName: '환자별소모통계.xlsx' }
    await saveStats(saveInput({ covered }), { client })

    expect(writesTo(calls, 'stats_coverage')[0].rows).toEqual([{ from_day: '2026-09-01', to_day: '2026-09-30', source: 'bit' }])
    expect(JSON.stringify(calls)).not.toContain('환자별소모통계')
  })

  const SIZED: [string, (target: number, unit?: 'a' | '가') => Record<string, unknown>][] = [
    ['날', (target, unit) => ({ days: [dayOfBytes(target, unit)] })],
    ['달', (target, unit) => ({ months: [monthOfBytes(target, unit)] })],
  ]

  it.each(SIZED)('AC-507.1 %s payload가 표 기준 정확히 65,536바이트면 보낸다', async (_name, over) => {
    const { client, calls } = fakeClient()
    await saveStats(saveInput(over(65_536)), { client })

    expect(calls.map((c) => c.table)).toEqual(['stats_months', 'stats_days', 'stats_coverage'])
  })

  it.each(SIZED)('AC-507.1 %s payload가 65,537바이트면 아무것도 보내지 않고 E-STATS-SAVE-FAILED', async (_name, over) => {
    const { client, calls } = fakeClient()
    const error = await failure(saveStats(saveInput(over(65_537)), { client }))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it.each(SIZED)('AC-507.1 %s payload 크기는 글자 수가 아니라 UTF-8 바이트다(한글 한 글자 = 3바이트)', async (_name, over) => {
    const fits = fakeClient()
    await saveStats(saveInput(over(65_536, '가')), { client: fits.client })
    expect(fits.calls).toHaveLength(3)

    const input = over(65_537, '가')
    expect(JSON.stringify(input).length).toBeLessThan(65_536) // 글자 수로 재면 통과하는 크기다
    const tooBig = fakeClient()
    const error = await failure(saveStats(saveInput(input), { client: tooBig.client }))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(tooBig.calls).toEqual([])
  })

  it('AC-507.1 크기는 콤마·콜론 뒤 빈칸까지 잰다(JSON.stringify로 재면 통과하는 크기도 표는 받지 않는다)', async () => {
    const { client, calls } = fakeClient()
    const big = dayOfBytes(65_537)
    expect(utf8Bytes(JSON.stringify(big))).toBeLessThan(65_536)
    const error = await failure(saveStats(saveInput({ days: [big] }), { client }))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-507.1 큰 값이 맨 뒤에 있어도 앞 묶음을 보내지 않고 클라이언트도 만들지 않는다', async () => {
    const days = eachDay({ from: '2025-01-01', to: addDays('2025-01-01', 449) }).map((d) => dayPayload(d))
    const error = await failure(saveStats(saveInput({ days: [...days, dayOfBytes(65_537)] })))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })

  const phoneLike = () => ['010', '1234', '5678'].join('-')
  it.each<[string, () => Record<string, unknown>]>([
    ['뒤쪽 달 하나의 합계가 어긋남', () => ({ months: [monthPayload('2026-08'), monthPayload('2026-09', { totals: { patients: 99, newPatients: 1, returning: 2, unknown: 0 } })] })],
    ['뒤쪽 날 하나의 합계가 어긋남', () => ({ days: [dayPayload('2026-09-29'), dayPayload('2026-09-30', { totals: { patients: 99, newPatients: 1, returning: 2, unknown: 0 } })] })],
    ['날에 차트번호 칸이 붙음', () => ({ days: [{ ...dayPayload('2026-09-30'), chartNo: '12345' }] })],
    ['달에 파일 이름 칸이 붙음', () => ({ months: [{ ...monthPayload('2026-09'), fileName: 'a.xlsx' }] })],
    ['처방 이름이 전화번호 모양', () => ({ days: [dayPayload('2026-09-30', { rx: [{ code: 'AA154', name: phoneLike(), type: '행위', patients: 3, newPatients: 1, returning: 2 }] })] })],
    ['덮은 기간이 날짜가 아닌 글자', () => ({ covered: { from: '환자별소모통계.xlsx', to: '2026-09-30' } })],
    ['덮은 기간 끝이 시작보다 앞', () => ({ covered: { from: '2026-09-30', to: '2026-09-01' } })],
    ['출처가 bit·file이 아님', () => ({ source: '환자별소모통계.xlsx' })],
  ])('AC-507.1 %s → 아무것도 보내지 않고 E-STATS-SAVE-FAILED', async (_name, over) => {
    const { client, calls } = fakeClient()
    const error = await failure(saveStats(saveInput(over()), { client }))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-507.1 검사에 걸리면 클라이언트도 만들지 않는다', async () => {
    const error = await failure(saveStats(saveInput({ source: 'nope' })))
    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })

  it.each(['error', 'throw'] as const)('AC-507.1 달 보내기 실패(%s) → E-STATS-SAVE-FAILED, 뒤 표는 보내지 않고 응답 내용은 옮기지 않는다', async (how) => {
    const { client, calls } = fakeClient({ fail: (c) => (c.table === 'stats_months' ? how : null) })
    const error = await failure(saveStats(saveInput(), { client }))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(calls.map((c) => c.table)).toEqual(['stats_months'])
    expect(error.message).not.toContain('secret detail')
    expect(error.cause).toBeUndefined()
  })

  it('AC-507.1 일 묶음 중간에 실패하면 → E-STATS-SAVE-FAILED, 남은 묶음·덮은 기간은 보내지 않는다', async () => {
    let batches = 0
    const { client, calls } = fakeClient({
      fail: (c) => {
        if (c.table !== 'stats_days') return null
        batches += 1
        return batches === 2 ? 'error' : null
      },
    })
    const days = eachDay({ from: '2025-01-01', to: addDays('2025-01-01', 449) }).map((d) => dayPayload(d))
    const error = await failure(saveStats(saveInput({ days }), { client }))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(writesTo(calls, 'stats_days')).toHaveLength(2)
    expect(writesTo(calls, 'stats_coverage')).toEqual([])
  })

  it.each(['error', 'throw'] as const)('AC-507.1 덮은 기간 보내기 실패(%s)도 E-STATS-SAVE-FAILED다', async (how) => {
    const { client } = fakeClient({ fail: (c) => (c.table === 'stats_coverage' ? how : null) })
    const error = await failure(saveStats(saveInput(), { client }))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(error.message).not.toContain('secret detail')
    expect(error.cause).toBeUndefined()
  })

  it('AC-507.1 deps가 없으면 supabaseBrowser()로 보낸다', async () => {
    const { client, calls } = fakeClient()
    supabaseBrowser.mockReturnValue(client)
    await saveStats(saveInput())

    expect(supabaseBrowser).toHaveBeenCalledTimes(1)
    expect(calls.map((c) => c.table)).toEqual(['stats_months', 'stats_days', 'stats_coverage'])
  })

  it('AC-507.1 클라이언트를 만들지 못해도 E-STATS-SAVE-FAILED다', async () => {
    supabaseBrowser.mockImplementation(() => {
      throw new Error(RAW)
    })
    const error = await failure(saveStats(saveInput()))

    expect(error.code).toBe('E-STATS-SAVE-FAILED')
    expect(error.message).not.toContain('secret detail')
  })
})

describe('AC-507.2 readDays', () => {
  const RANGE = { from: '2026-09-01', to: '2026-09-30' }

  it('AC-507.2 정해 둔 칸을 그 기간만, 날짜 순으로 읽어 달라고 한다', async () => {
    const { client, calls } = fakeClient()
    await readDays(RANGE, { client })

    const [call] = readsOf(calls)
    expect(call.table).toBe('stats_days')
    expect(call.columns).toBe('day, partial, source, payload, updated_at')
    expect(call.filters).toEqual(
      expect.arrayContaining([
        ['gte', 'day', '2026-09-01'],
        ['lte', 'day', '2026-09-30'],
      ]),
    )
    expect(call.orders[0]).toEqual(['day', { ascending: true }])
  })

  it('AC-507.2 그 기간 줄만 검사한 값으로 날짜 순으로 돌려준다', async () => {
    const stored = {
      stats_days: [
        storedDay('2026-09-30'),
        storedDay('2026-08-31'),
        storedDay('2026-09-01', { payload: dayPayload('2026-09-01', { revisit: { cohort: 1, within7: 1, within14: 1 } }) }),
        storedDay('2026-10-01'),
      ],
    }
    const { client } = fakeClient({ stored })
    const { rows, dropped } = await readDays(RANGE, { client })

    expect(rows.map((r) => r.day)).toEqual(['2026-09-01', '2026-09-30'])
    expect(rows[0].revisit).toEqual({ cohort: 1, within7: 1, within14: 1, within30: null, after30: null })
    expect(dropped).toBe(0)
  })

  it.each<[string, Stored]>([
    ['모양이 어긋난 payload', { payload: { schemaVersion: 2 } }],
    ['차트번호 칸이 붙은 payload', { payload: { ...dayPayload('2026-09-02'), chartNo: '12345' } }],
    ['날짜 칸과 다른 payload', { payload: dayPayload('2026-09-03') }],
    ['partial 칸과 다른 payload', { payload: dayPayload('2026-09-02', { partial: true }) }],
    ['출처가 bit·file이 아닌 줄', { source: 'nope' }],
  ])('AC-507.2 %s → 그 줄을 빼고 dropped로 센다', async (_name, over) => {
    const stored = { stats_days: [storedDay('2026-09-01'), storedDay('2026-09-02', over)] }
    const { client } = fakeClient({ stored })
    const { rows, dropped } = await readDays(RANGE, { client })

    expect(rows.map((r) => r.day)).toEqual(['2026-09-01'])
    expect(dropped).toBe(1)
  })

  it('AC-507.2 latest는 가장 최근 updated_at과 그 줄의 source다(날짜가 뒤인 줄이 아니라)', async () => {
    const stored = {
      stats_days: [
        storedDay('2026-09-01', { updated_at: '2026-10-05T01:00:00+00:00', source: 'file' }),
        storedDay('2026-09-02', { updated_at: '2026-10-03T01:00:00+00:00', source: 'bit' }),
      ],
    }
    const { client } = fakeClient({ stored })
    const { latest } = await readDays(RANGE, { client })

    expect(latest).toEqual({ at: '2026-10-05T01:00:00+00:00', source: 'file' })
  })

  it('AC-507.2 updated_at이 시각이 아닌 줄은 남고 dropped로 세지 않는다. latest 다툼에서만 빠진다', async () => {
    const stored = {
      stats_days: [
        storedDay('2026-09-01', { updated_at: 'nope', source: 'file' }),
        storedDay('2026-09-02', { updated_at: '2026-10-03T01:00:00+00:00', source: 'bit' }),
        storedDay('2026-09-03', { updated_at: 'nope', source: 'file' }),
      ],
    }
    const { client } = fakeClient({ stored })
    const { rows, dropped, latest } = await readDays(RANGE, { client })

    expect(rows.map((r) => r.day)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(dropped).toBe(0)
    expect(latest).toEqual({ at: '2026-10-03T01:00:00+00:00', source: 'bit' })
  })

  it('AC-507.2 읽을 수 있는 시각이 하나도 없으면 줄은 그대로 두고 latest는 null이다', async () => {
    const stored = { stats_days: [storedDay('2026-09-01', { updated_at: 'nope' }), storedDay('2026-09-02', { updated_at: 'nope' })] }
    const { client } = fakeClient({ stored })
    const { rows, dropped, latest } = await readDays(RANGE, { client })

    expect(rows.map((r) => r.day)).toEqual(['2026-09-01', '2026-09-02'])
    expect(dropped).toBe(0)
    expect(latest).toBeNull()
  })

  it('AC-507.2 latest는 PostgREST의 소수점 6자리 시각을 읽는다', async () => {
    const stored = {
      stats_days: [
        storedDay('2026-09-01', { updated_at: '2026-10-05T01:00:00+00:00', source: 'file' }),
        storedDay('2026-09-02', { updated_at: '2026-10-05T01:00:00.123456+00:00', source: 'bit' }),
      ],
    }
    const { client } = fakeClient({ stored })
    const { latest } = await readDays(RANGE, { client })

    expect(latest).toEqual({ at: '2026-10-05T01:00:00.123456+00:00', source: 'bit' })
  })

  it('AC-507.2 latest는 소수점 자리 수가 달라도 시각으로 견준다', async () => {
    const stored = {
      stats_days: [
        storedDay('2026-09-01', { updated_at: '2026-10-05T01:00:00+00:00', source: 'file' }),
        storedDay('2026-09-02', { updated_at: '2026-10-05T10:00:00+09:00', source: 'bit' }),
        storedDay('2026-09-03', { updated_at: '2026-10-05T01:00:00.25+00:00', source: 'bit' }),
      ],
    }
    const { client } = fakeClient({ stored })
    const { latest } = await readDays(RANGE, { client })

    expect(latest).toEqual({ at: '2026-10-05T01:00:00.25+00:00', source: 'bit' })
  })

  it('AC-507.2 latest는 검사를 지난 줄에서만 정한다(화면에 없는 숫자의 출처를 보이지 않는다)', async () => {
    const stored = {
      stats_days: [
        storedDay('2026-09-01', { updated_at: '2026-10-03T01:00:00+00:00', source: 'bit' }),
        storedDay('2026-09-02', { updated_at: '2026-10-09T01:00:00+00:00', source: 'file', payload: {} }),
      ],
    }
    const { client } = fakeClient({ stored })
    const { latest, dropped } = await readDays(RANGE, { client })

    expect(latest).toEqual({ at: '2026-10-03T01:00:00+00:00', source: 'bit' })
    expect(dropped).toBe(1)
  })

  it('AC-507.2 줄이 없으면 빈 목록·dropped 0·latest null이다', async () => {
    const { client } = fakeClient()
    expect(await readDays(RANGE, { client })).toEqual({ rows: [], dropped: 0, latest: null })
  })

  it('AC-507.2 서버가 한 번에 주는 줄 수를 넘어도 그 기간 줄을 다 읽는다', async () => {
    const days = eachDay({ from: '2020-01-01', to: addDays('2020-01-01', 1202) })
    const { client, calls } = fakeClient({ stored: { stats_days: days.map((d) => storedDay(d)) } })
    const { rows } = await readDays({ from: days[0], to: days[1202] }, { client })

    expect(rows.map((r) => r.day)).toEqual(days)
    expect(calls).toHaveLength(2)
  })

  it.each(['error', 'throw'] as const)('AC-507.2 읽기 실패(%s) → E-STATS-READ-FAILED, 응답 내용은 옮기지 않는다', async (how) => {
    const { client } = fakeClient({ fail: () => how })
    const error = await failure(readDays(RANGE, { client }))

    expect(error.code).toBe('E-STATS-READ-FAILED')
    expect(error.message).not.toContain('secret detail')
    expect(error.cause).toBeUndefined()
  })

  it('AC-507.2 뒤쪽 쪽을 읽다 실패해도 E-STATS-READ-FAILED다(읽은 만큼만 돌려주지 않는다)', async () => {
    const days = eachDay({ from: '2020-01-01', to: addDays('2020-01-01', 1202) })
    const { client } = fakeClient({
      stored: { stats_days: days.map((d) => storedDay(d)) },
      fail: (c) => ((c as ReadCall).range?.[0] === 1000 ? 'error' : null),
    })
    const error = await failure(readDays({ from: days[0], to: days[1202] }, { client }))

    expect(error.code).toBe('E-STATS-READ-FAILED')
  })

  it('AC-507.2 deps가 없으면 supabaseBrowser()로 읽고, 만들지 못하면 E-STATS-READ-FAILED다', async () => {
    const { client, calls } = fakeClient()
    supabaseBrowser.mockReturnValueOnce(client)
    await readDays(RANGE)
    expect(calls).toHaveLength(1)

    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error(RAW)
    })
    expect((await failure(readDays(RANGE))).code).toBe('E-STATS-READ-FAILED')
  })
})

describe('AC-507.2 readMonths', () => {
  const RANGE = { from: '2026-01', to: '2026-09' }

  it('AC-507.2 정해 둔 칸을 그 기간만, 달 순으로 읽어 달라고 한다', async () => {
    const { client, calls } = fakeClient()
    await readMonths(RANGE, { client })

    const [call] = readsOf(calls)
    expect(call.table).toBe('stats_months')
    expect(call.columns).toBe('month, partial, source, payload, updated_at')
    expect(call.filters).toEqual(
      expect.arrayContaining([
        ['gte', 'month', '2026-01'],
        ['lte', 'month', '2026-09'],
      ]),
    )
    expect(call.orders[0]).toEqual(['month', { ascending: true }])
  })

  it('AC-507.2 그 기간 줄만 달 순으로 돌려주고, 검사에 걸린 줄 수와 가장 최근 updated_at·source를 준다', async () => {
    const stored = {
      stats_months: [
        storedMonth('2026-09', { updated_at: '2026-10-02T01:00:00+00:00', source: 'bit' }),
        storedMonth('2025-12'),
        storedMonth('2026-02', { updated_at: '2026-10-04T01:00:00+00:00', source: 'file' }),
        storedMonth('2026-03', { payload: { schemaVersion: 2, month: '2026-03' } }),
        storedMonth('2026-04', { payload: monthPayload('2026-05') }),
        storedMonth('2026-10'),
      ],
    }
    const { client } = fakeClient({ stored })
    const { rows, dropped, latest } = await readMonths(RANGE, { client })

    expect(rows.map((r) => r.month)).toEqual(['2026-02', '2026-09'])
    expect(dropped).toBe(2)
    expect(latest).toEqual({ at: '2026-10-04T01:00:00+00:00', source: 'file' })
  })

  it('AC-507.2 줄이 없으면 빈 목록·dropped 0·latest null이다', async () => {
    const { client } = fakeClient()
    expect(await readMonths(RANGE, { client })).toEqual({ rows: [], dropped: 0, latest: null })
  })

  it.each(['error', 'throw'] as const)('AC-507.2 읽기 실패(%s) → E-STATS-READ-FAILED', async (how) => {
    const { client } = fakeClient({ fail: () => how })
    const error = await failure(readMonths(RANGE, { client }))

    expect(error.code).toBe('E-STATS-READ-FAILED')
    expect(error.cause).toBeUndefined()
  })
})

describe('AC-507.2 readCoverage', () => {
  const RANGE = { from: '2026-09-10', to: '2026-09-20' }
  const covered = (from_day: string, to_day: string): Stored => ({ from_day, to_day, source: 'bit', created_at: AT })

  it('AC-507.2 그 기간과 겹치는 줄을 읽어 달라고 한다', async () => {
    const { client, calls } = fakeClient()
    await readCoverage(RANGE, { client })

    const [call] = readsOf(calls)
    expect(call.table).toBe('stats_coverage')
    expect(call.columns.split(',').map((c) => c.trim())).toEqual(expect.arrayContaining(['from_day', 'to_day']))
    expect(call.filters).toEqual(
      expect.arrayContaining([
        ['lte', 'from_day', '2026-09-20'],
        ['gte', 'to_day', '2026-09-10'],
      ]),
    )
    expect(call.orders[0][0]).toBe('from_day')
  })

  it('AC-507.2 겹치는 덮은 기간만 mergeRanges로 합쳐 준다 — 겹침·맞닿음은 하나, 떨어지면 따로, 기간 밖은 뺀다', async () => {
    const stored = {
      stats_coverage: [
        covered('2026-09-18', '2026-09-25'),
        covered('2026-09-01', '2026-09-10'),
        covered('2026-09-11', '2026-09-12'), // 앞 줄과 맞닿음
        covered('2026-09-05', '2026-09-08'), // 앞 줄 안
        covered('2026-08-01', '2026-09-09'), // 기간과 안 겹침: 읽지 않는다
        covered('2026-09-21', '2026-09-30'), // 기간과 안 겹침: 읽지 않는다
      ],
    }
    const { client } = fakeClient({ stored })

    expect(await readCoverage(RANGE, { client })).toEqual([
      { from: '2026-09-01', to: '2026-09-12' },
      { from: '2026-09-18', to: '2026-09-25' },
    ])
  })

  it('AC-507.2 날짜가 아닌 줄은 빼고 합친다', async () => {
    const stored = { stats_coverage: [covered('2026-09-10', '2026-09-12'), covered('2026-09-11', 'nope')] }
    const { client } = fakeClient({ stored })

    expect(await readCoverage(RANGE, { client })).toEqual([{ from: '2026-09-10', to: '2026-09-12' }])
  })

  it('AC-507.2 줄이 없으면 빈 목록이다', async () => {
    const { client } = fakeClient()
    expect(await readCoverage(RANGE, { client })).toEqual([])
  })

  it('AC-507.2 넣기만 하는 표라 줄이 많아도 다 읽어 합친다(서버가 한 번에 주는 줄 수를 넘어도)', async () => {
    // 이틀에 하루씩 떨어진 하루짜리 줄 1205개: 하나도 합쳐지지 않아 빠진 줄이 그대로 보인다
    const days = Array.from({ length: 1205 }, (_, i) => addDays('2020-01-01', i * 2))
    const { client, calls } = fakeClient({ stored: { stats_coverage: days.map((d) => covered(d, d)) } })
    const merged = await readCoverage({ from: days[0], to: days[1204] }, { client })

    expect(merged.map((r) => r.from)).toEqual(days)
    expect(calls).toHaveLength(2)
  })

  it.each(['error', 'throw'] as const)('AC-507.2 읽기 실패(%s) → E-STATS-READ-FAILED', async (how) => {
    const { client } = fakeClient({ fail: () => how })
    const error = await failure(readCoverage(RANGE, { client }))

    expect(error.code).toBe('E-STATS-READ-FAILED')
    expect(error.cause).toBeUndefined()
  })
})
