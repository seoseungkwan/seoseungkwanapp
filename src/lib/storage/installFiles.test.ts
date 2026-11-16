// @vitest-environment jsdom
// 도우미·크롬 확장 설치 파일 목록·받기·올리기 (specs/helper-download TASK-1, REQ-5102 · AC-5102.1~5102.4, design.md '함수').
// 실제 Supabase에 붙지 않는다. 가짜 클라이언트가 보관함(install-files)에 무엇이 어떤 차례로 나갔는지 적어 둔다.
// 버킷 권한·RLS는 supabase/installFiles.rls.test.ts가 증명한다. 파일 이름·크기·바이트는 모두 지어낸 값이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InstallFilesError,
  downloadInstallFile,
  installMeta,
  latestInstallFiles,
  parseInstallName,
  uploadInstallFile,
  type InstallFile,
} from './installFiles'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const BUCKET = 'install-files'
const ZIP = 'application/zip'
const MAX = 5_000_000
const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const RAW_ERROR = { name: 'StorageApiError', message: `new row violates row-level security policy (${SECRET})`, status: 403, statusCode: '403' }
const CREATED = '2026-11-17T01:00:00.000Z' // 한국 11월 17일 10시
const FILE_KEYS = ['kind', 'name', 'path', 'size', 'uploadedAt', 'version']
// zip 머리(PK\x03\x04)로 시작하는 가짜 바이트
const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])

type StorageCall = { bucket: string; op: 'list' | 'download' | 'upload' | 'update' | 'remove'; path?: unknown; body?: unknown; options?: unknown }
type Reply = { data?: unknown; error?: unknown }

/** Supabase list가 돌려주는 한 줄(파일). 폴더 줄은 id·metadata가 null이다 */
const entry = (name: string, size = 900_000, created = CREATED, over: Record<string, unknown> = {}) => ({
  name,
  id: `id-${name}`,
  updated_at: created,
  created_at: created,
  last_accessed_at: created,
  metadata: { size, mimetype: ZIP, eTag: '"fake"', cacheControl: 'max-age=3600', lastModified: created, contentLength: size, httpStatusCode: 200 },
  ...over,
})
const folder = (name: string) => ({ name, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null })

const helperFile = (over: Partial<InstallFile> = {}): InstallFile => ({
  kind: 'helper',
  version: [0, 9, 0],
  name: 'precheck-helper-0.9.0.zip',
  path: 'helper/precheck-helper-0.9.0.zip',
  size: 900_000,
  uploadedAt: CREATED,
  ...over,
})

/** 폴더마다 목록을 주는 답. 다른 부름은 오류 없음 */
const listing =
  (folders: Record<string, unknown[]>) =>
  (call: StorageCall): Reply => {
    if (call.op === 'list') return { data: folders[call.path as string] ?? [] }
    if (call.op === 'download') return { data: new Blob([BYTES.slice()], { type: ZIP }) }
    if (call.op === 'upload') return { data: { id: 'fake-object', path: call.path, fullPath: `${BUCKET}/${call.path}` } }
    return { data: [] }
  }
const okReply = listing({})

/** 보관함 부름을 한 줄로 적는 가짜 클라이언트를 브라우저 클라이언트 자리에 둔다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: StorageCall) => Reply = okReply) {
  const calls: StorageCall[] = []
  const tables: string[] = []
  const send = (call: StorageCall) => {
    calls.push(call)
    return Promise.resolve()
      .then(() => reply(call))
      .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null }))
  }
  supabaseBrowser.mockReturnValue({
    from(table: string) {
      tables.push(table)
      throw new Error('표는 부르지 않는다')
    },
    storage: {
      from(bucket: string) {
        return {
          list: (path: unknown, options?: unknown) => send({ bucket, op: 'list', path, options }),
          download: (path: unknown) => send({ bucket, op: 'download', path }),
          upload: (path: unknown, body: unknown, options?: unknown) => send({ bucket, op: 'upload', path, body, options }),
          update: (path: unknown, body: unknown, options?: unknown) => send({ bucket, op: 'update', path, body, options }),
          remove: (path: unknown) => send({ bucket, op: 'remove', path }),
        }
      },
    },
  })
  return Object.assign(calls, { tables })
}

const throwing = (): Reply => {
  throw new Error(SECRET)
}

// 오류 답·예외·클라이언트 만들기 실패(모든 부름이 같다)
const FAILURES: [string, () => void][] = [
  ['오류 답', () => fakeClient(() => ({ error: RAW_ERROR }))],
  ['오류가 값과 함께 옴', () => fakeClient((call) => ({ ...listing({ helper: [entry('precheck-helper-0.9.0.zip')] })(call), error: RAW_ERROR }))],
  ['보내다 예외(네트워크)', () => fakeClient(throwing)],
  [
    '클라이언트 만들기 실패',
    () =>
      supabaseBrowser.mockImplementation(() => {
        throw new Error(SECRET)
      }),
  ],
  [
    '보관함 만들기 실패(storage.from이 곧바로 던짐)',
    () =>
      supabaseBrowser.mockReturnValue({
        storage: {
          from: () => {
            throw new Error(SECRET)
          },
        },
      }),
  ],
]

/** 던진 것이 InstallFilesError이고 번호가 code인지, 서버 글자가 섞이지 않았는지 본다 */
async function expectCode(run: () => Promise<unknown>, code: string) {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(InstallFilesError)
  expect(error).toBeInstanceOf(Error)
  expect((error as InstallFilesError).code).toBe(code)
  expect((error as InstallFilesError).name).toBe('InstallFilesError')
  expect(String((error as Error).message)).not.toContain(SECRET)
  expect(JSON.stringify(error)).not.toContain(SECRET)
}

const zipFile = (name: string, size = BYTES.length, type = ZIP) => {
  const file = new File([BYTES.slice()], name, { type })
  if (size !== BYTES.length) Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  supabaseBrowser.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('AC-5102.1 parseInstallName', () => {
  it.each([
    ['precheck-helper-0.9.0.zip', { kind: 'helper', version: [0, 9, 0] }],
    ['precheck-extension-0.3.0.zip', { kind: 'extension', version: [0, 3, 0] }],
    ['precheck-helper-10.20.300.zip', { kind: 'helper', version: [10, 20, 300] }],
    ['precheck-extension-1.0.0.zip', { kind: 'extension', version: [1, 0, 0] }],
  ])('AC-5102.1: %s → 종류와 숫자 판', (name, parsed) => {
    expect(parseInstallName(name)).toEqual(parsed)
  })

  it.each([
    ['', '빈 글자'],
    ['helper/precheck-helper-0.9.0.zip', '폴더가 붙은 이름'],
    ['precheck-helper-0.9.zip', '판 번호 둘'],
    ['precheck-helper-0.9.0.1.zip', '판 번호 넷'],
    ['precheck-helper-1000.0.0.zip', '판 번호 네 자리(보관함 규칙과 같다)'],
    ['precheck-helper-a.b.c.zip', '판 번호가 글자'],
    ['precheck-helper-0x9x0.zip', '점 대신 다른 글자'],
    ['precheck-helper-0.9.0xzip', '.zip 앞 점 대신 다른 글자'],
    ['precheck-helper-0.9.0 (1).zip', '같은 파일을 두 번 받아 붙은 (1)'],
    ['precheck-helper-0.9.0.ZIP', '대문자 ZIP'],
    ['Precheck-helper-0.9.0.zip', '대문자로 시작'],
    ['precheck-helper-0.9.0.exe', 'exe'],
    ['precheck-helper-0.9.0.zip.exe', 'zip 뒤에 더'],
    ['precheck-helper-0.9.0.zip\n', '끝에 줄바꿈'],
    [' precheck-helper-0.9.0.zip', '앞에 빈칸'],
    ['precheck-tool-0.9.0.zip', '다른 종류'],
    ['precheck-helper-.9.0.zip', '빈 판 번호'],
    ['precheck-helper-０.9.0.zip', '전각 숫자'],
  ])('AC-5102.1: %j(%s)은 null이다', (name) => {
    expect(parseInstallName(name)).toBeNull()
  })

  it('AC-5102.1: 판 견주기는 숫자로 한다 — 0.10.0 > 0.9.0, 0.9.10 > 0.9.9, 1.0.0 > 0.99.99', async () => {
    fakeClient(
      listing({
        helper: [entry('precheck-helper-0.9.0.zip'), entry('precheck-helper-0.10.0.zip'), entry('precheck-helper-0.2.0.zip')],
        extension: [entry('precheck-extension-0.9.9.zip'), entry('precheck-extension-0.9.10.zip'), entry('precheck-extension-0.99.99.zip'), entry('precheck-extension-1.0.0.zip')],
      }),
    )
    const latest = await latestInstallFiles()
    expect(latest.helper?.version).toEqual([0, 10, 0])
    expect(latest.extension?.version).toEqual([1, 0, 0])

    fakeClient(listing({ extension: [entry('precheck-extension-0.9.10.zip'), entry('precheck-extension-0.9.9.zip')] }))
    expect((await latestInstallFiles()).extension?.name).toBe('precheck-extension-0.9.10.zip')
  })
})

describe('AC-5102.2 latestInstallFiles', () => {
  it('AC-5102.2: install-files 보관함의 helper·extension 두 폴더를 한 번씩 100개까지 읽는다(새로 올린 차례로, 표는 부르지 않는다)', async () => {
    const calls = fakeClient()
    await latestInstallFiles()
    expect(supabaseBrowser).toHaveBeenCalledTimes(1)
    expect(calls.map((call) => [call.bucket, call.op, call.path]).sort()).toEqual([
      [BUCKET, 'list', 'extension'],
      [BUCKET, 'list', 'helper'],
    ])
    for (const call of calls) {
      expect(call.options).toEqual({ limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
    }
    expect(calls.tables).toEqual([])
  })

  it('AC-5102.2: 종류마다 가장 높은 판을 { kind, version, name, path, size, uploadedAt }로 준다', async () => {
    fakeClient(
      listing({
        helper: [entry('precheck-helper-0.8.0.zip', 880_000, '2026-11-10T00:00:00.000Z'), entry('precheck-helper-0.9.0.zip', 900_000, CREATED)],
        extension: [entry('precheck-extension-0.3.0.zip', 6_143, '2026-11-16T23:30:00.000Z')],
      }),
    )
    const latest = await latestInstallFiles()
    expect(Object.keys(latest)).toEqual(['helper', 'extension'])
    expect(latest).toEqual({
      helper: helperFile(),
      extension: {
        kind: 'extension',
        version: [0, 3, 0],
        name: 'precheck-extension-0.3.0.zip',
        path: 'extension/precheck-extension-0.3.0.zip',
        size: 6_143,
        uploadedAt: '2026-11-16T23:30:00.000Z',
      },
    })
    expect(Object.keys(latest.helper as InstallFile).sort()).toEqual(FILE_KEYS)
  })

  it('AC-5102.2: 파일이 없는 종류는 null이고, 둘 다 없으면 둘 다 null이다(실패가 아니다)', async () => {
    fakeClient(listing({ helper: [entry('precheck-helper-0.9.0.zip')] }))
    expect(await latestInstallFiles()).toEqual({ helper: helperFile(), extension: null })
    fakeClient()
    expect(await latestInstallFiles()).toEqual({ helper: null, extension: null })
  })

  it('AC-5102.2: 이름 모양이 틀린 파일·폴더 줄·다른 종류 이름·크기나 날짜가 이상한 줄은 무시한다', async () => {
    fakeClient(
      listing({
        helper: [
          entry('.emptyFolderPlaceholder', 0),
          entry('precheck-helper-9.9.9 (1).zip'),
          entry('precheck-helper-9.9.9.exe'),
          entry('precheck-extension-9.9.9.zip'), // 도우미 폴더 안의 확장 이름
          folder('precheck-helper-9.9.9.zip'),
          entry('precheck-helper-8.8.8.zip', 900_000, CREATED, { metadata: null }),
          entry('precheck-helper-7.7.7.zip', 900_000, CREATED, { metadata: { size: '900000' } }),
          entry('precheck-helper-6.6.6.zip', -1),
          entry('precheck-helper-5.5.5.zip', 900_000, CREATED, { created_at: null }),
          entry('precheck-helper-4.4.4.zip', 900_000, 'not a date'),
          null,
          'precheck-helper-3.3.3.zip',
          entry('precheck-helper-0.9.0.zip'),
        ],
        extension: [entry('precheck-helper-9.9.9.zip'), entry('readme.txt')],
      }),
    )
    expect(await latestInstallFiles()).toEqual({ helper: helperFile(), extension: null })
  })

  it.each(FAILURES)('AC-5102.2: 읽기 실패(%s)는 InstallFilesError(E-INSTALL-READ-FAILED)다', async (_label, arrange) => {
    arrange()
    await expectCode(() => latestInstallFiles(), 'E-INSTALL-READ-FAILED')
  })

  it('AC-5102.2: 한 폴더만 실패해도 빈 목록으로 보이지 않고 E-INSTALL-READ-FAILED다', async () => {
    fakeClient((call) => (call.path === 'extension' ? { error: RAW_ERROR } : listing({ helper: [entry('precheck-helper-0.9.0.zip')] })(call)))
    await expectCode(() => latestInstallFiles(), 'E-INSTALL-READ-FAILED')
  })

  it('AC-5102.2: 목록 답이 배열이 아니면 E-INSTALL-READ-FAILED다', async () => {
    fakeClient((call) => (call.path === 'helper' ? { data: { name: 'precheck-helper-0.9.0.zip' } } : okReply(call)))
    await expectCode(() => latestInstallFiles(), 'E-INSTALL-READ-FAILED')
  })
})

describe('AC-5102.2 installMeta', () => {
  it("AC-5102.2: '판 · 크기 · M월 D일 올림' 모양이다", () => {
    expect(installMeta(helperFile({ version: [0, 9, 0], size: 1_234_567, uploadedAt: CREATED }))).toBe('0.9.0 · 1.2MB · 11월 17일 올림')
    expect(installMeta(helperFile({ version: [0, 3, 0], size: 6_143, uploadedAt: CREATED }))).toBe('0.3.0 · 6KB · 11월 17일 올림')
  })

  it.each([
    [1_000_000, '1.0MB'],
    [1_099_999, '1.0MB'],
    [1_299_999, '1.2MB'],
    [4_999_999, '4.9MB'],
    [5_000_000, '5.0MB'],
    [12_345_678, '12.3MB'],
    [999_999, '999KB'],
    [889_612, '889KB'],
    [6_143, '6KB'],
    [1_999, '1KB'],
    [999, '0KB'],
  ])('AC-5102.2: %d바이트 → %s (1MB=1,000,000바이트 이상은 소수 한 자리 MB, 아래는 KB, 둘 다 버림)', (size, text) => {
    expect(installMeta(helperFile({ size }))).toBe(`0.9.0 · ${text} · 11월 17일 올림`)
  })

  it.each([
    ['2026-11-16T15:00:00.000Z', '11월 17일'], // 한국 11월 17일 0시
    ['2026-11-16T14:59:59.999Z', '11월 16일'],
    ['2026-11-17T14:59:59.000Z', '11월 17일'],
    ['2027-01-04T16:00:00.000Z', '1월 5일'],
    ['2026-11-17T10:00:00.123456+00:00', '11월 17일'], // Supabase가 주는 모양
  ])('AC-5102.2: 올린 시각 %s → 한국 날짜 %s', (uploadedAt, day) => {
    expect(installMeta(helperFile({ uploadedAt }))).toBe(`0.9.0 · 900KB · ${day} 올림`)
  })

  it('AC-5102.2: 판은 세 숫자를 점으로 잇는다', () => {
    expect(installMeta(helperFile({ version: [10, 20, 300] }))).toBe('10.20.300 · 900KB · 11월 17일 올림')
  })
})

describe('AC-5102.3 downloadInstallFile', () => {
  function stubUrl() {
    const createObjectURL = vi.fn((blob: Blob) => (blob ? 'blob:fake-url' : ''))
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    return { createObjectURL, revokeObjectURL }
  }

  it('AC-5102.3: 보관함에서 그 path를 받아 원래 이름으로 저장시키고, 임시 주소는 누른 뒤 바로 거두며 링크도 남기지 않는다', async () => {
    const calls = fakeClient()
    const { createObjectURL, revokeObjectURL } = stubUrl()
    const seen: { download: string; href: string; inPage: boolean; revokedBefore: number }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      seen.push({ download: this.download, href: this.href, inPage: document.body.contains(this), revokedBefore: revokeObjectURL.mock.calls.length })
    })

    await downloadInstallFile(helperFile())

    expect(calls.map((call) => [call.bucket, call.op, call.path])).toEqual([[BUCKET, 'download', 'helper/precheck-helper-0.9.0.zip']])
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(BYTES)
    expect(seen).toEqual([{ download: 'precheck-helper-0.9.0.zip', href: 'blob:fake-url', inPage: true, revokedBefore: 0 }])
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })

  it('AC-5102.3: 확장 파일은 extension 폴더 path로 받고 그 이름으로 저장시킨다', async () => {
    const calls = fakeClient()
    stubUrl()
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    await downloadInstallFile(
      helperFile({ kind: 'extension', version: [0, 3, 0], name: 'precheck-extension-0.3.0.zip', path: 'extension/precheck-extension-0.3.0.zip' }),
    )
    expect(calls.map((call) => call.path)).toEqual(['extension/precheck-extension-0.3.0.zip'])
    expect(names).toEqual(['precheck-extension-0.3.0.zip'])
  })

  it.each(FAILURES)('AC-5102.3: 받기 실패(%s)는 E-INSTALL-DOWNLOAD-FAILED이고 저장시키지 않는다', async (_label, arrange) => {
    arrange()
    const { createObjectURL } = stubUrl()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await expectCode(() => downloadInstallFile(helperFile()), 'E-INSTALL-DOWNLOAD-FAILED')
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })

  it('AC-5102.3: 받은 것이 파일(Blob)이 아니면 E-INSTALL-DOWNLOAD-FAILED다', async () => {
    fakeClient((call) => (call.op === 'download' ? { data: 'not a blob' } : okReply(call)))
    const { createObjectURL } = stubUrl()
    await expectCode(() => downloadInstallFile(helperFile()), 'E-INSTALL-DOWNLOAD-FAILED')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('AC-5102.3: 임시 주소 만들기나 누르기가 실패해도 E-INSTALL-DOWNLOAD-FAILED이고, 만든 주소는 거두고 링크를 남기지 않는다', async () => {
    fakeClient()
    const { createObjectURL, revokeObjectURL } = stubUrl()
    createObjectURL.mockImplementationOnce(() => {
      throw new Error(SECRET)
    })
    await expectCode(() => downloadInstallFile(helperFile()), 'E-INSTALL-DOWNLOAD-FAILED')

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error(SECRET)
    })
    await expectCode(() => downloadInstallFile(helperFile()), 'E-INSTALL-DOWNLOAD-FAILED')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })
})

describe('AC-5102.4 uploadInstallFile', () => {
  it.each([
    ['precheck-helper-0.9.0.zip', 'helper/precheck-helper-0.9.0.zip', 'helper', [0, 9, 0]],
    ['precheck-extension-0.3.0.zip', 'extension/precheck-extension-0.3.0.zip', 'extension', [0, 3, 0]],
  ])('AC-5102.4: %s는 %s로 한 번 올리고(contentType application/zip, upsert false) 올린 파일을 돌려준다', async (name, path, kind, version) => {
    const calls = fakeClient()
    const before = Date.now()
    const uploaded = await uploadInstallFile(zipFile(name))
    const after = Date.now()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ bucket: BUCKET, op: 'upload', path })
    expect(calls[0].options).toEqual({ contentType: ZIP, upsert: false })
    expect(uploaded).toMatchObject({ kind, version, name, path, size: BYTES.length })
    expect(Object.keys(uploaded).sort()).toEqual(FILE_KEYS)
    const at = Date.parse(uploaded.uploadedAt)
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(after)
    expect(calls.tables).toEqual([])
  })

  it('AC-5102.4: 윈도우 크롬이 준 형식(application/x-zip-compressed)이어도 보내는 파일 형식은 application/zip이고 바이트는 그대로다', async () => {
    const calls = fakeClient()
    await uploadInstallFile(zipFile('precheck-helper-0.9.0.zip', BYTES.length, 'application/x-zip-compressed'))
    const body = calls[0].body as Blob
    expect(body).toBeInstanceOf(Blob)
    expect(body.type).toBe(ZIP)
    expect(new Uint8Array(await body.arrayBuffer())).toEqual(BYTES)
  })

  it.each([
    'precheck-helper-0.9.zip',
    'precheck-helper-0.9.0 (1).zip',
    'precheck-helper-0.9.0.ZIP',
    'helper-0.9.0.zip',
    'precheck-helper-0.9.0.exe',
    'setup.zip',
  ])('AC-5102.4: 이름 모양이 틀리면(%s) 네트워크 없이 E-INSTALL-FILE-NAME이다', async (name) => {
    fakeClient()
    await expectCode(() => uploadInstallFile(zipFile(name)), 'E-INSTALL-FILE-NAME')
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })

  it('AC-5102.4: 5,000,000바이트를 넘으면 네트워크 없이 E-INSTALL-FILE-SIZE이고, 딱 5,000,000바이트는 올린다', async () => {
    const calls = fakeClient()
    await expectCode(() => uploadInstallFile(zipFile('precheck-helper-0.9.0.zip', MAX + 1)), 'E-INSTALL-FILE-SIZE')
    expect(supabaseBrowser).not.toHaveBeenCalled()
    await expect(uploadInstallFile(zipFile('precheck-helper-0.9.0.zip', MAX))).resolves.toMatchObject({ size: MAX })
    expect(calls).toHaveLength(1)
  })

  it('AC-5102.4: 이름도 틀리고 크기도 넘으면 이름 오류(E-INSTALL-FILE-NAME)가 먼저다', async () => {
    fakeClient()
    await expectCode(() => uploadInstallFile(zipFile('setup.zip', MAX + 1)), 'E-INSTALL-FILE-NAME')
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })

  it.each([
    ['옛 모양(HTTP 400 · statusCode 409 Duplicate)', { name: 'StorageApiError', message: `The resource already exists ${SECRET}`, status: 400, statusCode: '409' }],
    ['새 모양(HTTP 409)', { name: 'StorageApiError', message: `The resource already exists ${SECRET}`, status: 409, statusCode: '409' }],
  ])('AC-5102.4: 같은 이름이 이미 있으면 E-INSTALL-FILE-EXISTS다 — %s', async (_label, error) => {
    fakeClient(() => ({ error }))
    await expectCode(() => uploadInstallFile(zipFile('precheck-helper-0.9.0.zip')), 'E-INSTALL-FILE-EXISTS')
  })

  it.each([
    ['권한 없음(관리자 아님)', RAW_ERROR],
    ['형식 거절', { name: 'StorageApiError', message: `mime type not supported ${SECRET}`, status: 415, statusCode: '415' }],
    ['너무 큼(서버)', { name: 'StorageApiError', message: `Payload too large ${SECRET}`, status: 413, statusCode: '413' }],
    ['모르는 오류', { message: SECRET }],
  ])('AC-5102.4: 그 밖 실패(%s)는 E-INSTALL-UPLOAD-FAILED다', async (_label, error) => {
    fakeClient(() => ({ error }))
    await expectCode(() => uploadInstallFile(zipFile('precheck-helper-0.9.0.zip')), 'E-INSTALL-UPLOAD-FAILED')
  })

  it.each(FAILURES.filter(([label]) => label !== '오류 답' && label !== '오류가 값과 함께 옴'))(
    'AC-5102.4: 그 밖 실패(%s)는 E-INSTALL-UPLOAD-FAILED다',
    async (_label, arrange) => {
      arrange()
      await expectCode(() => uploadInstallFile(zipFile('precheck-helper-0.9.0.zip')), 'E-INSTALL-UPLOAD-FAILED')
    },
  )
})

describe('InstallFilesError', () => {
  it('AC-5102.2: 번호(code)를 갖는 Error이고 글도 번호뿐이다', () => {
    const error = new InstallFilesError('E-INSTALL-READ-FAILED')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('E-INSTALL-READ-FAILED')
    expect(error.message).toBe('E-INSTALL-READ-FAILED')
    expect(error.name).toBe('InstallFilesError')
  })
})
