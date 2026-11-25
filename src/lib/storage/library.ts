import type { SupabaseClient } from '@supabase/supabase-js'
import { pickProblem, type LibraryCategory, type LibraryFile } from '@/lib/library/files'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ErrorCode } from '@/types/errors'

// 자료실 목록·받기·올리기·지우기 (specs/library design.md '저장 함수', REQ-8103 · ADR-051).
// 브라우저 Supabase 클라이언트 + RLS·Storage 규칙으로만 한다(ADR-004): 모든 의원이 같이 보는 표 library_files와
// 비공개 바구니 library(폴더 없이 uuid 이름 — Storage는 한글 이름을 받지 않아 원래 이름은 표에 둔다).
// 읽기·받기는 승인된 의원의 원장과 그 의원의 데스크, 관리자가 하고, 올리기·지우기는 관리자만 된다
// (supabase/migrations/20261125000000_library.sql). 데스크도 비트 PC 연결 화면의 받기 단추·자료실에서 여기로 받는다.
// 받기는 1분짜리 서명 주소로 가는 숨은 링크(새 탭 없음), 올리기는 서명한 올리기 주소에 XMLHttpRequest PUT(진행률·멈춤).
// 바구니 먼저 → 표 나중: 남는 것이 생겨도 '목록에 없는 바구니 파일'(안 보임) 쪽이 되게 한다.
// 실패는 LibraryError(번호) 하나로 바꾼다. Supabase 오류 글·파일 내용은 버리고 밖으로 내지 않는다. 콘솔·브라우저 저장소를 쓰지 않는다

export type LibraryErrorCode = Extract<ErrorCode, `E-LIBRARY-${string}`>

const TABLE = 'library_files'
const BUCKET = 'library'
const COLUMNS = 'id, file_name, name, category, description, storage_path, size, created_at'
const LIST_MAX = 1000
const SIGNED_SECONDS = 60
const OCTET = 'application/octet-stream'
const DUPLICATE = '23505'
const CATEGORIES: readonly string[] = ['install', 'guide', 'other'] satisfies LibraryCategory[]

/** 자료실 실패. 번호만 갖고, 받은 값과 원래 오류 글은 옮기지 않는다 */
export class LibraryError extends Error {
  readonly code: LibraryErrorCode
  constructor(code: LibraryErrorCode) {
    super(code)
    this.code = code
    this.name = 'LibraryError'
  }
}

/** 올리기를 멈춤(signal). 오류가 아니다 — 표 줄은 남지 않는다 */
export class LibraryStopped extends Error {
  constructor() {
    super('stopped')
    this.name = 'LibraryStopped'
  }
}

type Reply = { data: unknown; error: unknown }

const isText = (value: unknown): value is string => typeof value === 'string'
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** 표 한 줄 → LibraryFile. 모양이 틀리면 null(버림) */
function fileOf(row: unknown): LibraryFile | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  const { id, file_name: fileName, name, category, description, storage_path: storagePath, size, created_at: createdAt } = r
  if (!isFilled(id) || !isFilled(fileName) || !isText(name) || !isText(description) || !isFilled(storagePath)) return null
  if (!isText(category) || !CATEGORIES.includes(category)) return null
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return null
  if (!isText(createdAt) || Number.isNaN(Date.parse(createdAt))) return null
  return { id, fileName, name, category: category as LibraryCategory, description, storagePath, size, createdAt }
}

/** 자료실 목록(올린 시각 늦은 차례, 1,000줄까지). 실패는 E-LIBRARY-READ-FAILED — 빈 목록으로 보이지 않는다 */
export async function listLibraryFiles(): Promise<LibraryFile[]> {
  let reply: Reply
  try {
    reply = await supabaseBrowser().from(TABLE).select(COLUMNS).order('created_at', { ascending: false }).limit(LIST_MAX)
  } catch {
    throw new LibraryError('E-LIBRARY-READ-FAILED')
  }
  if (reply.error || !Array.isArray(reply.data)) throw new LibraryError('E-LIBRARY-READ-FAILED')
  return reply.data.map(fileOf).filter((file): file is LibraryFile => file !== null)
}

/** 서명 주소로 가는 숨은 링크를 한 번 눌러 브라우저가 원래 파일 이름으로 저장하게 한다. 실패는 E-LIBRARY-DOWNLOAD-FAILED */
export async function downloadLibraryFile(file: Pick<LibraryFile, 'storagePath' | 'fileName'>): Promise<void> {
  try {
    const { data, error }: Reply = await supabaseBrowser()
      .storage.from(BUCKET)
      .createSignedUrl(file.storagePath, SIGNED_SECONDS, { download: file.fileName })
    const url = typeof data === 'object' && data !== null ? (data as { signedUrl?: unknown }).signedUrl : undefined
    if (error || !isText(url) || !/^https?:\/\//.test(url)) throw new LibraryError('E-LIBRARY-DOWNLOAD-FAILED')
    const link = document.createElement('a')
    try {
      link.href = url
      link.rel = 'noopener'
      link.hidden = true
      document.body.append(link)
      link.click()
    } finally {
      link.remove()
    }
  } catch {
    throw new LibraryError('E-LIBRARY-DOWNLOAD-FAILED')
  }
}

export type LibraryUpload = { file: File; name: string; category: LibraryCategory; description: string }
export type UploadOptions = { onProgress?: (sent: number, total: number) => void; signal?: AbortSignal }

/** Storage가 너무 큰 파일에 주는 답: HTTP 413, 또는 HTTP 400 + 몸통 JSON statusCode '413' */
function isTooBig(status: number, body: string): boolean {
  if (status === 413) return true
  if (status !== 400) return false
  try {
    const parsed: unknown = JSON.parse(body)
    return typeof parsed === 'object' && parsed !== null && (parsed as { statusCode?: unknown }).statusCode === '413'
  } catch {
    return false
  }
}

/** 서명한 올리기 주소에 파일을 PUT. 2xx만 성공, 멈추면 LibraryStopped */
function put(url: string, file: File, options: UploadOptions): Promise<void> {
  const { onProgress, signal } = options
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let xhr: XMLHttpRequest | undefined
    const onAbort = () => {
      xhr?.abort()
      finish(new LibraryStopped())
    }
    const finish = (failure?: Error) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      if (failure) reject(failure)
      else resolve()
    }
    const failed = () => finish(new LibraryError('E-LIBRARY-UPLOAD-FAILED'))
    try {
      xhr = new XMLHttpRequest()
      const request = xhr
      request.open('PUT', url)
      request.setRequestHeader('content-type', file.type || OCTET)
      request.upload.onprogress = (event) => {
        if (!settled) onProgress?.(event.loaded, event.lengthComputable && event.total > 0 ? event.total : file.size)
      }
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) finish()
        else finish(new LibraryError(isTooBig(request.status, request.responseText) ? 'E-LIBRARY-FILE-SIZE' : 'E-LIBRARY-UPLOAD-FAILED'))
      }
      request.onerror = failed
      request.ontimeout = failed
      request.onabort = () => finish(new LibraryStopped())
      signal?.addEventListener('abort', onAbort, { once: true })
      request.send(file)
    } catch {
      failed()
    }
  })
}

/** 정리(바구니 파일·넣은 줄 거두기). 실패는 삼킨다 — 정리 실패는 올리기 결과를 바꾸지 않고, 목록에 없는 바구니 파일은 보이지 않는다 */
async function quietly(run: () => PromiseLike<unknown>): Promise<void> {
  try {
    await run()
  } catch {
    // 삼킨다
  }
}

/**
 * 관리자가 고른 파일을 새 uuid 이름으로 바구니에 올리고 표 줄을 넣는다. 크기·파일 이름 길이는 네트워크 전에 본다.
 * 표 넣기가 실패하면 올라간 바구니 파일을 지운다(같은 파일 이름 23505 → E-LIBRARY-FILE-EXISTS).
 * signal로 멈추면 LibraryStopped이고 표 줄은 남지 않으며, 이미 다 올라간 파일은 지운다
 */
export async function uploadLibraryFile(input: LibraryUpload, options: UploadOptions = {}): Promise<LibraryFile> {
  const { file, name, category, description } = input
  const { signal } = options
  const problem = pickProblem(file, [])
  if (problem) throw new LibraryError(problem)
  if (signal?.aborted) throw new LibraryStopped()

  const path = crypto.randomUUID()
  let client: SupabaseClient
  let url: string
  try {
    client = supabaseBrowser()
    const { data, error }: Reply = await client.storage.from(BUCKET).createSignedUploadUrl(path)
    const signed = typeof data === 'object' && data !== null ? (data as { signedUrl?: unknown }).signedUrl : undefined
    if (error || !isFilled(signed)) throw new LibraryError('E-LIBRARY-UPLOAD-FAILED')
    url = signed
  } catch {
    throw new LibraryError('E-LIBRARY-UPLOAD-FAILED')
  }
  if (signal?.aborted) throw new LibraryStopped()

  await put(url, file, options)
  if (signal?.aborted) {
    await quietly(() => client.storage.from(BUCKET).remove([path]))
    throw new LibraryStopped()
  }

  let reply: Reply
  try {
    reply = await client
      .from(TABLE)
      .insert({ file_name: file.name, name: name.trim(), category, description: description.trim(), storage_path: path, size: file.size })
      .select(COLUMNS)
      .single()
  } catch {
    reply = { data: null, error: true }
  }
  const inserted = reply.error ? null : fileOf(reply.data)
  if (signal?.aborted) {
    // 넣는 사이 멈춤: 넣은 줄과 바구니 파일을 함께 거둔다
    if (inserted) await quietly(() => client.from(TABLE).delete().eq('id', inserted.id))
    await quietly(() => client.storage.from(BUCKET).remove([path]))
    throw new LibraryStopped()
  }
  if (reply.error) {
    await quietly(() => client.storage.from(BUCKET).remove([path]))
    const duplicate = typeof reply.error === 'object' && reply.error !== null && (reply.error as { code?: unknown }).code === DUPLICATE
    throw new LibraryError(duplicate ? 'E-LIBRARY-FILE-EXISTS' : 'E-LIBRARY-UPLOAD-FAILED')
  }
  // 넣기는 됐는데 돌아온 모양이 틀림: 표에 줄이 있으니 파일은 두고 실패만 알린다(다시 읽으면 보인다)
  if (inserted === null) throw new LibraryError('E-LIBRARY-UPLOAD-FAILED')
  return inserted
}

/** 바구니 파일을 먼저, 그다음 표 줄을 id로 지운다. 바구니 지우기 실패면 표 줄을 건드리지 않는다. 실패·지운 줄 0개는 E-LIBRARY-DELETE-FAILED */
export async function deleteLibraryFile(file: Pick<LibraryFile, 'id' | 'storagePath'>): Promise<void> {
  try {
    const client = supabaseBrowser()
    const removed: Reply = await client.storage.from(BUCKET).remove([file.storagePath])
    if (removed.error) throw new LibraryError('E-LIBRARY-DELETE-FAILED')
    const { data, error }: Reply = await client.from(TABLE).delete().eq('id', file.id).select('id')
    if (error || !Array.isArray(data) || data.length === 0) throw new LibraryError('E-LIBRARY-DELETE-FAILED')
  } catch {
    throw new LibraryError('E-LIBRARY-DELETE-FAILED')
  }
}
