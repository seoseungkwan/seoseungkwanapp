import type { SupabaseClient } from '@supabase/supabase-js'
import { isYmd } from '@/lib/analytics/dates'
import type { CalAllDay } from '@/lib/calendar/shapes'
import { privacyProblem } from '@/lib/worklog/notes'
import {
  CAL_COLOR_ID,
  CAL_COLORS,
  DEFAULT_CAL_SETTINGS,
  defaultKindWords,
  G_WAITS,
  type ApptAuto,
  type ApptDraft,
  type ApptGoogle,
  type ApptStatus,
  type CalAppt,
  type CalColor,
  type CalCountRow,
  type CalKind,
  type CalSettings,
  type CalSlotRow,
  type CalStaff,
  type GHow,
  type GWait,
  type KindColor,
} from '@/types/calendar'

// 예약 탭 서버 저장 (spec clinic-calendar REQ-5901 AC-5901.6, design.md '저장 함수'). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 표: 설정 calendar_settings · 예약 calendar_appts · 종일 calendar_allday · 바뀜 숫자 calendar_rev (migration 20261117010000_calendar.sql).
// 예약 줄의 환자 이름·차트번호는 서버에 둔다(ADR-030). 전화·성별·나이·생일·마지막 내원은 받아도 보내지 않는다:
// 보내는 몸통은 정해 둔 열쇠를 골라 새로 만든다({ ...받은 값 } 금지). hospital_id·id·시각·처음 자리는 DB가 정하고 어느 병원 줄인지는 RLS가 고른다.
// 이름·메모는 앞뒤 빈칸을 빼고 개인정보 모양(전화·주민번호·메일)이면 보내지 않고 'blocked'다. 그 밖에 받은 값이 틀리면 보내지 않고 failed다.
// 읽은 줄은 모양을 믿지 않는다: 틀린 줄은 빼고, 틀린 설정 칸은 기본값이다. 기간 읽기는 1,000줄씩 나눠 모두 읽는다.
// 실패는 CalendarStorageError(종류만: offline·failed)다. Supabase 문구·입력값은 화면까지 가지 않게 넣지 않는다.
// google-link(design.md 7-1·7-2·10-3): 구글 캘린더 짝 칸(g_*·color_from)을 정해 둔 이름 그대로 읽고 쓴다. 시작은 5분 칸(0~1435),
// 시행자 세 칸은 모두 null이거나 모두 글. g_wait_at·created_at은 DB만 적어 보내지 않는다. 구글 제목·덮인 쪽 글에 개인정보 모양이
// 남아 있으면 그 칸만 null로 보낸다(가리기 maskPrivate는 부르는 쪽 lib/gcal 몫). 시각 글(g_updated·g_wait_at)은 DB가 준 글 그대로 둔다

export type CalendarErrorKind = 'offline' | 'failed'

/** 오류에는 종류만 담는다 */
export class CalendarStorageError extends Error {
  readonly kind: CalendarErrorKind

  constructor(kind: CalendarErrorKind) {
    super(`calendar storage ${kind}`)
    this.name = 'CalendarStorageError'
    this.kind = kind
  }
}

// DB 제약과 같은 한도(글자 수는 DB char_length처럼 코드포인트로 센다)
export const APPT_NAME_MAX = 20
export const APPT_MEMO_MAX = 100
export const ALLDAY_MEMO_MAX = 20
export const CAL_LABEL_MAX = 10 // 시행자·종류 이름
export const CAL_ID_MAX = 40 // 시행자·종류 id
export const KIND_LEN_MAX = 120 // 설정의 종류 기본 길이(분)
export const G_TITLE_MAX = 200 // 구글 제목
export const G_NOTE_MAX = 100 // 덮인 쪽 한 줄
export const G_HOW_BYTES = 600 // 알아본 출처 JSON
export const KIND_WORDS_MAX = 10 // 종류마다 알아볼 글 수

type Client = Pick<SupabaseClient, 'from'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다

const APPTS = 'calendar_appts'
const ALLDAY = 'calendar_allday'
const SETTINGS = 'calendar_settings'
const REV = 'calendar_rev'
const APPT_COLUMNS =
  'id,day,start_min,len_min,name,chart,staff_id,staff_name,staff_mark,kind_id,kind_name,memo,status,auto,orig_day,orig_start,' +
  'g_event_id,g_updated,g_title,g_color,color_from,g_keep_title,g_moved,g_gone,g_wait,g_wait_at,g_note,g_from,g_how,created_at'
const COUNT_COLUMNS = 'day,staff_id,staff_name,kind_id,kind_name,status,auto,orig_day,g_moved' // 이름·차트번호·메모 없음
const SLOT_COLUMNS = 'day,staff_id,staff_name,kind_id,kind_name,status,auto,start_min,len_min,chart' // 이름·메모 없음(stats-insights AC-6104.1)
// part = 반차 휴무(직원 탭 휴가에서 트리거가 적음, spec staff AC-7616.1 — migration 20261121000000_staff.sql). leave_id는 읽지 않는다
// g_* = 구글 일정 짝(종일 메모만, google-link design.md 7-2)
const ALLDAY_COLUMNS = 'id,day,type,memo,staff_id,staff_name,part,g_event_id,g_updated,g_wait,g_wait_at'
const SETTINGS_COLUMNS = 'kinds,staff,open_hour,close_hour,sunday'
const PAGE_ROWS = 1000
const EVENT_CHUNK = 100 // 구글 일정 id로 찾을 때 한 번에 묻는 수(주소 길이)
const INSERT_CHUNK = 500 // 구글 예약 넣기 한 번에 보내는 줄 수
const G_CONFLICT = 'hospital_id,g_event_id'
const ASC = { ascending: true }
const STATUSES: readonly ApptStatus[] = ['auto', 'came', 'noshow', 'cancel']

const failed = () => new CalendarStorageError('failed')

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new CalendarStorageError('offline')
}

// postgrest-js는 연결 실패를 던지지 않고 status 0으로 돌려준다(응답 없음 = offline).
// 그래도 던져지면 원문이 화면으로 새지 않게 failed로 바꾼다 (sunap.ts와 같은 모양)
async function send<Reply extends { data?: unknown; error: unknown; status: number }>(request: () => PromiseLike<Reply>): Promise<Reply> {
  failIfOffline()
  let reply: Reply
  try {
    reply = await request()
  } catch {
    throw failed()
  }
  if (reply.error) throw new CalendarStorageError(reply.status === 0 ? 'offline' : 'failed')
  return reply
}

/** 1,000줄씩 끝까지 읽는다. 쪽 하나라도 실패하거나 목록이 아니면 반쪽 목록 대신 failed */
async function readPages(page: (first: number, last: number) => PromiseLike<{ data: unknown; error: unknown; status: number }>): Promise<unknown[]> {
  const all: unknown[] = []
  for (;;) {
    const { data } = await send(() => page(all.length, all.length + PAGE_ROWS - 1))
    if (!Array.isArray(data)) throw failed()
    all.push(...data)
    if (data.length < PAGE_ROWS) return all
  }
}

const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const lengthOf = (text: string) => [...text].length
const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && lengthOf(value) >= min && lengthOf(value) <= max
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const isStepped = (value: unknown, min: number, max: number, step: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max && (value as number) % step === 0
const isStart = (value: unknown): value is number => isStepped(value, 0, 1435, 5) // 5분 칸(google-link AC-8503.3)
const isLen = (value: unknown): value is number => isStepped(value, 5, 240, 5)
const isChart = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,10}$/.test(value)
const isStatus = (value: unknown): value is ApptStatus => (STATUSES as readonly unknown[]).includes(value)
const isAuto = (value: unknown): value is ApptAuto => value === null || value === 'came' || value === 'noshow'
const isColor = (value: unknown): value is CalColor => (CAL_COLORS as readonly unknown[]).includes(value)
const isKindColor = (value: unknown): value is KindColor => value === null || value === 'default' || isColor(value)
const isBool = (value: unknown): value is boolean => typeof value === 'boolean'
// 구글 일정 id(design.md 7-1): 글자·숫자·_ 5~300자. 웹앱이 정하는 id는 'ssk' + 32자 16진수
const isEventId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_]{5,300}$/.test(value)
// 시각 글(timestamptz·구글 updated). 따옴표·쉼표가 없어 PostgREST 조건 글에 그대로 넣어도 된다
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && TIMESTAMP.test(value)
const isGWait = (value: unknown): value is GWait => (G_WAITS as readonly unknown[]).includes(value)
const isGFrom = (value: unknown): value is NonNullable<CalAppt['gFrom']> => value === 'import' || value === 'pull' || value === 'web'
const isColorFrom = (value: unknown): value is CalAppt['colorFrom'] => value === 'app' || value === 'google'
const COLOR_BY_ID = new Map<unknown, CalColor>(CAL_COLORS.map((color) => [CAL_COLOR_ID[color], color]))
const HOW_STAFF: readonly unknown[] = ['title', 'color', 'picked', 'none']
const HOW_KIND: readonly unknown[] = ['title', 'color', 'setting', 'picked']
const bytesOf = (text: string) => new TextEncoder().encode(text).length

/** 알아본 출처: 다섯 열쇠를 골라 새로 만든다. 모양이 틀리거나 JSON이 600바이트를 넘으면 null */
function cleanHow(value: unknown): GHow | null {
  if (!isRecord(value)) return null
  const { staff, kind, memo, gStart, gEnd } = value
  if (!HOW_STAFF.includes(staff) || !HOW_KIND.includes(kind) || !isBool(memo) || typeof gStart !== 'string' || typeof gEnd !== 'string') return null
  const how = { staff, kind, memo, gStart, gEnd } as GHow
  return bytesOf(JSON.stringify(how)) <= G_HOW_BYTES ? how : null
}

/** 시행자 세 칸: 모두 null(시행자 없음)이거나 모두 맞는 글 */
function staffTrioOk(id: unknown, name: unknown, mark: unknown): boolean {
  if (id === null && name === null && mark === null) return true
  return isText(id, 1, CAL_ID_MAX) && isText(name, 1, CAL_LABEL_MAX) && isText(mark, 1, 1)
}

function requireId(id: unknown): string {
  if (!isFilled(id)) throw failed()
  return id
}

function requirePeriod(from: unknown, to: unknown): [string, string] {
  if (!isDay(from) || !isDay(to) || from > to) throw failed()
  return [from, to]
}

function trimmed(value: unknown): string {
  if (typeof value !== 'string') throw failed()
  return value.trim()
}

// ── 예약 (calendar_appts) ───────────────────────────────────

function toAppt(row: unknown): CalAppt | null {
  if (!isRecord(row)) return null
  const { id, day, start_min: start, len_min: len, name, chart, memo, status, auto, orig_day: origDay, orig_start: origStart } = row
  const { staff_id: staffId, staff_name: staffName, staff_mark: staffMark, kind_id: kindId, kind_name: kindName } = row
  const origOk = (origDay === null && origStart === null) || (isDay(origDay) && isStart(origStart))
  if (
    !isFilled(id) ||
    !isDay(day) ||
    !isStart(start) ||
    !isLen(len) ||
    !isText(name, 1, APPT_NAME_MAX) ||
    !(chart === null || isChart(chart)) ||
    !staffTrioOk(staffId, staffName, staffMark) ||
    !isText(kindId, 1, CAL_ID_MAX) ||
    !isText(kindName, 1, CAL_LABEL_MAX) ||
    !isText(memo, 0, APPT_MEMO_MAX) ||
    !isStatus(status) ||
    !isAuto(auto) ||
    !origOk
  ) {
    return null
  }
  const google = toGoogle(row)
  if (google === null) return null
  return {
    id,
    day,
    start,
    len,
    name,
    chart: chart as string | null,
    staffId: staffId as string | null,
    staffName: staffName as string | null,
    staffMark: staffMark as string | null,
    kindId,
    kindName,
    memo,
    status,
    auto,
    origDay: origDay as string | null,
    origStart: origStart as number | null,
    ...google,
  }
}

type ReadGoogle = Required<ApptGoogle> & Pick<CalAppt, 'gWaitAt' | 'createdAt'>

/** 읽은 줄의 구글 칸. 하나라도 틀리면 null(그 줄을 뺀다) */
function toGoogle(row: ReadRow): ReadGoogle | null {
  const { g_event_id: gEventId, g_updated: gUpdated, g_title: gTitle, g_color: gColorId, color_from: colorFrom } = row
  const { g_keep_title: gKeepTitle, g_moved: gMoved, g_gone: gGone, g_wait: gWait, g_wait_at: gWaitAt, g_note: gNote, g_from: gFrom } = row
  const gHow = row.g_how === null ? null : cleanHow(row.g_how)
  const gColor = gColorId === null ? null : COLOR_BY_ID.get(gColorId)
  if (
    !(gEventId === null || isEventId(gEventId)) ||
    !(gUpdated === null || isTimestamp(gUpdated)) ||
    !(gTitle === null || isText(gTitle, 0, G_TITLE_MAX)) ||
    gColor === undefined ||
    !isColorFrom(colorFrom) ||
    !isBool(gKeepTitle) ||
    !isBool(gMoved) ||
    !isBool(gGone) ||
    !(gWait === null || isGWait(gWait)) ||
    !(gWaitAt === null || isTimestamp(gWaitAt)) ||
    !(gNote === null || isText(gNote, 0, G_NOTE_MAX)) ||
    !(gFrom === null || isGFrom(gFrom)) ||
    (row.g_how !== null && gHow === null) ||
    !isTimestamp(row.created_at)
  ) {
    return null
  }
  return {
    gEventId: gEventId as string | null,
    gUpdated: gUpdated as string | null,
    gTitle: gTitle as string | null,
    gColor,
    colorFrom,
    gKeepTitle,
    gMoved,
    gGone,
    gWait: gWait as GWait | null,
    gWaitAt: gWaitAt as string | null,
    gNote: gNote as string | null,
    gFrom: gFrom as CalAppt['gFrom'],
    gHow,
    createdAt: row.created_at as string,
  }
}

function toCount(row: unknown): CalCountRow | null {
  if (!isRecord(row)) return null
  const { day, staff_id: staffId, staff_name: staffName, kind_id: kindId, kind_name: kindName, status, auto, orig_day: origDay, g_moved: gMoved } = row
  if (
    !isDay(day) ||
    !staffPairOk(staffId, staffName) ||
    !isText(kindId, 1, CAL_ID_MAX) ||
    !isText(kindName, 1, CAL_LABEL_MAX) ||
    !isStatus(status) ||
    !isAuto(auto) ||
    !(origDay === null || isDay(origDay)) ||
    !(gMoved === undefined || gMoved === null || isBool(gMoved))
  ) {
    return null
  }
  // g_moved 칸이 없거나 null이면 거짓(관리자 보기 admin_rows처럼 칸이 없는 줄과 같은 모양으로, AC-8503.4)
  return { day, staffId: staffId as string | null, staffName: staffName as string | null, kindId, kindName, status, auto, origDay, gMoved: gMoved === true }
}

/** 수 세기 줄의 시행자 두 칸: 함께 null이거나 함께 맞는 글 */
function staffPairOk(id: unknown, name: unknown): boolean {
  return (id === null && name === null) || (isText(id, 1, CAL_ID_MAX) && isText(name, 1, CAL_LABEL_MAX))
}

function toSlot(row: unknown): CalSlotRow | null {
  if (!isRecord(row)) return null
  const { day, staff_id: staffId, staff_name: staffName, kind_id: kindId, kind_name: kindName, status, auto, start_min: start, len_min: len, chart } = row
  if (
    !isDay(day) ||
    !staffPairOk(staffId, staffName) ||
    !isText(kindId, 1, CAL_ID_MAX) ||
    !isText(kindName, 1, CAL_LABEL_MAX) ||
    !isStatus(status) ||
    !isAuto(auto) ||
    !isStart(start) ||
    !isLen(len) ||
    !(chart === null || isChart(chart))
  ) {
    return null
  }
  return { day, staffId: staffId as string | null, staffName: staffName as string | null, kindId, kindName, status, auto, start, len, chart: chart as string | null }
}

function savedAppt(data: unknown): CalAppt {
  const appt = toAppt(data)
  if (appt === null) throw failed()
  return appt
}

/**
 * 받은 칸만 골라 DB 칸 이름으로 바꾼다(정해 둔 열두 칸 차례 → 구글 칸 차례). 이름·메모는 앞뒤 빈칸을 빼고, 빈 차트번호는 null이다.
 * 시행자 세 칸은 함께 와야 하고 모두 null이거나 모두 글이다. 이름·메모가 개인정보 모양이면 'blocked', 값이 틀리면 failed
 */
function apptBody(input: Partial<ApptDraft>): Record<string, unknown> | 'blocked' {
  const name = input.name === undefined ? undefined : trimmed(input.name)
  const memo = input.memo === undefined ? undefined : trimmed(input.memo)
  if ((name !== undefined && privacyProblem(name)) || (memo !== undefined && privacyProblem(memo))) return 'blocked'
  const chart = input.chart === undefined || input.chart === null ? input.chart : trimmed(input.chart) || null
  const body: Record<string, unknown> = {}
  const put = (key: string, value: unknown, ok: boolean) => {
    if (value === undefined) return
    if (!ok) throw failed()
    body[key] = value
  }
  put('day', input.day, isDay(input.day))
  put('start_min', input.start, isStart(input.start))
  put('len_min', input.len, isLen(input.len))
  put('name', name, isText(name, 1, APPT_NAME_MAX))
  put('chart', chart, chart === null || isChart(chart))
  const staff = [input.staffId, input.staffName, input.staffMark]
  if (staff.some((value) => value !== undefined)) {
    if (staff.some((value) => value === undefined) || !staffTrioOk(input.staffId, input.staffName, input.staffMark)) throw failed()
    body.staff_id = input.staffId
    body.staff_name = input.staffName
    body.staff_mark = input.staffMark
  }
  put('kind_id', input.kindId, isText(input.kindId, 1, CAL_ID_MAX))
  put('kind_name', input.kindName, isText(input.kindName, 1, CAL_LABEL_MAX))
  put('memo', memo, isText(memo, 0, APPT_MEMO_MAX))
  put('status', input.status, isStatus(input.status))
  Object.assign(body, googleBody(input))
  return body
}

// 개인정보 모양이 남은 구글 글은 그 칸만 보내지 않는다(null, AC-8505.3)
const unsafeToNull = (text: string | null) => (text !== null && privacyProblem(text) ? null : text)

/** 받은 구글 칸만 DB 칸 이름으로(정해 둔 차례). g_wait_at·created_at은 받아도 보내지 않는다. 값이 틀리면 failed */
function googleBody(input: Partial<ApptGoogle>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const put = (key: string, value: unknown, ok: boolean) => {
    if (value === undefined) return
    if (!ok) throw failed()
    body[key] = value
  }
  const { gTitle, gNote, gColor, gHow } = input
  put('g_event_id', input.gEventId, input.gEventId === null || isEventId(input.gEventId))
  put('g_updated', input.gUpdated, input.gUpdated === null || isTimestamp(input.gUpdated))
  put('g_title', gTitle === undefined ? undefined : unsafeToNull(gTitle), gTitle === null || isText(gTitle, 0, G_TITLE_MAX))
  if (gColor !== undefined && gColor !== null && !isColor(gColor)) throw failed() // 옛 이름·colorId 글은 받지 않는다(색 이름 → colorId는 여기서만)
  put('g_color', gColor === undefined ? undefined : gColor === null ? null : CAL_COLOR_ID[gColor], true)
  put('color_from', input.colorFrom, isColorFrom(input.colorFrom))
  put('g_keep_title', input.gKeepTitle, isBool(input.gKeepTitle))
  put('g_moved', input.gMoved, isBool(input.gMoved))
  put('g_gone', input.gGone, isBool(input.gGone))
  put('g_wait', input.gWait, input.gWait === null || isGWait(input.gWait))
  put('g_note', gNote === undefined ? undefined : unsafeToNull(gNote), gNote === null || isText(gNote, 0, G_NOTE_MAX))
  put('g_from', input.gFrom, input.gFrom === null || isGFrom(input.gFrom))
  const how = gHow === undefined || gHow === null ? gHow : cleanHow(gHow)
  put('g_how', how, gHow === null || how !== null)
  return body
}

const APPT_FIELDS = 12
// 구글 예약 넣기(처음 가져오기·받기)에서 받지 않은 구글 칸은 DB 기본값과 같은 값으로 채워 줄마다 칸이 같게 한다
const GOOGLE_DEFAULTS: Required<ApptGoogle> = {
  gEventId: null,
  gUpdated: null,
  gTitle: null,
  gColor: null,
  colorFrom: 'app',
  gKeepTitle: false,
  gMoved: false,
  gGone: false,
  gWait: null,
  gNote: null,
  gFrom: null,
  gHow: null,
}

/** from~to(둘 다 포함) 예약, 날·시작 차례. 모양이 틀린 줄은 뺀다 */
export async function listAppts(client: Client, from: string, to: string): Promise<CalAppt[]> {
  const [start, end] = requirePeriod(from, to)
  const found = await readPages((first, last) =>
    client.from(APPTS).select(APPT_COLUMNS).gte('day', start).lte('day', end).order('day', ASC).order('start_min', ASC).order('id', ASC).range(first, last),
  )
  return found.flatMap((row) => toAppt(row) ?? [])
}

/** 통계·월 보기 수 세기: from~to 예약의 수 세기 칸만(이름·차트번호·메모 없음) */
export async function listCalendarCounts(client: Client, from: string, to: string): Promise<CalCountRow[]> {
  const [start, end] = requirePeriod(from, to)
  const found = await readPages((first, last) =>
    client.from(APPTS).select(COUNT_COLUMNS).gte('day', start).lte('day', end).order('day', ASC).order('id', ASC).range(first, last),
  )
  return found.flatMap((row) => toCount(row) ?? [])
}

/** 통계 다시 예약·예약 빈자리(stats-insights AC-6104.1): from~to 예약의 날·시행자·종류·상태·도착 표시·시작·길이·차트번호만(이름·메모 없음) */
export async function listCalendarSlots(client: Client, from: string, to: string): Promise<CalSlotRow[]> {
  const [start, end] = requirePeriod(from, to)
  const found = await readPages((first, last) =>
    client.from(APPTS).select(SLOT_COLUMNS).gte('day', start).lte('day', end).order('day', ASC).order('id', ASC).range(first, last),
  )
  return found.flatMap((row) => toSlot(row) ?? [])
}

/** 예약 한 줄 넣기. DB가 준 줄(새 id, 상태 그대로)을 돌려준다 */
export async function addAppt(client: Client, draft: ApptDraft): Promise<CalAppt | 'blocked'> {
  const body = apptBody(draft)
  if (body === 'blocked') return body
  if (!hasBaseFields(body)) throw failed()
  const { data } = await send(() => client.from(APPTS).insert(body).select(APPT_COLUMNS).single<ReadRow>())
  return savedAppt(data)
}

const BASE_KEYS = ['day', 'start_min', 'len_min', 'name', 'chart', 'staff_id', 'staff_name', 'staff_mark', 'kind_id', 'kind_name', 'memo', 'status']
const hasBaseFields = (body: Record<string, unknown>) => BASE_KEYS.length === APPT_FIELDS && BASE_KEYS.every((key) => key in body)

/** 받은 칸만 그 id 줄에 고친다. 날짜·시작이 바뀌면 DB가 처음 자리를 적고 도착 자동 값을 비운다. 고칠 칸이 없으면 보내지 않고 failed */
export async function updateAppt(client: Client, id: string, patch: Partial<ApptDraft>): Promise<CalAppt | 'blocked'> {
  const target = requireId(id)
  const body = apptBody(patch)
  if (body === 'blocked') return body
  if (Object.keys(body).length === 0) throw failed()
  const { data } = await send(() => client.from(APPTS).update(body).eq('id', target).select(APPT_COLUMNS).single<ReadRow>())
  return savedAppt(data)
}

/** 비트 PC가 정한 도착 표시(auto) 한 칸만 그 id 줄에 적는다. 셈한 자리(날짜·시작)가 그대로일 때만 — 그새 다른 PC가 옮긴 예약에는 옛 자리의 도착을 적지 않는다(옮기면 DB가 auto를 비운다) */
export async function setApptAuto(client: Client, id: string, auto: ApptAuto, slot: { day: string; start: number }): Promise<void> {
  const target = requireId(id)
  if (!isAuto(auto) || !isDay(slot?.day) || !isStart(slot?.start)) throw failed()
  await send(() => client.from(APPTS).update({ auto }).eq('id', target).eq('day', slot.day).eq('start_min', slot.start))
}

/** 아직 구글로 못 보낸 예약(g_wait 있음): fromDay부터, 고친 때(g_wait_at)·id 차례로 모두 */
export async function listWaitingAppts(client: Client, fromDay: string): Promise<CalAppt[]> {
  if (!isDay(fromDay)) throw failed()
  const found = await readPages((first, last) =>
    client.from(APPTS).select(APPT_COLUMNS).not('g_wait', 'is', null).gte('day', fromDay).order('g_wait_at', ASC).order('id', ASC).range(first, last),
  )
  return found.flatMap((row) => toAppt(row) ?? [])
}

/** 구글 일정 id로 짝 예약 찾기(겹친 id는 한 번, 100개씩). 빈 목록이면 부르지 않는다. 모양이 틀린 id가 있으면 보내지 않고 failed */
export async function findApptsByEvents(client: Client, ids: readonly string[]): Promise<CalAppt[]> {
  if (!Array.isArray(ids) || !ids.every(isEventId)) throw failed()
  const unique = [...new Set(ids)]
  const found: CalAppt[] = []
  for (let at = 0; at < unique.length; at += EVENT_CHUNK) {
    const chunk = unique.slice(at, at + EVENT_CHUNK)
    const { data } = await send(() => client.from(APPTS).select(APPT_COLUMNS).in('g_event_id', chunk).order('id', ASC))
    if (!Array.isArray(data)) throw failed()
    found.push(...data.flatMap((row) => toAppt(row) ?? []))
  }
  return found
}

// 조건 고치기 글: g_updated가 null이거나 받은 때보다 이름(시각 글은 따옴표로 묶는다 — PostgREST 예약 글자 . : 때문)
const olderThan = (gUpdated: string) => `g_updated.is.null,g_updated.lt."${gUpdated}"`
const expectWait = (expectWaitAt: unknown): string | null => {
  if (expectWaitAt === null) return null
  if (!isTimestamp(expectWaitAt)) throw failed()
  return expectWaitAt
}

/** 고친 줄 목록(0줄 또는 1줄) → 줄 하나 또는 null */
function oneOrNone<T>(data: unknown, read: (row: unknown) => T | null): T | null {
  if (!Array.isArray(data) || data.length > 1) throw failed()
  if (data.length === 0) return null
  const saved = read(data[0])
  if (saved === null) throw failed()
  return saved
}

/**
 * 구글에서 받은 바뀜을 적는다(조건 고치기): g_updated가 null이거나 gUpdated보다 이르고, g_wait_at이 읽을 때 글(expectWaitAt) 그대로일 때만.
 * g_updated는 gUpdated로 적는다. 맞는 줄이 없으면(그 사이 고침·이미 적음) null. 이름·메모가 개인정보 모양이면 보내지 않고 'blocked'
 */
export async function applyGoogleAppt(
  client: Client,
  id: string,
  patch: Partial<ApptDraft>,
  gUpdated: string,
  expectWaitAt: string | null,
): Promise<CalAppt | null | 'blocked'> {
  const target = requireId(id)
  if (!isTimestamp(gUpdated)) throw failed()
  const waitAt = expectWait(expectWaitAt)
  const body = apptBody({ ...patch, gUpdated })
  if (body === 'blocked') return body
  const { data } = await send(() => {
    const query = client.from(APPTS).update(body).eq('id', target).or(olderThan(gUpdated))
    return (waitAt === null ? query.is('g_wait_at', null) : query.eq('g_wait_at', waitAt)).select(APPT_COLUMNS)
  })
  return oneOrNone(data, toAppt)
}

/** 보낸 뒤 받은 구글 칸(정해 둔 셋만) */
export type ApptSent = Partial<Pick<ApptGoogle, 'gUpdated' | 'gTitle' | 'gGone'>>

/** 보낸 뒤: g_wait_at이 보낼 때 읽은 글 그대로일 때만 g_wait를 비우고 받은 구글 칸(고친 때·제목·지움)을 적는다. 0줄(그 사이 다시 고침)이면 거짓 */
export async function markApptSent(client: Client, id: string, sent: ApptSent, expectWaitAt: string): Promise<boolean> {
  const target = requireId(id)
  const waitAt = expectWait(expectWaitAt)
  if (waitAt === null || !isRecord(sent)) throw failed()
  const body = googleBody({ gUpdated: sent.gUpdated, gTitle: sent.gTitle, gGone: sent.gGone, gWait: null })
  const { data } = await send(() => client.from(APPTS).update(body).eq('id', target).eq('g_wait_at', waitAt).select('id'))
  if (!Array.isArray(data)) throw failed()
  return data.length > 0
}

/**
 * 처음 가져오기·받기 넣기: 500줄씩 on conflict (hospital_id, g_event_id) do nothing. 줄마다 열두 칸 + 구글 칸 열두 칸(받지 않은 칸은 DB 기본값).
 * 구글 일정 id가 없거나 모양이 틀린 줄이 하나라도 있으면 아무것도 보내지 않고 failed. 이름·메모가 개인정보 모양인 줄은 빼고 센다(blocked)
 */
export async function insertGoogleAppts(client: Client, rows: readonly ApptDraft[]): Promise<{ sent: number; blocked: number }> {
  if (!Array.isArray(rows)) throw failed()
  const bodies: Record<string, unknown>[] = []
  let blocked = 0
  for (const row of rows) {
    if (!isRecord(row) || !isEventId(row.gEventId)) throw failed()
    const google = Object.fromEntries((Object.keys(GOOGLE_DEFAULTS) as (keyof ApptGoogle)[]).map((key) => [key, row[key] === undefined ? GOOGLE_DEFAULTS[key] : row[key]]))
    const body = apptBody({ ...row, ...google })
    if (body === 'blocked') {
      blocked++
      continue
    }
    if (!hasBaseFields(body)) throw failed()
    bodies.push(body)
  }
  for (let at = 0; at < bodies.length; at += INSERT_CHUNK) {
    const chunk = bodies.slice(at, at + INSERT_CHUNK)
    await send(() => client.from(APPTS).upsert(chunk, { onConflict: G_CONFLICT, ignoreDuplicates: true }))
  }
  return { sent: bodies.length, blocked }
}

/** 웹앱이 정하는 구글 일정 id: 'ssk' + 32자 16진수(design.md 7-1) — 넣는 같은 쓰기에 함께 보내 두 PC가 같은 일정을 두 번 만들지 않게 */
export function newGoogleEventId(): string {
  return `ssk${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

/** 예약 한 줄 지우기. id가 비면 보내지 않는다(조건 없는 지우기를 보내지 않으려고) */
export async function deleteAppt(client: Client, id: string): Promise<void> {
  const target = requireId(id)
  await send(() => client.from(APPTS).delete().eq('id', target))
}

// ── 종일 (calendar_allday) ──────────────────────────────────

// 종일 줄: part가 null이거나 없으면 종일(돌려주는 줄에 part 칸을 두지 않는다 — 지금 모양 그대로), 'am'·'pm'은 휴무 줄만
// 메모 줄은 구글 칸(g_event_id·g_updated·g_wait·g_wait_at)을 함께 옮긴다. 휴무 줄은 구글 칸을 보지 않는다(off 줄 짝은 gcal_off_days)
function toAllDay(row: unknown): CalAllDay | null {
  if (!isRecord(row)) return null
  const { id, day, type, memo, staff_id: staffId, staff_name: staffName, part } = row
  if (!isFilled(id) || !isDay(day)) return null
  const whole = part === null || part === undefined
  if (type === 'memo' && whole && isText(memo, 1, ALLDAY_MEMO_MAX) && staffId === null && staffName === null) {
    const { g_event_id: gEventId, g_updated: gUpdated, g_wait: gWait, g_wait_at: gWaitAt } = row
    if (!(gEventId === null || isEventId(gEventId)) || !(gUpdated === null || isTimestamp(gUpdated)) || !isBool(gWait) || !(gWaitAt === null || isTimestamp(gWaitAt))) {
      return null
    }
    return { id, day, type, memo, staffId: null, staffName: null, gEventId: gEventId as string | null, gUpdated: gUpdated as string | null, gWait, gWaitAt: gWaitAt as string | null }
  }
  if (type === 'off' && memo === null && isText(staffId, 1, CAL_ID_MAX) && isText(staffName, 1, CAL_LABEL_MAX)) {
    if (whole) return { id, day, type, memo: null, staffId, staffName }
    if (part === 'am' || part === 'pm') return { id, day, type, memo: null, staffId, staffName, part }
  }
  return null
}

/** from~to 종일 줄, 날·넣은 차례. 모양이 틀린 줄은 뺀다 */
export async function listAllDay(client: Client, from: string, to: string): Promise<CalAllDay[]> {
  const [start, end] = requirePeriod(from, to)
  const found = await readPages((first, last) =>
    client.from(ALLDAY).select(ALLDAY_COLUMNS).gte('day', start).lte('day', end).order('day', ASC).order('created_at', ASC).order('id', ASC).range(first, last),
  )
  return found.flatMap((row) => toAllDay(row) ?? [])
}

/** 종일 한 줄 넣기: 메모(20자, 개인정보 모양이면 'blocked') 또는 시행자 휴무(종일). 다섯 칸을 늘 보낸다(쓰지 않는 칸은 null).
 * part·leave_id는 보내지 않는다(넣기 권한이 없고 직원 탭 휴가 트리거만 쓴다).
 * 메모 줄은 받은 구글 칸(gEventId·gUpdated·gWait)을 같은 넣기에 함께 보낸다(휴무 줄에는 보내지 않는다) */
export async function addAllDay(client: Client, item: Omit<CalAllDay, 'id'>): Promise<CalAllDay | 'blocked'> {
  if (!isDay(item.day)) throw failed()
  let row: Record<string, unknown>
  if (item.type === 'memo') {
    const memo = trimmed(item.memo)
    if (privacyProblem(memo)) return 'blocked'
    if (!isText(memo, 1, ALLDAY_MEMO_MAX)) throw failed()
    row = { day: item.day, type: 'memo', memo, staff_id: null, staff_name: null, ...memoGoogle(item) }
  } else if (item.type === 'off') {
    if (!isText(item.staffId, 1, CAL_ID_MAX) || !isText(item.staffName, 1, CAL_LABEL_MAX)) throw failed()
    row = { day: item.day, type: 'off', memo: null, staff_id: item.staffId, staff_name: item.staffName }
  } else {
    throw failed()
  }
  const { data } = await send(() => client.from(ALLDAY).insert(row).select(ALLDAY_COLUMNS).single<ReadRow>())
  const saved = toAllDay(data)
  if (saved === null) throw failed()
  return saved
}

/** 메모 줄 구글 칸(받은 것만). 값이 틀리면 failed */
function memoGoogle(item: Pick<CalAllDay, 'gEventId' | 'gUpdated' | 'gWait'>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (item.gEventId !== undefined) {
    if (!(item.gEventId === null || isEventId(item.gEventId))) throw failed()
    body.g_event_id = item.gEventId
  }
  if (item.gUpdated !== undefined) {
    if (!(item.gUpdated === null || isTimestamp(item.gUpdated))) throw failed()
    body.g_updated = item.gUpdated
  }
  if (item.gWait !== undefined) {
    if (!isBool(item.gWait)) throw failed()
    body.g_wait = item.gWait
  }
  return body
}

/** 아직 구글로 못 보낸 종일 메모(g_wait 참): fromDay부터, 고친 때·id 차례로 모두 */
export async function listWaitingMemos(client: Client, fromDay: string): Promise<CalAllDay[]> {
  if (!isDay(fromDay)) throw failed()
  const found = await readPages((first, last) =>
    client.from(ALLDAY).select(ALLDAY_COLUMNS).eq('type', 'memo').eq('g_wait', true).gte('day', fromDay).order('g_wait_at', ASC).order('id', ASC).range(first, last),
  )
  return found.flatMap((row) => toAllDay(row) ?? [])
}

/** 보낸 뒤: g_wait_at이 보낼 때 읽은 글 그대로일 때만 g_wait를 거짓으로(받은 구글 고친 때도 함께). 0줄이면 거짓 */
export async function markMemoSent(client: Client, id: string, expectWaitAt: string, gUpdated?: string): Promise<boolean> {
  const target = requireId(id)
  const waitAt = expectWait(expectWaitAt)
  if (waitAt === null || !(gUpdated === undefined || isTimestamp(gUpdated))) throw failed()
  const body: Record<string, unknown> = gUpdated === undefined ? { g_wait: false } : { g_updated: gUpdated, g_wait: false }
  const { data } = await send(() => client.from(ALLDAY).update(body).eq('id', target).eq('g_wait_at', waitAt).select('id'))
  if (!Array.isArray(data)) throw failed()
  return data.length > 0
}

/**
 * 구글에서 받은 종일 메모 바뀜(날짜·메모)을 그 메모 줄에 고치기로 적는다(지우고 다시 넣지 않는다 — 지움 트리거가 구글 지우기를 적지 않게).
 * 조건 고치기: g_updated가 null이거나 gUpdated보다 이르고 g_wait_at이 읽을 때 글 그대로일 때만. 맞는 줄이 없으면 null. 메모가 개인정보 모양이면 'blocked'
 */
export async function applyGoogleMemo(
  client: Client,
  id: string,
  patch: { day?: string; memo?: string },
  gUpdated: string,
  expectWaitAt: string | null,
): Promise<CalAllDay | null | 'blocked'> {
  const target = requireId(id)
  if (!isTimestamp(gUpdated) || !isRecord(patch)) throw failed()
  const waitAt = expectWait(expectWaitAt)
  const body: Record<string, unknown> = {}
  if (patch.day !== undefined) {
    if (!isDay(patch.day)) throw failed()
    body.day = patch.day
  }
  if (patch.memo !== undefined) {
    const memo = trimmed(patch.memo)
    if (privacyProblem(memo)) return 'blocked'
    if (!isText(memo, 1, ALLDAY_MEMO_MAX)) throw failed()
    body.memo = memo
  }
  body.g_updated = gUpdated
  const { data } = await send(() => {
    const query = client.from(ALLDAY).update(body).eq('id', target).eq('type', 'memo').or(olderThan(gUpdated))
    return (waitAt === null ? query.is('g_wait_at', null) : query.eq('g_wait_at', waitAt)).select(ALLDAY_COLUMNS)
  })
  return oneOrNone(data, toAllDay)
}

/** 종일 한 줄 지우기. id가 비면 보내지 않는다 */
export async function deleteAllDay(client: Client, id: string): Promise<void> {
  const target = requireId(id)
  await send(() => client.from(ALLDAY).delete().eq('id', target))
}

// ── 설정 (calendar_settings) ────────────────────────────────

/** 설정 문제(화면이 글로 바꾼다). 늘 이 차례로, 겹치지 않게 돌려준다 */
export type CalSettingsProblem =
  | 'kinds-empty' // 종류 0개
  | 'kind-id' // 종류 id가 비었거나 40자 넘음·겹침
  | 'kind-name' // 종류 이름 1~10자 아님
  | 'kind-len' // 기본 길이 5~120분·5의 배수 아님
  | 'kind-color' // 색 이름 밖(null = 시행자 색 따름·'default' = 캘린더 기본 색은 됨)
  | 'staff-id' // 시행자 목록이 아님·id가 비었거나 40자 넘음·겹침
  | 'staff-name' // 시행자 이름 1~10자 아님
  | 'staff-mark' // 한 글자 표시가 한 글자 아님
  | 'staff-mark-dup' // 한 글자 표시 겹침
  | 'staff-color' // 시행자 색 이름 밖
  | 'hours' // 보이는 시간: 시작 5~12시·끝 12~24시 정수, 시작 < 끝
  | 'sunday' // 일요일 보기가 참거짓 아님
const PROBLEM_ORDER: readonly CalSettingsProblem[] = [
  'kinds-empty',
  'kind-id',
  'kind-name',
  'kind-len',
  'kind-color',
  'staff-id',
  'staff-name',
  'staff-mark',
  'staff-mark-dup',
  'staff-color',
  'hours',
  'sunday',
]

const isLabel = (value: unknown) => typeof value === 'string' && isText(value.trim(), 1, CAL_LABEL_MAX)
const isHours = (open: unknown, close: unknown) =>
  isStepped(open, 5, 12, 1) && isStepped(close, 12, 24, 1) && (open as number) < (close as number)

function checkKinds(value: unknown, found: Set<CalSettingsProblem>): void {
  if (!Array.isArray(value) || value.length === 0) {
    found.add('kinds-empty')
    return
  }
  const ids = new Set<unknown>()
  for (const item of value) {
    const kind = isRecord(item) ? item : {}
    if (!isText(kind.id, 1, CAL_ID_MAX) || ids.has(kind.id)) found.add('kind-id')
    ids.add(kind.id)
    if (!isLabel(kind.name)) found.add('kind-name')
    if (!isStepped(kind.len, 5, KIND_LEN_MAX, 5)) found.add('kind-len')
    if (!isKindColor(kind.color)) found.add('kind-color')
  }
}

function checkStaff(value: unknown, found: Set<CalSettingsProblem>): void {
  if (!Array.isArray(value)) {
    found.add('staff-id')
    return
  }
  const ids = new Set<unknown>()
  const marks = new Set<string>()
  for (const item of value) {
    const person = isRecord(item) ? item : {}
    if (!isText(person.id, 1, CAL_ID_MAX) || ids.has(person.id)) found.add('staff-id')
    ids.add(person.id)
    if (!isLabel(person.name)) found.add('staff-name')
    const mark = typeof person.mark === 'string' ? person.mark.trim() : ''
    if (lengthOf(mark) !== 1) found.add('staff-mark')
    else if (marks.has(mark)) found.add('staff-mark-dup')
    else marks.add(mark)
    if (!isColor(person.color)) found.add('staff-color')
  }
}

const ordered = <P extends CalSettingsProblem>(found: Set<P>): P[] => PROBLEM_ORDER.filter((problem): problem is P => found.has(problem as P))

/** 종류 칸 문제(예약 설정 서랍이 고치는 것은 종류뿐이다, spec clinic-profile AC-6603.4) */
export type CalKindProblem = Extract<CalSettingsProblem, 'kinds-empty' | 'kind-id' | 'kind-name' | 'kind-len' | 'kind-color'>

/** 종류 검사: 문제 목록(없으면 빈 목록, checkCalendarSettings와 같은 차례). 이름은 앞뒤 빈칸을 뺀 값으로 본다 */
export function checkCalendarKinds(kinds: unknown): CalKindProblem[] {
  const found = new Set<CalSettingsProblem>()
  checkKinds(kinds, found)
  return ordered(found as Set<CalKindProblem>)
}

/** 설정 검사: 문제 목록(없으면 빈 목록). 이름·한 글자 표시는 앞뒤 빈칸을 뺀 값으로 본다 */
export function checkCalendarSettings(settings: CalSettings): CalSettingsProblem[] {
  const value: ReadRow = isRecord(settings) ? settings : {}
  const found = new Set<CalSettingsProblem>()
  checkKinds(value.kinds, found)
  checkStaff(value.staff, found)
  if (!isHours(value.openHour, value.closeHour)) found.add('hours')
  if (typeof value.sunday !== 'boolean') found.add('sunday')
  return ordered(found)
}

// 정해 둔 열쇠만 골라 새로 만든다(검사를 지난 값만 넣는다).
// 알아볼 글(words)은 앞뒤 빈칸을 뺀 1~10자 글만 겹치지 않게 열 개까지 — 남는 것이 없거나 목록이 아니면 기본 글(design.md 7-4)
function cleanWords(kind: CalKind): string[] {
  const value: unknown = kind.words
  const words = Array.isArray(value) ? [...new Set(value.flatMap((word) => (typeof word === 'string' && isText(word.trim(), 1, CAL_LABEL_MAX) ? [word.trim()] : [])))] : []
  return words.length > 0 ? words.slice(0, KIND_WORDS_MAX) : defaultKindWords(kind)
}
const cleanKind = (kind: CalKind): CalKind => ({ id: kind.id, name: kind.name.trim(), len: kind.len, color: kind.color, words: cleanWords(kind) })
const cleanStaff = (person: CalStaff): CalStaff => ({ id: person.id, name: person.name.trim(), mark: person.mark.trim(), color: person.color })

function pickKinds(value: unknown): CalKind[] | null {
  const found = new Set<CalSettingsProblem>()
  checkKinds(value, found)
  return found.size === 0 ? (value as CalKind[]).map(cleanKind) : null
}

function pickStaff(value: unknown): CalStaff[] | null {
  const found = new Set<CalSettingsProblem>()
  checkStaff(value, found)
  return found.size === 0 ? (value as CalStaff[]).map(cleanStaff) : null
}

/** 병원 설정. 줄이 없으면 기본값(DEFAULT_CAL_SETTINGS의 새 값). 칸 모양이 틀리면 그 칸만 기본값(보이는 시간은 두 칸 함께) */
export async function loadCalendarSettings(client: Client): Promise<CalSettings> {
  const { data } = await send(() => client.from(SETTINGS).select(SETTINGS_COLUMNS).maybeSingle<ReadRow>())
  const row = isRecord(data) ? data : {}
  const hours = isHours(row.open_hour, row.close_hour)
  return {
    kinds: pickKinds(row.kinds) ?? DEFAULT_CAL_SETTINGS.kinds.map(cleanKind),
    staff: pickStaff(row.staff) ?? [],
    openHour: hours ? (row.open_hour as number) : DEFAULT_CAL_SETTINGS.openHour,
    closeHour: hours ? (row.close_hour as number) : DEFAULT_CAL_SETTINGS.closeHour,
    sunday: typeof row.sunday === 'boolean' ? row.sunday : DEFAULT_CAL_SETTINGS.sunday,
  }
}

/**
 * 종류(kinds) 한 칸만 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id). checkCalendarKinds를 못 지나면 보내지 않고 'invalid'.
 * 시행자·보이는 시간·일요일은 병원 정보에서 온다(spec clinic-profile AC-6603.4) → staff·open_hour·close_hour·sunday 칸은 보내지 않고
 * DB에 남겨 둔다(병원 정보가 없을 때 읽는 값, 되돌리기 쉽게). 받은 설정의 다른 칸(병원 정보와 합친 값)은 보지 않는다
 */
export async function saveCalendarSettings(client: Client, settings: Pick<CalSettings, 'kinds'>): Promise<void | 'invalid'> {
  if (checkCalendarKinds(settings.kinds).length > 0) return 'invalid'
  const row = { kinds: settings.kinds.map(cleanKind) }
  await send(() => client.from(SETTINGS).upsert(row, { onConflict: 'hospital_id' }))
}

// ── 바뀜 숫자 (calendar_rev) ────────────────────────────────

/** 내 병원 바뀜 숫자. 줄이 없으면 0(아직 아무도 안 고침). 0 이상 정수가 아니면 failed */
export async function loadCalendarRev(client: Client): Promise<number> {
  const { data } = await send(() => client.from(REV).select('rev').maybeSingle<ReadRow>())
  if (data === null || data === undefined) return 0
  const rev = isRecord(data) ? data.rev : undefined
  if (!Number.isSafeInteger(rev) || (rev as number) < 0) throw failed()
  return rev as number
}
