import { weekdayOf } from '@/lib/analytics/dates'
import type { FixCell, GColor } from '@/lib/calendar/gshapes'
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
  // 시행자 없는 예약(시행자 null, google-link AC-8503.3)은 (표시) 없이
  const head = [appt.chart, appt.name, appt.kindName, appt.staffMark === null ? '' : `(${appt.staffMark})`, `${hm(appt.start)}–${hm(appt.start + appt.len)}`, `${appt.len}분`]
  const moved = appt.origDay !== null && appt.origStart !== null ? ` · 변경 (원래 ${slotLabel(appt.origDay, appt.origStart)})` : ''
  return `${head.filter(Boolean).join(' ')}${STATUS_TEXT[shown] ? ` · ${STATUS_TEXT[shown]}` : ''}${moved}`
}

// ---------- 구글과 이은 병원(spec google-link REQ-8532, 예약표 prop RowsGoogle) ----------

/** '변경' 꼬리표를 붙일 예약: 처음 자리가 있음(웹앱에서 옮김), 이은 병원은 구글에서 변경 색이 된 것(gMoved)도 */
export const isMoved = (appt: Pick<CalAppt, 'origDay' | 'gMoved'>, linked: boolean) => appt.origDay !== null || (linked && appt.gMoved)

/** 이은 병원의 예약 칸·줄 전체 글: 지금 글 + 구글 변경 색만 받음 ' · 변경' + 못 보냄 ' · 구글에 아직 못 보냄'(시안 evHTML label) */
export function linkedApptLabel(appt: CalAppt, shown: ShownStatus, waiting: boolean): string {
  const gMovedOnly = appt.gMoved && appt.origDay === null ? ' · 변경' : ''
  return `${apptLabel(appt, shown)}${gMovedOnly}${waiting ? ` · ${WAIT_TEXT}` : ''}`
}

const WAIT_TEXT = '구글에 아직 못 보냄'

// 못 보냄 = 주황 시계(시안 MK.gwait, notes-calendar '색 규칙'). 도착 표시 뒤·'변경' 앞
export function WaitMark() {
  return (
    <span title={WAIT_TEXT} className="mr-0.5 inline-grid size-3.5 shrink-0 place-items-center rounded-full bg-negative-soft align-middle text-negative ring-1 ring-negative/50 ring-inset">
      <svg aria-hidden="true" viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <circle cx="5" cy="5" r="3.6" />
        <path d="M5 3.1V5l1.3.9" />
      </svg>
    </span>
  )
}

/** 고쳐야 할 구글 일정 칸·칩의 전체 글(시안 .ev.gfix title) */
export const fixLabel = (fix: Pick<FixCell, 'gTitle'>) => `고쳐야 할 구글 예약 · ${fix.gTitle}`

/** 고쳐야 할 것 칸·칩 모양: 노란 바탕·점선(구글 색 아님). 빗금은 Hatch kind="fix" */
export const FIX_LOOK = 'border border-dashed border-warning bg-warning-soft text-warning'

/** 고쳐야 할 것 안 글 `고쳐야 함 {구글 제목}`(시안 .ev.gfix) */
export function FixText({ fix }: { fix: Pick<FixCell, 'gTitle'> }) {
  return (
    <>
      <span className="font-semibold whitespace-nowrap">고쳐야 함</span> <span className="whitespace-nowrap">{fix.gTitle}</span>
    </>
  )
}

/** 종일 줄 칩 하나(글·말풍선·모양) */
export type DayChip = { key: string; text: string; title?: string; cls: string }

const HALF_TEXT = { am: '오전', pm: '오후' } as const

/**
 * 그날 종일 칩들. RowsGoogle이 없으면(잇지 않은 병원) 지금 그대로 항목마다 한 칩(allDayText·allDayChipClass).
 * 이은 병원(spec google-link AC-8532.3, 시안 adHTML): 메모 = 캘린더 기본 색 칩 → 하루 종일 휴무는 한 칩 `{이름}, {이름} {offWord}`(휴무 줄 색) →
 * 반차는 사람마다 흰 칩 `({표시}) {이름} {오전|오후} 반차`(시행자가 아닌 직원은 이름만). 이름 차례는 받은 차례
 */
export function dayChips(
  items: readonly CalAllDay[],
  staff: readonly CalStaff[],
  google: { offColor: GColor; offWord: string } | null,
): DayChip[] {
  if (google === null) return items.map((it) => ({ key: it.id, text: allDayText(it, staff), cls: allDayChipClass(it, staff) }))
  const memos: DayChip[] = items
    .filter((it) => it.type === 'memo')
    .map((it) => {
      const text = it.memo ?? ''
      return { key: it.id, text, title: `${text} · 캘린더 기본 색`, cls: `${CAL_TONES.default.fill} ${CAL_TONES.default.on}` }
    })
  const offs = items.filter((it) => it.type === 'off')
  const whole = offs.filter((it) => !it.part)
  const out = [...memos]
  if (whole.length > 0) {
    const text = `${whole.map((it) => it.staffName ?? '').join(', ')} ${google.offWord}`
    const tone = CAL_TONES[google.offColor]
    out.push({ key: `off:${whole[0].id}`, text, title: `${text} · 구글 하루 종일 줄과 같아요`, cls: `${tone.fill} ${tone.on}` })
  }
  for (const it of offs) {
    if (!it.part) continue
    const mark = staff.find((s) => s.id === it.staffId)?.mark
    const text = `${mark ? `(${mark}) ` : ''}${it.staffName ?? ''} ${HALF_TEXT[it.part]} 반차`
    out.push({ key: it.id, text, title: `${text} · 웹앱에만 보여요(반차는 구글 off 줄에 넣지 않아요)`, cls: 'bg-surface font-medium text-ink-2 ring-1 ring-line-strong ring-inset' })
  }
  return out
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
// 안 옴: 옅은 바탕 위 흰 줄(6px, 주기 12px) — 시안 13%/5% 줄무늬. 비트 예약: 회색 바탕 위 선 줄(5px, 주기 10px).
// 고쳐야 할 구글 일정(google-link): 옅은 노랑 위 노란 줄(6px, 주기 12px) — 시안 .ev.gfix
const HATCH = {
  noshow: { d: hatchPath(17), width: 6 },
  ghost: { d: hatchPath(14), width: 5 },
  fix: { d: hatchPath(17), width: 6 },
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

/** 종일 칩 모양(글자색 포함): 메모 = 회색 바탕 검정 글, 휴무 = 그 시행자 색으로 꽉 채움 + 그 색의 글자색(google-link AC-8503.2, 목록에 없는 시행자 = 캘린더 기본 색) */
export function allDayChipClass(item: CalAllDay, staff: readonly CalStaff[]): string {
  if (item.type === 'memo') return 'bg-canvas text-ink ring-1 ring-line-strong ring-inset'
  const tone = CAL_TONES[staffColor(item.staffId, staff)]
  return `${tone.fill} ${tone.on}`
}
