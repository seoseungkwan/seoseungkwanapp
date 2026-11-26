import type { SupabaseClient } from '@supabase/supabase-js'
import { isYmd } from '@/lib/analytics/dates'
import {
  DEFAULT_GSHEET_SETTINGS,
  GSHEET_FREE_RULES,
  GSHEET_MODES,
  GSHEET_OUTCOMES,
  GSHEET_PINNED_KEYS,
  GSHEET_VIAS,
  type GsheetCols,
  type GsheetMonth,
  type GsheetRun,
  type GsheetRunInput,
  type GsheetSaved,
  type GsheetSettings,
  type GsheetSigns,
} from '@/types/gsheet'

// 수납일지 구글 시트 저장 (spec google-link REQ-8505 AC-8505.2, design.md 7-3·10-3). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 표: 설정 gsheet_settings(conf·secret_tag) · 달 파일 gsheet_months · 넣은 기록 gsheet_runs (migration 20261126000000_google_link.sql).
// 환자 줄은 여기로 오지 않는다(도우미 → 구글로만, ADR-052). 기록은 숫자·참거짓·오류 번호·칸 주소만 보낸다 — 정해 둔 여덟 열쇠 밖이 섞이거나
// 숫자 칸에 글·목록이 있으면 보내지 않고 'invalid'. 설정에 구글 코드 주소·함께 쓸 메일 열쇠(scriptUrl·url·shareWith)가 있으면 보내지 않고 'invalid'
// (그 둘은 넣는 PC 도우미에만 — DB 확인 제약과 같다). 보내는 몸통은 정해 둔 열쇠를 골라 새로 만든다({ ...받은 값 } 금지).
// 읽은 줄은 모양을 믿지 않는다: 틀린 설정 칸은 기본값(비트시트 7판), 틀린 달·기록 줄은 뺀다. 시각은 DB 글자 그대로 돌려준다.
// 실패는 GsheetStorageError(종류만: offline·failed)다. Supabase 문구·입력값은 담지 않는다

export type GsheetErrorKind = 'offline' | 'failed'

/** 오류에는 종류만 담는다 */
export class GsheetStorageError extends Error {
  readonly kind: GsheetErrorKind

  constructor(kind: GsheetErrorKind) {
    super(`gsheet storage ${kind}`)
    this.name = 'GsheetStorageError'
    this.kind = kind
  }
}

type Client = Pick<SupabaseClient, 'from'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다
type Reply = { data?: unknown; error: unknown; status: number }

const SETTINGS = 'gsheet_settings'
const MONTHS = 'gsheet_months'
const RUNS = 'gsheet_runs'
const SETTINGS_COLUMNS = 'conf,secret_tag'
const MONTH_COLUMNS = 'ym,file_id,gids'
const RUN_COLUMNS = 'at,day,via,mode,outcome,code,rows,counts,cells'
const RUN_KEYS = ['day', 'via', 'mode', 'outcome', 'code', 'rows', 'counts', 'cells'] as const
const ON_HOSPITAL = { onConflict: 'hospital_id' }
const PAGE_ROWS = 1000
const ASC = { ascending: true }

// DB 제약과 같은 모양·한도(design.md 7-3)
const CONF_BYTES = 16000
const COUNTS_BYTES = 4000
const COUNTS_KEYS_MAX = 60
const CELLS_MAX = 20
const SECRET_TAG = /^[0-9a-f]{16}$/
const YM = /^[0-9]{4}-(0[1-9]|1[0-2])$/
const FILE_ID = /^[A-Za-z0-9_-]{20,100}$/
const SHEET_DAY = /^(?:[1-9]|[12][0-9]|3[01])$/
const ERROR_CODE = /^E-[A-Z0-9-]{1,30}$/
const CELL = /^[^!]{1,31}![A-Z]{1,3}[0-9]{1,4}$/
const COUNT_KEY = /^[A-Za-z][A-Za-z0-9]{0,39}$/ // 답 숫자 칸 이름(rows·added…) — 이름·차트번호 같은 글은 열쇠로도 못 온다
const STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}(:?\d{2})?)$/
// 설정 칸 한도(시트 칸 글자 A~ZZZ, 시각 HH:mm 00:00~24:00). 뜻(칸이 겹치는지 등)은 lib/gsheet/check(TASK-8)가 본다
const LETTERS = /^[A-Za-z]{0,3}$/
const CLOCK = /^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/
const PINNED = new Set<string>(GSHEET_PINNED_KEYS)

const failed = () => new GsheetStorageError('failed')

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new GsheetStorageError('offline')
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
  if (reply.error) throw new GsheetStorageError(reply.status === 0 ? 'offline' : 'failed')
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
const lengthOf = (text: string) => [...text].length
const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && lengthOf(value) >= min && lengthOf(value) <= max
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const isStamp = (value: unknown): value is string => typeof value === 'string' && STAMP.test(value)
const isWhole = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
const isOneOf = <T>(list: readonly T[], value: unknown): value is T => (list as readonly unknown[]).includes(value)
const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

// ── 설정 모양 ───────────────────────────────────────────────

// strict(저장): 틀리면 undefined → 저장하지 않음. 아니면(읽기) 묶음 칸은 안 칸마다 기본값, 목록·짝 칸은 맞는 것만 남긴다
type Picker<T> = (value: unknown, strict: boolean) => T | undefined

const text =
  (min: number, max: number): Picker<string> =>
  (value) =>
    isText(value, min, max) ? value : undefined
const letters: Picker<string> = (value) => (typeof value === 'string' && LETTERS.test(value) ? value : undefined)
const whole =
  (min: number, max: number): Picker<number> =>
  (value) =>
    isWhole(value, min, max) ? value : undefined
const flag: Picker<boolean> = (value) => (typeof value === 'boolean' ? value : undefined)
const clock: Picker<string> = (value) => (typeof value === 'string' && CLOCK.test(value) ? value : undefined)
const list =
  <T>(item: Picker<T>, max: number): Picker<T[]> =>
  (value, strict) => {
    if (!Array.isArray(value) || value.length > max) return undefined
    const items = value.map((one) => item(one, strict))
    return items.every((one) => one !== undefined) ? (items as T[]) : undefined
  }
const group =
  <T extends object>(fields: { [K in keyof T]: Picker<T[K]> }, defaults: Readonly<T>): Picker<T> =>
  (value, strict) =>
    pickFields(fields, defaults, value, strict) ?? undefined

// 진료과 코드 → 진료실 번호(비트시트 RoomPlan, 1~99). 읽을 때는 맞는 짝만 남긴다
const ROOMS_MAX = 300
const rooms: Picker<Record<string, number>> = (value, strict) => {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
  const good = entries.filter(([code, room]) => isText(code, 1, 40) && isWhole(room, 1, 99))
  if (strict && (good.length !== entries.length || entries.length > ROOMS_MAX)) return undefined
  return Object.fromEntries(good.slice(0, ROOMS_MAX)) as Record<string, number>
}

const COL_FIELDS: { [K in keyof GsheetCols]: Picker<string> } = {
  key: letters,
  name: letters,
  sign: letters,
  amount: letters,
  room: letters,
  first: letters,
  day90: letters,
  block: letters,
  therapy: letters,
  note: letters,
}
const sign = whole(0, 999)
const SIGN_FIELDS: { [K in keyof GsheetSigns]: Picker<number> } = {
  cash: sign,
  card: sign,
  recvCash: sign,
  recvCard: sign,
  transfer: sign,
  recvTransfer: sign,
  free: sign,
}
const insurance = list(whole(0, 9999), 50)
const kinds = list(text(1, 20), 50)
const codes = list(text(1, 40), 1000)
const url = text(0, 1000)

const SETTING_FIELDS: { [K in keyof GsheetSettings]: Picker<GsheetSettings[K]> } = {
  templateUrl: url,
  namePattern: text(1, 200),
  hospitalLabel: text(0, 100),
  folderUrl: url,
  firstRow: whole(1, 100000),
  lastRow: whole(1, 100000),
  cols: group(COL_FIELDS, DEFAULT_GSHEET_SETTINGS.cols),
  markValue: text(0, 20),
  signs: group(SIGN_FIELDS, DEFAULT_GSHEET_SETTINGS.signs),
  shiftCols: text(0, 20),
  staffCols: list((value) => (typeof value === 'string' && /^[A-Za-z]{1,3}$/.test(value) ? value : undefined), 26),
  bitHospital: text(0, 40),
  deptRooms: rooms,
  deptRoomsHospital: text(0, 40),
  firstKinds: kinds,
  day90Kinds: kinds,
  blockCodes: codes,
  therapyCodes: codes,
  free: (value) => (isOneOf(GSHEET_FREE_RULES, value) ? value : undefined),
  freeInsurance: insurance,
  carInsurance: insurance,
  aidInsurance: insurance,
  noteCar: flag,
  noteAid: flag,
  autoOn: flag,
  everyMin: whole(1, 240),
  from: clock,
  to: clock,
  eveningOn: flag,
  evening: clock,
}

/** 칸마다 골라 새로 만든다. strict면 하나라도 틀리면 null, 아니면 틀린 칸은 기본값(새 값) */
function pickFields<T extends object>(fields: { [K in keyof T]: Picker<T[K]> }, defaults: Readonly<T>, value: unknown, strict: boolean): T | null {
  if (strict && !isRecord(value)) return null
  const source = isRecord(value) ? value : {}
  const out = {} as T
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const picked = fields[key](source[key as string], strict)
    if (picked === undefined && strict) return null
    out[key] = picked ?? structuredClone(defaults[key])
  }
  return out
}

/** 저장할 설정 — 맞으면 정해 둔 서른 칸만 새로 만든 값, 틀리면 null */
function checkedSettings(value: unknown): GsheetSettings | null {
  const settings = pickFields(SETTING_FIELDS, DEFAULT_GSHEET_SETTINGS, value, true)
  if (settings === null || settings.firstRow > settings.lastRow || bytesOf(settings) > CONF_BYTES) return null
  return settings
}

/** 읽은 설정 — 틀린 칸은 기본값. 처음 줄이 끝 줄보다 뒤면 두 칸 모두 기본값 */
function readSettings(value: unknown): GsheetSettings {
  const settings = pickFields(SETTING_FIELDS, DEFAULT_GSHEET_SETTINGS, value, false) as GsheetSettings
  if (settings.firstRow > settings.lastRow) {
    settings.firstRow = DEFAULT_GSHEET_SETTINGS.firstRow
    settings.lastRow = DEFAULT_GSHEET_SETTINGS.lastRow
  }
  return settings
}

/** 코드 주소·함께 쓸 메일 열쇠가 어디든(안쪽 묶음까지) 들어 있나 */
function hasPinnedKey(value: unknown, depth = 0): boolean {
  if (typeof value !== 'object' || value === null || depth > 4) return false
  if (Array.isArray(value)) return value.some((item) => hasPinnedKey(item, depth + 1))
  return Object.keys(value).some((key) => PINNED.has(key) || hasPinnedKey((value as ReadRow)[key], depth + 1))
}

// ── 설정 (gsheet_settings) ──────────────────────────────────

/** 저장한 설정과 넣는 PC 비밀 글자 지문. 줄이 없으면 기본값(비트시트 7판, 코드 주소·메일 없음)과 null, 틀린 칸은 기본값 */
export async function loadGsheetSettings(client: Client): Promise<GsheetSaved> {
  const { data } = await send(() => client.from(SETTINGS).select(SETTINGS_COLUMNS).maybeSingle<ReadRow>())
  const row = isRecord(data) ? data : {}
  const tag = row.secret_tag
  return { settings: readSettings(row.conf), secretTag: typeof tag === 'string' && SECRET_TAG.test(tag) ? tag : null }
}

/**
 * 설정 한 칸(conf)을 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id). 정해 둔 열쇠로 새로 만들어 보낸다(모르는 열쇠는 버림).
 * 코드 주소·함께 쓸 메일 열쇠(scriptUrl·url·shareWith)가 있거나, 칸 모양이 틀리거나, 16,000바이트를 넘으면 보내지 않고 'invalid'
 */
export async function saveGsheetSettings(client: Client, settings: GsheetSettings): Promise<void | 'invalid'> {
  if (hasPinnedKey(settings)) return 'invalid'
  const conf = checkedSettings(settings)
  if (conf === null) return 'invalid'
  await send(() => client.from(SETTINGS).upsert({ conf }, ON_HOSPITAL))
}

/** 넣는 PC 비밀 글자 지문(SHA-256 16진수 앞 16자) 한 칸. null이면 비운다. 모양이 틀리면 보내지 않고 failed */
export async function setSecretTag(client: Client, tag: string | null): Promise<void> {
  if (tag !== null && (typeof tag !== 'string' || !SECRET_TAG.test(tag))) throw failed()
  await send(() => client.from(SETTINGS).upsert({ secret_tag: tag }, ON_HOSPITAL))
}

// ── 달 파일 (gsheet_months) ─────────────────────────────────

const isGid = (value: unknown): value is number => isWhole(value, 0, Number.MAX_SAFE_INTEGER)

function toMonth(row: unknown): GsheetMonth | null {
  if (!isRecord(row)) return null
  const { ym, file_id: fileId, gids } = row
  if (typeof ym !== 'string' || !YM.test(ym) || typeof fileId !== 'string' || !FILE_ID.test(fileId)) return null
  const good = isRecord(gids) ? Object.entries(gids).filter(([day, gid]) => SHEET_DAY.test(day) && isGid(gid)) : []
  return { ym, fileId, gids: Object.fromEntries(good) as Record<string, number> }
}

/** 달 파일 목록, 달 차례. 틀린 줄은 빼고 틀린 gid는 버린다 */
export async function listGsheetMonths(client: Client): Promise<GsheetMonth[]> {
  const rows = await readPages((first, last) => client.from(MONTHS).select(MONTH_COLUMNS).order('ym', ASC).range(first, last))
  return rows.flatMap((row) => toMonth(row) ?? [])
}

function monthBody(month: GsheetMonth, seenAt: string): ReadRow {
  if (!isRecord(month)) throw failed()
  const { ym, fileId, gids } = month
  if (typeof ym !== 'string' || !YM.test(ym) || typeof fileId !== 'string' || !FILE_ID.test(fileId) || !isRecord(gids)) throw failed()
  const entries = Object.entries(gids)
  if (entries.length > 31 || !entries.every(([day, gid]) => SHEET_DAY.test(day) && isGid(gid))) throw failed()
  return { ym, file_id: fileId, gids: Object.fromEntries(entries), seen_at: seenAt }
}

/** 달 파일을 (병원, 달) 겹침으로 넣거나 고친다. 본 때 = 지금. 틀린 달이 하나라도 있으면 하나도 보내지 않고 failed */
export async function upsertGsheetMonths(client: Client, months: readonly GsheetMonth[]): Promise<void> {
  if (!Array.isArray(months)) throw failed()
  const seenAt = new Date().toISOString()
  const rows = months.map((month) => monthBody(month, seenAt))
  if (rows.length === 0) return
  await send(() => client.from(MONTHS).upsert(rows, { onConflict: 'hospital_id,ym' }))
}

// ── 넣은 기록 (gsheet_runs) ─────────────────────────────────

/** 결과 숫자 칸: 값이 모두 숫자·참거짓이고 열쇠는 칸 이름 꼴. 맞으면 새로 만든 값, 아니면 null */
function cleanCounts(value: unknown): Record<string, number | boolean> | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (entries.length > COUNTS_KEYS_MAX) return null
  const good = entries.every(([key, count]) => COUNT_KEY.test(key) && (typeof count === 'boolean' || (typeof count === 'number' && Number.isFinite(count))))
  if (!good) return null
  const counts = Object.fromEntries(entries) as Record<string, number | boolean>
  return bytesOf(counts) <= COUNTS_BYTES ? counts : null
}

function cleanCells(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > CELLS_MAX) return null
  return value.every((cell) => typeof cell === 'string' && CELL.test(cell)) ? [...(value as string[])] : null
}

const isCode = (value: unknown): value is string | null => value === null || (typeof value === 'string' && ERROR_CODE.test(value))

/** 기록 몸통 — 정해 둔 여덟 열쇠가 다 있고 그 밖이 없을 때만 */
function runBody(run: unknown): GsheetRunInput | null {
  if (!isRecord(run)) return null
  const keys = Object.keys(run)
  if (keys.length !== RUN_KEYS.length || !keys.every((key) => isOneOf(RUN_KEYS, key))) return null
  const { day, via, mode, outcome, code, rows } = run
  const counts = cleanCounts(run.counts)
  const cells = cleanCells(run.cells)
  if (
    !isDay(day) ||
    !isOneOf(GSHEET_VIAS, via) ||
    !isOneOf(GSHEET_MODES, mode) ||
    !isOneOf(GSHEET_OUTCOMES, outcome) ||
    !isCode(code) ||
    !isWhole(rows, 0, Number.MAX_SAFE_INTEGER) ||
    counts === null ||
    cells === null
  ) {
    return null
  }
  return { day, via, mode, outcome, code, rows, counts, cells }
}

/** 넣은 기록 한 줄(숫자·오류 번호·칸 주소만). 시각·id·병원은 DB가 정한다. 모양이 틀리면 보내지 않고 'invalid' */
export async function addGsheetRun(client: Client, run: GsheetRunInput): Promise<void | 'invalid'> {
  const body = runBody(run)
  if (body === null) return 'invalid'
  await send(() => client.from(RUNS).insert(body))
}

function toRun(row: unknown): GsheetRun | null {
  if (!isRecord(row) || !isStamp(row.at)) return null
  const { at, ...rest } = row
  const body = runBody(rest)
  return body === null ? null : { at, ...body }
}

/** fromIso 뒤 넣은 기록, 넣은 차례. 틀린 줄은 뺀다. 시각 모양이 틀리면 보내지 않고 failed */
export async function listGsheetRuns(client: Client, fromIso: string): Promise<GsheetRun[]> {
  if (!isStamp(fromIso)) throw failed()
  const rows = await readPages((first, last) =>
    client.from(RUNS).select(RUN_COLUMNS).gte('at', fromIso).order('at', ASC).order('id', ASC).range(first, last),
  )
  return rows.flatMap((row) => toRun(row) ?? [])
}

/** 마지막 기록 한 줄. 없거나 모양이 틀리면 null */
export async function lastGsheetRun(client: Client): Promise<GsheetRun | null> {
  const { data } = await send(() => client.from(RUNS).select(RUN_COLUMNS).order('at', { ascending: false }).limit(1).maybeSingle<ReadRow>())
  return toRun(data)
}
