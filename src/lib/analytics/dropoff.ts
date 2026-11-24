import type { RxGroupDef } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { DropoffLine } from '@/types/stats'
import { addDays, compareYmd } from './dates'
import { groupMatches } from './groupMatch'

// 몇 번까지 받나 [환자 자료 구역] (stats-insights REQ-6103 AC-6103.1). Worker 메모리의 진료 줄(환자·날·처방)과 처방 칸 묶음으로
// 묶음마다 '처음 받은 신환'이 그 묶음을 몇 날 받고 끝났는지 센다. 결과에는 묶음 열쇠와 숫자뿐이다(환자 번호 없음).
// 첫 내원일은 부르는 쪽이 준다(Worker의 toFirstVisits: v5 답이면 가장 이른 신환 날, v2~v4는 첫 내원일). 묶음 규칙은 groupMatches(빼는 처방·조건)

/** 진료 줄 한 칸에서 쓰는 것(ConsumptionRow가 그대로 들어온다) */
export type DropoffRow = { patient: number; date: string; rxCode: string }

export type DropoffInput = {
  rows: readonly DropoffRow[]
  first: ReadonlyMap<number, string> // 환자 → 첫 내원일(YYYY-MM-DD). 없는 환자는 신환이 아니다
  groups: readonly RxGroupDef[]
  range: DateRange // 메모리 기간. to = 자료 끝 날
}

const ENDED_AFTER = 30 // 마지막으로 받은 뒤 이 날 수가 지나면 끝난 것으로 본다
const STEPS = 6 // 1~6회 이상
const TEN = 10
const DROP_STEPS = 5 // 가장 많이 빠지는 곳은 1→2 ~ 5→6 가운데

// 대상 환자마다 날 → 그날 받은 처방 코드. 대상 = 첫 내원일이 기간 안인 환자(통계 합계 저장 admin-view AC-8018.2가 첫 진료 달로 나눠 센다)
export function codesByDay({ rows, first, range }: Pick<DropoffInput, 'rows' | 'first' | 'range'>): Map<number, Map<string, string[]>> {
  const inRange = (date: string) => compareYmd(date, range.from) >= 0 && compareYmd(date, range.to) <= 0
  const byPatient = new Map<number, Map<string, string[]>>()
  for (const { patient, date, rxCode } of rows) {
    const firstDay = first.get(patient)
    if (firstDay === undefined || !inRange(firstDay)) continue
    let days = byPatient.get(patient)
    if (days === undefined) {
      days = new Map()
      byPatient.set(patient, days)
    }
    const codes = days.get(date)
    if (codes === undefined) days.set(date, [rxCode])
    else codes.push(rxCode)
  }
  return byPatient
}

// 대상의 횟수들 → 한 줄
function lineOf(group: string, counts: readonly number[]): DropoffLine {
  const n = counts.length
  const atLeast = Array.from({ length: STEPS }, (_, i) => counts.filter((count) => count >= i + 1).length) as DropoffLine['atLeast']
  const sum = counts.reduce((total, count) => total + count, 0)
  let drop = 1
  for (let k = 2; k <= DROP_STEPS; k++) {
    if (atLeast[k - 1]! - atLeast[k]! > atLeast[drop - 1]! - atLeast[drop]!) drop = k
  }
  return {
    group,
    n,
    atLeast,
    ten: counts.filter((count) => count >= TEN).length,
    once: atLeast[0] - atLeast[1],
    average: Math.round((sum * 10) / n) / 10,
    drop,
  }
}

// 고른 대상 환자들(환자마다 날 → 처방, codesByDay의 값)을 묶음마다 센다. asOf = 자료 끝 날(이 날 − 30일 뒤에 받은 환자는 아직 다니는 중)
export function dropoffLines(
  patients: Iterable<ReadonlyMap<string, readonly string[]>>,
  groups: readonly RxGroupDef[],
  asOf: string,
): DropoffLine[] {
  const lastDay = addDays(asOf, -ENDED_AFTER)
  const list = [...patients]
  return groups.flatMap((def) => {
    const counts: number[] = []
    for (const days of list) {
      let count = 0
      let last: string | null = null
      for (const [date, codes] of days) {
        if (!groupMatches(def, codes)) continue
        count++
        if (last === null || compareYmd(date, last) > 0) last = date
      }
      if (last !== null && compareYmd(last, lastDay) <= 0) counts.push(count)
    }
    return counts.length === 0 ? [] : [lineOf(def.id, counts)]
  })
}

export function dropoff(input: DropoffInput): DropoffLine[] {
  return dropoffLines(codesByDay(input).values(), input.groups, input.range.to)
}
