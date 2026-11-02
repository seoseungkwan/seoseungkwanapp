import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { shapeClaimMonth } from '@/lib/precheck/shape'
import { checkTables } from '@/lib/precheck/tables'
import type { Visit } from '@/types/precheck'
import {
  analyzeMonth,
  buildMemo,
  createMemoEngine,
  dictionaryTerms,
  defaultPhrases,
  diffPhrases,
  fill,
  fullText,
  memoText,
  migratePhrases,
  normalizeDictionary,
  ourClinicPhrases,
  savedMemoMissing,
  unfinished,
  validatePhrases,
  type MemoDictionary,
  type Phrases,
  type ProcedureDrugs,
} from './index'

// 원본(seoseungkwan/shared@2a1069b)을 가짜 자료로 돌려 둔 골든과 깊은 비교(순서까지). design.md 10절.
// 골든은 scripts/precheck/golden/memo.mjs·phrases.mjs가 만든다(스크립트를 끝까지 돌린 뒤의 함수, 19-2). 이 시험은 원본 없이 커밋한 골든과 견준다

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url))
const readJson = <T,>(path: string) => JSON.parse(readFileSync(fromRoot(path), 'utf-8')) as T

type Head = { source: string; file: string; fileSha256: string; entry: string; fake: string; knownDiffs: { where: string; why: string }[] }
type PartsGolden = Record<string, unknown>
type MemoGolden = Head & {
  fill: { tpl: string; vars: Record<string, string>; out: string }[]
  visits: { id: string; memos: { rg: string; parts: PartsGolden; text: string }[] }[]
  unresolved: { memo: string; out: boolean }[]
  saved: { id: string; saved: string; missing: string[] }[]
}
type FullVisit = {
  id: string
  fullText: string
  memos: string[]
  rxLines: string[]
  iaLines: string[]
  noteLines: string[]
  patientLines: string[]
  rxAdd: { name: string; rg: string | null; code: string; qty: number | null }[]
  rxNames: string[] | null
  rxQty: Record<string, number | null> | null
  shortItv: { nm: string; code: string; d: number; prev: string; src: string; lim: number; steroid: boolean; exact: boolean } | null
}
type KnownDiffCase = { id: string; where: string; ours: string; original: string }
type FullGolden = Head & {
  visits: FullVisit[]
  knownDiffCases: KnownDiffCase[]
  parts: { formatLevels: { levelSep: string; input: string; out: string }[]; styleSides: { sideStyle: string; input: string; out: string }[]; oneLine: { mark: string; input: string; out: string }[]; lineKey: { mark: string; input: string; out: string }[]; gapify: { input: string; out: string }[] }
}
type Scenario = {
  name: string
  acs: string
  tpl?: Record<string, unknown>
  codemap?: Record<string, unknown>
  procedureDrugs?: ProcedureDrugs
  dictionary?: MemoDictionary
  skip: string[]
  visits: { id: string; fullText: string; memos: string[] }[]
}
type ScenarioGolden = Head & { scenarios: Scenario[] }
type DictionaryGolden = Head & {
  normalize: { dictionary: MemoDictionary; kind: string | null; input: string; out: string }[]
  terms: { dictionary: MemoDictionary; kind: string; out: string[] }[]
}
type PhrasesGolden = Head & {
  defaults: Phrases
  validate: { name: string; input: unknown; errors: { path: string; message: string }[]; value: unknown }[]
  migrate: { name: string; input: unknown; out?: unknown; error?: string }[]
  diff: { name: string; before: unknown; after: unknown; out: { path: string; label: string; before: string; after: string }[] }[]
}

const tablesFile = (name: string) => readJson<unknown>(`src/lib/precheck/data/${name}.json`)
const tables = checkTables({ rules: tablesFile('rules'), dxFlags: tablesFile('dxFlags'), drugInfo: tablesFile('drugInfo'), codeMap: tablesFile('codeMap') })

const memoGolden = readJson<MemoGolden>('fixtures/precheck/golden/memo-text.json')
const fullGolden = readJson<FullGolden>('fixtures/precheck/golden/memo-full-default.json')
const dataGoldens = ['memo-full-v1-v18.json', 'memo-full-dx-check.json'].map((name) => ({ name, golden: readJson<FullGolden>(`fixtures/precheck/golden/${name}`) }))
const scenarioGolden = readJson<ScenarioGolden>('fixtures/precheck/golden/memo-full-settings.json')
const dictionaryGolden = readJson<DictionaryGolden>('fixtures/precheck/golden/memo-dictionary.json')
const phrasesGolden = readJson<PhrasesGolden>('fixtures/precheck/golden/phrases-engine.json')

const monthOf = (fake: string) => shapeClaimMonth(readJson(`fixtures/precheck/fake/${fake}`))
const month = monthOf(fullGolden.fake)
const our = ourClinicPhrases()

/** 원본 기본 문구 + 약 칸은 우리 병원 값(원본 칸은 같다. 약 칸 없이는 메모를 만들지 않는다, AC-014.8) */
function withPatch(scenario: Scenario): Phrases {
  const value = structuredClone(our)
  Object.assign(value.TPL, scenario.tpl ?? {})
  Object.assign(value.CODEMAP, scenario.codemap ?? {})
  if (scenario.procedureDrugs) value.procedureDrugs = scenario.procedureDrugs
  return value
}

describe.each([
  ['memo-text', memoGolden],
  ['memo-full-default', fullGolden],
  ['memo-full-settings', scenarioGolden],
  ['memo-dictionary', dictionaryGolden],
  ['phrases-engine', phrasesGolden],
  ...dataGoldens.map(({ name, golden }) => [name, golden] as const),
] as const)('AC-014.1 AC-014.3 AC-014.5 골든 머리: %s', (_name, golden) => {
  it('AC-014.1: 머리에 원본·파일·입구가 있고 일부러 다른 것은 이유와 함께 적혀 있다', () => {
    expect(golden.source).toBe('seoseungkwan/shared@2a1069b')
    expect(golden.file.length).toBeGreaterThan(0)
    expect(golden.fileSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(golden.entry.length).toBeGreaterThan(0)
    for (const diff of golden.knownDiffs) {
      expect(diff.where.length, diff.where).toBeGreaterThan(0)
      expect(diff.why.length, diff.where).toBeGreaterThan(0)
    }
  })
})

describe('AC-014.1 AC-014.2 buildMemo·memoText·fill이 원본과 같다', () => {
  const phrases = ourClinicPhrases()
  const engine = createMemoEngine(phrases, tables)
  const byId = new Map(analyzeMonth(month, phrases, tables).map((v) => [v.key, v]))

  it('AC-014.1: 사례가 빈 결과로 통과하지 않는다', () => {
    expect(memoGolden.visits.length).toBeGreaterThan(30)
    expect(memoGolden.visits.flatMap((v) => v.memos).filter((m) => m.text).length).toBeGreaterThan(30)
    expect(memoGolden.visits.flatMap((v) => v.memos).some((m) => m.rg === 'cx_sh')).toBe(true)
    expect(memoGolden.visits.flatMap((v) => v.memos).some((m) => m.rg === 'unassigned_level')).toBe(true)
    expect(memoGolden.visits.flatMap((v) => v.memos).some((m) => m.rg === 'rx')).toBe(true)
  })

  it.each(memoGolden.visits.map((v) => ({ ...v })))('AC-014.1: 진료 $id의 부위 메모 조각·문장', ({ id, memos }) => {
    const visit = byId.get(id)!
    expect(visit.memos.map((m) => m.rg)).toEqual(memos.map((m) => m.rg))
    visit.memos.forEach((m, index) => {
      const want = memos[index]
      if (want.rg === 'cx_sh') expect(m.sub?.map((x) => x.rg)).toEqual(['cervical', 'shoulder'])
      expect(pick(m as unknown as PartsGolden, Object.keys(want.parts)), id).toEqual(want.parts)
      expect(memoText(visit, m, phrases, tables), id).toBe(want.text)
    })
  })

  it.each(memoGolden.visits.flatMap((v) => v.memos.filter((m) => !['cx_sh', 'unassigned_level', 'rx'].includes(m.rg)).map((m) => ({ id: v.id, rg: m.rg, parts: m.parts, text: m.text }))))(
    'AC-014.1: buildMemo($id, $rg)를 바로 불러도 같은 조각이다',
    ({ id, rg, parts }) => {
      const part = buildMemo(byId.get(id)!, rg as Parameters<typeof buildMemo>[1], phrases, tables)
      expect(pick(part as unknown as PartsGolden, Object.keys(parts))).toEqual(parts)
    },
  )

  it.each(memoGolden.fill)('AC-014.2: fill($tpl)이 원본과 같다(모르는 말은 원본처럼 둔다)', ({ tpl, vars, out }) => {
    expect(fill(tpl, vars, phrases, tables)).toBe(out)
    expect(engine.fill(tpl, vars)).toBe(out)
  })

  it.each(memoGolden.saved)('AC-014.4: 진료 $id의 고친 메모에서 빠진 문장이 원본 savedMemoMissing과 같다', ({ id, saved, missing }) => {
    expect(savedMemoMissing(saved, byId.get(id)!, phrases, tables)).toEqual(missing)
  })

  it('AC-014.4: 빠진 문장을 경고하는 사례와 경고하지 않는 사례가 모두 있다', () => {
    expect(memoGolden.saved.some((c) => c.missing.length > 0)).toBe(true)
    expect(memoGolden.saved.some((c) => c.missing.length === 0)).toBe(true)
  })

  it.each(memoGolden.unresolved)('AC-014.12: unfinished($memo)가 원본 unresolved와 같다', ({ memo, out }) => {
    expect(unfinished(memo)).toBe(out)
  })
})

function pick(source: PartsGolden, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, plain(source[key])]))
}
/** 원본 rxQty는 프로토타입 없는 객체다. 값만 견준다 */
const plain = (value: unknown) => (value === undefined ? null : JSON.parse(JSON.stringify(value)))

describe('AC-014.5 AC-014.6 AC-014.7 fullText와 재료가 원본과 같다(우리 병원 설정)', () => {
  const phrases = ourClinicPhrases()
  const engine = createMemoEngine(phrases, tables)
  const visits = analyzeMonth(month, phrases, tables)
  const byId = new Map(visits.map((v) => [v.key, v]))
  const diffIds = new Set(fullGolden.knownDiffCases.map((c) => c.id))

  it('AC-014.5: 가짜 진료 수가 원본에 넣은 진료 수와 같고 차례도 같다', () => {
    expect(fullGolden.visits.map((v) => v.id)).toEqual(month.visits.map((v) => v.key))
  })

  it('AC-014.5: 글이 빈 결과로 통과하지 않는다(줄 종류마다 사례가 있다)', () => {
    const list = fullGolden.visits
    expect(list.filter((v) => v.fullText).length).toBeGreaterThan(30)
    expect(list.some((v) => v.rxLines.length)).toBe(true)
    expect(list.some((v) => v.iaLines.length)).toBe(true)
    expect(list.some((v) => v.noteLines.length)).toBe(true)
    expect(list.some((v) => v.patientLines.length)).toBe(true)
    expect(list.some((v) => v.shortItv)).toBe(true)
    expect(list.some((v) => v.rxNames === null)).toBe(true)
  })

  it.each(fullGolden.visits.map((v) => ({ ...v })))('AC-014.5 AC-014.6: 진료 $id의 재료(applyRx·computeIntervals·줄)', (want) => {
    const visit = byId.get(want.id)!
    expect(visit.memos.map((m) => m.rg), 'memos').toEqual(want.memos)
    expect(visit.rxAdd.map(({ name, rg, code, qty }) => ({ name, rg: rg ?? null, code, qty }))).toEqual(want.rxAdd.map((a) => ({ ...a, rg: a.rg ?? null })))
    expect(visit.rxNames && [...visit.rxNames]).toEqual(want.rxNames)
    expect(visit.rxQty && { ...visit.rxQty }).toEqual(want.rxQty)
    expect(visit.shortItv).toEqual(want.shortItv)
    expect(engine.patientLines(visit)).toEqual(want.patientLines)
    expect(engine.noteLines(visit)).toEqual(want.noteLines)
    if (!diffIds.has(want.id)) {
      expect(engine.rxLines(visit)).toEqual(want.rxLines)
      expect(engine.iaLines(visit)).toEqual(want.iaLines)
    }
  })

  it.each(fullGolden.visits.filter((v) => !diffIds.has(v.id)).map((v) => ({ id: v.id, want: v.fullText })))('AC-014.5 AC-014.7: 진료 $id의 fullText가 원본과 글자까지 같다', ({ id, want }) => {
    expect(fullText(byId.get(id)!, phrases, tables)).toBe(want)
  })

  it('AC-014.5: 진료 전에 분석하지 않은 Visit을 넘겨도 간격 사유만 빼고 같은 글이다', () => {
    const one = fullGolden.visits.find((v) => !v.shortItv && !diffIds.has(v.id) && v.fullText)!
    const raw: Visit = month.visits.find((v) => v.key === one.id)!
    expect(fullText(raw, phrases, tables)).toBe(one.fullText)
  })

  it.each(fullGolden.parts.formatLevels)('AC-014.5: formatLevels($levelSep, $input)', ({ levelSep, input, out }) => {
    const value = structuredClone(our)
    value.TPL.levelSep = levelSep
    expect(createMemoEngine(value, tables).formatLevels(input)).toBe(out)
  })
  it.each(fullGolden.parts.styleSides)('AC-014.5: styleSides($sideStyle, $input)', ({ sideStyle, input, out }) => {
    const value = structuredClone(our)
    value.TPL.sideStyle = sideStyle
    expect(createMemoEngine(value, tables).styleSides(input)).toBe(out)
  })
  it.each(fullGolden.parts.oneLine)('AC-014.5: oneLineMemo($mark, $input)', ({ mark, input, out }) => {
    const value = structuredClone(our)
    value.TPL.mark = mark
    expect(createMemoEngine(value, tables).oneLineMemo(input)).toBe(out)
  })
  it.each(fullGolden.parts.lineKey)('AC-014.5: lineKey($mark, $input)', ({ mark, input, out }) => {
    const value = structuredClone(our)
    value.TPL.mark = mark
    expect(createMemoEngine(value, tables).lineKey(input)).toBe(out)
  })
  it.each(fullGolden.parts.gapify)('AC-014.5: gapify($input)는 원본처럼 글을 그대로 둔다', ({ input, out }) => {
    expect(engine.gapify(input)).toBe(out)
  })
})

describe('AC-014.14 시술 종류가 0이고 약이 있는 진료', () => {
  const phrases = ourClinicPhrases()
  const engine = createMemoEngine(phrases, tables)
  const visits = analyzeMonth(month, phrases, tables)
  const cases = visits.filter((v) => v.memos.length > 0 && engine.procKeys(v).size === 0 && v.rx.some((row) => phrases.CODEMAP[row.code]?.k === 'drug'))
  const wanted = new Map(fullGolden.visits.map((v) => [v.id, v.fullText]))

  it('AC-014.14: 그런 사례가 골든에 있다', () => {
    expect(cases.map((v) => v.key)).toEqual(expect.arrayContaining(['m33', 'm34']))
  })

  it.each(cases.map((v) => ({ id: v.key, visit: v })))('AC-014.14: 진료 $id는 원본과 같고 약 글도 [약 확인]도 없다', ({ id, visit }) => {
    const out = fullText(visit, phrases, tables)
    expect(out).toBe(wanted.get(id))
    expect(out).not.toContain('[약 확인')
    expect(out).not.toMatch(/triam|dexa|트리암|덱사|조영제/)
  })
})

describe('AC-014.7 AC-014.10 일부러 다른 것(knownDiffs)은 적은 만큼만 다르다', () => {
  const phrases = ourClinicPhrases()
  const byId = new Map(analyzeMonth(month, phrases, tables).map((v) => [v.key, v]))
  const allowed = ['ambiguousDrug', 'cartilageLine']

  it('AC-014.10: 시술 종류가 둘 이상인 날의 주사약과 연골주사 줄만 적혀 있다', () => {
    const wheres = fullGolden.knownDiffCases.map((c) => c.where)
    expect(new Set(wheres)).toEqual(new Set(allowed))
    for (const where of allowed) expect(fullGolden.knownDiffs.map((d) => d.where)).toContain(where)
  })

  it.each(fullGolden.knownDiffCases)('AC-014.10: 진료 $id($where)은 원본과 정말 다르고 적어 둔 글과 같다', ({ id, ours, original }) => {
    expect(fullGolden.visits.find((v) => v.id === id)!.fullText).toBe(original)
    expect(ours).not.toBe(original)
    expect(unfinished(ours)).toBe(true)
    expect(fullText(byId.get(id)!, phrases, tables)).toBe(ours)
  })
})

describe.each(dataGoldens)('AC-014.5 AC-014.6 다른 가짜 자료도 원본과 같다: $name', ({ golden }) => {
  const phrases = ourClinicPhrases()
  const data = monthOf(golden.fake)
  const byId = new Map(analyzeMonth(data, phrases, tables).map((v) => [v.key, v]))
  const diffs = new Map(golden.knownDiffCases.map((c) => [c.id, c]))

  it('AC-014.5: 차례가 같다', () => {
    expect(golden.visits.map((v) => v.id)).toEqual(data.visits.map((v) => v.key))
  })

  it.each(golden.visits.map((v) => ({ id: v.id, want: v.fullText })))('AC-014.5: 진료 $id', ({ id, want }) => {
    const diff = diffs.get(id)
    if (diff) expect(diff.original).toBe(want)
    expect(fullText(byId.get(id)!, phrases, tables)).toBe(diff ? diff.ours : want)
  })
})

describe('AC-014.5 AC-014.7 설정을 바꿔도 원본과 같다', () => {
  it('AC-014.7: 설정 사례가 여럿이고 글이 기본값과 실제로 달라진다', () => {
    expect(scenarioGolden.scenarios.length).toBeGreaterThan(15)
    const defaults = new Map(fullGolden.visits.map((v) => [v.id, v.fullText]))
    for (const s of scenarioGolden.scenarios) {
      if (s.name.startsWith('same:')) continue
      expect(s.visits.some((v) => v.fullText !== defaults.get(v.id)), s.name).toBe(true)
    }
  })

  describe.each(scenarioGolden.scenarios)('$name ($acs)', (scenario) => {
    const phrases = withPatch(scenario)
    const scenarioTables = { dictionary: scenario.dictionary }
    const byId = new Map(analyzeMonth(month, phrases, scenarioTables).map((v) => [v.key, v]))
    it.each(scenario.visits.map((v) => ({ id: v.id, want: v.fullText, memos: v.memos })))('AC-014.5 진료 $id', ({ id, want, memos }) => {
      const visit = byId.get(id)!
      expect(visit.memos.map((m) => m.rg)).toEqual(memos)
      expect(fullText(visit, phrases, scenarioTables)).toBe(want)
    })
  })
})

describe('AC-014.6 문구 사전이 원본 NEW_MEDICORE_DICTIONARY와 같다', () => {
  it.each(dictionaryGolden.normalize)('AC-014.6: normalize($input, $kind)', ({ dictionary, kind, input, out }) => {
    expect(normalizeDictionary(input, kind, dictionary)).toBe(out)
  })
  it.each(dictionaryGolden.terms)('AC-014.6: terms($kind)', ({ dictionary, kind, out }) => {
    expect(dictionaryTerms(kind, dictionary)).toEqual(out)
  })
  it('AC-014.6: 줄임말 바꾸기 사례가 글자를 실제로 바꾼다', () => {
    expect(dictionaryGolden.normalize.some((c) => c.input !== c.out)).toBe(true)
    expect(dictionaryGolden.normalize.some((c) => c.input === c.out)).toBe(true)
  })
})

describe('AC-014.3 원본 claim_hospital_settings의 defaults·validate·diff와 같다', () => {
  const originalFields = ({ TPL, CODEMAP, CODEMAP_DEL }: Phrases) => ({ TPL, CODEMAP, CODEMAP_DEL })

  it('AC-014.3: defaultPhrases의 원본 칸이 원본 defaults와 같고 sideRuleVersion은 2다', () => {
    expect(originalFields(defaultPhrases())).toEqual(phrasesGolden.defaults)
    expect(defaultPhrases().TPL.sideRuleVersion).toBe(2)
  })

  it('AC-014.3: 사례가 틀린 값과 옛 sideRuleVersion을 모두 덮는다', () => {
    expect(phrasesGolden.validate.filter((c) => c.errors.length).length).toBeGreaterThan(15)
    expect(phrasesGolden.validate.filter((c) => !c.errors.length).length).toBeGreaterThan(2)
    const migrated = phrasesGolden.migrate.filter((c) => c.out !== undefined)
    expect(migrated.some((c) => (c.input as { TPL?: { sideRuleVersion?: number } }).TPL?.sideRuleVersion === 1)).toBe(true)
    expect(phrasesGolden.migrate.some((c) => c.error)).toBe(true)
  })

  it.each(phrasesGolden.validate)('AC-014.3: validatePhrases($name)', ({ input, errors, value }) => {
    const result = validatePhrases(withDrugs(input))
    if (errors.length) {
      expect(result).toEqual({ ok: false, errors })
    } else {
      expect(result.ok).toBe(true)
      if (result.ok) expect(originalFields(result.value)).toEqual(value)
    }
  })

  it.each(phrasesGolden.migrate)('AC-014.3: 옛 설정 바꾸기($name)', ({ input, out, error }) => {
    if (error) expect(() => migratePhrases(input)).toThrow(error)
    else expect(migratePhrases(input)).toEqual(out)
  })

  it.each(phrasesGolden.diff)('AC-014.3: diffPhrases($name)', ({ before, after, out }) => {
    expect(diffPhrases(before as Phrases, after as Phrases)).toEqual(out)
  })

  it('AC-014.3: 원본이 하지 않는 약 칸 차이는 따로 보인다(knownDiffs)', () => {
    expect(phrasesGolden.knownDiffs.map((d) => d.where)).toContain('procedureDrugs')
    const before = ourClinicPhrases()
    const after = structuredClone(before)
    after.procedureDrugs.KK090.트리암 = { use: 'exclude' }
    expect(diffPhrases(before, after).map((d) => d.path)).toEqual(['procedureDrugs.KK090.트리암.label', 'procedureDrugs.KK090.트리암.place', 'procedureDrugs.KK090.트리암.use'])
  })
})

/** 원본 validate는 원본 칸만 본다. 약 칸은 원본에 없으므로 원본 칸이 있는 입력에만 비워 넣는다 */
function withDrugs(input: unknown): unknown {
  if (typeof input === 'object' && input !== null && !Array.isArray(input) && !Object.hasOwn(input, 'procedureDrugs') && Object.hasOwn(input, 'TPL') && Object.hasOwn(input, 'CODEMAP')) {
    return { ...input, procedureDrugs: {} }
  }
  return input
}
