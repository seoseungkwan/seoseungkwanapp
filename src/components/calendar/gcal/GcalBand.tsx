'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import { errorInfo, isErrorCode } from '@/lib/errors'
import type { CalAppt, CalSettings } from '@/types/calendar'
import type { GcalLook } from '@/types/gcal'
import { CalIcon, Swatch } from '../CalendarToolbar'
import { apptGooglePaint, colorName, googleTitleOf } from './apptGoogle'
import { CalendarIcon, CalendarOffIcon, ClockIcon, OutIcon } from './icons'
import * as T from './labels'
import { clock, kstHm, shortDay } from './time'

// 예약 탭 위 구글 띠(spec google-link AC-8532.1·AC-8534.1·AC-8535.1·AC-8535.2, 시안 calendar.html ?s=week·fix·err, notes-calendar 글 그대로).
// 이어짐(초록): 캘린더 이름·마지막 맞춤·받아 오는 간격, [고쳐야 할 구글 예약 n개](0개면 없음), [구글 캘린더 열기 ↗]·[지금 맞추기].
// 닿지 못함(주황, role alert): 실패 시작·보낼 것 수·다음 시도, [접기]/[자세히](처음은 펼침)·[다시 시도], 못 보낸 예약 목록·안내·오류 상자(lib/errors).
// 띠는 props로만 그린다(상태 듣기·syncNow는 화면이 한다)

export type GcalBandFail = { since: string | null; code: string | null; nextTryAt: string | null }

export type GcalBandProps = {
  calendarName: string
  calendarId: string
  pullMin: number
  lastOkAt: string | null
  /** 닿지 못함(실패 시작이나 번호가 있음). 아니면 null */
  fail: GcalBandFail | null
  /** 구글로 보낼 것 수(예약·지움·off·종일 메모) */
  waiting: number
  /** 아직 못 보낸 예약(넣은 차례) */
  pending: readonly CalAppt[]
  look: GcalLook
  settings: Pick<CalSettings, 'kinds' | 'staff'>
  /** 열린 고쳐야 할 구글 예약 수 */
  fixes: number
  busy?: boolean
  onSync(): void
  onRetry(): void
  onOpenFix(): void
}

/** 구글 캘린더 웹 주소(그 캘린더를 연다) */
export const calendarUrl = (calendarId: string) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarId)}`

const BAND = 'flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-control border py-1.5 pr-2 pl-3.5 text-small text-ink-2'
const LINK = `inline-flex items-center gap-1 rounded-control text-small font-medium whitespace-nowrap text-accent no-underline underline-offset-3 hover:underline ${ds.focusRing}`
const FIX_BUTTON = `inline-flex h-7.5 cursor-pointer items-center gap-1.5 rounded-control border border-warning/40 bg-warning-soft px-3 text-small font-semibold whitespace-nowrap text-warning transition hover:brightness-95 ${ds.focusRing}`

export function GcalBand(props: GcalBandProps) {
  return props.fail ? <FailBand {...props} fail={props.fail} /> : <LinkedBand {...props} />
}

function LinkedBand({ calendarName, calendarId, pullMin, lastOkAt, fixes, busy = false, onSync, onOpenFix }: GcalBandProps) {
  const last = kstHm(lastOkAt)
  return (
    <div data-gcal-band="ok" className={`${BAND} border-positive/25 bg-positive-soft`}>
      <span data-band-text className="inline-flex min-w-0 items-center gap-2">
        <CalendarIcon className="text-positive" />
        <span>
          {T.BAND_LINKED_HEAD} <b className="font-semibold text-ink">{calendarName}</b>
          {T.bandLinkedTail(calendarName)}
          {last && (
            <>
              {' · '}
              {T.BAND_LAST} <b className="font-semibold text-ink">{last}</b>
            </>
          )}{' '}
          <span className="text-muted">{T.bandEvery(pullMin)}</span>
        </span>
      </span>
      {fixes > 0 && (
        <button type="button" className={FIX_BUTTON} onClick={onOpenFix}>
          <CalIcon name="warn" size={14} />
          {T.FIX_BUTTON(fixes)}
        </button>
      )}
      <span className="flex-1" />
      <a href={calendarUrl(calendarId)} target="_blank" rel="noopener noreferrer" className={LINK}>
        {T.BAND_OPEN}
        <OutIcon />
      </a>
      <button type="button" aria-busy={busy || undefined} className={ds.button.secondarySmall} onClick={() => !busy && onSync()}>
        <CalIcon name="sync" size={14} />
        {T.BAND_SYNC}
      </button>
    </div>
  )
}

function FailBand({ fail, waiting, pending, look, settings, fixes, busy = false, onRetry, onOpenFix }: GcalBandProps & { fail: GcalBandFail }) {
  const [open, setOpen] = useState(true)
  const since = kstHm(fail.since)
  const next = kstHm(fail.nextTryAt)
  const info = fail.code && isErrorCode(fail.code) ? errorInfo(fail.code) : null
  return (
    <>
      <div data-gcal-band="err" role="alert" className={`${BAND} border-negative/30 bg-negative-soft`}>
        <span data-band-text className="inline-flex min-w-0 items-center gap-2">
          <CalendarOffIcon className="text-negative" />
          <span>
            <b className="font-semibold text-negative">{T.ERR_HEAD}</b>
            {since && ` · ${T.errSince(since)}`}
            {` · ${T.ERR_SAVED} · `}
            <b className="font-semibold text-ink">{T.errWaiting(waiting)}</b>
            {` · ${next ? T.errNext(next) : T.ERR_NEXT_SOON}`}
          </span>
        </span>
        {fixes > 0 && (
          <button type="button" className={FIX_BUTTON} onClick={onOpenFix}>
            <CalIcon name="warn" size={14} />
            {T.FIX_BUTTON(fixes)}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" aria-expanded={open} className={ds.button.secondarySmall} onClick={() => setOpen((v) => !v)}>
          {open ? T.ERR_FOLD : T.ERR_MORE}
        </button>
        <button type="button" aria-busy={busy || undefined} className={ds.button.primarySmall} onClick={() => !busy && onRetry()}>
          <CalIcon name="sync" size={14} />
          {T.ERR_RETRY}
        </button>
      </div>
      {open && (
        <div data-gcal-pending className="grid gap-2.5 rounded-control border border-negative/30 bg-surface px-3.5 py-3">
          <h3 className="text-body font-semibold text-ink">{T.pendingHead(pending.length)}</h3>
          {pending.length > 0 && (
            <ul className="grid rounded-control border border-line">
              {pending.map((appt) => (
                <PendingRow key={appt.id} appt={appt} look={look} settings={settings} />
              ))}
            </ul>
          )}
          <p className="text-caption text-muted">{T.PENDING_HINT}</p>
          {fail.code && (
            <div data-gcal-error className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-small text-ink-2">
              <CalIcon name="warn" size={16} />
              <div>
                {info && (
                  <>
                    <b className="font-semibold text-ink">{info.what}</b> {info.fix}{' '}
                  </>
                )}
                <span className="text-caption text-muted">{T.ERR_CODE(fail.code)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function PendingRow({ appt, look, settings }: { appt: CalAppt; look: GcalLook; settings: Pick<CalSettings, 'kinds' | 'staff'> }) {
  const paint = apptGooglePaint(appt, settings, look)
  const word = appt.gWait ? T.WAIT_WORD[appt.gWait] : ''
  const suffix =
    appt.status === 'cancel'
      ? T.pendingCancel(colorName(look.cancel))
      : appt.origStart !== null
        ? T.pendingMoved(clock(appt.origStart), colorName(look.change))
        : null
  return (
    <li className="grid grid-cols-[120px_90px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-3 py-1.75 text-small text-ink first:border-t-0">
      <span className="tabular-nums">{`${shortDay(appt.day)} ${clock(appt.start)}`}</span>{' '}
      <span className="text-ink-2">{word}</span>{' '}
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Swatch color={paint.key} />
        <span className="min-w-0 truncate">
          {googleTitleOf(appt, settings, look)}
          {suffix && <span className="text-muted"> {suffix}</span>}
        </span>
      </span>{' '}
      <span className={`${ds.chip.neutral} gap-1`}>
        <ClockIcon />
        {T.PENDING_WAIT}
      </span>
    </li>
  )
}
