import type { BorrowedCall, LaneCall } from '@/components/claim/bitLane'
import { compareVersions } from '@/lib/bridge/handshake'
import { SHEET_EXTENSION, SHEET_HELPER } from '@/lib/bridge/versions'
import { planFills, isBusyCode } from '@/lib/gsheet/plan'
import { readStatus } from '@/lib/gsheet/reply'
import { errorCode, runFill, type RunnerStore } from '@/lib/gsheet/runner'
import type { FillJob } from '@/lib/gsheet/shapes'
import { fillStatus } from '@/lib/gsheet/status'
import type { HelloResult } from '@/types/bridge'
import type { GsheetRun, GsheetSaved } from '@/types/gsheet'

// 수납 저절로 넣기 한 차례(spec google-link REQ-8513 AC-8513.3·AC-8513.4, AC-8541.2, design.md 11절 1~5). GoogleSheetAuto가 30초마다 부른다.
// 차례:
//   1. 보는 중(관리자 보기 쿠키)이면 끝.
//   2. 서버 설정·secret_tag·마지막 넣기 한 줄을 읽는다(마지막 기록은 넣기 상태에 채움 — 다른 PC의 넣기 멈춤도 탭 줄에 보이게).
//      서버 secret_tag가 없으면 넣는 PC가 없다 → 통로를 건드리지 않고 '보기만'.
//   3. 이 PC가 넣는 PC인지 물을 때(아직 모름 · 서버 secret_tag가 바뀜 · 보기만 PC로 정한 지 PROBE_MS가 지남)인지 본다.
//      넣는 PC이거나 물을 때이고 [켜기](autoOn)면: 서버 마지막 넣기가 (간격 − 1)분 안이면 건너뛰고, 아니면 최근 7일 기록으로 planFills.
//      물을 것도 할 일도 없으면 끝(통로를 건드리지 않는다).
//   4. 통로: 같은 쪽 화면이 빌려준 통로(borrowScreenCall, sheet.* 만) → 없으면 enterBackground + 통로 열기(hello, 끝나면 닫고 놓음).
//      화면이 쥐었는데 바쁘거나 아직 빌려주지 않았음·다른 탭이 쥠(hello busy)·E-BRIDGE-BUSY는 기록 없이 다음 차례.
//      확장 통로가 없는 브라우저·도우미 없음은 '보기만'.
//   5. 도우미 < SHEET_HELPER 또는 확장 < SHEET_EXTENSION(판 글자를 모르면 옛 판으로 침)이면 sheet.*를 한 번도 부르지 않고 '보기만' + 옛 판 표시.
//   6. 물을 때면 sheet.status → 도우미 secretTag = 서버 secret_tag면 '넣는 PC', 아니면 '보기만'(fillStatus.setPc).
//   7. 넣는 PC이고 할 일이 있으면 navigator.locks 'ssk-gsheet'(ifAvailable — 같은 브라우저의 다른 탭이 넣는 중이면 건너뜀) 안에서
//      할 일마다 runFill(sheet.status → sheet.fill → gsheet_runs 한 줄 → fillStatus). 'viewer'면 '보기만'으로 바꾸고, 'busy'·'unreachable'이면 다음 차례.
// 뒤에서 넣는 동안 화면이 통로를 달라고 하면(bitLane stop) 지금 넣기만 끝내고 남은 일은 다음 차례로 미룬 뒤 놓는다(넣기는 길어야 FILL_LIMIT_MS).
// 멈추면(앱 틀을 떠남) 새 일을 시작하지 않고 뒤에서 연 통로를 닫는다. 환자 줄은 이 길로 오지 않는다(숫자 답만 — runner·reply가 본다)

export const START_DELAY_MS = 5_000
export const TICK_MS = 30_000
/** 보기만 PC로 정한 뒤 다시 묻는 때(도우미를 새로 깔았거나 비밀 글자를 옮긴 PC) */
export const PROBE_MS = 10 * 60_000
export const SHEET_LOCK = 'ssk-gsheet'
const RUNS_DAYS = 7
const DAY_MS = 24 * 60 * 60_000
const MINUTE_MS = 60_000

/** 뒤에서 여는 통로(connectScreenBridge의 hello·call·close만) */
export type SheetBridge = { hello(): Promise<HelloResult>; call: LaneCall; close(): void }
export type SheetLocks = { request(name: string, options: { ifAvailable: true }, callback: (lock: unknown) => unknown): Promise<unknown> }

export type SheetAutoDeps = {
  /** 보는 중(관리자 보기 쿠키) */
  viewing(): boolean
  loadSettings(): Promise<GsheetSaved>
  lastRun(): Promise<GsheetRun | null>
  listRuns(fromIso: string): Promise<GsheetRun[]>
  store: RunnerStore
  /** 같은 쪽 화면이 빌려준 통로(bitLane.borrowScreenCall) */
  borrow(): BorrowedCall | null
  /** bitLane.enterBackground */
  enterBackground(stop: () => void): (() => void) | null
  /** 이 브라우저에 확장 통로(chrome.runtime)가 있나 */
  canConnect(): boolean
  /** 뒤에서 통로를 연다(차례를 잡은 뒤에만 부른다) */
  connect(): SheetBridge
  locks: SheetLocks | null
  now(): Date
}

type Lane = { call: LaneCall; helperVersion: string | null; extensionVersion: string | null; yielding(): boolean }

const isOld = (version: string | null | undefined, min: string) => typeof version !== 'string' || compareVersions(version, min) < 0

/** 서버 마지막 넣기가 (간격 − 1)분 안인가(시계가 조금 어긋나 앞날로 보여도 같은 창 안이면 막 넣은 것으로 본다) */
function justRan(last: GsheetRun | null, everyMin: number, now: Date): boolean {
  if (last === null) return false
  const at = Date.parse(last.at)
  if (!Number.isFinite(at)) return false
  const window = (Math.max(1, Number.isFinite(everyMin) ? everyMin : 5) - 1) * MINUTE_MS
  const age = now.getTime() - at
  return Math.abs(age) < window
}

export function createSheetAuto(deps: SheetAutoDeps): { tick(): Promise<void>; stop(): void } {
  let stopped = false
  /** 마지막으로 물은 때와 그때 서버 secret_tag */
  let probedAt = Number.NEGATIVE_INFINITY
  let probedTag: string | null | undefined
  /** 뒤에서 연 통로(멈출 때 닫는다) */
  let open: SheetBridge | null = null

  /** 이 PC를 정한다(넣는 PC·보기만·옛 판). 정한 때와 그때 서버 secret_tag를 적어 PROBE_MS 동안 다시 묻지 않는다 */
  const settle = (filler: boolean, saved: GsheetSaved, now: Date, old?: { helper: boolean; extension: boolean }) => {
    probedAt = now.getTime()
    probedTag = saved.secretTag
    fillStatus.setPc(filler ? 'filler' : 'viewer', old)
  }

  const probeDue = (serverTag: string | null, now: Date) => {
    const pc = fillStatus.get().pc
    return pc === 'unknown' || serverTag !== probedTag || (pc !== 'filler' && now.getTime() - probedAt >= PROBE_MS)
  }

  async function plan(saved: GsheetSaved, last: GsheetRun | null, now: Date): Promise<FillJob[]> {
    const { settings } = saved
    if (!settings.autoOn || justRan(last, settings.everyMin, now)) return []
    const runs = await deps.listRuns(new Date(now.getTime() - RUNS_DAYS * DAY_MS).toISOString())
    fillStatus.seed(runs)
    return planFills(now, settings, runs)
  }

  /** 넣는 PC인지 묻는다. 참 = 넣는 PC, 거짓 = 보기만, null = 통로가 바빠 다음 차례 */
  async function probe(lane: Lane, saved: GsheetSaved, now: Date): Promise<boolean | null> {
    let filler: boolean
    try {
      const status = readStatus(await lane.call('sheet.status', {}))
      filler = status !== null && status.secretTag !== null && status.secretTag === saved.secretTag
    } catch (error) {
      if (isBusyCode(errorCode(error))) return null
      filler = false
    }
    settle(filler, saved, now)
    return filler
  }

  async function fillAll(lane: Lane, saved: GsheetSaved, jobs: FillJob[]): Promise<void> {
    const work = async () => {
      for (const job of jobs) {
        if (stopped || lane.yielding()) return
        const out = await runFill({ call: lane.call, store: deps.store, now: deps.now, settings: saved.settings, secretTag: saved.secretTag }, job)
        if (out.kind === 'viewer') {
          fillStatus.setPc('viewer')
          return
        }
        if (out.kind !== 'ran') return
      }
    }
    if (deps.locks === null) return work()
    await deps.locks.request(SHEET_LOCK, { ifAvailable: true }, (lock) => (lock ? work() : undefined))
  }

  /** 통로를 잡은 뒤: 판 확인 → (물을 때) 묻기 → 넣기 */
  async function withLane(lane: Lane, saved: GsheetSaved, jobs: FillJob[], needProbe: boolean, now: Date): Promise<void> {
    if (stopped || lane.yielding()) return
    const old = { helper: isOld(lane.helperVersion, SHEET_HELPER), extension: isOld(lane.extensionVersion, SHEET_EXTENSION) }
    if (old.helper || old.extension) {
      settle(false, saved, now, old)
      return
    }
    if (needProbe) {
      const filler = await probe(lane, saved, now)
      if (filler !== true) return
    } else if (fillStatus.get().pc !== 'filler') return
    if (jobs.length === 0 || stopped || lane.yielding()) return
    await fillAll(lane, saved, jobs)
  }

  /** 뒤에서 붙는다: 차례 → 통로 열기 → hello → 일 → 닫기·놓기 */
  async function inBackground(saved: GsheetSaved, jobs: FillJob[], needProbe: boolean, now: Date): Promise<void> {
    let yielding = false
    const free = deps.enterBackground(() => {
      yielding = true
    })
    if (free === null) return
    let bridge: SheetBridge | null = null
    try {
      bridge = deps.connect()
      open = bridge
      const hello = await bridge.hello()
      if (stopped || yielding) return
      switch (hello.state) {
        case 'ready':
          break
        case 'no-extension':
        case 'no-helper':
          settle(false, saved, now)
          return
        case 'update-helper':
        case 'update-extension':
          settle(false, saved, now, { helper: hello.state === 'update-helper', extension: hello.state === 'update-extension' })
          return
        default:
          return // 다른 탭이 쥠(busy)·끊김 — 다음 차례
      }
      const lane: Lane = {
        call: bridge.call.bind(bridge),
        helperVersion: hello.helperVersion ?? null,
        extensionVersion: hello.extensionVersion ?? null,
        yielding: () => yielding,
      }
      await withLane(lane, saved, jobs, needProbe, now)
    } catch {
      // 통로 오류는 다음 차례에 다시
    } finally {
      if (bridge !== null) {
        if (open === bridge) open = null
        bridge.close()
      }
      free()
    }
  }

  async function tick(): Promise<void> {
    if (stopped || deps.viewing()) return
    let saved: GsheetSaved
    let last: GsheetRun | null
    try {
      ;[saved, last] = await Promise.all([deps.loadSettings(), deps.lastRun()])
    } catch {
      return
    }
    if (stopped) return
    if (last !== null) fillStatus.seed([last])
    if (saved.secretTag === null) {
      fillStatus.setPc('viewer')
      return
    }
    const now = deps.now()
    const needProbe = probeDue(saved.secretTag, now)
    let jobs: FillJob[] = []
    if (fillStatus.get().pc === 'filler' || needProbe) {
      try {
        jobs = await plan(saved, last, now)
      } catch {
        jobs = []
      }
    }
    if (stopped || (!needProbe && jobs.length === 0)) return

    const borrowed = deps.borrow()
    if (borrowed !== null) {
      await withLane({ ...borrowed, yielding: () => false }, saved, jobs, needProbe, now)
      return
    }
    if (!deps.canConnect()) {
      settle(false, saved, now)
      return
    }
    await inBackground(saved, jobs, needProbe, now)
  }

  function stop(): void {
    stopped = true
    const bridge = open
    open = null
    bridge?.close()
  }

  return { tick, stop }
}

/** 시작 뒤 START_DELAY_MS에 처음, 그 뒤 TICK_MS마다 한 차례(앞 차례가 끝나지 않았으면 건너뜀). 돌려준 함수로 멈춘다 */
export function startSheetAuto(deps: SheetAutoDeps): () => void {
  const auto = createSheetAuto(deps)
  let running = false
  let stopped = false
  const wake = () => {
    if (running || stopped) return
    running = true
    auto
      .tick()
      .catch(() => undefined)
      .finally(() => {
        running = false
      })
  }
  let interval: ReturnType<typeof setInterval> | undefined
  const first = setTimeout(() => {
    wake()
    interval = setInterval(wake, TICK_MS)
  }, START_DELAY_MS)
  return () => {
    if (stopped) return
    stopped = true
    clearTimeout(first)
    clearInterval(interval)
    auto.stop()
  }
}
