// 통계 요약 '이번 달 목표' (stats-insights REQ-6102, design.md '목표'). 병원·달마다 한 줄(stats_goals)이고 서버에는 달과 이 세 숫자만 간다.
// null = 그 지표는 목표 없음. 내원·신환은 명, 매출은 원(정수). 상한은 stats_goals CHECK와 같다
export type Goal = { visits: number | null; newPatients: number | null; revenue: number | null }
export type GoalKey = keyof Goal

/** 화면·저장 차례: 내원 → 신환 → 매출 */
export const GOAL_KEYS = ['visits', 'newPatients', 'revenue'] as const satisfies readonly GoalKey[]
export const NO_GOAL: Goal = { visits: null, newPatients: null, revenue: null }

/** 내원·신환 목표 상한(명) */
export const GOAL_COUNT_MAX = 1_000_000
/** 매출 목표 상한(원) */
export const GOAL_REVENUE_MAX = 100_000_000_000
