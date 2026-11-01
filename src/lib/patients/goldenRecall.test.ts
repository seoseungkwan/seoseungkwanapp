import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addMonthsToDay } from '@/lib/analytics/dates'
import { recallBulkRecords, type RecallCasesFile } from '../../../fixtures/patients/make-fake-patients'
import { phoneOf, preparePhones, prepareSchedule } from './followup'
import {
  KEEP_MONTHS,
  MAX_RECORDS,
  RECALL_DEFAULTS,
  ingestRecall,
  prepareRx,
  recallCompute,
  recallCopyLines,
  recallCoverage,
  recallPhones,
  recallSelect,
  recallStatus,
  roundTest,
  validateHistory,
  type RecallRule,
} from './recall'
import { PatientsSourceError } from './sourceError'
import type { PatientsSourceReason, RecallHistory, RecallRecord } from '@/types/patients'

// 골든 시험: 같은 가짜 자료를 원본(seoseungkwan/shared@2a1069b)에 넣은 결과(fixtures/patients/golden/recall-*.json)와
// 우리 함수의 결과를 순서까지 깊게 견준다. 원본 결과는 scripts/patients/golden/recall.mjs가 만든다(원본은 저장소 밖).
// 일부러 다르게 한 것은 골든 파일의 knownDiffs에 이유와 함께 적은 사례뿐이다. 적지 않은 차이는 실패다.

const ROOT = new URL('../../../', import.meta.url)
const bytes = (rel: string) => readFileSync(new URL(rel, ROOT))
const json = <T>(rel: string): T => JSON.parse(bytes(rel).toString('utf8')) as T
const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')

type KnownDiff = { entry: string; field: string; reason: string; cases?: Record<string, unknown> }
type Head = { source: string; file: string; entry: string[]; inputs: { path: string; sha256: string }[]; knownDiffs: KnownDiff[] }
type Thrown = { throws: true; message: string }
type Item = { ruleId: string; label: string; months: number; chart: string; name: string; phone: string; last: string; due: string; evidence: string }
type Summary = { from: string; count: number; first: RecallRecord[]; last: RecallRecord[]; sha256: string }

type IngestGolden = Head & {
  limits: { KEEP_MONTHS: number; MAX_RECORDS: number }
  rx: ({ id: string } & (Thrown | { result: [string, string[]][] }))[]
  validate: ({ id: string } & (Thrown | { result: { from: string | null; records: RecallRecord[] } }))[]
  ingest: { id: string; result: { from: string; records: RecallRecord[] } }[]
  bulk: {
    validate: ({ count: number } & (Thrown | { result: Summary }))[]
    ingest: { id: string; result: Summary }[]
  }
}
type ComputeGolden = Head & {
  defaults: RecallRule[]
  roundTest: { round: string; text: string; result: boolean }[]
  addMonths: { date: string; months: number; result: string }[]
  compute: ({ id: string } & (Thrown | { result: Item[] }))[]
  select: { from: string | null; to: string | null; overdue: boolean; today: string; items: { ruleId: string; chart: string; due: string }[] }[]
  status: { today: string; items: { ruleId: string; chart: string; status: string }[] }[]
}
type CoverageGolden = Head & { cases: { id: string; result: { records: number; from: string | null; short: { label: string; months: number }[] } }[] }
type CopyGolden = Head & {
  cases: {
    id: string
    loaded: boolean
    lines: { copied: string | null; people: number; toast?: string }
    phones: { copied: string; count: number; missing: number } | { copied: null; toast: string }
  }[]
}

const INGEST = json<IngestGolden>('fixtures/patients/golden/recall-ingest.json')
const COMPUTE = json<ComputeGolden>('fixtures/patients/golden/recall-compute.json')
const COVERAGE = json<CoverageGolden>('fixtures/patients/golden/recall-coverage.json')
const COPY = json<CopyGolden>('fixtures/patients/golden/recall-copy.json')
const CASES = json<RecallCasesFile>('fixtures/patients/fake/recall-cases.json')

// 정기 주사 쪽에서 멈추는 자리의 원본 글. row-unreadable은 여기서 '쌓인 기록을 읽지 못함'이다(validateHistory만 던진다)
const ORIGINAL_MESSAGE: Partial<Record<PatientsSourceReason, string>> = {
  'header-missing': '필수 열 이름을 찾지 못했습니다. 선택한 통계 파일을 확인해 주세요.',
  'header-duplicate': '필수 열 이름이 중복되어 자료를 구분할 수 없습니다.',
  'row-unreadable': '쌓인 정기 주사 기록 형식을 확인해 주세요.',
}

function expectSameThrow(run: () => unknown, golden: Thrown) {
  let thrown: unknown = null
  try {
    run()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(PatientsSourceError)
  const error = thrown as PatientsSourceError
  expect(error.code).toBe('E-PATIENTS-SOURCE')
  expect(ORIGINAL_MESSAGE[error.reason]).toBe(golden.message)
}

// 적어 둔 사례의 값(사례 id → 우리가 내야 할 값). 없으면 undefined
const listedCases = (head: Head, entry: string): Record<string, unknown> => {
  const found = head.knownDiffs.find((diff) => diff.entry === entry && diff.cases)
  if (!found?.cases) throw new Error(`knownDiffs에 ${entry}가 없다`)
  return found.cases
}

const byId = <T extends { id: string }>(list: readonly T[], id: string): T => {
  const found = list.find((c) => c.id === id)
  if (!found) throw new Error(`사례가 없다: ${id}`)
  return found
}

const rxShape = (map: Map<string, Set<string>>) => [...map].map(([key, codes]) => [key, [...codes]])
const pieceOf = (chart: unknown[][] | null, rx: unknown[][] | null) => ({
  visits: chart ? prepareSchedule(chart).visits : [],
  rx: rx ? prepareRx(rx) : new Map<string, Set<string>>(),
  phones: rx ? preparePhones(rx, true).map : (Object.create(null) as Record<string, string>),
})
const rulesOf = (rules: RecallCasesFile['compute'][number]['rules']): readonly RecallRule[] => rules ?? RECALL_DEFAULTS
const summary = (h: RecallHistory): Summary => ({
  from: h.from as string,
  count: h.records.length,
  first: h.records.slice(0, 3),
  last: h.records.slice(-3),
  sha256: sha256(JSON.stringify(h.records)),
})

describe('골든 파일 머리', () => {
  it.each([
    ['recall-ingest', INGEST],
    ['recall-compute', COMPUTE],
    ['recall-coverage', COVERAGE],
    ['recall-copy', COPY],
  ] as const)('AC-603.1~AC-603.5 %s: 원본 2a1069b, 넣은 가짜 자료가 지금 것과 같다, 차이는 이유와 함께', (_name, head) => {
    expect(head.source).toBe('seoseungkwan/shared@2a1069b')
    expect(head.file).toBe('YangjiBareun_사전점검/assets/revisit_schedule.html')
    expect(head.entry.length).toBeGreaterThan(0)
    expect(head.inputs.map((input) => input.path)).toEqual(['fixtures/patients/fake/recall-cases.json'])
    for (const input of head.inputs) expect(sha256(bytes(input.path)), input.path).toBe(input.sha256)
    for (const diff of head.knownDiffs) {
      expect(diff.reason.trim().length, `${diff.entry}.${diff.field}`).toBeGreaterThan(0)
      expect(head.entry).toContain(diff.entry)
    }
  })
})

describe('AC-603.1 골든: RECALL_DEFAULTS·roundTest·addMonthsToDay', () => {
  it('AC-603.1 RECALL_DEFAULTS는 원본 DEFAULTS와 같다', () => {
    expect(RECALL_DEFAULTS).toEqual(COMPUTE.defaults)
  })

  it('AC-603.1 roundTest: 사례 수가 같고, 결과가 사례마다 같다', () => {
    expect(COMPUTE.roundTest.map(({ round, text }) => ({ round, text }))).toEqual(CASES.round)
    expect(COMPUTE.roundTest.filter((c) => c.result).length).toBeGreaterThan(5)
    expect(COMPUTE.roundTest.filter((c) => !c.result).length).toBeGreaterThan(5)
    COMPUTE.roundTest.forEach(({ round, text, result }, index) => {
      expect(roundTest(round)(text), `사례 ${index}`).toBe(result)
    })
  })

  it('AC-603.1 addMonthsToDay: 사례 수가 같고, 결과가 사례마다 같다', () => {
    expect(COMPUTE.addMonths.map(({ date, months }) => ({ date, months }))).toEqual(CASES.addMonths)
    for (const { date, months, result } of COMPUTE.addMonths) {
      expect(addMonthsToDay(date, months), `${date} + ${months}`).toBe(result)
    }
  })
})

describe('AC-603.2 골든: prepareRx·validateHistory·ingestRecall', () => {
  it('AC-603.2 KEEP_MONTHS·MAX_RECORDS는 원본 값과 같다', () => {
    expect({ KEEP_MONTHS, MAX_RECORDS }).toEqual(INGEST.limits)
  })

  it('AC-603.2 사례가 가짜 자료와 같고, 멈추는 사례와 되는 사례가 다 있다', () => {
    expect(INGEST.rx.map((c) => c.id)).toEqual(CASES.rx.map((c) => c.id))
    expect(INGEST.validate.map((c) => c.id)).toEqual(CASES.validate.map((c) => c.id))
    expect(INGEST.ingest.map((c) => c.id)).toEqual(CASES.ingest.map((c) => c.id))
    expect(INGEST.rx.filter((c) => 'throws' in c).length).toBeGreaterThanOrEqual(5)
    expect(INGEST.validate.filter((c) => 'throws' in c).length).toBeGreaterThanOrEqual(13)
    expect(INGEST.validate.filter((c) => 'result' in c).length).toBeGreaterThanOrEqual(16)
  })

  it.each(INGEST.rx.map((c) => [c.id, c] as const))('AC-603.2 prepareRx %s', (id, golden) => {
    const { rows } = byId(CASES.rx, id)
    if ('throws' in golden) expectSameThrow(() => prepareRx(rows), golden)
    else expect(rxShape(prepareRx(rows))).toEqual(golden.result)
  })

  it.each(INGEST.validate.map((c) => [c.id, c] as const))('AC-603.2 validateHistory %s', (id, golden) => {
    const { value } = byId(CASES.validate, id)
    if ('throws' in golden) expectSameThrow(() => validateHistory(value), golden)
    else expect(validateHistory(value)).toEqual({ ...golden.result, readThrough: listedCases(INGEST, 'validateHistory')[id] })
  })

  it.each(INGEST.ingest.map((c) => [c.id, c] as const))('AC-603.2 ingestRecall %s', (id, golden) => {
    const c = byId(CASES.ingest, id)
    const ours = ingestRecall(c.history, { ...pieceOf(c.chart, c.rx), from: c.from, to: c.to }, c.codes, c.today)
    expect(ours).toEqual({ ...golden.result, readThrough: listedCases(INGEST, 'ingestRecall')[id] })
  })

  it('AC-603.2 knownDiffs: readThrough는 되는 사례마다 손으로 적혀 있고 다른 사례는 없다', () => {
    const okIds = INGEST.validate.filter((c) => 'result' in c).map((c) => c.id).sort()
    expect(Object.keys(listedCases(INGEST, 'validateHistory')).sort()).toEqual(okIds)
    const ingestIds = [...INGEST.ingest.map((c) => c.id), ...INGEST.bulk.ingest.map((c) => c.id)].sort()
    expect(Object.keys(listedCases(INGEST, 'ingestRecall')).sort()).toEqual(ingestIds)
    // 원본에는 없는 칸이다
    for (const c of INGEST.ingest) expect(Object.keys(c.result).sort(), c.id).toEqual(['from', 'records'])
  })

  it('AC-603.2 원본이 멈추는 자리의 오류는 환자 값 없이 정해 둔 이유뿐이다', () => {
    expect(() => validateHistory({ from: '가상환자01', records: [] })).toThrow(/^E-PATIENTS-SOURCE \(row-unreadable\)$/)
    expect(() => prepareRx([['처방코드', '900001']])).toThrow(/^E-PATIENTS-SOURCE \(header-missing\)$/)
  })

  describe('50,000건 한도(실제 수)', () => {
    const { bulk } = CASES
    const history = (count: number): RecallHistory => ({ from: bulk.start, readThrough: null, records: recallBulkRecords(bulk, count) })

    it('AC-603.2 validateHistory: 50,000건은 그대로, 50,001건은 원본처럼 멈춘다', () => {
      const [atLimit, overLimit] = INGEST.bulk.validate
      expect(atLimit.count).toBe(50_000)
      expect(overLimit.count).toBe(50_001)
      if ('throws' in atLimit || !('throws' in overLimit)) throw new Error('골든 모양이 다르다')
      expect(summary(validateHistory(history(atLimit.count)))).toEqual(atLimit.result)
      expectSameThrow(() => validateHistory(history(overLimit.count)), overLimit)
    })

    it('AC-603.2 ingestRecall: 50,000 + 새 기록 1건 = 50,001건이면 가장 오래된 것만 빠진다(멈추지 않는다)', () => {
      const golden = byId(INGEST.bulk.ingest, 'over-limit')
      const ours = ingestRecall(history(bulk.counts.atLimit), { ...pieceOf(bulk.chart, bulk.rx), from: bulk.from, to: bulk.to }, bulk.codes, bulk.today)
      expect(summary(ours)).toEqual(golden.result)
      expect(ours.readThrough).toBe(listedCases(INGEST, 'ingestRecall')['over-limit'])
      expect(ours.records).toHaveLength(50_000)
      expect(golden.result.count).toBe(50_000)
      // 같은 날 중 차트번호가 가장 작은 첫 기록(900000)이 빠지고 다음이 맨 앞이다
      expect(golden.result.first[0].date).toBe(bulk.start)
      expect(ours.records.some((r) => r.chart === String(bulk.firstChart))).toBe(false)
    })

    it('AC-603.2 ingestRecall: 딱 50,000건이면 하나도 빠지지 않는다', () => {
      const golden = byId(INGEST.bulk.ingest, 'at-limit')
      const ours = ingestRecall(history(bulk.counts.atLimit), { ...pieceOf(null, null), from: bulk.from, to: bulk.to }, bulk.codes, bulk.today)
      expect(summary(ours)).toEqual(golden.result)
      expect(ours.readThrough).toBe(listedCases(INGEST, 'ingestRecall')['at-limit'])
    })
  })
})

describe('AC-603.3 골든: recallCompute·recallSelect·recallStatus', () => {
  const mainItems = () => recallCompute(byId(CASES.compute, 'main').records, RECALL_DEFAULTS)
  const isNonsense = (due: string) => !/^\d{4}-\d{2}-\d{2}$/.test(due)

  it('AC-603.3 사례가 가짜 자료와 같다', () => {
    expect(COMPUTE.compute.map((c) => c.id)).toEqual(CASES.compute.map((c) => c.id))
    expect(COMPUTE.select).toHaveLength(CASES.select.length)
    expect(COMPUTE.status.map((c) => c.today)).toEqual(CASES.status)
    const main = byId(COMPUTE.compute, 'main')
    if ('throws' in main) throw new Error('골든 모양이 다르다')
    expect(main.result.length).toBeGreaterThan(20)
  })

  it.each(COMPUTE.compute.map((c) => [c.id, c] as const))('AC-603.3 recallCompute %s', (id, golden) => {
    const c = byId(CASES.compute, id)
    const listed = listedCases(COMPUTE, 'recallCompute')
    const expected = id in listed ? listed[id] : 'result' in golden ? golden.result : undefined
    expect(recallCompute(c.records, rulesOf(c.rules))).toEqual(expected)
  })

  it('AC-603.3 knownDiffs: 원본이 말이 안 되는 날짜를 찍거나 TypeError로 멈춘 사례만 정확히 적혀 있다', () => {
    const odd = COMPUTE.compute
      .filter((c) => 'throws' in c || c.result.some((item) => isNonsense(item.due)))
      .map((c) => c.id)
      .sort()
    const listed = listedCases(COMPUTE, 'recallCompute')
    expect(Object.keys(listed).sort()).toEqual(odd)
    expect(odd).toEqual(['bad-dates', 'far-dates'])
    // 우리 쪽 값에는 말이 안 되는 날짜가 없다
    for (const id of odd) for (const item of listed[id] as Item[]) expect(isNonsense(item.due), id).toBe(false)
    // 원본의 나머지 줄은 그대로다: 적어 둔 값 = 원본 결과에서 말이 안 되는 날짜 줄만 뺀 것
    const far = byId(COMPUTE.compute, 'far-dates')
    if ('throws' in far) throw new Error('골든 모양이 다르다')
    expect(listed['far-dates']).toEqual(far.result.filter((item) => !isNonsense(item.due)))
    // 원본도 멈추지 않는 이상한 날짜 사례는 차이로 적지 않는다
    expect(Object.keys(listed)).not.toContain('bad-date-not-matching')
    // 원본이 멈추는 쪽은 정해 둔 멈춤이 아니라 처리되지 않은 TypeError다
    const bad = byId(COMPUTE.compute, 'bad-dates')
    if (!('throws' in bad)) throw new Error('골든 모양이 다르다')
    expect(bad.message).toContain('getFullYear')
  })

  it.each(COMPUTE.select.map((c, index) => [index, c] as const))('AC-603.3 recallSelect 사례 %i', (_index, golden) => {
    const ours = recallSelect(mainItems(), golden.from, golden.to, golden.overdue, golden.today)
    expect(ours.map(({ ruleId, chart, due }) => ({ ruleId, chart, due }))).toEqual(golden.items)
  })

  it('AC-603.3 recallSelect 사례의 조합이 가짜 자료와 같다', () => {
    expect(COMPUTE.select.map(({ from, to, overdue, today }) => ({ from, to, overdue, today }))).toEqual(CASES.select)
  })

  it.each(COMPUTE.status.map((c) => [c.today, c] as const))('AC-603.3 recallStatus 오늘 %s', (today, golden) => {
    const ours = mainItems().map((item) => ({ ruleId: item.ruleId, chart: item.chart, status: recallStatus(item, today) }))
    expect(ours).toEqual(golden.items)
  })
})

describe('AC-603.4 골든: recallCoverage', () => {
  it('AC-603.4 사례가 가짜 자료와 같다', () => {
    expect(COVERAGE.cases.map((c) => c.id)).toEqual(CASES.coverage.map((c) => c.id))
  })

  it.each(COVERAGE.cases.map((c) => [c.id, c] as const))('AC-603.4 %s', (id, golden) => {
    const c = byId(CASES.coverage, id)
    const history: RecallHistory = { from: c.history.from, readThrough: null, records: c.history.records }
    expect(recallCoverage(history, rulesOf(c.rules), c.today)).toEqual(golden.result)
  })
})

describe('AC-603.5 골든: recallCopyLines·recallPhones', () => {
  const lookup = (rx: unknown[][] | null) => {
    if (!rx) return { loaded: false, phoneOfChart: () => '' }
    const book = preparePhones(rx, true)
    return { loaded: book.loaded, phoneOfChart: book.loaded ? (chart: string) => phoneOf(book.map, chart) : () => '' }
  }

  it('AC-603.5 사례가 가짜 자료와 같다', () => {
    expect(COPY.cases.map((c) => c.id)).toEqual(CASES.copy.map((c) => c.id))
  })

  it.each(COPY.cases.map((c) => [c.id, c] as const))('AC-603.5 %s', (id, golden) => {
    const c = byId(CASES.copy, id)
    const { loaded, phoneOfChart } = lookup(c.rx)
    expect(loaded).toBe(golden.loaded)
    const items = recallCompute(c.records, RECALL_DEFAULTS)
    expect(items).toHaveLength(golden.lines.people)

    const lines = listedCases(COPY, 'recallCopyLines')
    expect(recallCopyLines(items, phoneOfChart)).toBe(id in lines ? lines[id] : golden.lines.copied)

    const phones = listedCases(COPY, 'recallPhones')
    if (golden.phones.copied === null) expect(recallPhones(items, phoneOfChart)).toEqual(phones[id])
    else expect(recallPhones(items, phoneOfChart)).toEqual({ text: golden.phones.copied, count: golden.phones.count, missing: golden.phones.missing })
  })

  it('AC-603.5 knownDiffs: 원본이 복사 없이 안내만 띄운 사례만 정확히 적혀 있다', () => {
    const noLines = COPY.cases.filter((c) => c.lines.copied === null).map((c) => c.id).sort()
    const noPhones = COPY.cases.filter((c) => c.phones.copied === null).map((c) => c.id).sort()
    expect(Object.keys(listedCases(COPY, 'recallCopyLines')).sort()).toEqual(noLines)
    expect(Object.keys(listedCases(COPY, 'recallPhones')).sort()).toEqual(noPhones)
    expect(noLines).toEqual(['empty'])
    expect(noPhones).toEqual(['all-missing', 'empty'])
    // 원본의 안내 글: 우리는 안내를 화면에 맡긴다
    expect(byId(COPY.cases, 'empty').lines.toast).toBe('복사할 사람이 없습니다')
    for (const id of noPhones) expect(byId(COPY.cases, id).phones).toEqual({ copied: null, toast: '복사할 번호가 없습니다' })
  })
})
