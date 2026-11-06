import type { DayPayload } from '@/types/payload'
import { compareText } from './toMonthPayload'

// 저장 직전에 일 줄의 묶음 칸을 채운다(treatment-trend AC-1205.3). aggregate는 그날 환자가 없는 묶음 줄을 만들지 않아
// "0건"과 "세지 않음"을 가를 수 없다. 그래서 받은 묶음 id(열쇠)마다 모든 날에 한 줄을 두고, 그날 없으면 0줄을 넣는다.
// 받지 않은 id 줄은 남기지 않는다. 줄은 id 글자 차례. 넣은 값은 바꾸지 않고 새 객체를 돌려준다(숫자만 다룬다)

type DayGroup = DayPayload['groups'][number]

export function fillGroupCounts(days: readonly DayPayload[], ids: readonly string[]): DayPayload[] {
  const sortedIds = [...new Set(ids)].sort(compareText)
  return days.map((day) => {
    const counted = new Map(day.groups.map((g) => [g.id, g]))
    const groups = sortedIds.map((id): DayGroup => {
      const g = counted.get(id)
      return g === undefined
        ? { id, patients: 0, newPatients: 0, returning: 0 }
        : { id, patients: g.patients, newPatients: g.newPatients, returning: g.returning }
    })
    return { ...day, groups }
  })
}
