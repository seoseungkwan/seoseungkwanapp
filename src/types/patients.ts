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
