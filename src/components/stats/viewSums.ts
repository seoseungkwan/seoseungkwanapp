'use client'

import { useEffect, useMemo, useState } from 'react'
import { useViewing } from '@/components/shell/viewing'
import { isCovered, mergeRanges } from '@/lib/analytics/coverage'
import { addMonths, compareYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import { formatRxVisitSplit, rxVisitHeadline } from '@/lib/analytics/rxVisitSplit'
import { validateMonthPayload } from '@/lib/payload/validate'
import { readAdminRows, type AdminRow } from '@/lib/storage/adminRows'
import type { DateRange } from '@/types/dates'
import type { DayPayload, MonthPayload } from '@/types/payload'
import type { DropoffLine, RxSplit, RxSplitLine, RxSplitView } from '@/types/stats'
import type { SunapRates } from '@/types/sunap'
import type { StatsInput, StatsRange } from './view'

// 보는 중 통계 탭 비트 전용 칸의 저장 합계 (admin-view REQ-8025 AC-8025.1·AC-8025.2, tasks.md TASK-21).
// 관리자가 다른 의원을 보는 중이면 Worker 기억(비트에서 불러오기)이 없어, 그 의원이 저장한 합계로 그릴 수 있는 칸만 그린다:
//   Block 전환 = 고른 기간 날 줄 sunap 아홉 칸의 합(날마다 더할 수 있다)
//   몇 번까지 받나 = 고른 달들 달 줄 dropoff를 묶음마다 더한 수(대상·k회 이상·10회 이상). 1회만·가장 많이 빠지는 곳은 더한 수에서 다시 세고
//     저장된 평균·빠지는 곳은 쓰지 않는다. 평균은 횟수 합이 저장되지 않아 다시 셀 수 없어 null(화면 '–')
//   처방별 신환·재진 = 고른 달 하나의 달 줄 rx(처방마다 그달 서로 다른 환자 — 통계 탭과 같은 정의, AC-8018.3). 여러 달은 더할 수 없어 null
// 달 합계는 고른 기간이 달 1일 ~ 말일로 이어진 온전한 달이고 그 달 줄이 모두 다 된(partial 아님) 줄일 때만 센다. 하나라도 없으면 그 칸은 null(지금 안내 글) —
// 일부 날·달만으로 세지 않는다. 환자 구성·시간대별 접수·원장님별은 저장 합계에 그 칸 숫자(건수·요일×시간·원장님별 내원)가 없어 세지 않는다.
// 날 줄은 통계 탭이 이미 읽은 보는 의원의 저장 줄(useStatsData — 보기 열쇠로 RLS가 그 의원 줄만 준다)을 그대로 쓰고, 통계 탭이 읽지 않는
// 달 줄만 admin_rows('stats_months')로 읽는다(rx·groups·dropoff·sections만, 한 번 400일 아래라 12달씩). 셈 모양은 의원 비교(compareStatsInput)와 같다

/** 몇 번까지 받나 한 줄(저장 합계). average는 늘 null — 저장된 수로 다시 셀 수 없다 */
export type SavedDropoffLine = Omit<DropoffLine, 'average'> & { average: null }

/** 칸마다 저장 합계. null = 고른 기간에 그 합계가 없는 날·달이 있어 지금 안내 글 */
export type ViewSums = { sunap: SunapRates | null; dropoff: SavedDropoffLine[] | null; split: RxSplitView | null }

const RATE_KEYS = ['visits', 'first_n', 'd90_n', 'ret_n', 'block_n', 'pt_n', 'first_block', 'd90_block', 'ret_block'] as const satisfies readonly (keyof SunapRates)[]
const READ_MONTHS = 12 // admin_rows 한 번의 기간(< 400일)
const STEPS = 6 // 1~6회 이상
const DROP_STEPS = 5 // 가장 많이 빠지는 곳은 1→2 ~ 5→6 가운데(lib/analytics/dropoff.ts와 같다)
const NO_ROWS: readonly AdminRow[] = []
const NOTHING: ViewSums = { sunap: null, dropoff: null, split: null }

const within = (day: string, span: DateRange) => compareYmd(day, span.from) >= 0 && compareYmd(day, span.to) <= 0

/** 셀 기간: 고른 기간 첫날 ~ 고른 기간 끝과 마지막 끝난 날 가운데 이른 날. 비면 null */
export function sumSpan(range: StatsRange, lastDay: string): DateRange | null {
  const { from, to } = range.current
  const end = compareYmd(to, lastDay) <= 0 ? to : lastDay
  return compareYmd(from, end) <= 0 ? { from, to: end } : null
}

/** 셀 기간이 달 1일 ~ 말일로 이어진 온전한 달들이면 그 달('YYYY-MM') 목록, 아니면 null */
export function wholeMonths(span: DateRange | null): string[] | null {
  if (span === null) return null
  const first = monthOf(span.from)
  const last = monthOf(span.to)
  if (span.from !== monthRange(first).from || span.to !== monthRange(last).to) return null
  const months: string[] = []
  for (let month = first; month <= last; month = addMonths(month, 1)) months.push(month)
  return months
}

// Block 전환: 셀 기간이 다 덮였고 그 안 날 줄이 모두 sunap을 가질 때만 아홉 칸을 더한다(덮였는데 줄 없는 날은 휴진 = 0)
function daySunap({ days, covered }: StatsInput, span: DateRange): SunapRates | null {
  if (!isCovered(span, mergeRanges([...covered]))) return null
  const rows = days.filter((row) => within(row.day, span))
  if (rows.some((row) => row.sunap === undefined)) return null
  const sums = Object.fromEntries(RATE_KEYS.map((key) => [key, 0])) as SunapRates
  for (const row of rows) for (const key of RATE_KEYS) sums[key] += row.sunap![key]
  return sums
}

// admin_rows 달 줄(rx·groups·dropoff·sections만)을 의원 비교와 같게 받는다: 합계·재방문은 0으로 채워 달 줄 검사를 그대로 지나게 한다
function monthPayloadOf(row: Record<string, unknown>): MonthPayload | null {
  if (typeof row.month !== 'string') return null
  return validateMonthPayload({
    schemaVersion: 2,
    quality: 'valid',
    month: row.month,
    partial: row.partial,
    totals: { patients: 0, newPatients: 0, returning: 0, unknown: 0 },
    rx: row.rx,
    groups: row.groups,
    revisit: { cohort: 0, within7: 0, within14: 0 },
    regions: [],
    ...(row.dropoff === null || row.dropoff === undefined ? {} : { dropoff: row.dropoff }),
  })
}

// 고른 달마다 다 된 달 줄. 하나라도 없거나(검사에 진 줄 포함) 덜 된 달이면 null
function completeMonths(rows: readonly AdminRow[], months: readonly string[]): MonthPayload[] | null {
  const byMonth = new Map<string, MonthPayload>()
  for (const { row } of rows) {
    const payload = monthPayloadOf(row)
    if (payload !== null) byMonth.set(payload.month, payload)
  }
  const list = months.map((month) => byMonth.get(month))
  return list.every((payload) => payload !== undefined && !payload.partial) ? (list as MonthPayload[]) : null
}

// 가장 많이 빠지는 곳: k회 이상 − (k+1)회 이상이 가장 큰 k(같으면 작은 k)
function dropOf(atLeast: DropoffLine['atLeast']): number {
  let drop = 1
  for (let k = 2; k <= DROP_STEPS; k++) {
    if (atLeast[k - 1]! - atLeast[k]! > atLeast[drop - 1]! - atLeast[drop]!) drop = k
  }
  return drop
}

// 몇 번까지 받나: 첫 진료 달마다 나뉜 대상은 겹치지 않아 묶음마다 더한다(묶음 차례는 처음 나온 차례). 한 달이라도 dropoff가 없으면 null
function dropoffSum(months: readonly MonthPayload[]): SavedDropoffLine[] | null {
  if (months.some((month) => month.dropoff === undefined)) return null
  const byGroup = new Map<string, { atLeast: number[]; ten: number }>()
  for (const month of months) {
    for (const line of month.dropoff!.lines) {
      const sum = byGroup.get(line.group) ?? { atLeast: Array<number>(STEPS).fill(0), ten: 0 }
      for (let i = 0; i < STEPS; i++) sum.atLeast[i]! += line.atLeast[i]!
      sum.ten += line.ten
      byGroup.set(line.group, sum)
    }
  }
  return [...byGroup].map(([group, sum]) => {
    const atLeast = sum.atLeast as DropoffLine['atLeast']
    return { group, n: atLeast[0], atLeast, ten: sum.ten, once: atLeast[0] - atLeast[1], average: null, drop: dropOf(atLeast) }
  })
}

const biggestFirst = (a: RxSplitLine, b: RxSplitLine) => b.total - a.total || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

// 처방별 신환·재진(달 하나): 처방 줄 = 달 줄 rx, 머리 글 합계 = 그 달 날 줄 합(내원·신환, 통계 탭 periodTotals와 같은 모양)
function monthSplit(month: MonthPayload, days: readonly DayPayload[], span: DateRange): RxSplitView {
  let visits = 0
  let newPatients = 0
  for (const row of days) {
    if (!within(row.day, span)) continue
    visits += row.totals.patients
    newPatients += row.totals.newPatients
  }
  const lines = month.rx
    .map((x): RxSplitLine => ({ code: x.code, label: x.name || x.code, newPatients: x.newPatients, returning: x.returning, total: x.patients }))
    .sort(biggestFirst)
  const split: RxSplit = { from: span.from, to: span.to, visits, patients: visits, newPatients, returning: visits - newPatients, lines, invalidCodes: 0 }
  return { kind: 'split', split, days: [], text: formatRxVisitSplit('', split), headline: rxVisitHeadline(split) }
}

/**
 * 보는 의원의 저장 줄로 비트 전용 칸 저장 합계를 만든다. input = 통계 탭이 읽은 날 줄·덮은 기간·그릴 기간,
 * lastDay = 마지막 끝난 날, monthRows = 고른 달들의 admin_rows('stats_months') 줄(온전한 달이 아니면 읽지 않아 빈 목록, 읽기 실패면 null)
 */
export function viewSums(input: StatsInput, lastDay: string, monthRows: readonly AdminRow[] | null): ViewSums {
  const span = sumSpan(input.range, lastDay)
  if (span === null) return NOTHING
  const months = wholeMonths(span)
  const saved = months === null || monthRows === null ? null : completeMonths(monthRows, months)
  return {
    sunap: daySunap(input, span),
    dropoff: saved === null ? null : dropoffSum(saved),
    split: saved === null || saved.length !== 1 ? null : monthSplit(saved[0]!, input.days, span),
  }
}

/** 고른 달들의 달 줄을 12달씩 나눠 읽는다(한 번 400일 아래). 다른 의원 줄은 버린다 */
export async function readViewMonths(hospitalId: string, months: readonly string[]): Promise<AdminRow[]> {
  const reads: Promise<AdminRow[]>[] = []
  for (let i = 0; i < months.length; i += READ_MONTHS) {
    const part = months.slice(i, i + READ_MONTHS)
    reads.push(readAdminRows('stats_months', [hospitalId], monthRange(part[0]!).from, monthRange(part[part.length - 1]!).to))
  }
  return (await Promise.all(reads)).flat().filter((row) => row.hospitalId === hospitalId)
}

/**
 * 보는 중이면 저장 합계, 보는 중이 아니면 undefined(통계 탭이 지금과 같다). 'waiting' = 달 줄을 읽는 중.
 * 온전한 달을 고르면 그 달 줄을 읽고(고른 달·[다시 읽기] 때마다 다시), 늦게 온 앞 답은 버린다. 읽지 못하면 달 합계 칸은 안내 글이다
 */
export function useViewSums(input: StatsInput | null, lastDay: string, revision: number): ViewSums | 'waiting' | undefined {
  const viewed = useViewing()?.hospitalId ?? null
  const months = input === null ? null : wholeMonths(sumSpan(input.range, lastDay))
  const monthsKey = months === null ? null : months.join(',')
  const key = viewed === null || monthsKey === null ? null : `${viewed}|${monthsKey}|${revision}`
  const [held, setHeld] = useState<{ key: string; rows: AdminRow[] | null } | null>(null)

  useEffect(() => {
    if (key === null || viewed === null || monthsKey === null) return
    let current = true
    readViewMonths(viewed, monthsKey.split(',')).then(
      (rows) => {
        if (current) setHeld({ key, rows })
      },
      () => {
        if (current) setHeld({ key, rows: null })
      },
    )
    return () => {
      current = false
    }
  }, [key, viewed, monthsKey])

  const rows = key === null ? NO_ROWS : held !== null && held.key === key ? held.rows : undefined
  return useMemo(() => {
    if (viewed === null || input === null) return undefined
    if (rows === undefined) return 'waiting'
    return viewSums(input, lastDay, rows)
  }, [viewed, input, lastDay, rows])
}
