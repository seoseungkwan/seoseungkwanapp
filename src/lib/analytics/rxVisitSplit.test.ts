import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RxSplitLine } from '@/types/stats'
import {
  ANY_CODE,
  ANY_LABEL,
  formatRxVisitSplit,
  formatRxVisitSplitDays,
  rxVisitHeadline,
  rxVisitSplit,
  rxVisitSplitDays,
  type VisitRow,
} from './rxVisitSplit'

// 골든 = 원본(양지바른 2a1069b)을 python3 -I로 가짜 줄에 돌린 결과(scripts/stats/golden/rx_visit_split.py). 시험은 원본 없이 돈다.
// 머리 knownDiffs의 cases = 사례 이름 → 칸 → 그 사례에서 우리가 내야 할 값(손으로 적음). 적은 칸만 그 값과, 나머지는 원본 결과와 견준다

type KnownDiff = { what: string; why: string; cases?: Record<string, Record<string, unknown>> }
type Head = { source: string; file: string; entry: string; knownDiffs: KnownDiff[] }
type OriginalRow = { p: string; d: string; c: string; f: string }
type OriginalDay = { d: string; visits: number; patients: number; new_patients: number }
type OriginalResponse = {
  from: string
  to: string
  codes: string[]
  eswt: boolean
  visits: number
  patients: number
  new_patients: number
  invalid_codes: number
  rows: OriginalRow[]
  days: OriginalDay[]
}
type InputFile = { hospital: string; cases: { name: string; response: OriginalResponse }[] }
type GoldenFile<T> = Head & { cases: ({ name: string } & T)[] }

const GOLDEN_DIR = new URL('../../../fixtures/stats/golden/', import.meta.url)
const read = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`rx-visit-split-${name}.json`, GOLDEN_DIR), 'utf8')) as T

const INPUT = read<InputFile>('input')
const SUMMARY = read<GoldenFile<{ result: Record<string, unknown> }>>('summary')
const DAYS = read<GoldenFile<{ result: unknown }>>('days')
const TEXT = read<GoldenFile<{ headline: string; text: string; daysText: string }>>('text')
const NAMES = INPUT.cases.map((c) => c.name)
const NO_NAMES: ReadonlyMap<string, string> = new Map()

function inputOf(name: string) {
  const { response } = INPUT.cases.find((c) => c.name === name)!
  return {
    rows: response.rows.map((row): VisitRow => ({ p: Number(row.p), d: row.d, c: row.c, f: row.f })),
    totals: {
      visits: response.visits,
      patients: response.patients,
      newPatients: response.new_patients,
      invalidCodes: response.invalid_codes,
    },
    days: response.days.map((day) => ({
      date: day.d,
      visits: day.visits,
      patients: day.patients,
      newPatients: day.new_patients,
    })),
    codes: response.codes,
    range: { from: response.from, to: response.to },
  }
}

const splitOf = (name: string) => {
  const { rows, totals, codes, range } = inputOf(name)
  return rxVisitSplit(rows, totals, codes, range, NO_NAMES)
}
const daysOf = (name: string) => {
  const { rows, days, codes } = inputOf(name)
  return rxVisitSplitDays(rows, days, codes, NO_NAMES)
}
const goldenOf = <T extends { name: string }>(file: { cases: T[] }, name: string) => file.cases.find((c) => c.name === name)!
// 그 사례에서 knownDiffs가 원본과 다르게 적은 칸(없으면 빈 객체)
const oursOf = (file: Head, name: string): Record<string, unknown> => Object.assign({}, ...file.knownDiffs.map((diff) => diff.cases?.[name] ?? {}))

// 원본 줄에는 code 칸이 없다(골든 knownDiffs)
const withoutCode = (lines: readonly RxSplitLine[]) => lines.map(({ label, newPatients, returning, total }) => ({ label, newPatients, returning, total }))

const ROW = (p: number, d: string, c: string, f: string): VisitRow => ({ p, d, c, f })
const TOTALS = { visits: 9, patients: 8, newPatients: 3 }

describe('골든 파일', () => {
  it.each([
    ['summary', SUMMARY, 'summarize'],
    ['days', DAYS, 'summarize_days'],
    ['text', TEXT, 'format_text, format_days_text, headline'],
  ] as const)('AC-509.1 %s 머리에 원본 출처·입구·knownDiffs(이유 포함)가 있고 입력 사례를 모두 덮는다', (_name, golden, entry) => {
    expect(golden.source).toBe('seoseungkwan/shared@2a1069b')
    expect(golden.file).toBe('medicore/rx_visit_split.py')
    expect(golden.entry).toBe(entry)
    expect(Array.isArray(golden.knownDiffs)).toBe(true)
    for (const diff of golden.knownDiffs) {
      expect(diff.what).not.toBe('')
      expect(diff.why).not.toBe('')
    }
    expect(golden.cases.map((c) => c.name)).toEqual(NAMES)
  })

  it('AC-509.1 입력은 가짜 자료다: 차트번호는 9로 시작하는 6자리, 고른 처방 5개·ESWT 끔, 기간 첫날 전·기간 안 신환·재진이 다 있다', () => {
    for (const { response } of INPUT.cases) {
      expect(response.eswt).toBe(false)
      for (const row of response.rows) expect(row.p).toMatch(/^9\d{5}$/)
    }
    const { response } = INPUT.cases[0]
    expect(response.codes).toHaveLength(5)
    expect(response.rows.some((row) => row.f < response.from)).toBe(true)
    expect(response.rows.some((row) => row.f === response.from)).toBe(true)
    expect(response.rows.some((row) => row.f > response.from && row.f === row.d)).toBe(true)
    expect(response.rows.some((row) => row.f >= response.from && row.f < row.d)).toBe(true)
  })
})

describe('AC-509.1 rxVisitSplit — 원본 summarize', () => {
  it.each(NAMES)('%s: 골든과 순서까지 같다(knownDiffs cases에 적은 칸은 그 값, AC-3802.1)', (name) => {
    const { lines, ...rest } = splitOf(name)
    expect({ ...rest, lines: withoutCode(lines) }).toEqual({ ...goldenOf(SUMMARY, name).result, ...oursOf(SUMMARY, name) })
  })

  const RANGE = { from: '2026-10-01', to: '2026-10-31' }

  it('처방 줄의 code는 처방코드, 하나라도 줄의 code는 ANY_CODE다', () => {
    const { lines } = rxVisitSplit([ROW(1, '2026-10-02', 'A', '2026-10-02')], TOTALS, ['A', 'B'], RANGE, NO_NAMES)
    expect(lines.map((line) => [line.code, line.label])).toEqual([
      ['A', 'A'],
      ['B', 'B'],
      [ANY_CODE, ANY_LABEL],
    ])
  })

  it('이름이 있으면 줄 이름은 처방 이름, 없거나 빈 글자면 코드다', () => {
    const names = new Map([
      ['A', '가짜처방'],
      ['B', ''],
    ])
    const { lines } = rxVisitSplit([], TOTALS, ['A', 'B', 'C'], RANGE, names)
    expect(lines.slice(0, 3).map((line) => line.label)).toEqual(['가짜처방', 'B', 'C'])
  })

  it('같은 코드를 두 번 줘도 줄은 하나다(원본 dict)', () => {
    const { lines } = rxVisitSplit([], TOTALS, ['A', 'A'], RANGE, NO_NAMES)
    expect(lines.map((line) => line.code)).toEqual(['A'])
  })

  it('목록에 없는 코드의 줄도 하나라도 줄에는 든다(원본 줄 그대로)', () => {
    const { lines } = rxVisitSplit([ROW(1, '2026-10-02', 'Z', '2026-10-02')], TOTALS, ['A', 'B'], RANGE, NO_NAMES)
    expect(lines.map((line) => line.total)).toEqual([0, 0, 1])
  })

  it('Worker 메모리에는 기간 밖 줄도 있다: 기간 안 줄만 센다', () => {
    const rows = [ROW(1, '2026-09-30', 'A', '2026-09-30'), ROW(2, '2026-10-01', 'A', '2026-01-01'), ROW(3, '2026-10-31', 'A', '2026-10-31'), ROW(4, '2026-11-01', 'A', '2026-11-01')]
    const [line] = rxVisitSplit(rows, TOTALS, ['A'], RANGE, NO_NAMES).lines
    expect(line).toMatchObject({ newPatients: 1, returning: 1, total: 2 })
  })

  it('첫 내원을 못 찾은 환자(f 빈 글자)는 신환이 아니다', () => {
    const [line] = rxVisitSplit([ROW(1, '2026-10-02', 'A', '')], TOTALS, ['A'], RANGE, NO_NAMES).lines
    expect(line).toMatchObject({ newPatients: 0, returning: 1, total: 1 })
  })

  it('같은 환자가 여러 번 받아도 한 명이다', () => {
    const rows = [ROW(1, '2026-10-02', 'A', '2026-10-02'), ROW(1, '2026-10-09', 'A', '2026-10-02')]
    const [line] = rxVisitSplit(rows, TOTALS, ['A'], RANGE, NO_NAMES).lines
    expect(line.total).toBe(1)
  })

  it('invalidCodes를 주지 않으면 0이다(도우미 답에는 이 칸이 없다)', () => {
    expect(rxVisitSplit([], TOTALS, [], RANGE, NO_NAMES)).toEqual({
      from: RANGE.from,
      to: RANGE.to,
      visits: 9,
      patients: 8,
      newPatients: 3,
      returning: 5,
      lines: [],
      invalidCodes: 0,
    })
  })
})

// rx-split-new: 신환 = 우리 병원 최초 내원일(f)에 받은 처방. 차트번호·처방코드는 가짜(X·Y)
describe('REQ-3801 rxVisitSplit — 기간 처방 줄은 최초 내원일(f)에 받은 처방만 신환', () => {
  const RANGE_30 = { from: '2026-10-01', to: '2026-10-30' }
  const A = 1
  const B = 2
  const C = 3
  const D = 4
  const split = (rows: VisitRow[], codes: string[]) => rxVisitSplit(rows, TOTALS, codes, RANGE_30, NO_NAMES).lines

  it('AC-3801.1: f(10-15)에 받은 X는 신환 1·재진 0, 다시 온 날(10-20) 받은 Y는 신환 0·재진 1', () => {
    const rows = [ROW(A, '2026-10-15', 'X', '2026-10-15'), ROW(A, '2026-10-20', 'Y', '2026-10-15')]
    expect(split(rows, ['X', 'Y']).slice(0, 2)).toEqual([
      { code: 'X', label: 'X', newPatients: 1, returning: 0, total: 1 },
      { code: 'Y', label: 'Y', newPatients: 0, returning: 1, total: 1 },
    ])
  })

  it('AC-3801.2: 같은 X를 f 날과 그 뒤 날 모두 받으면 X 줄은 신환 1·재진 0·합계 1(줄 차례와 상관없다)', () => {
    const later = ROW(A, '2026-10-22', 'X', '2026-10-15')
    const first = ROW(A, '2026-10-15', 'X', '2026-10-15')
    for (const rows of [[first, later], [later, first]]) {
      expect(split(rows, ['X'])).toEqual([{ code: 'X', label: 'X', newPatients: 1, returning: 0, total: 1 }])
    }
  })

  it('AC-3801.2: 하나라도 줄 — f 날 진료 줄이 하나라도 있으면 신환, f가 기간 안이어도 f 날 줄 없이 다른 날만 있으면 재진', () => {
    const rows = [
      ROW(A, '2026-10-20', 'Y', '2026-10-15'),
      ROW(A, '2026-10-15', 'X', '2026-10-15'), // A: f 날 줄이 있다 → 신환
      ROW(B, '2026-10-12', 'Y', '2026-10-10'), // B: f(10-10)가 기간 안이지만 그날 줄이 없다 → 재진
      ROW(B, '2026-10-18', 'X', '2026-10-10'),
    ]
    const lines = split(rows, ['X', 'Y'])
    expect(lines.at(-1)).toEqual({ code: ANY_CODE, label: ANY_LABEL, newPatients: 1, returning: 1, total: 2 })
    expect(lines.slice(0, 2).map(({ newPatients, returning, total }) => [newPatients, returning, total])).toEqual([
      [1, 1, 2],
      [0, 2, 2],
    ])
  })

  it('AC-3801.3: f가 빈 글자인 줄, f가 기간 첫날 전인 환자의 줄은 모두 재진이다(지금 규칙 그대로)', () => {
    const rows = [
      ROW(C, '2026-10-05', 'X', ''),
      ROW(C, '2026-10-06', 'Y', ''),
      ROW(D, '2026-10-01', 'X', '2026-09-30'),
      ROW(D, '2026-10-29', 'Y', '2026-09-30'),
    ]
    expect(split(rows, ['X', 'Y'])).toEqual([
      { code: 'X', label: 'X', newPatients: 0, returning: 2, total: 2 },
      { code: 'Y', label: 'Y', newPatients: 0, returning: 2, total: 2 },
      { code: ANY_CODE, label: ANY_LABEL, newPatients: 0, returning: 2, total: 2 },
    ])
  })
})

describe('REQ-3802 골든 머리 knownDiffs — 원본과 일부러 다른 곳', () => {
  const RULE = '신환은 진료일이 우리 병원 최초 내원일(f)인 줄'
  type Line = { label: string; newPatients: number; returning: number; total: number }
  const ruleOf = (file: Head) => {
    const diffs = file.knownDiffs.filter((diff) => diff.cases !== undefined)
    expect(diffs.map((diff) => diff.what)).toEqual([RULE])
    return diffs[0] as Required<KnownDiff>
  }

  it('AC-3802.1: 요약·글 머리에 이 차이 한 줄(what·why·cases)이 있고 cases에는 five-codes만 있다. 날짜별 머리에는 없다', () => {
    for (const file of [SUMMARY, TEXT]) {
      const diff = ruleOf(file)
      expect(diff.why).not.toBe('')
      expect(Object.keys(diff.cases)).toEqual(['five-codes'])
    }
    expect(DAYS.knownDiffs.some((diff) => diff.cases !== undefined)).toBe(false)
  })

  it('AC-3802.1: 요약 five-codes는 lines 칸만 — 도수 줄 신환 0·재진 2·합계 2, 하나라도 줄 3·4·7, 나머지 줄은 원본 그대로', () => {
    const ours = ruleOf(SUMMARY).cases['five-codes']
    expect(Object.keys(ours)).toEqual(['lines'])
    const original = goldenOf(SUMMARY, 'five-codes').result.lines as Line[]
    const lines = ours.lines as Line[]
    expect(lines.map((line) => line.label)).toEqual(original.map((line) => line.label))
    expect(lines.filter((line, i) => JSON.stringify(line) !== JSON.stringify(original[i]))).toEqual([
      { label: '도수', newPatients: 0, returning: 2, total: 2 },
      { label: ANY_LABEL, newPatients: 3, returning: 4, total: 7 },
    ])
  })

  it('AC-3802.1: 글 five-codes는 text 칸만 — 원본 글에서 도수·하나라도 두 줄만 바뀐다', () => {
    const ours = ruleOf(TEXT).cases['five-codes']
    expect(Object.keys(ours)).toEqual(['text'])
    const original = goldenOf(TEXT, 'five-codes').text.split('\n')
    const lines = (ours.text as string).split('\n')
    expect(lines).toHaveLength(original.length)
    expect(lines.filter((line, i) => line !== original[i])).toEqual(['도수               0명    2명    2명', '고른 처방 중 하나라도     3명    4명    7명'])
  })
})

describe('AC-509.2 rxVisitSplitDays — 원본 summarize_days', () => {
  it.each(NAMES)('%s: 골든과 순서까지 같다', (name) => {
    const days = daysOf(name).map(({ lines, ...rest }) => ({ ...rest, lines: withoutCode(lines) }))
    expect(days).toEqual(goldenOf(DAYS, name).result)
  })

  it('첫 내원을 못 찾은 환자(f 빈 글자)는 어느 날에도 신환이 아니다', () => {
    const [day] = rxVisitSplitDays(
      [{ p: 1, d: '2026-10-02', c: 'A', f: '' }],
      [{ date: '2026-10-02', visits: 1, patients: 1, newPatients: 0 }],
      ['A'],
      NO_NAMES,
    )
    expect(day.lines[0]).toMatchObject({ newPatients: 0, returning: 1, total: 1 })
  })
})

describe('AC-509.3 글 — 원본 headline·format_text·format_days_text', () => {
  // knownDiffs cases에 적은 칸은 그 값, 나머지는 원본 글(AC-3802.1)
  const textOf = (name: string) => ({ ...goldenOf(TEXT, name), ...oursOf(TEXT, name) }) as { headline: string; text: string; daysText: string }

  it.each(NAMES)('%s: rxVisitHeadline이 골든과 같다', (name) => {
    expect(rxVisitHeadline(splitOf(name))).toBe(textOf(name).headline)
  })

  it.each(NAMES)('%s: formatRxVisitSplit이 골든과 같다', (name) => {
    expect(formatRxVisitSplit(INPUT.hospital, splitOf(name))).toBe(textOf(name).text)
  })

  it.each(NAMES)('%s: formatRxVisitSplitDays가 골든과 같다', (name) => {
    expect(formatRxVisitSplitDays(INPUT.hospital, splitOf(name), daysOf(name))).toBe(textOf(name).daysText)
  })

  it('글에 차트번호가 없다', () => {
    for (const { name, response } of INPUT.cases) {
      const text = formatRxVisitSplit(INPUT.hospital, splitOf(name)) + formatRxVisitSplitDays(INPUT.hospital, splitOf(name), daysOf(name))
      for (const row of response.rows) expect(text).not.toContain(row.p)
    }
  })
})
