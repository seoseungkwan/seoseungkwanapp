import { beforeAll, describe, expect, it } from 'vitest'
import { monthOf } from '@/lib/analytics/dates'
import type { ClaimMonth, RuleDef, RuleUpdate, RxLine, Tables, Visit } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { NO_SETTINGS, runRules } from './rules/engine'
import { statusesOf } from './rules/status'
import { checkRuleChange, NAME_KEYS, nameKindOf, noAutoRuleIds, rulesCutoff, WAIVER_KEYS, withRuleUpdates } from './ruleUpdates'

// 고시로 바꾼 규칙 검사와 진료일별 판 합치기(specs/rule-auto REQ-7802·REQ-7803·AC-7807.1) [환자 자료 구역 안 순수 함수].
// 규칙표는 workers/precheck/tables.ts의 loadTables로만 부른다(AC-007.4). 진료는 손으로 만든 가짜(가상환자)다

let tables: Tables
beforeAll(async () => {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(loaded.code)
  tables = loaded.value
}, 60_000) // 약 표 JSON이 커서 바쁜 기계에서는 첫 읽기가 10초를 넘는다

type Rec = Record<string, unknown>
const FROM = '2026-12-01'

const ruleOf = (id: string): RuleDef => {
  const rule = tables.rules.rules.find((r) => r.id === id)
  if (!rule) throw new Error(`규칙표에 ${id}가 없다`)
  return rule
}
/** 고시로 고친 규칙 모양: 기본은 제목만 바꾸고 시행일을 넣는다(effective_to는 비움) */
const changed = (id: string, patch: Partial<RuleDef> = {}, from = FROM): RuleDef => ({
  ...ruleOf(id),
  title: `${ruleOf(id).title} (고시 반영)`,
  effective_from: from,
  effective_to: null,
  ...patch,
})
/** params 일부만 바꾼 사본(깊은 사본 위에 고친다) */
const withParams = (id: string, edit: (p: Rec) => void, patch: Partial<RuleDef> = {}): RuleDef => {
  const params = structuredClone(ruleOf(id).params) as Rec
  edit(params)
  return changed(id, { params, ...patch })
}
const check = (next: unknown, id = (next as RuleDef).id, current?: RuleDef) => checkRuleChange(tables.rules, ruleOf(id), current ?? ruleOf(id), next)
const update = (changeId: string, rule: RuleDef, patch: Partial<RuleUpdate> = {}): RuleUpdate => ({
  changeId,
  ruleId: rule.id,
  from: rule.effective_from as string,
  baseVersion: tables.rules.version,
  rule,
  ...patch,
})

/** params 안 첫 이름(이름 칸 값이나 regions. 길)을 없는 이름으로 바꾼 사본. 이름이 없으면 null */
function breakFirstName(params: Rec): Rec | null {
  const copy = structuredClone(params)
  let done = false
  const walk = (node: unknown, key: string | null): unknown => {
    if (done) return node
    if (typeof node === 'string') {
      if (key !== null && nameKindOf(key)) {
        done = true
        return 'zz_no_such_name'
      }
      if (node.startsWith('regions.')) {
        done = true
        return 'regions.zz_no_such_path'
      }
      return node
    }
    if (Array.isArray(node)) return node.map((x) => walk(x, key))
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) (node as Rec)[k] = walk(v, k)
    }
    return node
  }
  walk(copy, null)
  return done ? copy : null
}

describe('AC-7802.4 noAutoRuleIds — 저절로 못 바꾸는 규칙', () => {
  it('AC-7802.4: HY-12·DX-08·LA-23과 visit_fee·dx_master·claim_code 종류 규칙 모두가 들고 다른 규칙은 없다', () => {
    const expected = new Set(['HY-12', 'DX-08', 'LA-23'])
    for (const rule of tables.rules.rules) if (['visit_fee', 'dx_master', 'claim_code'].includes(rule.type)) expected.add(rule.id)
    expect(new Set(noAutoRuleIds(tables.rules))).toEqual(expected)
    expect(expected.size).toBeGreaterThan(40)
  })

  it('AC-7802.4: 다른 규칙이 exclude_pairs_covered_by로 가리키는 규칙(LA-24 → LA-23)이 들어 있다', () => {
    expect(ruleOf('LA-24').params.exclude_pairs_covered_by).toEqual(['LA-23'])
    expect(noAutoRuleIds(tables.rules).has('LA-23')).toBe(true)
    expect(noAutoRuleIds(tables.rules).has('LA-24')).toBe(false)
  })

  it("AC-7802.4·AC-7802.1: 저절로 못 바꾸는 규칙은 새 규칙이 무엇이든(이상한 값이어도) 먼저 'no-auto'다", () => {
    for (const id of ['HY-12', 'DX-08', 'LA-23', 'VF-01', 'DX-01', 'CL-01']) {
      expect(check(changed(id), id), id).toBe('no-auto')
      expect(check(null, id), id).toBe('no-auto')
    }
  })
})

describe('AC-7802.1 checkRuleChange — 검사 차례와 까닭 번호', () => {
  it("AC-7802.1: 제목만 바꾸고 시행일을 넣은 규칙은 'ok'이다", () => {
    expect(check(changed('LA-18'))).toBe('ok')
  })

  it.each([
    ['id', { id: 'LA-19' }],
    ['domain', { domain: '다른 분야' }],
    ['type', { type: 'interval' }],
    ['grade', { grade: '확인필요' }],
    ['confidence', { confidence: '하' }],
    ['data_needed', { data_needed: [] }],
    ['automatable', { automatable: 'no' }],
    ['stage', { stage: ['memo'] }],
    ['enabled_default', { enabled_default: false }],
    ['notes', { notes: '고친 메모' }],
  ] as [string, Partial<RuleDef>][])("AC-7802.1: 바꾸지 못하는 칸 %s가 원래 규칙과 다르면 'fixed'다", (_name, patch) => {
    expect(check(changed('LA-18', patch), 'LA-18')).toBe('fixed')
  })

  it("AC-7802.1: 규칙이 객체가 아니거나 바꾸지 못하는 칸이 빠지면 'fixed'다(던지지 않는다)", () => {
    for (const next of [null, undefined, 1, 'LA-18', [], {}]) expect(check(next, 'LA-18')).toBe('fixed')
    const missing = changed('LA-18') as Partial<RuleDef>
    delete missing.notes
    expect(check(missing, 'LA-18')).toBe('fixed')
  })

  it.each([
    ['effective_to가 null이 아님', { effective_to: '2027-12-31' }],
    ['effective_from이 null', { effective_from: null }],
    ['effective_from이 실제 날짜가 아님(2월 30일)', { effective_from: '2026-02-30' }],
    ['제목이 빈 글자', { title: ' ' }],
    ['params가 객체가 아님', { params: [] as unknown as Rec }],
    ['basis 모양이 다름', { basis: [{ doc: '고시' }] as unknown as RuleDef['basis'] }],
  ] as [string, Partial<RuleDef>][])("AC-7802.1: %s이면 'shape'다", (_name, patch) => {
    expect(check(changed('LA-18', patch), 'LA-18')).toBe('shape')
  })

  it("AC-7802.1: 16칸 밖의 칸이 있으면 'shape'다", () => {
    expect(check({ ...changed('LA-18'), extra: 1 }, 'LA-18')).toBe('shape')
  })

  it("AC-7802.1: 크기(기본값 14) — 제목 80자·글 300자까지는 지나고, 넘거나 params 4,000바이트·규칙 8,000바이트를 넘으면 'size'다", () => {
    expect(check(changed('LA-18', { title: '가'.repeat(80), message: '나'.repeat(300) }))).toBe('ok')
    expect(check(changed('LA-18', { title: '가'.repeat(81) }))).toBe('size')
    expect(check(changed('LA-18', { message: '나'.repeat(301) }))).toBe('size')
    // 크기는 이름 검사보다 먼저 본다(긴 낱말이라도 'names' 전에 'size')
    expect(check(withParams('LA-18', (p) => (p.count_unit = '다'.repeat(1400))))).toBe('size') // UTF-8 3바이트 × 1,400
    const basis = Array.from({ length: 80 }, (_, i) => ({ doc: `가짜 고시 ${'라'.repeat(20)}`, number: `제2026-${i}호` }))
    expect(check(changed('LA-18', { basis }))).toBe('size')
  })

  it("AC-7802.1: 여러 곳이 틀리면 정한 차례의 처음 것이다(fixed → shape → size → names)", () => {
    expect(check(changed('LA-18', { grade: '확인필요', effective_to: '2027-01-01', title: '가'.repeat(81) }), 'LA-18')).toBe('fixed')
    expect(check(changed('LA-18', { effective_to: '2027-01-01', title: '가'.repeat(81) }))).toBe('shape')
    expect(check(withParams('LA-18', (p) => (p.count_unit = 'dose'), { title: '가'.repeat(81) }))).toBe('size')
    expect(check(withParams('LA-18', (p) => ((p.thresholds = []), (p.count_unit = 'dose'))))).toBe('names')
  })

  it("AC-7802.1: 제목·글·params가 지금 판과 칸 차례만 다르고 같으면 'same'이다", () => {
    const base = ruleOf('LA-18')
    const reordered = Object.fromEntries(Object.entries(structuredClone(base.params)).reverse())
    ;(reordered.window as Rec) = { days: 7, type: 'rolling_days' }
    expect(check({ ...base, params: reordered, effective_from: FROM, effective_to: null })).toBe('same')
    // 지금 판(current)과 견준다: 원래 규칙과 같아도 지금 판과 다르면 'same'이 아니다
    const current = withParams('LA-18', (p) => ((p.thresholds as Rec[])[0].at = 5))
    expect(check({ ...current, effective_from: '2027-01-01' }, 'LA-18', current)).toBe('same')
    expect(check({ ...base, effective_from: '2027-01-01', effective_to: null }, 'LA-18', current)).toBe('ok')
  })
})

describe('AC-7802.2 checkRuleChange — 이름·칸 검사(names)', () => {
  it('AC-7802.2: 실제 규칙표의 저절로 바꿀 수 있는 규칙 모두는 제목만 바꾼 자기 자신이면 ok이다', () => {
    const noAuto = noAutoRuleIds(tables.rules)
    const auto = tables.rules.rules.filter((rule) => !noAuto.has(rule.id))
    const odd = auto.map((rule) => [rule.id, check(changed(rule.id))]).filter(([, code]) => code !== 'ok')
    expect(odd).toEqual([])
    expect(auto.length).toBeGreaterThan(200)
  })

  it("AC-7802.2: 그 규칙들의 이름 칸 하나를 없는 이름으로 바꾸면 모두 'names'다", () => {
    const noAuto = noAutoRuleIds(tables.rules)
    const broken = tables.rules.rules
      .filter((rule) => !noAuto.has(rule.id))
      .flatMap((rule) => {
        const params = breakFirstName(rule.params)
        return params ? [[rule.id, check(changed(rule.id, { params }))]] : []
      })
    expect(broken.filter(([, code]) => code !== 'names')).toEqual([])
    expect(broken.length).toBeGreaterThan(150)
  })

  it('AC-7802.2: NAME_KEYS가 실제 규칙표에서 값이 모두 이름표(코드 묶음·약 분류·아래 분류)에 있는 칸을 다 덮는다', () => {
    const file = tables.rules
    const groups = new Set(Object.keys(file.code_groups))
    const subs = new Set<string>()
    const classes = new Set(Object.keys(file.drug_classes))
    for (const [name, spec] of Object.entries(file.drug_classes)) {
      const subgroups = (spec as Rec).subgroups
      if (subgroups && typeof subgroups === 'object') {
        for (const sub of Object.keys(subgroups)) {
          subs.add(sub)
          classes.add(`${name}.${sub}`)
        }
      }
    }
    // 칸 이름 → 그 칸의 글자 값(글자 하나 또는 글자 목록)
    const values = new Map<string, string[]>()
    const walk = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(walk)
      else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          const list = typeof v === 'string' ? [v] : Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : []
          values.set(k, [...(values.get(k) ?? []), ...list])
          walk(v)
        }
      }
    }
    for (const rule of file.rules) walk(rule.params)
    const nameKeys: [string, string][] = []
    for (const [key, list] of values) {
      if (!list.length) continue
      if (list.every((x) => groups.has(x))) nameKeys.push([key, 'group'])
      else if (list.every((x) => classes.has(x))) nameKeys.push([key, 'class'])
      else if (list.every((x) => subs.has(x))) nameKeys.push([key, 'sub'])
    }
    expect(nameKeys.filter(([key, kind]) => nameKindOf(key) !== kind)).toEqual([])
    expect(nameKeys.length).toBeGreaterThan(15)
    // design 4절의 이름 칸
    expect(NAME_KEYS.group).toEqual(['code_groups', 'code_groups_any', 'codes_any_group', 'codes_any_groups', 'pairs_group'])
    for (const key of ['drug_class', 'drug_classes', 'drug_classes_any', 'require_drug_classes_any', 'forbidden_drug_classes_any']) expect(nameKindOf(key)).toBe('class')
    expect(nameKindOf('subgroups')).toBe('sub')
    for (const key of ['codes', 'target', 'for', 'regex_key', 'dx_prefixes']) expect(nameKindOf(key)).toBeNull()
  })

  it("AC-7802.2 (a): 맨 위 칸이 같은 종류 규칙들이 쓰지 않는 칸이거나, 원래 칸의 JSON 종류가 다르면 'names'다", () => {
    const countWindowKeys = new Set(tables.rules.rules.filter((r) => r.type === 'count_window').flatMap((r) => Object.keys(r.params)))
    expect(countWindowKeys.has('days')).toBe(false) // 'days'는 LA-18 window 안에만 있는 낱말
    expect(check(withParams('LA-18', (p) => (p.days = 14)))).toBe('names')
    expect(check(withParams('LA-18', (p) => (p.thresholds = {})))).toBe('names')
    expect(check(withParams('LA-18', (p) => (p.window = [])))).toBe('names')
    expect(check(withParams('LA-18', (p) => (p.count_unit = 1)))).toBe('names')
    expect(check(withParams('LA-18', (p) => (p.group_by = null)))).toBe('names')
  })

  it("AC-7802.2 (b): 없는 코드 묶음·약 분류·아래 분류·pairs 없는 묶음·찾을 수 없는 regions. 길이면 'names'다", () => {
    expect(check(withParams('LA-18', (p) => ((p.target as Rec).code_groups = ['la_all', 'zz_group'])))).toBe('names')
    expect(check(withParams('IJ-02', (p) => ((p.drug_condition as Rec).drug_classes_any = ['steroid_injection', 'zz_class'])))).toBe('names')
    expect(check(withParams('OP-05', (p) => ((p.target as Rec).drug_classes = ['osteoporosis.zz_sub'])))).toBe('names')
    expect(check(withParams('IJ-05', (p) => (p.acceptable_with = ['steroid_injection', 'zz_class'])))).toBe('names')
    // 아래 분류는 그 규칙이 고른 약 분류(gi_protectant)의 것이어야 한다(osteoporosis의 bisphosphonate는 아님)
    expect(check(withParams('DR-12', (p) => (p.subgroups = [...(p.subgroups as string[]), 'bisphosphonate'])))).toBe('names')
    expect(check(withParams('DR-12', (p) => (p.subgroups = (p.subgroups as string[]).slice(0, 3))))).not.toBe('names')
    // pairs_group은 pairs가 있는 묶음만(la_all에는 pairs가 없다)
    expect(check(withParams('LA-10', (p) => (p.pairs_group = 'la_all')))).toBe('names')
    expect(check(withParams('LA-10', (p) => (p.pairs_group = 'la_subblock_pairs')))).not.toBe('names')
    expect(check(withParams('LA-22', (p) => (((p.required_all as Rec[])[0].regex_key = 'regions.chart_keywords.zz_none'))))).toBe('names')
    expect(check(withParams('LA-22', (p) => (((p.required_all as Rec[])[0].regex_key = 'regions.constructor'))))).toBe('names')
    // 이름 칸 값이 글자가 아니면 'names'
    expect(check(withParams('LA-18', (p) => ((p.target as Rec).code_groups = ['la_all', { name: 'tfesi' }])))).toBe('names')
  })

  it("AC-7802.2 (b)·(e): 'regions.'로 시작하는 설명 글(길 모양이 아님)은 길로 찾지 않고, 원래 있던 글 그대로일 때만 지난다", () => {
    expect(ruleOf('IJ-17').params.dx_region).toBe('regions.kcd_prefix_map + kcd_fifth_char_rules')
    expect(check(changed('IJ-17'))).toBe('ok')
    expect(check(withParams('IJ-17', (p) => (p.dx_region = 'regions.kcd_prefix_map + 새 설명')))).toBe('names')
    expect(check(withParams('IJ-17', (p) => (p.procedure_region = 'regions.chart_site_map 그리고 더')))).toBe('names')
    // 길 모양이면 찾아져야 한다(찾아지는 길은 names를 지나고, 글자 잎 바꿈이라 허용 모양(AC-7802.3 (4))의 'removed'에서 멈춘다)
    expect(check(withParams('IJ-17', (p) => (p.dx_region = 'regions.kcd_prefix_map')))).toBe('removed')
    expect(check(withParams('IJ-17', (p) => (p.dx_region = 'regions.kcd_prefix_mapp')))).toBe('names')
  })

  it("AC-7802.2 (b): 이름표에 있는 코드 묶음·약 분류(약 분류.아래 분류 포함)를 더하면 names는 지나고, 허용 모양(AC-7802.3 (4))에서 'removed'다", () => {
    expect(check(withParams('LA-18', (p) => ((p.target as Rec).code_groups = ['la_all', 'tfesi', 'la_carm_required'])))).toBe('removed')
    expect(check(withParams('OP-05', (p) => ((p.target as Rec).drug_classes = ['osteoporosis.denosumab', 'osteoporosis.zoledronic_acid'])))).toBe('removed')
  })

  it("AC-7802.2 (c): codes는 규칙표가 아는 코드(대문자로 맞춤)만, 상병 앞자리는 ^[A-Z][0-9A-Z]{0,5}$만 지난다", () => {
    expect(check(withParams('IJ-02', (p) => ((p.target as Rec).codes = ['KK090', 'ZZ999'])))).toBe('names')
    // 아는 코드·맞는 앞자리는 names를 지나고, 목록이 늘어 허용 모양(AC-7802.3 (4))의 'removed'다
    expect(check(withParams('IJ-02', (p) => ((p.target as Rec).codes = ['KK090', 'kk062'])))).toBe('removed') // KK062는 IJ-05가 쓰는 코드
    expect(check(withParams('IJ-02', (p) => ((p.target as Rec).codes = 'KK090')))).toBe('names')
    expect(check(withParams('LA-26', (p) => (p.dx_prefixes = [...(p.dx_prefixes as string[]), 'M54'])))).toBe('removed')
    for (const bad of ['m54', 'M54.5', 'M5456789', '5M4', '', 1]) {
      expect(check(withParams('LA-26', (p) => (p.dx_prefixes = [...(p.dx_prefixes as string[]), bad]))), String(bad)).toBe('names')
    }
    // 객체 안 목록도 본다(ES-03 forbidden_dx_prefixes: 이름 → 앞자리 목록)
    expect(check(withParams('ES-03', (p) => ((p.forbidden_dx_prefixes as Rec)['악성 종양'] = ['C', 'D0'])))).toBe('removed')
    expect(check(withParams('ES-03', (p) => ((p.forbidden_dx_prefixes as Rec)['악성 종양'] = ['c'])))).toBe('names')
    expect(check(withParams('ES-03', (p) => ((p.forbidden_dx_prefixes as Rec)['새 금기'] = ['C'])))).toBe('names') // 새 열쇠 낱말(e)
  })

  it("AC-7802.2 (d): regex로 끝나는 칸은 (?i)를 뗀 뒤 정규식으로 만들어지고 300자 이하여야 이름 검사(names)를 지난다", () => {
    const set = (value: unknown) => withParams('PH-15', (p) => ((p.target as Rec).name_regex = value))
    expect(check(set((ruleOf('PH-15').params.target as Rec).name_regex))).toBe('ok')
    // 만들어지는 정규식은 names를 지나고, 원래 글과 달라 다음 차례(AC-7802.3 정규식 칸)의 'removed'에서 멈춘다
    expect(check(set('(?i)이온|ionto|새로운낱말'))).toBe('removed')
    expect(check(set('a'.repeat(300)))).toBe('removed')
    expect(check(set('(?i)이온삼투('))).toBe('names')
    expect(check(set('a'.repeat(301)))).toBe('names')
    expect(check(set(3))).toBe('names')
  })

  it("AC-7802.2 (e): 새 낱말(글자 값·객체 열쇠)은 원래 규칙이나 지금 판 params 어딘가에 이미 있어야 한다", () => {
    expect(check(withParams('LA-18', (p) => (p.count_unit = 'dose')))).toBe('names') // 다른 규칙의 낱말이라도 이 규칙에 없으면
    expect(check(withParams('LA-18', (p) => ((p.window as Rec).new_key = 7)))).toBe('names')
    expect(check(withParams('LA-18', (p) => ((p.thresholds as Rec[])[0].message = '새로 지은 글')))).toBe('names')
    // 이 규칙 안의 낱말이면 names는 지나고, 글자 잎 바꿈이라 허용 모양(AC-7802.3 (4))의 'removed'다
    expect(check(withParams('LA-18', (p) => (p.group_by = 'visit_day')))).toBe('removed')
    // 지금 판(current)에 있는 낱말도 된다
    const current = withParams('LA-18', (p) => (p.count_unit = 'dose'), { effective_from: '2026-11-01' })
    const next = withParams('LA-18', (p) => (p.count_unit = 'dose'), { title: '다시 고친 제목' })
    expect(check(next, 'LA-18')).toBe('names')
    expect(check(next, 'LA-18', current)).toBe('ok')
  })
})

describe('AC-7802.3 checkRuleChange — 뺀 것(removed)·등급(grade)', () => {
  it("AC-7802.3: 숫자(횟수·날짜 수·개월)만 바꾸면 지난다", () => {
    expect(check(withParams('LA-18', (p) => ((p.thresholds as Rec[])[0].at = 5)))).toBe('ok')
    expect(check(withParams('LA-18', (p) => ((p.window as Rec).days = 14)))).toBe('ok')
    expect(check(withParams('HY-08', (p) => (p.min_days = 14)))).toBe('ok')
  })

  it("AC-7802.3: 규칙이 보던 코드·묶음·약 분류·차트 낱말 길·상병 앞자리를 빼면 'removed'다", () => {
    expect(check(withParams('LA-18', (p) => ((p.target as Rec).code_groups = ['la_all'])))).toBe('removed')
    expect(check(withParams('IJ-05', (p) => ((p.target as Rec).codes = ['KK090'])))).toBe('removed')
    expect(check(withParams('IJ-05', (p) => (p.acceptable_with = ['steroid_injection'])))).toBe('removed')
    expect(check(withParams('LA-26', (p) => (p.dx_prefixes = (p.dx_prefixes as string[]).slice(1))))).toBe('removed')
    // 있는 다른 길로 바꿔도 원래 길이 빠지면 뺀 것이다
    expect(check(withParams('LA-22', (p) => ((p.required_all as Rec[])[0].regex_key = 'regions.chart_keywords.response_prev')))).toBe('removed')
    // 묶음을 칸 사이로 옮기는 것은 빼는 것이 아니다
    expect(check(withParams('LA-18', (p) => ((p.target as Rec).code_groups = ['tfesi', 'la_all'])))).toBe('ok')
  })

  it("AC-7802.3: 지금 판(current)에 더해진 이름을 다시 빼도 'removed'다", () => {
    const current = withParams('LA-18', (p) => ((p.target as Rec).code_groups = ['la_all', 'tfesi', 'la_carm_required']), { effective_from: '2026-11-01' })
    expect(check(changed('LA-18'), 'LA-18', current)).toBe('removed')
  })

  it("AC-7802.3: params 안 grade 값들을 정렬한 목록이 원래 규칙과 다르면 'grade'다 — 등급 글을 바꾸거나 기준을 빼면 허용 모양(4)이 먼저 'removed'", () => {
    const thresholds = (p: Rec) => p.thresholds as Rec[]
    const graded = (p: Rec) => thresholds(p).forEach((t) => (t.grade = '확인필요'))
    expect(check(withParams('IJ-02', graded))).toBe('removed') // 글자 잎 바꿈
    expect(check(withParams('IJ-02', (p) => (p.thresholds = [thresholds(p)[0]])))).toBe('removed') // 배열 길이 바뀜
    expect(check(withParams('IJ-02', (p) => ([thresholds(p)[0].grade, thresholds(p)[1].grade] = [thresholds(p)[1].grade, thresholds(p)[0].grade])))).toBe('removed') // 객체 배열은 자리끼리
    // 등급은 지금 판이 아니라 원래 규칙과 견준다: 지금 판이 이미 다른 등급이면(모양은 지금 판과 같아도) 'grade'
    const current = withParams('IJ-02', graded, { effective_from: '2026-11-01' })
    expect(check(withParams('IJ-02', graded, { title: '다시 고친 제목' }), 'IJ-02', current)).toBe('grade')
  })

  it("AC-7802.3: 열쇠 이름이 grade로 끝나는 칸(exception_grade·older_history_grade 등)도 등급 목록에 들어 다르면 'grade'다", () => {
    // LA-17 예외 상병일 때 등급(exception_grade)을 바꾸면 'ok'가 아니다(새 낱말이라 차례상 names가 먼저 걸린다)
    expect(ruleOf('LA-17').params.exception_grade).toBe('참고')
    expect(check(withParams('LA-17', (p) => (p.exception_grade = '확인필요')))).not.toBe('ok')
    // 그 칸을 빼면 칸이 없어져 'removed'
    const dropped = (p: Rec) => {
      delete p.exception_grade
    }
    expect(check(withParams('LA-17', dropped))).toBe('removed')
    // HD-02 오래된 이력 등급 참고 → 확인필요: 글자 잎 바꿈이라 'removed'. 지금 판이 이미 그 등급이면 원래 규칙과 견주어 'grade'
    const older = (p: Rec) => ((p.window as Rec).older_history_grade = '확인필요')
    expect(check(withParams('HD-02', older))).toBe('removed')
    expect(check(withParams('HD-02', older, { title: '다시 고친 제목' }), 'HD-02', withParams('HD-02', older, { effective_from: '2026-11-01' }))).toBe('grade')
    expect(check(withParams('LA-17', dropped, { title: '다시 고친 제목' }), 'LA-17', withParams('LA-17', dropped, { effective_from: '2026-11-01' }))).toBe('grade')
  })

  it('AC-7802.3: WAIVER_KEYS는 design 4절의 낱말 열셋이다(열쇠 이름 어디에든 들면 비켜 주는 칸)', () => {
    expect(WAIVER_KEYS).toEqual(['acceptable', 'allow', 'exception', 'exclu', 'exempt', 'skip', 'unless', 'pass_if', 'not_', 'downgrade', 'uncertain', 'waive', 'ignore'])
  })

  it("AC-7802.3: 이름 가운데에 그 낱말이 든 칸(not_applicable·region_split_exempt·dx_uncertain·dx_prefixes_not_counting·downgrade_…)도 값을 늘리거나 바꾸면 'ok'가 아니다", () => {
    // 이 규칙에 없던 낱말이면 차례상 names가 먼저, 이 규칙 안에 이미 있는 낱말이면(names를 지나면) 비켜 주는 칸 검사의 'removed'다
    // LA-15 조영제 요건에서 빼 주는 코드(not_applicable)
    expect(ruleOf('LA-15').params.not_applicable).toEqual(['LA358', 'LA352'])
    expect(check(withParams('LA-15', (p) => (p.not_applicable = ['LA358', 'LA352', 'LA351'])))).not.toBe('ok')
    expect(check(withParams('LA-15', (p) => (p.not_applicable = ['LA358', 'LA352', 'contrast'])))).toBe('removed')
    // LA-04 부위 나눔에서 빼 주는 코드(region_split_exempt)
    expect(ruleOf('LA-04').params.region_split_exempt).toEqual(['LA357'])
    expect(check(withParams('LA-04', (p) => (p.region_split_exempt = ['LA357', 'LA358'])))).not.toBe('ok')
    expect(check(withParams('LA-04', (p) => (p.region_split_exempt = ['LA357', 'LS'])))).toBe('removed')
    // LA-29 필수 상병으로 세지 않는 앞자리(dx_prefixes_not_counting): 더함·바꿈
    expect(ruleOf('LA-29').params.dx_prefixes_not_counting).toEqual(['M80', 'M81'])
    expect(check(withParams('LA-29', (p) => (p.dx_prefixes_not_counting = ['M80', 'M81', 'M85'])))).not.toBe('ok')
    expect(check(withParams('LA-29', (p) => (p.dx_prefixes_not_counting = ['M80', 'M81', 'R51'])))).toBe('removed')
    expect(check(withParams('LA-29', (p) => (p.dx_prefixes_not_counting = ['R52', 'M81'])))).toBe('removed')
    // VD-01·OP-07 상병 불확실(dx_uncertain): 참 → 거짓
    expect(ruleOf('VD-01').params.dx_uncertain).toBe(true)
    expect(check(withParams('VD-01', (p) => (p.dx_uncertain = false)))).toBe('removed')
    expect(check(withParams('OP-07', (p) => ((p.any_evidence as Rec).dx_uncertain = false)))).toBe('removed')
    // LA-28 차트 증상이 시술 부위와 맞으면 낮추는 칸(downgrade_…): 값 바꿈
    expect(ruleOf('LA-28').params.downgrade_if_chart_symptom_matches_procedure_region).toBe('참고')
    expect(check(withParams('LA-28', (p) => (p.downgrade_if_chart_symptom_matches_procedure_region = '알림')))).not.toBe('ok')
    expect(check(withParams('LA-28', (p) => (p.downgrade_if_chart_symptom_matches_procedure_region = 'main')))).toBe('removed')
    // 빼는 것은 비켜 주는 칸 검사는 지나지만 배열 길이가 바뀌어 허용 모양(4)의 'removed'다
    expect(check(withParams('LA-15', (p) => (p.not_applicable = ['LA358'])))).toBe('removed')
  })

  it("AC-7802.3 (2-2): params 안 어디든 참거짓 값이 원래 규칙·지금 판의 같은 자리 값과 다르면 'removed'다", () => {
    expect(check(withParams('LA-26', (p) => (p.gosi_strict = true)))).toBe('removed') // 거짓 → 참
    expect(check(withParams('HY-01', (p) => (p.gosi_strict = false)))).toBe('removed') // 참 → 거짓
    expect(check(withParams('LA-16', (p) => ((p.sam_check as Rec).flag_if_count_le_15_and_Z = false)))).toBe('removed') // 객체 안
    expect(check(withParams('IJ-20', (p) => ((p.condition as Rec).kk090_absent = false)))).toBe('removed')
    // 참거짓이 없던 자리에 참거짓(LA-16 sam_check.code_length 8 → 참)
    expect(check(withParams('LA-16', (p) => ((p.sam_check as Rec).code_length = true)))).toBe('removed')
    // 같은 자리 같은 값이면 지나고, 지금 판의 같은 자리 값과 같아도 된다
    expect(check(withParams('LA-16', (p) => ((p.sam_check as Rec).position = 7)))).toBe('ok')
    const current = withParams('LA-26', (p) => (p.gosi_strict = true), { effective_from: '2026-11-01' })
    expect(check(withParams('LA-26', (p) => (p.gosi_strict = true), { title: '다시 고친 제목' }), 'LA-26', current)).toBe('ok')
  })

  it("AC-7802.3 (2-2): 실제 규칙표의 저절로 바꿀 수 있는 규칙 안 참거짓 값 하나를 뒤집으면 모두 'removed'다", () => {
    const noAuto = noAutoRuleIds(tables.rules)
    // params 안 참거짓 자리(열쇠·번호 길) 모두
    const boolPaths = (node: unknown, path: (string | number)[] = []): (string | number)[][] => {
      if (typeof node === 'boolean') return [path]
      if (Array.isArray(node)) return node.flatMap((x, i) => boolPaths(x, [...path, i]))
      if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => boolPaths(v, [...path, k]))
      return []
    }
    const flipped = tables.rules.rules
      .filter((rule) => !noAuto.has(rule.id))
      .flatMap((rule) =>
        boolPaths(rule.params).map((path) => {
          const next = withParams(rule.id, (p) => {
            let node = p as Record<string | number, unknown>
            for (const step of path.slice(0, -1)) node = node[step] as Record<string | number, unknown>
            const last = path[path.length - 1]
            node[last] = !node[last]
          })
          return [`${rule.id}:${path.join('.')}`, check(next)]
        }),
      )
    expect(flipped.filter(([, code]) => code !== 'removed')).toEqual([])
    expect(flipped.length).toBeGreaterThan(60)
  })

  it("AC-7802.3: 비켜 주는 칸(WAIVER_KEYS)에 원래 규칙·지금 판의 같은 이름 칸에 없던 잎 값이 있으면 'removed'다 — 이름 더함·숫자 바꿈·참으로 바꿈", () => {
    // DR-02: NSAID 쪽에서 빼 주는 약 분류(exclude_drug_classes)에 이름표에 있는 약 분류를 더함
    expect(check(withParams('DR-02', (p) => ((p.b as Rec).exclude_drug_classes = ['ketorolac', 'acetaminophen'])))).toBe('removed')
    // 같은 열쇠 이름 칸에 없던 값이면 같은 규칙 다른 칸(drug_classes)에 있는 이름이라도 'removed'
    expect(check(withParams('DR-02', (p) => ((p.b as Rec).exclude_drug_classes = ['ketorolac', 'nsaid'])))).toBe('removed')
    // IJ-05: 국소마취제와 같이 있어도 되는 약 분류(acceptable_with)에 이름 더함
    expect(check(withParams('IJ-05', (p) => (p.acceptable_with = ['steroid_injection', 'viscosupplement_any', 'local_anesthetic'])))).toBe('removed')
    // LA-21: 정중앙 코드만 빼 주던 skip_for_midline을 참으로(모두 빼 줌)
    expect(check(withParams('LA-21', (p) => ((p.required_all as Rec[])[1].skip_for_midline = true)))).toBe('removed')
    // PH-19: 예외(exception) 안 숫자 바꿈(첫날부터 14일 → 21일)
    expect(check(withParams('PH-19', (p) => ((p.exception as Rec).max_days_from_first = 21)))).toBe('removed')
    // 차례(AC-7802.1): removed가 grade보다 먼저다
    expect(
      check(
        withParams('DR-02', (p) => {
          ;(p.b as Rec).exclude_drug_classes = ['ketorolac', 'acetaminophen']
          ;(p.outcomes as Rec[])[0].grade = '확인필요'
        }),
      ),
    ).toBe('removed')
  })

  it('AC-7802.3: 비켜 주는 칸에서 자리만 바꾸면 지나고 지금 판(current)의 같은 칸 값도 되지만, 값을 빼면 허용 모양(4)의 removed다', () => {
    expect(check(withParams('LA-21', (p) => ((p.required_all as Rec[])[1].skip_for_midline = ['LA321', 'LA322'])))).toBe('removed')
    expect(check(withParams('HY-02', (p) => (p.allowed_sites = ['knee'])))).toBe('removed')
    expect(check(withParams('PH-01', (p) => (p.not_in_set_a = (p.not_in_set_a as string[]).slice(1))))).toBe('removed')
    expect(check(withParams('IJ-05', (p) => (p.acceptable_with = ['viscosupplement_any', 'steroid_injection'])))).toBe('ok')
    const wider = (p: Rec) => (p.acceptable_with = ['steroid_injection', 'viscosupplement_any', 'local_anesthetic'])
    const current = withParams('IJ-05', wider, { effective_from: '2026-11-01' })
    expect(check(withParams('IJ-05', wider, { title: '다시 고친 제목' }), 'IJ-05', current)).toBe('ok')
  })

  it("AC-7802.3: regex로 끝나는 칸의 글이 원래 규칙·지금 판의 같은 이름 칸 글 어느 것과도 다르면 'removed'다(넓힘·좁힘 모두)", () => {
    const pass = (value: unknown, patch: Partial<RuleDef> = {}) => withParams('XR-01', (p) => (p.pass_if_regex = value), patch)
    const was = ruleOf('XR-01').params.pass_if_regex
    expect(was).toBe('(?i)각각|따로|separate|좌우\\s*각')
    expect(check(pass(was))).toBe('ok')
    expect(check(pass('(?i)각각|따로|separate|좌우\\s*각|양측'))).toBe('removed')
    expect(check(pass('(?i)각각|따로'))).toBe('removed')
    // 비켜 주는 칸이 아닌 regex 칸도 같다(PH-15 이름 정규식)
    expect(check(withParams('PH-15', (p) => ((p.target as Rec).name_regex = '(?i)이온삼투|iontophor|ionto')))).toBe('removed')
    // 지금 판의 같은 이름 칸 글이면 지난다
    const current = pass('(?i)각각|따로', { effective_from: '2026-11-01' })
    expect(check(pass('(?i)각각|따로', { title: '다시 고친 제목' }), 'XR-01', current)).toBe('ok')
  })

  it("AC-7802.3 (4): 허용 모양 — 코드 묶음 더함·참거짓 칸 지움·목록 줄임은 'removed'다(숫자·글만 저절로)", () => {
    // MN-08 같은 날 짝(set_b) 묶음에 이름표에 있는 묶음을 더함
    expect((ruleOf('MN-08').params.set_b as Rec).code_groups).toEqual(['pt_exercise'])
    expect(check(withParams('MN-08', (p) => ((p.set_b as Rec).code_groups = ['pt_exercise', 'eswt_clinic'])))).toBe('removed')
    // IJ-11 좌우 기록 없으면 걸던 참거짓 칸을 지움
    expect(ruleOf('IJ-11').params.flag_if_side_missing).toBe(true)
    const noFlag = (p: Rec) => {
      delete p.flag_if_side_missing
    }
    expect(check(withParams('IJ-11', noFlag))).toBe('removed')
    // IJ-09 이름 칸이 아닌 목록(joint_sites) 줄임
    expect(check(withParams('IJ-09', (p) => (p.joint_sites = (p.joint_sites as string[]).slice(0, 2))))).toBe('removed')
    // LA-29 비켜 주는 칸 목록 줄임(M81을 다시 필수 상병으로 셈)
    expect(check(withParams('LA-29', (p) => (p.dx_prefixes_not_counting = ['M80'])))).toBe('removed')
    // 이 규칙 안 낱말로 칸을 더해도(names는 지남) 칸이 생겨 'removed'
    expect(check(withParams('LA-18', (p) => ((p.window as Rec).group_by = 'lesion_group')))).toBe('removed')
    // 숫자를 null로(값 종류 바뀜)
    expect(check(withParams('LA-18', (p) => ((p.window as Rec).days = null)))).toBe('removed')
    // 객체 배열에 기준을 더함(배열 길이 바뀜)
    expect(check(withParams('MN-03', (p) => (p.thresholds = [...(p.thresholds as Rec[]), { at: 4, grade: '확인필요' }])))).toBe('removed')
  })

  it("AC-7802.3 (4): 허용 모양 — 비켜 주는 칸 밖 숫자만 바꾸거나, 글자만 든 목록 차례·칸 차례만 바꾸면 지난다", () => {
    // 숫자 여럿을 한꺼번에(객체 배열 안 at 포함)
    expect(
      check(
        withParams('IJ-02', (p) => {
          ;(p.window as Rec).days = 300
          ;(p.thresholds as Rec[])[0].at = 3
          ;(p.thresholds as Rec[])[1].at = 4
        }),
      ),
    ).toBe('ok')
    expect(check(withParams('MN-03', (p) => ((p.thresholds as Rec[])[0].at = 4)))).toBe('ok')
    expect(check(withParams('LA-17', (p) => ((p.max_period as Rec).calendar_months = 3)))).toBe('ok')
    // 글자만 든 목록은 차례를 무시한다
    expect(check(withParams('IJ-09', (p) => (p.joint_sites = [...(p.joint_sites as string[])].reverse())))).toBe('ok')
    // 비켜 주는 칸 안 숫자는 안 된다(PH-19 exception.max_days_from_first)
    expect(check(withParams('PH-19', (p) => ((p.exception as Rec).max_days_from_first = 7)))).toBe('removed')
    // 지금 판과 견준다: 지금 판의 숫자에서 다시 숫자만 바꾸면 지난다(숫자 한도 (5) 안)
    const current = withParams('IJ-02', (p) => ((p.window as Rec).days = 300), { effective_from: '2026-11-01' })
    expect(check(withParams('IJ-02', (p) => ((p.window as Rec).days = 250)), 'IJ-02', current)).toBe('ok')
  })

  it("AC-7802.3 (5): 숫자 한도 — 바뀐 숫자는 원래 규칙 값의 절반~2배(끝 값 포함)여야 지나고, 밖이면 'removed'다", () => {
    const at = (n: number) => withParams('LA-18', (p) => ((p.thresholds as Rec[])[0].at = n))
    expect((ruleOf('LA-18').params.thresholds as Rec[])[0].at).toBe(4)
    for (const n of [2, 3, 5, 8]) expect(check(at(n)), String(n)).toBe('ok') // 0.5배·2배 끝 값 포함
    for (const n of [400, 1, 9, 1.9, 0, -4]) expect(check(at(n)), String(n)).toBe('removed')
    // 객체 안 숫자도(LA-17 max_period.calendar_months 2 → 1·4는 지나고 5는 아님)
    const months = (n: number) => withParams('LA-17', (p) => ((p.max_period as Rec).calendar_months = n))
    expect(check(months(1))).toBe('ok')
    expect(check(months(4))).toBe('ok')
    expect(check(months(5))).toBe('removed')
    // 원래 값이 0이면 0이어야 한다(LA-03 tolerance)
    expect(ruleOf('LA-03').params.tolerance).toBe(0)
    expect(check(withParams('LA-03', (p) => (p.tolerance = 0.1)))).toBe('removed')
  })

  it("AC-7802.3 (5): 숫자 한도는 지금 판이 아니라 늘 원래 규칙과 견준다 — 앞 판이 2배로 늘린 뒤 다시 2배(원래의 4배)는 'removed'다", () => {
    const at = (n: number, patch: Partial<RuleDef> = {}) => withParams('LA-18', (p) => ((p.thresholds as Rec[])[0].at = n), patch)
    const current = at(8, { effective_from: '2026-11-01' })
    expect(check(current)).toBe('ok')
    expect(check(at(16, { title: '다시 고친 제목' }), 'LA-18', current)).toBe('removed')
    expect(check(at(6, { title: '다시 고친 제목' }), 'LA-18', current)).toBe('ok')
    // 원래 규칙에 없는 자리의 숫자를 바꾸면(지금 판에만 있는 칸) 'removed'
    const extra = withParams('LA-18', (p) => ((p.window as Rec).at = 3), { effective_from: '2026-11-01' })
    expect(check(withParams('LA-18', (p) => ((p.window as Rec).at = 4), { title: '다시 고친 제목' }), 'LA-18', extra)).toBe('removed')
  })
})

describe('AC-7802.4 checkRuleChange — 자동 점검 상태(status)', () => {
  it("AC-7802.4: 새 규칙의 상태가 원래 규칙과 다르면 'status'다(count_window 기준에서 횟수 at를 비우면 이력 점검 → 수동)", () => {
    expect(statusesOf(tables.rules).get('LA-18')).toBe('hist')
    // 원래 규칙에서 thresholds를 비우거나 at를 빼면 배열 길이·칸이 바뀌어 차례상 허용 모양(AC-7802.3 (4))의 'removed'가 먼저다(둘 다 사람 확인)
    const noAt = (p: Rec) => (p.thresholds = [{ grade: '알림' }])
    expect(check(withParams('LA-18', (p) => (p.thresholds = [])))).toBe('removed')
    expect(check(withParams('LA-18', noAt))).toBe('removed')
    // 상태는 지금 판이 아니라 원래 규칙과 견준다: 지금 판이 이미 at 없는 모양이면(모양은 지금 판과 같아도) 'status'
    expect(check(withParams('LA-18', noAt, { title: '다시 고친 제목' }), 'LA-18', withParams('LA-18', noAt, { effective_from: '2026-11-01' }))).toBe('status')
  })
})

describe('AC-7807.1 rulesCutoff — 규칙표 날짜', () => {
  it("AC-7807.1: 실제 rules.json은 '2026-10-19'이다", () => {
    expect(rulesCutoff(tables.rules.version)).toBe('2026-10-19')
  })

  it.each([
    ['2026-10-19', '2026-10-19'],
    ['2026-10-19b', '2026-10-19'],
    ['2026-10-19 조사', '2026-10-19'],
    ['2026-02-30', null],
    ['20261019', null],
    ['v1', null],
    ['', null],
  ])('AC-7807.1: version %s → %s', (version, cutoff) => {
    expect(rulesCutoff(version)).toBe(cutoff)
  })

  it('AC-7807.1: 글자가 아니어도 던지지 않고 null이다', () => {
    expect(rulesCutoff(null as unknown as string)).toBeNull()
  })
})

// 손으로 만든 진료(가상환자)로 점검 모양을 만든다(engine.test.ts와 같은 틀)
type VisitSeed = { key: string; chart: string; date: string }
function month(seeds: VisitSeed[]): ClaimMonth {
  const rxByDay: ClaimMonth['rxByDay'] = new Map()
  const rxDayOrder: ClaimMonth['rxDayOrder'] = []
  const visits: Visit[] = seeds.map(({ key, chart, date }) => {
    const rx: RxLine[] = [{ code: 'KR006', name: '도수치료', qty: 1, benefit: true, pay: '급여' }]
    const days = rxByDay.get(chart) ?? new Map<string, RxLine[]>()
    days.set(date, rx)
    rxByDay.set(chart, days)
    rxDayOrder.push(rx)
    return {
      key,
      chart,
      date,
      month: monthOf(date),
      name: '가상환자01',
      lines: ['도수'],
      hints: [null],
      rx,
      dx: [{ c: 'M5456', n: '', m: true, s: '', d: '', t: '' }],
      memosInBit: [],
    }
  })
  return {
    period: { from: '2026-10-01', to: '2026-10-31' },
    visits,
    history: new Map(),
    historyRange: { from: '2025-10-01', to: '2026-10-31' },
    rxByDay,
    rxDayOrder,
    dxTrend: { from: '2025-11-01', to: '2026-11-01', visits: 0, codes: new Map(), suggestions: [] },
    catalog: { codes: [], la: [] },
    hasDx: true,
  }
}

describe('AC-7803.1·AC-7803.4 withRuleUpdates — 쓸 판 거르기', () => {
  const okRule = () => withParams('LA-18', (p) => ((p.thresholds as Rec[])[0].at = 5))
  const good = () => update('c-ok', okRule())

  it('AC-7803.1: 규칙표 판·규칙 번호·날짜·규칙 모양·검사(ok·same)가 맞는 판만 쓰고 applied는 쓴 판의 changeId다. 나머지는 던지지 않고 버린다', () => {
    const ok = good()
    const rule = okRule()
    const list = [
      ok,
      { ...ok, changeId: 'c-version', baseVersion: '2099-01-01' },
      { ...ok, changeId: 'c-unknown', ruleId: 'ZZ-99', rule: { ...rule, id: 'ZZ-99' } },
      { ...ok, changeId: 'c-date', from: '2026-02-30', rule: { ...rule, effective_from: '2026-02-30' } },
      { ...ok, changeId: 'c-rule-id', ruleId: 'LA-36' },
      { ...ok, changeId: 'c-from', from: '2026-12-02' },
      update('c-no-auto', changed('HY-12')),
      // 원래 규칙과 같은 판('same')은 쓴다(앞 판을 끝내는 되돌림 판일 수 있다)
      update('c-same', { ...ruleOf('LA-36'), effective_from: FROM, effective_to: null }),
      update('c-grade', withParams('IJ-02', (p) => (p.thresholds as Rec[]).forEach((t) => (t.grade = '확인필요')))),
      // 비켜 주는 칸에 이름을 더한 판, 숫자 밖 모양이 원래 규칙과 다른 판은 Worker도 버린다(AC-7802.3)
      update('c-waiver', withParams('IJ-05', (p) => (p.acceptable_with = ['steroid_injection', 'viscosupplement_any', 'local_anesthetic']))),
      update('c-list', withParams('IJ-09', (p) => (p.joint_sites = (p.joint_sites as string[]).slice(0, 2)))),
      // 숫자 한도(절반~2배) 밖의 판도 버린다(LA-36 window.days 14 → 400)
      update('c-far', withParams('LA-36', (p) => ((p.window as Rec).days = 400))),
      update('c-to', changed('LA-35', { effective_to: '2027-01-01' })),
      { ...ok, changeId: 'c-null-rule', rule: null },
      { ...ok, changeId: 'c-text-rule', rule: JSON.stringify(rule) },
      null,
      7,
      { changeId: 'c-junk' },
    ] as unknown as RuleUpdate[]
    const before = JSON.stringify(list)
    const la18 = ruleOf('LA-18')
    const la18Before = JSON.stringify(la18)
    const out = withRuleUpdates(tables, list)
    expect(out.applied).toEqual(['c-ok', 'c-same']) // 규칙표 차례(LA-18 → LA-36)
    expect(out.tables).not.toBe(tables)
    expect(out.tables.rules.rules.filter((r) => r.id === 'LA-18').map((r) => (r.params.thresholds as Rec[])[0].at)).toEqual([4, 5])
    // 받은 표·판은 바뀌지 않는다
    expect(JSON.stringify(list)).toBe(before)
    expect(JSON.stringify(la18)).toBe(la18Before)
    expect(tables.rules.rules).toHaveLength(262)
    expect(ruleOf('LA-18')).toBe(la18)
  })

  it('AC-7803.4: 빈 목록이나 쓸 판이 없으면 받은 tables 객체 그대로다', () => {
    expect(withRuleUpdates(tables, [])).toEqual({ tables, applied: [] })
    expect(withRuleUpdates(tables, []).tables).toBe(tables)
    const none = withRuleUpdates(tables, [{ ...good(), baseVersion: 'old' }, update('n', changed('VF-01'))])
    expect(none.tables).toBe(tables)
    expect(none.applied).toEqual([])
    expect(withRuleUpdates(tables, 'x' as unknown as RuleUpdate[]).tables).toBe(tables)
  })
})

describe('AC-7803.2 withRuleUpdates — 날짜 창 나누기', () => {
  const at = (n: number, from: string) => withParams('LA-18', (p) => ((p.thresholds as Rec[])[0].at = n), { effective_from: from })
  const rows = (t: Tables) =>
    t.rules.rules.filter((r) => r.id === 'LA-18').map((r) => [r.effective_from, r.effective_to, (r.params.thresholds as Rec[])[0].at])

  it('AC-7803.2: 판들을 날짜 차례로 원래 규칙 바로 뒤에 두고, 같은 날짜는 목록 뒤의 것 하나만, 다른 규칙 줄은 같은 객체다', () => {
    const v1 = update('v1', at(5, '2026-11-01'))
    const v2 = update('v2', at(6, '2026-12-01'))
    const v3 = update('v3', at(7, '2026-11-01')) // v1과 같은 날짜 → 뒤의 v3만
    const out = withRuleUpdates(tables, [v2, v1, v3])
    expect(out.applied).toEqual(['v3', 'v2'])
    const merged = out.tables.rules.rules
    expect(merged).toHaveLength(262 + 2)
    const index = merged.findIndex((r) => r.id === 'LA-18')
    expect(merged.slice(index, index + 3).map((r) => r.id)).toEqual(['LA-18', 'LA-18', 'LA-18'])
    expect(rows(out.tables)).toEqual([
      [null, '2026-10-31', 4],
      ['2026-11-01', '2026-11-30', 7],
      ['2026-12-01', null, 6],
    ])
    // 판 줄은 새 객체(받은 판을 고치지 않음), 다른 규칙 줄은 같은 객체
    expect(merged[index + 1]).not.toBe(v3.rule)
    expect((v3.rule as RuleDef).effective_to).toBeNull()
    const others = merged.filter((r) => r.id !== 'LA-18')
    expect(others).toHaveLength(261)
    const originals = tables.rules.rules.filter((r) => r.id !== 'LA-18')
    others.forEach((rule, i) => expect(rule).toBe(originals[i]))
    // 표의 다른 칸도 그대로
    expect(out.tables.dxFlags).toBe(tables.dxFlags)
    expect(out.tables.rules.code_groups).toBe(tables.rules.code_groups)
    expect(out.tables.rules.version).toBe(tables.rules.version)
  })

  it('AC-7803.2: 원래 규칙의 effective_to가 있으면 마지막 판도 그날까지이고, 그보다 늦은 판은 버린다', () => {
    const base = { ...ruleOf('LA-18'), effective_to: '2026-12-31' }
    const own: Tables = { ...tables, rules: { ...tables.rules, rules: tables.rules.rules.map((r) => (r.id === 'LA-18' ? base : r)) } }
    const out = withRuleUpdates(own, [update('late', at(8, '2027-01-01')), update('last-day', at(6, '2026-12-31')), update('mid', at(5, '2026-11-15'))])
    expect(out.applied).toEqual(['mid', 'last-day'])
    expect(rows(out.tables)).toEqual([
      [null, '2026-11-14', 4],
      ['2026-11-15', '2026-12-30', 5],
      ['2026-12-31', '2026-12-31', 6],
    ])
    expect(base.effective_to).toBe('2026-12-31')
  })

  it('AC-7803.2: 여러 규칙의 판은 규칙마다 따로 나뉜다', () => {
    const la36 = withParams('LA-36', (p) => ((p.window as Rec).days = 21), { effective_from: '2026-11-20' })
    const out = withRuleUpdates(tables, [update('b', la36), update('a', at(5, '2026-11-01'))])
    // applied는 규칙표 차례(LA-18이 LA-36보다 앞)
    expect(tables.rules.rules.findIndex((r) => r.id === 'LA-18')).toBeLessThan(tables.rules.rules.findIndex((r) => r.id === 'LA-36'))
    expect(out.applied).toEqual(['a', 'b'])
    expect(out.tables.rules.rules.filter((r) => r.id === 'LA-36').map((r) => [r.effective_from, r.effective_to])).toEqual([
      [null, '2026-11-19'],
      ['2026-11-20', null],
    ])
    expect(rows(out.tables)).toEqual([
      [null, '2026-10-31', 4],
      ['2026-11-01', null, 5],
    ])
  })
})

describe('AC-7803.3 합친 표로 엔진(runRules)을 돌리면 진료일에 맞는 판이 걸린다', () => {
  // MN-03 도수치료 주 2회(월~일, 같은 주 3회째부터 확인필요). 새 판: 10월 15일(목)부터 주 3회(4회째부터)
  const D = '2026-10-15'
  const nextRule = () =>
    withParams('MN-03', (p) => ((p.thresholds as Rec[])[0].at = 4), {
      title: '도수치료 주 3회(월~일)',
      message: '도수치료는 같은 주 3회까지예요(새 고시)',
      basis: [...ruleOf('MN-03').basis, { doc: '가짜 고시 도수치료 횟수', number: '보건복지부 고시 제2026-999호', effective: D }],
      effective_from: D,
    })
  // 가상환자 A: 월·화·수(전날, 3회째)·목(당일, 4회째) / 가상환자 B: 화·수·목(당일, 3회째)
  const m = () =>
    month([
      { key: 'a1', chart: '900001', date: '2026-10-12' },
      { key: 'a2', chart: '900001', date: '2026-10-13' },
      { key: 'a3', chart: '900001', date: '2026-10-14' },
      { key: 'a4', chart: '900001', date: D },
      { key: 'b1', chart: '900002', date: '2026-10-13' },
      { key: 'b2', chart: '900002', date: '2026-10-14' },
      { key: 'b3', chart: '900002', date: D },
    ])
  const mn03 = (result: ReturnType<typeof runRules>, key: string) => result.perVisit.get(key)!.hits.filter((h) => h.ruleId === 'MN-03')

  it('AC-7803.3: 전날 진료는 원래 규칙(주 2회)으로, 당일 진료는 새 판(주 3회)의 기준·글·근거로 걸리고 묶음에는 규칙 번호가 한 번이다', () => {
    const base = ruleOf('MN-03')
    expect(check(nextRule())).toBe('ok')
    const merged = withRuleUpdates(tables, [update('mn', nextRule())])
    expect(merged.applied).toEqual(['mn'])
    // 합치지 않은 표: 3회째인 B의 당일 진료도 걸린다(대조)
    expect(mn03(runRules(m(), tables, NO_SETTINGS), 'b3')).toHaveLength(1)

    const result = runRules(m(), merged.tables, NO_SETTINGS)
    const before = mn03(result, 'a3')
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ grade: '확인필요', message: base.message, detail: '3회째', basis: base.basis })
    const after = mn03(result, 'a4')
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ grade: '확인필요', message: nextRule().message, detail: '4회째', basis: nextRule().basis })
    expect(mn03(result, 'b3')).toEqual([]) // 새 판 기준으로는 3회째가 걸리지 않는다
    expect(mn03(result, 'a2')).toEqual([])

    const groups = result.groups.filter((g) => g.ruleId === 'MN-03')
    expect(groups).toHaveLength(1)
    expect(groups[0].visits.map((v) => v.visitKey)).toEqual(['a3', 'a4'])
    expect(groups[0].rule.effective_from).toBe(D) // 가장 늦은 판
    expect(groups[0].rule.title).toBe('도수치료 주 3회(월~일)')
  })

  it('AC-7803.3: 병원 설정(끄기·등급)은 모든 판에 같이 걸린다', () => {
    const merged = withRuleUpdates(tables, [update('mn', nextRule())]).tables
    const off = runRules(m(), merged, { ...NO_SETTINGS, off: ['MN-03'] })
    expect(['a3', 'a4'].flatMap((key) => mn03(off, key))).toEqual([])
    const graded = runRules(m(), merged, { ...NO_SETTINGS, grade: { 'MN-03': '참고' } })
    expect(['a3', 'a4'].flatMap((key) => mn03(graded, key)).map((h) => h.grade)).toEqual(['참고', '참고'])
  })
})

describe('AC-7803.1 원래 규칙으로 돌아가는 판', () => {
  // MN-03 도수치료 주 2회(같은 주 3회째부터 확인필요). v1: 10월 5일(월)부터 주 3회(4회째부터), v2: 10월 12일(월)부터 원래 기준으로 되돌림
  const V1 = '2026-10-05'
  const V2 = '2026-10-12'
  const raised = () =>
    withParams('MN-03', (p) => ((p.thresholds as Rec[])[0].at = 4), { message: '도수치료는 같은 주 3회까지예요(가짜 고시)', effective_from: V1 })
  const back = (): RuleDef => ({
    ...ruleOf('MN-03'),
    basis: [...ruleOf('MN-03').basis, { doc: '가짜 고시 도수치료 횟수 되돌림', number: '보건복지부 고시 제2026-998호', effective: V2 }],
    effective_from: V2,
    effective_to: null,
  })
  // 가상환자 A: v1 주(월·화·수 = 3회째) / 가상환자 B: v2 주(월·화·수 = 3회째)
  const m = () =>
    month([
      { key: 'a1', chart: '900001', date: '2026-10-05' },
      { key: 'a2', chart: '900001', date: '2026-10-06' },
      { key: 'a3', chart: '900001', date: '2026-10-07' },
      { key: 'b1', chart: '900002', date: '2026-10-12' },
      { key: 'b2', chart: '900002', date: '2026-10-13' },
      { key: 'b3', chart: '900002', date: '2026-10-14' },
    ])
  const hits = (t: Tables, key: string) => runRules(m(), t, NO_SETTINGS).perVisit.get(key)!.hits.filter((h) => h.ruleId === 'MN-03')

  it("AC-7803.1: 앞 판이 횟수를 늘리고 다음 판이 원래 값으로 돌아가면('same') 두 판 모두 applied이고, 다음 판 날짜부터는 원래 기준으로 점검한다", () => {
    const base = ruleOf('MN-03')
    expect(check(raised())).toBe('ok')
    // Worker는 원래 규칙에 대해 다시 본다: 되돌림 판은 원래 규칙과 같다('same'). 저장 전 검사(지금 판 = v1 기준)로는 바뀐 판('ok')이다
    expect(checkRuleChange(tables.rules, base, base, back())).toBe('same')
    expect(checkRuleChange(tables.rules, base, raised(), back())).toBe('ok')

    const out = withRuleUpdates(tables, [update('v2', back()), update('v1', raised())])
    expect(out.applied).toEqual(['v1', 'v2'])
    const rows = out.tables.rules.rules.filter((r) => r.id === 'MN-03').map((r) => [r.effective_from, r.effective_to, (r.params.thresholds as Rec[])[0].at, r.message])
    expect(rows).toEqual([
      ['2026-07-01', '2026-10-04', 3, base.message],
      [V1, '2026-10-11', 4, raised().message],
      [V2, null, 3, base.message],
    ])
    // v1 주의 3회째는 걸리지 않고, v2 주의 3회째는 원래 기준·글과 되돌림 판의 근거로 걸린다
    expect(hits(out.tables, 'a3')).toEqual([])
    const b3 = hits(out.tables, 'b3')
    expect(b3).toHaveLength(1)
    expect(b3[0]).toMatchObject({ grade: '확인필요', message: base.message, detail: '3회째', basis: back().basis })
    expect(hits(out.tables, 'b2')).toEqual([])
    // 대조: 되돌림 판이 없으면 v1이 계속 돌아 B의 3회째도 걸리지 않는다
    expect(hits(withRuleUpdates(tables, [update('v1', raised())]).tables, 'b3')).toEqual([])
  })
})
