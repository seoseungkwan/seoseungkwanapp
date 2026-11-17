import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { shownStatus } from '@/lib/calendar/rules'
import type { BlockPlace } from '@/lib/calendar/shapes'
import type { CalAppt, CalColor } from '@/types/calendar'
import { CAL_TONES } from '../colors'
import { apptLabel, Hatch, hm, MovedMark, StatusMark } from './parts'

// 예약 칸 하나(spec clinic-calendar AC-5905.1·AC-5906.2, 시안 .ev·evHTML). 옅은 바탕 + 왼쪽 3px 띠(종류 색 또는 시행자 색),
// 글은 `차트번호 이름 종류 (표시)` + 길이(일 보기는 둘째 줄에 시간·길이·메모). 칸이 좁으면 낱말 사이에서 줄을 바꾸고, 다 안 들어가면 끝을 자른다
// (전체 글은 마우스 올림·화면 읽기). 취소 = 흰 바탕·흐린 글·가운데 줄, 안 옴 = 옅은 빗금

export type BlockMode = 'week' | 'day'

// 줄 높이(px): 주 보기 14, 일 보기 16 — 아래 leading-3.5·leading-4와 같다
const LINE = { week: 14, day: 16 } as const
const PAD = { week: 'py-px pr-0.5 pl-1 leading-3.5', day: 'py-0.5 pr-1.5 pl-1.5 leading-4' } as const

/** 날 칸 오른쪽에 늘 비워 두는 줄 폭(px). 그 줄을 누르면 예약이 있는 시간에도 더하기(spec calendar-colors AC-6003.1·AC-6003.2) */
export const BLOCK_GUTTER_PX = 20

/** 열 자리 → 왼쪽·폭. 오른쪽 빈 줄을 뺀 (100% - 20px) 안에서 나누고, 이웃 칸과 2px 띄운다 */
export function placeStyle(place: BlockPlace, top: number, height: number) {
  const part = (n: number) => (n / place.cols).toFixed(4)
  return {
    top,
    height,
    left: `calc((100% - ${BLOCK_GUTTER_PX}px) * ${part(place.col)} + 1px)`,
    width: `calc((100% - ${BLOCK_GUTTER_PX}px) * ${part(place.span)} - 2px)`,
  }
}
/** 칸 높이에 들어가는 줄 수(1 이상) */
export const linesFor = (height: number, mode: BlockMode) => Math.max(1, Math.floor((height - 2) / LINE[mode]))

export function ApptBlock({
  appt,
  place,
  top,
  height,
  mode,
  color,
  onOpen,
}: {
  appt: CalAppt
  place: BlockPlace
  top: number
  height: number
  mode: BlockMode
  color: CalColor
  onOpen: (id: string) => void
}) {
  const shown = shownStatus(appt)
  const cancel = shown === 'cancel'
  const tone = CAL_TONES[color]
  const lines = linesFor(height, mode)
  const label = apptLabel(appt, shown)
  const look = cancel ? 'border-transparent bg-surface text-muted ring-line-strong' : `${tone.soft} ${tone.edge} ${tone.ring} text-ink`
  const tk = (extra = '') => `whitespace-nowrap ${cancel ? 'text-muted line-through' : extra}`
  const end = appt.start + appt.len
  const tail: ReactNode =
    mode === 'week' ? (
      <>
        {' '}
        <span className={tk('text-muted')}>{appt.len}분</span>
      </>
    ) : (
      <>
        {lines < 2 ? ' ' : <br />}
        <span className={tk('text-ink-2')}>
          {hm(appt.start)}–{hm(end)}
        </span>{' '}
        <span className={tk('text-muted')}>· {appt.len}분</span>
        {appt.memo ? (
          <>
            {' '}
            <span className={tk('text-muted')}>· {appt.memo}</span>
          </>
        ) : null}
      </>
    )
  return (
    <button
      type="button"
      data-block="appt"
      data-col={place.col}
      data-cols={place.cols}
      data-span={place.span}
      aria-label={label}
      title={label}
      onClick={() => onOpen(appt.id)}
      style={placeStyle(place, top, height)}
      className={`absolute z-1 flex cursor-pointer flex-col overflow-clip rounded-control border-l-3 text-left text-caption ring-1 ring-inset hover:z-4 hover:shadow-float focus-visible:z-4 ${PAD[mode]} ${look} ${ds.focusRing}`}
    >
      {shown === 'noshow' ? <Hatch kind="noshow" className="text-surface opacity-60" /> : null}
      <span className="relative line-clamp-1" style={{ WebkitLineClamp: lines }}>
        <StatusMark status={shown} />
        {appt.origDay ? <MovedMark /> : null}
        {appt.chart ? (
          <>
            <span className={tk('text-ink-2 tabular-nums')}>{appt.chart}</span>{' '}
          </>
        ) : null}
        <span className={`font-semibold ${tk()}`}>{appt.name}</span>{' '}
        <span className={tk()}>
          {appt.kindName} ({appt.staffMark})
        </span>
        {tail}
      </span>
    </button>
  )
}
