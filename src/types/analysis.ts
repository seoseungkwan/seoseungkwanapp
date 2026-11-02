import type { DateRange } from './dates'

// 일·주·월 칸(버킷)마다 센 숫자. 구역 ①(브라우저) 안에서 화면으로만 간다. 환자 번호는 들어 있지 않다(몇 명인지만)

export type Grain = 'day' | 'week' | 'month'

// patients = newPatients + returning + unknown. 일 칸은 그날 값(파일 길은 줄 표시로 센 그날 환자, 도우미 길은 접수 건수),
// 주·달 칸은 그 일 칸들의 합이다(칸 안 서로 다른 환자 수가 아니다, AC-501.6)
export type Totals = { patients: number; newPatients: number; returning: number; unknown: number }

// 도우미 길의 접수 줄: 환자·날마다 한 줄. receptions = 그날 접수 건수, firstVisit = 그날이 첫 내원일
export type PatientDay = { patient: number; date: string; receptions: number; firstVisit: boolean }

// 1회 · 2회 · 3~5회 · 6회+ (환자 수). 네 칸의 합 = 그 처방의 patients
export type FollowUp = [number, number, number, number]

// 처방코드 그룹(예: 도수치료 10·20·30분). id는 영문·숫자·붙임표 1~64자(나중 rx_groups.id). 즐겨찾기는 코드 하나짜리 그룹
export type RxGroupDef = { id: string; codes: string[] }

export type RxStats = {
  code: string
  name: string // 그 칸에서 가장 많이 나온 이름(같으면 먼저 나온 것)
  type: string // 같은 방법
  patients: number
  newPatients: number // 그중 그 칸의 신환
  returning: number // 그중 그 칸의 재진. newPatients + returning ≤ patients(나머지는 알 수 없음)
  followup: FollowUp
  regions: { name: string; patients: number }[] // 이 칸에서 이 처방을 받은 환자의 동네별 수. 이름 순, null 주소는 NO_ADDRESS('주소 없음')
}

// 그룹 코드 중 하나라도 받은 환자. followup은 그룹 코드 중 하나라도 받은 서로 다른 날 수
export type GroupStats = { id: string; patients: number; newPatients: number; returning: number; followup: FollowUp }

// 첫 신환일(묶음 전체에서 가장 이른 신환 외래 줄의 날)이 이 칸에 있는 환자(cohort) 중
// 다음 날부터 7일째·14일째·30일째까지(양 끝 포함) 외래 줄이 있는 환자 수. 덮은 기간과 상관없이 센 그대로('집계 중'은 요약이 정한다).
// 도우미 길은 첫 신환일과 외래 날에 접수 줄(PatientDay)도 본다.
// after30 = 30일 안에는 오지 않고 31일째 이후에 처음 다시 온 환자 수(불러온 자료 끝날까지 본 수, 원본 ReturnAfter30Days).
// within7 ≤ within14 ≤ within30 ≤ cohort, within30 + after30 ≤ cohort
export type RevisitCounts = { cohort: number; within7: number; within14: number; within30: number; after30: number }

export type BucketStats = {
  key: string // day: 'YYYY-MM-DD', week: 그 주 월요일 'YYYY-MM-DD', month: 'YYYY-MM'
  range: DateRange // 이 칸이 덮는 날(일=그날, 주=월~일, 월=1일~말일)
  totals: Totals
  rx: RxStats[] // 처방코드 순
  regions: { name: string; patients: number }[] // 이름 순, null 주소는 '주소 없음'
  groups: GroupStats[] // id 순, 그 칸에 환자가 있는 그룹만
  revisit: RevisitCounts
}

// 각각 key 오름차순, 줄이 있는 칸만(도우미 길은 접수 줄만 있는 날의 칸도)
export type Aggregates = Record<Grain, BucketStats[]>

// ── 요약과 증감 (lib/analytics/compare.ts가 만든다. 화면은 빼기·나누기를 하지 않고 이것만 보여 준다) ──

// complete = 통째로 덮였고 끝났음 · in-progress = 끝 날이 오늘 이후('집계 중') · partial = 덜 덮임(파일 사이 공백 포함)
export type BucketState = 'complete' | 'in-progress' | 'partial'

// 화면 문구는 kind를 보고 화면이 정한다
export type Delta =
  | { kind: 'change'; diff: number; pct: number | null } // pct는 퍼센트(50 = +50%), 이전이 0이면 null
  | { kind: 'new' } // 유효한 비교에서 이전 0, 지금 > 0
  | { kind: 'in-progress' } // 지금 칸이 진행 중
  | { kind: 'unavailable' } // 이전 칸 없음·부분, 지금 칸 부분, 집계 품질 incomplete

export type TotalsDelta = { patients: Delta; newPatients: Delta; returning: Delta }

// 처방 하나: 지금 칸 vs 이전 칸
export type RxCompare = {
  code: string
  name: string
  type: string
  current: number // 지금 칸 환자 수(그 칸에 없으면 0)
  previous: number | null // 이전 칸이 완전할 때만 숫자(없으면 0), 아니면 null
  delta: Delta
  newRate: number | null // 지금 칸 신환 / 전체(0~1), 0명이면 null
  returningRate: number | null // 지금 칸 재진 / 전체(0~1), 0명이면 null
  followupRate: number | null // 지금 칸 2회 이상 / 전체(0~1), 0명이면 null
}

// 그룹 하나: 지금 칸 vs 이전 칸. 처방 비교와 같은 규칙(이름은 화면이 rx_groups에서 붙인다)
export type GroupCompare = {
  id: string
  current: number
  previous: number | null
  delta: Delta
  newRate: number | null
  returningRate: number | null
  followupRate: number | null
}

// 칸 전체 중 신환·재진 비율(0~1). 0명인 칸은 null
export type Rates = { newRate: number | null; returningRate: number | null }

// 신환 재방문. withinN null = '집계 중'(칸 첫날 ~ 칸 끝날 + N일이 다 덮이지 않았거나 아직 끝나지 않음).
// rateN = withinN / cohort — 집단이 0명이거나 집계 중이면 null. after30은 30일이 숫자일 때만 숫자
export type RevisitView = {
  cohort: number
  within7: number | null
  within14: number | null
  within30: number | null
  after30: number | null
  rate7: number | null
  rate14: number | null
  rate30: number | null
}

// 칸 하나의 합계. 덮였지만 줄이 없는 칸은 totals가 모두 0
export type BucketRef = { key: string; range: DateRange; state: BucketState; totals: Totals; rates: Rates; revisit: RevisitView }

export type DayView = {
  day: BucketRef | null // 맨 위 날: 덮은 기간 안, 오늘보다 앞, 환자 1명 이상인 가장 늦은 날
  prevClinicDay: BucketRef | null // 그 앞 진료일. 사이에 안 덮인 날이 있으면 모름(null)
  vsPrevClinicDay: TotalsDelta
  sameWeekdayLastWeek: BucketRef | null // 맨 위 날 − 7일
  vsSameWeekdayLastWeek: TotalsDelta
  rx: RxCompare[] // 처방코드 순, 맨 위 날 vs 직전 진료일
  topRising: RxCompare[]
  topFalling: RxCompare[]
  groups: GroupCompare[] // id 순, 맨 위 날 vs 직전 진료일
}

export type GrainView = {
  current: BucketRef | null // 가장 최근 칸(진행 중일 수 있음)
  lastComplete: BucketRef | null // 상태가 complete인 가장 최근 칸
  previous: BucketRef | null // lastComplete 바로 앞 칸(달력으로)
  vsPrevious: TotalsDelta
  rx: RxCompare[] // 처방코드 순, lastComplete vs previous
  topRising: RxCompare[]
  topFalling: RxCompare[]
  groups: GroupCompare[] // id 순, lastComplete vs previous
}

export type Summary = {
  quality: 'valid' | 'incomplete'
  today: string
  covered: DateRange[] // 합친 구간, 시작 순
  day: DayView
  week: GrainView
  month: GrainView
  series: Record<Grain, BucketRef[]> // 추세 그래프용, key 오름차순. 줄이 있거나 덮은 기간에 걸친 칸
}

// ── 처방 추세 (lib/analytics/rxTrend.ts가 만든다. 저장한 일 숫자로 그린다) ──

export type TrendBucket = Grain

// 원본 enum 이름 그대로
export type TrendComparison = 'PreviousEqualDays' | 'PreviousYear' | 'PreviousMonth'

// 처방 하나의 칸 하나. start·end는 기간 안으로 자른 날이고, partial이면 label 끝에 '(일부 기간)'이 붙는다.
// count = 덮은 날들의 그 처방 환자 수 합(건). newCount + returningCount ≤ count(나머지는 알 수 없음).
// 소모량·금액은 저장 모양에 없어 늘 null('자료 없음')
export type TrendPoint = {
  code: string
  start: string
  end: string
  label: string
  partial: boolean
  count: number
  newCount: number
  returningCount: number
  quantity: null
  amount: null
}
