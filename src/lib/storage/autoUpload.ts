import type { SupabaseClient } from '@supabase/supabase-js'
import { isMonth, isYmd, monthOf } from '@/lib/analytics/dates'
import { isFillMonths, type FillMonths } from '@/lib/autoUpload/range'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { SavedRevenueDay } from '@/types/revenue'

// 저절로 올리기 — 의원 쪽 브라우저 → DB(spec admin-view REQ-8020 AC-8020.3, design.md '저절로 올리기 — 셈 · 글 · 브라우저 함수', ADR-048).
// 계획 읽기·잡기·보고는 정의자 함수 하나씩을 한 번만 부른다 — 승인된 원장인지·보는 중이 아닌지·잡은 탭인지·값 모양은 함수가 본다
// (supabase/adminSync.rls.test.ts가 증명). 저장된 날 표시 읽기 둘은 RLS(내 병원)로 칸 몇 개만 고르고 1,000줄 쪽으로 다 읽는다
// (합계 몸통은 받지 않는다 — 10년이어도 가볍게). 답은 믿지 않는다: 줄 하나라도 모양이 틀리면 반쪽 목록 대신 막는다.
// 실패는 Supabase 글 없이 AutoUploadError 하나(오류 번호는 부른 쪽이 정한다). 저절로 다시 부르지 않는다
export class AutoUploadError extends Error {
  constructor() {
    super('저절로 올리기 자료를 읽거나 쓰지 못했어요')
    this.name = 'AutoUploadError'
  }
}

/** 내 병원 채울 기간과 다 올라온 날(아직 없으면 null) */
export type MyUploadPlan = { months: FillMonths; throughDay: string | null }
/** 매출 저장 표시(savedMark·planRevenue 재료). 칸 이름은 lib/storage/revenue.ts SavedRevenueDay와 같다 */
export type SavedSalesMark = Pick<SavedRevenueDay, 'date' | 'dayCodes' | 'unconfirmed'> & { roughTotal: number | null }
/** 통계 저장 표시: 날 줄 수납 합계가 있는지, 달 줄 '몇 번까지 받나' 합계의 자료 끝 날 */
export type StatsMarks = {
  days: { day: string; partial: boolean; hasSunap: boolean }[]
  months: { month: string; partial: boolean; dropoffAsOf: string | null }[]
}
export type UploadReport = { through: string | null; filledFrom: string | null; error: string | null; done: boolean }

type Client = Pick<SupabaseClient, 'rpc' | 'from'>
type Reply = { data: unknown; error: unknown }
type ReadRow = Record<string, unknown>

const PAGE_ROWS = 1000
const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isDayOrNull = (value: unknown): value is string | null => value === null || (typeof value === 'string' && isYmd(value))

function fail(): never {
  throw new AutoUploadError()
}

/** 클라이언트 만들기·보내기·오류 답을 한 곳에서 AutoUploadError로 바꾼다(원래 오류는 버린다) */
async function call(send: (client: Client) => PromiseLike<Reply>): Promise<unknown> {
  let reply: Reply
  try {
    reply = await send(supabaseBrowser())
  } catch {
    return fail()
  }
  if (reply.error) fail()
  return reply.data
}

/** 표 쪽을 짧은 쪽이 올 때까지 읽고 줄마다 바꾼다. 쪽 하나라도 실패·줄 하나라도 틀리면 AutoUploadError */
async function readPages<T>(page: (client: Client, first: number, last: number) => PromiseLike<Reply>, toRow: (row: ReadRow) => T | null): Promise<T[]> {
  let client: Client
  try {
    client = supabaseBrowser()
  } catch {
    return fail()
  }
  const all: T[] = []
  for (;;) {
    let reply: Reply
    try {
      reply = await page(client, all.length, all.length + PAGE_ROWS - 1)
    } catch {
      return fail()
    }
    if (reply.error || !Array.isArray(reply.data)) fail()
    for (const value of reply.data as unknown[]) {
      const row = isRecord(value) ? toRow(value) : null
      if (row === null) fail()
      all.push(row)
    }
    if (reply.data.length < PAGE_ROWS) return all
  }
}

/** rpc('my_auto_upload_plan') 한 번. 줄이 없으면(원장 아님·데스크·승인 전·보는 중) null */
export async function readMyUploadPlan(): Promise<MyUploadPlan | null> {
  const data = await call((client) => client.rpc('my_auto_upload_plan'))
  if (!Array.isArray(data) || data.length > 1) fail()
  if (data.length === 0) return null
  const [row] = data as unknown[]
  if (!isRecord(row) || !isFillMonths(row.months) || !isDayOrNull(row.through_day)) fail()
  return { months: row.months, throughDay: row.through_day }
}

/** rpc('claim_auto_upload') 한 번. 잡으면 true, 다른 탭·PC가 잡고 있거나 다른 의원 비트면 false. bitMark null = 묶기·검사 없이 잡기만 */
export async function claimUpload(tab: string, bitMark: string | null): Promise<boolean> {
  const data = await call((client) => client.rpc('claim_auto_upload', { p_tab: tab, p_bit_mark: bitMark }))
  if (typeof data !== 'boolean') fail()
  return data
}

/** rpc('report_auto_upload') 한 번. 잡은 탭이 아니면 DB가 아무것도 바꾸지 않는다. error는 오류 번호만(글·환자 자료 없음) */
export async function reportUpload(tab: string, report: UploadReport): Promise<void> {
  await call((client) =>
    client.rpc('report_auto_upload', {
      p_tab: tab,
      p_through: report.through,
      p_filled_from: report.filledFrom,
      p_error: report.error,
      p_done: report.done,
    }),
  )
}

function toSalesMark(row: ReadRow): SavedSalesMark | null {
  const { day, day_codes, unconfirmed, rough_total } = row
  if (typeof day !== 'string' || !isYmd(day) || typeof day_codes !== 'boolean' || typeof unconfirmed !== 'boolean') return null
  if (rough_total !== null && !Number.isInteger(rough_total)) return null
  return { date: day, dayCodes: day_codes, unconfirmed, roughTotal: rough_total as number | null }
}

/** 기간 안(양 끝 포함) 저장된 매출 날 줄의 저장 표시 네 칸, 날 차례 */
export async function readSavedSalesDays(from: string, to: string): Promise<SavedSalesMark[]> {
  return readPages(
    (client, first, last) =>
      client.from('sales_days').select('day, day_codes, unconfirmed, rough_total').gte('day', from).lte('day', to).order('day').range(first, last),
    toSalesMark,
  )
}

function toDayMark(row: ReadRow): StatsMarks['days'][number] | null {
  const { day, partial, sunap } = row
  if (typeof day !== 'string' || !isYmd(day) || typeof partial !== 'boolean') return null
  return { day, partial, hasSunap: sunap !== null && sunap !== undefined }
}

function toMonthMark(row: ReadRow): StatsMarks['months'][number] | null {
  const { month, partial, asOf } = row
  if (typeof month !== 'string' || !isMonth(month) || typeof partial !== 'boolean' || !isDayOrNull(asOf)) return null
  return { month, partial, dropoffAsOf: asOf }
}

/** 기간 안 통계 날 줄(수납 합계가 있는지)과 그 기간의 달 줄('몇 번까지 받나' 자료 끝 날) 표시만 */
export async function readStatsMarks(from: string, to: string): Promise<StatsMarks> {
  const [days, months] = await Promise.all([
    readPages(
      (client, first, last) =>
        client.from('stats_days').select('day, partial, sunap:payload->sunap').gte('day', from).lte('day', to).order('day').range(first, last),
      toDayMark,
    ),
    readPages(
      (client, first, last) =>
        client
          .from('stats_months')
          .select('month, partial, asOf:payload->dropoff->>asOf')
          .gte('month', monthOf(from))
          .lte('month', monthOf(to))
          .order('month')
          .range(first, last),
      toMonthMark,
    ),
  ])
  return { days, months }
}
