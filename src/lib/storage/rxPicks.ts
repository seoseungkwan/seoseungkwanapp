import { validateRxPick } from '@/lib/payload/validate'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { StatsRxPickRow } from '@/types/db'
import type { ErrorCode } from '@/types/errors'
import type { RxPick } from '@/types/rxPicks'
import { readAllPages, type SupabaseLike } from './stats'

// 통계 탭에서 고른 처방 저장·읽기(브라우저 → Supabase, ADR-004). 서버로 가는 값은 검사한 코드·이름뿐이다.
// hospital_id·pick_order는 보내지 않는다 — DB가 정하고, 어느 줄인지는 RLS가 고른다(AC-811.3·AC-811.4).
// 실패는 번호 하나로 던지고 서버 답은 옮기지 않는다(cause도 없다). 화면은 오류 번호의 정해 둔 문구만 보인다

const TABLE = 'stats_rx_picks'
const READ_FAILED = 'E-STATS-PICK-READ-FAILED'
const SAVE_FAILED = 'E-STATS-PICK-SAVE-FAILED'
const ALREADY_PICKED = '23505' // 겹침 오류. 다른 기기에서 이미 골랐다

type Deps = { client?: SupabaseLike }

export class RxPickStoreError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode) {
    super(code)
    this.name = 'RxPickStoreError'
    this.code = code
  }
}

// 어디서 실패하든(검사·클라이언트 만들기·보내기·읽기) 번호 하나로 바꾼다. 원래 오류는 버린다
async function attempt<T>(code: ErrorCode, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch {
    throw new RxPickStoreError(code)
  }
}

export async function readRxPicks(deps?: Deps): Promise<RxPick[]> {
  return attempt(READ_FAILED, async () => {
    const client = deps?.client ?? supabaseBrowser()
    const stored = await readAllPages<Pick<StatsRxPickRow, 'code' | 'name'>>(async (first, last) => {
      const answer = await client.from(TABLE).select('code, name').order('pick_order', { ascending: true }).range(first, last)
      // 읽기 실패를 "고른 처방이 없다"로 보이지 않는다(AC-812.3). readAllPages는 빈 답을 빈 목록으로 읽는다
      if (!answer.error && !Array.isArray(answer.data)) throw new Error('줄 목록이 아님')
      return answer
    })
    return stored.flatMap((row) => validateRxPick(row) ?? [])
  })
}

export async function addRxPick(pick: RxPick, deps?: Deps): Promise<'added' | 'already'> {
  return attempt(SAVE_FAILED, async () => {
    const body = validateRxPick(pick)
    if (body === null) throw new Error('검사에 걸림')
    const client = deps?.client ?? supabaseBrowser()
    const { error } = await client.from(TABLE).insert(body)
    if (!error) return 'added'
    if (error.code === ALREADY_PICKED) return 'already'
    throw error
  })
}

/** 받은 글자 그대로인 줄을 지운다. 부르는 쪽은 저장된 코드 글자를 넘긴다(AC-812.7). 없는 줄을 지워도 성공이다 */
export async function removeRxPick(storedCode: string, deps?: Deps): Promise<void> {
  return attempt(SAVE_FAILED, async () => {
    const client = deps?.client ?? supabaseBrowser()
    const { error } = await client.from(TABLE).delete().eq('code', storedCode)
    if (error) throw error
  })
}

export async function clearRxPicks(deps?: Deps): Promise<void> {
  return attempt(SAVE_FAILED, async () => {
    const client = deps?.client ?? supabaseBrowser()
    // 조건 없는 지우기를 막는 설정에 걸리지 않게 늘 참인 조건을 둔다. 줄은 RLS가 고른다
    const { error } = await client.from(TABLE).delete().gte('pick_order', 0)
    if (error) throw error
  })
}
