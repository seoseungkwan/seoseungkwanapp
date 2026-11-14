import type { Delta, Totals, TotalsDelta } from '@/types/analysis'
import type { HistoryView, MonthTotals, TrendMonth } from '@/types/history'
import type { MonthPayload } from '@/types/payload'
import { compareNumbers } from './compare'
import { addMonths } from './dates'

// 병원 계정(서버)에 저장된 달 숫자 → [월] 탭의 지난달·작년 같은 달 대비와 최근 12달 추세. 이 비교의 증감을 만드는 곳은 여기 한 곳이다.
// 증감은 양쪽 달이 모두 완전(partial이 아님)할 때만 낸다. 저장된 달만 본다 — 방금 넣은 파일의 달은 이미 저장돼 있다

const TREND_MONTHS = 12

const UNAVAILABLE: Delta = { kind: 'unavailable' }
const ALL_UNAVAILABLE: TotalsDelta = { patients: UNAVAILABLE, newPatients: UNAVAILABLE, returning: UNAVAILABLE }

// 'YYYY-MM'은 글자 순서가 곧 달 순서다
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// first90(90일초진)은 저장된 달에 있을 때만 옮긴다(spec first90 AC-4402.4). 증감은 지금 세 칸 그대로다
const copyTotals = ({ patients, newPatients, returning, unknown, first90 }: Totals): Totals =>
  first90 === undefined ? { patients, newPatients, returning, unknown } : { patients, newPatients, first90, returning, unknown }

function totalsDelta(current: Totals, previous: Totals): TotalsDelta {
  return {
    patients: compareNumbers(current.patients, previous.patients),
    newPatients: compareNumbers(current.newPatients, previous.newPatients),
    returning: compareNumbers(current.returning, previous.returning),
  }
}

export function buildHistory(months: MonthPayload[]): HistoryView {
  const sorted = [...months].sort((a, b) => compareText(a.month, b.month))
  const byMonth = new Map(sorted.map((m) => [m.month, m]))
  // 저장돼 있고 완전한 달만(일부 달의 숫자로 비교하지 않는다)
  const complete = (month: string): MonthTotals | null => {
    const saved = byMonth.get(month)
    return saved === undefined || saved.partial ? null : { month, totals: copyTotals(saved.totals) }
  }

  const latest = sorted.at(-1)?.month ?? null
  const trend: TrendMonth[] = []
  if (latest !== null) {
    for (let back = TREND_MONTHS - 1; back >= 0; back--) {
      const month = addMonths(latest, -back)
      const saved = byMonth.get(month)
      trend.push({ month, patients: saved?.totals.patients ?? null, newPatients: saved?.totals.newPatients ?? null, partial: saved?.partial ?? false })
    }
  }

  const found = sorted.filter((m) => !m.partial).at(-1)
  if (found === undefined) {
    return { base: null, lastMonth: null, vsLastMonth: ALL_UNAVAILABLE, lastYear: null, vsLastYear: ALL_UNAVAILABLE, trend }
  }
  const base: MonthTotals = { month: found.month, totals: copyTotals(found.totals) }
  const lastMonth = complete(addMonths(base.month, -1))
  const lastYear = complete(addMonths(base.month, -12))
  return {
    base,
    lastMonth,
    vsLastMonth: lastMonth === null ? ALL_UNAVAILABLE : totalsDelta(base.totals, lastMonth.totals),
    lastYear,
    vsLastYear: lastYear === null ? ALL_UNAVAILABLE : totalsDelta(base.totals, lastYear.totals),
    trend,
  }
}
