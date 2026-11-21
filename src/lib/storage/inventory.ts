import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, isMonth, isYmd } from '@/lib/analytics/dates'
import { normalizeName } from '@/lib/inventory/names'
import { supabaseBrowser } from '@/lib/supabase/browser'
import {
  ALIAS_MAX,
  AMOUNT_MAX,
  BIT_CODE_MAX,
  BIT_ITEM_UNIT,
  CATEGORY_NAME_MAX,
  COUNT_LINES_MAX,
  DEFAULT_CATEGORIES,
  INVENTORY_PHOTO_BUCKET,
  ITEM_NAME_MAX,
  PHOTO_MAX_BYTES,
  QTY_MAX,
  RECEIPT_LINES_MAX,
  UNIT_MAX,
  UNIT_PRICE_MAX,
  VENDOR_MAX,
  type ImportPlan,
  type InvAlias,
  type InvBitMonth,
  type InvBitPick,
  type InvCategory,
  type InvCountInput,
  type InvCountLine,
  type InvInventory,
  type InvItem,
  type InvItemAdded,
  type InvItemChanges,
  type InvItemFields,
  type InvRange,
  type InvReceipt,
  type InvReceiptEdit,
  type InvReceiptInput,
  type InvReceiptLine,
  type InvReceiptLineInput,
} from '@/types/inventory'

// 재고 탭 브라우저 저장 (specs/inventory REQ-7504·REQ-7514, design.md 3절). 브라우저 Supabase 클라이언트 + RLS로만 한다(ADR-004).
// 표 일곱(inventory_*)·DB 함수 다섯·비공개 사진 저장소 inventory-photos(<병원 id>/<uuid>.jpg)와 통계 stats_months(rx만 읽음).
// 보내는 몸통은 칸 권한에 있는 칸만 골라 새로 만든다({ ...받은 값 } 금지). hospital_id·id·시각은 DB가 정하고 어느 병원 줄인지는 RLS가 고른다.
// 지금 수량(qty)·마지막 세기 칸은 DB 함수만 바꾼다 — 세기·입고 저장·고치기·지우기는 각각 함수 하나를 부른다.
// 받은 값이 틀리면(글자 길이·제어 문자·수 범위·날짜 모양) 보내지 않고 'failed'다. 읽은 줄은 모양을 믿지 않고 틀린 줄은 뺀다. 읽기는 1,000줄씩 끝까지.
// 실패는 'failed'(사진은 null) 하나이고, 이름·코드 겹침(23505)은 'duplicate', 물품이 있는 분류 지우기(23503)는 'in-use'다.
// Supabase 오류 글은 버리고 밖으로 내지 않으며 던지지 않는다

type Client = SupabaseClient
type Row = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다
type Reply = { data: unknown; error: unknown }
type Outcome = 'failed' | 'duplicate' | 'in-use'

const CATEGORIES = 'inventory_categories'
const ITEMS = 'inventory_items'
const COUNTS = 'inventory_counts'
const COUNT_LINES = 'inventory_count_lines'
const RECEIPTS = 'inventory_receipts'
const RECEIPT_LINES = 'inventory_receipt_lines'
const ALIASES = 'inventory_aliases'
const STATS_MONTHS = 'stats_months'

const CATEGORY_COLUMNS = 'id, name, sort_order'
const ITEM_COLUMNS =
  'id, category_id, name, unit, min_qty, qty, last_count_qty, last_counted_at, expiry, vendor, unit_price, bit_code, sort_order, hidden, ordered_at'
const COUNT_LINE_COLUMNS = `item_id, qty, saved_at, ${COUNTS}!inner(counted_on)`
const RECEIPT_LINE_COLUMNS = `item_id, qty, unit_price, amount, ${RECEIPTS}!inner(received_on, created_at)`
const RECEIPT_COLUMNS = `id, received_on, vendor, photo_path, created_at, ${RECEIPT_LINES}(item_id, qty, unit_price, amount)`

const PAGE_ROWS = 1000 // Supabase가 한 번에 주는 줄 수 기본값. 넘는 줄은 알리지 않고 잘라 주므로 쪽으로 나눠 다 읽는다
const ASC = { ascending: true }
const DESC = { ascending: false }
const DUPLICATE = '23505'
const IN_USE = '23503'
const JPEG_TYPE = 'image/jpeg'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/
const CONTROL = /\p{Cc}/u

/** 안에서만 던지는 결과. attempt가 받아 돌려준다(그 밖의 예외는 모두 'failed') */
class Stop {
  constructor(readonly outcome: Outcome) {}
}
const fail = (): never => {
  throw new Stop('failed')
}

// F = 그 함수가 돌려줄 수 있는 결과(기본 'failed'). 부르는 쪽 반환 타입에서 넓게 추론되지 않게 NoInfer로 막는다
async function attempt<T, F extends Outcome = 'failed'>(work: (client: Client) => Promise<T>): Promise<T | NoInfer<F>> {
  try {
    return await work(supabaseBrowser())
  } catch (error) {
    return (error instanceof Stop ? error.outcome : 'failed') as F
  }
}

const codeOf = (error: unknown): unknown => (isRecord(error) ? error.code : undefined)

/** 오류가 없으면 data. 오류면 그 코드에 맞는 결과(23505 → duplicate 등, 고른 것만)로 멈춘다 */
function check(reply: Reply, known: Partial<Record<string, Outcome>> = {}): unknown {
  if (reply.error) throw new Stop(known[String(codeOf(reply.error))] ?? 'failed')
  return reply.data
}
const NAME_TAKEN = { [DUPLICATE]: 'duplicate' } as const

// 뒷정리(사진 파일 지우기)는 실패해도 결과를 바꾸지 않는다
async function quietly(work: () => PromiseLike<unknown>): Promise<void> {
  try {
    await work()
  } catch {
    // 알리지 않는다
  }
}

/** 1,000줄씩 끝까지 읽는다. 오류거나 목록이 아니면 실패(빈 목록으로 보이지 않는다) */
async function readAll(page: (first: number, last: number) => PromiseLike<Reply>): Promise<unknown[]> {
  const rows: unknown[] = []
  for (;;) {
    const data = check(await page(rows.length, rows.length + PAGE_ROWS - 1))
    if (!Array.isArray(data)) return fail()
    rows.push(...data)
    if (data.length < PAGE_ROWS) return rows
  }
}

// ── 값 검사 ────────────────────────────────────────────────

const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const isId = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isInt = (value: unknown): value is number => Number.isInteger(value)
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const lengthOf = (text: string) => [...text].length

/** 앞뒤 빈칸을 뗀 1~max자 글(제어 문자 없음). 아니면 null */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text !== '' && lengthOf(text) <= max && !CONTROL.test(text) ? text : null
}
const text = (value: unknown, max: number): string => cleanText(value, max) ?? fail()
/** 비었으면(null·빈칸) null, 아니면 text */
const optionalText = (value: unknown, max: number): string | null =>
  value === null || (typeof value === 'string' && value.trim() === '') ? null : text(value, max)
const whole = (value: unknown, min: number, max: number): number =>
  isInt(value) && value >= min && value <= max ? value : fail()
const optionalWhole = (value: unknown, min: number, max: number): number | null => (value === null ? null : whole(value, min, max))
const day = (value: unknown): string => (isDay(value) ? value : fail())
const optionalDay = (value: unknown): string | null => (value === null ? null : day(value))
const id = (value: unknown): string => (isId(value) ? value : fail())
const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : fail())

function range(value: InvRange): { start: string; end: string } {
  const start = day(value?.from)
  const end = day(value?.to)
  return start <= end ? { start, end } : fail()
}

/** 한국 날짜 그날 0시의 UTC 시각 글자 */
const koreaStartOf = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`).toISOString()

// ── 읽은 줄 → 앱 모양 ──────────────────────────────────────

const intOrNull = (value: unknown): value is number | null => value === null || isInt(value)
const textOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'

function toCategory(row: unknown): InvCategory | null {
  if (!isRecord(row) || !isId(row.id) || typeof row.name !== 'string' || row.name === '' || !isInt(row.sort_order)) return null
  return { id: row.id, name: row.name, sortOrder: row.sort_order }
}

function toItem(row: unknown): InvItem | null {
  if (!isRecord(row)) return null
  const r = row
  if (!isId(r.id) || !isId(r.category_id) || !isId(r.name) || !isId(r.unit) || !isInt(r.qty) || !isInt(r.sort_order)) return null
  if (!intOrNull(r.min_qty) || !intOrNull(r.last_count_qty) || !intOrNull(r.unit_price)) return null
  if (!textOrNull(r.last_counted_at) || !textOrNull(r.vendor) || !textOrNull(r.bit_code) || !textOrNull(r.ordered_at)) return null
  if (!(r.expiry === null || isDay(r.expiry)) || typeof r.hidden !== 'boolean') return null
  return {
    id: r.id,
    categoryId: r.category_id,
    name: r.name,
    unit: r.unit,
    minQty: r.min_qty,
    qty: r.qty,
    lastCountQty: r.last_count_qty,
    lastCountedAt: r.last_counted_at,
    expiry: r.expiry,
    vendor: r.vendor,
    unitPrice: r.unit_price,
    bitCode: r.bit_code,
    sortOrder: r.sort_order,
    hidden: r.hidden,
    orderedAt: r.ordered_at,
  }
}

/** 입고 줄 네 칸 + 그 입고의 명세서 날짜·저장 시각 */
function toReceiptLine(row: unknown, receivedOn: unknown, createdAt: unknown): InvReceiptLine | null {
  if (!isRecord(row) || !isId(row.item_id) || !isInt(row.qty) || !intOrNull(row.unit_price) || !isInt(row.amount)) return null
  if (!isDay(receivedOn) || !isId(createdAt)) return null
  return { itemId: row.item_id, day: receivedOn, savedAt: createdAt, qty: row.qty, unitPrice: row.unit_price, amount: row.amount }
}

function toReceipt(row: unknown): InvReceipt | null {
  if (!isRecord(row) || !isId(row.id) || !isDay(row.received_on) || !isId(row.created_at)) return null
  if (!textOrNull(row.vendor) || !textOrNull(row.photo_path) || !Array.isArray(row[RECEIPT_LINES])) return null
  const lines = (row[RECEIPT_LINES] as unknown[]).flatMap((line) => toReceiptLine(line, row.received_on, row.created_at) ?? [])
  return { id: row.id, day: row.received_on, vendor: row.vendor, photoPath: row.photo_path, lines }
}

// ── 보내는 몸통 ────────────────────────────────────────────

/** 받은 칸만(undefined는 없는 칸) 검사해 DB 칸 이름으로. 넣기·고치기 칸 권한 안의 칸뿐이다 */
function itemBody(fields: InvItemChanges): Row {
  const body: Row = {}
  if (fields.categoryId !== undefined) body.category_id = id(fields.categoryId)
  if (fields.name !== undefined) body.name = text(fields.name, ITEM_NAME_MAX)
  if (fields.unit !== undefined) body.unit = text(fields.unit, UNIT_MAX)
  if (fields.minQty !== undefined) body.min_qty = optionalWhole(fields.minQty, 0, QTY_MAX)
  if (fields.expiry !== undefined) body.expiry = optionalDay(fields.expiry)
  if (fields.vendor !== undefined) body.vendor = optionalText(fields.vendor, VENDOR_MAX)
  if (fields.unitPrice !== undefined) body.unit_price = optionalWhole(fields.unitPrice, 0, UNIT_PRICE_MAX)
  if (fields.bitCode !== undefined) body.bit_code = optionalText(fields.bitCode, BIT_CODE_MAX)
  if (fields.hidden !== undefined) body.hidden = flag(fields.hidden)
  return body
}

/** save_inventory_count 한 줄: qty·expiry는 받은 열쇠만 */
function countLine(line: InvCountInput): Row {
  if (!isRecord(line)) return fail()
  const body: Row = { item_id: id(line.itemId) }
  if (line.qty !== undefined) body.qty = optionalWhole(line.qty, 0, QTY_MAX)
  if (line.expiry !== undefined) body.expiry = optionalDay(line.expiry)
  return body
}

function receiptLines(lines: InvReceiptLineInput[]): Row[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > RECEIPT_LINES_MAX) return fail()
  return lines.map((line) => {
    if (!isRecord(line)) return fail()
    return {
      item_id: id(line.itemId),
      qty: whole(line.qty, 1, QTY_MAX),
      unit_price: optionalWhole(line.unitPrice, 0, UNIT_PRICE_MAX),
      amount: whole(line.amount, 0, AMOUNT_MAX),
    }
  })
}

/** 1~3,000,000바이트 JPEG(FF D8 FF)만 */
async function checkedPhoto(photo: unknown): Promise<Blob> {
  if (!(photo instanceof Blob) || photo.size < 3 || photo.size > PHOTO_MAX_BYTES) return fail()
  const head = new Uint8Array(await photo.slice(0, 3).arrayBuffer())
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? photo : fail()
}

// ── 공통 읽기·쓰기 ─────────────────────────────────────────

async function readCategories(client: Client): Promise<InvCategory[]> {
  const rows = await readAll((first, last) => client.from(CATEGORIES).select(CATEGORY_COLUMNS).order('sort_order', ASC).order('name', ASC).range(first, last))
  return rows.flatMap((row) => toCategory(row) ?? [])
}

/** 분류 차례 → sort_order 차례(같으면 읽은 차례 그대로) */
function inCategoryOrder(items: InvItem[], categories: InvCategory[]): InvItem[] {
  const place = new Map(categories.map((category, index) => [category.id, index]))
  const rank = (item: InvItem) => place.get(item.categoryId) ?? categories.length
  return [...items].sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder)
}

/** 지금 가장 큰 sort_order + 1(줄이 없으면 0). categoryId를 주면 그 분류 안에서 */
async function nextSortOrder(client: Client, table: string, categoryId?: string): Promise<number> {
  let query = client.from(table).select('sort_order')
  if (categoryId !== undefined) query = query.eq('category_id', categoryId)
  const data = check(await query.order('sort_order', DESC).limit(1))
  if (!Array.isArray(data)) return fail()
  const top: unknown = data[0]
  if (top === undefined) return 0
  return isRecord(top) && isInt(top.sort_order) ? top.sort_order + 1 : fail()
}

/** 세기 줄을 1,000줄씩 save_inventory_count로 보낸다(같은 날은 물품마다 덮어써서 나눠 보내도 같다) */
async function sendCount(client: Client, ymd: string, lines: Row[]): Promise<void> {
  for (let start = 0; start < lines.length; start += COUNT_LINES_MAX) {
    check(await client.rpc('save_inventory_count', { p_day: ymd, p_lines: lines.slice(start, start + COUNT_LINES_MAX) }))
  }
}

// ── 분류·물품 읽기 (AC-7504.1) ──────────────────────────────

/**
 * 분류와 물품(분류 차례 → sort_order 차례). seed(기본 참)이고 분류가 하나도 없으면 처음 넷을 넣고 다시 읽는다 —
 * 다른 창이 먼저 넣어 이름이 겹쳐도(23505) 다시 읽은 값을 준다. 대시보드는 { seed: false }로 읽어 보기만 해도 자료가 생기지 않는다
 */
export async function loadInventory({ seed = true }: { seed?: boolean } = {}): Promise<InvInventory | 'failed'> {
  return attempt(async (client) => {
    let categories = await readCategories(client)
    if (seed && categories.length === 0) {
      const reply = await client.from(CATEGORIES).insert(DEFAULT_CATEGORIES.map((name, index) => ({ name, sort_order: index })))
      if (reply.error && codeOf(reply.error) !== DUPLICATE) fail()
      categories = await readCategories(client)
    }
    const rows = await readAll((first, last) => client.from(ITEMS).select(ITEM_COLUMNS).order('sort_order', ASC).order('name', ASC).range(first, last))
    const items = rows.flatMap((row) => toItem(row) ?? [])
    return { categories, items: inCategoryOrder(items, categories) }
  })
}

// ── 분류 (AC-7504.2) ────────────────────────────────────────

/** 분류 끝에 넣는다(이름 1~20자). 넣은 분류를 준다 */
export async function addCategory(name: string): Promise<InvCategory | 'duplicate' | 'failed'> {
  return attempt<InvCategory, 'duplicate' | 'failed'>(async (client) => {
    const clean = text(name, CATEGORY_NAME_MAX)
    const sortOrder = await nextSortOrder(client, CATEGORIES)
    const data = check(await client.from(CATEGORIES).insert({ name: clean, sort_order: sortOrder }).select(CATEGORY_COLUMNS).single(), NAME_TAKEN)
    return toCategory(data) ?? fail()
  })
}

export async function renameCategory(categoryId: string, name: string): Promise<'ok' | 'duplicate' | 'failed'> {
  return attempt<'ok', 'duplicate' | 'failed'>(async (client) => {
    const body = { name: text(name, CATEGORY_NAME_MAX) }
    check(await client.from(CATEGORIES).update(body).eq('id', id(categoryId)), NAME_TAKEN)
    return 'ok'
  })
}

/** 물품이 있는 분류(안 쓰는 물품 포함)는 DB가 막는다(23503 → 'in-use') */
export async function deleteCategory(categoryId: string): Promise<'ok' | 'in-use' | 'failed'> {
  return attempt<'ok', 'in-use' | 'failed'>(async (client) => {
    check(await client.from(CATEGORIES).delete().eq('id', id(categoryId)), { [IN_USE]: 'in-use' })
    return 'ok'
  })
}

/** 받은 차례대로 분류마다 sort_order(0부터) 하나만 고친다. 하나라도 실패하면 뒤는 보내지 않는다 */
export async function saveCategoryOrder(ids: string[]): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    const order = Array.isArray(ids) ? ids.map(id) : fail()
    for (const [index, categoryId] of order.entries()) check(await client.from(CATEGORIES).update({ sort_order: index }).eq('id', categoryId))
    return 'ok' as const
  })
}

// ── 물품 (AC-7504.2) ────────────────────────────────────────

/**
 * 그 분류 맨 끝에 넣는다(넣기 칸 권한 칸만, 지금 수량은 보내지 않음). qty(0~1,000,000)를 주면 넣은 뒤 today 날짜 세기로 그 수를 적는다.
 * 넣은 물품 id를 준다. 물품은 들어갔는데 그 세기만 실패하면 { id, countFailed: true }(물품은 되돌리지 않는다). 이름·비트 코드 겹침은 'duplicate'
 */
export async function addItem(fields: InvItemFields, qty: number | null, today: string): Promise<InvItemAdded | 'duplicate' | 'failed'> {
  return attempt<InvItemAdded, 'duplicate' | 'failed'>(async (client) => {
    if (!isRecord(fields)) return fail()
    const body = itemBody({
      categoryId: id(fields.categoryId),
      name: text(fields.name, ITEM_NAME_MAX),
      unit: text(fields.unit, UNIT_MAX),
      minQty: fields.minQty ?? null,
      expiry: fields.expiry ?? null,
      vendor: fields.vendor ?? null,
      unitPrice: fields.unitPrice ?? null,
      bitCode: fields.bitCode ?? null,
    })
    const count = qty === null ? null : whole(qty, 0, QTY_MAX)
    const ymd = day(today)
    body.sort_order = await nextSortOrder(client, ITEMS, body.category_id as string)
    const data = check(await client.from(ITEMS).insert(body).select('id').single(), NAME_TAKEN)
    const itemId = isRecord(data) && isId(data.id) ? data.id : fail()
    if (count === null) return { id: itemId }
    try {
      await sendCount(client, ymd, [{ item_id: itemId, qty: count }])
    } catch {
      return { id: itemId, countFailed: true }
    }
    return { id: itemId }
  })
}

/** 받은 칸만 그 물품에 고친다. 바꿀 칸이 없으면 보내지 않고 'ok' */
export async function updateItem(itemId: string, changes: InvItemChanges): Promise<'ok' | 'duplicate' | 'failed'> {
  return attempt<'ok', 'duplicate' | 'failed'>(async (client) => {
    const target = id(itemId)
    const body = itemBody(isRecord(changes) ? changes : fail())
    if (Object.keys(body).length === 0) return 'ok'
    check(await client.from(ITEMS).update(body).eq('id', target), NAME_TAKEN)
    return 'ok'
  })
}

/** [주문함](켬 = 지금 시각) · [주문 취소](끔 = null). 입고 저장은 DB 함수가 푼다 */
export async function setOrdered(itemId: string, on: boolean): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    const body = { ordered_at: flag(on) ? new Date().toISOString() : null }
    check(await client.from(ITEMS).update(body).eq('id', id(itemId)))
    return 'ok' as const
  })
}

/** 전체 물품 차례(set_inventory_order: sort_order = 자리, 남의 id는 DB가 무시) */
export async function saveOrder(ids: string[]): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    const order = Array.isArray(ids) ? ids.map(id) : fail()
    check(await client.rpc('set_inventory_order', { p_ids: order }))
    return 'ok' as const
  })
}

// ── 별칭 (AC-7504.2) ────────────────────────────────────────

export async function listAliases(): Promise<InvAlias[] | 'failed'> {
  return attempt(async (client) => {
    const rows = await readAll((first, last) => client.from(ALIASES).select('alias, item_id').order('alias', ASC).range(first, last))
    return rows.flatMap((row) => (isRecord(row) && isId(row.alias) && isId(row.item_id) ? [{ alias: row.alias, itemId: row.item_id }] : []))
  })
}

/**
 * 맞춘 이름 기억. 새 이름은 한 번에 넣고(이미 있으면 건너뜀: 넣기 칸 권한 alias·item_id만으로 되는 ON CONFLICT DO NOTHING),
 * 이미 있던 이름은 item_id 하나만 고친다(고치기 칸 권한 item_id). 같은 이름은 뒤 것, 맞지 않는 줄(빈 이름·60자 넘음·제어 문자)은 기억하지 않는다
 */
export async function saveAliases(aliases: InvAlias[]): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    const wanted = new Map<string, string>()
    for (const entry of Array.isArray(aliases) ? aliases : fail()) {
      const alias = isRecord(entry) ? cleanText(entry.alias, ALIAS_MAX) : null
      if (alias !== null && isId(entry.itemId)) wanted.set(alias, entry.itemId)
    }
    if (wanted.size === 0) return 'ok' as const
    const rows = [...wanted].map(([alias, itemId]) => ({ alias, item_id: itemId }))
    const data = check(await client.from(ALIASES).upsert(rows, { onConflict: 'hospital_id,alias', ignoreDuplicates: true }).select('alias'))
    if (!Array.isArray(data)) return fail()
    const inserted = new Set(data.flatMap((row: unknown) => (isRecord(row) && typeof row.alias === 'string' ? [row.alias] : [])))
    for (const [alias, itemId] of wanted) {
      if (!inserted.has(alias)) check(await client.from(ALIASES).update({ item_id: itemId }).eq('alias', alias))
    }
    return 'ok' as const
  })
}

export async function deleteAlias(alias: string): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    check(await client.from(ALIASES).delete().eq('alias', id(alias)))
    return 'ok' as const
  })
}

// ── 세기·입고 저장 (AC-7504.3) ──────────────────────────────

/** 병원의 가장 늦은 세기 날짜. 세기가 없으면 null */
export async function lastCountDay(): Promise<string | null | 'failed'> {
  return attempt(async (client) => {
    const data = check(await client.from(COUNTS).select('counted_on').order('counted_on', DESC).limit(1))
    if (!Array.isArray(data)) return fail()
    const top: unknown = data[0]
    if (top === undefined) return null
    return isRecord(top) && isDay(top.counted_on) ? top.counted_on : fail()
  })
}

/** 세기 저장(save_inventory_count). 날짜 범위(마지막 세기 날짜~한국 오늘)는 DB 함수가 지킨다. 보낼 줄이 없으면 'ok' */
export async function saveCount(countDay: string, lines: InvCountInput[]): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    const ymd = day(countDay)
    const body = Array.isArray(lines) ? lines.map(countLine) : fail()
    await sendCount(client, ymd, body)
    return 'ok' as const
  })
}

/**
 * 입고 저장(save_inventory_receipt). 사진이 있으면 먼저 <병원 id>/<새 uuid>.jpg로 올리고 그 자리로 저장한다 —
 * 올리기가 실패하면 저장하지 않는다(남은 사진은 내 병원 폴더 안 쓰레기일 뿐이라 지우지 않는다). 저장한 입고 id를 준다
 */
export async function saveReceipt(input: InvReceiptInput): Promise<{ id: string } | 'failed'> {
  return attempt(async (client) => {
    if (!isRecord(input)) return fail()
    const ymd = day(input.day)
    const vendor = optionalText(input.vendor, VENDOR_MAX)
    const lines = receiptLines(input.lines)
    const photo = input.photo === null ? null : await checkedPhoto(input.photo)
    let photoPath: string | null = null
    if (photo !== null) {
      const hospital = check(await client.rpc('my_hospital_id'))
      if (typeof hospital !== 'string' || !UUID.test(hospital)) return fail()
      photoPath = `${hospital}/${crypto.randomUUID()}.jpg`
      check(await client.storage.from(INVENTORY_PHOTO_BUCKET).upload(photoPath, photo, { contentType: JPEG_TYPE, upsert: false }))
    }
    const saved = check(await client.rpc('save_inventory_receipt', { p_day: ymd, p_vendor: vendor, p_photo_path: photoPath, p_lines: lines }))
    return { id: isId(saved) ? saved : fail() }
  })
}

/** 입고 고치기(update_inventory_receipt): 날짜·거래처·줄만. 저장 시각·사진은 그대로다. 줄을 다 지우려면 deleteReceipt */
export async function updateReceipt(receiptId: string, edit: InvReceiptEdit): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    if (!isRecord(edit)) return fail()
    const args = { p_id: id(receiptId), p_day: day(edit.day), p_vendor: optionalText(edit.vendor, VENDOR_MAX), p_lines: receiptLines(edit.lines) }
    check(await client.rpc('update_inventory_receipt', args))
    return 'ok' as const
  })
}

/** 입고 지우기(delete_inventory_receipt) → 돌려받은 사진 자리 파일도 지운다(파일 지우기 실패해도 'ok') */
export async function deleteReceipt(receiptId: string): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    const path = check(await client.rpc('delete_inventory_receipt', { p_id: id(receiptId) }))
    if (isId(path)) await quietly(() => client.storage.from(INVENTORY_PHOTO_BUCKET).remove([path]))
    return 'ok' as const
  })
}

// ── 달별·기록 읽기 (AC-7504.4) ──────────────────────────────

/** 명세서 날짜가 구간 안인 입고(최근 날짜 먼저), 줄 함께. 들어온 기록 화면이 쓴다 */
export async function listReceipts(span: InvRange): Promise<InvReceipt[] | 'failed'> {
  return attempt(async (client) => {
    const { start, end } = range(span)
    const rows = await readAll((first, last) =>
      client
        .from(RECEIPTS)
        .select(RECEIPT_COLUMNS)
        .gte('received_on', start)
        .lte('received_on', end)
        .order('received_on', DESC)
        .order('created_at', DESC)
        .order('id', DESC)
        .range(first, last),
    )
    return rows.flatMap((row) => toReceipt(row) ?? [])
  })
}

/** 사진 하나(Blob). 자리 모양이 틀리거나 실패면 null */
export async function readPhoto(path: string): Promise<Blob | null> {
  if (typeof path !== 'string' || !PHOTO_PATH.test(path)) return null
  try {
    const { data, error } = await supabaseBrowser().storage.from(INVENTORY_PHOTO_BUCKET).download(path)
    return !error && data instanceof Blob ? data : null
  } catch {
    return null
  }
}

/** 세기 날짜가 구간 안인 세기 줄 */
export async function listCountLines(span: InvRange): Promise<InvCountLine[] | 'failed'> {
  return attempt(async (client) => {
    const { start, end } = range(span)
    const rows = await readAll((first, last) =>
      client
        .from(COUNT_LINES)
        .select(COUNT_LINE_COLUMNS)
        .gte(`${COUNTS}.counted_on`, start)
        .lte(`${COUNTS}.counted_on`, end)
        .order('count_id', ASC)
        .order('item_id', ASC)
        .range(first, last),
    )
    return rows.flatMap((row) => {
      if (!isRecord(row) || !isId(row.item_id) || !isInt(row.qty) || !isId(row.saved_at)) return []
      const count = row[COUNTS]
      return isRecord(count) && isDay(count.counted_on) ? [{ itemId: row.item_id, day: count.counted_on, savedAt: row.saved_at, qty: row.qty }] : []
    })
  })
}

/** 명세서 날짜 또는 저장 시각의 한국 날짜가 구간 안인 입고 줄(줄마다 명세서 날짜·저장 시각) */
export async function listReceiptLines(span: InvRange): Promise<InvReceiptLine[] | 'failed'> {
  return attempt(async (client) => {
    const { start, end } = range(span)
    const savedFrom = koreaStartOf(start)
    const savedBefore = koreaStartOf(addDays(end, 1))
    const within =
      `and(received_on.gte.${start},received_on.lte.${end}),` + `and(created_at.gte."${savedFrom}",created_at.lt."${savedBefore}")`
    const rows = await readAll((first, last) =>
      client.from(RECEIPT_LINES).select(RECEIPT_LINE_COLUMNS).or(within, { referencedTable: RECEIPTS }).order('id', ASC).range(first, last),
    )
    return rows.flatMap((row) => {
      const receipt = isRecord(row) ? row[RECEIPTS] : null
      const line = isRecord(receipt) ? toReceiptLine(row, receipt.received_on, receipt.created_at) : null
      return line ?? []
    })
  })
}

// ── 엑셀 넣기 (AC-7504.5) ───────────────────────────────────

/**
 * 엑셀 계획 넣기: 새 분류(이미 있는 이름은 뺌) → 새 물품 한 번에(지금 물품을 읽어 normalizeName이 이미 있는 이름은 건너뛰고,
 * 가장 큰 sort_order 뒤로 파일 차례) → '고침' 물품마다 바뀐 칸만 → 세기 줄이 있으면 물품을 다시 읽어 이름을 id로 바꾸고
 * today 날짜로 save_inventory_count(expiry 열쇠 없음).
 * 한 번에 묶지 않는다: 중간에 실패하면 'failed'이고, 이름으로 맞추므로(넣다 만 새 물품은 건너뜀) 같은 파일을 다시 넣으면 같은 결과가 된다
 */
export async function importItems(plan: ImportPlan, today: string): Promise<'ok' | 'failed'> {
  return attempt(async (client) => {
    if (!isRecord(plan)) return fail()
    const { newCategories, adds, updates, counts } = plan
    if (![newCategories, adds, updates, counts].every(Array.isArray)) return fail()
    const ymd = counts.length > 0 ? day(today) : null
    const categoryNames = newCategories.map((name) => text(name, CATEGORY_NAME_MAX))
    const countRows = counts.map((line) => ({ name: text(line?.name, ITEM_NAME_MAX), qty: whole(line?.qty, 0, QTY_MAX) }))

    const categoryIds = new Map<string, string>()
    const needCategories = categoryNames.length > 0 || adds.length > 0 || updates.some((update) => update?.changes?.categoryName !== undefined)
    if (needCategories) {
      const existing = await readCategories(client)
      for (const category of existing) categoryIds.set(category.name, category.id)
      const missing = [...new Set(categoryNames)].filter((name) => !categoryIds.has(name))
      if (missing.length > 0) {
        const start = existing.reduce((top, category) => Math.max(top, category.sortOrder + 1), 0)
        const data = check(await client.from(CATEGORIES).insert(missing.map((name, index) => ({ name, sort_order: start + index }))).select('id, name'))
        if (!Array.isArray(data)) return fail()
        for (const row of data) if (isRecord(row) && isId(row.id) && isId(row.name)) categoryIds.set(row.name, row.id)
      }
    }
    const categoryId = (name: unknown) => categoryIds.get(text(name, CATEGORY_NAME_MAX)) ?? fail()

    if (adds.length > 0) {
      const bodies = adds.map((add) =>
        itemBody({
          categoryId: categoryId(add?.categoryName),
          name: text(add?.name, ITEM_NAME_MAX),
          unit: text(add?.unit, UNIT_MAX),
          minQty: add.minQty ?? null,
          expiry: add.expiry ?? null,
          vendor: add.vendor ?? null,
          unitPrice: add.unitPrice ?? null,
        }),
      )
      // 지금 물품(안 쓰는 물품 포함)의 이름·차례. 이름이 이미 있는 새 물품(앞에 넣다 실패한 것 포함)은 넣지 않는다
      const existing = await readAll((first, last) => client.from(ITEMS).select('name, sort_order').order('id', ASC).range(first, last))
      const taken = new Set<string>()
      let start = 0
      for (const row of existing) {
        if (!isRecord(row) || typeof row.name !== 'string' || !isInt(row.sort_order)) return fail()
        taken.add(normalizeName(row.name))
        start = Math.max(start, row.sort_order + 1)
      }
      const fresh = bodies.filter((body) => {
        const key = normalizeName(body.name as string)
        if (taken.has(key)) return false
        taken.add(key)
        return true
      })
      if (fresh.length > 0) check(await client.from(ITEMS).insert(fresh.map((body, index) => ({ ...body, sort_order: start + index }))))
    }

    for (const update of updates) {
      if (!isRecord(update) || !isRecord(update.changes)) return fail()
      const { categoryName, unit, minQty, expiry, vendor, unitPrice } = update.changes
      const body = itemBody({
        unit,
        minQty,
        expiry,
        vendor,
        unitPrice,
        ...(categoryName !== undefined ? { categoryId: categoryId(categoryName) } : {}),
        ...(update.unhide === true ? { hidden: false } : {}),
      })
      if (Object.keys(body).length > 0) check(await client.from(ITEMS).update(body).eq('id', id(update.itemId)))
    }

    if (ymd !== null) {
      const rows = await readAll((first, last) => client.from(ITEMS).select('id, name').order('id', ASC).range(first, last))
      const exact = new Map<string, string>()
      const loose = new Map<string, string>()
      for (const row of rows) {
        if (!isRecord(row) || !isId(row.id) || !isId(row.name)) continue
        exact.set(row.name, row.id)
        if (!loose.has(normalizeName(row.name))) loose.set(normalizeName(row.name), row.id)
      }
      const lines = countRows.map(({ name, qty }) => ({ item_id: exact.get(name) ?? loose.get(normalizeName(name)) ?? fail(), qty }))
      await sendCount(client, ymd, lines)
    }
    return 'ok' as const
  })
}

// ── 비트 코드 (AC-7514.3) ───────────────────────────────────

/** stats_months에서 month와 payload->rx만(rx 모양은 bitCodeList가 본다). 달 모양이 틀린 줄은 뺀다 */
export async function listBitCodeMonths(): Promise<InvBitMonth[] | 'failed'> {
  return attempt(async (client) => {
    const rows = await readAll((first, last) => client.from(STATS_MONTHS).select('month, rx:payload->rx').order('month', ASC).range(first, last))
    return rows.flatMap((row) =>
      isRecord(row) && typeof row.month === 'string' && isMonth(row.month) ? [{ month: row.month, rx: row.rx === undefined ? null : row.rx }] : [],
    )
  })
}

/** 고른 코드를 그 분류 맨 끝에 한 번에: 이름(40자로 자름)·단위 '개'·bit_code. 겹침은 'duplicate', 고른 것이 없으면 'ok' */
export async function addBitItems(categoryId: string, picks: InvBitPick[]): Promise<'ok' | 'duplicate' | 'failed'> {
  return attempt<'ok', 'duplicate' | 'failed'>(async (client) => {
    const target = id(categoryId)
    const rows = (Array.isArray(picks) ? picks : fail()).map((pick) => ({
      category_id: target,
      name: text(typeof pick?.name === 'string' ? [...pick.name.trim()].slice(0, ITEM_NAME_MAX).join('') : null, ITEM_NAME_MAX),
      unit: BIT_ITEM_UNIT,
      bit_code: text(pick?.code, BIT_CODE_MAX),
    }))
    if (rows.length === 0) return 'ok'
    const start = await nextSortOrder(client, ITEMS, target)
    check(await client.from(ITEMS).insert(rows.map((row, index) => ({ ...row, sort_order: start + index }))), NAME_TAKEN)
    return 'ok'
  })
}
