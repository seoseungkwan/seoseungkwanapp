import type { DoctorRow, DoctorTable, DoctorsView } from '@/types/stats'
import type { VisitLine } from './patientMix'

// 원장님별 환자 수·신환·매출 [환자 자료 구역] (stats-bit-sections REQ-2705·AC-2707.2).
// 환자 수는 접수할 때 정한 진료의(접수 줄 doc), 매출은 수납할 때 적힌 진료의(doctorDays)로 나눈다. 금액은 원 단위 정수

export type { DoctorRow, DoctorTable, DoctorsView } from '@/types/stats'

// 수납일(YYYY-MM-DD) · 진료의 코드 · 그날 그 진료의 총진료비(원, 환불이면 음수도)
export type DoctorDay = { d: string; doc: string; amount: number }
// first = 환자 → 첫 내원일(YYYY-MM-DD). doctors = 진료의 코드 → 이름(모르면 null)
export type DoctorInput = {
  from: string
  to: string
  visits: readonly Pick<VisitLine, 'p' | 'd' | 'doc'>[]
  first: ReadonlyMap<number, string>
  doctors: ReadonlyMap<string, string | null>
  doctorDays: readonly DoctorDay[]
}

export const NO_DOCTOR = '진료의 미지정'
const TOTAL_LABEL = '합계'
const HEADER = ['원장님', '실환자', '신환', '내원', '매출', '건당 진료비', '비중'].join('\t') // 표 머리와 같은 이름(stats-revenue AC-4109.2)
const EPSILON = 1e-9 // 0.5485 × 1000 = 548.4999… 같은 부동소수 오차가 반올림을 바꾸지 않게

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const comma = (n: number) => n.toLocaleString('en-US')

type Tally = { patients: Set<number>; newPatients: Set<number>; visits: number; amount: number }

// 건당 진료비 = 매출 ÷ 내원의 원 미만을 버린 값(0 쪽으로), 내원 0이면 null(AC-2705.6). || 0은 −0을 0으로
const perVisitOf = (amount: number, visits: number) => (visits > 0 ? Math.trunc(amount / visits) || 0 : null)

// 진료의 코드 null = 진료의 미지정. 진료의(접수·매출 어느 쪽이든, 미지정 빼고)가 한 분 이하면 single(AC-2705.5)
export function doctorStats(input: DoctorInput): DoctorsView {
  const { from, to } = input
  const tallies = new Map<string | null, Tally>()
  const tallyOf = (doc: string | null) => {
    let tally = tallies.get(doc)
    if (tally === undefined) {
      tally = { patients: new Set(), newPatients: new Set(), visits: 0, amount: 0 }
      tallies.set(doc, tally)
    }
    return tally
  }
  for (const { p, d, doc } of input.visits) {
    if (d < from || d > to) continue
    const tally = tallyOf(doc)
    tally.visits++
    if (p < 0) continue
    tally.patients.add(p)
    if (input.first.get(p) === d) tally.newPatients.add(p) // 첫 내원일이 그 진료의 접수 날 중 하루(AC-2705.1)
  }
  for (const { d, doc, amount } of input.doctorDays) {
    if (d >= from && d <= to) tallyOf(doc).amount += amount
  }
  if ([...tallies.keys()].filter((doc) => doc !== null).length <= 1) return { kind: 'single' }

  const totalAmount = [...tallies.values()].reduce((sum, tally) => sum + tally.amount, 0)
  const shareOf = (amount: number) => (totalAmount !== 0 ? amount / totalAmount : null)
  const labelOf = (doc: string | null) => (doc === null ? NO_DOCTOR : input.doctors.get(doc) || doc)
  const rows: DoctorRow[] = [...tallies].map(([doc, tally]) => ({
    label: labelOf(doc),
    patients: tally.patients.size,
    newPatients: tally.newPatients.size,
    visits: tally.visits,
    amount: tally.amount,
    perVisit: perVisitOf(tally.amount, tally.visits),
    share: shareOf(tally.amount),
  }))
  rows.sort((a, b) => b.patients - a.patients || compareText(a.label, b.label))

  // 합계: 실환자·신환은 기간 전체의 서로 다른 환자(두 분께 받은 분은 한 번), 내원·매출은 줄의 합(AC-2705.4)
  const patients = new Set<number>()
  const newPatients = new Set<number>()
  let visits = 0
  for (const tally of tallies.values()) {
    for (const p of tally.patients) patients.add(p)
    for (const p of tally.newPatients) newPatients.add(p)
    visits += tally.visits
  }
  const total: DoctorRow = {
    label: TOTAL_LABEL,
    patients: patients.size,
    newPatients: newPatients.size,
    visits,
    amount: totalAmount,
    perVisit: perVisitOf(totalAmount, visits),
    share: totalAmount !== 0 ? 1 : null,
  }
  return { kind: 'table', rows, total }
}

// 비중 글자: 소수 한 자리로 반올림한 백분율, 합계 매출이 0이면 '–'(AC-2705.2)
export function doctorShareText(share: number | null): string {
  if (share === null) return '–'
  return `${(Math.round(share * 1000 + EPSILON) / 10).toFixed(1)}%`
}

// [표 복사] 글(AC-2707.2). 숫자는 천 단위 쉼표, 단위 글자 없음. 합계 줄 비중은 화면처럼 100%. 병원 이름은 화면이 넣는다
export function formatDoctors(hospital: string, rangeLabel: string, view: DoctorTable): string {
  const line = (row: DoctorRow, share: string) =>
    [
      row.label,
      comma(row.patients),
      comma(row.newPatients),
      comma(row.visits),
      comma(row.amount),
      row.perVisit === null ? '–' : comma(row.perVisit),
      share,
    ].join('\t')
  return [
    `${hospital} 원장님별 (${rangeLabel})`,
    '',
    HEADER,
    ...view.rows.map((row) => line(row, doctorShareText(row.share))),
    line(view.total, view.total.share === null ? '–' : '100%'),
  ].join('\n')
}
