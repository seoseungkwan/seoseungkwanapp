'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { GcalCallError, gcalCall, readCalendars, readNow, type GcalCalendar } from '@/lib/gcal/client'
import { makeGcalDeps } from '@/lib/gcal/deps'
import { activeGcalDeps, syncNow } from '@/lib/gcal/loop'
import { pullOnce } from '@/lib/gcal/pull'
import { pushWaiting } from '@/lib/gcal/push'
import { loadCalendarSettings } from '@/lib/storage/calendar'
import { loadClinicProfile } from '@/lib/storage/clinicProfile'
import { loadGcalLink, loadGcalState, loadGcalView, saveGcalCalendar, saveGcalConnection, saveGcalRules, unlinkGcal } from '@/lib/storage/gcal'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CalSettings } from '@/types/calendar'
import type { ClinicProfile } from '@/types/clinicProfile'
import type { GcalState, GcalView } from '@/types/gcal'
import { colorsDeps } from './colors/save'
import { StaffKinds, type SavedColors } from './colors/StaffKinds'
import { GcalConnect, type GcalCalendarAccess, type GcalCalendarInfo, type GcalConnectionInput, type GcalPingReply } from './connect/Connect'
import { GcalFrame, type GcalMenuTab, type GcalTab } from './frame/GcalFrame'
import { GCAL_HREF } from './frame/labels'
import { GcalNotice, useGcalNotice } from './frame/notice'
import { hmOf, mdwOf, parseStamp } from './frame/time'
import { ImportPreview } from './import/ImportPreview'
import { RULES_TEXT } from './rules/labels'
import { GcalRulesForm, type GcalSyncReply } from './rules/Rules'

// 설정 › 구글 캘린더 화면 묶음(spec google-link REQ-8528 AC-8528.1, REQ-8540 AC-8540.3·AC-8540.4, design.md 2절 표 9·12, 15절).
// 안 메뉴 틀(GcalFrame, TASK-17) 안에 칸 넷을 잇는다: 잇기·맞춤 방법(TASK-17), 시행자·종류(TASK-18), 가져오기 미리 보기(TASK-19).
// - 읽기: 구글 연결(비밀 글자 없음)·맞춤 상태·병원 정보·예약 설정·병원 id(my_clinic_hospital_id)를 한 번에. 읽는 중 '불러오는 중', 하나라도 못 읽으면
//   E-SETTINGS-FAILED + [다시 시도](틀 머리는 그대로).
// - 칸 고르기(주소 ?tab= → initialTab, 바꾸면 주소도 바꾼다 — 새로 그리지 않고 history.replaceState):
//   잇지 않은 병원(이은 날 없음)은 처음 잇기 차례 ① 잇기 → ② 시행자·종류 → ③ 가져오기 미리 보기로만 가고 [맞춤 방법]은 닫힌다.
//   [시행자·종류]는 캘린더를 고르기 전에도 열리고(차례 띠 없이, 표 9), ③은 캘린더를 고르고 ②를 지난 뒤에만 연다.
//   이은 병원은 처음 칸이 맞춤 방법이고 셋이 다 열리며 차례 띠가 없다. ③ 가져오기가 끝나면 다시 읽어 맞춤 방법으로 가고 그 알림을 띄운다.
// - 칸마다: 잇기 [연결 시험] = 구글 코드 ping(비밀 글자 칸이 비면 저장해 둔 것), 저장 = lib/storage/gcal. 맞춤 방법 [지금 맞추기] = 도는 맞춤(syncNow),
//   이 탭에서 맞춤이 돌지 않으면 한 번 받아 오기(pullOnce). 시행자·종류 저장 묶음 = colorsDeps(바뀐 색 보내기 = pushWaiting).
//   이은 뒤 시행자·종류 위 띠는 맞춤 방법 띠의 글(캘린더 이름·이은 날·마지막 맞춤)이다.
// - 데스크도 같은 화면(보기만 — 칸·단추 잠금은 각 칸이 useDesk로 한다). 화면 뿌리가 그 병원 캘린더 기본 색으로 --cal-default를 덮는다. PC 화면만

type Data = { view: GcalView | null; state: GcalState; profile: ClinicProfile | null; settings: CalSettings; hospitalId: string }
type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; data: Data }
type Client = ReturnType<typeof supabaseBrowser>

const LOADING = '불러오는 중'
const RETRY = '다시 시도'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX = /^#[0-9A-F]{6}$/i
const ACCESS: readonly GcalCalendarAccess[] = ['owner', 'writer', 'reader', 'freeBusyReader']
const ALL_TABS: readonly GcalMenuTab[] = ['connect', 'colors', 'rules']
const NO_TABS: readonly GcalMenuTab[] = []
const FIRST_CLOSED: readonly GcalMenuTab[] = ['rules']

async function hospitalIdOf(client: Client): Promise<string | null> {
  const { data, error } = await client.rpc('my_clinic_hospital_id')
  return !error && typeof data === 'string' && UUID.test(data) ? data : null
}

async function readAll(client: Client): Promise<Data | null> {
  const [view, state, profile, settings, hospitalId] = await Promise.all([
    loadGcalView(client),
    loadGcalState(client),
    loadClinicProfile(client),
    loadCalendarSettings(client),
    hospitalIdOf(client),
  ])
  if (profile === 'failed' || hospitalId === null) return null
  return { view, state, profile, settings, hospitalId }
}

const linkedOf = (view: GcalView | null) => view?.linkedOn != null
const chosenOf = (view: GcalView | null) => view?.calendarId != null

/** 고른 칸(주소·단추) → 지금 연결 차례에 맞는 칸 */
function pickTab(asked: GcalTab | null, view: GcalView | null, colorsDone: boolean): GcalTab {
  if (linkedOf(view)) return asked === null || asked === 'import' ? 'rules' : asked
  if (asked === 'colors') return 'colors'
  if (asked === 'import') return chosenOf(view) ? (colorsDone ? 'import' : 'colors') : 'connect'
  return 'connect'
}

/** ping 답의 캘린더 줄 → 잇기 칸이 받는 꼴(모르는 권한은 보기만, 색·수가 없으면 빈 값 — 칸이 다시 거른다) */
const infoOf = (c: GcalCalendar): GcalCalendarInfo => ({
  id: c.id,
  name: c.name,
  access: ACCESS.includes(c.access as GcalCalendarAccess) ? (c.access as GcalCalendarAccess) : 'reader',
  hex: c.hex ?? '',
  past: c.past ?? 0,
  future: c.future ?? 0,
})
const pingFail = (code: string): GcalPingReply => ({ ok: false, code, error: code })

/** 이은 뒤 시행자·종류 위 띠: 맞춤 방법 띠와 같은 글(단추는 맞춤 방법 칸에만) */
function LinkedBand({ view, lastOkAt }: { view: GcalView; lastOkAt: string | null }) {
  const lastAt = lastOkAt === null ? null : parseStamp(lastOkAt)
  const linkedOn = view.linkedOn ?? ''
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border border-positive-soft bg-positive-soft px-3.5 py-3 text-small text-ink-2">
      <p className="flex items-center">
        <span aria-hidden="true" className="mr-1.5 inline-block size-2 shrink-0 rounded-full bg-positive" />
        <span>
          {RULES_TEXT.bandHead}
          <b className="font-semibold text-ink">{view.calendarName ?? ''}</b>
          {`${RULES_TEXT.bandSince(mdwOf(linkedOn))}${lastAt === null ? '' : RULES_TEXT.bandLast(hmOf(lastAt))}`}
        </span>
      </p>
    </div>
  )
}

function Ready({
  client,
  data,
  tab,
  setAsked,
  setColorsDone,
  refresh,
  onSaved,
  say,
}: {
  client: Client
  data: Data
  tab: GcalTab
  setAsked(tab: GcalTab): void
  setColorsDone(done: boolean): void
  refresh(): Promise<void>
  onSaved(saved: SavedColors): void
  say(text: string): void
}) {
  const { view, state, profile, settings, hospitalId } = data
  const gcalDeps = useMemo(() => makeGcalDeps({ client, hospitalId, call: gcalCall }), [client, hospitalId])
  const kindsDeps = useMemo(() => colorsDeps(client, () => pushWaiting(activeGcalDeps() ?? gcalDeps)), [client, gcalDeps])

  /** 비밀 글자 칸이 비면(null) 저장해 둔 것. 저장한 것도 없으면 null */
  const secretOf = useCallback(async (secret: string | null) => (secret !== null ? secret : ((await loadGcalLink(client))?.secret ?? null)), [client])

  const ping = useCallback(
    async (input: GcalConnectionInput): Promise<GcalPingReply> => {
      try {
        const secret = await secretOf(input.secret)
        if (secret === null) return pingFail('E-GCAL-NOKEY')
        const reply = await gcalCall({ scriptUrl: input.scriptUrl, secret }, 'ping')
        const now = readNow(reply)
        return { ok: true, version: reply.version, ...(now === null ? {} : { now }), calendars: readCalendars(reply).map(infoOf) }
      } catch (e) {
        return pingFail(e instanceof GcalCallError ? e.code : 'E-GCAL-REACH')
      }
    },
    [secretOf],
  )

  const saveConnection = useCallback(
    async (input: GcalConnectionInput): Promise<void | 'invalid'> => {
      const secret = await secretOf(input.secret)
      if (secret === null) return 'invalid'
      return saveGcalConnection(client, { scriptUrl: input.scriptUrl, secret })
    },
    [client, secretOf],
  )

  const syncRules = useCallback(async (): Promise<GcalSyncReply> => {
    const done = await syncNow()
    if (done.ok) return { ok: true, changed: done.changed }
    if (done.code !== null) return { ok: false, code: done.code }
    // 이 탭에서 맞춤이 돌지 않는다(다른 탭이 돌거나 아직 시작 전) → 한 번 받아 오기
    const pulled = await pullOnce(gcalDeps)
    return pulled.ok ? { ok: true, changed: pulled.changed } : { ok: false, code: pulled.code ?? 'E-GCAL-REACH' }
  }, [gcalDeps])

  const unlink = useCallback(async () => {
    await unlinkGcal(client)
    setColorsDone(false)
    await refresh()
    setAsked('connect')
  }, [client, refresh, setAsked, setColorsDone])

  const linked = linkedOf(view)
  switch (tab) {
    case 'connect':
      return (
        <GcalConnect
          view={view}
          ping={ping}
          saveConnection={saveConnection}
          saveCalendar={(input) => saveGcalCalendar(client, input)}
          onNext={() => {
            setAsked('colors')
            void refresh()
          }}
        />
      )
    case 'colors':
      return (
        <StaffKinds
          profile={profile}
          settings={settings}
          link={view}
          deps={kindsDeps}
          band={linked && view !== null ? <LinkedBand view={view} lastOkAt={state.lastOkAt} /> : undefined}
          onBack={() => setAsked('connect')}
          onNext={() => {
            setColorsDone(true)
            setAsked('import')
          }}
          onSaved={onSaved}
        />
      )
    case 'import':
      return (
        <ImportPreview
          deps={gcalDeps}
          onBack={() => setAsked('colors')}
          onDone={({ notice }) => {
            say(notice)
            void refresh().then(() => setAsked('rules'))
          }}
        />
      )
    case 'rules':
      return view === null ? null : (
        <GcalRulesForm
          view={view}
          lastOkAt={state.lastOkAt}
          saveRules={(rules) => saveGcalRules(client, rules)}
          syncNow={syncRules}
          unlink={unlink}
          onChangeCalendar={() => setAsked('connect')}
        />
      )
  }
}

export function GcalSettingsScreen({ initialTab }: { initialTab: GcalTab | null }) {
  const client = useMemo(() => supabaseBrowser(), [])
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [tries, setTries] = useState(0)
  const [asked, setAsked] = useState<GcalTab | null>(initialTab)
  const [colorsDone, setColorsDone] = useState(false)
  const { notice, say } = useGcalNotice()

  useEffect(() => {
    let alive = true
    readAll(client).then(
      (data) => alive && setLoad(data === null ? { kind: 'failed' } : { kind: 'ready', data }),
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

  /** 연결·맞춤 상태만 조용히 다시 읽는다(읽지 못하면 지금 값 그대로) */
  const refresh = useCallback(async () => {
    try {
      const [view, state] = await Promise.all([loadGcalView(client), loadGcalState(client)])
      setLoad((prev) => (prev.kind === 'ready' ? { kind: 'ready', data: { ...prev.data, view, state } } : prev))
    } catch {
      // 다음에 다시 읽는다
    }
  }, [client])

  const onSaved = useCallback(({ profile, kinds, look }: SavedColors) => {
    setLoad((prev) => {
      if (prev.kind !== 'ready') return prev
      const { data } = prev
      return { kind: 'ready', data: { ...data, profile, settings: { ...data.settings, kinds }, view: data.view === null ? null : { ...data.view, look } } }
    })
  }, [])

  const ready = load.kind === 'ready'
  const view = ready ? load.data.view : null
  const tab = ready ? pickTab(asked, view, colorsDone) : asked === 'import' ? 'connect' : (asked ?? 'connect')
  const linked = linkedOf(view)

  // 고른 칸을 주소에 적는다(새로 그리지 않음 — 다시 열면 그 칸). 칸을 그리는 것과 같은 때(그린 뒤 미루지 않음)
  useLayoutEffect(() => {
    if (ready) window.history.replaceState(null, '', `${GCAL_HREF}?tab=${tab}`)
  }, [ready, tab])

  const hex = view !== null && HEX.test(view.defaultHex) ? view.defaultHex : null
  const rootStyle = hex === null ? undefined : ({ '--cal-default': hex } as CSSProperties)

  return (
    <div style={rootStyle}>
      <GcalFrame
        tab={tab}
        firstRun={ready && !linked && (tab === 'connect' || chosenOf(view))}
        onTab={setAsked}
        closedTabs={!ready ? ALL_TABS : linked ? NO_TABS : FIRST_CLOSED}
      >
        {load.kind === 'loading' && (
          <p role="status" className="text-small text-muted">
            {LOADING}
          </p>
        )}
        {load.kind === 'failed' && (
          <div className="flex flex-col items-start gap-3">
            <ErrorCard code="E-SETTINGS-FAILED" />
            <button type="button" onClick={retry} className={ds.button.secondary}>
              {RETRY}
            </button>
          </div>
        )}
        {load.kind === 'ready' && (
          <Ready
            client={client}
            data={load.data}
            tab={tab}
            setAsked={setAsked}
            setColorsDone={setColorsDone}
            refresh={refresh}
            onSaved={onSaved}
            say={say}
          />
        )}
      </GcalFrame>
      <GcalNotice notice={notice} />
    </div>
  )
}
