import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { shapeClaimMonth } from '@/lib/precheck/shape'
import { RULE_TYPES } from '@/lib/precheck/tables'
import type { RuleType, Tables } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { NO_SETTINGS, ruleStatuses, runRules, type RuleSettings, type RunResult } from './engine'

// 골든 시험(REQ-010, design.md 10절): 가짜 자료를 원본 evaluate·collect와 우리 runRules에 넣어 결과가 순서까지 같은지 본다.
// 골든은 scripts/precheck/golden/rules.mjs가 원본을 돌려 만든 파일이다. 이 시험은 원본 없이 커밋한 골든과 비교한다.
// 가짜 진료 번호는 '규칙.hit·규칙.miss'로 그 사례의 뜻을 적어 둔다(AC-010.2)

const GOLDEN_DIR = fileURLToPath(new URL('../../../../fixtures/precheck/golden/', import.meta.url))
const FAKE_DIR = fileURLToPath(new URL('../../../../fixtures/precheck/fake/', import.meta.url))

type GoldenHit = { id: string; grade: string; message: string; detail: string }
type GoldenVisit = { id: string; hits: GoldenHit[]; skipped: { history: number; data: number }; checked: number }
type Golden = {
  source: string
  file: string
  entry: string
  knownDiffs: { id: string; where: string; rules: string[]; reason: string }[]
  fake: string
  settings: RuleSettings | null
  visits: GoldenVisit[]
  collect: {
    visits: string[]
    checked: number
    hi: number
    mid: number
    lo: number
    patients: number
    historySkips: number
    byRule: { rule: string; grade: string; visits: string[] }[]
    rows: [string, string][]
  }
}

const goldenNames = () =>
  existsSync(GOLDEN_DIR)
    ? readdirSync(GOLDEN_DIR).filter((name) => /^rules-.+\.json$/.test(name) && name !== 'rules-coverage.json' && name !== 'rules-status.json').sort()
    : []
const readGolden = (name: string) => JSON.parse(readFileSync(`${GOLDEN_DIR}${name}`, 'utf-8')) as Golden
const NAMES = goldenNames()

let tables: Tables
beforeAll(async () => {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(loaded.code)
  tables = loaded.value
}, 60_000) // 약 표 JSON이 커서 바쁜 기계에서는 첫 읽기가 10초를 넘는다

const toVisits = (order: string[], result: RunResult): GoldenVisit[] =>
  order.map((id) => {
    const visit = result.perVisit.get(id)!
    return {
      id,
      hits: visit.hits.map((h) => ({ id: h.ruleId, grade: h.grade, message: h.message, detail: h.detail })),
      skipped: { history: visit.skippedNoHistory, data: visit.skippedNoDx },
      checked: visit.checked,
    }
  })

const toCollect = (order: string[], result: RunResult): Golden['collect'] => ({
  visits: order,
  ...result.totals,
  byRule: result.groups.map((g) => ({ rule: g.ruleId, grade: g.grade, visits: g.visits.map((x) => x.visitKey) })),
  rows: result.rows.map((row): [string, string] => [row.visitKey, row.finding.ruleId]),
})

describe('AC-010.1 원본 evaluate·collect와 순서까지 같다', () => {
  it('AC-010.1: 골든이 있고, 규칙 사례 가짜 자료마다 기본 설정 골든이 하나씩 있다(다른 TASK의 사례는 그 TASK의 골든이 본다)', () => {
    expect(NAMES.length).toBeGreaterThan(0)
    const fake = readdirSync(FAKE_DIR).filter((name) => /^claim-month-(rules-.+|cross-month)\.json$/.test(name))
    const covered = new Set(NAMES.map(readGolden).filter((g) => g.settings === null).map((g) => g.fake))
    expect([...covered].sort()).toEqual([...fake].sort())
  })

  it.each(NAMES)('AC-010.1: %s', (name) => {
    const golden = readGolden(name)
    expect({ source: golden.source, file: golden.file, entry: golden.entry }).toEqual({
      source: 'seoseungkwan/shared@2a1069b',
      file: 'assets/mx999_v22.html',
      entry: 'new-medicore-precheck evaluate/collect',
    })
    // 적어 둔 차이만 허용한다. 지금은 없다. 더할 때는 이 목록과 engine.test.ts의 시험을 함께 고친다(design.md 10절)
    expect(golden.knownDiffs.map((diff) => diff.id)).toEqual([])
    for (const diff of golden.knownDiffs) expect(diff.reason.trim().length, diff.id).toBeGreaterThan(20)

    const month = shapeClaimMonth(JSON.parse(readFileSync(`${FAKE_DIR}${golden.fake}`, 'utf-8')))
    const result = runRules(month, tables, golden.settings ?? NO_SETTINGS)
    const order = month.visits.map((v) => v.key)
    expect(order).toEqual(golden.collect.visits)
    expect(toVisits(order, result)).toEqual(golden.visits)
    expect(toCollect(order, result)).toEqual(golden.collect)
  }, 60_000) // 사례가 많아 바쁜 기계에서는 파일 하나가 5초를 넘는다
})

describe('AC-010.2 조건 종류마다 걸리는 사례와 안 걸리는 사례', () => {
  const allVisits = () => NAMES.map(readGolden).filter((g) => g.settings === null).flatMap((g) => g.visits)
  const typeOf = (id: string) => tables.rules.rules.find((r) => r.id === id)?.type
  const CASE = /^([A-Z]{2}-\d{2,3}[a-z]?)\.(hit|miss)\b/
  const cases = () =>
    allVisits().flatMap((visit) => {
      const m = CASE.exec(visit.id)
      return m ? [{ visit, rule: m[1], kind: m[2] }] : []
    })

  it("AC-010.2: 이름이 '규칙.hit'인 진료는 그 규칙이 걸리고 '규칙.miss'인 진료는 걸리지 않는다", () => {
    const list = cases()
    expect(list.length).toBeGreaterThan(0)
    for (const { visit, rule, kind } of list) {
      const hit = visit.hits.some((h) => h.id === rule)
      expect(hit, `${visit.id}: ${visit.hits.map((h) => h.id).join(' ')}`).toBe(kind === 'hit')
    }
  })

  // 다른 사례에 곁다리로 걸린 것으로는 규칙을 시험했다고 보지 않는다. 걸림·안 걸림 사례가 이름으로 있어야 한다
  const NO_NAMED_HIT: Record<string, string> = {
    'DX-08': '원본 판정이 늘 null이다. 배제상병은 required_dx 규칙 번호로 나온다',
    'CL-15': '빈 줄 진료는 도우미 표로 생기지 않는다. engine.test.ts에서 본다',
    'HD-08': '기본으로 꺼져 있어 rules-settings-changed.json에서만 걸린다(coverage.test.ts가 본다)',
  }

  it('AC-010.2: 돌 수 있는 규칙마다 이름 붙은 걸림·안 걸림 사례가 있다', () => {
    const kinds = new Map<string, Set<string>>()
    for (const { rule, kind } of cases()) kinds.set(rule, (kinds.get(rule) ?? new Set()).add(kind))
    const runnable = [...ruleStatuses(tables)].filter(([, status]) => status === 'auto' || status === 'hist').map(([id]) => id)
    expect(runnable).toHaveLength(153)
    expect(runnable.filter((id) => !kinds.get(id)?.has('miss'))).toEqual([])
    expect(runnable.filter((id) => !kinds.get(id)?.has('hit'))).toEqual(Object.keys(NO_NAMED_HIT))
  })

  const RUNNABLE_TYPES = RULE_TYPES.filter((type) => type !== 'info_only')

  it.each(RUNNABLE_TYPES)('AC-010.2: %s 종류는 걸리는 사례와 안 걸리는 사례가 있다', (type: RuleType) => {
    const list = cases().filter((c) => typeOf(c.rule) === type)
    expect(list.filter((c) => c.kind === 'hit').length, 'hit').toBeGreaterThan(0)
    expect(list.filter((c) => c.kind === 'miss').length, 'miss').toBeGreaterThan(0)
  })

  it('AC-010.2: info_only는 원본에 판정이 없어 걸리는 사례를 만들 수 없다 — 안 걸리는 사례만 있고 어느 골든에서도 걸리지 않는다', () => {
    const list = cases().filter((c) => typeOf(c.rule) === 'info_only')
    expect(list.filter((c) => c.kind === 'miss').length).toBeGreaterThan(0)
    expect(list.filter((c) => c.kind === 'hit')).toEqual([])
    const hits = allVisits().flatMap((v) => v.hits.map((h) => h.id))
    expect(hits.filter((id) => typeOf(id) === 'info_only')).toEqual([])
  })
})

describe('AC-010.7 처방 목록 찾기는 원본 병원 모드 cm과 같다', () => {
  const GOLDEN = 'rules-drug-names.json'
  const visit = (id: string) => readGolden(GOLDEN).visits.find((v) => v.id === id)

  it("AC-010.7: 요구사항의 예(종류 drug의 급여 '히알주', 무릎이 아닌 상병)가 골든에서 HY-01 확인필요와 HY-12 알림이다", () => {
    expect(visit('HY-01.hit-name-hyal-drug')?.hits.map((h) => [h.id, h.grade])).toEqual([['HY-01', '확인필요'], ['HY-12', '알림']])
  })

  it('AC-010.7: 요구사항의 표본이 골든에 모두 있다', () => {
    const samples = [
      'HY-01.hit-name-mixed-case-code', // 대소문자가 섞인 코드
      'HY-01.hit-name-hyal-drug', // 기본 이름이 든 약
      'HY-01.miss-name-other-row', // 기본 이름이 든 other 줄
      'HY-01.miss-name-confirmed-procedure-kk090', // 기본 이름이 든 확인된 시술 줄
      'HY-01.hit-name-unknown-row', // 기본 이름이 든 unknown 줄
      'HY-01.hit-name-procedure-other-fee-code', // 기본 이름이 든 미확인 procedure 줄
      'HY-01.miss-no-default-name-drug', // 기본 이름이 없는 대기 줄
      'HY-01.hit-nameless-code-holds-name', // 이름이 없고 코드에 기본 이름이 든 줄
      'HY-01.hit-two-names-merged', // 기본 이름이 둘 걸리는 줄
      'IJ-01.hit-name-tablet-history-only', // 이력에만 있는 먹는 약
      'IJ-01.hit-name-patch-history-only', // 이력에만 있는 바르는 약
    ]
    expect(samples.filter((id) => !visit(id))).toEqual([])
  })

  it('AC-010.7: 표본의 목록 줄은 도우미의 종류 다섯을 모두 쓰고, 대소문자가 섞인 코드와 이름 없는 줄이 있다', () => {
    const fake = JSON.parse(readFileSync(`${FAKE_DIR}${readGolden(GOLDEN).fake}`, 'utf-8')) as { catalog: { codes: { code: string; name: string; kind: string }[] } }
    const codes = fake.catalog.codes
    expect([...new Set(codes.map((row) => row.kind))].sort()).toEqual(['drug', 'lab', 'other', 'procedure', 'unknown'])
    expect(codes.some((row) => /[a-z]/.test(row.code) && /[A-Z]/.test(row.code))).toBe(true)
    expect(codes.some((row) => row.name === '' && row.code.includes('히알'))).toBe(true)
  })
})

describe('AC-010.1 고쳐 온 사례는 이름으로 골든과 비교한다', () => {
  // 파일 전체 비교(위)가 실패해도 어느 사례인지 시험 이름으로 보이게 한다. 기대값은 모두 골든(원본 결과)이다
  const NAMED: [file: string, id: string][] = [
    ['rules-drug-info-history-only.json', 'IJ-01.miss-nine-digit-history-only'],
    ['rules-drug-info-history-only.json', 'IJ-01.miss-catalog-fee-code-history-only'],
    ['rules-drug-info-this-month.json', 'IJ-01.hit-nine-digit-also-this-month'],
    ['rules-drug-info-this-month.json', 'IJ-01.hit-catalog-fee-code-also-this-month'],
    ['rules-drug-info-this-month.json', 'IJ-01.hit-catalog-row-also-this-month'],
    ['rules-drug-info-this-month.json', 'IJ-01.hit-fee-code-asked-by-catalog-row'],
    ['rules-drug-info-this-month.json', 'IJ-01.hit-nine-digit-row-other-fee-code'],
    ['rules-drug-info-this-month.json', 'IJ-01.miss-other-nine-digit-history-only'],
    ['rules-drug-info-not-found.json', 'IJ-01.miss-asked-code-not-in-table'],
    ['rules-drug-info-not-found.json', 'IJ-01.miss-nine-digit-history-only-empty-answer'],
    ['rules-drug-names.json', 'HY-01.miss-two-names-first-name-span'],
    ['rules-drug-names.json', 'IJ-01.hit-nameless-route-word-history-only'],
    ['rules-drug-names.json', 'HY-01.hit-nameless-procedure-fee-code'],
    ['rules-drug-names.json', 'HY-01.miss-name-confirmed-procedure-lower-fee-code'],
  ]

  it.each(NAMED)('AC-010.1: %s %s', (file, id) => {
    const golden = readGolden(file)
    const expected = golden.visits.find((v) => v.id === id)
    expect(expected, id).toBeDefined()
    const result = runRules(shapeClaimMonth(JSON.parse(readFileSync(`${FAKE_DIR}${golden.fake}`, 'utf-8'))), tables, NO_SETTINGS)
    expect(toVisits([id], result)).toEqual([expected])
  }, 60_000)
})

describe('AC-010.5 골든은 원본에 이력을 넣고 만든다', () => {
  it('AC-010.5: 어느 골든에서도 이력 건너뜀 수는 0이다', () => {
    expect(NAMES.length).toBeGreaterThan(0)
    for (const name of NAMES) {
      const golden = readGolden(name)
      expect(golden.collect.historySkips, name).toBe(0)
      for (const visit of golden.visits) expect(visit.skipped.history, `${name} ${visit.id}`).toBe(0)
    }
  })
})

describe('AC-010.6 정규식·regions 경로는 골든으로 확인한다', () => {
  it('AC-010.6: 낱말·정규식으로 판정하는 규칙(부위·좌우·레벨·기록)이 골든에서 걸린다', () => {
    const hit = new Set(NAMES.map(readGolden).flatMap((g) => g.collect.rows.map(([, id]) => id)))
    // 규칙 글의 (?i) 정규식: AG-03·HD-05·PH-12 · regions.* 경로: LA-13·LA-22·MR-02 · 묶음 이름 정규식: PH-13·XR-09
    for (const id of ['AG-03', 'HD-05', 'PH-12', 'LA-13', 'LA-22', 'MR-02', 'PH-13', 'XR-09']) expect(hit.has(id), id).toBe(true)
  })
})
