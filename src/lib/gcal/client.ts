import type { ErrorCode } from '@/types/errors'
import type { GEvent } from '@/lib/calendar/gshapes'
import type { GcalLink } from '@/types/gcal'

// 예약 구글 코드(google-code/calendar/Code.gs 판 '1') 부르기 한 곳 (spec google-link REQ-8524, design.md 8-2·10-5·14절, ADR-053).
// 이 폴더에서 fetch는 이 파일만 쓴다(ESLint). 쿠키 없이(credentials omit) POST text/plain — 구글 웹 앱은 미리 묻기(CORS preflight)를 받지 않는다.
// 비밀 글자는 본문에만 싣고 주소·오류 글·기록에 내지 않는다. 답 글(일정 제목 = 환자 이름)도 오류 글에 싣지 않는다

export type GcalAction = 'ping' | 'list' | 'changes' | 'put' | 'remove' | 'dropDay' | 'off'
export type GcalErrorCode = Extract<
  ErrorCode,
  'E-GCAL-REACH' | 'E-GCAL-KEY' | 'E-GCAL-GONE' | 'E-GCAL-LIMIT' | 'E-GCAL-LOGIN' | 'E-GCAL-OLD' | 'E-GCAL-SERVICE' | 'E-GCAL-URL' | 'E-GCAL-NOKEY'
>
export type GcalCallLink = Pick<GcalLink, 'scriptUrl' | 'secret'>
/** 구글 코드 답(ok: true). 칸은 부른 일마다 다르고 믿지 않는다 — readEvents·readEvent·readCalendars로 읽는다 */
export type GcalReply = { ok: true; version: string } & Record<string, unknown>
export type GcalCalendar = { id: string; name: string; access: string; hex: string | null; past: number | null; future: number | null }

export const GCAL_TIMEOUT_MS = 30_000
export const SCRIPT_URL = /^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]{1,253}|macros)\/s\/[A-Za-z0-9_-]{10,200}\/exec$/
const MIN_VERSION = 1
// DB에 둘 수 있는 구글 일정 id(calendar_appts·gcal_* 확인 제약과 같다). 반복 일정 하나는 '<id>_20261126T010000Z' 꼴
const EVENT_ID = /^[A-Za-z0-9_]{5,300}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const COLOR_ID = /^(?:[1-9]|1[01])$/

/** 구글 코드 이름(code·error 칸) → 오류 번호. too_old는 번호가 아니라 reason으로(받기가 처음부터 다시 받는다) */
const BY_NAME: Record<string, GcalErrorCode> = {
  token_not_set: 'E-GCAL-NOKEY',
  bad_token: 'E-GCAL-KEY',
  gone: 'E-GCAL-GONE',
  limit: 'E-GCAL-LIMIT',
  no_service: 'E-GCAL-SERVICE',
}

/** 부르기 실패. code = 화면 번호, reason = 구글 코드가 준 이름(too_old·bad_request·busy 등, 없으면 null) */
export class GcalCallError extends Error {
  constructor(
    readonly code: GcalErrorCode,
    readonly reason: string | null = null,
  ) {
    super(`구글 캘린더 부르기 실패(${code}${reason ? ` · ${reason}` : ''})`)
    this.name = 'GcalCallError'
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function isScriptUrl(url: unknown): url is string {
  return typeof url === 'string' && SCRIPT_URL.test(url)
}

/**
 * 답 글 읽기: '<'로 시작(로그인·안내 화면) → E-GCAL-LOGIN · JSON 아님 → E-GCAL-REACH · 판 < 1(또는 없음) → E-GCAL-OLD ·
 * ok:false → 이름(code 칸, 없으면 error 칸)으로 번호. 모르는 이름·busy·failed·bad_request는 E-GCAL-REACH
 */
export function readReply(text: string): GcalReply {
  const body = typeof text === 'string' ? text.trim() : ''
  if (body.startsWith('<')) throw new GcalCallError('E-GCAL-LOGIN')
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    throw new GcalCallError('E-GCAL-REACH')
  }
  if (!isRecord(data)) throw new GcalCallError('E-GCAL-REACH')
  const version = typeof data.version === 'string' || typeof data.version === 'number' ? Number(data.version) : NaN
  if (!(version >= MIN_VERSION)) throw new GcalCallError('E-GCAL-OLD')
  if (data.ok !== true) {
    const name = typeof data.code === 'string' && data.code ? data.code : typeof data.error === 'string' ? data.error : null
    throw new GcalCallError((name && BY_NAME[name]) || 'E-GCAL-REACH', name)
  }
  return { ...data, ok: true, version: String(data.version) }
}

/** 구글 코드 부르기. 주소 꼴이 아니면 부르지 않고 E-GCAL-URL, 30초 안에 답이 없거나 닿지 못하면 E-GCAL-REACH */
export async function gcalCall(link: GcalCallLink, action: GcalAction, body: Record<string, unknown> = {}): Promise<GcalReply> {
  if (!isScriptUrl(link.scriptUrl)) throw new GcalCallError('E-GCAL-URL')
  const payload = JSON.stringify({ ...body, key: link.secret, action })
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), GCAL_TIMEOUT_MS)
  let text: string
  try {
    const res = await fetch(link.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      credentials: 'omit',
      redirect: 'follow',
      signal: stop.signal,
    })
    text = await res.text()
  } catch {
    throw new GcalCallError('E-GCAL-REACH')
  } finally {
    clearTimeout(timer)
  }
  return readReply(text)
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const when = (v: unknown): string => (typeof v === 'string' && (DAY.test(v) || LOCAL.test(v)) ? v : '')

/** 답의 일정 하나. 모양이 틀리거나 DB에 둘 수 없는 id면 null. 지운 일정의 빈 시각은 '' */
export function readEvent(v: unknown): GEvent | null {
  if (!isRecord(v) || typeof v.id !== 'string' || !EVENT_ID.test(v.id)) return null
  if (typeof v.updated !== 'string' || Number.isNaN(Date.parse(v.updated))) return null
  const status = v.status === 'cancelled' ? 'cancelled' : 'confirmed'
  const start = when(v.start)
  const end = when(v.end)
  if (status === 'confirmed' && (!start || !end)) return null
  return {
    id: v.id,
    status,
    summary: text(v.summary),
    description: text(v.description),
    allDay: v.allDay === true,
    start,
    end,
    colorId: typeof v.colorId === 'string' && COLOR_ID.test(v.colorId) ? v.colorId : null,
    updated: v.updated,
    recurring: v.recurring === true,
  }
}

/** list·changes·dropDay 답의 일정들(틀린 것은 뺀다) */
export function readEvents(reply: GcalReply): GEvent[] {
  const list = Array.isArray(reply.events) ? reply.events : []
  return list.flatMap((v) => readEvent(v) ?? [])
}

/** list·changes 답의 다음 쪽 글(없으면 null) */
export function readNext(reply: GcalReply): string | null {
  return typeof reply.next === 'string' && reply.next ? reply.next : null
}

/** 답의 구글 지금 시각(RFC3339). 없거나 틀리면 null */
export function readNow(reply: GcalReply): string | null {
  return typeof reply.now === 'string' && !Number.isNaN(Date.parse(reply.now)) ? reply.now : null
}

/** ping 답의 캘린더 목록 */
export function readCalendars(reply: GcalReply): GcalCalendar[] {
  const list = Array.isArray(reply.calendars) ? reply.calendars : []
  const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null)
  return list.flatMap((c) =>
    isRecord(c) && typeof c.id === 'string' && c.id
      ? [{ id: c.id, name: text(c.name), access: text(c.access), hex: typeof c.hex === 'string' && /^#[0-9A-F]{6}$/i.test(c.hex) ? c.hex : null, past: count(c.past), future: count(c.future) }]
      : [],
  )
}

/** [연결 시험]: 캘린더 목록(이름·권한·색·지난 1년·앞으로 일정 수) */
export async function pingGcal(link: GcalCallLink): Promise<{ now: string | null; calendars: GcalCalendar[] }> {
  const reply = await gcalCall(link, 'ping')
  return { now: readNow(reply), calendars: readCalendars(reply) }
}
