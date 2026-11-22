import type { RuleDef, RulesFile } from '@/types/precheck'
import type { Compiled } from './compile'
import { compiled } from './compile'
import { WINDOWS, windowsOf } from './past'
import type { DocItem, RuleParams } from './types'

// 규칙 종류별 자동 점검 가능 여부와 규칙 상태(원본 S.* · statusOf) [환자 자료 구역]. 규칙 내용만 보고 정한다.
// auto: 자동 점검 · hist: 이력으로 점검 · sam: SAM 단계 · manual: 수동 확인. auto·hist만 돈다

export type RuleStatus = 'auto' | 'hist' | 'sam' | 'manual'

type Check = (p: RuleParams, rule: RuleDef, C: Compiled) => boolean

const SITE_MODES = ['unusual_code_with_msk_only_dx', 'chart_keyword_vs_code', 'chart_site_vs_code', 'chart_site_allowed_list']
const DRUG_MODES = ['require_drug_classes_any', 'forbid_only_drug_classes', 'forbidden_drug_classes_any', 'require_any', 'forbid_separately_billed_drug_classes'] as const
const testable = (item: DocItem) =>
  Boolean(item.chart_regex_key || item.rom_regex_key || item.regex || item.regex_key || item.regex_keys || item.source === 'drug_lines_present' || item.element === 'side' || item.element === 'site_or_level')

const S: Partial<Record<RuleDef['type'], Check>> = {
  same_day_pair: (p, _, C) =>
    !p.code_mapping_pending &&
    (!p.insurance_types || p.insurance_types.includes('건강보험')) &&
    (Boolean(p.pairs || (p.pairs_group && C.GROUPS.get(p.pairs_group)?.pairs)) || (C.targetKnown(p.set_a) && (C.targetKnown(p.set_b) || Boolean(p.set_b && p.set_b.chart_regex_key)))),
  required_dx: (p, _, C) => C.targetKnown(p.target) && Array.isArray(p.dx_prefixes) && !p.any_evidence && !p.requirements && !p.patient_condition && !p.when,
  drug_requirement: (p, _, C) => C.targetKnown(p.target) && !p.condition && !p.kind && DRUG_MODES.some((key) => p[key]),
  same_day_limit: (p, _, C) => {
    if (p.limits || p.max_units || p.max_mg_per_level || /mg|units|daily/.test(String(p.metric || ''))) return false
    if (p.categories) return true
    if (!C.targetKnown(p.target)) return false
    if (p.group_by && p.group_by !== 'lesion_group') return false
    if (p.group_by === 'lesion_group') return Boolean(p.max_distinct_codes)
    return ['multiplier_sum', 'qty_sum', 'distinct_ingredients', 'distinct_codes'].includes(p.metric as string)
  },
  multiplier_cap: (p, _, C) =>
    C.targetKnown(p.target) &&
    !p.segments &&
    (p.unit_per_side != null ||
      (Array.isArray(p.site_rules) && p.site_rules.length > 0) ||
      Boolean(p.caps) ||
      Boolean(p.per_side) ||
      (p.compare === 'claimed_vs_cap' && Boolean(p.cap)) ||
      (p.compare === 'claimed_vs_expected' && Boolean(p.table))),
  dx_site_match: (p, _, C) => C.targetKnown(p.target) && (SITE_MODES.includes(p.mode as string) || Boolean(p.procedure_region)),
  documentation: (p, _, C) => {
    if (!C.targetKnown(p.target) || (p.when && !/same_day_distinct_us_codes/.test(String(p.when))) || p.structured_result_fields || p.prompt) return false
    if (p.required_views) return true
    if (p.required_all) return p.required_all.some(testable)
    if (p.required_any) return p.required_any.some(testable)
    if (p.required_per_code) return true
    return Array.isArray(p.outcomes) && p.outcomes.some((o) => /kl4/.test(o.when || ''))
  },
  imaging_count: (p, rule, C) => ['XR-01', 'XR-03', 'XR-08', 'XR-09'].includes(rule.id) && C.targetKnown(p.target),
  visit_fee: (_, rule) => ['VF-01', 'VF-02', 'VF-03', 'VF-04'].includes(rule.id),
  forbidden_dx_combo: (p, _, C) => Boolean(p.forbidden_dx_prefixes) && C.targetKnown(p.target),
  dur: (p) => (p.kind === 'combination' && Boolean(p.a) && Boolean(p.b)) || (p.kind === 'same_class_same_day' && Boolean(p.target)) || p.kind === 'same_ingredient_same_day',
  dx_master: (_, rule) => ['DX-01', 'DX-02', 'DX-08'].includes(rule.id),
  claim_code: (_, rule) => ['DX-06', 'CL-15', 'ES-01', 'US-01', 'HY-12'].includes(rule.id),
  interval: (p, _, C) =>
    C.targetKnown(p.target) &&
    !(p.patient_condition && p.patient_condition.any) &&
    !p.schedules &&
    !p.flag_if_interval_in &&
    !(p.previous && (p.previous.result_condition || p.previous.other_class_than_current)) &&
    Boolean(p.min_months || (p.min_interval && p.min_interval.months) || p.min_days),
  count_window: (p, _, C) => {
    if (p.scope || p.metrics || p.metric || p.phase || p.applies_after_days_from_first_by_dx || !C.targetKnown(p.target)) return false
    const list = windowsOf(p)
    return (
      list.some((w) => w.thresholds.some((t) => t && t.at != null)) &&
      list.every((w) => !w.window || WINDOWS.has(w.window.type as string)) &&
      !list.some((w) => w.window && w.window.type === 'rolling_from_first')
    )
  },
  episode_period: (p, _, C) => C.targetKnown(p.target) && !p.max_period_by_basis && !p.episode_start && Boolean((p.max_period && (p.max_period.calendar_months || p.max_period.days)) || p.outcomes),
  prerequisite: (p, _, C) => C.targetKnown(p.target) && Boolean(p.required_prior),
}

function statusOf(rule: RuleDef, C: Compiled): RuleStatus {
  const p = (rule.params ?? {}) as RuleParams
  if (rule.id === 'HY-12' || rule.id === 'DX-08') return 'auto'
  if (rule.type === 'info_only' || rule.automatable === 'no') return 'manual'
  const stage = Array.isArray(rule.stage) ? rule.stage : []
  const check = S[rule.type]
  if (check) {
    let ok = false
    try {
      ok = Boolean(check(p, rule, C))
    } catch {
      ok = false
    }
    if (ok) return !stage.includes('memo') && stage.includes('history') ? 'hist' : 'auto'
    return stage.length === 1 && stage[0] === 'sam' ? 'sam' : 'manual'
  }
  return !stage.includes('memo') && stage.includes('sam') ? 'sam' : 'manual'
}

/**
 * 규칙 하나의 상태(statusesOf와 같은 계산, 기억하지 않음). 고시로 바꾼 판은 원래 규칙과 상태가 같아야 한다 —
 * 엔진은 규칙 번호로 상태를 하나만 갖기 때문(specs/rule-auto AC-7802.4)
 */
export function ruleStatusIn(file: RulesFile, rule: RuleDef): RuleStatus {
  return statusOf(rule, compiled(file))
}

const memo = new WeakMap<RulesFile, Map<string, RuleStatus>>()

/** 규칙 번호 → 상태(규칙표 차례). 표마다 한 번만 만든다 */
export function statusesOf(file: RulesFile): Map<string, RuleStatus> {
  let out = memo.get(file)
  if (!out) {
    const C = compiled(file)
    out = new Map(file.rules.map((rule) => [rule.id, statusOf(rule, C)]))
    memo.set(file, out)
  }
  return out
}
