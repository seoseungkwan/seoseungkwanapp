import type { CalAppt, CalColor, CalSettings, CalStaff } from '@/types/calendar'

// 예약 색(spec clinic-calendar design.md '화면' colors.ts, 시안 colorOf·PALETTE, AC-5905.1).
// 값은 globals.css :root의 --cal-* 토큰 한 곳이고(UI_GUIDE '예약 색판'), 여기에는 Tailwind 클래스 이름만 둔다.
// Tailwind는 소스 글자에서 클래스를 찾으므로 이름을 늘 통째로 적는다(조각을 이어 붙이지 않는다)

/** 한 색의 클래스 묶음: 진한 바탕(폰 목록 띠·색 표시) · 옅은 바탕(예약 칸·휴무 칩) · 왼쪽 띠 색 · 안쪽 1px 테두리(25%) */
export type CalTone = { solid: string; soft: string; edge: string; ring: string }

export const CAL_TONES: Record<CalColor, CalTone> = {
  blue: { solid: 'bg-cal-blue', soft: 'bg-cal-blue-soft', edge: 'border-cal-blue', ring: 'ring-cal-blue/25' },
  teal: { solid: 'bg-cal-teal', soft: 'bg-cal-teal-soft', edge: 'border-cal-teal', ring: 'ring-cal-teal/25' },
  purple: { solid: 'bg-cal-purple', soft: 'bg-cal-purple-soft', edge: 'border-cal-purple', ring: 'ring-cal-purple/25' },
  orange: { solid: 'bg-cal-orange', soft: 'bg-cal-orange-soft', edge: 'border-cal-orange', ring: 'ring-cal-orange/25' },
  pink: { solid: 'bg-cal-pink', soft: 'bg-cal-pink-soft', edge: 'border-cal-pink', ring: 'ring-cal-pink/25' },
  lime: { solid: 'bg-cal-lime', soft: 'bg-cal-lime-soft', edge: 'border-cal-lime', ring: 'ring-cal-lime/25' },
  navy: { solid: 'bg-cal-navy', soft: 'bg-cal-navy-soft', edge: 'border-cal-navy', ring: 'ring-cal-navy/25' },
  sky: { solid: 'bg-cal-sky', soft: 'bg-cal-sky-soft', edge: 'border-cal-sky', ring: 'ring-cal-sky/25' },
  brown: { solid: 'bg-cal-brown', soft: 'bg-cal-brown-soft', edge: 'border-cal-brown', ring: 'ring-cal-brown/25' },
  gray: { solid: 'bg-cal-gray', soft: 'bg-cal-gray-soft', edge: 'border-cal-gray', ring: 'ring-cal-gray/25' },
}

/** 색판 이름(시안 PALETTE 글) */
export const CAL_COLOR_LABEL: Record<CalColor, string> = {
  blue: '파랑',
  teal: '청록',
  purple: '보라',
  orange: '주황',
  pink: '분홍',
  lime: '연두',
  navy: '남색',
  sky: '하늘',
  brown: '갈색',
  gray: '회색',
}

/** 목록에 없는(지운) 종류·시행자의 색 */
export const CAL_FALLBACK: CalColor = 'gray'

/** 시행자 색. 목록에 없으면(지운 시행자·id 없음) 회색 */
export function staffColor(staffId: string | null, staff: readonly CalStaff[]): CalColor {
  return staff.find((s) => s.id === staffId)?.color ?? CAL_FALLBACK
}

/** 예약 칸 색: 종류 색 → 종류가 '시행자 색 따름'(null)이면 시행자 색. 지운 종류·시행자의 예약은 회색(AC-5905.5: 저장된 이름 그대로 회색) */
export function apptColor(appt: Pick<CalAppt, 'kindId' | 'staffId'>, settings: Pick<CalSettings, 'kinds' | 'staff'>): CalColor {
  const kind = settings.kinds.find((k) => k.id === appt.kindId)
  const staff = settings.staff.find((s) => s.id === appt.staffId)
  if (!kind || !staff) return CAL_FALLBACK
  return kind.color ?? staff.color
}
