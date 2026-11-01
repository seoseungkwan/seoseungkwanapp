import { isErrorCode } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'
import type { StatsLoaded, StatsLoadRequest, StatsWorkerMessage } from '@/types/stats'
import { AnalyzeError } from './runAnalysis'

// 화면이 통계 Worker를 부르는 입구. Worker로는 기간·오늘·"오늘 진료 끝" 표시·통로 요청 id만 간다.
// 조각은 통로 포트로 따로 가고(lib/bridge/workerSink.ts), 화면에는 숫자만 돌아온다.
// runAnalysis와 달리 일이 끝나도 Worker를 끝내지 않는다: 진료 줄이 Worker 메모리에 남고, Worker를 끝내는 것은 화면을 떠날 때다

export const STATS_TIMEOUT_MS = 120_000

export type WorkerLike = Pick<Worker, 'postMessage' | 'onmessage' | 'onerror' | 'onmessageerror'>

export function createStatsWorker(): Worker {
  return new Worker(new URL('./stats.worker.ts', import.meta.url), { type: 'module' })
}

export function requestLoad(
  worker: WorkerLike,
  req: { streamId: string; from: string; to: string; today: string; closeToday: boolean },
  opts: { timeoutMs?: number } = {},
): Promise<StatsLoaded> {
  return new Promise<StatsLoaded>((resolve, reject) => {
    const timer = setTimeout(() => fail('E-ANALYZE-TIMEOUT'), opts.timeoutMs ?? STATS_TIMEOUT_MS)
    const finish = () => {
      clearTimeout(timer)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
    }
    const fail = (code: ErrorCode) => {
      finish()
      reject(new AnalyzeError(code))
    }

    worker.onmessage = (event: MessageEvent<StatsWorkerMessage>) => {
      const message = event.data
      if (message.streamId !== req.streamId) return // 시간이 지나 포기한 앞 일의 늦은 답
      if (message.type === 'loaded') {
        finish()
        resolve(message.view)
      } else if (message.type === 'failed') {
        fail(isErrorCode(message.code) ? message.code : 'E-ANALYZE-FAILED') // 표에 없는 글자는 옮기지 않는다
      }
    }
    // 스크립트를 못 불러왔거나 잡히지 않은 예외. 내용이 콘솔에 찍히지 않게 막는다
    worker.onerror = (event) => {
      event.preventDefault()
      fail('E-ANALYZE-FAILED')
    }
    worker.onmessageerror = () => fail('E-ANALYZE-FAILED')

    try {
      // 칸을 골라 새로 만든다(화면이 다른 칸을 넘겨도 Worker로 가지 않는다)
      const { streamId, from, to, today, closeToday } = req
      const request: StatsLoadRequest = { type: 'load', streamId, from, to, today, closeToday }
      worker.postMessage(request)
    } catch {
      fail('E-ANALYZE-FAILED')
    }
  })
}
