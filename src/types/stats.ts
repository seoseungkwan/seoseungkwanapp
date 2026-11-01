import type { ClinicReportNumbers } from './clinicReport'
import type { DateRange } from './dates'
import type { DayPayload, MonthPayload } from './payload'

// 화면 ↔ 통계 Worker가 주고받는 모양. 화면이 받는 값에는 차트번호·환자 번호·진료 줄·접수 줄이 없다(AC-505.5)

// 기간 합계의 확인 건수: 차트번호 없는 내원·중복 내원·첫 내원 못 찾은 환자. 하나라도 0이 아니면 품질 incomplete
export type StatsChecks = { noChart: number; duplicate: number; noFirst: number }

export type StatsLoaded = {
  range: DateRange
  // 저장할 덮은 기간 = [from, min(to, 끝난 마지막 날)], 끝난 마지막 날 = 오늘 진료 끝이면 오늘, 아니면 어제. 비면 null.
  // (요약 buildSummary에 넣는 덮은 기간은 [from, min(to, 오늘)]이라 다르다 — 오늘 줄은 partial이다)
  covered: DateRange | null
  quality: 'valid' | 'incomplete'
  checks: StatsChecks
  months: MonthPayload[] | null // incomplete면 null
  days: DayPayload[] | null // incomplete면 null
  report: { daily: ClinicReportNumbers[]; monthly: ClinicReportNumbers[] }
}

// 화면 → Worker. 기간·오늘·"오늘 진료 끝" 표시·통로 요청 id만 간다(AC-505.7). 조각은 통로 포트로 따로 온다
export type StatsLoadRequest = { type: 'load'; streamId: string; from: string; to: string; today: string; closeToday: boolean }
export type StatsWorkerRequest = { type: 'bridge-port' } | StatsLoadRequest

// Worker → 화면. streamId는 화면이 준 요청 id를 돌려주는 것이다: 시간이 지나 포기한 앞 일의 늦은 답을 다음 일의 답으로 받지 않으려고.
// code는 오류 번호뿐이다(예외 내용을 싣지 않는다)
export type StatsWorkerMessage =
  | { type: 'loaded'; streamId: string; view: StatsLoaded }
  | { type: 'failed'; streamId: string; code: string }
