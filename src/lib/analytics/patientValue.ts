import type { RxGroupDef } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { MonthValue, PatientValue, PatientValueLine, PeriodValue } from '@/types/stats'
import { addMonths, compareYmd, monthOf, monthRange } from './dates'
import { groupMatches } from './groupMatch'

// 신환 1명당 매출 = 그 달 신환이 그 달에 낸 돈 [환자 자료 구역] (bit-total REQ-6911 AC-6911.1·AC-6911.2). Worker 메모리의 접수 줄(환자·날·신환 날 표시)·
// 진료 줄(환자·날·처방)·금액 줄(환자·수납일·금액)로 달마다 센다. 대상 = 그 달 센 기간에 신환 날 표시가 있는 접수 줄의 환자(두 달에 표시가 있으면 두 달 모두),
// 금액·내원·받은 치료는 그 달 센 기간 안 줄만 센다. 결과에는 달·날·묶음 열쇠와 숫자뿐이다(환자 번호·환자별 금액 없음).
// 고른 기간 그대로(pv-month REQ-7201 AC-7201.1): periodValue는 셈 칸 하나(span)로 같은 규칙을 쓴다 — 대상 = span 안에 신환 날 표시가 있는 환자(여러 날·여러 달이어도 한 명),
// 금액·내원·받은 치료 = 대상의 span 안 줄(표시 날 앞 줄도, 달 안에서 세는 monthValues와 같은 규칙).
// 신환 날 표시는 Worker의 toPatientDays firstVisit(v5 답 = 비트 신환 표시, 통계 탭 '신환'과 같은 표시). 묶음 규칙은 groupMatches(빼는 처방·조건). 금액은 원 단위 정수다

/** 접수 줄 한 칸에서 쓰는 것(PatientDay가 그대로 들어온다). 한 줄 = 그 환자가 그날 내원, firstVisit = 그 줄에 신환 날 표시가 있음 */
export type ValueDay = { patient: number; date: string; firstVisit: boolean }
/** 진료 줄 한 칸에서 쓰는 것(ConsumptionRow가 그대로 들어온다) */
export type ValueRow = { patient: number; date: string; rxCode: string }
/** 금액 줄(Worker의 toPatientPays): p = 메모리 번호, d = 수납일 YYYY-MM-DD, amount = 그 환자·날 진료비 총액(원 단위 정수, 음수일 수 있다) */
export type ValuePay = { p: number; d: string; amount: number }

export type MonthValueInput = {
  days: readonly ValueDay[]
  rows: readonly ValueRow[]
  pays: readonly ValuePay[]
  groups: readonly RxGroupDef[]
  range: DateRange // 메모리 기간. to = 자료 끝 날
}

const MIN_PEOPLE = 5 // 이 인원 이상인 조합만 따로 한 줄
const MAX_LINES = 5 // 따로 두는 조합 수

type Person = { sum: number; days: Set<string>; codes: Map<string, string[]> }
type Combo = { picks: number[]; n: number; sum: number }
// 셈 칸: people = 대상 → 셈. 한 달 칸은 month(그 달)·to(센 끝 날)를 더 든다
type Span = { people: Map<number, Person> }
type Month = Span & { month: string; to: string }
// 날 → 그날이 든 셈 칸(없으면 null)
type SpanOn = (date: string) => Span | null

// 금액·횟수 ÷ 사람·날 수. 원 미만·소수 1자리 아래는 0 쪽으로 버린다(plan.md §5). 정수끼리 나눈 값이라 오차로 다음 수가 되지 않는다
const per = (sum: number, count: number) => (count === 0 ? 0 : Math.trunc(sum / count))
const perOne = (sum: number, count: number) => (count === 0 ? 0 : Math.trunc((sum * 10) / count) / 10)
// 'YYYY-MM-DD'의 달. 줄마다 부르는 셈이라 검사하지 않는다(compareYmd와 같은 까닭, 날짜는 Worker가 이미 바꾼 글자다)
const monthKey = (ymd: string) => ymd.slice(0, 7)

// 메모리 기간에서 그 달 1일이 첫날보다 앞이 아닌 달마다(끝 날이 든 달까지, 옛 → 새) 빈 셈 칸. 센 끝 날 = 말일과 자료 끝 날 가운데 이른 날
function monthsOf(range: DateRange): Map<string, Month> {
  const months = new Map<string, Month>()
  const head = monthOf(range.from)
  for (let month = compareYmd(`${head}-01`, range.from) < 0 ? addMonths(head, 1) : head; compareYmd(`${month}-01`, range.to) <= 0; month = addMonths(month, 1)) {
    const end = monthRange(month).to
    months.set(month, { month, to: compareYmd(end, range.to) <= 0 ? end : range.to, people: new Map() })
  }
  return months
}

// 그날이 든 달이 있고 그날이 그 달 센 기간 안이면 그 달 셈 칸
function monthOn(months: ReadonlyMap<string, Month>, date: string): Month | null {
  const month = months.get(monthKey(date))
  return month === undefined || compareYmd(date, month.to) > 0 ? null : month
}


// 묶음 차례(번호)가 앞선 조합이 먼저: [] < [0] < [0, 3] < [1] …
function byPicks(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!
  }
  return a.length - b.length
}

function linesOf(combos: readonly Combo[], groups: readonly RxGroupDef[]): PatientValueLine[] {
  const ranked = [...combos].sort((a, b) => b.n - a.n || byPicks(a.picks, b.picks))
  const kept = ranked.filter((combo) => combo.n >= MIN_PEOPLE).slice(0, MAX_LINES)
  const rest = ranked.filter((combo) => !kept.includes(combo))
  const lines = kept
    .map((combo) => ({ groups: combo.picks.map((i) => groups[i]!.id), n: combo.n, average: per(combo.sum, combo.n) }))
    .sort((a, b) => a.average - b.average)
  if (rest.length === 0) return lines
  const n = rest.reduce((total, combo) => total + combo.n, 0)
  const sum = rest.reduce((total, combo) => total + combo.sum, 0)
  return [...lines, { groups: null, n, average: per(sum, n) }]
}

// 셈 칸 → 1명당 숫자. 받은 치료 = 그 칸 안에 그 묶음으로 센 날이 하루라도 있는 묶음들(묶음 차례)
function valueOf({ people }: Span, groups: readonly RxGroupDef[]): PatientValue {
  const combos = new Map<string, Combo>()
  let sum = 0
  let visits = 0
  for (const person of people.values()) {
    sum += person.sum
    visits += person.days.size
    const days = [...person.codes.values()]
    const picks = groups.flatMap((def, i) => (days.some((codes) => groupMatches(def, codes)) ? [i] : []))
    const key = picks.join(',')
    const combo = combos.get(key)
    if (combo === undefined) combos.set(key, { picks, n: 1, sum: person.sum })
    else {
      combo.n++
      combo.sum += person.sum
    }
  }
  const n = people.size
  return { n, average: per(sum, n), times: perOne(visits, n), perVisit: per(sum, visits), lines: linesOf([...combos.values()], groups) }
}

// 셈 칸마다 대상(그 칸 안에 신환 날 표시가 있는 환자, 두 날이어도 한 명)을 세운 뒤, 대상의 그 칸 안 내원·금액·진료 줄을 센다
function countInto(spanOn: SpanOn, input: Omit<MonthValueInput, 'range'>): void {
  const within = (patient: number, date: string) => spanOn(date)?.people.get(patient) ?? null
  for (const { patient, date, firstVisit } of input.days) {
    const people = firstVisit ? spanOn(date)?.people : undefined
    if (people !== undefined && !people.has(patient)) people.set(patient, { sum: 0, days: new Set(), codes: new Map() })
  }
  for (const { patient, date } of input.days) within(patient, date)?.days.add(date)
  for (const { p, d, amount } of input.pays) {
    const person = within(p, d)
    if (person !== null) person.sum += amount
  }
  for (const { patient, date, rxCode } of input.rows) {
    const person = within(patient, date)
    if (person === null) continue
    const codes = person.codes.get(date)
    if (codes === undefined) person.codes.set(date, [rxCode])
    else codes.push(rxCode)
  }
}

export function monthValues(input: MonthValueInput): MonthValue[] {
  const months = monthsOf(input.range)
  countInto((date) => monthOn(months, date), input)
  return [...months.values()].map((month) => ({ month: month.month, to: month.to, ...valueOf(month, input.groups) }))
}

/** 고른 기간 span(from~to) 그대로 센 신환 1명당 매출(pv-month AC-7201.1). 답 = 기간·1명당 숫자·묶음 열쇠뿐 */
export function periodValue(input: Omit<MonthValueInput, 'range'> & { span: DateRange }): PeriodValue {
  const { from, to } = input.span
  const span: Span = { people: new Map() }
  countInto((date) => (compareYmd(date, from) >= 0 && compareYmd(date, to) <= 0 ? span : null), input)
  return { from, to, ...valueOf(span, input.groups) }
}
