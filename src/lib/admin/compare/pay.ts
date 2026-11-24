import { monthOf } from '@/lib/analytics/dates'
import { lineTotal, type PayItem, type PayLine } from '@/lib/staff/pay'
import { STAFF_JOBS, type StaffJob, type StaffMember } from '@/types/staff'

// 의원 비교 직군별 월급(spec admin-view REQ-8014 AC-8014.2, design.md '의원 비교 — 계산'·기본값 18). 순수 함수.
// 한 사람 금액은 직원 탭과 같은 lib/staff/pay.ts lineTotal(실수령, 그달 보이는 항목 visibleItems) 그대로다. 새 공식을 두지 않는다.
// 직군·고용 형태는 지금 직원 줄 값이고 '기타' 직군은 한 묶음이다. 평균은 원 미만 버림

/** 직원 줄에서 쓰는 칸만(이름·연락처·계좌는 읽지 않는다) */
export type PayMember = Pick<StaffMember, 'id' | 'job' | 'employment' | 'hiredOn' | 'leftOn'>
/** 급여 줄에서 쓰는 칸만 */
export type PayLineIn = Pick<PayLine, 'month' | 'staffId' | 'amounts' | 'incentives' | 'adjust'>
export type JobPay = { count: number; avg: number; min: number; max: number }
/** none = 그달 지급 합계가 0보다 큰 급여 줄이 하나도 없음(화면 '급여 없음'). jobs = 직군 여섯(STAFF_JOBS 차례), 0보다 큰 정규직·계약직이 없으면 null */
export type PayByJob = { none: boolean; jobs: Record<StaffJob, JobPay | null>; partTime: number }

// 그달 일함: 들어온 날 ≤ 달 끝, 나간 날 없음 또는 ≥ 달 첫날
const workedIn = (member: PayMember, month: string) => monthOf(member.hiredOn) <= month && (member.leftOn === null || monthOf(member.leftOn) >= month)

export function payByJob(input: { lines: readonly PayLineIn[]; members: readonly PayMember[]; items: readonly PayItem[]; month: string }): PayByJob {
  const { lines, members, items, month } = input
  const byId = new Map(members.map((member) => [member.id, member]))

  // 사람마다 그달 합계. 다른 달 줄과 직원 줄이 지워진(staffId 없음·목록에 없음) 줄은 뺀다
  const paid = new Map<string, number>()
  for (const line of lines) {
    if (line.month !== month || line.staffId === null || !byId.has(line.staffId)) continue
    paid.set(line.staffId, (paid.get(line.staffId) ?? 0) + lineTotal(line, items, month).total)
  }

  const amounts = new Map<StaffJob, number[]>()
  let none = true
  for (const [staffId, total] of paid) {
    if (!(total > 0)) continue
    none = false
    const member = byId.get(staffId)!
    if (member.employment === 'part') continue // 파트타임은 사람 수만
    amounts.set(member.job, [...(amounts.get(member.job) ?? []), total])
  }

  const jobs = Object.fromEntries(
    STAFF_JOBS.map((job) => {
      const list = none ? [] : (amounts.get(job) ?? [])
      if (list.length === 0) return [job, null]
      const sum = list.reduce((acc, won) => acc + won, 0)
      return [job, { count: list.length, avg: Math.floor(sum / list.length), min: Math.min(...list), max: Math.max(...list) }]
    }),
  ) as Record<StaffJob, JobPay | null>

  const partTime = members.filter((member) => member.employment === 'part' && workedIn(member, month)).length
  return { none, jobs, partTime }
}
