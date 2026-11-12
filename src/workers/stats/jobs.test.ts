import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, addMonths, monthOf } from '@/lib/analytics/dates'
import { validateDayPayload, validateMonthPayload } from '@/lib/payload/validate'
import type { RxSplitView, StatsLoaded, StatsLoadRequest, StatsSplitRequest, StatsWorkerMessage } from '@/types/stats'
import { createStatsHost, loadJob, splitJob } from './jobs'

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

describe('AC-2704.2 Worker 입구(createStatsHost.load)가 같은 날 제외할 처방을 받은 환자를 빼고 센다', () => {
  // 가짜 묶음 열쇠(rx-group-exclude AC-2705.2의 고정 값: MM010 중 ESWT7 날 뺌)
  const EXCLUDING = 't7bdb9b20a17a64d3'
  // 9월 1일: 1번 환자는 MM010과 ESWT7을 같이(제외할 처방 줄이 뒤에 온다), 2번 환자는 MM010만 받았다
  const EXCLUDE_ROWS = [
    ...ROWS,
    [CHARTS[0], '20260901', 'MM010', '20260901'],
    [CHARTS[0], '20260901', 'ESWT7', '20260901'],
    [CHARTS[1], '20260901', 'MM010', '20260901'],
  ]
  const none = (id: string) => ({ id, patients: 0, newPatients: 0, returning: 0 })

  async function loadedWith(over: Partial<StatsLoadRequest>) {
    const { host, sent } = hostUnderTest()
    bridgeMessages('s1', helperJson({ rows: EXCLUDE_ROWS })).forEach((m) => host.fromBridge(m))
    await host.load(loadRequest('s1', over))
    expect(sent.map((m) => m.type)).toEqual(['loaded'])
    const [reply] = sent
    if (reply.type !== 'loaded') throw new Error('loaded가 아니다')
    return { view: reply.view, sent }
  }
  const rowsOf = (view: StatsLoaded) => view.days?.map((day) => [day.day, day.groups.filter((group) => group.id === EXCLUDING)])

  it('AC-2704.2: host.load({ …, groups: [{ id, codes, exclude }] })의 loaded 답 일 줄에 그 열쇠 줄이 있고 같은 날 ESWT7을 받은 환자는 빠진다', async () => {
    const { view, sent } = await loadedWith({ groups: [{ id: EXCLUDING, codes: ['MM010'], exclude: ['ESWT7'] }] })
    expect(rowsOf(view)).toEqual([
      ['2026-09-01', [{ id: EXCLUDING, patients: 1, newPatients: 1, returning: 0 }]],
      ['2026-09-02', [none(EXCLUDING)]],
      ['2026-09-03', [none(EXCLUDING)]],
      ['2026-10-05', [none(EXCLUDING)]],
      ['2026-11-01', [none(EXCLUDING)]],
    ])
    for (const day of view.days ?? []) expect(validateDayPayload(day)).toEqual(day)
    expectNoPatientData(sent)
  })

  it('AC-2704.2: 같은 자료를 제외할 처방 없이 불러오면 그날 두 환자 모두 센다(빠진 것은 제외할 처방 때문이다)', async () => {
    const { view } = await loadedWith({ groups: [{ id: EXCLUDING, codes: ['MM010'] }] })
    expect(rowsOf(view)?.[0]).toEqual(['2026-09-01', [{ id: EXCLUDING, patients: 2, newPatients: 2, returning: 0 }]])
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
