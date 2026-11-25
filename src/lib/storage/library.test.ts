// @vitest-environment jsdom
// 자료실 목록·받기·올리기·지우기 (specs/library TASK-2, REQ-8103 · AC-8103.1~8103.6, design.md '저장 함수').
// 실제 Supabase에 붙지 않는다. 가짜 클라이언트가 표 library_files·바구니 library에 무엇이 어떤 차례로 나갔는지 적어 두고,
// 올리기 PUT은 가짜 XMLHttpRequest가 진행률·답을 흉내 낸다. 표·바구니 권한은 supabase/library.rls.test.ts가 증명한다.
// 받기 이름(TASK-6)은 진짜 StorageClient(@supabase/storage-js, supabase-js 2.117.3이 쓰는 판)에 가짜 fetch를 넣어서도 본다.
// 파일 이름·크기·바이트·주소는 모두 지어낸 값이다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StorageClient } from '@supabase/storage-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIBRARY_MAX_BYTES, type LibraryFile } from '@/lib/library/files'
import { LibraryError, LibraryStopped, deleteLibraryFile, downloadLibraryFile, listLibraryFiles, uploadLibraryFile } from './library'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const TABLE = 'library_files'
const BUCKET = 'library'
const COLUMNS = 'id, file_name, name, category, description, storage_path, size, created_at'
const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const BYTES_TEXT = 'PK-fake-zip-bytes-7f3a' // 파일 내용. 오류에 섞이면 안 된다
const RAW_ERROR = { message: `new row violates row-level security policy (${SECRET})`, code: '42501', details: SECRET, hint: null }
const UUID = '3f1c2a7e-9b4d-4e21-8c5a-0d6e7f8a9b10'
const ID = '11111111-2222-4333-8444-555555555555'
const PATH = '7d0e5c1b-2a3f-4b6c-9d8e-1f2a3b4c5d6e'
const SIGNED_URL = `https://example.supabase.co/storage/v1/object/sign/library/${PATH}?token=fake-download-token&download=x`
const UPLOAD_URL = `https://example.supabase.co/storage/v1/object/upload/sign/library/${UUID}?token=fake-upload-token`
const CREATED = '2026-11-25T01:38:00.123456+00:00'
const FILE_KEYS = ['category', 'createdAt', 'description', 'fileName', 'id', 'name', 'size', 'storagePath']

/** 표가 돌려주는 한 줄 */
const dbRow = (over: Record<string, unknown> = {}) => ({
  id: ID,
  file_name: 'precheck-helper-0.14.0.zip',
  name: 'precheck-helper-0.14.0.zip',
  category: 'install',
  description: '청구 도우미 · 비트 자료를 읽는 PC 프로그램',
  storage_path: PATH,
  size: 1_258_291,
  created_at: CREATED,
  ...over,
})
const libFile = (over: Partial<LibraryFile> = {}): LibraryFile => ({
  id: ID,
  fileName: 'precheck-helper-0.14.0.zip',
  name: 'precheck-helper-0.14.0.zip',
  category: 'install',
  description: '청구 도우미 · 비트 자료를 읽는 PC 프로그램',
  storagePath: PATH,
  size: 1_258_291,
  createdAt: CREATED,
  ...over,
})

type Step = [string, ...unknown[]]
type Call =
  | { kind: 'table'; table: string; steps: Step[] }
  | { kind: 'storage'; bucket: string; op: 'createSignedUrl' | 'createSignedUploadUrl' | 'remove' | 'upload' | 'download'; args: unknown[] }
type Reply = { data?: unknown; error?: unknown }
type Sent = { data: unknown; error: unknown }

/** 모든 부름(표·바구니·PUT)을 차례로 적는다 */
let log: string[] = []

/** supabase-js 질의처럼 이어 부르고 await하면 보낸다 */
class FakeQuery implements PromiseLike<Sent> {
  readonly steps: Step[] = []
  constructor(
    private readonly table: string,
    private readonly send: (call: Call) => Promise<Sent>,
  ) {}
  private step(name: string, args: unknown[]) {
    this.steps.push([name, ...args])
    return this
  }
  select(...args: unknown[]) {
    return this.step('select', args)
  }
  order(...args: unknown[]) {
    return this.step('order', args)
  }
  limit(...args: unknown[]) {
    return this.step('limit', args)
  }
  insert(...args: unknown[]) {
    return this.step('insert', args)
  }
  update(...args: unknown[]) {
    return this.step('update', args)
  }
  upsert(...args: unknown[]) {
    return this.step('upsert', args)
  }
  delete(...args: unknown[]) {
    return this.step('delete', args)
  }
  eq(...args: unknown[]) {
    return this.step('eq', args)
  }
  single(...args: unknown[]) {
    return this.step('single', args)
  }
  then<A = Sent, B = never>(ok?: ((value: Sent) => A | PromiseLike<A>) | null, bad?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.send({ kind: 'table', table: this.table, steps: this.steps }).then(ok, bad)
  }
}

const opOf = (call: Call) => (call.kind === 'table' ? call.steps[0]?.[0] : call.op)

/** 아무 오류 없이 답하는 기본 답 */
function okReply(call: Call): Reply {
  if (call.kind === 'storage') {
    if (call.op === 'createSignedUrl') return { data: { signedUrl: SIGNED_URL } }
    if (call.op === 'createSignedUploadUrl') return { data: { signedUrl: UPLOAD_URL, token: 'fake-upload-token', path: call.args[0] } }
    if (call.op === 'remove') return { data: [{ name: call.args[0] }] }
    return { data: null }
  }
  const first = opOf(call)
  if (first === 'select') return { data: [dbRow()] }
  if (first === 'insert') {
    const values = call.steps[0][1] as Record<string, unknown>
    return { data: dbRow({ ...values, id: ID, created_at: CREATED }) }
  }
  if (first === 'delete') return { data: [{ id: ID }] }
  return { data: null }
}

/** 가짜 클라이언트를 브라우저 클라이언트 자리에 둔다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Call) => Reply = okReply) {
  const calls: Call[] = []
  const send = (call: Call): Promise<Sent> => {
    calls.push(call)
    log.push(call.kind === 'table' ? `table:${opOf(call)}` : `storage:${call.op}`)
    return Promise.resolve()
      .then(() => reply(call))
      .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null }))
  }
  supabaseBrowser.mockReturnValue({
    from: (table: string) => new FakeQuery(table, send),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (...args: unknown[]) => send({ kind: 'storage', bucket, op: 'createSignedUrl', args }),
        createSignedUploadUrl: (...args: unknown[]) => send({ kind: 'storage', bucket, op: 'createSignedUploadUrl', args }),
        remove: (...args: unknown[]) => send({ kind: 'storage', bucket, op: 'remove', args }),
        upload: (...args: unknown[]) => send({ kind: 'storage', bucket, op: 'upload', args }),
        download: (...args: unknown[]) => send({ kind: 'storage', bucket, op: 'download', args }),
      }),
    },
  })
  return calls
}

const throwing = (): Reply => {
  throw new Error(SECRET)
}

/** 보낸 것 없이 실패하는 클라이언트 둘(만들기 실패·표나 바구니 고르기 실패) */
const BROKEN_CLIENTS: [string, () => void][] = [
  [
    '클라이언트 만들기 실패',
    () =>
      supabaseBrowser.mockImplementation(() => {
        throw new Error(SECRET)
      }),
  ],
  [
    '표·바구니 고르기가 곧바로 던짐',
    () =>
      supabaseBrowser.mockReturnValue({
        from: () => {
          throw new Error(SECRET)
        },
        storage: {
          from: () => {
            throw new Error(SECRET)
          },
        },
      }),
  ],
]

/** 던진 것이 LibraryError이고 번호가 code인지, 서버 글자·파일 내용이 섞이지 않았는지 본다 */
async function expectCode(run: () => Promise<unknown>, code: string) {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(LibraryError)
  expect(error).toBeInstanceOf(Error)
  expect((error as LibraryError).code).toBe(code)
  expect((error as LibraryError).name).toBe('LibraryError')
  expect((error as Error).message).toBe(code)
  for (const text of [String((error as Error).message), JSON.stringify(error), String((error as Error).stack ?? '')]) {
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain(BYTES_TEXT)
  }
  return error as LibraryError
}

async function expectStopped(run: () => Promise<unknown>) {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(LibraryStopped)
  expect(error).toBeInstanceOf(Error)
  expect(error).not.toBeInstanceOf(LibraryError)
}

// ───────── 가짜 XMLHttpRequest ─────────
type ProgressLike = { loaded: number; total: number; lengthComputable: boolean }
class FakeXHR {
  static all: FakeXHR[] = []
  /** send 뒤 다음 차례에 부른다. 기본은 다 보내고 200 */
  static behave: (xhr: FakeXHR) => void = (xhr) => xhr.finish(200)
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = undefined
  status = 0
  responseText = ''
  aborted = false
  withCredentials = false
  upload: { onprogress: ((event: ProgressLike) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value
  }
  send(body: unknown) {
    this.body = body
    FakeXHR.all.push(this)
    log.push('xhr:send')
    queueMicrotask(() => FakeXHR.behave(this))
  }
  abort() {
    if (this.aborted) return
    this.aborted = true
    this.status = 0
    this.onabort?.()
  }
  progress(loaded: number, total: number, lengthComputable = true) {
    this.upload.onprogress?.({ loaded, total, lengthComputable })
  }
  finish(status: number, text = '') {
    if (this.aborted) return
    this.status = status
    this.responseText = text
    this.onload?.()
  }
  fail() {
    this.onerror?.()
  }
}

const pickFile = (name = 'precheck-helper-0.14.0.zip', size?: number, type = 'application/zip') => {
  const file = new File([BYTES_TEXT], name, { type })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}
const upload = (file = pickFile(), over: Partial<{ name: string; category: LibraryFile['category']; description: string }> = {}) => ({
  file,
  name: '  청구 도우미 0.14.0  ',
  category: 'install' as const,
  description: '  청구 도우미 · 비트 자료를 읽는 PC 프로그램  ',
  ...over,
})

beforeEach(() => {
  supabaseBrowser.mockReset()
  log = []
  FakeXHR.all = []
  FakeXHR.behave = (xhr) => xhr.finish(200)
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('AC-8103.1 listLibraryFiles', () => {
  it('AC-8103.1: library_files에서 정해 둔 칸만 올린 시각 늦은 차례로 1,000줄까지 한 번 읽는다(바구니는 부르지 않는다)', async () => {
    const calls = fakeClient()
    await listLibraryFiles()
    expect(calls).toEqual([
      {
        kind: 'table',
        table: TABLE,
        steps: [
          ['select', COLUMNS],
          ['order', 'created_at', { ascending: false }],
          ['limit', 1000],
        ],
      },
    ])
  })

  it('AC-8103.1: 줄을 LibraryFile로 바꾸고 받은 차례를 지킨다', async () => {
    const second = dbRow({ id: 'id-2', file_name: '비트시트_설치_설명서.pdf', name: '설명서', category: 'guide', description: '', storage_path: UUID, size: 0, created_at: '2026-11-24T08:38:00+00:00' })
    fakeClient((call) => (call.kind === 'table' ? { data: [dbRow(), second] } : okReply(call)))
    const files = await listLibraryFiles()
    expect(files).toEqual([
      libFile(),
      { id: 'id-2', fileName: '비트시트_설치_설명서.pdf', name: '설명서', category: 'guide', description: '', storagePath: UUID, size: 0, createdAt: '2026-11-24T08:38:00+00:00' },
    ])
    expect(Object.keys(files[0]).sort()).toEqual(FILE_KEYS)
  })

  it('AC-8103.1: 빈 목록은 빈 배열이다(실패가 아니다)', async () => {
    fakeClient((call) => (call.kind === 'table' ? { data: [] } : okReply(call)))
    expect(await listLibraryFiles()).toEqual([])
  })

  it('AC-8103.1: 모양이 틀린 줄은 버린다', async () => {
    const bad = [
      null,
      'row',
      dbRow({ id: null }),
      dbRow({ id: '' }),
      dbRow({ file_name: 3 }),
      dbRow({ file_name: '' }),
      dbRow({ name: null }),
      dbRow({ category: 'etc' }),
      dbRow({ category: 'INSTALL' }),
      dbRow({ description: null }),
      dbRow({ storage_path: 7 }),
      dbRow({ storage_path: '' }),
      dbRow({ size: '100' }),
      dbRow({ size: -1 }),
      dbRow({ size: 1.5 }),
      dbRow({ size: Number.NaN }),
      dbRow({ created_at: 'not a date' }),
      dbRow({ created_at: null }),
    ]
    fakeClient((call) => (call.kind === 'table' ? { data: [...bad, dbRow({ id: 'good' })] } : okReply(call)))
    expect(await listLibraryFiles()).toEqual([libFile({ id: 'good' })])
  })

  it.each<[string, (call: Call) => Reply]>([
    ['오류 답', () => ({ error: RAW_ERROR })],
    ['오류가 값과 함께 옴', () => ({ data: [dbRow()], error: RAW_ERROR })],
    ['답이 배열이 아님', () => ({ data: dbRow() })],
    ['답이 비어 있음(null)', () => ({ data: null })],
    ['보내다 예외(네트워크)', throwing],
  ])('AC-8103.1·AC-8103.6: 읽기 실패(%s)는 LibraryError(E-LIBRARY-READ-FAILED)이고 빈 목록으로 보이지 않는다', async (_label, reply) => {
    fakeClient(reply)
    await expectCode(() => listLibraryFiles(), 'E-LIBRARY-READ-FAILED')
  })

  it.each(BROKEN_CLIENTS)('AC-8103.1·AC-8103.6: 읽기 실패(%s)도 E-LIBRARY-READ-FAILED다', async (_label, arrange) => {
    arrange()
    await expectCode(() => listLibraryFiles(), 'E-LIBRARY-READ-FAILED')
  })
})

describe('AC-8103.2 downloadLibraryFile', () => {
  function watchClicks() {
    const seen: { href: string; rel: string; target: string; download: string; hidden: boolean; inPage: boolean }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      seen.push({
        href: this.href,
        rel: this.rel,
        target: this.target,
        download: this.getAttribute('download') ?? '(없음)',
        hidden: this.hidden,
        inPage: document.body.contains(this),
      })
    })
    return { seen, click }
  }

  /** 진짜 StorageClient에 가짜 fetch를 넣어 브라우저 클라이언트 자리에 둔다. 서버는 서명 답(signedURL)만 흉내 낸다 */
  function realStorage() {
    const requests: { url: string; method: string; body: unknown }[] = []
    const fakeFetch: typeof fetch = (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
      const reply = { signedURL: `/object/sign/${BUCKET}/${PATH}?token=fake-download-token` }
      return Promise.resolve(new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } }))
    }
    supabaseBrowser.mockReturnValue({ storage: new StorageClient('https://example.supabase.co/storage/v1', { apikey: 'fake-anon-key' }, fakeFetch) })
    return requests
  }

  it('AC-8103.2: 바구니 library에 createSignedUrl(storagePath, 60)을 download 옵션 없이 한 번 부른다(표는 부르지 않는다)', async () => {
    const calls = fakeClient()
    watchClicks()
    await downloadLibraryFile({ storagePath: PATH, fileName: '비트시트 설치 설명서.pdf' })
    expect(calls).toEqual([{ kind: 'storage', bucket: BUCKET, op: 'createSignedUrl', args: [PATH, 60] }])
  })

  it('AC-8103.2: 서명 주소의 download를 파일 이름으로 덮어쓴 숨은 링크를 한 번 누르고(새 탭 없음) 링크를 지운다', async () => {
    fakeClient()
    const { seen } = watchClicks()
    const open = vi.fn()
    vi.stubGlobal('open', open)
    await expect(downloadLibraryFile(libFile())).resolves.toBeUndefined()
    // 가짜 서명 주소 끝의 download=x가 파일 이름 하나로 바뀐다(둘이 되지 않는다)
    const named = `https://example.supabase.co/storage/v1/object/sign/library/${PATH}?token=fake-download-token&download=precheck-helper-0.14.0.zip`
    expect(seen).toEqual([{ href: named, rel: 'noopener', target: '', download: '(없음)', hidden: true, inPage: true }])
    expect(new URL(seen[0].href).searchParams.getAll('download')).toEqual(['precheck-helper-0.14.0.zip'])
    expect(open).not.toHaveBeenCalled()
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })

  it.each(['청구 도우미 설명서.pdf', '50% 할인 + 안내 #2 & 설명.pdf'])(
    'AC-8103.2: 진짜 StorageClient로 받아도 링크의 download가 원래 파일 이름 그대로다(%s)',
    async (fileName) => {
      const requests = realStorage()
      const { seen } = watchClicks()
      await downloadLibraryFile({ storagePath: PATH, fileName })
      expect(requests).toEqual([{ url: `https://example.supabase.co/storage/v1/object/sign/${BUCKET}/${PATH}`, method: 'POST', body: { expiresIn: 60 } }])
      expect(seen).toHaveLength(1)
      const href = new URL(seen[0].href)
      expect(href.searchParams.get('download')).toBe(fileName)
      expect(href.searchParams.getAll('download')).toEqual([fileName])
      expect(href.searchParams.get('token')).toBe('fake-download-token')
      expect(`${href.origin}${href.pathname}`).toBe(`https://example.supabase.co/storage/v1/object/sign/${BUCKET}/${PATH}`)
      expect(document.querySelectorAll('a')).toHaveLength(0)
    },
  )

  it.each<[string, (call: Call) => Reply]>([
    ['오류 답', () => ({ error: RAW_ERROR })],
    ['오류가 값과 함께 옴', () => ({ data: { signedUrl: SIGNED_URL }, error: RAW_ERROR })],
    ['주소가 없음', () => ({ data: {} })],
    ['주소가 글자가 아님', () => ({ data: { signedUrl: 42 } })],
    ['주소가 빈 글자', () => ({ data: { signedUrl: '' } })],
    ['주소가 웹 주소가 아님', () => ({ data: { signedUrl: 'javascript:alert(1)' } })],
    ['보내다 예외(네트워크)', throwing],
  ])('AC-8103.2·AC-8103.6: 받기 실패(%s)는 E-LIBRARY-DOWNLOAD-FAILED이고 누르지 않는다', async (_label, reply) => {
    fakeClient(reply)
    const { click } = watchClicks()
    await expectCode(() => downloadLibraryFile(libFile()), 'E-LIBRARY-DOWNLOAD-FAILED')
    expect(click).not.toHaveBeenCalled()
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })

  it.each(BROKEN_CLIENTS)('AC-8103.2·AC-8103.6: 받기 실패(%s)도 E-LIBRARY-DOWNLOAD-FAILED다', async (_label, arrange) => {
    arrange()
    await expectCode(() => downloadLibraryFile(libFile()), 'E-LIBRARY-DOWNLOAD-FAILED')
  })

  it('AC-8103.2: 누르기가 실패해도 E-LIBRARY-DOWNLOAD-FAILED이고 링크를 남기지 않는다', async () => {
    fakeClient()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error(SECRET)
    })
    await expectCode(() => downloadLibraryFile(libFile()), 'E-LIBRARY-DOWNLOAD-FAILED')
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })
})

describe('AC-8103.3 uploadLibraryFile', () => {
  it('AC-8103.3: 새 uuid로 서명 → 그 주소에 PUT(몸통 = 파일, 형식 = 파일 형식) → 표 줄 넣기 차례다', async () => {
    const calls = fakeClient()
    const file = pickFile()
    await uploadLibraryFile(upload(file))
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send', 'table:insert'])
    expect(calls[0]).toEqual({ kind: 'storage', bucket: BUCKET, op: 'createSignedUploadUrl', args: [UUID] })
    expect(FakeXHR.all).toHaveLength(1)
    const xhr = FakeXHR.all[0]
    expect(xhr.method).toBe('PUT')
    expect(xhr.url).toBe(UPLOAD_URL)
    expect(xhr.headers).toEqual({ 'content-type': 'application/zip' })
    expect(xhr.body).toBe(file)
    expect(xhr.withCredentials).toBe(false)
  })

  it('AC-8103.3: 표 줄은 파일 이름·다듬은 이름·분류·다듬은 설명·바구니 이름·크기만 넣고 넣은 칸을 다시 읽는다(uploaded_by는 DB 기본값)', async () => {
    const calls = fakeClient()
    await uploadLibraryFile(upload(pickFile('precheck-helper-0.14.0.zip', 1_258_291)))
    expect(calls[1]).toEqual({
      kind: 'table',
      table: TABLE,
      steps: [
        [
          'insert',
          {
            file_name: 'precheck-helper-0.14.0.zip',
            name: '청구 도우미 0.14.0',
            category: 'install',
            description: '청구 도우미 · 비트 자료를 읽는 PC 프로그램',
            storage_path: UUID,
            size: 1_258_291,
          },
        ],
        ['select', COLUMNS],
        ['single'],
      ],
    })
  })

  it('AC-8103.3: 넣은 줄을 LibraryFile로 돌려준다', async () => {
    fakeClient()
    const uploaded = await uploadLibraryFile(upload(pickFile('마감일지_쓰는법.pdf', 1_677_722, 'application/pdf'), { name: '마감일지 쓰는 법', category: 'guide', description: '' }))
    expect(uploaded).toEqual({
      id: ID,
      fileName: '마감일지_쓰는법.pdf',
      name: '마감일지 쓰는 법',
      category: 'guide',
      description: '',
      storagePath: UUID,
      size: 1_677_722,
      createdAt: CREATED,
    })
  })

  it('AC-8103.3: 파일 형식이 비어 있으면 application/octet-stream으로 보낸다', async () => {
    fakeClient()
    await uploadLibraryFile(upload(pickFile('비트_사진_모음.hwpx', undefined, '')))
    expect(FakeXHR.all[0].headers).toEqual({ 'content-type': 'application/octet-stream' })
  })

  it('AC-8103.3: 보낸 만큼 onProgress(보낸, 전체)를 부른다', async () => {
    fakeClient()
    FakeXHR.behave = (xhr) => {
      xhr.progress(0, 1_258_291)
      xhr.progress(734_003, 1_258_291)
      xhr.progress(1_258_291, 1_258_291)
      xhr.finish(200)
    }
    const onProgress = vi.fn()
    await uploadLibraryFile(upload(pickFile('precheck-helper-0.14.0.zip', 1_258_291)), { onProgress })
    expect(onProgress.mock.calls).toEqual([
      [0, 1_258_291],
      [734_003, 1_258_291],
      [1_258_291, 1_258_291],
    ])
  })

  it('AC-8103.3: 전체 크기를 모르는 진행 알림이면 전체는 파일 크기다', async () => {
    fakeClient()
    FakeXHR.behave = (xhr) => {
      xhr.progress(500, 0, false)
      xhr.finish(201)
    }
    const onProgress = vi.fn()
    await uploadLibraryFile(upload(pickFile('a.zip', 1_000)), { onProgress })
    expect(onProgress.mock.calls).toEqual([[500, 1_000]])
  })

  it('AC-8103.3: 52,428,800바이트를 넘으면 네트워크 없이 E-LIBRARY-FILE-SIZE다', async () => {
    fakeClient()
    await expectCode(() => uploadLibraryFile(upload(pickFile('비트_사진_모음.zip', LIBRARY_MAX_BYTES + 1))), 'E-LIBRARY-FILE-SIZE')
    expect(supabaseBrowser).not.toHaveBeenCalled()
    expect(FakeXHR.all).toHaveLength(0)
    expect(log).toEqual([])
  })

  it('AC-8103.3: 딱 52,428,800바이트는 올린다', async () => {
    fakeClient()
    const uploaded = await uploadLibraryFile(upload(pickFile('big.zip', LIBRARY_MAX_BYTES)))
    expect(uploaded.size).toBe(LIBRARY_MAX_BYTES)
  })

  it('AC-8103.3: 파일 이름이 200자를 넘으면 네트워크 없이 E-LIBRARY-FILE-NAME이다(200자는 된다)', async () => {
    fakeClient()
    await expectCode(() => uploadLibraryFile(upload(pickFile(`${'가'.repeat(197)}.pdf`))), 'E-LIBRARY-FILE-NAME')
    expect(supabaseBrowser).not.toHaveBeenCalled()
    expect(log).toEqual([])
    await uploadLibraryFile(upload(pickFile(`${'가'.repeat(196)}.pdf`)))
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send', 'table:insert'])
  })
})

describe('AC-8103.4 uploadLibraryFile 실패와 멈춤', () => {
  it.each<[string, (call: Call) => Reply]>([
    ['오류 답', (call) => (call.kind === 'storage' ? { error: RAW_ERROR } : okReply(call))],
    ['주소가 없음', (call) => (call.kind === 'storage' ? { data: { token: 't' } } : okReply(call))],
    ['보내다 예외(네트워크)', (call) => (call.kind === 'storage' ? throwing() : okReply(call))],
  ])('AC-8103.4: 서명 실패(%s)는 E-LIBRARY-UPLOAD-FAILED이고 PUT·표 넣기를 하지 않는다', async (_label, reply) => {
    fakeClient(reply)
    await expectCode(() => uploadLibraryFile(upload()), 'E-LIBRARY-UPLOAD-FAILED')
    expect(FakeXHR.all).toHaveLength(0)
    expect(log).toEqual(['storage:createSignedUploadUrl'])
  })

  it.each(BROKEN_CLIENTS)('AC-8103.4: 서명 실패(%s)도 E-LIBRARY-UPLOAD-FAILED다', async (_label, arrange) => {
    arrange()
    await expectCode(() => uploadLibraryFile(upload()), 'E-LIBRARY-UPLOAD-FAILED')
    expect(FakeXHR.all).toHaveLength(0)
  })

  it.each<[string, (xhr: FakeXHR) => void, string]>([
    ['HTTP 413', (xhr) => xhr.finish(413, ''), 'E-LIBRARY-FILE-SIZE'],
    ['HTTP 400 + 몸통 statusCode 413', (xhr) => xhr.finish(400, JSON.stringify({ statusCode: '413', error: 'Payload too large', message: SECRET })), 'E-LIBRARY-FILE-SIZE'],
    ['HTTP 400 + 몸통 statusCode 400', (xhr) => xhr.finish(400, JSON.stringify({ statusCode: '400', error: 'Bad', message: SECRET })), 'E-LIBRARY-UPLOAD-FAILED'],
    ['HTTP 400 + 몸통 statusCode 숫자 413', (xhr) => xhr.finish(400, JSON.stringify({ statusCode: 413 })), 'E-LIBRARY-UPLOAD-FAILED'],
    ['HTTP 400 + JSON 아닌 몸통', (xhr) => xhr.finish(400, `<html>${SECRET}</html>`), 'E-LIBRARY-UPLOAD-FAILED'],
    ['HTTP 403', (xhr) => xhr.finish(403, JSON.stringify({ statusCode: '403', message: SECRET })), 'E-LIBRARY-UPLOAD-FAILED'],
    ['HTTP 409', (xhr) => xhr.finish(409, ''), 'E-LIBRARY-UPLOAD-FAILED'],
    ['HTTP 500', (xhr) => xhr.finish(500, SECRET), 'E-LIBRARY-UPLOAD-FAILED'],
    ['HTTP 0(답 없음)', (xhr) => xhr.finish(0, ''), 'E-LIBRARY-UPLOAD-FAILED'],
    ['네트워크 끊김', (xhr) => xhr.fail(), 'E-LIBRARY-UPLOAD-FAILED'],
    ['시간 초과', (xhr) => xhr.ontimeout?.(), 'E-LIBRARY-UPLOAD-FAILED'],
  ])('AC-8103.4: PUT 실패(%s)는 %s이고 표 줄을 넣지 않는다', async (_label, behave, code) => {
    const calls = fakeClient()
    FakeXHR.behave = behave
    await expectCode(() => uploadLibraryFile(upload()), code)
    expect(calls.some((call) => call.kind === 'table')).toBe(false)
  })

  it('AC-8103.4: XHR 만들기가 던져도 E-LIBRARY-UPLOAD-FAILED다', async () => {
    fakeClient()
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        constructor() {
          throw new Error(SECRET)
        }
      },
    )
    await expectCode(() => uploadLibraryFile(upload()), 'E-LIBRARY-UPLOAD-FAILED')
    expect(log).toEqual(['storage:createSignedUploadUrl'])
  })

  it('AC-8103.4: 표 넣기가 23505(같은 file_name)면 E-LIBRARY-FILE-EXISTS이고 올라간 바구니 파일을 지운다', async () => {
    const calls = fakeClient((call) => (opOf(call) === 'insert' ? { error: { code: '23505', message: `duplicate key (${SECRET})` } } : okReply(call)))
    await expectCode(() => uploadLibraryFile(upload()), 'E-LIBRARY-FILE-EXISTS')
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send', 'table:insert', 'storage:remove'])
    expect(calls[2]).toEqual({ kind: 'storage', bucket: BUCKET, op: 'remove', args: [[UUID]] })
  })

  it.each<[string, (call: Call) => Reply]>([
    ['그 밖 오류 답', (call) => (opOf(call) === 'insert' ? { error: RAW_ERROR } : okReply(call))],
    ['check 위반', (call) => (opOf(call) === 'insert' ? { error: { code: '23514', message: SECRET } } : okReply(call))],
    ['보내다 예외(네트워크)', (call) => (opOf(call) === 'insert' ? throwing() : okReply(call))],
  ])('AC-8103.4: 표 넣기 실패(%s)는 E-LIBRARY-UPLOAD-FAILED이고 올라간 바구니 파일을 지운다', async (_label, reply) => {
    const calls = fakeClient(reply)
    await expectCode(() => uploadLibraryFile(upload()), 'E-LIBRARY-UPLOAD-FAILED')
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send', 'table:insert', 'storage:remove'])
    expect(calls[2]).toEqual({ kind: 'storage', bucket: BUCKET, op: 'remove', args: [[UUID]] })
  })

  it.each<[string, Reply | 'throw']>([
    ['오류 답', { error: RAW_ERROR }],
    ['예외', 'throw'],
  ])('AC-8103.4: 넣기 실패 뒤 바구니 지우기도 실패(%s)하면 그 실패는 삼키고 넣기 실패 번호를 준다', async (_label, removeReply) => {
    fakeClient((call) => {
      if (opOf(call) === 'insert') return { error: { code: '23505', message: SECRET } }
      if (opOf(call) === 'remove') return removeReply === 'throw' ? throwing() : removeReply
      return okReply(call)
    })
    await expectCode(() => uploadLibraryFile(upload()), 'E-LIBRARY-FILE-EXISTS')
  })

  it('AC-8103.4: 넣기는 됐는데 돌아온 줄 모양이 틀리면 E-LIBRARY-UPLOAD-FAILED이고, 표에 있는 줄의 파일은 지우지 않는다', async () => {
    fakeClient((call) => (opOf(call) === 'insert' ? { data: { id: ID } } : okReply(call)))
    await expectCode(() => uploadLibraryFile(upload()), 'E-LIBRARY-UPLOAD-FAILED')
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send', 'table:insert'])
  })

  it('AC-8103.4: PUT 중 signal로 멈추면 XHR을 끊고 LibraryStopped로 끝나며 표 줄·지우기가 없다', async () => {
    fakeClient()
    const stop = new AbortController()
    FakeXHR.behave = (xhr) => {
      xhr.progress(10, 100)
      stop.abort()
    }
    await expectStopped(() => uploadLibraryFile(upload(), { signal: stop.signal }))
    expect(FakeXHR.all[0].aborted).toBe(true)
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send'])
  })

  it('AC-8103.4: PUT이 다 끝난 뒤(표 넣기 전) 멈추면 다 올라간 바구니 파일을 지우고 LibraryStopped다', async () => {
    const calls = fakeClient()
    const stop = new AbortController()
    FakeXHR.behave = (xhr) => {
      xhr.finish(200)
      stop.abort()
    }
    await expectStopped(() => uploadLibraryFile(upload(), { signal: stop.signal }))
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send', 'storage:remove'])
    expect(calls[1]).toEqual({ kind: 'storage', bucket: BUCKET, op: 'remove', args: [[UUID]] })
  })

  it('AC-8103.4: 표 넣기 중 멈추면 넣은 줄과 바구니 파일을 지우고 LibraryStopped다(표 줄이 남지 않는다)', async () => {
    const stop = new AbortController()
    const calls = fakeClient((call) => {
      if (opOf(call) === 'insert') stop.abort()
      return okReply(call)
    })
    await expectStopped(() => uploadLibraryFile(upload(), { signal: stop.signal }))
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send', 'table:insert', 'table:delete', 'storage:remove'])
    expect(calls[2]).toEqual({ kind: 'table', table: TABLE, steps: [['delete'], ['eq', 'id', ID]] })
    expect(calls[3]).toEqual({ kind: 'storage', bucket: BUCKET, op: 'remove', args: [[UUID]] })
  })

  it('AC-8103.4: 서명 중 멈추면 PUT 없이 LibraryStopped다', async () => {
    const stop = new AbortController()
    fakeClient((call) => {
      if (call.kind === 'storage') stop.abort()
      return okReply(call)
    })
    await expectStopped(() => uploadLibraryFile(upload(), { signal: stop.signal }))
    expect(FakeXHR.all).toHaveLength(0)
    expect(log).toEqual(['storage:createSignedUploadUrl'])
  })

  it('AC-8103.4: 처음부터 멈춘 signal이면 네트워크 없이 LibraryStopped다', async () => {
    fakeClient()
    const stop = new AbortController()
    stop.abort()
    await expectStopped(() => uploadLibraryFile(upload(), { signal: stop.signal }))
    expect(supabaseBrowser).not.toHaveBeenCalled()
    expect(log).toEqual([])
  })

  it('AC-8103.4: 다 끝난 뒤 멈춰도 결과는 그대로다(이미 돌려준 올리기)', async () => {
    fakeClient()
    const stop = new AbortController()
    const uploaded = await uploadLibraryFile(upload(), { signal: stop.signal })
    stop.abort()
    expect(uploaded.storagePath).toBe(UUID)
    expect(log).toEqual(['storage:createSignedUploadUrl', 'xhr:send', 'table:insert'])
  })
})

describe('AC-8103.5 deleteLibraryFile', () => {
  it('AC-8103.5: 바구니 파일을 먼저 지우고(remove([storagePath])) 그다음 표 줄을 id로 지운다', async () => {
    const calls = fakeClient()
    await expect(deleteLibraryFile({ id: ID, storagePath: PATH })).resolves.toBeUndefined()
    expect(calls).toEqual([
      { kind: 'storage', bucket: BUCKET, op: 'remove', args: [[PATH]] },
      { kind: 'table', table: TABLE, steps: [['delete'], ['eq', 'id', ID], ['select', 'id']] },
    ])
  })

  it.each<[string, (call: Call) => Reply]>([
    ['오류 답', (call) => (call.kind === 'storage' ? { error: RAW_ERROR } : okReply(call))],
    ['보내다 예외(네트워크)', (call) => (call.kind === 'storage' ? throwing() : okReply(call))],
  ])('AC-8103.5: 바구니 지우기 실패(%s)면 표 줄을 건드리지 않고 E-LIBRARY-DELETE-FAILED다', async (_label, reply) => {
    const calls = fakeClient(reply)
    await expectCode(() => deleteLibraryFile(libFile()), 'E-LIBRARY-DELETE-FAILED')
    expect(calls.some((call) => call.kind === 'table')).toBe(false)
  })

  it.each<[string, (call: Call) => Reply]>([
    ['오류 답', (call) => (call.kind === 'table' ? { error: RAW_ERROR } : okReply(call))],
    ['지운 줄 0개', (call) => (call.kind === 'table' ? { data: [] } : okReply(call))],
    ['답이 배열이 아님', (call) => (call.kind === 'table' ? { data: { id: ID } } : okReply(call))],
    ['보내다 예외(네트워크)', (call) => (call.kind === 'table' ? throwing() : okReply(call))],
  ])('AC-8103.5: 표 줄 지우기 실패(%s)는 E-LIBRARY-DELETE-FAILED다', async (_label, reply) => {
    fakeClient(reply)
    await expectCode(() => deleteLibraryFile(libFile()), 'E-LIBRARY-DELETE-FAILED')
  })

  it.each(BROKEN_CLIENTS)('AC-8103.5: 지우기 실패(%s)도 E-LIBRARY-DELETE-FAILED다', async (_label, arrange) => {
    arrange()
    await expectCode(() => deleteLibraryFile(libFile()), 'E-LIBRARY-DELETE-FAILED')
  })
})

describe('AC-8103.6 오류 모양과 이 파일이 쓰지 않는 것', () => {
  it('AC-8103.6: LibraryError는 번호만 갖는다(번호가 곧 글이다)', () => {
    const error = new LibraryError('E-LIBRARY-READ-FAILED')
    expect(error.code).toBe('E-LIBRARY-READ-FAILED')
    expect(error.message).toBe('E-LIBRARY-READ-FAILED')
    expect(error.name).toBe('LibraryError')
    expect(new LibraryStopped().name).toBe('LibraryStopped')
  })

  // 주석을 뺀 소스 글자로 본다
  const source = readFileSync(join(process.cwd(), 'src/lib/storage/library.ts'), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')

  it.each([
    ['console', /\bconsole\b/],
    ['브라우저 저장소', /localStorage|sessionStorage|indexedDB|document\.cookie|caches\./],
    ['fetch(받기·올리기는 서명 주소·XHR로만)', /\bfetch\s*\(/],
    ['새 탭', /window\.open|target\s*=|_blank/],
    ['옛 설치 파일 바구니', /install-files/],
  ])('AC-8103.6: %s를 쓰지 않는다', (_label, pattern) => {
    expect(code).not.toMatch(pattern)
  })

  // 데스크가 받는 길이 자료실로 바뀌었다(design.md '설정·관리자 칸과 받기 단추' — TASK-5가 deskInstallFiles.rls.test.ts AC-7007.1 기대를 여기로 옮긴다)
  it('AC-8103.6: 머리 // 주석은 승인된 의원의 데스크도 받는다는 것과 SQL 파일 20261125000000_library.sql을 적는다', () => {
    const comments = source
      .split('\n')
      .filter((line) => /^\s*\/\//.test(line))
      .join('\n')
    expect(comments).toContain('데스크')
    expect(comments).toContain('20261125000000_library.sql')
  })
})
