'use client'

import { useCallback, useEffect, useState } from 'react'
import { useBridge } from '@/components/claim/useBridge'
import { isErrorCode } from '@/lib/errors'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import { createStatsWorker, requestLoad, requestSplit } from '@/workers/statsClient'

// 통계 Worker 하나와 통로 (stats REQ-514, design.md TASK-14). 조각은 통로 포트로 Worker에만 가고(lib/bridge/workerSink.ts), 화면은 숫자만 받는다.
// 진료 줄은 Worker 메모리에 남아 기간을 바꿀 때마다 처방별 신환·재진을 다시 센다. 화면을 떠나면 Worker를 끝낸다

// Worker는 통로가 붙는 순간(useBridge의 effect, 브라우저에서만) 만든다. effect로 Worker를 먼저 만들면 useBridge가 Worker 없이 붙었다가 다시 붙고,
// 확장이 옛 연결을 아직 잡고 있으면 다른 창(E-BRIDGE-BUSY)으로 보인다
function lazyStatsWorker() {
  let worker: Worker | null = null
  const current = () => (worker ??= createStatsWorker())
  return {
    current,
    postMessage(message: unknown, transfer: Transferable[]) {
      try {
        current().postMessage(message, transfer)
      } catch {
        // Worker를 못 만드는 브라우저. 저장된 숫자는 그대로 보이고, 불러오기만 오류 번호로 끝난다
      }
    },
    terminate() {
      worker?.terminate()
      worker = null
    },
  }
}

/** 통로·Worker가 준 오류 번호. 표에 없는 글자나 다른 예외의 내용은 옮기지 않는다 */
export function errorCodeOf(error: unknown): ErrorCode {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && isErrorCode(code) ? code : 'E-ANALYZE-FAILED'
}

export function useStatsWorker() {
  const [worker] = useState(lazyStatsWorker)
  const { state, helloError, retry, stream } = useBridge({ worker })

  useEffect(() => () => worker.terminate(), [worker])

  const load = useCallback(
    async ({ range, today, closeToday }: { range: DateRange; today: string; closeToday: boolean }) => {
      const { from, to } = range
      const { id } = await stream('stats.rows', { from, to })
      return requestLoad(worker.current(), { streamId: id, from, to, today, closeToday })
    },
    [stream, worker],
  )

  const split = useCallback(async ({ from, to }: DateRange) => requestSplit(worker.current(), { from, to }), [worker])

  return { state, helloError, retry, load, split }
}
