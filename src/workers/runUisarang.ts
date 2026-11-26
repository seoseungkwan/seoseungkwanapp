import { todayInKorea } from '@/lib/analytics/dates'
import { MAX_BYTES } from '@/lib/parsers/common'
import type { ErrorCode } from '@/types/errors'
import type { UisFileResult } from '@/types/uisarang'
import type { UisReadFailure, UisWorkerMessage, UisWorkerRequest } from './readUisFiles'

// 올리기 칸이 부르는 유일한 입구(specs/uisarang-upload design.md §2). 읽는 일은 Web Worker(uisarang.worker.ts)에서 한다.
// Worker로는 파일 바이트와 오늘 날짜만 간다 — 파일 이름은 넘기지 않는다(환자 이름이 들어 있을 수 있다, AC-8810.8).
// 결과[i]는 넣은 files[i]와 짝이다(이름은 화면이 차례로 붙여 보여 준다)

/** 한 번에 넣을 수 있는 파일 수 */
export const UIS_MAX_FILES = 100
/** 읽기 시간 한도 = 30초 + 파일마다 3초 */
export const UIS_TIMEOUT_MS = 30_000
export const UIS_TIMEOUT_PER_FILE_MS = 3_000

/** reject 값. 번호만 싣는다: E-UIS-TOO-MANY(읽지 않음) · E-ANALYZE-TIMEOUT · E-ANALYZE-FAILED */
export class UisRunError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode) {
    super(code)
    this.name = 'UisRunError'
    this.code = code
  }
}

const createUisWorker = () => new Worker(new URL('./uisarang.worker.ts', import.meta.url), { type: 'module' })

// 파일 하나의 바이트. 못 꺼내면 예외 대신 그 번호(예외 내용·파일 이름은 옮기지 않는다)
async function readBytes(file: File): Promise<ArrayBuffer | UisReadFailure> {
  if (file.size > MAX_BYTES) return 'E-UIS-TOO-BIG' // 통째로 메모리에 올리기 전에 거른다(Worker의 readGrid도 같은 한도)
  try {
    return await file.arrayBuffer()
  } catch {
    return 'E-UIS-UNREADABLE' // 보안 프로그램이 잠갔거나 넣은 뒤 지워진 파일
  }
}

export async function runUisarang(
  files: File[],
  opts: {
    today?: string // 기본 todayInKorea()
    timeoutMs?: number // 기본 30초 + 파일마다 3초
    createWorker?: () => Worker // 시험에서 가짜 Worker를 넣는다
  } = {},
): Promise<UisFileResult[]> {
  if (files.length > UIS_MAX_FILES) throw new UisRunError('E-UIS-TOO-MANY') // 읽지 않는다
  if (files.length === 0) return []
  const today = opts.today ?? todayInKorea()
  const slots = await Promise.all(files.map(readBytes))
  const buffers = slots.filter((slot): slot is ArrayBuffer => typeof slot !== 'string')
  let worker: Worker
  try {
    worker = (opts.createWorker ?? createUisWorker)()
  } catch {
    throw new UisRunError('E-ANALYZE-FAILED')
  }

  return new Promise<UisFileResult[]>((resolve, reject) => {
    const timer = setTimeout(() => fail('E-ANALYZE-TIMEOUT'), opts.timeoutMs ?? UIS_TIMEOUT_MS + UIS_TIMEOUT_PER_FILE_MS * files.length)
    // 끝나면(성공·실패·시간 초과) 언제나 Worker를 끝내고, 그 뒤에 온 메시지는 버린다
    const finish = () => {
      clearTimeout(timer)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
    }
    const fail = (code: ErrorCode) => {
      finish()
      reject(new UisRunError(code))
    }

    worker.onmessage = (event: MessageEvent<UisWorkerMessage>) => {
      const message = event.data
      if (message.type === 'done') {
        if (!Array.isArray(message.results) || message.results.length !== files.length) {
          fail('E-ANALYZE-FAILED')
          return
        }
        finish()
        resolve(message.results)
      } else {
        fail(message.code)
      }
    }
    // 스크립트를 못 불러왔거나 잡히지 않은 예외. 내용이 콘솔에 찍히지 않게 막는다
    worker.onerror = (event) => {
      event.preventDefault()
      fail('E-ANALYZE-FAILED')
    }
    worker.onmessageerror = () => fail('E-ANALYZE-FAILED')

    try {
      const request: UisWorkerRequest = { files: slots, today }
      worker.postMessage(request, buffers) // 복사하지 않고 넘긴다(보낸 쪽 바이트는 비워진다)
    } catch {
      fail('E-ANALYZE-FAILED')
    }
  })
}
