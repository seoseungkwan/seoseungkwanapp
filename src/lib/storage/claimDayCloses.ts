import type { SupabaseClient } from '@supabase/supabase-js'
import { isYmd } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { ClaimDayCloseRow } from '@/types/db'
import type { ErrorCode } from '@/types/errors'
import { readRows } from './claimCounts'

// 날짜별 완료 표시 읽기·저장·지우기(spec claim-day-done REQ-2801·REQ-2802·REQ-2806). 브라우저 → Supabase, 권한은 RLS가 막는다.
// 보내는 값은 날짜(YYYY-MM-DD)뿐이다. hospital_id·closed_at은 DB가 정한다. 건수 표는 건드리지 않는다.
// 마이그레이션 전에는 표가 없다: 읽기는 완료 표시 없음(빈 목록), 저장·지우기는 E-DAYCLOSE-FAILED

export type ClaimDayClose = Pick<ClaimDayCloseRow, 'visit_date' | 'closed_at'>

const TABLE = 'claim_day_closes'
const COLUMNS = 'visit_date, closed_at'
/** 기간 없이 읽을 때 상한: 최근 날부터. 건수 읽기(밖에서 보는 400일)와 같은 길이다 */
const RECENT_DAYS = 400

/** 완료 표시를 저장·지우지 못했거나 날짜 모양이 틀려 보내지 않음. 받은 값과 원래 오류 글은 옮기지 않는다 */
export class DayCloseError extends Error {
  readonly code: ErrorCode = 'E-DAYCLOSE-FAILED'
  constructor() {
    super('E-DAYCLOSE-FAILED')
    this.name = 'DayCloseError'
  }
}

const isDate = (x: unknown): x is string => typeof x === 'string' && isYmd(x)

/** 같은 날은 하나로 줄인다. 날짜 모양이 아닌 값이 하나라도 있으면 던진다(AC-2806.1) */
function checkDates(dates: readonly string[]): string[] {
  const unique = [...new Set(dates)]
  if (!unique.every(isDate)) throw new DayCloseError()
  return unique
}

/** 저장·지우기 한 번. 실패(표 없음·연결 끊김 포함)는 모두 DayCloseError */
async function send(write: () => PromiseLike<{ error: unknown }>): Promise<void> {
  let reply: { error: unknown }
  try {
    reply = await write()
  } catch {
    throw new DayCloseError()
  }
  if (reply.error) throw new DayCloseError()
}

/**
 * 완료 표시 읽기. range가 있으면 그 기간(gte/lte), 없으면 최근 날부터 400줄.
 * 표 없음(PGRST205·42P01·404) → [], 그 밖의 실패 → CountsReadError. 기간이 날짜 모양이 아니면 보내지 않고 DayCloseError(AC-2806.1)
 */
export async function readClosedDays(sb: SupabaseClient, range?: DateRange): Promise<ClaimDayClose[]> {
  if (range && !(isDate(range.from) && isDate(range.to))) throw new DayCloseError()
  return readRows<ClaimDayClose>(() => {
    const query = sb.from(TABLE).select(COLUMNS)
    return range ? query.gte('visit_date', range.from).lte('visit_date', range.to) : query.order('visit_date', { ascending: false }).limit(RECENT_DAYS)
  })
}

/** 날짜들을 완료로(AC-2801.3). 빈 목록이면 부르지 않는다. 이미 있으면 그대로 둔다(처음 시각 유지, AC-2801.6). 실패 → DayCloseError */
export async function closeDays(sb: SupabaseClient, dates: readonly string[]): Promise<void> {
  const days = checkDates(dates)
  if (days.length === 0) return
  await send(() => sb.from(TABLE).upsert(days.map((visit_date) => ({ visit_date })), { onConflict: 'hospital_id,visit_date', ignoreDuplicates: true }))
}

/** 완료 표시 지우기(AC-2802.2). 빈 목록이면 부르지 않는다. 검사·실패는 closeDays와 같다 */
export async function reopenDays(sb: SupabaseClient, dates: readonly string[]): Promise<void> {
  const days = checkDates(dates)
  if (days.length === 0) return
  await send(() => sb.from(TABLE).delete().in('visit_date', days))
}
