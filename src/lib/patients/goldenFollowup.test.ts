import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  aragan,
  baseDate,
  dateKey,
  extractSite,
  extractTx,
  parseFU,
  passFilters,
  pasteRows,
  phoneColumn,
  phoneTokens,
  preparePhones,
  prepareSchedule,
  recordedStamp,
  scheduleRows,
  undecidedRows,
  visitKind,
  writtenDate,
} from './followup'
import { PatientsSourceError } from './sourceError'
import type { ChartVisit, FuNext, PatientsSourceReason, VisitKind } from '@/types/patients'

// 골든 시험: 같은 가짜 자료를 원본(seoseungkwan/shared@2a1069b, revisit_schedule.html)에 넣은 결과(fixtures/patients/golden)와
// 우리 함수의 결과를 순서까지 깊게 견준다. 원본 결과는 scripts/patients/golden/revisit.mjs가 만든다(원본은 저장소 밖).
// 일부러 다르게 한 것은 골든 파일의 knownDiffs에 이유와 함께 적은 칸뿐이다. 적지 않은 차이는 실패다.

const ROOT = new URL('../../../', import.meta.url)
const bytes = (rel: string) => readFileSync(new URL(rel, ROOT))
const json = <T>(rel: string): T => JSON.parse(bytes(rel).toString('utf8')) as T
const sha256 = (rel: string) => createHash('sha256').update(bytes(rel)).digest('hex')

// cases가 있으면 그 사례만 다르고(사례 id → 우리가 내야 할 값), 없으면 그 칸을 통째로 옮기지 않았다는 뜻이다
type KnownDiff = { entry: string; field: string; reason: string; cases?: Record<string, unknown> }
type Head = {
  source: string
  file: string
  entry: string[]
  inputs: { path: string; sha256: string }[]
  knownDiffs: KnownDiff[]
}
type Thrown = { throws: true; message: string }
type RowsCase = { id: string; rows: unknown[][]; allowMissing?: boolean }

type ParseGolden = Head & {
  parse: { id: string; parseFU: FuNext; aragan: FuNext | null; visitKind: VisitKind; extractTx: string; extractSite: string }[]
  written: { id: string; result: string | null }[]
}
type ScheduleGolden = Head & {
  dateKey: { raw: unknown; result: string | null }[]
  recordedStamp: { raw: unknown; result: string }[]
  prepare: ({ id: string } & (Thrown | { result: { visits: ChartVisit[]; latest: Record<string, ChartVisit> } }))[]
  views: {
    chart: string
    phones: string
    base: string
    visitKind: { visitNo: string; chart: string; kind: VisitKind }[]
    schedule: { includeCond: boolean; includePast: boolean; rows: ChartVisit[] }[]
    undecided: ChartVisit[]
    passFilters: { kind: '' | VisitKind; from: string; to: string; useDate: boolean; charts: string[] }[]
    paste: {
      includeCond: boolean
      includePast: boolean
      kind: '' | VisitKind
      from: string
      to: string
      withDate: boolean
      phones: 'main' | 'none'
      rows: string[][]
    }[]
  }
  scheduleViews: { chart: string; base: string; schedule: { includeCond: boolean; includePast: boolean; rows: ChartVisit[] }[] }[]
}
type PhonesGolden = Head & {
  prepare: ({ id: string; allowMissing: boolean } & (Thrown | { result: Record<string, unknown> }))[]
  tokens: { raw: string; result: unknown }[]
}
type ColumnsGolden = Head & { cases: { header: string; result: boolean }[] }

const PARSE = json<ParseGolden>('fixtures/patients/golden/followup-parse.json')
const SCHEDULE = json<ScheduleGolden>('fixtures/patients/golden/followup-schedule.json')
const PHONES = json<PhonesGolden>('fixtures/patients/golden/followup-phones.json')
const COLUMNS = json<ColumnsGolden>('fixtures/patients/golden/phone-columns.json')

const CASES = json<{ parse: { id: string; visitDate: string; lines: string[] }[]; written: { id: string; visitDate: string; month: number; day: number; before: string }[] }>(
  'fixtures/patients/fake/followup-cases.json',
)
const CHART = json<{ cases: RowsCase[] }>('fixtures/patients/fake/chart-rows.json')
const RX = json<{ cases: RowsCase[] }>('fixtures/patients/fake/rx-rows.json')

// 원본 오류 글 ↔ 우리 이유. 원본이 멈추는 바로 그 자리에서 멈추는지 본다(우리 글에는 환자 값도 원본 글도 넣지 않는다)
const ORIGINAL_MESSAGE: Record<PatientsSourceReason, string> = {
  'header-missing': '필수 열 이름을 찾지 못했습니다. 선택한 통계 파일을 확인해 주세요.',
  'header-duplicate': '필수 열 이름이 중복되어 자료를 구분할 수 없습니다.',
  'row-unreadable': '환자명·차트번호·기록날짜를 읽지 못한 자료가 있습니다. 원본을 확인해 주세요.',
  'visit-number-empty': '내원번호가 비어 있는 자료가 있습니다.',
  'visit-conflict': '같은 내원번호에 서로 다른 환자 또는 날짜가 있습니다.',
  'no-visits': '진료기록에서 불러올 자료를 찾지 못했습니다.',
  'phone-column-missing': '휴대폰·휴대전화·전화번호·연락처 열을 찾지 못했습니다.',
  'phone-column-duplicate': '같은 전화번호 열 이름이 중복되어 자료를 구분할 수 없습니다.',
  'phone-conflict':
    '같은 차트번호 또는 앞자리 0만 다른 차트번호에 서로 다른 전화번호가 있습니다. 전화번호 자료를 확인해 주세요.',
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

// knownDiffs에 적은 칸만 원본 결과에서 뺀다
function withoutKnownDiffs(head: Head, entry: string, value: Record<string, unknown>): Record<string, unknown> {
  const out = { ...value }
  for (const diff of head.knownDiffs) if (diff.entry === entry && !diff.cases) delete out[diff.field]
  return out
}

// 사례별로 적어 둔 차이: 그 entry·그 사례의 적어 둔 값. 없으면 undefined
const listedDiff = (head: Head, entry: string, id: string) =>
  head.knownDiffs.find((diff) => diff.entry === entry && diff.cases && id in diff.cases)?.cases

// 적어 둔 사례만 적어 둔 값과 견주고, 나머지는 모두 원본 결과와 견준다
const expectedFor = (head: Head, entry: string, id: string, original: unknown): unknown => {
  const listed = listedDiff(head, entry, id)
  return listed ? listed[id] : original
}

// 그 entry에 적어 둔 사례 id 전부
const listedIds = (head: Head, entry: string) =>
  head.knownDiffs.flatMap((diff) => (diff.entry === entry && diff.cases ? Object.keys(diff.cases) : [])).sort()

// 원본이 찍은 말이 안 되는 날짜(해가 네 자리가 아니거나 NaN). 없는 날짜(null)는 아니다
const isNonsenseDate = (value: unknown) => typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)

// 적어 둔 내원의 next만 적어 둔 값으로 바꾼다. 그 밖의 내원과 다른 칸은 원본 그대로 견준다
function scheduleExpected(id: string, original: { visits: ChartVisit[]; latest: Record<string, ChartVisit> }) {
  const listed = listedDiff(SCHEDULE, 'prepareSchedule', id)?.[id] as Record<string, unknown> | undefined
  if (!listed) return original
  const patch = (v: ChartVisit) => (v.visitNo in listed ? { ...v, next: listed[v.visitNo] } : v)
  return {
    visits: original.visits.map(patch),
    latest: Object.fromEntries(Object.entries(original.latest).map(([chart, v]) => [chart, patch(v)])),
  }
}

const rowsOf = (cases: RowsCase[], id: string) => {
  const found = cases.find((c) => c.id === id)
  if (!found) throw new Error(`가짜 자료에 ${id}가 없다`)
  return found
}

describe('골든 파일 머리', () => {
  it.each([
    ['followup-parse', PARSE],
    ['followup-schedule', SCHEDULE],
    ['followup-phones', PHONES],
    ['phone-columns', COLUMNS],
  ] as const)('AC-602.1~AC-602.5 %s: 원본 2a1069b, 넣은 가짜 자료가 지금 것과 같다, 차이는 이유와 함께', (_name, head) => {
    expect(head.source).toBe('seoseungkwan/shared@2a1069b')
    expect(head.file).toBe('YangjiBareun_사전점검/assets/revisit_schedule.html')
    expect(head.entry.length).toBeGreaterThan(0)
    for (const input of head.inputs) expect(sha256(input.path), input.path).toBe(input.sha256)
    for (const diff of head.knownDiffs) {
      expect(diff.reason.trim().length, `${diff.entry}.${diff.field}`).toBeGreaterThan(0)
      expect(head.entry).toContain(diff.entry)
    }
  })
})

describe('AC-602.1 골든: parseFU·visitKind·writtenDate·extractTx·extractSite', () => {
  it('AC-602.1 사례 수가 가짜 자료와 같다', () => {
    expect(PARSE.parse.map((c) => c.id)).toEqual(CASES.parse.map((c) => c.id))
    expect(PARSE.written.map((c) => c.id)).toEqual(CASES.written.map((c) => c.id))
    expect(PARSE.parse.length).toBeGreaterThan(60)
  })

  it.each(CASES.parse.map((c, i) => [c.id, c, PARSE.parse[i]] as const))('AC-602.1·AC-602.5 %s', (id, input, golden) => {
    expect(parseFU(input.visitDate, input.lines)).toEqual(expectedFor(PARSE, 'parseFU', id, golden.parseFU))
    expect(visitKind({ next: parseFU(input.visitDate, input.lines) })).toBe(expectedFor(PARSE, 'visitKind', id, golden.visitKind))
    expect(extractTx(input.lines)).toBe(golden.extractTx)
    expect(extractSite(input.lines)).toBe(golden.extractSite)
  })

  it.each(CASES.written.map((c, i) => [c.id, c, PARSE.written[i]] as const))('AC-602.1 적어 둔 날짜 %s', (id, input, golden) => {
    expect(writtenDate(input.visitDate, input.month, input.day, input.before)).toBe(expectedFor(PARSE, 'writtenDate', id, golden.result))
  })

  it('AC-602.5 원본의 구분 버릇을 그대로 본다: 주사는 안 하는데 주사, 드레싱·회차는 F/U', () => {
    const kindOf = (id: string) => PARSE.parse.find((c) => c.id === id)?.visitKind
    expect(kindOf('inject-no-injection')).toBe('주사')
    expect(kindOf('inject-dressing-round')).toBe('F/U')
    expect(kindOf('inject-hoe-round')).toBe('F/U')
  })

  it('AC-602.1 knownDiffs: 원본이 말이 안 되는 날짜를 찍은 사례만 정확히 적혀 있다', () => {
    const ids = <T extends { id: string }>(cases: T[], date: (c: T) => unknown) =>
      cases.filter((c) => isNonsenseDate(date(c))).map((c) => c.id).sort()
    expect(listedIds(PARSE, 'parseFU')).toEqual(ids(PARSE.parse, (c) => c.parseFU.sortDate))
    expect(listedIds(PARSE, 'parseFU').length).toBeGreaterThan(10)
    expect(listedIds(PARSE, 'aragan')).toEqual(ids(PARSE.parse, (c) => c.aragan?.sortDate))
    expect(listedIds(PARSE, 'writtenDate')).toEqual(ids(PARSE.written, (c) => c.result))
    // 구분은 근거 글이 달라진 사례에서만, 실제로 다를 때만 적는다
    for (const id of listedIds(PARSE, 'visitKind')) {
      expect(listedIds(PARSE, 'parseFU'), id).toContain(id)
      expect(expectedFor(PARSE, 'visitKind', id, null), id).not.toBe(PARSE.parse.find((c) => c.id === id)?.visitKind)
    }
    // 우리 쪽 값에는 말이 안 되는 날짜가 없다
    for (const id of listedIds(PARSE, 'parseFU')) {
      expect(isNonsenseDate((expectedFor(PARSE, 'parseFU', id, null) as { sortDate: unknown }).sortDate), id).toBe(false)
    }
  })
})

describe('AC-602.2 골든: aragan', () => {
  it.each(CASES.parse.map((c, i) => [c.id, c, PARSE.parse[i]] as const))('AC-602.2 %s', (id, input, golden) => {
    expect(aragan(input.visitDate, input.lines)).toEqual(expectedFor(PARSE, 'aragan', id, golden.aragan))
  })
})

describe('AC-602.3 골든: dateKey·recordedStamp·prepareSchedule', () => {
  it('AC-602.3 dateKey', () => {
    expect(SCHEDULE.dateKey.length).toBeGreaterThan(30)
    for (const { raw, result } of SCHEDULE.dateKey) expect(dateKey(raw), JSON.stringify(raw)).toBe(result)
  })

  it('AC-602.3 recordedStamp', () => {
    for (const { raw, result } of SCHEDULE.recordedStamp) expect(recordedStamp(raw), JSON.stringify(raw)).toBe(result)
  })

  it('AC-602.3 사례가 가짜 자료와 같고, 멈추는 사례와 되는 사례가 다 있다', () => {
    expect(SCHEDULE.prepare.map((c) => c.id)).toEqual(CHART.cases.map((c) => c.id))
    expect(SCHEDULE.prepare.filter((c) => 'throws' in c).length).toBeGreaterThan(8)
    expect(SCHEDULE.prepare.filter((c) => 'result' in c).length).toBeGreaterThan(5)
  })

  it.each(SCHEDULE.prepare.map((c) => [c.id, c] as const))('AC-602.3 %s', (id, golden) => {
    const { rows } = rowsOf(CHART.cases, id)
    if ('throws' in golden) expectSameThrow(() => prepareSchedule(rows), golden)
    else expect(prepareSchedule(rows)).toEqual(scheduleExpected(id, golden.result))
  })

  it('AC-602.3 짚어 둔 표의 원본 결과: 증상만 있는 줄과 건수만 있는 줄은 멈춘다, .00은 뗀다, 00xx년은 19xx년이다', () => {
    const prepared = (id: string) => {
      const found = SCHEDULE.prepare.find((c) => c.id === id)
      if (!found || 'throws' in found) throw new Error(`골든에 결과가 없다: ${id}`)
      return found.result
    }
    const reasonOf = (id: string) => SCHEDULE.prepare.find((c) => c.id === id)
    expect(reasonOf('err-symptom-only')).toMatchObject({ throws: true, message: ORIGINAL_MESSAGE['row-unreadable'] })
    expect(reasonOf('err-count-row-chart-first')).toMatchObject({ throws: true, message: ORIGINAL_MESSAGE['row-unreadable'] })
    expect(prepared('ok-chart-dot-zeros').visits.map((v) => v.chart)).toEqual(['900031', '900032'])
    expect(prepared('ok-visit-year-00xx').visits.map((v) => v.date.slice(0, 2))).toEqual(Array(7).fill('19'))
  })

  it('AC-602.3 knownDiffs: 원본이 말이 안 되는 날짜를 찍은 내원만 정확히 적혀 있다', () => {
    for (const golden of SCHEDULE.prepare) {
      if ('throws' in golden) continue
      const far = golden.result.visits.filter((v) => isNonsenseDate(v.next.sortDate)).map((v) => v.visitNo)
      const listed = listedDiff(SCHEDULE, 'prepareSchedule', golden.id)?.[golden.id] as Record<string, unknown> | undefined
      expect(Object.keys(listed ?? {}).sort(), golden.id).toEqual(far.sort())
    }
    expect(listedIds(SCHEDULE, 'prepareSchedule')).toEqual(['ok-far-dates'])
  })

  it('AC-602.3 knownDiffs: row.nmRecordedAt은 보지 않고 기록날짜 칸에서 읽는다(이유와 함께 적혀 있다)', () => {
    const diff = SCHEDULE.knownDiffs.find((d) => d.entry === 'prepareSchedule' && d.field === 'row.nmRecordedAt')
    expect(diff?.reason.trim().length).toBeGreaterThan(0)
    const row = Object.assign(['V1', '900001', '가상환자01', '1주뒤 f/u', '202610070915'], { nmRecordedAt: '2026-10-07T23:59:00' })
    const rows = [['내원번호', '차트번호', '환자명', '증상', '기록날짜'], row]
    expect(prepareSchedule(rows).visits[0].recordedAt).toBe('2026-10-07T09:15:00')
  })
})

describe('AC-602.4 골든: preparePhones·phoneTokens·phoneColumn', () => {
  it('AC-602.4 사례가 가짜 자료와 같다', () => {
    expect(PHONES.prepare.map((c) => c.id)).toEqual(RX.cases.map((c) => c.id))
    expect(PHONES.prepare.filter((c) => 'throws' in c).length).toBeGreaterThan(4)
  })

  it.each(PHONES.prepare.map((c) => [c.id, c] as const))('AC-602.4 %s', (id, golden) => {
    const { rows, allowMissing } = rowsOf(RX.cases, id)
    expect(allowMissing ?? false).toBe(golden.allowMissing)
    if ('throws' in golden) expectSameThrow(() => preparePhones(rows, golden.allowMissing), golden)
    else {
      const ours = preparePhones(rows, golden.allowMissing)
      expect({ ...ours, map: { ...ours.map } }).toEqual(withoutKnownDiffs(PHONES, 'preparePhones', golden.result))
    }
  })

  it('AC-602.4 짚어 둔 표의 원본 결과: 번호 둘의 칸만 바뀐 줄은 충돌이 아니다, .00은 뗀다', () => {
    const result = (id: string) => {
      const found = PHONES.prepare.find((c) => c.id === id)
      if (!found || 'throws' in found) throw new Error(`골든에 결과가 없다: ${id}`)
      return found.result
    }
    expect(result('ok-swapped-numbers').map).toEqual({})
    expect(Object.keys(result('ok-chart-dot-zeros').map as object).sort()).toEqual(['900092', '900093'])
  })

  it('AC-602.4 phoneTokens', () => {
    expect(PHONES.tokens.length).toBeGreaterThan(15)
    PHONES.tokens.forEach(({ raw, result }, index) => expect(phoneTokens(raw), `번호 사례 ${index}`).toEqual(result))
  })

  it('AC-602.4 phoneColumn(도우미 IsPhoneColumn도 같은 파일로 견준다)', () => {
    expect(COLUMNS.cases.length).toBeGreaterThan(25)
    for (const { header, result } of COLUMNS.cases) expect(phoneColumn(header), header).toBe(result)
  })
})

describe('AC-602.5 골든: baseDate·visitKind·scheduleRows·undecidedRows·passFilters·pasteRows (기준 날짜 = 자료의 마지막 진료일)', () => {
  const views = SCHEDULE.views
  const { visits, latest } = prepareSchedule(rowsOf(CHART.cases, views.chart).rows)
  const phones = preparePhones(rowsOf(RX.cases, views.phones).rows)
  const base = baseDate(visits)
  const latestList = Object.values(latest)

  it('AC-602.5 baseDate', () => {
    expect(base).toBe(views.base)
  })

  it("AC-602.5 knownDiffs: 자료가 없으면 baseDate는 오늘이 아니라 ''(이유와 함께 적혀 있다)", () => {
    const diff = SCHEDULE.knownDiffs.find((d) => d.entry === 'baseDate')
    expect(diff?.reason.trim().length).toBeGreaterThan(0)
    expect(baseDate([])).toBe('')
  })

  it('AC-602.5 visitKind (내원마다)', () => {
    expect(visits.map((v) => ({ visitNo: v.visitNo, chart: v.chart, kind: visitKind(v) }))).toEqual(views.visitKind)
    expect(new Set(views.visitKind.map((v) => v.kind))).toEqual(new Set(['주사', 'F/U']))
  })

  it('AC-602.5 scheduleRows: 조건부·지난 예정 네 조합', () => {
    expect(views.schedule.map((s) => [s.includeCond, s.includePast])).toEqual([
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ])
    for (const s of views.schedule) {
      expect(scheduleRows(latest, { includeCond: s.includeCond, includePast: s.includePast, base })).toEqual(s.rows)
    }
  })

  it.each(SCHEDULE.scheduleViews.map((view) => [view.chart, view] as const))('AC-602.5 scheduleRows 작은 표 %s', (id, view) => {
    const table = prepareSchedule(rowsOf(CHART.cases, id).rows)
    expect(baseDate(table.visits)).toBe(view.base)
    expect(view.schedule).toHaveLength(4)
    for (const s of view.schedule) {
      expect(scheduleRows(table.latest, { includeCond: s.includeCond, includePast: s.includePast, base: view.base })).toEqual(s.rows)
    }
  })

  it('AC-602.5 짚어 둔 표의 원본 결과: 기준 날짜와 같은 예정은 남고, 같은 날은 차트번호 숫자 순서다', () => {
    const shown = (id: string) => {
      const view = SCHEDULE.scheduleViews.find((v) => v.chart === id)
      const rows = view?.schedule.find((s) => !s.includeCond && !s.includePast)?.rows ?? []
      return rows.map((v) => v.chart)
    }
    expect(shown('ok-base-boundary')).toEqual(['900001', '900003'])
    expect(shown('ok-chart-tie-break')).toEqual(['900099', '900100', '0900200'])
  })

  it('AC-602.5 undecidedRows', () => {
    expect(views.undecided.length).toBeGreaterThan(0)
    expect(undecidedRows(latest)).toEqual(views.undecided)
  })

  it('AC-602.5 passFilters: 구분 × 기간 × useDate', () => {
    for (const f of views.passFilters) {
      const passed = latestList.filter((v) => passFilters(v, { kind: f.kind, from: f.from, to: f.to }, f.useDate)).map((v) => v.chart)
      expect(passed, JSON.stringify({ ...f, charts: undefined })).toEqual(f.charts)
    }
  })

  it('AC-602.5 pasteRows: 날짜 머리 줄 있음·없음 × 기간 있음·없음 × 전화 있음·없음', () => {
    const combos = new Set(views.paste.map((p) => `${p.withDate}|${p.from !== ''}|${p.phones}`))
    expect(combos.size).toBe(8)
    for (const p of views.paste) {
      const list = scheduleRows(latest, { includeCond: p.includeCond, includePast: p.includePast, base }).filter((v) =>
        passFilters(v, { kind: p.kind }, false),
      )
      const book = p.phones === 'main' ? phones : { map: {}, loaded: false }
      expect(pasteRows(list, book, { from: p.from, to: p.to, withDate: p.withDate }), JSON.stringify({ ...p, rows: undefined })).toEqual(
        p.rows,
      )
    }
  })
})
