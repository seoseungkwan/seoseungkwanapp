import type { BitLane } from '@/components/claim/bitLane'
import { partSave } from '@/components/stats/loadPlan'
import { groupDefs } from '@/components/stats/treatmentView'
import type { SaveInput } from '@/components/stats/useStatsData'
import { compareYmd } from '@/lib/analytics/dates'
import { marksOfResult, progressOf, revenueSaved, uploadPlan, type UploadProgress, type UploadTask } from '@/lib/autoUpload/plan'
import { fillRange } from '@/lib/autoUpload/range'
import type { ScreenBridge } from '@/lib/bridge/workerSink'
import { isErrorCode } from '@/lib/errors'
import type { MyUploadPlan, SavedSalesMark, StatsMarks, UploadReport } from '@/lib/storage/autoUpload'
import type { RxGroupDef } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import type { RevenueDaysResult } from '@/types/revenue'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { StatsSunapGroups } from '@/types/stats'
import type { SunapSettings } from '@/types/sunap'
import { requestLoad, type WorkerLike } from '@/workers/statsClient'

// 저절로 올리기 — 돌리기 한 번(spec admin-view REQ-8021 AC-8021.2~8021.7·AC-8021.11·AC-8024.7, design.md '저절로 올리기 — 돌리기').
// 훅이 아니다(본보기 components/dashboard/live/readBitDays.ts). 저장소(원장 길·데스크 길 UploadAccess)·통로·Worker·시계·통로 차례·잠금·화면 숨김을
// 인자로 받는다. 환자 자료 구역 밖이다: 비트 조각은 통로 포트로 Worker에 바로 가고, 여기에는 기간·요청 id·Worker가 만든 집계 줄만 온다
// (저장은 통계 탭과 같은 partSave → saveStats, revenue.days → saveRange). 서버로 가는 것은 집계 줄·진행 날짜·오류 번호·비트 표시(해시)뿐이다.
// 확인 창·알림·console은 없고, 어디서 실패해도 던지지 않는다

/** 같은 브라우저 다른 탭과 한 곳만 돌게 하는 잠금 이름 */
export const LOCK_NAME = 'ssk-auto-upload'
/** 첫 도우미 요청에서 이만큼 지나면 새 일을 시작하지 않는다 */
export const RUN_MS = 5 * 60_000
/**
 * 한 번 돈 끝. 'lane-busy' = 비트 화면이 통로를 쓰는 중이라 잡지 못했거나 도는 중 화면에게 비켜 끊었다 —
 * 앱 틀이 통로가 풀리기를 기다렸다 다시 해 본다(AC-8021.8). 'ended' = 그 밖 모두(다 됨·할 일 없음·다른 탭·비트 PC 아님·잡지 못함·숨김·떠남·실패)
 */
export type RunEnd = 'lane-busy' | 'ended'

/** 원장 길(TASK-17 함수 + 지금 읽기·저장)과 데스크 길(deskUpload.ts + desk 저장)이 같은 모양으로 준다 */
export type UploadAccess = {
  readPlan(): Promise<MyUploadPlan | null>
  claim(tab: string, bitMark: string | null): Promise<boolean>
  report(tab: string, report: UploadReport): Promise<void>
  readSalesMarks(from: string, to: string): Promise<SavedSalesMark[]>
  readCoverage(range: DateRange): Promise<DateRange[]>
  readStatsMarks(from: string, to: string): Promise<StatsMarks>
  saveRevenue(range: DateRange, result: RevenueDaysResult): Promise<void>
  saveStats(input: SaveInput): Promise<unknown>
}
/** 모든 통계 요청에 싣는 그 의원 묶음 정의(처방 묶음, 수납일지 Block·물리치료 묶음 — 둘 다 고르지 않았으면 null) */
export type UploadGroups = { rx: readonly RxGroupDef[]; sunap: StatsSunapGroups | null }
export type UploadBridge = Pick<ScreenBridge, 'hello' | 'call' | 'stream' | 'close'>
export type UploadWorker = WorkerLike & Pick<Worker, 'terminate'>
export type RunDeps = {
  access: UploadAccess
  plan: MyUploadPlan
  /** 처방 묶음·수납일지 설정 읽기(다 읽은 뒤에 통계 일을 시작한다) */
  readGroups: () => Promise<UploadGroups>
  /** 통로를 스스로 붙인다(connectScreenBridge + 새 createStatsWorker) */
  open: () => { bridge: UploadBridge; worker: UploadWorker }
  lane: Pick<BitLane, 'enterBackground'>
  /** navigator.locks. 없는 브라우저면 잠금 없이 돈다(다른 PC와는 DB 잡음이 막는다) */
  locks?: Pick<LockManager, 'request'>
  subtle?: Pick<SubtleCrypto, 'digest'>
  now: () => number
  today: string
  tab: string
  page: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  signal?: AbortSignal
}

// 매출·통계 덩어리 하나만 실패로 치는 번호(다음 일을 계속하고 마지막에 알린다). 그 밖 번호는 거기서 멈춘다
const CHUNK_ONLY = new Set<string>(['E-BIT-READ-FAILED', 'E-BRIDGE-BAD-REPLY', 'E-REVENUE-SAVE-FAILED', 'E-STATS-SAVE-FAILED'])
const NO_CODE: ErrorCode = 'E-AUTO-UPLOAD'
const GROUP_READ_FAILED: ErrorCode = 'E-STATS-GROUP-READ-FAILED'
const HELPER_OLD: ErrorCode = 'E-HELPER-OLD'
const HALT = Symbol('halt')

class TaskError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code)
    this.name = 'TaskError'
  }
}

// 오류 번호만 옮긴다(오류 글·환자 자료는 보내지 않는다). 정해 둔 번호가 아니면 번호 없는 오류다
function codeOf(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  return typeof code === 'string' && isErrorCode(code) ? code : NO_CODE
}

/** 요양기관번호 → SHA-256 16진 64자(번호 글자는 보내지 않는다) */
async function bitMarkOf(subtle: Pick<SubtleCrypto, 'digest'> | undefined, code: string): Promise<string> {
  if (subtle === undefined) throw new Error('해시를 셀 수 없음')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(code))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 처방 묶음은 통계 탭과 같은 groupDefs, Block·물리치료는 useStatsSunap과 같은 규칙(둘 다 고른 묶음이 있을 때만) */
export function uploadGroupsOf(rows: readonly StatsRxGroup[], settings: Pick<SunapSettings, 'blockGroup' | 'ptGroup'>): UploadGroups {
  const defOf = (id: string | null): RxGroupDef | null => {
    if (id === null) return null
    const group = rows.find((row) => row.id === id)
    return group === undefined ? null : (groupDefs([group])[0] ?? null)
  }
  const block = defOf(settings.blockGroup)
  const pt = defOf(settings.ptGroup)
  return { rx: groupDefs(rows), sunap: block !== null && pt !== null ? { block, pt } : null }
}

/** 원장 계획이 줄을 주면 원장 길, 아니면 데스크 계획 … 차례로. 모두 없으면 null. 읽기 실패는 그대로 던진다 */
export async function pickAccess(accesses: readonly UploadAccess[]): Promise<{ access: UploadAccess; plan: MyUploadPlan } | null> {
  for (const access of accesses) {
    const plan = await access.readPlan()
    if (plan !== null) return { access, plan }
  }
  return null
}

type Ready = {
  fill: DateRange
  sales: SavedSalesMark[]
  coverage: DateRange[]
  marks: StatsMarks
  groups: UploadGroups | null
  planWith: (helperVersion: string | null) => UploadTask[]
}

/** 한 번 돈다. 무엇이 실패해도 던지지 않는다 */
export async function runUpload(deps: RunDeps): Promise<RunEnd> {
  try {
    const ready = await readAll(deps)
    if (ready === null) return 'ended'
    const run = async (): Promise<RunEnd> => {
      if (ready.draft.length > 0) return session(deps, ready)
      await claimOnly(deps, ready)
      return 'ended'
    }
    if (deps.locks === undefined) return await run()
    const end: RunEnd = await deps.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => (lock !== null ? run() : 'ended'))
    return end
  } catch {
    // 알리지 않는다(다음 열기에 다시)
    return 'ended'
  }
}

// 읽기 넷(채울 기간 안 저장 표시 셋 + 묶음 정의) → 판을 모르는 초안. 빈 초안 + 그날 두 번째 열기면 여기서 끝(서버 읽기만)
async function readAll(deps: RunDeps): Promise<(Ready & { draft: UploadTask[] }) | null> {
  const { access, plan, today } = deps
  const fill = fillRange(today, plan.months)
  let sales: SavedSalesMark[]
  let coverage: DateRange[]
  let marks: StatsMarks
  let groups: UploadGroups | null
  try {
    ;[sales, coverage, marks, groups] = await Promise.all([
      access.readSalesMarks(fill.from, fill.to),
      access.readCoverage(fill),
      access.readStatsMarks(fill.from, fill.to),
      deps.readGroups().catch(() => null),
    ])
  } catch {
    return null
  }
  const flags = groups === null ? null : { rx: groups.rx.length > 0, sunap: groups.sunap !== null }
  const planWith = (helperVersion: string | null) =>
    uploadPlan({ today, months: plan.months, throughDay: plan.throughDay, sales, coverage, marks, groups: flags, helperVersion })
  const draft = planWith(null)
  const firstToday = plan.throughDay === null || compareYmd(plan.throughDay, fill.to) < 0
  if (draft.length === 0 && !firstToday) return null
  return { fill, sales, coverage, marks, groups, planWith, draft }
}

const groupErrorOf = (ready: Ready) => (ready.groups === null ? GROUP_READ_FAILED : null)

// 할 일은 없지만 그날 처음 열기: 표시 없이 잡고 상태만 알린다(도우미에 붙지 않는다)
async function claimOnly(deps: RunDeps, ready: Ready): Promise<void> {
  if (!(await deps.access.claim(deps.tab, null))) return
  const progress = progressOf(ready.fill, revenueSaved(ready.sales, null), ready.coverage)
  await deps.access.report(deps.tab, { ...progress, error: groupErrorOf(ready), done: true })
}

// 통로 차례 → 통로 붙이기 → 잡기 → 일을 하나씩 → 알리기 → 닫기
async function session(deps: RunDeps, ready: Ready): Promise<RunEnd> {
  const { access, page, signal, tab, today } = deps
  let halted = false
  // 비트 화면이 통로를 쓰는 중이라 못 잡았거나 화면에게 비켜 끊었으면 참(통로가 풀리면 다시 해 볼 일)
  let byScreen = false
  let opened: { bridge: UploadBridge; worker: UploadWorker } | null = null
  let freeLane: (() => void) | null = null
  let haltNow = () => {}
  const halt = new Promise<typeof HALT>((resolve) => {
    haltNow = () => resolve(HALT)
  })
  const shutdown = () => {
    const was = opened
    opened = null
    was?.bridge.close()
    was?.worker.terminate()
  }
  const releaseLane = () => {
    const free = freeLane
    freeLane = null
    free?.()
  }
  // 탭이 숨거나 비트 화면이 붙으려 하거나 앱 틀을 떠나면: 그 자리에서 통로·Worker를 닫아 하던 요청을 끊는다(그 일은 저장 안 함).
  // 차례는 enterScreen이 돌아간 뒤에 놓는다(기다리던 화면의 onFree가 그다음에 불린다)
  const interrupt = () => {
    if (halted) return
    halted = true
    shutdown()
    haltNow()
    void Promise.resolve().then(releaseLane)
  }
  const onVisibility = () => {
    if (page.visibilityState !== 'visible') interrupt()
  }
  // 통로·Worker 요청은 끊기와 겨룬다. 저장은 겨루지 않는다(끊긴 뒤에는 시작하지 않는다)
  const guard = async <T>(work: Promise<T>): Promise<T> => {
    const result = await Promise.race([work, halt])
    if (result === HALT || halted) throw HALT
    return result as T
  }

  freeLane = deps.lane.enterBackground(() => {
    if (!halted) byScreen = true
    interrupt()
  })
  if (freeLane === null) return 'lane-busy'
  page.addEventListener('visibilitychange', onVisibility)
  signal?.addEventListener('abort', interrupt)
  let final: UploadReport | null = null
  try {
    if (page.visibilityState !== 'visible' || signal?.aborted) return 'ended'
    opened = deps.open()
    const { bridge, worker } = opened
    const startedAt = deps.now()

    // 비트 PC인지 보고 잡는다. 여기까지의 실패(통로 없음·등록 안 됨·잡기 실패·끊김)는 알리지 않는다
    let helperVersion: string | null = null
    try {
      const hello = await guard(bridge.hello())
      helperVersion = hello.helperVersion ?? null
      // 잡기가 false면(다른 PC·다른 의원 비트·묶인 의원을 표시 없이) 아무것도 알리지 않는다
      if (hello.state === 'update-helper') {
        if (await access.claim(tab, null)) {
          final = { ...progressOf(ready.fill, revenueSaved(ready.sales, helperVersion), ready.coverage), error: HELPER_OLD, done: true }
        }
        return byScreen ? 'lane-busy' : 'ended'
      }
      if (hello.state !== 'ready') return byScreen ? 'lane-busy' : 'ended'
      const check = await guard(bridge.call('bit.check', {}))
      if (!check.registered || !check.steps.every((step) => step.ok)) return 'ended'
      const code = check.institutionCode
      const mark = typeof code === 'string' && code !== '' ? await bitMarkOf(deps.subtle, code) : null
      if (halted || !(await access.claim(tab, mark))) return byScreen ? 'lane-busy' : 'ended'
    } catch {
      return byScreen ? 'lane-busy' : 'ended'
    }

    const tasks = ready.planWith(helperVersion)
    const salesNow = new Map(ready.sales.map((row) => [row.date, row]))
    const coverageNow = [...ready.coverage]
    const progress = (): UploadProgress => progressOf(ready.fill, revenueSaved([...salesNow.values()], helperVersion), coverageNow)
    const groupError = groupErrorOf(ready)
    let chunkCode: string | null = null
    let stopCode: string | null = null
    final = { ...progress(), error: groupError, done: true }

    for (const task of tasks) {
      if (halted || deps.now() - startedAt >= RUN_MS) break
      try {
        if (task.kind === 'revenue') {
          const result = await guard(bridge.call('revenue.days', task.range))
          await access.saveRevenue(task.range, result)
          for (const row of marksOfResult(result)) salesNow.set(row.date, row)
        } else {
          const groups = ready.groups!
          const { part } = task
          const { id } = await guard(bridge.stream('stats.rows', part.read))
          const view = await guard(
            requestLoad(worker, { streamId: id, from: part.read.from, to: part.read.to, today, closeToday: false, keep: true, groups: groups.rx, sunap: groups.sunap }),
          )
          if (view.quality !== 'valid' || view.months === null || view.days === null) throw new TaskError('E-BIT-DATA-UNSURE')
          const input = partSave(view, part)
          await access.saveStats(input)
          if (input.covered !== null) coverageNow.push(input.covered)
        }
      } catch (error) {
        if (error === HALT || halted) break
        const code = codeOf(error)
        if (!CHUNK_ONLY.has(code)) {
          stopCode = code
          break
        }
        chunkCode = code
      }
      if (halted) break
      try {
        await access.report(tab, { ...progress(), error: chunkCode ?? groupError, done: false })
      } catch {
        break
      }
    }
    final = { ...progress(), error: stopCode ?? chunkCode ?? groupError, done: true }
    return byScreen ? 'lane-busy' : 'ended'
  } finally {
    page.removeEventListener('visibilitychange', onVisibility)
    signal?.removeEventListener('abort', interrupt)
    if (final !== null) await access.report(tab, final).catch(() => undefined)
    shutdown()
    releaseLane()
  }
}
