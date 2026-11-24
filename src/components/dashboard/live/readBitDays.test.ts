import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { RxGroupDef } from '@/types/analysis'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { DayPayload } from '@/types/payload'
import type { StatsLoaded, StatsLoadRequest, StatsWorkerMessage } from '@/types/stats'
import { enterBackground } from '@/components/claim/bitLane'
import { requestLoad } from '@/workers/statsClient'
import { LOOKBACK_DAYS, READ_TIMEOUT_MS, readBitDays, type StatsWorkerLike } from './readBitDays'

// 비트 읽기 한 번 (design.md "### 읽기"). 진짜 connectScreenBridge·connectBridge·requestLoad에 가짜 확장(chrome.runtime)과 가짜 Worker만 넣는다.
// 자료는 모두 지어낸 값이다. 도우미 답 모양은 가짜 Worker가 받아 삼키므로 이 시험은 stats.rows 글자의 모양에 기대지 않는다
// requestLoad는 진짜를 그대로 부르는 vi.fn으로만 감싼다: 무엇을 넘겼는지 보려고(AC-3705.5). 하는 일은 바뀌지 않는다

vi.mock('@/workers/statsClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/workers/statsClient')>()
  return { ...real, requestLoad: vi.fn(real.requestLoad) }
})

const load = vi.mocked(requestLoad)

const TODAY = '2026-11-01'
const FROM = '2026-07-24' // 오늘 100일 전
const HELLO_OK = { helperVersion: '0.3.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
const CHECK_OK = {
  steps: [
    { name: 'find', ok: true },
    { name: 'db', ok: true },
    { name: 'registration', ok: true },
  ],
  registered: true,
  institutionCode: '12345678',
}
const FAKE_CHART = '000123'
const FAKE_CHUNK = `{"visits":[["${FAKE_CHART}","가상환자01"]]}`
const SHA = 'a'.repeat(64)
const DAY: DayPayload = {
  schemaVersion: 2,
  quality: 'valid',
  day: TODAY,
  partial: true,
  totals: { patients: 3, newPatients: 1, returning: 2, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: 0, within7: null, within14: null },
}
const VIEW: StatsLoaded = {
  range: { from: FROM, to: TODAY },
  covered: { from: FROM, to: '2026-10-31' },
  quality: 'valid',
  checks: { noChart: 0, duplicate: 0, noFirst: 0 },
  months: [],
  days: [DAY],
  report: { daily: [], monthly: [] },
}
const INCOMPLETE: StatsLoaded = { ...VIEW, quality: 'incomplete', checks: { noChart: 1, duplicate: 0, noFirst: 0 }, months: null, days: null }

// 확장 쪽 답. 함수면 받은 요청 id로 답을 만들고, 'silent'면 답하지 않는다
type Answer = 'silent' | ((id: string) => unknown[])
type Command = 'hello' | 'bit.check' | 'stats.rows'

const result = (data: unknown): Answer => (id) => [{ v: 1, id, type: 'result', data }]
const error = (code: string): Answer => (id) => [{ v: 1, id, type: 'error', code }]
const otherWindowHasIt: Answer = () => [{ v: 1, id: '', type: 'error', code: 'E-BRIDGE-BUSY' }]
const chunkEnd = (id: string) => [
  { v: 1, id, type: 'chunk', seq: 0, data: FAKE_CHUNK },
  { v: 1, id, type: 'end', count: 1, bytes: FAKE_CHUNK.length, sha256: SHA },
]

class FakePort implements PortLike {
  sent: { id: string; cmd: Command; args: unknown }[] = []
  disconnected = false
  private messageFns: ((m: unknown) => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: () => {} }

  constructor(private script: Record<Command, Answer>) {}

  postMessage(m: unknown) {
    if (this.disconnected) throw new Error('Attempting to use a disconnected port object')
    const request = m as FakePort['sent'][number]
    this.sent.push(request)
    const answer = this.script[request.cmd]
    if (answer !== 'silent') for (const reply of answer(request.id)) this.reply(reply)
  }
  disconnect() {
    this.disconnected = true
  }
  reply(m: unknown) {
    for (const fn of this.messageFns) fn(m)
  }
}

const opened: MessagePort[] = []

// 가짜 통계 Worker. 진짜처럼 load와 통로 끝(end)이 둘 다 와야 답한다. answer가 null이면 답하지 않는다
function fakeWorker(answer: (req: StatsLoadRequest) => StatsWorkerMessage | null) {
  const loads: StatsLoadRequest[] = []
  const fromBridge: Record<string, unknown>[] = []
  const worker = {
    onmessage: null as ((event: MessageEvent<StatsWorkerMessage>) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    terminate: vi.fn(),
    postMessage(message: { type: string }, transfer?: Transferable[]) {
      if (message.type === 'bridge-port') {
        const port = transfer![0] as MessagePort
        opened.push(port)
        port.onmessage = (e: MessageEvent) => {
          fromBridge.push(e.data as Record<string, unknown>)
          answerIfDue()
        }
      } else {
        loads.push(message as StatsLoadRequest)
        answerIfDue()
      }
    },
  }
  function answerIfDue() {
    const load = loads[0]
    if (!load || !fromBridge.some((m) => m.type === 'end')) return
    const reply = answer(load)
    if (reply) worker.onmessage?.({ data: reply } as MessageEvent<StatsWorkerMessage>)
  }
  return { worker, loads, fromBridge, like: worker as unknown as StatsWorkerLike }
}

const loaded =
  (view: StatsLoaded) =>
  (req: StatsLoadRequest): StatsWorkerMessage => ({ type: 'loaded', streamId: req.streamId, view })

function setup(
  script: Partial<Record<Command, Answer>> = {},
  answer: (req: StatsLoadRequest) => StatsWorkerMessage | null = loaded(VIEW),
) {
  const port = new FakePort({ hello: result(HELLO_OK), 'bit.check': result(CHECK_OK), 'stats.rows': chunkEnd, ...script })
  const runtime: ChromeRuntimeLike = { connect: () => port }
  const fake = fakeWorker(answer)
  const createWorker = vi.fn(() => fake.like)
  const read = (timeoutMs?: number, signal?: AbortSignal) => readBitDays({ runtime, createWorker, today: TODAY, timeoutMs, signal })
  const readWithGroups = (groups: readonly RxGroupDef[] | undefined) => readBitDays({ runtime, createWorker, today: TODAY, groups })
  const commands = () => port.sent.map((request) => request.cmd)
  /** AC-601.8: 어느 길이든 통로를 닫고 Worker를 끝낸다 */
  const expectClosed = () => {
    expect(port.disconnected).toBe(true)
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  }
  return { ...fake, port, read, readWithGroups, commands, expectClosed, createWorker }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const port of opened.splice(0)) port.close()
})

describe('readBitDays', () => {
  it('진짜 Worker를 StatsWorkerLike로 넘길 수 있다(타입 시험)', () => {
    expectTypeOf<Worker>().toExtend<StatsWorkerLike>()
  })

  describe('AC-601.1 차례', () => {
    it('AC-601.1: hello → bit.check → stats.rows(오늘 100일 전 ~ 오늘) 뒤 같은 id로 Worker에 load(closeToday: false)', async () => {
      const t = setup()
      await expect(t.read()).resolves.toEqual({ kind: 'days', days: [DAY] })
      expect(LOOKBACK_DAYS).toBe(100)
      expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows'])
      const stream = t.port.sent[2]
      expect(stream.args).toEqual({ from: FROM, to: TODAY })
      expect(t.loads).toEqual([{ type: 'load', streamId: stream.id, from: FROM, to: TODAY, today: TODAY, closeToday: false, groups: [] }])
      t.expectClosed()
    })
  })

  describe('AC-606.7 통계 탭 묶음 정의를 싣는다', () => {
    // 지어낸 열쇠·코드. 열쇠 만들기·같은 열쇠 한 번은 groupDefs(TASK-14)가 맡고, 여기서는 받은 것을 그대로 싣는지만 본다
    const GROUPS: RxGroupDef[] = [
      { id: 't00000000000000a1', codes: ['FAKE-RX-01', 'FAKE-RX-02'] },
      { id: 't00000000000000b2', codes: ['FAKE-RX-03'] },
    ]

    it('AC-606.7: groups를 주면 Worker load 요청에 그 { id, codes }가 그대로 실리고 나머지 읽기는 그대로다', async () => {
      const t = setup()
      await expect(t.readWithGroups(GROUPS)).resolves.toEqual({ kind: 'days', days: [DAY] })
      expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows'])
      const stream = t.port.sent[2]
      expect(stream.args).toEqual({ from: FROM, to: TODAY })
      expect(t.loads).toEqual([
        {
          type: 'load',
          streamId: stream.id,
          from: FROM,
          to: TODAY,
          today: TODAY,
          closeToday: false,
          groups: [
            { id: 't00000000000000a1', codes: ['FAKE-RX-01', 'FAKE-RX-02'] },
            { id: 't00000000000000b2', codes: ['FAKE-RX-03'] },
          ],
        },
      ])
      t.expectClosed()
    })

    it.each<[string, (t: ReturnType<typeof setup>) => Promise<unknown>]>([
      ['groups 칸이 없으면', (t) => t.read()],
      ['groups가 undefined면', (t) => t.readWithGroups(undefined)],
      ['groups가 빈 목록이면', (t) => t.readWithGroups([])],
    ])('AC-606.7: %s load 요청에 groups: []를 싣는다', async (_name, run) => {
      const t = setup()
      await expect(run(t)).resolves.toEqual({ kind: 'days', days: [DAY] })
      expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows'])
      expect(t.loads).toEqual([
        { type: 'load', streamId: t.port.sent[2].id, from: FROM, to: TODAY, today: TODAY, closeToday: false, groups: [] },
      ])
      t.expectClosed()
    })

    it('AC-606.7: 읽기를 시작한 뒤 넘긴 목록을 바꿔도 load 요청은 시작할 때의 정의 그대로다', async () => {
      const t = setup()
      const groups: RxGroupDef[] = GROUPS.map(({ id, codes }) => ({ id, codes: [...codes] }))
      const reading = t.readWithGroups(groups)
      // load는 hello·bit.check·stats.rows 답을 기다린 뒤에 간다. 그 사이에 부른 쪽이 목록을 바꾼다
      groups[0].codes.push('FAKE-RX-99')
      groups.push({ id: 't00000000000000c3', codes: ['FAKE-RX-04'] })
      await reading
      expect(t.loads).toHaveLength(1)
      expect(t.loads[0].groups).toEqual(GROUPS)
    })

    it('AC-606.7: 묶음 정의에 열쇠·코드 말고 다른 칸이 있어도 Worker로는 { id, codes }만 간다', async () => {
      const t = setup()
      const withName = [{ id: 't00000000000000a1', codes: ['FAKE-RX-01'], name: '가짜 묶음 이름' }]
      await t.readWithGroups(withName)
      expect(t.loads[0].groups).toStrictEqual([{ id: 't00000000000000a1', codes: ['FAKE-RX-01'] }])
      expect(JSON.stringify(t.loads)).not.toContain('가짜 묶음 이름')
    })
  })

  describe('AC-3705.5 빼는 처방·조건을 싣는다 (spec group-exclude, copyGroupDef)', () => {
    // 지어낸 열쇠·코드. 열쇠 만들기는 groupDefs가 맡고, 여기서는 readBitDays가 받은 정의를 copyGroupDef 사본으로 넘기는지만 본다.
    // 보는 곳은 진짜 requestLoad에 넘긴 묶음 정의다(requestLoad는 그대로 돈다). requestLoad가 그 정의를 Worker 메시지에 out·cond째
    // 옮기는 일은 TASK-9(statsClient.ts copyGroupDef)가 맡고 statsClient.test.ts가 시험한다
    const WITH_EXCLUDE: RxGroupDef[] = [
      { id: 't00000000000000d4', codes: ['FAKE-RX-01', 'FAKE-RX-02'], out: ['FAKE-RX-90'] },
      { id: 't00000000000000e5', codes: ['FAKE-RX-03'], cond: [{ code: 'FAKE-RX-03', unless: ['FAKE-RX-91', 'FAKE-RX-92'] }] },
      { id: 't00000000000000a1', codes: ['FAKE-RX-04'] },
    ]
    /** 진짜 requestLoad에 넘긴 묶음 정의(한 번만 불렸는지도 본다) */
    const loadedGroups = () => {
      expect(load).toHaveBeenCalledTimes(1)
      return load.mock.calls[0][1].groups
    }

    beforeEach(() => {
      load.mockClear()
    })

    it('AC-3705.5: 빼는 처방·조건 든 묶음은 비트 읽기 요청(requestLoad) 묶음 항목에 id·codes와 함께 out·cond가 실린다', async () => {
      const t = setup()
      await expect(t.readWithGroups(WITH_EXCLUDE)).resolves.toEqual({ kind: 'days', days: [DAY] })
      expect(loadedGroups()).toStrictEqual([
        { id: 't00000000000000d4', codes: ['FAKE-RX-01', 'FAKE-RX-02'], out: ['FAKE-RX-90'] },
        { id: 't00000000000000e5', codes: ['FAKE-RX-03'], cond: [{ code: 'FAKE-RX-03', unless: ['FAKE-RX-91', 'FAKE-RX-92'] }] },
        { id: 't00000000000000a1', codes: ['FAKE-RX-04'] },
      ])
      expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows'])
      t.expectClosed()
    })

    it('AC-3705.5: 빼는 처방·조건이 빈 배열인 묶음 항목은 지금처럼 { id, codes }뿐이다(요청과 Worker 메시지 모두)', async () => {
      const t = setup()
      await t.readWithGroups([{ id: 't00000000000000a1', codes: ['FAKE-RX-01'], out: [], cond: [] }])
      expect(loadedGroups()).toStrictEqual([{ id: 't00000000000000a1', codes: ['FAKE-RX-01'] }])
      expect(t.loads[0].groups).toStrictEqual([{ id: 't00000000000000a1', codes: ['FAKE-RX-01'] }])
    })

    it('AC-3705.5: 조건 항목은 { code, unless }만 가고 이름 같은 다른 칸은 실리지 않는다', async () => {
      const t = setup()
      const cond = [{ code: 'FAKE-RX-03', unless: ['FAKE-RX-91'], name: '가짜 조건 이름' }]
      await t.readWithGroups([{ id: 't00000000000000e5', codes: ['FAKE-RX-03'], cond, name: '가짜 묶음 이름' } as RxGroupDef])
      expect(loadedGroups()).toStrictEqual([{ id: 't00000000000000e5', codes: ['FAKE-RX-03'], cond: [{ code: 'FAKE-RX-03', unless: ['FAKE-RX-91'] }] }])
      expect(JSON.stringify(loadedGroups())).not.toContain('가짜')
      expect(JSON.stringify(t.loads)).not.toContain('가짜')
    })

    it('AC-3705.5: 읽기를 시작한 뒤 넘긴 빼는 처방·조건을 바꿔도 요청은 시작할 때의 정의 그대로다', async () => {
      const t = setup()
      const groups = structuredClone(WITH_EXCLUDE)
      const reading = t.readWithGroups(groups)
      // requestLoad는 hello·bit.check·stats.rows 답을 기다린 뒤에 불린다. 그 사이에 부른 쪽이 목록을 바꾼다
      groups[0].out!.push('FAKE-RX-99')
      groups[1].cond![0].unless.push('FAKE-RX-99')
      groups[1].cond!.push({ code: 'FAKE-RX-03', unless: ['FAKE-RX-98'] })
      await reading
      expect(loadedGroups()).toEqual(WITH_EXCLUDE)
    })
  })

  describe('AC-601.6 준비가 안 된 곳은 읽지 않는다', () => {
    it('AC-601.6: runtime이 없으면(휴대폰·확장 없는 PC) not-ready이고 Worker도 만들지 않는다', async () => {
      const createWorker = vi.fn(() => fakeWorker(loaded(VIEW)).like)
      await expect(readBitDays({ runtime: undefined, createWorker, today: TODAY })).resolves.toEqual({ kind: 'not-ready' })
      expect(createWorker).not.toHaveBeenCalled()
    })

    it('AC-601.6: 확장에 붙지 못하면 not-ready이고 만든 Worker를 끝낸다', async () => {
      const fake = fakeWorker(loaded(VIEW))
      const runtime: ChromeRuntimeLike = {
        connect() {
          throw new Error('Could not establish connection')
        },
      }
      await expect(readBitDays({ runtime, createWorker: () => fake.like, today: TODAY })).resolves.toEqual({ kind: 'not-ready' })
      expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
    })

    it('AC-601.6: 도우미가 없으면(E-HELPER-MISSING) not-ready이고 bit.check·stats.rows를 부르지 않는다', async () => {
      const t = setup({ hello: error('E-HELPER-MISSING') })
      await expect(t.read()).resolves.toEqual({ kind: 'not-ready' })
      expect(t.commands()).toEqual(['hello'])
      t.expectClosed()
    })

    it('AC-601.6: 확장 버전이 안 맞으면 not-ready이고 bit.check·stats.rows를 부르지 않는다', async () => {
      const t = setup({ hello: result({ ...HELLO_OK, extensionProtocol: 2 }) })
      await expect(t.read()).resolves.toEqual({ kind: 'not-ready' })
      expect(t.commands()).toEqual(['hello'])
      t.expectClosed()
    })

    it.each([
      ['find', 'E-BIT-NOT-FOUND'],
      ['db', 'E-BIT-DB-FAILED'],
      ['registration', 'E-BIT-HOSPITAL-MISMATCH'],
    ])('AC-601.6: bit.check의 %s 단계가 안 됨(%s)이면 not-ready이고 stats.rows를 부르지 않는다', async (name, code) => {
      const steps = CHECK_OK.steps.map((step) => (step.name === name ? { name, ok: false, code } : step))
      const t = setup({ 'bit.check': result({ ...CHECK_OK, steps }) })
      await expect(t.read()).resolves.toEqual({ kind: 'not-ready' })
      expect(t.commands()).toEqual(['hello', 'bit.check'])
      expect(t.loads).toEqual([])
      t.expectClosed()
    })

    it('AC-601.6: 세 단계가 모두 됨이어도 registered가 아니면 not-ready이고 stats.rows를 부르지 않는다', async () => {
      const { steps } = CHECK_OK
      const t = setup({ 'bit.check': result({ steps, registered: false }) })
      await expect(t.read()).resolves.toEqual({ kind: 'not-ready' })
      expect(t.commands()).toEqual(['hello', 'bit.check'])
      t.expectClosed()
    })
  })

  describe('AC-604.2 옛 도우미', () => {
    it('AC-604.2: 옛 도우미(0.1.1)면 hello에서 update-helper라 stats.rows를 보내지 않고 not-ready', async () => {
      const t = setup({ hello: result({ ...HELLO_OK, helperVersion: '0.1.1' }) })
      await expect(t.read()).resolves.toEqual({ kind: 'not-ready' })
      expect(t.commands()).toEqual(['hello'])
      expect(t.commands()).not.toContain('stats.rows')
      expect(t.loads).toEqual([])
      t.expectClosed()
    })
  })

  describe('AC-601.7 다른 창이 통로를 쓰는 중', () => {
    it('AC-601.7: hello에서 busy면 E-BIT-IN-USE이고 bit.check·stats.rows를 부르지 않는다', async () => {
      const t = setup({ hello: otherWindowHasIt })
      await expect(t.read()).resolves.toEqual({ kind: 'failed', code: 'E-BIT-IN-USE' })
      expect(t.commands()).toEqual(['hello'])
      t.expectClosed()
    })

    it.each<[Command]>([['bit.check'], ['stats.rows']])('AC-601.7: %s 도중 E-BRIDGE-BUSY여도 청구 번호가 아니라 E-BIT-IN-USE다', async (cmd) => {
      const t = setup({ [cmd]: error('E-BRIDGE-BUSY') })
      await expect(t.read()).resolves.toEqual({ kind: 'failed', code: 'E-BIT-IN-USE' })
      t.expectClosed()
    })
  })

  describe('AC-601.9 일 숫자만 돌려준다', () => {
    it('AC-601.9: 답은 days뿐이고(months·report·checks 없음) 조각은 Worker 포트로만 가며 fetch가 없다', async () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      const t = setup()
      const answer = await t.read()
      expect(answer).toStrictEqual({ kind: 'days', days: [DAY] })
      expect(t.fromBridge.map((m) => m.type)).toEqual(['chunk', 'end'])
      expect(t.fromBridge[0].data).toBe(FAKE_CHUNK)
      expect(JSON.stringify(answer)).not.toContain(FAKE_CHART)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('AC-601.11: 읽기는 됐지만 일 숫자가 빈 배열이면 빈 배열 그대로 돌려준다', async () => {
      const t = setup({}, loaded({ ...VIEW, days: [] }))
      await expect(t.read()).resolves.toEqual({ kind: 'days', days: [] })
      t.expectClosed()
    })
  })

  describe('AC-601.12 품질이 incomplete', () => {
    it('AC-601.12: days가 null이면 E-BIT-DATA-UNSURE', async () => {
      const t = setup({}, loaded(INCOMPLETE))
      await expect(t.read()).resolves.toEqual({ kind: 'failed', code: 'E-BIT-DATA-UNSURE' })
      t.expectClosed()
    })
  })

  describe('AC-601.4 읽기 실패는 번호로 끝난다', () => {
    it.each(['E-STATS-HISTORY', 'E-STATS-TOO-BIG', 'E-BIT-READ-FAILED', 'E-BIT-NOT-REGISTERED', 'E-BIT-HOSPITAL-MISMATCH'])(
      'AC-601.4: stats.rows가 %s로 끝나면 그 번호이고 Worker에 load를 보내지 않는다',
      async (code) => {
        const t = setup({ 'stats.rows': error(code) })
        await expect(t.read()).resolves.toEqual({ kind: 'failed', code })
        expect(t.loads).toEqual([])
        t.expectClosed()
      },
    )

    it.each(['E-STATS-TOO-BIG', 'E-BRIDGE-BAD-REPLY', 'E-ANALYZE-FAILED'])('AC-601.4: Worker가 %s로 끝나면 그 번호', async (code) => {
      const t = setup({}, (req) => ({ type: 'failed', streamId: req.streamId, code }))
      await expect(t.read()).resolves.toEqual({ kind: 'failed', code })
      t.expectClosed()
    })

    it('AC-601.4: hello가 오류 번호로 끝나면(모양이 틀린 답) 그 번호이고 bit.check를 부르지 않는다', async () => {
      const t = setup({ hello: result({ helperVersion: '0.2.0' }) })
      await expect(t.read()).resolves.toEqual({ kind: 'failed', code: 'E-BRIDGE-BAD-REPLY' })
      expect(t.commands()).toEqual(['hello'])
      t.expectClosed()
    })

    it('AC-601.4: bit.check가 오류 번호로 끝나면 그 번호이고 stats.rows를 부르지 않는다', async () => {
      const t = setup({ 'bit.check': error('E-BIT-READ-FAILED') })
      await expect(t.read()).resolves.toEqual({ kind: 'failed', code: 'E-BIT-READ-FAILED' })
      expect(t.commands()).toEqual(['hello', 'bit.check'])
      t.expectClosed()
    })

    it('AC-601.4: 표에 없는 번호는 옮기지 않고 E-BIT-READ-FAILED로 바꾼다', async () => {
      const t = setup({ 'stats.rows': error('E-SOMETHING-NEW') })
      await expect(t.read()).resolves.toEqual({ kind: 'failed', code: 'E-BIT-READ-FAILED' })
      t.expectClosed()
    })
  })

  describe('AC-601.15 읽는 중에 화면을 떠날 때', () => {
    it.each<[string, Parameters<typeof setup>[0], Parameters<typeof setup>[1], Command[], number]>([
      ['hello 답을 기다리는 중', { hello: 'silent' }, undefined, ['hello'], 0],
      ['bit.check 답을 기다리는 중', { 'bit.check': 'silent' }, undefined, ['hello', 'bit.check'], 0],
      ['stats.rows 답을 기다리는 중', { 'stats.rows': 'silent' }, undefined, ['hello', 'bit.check', 'stats.rows'], 0],
      ['Worker 답을 기다리는 중', {}, () => null, ['hello', 'bit.check', 'stats.rows'], 1],
    ])('AC-601.15: %s 취소하면 그 자리에서 통로를 닫고 바로 끝낸다', async (_name, script, answer, sent, loads) => {
      vi.useFakeTimers()
      const t = setup(script, answer)
      const leaving = new AbortController()
      let result: unknown = null
      void t.read(undefined, leaving.signal).then((r) => (result = r))
      await vi.advanceTimersByTimeAsync(10)
      expect(t.commands()).toEqual(sent)
      expect(t.loads).toHaveLength(loads)
      expect(t.port.disconnected).toBe(false)

      leaving.abort()
      // 기다리지 않고 바로 본다: 화면이 바뀌면 다음 화면이 같은 순간에 통로를 열기 때문이다
      t.expectClosed()

      await vi.advanceTimersByTimeAsync(0)
      expect(result).toEqual({ kind: 'not-ready' })
      t.expectClosed()
    })

    it('AC-601.15: 취소 뒤에 온 늦은 답으로 다음 단계를 보내지 않는다', async () => {
      vi.useFakeTimers()
      const t = setup({ hello: 'silent' })
      const leaving = new AbortController()
      void t.read(undefined, leaving.signal)
      await vi.advanceTimersByTimeAsync(10)

      leaving.abort()
      t.port.reply({ v: 1, id: t.port.sent[0].id, type: 'result', data: HELLO_OK })
      await vi.advanceTimersByTimeAsync(10)

      expect(t.commands()).toEqual(['hello'])
    })

    it('AC-601.15: 다 읽으면 취소 리스너를 뗀다', async () => {
      const t = setup()
      const leaving = new AbortController()
      const added = vi.spyOn(leaving.signal, 'addEventListener')
      const removed = vi.spyOn(leaving.signal, 'removeEventListener')

      await t.read(undefined, leaving.signal)

      expect(added).toHaveBeenCalledTimes(1)
      expect(removed).toHaveBeenCalledWith('abort', added.mock.calls[0][1])
    })

    it('AC-601.15: 이미 떠났으면 통로도 Worker도 만들지 않는다', async () => {
      const t = setup()
      const leaving = new AbortController()
      leaving.abort()

      await expect(t.read(undefined, leaving.signal)).resolves.toEqual({ kind: 'not-ready' })

      expect(t.createWorker).not.toHaveBeenCalled()
      expect(t.commands()).toEqual([])
    })

    it('AC-601.15: 다 읽은 뒤에 취소해도 답이 그대로고 Worker를 두 번 끝내지 않는다', async () => {
      const t = setup()
      const leaving = new AbortController()

      const result = await t.read(undefined, leaving.signal)
      leaving.abort()

      expect(result).toEqual({ kind: 'days', days: VIEW.days })
      t.expectClosed()
    })
  })

  describe('AC-601.10 3분 안에 끝나지 않을 때', () => {
    async function expectTimesOutAt(t: ReturnType<typeof setup>, ms: number, timeoutMs?: number) {
      vi.useFakeTimers()
      let answer: unknown = null
      void t.read(timeoutMs).then((r) => (answer = r))
      await vi.advanceTimersByTimeAsync(ms - 1)
      expect(answer).toBeNull()
      expect(t.port.disconnected).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(answer).toEqual({ kind: 'failed', code: 'E-BIT-READ-FAILED' })
      t.expectClosed()
    }

    it('AC-601.10: 정해 둔 시간은 3분이다', () => {
      expect(READ_TIMEOUT_MS).toBe(180_000)
    })

    it.each<[Command, Command[]]>([
      ['hello', ['hello']],
      ['bit.check', ['hello', 'bit.check']],
      ['stats.rows', ['hello', 'bit.check', 'stats.rows']],
    ])('AC-601.10: %s 답이 오지 않으면 3분에 E-BIT-READ-FAILED로 끝내고 통로를 닫는다', async (cmd, sent) => {
      const t = setup({ [cmd]: 'silent' })
      await expectTimesOutAt(t, READ_TIMEOUT_MS)
      expect(t.commands()).toEqual(sent)
    })

    it('AC-601.10: Worker 답이 오지 않아도 3분에 E-BIT-READ-FAILED로 끝내고 통로를 닫는다', async () => {
      await expectTimesOutAt(setup({}, () => null), READ_TIMEOUT_MS)
    })

    it('AC-601.10: 3분은 단계마다가 아니라 읽기 전체다(stats.rows가 2분 걸리면 Worker는 1분만 기다린다)', async () => {
      vi.useFakeTimers()
      const t = setup({ 'stats.rows': 'silent' }, () => null)
      let answer: unknown = null
      void t.read().then((r) => (answer = r))
      await vi.advanceTimersByTimeAsync(120_000)
      for (const reply of chunkEnd(t.port.sent[2].id)) t.port.reply(reply)
      await vi.advanceTimersByTimeAsync(0)
      expect(t.loads).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(59_999)
      expect(answer).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(answer).toEqual({ kind: 'failed', code: 'E-BIT-READ-FAILED' })
      t.expectClosed()
      expect(vi.getTimerCount()).toBe(0) // Worker 쪽 시계도 남은 시간만 쟀다
    })

    it('AC-601.10: timeoutMs를 주면 그 시간에 끝낸다', async () => {
      await expectTimesOutAt(setup({ hello: 'silent' }), 5_000, 5_000)
    })

    it('AC-601.10: E-ANALYZE-TIMEOUT은 그 문구("계산이 30초")를 보이지 않게 E-BIT-READ-FAILED로 바꾼다', async () => {
      const t = setup({}, (req) => ({ type: 'failed', streamId: req.streamId, code: 'E-ANALYZE-TIMEOUT' }))
      await expect(t.read()).resolves.toEqual({ kind: 'failed', code: 'E-BIT-READ-FAILED' })
      t.expectClosed()
    })
  })

  describe('AC-601.8 끝나면 닫는다', () => {
    it('AC-601.8: 성공해도 통로를 닫고 Worker를 끝낸다', async () => {
      const t = setup()
      await t.read()
      t.expectClosed()
    })

    it('AC-601.8: 끝나면 3분 재던 시계도 남지 않는다', async () => {
      vi.useFakeTimers()
      const t = setup({ 'stats.rows': error('E-STATS-HISTORY') })
      await t.read()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('AC-601.8: Worker를 못 만들면 확장에 붙지 않고 E-BIT-READ-FAILED로 끝난다', async () => {
      const connect = vi.fn()
      const createWorker = () => {
        throw new Error('가짜: Worker 스크립트를 못 불러옴')
      }
      await expect(readBitDays({ runtime: { connect }, createWorker, today: TODAY })).resolves.toEqual({
        kind: 'failed',
        code: 'E-BIT-READ-FAILED',
      })
      expect(connect).not.toHaveBeenCalled()
    })
  })
})

// ── admin-view: 비트 통로 차례(AC-8021.8). 앱이 쓰는 bitLane 하나를 시험이 저절로 올리기처럼 잡는다 — 시험마다 놓는다 ──
describe('readBitDays: 비트 통로 차례 (admin-view AC-8021.8)', () => {
  it('AC-8021.8: 쥔 쪽이 없으면 지금처럼 바로 읽고, 읽는 동안만 통로를 쥔다(그동안 저절로 올리기는 잡지 못함)', async () => {
    const t = setup({ 'stats.rows': 'silent' })
    const reading = t.read()
    await vi.waitFor(() => expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows']))
    expect(enterBackground(vi.fn())).toBeNull()
    for (const reply of chunkEnd(t.port.sent[2].id)) t.port.reply(reply)
    await expect(reading).resolves.toEqual({ kind: 'days', days: [DAY] })
    const release = enterBackground(vi.fn())
    expect(release).toEqual(expect.any(Function))
    release!()
  })

  it('AC-8021.8: 저절로 올리기가 쥐고 있으면 끊기를 알리고(stop 한 번) Worker·통로를 만들지 않고 기다렸다가, 놓인 뒤에 지금 차례대로 읽는다', async () => {
    const t = setup()
    const stop = vi.fn()
    const release = enterBackground(stop)!
    let answer: unknown = null
    void t.read().then((r) => (answer = r))
    await Promise.resolve()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(t.createWorker).not.toHaveBeenCalled()
    expect(t.commands()).toEqual([])

    release()
    await vi.waitFor(() => expect(answer).toEqual({ kind: 'days', days: [DAY] }))
    expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows'])
    expect(stop).toHaveBeenCalledTimes(1)
    t.expectClosed()
    const again = enterBackground(vi.fn())
    expect(again).toEqual(expect.any(Function))
    again!()
  })

  it('AC-8021.8: 기다리는 중에 화면을 떠나면 not-ready이고 놓여도 읽지 않으며 차례에서 빠진다', async () => {
    const t = setup()
    const release = enterBackground(vi.fn())!
    const leaving = new AbortController()
    const reading = t.read(undefined, leaving.signal)
    leaving.abort()
    await expect(reading).resolves.toEqual({ kind: 'not-ready' })
    release()
    await Promise.resolve()
    expect(t.createWorker).not.toHaveBeenCalled()
    expect(t.commands()).toEqual([])
    const again = enterBackground(vi.fn())
    expect(again).toEqual(expect.any(Function))
    again!()
  })

  it('AC-8021.8: 기다리는 시간도 읽기 전체 3분 안이다(놓이지 않으면 E-BIT-READ-FAILED, 차례에서 빠짐)', async () => {
    vi.useFakeTimers()
    const t = setup()
    const release = enterBackground(vi.fn())!
    let answer: unknown = null
    void t.read().then((r) => (answer = r))
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS)
    expect(answer).toEqual({ kind: 'failed', code: 'E-BIT-READ-FAILED' })
    expect(t.createWorker).not.toHaveBeenCalled()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.createWorker).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    const again = enterBackground(vi.fn())
    expect(again).toEqual(expect.any(Function))
    again!()
  })

  it('AC-8021.8: 실패해도(확장에 붙지 못함) 통로 차례에서 빠진다', async () => {
    const t = setup({ hello: error('E-BRIDGE-BAD-REPLY') })
    await t.read()
    const release = enterBackground(vi.fn())
    expect(release).toEqual(expect.any(Function))
    release!()
  })
})
