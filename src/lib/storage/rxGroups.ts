import type { SupabaseClient } from '@supabase/supabase-js'
import type { ErrorCode } from '@/types/errors'
import type { RxGroup } from '@/types/rxGroups'

// 치료 묶음 저장·읽기(spec revenue design.md 8-2절, REQ-013). 브라우저 Supabase 클라이언트 + RLS로만 한다.
// 이름이 일반적인 까닭: 통계 치료별 추세는 같은 모양(RxGroup)을 쓰지만 표는 따로(stats_rx_groups, lib/storage/statsRxGroups.ts)다(spec treatment-trend). 매출만의 일을 넣지 않는다.
// 보내는 묶음은 정해 둔 칸만 새 객체로 만든다. hospital_id·updated_at은 DB가 채운다.
// Supabase 오류 내용은 버린다(화면·기록에 넘기지 않는다). 번호만 던진다.

const SAVE_FAILED = 'E-REVENUE-GROUP-SAVE-FAILED'
const LOAD_FAILED = 'E-REVENUE-GROUP-LOAD-FAILED'

export class RxGroupStoreError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode) {
    super(code)
    this.name = 'RxGroupStoreError'
    this.code = code
  }
}

export type RxGroupStore = {
  listGroups(): Promise<RxGroup[]>
  saveGroups(after: RxGroup[]): Promise<RxGroup[]>
}

type DbGroup = { id: string; name: string; codes: string[]; sort_order: number }

// id는 고칠 줄을 고르는 데 쓴다. null이면 save_rx_groups가 새 줄로 넣는다
const toDbGroup = (group: RxGroup) => ({ id: group.id, name: group.name, codes: group.codes, sort_order: group.sortOrder })
const fromDbGroup = (row: DbGroup): RxGroup => ({ id: row.id, name: row.name, codes: row.codes, sortOrder: row.sort_order })

/** 오류·예외·줄 목록이 아닌 답은 모두 번호 하나로 바꾼다. 읽기 실패를 빈 목록으로 돌려주면 화면이 제안 묶음으로 잘못 바꾼다 */
async function groupsOrFail(code: ErrorCode, run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<RxGroup[]> {
  try {
    const { data, error } = await run()
    if (!error && Array.isArray(data)) return (data as DbGroup[]).map(fromDbGroup)
  } catch {
    // 아래에서 번호만 던진다
  }
  throw new RxGroupStoreError(code)
}

export function createRxGroupStore(client: SupabaseClient): RxGroupStore {
  return {
    listGroups: () => groupsOrFail(LOAD_FAILED, () => client.from('rx_groups').select('id,name,codes,sort_order').order('sort_order')),
    // 한 트랜잭션이라 실패하면 표는 그대로다. 그래서 같은 목록으로 다시 부르면 처음 저장과 같은 결과다(design.md 6절)
    saveGroups: (after) => groupsOrFail(SAVE_FAILED, () => client.rpc('save_rx_groups', { groups: after.map(toDbGroup) })),
  }
}
