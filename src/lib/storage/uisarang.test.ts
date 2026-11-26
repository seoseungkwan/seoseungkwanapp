import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, eachDay } from '@/lib/analytics/dates'
import { planUisSave, toUisDayPayload } from '@/lib/payload/uisarang'
import { validateDayPayload } from '@/lib/payload/validate'
import type { RevenueDayRow } from '@/types/revenue'
import type { UisAgePayload, UisFileResult, UisPlan, UisRxPayload } from '@/types/uisarang'
import { StorageError } from './stats'
import { readUisHave, readUisPeriods, saveUisPlan } from './uisarang'

// 의사랑 숫자 저장·읽기(specs/uisarang-upload design.md §9). 실제 Supabase에 붙지 않는다 — 가짜 클라이언트가 어느 표·함수에 어떤 칸이
// 나갔는지 적어 두고, 읽기는 받은 조건대로 걸러 돌려준다. 권한·제약은 supabase/uisarangUpload.rls.test.ts(TASK-1)가 본다.
// 환자 글자·파일 이름은 지어낸 것이고, 요청 본문에 하나도 없어야 한다(AC-8815.2)
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

beforeEach(() => {
  supabaseBrowser.mockReset()
})

const RAW = 'permission denied for table uis_periods (secret detail)' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const SERVER_MAX_ROWS = 1000

type Stored = Record<string, unknown>
type Filter = ['eq' | 'gte' | 'lte', string, unknown]
type Call =
  | { kind: 'write'; table: string; op: 'upsert' | 'insert'; rows: Stored[]; options?: unknown }
  | { kind: 'read'; table: string; columns: string; filters: Filter[]; orders: string[]; range: [number, number] | null }
  | { kind: 'rpc'; fn: string; args: Record<string, unknown> }
type Setup = { stored?: Record<string, Stored[]>; fail?: (call: Call) => 'error' | 'throw' | null }

function fakeClient({ stored = {}, fail = () => null }: Setup = {}) {
  const calls: Call[] = []
  const answer = (call: Call, data: () => unknown) => ({
    then(ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) {
      return Promise.resolve()
        .then(() => {
          calls.push(call)
          const how = fail(call)
          if (how === 'throw') throw new Error(RAW)
          return how === 'error' ? { data: null, error: { message: RAW, code: '42501' } } : { data: data(), error: null }
        })
        .then(ok, no)
    },
  })
  const compare = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
  const read = (table: string, columns: string) => {
    const call: Extract<Call, { kind: 'read' }> = { kind: 'read', table, columns, filters: [], orders: [], range: null }
    const rows = () => {
      const kept = (stored[table] ?? []).filter((row) =>
        call.filters.every(([op, column, value]) =>
          op === 'eq' ? row[column] === value : op === 'gte' ? compare(row[column], value) >= 0 : compare(row[column], value) <= 0,
        ),
      )
      for (const column of [...call.orders].reverse()) kept.sort((a, b) => compare(a[column], b[column]))
      const [start, end] = call.range ?? [0, SERVER_MAX_ROWS - 1]
      return kept.slice(start, Math.min(end + 1, start + SERVER_MAX_ROWS))
    }
    const builder = {
      eq(column: string, value: unknown) {
        call.filters.push(['eq', column, value])
        return builder
      },
      gte(column: string, value: unknown) {
        call.filters.push(['gte', column, value])
        return builder
      },
      lte(column: string, value: unknown) {
        call.filters.push(['lte', column, value])
        return builder
      },
      order(column: string) {
        call.orders.push(column)
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
  const client = {
    from: (table: string) => ({
      upsert: (rows: Stored[], options?: unknown) => answer({ kind: 'write', table, op: 'upsert', rows, options }, () => null),
      insert: (rows: Stored | Stored[]) => answer({ kind: 'write', table, op: 'insert', rows: [rows].flat() }, () => null),
      select: (columns: string) => read(table, columns),
    }),
    rpc: (fn: string, args: Record<string, unknown>) => answer({ kind: 'rpc', fn, args }, () => null),
  }
  return { client: client as never, calls }
}

const writes = (calls: Call[], table: string) => calls.filter((c): c is Extract<Call, { kind: 'write' }> => c.kind === 'write' && c.table === table)
const rpcs = (calls: Call[]) => calls.filter((c): c is Extract<Call, { kind: 'rpc' }> => c.kind === 'rpc')
const reads = (calls: Call[]) => calls.filter((c): c is Extract<Call, { kind: 'read' }> => c.kind === 'read')

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
// save_revenue_range가 받는 날 줄(지금 createRevenueStore의 칸 그대로 · 참고 금액 null)
const dbDay = (row: RevenueDayRow) => ({
  day: row.date,
  visits: row.visits,
  new_patients: row.newPatients,
  return_visits: row.returnVisits,
  total: row.total,
  insurer: row.insurer,
  noncovered: row.noncovered,
  copay: row.copay,
  other_total: row.otherTotal,
  cash: row.cash,
  card: row.card,
  transfer: row.transfer,
  receivable_in: row.receivableIn,
  unconfirmed: row.unconfirmed,
  split_unconfirmed: row.splitUnconfirmed,
  rough_total: null,
})
const rxPayload = (codes: string[] = ['CRYO 대관절', 'ESWT 1부위']): UisRxPayload => ({
  v: 1,
  rows: codes.map((code) => ({ code, name: `${code} 처방`, qty: 2.5, amount: 1000 })),
  total: codes.length * 1000,
})
const agePayload = (): UisAgePayload => ({ v: 1, patients: 3, newPatients: 1, bands: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0], newBands: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0] })

const plan = (over: Partial<UisPlan> = {}): UisPlan => ({
  stats: [
    {
      files: [2],
      covered: { from: '2026-11-02', to: '2026-11-08' },
      days: [toUisDayPayload({ day: '2026-11-02', patients: 30, newPatients: 4 }), toUisDayPayload({ day: '2026-11-03', patients: 25, newPatients: 2 })],
    },
  ],
  revenue: [
    { files: [0, 4], row: revenueRow('2026-11-02') },
    { files: [5], row: revenueRow('2026-11-03', { total: null, insurer: null, copay: null, noncovered: null, otherTotal: null, cash: null, card: null, transfer: null, receivableIn: null, unconfirmed: true }) },
  ],
  periods: [
    { files: [1], kind: 'rx', from: '2026-10-01', to: '2026-10-31', payload: rxPayload() },
    { files: [3], kind: 'age', from: '2026-11-02', to: '2026-11-02', payload: agePayload() },
  ],
  refused: [],
  ...over,
})

describe('AC-8808.3 saveUisPlan: 날 숫자 · 매출 · 처방·나이대 저장', () => {
  it('AC-8808.3: 날 숫자는 saveStats(출처 uisarang · 달 줄 없음), 매출은 날마다 save_revenue_range(날 단위 처방 줄 null), 처방·나이대는 uis_periods upsert로 저장하고 실패 없음이면 failed가 빈다', async () => {
    const { client, calls } = fakeClient()
    expect(await saveUisPlan(plan(), { client })).toEqual({ failed: [] })

    expect(writes(calls, 'stats_months')).toEqual([])
    expect(writes(calls, 'stats_days')).toEqual([
      {
        kind: 'write',
        table: 'stats_days',
        op: 'upsert',
        options: { onConflict: 'hospital_id,day' },
        // payload는 saveStats가 검사한 값(validateDayPayload)이다
        rows: plan().stats[0].days.map((payload) => ({ day: payload.day, partial: false, source: 'uisarang', payload: validateDayPayload(payload) })),
      },
    ])
    expect(writes(calls, 'stats_coverage')).toEqual([
      { kind: 'write', table: 'stats_coverage', op: 'insert', rows: [{ from_day: '2026-11-02', to_day: '2026-11-08', source: 'uisarang' }] },
    ])
    expect(rpcs(calls)).toEqual(
      plan().revenue.map(({ row }) => ({
        kind: 'rpc',
        fn: 'save_revenue_range',
        args: { p_from: row.date, p_to: row.date, p_days: [dbDay(row)], p_day_codes: null },
      })),
    )
    expect(writes(calls, 'uis_periods')).toEqual([
      {
        kind: 'write',
        table: 'uis_periods',
        op: 'upsert',
        options: { onConflict: 'hospital_id,kind,from_day,to_day' },
        rows: [
          { kind: 'rx', from_day: '2026-10-01', to_day: '2026-10-31', payload: rxPayload() },
          { kind: 'age', from_day: '2026-11-02', to_day: '2026-11-02', payload: agePayload() },
        ],
      },
    ])
  })

  it('AC-8808.3: 처방·나이대 줄에는 kind·from_day·to_day·payload 칸만 있다(hospital_id·updated_at은 DB가 정한다)', async () => {
    const { client, calls } = fakeClient()
    await saveUisPlan(plan(), { client })
    for (const row of writes(calls, 'uis_periods').flatMap((c) => c.rows)) expect(Object.keys(row).sort()).toEqual(['from_day', 'kind', 'payload', 'to_day'])
  })

  it('AC-8808.3: 처방·나이대는 50줄씩 나눠 보낸다(120줄 → 50·50·20)', async () => {
    const days = eachDay({ from: '2026-07-01', to: addDays('2026-07-01', 119) })
    const periods = days.map((day, i) => ({ files: [i], kind: 'age' as const, from: day, to: day, payload: agePayload() }))
    const { client, calls } = fakeClient()
    expect(await saveUisPlan(plan({ stats: [], revenue: [], periods }), { client })).toEqual({ failed: [] })
    expect(writes(calls, 'uis_periods').map((c) => c.rows.length)).toEqual([50, 50, 20])
  })

  it('AC-8808.3: 줄 하나가 실패해도 나머지는 계속하고, 실패한 줄의 파일 차례 번호만 한 번씩 차례로 돌려준다(오류 글 없음)', async () => {
    const { client, calls } = fakeClient({
      fail: (call) =>
        (call.kind === 'rpc' && call.args.p_from === '2026-11-02') || (call.kind === 'write' && call.table === 'stats_days') ? 'error' : null,
    })
    const result = await saveUisPlan(plan({ stats: [{ ...plan().stats[0], files: [2, 0] }] }), { client })
    expect(result).toEqual({ failed: [0, 2, 4] })
    expect(JSON.stringify(result)).not.toContain('secret')
    // 날 숫자가 실패한 뒤에도 매출 다음 날·처방·나이대는 보냈다
    expect(rpcs(calls).map((c) => c.args.p_from)).toEqual(['2026-11-02', '2026-11-03'])
    expect(writes(calls, 'uis_periods')).toHaveLength(1)
  })

  it('AC-8808.3: 처방·나이대 묶음이 실패하면 그 묶음 줄의 파일만 실패이고 다음 묶음은 보낸다', async () => {
    const days = eachDay({ from: '2026-07-01', to: addDays('2026-07-01', 59) })
    const periods = days.map((day, i) => ({ files: [i + 10], kind: 'age' as const, from: day, to: day, payload: agePayload() }))
    let batch = 0
    const { client, calls } = fakeClient({ fail: (call) => (call.kind === 'write' && call.table === 'uis_periods' && batch++ === 0 ? 'throw' : null) })
    const result = await saveUisPlan(plan({ stats: [], revenue: [], periods }), { client })
    expect(result.failed).toEqual(days.slice(0, 50).map((_, i) => i + 10))
    expect(writes(calls, 'uis_periods').map((c) => c.rows.length)).toEqual([50, 10])
  })

  it('AC-8808.3: 검사를 못 지난 처방·나이대 모양은 보내지 않고 그 파일만 실패다', async () => {
    const sneaky = { ...rxPayload(), rows: [{ ...rxPayload().rows[0], chartNo: '87654321' }] } as unknown as UisRxPayload
    const { client, calls } = fakeClient()
    const result = await saveUisPlan(plan({ stats: [], revenue: [], periods: [{ files: [7], kind: 'rx', from: '2026-11-02', to: '2026-11-02', payload: sneaky }, plan().periods[1]] }), { client })
    expect(result).toEqual({ failed: [7] })
    expect(JSON.stringify(calls)).not.toContain('87654321')
    expect(writes(calls, 'uis_periods').flatMap((c) => c.rows)).toEqual([{ kind: 'age', from_day: '2026-11-02', to_day: '2026-11-02', payload: agePayload() }])
  })

  it('AC-8808.3: 클라이언트를 만들지 못하면 던지지 않고 모든 파일이 실패다', async () => {
    supabaseBrowser.mockImplementation(() => {
      throw new Error(RAW)
    })
    expect(await saveUisPlan(plan())).toEqual({ failed: [0, 1, 2, 3, 4, 5] })
  })

  it('AC-8808.3: deps가 없으면 supabaseBrowser()로 보낸다', async () => {
    const { client, calls } = fakeClient()
    supabaseBrowser.mockReturnValue(client)
    expect(await saveUisPlan(plan())).toEqual({ failed: [] })
    expect(calls.length).toBeGreaterThan(0)
  })

  it('AC-8808.3: 계획이 비었으면 아무것도 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    expect(await saveUisPlan({ stats: [], revenue: [], periods: [], refused: [] }, { client })).toEqual({ failed: [] })
    expect(calls).toEqual([])
  })
})

describe('AC-8808.4 같은 날을 다시 올림', () => {
  it('AC-8808.4: 다시 저장해도 같은 줄 열쇠로 보낸다 — 날 숫자(병원·날)·매출(그 날 범위 바꿈)·처방·나이대(병원·종류·기간)가 새 숫자로 바뀐다', async () => {
    const { client, calls } = fakeClient()
    await saveUisPlan(plan(), { client })
    const again = plan({
      stats: [{ files: [0], covered: { from: '2026-11-02', to: '2026-11-02' }, days: [toUisDayPayload({ day: '2026-11-02', patients: 31, newPatients: 5 })] }],
      revenue: [{ files: [1], row: revenueRow('2026-11-02', { visits: 41 }) }],
      periods: [{ files: [2], kind: 'rx', from: '2026-10-01', to: '2026-10-31', payload: rxPayload(['CRYO 대관절']) }],
    })
    await saveUisPlan(again, { client })
    const dayWrites = writes(calls, 'stats_days')
    expect(dayWrites.map((c) => c.options)).toEqual([{ onConflict: 'hospital_id,day' }, { onConflict: 'hospital_id,day' }])
    expect(dayWrites[1].rows).toEqual([{ day: '2026-11-02', partial: false, source: 'uisarang', payload: validateDayPayload(again.stats[0].days[0]) }])
    expect(rpcs(calls).at(-1)?.args).toEqual({ p_from: '2026-11-02', p_to: '2026-11-02', p_days: [dbDay(again.revenue[0].row)], p_day_codes: null })
    const periodWrites = writes(calls, 'uis_periods')
    expect(periodWrites.map((c) => c.options)).toEqual([{ onConflict: 'hospital_id,kind,from_day,to_day' }, { onConflict: 'hospital_id,kind,from_day,to_day' }])
    expect(periodWrites[1].rows).toEqual([{ kind: 'rx', from_day: '2026-10-01', to_day: '2026-10-31', payload: rxPayload(['CRYO 대관절']) }])
  })
})

describe('AC-8815.2 요청 본문에 환자 글자·파일 이름이 없다', () => {
  const NAME = '홍길동'
  const RRN = '9001011234567'
  const PHONE = '010-0000-0000'
  const ADDRESS = '서울시 가짜동'
  const CHART = '87654321'
  const FILE = '내원일별환자현황_아래쪽.xls'

  it('AC-8815.2: Worker 결과에 다른 칸이 섞여 와도 계획 → 저장 요청 본문 모두에 그 글자가 하나도 없다', async () => {
    const extra = { patientName: NAME, rrn: RRN, phone: PHONE, address: ADDRESS, chartNo: CHART, fileName: FILE }
    const day = (d: string) => ({ from: d, to: d, unit: 'day' as const })
    const results = [
      { status: 'read', read: { kind: 'income', span: day('2026-11-02'), row: { ...revenueRow('2026-11-02'), ...extra } }, ...extra },
      { status: 'read', read: { kind: 'visits', span: day('2026-11-02'), days: [{ day: '2026-11-02', patients: 3, newPatients: 1, ...extra }] } },
      { status: 'read', read: { kind: 'visitPatients', span: day('2026-11-02'), payload: agePayload() } },
      { status: 'read', read: { kind: 'rx', span: day('2026-11-02'), payload: rxPayload() } },
      { status: 'read', read: { kind: 'rx', span: day('2026-11-03'), payload: { ...rxPayload(), rows: [{ ...rxPayload().rows[0], ...extra }] } } },
    ] as unknown as UisFileResult[]
    const { client, calls } = fakeClient()
    const saved = await saveUisPlan(planUisSave(results), { client })
    expect(saved).toEqual({ failed: [] })
    expect(calls.length).toBeGreaterThan(0)
    const bodies = JSON.stringify(calls)
    for (const text of [NAME, RRN, PHONE, ADDRESS, CHART, FILE, 'patientName', 'fileName', 'chartNo']) expect(bodies, text).not.toContain(text)
  })

  it('AC-8815.2: 저장 함수 소스는 lib/parsers·workers를 부르지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/storage/uisarang.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"][^'"]*(parsers|workers)/)
    expect(source).not.toMatch(/import\(['"][^'"]*(parsers|workers)/)
    expect(source).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|console)\b/)
  })
})

const AT = '2026-11-20T01:00:00.123456+00:00'
const periodRow = (kind: 'rx' | 'age', from: string, to: string, payload: unknown, updated_at = AT): Stored => ({ kind, from_day: from, to_day: to, payload, updated_at })

describe('AC-8808.5 readUisPeriods: 기간과 겹치는 처방·나이대 줄 읽기', () => {
  const RANGE = { from: '2026-11-01', to: '2026-11-30' }

  it('AC-8808.5: 정해 둔 칸을 그 종류·겹치는 줄만 차례로 1,000줄씩 읽어 달라고 한다', async () => {
    const { client, calls } = fakeClient()
    await readUisPeriods('rx', RANGE, { client })
    expect(reads(calls)).toEqual([
      {
        kind: 'read',
        table: 'uis_periods',
        columns: 'kind, from_day, to_day, payload, updated_at',
        filters: [
          ['eq', 'kind', 'rx'],
          ['lte', 'from_day', '2026-11-30'],
          ['gte', 'to_day', '2026-11-01'],
        ],
        orders: ['from_day', 'to_day'],
        range: [0, 999],
      },
    ])
  })

  it('AC-8808.5: 겹치는 줄을 검사를 지난 것만 {kind, from, to, payload, updatedAt}로 준다', async () => {
    const stored = {
      uis_periods: [
        periodRow('rx', '2026-10-01', '2026-10-31', rxPayload()), // 겹치지 않음
        periodRow('rx', '2026-10-26', '2026-11-01', rxPayload()), // 앞 끝이 걸침
        periodRow('rx', '2026-11-01', '2026-11-30', rxPayload()),
        periodRow('rx', '2026-11-03', '2026-11-03', { ...rxPayload(), v: 2 }), // 검사에 걸림
        periodRow('rx', '2026-11-04', '2026-11-04', { ...rxPayload(), rows: [{ code: 'A', name: 'a', qty: 1, amount: 1, patients: 1 }] }), // 환자 수 칸
        periodRow('rx', '2026-11-05', '2026-11-06', rxPayload()), // 하루·한 주·한 달 모양이 아님
        periodRow('rx', 'nope', '2026-11-07', rxPayload()),
        periodRow('age', '2026-11-02', '2026-11-02', agePayload()), // 다른 종류
        periodRow('rx', '2026-11-30', '2026-12-06', rxPayload()), // 뒤 끝이 걸침
      ],
    }
    const { client } = fakeClient({ stored })
    expect(await readUisPeriods('rx', RANGE, { client })).toEqual([
      { kind: 'rx', from: '2026-10-26', to: '2026-11-01', payload: rxPayload(), updatedAt: AT },
      { kind: 'rx', from: '2026-11-01', to: '2026-11-30', payload: rxPayload(), updatedAt: AT },
      { kind: 'rx', from: '2026-11-30', to: '2026-12-06', payload: rxPayload(), updatedAt: AT },
    ])
  })

  it('AC-8808.5: 나이대는 하루 줄만 받는다', async () => {
    const stored = {
      uis_periods: [periodRow('age', '2026-11-02', '2026-11-02', agePayload()), periodRow('age', '2026-11-02', '2026-11-08', agePayload()), periodRow('age', '2026-11-03', '2026-11-03', { ...agePayload(), patients: 9 })],
    }
    const { client } = fakeClient({ stored })
    expect(await readUisPeriods('age', RANGE, { client })).toEqual([{ kind: 'age', from: '2026-11-02', to: '2026-11-02', payload: agePayload(), updatedAt: AT }])
  })

  it('AC-8808.5: 서버가 한 번에 주는 줄 수를 넘어도 다 읽는다', async () => {
    const days = eachDay({ from: '2023-01-01', to: addDays('2023-01-01', 1499) })
    const { client, calls } = fakeClient({ stored: { uis_periods: days.map((d) => periodRow('age', d, d, agePayload())) } })
    const rows = await readUisPeriods('age', { from: '2023-01-01', to: '2030-12-31' }, { client })
    expect(rows).toHaveLength(1500)
    expect(reads(calls).map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it.each(['error', 'throw'] as const)('AC-8808.5: 읽다 실패하면(%s) StorageError E-UIS-READ-FAILED이고 서버 글은 옮기지 않는다', async (how) => {
    const { client } = fakeClient({ fail: () => how })
    const error: unknown = await readUisPeriods('rx', RANGE, { client }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(StorageError)
    expect((error as StorageError).code).toBe('E-UIS-READ-FAILED')
    expect(String((error as Error).message)).not.toContain('secret')
  })

  it('AC-8808.5: deps가 없으면 supabaseBrowser()로 읽고, 만들지 못하면 E-UIS-READ-FAILED다', async () => {
    const { client } = fakeClient()
    supabaseBrowser.mockReturnValueOnce(client)
    expect(await readUisPeriods('rx', RANGE)).toEqual([])
    supabaseBrowser.mockImplementationOnce(() => {
      throw new Error(RAW)
    })
    await expect(readUisPeriods('rx', RANGE)).rejects.toMatchObject({ code: 'E-UIS-READ-FAILED' })
  })
})

describe('AC-8808.6 readUisHave: 아직 없는 파일을 보려고 한 번에 읽기', () => {
  const RANGE = { from: '2026-11-02', to: '2026-11-04' }
  const dayRow = (day: string, patients: number, source = 'uisarang') => ({
    day,
    partial: false,
    source,
    payload: toUisDayPayload({ day, patients, newPatients: 0 }),
    updated_at: AT,
  })
  const salesRow = (day: string) => ({ ...dbDay(revenueRow(day)), day_codes: false })

  it('AC-8808.6: 덮은 날 · 진료한 날(환자 1명 이상) · 매출 날 · 처방 기간 · 나이대 날을 준다', async () => {
    const stored = {
      stats_coverage: [
        { from_day: '2026-11-02', to_day: '2026-11-02', source: 'uisarang' },
        { from_day: '2026-11-03', to_day: '2026-11-03', source: 'uisarang' },
      ],
      stats_days: [dayRow('2026-11-02', 30), dayRow('2026-11-03', 0)],
      sales_days: [salesRow('2026-11-02'), salesRow('2026-11-04')],
      uis_periods: [
        periodRow('rx', '2026-11-01', '2026-11-30', rxPayload()),
        periodRow('rx', '2026-11-02', '2026-11-02', rxPayload()),
        periodRow('age', '2026-11-02', '2026-11-02', agePayload()),
      ],
    }
    const { client } = fakeClient({ stored })
    expect(await readUisHave(RANGE, { client })).toEqual({
      covered: [{ from: '2026-11-02', to: '2026-11-03' }],
      worked: ['2026-11-02'],
      income: ['2026-11-02', '2026-11-04'],
      rx: [
        { from: '2026-11-01', to: '2026-11-30' },
        { from: '2026-11-02', to: '2026-11-02' },
      ],
      age: ['2026-11-02'],
    })
  })

  it.each(['stats_coverage', 'stats_days', 'sales_days', 'uis_periods'])('AC-8808.6: %s 읽기가 실패하면 E-UIS-READ-FAILED다', async (table) => {
    const { client } = fakeClient({ fail: (call) => (call.kind === 'read' && call.table === table ? 'error' : null) })
    await expect(readUisHave(RANGE, { client })).rejects.toMatchObject({ code: 'E-UIS-READ-FAILED' })
  })

  it('AC-8808.6: 클라이언트를 만들지 못하면 E-UIS-READ-FAILED다', async () => {
    supabaseBrowser.mockImplementation(() => {
      throw new Error(RAW)
    })
    await expect(readUisHave(RANGE)).rejects.toBeInstanceOf(StorageError)
    await expect(readUisHave(RANGE)).rejects.toMatchObject({ code: 'E-UIS-READ-FAILED' })
  })
})
