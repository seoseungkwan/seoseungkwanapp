import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RULE_TYPES } from '@/lib/precheck/tables'
import type { RuleDef, RulesFile } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { TARGET_GUIDE, TYPE_GUIDE, namesBlock } from './typeGuide'

// 규칙 종류 설명과 이름 목록(specs/rule-auto REQ-7808 AC-7808.3, design 8절). 진짜 Claude는 부르지 않는다.
// 규칙표는 workers/precheck/tables.ts의 loadTables로만 부른다(AC-007.4)

async function realRules(): Promise<RulesFile> {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(`규칙표를 못 불렀다: ${loaded.code}`)
  return loaded.value.rules
}

/** 칸 이름이 다른 낱말의 일부가 아니라 낱말 하나로 들어 있나(`check`는 `checks` 안에서 세지 않는다) */
const hasWord = (text: string, key: string) =>
  new RegExp(`(?<![A-Za-z0-9_])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`).test(text)

/** 종류마다 규칙 3개 이상이 쓰는 params 맨 위 칸 이름 */
function commonKeys(rules: readonly RuleDef[]): Map<string, string[]> {
  const counts = new Map<string, Map<string, number>>()
  for (const rule of rules) {
    const byKey = counts.get(rule.type) ?? new Map<string, number>()
    for (const key of Object.keys(rule.params)) byKey.set(key, (byKey.get(key) ?? 0) + 1)
    counts.set(rule.type, byKey)
  }
  return new Map(
    [...counts].map(([type, byKey]) => [
      type,
      [...byKey]
        .filter(([, n]) => n >= 3)
        .map(([key]) => key)
        .sort(),
    ]),
  )
}

const SMALL: RulesFile = {
  version: '2026-10-19',
  meta: {},
  code_groups: {
    eswt_clinic: { name: '체외충격파', codes: [{ code: 'MM301', name: '체외충격파 1' }, ' mm302 ', { code: 'MM301' }] },
    pairs_case: { name: '짝 묶음', pairs: [['LA274', 'LA272']] },
    bare: ['KK090'],
  },
  drug_classes: {
    steroid_injection: { name: '스테로이드 주사', regex: '(?i)triam' },
    osteoporosis: { name: '골다공증 치료제', subgroups: { serm: { name: 'SERM' }, denosumab: { name: '데노수맙' } } },
    plain: {},
  },
  regions: {
    keys: { knee: '무릎' },
    chart_keywords: { views: { AP: 'AP' }, carm_fluoro: '(?i)c-?arm' },
    chart_side_regex: { right: '(?i)rt', left: '(?i)lt' },
    la_code_region: { LA321: ['cervical'] },
    _note: '설명',
  },
  rules: [],
}

describe('AC-7808.3 서버 전용', () => {
  it("AC-7808.3: typeGuide.ts 첫 줄은 import 'server-only'다", () => {
    const first = readFileSync(new URL('./typeGuide.ts', import.meta.url), 'utf8').split(/\r?\n/)[0]
    expect(first).toBe("import 'server-only'")
  })
})

describe('AC-7808.3 TYPE_GUIDE', () => {
  it('AC-7808.3: 18종류(RULE_TYPES) 모두 있고 그 밖의 종류는 없으며, 설명마다 1~600자다', () => {
    expect(RULE_TYPES).toHaveLength(18)
    expect(Object.keys(TYPE_GUIDE).sort()).toEqual([...RULE_TYPES].sort())
    for (const type of RULE_TYPES) {
      const text = TYPE_GUIDE[type]
      expect(typeof text, type).toBe('string')
      expect(text.trim().length, type).toBeGreaterThanOrEqual(1)
      expect(text.length, type).toBeLessThanOrEqual(600)
    }
  })

  it('AC-7808.3: 실제 rules.json에서 그 종류 규칙 3개 이상이 쓰는 params 맨 위 칸 이름이 그 종류 설명에 모두 낱말로 들어 있다', async () => {
    const file = await realRules()
    const common = commonKeys(file.rules)
    // 실제 표에 18종류가 다 있고, 칸 검사가 비지 않는다
    expect([...common.keys()].sort()).toEqual([...RULE_TYPES].sort())
    expect(common.get('count_window')).toEqual(expect.arrayContaining(['target', 'window', 'thresholds', 'count_unit']))
    expect(common.get('dur')).toEqual(expect.arrayContaining(['kind', 'a', 'b']))
    const missing: string[] = []
    for (const [type, keys] of common) {
      for (const key of keys) if (!hasWord(TYPE_GUIDE[type as keyof typeof TYPE_GUIDE], key)) missing.push(`${type}.${key}`)
    }
    expect(missing).toEqual([])
  })

  it('AC-7808.3: 낱말 검사는 다른 칸 이름 안의 글자를 세지 않는다(시험 도구 확인)', () => {
    expect(hasWord('`checks`만 있음', 'check')).toBe(false)
    expect(hasWord('`drug_condition` 칸', 'condition')).toBe(false)
    expect(hasWord('`check`(볼 것)', 'check')).toBe(true)
    expect(hasWord('`b.exclude_drug_classes`', 'b')).toBe(true)
    expect(hasWord('bilateral', 'b')).toBe(false)
  })

  it('AC-7808.3: 공통 대상 설명은 대상 칸 다섯(codes·code_groups·drug_classes·name_regex·chart_regex_key)과 regions. 길을 말한다', () => {
    for (const key of ['codes', 'code_groups', 'drug_classes', 'name_regex', 'chart_regex_key']) expect(hasWord(TARGET_GUIDE, key), key).toBe(true)
    expect(TARGET_GUIDE).toContain('regions.')
    expect(TARGET_GUIDE.length).toBeLessThanOrEqual(600)
  })

  it('AC-7808.3: 설명은 꺾쇠(<·>)를 쓰지 않는다(감싸개를 흉내 내지 않게)', () => {
    for (const text of [TARGET_GUIDE, ...Object.values(TYPE_GUIDE)]) expect(text).not.toMatch(/[<>]/)
  })
})

describe('AC-7808.3 namesBlock', () => {
  it('AC-7808.3: 작은 규칙표 — 코드 묶음 이름: 코드(대문자·겹침 뺌, 없으면 (코드 모름)), 약 분류(+아래 분류), regions. 길 목록', () => {
    expect(namesBlock(SMALL)).toBe(
      [
        '코드 묶음 (이름 [설명]: 코드):',
        'eswt_clinic [체외충격파]: MM301, MM302',
        'pairs_case [짝 묶음]: (코드 모름)',
        'bare: KK090',
        '약 분류 (이름 [설명] · 아래 분류):',
        'steroid_injection [스테로이드 주사]',
        'osteoporosis [골다공증 치료제] · 아래 분류: serm, denosumab',
        'plain',
        '차트 낱말 길:',
        'regions.keys',
        'regions.chart_keywords',
        'regions.chart_keywords.views',
        'regions.chart_keywords.carm_fluoro',
        'regions.chart_side_regex',
        'regions.chart_side_regex.right',
        'regions.chart_side_regex.left',
        'regions.la_code_region',
      ].join('\n'),
    )
  })

  it('AC-7808.3: 같은 규칙표에는 늘 같은 글이다(복사본도 같음, 캐시가 맞게)', async () => {
    const file = await realRules()
    const a = namesBlock(file)
    expect(namesBlock(file)).toBe(a)
    expect(namesBlock(structuredClone(file))).toBe(a)
    expect(namesBlock(structuredClone(SMALL))).toBe(namesBlock(SMALL))
  })

  it('AC-7808.3: 실제 규칙표 — 모든 코드 묶음·약 분류 이름과 규칙이 쓰는 차트 낱말 길이 들어 있고 꺾쇠가 없다', async () => {
    const file = await realRules()
    const text = namesBlock(file)
    const lines = text.split('\n')
    for (const name of Object.keys(file.code_groups)) expect(lines.some((l) => l.startsWith(`${name}:`) || l.startsWith(`${name} [`)), name).toBe(true)
    for (const name of Object.keys(file.drug_classes)) expect(lines.some((l) => l === name || l.startsWith(`${name} [`) || l.startsWith(`${name} ·`)), name).toBe(true)
    expect(text).toContain('LA321')
    expect(text).toContain('아래 분류: bdde_60mg, dvs_hydrogel, hmda')
    for (const path of ['regions.chart_keywords.views', 'regions.chart_side_regex.bilateral', 'regions.chart_level_parse.level_count', 'regions.chart_site_map']) {
      expect(lines, path).toContain(path)
    }
    expect(text).not.toMatch(/[<>]/)
  })
})
