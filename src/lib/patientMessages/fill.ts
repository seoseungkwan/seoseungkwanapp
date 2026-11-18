import { addDays, weekdayOf } from '@/lib/analytics/dates'
import { hoursText, phoneText } from '@/lib/clinic/format'
import type { ClinicProfile } from '@/types/clinicProfile'

// 문자 문구에 날짜를 채운다. 옮겨 온 곳: 원본 assets/message_templates.html의 DATE_LINE·dateLine·withDate.
// 환자 정보가 없어 환자 자료 구역 밖이다. [*1*](받는 분 이름)·[*2*](부위)는 문자 발송 프로그램이 채우므로 건드리지 않는다.
// 날짜는 dates.ts의 isYmd가 참인 값만 받고, 그 밖에는 RangeError로 멈춘다. 빈 값·없는 날뿐 아니라 모양이 맞는 0~99년('0002-11-02')도 그렇다.
// 그래서 부르는 쪽(화면)은 먼저 isYmd(date)로 보고, 거짓이면 마지막으로 맞았던 날짜를 그대로 둔다.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] // 원본 WD

export const DATE_LINE = /^\s*\*\s*\d+월\s*\d+일\s*[월화수목금토일]요일\s*\*\s*$/

export function dateLine(date: string): string {
  const weekday = WEEKDAYS[weekdayOf(date) % 7] // weekdayOf의 일요일 7 → 0. 없는 날이면 여기서 멈춘다
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return `* ${month}월 ${day}일 ${weekday}요일 *`
}

// 줄마다 <<DATE>>가 있거나 이미 날짜 줄이면 그 줄 전체를 날짜 줄로 바꾼다. 저장한 문구를 다시 채워도 날짜만 바뀐다
export function fillTemplate(body: string, date: string): string {
  const line = dateLine(date)
  return body
    .split('\n')
    .map((text) => (text.includes('<<DATE>>') || DATE_LINE.test(text) ? line : text))
    .join('\n')
}

// 전날 보내는 안내라 내일이 기본이다. 오늘은 부르는 쪽이 준다(todayInKorea)
export function defaultSendDate(today: string): string {
  return addDays(today, 1)
}

// ── 병원 정보 채우기(spec clinic-profile REQ-6605, design.md 7절) ─────────────────
// 미리 보기·복사 글에만 넣는다. 저장하는 문구 글과 DEFAULT_TEMPLATES는 그대로다(부르는 쪽이 fillTemplate 뒤에 부른다)

/** 문자 문구에 넣을 병원 정보. 빈 글자인 값은 넣지 않는다(그 자리를 그대로 둔다) */
export type ClinicInfo = { name: string; phone: string; hoursText: string }

/** 병원 정보를 아직 모르거나 못 읽었을 때: 글을 그대로 둔다 */
export const NO_CLINIC_INFO: ClinicInfo = { name: '', phone: '', hoursText: '' }

// 차례가 중요하다: 괄호 붙은 이름 자리를 먼저 바꿔야 괄호가 남지 않는다
const CLINIC_SLOTS: readonly (readonly [string, keyof ClinicInfo])[] = [
  ['[병원명 설정 필요]', 'name'],
  ['병원 진료시간 설정 필요', 'hoursText'],
  ['병원명 설정 필요', 'name'],
  ['전화번호 설정 필요', 'phone'],
]

// split·join으로 바꾼다: replaceAll은 넣는 글의 $&·$1 같은 글자를 바꾸기 규칙으로 읽는다
export function fillClinic(body: string, info: ClinicInfo): string {
  return CLINIC_SLOTS.reduce((text, [slot, field]) => (info[field] ? text.split(slot).join(info[field]) : text), body)
}

/**
 * 화면이 읽은 병원 정보(useClinicProfile) → 넣을 값. 읽는 중·실패면 빈 정보다.
 * 저장한 적 없는 병원은 이름(가입 이름)만 넣는다: 진료시간 기본값은 병원이 정한 값이 아니라 환자에게 보내지 않는다
 */
export function clinicInfoOf(view: { state: 'loading' | 'ready' | 'failed'; saved: boolean; name: string; profile: Pick<ClinicProfile, 'phone' | 'hours'> }): ClinicInfo {
  if (view.state !== 'ready') return NO_CLINIC_INFO
  return { name: view.name, phone: phoneText(view.profile.phone), hoursText: view.saved ? hoursText(view.profile.hours) : '' }
}
