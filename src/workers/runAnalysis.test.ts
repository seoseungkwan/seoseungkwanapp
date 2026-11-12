import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayInKorea } from '@/lib/analytics/dates'
import { MAX_BYTES } from '@/lib/parsers/common'
import type { RxGroupDef } from '@/types/analysis'
import type { AnalyzeOutput, WorkerMessage, WorkerRequest } from '@/types/analyze'
import { analyzeFiles } from './analyzeFiles'
import { ANALYZE_TIMEOUT_MS, AnalyzeError, runAnalysis } from './runAnalysis'

const FAKE_DIR = fileURLToPath(new URL('../../fixtures/fake-bit/', import.meta.url))
const fakeBytes = (name: string) => new Uint8Array(readFileSync(join(FAKE_DIR, name)))
const TODAY = '2026-10-26'
const FILE_NAME = 'fake-이름.csv' // 파일 이름에 환자 이름이 있을 수 있다 → Worker로 가면 안 된다
const SLOW = { timeout: 30_000 }

const OUTPUT: AnalyzeOutput = { files: [{ index: 0, ok: false, code: 'E-PARSE-EMPTY' }], result: null }

type Posted = { message: WorkerRequest; transfer: Transferable[] }

// 진짜 Worker 대신. 받은 것을 적어 두고, 시험이 reply로 답을 흘려보낸다
function fakeWorker() {
  const sent: Posted[] = []
  const posted = Promise.withResolvers<void>()
  const worker = {
    onmessage: null as ((event: MessageEvent<WorkerMessage>) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn((message: WorkerRequest, transfer: Transferable[]) => {
      sent.push({ message, transfer })
      posted.resolve()
    }),
    terminate: vi.fn(),
  }
  return {
    worker,
    sent,
    posted: posted.promise,
    reply: (data: WorkerMessage) => worker.onmessage?.({ data } as MessageEvent<WorkerMessage>),
    create: vi.fn(() => worker as unknown as Worker),
  }
}

const fileOf = (bytes: Uint8Array<ArrayBuffer>, name = FILE_NAME) => new File([bytes], name)

// 바이트를 꺼내려 하면 실패하는 파일(예외 메시지에 파일 이름이 들어 있다)
const lockedFile = () =>
  ({ name: FILE_NAME, size: 10, arrayBuffer: () => Promise.reject(new Error(`잠김: ${FILE_NAME}`)) }) as unknown as File

// 크기만 정한 파일. 50MB를 실제로 만들지 않는다
const sizedFile = (size: number) => ({ name: FILE_NAME, size, arrayBuffer: vi.fn(async () => new ArrayBuffer(8)) })

// 보낸 값 속 모든 글자(객체·배열을 따라 들어간다)
function textsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsIn)
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...textsIn(v)])
  return []
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AnalyzeError)
  return (error as AnalyzeError).code
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-010.1 runAnalysis — 가짜 Worker', () => {
  it('done → 결과로 resolve, 진행률을 넘겨주고, Worker를 끝낸다', async () => {
    const fake = fakeWorker()
    const onProgress = vi.fn()
    const running = runAnalysis([fileOf(fakeBytes('fake-empty.csv'))], { createWorker: fake.create, today: TODAY, onProgress })
    await fake.posted
    fake.reply({ type: 'progress', done: 1, total: 1 })
    fake.reply({ type: 'done', output: OUTPUT })
    await expect(running).resolves.toEqual(OUTPUT)
    expect(onProgress.mock.calls).toEqual([[1, 1]])
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('Worker로 가는 값에 파일 이름이 없다 — 바이트(ArrayBuffer)와 오늘 날짜·그룹 정의만, 바이트는 transfer로', async () => {
    const fake = fakeWorker()
    const bytes = fakeBytes('fake-utf8-bom.csv')
    const running = runAnalysis([fileOf(bytes), fileOf(fakeBytes('fake-empty.csv'), '가짜환자0001.csv')], {
      createWorker: fake.create,
      today: TODAY,
    })
    await fake.posted
    expect(fake.sent).toHaveLength(1)
    const { message, transfer } = fake.sent[0]
    expect(Object.keys(message).sort()).toEqual(['files', 'groups', 'today'])
    expect(message.groups).toEqual([])
    expect(message.today).toBe(TODAY)
    expect(message.files).toHaveLength(2)
    for (const buffer of message.files) {
      expect(buffer).toBeInstanceOf(ArrayBuffer)
      expect(buffer).not.toBeInstanceOf(Blob) // File(이름이 붙은 것)이 아니다
    }
    expect(new Uint8Array(message.files[0] as ArrayBuffer)).toEqual(bytes)
    // 복사하지 않고 넘긴다: transfer 목록 = 보낸 바이트 그 자체
    expect(transfer).toHaveLength(2)
    expect(transfer[0]).toBe(message.files[0])
    expect(transfer[1]).toBe(message.files[1])
    const texts = textsIn(message).join('\n')
    expect(texts).not.toContain('이름')
    expect(texts).not.toContain('가짜환자')
    expect(texts).not.toContain('.csv')
    fake.reply({ type: 'done', output: OUTPUT })
    await running
  })

  it('today를 주지 않으면 한국 오늘', async () => {
    const fake = fakeWorker()
    const before = todayInKorea()
    const running = runAnalysis([], { createWorker: fake.create })
    await fake.posted
    expect([before, todayInKorea()]).toContain(fake.sent[0].message.today)
    fake.reply({ type: 'done', output: { files: [], result: null } })
    await expect(running).resolves.toEqual({ files: [], result: null })
  })

  it('아무 답이 없으면 timeoutMs 뒤 E-ANALYZE-TIMEOUT, Worker를 끝낸다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fake = fakeWorker()
    const running = runAnalysis([fileOf(fakeBytes('fake-empty.csv'))], { createWorker: fake.create, today: TODAY, timeoutMs: 1000 })
    const settled = vi.fn()
    running.then(settled, settled)
    await fake.posted
    await vi.advanceTimersByTimeAsync(999)
    expect(settled).not.toHaveBeenCalled()
    expect(fake.worker.terminate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await codeOf(running)).toBe('E-ANALYZE-TIMEOUT')
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
    // 늦게 온 답은 버린다
    fake.reply({ type: 'done', output: OUTPUT })
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('기본 시간 제한은 30초', async () => {
    expect(ANALYZE_TIMEOUT_MS).toBe(30_000)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fake = fakeWorker()
    const running = runAnalysis([], { createWorker: fake.create, today: TODAY })
    const settled = vi.fn()
    running.then(settled, settled)
    await fake.posted
    await vi.advanceTimersByTimeAsync(ANALYZE_TIMEOUT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await codeOf(running)).toBe('E-ANALYZE-TIMEOUT')
  })

  it('done이 오면 시간 제한을 끈다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fake = fakeWorker()
    const running = runAnalysis([], { createWorker: fake.create, today: TODAY, timeoutMs: 1000 })
    await fake.posted
    fake.reply({ type: 'done', output: OUTPUT })
    await expect(running).resolves.toEqual(OUTPUT)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('failed 메시지 → 그 번호로 reject, Worker를 끝낸다', async () => {
    const fake = fakeWorker()
    const running = runAnalysis([], { createWorker: fake.create, today: TODAY })
    await fake.posted
    fake.reply({ type: 'failed', code: 'E-ANALYZE-FAILED' })
    expect(await codeOf(running)).toBe('E-ANALYZE-FAILED')
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('Worker 오류(스크립트를 못 불러옴 등) → E-ANALYZE-FAILED, 오류 내용은 콘솔로 새지 않게 막는다', async () => {
    const fake = fakeWorker()
    const running = runAnalysis([], { createWorker: fake.create, today: TODAY })
    await fake.posted
    const event = new Event('error', { cancelable: true })
    fake.worker.onerror?.(event)
    expect(await codeOf(running)).toBe('E-ANALYZE-FAILED')
    expect(event.defaultPrevented).toBe(true)
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('답을 풀지 못함(messageerror) → E-ANALYZE-FAILED', async () => {
    const fake = fakeWorker()
    const running = runAnalysis([], { createWorker: fake.create, today: TODAY })
    await fake.posted
    fake.worker.onmessageerror?.(new MessageEvent('messageerror'))
    expect(await codeOf(running)).toBe('E-ANALYZE-FAILED')
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('Worker를 만들지 못하면 E-ANALYZE-FAILED', async () => {
    const createWorker = () => {
      throw new Error('Worker 없음')
    }
    expect(await codeOf(runAnalysis([], { createWorker, today: TODAY }))).toBe('E-ANALYZE-FAILED')
  })

  it('바이트를 꺼내지 못한 파일(보안 프로그램 잠금·넣은 뒤 지워짐)은 그 자리만 E-PARSE-UNREADABLE로 보내고 나머지는 그대로 Worker로', SLOW, async () => {
    const fake = fakeWorker()
    const bytes = fakeBytes('fake-utf8-bom.csv')
    const running = runAnalysis([lockedFile(), fileOf(bytes)], { createWorker: fake.create, today: TODAY })
    await fake.posted
    const { message, transfer } = fake.sent[0]
    expect(message.files).toHaveLength(2)
    expect(message.files[0]).toBe('E-PARSE-UNREADABLE') // index 짝을 지킨다
    expect(new Uint8Array(message.files[1] as ArrayBuffer)).toEqual(bytes)
    expect(transfer).toEqual([message.files[1]]) // 넘기는 것은 바이트만
    // 예외 내용·파일 이름은 싣지 않는다
    const texts = textsIn(message).join('\n')
    expect(texts).not.toContain('잠김')
    expect(texts).not.toContain('이름')
    fake.reply({ type: 'done', output: OUTPUT })
    await expect(running).resolves.toEqual(OUTPUT)
  })

  it(`${MAX_BYTES} 바이트를 넘는 파일은 통째로 읽지 않고 그 자리를 E-PARSE-TOO-BIG으로`, async () => {
    const fake = fakeWorker()
    const tooBig = sizedFile(MAX_BYTES + 1)
    const justFits = sizedFile(MAX_BYTES)
    const running = runAnalysis([tooBig, justFits] as unknown as File[], { createWorker: fake.create, today: TODAY })
    await fake.posted
    expect(tooBig.arrayBuffer).not.toHaveBeenCalled()
    expect(justFits.arrayBuffer).toHaveBeenCalledTimes(1)
    const { message, transfer } = fake.sent[0]
    expect(message.files[0]).toBe('E-PARSE-TOO-BIG')
    expect(message.files[1]).toBeInstanceOf(ArrayBuffer)
    expect(transfer).toEqual([message.files[1]])
    fake.reply({ type: 'done', output: OUTPUT })
    await running
  })

  it('오류 객체에는 번호만 있다', () => {
    const error = new AnalyzeError('E-ANALYZE-TIMEOUT')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('E-ANALYZE-TIMEOUT')
    expect(error.message).toBe('E-ANALYZE-TIMEOUT')
  })
})

// ── 진짜 analyze.worker 모듈을 가짜 Worker 안에서 ───────────────

type WorkerScope = { onmessage: ((event: { data: unknown }) => void) | null; postMessage(message: WorkerMessage): void }

// self를 가짜 Worker 쪽 전역으로 바꾸고 analyze.worker를 새로 불러온다
async function loadWorker() {
  const posted: WorkerMessage[] = []
  const scope: WorkerScope = { onmessage: null, postMessage: (message) => posted.push(structuredClone(message)) }
  vi.stubGlobal('self', scope)
  vi.resetModules()
  await import('./analyze.worker')
  if (scope.onmessage === null) throw new Error('analyze.worker가 onmessage를 걸지 않았다')
  return { scope, posted, receive: scope.onmessage }
}

// runAnalysis ↔ 진짜 analyze.worker 사이를 브라우저처럼 잇는다: 구조화 복제, transfer한 바이트는 보낸 쪽에서 비운다
async function realWorker() {
  const { scope, receive } = await loadWorker()
  const sent: WorkerRequest['files'] = []
  const worker = {
    onmessage: null as ((event: MessageEvent<WorkerMessage>) => void) | null,
    onerror: null,
    onmessageerror: null,
    postMessage: (message: WorkerRequest, transfer: Transferable[]) => {
      sent.push(...message.files)
      const data = structuredClone(message, { transfer })
      setTimeout(() => receive({ data }))
    },
    terminate: vi.fn(),
  }
  scope.postMessage = (message) => worker.onmessage?.({ data: structuredClone(message) } as MessageEvent<WorkerMessage>)
  return { worker, sent, createWorker: () => worker as unknown as Worker }
}

describe('AC-010.1·AC-010.2 analyze.worker — 가짜 Worker 안에서 진짜로', () => {
  it('runAnalysis → (구조화 복제·transfer) → analyze.worker → 결과가 analyzeFiles를 직접 부른 것과 같다', SLOW, async () => {
    const { worker, sent, createWorker } = await realWorker()
    const names = ['fake-utf8-bom.csv', 'fake-missing-visit.csv']
    const onProgress = vi.fn()
    const output = await runAnalysis(
      names.map((name) => fileOf(fakeBytes(name))),
      { createWorker, today: TODAY, onProgress },
    )
    expect(output).toEqual(analyzeFiles(names.map(fakeBytes), TODAY))
    expect(output.result?.quality).toBe('incomplete')
    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ])
    expect(sent.map((buffer) => (buffer as ArrayBuffer).byteLength)).toEqual([0, 0]) // 복사 없이 넘어갔다
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('정상 + 바이트를 꺼내지 못한 파일 → 정상 파일 결과는 나오고 실패 자리 보고에 번호, 묶음은 incomplete', SLOW, async () => {
    const { createWorker } = await realWorker()
    const output = await runAnalysis([fileOf(fakeBytes('fake-utf8-bom.csv')), lockedFile()], { createWorker, today: TODAY })
    expect(output).toEqual(analyzeFiles([fakeBytes('fake-utf8-bom.csv'), 'E-PARSE-UNREADABLE'], TODAY))
    expect(output.files[1]).toStrictEqual({ index: 1, ok: false, code: 'E-PARSE-UNREADABLE' })
    expect(output.result?.quality).toBe('incomplete')
    expect(output.result?.summary.quality).toBe('incomplete')
    expect(JSON.stringify(output)).not.toContain('잠김')
  })

  it('모든 파일의 바이트를 꺼내지 못하면 result null(reject 아님), 파일마다 번호', async () => {
    const { createWorker } = await realWorker()
    const output = await runAnalysis([lockedFile(), lockedFile()], { createWorker, today: TODAY })
    expect(output).toStrictEqual({
      files: [
        { index: 0, ok: false, code: 'E-PARSE-UNREADABLE' },
        { index: 1, ok: false, code: 'E-PARSE-UNREADABLE' },
      ],
      result: null,
    })
  })

  it('예상 못 한 예외 → failed와 번호만(예외 내용은 보내지 않는다)', async () => {
    const { posted, receive } = await loadWorker()
    // 잘못된 날짜는 RangeError(메시지에 그 값이 들어간다)
    receive({ data: { files: [fakeBytes('fake-utf8-bom.csv').buffer], today: '비밀-글자' } })
    expect(posted.at(-1)).toStrictEqual({ type: 'failed', code: 'E-ANALYZE-FAILED' })
    expect(JSON.stringify(posted)).not.toContain('비밀')
  })

  it('요청 모양이 틀려도 failed', async () => {
    const { posted, receive } = await loadWorker()
    receive({ data: null })
    expect(posted).toStrictEqual([{ type: 'failed', code: 'E-ANALYZE-FAILED' }])
  })
})

describe('AC-010.3 그룹 정의를 Worker로 넘긴다', () => {
  const GROUPS = [
    { id: 'g-manual', codes: ['MM101', 'MM102'] },
    { id: 'g-drug', codes: ['D1001'] },
  ]

  it('요청에 그대로 실려 간다, 주지 않으면 빈 목록', async () => {
    for (const [groups, expected] of [
      [GROUPS, GROUPS],
      [undefined, []],
    ] as const) {
      const fake = fakeWorker()
      const running = runAnalysis([], { createWorker: fake.create, today: TODAY, groups: groups as RxGroupDef[] | undefined })
      await fake.posted
      expect(fake.sent[0].message.groups).toEqual(expected)
      fake.reply({ type: 'done', output: { files: [], result: null } })
      await running
    }
  })

  it('그룹 정의에서 id·코드 목록만 골라 보낸다(화면이 그룹 줄을 통째로 넘겨도 이름·즐겨찾기 등은 가지 않는다)', async () => {
    const fake = fakeWorker()
    const rowLike = { id: 'g-manual', codes: ['MM101'], name: '도수치료', favorite: true, hospital_id: 'h-1' }
    const running = runAnalysis([], { createWorker: fake.create, today: TODAY, groups: [rowLike] })
    await fake.posted
    expect(fake.sent[0].message.groups).toStrictEqual([{ id: 'g-manual', codes: ['MM101'] }])
    expect(textsIn(fake.sent[0].message)).not.toContain('도수치료')
    fake.reply({ type: 'done', output: { files: [], result: null } })
    await running
  })

  it('AC-2704.1: 제외할 처방이 있는 정의는 요청에 exclude가 그대로(새 배열로) 실리고 이름은 가지 않는다', async () => {
    const fake = fakeWorker()
    const rowLike = { id: 't7bdb9b20a17a64d3', codes: ['MM010'], exclude: ['ESWT7'], name: '가짜 물리치료' }
    const running = runAnalysis([], { createWorker: fake.create, today: TODAY, groups: [rowLike] })
    await fake.posted
    expect(fake.sent[0].message.groups).toStrictEqual([{ id: 't7bdb9b20a17a64d3', codes: ['MM010'], exclude: ['ESWT7'] }])
    expect(fake.sent[0].message.groups[0].exclude).not.toBe(rowLike.exclude)
    expect(textsIn(fake.sent[0].message)).not.toContain('가짜 물리치료')
    fake.reply({ type: 'done', output: { files: [], result: null } })
    await running
  })

  it('AC-2704.1: 제외할 처방이 빈 배열이거나 없는 정의는 지금처럼 { id, codes }만(exclude 열쇠 없음)', async () => {
    const fake = fakeWorker()
    const groups: RxGroupDef[] = [
      { id: 't00000000000000a1', codes: ['MM101'], exclude: [] },
      { id: 'tf5a35bf567c9d2cc', codes: ['MM010'] },
    ]
    const running = runAnalysis([], { createWorker: fake.create, today: TODAY, groups })
    await fake.posted
    expect(fake.sent[0].message.groups).toStrictEqual([
      { id: 't00000000000000a1', codes: ['MM101'] },
      { id: 'tf5a35bf567c9d2cc', codes: ['MM010'] },
    ])
    for (const group of fake.sent[0].message.groups) expect(Object.keys(group).sort()).toEqual(['codes', 'id'])
    fake.reply({ type: 'done', output: { files: [], result: null } })
    await running
  })

  it('그룹 정의가 깨져 있으면 E-ANALYZE-FAILED(예외 내용 없이), Worker는 바로 끝낸다', async () => {
    const fake = fakeWorker()
    const broken = [{ id: 'g-broken', codes: null }] as unknown as RxGroupDef[]
    expect(await codeOf(runAnalysis([], { createWorker: fake.create, today: TODAY, groups: broken }))).toBe('E-ANALYZE-FAILED')
    expect(fake.sent).toHaveLength(0)
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('가짜 Worker 안에서 진짜로: 결과가 analyzeFiles(…, groups)를 직접 부른 것과 같다', SLOW, async () => {
    const { createWorker } = await realWorker()
    const output = await runAnalysis([fileOf(fakeBytes('fake-utf8-bom.csv'))], { createWorker, today: TODAY, groups: GROUPS })
    expect(output).toEqual(analyzeFiles([fakeBytes('fake-utf8-bom.csv')], TODAY, GROUPS))
  })

  it('요청에 그룹이 없어도(옛 모양) 그룹 없이 분석한다', SLOW, async () => {
    const { posted, receive } = await loadWorker()
    receive({ data: { files: [fakeBytes('fake-utf8-bom.csv').buffer], today: TODAY } })
    expect(posted.at(-1)).toEqual({ type: 'done', output: analyzeFiles([fakeBytes('fake-utf8-bom.csv')], TODAY) })
  })
})
