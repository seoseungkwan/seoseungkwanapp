// 청구 사전점검 모양(spec precheck). 원본은 양지바른 사전점검(seoseungkwan/shared@2a1069b)
// 점검 표 네 개(src/lib/precheck/data, REQ-007): 원본에서 옮긴 그대로의 모양. 칸 이름도 원본 그대로(snake_case)
// 계산 모양(ClaimMonth·Visit·Finding 등, design.md 6-3)과 도우미 claim.month JSON 모양은 TASK-9가 아래에 더했다
import type { ClaimDayCountRow } from '@/types/db'
import type { ErrorCode } from '@/types/errors'
import type { DateRange } from '@/types/dates'

/** 결과 등급(원본 grade) */
export type Grade = '확인필요' | '알림' | '참고'

/** 조건 종류 18가지(원본 claim_precheck.py evaluate) */
export type RuleType =
  | 'count_window' | 'claim_code' | 'same_day_pair' | 'documentation' | 'required_dx' | 'info_only'
  | 'same_day_limit' | 'interval' | 'dur' | 'multiplier_cap' | 'drug_requirement' | 'dx_site_match'
  | 'dx_master' | 'visit_fee' | 'imaging_count' | 'episode_period' | 'forbidden_dx_combo' | 'prerequisite'

export type Confidence = '상' | '중' | '하'
export type Automatable = 'yes' | 'partial' | 'no'
/** 점검 단계: 메모 화면 · SAM · 12개월 이력 */
export type RuleStage = 'memo' | 'sam' | 'history'

/** 근거 하나(고시·심사기준 등). effective = 시행일 YYYY-MM-DD */
export type Basis = { doc: string; number: string; effective?: string; url?: string }

/** 규칙 하나 — 원본 16칸 */
export type RuleDef = {
  id: string // ^[A-Z]{2}-[0-9]{2,3}[a-z]?$ (design.md 8-1 DB 제약과 같다)
  domain: string
  title: string
  type: RuleType
  params: Record<string, unknown> // 조건 종류마다 모양이 다르다(규칙 엔진이 읽는다, TASK-10)
  grade: Grade
  message: string
  basis: Basis[]
  confidence: Confidence
  data_needed: string[]
  automatable: Automatable
  stage: RuleStage[]
  enabled_default: boolean
  effective_from: string | null // YYYY-MM-DD
  effective_to: string | null
  notes: string
}

/** 규칙표(원본 tools/precheck_rules.json 그대로) */
export type RulesFile = {
  version: string
  meta: Record<string, unknown>
  code_groups: Record<string, unknown>
  drug_classes: Record<string, unknown>
  regions: Record<string, unknown>
  rules: RuleDef[]
}

/** 상병마스터에서 점검에 쓰는 것만(원본 precheck_dx_flags): 불완전코드(I) · 주상병 불가(N, V~Y 대분류 뺌). 코드는 점 없이 대문자 */
export type DxFlags = { version: string; date: string; source: string; I: string[]; N: string[] }

/** [분류번호, 주성분코드, 주성분명(200자까지)] (원본 drug_info.lookup) */
export type DrugInfoEntry = [string, string, string]

/** 약제급여목록(공개용): 9자리 보험코드(edi) → 성분 */
export type DrugInfo = {
  version: string
  base_date: string
  source: string
  fields: string[]
  map: Record<string, DrugInfoEntry>
}

/** 처방코드 사전 한 줄(원본 CODEMAP): 이름 · 종류(proc·note·lab·drug·skip) · 부위(없으면 null) · 고정 메모 문구 */
export type CodeEntry = { n: string; k: string; rg: string | null; memo?: string }

/** 처방코드 → 사전 한 줄. 기본 사전(codeMap.json)은 원본 화면의 CODEMAP_DEF */
export type CodeMap = Record<string, CodeEntry>

/** Worker가 불러 검사한 점검 표 네 개(workers/precheck/tables.ts의 loadTables) */
export type Tables = { rules: RulesFile; dxFlags: DxFlags; drugInfo: DrugInfo; codeMap: CodeMap }

// ── 도우미 claim.month JSON(풀린 글자의 모양, helper Claim/ClaimMonthPayload) ────────────────
// 표 줄은 원본 웹이 그 표에서 찾던 칸 이름(한글)을 열쇠로 쓴다(helper GridRows). 표에 없던 칸은 열쇠가 없다

/** 비트 통계 화면 표 줄 하나. 83: 내원번호·차트번호·환자명·증상·기록날짜 / 83D: 내원번호·차트번호·상병청구코드·상병명칭·주상병여부·
 *  산정특례기호·과목코드·진단일자 / 47: 처방코드·처방명칭·차트번호·처방일자·급여구분·수량. 합계·빈 줄도 표 순서대로 그대로 온다 */
export type GridRow = Record<string, string>
/** 12개월 이력 줄(원본 RxHistoryRow): v 내원번호 · p 차트번호 · d 내원일 YYYY-MM-DD · c 처방코드 · m 비트 청구메모 */
export type HistoryRow = { v: string; p: string; d: string; c: string[]; m: string }
/** 처방과 함께 나온 상병(원본 RxTrendDiagnosis): 주·부·배제로 함께 나온 내원 수, l 배수(×100) */
export type TrendDiagnosisRaw = { c: string; nm: string; m: number; s: number; x: number; l: number }
export type TrendCodeRaw = { c: string; n: number; d: TrendDiagnosisRaw[] }
/** 규칙 제안의 상병 묶음(원본 RxTrendGroup): 앞 3자리 · 이름 · 덮는 천분율 · 배제로만 든 천분율 */
export type TrendGroupRaw = { c: string; nm: string; k: number; x: number }
export type TrendSuggestionRaw = { c: string; n: number; k: number; miss: number; g: TrendGroupRaw[] }
/** 원본 PrescriptionCatalog.Classify 종류 */
export type CatalogKind = 'drug' | 'procedure' | 'lab' | 'other' | 'unknown'
/** 병원 등록 처방코드(원본 PrescriptionCatalogCode) */
export type CatalogCode = { code: string; name: string; kind: CatalogKind; active: boolean; standardCode: string }
/** 비트 LA 신경차단술 코드(원본 LaCatalogCode) */
export type LaCode = { code: string; name: string; active: boolean }
/** 병원 처방 목록(처방 마스터 · LA 목록) */
export type HospitalCatalog = { codes: CatalogCode[]; la: LaCode[] }

export type ClaimMonthJson = {
  version: 1
  period: DateRange
  /** 기간 시작 365일 전 ~ 기간 끝 */
  historyRange: DateRange
  /** 상병 추세 기간: 오늘 364일 전 ~ 오늘 */
  trendRange: DateRange
  /** 선언한 줄 수(배열 길이). Worker가 받은 줄 수와 비교한다(AC-009.4) */
  counts: { s83: number; s83d: number; s47: number; history: number }
  s83: GridRow[]
  s83d: GridRow[]
  s47: GridRow[]
  history: HistoryRow[]
  historyStats: { invalidRows: number; invalidCodes: number; truncated: number }
  dxTrend: { visits: number; invalidRows: number; truncated: number; codes: TrendCodeRaw[]; suggestions: TrendSuggestionRaw[] }
  catalog: HospitalCatalog
}

// ── 점검용 모양(design.md 6-3). 원본 전역 값 VISITS·RXDATA·NEW_MEDICORE_DIAGNOSES·HIST.byChart를 하나로 묶는다 ──────

/** 증상 줄의 머리말 종류(원본 splitCell HDR_KIND). 머리말이 하나도 없던 칸은 모두 null */
export type LineHint = 'subj' | 'exam' | 'dx' | 'plan'
/** 처방 한 줄(원본 RXDATA 항목 {code, name, pay, benefit, qty}). benefit = 급여구분에 '비급여'가 없음, qty는 못 읽으면 null */
export type RxLine = { code: string; name: string; qty: number | null; benefit: boolean; pay: string }
/** 상병 한 줄(원본 diagnoses store 항목). m: 주 true · 부 false · 배제 'x' · 주상병여부 칸 없음 null. s 산정특례 · d 과목 · t 진단일(YYYY-MM-DD 또는 빈칸) */
export type DxLine = { c: string; n: string; m: true | false | 'x' | null; s: string; d: string; t: string }

export type Visit = {
  key: string // 원본 v.id(내원번호)
  chart: string
  date: string // YYYY-MM-DD
  month: string // 진료 달 YYYY-MM(AC-009.5)
  name: string
  lines: string[] // 증상 글(원본 splitCell로 나눈 줄)
  hints: (LineHint | null)[] // lines와 같은 길이
  rx: RxLine[] // 같은 차트번호·날짜의 처방(원본 rxOf)
  dx: DxLine[] // 같은 내원번호·차트번호의 상병(원본 diagnoses get)
  memosInBit: string[] // 비트에 이미 있는 그 내원의 청구메모(12개월 이력의 m)
}

/** 차트번호 → 날짜(YYYY-MM-DD) → 그날 처방코드·비트 메모(원본 HIST.byChart) */
export type History = Map<string, Map<string, { codes: string[]; memo: string }>>
/** 차트번호 → 날짜 → 처방 줄(원본 RXDATA "C차트|날짜"). 증상이 없어 진료가 안 된 날의 처방도 남는다 */
export type RxByDay = Map<string, Map<string, RxLine[]>>

/** 처방과 함께 나온 상병(원본 readTrend의 d 항목). l이 없으면 null */
export type TrendDiagnosis = { c: string; nm: string; m: number; s: number; x: number; l: number | null }
export type TrendSuggestion = { rx: string; n: number; k: number; miss: number; groups: TrendGroupRaw[] }
/** 상병 추세(원본 dx-recommend readTrend 결과): codes는 처방코드(대문자) → {내원 수, 상병들} */
export type DxTrend = {
  from: string
  to: string
  visits: number
  codes: Map<string, { n: number; d: TrendDiagnosis[] }>
  suggestions: TrendSuggestion[]
}

// ── 추천 상병·상병 확인(TASK-11, lib/precheck/dx). 원본 new-medicore-dx-recommend ──────────

/** 상병 연결표 한 줄(원본 snapshot.rules, 병원 설정 dx_links): 처방코드 · 상병코드 · 상병명 · 배제상병으로(1) · s 직접 추가 · t 연결표 · r 기록 규칙 */
export type DxLink = [rx: string, dx: string, nm: string, ex: 0 | 1, src: 's' | 't' | 'r']
/** 추천의 출처(원본 src): 고시 · 연결표 · 직접 추가 · 기록 규칙. 경향은 출처가 아니라 t로 보인다 */
export type DxSource = 'gosi' | 'table' | 'staff' | 'record'
/** 우리 병원 경향(원본 t): 함께 나온 내원 수 · 주·부·배제 · 이 처방 내원 중 비율 · 어느 처방에나 붙는 흔한 상병인가 */
export type DxTrendUse = { n: number; m: number; s: number; x: number; share: number; common: boolean }
/** 추천 한 줄(원본 recommend의 list 항목). src는 넣은 차례(원본은 Set), pos는 넣은 차례 번호, basis는 고시 근거 */
export type DxRow = { dx: string; nm: string; src: DxSource[]; ex: boolean; basis: string; t: DxTrendUse | null; pos: number }
/** 원본 recommend 결과: 이 처방의 경향 내원 수와 추천 목록 */
export type DxRecommendation = { visits: number; list: DxRow[] }
/** 상병 확인 경고 하나(원본 issues 항목): 규칙이 있는 급여 처방인데 맞는 상병이 없다. record면 기록 규칙뿐(평소와 다름) */
export type DxIssue = { code: string; name: string; gosi: boolean; record: boolean; rec: DxRow[] }
/** 진료 하나의 추천 상병·상병 확인 보기 모양. 보여 주기만 한다(진료 자료를 바꾸지 않는다) */
export type VisitDxView = {
  visitKey: string
  missingDx: boolean
  needsCheck: boolean
  issues: DxIssue[]
  recommendations: (DxRecommendation & { code: string; name: string })[]
}

export type ClaimMonth = {
  period: DateRange
  visits: Visit[] // 날짜 → 차트번호(숫자) 차례(원본 byVisitDate)
  history: History
  historyRange: DateRange
  rxByDay: RxByDay
  /** rxByDay의 그날 목록을 47 표에서 (차트번호, 날짜)가 처음 나온 차례로(원본 Object.values(RXDATA)). 복사가 아니라 같은 배열이다. 차트를 오가는 표의 차례는 rxByDay에 남지 않는다 */
  rxDayOrder: RxLine[][]
  dxTrend: DxTrend
  catalog: HospitalCatalog
  /** 상병(83D) 줄이 있었나. 원본은 상병 자료가 없으면 상병 확인을 건너뛴다(diagnoses has() 거짓) */
  hasDx: boolean
}

/** 점검 결과 한 줄(design.md 6-3, 규칙 엔진 TASK-10이 채운다) */
export type Finding = { visitKey: string; ruleId: string; grade: Grade; message: string; detail: string; basis: Basis[] }

/** 규칙 설정(원본 저장 모양 {schema: 1, off, on, grade}). 등급은 {규칙: 등급}으로도, 원본처럼 [[규칙, 등급]]으로도 받는다 */
export type RuleSettings = { schema?: 1; off: string[]; on: string[]; grade: Record<string, Grade> | [string, Grade][] }

/** 진료 하나의 메모(TASK-14). text는 비트에 들어가는 글: 사람이 고쳤거나 완료했으면 그 글, 아니면 새 초안(fullText). missing은 고친 글에 빠진 사유 문장, hasMemo는 부위 메모가 있나(원본 v.memos), unfinished는 확인 표시가 남았나 */
export type VisitMemoView = { visitKey: string; text: string; edited: boolean; missing: string[]; hasMemo: boolean; unfinished: boolean }
/** 메모 재료. phrases는 claim_hospital_settings.phrases(줄이 없으면 null). saved는 사람이 고쳤거나 완료한 메모: 내원번호 → 글. store.load에서 받은 값은 jobs.check·jobs.memoInput·jobs.memoState가 채운다(TASK-16) */
export type MemoInput = { phrases: unknown; saved?: ReadonlyMap<string, string> }
/** 메모 결과. memoBlocked면 메모를 만들지 않았다(AC-014.8) */
export type MemoViews = { memoBlocked: 'E-MEMO-NO-SETTINGS' | null; memos: VisitMemoView[] }

// ── 비트 메모 비교(TASK-16, REQ-016) ──────────

/** claim.memos 줄(helper Claim/MemoRowsRead): v 내원번호 · p 차트번호 · d 접수일 YYYY-MM-DD · m 비트 청구메모(CRLF→LF 말고 글자 그대로, 4,000자까지) */
export type MemoRowRaw = { v: string; p: string; d: string; m: string }
/** 도우미 claim.memos JSON. period는 읽은 기간이고, 공백뿐인 메모의 줄은 오지 않는다 */
export type ClaimMemosJson = { version: 1; period: DateRange; truncated: boolean; invalidRows: number; rows: MemoRowRaw[] }
/**
 * store.load의 달 하나(helper Store/WorkStore.Load). 도우미는 안쪽을 보지 않고 웹이 정한다.
 * drafts: 내원번호 → 사람이 고친 글. done: 내원번호 → 완료 때의 글(글이 아니면 표시일 뿐 메모로 쓰지 않는다). 같은 진료에 둘 다 있으면 drafts가 앞선다.
 * journal: 내원번호 → 입력 기록의 마지막 상태(writing·done·skipped·skippedByHand·check·writeUnconfirmed, 도우미만 쓴다)
 */
export type StoreMonthJson = { drafts: Record<string, string>; done: Record<string, string | boolean>; journal: Record<string, string> }
/** 도우미 store.load JSON. 묻지 않은 칸은 없다. settings·contact는 이 TASK에서 쓰지 않는다 */
export type StoreLoadJson = { months?: Record<string, StoreMonthJson>; contact?: unknown; settings?: unknown }

/** 비교 결과(AC-016.2). 조회 못함은 빈칸이 아니다 */
export type MemoCompare = '같음' | '다름' | '비트에 없음' | '조회 못함'
/** 받아 둔 claim.memos: 읽은 기간과 내원번호 → 줄(chart는 앞 0을 뺀 차트번호) */
export type BitMemos = { period: DateRange; rows: Map<string, { chart: string; memo: string }> }
/** 진료 하나의 비교 상태. inBit은 같음·다름일 때만, approved는 지금 비트 메모와 같은 승인일 때만, lastJournal은 입력 기록이 있을 때만 칸이 있다 */
export type VisitMemo = {
  key: string
  date: string
  text: string // 우리 메모(고친 것은 고친 글)
  hasMemo: boolean
  unfinished: boolean
  compare: MemoCompare
  inBit?: string
  approved?: string
  lastJournal?: string
}
/** 입력 묶음 줄. replaces는 승인한 비트 메모이고 승인하지 않았으면 칸이 없다(AC-037.1) */
export type InputPlanRow = VisitMemo & { replaces?: string }
/** 입력 묶음과 빠지는 사람(AC-016.3). 메모 없음·확인 표시·조회 못함은 AC-018.26의 묶음 까닭이다 */
export type InputPlan = {
  batch: InputPlanRow[]
  done: { key: string; reason: '이미 입력됨' }[]
  skipped: { key: string; reason: '이미 있음' | '메모 없음' | '확인 표시' | '조회 못함' }[]
}
/** 날짜별 수(AC-016.4, REQ-019 건수의 재료): 메모 필요 · 입력(같음) · 이미 있음(다름). 입력 수는 메모 필요 수를 넘지 않는다 */
export type DayMemoCount = { date: string; needMemo: number; entered: number; already: number }
/** jobs.memoState 옵션. visible은 고른 기간(AC-013.13), noAsk는 묻지 않기(기본 거짓, AC-018.22), approved는 사람마다 승인(AC-018.14) */
export type MemoStateOptions = { visible: DateRange; noAsk?: boolean; approved?: ReadonlyMap<string, string> }
/** 고른 기간의 비교·입력 묶음·날짜별 수. 환자 글자가 들어 있어 Worker와 환자 줄 화면(components/claim/rows) 밖으로 나가지 않는다 */
export type MemoState = { memoBlocked: MemoViews['memoBlocked']; rows: VisitMemo[]; plan: InputPlan; days: DayMemoCount[] }

/** 점검 결과 보기 모양(jobs.check, TASK-10). 환자 글자가 들어 있어 Worker와 환자 줄 화면(components/claim/rows) 밖으로 나가지 않는다 */
export type CheckedVisit = Pick<Visit, 'key' | 'chart' | 'date' | 'name'> & { findings: Finding[]; skippedNoHistory: number; skippedNoDx: number; checked: number; memo: VisitMemoView | null }
export type CheckGroup = { ruleId: string; title: string; domain: string; grade: Grade; visitKeys: string[]; basis: Basis[] }
export type CheckView = {
  visits: CheckedVisit[]
  groups: CheckGroup[]
  totals: { checked: number; hi: number; mid: number; lo: number; patients: number; historySkips: number }
  memoBlocked: MemoViews['memoBlocked']
}

/** 화면으로 가는 진료 한 줄(AC-013.3·AC-013.14): 규칙 결과 + 처방 이름·지금 상병 + 추천 상병·상병 확인(dxViews) */
export type ClaimVisitView = CheckedVisit & { rx: string[]; dxNow: DxLine[]; dx: VisitDxView }
/**
 * 점검 답(Worker → 화면, AC-013.13·AC-013.14). 고른 기간(period)의 진료·규칙 묶음·합계만 싣는다.
 * 앞쪽 날은 내원 간격 계산에만 쓰고 싣지 않는다. hasDx 거짓이면 상병을 확인하지 못한 달이다. enabledRules는 켜진 규칙 수.
 * 환자 글자가 들어 있어 화면 메모리와 환자 줄 화면(components/claim/rows)에만 있다. 저장소·주소·로그·오류 카드에 두지 않는다
 */
export type ClaimView = Omit<CheckView, 'visits'> & { visits: ClaimVisitView[]; period: DateRange; hasDx: boolean; enabledRules: number }

// ── 메모 칸(TASK-18, REQ-018). 대상 고르기는 lib/precheck/inputTargets.ts ──────────

/** 입력 방식(AC-018.8). 고르는 칸을 그대로 들고 있어 방식을 바꿔도 적은 값이 남는다. 어디에도 저장하지 않는다 */
export type InputSelection = { mode: 'code' | 'date'; from: string; to: string; typed: string; chip: string; kind: 'day' | 'range'; day: string; rangeFrom: string; rangeTo: string }
/** 빠지는 까닭(AC-018.26): 이미 입력됨 · 메모 없음 · 확인 표시 · 직접 입력 · 다른 메모 · 읽지 못함 · 지난번 건너뜀 */
export type LeftReason = 'done' | 'nomemo' | 'mark' | 'manual' | 'diff' | 'unread' | 'held'
/** 대상 고르기에 넣는 진료 한 줄: 비교 상태 + 차트번호·이름·처방 코드·처방 이름·규칙 경고 있음 */
export type TargetVisit = VisitMemo & { chart: string; name: string; rx: readonly string[]; rxNames: readonly string[]; warned: boolean }
/** 목록 한 줄. sameDay는 같은 사람 같은 날 진료 수, foundByPc는 도우미가 찾아낸 직접 입력(AC-018.13). chip은 입력할 사람에게만 있다 */
export type TargetRow = TargetVisit & { replaces?: string; sameDay: number; foundByPc: boolean; chip: '새 메모' | '메모 바꿈 · 승인함' | '메모 바꿈 · 묻지 않기' | null }
export type CodeChip = { code: string; name: string; count: number }
/** 고른 조건의 결과(AC-018.26). problem은 고르는 즉시 보이는 안내(AC-018.9~AC-018.11·AC-018.20·AC-018.23), code는 묶음과 함께 보낼 코드(날짜별은 null), replacing은 입력할 사람 가운데 다른 메모가 바뀌는 수 */
export type InputTargets = { problem: string | null; range: DateRange | null; code: string | null; batch: TargetRow[]; left: { reason: LeftReason; rows: TargetRow[] }[]; chips: CodeChip[]; typedOverChip: boolean; replacing: number }
/** 메모 표 한 줄(AC-018.1). done은 완료, unsaved는 아직 PC에 저장되지 않은 고친 글, afterEntry는 비트 메모를 받은 뒤 입력을 마친 사람(AC-018.25) */
export type MemoTableRow = VisitMemo & { chart: string; name: string; rxNames: readonly string[]; edited: boolean; missing: string[]; done: boolean; unsaved: boolean; afterEntry: boolean }
/** 쓰다 멈춘 사람 한 줄(AC-018.16). known: 자료에 있음 · noData: 자료에 없음(이름도 차트번호도 모른다) · outside: 불러온 기간 밖. date를 모르면 month만 보인다. reason은 입력에서 빠질 까닭 */
export type StuckPerson = { key: string; state: 'known' | 'noData' | 'outside'; date: string | null; month: string; name: string | null; chart: string | null; rxNames: readonly string[]; reason: LeftReason | null; text: string; sameDay: number }
/** 띠 하나의 자료(AC-018.16). big은 큰 글을 보일지(모두 자료에 없거나 기간 밖이면 거짓), loadRange는 [자료 불러오기]의 기간, note는 단추 아래 글 */
export type StuckView = { people: StuckPerson[]; canContinue: boolean; canByHand: boolean; big: boolean; loadRange: DateRange | null; note: string | null }
/** 메모 칸 보기 모양(Worker → 화면). 환자 글자가 있어 환자 줄 화면과 이 탭 메모리에만 있다. 저장소·주소·로그·오류 카드에 두지 않는다 */
export type MemoScreenView = { period: DateRange; memoBlocked: MemoViews['memoBlocked']; noAsk: boolean; targets: InputTargets; table: MemoTableRow[]; stuck: StuckView | null; bit: { has: boolean; count: number; period: DateRange | null } }
/** 입력을 시작하는 단추: [비트에 입력]·[빼고 N명 입력] · '지난번 건너뜀'의 [다시 하기] · 결과의 [다시 하기] · [이어서 하기] · [이어서 입력] · [직접 확인했어요] */
export type InputWhat = 'selection' | 'held' | 'retry' | 'resume' | 'continueStuck' | 'byHand'
/** 결과 한 줄. 자료에 없는 진료는 name·chart가 null이다(자리 채움 값을 보이지 않는다, AC-018.15·AC-018.16). retry는 [다시 하기]에 드는 사람 */
export type InputResultLine = { key: string; date: string | null; month: string; name: string | null; chart: string | null; result: string; reason: string; previousMemo?: string; memo?: string; retry: boolean }
/** 입력 결과 보기 모양(AC-018.4·AC-018.21·AC-018.22). entered는 넣은 수, left는 남은 수, firstNoAsk는 이번 답에서 묻지 않기가 켜졌을 때 아직 바꾸지 않은 수(켜지지 않았으면 null) */
export type InputResultView = { status: 'finished' | 'cancelled' | 'stopped'; code: string | null; reason: string | null; fields: string[]; done: InputResultLine[]; check: InputResultLine[]; skipped: InputResultLine[]; uncounted: number; retry: number; entered: number; left: number; firstNoAsk: number | null }

// ── Worker ↔ 화면 메시지(design.md 6-2). check의 보기 모양(ClaimView)과 메모 칸 보기 모양·입력 결과·엑셀 바이트 밖에는 환자 글자가 없다(숫자·달·오류 번호·규칙 목록) ──────────

/** Worker가 만드는 날짜 한 줄(AC-019.3). 날짜와 정수뿐이다. types/bridge의 DayCount(도우미가 주는 날짜 목록)와 다르다 */
export type DayCount = Pick<ClaimDayCountRow, 'visit_date' | 'need_memo' | 'entered' | 'needs_check' | 'skipped'>
/** 서버에 올리는 날짜 한 줄: Worker 줄 + 화면이 붙인 진료 수(claim.dates, AC-019.3) */
export type UploadDayCount = DayCount & Pick<ClaimDayCountRow, 'visits'>
/** Worker → 화면. load는 마지막 불러오기 번호, range는 고른 기간이고 진료가 없으면 rows가 비어 있다. 바뀐 날만 고르는 것과 진료 수를 붙이는 것은 화면이 한다(useCountsUpload) */
export type DayCountsMessage = { type: 'dayCounts'; load: number; rows: DayCount[]; range: DateRange }

/** 설정 화면 '점검 규칙' 칸에 보일 규칙 하나(TASK-12가 쓴다) */
export type RuleSummary = Pick<RuleDef, 'id' | 'title' | 'domain' | 'grade' | 'basis' | 'enabled_default'>

/** 규칙 설정 저장 모양(원본 사전점검 snapshot): off·on = 규칙 ID, grade = [규칙 ID, 등급]. 어디에도 없는 규칙은 규칙표 기본값 */
export type SavedRuleSettings = { schema: 1; off: string[]; on: string[]; grade: [string, Grade][] }

/**
 * 점검에 쓰는 설정 묶음(환자 정보 아님). 도우미 설정 사본(store.save {settings}, AC-015.7·AC-013.9)도 이 모양이다.
 * phrases는 claim_hospital_settings.phrases(줄이 없으면 null), dxLinks는 상병 연결표
 */
export type CheckSettings = { rules: SavedRuleSettings; phrases: object | null; dxLinks: DxLink[] }

/**
 * 화면 → Worker. loadStart·month·loadPart: 한 달 불러오기 / memoReloadStart·loadPart의 run: 비트 메모 다시 불러오기 / ruleList: 설정 화면용 규칙 목록
 *
 * 화면이 지킬 약속:
 * 1. 불러올 때마다 새 번호 load를 정해(1씩 올린다. 같은 Worker에 같은 번호를 두 번 쓰지 않는다) stream('claim.month') 바로 앞에 loadStart를 보낸다.
 *    Worker는 이 번호를 마지막 불러오기로 삼고 전에 불러온 달을 버린다. 답은 없다.
 *    [멈추기], 결과 없이 화면을 떠날 때(불러오는 중 포함), 결과를 낼 때 사람이나 기관기호를 몰랐던 결과를 두고 떠날 때, 입력하는 중에 떠날 때에는 stream 없이 loadStart만 보낸다: 달과 진행 중인 불러오기를 버린다.
 *    결과를 낼 때 사람과 기관기호를 안 점검 결과가 있으면 떠날 때 보내지 않는다(design.md 6-2). Worker의 달·결과가 그대로라 돌아와 같은 사람·같은 의원이면 [다시 점검](12)·엑셀(13)이 달을 다시 읽지 않고 된다. 통로 포트가 새것으로 바뀌어도 달은 그대로다.
 *    입력하는 동안 떠나면 사람과 기관기호를 안 결과도 맡기지 않고 버리고 loadStart만 보낸다: 끝 답이 이 화면에 오지 않고 결과는 [자료 불러오기]로 읽는다(AC-018.5·AC-017.9, design.md 6-2).
 *    [자료 불러오기]·[멈추기]의 loadStart에는 keepEdits를 실어 아직 저장하지 못한 고친 메모를 남긴다(AC-018.2·AC-018.17). 떠날 때와 사람이나 기관기호가 다를 때는 싣지 않는다.
 * 2. stream이 거절되면 그 불러오기는 실패다. month를 보내지 않는다(문에서 거절되면 id도 abort도 없다. 달은 1에서 이미 비었다).
 *    마지막 불러오기가 아닌 옛 번호의 stream 거절은 화면에 보이지 않고 버린다.
 * 3. stream이 끝나면 받은 id를 그 불러오기의 번호와 함께 month로 보낸다. 그새 새 불러오기를 시작했어도 보낸다(Worker가 모아 둔 글자를 찾아 가 버리게).
 * 4. 어느 불러오기의 답인지는 화면이 자기 마지막 번호와 답의 load를 견줘 판단한다. id로 견주지 않는다: 새 요청의 id는 stream이 끝나기 전에는
 *    화면에 없어서(lib/bridge/client.ts request) 그동안 옛 id가 가장 새것처럼 보인다. 번호가 다른 답은 ok와 상관없이 버린다.
 * 5. Worker도 take가 끝난 뒤 같은 번호를 본다. 마지막 불러오기의 번호가 아닌 month는(제 loadStart보다 먼저 닿은 것도) 달을 넣지도 지우지도 않고 ok:false로 답한다.
 * 6. 점검해도 되는 때는 마지막 번호의 month가 ok:true로 답했을 때뿐이다. ok:false면 멈춘다. stream이 끝난 것만으로 판단하지 않는다:
 *    SHA-256이 달라도 stream은 끝나고, SHA-256 계산은 그 뒤에 끝난다.
 * 7. partial로 판단하지 않는다. 어느 명령이든 오고(Worker는 명령을 모른다) 불러 둔 달을 바꾸지 않는다. 6과 같은 까닭으로 아직 안 왔다고 성공도 아니다.
 * 8. claim.memos·store.load도 SHA-256이 달라도 stream이 끝나고 신호는 partial뿐이라 7처럼 그것으로 막을 수 없다.
 *    그래서 끝난 id마다 month처럼 그 불러오기의 번호로 loadPart를 보내 take한 답을 받고, 그 답이 ok:false면 멈춘다. ok:false면 Worker는 그 자료를 받지 않았다(AC-016.5).
 *    stream 거절은 E-HELPER-UNKNOWN-COMMAND면 그 자료 없이 계속하고, 달 칸 store.load의 E-BIT-HOSPITAL-MISMATCH면 storeBlock을 보내 저장한 작업 없이 계속하며(AC-018.17), 다른 오류 번호면 멈춘다(AC-013.2). 옛 불러오기의 거절은 2처럼 버린다.
 * 9. 비트 메모 다시 불러오기(AC-016.7, TASK-18)는 load를 그대로 두고 새 번호 run을 정해(load와 같은 곳에서 받는다) stream('claim.memos') 바로 앞에 memoReloadStart를 보낸다. 답은 없다.
 *    stream이 끝나면 그새 새 번호가 나왔어도 run을 실은 loadPart를 보낸다(모아 둔 글자를 찾아 가 버리게). 달과 점검 결과는 그대로다.
 *    답의 load·run이 마지막 번호와 다르면 ok와 상관없이 버린다. Worker도 take가 끝난 뒤 둘 다 마지막 번호일 때만 비트 메모를 통째로 바꾼다.
 * 10. stream 거절·ok:false면 그 다시 불러오기는 실패다. Worker는 전 자료와 비교를 그대로 둔다(AC-016.8). 거절은 Worker에 알릴 것이 없다.
 * 11. memoReloadStart를 보낸 뒤에 온 run 없는 part: 'memos'는 조각을 찾아 버리고 ok:false다(옛 [자료 불러오기] 답이 새 답을 덮지 않게). part: 'store'는 그대로 받는다. 새 loadStart가 이 표시와 run을 지운다.
 * 12. check(점검)는 그 불러오기의 load와 새 번호 check로 묻는다(1씩 올린다. 돌아와 옛 답을 버릴 때 번호 하나를 건너뛸 수 있다. load와 같은 곳 claimLoad.ts에서 받는다). 답의 check·load가 마지막 번호와 다르면 ok와 상관없이 버린다.
 *     visible은 고른 기간이다. settings는 서버에서 읽은 설정이고, 서버를 읽지 못했으면 null이다: Worker가 이 불러오기의 store.load {settings}로 받은 도우미 사본으로 점검하고 답의 usedCopy에 그 사본을 싣는다. 사본도 없으면 E-SETTINGS-FAILED(AC-013.9).
 *     store.load {months}와 {settings}는 따로 부른다(한 호출에 섞으면 파일 하나만 막혀도 호출 전체가 같은 번호로 거절된다). 설정 쪽 거절이 E-BIT-HOSPITAL-MISMATCH면 사본 없이 계속한다.
 * 13. excel은 답을 받은 점검의 check 번호로 묻는다. Worker는 그 점검 결과로만 만들고, 번호가 다르거나 새 loadStart로 결과를 버렸으면 E-CLAIM-PARTIAL이다.
 * 14. 메모 칸(TASK-18). memoView는 번호 ask로 묻고 마지막 번호의 답만 쓴다. 목록·묶음은 Worker의 inputTargets가 같은 판단으로 정한다(AC-018.26). 답에는 환자 글자가 있어 환자 줄 화면(components/claim/rows)에만 넘긴다.
 *     editMemo·memoApprove는 답이 없고, 저장 결과는 memoSave로 온다. memoSaveRetry는 저장하지 못한 달을 다시 보낸다. storeBlock은 달 칸 저장이 막혔다고 알린다(AC-018.17): 그 뒤로 Worker는 달 칸 store.save를 보내지 않고 달 칸 store.load가 성공하면 풀린다.
 *     buildInputBatch는 묶음을 Worker가 만들어 통로 포트로 보낸다(AC-004.11. 화면은 글자를 쥐지 않는다). 답은 inputStart 하나, 끝나면 inputDone 하나이고 번호 run은 물을 때 보낸 그대로다.
 *     통로가 바뀌면(화면을 떠나면) 진행 중인 묶음의 답은 오지 않는다. 결과는 도우미 작업 저장에 있어 다음 store.load로 읽는다(AC-018.5·AC-017.9).
 */
export type PrecheckFromScreen =
  | { type: 'loadStart'; load: number; keepEdits?: true }
  | { type: 'month'; id: string; load: number }
  | { type: 'loadPart'; part: 'memos' | 'store'; id: string; load: number }
  | { type: 'memoReloadStart'; run: number }
  | { type: 'loadPart'; part: 'memos'; id: string; load: number; run: number }
  | { type: 'ruleList' }
  | { type: 'check'; check: number; load: number; visible: DateRange; settings: CheckSettings | null }
  | { type: 'excel'; check: number }
  | { type: 'memoView'; ask: number; selection: InputSelection }
  | { type: 'editMemo'; visitKey: string; text: string }
  | { type: 'memoApprove'; visitKey: string; approved: boolean }
  | { type: 'memoSaveRetry' }
  | { type: 'storeBlock' }
  | { type: 'buildInputBatch'; run: number; what: InputWhat; selection: InputSelection }
  | { type: 'inputExcel'; ask: number }

/** Worker → 통로 포트: 도우미에 보낼 글자(design.md 6-1). 화면을 지나지 않는다. 결과는 포트로 {type: 'sent', ticket, ok, …} */
export type PrecheckToPort = { type: 'send'; ticket: number; cmd: 'store.save' | 'bit.input'; payload: string }

/** Worker → 화면. month·loadPart의 load·run은 물을 때 보낸 번호 그대로다. loadPart 답에는 환자 글자가 없다. check의 usedCopy는 서버 대신 쓴 도우미 설정 사본이고 서버 설정을 썼으면 null이다 */
export type PrecheckToScreen =
  // 날짜별 건수: 건수가 바뀌었을 수 있다. 불러오기(점검)·성공한 비트 메모 다시 불러오기·입력이 끝날 때 그 답 바로 앞에 간다(AC-019.3·AC-019.4). 물음의 답이 아니라 번호가 없다
  | DayCountsMessage
  // 조각이 다 오지 않음(abort·빠짐·SHA-256 다름). 그 id의 조각을 버렸다는 알림일 뿐, 성패 판단에 쓰지 않는다(PrecheckFromScreen 약속 6·7·8)
  | { type: 'partial'; id: string; code: 'E-CLAIM-PARTIAL' }
  | { type: 'month'; id: string; load: number; ok: true; visits: number; months: string[] }
  | { type: 'month'; id: string; load: number; ok: false; code: ErrorCode }
  | { type: 'loadPart'; part: 'memos' | 'store'; id: string; load: number; run?: number; ok: true }
  | { type: 'loadPart'; part: 'memos' | 'store'; id: string; load: number; run?: number; ok: false; code: ErrorCode }
  | { type: 'ruleList'; ok: true; rules: RuleSummary[] }
  | { type: 'ruleList'; ok: false; code: ErrorCode }
  | { type: 'check'; check: number; load: number; ok: true; view: ClaimView; usedCopy: CheckSettings | null }
  | { type: 'check'; check: number; load: number; ok: false; code: ErrorCode }
  | { type: 'excel'; check: number; ok: true; bytes: ArrayBuffer; fileName: string }
  | { type: 'excel'; check: number; ok: false; code: ErrorCode }
  | { type: 'memoView'; ask: number; ok: true; view: MemoScreenView }
  | { type: 'memoView'; ask: number; ok: false; code: ErrorCode }
  | { type: 'memoSave'; ok: true }
  | { type: 'memoSave'; ok: false; code: string; blocked: boolean }
  | { type: 'inputStart'; run: number; ok: true; count: number; askPc: boolean }
  | { type: 'inputStart'; run: number; ok: false; code: string }
  | { type: 'inputDone'; run: number; ok: true; result: InputResultView }
  | { type: 'inputDone'; run: number; ok: false; code: string }
  | { type: 'inputExcel'; ask: number; ok: true; bytes: ArrayBuffer; fileName: string }
  | { type: 'inputExcel'; ask: number; ok: false; code: ErrorCode }
