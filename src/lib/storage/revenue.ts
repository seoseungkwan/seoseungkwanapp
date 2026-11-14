import type { SupabaseClient } from '@supabase/supabase-js'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import {
  REVENUE_DAY_KEYS,
  type RevenueCodeRow,
  type RevenueCodeTotal,
  type RevenueDayCodeRow,
  type RevenueDayRow,
  type RevenueDaysResult,
  type RevenueMonthCode,
  type SavedRevenueDay,
} from '@/types/revenue'

// 매출 숫자 저장·읽기(spec revenue design.md 8절 → specs/stats-revenue design.md '저장소'). 브라우저 Supabase 클라이언트 + RLS로만 한다.
// 보내는 줄은 정해 둔 칸만 새 객체로 만든다. hospital_id·fetched_at은 DB가 채운다.
// Supabase 오류 내용은 버린다(화면·기록에 넘기지 않는다). 번호만 던진다.
// 옛 매출 탭의 달 단위 저장·읽기는 지웠다(stats-revenue AC-4110.4)

const SAVE_FAILED = 'E-REVENUE-SAVE-FAILED'
const PAGE_SIZE = 1000

export class RevenueStoreError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode) {
    super(code)
    this.name = 'RevenueStoreError'
    this.code = code
  }
}

/** 통계 매출(specs/stats-revenue design.md '저장소'). 저장은 함수 하나(한 트랜잭션), 읽기 셋은 1,000줄씩 끝까지 */
export type RevenueRangeStore = {
  /** 덩어리 하나(31일까지)를 save_revenue_range로 저장. 실패 E-REVENUE-SAVE-FAILED */
  saveRange(range: DateRange, result: RevenueDaysResult): Promise<void>
  /** 범위 안 저장된 날 줄 + 날 단위 처방 줄이 있는지 + 참고 금액(없으면 null). 실패 E-STATS-READ-FAILED */
  loadDays(range: DateRange): Promise<SavedRevenueDay[]>
  /** 범위 안 날 단위 처방 줄의 코드별 합(sales_code_totals). 실패 E-STATS-READ-FAILED */
  codeTotals(range: DateRange): Promise<RevenueCodeTotal[]>
  /** 옛 달 합계(sales_codes) 첫 달~끝 달('YYYY-MM'). 실패 E-STATS-READ-FAILED */
  monthCodes(fromMonth: string, toMonth: string): Promise<RevenueMonthCode[]>
}

// 통계 화면의 저장 숫자 읽기 실패와 같은 번호(같은 카드·같은 [다시 읽기], design.md '다르게 정한 것' 4)
const STATS_READ_FAILED = 'E-STATS-READ-FAILED'
const SAVE_RANGE_FUNCTION = 'save_revenue_range'
const CODE_TOTALS_FUNCTION = 'sales_code_totals'

type DayKey = (typeof REVENUE_DAY_KEYS)[number]
type DbDayRow = Record<string, unknown>
type DbCodeRow = RevenueCodeRow & { month: string }
type DbSavedDay = Record<string, unknown> & { day_codes: boolean; rough_total?: number | null }
type DbCodeTotal = RevenueCodeTotal

/** camelCase → snake_case. date만 표에서 day다 */
const columnOf = (key: DayKey) => (key === 'date' ? 'day' : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`))

/** 참고 금액 칸(specs/first90 AC-4406.3): 날 줄 열다섯 칸 뒤에 함께 보내고 읽는다 */
const ROUGH_COLUMN = 'rough_total'
const SAVED_DAY_SELECT = [...REVENUE_DAY_KEYS.map(columnOf), ROUGH_COLUMN, 'day_codes'].join(',')
const CODE_SELECT = 'month,code,name,count,amount'

// 열쇠가 없는 답(옛 도우미·확인된 날)은 null로 보낸다
const toDbDay = (row: RevenueDayRow) => ({
  ...Object.fromEntries(REVENUE_DAY_KEYS.map((key) => [columnOf(key), row[key]])),
  [ROUGH_COLUMN]: row.roughTotal ?? null,
})
const fromDbDay = (row: DbDayRow) => Object.fromEntries(REVENUE_DAY_KEYS.map((key) => [key, row[columnOf(key)]])) as RevenueDayRow

/** 튜플 → 정해 둔 네 칸 새 객체(다섯째 칸이 섞여 있어도 보내지 않는다) */
const toDbDayCode = ([day, code, count, amount]: RevenueDayCodeRow) => ({ day, code, count, amount })

const fromDbMonthCode = (row: DbCodeRow): RevenueMonthCode => ({
  month: row.month.slice(0, 7),
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
    if (error || !Array.isArray(data)) fail(STATS_READ_FAILED)
    if (data.length === 0) return rows
    rows.push(...(data as T[]))
  }
}

/** 읽다 실패하면(오류·예외·일부만 읽음) 빈 목록 대신 번호만 던진다 */
async function readOrFail<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch {
    return fail(STATS_READ_FAILED)
  }
}

export function createRevenueStore(client: SupabaseClient): RevenueRangeStore {
  // 날 줄은 정해 둔 열다섯 칸 + rough_total, 코드 줄은 {day, code, count, amount}만 새 객체로. 옛 도우미(dayCodes 없음)면 null → 서버가 그 범위 코드 줄을 지우고 day_codes 거짓
  async function writeRange(range: DateRange, result: RevenueDaysResult): Promise<void> {
    const { error } = await client.rpc(SAVE_RANGE_FUNCTION, {
      p_from: range.from,
      p_to: range.to,
      p_days: result.days.map(toDbDay),
      p_day_codes: result.dayCodes ? result.dayCodes.map(toDbDayCode) : null,
    })
    if (error) fail(SAVE_FAILED)
  }

  return {
    async saveRange(range, result) {
      try {
        await writeRange(range, result)
      } catch {
        fail(SAVE_FAILED)
      }
    },
    loadDays: (range) =>
      readOrFail(async () => {
        const rows = await readAll<DbSavedDay>((from, to) =>
          client.from('sales_days').select(SAVED_DAY_SELECT).gte('day', range.from).lte('day', range.to).order('day').range(from, to),
        )
        // 참고 금액을 모르는 옛 줄은 null(undefined로 두지 않는다)
        return rows.map((row) => ({ ...fromDbDay(row as unknown as DbDayRow), dayCodes: row.day_codes, roughTotal: row.rough_total ?? null }))
      }),
    // 함수 답도 쪽마다 같은 차례여야 빠짐·겹침이 없다(함수 안 order by에 기대지 않는다)
    codeTotals: (range) =>
      readOrFail(async () => {
        const rows = await readAll<DbCodeTotal>((from, to) =>
          client.rpc(CODE_TOTALS_FUNCTION, { p_from: range.from, p_to: range.to }).order('code').range(from, to),
        )
        return rows.map((row) => ({ code: row.code, count: row.count, amount: row.amount, missing: row.missing }))
      }),
    monthCodes: (fromMonth, toMonth) =>
      readOrFail(async () => {
        const rows = await readAll<DbCodeRow>((from, to) =>
          client
            .from('sales_codes')
            .select(CODE_SELECT)
            .gte('month', `${fromMonth}-01`)
            .lte('month', `${toMonth}-01`)
            .order('month')
            .order('code')
            .range(from, to),
        )
        return rows.map(fromDbMonthCode)
      }),
  }
}
