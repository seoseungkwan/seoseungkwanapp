'use client'

import { useId } from 'react'
import { ds } from '@/components/ui/classes'
import type { CalAppt, CalSettings } from '@/types/calendar'
import { Swatch } from '../CalendarToolbar'
import type { DetailGoogle } from '../DetailPanel'
import { apptGooglePaint, colorName, googleTitleOf, webTitleOf } from './apptGoogle'
import { OutIcon } from './icons'
import * as T from './labels'
import { kstHm, kstSlot } from './time'

// 예약 자세히의 '구글 캘린더' 구역(spec google-link AC-8533.1, 시안 calendar.html ?s=detail, notes-calendar `detail` 글 그대로).
// 꼬리표(구글에서 옴 / 웹앱에서 만듦 · 구글에 있음) · 구글 제목(원문) · 색과 그 출처 · 알아본 것(구글에서 온 것만) · 들어온 때 · 맞춤(+ g_note 한 줄) ·
// 고치기 풀이(구글 제목을 그대로 두는 구글 예약만) · 취소·변경 색 풀이 · [구글 캘린더에서 이 일정 열기 ↗]

/** 구글 캘린더 웹에서 그 일정을 여는 주소(eid = base64(일정 id + ' ' + 캘린더 id)) */
export const eventUrl = (eventId: string, calendarId: string) =>
  `https://www.google.com/calendar/event?eid=${encodeURIComponent(btoa(`${eventId} ${calendarId}`).replace(/=+$/, ''))}`

const LINK = `inline-flex items-center gap-1 justify-self-start rounded-control text-small font-medium text-accent underline-offset-3 hover:underline ${ds.focusRing}`
const HOW = 'text-caption text-muted'

export function GoogleSection({ appt, settings, google }: { appt: CalAppt; settings: CalSettings; google: DetailGoogle }) {
  const titleId = useId()
  const fromGoogle = appt.gFrom === 'import' || appt.gFrom === 'pull'
  const paint = apptGooglePaint(appt, settings, google.look)
  const title = fromGoogle ? (appt.gTitle ?? googleTitleOf(appt, settings, google.look)) : googleTitleOf(appt, settings, google.look)
  const came = kstSlot(appt.createdAt)
  return (
    <section data-gcal-detail aria-labelledby={titleId} className="grid gap-2 rounded-control border border-line bg-canvas p-3">
      <h3 id={titleId} className="flex items-center gap-2 text-body font-semibold text-ink">
        {T.DETAIL_HEAD}{' '}
        <span
          className={`inline-flex h-5 items-center rounded-full px-1.75 text-caption font-semibold ${
            fromGoogle ? 'bg-accent-soft text-accent-strong' : 'bg-positive-soft text-positive'
          }`}
        >
          {fromGoogle ? T.FROM_GOOGLE : T.FROM_WEB}
        </span>
      </h3>
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
        <dt className="text-muted">{fromGoogle ? T.DT_TITLE_RAW : T.DT_TITLE}</dt>
        <dd className="flex min-w-0 items-start gap-1.5 text-ink">
          <Swatch color={paint.key} className="mt-1" /> <span className="min-w-0 break-words">{title}</span>
        </dd>
        <dt className="text-muted">{T.DT_COLOR}</dt>
        <dd className="flex flex-wrap items-center gap-x-1.5 text-ink">
          <Swatch color={paint.key} /> {colorName(paint.key)} <span className={HOW}>{T.COLOR_WHY[paint.why]}</span>
        </dd>
        {fromGoogle && appt.gHow && (
          <>
            <dt className="text-muted">{T.DT_GOT}</dt>
            <dd className="grid text-ink">
              <GotLines appt={appt} settings={settings} />
            </dd>
          </>
        )}
        <dt className="text-muted">{T.DT_IN}</dt>
        <dd className="text-ink">{[came, T.IN_HOW[appt.gFrom ?? 'web']].filter(Boolean).join(' ')}</dd>
        <dt className="text-muted">{T.DT_SYNC}</dt>
        <dd className="grid text-ink">
          <span data-sync className={google.waiting ? 'text-negative' : undefined}>
            {google.waiting ? T.SYNC_WAIT : T.syncSame(kstHm(google.lastOkAt))}
          </span>
          {appt.gNote && (
            <span data-gnote className={HOW}>
              {appt.gNote}
            </span>
          )}
        </dd>
      </dl>
      {fromGoogle && appt.gKeepTitle && <p className={HOW}>{T.editNote(webTitleOf(appt, settings, google.look))}</p>}
      <p className={HOW}>{T.colorNote(colorName(google.look.cancel), colorName(google.look.change))}</p>
      {appt.gEventId && (
        <a href={eventUrl(appt.gEventId, google.calendarId)} target="_blank" rel="noopener noreferrer" className={LINK}>
          {T.OPEN_EVENT}
          <OutIcon />
        </a>
      )}
    </section>
  )
}

/** 알아본 것: 시행자 · 종류 · 메모(괄호 안 글) · 길이(구글 시간) — 한 줄씩, 어디서 알아봤는지 작은 글 */
function GotLines({ appt, settings }: { appt: CalAppt; settings: CalSettings }) {
  const how = appt.gHow!
  const staffColor = settings.staff.find((s) => s.id === appt.staffId)?.color ?? appt.gColor
  const staffHow =
    how.staff === 'color' && staffColor ? T.staffByColor(colorName(staffColor)) : how.staff === 'title' || how.staff === 'picked' ? T.STAFF_HOW[how.staff] : null
  return (
    <>
      <span data-line>
        {appt.staffId === null ? T.GOT_NO_STAFF : T.gotStaff(`(${appt.staffMark}) ${appt.staffName}`)}
        {staffHow && <span className={HOW}> {staffHow}</span>}
      </span>
      <span data-line>
        {T.gotKind(appt.kindName)} <span className={HOW}>{T.KIND_HOW[how.kind]}</span>
      </span>
      {how.memo && appt.memo && (
        <span data-line>
          {T.gotMemo(appt.memo)} <span className={HOW}>{T.GOT_MEMO_HOW}</span>
        </span>
      )}
      <span data-line>
        {T.gotLen(appt.len)}
        {how.gStart && how.gEnd && <span className={HOW}> {T.gotTime(how.gStart, how.gEnd)}</span>}
      </span>
    </>
  )
}
