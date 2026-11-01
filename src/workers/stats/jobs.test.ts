import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, addMonths, monthOf } from '@/lib/analytics/dates'
import { validateDayPayload, validateMonthPayload } from '@/lib/payload/validate'
import type { StatsLoaded, StatsLoadRequest, StatsWorkerMessage } from '@/types/stats'
import { createStatsHost, loadJob } from './jobs'

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
