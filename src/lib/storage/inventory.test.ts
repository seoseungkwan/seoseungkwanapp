// 재고 탭 브라우저 저장 (specs/inventory TASK-5, REQ-7504·REQ-7514 · AC-7504.1~7504.5·AC-7514.3, design.md 3절). 실제 Supabase에 붙지 않는다.
// 가짜 클라이언트가 표·DB 함수(rpc)·사진 저장소(inventory-photos)에 무엇이 어떤 차례로 나갔는지 적어 둔다.
// 표 권한·RLS·DB 함수 계산·Storage 정책은 supabase/inventory.rls.test.ts(TASK-2)가 진짜 Postgres로 본다. id·이름·숫자·그림 바이트는 모두 지어낸 값이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportPlan, InvAlias, InvItem } from '@/types/inventory'
import {
  addBitItems,
  addCategory,
  addItem,
  deleteAlias,
  deleteCategory,
  deleteReceipt,
  importItems,
  lastCountDay,
  listAliases,
  listBitCodeMonths,
  listCountLines,
  listReceiptLines,
  listReceipts,
  loadInventory,
  readPhoto,
  renameCategory,
  saveAliases,
  saveCategoryOrder,
  saveCount,
  saveOrder,
  saveReceipt,
  setOrdered,
  updateItem,
  updateReceipt,
} from './inventory'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const rawError = (code: string) => ({ code, message: `boom (${SECRET})`, details: SECRET, hint: SECRET })
const RAW_ERROR = rawError('42501')
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const

const HOSPITAL = '11111111-2222-4333-8444-555555555555'
const CAT_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const CAT_B = 'bbbbbbbb-0000-4000-8000-00000000000b'
const CAT_NEW = 'cccccccc-0000-4000-8000-0000000000ca'
const ITEM_1 = '10000000-0000-4000-8000-000000000001'
const ITEM_2 = '10000000-0000-4000-8000-000000000002'
const ITEM_3 = '10000000-0000-4000-8000-000000000003'
const NEW_ID = 'cccccccc-0000-4000-8000-00000000000c'
const RECEIPT_ID = 'dddddddd-0000-4000-8000-00000000000d'
const PHOTO_UUID = 'eeeeeeee-0000-4000-8000-00000000000e'
const PHOTO_PATH = `${HOSPITAL}/${PHOTO_UUID}.jpg`
const BUCKET = 'inventory-photos'
const TODAY = '2026-11-21'
const SAVED_AT = '2026-11-21T01:02:03.456789+00:00'
const SAVED_AT2 = '2026-11-14T01:02:03.456789+00:00'

const ITEM_COLUMNS =
  'id, category_id, name, unit, min_qty, qty, last_count_qty, last_counted_at, expiry, vendor, unit_price, bit_code, sort_order, hidden, ordered_at'
const ITEM_BODY_KEYS = ['bit_code', 'category_id', 'expiry', 'min_qty', 'name', 'sort_order', 'unit', 'unit_price', 'vendor']

// JPEG 머리(FF D8 FF)로 시작하는 가짜 그림 바이트
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const jpegBlob = (bytes: Uint8Array = JPEG) => new Blob([bytes.slice()], { type: 'image/jpeg' })

type Filter = [op: string, column: string, value: unknown, options?: unknown]
type TableCall = {
  kind: 'table'
  table: string
  op?: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  body?: unknown
  columns?: string // 읽는 칸, 또는 넣기·고치기 뒤 돌려받는 칸
  options?: unknown
  filters: Filter[]
  orders: [string, { ascending?: boolean } | undefined][]
  range?: [number, number]
  limit?: number
  single: boolean
}
type RpcCall = { kind: 'rpc'; fn: string; args?: unknown }
type StorageCall = { kind: 'storage'; bucket: string; op: 'upload' | 'download' | 'remove' | 'update'; path?: string; paths?: unknown; body?: unknown; options?: unknown }
type Call = TableCall | RpcCall | StorageCall
type Reply = { data?: unknown; error?: unknown }

/** 별일 없을 때의 답: 읽기는 빈 목록, 넣고 돌려받기는 보낸 몸통에 id를 붙여, DB 함수는 정해 둔 값, 저장소는 오류 없음 */
function okReply(call: Call): Reply {
  if (call.kind === 'rpc') {
    if (call.fn === 'my_hospital_id') return { data: HOSPITAL }
    if (call.fn === 'save_inventory_receipt') return { data: RECEIPT_ID }
    if (call.fn === 'save_inventory_count') return { data: 1 }
    return { data: null }
  }
  if (call.kind === 'storage') {
    if (call.op === 'upload') return { data: { path: call.path } }
    if (call.op === 'download') return { data: jpegBlob() }
    return { data: [] }
  }
  if (call.op === 'select') return { data: call.single ? null : [] }
  if (call.columns === undefined) return { data: null }
  if (call.single) return { data: { id: NEW_ID, ...(call.body as object) } }
  return { data: (call.body as object[]).map((row, index) => ({ id: `new-${index}`, ...row })) }
}

/** 표·함수·저장소 부름을 한 줄씩 적는 가짜 클라이언트를 브라우저 클라이언트 자리에 둔다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Call) => Reply = okReply) {
  const calls: Call[] = []
  const answer = (call: Call) =>
    Promise.resolve()
      .then(() => reply(call))
      .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null }))
  const client = {
    from(table: string) {
      const call: TableCall = { kind: 'table', table, filters: [], orders: [], single: false }
      calls.push(call)
      const builder = {
        select(columns: string) {
          call.op ??= 'select'
          call.columns = columns.replace(/\s+/g, ' ').trim()
          return builder
        },
        insert(body: unknown) {
          call.op = 'insert'
          call.body = body
          return builder
        },
        update(body: unknown) {
          call.op = 'update'
          call.body = body
          return builder
        },
        upsert(body: unknown, options?: unknown) {
          call.op = 'upsert'
          call.body = body
          call.options = options
          return builder
        },
        delete() {
          call.op = 'delete'
          return builder
        },
        eq: (column: string, value: unknown) => filter('eq', column, value),
        gte: (column: string, value: unknown) => filter('gte', column, value),
        lte: (column: string, value: unknown) => filter('lte', column, value),
        lt: (column: string, value: unknown) => filter('lt', column, value),
        gt: (column: string, value: unknown) => filter('gt', column, value),
        in: (column: string, value: unknown) => filter('in', column, value),
        or(filters: string, options?: unknown) {
          call.filters.push(['or', '', filters, options])
          return builder
        },
        order(column: string, options?: { ascending?: boolean }) {
          call.orders.push([column, options])
          return builder
        },
        range(first: number, last: number) {
          call.range = [first, last]
          return builder
        },
        limit(count: number) {
          call.limit = count
          return builder
        },
        single() {
          call.single = true
          return builder
        },
        maybeSingle() {
          call.single = true
          return builder
        },
        // 진짜 빌더처럼 await할 때 답한다
        then(ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) {
          return answer(call).then(ok, bad)
        },
      }
      function filter(op: string, column: string, value: unknown) {
        call.filters.push([op, column, value])
        return builder
      }
      return builder
    },
    rpc(fn: string, args?: unknown) {
      const call: RpcCall = { kind: 'rpc', fn, args }
      calls.push(call)
      return answer(call)
    },
    storage: {
      from(bucket: string) {
        const send = (call: StorageCall) => {
          calls.push(call)
          return answer(call)
        }
        return {
          upload: (path: string, body: unknown, options?: unknown) => send({ kind: 'storage', bucket, op: 'upload', path, body, options }),
          update: (path: string, body: unknown, options?: unknown) => send({ kind: 'storage', bucket, op: 'update', path, body, options }),
          download: (path: string) => send({ kind: 'storage', bucket, op: 'download', path }),
          remove: (paths: unknown) => send({ kind: 'storage', bucket, op: 'remove', paths }),
        }
      },
    },
  }
  supabaseBrowser.mockReturnValue(client)
  return calls
}

/** 부른 것의 차례를 짧게: 'inventory_items:insert'·'rpc:save_inventory_count'·'storage:upload' */
const stepOf = (call: Call) => (call.kind === 'table' ? `${call.table}:${call.op}` : call.kind === 'rpc' ? `rpc:${call.fn}` : `storage:${call.op}`)
const steps = (calls: Call[]) => calls.map(stepOf)
const tableCalls = (calls: Call[]) => calls.filter((call): call is TableCall => call.kind === 'table')
const rpcCalls = (calls: Call[]) => calls.filter((call): call is RpcCall => call.kind === 'rpc')
const storageCalls = (calls: Call[]) => calls.filter((call): call is StorageCall => call.kind === 'storage')

/** 한 단계('표:op'·'rpc:함수'·'storage:op')만 다르게 답한다 */
const by =
  (routes: Record<string, (call: Call) => Reply>) =>
  (call: Call): Reply =>
    routes[stepOf(call)]?.(call) ?? okReply(call)
const throwing = (): Reply => {
  throw new Error(SECRET)
}

// 오류 답·예외·클라이언트 만들기 실패(모든 부름이 같다)
const FAILURES: [string, () => void][] = [
  ['오류 답', () => fakeClient(() => ({ error: RAW_ERROR }))],
  ['오류가 값과 함께 옴', () => fakeClient((call) => ({ ...okReply(call), error: RAW_ERROR }))],
  ['보내다 예외(네트워크)', () => fakeClient(throwing)],
  [
    '클라이언트 만들기 실패',
    () =>
      supabaseBrowser.mockImplementation(() => {
        throw new Error(SECRET)
      }),
  ],
  [
    '빌더 만들기 실패(from·rpc·storage가 곧바로 던짐)',
    () =>
      supabaseBrowser.mockReturnValue({
        from: () => {
          throw new Error(SECRET)
        },
        rpc: () => {
          throw new Error(SECRET)
        },
        storage: {
          from: () => {
            throw new Error(SECRET)
          },
        },
      }),
  ],
]

// ── 읽은 줄(DB 칸 이름)과 앱 모양 ─────────────────────────────

const catRow = (id: string, name: string, sortOrder: number) => ({ id, name, sort_order: sortOrder })
const itemRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  category_id: CAT_A,
  name: `물품${id.slice(-1)}`,
  unit: '개',
  min_qty: 5,
  qty: 10,
  last_count_qty: 8,
  last_counted_at: SAVED_AT,
  expiry: '2027-03-01',
  vendor: '가짜상사',
  unit_price: 3000,
  bit_code: null,
  sort_order: 0,
  hidden: false,
  ordered_at: null,
  ...over,
})
type ItemRow = ReturnType<typeof itemRow>
const itemOf = (row: ItemRow): InvItem => ({
  id: row.id,
  categoryId: row.category_id,
  name: row.name,
  unit: row.unit,
  minQty: row.min_qty,
  qty: row.qty,
  lastCountQty: row.last_count_qty,
  lastCountedAt: row.last_counted_at,
  expiry: row.expiry,
  vendor: row.vendor,
  unitPrice: row.unit_price,
  bitCode: row.bit_code,
  sortOrder: row.sort_order,
  hidden: row.hidden,
  orderedAt: row.ordered_at,
})

const FIELDS = { categoryId: CAT_A, name: '거즈', unit: '박스', minQty: 2, expiry: '2027-08-31', vendor: '가짜상사', unitPrice: 5000, bitCode: null }

beforeEach(() => {
  supabaseBrowser.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('AC-7504.1 loadInventory 분류·물품 읽기', () => {
  const CATS = [catRow(CAT_A, '약품', 0), catRow(CAT_B, '사무·생활', 1)]

  it('AC-7504.1: 분류 3칸·물품 15칸을 sort_order 차례로 1,000줄씩 읽고(병원으로 거르지 않는다, RLS 몫) 앱 칸 이름으로 바꾼다', async () => {
    const row = itemRow(ITEM_1, {
      min_qty: null,
      last_count_qty: null,
      last_counted_at: null,
      expiry: null,
      vendor: null,
      unit_price: null,
      bit_code: 'XH0201',
      hidden: true,
      ordered_at: SAVED_AT2,
      qty: -3,
    })
    const calls = fakeClient(
      by({
        'inventory_categories:select': () => ({ data: CATS }),
        'inventory_items:select': () => ({ data: [row] }),
      }),
    )
    const result = await loadInventory()
    expect(result).toEqual({
      categories: [
        { id: CAT_A, name: '약품', sortOrder: 0 },
        { id: CAT_B, name: '사무·생활', sortOrder: 1 },
      ],
      items: [
        {
          id: ITEM_1,
          categoryId: CAT_A,
          name: '물품1',
          unit: '개',
          minQty: null,
          qty: -3,
          lastCountQty: null,
          lastCountedAt: null,
          expiry: null,
          vendor: null,
          unitPrice: null,
          bitCode: 'XH0201',
          sortOrder: 0,
          hidden: true,
          orderedAt: SAVED_AT2,
        },
      ],
    })
    expect(steps(calls)).toEqual(['inventory_categories:select', 'inventory_items:select'])
    const [cats, items] = tableCalls(calls)
    expect(cats.columns).toBe('id, name, sort_order')
    expect(cats.orders[0]).toEqual(['sort_order', { ascending: true }])
    expect(cats.range).toEqual([0, 999])
    expect(cats.filters).toEqual([])
    expect(items.columns).toBe(ITEM_COLUMNS)
    expect(items.orders[0]).toEqual(['sort_order', { ascending: true }])
    expect(items.range).toEqual([0, 999])
    expect(items.filters).toEqual([])
  })

  it('AC-7504.1: 물품은 분류 차례 → sort_order 차례로 온다(DB가 sort_order로만 준 차례를 분류로 다시 묶는다)', async () => {
    const rows = [
      itemRow(ITEM_3, { category_id: CAT_B, sort_order: 0 }),
      itemRow(ITEM_2, { category_id: CAT_A, sort_order: 2 }),
      itemRow(ITEM_1, { category_id: CAT_A, sort_order: 1 }),
    ]
    fakeClient(
      by({
        'inventory_categories:select': () => ({ data: CATS }),
        'inventory_items:select': () => ({ data: rows }),
      }),
    )
    const result = await loadInventory()
    expect(result).not.toBe('failed')
    if (result === 'failed') return
    expect(result.items.map((item) => item.id)).toEqual([ITEM_1, ITEM_2, ITEM_3])
  })

  it('AC-7504.1: 물품이 1,000줄을 넘으면 다음 쪽(1000~1999)을 이어 읽어 모두 준다', async () => {
    const page = Array.from({ length: 1000 }, (_, index) => itemRow(`p-${index}`, { name: `물품${index}`, sort_order: index }))
    const calls = fakeClient(
      by({
        'inventory_categories:select': () => ({ data: CATS }),
        'inventory_items:select': (call) => ({ data: (call as TableCall).range?.[0] === 0 ? page : [itemRow(ITEM_1, { sort_order: 1000 })] }),
      }),
    )
    const result = await loadInventory()
    expect(result).not.toBe('failed')
    if (result === 'failed') return
    expect(result.items).toHaveLength(1001)
    expect(tableCalls(calls).filter((call) => call.table === 'inventory_items').map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('AC-7504.1: 분류가 하나도 없으면 처음 넷(약품·치료 소모품·보조기·깁스·사무·생활, sort_order 0~3)을 한 번에 넣고 다시 읽는다', async () => {
    let catReads = 0
    const calls = fakeClient(
      by({
        'inventory_categories:select': () => {
          catReads += 1
          return { data: catReads === 1 ? [] : CATS }
        },
      }),
    )
    const result = await loadInventory()
    expect(steps(calls)).toEqual(['inventory_categories:select', 'inventory_categories:insert', 'inventory_categories:select', 'inventory_items:select'])
    const insert = tableCalls(calls)[1]
    expect(insert.body).toEqual([
      { name: '약품', sort_order: 0 },
      { name: '치료 소모품', sort_order: 1 },
      { name: '보조기·깁스', sort_order: 2 },
      { name: '사무·생활', sort_order: 3 },
    ])
    expect(result).toEqual({ categories: [{ id: CAT_A, name: '약품', sortOrder: 0 }, { id: CAT_B, name: '사무·생활', sortOrder: 1 }], items: [] })
  })

  it('AC-7504.1: 다른 창이 먼저 넣어 이름이 겹치면(23505) 실패가 아니라 다시 읽은 분류를 준다(두 번 생기지 않는다)', async () => {
    let catReads = 0
    fakeClient(
      by({
        'inventory_categories:select': () => {
          catReads += 1
          return { data: catReads === 1 ? [] : CATS }
        },
        'inventory_categories:insert': () => ({ error: rawError('23505') }),
      }),
    )
    const result = await loadInventory()
    expect(result).not.toBe('failed')
    if (result === 'failed') return
    expect(result.categories.map((category) => category.name)).toEqual(['약품', '사무·생활'])
  })

  it("AC-7504.1: 처음 넷 넣기가 다른 오류면 'failed'이고 물품은 읽지 않는다", async () => {
    const calls = fakeClient(by({ 'inventory_categories:insert': () => ({ error: RAW_ERROR }) }))
    await expect(loadInventory()).resolves.toBe('failed')
    expect(steps(calls)).toEqual(['inventory_categories:select', 'inventory_categories:insert'])
  })

  it('AC-7504.1: { seed: false }(대시보드)면 분류가 없어도 넣지 않고 빈 목록을 준다', async () => {
    const calls = fakeClient()
    await expect(loadInventory({ seed: false })).resolves.toEqual({ categories: [], items: [] })
    expect(steps(calls)).toEqual(['inventory_categories:select', 'inventory_items:select'])
  })

  it('AC-7504.1: 모양이 틀린 줄은 빼고 나머지는 그대로 둔다', async () => {
    const badCats = [{ id: CAT_B, name: null, sort_order: 1 }, { id: '', name: '빈 id', sort_order: 2 }, { id: CAT_NEW, name: '소수', sort_order: 1.5 }, null]
    const badItems = [
      itemRow(ITEM_2, { qty: '3' }),
      itemRow(ITEM_3, { hidden: 'no' }),
      itemRow('x-1', { expiry: '2027-13-01' }),
      itemRow('x-2', { unit: null }),
      itemRow('x-3', { min_qty: 1.5 }),
      [],
    ]
    fakeClient(
      by({
        'inventory_categories:select': () => ({ data: [catRow(CAT_A, '약품', 0), ...badCats] }),
        'inventory_items:select': () => ({ data: [itemRow(ITEM_1), ...badItems] }),
      }),
    )
    await expect(loadInventory()).resolves.toEqual({ categories: [{ id: CAT_A, name: '약품', sortOrder: 0 }], items: [itemOf(itemRow(ITEM_1))] })
  })

  it.each([
    ...FAILURES,
    ['분류 답이 목록이 아님', () => fakeClient(by({ 'inventory_categories:select': () => ({ data: { rows: [] } }) }))],
    ['물품 답이 목록이 아님(null)', () => fakeClient(by({ 'inventory_categories:select': () => ({ data: CATS }), 'inventory_items:select': () => ({ data: null }) }))],
  ] as [string, () => void][])("AC-7504.1: %s → 빈 목록이 아니라 'failed'", async (_, arrange) => {
    arrange()
    await expect(loadInventory()).resolves.toBe('failed')
  })
})

describe('AC-7504.2 분류 넣기·이름·차례·지우기', () => {
  it('AC-7504.2: addCategory는 지금 가장 큰 sort_order 다음으로 { name, sort_order } 둘만 넣고(이름 앞뒤 빈칸 뗌) 넣은 분류를 준다', async () => {
    const calls = fakeClient(by({ 'inventory_categories:select': () => ({ data: [{ sort_order: 3 }] }) }))
    await expect(addCategory('  치료 소모품 ')).resolves.toEqual({ id: NEW_ID, name: '치료 소모품', sortOrder: 4 })
    expect(steps(calls)).toEqual(['inventory_categories:select', 'inventory_categories:insert'])
    const [top, insert] = tableCalls(calls)
    expect(top).toMatchObject({ columns: 'sort_order', limit: 1 })
    expect(top.orders).toEqual([['sort_order', { ascending: false }]])
    expect(insert.body).toEqual({ name: '치료 소모품', sort_order: 4 })
    expect(insert).toMatchObject({ columns: 'id, name, sort_order', single: true })
  })

  it('AC-7504.2: 분류가 없으면 sort_order 0으로 넣는다', async () => {
    const calls = fakeClient()
    await addCategory('약품')
    expect(tableCalls(calls)[1].body).toEqual({ name: '약품', sort_order: 0 })
  })

  it.each([
    ['빈 이름', ''],
    ['빈칸뿐', '   '],
    ['21자', '가'.repeat(21)],
    ['제어 문자', '약\t품'],
    ['글이 아님', 7],
  ] as [string, unknown][])("AC-7504.2: addCategory 이름이 %s → 보내지 않고 'failed'", async (_, name) => {
    const calls = fakeClient()
    await expect(addCategory(name as string)).resolves.toBe('failed')
    expect(calls).toEqual([])
  })

  it("AC-7504.2: addCategory 이름 겹침(23505)은 'duplicate', 그 밖의 오류는 'failed'", async () => {
    fakeClient(by({ 'inventory_categories:insert': () => ({ error: rawError('23505') }) }))
    await expect(addCategory('약품')).resolves.toBe('duplicate')
    supabaseBrowser.mockReset()
    fakeClient(by({ 'inventory_categories:insert': () => ({ error: rawError('23514') }) }))
    await expect(addCategory('약품')).resolves.toBe('failed')
  })

  it("AC-7504.2: renameCategory는 그 id 줄의 name 하나만 고치고, 겹침은 'duplicate'", async () => {
    const calls = fakeClient()
    await expect(renameCategory(CAT_A, ' 주사약 ')).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['inventory_categories:update'])
    expect(tableCalls(calls)[0]).toMatchObject({ body: { name: '주사약' }, filters: [['eq', 'id', CAT_A]] })
    supabaseBrowser.mockReset()
    fakeClient(by({ 'inventory_categories:update': () => ({ error: rawError('23505') }) }))
    await expect(renameCategory(CAT_A, '사무·생활')).resolves.toBe('duplicate')
  })

  it("AC-7504.2: deleteCategory는 그 id 줄을 지우고, 물품이 있어 막히면(23503) 'in-use', 그 밖은 'failed'", async () => {
    const calls = fakeClient()
    await expect(deleteCategory(CAT_B)).resolves.toBe('ok')
    expect(tableCalls(calls)[0]).toMatchObject({ table: 'inventory_categories', op: 'delete', filters: [['eq', 'id', CAT_B]] })
    supabaseBrowser.mockReset()
    fakeClient(by({ 'inventory_categories:delete': () => ({ error: rawError('23503') }) }))
    await expect(deleteCategory(CAT_B)).resolves.toBe('in-use')
    supabaseBrowser.mockReset()
    fakeClient(by({ 'inventory_categories:delete': () => ({ error: RAW_ERROR }) }))
    await expect(deleteCategory(CAT_B)).resolves.toBe('failed')
  })

  it('AC-7504.2: saveCategoryOrder는 받은 차례대로 분류마다 sort_order 하나만(0부터) 고친다', async () => {
    const calls = fakeClient()
    await expect(saveCategoryOrder([CAT_B, CAT_A])).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['inventory_categories:update', 'inventory_categories:update'])
    expect(tableCalls(calls).map((call) => [call.body, call.filters])).toEqual([
      [{ sort_order: 0 }, [['eq', 'id', CAT_B]]],
      [{ sort_order: 1 }, [['eq', 'id', CAT_A]]],
    ])
  })

  it("AC-7504.2: saveCategoryOrder 중간 실패는 'failed'이고 뒤 분류는 보내지 않는다", async () => {
    const calls = fakeClient(by({ 'inventory_categories:update': () => ({ error: RAW_ERROR }) }))
    await expect(saveCategoryOrder([CAT_B, CAT_A])).resolves.toBe('failed')
    expect(calls).toHaveLength(1)
  })
})

describe('AC-7504.2 물품 넣기·고치기·주문함·차례', () => {
  it('AC-7504.2: addItem은 그 분류의 가장 큰 sort_order 다음으로, 넣기 칸 권한 칸만 보낸다(지금 수량을 적지 않으면 세기는 부르지 않는다)', async () => {
    const calls = fakeClient(by({ 'inventory_items:select': () => ({ data: [{ sort_order: 6 }] }) }))
    await expect(addItem(FIELDS, null, TODAY)).resolves.toEqual({ id: NEW_ID })
    expect(steps(calls)).toEqual(['inventory_items:select', 'inventory_items:insert'])
    const [top, insert] = tableCalls(calls)
    expect(top).toMatchObject({ columns: 'sort_order', limit: 1, filters: [['eq', 'category_id', CAT_A]] })
    expect(top.orders).toEqual([['sort_order', { ascending: false }]])
    expect(insert.body).toEqual({
      category_id: CAT_A,
      name: '거즈',
      unit: '박스',
      min_qty: 2,
      expiry: '2027-08-31',
      vendor: '가짜상사',
      unit_price: 5000,
      bit_code: null,
      sort_order: 7,
    })
    expect(Object.keys(insert.body as object).sort()).toEqual(ITEM_BODY_KEYS)
    expect(insert).toMatchObject({ columns: 'id', single: true })
  })

  it('AC-7504.2: 지금 수량을 적어 더하면 넣은 뒤 오늘 날짜로 save_inventory_count에 그 물품 한 줄(qty만)을 보낸다', async () => {
    const calls = fakeClient()
    await expect(addItem(FIELDS, 12, TODAY)).resolves.toEqual({ id: NEW_ID })
    expect(steps(calls)).toEqual(['inventory_items:select', 'inventory_items:insert', 'rpc:save_inventory_count'])
    expect(rpcCalls(calls)[0].args).toEqual({ p_day: TODAY, p_lines: [{ item_id: NEW_ID, qty: 12 }] })
    expect((tableCalls(calls)[1].body as Record<string, unknown>).sort_order).toBe(0)
  })

  it('AC-7504.2: 지금 수량 0도 세기로 적는다', async () => {
    const calls = fakeClient()
    await addItem(FIELDS, 0, TODAY)
    expect(rpcCalls(calls)[0].args).toEqual({ p_day: TODAY, p_lines: [{ item_id: NEW_ID, qty: 0 }] })
  })

  it('AC-7504.2: 글자는 앞뒤 빈칸을 떼고 빈 거래처는 null로 보낸다. 받은 값에 묻은 다른 칸(qty·hospital_id·id·ordered_at)은 보내지 않는다', async () => {
    const calls = fakeClient()
    const input = { ...FIELDS, name: ' 거즈 ', unit: ' 박스', vendor: '   ', qty: 99, hospital_id: 'other', id: 'other-id', ordered_at: SAVED_AT, lastCountQty: 3 }
    const before = { ...input }
    await addItem(input, null, TODAY)
    const body = tableCalls(calls)[1].body as Record<string, unknown>
    expect(body).toMatchObject({ name: '거즈', unit: '박스', vendor: null })
    expect(Object.keys(body).sort()).toEqual(ITEM_BODY_KEYS)
    expect(input).toEqual(before)
  })

  it.each([
    ['이름이 비었음', { name: ' ' }],
    ['이름 41자', { name: '가'.repeat(41) }],
    ['단위가 비었음', { unit: '' }],
    ['단위 11자', { unit: '가'.repeat(11) }],
    ['분류 id 없음', { categoryId: '' }],
    ['최소 수량이 음수', { minQty: -1 }],
    ['최소 수량이 소수', { minQty: 1.5 }],
    ['최소 수량 1,000,001', { minQty: 1_000_001 }],
    ['단가 100,000,001', { unitPrice: 100_000_001 }],
    ['기한이 없는 날', { expiry: '2027-13-01' }],
    ['거래처 41자', { vendor: '가'.repeat(41) }],
    ['이름에 제어 문자', { name: '거\n즈' }],
  ] as [string, Record<string, unknown>][])("AC-7504.2: addItem %s → 아무것도 보내지 않고 'failed'", async (_, change) => {
    const calls = fakeClient()
    await expect(addItem({ ...FIELDS, ...change } as typeof FIELDS, null, TODAY)).resolves.toBe('failed')
    expect(calls).toEqual([])
  })

  it.each([
    ['지금 수량이 음수', -1, TODAY],
    ['지금 수량이 소수', 2.5, TODAY],
    ['오늘 날짜 모양이 틀림', 3, '2026/11/21'],
  ] as [string, number, string][])("AC-7504.2: addItem %s → 아무것도 보내지 않고 'failed'", async (_, qty, today) => {
    const calls = fakeClient()
    await expect(addItem(FIELDS, qty, today)).resolves.toBe('failed')
    expect(calls).toEqual([])
  })

  it("AC-7504.2: addItem 이름·코드 겹침(23505)은 'duplicate'이고 세기는 부르지 않는다", async () => {
    const calls = fakeClient(by({ 'inventory_items:insert': () => ({ error: rawError('23505') }) }))
    await expect(addItem(FIELDS, 5, TODAY)).resolves.toBe('duplicate')
    expect(rpcCalls(calls)).toEqual([])
  })

  it.each([
    ['오류 답', () => ({ error: RAW_ERROR })],
    ['보내다 예외(네트워크)', throwing],
  ] as [string, () => Reply][])('AC-7504.2: addItem 물품은 들어갔는데 처음 수량 세기가 실패하면(%s) { id, countFailed: true }', async (_, reply) => {
    const calls = fakeClient(by({ 'rpc:save_inventory_count': reply }))
    const result = await addItem(FIELDS, 5, TODAY)
    expect(result).toEqual({ id: NEW_ID, countFailed: true })
    expect(JSON.stringify(result)).not.toContain(SECRET)
    expect(steps(calls)).toEqual(['inventory_items:select', 'inventory_items:insert', 'rpc:save_inventory_count'])
  })

  it('AC-7504.2: addItem 세기가 되면 countFailed 열쇠가 없다', async () => {
    fakeClient()
    const result = await addItem(FIELDS, 5, TODAY)
    expect(result).toEqual({ id: NEW_ID })
    expect(Object.keys(result as object)).toEqual(['id'])
  })

  it('AC-7504.2: updateItem은 받은 칸만 DB 칸 이름으로 바꿔 그 id 줄 하나를 고친다([연결 끊기]는 bit_code null, 안 씀은 hidden)', async () => {
    const calls = fakeClient()
    await expect(updateItem(ITEM_1, { name: ' 새 거즈 ', minQty: null, bitCode: null, hidden: true })).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['inventory_items:update'])
    expect(tableCalls(calls)[0]).toMatchObject({ body: { name: '새 거즈', min_qty: null, bit_code: null, hidden: true }, filters: [['eq', 'id', ITEM_1]] })
  })

  it('AC-7504.2: updateItem 모든 칸 — 분류·단위·기한·거래처·단가도 칸 권한 이름으로 간다', async () => {
    const calls = fakeClient()
    await updateItem(ITEM_2, { categoryId: CAT_B, unit: '통', expiry: null, vendor: '새상사', unitPrice: 0, hidden: false })
    expect(tableCalls(calls)[0].body).toEqual({ category_id: CAT_B, unit: '통', expiry: null, vendor: '새상사', unit_price: 0, hidden: false })
  })

  it("AC-7504.2: updateItem 바꿀 칸이 없으면 보내지 않고 'ok', 틀린 값이면 보내지 않고 'failed', 겹침은 'duplicate'", async () => {
    let calls = fakeClient()
    await expect(updateItem(ITEM_1, {})).resolves.toBe('ok')
    expect(calls).toEqual([])
    await expect(updateItem(ITEM_1, { name: '' })).resolves.toBe('failed')
    await expect(updateItem(ITEM_1, { hidden: 'yes' as unknown as boolean })).resolves.toBe('failed')
    expect(calls).toEqual([])
    supabaseBrowser.mockReset()
    calls = fakeClient(by({ 'inventory_items:update': () => ({ error: rawError('23505') }) }))
    await expect(updateItem(ITEM_1, { name: '파스' })).resolves.toBe('duplicate')
    expect(calls).toHaveLength(1)
  })

  it('AC-7504.2: setOrdered(켬)은 ordered_at = 지금 시각 하나만, (끔)은 null을 보낸다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T03:04:05.000Z'))
    const calls = fakeClient()
    await expect(setOrdered(ITEM_1, true)).resolves.toBe('ok')
    await expect(setOrdered(ITEM_1, false)).resolves.toBe('ok')
    expect(tableCalls(calls).map((call) => [call.table, call.op, call.body, call.filters])).toEqual([
      ['inventory_items', 'update', { ordered_at: '2026-11-21T03:04:05.000Z' }, [['eq', 'id', ITEM_1]]],
      ['inventory_items', 'update', { ordered_at: null }, [['eq', 'id', ITEM_1]]],
    ])
  })

  it("AC-7504.2: saveOrder는 set_inventory_order 하나에 전체 id 차례를 보낸다. 실패는 'failed'", async () => {
    const calls = fakeClient()
    await expect(saveOrder([ITEM_2, ITEM_1, ITEM_3])).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['rpc:set_inventory_order'])
    expect(rpcCalls(calls)[0].args).toEqual({ p_ids: [ITEM_2, ITEM_1, ITEM_3] })
    supabaseBrowser.mockReset()
    fakeClient(by({ 'rpc:set_inventory_order': () => ({ error: RAW_ERROR }) }))
    await expect(saveOrder([ITEM_1])).resolves.toBe('failed')
  })
})

describe('AC-7504.2 별칭 읽기·저장·지우기', () => {
  it('AC-7504.2: listAliases는 alias·item_id 두 칸을 1,000줄씩 읽어 { alias, itemId }로 준다(틀린 줄은 뺀다)', async () => {
    const calls = fakeClient(
      by({
        'inventory_aliases:select': () => ({ data: [{ alias: '멸균거즈', item_id: ITEM_1 }, { alias: null, item_id: ITEM_2 }, { alias: '파스', item_id: ITEM_2 }] }),
      }),
    )
    await expect(listAliases()).resolves.toEqual([
      { alias: '멸균거즈', itemId: ITEM_1 },
      { alias: '파스', itemId: ITEM_2 },
    ])
    expect(tableCalls(calls)[0]).toMatchObject({ table: 'inventory_aliases', columns: 'alias, item_id', range: [0, 999] })
  })

  it('AC-7504.2: saveAliases는 새 이름을 한 번에 넣고(겹치면 건너뜀), 이미 있던 이름은 item_id 하나만 고친다(칸 권한: 넣기 alias·item_id, 고치기 item_id)', async () => {
    const aliases: InvAlias[] = [
      { alias: ' 멸균거즈 ', itemId: ITEM_1 },
      { alias: '파스', itemId: ITEM_3 },
      { alias: '파스', itemId: ITEM_2 }, // 같은 이름은 뒤 것
    ]
    const calls = fakeClient(by({ 'inventory_aliases:upsert': () => ({ data: [{ alias: '멸균거즈' }] }) }))
    await expect(saveAliases(aliases)).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['inventory_aliases:upsert', 'inventory_aliases:update'])
    const [upsert, update] = tableCalls(calls)
    expect(upsert.body).toEqual([
      { alias: '멸균거즈', item_id: ITEM_1 },
      { alias: '파스', item_id: ITEM_2 },
    ])
    expect(upsert.options).toEqual({ onConflict: 'hospital_id,alias', ignoreDuplicates: true })
    expect(upsert.columns).toBe('alias')
    expect(update).toMatchObject({ body: { item_id: ITEM_2 }, filters: [['eq', 'alias', '파스']] })
  })

  it("AC-7504.2: saveAliases 보낼 것이 없으면(빈 목록·빈 이름·61자·제어 문자) 보내지 않고 'ok'", async () => {
    const calls = fakeClient()
    await expect(saveAliases([])).resolves.toBe('ok')
    await expect(
      saveAliases([
        { alias: '  ', itemId: ITEM_1 },
        { alias: '가'.repeat(61), itemId: ITEM_1 },
        { alias: '거\t즈', itemId: ITEM_1 },
        { alias: '거즈', itemId: '' },
      ]),
    ).resolves.toBe('ok')
    expect(calls).toEqual([])
  })

  it("AC-7504.2: saveAliases 넣기·고치기 오류는 'failed'", async () => {
    fakeClient(by({ 'inventory_aliases:upsert': () => ({ error: RAW_ERROR }) }))
    await expect(saveAliases([{ alias: '거즈', itemId: ITEM_1 }])).resolves.toBe('failed')
    supabaseBrowser.mockReset()
    // 이미 있던 이름이라 넣기는 건너뛰고(돌려받은 줄 없음), 고치기가 실패
    const calls = fakeClient(by({ 'inventory_aliases:upsert': () => ({ data: [] }), 'inventory_aliases:update': () => ({ error: RAW_ERROR }) }))
    await expect(saveAliases([{ alias: '거즈', itemId: ITEM_1 }])).resolves.toBe('failed')
    expect(steps(calls)).toEqual(['inventory_aliases:upsert', 'inventory_aliases:update'])
  })

  it("AC-7504.2: deleteAlias는 그 이름 줄 하나를 지운다. 오류는 'failed'", async () => {
    const calls = fakeClient()
    await expect(deleteAlias('멸균거즈')).resolves.toBe('ok')
    expect(tableCalls(calls)[0]).toMatchObject({ table: 'inventory_aliases', op: 'delete', filters: [['eq', 'alias', '멸균거즈']] })
    supabaseBrowser.mockReset()
    fakeClient(() => ({ error: RAW_ERROR }))
    await expect(deleteAlias('멸균거즈')).resolves.toBe('failed')
  })
})

describe('AC-7504.3 세기·입고 저장은 DB 함수 하나', () => {
  it("AC-7504.3: lastCountDay는 병원의 가장 늦은 세기 날짜 하나를 읽는다. 없으면 null, 실패는 'failed'", async () => {
    let calls = fakeClient(by({ 'inventory_counts:select': () => ({ data: [{ counted_on: '2026-11-14' }] }) }))
    await expect(lastCountDay()).resolves.toBe('2026-11-14')
    expect(tableCalls(calls)[0]).toMatchObject({ table: 'inventory_counts', columns: 'counted_on', limit: 1 })
    expect(tableCalls(calls)[0].orders).toEqual([['counted_on', { ascending: false }]])
    supabaseBrowser.mockReset()
    calls = fakeClient()
    await expect(lastCountDay()).resolves.toBeNull()
    supabaseBrowser.mockReset()
    fakeClient(by({ 'inventory_counts:select': () => ({ data: [{ counted_on: 'yesterday' }] }) }))
    await expect(lastCountDay()).resolves.toBe('failed')
  })

  it('AC-7504.3: saveCount는 save_inventory_count 하나에 { p_day, p_lines }를 보낸다. qty·expiry는 받은 열쇠만 보낸다', async () => {
    const calls = fakeClient()
    const result = await saveCount('2026-11-20', [
      { itemId: ITEM_1, qty: 7 },
      { itemId: ITEM_2, expiry: null },
      { itemId: ITEM_3, qty: 0, expiry: '2027-01-31' },
    ])
    expect(result).toBe('ok')
    expect(steps(calls)).toEqual(['rpc:save_inventory_count'])
    expect(rpcCalls(calls)[0].args).toEqual({
      p_day: '2026-11-20',
      p_lines: [
        { item_id: ITEM_1, qty: 7 },
        { item_id: ITEM_2, expiry: null },
        { item_id: ITEM_3, qty: 0, expiry: '2027-01-31' },
      ],
    })
  })

  it.each([
    ['날짜 모양이 틀림', '2026-11-31', [{ itemId: ITEM_1, qty: 1 }]],
    ['수가 음수', TODAY, [{ itemId: ITEM_1, qty: -1 }]],
    ['수가 1,000,001', TODAY, [{ itemId: ITEM_1, qty: 1_000_001 }]],
    ['기한 모양이 틀림', TODAY, [{ itemId: ITEM_1, expiry: '27.08' }]],
    ['물품 id 없음', TODAY, [{ itemId: '', qty: 1 }]],
  ] as [string, string, { itemId: string; qty?: number; expiry?: string }[]][])("AC-7504.3: saveCount %s → 보내지 않고 'failed'", async (_, day, lines) => {
    const calls = fakeClient()
    await expect(saveCount(day, lines)).resolves.toBe('failed')
    expect(calls).toEqual([])
  })

  it("AC-7504.3: saveCount DB 함수가 거절하면(날짜 범위·남의 물품) 'failed'", async () => {
    fakeClient(by({ 'rpc:save_inventory_count': () => ({ error: rawError('22023') }) }))
    await expect(saveCount(TODAY, [{ itemId: ITEM_1, qty: 1 }])).resolves.toBe('failed')
  })

  const LINES = [
    { itemId: ITEM_1, qty: 2, unitPrice: 3200, amount: 6400 },
    { itemId: ITEM_2, qty: 1, unitPrice: null, amount: 0 },
  ]
  const DB_LINES = [
    { item_id: ITEM_1, qty: 2, unit_price: 3200, amount: 6400 },
    { item_id: ITEM_2, qty: 1, unit_price: null, amount: 0 },
  ]

  it('AC-7504.3: 사진 없는 입고는 save_inventory_receipt 하나만 부른다(사진 자리 null, 거래처 앞뒤 빈칸 뗌)', async () => {
    const calls = fakeClient()
    await expect(saveReceipt({ day: '2026-11-20', vendor: ' 가짜상사 ', photo: null, lines: LINES })).resolves.toEqual({ id: RECEIPT_ID })
    expect(steps(calls)).toEqual(['rpc:save_inventory_receipt'])
    expect(rpcCalls(calls)[0].args).toEqual({ p_day: '2026-11-20', p_vendor: '가짜상사', p_photo_path: null, p_lines: DB_LINES })
  })

  it('AC-7504.3: 사진이 있으면 먼저 <병원 id>/<새 uuid>.jpg로 inventory-photos에 올리고 그 자리로 저장한다', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(PHOTO_UUID as `${string}-${string}-${string}-${string}-${string}`)
    const calls = fakeClient()
    const photo = jpegBlob()
    await expect(saveReceipt({ day: TODAY, vendor: null, photo, lines: LINES })).resolves.toEqual({ id: RECEIPT_ID })
    expect(steps(calls)).toEqual(['rpc:my_hospital_id', 'storage:upload', 'rpc:save_inventory_receipt'])
    const [upload] = storageCalls(calls)
    expect(upload).toMatchObject({ bucket: BUCKET, path: PHOTO_PATH, body: photo })
    expect(upload.options).toEqual({ contentType: 'image/jpeg', upsert: false })
    expect(rpcCalls(calls)[1].args).toEqual({ p_day: TODAY, p_vendor: null, p_photo_path: PHOTO_PATH, p_lines: DB_LINES })
  })

  it.each([
    ['올리기 오류 답(정책 거부·크기 넘음)', { 'storage:upload': () => ({ error: RAW_ERROR }) }, ['rpc:my_hospital_id', 'storage:upload']],
    ['올리기 예외(네트워크)', { 'storage:upload': throwing }, ['rpc:my_hospital_id', 'storage:upload']],
    ['병원 id 읽기 실패', { 'rpc:my_hospital_id': () => ({ error: RAW_ERROR }) }, ['rpc:my_hospital_id']],
    ['병원 id가 없음(원장 아님)', { 'rpc:my_hospital_id': () => ({ data: null }) }, ['rpc:my_hospital_id']],
  ] as [string, Record<string, () => Reply>, string[]][])("AC-7504.3: %s → 입고를 저장하지 않고 'failed'", async (_, routes, expected) => {
    const calls = fakeClient(by(routes))
    await expect(saveReceipt({ day: TODAY, vendor: null, photo: jpegBlob(), lines: LINES })).resolves.toBe('failed')
    expect(steps(calls)).toEqual(expected)
  })

  const tooBig = new Uint8Array(3_000_001)
  tooBig.set([0xff, 0xd8, 0xff])
  it.each([
    ['사진이 JPEG가 아님', { photo: jpegBlob(PNG) }],
    ['사진이 빈 파일', { photo: new Blob([]) }],
    ['사진이 3,000,000바이트 넘음', { photo: jpegBlob(tooBig) }],
    ['사진이 Blob이 아님', { photo: 'ffd8ff' }],
    ['날짜 모양이 틀림', { day: '20261121' }],
    ['거래처 41자', { vendor: '가'.repeat(41) }],
    ['줄이 없음', { lines: [] }],
    ['줄이 101개', { lines: Array.from({ length: 101 }, () => LINES[0]) }],
    ['수량 0', { lines: [{ ...LINES[0], qty: 0 }] }],
    ['수량 1,000,001', { lines: [{ ...LINES[0], qty: 1_000_001 }] }],
    ['단가 소수', { lines: [{ ...LINES[0], unitPrice: 1.5 }] }],
    ['금액 음수', { lines: [{ ...LINES[0], amount: -1 }] }],
    ['금액 1,000,000,001', { lines: [{ ...LINES[0], amount: 1_000_000_001 }] }],
  ] as [string, Record<string, unknown>][])("AC-7504.3: saveReceipt %s → 아무것도 보내지 않고 'failed'", async (_, change) => {
    const calls = fakeClient()
    await expect(saveReceipt({ day: TODAY, vendor: null, photo: null, lines: LINES, ...change } as Parameters<typeof saveReceipt>[0])).resolves.toBe('failed')
    expect(calls).toEqual([])
  })

  it("AC-7504.3: save_inventory_receipt가 거절하면 'failed'", async () => {
    fakeClient(by({ 'rpc:save_inventory_receipt': () => ({ error: rawError('22023') }) }))
    await expect(saveReceipt({ day: TODAY, vendor: null, photo: null, lines: LINES })).resolves.toBe('failed')
  })

  it('AC-7504.3: updateReceipt는 update_inventory_receipt 하나에 { p_id, p_day, p_vendor, p_lines }를 보내고 사진은 건드리지 않는다', async () => {
    const calls = fakeClient()
    await expect(updateReceipt(RECEIPT_ID, { day: '2026-11-19', vendor: '', lines: LINES })).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['rpc:update_inventory_receipt'])
    expect(rpcCalls(calls)[0].args).toEqual({ p_id: RECEIPT_ID, p_day: '2026-11-19', p_vendor: null, p_lines: DB_LINES })
    supabaseBrowser.mockReset()
    const none = fakeClient()
    await expect(updateReceipt(RECEIPT_ID, { day: '2026-11-19', vendor: null, lines: [] })).resolves.toBe('failed')
    expect(none).toEqual([])
    supabaseBrowser.mockReset()
    fakeClient(by({ 'rpc:update_inventory_receipt': () => ({ error: RAW_ERROR }) }))
    await expect(updateReceipt(RECEIPT_ID, { day: '2026-11-19', vendor: null, lines: LINES })).resolves.toBe('failed')
  })

  it('AC-7504.3: deleteReceipt는 delete_inventory_receipt로 지우고 돌려받은 사진 자리 파일을 inventory-photos에서 지운다', async () => {
    const calls = fakeClient(by({ 'rpc:delete_inventory_receipt': () => ({ data: PHOTO_PATH }) }))
    await expect(deleteReceipt(RECEIPT_ID)).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['rpc:delete_inventory_receipt', 'storage:remove'])
    expect(rpcCalls(calls)[0].args).toEqual({ p_id: RECEIPT_ID })
    expect(storageCalls(calls)[0]).toMatchObject({ bucket: BUCKET, paths: [PHOTO_PATH] })
  })

  it('AC-7504.3: 사진 없는 입고(null)를 지우면 저장소는 부르지 않는다', async () => {
    const calls = fakeClient()
    await expect(deleteReceipt(RECEIPT_ID)).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['rpc:delete_inventory_receipt'])
  })

  it.each([
    ['파일 지우기 오류 답', () => ({ error: RAW_ERROR })],
    ['파일 지우기 예외', throwing],
  ] as [string, () => Reply][])("AC-7504.3: %s여도 입고 지우기는 성공('ok')", async (_, reply) => {
    fakeClient(by({ 'rpc:delete_inventory_receipt': () => ({ data: PHOTO_PATH }), 'storage:remove': reply }))
    await expect(deleteReceipt(RECEIPT_ID)).resolves.toBe('ok')
  })

  it("AC-7504.3: delete_inventory_receipt가 실패하면 'failed'이고 파일은 지우지 않는다", async () => {
    const calls = fakeClient(by({ 'rpc:delete_inventory_receipt': () => ({ error: RAW_ERROR }) }))
    await expect(deleteReceipt(RECEIPT_ID)).resolves.toBe('failed')
    expect(steps(calls)).toEqual(['rpc:delete_inventory_receipt'])
  })
})

describe('AC-7504.4 달별·기록 읽기', () => {
  const RANGE = { from: '2026-09-01', to: '2026-10-31' }

  it('AC-7504.4: listCountLines는 세기 날짜가 구간 안인 세기 줄을 1,000줄씩 끝까지 읽어 { itemId, day, savedAt, qty }로 준다', async () => {
    const line = (index: number) => ({ item_id: `item-${index}`, qty: index, saved_at: SAVED_AT, inventory_counts: { counted_on: '2026-10-03' } })
    const calls = fakeClient(
      by({
        'inventory_count_lines:select': (call) =>
          ({ data: (call as TableCall).range?.[0] === 0 ? Array.from({ length: 1000 }, (_, index) => line(index)) : [line(1000), { item_id: null }] }),
      }),
    )
    const result = await listCountLines(RANGE)
    expect(result).not.toBe('failed')
    if (result === 'failed') return
    expect(result).toHaveLength(1001)
    expect(result[1000]).toEqual({ itemId: 'item-1000', day: '2026-10-03', savedAt: SAVED_AT, qty: 1000 })
    const reads = tableCalls(calls)
    expect(reads.map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(reads[0].columns).toBe('item_id, qty, saved_at, inventory_counts!inner(counted_on)')
    expect(reads[0].filters).toEqual([
      ['gte', 'inventory_counts.counted_on', '2026-09-01'],
      ['lte', 'inventory_counts.counted_on', '2026-10-31'],
    ])
    expect(reads[0].orders.map(([column]) => column)).toEqual(['count_id', 'item_id'])
  })

  it('AC-7504.4: listReceiptLines는 명세서 날짜 또는 저장 시각의 한국 날짜가 구간 안인 입고 줄을 명세서 날짜·저장 시각과 함께 준다', async () => {
    const calls = fakeClient(
      by({
        'inventory_receipt_lines:select': () => ({
          data: [
            { item_id: ITEM_1, qty: 2, unit_price: 3200, amount: 6400, inventory_receipts: { received_on: '2026-08-30', created_at: SAVED_AT2 } },
            { item_id: ITEM_2, qty: 1, unit_price: null, amount: 0, inventory_receipts: { received_on: '2026-10-31', created_at: SAVED_AT } },
            { item_id: ITEM_3, qty: 1, unit_price: null, amount: 0, inventory_receipts: null },
          ],
        }),
      }),
    )
    await expect(listReceiptLines(RANGE)).resolves.toEqual([
      { itemId: ITEM_1, day: '2026-08-30', savedAt: SAVED_AT2, qty: 2, unitPrice: 3200, amount: 6400 },
      { itemId: ITEM_2, day: '2026-10-31', savedAt: SAVED_AT, qty: 1, unitPrice: null, amount: 0 },
    ])
    const [read] = tableCalls(calls)
    expect(read.columns).toBe('item_id, qty, unit_price, amount, inventory_receipts!inner(received_on, created_at)')
    // 한국 9월 1일 0시 = UTC 8월 31일 15시, 한국 11월 1일 0시 전까지
    expect(read.filters).toEqual([
      [
        'or',
        '',
        'and(received_on.gte.2026-09-01,received_on.lte.2026-10-31),and(created_at.gte."2026-08-31T15:00:00.000Z",created_at.lt."2026-10-31T15:00:00.000Z")',
        { referencedTable: 'inventory_receipts' },
      ],
    ])
    expect(read.range).toEqual([0, 999])
    expect(read.orders.map(([column]) => column)).toEqual(['id'])
  })

  it('AC-7504.4: listReceipts는 명세서 날짜가 구간 안인 입고를 최근 날짜 먼저 줄과 함께 준다(줄마다 명세서 날짜·저장 시각)', async () => {
    const calls = fakeClient(
      by({
        'inventory_receipts:select': () => ({
          data: [
            {
              id: RECEIPT_ID,
              received_on: '2026-10-20',
              vendor: '가짜상사',
              photo_path: PHOTO_PATH,
              created_at: SAVED_AT,
              inventory_receipt_lines: [{ item_id: ITEM_1, qty: 2, unit_price: 3200, amount: 6400 }],
            },
            { id: NEW_ID, received_on: '2026-10-02', vendor: null, photo_path: null, created_at: SAVED_AT2, inventory_receipt_lines: [] },
            { id: 'bad', received_on: '2026-10-01', vendor: null, photo_path: null, created_at: SAVED_AT2, inventory_receipt_lines: null },
          ],
        }),
      }),
    )
    await expect(listReceipts(RANGE)).resolves.toEqual([
      {
        id: RECEIPT_ID,
        day: '2026-10-20',
        vendor: '가짜상사',
        photoPath: PHOTO_PATH,
        lines: [{ itemId: ITEM_1, day: '2026-10-20', savedAt: SAVED_AT, qty: 2, unitPrice: 3200, amount: 6400 }],
      },
      { id: NEW_ID, day: '2026-10-02', vendor: null, photoPath: null, lines: [] },
    ])
    const [read] = tableCalls(calls)
    expect(read.columns).toBe('id, received_on, vendor, photo_path, created_at, inventory_receipt_lines(item_id, qty, unit_price, amount)')
    expect(read.filters).toEqual([
      ['gte', 'received_on', '2026-09-01'],
      ['lte', 'received_on', '2026-10-31'],
    ])
    expect(read.orders).toEqual([
      ['received_on', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(read.range).toEqual([0, 999])
  })

  it.each([
    ['시작이 끝보다 늦음', { from: '2026-11-01', to: '2026-10-31' }],
    ['날짜 모양이 틀림', { from: '2026-9-1', to: '2026-10-31' }],
  ] as [string, { from: string; to: string }][])("AC-7504.4: 구간이 %s → 보내지 않고 'failed'", async (_, range) => {
    const calls = fakeClient()
    await expect(listCountLines(range)).resolves.toBe('failed')
    await expect(listReceiptLines(range)).resolves.toBe('failed')
    await expect(listReceipts(range)).resolves.toBe('failed')
    expect(calls).toEqual([])
  })

  it.each([
    ...FAILURES,
    ['답이 목록이 아님', () => fakeClient((call) => (call.kind === 'table' ? { data: { rows: [] } } : okReply(call)))],
  ] as [string, () => void][])("AC-7504.4: %s → 세 읽기 모두 빈 목록이 아니라 'failed'", async (_, arrange) => {
    arrange()
    await expect(listCountLines(RANGE)).resolves.toBe('failed')
    await expect(listReceiptLines(RANGE)).resolves.toBe('failed')
    await expect(listReceipts(RANGE)).resolves.toBe('failed')
  })

  it('AC-7504.4: readPhoto는 inventory-photos에서 그 자리 하나를 내려받아 Blob으로 준다', async () => {
    const calls = fakeClient()
    const photo = await readPhoto(PHOTO_PATH)
    expect(photo).toBeInstanceOf(Blob)
    expect(new Uint8Array(await (photo as Blob).arrayBuffer())).toEqual(JPEG)
    expect(steps(calls)).toEqual(['storage:download'])
    expect(storageCalls(calls)[0]).toMatchObject({ bucket: BUCKET, path: PHOTO_PATH })
  })

  it.each(['../secret.jpg', `${HOSPITAL}/${PHOTO_UUID}.png`, `${PHOTO_UUID}.jpg`, ''])('AC-7504.4: readPhoto 자리 모양이 틀리면(%s) 보내지 않고 null', async (path) => {
    const calls = fakeClient()
    await expect(readPhoto(path)).resolves.toBeNull()
    expect(calls).toEqual([])
  })

  it.each([
    ...FAILURES,
    ['답이 Blob이 아님', () => fakeClient(by({ 'storage:download': () => ({ data: 'ffd8ff' }) }))],
  ] as [string, () => void][])('AC-7504.4: readPhoto %s → null', async (_, arrange) => {
    arrange()
    await expect(readPhoto(PHOTO_PATH)).resolves.toBeNull()
  })
})

describe('AC-7504.5 importItems 엑셀 넣기', () => {
  const GAUZE = 'gggggggg-0000-4000-8000-00000000000g'
  const PLAN: ImportPlan = {
    newCategories: ['소모품', '약품'], // '약품'은 이미 있다(앞에 넣다 실패한 뒤 같은 파일을 다시 넣음)
    adds: [
      { categoryName: '소모품', name: '거즈', unit: '박스', minQty: 2, expiry: null, vendor: null, unitPrice: 5000 },
      { categoryName: '약품', name: '파스', unit: '개', minQty: null, expiry: '2027-08-31', vendor: '가짜약품', unitPrice: null },
    ],
    updates: [
      { itemId: ITEM_1, unhide: true, changes: { unit: '통', categoryName: '소모품' } },
      { itemId: ITEM_2, unhide: false, changes: { minQty: 3, expiry: '2027-01-31', vendor: '새상사', unitPrice: 1200 } },
    ],
    counts: [
      { name: '거즈', qty: 4 },
      { name: '물품1', qty: 0 },
    ],
  }
  // 넣기 전 읽기('name, sort_order' = 지금 물품 이름·차례)와 넣은 뒤 다시 읽기('id, name')
  const BEFORE_ROWS = [
    { name: '물품1', sort_order: 7 },
    { name: '물품2', sort_order: 3 },
  ]
  const itemsBy = (before: unknown[], after: unknown[]) => (call: Call) =>
    (call as TableCall).columns === 'name, sort_order' ? { data: before } : { data: after }
  const routes = {
    'inventory_categories:select': () => ({ data: [catRow(CAT_A, '약품', 0), catRow(CAT_B, '사무·생활', 1)] }),
    'inventory_categories:insert': () => ({ data: [{ id: CAT_NEW, name: '소모품' }] }),
    'inventory_items:select': itemsBy(BEFORE_ROWS, [
      { id: ITEM_1, name: '물품1' },
      { id: ITEM_2, name: '물품2' },
      { id: GAUZE, name: '거즈' },
    ]),
  }
  const ORDER = [
    'inventory_categories:select',
    'inventory_categories:insert',
    'inventory_items:select',
    'inventory_items:insert',
    'inventory_items:update',
    'inventory_items:update',
    'inventory_items:select',
    'rpc:save_inventory_count',
  ]

  it('AC-7504.5: 새 분류 → 새 물품 한 번에 → 고침 물품마다 → 세기 차례로 부르고 ok', async () => {
    const calls = fakeClient(by(routes))
    await expect(importItems(PLAN, TODAY)).resolves.toBe('ok')
    expect(steps(calls)).toEqual(ORDER)
  })

  it('AC-7504.5: 새 분류는 이미 있는 이름을 빼고 분류 끝 차례로 넣는다', async () => {
    const calls = fakeClient(by(routes))
    await importItems(PLAN, TODAY)
    const insert = tableCalls(calls)[1]
    expect(insert.body).toEqual([{ name: '소모품', sort_order: 2 }])
    expect(insert.columns).toBe('id, name')
  })

  it('AC-7504.5: 새 물품은 지금 물품(이름·차례)을 1,000줄씩 읽고 가장 큰 sort_order 뒤로 파일 차례, 분류 이름은 (새로 넣은 것 포함) 분류 id로 바꿔 넣기 칸만 보낸다', async () => {
    const calls = fakeClient(by(routes))
    await importItems(PLAN, TODAY)
    const [, , existing, insert] = tableCalls(calls)
    expect(existing).toMatchObject({ table: 'inventory_items', columns: 'name, sort_order', range: [0, 999], filters: [] })
    expect(existing.orders).toEqual([['id', { ascending: true }]])
    expect(insert.body).toEqual([
      { category_id: CAT_NEW, name: '거즈', unit: '박스', min_qty: 2, expiry: null, vendor: null, unit_price: 5000, sort_order: 8 },
      { category_id: CAT_A, name: '파스', unit: '개', min_qty: null, expiry: '2027-08-31', vendor: '가짜약품', unit_price: null, sort_order: 9 },
    ])
  })

  it('AC-7504.5: normalizeName이 이미 있는 물품(안 쓰는 물품 포함)과 같은 새 물품은 넣지 않고 건너뛰고, 나머지만 이어진 차례로 넣는다', async () => {
    const plan: ImportPlan = {
      newCategories: [],
      adds: [
        { ...PLAN.adds[1], name: 'Hot  Pack' }, // 이미 있는 'hot pack'과 같은 이름(빈칸 여럿·영문 대소문자)
        { ...PLAN.adds[1], name: '파스' },
      ],
      updates: [],
      counts: [{ name: 'Hot  Pack', qty: 3 }],
    }
    const calls = fakeClient(
      by({
        ...routes,
        'inventory_items:select': itemsBy(
          [...BEFORE_ROWS, { name: 'hot pack', sort_order: 9 }],
          [
            { id: ITEM_1, name: '물품1' },
            { id: ITEM_3, name: 'hot pack' },
            { id: GAUZE, name: '파스' },
          ],
        ),
      }),
    )
    await expect(importItems(plan, TODAY)).resolves.toBe('ok')
    const insert = tableCalls(calls).find((call) => call.op === 'insert' && call.table === 'inventory_items')
    expect(insert?.body).toEqual([
      { category_id: CAT_A, name: '파스', unit: '개', min_qty: null, expiry: '2027-08-31', vendor: '가짜약품', unit_price: null, sort_order: 10 },
    ])
    // 건너뛴 물품의 세기 줄은 이미 있던 그 물품으로 간다
    expect(rpcCalls(calls)[0].args).toEqual({ p_day: TODAY, p_lines: [{ item_id: ITEM_3, qty: 3 }] })
  })

  it('AC-7504.5: 앞에 새 물품을 넣고 실패한 뒤 같은 계획을 다시 넣으면 물품 넣기는 부르지 않고 고침·세기로 이어간다', async () => {
    const calls = fakeClient(
      by({
        ...routes,
        'inventory_categories:select': () => ({ data: [catRow(CAT_A, '약품', 0), catRow(CAT_NEW, '소모품', 2)] }),
        'inventory_items:select': itemsBy(
          [...BEFORE_ROWS, { name: '거즈', sort_order: 8 }, { name: '파스', sort_order: 9 }],
          [
            { id: ITEM_1, name: '물품1' },
            { id: GAUZE, name: '거즈' },
          ],
        ),
      }),
    )
    await expect(importItems(PLAN, TODAY)).resolves.toBe('ok')
    expect(steps(calls)).toEqual([
      'inventory_categories:select',
      'inventory_items:select',
      'inventory_items:update',
      'inventory_items:update',
      'inventory_items:select',
      'rpc:save_inventory_count',
    ])
    expect(rpcCalls(calls)[0].args).toEqual({ p_day: TODAY, p_lines: [{ item_id: GAUZE, qty: 4 }, { item_id: ITEM_1, qty: 0 }] })
  })

  it("AC-7504.5: 넣기 전 읽은 물품 줄 모양이 틀리면 넣지 않고 'failed'", async () => {
    const calls = fakeClient(by({ ...routes, 'inventory_items:select': itemsBy([{ name: '물품1' }], []) }))
    await expect(importItems(PLAN, TODAY)).resolves.toBe('failed')
    expect(steps(calls)).not.toContain('inventory_items:insert')
  })

  it("AC-7504.5: '고침' 물품은 바뀐 칸만(안 씀이면 hidden false도) 그 id 줄에 고친다", async () => {
    const calls = fakeClient(by(routes))
    await importItems(PLAN, TODAY)
    const updates = tableCalls(calls).filter((call) => call.op === 'update')
    expect(updates.map((call) => [call.body, call.filters])).toEqual([
      [{ unit: '통', category_id: CAT_NEW, hidden: false }, [['eq', 'id', ITEM_1]]],
      [{ min_qty: 3, expiry: '2027-01-31', vendor: '새상사', unit_price: 1200 }, [['eq', 'id', ITEM_2]]],
    ])
  })

  it('AC-7504.5: 세기 이름은 넣은 뒤 다시 읽어 id로 바꾸고, 오늘 날짜로 expiry 열쇠 없이 save_inventory_count를 부른다', async () => {
    const calls = fakeClient(by(routes))
    await importItems(PLAN, TODAY)
    const reread = tableCalls(calls)[6]
    expect(reread).toMatchObject({ table: 'inventory_items', columns: 'id, name', range: [0, 999] })
    expect(rpcCalls(calls)[0].args).toEqual({
      p_day: TODAY,
      p_lines: [
        { item_id: GAUZE, qty: 4 },
        { item_id: ITEM_1, qty: 0 },
      ],
    })
  })

  it('AC-7504.5: 세기 줄만 있는 계획은 물품을 다시 읽고 세기만 부른다. 빈 계획은 아무것도 보내지 않고 ok', async () => {
    let calls = fakeClient(by(routes))
    await expect(importItems({ newCategories: [], adds: [], updates: [], counts: [{ name: '물품2', qty: 9 }] }, TODAY)).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['inventory_items:select', 'rpc:save_inventory_count'])
    expect(rpcCalls(calls)[0].args).toEqual({ p_day: TODAY, p_lines: [{ item_id: ITEM_2, qty: 9 }] })
    supabaseBrowser.mockReset()
    calls = fakeClient(by(routes))
    await expect(importItems({ newCategories: [], adds: [], updates: [], counts: [] }, TODAY)).resolves.toBe('ok')
    expect(calls).toEqual([])
  })

  it.each(ORDER.map((step, index) => [step, index] as const))("AC-7504.5: %s 단계가 실패하면 'failed'이고 뒤 단계는 부르지 않는다", async (step, index) => {
    let seen = 0
    const calls = fakeClient((call) => {
      if (seen === index) {
        seen += 1
        return { error: RAW_ERROR }
      }
      seen += 1
      return by(routes)(call)
    })
    await expect(importItems(PLAN, TODAY)).resolves.toBe('failed')
    expect(steps(calls)).toEqual(ORDER.slice(0, index + 1))
    expect(stepOf(calls[index])).toBe(step)
  })

  it("AC-7504.5: 다시 읽은 물품에 세기 이름이 없으면 세기를 부르지 않고 'failed'", async () => {
    const calls = fakeClient(by({ ...routes, 'inventory_items:select': itemsBy([], [{ id: ITEM_1, name: '물품1' }]) }))
    await expect(importItems({ newCategories: [], adds: [], updates: [], counts: [{ name: '없는 물품', qty: 1 }] }, TODAY)).resolves.toBe('failed')
    expect(rpcCalls(calls)).toEqual([])
  })

  it("AC-7504.5: 새 물품의 분류 이름을 찾지 못하면 물품을 넣지 않고 'failed'", async () => {
    const calls = fakeClient(by(routes))
    const plan: ImportPlan = { newCategories: [], adds: [{ ...PLAN.adds[0], categoryName: '모르는 분류' }], updates: [], counts: [] }
    await expect(importItems(plan, TODAY)).resolves.toBe('failed')
    expect(steps(calls)).not.toContain('inventory_items:insert')
  })

  it("AC-7504.5: 세기 줄이 있는데 오늘 날짜 모양이 틀리면 아무것도 보내지 않고 'failed'", async () => {
    const calls = fakeClient(by(routes))
    await expect(importItems(PLAN, '2026-11-32')).resolves.toBe('failed')
    expect(calls).toEqual([])
  })
})

describe('AC-7514.3 비트 코드 달 읽기·물품 한 번에 넣기', () => {
  it("AC-7514.3: listBitCodeMonths는 stats_months에서 month와 payload->rx만 1,000줄씩 끝까지 읽는다", async () => {
    const rx = [{ code: 'XH0201', name: '가짜 주사', patients: 12 }]
    const calls = fakeClient(
      by({
        'stats_months:select': (call) =>
          (call as TableCall).range?.[0] === 0
            ? { data: Array.from({ length: 1000 }, (_, index) => ({ month: '2026-10', rx: index === 0 ? rx : [] })) }
            : { data: [{ month: '2026-11', rx: null }, { month: '2026-1', rx }, { month: null, rx }] },
      }),
    )
    const result = await listBitCodeMonths()
    expect(result).not.toBe('failed')
    if (result === 'failed') return
    expect(result).toHaveLength(1001)
    expect(result[0]).toEqual({ month: '2026-10', rx })
    expect(result[1000]).toEqual({ month: '2026-11', rx: null })
    const reads = tableCalls(calls)
    expect(reads[0].columns).toBe('month, rx:payload->rx')
    expect(reads[0].filters).toEqual([])
    expect(reads[0].orders.map(([column]) => column)).toEqual(['month'])
    expect(reads.map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it.each(FAILURES)("AC-7514.3: listBitCodeMonths %s → 'failed'", async (_, arrange) => {
    arrange()
    await expect(listBitCodeMonths()).resolves.toBe('failed')
  })

  it("AC-7514.3: addBitItems는 줄마다 이름·단위 '개'·bit_code로 그 분류 맨 끝에 한 번에 넣는다", async () => {
    const calls = fakeClient(by({ 'inventory_items:select': () => ({ data: [{ sort_order: 4 }] }) }))
    await expect(
      addBitItems(CAT_B, [
        { code: 'XH0201', name: '가짜 주사' },
        { code: ' ab12 ', name: `  ${'가'.repeat(45)}  ` },
      ]),
    ).resolves.toBe('ok')
    expect(steps(calls)).toEqual(['inventory_items:select', 'inventory_items:insert'])
    const [top, insert] = tableCalls(calls)
    expect(top).toMatchObject({ columns: 'sort_order', limit: 1, filters: [['eq', 'category_id', CAT_B]] })
    expect(insert.body).toEqual([
      { category_id: CAT_B, name: '가짜 주사', unit: '개', bit_code: 'XH0201', sort_order: 5 },
      { category_id: CAT_B, name: '가'.repeat(40), unit: '개', bit_code: 'ab12', sort_order: 6 },
    ])
  })

  it("AC-7514.3: addBitItems 겹침(23505)은 'duplicate', 그 밖은 'failed'", async () => {
    fakeClient(by({ 'inventory_items:insert': () => ({ error: rawError('23505') }) }))
    await expect(addBitItems(CAT_B, [{ code: 'XH0201', name: '가짜 주사' }])).resolves.toBe('duplicate')
    supabaseBrowser.mockReset()
    fakeClient(by({ 'inventory_items:insert': () => ({ error: RAW_ERROR }) }))
    await expect(addBitItems(CAT_B, [{ code: 'XH0201', name: '가짜 주사' }])).resolves.toBe('failed')
  })

  it.each([
    ['코드가 비었음', [{ code: ' ', name: '가짜 주사' }]],
    ['코드 101자', [{ code: 'A'.repeat(101), name: '가짜 주사' }]],
    ['이름이 비었음', [{ code: 'XH0201', name: '' }]],
    ['코드에 제어 문자', [{ code: 'XH\n0201', name: '가짜 주사' }]],
  ] as [string, { code: string; name: string }[]][])("AC-7514.3: addBitItems %s → 아무것도 보내지 않고 'failed'", async (_, rows) => {
    const calls = fakeClient()
    await expect(addBitItems(CAT_B, rows)).resolves.toBe('failed')
    expect(calls).toEqual([])
  })

  it("AC-7514.3: addBitItems 고른 줄이 없으면 보내지 않고 'ok'", async () => {
    const calls = fakeClient()
    await expect(addBitItems(CAT_B, [])).resolves.toBe('ok')
    expect(calls).toEqual([])
  })
})

describe('AC-7504.2 오류 내용을 밖에 내지 않는다', () => {
  const RUNS: [string, () => Promise<unknown>][] = [
    ['loadInventory', () => loadInventory()],
    ['addCategory', () => addCategory('약품')],
    ['renameCategory', () => renameCategory(CAT_A, '약품')],
    ['deleteCategory', () => deleteCategory(CAT_A)],
    ['saveCategoryOrder', () => saveCategoryOrder([CAT_A])],
    ['addItem', () => addItem(FIELDS, 3, TODAY)],
    ['updateItem', () => updateItem(ITEM_1, { name: '파스' })],
    ['setOrdered', () => setOrdered(ITEM_1, true)],
    ['saveOrder', () => saveOrder([ITEM_1])],
    ['listAliases', () => listAliases()],
    ['saveAliases', () => saveAliases([{ alias: '거즈', itemId: ITEM_1 }])],
    ['deleteAlias', () => deleteAlias('거즈')],
    ['lastCountDay', () => lastCountDay()],
    ['saveCount', () => saveCount(TODAY, [{ itemId: ITEM_1, qty: 1 }])],
    ['saveReceipt', () => saveReceipt({ day: TODAY, vendor: null, photo: jpegBlob(), lines: [{ itemId: ITEM_1, qty: 1, unitPrice: null, amount: 0 }] })],
    ['updateReceipt', () => updateReceipt(RECEIPT_ID, { day: TODAY, vendor: null, lines: [{ itemId: ITEM_1, qty: 1, unitPrice: null, amount: 0 }] })],
    ['deleteReceipt', () => deleteReceipt(RECEIPT_ID)],
    ['readPhoto', () => readPhoto(PHOTO_PATH)],
    ['listCountLines', () => listCountLines({ from: TODAY, to: TODAY })],
    ['listReceiptLines', () => listReceiptLines({ from: TODAY, to: TODAY })],
    ['listReceipts', () => listReceipts({ from: TODAY, to: TODAY })],
    ['importItems', () => importItems({ newCategories: ['소모품'], adds: [], updates: [], counts: [] }, TODAY)],
    ['listBitCodeMonths', () => listBitCodeMonths()],
    ['addBitItems', () => addBitItems(CAT_A, [{ code: 'XH0201', name: '가짜 주사' }])],
  ]

  it.each(RUNS)('AC-7504.2: %s — 실패해도 던지지 않고, 답에도 console에도 서버 오류 글이 없다', async (_, run) => {
    const spies = CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
    for (const [, arrange] of FAILURES) {
      supabaseBrowser.mockReset()
      arrange()
      const result = await run()
      expect(['failed', null]).toContain(result)
      expect(JSON.stringify(result) ?? '').not.toContain(SECRET)
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
