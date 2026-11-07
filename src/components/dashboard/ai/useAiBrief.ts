'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeMonth, loadMonth } from '@/components/ai-report/reportClient'
import { firstMonth } from '@/lib/ai/reportScreen'
import type { AiErrorCode, ShownReport } from '@/types/aiReport'

// 대시보드 AI 경영 리포트 요약의 상태와 부르기(dashboard-ux REQ-2704, design.md §5). 그리기는 AiBrief가 맡는다.
// 지난달(firstMonth(today)) 저장 리포트를 열 때 한 번 GET으로 읽고(Claude를 부르지 않는다), AI 부르기(POST)는 create()를 부를 때만이다.
// 타이머는 기다린 초를 세기만 하고 아무것도 부르지 않는다. 늦게 온 답은 요청 번호로 버린다: 읽기·만들기를 시작할 때와 떠날 때 번호가 오른다.
// 로그인이 끊긴 답(reauth)은 AI 리포트 화면과 같이 페이지를 다시 읽는다

export type BriefFailCode = Exclude<AiErrorCode, 'E-AI-NO-DATA'>

export type AiBriefState =
  | { kind: 'loading' } // 저장 리포트를 읽는 중
  | { kind: 'readError' } // 읽기 실패(E-AI-READ). [다시 읽기]를 누를 때만 다시 읽는다
  | { kind: 'none' } // 그 달 리포트가 아직 없음
  | { kind: 'busy'; seconds: number } // 만드는 중, 기다린 초
  | { kind: 'failed'; code: BriefFailCode; report: ShownReport | null } // 만들기 실패. 그려 둔 리포트가 있으면 그대로 둔다
  | { kind: 'noData' } // E-AI-NO-DATA: 그 달 통계가 없음
  | { kind: 'report'; report: ShownReport; stale: boolean }

export type AiBrief = { month: string; state: AiBriefState; create(): void; retryRead(): void }

const TICK_MS = 1000
const LOADING: AiBriefState = { kind: 'loading' }

export function useAiBrief(today: string): AiBrief {
  const month = firstMonth(today)
  const [state, setState] = useState<AiBriefState>(LOADING)
  const [readMonth, setReadMonth] = useState(month)
  const [readRound, setReadRound] = useState(0) // 올리면 같은 달을 다시 읽는다([다시 읽기])
  const requestNo = useRef(0)
  const waiting = useRef(false) // 상태 값은 같은 틱의 두 번째 누름에 아직 옛값이라 ref로 막는다(AC-2704.5)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  const shown = useRef<ShownReport | null>(null) // 그려 둔 리포트. 만들기가 실패해도 지우지 않는다

  // 오늘이 다음 달로 넘어가면 새 지난달을 읽는다: 그리는 동안 바로 '읽는 중'으로 돌린다
  if (readMonth !== month) {
    setReadMonth(month)
    setState(LOADING)
  }

  // 달이 바뀌거나 [다시 읽기]·떠날 때 정리한다: 번호를 올려 그 전 읽기·만들기의 늦은 답을 버리고 타이머를 끈다.
  // StrictMode는 effect를 두 번 돌리므로 ref는 여기서 다시 세운다
  useEffect(() => {
    requestNo.current += 1
    const id = requestNo.current
    waiting.current = false
    shown.current = null
    void loadMonth(month).then((result) => {
      if (id !== requestNo.current) return
      if (result.kind === 'reauth') {
        location.reload()
        return
      }
      if (result.kind === 'error') {
        setState({ kind: 'readError' })
        return
      }
      const { report, stale } = result.view
      shown.current = report
      setState(report === null ? { kind: 'none' } : { kind: 'report', report, stale })
    })
    return () => {
      requestNo.current += 1
      clearInterval(timer.current)
    }
  }, [month, readRound])

  const create = useCallback(() => {
    if (waiting.current) return
    waiting.current = true
    requestNo.current += 1
    const id = requestNo.current
    setState({ kind: 'busy', seconds: 0 })
    timer.current = setInterval(() => setState((now) => (now.kind === 'busy' ? { kind: 'busy', seconds: now.seconds + 1 } : now)), TICK_MS)
    void analyzeMonth(month).then((result) => {
      if (id !== requestNo.current) return
      clearInterval(timer.current)
      if (result.kind === 'reauth') {
        location.reload() // 다시 읽힐 때까지 waiting을 풀지 않는다: 그 사이 눌러도 다시 부르지 않는다
        return
      }
      waiting.current = false
      if (result.kind === 'ok') {
        shown.current = result.report
        setState({ kind: 'report', report: result.report, stale: false })
      } else if (result.code === 'E-AI-NO-DATA') {
        setState({ kind: 'noData' })
      } else {
        setState({ kind: 'failed', code: result.code, report: shown.current })
      }
    })
  }, [month])

  const retryRead = useCallback(() => {
    setState(LOADING)
    setReadRound((round) => round + 1)
  }, [])

  return { month, state, create, retryRead }
}
