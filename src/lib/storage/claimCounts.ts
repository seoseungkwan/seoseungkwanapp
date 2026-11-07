import type { SupabaseClient } from '@supabase/supabase-js'
import { compareYmd, isYmd } from '@/lib/analytics/dates'
import type { ClaimDayCountRow, ClaimMonthCountRow, ContactCountRow } from '@/types/db'
import type { ErrorCode } from '@/types/errors'
import type { UploadDayCount } from '@/types/precheck'

// 건수 읽기·쓰기(precheck AC-013.1·REQ-019, design.md 6-4·8-2). 브라우저 → Supabase, 권한은 RLS가 막는다. 숫자와 날짜뿐이고 환자 자료는 오지도 가지도 않는다.
// 마이그레이션을 붙여 넣기 전에는 표가 없다. 읽기는 빈 목록이다(모든 날이 '아직 불러오지 않은 날'). 올리기는 실패로 던진다(E-COUNTS-FAILED): 부르는 쪽이 메모리에 두고 표가 생긴 뒤 다시 올린다

export type ClaimDayCount = Pick<ClaimDayCountRow, 'visit_date' | 'visits' | 'need_memo' | 'entered' | 'needs_check' | 'skipped' | 'updated_at'>
export type ClaimMonthCount = Pick<ClaimMonthCountRow, 'claim_month' | 'incomplete' | 'missing' | 'flagged' | 'updated_at'>
export type ContactCount = Pick<ContactCountRow, 'followup_left' | 'injection_left' | 'updated_at'>

const DAY_TABLE = 'claim_day_counts'
const MONTH_TABLE = 'claim_month_counts'
const CONTACT_TABLE = 'contact_counts'
const DAY_COLUMNS = 'visit_date, visits, need_memo, entered, needs_check, skipped, updated_at'
/** DB 제약과 같다(design.md 8-2) */
const MAX_COUNT = 100_000
/** 밖에서 볼 때 읽는 날 수 상한: 최근 날부터. 도우미 날짜 목록 한도(400일)와 같은 길이다 */
const OUTSIDE_DAYS = 400

/** 표가 있는데 읽지 못함. 원래 오류 글은 옮기지 않는다 */
export class CountsReadError extends Error {
  constructor() {
    super('counts')
    this.name = 'CountsReadError'
  }
}

/** 건수를 올리지 못했거나 모양이 틀려 보내지 않음. 받은 값과 원래 오류 글은 옮기지 않는다 */
export class CountsUploadError extends Error {
  readonly code: ErrorCode = 'E-COUNTS-FAILED'
  constructor() {
    super('E-COUNTS-FAILED')
    this.name = 'CountsUploadError'
  }
}

/** PostgREST가 모르는 표(PGRST205)·Postgres undefined_table(42P01)·그 경로 없음(404) */
const NO_TABLE_CODES: ReadonlySet<unknown> = new Set(['PGRST205', '42P01'])

type Reply<T> = { data: T[] | null; error: { code?: string } | null; status?: number }

/** 표 하나 읽기. 표가 없으면 빈 목록, 그 밖의 실패는 CountsReadError. 완료 표시 읽기(claimDayCloses.ts)도 쓴다 */
export async function readRows<T>(read: () => PromiseLike<unknown>): Promise<T[]> {
  let reply: Reply<T>
  try {
    reply = (await read()) as Reply<T>
  } catch {
    throw new CountsReadError()
  }
  if (reply.error) {
    if (NO_TABLE_CODES.has(reply.error.code) || reply.status === 404) return []
    throw new CountsReadError()
  }
  return reply.data ?? []
}

export function readDayCounts(sb: SupabaseClient, from: string, to: string): Promise<ClaimDayCount[]> {
  return readRows<ClaimDayCount>(() => sb.from(DAY_TABLE).select(DAY_COLUMNS).gte('visit_date', from).lte('visit_date', to))
}

/** visit_date와 수 다섯 칸 */
const UPLOAD_KEYS = 6
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= MAX_COUNT

/** 정해 둔 6칸의 정수와 날짜만 지난다(AC-019.3). 다른 칸이 하나라도 있으면 던져 보내지 않는다. 돌려주는 줄은 그 6칸으로 새로 만든다 */
export function checkDayCount(row: unknown): UploadDayCount {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) throw new CountsUploadError()
  const value = row as Record<string, unknown>
  if (Object.keys(value).length !== UPLOAD_KEYS) throw new CountsUploadError()
  const { visit_date, visits, need_memo, entered, needs_check, skipped } = value
  if (typeof visit_date !== 'string' || !isYmd(visit_date)) throw new CountsUploadError()
  if (!isCount(visits) || !isCount(need_memo) || !isCount(entered) || !isCount(needs_check) || !isCount(skipped) || entered > need_memo) throw new CountsUploadError()
  return { visit_date, visits, need_memo, entered, needs_check, skipped }
}

/** 날짜 줄들을 올린다(AC-019.4). 틀린 줄이 하나라도 있으면 하나도 보내지 않는다. hospital_id·updated_at은 DB가 정해 보내지 않는다. 실패는 모두 E-COUNTS-FAILED */
export async function upsertDayCounts(sb: SupabaseClient, rows: readonly UploadDayCount[]): Promise<void> {
  if (rows.length === 0) return
  const checked = rows.map(checkDayCount)
  let reply: { error: unknown }
  try {
    reply = await sb.from(DAY_TABLE).upsert(checked, { onConflict: 'hospital_id,visit_date' })
  } catch {
    throw new CountsUploadError()
  }
  if (reply.error) throw new CountsUploadError()
}

/** 밖에서 보는 건수. days는 남은 날만 최근 날부터, total은 올린 날 수, updatedAt은 세 표에서 가장 늦게 바뀐 시각(올린 건수가 없으면 null) */
export type OutsideCounts = { days: ClaimDayCount[]; total: number; months: ClaimMonthCount[]; contact: ContactCount | null; updatedAt: string | null }

/** 밖에서 보기용(AC-019.5). 숫자·날짜 칸만 고른다 */
export async function readOutsideCounts(sb: SupabaseClient): Promise<OutsideCounts> {
  const [days, months, contacts] = await Promise.all([
    readRows<ClaimDayCount>(() => sb.from(DAY_TABLE).select(DAY_COLUMNS).order('visit_date', { ascending: false }).limit(OUTSIDE_DAYS)),
    readRows<ClaimMonthCount>(() => sb.from(MONTH_TABLE).select('claim_month, incomplete, missing, flagged, updated_at').order('claim_month', { ascending: false })),
    readRows<ContactCount>(() => sb.from(CONTACT_TABLE).select('followup_left, injection_left, updated_at')),
  ])
  const stamps = [...days, ...months, ...contacts].map((row) => row.updated_at)
  const updatedAt = stamps.length ? stamps.reduce((late, stamp) => (Date.parse(stamp) > Date.parse(late) ? stamp : late)) : null
  return {
    days: days.filter((day) => day.need_memo > day.entered).sort((a, b) => compareYmd(b.visit_date, a.visit_date)),
    total: days.length,
    months,
    contact: contacts[0] ?? null,
    updatedAt,
  }
}
