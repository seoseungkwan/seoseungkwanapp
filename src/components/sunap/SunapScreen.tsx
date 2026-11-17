'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useBridge } from '@/components/claim/useBridge'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { groupDefs } from '@/components/stats/treatmentView'
import { ds } from '@/components/ui/classes'
import { addDays, compareYmd } from '@/lib/analytics/dates'
import { compareVersions } from '@/lib/bridge/handshake'
import { SUNAP_HELPER } from '@/lib/bridge/versions'
import { isErrorCode } from '@/lib/errors'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { closeSunapDay, listSpends, loadSunapDay, loadSunapSettings, reopenSunapDay, saveSunapSettings, type SunapDay, type SunapSpend } from '@/lib/storage/sunap'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { savedTimeText } from '@/lib/worklog/days'
import type { RxGroupDef } from '@/types/analysis'
import type { BridgeState } from '@/types/bridge'
import type { ErrorCode } from '@/types/errors'
import type { StatsRxGroup } from '@/types/rxGroups'
import { DEFAULT_RSV_KINDS, type SunapSettings as Settings } from '@/types/sunap'
import { DoctorTable } from './DoctorTable'
import { dayTitle, monthDay, stateText, type LedgerPatch } from './labels'
import { LockLine, RemoteView, type RemoteReason, type ServerDayView } from './RemoteView'
import { LedgerRows } from './rows/LedgerRows'
import { PaidRows } from './rows/PaidRows'
import { SpendPanel } from './SpendPanel'
import { SunapCards } from './SunapCards'
import { SunapSettings } from './SunapSettings'
import { useSunapWorker, useSunapWorkerObject, type SunapWorkerApi } from './useSunapWorker'

// 수납일지 화면(spec sunap-ilji REQ-4905, 시안 docs/mockups/sunap-ilji ?s=open·pick·closed·late·settings·remote). 라우트 page가 <SunapScreen initialToday={todayInKorea()} />로 그린다.
// 접수 PC(도우미 0.8.0 이상 연결 · 오늘−62일 안)는 Worker가 비트·PC 저장에서 만든 장부를 그린다. 환자 줄은 rows 울타리 안에서만 그린다.
// 서버에는 마감할 때 합계 숫자(closeSunapDay)·지출만 간다. 다른 기기·옛 도우미·62일 넘은 날은 서버 숫자만(RemoteView).
// 마감하기 = Worker close(PC에 고정) → closeSunapDay. 마감 풀기 = reopenSunapDay → Worker reopen(서버가 먼저 풀려야 PC도 푼다).
// 원장님별 표(spec sunap-doctors AC-5003.3)는 장부 아래·미수 입금/지출 위에, 원장님(미지정 빼고)이 두 분 이상일 때만(Worker가 doctors를 보낼 때만) 그린다. 서버 숫자 화면(RemoteView)에는 없다.
// 시안과 다른 곳(design.md): 원장님별 hint는 '접수할 때 정한 진료의 기준'. 시안에 없는 글(읽는 중·오류·묶음 안 고름·서버에 아직 안 올라간 마감)은 더했다.
// 다음 예약 종류(spec sunap-kinds REQ-5503): 설정의 종류 목록을 Worker load·장부 칩·고르기 판·카드(예약률 ○인 이름)·알림 띠에 쓴다

export type SunapMode = 'ledger' | 'connecting' | 'device' | 'old-helper' | 'old-day'
type BridgeLink = { state: BridgeState; helperVersion?: string; helloError: string | null }

// 비트는 오늘부터 62일 전까지만 다시 읽는다(design.md '62일')
const LEDGER_DAYS = 62
// 원장님별 표 hint(spec sunap-doctors design.md '시안과 다른 곳')
const DOCTOR_HINT = '엑셀 진료실 1~4 자리 · 접수할 때 정한 진료의 기준'

/** 이 기기·이 날에 무엇을 그리나 */
export function screenMode(link: BridgeLink, day: string, today: string): SunapMode {
  if (link.state === 'connecting') return link.helloError === null ? 'connecting' : 'device'
  if (link.state === 'update-helper') return 'old-helper'
  if (link.state !== 'ready') return 'device'
  if (link.helperVersion === undefined || compareVersions(link.helperVersion, SUNAP_HELPER) < 0) return 'old-helper'
  if (compareYmd(day, addDays(today, -LEDGER_DAYS)) < 0) return 'old-day'
  return 'ledger'
}

// ── 서버 숫자(마감 줄·지출) ────────────────────────────────

type ServerDay = ServerDayView & {
  /** 이 날을 읽은 번호(지출 칸은 새로 읽을 때마다 새로 그린다) */
  key: string
  retry(): void
  setClosed(closed: SunapDay | null): void
  setSpends(spends: SunapSpend[]): void
}

function useServerDay(day: string): ServerDay {
  const [round, setRound] = useState(0)
  const key = `${day}#${round}`
  const [got, setGot] = useState<(ServerDayView & { key: string }) | null>(null)

  useEffect(() => {
    let live = true
    const client = supabaseBrowser()
    Promise.all([loadSunapDay(client, day), listSpends(client, day)]).then(
      ([closed, spends]) => live && setGot({ key, status: 'ready', closed, spends }),
      () => live && setGot({ key, status: 'failed', closed: null, spends: [] }),
    )
    return () => {
      live = false
    }
  }, [day, key])

  const view: ServerDayView = got?.key === key ? got : { status: 'loading', closed: null, spends: [] }
  const retry = useCallback(() => setRound((n) => n + 1), [])
  const setClosed = useCallback((closed: SunapDay | null) => setGot((prev) => (prev?.key === key ? { ...prev, closed } : prev)), [key])
  const setSpends = useCallback((spends: SunapSpend[]) => setGot((prev) => (prev?.key === key ? { ...prev, spends } : prev)), [key])
  return { ...view, key, retry, setClosed, setSpends }
}

// ── 화면 조각 ────────────────────────────────

function StateChip({ text }: { text: string }) {
  const tone = text.startsWith('늦은') ? ds.chip.warning : text === '마감 전' ? ds.chip.neutral : ds.chip.positive
  return (
    <span data-testid="sunap-state" className={tone}>
      {text}
    </span>
  )
}

function DayBar({
  day,
  today,
  chip,
  locked,
  onDay,
  children,
}: {
  day: string
  today: string
  chip: string | null
  locked: boolean
  onDay(next: string): void
  children?: ReactNode
}) {
  const [year, date] = dayTitle(day)
  const isToday = day === today
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-line bg-surface px-4 py-3 max-md:px-3">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="전날" disabled={locked} className={`${ds.button.secondarySmall} px-2!`} onClick={() => onDay(addDays(day, -1))}>
          <Icon name="chev" className="rotate-90" />
        </button>
        <span className="px-2 text-subtitle font-semibold text-ink tabular-nums">
          <span className="max-md:hidden">{year}</span> <span>{date}</span>
        </span>
        <button
          type="button"
          aria-label="다음 날"
          disabled={locked || isToday}
          className={`${ds.button.secondarySmall} px-2!`}
          onClick={() => onDay(addDays(day, 1))}
        >
          <Icon name="chev" className="-rotate-90" />
        </button>
      </div>
      {!isToday && (
        <button type="button" disabled={locked} className={ds.button.ghostSmall} onClick={() => onDay(today)}>
          오늘
        </button>
      )}
      {chip !== null && <StateChip text={chip} />}
      <span className="flex-1" />
      {children}
    </div>
  )
}

type Tone = 'ok' | 'warn' | 'info'
const BANNER: Record<Tone, string> = {
  ok: 'border-positive bg-positive-soft',
  warn: 'border-warning bg-warning-soft',
  info: 'border-accent bg-accent-soft',
}
function Banner({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <p className={`rounded-control border-l-4 px-4 py-3 text-small text-ink-2 ${BANNER[tone]}`}>{children}</p>
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-negative-soft px-4 py-3 text-small text-ink-2">
      {children}
    </p>
  )
}

const codeOf = (code: string, fallback: ErrorCode): ErrorCode => (isErrorCode(code) ? code : fallback)

// ── 설정(묶음·다음 예약 종류) ────────────────────────────────

type Prep = { round: number; ok: true; settings: Settings; groups: StatsRxGroup[] } | { round: number; ok: false }

function defOf(groups: readonly StatsRxGroup[], id: string | null): RxGroupDef | null {
  const group = id === null ? undefined : groups.find((item) => item.id === id)
  return group ? (groupDefs([group])[0] ?? null) : null
}

// ── 접수 PC 장부 ────────────────────────────────

type ActionProblem = { kind: 'code'; code: ErrorCode } | { kind: 'close-upload' } | { kind: 'reopen-upload' }

function LedgerView({
  day,
  today,
  onDay,
  api,
  server,
}: {
  day: string
  today: string
  onDay(next: string): void
  api: SunapWorkerApi
  server: ServerDay
}) {
  const [prepRound, setPrepRound] = useState(0)
  const [prep, setPrep] = useState<Prep | null>(null)
  const asked = useRef(-1)
  const [reload, setReload] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ActionProblem | null>(null)

  // 설정·처방 묶음은 이 화면을 열 때 한 번(실패하면 [다시 불러오기])
  useEffect(() => {
    if (asked.current === prepRound) return
    asked.current = prepRound
    const round = prepRound
    Promise.all([loadSunapSettings(supabaseBrowser()), listStatsRxGroups()]).then(
      ([settings, groups]) => setPrep({ round, ok: true, settings, groups }),
      () => setPrep({ round, ok: false }),
    )
  }, [prepRound])

  const settings = prep?.ok ? prep.settings : null
  const groups = prep?.ok ? prep.groups : null
  const blockDef = settings && groups ? defOf(groups, settings.blockGroup) : null
  const ptDef = settings && groups ? defOf(groups, settings.ptGroup) : null
  const kinds = settings?.kinds ?? DEFAULT_RSV_KINDS

  const { load } = api
  useEffect(() => {
    if (!settings || !groups) return
    load({ day, kinds: settings.kinds, blockDef: defOf(groups, settings.blockGroup), ptDef: defOf(groups, settings.ptGroup) })
  }, [day, settings, groups, reload, load])

  const view = api.view?.day === day ? api.view : null
  const localClosed = view?.closedAt != null
  const serverClosed = server.status === 'ready' ? server.closed !== null : localClosed
  const closed = localClosed || serverClosed
  const late = server.closed?.late ?? view?.late ?? false
  const chip = serverClosed ? stateText(server.closed?.closedAt ?? view?.closedAt ?? null, late) : '마감 전'
  const editable = view !== null && !closed && !api.loading && !busy
  const unknown = view?.rows.filter((row) => row.rsv.kind === 'unknown').length ?? 0

  const changeDay = (next: string) => {
    setProblem(null)
    onDay(next)
  }

  async function closeDay() {
    if (busy || view === null) return
    setBusy(true)
    setProblem(null)
    try {
      const result = await api.close()
      if ('code' in result) return setProblem({ kind: 'code', code: codeOf(result.code, 'E-STORE-FAILED') })
      try {
        await closeSunapDay(supabaseBrowser(), result.day, result.totals, result.late)
        server.setClosed({ day: result.day, closedAt: new Date().toISOString(), late: result.late, totals: result.totals })
      } catch {
        setProblem({ kind: 'close-upload' })
      }
    } finally {
      setBusy(false)
    }
  }

  async function reopenDay() {
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      try {
        await reopenSunapDay(supabaseBrowser(), day)
      } catch {
        return setProblem({ kind: 'reopen-upload' })
      }
      server.setClosed(null)
      const result = await api.reopen()
      if ('code' in result) setProblem({ kind: 'code', code: codeOf(result.code, 'E-STORE-FAILED') })
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings(next: Settings) {
    await saveSunapSettings(supabaseBrowser(), next)
    setPrep((prev) => (prev?.ok ? { ...prev, settings: next } : prev))
    setSettingsOpen(false)
  }

  const edit = (chart: string, patch: LedgerPatch) => api.edit(chart, patch)
  const [, date] = dayTitle(day)

  return (
    <>
      <DayBar day={day} today={today} chip={chip} locked={busy} onDay={changeDay}>
        {api.loadedAt !== null && view !== null && <span className="text-small text-muted tabular-nums">{`비트에서 ${savedTimeText(api.loadedAt)} 불러옴`}</span>}
        {!serverClosed && !localClosed && (
          <button type="button" disabled={!settings || busy} aria-busy={api.loading || undefined} className={ds.button.secondary} onClick={() => setReload((n) => n + 1)}>
            비트에서 다시 불러오기
          </button>
        )}
        <button type="button" disabled={!settings} className={ds.button.secondary} onClick={() => setSettingsOpen(true)}>
          설정
        </button>
        {closed && (
          <button type="button" aria-busy={busy || undefined} className={ds.button.secondary} onClick={() => void reopenDay()}>
            마감 풀기
          </button>
        )}
        {!serverClosed && (
          <button
            type="button"
            disabled={view === null || api.loading}
            aria-busy={busy || undefined}
            className={ds.button.primary}
            onClick={() => void closeDay()}
          >
            마감하기
          </button>
        )}
      </DayBar>
      <LockLine>
        환자 이름 줄과 고친 칸은 <b className="font-semibold text-ink">이 접수 PC 안에만</b> 저장돼요. 서버에는 마감할 때 합계·비율 숫자만 올라가요.
      </LockLine>

      {prep?.ok === false && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-SETTINGS-FAILED" />
          <button type="button" aria-label="설정 다시 불러오기" className={ds.button.secondary} onClick={() => setPrepRound((n) => n + 1)}>
            다시 불러오기
          </button>
        </div>
      )}
      {problem?.kind === 'code' && <ErrorCard code={problem.code} />}
      {problem?.kind === 'close-upload' && (
        <Problem>
          <b className="font-semibold text-negative">마감 숫자를 서버에 올리지 못했어요.</b> 인터넷 연결을 확인하고 [마감하기]를 다시 눌러 주세요.
        </Problem>
      )}
      {problem?.kind === 'reopen-upload' && (
        <Problem>
          <b className="font-semibold text-negative">서버에서 마감을 풀지 못했어요.</b> 인터넷 연결을 확인하고 [마감 풀기]를 다시 눌러 주세요.
        </Problem>
      )}
      {api.error && <ErrorCard code={codeOf(api.error.code, 'E-ANALYZE-FAILED')} />}

      {serverClosed && !late && (
        <Banner tone="ok">
          <b className="font-semibold text-ink">{`${monthDay(day)} 마감했어요.`}</b> 합계·비율 숫자를 서버에 올렸어요(원장님 폰·통계에서 보여요). 예약은 지금 값으로 고정돼요. 고치려면 [마감 풀기]를 누르세요.
        </Banner>
      )}
      {serverClosed && late && (
        <Banner tone="warn">
          <b className="font-semibold text-ink">이 날은 다음 날 이후에 마감했어요.</b> 그 사이 전화로 잡은 예약도 &apos;예약함&apos;으로 들어갔을 수 있어서, 예약률이 실제보다 조금 높을 수 있어요. 통계에도 이
          표시가 같이 붙어요.
        </Banner>
      )}
      {localClosed && !serverClosed && server.status === 'ready' && problem === null && !busy && (
        <Banner tone="warn">이 PC에는 마감으로 적혔지만 서버에는 아직 올라가지 않았어요. [마감하기]를 다시 눌러 주세요.</Banner>
      )}
      {view?.unsure === true && (
        // 도우미가 매출 확인 필요 조건·음수 금액을 본 날(AC-4905.9). 마감은 막지 않는다
        <Banner tone="warn">
          <b className="font-semibold text-ink">확인 필요한 날</b> — 환불·변경수납·예치금이 있거나 수납 연결이 겹쳐서 장부 금액이 비트와 다를 수 있어요. 마감 전에 비트 수납 화면과 맞춰 보세요.
        </Banner>
      )}
      {!closed && unknown > 0 && <UnknownBanner count={unknown} />}
      {settings && (blockDef === null || ptDef === null) && <p className="text-small text-muted">설정에서 Block·물리치료 묶음을 골라 주세요</p>}

      {view === null ? (
        !api.error &&
        prep?.ok !== false && (
          <p role="status" className="rounded-control border border-line bg-surface px-5 py-6 text-small text-muted">
            비트에서 장부를 읽는 중이에요
          </p>
        )
      ) : (
        <>
          <SunapCards totals={view.totals} spends={server.spends} reserved={kinds.filter((kind) => kind.counts).map((kind) => kind.label)} />
          <LedgerRows rows={view.rows} totals={view.totals} kinds={kinds} editable={editable} closed={closed} onEdit={edit} />
          {view.doctors !== null && <DoctorTable data={view.doctors} hint={DOCTOR_HINT} />}
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <PaidRows paid={view.paid} />
            {server.status === 'ready' && (
              <SpendPanel key={server.key} day={day} spends={server.spends} editable={!closed && !busy} onSpends={server.setSpends} />
            )}
            {server.status === 'failed' && <ServerFailed date={date} onRetry={server.retry} />}
          </div>
        </>
      )}

      {settingsOpen && settings && groups && (
        <SunapSettings settings={settings} groups={groups} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  )
}

/** 마감 전 날의 종류 모름 줄 알림 띠(spec sunap-kinds AC-5503.6) */
function UnknownBanner({ count }: { count: number }) {
  return (
    <Banner tone="info">
      <b className="font-semibold text-ink">{`예약 종류 모름 ${count}줄`}</b>
      {' — 비트 예약은 있는데 메모에 설정한 말이 하나도 없어요. 다음 예약 칸을 눌러 직접 고르거나, [설정] → 다음 예약 종류에서 종류나 말을 더해 주세요.'}
    </Banner>
  )
}

function ServerFailed({ date, onRetry }: { date: string; onRetry(): void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-control border border-line bg-surface p-5">
      <Problem>
        <b className="font-semibold text-negative">{`서버에서 ${date} 지출·마감을 읽지 못했어요.`}</b> 인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요.
      </Problem>
      <button type="button" className={ds.button.secondary} onClick={onRetry}>
        다시 불러오기
      </button>
    </div>
  )
}

// ── 화면 ────────────────────────────────

const REMOTE: Partial<Record<SunapMode, RemoteReason>> = { device: 'device', 'old-helper': 'old-helper', 'old-day': 'old-day' }

function Connected({ worker, initialToday }: { worker: Worker; initialToday: string }) {
  const { state, hello, helloError, stream } = useBridge({ worker })
  const api = useSunapWorker({ stream }, worker)
  const today = initialToday
  const [day, setDay] = useState(initialToday)
  const server = useServerDay(day)
  const mode = screenMode({ state, helperVersion: hello?.helperVersion, helloError }, day, today)

  if (mode === 'connecting') return <Connecting />
  if (mode === 'ledger') return <LedgerView day={day} today={today} onDay={setDay} api={api} server={server} />
  const chip = server.status === 'ready' ? stateText(server.closed?.closedAt ?? null, server.closed?.late ?? false) : null
  return (
    <>
      <DayBar day={day} today={today} chip={chip} locked={false} onDay={setDay} />
      <RemoteView server={server} reason={REMOTE[mode] ?? 'device'} onRetry={server.retry} />
    </>
  )
}

function Connecting() {
  return (
    <p role="status" className="rounded-control border border-line bg-surface px-5 py-6 text-small text-muted">
      비트 PC 연결을 확인하는 중이에요
    </p>
  )
}

export function SunapScreen({ initialToday }: { initialToday: string }) {
  const worker = useSunapWorkerObject()
  return (
    <div className="grid gap-4 max-md:gap-3">
      <h1 className="sr-only">수납일지</h1>
      {worker ? <Connected worker={worker} initialToday={initialToday} /> : <Connecting />}
    </div>
  )
}
