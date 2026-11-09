'use client'

import { useCallback, useEffect, useState } from 'react'
import { useBridge } from '@/components/claim/useBridge'
import { isErrorCode } from '@/lib/errors'
import type { RxGroupDef } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import { createStatsWorker, requestLoad, requestSections, requestSplit } from '@/workers/statsClient'

// 통계 Worker 하나와 통로 (stats REQ-514, design.md TASK-14). 조각은 통로 포트로 Worker에만 가고(lib/bridge/workerSink.ts), 화면은 숫자만 받는다.
// 진료 줄은 Worker 메모리에 남아 기간을 바꿀 때마다 처방별 신환·재진을 다시 센다. 화면을 떠나면 Worker를 끝낸다

// 답 없이 멈춘 불러오기의 한도(AC-514.12). 조각은 화면을 거치지 않으니 stream을 부른 때부터 잰다. end 뒤는 statsClient의 120초다.
// 불러온 범위 전체를 읽는 SQL 문장 5개가 모두 한도(150초)까지 걸려도 12분 30초라, 정직하게 오래 걸리는 불러오기는 자르지 않는다
const STREAM_LIMIT_MS = 1_200_000

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
  const { state, helloError, retry, stream, close } = useBridge({ worker })

  useEffect(() => () => worker.terminate(), [worker])

  const load = useCallback(
    async ({
      range,
      today,
      closeToday,
      groups,
      keep,
    }: {
      range: DateRange
      today: string
      closeToday: boolean
      groups?: Promise<readonly RxGroupDef[]> // 처방별 추세 묶음 다시 읽기(treatment-trend AC-1205.7). 없으면 []
      keep?: boolean // false = 이 조각으로 Worker 메모리를 바꾸지 않는다(stats-load-range AC-3304.2). 도우미 요청에는 가지 않는다
    }) => {
      const { from, to } = range
      // 묶음은 비트 요청과 함께 읽고, 비트 요청(stats.rows)은 그것을 기다리지 않는다. 거절이면 묶음 없이 센다.
      // 거절을 지금 받아 두어 비트 요청이 먼저 실패해도 처리되지 않은 거절이 남지 않는다
      const defs = (groups ?? Promise.resolve([])).catch((): readonly RxGroupDef[] => [])
      // 시계는 이 요청이 끝날 때 멈춘다. 화면을 떠나면 useBridge가 연결을 닫아 요청이 끝나므로 시계가 남지 않는다
      const clock = setTimeout(close, STREAM_LIMIT_MS)
      const { id } = await stream('stats.rows', { from, to }).finally(() => clearTimeout(clock))
      return requestLoad(worker.current(), { streamId: id, from, to, today, closeToday, groups: await defs, keep })
    },
    [close, stream, worker],
  )

  const split = useCallback(async ({ from, to }: DateRange) => requestSplit(worker.current(), { from, to }), [worker])

  // 세 칸 보기(stats-bit-sections): 고른 기간과 견줄 기간(range.previous)의 from·to만 Worker로 간다. 답은 묶음 이름과 수뿐이다
  const sections = useCallback(
    async ({ from, to, previous }: DateRange & { previous?: DateRange | null }) =>
      requestSections(worker.current(), { from, to, previous: previous ?? null }),
    [worker],
  )

  return { state, helloError, retry, load, split, sections }
}
