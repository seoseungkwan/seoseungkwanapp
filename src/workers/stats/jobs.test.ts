import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, addMonths, monthOf } from '@/lib/analytics/dates'
import { validateDayPayload, validateMonthPayload, validateMonthSections } from '@/lib/payload/validate'
import type { Totals } from '@/types/analysis'
import type {
  BitSectionsView,
  RxSplitView,
  StatsLoaded,
  StatsLoadRequest,
  StatsSectionsRequest,
  StatsSplitRequest,
  StatsWorkerMessage,
} from '@/types/stats'
import type { SunapRates } from '@/types/sunap'
import { requestLoad, requestSections, type WorkerLike } from '../statsClient'
import { createStatsHost, loadJob, sectionsJob, splitJob } from './jobs'

const TODAY = '2026-11-01'
const YESTERDAY = '2026-10-31'
const FROM = '2026-09-01'
const SLOW = { timeout: 30_000 }
const OPTS = { from: FROM, to: TODAY, today: TODAY, closeToday: false }

// 가짜 차트번호(9로 시작하는 6자리). 소스에 통째로 쓰지 않고 이어 만든다
const chart = (n: number) => '9' + String(n).padStart(5, '0')
const NO_RX_CHART = chart(7) // 처방 없는 접수만 있는 환자
const CHARTS = [chart(1), chart(2), chart(3), chart(4), chart(5), chart(6), NO_RX_CHART]

const okSet = (period: string) => ({
  ok: true,
  period,
  totalVisits: 10,
  newPatients: 2,
  returnPatients: 8,
  totalAmount: 100_000,
  insurerAmount: 70_000,
  noncoveredAmount: 30_000,
  cashAmount: 10_000,
  cardAmount: 15_000,
  transferAmount: 5_000,
  treatments: { manual: 1, eswt: 2, carm: 3, sono: 4, cryo: 5 },
  laCodes: [{ code: 'LA01', count: 2 }],
  financeUnconfirmed: false,
  notes: [],
})

const reportOf = (to: string) => ({
  daily: [okSet(to), okSet(addDays(to, -1))],
  monthly: [okSet(monthOf(to)), okSet(addMonths(monthOf(to), -1))],
})

// 9월: 5명 + 그중 1명 10월 재방문, 오늘: 옛 환자 1명(동네 칸이 있었다면 '주소 없음' 5명 이상이 된다)
const ROWS = [
  [CHARTS[0], '20260901', 'MM042', '20260901'],
  [CHARTS[1], '20260901', 'MM042', '20260901'],
  [CHARTS[2], '20260902', 'B4001', '20260902'],
  [CHARTS[3], '20260902', 'MM042', '20260902'],
  [CHARTS[4], '20260903', 'MM042', '20260903'],
  [CHARTS[0], '20261005', 'MM042', '20260901'],
  [CHARTS[5], '20261101', 'MM042', '20250101'],
]

// 진료 줄이 있는 환자·날마다 접수 한 건(처방 없는 접수가 없는 답)
function receptionsOf(rows: readonly string[][]): [string, string, number, string | null][] {
  const lines = new Map<string, [string, string, number, string | null]>()
  for (const [person, day, , first] of rows) lines.set(`${person}|${day}`, [person, day, 1, first])
  return [...lines.values()]
}

// 접수 줄을 따로 주지 않으면 그 답의 진료 줄에 맞춘다
const helperJson = (over: Record<string, unknown> = {}, to = TODAY) =>
  JSON.stringify({
    v: 2,
    from: FROM,
    to,
    summary: { visits: 7, patients: 6, newPatients: 5, noChart: 0, duplicate: 0, noFirst: 0 },
    days: [
      ['20260901', 2, 2, 2],
      ['20261101', 1, 1, 0],
    ],
    patientDays: receptionsOf((over.rows as string[][] | undefined) ?? ROWS),
    codes: [
      ['MM042', '표층열치료'],
      ['B4001', '일반혈액검사'],
    ],
    rows: ROWS,
    report: reportOf(to),
    ...over,
  })

// 값 속 모든 열쇠와 글자(객체·배열을 따라 들어간다)
function keysIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysIn)
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...keysIn(v)])
  return []
}
function textsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsIn)
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...textsIn(v)])
  return []
}

const FORBIDDEN_KEYS = ['chart', 'chartNo', 'patient', 'patientId', 'p', 'rows', 'memory', 'visits', 'patientDays', 'receptions']

function expectNoPatientData(value: unknown) {
  const texts = textsIn(value)
  for (const id of CHARTS) expect(texts.some((text) => text.includes(id))).toBe(false)
  for (const key of FORBIDDEN_KEYS) expect(keysIn(value)).not.toContain(key)
}

const dayOf = (view: StatsLoaded, day: string) => view.days?.find((x) => x.day === day)
const monthIn = (view: StatsLoaded, month: string) => view.months?.find((x) => x.month === month)

describe('AC-505.4 loadJob: 도우미 자료 → 화면에 보낼 모양', () => {
  it('달·일 저장 모양, 저장할 덮은 기간, 확인 건수, 보고 숫자 네 벌만 있다', () => {
    const { view } = loadJob(helperJson(), OPTS)
    expect(Object.keys(view).sort()).toEqual(['checks', 'covered', 'days', 'months', 'quality', 'range', 'report'])
    expect(view.range).toEqual({ from: FROM, to: TODAY })
    expect(view.quality).toBe('valid')
    expect(view.checks).toEqual({ noChart: 0, duplicate: 0, noFirst: 0 })
    expect(view.months?.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(view.days?.map((d) => d.day)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-10-05', '2026-11-01'])
    expect(view.report.daily.map((set) => set.period)).toEqual([TODAY, YESTERDAY])
    expect(view.report.monthly.map((set) => set.period)).toEqual(['2026-11', '2026-10'])
  })

  it('저장 모양이 서버 검사를 통과하고 숫자가 맞다', () => {
    const { view } = loadJob(helperJson(), OPTS)
    for (const month of view.months ?? []) expect(validateMonthPayload(month)).toEqual(month)
    for (const day of view.days ?? []) expect(validateDayPayload(day)).toEqual(day)
    const september = monthIn(view, '2026-09')
    expect(september?.totals).toEqual({ patients: 5, newPatients: 5, returning: 0, unknown: 0 })
    expect(september?.rx.map((x) => [x.code, x.name, x.type, x.patients])).toEqual([
      ['B4001', '일반혈액검사', '', 1],
      ['MM042', '표층열치료', '', 4],
    ])
    expect(dayOf(view, TODAY)?.totals).toEqual({ patients: 1, newPatients: 0, returning: 1, unknown: 0 })
  })

  it('요약의 덮은 기간은 [from, min(to, 오늘)]: 끝난 달·날은 완전, to가 오늘보다 뒤여도 오늘까지만 본다', () => {
    const { view } = loadJob(helperJson({}, '2026-11-05'), { ...OPTS, to: '2026-11-05' })
    expect(monthIn(view, '2026-09')?.partial).toBe(false)
    expect(monthIn(view, '2026-10')?.partial).toBe(false)
    expect(monthIn(view, '2026-11')?.partial).toBe(true)
    expect(dayOf(view, '2026-09-01')?.partial).toBe(false)
  })

  it('요약의 덮은 기간 앞은 완전하지 않다: 달 중간부터 불러온 첫 달은 부분이다', () => {
    const { view } = loadJob(
      helperJson({
        from: '2026-09-02',
        rows: ROWS.slice(2),
        summary: { visits: 5, patients: 4, newPatients: 3, noChart: 0, duplicate: 0, noFirst: 0 },
        days: [],
      }),
      { ...OPTS, from: '2026-09-02' },
    )
    expect(monthIn(view, '2026-09')?.partial).toBe(true)
  })

  it('저장 모양의 동네를 비운다(줄 동네가 없어 "주소 없음" 5명 이상이 되어도)', () => {
    const { view } = loadJob(helperJson(), OPTS)
    expect(monthIn(view, '2026-09')?.totals.patients).toBeGreaterThanOrEqual(5)
    for (const month of view.months ?? []) expect(month.regions).toEqual([])
    expect(textsIn(view.months)).not.toContain('주소 없음')
  })

  it('시험: 오늘 아침 진료 전에 불러옴(오늘 줄 없음, 오늘 진료 끝 꺼짐) → 저장할 덮은 기간 끝 = 어제', () => {
    const rows = ROWS.filter((row) => row[1] !== '20261101')
    const { view } = loadJob(helperJson({ rows }), OPTS)
    expect(view.covered).toEqual({ from: FROM, to: YESTERDAY })
  })

  it.each([
    ['오늘 진료 끝 켬 → 끝 = 오늘', { closeToday: true }, { from: FROM, to: TODAY }],
    ['to가 어제보다 앞이면 끝 = to', { to: '2026-10-15' }, { from: FROM, to: '2026-10-15' }],
    ['to가 앞이면 오늘 진료 끝을 켜도 끝 = to', { to: '2026-10-15', closeToday: true }, { from: FROM, to: '2026-10-15' }],
    ['to가 오늘보다 뒤여도 끝 = 어제', { to: '2026-11-05' }, { from: FROM, to: YESTERDAY }],
    ['to가 오늘보다 뒤이고 오늘 진료 끝 켬 → 끝 = 오늘', { to: '2026-11-05', closeToday: true }, { from: FROM, to: TODAY }],
  ])('저장할 덮은 기간: %s', (_name, change, covered) => {
    const opts = { ...OPTS, ...change }
    const rows = ROWS.filter((row) => row[1] <= opts.to.replaceAll('-', ''))
    const { view } = loadJob(helperJson({ rows, days: [] }, opts.to), opts)
    expect(view.covered).toEqual(covered)
  })

  it.each([
    ['오늘 하루만 불러옴, 오늘 진료 끝 꺼짐 → null', { from: TODAY, to: TODAY, closeToday: false }, null],
    ['오늘 하루만 불러옴, 오늘 진료 끝 켬 → 오늘', { from: TODAY, to: TODAY, closeToday: true }, { from: TODAY, to: TODAY }],
    ['시작이 내일 → null', { from: '2026-11-02', to: '2026-11-05', closeToday: true }, null],
  ])('덮은 기간이 비는 경우: %s', (_name, change, covered) => {
    const opts = { ...OPTS, ...change }
    const { view } = loadJob(helperJson({ from: opts.from, rows: [], days: [] }, opts.to), opts)
    expect(view.covered).toEqual(covered)
  })

  it.each([
    ['차트번호 없는 내원', { noChart: 1, duplicate: 0, noFirst: 0 }],
    ['중복 내원', { noChart: 0, duplicate: 2, noFirst: 0 }],
    ['첫 내원 못 찾은 환자', { noChart: 0, duplicate: 0, noFirst: 3 }],
  ])('%s가 있으면 품질 incomplete이고 저장 모양은 null, 확인 건수는 그대로', (_name, checks) => {
    const summary = { visits: 7, patients: 6, newPatients: 5, ...checks }
    const { view } = loadJob(helperJson({ summary }), OPTS)
    expect(view.quality).toBe('incomplete')
    expect(view.months).toBeNull()
    expect(view.days).toBeNull()
    expect(view.checks).toEqual(checks)
    expect(view.report.daily).toHaveLength(2) // 보고 숫자는 그대로 보여 준다
  })

  it('진료 줄이 없는 기간은 valid에 빈 목록이다', () => {
    const { view, memory } = loadJob(helperJson({ rows: [], days: [] }), OPTS)
    expect(view.quality).toBe('valid')
    expect(view.months).toEqual([])
    expect(view.days).toEqual([])
    expect(memory.rows).toEqual([])
  })

  it('모양이 틀린 자료는 그 번호로 던진다', () => {
    expect(() => loadJob(helperJson({ v: 1 }), OPTS)).toThrowError('E-BRIDGE-BAD-REPLY')
  })

  it('두 배열이 어긋난 자료는 E-STATS-CHANGED로 던진다', () => {
    expect(() => loadJob(helperJson({ patientDays: [] }), OPTS)).toThrowError('E-STATS-CHANGED')
  })

  it('달 totals는 일 칸의 합이다: 한 달에 두 번 온 환자는 2다', () => {
    const rows = [
      [CHARTS[0], '20260901', 'MM042', '20260901'],
      [CHARTS[0], '20260902', 'MM042', '20260901'],
      [CHARTS[1], '20260902', 'MM042', '20250101'],
    ]
    const { view } = loadJob(helperJson({ rows, days: [] }), OPTS)
    expect(dayOf(view, '2026-09-01')?.totals).toEqual({ patients: 1, newPatients: 1, returning: 0, unknown: 0 })
    expect(dayOf(view, '2026-09-02')?.totals).toEqual({ patients: 2, newPatients: 0, returning: 2, unknown: 0 })
    expect(monthIn(view, '2026-09')?.totals).toEqual({ patients: 3, newPatients: 1, returning: 2, unknown: 0 })
  })

  it('진료 줄과 접수 줄은 같은 PatientIds로 센다: 신환의 처방 없는 재방문이 재방문이고 신환은 한 명이다', () => {
    // 두 배열의 환자 순서가 달라도 같은 환자는 같은 번호라야 한다
    const rows = [
      [CHARTS[0], '20260901', 'MM042', '20260901'],
      [CHARTS[1], '20260901', 'MM042', '20250101'],
    ]
    const patientDays = [
      [CHARTS[1], '20260901', 1, '20250101'],
      [CHARTS[0], '20260901', 1, '20260901'],
      [CHARTS[0], '20260903', 1, '20260901'],
    ]
    const { view } = loadJob(helperJson({ rows, patientDays, days: [] }), OPTS)
    const revisit = dayOf(view, '2026-09-01')?.revisit
    expect(revisit?.cohort).toBe(1)
    expect(revisit?.within7).toBe(1)
  })
})

describe('AC-505.8 환자 수는 접수 기준이다', () => {
  const twoReceptionsToday = () =>
    receptionsOf(ROWS).map((line): [string, string, number, string | null] => (line[1] === '20261101' ? [line[0], line[1], 2, line[3]] : line))

  it('같은 환자·같은 날 내원 번호가 다른 접수 둘(건수 2, duplicate 0)은 valid이고 그날 totals.patients에 2로 든다', () => {
    const { view } = loadJob(helperJson({ patientDays: twoReceptionsToday() }), OPTS)
    expect(view.quality).toBe('valid')
    expect(view.checks.duplicate).toBe(0)
    const today = dayOf(view, TODAY)
    expect(today?.totals).toEqual({ patients: 2, newPatients: 0, returning: 2, unknown: 0 })
    expect(monthIn(view, '2026-11')?.totals).toEqual({ patients: 2, newPatients: 0, returning: 2, unknown: 0 })
    expect(today?.rx.map((x) => [x.code, x.patients])).toEqual([['MM042', 1]]) // 처방별은 그대로 환자 수다
    expect(validateDayPayload(today)).toEqual(today)
  })

  it('처방 없는 접수만 있는 날은 rx: []인 DayPayload로 저장 모양에 들고 validateDayPayload를 지난다', () => {
    const patientDays = [...receptionsOf(ROWS), [NO_RX_CHART, '20261006', 1, '20250101']]
    const { view } = loadJob(helperJson({ patientDays }), OPTS)
    expect(view.quality).toBe('valid')
    const noRx = dayOf(view, '2026-10-06')
    expect(noRx?.rx).toEqual([])
    expect(noRx?.totals).toEqual({ patients: 1, newPatients: 0, returning: 1, unknown: 0 })
    expect(validateDayPayload(noRx)).toEqual(noRx)
    const october = monthIn(view, '2026-10')
    expect(october?.totals.patients).toBe(2) // 10월 5일 처방 있는 접수 + 10월 6일 처방 없는 접수
    expect(validateMonthPayload(october)).toEqual(october)
  })

  it('취소된 접수는 patientDays에 없으므로 숫자에 들지 않는다(날짜별 합계 days가 아직 세고 있어도)', () => {
    const rows = ROWS.filter((row) => row[0] !== CHARTS[1] && row[0] !== CHARTS[5])
    const { view } = loadJob(helperJson({ rows }), OPTS) // days에는 9월 1일 2명, 오늘 1명이 남아 있다
    expect(view.quality).toBe('valid')
    expect(dayOf(view, '2026-09-01')?.totals.patients).toBe(1)
    expect(dayOf(view, TODAY)).toBeUndefined()
  })

  it('summary.duplicate가 0이 아니면(같은 내원 번호가 두 번) 지금처럼 incomplete이고 저장 모양은 null이다', () => {
    const summary = { visits: 7, patients: 6, newPatients: 5, noChart: 0, duplicate: 1, noFirst: 0 }
    const { view } = loadJob(helperJson({ summary, patientDays: twoReceptionsToday() }), OPTS)
    expect(view.quality).toBe('incomplete')
    expect(view.checks.duplicate).toBe(1)
    expect(view.months).toBeNull()
    expect(view.days).toBeNull()
  })
})

describe('AC-505.5 화면에 가는 값에 환자 자료가 없다', () => {
  it('열쇠와 글자를 모두 훑어도 차트번호·환자 번호·진료 줄이 없다', () => {
    const { view } = loadJob(helperJson(), OPTS)
    expectNoPatientData(view)
    const incomplete = loadJob(helperJson({ summary: { visits: 7, patients: 6, newPatients: 5, noChart: 1, duplicate: 0, noFirst: 0 } }), OPTS)
    expectNoPatientData(incomplete.view)
  })

  it('Worker 메모리에는 진료 줄·기간 합계·날짜별 합계·처방 이름·기간이 있고, 차트번호는 메모리 번호로 바뀐다', () => {
    const { memory } = loadJob(helperJson(), OPTS)
    expect(memory.range).toEqual({ from: FROM, to: TODAY })
    expect(memory.rows).toHaveLength(ROWS.length)
    expect(memory.rows[0]).toEqual({ p: expect.any(Number), d: '2026-09-01', c: 'MM042', f: '2026-09-01' })
    expect(memory.rows[0].p).toBe(memory.rows[5].p) // 같은 환자 = 같은 번호
    expect(memory.summary.visits).toBe(7)
    expect(memory.days[0]).toEqual({ date: '2026-09-01', visits: 2, patients: 2, newPatients: 2 })
    expect(memory.names.get('B4001')).toBe('일반혈액검사')
    expect(textsIn(memory.rows).some((text) => CHARTS.some((id) => text.includes(id)))).toBe(false)
  })

  it('접수 줄은 세는 데만 쓰고 화면에도 메모리에도 남지 않는다', () => {
    const patientDays = [...receptionsOf(ROWS), [NO_RX_CHART, '20261006', 1, '20250101']]
    const { view, memory } = loadJob(helperJson({ patientDays }), OPTS)
    expectNoPatientData(view)
    expect(Object.keys(memory).sort()).toEqual(['days', 'names', 'range', 'rows', 'summary'])
    expect(keysIn(memory)).not.toContain('patientDays')
    expect(keysIn(memory)).not.toContain('receptions')
    // 처방 없는 접수는 진료 줄이 되지 않는다
    expect(memory.rows).toHaveLength(ROWS.length)
    expect(memory.rows.some((row) => row.d === '2026-10-06')).toBe(false)
  })
})

describe('AC-505.6 오늘 진료 끝', () => {
  it('켜면 오늘을 끝난 날로 본다 → 오늘 일 숫자가 partial: false', () => {
    const { view } = loadJob(helperJson(), { ...OPTS, closeToday: true })
    expect(dayOf(view, TODAY)?.partial).toBe(false)
  })

  it('끄면 오늘은 partial: true, 어제까지는 완전하다', () => {
    const { view } = loadJob(helperJson(), OPTS)
    expect(dayOf(view, TODAY)?.partial).toBe(true)
    expect(dayOf(view, '2026-10-05')?.partial).toBe(false)
  })

  it('켜도 아직 안 끝난 달은 partial: true다', () => {
    const { view } = loadJob(helperJson(), { ...OPTS, closeToday: true })
    expect(monthIn(view, '2026-11')?.partial).toBe(true)
  })

  it('켜도 덮지 않은 뒷날은 끝난 날로 보지 않는다: 요약에 넘긴 덮은 기간이 오늘까지다', () => {
    const { view } = loadJob(helperJson({ rows: ROWS.slice(0, 5), days: [] }), { ...OPTS, closeToday: true })
    expect(dayOf(view, TODAY)).toBeUndefined()
    expect(monthIn(view, '2026-09')?.partial).toBe(false)
  })
})

// 통로가 포트로 보내는 모양 그대로(workerSink)
const shaOf = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
function bridgeMessages(id: string, text: string, size = 100): Record<string, unknown>[] {
  const parts: string[] = []
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size))
  return [
    ...parts.map((data, seq) => ({ type: 'chunk', id, seq, data })),
    { type: 'end', id, count: parts.length, bytes: Buffer.byteLength(text, 'utf8'), sha256: shaOf(text) },
  ]
}

const loadRequest = (streamId: string, over: Partial<StatsLoadRequest> = {}): StatsLoadRequest => ({
  type: 'load',
  streamId,
  ...OPTS,
  ...over,
})

function hostUnderTest() {
  const sent: StatsWorkerMessage[] = []
  const host = createStatsHost((message) => sent.push(message))
  return { host, sent }
}

describe('AC-505.1·AC-505.5 Worker 일: 포트의 조각 + 화면의 load', () => {
  it('조각이 먼저 오고 load가 오면 loaded', async () => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', helperJson()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    expect(sent).toHaveLength(1)
    const [reply] = sent
    expect(reply.type).toBe('loaded')
    expect(reply.streamId).toBe('s1')
    expect(reply.type === 'loaded' && reply.view.quality).toBe('valid')
    expectNoPatientData(sent)
  })

  it('포트와 화면은 다른 길이라 load가 end보다 먼저 와도 기다렸다가 loaded', async () => {
    const { host, sent } = hostUnderTest()
    const loading = host.load(loadRequest('s1'))
    await Promise.resolve()
    expect(sent).toHaveLength(0)
    bridgeMessages('s1', helperJson()).forEach((m) => host.fromBridge(m))
    await loading
    expect(sent.map((m) => m.type)).toEqual(['loaded'])
  })

  it('SHA-256이 틀리면 failed E-BRIDGE-BAD-REPLY. 번호뿐이다', async () => {
    const { host, sent } = hostUnderTest()
    const messages = bridgeMessages('s1', helperJson())
    messages[messages.length - 1].sha256 = shaOf('다른 글자')
    messages.forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    expect(sent).toEqual([{ type: 'failed', streamId: 's1', code: 'E-BRIDGE-BAD-REPLY' }])
  })

  it('모양이 틀린 JSON이면 failed E-BRIDGE-BAD-REPLY', async () => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', helperJson({ v: 1 })).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    expect(sent).toEqual([{ type: 'failed', streamId: 's1', code: 'E-BRIDGE-BAD-REPLY' }])
  })

  it.each<[string, Record<string, unknown>]>([
    ['rows의 환자·날이 patientDays에 없음', { patientDays: receptionsOf(ROWS).slice(1) }],
    [
      '두 배열에서 첫 내원일이 다름',
      { patientDays: receptionsOf(ROWS).map((line) => (line[0] === CHARTS[5] ? [line[0], line[1], line[2], '20240101'] : line)) },
    ],
  ])('AC-505.2: %s이면 화면에 failed E-STATS-CHANGED가 간다. 번호뿐이고 메모리를 남기지 않는다', async (_name, over) => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', helperJson(over)).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    expect(sent).toEqual([{ type: 'failed', streamId: 's1', code: 'E-STATS-CHANGED' }])
    expect(host.memory()).toBeNull()
    expectNoPatientData(sent)
  })

  it('abort면 받은 번호로 failed(load가 앞이어도 뒤여도)', async () => {
    const after = hostUnderTest()
    after.host.fromBridge({ type: 'chunk', id: 's1', seq: 0, data: 'x' })
    after.host.fromBridge({ type: 'abort', id: 's1', code: 'E-STATS-TOO-BIG' })
    await after.host.load(loadRequest('s1'))
    expect(after.sent).toEqual([{ type: 'failed', streamId: 's1', code: 'E-STATS-TOO-BIG' }])

    const before = hostUnderTest()
    const loading = before.host.load(loadRequest('s2'))
    before.host.fromBridge({ type: 'abort', id: 's2', code: 'E-BRIDGE-DISCONNECTED' })
    await loading
    expect(before.sent).toEqual([{ type: 'failed', streamId: 's2', code: 'E-BRIDGE-DISCONNECTED' }])
  })

  it('다른 예외는 E-ANALYZE-FAILED이고 예외 내용을 옮기지 않는다', async () => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', helperJson()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1', { today: `틀린날짜${CHARTS[0]}` }))
    expect(sent).toEqual([{ type: 'failed', streamId: 's1', code: 'E-ANALYZE-FAILED' }])
  })

  it('포트로 온 엉뚱한 메시지는 무시한다', async () => {
    const { host, sent } = hostUnderTest()
    for (const junk of [null, 1, 'chunk', {}, { type: 'sent', ticket: 1, ok: true }, { type: 'chunk', id: 1, seq: 0, data: 'x' }]) {
      host.fromBridge(junk)
    }
    expect(sent).toHaveLength(0)
    bridgeMessages('s1', helperJson()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    expect(sent.map((m) => m.type)).toEqual(['loaded'])
  })

  it('진료 줄은 메모리에만 남고 새로 불러오면 바뀐다. 실패한 불러오기는 앞 메모리를 그대로 둔다', async () => {
    const { host, sent } = hostUnderTest()
    expect(host.memory()).toBeNull()

    bridgeMessages('s1', helperJson()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    expect(host.memory()?.rows).toHaveLength(ROWS.length)

    bridgeMessages('s2', helperJson({ v: 1 })).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s2'))
    expect(host.memory()?.rows).toHaveLength(ROWS.length)

    bridgeMessages('s3', helperJson({ rows: ROWS.slice(0, 2) })).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s3'))
    expect(host.memory()?.rows).toHaveLength(2)
    expect(sent.map((m) => m.type)).toEqual(['loaded', 'failed', 'loaded'])
    expectNoPatientData(sent)
  })
})

describe('AC-505.5 새로 불러오면 메모리가 바뀐다: 앞 일이 늦게 끝나도 되돌리지 않는다', () => {
  it('앞 load가 조각을 기다리는 사이 새 load가 끝나면, 앞 일은 답도 메모리도 남기지 않는다', async () => {
    const { host, sent } = hostUnderTest()
    const first = host.load(loadRequest('old'))
    const second = host.load(loadRequest('new'))
    bridgeMessages('new', helperJson({ rows: ROWS.slice(0, 2) })).forEach((m) => host.fromBridge(m))
    bridgeMessages('old', helperJson()).forEach((m) => host.fromBridge(m))
    await second
    await Promise.race([first, new Promise((resolve) => setTimeout(resolve, 20))])
    expect(sent.map((m) => [m.type, m.streamId])).toEqual([['loaded', 'new']])
    expect(host.memory()?.rows).toHaveLength(2)
  })
})

describe('AC-1205.4 Worker 입구(createStatsHost.load)가 묶음을 세어 일 줄에 채운다', () => {
  // 가짜 묶음 열쇠(t + 16자리). A는 두 코드, B는 한 코드
  const A = 't00000000000000a1'
  const B = 't00000000000000b2'
  const GROUPS = [
    { id: A, codes: ['MM042', 'B4001'] },
    { id: B, codes: ['B4001'] },
  ]
  // 1번 환자가 9월 1일에 MM042와 B4001을 같이 받았다(묶음 A에는 1건)
  const GROUP_ROWS = [...ROWS, [CHARTS[0], '20260901', 'B4001', '20260901']]
  const none = (id: string) => ({ id, patients: 0, newPatients: 0, returning: 0 })

  async function loadedWith(over: Partial<StatsLoadRequest>) {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', helperJson({ rows: GROUP_ROWS })).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1', over))
    expect(sent.map((m) => m.type)).toEqual(['loaded'])
    const [reply] = sent
    if (reply.type !== 'loaded') throw new Error('loaded가 아니다')
    return { view: reply.view, sent }
  }

  it('AC-1205.4: host.load({ …, groups })의 loaded 답 days[].groups에 열쇠마다 한 줄. 같은 환자·같은 날 두 코드는 1, 그날 안 받은 묶음은 0줄', async () => {
    const { view, sent } = await loadedWith({ groups: GROUPS })
    expect(view.days?.map((day) => [day.day, day.groups])).toEqual([
      [
        '2026-09-01',
        [
          { id: A, patients: 2, newPatients: 2, returning: 0 },
          { id: B, patients: 1, newPatients: 1, returning: 0 },
        ],
      ],
      [
        '2026-09-02',
        [
          { id: A, patients: 2, newPatients: 2, returning: 0 },
          { id: B, patients: 1, newPatients: 1, returning: 0 },
        ],
      ],
      ['2026-09-03', [{ id: A, patients: 1, newPatients: 1, returning: 0 }, none(B)]],
      ['2026-10-05', [{ id: A, patients: 1, newPatients: 0, returning: 1 }, none(B)]],
      ['2026-11-01', [{ id: A, patients: 1, newPatients: 0, returning: 1 }, none(B)]],
    ])
    for (const day of view.days ?? []) expect(validateDayPayload(day)).toEqual(day)
    expectNoPatientData(sent)
  })

  it('AC-1205.4: 달 줄의 groups는 aggregate가 준 그대로다(그달 안 받은 묶음 줄을 채우지 않는다)', async () => {
    const { view } = await loadedWith({ groups: GROUPS })
    expect(view.months?.map((month) => [month.month, month.groups.map((g) => [g.id, g.patients, g.newPatients, g.returning])])).toEqual([
      [
        '2026-09',
        [
          [A, 5, 5, 0],
          [B, 2, 2, 0],
        ],
      ],
      ['2026-10', [[A, 1, 0, 1]]],
      ['2026-11', [[A, 1, 0, 1]]],
    ])
    for (const month of view.months ?? []) expect(validateMonthPayload(month)).toEqual(month)
  })

  it('AC-1205.4: groups가 없으면 []로 보고 일 줄의 groups가 비어 있다', async () => {
    const { view } = await loadedWith({})
    expect(view.days?.length).toBeGreaterThan(0)
    for (const day of view.days ?? []) expect(day.groups).toEqual([])
    for (const month of view.months ?? []) expect(month.groups).toEqual([])
  })
})

describe('AC-3705.4 비트 불러오기 끝까지: 빼는 처방·조건 묶음의 일 줄 숫자와 0줄', () => {
  // 가짜 묶음 열쇠(t + 16자리, 글자 차례 PLAIN < PT < COND). PLAIN은 PT와 넣는 처방이 같고 빼는 처방이 없다(견줌)
  const PLAIN = 't00000000000000b2'
  const PT = 't00000000000000c3'
  const COND = 't00000000000000d4'
  const GROUPS = [
    { id: PLAIN, codes: ['MM010', 'MM015'] },
    { id: PT, codes: ['MM010', 'MM015'], out: ['eswt7'] }, // 빼는 처방 코드는 대소문자를 가리지 않는다
    { id: COND, codes: ['MM010', 'MM080'], cond: [{ code: 'MM080', unless: ['MM020'] }] },
  ]
  // 9월 1일: 1번 MM010 + (뒤 줄의) ESWT7 → PT에서 빠짐. 2번 MM080 + MM020 → COND 조건에 걸리고 MM010이 없어 0
  // 9월 2일: 1번 MM010(재진), 3번 MM015 + MM010(신환), 2번 MM080만(재진)
  // 9월 3일: 4번 MM042만 → 세 묶음 모두 0건
  const EXCLUDE_ROWS = [
    [CHARTS[0], '20260901', 'MM010', '20260901'],
    [CHARTS[1], '20260901', 'MM080', '20260901'],
    [CHARTS[1], '20260901', 'MM020', '20260901'],
    [CHARTS[0], '20260901', 'ESWT7', '20260901'],
    [CHARTS[0], '20260902', 'MM010', '20260901'],
    [CHARTS[2], '20260902', 'MM015', '20260902'],
    [CHARTS[2], '20260902', 'MM010', '20260902'],
    [CHARTS[1], '20260902', 'MM080', '20260901'],
    [CHARTS[3], '20260903', 'MM042', '20260903'],
  ]
  const count = (id: string, patients: number, newPatients: number, returning: number) => ({ id, patients, newPatients, returning })
  const EXPECTED = [
    ['2026-09-01', [count(PLAIN, 1, 1, 0), count(PT, 0, 0, 0), count(COND, 1, 1, 0)]],
    ['2026-09-02', [count(PLAIN, 2, 1, 1), count(PT, 2, 1, 1), count(COND, 3, 1, 2)]],
    ['2026-09-03', [count(PLAIN, 0, 0, 0), count(PT, 0, 0, 0), count(COND, 0, 0, 0)]],
  ]
  const daysIn = (view: StatsLoaded) => view.days?.map((day) => [day.day, day.groups])

  it('AC-3705.4: host.load({ …, groups })의 loaded 답 days[].groups — 빼는 처방·조건 묶음은 셈 규칙대로이고 그날 0건이면 0줄이다', async () => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', helperJson({ rows: EXCLUDE_ROWS })).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1', { groups: GROUPS }))
    expect(sent.map((m) => m.type)).toEqual(['loaded'])
    const [reply] = sent
    if (reply.type !== 'loaded') throw new Error('loaded가 아니다')
    expect(daysIn(reply.view)).toEqual(EXPECTED)
    for (const day of reply.view.days ?? []) expect(validateDayPayload(day)).toEqual(day)
    expectNoPatientData(sent)
  })

  it('AC-3705.4: 화면 입구 requestLoad → (구조화 복제) → Worker 입구 → loaded로 이어도 같은 숫자다(빼는 처방·조건이 메시지에서 빠지지 않는다)', async () => {
    const sent: StatsWorkerMessage[] = []
    const worker = {
      onmessage: null as ((event: MessageEvent<StatsWorkerMessage>) => void) | null,
      onerror: null,
      onmessageerror: null,
      postMessage: (request: StatsLoadRequest) => void host.load(structuredClone(request)),
    }
    const host = createStatsHost((message) => {
      sent.push(message)
      worker.onmessage?.({ data: structuredClone(message) } as MessageEvent<StatsWorkerMessage>)
    })
    bridgeMessages('s1', helperJson({ rows: EXCLUDE_ROWS })).forEach((m) => host.fromBridge(m))
    // 화면 묶음 값처럼 이름·차례가 붙어 와도 된다
    const screenGroups = GROUPS.map((group, sortOrder) => ({ ...group, name: `가짜 묶음 ${sortOrder}`, sortOrder }))
    const view = await requestLoad(worker as unknown as WorkerLike, { streamId: 's1', ...OPTS, groups: screenGroups })
    expect(daysIn(view)).toEqual(EXPECTED)
    expectNoPatientData(sent)
    expect(JSON.stringify(sent)).not.toContain('가짜 묶음')
  })
})

describe('AC-505.5 stats.worker.ts: 실제 포트(MessageChannel)로 이어 본다', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('bridge-port로 받은 포트의 조각 + load → loaded, 환자 자료 없음', SLOW, async () => {
    const posted: StatsWorkerMessage[] = []
    const scope = {
      onmessage: null as ((event: { data: unknown; ports: readonly MessagePort[] }) => void) | null,
      postMessage: (message: StatsWorkerMessage) => posted.push(message),
    }
    vi.stubGlobal('self', scope)
    await import('../stats.worker')
    const channel = new MessageChannel()
    try {
      scope.onmessage?.({ data: { type: 'bridge-port' }, ports: [channel.port2] })
      bridgeMessages('s1', helperJson()).forEach((m) => channel.port1.postMessage(m))
      scope.onmessage?.({ data: loadRequest('s1'), ports: [] })
      await vi.waitFor(() => expect(posted).toHaveLength(1), { timeout: 10_000 })
      expect(posted[0].type).toBe('loaded')
      expectNoPatientData(posted)
    } finally {
      channel.port1.close()
      channel.port2.close()
    }
  })
})

// 기간 합계에는 visits 칸이 있다(화면에 가는 수). 나머지는 AC-505.5 그대로 없어야 한다
const SPLIT_FORBIDDEN_KEYS = FORBIDDEN_KEYS.filter((key) => key !== 'visits')
function expectNoPatientInSplit(value: unknown) {
  const texts = textsIn(value)
  for (const id of CHARTS) expect(texts.some((text) => text.includes(id))).toBe(false)
  for (const key of SPLIT_FORBIDDEN_KEYS) expect(keysIn(value)).not.toContain(key)
}

const SPLIT_DAYS = [
  ['20260901', 2, 2, 2],
  ['20260902', 2, 2, 2],
  ['20260903', 1, 1, 1],
  ['20261005', 1, 1, 0],
  ['20261101', 1, 1, 0],
]
const memoryOf = (over: Record<string, unknown> = {}) => loadJob(helperJson({ days: SPLIT_DAYS, ...over }), OPTS).memory
const WHOLE = { from: FROM, to: TODAY }

function splitIn(view: RxSplitView) {
  if (view.kind !== 'split') throw new Error('결과가 없다')
  return view
}

describe('AC-509.4 splitJob: 메모리의 진료 줄 → 처방별 결과', () => {
  it('불러온 자료가 없으면 none', () => {
    expect(splitJob(null, WHOLE)).toEqual({ kind: 'none' })
  })

  it.each([
    ['첫날이 범위 앞', { from: '2026-08-31', to: TODAY }],
    ['끝날이 범위 뒤', { from: FROM, to: '2026-11-02' }],
    ['둘 다 범위 밖', { from: '2026-01-01', to: '2026-01-31' }],
    ['첫날이 끝날 뒤', { from: '2026-10-05', to: '2026-10-01' }],
    ['없는 날', { from: '2026-09-31', to: '2026-10-01' }],
  ])('기간이 불러온 범위 밖이면 none: %s', (_name, range) => {
    expect(splitJob(memoryOf(), range)).toEqual({ kind: 'none' })
  })

  it('불러온 기간 전체: 기간 합계는 날짜별 합계(환자 = 접수 건수), 줄은 합계가 큰 차례이고 처방 이름이 붙는다', () => {
    const view = splitIn(splitJob(memoryOf(), WHOLE))
    expect(view.split).toEqual({
      from: FROM,
      to: TODAY,
      visits: 7,
      patients: 7,
      newPatients: 5,
      returning: 2,
      invalidCodes: 0,
      lines: [
        { code: 'MM042', label: '표층열치료', newPatients: 4, returning: 1, total: 5 },
        { code: 'B4001', label: '일반혈액검사', newPatients: 1, returning: 0, total: 1 },
      ],
    })
    expect(view.headline).toBe('2026-09-01 ~ 2026-11-01 (62일) · 외래 환자 7명 (신환 5명 · 재진 2명) · 내원 7건')
  })

  it('기간 전체의 합계도 날짜별 합계다: 도우미 기간 합계를 쓰지 않는다', () => {
    const summary = { visits: 12, patients: 9, newPatients: 5, noChart: 0, duplicate: 0, noFirst: 0 }
    expect(splitIn(splitJob(memoryOf({ summary }), WHOLE)).split).toMatchObject({ visits: 7, patients: 7, newPatients: 5, returning: 2 })
  })

  const WHOLE_AND_PART = [
    ['불러온 범위 전체', WHOLE],
    ['불러온 범위 일부', { from: '2026-09-01', to: '2026-09-30' }],
  ] as const

  it.each(WHOLE_AND_PART)('AC-509.4 처방 없는 접수만 있는 재진 환자도 머리 글에 든다: %s', (_name, range) => {
    const rows = [[chart(1), '20260902', 'MM042', '20250101']]
    const patientDays = [...receptionsOf(rows), [NO_RX_CHART, '20260902', 1, '20240101']]
    const summary = { visits: 2, patients: 2, newPatients: 0, noChart: 0, duplicate: 0, noFirst: 0 }
    const days = [['20260902', 2, 2, 0]]
    const { split, headline } = splitIn(splitJob(memoryOf({ rows, patientDays, summary, days }), range))
    expect(split).toMatchObject({ visits: 2, patients: 2, newPatients: 0, returning: 2 })
    expect(split.lines).toEqual([{ code: 'MM042', label: '표층열치료', newPatients: 0, returning: 1, total: 1 }])
    expect(headline).toContain('외래 환자 2명 (신환 0명 · 재진 2명) · 내원 2건')
  })

  it.each(WHOLE_AND_PART)('AC-509.4 같은 사람이 다섯 번 오면 머리 글 5, 처방 줄 1: %s', (_name, range) => {
    const visitDays = ['20260901', '20260908', '20260915', '20260922', '20260929']
    const rows = visitDays.map((day) => [chart(1), day, 'MM042', '20260901'])
    const days = visitDays.map((day, i) => [day, 1, 1, i === 0 ? 1 : 0])
    const summary = { visits: 5, patients: 1, newPatients: 1, noChart: 0, duplicate: 0, noFirst: 0 }
    const { split, headline } = splitIn(splitJob(memoryOf({ rows, summary, days }), range))
    expect(split).toMatchObject({ visits: 5, patients: 5, newPatients: 1, returning: 4 })
    expect(split.lines).toEqual([{ code: 'MM042', label: '표층열치료', newPatients: 1, returning: 0, total: 1 }])
    expect(headline).toContain('외래 환자 5명 (신환 1명 · 재진 4명) · 내원 5건')
  })

  it.each(['noChart', 'duplicate', 'noFirst'])('AC-509.4 미완성 불러오기(%s)에도 같은 규칙으로 숫자를 낸다', (key) => {
    const summary = { visits: 9, patients: 8, newPatients: 5, noChart: 0, duplicate: 0, noFirst: 0, [key]: 1 }
    expect(splitIn(splitJob(memoryOf({ summary }), WHOLE)).split).toMatchObject({ visits: 7, patients: 7, newPatients: 5, returning: 2 })
  })

  it('합계가 같으면 코드 순이다. 이름이 없거나 빈 글자면 코드를 이름으로 쓴다', () => {
    const rows = [
      [chart(1), '20260901', 'ZZ100', '20260901'],
      [chart(2), '20260901', 'AA200', '20260901'],
      [chart(3), '20260902', 'MM300', '20250101'],
      [chart(4), '20260902', 'MM300', '20250101'],
    ]
    const codes = [
      ['MM300', '가짜처방'],
      ['ZZ100', ''],
    ]
    const { split } = splitIn(splitJob(memoryOf({ rows, codes }), WHOLE))
    expect(split.lines.map((line) => [line.code, line.label, line.total])).toEqual([
      ['MM300', '가짜처방', 2],
      ['AA200', 'AA200', 1],
      ['ZZ100', 'ZZ100', 1],
    ])
  })

  it('코드 목록은 그 기간 진료 줄의 모든 처방코드다: 기간 밖에만 있는 코드는 줄이 없다', () => {
    const { split } = splitIn(splitJob(memoryOf(), { from: '2026-10-01', to: TODAY }))
    expect(split.lines).toEqual([{ code: 'MM042', label: '표층열치료', newPatients: 0, returning: 2, total: 2 }])
  })

  it('고른 처방이 없으니 원본의 "하나라도" 줄을 넣지 않는다: 모든 줄이 처방이고 글에도 없다', () => {
    const view = splitIn(splitJob(memoryOf(), WHOLE))
    expect(view.split.lines.every((line) => line.code !== '')).toBe(true)
    for (const day of view.days) expect(day.lines.every((line) => line.code !== '')).toBe(true)
    expect(view.text).not.toContain('하나라도')
  })

  it('불러온 기간의 일부: 신환은 그 기간 첫날로 다시 나누고 합계는 그 기간 날 숫자로 낸다', () => {
    const view = splitIn(splitJob(memoryOf(), { from: '2026-09-02', to: '2026-10-05' }))
    expect(view.split).toEqual({
      from: '2026-09-02',
      to: '2026-10-05',
      visits: 4,
      patients: 4,
      newPatients: 3,
      returning: 1,
      invalidCodes: 0,
      lines: [
        { code: 'MM042', label: '표층열치료', newPatients: 2, returning: 1, total: 3 },
        { code: 'B4001', label: '일반혈액검사', newPatients: 1, returning: 0, total: 1 },
      ],
    })
    expect(view.headline).toBe('2026-09-02 ~ 2026-10-05 (34일) · 외래 환자 4명 (신환 3명 · 재진 1명) · 내원 4건')
  })

  it('불러온 기간의 일부: 처방 없는 접수도 그날 숫자로 들어 재진은 환자 − 신환이다', () => {
    const days = [['20260903', 3, 3, 2]]
    const { split } = splitIn(splitJob(memoryOf({ days }), { from: '2026-09-03', to: '2026-09-03' }))
    expect(split).toMatchObject({ visits: 3, patients: 3, newPatients: 2, returning: 1 })
    expect(split.lines).toEqual([{ code: 'MM042', label: '표층열치료', newPatients: 1, returning: 0, total: 1 }])
  })

  it('불러온 기간의 일부: 처방받은 환자가 없는 날이면 줄 없이 0이고 none이 아니다', () => {
    const view = splitIn(splitJob(memoryOf(), { from: '2026-09-15', to: '2026-09-15' }))
    expect(view.split).toMatchObject({ visits: 0, patients: 0, newPatients: 0, returning: 0, lines: [] })
    expect(view.days).toEqual([])
    expect(view.headline).toBe('2026-09-15 (화) · 외래 환자 0명 (신환 0명 · 재진 0명) · 내원 0건')
  })

  it('첫 내원을 못 찾은 환자는 신환이 아니다', () => {
    const rows = [[chart(1), '20260901', 'MM042', null]]
    const summary = { visits: 1, patients: 1, newPatients: 0, noChart: 0, duplicate: 0, noFirst: 1 }
    const { split } = splitIn(splitJob(memoryOf({ rows, summary }), WHOLE))
    expect(split.lines).toEqual([{ code: 'MM042', label: '표층열치료', newPatients: 0, returning: 1, total: 1 }])
  })

  it('날짜별: 그 기간 날만, 줄 차례는 기간과 같고 그날 첫 내원이 신환이다', () => {
    const { days } = splitIn(splitJob(memoryOf(), { from: '2026-09-02', to: '2026-10-05' }))
    expect(days.map((day) => day.date)).toEqual(['2026-09-02', '2026-09-03', '2026-10-05'])
    expect(days[0]).toEqual({
      date: '2026-09-02',
      visits: 2,
      patients: 2,
      newPatients: 2,
      returning: 0,
      lines: [
        { code: 'MM042', label: '표층열치료', newPatients: 1, returning: 0, total: 1 },
        { code: 'B4001', label: '일반혈액검사', newPatients: 1, returning: 0, total: 1 },
      ],
    })
    expect(days[2].lines).toEqual([
      { code: 'MM042', label: '표층열치료', newPatients: 0, returning: 1, total: 1 },
      { code: 'B4001', label: '일반혈액검사', newPatients: 0, returning: 0, total: 0 },
    ])
  })

  it('글: Worker는 병원 이름을 받지 않아 첫 줄이 비어 있다. 나머지는 원본 글 모양이다', () => {
    const view = splitIn(splitJob(memoryOf(), WHOLE))
    expect(view.text).toBe(
      [
        '',
        '처방별 신환·재진',
        '2026-09-01 ~ 2026-11-01 (62일) · 외래 환자 7명 (신환 5명 · 재진 2명) · 내원 7건',
        '',
        '처방       신환   재진   합계',
        '표층열치료      4명    1명    5명',
        '일반혈액검사     1명    0명    1명',
      ].join('\n'),
    )
  })

  it('AC-3801.4: 30일 기간 — 최초 내원일(10-15)에 X, 다시 온 날(10-20)에 Y를 받은 환자는 Y 줄에서 재진. 머리 줄·날짜별은 지금 규칙 값 그대로', () => {
    // 가짜 코드: XX001(초진진찰료 자리), YY001(재진진찰료 자리). 1 = 10-15 첫 방문 뒤 10-20 다시 옴, 2 = 옛 환자, 3 = 10-20 첫 방문
    const rows = [
      [chart(1), '20261015', 'XX001', '20261015'],
      [chart(2), '20261015', 'XX001', '20240101'],
      [chart(1), '20261020', 'YY001', '20261015'],
      [chart(3), '20261020', 'XX001', '20261020'],
    ]
    const codes = [
      ['XX001', '가짜초진'],
      ['YY001', '가짜재진'],
    ]
    const days = [
      ['20261015', 2, 2, 1],
      ['20261020', 2, 2, 1],
    ]
    const summary = { visits: 4, patients: 3, newPatients: 2, noChart: 0, duplicate: 0, noFirst: 0 }
    const view = splitIn(splitJob(memoryOf({ rows, codes, days, summary }), { from: '2026-10-01', to: '2026-10-30' }))
    expect(view.split).toEqual({
      from: '2026-10-01',
      to: '2026-10-30',
      visits: 4,
      patients: 4,
      newPatients: 2,
      returning: 2,
      invalidCodes: 0,
      lines: [
        { code: 'XX001', label: '가짜초진', newPatients: 2, returning: 1, total: 3 },
        { code: 'YY001', label: '가짜재진', newPatients: 0, returning: 1, total: 1 },
      ],
    })
    expect(view.headline).toBe('2026-10-01 ~ 2026-10-30 (30일) · 외래 환자 4명 (신환 2명 · 재진 2명) · 내원 4건')
    expect(view.days).toEqual([
      {
        date: '2026-10-15',
        visits: 2,
        patients: 2,
        newPatients: 1,
        returning: 1,
        lines: [
          { code: 'XX001', label: '가짜초진', newPatients: 1, returning: 1, total: 2 },
          { code: 'YY001', label: '가짜재진', newPatients: 0, returning: 0, total: 0 },
        ],
      },
      {
        date: '2026-10-20',
        visits: 2,
        patients: 2,
        newPatients: 1,
        returning: 1,
        lines: [
          { code: 'XX001', label: '가짜초진', newPatients: 1, returning: 0, total: 1 },
          { code: 'YY001', label: '가짜재진', newPatients: 0, returning: 1, total: 1 },
        ],
      },
    ])
    expectNoPatientInSplit(view)
  })

  it('결과에 환자 번호·진료 줄이 없다: 처방마다 수와 이름뿐이다', () => {
    const view = splitIn(splitJob(memoryOf(), WHOLE))
    expect(Object.keys(view).sort()).toEqual(['days', 'headline', 'kind', 'split', 'text'])
    expect(Object.keys(view.split).sort()).toEqual(['from', 'invalidCodes', 'lines', 'newPatients', 'patients', 'returning', 'to', 'visits'])
    for (const line of [...view.split.lines, ...view.days.flatMap((day) => day.lines)]) {
      expect(Object.keys(line).sort()).toEqual(['code', 'label', 'newPatients', 'returning', 'total'])
    }
    expectNoPatientInSplit(view)
  })
})

describe('AC-509.4 Worker 일: split', () => {
  const splitRequest = (streamId: string, range = WHOLE): StatsSplitRequest => ({ type: 'split', streamId, ...range })

  async function loaded(id: string, over: Record<string, unknown> = {}) {
    const hosted = hostUnderTest()
    bridgeMessages(id, helperJson({ days: SPLIT_DAYS, ...over })).forEach((m) => hosted.host.fromBridge(m))
    await hosted.host.load(loadRequest(id))
    hosted.sent.length = 0
    return hosted
  }

  it('불러오기 전이면 none을 받은 번호로 돌려준다', () => {
    const { host, sent } = hostUnderTest()
    host.split(splitRequest('q1'))
    expect(sent).toEqual([{ type: 'split-result', streamId: 'q1', view: { kind: 'none' } }])
  })

  it('불러온 뒤면 결과를 보낸다. 환자 번호·진료 줄이 없다', async () => {
    const { host, sent } = await loaded('s1')
    host.split(splitRequest('q1'))
    expect(sent).toHaveLength(1)
    const [reply] = sent
    expect(reply.type === 'split-result' && reply.streamId).toBe('q1')
    expect(reply.type === 'split-result' && reply.view.kind).toBe('split')
    expectNoPatientInSplit(sent)
  })

  it('다음 load가 메모리를 덮어쓴다', async () => {
    const { host, sent } = await loaded('s1')
    bridgeMessages('s2', helperJson({ days: SPLIT_DAYS, rows: ROWS.slice(0, 1), codes: [['MM042', '표층열치료']] })).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s2'))
    sent.length = 0
    host.split(splitRequest('q1'))
    const [reply] = sent
    if (reply.type !== 'split-result') throw new Error('split-result가 아니다')
    expect(splitIn(reply.view).split.lines).toEqual([{ code: 'MM042', label: '표층열치료', newPatients: 1, returning: 0, total: 1 }])
  })

  it('split은 메모리를 바꾸지 않는다: 같은 기간을 또 물어도 같다', async () => {
    const { host, sent } = await loaded('s1')
    host.split(splitRequest('q1', { from: '2026-09-02', to: '2026-10-05' }))
    host.split(splitRequest('q2', WHOLE))
    host.split(splitRequest('q3', { from: '2026-09-02', to: '2026-10-05' }))
    const views = sent.map((m) => (m.type === 'split-result' ? m.view : null))
    expect(views[2]).toEqual(views[0])
    expect(views[1]).not.toEqual(views[0])
  })

  it('계산이 터져도 번호만 보낸다', () => {
    const { host, sent } = hostUnderTest()
    const leak = `차트 ${chart(1)}`
    const broken = {
      type: 'split',
      streamId: 'q1',
      to: TODAY,
      get from(): string {
        throw new Error(leak)
      },
    } as StatsSplitRequest
    host.split(broken)
    expect(sent).toEqual([{ type: 'failed', streamId: 'q1', code: 'E-ANALYZE-FAILED' }])
  })
})

describe('AC-509.4 stats.worker.ts: split을 일에 잇는다', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('화면의 split → split-result', SLOW, async () => {
    const posted: StatsWorkerMessage[] = []
    const scope = {
      onmessage: null as ((event: { data: unknown; ports: readonly MessagePort[] }) => void) | null,
      postMessage: (message: StatsWorkerMessage) => posted.push(message),
    }
    vi.stubGlobal('self', scope)
    await import('../stats.worker')
    scope.onmessage?.({ data: { type: 'split', streamId: 'q1', ...WHOLE }, ports: [] })
    expect(posted).toEqual([{ type: 'split-result', streamId: 'q1', view: { kind: 'none' } }])
  })
})

// ── 같은 처방 재방문(again, fu-rate AC-1302.4) ──
// 지어낸 환자 하나가 오늘 − 7일(10/25)에 MM042를 시작하고, 7일째인 오늘 또 받는다. 값은 모두 지어낸 것이다
const AGAIN_START = addDays(TODAY, -7)
const AGAIN_ROWS = [...ROWS, [chart(8), '20261025', 'MM042', '20250101'], [chart(8), '20261101', 'MM042', '20250101']]

describe('AC-1302.4 loadJob: 날 줄마다 같은 처방 재방문(again)', () => {
  it.each([false, true])('AC-1302.4: 오늘 진료 끝 %s → view.days의 날마다 again이 있고 validateDayPayload를 지난다', (closeToday) => {
    const { view } = loadJob(helperJson({ rows: AGAIN_ROWS }), { ...OPTS, closeToday })
    expect(view.days?.map((d) => d.day)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-10-05', AGAIN_START, TODAY])
    for (const day of view.days ?? []) {
      expect(day.again).toBeDefined()
      expect(validateDayPayload(day)).toEqual(day)
    }
    // 9/1: 두 명이 MM042를 시작하고 다시 받지 않았다(CHARTS[0]의 10/5는 34일 뒤라 새 시작). 세 창 모두 끝났다
    expect(dayOf(view, '2026-09-01')?.again).toEqual({
      ready: [true, true, true],
      rx: [{ code: 'MM042', starts: 2, back: [0, 0, 0], more: [0, 0, 0] }],
    })
  })

  it('AC-1302.4: 오늘 진료 끝(closeToday true)이면 오늘 − 7일 시작의 7일 창이 숫자다(오늘 줄이 든다)', () => {
    const { view } = loadJob(helperJson({ rows: AGAIN_ROWS }), { ...OPTS, closeToday: true })
    expect(AGAIN_START).toBe('2026-10-25')
    expect(dayOf(view, AGAIN_START)?.again).toEqual({
      ready: [true, false, false],
      rx: [{ code: 'MM042', starts: 1, back: [1, null, null], more: [1, null, null] }],
    })
  })

  it('AC-1302.4: 끄면 오늘 − 7일 시작의 7일 창은 null이다(7일째인 오늘이 아직 집계 중)', () => {
    const { view } = loadJob(helperJson({ rows: AGAIN_ROWS }), OPTS)
    expect(dayOf(view, AGAIN_START)?.partial).toBe(false)
    expect(dayOf(view, AGAIN_START)?.again).toEqual({
      ready: [false, false, false],
      rx: [{ code: 'MM042', starts: 1, back: [null, null, null], more: [null, null, null] }],
    })
  })
})

// ── 비트 전용 세 칸(stats-bit-sections): 환자 구성 · 시간대별 접수 · 원장님별 ──
// v3 답 = v2 열쇠 그대로 + 접수 줄·사람 줄·원장님 줄·날·원장님 금액. 생년월일·주소·이름·코드·금액은 모두 지어낸 값이다
const DOCTOR_CODES = ['D9001', 'D9002']
const RECEIPT_TIMES = ['0915', '0947', '1433', '1012', '1105', '1620', '0930']
const PEOPLE: [string, string | null, string | null][] = [
  [CHARTS[0], '19800505', '경기 수원시 영통구 매탄동'],
  [CHARTS[1], '19920315', '경기 수원시 팔달구 인계동'],
  [CHARTS[2], '20150720', '경기 용인시 기흥구 구갈동'],
  [CHARTS[3], null, '경기 화성시 봉담읍'],
  [CHARTS[4], '19551111', null],
  [CHARTS[5], '19700101', '서울 강남구 역삼동'],
]
const V3_EXTRA = {
  visits: [
    [CHARTS[0], '20260901', '0915', '건강보험', 'D9001'],
    [CHARTS[1], '20260901', '0947', '의료급여 1종', 'D9002'],
    [CHARTS[2], '20260902', '1433', '건강보험', 'D9001'],
    [CHARTS[3], '20260902', '1012', '차상위 1종', 'D9002'],
    [CHARTS[4], '20260903', null, '자동차보험', 'D9001'],
    [CHARTS[0], '20261005', '1105', '건강보험', 'D9001'],
    [null, '20261005', '1620', null, null],
    [CHARTS[5], '20261101', '0930', '건강보험', 'D9002'],
  ],
  people: PEOPLE,
  doctors: [
    ['D9001', '김가상'],
    ['D9002', '이가상'],
  ],
  doctorDays: [
    ['20260901', 'D9001', 120_000],
    ['20260902', 'D9002', 80_000],
    ['20261005', 'D9001', 30_000],
  ],
}
const v3Json = (over: Record<string, unknown> = {}) => helperJson({ v: 3, ...V3_EXTRA, ...over })
const OCTOBER_ON = { from: '2026-10-01', to: TODAY } // 불러온 범위의 일부
const SEPTEMBER = { from: FROM, to: '2026-09-30' } // OCTOBER_ON의 견줄 기간(범위 안)

function readyIn(view: BitSectionsView) {
  if (view.kind !== 'ready') throw new Error('세 칸 보기가 없다')
  return view
}
const rowOf = <T extends { label: string }>(rows: readonly T[], label: string) => rows.find((row) => row.label === label)
const cellSum = (view: ReturnType<typeof readyIn>) => view.hours.rows.flatMap((row) => row.cells).reduce((sum, n) => sum + n, 0)

describe('AC-2702.1·AC-2702.3 sectionsJob: 메모리의 접수 줄 → 세 칸 보기', () => {
  it('AC-2702.3: 불러온 적이 없으면 none', () => {
    expect(sectionsJob(null, WHOLE)).toEqual({ kind: 'none' })
  })

  it.each([
    ['첫날이 범위 앞', { from: '2026-08-31', to: TODAY }],
    ['끝날이 범위 뒤', { from: FROM, to: '2026-11-02' }],
    ['둘 다 범위 밖', { from: '2026-01-01', to: '2026-01-31' }],
    ['첫날이 끝날 뒤', { from: '2026-10-05', to: '2026-10-01' }],
    ['없는 날', { from: '2026-09-31', to: '2026-10-01' }],
  ])('AC-2702.3: 고른 기간이 불러온 범위 밖이면 none(v3·v2 모두): %s', (_name, range) => {
    expect(sectionsJob(loadJob(v3Json(), OPTS).bit, range)).toEqual({ kind: 'none' })
    expect(sectionsJob(loadJob(helperJson(), OPTS).bit, range)).toEqual({ kind: 'none' })
  })

  it('AC-2702.1: v2 답(옛 도우미)을 불러왔으면 범위 안 기간은 old-helper다', () => {
    const { bit } = loadJob(helperJson(), OPTS)
    expect(sectionsJob(bit, WHOLE)).toEqual({ kind: 'old-helper' })
    expect(sectionsJob(bit, { ...OCTOBER_ON, previous: SEPTEMBER })).toEqual({ kind: 'old-helper' })
  })

  it('AC-2702.3: v3 답이면 ready이고 mix에 [전체]·[신환] 둘 다, 동네는 [구·시]·[동] 둘 다 있다(단추를 눌러도 다시 묻지 않는다)', () => {
    const view = readyIn(sectionsJob(loadJob(v3Json(), OPTS).bit, WHOLE))
    expect(Object.keys(view).sort()).toEqual(['doctors', 'hours', 'kind', 'mix'])
    expect(Object.keys(view.mix).sort()).toEqual(['all', 'new'])
    for (const mix of [view.mix.all, view.mix.new]) {
      expect(mix.city.length).toBeGreaterThan(0)
      expect(mix.town.length).toBeGreaterThan(0)
    }
  })

  it('AC-2702.3·AC-3803.4: 불러온 기간 전체 — 명은 서로 다른 환자, 건은 접수, 신환은 그 환자의 첫 내원일(f) 날 접수만', () => {
    const view = readyIn(sectionsJob(loadJob(v3Json(), OPTS).bit, WHOLE))
    const { mix, hours, doctors } = view
    expect(mix.all.total).toEqual({ people: 6, visits: 8 })
    // 9월 신환 5명의 f 날 접수 5건. 10-05에 다시 온 접수, 옛 환자(첫 내원 2025년), 차트번호 없는 접수는 빠진다
    expect(mix.new.total).toEqual({ people: 5, visits: 5 })
    expect(mix.all.compared).toBe(false)
    expect(rowOf(mix.all.insurance, '차상위')?.people).toBe(1)
    expect(rowOf(mix.all.city, '영통구')?.people).toBe(1)
    expect(rowOf(mix.all.town, '매탄동')?.visits).toBe(2)
    expect(hours.unknown).toBe(1)
    expect(cellSum(view)).toBe(7)
    if (doctors.kind !== 'table') throw new Error('원장님 표가 없다')
    expect(doctors.total).toMatchObject({ patients: 6, newPatients: 5, visits: 8, amount: 230_000 })
    expect(mix.new.total.people).toBe(doctors.total.newPatients) // 원장님별 신환(이미 f 날 기준)과 같다(AC-3803.4)
    expect(doctors.rows.map((row) => row.label)).toEqual(['김가상', '이가상', '진료의 미지정'])
    expect(rowOf(doctors.rows, '김가상')).toMatchObject({ patients: 3, visits: 4, amount: 150_000 })
  })

  it('AC-2702.3: 불러온 범위의 일부를 고르면 그 기간 접수·수납만 센다', () => {
    const view = readyIn(sectionsJob(loadJob(v3Json(), OPTS).bit, OCTOBER_ON))
    const { mix, hours, doctors } = view
    expect(mix.all.total).toEqual({ people: 2, visits: 3 })
    expect(mix.new.total).toEqual({ people: 0, visits: 0 })
    expect(hours.unknown).toBe(0)
    expect(cellSum(view)).toBe(3)
    if (doctors.kind !== 'table') throw new Error('원장님 표가 없다')
    expect(doctors.total).toMatchObject({ visits: 3, amount: 30_000 })
  })

  it('AC-2702.3·AC-2703.9: 견줄 기간이 불러온 범위 안이면 [전체]·[신환] 모두 지난 기간 명이 있다', () => {
    const { mix } = readyIn(sectionsJob(loadJob(v3Json(), OPTS).bit, { ...OCTOBER_ON, previous: SEPTEMBER }))
    expect(mix.all.compared).toBe(true)
    expect(mix.new.compared).toBe(true)
    expect(rowOf(mix.all.age, '40대')).toMatchObject({ people: 1, previous: 1 })
    expect(rowOf(mix.all.age, '50대')).toMatchObject({ people: 1, previous: 0 })
    expect(rowOf(mix.all.age, '30대')).toMatchObject({ people: 0, previous: 1 })
    expect(rowOf(mix.new.age, '40대')).toMatchObject({ people: 0, previous: 1 })
    // 지금 기간 숫자는 견주지 않을 때와 같다
    const alone = readyIn(sectionsJob(loadJob(v3Json(), OPTS).bit, OCTOBER_ON))
    expect(mix.all.total).toEqual(alone.mix.all.total)
    expect(mix.all.age.map((row) => row.people)).toEqual(alone.mix.all.age.map((row) => row.people))
  })

  it.each([
    ['견줄 기간이 없음', null],
    ['앞이 범위 밖(일부만 걸침)', { from: '2026-08-01', to: '2026-09-30' }],
    ['뒤가 범위 밖', { from: '2026-10-15', to: '2026-11-05' }],
    ['첫날이 끝날 뒤', { from: '2026-09-30', to: '2026-09-01' }],
    ['없는 날', { from: '2026-09-31', to: '2026-09-30' }],
  ])('AC-2702.3·AC-2703.9: %s이면 지난 숫자가 없다(compared false, 줄마다 previous null)', (_name, previous) => {
    const { mix } = readyIn(sectionsJob(loadJob(v3Json(), OPTS).bit, { ...OCTOBER_ON, previous }))
    for (const one of [mix.all, mix.new]) {
      expect(one.compared).toBe(false)
      for (const row of [...one.age, ...one.insurance, ...one.city, ...one.town]) expect(row.previous).toBeNull()
    }
  })

  it('AC-2702.3: 고른 기간에 접수가 없어도 ready이고 숫자가 0이다(화면이 "접수가 없어요"를 보인다)', () => {
    const { mix, hours } = readyIn(sectionsJob(loadJob(v3Json(), OPTS).bit, { from: '2026-10-06', to: '2026-10-31' }))
    expect(mix.all.total).toEqual({ people: 0, visits: 0 })
    expect(hours.peak).toBeNull()
  })
})

// 화면에 가도 되는 글자: 일 이름·번호·종류와 묶음 이름(연령대·보험·동네·원장님 이름)
const AGE_LABELS = ['10세 미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80세 이상', '생년월일 없음']
const INSURANCE_LABELS = ['건강보험', '의료급여 1종', '차상위', '자동차보험', '보험 모름']
const PLACE_LABELS = ['영통구', '팔달구', '용인시 기흥구', '화성시', '강남구', '매탄동', '인계동', '구갈동', '봉담읍', '역삼동', '동 없는 주소', '주소 없음']
const DOCTOR_LABELS = ['김가상', '이가상', '진료의 미지정', '합계']
const KINDS = ['ready', 'none', 'old-helper', 'row', 'rest', 'noTown', 'table', 'single']

// 값 자리의 글자만(열쇠는 뺀다)
function valuesIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(valuesIn)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(valuesIn)
  return []
}

const SECTIONS_FORBIDDEN_KEYS = ['p', 'd', 'h', 'ins', 'doc', 'birth', 'area', 'chart', 'first', 'doctorDays', 'extra', 'bit', 'patientDays']
const dashedDay = (day: string) => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`

function expectOnlyLabelsAndNumbers(sent: readonly StatsWorkerMessage[]) {
  const json = JSON.stringify(sent)
  for (const id of CHARTS) expect(json).not.toContain(id)
  for (const [, birth, area] of PEOPLE) {
    if (birth !== null) {
      expect(json).not.toContain(birth)
      expect(json).not.toContain(dashedDay(birth))
    }
    if (area !== null) expect(json).not.toContain(area)
  }
  for (const code of DOCTOR_CODES) expect(json).not.toContain(code)
  for (const time of RECEIPT_TIMES) expect(json).not.toContain(`"${time}"`)
  for (const key of SECTIONS_FORBIDDEN_KEYS) expect(keysIn(sent)).not.toContain(key)
  const allowed = new Set([
    'sections-result',
    ...sent.map((message) => message.streamId),
    ...KINDS,
    ...AGE_LABELS,
    ...INSURANCE_LABELS,
    ...PLACE_LABELS,
    ...DOCTOR_LABELS,
  ])
  expect(valuesIn(sent).filter((text) => !allowed.has(text) && !/^그 밖 \d+곳$/.test(text))).toEqual([])
}

type SectionsSpan = { from: string; to: string; previous?: { from: string; to: string } | null }
const sectionsRequest = (streamId: string, span: SectionsSpan = WHOLE): StatsSectionsRequest => ({
  type: 'sections',
  streamId,
  previous: null,
  ...span,
})

describe('AC-2702.1·AC-2702.3 Worker 일: sections', () => {
  async function loadedWith(id: string, text: string) {
    const hosted = hostUnderTest()
    bridgeMessages(id, text).forEach((m) => hosted.host.fromBridge(m))
    await hosted.host.load(loadRequest(id))
    hosted.sent.length = 0
    return hosted
  }

  it('AC-2702.3: 불러오기 전이면 none을 받은 번호로 돌려준다', () => {
    const { host, sent } = hostUnderTest()
    host.sections(sectionsRequest('b1'))
    expect(sent).toEqual([{ type: 'sections-result', streamId: 'b1', view: { kind: 'none' } }])
  })

  it('AC-2702.1: v2 답을 불러온 뒤면 old-helper', async () => {
    const { host, sent } = await loadedWith('s1', helperJson())
    host.sections(sectionsRequest('b1'))
    expect(sent).toEqual([{ type: 'sections-result', streamId: 'b1', view: { kind: 'old-helper' } }])
  })

  it('AC-2702.3: v3 답을 불러온 뒤면 ready를 받은 번호로 보낸다', async () => {
    const { host, sent } = await loadedWith('s1', v3Json())
    host.sections(sectionsRequest('b1', { ...OCTOBER_ON, previous: SEPTEMBER }))
    expect(sent).toHaveLength(1)
    const [reply] = sent
    if (reply.type !== 'sections-result') throw new Error('sections-result가 아니다')
    expect(reply.streamId).toBe('b1')
    expect(readyIn(reply.view).mix.all.compared).toBe(true)
    expect(reply.view).toEqual(sectionsJob(loadJob(v3Json(), OPTS).bit, { ...OCTOBER_ON, previous: SEPTEMBER }))
  })

  it('AC-2702.1: 다음 load가 덮어쓴다(v3 뒤 v2면 old-helper). 실패한 불러오기는 앞 자료를 그대로 둔다', async () => {
    const { host, sent } = await loadedWith('s1', v3Json())
    bridgeMessages('s2', v3Json({ visits: [['x'], 1] })).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s2'))
    host.sections(sectionsRequest('b1'))
    bridgeMessages('s3', helperJson()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s3'))
    host.sections(sectionsRequest('b2'))
    expect(sent.map((m) => m.type)).toEqual(['failed', 'sections-result', 'loaded', 'sections-result'])
    expect(sent.flatMap((m) => (m.type === 'sections-result' ? [m.view.kind] : []))).toEqual(['ready', 'old-helper'])
  })

  it('AC-2702.3: sections는 메모리를 바꾸지 않는다: 같은 기간을 또 물어도 같다', async () => {
    const { host, sent } = await loadedWith('s1', v3Json())
    host.sections(sectionsRequest('b1', OCTOBER_ON))
    host.sections(sectionsRequest('b2', WHOLE))
    host.sections(sectionsRequest('b3', OCTOBER_ON))
    const views = sent.map((m) => (m.type === 'sections-result' ? m.view : null))
    expect(views[2]).toEqual(views[0])
    expect(views[1]).not.toEqual(views[0])
  })

  it('AC-2702.4: 계산이 터져도 번호만 보낸다', async () => {
    const { host, sent } = await loadedWith('s1', v3Json())
    const leak = `차트 ${chart(1)}`
    const broken = {
      type: 'sections',
      streamId: 'b1',
      to: TODAY,
      previous: null,
      get from(): string {
        throw new Error(leak)
      },
    } as StatsSectionsRequest
    host.sections(broken)
    expect(sent).toEqual([{ type: 'failed', streamId: 'b1', code: 'E-ANALYZE-FAILED' }])
  })
})

describe('AC-2702.3 stats.worker.ts: sections를 일에 잇는다', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('AC-2702.3: 화면의 sections → sections-result', SLOW, async () => {
    const posted: StatsWorkerMessage[] = []
    const scope = {
      onmessage: null as ((event: { data: unknown; ports: readonly MessagePort[] }) => void) | null,
      postMessage: (message: StatsWorkerMessage) => posted.push(message),
    }
    vi.stubGlobal('self', scope)
    await import('../stats.worker')
    scope.onmessage?.({ data: sectionsRequest('b1'), ports: [] })
    expect(posted).toEqual([{ type: 'sections-result', streamId: 'b1', view: { kind: 'none' } }])
  })
})

describe('AC-2702.4 화면에 가는 세 칸 보기에는 묶음 이름과 숫자뿐이다', () => {
  it('AC-2702.4: sections-result를 JSON으로 펴도 차트번호·생년월일·주소 앞부분·접수 시각 줄·진료의 코드가 없다', async () => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', v3Json()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    sent.length = 0
    host.sections(sectionsRequest('b1', WHOLE))
    host.sections(sectionsRequest('b2', { ...OCTOBER_ON, previous: SEPTEMBER }))
    expect(sent.map((m) => m.type)).toEqual(['sections-result', 'sections-result'])
    expect(sent.every((m) => m.type === 'sections-result' && m.view.kind === 'ready')).toBe(true)
    expectOnlyLabelsAndNumbers(sent)
  })

  // stats-bit-ai AC-2906.3 ④: 새 자료 가운데 sections(원장님 이름·5명 이상 보험·동네 이름·수)만 실린다. 그 밖은 지금처럼 없다
  it('AC-2702.4·AC-2906.3: 불러온 메시지(loaded)의 새 자료는 sections뿐이고 진료의 코드·생년월일·주소·5명 미만 묶음 이름은 없다', async () => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', v3Json()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    expect(sent.map((m) => m.type)).toEqual(['loaded'])
    const json = JSON.stringify(sent)
    for (const word of [...DOCTOR_CODES, '의료급여 1종', '자동차보험', '매탄동', '19800505', '1980-05-05']) {
      expect(json).not.toContain(word)
    }
    const withoutSections = sent.map((m) => (m.type === 'loaded' ? { ...m, view: { ...m.view, sections: undefined } } : m))
    for (const word of ['김가상', '이가상']) expect(JSON.stringify(withoutSections)).not.toContain(word)
    expectNoPatientData(sent)
  })
})

describe('AC-2708.1 저장 줄·AI 보고는 지금 그대로', () => {
  // stats-bit-ai AC-2906.3 ③: v3 화면 값에는 sections 열쇠 하나만 더 있고 나머지는 v2 답과 글자 그대로 같다
  it('AC-2708.1·AC-2906.3: v3 답으로 불러와도 화면이 저장·보고에 쓰는 값(loaded view)이 sections 하나 빼고 v2 답과 같다', () => {
    const v2 = loadJob(helperJson(), OPTS).view
    const { sections, ...v3 } = loadJob(v3Json(), OPTS).view
    expect(sections).not.toBeNull()
    expect(v3).toEqual(v2)
    expect(Object.keys(v3).sort()).toEqual(['checks', 'covered', 'days', 'months', 'quality', 'range', 'report'])
    const keyLists = (view: StatsLoaded) => ({
      months: (view.months ?? []).map((month) => Object.keys(month).sort()),
      days: (view.days ?? []).map((day) => Object.keys(day).sort()),
      report: [...view.report.daily, ...view.report.monthly].map((set) => Object.keys(set).sort()),
    })
    expect(keyLists(v3)).toEqual(keyLists(v2))
    for (const month of v3.months ?? []) expect(validateMonthPayload(month)).toEqual(month)
    for (const day of v3.days ?? []) expect(validateDayPayload(day)).toEqual(day)
  })

  it('AC-2708.1: 처방별 메모리(StatsMemory)의 열쇠는 그대로이고, 세 칸 자료는 따로 Worker 안에만 있으며 차트번호 글자가 없다', () => {
    const { memory, bit } = loadJob(v3Json(), OPTS)
    expect(Object.keys(memory).sort()).toEqual(['days', 'names', 'range', 'rows', 'summary'])
    if (bit === null || bit.extra === null) throw new Error('세 칸 자료가 없다')
    expect(bit.range).toEqual({ from: FROM, to: TODAY })
    expect(textsIn(bit.extra.visits).some((text) => CHARTS.some((id) => text.includes(id)))).toBe(false)
    expect([...bit.extra.people.keys()].every((key) => typeof key === 'number')).toBe(true)
    expect([...bit.first.keys()].every((key) => typeof key === 'number')).toBe(true)
  })
})

describe('AC-2708.2·AC-2708.3 울타리와 지금 시험 자료', () => {
  // 새 계산·Worker 파일을 실제 eslint.config.mjs로 검사한다. 환자 자료 구역 규칙(네트워크·console·저장소·React import 막기)이 걸려 있다
  const NEW_FILES = [
    'src/lib/analytics/patientMix.ts',
    'src/lib/analytics/visitHours.ts',
    'src/lib/analytics/doctorStats.ts',
    'src/workers/stats/helperData.ts',
    'src/workers/stats/jobs.ts',
    'src/workers/stats.worker.ts',
  ]

  it('AC-2708.2: 새 계산 파일과 Worker 파일은 lint 오류가 없다', { timeout: 60_000 }, async () => {
    const { ESLint } = await import('eslint')
    const results = await new ESLint({ cwd: process.cwd() }).lintFiles(NEW_FILES)
    expect(results).toHaveLength(NEW_FILES.length)
    const errors = results.flatMap((r) => r.messages.filter((m) => m.severity === 2).map((m) => `${r.filePath}:${m.line} ${m.ruleId}`))
    expect(errors).toEqual([])
  })

  it('AC-2708.3: v3 시험 자료는 지금 v2 시험 자료에 v와 새 열쇠 넷만 더한 것이다(지금 자료·기대값은 그대로)', () => {
    const v2 = JSON.parse(helperJson()) as Record<string, unknown>
    const v3 = JSON.parse(v3Json()) as Record<string, unknown>
    expect(v2.v).toBe(2)
    expect(v3.v).toBe(3)
    expect(Object.keys(v3).filter((key) => !(key in v2)).sort()).toEqual(['doctorDays', 'doctors', 'people', 'visits'])
    for (const key of Object.keys(v2)) if (key !== 'v') expect(v3[key]).toEqual(v2[key])
  })
})

// ── 통계 비트 세 칸의 달 합계(sections, spec stats-bit-ai REQ-2901) ──
describe('AC-2901.1·AC-2901.6 loadJob: v3 답이면 달 줄마다 같은 달의 sections', () => {
  const sectionsOf = (view: StatsLoaded) => {
    if (!view.sections) throw new Error('sections가 없다')
    return view.sections
  }

  it('AC-2901.1: 달 줄마다 같은 차례로 하나씩이고 month·partial이 그 달 줄과 같으며 저장 검사를 넘는다', () => {
    const { view } = loadJob(v3Json(), OPTS)
    const sections = sectionsOf(view)
    expect(sections.map(({ month, partial }) => ({ month, partial }))).toEqual((view.months ?? []).map(({ month, partial }) => ({ month, partial })))
    expect(sections.map((s) => s.month)).toEqual(['2026-09', '2026-10', '2026-11'])
    for (const s of sections) expect(validateMonthSections(s)).toStrictEqual(s)
  })

  it('AC-2901.1·AC-2901.2·AC-2901.3·AC-2901.4: 9월 sections는 화면 세 칸과 같은 셈이다(5명 미만 보험·동네 없음, 원장님 둘)', () => {
    const [september, october, november] = sectionsOf(loadJob(v3Json(), OPTS).view)
    expect(september.mix.people).toBe(5)
    expect(september.mix.age.filter((row) => row.people > 0)).toEqual([
      { name: '10대', people: 1 },
      { name: '30대', people: 1 },
      { name: '40대', people: 1 },
      { name: '70대', people: 1 },
      { name: '생년월일 없음', people: 1 },
    ])
    expect(september.mix.insurance).toEqual([])
    expect(september.mix.town).toEqual([])
    // 9월 1일(화) 9시 두 건 · 2일(수) 10시·14시 · 3일(목)은 시각 모름 한 건뿐이라 문 연 날이 아니다
    expect(september.hours).toEqual({
      openDays: [0, 1, 1, 0, 0, 0, 0],
      weekdays: [0, 2, 2, 0, 0, 0, 0],
      hours: [0, 2, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      unknown: 1,
    })
    expect(september.doctors).toEqual([
      { name: '김가상', patients: 3, newPatients: 3, amount: 120_000 },
      { name: '이가상', patients: 2, newPatients: 2, amount: 80_000 },
    ])
    // 10월·11월은 접수한 원장님이 한 분이라 화면이 표를 그리지 않는다(single)
    expect(october.doctors).toEqual([])
    expect(november.doctors).toEqual([])
    expect(november.mix.people).toBe(1)
  })

  it('AC-2901.6: v2 답(옛 도우미)이면 화면 값에 sections 열쇠가 없다', () => {
    const { view } = loadJob(helperJson(), OPTS)
    expect('sections' in view).toBe(false)
  })

  it('AC-2901.6: 확인 건수가 있어 달 줄이 없으면(incomplete) sections도 null이다', () => {
    const summary = { visits: 7, patients: 6, newPatients: 5, noChart: 1, duplicate: 0, noFirst: 0 }
    const { view } = loadJob(v3Json({ summary }), OPTS)
    expect(view.months).toBeNull()
    expect(view.sections).toBeNull()
  })

  it('AC-2901.7: sections를 JSON으로 펴도 차트번호·생년월일·주소 앞부분·접수 시각·진료의 코드·5명 미만 묶음 이름이 없다', () => {
    const sections = sectionsOf(loadJob(v3Json(), OPTS).view)
    const json = JSON.stringify(sections)
    for (const word of [...CHARTS, ...DOCTOR_CODES, ...RECEIPT_TIMES, '19800505', '1980-05-05', '수원시', '매탄동', '의료급여 1종', '자동차보험']) {
      expect(json).not.toContain(word)
    }
    expectNoPatientData(sections)
  })
})

describe('AC-2906.1 새 파일 울타리', () => {
  it('AC-2906.1: 새 계산 파일(toMonthSections)과 고친 Worker 파일은 lint 오류가 없다', { timeout: 60_000 }, async () => {
    const files = ['src/lib/payload/toMonthSections.ts', 'src/lib/payload/validate.ts', 'src/workers/stats/jobs.ts']
    const { ESLint } = await import('eslint')
    const results = await new ESLint({ cwd: process.cwd() }).lintFiles(files)
    expect(results).toHaveLength(files.length)
    const errors = results.flatMap((r) => r.messages.filter((m) => m.severity === 2).map((m) => `${r.filePath}:${m.line} ${m.ruleId}`))
    expect(errors).toEqual([])
  })
})

describe('AC-3304.1 keep: false면 Worker 메모리를 바꾸지 않는다(나눠 읽기의 다른 조각)', () => {
  const A_TODAY = '2026-11-09'
  const A = { from: FROM, to: A_TODAY } // 지금 보는 기간을 담는 조각
  const B = { from: '2024-11-01', to: '2024-12-31' } // 옛 조각
  const A_TEXT = v3Json({ to: A_TODAY, report: reportOf(A_TODAY), days: SPLIT_DAYS })
  const B_ROWS = [
    [CHARTS[0], '20241105', 'MM042', '20241105'],
    [CHARTS[1], '20241210', 'B4001', '20241210'],
  ]
  const B_TEXT = helperJson(
    {
      from: B.from,
      rows: B_ROWS,
      days: [
        ['20241105', 1, 1, 1],
        ['20241210', 1, 1, 1],
      ],
      summary: { visits: 2, patients: 2, newPatients: 2, noChart: 0, duplicate: 0, noFirst: 0 },
    },
    B.to,
  )
  const IN_A = { from: '2026-09-02', to: '2026-10-05' }
  const splitRequest = (streamId: string, range: { from: string; to: string }): StatsSplitRequest => ({ type: 'split', streamId, ...range })

  async function loadInto(host: ReturnType<typeof hostUnderTest>['host'], id: string, text: string, over: Partial<StatsLoadRequest>) {
    bridgeMessages(id, text).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest(id, { today: A_TODAY, ...over }))
  }

  // A 안 기간·B에만 있는 기간을 split·sections로 차례대로 묻고 답만 돌려준다
  function ask(hosted: ReturnType<typeof hostUnderTest>) {
    hosted.sent.length = 0
    hosted.host.split(splitRequest('q1', A))
    hosted.host.split(splitRequest('q2', IN_A))
    hosted.host.sections(sectionsRequest('b1', { ...OCTOBER_ON, previous: SEPTEMBER }))
    hosted.host.sections(sectionsRequest('b2', A))
    hosted.host.split(splitRequest('q3', B))
    hosted.host.sections(sectionsRequest('b3', B))
    return hosted.sent.map((m) => (m.type === 'split-result' || m.type === 'sections-result' ? m.view : m))
  }

  it('AC-3304.1: B를 keep: false로 불러오면 B의 loaded 답은 지금처럼 오고, split·sections는 A의 메모리로 답한다', async () => {
    const hosted = hostUnderTest()
    await loadInto(hosted.host, 'a', A_TEXT, A)
    const before = ask(hosted)
    expect(before.slice(0, 4).map((view) => ('kind' in view ? view.kind : view.type))).toEqual(['split', 'split', 'ready', 'ready'])

    hosted.sent.length = 0
    await loadInto(hosted.host, 'b', B_TEXT, { ...B, keep: false })
    expect(hosted.sent).toHaveLength(1)
    const [reply] = hosted.sent
    if (reply.type !== 'loaded') throw new Error('loaded가 아니다')
    expect(reply.streamId).toBe('b')
    // B의 범위·달·날·확인 건수는 keep 없이 불러올 때와 같다
    expect(reply.view).toEqual(loadJob(B_TEXT, { ...B, today: A_TODAY, closeToday: false }).view)
    expect(reply.view.range).toEqual(B)
    expect(reply.view.months?.map((month) => month.month)).toEqual(['2024-11', '2024-12'])
    expect(reply.view.days?.length).toBeGreaterThan(0)
    expect(reply.view.checks).toEqual({ noChart: 0, duplicate: 0, noFirst: 0 })
    expectNoPatientData(hosted.sent)

    // A 안 기간은 B 전과 같은 답, B에만 있는 기간은 none
    const after = ask(hosted)
    expect(after.slice(0, 4)).toEqual(before.slice(0, 4))
    expect(after.slice(4)).toEqual([{ kind: 'none' }, { kind: 'none' }])
    expect(hosted.host.memory()?.range).toEqual(A)
  })

  it('AC-3304.1: 그 뒤 C를 keep 없이 불러오면 지금처럼 C로 바뀐다', async () => {
    const hosted = hostUnderTest()
    await loadInto(hosted.host, 'a', A_TEXT, A)
    await loadInto(hosted.host, 'b', B_TEXT, { ...B, keep: false })
    await loadInto(hosted.host, 'c', B_TEXT, B)
    expect(hosted.sent.map((m) => [m.type, m.streamId])).toEqual([
      ['loaded', 'a'],
      ['loaded', 'b'],
      ['loaded', 'c'],
    ])

    const views = ask(hosted)
    // A 기간은 이제 범위 밖, C(옛 도우미 v2 답) 기간은 처방별 결과와 old-helper
    expect(views.slice(0, 4)).toEqual([{ kind: 'none' }, { kind: 'none' }, { kind: 'none' }, { kind: 'none' }])
    expect(views.slice(4).map((view) => ('kind' in view ? view.kind : view.type))).toEqual(['split', 'old-helper'])
    expect(hosted.host.memory()?.range).toEqual(B)
  })

  it('AC-3304.1: keep: true는 keep 없음과 같다(메모리를 바꾼다). keep: false로 실패한 불러오기도 메모리를 그대로 둔다', async () => {
    const kept = hostUnderTest()
    await loadInto(kept.host, 'a', A_TEXT, A)
    await loadInto(kept.host, 'b', B_TEXT, { ...B, keep: true })
    expect(kept.host.memory()?.range).toEqual(B)

    const failed = hostUnderTest()
    await loadInto(failed.host, 'a', A_TEXT, A)
    await loadInto(failed.host, 'b', helperJson({ v: 1 }), { ...B, keep: false })
    expect(failed.sent.map((m) => m.type)).toEqual(['loaded', 'failed'])
    expect(failed.host.memory()?.range).toEqual(A)
  })
})

// ── v4 답(first90): v3 답 + 접수 줄 다섯째 칸(그 환자·날의 90일초진 접수 수) ──
// 1번 환자가 10/5에 다시 온 접수가 90일초진이다. 2번 환자의 9/1(첫 내원일) 줄에도 1을 두어 신환 쪽으로 세는지 본다. 숫자는 모두 지어낸 값이다
const V4_LINES = receptionsOf(ROWS).map(([person, day, receptions, first]) => [
  person,
  day,
  receptions,
  first,
  (person === CHARTS[0] && day === '20261005') || (person === CHARTS[1] && day === '20260901') ? 1 : 0,
])
const v4Json = () => v3Json({ v: 4, patientDays: V4_LINES })
const totalsOn = (view: StatsLoaded, day: string) => dayOf(view, day)?.totals

describe('AC-4402.2·AC-4402.4 loadJob: v4 답이면 날·달 저장 줄에 first90', () => {
  it('AC-4402.2·AC-4402.4: 날 줄 totals에 first90(첫 내원일 줄은 빼고), 재진은 그만큼 준다', () => {
    const { view } = loadJob(v4Json(), OPTS)
    expect(totalsOn(view, '2026-09-01')).toEqual({ patients: 2, newPatients: 2, first90: 0, returning: 0, unknown: 0 })
    expect(totalsOn(view, '2026-10-05')).toEqual({ patients: 1, newPatients: 0, first90: 1, returning: 0, unknown: 0 })
    expect(totalsOn(view, TODAY)).toEqual({ patients: 1, newPatients: 0, first90: 0, returning: 1, unknown: 0 })
  })

  it('AC-4402.4: 달 줄 totals의 first90은 그 달 날 줄의 합이고, 날·달 줄 모두 저장 검사를 지난다', () => {
    const { view } = loadJob(v4Json(), OPTS)
    expect(monthIn(view, '2026-09')?.totals).toEqual({ patients: 5, newPatients: 5, first90: 0, returning: 0, unknown: 0 })
    expect(monthIn(view, '2026-10')?.totals).toEqual({ patients: 1, newPatients: 0, first90: 1, returning: 0, unknown: 0 })
    for (const month of view.months ?? []) expect(validateMonthPayload(JSON.parse(JSON.stringify(month)))).toEqual(month)
    for (const day of view.days ?? []) expect(validateDayPayload(JSON.parse(JSON.stringify(day)))).toEqual(day)
  })

  it('AC-4402.2: first90 말고는 v3 답과 같다(재진에 90일초진을 더하면 v3 값)', () => {
    const v3 = loadJob(v3Json(), OPTS).view
    const v4 = loadJob(v4Json(), OPTS).view
    const folded = <T extends { totals: Totals }>(line: T): T => {
      const { first90 = 0, ...totals } = line.totals
      return { ...line, totals: { ...totals, returning: totals.returning + first90 } }
    }
    expect({ ...v4, days: v4.days?.map(folded), months: v4.months?.map(folded) }).toEqual(v3)
    expectNoPatientData(v4)
  })

  it('AC-4402.3: v2·v3 답의 날·달 저장 줄 totals에는 first90 열쇠가 없다', () => {
    for (const text of [helperJson(), v3Json()]) {
      const { view } = loadJob(text, OPTS)
      for (const line of [...(view.days ?? []), ...(view.months ?? [])]) expect(Object.keys(line.totals).sort()).toEqual(['newPatients', 'patients', 'returning', 'unknown'])
    }
  })

  it('AC-4402.1: Worker 메모리(BitMemory)에 답의 판이 남는다', () => {
    expect(loadJob(helperJson(), OPTS).bit.v).toBe(2)
    expect(loadJob(v3Json(), OPTS).bit.v).toBe(3)
    expect(loadJob(v4Json(), OPTS).bit.v).toBe(4)
  })
})

describe('AC-4409.1·AC-4409.2 loadJob: 날 저장 줄 처방마다 once', () => {
  it('AC-4409.1·AC-4409.2: 첫 내원일 처방을 그날만 받은 신환 수. 1번 환자는 10/5에 MM042를 또 받아 9/1에서 빠진다', () => {
    const { view } = loadJob(helperJson(), OPTS)
    const onceOn = (day: string) => dayOf(view, day)?.rx.map((x) => [x.code, x.newPatients, x.once])
    expect(onceOn('2026-09-01')).toEqual([['MM042', 2, 1]])
    expect(onceOn('2026-09-02')).toEqual([
      ['B4001', 1, 1],
      ['MM042', 1, 1],
    ])
    expect(onceOn('2026-10-05')).toEqual([['MM042', 0, 0]])
  })

  it('AC-4409.2: 옛 도우미(v2)·v3·v4 답 모두 같은 once다(Worker가 진료 줄로 센다). 달 줄 처방에는 once가 없다', () => {
    const onceLists = (text: string) => {
      const { view } = loadJob(text, OPTS)
      for (const month of view.months ?? []) for (const x of month.rx) expect('once' in x).toBe(false)
      return (view.days ?? []).map((day) => day.rx.map((x) => x.once))
    }
    const v2 = onceLists(helperJson())
    expect(v2.flat().every((n) => typeof n === 'number')).toBe(true)
    expect(onceLists(v3Json())).toEqual(v2)
    expect(onceLists(v4Json())).toEqual(v2)
  })
})

// ── 통계 '예약·전환'의 Block 전환(spec sunap-ilji AC-4906.3): 세 칸 묻기에 Block·물리치료 묶음 정의가 오면 메모리의 접수·진료 줄로 그 기간 sunapRates를 함께 돌려준다 ──
// v4 답(위 V4_LINES): 1번 환자 10/5 = 90일초진. Block = MM042, 물리치료 = B4001(3번 환자 9/2만). 묶음 열쇠는 지어낸 값이다
describe('AC-4906.3 sectionsJob·sections: 세 칸 보기와 함께 sunapRates', () => {
  const SUNAP = { block: { id: 't00000000000000a1', codes: ['MM042'] }, pt: { id: 't00000000000000a2', codes: ['B4001'] } }
  const RATE_KEYS = ['block_n', 'd90_block', 'd90_n', 'first_block', 'first_n', 'pt_n', 'ret_block', 'ret_n', 'visits']
  const ratesOf = (view: BitSectionsView): SunapRates => {
    const ready = readyIn(view)
    if (ready.sunap === undefined) throw new Error('sunap이 없다')
    return ready.sunap
  }

  it('AC-4906.3: 불러온 범위 전체 — 환자·날마다 초진·90일초진·재진·Block·물리치료와 각 구분의 Block 수이고, 숫자 아홉 칸뿐이다', () => {
    const view = sectionsJob(loadJob(v4Json(), OPTS).bit, { ...WHOLE, sunap: SUNAP })
    const rates = ratesOf(view)
    expect(Object.keys(rates).sort()).toEqual(RATE_KEYS)
    expect(rates).toEqual({ visits: 7, first_n: 5, d90_n: 1, ret_n: 1, block_n: 6, pt_n: 1, first_block: 4, d90_block: 1, ret_block: 1 })
    // 세 칸은 sunap 없이 묻은 답과 같다(묶음과 함께 오는 원장님별 sunapDoctors도 뺀다, spec sunap-doctors AC-5004.1)
    const { sunap, sunapDoctors, ...rest } = readyIn(view)
    expect(sunap).toBe(rates)
    expect(sunapDoctors?.total).toEqual(rates)
    expect(rest).toEqual(sectionsJob(loadJob(v4Json(), OPTS).bit, WHOLE))
  })

  it('AC-4906.3: 불러온 범위의 일부를 고르면 그 기간 환자·날만 센다', () => {
    expect(ratesOf(sectionsJob(loadJob(v4Json(), OPTS).bit, { ...OCTOBER_ON, previous: SEPTEMBER, sunap: SUNAP }))).toEqual({
      visits: 2,
      first_n: 0,
      d90_n: 1,
      ret_n: 1,
      block_n: 2,
      pt_n: 0,
      first_block: 0,
      d90_block: 1,
      ret_block: 1,
    })
  })

  it('AC-4906.3: v3 답(90일초진 칸 없음)이면 다시 온 날은 모두 재진이다', () => {
    expect(ratesOf(sectionsJob(loadJob(v3Json(), OPTS).bit, { ...WHOLE, sunap: SUNAP }))).toMatchObject({ first_n: 5, d90_n: 0, ret_n: 2, d90_block: 0, ret_block: 2 })
  })

  it('AC-4906.3: 묶음 정의가 없으면 sunap 열쇠가 없고, 불러온 적 없음·범위 밖·옛 도우미는 지금 답 그대로다', () => {
    expect('sunap' in readyIn(sectionsJob(loadJob(v4Json(), OPTS).bit, WHOLE))).toBe(false)
    expect(sectionsJob(null, { ...WHOLE, sunap: SUNAP })).toEqual({ kind: 'none' })
    expect(sectionsJob(loadJob(v4Json(), OPTS).bit, { from: '2026-08-01', to: TODAY, sunap: SUNAP })).toEqual({ kind: 'none' })
    expect(sectionsJob(loadJob(helperJson(), OPTS).bit, { ...WHOLE, sunap: SUNAP })).toEqual({ kind: 'old-helper' })
  })

  it('AC-4906.3: Worker 입구(host.sections)에 묶음이 오면 불러온 뒤 sections-result에 sunap을 실어 보내고, 차트번호·묶음 이름이 없다', async () => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', v4Json()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    sent.length = 0
    host.sections({ ...sectionsRequest('b1', WHOLE), sunap: SUNAP })
    expect(sent).toHaveLength(1)
    const [reply] = sent
    if (reply.type !== 'sections-result') throw new Error('sections-result가 아니다')
    expect(reply.streamId).toBe('b1')
    expect(ratesOf(reply.view)).toEqual(ratesOf(sectionsJob(loadJob(v4Json(), OPTS).bit, { ...WHOLE, sunap: SUNAP })))
    expectOnlyLabelsAndNumbers(sent)
  })

  it('AC-4906.3: 화면 입구 requestSections → (구조화 복제) → Worker 입구로 이어도 같은 숫자다(빼는 처방·조건이 빠지지 않고 이름·차례는 가지 않는다)', async () => {
    const sent: StatsWorkerMessage[] = []
    const received: StatsSectionsRequest[] = []
    const worker = {
      onmessage: null as ((event: MessageEvent<StatsWorkerMessage>) => void) | null,
      onerror: null,
      onmessageerror: null,
      postMessage: (request: StatsSectionsRequest) => {
        const copy = structuredClone(request)
        received.push(copy)
        host.sections(copy)
      },
    }
    const host = createStatsHost((message) => {
      sent.push(message)
      queueMicrotask(() => worker.onmessage?.({ data: structuredClone(message) } as MessageEvent<StatsWorkerMessage>))
    })
    bridgeMessages('s1', v4Json()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    const block = { id: 't00000000000000a3', codes: ['MM042'], out: ['ZZ999'], cond: [{ code: 'MM042', unless: ['B4001'] }], name: '가짜 블록', sortOrder: 0 }
    const pt = { ...SUNAP.pt, name: '가짜 물리치료', sortOrder: 1 }
    const view = await requestSections(worker as unknown as WorkerLike, { ...WHOLE, sunap: { block, pt } })
    expect(received.at(-1)?.sunap).toEqual({ block: { id: block.id, codes: block.codes, out: block.out, cond: block.cond }, pt: SUNAP.pt })
    expect(JSON.stringify(received)).not.toContain('가짜')
    expect(ratesOf(view)).toEqual(ratesOf(sectionsJob(loadJob(v4Json(), OPTS).bit, { ...WHOLE, sunap: { block: received.at(-1)!.sunap!.block, pt: SUNAP.pt } })))
  })
})

// ── 통계 '예약·전환'의 원장님별(spec sunap-doctors AC-5004.1): 묶음을 실어 물으면 같은 기간·접수 줄·처방 줄·묶음과 접수 줄 진료의로 원장님별 표를 함께 싣는다 ──
// v4 답(위 V3_EXTRA 접수 줄): 김가상(D9001) = 1번 9/1·3번 9/2·5번 9/3·1번 10/5(90일초진), 이가상(D9002) = 2번 9/1·4번 9/2·6번 11/1(재진).
// Block = MM042, 물리치료 = B4001(3번 환자 9/2만). 묶음 열쇠는 지어낸 값이다
describe('AC-5004.1 sectionsJob·sections: 묶음을 실어 물으면 원장님별 표(sunapDoctors)', () => {
  const SUNAP = { block: { id: 't00000000000000b1', codes: ['MM042'] }, pt: { id: 't00000000000000b2', codes: ['B4001'] } }
  const KIM = { visits: 4, first_n: 3, d90_n: 1, ret_n: 0, block_n: 3, pt_n: 1, first_block: 2, d90_block: 1, ret_block: 0 }
  const LEE = { visits: 3, first_n: 2, d90_n: 0, ret_n: 1, block_n: 3, pt_n: 0, first_block: 2, d90_block: 0, ret_block: 1 }
  const doctorsOf = (view: BitSectionsView) => {
    const ready = readyIn(view)
    if (!('sunapDoctors' in ready) || ready.sunapDoctors === undefined) throw new Error('sunapDoctors 열쇠가 없다')
    return ready.sunapDoctors
  }

  it('AC-5004.1: 불러온 범위 전체 — 원장님마다 sunapRates와 같은 규칙으로 세고(내원 많은 차례), 합계는 같은 답의 sunap과 같다', () => {
    const view = sectionsJob(loadJob(v4Json(), OPTS).bit, { ...WHOLE, sunap: SUNAP })
    const table = doctorsOf(view)
    if (table === null) throw new Error('원장님 두 분인데 표가 없다')
    expect(table.rows.map((row) => [row.label, row.rates])).toEqual([
      ['김가상', KIM],
      ['이가상', LEE],
    ])
    expect(table.total).toEqual(readyIn(view).sunap)
  })

  it('AC-5004.1: 불러온 범위의 일부를 고르면 그 기간 환자·날만 원장님별로 센다', () => {
    const table = doctorsOf(sectionsJob(loadJob(v4Json(), OPTS).bit, { ...OCTOBER_ON, previous: SEPTEMBER, sunap: SUNAP }))
    expect(table?.rows.map((row) => [row.label, row.rates.visits, row.rates.d90_n, row.rates.ret_n])).toEqual([
      ['김가상', 1, 1, 0],
      ['이가상', 1, 0, 1],
    ])
  })

  it('AC-5004.1: 접수 줄에 진료의가 없는 환자·날은 "진료의 미지정" 줄로 함께 나온다', () => {
    // 6번 환자 11/1 접수만 진료의를 비운다 → 김가상 4 · 이가상 2 · 미지정 1
    const visits = V3_EXTRA.visits.map((line) => (line[0] === CHARTS[5] ? [...line.slice(0, 4), null] : line))
    const view = sectionsJob(loadJob(v3Json({ v: 4, patientDays: V4_LINES, visits }), OPTS).bit, { ...WHOLE, sunap: SUNAP })
    const table = doctorsOf(view)
    expect(table?.rows.map((row) => [row.label, row.rates.visits])).toEqual([
      ['김가상', 4],
      ['이가상', 2],
      ['진료의 미지정', 1],
    ])
    expect(table?.total).toEqual(readyIn(view).sunap)
  })

  it('AC-5004.1: 그 기간 원장님이 한 분 이하면 null이고, 묶음 없이 물으면 sunapDoctors 열쇠가 없다', () => {
    const { bit } = loadJob(v4Json(), OPTS)
    // 10월은 1번 환자 10/5(김가상)뿐이다(차트번호 없는 접수는 환자·날 줄이 없다)
    const october = readyIn(sectionsJob(bit, { from: '2026-10-01', to: '2026-10-31', sunap: SUNAP }))
    expect(october.sunap?.visits).toBe(1)
    expect('sunapDoctors' in october).toBe(true)
    expect(october.sunapDoctors).toBeNull()
    expect('sunapDoctors' in readyIn(sectionsJob(bit, WHOLE))).toBe(false)
    expect(sectionsJob(loadJob(helperJson(), OPTS).bit, { ...WHOLE, sunap: SUNAP })).toEqual({ kind: 'old-helper' })
  })

  it('AC-5004.1·AC-2702.4: Worker 입구(host.sections)의 sections-result에 원장님별 표가 실리고, 원장님 이름과 수뿐이다(진료의 코드·차트번호 없음)', async () => {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', v4Json()).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1'))
    sent.length = 0
    host.sections({ ...sectionsRequest('b1', WHOLE), sunap: SUNAP })
    expect(sent).toHaveLength(1)
    const [reply] = sent
    if (reply.type !== 'sections-result') throw new Error('sections-result가 아니다')
    const table = doctorsOf(reply.view)
    expect(table?.rows.map((row) => [row.label, row.rates])).toEqual([
      ['김가상', KIM],
      ['이가상', LEE],
    ])
    expect(table?.rows.map((row) => row.code)).toEqual([null, null])
    expectOnlyLabelsAndNumbers(sent)
  })
})
