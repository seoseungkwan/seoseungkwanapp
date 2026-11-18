import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import type { Outcome } from '@/types/parse'
import type { CatalogCode, CheckSettings, ClaimMemosJson, ClaimMonth, ClaimView, DxLink, InputSelection, MemoRowRaw, MemoScreenView, MemoState, MemoStateOptions, PrecheckFromScreen, PrecheckToPort, PrecheckToScreen, StoreLoadJson, StoreMonthJson, Tables, Visit } from '@/types/precheck'
import { defaultPhrases, neutralPhrases, ourClinicPhrases, validatePhrases, type MemoCode, type Phrases } from '@/lib/precheck/memo'
import { checkMonth, loadMonth, loadStore, createPrecheckJobs, dxViews, memoViews, ruleList } from './jobs'
import { loadTables } from './tables'

// 검사 함수는 그대로 돌리고 몇 번 불렸는지만 본다(코드 사전을 사람마다 다시 검사하지 않는다)
vi.mock('@/lib/precheck/memo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/precheck/memo')>()
  return { ...actual, validatePhrases: vi.fn(actual.validatePhrases) }
})

// Worker가 부르는 일(REQ-009). 통로 포트로 온 조각을 모아(assemble) 한 번만 풀고(loadMonth) 점검용 모양을 만든다.
// 화면에는 숫자·달·오류 번호만 보낸다. 시험 자료는 저장소의 가짜 파일 fixtures/precheck/fake/*.json

const FAKE = (name: string) => readFileSync(fileURLToPath(new URL(`../../../fixtures/precheck/fake/${name}`, import.meta.url)), 'utf-8')
const OCT = FAKE('claim-month-rules-v1-v18.json')
const CROSS = FAKE('claim-month-cross-month.json')

/** 도우미 Chunker처럼 나눈 조각과 end */
function chunked(text: string, size: number) {
  const parts: string[] = []
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size))
  return {
    parts,
    end: { count: parts.length, bytes: Buffer.byteLength(text, 'utf8'), sha256: createHash('sha256').update(text, 'utf8').digest('hex') },
  }
}

function setup(load: () => Promise<Outcome<Tables>> = loadTables) {
  const posts: PrecheckToScreen[] = []
  const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables: load })
  return { posts, jobs }
}

type Jobs = ReturnType<typeof setup>['jobs']

/** 통로 포트에 한 요청의 조각을 차례를 섞어 넣고 end까지 보낸다 */
async function stream(jobs: Jobs, id: string, text: string, sha256?: string) {
  const { parts, end } = chunked(text, 4096)
  const order = parts.map((_, seq) => seq)
  if (order.length > 2) [order[0], order[2]] = [order[2], order[0]]
  for (const seq of order) await jobs.fromPort({ type: 'chunk', id, seq, data: parts[seq] })
  await jobs.fromPort({ type: 'end', id, ...end, sha256: sha256 ?? end.sha256 })
}

/** 화면의 메시지. 모양이 types/precheck.ts의 약속과 어긋나면 tsc가 잡는다 */
const loadStart = (jobs: Jobs, load: number) => jobs.fromScreen({ type: 'loadStart', load } satisfies PrecheckFromScreen)
const askMonth = (jobs: Jobs, id: string, load: number) => jobs.fromScreen({ type: 'month', id, load } satisfies PrecheckFromScreen)

/** 화면처럼 한 달을 끝까지 불러 둔다(loadStart → 조각·end → month) */
async function loadInto(jobs: Jobs, id: string, text: string, load: number) {
  await loadStart(jobs, load)
  await stream(jobs, id, text)
  await askMonth(jobs, id, load)
}

/** 화면으로 간 메시지에 환자 글자(이름·차트번호·증상)가 없다 */
function expectNoPatientText(posts: readonly PrecheckToScreen[]) {
  const text = JSON.stringify(posts)
  expect(text).not.toContain('가상환자')
  expect(text).not.toMatch(/9\d{5}/)
  expect(text).not.toContain('knee')
}

describe('AC-009.1 loadMonth: 다 모은 글자를 한 번만 JSON으로 풀어 점검용 모양으로', () => {
  it('AC-009.1: 가짜 한 달 자료 글자 → ClaimMonth', () => {
    const result = loadMonth(OCT)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.visits).toHaveLength(19)
    expect(result.value.period).toEqual({ from: '2026-10-01', to: '2026-10-07' })
  })

  it('AC-009.1: 통로 포트로 순서가 섞여 온 조각을 모아 풀고, 화면에는 진료 수·달만 보낸다', async () => {
    const { posts, jobs } = setup()
    await loadInto(jobs, 'm1', OCT, 1)
    expect(posts).toEqual([{ type: 'month', id: 'm1', load: 1, ok: true, visits: 19, months: ['2026-10'] }])
    expect(jobs.month()?.visits).toHaveLength(19)
    expectNoPatientText(posts)
  })

  it('AC-009.1: 화면의 요청이 end보다 먼저 와도 그 요청의 자료가 다 오면 답한다', async () => {
    const { posts, jobs } = setup()
    await loadStart(jobs, 1)
    const asked = askMonth(jobs, 'm1', 1)
    await stream(jobs, 'm1', OCT)
    await asked
    expect(posts).toEqual([{ type: 'month', id: 'm1', load: 1, ok: true, visits: 19, months: ['2026-10'] }])
  })
})

describe('AC-009.2 빠지거나 끊기면 버리고 E-CLAIM-PARTIAL을 화면에 알린다. 점검을 돌리지 않는다', () => {
  it.each([
    ['끝이 잘린 글자', OCT.slice(0, -40)],
    ['JSON이 아님', 'not json'],
    ['빈 글자', ''],
  ])('AC-009.2: loadMonth(%s) → E-CLAIM-PARTIAL', (_, text) => {
    expect(loadMonth(text)).toEqual({ ok: false, code: 'E-CLAIM-PARTIAL' })
  })

  it('AC-009.2: abort(도우미 error·연결 끊김)가 오면 화면에 E-CLAIM-PARTIAL을 알리고, 그 요청은 모양을 만들지 않는다', async () => {
    const { posts, jobs } = setup()
    const { parts } = chunked(OCT, 4096)
    await loadStart(jobs, 1)
    await jobs.fromPort({ type: 'chunk', id: 'm1', seq: 0, data: parts[0] })
    await jobs.fromPort({ type: 'abort', id: 'm1', code: 'E-BIT-READ-FAILED' })
    await askMonth(jobs, 'm1', 1)
    expect(posts).toEqual([
      { type: 'partial', id: 'm1', code: 'E-CLAIM-PARTIAL' },
      { type: 'month', id: 'm1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
    ])
    expect(jobs.month()).toBeNull()
  })

  // 두 month가 같은 번호다: 달을 비우는 것은 loadStart가 아니라 마지막 불러오기의 실패한 month다
  it('AC-009.2: SHA-256이 다르면 화면에 E-CLAIM-PARTIAL을 알리고, 전에 불러온 달도 버린다(반쪽 자료로 점검하지 않는다)', async () => {
    const { posts, jobs } = setup()
    await loadInto(jobs, 'm1', OCT, 1)
    expect(jobs.month()).not.toBeNull()
    await stream(jobs, 'm2', OCT, createHash('sha256').update('다른 글자').digest('hex'))
    await askMonth(jobs, 'm2', 1)
    expect(posts.slice(1)).toEqual([
      { type: 'partial', id: 'm2', code: 'E-CLAIM-PARTIAL' },
      { type: 'month', id: 'm2', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
    ])
    expect(jobs.month()).toBeNull()
    expectNoPatientText(posts)
  })

  // 통로는 claim.memos·store.load·sam.latest·bit.input의 실패도 같은 abort로 보낸다(lib/bridge/client.ts fail). Worker는 어느 명령의 id인지 모른다.
  // 그래서 포트로 온 실패는 그 id의 조각만 버린다(AC-013.2: memos 실패에도 점검을 계속한다). 불러 둔 달은 화면의 loadStart·month로만 바뀐다
  const FAIL_M2: [string, (jobs: Jobs) => Promise<void>][] = [
    [
      'abort',
      async (jobs) => {
        await jobs.fromPort({ type: 'chunk', id: 'm2', seq: 0, data: 'x' })
        await jobs.fromPort({ type: 'abort', id: 'm2', code: 'E-HELPER-UNKNOWN-COMMAND' })
      },
    ],
    ['SHA-256이 다른 end', (jobs) => stream(jobs, 'm2', OCT, createHash('sha256').update('다른 글자').digest('hex'))],
  ]

  it.each(FAIL_M2)('AC-009.2: 달을 불러 둔 뒤 다른 요청의 %s는 그 id의 partial만 보내고 달은 그대로 둔다', async (_, fail) => {
    const { posts, jobs } = setup()
    await loadInto(jobs, 'm1', OCT, 1)
    const before = jobs.month()
    expect(before?.visits).toHaveLength(19)
    await fail(jobs)
    expect(posts.slice(1)).toEqual([{ type: 'partial', id: 'm2', code: 'E-CLAIM-PARTIAL' }])
    expect(jobs.month()).toBe(before)
  })

  it.each(FAIL_M2)('AC-009.2: loadStart 뒤 새 불러오기의 %s가 오면 전에 불러온 달은 남지 않는다', async (_, fail) => {
    const { posts, jobs } = setup()
    await loadInto(jobs, 'm1', OCT, 1)
    await loadStart(jobs, 2)
    await fail(jobs)
    expect(posts.slice(1)).toEqual([{ type: 'partial', id: 'm2', code: 'E-CLAIM-PARTIAL' }])
    expect(jobs.month()).toBeNull()
  })

  // 통로가 문에서 거절하면(끊긴 상태의 stream, lib/bridge/client.ts request) abort도 오지 않는다. 실패한 새 불러오기가 옛 달을 남기지 않게 loadStart가 먼저 비운다
  it('AC-009.2: loadStart만 와도 전에 불러온 달을 버리고, 화면에 답하지 않으며, 다음 불러오기를 막지 않는다', async () => {
    const { posts, jobs } = setup()
    await loadInto(jobs, 'm1', OCT, 1)
    expect(jobs.month()).not.toBeNull()
    await loadStart(jobs, 2)
    expect(jobs.month()).toBeNull()
    expect(posts).toHaveLength(1)
    await loadInto(jobs, 'm2', CROSS, 3)
    expect(jobs.month()?.visits).toHaveLength(4)
  })

  // 화면은 새 요청의 id를 stream이 끝나야 안다(lib/bridge/client.ts request). 그래서 옛 불러오기를 가리는 것은 id가 아니라 번호(load)다.
  // 마지막 loadStart의 번호가 아닌 month는 달을 넣지도 지우지도 않고 ok:false로 답한다. 아래에서 A는 load 1(19건), B는 load 2(4건)
  describe('옛 불러오기의 month', () => {
    const REPLACED_A = { type: 'month', id: 'a', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' }
    const OK_B = { type: 'month', id: 'b', load: 2, ok: true, visits: 4, months: ['2026-10', '2026-11'] }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('AC-009.2: 늦은 A: B가 끝나기 전에 month A가 와도 A를 쓰지 않고, B가 거절돼도 A가 남지 않는다', async () => {
      const { posts, jobs } = setup()
      await loadStart(jobs, 1)
      await loadStart(jobs, 2)
      await stream(jobs, 'a', OCT)
      await askMonth(jobs, 'a', 1)
      expect(jobs.month()).toBeNull()
      await jobs.fromPort({ type: 'abort', id: 'b', code: 'E-BIT-READ-FAILED' })
      expect(jobs.month()).toBeNull()
      expect(posts).toEqual([REPLACED_A, { type: 'partial', id: 'b', code: 'E-CLAIM-PARTIAL' }])
    })

    it('AC-009.2: 뒤바뀐 차례: month B 뒤에 month A가 와도 B가 남는다', async () => {
      const { posts, jobs } = setup()
      await loadStart(jobs, 1)
      await loadStart(jobs, 2)
      await stream(jobs, 'b', CROSS)
      await askMonth(jobs, 'b', 2)
      const newest = jobs.month()
      expect(newest?.visits).toHaveLength(4)
      await stream(jobs, 'a', OCT)
      await askMonth(jobs, 'a', 1)
      expect(jobs.month()).toBe(newest)
      expect(posts).toEqual([OK_B, REPLACED_A])
    })

    it('AC-009.2: 뒤바뀐 차례: A를 먼저 물어도 A의 SHA-256 계산이 B보다 늦게 끝나면 B가 남는다', async () => {
      const real = crypto.subtle.digest.bind(crypto.subtle)
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
        await held
        return real(algorithm, data)
      })
      const { posts, jobs } = setup()
      await loadStart(jobs, 1)
      await loadStart(jobs, 2)
      const sentA = stream(jobs, 'a', OCT)
      const askedA = askMonth(jobs, 'a', 1)
      await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(1))
      await stream(jobs, 'b', CROSS)
      await askMonth(jobs, 'b', 2)
      const newest = jobs.month()
      expect(newest?.visits).toHaveLength(4)
      expect(posts).toEqual([OK_B]) // A는 아직 계산 중이다
      release()
      await Promise.all([sentA, askedA])
      expect(jobs.month()).toBe(newest)
      expect(posts).toEqual([OK_B, REPLACED_A])
    })

    it.each(FAIL_M2)('AC-009.2: 늦은 실패: B가 ok로 끝난 뒤 옛 불러오기의 %s와 그 month가 와도 B를 지우지 않는다', async (_, fail) => {
      const { posts, jobs } = setup()
      await loadStart(jobs, 1)
      await loadStart(jobs, 2)
      await stream(jobs, 'b', CROSS)
      await askMonth(jobs, 'b', 2)
      const newest = jobs.month()
      expect(newest?.visits).toHaveLength(4)
      await fail(jobs)
      await askMonth(jobs, 'm2', 1)
      expect(jobs.month()).toBe(newest)
      expect(posts).toEqual([
        OK_B,
        { type: 'partial', id: 'm2', code: 'E-CLAIM-PARTIAL' },
        { type: 'month', id: 'm2', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
      ])
    })

    it('AC-009.2: month A를 기다리는 동안 loadStart B가 오면 그 달을 쓰지 않고 실패로 답한다', async () => {
      const { posts, jobs } = setup()
      await loadStart(jobs, 1)
      const asked = askMonth(jobs, 'a', 1)
      await loadStart(jobs, 2)
      await stream(jobs, 'a', OCT)
      await asked
      expect(jobs.month()).toBeNull()
      expect(posts).toEqual([REPLACED_A])
    })

    it('AC-009.2: month A를 기다리는 동안 B를 다 불러와도 A가 늦게 끝나 B를 덮거나 지우지 않는다', async () => {
      const { posts, jobs } = setup()
      await loadStart(jobs, 1)
      const asked = askMonth(jobs, 'a', 1)
      await loadInto(jobs, 'b', CROSS, 2)
      const newest = jobs.month()
      expect(newest?.visits).toHaveLength(4)
      await stream(jobs, 'a', OCT)
      await asked
      expect(jobs.month()).toBe(newest)
      expect(posts).toEqual([OK_B, REPLACED_A])
    })

    // 0도 넣는다: 시작값이 번호 하나와 같으면 loadStart 없이 그 번호의 month가 통과한다
    it.each([0, 1])('AC-009.2: loadStart가 하나도 오기 전의 month(load %i)는 쓰지 않고 실패로 답한다. 뒤에 loadStart가 와도 되살아나지 않는다', async (load) => {
      const { posts, jobs } = setup()
      await stream(jobs, 'a', OCT)
      await askMonth(jobs, 'a', load)
      expect(jobs.month()).toBeNull()
      expect(posts).toEqual([{ ...REPLACED_A, load }])
      await loadStart(jobs, load)
      expect(jobs.month()).toBeNull()
      expect(posts).toHaveLength(1)
    })

    it('AC-009.2: 달을 불러 둔 뒤 month B가 제 loadStart보다 먼저 닿으면 달을 넣지도 지우지도 않고 실패로 답한다. 그 loadStart가 오면 비운다', async () => {
      const { posts, jobs } = setup()
      await loadInto(jobs, 'a', OCT, 1)
      const before = jobs.month()
      expect(before?.visits).toHaveLength(19)
      await stream(jobs, 'b', CROSS)
      await askMonth(jobs, 'b', 2)
      expect(jobs.month()).toBe(before)
      expect(posts.slice(1)).toEqual([{ type: 'month', id: 'b', load: 2, ok: false, code: 'E-CLAIM-PARTIAL' }])
      await loadStart(jobs, 2)
      expect(jobs.month()).toBeNull()
    })

    it('AC-009.2: 번호는 take가 끝난 뒤에 본다: month를 기다리는 동안 제 번호의 loadStart가 닿으면 그 달을 쓴다', async () => {
      const { posts, jobs } = setup()
      const asked = askMonth(jobs, 'a', 1)
      await loadStart(jobs, 1)
      await stream(jobs, 'a', OCT)
      await asked
      expect(jobs.month()?.visits).toHaveLength(19)
      expect(posts).toEqual([{ type: 'month', id: 'a', load: 1, ok: true, visits: 19, months: ['2026-10'] }])
    })
  })

  it('AC-009.2: 번호가 틀린 month는 답하지 않고 받지 않는다. 번호가 틀린 loadStart는 옛 달을 버리고 바른 loadStart까지 어떤 month도 쓰지 않는다', async () => {
    const { posts, jobs } = setup()
    await loadInto(jobs, 'a', OCT, 1)
    const before = jobs.month()
    await stream(jobs, 'b', CROSS)
    for (const load of [undefined, null, '1', 1.5, NaN]) await jobs.fromScreen({ type: 'month', id: 'b', load })
    expect(jobs.month()).toBe(before)
    expect(posts).toHaveLength(1)

    await jobs.fromScreen({ type: 'loadStart' })
    expect(jobs.month()).toBeNull()
    await jobs.fromScreen({ type: 'month', id: 'b' }) // 없는 번호끼리 같다고 보면 안 된다
    expect(jobs.month()).toBeNull()
    expect(posts).toHaveLength(1)
    await askMonth(jobs, 'b', 1)
    expect(jobs.month()).toBeNull()
    expect(posts.slice(1)).toEqual([{ type: 'month', id: 'b', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
  })

  it('AC-009.2: 포트로 온 모르는 메시지·모양이 틀린 메시지는 받지 않는다(화면으로 아무것도 보내지 않는다)', async () => {
    const { posts, jobs } = setup()
    for (const m of [null, 'chunk', { type: 'chunk', id: 1, seq: 0, data: 'x' }, { type: 'sent', ticket: 1, ok: true }, { type: 'what' }]) {
      await jobs.fromPort(m)
    }
    await jobs.fromScreen({ type: 'nope' })
    expect(posts).toEqual([])
  })
})

// ── 진짜 precheck.worker 입구를 가짜 Worker 안에서(포트는 진짜 MessageChannel) ───────────────

type WorkerScope = { onmessage: ((event: MessageEvent) => void) | null; postMessage(message: PrecheckToScreen): void }

async function loadWorkerEntry() {
  const posted: PrecheckToScreen[] = []
  const scope: WorkerScope = { onmessage: null, postMessage: (message) => posted.push(message) }
  vi.stubGlobal('self', scope)
  vi.resetModules()
  await import('../precheck.worker')
  if (scope.onmessage === null) throw new Error('precheck.worker가 onmessage를 걸지 않았다')
  const receive = scope.onmessage
  /** 화면이 통로를 새로 만들 때 보내는 {type: 'bridge-port'} (lib/bridge/workerSink) */
  const givePort = () => {
    const channel = new MessageChannel()
    receive({ data: { type: 'bridge-port' }, ports: [channel.port2] } as unknown as MessageEvent)
    return channel.port1
  }
  return { posted, givePort, receive: (data: unknown) => receive({ data, ports: [] } as unknown as MessageEvent) }
}

describe('AC-009.2 precheck.worker: 통로 포트를 바꿔도 먼저 보낸 abort를 잃지 않는다', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 화면이 다시 붙으면 옛 연결 닫기(bridge.close → sink.abort → port.close)와 새 bridge-port가 한 번에 일어난다.
  // abort를 받기 전에 Worker가 옛 포트를 닫으면 abort가 사라져 조각이 Worker 메모리에 남고, take도 답을 못 받는다
  it('AC-009.2: abort 직후 새 포트가 와도 abort가 도착해 화면에 E-CLAIM-PARTIAL을 알리고, 새 포트도 듣는다', async () => {
    const { posted, givePort } = await loadWorkerEntry()
    const oldPort = givePort()
    oldPort.postMessage({ type: 'chunk', id: 'm1', seq: 0, data: 'x' })
    oldPort.postMessage({ type: 'abort', id: 'm1', code: 'E-BRIDGE-DISCONNECTED' })
    oldPort.close()
    const newPort = givePort()
    await vi.waitFor(() => expect(posted).toEqual([{ type: 'partial', id: 'm1', code: 'E-CLAIM-PARTIAL' }]))

    newPort.postMessage({ type: 'abort', id: 'm2', code: 'E-BRIDGE-DISCONNECTED' })
    await vi.waitFor(() => expect(posted).toHaveLength(2))
    expect(posted[1]).toEqual({ type: 'partial', id: 'm2', code: 'E-CLAIM-PARTIAL' })
    newPort.close()
  })
})

// ── 점검(TASK-13): 화면이 check로 시키고 Worker가 보기 모양을 보낸다. 가짜 자료만 쓴다 ──────────

describe('AC-013 점검 메시지 check·excel', { timeout: 30_000 }, () => {
  const MEMO_MONTH = FAKE('claim-month-memo.json')
  const OCTOBER = { from: '2026-10-01', to: '2026-10-31' }
  /** m68(900079): 10/24 진료. 10/20에 급여 KK090이 있어 그 날이 고른 기간 밖이어도 간격 문장이 나와야 한다. m69(900080): 10/20 진료, 고른 기간 밖이라 빠진다 */
  const ONE_DAY = { from: '2026-10-24', to: '2026-10-24' }
  const SETTINGS: CheckSettings = { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: ourClinicPhrases(), dxLinks: [] }
  /** 표 모양이 틀린 연결표. readDxLinks가 TypeError를 던진다 */
  const BROKEN = { ...SETTINGS, dxLinks: [{ not: 'a row' }] } as unknown as CheckSettings

  type CheckAnswer = Extract<PrecheckToScreen, { type: 'check' }>
  type ExcelAnswer = Extract<PrecheckToScreen, { type: 'excel' }>
  const askCheck = (jobs: Jobs, over: Partial<Extract<PrecheckFromScreen, { type: 'check' }>> = {}) =>
    jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: OCTOBER, settings: SETTINGS, ...over } satisfies PrecheckFromScreen)
  const answerOf = (posts: readonly PrecheckToScreen[]) => {
    const found = posts.filter((m): m is CheckAnswer => m.type === 'check')
    expect(found).toHaveLength(1)
    return found[0]
  }
  const viewOf = (answer: CheckAnswer): ClaimView => {
    if (!answer.ok) throw new Error(answer.code)
    return answer.view
  }
  async function loaded(text = MEMO_MONTH, load = 1) {
    const sent: unknown[] = []
    const posts: PrecheckToScreen[] = []
    const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables, toPort: (m) => sent.push(m) })
    await loadInto(jobs, 'month', text, load)
    posts.length = 0
    return { jobs, posts, sent }
  }
  let storeCalls = 0
  const giveStore = async (jobs: Jobs, json: unknown, load = 1) => {
    const id = `store${++storeCalls}`
    await stream(jobs, id, JSON.stringify(json))
    await jobs.fromScreen({ type: 'loadPart', part: 'store', id, load } satisfies PrecheckFromScreen)
  }
  /** 도우미 store.load 답: 달과 설정 사본 */
  const storeWith = (settings: unknown) => ({ months: { '2026-10': { drafts: {}, done: {}, journal: {} } }, settings })

  describe('AC-013.14 점검 답에 규칙 결과와 추천 상병·상병 확인이 실린다', () => {
    it('AC-013.14: 진료마다 추천·경고가 있고 규칙 결과와 함께 온다', async () => {
      const { jobs, posts } = await loaded(FAKE('claim-month-dx-check.json'))
      await askCheck(jobs)
      const answer = answerOf(posts)
      expect(answer).toMatchObject({ type: 'check', check: 1, load: 1, ok: true, usedCopy: null })
      const view = viewOf(answer)
      const d01 = view.visits.find((v) => v.key === 'd01')!
      expect(d01.dx.issues.map((x) => x.code)).toEqual(['A49'])
      expect(d01.dx.needsCheck).toBe(true)
      expect(d01.dx.recommendations.find((r) => r.code === 'A49')?.list.map((r) => r.dx).slice(0, 2)).toEqual(['M17', 'M750'])
      expect(d01.rx.length).toBeGreaterThan(0)
      expect(d01.dxNow.every((line) => typeof line.c === 'string')).toBe(true)
      expect(view.visits.find((v) => v.key === 'd16')!.dx.missingDx).toBe(true)
      expect(view.hasDx).toBe(true)
    })

    it('AC-013.14: 상병 연결표가 점검 답에 섞인다', async () => {
      const { jobs, posts } = await loaded(FAKE('claim-month-dx-check.json'))
      await askCheck(jobs, { settings: { ...SETTINGS, dxLinks: [['G6604', 'S6350', '연결 이름', 0, 't']] } })
      const d08 = viewOf(answerOf(posts)).visits.find((v) => v.key === 'd08')!
      expect(d08.dx.issues.map((x) => [x.code, x.gosi])).toEqual([['G6604', false]])
    })

    it('AC-013.14·AC-014.13: 상병 없음·메모 있음·비급여뿐인 진료는 점검 답에서 missingDx가 참이다(메모 결과를 넘긴다)', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs)
      const view = viewOf(answerOf(posts))
      expect(view.visits.find((v) => v.key === 'm33')!.dx.missingDx).toBe(true)
      expect(view.visits.find((v) => v.key === 'm35')!.dx.missingDx).toBe(false)
      expect(view.visits.find((v) => v.key === 'm33')!.memo?.hasMemo).toBe(true)
    })

    it('AC-013.14: I·N 표 경고는 규칙 DX-01 결과로 한 번만 나온다(상병 확인에 또 나오지 않는다)', async () => {
      const { jobs, posts } = await loaded(FAKE('claim-month-rules-branches.json'))
      await askCheck(jobs)
      const hit = viewOf(answerOf(posts)).visits.find((v) => v.key === 'DX-01.hit')!
      expect(hit.findings.filter((f) => f.ruleId === 'DX-01')).toHaveLength(1)
      expect(hit.dx.issues).toEqual([])
      expect(hit.dx.needsCheck).toBe(false)
    })

    it('AC-013.14: 틀린 연결표는 점검 결과 없이 ok:false·E-SETTINGS-FAILED다', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs, { settings: BROKEN })
      expect(answerOf(posts)).toEqual({ type: 'check', check: 1, load: 1, ok: false, code: 'E-SETTINGS-FAILED' })
      expectNoPatientText(posts)
    })
  })

  describe('AC-013.13 고른 기간만 보인다', () => {
    it('AC-013.13: 고른 날의 진료만 싣고 앞 내원은 간격 문장에만 쓴다', async () => {
      const whole = await loaded()
      await askCheck(whole.jobs)
      const wholeView = viewOf(answerOf(whole.posts))
      expect(wholeView.visits.some((v) => v.key === 'm69')).toBe(true)

      const day = await loaded()
      await askCheck(day.jobs, { visible: ONE_DAY })
      const view = viewOf(answerOf(day.posts))
      expect(view.period).toEqual(ONE_DAY)
      expect(view.visits.every((v) => v.date === ONE_DAY.from)).toBe(true)
      expect(view.visits.map((v) => v.key)).toContain('m68')
      expect(view.visits.map((v) => v.key)).not.toContain('m69')
      const itv = ourClinicPhrases().TPL.itv as string
      const memo = view.visits.find((v) => v.key === 'm68')!.memo!
      expect(memo.text).toContain(itv)
      expect(memo.text).toBe(wholeView.visits.find((v) => v.key === 'm68')!.memo!.text)
    })

    it('AC-013.13: 합계·규칙 묶음도 고른 기간만 센다', async () => {
      const day = await loaded()
      await askCheck(day.jobs, { visible: ONE_DAY })
      const view = viewOf(answerOf(day.posts))
      const keys = new Set(view.visits.map((v) => v.key))
      const findings = view.visits.flatMap((v) => v.findings)
      expect(view.totals.hi).toBe(findings.filter((f) => f.grade === '확인필요').length)
      expect(view.totals.mid).toBe(findings.filter((f) => f.grade === '알림').length)
      expect(view.totals.lo).toBe(findings.filter((f) => f.grade === '참고').length)
      expect(view.totals.patients).toBe(view.visits.filter((v) => v.findings.some((f) => f.grade === '확인필요')).length)
      expect(view.totals.checked).toBe(view.visits.filter((v) => v.checked > 0).length)
      for (const group of view.groups) {
        expect(group.visitKeys.length).toBeGreaterThan(0)
        for (const key of group.visitKeys) expect(keys.has(key)).toBe(true)
      }
    })

    it('AC-013.13: 규칙 묶음은 원본처럼 등급 차례, 같은 등급이면 건수 많은 차례다', async () => {
      const whole = await loaded(OCT)
      await askCheck(whole.jobs)
      const groups = viewOf(answerOf(whole.posts)).groups
      const rank = { 확인필요: 0, 알림: 1, 참고: 2 }
      for (let i = 1; i < groups.length; i++) {
        const [a, b] = [groups[i - 1], groups[i]]
        expect(rank[a.grade] < rank[b.grade] || (rank[a.grade] === rank[b.grade] && a.visitKeys.length >= b.visitKeys.length)).toBe(true)
      }
    })

    it('AC-013.3: 켜진 규칙 수를 싣는다(끈 규칙은 빠진다)', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs, { settings: { ...SETTINGS, rules: { schema: 1, off: ['IJ-05'], on: [], grade: [] } } })
      const tables = await loadTables()
      if (!tables.ok) throw new Error(tables.code)
      const on = tables.value.rules.rules.filter((rule) => rule.enabled_default !== false && rule.id !== 'IJ-05').length
      expect(viewOf(answerOf(posts)).enabledRules).toBe(on)
    })
  })

  describe('AC-013.5 점검할 수 없으면 번호만 답한다', () => {
    it('AC-013.5: 불러온 달이 없으면 E-CLAIM-PARTIAL', async () => {
      const { jobs, posts } = setup()
      await askCheck(jobs)
      expect(answerOf(posts)).toEqual({ type: 'check', check: 1, load: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-013.10: 마지막 불러오기가 아닌 번호의 점검은 하지 않는다', async () => {
      const { jobs, posts } = await loaded(MEMO_MONTH, 2)
      await askCheck(jobs, { load: 1 })
      expect(answerOf(posts)).toEqual({ type: 'check', check: 1, load: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-013.5: 규칙표를 못 부르면 E-RULES-LOAD-FAILED', async () => {
      const posts: PrecheckToScreen[] = []
      const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables: async () => ({ ok: false, code: 'E-RULES-LOAD-FAILED' }) })
      await loadInto(jobs, 'month', MEMO_MONTH, 1)
      posts.length = 0
      await askCheck(jobs)
      expect(answerOf(posts)).toEqual({ type: 'check', check: 1, load: 1, ok: false, code: 'E-RULES-LOAD-FAILED' })
    })

    it('AC-013.5: 약속 밖의 모양에는 답하지 않는다', async () => {
      const { jobs, posts } = await loaded()
      await jobs.fromScreen({ type: 'check', check: 'x', load: 1, visible: OCTOBER, settings: SETTINGS })
      await jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: { from: 'x', to: 'y' }, settings: SETTINGS })
      expect(posts).toEqual([])
    })

    it('AC-013.5: 모양이 틀린 설정은 E-SETTINGS-FAILED다', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs, { settings: { rules: 'x' } as unknown as CheckSettings })
      expect(answerOf(posts)).toMatchObject({ ok: false, code: 'E-SETTINGS-FAILED' })
    })

    it('AC-013.5: 엔진이 뜻밖에 던져도 원래 글 없이 번호로 답한다(화면이 기다리다 멈추지 않게)', async () => {
      const posts: PrecheckToScreen[] = []
      const tables = await loadTables()
      if (!tables.ok) throw new Error(tables.code)
      const broken = { ...tables.value, rules: { ...tables.value.rules, rules: null } } as unknown as Tables
      const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables: async () => ({ ok: true, value: broken }) })
      await loadInto(jobs, 'month', MEMO_MONTH, 1)
      posts.length = 0
      await askCheck(jobs)
      expect(answerOf(posts)).toEqual({ type: 'check', check: 1, load: 1, ok: false, code: 'E-RULES-LOAD-FAILED' })
    })
  })

  describe('AC-013.9 설정 사본', () => {
    it('AC-013.9: 서버 설정을 받아 점검하면 사본을 store.save로 저장한다(화면을 지나지 않고 통로 포트로)', async () => {
      const { jobs, posts, sent } = await loaded()
      await askCheck(jobs)
      expect(answerOf(posts)).toMatchObject({ ok: true, usedCopy: null })
      expect(sent).toEqual([{ type: 'send', ticket: expect.any(Number), cmd: 'store.save', payload: JSON.stringify({ settings: SETTINGS }) }])
    })

    it('AC-013.9: 틀린 연결표는 사본을 덮어쓰지 않는다', async () => {
      const { jobs, sent } = await loaded()
      await askCheck(jobs, { settings: BROKEN })
      expect(sent).toEqual([])
    })

    it('AC-013.9: 서버를 못 읽으면(settings: null) 도우미 사본으로 점검하고 어떤 사본을 썼는지 답한다. 다시 저장하지 않는다', async () => {
      const { jobs, posts, sent } = await loaded()
      await giveStore(jobs, storeWith(SETTINGS))
      posts.length = 0
      await askCheck(jobs, { settings: null })
      const answer = answerOf(posts)
      expect(answer).toMatchObject({ ok: true, usedCopy: JSON.parse(JSON.stringify(SETTINGS)) })
      expect(viewOf(answer).visits.length).toBeGreaterThan(0)
      expect(sent).toEqual([])
    })

    it.each([
      ['사본 null', storeWith(null)],
      ['사본 칸 없음', { months: {} }],
      ['모양이 틀린 사본', storeWith({ rules: 3 })],
    ])('AC-013.9: 서버를 못 읽고 %s이면 점검하지 않고 E-SETTINGS-FAILED', async (_name, json) => {
      const { jobs, posts } = await loaded()
      await giveStore(jobs, json)
      expect(posts.filter((m) => m.type === 'loadPart').at(-1)).toMatchObject({ ok: true })
      posts.length = 0
      await askCheck(jobs, { settings: null })
      expect(answerOf(posts)).toEqual({ type: 'check', check: 1, load: 1, ok: false, code: 'E-SETTINGS-FAILED' })
    })

    it('AC-013.2·AC-013.9: Phase 3 전(store.load를 부르지 못함)에도 사본이 없어 E-SETTINGS-FAILED다', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs, { settings: null })
      expect(answerOf(posts)).toMatchObject({ ok: false, code: 'E-SETTINGS-FAILED' })
    })

    it('AC-013.9: 저장이 됐다는 답을 받은 사본만 다음 점검에 쓴다', async () => {
      const { jobs, posts, sent } = await loaded()
      await askCheck(jobs)
      const { ticket } = sent[0] as { ticket: number }
      posts.length = 0
      await askCheck(jobs, { check: 2, settings: null })
      expect(answerOf(posts)).toMatchObject({ ok: false, code: 'E-SETTINGS-FAILED' })

      await jobs.fromPort({ type: 'sent', ticket, ok: true })
      posts.length = 0
      await askCheck(jobs, { check: 3, settings: null })
      expect(answerOf(posts)).toMatchObject({ ok: true })
    })

    it('AC-013.9: 저장이 실패하면(Phase 3 전 E-HELPER-UNKNOWN-COMMAND 포함) 사본으로 치지 않는다', async () => {
      const { jobs, posts, sent } = await loaded()
      await askCheck(jobs)
      const { ticket } = sent[0] as { ticket: number }
      await jobs.fromPort({ type: 'sent', ticket, ok: false, code: 'E-HELPER-UNKNOWN-COMMAND' })
      posts.length = 0
      await askCheck(jobs, { check: 2, settings: null })
      expect(answerOf(posts)).toMatchObject({ ok: false, code: 'E-SETTINGS-FAILED' })
    })

    it('AC-013.9: 모르는 표의 sent는 무시한다', async () => {
      const { jobs, posts } = await loaded()
      await jobs.fromPort({ type: 'sent', ticket: 99, ok: true })
      expect(posts).toEqual([])
    })

    it('AC-013.9: 새 불러오기는 사본을 다시 읽는다. 그 불러오기에서 못 읽으면(다른 병원 파일로 거절되면 답이 없다) 옛 사본을 쓰지 않는다', async () => {
      const { jobs, posts } = await loaded()
      await giveStore(jobs, storeWith(SETTINGS))
      await loadInto(jobs, 'month2', MEMO_MONTH, 2)
      posts.length = 0
      await askCheck(jobs, { load: 2, settings: null })
      expect(answerOf(posts)).toEqual({ type: 'check', check: 1, load: 2, ok: false, code: 'E-SETTINGS-FAILED' })
    })

    it('AC-013.9: 다른 병원의 settings.dat라 저장이 거절되면(E-BIT-HOSPITAL-MISMATCH) 사본으로 치지 않고 점검은 그대로다', async () => {
      const { jobs, posts, sent } = await loaded()
      await askCheck(jobs)
      expect(answerOf(posts)).toMatchObject({ ok: true })
      const { ticket } = sent[0] as { ticket: number }
      await jobs.fromPort({ type: 'sent', ticket, ok: false, code: 'E-BIT-HOSPITAL-MISMATCH' })
      posts.length = 0
      await askCheck(jobs, { check: 2, settings: null })
      expect(answerOf(posts)).toMatchObject({ ok: false, code: 'E-SETTINGS-FAILED' })
    })

    it('AC-013.9: store.save 한 호출에 달 칸과 설정이 함께 없다(글에는 settings 칸 하나뿐이다)', async () => {
      const { jobs, sent } = await loaded()
      await giveStore(jobs, { months: { '2026-10': { drafts: { m05: '◈직접 고친 글(가상)' }, done: {}, journal: {} } } })
      await askCheck(jobs)
      expect(sent).toHaveLength(1)
      const payload = JSON.parse((sent[0] as { payload: string }).payload) as Record<string, unknown>
      expect(Object.keys(payload)).toEqual(['settings'])
      expect((sent[0] as { payload: string }).payload).not.toContain('가상')
    })

    it('AC-013.9: 달만 물은 답은 사본을 건드리지 않고 사본만 물은 답은 고친 메모를 지우지 않는다(두 호출로 나뉜다)', async () => {
      const draft = { months: { '2026-10': { drafts: { m05: '◈직접 고친 글(가상)' }, done: {}, journal: {} } } }
      const { jobs, posts } = await loaded()
      await giveStore(jobs, draft)
      await giveStore(jobs, { settings: SETTINGS })
      posts.length = 0
      await askCheck(jobs, { settings: null })
      expect(viewOf(answerOf(posts)).visits.find((v) => v.key === 'm05')!.memo).toMatchObject({ text: '◈직접 고친 글(가상)', edited: true })

      const reversed = await loaded()
      await giveStore(reversed.jobs, { settings: SETTINGS })
      await giveStore(reversed.jobs, draft)
      reversed.posts.length = 0
      await askCheck(reversed.jobs, { settings: null })
      expect(viewOf(answerOf(reversed.posts)).visits.find((v) => v.key === 'm05')!.memo).toMatchObject({ edited: true })
    })
  })

  describe('AC-013.4 엑셀은 Worker가 만든다', () => {
    const askExcel = (jobs: Jobs, check = 1) => jobs.fromScreen({ type: 'excel', check } satisfies PrecheckFromScreen)
    const excelOf = (posts: readonly PrecheckToScreen[]) => posts.filter((m): m is ExcelAnswer => m.type === 'excel').at(-1)

    it('AC-013.4: 마지막 점검 결과로 두 시트 xlsx 바이트와 날짜뿐인 파일 이름을 답한다', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs)
      await askExcel(jobs)
      const answer = excelOf(posts)!
      if (!answer.ok) throw new Error(answer.code)
      expect(answer.fileName).toBe('사전점검_2026-10-01_2026-10-31.xlsx')
      expect(XLSX.read(answer.bytes, { type: 'array' }).SheetNames).toEqual(['규칙별', '내원별'])
    })

    it('AC-013.13: 엑셀에 고른 기간 밖 진료가 없다', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs, { visible: { from: '2026-10-12', to: '2026-10-12' } })
      await askExcel(jobs)
      const answer = excelOf(posts)!
      if (!answer.ok) throw new Error(answer.code)
      const book = XLSX.read(answer.bytes, { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets['내원별'], { header: 1 }).slice(1)
      expect(rows.length).toBeGreaterThan(0)
      expect(new Set(rows.map((row) => row[0]))).toEqual(new Set(['2026-10-12']))
    })

    it.each([
      ['점검 전', async () => {}],
      ['점검이 실패한 뒤', async (jobs: Jobs) => askCheck(jobs, { settings: BROKEN })],
    ])('AC-013.4: %s에는 만들지 않고 번호로 답한다', async (_name, before) => {
      const { jobs, posts } = await loaded()
      await before(jobs)
      await askExcel(jobs)
      expect(excelOf(posts)).toEqual({ type: 'excel', check: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-013.4: 번호가 다른 점검의 엑셀은 만들지 않는다', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs)
      await askExcel(jobs, 9)
      expect(excelOf(posts)).toEqual({ type: 'excel', check: 9, ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-013.4: 새 불러오기를 시작하면 점검 결과를 버린다', async () => {
      const { jobs, posts } = await loaded()
      await askCheck(jobs)
      await loadStart(jobs, 2)
      await askExcel(jobs)
      expect(excelOf(posts)).toMatchObject({ ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-013.4: 약속 밖의 모양에는 답하지 않는다', async () => {
      const { jobs, posts } = await loaded()
      await jobs.fromScreen({ type: 'excel', check: 'x' })
      expect(posts).toEqual([])
    })
  })

  describe('precheck.worker 입구', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('AC-013.9: 사본 저장은 마지막 통로 포트로 나간다(화면 메시지가 아니다)', async () => {
      const { posted, givePort, receive } = await loadWorkerEntry()
      const oldPort = givePort()
      const newPort = givePort()
      const onOld = vi.fn()
      const heard: unknown[] = []
      oldPort.onmessage = onOld
      newPort.onmessage = (event) => heard.push(event.data)
      receive({ type: 'loadStart', load: 1 })
      const { parts, end } = chunked(MEMO_MONTH, 4096)
      parts.forEach((data, seq) => newPort.postMessage({ type: 'chunk', id: 'm', seq, data }))
      newPort.postMessage({ type: 'end', id: 'm', ...end })
      receive({ type: 'month', id: 'm', load: 1 }) // take는 end가 올 때까지 기다린다
      await vi.waitFor(() => expect(posted.at(-1)).toMatchObject({ type: 'month', load: 1, ok: true }), { timeout: 10_000 })
      receive({ type: 'check', check: 1, load: 1, visible: OCTOBER, settings: SETTINGS })
      await vi.waitFor(() => expect(heard).toEqual([expect.objectContaining({ type: 'send', cmd: 'store.save' })]), { timeout: 20_000 })
      expect(onOld).not.toHaveBeenCalled()
      expect(posted.some((m) => (m as { type: string }).type === 'send')).toBe(false)
      oldPort.close()
      newPort.close()
    })
  })
})

describe('AC-009.4 모양이 틀린 한 달 자료는 멈춘다', () => {
  it('AC-009.4: counts와 줄 수가 다른 자료는 다 모였어도 E-CLAIM-PARTIAL', async () => {
    const json = JSON.parse(OCT) as { counts: { s47: number } }
    const text = JSON.stringify({ ...json, counts: { ...json.counts, s47: json.counts.s47 - 1 } })
    expect(loadMonth(text)).toEqual({ ok: false, code: 'E-CLAIM-PARTIAL' })
    const { posts, jobs } = setup()
    await loadInto(jobs, 'm1', text, 1)
    expect(posts).toEqual([{ type: 'month', id: 'm1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
  })
})

describe('AC-009.5 달을 넘기는 기간은 한 번에 불러 점검한다', () => {
  it('AC-009.5: 10/30~11/2 자료 → 진료 달 두 개를 알리고 한 ClaimMonth로 둔다', async () => {
    const { posts, jobs } = setup()
    await loadInto(jobs, 'x1', CROSS, 1)
    expect(posts).toEqual([{ type: 'month', id: 'x1', load: 1, ok: true, visits: 4, months: ['2026-10', '2026-11'] }])
    expect(jobs.month()?.visits.map((v) => v.month)).toEqual(['2026-10', '2026-10', '2026-11', '2026-11'])
  })
})

// 설정 화면(TASK-12) '점검 규칙' 칸의 재료. 규칙표 JSON은 workers/precheck/tables.ts만 부를 수 있어(AC-007.4) Worker가 꺼내 준다
// 규칙표 첫 import는 PC가 바쁘면 5초(기본 제한)를 넘긴다
describe('AC-012.6 설정 화면용 규칙 목록(환자 자료 아님)', { timeout: 30_000 }, () => {
  it('AC-012.6: ruleList는 규칙마다 id·title·domain·grade·basis·enabled_default만 준다', async () => {
    const tables = await loadTables()
    expect(tables.ok).toBe(true)
    if (!tables.ok) return
    const list = ruleList(tables.value)
    expect(list).toHaveLength(tables.value.rules.rules.length)
    for (const item of list) {
      expect(Object.keys(item).sort()).toEqual(['basis', 'domain', 'enabled_default', 'grade', 'id', 'title'])
    }
    const first = tables.value.rules.rules[0]
    expect(list[0]).toEqual({
      id: first.id,
      title: first.title,
      domain: first.domain,
      grade: first.grade,
      basis: first.basis,
      enabled_default: first.enabled_default,
    })
  })

  it('AC-012.6: 화면이 ruleList를 부르면 목록을, 표를 못 불러오면 E-RULES-LOAD-FAILED를 보낸다', async () => {
    const ok = setup()
    await ok.jobs.fromScreen({ type: 'ruleList' })
    expect(ok.posts).toHaveLength(1)
    const reply = ok.posts[0]
    expect(reply.type === 'ruleList' && reply.ok && reply.rules.length > 200).toBe(true)

    const failed = setup(async () => ({ ok: false, code: 'E-RULES-LOAD-FAILED' }))
    await failed.jobs.fromScreen({ type: 'ruleList' })
    expect(failed.posts).toEqual([{ type: 'ruleList', ok: false, code: 'E-RULES-LOAD-FAILED' }])
  })
})

describe('AC-011 dxViews: 진료마다 추천 상병과 상병 확인 경고가 보기 모양에 들어간다', () => {
  const dxMonth = () => {
    const loaded = loadMonth(FAKE('claim-month-dx-check.json'))
    if (!loaded.ok) throw new Error(loaded.code)
    return loaded.value
  }

  it('AC-011.1: 진료 수만큼 보기 모양이 나오고 추천에 내원 수·상병 목록이 있다', () => {
    const month = dxMonth()
    const views = dxViews(month, [])
    expect(views.map((v) => v.visitKey)).toEqual(month.visits.map((v) => v.key))
    const first = views.find((v) => v.visitKey === 'd01')!
    expect(first.recommendations.find((r) => r.code === 'A49')?.visits).toBe(200)
    expect(first.recommendations.find((r) => r.code === 'A49')?.list.map((r) => r.dx).slice(0, 2)).toEqual(['M17', 'M750'])
    expect(first.recommendations.find((r) => r.code === 'A49')?.list[0].nm).toBe('상병 M17') // 이름은 그 달 진료의 상병에서 찾는다
  })

  it('AC-011.2: 상병 확인 경고(issues·missingDx·needsCheck)가 들어간다. 추천은 진료 자료를 바꾸지 않는다', () => {
    const month = dxMonth()
    const before = structuredClone(month.visits)
    const views = dxViews(month, [])
    const of = (id: string) => views.find((v) => v.visitKey === id)!
    expect(of('d01').issues.map((x) => x.code)).toEqual(['A49'])
    expect(of('d01').needsCheck).toBe(true)
    expect(of('d02').issues).toEqual([])
    expect(of('d02').needsCheck).toBe(false)
    expect(of('d16').missingDx).toBe(true)
    expect(of('d16').needsCheck).toBe(true)
    expect(month.visits).toEqual(before)
  })

  it('AC-011.3: 상병 연결표를 넘기면 추천과 경고에 섞인다', () => {
    const links: DxLink[] = [['G6604', 'S6350', '연결 이름', 0, 't']]
    const views = dxViews(dxMonth(), links)
    const view = views.find((v) => v.visitKey === 'd08')!
    expect(view.issues.map((x) => [x.code, x.gosi])).toEqual([['G6604', false]])
    expect(view.recommendations.find((r) => r.code === 'G6604')?.list[0]).toMatchObject({ dx: 'S6350', src: ['table'] })
  })

  it('AC-011.4: 그 달에 상병 추세가 비어도 고시로 추천하고 오류를 내지 않는다', () => {
    const month = { ...dxMonth(), dxTrend: { ...dxMonth().dxTrend, codes: new Map() } }
    const view = dxViews(month, []).find((v) => v.visitKey === 'd01')!
    expect(view.recommendations.find((r) => r.code === 'A49')).toMatchObject({ visits: 0 })
    expect(view.issues.map((x) => x.rec.map((r) => r.dx))).toEqual([['M17', 'M750']])
  })

  it('AC-011.2: 상병 자료가 없는 달은 경고를 내지 않는다', () => {
    const views = dxViews({ ...dxMonth(), hasDx: false }, [])
    expect(views.every((v) => !v.needsCheck && !v.missingDx && v.issues.length === 0)).toBe(true)
  })
})

describe('AC-010.1 jobs.check: 규칙 엔진 결과를 보기 모양으로', () => {
  const tablesValue = async () => {
    const loaded = await loadTables()
    if (!loaded.ok) throw new Error(loaded.code)
    return loaded.value
  }
  const NO_SETTINGS = { off: [], on: [], grade: {} }
  const octMonth = () => {
    const loaded = loadMonth(OCT)
    if (!loaded.ok) throw new Error(loaded.code)
    return loaded.value
  }

  it('AC-010.1: 진료마다 결과와 점검한 수, 규칙별 묶음, 합계를 돌려준다', async () => {
    const { jobs } = setup()
    const month = octMonth()
    const view = jobs.check(month, await tablesValue(), NO_SETTINGS)
    expect(view.visits.map((v) => v.key)).toEqual(month.visits.map((v) => v.key))
    const v2 = view.visits.find((v) => v.key === 'v2')!
    expect(v2).toMatchObject({ chart: '900002', date: '2026-10-05', name: '가상환자02', skippedNoHistory: 0, skippedNoDx: 0 })
    expect(v2.checked).toBeGreaterThan(0)
    const ij05 = v2.findings.find((f) => f.ruleId === 'IJ-05')!
    expect(ij05).toMatchObject({ visitKey: 'v2', grade: '확인필요', detail: 'KK090 + A15' })
    expect(ij05.basis.length).toBeGreaterThan(0)
    const group = view.groups.find((g) => g.ruleId === 'IJ-05')!
    expect(group).toMatchObject({ title: expect.any(String), domain: expect.any(String), grade: '확인필요' })
    expect(group.visitKeys).toContain('v2')
    expect(view.totals.hi).toBe(view.visits.flatMap((v) => v.findings).filter((f) => f.grade === '확인필요').length)
  })

  it('AC-010.1: 설정을 그대로 넘긴다(끈 규칙은 보기에도 없다)', async () => {
    const { jobs } = setup()
    const view = jobs.check(octMonth(), await tablesValue(), { off: ['IJ-05'], on: [], grade: {} })
    expect(view.visits.flatMap((v) => v.findings).some((f) => f.ruleId === 'IJ-05')).toBe(false)
    expect(view.groups.some((g) => g.ruleId === 'IJ-05')).toBe(false)
  })
})

describe('AC-014 메모 초안이 점검 보기 모양에 들어간다', { timeout: 30_000 }, () => {
  const noDrugs = () => {
    const value: Partial<Phrases> = ourClinicPhrases()
    delete value.procedureDrugs
    return value
  }
  const tablesValue = async () => {
    const loaded = await loadTables()
    if (!loaded.ok) throw new Error(loaded.code)
    return loaded.value
  }
  const NO_SETTINGS = { off: [], on: [], grade: {} }
  const monthFrom = (name: string) => {
    const loaded = loadMonth(FAKE(name))
    if (!loaded.ok) throw new Error(loaded.code)
    return loaded.value
  }
  const memo = () => monthFrom('claim-month-memo.json')
  /** m26: 시술 2종 + IA, 2부위 사유가 나온다 */
  const REASONED = 'm26'
  /** m05: 어깨 SSNB 하나 */
  const PLAIN = 'm05'

  it('AC-2603.3: 줄 종류를 받는 넷째 인자를 줘도 메모 보기 모양·값은 주지 않을 때와 같고, 진료마다 증상 줄 수만큼 종류가 담긴다', async () => {
    const month = memo()
    const tables = await tablesValue()
    const kinds = new Map<string, readonly string[]>()
    const withKinds = memoViews(month, tables, { phrases: ourClinicPhrases() }, kinds)
    expect(withKinds).toEqual(memoViews(month, tables, { phrases: ourClinicPhrases() }))
    expect([...kinds.keys()]).toEqual(month.visits.map((visit) => visit.key))
    for (const visit of month.visits) expect(kinds.get(visit.key)).toHaveLength(visit.lines.length)
  })

  it('AC-014.5: 진료마다 메모 초안(fullText)이 있고 고친 메모가 없으면 고쳤다고 하지 않는다', async () => {
    const month = memo()
    const views = memoViews(month, await tablesValue(), { phrases: ourClinicPhrases() })
    expect(views.memoBlocked).toBeNull()
    expect(views.memos.map((m) => m.visitKey)).toEqual(month.visits.map((v) => v.key))
    const plain = views.memos.find((m) => m.visitKey === PLAIN)!
    expect(plain).toMatchObject({ edited: false, missing: [], hasMemo: true, unfinished: false })
    expect(plain.text).toContain('SSNB')
  })

  it('AC-014.4: 고친 메모는 그대로 두고 빠진 문장만 경고한다', async () => {
    const saved = new Map([[REASONED, '◈직접 고친 글(가상)']])
    const views = memoViews(memo(), await tablesValue(), { phrases: ourClinicPhrases(), saved })
    const edited = views.memos.find((m) => m.visitKey === REASONED)!
    expect(edited.text).toBe('◈직접 고친 글(가상)')
    expect(edited.edited).toBe(true)
    expect(edited.missing).toEqual([ourClinicPhrases().TPL.ia2])
  })

  it('AC-014.12: 확인 표시가 남은 메모를 알린다(고친 메모도 고친 글로 본다)', async () => {
    // k03: 무릎 세트 날 IA 줄 생략이라 트리암을 놓을 줄이 없어 [약 확인]이 남는다(memo-settings AC-3002.3). k01은 REQ-3002부터 표시가 없다
    const month = memo()
    const tables = await tablesValue()
    const auto = memoViews(month, tables, { phrases: ourClinicPhrases() })
    expect(auto.memos.find((m) => m.visitKey === 'k03')!.unfinished).toBe(true)
    expect(auto.memos.find((m) => m.visitKey === 'k01')!.unfinished).toBe(false)
    const fixed = memoViews(month, tables, { phrases: ourClinicPhrases(), saved: new Map([['k03', '◈고쳐서 확인 표시를 지움(가상)']]) })
    expect(fixed.memos.find((m) => m.visitKey === 'k03')!.unfinished).toBe(false)
    const left = memoViews(month, tables, { phrases: ourClinicPhrases(), saved: new Map([[PLAIN, '◈[약 확인: 트리암]']]) })
    expect(left.memos.find((m) => m.visitKey === PLAIN)!.unfinished).toBe(true)
  })

  it.each([
    ['설정 줄 없음(null)', null],
    ['빈 {}', {}],
    ['약 칸 없음', noDrugs()],
    ['틀린 문구 칸', { ...ourClinicPhrases(), TPL: { ...ourClinicPhrases().TPL, main: '{없는말}' } }],
  ])('AC-014.8: %s: 규칙 결과는 그대로 내고 메모는 만들지 않는다', async (_name, phrases) => {
    const month = monthFrom('claim-month-rules-v1-v18.json')
    const tables = await tablesValue()
    const without = checkMonth(month, tables, NO_SETTINGS, { phrases: ourClinicPhrases() })
    const view = checkMonth(month, tables, NO_SETTINGS, { phrases })
    expect(view.memoBlocked).toBe('E-MEMO-NO-SETTINGS')
    expect(view.visits.every((v) => v.memo === null)).toBe(true)
    expect(view.totals).toEqual(without.totals)
    expect(view.groups).toEqual(without.groups)
    expect(view.visits.map((v) => v.findings)).toEqual(without.visits.map((v) => v.findings))
  })

  it('AC-014.8: 기본값으로 대신 만들지 않는다(메모 없는 답에 글자가 없다)', async () => {
    const views = memoViews(memo(), await tablesValue(), { phrases: {} })
    expect(views).toEqual({ memoBlocked: 'E-MEMO-NO-SETTINGS', memos: [] })
  })

  it('AC-014.8: 약 칸이 빈 설정은 막지 않고, 아직 안 정한 약에 표시를 남긴다', async () => {
    const views = memoViews(memo(), await tablesValue(), { phrases: defaultPhrases() })
    expect(views.memoBlocked).toBeNull()
    expect(views.memos.find((m) => m.visitKey === 'm22')!.text).toContain('[약 확인: 트리암]')
  })

  it('AC-014.1: jobs.check의 보기 모양에 메모가 실린다', async () => {
    const { jobs } = setup()
    const month = memo()
    const view = jobs.check(month, await tablesValue(), NO_SETTINGS, { phrases: ourClinicPhrases() })
    expect(view.memoBlocked).toBeNull()
    expect(view.visits.find((v) => v.key === PLAIN)!.memo?.text).toContain('SSNB')
  })

  it('AC-014.11: 설정이 바뀌면 손대지 않은 메모만 새 설정으로 다시 만든다(고침·완료는 그대로)', async () => {
    const month = memo()
    const tables = await tablesValue()
    const before = ourClinicPhrases()
    const after = ourClinicPhrases()
    after.TPL.mark = '※'
    const untouched = 'm05'
    const edited = 'm04'
    const completed = 'm06'
    const first = memoViews(month, tables, { phrases: before })
    const textOf = (views: ReturnType<typeof memoViews>, key: string) => views.memos.find((m) => m.visitKey === key)!.text
    // 완료한 메모는 도우미가 그때 글로 저장해 둔다(원본 protectWork가 글을 얼리는 것과 같다)
    const saved = new Map([
      [edited, '◈직접 고친 글(가상)'],
      [completed, textOf(first, completed)],
    ])
    const second = memoViews(month, tables, { phrases: after, saved })
    expect(textOf(first, untouched)).toContain('◈')
    expect(textOf(second, untouched)).toBe(textOf(first, untouched).replaceAll('◈', '※'))
    expect(textOf(second, edited)).toBe('◈직접 고친 글(가상)')
    expect(textOf(second, completed)).toBe(textOf(first, completed))
  })

  describe('AC-014.13 dxViews에 메모 결과를 잇는다', () => {
    const noDx = 'm33' // 상병 없음·비급여 수압팽창술(MM410)만: 부위 메모가 있다
    const noMemo = 'm35' // 상병 없음·비급여 도수만: 부위 메모가 없다
    const withDxData = () => {
      const month = memo()
      expect(month.hasDx).toBe(true)
      return month
    }

    it('AC-014.13: 상병 없음·비급여뿐·부위 메모 있음: missingDx가 참이다', async () => {
      const month = withDxData()
      const views = memoViews(month, await tablesValue(), { phrases: ourClinicPhrases() })
      expect(month.visits.find((v) => v.key === noDx)!.rx.every((row) => !row.benefit)).toBe(true)
      expect(views.memos.find((m) => m.visitKey === noDx)!.hasMemo).toBe(true)
      expect(dxViews(month, [], views).find((v) => v.visitKey === noDx)!.missingDx).toBe(true)
    })

    it('AC-014.13: 부위 메모가 없으면 거짓이다', async () => {
      const month = withDxData()
      const views = memoViews(month, await tablesValue(), { phrases: ourClinicPhrases() })
      expect(views.memos.find((m) => m.visitKey === noMemo)!.hasMemo).toBe(false)
      expect(dxViews(month, [], views).find((v) => v.visitKey === noMemo)!.missingDx).toBe(false)
    })

    it('AC-014.13: 고친 메모가 있어도 부위 메모가 없으면 거짓이다(고친 글의 길이로 보지 않는다)', async () => {
      const month = withDxData()
      const views = memoViews(month, await tablesValue(), { phrases: ourClinicPhrases(), saved: new Map([[noMemo, '◈직접 고친 글(가상)']]) })
      const view = views.memos.find((m) => m.visitKey === noMemo)!
      expect(view.text).toBe('◈직접 고친 글(가상)')
      expect(view.edited).toBe(true)
      expect(view.hasMemo).toBe(false)
      expect(dxViews(month, [], views).find((v) => v.visitKey === noMemo)!.missingDx).toBe(false)
    })

    it('AC-014.13: 메모를 만들지 않는 병원은 메모가 없으므로 거짓이다', async () => {
      const month = withDxData()
      const views = memoViews(month, await tablesValue(), { phrases: null })
      expect(dxViews(month, [], views).find((v) => v.visitKey === noDx)!.missingDx).toBe(false)
    })
  })
})

// ── 비트 메모 비교의 Worker 쪽(TASK-16). 조각은 진짜 assemble로 모은다. 메모 글자는 모두 지어낸 것이다 ──────────

describe('clinic-profile 약 역할·연골주사 이름을 점검과 메모에 잇는다', { timeout: 30_000 }, () => {
  const tablesValue = async () => {
    const loaded = await loadTables()
    if (!loaded.ok) throw new Error(loaded.code)
    return loaded.value
  }
  const NO_SETTINGS = { off: [], on: [], grade: {} }
  type Seed = { key: string; chart: string; lines: string[]; rx: [code: string, name: string][]; dx?: string }
  /** 도우미 표를 거치지 않고 점검용 모양을 바로 만든다(진료는 모두 2026-10-12) */
  function fakeMonth(seeds: Seed[], catalog: Partial<CatalogCode>[]): ClaimMonth {
    const date = '2026-10-12'
    const rxByDay: ClaimMonth['rxByDay'] = new Map()
    const rxDayOrder: ClaimMonth['rxDayOrder'] = []
    const visits = seeds.map((seed): Visit => {
      const rx = seed.rx.map(([code, name]) => ({ code, name, qty: 1, benefit: true, pay: '급여' }))
      rxByDay.set(seed.chart, new Map([[date, rx]]))
      rxDayOrder.push(rx)
      const dx = [{ c: seed.dx ?? 'M1706', n: '', m: true as const, s: '', d: '', t: '' }]
      return { key: seed.key, chart: seed.chart, date, month: '2026-10', name: '가상환자01', lines: seed.lines, hints: seed.lines.map(() => null), rx, dx, memosInBit: [] }
    })
    return {
      period: { from: '2026-10-01', to: '2026-10-31' },
      visits,
      history: new Map(),
      historyRange: { from: '2025-10-01', to: '2026-10-31' },
      rxByDay,
      rxDayOrder,
      dxTrend: { from: '2025-11-01', to: '2026-11-01', visits: 0, codes: new Map(), suggestions: [] },
      catalog: { codes: catalog.map((row) => ({ code: '', name: '', kind: 'drug' as const, active: true, standardCode: '', ...row })), la: [] },
      hasDx: true,
    }
  }
  /** 다른 병원 처방 목록: 'A15'는 보험코드 성분이 에피네프린 주사(리도카인 아님), 'X7'은 히알루론산나트륨 주사. 이름으로는 역할을 알 수 없다 */
  const OTHER_CATALOG: Partial<CatalogCode>[] = [
    { code: 'KK090', name: '관절강내주사', kind: 'procedure', standardCode: 'KK090' },
    { code: 'A15', name: '가상주사', standardCode: '645100741' },
    { code: 'X7', name: '시노비안', standardCode: '642904921' },
  ]
  const RULES_MONTH = () =>
    fakeMonth(
      [
        { key: 'a15-alone', chart: '900301', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사'], ['A15', '가상주사']] },
        { key: 'x7-hip-dx', chart: '900302', lines: ['Rt knee'], rx: [['KK090', '관절강내주사'], ['X7', '가상주사']], dx: 'M5456' },
      ],
      OTHER_CATALOG,
    )
  /** 중립 기본 문구 + 그 병원 처방코드 탭 줄 */
  const clinicPhrases = (rows: Record<string, MemoCode>, edit?: (value: Phrases) => void): Phrases => {
    const value = neutralPhrases()
    Object.assign(value.CODEMAP, rows)
    edit?.(value)
    expect(validatePhrases(value).ok).toBe(true)
    return value
  }
  const ruleHits = (view: ReturnType<typeof checkMonth>, key: string) => view.visits.find((visit) => visit.key === key)!.findings.map((hit) => `${hit.ruleId}:${hit.detail}`)
  const ids = (hits: string[]) => hits.map((hit) => hit.split(':')[0])

  it("AC-6608.3: 다른 병원은 보험코드 성분으로 점검한다 — 'A15'는 마취약이 아니고(IJ-05 없음) 'X7'은 연골주사다(무릎이 아닌 상병이면 HY-01). 병원 문구가 없어도 같다", async () => {
    const tables = await tablesValue()
    for (const phrases of [null, clinicPhrases({})]) {
      const view = checkMonth(RULES_MONTH(), tables, NO_SETTINGS, { phrases })
      expect(ruleHits(view, 'a15-alone')).toEqual([])
      expect(ids(ruleHits(view, 'x7-hip-dx'))).toEqual(expect.arrayContaining(['HY-01', 'HY-12']))
    }
  })

  it('AC-6608.2: 처방코드 탭에서 고른 역할(CODEMAP 깃발)이 보험코드 성분보다 먼저 점검에 간다 — 마취약으로 고른 A15는 IJ-05, [아님]으로 고른 X7은 연골주사 규칙이 없다', async () => {
    const tables = await tablesValue()
    const phrases = clinicPhrases({
      A15: { n: '가상주사', k: 'drug', rg: null, localAnesthetic: true },
      X7: { n: '시노비안', k: 'drug', rg: null, steroid: false, localAnesthetic: false, cartilage: false },
    })
    const view = checkMonth(RULES_MONTH(), tables, NO_SETTINGS, { phrases })
    expect(ruleHits(view, 'a15-alone')).toContain('IJ-05:KK090 + A15')
    expect(ids(ruleHits(view, 'x7-hip-dx'))).not.toContain('HY-01')
    expect(ids(ruleHits(view, 'x7-hip-dx'))).not.toContain('HY-12')
  })

  it('AC-6608.2: 지운 코드(CODEMAP_DEL)의 깃발은 쓰지 않는다(사전에 없는 코드다)', async () => {
    const phrases = clinicPhrases({ A15: { n: '가상주사', k: 'drug', rg: null, localAnesthetic: true } }, (value) => {
      value.CODEMAP_DEL = [...value.CODEMAP_DEL, 'A15']
    })
    expect(ruleHits(checkMonth(RULES_MONTH(), await tablesValue(), NO_SETTINGS, { phrases }), 'a15-alone')).toEqual([])
  })

  /** 차트에 그 병원 연골주사 약 이름을 적은 날(관절강내주사 + 그 약) */
  const chartedMonth = (name: string, line: string) => fakeMonth([{ key: 'x7-chart', chart: '900311', lines: ['Rt knee OA', line], rx: [['KK090', '관절강내주사'], ['X7', `${name}주`]] }], [OTHER_CATALOG[0], { code: 'X7', name, standardCode: '642904921' }])
  /** 처방코드 탭에 그 약 줄(이름만, 역할 깃발 없음)과 관절강내주사 날 그 약 넣기 */
  const drugPhrases = (name: string, row: Partial<MemoCode> = {}) =>
    clinicPhrases({ X7: { n: name, k: 'drug', rg: null, ...row } }, (value) => {
      value.procedureDrugs = { KK090: { [name]: { use: 'include', place: 'afterEnding' } } }
    })
  const memoOf = (views: ReturnType<typeof memoViews>, key: string) => views.memos.find((memo) => memo.visitKey === key)!.text

  it("AC-6609.1: 보험코드 성분으로 연골주사인 약을 차트에 적은 날 연골주사 줄이 만들어지고 약 이름은 그 병원 이름이며 '아라간'이 없다(이름으로 짐작할 수 없는 약 포함)", async () => {
    const tables = await tablesValue()
    const cases: [name: string, line: string, memo: string][] = [
      ['하이알플러스', '하이알플러스 rt knee 2차', '◈우측 슬관절 강내 연골주사 2회차 (하이알플러스)'],
      ['시노비안', '시노비안 Lt knee 3차', '◈좌측 슬관절 강내 연골주사 3회차 (시노비안)'],
    ]
    for (const [name, line, memo] of cases) {
      const text = memoOf(memoViews(chartedMonth(name, line), tables, { phrases: drugPhrases(name) }), 'x7-chart')
      expect(text, name).toBe(memo)
      expect(text, name).not.toContain('아라간')
    }
  })

  it("AC-6608.2: 처방코드 탭 [아님]은 보험코드 성분이 연골주사여도 연골주사 약이 아니다(메모)", async () => {
    const none = drugPhrases('시노비안', { steroid: false, localAnesthetic: false, cartilage: false })
    const text = memoOf(memoViews(chartedMonth('시노비안', '시노비안 Lt knee 3차'), await tablesValue(), { phrases: none }), 'x7-chart')
    expect(text).not.toContain('연골주사')
  })

  it('AC-6609.1: 처방코드 탭에 없는 연골주사 약도 처방 목록 이름으로 차트를 읽고, 그날 처방이 없으면 약 이름 자리는 쓰는 약(유효) 이름이 먼저다', async () => {
    const phrases = clinicPhrases({}, (value) => {
      value.TPL.ara = '{좌우} 슬관절 강내 {약제} {회차}회차'
    })
    const catalog: Partial<CatalogCode>[] = [OTHER_CATALOG[0], { code: 'X9', name: '옛연골약', active: false, standardCode: '645902041' }, { code: 'X7', name: '시노비안', standardCode: '642904921' }]
    const month = fakeMonth([{ key: 'chart-only', chart: '900312', lines: ['시노비안 Rt knee 3차'], rx: [['KK090', '관절강내주사']] }], catalog)
    const text = memoOf(memoViews(month, await tablesValue(), { phrases }), 'chart-only')
    expect(text).toBe('◈우측 슬관절 강내 시노비안 3회차')
    expect(text).not.toContain('아라간')
  })
})

describe('AC-016 비트 메모 자료를 받아 비교한다', { timeout: 30_000 }, () => {
  const MEMO_MONTH = FAKE('claim-month-memo.json')
  const DAY = { from: '2026-10-12', to: '2026-10-12' }
  const NO_SETTINGS = { off: [], on: [], grade: {} }
  /** m04·m05·m06: 메모가 있는 진료 */
  const [A, B, C] = [
    { key: 'm04', chart: '900019' },
    { key: 'm05', chart: '900020' },
    { key: 'm06', chart: '900021' },
  ]
  /** m36: 메모가 없는 진료(hasMemo 거짓) */
  const NO_MEMO = { key: 'm36', chart: '900064' }

  const tablesValue = async () => {
    const loaded = await loadTables()
    if (!loaded.ok) throw new Error(loaded.code)
    return loaded.value
  }
  const memoRow = (visit: { key: string; chart: string }, m: string): MemoRowRaw => ({ v: visit.key, p: visit.chart, d: DAY.from, m })
  const memosJson = (rows: MemoRowRaw[], over: Partial<ClaimMemosJson> = {}) =>
    JSON.stringify({ version: 1, period: DAY, truncated: false, invalidRows: 0, rows, ...over } satisfies ClaimMemosJson)
  const storeJson = (work: Partial<StoreMonthJson>) => JSON.stringify({ months: { '2026-10': { drafts: {}, done: {}, journal: {}, ...work } } } satisfies StoreLoadJson)

  const askPart = (jobs: Jobs, part: 'memos' | 'store', id: string, load: number) => jobs.fromScreen({ type: 'loadPart', part, id, load } satisfies PrecheckFromScreen)
  const askReload = (jobs: Jobs, id: string, load: number, run: number) => jobs.fromScreen({ type: 'loadPart', part: 'memos', id, load, run } satisfies PrecheckFromScreen)
  const reloadStart = (jobs: Jobs, run: number) => jobs.fromScreen({ type: 'memoReloadStart', run } satisfies PrecheckFromScreen)
  /** 조각을 다 넣고 그 id를 묻는다 */
  async function givePart(jobs: Jobs, part: 'memos' | 'store', id: string, text: string, load: number) {
    await stream(jobs, id, text)
    await askPart(jobs, part, id, load)
  }
  async function giveReload(jobs: Jobs, id: string, text: string, load: number, run: number) {
    await stream(jobs, id, text)
    await askReload(jobs, id, load, run)
  }
  /** 달을 불러 두고 화면으로 간 메시지를 비운다 */
  async function loaded(load = 1) {
    const made = setup()
    await loadInto(made.jobs, 'month', MEMO_MONTH, load)
    made.posts.length = 0
    return made
  }
  /** 달과 처음 비트 메모까지 불러 둔다 */
  async function withMemos(rows: MemoRowRaw[], load = 1) {
    const made = await loaded(load)
    await givePart(made.jobs, 'memos', 'memos', memosJson(rows), load)
    made.posts.length = 0
    return made
  }

  const stateOf = async (jobs: Jobs, options: Partial<MemoStateOptions> = {}) => jobs.memoState(await tablesValue(), ourClinicPhrases(), { visible: DAY, ...options })
  const compareOf = (state: MemoState, key: string) => state.rows.find((row) => row.key === key)?.compare
  /** 그 진료의 우리 메모 글(fullText) */
  const oursOf = async (jobs: Jobs, key: string) => (await stateOf(jobs)).rows.find((row) => row.key === key)!.text

  describe('AC-016.5 loadPart: month와 같은 규칙으로 찾아 간다', () => {
    it('AC-016.5: memos·store 조각을 찾아 가 ok:true로만 답한다. 답에 환자 글자가 없다', async () => {
      const { posts, jobs } = await loaded()
      await givePart(jobs, 'memos', 'c1', memosJson([memoRow(A, '가상환자 비트 메모 900019')]), 1)
      await givePart(jobs, 'store', 's1', storeJson({ drafts: { [B.key]: '가상환자 고친 글 900020' } }), 1)
      expect(posts).toStrictEqual([
        { type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: true },
        { type: 'loadPart', part: 'store', id: 's1', load: 1, ok: true },
      ])
      expectNoPatientText(posts)
    })

    it('AC-016.5: 화면의 요청이 end보다 먼저 와도 그 요청의 자료가 다 오면 답한다', async () => {
      const { posts, jobs } = await loaded()
      const asked = askPart(jobs, 'memos', 'c1', 1)
      await stream(jobs, 'c1', memosJson([memoRow(A, '비트 메모')]))
      await asked
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: true }])
    })

    it('AC-016.5: 빠진 조각이면 ok:false이고 자료를 받지 않는다', async () => {
      const { posts, jobs } = await withMemos([memoRow(A, '처음 비트 메모')])
      const before = await stateOf(jobs)
      const { parts, end } = chunked(memosJson([memoRow(A, '다른 메모'.repeat(4000))]), 4096)
      expect(parts.length).toBeGreaterThan(1)
      await jobs.fromPort({ type: 'chunk', id: 'c2', seq: 0, data: parts[0] })
      await jobs.fromPort({ type: 'end', id: 'c2', ...end })
      await askPart(jobs, 'memos', 'c2', 1)
      expect(posts).toEqual([
        { type: 'partial', id: 'c2', code: 'E-CLAIM-PARTIAL' },
        { type: 'loadPart', part: 'memos', id: 'c2', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
      ])
      expect(await stateOf(jobs)).toEqual(before)
    })

    it('AC-016.5: SHA-256이 다르면 ok:false이고 자료를 받지 않는다', async () => {
      const { posts, jobs } = await loaded()
      await stream(jobs, 's1', storeJson({ drafts: { [B.key]: '고친 글' } }), createHash('sha256').update('다른 글자').digest('hex'))
      await askPart(jobs, 'store', 's1', 1)
      expect(posts.at(-1)).toEqual({ type: 'loadPart', part: 'store', id: 's1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
      expect((await stateOf(jobs)).rows.find((row) => row.key === B.key)?.text).not.toBe('고친 글')
    })

    it('AC-016.5: 옛 번호면 조각을 찾아 버리고 ok:false이며 자료를 받지 않는다', async () => {
      const { posts, jobs } = await loaded(2)
      await givePart(jobs, 'memos', 'old', memosJson([memoRow(A, '옛 메모')]), 1)
      await givePart(jobs, 'store', 'olds', storeJson({ drafts: { [B.key]: '옛 글' } }), 1)
      expect(posts).toEqual([
        { type: 'loadPart', part: 'memos', id: 'old', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
        { type: 'loadPart', part: 'store', id: 'olds', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
      ])
      expect(compareOf(await stateOf(jobs), A.key)).toBe('조회 못함')
      expect((await stateOf(jobs)).rows.find((row) => row.key === B.key)?.text).not.toBe('옛 글')
      // 찾아 갔으므로 제 번호로 다시 물어도 없다
      await askPart(jobs, 'memos', 'old', 2)
      expect(posts.at(-1)).toEqual({ type: 'loadPart', part: 'memos', id: 'old', load: 2, ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-016.5: 번호는 take가 끝난 뒤에 본다: 기다리는 동안 새 불러오기가 오면 받지 않는다', async () => {
      const { posts, jobs } = await loaded()
      const asked = askPart(jobs, 'memos', 'c1', 1)
      await loadStart(jobs, 2)
      await stream(jobs, 'c1', memosJson([memoRow(A, '옛 메모')]))
      await asked
      expect(posts.at(-1)).toEqual({ type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-016.5: 두 번째 찾기는 ok:false이고 받아 둔 자료는 그대로다', async () => {
      const { posts, jobs } = await loaded()
      await givePart(jobs, 'memos', 'c1', memosJson([memoRow(A, '비트 메모')]), 1)
      await askPart(jobs, 'memos', 'c1', 1)
      expect(posts).toEqual([
        { type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: true },
        { type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
      ])
      expect(compareOf(await stateOf(jobs), A.key)).toBe('다름')
    })

    it.each<[string, string]>([
      ['JSON이 아닌 memos', 'not json'],
      ['모양이 틀린 memos', JSON.stringify({ version: 1 })],
    ])('AC-016.5: %s는 ok:false', async (_, text) => {
      const { posts, jobs } = await loaded()
      await givePart(jobs, 'memos', 'c1', text, 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
    })

    it.each<[string, string]>([
      ['JSON이 아닌 store', 'not json'],
      ['months가 객체가 아닌 store', JSON.stringify({ months: [] })],
      ['달 이름이 틀린 store', JSON.stringify({ months: { nope: { drafts: {}, done: {}, journal: {} } } })],
      ['drafts가 없는 store', JSON.stringify({ months: { '2026-10': { done: {}, journal: {} } } })],
      ['고친 메모가 글자가 아닌 store', storeJson({ drafts: { m05: 1 as unknown as string } })],
      ['입력 기록이 글자가 아닌 store', storeJson({ journal: { m05: true as unknown as string } })],
      ['완료 값이 글자나 참거짓이 아닌 store', storeJson({ done: { m05: 1 as unknown as string } })],
    ])('AC-016.5: %s는 ok:false', async (_, text) => {
      const { posts, jobs } = await loaded()
      await givePart(jobs, 'store', 's1', text, 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'store', id: 's1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
    })

    it('AC-016.5: 달을 묻지 않은 store 답(months 없음)은 받되 받아 둔 고친 메모를 지우지 않는다', async () => {
      const { posts, jobs } = await loaded()
      await givePart(jobs, 'store', 's1', storeJson({ drafts: { [B.key]: '고친 글' } }), 1)
      await givePart(jobs, 'store', 's2', JSON.stringify({ settings: null } satisfies StoreLoadJson), 1)
      expect(posts.at(-1)).toEqual({ type: 'loadPart', part: 'store', id: 's2', load: 1, ok: true })
      expect((await stateOf(jobs)).rows.find((row) => row.key === B.key)?.text).toBe('고친 글')
    })

    it('AC-015.2: 파일이 없는 달의 빈 내용은 그대로 빈 내용이다', async () => {
      const { posts, jobs } = await loaded()
      await givePart(jobs, 'store', 's1', storeJson({}), 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'store', id: 's1', load: 1, ok: true }])
      expect(jobs.memoInput(null).saved?.size).toBe(0)
    })

    it('AC-016.5: 모양이 틀린 loadPart·memoReloadStart는 답하지 않는다', async () => {
      const { posts, jobs } = await loaded()
      await stream(jobs, 'c1', memosJson([]))
      for (const m of [
        { type: 'loadPart', part: 'other', id: 'c1', load: 1 },
        { type: 'loadPart', part: 'memos', id: 1, load: 1 },
        { type: 'loadPart', part: 'memos', id: 'c1' },
        { type: 'loadPart', part: 'memos', id: 'c1', load: 1, run: 'x' },
        { type: 'loadPart', part: 'store', id: 'c1', load: 1, run: 1 },
      ]) {
        await jobs.fromScreen(m)
      }
      expect(posts).toEqual([])
      // 틀린 메시지는 조각을 찾아 가지 않았다
      await askPart(jobs, 'memos', 'c1', 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: true }])
    })
  })

  describe('AC-016.1·AC-016.6 비교는 claim.memos 답으로만 한다', () => {
    it.each<[string, Partial<ClaimMemosJson>]>([
      ['truncated', { truncated: true }],
      ['invalidRows', { invalidRows: 1 }],
    ])('AC-016.1: %s면 E-CLAIM-PARTIAL로 멈추고 줄을 비교에 쓰지 않는다', async (_, over) => {
      const { posts, jobs } = await loaded()
      await givePart(jobs, 'memos', 'c1', memosJson([memoRow(A, '비트 메모')], over), 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
      const state = await stateOf(jobs)
      expect(compareOf(state, A.key)).toBe('조회 못함')
      expect(compareOf(state, B.key)).toBe('조회 못함')
    })

    it('AC-016.2: 같음·다름·비트에 없음을 진료마다 낸다', async () => {
      const made = await loaded()
      const ours = await oursOf(made.jobs, A.key)
      await givePart(made.jobs, 'memos', 'c1', memosJson([memoRow(A, ours.replaceAll('\n', '\r\n')), memoRow(B, '비트에 있는 다른 메모')]), 1)
      const state = await stateOf(made.jobs)
      expect(compareOf(state, A.key)).toBe('같음')
      expect(compareOf(state, B.key)).toBe('다름')
      expect(compareOf(state, C.key)).toBe('비트에 없음')
    })

    it('AC-016.6: 차트번호가 다른 줄은 쓰지 않고 조회 못함이다. 앞 0은 무시한다', async () => {
      const made = await loaded()
      await givePart(made.jobs, 'memos', 'c1', memosJson([memoRow({ key: A.key, chart: '900099' }, '남의 메모'), memoRow({ key: B.key, chart: `00${B.chart}` }, '비트 메모')]), 1)
      const state = await stateOf(made.jobs)
      expect(compareOf(state, A.key)).toBe('조회 못함')
      expect(compareOf(state, B.key)).toBe('다름')
      expect(state.rows.find((row) => row.key === A.key)).not.toHaveProperty('inBit')
      expect(state.plan.skipped).toContainEqual({ key: A.key, reason: '조회 못함' })
      expect(state.plan.batch.map((row) => row.key)).not.toContain(A.key)
    })

    it('AC-016.6: 잘린 memosInBit이 있어도 쓰지 않는다', async () => {
      const made = await withMemos([])
      made.jobs.month()!.visits.find((visit) => visit.key === A.key)!.memosInBit = ['이력에 있던 잘린 메모']
      expect(compareOf(await stateOf(made.jobs), A.key)).toBe('비트에 없음')
    })

    it('AC-013.2: claim.memos 자료 없이 계속한 불러오기는 모두 조회 못함이고 묶음이 비어 있다', async () => {
      const { jobs } = await loaded()
      const state = await stateOf(jobs)
      expect(state.rows.length).toBeGreaterThan(0)
      expect(new Set(state.rows.map((row) => row.compare))).toEqual(new Set(['조회 못함']))
      expect(state.plan.batch).toEqual([])
      expect(state.plan.done).toEqual([])
    })

    it('AC-013.13: 화면·묶음·날짜별 수는 고른 기간만 본다. 그 앞 진료는 줄이 없어도 비트에 없음이 되지 않는다', async () => {
      const { jobs } = await withMemos([])
      const state = await stateOf(jobs)
      expect(new Set(state.rows.map((row) => row.date))).toEqual(new Set([DAY.from]))
      expect(state.days.map((day) => day.date)).toEqual([DAY.from])
      const wide = await stateOf(jobs, { visible: { from: '2026-10-05', to: '2026-10-12' } })
      expect(wide.rows.find((row) => row.key === 'm60')?.compare).toBe('조회 못함')
      expect(wide.plan.batch.map((row) => row.key)).not.toContain('m60')
    })

    it('AC-016.4: 날짜별 수를 낸다. 메모 없는 진료는 메모 필요 수에 들지 않는다', async () => {
      const made = await loaded()
      const ours = await oursOf(made.jobs, A.key)
      await givePart(made.jobs, 'memos', 'c1', memosJson([memoRow(A, ours), memoRow(B, '비트에 있는 다른 메모')]), 1)
      const state = await stateOf(made.jobs)
      const needMemo = state.rows.filter((row) => row.hasMemo).length
      expect(state.rows.some((row) => !row.hasMemo)).toBe(true)
      expect(state.days).toEqual([{ date: DAY.from, needMemo, entered: 1, already: 1 }])
    })

    it('AC-016.3: 사람이 직접 친 글이 있어도 메모 없는 진료는 묶음에 들지 않는다', async () => {
      const made = await withMemos([])
      await givePart(made.jobs, 'store', 's1', storeJson({ drafts: { [NO_MEMO.key]: '사람이 직접 친 글' } }), 1)
      const state = await stateOf(made.jobs)
      const row = state.rows.find((r) => r.key === NO_MEMO.key)!
      expect(row).toMatchObject({ text: '사람이 직접 친 글', hasMemo: false, unfinished: false })
      expect(state.plan.batch.map((r) => r.key)).not.toContain(NO_MEMO.key)
      expect(state.plan.skipped).toContainEqual({ key: NO_MEMO.key, reason: '메모 없음' })
    })

    it('AC-014.8: 메모를 만들지 않는 병원은 비교 줄이 없다', async () => {
      const { jobs } = await withMemos([])
      const state = jobs.memoState(await tablesValue(), {}, { visible: DAY })
      expect(state).toEqual({ memoBlocked: 'E-MEMO-NO-SETTINGS', rows: [], plan: { batch: [], done: [], skipped: [] }, days: [] })
    })

    it('AC-016.2: 달을 불러 두지 않았으면 비교 줄이 없다', async () => {
      const { jobs } = setup()
      expect((await stateOf(jobs)).rows).toEqual([])
    })
  })

  describe('AC-014.4 store.load의 고친 메모를 메모 함수에 잇는다', () => {
    it('AC-014.4: 고친 메모는 그대로 두고 그 글로 비교한다', async () => {
      const made = await withMemos([memoRow(B, '고친 글')])
      await givePart(made.jobs, 'store', 's1', storeJson({ drafts: { [B.key]: '고친 글' } }), 1)
      const row = (await stateOf(made.jobs)).rows.find((r) => r.key === B.key)!
      expect(row).toMatchObject({ text: '고친 글', compare: '같음' })
    })

    it('AC-014.11: jobs.check는 넘기지 않아도 받아 둔 고친 메모를 쓰고, 넘기면 넘긴 것을 쓴다', async () => {
      const made = await loaded()
      await givePart(made.jobs, 'store', 's1', storeJson({ drafts: { [B.key]: '고친 글' } }), 1)
      const tables = await tablesValue()
      const month = made.jobs.month()!
      const textOf = (view: ReturnType<Jobs['check']>) => view.visits.find((visit) => visit.key === B.key)!.memo
      expect(textOf(made.jobs.check(month, tables, NO_SETTINGS, { phrases: ourClinicPhrases() }))).toMatchObject({ text: '고친 글', edited: true })
      expect(textOf(made.jobs.check(month, tables, NO_SETTINGS, { phrases: ourClinicPhrases(), saved: new Map([[B.key, '넘긴 글']]) }))).toMatchObject({ text: '넘긴 글', edited: true })
      expect(textOf(made.jobs.check(month, tables, NO_SETTINGS, made.jobs.memoInput(ourClinicPhrases())))).toMatchObject({ text: '고친 글', edited: true })
    })

    it('AC-014.11: 완료한 메모의 글도 그대로 두고, 같은 진료에 고친 글이 있으면 고친 글이 앞선다', async () => {
      const made = await loaded()
      await givePart(made.jobs, 'store', 's1', storeJson({ drafts: { [A.key]: '나중에 고친 글' }, done: { [A.key]: '완료 때 글', [B.key]: '완료 때 글', [C.key]: true } }), 1)
      const state = await stateOf(made.jobs)
      const textOf = (key: string) => state.rows.find((row) => row.key === key)!
      expect(textOf(A.key)).toMatchObject({ text: '나중에 고친 글' })
      expect(textOf(B.key)).toMatchObject({ text: '완료 때 글' })
      // 글 없는 완료 표시는 글이 아니다
      expect(textOf(C.key).text).not.toBe('true')
    })

    it('AC-016.3: 입력 기록의 skippedByHand는 store.load로 알고, 승인 없이 넣지 않는다', async () => {
      const made = await withMemos([memoRow(A, '비트 메모'), memoRow(B, '비트 메모')])
      await givePart(made.jobs, 'store', 's1', storeJson({ journal: { [A.key]: 'skippedByHand', [B.key]: 'done' } }), 1)
      const on = await stateOf(made.jobs)
      expect(on.plan.skipped).toContainEqual({ key: A.key, reason: '이미 있음' })
      expect(on.plan.batch.find((row) => row.key === B.key)?.replaces).toBe('비트 메모')
      const approved = await stateOf(made.jobs, { approved: new Map([[A.key, '비트 메모']]) })
      expect(approved.plan.batch.find((row) => row.key === A.key)?.replaces).toBe('비트 메모')
    })

    it('AC-016.3: memoState의 declined를 받으면 그 사람은 묶음에 없다', async () => {
      const { jobs } = await withMemos([memoRow(A, '비트 메모'), memoRow(B, '비트 메모')])
      const state = await stateOf(jobs, { declined: new Set([A.key]) })
      expect(state.plan.skipped).toContainEqual({ key: A.key, reason: '이미 있음' })
      expect(state.plan.batch.find((row) => row.key === B.key)?.replaces).toBe('비트 메모')
    })

    it('AC-016.5: 새 loadStart는 전에 받은 비트 메모·고친 메모·입력 기록을 모두 버린다', async () => {
      const made = await withMemos([memoRow(A, '비트 메모')])
      await givePart(made.jobs, 'store', 's1', storeJson({ drafts: { [B.key]: '고친 글' }, journal: { [A.key]: 'skippedByHand' } }), 1)
      await loadInto(made.jobs, 'month2', MEMO_MONTH, 2)
      const state = await stateOf(made.jobs)
      expect(compareOf(state, A.key)).toBe('조회 못함')
      expect(state.rows.find((row) => row.key === A.key)).not.toHaveProperty('lastJournal')
      expect(state.rows.find((row) => row.key === B.key)?.text).not.toBe('고친 글')
      expect(made.jobs.memoInput(null).saved?.size).toBe(0)
    })
  })

  describe('AC-016.7 비트 메모 다시 불러오기', () => {
    const FIRST = [memoRow(A, '처음 메모')]
    const SECOND = [memoRow(A, '두 번째 메모'), memoRow(B, '두 번째 메모')]
    const THIRD = [memoRow(A, '세 번째 메모')]

    it('AC-016.7: 성공하면 비트 메모를 통째로 바꾸고 비교·입력 대상·날짜별 수가 새 값이다. 달과 점검 결과는 그대로다', async () => {
      const { posts, jobs } = await withMemos(FIRST)
      const tables = await tablesValue()
      const month = jobs.month()
      const checkBefore = jobs.check(month!, tables, NO_SETTINGS, { phrases: ourClinicPhrases() })
      const before = await stateOf(jobs)
      expect(before.rows.find((row) => row.key === A.key)?.inBit).toBe('처음 메모')
      expect(compareOf(before, B.key)).toBe('비트에 없음')

      await reloadStart(jobs, 1)
      expect(posts).toEqual([]) // 답 없음
      await giveReload(jobs, 'r1', memosJson(SECOND), 1, 1)
      expect(posts).toStrictEqual([{ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1, ok: true }])
      expectNoPatientText(posts)

      const after = await stateOf(jobs)
      expect(after.rows.find((row) => row.key === A.key)?.inBit).toBe('두 번째 메모')
      expect(compareOf(after, B.key)).toBe('다름')
      expect(after.plan.batch.find((row) => row.key === A.key)?.replaces).toBe('두 번째 메모')
      expect(after.plan.batch.find((row) => row.key === B.key)?.replaces).toBe(SECOND.find((row) => row.v === B.key)?.m)
      expect(after.plan.skipped).not.toContainEqual({ key: B.key, reason: '이미 있음' })
      expect(after.days[0].already).toBe(before.days[0].already + 1)

      expect(jobs.month()).toBe(month)
      expect(jobs.check(month!, tables, NO_SETTINGS, { phrases: ourClinicPhrases() })).toEqual(checkBefore)
    })

    it('AC-016.7: 통째로 바꾼다: 새 자료에 줄이 없는 진료는 비트에 없음이다(섞지 않는다)', async () => {
      const { jobs } = await withMemos(SECOND)
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson(THIRD), 1, 1)
      expect(compareOf(await stateOf(jobs), B.key)).toBe('비트에 없음')
    })

    it('AC-016.7: 겹치면 늦게 끝난 옛 번호가 새 답을 덮지 않는다(새 번호가 먼저 끝남)', async () => {
      const { posts, jobs } = await withMemos(FIRST)
      await reloadStart(jobs, 1)
      await stream(jobs, 'r1', memosJson(SECOND))
      await reloadStart(jobs, 2)
      await giveReload(jobs, 'r2', memosJson(THIRD), 1, 2)
      await askReload(jobs, 'r1', 1, 1)
      expect(posts).toEqual([
        { type: 'loadPart', part: 'memos', id: 'r2', load: 1, run: 2, ok: true },
        { type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
      ])
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)?.inBit).toBe('세 번째 메모')
    })

    it('AC-016.7: 겹치면 먼저 끝난 옛 번호도 받지 않는다(옛 번호가 먼저 끝남)', async () => {
      const { posts, jobs } = await withMemos(FIRST)
      await reloadStart(jobs, 1)
      await reloadStart(jobs, 2)
      await giveReload(jobs, 'r1', memosJson(SECOND), 1, 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)?.inBit).toBe('처음 메모')
      await giveReload(jobs, 'r2', memosJson(THIRD), 1, 2)
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)?.inBit).toBe('세 번째 메모')
    })

    it('AC-016.7: 번호는 take가 끝난 뒤에 본다: 기다리는 동안 새 번호가 오면 받지 않는다', async () => {
      const { posts, jobs } = await withMemos(FIRST)
      await reloadStart(jobs, 1)
      const asked = askReload(jobs, 'r1', 1, 1)
      await reloadStart(jobs, 2)
      await stream(jobs, 'r1', memosJson(SECOND))
      await asked
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)?.inBit).toBe('처음 메모')
    })

    it('AC-016.7: 옛 load의 run은 ok:false이고, memoReloadStart가 없는 run도 ok:false다', async () => {
      const { posts, jobs } = await withMemos(FIRST, 2)
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson(SECOND), 1, 1)
      await giveReload(jobs, 'r2', memosJson(SECOND), 2, 9)
      expect(posts).toEqual([
        { type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1, ok: false, code: 'E-CLAIM-PARTIAL' },
        { type: 'loadPart', part: 'memos', id: 'r2', load: 2, run: 9, ok: false, code: 'E-CLAIM-PARTIAL' },
      ])
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)?.inBit).toBe('처음 메모')
    })

    it('AC-016.7: 새 loadStart는 run을 지워 진행 중인 다시 불러오기를 버린다', async () => {
      const { posts, jobs } = await withMemos(FIRST)
      await reloadStart(jobs, 1)
      await loadStart(jobs, 2)
      await giveReload(jobs, 'r1', memosJson(SECOND), 2, 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'r1', load: 2, run: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
    })

    it('AC-016.7: memoReloadStart 뒤에 온 run 없는 memos는 찾아 버리고 ok:false이며 자료가 그대로다', async () => {
      const { posts, jobs } = await loaded()
      await stream(jobs, 'c1', memosJson(FIRST))
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson(SECOND), 1, 1)
      posts.length = 0
      await askPart(jobs, 'memos', 'c1', 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'c1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)).toMatchObject({ compare: '조회 못함' })
      // 찾아 버렸으므로 다시 물어도 없다
      await askReload(jobs, 'c1', 1, 1)
      expect(posts.at(-1)).toEqual({ type: 'loadPart', part: 'memos', id: 'c1', load: 1, run: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-016.7: 기다리는 동안 memoReloadStart가 오면 run 없는 memos도 받지 않는다', async () => {
      const { posts, jobs } = await withMemos(FIRST)
      const asked = askPart(jobs, 'memos', 'c2', 1)
      await reloadStart(jobs, 1)
      await stream(jobs, 'c2', memosJson(SECOND))
      await asked
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'c2', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' }])
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)?.inBit).toBe('처음 메모')
    })

    it('AC-016.7: memoReloadStart 뒤에도 run 없는 store는 AC-016.5 그대로 받는다', async () => {
      const { posts, jobs } = await withMemos(FIRST)
      await reloadStart(jobs, 1)
      await givePart(jobs, 'store', 's1', storeJson({ drafts: { [B.key]: '고친 글' } }), 1)
      expect(posts).toEqual([{ type: 'loadPart', part: 'store', id: 's1', load: 1, ok: true }])
      expect((await stateOf(jobs)).rows.find((row) => row.key === B.key)?.text).toBe('고친 글')
    })

    it('AC-016.7: 새 loadStart 뒤에는 run 없는 memos를 다시 받는다', async () => {
      const { posts, jobs } = await withMemos(FIRST)
      await reloadStart(jobs, 1)
      await loadInto(jobs, 'month2', MEMO_MONTH, 2)
      posts.length = 0
      await givePart(jobs, 'memos', 'c2', memosJson(SECOND), 2)
      expect(posts).toEqual([{ type: 'loadPart', part: 'memos', id: 'c2', load: 2, ok: true }])
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)?.inBit).toBe('두 번째 메모')
    })

    it('AC-016.7: 마지막 [자료 불러오기]에서 조회 못함이던 진료는 성공해도 그대로이고, 새 [자료 불러오기]로만 다시 본다', async () => {
      const mismatch = memoRow({ key: A.key, chart: '900099' }, '남의 메모')
      const { jobs } = await withMemos([mismatch])
      expect(compareOf(await stateOf(jobs), A.key)).toBe('조회 못함')
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson(SECOND), 1, 1)
      const after = await stateOf(jobs)
      expect(compareOf(after, A.key)).toBe('조회 못함')
      expect(after.rows.find((row) => row.key === A.key)).not.toHaveProperty('inBit')
      expect(compareOf(after, B.key)).toBe('다름')

      await loadInto(jobs, 'month2', MEMO_MONTH, 2)
      await givePart(jobs, 'memos', 'c2', memosJson(SECOND), 2)
      expect(compareOf(await stateOf(jobs), A.key)).toBe('다름')
    })

    it('AC-016.7: 처음에 비트 메모를 받지 못한 불러오기는 다시 불러오기가 성공해도 모두 조회 못함이다', async () => {
      const { jobs } = await loaded()
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson(SECOND), 1, 1)
      expect(new Set((await stateOf(jobs)).rows.map((row) => row.compare))).toEqual(new Set(['조회 못함']))
    })

    it('AC-016.7: 성공한 다시 불러오기 뒤에는 다름인 사람의 replaces가 새 글이다', async () => {
      const { jobs } = await withMemos([memoRow(A, '처음 메모'), memoRow(B, '그대로인 메모')])
      const replacesIn = (state: MemoState, key: string) => state.plan.batch.find((row) => row.key === key)?.replaces
      const before = await stateOf(jobs)
      expect([replacesIn(before, A.key), replacesIn(before, B.key)]).toEqual(['처음 메모', '그대로인 메모'])
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson([memoRow(A, '바뀐 메모'), memoRow(B, '그대로인 메모')]), 1, 1)
      const after = await stateOf(jobs)
      expect([replacesIn(after, A.key), replacesIn(after, B.key)]).toEqual(['바뀐 메모', '그대로인 메모'])
    })

    it('AC-016.7: 직접 확인 기록이 있는 사람은 승인한 글이 달라지면 입력 대상에서 빠지고, 글이 그대로면 남는다(AC-018.14)', async () => {
      const { jobs } = await withMemos([memoRow(A, '처음 메모'), memoRow(B, '그대로인 메모')])
      await givePart(jobs, 'store', 's1', storeJson({ journal: { [A.key]: 'skippedByHand', [B.key]: 'skippedByHand' } }), 1)
      const approved = new Map([
        [A.key, '처음 메모'],
        [B.key, '그대로인 메모'],
      ])
      expect((await stateOf(jobs, { approved })).plan.batch.map((row) => row.key)).toEqual(expect.arrayContaining([A.key, B.key]))
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson([memoRow(A, '바뀐 메모'), memoRow(B, '그대로인 메모')]), 1, 1)
      const after = await stateOf(jobs, { approved })
      expect(after.plan.skipped).toContainEqual({ key: A.key, reason: '이미 있음' })
      expect(after.plan.batch.find((row) => row.key === B.key)?.replaces).toBe('그대로인 메모')
    })
  })

  describe('AC-016.8 다시 불러오기가 실패하면 전 결과를 그대로 둔다', () => {
    const FIRST = [memoRow(A, '처음 메모'), memoRow(B, '또 다른 메모')]
    const approved = new Map([[A.key, '처음 메모']])

    it.each<[string, (jobs: Jobs) => Promise<void>, boolean]>([
      ['truncated', (jobs) => giveReload(jobs, 'r1', memosJson([memoRow(A, '일부만')], { truncated: true }), 1, 1), true],
      ['invalidRows', (jobs) => giveReload(jobs, 'r1', memosJson([memoRow(A, '일부만')], { invalidRows: 2 }), 1, 1), true],
      ['깨진 글자', (jobs) => giveReload(jobs, 'r1', 'not json', 1, 1), true],
      [
        'SHA-256 다름',
        async (jobs) => {
          await stream(jobs, 'r1', memosJson([memoRow(A, '일부만')]), createHash('sha256').update('다른 글자').digest('hex'))
          await askReload(jobs, 'r1', 1, 1)
        },
        true,
      ],
      [
        'abort(도우미 오류)',
        async (jobs) => {
          await jobs.fromPort({ type: 'chunk', id: 'r1', seq: 0, data: 'x' })
          await jobs.fromPort({ type: 'abort', id: 'r1', code: 'E-BIT-READ-FAILED' })
          await askReload(jobs, 'r1', 1, 1)
        },
        true,
      ],
      ['stream 거절(id도 조각도 없다)', async () => {}, false],
    ])('AC-016.8: %s면 전 자료·비교·승인·날짜별 수가 그대로다', async (_, fail, answers) => {
      const { posts, jobs } = await withMemos(FIRST)
      const before = await stateOf(jobs, { approved })
      await reloadStart(jobs, 1)
      await fail(jobs)
      if (answers) expect(posts.at(-1)).toEqual({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
      else expect(posts).toEqual([])
      expect(await stateOf(jobs, { approved })).toEqual(before)
      expect(before.plan.batch.find((row) => row.key === A.key)?.replaces).toBe('처음 메모')
    })

    it('AC-016.8: 실패한 뒤 다음 번호가 성공하면 그때 바뀐다', async () => {
      const { jobs } = await withMemos(FIRST)
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson([], { truncated: true }), 1, 1)
      await reloadStart(jobs, 2)
      await giveReload(jobs, 'r2', memosJson([memoRow(A, '새 메모')]), 1, 2)
      expect((await stateOf(jobs)).rows.find((row) => row.key === A.key)?.inBit).toBe('새 메모')
    })

    it('AC-016.8: 전에 받은 자료가 없으면 실패 뒤 모두 조회 못함이다', async () => {
      const { jobs } = await loaded()
      await reloadStart(jobs, 1)
      await giveReload(jobs, 'r1', memosJson([memoRow(A, '일부만')], { truncated: true }), 1, 1)
      const state = await stateOf(jobs)
      expect(new Set(state.rows.map((row) => row.compare))).toEqual(new Set(['조회 못함']))
      expect(state.plan.batch).toEqual([])
    })
  })
})

describe('AC-018.22 precheck.worker 입구: 새 통로', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('AC-018.22: 새 bridge-port를 받으면 jobs에 알린다: 보낸 입력 묶음을 잊어 다음 묶음이 막히지 않고 글자는 새 포트로 나간다', async () => {
    const MONTH = FAKE('claim-month-memo.json')
    const DAY = { from: '2026-10-12', to: '2026-10-12' }
    const SELECT: InputSelection = { mode: 'date', from: DAY.from, to: DAY.to, typed: '', chip: '', kind: 'range', day: DAY.from, rangeFrom: DAY.from, rangeTo: DAY.to }
    const SETTINGS: CheckSettings = { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: ourClinicPhrases(), dxLinks: [] }
    const { posted, givePort, receive } = await loadWorkerEntry()
    const first = givePort()
    const heardFirst: { cmd?: string }[] = []
    first.onmessage = (event) => heardFirst.push(event.data)
    receive({ type: 'loadStart', load: 1 })
    const { parts, end } = chunked(MONTH, 4096)
    parts.forEach((data, seq) => first.postMessage({ type: 'chunk', id: 'm', seq, data }))
    first.postMessage({ type: 'end', id: 'm', ...end })
    receive({ type: 'month', id: 'm', load: 1 })
    await vi.waitFor(() => expect(posted.at(-1)).toMatchObject({ type: 'month', ok: true }), { timeout: 10_000 })
    const memos = chunked(JSON.stringify({ version: 1, period: DAY, truncated: false, invalidRows: 0, rows: [] }), 4096)
    memos.parts.forEach((data, seq) => first.postMessage({ type: 'chunk', id: 'b', seq, data }))
    first.postMessage({ type: 'end', id: 'b', ...memos.end })
    receive({ type: 'loadPart', part: 'memos', id: 'b', load: 1 })
    await vi.waitFor(() => expect(posted.at(-1)).toMatchObject({ type: 'loadPart', ok: true }), { timeout: 10_000 })
    receive({ type: 'check', check: 1, load: 1, visible: DAY, settings: SETTINGS })
    await vi.waitFor(() => expect(posted.at(-1)).toMatchObject({ type: 'check', ok: true }), { timeout: 20_000 })
    receive({ type: 'buildInputBatch', run: 1, what: 'selection', selection: SELECT })
    await vi.waitFor(() => expect(heardFirst.some((m) => m.cmd === 'bit.input')).toBe(true))
    const second = givePort()
    const heardSecond: { cmd?: string }[] = []
    second.onmessage = (event) => heardSecond.push(event.data)
    receive({ type: 'buildInputBatch', run: 2, what: 'selection', selection: SELECT })
    await vi.waitFor(() => expect(heardSecond.some((m) => m.cmd === 'bit.input')).toBe(true))
    expect(posted.filter((m) => m.type === 'inputStart').map((m) => m.type === 'inputStart' && m.ok)).toEqual([true, true])
    expect(posted.some((m) => (m as { type: string }).type === 'send')).toBe(false)
    first.close()
    second.close()
  }, 60_000)
})

describe('AC-018 메모 화면: Worker가 정하고 보낸다', { timeout: 60_000 }, () => {
  const MEMO_MONTH = FAKE('claim-month-memo.json')
  const DAY = { from: '2026-10-12', to: '2026-10-12' }
  const SETTINGS: CheckSettings = { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: ourClinicPhrases(), dxLinks: [] }
  /** m04·m05·m06: 메모가 있는 진료. m36: 메모가 없는 진료(hasMemo 거짓) */
  const [A, B, C] = [
    { key: 'm04', chart: '900019' },
    { key: 'm05', chart: '900020' },
    { key: 'm06', chart: '900021' },
  ]
  const NO_MEMO = 'm36'
  const SELECT: InputSelection = { mode: 'date', from: DAY.from, to: DAY.to, typed: '', chip: '', kind: 'range', day: DAY.from, rangeFrom: DAY.from, rangeTo: DAY.to }
  const memoRow = (visit: { key: string; chart: string }, m: string): MemoRowRaw => ({ v: visit.key, p: visit.chart, d: DAY.from, m })
  const memosJson = (rows: MemoRowRaw[]) => JSON.stringify({ version: 1, period: DAY, truncated: false, invalidRows: 0, rows } satisfies ClaimMemosJson)
  const storeJson = (work: Partial<StoreMonthJson>) => JSON.stringify({ months: { '2026-10': { drafts: {}, done: {}, journal: {}, ...work } } } satisfies StoreLoadJson)

  type Made = { jobs: Jobs; posts: PrecheckToScreen[]; sent: PrecheckToPort[]; asks: number; runs: number }
  const OCTOBER = { from: '2026-10-01', to: '2026-10-31' }
  async function ready(options: { bit?: MemoRowRaw[]; store?: Partial<StoreMonthJson>; settings?: CheckSettings; visible?: { from: string; to: string }; month?: string } = {}): Promise<Made> {
    const posts: PrecheckToScreen[] = []
    const sent: PrecheckToPort[] = []
    const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables, toPort: (m) => sent.push(m) })
    await loadInto(jobs, 'month', options.month ?? MEMO_MONTH, 1)
    await stream(jobs, 'memos', memosJson(options.bit ?? []))
    await jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos', load: 1 } satisfies PrecheckFromScreen)
    await stream(jobs, 'store', storeJson(options.store ?? {}))
    await jobs.fromScreen({ type: 'loadPart', part: 'store', id: 'store', load: 1 } satisfies PrecheckFromScreen)
    await jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: options.visible ?? DAY, settings: options.settings ?? SETTINGS } satisfies PrecheckFromScreen)
    expect(posts.at(-1)).toMatchObject({ type: 'check', ok: true })
    posts.length = 0
    sent.length = 0
    return { jobs, posts, sent, asks: 0, runs: 0 }
  }
  const viewOf = async (made: Made, selection: InputSelection = SELECT): Promise<MemoScreenView> => {
    const ask = ++made.asks
    await made.jobs.fromScreen({ type: 'memoView', ask, selection } satisfies PrecheckFromScreen)
    const answer = made.posts.filter((m) => m.type === 'memoView' && m.ask === ask).at(-1)
    if (answer?.type !== 'memoView' || !answer.ok) throw new Error('memoView 답이 없다')
    return answer.view
  }
  const keysIn = (view: MemoScreenView, reason: string) => view.targets.left.find((group) => group.reason === reason)?.rows.map((row) => row.key) ?? []
  const batchKeys = (view: MemoScreenView) => view.targets.batch.map((row) => row.key)
  const rowOf = (view: MemoScreenView, key: string) => view.table.find((row) => row.key === key)!
  const sends = (made: Made, cmd: string) => made.sent.filter((m) => m.cmd === cmd)
  type Item = { visitKey: string; chart: string; name: string; date: string; memo: string; replaces?: string; appends?: string; checkedByHand?: boolean }
  /** 단추 하나를 누른다. 보낸 묶음을 돌려준다 */
  const press = async (made: Made, what: Extract<PrecheckFromScreen, { type: 'buildInputBatch' }>['what'] = 'selection', selection: InputSelection = SELECT) => {
    const run = ++made.runs
    made.sent.length = 0
    await made.jobs.fromScreen({ type: 'buildInputBatch', run, what, selection } satisfies PrecheckFromScreen)
    const send = sends(made, 'bit.input').at(-1)
    return { run, ticket: send?.ticket ?? -1, payload: send ? (JSON.parse(send.payload) as { code?: string; items: Item[] }) : null }
  }
  type End = { status: string; code?: string | null; reason?: string | null; fields?: string[]; results?: { visitKey: string; result: string; reason: string; previousMemo?: string }[]; unconfirmed?: { visitKey: string; date: string }[]; noAsk?: boolean }
  let ids = 0
  /** 도우미 끝 JSON이 조각으로 오고 send가 끝난다 */
  const finish = async (made: Made, ticket: number, end: End | string) => {
    const id = `input${++ids}`
    const text = typeof end === 'string' ? end : JSON.stringify({ code: null, reason: null, fields: [], results: [], noAsk: false, ...end })
    await stream(made.jobs, id, text)
    await made.jobs.fromPort({ type: 'sent', ticket, ok: true, id, count: 1 })
    const done = made.posts.filter((m) => m.type === 'inputDone').at(-1)
    if (done?.type !== 'inputDone') throw new Error('inputDone 답이 없다')
    return done
  }
  const line = (visit: { key: string }, result: string, reason: string) => ({ visitKey: visit.key, result, reason })
  const resultOf = (done: Extract<PrecheckToScreen, { type: 'inputDone' }>) => {
    if (!done.ok) throw new Error(done.code)
    return done.result
  }
  /** A·B·C만 입력할 사람인 달: 고른 날의 나머지는 완료 표시로 뺀다 */
  const threeOnly = async (bit: MemoRowRaw[] = []) => {
    const others = batchKeys(await viewOf(await ready())).filter((key) => ![A.key, B.key, C.key].includes(key))
    return ready({ bit, store: { done: Object.fromEntries(others.map((key) => [key, true])) } })
  }
  /** [바꾸지 않기] */
  const decline = (made: Made, key: string) => made.jobs.fromScreen({ type: 'memoApprove', visitKey: key, approved: false } satisfies PrecheckFromScreen)
  const itemIn = (sent: { payload: { items: Item[] } | null }, key: string) => sent.payload?.items.find((item) => item.visitKey === key)
  /** 도우미가 쓰기를 시작해 저장을 확인하지 못한 줄(AC-018.16) */
  const WRITE_STUCK = '입력은 했지만 임시저장 버튼을 누르지 못했습니다. 직접 임시저장을 눌러 주세요.'
  const CHECK_AGAIN = (check: number, settings: unknown = SETTINGS) => ({ type: 'check', check, load: 1, visible: DAY, settings }) as PrecheckFromScreen
  /** 자동 메모 글이 달라지는 설정 */
  const CHANGED: CheckSettings = (() => {
    const phrases = ourClinicPhrases()
    phrases.TPL.mark = '★'
    return { ...SETTINGS, phrases }
  })()
  /** 묻지 않기를 켠 끝 답을 받는다(그 묶음을 보내고 끝낸다) */
  const turnNoAskOn = async (made: Made) => {
    const { ticket } = await press(made)
    return finish(made, ticket, { status: 'finished', noAsk: true })
  }
  /** 화면이 아는 같은 날: 가짜 달에서 B의 진료를 A의 차트번호로 옮긴다. 둘 다 같은 날 메모가 있는 진료다 */
  const SAME_DAY_MONTH = (() => {
    const raw = JSON.parse(MEMO_MONTH) as { s83: Record<string, string>[]; history: Record<string, unknown>[] }
    for (const row of raw.s83) if (row['내원번호'] === B.key) row['차트번호'] = A.chart
    for (const row of raw.history) if (row.v === B.key) row.p = A.chart
    return JSON.stringify(raw)
  })()

  describe('AC-2601 목록 줄에 증상 줄과 처방내역을 싣는다', () => {
    /** A의 증상을 머리말 줄 둘로, 처방을 기타(총투여량 빈칸)·약제·시술·시술·같은 시술·비급여 기타 차례로 바꾼 가짜 달 */
    const CHART_MONTH = (() => {
      const raw = JSON.parse(MEMO_MONTH) as { s83: Record<string, string>[]; s47: Record<string, string>[]; counts: Record<string, number> }
      const [first, second] = raw.s83.filter((row) => row['내원번호'] === A.key)
      first['증상'] = 'S) (R) shoulder pain' // 메모 분석은 '(R)'을 'Rt'로 고쳐 읽지만 목록에는 원문이 간다
      second['증상'] = 'P) Rt SSNB ANB'
      const rx = (code: string, name: string, qty: string, pay = '급여') => ({ 처방코드: code, 처방명칭: name, 차트번호: A.chart, 처방일자: '20261012', 급여구분: pay, 수량: qty })
      raw.s47 = [
        ...raw.s47.filter((row) => row['차트번호'] !== A.chart),
        rx('AA157', '가상진찰료', ''),
        rx('A15', '리도카인주', '0.2'),
        rx('LA247', 'LA247', '1'),
        rx('LA346', 'LA346', '1'),
        rx('LA247', 'LA247', '1'),
        rx('SONO9', '가상비급여초음파', '1', '비급여'),
      ]
      raw.counts.s47 = raw.s47.length
      return JSON.stringify(raw)
    })()
    const targetOf = (view: MemoScreenView, key: string) => [...view.targets.batch, ...view.targets.left.flatMap((group) => group.rows)].find((row) => row.key === key)

    it('AC-2601.1: 증상 줄은 원문을 같은 차례로 담고 줄마다 메모 분석이 본 종류가 붙는다', async () => {
      const row = targetOf(await viewOf(await ready({ month: CHART_MONTH })), A.key)
      expect(row?.chartLines).toEqual([
        { kind: 'subj', text: '(R) shoulder pain' },
        { kind: 'proc', text: 'Rt SSNB ANB' },
      ])
    })

    it('AC-2601.1: 모든 목록 줄에 증상 줄이 있고 종류는 일곱 가지 가운데 하나 또는 null이다', async () => {
      const view = await viewOf(await ready())
      const rows = [...view.targets.batch, ...view.targets.left.flatMap((group) => group.rows)]
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.chartLines.length).toBeGreaterThan(0)
        for (const line of row.chartLines) expect(['subj', 'exam', 'dx', 'img', 'proc', 'rx', 'plan', null]).toContain(line.kind)
      }
    })

    it('AC-2601.2·AC-2601.3: 처방내역은 합치지 않고 시술 → 약제 → 기타, 같은 종류 안은 표 차례이고 총투여량 빈칸은 null', async () => {
      const row = targetOf(await viewOf(await ready({ month: CHART_MONTH })), A.key)
      expect(row?.rxRows).toEqual([
        { kind: 'proc', code: 'LA247', name: 'LA247', short: 'SSNB', qty: 1, benefit: true },
        { kind: 'proc', code: 'LA346', name: 'LA346', short: 'ANB', qty: 1, benefit: true },
        { kind: 'proc', code: 'LA247', name: 'LA247', short: 'SSNB', qty: 1, benefit: true },
        { kind: 'drug', code: 'A15', name: '리도카인주', short: '리도카인', qty: 0.2, benefit: true },
        { kind: 'other', code: 'AA157', name: '가상진찰료', short: '', qty: null, benefit: true },
        { kind: 'other', code: 'SONO9', name: '가상비급여초음파', short: '', qty: 1, benefit: false },
      ])
    })

    it('AC-2603.1: 비트 입력 묶음과 저장에는 증상·처방 글이 없고 칸은 지금 그대로다', async () => {
      const made = await ready({ month: CHART_MONTH })
      expect(targetOf(await viewOf(made), A.key)?.chartLines.length).toBe(2)
      const { payload } = await press(made)
      expect(payload?.items.length).toBeGreaterThan(0)
      for (const item of payload!.items) for (const key of Object.keys(item)) expect(['visitKey', 'chart', 'name', 'date', 'memo', 'replaces', 'checkedByHand']).toContain(key)
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      const [save] = sends(made, 'store.save')
      expect(Object.keys(JSON.parse(save.payload)).sort()).toEqual(['done', 'drafts', 'month'])
      const everything = made.sent.map((m) => JSON.stringify(m)).join('\n')
      for (const text of ['chartLines', 'rxRows', '(R) shoulder pain', '가상진찰료', '가상비급여초음파']) expect(everything).not.toContain(text)
    })
  })

  describe('AC-018.3 묶음은 Worker가 만들어 포트로 보낸다', () => {
    it('AC-018.3·AC-018.26: 목록의 입력할 사람과 묶음이 같고(500명 이하) 화면 메시지에는 묶음 글자가 없다', async () => {
      const made = await ready()
      const view = await viewOf(made)
      expect(batchKeys(view).length).toBeGreaterThan(0)
      expect(batchKeys(view).length).toBeLessThanOrEqual(500) // 넘으면 일부러 빈 묶음이다(AC-018.23)
      const { payload } = await press(made)
      expect(payload?.items.map((item) => item.visitKey)).toEqual(batchKeys(view))
      expect(payload?.items[0]).toEqual({ visitKey: view.targets.batch[0].key, chart: view.targets.batch[0].chart, name: view.targets.batch[0].name, date: DAY.from, memo: view.targets.batch[0].text })
      const start = made.posts.at(-1)
      expect(start).toEqual({ type: 'inputStart', run: 1, ok: true, count: batchKeys(view).length, askPc: true })
    })

    it('AC-018.3: 메모 없는 날에 사람이 친 글은 글자가 있어도 묶음에 없다', async () => {
      const made = await ready({ store: { drafts: { [NO_MEMO]: '사람이 친 글' } } })
      const view = await viewOf(made)
      expect(keysIn(view, 'nomemo')).toContain(NO_MEMO)
      const { payload } = await press(made)
      expect(payload?.items.map((item) => item.visitKey)).not.toContain(NO_MEMO)
    })

    it('AC-018.3: store.load의 완료 표시(글 없는 표시 포함)가 있는 사람은 묶음에 없다', async () => {
      const made = await ready({ store: { done: { [A.key]: true, [B.key]: '완료 때 글' } } })
      const view = await viewOf(made)
      expect(keysIn(view, 'done')).toEqual(expect.arrayContaining([A.key, B.key]))
      expect(batchKeys(view)).not.toContain(A.key)
    })

    it(`AC-018.3: 입력 기록이 done이면 비교가 다름이고 묻지 않기가 켜져 있어도 '이미 입력됨'에 들고 묶음에 없다`, async () => {
      const made = await ready({ bit: [memoRow(A, '완료 때 글')], store: { journal: { [A.key]: 'done' } } })
      const off = await viewOf(made)
      expect(rowOf(off, A.key)).toMatchObject({ compare: '다름', done: true })
      expect(keysIn(off, 'done')).toContain(A.key)
      expect(keysIn(off, 'diff')).not.toContain(A.key)
      await turnNoAskOn(made)
      const on = await viewOf(made)
      expect(on.noAsk).toBe(true)
      expect(rowOf(on, A.key)).toMatchObject({ compare: '다름', done: true })
      expect(keysIn(on, 'done')).toContain(A.key)
      expect(batchKeys(on)).not.toContain(A.key)
      expect((await press(made)).payload?.items.map((item) => item.visitKey)).not.toContain(A.key)
    })

    it('AC-018.10·AC-018.11: 코드 사전 검사는 점검 때 한다: 고를 때마다 사람마다·코드마다 다시 검사하지 않는다', async () => {
      const made = await ready()
      const byCode = (typed: string): InputSelection => ({ ...SELECT, mode: 'code', typed })
      await viewOf(made) // 첫 보기는 메모를 만들며 한 번 검사한다(점검 뒤 한 번뿐)
      vi.mocked(validatePhrases).mockClear()
      for (const typed of ['L', 'LA', 'LA2', 'LA247']) await viewOf(made, byCode(typed))
      expect(validatePhrases).toHaveBeenCalledTimes(0)
      // 점검 한 번에 드는 수는 진료 수와 상관없이 몇 번뿐이다
      await made.jobs.fromScreen(CHECK_AGAIN(2))
      const chips = (await viewOf(made, byCode('LA247'))).targets.chips
      expect(chips.map((chip) => chip.code)).toContain('LA247')
      expect(vi.mocked(validatePhrases).mock.calls.length).toBeLessThanOrEqual(4)
    })

    it('AC-018.3: 처방코드별이면 code와 함께 보내고, 날짜별이면 code가 없다', async () => {
      const made = await ready()
      const code = await press(made, 'selection', { ...SELECT, mode: 'code', chip: 'LA247' })
      expect(code.payload?.code).toBe('LA247')
      expect(code.payload?.items.map((item) => item.visitKey)).toEqual(expect.arrayContaining([A.key, B.key, C.key]))
      await finish(made, code.ticket, { status: 'cancelled' })
      expect((await press(made)).payload).not.toHaveProperty('code')
    })

    it('AC-037.5: 묶음에 묻지 않기 칸이 없다', async () => {
      const made = await ready()
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', noAsk: true })
      const again = await press(made)
      expect(JSON.stringify(again.payload)).not.toContain('noAsk')
    })

    it('AC-018.3: 입력하는 사이 또 누르면 보내지 않는다', async () => {
      const made = await ready()
      await press(made)
      const second = await press(made)
      expect(second.payload).toBeNull()
      expect(made.posts.at(-1)).toMatchObject({ type: 'inputStart', ok: false, code: 'E-BRIDGE-BUSY' })
    })

    it('AC-018.3: 안내가 있어 보낼 수 없으면 보내지 않는다(0명·코드 없음)', async () => {
      const made = await ready()
      const { payload } = await press(made, 'selection', { ...SELECT, mode: 'code' })
      expect(payload).toBeNull()
      expect(made.posts.at(-1)).toMatchObject({ type: 'inputStart', ok: false })
    })
  })

  describe('AC-018.2·AC-014.11 메모 저장', () => {
    it('AC-018.2: 고치면 그 달의 store.save로 저장한다. 파일에 있던 다른 고친 메모도 함께 보낸다. settings·contact와 섞지 않는다', async () => {
      const made = await ready({ store: { drafts: { other: '파일에 있던 글' }, done: { older: '완료 글' } } })
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      const [save] = sends(made, 'store.save')
      expect(JSON.parse(save.payload)).toEqual({ month: '2026-10', drafts: { other: '파일에 있던 글', [A.key]: '고친 글' }, done: { older: '완료 글' } })
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ text: '고친 글', edited: true })
    })

    it('AC-018.2: 저장에 실패하면 값을 그대로 두고 번호를 알리고, 다시 저장할 수 있다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      const [save] = sends(made, 'store.save')
      await made.jobs.fromPort({ type: 'sent', ticket: save.ticket, ok: false, code: 'E-STORE-FAILED' })
      expect(made.posts.at(-1)).toEqual({ type: 'memoSave', ok: false, code: 'E-STORE-FAILED', blocked: false })
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ text: '고친 글', unsaved: true })
      made.sent.length = 0
      await made.jobs.fromScreen({ type: 'memoSaveRetry' } satisfies PrecheckFromScreen)
      const [retry] = sends(made, 'store.save')
      await made.jobs.fromPort({ type: 'sent', ticket: retry.ticket, ok: true })
      expect(made.posts.at(-1)).toEqual({ type: 'memoSave', ok: true })
      expect(rowOf(await viewOf(made), A.key).unsaved).toBe(false)
    })

    it('AC-014.11: 세 메모(손대지 않음·고침·완료)에 설정을 바꿔 다시 점검하면 첫째만 바뀐다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: B.key, text: '사람이 고친 글' } satisfies PrecheckFromScreen)
      const { ticket, payload } = await press(made)
      const doneText = payload!.items.find((item) => item.visitKey === C.key)!.memo
      await finish(made, ticket, { status: 'finished', results: [line(C, '완료', '입력')] })
      const changed = ourClinicPhrases()
      changed.TPL.mark = '★'
      const before = rowOf(await viewOf(made), A.key).text
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: DAY, settings: { ...SETTINGS, phrases: changed } } satisfies PrecheckFromScreen)
      const view = await viewOf(made)
      expect(rowOf(view, A.key).text).not.toBe(before)
      expect(rowOf(view, B.key).text).toBe('사람이 고친 글')
      expect(rowOf(view, C.key).text).toBe(doneText)
    })

    it('AC-014.11: 완료한 메모의 글은 store.save의 done에 글로 남는다(표시만 남기면 다시 불러온 뒤 글이 바뀐다)', async () => {
      const made = await ready()
      const { ticket, payload } = await press(made)
      made.sent.length = 0
      await finish(made, ticket, { status: 'finished', results: [line(A, '완료', '입력')] })
      const text = payload!.items.find((item) => item.visitKey === A.key)!.memo
      const [save] = sends(made, 'store.save')
      expect(JSON.parse(save.payload)).toEqual({ month: '2026-10', drafts: {}, done: { [A.key]: text } })
    })

    it('AC-014.11: 글 없는 완료 표시는 메모를 얼리지 않는다', async () => {
      const made = await ready({ store: { done: { [A.key]: true } } })
      const changed = ourClinicPhrases()
      changed.TPL.mark = '★'
      const before = rowOf(await viewOf(made), A.key).text
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: DAY, settings: { ...SETTINGS, phrases: changed } } satisfies PrecheckFromScreen)
      expect(rowOf(await viewOf(made), A.key).text).not.toBe(before)
    })
  })

  describe('AC-018.2 저장하지 못한 고친 메모를 잃지 않는다', () => {
    const edit = (made: Made, key: string, text: string) => made.jobs.fromScreen({ type: 'editMemo', visitKey: key, text } satisfies PrecheckFromScreen)
    const reloadMonth = async (made: Made, load: number, keepEdits: boolean, store: Partial<StoreMonthJson> | null) => {
      await made.jobs.fromScreen({ type: 'loadStart', load, ...(keepEdits ? { keepEdits: true as const } : {}) } satisfies PrecheckFromScreen)
      await stream(made.jobs, `m${load}`, MEMO_MONTH)
      await made.jobs.fromScreen({ type: 'month', id: `m${load}`, load } satisfies PrecheckFromScreen)
      if (store) {
        await stream(made.jobs, `s${load}`, storeJson(store))
        await made.jobs.fromScreen({ type: 'loadPart', part: 'store', id: `s${load}`, load } satisfies PrecheckFromScreen)
      }
      await made.jobs.fromScreen({ type: 'check', check: load, load, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
    }

    it('AC-018.2: 저장 실패(E-STORE-FAILED) 뒤 [자료 불러오기]를 해도 고친 메모가 남고, 달 칸을 받으면 저장한다', async () => {
      const made = await ready()
      await edit(made, A.key, '고친 글')
      await made.jobs.fromPort({ type: 'sent', ticket: sends(made, 'store.save')[0].ticket, ok: false, code: 'E-STORE-FAILED' })
      made.sent.length = 0
      await reloadMonth(made, 2, true, { drafts: { other: '파일 글' } })
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ text: '고친 글', unsaved: true })
      expect(sends(made, 'store.save').map((m) => JSON.parse(m.payload)).filter((m) => m.month)).toEqual([{ month: '2026-10', drafts: { other: '파일 글', [A.key]: '고친 글' }, done: {} }])
    })

    it('AC-018.2: 저장 답을 받은 글은 남기지 않는다(다시 불러온 파일 값이 앞선다)', async () => {
      const made = await ready()
      await edit(made, A.key, '고친 글')
      await made.jobs.fromPort({ type: 'sent', ticket: sends(made, 'store.save')[0].ticket, ok: true })
      await reloadMonth(made, 2, true, { drafts: { [A.key]: '파일 글' } })
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ text: '파일 글', unsaved: false })
    })

    it('AC-013.6: keepEdits 없는 loadStart(같은 사람·의원이 아니어 버릴 때)는 남기지 않는다', async () => {
      const made = await ready()
      await edit(made, A.key, '고친 글')
      await reloadMonth(made, 2, false, {})
      expect(rowOf(await viewOf(made), A.key).text).not.toBe('고친 글')
    })

    it('AC-013.6: keepEdits 없는 loadStart는 마지막 답의 unconfirmed도 지운다(keepEdits가 있으면 남는다)', async () => {
      const stopped = async () => {
        const made = await ready()
        const first = await press(made)
        await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', unconfirmed: [{ visitKey: 'gone', date: DAY.from }] })
        expect((await viewOf(made)).stuck?.people.map((person) => person.key)).toEqual(['gone'])
        return made
      }
      // 달 칸을 읽지 않은 불러오기로 본다: 읽은 달이면 기록으로 풀리는 것은 따로 시험한다(아래 AC-018.16)
      const kept = await stopped()
      await reloadMonth(kept, 2, true, null)
      expect((await viewOf(kept)).stuck?.people.map((person) => person.key)).toEqual(['gone'])
      const dropped = await stopped()
      await reloadMonth(dropped, 2, false, null)
      expect((await viewOf(dropped)).stuck).toBeNull()
    })

    it('AC-014.11: 글이 같으면 고친 것이 아니다: 저장하지 않아 자동 메모가 얼지 않고 승인도 그대로다', async () => {
      const made = await ready({ bit: [memoRow(A, '비트 글')] })
      await made.jobs.fromScreen({ type: 'memoApprove', visitKey: A.key, approved: true } satisfies PrecheckFromScreen)
      const auto = rowOf(await viewOf(made), A.key).text
      await edit(made, A.key, auto)
      expect(sends(made, 'store.save')).toEqual([])
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ edited: false, unsaved: false })
      expect(view.targets.batch.find((row) => row.key === A.key)?.replaces).toBe('비트 글')
      const changed = ourClinicPhrases()
      changed.TPL.mark = '★'
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: DAY, settings: { ...SETTINGS, phrases: changed } } satisfies PrecheckFromScreen)
      expect(rowOf(await viewOf(made), A.key).text).not.toBe(auto)
    })

    it('AC-014.11: 멈춘 뒤 다시 점검하고 [이어서 하기]를 누르면 지금 글을 보낸다(고친 글은 그대로)', async () => {
      const made = await ready()
      await edit(made, B.key, '사람이 고친 글')
      const first = await press(made)
      const before = first.payload!.items.find((item) => item.visitKey === A.key)!.memo
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '확인 필요', '미처리'), line(B, '확인 필요', '미처리')] })
      const changed = ourClinicPhrases()
      changed.TPL.mark = '★'
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: DAY, settings: { ...SETTINGS, phrases: changed } } satisfies PrecheckFromScreen)
      const shown = rowOf(await viewOf(made), A.key).text
      const resume = await press(made, 'resume')
      expect(shown).not.toBe(before)
      expect(resume.payload?.items.find((item) => item.visitKey === A.key)?.memo).toBe(shown)
      expect(resume.payload?.items.find((item) => item.visitKey === B.key)?.memo).toBe('사람이 고친 글')
    })

    it('AC-018.14: [이어서 하기]는 그새 [바꾸지 않기]를 누른 사람을 보내지 않는다', async () => {
      const made = await ready({ bit: [memoRow(A, '비트 글')] })
      const first = await press(made)
      expect(first.payload?.items.find((item) => item.visitKey === A.key)?.replaces).toBe('비트 글')
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '확인 필요', '미처리')] })
      await made.jobs.fromScreen({ type: 'memoApprove', visitKey: A.key, approved: false } satisfies PrecheckFromScreen)
      const resume = await press(made, 'resume')
      expect(resume.payload?.items.find((item) => item.visitKey === A.key)).toBeUndefined()
    })
  })

  describe('AC-018.5 다시 연 화면', () => {
    it('AC-018.5: 같은 기간을 불러오면 저장해 둔 고친 메모·완료·입력 기록이 이어서 보인다', async () => {
      const made = await ready({ bit: [memoRow(B, '완료 때 글')], store: { drafts: { [A.key]: '고친 글' }, done: { [B.key]: '완료 때 글' }, journal: { [C.key]: 'check' } } })
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ text: '고친 글', edited: true, done: false })
      expect(rowOf(view, B.key)).toMatchObject({ text: '완료 때 글', compare: '같음', done: true })
      expect(rowOf(view, C.key).lastJournal).toBe('check')
    })
  })

  describe('AC-018.17 달 칸의 저장 막힘', () => {
    it('AC-018.17: storeBlock이면 고쳐도 store.save를 부르지 않고 값은 메모리에 있다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'storeBlock' } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      expect(sends(made, 'store.save')).toEqual([])
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ text: '고친 글', unsaved: true })
      await made.jobs.fromScreen({ type: 'memoSaveRetry' } satisfies PrecheckFromScreen)
      expect(sends(made, 'store.save')).toEqual([])
    })

    it('AC-018.17: store.save가 E-BIT-HOSPITAL-MISMATCH로 거절되면 막힘을 알리고 다음부터 부르지 않는다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      await made.jobs.fromPort({ type: 'sent', ticket: sends(made, 'store.save')[0].ticket, ok: false, code: 'E-BIT-HOSPITAL-MISMATCH' })
      expect(made.posts.at(-1)).toEqual({ type: 'memoSave', ok: false, code: 'E-BIT-HOSPITAL-MISMATCH', blocked: true })
      made.sent.length = 0
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: B.key, text: '또 고친 글' } satisfies PrecheckFromScreen)
      expect(sends(made, 'store.save')).toEqual([])
    })

    it('AC-018.17: 막힌 채 [자료 불러오기]가 또 거절되어도 고친 메모는 남고, 달 칸이 다시 읽히면 저장한다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'storeBlock' } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'loadStart', load: 2, keepEdits: true } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'm2', MEMO_MONTH)
      await made.jobs.fromScreen({ type: 'month', id: 'm2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'memos2', memosJson([]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos2', load: 2 } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'storeBlock' } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ text: '고친 글', unsaved: true })
      expect(sends(made, 'store.save').map((m) => JSON.parse(m.payload))).toEqual([{ settings: SETTINGS }])

      await made.jobs.fromScreen({ type: 'loadStart', load: 3, keepEdits: true } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'm3', MEMO_MONTH)
      await made.jobs.fromScreen({ type: 'month', id: 'm3', load: 3 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'store3', storeJson({ drafts: { other: '파일 글' } }))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'store', id: 'store3', load: 3 } satisfies PrecheckFromScreen)
      made.sent.length = 0
      await made.jobs.fromScreen({ type: 'check', check: 3, load: 3, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      const months = sends(made, 'store.save').map((m) => JSON.parse(m.payload)).filter((m) => m.month)
      expect(months).toEqual([{ month: '2026-10', drafts: { other: '파일 글', [A.key]: '고친 글' }, done: {} }])
    })

    it('AC-013.9: 설정 사본 저장 실패는 화면에 알리지 않는다(settings.dat의 같은 번호도 조용히 건너뛴다)', async () => {
      const posts: PrecheckToScreen[] = []
      const sent: PrecheckToPort[] = []
      const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables, toPort: (m) => sent.push(m) })
      await loadInto(jobs, 'month', MEMO_MONTH, 1)
      await jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      await jobs.fromPort({ type: 'sent', ticket: sent[0].ticket, ok: false, code: 'E-BIT-HOSPITAL-MISMATCH' })
      expect(posts.some((m) => m.type === 'memoSave')).toBe(false)
    })
  })

  describe('AC-018.14 [바꾸지 않기]와 직접 확인 기록의 승인', () => {
    const FIRST = [memoRow(A, '처음 메모')]
    /** 직접 확인 기록이 남은 사람: 이 사람의 승인만 전 규칙 그대로다(AC-018.14) */
    const HAND = { journal: { [A.key]: 'skippedByHand', [B.key]: 'skippedByHand' } }
    const approve = (made: Made, key: string, approved = true) => made.jobs.fromScreen({ type: 'memoApprove', visitKey: key, approved } satisfies PrecheckFromScreen)
    const reload = async (made: Made, run: number, text: string) => {
      await made.jobs.fromScreen({ type: 'memoReloadStart', run } satisfies PrecheckFromScreen)
      await stream(made.jobs, `r${run}`, text)
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: `r${run}`, load: 1, run } satisfies PrecheckFromScreen)
    }
    const batchRow = (view: MemoScreenView, key: string) => view.targets.batch.find((row) => row.key === key)

    it(`AC-018.14: 다른 메모는 승인 없이 '메모 바꿈'으로 들고, [바꾸지 않기]는 '다른 메모 있음'으로 옮기고, [이 메모로 바꾸기]로 돌아오면 지금 글을 replaces로 든다`, async () => {
      const made = await ready({ bit: FIRST })
      const before = await viewOf(made)
      expect(batchRow(before, A.key)).toMatchObject({ replaces: '처음 메모', chip: '메모 바꿈' })
      expect(before.targets.replacing).toBe(1)
      expect(keysIn(before, 'diff')).toEqual([])
      await decline(made, A.key)
      const out = await viewOf(made)
      expect(keysIn(out, 'diff')).toEqual([A.key])
      expect(batchRow(out, A.key)).toBeUndefined()
      expect(out.targets.replacing).toBe(0)
      await reload(made, 1, memosJson([memoRow(A, '바뀐 메모')]))
      await approve(made, A.key)
      const back = await viewOf(made)
      expect(batchRow(back, A.key)).toMatchObject({ replaces: '바뀐 메모', chip: '메모 바꿈' })
      expect(keysIn(back, 'diff')).toEqual([])
    })

    it('AC-018.14: [바꾸지 않기]를 누른 사람은 [비트에 입력]·[다시 하기]·[이어서 하기] 묶음에 없다(묻지 않기가 켜져 있어도)', async () => {
      for (const noAsk of [false, true]) {
        const made = await ready({ bit: [memoRow(A, '다른 메모'), memoRow(B, '다른 메모')] })
        if (noAsk) await turnNoAskOn(made)
        expect((await viewOf(made)).noAsk).toBe(noAsk)
        // [다시 하기]: A·C가 내원일 없음으로 건너뜀. [이어서 하기]: B가 미처리이고 나머지는 줄이 없다
        const first = await press(made)
        expect(itemIn(first, A.key)?.replaces).toBe('다른 메모')
        await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', noAsk, results: [line(A, '건너뜀', '내원일 없음'), line(C, '건너뜀', '내원일 없음'), line(B, '확인 필요', '미처리')] })
        await decline(made, A.key)
        await decline(made, B.key)
        expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key, B.key])
        const selection = await press(made)
        expect(selection.payload).not.toBeNull()
        expect(itemIn(selection, A.key)).toBeUndefined()
        expect(itemIn(selection, B.key)).toBeUndefined()
        await made.jobs.fromPort({ type: 'sent', ticket: selection.ticket, ok: false, code: 'E-BIT-READ-FAILED' })
        const retry = await press(made, 'retry')
        expect(retry.payload?.items.map((item) => item.visitKey)).toEqual([C.key])
        await made.jobs.fromPort({ type: 'sent', ticket: retry.ticket, ok: false, code: 'E-BIT-READ-FAILED' })
        const resume = await press(made, 'resume')
        expect(resume.payload).not.toBeNull()
        expect(itemIn(resume, A.key)).toBeUndefined()
        expect(itemIn(resume, B.key)).toBeUndefined()
      }
    })

    it('AC-018.14: [바꾸지 않기]는 우리 메모·비트 메모 글이 달라져도 그대로이고 새 [자료 불러오기]가 지운다', async () => {
      const made = await ready({ bit: FIRST })
      await decline(made, A.key)
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
      await made.jobs.fromScreen(CHECK_AGAIN(2, CHANGED))
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
      await reload(made, 1, memosJson([memoRow(A, '바뀐 메모')]))
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
      // 바꿀 메모가 없으면 표시와 상관없이 그 비교대로다
      await reload(made, 2, memosJson([]))
      const gone = await viewOf(made)
      expect(keysIn(gone, 'diff')).toEqual([])
      expect(batchRow(gone, A.key)).toMatchObject({ chip: '새 메모' })
      expect(batchRow(gone, A.key)).not.toHaveProperty('replaces')
      await reload(made, 3, memosJson([memoRow(A, '고친 글')]))
      expect(keysIn(await viewOf(made), 'done')).toContain(A.key)
      // 다시 다름이 되면 또 빠진다
      await reload(made, 4, memosJson([memoRow(A, '또 다른 메모')]))
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
      for (const keepEdits of [false, true]) {
        const again = await ready({ bit: FIRST })
        await decline(again, A.key)
        await again.jobs.fromScreen({ type: 'loadStart', load: 2, ...(keepEdits ? { keepEdits } : {}) } satisfies PrecheckFromScreen)
        await stream(again.jobs, 'month2', MEMO_MONTH)
        await again.jobs.fromScreen({ type: 'month', id: 'month2', load: 2 } satisfies PrecheckFromScreen)
        await stream(again.jobs, 'memos2', memosJson(FIRST))
        await again.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos2', load: 2 } satisfies PrecheckFromScreen)
        await again.jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
        expect(batchRow(await viewOf(again), A.key)).toMatchObject({ replaces: '처음 메모', chip: '메모 바꿈' })
      }
    })

    it('AC-018.14: 쓰다 멈춘 사람은 [바꾸지 않기]여도 replaces 없이 [이어서 하기]·[이어서 입력] 묶음에 있다', async () => {
      const made = await threeOnly([memoRow(A, '다른 메모')])
      const first = await press(made)
      expect(itemIn(first, A.key)?.replaces).toBe('다른 메모')
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', reason: WRITE_STUCK, results: [line(A, '확인 필요', WRITE_STUCK), line(B, '확인 필요', '미처리')] })
      await decline(made, A.key)
      const resume = await press(made, 'resume')
      expect(resume.payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key, C.key])
      expect(itemIn(resume, A.key)).not.toHaveProperty('replaces')
      await finish(made, resume.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', reason: WRITE_STUCK, results: [line(A, '확인 필요', WRITE_STUCK)] })
      const go = await press(made, 'continueStuck')
      expect(go.payload?.items.map((item) => item.visitKey)).toEqual([A.key])
      expect(itemIn(go, A.key)).not.toHaveProperty('replaces')
      expect(itemIn(go, A.key)).not.toHaveProperty('checkedByHand')
    })

    it('AC-018.14: 고른 기간이 바뀌어 줄이 없어도 [바꾸지 않기]를 누른 사람은 [이어서 하기]에 없고, 누르지 않은 사람은 보낸 replaces 그대로다', async () => {
      const made = await ready({ visible: OCTOBER, bit: [memoRow(A, '비트 글'), memoRow(B, '비트 글')] })
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '확인 필요', '미처리'), line(B, '확인 필요', '미처리')] })
      await decline(made, A.key)
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: { from: '2026-10-13', to: '2026-10-14' }, settings: SETTINGS } satisfies PrecheckFromScreen)
      const resume = await press(made, 'resume')
      expect(itemIn(resume, A.key)).toBeUndefined()
      expect(itemIn(resume, B.key)?.replaces).toBe('비트 글')
    })

    it('AC-018.21: [이어서 하기]에서 쓰다 멈춘 사람은 [바꾸지 않기]를 누르지 않았어도 replaces 없이 간다(AC-017.7)', async () => {
      const made = await threeOnly([memoRow(A, '다른 메모')])
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', reason: WRITE_STUCK, results: [line(A, '확인 필요', WRITE_STUCK), line(B, '확인 필요', '미처리')] })
      const resume = await press(made, 'resume')
      expect(itemIn(resume, A.key)).not.toHaveProperty('replaces')
    })

    it('AC-018.16: [이어서 입력] 묶음에는 replaces가 없다(승인·기본 길 모두)', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모'), memoRow(B, '다른 메모')], store: { journal: { [A.key]: 'writing', [B.key]: 'writeUnconfirmed' } } })
      await approve(made, A.key)
      const go = await press(made, 'continueStuck')
      expect(go.payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key])
      expect(go.payload?.items.some((item) => 'replaces' in item)).toBe(false)
    })

    it('AC-016.3: [직접 확인했어요]로 보낸 사람은 사본을 적지 못한 답(unconfirmed) 뒤에도 다음 묶음에 없다(묻지 않기가 켜져 있어도)', async () => {
      const made = await ready({ bit: FIRST })
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', unconfirmed: [{ visitKey: A.key, date: DAY.from }, { visitKey: B.key, date: DAY.from }] })
      const hand = await press(made, 'byHand')
      expect(hand.payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key])
      await finish(made, hand.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '건너뜀', '이미 있음')], unconfirmed: [{ visitKey: B.key, date: DAY.from }] })
      expect(rowOf(await viewOf(made), A.key)).not.toHaveProperty('lastJournal')
      const handB = await press(made, 'byHand')
      await finish(made, handB.ticket, { status: 'finished', noAsk: true, results: [line(B, '건너뜀', '이미 있음')] })
      const view = await viewOf(made)
      expect(view.noAsk).toBe(true)
      expect(view.stuck).toBeNull()
      expect(rowOf(view, A.key)).not.toHaveProperty('lastJournal')
      expect(keysIn(view, 'diff')).toEqual([A.key])
      const next = await press(made)
      expect(itemIn(next, A.key)).toBeUndefined()
      await made.jobs.fromPort({ type: 'sent', ticket: next.ticket, ok: false, code: 'E-BIT-READ-FAILED' })
      // 사람이 [이 메모로 바꾸기]를 누르면 지금 글을 replaces로 든다
      await approve(made, A.key)
      expect(itemIn(await press(made), A.key)?.replaces).toBe('처음 메모')
    })

    it('AC-016.8: 실패한 다시 불러오기는 [바꾸지 않기]·[이 메모로 바꾸기]와 replaces를 그대로 둔다', async () => {
      const made = await ready({ bit: [memoRow(A, '처음 메모'), memoRow(B, '또 다른 메모')] })
      await decline(made, A.key)
      await reload(made, 1, JSON.stringify({ version: 1, period: DAY, truncated: true, invalidRows: 0, rows: [] }))
      const failed = await viewOf(made)
      expect(keysIn(failed, 'diff')).toEqual([A.key])
      expect(batchRow(failed, B.key)?.replaces).toBe('또 다른 메모')
      await approve(made, A.key)
      await reload(made, 2, 'not json')
      expect(batchRow(await viewOf(made), A.key)?.replaces).toBe('처음 메모')
    })

    it('AC-016.7: 비트 글이 바뀌면 묶음의 replaces가 새 글이다', async () => {
      const made = await ready({ bit: FIRST })
      expect(batchRow(await viewOf(made), A.key)?.replaces).toBe('처음 메모')
      await reload(made, 1, memosJson([memoRow(A, '바뀐 메모')]))
      expect(batchRow(await viewOf(made), A.key)?.replaces).toBe('바뀐 메모')
      expect(itemIn(await press(made), A.key)?.replaces).toBe('바뀐 메모')
    })

    it('AC-018.14: 직접 확인 기록이 있는 사람: 누르면 보인 비트 메모를 replaces로 담아 입력할 사람으로 옮기고, [바꾸지 않기]는 푼다', async () => {
      const made = await ready({ bit: FIRST, store: HAND })
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
      await approve(made, A.key)
      const view = await viewOf(made)
      expect(batchRow(view, A.key)).toMatchObject({ replaces: '처음 메모', chip: '메모 바꿈' })
      await approve(made, A.key, false)
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
    })

    it('AC-018.14: 직접 확인 기록이 있는 사람은 우리 메모를 고치면 승인이 풀린다', async () => {
      const made = await ready({ bit: FIRST, store: HAND })
      await approve(made, A.key)
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
    })

    it('AC-018.14: 직접 확인 기록이 있는 사람: 성공한 다시 불러오기는 글이 달라진 사람만 푼다', async () => {
      const made = await ready({ bit: [memoRow(A, '처음 메모'), memoRow(B, '그대로인 메모')], store: HAND })
      await approve(made, A.key)
      await approve(made, B.key)
      await reload(made, 1, memosJson([memoRow(A, '바뀐 메모'), memoRow(B, '그대로인 메모')]))
      const view = await viewOf(made)
      expect(keysIn(view, 'diff')).toContain(A.key)
      expect(batchRow(view, B.key)?.replaces).toBe('그대로인 메모')
    })

    it('AC-018.14: 직접 확인 기록이 있는 사람: 글이 X→Y→X로 돌아와도 풀린 승인은 되살아나지 않는다', async () => {
      const made = await ready({ bit: FIRST, store: HAND })
      await approve(made, A.key)
      await reload(made, 1, memosJson([memoRow(A, '바뀐 메모')]))
      await reload(made, 2, memosJson([memoRow(A, '처음 메모')]))
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
    })

    it('AC-016.8: 직접 확인 기록이 있는 사람: 실패한 다시 불러오기·옛 번호는 승인을 풀지 않는다', async () => {
      const made = await ready({ bit: FIRST, store: HAND })
      await approve(made, A.key)
      await reload(made, 1, JSON.stringify({ version: 1, period: DAY, truncated: true, invalidRows: 0, rows: [] }))
      await made.jobs.fromScreen({ type: 'memoReloadStart', run: 3 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'old', memosJson([]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'old', load: 1, run: 2 } satisfies PrecheckFromScreen)
      expect(batchRow(await viewOf(made), A.key)?.replaces).toBe('처음 메모')
    })

    it(`AC-018.14: 직접 확인 기록이 있는 사람: [다시 점검]으로 자동 메모 글이 달라지면 승인이 풀려 '다른 메모 있음'으로 돌아가고, 글이 돌아와도 되살아나지 않는다`, async () => {
      const made = await ready({ bit: FIRST, store: HAND })
      await approve(made, A.key)
      const before = rowOf(await viewOf(made), A.key).text
      await made.jobs.fromScreen(CHECK_AGAIN(2, CHANGED))
      const view = await viewOf(made)
      expect(rowOf(view, A.key).text).not.toBe(before)
      expect(keysIn(view, 'diff')).toEqual([A.key])
      expect(batchKeys(view)).not.toContain(A.key)
      await made.jobs.fromScreen(CHECK_AGAIN(3))
      const back = await viewOf(made)
      expect(rowOf(back, A.key).text).toBe(before)
      expect(keysIn(back, 'diff')).toEqual([A.key])
      expect((await press(made)).payload?.items.map((item) => item.visitKey)).not.toContain(A.key)
    })

    it('AC-018.14: 직접 확인 기록이 있는 사람: [다시 점검]해도 글이 그대로이면(고친 메모 포함) 승인 그대로다', async () => {
      const made = await ready({ bit: [memoRow(A, '처음 메모'), memoRow(B, '다른 메모')], store: { ...HAND, drafts: { [B.key]: '사람이 고친 글' } } })
      await approve(made, A.key)
      await approve(made, B.key)
      await made.jobs.fromScreen(CHECK_AGAIN(2))
      const same = await viewOf(made)
      expect(batchRow(same, A.key)?.replaces).toBe('처음 메모')
      expect(batchRow(same, B.key)?.replaces).toBe('다른 메모')
      await made.jobs.fromScreen(CHECK_AGAIN(3, CHANGED))
      const changed = await viewOf(made)
      expect(rowOf(changed, B.key).text).toBe('사람이 고친 글')
      expect(batchRow(changed, B.key)?.replaces).toBe('다른 메모')
      expect(keysIn(changed, 'diff')).toEqual([A.key])
    })

    it('AC-018.14: 직접 확인 기록이 있는 사람: 실패한 [다시 점검]은 승인을 풀지 않는다', async () => {
      const made = await ready({ bit: FIRST, store: HAND })
      await approve(made, A.key)
      await made.jobs.fromScreen(CHECK_AGAIN(2, {}))
      expect(made.posts.filter((m) => m.type === 'check').at(-1)).toMatchObject({ check: 2, ok: false })
      expect(batchRow(await viewOf(made), A.key)?.replaces).toBe('처음 메모')
    })

    it(`AC-018.14·AC-016.3: 기록이 없는 사람은 [다시 점검]으로 자동 메모 글이 달라져도 '메모 바꿈'으로 남고 replaces는 지금 글이다(묻지 않기가 켜져 있어도)`, async () => {
      const made = await ready({ bit: FIRST })
      await turnNoAskOn(made)
      expect(batchRow(await viewOf(made), A.key)?.replaces).toBe('처음 메모')
      await made.jobs.fromScreen(CHECK_AGAIN(2, CHANGED))
      const row = batchRow(await viewOf(made), A.key)
      expect(row).toMatchObject({ chip: '메모 바꿈', replaces: '처음 메모' })
      expect(itemIn(await press(made), A.key)?.replaces).toBe('처음 메모')
    })

    it(`AC-018.14·AC-016.3: 직접 확인 기록이 있는 사람은 [다시 점검]으로 풀리면 묻지 않기가 켜져 있어도 '다른 메모 있음'으로 돌아간다`, async () => {
      const made = await ready({ bit: FIRST, store: HAND })
      await turnNoAskOn(made)
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
      await approve(made, A.key)
      expect(batchKeys(await viewOf(made))).toContain(A.key)
      await made.jobs.fromScreen(CHECK_AGAIN(2, CHANGED))
      const view = await viewOf(made)
      expect(keysIn(view, 'diff')).toEqual([A.key])
      expect(batchKeys(view)).not.toContain(A.key)
    })

    it('AC-018.14: 새 [자료 불러오기]는 승인을 모두 푼다', async () => {
      const made = await ready({ bit: FIRST, store: HAND })
      await approve(made, A.key)
      await loadInto(made.jobs, 'month2', MEMO_MONTH, 2)
      await stream(made.jobs, 'memos2', memosJson(FIRST))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'store2', storeJson(HAND))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'store', id: 'store2', load: 2 } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
    })

    it('AC-018.14: 승인 → 직접 확인 → 다음 묶음에 replaces가 없다', async () => {
      const made = await ready({ bit: FIRST, store: { journal: { [A.key]: 'writeUnconfirmed' } } })
      await approve(made, A.key)
      const hand = await press(made, 'byHand')
      expect(hand.payload?.items).toEqual([expect.objectContaining({ visitKey: A.key, checkedByHand: true })])
      expect(hand.payload?.items[0]).not.toHaveProperty('replaces')
      await finish(made, hand.ticket, { status: 'finished', results: [line(A, '건너뜀', '이미 있음')] })
      const view = await viewOf(made)
      expect(keysIn(view, 'diff')).toContain(A.key)
      const next = await press(made)
      expect(next.payload?.items.find((item) => item.visitKey === A.key)).toBeUndefined()
    })

    it('AC-018.14: 직접 확인으로 건너뛴 사람은 [이 메모로 바꾸기]를 누를 때만 replaces로 들고 [바꾸지 않기]로 되돌린다', async () => {
      const made = await ready({ bit: FIRST, store: { journal: { [A.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'finished', results: [line(A, '건너뜀', '이미 있음')] })
      expect(rowOf(await viewOf(made), A.key).lastJournal).toBe('skippedByHand')
      await approve(made, A.key)
      expect(batchRow(await viewOf(made), A.key)).toMatchObject({ replaces: '처음 메모', chip: '메모 바꿈' })
      await decline(made, A.key)
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
    })

    it('AC-018.14: [직접 확인했어요]를 취소해도 보낼 때 푼 승인은 돌아오지 않는다', async () => {
      const made = await ready({ bit: FIRST, store: { journal: { [A.key]: 'writing' } } })
      await approve(made, A.key)
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'cancelled' })
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
    })

    it('AC-018.14: 바꾼 뒤 끝나면 승인이 남지 않고 줄이 완료로 간다', async () => {
      const made = await ready({ bit: FIRST })
      await approve(made, A.key)
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', results: [{ ...line(A, '완료', '바꿈(기존 메모 덮어씀)'), previousMemo: '처음 메모' }] })
      const view = await viewOf(made)
      expect(keysIn(view, 'done')).toContain(A.key)
    })
  })

  describe('AC-6611.2 [뒤에 붙이기]는 고른 사람만 appends(화면에서 본 비트 메모)로 보낸다', () => {
    const OTHER = [memoRow(A, '다른 메모')]
    const choose = (made: Made, key: string, approved: boolean | 'append') => made.jobs.fromScreen({ type: 'memoApprove', visitKey: key, approved } satisfies PrecheckFromScreen)
    /** '다른 메모 있음'에서 [뒤에 붙이기]: 화면은 [바꾸지 않기]로 옮긴 뒤에 이 단추를 보인다 */
    const appendFromDiff = async (made: Made, key: string) => {
      await decline(made, key)
      await choose(made, key, 'append')
    }
    const reload = async (made: Made, run: number, text: string) => {
      await made.jobs.fromScreen({ type: 'memoReloadStart', run } satisfies PrecheckFromScreen)
      await stream(made.jobs, `r${run}`, text)
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: `r${run}`, load: 1, run } satisfies PrecheckFromScreen)
    }
    const batchRow = (view: MemoScreenView, key: string) => view.targets.batch.find((row) => row.key === key)
    /** 보낸 묶음을 도우미가 받지 못했다: 다음 단추를 누를 수 있다 */
    const refuse = (made: Made, ticket: number) => made.jobs.fromPort({ type: 'sent', ticket, ok: false, code: 'E-BIT-READ-FAILED' })

    it("AC-6611.2: '다른 메모 있음'에서 [뒤에 붙이기]를 고르면 입력할 사람에 들고 그 줄은 appended(본 비트 메모)이며, 묶음 항목은 appends이고 replaces가 없다", async () => {
      const made = await ready({ bit: OTHER })
      await decline(made, A.key)
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
      await choose(made, A.key, 'append')
      const view = await viewOf(made)
      expect(keysIn(view, 'diff')).toEqual([])
      expect(batchRow(view, A.key)).toMatchObject({ compare: '다름', appended: '다른 메모' })
      expect(batchRow(view, A.key)).not.toHaveProperty('replaces')
      expect(rowOf(view, A.key).appended).toBe('다른 메모')
      expect(view.targets.replacing).toBe(0) // 붙이는 사람은 다른 메모를 바꾸지 않는다
      const sent = await press(made)
      expect(itemIn(sent, A.key)).toMatchObject({ memo: rowOf(view, A.key).text, appends: '다른 메모' })
      expect(itemIn(sent, A.key)).not.toHaveProperty('replaces')
    })

    it('AC-6611.2: [바꾸지 않기]는 붙이기를 풀어 묶음에 없고, [이 메모로 바꾸기]는 붙이기 대신 replaces로 든다', async () => {
      const made = await ready({ bit: OTHER })
      await appendFromDiff(made, A.key)
      await decline(made, A.key)
      const off = await viewOf(made)
      expect(keysIn(off, 'diff')).toEqual([A.key])
      expect(rowOf(off, A.key)).not.toHaveProperty('appended')
      const declined = await press(made)
      expect(declined.payload).not.toBeNull()
      expect(itemIn(declined, A.key)).toBeUndefined()
      await refuse(made, declined.ticket)
      await choose(made, A.key, 'append')
      await choose(made, A.key, true)
      const swapped = await viewOf(made)
      expect(batchRow(swapped, A.key)).toMatchObject({ replaces: '다른 메모', chip: '메모 바꿈' })
      expect(batchRow(swapped, A.key)).not.toHaveProperty('appended')
      expect(swapped.targets.replacing).toBe(1)
      const sent = await press(made)
      expect(itemIn(sent, A.key)).toMatchObject({ replaces: '다른 메모' })
      expect(itemIn(sent, A.key)).not.toHaveProperty('appends')
    })

    it("AC-6611.2: 묻지 않기가 켜져 있어도 붙이기는 사람이 고른 사람에게만 한다: 고르지 않은 다른 메모는 지금처럼 replaces이고 appends가 없다", async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모'), memoRow(B, '또 다른 메모')] })
      await turnNoAskOn(made)
      await appendFromDiff(made, A.key)
      const view = await viewOf(made)
      expect(view.noAsk).toBe(true)
      expect(view.targets.replacing).toBe(1)
      const sent = await press(made)
      expect(itemIn(sent, A.key)).toMatchObject({ appends: '다른 메모' })
      expect(itemIn(sent, B.key)).toMatchObject({ replaces: '또 다른 메모' })
      expect(sent.payload?.items.filter((item) => item.appends !== undefined).map((item) => item.visitKey)).toEqual([A.key])
    })

    it('AC-6611.2: 비트에 다른 메모가 없는 사람에게 [뒤에 붙이기]는 아무것도 바꾸지 않는다', async () => {
      const made = await ready()
      await choose(made, A.key, 'append')
      const view = await viewOf(made)
      expect(batchRow(view, A.key)).toMatchObject({ chip: '새 메모' })
      expect(rowOf(view, A.key)).not.toHaveProperty('appended')
      expect(itemIn(await press(made), A.key)).not.toHaveProperty('appends')
    })

    it('AC-6611.2: 직접 확인 기록이 남은 사람도 [뒤에 붙이기]를 고르면 입력할 사람에 들고 appends로 간다', async () => {
      const made = await ready({ bit: OTHER, store: { journal: { [A.key]: 'skippedByHand' } } })
      expect(keysIn(await viewOf(made), 'diff')).toEqual([A.key])
      await choose(made, A.key, 'append')
      expect(batchRow(await viewOf(made), A.key)).toMatchObject({ appended: '다른 메모' })
      const sent = await press(made)
      expect(itemIn(sent, A.key)).toMatchObject({ appends: '다른 메모' })
      expect(itemIn(sent, A.key)).not.toHaveProperty('replaces')
      expect(itemIn(sent, A.key)).not.toHaveProperty('checkedByHand')
    })

    it("AC-6611.2: 다시 불러온 비트 메모가 본 글과 다르면 붙이기가 풀려 '다른 메모 있음'으로 간다(바꾸기로 가지 않는다). 글이 돌아와도 되살아나지 않는다", async () => {
      const made = await ready({ bit: OTHER })
      await appendFromDiff(made, A.key)
      await reload(made, 1, memosJson([memoRow(A, '그새 바뀐 메모')]))
      const changed = await viewOf(made)
      expect(keysIn(changed, 'diff')).toEqual([A.key])
      expect(rowOf(changed, A.key)).not.toHaveProperty('appended')
      await reload(made, 2, memosJson(OTHER))
      const back = await viewOf(made)
      expect(keysIn(back, 'diff')).toEqual([A.key])
      expect(rowOf(back, A.key)).not.toHaveProperty('appended')
      // 줄바꿈 모양만 다르면 같은 글이라 붙이기가 남는다
      const kept = await ready({ bit: [memoRow(A, '첫 줄\n둘째 줄')] })
      await appendFromDiff(kept, A.key)
      await reload(kept, 1, memosJson([memoRow(A, '첫 줄\r\n둘째 줄')]))
      expect(batchRow(await viewOf(kept), A.key)).toMatchObject({ appended: '첫 줄\n둘째 줄' })
    })

    it('AC-6611.2: 새 [자료 불러오기]는 붙이기를 지운다(저절로 붙이지 않는다)', async () => {
      const made = await ready({ bit: OTHER })
      await appendFromDiff(made, A.key)
      await loadInto(made.jobs, 'month2', MEMO_MONTH, 2)
      await stream(made.jobs, 'memos2', memosJson(OTHER))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos2', load: 2 } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      const view = await viewOf(made)
      expect(batchRow(view, A.key)).toMatchObject({ chip: '메모 바꿈', replaces: '다른 메모' })
      expect(batchRow(view, A.key)).not.toHaveProperty('appended')
    })

    it('AC-6611.2: [직접 확인했어요]로 보내면 붙이기가 풀린다(appends 없이 보내고 뒤에 다시 들지 않는다)', async () => {
      const made = await ready({ bit: OTHER, store: { journal: { [A.key]: 'writing' } } })
      await choose(made, A.key, 'append')
      const hand = await press(made, 'byHand')
      expect(hand.payload?.items).toEqual([expect.objectContaining({ visitKey: A.key, checkedByHand: true })])
      expect(hand.payload?.items[0]).not.toHaveProperty('appends')
      await finish(made, hand.ticket, { status: 'finished', results: [line(A, '건너뜀', '이미 있음')] })
      const view = await viewOf(made)
      expect(keysIn(view, 'diff')).toContain(A.key)
      expect(rowOf(view, A.key)).not.toHaveProperty('appended')
    })

    it("AC-6611.2: [이어서 하기]·[다시 하기]도 붙이는 사람은 appends이고, 쓰다 멈춘 사람에게는 싣지 않는다", async () => {
      const made = await threeOnly([memoRow(A, '다른 메모'), memoRow(B, '또 다른 메모')])
      await appendFromDiff(made, A.key)
      await appendFromDiff(made, B.key)
      const first = await press(made)
      expect(itemIn(first, A.key)).toMatchObject({ appends: '다른 메모' })
      expect(itemIn(first, B.key)).toMatchObject({ appends: '또 다른 메모' })
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', reason: WRITE_STUCK, results: [line(A, '확인 필요', WRITE_STUCK), line(B, '확인 필요', '미처리')] })
      const resume = await press(made, 'resume')
      expect(resume.payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key, C.key])
      expect(itemIn(resume, A.key)).not.toHaveProperty('appends') // 쓰다 멈춘 사람은 도우미가 '마지막 원본 + 줄바꿈 + 우리 메모'로 확인한다
      expect(itemIn(resume, B.key)).toMatchObject({ appends: '또 다른 메모' })
      expect(itemIn(resume, B.key)).not.toHaveProperty('replaces')

      const again = await ready({ bit: OTHER })
      await appendFromDiff(again, A.key)
      const sent = await press(again)
      await finish(again, sent.ticket, { status: 'finished', results: [line(A, '건너뜀', '길이 넘음(비트 메모 칸 3,000바이트)')] })
      const retry = await press(again, 'retry')
      expect(retry.payload?.items.map((item) => item.visitKey)).toEqual([A.key])
      expect(itemIn(retry, A.key)).toMatchObject({ appends: '다른 메모' })
      expect(itemIn(retry, A.key)).not.toHaveProperty('replaces')
    })

    it("AC-6611.2: '붙임'으로 끝나면 완료로 가고 붙이기가 남지 않는다. 비트 메모를 받은 뒤 넣은 글은 '본 글(끝 공백 뺌) + 줄바꿈 + 우리 메모'다", async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모  \n')] })
      await appendFromDiff(made, A.key)
      const ours = rowOf(await viewOf(made), A.key).text
      const sent = await press(made)
      expect(itemIn(sent, A.key)).toMatchObject({ appends: '다른 메모  \n' })
      await finish(made, sent.ticket, { status: 'finished', results: [line(A, '완료', '붙임(기존 메모 뒤에)')] })
      const view = await viewOf(made)
      expect(keysIn(view, 'done')).toContain(A.key)
      expect(rowOf(view, A.key)).not.toHaveProperty('appended')
      // 고쳐 완료를 풀면 비트 칸의 합친 글과 견준다(AC-2202.3)
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      const edited = await viewOf(made)
      expect(rowOf(edited, A.key)).toMatchObject({ compare: '다름', inBit: `다른 메모\n${ours}` })
      expect(rowOf(edited, A.key)).not.toHaveProperty('appended')
    })

    // 사용자 결정 '좁히기'(2026-11-18): '앞 글 + 줄바꿈 + 우리 메모'는 그 진료의 붙임 기록이 있고 앞 글이 같을 때만 같음이다
    describe('AC-6611.3 붙임 기록은 그 달 done 칸에 남아 [자료 불러오기]를 다시 해도 산다', () => {
      /** 붙임 기록의 done 키. 내원번호는 앞뒤 공백을 뗀 글이라(shape.ts) 공백으로 시작하는 이 키와 겹치지 않는다 */
      const recordKey = (key: string) => ` appendedFrom:${key}`
      type MonthSave = { month: string; drafts: Record<string, string>; done: Record<string, string | boolean> }
      const monthSaves = (made: Made) => sends(made, 'store.save').map((m) => JSON.parse(m.payload) as Partial<MonthSave>).filter((p): p is MonthSave => p.month === '2026-10')
      /** A에게 '다른 메모  \n'을 보고 [뒤에 붙이기]로 넣어 '붙임'으로 끝났다 */
      async function appendedA() {
        const made = await ready({ bit: [memoRow(A, '다른 메모  \n')] })
        await appendFromDiff(made, A.key)
        const ours = rowOf(await viewOf(made), A.key).text
        const sent = await press(made)
        await finish(made, sent.ticket, { status: 'finished', results: [line(A, '완료', '붙임(기존 메모 뒤에)')] })
        const done = monthSaves(made).at(-1)?.done
        if (!done) throw new Error('달 칸 저장이 없다')
        return { made, ours, done }
      }

      it('AC-6611.3: 붙이기가 끝나면 붙일 때 본 앞 글(끝 공백 뺌)을 그 달 done 칸에 붙임 기록으로 보낸다. 값은 글자라 옛 판 웹이 읽는 모양(글자·참거짓)이고 키는 내원번호와 겹치지 않는다', async () => {
        const { made, ours, done } = await appendedA()
        expect(done).toMatchObject({ [A.key]: ours, [recordKey(A.key)]: '다른 메모' })
        expect(Object.values(done).every((value) => typeof value === 'string' || typeof value === 'boolean')).toBe(true)
        expect(recordKey(A.key).trim()).not.toBe(recordKey(A.key))
        // 같은 화면의 비트 사본은 붙이기 전 글이다: 그 글로 기록을 지우지 않는다
        made.sent.length = 0
        await viewOf(made)
        expect(monthSaves(made)).toEqual([])
        // 비트 메모를 다시 불러오면 합친 글이 기록의 앞 글 + 줄바꿈 + 우리 메모라 같음이다
        await made.jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
        await stream(made.jobs, 'r1', memosJson([memoRow(A, `다른 메모\r\n${ours}`)]))
        await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1 } satisfies PrecheckFromScreen)
        expect(rowOf(await viewOf(made), A.key)).toMatchObject({ compare: '같음', done: true })
        expect(monthSaves(made)).toEqual([])
      })

      it('AC-6611.3: [자료 불러오기]를 다시 해도(보낸 달 칸을 store.load로 되받음) 붙인 메모는 같음이고 기록이 남는다. 기록만 뺀 같은 달 칸이면 다름이다', async () => {
        const { ours, done } = await appendedA()
        const bit = [memoRow(A, `다른 메모\n${ours}`)]
        const again = await ready({ bit, store: { done } })
        const view = await viewOf(again)
        expect(rowOf(view, A.key)).toMatchObject({ compare: '같음', done: true })
        expect(keysIn(view, 'done')).toContain(A.key)
        expect(monthSaves(again)).toEqual([])
        const bare = await ready({ bit, store: { done: Object.fromEntries(Object.entries(done).filter(([key]) => key !== recordKey(A.key))) } })
        expect(rowOf(await viewOf(bare), A.key)).toMatchObject({ compare: '다름', inBit: `다른 메모\n${ours}` })
      })

      it("AC-6611.3: 붙임 기록 없이 비트 메모가 '옛 줄 + 줄바꿈 + 우리 메모'면 다름이다(처방이 바뀌어 우리 메모의 앞 줄이 빠진 때)", async () => {
        const plain = await ready()
        const ours = rowOf(await viewOf(plain), A.key).text
        const made = await ready({ bit: [memoRow(A, `◈가상 옛 줄\n${ours}`)] })
        const view = await viewOf(made)
        expect(rowOf(view, A.key)).toMatchObject({ compare: '다름', inBit: `◈가상 옛 줄\n${ours}` })
        expect(batchRow(view, A.key)).toMatchObject({ replaces: `◈가상 옛 줄\n${ours}`, chip: '메모 바꿈' })
      })

      it('AC-6611.3: 붙임 기록의 앞 글이 비트 앞 글과 다르면 다름이고, 다시 읽은 비트 글이 기록의 합친 글이 아니면 기록을 지워 저장한다. 글이 돌아와도 되살아나지 않는다', async () => {
        const { ours, done } = await appendedA()
        const other = await ready({ bit: [memoRow(A, `◈가상 옛 줄\n${ours}`)], store: { done } })
        expect(rowOf(await viewOf(other), A.key).compare).toBe('다름')

        const made = await ready({ bit: [memoRow(A, `다른 메모\n${ours}`)], store: { done } })
        expect(rowOf(await viewOf(made), A.key).compare).toBe('같음')
        const reloadTo = async (run: number, text: string) => {
          await made.jobs.fromScreen({ type: 'memoReloadStart', run } satisfies PrecheckFromScreen)
          await stream(made.jobs, `r${run}`, memosJson([memoRow(A, text)]))
          await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: `r${run}`, load: 1, run } satisfies PrecheckFromScreen)
        }
        await reloadTo(1, `◈가상 옛 줄\n${ours}`)
        expect(rowOf(await viewOf(made), A.key).compare).toBe('다름')
        const saved = monthSaves(made).at(-1)
        expect(saved?.done).not.toHaveProperty(recordKey(A.key))
        expect(saved?.done[A.key]).toBe(ours)
        await reloadTo(2, `다른 메모\n${ours}`)
        expect(rowOf(await viewOf(made), A.key).compare).toBe('다름')
      })

      it.each([
        ['[바꾸지 않기]', false],
        ['[이 메모로 바꾸기]', true],
      ] as const)('AC-6611.3: %s를 누르면 붙임 기록을 지워 저장하고 그 뒤로는 다름이다', async (_, approved) => {
        const { ours, done } = await appendedA()
        const made = await ready({ bit: [memoRow(A, `다른 메모\n${ours}`)], store: { done } })
        await choose(made, A.key, approved)
        const saved = monthSaves(made).at(-1)
        expect(saved?.done).not.toHaveProperty(recordKey(A.key))
        expect(saved?.done[A.key]).toBe(ours)
        expect(rowOf(await viewOf(made), A.key).compare).toBe('다름')
      })

      it('AC-6611.3: loadStore는 붙임 기록 키를 완료 표시·고친 메모로 보지 않고 기록으로 읽으며, 달 칸에는 그대로 두어 다시 보낼 때 남는다', () => {
        const read = loadStore(JSON.stringify({ months: { '2026-10': { drafts: {}, done: { v1: '우리 메모', [recordKey('v1')]: '앞 글', [recordKey('v2')]: true }, journal: {} } } } satisfies StoreLoadJson))
        if (!read.ok || !read.value.work) throw new Error('읽지 못했다')
        const { work } = read.value
        expect([...work.done]).toEqual(['v1'])
        expect([...work.saved]).toEqual([['v1', '우리 메모']])
        expect([...work.appendedFrom]).toEqual([['v1', '앞 글']])
        expect(Object.fromEntries(work.months.get('2026-10')!.done)).toEqual({ v1: '우리 메모', [recordKey('v1')]: '앞 글', [recordKey('v2')]: true })
      })
    })
  })

  describe('AC-018.16 쓰다 멈춘 사람', () => {
    it('AC-018.16: journal의 writing·writeUnconfirmed이면 띠 자료가 있고, 두 단추의 묶음에 들어간다', async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing', [B.key]: 'writeUnconfirmed', [C.key]: 'done' } } })
      const view = await viewOf(made)
      expect(view.stuck?.people.map((person) => person.key)).toEqual([A.key, B.key])
      expect(view.stuck).toMatchObject({ canContinue: true, canByHand: true, big: true, loadRange: null, note: null })
      const go = await press(made, 'continueStuck')
      expect(go.payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key])
      expect(go.payload).not.toHaveProperty('code')
      expect(go.payload?.items.some((item) => 'checkedByHand' in item)).toBe(false)
      expect(made.posts.at(-1)).toMatchObject({ type: 'inputStart', askPc: true })
    })

    it('AC-018.16: [직접 확인했어요] 묶음: 확인 표시 메모는 글자 그대로, 빈 메모는 한 칸 공백, 자료에 없는 진료는 자리 채움 값이고 모두 checkedByHand다', async () => {
      const made = await ready({ visible: OCTOBER, store: { drafts: { [A.key]: '[부위 확인] 글', [NO_MEMO]: '   ' }, journal: { [A.key]: 'writing', [NO_MEMO]: 'writing', gone1: 'writing', gone2: 'writeUnconfirmed' } } })
      const { payload } = await press(made, 'byHand')
      const item = (key: string) => payload!.items.find((row) => row.visitKey === key)!
      expect(item(A.key)).toMatchObject({ memo: '[부위 확인] 글', checkedByHand: true, chart: A.chart })
      expect(item(NO_MEMO)).toMatchObject({ memo: ' ', checkedByHand: true })
      expect(item('gone1')).toEqual({ visitKey: 'gone1', chart: '00000000000000000001', name: '-', date: '2026-10-01', memo: ' ', checkedByHand: true })
      expect(item('gone2')).toEqual({ visitKey: 'gone2', chart: '00000000000000000002', name: '-', date: '2026-10-01', memo: ' ', checkedByHand: true })
    })

    it('AC-018.16: 화면이 아는 같은 날이면 [이어서 입력]이 흐리고 직접 입력 까닭과 도우미 멈춤 글이 있다', async () => {
      const made = await ready({ month: SAME_DAY_MONTH, store: { journal: { [A.key]: 'writing' } } })
      const view = await viewOf(made)
      expect(view.stuck).toMatchObject({ canContinue: false, canByHand: true, note: '이 환자는 입력에서 빠지는 사람이라 이어서 입력할 수 없습니다. 비트에서 메모 칸을 확인한 뒤 [직접 확인했어요]를 눌러 주세요.' })
      expect(view.stuck?.people).toEqual([expect.objectContaining({ key: A.key, reason: 'manual', sameDay: 2 })])
      expect((await press(made, 'continueStuck')).payload).toBeNull()
    })

    it('AC-018.16: 같은 차트번호·내원일의 쓰다 멈춘 두 사람이면 첫째는 진짜 차트번호, 둘째는 자리 채움 값과 한 칸 공백이고 [다시 하기]에 들지 않는다', async () => {
      const made = await ready({ month: SAME_DAY_MONTH, store: { journal: { [A.key]: 'writing', [B.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      const [first, second] = hand.payload!.items
      expect(first).toMatchObject({ visitKey: A.key, chart: A.chart, date: DAY.from, checkedByHand: true })
      expect(first.memo.trim().length).toBeGreaterThan(0)
      expect(second).toMatchObject({ visitKey: B.key, chart: '00000000000000000001', date: DAY.from, memo: ' ', checkedByHand: true })
      // 도우미는 공백 메모를 내원 수보다 먼저 본다(InputBatch.DropReason): 둘째는 '내원일 없음'이 아니라 '넣을 메모가 없어'다
      const TAIL = ' · 직접 확인해 입력 멈춤을 풀었습니다'
      const result = resultOf(await finish(made, hand.ticket, { status: 'finished', results: [line(A, '건너뜀', `같은 날 내원이 여러 건이라 직접 입력해 주세요${TAIL}`), line(B, '건너뜀', `넣을 메모가 없어 입력하지 않았습니다${TAIL}`)] }))
      expect(result.retry).toBe(0)
      expect(result.skipped.map((row) => [row.key, row.retry])).toEqual([[A.key, false], [B.key, false]])
      // 줄에는 진짜 차트번호이고 한 칸 공백을 메모로 보이지 않는다(AC-018.15)
      expect(result.skipped[1]).toMatchObject({ chart: A.chart })
      expect(result.skipped[1]).not.toHaveProperty('memo')
      const view = await viewOf(made)
      expect(view.stuck).toBeNull()
      expect(keysIn(view, 'held')).toEqual([])
      expect((await press(made, 'retry')).payload).toBeNull()
    })

    it('AC-018.16: 답의 unconfirmed는 날짜를 그대로 쓰고 사람 줄에는 날짜가 보인다', async () => {
      const made = await ready()
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', reason: '이전 입력이 끝나지 않은 환자가 있어', unconfirmed: [{ visitKey: 'gone', date: '2026-10-12' }] })
      const view = await viewOf(made)
      expect(view.stuck?.people).toEqual([expect.objectContaining({ key: 'gone', state: 'noData', date: '2026-10-12' })])
      expect(view.stuck).toMatchObject({ canContinue: false, canByHand: true, big: false, note: '넣을 메모가 없어 [이어서 입력]은 누를 수 없어요.' })
      const hand = await press(made, 'byHand')
      expect(hand.payload?.items).toEqual([{ visitKey: 'gone', chart: '00000000000000000001', name: '-', date: '2026-10-12', memo: ' ', checkedByHand: true }])
    })

    it('AC-018.16: 확인 표시·화면이 아는 같은 날이면 [이어서 입력]이 흐리고 도우미 멈춤 글이 있다', async () => {
      const made = await ready({ store: { drafts: { [A.key]: '[부위 확인] 글' }, journal: { [A.key]: 'writing' } } })
      const view = await viewOf(made)
      expect(view.stuck).toMatchObject({ canContinue: false, canByHand: true, note: '이 환자는 입력에서 빠지는 사람이라 이어서 입력할 수 없습니다. 비트에서 메모 칸을 확인한 뒤 [직접 확인했어요]를 눌러 주세요.' })
      expect(view.stuck?.people[0].reason).toBe('mark')
    })

    it('AC-018.16: 메모 없는 사람뿐이면 넣을 메모가 없다는 글이다', async () => {
      const made = await ready({ store: { journal: { [NO_MEMO]: 'writing' } } })
      const view = await viewOf(made)
      expect(view.stuck).toMatchObject({ canContinue: false, canByHand: true, note: '넣을 메모가 없어 [이어서 입력]은 누를 수 없어요.' })
    })

    it('AC-018.16: 불러온 기간 밖이면 두 단추가 흐리고 그 날·달을 담는 가장 짧은 기간을 불러온다', async () => {
      const made = await ready()
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', unconfirmed: [{ visitKey: 'away', date: '2026-10-20' }, { visitKey: 'early', date: '2026-10-05' }] })
      const view = await viewOf(made)
      expect(view.stuck).toMatchObject({ canContinue: false, canByHand: false, big: false, loadRange: { from: '2026-10-05', to: '2026-10-20' } })
      expect(view.stuck?.people.map((person) => person.state)).toEqual(['outside', 'outside'])
      expect((await press(made, 'byHand')).payload).toBeNull()
    })

    it('AC-018.16: 35일 안에 다 들지 않으면 가장 이른 날부터 35일이고, 그 기간을 불러온 뒤에도 밖인 사람은 자리 채움 값으로 간다', async () => {
      const made = await ready()
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', unconfirmed: [{ visitKey: 'early', date: '2026-09-01' }, { visitKey: 'late', date: '2026-12-20' }] })
      const view = await viewOf(made)
      expect(view.stuck?.loadRange).toEqual({ from: '2026-09-01', to: '2026-10-05' })
      // 그 기간을 불러온다
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: { from: '2026-09-01', to: '2026-10-05' }, settings: SETTINGS } satisfies PrecheckFromScreen)
      const after = await viewOf(made, { ...SELECT, rangeFrom: '2026-09-01', rangeTo: '2026-10-05' })
      expect(after.stuck).toMatchObject({ canByHand: true, canContinue: false, loadRange: null })
      expect(after.stuck?.people.find((person) => person.key === 'late')?.state).toBe('noData')
    })

    it('AC-018.16: 쓰다 멈춘 사람이 완료로 끝나면 사본이 done이라 다시 불러오기 전에도 막히지 않는다', async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing' } } })
      const go = await press(made, 'continueStuck')
      await finish(made, go.ticket, { status: 'finished', results: [line(A, '완료', '입력')] })
      expect((await viewOf(made)).stuck).toBeNull()
    })

    it('AC-018.16: 이번 입력에서 처음 쓰다 멈춘 사람(결과 줄로만 안다)도 띠에 들고 [비트에 입력]이 막힌다', async () => {
      const made = await threeOnly()
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', reason: '입력은 했지만 임시저장 버튼을 누르지 못했습니다. 직접 임시저장을 눌러 주세요.', results: [line(C, '완료', '입력'), line(A, '확인 필요', '입력은 했지만 임시저장 버튼을 누르지 못했습니다. 직접 임시저장을 눌러 주세요.'), line(B, '확인 필요', '미처리')] })
      const view = await viewOf(made)
      expect(view.stuck?.people).toEqual([expect.objectContaining({ key: A.key, state: 'known', date: DAY.from })])
      expect((await press(made)).payload).toBeNull()
      expect(rowOf(view, A.key).lastJournal).toBeUndefined()
      // 이어서 하기는 그 사람을 함께 보낸다: 빼면 도우미가 AC-035.4로 막는다
      const resume = await press(made, 'resume')
      expect(resume.payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key])
      await finish(made, resume.ticket, { status: 'finished', results: [line(A, '완료', '입력'), line(B, '완료', '입력')] })
      expect((await viewOf(made)).stuck).toBeNull()
    })

    it(`AC-018.16: '미처리'와 '메모 칸이 입력을 받지 않아'는 쓰다 멈춘 사람이 아니다`, async () => {
      const made = await ready()
      const first = await press(made)
      await finish(made, first.ticket, { status: 'finished', results: [line(A, '확인 필요', '메모 칸이 입력을 받지 않아 입력하지 못했습니다'), line(B, '확인 필요', '미처리')] })
      expect((await viewOf(made)).stuck).toBeNull()
    })

    it('AC-018.16: 답의 unconfirmed는 새 store.load에서 기록이 풀렸으면 사라지고, 그대로면 날짜와 함께 남는다', async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', unconfirmed: [{ visitKey: 'gone', date: DAY.from }, { visitKey: 'away', date: '2026-09-20' }] })
      await made.jobs.fromScreen({ type: 'loadStart', load: 2, keepEdits: true } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'm2', MEMO_MONTH)
      await made.jobs.fromScreen({ type: 'month', id: 'm2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 's2', storeJson({ journal: { gone: 'done' } }))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'store', id: 's2', load: 2 } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      // gone은 그 달을 읽어 done이다. away는 읽지 않은 달이라 남는다
      expect((await viewOf(made)).stuck?.people.map((person) => [person.key, person.date])).toEqual([['away', '2026-09-20']])
    })

    it('AC-018.16: [취소]면 그대로 막히고, [이어서 입력]이 stopped여도 그대로다', async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing' } } })
      const go = await press(made, 'continueStuck')
      await finish(made, go.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', reason: '이 환자는 입력에서 빠지는 사람이라', results: [] })
      expect((await viewOf(made)).stuck?.people.map((person) => person.key)).toEqual([A.key])
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'cancelled' })
      expect((await viewOf(made)).stuck?.people.map((person) => person.key)).toEqual([A.key])
    })

    it('AC-018.16: [직접 확인했어요] 뒤 건너뜀이면 풀리고, 자료에 없는 사람은 [다시 하기]에 들지 않는다', async () => {
      const made = await ready({ visible: OCTOBER, store: { journal: { gone: 'writing' } } })
      const hand = await press(made, 'byHand')
      const done = await finish(made, hand.ticket, { status: 'finished', results: [line({ key: 'gone' }, '건너뜀', '넣을 메모가 없어 입력하지 않았습니다 · 직접 확인해 입력 멈춤을 풀었습니다')] })
      expect((await viewOf(made)).stuck).toBeNull()
      const result = resultOf(done)
      expect(result.skipped[0]).toMatchObject({ key: 'gone', name: null, chart: null, month: '2026-10', retry: false })
      expect(result.retry).toBe(0)
    })
  })

  describe('AC-018.21 끝 JSON', () => {
    it('AC-018.21: finished는 완료·확인 필요·건너뜀으로 나뉘고 이전 메모가 줄에 있다', async () => {
      const made = await ready({ bit: [memoRow(A, '옛 메모')] })
      await made.jobs.fromScreen({ type: 'memoApprove', visitKey: A.key, approved: true } satisfies PrecheckFromScreen)
      const { ticket } = await press(made)
      const result = resultOf(
        await finish(made, ticket, {
          status: 'finished',
          results: [{ ...line(A, '완료', '바꿈(기존 메모 덮어씀)'), previousMemo: '옛 메모' }, line(B, '확인 필요', '메모 칸이 입력을 받지 않아 입력하지 못했습니다'), line(C, '건너뜀', '내원일 없음')],
        }),
      )
      expect(result.status).toBe('finished')
      expect(result.done.map((row) => row.key)).toEqual([A.key])
      expect(result.done[0].previousMemo).toBe('옛 메모')
      expect(result.done[0].memo?.length).toBeGreaterThan(0)
      expect(result.check.map((row) => row.key)).toEqual([B.key])
      expect(result.skipped.find((row) => row.key === C.key)).toMatchObject({ reason: '내원일 없음', retry: true })
    })

    it('AC-018.21: stopped는 번호·이유·칸 ID와 넣은 수·남은 수를 싣는다', async () => {
      const made = await threeOnly()
      const { ticket } = await press(made)
      const result = resultOf(
        await finish(made, ticket, { status: 'stopped', code: 'E-BIT-UI-CHANGED', reason: '칸을 찾지 못했어요', fields: ['txtBilCmt'], results: [line(A, '완료', '입력'), line(B, '확인 필요', '미처리'), line(C, '확인 필요', '미처리')] }),
      )
      expect(result).toMatchObject({ status: 'stopped', code: 'E-BIT-UI-CHANGED', reason: '칸을 찾지 못했어요', fields: ['txtBilCmt'], entered: 1, left: 2 })
    })

    it('AC-018.21: cancelled면 줄이 없고 아무것도 바뀌지 않는다', async () => {
      const made = await ready()
      const before = await viewOf(made)
      const { ticket } = await press(made)
      expect(resultOf(await finish(made, ticket, { status: 'cancelled' })).status).toBe('cancelled')
      expect(await viewOf(made)).toEqual(before)
    })

    it.each([
      ['JSON이 아님', 'not json'],
      ['status가 틀림', JSON.stringify({ status: 'nope', fields: [], results: [], noAsk: false })],
      ['줄 모양이 틀림', JSON.stringify({ status: 'finished', fields: [], results: [{ visitKey: 'a' }], noAsk: false })],
      ['noAsk가 없음', JSON.stringify({ status: 'finished', fields: [], results: [] })],
    ])('AC-018.21: %s면 결과를 지어내지 않고 E-CLAIM-PARTIAL이다', async (_, text) => {
      const made = await ready()
      const { ticket } = await press(made)
      expect(await finish(made, ticket, text)).toMatchObject({ ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-018.21: 조각이 다 오지 않으면 E-CLAIM-PARTIAL이다', async () => {
      const made = await ready()
      const { run, ticket } = await press(made)
      await made.jobs.fromPort({ type: 'chunk', id: 'cut', seq: 0, data: '{"status"' })
      await made.jobs.fromPort({ type: 'abort', id: 'cut', code: 'E-BRIDGE-DISCONNECTED' })
      await made.jobs.fromPort({ type: 'sent', ticket, ok: true, id: 'cut', count: 1 })
      expect(made.posts.at(-1)).toEqual({ type: 'inputDone', run, ok: false, code: 'E-CLAIM-PARTIAL' })
    })

    it('AC-018.21: 칸 없는 줄(previousMemo 없음)도 맞는 모양으로 읽는다', async () => {
      const made = await ready()
      const { ticket } = await press(made)
      const result = resultOf(await finish(made, ticket, { status: 'finished', results: [line(A, '완료', '입력')] }))
      expect(result.done[0]).not.toHaveProperty('previousMemo')
    })

    it('AC-018.21: [직접 확인했어요] 묶음이 멈춘 뒤 [이어서 하기]·[다시 하기]의 묶음에 checkedByHand가 없다', async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing', [B.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '건너뜀', '내원일 없음'), line(B, '확인 필요', '미처리')] })
      const resume = await press(made, 'resume')
      expect(resume.payload?.items.map((item) => item.visitKey)).toEqual([B.key])
      expect(resume.payload?.items.some((item) => 'checkedByHand' in item)).toBe(false)
      await finish(made, resume.ticket, { status: 'finished', results: [line(B, '완료', '입력')] })
    })

    it('AC-018.21: [직접 확인했어요] 묶음의 [다시 하기]에도 checkedByHand가 없다', async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'finished', results: [line(A, '건너뜀', '내원일 없음')] })
      const retry = await press(made, 'retry')
      expect(retry.payload?.items.map((item) => item.visitKey)).toEqual([A.key])
      expect(retry.payload?.items.some((item) => 'checkedByHand' in item)).toBe(false)
    })

    it('AC-018.21: 결과 줄이 없으면 [이어서 하기]가 보낸 묶음에서 다시 보낸다(checkedByHand는 뺀다)', async () => {
      const made = await ready({ visible: OCTOBER, store: { journal: { [A.key]: 'writing', gone: 'writing' } } })
      const hand = await press(made, 'byHand')
      const sentAgain = hand.payload!.items
      await finish(made, hand.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', reason: '입력 기록의 일부를 확인할 수 없어', results: [] })
      const resume = await press(made, 'resume')
      expect(resume.payload?.items.some((item) => 'checkedByHand' in item)).toBe(false)
      expect(resume.payload?.items.map((item) => item.visitKey)).toEqual(sentAgain.map((item) => item.visitKey))
      expect(resume.payload?.items.map((item) => item.chart)).toEqual(sentAgain.map((item) => item.chart))
    })

    it('AC-018.21: 지문이 틀려 미리 뺀 사람의 줄만 오면 줄이 없는 사람을 남은 수에 세고 [이어서 하기]로 다시 보낸다', async () => {
      const made = await threeOnly()
      const first = await press(made)
      expect(first.payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key, C.key])
      const result = resultOf(await finish(made, first.ticket, { status: 'stopped', code: 'E-BIT-UI-CHANGED', fields: ['txtBilCmt'], results: [line(A, '건너뜀', '같은 날 내원이 여러 건이라 직접 입력해 주세요')] }))
      expect(result).toMatchObject({ status: 'stopped', entered: 0, left: 2 })
      const resume = await press(made, 'resume')
      expect(resume.payload?.items.map((item) => item.visitKey)).toEqual([B.key, C.key])
    })

    it('AC-018.21: 줄이 하나도 없으면 보낸 사람 모두를 남은 수에 세고 [이어서 하기]로 다시 보낸다', async () => {
      const made = await threeOnly()
      const first = await press(made)
      const result = resultOf(await finish(made, first.ticket, { status: 'stopped', code: 'E-BIT-UI-CHANGED', results: [] }))
      expect(result).toMatchObject({ entered: 0, left: 3 })
      expect((await press(made, 'resume')).payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key, C.key])
    })

    it(`AC-018.21: 줄이 일부만 있으면 '미처리' 줄과 줄 없는 사람을 함께 세고 함께 다시 보낸다`, async () => {
      const made = await threeOnly()
      const first = await press(made)
      const result = resultOf(await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '완료', '입력'), line(B, '확인 필요', '미처리')] }))
      expect(result).toMatchObject({ entered: 1, left: 2 })
      expect((await press(made, 'resume')).payload?.items.map((item) => item.visitKey)).toEqual([B.key, C.key])
    })

    it('AC-018.21: 비교가 다름인 쓰다 멈춘 두 사람을 [직접 확인했어요]로 보낸 묶음이 E-BIT-UNSAVED-RX로 멈추면 둘 다 [바꾸지 않기]라 남은 0명이고 [이어서 하기]가 없다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모'), memoRow(B, '다른 메모')], store: { journal: { [A.key]: 'writing', [B.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      expect(hand.payload?.items.every((item) => item.checkedByHand === true && !('replaces' in item))).toBe(true)
      const result = resultOf(await finish(made, hand.ticket, { status: 'stopped', code: 'E-BIT-UNSAVED-RX', results: [] }))
      expect(result).toMatchObject({ status: 'stopped', code: 'E-BIT-UNSAVED-RX', entered: 0, left: 0, retry: 0 })
      expect((await press(made, 'resume')).payload).toBeNull()
      // 기록이 그대로이므로 띠의 두 단추가 남는다(AC-018.16)
      const view = await viewOf(made)
      expect(view.stuck?.people.map((person) => person.key)).toEqual([A.key, B.key])
      expect(itemIn(await press(made, 'continueStuck'), A.key)).not.toHaveProperty('replaces')
    })

    it(`AC-018.21: 비교가 다름인 declined의 '미처리' 줄은 남은 수와 [이어서 하기]에 세지 않고, 쓰다 멈춘 줄은 세지 않은 채 [이어서 하기] 묶음에 남는다`, async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모'), memoRow(B, '다른 메모')], store: { journal: { [A.key]: 'writing', [B.key]: 'writing' } } })
      await decline(made, A.key)
      await decline(made, B.key)
      const go = await press(made, 'continueStuck')
      const result = resultOf(await finish(made, go.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '확인 필요', WRITE_STUCK), line(B, '확인 필요', '미처리')] }))
      expect(result.left).toBe(0)
      const resume = await press(made, 'resume')
      expect(resume.payload?.items.map((item) => item.visitKey)).toEqual([A.key])
      expect(itemIn(resume, A.key)).not.toHaveProperty('replaces')
    })

    it('AC-018.21: [이어서 하기]의 replaces는 보낼 때의 값이다(그새 다시 불러온 새 글)', async () => {
      const made = await threeOnly([memoRow(A, '처음 메모')])
      const first = await press(made)
      expect(itemIn(first, A.key)?.replaces).toBe('처음 메모')
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '확인 필요', '미처리')] })
      await made.jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'r1', memosJson([memoRow(A, '새 메모'), memoRow(B, '생긴 메모')]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1 } satisfies PrecheckFromScreen)
      const resume = await press(made, 'resume')
      expect(itemIn(resume, A.key)?.replaces).toBe('새 메모')
      expect(itemIn(resume, B.key)?.replaces).toBe('생긴 메모')
    })

    it('AC-016.3·AC-018.21: 멈춘 뒤 메모에 확인 표시가 생기면 [이어서 하기]에 replaces를 싣지 않는다(뺄지는 도우미가 정한다, AC-037.7)', async () => {
      const made = await threeOnly([memoRow(A, '처음 메모')])
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '확인 필요', '미처리')] })
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '[부위 확인] 글' } satisfies PrecheckFromScreen)
      const resume = await press(made, 'resume')
      expect(itemIn(resume, A.key)?.memo).toBe('[부위 확인] 글')
      expect(itemIn(resume, A.key)).not.toHaveProperty('replaces')
    })

    it('AC-018.21: [다시 하기]의 replaces는 보낼 때의 값이다', async () => {
      const made = await threeOnly([memoRow(A, '처음 메모')])
      const first = await press(made)
      await finish(made, first.ticket, { status: 'finished', results: [line(A, '건너뜀', '내원일 없음')] })
      await made.jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'r1', memosJson([memoRow(A, '새 메모')]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1 } satisfies PrecheckFromScreen)
      expect(itemIn(await press(made, 'retry'), A.key)?.replaces).toBe('새 메모')
    })

    it('AC-018.21: 보내기가 거절되면 번호만 답하고 다음에 또 누를 수 있다', async () => {
      const made = await ready()
      const { run, ticket } = await press(made)
      await made.jobs.fromPort({ type: 'sent', ticket, ok: false, code: 'E-HELPER-BAD-MESSAGE' })
      expect(made.posts.at(-1)).toEqual({ type: 'inputDone', run, ok: false, code: 'E-HELPER-BAD-MESSAGE' })
      expect((await press(made)).payload).not.toBeNull()
    })
  })

  describe('AC-018.4·AC-018.13·AC-018.20 이유는 앞부분으로 가른다', () => {
    const TAIL = ' · 직접 확인해 입력 멈춤을 풀었습니다'

    it('AC-018.4: 화면에서 미리 뺀 사람도 이유와 함께 건너뜀에 들고, 완료·메모 없음은 세지 않는다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모')], store: { drafts: { [B.key]: '[부위 확인] 글' } } })
      await decline(made, A.key)
      const view = await viewOf(made)
      const { ticket } = await press(made)
      const result = resultOf(await finish(made, ticket, { status: 'finished', results: [] }))
      expect(result.skipped.find((row) => row.key === A.key)?.reason).toBe('이미 있음: 비트에 다른 메모가 있고 바꾸지 않기로 했어요')
      expect(result.skipped.find((row) => row.key === B.key)?.reason).toBe('확인 표시가 남아 입력하지 않았습니다')
      expect(result.uncounted).toBe((view.targets.left.find((group) => group.reason === 'nomemo')?.rows.length ?? 0) + (view.targets.left.find((group) => group.reason === 'done')?.rows.length ?? 0))
      expect(result.retry).toBe(0)
    })

    it('AC-018.4: 비교가 다름인 declined는 [다시 하기]에 세지 않는다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모')], store: { journal: { [A.key]: 'writing' } } })
      await decline(made, A.key)
      const go = await press(made, 'continueStuck')
      const result = resultOf(await finish(made, go.ticket, { status: 'finished', results: [line(A, '건너뜀', '내원일 없음')] }))
      expect(result.skipped.find((row) => row.key === A.key)).toMatchObject({ retry: false })
      expect(result.retry).toBe(0)
      expect((await press(made, 'retry')).payload).toBeNull()
    })

    it('AC-016.6: truncated 없이 4,000자를 넘는 줄은 그 진료만 조회 못함이고 묶음은 산다(replaces는 모두 1~4,000자)', async () => {
      const made = await ready({ bit: [memoRow(A, '글'.repeat(4001)), memoRow(B, '글'.repeat(4000)), memoRow(C, '짧은 글')] })
      const view = await viewOf(made)
      expect(rowOf(view, A.key).compare).toBe('조회 못함')
      expect(keysIn(view, 'unread')).toEqual([A.key])
      const sent = await press(made)
      expect(itemIn(sent, A.key)).toBeUndefined()
      expect(itemIn(sent, B.key)?.replaces).toHaveLength(4000)
      for (const item of sent.payload!.items) if (item.replaces !== undefined) expect(item.replaces.length).toBeGreaterThanOrEqual(1)
      for (const item of sent.payload!.items) if (item.replaces !== undefined) expect(item.replaces.length).toBeLessThanOrEqual(4000)
    })

    it(`AC-018.4: 뒤 글이 붙은 '같은 날'은 직접 입력이고, 뒤 글이 붙은 '넣을 메모가 없어'와 함께 [다시 하기]에 들지 않는다`, async () => {
      const made = await ready()
      const { ticket } = await press(made)
      const result = resultOf(
        await finish(made, ticket, {
          status: 'finished',
          results: [line(A, '건너뜀', `같은 날 내원이 여러 건이라 직접 입력해 주세요${TAIL}`), line(B, '건너뜀', `넣을 메모가 없어 입력하지 않았습니다${TAIL}`), line(C, '건너뜀', '이미 있음')],
        }),
      )
      expect(result.skipped.filter((row) => row.retry)).toEqual([])
      expect(result.retry).toBe(0)
    })

    it(`AC-018.13: 도우미가 같은 날이라 돌려준 사람(뒤 글 포함)은 '직접 입력'으로 옮겨 다음 묶음에 없다`, async () => {
      const made = await ready()
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', results: [line(A, '건너뜀', '같은 날 내원이 여러 건이라 직접 입력해 주세요'), line(B, '건너뜀', `같은 날 내원이 여러 건이라 직접 입력해 주세요${TAIL}`)] })
      const view = await viewOf(made)
      const manual = view.targets.left.find((group) => group.reason === 'manual')?.rows ?? []
      expect(manual.map((row) => [row.key, row.foundByPc])).toEqual(expect.arrayContaining([[A.key, true], [B.key, true]]))
      expect(batchKeys(view)).not.toContain(A.key)
      expect((await press(made)).payload?.items.map((item) => item.visitKey)).not.toContain(B.key)
    })

    it('AC-018.20: 건너뜀(내원일 없음 등)은 기억하고 고치면 다시 든다. 뒤 글이 붙어도 앞부분으로 가른다', async () => {
      const made = await ready()
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', results: [line(A, '건너뜀', '내원일 없음'), line(B, '건너뜀', `내원일 없음${TAIL}`)] })
      expect(keysIn(await viewOf(made), 'held')).toEqual(expect.arrayContaining([A.key, B.key]))
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      const view = await viewOf(made)
      expect(batchKeys(view)).toContain(A.key)
      expect(keysIn(view, 'held')).toEqual([B.key])
    })

    it(`AC-018.20: '넣을 메모가 없어'·이미 있음·직접 입력·입력 직전 변경됨은 기억하지 않는다`, async () => {
      const made = await ready({ bit: [memoRow(C, '비트 메모')] })
      await made.jobs.fromScreen({ type: 'memoApprove', visitKey: C.key, approved: true } satisfies PrecheckFromScreen)
      const { ticket } = await press(made)
      await finish(made, ticket, {
        status: 'finished',
        results: [line(A, '건너뜀', '넣을 메모가 없어 입력하지 않았습니다'), line(B, '건너뜀', '이미 있음'), line(C, '건너뜀', '입력 직전 기존 청구메모가 변경되었습니다. 현재 내용을 다시 비교해 주세요.')],
      })
      const view = await viewOf(made)
      expect(keysIn(view, 'held')).toEqual([])
      expect(batchKeys(view)).toContain(C.key)
    })

    it(`AC-018.20: 입력 직전 변경됨으로 건너뛴 사람은 다시 불러오면 새 글을 replaces로 다음 묶음에 든다`, async () => {
      const made = await ready({ bit: [memoRow(C, '비트 메모')] })
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', results: [line(C, '건너뜀', '입력 직전 기존 청구메모가 변경되었습니다. 현재 내용을 다시 비교해 주세요.')] })
      expect(keysIn(await viewOf(made), 'held')).toEqual([])
      await made.jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'r1', memosJson([memoRow(C, '바뀐 비트 메모')]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1 } satisfies PrecheckFromScreen)
      expect(itemIn(await press(made), C.key)?.replaces).toBe('바뀐 비트 메모')
    })

    it(`AC-018.20: 다른 메모가 있는 사람의 '지난번 건너뜀' [다시 하기]는 지금 글을 replaces로 싣는다`, async () => {
      const made = await ready({ bit: [memoRow(A, '비트 메모')] })
      const first = await press(made)
      await finish(made, first.ticket, { status: 'finished', results: [line(A, '건너뜀', '내원일 없음')] })
      expect(keysIn(await viewOf(made), 'held')).toEqual([A.key])
      expect(itemIn(await press(made, 'held'), A.key)?.replaces).toBe('비트 메모')
    })

    it(`AC-018.20: '지난번 건너뜀'의 [다시 하기]는 그 사람들만 다시 묶는다`, async () => {
      const made = await ready()
      const first = await press(made)
      await finish(made, first.ticket, { status: 'finished', results: [line(A, '건너뜀', '내원일 없음')] })
      const again = await press(made, 'held')
      expect(again.payload?.items.map((item) => item.visitKey)).toEqual([A.key])
    })

    it('AC-018.4: [다시 하기]는 다시 할 수 있는 사람만 다시 묶는다', async () => {
      const made = await ready()
      const first = await press(made)
      await finish(made, first.ticket, { status: 'finished', results: [line(A, '건너뜀', '내원일 없음'), line(B, '건너뜀', '이미 있음'), line(C, '완료', '입력')] })
      const again = await press(made, 'retry')
      expect(again.payload?.items.map((item) => item.visitKey)).toEqual([A.key])
    })
  })

  describe('AC-018.22 묻지 않기', () => {
    const askOn = async (made: Made) => {
      const { ticket } = await press(made)
      return finish(made, ticket, { status: 'finished', noAsk: true })
    }

    it('AC-018.22: 처음은 꺼져 있고, 끝 JSON의 값을 메모리에 둔다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모')] })
      expect((await viewOf(made)).noAsk).toBe(false)
      await askOn(made)
      const view = await viewOf(made)
      expect(view.noAsk).toBe(true)
      expect(view.targets.batch.find((row) => row.key === A.key)).toMatchObject({ chip: '메모 바꿈', replaces: '다른 메모' })
      const { payload } = await press(made)
      expect(payload?.items.find((item) => item.visitKey === A.key)?.replaces).toBe('다른 메모')
    })

    it('AC-018.22: 꺼짐과 켜짐의 묶음과 replaces가 같다. 켜지면 PC 창만 생략한다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모'), memoRow(B, '또 다른 메모')] })
      const off = await press(made)
      expect(made.posts.at(-1)).toMatchObject({ type: 'inputStart', askPc: true })
      await finish(made, off.ticket, { status: 'finished', noAsk: true })
      const on = await press(made)
      expect(made.posts.at(-1)).toMatchObject({ type: 'inputStart', askPc: false })
      expect(on.payload).toEqual(off.payload)
      expect(itemIn(on, A.key)?.replaces).toBe('다른 메모')
    })

    it('AC-018.22: noAsk: false로 답하면 띠만 꺼지고 묶음은 그대로다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모')] })
      await askOn(made)
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', noAsk: false })
      const view = await viewOf(made)
      expect(view.noAsk).toBe(false)
      expect(keysIn(view, 'diff')).toEqual([])
      expect(view.targets.batch.find((row) => row.key === A.key)).toMatchObject({ chip: '메모 바꿈', replaces: '다른 메모' })
    })

    it('AC-018.22: 오류 봉투 뒤 값은 그대로다(꺼짐·켜짐 모두)', async () => {
      const made = await ready()
      const first = await press(made)
      await made.jobs.fromPort({ type: 'sent', ticket: first.ticket, ok: false, code: 'E-BIT-READ-FAILED' })
      expect((await viewOf(made)).noAsk).toBe(false)
      await askOn(made)
      const second = await press(made)
      await made.jobs.fromPort({ type: 'sent', ticket: second.ticket, ok: false, code: 'E-BIT-READ-FAILED' })
      expect((await viewOf(made)).noAsk).toBe(true)
    })

    it('AC-018.22: 켜진 채 새 bridge-port를 받으면 꺼진다', async () => {
      const made = await ready()
      await askOn(made)
      made.jobs.portChanged()
      expect((await viewOf(made)).noAsk).toBe(false)
    })

    it('AC-016.3·AC-037.6: 묻지 않기가 켜져 있어도 [바꾸지 않기]를 누른 사람은 보내지 않는다: replaces 없이 보내면 켜진 도우미가 바꾼다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모')] })
      await askOn(made)
      await made.jobs.fromScreen({ type: 'memoApprove', visitKey: A.key, approved: true } satisfies PrecheckFromScreen)
      expect((await viewOf(made)).targets.batch.find((row) => row.key === A.key)?.replaces).toBe('다른 메모')
      await made.jobs.fromScreen({ type: 'memoApprove', visitKey: A.key, approved: false } satisfies PrecheckFromScreen)
      const view = await viewOf(made)
      expect(keysIn(view, 'diff')).toEqual([A.key])
      const { payload } = await press(made)
      expect(payload?.items.find((item) => item.visitKey === A.key)).toBeUndefined()
    })

    it(`AC-018.22: 첫 묶음 뒤 안내의 수는 replaces 없이 보내 이미 있음으로 돌아온 사람뿐이다('다른 메모 있음'·확인 표시·replaces로 보낸 사람은 없다)`, async () => {
      const made = await threeOnly([memoRow(A, '다른 메모'), memoRow(C, '다른 메모')])
      await decline(made, C.key)
      const sent = await press(made)
      expect(itemIn(sent, A.key)?.replaces).toBe('다른 메모')
      expect(itemIn(sent, B.key)).not.toHaveProperty('replaces')
      expect(itemIn(sent, C.key)).toBeUndefined()
      const result = resultOf(await finish(made, sent.ticket, { status: 'finished', noAsk: true, results: [{ ...line(A, '완료', '바꿈(기존 메모 덮어씀)'), previousMemo: '다른 메모' }, line(B, '건너뜀', '이미 있음')] }))
      expect(result.firstNoAsk).toBe(1)
    })

    it('AC-018.22: 첫 묶음 뒤 안내의 수에 replaces로 보낸 사람·직접 확인 기록이 있는 사람·보내지 않은 사람은 없다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모')], store: { journal: { [B.key]: 'skippedByHand' } } })
      const sent = await press(made)
      expect(itemIn(sent, A.key)?.replaces).toBe('다른 메모')
      expect(itemIn(sent, B.key)).not.toHaveProperty('replaces')
      const result = resultOf(await finish(made, sent.ticket, { status: 'finished', noAsk: true, results: [line(A, '건너뜀', '이미 있음'), line(B, '건너뜀', '이미 있음'), line({ key: 'gone' }, '건너뜀', '이미 있음')] }))
      expect(result.firstNoAsk).toBe(0)
    })

    it('AC-018.22: 첫 묶음 뒤 안내의 수에 다른 메모로 미리 뺀 사람이 없고 N이 0이면 null이 아닌 0이다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모'), memoRow(C, '[부위 확인]')], store: { drafts: { [C.key]: '[부위 확인] 글' } } })
      await decline(made, A.key)
      const { ticket } = await press(made)
      const result = resultOf(await finish(made, ticket, { status: 'finished', noAsk: true }))
      expect(result.firstNoAsk).toBe(0)
      const clean = await ready()
      const second = await press(clean)
      expect(resultOf(await finish(clean, second.ticket, { status: 'finished', noAsk: true })).firstNoAsk).toBe(0)
      // 이미 켜져 있었으면 안내가 없다
      const third = await press(clean)
      expect(resultOf(await finish(clean, third.ticket, { status: 'finished', noAsk: true })).firstNoAsk).toBeNull()
    })

    it('AC-018.22: 직접 확인으로 보낸 사람이 건너뜀·미처리면 사본이 skippedByHand라 다른 메모 있음에 남고 칩과 N에 들지 않는다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모'), memoRow(B, '다른 메모')], store: { journal: { [A.key]: 'writing', [B.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      const result = resultOf(await finish(made, hand.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', noAsk: true, results: [line(A, '건너뜀', '이미 있음'), line(B, '확인 필요', '미처리')] }))
      expect(result.firstNoAsk).toBe(0)
      const view = await viewOf(made)
      expect(view.noAsk).toBe(true)
      expect(keysIn(view, 'diff')).toEqual(expect.arrayContaining([A.key, B.key]))
      expect(view.targets.replacing).toBe(0)
      expect(view.stuck).toBeNull()
    })

    it('AC-018.22: 완료나 쓰다 멈춘 결과면 skippedByHand를 적지 않는다', async () => {
      const made = await ready({ bit: [memoRow(A, '다른 메모')], store: { journal: { [A.key]: 'writing', [B.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', noAsk: true, results: [line(B, '완료', '입력'), line(A, '확인 필요', '입력 완료를 확인하지 못했습니다.')] })
      const view = await viewOf(made)
      expect(view.stuck?.people.map((person) => person.key)).toEqual([A.key])
    })

    it(`AC-018.22: checkedByHand로 보낸 쓰다 멈춘 사람의 결과가 '메모 칸이 입력을 받지 않아…'이면 사본이 skippedByHand이고 띠가 풀린다`, async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'finished', results: [line(A, '확인 필요', '메모 칸이 입력을 받지 않아 입력하지 못했습니다')] })
      const view = await viewOf(made)
      expect(view.stuck).toBeNull()
      expect(rowOf(view, A.key).lastJournal).toBe('skippedByHand')
    })

    it(`AC-018.22: 마지막 unconfirmed로만 아는 사람도 '메모 칸이 입력을 받지 않아…'이면 사본이 skippedByHand이고 띠가 풀린다`, async () => {
      const made = await ready()
      const first = await press(made)
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', unconfirmed: [{ visitKey: A.key, date: DAY.from }] })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'finished', results: [line(A, '확인 필요', '메모 칸이 입력을 받지 않아 입력하지 못했습니다')] })
      const view = await viewOf(made)
      expect(view.stuck).toBeNull()
      expect(rowOf(view, A.key).lastJournal).toBe('skippedByHand')
    })

    it(`AC-016.3: '메모 칸이 입력을 받지 않아…'여도 E-STORE-FAILED인 답이면 사본을 적지 않고 띠가 남는다`, async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'stopped', code: 'E-STORE-FAILED', results: [line(A, '확인 필요', '메모 칸이 입력을 받지 않아 입력하지 못했습니다')] })
      const view = await viewOf(made)
      expect(view.stuck?.people.map((person) => person.key)).toEqual([A.key])
      expect(rowOf(view, A.key).lastJournal).toBe('writing')
    })

    it('AC-016.3: E-STORE-FAILED이거나 unconfirmed가 있는 답이면 사본을 적지 않는다', async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'stopped', code: 'E-STORE-FAILED', results: [line(A, '건너뜀', '내원일 없음')] })
      expect((await viewOf(made)).stuck?.people.map((person) => person.key)).toEqual([A.key])
      const again = await press(made, 'byHand')
      await finish(made, again.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [line(A, '건너뜀', '내원일 없음')], unconfirmed: [{ visitKey: A.key, date: DAY.from }] })
      expect((await viewOf(made)).stuck?.people.map((person) => person.key)).toEqual([A.key])
    })

    it('AC-016.3: 줄이 모두 뒤 글 없는 빠지는 까닭이면(창 없이 끝남) 사본이 skipped이고 이미 있는 skippedByHand는 그대로다', async () => {
      const made = await ready({ store: { journal: { [A.key]: 'writing', [B.key]: 'skippedByHand' } } })
      const first = await press(made, 'byHand')
      await finish(made, first.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', unconfirmed: [{ visitKey: A.key, date: DAY.from }, { visitKey: B.key, date: DAY.from }] })
      const hand = await press(made, 'byHand')
      expect(hand.payload?.items.map((item) => item.visitKey)).toEqual([A.key, B.key])
      await finish(made, hand.ticket, { status: 'finished', results: [line(A, '건너뜀', '내원일 없음'), line(B, '건너뜀', '같은 날 내원이 여러 건이라 직접 입력해 주세요')] })
      const view = await viewOf(made)
      expect(rowOf(view, A.key).lastJournal).toBe('skipped')
      expect(rowOf(view, B.key).lastJournal).toBe('skippedByHand')
    })
  })

  describe('AC-018.15 결과 엑셀', () => {
    it('AC-018.15: 누르기 전에는 만들지 않고, 칸과 두 시트가 원본과 같고 파일 이름에 환자 값이 없다', async () => {
      const made = await ready({ visible: OCTOBER, store: { journal: { gone: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'finished', results: [line({ key: 'gone' }, '건너뜀', '넣을 메모가 없어 입력하지 않았습니다 · 직접 확인해 입력 멈춤을 풀었습니다')] })
      const first = await press(made, 'selection', { ...SELECT, rangeFrom: DAY.from, rangeTo: DAY.to })
      await finish(made, first.ticket, { status: 'finished', results: [{ ...line(A, '완료', '바꿈(기존 메모 덮어씀)'), previousMemo: '옛 메모' }, line(B, '건너뜀', '내원일 없음')] })
      expect(made.posts.some((m) => m.type === 'inputExcel')).toBe(false)
      await made.jobs.fromScreen({ type: 'inputExcel', ask: 9 } satisfies PrecheckFromScreen)
      const answer = made.posts.at(-1)
      if (answer?.type !== 'inputExcel' || !answer.ok) throw new Error('엑셀 답이 없다')
      expect(answer.fileName).toBe(`비트입력결과_${OCTOBER.from}_${OCTOBER.to}.xlsx`)
      const book = XLSX.read(answer.bytes, { type: 'array' })
      expect(book.SheetNames).toEqual(['비트 입력 결과', '확인할 환자'])
      const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets['비트 입력 결과'], { header: 1, raw: true, defval: '' })
      expect(rows[0]).toEqual(['순번', '내원일', '차트번호', '환자명', '결과', '내용', '입력예정 청구메모', '기존 비트 청구메모'])
      expect(rows.find((row) => row[2] === A.chart)?.[7]).toBe('옛 메모')
      const check = XLSX.utils.sheet_to_json<string[]>(book.Sheets['확인할 환자'], { header: 1, raw: true, defval: '' })
      expect(check.slice(1).every((row) => row[4] !== '완료')).toBe(true)
    })

    const excelRows = async (made: Made) => {
      await made.jobs.fromScreen({ type: 'inputExcel', ask: 9 } satisfies PrecheckFromScreen)
      const answer = made.posts.at(-1)
      if (answer?.type !== 'inputExcel' || !answer.ok) throw new Error('엑셀 답이 없다')
      const book = XLSX.read(answer.bytes, { type: 'array' })
      return book.SheetNames.flatMap((name) => XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets[name], { header: 1, raw: true, defval: '' }).slice(1))
    }
    const expectNoFiller = (rows: (string | number)[][]) => {
      const cells = rows.flat().map(String)
      expect(cells).not.toContain('00000000000000000001')
      expect(cells).not.toContain('-')
      expect(cells).not.toContain(' ')
      expect(cells).not.toContain('2026-10-01')
    }
    const GONE = '넣을 메모가 없어 입력하지 않았습니다 · 직접 확인해 입력 멈춤을 풀었습니다'

    it('AC-018.15: [직접 확인했어요] 바로 뒤 엑셀에 자리 채움 값이 없고 내원일은 달이며 차트번호·환자명·메모는 비어 있다', async () => {
      const made = await ready({ visible: OCTOBER, store: { journal: { gone: 'writing' } } })
      const hand = await press(made, 'byHand')
      expect(hand.payload?.items[0]).toMatchObject({ chart: '00000000000000000001', name: '-', date: '2026-10-01', memo: ' ' })
      await finish(made, hand.ticket, { status: 'finished', results: [line({ key: 'gone' }, '건너뜀', GONE)] })
      const rows = await excelRows(made)
      expectNoFiller(rows)
      expect(rows[0]).toEqual([1, '2026-10', '', '', '건너뜀', GONE, '', ''])
    })

    it('AC-018.15·AC-035.9: 줄 없이 멈춘 뒤 [이어서 하기]를 지나도 자리 채움 값이 결과와 엑셀에 없다', async () => {
      const made = await ready({ visible: OCTOBER, store: { journal: { gone: 'writing' } } })
      const hand = await press(made, 'byHand')
      await finish(made, hand.ticket, { status: 'stopped', code: 'E-INPUT-STOPPED', results: [] })
      const resume = await press(made, 'resume')
      expect(resume.payload?.items[0]).toMatchObject({ chart: '00000000000000000001', name: '-', date: '2026-10-01', memo: ' ' })
      const result = resultOf(await finish(made, resume.ticket, { status: 'finished', results: [line({ key: 'gone' }, '건너뜀', GONE)] }))
      expect(result.skipped[0]).toMatchObject({ key: 'gone', date: null, month: '2026-10', name: null, chart: null, retry: false })
      expect(result.skipped[0]).not.toHaveProperty('memo')
      const rows = await excelRows(made)
      expectNoFiller(rows)
      expect(rows[0]).toEqual([1, '2026-10', '', '', '건너뜀', GONE, '', ''])
    })

    it('AC-018.15: 결과가 없으면 번호로 답한다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'inputExcel', ask: 1 } satisfies PrecheckFromScreen)
      expect(made.posts.at(-1)).toEqual({ type: 'inputExcel', ask: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    })
  })

  describe('떠났을 때(useBridge가 통로를 닫는다)', () => {
    it('입력 중에 통로가 바뀌면 그 묶음을 잊어 다음 묶음을 막지 않고, 늦은 답도 받지 않는다', async () => {
      const made = await ready()
      const { ticket } = await press(made)
      made.jobs.portChanged()
      const next = await press(made)
      expect(next.payload).not.toBeNull()
      made.posts.length = 0
      await made.jobs.fromPort({ type: 'sent', ticket, ok: false, code: 'E-BRIDGE-DISCONNECTED' })
      expect(made.posts).toEqual([])
    })

    it('저장 답을 못 받고 통로가 바뀌면 고친 메모는 저장 안 됨으로 남고 다시 저장할 수 있다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      made.jobs.portChanged()
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ text: '고친 글', unsaved: true })
      made.sent.length = 0
      await made.jobs.fromScreen({ type: 'memoSaveRetry' } satisfies PrecheckFromScreen)
      expect(JSON.parse(sends(made, 'store.save')[0].payload).drafts[A.key]).toBe('고친 글')
    })

    it('AC-013.6: 떠났다 돌아와 다시 점검해도 고친 메모는 그대로다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'editMemo', visitKey: A.key, text: '고친 글' } satisfies PrecheckFromScreen)
      made.jobs.portChanged()
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      const answer = made.posts.filter((m) => m.type === 'check').at(-1)
      if (answer?.type !== 'check' || !answer.ok) throw new Error('점검 답이 없다')
      expect(answer.view.visits.find((visit) => visit.key === A.key)?.memo?.text).toBe('고친 글')
      expect(rowOf(await viewOf(made), A.key).text).toBe('고친 글')
    })
  })

  describe('AC-018.25 입력을 마친 사람의 카드', () => {
    it('AC-018.25: 입력을 마치면 다시 불러오기 전까지 표시가 있고, 성공한 다시 불러오기가 지운다', async () => {
      const made = await ready()
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', results: [line(A, '완료', '입력')] })
      expect(rowOf(await viewOf(made), A.key).afterEntry).toBe(true)
      await made.jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'r1', memosJson([]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1 } satisfies PrecheckFromScreen)
      expect(rowOf(await viewOf(made), A.key).afterEntry).toBe(false)
    })

    it('AC-018.24: 받은 비트 메모의 수와 기간이 보기 모양에 있다', async () => {
      const made = await ready({ bit: [memoRow(A, '글'), memoRow(B, '글')] })
      expect((await viewOf(made)).bit).toEqual({ has: true, count: 2, period: DAY })
    })

    it('AC-016.8: 읽은 적이 없으면 has가 거짓이다', async () => {
      const posts: PrecheckToScreen[] = []
      const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables })
      await loadInto(jobs, 'month', MEMO_MONTH, 1)
      await jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      await jobs.fromScreen({ type: 'memoView', ask: 1, selection: SELECT } satisfies PrecheckFromScreen)
      const answer = posts.at(-1)
      if (answer?.type !== 'memoView' || !answer.ok) throw new Error('memoView 답이 없다')
      expect(answer.view.bit).toEqual({ has: false, count: 0, period: null })
    })
  })

  describe('AC-018.18 메모를 만들지 않는 병원', () => {
    it('AC-018.18: 쓰다 멈춘 기록이 있어도 띠 자료가 없다', async () => {
      const made = await ready({ settings: { ...SETTINGS, phrases: null }, store: { journal: { [A.key]: 'writing' } } })
      const view = await viewOf(made)
      expect(view.memoBlocked).toBe('E-MEMO-NO-SETTINGS')
      expect(view.stuck).toBeNull()
      expect((await press(made, 'byHand')).payload).toBeNull()
    })

    it('AC-018.18: memoBlocked면 목록과 표가 비고 입력을 시작할 수 없다', async () => {
      const made = await ready({ settings: { ...SETTINGS, phrases: null } })
      const view = await viewOf(made)
      expect(view.memoBlocked).toBe('E-MEMO-NO-SETTINGS')
      expect(view.table).toEqual([])
      expect(view.targets.batch).toEqual([])
      expect((await press(made)).payload).toBeNull()
    })
  })

  // ── 어느 메모든 고치기(memo-edit-any REQ-2202·REQ-2204): 완료한 사람을 고치면 완료가 풀리고 '메모 바꿈'으로 든다 ──
  describe('REQ-2202 고친 완료 메모는 완료가 풀린다', () => {
    const edit = (made: Made, key: string, text: string) => made.jobs.fromScreen({ type: 'editMemo', visitKey: key, text } satisfies PrecheckFromScreen)
    const saves = (made: Made) => sends(made, 'store.save').map((m) => JSON.parse(m.payload) as Record<string, unknown>)
    const inBatch = (view: MemoScreenView, key: string) => view.targets.batch.find((row) => row.key === key)
    /** 완료한 A: 달 파일 done에 넣은 글, 입력 기록 done, 비트 메모도 그 글 */
    const FINISHED = { bit: [memoRow(A, '넣은 글')], store: { drafts: { other: '파일 글' }, done: { [A.key]: '넣은 글', older: '완료 글' }, journal: { [A.key]: 'done' } } }

    it('AC-2202.1·AC-2204.1: 완료한 사람을 고치면 store.save 한 번에 drafts와 done false가 가고, 메모 바꿈·replaces로 묶음에 든다', async () => {
      const made = await ready(FINISHED)
      const before = await viewOf(made)
      expect(rowOf(before, A.key)).toMatchObject({ done: true, compare: '같음' })
      expect(keysIn(before, 'done')).toContain(A.key)
      await edit(made, A.key, '고친 글')
      const [save, ...rest] = saves(made)
      expect(rest).toEqual([])
      expect(save).toEqual({ month: '2026-10', drafts: { other: '파일 글', [A.key]: '고친 글' }, done: { [A.key]: false, older: '완료 글' } })
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ done: false, edited: true, compare: '다름', text: '고친 글' })
      expect(keysIn(view, 'done')).not.toContain(A.key)
      expect(inBatch(view, A.key)).toMatchObject({ chip: '메모 바꿈', replaces: '넣은 글' })
      const item = itemIn(await press(made), A.key)!
      expect(Object.keys(item).sort()).toEqual(['chart', 'date', 'memo', 'name', 'replaces', 'visitKey'])
      expect(item).toMatchObject({ visitKey: A.key, chart: A.chart, date: DAY.from, memo: '고친 글', replaces: '넣은 글' })
    })

    it('AC-2202.2: 완료 기록 없이 같음인 사람을 고치면 done은 받은 그대로이고 메모 바꿈으로 든다', async () => {
      const auto = rowOf(await viewOf(await ready()), B.key).text
      const made = await ready({ bit: [memoRow(B, auto)], store: { done: { older: '완료 글' } } })
      expect(rowOf(await viewOf(made), B.key)).toMatchObject({ done: true, compare: '같음' })
      await edit(made, B.key, '고친 글')
      expect(saves(made)).toEqual([{ month: '2026-10', drafts: { [B.key]: '고친 글' }, done: { older: '완료 글' } }])
      const view = await viewOf(made)
      expect(rowOf(view, B.key)).toMatchObject({ done: false, compare: '다름' })
      expect(inBatch(view, B.key)).toMatchObject({ chip: '메모 바꿈', replaces: auto })
    })

    it('AC-2202.3: 이 화면에서 넣은 뒤 고치면 그때 넣은 글로 견주어 메모 바꿈이 되고, 고치지 않은 사람·다시 불러온 뒤는 읽은 글로 견준다', async () => {
      const made = await ready()
      const first = await press(made)
      const entered = itemIn(first, A.key)!.memo
      await finish(made, first.ticket, { status: 'finished', results: [line(A, '완료', '입력'), line(C, '완료', '입력')] })
      const after = await viewOf(made)
      expect(rowOf(after, A.key)).toMatchObject({ done: true, afterEntry: true, compare: '비트에 없음' })
      await edit(made, A.key, '고친 글')
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ done: false, compare: '다름', inBit: entered })
      expect(inBatch(view, A.key)).toMatchObject({ chip: '메모 바꿈', replaces: entered })
      // 고치지 않은 C는 지금처럼 받은 사본 그대로다
      expect(rowOf(view, C.key)).toMatchObject({ done: true, compare: '비트에 없음' })
      expect(itemIn(await press(made), A.key)).toMatchObject({ memo: '고친 글', replaces: entered })
      // 성공한 비트 메모 다시 불러오기 뒤에는 읽은 글로 견준다
      await made.jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'r1', memosJson([memoRow(A, '누가 바꾼 글')]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1 } satisfies PrecheckFromScreen)
      const reread = await viewOf(made)
      expect(rowOf(reread, A.key)).toMatchObject({ afterEntry: false, compare: '다름', inBit: '누가 바꾼 글' })
      expect(inBatch(reread, A.key)?.replaces).toBe('누가 바꾼 글')
    })

    it('AC-2202.3: 넣은 글이 4,000자를 넘으면 고친 뒤 비트 메모를 읽지 못한 것이다', async () => {
      const made = await ready()
      const long = '글'.repeat(4001)
      await edit(made, A.key, long)
      const first = await press(made)
      expect(itemIn(first, A.key)?.memo).toBe(long)
      await finish(made, first.ticket, { status: 'finished', results: [line(A, '완료', '입력')] })
      await edit(made, A.key, '고친 글')
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ done: false, compare: '조회 못함' })
      expect(keysIn(view, 'unread')).toContain(A.key)
      expect(inBatch(view, A.key)).toBeUndefined()
    })

    it('AC-2202.4: 고치지 않거나 글이 같은 editMemo면 완료 그대로이고 저장도 없다(비트 메모가 뒤에 바뀌어도)', async () => {
      const made = await ready({ bit: [memoRow(A, '누가 바꾼 글')], store: { done: { [A.key]: '넣은 글' }, journal: { [A.key]: 'done' } } })
      const before = await viewOf(made)
      expect(rowOf(before, A.key)).toMatchObject({ done: true, compare: '다름' })
      await edit(made, A.key, '넣은 글')
      expect(saves(made)).toEqual([])
      const view = await viewOf(made)
      expect(rowOf(view, A.key).done).toBe(true)
      expect(keysIn(view, 'done')).toContain(A.key)
      expect(batchKeys(view)).not.toContain(A.key)
      expect(itemIn(await press(made), A.key)).toBeUndefined()
    })

    it('AC-2202.5: done false로 저장된 사람은 다시 불러와도 완료가 아니고, 다음 저장에도 false가 남는다', async () => {
      const made = await ready({ bit: [memoRow(A, '넣은 글')], store: { drafts: { [A.key]: '고친 글' }, done: { [A.key]: false }, journal: { [A.key]: 'done' } } })
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ done: false, edited: true, compare: '다름', text: '고친 글' })
      expect(keysIn(view, 'done')).not.toContain(A.key)
      expect(inBatch(view, A.key)).toMatchObject({ chip: '메모 바꿈', replaces: '넣은 글' })
      await edit(made, B.key, 'B 고친 글')
      expect(saves(made)).toEqual([{ month: '2026-10', drafts: { [A.key]: '고친 글', [B.key]: 'B 고친 글' }, done: { [A.key]: false } }])
    })

    it('AC-2202.6: 풀린 사람이 다시 완료되면 done에 고친 글이 남아 다시 완료이고, 건너뜀·확인 필요면 풀린 채다', async () => {
      const entered = await ready(FINISHED)
      await edit(entered, A.key, '고친 글')
      const first = await press(entered)
      entered.sent.length = 0
      await finish(entered, first.ticket, { status: 'finished', results: [line(A, '완료', '바꿈(기존 메모 덮어씀)')] })
      expect(saves(entered).at(-1)).toMatchObject({ done: { [A.key]: '고친 글', older: '완료 글' } })
      expect(rowOf(await viewOf(entered), A.key)).toMatchObject({ done: true, text: '고친 글' })
      for (const result of [line(A, '건너뜀', '입력 직전 기존 청구메모가 변경되었습니다. 현재 내용을 다시 비교해 주세요.'), line(A, '확인 필요', '미처리')]) {
        const made = await ready(FINISHED)
        await edit(made, A.key, '고친 글')
        const run = await press(made)
        made.sent.length = 0
        await finish(made, run.ticket, { status: result.result === '확인 필요' ? 'stopped' : 'finished', code: result.result === '확인 필요' ? 'E-INPUT-STOPPED' : null, results: [result] })
        for (const save of saves(made)) expect(save).toMatchObject({ done: { [A.key]: false } })
        expect(rowOf(await viewOf(made), A.key).done).toBe(false)
      }
    })

    it('AC-2202.7: 저장 실패 뒤 고친 메모를 남기고 다시 불러오면 완료 풀림도 다시 얹혀 다음 저장에 false가 간다', async () => {
      const made = await ready(FINISHED)
      await edit(made, A.key, '고친 글')
      await made.jobs.fromPort({ type: 'sent', ticket: sends(made, 'store.save')[0].ticket, ok: false, code: 'E-STORE-FAILED' })
      made.sent.length = 0
      await made.jobs.fromScreen({ type: 'loadStart', load: 2, keepEdits: true } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'm2', MEMO_MONTH)
      await made.jobs.fromScreen({ type: 'month', id: 'm2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'b2', memosJson([memoRow(A, '넣은 글')]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'b2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 's2', storeJson({ done: { [A.key]: '넣은 글' }, journal: { [A.key]: 'done' } }))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'store', id: 's2', load: 2 } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ done: false, text: '고친 글', compare: '다름', unsaved: true })
      expect(inBatch(view, A.key)).toMatchObject({ chip: '메모 바꿈', replaces: '넣은 글' })
      expect(saves(made).filter((save) => save.month)).toEqual([{ month: '2026-10', drafts: { [A.key]: '고친 글' }, done: { [A.key]: false } }])
    })

    it('AC-2202.8: 설정을 바꿔 다시 점검하면 손대지 않은 메모만 바뀌고, 풀린 사람의 고친 글과 완료한 사람의 글·완료는 그대로다', async () => {
      const made = await ready({ bit: [memoRow(A, '넣은 글')], store: { done: { [A.key]: '넣은 글', [B.key]: 'B 완료 글' }, journal: { [A.key]: 'done' } } })
      await edit(made, A.key, '고친 글')
      const before = await viewOf(made)
      const untouched = rowOf(before, C.key).text
      await made.jobs.fromScreen(CHECK_AGAIN(2, CHANGED))
      const view = await viewOf(made)
      expect(rowOf(view, C.key).text).not.toBe(untouched)
      expect(rowOf(view, A.key)).toMatchObject({ text: '고친 글', done: false })
      expect(rowOf(view, B.key)).toMatchObject({ text: 'B 완료 글', done: true })
      expect(keysIn(view, 'done')).toContain(B.key)
    })

    it('AC-2202.3·AC-2202.6: 풀린 사람이 다시 완료되면 비교는 다시 받은 사본으로 한다(고치지 않은 완료 줄과 같다)', async () => {
      const made = await ready(FINISHED)
      await edit(made, A.key, '고친 글')
      const run = await press(made)
      await finish(made, run.ticket, { status: 'finished', results: [line(A, '완료', '바꿈(기존 메모 덮어씀)')] })
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ done: true, afterEntry: true, compare: '다름', inBit: '넣은 글' })
      expect(keysIn(view, 'done')).toContain(A.key)
    })

    it('AC-2202.7: 첫 저장 답 전에 두 번 고친 뒤 저장이 실패하고 고친 메모를 남겨 다시 불러와도 풀린 채다', async () => {
      const made = await ready(FINISHED)
      await edit(made, A.key, '처음 고친 글')
      await edit(made, A.key, '또 고친 글')
      for (const save of sends(made, 'store.save')) await made.jobs.fromPort({ type: 'sent', ticket: save.ticket, ok: false, code: 'E-STORE-FAILED' })
      made.sent.length = 0
      await made.jobs.fromScreen({ type: 'loadStart', load: 2, keepEdits: true } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'm2', MEMO_MONTH)
      await made.jobs.fromScreen({ type: 'month', id: 'm2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'b2', memosJson([memoRow(A, '넣은 글')]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'b2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 's2', storeJson({ done: { [A.key]: '넣은 글' }, journal: { [A.key]: 'done' } }))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'store', id: 's2', load: 2 } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ done: false, text: '또 고친 글', compare: '다름' })
      expect(saves(made).filter((save) => save.month)).toEqual([{ month: '2026-10', drafts: { [A.key]: '또 고친 글' }, done: { [A.key]: false } }])
    })

    it('AC-2202.6: 저장 답 전에 다시 완료되면 남은 고친 글에 완료 풀림이 남지 않아, 고친 메모를 남겨 다시 불러와도 완료다', async () => {
      const made = await ready(FINISHED)
      await edit(made, A.key, '고친 글')
      const run = await press(made)
      await finish(made, run.ticket, { status: 'finished', results: [line(A, '완료', '바꿈(기존 메모 덮어씀)')] })
      made.sent.length = 0
      await made.jobs.fromScreen({ type: 'loadStart', load: 2, keepEdits: true } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'm2', MEMO_MONTH)
      await made.jobs.fromScreen({ type: 'month', id: 'm2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 'b2', memosJson([memoRow(A, '고친 글')]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'b2', load: 2 } satisfies PrecheckFromScreen)
      await stream(made.jobs, 's2', storeJson({ drafts: { [A.key]: '고친 글' }, done: { [A.key]: '고친 글' }, journal: { [A.key]: 'done' } }))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'store', id: 's2', load: 2 } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ done: true, text: '고친 글' })
      expect(keysIn(view, 'done')).toContain(A.key)
      for (const save of saves(made).filter((one) => one.month)) expect(save).toMatchObject({ done: { [A.key]: '고친 글' } })
    })
  })

  // ── 복사(완료)·완료 풀기(REQ-3104): 화면이 클립보드에 복사한 뒤 알린다. 완료 저장 자리는 자동 입력 '완료'와 같은 달 칸 done이다 ──
  describe('REQ-3104 복사로 완료·완료 풀기', () => {
    const copied = (made: Made, key: string, text: string) => made.jobs.fromScreen({ type: 'memoCopied', visitKey: key, text } satisfies PrecheckFromScreen)
    const undone = (made: Made, key: string) => made.jobs.fromScreen({ type: 'memoUndone', visitKey: key } satisfies PrecheckFromScreen)
    const edit = (made: Made, key: string, text: string) => made.jobs.fromScreen({ type: 'editMemo', visitKey: key, text } satisfies PrecheckFromScreen)
    const saves = (made: Made) => sends(made, 'store.save').map((m) => JSON.parse(m.payload) as Record<string, unknown>)
    /** 목록에서 그 사람의 자리: 묶음(입력할 사람은 'batch')·그 안의 차례·줄의 done */
    const placeOf = (view: MemoScreenView, key: string) => {
      const groups = [{ group: 'batch', rows: view.targets.batch }, ...view.targets.left.map((left) => ({ group: left.reason as string, rows: left.rows }))]
      for (const { group, rows } of groups) {
        const index = rows.findIndex((row) => row.key === key)
        if (index >= 0) return { group, index, done: rows[index].done }
      }
      return null
    }
    /** 다시 [자료 불러오기]: 도우미가 그 PC에 둔 달 칸을 store.load로 돌려준다 */
    const reloadAll = async (made: Made, load: number, store: Partial<StoreMonthJson>, bit: MemoRowRaw[] = []) => {
      await made.jobs.fromScreen({ type: 'loadStart', load, keepEdits: true } satisfies PrecheckFromScreen)
      await stream(made.jobs, `m${load}`, MEMO_MONTH)
      await made.jobs.fromScreen({ type: 'month', id: `m${load}`, load } satisfies PrecheckFromScreen)
      await stream(made.jobs, `b${load}`, memosJson(bit))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: `b${load}`, load } satisfies PrecheckFromScreen)
      await stream(made.jobs, `s${load}`, storeJson(store))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'store', id: `s${load}`, load } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen({ type: 'check', check: load, load, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
    }

    it('AC-3104.1: 지금 우리 메모와 같은 글을 복사하면 자동 입력 완료처럼 완료로 두고 그 달 칸 done에 그 글을 실어 store.save로 보낸다(화면에는 아무것도 보내지 않는다)', async () => {
      const made = await ready({ store: { drafts: { other: '파일 글' }, done: { older: '완료 글' } } })
      const text = rowOf(await viewOf(made), A.key).text
      made.posts.length = 0
      await copied(made, A.key, text)
      expect(saves(made)).toEqual([{ month: '2026-10', drafts: { other: '파일 글' }, done: { older: '완료 글', [A.key]: text } }])
      expect(made.posts).toEqual([]) // 날짜별 건수도 다시 보내지 않는다(범위 밖)
      expect(rowOf(await viewOf(made), A.key)).toMatchObject({ done: true, text })
    })

    it('AC-3104.4: 복사로 새로 완료한 사람은 메모 보기를 다시 만들어도 완료 전과 같은 묶음·같은 차례에 있고 줄에 done이 켜져 있다', async () => {
      const made = await ready({ bit: [memoRow(B, '비트 글')] })
      const before = await viewOf(made)
      expect(placeOf(before, A.key)).toMatchObject({ group: 'batch', done: false })
      expect(before.targets.batch.find((row) => row.key === B.key)).toMatchObject({ chip: '메모 바꿈', done: false })
      await copied(made, A.key, rowOf(before, A.key).text)
      await copied(made, B.key, rowOf(before, B.key).text)
      const view = await viewOf(made)
      expect(batchKeys(view)).toEqual(batchKeys(before))
      expect(placeOf(view, A.key)).toEqual({ ...placeOf(before, A.key)!, done: true })
      expect(placeOf(view, B.key)).toEqual({ ...placeOf(before, B.key)!, done: true })
      expect(view.targets.batch.find((row) => row.key === B.key)?.chip).toBe('메모 바꿈')
      expect(keysIn(view, 'done')).not.toEqual(expect.arrayContaining([A.key]))
      expect(keysIn(view, 'done')).not.toEqual(expect.arrayContaining([B.key]))
      expect(rowOf(view, A.key).done).toBe(true)
      expect(rowOf(view, B.key).done).toBe(true)
    })

    it('AC-3104.1: 복사한 글이 지금 우리 메모와 다르거나, 확인 표시가 남았거나, 빈 메모·메모 없는 진료·없는 진료면 아무것도 바꾸지 않고 보내지 않는다', async () => {
      const made = await ready({ store: { drafts: { [B.key]: '[부위 확인] 글', [C.key]: ' ', [NO_MEMO]: '사람이 친 글' } } })
      const before = await viewOf(made)
      const text = rowOf(before, A.key).text
      expect(rowOf(before, B.key)).toMatchObject({ unfinished: true })
      await copied(made, A.key, `${text} 더한 글`) // 화면이 쥔 글이 Worker의 글과 다르다
      await copied(made, B.key, '[부위 확인] 글')
      await copied(made, C.key, ' ')
      await copied(made, NO_MEMO, '사람이 친 글')
      await copied(made, 'gone', '글')
      expect(made.sent).toEqual([])
      const view = await viewOf(made)
      for (const key of [A.key, B.key, C.key, NO_MEMO]) expect(rowOf(view, key).done).toBe(false)
      expect(placeOf(view, A.key)).toEqual(placeOf(before, A.key))
      expect(keysIn(view, 'mark')).toContain(B.key)
      expect(keysIn(view, 'nomemo')).toEqual(expect.arrayContaining([C.key, NO_MEMO]))
      expect(itemIn(await press(made), A.key)).toMatchObject({ memo: text })
    })

    it('AC-3104.1·AC-3104.4: 이미 완료한 사람(완료 표시·비교 같음·복사로 완료)을 다시 복사하면 바꾸지 않고 보내지 않으며 자리도 그대로다', async () => {
      const auto = rowOf(await viewOf(await ready()), C.key).text
      const made = await ready({ bit: [memoRow(C, auto)], store: { done: { [A.key]: '완료 글' } } })
      const before = await viewOf(made)
      expect(placeOf(before, A.key)).toMatchObject({ group: 'done', done: true })
      expect(placeOf(before, C.key)).toMatchObject({ group: 'done', done: true })
      await copied(made, A.key, '완료 글')
      await copied(made, C.key, auto)
      expect(made.sent).toEqual([])
      const between = await viewOf(made)
      expect(placeOf(between, A.key)).toEqual(placeOf(before, A.key))
      expect(placeOf(between, C.key)).toEqual(placeOf(before, C.key))
      // 복사로 완료한 B를 다시 복사해도 한 번만 보낸다
      const text = rowOf(before, B.key).text
      await copied(made, B.key, text)
      expect(saves(made)).toHaveLength(1)
      made.sent.length = 0
      await copied(made, B.key, text)
      expect(made.sent).toEqual([])
      expect(placeOf(await viewOf(made), B.key)).toEqual({ ...placeOf(before, B.key)!, done: true })
    })

    it('AC-3104.1: 고쳐 완료를 푼 사람을 저장 답 전에 복사로 다시 완료하면 남은 고친 글에 완료 풀림이 남지 않아, 고친 메모를 남겨 다시 불러와도 완료다', async () => {
      const made = await ready({ bit: [memoRow(A, '넣은 글')], store: { done: { [A.key]: '넣은 글' }, journal: { [A.key]: 'done' } } })
      await edit(made, A.key, '고친 글')
      expect(rowOf(await viewOf(made), A.key).done).toBe(false)
      await copied(made, A.key, '고친 글')
      expect(saves(made).at(-1)).toMatchObject({ done: { [A.key]: '고친 글' } })
      for (const save of sends(made, 'store.save')) await made.jobs.fromPort({ type: 'sent', ticket: save.ticket, ok: false, code: 'E-STORE-FAILED' })
      await reloadAll(made, 2, { done: { [A.key]: '넣은 글' }, journal: { [A.key]: 'done' } }, [memoRow(A, '넣은 글')])
      const view = await viewOf(made)
      expect(rowOf(view, A.key)).toMatchObject({ done: true, text: '고친 글' })
      expect(keysIn(view, 'done')).toContain(A.key)
    })

    it('AC-3104.2: [완료 풀기]는 복사로 한 완료와 불러온 완료 표시를 고쳐 푼 것처럼 푼다: 그 달 칸 done에 false를 두어 store.save로 보내고 다시 입력할 사람이다', async () => {
      const made = await ready({ store: { drafts: { other: '파일 글' }, done: { [C.key]: 'C 완료 글' } } })
      const before = await viewOf(made)
      expect(placeOf(before, C.key)).toMatchObject({ group: 'done', done: true })
      const text = rowOf(before, A.key).text
      await copied(made, A.key, text)
      made.sent.length = 0
      made.posts.length = 0
      await undone(made, A.key)
      expect(saves(made)).toEqual([{ month: '2026-10', drafts: { other: '파일 글' }, done: { [A.key]: false, [C.key]: 'C 완료 글' } }])
      made.sent.length = 0
      await undone(made, C.key)
      expect(saves(made)).toEqual([{ month: '2026-10', drafts: { other: '파일 글' }, done: { [A.key]: false, [C.key]: false } }])
      expect(made.posts).toEqual([])
      const view = await viewOf(made)
      expect(placeOf(view, A.key)).toEqual(placeOf(before, A.key))
      expect(rowOf(view, A.key).done).toBe(false)
      expect(placeOf(view, C.key)).toMatchObject({ group: 'batch', done: false })
      expect((await press(made)).payload?.items.map((item) => item.visitKey)).toEqual(expect.arrayContaining([A.key, C.key]))
    })

    it('AC-3104.2·AC-3104.3: 비교가 같음이라 완료인 사람과 완료가 아닌 사람은 [완료 풀기]를 받아도 아무것도 하지 않는다', async () => {
      const auto = rowOf(await viewOf(await ready()), C.key).text
      const made = await ready({ bit: [memoRow(A, '넣은 글'), memoRow(C, auto)], store: { done: { [A.key]: '넣은 글' }, journal: { [A.key]: 'done' } } })
      const before = await viewOf(made)
      expect(rowOf(before, A.key)).toMatchObject({ compare: '같음', done: true })
      expect(rowOf(before, C.key)).toMatchObject({ compare: '같음', done: true })
      await undone(made, A.key) // 완료 표시도 있지만 비트 메모가 같아 풀어도 다시 완료다
      await undone(made, C.key)
      await undone(made, B.key)
      await undone(made, 'gone')
      expect(made.sent).toEqual([])
      const view = await viewOf(made)
      expect(placeOf(view, A.key)).toEqual(placeOf(before, A.key))
      expect(placeOf(view, C.key)).toEqual(placeOf(before, C.key))
      expect(placeOf(view, B.key)).toEqual(placeOf(before, B.key))
    })

    it('AC-3104.2·AC-3104.4: 복사로 완료한 뒤 [완료 풀기]를 하면 자리 지키기도 풀린다: 그 뒤 자동 입력으로 완료되면 이미 입력됨에 든다', async () => {
      const made = await ready()
      await copied(made, A.key, rowOf(await viewOf(made), A.key).text)
      await undone(made, A.key)
      const run = await press(made)
      expect(itemIn(run, A.key)).toBeDefined()
      await finish(made, run.ticket, { status: 'finished', results: [line(A, '완료', '입력')] })
      expect(placeOf(await viewOf(made), A.key)).toMatchObject({ group: 'done', done: true })
    })

    it('AC-3104.5: 복사로 완료한 사람은 보기에서 자리를 지켜도 [비트에 입력] 묶음에 들지 않고, 바뀌는 다른 메모 수에서도 빠진다', async () => {
      const made = await ready({ bit: [memoRow(B, '비트 글')] })
      const before = await viewOf(made)
      expect(before.targets.replacing).toBeGreaterThan(0)
      await copied(made, A.key, rowOf(before, A.key).text)
      await copied(made, B.key, rowOf(before, B.key).text)
      const view = await viewOf(made)
      expect(batchKeys(view)).toEqual(batchKeys(before))
      expect(view.targets.replacing).toBe(before.targets.replacing - 1)
      const { payload } = await press(made)
      const rest = batchKeys(before).filter((key) => key !== A.key && key !== B.key)
      expect(payload?.items.map((item) => item.visitKey)).toEqual(rest)
      expect(made.posts.at(-1)).toMatchObject({ type: 'inputStart', ok: true, count: rest.length })
    })

    it('AC-3104.5: 입력할 사람을 모두 복사로 완료하면 0명 안내가 나오고 [비트에 입력]은 묶음을 보내지 않는다', async () => {
      const first = await viewOf(await ready())
      const others = first.table.filter((row) => ![A.key, B.key, C.key].includes(row.key)).map((row) => row.key)
      const made = await ready({ store: { done: Object.fromEntries(others.map((key) => [key, true])) } })
      const before = await viewOf(made)
      expect(batchKeys(before)).toEqual([A.key, B.key, C.key])
      for (const key of [A.key, B.key, C.key]) await copied(made, key, rowOf(before, key).text)
      const view = await viewOf(made)
      expect(batchKeys(view)).toEqual([A.key, B.key, C.key])
      expect(view.targets.problem).toBe('10/12에 입력할 환자가 없습니다. (완료한 환자와 메모가 없는 환자는 뺍니다)')
      const { payload } = await press(made)
      expect(payload).toBeNull()
      expect(made.posts.at(-1)).toMatchObject({ type: 'inputStart', ok: false })
    })

    it('AC-3104.7·AC-3104.4: 복사로 한 완료는 다시 [자료 불러오기]를 해도 남고(도우미가 그 PC에 둔 달 칸), 새 불러오기에서는 자리 지키기를 잊고 이미 입력됨에 든다', async () => {
      const made = await ready()
      const before = await viewOf(made)
      const text = rowOf(before, A.key).text
      await copied(made, A.key, text)
      expect(sends(made, 'store.save')).toHaveLength(1)
      const [save] = saves(made) as { drafts: Record<string, string>; done: Record<string, string | boolean> }[]
      await made.jobs.fromPort({ type: 'sent', ticket: sends(made, 'store.save')[0].ticket, ok: true })
      expect(placeOf(await viewOf(made), A.key)).toEqual({ ...placeOf(before, A.key)!, done: true })
      await reloadAll(made, 2, { drafts: save.drafts, done: save.done }) // 도우미가 저장해 둔 그대로 돌려준다
      const view = await viewOf(made)
      expect(placeOf(view, A.key)).toMatchObject({ group: 'done', done: true })
      expect(rowOf(view, A.key)).toMatchObject({ done: true, text })
      expect(batchKeys(view)).not.toContain(A.key)
    })
  })

  // ── 건수(REQ-019): Worker가 언제 무엇을 화면에 보내나. 올리기는 useCountsUpload.test.ts ──
  describe('AC-019 날짜별 건수', () => {
    const countsIn = (posts: readonly PrecheckToScreen[]) => posts.flatMap((m) => (m.type === 'dayCounts' ? [m.rows] : []))
    const messagesIn = (posts: readonly PrecheckToScreen[]) => posts.filter((m) => m.type === 'dayCounts')
    const countPosts = (posts: readonly PrecheckToScreen[]) => posts.filter((m) => m.type === 'dayCounts')
    /** ready와 같지만 화면으로 간 메시지를 비우지 않는다 */
    async function firstLoad(options: { bit?: MemoRowRaw[] | null; settings?: CheckSettings; visible?: { from: string; to: string }; store?: Partial<StoreMonthJson>; blockStore?: boolean } = {}) {
      const posts: PrecheckToScreen[] = []
      const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables, toPort: () => {} })
      await loadInto(jobs, 'month', MEMO_MONTH, 1)
      if (options.bit !== null) {
        await stream(jobs, 'memos', memosJson(options.bit ?? []))
        await jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos', load: 1 } satisfies PrecheckFromScreen)
      }
      if (options.blockStore) {
        await jobs.fromScreen({ type: 'storeBlock' } satisfies PrecheckFromScreen) // 달 칸이 다른 병원 파일이다(AC-018.17)
      } else {
        await stream(jobs, 'store', storeJson(options.store ?? {}))
        await jobs.fromScreen({ type: 'loadPart', part: 'store', id: 'store', load: 1 } satisfies PrecheckFromScreen)
      }
      await jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: options.visible ?? DAY, settings: options.settings ?? SETTINGS } satisfies PrecheckFromScreen)
      return { jobs, posts }
    }
    /** 표에서 다시 세어 Worker가 보낸 건수와 견준다 */
    const needOf = (view: MemoScreenView) => view.table.filter((row) => row.hasMemo).length
    const reload = async (made: Made, run: number, text: string) => {
      await made.jobs.fromScreen({ type: 'memoReloadStart', run } satisfies PrecheckFromScreen)
      await stream(made.jobs, `r${run}`, text)
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: `r${run}`, load: 1, run } satisfies PrecheckFromScreen)
    }
    const memosIn = (rows: MemoRowRaw[], over: Partial<ClaimMemosJson> = {}) => JSON.stringify({ version: 1, period: DAY, truncated: false, invalidRows: 0, rows, ...over } satisfies ClaimMemosJson)

    it('AC-019.3·AC-019.4: 불러오기가 끝나면(점검 답) 날짜별 건수를 보낸다. 날짜와 정수뿐이고 환자 글자가 없다', async () => {
      const { posts, jobs } = await firstLoad()
      const [rows, ...more] = countsIn(posts)
      expect(more).toEqual([])
      expect(rows).toHaveLength(1)
      expect(Object.keys(rows[0]).sort()).toEqual(['entered', 'need_memo', 'needs_check', 'skipped', 'visit_date'])
      expect(rows[0].visit_date).toBe(DAY.from)
      await jobs.fromScreen({ type: 'memoView', ask: 1, selection: SELECT } satisfies PrecheckFromScreen)
      const answer = posts.find((m) => m.type === 'memoView')
      if (answer?.type !== 'memoView' || !answer.ok) throw new Error('memoView 답이 없다')
      expect(rows[0]).toEqual({ visit_date: DAY.from, need_memo: needOf(answer.view), entered: 0, needs_check: 0, skipped: 0 })
      expect(rows[0].need_memo).toBeGreaterThan(0)
      expectNoPatientText(countPosts(posts))
    })

    it('AC-019.4: 건수 메시지에 불러오기 번호와 고른 기간이 있다. Worker의 줄은 다섯 칸이다(진료 수는 화면이 붙인다)', async () => {
      const { posts } = await firstLoad()
      const [message] = messagesIn(posts)
      expect(Object.keys(message).sort()).toEqual(['load', 'range', 'rows', 'type'])
      expect(message).toMatchObject({ type: 'dayCounts', load: 1, range: DAY })
      if (message.type !== 'dayCounts') throw new Error('건수가 아니다')
      expect(Object.keys(message.rows[0]).sort()).toEqual(['entered', 'need_memo', 'needs_check', 'skipped', 'visit_date'])
    })

    it('AC-019.4: 진료 없는 기간이면 빈 줄과 고른 기간을 보낸다(화면이 사라진 날을 덮을 수 있게)', async () => {
      const empty = { from: '2026-12-01', to: '2026-12-03' }
      const { posts } = await firstLoad({ visible: empty })
      expect(posts.at(-1)).toMatchObject({ type: 'check', ok: true })
      expect(messagesIn(posts)).toEqual([{ type: 'dayCounts', load: 1, rows: [], range: empty }])
    })

    it('AC-019.4: 번호는 마지막 불러오기의 번호이고 [다시 점검]·다시 불러오기·입력 끝에도 같다', async () => {
      const made = await ready()
      await made.jobs.fromScreen(CHECK_AGAIN(2))
      await reload(made, 1, memosIn([]))
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', results: [line(A, '완료', '입력')] })
      expect(messagesIn(made.posts).map((m) => (m as { load: number }).load)).toEqual([1, 1, 1])
    })

    it('AC-019.3: 불러올 때 비트 메모가 없었으면 그 뒤 성공한 다시 불러오기에도 건수가 없다(비교가 모두 조회 못함이다)', async () => {
      const { posts, jobs } = await firstLoad({ bit: null })
      posts.length = 0
      await jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
      await stream(jobs, 'r1', memosIn([memoRow(A, '비트 메모')]))
      await jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1 } satisfies PrecheckFromScreen)
      expect(posts.at(-1)).toMatchObject({ type: 'loadPart', part: 'memos', run: 1, ok: true })
      expect(countsIn(posts)).toEqual([])
      // 그래도 [다시 점검]에도 없다
      await jobs.fromScreen(CHECK_AGAIN(2))
      expect(countsIn(posts)).toEqual([])
    })

    it('AC-019.3·AC-018.17: 달 칸이 막히면 건수가 없다(입력 수가 떨어진 수로 덮지 않는다). 다음 불러오기에서 읽히면 다시 보낸다', async () => {
      const { posts, jobs } = await firstLoad({ blockStore: true })
      expect(posts.at(-1)).toMatchObject({ type: 'check', ok: true })
      expect(countsIn(posts)).toEqual([])

      posts.length = 0
      await jobs.fromScreen({ type: 'loadStart', load: 2, keepEdits: true } satisfies PrecheckFromScreen)
      await stream(jobs, 'month2', MEMO_MONTH)
      await jobs.fromScreen({ type: 'month', id: 'month2', load: 2 } satisfies PrecheckFromScreen)
      await stream(jobs, 'memos2', memosJson([]))
      await jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos2', load: 2 } satisfies PrecheckFromScreen)
      await stream(jobs, 'store2', storeJson({}))
      await jobs.fromScreen({ type: 'loadPart', part: 'store', id: 'store2', load: 2 } satisfies PrecheckFromScreen)
      await jobs.fromScreen({ type: 'check', check: 2, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      expect(messagesIn(posts)).toHaveLength(1)
      expect(messagesIn(posts)[0]).toMatchObject({ load: 2 })
    })

    it('AC-019.3·AC-018.17: 불러온 뒤에 달 칸이 막혀도 [다시 점검]·다시 불러오기가 건수를 보내지 않는다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'storeBlock' } satisfies PrecheckFromScreen)
      await made.jobs.fromScreen(CHECK_AGAIN(2))
      await reload(made, 1, memosIn([]))
      expect(made.posts.at(-1)).toMatchObject({ type: 'loadPart', ok: true })
      expect(countsIn(made.posts)).toEqual([])
    })

    it('AC-019.4: 건수는 점검 답보다 먼저 간다(점검 답이 그 불러오기의 마지막 메시지다)', async () => {
      const { posts } = await firstLoad()
      const types = posts.map((m) => m.type)
      expect(types.indexOf('dayCounts')).toBeLessThan(types.indexOf('check'))
      expect(types.at(-1)).toBe('check')
    })

    it('AC-013.13·AC-019.3: 고른 기간의 날짜만 보낸다. 앞쪽까지 읽은 자료(내원 간격용)는 없다', async () => {
      const { posts } = await firstLoad()
      const { posts: wide } = await firstLoad({ visible: OCTOBER })
      const wideDates = countsIn(wide)[0].map((row) => row.visit_date)
      expect(wideDates.length).toBeGreaterThan(1)
      expect(wideDates).toContain(DAY.from)
      expect(wideDates).toEqual([...wideDates].sort())
      expect(countsIn(posts)[0].map((row) => row.visit_date)).toEqual([DAY.from])
    })

    it('AC-018.18·AC-019.3: 메모를 만들지 않는 병원은 보내지 않는다: 0으로 덮으면 남은 일이 끝난 것처럼 보인다', async () => {
      const { posts } = await firstLoad({ settings: { ...SETTINGS, phrases: null } })
      expect(posts.at(-1)).toMatchObject({ type: 'check', ok: true })
      expect(countsIn(posts)).toEqual([])
    })

    it('AC-013.2·AC-019.4: 비트 메모를 받지 못했으면(옛 도우미) 보내지 않는다: 입력 수 0으로 서버 수를 덮지 않는다', async () => {
      const { posts } = await firstLoad({ bit: null })
      expect(posts.at(-1)).toMatchObject({ type: 'check', ok: true })
      expect(countsIn(posts)).toEqual([])
    })

    it('AC-019.4: 점검이 실패하면 보내지 않는다(앞 점검의 재료가 남아 있어도)', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: DAY, settings: { nope: true } } as unknown as PrecheckFromScreen)
      expect(made.posts.at(-1)).toMatchObject({ type: 'check', ok: false, code: 'E-SETTINGS-FAILED' })
      expect(countsIn(made.posts)).toEqual([])
    })

    it('AC-019.4: [다시 점검]도 보낸다. 같은 값인지는 화면이 본다', async () => {
      const made = await ready()
      await made.jobs.fromScreen(CHECK_AGAIN(2))
      expect(countsIn(made.posts)).toHaveLength(1)
    })

    it('AC-019.4·AC-016.7·AC-018.24·AC-018.27: 성공한 비트 메모 다시 불러오기(단추와 줄 열기가 같은 길, runMemoReload)는 새 건수를 보낸다', async () => {
      const made = await ready()
      const ours = rowOf(await viewOf(made), A.key).text
      made.posts.length = 0
      await reload(made, 1, memosIn([memoRow(A, ours), memoRow(B, '비트에 있던 다른 글')]))
      const [rows, ...more] = countsIn(made.posts)
      expect(more).toEqual([])
      expect(rows[0]).toMatchObject({ visit_date: DAY.from, entered: 1, skipped: 1 })
      expect(made.posts.at(-1)).toMatchObject({ type: 'loadPart', part: 'memos', run: 1, ok: true })
      expect(JSON.stringify(rows)).not.toContain('비트에 있던 다른 글')
    })

    it('AC-019.4: 다시 불러오기를 시작만 하면(stream이 거절되면 loadPart도 오지 않는다) 보내지 않는다', async () => {
      const made = await ready()
      await made.jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
      expect(countsIn(made.posts)).toEqual([])
    })

    it.each<[string, (made: Made) => Promise<void>]>([
      ['truncated', (made) => reload(made, 1, memosIn([], { truncated: true }))],
      ['invalidRows', (made) => reload(made, 1, memosIn([], { invalidRows: 1 }))],
      ['깨진 글자', (made) => reload(made, 1, 'not json')],
      [
        'abort(도우미 오류)',
        async (made) => {
          await made.jobs.fromScreen({ type: 'memoReloadStart', run: 1 } satisfies PrecheckFromScreen)
          await made.jobs.fromPort({ type: 'abort', id: 'r1', code: 'E-BIT-READ-FAILED' })
          await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1 } satisfies PrecheckFromScreen)
        },
      ],
      [
        '옛 번호',
        async (made) => {
          await made.jobs.fromScreen({ type: 'memoReloadStart', run: 2 } satisfies PrecheckFromScreen)
          await stream(made.jobs, 'old', memosIn([]))
          await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'old', load: 1, run: 1 } satisfies PrecheckFromScreen)
        },
      ],
    ])('AC-016.8·AC-019.4: 실패한 다시 불러오기(%s)는 수가 그대로라 보내지 않는다', async (_name, fail) => {
      const made = await ready()
      await fail(made)
      expect(made.posts.at(-1)).toMatchObject({ type: 'loadPart', ok: false })
      expect(countsIn(made.posts)).toEqual([])
    })

    it('AC-019.3·AC-019.4: 입력이 끝나면 완료·확인 필요·건너뜀을 센 건수를 보낸다. 비트 메모를 다시 읽지 않아도 완료가 입력 수에 든다', async () => {
      const made = await threeOnly()
      const view = await viewOf(made)
      expect(batchKeys(view)).toEqual([A.key, B.key, C.key])
      const need = needOf(view)
      const finished = view.table.filter((row) => row.hasMemo && row.done).length
      // 화면에서 미리 뺀 사람(확인 표시·같은 날 여럿)은 결과 화면처럼 건너뜀이다
      const preLeft = view.table.filter((row) => row.hasMemo && !row.done && !batchKeys(view).includes(row.key)).length
      expect(finished).toBeGreaterThan(0)
      expect(preLeft).toBeGreaterThan(0)
      const { ticket } = await press(made)
      made.posts.length = 0
      const done = await finish(made, ticket, { status: 'finished', results: [line(A, '완료', '입력'), line(B, '확인 필요', '다시 읽은 값이 달라요'), line(C, '건너뜀', '이미 있음: 다른 메모')] })
      expect(done.ok).toBe(true)
      const [rows, ...more] = countsIn(made.posts)
      expect(more).toEqual([])
      expect(rows).toEqual([{ visit_date: DAY.from, need_memo: need, entered: finished + 1, needs_check: 1, skipped: preLeft + 1 }])
      const types = made.posts.map((m) => m.type)
      expect(types.indexOf('dayCounts')).toBeLessThan(types.indexOf('inputDone'))
      expectNoPatientText(countPosts(made.posts))
    })

    it('AC-019.3: 다른 메모는 바꿔 끝나면 entered이고 아직이면 skipped이며 [바꾸지 않기]가 있는 날은 entered가 need_memo보다 적다', async () => {
      const made = await threeOnly([memoRow(A, '비트 글 가'), memoRow(B, '비트 글 나')])
      await decline(made, B.key)
      await made.jobs.fromScreen(CHECK_AGAIN(2))
      const view = await viewOf(made)
      const finished = view.table.filter((row) => row.hasMemo && row.done).length
      expect(countsIn(made.posts).at(-1)).toEqual([{ visit_date: DAY.from, need_memo: needOf(view), entered: finished, needs_check: 0, skipped: 2 }])
      const sent = await press(made)
      expect(itemIn(sent, A.key)?.replaces).toBe('비트 글 가')
      expect(itemIn(sent, B.key)).toBeUndefined()
      const preLeft = view.table.filter((row) => row.hasMemo && !row.done && !batchKeys(view).includes(row.key)).length
      made.posts.length = 0
      await finish(made, sent.ticket, { status: 'finished', results: [{ ...line(A, '완료', '바꿈(기존 메모 덮어씀)'), previousMemo: '비트 글 가' }, line(C, '완료', '입력')] })
      const [rows] = countsIn(made.posts)
      expect(rows).toEqual([{ visit_date: DAY.from, need_memo: needOf(view), entered: finished + 2, needs_check: 0, skipped: preLeft }])
      expect(rows[0].entered).toBeLessThan(rows[0].need_memo)
    })

    it('AC-019.2: 모두 넣으면 입력 수가 메모 필요 수와 같고 넘지 않는다', async () => {
      const first = await viewOf(await ready())
      const others = first.table.filter((row) => ![A.key, B.key, C.key].includes(row.key)).map((row) => row.key)
      const made = await ready({ store: { done: Object.fromEntries(others.map((key) => [key, true])) } })
      expect(batchKeys(await viewOf(made))).toEqual([A.key, B.key, C.key])
      const { ticket } = await press(made)
      made.posts.length = 0
      await finish(made, ticket, { status: 'finished', results: [line(A, '완료', '입력'), line(B, '완료', '입력'), line(C, '완료', '입력')] })
      const [rows] = countsIn(made.posts)
      expect(rows[0].need_memo).toBeGreaterThan(0)
      expect(rows[0].entered).toBe(rows[0].need_memo)
      expect(rows[0]).toMatchObject({ needs_check: 0, skipped: 0 })
    })

    it('AC-019.4: 도우미 끝 답이 실패면(거절·깨진 글자) 보내지 않는다', async () => {
      const made = await threeOnly()
      const first = await press(made)
      made.posts.length = 0
      await made.jobs.fromPort({ type: 'sent', ticket: first.ticket, ok: false, code: 'E-BRIDGE-DISCONNECTED' })
      expect(made.posts.filter((m) => m.type === 'inputDone').at(-1)).toMatchObject({ ok: false })
      expect(countsIn(made.posts)).toEqual([])

      const second = await press(made)
      made.posts.length = 0
      await finish(made, second.ticket, 'not json')
      expect(made.posts.filter((m) => m.type === 'inputDone').at(-1)).toMatchObject({ ok: false })
      expect(countsIn(made.posts)).toEqual([])
    })

    it('AC-019.3: 취소한 입력은 건너뜀으로 세지 않는다', async () => {
      const made = await threeOnly()
      await made.jobs.fromScreen(CHECK_AGAIN(2))
      const [before] = countsIn(made.posts)
      const { ticket } = await press(made)
      made.posts.length = 0
      await finish(made, ticket, { status: 'cancelled' })
      expect(countsIn(made.posts)).toEqual([before])
    })

    it('AC-019.3: 다음 불러오기에서는 입력 기록(store.load)으로 센다', async () => {
      const { posts } = await firstLoad({ store: { journal: { [A.key]: 'done', [B.key]: 'check', [C.key]: 'skippedByHand' } } })
      expect(countsIn(posts)[0][0]).toMatchObject({ entered: 1, needs_check: 1, skipped: 1 })
    })

    it('AC-019.3: 새 불러오기는 지난 입력 결과를 잊는다(입력 기록이 대신한다)', async () => {
      const made = await threeOnly()
      const { ticket } = await press(made)
      await finish(made, ticket, { status: 'finished', results: [line(B, '확인 필요', '다시 읽은 값이 달라요')] })
      await loadInto(made.jobs, 'month2', MEMO_MONTH, 2)
      await stream(made.jobs, 'memos2', memosJson([]))
      await made.jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos2', load: 2 } satisfies PrecheckFromScreen)
      made.posts.length = 0
      await made.jobs.fromScreen({ type: 'check', check: 9, load: 2, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      expect(countsIn(made.posts)[0][0].needs_check).toBe(0)
    })

    it('AC-019.4: 건수를 만들다 오류가 나도 점검 답은 간다(건수 때문에 화면이 멈추지 않는다)', async () => {
      const posts: unknown[] = []
      const jobs = createPrecheckJobs({
        post: (m) => {
          if (m.type === 'dayCounts') throw new Error('건수만 실패')
          posts.push(m)
        },
        loadTables,
        toPort: () => {},
      })
      await loadInto(jobs, 'month', MEMO_MONTH, 1)
      await stream(jobs, 'memos', memosJson([]))
      await jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos', load: 1 } satisfies PrecheckFromScreen)
      await jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: DAY, settings: SETTINGS } satisfies PrecheckFromScreen)
      expect(posts.at(-1)).toMatchObject({ type: 'check', ok: true })
    })
  })
})
