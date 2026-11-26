'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { useBridge, type UseBridge } from '@/components/claim/useBridge'
import { useClinicProfile } from '@/components/clinic/useClinicProfile'
import { ErrorCard } from '@/components/common/ErrorCard'
import { SunapScreen } from '@/components/sunap/SunapScreen'
import { ds } from '@/components/ui/classes'
import { compareVersions } from '@/lib/bridge/handshake'
import { BridgeError } from '@/lib/bridge/protocol'
import { SHEET_EXTENSION, SHEET_HELPER } from '@/lib/bridge/versions'
import { readStatus } from '@/lib/gsheet/reply'
import { runFill, type FillOutcome, type SheetCall } from '@/lib/gsheet/runner'
import type { FillJob } from '@/lib/gsheet/shapes'
import { fillStatus } from '@/lib/gsheet/status'
import { addGsheetRun, listGsheetMonths, listGsheetRuns, loadGsheetSettings, upsertGsheetMonths } from '@/lib/storage/gsheet'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { BridgeState, SheetCommand } from '@/types/bridge'
import type { GsheetMonth, GsheetRun, GsheetSaved } from '@/types/gsheet'
import { SheetGuide } from './settings/SheetGuide'
import { SheetSettings } from './settings/SheetSettings'
import { SheetView } from './view/SheetView'

// 수납일지 탭 묶음(spec google-link REQ-8514 AC-8514.1, design.md 15절 '수납', 시안 docs/mockups/google-link/sunap.html tabHead).
// 탭 머리 두 칸 고르기 [구글 시트] [웹앱 수납일지](tablist '수납일지 보기', 기본 [구글 시트], 원장·데스크 같음):
// - [구글 시트]: 숨은 제목 '수납일지' + TASK-15 보기(SheetView). 그 안 [설정]·[설정 열기]는 탭 본문을 TASK-16 설정(SheetSettings)으로,
//   [안내문 보기]는 안내문(SheetGuide)으로 바꾼다. 앱 폭 제한을 풀고(data-wide-page) 틀이 탭 높이를 다 쓴다.
// - [웹앱 수납일지]: 지금 수납일지 화면(SunapScreen) 그대로(제목은 그 화면이 그린다 — 제목 두 개가 되지 않게 이 묶음의 숨은 제목은 빠진다).
// 고른 칸은 저장하지 않는다(탭을 다시 열면 [구글 시트]). 두 칸은 통로를 따로 연다(보이는 칸만 그려지므로 한 번에 하나만 붙는다).
// 구글 시트 칸 잇기:
// - 서버 설정·달 목록·최근 7일 넣기 기록을 읽어 보기에 넘긴다(읽는 중 '불러오는 중', 실패면 E-SETTINGS-FAILED + [다시 시도]).
// - 통로는 Worker 없이(useBridge — 수납 명령은 숫자 답뿐) 열고, 도우미 부르기는 hello가 끝날 때까지 기다린 뒤 보낸다. 도우미 < SHEET_HELPER 또는
//   확장 < SHEET_EXTENSION이면 sheet.*를 보내지 않고 E-GSHEET-EXT(AC-8541.2), 통로가 붙지 않았으면 그 상태의 오류 번호로 끝난다.
// - 통로가 정해지면 넣기 상태(lib/gsheet/status)에 이 PC를 적는다: 옛 판 → 보기만 + 옛 판 표시, 도우미·확장 없음 → 보기만,
//   준비됨 → sheet.status 한 번(도우미 비밀 글자 표시 = 서버 secret_tag면 넣는 PC, 함께 쓸 메일 수는 새 달 알림에). 앱 틀의 저절로 넣기도 같은 일을 한다.
// - [지금 넣기]·[덮어쓰기…](onFill)는 lib/gsheet/runner runFill(이 칸 통로·서버 설정·넣는 PC 표시·기록 저장) — 넣는 PC가 아니라는 답이면 보기만으로.
// - 넣기가 새 달 파일을 만들었으면(목록에 없는 달) 달 목록을 다시 읽어 틀이 새 파일을 연다.
// 환자 값은 이 묶음을 거치지 않는다(숫자·표시·파일 id만). PC 화면만(폰 전용 모양 없음)

type SunapView = 'sheet' | 'webapp'

const VIEWS: readonly { key: SunapView; label: string }[] = [
  { key: 'sheet', label: '구글 시트' },
  { key: 'webapp', label: '웹앱 수납일지' },
]
const TABLIST_LABEL = '수납일지 보기'
const TITLE = '수납일지'
const LOADING = '불러오는 중'
const RETRY = '다시 시도'
const RUNS_DAYS = 7
const DAY_MS = 24 * 60 * 60_000
const OLD = 'E-GSHEET-EXT'

// 시안 .tabhead · .pseg: 칸 사이 12px, 두 칸 고르기(1px line-strong 테두리 · 좌우 14px · small 500, 고른 칸 accent-soft · accent-strong 600)
const segGroup = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface'
const segButton =
  'h-7.5 cursor-pointer border-l border-line-strong px-3.5 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const segOn = 'bg-accent-soft font-semibold text-accent-strong'
const segOff = 'bg-surface font-medium text-ink-2 transition hover:bg-canvas'
// 구글 시트 칸: 머리 57px · 탭 줄 45px · 본문 위 24px · 아래 48px을 뺀 높이를 다 쓴다(틀은 가장 작아도 520px — SheetView)
const SHEET_ROOT = 'flex min-h-[calc(100dvh-174px)] flex-col gap-2.5'
const WEB_ROOT = 'flex flex-col gap-3'

/** 통로 상태 → 도우미 부르기 오류 번호(붙지 않음) */
const STATE_CODE: Partial<Record<BridgeState, string>> = {
  'no-extension': 'E-EXT-MISSING',
  'no-helper': 'E-HELPER-MISSING',
  busy: 'E-BRIDGE-BUSY',
  'update-helper': OLD,
  'update-extension': OLD,
  disconnected: 'E-BRIDGE-DISCONNECTED',
}

const isOld = (version: string | undefined, min: string) => typeof version !== 'string' || compareVersions(version, min) < 0
/** hello를 기다리는 중(상태가 정해지지 않았고 hello 오류도 없음) */
const connecting = (bridge: Pick<UseBridge, 'state' | 'helloError'>) => bridge.state === 'connecting' && bridge.helloError === null
const oldOf = (bridge: Pick<UseBridge, 'hello'>) => ({
  helper: isOld(bridge.hello?.helperVersion, SHEET_HELPER),
  extension: isOld(bridge.hello?.extensionVersion, SHEET_EXTENSION),
})

/** 이 칸 통로로 도우미 수납 명령을 부르는 함수(언제나 같은 함수). 붙는 중이면 정해질 때까지 기다린다 */
function useSheetCall(bridge: UseBridge): SheetCall {
  const latest = useRef(bridge)
  const waiting = useRef<(() => void)[]>([])
  useEffect(() => {
    latest.current = bridge
    if (connecting(bridge)) return
    const wake = waiting.current
    waiting.current = []
    for (const resume of wake) resume()
  })
  return useCallback(async (cmd: string, args: Record<string, unknown>) => {
    if (connecting(latest.current)) await new Promise<void>((resume) => waiting.current.push(resume))
    const now = latest.current
    if (now.state !== 'ready') throw new BridgeError(now.helloError ?? STATE_CODE[now.state] ?? 'E-BRIDGE-DISCONNECTED')
    const old = oldOf(now)
    if (old.helper || old.extension) throw new BridgeError(OLD)
    return now.call(cmd as SheetCommand, args as never)
  }, [])
}

type Sheet = { saved: GsheetSaved; months: GsheetMonth[]; runs: GsheetRun[] }
type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; sheet: Sheet }
type Client = ReturnType<typeof supabaseBrowser>

async function readSheet(client: Client): Promise<Sheet> {
  const from = new Date(Date.now() - RUNS_DAYS * DAY_MS).toISOString()
  const [saved, months, runs] = await Promise.all([loadGsheetSettings(client), listGsheetMonths(client), listGsheetRuns(client, from)])
  return { saved, months, runs }
}

const lastNow = () => fillStatus.get().last
const lastOnServer = () => null

/** [구글 시트] 칸: 보기 · 설정 · 안내문 */
function SheetTab() {
  const client = useMemo(() => supabaseBrowser(), [])
  const bridge = useBridge()
  const call = useSheetCall(bridge)
  const { name: hospitalName } = useClinicProfile()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [tries, setTries] = useState(0)
  const [screen, setScreen] = useState<'view' | 'settings' | 'guide'>('view')
  const [shareCount, setShareCount] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    readSheet(client).then(
      (sheet) => alive && setLoad({ kind: 'ready', sheet }),
      () => alive && setLoad({ kind: 'failed' }),
    )
    return () => {
      alive = false
    }
  }, [client, tries])
  const retry = () => {
    setLoad({ kind: 'loading' })
    setTries((n) => n + 1)
  }

  const ready = load.kind === 'ready'
  const secretTag = ready ? load.sheet.saved.secretTag : null

  // 통로가 정해지면 이 PC를 넣기 상태에 적는다(옛 판·없음은 sheet.*를 부르지 않는다)
  const { state, hello, helloError } = bridge
  useEffect(() => {
    if (!ready || connecting({ state, helloError })) return
    if (state === 'update-helper' || state === 'update-extension') {
      fillStatus.setPc('viewer', { helper: state === 'update-helper', extension: state === 'update-extension' })
      return
    }
    if (state === 'no-extension' || state === 'no-helper') {
      fillStatus.setPc('viewer')
      return
    }
    if (state !== 'ready') return
    const old = oldOf({ hello })
    if (old.helper || old.extension) {
      fillStatus.setPc('viewer', old)
      return
    }
    let alive = true
    call('sheet.status', {}).then(
      (data) => {
        if (!alive) return
        const status = readStatus(data)
        const filler = status !== null && status.secretTag !== null && status.secretTag === secretTag
        fillStatus.setPc(filler ? 'filler' : 'viewer')
        setShareCount(filler ? status.pinned.shareWith.length : null)
      },
      () => undefined, // 묻지 못하면 앱 틀의 저절로 넣기가 다음 차례에 다시 묻는다
    )
    return () => {
      alive = false
    }
  }, [ready, state, hello, helloError, secretTag, call])

  // 넣기가 새 달 파일을 만들었으면(목록에 없는 달) 달 목록을 다시 읽는다 — 끝난 넣기마다 한 번만
  const last = useSyncExternalStore(fillStatus.subscribe, lastNow, lastOnServer)
  const refreshedFor = useRef<string | null>(null)
  const months = ready ? load.sheet.months : null
  useEffect(() => {
    if (months === null || last === null || last.outcome === 'fail' || refreshedFor.current === last.at) return
    if (months.some((m) => m.ym === last.day.slice(0, 7))) return
    refreshedFor.current = last.at
    listGsheetMonths(client).then(
      (next) => setLoad((prev) => (prev.kind === 'ready' ? { kind: 'ready', sheet: { ...prev.sheet, months: next } } : prev)),
      () => undefined,
    )
  }, [client, last, months])

  const saved = ready ? load.sheet.saved : null
  const onFill = useCallback(
    async (job: FillJob): Promise<FillOutcome> => {
      if (saved === null) return { kind: 'busy' }
      const out = await runFill(
        {
          call,
          store: { addRun: (run) => addGsheetRun(client, run), upsertMonths: (list) => upsertGsheetMonths(client, list) },
          now: () => new Date(),
          settings: saved.settings,
          secretTag: saved.secretTag,
        },
        job,
      )
      if (out.kind === 'viewer') fillStatus.setPc('viewer')
      return out
    },
    [call, client, saved],
  )

  if (load.kind === 'loading') {
    return (
      <p role="status" className="text-small text-muted">
        {LOADING}
      </p>
    )
  }
  if (load.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorCard code="E-SETTINGS-FAILED" />
        <button type="button" onClick={retry} className={ds.button.secondary}>
          {RETRY}
        </button>
      </div>
    )
  }
  const { sheet } = load
  if (screen === 'guide') return <SheetGuide onClose={() => setScreen('view')} />
  if (screen === 'settings') {
    return (
      <SheetSettings
        client={client}
        call={call}
        saved={sheet.saved}
        onChanged={(next) => setLoad({ kind: 'ready', sheet: { ...sheet, saved: next } })}
        onClose={() => setScreen('view')}
      />
    )
  }
  return (
    <SheetView
      saved={sheet.saved}
      months={sheet.months}
      runs={sheet.runs}
      hospitalName={hospitalName}
      shareCount={shareCount}
      onFill={onFill}
      onOpenSettings={() => setScreen('settings')}
      onOpenGuide={() => setScreen('guide')}
    />
  )
}

export function SunapTab({ initialToday }: { initialToday: string }) {
  const [view, setView] = useState<SunapView>('sheet')
  const baseId = useId()
  const tabId = (key: SunapView) => `${baseId}-tab-${key}`
  const panelId = `${baseId}-panel`
  const tabRefs = useRef<Partial<Record<SunapView, HTMLButtonElement | null>>>({})

  // 화살표 키로 옆 칸을 고르고 그 칸으로 초점을 옮긴다(두 칸이라 왼쪽·오른쪽 모두 다른 칸)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const at = VIEWS.findIndex((v) => v.key === view)
    const next = VIEWS[(at + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length]!.key
    setView(next)
    tabRefs.current[next]?.focus()
  }

  const sheet = view === 'sheet'
  return (
    <div data-wide-page={sheet ? '' : undefined} className={sheet ? SHEET_ROOT : WEB_ROOT}>
      <div className="flex flex-none items-center gap-3">
        {sheet && <h1 className="sr-only">{TITLE}</h1>}
        <div role="tablist" aria-label={TABLIST_LABEL} className={segGroup}>
          {VIEWS.map(({ key, label }) => (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el
              }}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-selected={view === key}
              aria-controls={panelId}
              tabIndex={view === key ? 0 : -1}
              onClick={() => setView(key)}
              onKeyDown={onKey}
              className={`${segButton} ${view === key ? segOn : segOff}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(view)} className={sheet ? 'flex min-h-0 flex-1 flex-col' : undefined}>
        {sheet ? <SheetTab /> : <SunapScreen initialToday={initialToday} />}
      </div>
    </div>
  )
}
