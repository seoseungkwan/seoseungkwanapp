// 환자 탭(F/U 명단 · 정기 주사 문자 명단) 계산 모양. 계산은 lib/patients(환자 자료 구역)가 한다.
// 날짜는 모두 'YYYY-MM-DD' 글자다(원본 양지바른의 Date 값을 글자로 바꿈).

// ── F/U 계산(lib/patients/followup.ts, 원본 revisit_schedule.html 옮김) ─────────────

export type FuKind = '예정' | '조건부' | ''

// 원본 parseFU의 답. sortDate는 날짜가 잡혔을 때만(N월 초·미정은 null)
export type FuNext = { dateStr: string; sortDate: string | null; kind: FuKind; evidence: string }

// 원본 visitKind: 다음에 왜 오는지
export type VisitKind = '주사' | 'F/U'

// 원본 prepareSchedule의 내원 하나(같은 내원번호·차트번호 줄을 묶은 것)
export type ChartVisit = {
  visitNo: string
  chart: string
  name: string
  date: string
  recordedAt: string // 'YYYY-MM-DDTHH:mm:ss' 또는 ''(시각 없음)
  lines: string[]
  next: FuNext
  tx: string
  site: string
}

export type PreparedSchedule = { visits: ChartVisit[]; latest: Record<string /* 차트번호 */, ChartVisit> }

export type PhoneToken = { number: string; raw: string }
export type PhoneTokens = { values: PhoneToken[]; invalid: boolean }

// 원본 preparePhones의 답 중 명단에 쓰는 칸. map: 차트번호(앞자리 0 뗀 것도) → 번호(번호가 하나인 차트만)
export type PreparedPhones = { map: Record<string, string>; loaded: boolean; count: number; missing: boolean }
export type PhoneBook = Pick<PreparedPhones, 'map' | 'loaded'>

// 원본이 화면 칸(document.getElementById)에서 읽던 값
export type ScheduleOptions = { includeCond: boolean; includePast: boolean; base: string }
export type VisitFilter = { kind: '' | VisitKind; from?: string; to?: string }
export type PasteOptions = { from?: string; to?: string; withDate: boolean }

// 원본이 멈추는 곳(throw new Error). 오류 번호는 모두 E-PATIENTS-SOURCE이고 이유는 이 목록뿐(환자 값을 싣지 않는다).
// 화면은 오류 번호 줄에 이 낱말을 그대로 붙여 진단에 쓴다(patients-source-reason). 목록 밖 글은 그리지 않는다
export const PATIENTS_SOURCE_REASONS = [
  'header-missing',
  'header-duplicate',
  'row-unreadable',
  'visit-number-empty',
  'visit-conflict',
  'no-visits',
  'phone-column-missing',
  'phone-column-duplicate',
  'phone-conflict',
] as const
export type PatientsSourceReason = (typeof PATIENTS_SOURCE_REASONS)[number]

export const isPatientsSourceReason = (x: unknown): x is PatientsSourceReason =>
  typeof x === 'string' && (PATIENTS_SOURCE_REASONS as readonly string[]).includes(x)

// ── 정기 주사 계산(lib/patients/recall.ts, 원본 revisit_source_boot.js 옮김) ─────────────

// 쌓인 기록 하나: 원본 ingest 모양 그대로
export type RecallRecord = { chart: string; name: string; date: string; codes: string[]; text: string; phone: string }
// readThrough(마지막으로 읽은 날)만 원본에 없다
export type RecallHistory = { from: string | null; readThrough: string | null; records: RecallRecord[] }

// ── 보기 모양(Worker → 화면, design.md '계산 모양') ───────────────────────────────

export type FollowupRow = {
  key: string
  chart: string
  name: string
  phone: string
  lastVisit: string
  next: string // YYYY-MM-DD
  nextLabel: string // 원본 dateStr
  plan: '예정' | '조건부'
  visitKind: VisitKind
  site: string
  tx: string
  evidence: string
  contacted: boolean
}
export type UndecidedRow = {
  key: string
  chart: string
  name: string
  phone: string
  lastVisit: string
  nextLabel: string
  evidence: string
}
export type FollowupView = {
  read: { from: string; to: string }
  base: string // 원본 baseDate
  rows: FollowupRow[]
  undecided: UndecidedRow[]
  phoneLoaded: boolean
  marksLoaded: boolean // store.load가 됐는가(AC-604.8)
}
export type RecallRow = {
  key: string
  ruleId: string
  label: string
  months: number
  chart: string
  name: string
  phone: string
  last: string
  due: string
  status: string
  evidence: string
  contacted: boolean
}
export type RecallCoverage = {
  records: number
  from: string | null
  short: { label: string; months: number }[]
  trimmed: number // handler가 채움: 30MB에 맞추려 이번에 뺀 오래된 기록 수(AC-604.6)
}
export type RecallView = { rows: RecallRow[]; coverage: RecallCoverage }
export type ContactCount = { followup_left: number; injection_left: number }

// ── 비트 명단: 예약 문자 명단 · 장기 미방문 명단(lib/patients/reservations.ts·lapsed.ts, spec patients-bit-lists) ─────
// 도우미 contact.targets {kind:'reservation'|'lapsed'} 답을 읽은 모양(…Entry·…Data)은 Worker 메모리에만 있다(차트번호 포함).
// 화면 줄(…Row)에는 차트번호 칸이 없다. 차트번호는 줄 열쇠(key) 안에만 있고, 줄 열쇠가 곧 도우미 저장(contact.marks)의 표시 열쇠다(AC-2802.7·2803.8·2804.5)

// 예약 하나(AC-2801.2). key는 s|차트번호|예약 시각(차트번호가 없으면 빈 글). 같은 열쇠가 또 오면 뒤에 |2·|3을 붙인다
export type ReservationEntry = {
  key: string
  chart: string | null
  name: string // 없으면 ''
  phone: string // 없으면 ''
  at: string // 예약 시각 yyyyMMddHHmm(도우미 글 그대로)
  day: string // 예약 날 YYYY-MM-DD
  status: string // 비트 접수 상태(OcmComStt): WR·NR(예약 대기)·CR(예약 취소)·WN 등
  rsv: string | null // 비트 예약 표시(RsvSts): OC·OS 등
  came: boolean // 그날 같은 차트로 센 접수가 있음
  cameAfter: string | null // 예약 날 다음 날부터 오늘까지 처음 온 날 YYYY-MM-DD
}
export type ReservationData = { from: string; to: string; today: string; rows: ReservationEntry[] }

// 고른 날 예약 줄(AC-2803.1). time은 '오전 9:00' 글, sent는 보냄 표시가 있음
export type ReservationRow = { key: string; time: string; name: string; phone: string; sent: boolean }
// 처음 고를 날(AC-2803.0). note는 내일이 아닌 날을 골랐을 때의 안내 글
export type ReservationPick = { preset: 'tomorrow' | 'after' | 'custom'; day: string; note: string | null }
export type MissedMark = '예약 취소' | '예약 그대로'
// 지난 예약 중 안 오신 분 줄(AC-2803.5). day는 예약 날, after는 그 뒤 처음 온 날(YYYY-MM-DD)
export type MissedRow = { key: string; day: string; time: string; name: string; phone: string; mark: MissedMark; after: string | null }
// 예약 N건(total) 중 안 오신 분 M건(missed) · P%(percent) · 아직 안 오신 분 K명(notYet). 아직 안 오신 분만 거르기와 상관없다(AC-2803.6)
export type MissedSummary = { total: number; missed: number; percent: number; notYet: number }

// 장기 미방문 환자 하나(AC-2801.3). key는 l|차트번호|마지막 내원일(YYYYMMDD, 도우미 글 그대로). 다시 왔다가 또 끊기면 새 열쇠다
export type LapsedRx = { code: string; name: string | null }
export type LapsedEntry = {
  key: string
  chart: string
  name: string // 없으면 ''
  phone: string // 없으면 ''
  last: string // 마지막 내원일 YYYY-MM-DD
  visits: number // 진료 받은 날 수
  reserved: boolean // 오늘 이후 예약 대기가 있음
  rx: LapsedRx[] // 마지막 진료 처방(처음 나온 차례, 20개까지)
}
export type LapsedData = { from: string; to: string; today: string; rows: LapsedEntry[] }

// 마지막 내원 묶음: 1~3달 · 3~6달 · 6~12달 · 1~2년(AC-2804.1)
export type LapsedBucket = '1-3' | '3-6' | '6-12' | '12-24'
// 통계 탭 '처방 추세' 묶음(stats_rx_groups)의 이름·코드. 화면이 읽어 그대로 넘긴다(AC-2804.6)
export type LapsedGroup = { name: string; codes: readonly string[] }
// 마지막 진료 고르기(AC-2804.7): 전체 · 묶음 이름 하나 · 묶음 없음
export type LapsedRxPick = { kind: 'all' } | { kind: 'group'; name: string } | { kind: 'none' }
export type LapsedFilters = { bucket: LapsedBucket; rx: LapsedRxPick }
// 표 줄(AC-2804.3). groups는 겹치는 묶음 이름(묶음 차례), 없으면 rxNames에 처방 이름 두 개까지(AC-2804.6)
export type LapsedRow = {
  key: string
  name: string
  phone: string
  last: string // YYYY-MM-DD
  daysAgo: number
  visits: number
  reserved: boolean
  contacted: boolean
  groups: string[]
  rxNames: string[]
}
// counts는 고른 마지막 진료 기준 묶음마다 사람 수, range는 고른 묶음의 기간, groupNames는 고른 기간 줄에 나온 묶음 이름(묶음 차례)
export type LapsedView = { rows: LapsedRow[]; counts: Record<LapsedBucket, number>; range: { from: string; to: string }; groupNames: string[] }

// ── 연락 저장(contact.dat 안쪽, Worker가 만들고 읽는다. design.md 'contact 안쪽 모양') ─────

export type ContactStoreData = {
  v: 1
  marks: Record<string /* 줄 열쇠 */, string /* 연락한 날 YYYY-MM-DD */>
  recall: RecallHistory
}

// ── 화면 고르기(다시 읽지 않고 Worker가 거른다, AC-611.1·612.1) ─────────────────────

export type FollowupFilters = { kind: '' | VisitKind; from?: string; to?: string; includeCond: boolean; includePast: boolean }
export type RecallFilters = { from: string | null; to: string | null; overdue: boolean }

// ── Worker 메시지(design.md 'Worker 메시지 약속'). 화면으로 가는 메시지에는 조각·보낼 글자가 없다 ─────

export type PatientsRange = { from: string; to: string }
export type TargetsKind = 'followup' | 'injection'
export type ViewCodes = { followup?: string; recall?: string; store?: string }
// E-PATIENTS-SOURCE로 멈춘 종류의 이유 낱말. 그런 종류가 없으면 views에 이 칸이 없다
export type ViewReasons = { followup?: PatientsSourceReason; recall?: PatientsSourceReason }

// 스트림이 거절되면 화면은 id를 모른다. 그때는 id 없이 받은 오류 번호(code)를 알린다
export type PatientsScreenMessage =
  | { type: 'plan'; today: string }
  | { type: 'piece'; id?: string; kind: TargetsKind; from: string; to: string; code?: string }
  | { type: 'stored'; id?: string; code?: string }
  | { type: 'reload' }
  | { type: 'build'; today: string }
  | { type: 'filter'; tool: 'followup'; filters: FollowupFilters }
  | { type: 'filter'; tool: 'recall'; filters: RecallFilters }
  | { type: 'mark'; key: string; on: boolean; today: string }

export type FilteredFollowup = {
  type: 'filtered'
  tool: 'followup'
  rows: FollowupRow[]
  undecided: UndecidedRow[]
  copy: { list: string; listWithDate: string; phones?: undefined; missingPhones?: undefined }
}
export type FilteredRecall = {
  type: 'filtered'
  tool: 'recall'
  rows: RecallRow[]
  copy: { list: string; phones: string; missingPhones: number; listWithDate?: undefined }
}

export type PatientsWorkerMessage =
  | { type: 'plan'; followup: PatientsRange[]; recall: PatientsRange[] | null; code?: string }
  | { type: 'piece'; id: string | null; ok: boolean; code?: string }
  | { type: 'stored'; ok: boolean; code?: string; recall: PatientsRange[] }
  | { type: 'views'; followup: FollowupView | null; recall: RecallView | null; counts: ContactCount | null; codes: ViewCodes; reasons?: ViewReasons }
  | FilteredFollowup
  | FilteredRecall
  | { type: 'marked'; key: string; ok: boolean; code?: string; counts: ContactCount | null }
