import { compareYmd, parseDateCell } from '@/lib/analytics/dates'
import type { UisRead, UisSpan, UisVisitDay } from '@/types/uisarang'
import { badRow, badTotal, bodyRows, isCount, numberOf, ok, squash, type Body, type Sheet } from './cells'

// 내원일별 위쪽 표 → 날마다 내원 수(specs/uisarang-upload design.md §4-3) [환자 자료 구역].
// 조회일 안의 줄 없는 날은 휴진 — 0명 줄을 만들지 않는다(덮은 기간이 알려 준다)

const TOTAL = '합계'

export function readVisits(sheet: Sheet, span: UisSpan): Body<UisRead> {
  const { col } = sheet
  const byDay = new Map<string, UisVisitDay>()
  let patientsSum = 0
  let newSum = 0
  for (const { row, n } of bodyRows(sheet)) {
    if (squash(row[col['내원일']]) === TOTAL) {
      const patients = numberOf(row[col['인원수']])
      const newPatients = numberOf(row[col['신규환자']])
      if (Number.isNaN(patients) || Number.isNaN(newPatients)) return badRow(n)
      if (patients !== patientsSum || newPatients !== newSum) return badTotal()
      const days = [...byDay.values()].sort((a, b) => compareYmd(a.day, b.day))
      return ok({ kind: 'visits', span, days })
    }
    const day = parseDateCell(row[col['내원일']])
    if (day === null) continue // 날짜도 합계도 아닌 줄(쪽 표시 등)
    const patients = numberOf(row[col['인원수']])
    const newPatients = numberOf(row[col['신규환자']])
    if (!isCount(patients) || !isCount(newPatients) || newPatients > patients) return badRow(n)
    if (compareYmd(day, span.from) < 0 || compareYmd(day, span.to) > 0 || byDay.has(day)) return badRow(n)
    byDay.set(day, { day, patients, newPatients })
    patientsSum += patients
    newSum += newPatients
  }
  return badTotal()
}
