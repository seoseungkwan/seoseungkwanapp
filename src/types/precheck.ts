// 청구 사전점검 모양(spec precheck). 원본은 양지바른 사전점검(seoseungkwan/shared@2a1069b)
// 점검 표 네 개(src/lib/precheck/data, REQ-007): 원본에서 옮긴 그대로의 모양. 칸 이름도 원본 그대로(snake_case)
// 계산 모양(ClaimMonth·Visit·Finding 등, design.md 6-3)과 도우미 claim.month JSON 모양은 TASK-9가 아래에 더했다
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

/** 점검 결과 보기 모양(jobs.check, TASK-10). 환자 글자가 들어 있어 Worker와 환자 줄 화면(components/claim/rows) 밖으로 나가지 않는다 */
export type CheckedVisit = Pick<Visit, 'key' | 'chart' | 'date' | 'name'> & { findings: Finding[]; skippedNoHistory: number; skippedNoDx: number; checked: number }
export type CheckGroup = { ruleId: string; title: string; domain: string; grade: Grade; visitKeys: string[] }
export type CheckView = {
  visits: CheckedVisit[]
  groups: CheckGroup[]
  totals: { checked: number; hi: number; mid: number; lo: number; patients: number; historySkips: number }
}

// ── Worker ↔ 화면 메시지(design.md 6-2). 화면에는 숫자·달·오류 번호·규칙 목록만 간다(환자 글자 없음) ──────────

/** 설정 화면 '점검 규칙' 칸에 보일 규칙 하나(TASK-12가 쓴다) */
export type RuleSummary = Pick<RuleDef, 'id' | 'title' | 'domain' | 'grade' | 'basis' | 'enabled_default'>

/**
 * 화면 → Worker. loadStart·month: 한 달 불러오기 / ruleList: 설정 화면용 규칙 목록
 *
 * 화면이 지킬 약속:
 * 1. 불러올 때마다 새 번호 load를 정해(1씩 올린다. 같은 Worker에 같은 번호를 두 번 쓰지 않는다) stream('claim.month') 바로 앞에 loadStart를 보낸다.
 *    Worker는 이 번호를 마지막 불러오기로 삼고 전에 불러온 달을 버린다. 답은 없다.
 * 2. stream이 거절되면 그 불러오기는 실패다. month를 보내지 않는다(문에서 거절되면 id도 abort도 없다. 달은 1에서 이미 비었다).
 *    마지막 불러오기가 아닌 옛 번호의 stream 거절은 화면에 보이지 않고 버린다.
 * 3. stream이 끝나면 받은 id를 그 불러오기의 번호와 함께 month로 보낸다. 그새 새 불러오기를 시작했어도 보낸다(Worker가 모아 둔 글자를 찾아 가 버리게).
 * 4. 어느 불러오기의 답인지는 화면이 자기 마지막 번호와 답의 load를 견줘 판단한다. id로 견주지 않는다: 새 요청의 id는 stream이 끝나기 전에는
 *    화면에 없어서(lib/bridge/client.ts request) 그동안 옛 id가 가장 새것처럼 보인다. 번호가 다른 답은 ok와 상관없이 버린다.
 * 5. Worker도 take가 끝난 뒤 같은 번호를 본다. 마지막 불러오기의 번호가 아닌 month는(제 loadStart보다 먼저 닿은 것도) 달을 넣지도 지우지도 않고 ok:false로 답한다.
 * 6. 점검해도 되는 때는 마지막 번호의 month가 ok:true로 답했을 때뿐이다. ok:false면 멈춘다. stream이 끝난 것만으로 판단하지 않는다:
 *    SHA-256이 달라도 stream은 끝나고, SHA-256 계산은 그 뒤에 끝난다.
 * 7. partial로 판단하지 않는다. 어느 명령이든 오고(Worker는 명령을 모른다) 불러 둔 달을 바꾸지 않는다. 6과 같은 까닭으로 아직 안 왔다고 성공도 아니다.
 * 8. claim.memos·store.load(뒤 TASK가 만든다)도 SHA-256이 달라도 stream이 끝나고 신호는 partial뿐이라 7처럼 그것으로 막을 수 없다.
 *    그래서 끝난 id마다 month처럼 그 불러오기의 번호로 Worker에 물어 take한 답을 받고, 그 답이 ok:false면 멈춘다.
 *    stream 거절은 E-HELPER-UNKNOWN-COMMAND면 그 자료 없이 계속하고 다른 오류 번호면 멈춘다(AC-013.2). 옛 불러오기의 거절은 2처럼 버린다.
 */
export type PrecheckFromScreen = { type: 'loadStart'; load: number } | { type: 'month'; id: string; load: number } | { type: 'ruleList' }

/** Worker → 화면. month의 load는 물을 때 보낸 번호 그대로다 */
export type PrecheckToScreen =
  // 조각이 다 오지 않음(abort·빠짐·SHA-256 다름). 그 id의 조각을 버렸다는 알림일 뿐, 성패 판단에 쓰지 않는다(PrecheckFromScreen 약속 6·7·8)
  | { type: 'partial'; id: string; code: 'E-CLAIM-PARTIAL' }
  | { type: 'month'; id: string; load: number; ok: true; visits: number; months: string[] }
  | { type: 'month'; id: string; load: number; ok: false; code: ErrorCode }
  | { type: 'ruleList'; ok: true; rules: RuleSummary[] }
  | { type: 'ruleList'; ok: false; code: ErrorCode }
