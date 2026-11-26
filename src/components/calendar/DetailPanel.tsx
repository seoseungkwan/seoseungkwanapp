'use client'

import { useId, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { nextWeek, shownStatus, slotLabel } from '@/lib/calendar/rules'
import type { CalAppt, CalSettings } from '@/types/calendar'
import type { GcalLook } from '@/types/gcal'
import { apptColor } from './colors'
import { Drawer } from './AddPanel'
import { CalIcon, CameMark, CancelTag, NoshowMark, calVar, dayLabel, hm } from './CalendarToolbar'
import { apptGooglePaint } from './gcal/apptGoogle'
import { GoogleSection } from './gcal/DetailGoogle'
import { ARRIVAL_NOT_SENT, MOVED_BY_GOOGLE, MOVED_UNKNOWN } from './gcal/labels'

// 예약 자세히 판 (spec clinic-calendar AC-5905.3·AC-5906.2, 시안 ?s=detail).
// 도착은 손으로 고른 상태가 먼저, auto면 비트 PC가 적은 표시(lib/calendar shownStatus). [다음 주에도]는 같은 담당·종류·길이로 7일 뒤(lib nextWeek).
// [지우기]는 한 번 더 묻는다. 판은 콜백만 부른다(저장·복사는 화면이 한다).
// 구글과 이은 병원(google 있음, spec google-link AC-8545.1·AC-8549.2): '변경' 줄은 g_moved일 때만, 취소한 예약 도착 줄은 '칸은 취소 색으로 남아요'

/** 도착 단추가 부르는 값: auto = 비트 따라(손으로 고른 값 지움) */
export type ArrivalPick = 'auto' | 'came' | 'noshow'

const ARRIVALS: readonly [ArrivalPick, string][] = [
  ['auto', '자동 (비트 따라)'],
  ['came', '왔음'],
  ['noshow', '안 옴'],
]
const AUTO_HELP = '자동: 같은 날 같은 차트번호로 비트 접수가 있으면 왔음, 예약 시간이 끝나도 없으면 안 옴. 손으로 고르면 그 값이 먼저예요.'
// 확인 [지우기]: 기본 단추 모양에 negative 바탕(같은 속성 클래스가 겹치지 않게 accent 색 묶음만 갈아 끼운다)
const DELETE_NOW = ds.button.primary.replace('bg-accent text-surface not-disabled:not-aria-disabled:hover:bg-accent-strong', 'bg-negative text-surface')

function arrivalText(appt: CalAppt, linked: boolean): { now: ReactNode; why: string } {
  const shown = shownStatus(appt)
  if (shown === 'cancel') {
    return {
      now: (
        <span className="inline-flex items-center gap-1.5">
          <CancelTag />
          <span>취소한 예약</span>
        </span>
      ),
      why: linked ? '칸은 취소 색으로 남아요' : '칸은 흐리게 남아요',
    }
  }
  const manual = appt.status !== 'auto'
  if (shown === 'came') {
    return {
      now: (
        <span className="inline-flex items-center gap-1">
          <CameMark />
          왔음
        </span>
      ),
      why: manual ? '손으로 바꿈' : '비트 접수가 있어요 · 자동',
    }
  }
  if (shown === 'noshow') {
    return {
      now: (
        <span className="inline-flex items-center gap-1">
          <NoshowMark />안 옴
        </span>
      ),
      why: manual ? '손으로 바꿈' : '예약 시간이 끝나도 비트 접수가 없어요 · 자동',
    }
  }
  return { now: <span>아직</span>, why: appt.chart ? '비트 접수가 생기면 저절로 왔음이 돼요' : '차트번호가 없어 저절로 바뀌지 않아요 · 손으로 골라요' }
}

/** 이은 병원의 구글 쪽(spec google-link AC-8533.1): 짝 있는 예약(g_event_id)이면 '구글 캘린더' 구역을 그린다 */
export type DetailGoogle = {
  look: GcalLook
  arrival: 'off' | 'title'
  calendarId: string
  lastOkAt: string | null
  /** 이 예약이 아직 구글로 못 보낸 것 */
  waiting: boolean
}

type DetailPanelProps = {
  appt: CalAppt
  settings: CalSettings
  google?: DetailGoogle | null
  copied?: boolean // [다음 주에도]로 이미 넣었다(단추 막음 + "넣었어요 ✓")
  busy?: boolean
  error?: ReactNode
  onClose(): void
  onArrival(pick: ArrivalPick): void
  onNextWeek(): void
  onEdit(): void
  onToggleCancel(): void // 예약 취소 ↔ 취소 되돌리기
  onDelete(): void
}

/** 예약 자세히 판 */
export function DetailPanel({
  appt,
  settings,
  google = null,
  copied = false,
  busy = false,
  error,
  onClose,
  onArrival,
  onNextWeek,
  onEdit,
  onToggleCancel,
  onDelete,
}: DetailPanelProps) {
  const ids = useId()
  const paired = google !== null && appt.gEventId !== null
  const bar = google ? apptGooglePaint(appt, settings, google.look).key : apptColor(appt, settings)
  const [confirming, setConfirming] = useState(false)
  const cancelled = appt.status === 'cancel'
  const arrival = arrivalText(appt, google !== null)
  // '변경' 줄: 잇지 않은 병원은 처음 자리가 있을 때, 이은 병원은 g_moved일 때만(처음 자리가 있으면 '원래 …', 없으면 구글에서 변경 색으로 바뀜)
  const hasOrig = appt.origDay !== null && appt.origStart !== null
  const moved = google !== null ? appt.gMoved : hasOrig
  const next = nextWeek(appt)
  const repeatAt = `${dayLabel(next.day)} ${hm(next.start)}`

  const foot = confirming ? (
    <>
      <span className="min-w-35 flex-1 text-caption text-negative">이 예약을 지울까요? 되돌릴 수 없어요.</span>
      <button type="button" className={ds.button.secondary} onClick={() => setConfirming(false)}>
        아니요
      </button>
      <button type="button" aria-busy={busy || undefined} className={DELETE_NOW} onClick={() => !busy && onDelete()}>
        지우기
      </button>
    </>
  ) : (
    <>
      <button type="button" className={ds.button.danger} onClick={() => setConfirming(true)}>
        지우기
      </button>
      <span className="flex-1" />
      <button type="button" aria-busy={busy || undefined} className={ds.button.secondary} onClick={() => !busy && onToggleCancel()}>
        {cancelled ? '취소 되돌리기' : '예약 취소'}
      </button>
      <button type="button" className={ds.button.primary} onClick={onEdit}>
        고치기
      </button>
    </>
  )

  return (
    <Drawer title="예약" onClose={onClose} foot={foot}>
      <div className="grid grid-cols-[6px_minmax(0,1fr)] gap-3">
        <span aria-hidden="true" className="rounded-control" style={{ backgroundColor: calVar(bar) }} />
        <div className="min-w-0">
          <p className="text-heading-m font-semibold text-ink">
            <span className="mr-2 text-ink-2 tabular-nums">{appt.chart ?? '차트번호 없음'}</span>
            <span>{appt.name}</span>
          </p>
          <p className="text-body text-ink-2">{appt.staffId === null ? `${appt.kindName} · 시행자 없음` : `${appt.kindName} · (${appt.staffMark}) ${appt.staffName}`}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-body">
        <dt className="text-muted">날짜</dt>
        <dd className="text-ink">{dayLabel(appt.day)}</dd>
        <dt className="text-muted">시간</dt>
        <dd className="text-ink tabular-nums">{`${hm(appt.start)} – ${hm(appt.start + appt.len)} · ${appt.len}분`}</dd>
        <dt className="text-muted">메모</dt>
        <dd className={appt.memo ? 'break-words text-ink' : 'text-muted'}>{appt.memo || '없음'}</dd>
        {moved && appt.origDay !== null && appt.origStart !== null && (
          <>
            <dt className="text-muted">변경</dt>
            <dd className="text-ink tabular-nums">{`원래 ${slotLabel(appt.origDay, appt.origStart)}`}</dd>
          </>
        )}
        {moved && !hasOrig && (
          <>
            <dt className="text-muted">변경</dt>
            <dd className="text-ink">
              {MOVED_BY_GOOGLE} <span className="text-caption text-muted">{MOVED_UNKNOWN}</span>
            </dd>
          </>
        )}
      </dl>
      <div aria-hidden="true" className="h-px bg-line" />

      <section aria-labelledby={`${ids}-arrival`} className="grid gap-2">
        <h3 id={`${ids}-arrival`} className="text-body font-semibold text-ink">
          도착
        </h3>
        <div data-now className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold text-ink">
          {arrival.now}
          <span className="text-caption font-normal text-muted">{arrival.why}</span>
        </div>
        {!cancelled && (
          <>
            <div>
              <div role="group" aria-label="도착 바꾸기" className={ds.segment.group}>
                {ARRIVALS.map(([pick, label]) => {
                  const pressed = appt.status === pick
                  return (
                    <button
                      key={pick}
                      type="button"
                      aria-pressed={pressed}
                      className={`${ds.segment.button} ${pressed ? ds.segment.on : ds.segment.off}`}
                      onClick={() => onArrival(pick)}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="text-caption text-muted">{AUTO_HELP}</p>
            {paired && google && google.arrival === 'off' && <p className="text-caption text-muted">{ARRIVAL_NOT_SENT}</p>}
          </>
        )}
      </section>

      {paired && google && <GoogleSection appt={appt} settings={settings} google={google} />}

      <section aria-labelledby={`${ids}-repeat`} className="grid gap-2">
        <h3 id={`${ids}-repeat`} className="text-body font-semibold text-ink">
          되풀이
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" disabled={copied} className={ds.button.accentOutlineSmall} onClick={onNextWeek}>
            <CalIcon name="repeat" size={14} />
            다음 주에도
          </button>
          <span className="text-caption text-muted">{copied ? `${repeatAt}에 넣었어요 ✓` : `${repeatAt}에 같은 담당·종류·길이로 하나 더 넣어요`}</span>
        </div>
      </section>

      {error && (
        <p role="alert" className={ds.fieldError}>
          {error}
        </p>
      )}
    </Drawer>
  )
}
