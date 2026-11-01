// 청구 사전점검 모양(spec precheck). 원본은 양지바른 사전점검(seoseungkwan/shared@2a1069b)
// 점검 표 네 개(src/lib/precheck/data, REQ-007): 원본에서 옮긴 그대로의 모양. 칸 이름도 원본 그대로(snake_case)
// 계산 모양(ClaimMonth·Visit·Finding 등, design.md 6-3)은 TASK-9가 이 파일에 더한다

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
