import type { RxGroupDef } from './analysis'
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

// 처방별 신환·재진(AC-509.4). 처방마다 수와 이름뿐이다. 환자 번호·진료 줄은 Worker 밖으로 나오지 않는다
export type RxSplitLine = { code: string; label: string; newPatients: number; returning: number; total: number }
export type RxSplit = {
  from: string
  to: string
  visits: number
  patients: number
  newPatients: number
  returning: number
  lines: RxSplitLine[]
  invalidCodes: number
}
export type RxSplitDay = { date: string; visits: number; patients: number; newPatients: number; returning: number; lines: RxSplitLine[] }
// lines·days의 줄은 합계가 큰 차례(같으면 코드 순)이고 처방 줄뿐이다.
// text는 첫 줄이 비어 있다: Worker에는 병원 이름이 가지 않는다(AC-505.7). 병원 이름을 넣은 글은 화면이 formatRxVisitSplit(병원 이름, split)로 만든다
export type RxSplitView = { kind: 'none' } | { kind: 'split'; split: RxSplit; days: RxSplitDay[]; text: string; headline: string }

// 화면 → Worker. 기간·오늘·"오늘 진료 끝" 표시·통로 요청 id와 묶음 열쇠·코드만 간다(AC-505.7, 묶음은 treatment-trend AC-1205.4).
// 조각은 통로 포트로 따로 온다. groups는 선택 칸이고 없으면 []로 본다(requestLoad는 늘 배열을 싣는다). 묶음 이름은 가지 않는다(AC-1213.3)
export type StatsLoadRequest = {
  type: 'load'
  streamId: string
  from: string
  to: string
  today: string
  closeToday: boolean
  groups?: RxGroupDef[]
}
// split의 streamId는 통로 요청이 아니라 requestSplit이 정한 일 번호다. 답을 가려 받는 쓰임은 같다
export type StatsSplitRequest = { type: 'split'; streamId: string; from: string; to: string }
export type StatsWorkerRequest = { type: 'bridge-port' } | StatsLoadRequest | StatsSplitRequest

// Worker → 화면. streamId는 화면이 준 요청 id를 돌려주는 것이다: 시간이 지나 포기한 앞 일의 늦은 답을 다음 일의 답으로 받지 않으려고.
// code는 오류 번호뿐이다(예외 내용을 싣지 않는다)
export type StatsWorkerMessage =
  | { type: 'loaded'; streamId: string; view: StatsLoaded }
  | { type: 'split-result'; streamId: string; view: RxSplitView }
  | { type: 'failed'; streamId: string; code: string }
