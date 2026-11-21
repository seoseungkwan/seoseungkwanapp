import { addDays, addMonthsToDay, isYmd, monthRange } from '@/lib/analytics/dates'

// 명단 알림·근속·보관 (staff REQ-7607, design.md 4절). 순수 함수 — 네트워크·저장소·React를 쓰지 않는다.
// 형은 `@/types/staff`를 불러오지 않고 design.md 3절 StaffMember와 같은 이름으로 필요한 칸만 둔다. 날짜는 'YYYY-MM-DD'.

export type RosterMember = { id: string; hiredOn: string; leftOn: string | null; birthday: string | null }
export type RosterAlert = { day: string; staffId: string; kind: 'birthday' | 'anniversary'; years?: number }

const ALERT_DAYS = 7 // 오늘~오늘+6일
const KEEP_YEARS = 3

const yearOf = (ymd: string) => Number(ymd.slice(0, 4))

// 그 해의 같은 달·날(2월 29일은 평년에 2월 28일)
const inYear = (ymd: string, year: number) => addMonthsToDay(ymd, (year - yearOf(ymd)) * 12)

/** 재직 = 퇴사일이 없거나 오늘(포함) 이후 (AC-7607.3) */
const isActive = (member: Pick<RosterMember, 'leftOn'>, today: string) => member.leftOn === null || member.leftOn >= today

/**
 * 앞으로 7일(오늘~오늘+6일) 재직자의 생일과 입사 기념일(1주년부터) 알림, 날짜 차례 — 같은 날은 생일 먼저(AC-7607.1).
 * 2월 29일 생일·입사일은 평년에 2월 28일
 */
export function upcoming(members: readonly RosterMember[], today: string): RosterAlert[] {
  const last = addDays(today, ALERT_DAYS - 1)
  const within = (day: string) => today <= day && day <= last
  const years = [yearOf(today), yearOf(last)].filter((year, i, all) => all.indexOf(year) === i)
  const alerts: RosterAlert[] = []
  for (const member of members) {
    if (!isActive(member, today)) continue
    for (const year of years) {
      if (member.birthday !== null && isYmd(member.birthday)) {
        const day = inYear(member.birthday, year)
        if (within(day)) alerts.push({ day, staffId: member.id, kind: 'birthday' })
      }
      const n = year - yearOf(member.hiredOn)
      if (n >= 1) {
        const day = inYear(member.hiredOn, year)
        if (within(day)) alerts.push({ day, staffId: member.id, kind: 'anniversary', years: n })
      }
    }
  }
  const kindOrder = (alert: RosterAlert) => (alert.kind === 'birthday' ? 0 : 1)
  return alerts.sort((a, b) => (a.day === b.day ? kindOrder(a) - kindOrder(b) : a.day < b.day ? -1 : 1))
}

/** 입사일부터 오늘까지 다 찬 근속 '{n}년 {m}개월'(1년 미만은 '{m}개월', AC-7607.2). 입사 전이면 '0개월' */
export function tenure(hiredOn: string, today: string): string {
  let months = (yearOf(today) - yearOf(hiredOn)) * 12 + Number(today.slice(5, 7)) - Number(hiredOn.slice(5, 7))
  if (months > 0 && addMonthsToDay(hiredOn, months) > today) months -= 1
  months = Math.max(0, months)
  const years = Math.floor(months / 12)
  return years >= 1 ? `${years}년 ${months % 12}개월` : `${months}개월`
}

/** 퇴사자 보관 끝 = 퇴사일 + 3년 (2월 29일 퇴사는 2월 28일, AC-7607.3) */
export function keepUntil(leftOn: string): string {
  return addMonthsToDay(leftOn, KEEP_YEARS * 12)
}

/** 오늘이 보관 끝 뒤면 '지울 때' — DB 지우기 정책(left_on + 3년 < 오늘)과 같다 */
export function canPurge(member: Pick<RosterMember, 'leftOn'>, today: string): boolean {
  return member.leftOn !== null && keepUntil(member.leftOn) < today
}

/** 재직(입사일 빠른 차례)과 퇴사(퇴사일 늦은 차례)로 나눈다. 같은 날은 받은 차례 그대로 */
export function splitActive<M extends Pick<RosterMember, 'hiredOn' | 'leftOn'>>(members: readonly M[], today: string): { active: M[]; left: M[] } {
  const active = members.filter((m) => isActive(m, today))
  const left = members.filter((m) => !isActive(m, today))
  active.sort((a, b) => (a.hiredOn === b.hiredOn ? 0 : a.hiredOn < b.hiredOn ? -1 : 1))
  left.sort((a, b) => ((a.leftOn as string) === b.leftOn ? 0 : (a.leftOn as string) > (b.leftOn as string) ? -1 : 1))
  return { active, left }
}

/** 그달('YYYY-MM') 재직 = 입사일 ≤ 달 끝, 퇴사일 없음 또는 ≥ 달 첫날 (세무사 자료·이달 급여의 사람) */
export function employedIn(member: Pick<RosterMember, 'hiredOn' | 'leftOn'>, month: string): boolean {
  const { from, to } = monthRange(month)
  return member.hiredOn <= to && (member.leftOn === null || member.leftOn >= from)
}
