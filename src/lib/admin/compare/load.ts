import { addDays, addMonths, monthRange } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'

// 의원 비교 한 의원 불러오기(spec admin-view design.md '의원 비교 — 계산' load.ts·'비교 읽기' 표·'불러오기와 한도').
// 의원 하나 = admin_rows 열여덟 종류를 한 번씩. 줄은 jsonb 그대로 종류별로 묶고, 줄 검사는 쓰는 쪽(TASK-13·14)이 지금 줄 검사 함수로 한다.
// read는 readAdminRows(lib/storage/adminRows.ts) 모양의 함수다 — 같은 Phase 파일을 부르지 않으려고 종류 이름과 모양을 여기 따로 둔다(TASK-15가 넘긴다)

/** design.md '비교 읽기' 표 차례 */
export const COMPARE_KINDS = [
  'stats_days',
  'stats_months',
  'stats_day_totals',
  'stats_coverage',
  'stats_rx_groups',
  'stats_goals',
  'sales_days',
  'sales_code_totals',
  'sales_codes',
  'sunap_settings',
  'sunap_days',
  'calendar_settings',
  'calendar_allday',
  'calendar_counts',
  'clinic_profiles',
  'staff_members',
  'staff_pay',
  'staff_settings',
] as const
export type CompareKind = (typeof COMPARE_KINDS)[number]
export type CompareRead = (
  kind: CompareKind,
  hospitalIds: readonly string[],
  from: string,
  to: string,
) => Promise<readonly { hospitalId: string; row: Record<string, unknown> }[]>
/** 종류마다 그 의원 줄(jsonb 그대로, 읽은 차례) */
export type CompareRaw = Record<CompareKind, Record<string, unknown>[]>

/**
 * 종류마다 읽는 기간(고른 달 'YYYY-MM'):
 * 날 줄·매출·코드 합·수납·예약·통계 덮음·달 줄(지난달·고른 달) = 지난달 1일 ~ 고른 달 끝(증감 비교·'평소와 다른 것'),
 * 휴일 날 합계 = 고른 달 끝 − 364일 ~ 고른 달 끝('휴일에 따라' 12달), 목표·급여 = 고른 달.
 * 기간으로 거르지 않는 종류(설정·처방 묶음·병원 정보·직원)는 고른 달을 넘긴다(admin_rows가 기간을 늘 받는다)
 */
export function compareRanges(month: string): Record<CompareKind, DateRange> {
  const one = monthRange(month)
  const two = { from: `${addMonths(month, -1)}-01`, to: one.to }
  const year = { from: addDays(one.to, -364), to: one.to }
  return {
    stats_days: two,
    stats_months: two,
    stats_day_totals: year,
    stats_coverage: two,
    stats_rx_groups: one,
    stats_goals: one,
    sales_days: two,
    sales_code_totals: two,
    sales_codes: two,
    sunap_settings: one,
    sunap_days: two,
    calendar_settings: two,
    calendar_allday: two,
    calendar_counts: two,
    clinic_profiles: one,
    staff_members: one,
    staff_pay: one,
    staff_settings: one,
  }
}

/** 열여덟 종류를 함께 읽는다. 하나라도 실패하면 그 오류로 실패한다(저절로 다시 읽지 않음). 다른 의원 줄은 버린다 */
export async function loadHospital(read: CompareRead, hospitalId: string, month: string): Promise<CompareRaw> {
  const ranges = compareRanges(month)
  const lists = await Promise.all(
    COMPARE_KINDS.map(async (kind) => {
      const rows = await read(kind, [hospitalId], ranges[kind].from, ranges[kind].to)
      return [kind, rows.filter((item) => item.hospitalId === hospitalId).map((item) => item.row)] as const
    }),
  )
  return Object.fromEntries(lists) as CompareRaw
}
