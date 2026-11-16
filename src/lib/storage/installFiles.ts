import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInKorea } from '@/lib/analytics/dates'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ErrorCode } from '@/types/errors'

// 도우미·크롬 확장 설치 파일 목록·받기·올리기 (specs/helper-download design.md '함수', REQ-5102).
// 브라우저 Supabase 클라이언트 + Storage 규칙으로만 한다(ADR-004): 보관함 install-files 안 helper/·extension/ 두 폴더.
// 읽기는 승인된 사용자·관리자만, 올리기는 관리자만 된다(supabase/migrations/20261117000000_install_files.sql).
// 실패는 InstallFilesError(번호) 하나로 바꾼다. Supabase 오류 글은 버리고 밖으로 내지 않는다

export type InstallKind = 'helper' | 'extension'
export type InstallFile = { kind: InstallKind; version: [number, number, number]; name: string; path: string; size: number; uploadedAt: string }
export type InstallErrorCode = Extract<ErrorCode, `E-INSTALL-${string}`>

const BUCKET = 'install-files'
const KINDS: readonly InstallKind[] = ['helper', 'extension']
const ZIP_TYPE = 'application/zip'
const INSTALL_MAX_BYTES = 5_000_000 // 버킷의 한 파일 한도와 같다
// 보관함 올리기 규칙과 같은 모양(폴더 없이 이름만): 판은 숫자 셋, 1~3자리
const NAME = /^precheck-(helper|extension)-([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.zip$/

/** 설치 파일 목록·받기·올리기 실패. 번호만 갖고, 받은 값과 원래 오류 글은 옮기지 않는다 */
export class InstallFilesError extends Error {
  readonly code: ErrorCode
  constructor(code: InstallErrorCode) {
    super(code)
    this.code = code
    this.name = 'InstallFilesError'
  }
}

type Reply = { data: unknown; error: unknown }

/** 'precheck-helper-0.9.0.zip' → { kind: 'helper', version: [0, 9, 0] }. 모양이 다르면 null */
export function parseInstallName(name: string): { kind: InstallKind; version: [number, number, number] } | null {
  const m = NAME.exec(name)
  if (!m) return null
  return { kind: m[1] as InstallKind, version: [Number(m[2]), Number(m[3]), Number(m[4])] }
}

/** 판을 숫자로 견준다(0.10.0 > 0.9.0) */
function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** 목록 한 줄 → 설치 파일. 폴더 줄·다른 종류 이름·크기나 올린 시각이 이상한 줄은 null(무시) */
function fileOf(kind: InstallKind, entry: unknown): InstallFile | null {
  if (typeof entry !== 'object' || entry === null) return null
  const { name, created_at: uploadedAt, metadata } = entry as { name?: unknown; created_at?: unknown; metadata?: unknown }
  if (typeof name !== 'string') return null
  const parsed = parseInstallName(name)
  if (parsed === null || parsed.kind !== kind) return null
  const size = typeof metadata === 'object' && metadata !== null ? (metadata as { size?: unknown }).size : undefined
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return null
  if (typeof uploadedAt !== 'string' || Number.isNaN(Date.parse(uploadedAt))) return null
  return { kind, version: parsed.version, name, path: `${kind}/${name}`, size, uploadedAt }
}

/** 한 폴더에서 가장 높은 판. 읽기 실패는 던진다 */
async function latestOf(client: SupabaseClient, kind: InstallKind): Promise<InstallFile | null> {
  // 새로 올린 차례로 100개: 판이 아주 많아져도 최근 것을 놓치지 않는다
  const { data, error }: Reply = await client.storage.from(BUCKET).list(kind, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
  // 읽기 실패를 빈 목록으로 보이지 않는다
  if (error || !Array.isArray(data)) throw new InstallFilesError('E-INSTALL-READ-FAILED')
  let latest: InstallFile | null = null
  for (const entry of data) {
    const file = fileOf(kind, entry)
    if (file && (latest === null || compareVersions(file.version, latest.version) > 0)) latest = file
  }
  return latest
}

/** 종류마다 가장 높은 판(없으면 null). 실패는 E-INSTALL-READ-FAILED */
export async function latestInstallFiles(): Promise<Record<InstallKind, InstallFile | null>> {
  try {
    const client = supabaseBrowser()
    const [helper, extension] = await Promise.all(KINDS.map((kind) => latestOf(client, kind)))
    return { helper, extension }
  } catch {
    throw new InstallFilesError('E-INSTALL-READ-FAILED')
  }
}

/** 보관함에서 받아 원래 이름으로 저장시킨다. 임시 주소는 누른 뒤 바로 거둔다. 실패는 E-INSTALL-DOWNLOAD-FAILED */
export async function downloadInstallFile(file: InstallFile): Promise<void> {
  try {
    const { data, error }: Reply = await supabaseBrowser().storage.from(BUCKET).download(file.path)
    if (error || !(data instanceof Blob)) throw new InstallFilesError('E-INSTALL-DOWNLOAD-FAILED')
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    try {
      link.href = url
      link.download = file.name
      link.hidden = true
      document.body.append(link)
      link.click()
    } finally {
      link.remove()
      URL.revokeObjectURL(url)
    }
  } catch {
    throw new InstallFilesError('E-INSTALL-DOWNLOAD-FAILED')
  }
}

/** 같은 이름이 이미 있음(Storage는 HTTP 400 + statusCode '409' 또는 HTTP 409로 답한다) */
function isDuplicate(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown }
  return status === 409 || statusCode === '409'
}

/**
 * 관리자가 고른 zip을 <종류>/<이름>으로 올린다(덮어쓰지 않는다). 이름·크기는 네트워크 전에 본다.
 * 윈도우 크롬은 zip 형식을 application/x-zip-compressed로 주기도 해서, 형식을 application/zip으로 다시 싸서 보낸다
 */
export async function uploadInstallFile(file: File): Promise<InstallFile> {
  const parsed = parseInstallName(file.name)
  if (parsed === null) throw new InstallFilesError('E-INSTALL-FILE-NAME')
  if (file.size > INSTALL_MAX_BYTES) throw new InstallFilesError('E-INSTALL-FILE-SIZE')
  const path = `${parsed.kind}/${file.name}`
  let reply: Reply
  try {
    const body = new Blob([file], { type: ZIP_TYPE })
    reply = await supabaseBrowser().storage.from(BUCKET).upload(path, body, { contentType: ZIP_TYPE, upsert: false })
  } catch {
    throw new InstallFilesError('E-INSTALL-UPLOAD-FAILED')
  }
  if (reply.error) throw new InstallFilesError(isDuplicate(reply.error) ? 'E-INSTALL-FILE-EXISTS' : 'E-INSTALL-UPLOAD-FAILED')
  return { kind: parsed.kind, version: parsed.version, name: file.name, path, size: file.size, uploadedAt: new Date().toISOString() }
}

/** 1,000,000바이트 이상은 소수 한 자리 MB, 아래는 KB(1,000바이트). 둘 다 버린다 */
function sizeText(bytes: number): string {
  if (bytes >= 1_000_000) return `${Math.floor(bytes / 1_000_000)}.${Math.floor(bytes / 100_000) % 10}MB`
  return `${Math.floor(bytes / 1_000)}KB`
}

/** '0.9.0 · 900KB · 11월 17일 올림'(날짜는 한국 날짜) */
export function installMeta(file: InstallFile): string {
  const [, month, day] = todayInKorea(new Date(file.uploadedAt)).split('-')
  return `${file.version.join('.')} · ${sizeText(file.size)} · ${Number(month)}월 ${Number(day)}일 올림`
}
