import { copyGroupDef } from '@/lib/analytics/groupDef'
import { isErrorCode } from '@/lib/errors'
import type { RxGroupDef } from '@/types/analysis'
import type { ErrorCode } from '@/types/errors'
import type { RxSplitView, StatsLoaded, StatsLoadRequest, StatsSplitRequest, StatsWorkerMessage } from '@/types/stats'
import { AnalyzeError } from './runAnalysis'

// 화면이 통계 Worker를 부르는 입구. Worker로는 기간·오늘·"오늘 진료 끝" 표시·통로 요청 id와 묶음 열쇠·코드만 간다(묶음 이름은 안 감).
// 조각은 통로 포트로 따로 가고(lib/bridge/workerSink.ts), 화면에는 숫자만 돌아온다.
// runAnalysis와 달리 일이 끝나도 Worker를 끝내지 않는다: 진료 줄이 Worker 메모리에 남고, Worker를 끝내는 것은 화면을 떠날 때다

export const STATS_TIMEOUT_MS = 120_000

export type WorkerLike = Pick<Worker, 'postMessage' | 'onmessage' | 'onerror' | 'onmessageerror'>

export function createStatsWorker(): Worker {
  return new Worker(new URL('./stats.worker.ts', import.meta.url), { type: 'module' })
}

type Call = { reply(message: StatsWorkerMessage): void; fail(code: ErrorCode): void }

// 한 Worker를 불러오기와 기간 바꿈이 같이 쓰는데 듣는 자리는 하나다. 도는 일을 번호로 나눠 둬서 겹쳐도 저마다 제 답을 받는다
const callsOf = new WeakMap<WorkerLike, Map<string, Call>>()

function ask<T>(
  worker: WorkerLike,
  request: StatsLoadRequest | StatsSplitRequest,
  answerOf: (message: StatsWorkerMessage) => T | undefined,
  timeoutMs: number = STATS_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const calls = callsOf.get(worker) ?? new Map<string, Call>()
    callsOf.set(worker, calls)

    const timer = setTimeout(() => fail('E-ANALYZE-TIMEOUT'), timeoutMs)
    const finish = () => {
      clearTimeout(timer)
      calls.delete(request.streamId)
      if (calls.size > 0) return
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
    }
    const fail = (code: ErrorCode) => {
      finish()
      reject(new AnalyzeError(code))
    }
    calls.set(request.streamId, {
      reply(message) {
        if (message.type === 'failed') {
          fail(isErrorCode(message.code) ? message.code : 'E-ANALYZE-FAILED') // 표에 없는 글자는 옮기지 않는다
          return
        }
        const answer = answerOf(message)
        if (answer === undefined) return
        finish()
        resolve(answer)
      },
      fail,
    })

    const failAll = () => {
      for (const call of [...calls.values()]) call.fail('E-ANALYZE-FAILED')
    }
    // 번호가 없는 답은 시간이 지나 포기한 앞 일의 늦은 답이다
    worker.onmessage = (event: MessageEvent<StatsWorkerMessage>) => calls.get(event.data.streamId)?.reply(event.data)
    // 스크립트를 못 불러왔거나 잡히지 않은 예외. 내용이 콘솔에 찍히지 않게 막는다
    worker.onerror = (event) => {
      event.preventDefault()
      failAll()
    }
    worker.onmessageerror = failAll

    try {
      worker.postMessage(request)
    } catch {
      fail('E-ANALYZE-FAILED')
    }
  })
}

// 칸을 골라 새로 만든다(화면이 다른 칸을 넘겨도 Worker로 가지 않는다). 묶음도 { id, codes }(제외할 처방이 있으면 exclude도, rx-group-exclude AC-2704.1)만
// 골라 새로 만들고, 주지 않으면 []를 싣는다: 메시지에는 늘 groups 배열이 있다(treatment-trend AC-1205.4·AC-1213.3)
export function requestLoad(
  worker: WorkerLike,
  req: { streamId: string; from: string; to: string; today: string; closeToday: boolean; groups?: readonly RxGroupDef[] },
  opts: { timeoutMs?: number } = {},
): Promise<StatsLoaded> {
  const { streamId, from, to, today, closeToday, groups = [] } = req
  const request: StatsLoadRequest = {
    type: 'load',
    streamId,
    from,
    to,
    today,
    closeToday,
    groups: groups.map(copyGroupDef),
  }
  return ask(worker, request, (message) => (message.type === 'loaded' ? message.view : undefined), opts.timeoutMs)
}

let lastSplit = 0

// 기간을 바꿀 때마다 부른다. 기간만 간다. 처방별 결과는 Worker 메모리의 진료 줄로 만들어 수와 이름만 돌아온다
export function requestSplit(worker: WorkerLike, req: { from: string; to: string }, opts: { timeoutMs?: number } = {}): Promise<RxSplitView> {
  const { from, to } = req
  lastSplit += 1
  const request: StatsSplitRequest = { type: 'split', streamId: `split-${lastSplit}`, from, to }
  return ask(worker, request, (message) => (message.type === 'split-result' ? message.view : undefined), opts.timeoutMs)
}
