import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayInKorea } from '@/lib/analytics/dates'
import { MAX_BYTES } from '@/lib/parsers/common'
import { bookBytes, FAKE_TEXTS, incomeRows, patientRows, rxRows, TODAY, visitsRows } from '@/lib/parsers/uisarang/testBooks'
import type { UisFileResult } from '@/types/uisarang'
import { readUisFiles, type UisWorkerMessage, type UisWorkerRequest } from './readUisFiles'
import { runUisarang, UIS_MAX_FILES, UIS_TIMEOUT_MS, UIS_TIMEOUT_PER_FILE_MS, UisRunError } from './runUisarang'

// 화면이 부르는 입구(design.md §2). Worker로는 바이트와 오늘 날짜만 — 파일 이름은 가지 않는다(AC-8807.1·AC-8810.8)

const FILE_NAME = '홍길동_수입통계.xls' // 파일 이름에 환자 이름이 있을 수 있다
const SLOW = { timeout: 30_000 }
const RESULTS: UisFileResult[] = [{ status: 'refused', code: 'E-UIS-KIND', kind: null, span: null }]

type Posted = { message: UisWorkerRequest; transfer: Transferable[] }

function fakeWorker() {
  const sent: Posted[] = []
  const posted = Promise.withResolvers<void>()
  const worker = {
    onmessage: null as ((event: MessageEvent<UisWorkerMessage>) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn((message: UisWorkerRequest, transfer: Transferable[]) => {
      sent.push({ message, transfer })
      posted.resolve()
    }),
    terminate: vi.fn(),
  }
  return {
    worker,
    sent,
    posted: posted.promise,
    reply: (data: UisWorkerMessage) => worker.onmessage?.({ data } as MessageEvent<UisWorkerMessage>),
    create: vi.fn(() => worker as unknown as Worker),
  }
}

const fileOf = (bytes: Uint8Array<ArrayBuffer>, name = FILE_NAME) => new File([bytes], name)
const lockedFile = () => ({ name: FILE_NAME, size: 10, arrayBuffer: () => Promise.reject(new Error(`잠김: ${FILE_NAME}`)) }) as unknown as File
const sizedFile = (size: number) => ({ name: FILE_NAME, size, arrayBuffer: vi.fn(async () => new ArrayBuffer(8)) })

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
  expect(error).toBeInstanceOf(UisRunError)
  return (error as UisRunError).code
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-8807.1 runUisarang — 바이트와 오늘 날짜만 Worker로', () => {
  it('AC-8807.1: 보낸 값에 파일 이름이 없다 — ArrayBuffer와 today뿐, 바이트는 transfer로', async () => {
    const fake = fakeWorker()
    const bytes = bookBytes(incomeRows())
    const running = runUisarang([fileOf(bytes), fileOf(bookBytes(rxRows()), '김가짜.xls')], { createWorker: fake.create, today: TODAY })
    await fake.posted
    expect(fake.sent).toHaveLength(1)
    const { message, transfer } = fake.sent[0]
    expect(Object.keys(message).sort()).toEqual(['files', 'today'])
    expect(message.today).toBe(TODAY)
    expect(message.files).toHaveLength(2)
    for (const buffer of message.files) expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(message.files[0] as ArrayBuffer)).toEqual(bytes)
    expect(transfer).toEqual(message.files)
    expect(transfer[0]).toBe(message.files[0])
    const texts = textsIn(message).join('\n')
    for (const text of ['홍길동', '김가짜', '.xls', '수입통계']) expect(texts).not.toContain(text)
    fake.reply({ type: 'done', results: [RESULTS[0], RESULTS[0]] })
    await expect(running).resolves.toEqual([RESULTS[0], RESULTS[0]])
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-8807.1: today를 주지 않으면 한국 오늘', async () => {
    const fake = fakeWorker()
    const before = todayInKorea()
    const running = runUisarang([fileOf(bookBytes(incomeRows()))], { createWorker: fake.create })
    await fake.posted
    expect([before, todayInKorea()]).toContain(fake.sent[0].message.today)
    fake.reply({ type: 'done', results: RESULTS })
    await running
  })

  it('AC-8807.1: 파일이 없으면 Worker를 만들지 않고 빈 목록', async () => {
    const fake = fakeWorker()
    await expect(runUisarang([], { createWorker: fake.create, today: TODAY })).resolves.toEqual([])
    expect(fake.create).not.toHaveBeenCalled()
  })

  it('AC-8807.1: 답의 결과 수가 넣은 파일 수와 다르면 E-ANALYZE-FAILED', async () => {
    const fake = fakeWorker()
    const running = runUisarang([fileOf(bookBytes(incomeRows())), fileOf(bookBytes(rxRows()))], { createWorker: fake.create, today: TODAY })
    await fake.posted
    fake.reply({ type: 'done', results: RESULTS })
    expect(await codeOf(running)).toBe('E-ANALYZE-FAILED')
  })

  it('AC-8807.1: 50MB를 넘는 파일은 통째로 읽지 않고 그 자리를 E-UIS-TOO-BIG · 꺼내지 못한 파일은 E-UIS-UNREADABLE', async () => {
    const fake = fakeWorker()
    const tooBig = sizedFile(MAX_BYTES + 1)
    const justFits = sizedFile(MAX_BYTES)
    const running = runUisarang([tooBig, justFits, lockedFile()] as unknown as File[], { createWorker: fake.create, today: TODAY })
    await fake.posted
    expect(tooBig.arrayBuffer).not.toHaveBeenCalled()
    const { message, transfer } = fake.sent[0]
    expect(message.files[0]).toBe('E-UIS-TOO-BIG')
    expect(message.files[1]).toBeInstanceOf(ArrayBuffer)
    expect(message.files[2]).toBe('E-UIS-UNREADABLE')
    expect(transfer).toEqual([message.files[1]])
    expect(textsIn(message).join('\n')).not.toContain('잠김')
    fake.reply({ type: 'done', results: [RESULTS[0], RESULTS[0], RESULTS[0]] })
    await running
  })
})

describe('AC-8807.3 100개를 넘으면 읽지 않고 E-UIS-TOO-MANY', () => {
  it('AC-8807.3: 101개 → Worker를 만들지 않고 바이트도 꺼내지 않는다', async () => {
    expect(UIS_MAX_FILES).toBe(100)
    const fake = fakeWorker()
    const files = Array.from({ length: 101 }, () => sizedFile(10))
    expect(await codeOf(runUisarang(files as unknown as File[], { createWorker: fake.create, today: TODAY }))).toBe('E-UIS-TOO-MANY')
    expect(fake.create).not.toHaveBeenCalled()
    for (const file of files) expect(file.arrayBuffer).not.toHaveBeenCalled()
  })

  it('AC-8807.3: 100개는 읽는다', async () => {
    const fake = fakeWorker()
    const files = Array.from({ length: 100 }, () => sizedFile(10))
    const running = runUisarang(files as unknown as File[], { createWorker: fake.create, today: TODAY })
    await fake.posted
    expect(fake.sent[0].message.files).toHaveLength(100)
    fake.reply({ type: 'done', results: Array.from({ length: 100 }, () => RESULTS[0]) })
    await expect(running).resolves.toHaveLength(100)
  })
})

describe('AC-8807.4 시간 한도 30초 + 파일마다 3초 · Worker가 멈추면 E-ANALYZE-FAILED', () => {
  it('AC-8807.4: 파일 둘이면 36초 뒤 E-ANALYZE-TIMEOUT, Worker를 끝내고 늦은 답은 버린다', async () => {
    expect([UIS_TIMEOUT_MS, UIS_TIMEOUT_PER_FILE_MS]).toEqual([30_000, 3_000])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fake = fakeWorker()
    const running = runUisarang([fileOf(bookBytes(incomeRows())), fileOf(bookBytes(rxRows()))], { createWorker: fake.create, today: TODAY })
    const settled = vi.fn()
    running.then(settled, settled)
    await fake.posted
    await vi.advanceTimersByTimeAsync(35_999)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await codeOf(running)).toBe('E-ANALYZE-TIMEOUT')
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
    fake.reply({ type: 'done', results: [RESULTS[0], RESULTS[0]] })
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-8807.4: timeoutMs로 바꿀 수 있고 done이 오면 시간 한도를 끈다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fake = fakeWorker()
    const running = runUisarang([fileOf(bookBytes(incomeRows()))], { createWorker: fake.create, today: TODAY, timeoutMs: 1000 })
    await fake.posted
    fake.reply({ type: 'done', results: RESULTS })
    await expect(running).resolves.toEqual(RESULTS)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-8807.4: failed 메시지 → 그 번호', async () => {
    const fake = fakeWorker()
    const running = runUisarang([fileOf(bookBytes(incomeRows()))], { createWorker: fake.create, today: TODAY })
    await fake.posted
    fake.reply({ type: 'failed', code: 'E-ANALYZE-FAILED' })
    expect(await codeOf(running)).toBe('E-ANALYZE-FAILED')
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-8807.4: Worker 오류 → E-ANALYZE-FAILED, 오류 내용은 콘솔로 새지 않게 막는다', async () => {
    const fake = fakeWorker()
    const running = runUisarang([fileOf(bookBytes(incomeRows()))], { createWorker: fake.create, today: TODAY })
    await fake.posted
    const event = new Event('error', { cancelable: true })
    fake.worker.onerror?.(event)
    expect(await codeOf(running)).toBe('E-ANALYZE-FAILED')
    expect(event.defaultPrevented).toBe(true)
  })

  it('AC-8807.4: 답을 풀지 못함(messageerror) → E-ANALYZE-FAILED', async () => {
    const fake = fakeWorker()
    const running = runUisarang([fileOf(bookBytes(incomeRows()))], { createWorker: fake.create, today: TODAY })
    await fake.posted
    fake.worker.onmessageerror?.(new MessageEvent('messageerror'))
    expect(await codeOf(running)).toBe('E-ANALYZE-FAILED')
  })

  it('AC-8807.4: Worker를 만들지 못하면 E-ANALYZE-FAILED', async () => {
    const createWorker = () => {
      throw new Error('Worker 없음')
    }
    expect(await codeOf(runUisarang([fileOf(bookBytes(incomeRows()))], { createWorker, today: TODAY }))).toBe('E-ANALYZE-FAILED')
  })

  it('AC-8807.4: 오류 객체에는 번호만', () => {
    const error = new UisRunError('E-UIS-TOO-MANY')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('E-UIS-TOO-MANY')
    expect(error.message).toBe('E-UIS-TOO-MANY')
  })
})

// ── 진짜 uisarang.worker 모듈을 가짜 Worker 안에서 ───────────────

type WorkerScope = { onmessage: ((event: { data: unknown }) => void) | null; postMessage(message: UisWorkerMessage): void }

async function loadWorker() {
  const posted: UisWorkerMessage[] = []
  const scope: WorkerScope = { onmessage: null, postMessage: (message) => posted.push(structuredClone(message)) }
  vi.stubGlobal('self', scope)
  vi.resetModules()
  await import('./uisarang.worker')
  if (scope.onmessage === null) throw new Error('uisarang.worker가 onmessage를 걸지 않았다')
  return { scope, posted, receive: scope.onmessage }
}

// runUisarang ↔ 진짜 uisarang.worker: 구조화 복제, transfer한 바이트는 보낸 쪽에서 비운다
async function realWorker() {
  const { scope, receive } = await loadWorker()
  const sent: UisWorkerRequest['files'] = []
  const worker = {
    onmessage: null as ((event: MessageEvent<UisWorkerMessage>) => void) | null,
    onerror: null,
    onmessageerror: null,
    postMessage: (message: UisWorkerRequest, transfer: Transferable[]) => {
      sent.push(...message.files)
      const data = structuredClone(message, { transfer })
      setTimeout(() => receive({ data }))
    },
    terminate: vi.fn(),
  }
  scope.postMessage = (message) => worker.onmessage?.({ data: structuredClone(message) } as MessageEvent<UisWorkerMessage>)
  return { worker, sent, createWorker: () => worker as unknown as Worker }
}

describe('AC-8807.1·AC-8807.5 uisarang.worker — 가짜 Worker 안에서 진짜로', () => {
  it('AC-8807.1: runUisarang → worker → 결과가 readUisFiles를 직접 부른 것과 같다 · 바이트는 복사 없이 넘어간다', SLOW, async () => {
    const { worker, sent, createWorker } = await realWorker()
    const books = [bookBytes(incomeRows()), bookBytes(rxRows()), bookBytes(visitsRows()), bookBytes(patientRows())]
    const results = await runUisarang(
      books.map((bytes) => fileOf(bytes.slice())),
      { createWorker, today: TODAY },
    )
    expect(results).toEqual(readUisFiles(books, TODAY))
    expect(results.map((r) => r.status)).toEqual(['read', 'read', 'read', 'read'])
    expect(sent.map((buffer) => (buffer as ArrayBuffer).byteLength)).toEqual([0, 0, 0, 0])
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-8807.5: Worker 답(JSON)에 가짜 이름·차트번호·주민번호·전화·주소 글자가 없다', SLOW, async () => {
    const { createWorker } = await realWorker()
    const results = await runUisarang([fileOf(bookBytes(patientRows())), fileOf(bookBytes(incomeRows()))], { createWorker, today: TODAY })
    const json = JSON.stringify(results)
    for (const text of [...FAKE_TEXTS, FILE_NAME]) expect(json).not.toContain(text)
  })

  it('AC-8807.4: 꺼내지 못한 파일 자리는 E-UIS-UNREADABLE이고 나머지는 읽는다', SLOW, async () => {
    const { createWorker } = await realWorker()
    const results = await runUisarang([lockedFile(), fileOf(bookBytes(incomeRows()))], { createWorker, today: TODAY })
    expect(results[0]).toStrictEqual({ status: 'refused', code: 'E-UIS-UNREADABLE', kind: null, span: null })
    expect(results[1].status).toBe('read')
  })

  it('AC-8807.4: 예상 못 한 예외 → failed와 번호만(예외 내용은 보내지 않는다)', async () => {
    const { posted, receive } = await loadWorker()
    receive({ data: { files: [bookBytes(incomeRows()).buffer], today: '비밀-글자' } })
    expect(posted.at(-1)).toStrictEqual({ type: 'failed', code: 'E-ANALYZE-FAILED' })
    expect(JSON.stringify(posted)).not.toContain('비밀')
  })

  it('AC-8807.4: 요청 모양이 틀려도 failed', async () => {
    const { posted, receive } = await loadWorker()
    receive({ data: null })
    expect(posted).toStrictEqual([{ type: 'failed', code: 'E-ANALYZE-FAILED' }])
  })
})
