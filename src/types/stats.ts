import type { RxGroupDef } from './analysis'
import type { ClinicReportNumbers } from './clinicReport'
import type { DateRange } from './dates'
import type { DayPayload, MonthPayload, MonthSections } from './payload'
import type { DoctorBreakdown, SunapRates } from './sunap'

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
  // 달 줄마다 같은 달의 세 칸 합계(spec stats-bit-ai AC-2901.1). v3 답이면 늘 있고 incomplete면 null, v2 답이면 열쇠가 없다(AC-2901.6).
  // 묶음 이름과 수, 원장님 이름·매출뿐이다. 통계 탭이 비트 저장에 함께 싣는다
  sections?: MonthSections[] | null
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

// ── 비트 전용 세 칸(stats-bit-sections): 환자 구성 · 시간대별 접수 · 원장님별 ──
// 묶음 이름(연령대·보험·동네·원장님 이름)과 수뿐이다. 차트번호·생년월일·주소 앞부분·접수 줄·진료의 코드는 없다(AC-2702.4)

// row = 보통 줄 · rest = '그 밖 N곳' · noTown = '동 없는 주소' · none = '생년월일 없음'·'주소 없음'. 증감은 row에만 있다(AC-2703.9)
export type MixRowKind = 'row' | 'rest' | 'noTown' | 'none'
// people = 명(서로 다른 환자) · visits = 건(접수) · share = people ÷ 묶음 전체 명(0~1) · previous = 견줄 기간의 명(견주지 않거나 row가 아니면 null)
export type MixRow = { label: string; people: number; visits: number; share: number; kind: MixRowKind; previous: number | null }
// compared = 견줄 기간도 세었는지. 줄은 화면에 보이는 차례다(연령대는 나이 차례, 나머지는 명이 큰 차례)
export type PatientMix = {
  total: { people: number; visits: number }
  compared: boolean
  age: MixRow[]
  insurance: MixRow[]
  city: MixRow[]
  town: MixRow[]
}
// 증감 글자(DeltaView와 같은 모양). text에는 ▲▼가 없다: 화면이 dir로 붙인다(DeltaText와 같음)
export type MixDelta = { dir: 'up' | 'down' | 'flat' | 'none'; text: string; srText: string }

// 시간대별 접수. weekday 1=월 … 7=일, cells는 hours와 같은 차례의 접수 합계(평균은 화면이 openDays로 나눈다)
export type VisitHourRow = { weekday: number; openDays: number; cells: number[] }
export type VisitPeak = { weekday: number; hour: number; average: number }
export type VisitHours = { hours: number[]; rows: VisitHourRow[]; unknown: number; peak: VisitPeak | null }

// 원장님별. amount는 원 단위 정수, perVisit = 매출 ÷ 내원의 원 미만을 버린 값(내원 0이면 null), share = 매출 ÷ 합계 매출(합계 0이면 null)
export type DoctorRow = {
  label: string
  patients: number
  newPatients: number
  visits: number
  amount: number
  perVisit: number | null
  share: number | null
}
export type DoctorTable = { kind: 'table'; rows: DoctorRow[]; total: DoctorRow }
export type DoctorsView = { kind: 'single' } | DoctorTable

// 몇 번까지 받나(stats-insights AC-6103.1) 묶음 한 줄. group = 묶음 열쇠(불러올 때 실은 RxGroupDef.id, 이름은 화면이 붙인다). 환자 번호는 없다.
// n = 대상(첫 내원일이 불러온 기간 안이고 그 묶음을 받았고, 마지막으로 받은 날이 자료 끝 날 − 30일보다 앞이거나 같은 환자),
// atLeast = 1·2·3·4·5·6회 이상 인원, ten = 10회 이상, once = 1회만(= atLeast[0] − atLeast[1]), average = 평균 횟수(소수 1자리 반올림),
// drop = 가장 많이 빠지는 곳 k(1~5, k회 이상 − (k+1)회 이상이 가장 큰 k, 같으면 작은 k). 횟수 = 그 묶음을 받은 서로 다른 날 수
export type DropoffLine = {
  group: string
  n: number
  atLeast: [number, number, number, number, number, number]
  ten: number
  once: number
  average: number
  drop: number
}

// 신환 1명당 매출(stats-insights AC-6106.3) 받은 치료별 한 줄. groups = 그 90일에 받은 묶음 열쇠(불러올 때 실은 RxGroupDef.id, 그 차례, 이름은 화면이 붙인다).
// [] = 진료만(묶음을 하나도 안 받음), null = '그 밖'(인원 5명 미만 조합과 인원 6번째부터의 조합을 합친 줄). n = 인원, average = 1명당 금액(원 미만 버림)
export type PatientValueLine = { groups: string[] | null; n: number; average: number }
// 대상 = 첫 내원일이 불러온 기간 안이고 첫 내원일 + 89일이 자료 끝 날보다 앞이거나 같은 신환. 금액은 원 단위 정수(환불이 더 크면 음수일 수 있다).
// n = 대상 수, average = 1명당 평균(원 미만 버림), times = 1명당 내원 횟수(소수 1자리 버림), perVisit = 한 번 올 때 평균(전체 금액 ÷ 전체 내원, 버림).
// lines = 받은 치료별(평균이 작은 순, '그 밖'은 맨 끝). 대상이 없으면 n 0·숫자 0·lines []. 환자 번호·환자별 금액은 없다
export type PatientValue = { n: number; average: number; times: number; perVisit: number; lines: PatientValueLine[] }

// 고른 기간의 세 칸 보기(AC-2702.1·AC-2702.3). none = 불러온 적 없음·고른 기간이 불러온 범위 밖, old-helper = 옛 도우미(v2) 답.
// mix는 [전체]·[신환] 둘 다, 동네는 [구·시]·[동] 둘 다 싣는다: 단추를 눌러도 Worker에 다시 묻지 않는다.
// sunap = 통계 '예약·전환'의 Block 전환 수(spec sunap-ilji AC-4906.3, 숫자 아홉 칸). 묻기에 묶음 정의(sunap)가 있었을 때만 있다.
// sunapDoctors = 같은 셈의 원장님별 표(spec sunap-doctors AC-5004.1, 원장님 이름과 수만). sunap과 함께만 있고, 원장님이 한 분 이하면 null.
// dropoff = 몇 번까지 받나(stats-insights AC-6103.1). 고른 기간과 상관없이 불러온 범위 전체를 센 묶음마다 한 줄(대상 0인 묶음은 없다).
// 불러올 때 묶음을 실었을 때만 있다(없으면 열쇠가 없다).
// value = 신환 1명당 매출(stats-insights AC-6106.3). 고른 기간과 상관없이 불러온 범위 전체로 센다. 답에 환자·날 금액 줄(도우미 0.11.0의 v5 pays)이
// 있었을 때만 있다(없으면 열쇠가 없다 — 화면은 '도우미를 0.11.0으로 올리면 볼 수 있어요')
export type BitSectionsView =
  | { kind: 'none' }
  | { kind: 'old-helper' }
  | {
      kind: 'ready'
      mix: { all: PatientMix; new: PatientMix }
      hours: VisitHours
      doctors: DoctorsView
      sunap?: SunapRates
      sunapDoctors?: DoctorBreakdown | null
      dropoff?: DropoffLine[]
      value?: PatientValue
    }

// 수납일지 설정에서 고른 Block·물리치료 묶음의 정의(열쇠·코드·빼는 처방·조건만, 이름은 안 감). 둘 다 골랐을 때만 화면이 싣는다(AC-4906.3)
export type StatsSunapGroups = { block: RxGroupDef; pt: RxGroupDef }

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
  // false면 이 답의 진료 줄·접수 줄을 메모리에 남기지 않는다(나눠 읽기의 다른 조각, stats-load-range AC-3304.1). 없거나 true면 지금처럼 바꾼다
  keep?: boolean
}
// split의 streamId는 통로 요청이 아니라 requestSplit이 정한 일 번호다. 답을 가려 받는 쓰임은 같다
export type StatsSplitRequest = { type: 'split'; streamId: string; from: string; to: string }
// 세 칸 보기 묻기. streamId는 requestSections가 정한 일 번호다. previous = 견줄 기간(지금 통계 탭의 range.previous, from·to만). 없으면 null(AC-2703.9).
// sunap = Block·물리치료 묶음 정의(있으면 답에 sunapRates를 함께 싣는다, sunap-ilji AC-4906.3). 없으면 열쇠가 없다(지금 모양 그대로)
export type StatsSectionsRequest = { type: 'sections'; streamId: string; from: string; to: string; previous: DateRange | null; sunap?: StatsSunapGroups }
export type StatsWorkerRequest = { type: 'bridge-port' } | StatsLoadRequest | StatsSplitRequest | StatsSectionsRequest

// Worker → 화면. streamId는 화면이 준 요청 id를 돌려주는 것이다: 시간이 지나 포기한 앞 일의 늦은 답을 다음 일의 답으로 받지 않으려고.
// code는 오류 번호뿐이다(예외 내용을 싣지 않는다)
export type StatsWorkerMessage =
  | { type: 'loaded'; streamId: string; view: StatsLoaded }
  | { type: 'split-result'; streamId: string; view: RxSplitView }
  | { type: 'sections-result'; streamId: string; view: BitSectionsView }
  | { type: 'failed'; streamId: string; code: string }
