import { todayInKorea } from '@/lib/analytics/dates'
import { MAX_BYTES } from '@/lib/parsers/common'
import type { RxGroupDef } from '@/types/analysis'
import type { AnalyzeOutput, ReadFailure, WorkerMessage, WorkerRequest } from '@/types/analyze'
import type { ErrorCode } from '@/types/errors'

// 화면이 부르는 유일한 입구. 읽고 세는 일은 Web Worker에서 한다(10만 줄에서도 화면이 멈추지 않게).
// Worker로는 파일 바이트와 오늘 날짜, 처방코드 그룹 정의만 간다 — 파일 이름은 넘기지 않는다(환자 이름이 들어 있을 수 있다).
// 결과의 files[i]는 넣은 files[i]와 짝이다(이름은 화면이 index로 붙여 보여 준다)

export const ANALYZE_TIMEOUT_MS = 30_000

// reject 값. 오류 번호만 싣는다(예외 내용·파일 조각을 옮기지 않는다)
export class AnalyzeError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode) {
    super(code)
    this.name = 'AnalyzeError'
    this.code = code
  }
}

const createAnalyzeWorker = () => new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' })

// 파일 하나의 바이트. 못 꺼내면 예외 대신 그 번호(예외 내용·파일 이름은 옮기지 않는다)
async function readBytes(file: File): Promise<ArrayBuffer | ReadFailure> {
  if (file.size > MAX_BYTES) return 'E-PARSE-TOO-BIG' // 통째로 메모리에 올리기 전에 거른다(Worker도 같은 상한으로 거른다)
  try {
    return await file.arrayBuffer()
  } catch {
    return 'E-PARSE-UNREADABLE' // 보안 프로그램이 잠갔거나 넣은 뒤 지워진 파일
  }
}

export async function runAnalysis(
  files: File[],
  opts: {
    onProgress?: (done: number, total: number) => void
    timeoutMs?: number
    createWorker?: () => Worker // 시험에서 가짜 Worker를 넣는다
    today?: string // 기본 todayInKorea()
    groups?: RxGroupDef[] // 처방코드 그룹 정의. 기본 없음
  } = {},
): Promise<AnalyzeOutput> {
  const today = opts.today ?? todayInKorea()
  // 파일 하나를 못 꺼내도 나머지는 계속 간다(그 자리는 번호로 — Worker가 실패 보고·incomplete로 처리)
  const slots = await Promise.all(files.map(readBytes))
  const buffers = slots.filter((slot): slot is ArrayBuffer => typeof slot !== 'string')
  let worker: Worker
  try {
    worker = (opts.createWorker ?? createAnalyzeWorker)()
  } catch {
    throw new AnalyzeError('E-ANALYZE-FAILED')
  }

  return new Promise<AnalyzeOutput>((resolve, reject) => {
    const timer = setTimeout(() => fail('E-ANALYZE-TIMEOUT'), opts.timeoutMs ?? ANALYZE_TIMEOUT_MS)
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
      reject(new AnalyzeError(code))
    }

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        opts.onProgress?.(message.done, message.total)
      } else if (message.type === 'done') {
        finish()
        resolve(message.output)
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
      // 그룹은 id·코드 목록만 골라 새로 만든다(화면이 그룹 줄을 통째로 넘겨도 이름 등은 Worker로 가지 않는다).
      // 깨진 정의도 여기서 잡혀 번호만 남는다
      const groups = (opts.groups ?? []).map(({ id, codes }) => ({ id, codes: [...codes] }))
      const request: WorkerRequest = { files: slots, today, groups }
      worker.postMessage(request, buffers) // 복사하지 않고 넘긴다(보낸 쪽 바이트는 비워진다)
    } catch {
      fail('E-ANALYZE-FAILED')
    }
  })
}
