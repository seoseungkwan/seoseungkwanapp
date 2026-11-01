'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useBridge } from '@/components/claim/useBridge'
import { addMonths, monthOf, todayInKorea } from '@/lib/analytics/dates'
import { firstMonth } from '@/lib/revenue/summary'
import { planFetch, syncRevenue, type SyncResult } from '@/lib/revenue/sync'
import { createRevenueStore } from '@/lib/storage/revenue'
import { createRxGroupStore } from '@/lib/storage/rxGroups'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { BridgeState } from '@/types/bridge'
import type { RxGroup } from '@/types/rxGroups'
import { PageTitle } from './RevenueParts'
import { RevenuePerVisit } from './RevenuePerVisit'
import { RevenueSplit } from './RevenueSplit'
import { BusyNotice, ConnectNeeded, EmptyMonthBlock, FailedBanner, Fetching, PeriodRow, RevenueError, SafeLine, SaveFailedCard, SavedNotice, TitleRow, UpgradeNeeded } from './RevenueStates'
import { RevenueTreatments } from './RevenueTreatments'
import { RevenueTrend } from './RevenueTrend'
import { buildRevenueView, type FailedNotice, type PeriodView, type RevenueBlocks, type RevenueSync, type RevenueViewInput } from './view'

// 매출 화면 (TASK-9, REQ-009, design.md 9절, 시안 docs/mockups/revenue/gen.py). 통로는 useBridge(Worker 없이)로만 쓴다.
// revenue.days 답은 syncRevenue·저장소로만 넘기고 화면 상태에 두지 않는다. 화면은 저장된 숫자만 그린다.
// 연결된 PC: 저장된 줄 읽기 → 빠진 달 가져오기(planFetch) → 다시 읽기. 그동안은 첫 그림부터 '가져오는 중'이다(읽기 전에 "기록이 없어요"라고 말하지 않는다).
// 통로를 부르는 것은 상태가 ready일 때뿐이다: 연결 중에도 E-BRIDGE-REJECTED가 와서 옛 확장으로 잘못 알게 된다.
// 비트 PC인데 "연결되어 있지 않아요"라고 말하지 않는 두 경우: 이 화면의 가져오기가 도중에 끊겼을 때(오류 카드), 다른 창이 통로를 쓰는 중일 때(E-BRIDGE-BUSY)

const TITLE = '매출'
const MONTHS_SHOWN = 13
const SAVE_FAILED = 'E-REVENUE-SAVE-FAILED'
const DISCONNECTED = 'E-BRIDGE-DISCONNECTED'
const HELPER_MISSING = 'E-HELPER-MISSING'
const IDLE: RevenueSync = { state: 'idle' }
const RUNNING: RevenueSync = { state: 'running' }
const LOAD_ERROR: RevenueSync = { state: 'error', code: 'E-PAGE-FAILED' }

type Saved = Awaited<ReturnType<ReturnType<typeof createRevenueStore>['loadRevenue']>>
type Groups = RxGroup[] | 'load-failed'
type Failed = SyncResult['failed']
type Range = { months: string[] } | { savedDays: ReadonlySet<string> }

const revenueStore = () => createRevenueStore(supabaseBrowser())

// 읽기 실패를 빈 목록으로 바꾸면 제안 묶음으로 잘못 보인다
async function readGroups(): Promise<Groups> {
  try {
    return await createRxGroupStore(supabaseBrowser()).listGroups()
  } catch {
    return 'load-failed'
  }
}

function bridgeKind(state: BridgeState): RevenueViewInput['bridge'] {
  if (state === 'ready') return 'ready'
  return state === 'update-helper' ? 'helper-old' : 'none'
}

/** keep = 이번에 다시 읽지 않는 달의 실패(그 달의 알림을 지우지 않는다) */
function syncOf(result: SyncResult, keep: Failed): RevenueSync {
  if (result.helperOld) return { ...IDLE, helperOld: true }
  if (result.extensionOld) return { ...IDLE, extensionOld: true }
  if (result.stopped) return { state: 'error', code: result.stopped }
  return { ...IDLE, failed: [...keep, ...result.failed] }
}

type BlocksProps = { blocks: RevenueBlocks; onRetryGroups(): void; retryingGroups: boolean }

function Blocks({ blocks, onRetryGroups, retryingGroups }: BlocksProps) {
  return (
    <>
      <RevenueTrend view={blocks.trend} />
      <RevenueSplit view={blocks.split} />
      <RevenueTreatments view={blocks.treatments} onRetry={onRetryGroups} retrying={retryingGroups} />
      <RevenuePerVisit view={blocks.perVisit} />
    </>
  )
}

export function RevenueScreen() {
  const { state: bridgeState, helloError, call, retry } = useBridge()
  const [today] = useState(() => todayInKorea())
  const latest = firstMonth(today)
  const oldest = addMonths(latest, 1 - MONTHS_SHOWN)
  const [month, setMonth] = useState(latest)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [groups, setGroups] = useState<Groups | null>(null)
  const [groupsBusy, setGroupsBusy] = useState(false)
  const [sync, setSync] = useState<RevenueSync>(IDLE)
  const [attempt, setAttempt] = useState(0)
  /** 저절로 가져오기가 끝난 차례(run). 다르면 아직 가져오는 중이다 */
  const [settled, setSettled] = useState<string | null>(null)
  /**
   * 이 화면이 '가져오는 중'이라고 말한 뒤 아직 끝나지 않았다. 통로는 상태를 먼저 끊김으로 바꾸고 그 뒤에 거절해서(client.ts finishAll)
   * 거절이 올 때는 차례가 이미 지나 있다. 도우미가 꺼질 때(no-helper + E-HELPER-MISSING)도 차례가 같다.
   * 그래서 끊김이 도중 끊김인지는 이 값으로 안다. 처음부터 끊겨 있던 PC·다 가져온 뒤 끊긴 때는 거짓이다
   */
  const [fetchOpen, setFetchOpen] = useState(false)
  /** 지금 차례. 지난 차례의 답은 버린다 */
  const generation = useRef(0)

  const connected = bridgeState === 'ready'
  const run = `${bridgeState}:${attempt}`

  // plan = 읽을 달 차례. onProgress의 month는 막 끝낸 달이라 '읽는 중' 글자에는 plan의 다음 달을 쓴다
  const pull = useCallback(
    async (range: Range, plan: string[], keep: Failed, isLive: () => boolean, doneRun: string) => {
      const store = revenueStore()
      setFetchOpen(true)
      setSync({ state: 'running', done: 0, total: plan.length, month: plan[0] })
      const result = await syncRevenue({
        // 앞 차례는 새 연결로 읽지 않는다(도우미는 한 번에 한 명령씩, 같은 달을 두 번 읽지 않게)
        call: (args) => (isLive() ? call('revenue.days', args) : Promise.reject(Object.assign(new Error(DISCONNECTED), { code: DISCONNECTED }))),
        store,
        today,
        ...range,
        onProgress: ({ done, total }) => {
          if (isLive()) setSync({ state: 'running', done, total, month: plan[done] })
        },
      })
      // 끊겨서 멈춘 것 말고는 가져오기가 끝난 것이다. 앞 차례는 새 차례의 표시를 건드리지 않는다
      if (isLive() && result.stopped !== DISCONNECTED && result.stopped !== HELPER_MISSING) setFetchOpen(false)
      let next = syncOf(result, keep)
      let rows: Saved | null = null
      try {
        rows = await store.loadRevenue(oldest, latest)
      } catch {
        if (next.state === 'idle' && !next.helperOld && !next.extensionOld) next = LOAD_ERROR
      }
      if (!isLive()) return
      if (rows) setSaved(rows)
      setSync(next)
      setSettled(doneRun)
    },
    [call, today, oldest, latest],
  )

  useEffect(() => {
    generation.current += 1
    const live = generation.current
    const isLive = () => generation.current === live
    if (bridgeState === 'connecting') {
      // 새 연결을 시작했으니 앞선 끊김은 지나간 일이다: 도우미가 정말 없으면 연결 필요로 가고, 돌아오면 새 차례가 다시 켠다.
      // [다시 확인]을 누른 자리에서 지우면 상태가 바뀌기 전에 틀린 안내가 한 번 그려진다
      setFetchOpen(false)
      return
    }
    setSync(IDLE)
    if (connected) setFetchOpen(true)
    void readGroups().then((next) => {
      if (isLive()) setGroups(next)
    })
    void (async () => {
      let rows: Saved
      try {
        rows = await revenueStore().loadRevenue(oldest, latest)
      } catch {
        // 저장된 날을 모르면 빠진 달을 셀 수 없다(13달을 모두 다시 읽지 않는다)
        if (isLive()) {
          setFetchOpen(false)
          setSync(LOAD_ERROR)
          setSettled(run)
        }
        return
      }
      if (!isLive()) return
      setSaved(rows)
      if (!connected) return
      const savedDays = new Set(rows.days.map((row) => row.date))
      const plan = planFetch(today, savedDays).map((range) => monthOf(range.from))
      await pull({ savedDays }, plan, [], isLive, run)
    })()
  }, [bridgeState, connected, run, today, oldest, latest, pull])

  function refetch(months: string[]) {
    generation.current += 1
    const live = generation.current
    const keep = (sync.failed ?? []).filter((item) => !months.includes(item.month))
    void pull({ months }, months, keep, () => generation.current === live, run)
  }

  function retryAfterError() {
    // 통로가 열려 있지 않으면 통로부터 다시, 아니면 처음부터 다시 읽는다.
    // 돌아온 ready는 지난 차례와 이름이 같을 수 있어 settled를 지운다(안 그러면 읽기 전에 "수납 기록이 없어요"가 보인다)
    if (bridgeState === 'connecting' || bridgeState === 'disconnected' || bridgeState === 'busy' || bridgeState === 'no-helper') {
      setSettled(null)
      retry()
    } else setAttempt((n) => n + 1)
  }

  function reloadGroups() {
    if (groupsBusy) return
    setGroupsBusy(true)
    void readGroups().then((next) => {
      setGroups(next)
      setGroupsBusy(false)
    })
  }

  // 연결 확인 중: 무엇도 단정하지 않는다
  if (bridgeState === 'connecting' && !helloError) return <PageTitle>{TITLE}</PageTitle>

  const waiting = connected && settled !== run
  let shown = sync
  if (bridgeState === 'connecting' && helloError) shown = { state: 'error', code: helloError }
  // 번호는 끊김 하나로 말한다. E-HELPER-MISSING의 글("아래 2번에서…")은 비트 PC 연결 화면의 안내라 여기서는 틀리다
  else if ((bridgeState === 'disconnected' && helloError) || ((bridgeState === 'disconnected' || bridgeState === 'no-helper') && fetchOpen)) shown = { state: 'error', code: helloError ?? DISCONNECTED }
  else if (bridgeState === 'update-extension') shown = { ...IDLE, extensionOld: true }
  else if (waiting && sync.state !== 'running') shown = RUNNING

  const kind = bridgeKind(bridgeState)
  // 저장된 줄을 읽기 전에 "연결 필요"·"기록이 없어요"라고 말하지 않는다. 묶음을 모르면 제안으로 세지 않는다
  const needsRows = kind !== 'helper-old' && shown.state === 'idle' && !shown.helperOld && !shown.extensionOld
  if (needsRows && (saved === null || groups === null)) return <PageTitle>{TITLE}</PageTitle>

  const view = buildRevenueView({
    days: saved?.days ?? [],
    codes: saved?.codes ?? [],
    groups: groups ?? [],
    fetchedAt: saved?.fetchedAt ?? null,
    month,
    today,
    bridge: kind,
    sync: shown,
  })

  const periodRow = (period: PeriodView) => (
    <PeriodRow period={period} canPrevious={month > oldest} canNext={month < latest} onPrevious={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} />
  )

  // 저장 실패는 오류 카드 + [다시 저장]이고, 알림 줄은 읽지 못한 달이 있을 때만이다(AC-009.4)
  const failedItems = shown.failed ?? []
  const saveFailed = failedItems.filter((item) => item.code === SAVE_FAILED).map((item) => item.month)
  const notices = (failed: FailedNotice | null) => (
    <>
      {saveFailed.length > 0 && <SaveFailedCard onRetry={() => refetch(saveFailed)} />}
      {failed && failedItems.some((item) => item.code !== SAVE_FAILED) && <FailedBanner failed={failed} onRetry={() => refetch(failed.list)} />}
    </>
  )
  const groupProps = { onRetryGroups: reloadGroups, retryingGroups: groupsBusy }

  switch (view.state) {
    case 'connect-needed':
      return bridgeState === 'busy' ? <RevenueError view={{ state: 'error', title: TITLE, code: 'E-BRIDGE-BUSY' }} onRetry={retryAfterError} /> : <ConnectNeeded view={view} />
    case 'fetching':
      return <Fetching view={view} />
    case 'helper-old':
    case 'extension-old':
      return <UpgradeNeeded view={view} />
    case 'error':
      return <RevenueError view={view} onRetry={retryAfterError} />
    case 'empty':
      return (
        <div>
          <PageTitle>{view.title}</PageTitle>
          {periodRow(view.period)}
          {notices(view.failed)}
          <EmptyMonthBlock empty={view.empty} />
        </div>
      )
    case 'ready':
      return (
        <div>
          <TitleRow header={view.header} onRefresh={() => refetch([month])} />
          {periodRow(view.period)}
          {notices(view.failed)}
          <Blocks blocks={view.blocks} {...groupProps} />
          <SafeLine text={view.safe} />
        </div>
      )
    case 'saved-only':
      return (
        <div>
          <TitleRow header={view.header} />
          {periodRow(view.period)}
          {bridgeState === 'busy' ? <BusyNotice onRetry={retryAfterError} /> : <SavedNotice notice={view.notice} />}
          {view.blocks && <Blocks blocks={view.blocks} {...groupProps} />}
          {view.empty && <EmptyMonthBlock empty={view.empty} />}
          <SafeLine text={view.safe} />
        </div>
      )
  }
}
