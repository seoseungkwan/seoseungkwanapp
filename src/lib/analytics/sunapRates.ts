import type { PatientDay, RxGroupDef } from '@/types/analysis'
import type { ConsumptionRow } from '@/types/consumption'
import type { DoctorBreakdown, DoctorRates, SunapRates, VisitKind } from '@/types/sunap'
import { NO_DOCTOR } from './doctorStats'
import { groupMatches } from './groupMatch'
import type { VisitLine } from './patientMix'

export type { DoctorBreakdown, SunapRates } from '@/types/sunap'

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
// 원장님별(spec sunap-doctors AC-5001.4): 같은 입력 + 통계 Worker의 접수 줄(진료의 doc)과 진료의 코드 → 이름(모르면 null)
export type SunapDoctorsInput = SunapRatesInput & {
  visits: readonly Pick<VisitLine, 'p' | 'd' | 'doc'>[]
  doctors: ReadonlyMap<string, string | null>
}
// 원장님별로 셀 내원 한 줄(환자·날 하나). 장부 줄(LedgerRow)도 이 모양을 갖는다. doctor null = 진료의 미지정
export type DoctorVisit = { doctor: string | null; kind: VisitKind; block: boolean; pt: boolean }

const inRange = (date: string, from: string, to: string) => date >= from && date <= to
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 아홉 칸 모두 0 */
export function emptyRates(): SunapRates {
  return { visits: 0, first_n: 0, d90_n: 0, ret_n: 0, block_n: 0, pt_n: 0, first_block: 0, d90_block: 0, ret_block: 0 }
}

/** 내원 한 줄을 아홉 칸에 더한다(rates를 바꾼다). 통계 Block 전환·장부 dayTotals·원장님별 표가 같은 규칙으로 센다 */
export function addVisit(rates: SunapRates, kind: VisitKind, block: boolean, pt: boolean): void {
  rates.visits++
  if (block) rates.block_n++
  if (pt) rates.pt_n++
  if (kind === 'new') {
    rates.first_n++
    if (block) rates.first_block++
  } else if (kind === 'd90') {
    rates.d90_n++
    if (block) rates.d90_block++
  } else {
    rates.ret_n++
    if (block) rates.ret_block++
  }
}

/**
 * 원장님별 표(spec sunap-doctors AC-5001.1~5001.3). 원장님(미지정 빼고)이 한 분 이하면 null.
 * 줄 이름은 이름 → 코드 → '진료의 미지정', 차례는 내원 많은 차례 · 같으면 이름 글자 차례(doctorStats와 같음). total = 줄들의 합
 */
export function doctorBreakdown(visits: Iterable<DoctorVisit>, names: ReadonlyMap<string, string | null>): DoctorBreakdown | null {
  const tallies = new Map<string | null, SunapRates>()
  const total = emptyRates()
  for (const { doctor, kind, block, pt } of visits) {
    let rates = tallies.get(doctor)
    if (rates === undefined) {
      rates = emptyRates()
      tallies.set(doctor, rates)
    }
    addVisit(rates, kind, block, pt)
    addVisit(total, kind, block, pt)
  }
  if ([...tallies.keys()].filter((code) => code !== null).length <= 1) return null
  const labelOf = (code: string | null) => (code === null ? NO_DOCTOR : names.get(code) || code)
  const rows = [...tallies].map(([code, rates]): DoctorRates => ({ code, label: labelOf(code), rates }))
  rows.sort((a, b) => b.rates.visits - a.rates.visits || compareText(a.label, b.label))
  return { rows, total }
}

// 기간 안 환자·날마다 구분·Block·물리치료를 정해 하나씩 넘긴다. 통계 합계 저장(admin-view AC-8018.1)이 날마다 나눠 셀 때도 쓴다
export function eachVisit(
  { from, to, days, rows, block, pt }: SunapRatesInput,
  visit: (line: { patient: number; date: string; kind: VisitKind; block: boolean; pt: boolean }) => void,
): void {
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

  for (const { patient, date, firstVisit, first90 } of days) {
    if (!inRange(date, from, to)) continue
    const got = codes.get(date)?.get(patient) ?? []
    const kind: VisitKind = firstVisit ? 'new' : (first90 ?? 0) > 0 ? 'd90' : 're'
    visit({ patient, date, kind, block: groupMatches(block, got), pt: groupMatches(pt, got) })
  }
}

export function sunapRates(input: SunapRatesInput): SunapRates {
  const counts = emptyRates()
  eachVisit(input, ({ kind, block, pt }) => addVisit(counts, kind, block, pt))
  return counts
}

// 원장님별(spec sunap-doctors AC-5001.4): 환자·날마다 그날 그 환자 접수 줄의 진료의 코드 중 가장 작은 것(null 빼고, 없으면 미지정) 한 분에 센다.
// 셈은 sunapRates와 같아 total은 같은 입력의 sunapRates와 같다. 원장님이 한 분 이하면 null
export function sunapDoctors(input: SunapDoctorsInput): DoctorBreakdown | null {
  // '날짜 환자' → 그날 접수 진료의 중 가장 작은 코드
  const keyOf = (date: string, patient: number) => `${date} ${patient}`
  const doctorOf = new Map<string, string>()
  for (const { p, d, doc } of input.visits) {
    if (doc === null || !inRange(d, input.from, input.to)) continue
    const key = keyOf(d, p)
    const seen = doctorOf.get(key)
    if (seen === undefined || doc < seen) doctorOf.set(key, doc)
  }
  const visits: DoctorVisit[] = []
  eachVisit(input, ({ patient, date, kind, block, pt }) => visits.push({ doctor: doctorOf.get(keyOf(date, patient)) ?? null, kind, block, pt }))
  return doctorBreakdown(visits, input.doctors)
}
