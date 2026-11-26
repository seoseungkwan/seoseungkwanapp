import type { CalAppt, CalColor, CalSettings, CalStaff, KindColor } from '@/types/calendar'

// 예약 색(spec clinic-calendar design.md '화면' colors.ts · google-link design.md 10-1, ADR-055).
// 구글 일정 11색 + 캘린더 기본 색. 칸은 색으로 꽉 채우고 글자는 그 색의 글자색(--cal-<이름>-on)이다.
// 값은 globals.css :root의 --cal-* 토큰 한 곳이고(UI_GUIDE '예약 색판'), 여기에는 Tailwind 클래스 이름만 둔다.
// Tailwind는 소스 글자에서 클래스를 찾으므로 이름을 늘 통째로 적는다(조각을 이어 붙이지 않는다)

/** 칠하는 색: 11색 또는 캘린더 기본 색('default', 구글 colorId 없음) */
export type CalPaint = CalColor | 'default'

/** 한 색의 클래스 묶음: 꽉 채운 바탕 · 그 위 글자색 */
export type CalTone = { fill: string; on: string }

export const CAL_TONES: Record<CalPaint, CalTone> = {
  lavender: { fill: 'bg-cal-lavender', on: 'text-cal-lavender-on' },
  sage: { fill: 'bg-cal-sage', on: 'text-cal-sage-on' },
  grape: { fill: 'bg-cal-grape', on: 'text-cal-grape-on' },
  flamingo: { fill: 'bg-cal-flamingo', on: 'text-cal-flamingo-on' },
  banana: { fill: 'bg-cal-banana', on: 'text-cal-banana-on' },
  tangerine: { fill: 'bg-cal-tangerine', on: 'text-cal-tangerine-on' },
  peacock: { fill: 'bg-cal-peacock', on: 'text-cal-peacock-on' },
  graphite: { fill: 'bg-cal-graphite', on: 'text-cal-graphite-on' },
  blueberry: { fill: 'bg-cal-blueberry', on: 'text-cal-blueberry-on' },
  basil: { fill: 'bg-cal-basil', on: 'text-cal-basil-on' },
  tomato: { fill: 'bg-cal-tomato', on: 'text-cal-tomato-on' },
  default: { fill: 'bg-cal-default', on: 'text-cal-default-on' },
}

/** 색판 이름(시안 이름, 구글 colorId 1~11 차례) */
export const CAL_COLOR_LABEL: Record<CalColor, string> = {
  lavender: '라벤더',
  sage: '세이지',
  grape: '포도',
  flamingo: '플라밍고',
  banana: '바나나',
  tangerine: '귤',
  peacock: '공작',
  graphite: '흑연',
  blueberry: '블루베리',
  basil: '바질',
  tomato: '토마토',
}
export const CAL_DEFAULT_LABEL = '캘린더 기본 색'
export const CAL_FOLLOW_LABEL = '시행자 색 따름'

/** 종류 색 글: null = 시행자 색 따름, 'default' = 캘린더 기본 색 */
export function kindColorLabel(color: KindColor): string {
  if (color === null) return CAL_FOLLOW_LABEL
  return color === 'default' ? CAL_DEFAULT_LABEL : CAL_COLOR_LABEL[color]
}

/** 목록에 없는(지운) 종류·시행자의 색 = 캘린더 기본 색(옛 회색 대신, AC-8503.5) */
export const CAL_FALLBACK: CalPaint = 'default'

/** 시행자 색. 목록에 없으면(지운 시행자·id 없음) 캘린더 기본 색 */
export function staffColor(staffId: string | null, staff: readonly CalStaff[]): CalPaint {
  return staff.find((s) => s.id === staffId)?.color ?? CAL_FALLBACK
}

/**
 * 예약 칸 색: 종류 색 → 종류가 '시행자 색 따름'(null)이면 시행자 색. 지운 종류·시행자의 예약은 캘린더 기본 색(저장된 이름은 그대로 그린다).
 * 시행자 없는 예약(시행자 null, AC-8503.3)은 고정 색 종류면 그 색, 시행자 색 따름이면 캘린더 기본 색.
 * (취소·변경·구글 색 차례는 lib/calendar gpaint — TASK-20)
 */
export function apptColor(appt: Pick<CalAppt, 'kindId' | 'staffId'>, settings: Pick<CalSettings, 'kinds' | 'staff'>): CalPaint {
  const kind = settings.kinds.find((k) => k.id === appt.kindId)
  if (!kind) return CAL_FALLBACK
  if (appt.staffId === null) return kind.color ?? CAL_FALLBACK
  const staff = settings.staff.find((s) => s.id === appt.staffId)
  if (!staff) return CAL_FALLBACK
  return kind.color ?? staff.color
}
