import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  emptyWorklogDay,
  MEMO_FONT_PTS,
  type MemoFontPt,
  type WorklogCellKey,
  type WorklogChanges,
  type WorklogDay,
  type WorklogNumberKey,
} from '@/types/worklog'
import { WorklogStorageError, loadWorklogDay, saveWorklogDay } from './worklogDays'

// 하루 읽기·저장 (REQ-005). 실제 Supabase에 붙지 않는다. 숫자·글자·번호는 모두 지어낸 것이다

const YMD = '2020-01-02'
const VALUES =
  'new_patients,return_patients,' +
  'total_fee,claim_amount,cash_in,card_in,transfer_in,local_currency_in,unpaid_new,unpaid_paid,' +
  'spend_cash,spend_card,spend_refund,spend_free,' +
  'note_cash,note_card,note_refund,note_free,note_total,' +
  'memo,' +
  'name_total_fee,name_claim_amount,name_cash_in,name_card_in,name_transfer_in,name_local_currency_in,name_unpaid_new,name_unpaid_paid,' +
  'name_spend_cash,name_spend_card,name_spend_refund,name_spend_free'
const SELECT = `${VALUES},bit_fields,memo_font_pt`
const PHONE = '010-0000-1234'
const SECRET = 'secret detail'

// 칸이 뒤바뀌면 잡히도록 칸마다 다른 값이다
const CELLS: readonly (readonly [WorklogCellKey, string, string])[] = [
  ['newPatients', 'new_patients', '10'],
  ['returnPatients', 'return_patients', '20'],
  ['totalFee', 'total_fee', '100000'],
  ['claimAmount', 'claim_amount', '200000'],
  ['cashIn', 'cash_in', '300000'],
  ['cardIn', 'card_in', '400000'],
  ['transferIn', 'transfer_in', '500000'],
  ['localCurrencyIn', 'local_currency_in', '600000'],
  ['unpaidNew', 'unpaid_new', '700000'],
  ['unpaidPaid', 'unpaid_paid', '800000'],
  ['spendCash', 'spend_cash', '900000'],
  ['spendCard', 'spend_card', '1000000'],
  ['spendRefund', 'spend_refund', '1100000'],
  ['spendFree', 'spend_free', '1200000'],
  ['noteCash', 'note_cash', '가상 현금 비고'],
  ['noteCard', 'note_card', '가상 카드 비고'],
  ['noteRefund', 'note_refund', '가상 환불 비고'],
  ['noteFree', 'note_free', '가상 free 비고'],
  ['noteTotal', 'note_total', '가상 합계 비고'],
  ['memo', 'memo', '가상 업무사항'],
  ['nameTotalFee', 'name_total_fee', '가상 총진료'],
  ['nameClaimAmount', 'name_claim_amount', '가상 청구'],
  ['nameCashIn', 'name_cash_in', '가상 현금수납'],
  ['nameCardIn', 'name_card_in', '가상 카드수납'],
  ['nameTransferIn', 'name_transfer_in', '가상 이체'],
  ['nameLocalCurrencyIn', 'name_local_currency_in', '가상 화폐'],
  ['nameUnpaidNew', 'name_unpaid_new', '가상 미수'],
  ['nameUnpaidPaid', 'name_unpaid_paid', '가상 입금'],
  ['nameSpendCash', 'name_spend_cash', '가상 현금'],
  ['nameSpendCard', 'name_spend_card', '가상 카드'],
  ['nameSpendRefund', 'name_spend_refund', '가상 환불'],
  ['nameSpendFree', 'name_spend_free', '가상 무료'],
]
const FULL_DAY = Object.fromEntries(CELLS.map(([key, , text]) => [key, text])) as WorklogDay
const FULL_COLUMNS = Object.fromEntries(CELLS.map(([, column, text]) => [column, text]))
const ONE_CELL: WorklogChanges = { spendCash: '900000' }
const ONE_COLUMN = { spend_cash: '900000' }

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }

// postgrest-js가 돌려주는 실패 응답과 같은 모양
function failure(status: number, message = SECRET): Reply {
  return { data: null, error: { message, details: SECRET, hint: SECRET, code: SECRET }, status }
}

// 받은 표 이름·select 글자·거르기·upsert를 기록하는 가짜 클라이언트
function fakeClient(reply: Reply = OK) {
  const calls = {
    from: [] as string[],
    select: [] as string[],
    eq: [] as [string, unknown][],
    maybeSingle: 0,
    upsert: [] as { row: Record<string, unknown>; options: unknown }[],
  }
  const filter = {
    eq(column: string, value: unknown) {
      calls.eq.push([column, value])
      return filter
    },
    maybeSingle() {
      calls.maybeSingle += 1
      return Promise.resolve(reply)
    },
  }
  const client = {
    from(table: string) {
      calls.from.push(table)
      return {
        select(columns: string) {
          calls.select.push(columns)
          return filter
        },
        upsert(row: Record<string, unknown>, options: unknown) {
          calls.upsert.push({ row, options })
          return Promise.resolve(reply)
        },
      }
    },
  } as unknown as Pick<SupabaseClient, 'from'>
  return { client, calls }
}

// 진짜 postgrest-js에 가짜 fetch만 넣는다. 가짜 클라이언트가 실제 응답 모양과 어긋나지 않는지 본다
function realClient(fakeFetch: typeof fetch) {
  return createClient('http://localhost:54321', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  })
}

async function savedRow(
  changes: WorklogChanges,
  bitFields?: readonly WorklogNumberKey[],
  memoFontPt?: MemoFontPt,
): Promise<Record<string, unknown> | undefined> {
  const { client, calls } = fakeClient()
  await saveWorklogDay(client, YMD, changes, bitFields, memoFontPt)
  expect(calls.upsert.length).toBeLessThanOrEqual(1)
  return calls.upsert[0]?.row
}

async function caught(run: () => Promise<unknown>): Promise<WorklogStorageError> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(WorklogStorageError)
  return thrown as WorklogStorageError
}

function expectNoSecret(error: WorklogStorageError) {
  expect(error.message).not.toContain(SECRET)
  expect(String(error)).not.toContain(SECRET)
  expect(error.stack ?? '').not.toContain(SECRET)
  expect(JSON.stringify(error)).not.toContain(SECRET)
  expect(error.cause).toBeUndefined()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('loadWorklogDay', () => {
  it('AC-005.1·AC-016.1·AC-1503.1: 값 32칸과 bit_fields·memo_font_pt만 골라 그 날짜 줄 하나를 읽고 병원으로 거르지 않는다', async () => {
    const { client, calls } = fakeClient()
    await loadWorklogDay(client, YMD)
    expect(calls.from).toEqual(['worklog_days'])
    expect(calls.select).toEqual([SELECT])
    expect(VALUES.split(',')).toHaveLength(32)
    expect(calls.select[0]?.split(',')).toEqual([...VALUES.split(','), 'bit_fields', 'memo_font_pt'])
    expect(calls.select[0]).not.toContain('hospital_id')
    expect(calls.eq).toEqual([['work_date', YMD]])
    expect(calls.maybeSingle).toBe(1)
    expect(calls.upsert).toEqual([])
  })

  it('AC-005.1: 32칸 모두 제 열쇠의 글자로 바꾼다', async () => {
    const { client } = fakeClient({ ...OK, data: FULL_COLUMNS })
    await expect(loadWorklogDay(client, YMD)).resolves.toEqual({ day: FULL_DAY, bitFields: [], memoFontPt: 11 })
  })

  it('AC-005.1: 서버 null은 빈 글자이고, 값이 있는 칸의 글자는 그대로다', async () => {
    const data = { ...FULL_COLUMNS, spend_free: null, memo: null, name_cash_in: null, note_free: null, cash_in: '12,000 별도' }
    const { client } = fakeClient({ ...OK, data })
    await expect(loadWorklogDay(client, YMD)).resolves.toEqual({
      day: {
        ...FULL_DAY,
        spendFree: '',
        memo: '',
        nameCashIn: '',
        noteFree: '',
        cashIn: '12,000 별도',
      },
      bitFields: [],
      memoFontPt: 11,
    })
  })

  it('AC-005.1: 모든 칸이 null인 줄을 읽으면 emptyWorklogDay와 같다', async () => {
    const allNull = Object.fromEntries(SELECT.split(',').map((column) => [column, null]))
    const { client } = fakeClient({ ...OK, data: allNull })
    await expect(loadWorklogDay(client, YMD)).resolves.toEqual({ day: emptyWorklogDay(), bitFields: [], memoFontPt: 11 })
  })

  it('AC-005.1: 응답에 정한 칸 밖의 값이 섞여도 화면 모양에 넣지 않는다', async () => {
    const data = { ...FULL_COLUMNS, hospital_id: 'fake-hospital', updated_at: 'fake-time', work_date: YMD }
    const { client } = fakeClient({ ...OK, data })
    await expect(loadWorklogDay(client, YMD)).resolves.toEqual({ day: FULL_DAY, bitFields: [], memoFontPt: 11 })
  })

  it('AC-005.1: 그 날짜 줄이 없으면 null이다', async () => {
    const { client } = fakeClient()
    await expect(loadWorklogDay(client, YMD)).resolves.toBeNull()
  })

  it('AC-005.1: 진짜 클라이언트로도 고른 칸·날짜만 묻고, 줄이 없으면 null이다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response('[]', { status: 200 }))
    await expect(loadWorklogDay(realClient(fakeFetch), YMD)).resolves.toBeNull()
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const url = new URL(String(fakeFetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/rest/v1/worklog_days')
    expect(url.searchParams.get('select')).toBe(SELECT)
    expect(url.searchParams.get('work_date')).toBe(`eq.${YMD}`)
    expect(url.searchParams.has('hospital_id')).toBe(false)
  })

  it('AC-005.4: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    const error = await caught(() => loadWorklogDay(client, YMD))
    expect(error.kind).toBe('offline')
    expect(calls.from).toEqual([])
  })

  it('AC-005.4: 응답 status가 0이면 offline이고 오류에는 종류만 있다', async () => {
    const { client } = fakeClient(failure(0))
    const error = await caught(() => loadWorklogDay(client, YMD))
    expect(error.kind).toBe('offline')
    expect(error).not.toHaveProperty('field')
    expectNoSecret(error)
  })

  it.each([400, 401, 403, 406, 500])('AC-005.4: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const { client } = fakeClient(failure(status))
    const error = await caught(() => loadWorklogDay(client, YMD))
    expect(error.kind).toBe('failed')
    expect(error).not.toHaveProperty('field')
    expectNoSecret(error)
  })

  it('AC-005.4: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    const client = {
      from() {
        throw new Error(SECRET)
      },
    } as unknown as Pick<SupabaseClient, 'from'>
    const error = await caught(() => loadWorklogDay(client, YMD))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-005.4: 진짜 클라이언트에서 연결이 끊기면 offline이고 원문이 없다', async () => {
    // 읽기는 라이브러리가 끊긴 연결을 1·2·4초 뒤 세 번 더 해 본다. 기다리지 않게 시계만 가짜로 돌린다
    vi.useFakeTimers()
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError(SECRET)
    })
    const pending = caught(() => loadWorklogDay(realClient(fakeFetch), YMD))
    await vi.runAllTimersAsync()
    const error = await pending
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })
})

describe('saveWorklogDay', () => {
  it('AC-005.2: 표에 upsert 한 번이고 충돌 칸은 hospital_id,work_date다. 읽기·거르기는 없다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveWorklogDay(client, YMD, ONE_CELL)).resolves.toBeUndefined()
    expect(calls.from).toEqual(['worklog_days'])
    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]?.options).toEqual({ onConflict: 'hospital_id,work_date' })
    expect(calls.select).toEqual([])
    expect(calls.eq).toEqual([])
  })

  it.each(CELLS)('AC-005.2: %s 하나만 주면 row는 정확히 work_date와 %s다', async (key, column, text) => {
    await expect(savedRow({ [key]: text })).resolves.toEqual({ work_date: YMD, [column]: text })
  })

  it('AC-005.2: 칸 둘을 주면 그 둘만 보내고 안 받은 칸을 null로 채우지 않는다', async () => {
    const row = await savedRow({ cashIn: '300000', memo: '가상 업무사항' })
    expect(Object.keys(row ?? {}).sort()).toEqual(['cash_in', 'memo', 'work_date'])
    expect(row).toEqual({ work_date: YMD, cash_in: '300000', memo: '가상 업무사항' })
  })

  it('AC-005.2: undefined인 칸은 안 받은 칸이다. null로 보내 다른 PC가 고친 칸을 지우지 않는다', async () => {
    await expect(savedRow({ ...ONE_CELL, cardIn: undefined })).resolves.toEqual({ work_date: YMD, ...ONE_COLUMN })
  })

  it('AC-005.2: 32칸을 다 주면 work_date와 32칸, 값이 제 칸에 들어간다', async () => {
    const row = await savedRow(FULL_DAY)
    expect(Object.keys(row ?? {})).toHaveLength(33)
    expect(row).toEqual({ work_date: YMD, ...FULL_COLUMNS })
    expect(row).not.toHaveProperty('hospital_id')
  })

  it.each<[string, WorklogCellKey, string]>([
    ['숫자 칸', 'cashIn', 'cash_in'],
    ['비고', 'noteCash', 'note_cash'],
    ['업무사항', 'memo', 'memo'],
    ['항목 이름', 'nameCashIn', 'name_cash_in'],
  ])('AC-005.2: 빈 칸(%s)은 null로 보낸다', async (_name, key, column) => {
    await expect(savedRow({ [key]: '' })).resolves.toEqual({ work_date: YMD, [column]: null })
  })

  it('AC-005.2: 값은 저장 글자로 보낸다. 숫자 칸·항목 이름은 앞뒤 빈칸을 지운다', async () => {
    await expect(savedRow({ spendCash: '12,000 별도 ', nameSpendCash: ' 가상 항목 ' })).resolves.toEqual({
      work_date: YMD,
      spend_cash: '12,000 별도',
      name_spend_cash: '가상 항목',
    })
  })

  it('AC-005.2: 빈칸뿐인 숫자 칸과 기본 이름과 같은 항목 이름은 null이다', async () => {
    await expect(savedRow({ spendCash: '   ', nameCashIn: '현금수납', nameSpendCash: ' 현금 ' })).resolves.toEqual({
      work_date: YMD,
      spend_cash: null,
      name_cash_in: null,
      name_spend_cash: null,
    })
  })

  it('AC-005.2: 비고·업무사항은 친 그대로 보낸다', async () => {
    await expect(savedRow({ noteCash: '  가상 현금 ', noteCard: ' ', memo: ' 가상\n업무사항 ' })).resolves.toEqual({
      work_date: YMD,
      note_cash: '  가상 현금 ',
      note_card: ' ',
      memo: ' 가상\n업무사항 ',
    })
  })

  it('AC-005.2: 다른 열쇠를 억지로 섞어도 보내지 않고 날짜를 덮어쓰지 못한다', async () => {
    const mixed = {
      ...ONE_CELL,
      hospital_id: 'fake-hospital',
      hospitalId: 'fake-hospital',
      updated_at: 'fake-time',
      work_date: '1999-01-01',
      spend_cash: '1',
    } as unknown as WorklogChanges
    await expect(savedRow(mixed)).resolves.toEqual({ work_date: YMD, ...ONE_COLUMN })
  })

  it.each<[string, WorklogChanges]>([
    ['빈 값 객체', {}],
    ['정한 칸 밖 열쇠뿐', { hospital_id: 'fake-hospital' } as unknown as WorklogChanges],
    ['undefined 칸뿐', { cashIn: undefined }],
  ])('AC-005.2: 바뀐 칸이 없으면(%s) 네트워크를 부르지 않는다', async (_name, changes) => {
    const { client, calls } = fakeClient()
    await expect(saveWorklogDay(client, YMD, changes)).resolves.toBeUndefined()
    expect(calls.from).toEqual([])
    expect(calls.upsert).toEqual([])
  })

  it('AC-005.2: 바뀐 칸이 없으면 오프라인이어도 오류가 아니다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    await expect(saveWorklogDay(client, YMD, {})).resolves.toBeUndefined()
    expect(calls.from).toEqual([])
  })

  it.each<[string, WorklogCellKey, number]>([
    ['숫자 칸', 'spendFree', 51],
    ['비고', 'noteFree', 101],
    ['업무사항', 'memo', 2001],
    ['항목 이름', 'nameSpendFree', 21],
  ])('AC-005.2: 긴 글자(%s)를 몰래 자르지 않고 그대로 보낸다', async (_name, key, length) => {
    const long = '가'.repeat(length)
    const row = await savedRow({ [key]: long })
    expect(Object.values(row ?? {})).toContain(long)
  })

  it('AC-005.2: 진짜 클라이언트로도 요청 한 번, 같은 줄 덮어쓰기, 받은 칸과 날짜만 보낸다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }))
    await saveWorklogDay(realClient(fakeFetch), YMD, { ...ONE_CELL, noteCash: '' })
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [input, init] = fakeFetch.mock.calls[0] ?? []
    const url = new URL(String(input))
    expect(url.pathname).toBe('/rest/v1/worklog_days')
    expect(url.searchParams.get('on_conflict')).toBe('hospital_id,work_date')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Prefer')).toContain('resolution=merge-duplicates')
    expect(JSON.parse(String(init?.body))).toEqual({ work_date: YMD, ...ONE_COLUMN, note_cash: null })
  })

  it.each<[string, WorklogCellKey, string]>([
    ['숫자 칸 글자', 'cashIn', PHONE],
    ['비고', 'noteCash', `가상 ${PHONE}`],
    ['업무사항', 'memo', `가상 ${PHONE}`],
    ['항목 이름', 'nameCashIn', PHONE],
  ])('AC-005.3: %s에 개인정보 모양이 있으면 그 칸만 빼고 나머지를 보낸다', async (_name, key, text) => {
    const row = await savedRow({ ...ONE_CELL, [key]: text })
    expect(row).toEqual({ work_date: YMD, ...ONE_COLUMN })
    expect(JSON.stringify(row)).not.toContain(PHONE)
  })

  it.each([
    ['전화', PHONE],
    ['붙여 쓴 전화', '01000001234'],
    ['주민번호', '900101-1234567'],
    ['붙여 쓴 주민번호', '9001011234567'],
    ['메일', 'a@b.co'],
    ['앞뒤 빈칸이 붙은 전화', ` ${PHONE} `],
  ])('AC-005.3: %s 모양도 막는다', async (_shape, text) => {
    const row = await savedRow({ ...ONE_CELL, noteTotal: text, spendCard: text })
    expect(row).toEqual({ work_date: YMD, ...ONE_COLUMN })
  })

  it('AC-005.3: 막는 칸만 있으면 네트워크를 부르지 않고 오류도 아니다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveWorklogDay(client, YMD, { memo: PHONE, cashIn: PHONE })).resolves.toBeUndefined()
    expect(calls.from).toEqual([])
    expect(calls.upsert).toEqual([])
  })

  it('AC-005.3: 막는 칸만 있으면 오프라인이어도 offline을 던지지 않는다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    await expect(saveWorklogDay(client, YMD, { noteRefund: PHONE })).resolves.toBeUndefined()
    expect(calls.from).toEqual([])
  })

  it('AC-005.3: 막는 칸과 보통 칸이 있고 오프라인이면 offline이고 오류에 칸 글자가 없다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    const error = await caught(() => saveWorklogDay(client, YMD, { ...ONE_CELL, noteCash: PHONE }))
    expect(error.kind).toBe('offline')
    expect(error.message).not.toContain(PHONE)
    expect(JSON.stringify(error)).not.toContain(PHONE)
    expect(calls.from).toEqual([])
  })

  it('AC-005.4: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    const error = await caught(() => saveWorklogDay(client, YMD, ONE_CELL))
    expect(error.kind).toBe('offline')
    expect(error).not.toHaveProperty('field')
    expect(calls.from).toEqual([])
  })

  it.each([
    ['온라인', { onLine: true }],
    ['navigator 없음', undefined],
  ])('AC-005.4: %s이면 그대로 저장한다', async (_name, navigator) => {
    vi.stubGlobal('navigator', navigator)
    const { client, calls } = fakeClient()
    await saveWorklogDay(client, YMD, ONE_CELL)
    expect(calls.upsert).toHaveLength(1)
  })

  it('AC-005.4: 응답 status가 0이면 offline이고 오류에는 종류만 있다', async () => {
    const { client } = fakeClient(failure(0))
    const error = await caught(() => saveWorklogDay(client, YMD, ONE_CELL))
    expect(error.kind).toBe('offline')
    expect(error).not.toHaveProperty('field')
    expectNoSecret(error)
  })

  it.each([400, 401, 403, 409, 500])('AC-005.4: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const { client } = fakeClient(failure(status))
    const error = await caught(() => saveWorklogDay(client, YMD, ONE_CELL))
    expect(error.kind).toBe('failed')
    expect(error).not.toHaveProperty('field')
    expectNoSecret(error)
  })

  it('AC-005.4: 오류 message는 Supabase 문구가 달라도 같은 고정 글자다', async () => {
    const first = await caught(() => saveWorklogDay(fakeClient(failure(500, 'one')).client, YMD, ONE_CELL))
    const second = await caught(() => saveWorklogDay(fakeClient(failure(500, 'two')).client, YMD, ONE_CELL))
    expect(first.message).toBe(second.message)
    expect(first.message).not.toBe('')
  })

  it('AC-005.4: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    const client = {
      from() {
        return { upsert: () => Promise.reject(new Error(SECRET)) }
      },
    } as unknown as Pick<SupabaseClient, 'from'>
    const error = await caught(() => saveWorklogDay(client, YMD, ONE_CELL))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-005.4: 진짜 클라이언트에서 연결이 끊기면 offline이고 원문이 없다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError(SECRET)
    })
    const error = await caught(() => saveWorklogDay(realClient(fakeFetch), YMD, ONE_CELL))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it('AC-005.4: 진짜 클라이언트에서 DB 제약이 거부하면 failed이고 원문이 없다', async () => {
    const body = JSON.stringify({ message: SECRET, details: SECRET, hint: SECRET, code: '23514' })
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(body, { status: 400 }))
    const error = await caught(() => saveWorklogDay(realClient(fakeFetch), YMD, ONE_CELL))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })
})

describe('비트 칸 목록 bit_fields', () => {
  // 정한 열쇠 밖 이름을 억지로 넣을 때만 쓴다
  const odd = (names: readonly unknown[]) => names as unknown as WorklogNumberKey[]

  async function loadedBitFields(bitFields: unknown) {
    const { client } = fakeClient({ ...OK, data: { ...FULL_COLUMNS, bit_fields: bitFields } })
    return (await loadWorklogDay(client, YMD))?.bitFields
  }

  it('AC-016.1: 읽은 bit_fields의 DB 칸 이름을 열쇠 이름으로 바꿔 day와 같이 돌려준다', async () => {
    const { client } = fakeClient({ ...OK, data: { ...FULL_COLUMNS, bit_fields: ['new_patients', 'cash_in', 'unpaid_paid'] } })
    await expect(loadWorklogDay(client, YMD)).resolves.toEqual({
      day: FULL_DAY,
      bitFields: ['newPatients', 'cashIn', 'unpaidPaid'],
      memoFontPt: 11,
    })
  })

  it('AC-016.1: 비트가 채우는 여덟 칸을 모두 읽고, 저장된 차례를 그대로 둔다', async () => {
    const stored = ['unpaid_paid', 'transfer_in', 'card_in', 'cash_in', 'claim_amount', 'total_fee', 'return_patients', 'new_patients']
    await expect(loadedBitFields(stored)).resolves.toEqual([
      'unpaidPaid',
      'transferIn',
      'cardIn',
      'cashIn',
      'claimAmount',
      'totalFee',
      'returnPatients',
      'newPatients',
    ])
  })

  it('AC-016.1: 목록 밖 이름(손으로만 적는 칸·지금 안 채우는 칸·열쇠 이름·모르는 이름)은 버린다', async () => {
    const stored = [
      'cash_in',
      ...['spend_cash', 'memo', 'name_cash_in', 'note_cash'],
      ...['unpaid_new', 'local_currency_in'],
      ...['cashIn', 'hospital_id', '', 'CASH_IN'],
    ]
    await expect(loadedBitFields(stored)).resolves.toEqual(['cashIn'])
  })

  it('AC-016.1: 같은 이름이 여러 번 있으면 처음 한 번만 둔다', async () => {
    await expect(loadedBitFields(['card_in', 'cash_in', 'card_in', 'cash_in', 'card_in'])).resolves.toEqual(['cardIn', 'cashIn'])
  })

  it.each<[string, unknown]>([
    ['배열 속 배열', [['cash_in'], ['card_in']]],
    ['글자가 아닌 값', [null, 1, true, { cash_in: 'cash_in' }]],
  ])('AC-016.1: %s은 버린다', async (_name, stored) => {
    await expect(loadedBitFields(stored)).resolves.toEqual([])
  })

  it.each<[string, unknown]>([
    ['글자 하나', 'cash_in'],
    ['DB 배열 글자', '{cash_in}'],
    ['객체', { 0: 'cash_in' }],
    ['null', null],
  ])('AC-016.1: bit_fields가 목록이 아니면(%s) 빈 목록이다', async (_name, stored) => {
    await expect(loadedBitFields(stored)).resolves.toEqual([])
  })

  it('AC-016.1: bit_fields가 없는 옛 줄은 빈 목록이다', async () => {
    const { client } = fakeClient({ ...OK, data: { ...FULL_COLUMNS } })
    await expect(loadWorklogDay(client, YMD)).resolves.toEqual({ day: FULL_DAY, bitFields: [], memoFontPt: 11 })
  })

  it('AC-016.1: 진짜 클라이언트로도 bit_fields를 묻고 받은 목록을 열쇠 이름으로 돌려준다', async () => {
    const body = JSON.stringify({ ...FULL_COLUMNS, bit_fields: ['total_fee', 'spend_cash', 'total_fee'] })
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }))
    await expect(loadWorklogDay(realClient(fakeFetch), YMD)).resolves.toEqual({ day: FULL_DAY, bitFields: ['totalFee'], memoFontPt: 11 })
    const url = new URL(String(fakeFetch.mock.calls[0]?.[0]))
    expect(url.searchParams.get('select')?.split(',')).toContain('bit_fields')
  })

  it('AC-016.2: bitFields 없이 저장하면 row는 work_date와 받은 칸뿐이고 bit_fields 열쇠가 없다', async () => {
    const { client, calls } = fakeClient()
    await saveWorklogDay(client, YMD, { cashIn: '300000', memo: '가상 업무사항' })
    expect(calls.upsert).toHaveLength(1)
    const row = calls.upsert[0]?.row
    expect(row).toEqual({ work_date: YMD, cash_in: '300000', memo: '가상 업무사항' })
    expect(row).not.toHaveProperty('bit_fields')
  })

  it('AC-016.2: bitFields가 undefined이면 준 것이 아니다. 빈 목록 []을 보내 저장된 표시를 지우지 않는다', async () => {
    const row = await savedRow(FULL_DAY, undefined)
    expect(row).toEqual({ work_date: YMD, ...FULL_COLUMNS })
    expect(Object.keys(row ?? {})).not.toContain('bit_fields')
  })

  it('AC-016.2: bitFields를 억지로 null로 주어도 목록이 아니니 bit_fields를 보내지 않는다', async () => {
    const row = await savedRow(ONE_CELL, null as unknown as WorklogNumberKey[])
    expect(row).toEqual({ work_date: YMD, ...ONE_COLUMN })
  })

  it.each<[string, WorklogChanges]>([
    ['빈 값 객체', {}],
    ['막는 칸뿐', { memo: PHONE }],
  ])('AC-016.2: 바뀐 칸이 없고(%s) bitFields도 없으면 네트워크를 부르지 않는다', async (_name, changes) => {
    const { client, calls } = fakeClient()
    await expect(saveWorklogDay(client, YMD, changes)).resolves.toBeUndefined()
    expect(calls.from).toEqual([])
    expect(calls.upsert).toEqual([])
  })

  it('AC-016.1: bitFields를 주면 받은 칸에 bit_fields(DB 칸 이름)가 더해진다', async () => {
    const row = await savedRow({ cashIn: '300000', memo: '가상 업무사항' }, ['cashIn', 'newPatients'])
    expect(row).toEqual({ work_date: YMD, cash_in: '300000', memo: '가상 업무사항', bit_fields: ['cash_in', 'new_patients'] })
    expect(row).not.toHaveProperty('hospital_id')
  })

  it('AC-016.1: 바뀐 칸이 없어도 bitFields를 주면 work_date와 bit_fields만 보낸다', async () => {
    const { client, calls } = fakeClient()
    await saveWorklogDay(client, YMD, {}, ['unpaidPaid', 'totalFee'])
    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]?.row).toEqual({ work_date: YMD, bit_fields: ['unpaid_paid', 'total_fee'] })
    expect(calls.upsert[0]?.options).toEqual({ onConflict: 'hospital_id,work_date' })
  })

  it('AC-016.1: 빈 목록 []을 주면 표시를 지우라는 뜻이라 bit_fields: []을 보낸다', async () => {
    await expect(savedRow({}, [])).resolves.toEqual({ work_date: YMD, bit_fields: [] })
  })

  it('AC-016.1: 막는 칸은 빼고, 남은 것이 bitFields뿐이면 work_date와 bit_fields만 보낸다', async () => {
    const row = await savedRow({ memo: PHONE, cashIn: PHONE }, ['cardIn'])
    expect(row).toEqual({ work_date: YMD, bit_fields: ['card_in'] })
    expect(JSON.stringify(row)).not.toContain(PHONE)
  })

  it('AC-016.1: 저장할 때도 목록 밖 이름(손으로만 적는 칸·지금 안 채우는 칸·DB 칸 이름·모르는 이름)은 버린다', async () => {
    const bitFields = odd([
      'cardIn',
      ...['spendCash', 'memo', 'nameCashIn'],
      ...['unpaidNew', 'localCurrencyIn'],
      ...['cash_in', 'hospital_id', '', ['cashIn'], null],
    ])
    await expect(savedRow(ONE_CELL, bitFields)).resolves.toEqual({ work_date: YMD, ...ONE_COLUMN, bit_fields: ['card_in'] })
  })

  it('AC-016.1: 저장할 때 같은 이름은 처음 한 번만, 준 차례대로 보낸다', async () => {
    const row = await savedRow({}, ['transferIn', 'cashIn', 'transferIn', 'returnPatients', 'cashIn'])
    expect(row).toEqual({ work_date: YMD, bit_fields: ['transfer_in', 'cash_in', 'return_patients'] })
  })

  it('AC-016.1: 목록 밖 이름뿐이어도 bitFields를 준 것이라 bit_fields: []을 보낸다', async () => {
    await expect(savedRow({}, odd(['spendCash', 'unpaidNew']))).resolves.toEqual({ work_date: YMD, bit_fields: [] })
  })

  it('AC-016.1: bitFields만 주고 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    const error = await caught(() => saveWorklogDay(client, YMD, {}, ['cashIn']))
    expect(error.kind).toBe('offline')
    expect(calls.from).toEqual([])
  })

  it('AC-016.1: 진짜 클라이언트로도 요청 한 번, 본문은 work_date·받은 칸·bit_fields뿐이다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }))
    await saveWorklogDay(realClient(fakeFetch), YMD, ONE_CELL, ['claimAmount', 'cardIn'])
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [input, init] = fakeFetch.mock.calls[0] ?? []
    expect(new URL(String(input)).searchParams.get('on_conflict')).toBe('hospital_id,work_date')
    expect(JSON.parse(String(init?.body))).toEqual({ work_date: YMD, ...ONE_COLUMN, bit_fields: ['claim_amount', 'card_in'] })
  })
})

describe('업무사항 글씨 크기 memo_font_pt', () => {
  // 타입을 넘어 온 값(목록 밖 숫자·글자 등)을 억지로 넣을 때만 쓴다
  const oddPt = (value: unknown) => value as MemoFontPt

  async function loadedPt(data: Record<string, unknown>) {
    const { client } = fakeClient({ ...OK, data })
    return (await loadWorklogDay(client, YMD))?.memoFontPt
  }

  it('AC-1503.1: 서버 값 14를 읽으면 day·bitFields와 함께 memoFontPt 14를 돌려준다', async () => {
    const { client } = fakeClient({ ...OK, data: { ...FULL_COLUMNS, bit_fields: ['cash_in'], memo_font_pt: 14 } })
    await expect(loadWorklogDay(client, YMD)).resolves.toEqual({ day: FULL_DAY, bitFields: ['cashIn'], memoFontPt: 14 })
  })

  it.each(MEMO_FONT_PTS)('AC-1503.1: 목록 안 크기 %ipt는 그대로 읽는다', async (pt) => {
    await expect(loadedPt({ ...FULL_COLUMNS, memo_font_pt: pt })).resolves.toBe(pt)
  })

  it.each<[string, unknown]>([
    ['목록 밖 숫자 13', 13],
    ['목록 밖 숫자 0', 0],
    ['null', null],
    ['글자 14', '14'],
    ['소수 11.5', 11.5],
    ['배열', [14]],
  ])('AC-1503.1: 서버 값이 %s이면 11이다', async (_name, stored) => {
    await expect(loadedPt({ ...FULL_COLUMNS, memo_font_pt: stored })).resolves.toBe(11)
  })

  it('AC-1503.1: memo_font_pt 칸이 없는 줄은 11이다', async () => {
    await expect(loadedPt({ ...FULL_COLUMNS })).resolves.toBe(11)
  })

  it('AC-1503.1: 줄이 없으면 지금처럼 null이다(크기만 따로 돌려주지 않는다)', async () => {
    const { client } = fakeClient()
    await expect(loadWorklogDay(client, YMD)).resolves.toBeNull()
  })

  it('AC-1503.1: 진짜 클라이언트로도 memo_font_pt를 묻고 받은 크기를 돌려준다', async () => {
    const body = JSON.stringify({ ...FULL_COLUMNS, bit_fields: null, memo_font_pt: 16 })
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }))
    await expect(loadWorklogDay(realClient(fakeFetch), YMD)).resolves.toEqual({ day: FULL_DAY, bitFields: [], memoFontPt: 16 })
    const url = new URL(String(fakeFetch.mock.calls[0]?.[0]))
    expect(url.searchParams.get('select')?.split(',')).toContain('memo_font_pt')
    expect(url.searchParams.get('select')).not.toContain('hospital_id')
  })

  it('AC-1503.2: 다섯째 인자 14를 주면 upsert 한 번에 받은 칸·bit_fields와 memo_font_pt: 14(숫자)가 함께 간다', async () => {
    const { client, calls } = fakeClient()
    await saveWorklogDay(client, YMD, ONE_CELL, ['cashIn'], 14)
    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]?.row).toEqual({ work_date: YMD, ...ONE_COLUMN, bit_fields: ['cash_in'], memo_font_pt: 14 })
    expect(calls.upsert[0]?.row.memo_font_pt).toBe(14)
    expect(calls.upsert[0]?.options).toEqual({ onConflict: 'hospital_id,work_date' })
  })

  it.each(MEMO_FONT_PTS)('AC-1503.2: 목록 안 크기 %ipt는 숫자 그대로 보낸다', async (pt) => {
    await expect(savedRow(ONE_CELL, undefined, pt)).resolves.toEqual({ work_date: YMD, ...ONE_COLUMN, memo_font_pt: pt })
  })

  it('AC-1503.2: 바뀐 칸이 없고 셋째가 undefined여도 다섯째만 주면 work_date와 memo_font_pt만 보낸다', async () => {
    const { client, calls } = fakeClient()
    await saveWorklogDay(client, YMD, {}, undefined, 12)
    expect(calls.from).toEqual(['worklog_days'])
    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]?.row).toEqual({ work_date: YMD, memo_font_pt: 12 })
    expect(calls.upsert[0]?.row).not.toHaveProperty('bit_fields')
    expect(calls.upsert[0]?.row).not.toHaveProperty('hospital_id')
  })

  it('AC-1503.2: 막는 칸은 빼고, 남은 것이 크기뿐이면 work_date와 memo_font_pt만 보낸다', async () => {
    const row = await savedRow({ memo: PHONE }, undefined, 9)
    expect(row).toEqual({ work_date: YMD, memo_font_pt: 9 })
    expect(JSON.stringify(row)).not.toContain(PHONE)
  })

  it('AC-1503.2: 크기만 주고 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    const error = await caught(() => saveWorklogDay(client, YMD, {}, undefined, 14))
    expect(error.kind).toBe('offline')
    expect(calls.from).toEqual([])
  })

  it('AC-1503.2: 진짜 클라이언트로도 요청 한 번, 본문의 memo_font_pt는 숫자 14다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }))
    await saveWorklogDay(realClient(fakeFetch), YMD, {}, undefined, 14)
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [input, init] = fakeFetch.mock.calls[0] ?? []
    expect(new URL(String(input)).searchParams.get('on_conflict')).toBe('hospital_id,work_date')
    expect(JSON.parse(String(init?.body))).toEqual({ work_date: YMD, memo_font_pt: 14 })
    expect(String(init?.body)).toContain('"memo_font_pt":14')
  })

  it('AC-1503.3: 다섯째 인자를 주지 않으면 memo_font_pt 칸을 보내지 않는다(기본값 11로 덮지 않는다)', async () => {
    const { client, calls } = fakeClient()
    await saveWorklogDay(client, YMD, ONE_CELL, ['cashIn'])
    expect(calls.upsert[0]?.row).toEqual({ work_date: YMD, ...ONE_COLUMN, bit_fields: ['cash_in'] })
    expect(calls.upsert[0]?.row).not.toHaveProperty('memo_font_pt')
    await expect(savedRow(FULL_DAY)).resolves.not.toHaveProperty('memo_font_pt')
  })

  it('AC-1503.3: 다섯째가 undefined이면 준 것이 아니다', async () => {
    const row = await savedRow(ONE_CELL, undefined, undefined)
    expect(row).toEqual({ work_date: YMD, ...ONE_COLUMN })
    expect(Object.keys(row ?? {})).not.toContain('memo_font_pt')
  })

  it.each<[string, unknown]>([
    ['목록 밖 숫자 13', 13],
    ['목록 밖 숫자 0', 0],
    ['글자 14', '14'],
    ['null', null],
    ['소수 11.5', 11.5],
    ['NaN', Number.NaN],
  ])('AC-1503.3: 목록 밖 값(%s)은 memo_font_pt 칸을 보내지 않고 받은 칸은 그대로 보낸다', async (_name, value) => {
    const row = await savedRow(ONE_CELL, ['cardIn'], oddPt(value))
    expect(row).toEqual({ work_date: YMD, ...ONE_COLUMN, bit_fields: ['card_in'] })
    expect(row).not.toHaveProperty('memo_font_pt')
  })

  it.each<[string, unknown]>([
    ['목록 밖 숫자 13', 13],
    ['글자 14', '14'],
    ['null', null],
  ])('AC-1503.3: 보낼 것이 목록 밖 크기(%s)뿐이면 네트워크를 부르지 않는다', async (_name, value) => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    await expect(saveWorklogDay(client, YMD, {}, undefined, oddPt(value))).resolves.toBeUndefined()
    expect(calls.from).toEqual([])
    expect(calls.upsert).toEqual([])
  })
})

describe('AI 경로', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url))

  function sourceFiles(dir: string): string[] {
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? sourceFiles(path) : [path]
    })
  }

  it('AC-005.5: AI 경로 소스에 worklog_days·worklogDays가 없다(폴더가 있을 때 본다)', () => {
    // 경로가 틀려 아무것도 안 읽고 통과하지 않게 뿌리부터 확인한다
    expect(existsSync(join(root, 'src/lib/storage/worklogDays.ts'))).toBe(true)
    const files = ['src/app/api/ai', 'src/lib/ai'].flatMap((dir) => sourceFiles(join(root, dir)))
    const hits = files.filter((file) => /worklog_days|worklogDays/.test(readFileSync(file, 'utf-8')))
    expect(hits).toEqual([])
  })
})
