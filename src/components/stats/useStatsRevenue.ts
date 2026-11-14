'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { compareYmd, monthOf } from '@/lib/analytics/dates'
import { isErrorCode } from '@/lib/errors'
import { planRevenue, syncRanges } from '@/lib/revenue/sync'
import { createRevenueStore } from '@/lib/storage/revenue'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DateRange } from '@/types/dates'
import type { RevenueCodeTotal, RevenueDaysResult, RevenueMonthCode, SavedRevenueDay } from '@/types/revenue'
import { readSpan, type StatsRange } from './view'

// 통계 매출 읽기·저장 상태 (stats-revenue REQ-4104 AC-4104.4 · REQ-4108, design.md '매출 훅').
// 읽기: readSpan(range) 날 줄 · 보는 기간(첫날 ~ 기간 끝과 마지막 끝난 날 가운데 이른 날) 코드별 합 · 그 달들의 옛 달 합계를 함께 읽는다.
//   기간·마지막 끝난 날이 바뀔 때, 저장 뒤, [다시 읽기]에 다시 읽고 늦게 온 앞 답은 버린다(useStatsData와 같은 방식).
// sync([비트에서 불러오기]가 통계 조각을 모두 저장한 뒤): 불러올 기간의 저장 표시 → planRevenue → syncRanges(덩어리 하나씩 call → 저장) → 다시 읽기.
//   call은 통계 훅(useStatsWorker.revenueDays)이 쥔 같은 연결의 것을 받는다. 이 훅은 통로를 직접 붙이지 않는다(두 번째 연결 = E-BRIDGE-BUSY).
//   call이 null(비트 PC 아님)이면 아무것도 하지 않는다. 거절하지 않는다.
// 숫자·표시는 React 상태에만 둔다. 브라우저 저장소·주소·서버 밖 어디에도 쓰지 않는다(도우미 예전 판 표시도 다시 열면 꺼진 채, 기본값 9)

export type RevenueCall = (range: DateRange) => Promise<RevenueDaysResult>
/** 매출 읽는 중. done = 읽는 덩어리의 차례(1부터), total = 덩어리 수. 읽을 덩어리를 세는 동안은 0/0 (revenueProgressText에 그대로 넘긴다) */
export type RevenueProgress = { done: number; total: number }
/** 매출만 실패 상자(기본값 13). code = 처음 난 오류 번호, savedTo = 전에 저장한 매출의 끝날(없으면 null) */
export type RevenueFailure = { code: string; savedTo: string | null }

export type StatsRevenue = {
  state: 'reading' | 'ready' | 'read-failed'
  /** 아래 셋은 state가 'ready'일 때만 채워진다(읽는 중·실패면 빈 목록) */
  days: readonly SavedRevenueDay[]
  codes: readonly RevenueCodeTotal[]
  monthCodes: readonly RevenueMonthCode[]
  /** 이 화면에서 읽은 답에 dayCodes가 없었음(도우미 예전 판). 기억하지 않는다 */
  noDayCodes: boolean
  /** sync가 도는 동안만 있다 */
  progress: RevenueProgress | null
  /** 마지막 sync가 덩어리 실패·멈춤으로 끝났을 때만 있다. sync가 끝날 때만 바뀐다(성공하면 null) */
  failure: RevenueFailure | null
  reread(): void
  sync(args: { whole: DateRange; closeToday: boolean }): Promise<void>
}

type Stored = { key: string; days: SavedRevenueDay[]; codes: RevenueCodeTotal[]; monthCodes: RevenueMonthCode[] }

const NO_DAYS: readonly SavedRevenueDay[] = []
const NO_CODES: readonly RevenueCodeTotal[] = []
const NO_MONTH_CODES: readonly RevenueMonthCode[] = []
// 저장소의 읽기 실패 번호(번호가 없는 예외도 이 번호로 적는다. 글은 옮기지 않는다)
const READ_FAILED = 'E-STATS-READ-FAILED'

const revenueStore = () => createRevenueStore(supabaseBrowser())

// 보는 기간: 기간 첫날 ~ 기간 끝과 마지막 끝난 날 가운데 이른 날(revenueView와 같은 규칙, AC-4105.1)
function viewSpan(range: StatsRange, lastDay: string): DateRange {
  const { from, to } = range.current
  return { from, to: compareYmd(to, lastDay) <= 0 ? to : lastDay }
}

async function readStored(key: string, span: DateRange, view: DateRange): Promise<Stored> {
  const store = revenueStore()
  const [days, codes, monthCodes] = await Promise.all([store.loadDays(span), store.codeTotals(view), store.monthCodes(monthOf(view.from), monthOf(view.to))])
  return { key, days, codes, monthCodes }
}

function latestOf(dates: Iterable<string>): string | null {
  let latest: string | null = null
  for (const date of dates) if (latest === null || compareYmd(date, latest) > 0) latest = date
  return latest
}

const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && isErrorCode(code) ? code : READ_FAILED
}

export function useStatsRevenue({ range, today, lastDay, call }: { range: StatsRange; today: string; lastDay: string; call: RevenueCall | null }): StatsRevenue {
  const { from: spanFrom, to: spanTo } = readSpan(range)
  const { from: viewFrom, to: viewTo } = viewSpan(range, lastDay)
  const [attempt, setAttempt] = useState(0)
  const key = `${spanFrom}|${spanTo}|${viewFrom}|${viewTo}|${attempt}`

  const [stored, setStored] = useState<Stored | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [noDayCodes, setNoDayCodes] = useState(false)
  const [progress, setProgress] = useState<RevenueProgress | null>(null)
  const [failure, setFailure] = useState<RevenueFailure | null>(null)
  // 화면에 보이는 저장된 날(계획 읽기가 실패했을 때 '전에 저장한 끝날'을 여기서 찾는다) · sync가 도는 중인지
  const shownDays = useRef<readonly SavedRevenueDay[]>(NO_DAYS)
  const running = useRef(false)

  useEffect(() => {
    let current = true
    readStored(key, { from: spanFrom, to: spanTo }, { from: viewFrom, to: viewTo }).then(
      (next) => {
        if (!current) return
        shownDays.current = next.days
        setStored(next)
        setFailedKey(null)
      },
      () => {
        if (current) setFailedKey(key)
      },
    )
    return () => {
      current = false
    }
  }, [key, spanFrom, spanTo, viewFrom, viewTo])

  const reread = useCallback(() => setAttempt((n) => n + 1), [])

  const sync = useCallback(
    async ({ whole, closeToday }: { whole: DateRange; closeToday: boolean }) => {
      if (call === null || running.current) return
      running.current = true
      setProgress({ done: 0, total: 0 })
      const store = revenueStore()
      let next: RevenueFailure | null = null
      try {
        const saved = await store.loadDays(whole)
        const savedDates = saved.map((row) => row.date)
        const ranges = planRevenue(whole, today, closeToday, new Map(saved.map((row) => [row.date, row.dayCodes])))
        if (ranges.length > 0) setProgress({ done: 1, total: ranges.length })
        let answered = false
        const result = await syncRanges({
          call: async (chunk) => {
            const answer = await call(chunk)
            answered = true
            return answer
          },
          store: {
            async saveRange(chunk, answer) {
              await store.saveRange(chunk, answer)
              savedDates.push(chunk.to)
            },
          },
          ranges,
          // 덩어리가 끝날 때마다 다음 덩어리의 차례로 옮긴다(마지막 덩어리 뒤는 끝)
          onProgress: ({ done, total }) => {
            if (done < total) setProgress({ done: done + 1, total })
          },
        })
        // 덩어리마다 실패는 차례대로 적히고 멈춘 번호는 그 뒤에 난 것이라, 처음 난 번호는 실패 목록 첫 번호다
        const code = result.failed[0]?.code ?? result.stopped
        if (code !== null) next = { code, savedTo: latestOf(savedDates) }
        // 답이 하나도 없던 sync(모두 실패)는 도우미 판을 모르므로 표시를 그대로 둔다
        if (answered) setNoDayCodes(result.noDayCodes)
      } catch (error) {
        // 불러올 기간의 저장 표시를 읽지 못함: 덩어리를 세지 못해 비트를 부르지 않는다
        next = { code: codeOf(error), savedTo: latestOf(shownDays.current.map((row) => row.date)) }
      } finally {
        running.current = false
        setProgress(null)
        setFailure(next)
        setAttempt((n) => n + 1)
      }
    },
    [call, today],
  )

  const state: StatsRevenue['state'] = failedKey === key ? 'read-failed' : stored?.key === key ? 'ready' : 'reading'
  const shown = state === 'ready' ? stored : null

  return {
    state,
    days: shown?.days ?? NO_DAYS,
    codes: shown?.codes ?? NO_CODES,
    monthCodes: shown?.monthCodes ?? NO_MONTH_CODES,
    noDayCodes,
    progress,
    failure,
    reread,
    sync,
  }
}
