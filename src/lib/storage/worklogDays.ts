import type { SupabaseClient } from '@supabase/supabase-js'
import { BIT_FILL_KEYS } from '@/lib/worklog/bitFill'
import { cashSaveValue, toWorklogCash } from '@/lib/worklog/cashFloat'
import { cellSaveText } from '@/lib/worklog/cellText'
import { toMemoFontPt } from '@/lib/worklog/memoFont'
import { blockedCellKeys } from '@/lib/worklog/notes'
import {
  emptyWorklogDay,
  MEMO_FONT_PTS,
  WORKLOG_CASH_COLUMNS,
  WORKLOG_CELL_KEYS,
  WORKLOG_COLUMNS,
  type MemoFontPt,
  type WorklogCash,
  type WorklogCashChanges,
  type WorklogCashKey,
  type WorklogChanges,
  type WorklogDay,
  type WorklogNumberKey,
  type WorklogSavedDay,
} from '@/types/worklog'

// 업무일지 하루 읽기·저장 (specs/worklog/design.md 9절, 비트 칸 목록은 20-4절, 업무사항 글씨 크기는 specs/worklog-memo-font,
// 현금 시재 12칸은 specs/worklog-cash-float).
// 내 병원 줄만 보이고 들어가는 것은 RLS와 DB 기본값이 한다. 여기서는 병원 id를 거르지도 보내지도 않는다

export type WorklogErrorKind = 'offline' | 'failed'

/** 오류에는 종류만 담는다. Supabase 문구·입력값은 화면까지 가지 않게 넣지 않는다 */
export class WorklogStorageError extends Error {
  readonly kind: WorklogErrorKind

  constructor(kind: WorklogErrorKind) {
    super(`worklog storage ${kind}`)
    this.name = 'WorklogStorageError'
    this.kind = kind
  }
}

type Client = Pick<SupabaseClient, 'from'>
type Row = Record<string, string | null>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다
type SaveRow = Record<string, string | string[] | number | boolean | null>

const TABLE = 'worklog_days'
const BIT_COLUMN = 'bit_fields'
const MEMO_FONT_COLUMN = 'memo_font_pt'
// 시재 칸은 WORKLOG_CASH_COLUMNS 차례(장수 5만원권부터 · 시재 · 확인란 둘 · 이유)
const CASH_KEYS = Object.keys(WORKLOG_CASH_COLUMNS) as WorklogCashKey[]
const SELECT = [
  ...WORKLOG_CELL_KEYS.map((key) => WORKLOG_COLUMNS[key]),
  BIT_COLUMN,
  MEMO_FONT_COLUMN,
  ...CASH_KEYS.map((key) => WORKLOG_CASH_COLUMNS[key]),
].join(',')
const MEMO_FONT_LIST: readonly unknown[] = MEMO_FONT_PTS

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new WorklogStorageError('offline')
}

// postgrest-js는 연결 실패를 던지지 않고 status 0으로 돌려준다(응답 없음 = offline).
// 그래도 던져지면 원문이 화면으로 새지 않게 failed로 바꾼다
async function send<Reply extends { error: unknown; status: number }>(request: () => PromiseLike<Reply>): Promise<Reply> {
  let reply: Reply
  try {
    reply = await request()
  } catch {
    throw new WorklogStorageError('failed')
  }
  if (reply.error) throw new WorklogStorageError(reply.status === 0 ? 'offline' : 'failed')
  return reply
}

function toDay(row: ReadRow): WorklogDay {
  const day = emptyWorklogDay()
  for (const key of WORKLOG_CELL_KEYS) {
    const value = row[WORKLOG_COLUMNS[key]]
    day[key] = typeof value === 'string' ? value : ''
  }
  return day
}

// 비트 칸 목록은 비트가 채우는 여덟 칸만, 처음 나온 차례로 한 번씩 둔다(design.md 20-4절).
// DB check(<@)는 중복·배열 속 배열을 막지 않으니 읽을 때 거르고, 보낼 때도 마지막 문에서 한 번 더 고른다.
// 목록이 아니면 빈 목록이다(bit_fields가 없는 옛 줄)
function pickBitFields(names: unknown, nameOf: (key: WorklogNumberKey) => string): WorklogNumberKey[] {
  if (!Array.isArray(names)) return []
  const picked: WorklogNumberKey[] = []
  for (const name of names) {
    const key = BIT_FILL_KEYS.find((fill) => nameOf(fill) === name)
    if (key && !picked.includes(key)) picked.push(key)
  }
  return picked
}

// 시재는 DB 칸 이름으로 읽은 값을 열쇠로 옮긴 뒤 toWorklogCash가 거른다. 칸이 없는 옛 응답은 빈 시재다
function toCash(row: ReadRow): WorklogCash {
  return toWorklogCash(Object.fromEntries(CASH_KEYS.map((key) => [key, row[WORKLOG_CASH_COLUMNS[key]]])))
}

// 받은 시재 칸만 보낸다(바뀐 칸만. 안 받은 칸을 기본값으로 보내면 다른 PC가 센 장수가 지워진다).
// 범위 밖·모양이 틀린 값·개인정보 모양 이유는 cashSaveValue가 undefined로 돌려줘 보내지 않는다(서버로 가는 마지막 문)
function cashColumns(cash: WorklogCashChanges | undefined): SaveRow {
  const columns: SaveRow = {}
  if (typeof cash !== 'object' || cash === null) return columns
  for (const key of CASH_KEYS) {
    const value = cash[key]
    if (value === undefined) continue
    const saved = cashSaveValue(key, value)
    if (saved !== undefined) columns[WORKLOG_CASH_COLUMNS[key]] = saved
  }
  return columns
}

// 열쇠를 골라서 만든다({ ...changes } 금지). 받은 칸 말고는 채우지 않는다: null로 보내면 다른 PC가 고친 칸이 지워진다.
// 막는 모양은 자동 저장이 이미 빼고 주지만 서버로 가는 마지막 문이라 한 번 더 뺀다.
// 긴 글자를 자르지 않는다(DB 제약이 거부 → failed. 몰래 잘라 저장하지 않으려고)
function changedColumns(changes: WorklogChanges): Row {
  const blocked = blockedCellKeys(changes)
  const columns: Row = {}
  for (const key of WORKLOG_CELL_KEYS) {
    const text = changes[key]
    if (text === undefined || blocked.includes(key)) continue
    columns[WORKLOG_COLUMNS[key]] = cellSaveText(key, text) || null
  }
  return columns
}

export async function loadWorklogDay(client: Client, ymd: string): Promise<WorklogSavedDay | null> {
  failIfOffline()
  const { data } = await send(() =>
    client.from(TABLE).select(SELECT).eq('work_date', ymd).maybeSingle<ReadRow>(),
  )
  if (data === null) return null
  return {
    day: toDay(data),
    bitFields: pickBitFields(data[BIT_COLUMN], (key) => WORKLOG_COLUMNS[key]),
    memoFontPt: toMemoFontPt(data[MEMO_FONT_COLUMN]), // 목록 밖·null·칸 없는 옛 줄은 11
    cash: toCash(data),
  }
}

// bitFields를 받지 않으면 bit_fields 칸을 보내지 않는다. 빈 목록 []을 보내면 저장된 비트 표시가 지워진다(AC-016.2).
// memoFontPt도 받지 않으면 memo_font_pt 칸을 보내지 않는다. 기본값 11로 보내면 다른 PC가 고른 크기가 지워진다(AC-1503.3).
// 목록 밖 값(타입을 넘어 온 값)도 보내지 않는다: 서버로 가는 마지막 문이다.
// cash(바뀐 시재 칸만)도 받지 않으면 시재 칸을 하나도 보내지 않는다(AC-1603.2)
export async function saveWorklogDay(
  client: Client,
  ymd: string,
  changes: WorklogChanges,
  bitFields?: readonly WorklogNumberKey[],
  memoFontPt?: MemoFontPt,
  cash?: WorklogCashChanges,
): Promise<void> {
  const columns: SaveRow = { ...changedColumns(changes), ...cashColumns(cash) }
  if (Array.isArray(bitFields)) {
    columns[BIT_COLUMN] = pickBitFields(bitFields, (key) => key).map((key) => WORKLOG_COLUMNS[key])
  }
  if (MEMO_FONT_LIST.includes(memoFontPt)) columns[MEMO_FONT_COLUMN] = memoFontPt as MemoFontPt
  if (Object.keys(columns).length === 0) return
  failIfOffline()
  const row: SaveRow = { work_date: ymd, ...columns }
  await send(() => client.from(TABLE).upsert(row, { onConflict: 'hospital_id,work_date' }))
}
