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

// 원본이 멈추는 곳(throw new Error). 오류 번호는 모두 E-PATIENTS-SOURCE이고 이유는 이 목록뿐(환자 값을 싣지 않는다)
export type PatientsSourceReason =
  | 'header-missing'
  | 'header-duplicate'
  | 'row-unreadable'
  | 'visit-number-empty'
  | 'visit-conflict'
  | 'no-visits'
  | 'phone-column-missing'
  | 'phone-column-duplicate'
  | 'phone-conflict'

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
  | { type: 'views'; followup: FollowupView | null; recall: RecallView | null; counts: ContactCount | null; codes: ViewCodes }
  | FilteredFollowup
  | FilteredRecall
  | { type: 'marked'; key: string; ok: boolean; code?: string; counts: ContactCount | null }
