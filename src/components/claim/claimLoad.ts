import { BridgeError } from '@/lib/bridge/protocol'
import type { ChromeRuntimeLike, PatientCommand, ArgsOf, StreamResult } from '@/types/bridge'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import type { CheckSettings, ClaimView, PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import { monthsIn, readRange } from './dateList'

// 화면이 Worker에 시키는 차례(AC-013.2·AC-013.10·AC-013.11·AC-013.12). 약속 전문은 types/precheck.ts PrecheckFromScreen 주석이고 design.md 6-2다.
// 번호(load·check)와 Worker는 여기 하나에 둔다. 컴포넌트 state에 두면 화면을 다시 그릴 때 번호가 되풀이되고, Worker는 같은지만 보므로 옛 답이 통과한다.
// 답은 번호로만 견준다. id나 partial로 판단하지 않는다. 비트 메모 다시 불러오기(run, AC-016.7)는 TASK-18이 여기에 번호 하나를 더한다.
// 환자 글자는 여기서 다루지 않는다: 지나가는 것은 id·번호·오류 번호와 점검 답(ClaimView)을 그대로 넘기는 것, 화면이 맡긴 결과(keep)를 쥐고 있는 것뿐이다

/** 이 화면이 Worker에 쓰는 것. postMessage의 둘째 인자는 통로 포트를 넘길 때 쓴다(useBridge) */
export type ClaimWorker = {
  postMessage(message: unknown, transfer: Transferable[]): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void
}

type CheckAnswer = Extract<PrecheckToScreen, { type: 'check' }>
type ExcelAnswer = Extract<PrecheckToScreen, { type: 'excel' }>
type Answer = Extract<PrecheckToScreen, { type: 'month' | 'loadPart' | 'check' | 'excel' }>
type Asked = Extract<PrecheckFromScreen, { type: 'month' | 'check' | 'excel' } | { type: 'loadPart' }>

/** 어느 물음의 답인지: 번호로 찾는다. run이 있는 loadPart(다시 불러오기, TASK-18)는 이 표에 없다 */
const askedKey = (m: Asked) => (m.type === 'loadPart' ? `${m.part}:${m.load}` : m.type === 'month' ? `month:${m.load}` : `${m.type}:${m.check}`)
function answerKey(m: PrecheckToScreen): string | null {
  if (m.type === 'month') return `month:${m.load}`
  if (m.type === 'loadPart') return m.run === undefined ? `${m.part}:${m.load}` : null
  if (m.type === 'check' || m.type === 'excel') return `${m.type}:${m.check}`
  return null
}

/** 이 결과가 누구 것인가: 로그인한 사람(계정당 병원 하나)과 도우미에 등록한 기관기호. 돌아올 때 지금과 견준다(AC-013.6) */
export type ClaimOwner = { user: string; institution: string }
/** 점검 결과. owner를 모르면(null) 떠날 때 남기지 않는다 */
export type CheckedClaim = { load: number; check: number; visible: DateRange; view: ClaimView; at: Date; used: CheckSettings | null; usedCopy: boolean; owner: ClaimOwner | null }
/** 다른 탭에 다녀올 동안 남기는 것: 결과·기간·단계·설정 변경 띠. 환자 글자가 있으므로 이 메모리에만 둔다(저장소·주소 금지). 전체 페이지 이동(로그아웃)이면 Worker와 함께 사라진다 */
export type KeptClaim = { result: CheckedClaim; period: DateRange; page: 'dates' | 'result'; stale: boolean }

export type ClaimChannel = {
  worker: ClaimWorker
  /** 새 불러오기: 새 번호로 loadStart를 보내고 그 번호를 돌려준다. Worker는 전에 불러온 달을 버린다 */
  startLoad(): number
  lastLoad(): number | null
  /** 새 점검 번호(1씩) */
  nextCheck(): number
  lastCheck(): number | null
  /** 물음을 보내고 그 번호의 답을 기다린다 */
  ask<A extends Answer>(message: Asked): Promise<A>
  /** Worker의 달을 버리고 진행 중인 불러오기를 버린다([멈추기]·결과 없이 화면을 떠날 때). 맡긴 결과도 없어진다 */
  drop(): void
  /** 맡긴 결과. 새 loadStart는 Worker의 달을 비우므로 함께 지운다 */
  kept(): KeptClaim | null
  keep(next: KeptClaim | null): void
}

const channels = new WeakMap<object, ClaimChannel>()

/** 그 Worker의 번호 칸(Worker 하나에 하나, AC-013.12) */
export function claimChannel(worker: ClaimWorker): ClaimChannel {
  const known = channels.get(worker)
  if (known) return known
  let load = 0
  let check = 0
  let latestLoad: number | null = null
  let latestCheck: number | null = null
  let keptClaim: KeptClaim | null = null
  /** Worker가 시작하지 못했거나 죽었다. 이 뒤의 물음에는 답이 오지 않는다 */
  let dead = false
  const waiting = new Map<string, (answer: Answer) => void>()
  const FAILED = { ok: false, code: 'E-CLAIM-PARTIAL' } as Answer

  worker.addEventListener('message', (event) => {
    const data = (event as MessageEvent<PrecheckToScreen>).data
    const key = answerKey(data)
    const resolve = key === null ? undefined : waiting.get(key)
    if (!key || !resolve) return
    waiting.delete(key)
    resolve(data as Answer)
  })
  // Worker가 죽으면 답이 오지 않는다. 기다리는 쪽이 멈추지 않게 모두 실패로 끝낸다
  const failAll = () => {
    for (const [key, resolve] of [...waiting]) {
      waiting.delete(key)
      resolve(FAILED)
    }
  }
  worker.addEventListener('error', () => {
    dead = true
    failAll()
  })
  worker.addEventListener('messageerror', failAll) // 답 하나를 읽지 못한 것뿐이다. Worker는 살아 있다

  const channel: ClaimChannel = {
    worker,
    startLoad() {
      load += 1
      latestLoad = load
      keptClaim = null
      worker.postMessage({ type: 'loadStart', load } satisfies PrecheckFromScreen, [])
      return load
    },
    lastLoad: () => latestLoad,
    nextCheck() {
      check += 1
      latestCheck = check
      return check
    },
    lastCheck: () => latestCheck,
    ask<A extends Answer>(message: Asked) {
      return new Promise<A>((resolve) => {
        if (dead) return resolve(FAILED as A) // error는 기다리는 답이 없을 때도 온다. 그냥 보내면 영영 답이 없다
        waiting.set(askedKey(message), resolve as (answer: Answer) => void)
        worker.postMessage(message, [])
      })
    },
    drop() {
      channel.startLoad()
    },
    kept: () => keptClaim,
    keep(next) {
      keptClaim = next
    },
  }
  channels.set(worker, channel)
  return channel
}

// ── Worker 하나(그 탭에 하나) ──────────

let sharedWorker: ClaimWorker | null = null

/**
 * 청구 화면의 Worker(그 탭에 하나). 화면을 다시 그려도 그대로라 번호가 되풀이되지 않는다(AC-013.12).
 * 확장이 있는 PC 크롬에서만 만든다: 크롬은 우리 확장이 있을 때만 웹 페이지에 chrome.runtime을 준다. 휴대폰·확장 없는 곳·서버에서는 null이다(AC-013.8)
 */
export function openClaimChannel(): ClaimChannel | null {
  const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime
  if (!runtime || typeof Worker === 'undefined') return null
  if (!sharedWorker) {
    try {
      sharedWorker = new Worker(new URL('../../workers/precheck.worker.ts', import.meta.url), { type: 'module' }) as ClaimWorker
    } catch {
      return null
    }
  }
  return claimChannel(sharedWorker)
}

// ── 차례 ──────────

const codeOf = (error: unknown) => (error instanceof BridgeError ? error.code : 'E-BRIDGE-REJECTED')

export type ClaimStream = <C extends PatientCommand>(cmd: C, args: ArgsOf<C>) => Promise<StreamResult>
/** 진행 표시: 달(이력 포함) → 비트 메모 → 저장한 작업 */
export type LoadStep = 'month' | 'memos' | 'store'
/** stuckMonth: 달 파일이 다른 병원 파일이다(AC-018.17). 다시 등록해도 풀리지 않아 비트 PC 연결로 보내지 않는다 */
export type LoadResult = { status: 'ok'; load: number } | { status: 'failed'; code: string; stuckMonth?: true } | { status: 'replaced' }

/** 그 자료 없이 계속해도 되는 거절 번호. 그 밖의 번호는 멈춘다(AC-013.11) */
const NO_HELPER_YET: readonly string[] = ['E-HELPER-UNKNOWN-COMMAND'] // Phase 3 전(AC-013.2)
const NO_COPY: readonly string[] = [...NO_HELPER_YET, 'E-BIT-HOSPITAL-MISMATCH'] // 다른 병원의 settings.dat는 사본 없음이다(AC-013.9)

/**
 * [자료 불러오기](AC-013.2·AC-013.10·AC-013.11). loadStart 바로 뒤 stream('claim.month')은 같은 차례에 부른다.
 * 앞쪽까지 읽는 것은 claim.month뿐이고 claim.memos·store.load는 고른 기간만이다(AC-013.13).
 * store.load는 달과 설정 사본을 따로 부른다(AC-013.9): 도우미는 파일 하나만 막혀도 호출 전체를 같은 번호로 거절해 어느 파일인지 알 수 없다.
 * 끝난 stream은 번호가 옛 번호여도 물어 Worker가 모아 둔 글자를 찾아 가게 한다. 답을 보기 전에 번호부터 본다: 옛 불러오기면 어떤 답이든 버린다
 */
export async function runClaimLoad(channel: ClaimChannel, stream: ClaimStream, visible: DateRange, onStep: (step: LoadStep) => void = () => {}): Promise<LoadResult> {
  const load = channel.startLoad()
  const replaced = () => channel.lastLoad() !== load
  const REPLACED: LoadResult = { status: 'replaced' }

  onStep('month')
  let monthId: string
  try {
    ;({ id: monthId } = await stream('claim.month', readRange(visible)))
  } catch (error) {
    return replaced() ? REPLACED : { status: 'failed', code: codeOf(error) }
  }
  const month = await channel.ask<Extract<Answer, { type: 'month' }>>({ type: 'month', id: monthId, load })
  if (replaced()) return REPLACED
  if (!month.ok) return { status: 'failed', code: month.code }

  const parts: { part: 'memos' | 'store'; step?: LoadStep; run(): Promise<StreamResult>; goOn: readonly string[] }[] = [
    { part: 'memos', step: 'memos', run: () => stream('claim.memos', visible), goOn: NO_HELPER_YET },
    { part: 'store', step: 'store', run: () => stream('store.load', { months: monthsIn(visible) }), goOn: NO_HELPER_YET },
    { part: 'store', run: () => stream('store.load', { settings: true }), goOn: NO_COPY },
  ]
  for (const { part, step, run, goOn } of parts) {
    if (step) onStep(step)
    let id: string
    try {
      ;({ id } = await run())
    } catch (error) {
      if (replaced()) return REPLACED
      const code = codeOf(error)
      if (goOn.includes(code)) continue // 그 자료 없이 계속한다
      return step === 'store' && code === 'E-BIT-HOSPITAL-MISMATCH' ? { status: 'failed', code, stuckMonth: true } : { status: 'failed', code }
    }
    const answer = await channel.ask<Extract<Answer, { type: 'loadPart' }>>({ type: 'loadPart', part, id, load })
    if (replaced()) return REPLACED
    if (!answer.ok) return { status: 'failed', code: answer.code }
  }
  return { status: 'ok', load }
}

export type CheckResult = { status: 'ok'; check: number; view: ClaimView; usedCopy: CheckSettings | null } | { status: 'failed'; code: ErrorCode } | { status: 'replaced' }

/** 점검(AC-013.14). settings는 서버 설정, 읽지 못했으면 null(AC-013.9). 그 불러오기가 마지막이고 이 점검이 마지막일 때만 답을 쓴다 */
export async function runClaimCheck(channel: ClaimChannel, load: number, visible: DateRange, settings: CheckSettings | null): Promise<CheckResult> {
  if (channel.lastLoad() !== load) return { status: 'replaced' }
  const check = channel.nextCheck()
  const answer = await channel.ask<CheckAnswer>({ type: 'check', check, load, visible, settings })
  if (channel.lastLoad() !== load || channel.lastCheck() !== check) return { status: 'replaced' }
  return answer.ok ? { status: 'ok', check, view: answer.view, usedCopy: answer.usedCopy } : { status: 'failed', code: answer.code }
}

/** 엑셀(AC-013.4): 그 점검 결과의 바이트를 Worker가 만든다 */
export const runClaimExcel = (channel: ClaimChannel, check: number): Promise<ExcelAnswer> => channel.ask<ExcelAnswer>({ type: 'excel', check })
