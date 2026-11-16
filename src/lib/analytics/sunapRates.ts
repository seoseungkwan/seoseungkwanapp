import type { PatientDay, RxGroupDef } from '@/types/analysis'
import type { ConsumptionRow } from '@/types/consumption'
import type { SunapRates } from '@/types/sunap'
import { groupMatches } from './groupMatch'

export type { SunapRates } from '@/types/sunap'

// 통계 탭 '예약·전환'의 Block 전환 수 [환자 자료 구역] (spec sunap-ilji AC-4906.3·AC-4906.4).
// 통계 Worker가 이미 가진 접수 줄(PatientDay, 환자·날마다 한 줄)과 처방 줄(ConsumptionRow)로 센다. 결과에는 수만 남는다.
// 구분은 통계 환자 구성(aggregate 접수 줄 셈)과 같다: 첫 내원일이면 초진, 아니고 그날 90일초진 접수가 있으면 90일초진, 아니면 재진.
// Block·물리치료는 그 환자·날의 외래 처방코드로 groupMatches(입원 줄은 aggregate처럼 보지 않는다). 기간은 양 끝 포함
export type SunapRatesInput = {
  from: string
  to: string
  days: readonly PatientDay[]
  rows: readonly Pick<ConsumptionRow, 'patient' | 'date' | 'rxCode' | 'outpatient'>[]
  block: RxGroupDef | null
  pt: RxGroupDef | null
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to

export function sunapRates({ from, to, days, rows, block, pt }: SunapRatesInput): SunapRates {
  // 날짜 → 환자 → 그날 받은 외래 처방코드
  const codes = new Map<string, Map<number, string[]>>()
  for (const { patient, date, rxCode, outpatient } of rows) {
    if (outpatient === false || !inRange(date, from, to)) continue
    let byPatient = codes.get(date)
    if (byPatient === undefined) {
      byPatient = new Map()
      codes.set(date, byPatient)
    }
    const list = byPatient.get(patient)
    if (list === undefined) byPatient.set(patient, [rxCode])
    else list.push(rxCode)
  }

  const counts: SunapRates = { visits: 0, first_n: 0, d90_n: 0, ret_n: 0, block_n: 0, pt_n: 0, first_block: 0, d90_block: 0, ret_block: 0 }
  for (const { patient, date, firstVisit, first90 } of days) {
    if (!inRange(date, from, to)) continue
    const got = codes.get(date)?.get(patient) ?? []
    const isBlock = groupMatches(block, got)
    counts.visits++
    if (isBlock) counts.block_n++
    if (groupMatches(pt, got)) counts.pt_n++
    if (firstVisit) {
      counts.first_n++
      if (isBlock) counts.first_block++
    } else if ((first90 ?? 0) > 0) {
      counts.d90_n++
      if (isBlock) counts.d90_block++
    } else {
      counts.ret_n++
      if (isBlock) counts.ret_block++
    }
  }
  return counts
}
