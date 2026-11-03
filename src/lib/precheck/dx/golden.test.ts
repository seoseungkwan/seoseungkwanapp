import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { shapeClaimMonth } from '@/lib/precheck/shape'
import type { DxIssue, DxLink, DxRecommendation, Visit } from '@/types/precheck'
import {
  dxContext,
  dxIssues,
  missingDx,
  needsCheck,
  packDxLinks,
  readDxLinks,
  recommendDx,
} from './recommend'

// 원본(seoseungkwan/shared@2a1069b)을 가짜 자료로 돌려 둔 골든과 깊은 비교(순서까지). design.md 10절.
// 골든은 scripts/precheck/golden/dx.mjs가 만든다. 이 시험은 원본 없이 커밋한 골든 파일과 견준다

type VisitGolden = { id: string; issues: DxIssue[]; needsCheck: boolean; missingDx: boolean }
type Scenario = {
  name: string
  acs: string
  trend: boolean
  hasDx: boolean
  links: DxLink[]
  memoVisits: string[]
  recommend: { code: string; name: string; out: DxRecommendation }[]
  visits: VisitGolden[]
}
type Golden = {
  source: string
  file: string
  fileSha256: string
  entry: string
  fake: string
  knownDiffs: { where: string; why: string }[]
  linkRows: { rejected: unknown[][]; accepted: { rows: unknown[]; out: DxLink[] }[] }
  /** 원본 restore의 줄 수 한계: accepted줄은 받아 kept줄이 남고 rejected줄은 거절한다. 줄이 많아 수만 적었다 */
  linkLimits: { row: DxLink; accepted: number; kept: number; rejected: number }
  /** knownDiffs가 실제로 드러나는 사례. out은 원본 결과이고, 우리는 dx 줄의 이름만 ours로 다르다 */
  knownDiffCases: { where: string; scenario: string; code: string; name: string; dx: string; ours: string; out: DxRecommendation }[]
  scenarios: Scenario[]
}

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url))
const golden = JSON.parse(readFileSync(fromRoot('fixtures/precheck/golden/dx-check.json'), 'utf-8')) as Golden
const month = shapeClaimMonth(JSON.parse(readFileSync(fromRoot(golden.fake), 'utf-8')))

function contextOf(scenario: Scenario) {
  return dxContext({
    trend: scenario.trend ? month.dxTrend : null,
    links: scenario.links,
    visits: month.visits,
    hasDx: scenario.hasDx,
    hasMemo: (visit: Visit) => scenario.memoVisits.includes(visit.key),
  })
}

describe('AC-011.1 AC-011.2 AC-011.3 골든 파일', () => {
  it('AC-011.1: 머리에 원본·파일·입구가 있고, 일부러 다른 것은 이유와 함께 적혀 있다', () => {
    expect(golden.source).toBe('seoseungkwan/shared@2a1069b')
    expect(golden.file).toBe('assets/mx999_v22.html')
    expect(golden.fileSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(golden.entry).toMatch(/new-medicore-dx-recommend/)
    for (const diff of golden.knownDiffs) {
      expect(diff.where.length, diff.where).toBeGreaterThan(0)
      expect(diff.why.length, diff.where).toBeGreaterThan(0)
    }
  })

  it('AC-011.2: 가짜 진료 수가 원본에 넣은 진료 수와 같다', () => {
    for (const scenario of golden.scenarios) {
      expect(scenario.visits.map((v) => v.id), scenario.name).toEqual(month.visits.map((v) => v.key))
    }
  })

  it('AC-011.3: 사례가 빈 결과로 통과하지 않는다(걸리는 경우가 골든에 있다)', () => {
    const rows = golden.scenarios.flatMap((s) => s.recommend.flatMap((r) => r.out.list))
    const visits = golden.scenarios.flatMap((s) => s.visits)
    const issues = visits.flatMap((v) => v.issues)
    expect(rows.some((r) => r.src.length > 0 && r.t)).toBe(true) // 연결표 + 경향이 한 줄에
    expect(rows.some((r) => r.ex)).toBe(true)
    expect(rows.some((r) => r.t?.common)).toBe(true)
    expect(rows.some((r) => r.src.includes('staff'))).toBe(true)
    expect(rows.some((r) => r.src.includes('record'))).toBe(true)
    expect(issues.some((x) => x.gosi)).toBe(true)
    expect(issues.some((x) => !x.gosi)).toBe(true)
    expect(issues.some((x) => x.record)).toBe(true)
    expect(visits.some((v) => v.missingDx)).toBe(true)
    expect(visits.some((v) => v.needsCheck && !v.missingDx)).toBe(true)
    expect(visits.some((v) => !v.needsCheck)).toBe(true)
    // AC-011.4: 추세 없는 사례가 있고, 그래도 추천이 나온다
    const noTrend = golden.scenarios.filter((s) => !s.trend)
    expect(noTrend.length).toBeGreaterThan(0)
    for (const s of noTrend) expect(s.recommend.some((r) => r.out.list.length > 0), s.name).toBe(true)
  })
})

describe.each(golden.scenarios)('$name ($acs)', (scenario) => {
  const ctx = contextOf(scenario)

  it.each(scenario.recommend)('AC-011.1 AC-011.3 AC-011.4: recommendDx($code, $name)가 원본 recommend와 같다', ({ code, name, out }) => {
    expect(recommendDx(code, name, ctx)).toEqual(out)
  })

  it.each(month.visits.map((visit, index) => ({ id: visit.key, visit, want: scenario.visits[index] })))(
    'AC-011.2: 진료 $id의 dxIssues·needsCheck·missingDx가 원본과 같다',
    ({ visit, want }) => {
      expect(dxIssues(visit, ctx)).toEqual(want.issues)
      expect(needsCheck(visit, ctx)).toBe(want.needsCheck)
      expect(missingDx(visit, ctx)).toBe(want.missingDx)
    },
  )
})

describe('AC-011.3 연결표 읽기가 원본 restore와 같다', () => {
  it.each(golden.linkRows.accepted.map((item, index) => ({ index, ...item })))('AC-011.3: 받는 줄 $index', ({ rows, out }) => {
    expect(packDxLinks(readDxLinks(rows))).toEqual(out)
  })

  it.each(golden.linkRows.rejected.map((rows, index) => ({ index, rows })))('AC-011.3: 거절하는 줄 $index', ({ rows }) => {
    expect(() => readDxLinks(rows)).toThrow(TypeError)
  })

  it('AC-011.3: 줄 수 한계가 원본과 같다', () => {
    const { row, accepted, kept, rejected } = golden.linkLimits
    const rows = (length: number) => Array.from({ length }, () => row)
    expect(readDxLinks(rows(accepted))).toHaveLength(kept)
    expect(() => readDxLinks(rows(rejected))).toThrow(TypeError)
  })
})

describe('AC-011.1 일부러 다른 것(knownDiffs)은 적은 만큼만 다르다', () => {
  it.each(golden.knownDiffCases)('AC-011.1: $where — recommendDx($code)에서 $dx 줄의 이름만 원본과 다르다', ({ where, scenario, code, name, dx, ours, out }) => {
    expect(golden.knownDiffs.map((diff) => diff.where)).toContain(where)
    expect(out.list.find((row) => row.dx === dx)?.nm).not.toBe(ours) // 원본은 정말 다르다
    const want = { ...out, list: out.list.map((row) => (row.dx === dx ? { ...row, nm: ours } : row)) }
    expect(recommendDx(code, name, contextOf(golden.scenarios.find((s) => s.name === scenario)!))).toEqual(want)
  })
})
