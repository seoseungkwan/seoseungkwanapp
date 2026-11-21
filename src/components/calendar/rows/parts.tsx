import { weekdayOf } from '@/lib/analytics/dates'
import { slotLabel } from '@/lib/calendar/rules'
import type { BitGhost, CalAllDay, ShownStatus } from '@/lib/calendar/shapes'
import type { CalAppt, CalStaff } from '@/types/calendar'
import { CAL_TONES, staffColor } from '../colors'

// 예약표 그리기 부품이 같이 쓰는 글·표시(spec clinic-calendar design.md '화면', 시안 hm·MK·adChip). 울타리 안: props로 받은 값만 그린다

/** 10분 한 칸의 높이(px). 1시간 = 120px */
export const SLOT_PX = 20

const pad = (n: number) => String(n).padStart(2, '0')
/** 0시부터 분 → 'HH:MM' */
export const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf 1=월 … 7=일
export const weekdayName = (day: string) => WEEKDAY[weekdayOf(day) - 1]
/** '11월 17일 (화)' */
export const dayLabel = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 (${weekdayName(day)})`
export const dateNum = (day: string) => Number(day.slice(8, 10))

export const STATUS_TEXT: Record<ShownStatus, string> = { came: '왔음', noshow: '안 옴', cancel: '취소', none: '' }

/** 예약 칸·줄의 전체 글(마우스 올림·화면 읽기). 시안 evHTML label */
export function apptLabel(appt: CalAppt, shown: ShownStatus): string {
  const head = [appt.chart, appt.name, appt.kindName, `(${appt.staffMark})`, `${hm(appt.start)}–${hm(appt.start + appt.len)}`, `${appt.len}분`]
  const moved = appt.origDay !== null && appt.origStart !== null ? ` · 변경 (원래 ${slotLabel(appt.origDay, appt.origStart)})` : ''
  return `${head.filter(Boolean).join(' ')}${STATUS_TEXT[shown] ? ` · ${STATUS_TEXT[shown]}` : ''}${moved}`
}

/** 비트 예약 칸의 전체 글 */
export const ghostLabel = (g: BitGhost) => ['비트 예약', hm(g.start), g.chart, g.name].filter(Boolean).join(' ') + ' · 보기만 해요'

// 도착 표시(시안 기본값 10번): 초록 ✓ = 왔음, 주황 ! = 안 옴, 회색 '취소', 표시 없음 = 아직
export function StatusMark({ status }: { status: ShownStatus }) {
  if (status === 'came') {
    return (
      <span title="왔음" className="mr-0.5 inline-grid size-3.25 shrink-0 place-items-center rounded-full bg-positive align-middle text-surface">
        <svg aria-hidden="true" viewBox="0 0 10 10" width="9" height="9">
          <path d="M2.2 5.3 4.2 7.2 7.9 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (status === 'noshow') {
    return (
      <span title="안 옴" className="mr-0.5 inline-grid size-3.25 shrink-0 place-items-center rounded-full bg-negative align-middle text-caption leading-none font-semibold text-surface">
        !
      </span>
    )
  }
  if (status === 'cancel') {
    return (
      <span title="취소" className="mr-0.5 inline-block rounded-control bg-line px-1 align-middle text-caption leading-3.5 font-semibold text-ink-2 no-underline">
        취소
      </span>
    )
  }
  return null
}

// '변경' 꼬리표: 날짜나 시작 시간을 옮긴 예약(AC-5906.2). 파란 작은 꼬리표, 도착 표시 뒤·차트번호 앞
export function MovedMark() {
  return (
    <span
      title="날짜나 시작 시간을 옮김"
      className="mr-0.5 inline-block rounded-control bg-accent-soft px-0.5 align-middle text-caption leading-3.5 font-semibold text-accent-strong ring-1 ring-chart-2 ring-inset"
    >
      변경
    </span>
  )
}

// 빗금: 45° 선을 step 간격으로 M0 k L k 0. viewBox가 없어 1단위 = 1px이고 svg 밖은 잘린다(그라데이션 없이 시안의 줄무늬를 그린다).
// 칸 폭 + 높이(넓은 일 보기 1400px + 4시간 480px)까지 덮는다
const HATCH_REACH = 2000
const hatchPath = (step: number) =>
  Array.from({ length: Math.ceil(HATCH_REACH / step) }, (_, i) => step * (i + 1))
    .map((k) => `M0 ${k} L${k} 0`)
    .join(' ')
// 안 옴: 옅은 바탕 위 흰 줄(6px, 주기 12px) — 시안 13%/5% 줄무늬. 비트 예약: 회색 바탕 위 선 줄(5px, 주기 10px)
const HATCH = {
  noshow: { d: hatchPath(17), width: 6 },
  ghost: { d: hatchPath(14), width: 5 },
} as const

/** 칸(relative)을 채우는 빗금 svg 하나. 색은 className의 text-* 클래스가 준다 */
export function Hatch({ kind, className }: { kind: keyof typeof HATCH; className: string }) {
  return (
    <svg aria-hidden="true" data-hatch={kind} className={`pointer-events-none absolute inset-0 size-full ${className}`}>
      <path d={HATCH[kind].d} fill="none" stroke="currentColor" strokeWidth={HATCH[kind].width} />
    </svg>
  )
}

/** 휴무 글: 반차 휴무(part)는 '오전 휴무'·'오후 휴무', 종일은 '휴무'(spec staff AC-7616.1) */
export function offText(part: CalAllDay['part']): string {
  return part === 'am' ? '오전 휴무' : part === 'pm' ? '오후 휴무' : '휴무'
}

/** 종일 항목 글: 메모 그대로 · 휴무는 `(표시) 이름 휴무`(반차면 `오전 휴무`·`오후 휴무`, 목록에 없는 시행자는 표시 없이) */
export function allDayText(item: CalAllDay, staff: readonly CalStaff[]): string {
  if (item.type === 'memo') return item.memo ?? ''
  const mark = staff.find((s) => s.id === item.staffId)?.mark
  return `${mark ? `(${mark}) ` : ''}${item.staffName ?? ''} ${offText(item.part)}`
}

/** 종일 칩 모양: 메모 = 회색, 휴무 = 그 시행자 옅은 색 + 왼쪽 3px 띠 */
export function allDayChipClass(item: CalAllDay, staff: readonly CalStaff[]): string {
  if (item.type === 'memo') return 'bg-canvas ring-1 ring-line-strong ring-inset'
  const tone = CAL_TONES[staffColor(item.staffId, staff)]
  return `border-l-3 ${tone.soft} ${tone.edge}`
}
