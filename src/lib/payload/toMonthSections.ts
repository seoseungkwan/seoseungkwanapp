import { compareYmd, monthRange } from '@/lib/analytics/dates'
import { doctorStats, NO_DOCTOR, type DoctorDay } from '@/lib/analytics/doctorStats'
import { NO_INSURANCE, patientMix, type MixRow, type Person, type VisitLine } from '@/lib/analytics/patientMix'
import { visitHours } from '@/lib/analytics/visitHours'
import type { MonthSections } from '@/types/payload'
import { isText, MIN_REGION_PATIENTS } from './validate'

// 통계 탭 비트 전용 세 칸(환자 구성 · 시간대별 접수 · 원장님별)의 달 합계 [환자 자료 구역] (spec stats-bit-ai REQ-2901).
// 접수 줄·사람 표·진료의 표는 세는 데만 쓰고 결과에는 묶음 이름과 수, 원장님 이름·매출만 남긴다(AC-2901.7).
// 셈은 통계 화면 세 칸과 같다: patientMix [전체] · visitHours · doctorStats를 그 달 셈 기간으로 부른다

// months = 저장할 달 줄(달·partial). from·to = 불러온 범위, today = 오늘(이 뒤 날은 세지 않는다)
export type SectionsInput = {
  months: ReadonlyArray<{ month: string; partial: boolean }>
  from: string
  to: string
  today: string
  visits: readonly VisitLine[]
  people: ReadonlyMap<number, Person>
  first: ReadonlyMap<number, string>
  doctors: ReadonlyMap<string, string | null>
  doctorDays: readonly DoctorDay[]
}

type Named = { name: string }

const later = (a: string, b: string) => (compareYmd(a, b) >= 0 ? a : b)
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)

// 같은 이름이 둘 이상인 줄은 모두 뺀다(AI 지표 ID가 겹치지 않게, AC-2901.5)
function withUniqueNames<T extends Named>(rows: readonly T[]): T[] {
  const seen = new Map<string, number>()
  for (const row of rows) seen.set(row.name, (seen.get(row.name) ?? 0) + 1)
  return rows.filter((row) => seen.get(row.name) === 1)
}

// 보통 줄이고 5명 이상이며 이름이 글자 검사를 넘는 줄(AC-2901.2·AC-2901.5)
function largeRows(rows: readonly MixRow[], skip: ReadonlySet<string> = new Set()) {
  const kept = rows
    .filter((row) => row.kind === 'row' && row.people >= MIN_REGION_PATIENTS && !skip.has(row.label) && isText(row.label, true))
    .map((row) => ({ name: row.label, people: row.people }))
  return withUniqueNames(kept)
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

function sectionsOf(input: SectionsInput, month: string, partial: boolean, names: ReadonlySet<string>): MonthSections {
  const range = monthRange(month)
  const from = later(range.from, input.from)
  const to = earlier(earlier(range.to, input.to), input.today)
  const { visits, people, first } = input

  const mix = patientMix({ from, to, visits, people, first }, 'all')
  const hours = visitHours(visits, from, to)
  const doctors = doctorStats({ from, to, visits, first, doctors: input.doctors, doctorDays: input.doctorDays })

  // 원장님 줄: 이름이 진료의 표에 있는 줄과 진료의 미지정만. 이름이 없어 코드로 보이는 줄은 뺀다(코드는 서버로 가지 않는다, AC-2901.4)
  const doctorRows =
    doctors.kind === 'single'
      ? []
      : doctors.rows
          .filter((row) => (row.label === NO_DOCTOR || names.has(row.label)) && isText(row.label, true))
          .map((row) => ({ name: row.label, patients: row.patients, newPatients: row.newPatients, amount: row.amount }))

  return {
    v: 1,
    month,
    partial,
    mix: {
      people: mix.total.people,
      age: mix.age.map((row) => ({ name: row.label, people: row.people })),
      insurance: largeRows(mix.insurance, new Set([NO_INSURANCE])),
      town: largeRows(mix.town),
    },
    hours: {
      openDays: hours.rows.map((row) => row.openDays),
      weekdays: hours.rows.map((row) => sum(row.cells)),
      hours: hours.hours.map((_, i) => sum(hours.rows.map((row) => row.cells[i]))),
      unknown: hours.unknown,
    },
    doctors: withUniqueNames(doctorRows),
  }
}

// 달 줄마다 같은 달의 sections 하나, 달 줄 차례 그대로(AC-2901.1)
export function toMonthSections(input: SectionsInput): MonthSections[] {
  const names = new Set([...input.doctors.values()].filter((name): name is string => typeof name === 'string' && name !== ''))
  return input.months.map(({ month, partial }) => sectionsOf(input, month, partial, names))
}
