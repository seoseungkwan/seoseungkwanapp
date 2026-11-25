// 비트 PC 연결 받기 단추가 쓰는 설치 파일 함수 = 자료실 위의 얇은 잇기 (specs/library TASK-5, REQ-8109 · AC-8109.3·AC-8109.4, design.md '설정·관리자 칸과 받기 단추').
// 자료실 목록·받기(lib/storage/library)는 흉내다: 무엇을 몇 번 어떤 값으로 불렀는지만 본다. 판·크기·날짜 글자는 진짜 lib/library/files를 쓴다.
// 실제 Supabase에 붙지 않는다. 파일 이름·크기·날짜·uuid는 모두 지어낸 값이다
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dayText, sizeText, versionOf, type LibraryFile } from '@/lib/library/files'
import { LibraryError } from '@/lib/storage/library'
import * as installFiles from './installFiles'
import { InstallFilesError, downloadInstallFile, installMeta, latestInstallFiles, parseInstallName, type InstallFile } from './installFiles'

const lib = vi.hoisted(() => ({ list: vi.fn(), download: vi.fn() }))
vi.mock('@/lib/storage/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/library')>()),
  listLibraryFiles: lib.list,
  downloadLibraryFile: lib.download,
}))
// 이 파일이 Supabase를 직접 부르지 않는지 본다(자료실 함수만 부른다)
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const SECRET = 'secret detail' // 원래 오류에 섞여 온 글자. 밖으로 나가면 안 된다
const UPLOADED = '2026-11-24T15:30:00.000Z' // 한국 11월 25일 0시 30분
const FILE_KEYS = ['kind', 'name', 'path', 'size', 'uploadedAt', 'version']
const SRC = join(process.cwd(), 'src')

let serial = 0
/** 자료실 표 한 줄(지어낸 값). 바구니 이름은 uuid 모양 */
const row = (fileName: string, over: Partial<LibraryFile> = {}): LibraryFile => {
  serial += 1
  const n = String(serial).padStart(12, '0')
  return {
    id: `11111111-1111-4111-8111-${n}`,
    fileName,
    name: fileName,
    category: 'install',
    description: '',
    storagePath: `22222222-2222-4222-8222-${n}`,
    size: 1_258_291,
    createdAt: UPLOADED,
    ...over,
  }
}
/** 그 줄이 받기 단추 쪽 모양으로 바뀐 것 */
const asInstall = (file: LibraryFile): InstallFile => {
  const parsed = versionOf(file.fileName)
  if (parsed === null) throw new Error('판 번호 없는 파일')
  return { kind: parsed.kind, version: parsed.version, name: file.fileName, path: file.storagePath, size: file.size, uploadedAt: file.createdAt }
}

/** 던진 것이 InstallFilesError이고 번호가 code인지, 원래 글자가 섞이지 않았는지 본다 */
async function expectCode(run: () => Promise<unknown>, code: string) {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(InstallFilesError)
  expect((error as InstallFilesError).code).toBe(code)
  expect((error as InstallFilesError).name).toBe('InstallFilesError')
  expect(String((error as Error).message)).not.toContain(SECRET)
  expect(JSON.stringify(error)).not.toContain(SECRET)
}

/** src 아래 시험이 아닌 .ts·.tsx 파일 */
function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}
/** 주석을 뺀 코드 글자 */
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

beforeEach(() => {
  lib.list.mockReset().mockResolvedValue([])
  lib.download.mockReset().mockResolvedValue(undefined)
  supabaseBrowser.mockReset()
})

describe('AC-8109.3 latestInstallFiles — 자료실 목록에서 종류마다 가장 높은 판', () => {
  it('AC-8109.3: 자료실 목록(listLibraryFiles)을 한 번만 읽고 Supabase를 직접 부르지 않는다', async () => {
    await latestInstallFiles()
    expect(lib.list).toHaveBeenCalledTimes(1)
    expect(lib.list).toHaveBeenCalledWith()
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })

  it('AC-8109.3: 종류마다 파일 이름의 판이 가장 높은 파일을 { kind, version, name: 파일 이름, path: 바구니 이름, size, uploadedAt: 올린 시각 }로 준다', async () => {
    const helper = row('precheck-helper-0.14.0.zip', { size: 1_258_291, createdAt: '2026-11-24T15:30:00.000Z' })
    const extension = row('precheck-extension-0.4.0.zip', { size: 6_480, createdAt: '2026-11-20T01:00:00.000Z' })
    lib.list.mockResolvedValue([helper, row('precheck-helper-0.13.3.zip'), extension, row('설명서.pdf', { category: 'guide' })])
    const latest = await latestInstallFiles()
    expect(Object.keys(latest)).toEqual(['helper', 'extension'])
    expect(latest).toEqual({
      helper: { kind: 'helper', version: [0, 14, 0], name: 'precheck-helper-0.14.0.zip', path: helper.storagePath, size: 1_258_291, uploadedAt: '2026-11-24T15:30:00.000Z' },
      extension: { kind: 'extension', version: [0, 4, 0], name: 'precheck-extension-0.4.0.zip', path: extension.storagePath, size: 6_480, uploadedAt: '2026-11-20T01:00:00.000Z' },
    })
    expect(Object.keys(latest.helper as InstallFile).sort()).toEqual(FILE_KEYS)
  })

  it('AC-8109.3: 판은 숫자로 견준다(0.10.0 > 0.9.0, 1.0.0 > 0.99.99) — 올린 차례와 상관없다', async () => {
    const top = row('precheck-helper-0.10.0.zip', { createdAt: '2026-11-01T00:00:00.000Z' })
    const ext = row('precheck-extension-1.0.0.zip', { createdAt: '2026-11-01T00:00:00.000Z' })
    lib.list.mockResolvedValue([
      row('precheck-helper-0.9.0.zip', { createdAt: '2026-11-24T00:00:00.000Z' }),
      top,
      row('precheck-helper-0.2.0.zip'),
      row('precheck-extension-0.99.99.zip', { createdAt: '2026-11-24T00:00:00.000Z' }),
      ext,
    ])
    expect(await latestInstallFiles()).toEqual({ helper: asInstall(top), extension: asInstall(ext) })
  })

  it("AC-8109.3: 분류와 상관없고(설명서·그 밖으로 올려도 판 번호 파일이면 든다), 보이는 이름이 아니라 올릴 때의 파일 이름으로 본다", async () => {
    const helper = row('precheck-helper-0.15.0.zip', { category: 'other', name: '새 도우미' })
    lib.list.mockResolvedValue([
      row('precheck-helper-0.14.0.zip', { category: 'install' }),
      helper,
      // 보이는 이름만 판 번호 모양인 파일은 판 번호 파일이 아니다
      row('도우미.zip', { name: 'precheck-helper-9.9.9.zip' }),
      row('precheck-extension-0.5.0.zip', { category: 'guide', name: '확장' }),
    ])
    const latest = await latestInstallFiles()
    expect(latest.helper).toEqual(asInstall(helper))
    expect(latest.helper?.name).toBe('precheck-helper-0.15.0.zip')
    expect(latest.extension?.version).toEqual([0, 5, 0])
  })

  it('AC-8109.3: 그 종류 판 번호 파일이 없으면 null이다(판 번호 없는 파일만 있어도, 목록이 비어도 실패가 아니다)', async () => {
    lib.list.mockResolvedValue([row('precheck-helper-0.9.0.zip')])
    expect((await latestInstallFiles()).extension).toBeNull()
    lib.list.mockResolvedValue([row('설명서.pdf'), row('precheck-helper-0.9.0.ZIP'), row('precheck-helper-0.9.0 (1).zip'), row('setup.exe')])
    expect(await latestInstallFiles()).toEqual({ helper: null, extension: null })
    lib.list.mockResolvedValue([])
    expect(await latestInstallFiles()).toEqual({ helper: null, extension: null })
  })

  it.each([
    ['자료실 오류(E-LIBRARY-READ-FAILED)', () => new LibraryError('E-LIBRARY-READ-FAILED')],
    ['뜻밖의 예외', () => new Error(SECRET)],
  ])('AC-8109.3: 목록 읽기 실패(%s)는 InstallFilesError(E-INSTALL-READ-FAILED)이고 원래 글이 섞이지 않는다', async (_label, make) => {
    lib.list.mockRejectedValue(make())
    await expectCode(() => latestInstallFiles(), 'E-INSTALL-READ-FAILED')
  })
})

describe('AC-8109.3 downloadInstallFile — 자료실 받기', () => {
  it('AC-8109.3: 그 파일의 바구니 이름·파일 이름으로 자료실 받기(downloadLibraryFile)를 한 번 부른다 — 파일 이름으로 저장', async () => {
    const file = asInstall(row('precheck-helper-0.14.0.zip'))
    await downloadInstallFile(file)
    expect(lib.download).toHaveBeenCalledExactlyOnceWith({ storagePath: file.path, fileName: 'precheck-helper-0.14.0.zip' })
    expect(lib.list).not.toHaveBeenCalled()
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })

  it.each([
    ['자료실 오류(E-LIBRARY-DOWNLOAD-FAILED)', () => new LibraryError('E-LIBRARY-DOWNLOAD-FAILED')],
    ['뜻밖의 예외', () => new Error(SECRET)],
  ])('AC-8109.3: 받기 실패(%s)는 InstallFilesError(E-INSTALL-DOWNLOAD-FAILED)다', async (_label, make) => {
    lib.download.mockRejectedValue(make())
    await expectCode(() => downloadInstallFile(asInstall(row('precheck-extension-0.4.0.zip'))), 'E-INSTALL-DOWNLOAD-FAILED')
  })
})

describe('AC-8109.3 installMeta — 받기 단추 옆 글', () => {
  it("AC-8109.3: '판 · 크기 · M월 D일 올림'이고 크기는 자료실과 같은 sizeText다 — '0.14.0 · 1.2MB · 11월 25일 올림'", () => {
    expect(installMeta(asInstall(row('precheck-helper-0.14.0.zip', { size: 1_258_291, createdAt: UPLOADED })))).toBe('0.14.0 · 1.2MB · 11월 25일 올림')
  })

  it.each([
    [889_612, '869KB'],
    [6_480, '6KB'],
    [8_192, '8KB'],
    [655_360, '640KB'],
    [943_718, '0.9MB'],
    [66_479_718, '63.4MB'],
    [0, '1KB'],
  ])('AC-8109.3: %d바이트 → %s (1KB = 1,024바이트, 900KB 이상은 MB 소수 한 자리)', (size, text) => {
    const file = asInstall(row('precheck-helper-0.9.0.zip', { size }))
    expect(installMeta(file)).toBe(`0.9.0 · ${text} · 11월 25일 올림`)
    expect(text).toBe(sizeText(size))
  })

  it.each([
    ['2026-11-16T15:00:00.000Z', '11월 17일'],
    ['2026-11-16T14:59:59.999Z', '11월 16일'],
    ['2027-01-04T16:00:00.000Z', '1월 5일'],
    ['2026-11-17T10:00:00.123456+00:00', '11월 17일'],
  ])('AC-8109.3: 올린 시각 %s → 한국 날짜 %s(dayText)', (createdAt, day) => {
    expect(installMeta(asInstall(row('precheck-helper-10.20.300.zip', { size: 6_480, createdAt })))).toBe(`10.20.300 · 6KB · ${day} 올림`)
    expect(day).toBe(dayText(createdAt))
  })
})

describe('AC-8109.3·AC-8109.4 내보내는 것 · 옛 보관함 코드 없음', () => {
  it.each([
    ['precheck-helper-0.14.0.zip', { kind: 'helper', version: [0, 14, 0] }],
    ['precheck-extension-0.4.0.zip', { kind: 'extension', version: [0, 4, 0] }],
    ['precheck-helper-0.9.0.ZIP', null],
    ['precheck-helper-0.9.0.1.zip', null],
    ['helper/precheck-helper-0.9.0.zip', null],
  ])('AC-8109.3: parseInstallName은 자료실 versionOf와 같다 — %s', (name, parsed) => {
    expect(parseInstallName(name)).toEqual(parsed)
    expect(parseInstallName(name)).toEqual(versionOf(name))
  })

  it('AC-8109.4: 내보내는 값은 받기 쪽 넷과 오류 하나뿐이다 — 관리자 올리기 함수 uploadInstallFile은 없다', () => {
    expect(Object.keys(installFiles).sort()).toEqual(['InstallFilesError', 'downloadInstallFile', 'installMeta', 'latestInstallFiles', 'parseInstallName'])
  })

  it('AC-8109.3·AC-8109.4: src/의 코드(시험 밖)에 바구니 install-files를 읽거나 올리는 글자·uploadInstallFile·옛 올리기 번호 넷이 없다', () => {
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(100)
    for (const path of files) {
      const code = codeOf(readFileSync(path, 'utf8'))
      const name = relative(SRC, path)
      expect(code, name).not.toMatch(/(['"`])install-files\1/)
      expect(code, name).not.toContain('uploadInstallFile')
      expect(code, name).not.toMatch(/E-INSTALL-(FILE-NAME|FILE-SIZE|FILE-EXISTS|UPLOAD-FAILED)/)
    }
  })

  it('AC-8109.3: installFiles.ts는 자료실 함수 위의 얇은 잇기다 — Supabase·Storage를 직접 부르지 않는다', () => {
    const code = codeOf(readFileSync(join(SRC, 'lib/storage/installFiles.ts'), 'utf8'))
    expect(code).toMatch(/from '@\/lib\/storage\/library'/)
    expect(code).toMatch(/from '@\/lib\/library\/files'/)
    expect(code).not.toMatch(/supabase|storage\.from|createSignedUrl|\.download\(/)
  })

  it('AC-8109.3: InstallFilesError는 번호(code)를 갖는 Error이고 글도 번호뿐이다', () => {
    const error = new InstallFilesError('E-INSTALL-READ-FAILED')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('E-INSTALL-READ-FAILED')
    expect(error.message).toBe('E-INSTALL-READ-FAILED')
    expect(error.name).toBe('InstallFilesError')
  })
})
