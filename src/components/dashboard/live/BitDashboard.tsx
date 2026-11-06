'use client'

import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { DashboardAnalysis } from '@/components/dashboard/summary/DashboardAnalysis'
import { ReportBlock } from '@/components/dashboard/summary/ReportBlock'
import { isConnected, type SummarySource } from '@/components/dashboard/summary/source'
import type { ChromeRuntimeLike } from '@/types/bridge'
import type { ErrorCode } from '@/types/errors'
import type { DayPayload } from '@/types/payload'
import { createStatsWorker } from '@/workers/statsClient'
import { DateControl, inDateRange } from './DateControl'
import { BIT_IN_USE, ReadFailed, ReadingBlock, ReadLine, RereadAlert, UnreadableNote } from './ReadStatus'
import { readBitDays, type ReadResult } from './readBitDays'
import type { DashboardGroups } from './rxGroups'

// 비트에서 읽어 대시보드를 그리는 화면 (bit-dashboard REQ-601, design.md '### 화면', 시안 docs/mockups/bit-dashboard/gen.py state_body).
// 서버가 그린 첫 모양은 initial 그대로이고, 효과 안에서 chrome.runtime이 있을 때만 읽는다. 화면 상태에는 일 숫자만 담고 서버로 아무것도 보내지 않는다(AC-601.9).
// 고른 날은 여기 상태 하나다(design.md '### 날짜 고르기'). 주소·저장소에 두지 않아 새로 열면 오늘이고, 이미 읽은 숫자로 그려 비트를 다시 읽지 않는다(AC-605.6)
// 통계 탭 묶음(groups)은 LiveDashboard가 읽어 넘긴다. 비트 읽기에 묶음 정의를 싣고(AC-606.7), 처방 상위는 그 묶음으로 센다(AC-606.1·AC-606.5)

/** 묶음을 주지 않으면 묶음 없음 */
const NO_GROUPS: DashboardGroups = { lines: [], defs: [] }

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

// 상태별 칩·숫자 칸 글(design.md '### 화면', 시안 today_sec·flow_empty)
type EmptyLook = Partial<ComponentProps<typeof DashboardAnalysis>>
const GAINS_OF_READING: EmptyLook = {
  gainsTitle: '읽기가 끝나면 생기는 것 4가지',
  gainsNote: '읽기가 끝나면 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.',
  gainsRevisitDesc: '처음 온 환자가 7·14일 안에 다시 온 비율이에요.', // 30일 줄은 아직 값이 없다(시안 '바뀌는 곳')
}
const READING_LOOK: EmptyLook = {
  ...GAINS_OF_READING,
  emptyChip: '읽는 중',
  emptyText: '읽는 중',
  emptyNote: '읽기가 끝나면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.',
}
const FAILED_LOOK: EmptyLook = { ...GAINS_OF_READING, emptyChip: '읽지 못함', emptyText: '읽지 못했어요', emptyNote: null }
const IN_USE_LOOK: EmptyLook = { ...GAINS_OF_READING, emptyChip: '기다리는 중', emptyText: '아직 못 읽었어요', emptyNote: null }
// 읽기는 성공했는데 일 숫자가 없음(AC-601.11): 연결 전 모양으로 돌아가지 않는다
const NO_DAYS_LOOK: EmptyLook = { emptyChip: '자료 없음', emptyText: '자료 없음', emptyNote: null, emptyCharts: true }

function emptyLook(status: Status): EmptyLook {
  if (status.kind === 'reading') return READING_LOOK
  if (status.kind === 'failed') return status.code === BIT_IN_USE ? IN_USE_LOOK : FAILED_LOOK
  return status.kind === 'data' ? NO_DAYS_LOOK : {}
}

/**
 * onBitLoaded: 비트 읽기가 일 숫자(days, 빈 배열 포함)로 끝날 때 부른다. LiveDashboard가 저장 숫자 오류 카드를 거두는 때다(AC-601.19).
 * groups: 통계 탭 묶음. 주지 않으면 묶음 없음, null = 묶음을 읽지 못함(비트 읽기는 묶음 없이, 처방 상위는 AC-606.5 글)
 */
export function BitDashboard({
  today,
  initial,
  groups = NO_GROUPS,
  onBitLoaded,
}: {
  today: string
  initial: SummarySource
  groups?: DashboardGroups | null
  onBitLoaded?: () => void
}) {
  const [status, setStatus] = useState(() => firstStatus(initial))
  const [attempt, setAttempt] = useState(0)
  const [picked, setPicked] = useState<string | null>(null) // 고른 지난 날. null이면 오늘이라, 연 채 날짜가 바뀌어도 오늘을 따라간다
  const pressedNow = useRef(false) // 직접 눌렀다는 표시: 다음 읽기 하나에만 쓴다
  // 마지막으로 받은 onBitLoaded·묶음 정의. 읽기 효과의 의존에 넣지 않는다(부모가 다시 그려도 읽기를 다시 시작하지 않게)
  const bitLoaded = useRef(onBitLoaded)
  const groupDefs = useRef(groups?.defs ?? [])
  useEffect(() => {
    bitLoaded.current = onBitLoaded
    groupDefs.current = groups?.defs ?? []
  })
  // 연 채 날이 지나 고른 날이 범위 밖이 되면 오늘로 돌아간다(AC-605.5)
  const selected = picked !== null && inDateRange(picked, today) ? picked : today

  useEffect(() => {
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
  }, [today, attempt])

  const readAgain = () => {
    pressedNow.current = true
    setAttempt((n) => n + 1)
  }
  const source: SummarySource = status.kind === 'data' ? { kind: 'data', days: status.days, groups: groups === null ? null : groups.lines } : { kind: 'none' }

  return (
    <DashboardHome
      today={today}
      dateLine={status.kind === 'data' ? <DateControl today={today} selected={selected} onChange={(day) => setPicked(day === today ? null : day)} /> : undefined}
      report={
        status.kind === 'idle' ? null : status.kind === 'reading' ? (
          <ReadingBlock />
        ) : status.kind === 'failed' ? (
          <ReadFailed code={status.code} onRetry={readAgain} />
        ) : (
          <>
            {/* key: 날짜를 바꾸면 복사 결과 표시가 다른 날 문장에 남지 않는다 */}
            <ReportBlock key={selected} today={today} days={status.days} selected={selected} />
            <ReadLine readAt={status.readAt} reading={status.reading} failed={status.code !== null} onReread={readAgain} />
            {status.code !== null && <RereadAlert code={status.code} readAt={status.readAt} hasNumbers={status.days.length > 0} onRetry={readAgain} />}
            {status.unreadable && <UnreadableNote />}
          </>
        )
      }
      analysis={<DashboardAnalysis today={today} day={selected} source={source} {...emptyLook(status)} />}
    />
  )
}
