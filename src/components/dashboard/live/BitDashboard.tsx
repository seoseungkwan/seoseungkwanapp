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
import { BIT_IN_USE, ReadFailed, ReadingBlock, ReadLine, RereadAlert, UnreadableNote } from './ReadStatus'
import { readBitDays, type ReadResult } from './readBitDays'

// 비트에서 읽어 대시보드를 그리는 화면 (bit-dashboard REQ-601, design.md '### 화면', 시안 docs/mockups/bit-dashboard/gen.py state_body).
// 서버가 그린 첫 모양은 initial 그대로이고, 효과 안에서 chrome.runtime이 있을 때만 읽는다. 화면 상태에는 일 숫자만 담고 서버로 아무것도 보내지 않는다(AC-601.9).
// 다음 작업이 이어 붙일 자리: 고른 날 상태는 여기 한 곳에 둔다(design.md '### 날짜 고르기')

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

export function BitDashboard({ today, initial }: { today: string; initial: SummarySource }) {
  const [status, setStatus] = useState(() => firstStatus(initial))
  const [attempt, setAttempt] = useState(0)
  const pressedNow = useRef(false) // 직접 눌렀다는 표시: 다음 읽기 하나에만 쓴다

  useEffect(() => {
    // 저절로 읽은 답은 조용히 둔다(열 때·날짜가 바뀔 때, AC-601.13·AC-601.16)
    const pressed = pressedNow.current
    pressedNow.current = false
    const runtime = chromeRuntime()
    if (!runtime) return
    const leaving = new AbortController()
    setStatus(startRead)
    void readBitDays({ runtime, createWorker: createStatsWorker, today, signal: leaving.signal }).then((result) => {
      // 떠났거나 개발 모드가 효과를 다시 돌렸다: 취소한 읽기의 답은 쓰지 않는다
      if (!leaving.signal.aborted) setStatus((current) => finishRead(current, result, Date.now(), pressed))
    })
    return () => leaving.abort()
  }, [today, attempt])

  const readAgain = () => {
    pressedNow.current = true
    setAttempt((n) => n + 1)
  }
  const source: SummarySource = status.kind === 'data' ? { kind: 'data', days: status.days } : { kind: 'none' }

  return (
    <DashboardHome
      today={today}
      report={
        status.kind === 'idle' ? null : status.kind === 'reading' ? (
          <ReadingBlock />
        ) : status.kind === 'failed' ? (
          <ReadFailed code={status.code} onRetry={readAgain} />
        ) : (
          <>
            <ReportBlock today={today} days={status.days} />
            <ReadLine readAt={status.readAt} reading={status.reading} failed={status.code !== null} onReread={readAgain} />
            {status.code !== null && <RereadAlert code={status.code} readAt={status.readAt} hasNumbers={status.days.length > 0} onRetry={readAgain} />}
            {status.unreadable && <UnreadableNote />}
          </>
        )
      }
      analysis={<DashboardAnalysis today={today} source={source} {...emptyLook(status)} />}
    />
  )
}
