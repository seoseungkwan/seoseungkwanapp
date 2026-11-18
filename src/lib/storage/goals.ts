import type { SupabaseClient } from '@supabase/supabase-js'
import { isMonth } from '@/lib/analytics/dates'
import type { ErrorCode } from '@/types/errors'
import { GOAL_COUNT_MAX, GOAL_KEYS, GOAL_REVENUE_MAX, NO_GOAL, type Goal, type GoalKey } from '@/types/goals'

// 이번 달 목표 읽기·저장(stats-insights REQ-6102 AC-6102.2, design.md '목표'). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 보내는 값은 달('YYYY-MM')과 세 숫자뿐이다. hospital_id는 DB 기본값이 정한다. 세 값이 모두 비면 그 달 줄을 지운다.
// 번호는 통계 숫자 저장·읽기와 같다(E-STATS-SAVE-FAILED · E-STATS-READ-FAILED. 새 번호는 types/errors.ts를 고쳐야 해 이 명세 범위 밖이다).
// 실패는 번호만 던지고 서버 답·받은 값은 옮기지 않는다(cause도 없다). 표가 없으면(SQL 전) 읽기도 실패다(design.md '위험')

const TABLE = 'stats_goals'
const COLUMNS = 'visits, new_patients, revenue'
const READ_FAILED = 'E-STATS-READ-FAILED'
const SAVE_FAILED = 'E-STATS-SAVE-FAILED'

type GoalErrorCode = typeof READ_FAILED | typeof SAVE_FAILED
type DbGoal = { visits: unknown; new_patients: unknown; revenue: unknown }

export class GoalStoreError extends Error {
  readonly code: ErrorCode

  constructor(code: GoalErrorCode) {
    super(code)
    this.name = 'GoalStoreError'
    this.code = code
  }
}

const maxOf = (key: GoalKey) => (key === 'revenue' ? GOAL_REVENUE_MAX : GOAL_COUNT_MAX)
/** null(목표 없음)이거나 0 ~ 상한 정수 */
const isValue = (key: GoalKey, value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maxOf(key))
const isEmpty = (goal: Goal) => GOAL_KEYS.every((key) => goal[key] === null)

// 어디서 실패하든(검사·보내기·읽기·클라이언트가 그 자리에서 던짐) 번호 하나로 바꾼다. 원래 오류는 버린다
async function attempt<T>(code: GoalErrorCode, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch {
    throw new GoalStoreError(code)
  }
}

function fromDb(row: DbGoal): Goal {
  const goal = { visits: row.visits, newPatients: row.new_patients, revenue: row.revenue }
  if (!GOAL_KEYS.every((key) => isValue(key, goal[key]))) throw new Error('목표 모양이 아님')
  return goal as Goal
}

/** 그 달 목표. 줄이 없으면 세 값 모두 null. 실패·모양이 틀린 줄은 E-STATS-READ-FAILED */
export async function loadGoal(client: SupabaseClient, month: string): Promise<Goal> {
  return attempt(READ_FAILED, async () => {
    if (typeof month !== 'string' || !isMonth(month)) throw new Error('달 모양이 아님')
    const { data, error } = await client.from(TABLE).select(COLUMNS).eq('month', month)
    if (error) throw error
    if (data === null) return { ...NO_GOAL }
    if (!Array.isArray(data)) throw new Error('줄 목록이 아님')
    const [row] = data as DbGoal[]
    return row === undefined ? { ...NO_GOAL } : fromDb(row)
  })
}

/** 그 달 목표 저장: 줄 하나 upsert, 세 값이 모두 비면 그 줄을 지운다. 모양이 틀리면 보내지 않고 E-STATS-SAVE-FAILED */
export async function saveGoal(client: SupabaseClient, month: string, goal: Goal): Promise<void> {
  return attempt(SAVE_FAILED, async () => {
    if (typeof month !== 'string' || !isMonth(month)) throw new Error('달 모양이 아님')
    if (!GOAL_KEYS.every((key) => isValue(key, goal[key]))) throw new Error('목표 모양이 아님')
    const { error } = isEmpty(goal)
      ? await client.from(TABLE).delete().eq('month', month)
      : await client.from(TABLE).upsert({ month, visits: goal.visits, new_patients: goal.newPatients, revenue: goal.revenue }, { onConflict: 'hospital_id,month' })
    if (error) throw error
  })
}
