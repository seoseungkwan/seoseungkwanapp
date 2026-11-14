import { addDays, addMonths, compareYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { codeKey } from './view'

// 신환이 그 처방을 받은 횟수의 화면 숫자 (first90 REQ-4410 AC-4410.2·AC-4410.3·AC-4410.4, design.md 5-8). 순수 함수다.
// 보는 기간의 날 칸을 첫 내원 달(그 날이 든 달)로 묶는다. 신환 = 그 처방 줄 newPatients 합, 1회 = once 합, 2회 이상 = 신환 − 1회.
// 비율은 1회 ÷ 신환을 소수 첫째 자리 아래에서 버린다. 신환이 있는 날에 once가 없으면(이 기능 전에 저장한 날) 그 달 1회는 모른다(null).
// 기간 끝이 오늘 뒤면(최근 12개월의 이번 달 말일) 어제까지 센다. 기간 끝이 오늘이면(고른 기간 · 오늘 마감) 오늘까지다

export type OnceRow = {
  month: string // 'YYYY-MM'
  label: string // 첫 줄·1월 'YYYY년 M월', 그 밖 'M월'
  sub: string | null // 기간에 일부만 든 달: '(13일까지)' · '(15일부터)' · '(7일 – 13일)'
  counting: boolean // 오늘이 든 달 또는 그 앞 달(집계 중)
  newPatients: number
  once: number | null // null = 그 달에 once 없는 날이 있음
  more: number | null // 신환 − 1회
  rate: number | null // 1회 ÷ 신환 × 100(버림, 소수 첫째 자리). 신환 0이거나 1회를 모르면 null
}
export type OnceTotal = Pick<OnceRow, 'newPatients' | 'once' | 'more' | 'rate'>
export type OnceView = { rows: OnceRow[]; total: OnceTotal; missing: boolean }

const dayOf = (ymd: string) => Number(ymd.slice(8, 10))
const monthLabel = (month: string, withYear: boolean) => (withYear ? `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월` : `${Number(month.slice(5, 7))}월`)

// 1회·2회 이상·비율. once null이면 셋 다 null
function counts(newPatients: number, once: number | null): OnceTotal {
  if (once === null) return { newPatients, once: null, more: null, rate: null }
  return { newPatients, once, more: newPatients - once, rate: newPatients > 0 ? Math.floor((once * 1000) / newPatients) / 10 : null }
}

// 기간에 일부만 든 달의 꼬리 글
function subOf(month: string, span: DateRange): string | null {
  const whole = monthRange(month)
  const from = compareYmd(span.from, whole.from) > 0 ? span.from : null
  const to = compareYmd(span.to, whole.to) < 0 ? span.to : null
  if (from !== null && to !== null) return `(${dayOf(from)}일 – ${dayOf(to)}일)`
  if (from !== null) return `(${dayOf(from)}일부터)`
  if (to !== null) return `(${dayOf(to)}일까지)`
  return null
}

export function onceView(days: readonly DayPayload[], code: string, range: DateRange, today: string): OnceView {
  const span: DateRange = { from: range.from, to: compareYmd(range.to, today) > 0 ? addDays(today, -1) : range.to }
  // 같은 날은 뒤의 줄(view.ts rowsIn과 같은 규칙)
  const byDay = new Map<string, DayPayload>()
  for (const row of days) if (compareYmd(row.day, span.from) >= 0 && compareYmd(row.day, span.to) <= 0) byDay.set(row.day, row)
  const sums = new Map<string, { newPatients: number; once: number | null }>()
  const key = codeKey(code)
  for (const row of byDay.values()) {
    const line = row.rx.find((rx) => codeKey(rx.code) === key)
    if (line === undefined) continue
    const month = monthOf(row.day)
    const sum = sums.get(month) ?? { newPatients: 0, once: 0 }
    sum.newPatients += line.newPatients
    sum.once = sum.once === null || (line.once === undefined && line.newPatients > 0) ? null : sum.once + (line.once ?? 0)
    sums.set(month, sum)
  }

  const thisMonth = monthOf(today)
  const counting = new Set([thisMonth, addMonths(thisMonth, -1)])
  const rows: OnceRow[] = []
  for (let month = monthOf(span.from); compareYmd(span.to, span.from) >= 0 && month <= monthOf(span.to); month = addMonths(month, 1)) {
    const sum = sums.get(month) ?? { newPatients: 0, once: 0 }
    rows.push({
      month,
      label: monthLabel(month, rows.length === 0 || month.endsWith('-01')),
      sub: subOf(month, span),
      counting: counting.has(month),
      ...counts(sum.newPatients, sum.once),
    })
  }
  const missing = rows.some((row) => row.once === null)
  const newPatients = rows.reduce((total, row) => total + row.newPatients, 0)
  const once = missing ? null : rows.reduce((total, row) => total + (row.once ?? 0), 0)
  return { rows, total: counts(newPatients, once), missing }
}
