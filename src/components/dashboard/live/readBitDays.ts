import { enterScreen, leaveScreen } from '@/components/claim/bitLane'
import { addDays } from '@/lib/analytics/dates'
import { copyGroupDef } from '@/lib/analytics/groupDef'
import { BridgeError } from '@/lib/bridge/protocol'
import { connectScreenBridge, type ScreenBridge } from '@/lib/bridge/workerSink'
import { isErrorCode } from '@/lib/errors'
import type { RxGroupDef } from '@/types/analysis'
import type { ChromeRuntimeLike } from '@/types/bridge'
import type { ErrorCode } from '@/types/errors'
import type { DayPayload } from '@/types/payload'
import { AnalyzeError } from '@/workers/runAnalysis'
import { requestLoad, type WorkerLike } from '@/workers/statsClient'

// 비트 읽기 한 번 (spec bit-dashboard design.md "### 읽기"). 환자 자료 구역 밖이다: 조각은 통로 포트로 Worker에 바로 가고,
// 여기에는 상태·기간·요청 id와 Worker가 만든 일 숫자만 온다. 읽는 동안만 통로를 쥔다(useBridge는 화면이 떠 있는 내내 쥔다)
// 비트 통로 차례(admin-view AC-8021.8, bitLane): 읽는 동안만 화면 차례에 든다. 저절로 올리기가 쥐고 있으면 끊기를 알리고 놓인 뒤에
// Worker·통로를 만든다(쥔 쪽이 없으면 지금과 같은 차례로 바로). 기다리는 시간도 읽기 전체 시간 안이고, 떠나면 그 자리에서 차례에서 빠진다

export const LOOKBACK_DAYS = 100
export const READ_TIMEOUT_MS = 180_000

export type StatsWorkerLike = WorkerLike & Pick<Worker, 'terminate'>
export type ReadResult = { kind: 'days'; days: DayPayload[] } | { kind: 'not-ready' } | { kind: 'failed'; code: ErrorCode }

const NOT_READY: ReadResult = { kind: 'not-ready' }
const READ_FAILED: ErrorCode = 'E-BIT-READ-FAILED'
const IN_USE: ErrorCode = 'E-BIT-IN-USE'

function failureCode(e: unknown): ErrorCode {
  const code = e instanceof BridgeError || e instanceof AnalyzeError ? e.code : READ_FAILED
  if (code === 'E-BRIDGE-BUSY') return IN_USE // 그 문구는 청구 화면 것이다
  if (code === 'E-ANALYZE-TIMEOUT') return READ_FAILED // 그 문구("계산이 30초")는 여기 맞지 않는다
  return isErrorCode(code) ? code : READ_FAILED
}

async function readThroughBridge(
  bridge: ScreenBridge,
  worker: StatsWorkerLike,
  today: string,
  groups: readonly RxGroupDef[],
  deadline: number,
): Promise<ReadResult> {
  const { state } = await bridge.hello()
  if (state === 'busy') return { kind: 'failed', code: IN_USE }
  if (state !== 'ready') return NOT_READY

  const check = await bridge.call('bit.check', {})
  if (!check.registered || !check.steps.every((step) => step.ok)) return NOT_READY

  const range = { from: addDays(today, -LOOKBACK_DAYS), to: today }
  const { id } = await bridge.stream('stats.rows', range)
  const { days } = await requestLoad(worker, { streamId: id, ...range, today, closeToday: false, groups }, { timeoutMs: deadline - Date.now() })
  return days === null ? { kind: 'failed', code: 'E-BIT-DATA-UNSURE' } : { kind: 'days', days }
}

export async function readBitDays(deps: {
  runtime: ChromeRuntimeLike | undefined
  createWorker: () => StatsWorkerLike
  today: string
  timeoutMs?: number
  signal?: AbortSignal
  /** 통계 탭 묶음 정의(AC-606.7, groupDefs 결과). 주지 않으면 []. 열쇠·코드와 빼는 처방·조건(있을 때만, group-exclude AC-3705.5)을
   * copyGroupDef로 시작할 때 떠 두어 읽는 동안 바뀌어도 그대로 싣는다 */
  groups?: readonly RxGroupDef[]
}): Promise<ReadResult> {
  const { runtime, createWorker, today, timeoutMs = READ_TIMEOUT_MS, signal } = deps
  if (!runtime || signal?.aborted) return NOT_READY
  const groups = (deps.groups ?? []).map(copyGroupDef)

  let worker: StatsWorkerLike | undefined
  let bridge: ScreenBridge | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  let closed = false
  let entered = false
  let freed = () => {}
  const free = new Promise<void>((resolve) => {
    freed = () => resolve()
  })
  const onFree = () => freed()
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
    bridge?.close()
    worker?.terminate()
    if (entered) leaveScreen(onFree)
  }
  const start = (deadline: number): Promise<ReadResult> => {
    worker = createWorker()
    bridge = connectScreenBridge({ runtime, worker })
    return readThroughBridge(bridge, worker, today, groups, deadline)
  }
  try {
    const deadline = Date.now() + timeoutMs
    entered = true
    // 통로 차례가 비어 있으면 바로(지금 차례), 저절로 올리기가 쥐고 있으면 놓인 뒤에 Worker·통로를 만든다. 그 전에 끝났으면 만들지 않는다
    const reading = enterScreen(onFree) ? start(deadline) : free.then(() => (closed ? NOT_READY : start(deadline)))
    // hello·bit.check·stream에는 시간 제한이 없어 읽기 전체를 여기서 잰다. 다 되면 finally가 통로를 닫아 남은 단계도 끝난다
    const expired = new Promise<ReadResult>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'failed', code: READ_FAILED }), timeoutMs)
    })
    // 화면을 떠나면 그 자리에서 닫는다. 통로는 한 번에 한 화면만 쓰고, 다음 화면이 같은 순간에 통로를 열기 때문이다.
    // 먼저 답을 정해 두어야 닫으며 생긴 오류가 이 답을 이기지 않는다
    const left = new Promise<ReadResult>((resolve) => {
      onAbort = () => {
        resolve(NOT_READY)
        close()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
    return await Promise.race([reading, expired, left])
  } catch (e) {
    return { kind: 'failed', code: failureCode(e) }
  } finally {
    close()
  }
}
