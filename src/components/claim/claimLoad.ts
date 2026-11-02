import { BridgeError } from '@/lib/bridge/protocol'
import type { ChromeRuntimeLike, PatientCommand, ArgsOf, StreamResult } from '@/types/bridge'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import type { CheckSettings, ClaimView, InputResultView, InputSelection, InputWhat, PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import { monthsIn, readRange } from './dateList'

// 화면이 Worker에 시키는 차례(AC-013.2·AC-013.10·AC-013.11·AC-013.12). 약속 전문은 types/precheck.ts PrecheckFromScreen 주석이고 design.md 6-2다.
// 번호(load·check)와 Worker는 여기 하나에 둔다. 컴포넌트 state에 두면 화면을 다시 그릴 때 번호가 되풀이되고, Worker는 같은지만 보므로 옛 답이 통과한다.
// 답은 번호로만 견준다. id나 partial로 판단하지 않는다. 비트 메모 다시 불러오기(run, AC-016.7)는 load와 같은 곳에서 번호를 받는다.
// 환자 글자는 여기서 다루지 않는다: 지나가는 것은 id·번호·오류 번호와 점검·메모 칸 답을 그대로 넘기는 것, 화면이 맡긴 결과(keep)를 쥐고 있는 것뿐이다. 입력 묶음 글자는 Worker가 만들어 통로 포트로 보낸다(AC-004.11)

/** 이 화면이 Worker에 쓰는 것. postMessage의 둘째 인자는 통로 포트를 넘길 때 쓴다(useBridge) */
export type ClaimWorker = {
  postMessage(message: unknown, transfer: Transferable[]): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void
}

type CheckAnswer = Extract<PrecheckToScreen, { type: 'check' }>
type ExcelAnswer = Extract<PrecheckToScreen, { type: 'excel' }>
type Answer = Extract<PrecheckToScreen, { type: 'month' | 'loadPart' | 'check' | 'excel' | 'memoView' | 'inputStart' | 'inputDone' | 'inputExcel' }>
type Asked = Extract<PrecheckFromScreen, { type: 'month' | 'check' | 'excel' | 'memoView' | 'inputExcel' } | { type: 'loadPart' }>
export type MemoSaveAnswer = Extract<PrecheckToScreen, { type: 'memoSave' }>
export type MemoViewAnswer = Extract<PrecheckToScreen, { type: 'memoView' }>

/** 어느 물음의 답인지: 번호로 찾는다. 같은 load로 다시 불러오기(run)를 묻는 답은 run까지 본다 */
function askedKey(m: Asked): string {
  if (m.type === 'loadPart') return 'run' in m ? `${m.part}:${m.load}:${m.run}` : `${m.part}:${m.load}`
  if (m.type === 'month') return `month:${m.load}`
  if (m.type === 'memoView' || m.type === 'inputExcel') return `${m.type}:${m.ask}`
  return `${m.type}:${m.check}`
}
function answerKey(m: PrecheckToScreen): string | null {
  if (m.type === 'month') return `month:${m.load}`
  if (m.type === 'loadPart') return m.run === undefined ? `${m.part}:${m.load}` : `${m.part}:${m.load}:${m.run}`
  if (m.type === 'check' || m.type === 'excel') return `${m.type}:${m.check}`
  if (m.type === 'memoView' || m.type === 'inputExcel') return `${m.type}:${m.ask}`
  if (m.type === 'inputStart' || m.type === 'inputDone') return `${m.type}:${m.run}`
  return null
}

/** 이 결과가 누구 것인가: 로그인한 사람(계정당 병원 하나)과 도우미에 등록한 기관기호. 돌아올 때 지금과 견준다(AC-013.6) */
export type ClaimOwner = { user: string; institution: string }
/** 점검 결과. owner를 모르면(null) 떠날 때 남기지 않는다 */
export type CheckedClaim = { load: number; check: number; visible: DateRange; view: ClaimView; at: Date; used: CheckSettings | null; usedCopy: boolean; owner: ClaimOwner | null }
/** 다른 탭에 다녀올 동안 남기는 것: 결과·기간·단계·설정 변경 띠·달 칸 저장 막힘. 환자 글자가 있으므로 이 메모리에만 둔다(저장소·주소 금지). 전체 페이지 이동(로그아웃)이면 Worker와 함께 사라진다 */
export type KeptClaim = { result: CheckedClaim; period: DateRange; page: ClaimPage; stale: boolean; storeStuck?: boolean }
export type ClaimPage = 'dates' | 'result' | 'memo'
/** 비트 메모 읽기 상태(AC-018.24): 다녀와도 '한 번 받음'이 남는다. asked는 읽으려 한 적이 있는가(AC-018.27) */
export type BitReadState = { status: 'never' | 'ok' | 'failed'; at: string | null; code: string | null; received: boolean; asked: boolean }
/** 메모 칸이 다녀올 동안 남기는 것. 고친 글·승인·입력 기록은 Worker 메모리에 그대로 있어 여기 두지 않는다 */
export type KeptMemo = { bit: BitReadState | null; result: InputResultView | null }

export type ClaimChannel = {
  worker: ClaimWorker
  /** 새 불러오기: 새 번호로 loadStart를 보내고 그 번호를 돌려준다. Worker는 전에 불러온 달을 버린다. keepEdits는 아직 저장하지 못한 고친 메모를 남긴다(AC-018.2·AC-018.17) */
  startLoad(options?: { keepEdits?: boolean }): number
  lastLoad(): number | null
  /** 새 점검 번호(1씩) */
  nextCheck(): number
  lastCheck(): number | null
  /** 비트 메모 다시 불러오기 번호(load와 같은 곳, AC-018.24). 화면을 다시 그려도 되풀이되지 않는다 */
  nextRun(): number
  lastRun(): number | null
  /** 메모 칸 물음 번호(memoView·입력 묶음·입력 엑셀) */
  nextAsk(): number
  /** 물음을 보내고 그 번호의 답을 기다린다 */
  ask<A extends Answer>(message: Asked): Promise<A>
  /** 입력 묶음을 시킨다. 시작 답과 끝 답을 함께 기다린다 */
  startInput(run: number, what: InputWhat, selection: InputSelection): { started: Promise<Extract<PrecheckToScreen, { type: 'inputStart' }>>; finished: Promise<Extract<PrecheckToScreen, { type: 'inputDone' }>> }
  /** 답이 없는 메시지(editMemo·memoApprove·memoSaveRetry) */
  tell(message: Extract<PrecheckFromScreen, { type: 'editMemo' | 'memoApprove' | 'memoSaveRetry' }>): void
  /** 저장 결과(memoSave)를 듣는다 */
  onSave(fn: (answer: MemoSaveAnswer) => void): () => void
  /** 입력 중인가. 입력하는 동안 떠나면 결과가 오지 않으므로 맡긴 결과를 버린다(AC-013.6) */
  inputBusy(): boolean
  setInputBusy(busy: boolean): void
  /** Worker의 달을 버리고 진행 중인 불러오기를 버린다([멈추기]·결과 없이 화면을 떠날 때). 맡긴 결과도 없어진다. keepEdits는 [멈추기]처럼 같은 사람·의원이 계속할 때 저장하지 못한 고친 메모를 남긴다 */
  drop(options?: { keepEdits?: boolean }): void
  /** 맡긴 결과. 새 loadStart는 Worker의 달을 비우므로 함께 지운다 */
  kept(): KeptClaim | null
  keep(next: KeptClaim | null): void
  keptMemo(): KeptMemo | null
  keepMemo(next: KeptMemo | null): void
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
  let keptMemoState: KeptMemo | null = null
  let run = 0
  let latestRun: number | null = null
  let askNumber = 0
  let busy = false
  const saveListeners = new Set<(answer: MemoSaveAnswer) => void>()
  /** Worker가 시작하지 못했거나 죽었다. 이 뒤의 물음에는 답이 오지 않는다 */
  let dead = false
  const waiting = new Map<string, (answer: Answer) => void>()
  const FAILED = { ok: false, code: 'E-CLAIM-PARTIAL' } as Answer

  worker.addEventListener('message', (event) => {
    const data = (event as MessageEvent<PrecheckToScreen>).data
    if (data.type === 'memoSave') {
      for (const fn of [...saveListeners]) fn(data)
      return
    }
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
    startLoad(options) {
      load += 1
      latestLoad = load
      keptClaim = null
      keptMemoState = null
      busy = false
      worker.postMessage({ type: 'loadStart', load, ...(options?.keepEdits ? { keepEdits: true as const } : {}) } satisfies PrecheckFromScreen, [])
      return load
    },
    lastLoad: () => latestLoad,
    nextCheck() {
      check += 1
      latestCheck = check
      return check
    },
    lastCheck: () => latestCheck,
    nextRun() {
      run += 1
      latestRun = run
      return run
    },
    lastRun: () => latestRun,
    nextAsk() {
      askNumber += 1
      return askNumber
    },
    startInput(number, what, selection) {
      const wait = <A extends Answer>(key: string) =>
        new Promise<A>((resolve) => {
          if (dead) return resolve(FAILED as A)
          waiting.set(key, resolve as (answer: Answer) => void)
        })
      const started = wait<Extract<PrecheckToScreen, { type: 'inputStart' }>>(`inputStart:${number}`)
      const finished = wait<Extract<PrecheckToScreen, { type: 'inputDone' }>>(`inputDone:${number}`)
      if (!dead) worker.postMessage({ type: 'buildInputBatch', run: number, what, selection } satisfies PrecheckFromScreen, [])
      return { started, finished }
    },
    tell(message) {
      if (!dead) worker.postMessage(message, [])
    },
    onSave(fn) {
      saveListeners.add(fn)
      return () => void saveListeners.delete(fn)
    },
    inputBusy: () => busy,
    setInputBusy(next) {
      busy = next
    },
    ask<A extends Answer>(message: Asked) {
      return new Promise<A>((resolve) => {
        if (dead) return resolve(FAILED as A) // error는 기다리는 답이 없을 때도 온다. 그냥 보내면 영영 답이 없다
        waiting.set(askedKey(message), resolve as (answer: Answer) => void)
        worker.postMessage(message, [])
      })
    },
    drop(options) {
      channel.startLoad(options)
    },
    kept: () => keptClaim,
    keep(next) {
      keptClaim = next
    },
    keptMemo: () => keptMemoState,
    keepMemo(next) {
      keptMemoState = next
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
/** stuckMonth: 달 파일이 다른 병원 파일이다(AC-018.17). 멈추지 않고 저장한 작업 없이 점검을 계속하고 화면이 안내를 보인다 */
export type LoadResult = { status: 'ok'; load: number; stuckMonth?: true } | { status: 'failed'; code: string } | { status: 'replaced' }

/** 그 자료 없이 계속해도 되는 거절 번호. 그 밖의 번호는 멈춘다(AC-013.11) */
const NO_HELPER_YET: readonly string[] = ['E-HELPER-UNKNOWN-COMMAND'] // Phase 3 전(AC-013.2)
const NO_COPY: readonly string[] = [...NO_HELPER_YET, 'E-BIT-HOSPITAL-MISMATCH'] // 다른 병원의 settings.dat는 사본 없음이다(AC-013.9)

/**
 * [자료 불러오기](AC-013.2·AC-013.10·AC-013.11). loadStart 바로 뒤 stream('claim.month')은 같은 차례에 부른다.
 * 앞쪽까지 읽는 것은 claim.month뿐이고 claim.memos·store.load는 고른 기간만이다(AC-013.13).
 * store.load는 달과 설정 사본을 따로 부른다(AC-013.9): 도우미는 파일 하나만 막혀도 호출 전체를 같은 번호로 거절해 어느 파일인지 알 수 없다.
 * 끝난 stream은 번호가 옛 번호여도 물어 Worker가 모아 둔 글자를 찾아 가게 한다. 답을 보기 전에 번호부터 본다: 옛 불러오기면 어떤 답이든 버린다
 */
export async function runClaimLoad(channel: ClaimChannel, stream: ClaimStream, visible: DateRange, onStep: (step: LoadStep) => void = () => {}, options?: { keepEdits?: boolean }): Promise<LoadResult> {
  const load = channel.startLoad(options)
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
  let stuckMonth = false
  for (const { part, step, run, goOn } of parts) {
    if (step) onStep(step)
    let id: string
    try {
      ;({ id } = await run())
    } catch (error) {
      if (replaced()) return REPLACED
      const code = codeOf(error)
      if (goOn.includes(code)) continue // 그 자료 없이 계속한다
      // 달 파일이 다른 병원 파일이면 멈추지 않는다(AC-018.17): 저장한 작업 없이 점검을 계속해 메모 표와 안내를 함께 보이고, Worker는 달 칸 store.save를 보내지 않는다
      if (step === 'store' && code === 'E-BIT-HOSPITAL-MISMATCH') {
        stuckMonth = true
        channel.worker.postMessage({ type: 'storeBlock' } satisfies PrecheckFromScreen, [])
        continue
      }
      return { status: 'failed', code }
    }
    const answer = await channel.ask<Extract<Answer, { type: 'loadPart' }>>({ type: 'loadPart', part, id, load })
    if (replaced()) return REPLACED
    if (!answer.ok) return { status: 'failed', code: answer.code }
  }
  return stuckMonth ? { status: 'ok', load, stuckMonth: true } : { status: 'ok', load }
}

export type MemoReloadResult = { status: 'ok' } | { status: 'failed'; code: string } | { status: 'replaced' }

/**
 * [비트 메모 전체 불러오기](AC-018.24·AC-016.7): claim.memos만 고른 기간으로 다시 읽는다. loadStart·month를 쓰지 않아 달과 점검 결과는 그대로다.
 * 끝난 stream은 그새 새 번호가 나왔어도 물어 Worker가 모아 둔 글자를 찾아 가게 한다. load나 run이 마지막 번호와 다른 답은 버린다
 */
export async function runMemoReload(channel: ClaimChannel, stream: ClaimStream, load: number, visible: DateRange): Promise<MemoReloadResult> {
  const run = channel.nextRun()
  const replaced = () => channel.lastRun() !== run || channel.lastLoad() !== load && channel.lastLoad() !== null
  channel.worker.postMessage({ type: 'memoReloadStart', run } satisfies PrecheckFromScreen, [])
  let id: string
  try {
    ;({ id } = await stream('claim.memos', visible))
  } catch (error) {
    return replaced() ? { status: 'replaced' } : { status: 'failed', code: codeOf(error) }
  }
  const answer = await channel.ask<Extract<Answer, { type: 'loadPart' }>>({ type: 'loadPart', part: 'memos', id, load, run })
  if (replaced()) return { status: 'replaced' }
  return answer.ok ? { status: 'ok' } : { status: 'failed', code: answer.code }
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

/** [엑셀로 저장](AC-018.15): 누를 때만 Worker가 만든다 */
export const runInputExcel = (channel: ClaimChannel) => channel.ask<Extract<Answer, { type: 'inputExcel' }>>({ type: 'inputExcel', ask: channel.nextAsk() })
