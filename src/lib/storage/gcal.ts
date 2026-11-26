import type { SupabaseClient } from '@supabase/supabase-js'
import { isYmd } from '@/lib/analytics/dates'
import { maskPrivate } from '@/lib/storage/maskPrivate'
import {
  DEFAULT_GCAL_LOOK,
  DEFAULT_GCAL_RULES,
  FIX_REASONS,
  G_COLOR_ID,
  G_COLORS,
  GCAL_DEFAULT_HEX,
  type FixGuess,
  type GcalDelete,
  type GcalFix,
  type GcalFixInput,
  type GcalLink,
  type GcalLook,
  type GcalOffDay,
  type GcalOffDayInput,
  type GcalRules,
  type GcalState,
  type GcalView,
  type GColor,
  type OffName,
} from '@/types/gcal'

// 예약 구글 캘린더 연결 저장 (spec google-link REQ-8505 AC-8505.1·AC-8505.3, design.md 7-3·10-3). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 표: 연결 gcal_links · 맞춤 상태 gcal_state · 고쳐야 할 것 gcal_fixes · 지울 것 gcal_deletes · off 날 gcal_off_days, 함수 calendar_off_names()
// (migration 20261126000000_google_link.sql). 병원 하나에 한 줄인 표(연결·상태)는 (hospital_id) 겹침으로 덮어쓴다 — hospital_id는 DB 기본값.
// 보내는 몸통은 정해 둔 열쇠를 골라 새로 만든다({ ...받은 값 } 금지). hospital_id·id·시각 칸(updated_at·created_at)은 보내지 않는다.
// 비밀 글자(gcal_links.secret)는 loadGcalLink만 돌려준다. loadGcalView는 읽되 있는지만 알려 주고, 다른 함수는 그 칸을 읽지 않는다.
// 구글에서 온 글(고쳐야 할 것 제목·알아본 글, off 줄 제목)은 maskPrivate로 전화·주민번호·메일 조각을 가린 뒤 DB 한도로 잘라 보낸다(AC-8505.3).
// 읽은 줄은 모양을 믿지 않는다: 틀린 줄은 빼고, 틀린 설정 칸은 기본값이다. 목록은 1,000줄씩 끝까지 읽는다. 시각은 DB가 준 글자 그대로 돌려준다.
// 연결 쓰기(주소·캘린더·제목 꼴·맞춤 방법)는 틀린 값이면 보내지 않고 'invalid'(화면이 번호를 고른다), 그 밖에 틀린 값은 보내지 않고 failed다.
// 실패는 GcalStorageError(종류만: offline·failed)다. Supabase 문구·입력값·비밀 글자는 담지 않는다

export type GcalErrorKind = 'offline' | 'failed'

/** 오류에는 종류만 담는다 */
export class GcalStorageError extends Error {
  readonly kind: GcalErrorKind

  constructor(kind: GcalErrorKind) {
    super(`gcal storage ${kind}`)
    this.name = 'GcalStorageError'
    this.kind = kind
  }
}

export type GcalClient = Pick<SupabaseClient, 'from' | 'rpc'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다
type Reply = { data?: unknown; error: unknown; status: number }

const LINKS = 'gcal_links'
const STATE = 'gcal_state'
const FIXES = 'gcal_fixes'
const DELETES = 'gcal_deletes'
const OFF_DAYS = 'gcal_off_days'
const OFF_NAMES = 'calendar_off_names'
const LINK_COLUMNS = 'script_url,secret,calendar_id,calendar_name,default_hex,linked_on,rules,look'
const STATE_COLUMNS = 'pulled_until,last_ok_at,fail_since,fail_code,arrival_until,arrival_done'
const FIX_COLUMNS = 'id,g_event_id,day,start_min,len_min,all_day,g_color,g_title,reason,guess,state,g_updated'
const DELETE_COLUMNS = 'g_event_id,day,kind,label'
const OFF_COLUMNS = 'day,g_event_id,g_title,g_updated,wait,wait_at'
const ON_HOSPITAL = { onConflict: 'hospital_id' }
const PAGE_ROWS = 1000
const BATCH = 500
const ASC = { ascending: true }

// DB 제약과 같은 모양·한도(design.md 7-3. 글자 수는 DB char_length처럼 코드포인트로 센다)
const SCRIPT_URL = /^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]{1,253}|macros)\/s\/[A-Za-z0-9_-]{10,200}\/exec$/
const SECRET = /^[A-Za-z0-9_-]{32,128}$/
const HEX = /^#[0-9A-Fa-f]{6}$/
const EVENT_ID = /^[A-Za-z0-9_]{5,300}$/
const ERROR_CODE = /^E-[A-Z0-9-]{1,30}$/
const CHART = /^[0-9]{1,10}$/
// 시각 글자: 구글 RFC3339('2026-11-26T05:31:00.000Z')와 PostgREST timestamptz('2026-11-26 14:31:00.123456+09')
const STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}(:?\d{2})?)$/
const CALENDAR_ID_MAX = 300
const CALENDAR_NAME_MAX = 100
const TITLE_MAX = 200
const ID_MAX = 40 // 종류·시행자 id
const OFF_WORD_MAX = 10
const NO_STAFF_KINDS_MAX = 30
const OFF_NAME_MAX = 20
const GUESS_NAME_MAX = 20
const GUESS_MEMO_MAX = 100
const GUESS_WORD_MAX = 40
const START_MAX = 1435
const LEN_MAX = 1440
const PULL_MINUTES: readonly number[] = [1, 2, 5]
const KIND_HOWS = ['title', 'color', 'setting'] as const
const STAFF_HOWS = ['title', 'color'] as const
const FIX_STATES = ['open', 'skip'] as const
const DELETE_KINDS = ['appt', 'memo'] as const

const failed = () => new GcalStorageError('failed')

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new GcalStorageError('offline')
}

// postgrest-js는 연결 실패를 던지지 않고 status 0으로 돌려준다(응답 없음 = offline).
// 그래도 던져지면 원문이 화면으로 새지 않게 failed로 바꾼다 (calendar.ts와 같은 모양)
async function send<R extends Reply>(request: () => PromiseLike<R>): Promise<R> {
  failIfOffline()
  let reply: R
  try {
    reply = await request()
  } catch {
    throw failed()
  }
  if (reply.error) throw new GcalStorageError(reply.status === 0 ? 'offline' : 'failed')
  return reply
}

/** 1,000줄씩 끝까지 읽는다. 쪽 하나라도 실패하거나 목록이 아니면 반쪽 목록 대신 failed */
async function readPages(page: (first: number, last: number) => PromiseLike<Reply>): Promise<unknown[]> {
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
const cut = (text: string, max: number) => [...text].slice(0, max).join('')
const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && lengthOf(value) >= min && lengthOf(value) <= max
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const isStamp = (value: unknown): value is string => typeof value === 'string' && STAMP.test(value)
const isWhole = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
const isOneOf = <T>(list: readonly T[], value: unknown): value is T => (list as readonly unknown[]).includes(value)
const isColor = (value: unknown): value is GColor => isOneOf(G_COLORS, value)
const isEventId = (value: unknown): value is string => typeof value === 'string' && EVENT_ID.test(value)
const isId = (value: unknown): value is string => isText(value, 1, ID_MAX)

const COLOR_BY_ID = new Map<string, GColor>(G_COLORS.map((color) => [G_COLOR_ID[color], color]))
const colorOfId = (value: unknown): GColor | null | undefined =>
  value === null ? null : typeof value === 'string' ? COLOR_BY_ID.get(value) : undefined

function requireId(value: unknown): string {
  if (!isFilled(value)) throw failed()
  return value
}

function requireDay(value: unknown): string {
  if (!isDay(value)) throw failed()
  return value
}

function requireStamp(value: unknown): string {
  if (!isStamp(value)) throw failed()
  return value
}

/** 구글에서 온 글: 개인정보 모양 조각을 가리고 한도로 자른다(자른 끝에 새 모양이 생기지 않게 한 번 더 가린다) */
function maskedText(text: string, max: number): string {
  return maskPrivate(cut(maskPrivate(text), max))
}

// ── 제목 꼴·맞춤 방법 모양 ──────────────────────────────────

type Picker<T> = (value: unknown) => T | undefined

const LOOK_FIELDS: { [K in keyof GcalLook]: Picker<GcalLook[K]> } = {
  cancel: (value) => (isColor(value) ? value : undefined),
  change: (value) => (isColor(value) ? value : undefined),
  offWord: (value) => {
    const word = typeof value === 'string' ? value.trim() : ''
    return isText(word, 1, OFF_WORD_MAX) ? word : undefined
  },
  offColor: (value) => (isColor(value) ? value : undefined),
  noKind: (value) => (value === 'fix' || isId(value) ? value : undefined),
  staffByColor: (value) => (typeof value === 'boolean' ? value : undefined),
  noStaffKinds: (value) =>
    Array.isArray(value) && value.length <= NO_STAFF_KINDS_MAX && value.every(isId) ? [...new Set(value as string[])] : undefined,
  titleLen: (value) => (typeof value === 'boolean' ? value : undefined),
  titleMemo: (value) => (typeof value === 'boolean' ? value : undefined),
}

const RULE_FIELDS: { [K in keyof GcalRules]: Picker<GcalRules[K]> } = {
  pullMin: (value) => (isOneOf(PULL_MINUTES, value) ? (value as GcalRules['pullMin']) : undefined),
  onGoogleDelete: (value) => (value === 'cancel' || value === 'delete' ? value : undefined),
  arrival: (value) => (value === 'off' || value === 'title' ? value : undefined),
  offAllStaff: (value) => (typeof value === 'boolean' ? value : undefined),
}

/** 칸마다 골라 새로 만든다. strict면 하나라도 틀리면 null, 아니면 틀린 칸은 기본값 */
function pickFields<T extends object>(fields: { [K in keyof T]: Picker<T[K]> }, defaults: Readonly<T>, value: unknown, strict: boolean): T | null {
  if (strict && !isRecord(value)) return null
  const source = isRecord(value) ? value : {}
  const out = {} as T
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const picked = fields[key](source[key as string])
    if (picked === undefined && strict) return null
    out[key] = picked ?? structuredClone(defaults[key])
  }
  return out
}

/** 제목 꼴(gcal_links.look) 검사 — 맞으면 정해 둔 아홉 칸만 새로 만든 값, 틀리면 null */
export function checkGcalLook(value: unknown): GcalLook | null {
  return pickFields(LOOK_FIELDS, DEFAULT_GCAL_LOOK, value, true)
}

/** 맞춤 방법(gcal_links.rules) 검사 — 맞으면 정해 둔 네 칸만 새로 만든 값, 틀리면 null */
export function checkGcalRules(value: unknown): GcalRules | null {
  return pickFields(RULE_FIELDS, DEFAULT_GCAL_RULES, value, true)
}

const readLook = (value: unknown) => pickFields(LOOK_FIELDS, DEFAULT_GCAL_LOOK, value, false) as GcalLook
const readRules = (value: unknown) => pickFields(RULE_FIELDS, DEFAULT_GCAL_RULES, value, false) as GcalRules

// ── 연결 (gcal_links) ───────────────────────────────────────

const isScriptUrl = (value: unknown): value is string => typeof value === 'string' && SCRIPT_URL.test(value)
const isSecret = (value: unknown): value is string => typeof value === 'string' && SECRET.test(value)

/** 비밀 글자 밖의 칸. 틀린 칸은 없음·기본값 */
function viewOf(row: ReadRow): Omit<GcalView, 'hasSecret'> {
  const { script_url: scriptUrl, calendar_id: calendarId, calendar_name: calendarName, default_hex: defaultHex, linked_on: linkedOn } = row
  return {
    scriptUrl: isScriptUrl(scriptUrl) ? scriptUrl : '',
    calendarId: isText(calendarId, 1, CALENDAR_ID_MAX) ? calendarId : null,
    calendarName: isText(calendarName, 0, CALENDAR_NAME_MAX) ? calendarName : null,
    defaultHex: typeof defaultHex === 'string' && HEX.test(defaultHex) ? defaultHex : GCAL_DEFAULT_HEX,
    linkedOn: isDay(linkedOn) ? linkedOn : null,
    rules: readRules(row.rules),
    look: readLook(row.look),
  }
}

async function readLinkRow(client: GcalClient): Promise<ReadRow | null> {
  const { data } = await send(() => client.from(LINKS).select(LINK_COLUMNS).maybeSingle<ReadRow>())
  return isRecord(data) ? data : null
}

/** 연결과 비밀 글자(lib/gcal만 부른다). 줄이 없거나 주소·비밀 글자가 쓸 수 없는 모양이면 null */
export async function loadGcalLink(client: GcalClient): Promise<GcalLink | null> {
  const row = await readLinkRow(client)
  if (row === null || !isScriptUrl(row.script_url) || !isSecret(row.secret)) return null
  return { ...viewOf(row), scriptUrl: row.script_url, secret: row.secret }
}

/** 화면이 보는 연결 — 비밀 글자는 돌려주지 않고 쓸 수 있는 모양으로 있는지만. 주소가 틀리면 빈 글, 줄이 없으면 null */
export async function loadGcalView(client: GcalClient): Promise<GcalView | null> {
  const row = await readLinkRow(client)
  if (row === null) return null
  return { ...viewOf(row), hasSecret: isSecret(row.secret) }
}

async function upsertLink(client: GcalClient, body: ReadRow): Promise<void> {
  await send(() => client.from(LINKS).upsert(body, ON_HOSPITAL))
}

/** 구글 코드 주소·비밀 글자 두 칸. 주소가 웹 앱 주소 꼴(회사 계정 꼴 포함)이 아니거나 비밀 글자 모양이 틀리면 보내지 않고 'invalid' */
export async function saveGcalConnection(client: GcalClient, input: { scriptUrl: string; secret: string }): Promise<void | 'invalid'> {
  const { scriptUrl, secret } = input ?? {}
  if (!isScriptUrl(scriptUrl) || !isSecret(secret)) return 'invalid'
  await upsertLink(client, { script_url: scriptUrl, secret })
}

/** 고른 캘린더 id·이름(100자까지 자름)·기본 색 세 칸. id·색 모양이 틀리면 보내지 않고 'invalid' */
export async function saveGcalCalendar(
  client: GcalClient,
  input: { calendarId: string; calendarName: string; defaultHex: string },
): Promise<void | 'invalid'> {
  const { calendarId, calendarName, defaultHex } = input ?? {}
  if (!isText(calendarId, 1, CALENDAR_ID_MAX) || typeof calendarName !== 'string' || typeof defaultHex !== 'string' || !HEX.test(defaultHex)) {
    return 'invalid'
  }
  await upsertLink(client, { calendar_id: calendarId, calendar_name: cut(calendarName, CALENDAR_NAME_MAX), default_hex: defaultHex })
}

/** 제목 꼴 한 칸. checkGcalLook을 못 지나면 보내지 않고 'invalid' */
export async function saveGcalLook(client: GcalClient, look: GcalLook): Promise<void | 'invalid'> {
  const checked = checkGcalLook(look)
  if (checked === null) return 'invalid'
  await upsertLink(client, { look: checked })
}

/** 맞춤 방법 한 칸. checkGcalRules를 못 지나면 보내지 않고 'invalid' */
export async function saveGcalRules(client: GcalClient, rules: GcalRules): Promise<void | 'invalid'> {
  const checked = checkGcalRules(rules)
  if (checked === null) return 'invalid'
  await upsertLink(client, { rules: checked })
}

/** 이은 날(맞춤 시작 0시, 처음 가져오기 끝) */
export async function setLinkedOn(client: GcalClient, day: string): Promise<void> {
  await upsertLink(client, { linked_on: requireDay(day) })
}

/** 잇기 끊기: 캘린더 id·이은 날만 비운다. 예약·일정·주소·비밀 글자는 그대로(AC-8531.3) */
export async function unlinkGcal(client: GcalClient): Promise<void> {
  await upsertLink(client, { calendar_id: null, linked_on: null })
}

// ── 맞춤 상태 (gcal_state) ──────────────────────────────────

const stampOrNull = (value: unknown) => (isStamp(value) ? value : null)

/** 맞춤 상태. 줄이 없거나 칸이 틀리면 빈 상태. 시각은 DB 글자 그대로 */
export async function loadGcalState(client: GcalClient): Promise<GcalState> {
  const { data } = await send(() => client.from(STATE).select(STATE_COLUMNS).maybeSingle<ReadRow>())
  const row = isRecord(data) ? data : {}
  return {
    pulledUntil: stampOrNull(row.pulled_until),
    lastOkAt: stampOrNull(row.last_ok_at),
    failSince: stampOrNull(row.fail_since),
    failCode: typeof row.fail_code === 'string' && ERROR_CODE.test(row.fail_code) ? row.fail_code : null,
    arrivalUntil: isDay(row.arrival_until) ? row.arrival_until : null,
    arrivalDone: row.arrival_done === true,
  }
}

async function upsertState(client: GcalClient, body: ReadRow): Promise<void> {
  await send(() => client.from(STATE).upsert(body, ON_HOSPITAL))
}

/** 어디까지 받았나. 뒤로 가지 않게는 DB 트리거(greatest)가 막는다 — 두 PC가 함께 적어도 앞으로만 */
export async function advancePulled(client: GcalClient, at: string): Promise<void> {
  await upsertState(client, { pulled_until: requireStamp(at) })
}

/** 실패 번호를 적고, 실패 시작은 비어 있을 때만 적는다(처음 실패 때가 남게). at이 없으면 지금 */
export async function markGcalFail(client: GcalClient, code: string, at: string = new Date().toISOString()): Promise<void> {
  if (typeof code !== 'string' || !ERROR_CODE.test(code)) throw failed()
  const since = requireStamp(at)
  await upsertState(client, { fail_code: code })
  await send(() => client.from(STATE).update({ fail_since: since }).is('fail_since', null))
}

/** 맞춤이 됐다: 마지막 맞춤 시각, 실패 비움 */
export async function markGcalOk(client: GcalClient, at: string): Promise<void> {
  await upsertState(client, { last_ok_at: requireStamp(at), fail_since: null, fail_code: null })
}

/** 지난 예약 도착을 어디까지 채웠나 · 다 채웠나(design.md 12-4) */
export async function setArrivalProgress(client: GcalClient, until: string, done: boolean): Promise<void> {
  const day = requireDay(until)
  if (typeof done !== 'boolean') throw failed()
  await upsertState(client, { arrival_until: day, arrival_done: done })
}

// ── 고쳐야 할 것 (gcal_fixes) ───────────────────────────────

const EMPTY_GUESS: FixGuess = { chart: null, name: null, kindId: null, kindHow: null, staffId: null, staffHow: null, memo: null, word: null }

/** 읽은 guess — 칸마다 확인, 틀린 칸은 null */
function readGuess(value: unknown): FixGuess {
  if (!isRecord(value)) return { ...EMPTY_GUESS }
  const { chart, name, kindId, kindHow, staffId, staffHow, memo, word } = value
  return {
    chart: typeof chart === 'string' && CHART.test(chart) ? chart : null,
    name: isText(name, 1, GUESS_NAME_MAX) ? name : null,
    kindId: isId(kindId) ? kindId : null,
    kindHow: isOneOf(KIND_HOWS, kindHow) ? kindHow : null,
    staffId: isId(staffId) ? staffId : null,
    staffHow: isOneOf(STAFF_HOWS, staffHow) ? staffHow : null,
    memo: isText(memo, 1, GUESS_MEMO_MAX) ? memo : null,
    word: isText(word, 1, GUESS_WORD_MAX) ? word : null,
  }
}

function toFix(row: unknown): GcalFix | null {
  if (!isRecord(row)) return null
  const { id, g_event_id: gEventId, day, start_min: start, len_min: len, all_day: allDay, g_title: gTitle, reason, state, g_updated: gUpdated } = row
  const gColor = colorOfId(row.g_color)
  if (
    !isFilled(id) ||
    !isEventId(gEventId) ||
    !isDay(day) ||
    !isWhole(start, 0, START_MAX) ||
    !isWhole(len, 1, LEN_MAX) ||
    typeof allDay !== 'boolean' ||
    gColor === undefined ||
    !isText(gTitle, 0, TITLE_MAX) ||
    !isOneOf(FIX_REASONS, reason) ||
    !isOneOf(FIX_STATES, state) ||
    !isStamp(gUpdated)
  ) {
    return null
  }
  return { id, gEventId, day, start, len, allDay, gColor, gTitle, reason, guess: readGuess(row.guess), state, gUpdated }
}

/** 고쳐야 할 구글 예약. state를 주면 그 상태만. 날·시작 차례, 틀린 줄은 뺀다 */
export async function listGcalFixes(client: GcalClient, state?: GcalFix['state']): Promise<GcalFix[]> {
  if (state !== undefined && !isOneOf(FIX_STATES, state)) throw failed()
  const rows = await readPages((first, last) => {
    const query = client.from(FIXES).select(FIX_COLUMNS)
    const filtered = state === undefined ? query : query.eq('state', state)
    return filtered.order('day', ASC).order('start_min', ASC).order('id', ASC).range(first, last)
  })
  return rows.flatMap((row) => toFix(row) ?? [])
}

/** 보낼 글 칸: 글자이거나 null(빈 글도 null). 가리고 자른다. 그 밖은 failed */
function sentText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw failed()
  const text = maskedText(value.trim(), max)
  return text === '' ? null : text
}

function sentId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (!isId(value)) throw failed()
  return value
}

function sentHow<T>(list: readonly T[], value: unknown): T | null {
  if (value === null || value === undefined) return null
  if (!isOneOf(list, value)) throw failed()
  return value
}

/** 보낼 guess — 정해 둔 여덟 칸만, 구글에서 온 글(이름·메모·고를 거리·차트번호)은 가린다. 가린 차트번호는 차트번호 모양이 아니라 null */
function sentGuess(value: unknown): FixGuess {
  if (!isRecord(value)) throw failed()
  const chart = sentText(value.chart, 10)
  return {
    chart: chart !== null && CHART.test(chart) ? chart : null,
    name: sentText(value.name, GUESS_NAME_MAX),
    kindId: sentId(value.kindId),
    kindHow: sentHow(KIND_HOWS, value.kindHow),
    staffId: sentId(value.staffId),
    staffHow: sentHow(STAFF_HOWS, value.staffHow),
    memo: sentText(value.memo, GUESS_MEMO_MAX),
    word: sentText(value.word, GUESS_WORD_MAX),
  }
}

function fixBody(fix: GcalFixInput): ReadRow {
  if (!isRecord(fix)) throw failed()
  const { gEventId, day, start, len, allDay, gColor, gTitle, reason, state, gUpdated } = fix
  if (
    !isEventId(gEventId) ||
    !isDay(day) ||
    !isWhole(start, 0, START_MAX) ||
    !isWhole(len, 1, LEN_MAX) ||
    typeof allDay !== 'boolean' ||
    !(gColor === null || isColor(gColor)) ||
    typeof gTitle !== 'string' ||
    !isOneOf(FIX_REASONS, reason) ||
    !isOneOf(FIX_STATES, state) ||
    !isStamp(gUpdated)
  ) {
    throw failed()
  }
  return {
    g_event_id: gEventId,
    day,
    start_min: start,
    len_min: len,
    all_day: allDay,
    g_color: gColor === null ? null : G_COLOR_ID[gColor],
    g_title: maskedText(gTitle, TITLE_MAX),
    reason,
    guess: sentGuess(fix.guess),
    state,
    g_updated: gUpdated,
  }
}

/** 고쳐야 할 것을 (병원, 일정 id, 날) 겹침으로 넣거나 고친다(500줄씩). 틀린 줄이 하나라도 있으면 하나도 보내지 않고 failed */
export async function upsertGcalFixes(client: GcalClient, fixes: readonly GcalFixInput[]): Promise<void> {
  if (!Array.isArray(fixes)) throw failed()
  const rows = fixes.map(fixBody)
  for (let at = 0; at < rows.length; at += BATCH) {
    const batch = rows.slice(at, at + BATCH)
    await send(() => client.from(FIXES).upsert(batch, { onConflict: 'hospital_id,g_event_id,day' }))
  }
}

/** 고쳐야 할 것 하나의 상태(가져오지 않기 = 'skip') */
export async function setFixState(client: GcalClient, id: string, state: GcalFix['state']): Promise<void> {
  const target = requireId(id)
  if (!isOneOf(FIX_STATES, state)) throw failed()
  await send(() => client.from(FIXES).update({ state }).eq('id', target))
}

/** 고쳐야 할 것 하나 지우기(예약표에 넣은 뒤). id가 비면 보내지 않는다(조건 없는 지우기를 보내지 않으려고) */
export async function deleteGcalFix(client: GcalClient, id: string): Promise<void> {
  const target = requireId(id)
  await send(() => client.from(FIXES).delete().eq('id', target))
}

// ── 지움 줄 (gcal_deletes) ──────────────────────────────────

function toDelete(row: unknown): GcalDelete | null {
  if (!isRecord(row)) return null
  const { g_event_id: gEventId, day, kind, label } = row
  if (!isEventId(gEventId) || !isDay(day) || !isOneOf(DELETE_KINDS, kind) || !(label === null || isText(label, 0, TITLE_MAX))) return null
  return { gEventId, day, kind, label }
}

/** 구글에서 지울 것(트리거가 넣은 차례). 틀린 줄은 뺀다 */
export async function listGcalDeletes(client: GcalClient): Promise<GcalDelete[]> {
  const rows = await readPages((first, last) =>
    client.from(DELETES).select(DELETE_COLUMNS).order('created_at', ASC).order('g_event_id', ASC).order('day', ASC).range(first, last),
  )
  return rows.flatMap((row) => toDelete(row) ?? [])
}

/** 보냈거나 버릴 지움 줄 하나((일정 id, 날)) */
export async function dropGcalDelete(client: GcalClient, gEventId: string, day: string): Promise<void> {
  if (!isEventId(gEventId)) throw failed()
  const target = requireDay(day)
  await send(() => client.from(DELETES).delete().eq('g_event_id', gEventId).eq('day', target))
}

// ── off 날 (gcal_off_days) ─────────────────────────────────

function toOffDay(row: unknown): GcalOffDay | null {
  if (!isRecord(row)) return null
  const { day, g_event_id: gEventId, g_title: gTitle, g_updated: gUpdated, wait, wait_at: waitAt } = row
  if (
    !isDay(day) ||
    !(gEventId === null || isEventId(gEventId)) ||
    !(gTitle === null || isText(gTitle, 0, TITLE_MAX)) ||
    !(gUpdated === null || isStamp(gUpdated)) ||
    typeof wait !== 'boolean' ||
    !(waitAt === null || isStamp(waitAt))
  ) {
    return null
  }
  return { day, gEventId, gTitle, gUpdated, wait, waitAt }
}

/** from~to(둘 다 포함) 그날 off 줄 짝, 날 차례 */
export async function listOffDays(client: GcalClient, from: string, to: string): Promise<GcalOffDay[]> {
  const start = requireDay(from)
  const end = requireDay(to)
  if (start > end) throw failed()
  const rows = await readPages((first, last) =>
    client.from(OFF_DAYS).select(OFF_COLUMNS).gte('day', start).lte('day', end).order('day', ASC).range(first, last),
  )
  return rows.flatMap((row) => toOffDay(row) ?? [])
}

/** 구글로 보낼 off 날(wait 참), 기다린 차례 */
export async function listWaitingOffDays(client: GcalClient): Promise<GcalOffDay[]> {
  const rows = await readPages((first, last) =>
    client.from(OFF_DAYS).select(OFF_COLUMNS).eq('wait', true).order('wait_at', ASC).order('day', ASC).range(first, last),
  )
  return rows.flatMap((row) => toOffDay(row) ?? [])
}

function offBody(off: GcalOffDayInput): { day: string; body: ReadRow } {
  if (!isRecord(off)) throw failed()
  const { day, gEventId, gTitle, gUpdated, wait } = off
  if (
    !isDay(day) ||
    !(gEventId === null || isEventId(gEventId)) ||
    !(gTitle === null || typeof gTitle === 'string') ||
    !(gUpdated === null || isStamp(gUpdated)) ||
    typeof wait !== 'boolean'
  ) {
    throw failed()
  }
  return { day, body: { g_event_id: gEventId, g_title: gTitle === null ? null : maskedText(gTitle, TITLE_MAX), g_updated: gUpdated, wait } }
}

/**
 * 그날 off 줄 짝을 적는다. 제목의 개인정보 모양 조각은 가린다. wait_at(트리거만 적는 때)은 보내지 않는다.
 * expectWaitAt이 없으면 (병원, 날) 겹침으로 넣거나 덮어쓴다. 있으면(보낸 뒤 wait 풀기) 그 시각 그대로인 줄만 고친다 —
 * 그 사이 휴가가 바뀌어 트리거가 다시 적었으면 0줄이라 거짓(다음에 또 보낸다). DB가 준 시각 글자를 그대로 넘긴다
 */
export async function saveOffDay(client: GcalClient, off: GcalOffDayInput, expectWaitAt?: string | null): Promise<boolean> {
  const { day, body } = offBody(off)
  if (expectWaitAt === undefined) {
    await send(() => client.from(OFF_DAYS).upsert({ day, ...body }, { onConflict: 'hospital_id,day' }))
    return true
  }
  if (expectWaitAt !== null && !isStamp(expectWaitAt)) throw failed()
  const { data } = await send(() => {
    const query = client.from(OFF_DAYS).update(body).eq('day', day)
    return (expectWaitAt === null ? query.is('wait_at', null) : query.eq('wait_at', expectWaitAt)).select('day')
  })
  return Array.isArray(data) && data.length > 0
}

// ── off 줄 사람 (calendar_off_names) ───────────────────────

/** off 줄에 오를 사람(원장님·직원, 예약 시행자가 아닌 직원은 'm-' id). 틀린 줄은 빼고, 답이 목록이 아니면 failed */
export async function loadOffNames(client: GcalClient): Promise<OffName[]> {
  const { data } = await send(() => client.rpc(OFF_NAMES))
  if (!Array.isArray(data)) throw failed()
  return data.flatMap((item: unknown) =>
    isRecord(item) && isId(item.id) && isText(item.name, 1, OFF_NAME_MAX) ? [{ id: item.id, name: item.name }] : [],
  )
}
