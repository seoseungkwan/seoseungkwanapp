'use client'

import { useEffect, useRef, useState, type JSX } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { canGoNext, canGoPrev, compareLine, firstMonth, longMonth, reportCopyText } from '@/lib/ai/reportScreen'
import { addMonths } from '@/lib/analytics/dates'
import type { AiErrorCode, ReportView, ShownReport } from '@/types/aiReport'
import { RedoDialog } from './RedoDialog'
import { ReportBody, type ReportBodyState } from './ReportBody'
import { analyzeMonth, loadMonth } from './reportClient'
import { UsageAside } from './UsageAside'

// AI 리포트 화면(spec ai-report-screen REQ-708~711·713, design.md '화면 상태'·'달을 옮겨도 저장하지 않는다', 시안 main). 상태와 동작은 모두 여기서 맡고 그리기는 부품에 넘긴다.
// 고른 달은 화면 상태에만 둔다. 늦게 온 답은 요청 번호로 버린다: 읽기·분석이 시작할 때와 화면을 떠날 때 번호가 오르니, 받은 뒤 번호가 다르면 아무것도 하지 않는다

type ReadState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ok'; view: ReportView }

const TICK_MS = 1000
const COPIED_MS = 2000
const COPY_FAILED_MS = 2200
const COPY_FAILED_TEXT = '복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요.'

// 시안 .step button. 휴대폰은 44px
const STEP_BUTTON = `grid w-9 cursor-pointer place-items-center text-ink-2 not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 max-md:w-11 ${ds.focusRing}`

const reportIn = (read: ReadState): ShownReport | null => (read.kind === 'ok' ? read.view.report : null)

// design.md '화면 상태' 표. 위가 이긴다
function bodyStateOf(read: ReadState, busySeconds: number | null, error: AiErrorCode | null, copied: boolean): ReportBodyState {
  if (read.kind === 'loading') return { kind: 'loading' }
  if (read.kind === 'failed') return { kind: 'readError' }
  const { report, stale } = read.view
  if (report !== null) return { kind: 'report', report, stale, error, busySeconds, copied }
  if (busySeconds !== null) return { kind: 'busyEmpty', seconds: busySeconds }
  if (error === 'E-AI-NO-DATA') return { kind: 'noData' }
  return { kind: 'empty', error }
}

export function AiReportScreen({ today }: { today: string }): JSX.Element {
  // 읽을 달. 객체를 새로 넣으면 같은 달도 다시 읽는다([다시 읽기])
  const [target, setTarget] = useState(() => ({ month: firstMonth(today) }))
  const { month } = target
  const [read, setRead] = useState<ReadState>({ kind: 'loading' })
  const [error, setError] = useState<AiErrorCode | null>(null)
  const [busySeconds, setBusySeconds] = useState<number | null>(null) // 숫자면 분석을 기다리는 중
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const requestNo = useRef(0)
  const copyNo = useRef(0) // 조용한 읽기가 끝났다고 복사 결과를 버리면 안 되어 요청 번호와 나눈다
  const waiting = useRef(false) // 상태 값은 같은 틱의 두 번째 누름에 아직 옛값이라 ref로 막는다(AC-710.3)
  const secondsTimer = useRef<ReturnType<typeof setInterval>>(undefined)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const copyFailedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const headButton = useRef<HTMLButtonElement>(null)

  // 떠날 때 타이머를 끄고 번호를 올려 늦은 답을 버린다(늦은 reauth로 다른 탭에서 페이지가 다시 읽히면 안 된다).
  // StrictMode는 effect를 두 번 돌리므로 ref는 여기서 다시 세운다
  useEffect(() => {
    waiting.current = false
    return () => {
      requestNo.current += 1
      copyNo.current += 1
      clearInterval(secondsTimer.current)
      clearTimeout(copiedTimer.current)
      clearTimeout(copyFailedTimer.current)
    }
  }, [])

  useEffect(() => {
    requestNo.current += 1
    const id = requestNo.current
    void loadMonth(target.month).then((result) => {
      if (id !== requestNo.current) return
      if (result.kind === 'reauth') location.reload()
      else setRead(result.kind === 'ok' ? { kind: 'ok', view: result.view } : { kind: 'failed' })
    })
  }, [target])

  function clearCopyMarks() {
    clearTimeout(copiedTimer.current)
    clearTimeout(copyFailedTimer.current)
    setCopied(false)
    setCopyFailed(false)
  }

  // 달 옮기기와 [다시 읽기]가 같은 길을 탄다
  function openMonth(next: string) {
    copyNo.current += 1
    clearCopyMarks()
    setError(null)
    setRead({ kind: 'loading' })
    setTarget({ month: next })
  }

  // '읽는 중'으로 가지 않는 읽기. 실패해도 지금 화면을 그대로 두고 오류 상자를 띄우지 않는다(AC-710.4).
  // 답의 리포트가 있으면 그것을 보인다: 응답을 못 받았지만 서버는 성공한 경우 새 리포트가 오류 상자 아래에 나온다(위험 3번)
  async function readQuietly(quietMonth: string) {
    requestNo.current += 1
    const id = requestNo.current
    const result = await loadMonth(quietMonth)
    if (id !== requestNo.current) return
    if (result.kind === 'reauth') location.reload()
    else if (result.kind === 'ok') {
      setRead((prev) => ({ kind: 'ok', view: { ...result.view, report: result.view.report ?? reportIn(prev) } }))
    }
  }

  async function analyze() {
    if (waiting.current) return
    waiting.current = true
    requestNo.current += 1
    const id = requestNo.current
    setError(null)
    setBusySeconds(0)
    secondsTimer.current = setInterval(() => setBusySeconds((seconds) => (seconds === null ? null : seconds + 1)), TICK_MS)
    const result = await analyzeMonth(month)
    if (id !== requestNo.current) return
    if (result.kind === 'reauth') {
      location.reload()
      return
    }
    clearInterval(secondsTimer.current)
    waiting.current = false
    setBusySeconds(null)
    if (result.kind === 'ok') {
      setRead((prev) => (prev.kind === 'ok' ? { kind: 'ok', view: { ...prev.view, report: result.report, stale: false } } : prev))
    } else {
      setError(result.code) // 다음 동작까지 남긴다(위험 3번)
    }
    void readQuietly(month)
  }

  function cancelRedo() {
    setConfirming(false)
    headButton.current?.focus()
  }

  // 창이 사라지며 초점이 몸통으로 빠지지 않게 "분석 중"이 될 머리 단추로 옮긴다
  function confirmRedo() {
    setConfirming(false)
    void analyze()
    headButton.current?.focus()
  }

  async function copy(report: ShownReport) {
    copyNo.current += 1
    const id = copyNo.current
    let done = true
    try {
      await navigator.clipboard.writeText(reportCopyText(report))
    } catch {
      done = false // clipboard가 없을 때도 여기로 온다
    }
    if (id !== copyNo.current) return
    clearCopyMarks()
    if (done) {
      setCopied(true)
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
    } else {
      setCopyFailed(true)
      copyFailedTimer.current = setTimeout(() => setCopyFailed(false), COPY_FAILED_MS)
    }
  }

  const report = reportIn(read)
  const stale = read.kind === 'ok' && read.view.stale
  const busy = busySeconds !== null

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line-strong pb-5">
        <div>
          <h1 className="text-title font-semibold text-ink">AI 리포트</h1>
          <p className="mt-0.5 text-small text-muted">{compareLine(month)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full">
          <div
            role="group"
            aria-label="달 고르기"
            className="inline-flex h-9 items-stretch rounded-control border border-line-strong bg-surface max-md:h-11 max-md:w-full"
          >
            <button
              type="button"
              aria-label="이전 달"
              disabled={busy || !canGoPrev(month)}
              onClick={() => openMonth(addMonths(month, -1))}
              className={STEP_BUTTON}
            >
              <Icon name="chev" size={16} className="rotate-90" />
            </button>
            <output
              aria-live="polite"
              className="grid min-w-28 place-items-center border-x border-line px-1 text-body font-semibold whitespace-nowrap text-ink max-md:flex-1"
            >
              {longMonth(month)}
            </output>
            <button
              type="button"
              aria-label="다음 달"
              disabled={busy || !canGoNext(month, today)}
              onClick={() => openMonth(addMonths(month, 1))}
              className={STEP_BUTTON}
            >
              <Icon name="chev" size={16} className="-rotate-90" />
            </button>
          </div>
          {report !== null && (
            // [다시 분석]과 "분석 중"은 같은 요소다. 초점이 그대로 남아야 한다
            <button
              ref={headButton}
              type="button"
              aria-busy={busy ? 'true' : undefined}
              onClick={busy ? undefined : () => setConfirming(true)}
              className={`${stale && !busy ? ds.button.primary : ds.button.secondary} max-md:flex-1`}
            >
              {busy ? '분석 중' : '다시 분석'}
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-x-6 pt-6">
        <div className="col-span-full min-w-0 lg:col-span-8">
          <ReportBody
            state={bodyStateOf(read, busySeconds, error, copied)}
            month={month}
            today={today}
            now={new Date()}
            onAnalyze={() => void analyze()}
            onRetryRead={() => openMonth(month)}
            onCopy={() => {
              if (report !== null) void copy(report)
            }}
          />
        </div>
        <div className="col-span-full mt-8 min-w-0 border-t border-line-strong pt-5 max-md:pt-4 lg:col-span-4 lg:mt-0 lg:border-t-0 lg:border-l lg:border-line lg:pt-0 lg:pl-6">
          <UsageAside usage={read.kind === 'ok' ? read.view.usage : null} />
        </div>
      </div>
      {confirming && <RedoDialog month={month} onCancel={cancelRedo} onConfirm={confirmRedo} />}
      {copyFailed && (
        <p
          role="status"
          className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-float bg-ink px-4 py-2 text-small whitespace-nowrap text-surface"
        >
          {COPY_FAILED_TEXT}
        </p>
      )}
    </div>
  )
}
