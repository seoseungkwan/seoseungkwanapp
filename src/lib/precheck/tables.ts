import type { Automatable, Confidence, Grade, RuleDef, RuleStage, RuleType, Tables } from '@/types/precheck'

// 점검 표 네 개의 모양 검사(순수 함수, REQ-007). 표를 불러오는 곳은 workers/precheck/tables.ts 하나다(AC-007.4).
// 원본에서 옮긴 표가 이 모양을 벗어나면 던지고, Worker는 점검을 시작하지 않는다(E-RULES-LOAD-FAILED, AC-007.5).
// 던지는 글에는 어느 칸인지만 적는다(표에는 환자 자료가 없지만, 화면에는 오류 번호만 간다)

export const GRADES = ['확인필요', '알림', '참고'] as const satisfies readonly Grade[]
export const RULE_TYPES = [
  'count_window', 'claim_code', 'same_day_pair', 'documentation', 'required_dx', 'info_only',
  'same_day_limit', 'interval', 'dur', 'multiplier_cap', 'drug_requirement', 'dx_site_match',
  'dx_master', 'visit_fee', 'imaging_count', 'episode_period', 'forbidden_dx_combo', 'prerequisite',
] as const satisfies readonly RuleType[]
/** 원본 규칙의 16칸(이 순서) */
export const RULE_FIELDS = [
  'id', 'domain', 'title', 'type', 'params', 'grade', 'message', 'basis', 'confidence',
  'data_needed', 'automatable', 'stage', 'enabled_default', 'effective_from', 'effective_to', 'notes',
] as const
/** 규칙 ID 모양. design.md 8-1 claim_rule_settings.rule_id 제약과 같다 */
export const RULE_ID = /^[A-Z]{2}-[0-9]{2,3}[a-z]?$/

const CONFIDENCE = ['상', '중', '하'] as const satisfies readonly Confidence[]
const AUTOMATABLE = ['yes', 'partial', 'no'] as const satisfies readonly Automatable[]
const STAGES = ['memo', 'sam', 'history'] as const satisfies readonly RuleStage[]
const DATE = /^\d{4}-\d{2}-\d{2}$/
const EDI = /^\d{9}$/

type Rec = Record<string, unknown>

function fail(where: string): never {
  throw new TypeError(`점검 표 모양이 다르다: ${where}`)
}

const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const isText = (x: unknown): x is string => typeof x === 'string'
const isFilled = (x: unknown): x is string => isText(x) && x.trim() !== ''
const isTextList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isText)
const isOneOf = (list: readonly string[], x: unknown) => isText(x) && list.includes(x)
const isDateOrNull = (x: unknown) => x === null || (isText(x) && DATE.test(x))

/** required 칸이 모두 있고 required·optional 밖의 칸이 없다 */
function hasKeys(x: Rec, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((k) => Object.hasOwn(x, k)) && Object.keys(x).every((k) => required.includes(k) || optional.includes(k))
}

function checkBasis(basis: unknown, where: string) {
  if (!Array.isArray(basis)) fail(where)
  basis.forEach((item, i) => {
    const at = `${where}[${i}]`
    if (!isRecord(item) || !hasKeys(item, ['doc', 'number'], ['effective', 'url'])) fail(at)
    if (!isFilled(item.doc) || !isFilled(item.number)) fail(at)
    if ((item.effective !== undefined && !isText(item.effective)) || (item.url !== undefined && !isText(item.url))) fail(at)
  })
}

function checkRule(rule: unknown, where: string) {
  if (!isRecord(rule) || !hasKeys(rule, RULE_FIELDS)) fail(where)
  if (!isText(rule.id) || !RULE_ID.test(rule.id)) fail(`${where}.id`)
  if (!isFilled(rule.domain) || !isFilled(rule.title) || !isFilled(rule.message)) fail(`${where}.title`)
  if (!isOneOf(RULE_TYPES, rule.type)) fail(`${where}.type`)
  if (!isRecord(rule.params)) fail(`${where}.params`)
  if (!isOneOf(GRADES, rule.grade)) fail(`${where}.grade`)
  checkBasis(rule.basis, `${where}.basis`)
  if (!isOneOf(CONFIDENCE, rule.confidence)) fail(`${where}.confidence`)
  if (!isTextList(rule.data_needed)) fail(`${where}.data_needed`)
  if (!isOneOf(AUTOMATABLE, rule.automatable)) fail(`${where}.automatable`)
  if (!Array.isArray(rule.stage) || !rule.stage.every((s) => isOneOf(STAGES, s))) fail(`${where}.stage`)
  if (typeof rule.enabled_default !== 'boolean') fail(`${where}.enabled_default`)
  if (!isDateOrNull(rule.effective_from) || !isDateOrNull(rule.effective_to)) fail(`${where}.effective`)
  if (!isText(rule.notes)) fail(`${where}.notes`)
}

/**
 * 규칙 한 줄이 규칙표 검사(checkTables)가 규칙마다 하는 검사를 지나는지(참·거짓, 던지지 않음).
 * 고시로 바꾼 규칙 검사(ruleUpdates.ts, specs/rule-auto AC-7802.5)가 쓴다. 규칙끼리 id 겹침은 표 검사만 본다
 */
export function checkRuleShape(x: unknown): x is RuleDef {
  try {
    checkRule(x, 'rule')
    return true
  } catch {
    return false
  }
}

function checkRules(rules: unknown) {
  if (!isRecord(rules) || !hasKeys(rules, ['version', 'meta', 'code_groups', 'drug_classes', 'regions', 'rules'])) fail('rules')
  if (!isFilled(rules.version)) fail('rules.version')
  for (const key of ['meta', 'code_groups', 'drug_classes', 'regions']) if (!isRecord(rules[key])) fail(`rules.${key}`)
  const list = rules.rules
  if (!Array.isArray(list) || list.length === 0) fail('rules.rules')
  const ids = new Set<unknown>()
  list.forEach((rule, i) => {
    checkRule(rule, `rules.rules[${i}]`)
    const id = (rule as Rec).id
    if (ids.has(id)) fail(`rules.rules[${i}].id 겹침`)
    ids.add(id)
  })
}

function checkDxFlags(dx: unknown) {
  if (!isRecord(dx) || !hasKeys(dx, ['version', 'date', 'source', 'I', 'N'])) fail('dxFlags')
  if (!isText(dx.version) || !isText(dx.date) || !isText(dx.source)) fail('dxFlags.version')
  if (!isTextList(dx.I)) fail('dxFlags.I')
  if (!isTextList(dx.N)) fail('dxFlags.N')
}

function checkDrugInfo(drug: unknown) {
  if (!isRecord(drug) || !hasKeys(drug, ['version', 'base_date', 'source', 'fields', 'map'])) fail('drugInfo')
  if (!isText(drug.version) || !isText(drug.base_date) || !isText(drug.source)) fail('drugInfo.version')
  if (!isTextList(drug.fields)) fail('drugInfo.fields')
  if (!isRecord(drug.map)) fail('drugInfo.map')
  for (const [edi, info] of Object.entries(drug.map)) {
    if (!EDI.test(edi) || !Array.isArray(info) || info.length !== 3 || !info.every(isText)) fail('drugInfo.map')
  }
}

function checkCodeMap(codeMap: unknown) {
  if (!isRecord(codeMap)) fail('codeMap')
  for (const entry of Object.values(codeMap)) {
    if (!isRecord(entry) || !hasKeys(entry, ['n', 'k', 'rg'], ['memo'])) fail('codeMap')
    if (!isText(entry.n) || !isText(entry.k) || !(entry.rg === null || isText(entry.rg))) fail('codeMap')
    if (entry.memo !== undefined && !isText(entry.memo)) fail('codeMap')
  }
}

/** 네 표(rules·dxFlags·drugInfo·codeMap)의 모양을 검사해 그대로 돌려준다. 모양이 틀리면 던진다 */
export function checkTables(t: unknown): Tables {
  if (!isRecord(t) || !hasKeys(t, ['rules', 'dxFlags', 'drugInfo', 'codeMap'])) fail('tables')
  checkRules(t.rules)
  checkDxFlags(t.dxFlags)
  checkDrugInfo(t.drugInfo)
  checkCodeMap(t.codeMap)
  return t as unknown as Tables
}
