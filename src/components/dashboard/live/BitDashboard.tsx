'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useClinicProfile } from '@/components/clinic/useClinicProfile'
import { AiBrief } from '@/components/dashboard/ai/AiBrief'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { InventoryAlertCard } from '@/components/dashboard/inventory/InventoryAlertCard'
import { NoticesCard } from '@/components/dashboard/notices/NoticesCard'
import { DailySection, sentenceNote } from '@/components/dashboard/summary/DailySection'
import { DashboardAnalysis, type DashboardAnalysisProps } from '@/components/dashboard/summary/DashboardAnalysis'
import { FlowSection } from '@/components/dashboard/summary/FlowSection'
import { ReportBlock } from '@/components/dashboard/summary/ReportBlock'
import { isConnected, type OlderDays, type SummarySource } from '@/components/dashboard/summary/source'
import type { ChromeRuntimeLike } from '@/types/bridge'
import type { Honorific } from '@/types/clinicProfile'
import type { ErrorCode } from '@/types/errors'
import type { DayPayload } from '@/types/payload'
import { createStatsWorker } from '@/workers/statsClient'
import { DateControl, inDateRange } from './DateControl'
import { BIT_IN_USE, ReadFailed, ReadingBlock, RereadAlert, SavedRefreshAlert, StatusHeader, UnreadableNote, type SavedRefresh } from './ReadStatus'
import { readBitDays, type ReadResult } from './readBitDays'
import type { DashboardGroups } from './rxGroups'

// 비트에서 읽어 대시보드를 그리는 화면 (bit-dashboard REQ-601, design.md '### 화면', 시안 docs/mockups/bit-dashboard/gen.py state_body).
// 서버가 그린 첫 모양은 initial 그대로이고, 효과 안에서 chrome.runtime이 있을 때만 읽는다. 화면 상태에는 일 숫자만 담고 서버로 아무것도 보내지 않는다(AC-601.9).
// 고른 날은 여기 상태 하나다(design.md '### 날짜 고르기'). 주소·저장소에 두지 않아 새로 열면 오늘이고, 이미 읽은 숫자로 그려 비트를 다시 읽지 않는다(AC-605.6)
// 통계 탭 묶음(groups)은 LiveDashboard가 읽어 넘긴다. 비트 읽기에 묶음 정의를 싣고(AC-606.7), 처방 상위는 그 묶음으로 센다(AC-606.1·AC-606.5).
// 묶음을 아직 읽는 중('pending')이면 저장 숫자로 먼저 그리고 비트 읽기만 묶음이 끝날 때까지 미룬다(dashboard-ux AC-2701.2).
// 숫자가 있으면 머리 줄(StatusHeader)이 상태 표시·시각 글·읽기 단추([저장된 숫자 새로고침]·[비트에서 다시 읽기] 또는 연결 안내)를 맡는다(AC-2701.3·AC-2701.7).
// 저장 숫자 새로고침은 LiveDashboard가 읽고(savedRefresh), 새 처음 자료가 오면 다시 놓지 않고 화면 숫자만 바꾼다(AC-2701.8). 화면 차례는 머리 줄 → 일별 현황(기준일·숫자 칸·보고 문장) → AI 요약 → 기간별 흐름이다(AC-2707.2)
// 병원 호칭(clinic-profile AC-6606.3)은 여기서 useClinicProfile을 한 번 불러 보고 받는 사람 글(숫자 줄 아래 안내 줄·AI 요약 만들기 안내)에 넘긴다.
// 읽는 중·실패면 기본값 '원장님'이다(서버 그림도 '원장님'이라 첫 그림이 어긋나지 않는다)
// 쓰는 EMR(emr-choice AC-7103.1·AC-7103.2, design.md 4절)도 같은 결과에서 받아 DashboardHome에 넘긴다. 병원 정보를 읽었을 때만 그 값이고, 읽는 중·실패는 'bit'(지금 그대로)
// 재고 칸(spec inventory AC-7512.4, design.md 6절 TASK-15)은 비트 자료와 상관없이 놓는다: 숫자가 있으면 보고 문장을 InventoryAlertCard로 감싸 오른쪽(9~12)에,
// 숫자가 없는 모양(연결 전·읽는 중·실패)이면 DashboardHome 앞(대시보드 내용 맨 위)에. 알림이 없으면 칸이 그리지 않아 지금 그대로다.
// LiveDashboard가 저장 숫자 오류 카드 위에 이미 둔 때는 inventoryOnTop={false}로 맨 위 칸을 빼 한 화면에 하나다

/** 묶음을 주지 않으면 묶음 없음 */
const NO_GROUPS: DashboardGroups = { lines: [], defs: [] }

/** 비트 읽기에 실을 묶음 정의. 읽지 못함(null)·읽는 중은 빈 목록이다(읽는 중에는 읽기를 시작하지 않는다) */
const defsOf = (groups: DashboardGroups | null | 'pending') => (groups === null || groups === 'pending' ? [] : groups.defs)

/** 물리치료 칸 열쇠(desk-feedback AC-6302.3). 묶음을 읽지 못함·읽는 중이면 모름(undefined → '자료 없음'), 아니면 groups.pt 그대로(null = 안 고름) */
const ptKeyOf = (groups: DashboardGroups | null | 'pending') => (groups === null || groups === 'pending' ? undefined : groups.pt)

type Status =
  | { kind: 'idle' } // 숫자 없음, 읽지도 않음: 연결 전 모양
  | { kind: 'reading' } // 숫자 없이 처음 읽는 중
  | { kind: 'failed'; code: ErrorCode } // 숫자 없이 실패
  /** readAt: 비트에서 읽은 시각(저장 숫자면 null). reading: 숫자를 둔 채 다시 읽는 중. code: 다시 읽기 실패. unreadable: 직접 눌렀는데 이 PC에서 읽을 수 없음 */
  | { kind: 'data'; days: readonly DayPayload[]; readAt: number | null; reading: boolean; code: ErrorCode | null; unreadable: boolean }

function firstStatus(initial: SummarySource): Status {
  return isConnected(initial) ? { kind: 'data', days: initial.days, readAt: null, reading: false, code: null, unreadable: false } : { kind: 'idle' }
}

function startRead(status: Status): Status {
  return status.kind === 'data' ? { ...status, reading: true, code: null, unreadable: false } : { kind: 'reading' }
}

function finishRead(status: Status, result: ReadResult, now: number, pressed: boolean): Status {
  if (result.kind === 'days') return { kind: 'data', days: result.days, readAt: now, reading: false, code: null, unreadable: false }
  const code = result.kind === 'failed' ? result.code : null
  if (status.kind === 'data') return { ...status, reading: false, code, unreadable: code === null && pressed }
  return code === null ? { kind: 'idle' } : { kind: 'failed', code }
}

/** 크롬은 우리 확장(externally_connectable)이 있는 PC 크롬에서만 웹 페이지에 chrome.runtime을 준다 */
function chromeRuntime(): ChromeRuntimeLike | undefined {
  return (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime
}

// 이 브라우저에서 비트를 읽을 수 있는지(chrome.runtime 있음, AC-2701.7). 서버 그림은 모르므로 false(연결 안내)이고 붙은 뒤에 바꾼다(어긋남 없음).
// 페이지가 떠 있는 동안 확장이 생기거나 없어지는 것은 따라가지 않는다(새로 열면 다시 본다)
const noSubscribe = () => () => {}
const hasRuntime = () => chromeRuntime() !== undefined
const serverHasRuntime = () => false

/** 새 처음 자료(저장 숫자 새로고침 성공, AC-2701.8): 화면 숫자가 저장 숫자일 때만 그 숫자로 바꾼다. 비트에서 읽은 숫자는 그대로 둔다 */
function adoptSaved(status: Status, initial: SummarySource): Status {
  return status.kind === 'data' && status.readAt === null && isConnected(initial) ? { ...status, days: initial.days } : status
}

// 상태별 칩·숫자 칸 글(design.md '### 화면', 시안 today_sec·flow_empty)
type EmptyLook = Pick<DashboardAnalysisProps, 'emptyChip' | 'emptyText' | 'emptyNote' | 'gainsTitle' | 'gainsNote' | 'gainsRevisitDesc' | 'emptyCharts'>
const GAINS_OF_READING: EmptyLook = {
  gainsTitle: '읽기가 끝나면 생기는 것 4가지',
  gainsNote: '읽기가 끝나면 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.',
  gainsRevisitDesc: '처음 온 환자가 7·14일 안에 다시 온 비율이에요.', // 30일 줄은 아직 값이 없다(시안 '바뀌는 곳')
}
const readingLook = (honorific: Honorific): EmptyLook => ({
  ...GAINS_OF_READING,
  emptyChip: '읽는 중',
  emptyText: '읽는 중',
  emptyNote: sentenceNote('읽기가 끝나면', honorific),
})
const FAILED_LOOK: EmptyLook = { ...GAINS_OF_READING, emptyChip: '읽지 못함', emptyText: '읽지 못했어요', emptyNote: null }
const IN_USE_LOOK: EmptyLook = { ...GAINS_OF_READING, emptyChip: '기다리는 중', emptyText: '아직 못 읽었어요', emptyNote: null }
// 읽기는 성공했는데 일 숫자가 없음(AC-601.11): 연결 전 모양으로 돌아가지 않는다
const NO_DAYS_LOOK: EmptyLook = { emptyChip: '자료 없음', emptyText: '자료 없음', emptyNote: null, emptyCharts: true }

// 연결 전(idle)은 DailySection 기본 글('연결하면 …')과 같은 글에 호칭만 넣는다
function emptyLook(status: Status, honorific: Honorific): EmptyLook {
  if (status.kind === 'reading') return readingLook(honorific)
  if (status.kind === 'failed') return status.code === BIT_IN_USE ? IN_USE_LOOK : FAILED_LOOK
  return status.kind === 'data' ? NO_DAYS_LOOK : { emptyNote: sentenceNote('연결하면', honorific) }
}

/**
 * onBitLoaded: 비트 읽기가 일 숫자(days, 빈 배열 포함)로 끝날 때 부른다. LiveDashboard가 저장 숫자 오류 카드를 거두는 때다(AC-601.19).
 * groups: 통계 탭 묶음. 주지 않으면 묶음 없음, null = 묶음을 읽지 못함(비트 읽기는 묶음 없이, 처방 상위는 AC-606.5 글),
 * 'pending' = 묶음을 읽는 중(처방 상위는 "묶음을 읽는 중", 비트 읽기는 묶음이 끝날 때 한 번 시작한다. 그때 다시 놓지 않는다 — AC-2701.2).
 * savedAt: 처음 자료(저장 숫자)의 마지막 저장 시각(readDays latest.at). 머리 줄 시각 글에 쓴다(AC-2701.3). 없으면 null
 * older: 기간별 흐름의 옛 기간 읽기(dashboard-period REQ-1804, LiveDashboard가 저장 숫자로 만든다). 받은 그대로 source 안에 넣는다.
 * 비트 읽기(stats.rows, 오늘 − 100 ~ 오늘)는 지금처럼 열 때와 [비트에서 다시 읽기]에만 하고, 기간을 골라도 하지 않는다(AC-1804.4)
 * savedRefresh: 저장 숫자 새로고침(LiveDashboard가 읽는 중·실패와 누름을 준다, AC-2701.7·AC-2701.8). 주지 않으면 그 단추가 없다.
 * initial이 새 값으로 바뀌면(새로고침 성공) 다시 놓지 않고 화면 숫자만 바꾼다 — 고른 날·AI 요약이 그대로이고 비트 읽기를 새로 시작하지 않는다
 * inventoryOnTop: 숫자가 없는 모양에서 재고 칸을 맨 위에 둔다(기본 참). LiveDashboard가 오류 카드 위에 이미 둘 때 거짓(AC-7512.4)
 * notice: 맨 위 줄 바로 아래 알림(contacts AC-6507.1, 무상 수리). LiveDashboard가 읽어 넘기고 여기서는 DashboardHome에 그대로 넘기기만 한다(읽지 않음)
 * locationNotice: notice 바로 아래 새 경쟁 의원 알림(location AC-7915.2, 관리자만). notice와 같이 LiveDashboard가 읽어 넘기고 그대로 넘기기만 한다(읽지 않음)
 */
export function BitDashboard({
  today,
  initial,
  groups = NO_GROUPS,
  savedAt = null,
  older,
  onBitLoaded,
  savedRefresh,
  inventoryOnTop = true,
  notice,
  locationNotice,
}: {
  today: string
  initial: SummarySource
  groups?: DashboardGroups | null | 'pending'
  savedAt?: string | null
  older?: OlderDays
  onBitLoaded?: () => void
  savedRefresh?: SavedRefresh
  inventoryOnTop?: boolean
  notice?: ReactNode
  locationNotice?: ReactNode
}) {
  const [status, setStatus] = useState(() => firstStatus(initial))
  // 새 처음 자료가 오면(저장 숫자 새로고침 성공) 그리는 중에 상태를 맞춘다 — 다시 놓지 않는다(AC-2701.8)
  const [shownInitial, setShownInitial] = useState(initial)
  if (shownInitial !== initial) {
    setShownInitial(initial)
    setStatus((current) => adoptSaved(current, initial))
  }
  const bitReadable = useSyncExternalStore(noSubscribe, hasRuntime, serverHasRuntime)
  const clinic = useClinicProfile()
  const honorific = clinic.profile.honorific
  const emr = clinic.state === 'ready' ? clinic.profile.emr : 'bit'
  const [attempt, setAttempt] = useState(0)
  const [picked, setPicked] = useState<string | null>(null) // 고른 지난 날. null이면 오늘이라, 연 채 날짜가 바뀌어도 오늘을 따라간다
  const pressedNow = useRef(false) // 직접 눌렀다는 표시: 다음 읽기 하나에만 쓴다
  // 마지막으로 받은 onBitLoaded·묶음 정의. 읽기 효과의 의존에 넣지 않는다(부모가 다시 그려도 읽기를 다시 시작하지 않게)
  const bitLoaded = useRef(onBitLoaded)
  const groupDefs = useRef(defsOf(groups))
  useEffect(() => {
    bitLoaded.current = onBitLoaded
    groupDefs.current = defsOf(groups)
  })
  // 묶음 읽기가 끝났다(왔음·읽지 못함·10초 한도). 끝나기 전에는 비트 읽기를 시작하지 않는다(묶음 정의를 실어야 한다, AC-606.7·AC-2701.2)
  const groupsSettled = groups !== 'pending'
  // 연 채 날이 지나 고른 날이 범위 밖이 되면 오늘로 돌아간다(AC-605.5)
  const selected = picked !== null && inDateRange(picked, today) ? picked : today

  useEffect(() => {
    // 묶음을 기다린다: 끝나면 이 효과가 다시 돌아 그때 한 번 읽는다
    if (!groupsSettled) return
    // 저절로 읽은 답은 조용히 둔다(열 때·날짜가 바뀔 때, AC-601.13·AC-601.16)
    const pressed = pressedNow.current
    pressedNow.current = false
    const runtime = chromeRuntime()
    if (!runtime) return
    const leaving = new AbortController()
    setStatus(startRead)
    void readBitDays({ runtime, createWorker: createStatsWorker, today, signal: leaving.signal, groups: groupDefs.current }).then((result) => {
      // 떠났거나 개발 모드가 효과를 다시 돌렸다: 취소한 읽기의 답은 쓰지 않는다
      if (leaving.signal.aborted) return
      setStatus((current) => finishRead(current, result, Date.now(), pressed))
      if (result.kind === 'days') bitLoaded.current?.()
    })
    return () => leaving.abort()
  }, [today, attempt, groupsSettled])

  const readAgain = () => {
    pressedNow.current = true
    setAttempt((n) => n + 1)
  }
  // 묶음·옛 기간 읽기는 DashboardAnalysis의 새 prop이 아니라 source 안으로 간다(tab-frame AC-312.2)
  const source: SummarySource =
    status.kind === 'data'
      ? { kind: 'data', days: status.days, groups: groups === null || groups === 'pending' ? groups : groups.lines, ...(older === undefined ? {} : { older }) }
      : { kind: 'none' }

  // 숫자가 있는 화면(dashboard-ux AC-2707.2): 머리 줄 → 일별 현황(기준일·숫자 칸·보고 문장) → AI 경영 리포트 요약 → 기간별 흐름.
  // AI 요약은 일 숫자가 하나라도 있을 때만 놓는다(AC-2704.1: 연결 전·뼈대·읽는 중에는 읽지 않는다)
  const look = emptyLook(status, honorific)
  const { emptyChip, emptyText, emptyNote, ...flowLook } = look
  const analysis =
    status.kind === 'data' ? (
      <>
        <DailySection
          today={today}
          day={selected}
          source={source}
          emptyChip={emptyChip}
          emptyText={emptyText}
          emptyNote={emptyNote}
          ptKey={ptKeyOf(groups)}
          dateLine={<DateControl today={today} selected={selected} onChange={(day) => setPicked(day === today ? null : day)} />}
          // key: 날짜를 바꾸면 복사 결과 표시가 다른 날 문장에 남지 않는다. 재고 칸은 날짜와 상관없이 그대로다(다시 읽지 않는다)
          sentence={
            <InventoryAlertCard today={today}>
              <ReportBlock key={selected} today={today} days={status.days} selected={selected} />
            </InventoryAlertCard>
          }
        />
        {/* 고시·공지 칸(notices AC-7422.2): 일별 현황 바로 아래. 숫자가 있는 화면에만 놓는다 */}
        <NoticesCard />
        {status.days.length > 0 && (
          <div className="mt-12 max-md:mt-8">
            <AiBrief today={today} honorific={honorific} />
          </div>
        )}
        <FlowSection today={today} source={source} {...flowLook} />
      </>
    ) : (
      <DashboardAnalysis today={today} day={selected} source={source} {...look} />
    )

  const home = (
    <DashboardHome
      today={today}
      emr={emr}
      // 숫자가 있으면 날짜 고르기는 일별 현황 기준일 묶음 안이다(AC-2703.1) — 맨 위 날짜 줄을 그리지 않는다
      dateLine={status.kind === 'data' ? null : undefined}
      report={
        status.kind === 'idle' ? null : status.kind === 'reading' ? (
          <ReadingBlock />
        ) : status.kind === 'failed' ? (
          <ReadFailed code={status.code} onRetry={readAgain} />
        ) : (
          <>
            {/* 머리 줄(AC-2701.3·AC-2701.7): h1 "대시보드" · 상태 · 시각 · 읽기 단추. 다시 읽기 실패·새로고침 실패·읽을 수 없음 안내는 바로 아래 */}
            <StatusHeader
              readAt={status.readAt}
              savedAt={savedAt}
              reading={status.reading}
              failed={status.code !== null}
              onReread={readAgain}
              bitReadable={bitReadable}
              savedRefresh={savedRefresh ?? null}
            />
            {status.code !== null && (
              <RereadAlert
                code={status.code}
                readAt={status.readAt}
                hasNumbers={status.days.length > 0}
                onRetry={readAgain}
                disabled={savedRefresh?.refreshing === true}
              />
            )}
            {savedRefresh?.failed === true && status.readAt === null && (
              <SavedRefreshAlert refreshing={savedRefresh.refreshing} disabled={savedRefresh.refreshing || status.reading} onRetry={savedRefresh.onRefresh} />
            )}
            {status.unreadable && <UnreadableNote />}
          </>
        )
      }
      analysis={analysis}
      notice={notice}
      locationNotice={locationNotice}
    />
  )
  // 숫자가 없는 모양: 재고 칸이 대시보드 내용 맨 위(AC-7512.4). 자리는 모양과 상관없이 늘 두어(숫자가 있으면 빈 자리)
  // 읽는 중 → 숫자로 바뀔 때 DashboardHome이 다시 만들어지지 않는다
  return (
    <>
      {status.kind !== 'data' && inventoryOnTop ? <InventoryAlertCard today={today} /> : null}
      {home}
    </>
  )
}

// LiveDashboard(summary 폴더)는 정해 둔 곳만 불러온다(DashboardAnalysis.test AC-311.8) → 뼈대·오류 카드 위 재고 칸은 이 파일을 거쳐 쓴다
export { InventoryAlertCard }
// 새 경쟁 의원 알림(location AC-7915.2)도 같은 까닭으로 이 파일을 거친다: 읽기 훅과 줄 그림은 LiveDashboard가 쓰고, 여기서는 내보내기만 한다(부르지 않음)
export { LocationAlert } from '@/components/dashboard/location/LocationAlert'
export { useLocationWatch } from '@/components/dashboard/location/useLocationWatch'
