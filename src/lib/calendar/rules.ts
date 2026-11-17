import { addDays, diffDays, isYmd, todayInKorea, weekdayOf } from '@/lib/analytics/dates'
import type { ApptAuto, ApptDraft, BitGhost, CalAllDay, CalAppt, CalWarnings, ShownStatus } from './shapes'

// 예약표 규칙(spec clinic-calendar REQ-5902). 순수 함수다. 끝 = 시작 + 길이(분), 겹침은 [시작, 끝)끼리.
// 한국 날짜는 lib/analytics/dates.ts, 한국 시각(분)은 아래 KOREA_CLOCK으로 본다(PC 시간대와 상관없이)

const DAY_MIN = 1440
const KOREA_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf 1=월 … 7=일
const BIRTH = /^(\d{4})(\d{2})(\d{2})$/

const pad = (n: number) => String(n).padStart(2, '0')

/** 한국 시각 그날 0시부터 지난 분(초는 소수) */
function minutesInKorea(now: Date): number {
  const parts = Object.fromEntries(KOREA_CLOCK.formatToParts(now).map((p) => [p.type, p.value]))
  return Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60
}

type WarnDraft = Pick<CalAppt, 'day' | 'start' | 'len' | 'staffId'> & { id?: string | null }
type WarnAppt = Pick<CalAppt, 'id' | 'day' | 'start' | 'len' | 'staffId' | 'status'>
type WarnAllDay = Pick<CalAllDay, 'day' | 'type' | 'staffId'>

/** 저장 전 경고(저장은 막지 않는다). 같은 날 같은 시행자의 취소 아닌 다른 예약과 겹치면 overlap, 그날 그 시행자 휴무면 off.
 * 고치는 예약 자신(draft.id)과는 견주지 않는다. 시행자를 아직 안 골랐으면 경고 없음 */
export function warnings(draft: WarnDraft, appts: readonly WarnAppt[], allday: readonly WarnAllDay[]): CalWarnings {
  if (!draft.staffId) return { overlap: [], off: false }
  const end = draft.start + draft.len
  const overlap = appts
    .filter(
      (a) =>
        a.id !== draft.id &&
        a.day === draft.day &&
        a.staffId === draft.staffId &&
        a.status !== 'cancel' &&
        a.start < end &&
        draft.start < a.start + a.len,
    )
    .sort((a, b) => a.start - b.start)
    .map((a) => a.id)
  const off = allday.some((d) => d.type === 'off' && d.day === draft.day && d.staffId === draft.staffId)
  return { overlap, off }
}

/** 도착 자동 값. 상태가 auto가 아니거나 차트번호가 없으면 null. 그날 비트 접수 차트번호에 있으면 came,
 * 없고 한국 시각 now가 그날 끝(시작 + 길이)보다 뒤면 noshow, 아니면 null(아직) */
export function arrivalOf(
  appt: Pick<CalAppt, 'day' | 'start' | 'len' | 'chart' | 'status'>,
  cameCharts: ReadonlySet<string>,
  now: Date,
): ApptAuto {
  if (appt.status !== 'auto' || !appt.chart) return null
  if (cameCharts.has(appt.chart)) return 'came'
  const elapsed = diffDays(appt.day, todayInKorea(now)) * DAY_MIN + minutesInKorea(now) // 그날 0시부터 지난 분
  return elapsed > appt.start + appt.len ? 'noshow' : null
}

/** 보이는 표시: 손으로 고른 상태(cancel·came·noshow)가 먼저, auto면 비트 PC가 적은 도착 칸(없으면 none) */
export function shownStatus(appt: Pick<CalAppt, 'status' | 'auto'>): ShownStatus {
  if (appt.status !== 'auto') return appt.status
  return appt.auto ?? 'none'
}

/** [다음 주에도]: 날짜만 7일 뒤, 상태 auto. 도착·처음 자리·id 칸은 넣지 않는다(새 예약) */
export function nextWeek(appt: ApptDraft): ApptDraft {
  return {
    day: addDays(appt.day, 7),
    start: appt.start,
    len: appt.len,
    name: appt.name,
    chart: appt.chart,
    staffId: appt.staffId,
    staffName: appt.staffName,
    staffMark: appt.staffMark,
    kindId: appt.kindId,
    kindName: appt.kindName,
    memo: appt.memo,
    status: 'auto',
  }
}

/** 같은 날 같은 차트번호의 취소 아닌 예약이 있으면 그 비트 예약 칸은 뺀다. 차트번호 없는 비트 예약은 남긴다 */
export function visibleGhosts<G extends Pick<BitGhost, 'day' | 'chart'>>(
  ghosts: readonly G[],
  appts: readonly Pick<CalAppt, 'day' | 'chart' | 'status'>[],
): G[] {
  const booked = new Set(appts.filter((a) => a.chart && a.status !== 'cancel').map((a) => `${a.day}|${a.chart}`))
  return ghosts.filter((g) => !g.chart || !booked.has(`${g.day}|${g.chart}`))
}

/** 만 나이. birth 'YYYYMMDD'(비트 생일), today 'YYYY-MM-DD'. 생일 전이면 한 살 적게. 날짜가 아니거나 오늘 뒤 생일이면 null */
export function ageOn(birth: string, today: string): number | null {
  const m = BIRTH.exec(birth)
  if (!m || !isYmd(today)) return null
  const born = `${m[1]}-${m[2]}-${m[3]}`
  if (!isYmd(born) || born > today) return null
  const years = Number(today.slice(0, 4)) - Number(m[1])
  return today.slice(5) < born.slice(5) ? years - 1 : years
}

/** 처음 자리 글: '11/18 (수) 15:00'(달·날은 앞 0 없이, 시각은 두 자리) */
export function slotLabel(day: string, start: number): string {
  const weekday = WEEKDAY[weekdayOf(day) - 1]
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} (${weekday}) ${pad(Math.floor(start / 60))}:${pad(start % 60)}`
}
