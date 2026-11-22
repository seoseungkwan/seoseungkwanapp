import { addDays, compareYmd, isYmd } from '@/lib/analytics/dates'
import { up } from '@/lib/precheck/rules/compile'
import { ruleStatusIn } from '@/lib/precheck/rules/status'
import { checkRuleShape } from '@/lib/precheck/tables'
import type { RuleChangeCheck, RuleDef, RuleUpdate, RulesFile, Tables } from '@/types/precheck'

// 고시로 바꾼 점검 규칙 검사와 진료일별 판 합치기(specs/rule-auto design 4·5절) [환자 자료 구역, 순수 함수].
// 모으기(서버)는 AI가 고친 규칙을 저장하기 전에, Worker는 받은 판을 점검에 쓰기 전에 같은 checkRuleChange로 거른다.
// 엔진은 고치지 않는다: 판마다 effective_from·effective_to 창을 나눠 주면 엔진이 진료일에 맞는 판만 돌린다(engine.ts).
// 던지지 않는다 — 이상한 값은 모두 까닭 번호이거나 버린다

type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const isText = (x: unknown): x is string => typeof x === 'string'

/** 저절로 못 바꾸는 종류(기본값 4): 앱 안 계산으로 돈다 */
const NO_AUTO_TYPES: readonly string[] = ['visit_fee', 'dx_master', 'claim_code']
/** 코드 안에서 번호로 따로 불리는 규칙(engine.ts HY-12, status.ts·sameDay.ts DX-08) */
const NO_AUTO_IDS = ['HY-12', 'DX-08']
/** AI가 바꾸지 못하는 칸(기본값 3). title·message·params만 고치고, basis·effective_*는 앱이 채운다 */
const FIXED = ['id', 'domain', 'type', 'grade', 'confidence', 'data_needed', 'automatable', 'stage', 'enabled_default', 'notes'] as const
/** 한도(기본값 14). 글자 수는 글자 하나씩(코드 포인트), 바이트는 UTF-8 */
const LIMIT = { title: 80, message: 300, paramsBytes: 4000, ruleBytes: 8000, regex: 300 } as const
const DX_PREFIX = /^[A-Z][0-9A-Z]{0,5}$/
/**
 * 차트 낱말 길 모양('regions.a.b'). 규칙표에는 'regions.'로 시작하는 설명 글도 있다
 * (LA-28 'regions.kcd_prefix_map + kcd_fifth_char_rules' — 엔진은 길로 읽지 않음). 그런 글은 다른 글자 값처럼 (e)로 본다
 */
const REGION_PATH = /^regions(\.[A-Za-z0-9_]+)+$/
const DX_KEYS: readonly string[] = ['dx_prefixes', 'forbidden_dx_prefixes']
const ENCODER = new TextEncoder()

/**
 * 이름 칸(design 4절): 값이 규칙표 이름표의 이름인 params 칸. params 어디에 있든(깊이 상관없음) 본다.
 * group = 코드 묶음(file.code_groups 열쇠, pairs_group은 pairs가 있는 묶음) · class = 약 분류(file.drug_classes 열쇠 또는 '분류.아래 분류') —
 * 열쇠 이름에 drug_class가 든 칸 모두와 classExtra · sub = 같은 규칙이 고른 약 분류의 아래 분류(subgroups 열쇠).
 * classExtra는 열쇠 이름에 drug_class가 없지만 실제 규칙표에서 값이 모두 약 분류인 칸이다(시험이 이름 칸을 다 덮는지 본다)
 */
export const NAME_KEYS = {
  group: ['code_groups', 'code_groups_any', 'codes_any_group', 'codes_any_groups', 'pairs_group'],
  classPart: 'drug_class',
  classExtra: ['acceptable_with', 'allowed_separately', 'exclude_if_only'],
  sub: ['subgroups'],
} as const

export type NameKind = 'group' | 'class' | 'sub'

/**
 * 비켜 주는 칸(design 4절, 2026-11-22 독립 검토): 열쇠 이름이 이 글자로 시작하는 params 칸(깊이 상관없음).
 * 값이 늘면 경고가 줄어든다(지금 규칙표: acceptable_with·allowed_*·exception*·exclude*·excluded·exempt_regex·skip_*·unless*·pass_if_regex·not_in_set_a)
 */
export const WAIVER_KEYS = ['acceptable', 'allow', 'exception', 'exclu', 'exempt', 'skip', 'unless', 'pass_if', 'not_in_set'] as const

/** 값이 원래 규칙·지금 판의 같은 이름 칸에 이미 있던 것이어야 하는 칸: 비켜 주는 칸과 regex로 끝나는 칸(정규식은 넓히는지 좁히는지 알 수 없다) */
const guarded = (key: string) => key.endsWith('regex') || WAIVER_KEYS.some((head) => key.startsWith(head))

/** 칸 이름 → 그 칸이 가리키는 이름표(이름 칸이 아니면 null) */
export function nameKindOf(key: string): NameKind | null {
  if ((NAME_KEYS.group as readonly string[]).includes(key)) return 'group'
  if (key.includes(NAME_KEYS.classPart) || (NAME_KEYS.classExtra as readonly string[]).includes(key)) return 'class'
  if ((NAME_KEYS.sub as readonly string[]).includes(key)) return 'sub'
  return null
}

/** 규칙표마다 한 번만 센다(표는 읽기만 한다) */
function perFile<T>(make: (file: RulesFile) => T): (file: RulesFile) => T {
  const memo = new WeakMap<RulesFile, T>()
  return (file) => {
    let out = memo.get(file)
    if (out === undefined) {
      out = make(file)
      memo.set(file, out)
    }
    return out
  }
}

const noAutoOf = perFile((file): ReadonlySet<string> => {
  const out = new Set<string>(NO_AUTO_IDS)
  for (const rule of file.rules) {
    if (NO_AUTO_TYPES.includes(rule.type)) out.add(rule.id)
    // 다른 규칙이 '이 규칙이 덮는 짝은 빼라'로 가리키는 규칙(지금 LA-23): 판마다 다르게 돌 수 없다
    const covered = isRecord(rule.params) ? rule.params.exclude_pairs_covered_by : undefined
    for (const id of Array.isArray(covered) ? covered : [covered]) if (isText(id)) out.add(id)
  }
  return out
})

/** 저절로 못 바꾸는 규칙 번호(기본값 4): visit_fee·dx_master·claim_code 종류, HY-12·DX-08, exclude_pairs_covered_by가 가리키는 규칙 */
export function noAutoRuleIds(file: RulesFile): ReadonlySet<string> {
  return noAutoOf(file)
}

/** 종류 → 그 종류 규칙들이 쓰는 params 맨 위 칸 이름 */
const typeKeysOf = perFile((file) => {
  const out = new Map<string, Set<string>>()
  for (const rule of file.rules) {
    const keys = out.get(rule.type) ?? new Set<string>()
    if (isRecord(rule.params)) for (const key of Object.keys(rule.params)) keys.add(key)
    out.set(rule.type, keys)
  }
  return out
})

/** 규칙표가 아는 코드(대문자): code_groups의 모든 코드 ∪ 모든 규칙 params 안 codes */
const knownCodesOf = perFile((file) => {
  const out = new Set<string>()
  const add = (code: string) => code && out.add(code)
  for (const spec of Object.values(file.code_groups)) {
    const list: unknown[] = Array.isArray(spec) ? spec : isRecord(spec) && Array.isArray(spec.codes) ? spec.codes : []
    for (const item of list) add(up(isText(item) ? item : isRecord(item) ? item.code : ''))
  }
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk)
    else if (isRecord(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'codes' && Array.isArray(value)) value.forEach((code) => isText(code) && add(up(code)))
        walk(value)
      }
    }
  }
  for (const rule of file.rules) walk(rule.params)
  return out
})

/** 'regions.a.b'가 file.regions에서 찾아지는 길인가(제 칸만 따라간다) */
function regionFound(file: RulesFile, path: string): boolean {
  const parts = path.split('.')
  if (parts[0] !== 'regions' || parts.length < 2) return false
  let node: unknown = file.regions
  for (const part of parts.slice(1)) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) return false
    node = (node as Rec)[part]
  }
  return node !== undefined
}

/** 약 분류 이름('분류' 또는 '분류.아래 분류')이 규칙표에 있으면 그 분류 이름, 없으면 null */
function classHead(file: RulesFile, name: string): string | null {
  const dot = name.indexOf('.')
  const head = dot < 0 ? name : name.slice(0, dot)
  if (!Object.hasOwn(file.drug_classes, head)) return null
  return dot < 0 || hasSub(file, head, name.slice(dot + 1)) ? head : null
}

function hasSub(file: RulesFile, head: string, sub: string): boolean {
  const spec = file.drug_classes[head]
  return isRecord(spec) && isRecord(spec.subgroups) && Object.hasOwn(spec.subgroups, sub)
}

function regexOk(text: string): boolean {
  if ([...text].length > LIMIT.regex) return false
  try {
    new RegExp(text.replace(/\(\?i\)/g, ''), 'i') // 규칙표는 파이썬식 (?i)를 쓴다(compile.ts rx와 같게 읽는다)
    return true
  } catch {
    return false
  }
}

type Scan = {
  /** (b)~(d)를 모두 지났나 */
  ok: boolean
  /** 규칙이 보는 이름 모음 'kind:값'(group·class·sub·region·code·dx) — 뺀 것 검사 */
  names: Set<string>
  /** 새 낱말 검사(e)를 받을 글자 값·객체 열쇠 */
  words: string[]
}

/** params를 한 번 돌며 이름 칸(b)·코드와 상병 앞자리(c)·정규식(d)을 보고, 이름 모음·새 낱말 후보를 모은다 */
function scan(file: RulesFile, params: unknown): Scan {
  const s: Scan = { ok: true, names: new Set(), words: [] }
  const classes = new Set<string>()
  const subs: string[] = []
  const codes = knownCodesOf(file)
  const texts = (value: unknown): readonly string[] | null => (isText(value) ? [value] : Array.isArray(value) && value.every(isText) ? value : null)
  const region = (path: string) => {
    if (regionFound(file, path)) s.names.add(`region:${path}`)
    else s.ok = false
  }

  function names(kind: NameKind, key: string, value: unknown) {
    const list = texts(value)
    if (!list) {
      s.ok = false
      return
    }
    for (const name of list) {
      if (kind === 'group') {
        const spec = Object.hasOwn(file.code_groups, name) ? file.code_groups[name] : undefined
        // pairs_group은 sameDay.ts가 그 묶음의 pairs를 꺼내 쓴다
        const fits = spec !== undefined && (key !== 'pairs_group' || (isRecord(spec) && Array.isArray(spec.pairs)))
        if (fits) s.names.add(`group:${name}`)
        else s.ok = false
      } else if (kind === 'class') {
        const head = classHead(file, name)
        if (head) {
          s.names.add(`class:${name}`)
          classes.add(head)
        } else s.ok = false
      } else {
        s.names.add(`sub:${name}`)
        subs.push(name)
      }
    }
  }
  function codeList(value: unknown) {
    if (!Array.isArray(value) || !value.every(isText)) {
      s.ok = false
      return
    }
    for (const code of value.map(up)) {
      if (codes.has(code)) s.names.add(`code:${code}`)
      else s.ok = false
    }
  }
  function dxList(value: unknown) {
    if (Array.isArray(value)) value.forEach(dxList)
    else if (isRecord(value)) {
      for (const [key, inner] of Object.entries(value)) {
        s.words.push(key)
        dxList(inner)
      }
    } else if (isText(value) && DX_PREFIX.test(value)) s.names.add(`dx:${value}`)
    else s.ok = false
  }
  function regexText(value: unknown) {
    const list = texts(value)
    if (!list) {
      s.ok = false
      return
    }
    for (const text of list) {
      if (REGION_PATH.test(text)) region(text)
      else if (!regexOk(text)) s.ok = false
    }
  }
  function walk(node: unknown) {
    if (Array.isArray(node)) node.forEach(walk)
    else if (isRecord(node)) {
      for (const [key, value] of Object.entries(node)) {
        s.words.push(key)
        const kind = nameKindOf(key)
        if (kind) names(kind, key, value)
        else if (key === 'codes') codeList(value)
        else if (DX_KEYS.includes(key)) dxList(value)
        else if (key.endsWith('regex')) regexText(value)
        else walk(value)
      }
    } else if (isText(node)) {
      if (REGION_PATH.test(node)) region(node)
      else s.words.push(node)
    }
  }

  walk(params)
  // 아래 분류는 같은 규칙이 고른 약 분류의 것만(sameDay.ts가 '분류.아래 분류'로 찾는다)
  if (!subs.every((sub) => [...classes].some((head) => hasSub(file, head, sub)))) s.ok = false
  return s
}

/** params(깊이 상관없음)의 객체 열쇠와 글자 값 모음 */
function vocabulary(...list: unknown[]): Set<string> {
  const out = new Set<string>()
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk)
    else if (isRecord(node)) {
      for (const [key, value] of Object.entries(node)) {
        out.add(key)
        walk(value)
      }
    } else if (isText(node)) out.add(node)
  }
  list.forEach(walk)
  return out
}

/** params(깊이 상관없음)의 모든 객체 칸을 돈다 */
function eachEntry(node: unknown, visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(node)) node.forEach((x) => eachEntry(x, visit))
  else if (isRecord(node)) {
    for (const [key, value] of Object.entries(node)) {
      visit(key, value)
      eachEntry(value, visit)
    }
  }
}

/** 값 아래 잎 값(글자·숫자·참거짓 등, 배열·객체 안 포함)을 JSON으로 모은다 */
function leavesInto(into: Set<string>, node: unknown): void {
  if (Array.isArray(node)) node.forEach((x) => leavesInto(into, x))
  else if (isRecord(node)) Object.values(node).forEach((x) => leavesInto(into, x))
  else into.add(stable(node))
}

/** 비켜 주는 칸·regex 칸의 열쇠 이름 → 그 이름 칸들 아래 잎 값 모음 */
function guardedLeaves(...list: unknown[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const params of list) {
    eachEntry(params, (key, value) => {
      if (!guarded(key)) return
      const into = out.get(key) ?? new Set<string>()
      leavesInto(into, value)
      out.set(key, into)
    })
  }
  return out
}

/** next의 비켜 주는 칸·regex 칸 잎 값이 모두 base ∪ current의 같은 이름 칸에 있던 값인가(빼는 것은 된다) */
function guardedOk(next: unknown, base: unknown, current: unknown): boolean {
  const before = guardedLeaves(base, current)
  return [...guardedLeaves(next)].every(([key, values]) => [...values].every((value) => before.get(key)?.has(value) === true))
}

/** 열쇠 이름이 grade로 끝나는 칸(깊이 상관없음)의 값(JSON)을 정렬한 목록 */
function gradesOf(params: unknown): string[] {
  const out: string[] = []
  eachEntry(params, (key, value) => key.endsWith('grade') && out.push(stable(value)))
  return out.sort()
}

const jsonKind = (x: unknown) => (Array.isArray(x) ? 'array' : x === null ? 'null' : typeof x)

/** 열쇠를 정렬한 JSON(칸 차례만 다른 값은 같은 글) */
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`
  if (isRecord(x)) {
    return `{${Object.keys(x)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(x[key])}`)
      .join(',')}}`
  }
  return x === undefined ? 'undefined' : (JSON.stringify(x) ?? String(x))
}

const chars = (text: string) => [...text].length
const bytes = (x: unknown) => ENCODER.encode(JSON.stringify(x)).byteLength

function sizeOk(rule: RuleDef): boolean {
  const title = chars(rule.title)
  const message = chars(rule.message)
  return title >= 1 && title <= LIMIT.title && message >= 1 && message <= LIMIT.message && bytes(rule.params) <= LIMIT.paramsBytes && bytes(rule) <= LIMIT.ruleBytes
}

/** (a) 맨 위 칸은 같은 종류 규칙들이 쓰는 칸이고, 원래 규칙에 있는 칸이면 JSON 종류가 같다 */
function topKeysOk(file: RulesFile, base: RuleDef, params: Rec): boolean {
  const allowed = typeKeysOf(file).get(base.type) ?? new Set<string>()
  const was: Rec = isRecord(base.params) ? base.params : {}
  return Object.entries(params).every(([key, value]) => allowed.has(key) && (!Object.hasOwn(was, key) || jsonKind(value) === jsonKind(was[key])))
}

function judge(file: RulesFile, base: RuleDef, current: RuleDef, next: unknown): RuleChangeCheck {
  if (noAutoRuleIds(file).has(base.id)) return 'no-auto'
  const loose: Rec = isRecord(next) ? next : {}
  if (FIXED.some((key) => stable(loose[key]) !== stable(base[key]))) return 'fixed'
  if (!checkRuleShape(next) || next.effective_to !== null || !isYmd(next.effective_from ?? '')) return 'shape'
  if (!sizeOk(next)) return 'size'

  const seen = scan(file, next.params)
  const words = vocabulary(base.params, current.params)
  if (!seen.ok || !topKeysOk(file, base, next.params) || !seen.words.every((word) => words.has(word))) return 'names'
  const before = new Set([...scan(file, base.params).names, ...scan(file, current.params).names])
  if ([...before].some((name) => !seen.names.has(name))) return 'removed'
  if (!guardedOk(next.params, base.params, current.params)) return 'removed'
  if (stable(gradesOf(next.params)) !== stable(gradesOf(base.params))) return 'grade'
  if (ruleStatusIn(file, next) !== ruleStatusIn(file, base)) return 'status'
  const shown = (rule: RuleDef) => stable({ title: rule.title, message: rule.message, params: rule.params })
  if (shown(next) === shown(current)) return 'same'
  return 'ok'
}

/**
 * 고친 규칙(next)을 원래 규칙(base, 규칙표의 줄)·지금 판(current, 살아 있는 가장 늦은 판이나 base)과 견준다(AC-7802.1).
 * 차례: no-auto → fixed → shape → size → names → removed → grade → status → same, 다 지나면 'ok'. 던지지 않는다
 */
export function checkRuleChange(file: RulesFile, base: RuleDef, current: RuleDef, next: unknown): RuleChangeCheck {
  try {
    return judge(file, base, current, next)
  } catch {
    return 'shape' // 읽으면 던지는 값 같은 것은 모양이 맞지 않는 것으로 본다
  }
}

/** 규칙표 날짜(기본값 1): version 앞 10자가 실제 날짜면 그 날짜, 아니면 null */
export function rulesCutoff(version: string): string | null {
  if (!isText(version)) return null
  const day = version.slice(0, 10)
  return isYmd(day) ? day : null
}

type Picked = { changeId: string; from: string; rule: RuleDef }

/** 쓸 수 있는 판이면 그 판(AC-7803.1), 아니면 null */
function usable(file: RulesFile, byId: ReadonlyMap<string, RuleDef>, u: unknown): Picked | null {
  if (!isRecord(u) || !isText(u.changeId) || !isText(u.ruleId) || !isText(u.from) || u.baseVersion !== file.version) return null
  const base = byId.get(u.ruleId)
  const rule = u.rule
  if (!base || !isYmd(u.from) || !isRecord(rule) || rule.id !== u.ruleId || rule.effective_from !== u.from) return null
  // Worker는 판끼리의 사슬을 모르므로 원래 규칙에 대해 다시 본다(모든 판은 원래 규칙의 이름을 다 담는다).
  // 'same'(원래 규칙으로 돌아가는 판)도 쓴다 — 앞 판이 그날 끝나야 한다
  if (!checkRuleShape(rule)) return null
  const check = checkRuleChange(file, base, base, rule)
  if (check !== 'ok' && check !== 'same') return null
  if (base.effective_to !== null && compareYmd(u.from, base.effective_to) > 0) return null // 원래 규칙이 끝난 뒤의 판
  return { changeId: u.changeId, from: u.from, rule }
}

/**
 * 고시로 바뀐 판들을 점검 표에 합친다(AC-7803.1~AC-7803.4). 판마다 날짜 창을 나눠 원래 규칙 바로 뒤에 둔다 —
 * 원래 규칙은 첫 판 전날까지, 판은 다음 판 전날까지(마지막은 원래 규칙의 effective_to). 같은 날짜 판은 목록 뒤의 것 하나.
 * 받은 표·판은 고치지 않고, 쓸 판이 없으면 받은 tables 그대로다. applied = 쓴 판의 changeId(규칙표 차례 → 날짜 차례)
 */
export function withRuleUpdates(tables: Tables, updates: readonly RuleUpdate[]): { tables: Tables; applied: string[] } {
  const file = tables.rules
  const byId = new Map<string, RuleDef>()
  for (const rule of file.rules) if (!byId.has(rule.id)) byId.set(rule.id, rule)

  const byRule = new Map<string, Map<string, Picked>>()
  for (const u of Array.isArray(updates) ? (updates as readonly unknown[]) : []) {
    const picked = usable(file, byId, u)
    if (!picked) continue
    const days = byRule.get(picked.rule.id) ?? new Map<string, Picked>()
    days.set(picked.from, picked) // 같은 날짜는 뒤의 것이 이긴다
    byRule.set(picked.rule.id, days)
  }
  if (!byRule.size) return { tables, applied: [] }

  const rules: RuleDef[] = []
  const applied: string[] = []
  for (const rule of file.rules) {
    const days = byId.get(rule.id) === rule ? byRule.get(rule.id) : undefined
    if (!days) {
      rules.push(rule)
      continue
    }
    const list = [...days.values()].sort((a, b) => compareYmd(a.from, b.from))
    const end = addDays(list[0].from, -1)
    rules.push({ ...rule, effective_to: rule.effective_to !== null && compareYmd(rule.effective_to, end) < 0 ? rule.effective_to : end })
    list.forEach((v, i) => {
      rules.push({ ...v.rule, effective_from: v.from, effective_to: i + 1 < list.length ? addDays(list[i + 1].from, -1) : rule.effective_to })
      applied.push(v.changeId)
    })
  }
  return { tables: { ...tables, rules: { ...file, rules } }, applied }
}
