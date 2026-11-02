import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClaimDayCountRow } from '@/types/db'

// 날짜별 건수 읽기(precheck AC-013.1, design.md 6-4·8-2). 브라우저 → Supabase, 권한은 RLS가 막는다. 숫자와 날짜뿐이고 환자 자료는 오지 않는다.
// 표는 TASK-19 마이그레이션이 만든다. 그 전에는 표가 없으므로 빈 목록이다(모든 날이 '아직 불러오지 않은 날'). 쓰기는 TASK-19가 이 파일에 더한다

export type ClaimDayCount = Pick<ClaimDayCountRow, 'visit_date' | 'need_memo' | 'entered' | 'needs_check' | 'skipped' | 'updated_at'>

/** 표가 있는데 읽지 못함. 원래 오류 글은 옮기지 않는다 */
export class CountsReadError extends Error {
  constructor() {
    super('counts')
    this.name = 'CountsReadError'
  }
}

/** PostgREST가 모르는 표(PGRST205)·Postgres undefined_table(42P01)·그 경로 없음(404) */
const NO_TABLE_CODES: ReadonlySet<unknown> = new Set(['PGRST205', '42P01'])

type Reply = { data: ClaimDayCount[] | null; error: { code?: string } | null; status?: number }

export async function readDayCounts(sb: SupabaseClient, from: string, to: string): Promise<ClaimDayCount[]> {
  let reply: Reply
  try {
    reply = (await sb
      .from('claim_day_counts')
      .select('visit_date, need_memo, entered, needs_check, skipped, updated_at')
      .gte('visit_date', from)
      .lte('visit_date', to)) as Reply
  } catch {
    throw new CountsReadError()
  }
  if (reply.error) {
    if (NO_TABLE_CODES.has(reply.error.code) || reply.status === 404) return []
    throw new CountsReadError()
  }
  return reply.data ?? []
}
