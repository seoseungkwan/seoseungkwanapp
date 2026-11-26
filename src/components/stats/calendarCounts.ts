import { isYmd } from '@/lib/analytics/dates'
import type { AdminRow } from '@/lib/storage/adminRows'
import type { ApptAuto, ApptStatus, CalCountRow } from '@/types/calendar'

// 보는 중 통계 '예약' 칸의 줄 검사 (admin-view REQ-8008 AC-8008.2, design.md '탭마다 읽기만').
// admin_rows('calendar_counts')가 준 줄(day·staff_id·staff_name·kind_id·kind_name·status·auto·orig_day — 이름·차트번호·메모 없음)을
// 지금 예약 줄 검사(lib/storage/calendar.ts listCalendarCounts의 toCount)와 같은 규칙으로 CalCountRow로 받는다. 틀린 줄은 뺀다.
// toCount는 그 파일 안에만 있어(내보내지 않음) 같은 규칙을 여기 옮겨 두고, viewMode.test가 같은 줄로 listCalendarCounts와 견준다.
// 글자 수 한도도 그 파일 값(CAL_ID_MAX 40 · CAL_LABEL_MAX 10)과 같다 — 그 파일을 흉내 내는 시험이 많아 값만 옮겼다. 다른 칸은 옮기지 않는다.
// google-link(AC-8503.3·AC-8503.4): 시행자 두 칸은 함께 null(시행자 없음)이어도 받고, g_moved는 칸이 없거나 null이면 거짓·참/거짓 밖이면 그 줄을 뺀다

const ID_MAX = 40 // 시행자·종류 id (calendar.ts CAL_ID_MAX)
const LABEL_MAX = 10 // 시행자·종류 이름 (calendar.ts CAL_LABEL_MAX)
const STATUSES: readonly ApptStatus[] = ['auto', 'came', 'noshow', 'cancel']

const isText = (value: unknown, min: number, max: number): value is string => {
  if (typeof value !== 'string') return false
  const length = [...value].length
  return length >= min && length <= max
}
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const isStatus = (value: unknown): value is ApptStatus => (STATUSES as readonly unknown[]).includes(value)
const isAuto = (value: unknown): value is ApptAuto => value === null || value === 'came' || value === 'noshow'

function toCount(row: Record<string, unknown>): CalCountRow | null {
  const { day, staff_id: staffId, staff_name: staffName, kind_id: kindId, kind_name: kindName, status, auto, orig_day: origDay, g_moved: gMoved } = row
  const staffOk = (staffId === null && staffName === null) || (isText(staffId, 1, ID_MAX) && isText(staffName, 1, LABEL_MAX))
  if (
    !isDay(day) ||
    !staffOk ||
    !isText(kindId, 1, ID_MAX) ||
    !isText(kindName, 1, LABEL_MAX) ||
    !isStatus(status) ||
    !isAuto(auto) ||
    !(origDay === null || isDay(origDay)) ||
    !(gMoved === undefined || gMoved === null || typeof gMoved === 'boolean')
  )
    return null
  return { day, staffId: staffId as string | null, staffName: staffName as string | null, kindId, kindName, status, auto, origDay, gMoved: gMoved === true }
}

/** admin_rows('calendar_counts') 줄 → 예약 숫자 줄(받은 차례 그대로, 틀린 줄은 뺀다) */
export function calendarCountRows(rows: readonly AdminRow[]): CalCountRow[] {
  return rows.flatMap(({ row }) => toCount(row) ?? [])
}
