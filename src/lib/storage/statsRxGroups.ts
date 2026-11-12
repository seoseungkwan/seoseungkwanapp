import type { SupabaseClient } from '@supabase/supabase-js'
import { groupCond, groupOut } from '@/components/stats/treatmentView'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ErrorCode } from '@/types/errors'
import type { RxCond, StatsRxGroup } from '@/types/rxGroups'

// 통계 탭 '처방별 추세' 묶음 읽기·저장(spec treatment-trend REQ-1203). 브라우저 Supabase 클라이언트 + RLS로만 한다(ADR-004).
// 매출 탭 묶음과 모양(RxGroup)은 같지만 표·저장 함수는 따로다(2026-11-05 사용자 결정). 매출 묶음 표·함수는 부르지 않는다(AC-1203.5).
// 통계 묶음만 빼는 처방(out_codes)·조건(cond) 칸이 더 있다(spec group-exclude REQ-3702). 읽을 때 null은 빈 배열로 채운다.
// 보내는 묶음은 정해 둔 여섯 칸만 새 객체로 만든다(cond 항목도 { code, unless }만). hospital_id·updated_at은 DB가 채우고, 어느 병원 줄인지는 RLS가 고른다.
// 실패는 번호 하나로 던지고 서버 답은 옮기지 않는다(cause도 없다). 읽기 실패를 빈 목록으로 돌려주지 않는다(빈 목록이면 화면이 제안 묶음으로 바꾼다)

const TABLE = 'stats_rx_groups'
const SAVE_FUNCTION = 'save_stats_rx_groups'
const READ_FAILED = 'E-STATS-GROUP-READ-FAILED'
const SAVE_FAILED = 'E-STATS-GROUP-SAVE-FAILED'

// stats.ts의 SupabaseLike는 'from'뿐이라 따로 둔다
type Client = Pick<SupabaseClient, 'from' | 'rpc'>
type Deps = { client?: Client }
type DbGroup = { id: string; name: string; codes: string[]; out_codes: string[] | null; cond: RxCond[] | null; sort_order: number }

export class StatsRxGroupStoreError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode) {
    super(code)
    this.name = 'StatsRxGroupStoreError'
    this.code = code
  }
}

// id는 고칠 줄을 고른다. null이면 저장 함수가 새 줄로 넣는다. 빼는 처방·조건이 없는 묶음도 빈 배열로 여섯 칸을 늘 보낸다
const toDbGroup = (group: StatsRxGroup) => ({
  id: group.id,
  name: group.name,
  codes: [...group.codes],
  out_codes: [...groupOut(group)],
  cond: groupCond(group).map(({ code, unless }) => ({ code, unless: [...unless] })),
  sort_order: group.sortOrder,
})
const fromDbGroup = (row: DbGroup): StatsRxGroup => ({
  id: row.id,
  name: row.name,
  codes: row.codes,
  out: row.out_codes ?? [],
  cond: row.cond ?? [],
  sortOrder: row.sort_order,
})

/** 어디서 실패하든(클라이언트 만들기·보내기·오류 답·줄 목록이 아닌 답) 번호 하나로 바꾼다. 원래 오류는 버린다 */
async function groupsOrFail(
  code: ErrorCode,
  deps: Deps | undefined,
  run: (client: Client) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<StatsRxGroup[]> {
  try {
    const { data, error } = await run(deps?.client ?? supabaseBrowser())
    if (!error && Array.isArray(data)) return (data as DbGroup[]).map(fromDbGroup)
  } catch {
    // 아래에서 번호만 던진다
  }
  throw new StatsRxGroupStoreError(code)
}

export function listStatsRxGroups(deps?: Deps): Promise<StatsRxGroup[]> {
  return groupsOrFail(READ_FAILED, deps, (client) =>
    client.from(TABLE).select('id,name,codes,out_codes,cond,sort_order').order('sort_order', { ascending: true }),
  )
}

/** 한 트랜잭션이라 실패하면 표는 그대로다. 받은 목록은 고치지 않고, 새 id는 돌려준 목록에만 있다 */
export function saveStatsRxGroups(after: readonly StatsRxGroup[], deps?: Deps): Promise<StatsRxGroup[]> {
  return groupsOrFail(SAVE_FAILED, deps, (client) => client.rpc(SAVE_FUNCTION, { groups: after.map(toDbGroup) }))
}
