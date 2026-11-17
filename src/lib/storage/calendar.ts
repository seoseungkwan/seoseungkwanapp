import type { SupabaseClient } from '@supabase/supabase-js'
import { isYmd } from '@/lib/analytics/dates'
import { privacyProblem } from '@/lib/worklog/notes'
import {
  CAL_COLORS,
  DEFAULT_CAL_SETTINGS,
  type ApptAuto,
  type ApptDraft,
  type ApptStatus,
  type CalAllDay,
  type CalAppt,
  type CalColor,
  type CalCountRow,
  type CalKind,
  type CalSettings,
  type CalStaff,
} from '@/types/calendar'

// 예약 탭 서버 저장 (spec clinic-calendar REQ-5901 AC-5901.6, design.md '저장 함수'). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 표: 설정 calendar_settings · 예약 calendar_appts · 종일 calendar_allday · 바뀜 숫자 calendar_rev (migration 20261117010000_calendar.sql).
// 예약 줄의 환자 이름·차트번호는 서버에 둔다(ADR-030). 전화·성별·나이·생일·마지막 내원은 받아도 보내지 않는다:
// 보내는 몸통은 정해 둔 열쇠를 골라 새로 만든다({ ...받은 값 } 금지). hospital_id·id·시각·처음 자리는 DB가 정하고 어느 병원 줄인지는 RLS가 고른다.
// 이름·메모는 앞뒤 빈칸을 빼고 개인정보 모양(전화·주민번호·메일)이면 보내지 않고 'blocked'다. 그 밖에 받은 값이 틀리면 보내지 않고 failed다.
// 읽은 줄은 모양을 믿지 않는다: 틀린 줄은 빼고, 틀린 설정 칸은 기본값이다. 기간 읽기는 1,000줄씩 나눠 모두 읽는다.
// 실패는 CalendarStorageError(종류만: offline·failed)다. Supabase 문구·입력값은 화면까지 가지 않게 넣지 않는다

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

type Client = Pick<SupabaseClient, 'from'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다

const APPTS = 'calendar_appts'
const ALLDAY = 'calendar_allday'
const SETTINGS = 'calendar_settings'
const REV = 'calendar_rev'
const APPT_COLUMNS = 'id,day,start_min,len_min,name,chart,staff_id,staff_name,staff_mark,kind_id,kind_name,memo,status,auto,orig_day,orig_start'
const COUNT_COLUMNS = 'day,staff_id,staff_name,kind_id,kind_name,status,auto,orig_day' // 이름·차트번호·메모 없음
const ALLDAY_COLUMNS = 'id,day,type,memo,staff_id,staff_name'
const SETTINGS_COLUMNS = 'kinds,staff,open_hour,close_hour,sunday'
const PAGE_ROWS = 1000
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
const isStart = (value: unknown): value is number => isStepped(value, 0, 1430, 10)
const isLen = (value: unknown): value is number => isStepped(value, 5, 240, 5)
const isChart = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,10}$/.test(value)
const isStatus = (value: unknown): value is ApptStatus => (STATUSES as readonly unknown[]).includes(value)
const isAuto = (value: unknown): value is ApptAuto => value === null || value === 'came' || value === 'noshow'
const isColor = (value: unknown): value is CalColor => (CAL_COLORS as readonly unknown[]).includes(value)

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
    !isText(staffId, 1, CAL_ID_MAX) ||
    !isText(staffName, 1, CAL_LABEL_MAX) ||
    !isText(staffMark, 1, 1) ||
    !isText(kindId, 1, CAL_ID_MAX) ||
    !isText(kindName, 1, CAL_LABEL_MAX) ||
    !isText(memo, 0, APPT_MEMO_MAX) ||
    !isStatus(status) ||
    !isAuto(auto) ||
    !origOk
  ) {
    return null
  }
  return {
    id,
    day,
    start,
    len,
    name,
    chart: chart as string | null,
    staffId,
    staffName,
    staffMark,
    kindId,
    kindName,
    memo,
    status,
    auto,
    origDay: origDay as string | null,
    origStart: origStart as number | null,
  }
}

function toCount(row: unknown): CalCountRow | null {
  if (!isRecord(row)) return null
  const { day, staff_id: staffId, staff_name: staffName, kind_id: kindId, kind_name: kindName, status, auto, orig_day: origDay } = row
  if (
    !isDay(day) ||
    !isText(staffId, 1, CAL_ID_MAX) ||
    !isText(staffName, 1, CAL_LABEL_MAX) ||
    !isText(kindId, 1, CAL_ID_MAX) ||
    !isText(kindName, 1, CAL_LABEL_MAX) ||
    !isStatus(status) ||
    !isAuto(auto) ||
    !(origDay === null || isDay(origDay))
  ) {
    return null
  }
  return { day, staffId, staffName, kindId, kindName, status, auto, origDay }
}

function savedAppt(data: unknown): CalAppt {
  const appt = toAppt(data)
  if (appt === null) throw failed()
  return appt
}

/**
 * 받은 칸만 골라 DB 칸 이름으로 바꾼다(정해 둔 열두 칸 차례). 이름·메모는 앞뒤 빈칸을 빼고, 빈 차트번호는 null이다.
 * 이름·메모가 개인정보 모양이면 'blocked', 값이 틀리면 failed
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
  put('staff_id', input.staffId, isText(input.staffId, 1, CAL_ID_MAX))
  put('staff_name', input.staffName, isText(input.staffName, 1, CAL_LABEL_MAX))
  put('staff_mark', input.staffMark, isText(input.staffMark, 1, 1))
  put('kind_id', input.kindId, isText(input.kindId, 1, CAL_ID_MAX))
  put('kind_name', input.kindName, isText(input.kindName, 1, CAL_LABEL_MAX))
  put('memo', memo, isText(memo, 0, APPT_MEMO_MAX))
  put('status', input.status, isStatus(input.status))
  return body
}

const APPT_FIELDS = 12

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

/** 예약 한 줄 넣기. DB가 준 줄(새 id, 상태 그대로)을 돌려준다 */
export async function addAppt(client: Client, draft: ApptDraft): Promise<CalAppt | 'blocked'> {
  const body = apptBody(draft)
  if (body === 'blocked') return body
  if (Object.keys(body).length !== APPT_FIELDS) throw failed()
  const { data } = await send(() => client.from(APPTS).insert(body).select(APPT_COLUMNS).single<ReadRow>())
  return savedAppt(data)
}

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

/** 예약 한 줄 지우기. id가 비면 보내지 않는다(조건 없는 지우기를 보내지 않으려고) */
export async function deleteAppt(client: Client, id: string): Promise<void> {
  const target = requireId(id)
  await send(() => client.from(APPTS).delete().eq('id', target))
}

// ── 종일 (calendar_allday) ──────────────────────────────────

function toAllDay(row: unknown): CalAllDay | null {
  if (!isRecord(row)) return null
  const { id, day, type, memo, staff_id: staffId, staff_name: staffName } = row
  if (!isFilled(id) || !isDay(day)) return null
  if (type === 'memo' && isText(memo, 1, ALLDAY_MEMO_MAX) && staffId === null && staffName === null) {
    return { id, day, type, memo, staffId: null, staffName: null }
  }
  if (type === 'off' && memo === null && isText(staffId, 1, CAL_ID_MAX) && isText(staffName, 1, CAL_LABEL_MAX)) {
    return { id, day, type, memo: null, staffId, staffName }
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

/** 종일 한 줄 넣기: 메모(20자, 개인정보 모양이면 'blocked') 또는 시행자 휴무. 다섯 칸을 늘 보낸다(쓰지 않는 칸은 null) */
export async function addAllDay(client: Client, item: Omit<CalAllDay, 'id'>): Promise<CalAllDay | 'blocked'> {
  if (!isDay(item.day)) throw failed()
  let row: Record<string, unknown>
  if (item.type === 'memo') {
    const memo = trimmed(item.memo)
    if (privacyProblem(memo)) return 'blocked'
    if (!isText(memo, 1, ALLDAY_MEMO_MAX)) throw failed()
    row = { day: item.day, type: 'memo', memo, staff_id: null, staff_name: null }
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
  | 'kind-color' // 색 이름 밖(null = 시행자 색 따름은 됨)
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
    if (!(kind.color === null || isColor(kind.color))) found.add('kind-color')
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

const ordered = (found: Set<CalSettingsProblem>) => PROBLEM_ORDER.filter((problem) => found.has(problem))

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

// 정해 둔 열쇠만 골라 새로 만든다(검사를 지난 값만 넣는다)
const cleanKind = (kind: CalKind): CalKind => ({ id: kind.id, name: kind.name.trim(), len: kind.len, color: kind.color })
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

/** 설정 다섯 칸을 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id). checkCalendarSettings를 못 지나면 보내지 않고 'invalid' */
export async function saveCalendarSettings(client: Client, settings: CalSettings): Promise<void | 'invalid'> {
  if (checkCalendarSettings(settings).length > 0) return 'invalid'
  const row = {
    kinds: settings.kinds.map(cleanKind),
    staff: settings.staff.map(cleanStaff),
    open_hour: settings.openHour,
    close_hour: settings.closeHour,
    sunday: settings.sunday,
  }
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
