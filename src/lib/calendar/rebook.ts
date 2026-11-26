import { addDays, compareYmd, diffDays } from '@/lib/analytics/dates'
import type { CalSlotRow } from '@/types/calendar'
import { NO_STAFF_ID } from './counts'
import { shownStatus } from './rules'

// 시행자별 다시 예약 (spec stats-insights REQ-6104 AC-6104.2). 순수 함수다.
// 대상 = 보이는 상태가 '왔음'이고 차트번호가 있고 날이 (오늘 − 14일)까지인 예약(다시 잡을 14일이 다 지난 것),
// 다시 예약 = 같은 차트번호·같은 시행자의 취소 아닌 예약이 그날 뒤 1~14일 안에 있는 것.
// 차트번호는 이 셈 안에서만 쓰고 결과에는 시행자 id와 수·비율만 나간다.
// 시행자 없는 예약(시행자 null, google-link AC-8503.3)은 '시행자 없음' 한 묶음(id NO_STAFF_ID)으로 센다

export const REBOOK_DAYS = 14
export const REBOOK_MIN_TARGETS = 5 // 대상이 이보다 적으면 비율 null

type RebookInput = Pick<CalSlotRow, 'day' | 'staffId' | 'status' | 'auto' | 'chart'>
/** pct = 다시 예약 ÷ 대상(반올림 정수 %), 대상이 5보다 적으면 null */
export type RebookRate = { staffId: string; targets: number; rebooked: number; pct: number | null }

const keyOf = (staffId: string, chart: string) => `${staffId}\u0000${chart}`

/** 시행자마다 다시 예약 비율. 줄에 나온 시행자 차례(대상이 없는 시행자도 대상 0·null) */
export function rebookRates(rows: readonly RebookInput[], today: string): RebookRate[] {
  const lastTarget = addDays(today, -REBOOK_DAYS)
  // 같은 시행자·같은 차트번호의 취소 아닌 예약 날들
  const booked = new Map<string, string[]>()
  for (const row of rows) {
    if (row.status === 'cancel' || !row.chart) continue
    const key = keyOf(row.staffId ?? NO_STAFF_ID, row.chart)
    const days = booked.get(key)
    if (days) days.push(row.day)
    else booked.set(key, [row.day])
  }
  const byStaff = new Map<string, { targets: number; rebooked: number }>()
  for (const row of rows) {
    const staffId = row.staffId ?? NO_STAFF_ID
    const counts = byStaff.get(staffId) ?? { targets: 0, rebooked: 0 }
    byStaff.set(staffId, counts)
    if (shownStatus(row) !== 'came' || !row.chart || compareYmd(row.day, lastTarget) > 0) continue
    counts.targets++
    const later = booked.get(keyOf(staffId, row.chart)) ?? []
    if (later.some((day) => diffDays(row.day, day) >= 1 && diffDays(row.day, day) <= REBOOK_DAYS)) counts.rebooked++
  }
  return [...byStaff].map(([staffId, { targets, rebooked }]) => ({
    staffId,
    targets,
    rebooked,
    pct: targets < REBOOK_MIN_TARGETS ? null : Math.round((rebooked / targets) * 100),
  }))
}
