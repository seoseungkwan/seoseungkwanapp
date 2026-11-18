import type { RxGroupDef } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { PatientValue, PatientValueLine } from '@/types/stats'
import { addDays, compareYmd } from './dates'
import { groupMatches } from './groupMatch'

// 신환 1명당 매출 [환자 자료 구역] (stats-insights REQ-6106 AC-6106.3). Worker 메모리의 접수 줄(환자·날)·진료 줄(환자·날·처방)·금액 줄(환자·날·금액)로
// 신환이 처음 온 날부터 90일 동안 낸 진료비를 센다. 결과에는 묶음 열쇠와 숫자뿐이다(환자 번호·환자별 금액 없음).
// 첫 내원일은 부르는 쪽이 준다(Worker의 toFirstVisits: v5 답이면 가장 이른 신환 날). 묶음 규칙은 groupMatches(빼는 처방·조건). 금액은 원 단위 정수다

/** 접수 줄 한 칸에서 쓰는 것(PatientDay가 그대로 들어온다). 한 줄 = 그 환자가 그날 내원 */
export type ValueDay = { patient: number; date: string }
/** 진료 줄 한 칸에서 쓰는 것(ConsumptionRow가 그대로 들어온다) */
export type ValueRow = { patient: number; date: string; rxCode: string }
/** 금액 줄(Worker의 toPatientPays): p = 메모리 번호, d = 수납일 YYYY-MM-DD, amount = 그 환자·날 진료비 총액(원 단위 정수, 음수일 수 있다) */
export type ValuePay = { p: number; d: string; amount: number }

export type PatientValueInput = {
  days: readonly ValueDay[]
  rows: readonly ValueRow[]
  pays: readonly ValuePay[]
  first: ReadonlyMap<number, string> // 환자 → 첫 내원일(YYYY-MM-DD). 없는 환자는 신환이 아니다
  groups: readonly RxGroupDef[]
  range: DateRange // 메모리 기간. to = 자료 끝 날
}

const SPAN = 90 // 첫 내원일부터 90일(첫 내원일 + 89일까지)
const MIN_PEOPLE = 5 // 이 인원 이상인 조합만 따로 한 줄
const MAX_LINES = 5 // 따로 두는 조합 수

type Person = { from: string; to: string; sum: number; days: Set<string>; codes: Map<string, string[]> }
type Combo = { picks: number[]; n: number; sum: number }

// 금액·횟수 ÷ 사람·날 수. 원 미만·소수 1자리 아래는 0 쪽으로 버린다(plan.md §5). 정수끼리 나눈 값이라 오차로 다음 수가 되지 않는다
const per = (sum: number, count: number) => (count === 0 ? 0 : Math.trunc(sum / count))
const perOne = (sum: number, count: number) => (count === 0 ? 0 : Math.trunc((sum * 10) / count) / 10)

// 대상 환자마다 90일(첫날·끝날)과 빈 셈 칸
function targetsOf({ first, range }: PatientValueInput): Map<number, Person> {
  const lastFirst = addDays(range.to, -(SPAN - 1))
  const people = new Map<number, Person>()
  for (const [patient, from] of first) {
    if (compareYmd(from, range.from) < 0 || compareYmd(from, lastFirst) > 0) continue
    people.set(patient, { from, to: addDays(from, SPAN - 1), sum: 0, days: new Set(), codes: new Map() })
  }
  return people
}

// 그 환자가 대상이고 그날이 그 90일 안이면 셈 칸
function within(people: ReadonlyMap<number, Person>, patient: number, date: string): Person | null {
  const person = people.get(patient)
  if (person === undefined || compareYmd(date, person.from) < 0 || compareYmd(date, person.to) > 0) return null
  return person
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

export function patientValue(input: PatientValueInput): PatientValue {
  const people = targetsOf(input)
  for (const { patient, date } of input.days) within(people, patient, date)?.days.add(date)
  for (const { p, d, amount } of input.pays) {
    const person = within(people, p, d)
    if (person !== null) person.sum += amount
  }
  for (const { patient, date, rxCode } of input.rows) {
    const person = within(people, patient, date)
    if (person === null) continue
    const codes = person.codes.get(date)
    if (codes === undefined) person.codes.set(date, [rxCode])
    else codes.push(rxCode)
  }

  // 받은 치료 = 그 90일에 그 묶음으로 센 날이 하루라도 있는 묶음들(묶음 차례)
  const combos = new Map<string, Combo>()
  let sum = 0
  let visits = 0
  for (const person of people.values()) {
    sum += person.sum
    visits += person.days.size
    const days = [...person.codes.values()]
    const picks = input.groups.flatMap((def, i) => (days.some((codes) => groupMatches(def, codes)) ? [i] : []))
    const key = picks.join(',')
    const combo = combos.get(key)
    if (combo === undefined) combos.set(key, { picks, n: 1, sum: person.sum })
    else {
      combo.n++
      combo.sum += person.sum
    }
  }

  const n = people.size
  return { n, average: per(sum, n), times: perOne(visits, n), perVisit: per(sum, visits), lines: linesOf([...combos.values()], input.groups) }
}
