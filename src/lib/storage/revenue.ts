import type { SupabaseClient } from '@supabase/supabase-js'
import { monthRange } from '@/lib/analytics/dates'
import type { ErrorCode } from '@/types/errors'
import { REVENUE_DAY_KEYS, type RevenueCodeRow, type RevenueDayRow, type RevenueDaysResult } from '@/types/revenue'

// 매출 숫자 저장·읽기(spec revenue design.md 8절, REQ-007). 브라우저 Supabase 클라이언트 + RLS로만 한다.
// 보내는 줄은 정해 둔 칸만 새 객체로 만든다. hospital_id·fetched_at은 DB가 채운다.
// Supabase 오류 내용은 버린다(화면·기록에 넘기지 않는다). 번호만 던진다.

const SAVE_FAILED = 'E-REVENUE-SAVE-FAILED'
// 읽기 실패 번호는 명세에 따로 없어 화면을 열지 못한 것과 같은 번호를 쓴다. 빈 목록을 돌려주지 않는다
const LOAD_FAILED = 'E-PAGE-FAILED'
const PAGE_SIZE = 1000

export class RevenueStoreError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode) {
    super(code)
    this.name = 'RevenueStoreError'
    this.code = code
  }
}

export type RevenueStore = { saveMonth(month: string, result: RevenueDaysResult): Promise<void> }

type DayKey = (typeof REVENUE_DAY_KEYS)[number]
type DbDayRow = Record<string, unknown> & { fetched_at: string }
type DbCodeRow = RevenueCodeRow & { month: string }

/** camelCase → snake_case. date만 표에서 day다 */
const columnOf = (key: DayKey) => (key === 'date' ? 'day' : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`))

const DAY_SELECT = [...REVENUE_DAY_KEYS.map(columnOf), 'fetched_at'].join(',')
const CODE_SELECT = 'month,code,name,count,amount'

const toDbDay = (row: RevenueDayRow) => Object.fromEntries(REVENUE_DAY_KEYS.map((key) => [columnOf(key), row[key]]))
const fromDbDay = (row: DbDayRow) => Object.fromEntries(REVENUE_DAY_KEYS.map((key) => [key, row[columnOf(key)]])) as RevenueDayRow

const toDbCode = (monthStart: string, row: RevenueCodeRow) => ({
  month: monthStart,
  code: row.code,
  name: row.name,
  count: row.count,
  amount: row.amount,
})

function fail(code: ErrorCode): never {
  throw new RevenueStoreError(code)
}

// 서버가 한 번에 주는 줄 수는 정할 수 없으므로(13달이면 넘친다) 빈 쪽이 올 때까지 읽는다
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1)
    if (error || !Array.isArray(data)) fail(LOAD_FAILED)
    if (data.length === 0) return rows
    rows.push(...(data as T[]))
  }
}

// 글자 순서는 시간대 표기에 따라 틀릴 수 있어 시각으로 견준다
const latestOf = (times: string[]) =>
  times.reduce<string | null>((latest, time) => (latest === null || Date.parse(time) > Date.parse(latest) ? time : latest), null)

export function createRevenueStore(client: SupabaseClient): RevenueStore & {
  loadRevenue(fromMonth: string, toMonth: string): Promise<{ days: RevenueDayRow[]; codes: (RevenueCodeRow & { month: string })[]; fetchedAt: string | null }>
} {
  async function writeMonth(month: string, result: RevenueDaysResult): Promise<void> {
    const monthStart = `${month}-01`
    // 그 달 코드 줄을 지우고 새로 넣으므로 sales_codes 합계가 그 달 전체여야 한다
    if (result.days[0]?.date !== monthStart) fail(SAVE_FAILED)

    const removed = await client.from('sales_codes').delete().eq('month', monthStart)
    if (removed.error) fail(SAVE_FAILED)
    if (result.codes.length > 0) {
      const inserted = await client.from('sales_codes').insert(result.codes.map((row) => toDbCode(monthStart, row)))
      if (inserted.error) fail(SAVE_FAILED)
    }
    // 마지막에: 코드 쪽이 실패하면 날 줄이 없어 planFetch가 그 달을 다시 가져온다
    const upserted = await client.from('sales_days').upsert(result.days.map(toDbDay), { onConflict: 'hospital_id,day' })
    if (upserted.error) fail(SAVE_FAILED)
  }

  async function readRange(fromMonth: string, toMonth: string) {
    const fromDay = `${fromMonth}-01`
    const [days, codes] = await Promise.all([
      readAll<DbDayRow>((from, to) =>
        client.from('sales_days').select(DAY_SELECT).gte('day', fromDay).lte('day', monthRange(toMonth).to).order('day').range(from, to),
      ),
      readAll<DbCodeRow>((from, to) =>
        client.from('sales_codes').select(CODE_SELECT).gte('month', fromDay).lte('month', `${toMonth}-01`).order('month').order('code').range(from, to),
      ),
    ])
    return {
      days: days.map(fromDbDay),
      codes: codes.map((row) => ({ month: row.month.slice(0, 7), code: row.code, name: row.name, count: row.count, amount: row.amount })),
      fetchedAt: latestOf(days.map((row) => row.fetched_at)),
    }
  }

  return {
    async saveMonth(month, result) {
      try {
        await writeMonth(month, result)
      } catch {
        fail(SAVE_FAILED)
      }
    },
    async loadRevenue(fromMonth, toMonth) {
      try {
        return await readRange(fromMonth, toMonth)
      } catch {
        return fail(LOAD_FAILED)
      }
    },
  }
}
