import type { DrugInfoEntry, Grade, RuleDef, Visit } from '@/types/precheck'

// 규칙 엔진 안에서 쓰는 모양(REQ-010) [환자 자료 구역]. 원본 new-medicore-precheck 스크립트의 값 이름을 그대로 쓴다.
// 날짜는 원본의 YYYYMMDD 대신 YYYY-MM-DD다. 글자 순서가 곧 날짜 순서인 것은 같다

/** 규칙 글의 대상(원본 target·set_a·set_b 등) */
export type Target = {
  codes?: string[]
  code_groups?: string[]
  drug_classes?: string[]
  name_regex?: string
  chart_regex_key?: string
}

type DrugCondition = { drug_classes_any?: string[]; absent_drug_classes?: string[]; only_drug_classes?: string[]; same_site?: unknown }
export type DocItem = {
  element?: string
  chart_regex_key?: string
  rom_regex_key?: string
  regex?: string
  regex_key?: string
  regex_keys?: string[]
  source?: string
  skip_for_midline?: string[]
}
export type Threshold = { at?: number; grade?: Grade; message?: string; phase?: unknown; drug_class?: string; unless_regex?: string }
export type WindowSpec = {
  type?: string
  days?: number
  start_overrides?: Record<string, string>
  new_episode_gap_days?: number
  new_course_gap_days?: number
  cycle_definition?: string
  group_by?: string
}
type WindowEntry = { window?: WindowSpec; thresholds?: Threshold[]; at?: number; grade?: Grade; message?: string }

/** rule.params에서 엔진이 읽는 칸. 조건 종류마다 일부만 있다(원본 표 그대로) */
export type RuleParams = {
  target?: Target
  // 같은 날 함께 청구
  set_a?: Target
  set_b?: Target
  pairs?: string[][]
  pairs_group?: string
  code_mapping_pending?: unknown
  insurance_types?: string[]
  not_in_set_a?: string[]
  exclude_pairs_covered_by?: string[]
  absent_same_day?: Target
  drug_condition?: DrugCondition
  allowed_if?: { chart_regex?: string }
  same_site?: unknown
  resolution?: string
  sam_check?: unknown
  secondary?: { require_chart_regex_key?: string; min_sites?: number; grade?: Grade }
  // 필수 상병
  dx_prefixes?: string[]
  dx_prefixes_not_counting?: string[]
  positions?: string[]
  any_evidence?: unknown
  requirements?: unknown
  patient_condition?: { any?: unknown }
  when?: unknown
  condition?: {
    co_prescribed_drug_classes_any?: string[]
    chart_regex_key?: string
    physician_exam_absent_regex_key?: string
    closure_record_absent_regex?: string
  }
  or_drug_history?: { drug_classes?: string[] }
  dx_uncertain?: unknown
  outcomes?: { when?: string; grade?: Grade; after_days?: number }[]
  // 약 요건
  kind?: string
  not_applicable?: string[]
  require_drug_classes_any?: string[]
  also_require_chart_regex_key?: string
  forbid_only_drug_classes?: string[]
  acceptable_with?: string[]
  forbidden_drug_classes_any?: string[]
  chart_regex_key?: string
  require_any?: { injected_drug_line?: unknown; chart_regex_key?: string }[]
  forbid_separately_billed_drug_classes?: string[]
  // 같은 날 한도
  limits?: unknown
  max_units?: unknown
  max_mg_per_level?: unknown
  metric?: string
  categories?: Record<string, Target>
  max?: number
  group_by?: string
  max_distinct_codes?: number
  second_block_factor?: number
  per?: string
  subgroups?: string[]
  forbidden_name_regex?: string
  // 배율 상한
  segments?: unknown
  unit_per_side?: number
  flag_if_side_missing?: unknown
  expected?: { unilateral: number; bilateral: number }
  site_rules?: { chart_regex_key: string; cap: number }[]
  caps?: Record<string, { unilateral?: number; bilateral?: number; per_side_max?: number }>
  per_side?: unknown
  cap?: { unilateral?: number; bilateral?: number; side_unknown?: number; per_side?: number }
  table?: { unilateral?: Record<string, number>; bilateral?: Record<string, number>; per_side?: Record<string, number> }
  compare?: string
  region_split?: unknown
  region_split_exempt?: string[]
  max_lines_per_visit?: Record<string, number>
  max_segments?: number
  tolerance?: number
  // 부위 대조
  mode?: string
  msk_dx_prefixes?: string[]
  suggest_code?: string
  exempt_regex?: string
  joint_sites?: string[]
  allowed_sites?: string[]
  procedure_region?: unknown
  downgrade_if_chart_symptom_matches_procedure_region?: unknown
  // 기록 요건
  structured_result_fields?: unknown
  prompt?: unknown
  required_views?: unknown
  required_all?: DocItem[]
  required_any?: DocItem[]
  required_per_code?: unknown
  dx_condition?: { dx_prefixes?: string[] }
  conditional_codes?: Record<string, unknown>
  // 촬영
  bilateral_terms_regex_key?: string
  pass_if_regex?: string
  max_count?: number
  // 상병 조합
  forbidden_dx_prefixes?: Record<string, string[]>
  forbidden_drug_classes?: string[]
  // 약 병용
  a?: { drug_classes?: string[] }
  b?: { drug_classes?: string[]; exclude_drug_classes?: string[] }
  min_distinct_ingredients?: number
  // 간격
  previous?: Target & { drug_condition?: DrugCondition; same_site?: unknown; result_condition?: unknown; other_class_than_current?: unknown; same_cycle?: unknown }
  schedules?: unknown
  flag_if_interval_in?: unknown
  min_months?: number
  min_interval?: { months?: number; minus_days?: number }
  min_days?: number
  // 횟수
  scope?: unknown
  metrics?: unknown
  phase?: unknown
  applies_after_days_from_first_by_dx?: unknown
  window?: WindowSpec
  windows?: WindowEntry[]
  thresholds?: Threshold[]
  additional_windows?: WindowEntry[]
  count_unit?: string
  include_history_codes?: Record<string, unknown>
  site?: string
  // 치료 기간
  max_period?: { calendar_months?: number; days?: number }
  max_period_by_basis?: unknown
  episode_start?: unknown
  episode?: { type?: string; new_episode_gap_days?: number; new_course_gap_days?: number }
  exception_dx_prefixes?: Record<string, string[]>
  exception_grade?: Grade
  // 앞선 치료
  required_prior?: Target & { min_count?: number; min_span_days?: number }
  exceptions_regex?: string
}

/** 처방 한 줄의 변하지 않는 부분(원본 baseOf). 코드·이름이 같으면 나눠 쓴다 */
export type LineBase = {
  key: string
  code: string
  edi: string
  name: string
  label: string
  info: DrugInfoEntry | null
  route: string
  classes: Set<string>
}
/** 처방 한 줄(원본 lineOf). A.includes(l)처럼 줄마다 다른 물건으로 본다 */
export type Line = LineBase & { qty: number; benefit: boolean }

/** 차트 글에서 읽은 부위·좌우·레벨(원본 parseChart) */
export type ParsedChart = {
  sites: Set<string>
  joints: Set<string>
  side: 'bilateral' | 'unilateral' | 'unknown'
  right: boolean
  left: boolean
  levels: Map<string, Set<number>>
  spine: Map<string, Set<string>>
  levelCount: number | null
}

export type Dx = { code: string; raw: string; name: string; pos: 'main' | 'excluded' | 'sub' }

/** 오늘 이전의 한 날(원본 pastOf 항목) */
export type PastDay = { date: string; lines: Line[]; text: string; v: Visit | null; parsed: ParsedChart; classes: Set<string> }

/** 진료 문맥(원본 contextOf). 상병 자료가 아예 없으면 dx는 null */
export type Context = {
  v: Visit
  date: string
  chart: string
  lines: Line[]
  ben: Line[]
  dx: Dx[] | null
  text: string
  parsed: ParsedChart
  classes: Set<string>
  past: PastDay[] | null
}

/** 걸린 규칙(원본 hit). Finding으로 바꾸기 전 모양 */
export type Hit = { id: string; rule: RuleDef; grade: Grade; message: string; detail: string }
/** 'skip': 상병 자료가 없어 판정하지 못함(원본 skipped.data) */
export type Outcome = Hit | 'skip' | null
