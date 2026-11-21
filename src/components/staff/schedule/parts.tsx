'use client'

import { ds } from '@/components/ui/classes'
import { clock, type Shift } from './format'

// 근무표 화면이 같이 쓰는 작은 조각: 단추 묶음([일함]·[쉼], [주]·[달] …)과 근무·점심 시각 고르기 (시안 schedule.html .seg·.fld·.sel).
// 모양은 ds(components/ui/classes.ts)의 단추 묶음·작은 칸이다. 폰 전용 모양은 두지 않는다(묶음은 PC 모양 그대로)

// 단추 묶음 틀: ds 단추 묶음 틀에서 폰 칸 나눔만 뺀 것 — 폰에서도 PC 모양 그대로다(명단·휴가 화면도 이것을 쓴다)
const SEG_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface'

// 공휴일·휴진일 칸·머리 회색(주 보기·달 보기·칸 뜻 견본): 시안 --closed(#EEF0F3)쯤 — 보통 칸·머리 바탕(canvas)보다 진해 한눈에 갈린다(AC-7613.1)
export const REST_SHADE = 'bg-line/60'
export const REST_HOVER = 'hover:bg-line/80'

type SegmentProps<T extends string> = {
  /** 묶음 이름(화면 읽기). labelledBy를 주면 그 글이 이름이다 */
  label?: string
  labelledBy?: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange(value: T): void
  className?: string
}

/** 하나만 눌리는 단추 묶음(aria-pressed) */
export function Segment<T extends string>({ label, labelledBy, options, value, onChange, className = '' }: SegmentProps<T>) {
  return (
    <div role="group" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={`${SEG_GROUP} ${className}`}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          className={`${ds.segment.button} ${value === key ? ds.segment.on : ds.segment.off}`}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

// 고르는 시각: 10분 단위 06:00~23:50(병원 정보 진료시간과 같다). 저장된 값이 그 밖이면 그 값도 넣어 그대로 보인다
const STEP = 10
const FIRST_MINUTE = 6 * 60
const LAST_MINUTE = 23 * 60 + 50
const MINUTES = Array.from({ length: (LAST_MINUTE - FIRST_MINUTE) / STEP + 1 }, (_, i) => FIRST_MINUTE + i * STEP)
const SELECT = `h-8 rounded-control border border-line-strong bg-surface px-1.5 text-small text-ink tabular-nums aria-invalid:border-negative ${ds.focusRing}`
const FIELD = 'inline-flex items-center gap-1.5 whitespace-nowrap text-small text-ink-2'

function TimeSelect({ label, value, empty = false, invalid, onChange }: { label: string; value: number | null; empty?: boolean; invalid: boolean; onChange(value: number | null): void }) {
  const options = value === null || MINUTES.includes(value) ? MINUTES : [...MINUTES, value].sort((a, b) => a - b)
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      aria-invalid={invalid || undefined}
      className={SELECT}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
    >
      {empty && <option value="">없음</option>}
      {options.map((minute) => (
        <option key={minute} value={minute}>
          {clock(minute)}
        </option>
      ))}
    </select>
  )
}

/** 근무 칸의 까닭(병원 정보 진료시간 검사와 같은 말). 맞으면 null */
export function shiftProblem(shift: Shift): string | null {
  if (shift.start >= shift.end) return '끝나는 시간이 시작 시간보다 늦어야 해요'
  if (shift.lunchFrom === null || shift.lunchTo === null) return null
  if (!(shift.start <= shift.lunchFrom && shift.lunchFrom < shift.lunchTo && shift.lunchTo <= shift.end)) return '점심은 근무 시간 안에서, 시작이 끝보다 빨라야 해요'
  return null
}

// 점심 시작을 고르면: '없음'이면 점심을 비우고, 끝이 없거나 시작보다 빠르면 끝을 한 시간 뒤(근무 끝까지)로 채운다
function withLunchFrom(shift: Shift, from: number | null): Shift {
  if (from === null) return { ...shift, lunchFrom: null, lunchTo: null }
  if (shift.lunchTo !== null && shift.lunchTo > from) return { ...shift, lunchFrom: from }
  const to = Math.min(from + 60, shift.end)
  return { ...shift, lunchFrom: from, lunchTo: to > from ? to : from + STEP }
}

/**
 * '근무 {시작} ~ {끝}' · '점심 {시작} ~ {끝}'(점심 '없음'이면 끝 칸이 없다). prefix는 칸 이름 앞말('월요일 ')
 */
export function ShiftFields({ shift, prefix = '', onChange }: { shift: Shift; prefix?: string; onChange(shift: Shift): void }) {
  const problem = shiftProblem(shift)
  const badTime = problem !== null && shift.start >= shift.end
  const badLunch = problem !== null && !badTime
  return (
    <>
      <span className={FIELD}>
        근무
        <TimeSelect label={`${prefix}근무 시작`} value={shift.start} invalid={badTime} onChange={(start) => start !== null && onChange({ ...shift, start })} />~
        <TimeSelect label={`${prefix}근무 끝`} value={shift.end} invalid={badTime} onChange={(end) => end !== null && onChange({ ...shift, end })} />
      </span>
      <span className={FIELD}>
        점심
        <TimeSelect label={`${prefix}점심 시작`} value={shift.lunchFrom} empty invalid={badLunch} onChange={(from) => onChange(withLunchFrom(shift, from))} />
        {shift.lunchFrom !== null && (
          <>
            ~
            <TimeSelect label={`${prefix}점심 끝`} value={shift.lunchTo} invalid={badLunch} onChange={(to) => to !== null && onChange({ ...shift, lunchTo: to })} />
          </>
        )}
      </span>
    </>
  )
}
