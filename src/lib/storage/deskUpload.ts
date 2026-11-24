import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeRanges } from '@/lib/analytics/coverage'
import { isYmd } from '@/lib/analytics/dates'
import { isFillMonths } from '@/lib/autoUpload/range'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DateRange } from '@/types/dates'
import { AutoUploadError, type MyUploadPlan, type SavedSalesMark, type StatsMarks, type UploadReport } from './autoUpload'
import { StorageError } from './stats'

// 데스크 계정 올리기 — 브라우저 → DB(spec admin-view REQ-8024 AC-8024.6, design.md '데스크 계정 올리기', ADR-049).
// 데스크는 매출·통계 표에 정책이 없어 정의자 함수(TASK-20 SQL)를 이름으로만 부른다 — 병원은 함수가 my_desk_hospital_id()로 정하고
// 표시 함수는 날짜·참거짓만 준다(금액·환자 수·payload 없음). 답은 원장 읽기(autoUpload.ts·stats.ts readCoverage)와 같은 모양으로 바꾼다.
// 답은 믿지 않는다: 줄 하나라도 모양이 틀리면 반쪽 목록 대신 막는다. 실패 번호는 원장 길과 같다(Supabase 글 없음, 저절로 다시 부르지 않음)

type Client = Pick<SupabaseClient, 'rpc'>
type Reply = { data: unknown; error: unknown }
type ReadRow = Record<string, unknown>

const PAGE_ROWS = 1000
const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isDayOrNull = (value: unknown): value is string | null => value === null || (typeof value === 'string' && isYmd(value))

function fail(): never {
  throw new AutoUploadError()
}

/** 클라이언트 만들기·보내기·오류 답을 AutoUploadError 하나로(원래 오류는 버린다) */
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

/** 함수 답을 짧은 쪽이 올 때까지 1,000줄씩 읽고 줄마다 바꾼다. 쪽 하나라도 실패·줄 하나라도 틀리면 AutoUploadError */
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

/** rpc('desk_upload_plan') 한 번. 줄이 없으면(데스크 아님·원장·승인 전·보는 중) null */
export async function readDeskUploadPlan(): Promise<MyUploadPlan | null> {
  const data = await call((client) => client.rpc('desk_upload_plan'))
  if (!Array.isArray(data) || data.length > 1) fail()
  if (data.length === 0) return null
  const [row] = data as unknown[]
  if (!isRecord(row) || !isFillMonths(row.months) || !isDayOrNull(row.through_day)) fail()
  return { months: row.months, throughDay: row.through_day }
}

/** rpc('desk_claim_upload') 한 번. 원장 탭과 같은 잡음을 다툰다(한 곳만 true). bitMark null = 묶기·검사 없이 잡기만 */
export async function deskClaimUpload(tab: string, bitMark: string | null): Promise<boolean> {
  const data = await call((client) => client.rpc('desk_claim_upload', { p_tab: tab, p_bit_mark: bitMark }))
  if (typeof data !== 'boolean') fail()
  return data
}

/** rpc('desk_report_upload') 한 번. 잡은 탭이 아니면 DB가 아무것도 바꾸지 않는다. error는 오류 번호만 */
export async function deskReportUpload(tab: string, report: UploadReport): Promise<void> {
  await call((client) =>
    client.rpc('desk_report_upload', {
      p_tab: tab,
      p_through: report.through,
      p_filled_from: report.filledFrom,
      p_error: report.error,
      p_done: report.done,
    }),
  )
}

// has_rough는 참고 금액이 있는지뿐이다(금액은 오지 않는다). savedMark는 숫자인지만 보므로 있으면 표시용 0
function toSalesMark(row: ReadRow): SavedSalesMark | null {
  const { day, day_codes, unconfirmed, has_rough } = row
  if (typeof day !== 'string' || !isYmd(day) || typeof day_codes !== 'boolean' || typeof unconfirmed !== 'boolean' || typeof has_rough !== 'boolean') {
    return null
  }
  return { date: day, dayCodes: day_codes, unconfirmed, roughTotal: has_rough ? 0 : null }
}

/** 기간 안(양 끝 포함) 저장된 매출 날 줄의 표시, 날 차례 — 원장 readSavedSalesDays와 같은 모양 */
export async function readDeskSalesMarks(from: string, to: string): Promise<SavedSalesMark[]> {
  return readPages((client, first, last) => client.rpc('desk_sales_marks', { p_from: from, p_to: to }).order('day').range(first, last), toSalesMark)
}

function toDayMark(row: ReadRow): StatsMarks['days'][number] | null {
  const { day, partial, has_sunap } = row
  if (typeof day !== 'string' || !isYmd(day) || typeof partial !== 'boolean' || typeof has_sunap !== 'boolean') return null
  return { day, partial, hasSunap: has_sunap }
}

// 함수는 달을 그달 1일 날짜로 준다(표의 'YYYY-MM' 글자를 date로 바꾼 것)
function toMonthMark(row: ReadRow): StatsMarks['months'][number] | null {
  const { month, partial, dropoff_as_of } = row
  if (typeof month !== 'string' || !isYmd(month) || !month.endsWith('-01') || typeof partial !== 'boolean' || !isDayOrNull(dropoff_as_of)) return null
  return { month: month.slice(0, 7), partial, dropoffAsOf: dropoff_as_of }
}

/** 기간 안 통계 날 줄·달 줄 표시 — 원장 readStatsMarks와 같은 모양 */
export async function readDeskStatsMarks(from: string, to: string): Promise<StatsMarks> {
  const [days, months] = await Promise.all([
    readPages((client, first, last) => client.rpc('desk_stats_day_marks', { p_from: from, p_to: to }).order('day').range(first, last), toDayMark),
    readPages((client, first, last) => client.rpc('desk_stats_month_marks', { p_from: from, p_to: to }).order('month').range(first, last), toMonthMark),
  ])
  return { days, months }
}

function toCoverage(row: ReadRow): DateRange | null {
  const { from_day, to_day } = row
  return typeof from_day === 'string' && isYmd(from_day) && typeof to_day === 'string' && isYmd(to_day) ? { from: from_day, to: to_day } : null
}

/** 그 기간과 겹치는 덮은 기간을 합쳐 시작 순으로 — 원장 readCoverage와 같은 모양·같은 실패 번호(E-STATS-READ-FAILED) */
export async function readDeskCoverage(range: DateRange): Promise<DateRange[]> {
  try {
    const rows = await readPages(
      (client, first, last) => client.rpc('desk_stats_coverage', { p_from: range.from, p_to: range.to }).order('from_day').order('to_day').range(first, last),
      toCoverage,
    )
    return mergeRanges(rows)
  } catch {
    throw new StorageError('E-STATS-READ-FAILED')
  }
}
