import type { Totals, TotalsDelta } from './analysis'

// 병원 계정(서버)에 저장된 달 숫자(MonthPayload)로 보는 [월] 탭의 지난달·작년 같은 달 대비와 최근 12달 추세.
// lib/analytics/history.ts가 만든다. 화면은 빼기·나누기를 하지 않고 이것만 보여 준다

export type MonthTotals = { month: string; totals: Totals } // month: 'YYYY-MM'

export type TrendMonth = { month: string; patients: number | null; newPatients: number | null; partial: boolean } // 저장 안 된 달은 null

export type HistoryView = {
  base: MonthTotals | null // 기준 달: 저장된 달 중 partial이 아닌 가장 최근 달
  lastMonth: MonthTotals | null // base − 1달(저장돼 있고 완전할 때만)
  vsLastMonth: TotalsDelta
  lastYear: MonthTotals | null // base − 12달(저장돼 있고 완전할 때만)
  vsLastYear: TotalsDelta
  trend: TrendMonth[] // 가장 최근 저장된 달까지 12달, 오래된 달이 먼저. 저장된 달이 없으면 빈 배열
}
