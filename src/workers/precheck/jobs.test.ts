import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Outcome } from '@/types/parse'
import type { ClaimMemosJson, DxLink, MemoRowRaw, MemoState, MemoStateOptions, PrecheckFromScreen, PrecheckToScreen, StoreLoadJson, StoreMonthJson, Tables } from '@/types/precheck'
import { defaultPhrases, ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { checkMonth, loadMonth, createPrecheckJobs, dxViews, memoViews, ruleList } from './jobs'
import { loadTables } from './tables'

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
  return { posted, givePort }
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
    const month = memo()
    const tables = await tablesValue()
    const auto = memoViews(month, tables, { phrases: ourClinicPhrases() })
    expect(auto.memos.find((m) => m.visitKey === 'k01')!.unfinished).toBe(true)
    const fixed = memoViews(month, tables, { phrases: ourClinicPhrases(), saved: new Map([['k01', '◈고쳐서 확인 표시를 지움(가상)']]) })
    expect(fixed.memos.find((m) => m.visitKey === 'k01')!.unfinished).toBe(false)
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
      const state = await stateOf(made.jobs, { noAsk: true })
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

    it('AC-016.3: 입력 기록의 skippedByHand는 store.load로 알고, 묻지 않기가 켜져 있어도 승인 없이 넣지 않는다', async () => {
      const made = await withMemos([memoRow(A, '비트 메모'), memoRow(B, '비트 메모')])
      await givePart(made.jobs, 'store', 's1', storeJson({ journal: { [A.key]: 'skippedByHand', [B.key]: 'done' } }), 1)
      const on = await stateOf(made.jobs, { noAsk: true })
      expect(on.plan.skipped).toContainEqual({ key: A.key, reason: '이미 있음' })
      expect(on.plan.batch.map((row) => row.key)).toContain(B.key)
      const approved = await stateOf(made.jobs, { noAsk: true, approved: new Map([[A.key, '비트 메모']]) })
      expect(approved.plan.batch.find((row) => row.key === A.key)?.replaces).toBe('비트 메모')
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
      expect(after.plan.batch.map((row) => row.key)).not.toContain(B.key)
      expect(after.plan.skipped).toContainEqual({ key: B.key, reason: '이미 있음' })
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

    it('AC-016.7: 승인한 글이 달라진 사람은 입력 대상에서 빠지고, 글이 그대로인 사람은 남는다(AC-018.14)', async () => {
      const { jobs } = await withMemos([memoRow(A, '처음 메모'), memoRow(B, '그대로인 메모')])
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
