import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 재고 탭 표 일곱·칸 권한·DB 함수 다섯·사진 바구니 inventory-photos (inventory REQ-7501·REQ-7514, design.md 1절, TASK-2).
// clinicEmr.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL Editor에 붙일 migration 파일을 차례로
// (auth → … → 데스크 → 병원 정보 → 이 파일) 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth·storage)만 흉내 낸다. 병원·물품·거래처·메일은 모두 지어낸 것이다.
// 저장 순서 규칙(design.md 1절): 입고 저장 시각(created_at) ≤ 물품의 마지막 세기 저장 시각(last_counted_at)이면 그 세기에 들었다고 본다.
// PGlite 시계는 1/1000초 단위라, 차례가 중요한 곳은 tick()으로 잠깐 쉬어 저장 시각이 겹치지 않게 한다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
// 앞 migration: clinicEmr.rls.test.ts의 차례(auth → … → 예약 → 데스크) + 통계(stats_months·my_hospital_id()) + 병원 정보(로고 바구니 정책)
const CHAIN = [
  '20261028000000_auth.sql',
  '20261030000000_precheck_settings.sql',
  '20261101000200_stats.sql',
  '20261101000100_worklog.sql',
  '20261101000110_worklog_bit_fields.sql',
  '20261105000200_worklog_memo_font.sql',
  '20261105000300_worklog_cash_float.sql',
  '20261105000100_stats_rx_groups.sql',
  '20261112000000_stats_rx_groups_exclude.sql',
  '20261116000000_sunap.sql',
  '20261117010000_calendar.sql',
  '20261118100000_desk_accounts.sql',
  '20261119000000_clinic_profile.sql',
].map((name) => read(`./migrations/${name}`))
const INVENTORY_PATH = fileOf('./migrations/20261121100000_inventory.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const INVENTORY_MIGRATION = existsSync(INVENTORY_PATH) ? readFileSync(INVENTORY_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 다른 표·함수 이름을 설명으로 말할 수 있다)
const INVENTORY_SQL = INVENTORY_MIGRATION.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  -- Supabase는 public에 새로 만든 표·함수·순서표에 anon·authenticated 모든 권한을 준다(migration이 거둬야 한다)
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// Supabase Storage가 갖춘 것(이 파일은 버킷 줄과 정책만 더한다). foldername은 Supabase 정의와 같은 뜻
const STORAGE_MOCK = `
  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (
    id text primary key,
    name text not null,
    owner uuid,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid default auth.uid(),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    metadata jsonb,
    unique (bucket_id, name)
  );
  alter table storage.buckets enable row level security;
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on table storage.buckets, storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $$;
  -- 정책이 없는 다른 기능의 버킷(이 파일의 정책이 여기에는 아무것도 열지 않는지 보려고)
  insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
`

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장
const C = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const R = '00000000-0000-4000-8000-0000000000f1' // 거절
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음)
const STATUS: Record<string, 'approved' | 'pending' | 'rejected' | null> = {
  [A]: 'approved',
  [B]: 'approved',
  [C]: 'pending',
  [R]: 'rejected',
  [E]: null,
  [K]: null,
}
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `${user.slice(-2)}@fake.test`
// 원장이 아닌 로그인 사용자(이 파일의 표·함수에서 아무것도 못 한다)
const OUTSIDERS: [string, string][] = [
  ['A 데스크', K],
  ['승인 대기', C],
  ['거절', R],
  ['병원 없음', E],
]

type Row = Record<string, unknown>

const TABLES = [
  'inventory_categories',
  'inventory_items',
  'inventory_counts',
  'inventory_count_lines',
  'inventory_receipts',
  'inventory_receipt_lines',
  'inventory_aliases',
] as const
type Table = (typeof TABLES)[number]
const FUNCTIONS = [
  'delete_inventory_receipt(uuid)',
  'save_inventory_count(date,jsonb)',
  'save_inventory_receipt(date,text,text,jsonb)',
  'set_inventory_order(uuid[])',
  'update_inventory_receipt(uuid,date,text,jsonb)',
]
const BUCKET = 'inventory-photos'
const OTHER_BUCKET = 'other-bucket'
const PHOTO_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const OTHER_ID = '00000000-0000-4000-8000-000000000123'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// 칸 [이름, 타입, 비울 수 있음] (design.md 1절)
const COLUMNS: Record<Table, [string, string, string][]> = {
  inventory_categories: [
    ['id', 'uuid', 'NO'],
    ['hospital_id', 'uuid', 'NO'],
    ['name', 'text', 'NO'],
    ['sort_order', 'int4', 'NO'],
    ['created_at', 'timestamptz', 'NO'],
  ],
  inventory_items: [
    ['id', 'uuid', 'NO'],
    ['hospital_id', 'uuid', 'NO'],
    ['category_id', 'uuid', 'NO'],
    ['name', 'text', 'NO'],
    ['unit', 'text', 'NO'],
    ['min_qty', 'int4', 'YES'],
    ['qty', 'int4', 'NO'],
    ['last_count_qty', 'int4', 'YES'],
    ['last_counted_at', 'timestamptz', 'YES'],
    ['expiry', 'date', 'YES'],
    ['vendor', 'text', 'YES'],
    ['unit_price', 'int4', 'YES'],
    ['bit_code', 'text', 'YES'],
    ['sort_order', 'int4', 'NO'],
    ['hidden', 'bool', 'NO'],
    ['ordered_at', 'timestamptz', 'YES'],
    ['created_at', 'timestamptz', 'NO'],
  ],
  inventory_counts: [
    ['id', 'uuid', 'NO'],
    ['hospital_id', 'uuid', 'NO'],
    ['counted_on', 'date', 'NO'],
    ['created_at', 'timestamptz', 'NO'],
  ],
  inventory_count_lines: [
    ['hospital_id', 'uuid', 'NO'],
    ['count_id', 'uuid', 'NO'],
    ['item_id', 'uuid', 'NO'],
    ['qty', 'int4', 'NO'],
    ['saved_at', 'timestamptz', 'NO'],
  ],
  inventory_receipts: [
    ['id', 'uuid', 'NO'],
    ['hospital_id', 'uuid', 'NO'],
    ['received_on', 'date', 'NO'],
    ['vendor', 'text', 'YES'],
    ['photo_path', 'text', 'YES'],
    ['created_at', 'timestamptz', 'NO'],
  ],
  inventory_receipt_lines: [
    ['id', 'uuid', 'NO'],
    ['hospital_id', 'uuid', 'NO'],
    ['receipt_id', 'uuid', 'NO'],
    ['item_id', 'uuid', 'NO'],
    ['qty', 'int4', 'NO'],
    ['unit_price', 'int4', 'YES'],
    ['amount', 'int4', 'NO'],
  ],
  inventory_aliases: [
    ['hospital_id', 'uuid', 'NO'],
    ['alias', 'text', 'NO'],
    ['item_id', 'uuid', 'NO'],
    ['created_at', 'timestamptz', 'NO'],
  ],
}

// authenticated 칸 권한(넣기·고치기). 읽기는 표 전체, 그 밖은 없다. 별칭 고치기는 item_id 하나뿐이다
// (앱은 새 이름을 ON CONFLICT DO NOTHING으로 넣고, 이미 있던 이름은 item_id만 고친다)
const ITEM_INSERT = ['category_id', 'name', 'unit', 'min_qty', 'expiry', 'vendor', 'unit_price', 'bit_code', 'sort_order', 'hidden']
const WRITES: Record<Table, { insert: string[]; update: string[] }> = {
  inventory_categories: { insert: ['name', 'sort_order'], update: ['name', 'sort_order'] },
  inventory_items: { insert: ITEM_INSERT, update: [...ITEM_INSERT, 'ordered_at'] },
  inventory_counts: { insert: [], update: [] },
  inventory_count_lines: { insert: [], update: [] },
  inventory_receipts: { insert: [], update: [] },
  inventory_receipt_lines: { insert: [], update: [] },
  inventory_aliases: { insert: ['alias', 'item_id'], update: ['item_id'] },
}
// 표 단위 권한(authenticated). 넣기·고치기는 칸 단위라 여기 없다
const TABLE_GRANTS: Record<Table, string[]> = {
  inventory_categories: ['DELETE', 'SELECT'],
  inventory_items: ['SELECT'],
  inventory_counts: ['SELECT'],
  inventory_count_lines: ['SELECT'],
  inventory_receipts: ['SELECT'],
  inventory_receipt_lines: ['SELECT'],
  inventory_aliases: ['DELETE', 'SELECT'],
}
const POLICY_CMDS: Record<Table, string[]> = {
  inventory_categories: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  inventory_items: ['INSERT', 'SELECT', 'UPDATE'],
  inventory_counts: ['SELECT'],
  inventory_count_lines: ['SELECT'],
  inventory_receipts: ['SELECT'],
  inventory_receipt_lines: ['SELECT'],
  inventory_aliases: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
}

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음(칸·표·함수) 또는 원장이 아님
const NOT_OWNER = { code: '42501', message: expect.stringMatching(/not a hospital owner/) }
const BAD = { code: '22023' } // 함수 검사 어김
const CHECK = { code: '23514' }
const UNIQUE = { code: '23505' }
const FOREIGN = { code: '23503' }
const NOT_NULL = { code: '23502' }
const RLS_OR_NULL = /row-level security|null value/

let db: PGlite
let hospital: Record<string, string> = {}
type Shape = Awaited<ReturnType<typeof shapeOf>>
let before: Shape // 이 파일을 돌리기 전
let after: Shape // 돌린 뒤

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

/** 한국 오늘(YYYY-MM-DD)에서 shift날 옮긴 날 */
function seoulDay(shift = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )
  const day = new Date(`${today}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + shift)
  return day.toISOString().slice(0, 10)
}

async function operator() {
  await db.exec('reset role; reset request.jwt.claims; reset timezone')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email) */
async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Row>(sql, params)).rows
}

/** 그 사용자로 한 문장 */
async function as(user: string, sql: string, params: unknown[] = []) {
  await become(user)
  return rows(sql, params)
}

async function affected(user: string, sql: string, params: unknown[] = []) {
  await become(user)
  return (await db.query(sql, params)).affectedRows
}

/** 사용자·병원·데스크 줄을 넣는다(운영자) */
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade') // 병원·데스크·재고 줄도 같이 비워진다
  await db.exec('truncate storage.objects')
  hospital = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    if (status === null) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, $2, '홍길동', $3, $4) returning id`,
      [user, `가짜병원${user.slice(-2)}`, emailOf(user), status],
    )
    hospital[user] = row.id as string
  }
  await db.query(`insert into public.hospital_members (hospital_id, email) values ($1, $2)`, [hospital[A], emailOf(K)])
}

function insertInto(table: string, row: Row, suffix = '') {
  const columns = Object.keys(row)
  return rows(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ${suffix}`,
    columns.map((column) => row[column]),
  )
}

/** 운영자가 줄 하나를 넣고 id(또는 넣은 줄)를 돌려준다(칸 권한·RLS를 건너뛴다) */
async function seedRow(table: Table, row: Row) {
  await operator()
  const [added] = await insertInto(`public.${table}`, row, 'returning *')
  return added
}

async function seedCategory(owner: string, name = '약품', sortOrder = 0) {
  return (await seedRow('inventory_categories', { hospital_id: hospital[owner], name, sort_order: sortOrder })).id as string
}

async function seedItem(owner: string, categoryId: string, values: Row = {}) {
  return (await seedRow('inventory_items', { hospital_id: hospital[owner], category_id: categoryId, name: '가짜 거즈', unit: '개', ...values }))
    .id as string
}

/** 일곱 표에 한 줄씩(물품은 둘): 운영자가 넣는다 */
async function seedAll(owner: string) {
  const h = hospital[owner]
  const cat = await seedCategory(owner)
  const item = await seedItem(owner, cat)
  const item2 = await seedItem(owner, cat, { name: '가짜 솜' })
  const count = (await seedRow('inventory_counts', { hospital_id: h, counted_on: '2026-11-01' })).id as string
  await seedRow('inventory_count_lines', { hospital_id: h, count_id: count, item_id: item, qty: 5 })
  const receipt = (await seedRow('inventory_receipts', { hospital_id: h, received_on: '2026-11-02', vendor: '가짜상사' })).id as string
  const line = (await seedRow('inventory_receipt_lines', { hospital_id: h, receipt_id: receipt, item_id: item, qty: 10, unit_price: 100, amount: 1000 }))
    .id as string
  await seedRow('inventory_aliases', { hospital_id: h, alias: '가짜 거즈 10매', item_id: item })
  return { cat, item, item2, count, receipt, line }
}
type Ids = Awaited<ReturnType<typeof seedAll>>

/** 운영자 눈으로 본 일곱 표 전체와 사진 파일(바뀌지 않았는지 견줄 때) */
async function dump() {
  await operator()
  const out: Record<string, Row[]> = {}
  for (const table of TABLES) out[table] = await rows(`select * from public.${table} order by 1, 2, 3`)
  out.objects = await rows(`select bucket_id, name from storage.objects order by 1, 2`)
  return out
}

/** 운영자 눈으로 본 물품 한 줄 */
async function itemNow(id: string) {
  await operator()
  const [row] = await rows(
    `select qty, last_count_qty, last_counted_at, expiry::text as expiry, vendor, unit_price, ordered_at, sort_order, hidden
       from public.inventory_items where id = $1`,
    [id],
  )
  return row
}

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value))

const saveCount = async (user: string, day: string | null, lines: unknown) =>
  (await as(user, `select public.save_inventory_count($1::date, $2::jsonb) as n`, [day, json(lines)]))[0].n

const saveReceipt = async (user: string, day: string | null, vendor: string | null, photo: string | null, lines: unknown) =>
  (await as(user, `select public.save_inventory_receipt($1::date, $2::text, $3::text, $4::jsonb) as id`, [day, vendor, photo, json(lines)]))[0]
    .id as string

const updateReceipt = (user: string, id: string, day: string | null, vendor: string | null, lines: unknown) =>
  as(user, `select public.update_inventory_receipt($1::uuid, $2::date, $3::text, $4::jsonb)`, [id, day, vendor, json(lines)])

const deleteReceipt = async (user: string, id: string) =>
  (await as(user, `select public.delete_inventory_receipt($1::uuid) as path`, [id]))[0].path as string | null

const setOrder = (user: string, ids: string[]) => as(user, `select public.set_inventory_order($1::uuid[])`, [`{${ids.join(',')}}`])

const line = (itemId: string, qty: number, amount = qty * 100, unitPrice: number | null = null) => ({
  item_id: itemId,
  qty,
  unit_price: unitPrice,
  amount,
})

/** 운영자 눈으로 본 입고 한 건과 줄(줄은 물품·수량·단가·금액) */
async function receiptNow(id: string) {
  await operator()
  const head = await rows(`select received_on::text as day, vendor, photo_path, created_at from public.inventory_receipts where id = $1`, [id])
  const lines = await rows(
    `select item_id, qty, unit_price, amount from public.inventory_receipt_lines where receipt_id = $1 order by item_id, qty`,
    [id],
  )
  return { head: head[0] ?? null, lines }
}

// PostgREST insert·upsert와 같은 모양: json 줄을 표 모양으로 풀어 보낸 칸만 넣고, upsert는 겹치면 보낸 칸만 SET에 쓴다(hospital_id는 보내지 않는다).
// ignore = upsert의 ignoreDuplicates(겹치면 ON CONFLICT DO NOTHING으로 건너뜀, 고치기 권한이 필요 없다)
function postgrestInsert(table: string, body: Row[], conflict: string | null = null, ignore = false) {
  const columns = Object.keys(body[0] ?? {})
  const list = columns.join(', ')
  const onConflict =
    conflict === null
      ? ''
      : ignore
        ? `on conflict (${conflict}) do nothing`
        : `on conflict (${conflict}) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}`
  return db.query(`insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json) ${onConflict}`, [
    JSON.stringify(body),
  ])
}

// 이 파일이 손댈 수 있는 것 전부: public 표의 칸·제약·권한(표·칸)·트리거·색인, 모든 정책, public 함수, 버킷
async function shapeOf(target: PGlite) {
  await target.exec('reset role; reset request.jwt.claims')
  const q = async (sql: string) => (await target.query<Row>(sql)).rows
  return {
    columns: await q(
      `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' order by 1, ordinal_position`,
    ),
    constraints: await q(
      `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
       where connamespace = 'public'::regnamespace order by 1, 2`,
    ),
    access: await q(
      `select c.relname, c.relrowsecurity, (select array_agg(item::text order by item::text) from unnest(c.relacl) item) as acl,
              (select array_agg(a.attname || ':' || coalesce(a.attacl::text, '') order by a.attnum) from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v') order by 1`,
    ),
    indexes: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
    policies: await q(
      `select schemaname, tablename, policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies order by 1, 2, 3`,
    ),
    triggers: await q(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal order by 1, 2`,
    ),
    functions: await q(
      `select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, p.prosecdef as definer, p.proconfig as config,
              (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`,
    ),
    buckets: await q(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by 1`),
  }
}

const isOurs = (name: unknown) => (TABLES as readonly string[]).includes(String(name))
const isOurStoragePolicy = (policy: Row) =>
  policy.schemaname === 'storage' && `${policy.qual ?? ''} ${policy.with_check ?? ''}`.includes(`'${BUCKET}'`)

/** 이 파일이 더한 것(재고 표 일곱·함수 다섯·사진 바구니와 그 정책)을 뺀 모양 */
function withoutInventory(shape: Shape): Shape {
  return {
    columns: shape.columns.filter((c) => !isOurs(c.table_name)),
    constraints: shape.constraints.filter((c) => !isOurs(c.tbl)),
    access: shape.access.filter((t) => !isOurs(t.relname)),
    indexes: shape.indexes.filter((i) => !isOurs(i.tablename)),
    policies: shape.policies.filter((p) => !(p.schemaname === 'public' && isOurs(p.tablename)) && !isOurStoragePolicy(p)),
    triggers: shape.triggers.filter((t) => !isOurs(t.tbl)),
    functions: shape.functions.filter((f) => !FUNCTIONS.includes(String(f.fn))),
    buckets: shape.buckets.filter((b) => b.id !== BUCKET),
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(STORAGE_MOCK)
  for (const sql of CHAIN) await db.exec(sql)
  before = await shapeOf(db)
  await db.exec(INVENTORY_MIGRATION)
  after = await shapeOf(db)
}, 240_000)

afterAll(async () => {
  await db.close()
})

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(resetData)

describe('AC-7501.1 파일', SLOW, () => {
  it('AC-7501.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·먼저 들어갈 파일·두 번 붙여도 된다는 말·사이트보다 먼저·바구니 Private 확인이 있다', () => {
    expect(INVENTORY_MIGRATION).not.toBe('')
    expect(INVENTORY_MIGRATION).not.toContain('\r')
    const lines = INVENTORY_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((text) => !/^(--|\s*$)/.test(text))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toMatch(/먼저[^\n]*20261028000000_auth\.sql/)
    expect(head).toContain('20261101000200_stats.sql')
    expect(head).toContain('my_hospital_id()는 여기서 다시 만들지 않는다')
    expect(head).toMatch(/두 번 붙여 넣어도/)
    expect(head).toContain('그다음 사이트에 올린다')
    expect(head).toMatch(/inventory-photos[^\n]*Private/)
    expect(head).toContain('REQ-7501')
    expect(head).toContain('ADR-034')
  })

  it('AC-7501.1: 표는 create table if not exists로 일곱, 함수는 create or replace로 다섯(my_hospital_id()는 만들지 않음)이다', () => {
    expect([...INVENTORY_SQL.matchAll(/create table\s+(if not exists\s+)?(\S+)/gi)].map((m) => [m[1]?.trim(), m[2]])).toEqual(
      TABLES.map((table) => ['if not exists', `public.${table}`]),
    )
    expect([...INVENTORY_SQL.matchAll(/create\s+(or replace\s+)?function\s+(\S+?)\(/gi)].map((m) => [m[1]?.trim(), m[2]]).sort()).toEqual(
      FUNCTIONS.map((fn) => ['or replace', `public.${fn.slice(0, fn.indexOf('('))}`]).sort(),
    )
    expect(INVENTORY_SQL).not.toMatch(/function\s+public\.my_hospital_id\s*\(\s*\)\s*returns/i)
    expect(INVENTORY_SQL).not.toMatch(/create\s+(unique\s+)?index\s+(?!if not exists)/i)
  })

  it('AC-7501.1: 정책은 모두 지우고(drop policy if exists) 다시 만들고, 버킷은 on conflict로 이 파일 값이 된다', () => {
    const creates = [...INVENTORY_SQL.matchAll(/create policy ("[^"]+") on (\S+)/gi)]
    expect(creates).toHaveLength(Object.values(POLICY_CMDS).flat().length + 3)
    for (const [, policy, on] of creates) {
      const drop = INVENTORY_SQL.indexOf(`drop policy if exists ${policy} on ${on};`)
      expect(drop, `${policy} on ${on}`).toBeGreaterThanOrEqual(0)
      expect(drop).toBeLessThan(INVENTORY_SQL.indexOf(`create policy ${policy} on ${on}`))
    }
    expect(INVENTORY_SQL).toMatch(/insert into storage\.buckets[^;]+on conflict \(id\) do update/)
  })

  it('AC-7501.1: 지우는 문장은 정책 다시 만들기뿐이고(표·함수·색인·버킷을 지우거나 비우지 않는다), 고치는 표는 이 파일의 일곱뿐이다', () => {
    expect(INVENTORY_SQL).not.toMatch(/\b(drop\s+(table|function|schema|index|trigger|bucket|column|constraint)|truncate)\b/i)
    expect(new Set([...INVENTORY_SQL.matchAll(/\bdrop\s+(\w+)/gi)].map((m) => m[1].toLowerCase()))).toEqual(new Set(['policy']))
    expect(INVENTORY_SQL).not.toMatch(/drop policy (?!if exists)/i)
    const altered = [...INVENTORY_SQL.matchAll(/^\s*alter table\s+(\S+)/gim)].map((m) => m[1])
    expect(new Set(altered)).toEqual(new Set(TABLES.map((table) => `public.${table}`)))
    expect(INVENTORY_SQL).not.toMatch(/alter table\s+storage\./i)
  })

  it.each<[string, string]>([
    ...TABLES.map((table): [string, string] => ['table', `public.${table}`]),
    ['function', 'public.save_inventory_count(date, jsonb)'],
    ['function', 'public.save_inventory_receipt(date, text, text, jsonb)'],
    ['function', 'public.update_inventory_receipt(uuid, date, text, jsonb)'],
    ['function', 'public.delete_inventory_receipt(uuid)'],
    ['function', 'public.set_inventory_order(uuid[])'],
  ])('AC-7501.2: %s %s 권한은 revoke all … from public, anon, authenticated 뒤에만 준다', (kind, name) => {
    const revoke = INVENTORY_SQL.indexOf(`revoke all on ${kind} ${name} from public, anon, authenticated;`)
    expect(revoke).toBeGreaterThanOrEqual(0)
    const escaped = name.replace(/[.()[\]]/g, (c) => `\\${c}`)
    const grants = [...INVENTORY_SQL.matchAll(new RegExp(`^grant [^;]+ on ${kind} ${escaped} to [^;]+;`, 'gm'))]
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.index).toBeGreaterThan(revoke)
    for (const grant of grants) expect(grant[0]).toMatch(/ to authenticated;$/)
  })

  it('AC-7501.2: 데스크 정책·데스크 함수를 쓰지 않는다', () => {
    expect(INVENTORY_SQL).not.toMatch(/my_desk_hospital_id|my_clinic_hospital_id|my_desk\(/)
    expect(INVENTORY_SQL).not.toMatch(/데스크/)
  })
})

describe('AC-7501.1 표 일곱의 칸·열쇠·제약', SLOW, () => {
  it.each(TABLES)('AC-7501.1: %s의 칸·타입·비울 수 있음이 design.md 1절 그대로다', async (table) => {
    const columns = await rows(
      `select column_name, udt_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table],
    )
    expect(columns.map((c) => [c.column_name, c.udt_name, c.is_nullable])).toEqual(COLUMNS[table])
  })

  it.each(TABLES)('AC-7501.1: %s의 hospital_id 기본값은 my_hospital_id()이고 병원 표를 가리킨다(병원을 지우면 함께 지워짐)', async (table) => {
    expect(
      await rows(
        `select column_default from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'hospital_id'`,
        [table],
      ),
    ).toEqual([{ column_default: 'my_hospital_id()' }])
    const keys = await rows(`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = to_regclass($1) and contype = 'f'`, [
      `public.${table}`,
    ])
    expect(keys.map((k) => k.def)).toContain('FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE')
  })

  it('AC-7501.1: 기본값 — id는 gen_random_uuid(), 수량 0·안 씀 false·차례 0, 시각은 now()', async () => {
    const found = await rows(
      `select table_name, column_name, column_default from information_schema.columns
       where table_schema = 'public' and table_name like 'inventory\\_%' and column_name <> 'hospital_id' and column_default is not null
       order by 1, 2`,
    )
    expect(found.map((c) => [c.table_name, c.column_name, c.column_default])).toEqual(
      [
        ['inventory_aliases', 'created_at', 'now()'],
        ['inventory_categories', 'created_at', 'now()'],
        ['inventory_categories', 'id', 'gen_random_uuid()'],
        ['inventory_categories', 'sort_order', '0'],
        ['inventory_count_lines', 'saved_at', 'now()'],
        ['inventory_counts', 'created_at', 'now()'],
        ['inventory_counts', 'id', 'gen_random_uuid()'],
        ['inventory_items', 'created_at', 'now()'],
        ['inventory_items', 'hidden', 'false'],
        ['inventory_items', 'id', 'gen_random_uuid()'],
        ['inventory_items', 'qty', '0'],
        ['inventory_items', 'sort_order', '0'],
        ['inventory_receipt_lines', 'id', 'gen_random_uuid()'],
        ['inventory_receipts', 'created_at', 'now()'],
        ['inventory_receipts', 'id', 'gen_random_uuid()'],
      ].sort(),
    )
  })

  it('AC-7501.1: 기본 키·하나뿐 제약 — 분류·물품 이름, 세기 날짜, 세기 줄(세기·물품), 별칭(병원·별칭)', async () => {
    const keys = await rows(
      `select conrelid::regclass::text as tbl, pg_get_constraintdef(oid) as def from pg_constraint
       where connamespace = 'public'::regnamespace and contype in ('p', 'u') and conrelid::regclass::text like 'inventory\\_%' order by 1, 2`,
    )
    expect(keys.map((k) => [k.tbl, k.def])).toEqual(
      [
        ['inventory_aliases', 'PRIMARY KEY (hospital_id, alias)'],
        ['inventory_categories', 'PRIMARY KEY (id)'],
        ['inventory_categories', 'UNIQUE (hospital_id, id)'],
        ['inventory_categories', 'UNIQUE (hospital_id, name)'],
        ['inventory_count_lines', 'PRIMARY KEY (count_id, item_id)'],
        ['inventory_counts', 'PRIMARY KEY (id)'],
        ['inventory_counts', 'UNIQUE (hospital_id, counted_on)'],
        ['inventory_counts', 'UNIQUE (hospital_id, id)'],
        ['inventory_items', 'PRIMARY KEY (id)'],
        ['inventory_items', 'UNIQUE (hospital_id, id)'],
        ['inventory_items', 'UNIQUE (hospital_id, name)'],
        ['inventory_receipt_lines', 'PRIMARY KEY (id)'],
        ['inventory_receipts', 'PRIMARY KEY (id)'],
        ['inventory_receipts', 'UNIQUE (hospital_id, id)'],
      ].sort(),
    )
  })

  it('AC-7501.1: 같은 병원 안 바깥 열쇠 — 물품→분류(지우기 막음), 세기 줄→세기(함께 지움)·물품, 입고 줄→입고(함께 지움)·물품, 별칭→물품', async () => {
    const keys = await rows(
      `select conrelid::regclass::text as tbl, pg_get_constraintdef(oid) as def from pg_constraint
       where connamespace = 'public'::regnamespace and contype = 'f' and conrelid::regclass::text like 'inventory\\_%'
         and pg_get_constraintdef(oid) not like 'FOREIGN KEY (hospital_id) REFERENCES hospitals%' order by 1, 2`,
    )
    expect(keys.map((k) => [k.tbl, k.def])).toEqual(
      [
        ['inventory_aliases', 'FOREIGN KEY (hospital_id, item_id) REFERENCES inventory_items(hospital_id, id)'],
        ['inventory_count_lines', 'FOREIGN KEY (hospital_id, count_id) REFERENCES inventory_counts(hospital_id, id) ON DELETE CASCADE'],
        ['inventory_count_lines', 'FOREIGN KEY (hospital_id, item_id) REFERENCES inventory_items(hospital_id, id)'],
        ['inventory_items', 'FOREIGN KEY (hospital_id, category_id) REFERENCES inventory_categories(hospital_id, id)'],
        ['inventory_receipt_lines', 'FOREIGN KEY (hospital_id, item_id) REFERENCES inventory_items(hospital_id, id)'],
        ['inventory_receipt_lines', 'FOREIGN KEY (hospital_id, receipt_id) REFERENCES inventory_receipts(hospital_id, id) ON DELETE CASCADE'],
      ].sort(),
    )
  })

  it('AC-7501.1·AC-7514.2: 물품 비트 코드는 병원 안에서 upper(bit_code)로 하나(비어 있는 줄은 빼고)인 색인이다', async () => {
    const found = await rows(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'inventory_items' and indexdef ~ 'bit_code'`)
    expect(found).toHaveLength(1)
    expect(found[0].indexdef).toMatch(/^CREATE UNIQUE INDEX \S+ ON public\.inventory_items USING btree \(hospital_id, upper\(bit_code\)\) WHERE \(bit_code IS NOT NULL\)$/)
  })

  it('AC-7501.1: 병원 줄을 지우면(운영자) 그 병원 재고 줄은 일곱 표 모두 지워지고 다른 병원 줄은 그대로다', async () => {
    await seedAll(A)
    await seedAll(B)
    await operator()
    await rows('delete from public.hospitals where id = $1', [hospital[A]])
    for (const table of TABLES) {
      expect([table, await rows(`select distinct hospital_id from public.${table}`)]).toEqual([table, [{ hospital_id: hospital[B] }]])
    }
  })
})

describe('AC-7501.1 하나뿐·같은 병원 제약', SLOW, () => {
  let a: Ids
  let b: Ids
  beforeEach(async () => {
    a = await seedAll(A)
    b = await seedAll(B)
  })

  it('AC-7501.1: 분류 이름은 병원 안에서 하나다(다른 병원은 같은 이름 됨)', async () => {
    await become(A)
    await expect(postgrestInsert('public.inventory_categories', [{ name: '약품', sort_order: 1 }])).rejects.toMatchObject(UNIQUE)
    await become(A)
    await postgrestInsert('public.inventory_categories', [{ name: '사무·생활', sort_order: 1 }])
    await become(B)
    await postgrestInsert('public.inventory_categories', [{ name: '사무·생활', sort_order: 1 }])
    await operator()
    expect(await rows(`select count(*)::int as n from public.inventory_categories where name = '사무·생활'`)).toEqual([{ n: 2 }])
  })

  it('AC-7501.1: 물품 이름은 병원 안에서 하나다(안 쓰는 물품 포함, 다른 병원은 됨)', async () => {
    await operator()
    await rows(`update public.inventory_items set hidden = true where id = $1`, [a.item2])
    await become(A)
    for (const name of ['가짜 거즈', '가짜 솜']) {
      await expect(postgrestInsert('public.inventory_items', [{ category_id: a.cat, name, unit: '개' }])).rejects.toMatchObject(UNIQUE)
      await become(A)
    }
    await postgrestInsert('public.inventory_items', [{ category_id: a.cat, name: '가짜 붕대', unit: '롤' }])
    await become(B)
    await postgrestInsert('public.inventory_items', [{ category_id: b.cat, name: '가짜 붕대', unit: '롤' }])
  })

  it('AC-7514.2: 비트 코드는 병원 안에서 대소문자 없이 하나다(비어도 됨, 다른 병원은 같은 코드 됨)', async () => {
    await become(A)
    expect(await affected(A, `update public.inventory_items set bit_code = 'XH0201' where id = $1`, [a.item])).toBe(1)
    for (const code of ['XH0201', 'xh0201', 'Xh0201']) {
      await become(A)
      await expect(rows(`update public.inventory_items set bit_code = $1 where id = $2`, [code, a.item2])).rejects.toMatchObject(UNIQUE)
    }
    await become(A)
    await postgrestInsert('public.inventory_items', [{ category_id: a.cat, name: '가짜 붕대', unit: '롤', bit_code: null }])
    await become(A)
    await postgrestInsert('public.inventory_items', [{ category_id: a.cat, name: '가짜 테이프', unit: '롤', bit_code: null }])
    expect(await affected(B, `update public.inventory_items set bit_code = 'xh0201' where id = $1`, [b.item])).toBe(1)
    await operator()
    expect(await rows(`select bit_code from public.inventory_items where bit_code is not null order by bit_code`)).toEqual([
      { bit_code: 'XH0201' },
      { bit_code: 'xh0201' },
    ])
  })

  it('AC-7501.1: 세기는 병원·날짜마다 하나다', async () => {
    await expect(seedRow('inventory_counts', { hospital_id: hospital[A], counted_on: '2026-11-01' })).rejects.toMatchObject(UNIQUE)
    await seedRow('inventory_counts', { hospital_id: hospital[A], counted_on: '2026-11-08' })
    await expect(seedRow('inventory_count_lines', { hospital_id: hospital[A], count_id: a.count, item_id: a.item, qty: 1 })).rejects.toMatchObject(
      UNIQUE,
    )
  })

  it('AC-7501.1: 별칭은 병원 안에서 하나다(다른 병원은 됨)', async () => {
    await become(A)
    await expect(postgrestInsert('public.inventory_aliases', [{ alias: '가짜 거즈 10매', item_id: a.item2 }])).rejects.toMatchObject(UNIQUE)
    await become(B)
    await postgrestInsert('public.inventory_aliases', [{ alias: '가짜 솜 묶음', item_id: b.item2 }])
    await become(A)
    await postgrestInsert('public.inventory_aliases', [{ alias: '가짜 솜 묶음', item_id: a.item2 }])
  })

  it('AC-7501.1: 다른 병원의 분류를 가리키는 물품은 넣기·고치기 모두 거절이다(23503)', async () => {
    await become(A)
    await expect(postgrestInsert('public.inventory_items', [{ category_id: b.cat, name: '가짜 붕대', unit: '롤' }])).rejects.toMatchObject(FOREIGN)
    await become(A)
    await expect(rows(`update public.inventory_items set category_id = $1 where id = $2`, [b.cat, a.item])).rejects.toMatchObject(FOREIGN)
    await become(A)
    await expect(postgrestInsert('public.inventory_items', [{ category_id: OTHER_ID, name: '가짜 붕대', unit: '롤' }])).rejects.toMatchObject(
      FOREIGN,
    )
  })

  it('AC-7501.1: 다른 병원의 물품·세기·입고를 가리키는 세기 줄·입고 줄·별칭은 거절이다(운영자가 넣어도)', async () => {
    const h = hospital[A]
    for (const [table, row] of [
      ['inventory_count_lines', { hospital_id: h, count_id: a.count, item_id: b.item2, qty: 1 }],
      ['inventory_count_lines', { hospital_id: h, count_id: b.count, item_id: a.item2, qty: 1 }],
      ['inventory_receipt_lines', { hospital_id: h, receipt_id: a.receipt, item_id: b.item, qty: 1, amount: 0 }],
      ['inventory_receipt_lines', { hospital_id: h, receipt_id: b.receipt, item_id: a.item, qty: 1, amount: 0 }],
      ['inventory_aliases', { hospital_id: h, alias: '남의 물품', item_id: b.item }],
      ['inventory_items', { hospital_id: h, category_id: b.cat, name: '남의 분류', unit: '개' }],
    ] as [Table, Row][]) {
      await expect(seedRow(table, row), table).rejects.toMatchObject(FOREIGN)
    }
    await become(A)
    await expect(postgrestInsert('public.inventory_aliases', [{ alias: '남의 물품', item_id: b.item }])).rejects.toMatchObject(FOREIGN)
  })

  it('AC-7501.1: 물품이 있는 분류는 지워지지 않고(안 쓰는 물품만 있어도) 빈 분류는 지워진다', async () => {
    await operator()
    await rows(`update public.inventory_items set hidden = true where category_id = $1`, [a.cat])
    await become(A)
    await expect(rows(`delete from public.inventory_categories where id = $1`, [a.cat])).rejects.toMatchObject(FOREIGN)
    const empty = await seedCategory(A, '사무·생활', 1)
    expect(await affected(A, `delete from public.inventory_categories where id = $1`, [empty])).toBe(1)
    await operator()
    expect(await rows(`select id from public.inventory_categories where hospital_id = $1`, [hospital[A]])).toEqual([{ id: a.cat }])
  })

  it('AC-7501.1: 세기·입고를 지우면(운영자) 그 줄도 함께 지워진다', async () => {
    await operator()
    await rows(`delete from public.inventory_counts where id = $1`, [a.count])
    await rows(`delete from public.inventory_receipts where id = $1`, [a.receipt])
    expect(await rows(`select hospital_id from public.inventory_count_lines`)).toEqual([{ hospital_id: hospital[B] }])
    expect(await rows(`select hospital_id from public.inventory_receipt_lines`)).toEqual([{ hospital_id: hospital[B] }])
  })
})

describe('AC-7501.1 칸 범위', SLOW, () => {
  let ids: Ids
  let h: string
  beforeEach(async () => {
    ids = await seedAll(A)
    h = hospital[A]
  })

  const base: Record<Table, (h: string, ids: Ids) => Row> = {
    inventory_categories: (h) => ({ hospital_id: h, name: '새 분류', sort_order: 1 }),
    inventory_items: (h, ids) => ({ hospital_id: h, category_id: ids.cat, name: '새 물품', unit: '개' }),
    inventory_counts: (h) => ({ hospital_id: h, counted_on: '2026-11-05' }),
    inventory_count_lines: (h, ids) => ({ hospital_id: h, count_id: ids.count, item_id: ids.item2, qty: 1 }),
    inventory_receipts: (h) => ({ hospital_id: h, received_on: '2026-11-06', vendor: '새상사' }),
    inventory_receipt_lines: (h, ids) => ({ hospital_id: h, receipt_id: ids.receipt, item_id: ids.item, qty: 1, unit_price: 0, amount: 0 }),
    inventory_aliases: (h, ids) => ({ hospital_id: h, alias: '새 이름', item_id: ids.item }),
  }

  it.each<[string, Table, Row]>([
    ['분류 이름 0자', 'inventory_categories', { name: '' }],
    ['분류 이름 21자', 'inventory_categories', { name: '가'.repeat(21) }],
    ['분류 이름 앞 빈칸', 'inventory_categories', { name: ' 약품' }],
    ['분류 이름 뒤 빈칸', 'inventory_categories', { name: '약품 ' }],
    ['분류 이름 줄바꿈', 'inventory_categories', { name: '약\n품' }],
    ['분류 차례 −1', 'inventory_categories', { sort_order: -1 }],
    ['물품 이름 0자', 'inventory_items', { name: '' }],
    ['물품 이름 41자', 'inventory_items', { name: '가'.repeat(41) }],
    ['물품 이름 앞 빈칸', 'inventory_items', { name: ' 거즈' }],
    ['물품 이름 탭', 'inventory_items', { name: '거\t즈' }],
    ['단위 0자', 'inventory_items', { unit: '' }],
    ['단위 11자', 'inventory_items', { unit: '가'.repeat(11) }],
    ['단위 뒤 빈칸', 'inventory_items', { unit: '개 ' }],
    ['최소 수량 −1', 'inventory_items', { min_qty: -1 }],
    ['최소 수량 1,000,001', 'inventory_items', { min_qty: 1_000_001 }],
    ['지금 수량 −1,000,001', 'inventory_items', { qty: -1_000_001 }],
    ['지금 수량 1,000,001', 'inventory_items', { qty: 1_000_001 }],
    ['마지막 센 수 −1', 'inventory_items', { last_count_qty: -1 }],
    ['마지막 센 수 1,000,001', 'inventory_items', { last_count_qty: 1_000_001 }],
    ['거래처 0자', 'inventory_items', { vendor: '' }],
    ['거래처 41자', 'inventory_items', { vendor: '가'.repeat(41) }],
    ['거래처 앞 빈칸', 'inventory_items', { vendor: ' 상사' }],
    ['거래처 제어 문자', 'inventory_items', { vendor: '상\u0007사' }],
    ['단가 −1', 'inventory_items', { unit_price: -1 }],
    ['단가 100,000,001', 'inventory_items', { unit_price: 100_000_001 }],
    ['비트 코드 0자', 'inventory_items', { bit_code: '' }],
    ['비트 코드 101자', 'inventory_items', { bit_code: 'X'.repeat(101) }],
    ['비트 코드 앞 빈칸', 'inventory_items', { bit_code: ' XH0201' }],
    ['비트 코드 줄바꿈', 'inventory_items', { bit_code: 'XH0201\n' }],
    ['물품 차례 −1', 'inventory_items', { sort_order: -1 }],
    ['세기 줄 수 −1', 'inventory_count_lines', { qty: -1 }],
    ['세기 줄 수 1,000,001', 'inventory_count_lines', { qty: 1_000_001 }],
    ['입고 거래처 0자', 'inventory_receipts', { vendor: '' }],
    ['입고 거래처 41자', 'inventory_receipts', { vendor: '가'.repeat(41) }],
    ['입고 거래처 줄바꿈', 'inventory_receipts', { vendor: '가짜\n상사' }],
    ['사진 자리 다른 병원 폴더', 'inventory_receipts', { photo_path: `${OTHER_ID}/${PHOTO_ID}.jpg` }],
    ['사진 자리 폴더 없음', 'inventory_receipts', { photo_path: `${PHOTO_ID}.jpg` }],
    ['사진 자리 png', 'inventory_receipts', { photo_path: '{h}/0f8fad5b-d9cb-469f-a165-70867728950e.png' }],
    ['사진 자리 폴더 둘', 'inventory_receipts', { photo_path: '{h}/x/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }],
    ['사진 자리 뒤 줄바꿈', 'inventory_receipts', { photo_path: '{h}/0f8fad5b-d9cb-469f-a165-70867728950e.jpg\n' }],
    ['사진 자리 이름 짧음', 'inventory_receipts', { photo_path: '{h}/0f8fad5b.jpg' }],
    ['입고 줄 수 0', 'inventory_receipt_lines', { qty: 0 }],
    ['입고 줄 수 1,000,001', 'inventory_receipt_lines', { qty: 1_000_001 }],
    ['입고 줄 단가 −1', 'inventory_receipt_lines', { unit_price: -1 }],
    ['입고 줄 단가 100,000,001', 'inventory_receipt_lines', { unit_price: 100_000_001 }],
    ['입고 줄 금액 −1', 'inventory_receipt_lines', { amount: -1 }],
    ['입고 줄 금액 1,000,000,001', 'inventory_receipt_lines', { amount: 1_000_000_001 }],
    ['별칭 0자', 'inventory_aliases', { alias: '' }],
    ['별칭 61자', 'inventory_aliases', { alias: '가'.repeat(61) }],
    ['별칭 앞 빈칸', 'inventory_aliases', { alias: ' 거즈' }],
    ['별칭 제어 문자', 'inventory_aliases', { alias: '거\u0000즈'.replace('\u0000', '\u001b') }],
  ])('AC-7501.1 거부: %s (운영자가 넣어도 23514)', async (_label, table, change) => {
    const fixed = Object.fromEntries(Object.entries(change).map(([k, v]) => [k, typeof v === 'string' ? v.replace('{h}', h) : v]))
    const old = await dump()
    await expect(seedRow(table, { ...base[table](h, ids), ...fixed })).rejects.toMatchObject(CHECK)
    expect(await dump()).toEqual(old)
  })

  it.each<[string, Table, Row]>([
    ['분류 이름 20자', 'inventory_categories', { name: '가'.repeat(20) }],
    ['분류 이름 가운데 빈칸', 'inventory_categories', { name: '보조기 깁스' }],
    ['물품 이름 40자', 'inventory_items', { name: '가'.repeat(40) }],
    ['단위 10자', 'inventory_items', { unit: '가'.repeat(10) }],
    ['최소 수량 0', 'inventory_items', { min_qty: 0 }],
    ['최소 수량 1,000,000', 'inventory_items', { min_qty: 1_000_000 }],
    ['최소 수량 비움', 'inventory_items', { min_qty: null }],
    ['지금 수량 −1,000,000', 'inventory_items', { qty: -1_000_000 }],
    ['지금 수량 1,000,000', 'inventory_items', { qty: 1_000_000 }],
    ['거래처 40자', 'inventory_items', { vendor: '가'.repeat(40) }],
    ['단가 0', 'inventory_items', { unit_price: 0 }],
    ['단가 100,000,000', 'inventory_items', { unit_price: 100_000_000 }],
    ['비트 코드 100자', 'inventory_items', { bit_code: 'X'.repeat(100) }],
    ['유통기한', 'inventory_items', { expiry: '2027-03-01' }],
    ['세기 줄 수 0', 'inventory_count_lines', { qty: 0 }],
    ['세기 줄 수 1,000,000', 'inventory_count_lines', { qty: 1_000_000 }],
    ['입고 거래처 비움', 'inventory_receipts', { vendor: null }],
    ['입고 거래처 40자', 'inventory_receipts', { vendor: '가'.repeat(40) }],
    ['사진 자리 내 병원 폴더', 'inventory_receipts', { photo_path: '{h}/0f8fad5b-d9cb-469f-a165-70867728950e.jpg' }],
    ['입고 줄 수 1,000,000', 'inventory_receipt_lines', { qty: 1_000_000 }],
    ['입고 줄 단가 비움', 'inventory_receipt_lines', { unit_price: null }],
    ['입고 줄 금액 1,000,000,000', 'inventory_receipt_lines', { amount: 1_000_000_000 }],
    ['별칭 60자', 'inventory_aliases', { alias: '가'.repeat(60) }],
  ])('AC-7501.1 허용: %s', async (_label, table, change) => {
    const fixed = Object.fromEntries(Object.entries(change).map(([k, v]) => [k, typeof v === 'string' ? v.replace('{h}', h) : v]))
    const added = await seedRow(table, { ...base[table](h, ids), ...fixed })
    for (const [column, value] of Object.entries(fixed)) {
      const got = added[column]
      expect([column, got instanceof Date ? got.toISOString().slice(0, 10) : got]).toEqual([column, value])
    }
  })

  it.each<[Table, string]>([
    ['inventory_categories', 'name'],
    ['inventory_items', 'name'],
    ['inventory_items', 'unit'],
    ['inventory_items', 'category_id'],
    ['inventory_items', 'qty'],
    ['inventory_items', 'hidden'],
    ['inventory_counts', 'counted_on'],
    ['inventory_count_lines', 'qty'],
    ['inventory_receipts', 'received_on'],
    ['inventory_receipt_lines', 'qty'],
    ['inventory_receipt_lines', 'amount'],
    ['inventory_aliases', 'alias'],
  ])('AC-7501.1: %s.%s는 비울 수 없다(23502)', async (table, column) => {
    await expect(seedRow(table, { ...base[table](h, ids), [column]: null })).rejects.toMatchObject(NOT_NULL)
  })
})

describe('AC-7501.2 RLS·권한', SLOW, () => {
  it.each(TABLES)('AC-7501.2: %s는 RLS가 켜져 있다', async (table) => {
    expect(await rows(`select relrowsecurity as on from pg_class where oid = to_regclass($1)`, [`public.${table}`])).toEqual([{ on: true }])
  })

  it.each(TABLES)('AC-7501.2: %s 표 단위 권한은 design.md 1절의 것뿐이다(anon·PUBLIC 없음)', async (table) => {
    const granted = await rows(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2`,
      [table],
    )
    expect(granted).toEqual(TABLE_GRANTS[table].map((privilege) => ({ grantee: 'authenticated', privilege_type: privilege })))
  })

  it.each(TABLES)('AC-7501.2: %s 칸 권한(column_privileges)은 읽기 = 모든 칸, 넣기·고치기 = design.md 1절 칸뿐이다', async (table) => {
    await rows(`select $1::regclass`, [`public.${table}`]) // 표가 없으면 여기서 실패한다(빈 목록과 헷갈리지 않게)
    const list = await rows(
      `select grantee, column_name, privilege_type from information_schema.column_privileges
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC')`,
      [table],
    )
    const got: Record<string, string[]> = {}
    for (const row of list) (got[`${row.grantee} ${row.privilege_type}`] ??= []).push(row.column_name as string)
    for (const key of Object.keys(got)) got[key].sort()
    const expected: Record<string, string[]> = { 'authenticated SELECT': COLUMNS[table].map(([name]) => name).sort() }
    if (WRITES[table].insert.length > 0) expected['authenticated INSERT'] = [...WRITES[table].insert].sort()
    if (WRITES[table].update.length > 0) expected['authenticated UPDATE'] = [...WRITES[table].update].sort()
    expect(got).toEqual(expected)
  })

  it('AC-7501.2: 물품 qty·last_count_qty·last_counted_at은 authenticated가 넣지도 고치지도 못한다(함수만)', async () => {
    for (const column of ['qty', 'last_count_qty', 'last_counted_at', 'hospital_id', 'id', 'created_at']) {
      for (const privilege of ['INSERT', 'UPDATE']) {
        expect([column, privilege, (await rows(`select has_column_privilege('authenticated', 'public.inventory_items', $1, $2) as ok`, [column, privilege]))[0].ok]).toEqual([
          column,
          privilege,
          false,
        ])
      }
    }
  })

  it.each(TABLES)('AC-7501.2: %s 정책은 design.md 1절의 것이고 authenticated·my_hospital_id()로만 거른다(데스크 정책 없음)', async (table) => {
    const list = await rows(
      `select cmd, permissive, roles::text as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = $1 order by cmd`,
      [table],
    )
    expect(list.map((p) => p.cmd)).toEqual(POLICY_CMDS[table])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      const using = policy.cmd === 'INSERT' ? null : String(policy.qual)
      const check = ['INSERT', 'UPDATE'].includes(String(policy.cmd)) ? String(policy.with_check) : null
      for (const rule of [using, check]) {
        if (rule === null) continue
        expect(rule).toMatch(/^\(hospital_id = \( SELECT my_hospital_id\(\) AS my_hospital_id\)\)$/)
      }
      if (policy.cmd === 'INSERT') expect(policy.qual).toBeNull()
      if (policy.cmd === 'SELECT' || policy.cmd === 'DELETE') expect(policy.with_check).toBeNull()
    }
  })

  describe('원장 A', () => {
    let a: Ids
    let b: Ids
    beforeEach(async () => {
      a = await seedAll(A)
      b = await seedAll(B)
    })

    it.each(TABLES)('AC-7501.2: A는 %s에서 A 병원 줄만 읽는다', async (table) => {
      const got = await as(A, `select distinct hospital_id from public.${table}`)
      expect(got).toEqual([{ hospital_id: hospital[A] }])
      await operator()
      expect((await rows(`select count(distinct hospital_id)::int as n from public.${table}`))[0].n).toBe(2)
    })

    it('AC-7501.2: A는 분류를 넣고(hospital_id는 DB가) 이름·차례를 고치고 지운다', async () => {
      await become(A)
      await postgrestInsert('public.inventory_categories', [{ name: '보조기·깁스', sort_order: 2 }])
      const [added] = await as(A, `select id, hospital_id from public.inventory_categories where name = '보조기·깁스'`)
      expect(added.hospital_id).toBe(hospital[A])
      expect(await affected(A, `update public.inventory_categories set name = '보조기', sort_order = 3 where id = $1`, [added.id])).toBe(1)
      expect(await affected(A, `delete from public.inventory_categories where id = $1`, [added.id])).toBe(1)
    })

    it('AC-7501.2·AC-7514.2: A는 물품을 칸 권한 칸(비트 코드 포함)으로 넣고 고치며(주문함·안 씀·연결 끊기) 지우지는 못한다', async () => {
      await become(A)
      await postgrestInsert('public.inventory_items', [
        {
          category_id: a.cat,
          name: '가짜 붕대',
          unit: '롤',
          min_qty: 5,
          expiry: '2027-03-01',
          vendor: '가짜상사',
          unit_price: 1200,
          bit_code: 'XH0201',
          sort_order: 2,
          hidden: false,
        },
      ])
      const [added] = await as(A, `select id, hospital_id, qty, last_count_qty, last_counted_at from public.inventory_items where name = '가짜 붕대'`)
      expect(added).toMatchObject({ hospital_id: hospital[A], qty: 0, last_count_qty: null, last_counted_at: null })
      expect(
        await affected(
          A,
          `update public.inventory_items set category_id = $2, name = '가짜 붕대 L', unit = '개', min_qty = null, expiry = null, vendor = null,
             unit_price = null, bit_code = null, sort_order = 0, hidden = true, ordered_at = now() where id = $1`,
          [added.id, a.cat],
        ),
      ).toBe(1)
      expect(await itemNow(added.id as string)).toMatchObject({ hidden: true, unit_price: null, ordered_at: expect.any(Date) })
      await become(A)
      await expect(rows(`delete from public.inventory_items where id = $1`, [added.id])).rejects.toMatchObject(DENIED)
    })

    it.each([
      ['qty', 5],
      ['last_count_qty', 5],
      ['last_counted_at', '2026-11-01T00:00:00Z'],
      ['ordered_at', '2026-11-01T00:00:00Z'],
      ['hospital_id', '{A}'],
      ['id', OTHER_ID],
      ['created_at', '2026-11-01T00:00:00Z'],
    ])('AC-7501.2: A가 물품을 넣을 때 %s를 보내면 권한 없음이다', async (column, value) => {
      const old = await dump()
      await become(A)
      await expect(
        postgrestInsert('public.inventory_items', [{ category_id: a.cat, name: '가짜 붕대', unit: '롤', [column]: value === '{A}' ? hospital[A] : value }]),
      ).rejects.toMatchObject(DENIED)
      expect(await dump()).toEqual(old)
    })

    it.each([
      ['qty', '5'],
      ['last_count_qty', '5'],
      ['last_counted_at', 'now()'],
      ['hospital_id', `'${OTHER_ID}'`],
      ['id', `'${OTHER_ID}'`],
      ['created_at', 'now()'],
    ])('AC-7501.2: A가 내 물품의 %s를 고치면 권한 없음이다', async (column, value) => {
      const old = await dump()
      await become(A)
      await expect(rows(`update public.inventory_items set ${column} = ${value} where id = $1`, [a.item])).rejects.toMatchObject(DENIED)
      expect(await dump()).toEqual(old)
    })

    it.each<[Table, Row]>([
      ['inventory_counts', { counted_on: '2026-11-09' }],
      ['inventory_count_lines', { count_id: '{count}', item_id: '{item2}', qty: 1 }],
      ['inventory_receipts', { received_on: '2026-11-09' }],
      ['inventory_receipt_lines', { receipt_id: '{receipt}', item_id: '{item}', qty: 1, amount: 0 }],
    ])('AC-7501.2: A는 %s를 바로 넣기·고치기·지우기 못 한다(함수로만)', async (table, row) => {
      const fill = (v: unknown) => (typeof v === 'string' && v.startsWith('{') ? a[v.slice(1, -1) as keyof Ids] : v)
      const body = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, fill(v)]))
      const old = await dump()
      await become(A)
      await expect(postgrestInsert(`public.${table}`, [body])).rejects.toMatchObject(DENIED)
      const [column] = Object.keys(row)
      await become(A)
      await expect(rows(`update public.${table} set ${column} = ${column}`)).rejects.toMatchObject(DENIED)
      await become(A)
      await expect(rows(`delete from public.${table}`)).rejects.toMatchObject(DENIED)
      expect(await dump()).toEqual(old)
    })

    it('AC-7501.2: A는 별칭을 넣고(앱의 저장: 겹치면 건너뛰는 넣기 → item_id만 고치기) 물품을 바꾸고 지운다', async () => {
      await become(A)
      await postgrestInsert('public.inventory_aliases', [{ alias: '가짜 솜 1봉', item_id: a.item2 }])
      // 앱의 saveAliases: 같은 별칭을 다시 넣으면 건너뛰고(ignoreDuplicates, 0줄) 그 이름의 item_id 하나만 고친다
      await become(A)
      const skipped = await postgrestInsert(
        'public.inventory_aliases',
        [
          { alias: '가짜 솜 1봉', item_id: a.item },
          { alias: '가짜 솜 2봉', item_id: a.item },
        ],
        'hospital_id, alias',
        true,
      )
      expect(skipped.affectedRows).toBe(1)
      expect(await affected(A, `update public.inventory_aliases set item_id = $1 where alias = '가짜 솜 1봉'`, [a.item])).toBe(1)
      expect(await as(A, `select alias, item_id, hospital_id from public.inventory_aliases where alias like '가짜 솜 _봉' order by alias`)).toEqual([
        { alias: '가짜 솜 1봉', item_id: a.item, hospital_id: hospital[A] },
        { alias: '가짜 솜 2봉', item_id: a.item, hospital_id: hospital[A] },
      ])
      expect(await affected(A, `delete from public.inventory_aliases where alias = '가짜 솜 1봉'`)).toBe(1)
      await become(A)
      await expect(postgrestInsert('public.inventory_aliases', [{ alias: '날짜', item_id: a.item, created_at: '2026-11-01' }])).rejects.toMatchObject(
        DENIED,
      )
    })

    it('AC-7501.2: A는 별칭 글자(alias)를 고치지 못하고, 보낸 칸을 모두 SET에 쓰는 upsert도 권한 없음이다(별칭 고치기는 item_id만)', async () => {
      const old = await dump()
      await become(A)
      await expect(rows(`update public.inventory_aliases set alias = '바꾼 이름' where alias = '가짜 거즈 10매'`)).rejects.toMatchObject(DENIED)
      await become(A)
      await expect(
        postgrestInsert('public.inventory_aliases', [{ alias: '가짜 거즈 10매', item_id: a.item2 }], 'hospital_id, alias'),
      ).rejects.toMatchObject(DENIED)
      expect(await dump()).toEqual(old)
    })

    it('AC-7501.2: A는 B의 분류·물품·별칭을 고치거나 지우지 못하고(0줄) B 병원으로 넣지도 못한다', async () => {
      const old = await dump()
      expect(await affected(A, `update public.inventory_categories set name = '바꿈' where id = $1`, [b.cat])).toBe(0)
      expect(await affected(A, `update public.inventory_items set name = '바꿈', ordered_at = now() where id = $1`, [b.item])).toBe(0)
      expect(await affected(A, `update public.inventory_aliases set item_id = $1 where hospital_id = $2`, [b.item2, hospital[B]])).toBe(0)
      expect(await affected(A, `delete from public.inventory_categories where hospital_id = $1`, [hospital[B]])).toBe(0)
      expect(await affected(A, `delete from public.inventory_aliases where hospital_id = $1`, [hospital[B]])).toBe(0)
      await become(A)
      await expect(postgrestInsert('public.inventory_categories', [{ hospital_id: hospital[B], name: '남의 분류' }])).rejects.toMatchObject(DENIED)
      expect(await dump()).toEqual(old)
    })
  })

  describe.each(OUTSIDERS)('%s', (_label, user) => {
    beforeEach(async () => {
      await seedAll(A)
      if (hospital[user]) await seedAll(user)
    })

    it.each(TABLES)(`AC-7501.2: ${_label} 사용자는 %s의 줄을 하나도 못 읽는다`, async (table) => {
      expect(await as(user, `select * from public.${table}`)).toEqual([])
    })

    it('AC-7501.2: 분류·물품·별칭을 넣지 못하고 고치기·지우기는 0줄이며 줄은 그대로다', async () => {
      await operator()
      const [cat] = await rows(`select id from public.inventory_categories where hospital_id = $1`, [hospital[A]])
      const [item] = await rows(`select id from public.inventory_items where hospital_id = $1 limit 1`, [hospital[A]])
      const old = await dump()
      await become(user)
      await expect(postgrestInsert('public.inventory_categories', [{ name: '새 분류' }])).rejects.toThrow(RLS_OR_NULL)
      await become(user)
      await expect(postgrestInsert('public.inventory_items', [{ category_id: cat.id, name: '새 물품', unit: '개' }])).rejects.toThrow(
        /row-level security|null value|foreign key/,
      )
      await become(user)
      await expect(postgrestInsert('public.inventory_aliases', [{ alias: '새 이름', item_id: item.id }])).rejects.toThrow(
        /row-level security|null value|foreign key/,
      )
      expect(await affected(user, `update public.inventory_categories set name = '바꿈'`)).toBe(0)
      expect(await affected(user, `update public.inventory_items set ordered_at = now()`)).toBe(0)
      expect(await affected(user, `update public.inventory_aliases set item_id = item_id`)).toBe(0)
      expect(await affected(user, `delete from public.inventory_categories`)).toBe(0)
      expect(await affected(user, `delete from public.inventory_aliases`)).toBe(0)
      expect(await dump()).toEqual(old)
    })

    it('AC-7501.2: DB 함수 다섯 모두 오류 42501이고 아무것도 바뀌지 않는다', async () => {
      await operator()
      const [item] = await rows(`select id from public.inventory_items where hospital_id = $1 limit 1`, [hospital[A]])
      const [receipt] = await rows(`select id from public.inventory_receipts where hospital_id = $1`, [hospital[A]])
      const old = await dump()
      await expect(saveCount(user, seoulDay(), [{ item_id: item.id, qty: 1 }])).rejects.toMatchObject(NOT_OWNER)
      await expect(saveReceipt(user, seoulDay(), null, null, [line(item.id as string, 1)])).rejects.toMatchObject(NOT_OWNER)
      await expect(updateReceipt(user, receipt.id as string, seoulDay(), null, [line(item.id as string, 1)])).rejects.toMatchObject(NOT_OWNER)
      await expect(deleteReceipt(user, receipt.id as string)).rejects.toMatchObject(NOT_OWNER)
      await expect(setOrder(user, [item.id as string])).rejects.toMatchObject(NOT_OWNER)
      expect(await dump()).toEqual(old)
    })
  })

  it('AC-7501.2: anon은 일곱 표 모두 읽기·넣기·고치기·지우기가 권한 없음이고 DB 함수도 못 부른다', async () => {
    const ids = await seedAll(A)
    const old = await dump()
    for (const table of TABLES) {
      await becomeAnon()
      await expect(rows(`select * from public.${table}`), table).rejects.toMatchObject(DENIED)
      await becomeAnon()
      await expect(rows(`delete from public.${table}`), table).rejects.toMatchObject(DENIED)
    }
    await becomeAnon()
    await expect(postgrestInsert('public.inventory_categories', [{ name: '새 분류' }])).rejects.toMatchObject(DENIED)
    await becomeAnon()
    await expect(rows(`update public.inventory_items set name = '바꿈'`)).rejects.toMatchObject(DENIED)
    for (const call of [
      `select public.save_inventory_count(current_date, '[]'::jsonb)`,
      `select public.save_inventory_receipt(current_date, null, null, '[]'::jsonb)`,
      `select public.update_inventory_receipt('${ids.receipt}'::uuid, current_date, null, '[]'::jsonb)`,
      `select public.delete_inventory_receipt('${ids.receipt}'::uuid)`,
      `select public.set_inventory_order(array['${ids.item}'::uuid])`,
    ]) {
      await becomeAnon()
      await expect(rows(call), call).rejects.toThrow(/permission denied for function/)
    }
    expect(await dump()).toEqual(old)
  })

  it.each(FUNCTIONS)('AC-7501.2: %s는 만든 사람 권한(security definer)·빈 search_path이고 authenticated만 부른다', async (fn) => {
    expect(await rows(`select prosecdef, proconfig from pg_proc where oid = to_regprocedure($1)`, [`public.${fn}`])).toEqual([
      { prosecdef: true, proconfig: ['search_path=""'] },
    ])
    for (const [role, allowed] of [
      ['public', false],
      ['anon', false],
      ['authenticated', true],
    ] as const) {
      expect([role, (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, `public.${fn}`]))[0].ok]).toEqual([role, allowed])
    }
  })

  it('AC-7501.2: 함수가 돌려주는 것 — 세기 integer, 입고 저장 uuid, 고치기 void, 지우기 text, 차례 void', async () => {
    const got = await rows(
      `select p.oid::regprocedure::text as fn, p.prorettype::regtype::text as returns from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname like '%inventory%' order by 1`,
    )
    expect(got).toEqual([
      { fn: 'delete_inventory_receipt(uuid)', returns: 'text' },
      { fn: 'save_inventory_count(date,jsonb)', returns: 'integer' },
      { fn: 'save_inventory_receipt(date,text,text,jsonb)', returns: 'uuid' },
      { fn: 'set_inventory_order(uuid[])', returns: 'void' },
      { fn: 'update_inventory_receipt(uuid,date,text,jsonb)', returns: 'void' },
    ])
  })
})

describe('AC-7501.3 save_inventory_count', SLOW, () => {
  let cat: string
  let x: string
  let y: string
  beforeEach(async () => {
    cat = await seedCategory(A)
    x = await seedItem(A, cat, { name: '가짜 거즈' })
    y = await seedItem(A, cat, { name: '가짜 솜', expiry: '2027-01-01' })
  })

  async function countLines() {
    await operator()
    return rows(
      `select c.counted_on::text as day, l.item_id, l.qty, l.saved_at from public.inventory_count_lines l
         join public.inventory_counts c on c.id = l.count_id order by 1, l.qty`,
    )
  }

  it('AC-7501.3: 센 수가 있는 줄은 세기 줄을 넣고 지금 수량 = 센 수와 마지막 센 수·시각을 적으며, 넣은 줄 수를 돌려준다', async () => {
    const day = seoulDay()
    expect(await saveCount(A, day, [{ item_id: x, qty: 5 }, { item_id: y, qty: 3 }])).toBe(2)
    await operator()
    expect(await rows(`select hospital_id, counted_on::text as day from public.inventory_counts`)).toEqual([{ hospital_id: hospital[A], day }])
    const lines = await countLines()
    expect(lines.map((l) => [l.day, l.item_id, l.qty])).toEqual([
      [day, y, 3],
      [day, x, 5],
    ])
    expect(await itemNow(x)).toMatchObject({ qty: 5, last_count_qty: 5, last_counted_at: lines[1].saved_at })
    expect(await itemNow(y)).toMatchObject({ qty: 3, last_count_qty: 3, expiry: '2027-01-01' })
  })

  it('AC-7501.3: expiry 열쇠가 있는 줄은 기한을 그 값으로(null이면 비움), 없으면 그대로이고, 센 수가 없는 줄은 세기 줄·수량을 바꾸지 않는다', async () => {
    expect(
      await saveCount(A, seoulDay(), [
        { item_id: x, expiry: '2027-08-31' },
        { item_id: y, qty: null, expiry: null },
      ]),
    ).toBe(0)
    expect(await itemNow(x)).toMatchObject({ qty: 0, last_count_qty: null, last_counted_at: null, expiry: '2027-08-31' })
    expect(await itemNow(y)).toMatchObject({ qty: 0, last_count_qty: null, expiry: null })
    expect(await countLines()).toEqual([])
    expect(await saveCount(A, seoulDay(), [{ item_id: x, qty: 4 }])).toBe(1)
    expect(await itemNow(x)).toMatchObject({ qty: 4, expiry: '2027-08-31' })
  })

  async function countDays() {
    await operator()
    return (await rows(`select counted_on::text as day from public.inventory_counts order by 1`)).map((row) => row.day)
  }

  it('AC-7501.3: 기한만 있는 줄들만 보내면 물품 기한만 바뀌고 세기 날은 생기지 않는다(세기가 없던 병원)', async () => {
    expect(await saveCount(A, seoulDay(), [{ item_id: x, expiry: '2027-08-31' }, { item_id: y, qty: null, expiry: null }])).toBe(0)
    expect(await countDays()).toEqual([])
    expect(await itemNow(x)).toMatchObject({ expiry: '2027-08-31', last_counted_at: null })
    expect(await itemNow(y)).toMatchObject({ expiry: null })
  })

  it('AC-7501.3: 기한만 저장한 날은 마지막 세기 날짜가 되지 않는다(그 사이 날 세기가 그대로 된다)', async () => {
    expect(await saveCount(A, seoulDay(-5), [{ item_id: x, qty: 3 }])).toBe(1)
    expect(await saveCount(A, seoulDay(), [{ item_id: y, expiry: '2027-05-31' }])).toBe(0)
    expect(await countDays()).toEqual([seoulDay(-5)])
    expect(await itemNow(y)).toMatchObject({ expiry: '2027-05-31', qty: 0, last_count_qty: null })
    // 마지막 세기 날짜는 그대로 5일 전이라 3일 전 세기가 된다
    expect(await saveCount(A, seoulDay(-3), [{ item_id: y, qty: 2 }])).toBe(1)
    expect(await countDays()).toEqual([seoulDay(-5), seoulDay(-3)])
    // 기한만 보내도 날짜 검사는 같다(마지막 세기 날짜보다 앞이면 오류이고 기한도 그대로)
    const old = await dump()
    await expect(saveCount(A, seoulDay(-4), [{ item_id: x, expiry: '2028-01-31' }])).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
  })

  it('AC-7501.3: 센 수가 있는 줄이 하나라도 있으면 그 날 세기를 만들고, 기한만 있는 줄은 세기 줄이 되지 않는다', async () => {
    expect(await saveCount(A, seoulDay(), [{ item_id: x, expiry: '2027-08-31' }, { item_id: y, qty: 6 }])).toBe(1)
    expect(await countDays()).toEqual([seoulDay()])
    expect((await countLines()).map((l) => [l.item_id, l.qty])).toEqual([[y, 6]])
    expect(await itemNow(x)).toMatchObject({ expiry: '2027-08-31', qty: 0, last_counted_at: null })
  })

  it('AC-7501.3: 같은 날 다시 저장하면 그 물품 줄만 덮어쓰고 저장 시각이 새 시각이 된다(세기는 하나)', async () => {
    const day = seoulDay()
    await saveCount(A, day, [{ item_id: x, qty: 5 }, { item_id: y, qty: 3 }])
    const first = await countLines()
    await tick()
    expect(await saveCount(A, day, [{ item_id: x, qty: 7 }])).toBe(1)
    const second = await countLines()
    await operator()
    expect(await rows(`select count(*)::int as n from public.inventory_counts`)).toEqual([{ n: 1 }])
    expect(second.map((l) => [l.item_id, l.qty])).toEqual([
      [y, 3],
      [x, 7],
    ])
    expect(second[0].saved_at).toEqual(first[0].saved_at)
    expect((second[1].saved_at as Date).getTime()).toBeGreaterThan((first[1].saved_at as Date).getTime())
    expect(await itemNow(x)).toMatchObject({ qty: 7, last_count_qty: 7, last_counted_at: second[1].saved_at })
    expect(await itemNow(y)).toMatchObject({ qty: 3, last_counted_at: first[0].saved_at })
  })

  it('AC-7501.3: 세기보다 먼저 저장된 입고는 센 수에 들었다고 본다(지금 수량 = 센 수)', async () => {
    await saveCount(A, seoulDay(-7), [{ item_id: x, qty: 5 }])
    await tick()
    await saveReceipt(A, seoulDay(-1), '가짜상사', null, [line(x, 10)])
    expect(await itemNow(x)).toMatchObject({ qty: 15, last_count_qty: 5 })
    await tick()
    await saveCount(A, seoulDay(), [{ item_id: x, qty: 12 }])
    expect(await itemNow(x)).toMatchObject({ qty: 12, last_count_qty: 12 })
  })

  it('AC-7501.3: 날짜는 마지막 세기 날짜~한국 오늘만 된다(같은 날·사이 날은 됨)', async () => {
    await saveCount(A, seoulDay(-10), [{ item_id: x, qty: 1 }])
    const old = await dump()
    await expect(saveCount(A, seoulDay(-11), [{ item_id: x, qty: 2 }])).rejects.toMatchObject(BAD)
    await expect(saveCount(A, seoulDay(1), [{ item_id: x, qty: 2 }])).rejects.toMatchObject(BAD)
    await expect(saveCount(A, null, [{ item_id: x, qty: 2 }])).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
    expect(await saveCount(A, seoulDay(-10), [{ item_id: y, qty: 2 }])).toBe(1)
    expect(await saveCount(A, seoulDay(-3), [{ item_id: y, qty: 3 }])).toBe(1)
    await expect(saveCount(A, seoulDay(-4), [{ item_id: y, qty: 4 }])).rejects.toMatchObject(BAD)
    expect(await saveCount(A, seoulDay(), [{ item_id: y, qty: 5 }])).toBe(1)
  })

  it('AC-7501.3: 마지막 세기 날짜는 내 병원 것만 본다(B의 늦은 세기는 상관없다)', async () => {
    const bCat = await seedCategory(B)
    const bItem = await seedItem(B, bCat)
    await saveCount(B, seoulDay(), [{ item_id: bItem, qty: 1 }])
    expect(await saveCount(A, seoulDay(-5), [{ item_id: x, qty: 1 }])).toBe(1)
  })

  it('AC-7501.3: 오늘은 세션 시간대가 아니라 한국 날짜다', async () => {
    await become(A)
    await db.exec(`set timezone = 'Pacific/Honolulu'`)
    expect((await rows(`select public.save_inventory_count($1::date, $2::jsonb) as n`, [seoulDay(), json([{ item_id: x, qty: 1 }])]))[0].n).toBe(1)
    await become(A)
    await db.exec(`set timezone = 'Pacific/Kiritimati'`)
    await expect(rows(`select public.save_inventory_count($1::date, $2::jsonb)`, [seoulDay(1), json([{ item_id: x, qty: 2 }])])).rejects.toMatchObject(BAD)
    expect(await itemNow(x)).toMatchObject({ qty: 1 })
  })

  it('AC-7501.3: 줄 1,000개는 되고 1,001개는 아무것도 바꾸지 않고 오류다', async () => {
    await operator()
    const many = (
      await rows(
        `insert into public.inventory_items (hospital_id, category_id, name, unit)
         select $1, $2, '가짜 물품 ' || g, '개' from generate_series(1, 1001) g returning id`,
        [hospital[A], cat],
      )
    ).map((row) => row.id as string)
    const old = await dump()
    await expect(saveCount(A, seoulDay(), many.map((id) => ({ item_id: id, qty: 1 })))).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
    expect(await saveCount(A, seoulDay(), many.slice(0, 1000).map((id) => ({ item_id: id, qty: 1 })))).toBe(1000)
  })

  it.each<[string, () => unknown]>([
    ['줄 0개', () => []],
    ['배열이 아님', () => ({ item_id: 'x', qty: 1 })],
    ['SQL null', () => undefined],
    ['줄이 객체가 아님', () => ['x']],
    ['item_id 없음', () => [{ qty: 1 }]],
    ['item_id uuid 아님', () => [{ item_id: 'abc', qty: 1 }]],
    ['item_id 숫자', () => [{ item_id: 1, qty: 1 }]],
    ['남의 물품', () => [{ item_id: '{b}', qty: 1 }]],
    ['없는 물품', () => [{ item_id: OTHER_ID, qty: 1 }]],
    ['같은 물품 두 줄', () => [{ item_id: '{x}', qty: 1 }, { item_id: '{x}', qty: 2 }]],
    ['센 수 −1', () => [{ item_id: '{x}', qty: -1 }]],
    ['센 수 1,000,001', () => [{ item_id: '{x}', qty: 1_000_001 }]],
    ['센 수 소수', () => [{ item_id: '{x}', qty: 1.5 }]],
    ['센 수 글자', () => [{ item_id: '{x}', qty: '5' }]],
    ['센 수 참거짓', () => [{ item_id: '{x}', qty: true }]],
    ['기한 날짜 아님', () => [{ item_id: '{x}', qty: 1, expiry: 'tomorrow' }]],
    ['기한 없는 날', () => [{ item_id: '{x}', qty: 1, expiry: '2027-02-30' }]],
    ['기한 꼴 다름', () => [{ item_id: '{x}', qty: 1, expiry: '2027-3-1' }]],
    ['기한 숫자', () => [{ item_id: '{x}', qty: 1, expiry: 20270301 }]],
  ])('AC-7501.3: %s이면 아무것도 바꾸지 않고 오류 22023이다', async (_label, make) => {
    const bCat = await seedCategory(B)
    const theirs = await seedItem(B, bCat)
    const fill = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(fill)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v === '{x}' ? x : v === '{b}' ? theirs : v]))
          : value
    const lines = fill(make())
    const old = await dump()
    await expect(saveCount(A, seoulDay(), lines)).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
  })

  it('AC-7501.3: 남의 물품이 한 줄이라도 섞이면 내 물품 줄도 바뀌지 않는다', async () => {
    const theirs = await seedItem(B, await seedCategory(B))
    const old = await dump()
    await expect(saveCount(A, seoulDay(), [{ item_id: x, qty: 9, expiry: null }, { item_id: theirs, qty: 1 }])).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
  })
})

describe('AC-7501.4 save_inventory_receipt', SLOW, () => {
  let cat: string
  let x: string
  let y: string
  let z: string
  beforeEach(async () => {
    cat = await seedCategory(A)
    x = await seedItem(A, cat, { name: '가짜 거즈', unit_price: 100 })
    y = await seedItem(A, cat, { name: '가짜 솜', unit_price: 200, vendor: '원래상사' })
    z = await seedItem(A, cat, { name: '가짜 붕대' })
  })

  it('AC-7501.4: 입고 한 건(저장 시각 = 지금)과 줄을 넣고, 줄마다 지금 수량에 더하고 주문함을 풀고, 단가·거래처를 채운다', async () => {
    await operator()
    await rows(`update public.inventory_items set ordered_at = now() where id in ($1, $2)`, [x, z])
    const photo = `${hospital[A]}/${PHOTO_ID}.jpg`
    const id = await saveReceipt(A, seoulDay(-1), '새상사', photo, [line(x, 10, 1500, 150), line(y, 3, 600)])
    expect(id).toMatch(UUID)
    const saved = await receiptNow(id)
    expect(saved.head).toMatchObject({ day: seoulDay(-1), vendor: '새상사', photo_path: photo })
    expect((saved.head?.created_at as Date).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(saved.lines).toEqual(
      [
        { item_id: x, qty: 10, unit_price: 150, amount: 1500 },
        { item_id: y, qty: 3, unit_price: null, amount: 600 },
      ].sort((p, q) => (p.item_id < q.item_id ? -1 : 1)),
    )
    expect(await itemNow(x)).toMatchObject({ qty: 10, unit_price: 150, vendor: '새상사', ordered_at: null })
    expect(await itemNow(y)).toMatchObject({ qty: 3, unit_price: 200, vendor: '원래상사' })
    expect(await itemNow(z)).toMatchObject({ qty: 0, ordered_at: expect.any(Date) })
    await operator()
    expect(await rows(`select hospital_id from public.inventory_receipt_lines group by 1`)).toEqual([{ hospital_id: hospital[A] }])
  })

  it('AC-7501.4: 거래처·사진 없이도 되고, 그때 물품 거래처는 비어 있는 그대로다', async () => {
    const id = await saveReceipt(A, seoulDay(), null, null, [line(z, 2, 0)])
    expect((await receiptNow(id)).head).toMatchObject({ vendor: null, photo_path: null })
    expect(await itemNow(z)).toMatchObject({ qty: 2, vendor: null, unit_price: null })
  })

  it('AC-7501.4: 한 입고에 같은 물품 줄이 둘이면 수량은 합이고 단가는 뒤 줄의 값이다', async () => {
    await saveReceipt(A, seoulDay(), null, null, [line(x, 2, 300, 150), line(x, 3, 480, 160), line(x, 1, 100)])
    expect(await itemNow(x)).toMatchObject({ qty: 6, unit_price: 160 })
  })

  it('AC-7501.4: 줄 100개는 되고 101개·0개는 오류다', async () => {
    const old = await dump()
    await expect(saveReceipt(A, seoulDay(), null, null, Array.from({ length: 101 }, () => line(x, 1)))).rejects.toMatchObject(BAD)
    await expect(saveReceipt(A, seoulDay(), null, null, [])).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
    await saveReceipt(A, seoulDay(), null, null, Array.from({ length: 100 }, () => line(x, 1)))
    expect(await itemNow(x)).toMatchObject({ qty: 100 })
  })

  it('AC-7501.4: 명세서 날짜가 한국 오늘보다 뒤면 오류이고 오늘·지난날은 된다', async () => {
    const old = await dump()
    await expect(saveReceipt(A, seoulDay(1), null, null, [line(x, 1)])).rejects.toMatchObject(BAD)
    await expect(saveReceipt(A, null, null, null, [line(x, 1)])).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
    await saveReceipt(A, seoulDay(), null, null, [line(x, 1)])
    await saveReceipt(A, '2026-01-02', null, null, [line(x, 1)])
    expect(await itemNow(x)).toMatchObject({ qty: 2 })
  })

  it.each<[string, () => unknown]>([
    ['배열이 아님', () => ({ item_id: '{x}', qty: 1, amount: 0 })],
    ['SQL null', () => undefined],
    ['줄이 객체가 아님', () => [5]],
    ['item_id 없음', () => [{ qty: 1, amount: 0 }]],
    ['item_id uuid 아님', () => [{ item_id: 'abc', qty: 1, amount: 0 }]],
    ['남의 물품', () => [{ item_id: '{b}', qty: 1, amount: 0 }]],
    ['없는 물품', () => [{ item_id: OTHER_ID, qty: 1, amount: 0 }]],
    ['수량 0', () => [{ item_id: '{x}', qty: 0, amount: 0 }]],
    ['수량 1,000,001', () => [{ item_id: '{x}', qty: 1_000_001, amount: 0 }]],
    ['수량 소수', () => [{ item_id: '{x}', qty: 1.5, amount: 0 }]],
    ['수량 없음', () => [{ item_id: '{x}', amount: 0 }]],
    ['수량 글자', () => [{ item_id: '{x}', qty: '1', amount: 0 }]],
    ['단가 −1', () => [{ item_id: '{x}', qty: 1, unit_price: -1, amount: 0 }]],
    ['단가 100,000,001', () => [{ item_id: '{x}', qty: 1, unit_price: 100_000_001, amount: 0 }]],
    ['단가 글자', () => [{ item_id: '{x}', qty: 1, unit_price: '100', amount: 0 }]],
    ['금액 없음', () => [{ item_id: '{x}', qty: 1 }]],
    ['금액 null', () => [{ item_id: '{x}', qty: 1, amount: null }]],
    ['금액 −1', () => [{ item_id: '{x}', qty: 1, amount: -1 }]],
    ['금액 1,000,000,001', () => [{ item_id: '{x}', qty: 1, amount: 1_000_000_001 }]],
    ['금액 소수', () => [{ item_id: '{x}', qty: 1, amount: 10.5 }]],
  ])('AC-7501.4: 줄이 %s이면 아무것도 바꾸지 않고 오류 22023이다', async (_label, make) => {
    const theirs = await seedItem(B, await seedCategory(B))
    const fill = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(fill)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v === '{x}' ? x : v === '{b}' ? theirs : v]))
          : value
    const old = await dump()
    await expect(saveReceipt(A, seoulDay(), '가짜상사', null, fill(make()))).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
  })

  it('AC-7501.4: 남의 물품이 한 줄이라도 섞이면 입고·내 물품 수량이 바뀌지 않는다', async () => {
    const theirs = await seedItem(B, await seedCategory(B))
    const old = await dump()
    await expect(saveReceipt(A, seoulDay(), '가짜상사', null, [line(x, 5), line(theirs, 1)])).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
  })

  it.each([
    ['다른 병원 폴더 사진', null, `${OTHER_ID}/${PHOTO_ID}.jpg`],
    ['png 사진', null, `{A}/${PHOTO_ID}.png`],
    ['거래처 41자', '가'.repeat(41), null],
    ['거래처 빈 글', '', null],
  ])('AC-7501.4: %s이면 오류이고 아무것도 바뀌지 않는다', async (_label, vendor, photo) => {
    const old = await dump()
    await expect(saveReceipt(A, seoulDay(), vendor, photo?.replace('{A}', hospital[A]) ?? null, [line(z, 1)])).rejects.toMatchObject(CHECK)
    expect(await dump()).toEqual(old)
  })

  it('AC-7501.4: 더해서 지금 수량이 1,000,000을 넘으면 오류이고 아무것도 바뀌지 않는다', async () => {
    await operator()
    await rows(`update public.inventory_items set qty = 999999 where id = $1`, [x])
    const old = await dump()
    await expect(saveReceipt(A, seoulDay(), null, null, [line(y, 1), line(x, 2)])).rejects.toMatchObject(CHECK)
    expect(await dump()).toEqual(old)
  })
})

describe('AC-7501.4 update_inventory_receipt·delete_inventory_receipt (저장 순서 규칙)', SLOW, () => {
  let cat: string
  let x: string
  let y: string
  beforeEach(async () => {
    cat = await seedCategory(A)
    x = await seedItem(A, cat, { name: '가짜 거즈' })
    y = await seedItem(A, cat, { name: '가짜 솜' })
  })

  it('AC-7501.4: 마지막 세기 뒤에 저장된 입고는 고치면 옛 줄만큼 빼고 새 줄만큼 더하고, 지우면 뺀다', async () => {
    await saveCount(A, seoulDay(-3), [{ item_id: x, qty: 5 }])
    await tick()
    const id = await saveReceipt(A, seoulDay(-1), '가짜상사', `${hospital[A]}/${PHOTO_ID}.jpg`, [line(x, 10, 1000, 100)])
    const saved = await receiptNow(id)
    expect(await itemNow(x)).toMatchObject({ qty: 15 })
    await updateReceipt(A, id, seoulDay(-2), '다른상사', [line(x, 4, 480, 120)])
    expect(await itemNow(x)).toMatchObject({ qty: 9, unit_price: 120, last_count_qty: 5 })
    const changed = await receiptNow(id)
    expect(changed.head).toEqual({ ...saved.head, day: seoulDay(-2), vendor: '다른상사' })
    expect(changed.lines).toEqual([{ item_id: x, qty: 4, unit_price: 120, amount: 480 }])
    expect(await deleteReceipt(A, id)).toBe(`${hospital[A]}/${PHOTO_ID}.jpg`)
    expect(await itemNow(x)).toMatchObject({ qty: 5 })
    expect(await receiptNow(id)).toEqual({ head: null, lines: [] })
  })

  it('AC-7501.4: 마지막 세기보다 먼저 저장된 입고(세기에 들었음)는 고치기·지우기가 수량을 바꾸지 않는다', async () => {
    const id = await saveReceipt(A, seoulDay(-1), null, null, [line(x, 10)])
    expect(await itemNow(x)).toMatchObject({ qty: 10 })
    await tick()
    await saveCount(A, seoulDay(), [{ item_id: x, qty: 7 }])
    await updateReceipt(A, id, seoulDay(-1), null, [line(x, 3)])
    expect(await itemNow(x)).toMatchObject({ qty: 7 })
    expect((await receiptNow(id)).lines).toEqual([{ item_id: x, qty: 3, unit_price: null, amount: 300 }])
    expect(await deleteReceipt(A, id)).toBeNull()
    expect(await itemNow(x)).toMatchObject({ qty: 7 })
  })

  it('AC-7501.4: 세기가 없는 물품은 고치기·지우기가 수량을 바꾼다', async () => {
    const id = await saveReceipt(A, seoulDay(), null, null, [line(x, 10)])
    await updateReceipt(A, id, seoulDay(), null, [line(x, 4)])
    expect(await itemNow(x)).toMatchObject({ qty: 4 })
    await deleteReceipt(A, id)
    expect(await itemNow(x)).toMatchObject({ qty: 0 })
  })

  it('AC-7501.4: 물품마다 그 물품의 마지막 세기로 본다(줄의 물품을 바꾸면 들었던 옛 물품은 그대로, 새 물품은 더함)', async () => {
    const id = await saveReceipt(A, seoulDay(-1), null, null, [line(x, 10)])
    await tick()
    await saveCount(A, seoulDay(), [{ item_id: x, qty: 6 }])
    await updateReceipt(A, id, seoulDay(-1), null, [line(y, 5)])
    expect(await itemNow(x)).toMatchObject({ qty: 6 })
    expect(await itemNow(y)).toMatchObject({ qty: 5 })
    await deleteReceipt(A, id)
    expect(await itemNow(x)).toMatchObject({ qty: 6 })
    expect(await itemNow(y)).toMatchObject({ qty: 0 })
  })

  it('AC-7501.4: 지금 수량은 음수가 될 수 있다(0에서 멈추지 않음)', async () => {
    const h = hospital[A]
    await operator()
    await rows(`update public.inventory_items set qty = 2 where id = $1`, [x])
    await rows(`update public.inventory_items set qty = 3 where id = $1`, [y])
    const r1 = (await seedRow('inventory_receipts', { hospital_id: h, received_on: '2026-11-02' })).id as string
    await seedRow('inventory_receipt_lines', { hospital_id: h, receipt_id: r1, item_id: x, qty: 10, amount: 0 })
    const r2 = (await seedRow('inventory_receipts', { hospital_id: h, received_on: '2026-11-03' })).id as string
    await seedRow('inventory_receipt_lines', { hospital_id: h, receipt_id: r2, item_id: y, qty: 10, amount: 0 })
    await deleteReceipt(A, r1)
    expect(await itemNow(x)).toMatchObject({ qty: -8 })
    await updateReceipt(A, r2, '2026-11-03', null, [line(y, 1)])
    expect(await itemNow(y)).toMatchObject({ qty: -6 })
  })

  it('AC-7501.4: 고치기는 저장 시각·사진·주문함을 바꾸지 않고, 단가는 새 줄 값으로, 비어 있는 물품 거래처는 채운다. 지우기도 주문함을 되돌리지 않는다', async () => {
    const id = await saveReceipt(A, seoulDay(-1), null, `${hospital[A]}/${PHOTO_ID}.jpg`, [line(x, 1)])
    const saved = await receiptNow(id)
    await operator()
    await rows(`update public.inventory_items set ordered_at = now() where id in ($1, $2)`, [x, y])
    await updateReceipt(A, id, seoulDay(-1), '고친상사', [line(x, 1, 900, 900), line(y, 2, 0)])
    const changed = await receiptNow(id)
    expect(changed.head).toEqual({ ...saved.head, vendor: '고친상사' })
    expect(await itemNow(x)).toMatchObject({ unit_price: 900, vendor: '고친상사', ordered_at: expect.any(Date) })
    expect(await itemNow(y)).toMatchObject({ qty: 2, unit_price: null, vendor: '고친상사', ordered_at: expect.any(Date) })
    await operator()
    await rows(`update public.inventory_items set ordered_at = null where id = $1`, [x])
    await deleteReceipt(A, id)
    expect(await itemNow(x)).toMatchObject({ ordered_at: null, qty: 0 })
  })

  it('AC-7501.4: 고치기의 줄 검사는 저장과 같다(0개·101개·남의 물품·수량 0·날짜가 내일이면 오류이고 그대로)', async () => {
    const theirs = await seedItem(B, await seedCategory(B))
    const id = await saveReceipt(A, seoulDay(-1), '가짜상사', null, [line(x, 10)])
    const old = await dump()
    for (const [label, day, lines] of [
      ['0개', seoulDay(), []],
      ['101개', seoulDay(), Array.from({ length: 101 }, () => line(x, 1))],
      ['남의 물품', seoulDay(), [line(x, 1), line(theirs, 1)]],
      ['수량 0', seoulDay(), [{ item_id: x, qty: 0, amount: 0 }]],
      ['배열 아님', seoulDay(), { item_id: x }],
      ['내일', seoulDay(1), [line(x, 1)]],
      ['날짜 없음', null, [line(x, 1)]],
    ] as [string, string | null, unknown][]) {
      await expect(updateReceipt(A, id, day, '가짜상사', lines), label).rejects.toMatchObject(BAD)
    }
    expect(await dump()).toEqual(old)
  })

  it('AC-7501.4: 남의 입고·없는 입고는 고치기·지우기가 오류 22023이고 아무것도 바뀌지 않는다', async () => {
    const bCat = await seedCategory(B)
    const bItem = await seedItem(B, bCat)
    const theirs = await saveReceipt(B, seoulDay(), null, `${hospital[B]}/${PHOTO_ID}.jpg`, [line(bItem, 3)])
    await saveReceipt(A, seoulDay(), null, null, [line(x, 1)])
    const old = await dump()
    await expect(updateReceipt(A, theirs, seoulDay(), null, [line(x, 1)])).rejects.toMatchObject(BAD)
    await expect(updateReceipt(A, theirs, seoulDay(), null, [line(bItem, 1)])).rejects.toMatchObject(BAD)
    await expect(deleteReceipt(A, theirs)).rejects.toMatchObject(BAD)
    await expect(updateReceipt(A, OTHER_ID, seoulDay(), null, [line(x, 1)])).rejects.toMatchObject(BAD)
    await expect(deleteReceipt(A, OTHER_ID)).rejects.toMatchObject(BAD)
    expect(await dump()).toEqual(old)
  })
})

describe('AC-7501.5 set_inventory_order', SLOW, () => {
  it('AC-7501.5: 내 병원 물품의 차례가 배열 차례(0부터)가 되고, 남의 id·없는 id는 무시되며, 배열에 없는 물품은 그대로다', async () => {
    const cat = await seedCategory(A)
    const [p, q, s, t] = [
      await seedItem(A, cat, { name: '가', sort_order: 0 }),
      await seedItem(A, cat, { name: '나', sort_order: 1 }),
      await seedItem(A, cat, { name: '다', sort_order: 2 }),
      await seedItem(A, cat, { name: '라', sort_order: 7 }),
    ]
    const theirs = await seedItem(B, await seedCategory(B), { sort_order: 5 })
    await setOrder(A, [s, p, q])
    expect([(await itemNow(s)).sort_order, (await itemNow(p)).sort_order, (await itemNow(q)).sort_order]).toEqual([0, 1, 2])
    await setOrder(A, [q, theirs, OTHER_ID, s])
    expect((await itemNow(q)).sort_order).toBe(0)
    expect((await itemNow(s)).sort_order).toBe(3)
    expect((await itemNow(p)).sort_order).toBe(1)
    expect((await itemNow(t)).sort_order).toBe(7)
    expect((await itemNow(theirs)).sort_order).toBe(5)
    await setOrder(A, [])
    expect((await itemNow(q)).sort_order).toBe(0)
  })
})

describe('AC-7501.6 사진 바구니 inventory-photos', SLOW, () => {
  const photoOf = (owner: string, id = PHOTO_ID) => `${hospital[owner]}/${id}.jpg`
  const upload = (name: string, bucket = BUCKET) =>
    rows(`insert into storage.objects (bucket_id, name) values ($1, $2) returning bucket_id, name`, [bucket, name])
  async function seedObject(name: string, bucket = BUCKET) {
    await operator()
    await rows(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name])
  }
  async function objects() {
    await operator()
    return rows(`select bucket_id, name from storage.objects order by 1, 2`)
  }

  it('AC-7501.6: 바구니는 공개가 아니고 한 파일 3,000,000바이트·image/jpeg만이다', async () => {
    await operator()
    expect(await rows(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET])).toEqual([
      { id: BUCKET, name: BUCKET, public: false, file_size_limit: 3_000_000, allowed_mime_types: ['image/jpeg'] },
    ])
  })

  it('AC-7501.6: 이 바구니 정책은 읽기·올리기·지우기 셋(고치기 없음)이고 authenticated·첫 폴더 = my_hospital_id()로 거른다', async () => {
    const list = (
      await rows(
        `select schemaname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies where schemaname = 'storage' order by cmd`,
      )
    ).filter((policy) => isOurStoragePolicy(policy))
    expect(list.map((p) => p.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT'])
    for (const policy of list) {
      expect(policy).toMatchObject({ permissive: 'PERMISSIVE', roles: '{authenticated}' })
      const rule = String(policy.cmd === 'INSERT' ? policy.with_check : policy.qual)
      expect(rule).toContain(`bucket_id = '${BUCKET}'::text`)
      expect(rule).toContain('(storage.foldername(name))[1]')
      expect(rule).toContain('my_hospital_id()')
      expect(rule).not.toMatch(/my_desk|my_clinic/)
    }
  })

  it('AC-7501.6: A는 내 병원 폴더에 사진을 올리고 읽고 지운다', async () => {
    await become(A)
    expect(await upload(photoOf(A))).toEqual([{ bucket_id: BUCKET, name: photoOf(A) }])
    expect(await rows(`select name from storage.objects`)).toEqual([{ name: photoOf(A) }])
    expect(await rows(`delete from storage.objects where name = $1 returning name`, [photoOf(A)])).toEqual([{ name: photoOf(A) }])
    expect(await objects()).toEqual([])
  })

  it('AC-7501.6: A는 다른 병원 폴더·폴더 없는 이름·다른 바구니에는 올리지 못한다', async () => {
    for (const [name, bucket] of [
      [photoOf(B), BUCKET],
      [`${PHOTO_ID}.jpg`, BUCKET],
      [`${OTHER_ID}/${PHOTO_ID}.jpg`, BUCKET],
      [photoOf(A), OTHER_BUCKET],
    ]) {
      await become(A)
      await expect(upload(name, bucket), `${bucket}/${name}`).rejects.toThrow(/row-level security/)
    }
    expect(await objects()).toEqual([])
  })

  it('AC-7501.6: A에게 B 병원 사진·다른 바구니의 내 폴더 파일은 안 보이고 안 지워지며, 고치기(이름·자리 바꾸기)는 내 사진도 0줄이다', async () => {
    await seedObject(photoOf(A))
    await seedObject(photoOf(B))
    await seedObject(photoOf(A, OTHER_ID), OTHER_BUCKET)
    const old = await objects()
    await become(A)
    expect(await rows(`select bucket_id, name from storage.objects`)).toEqual([{ bucket_id: BUCKET, name: photoOf(A) }])
    expect(await rows(`update storage.objects set name = $1 returning name`, [photoOf(A, OTHER_ID)])).toEqual([])
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`delete from storage.objects where bucket_id <> $1 or name <> $2 returning name`, [BUCKET, photoOf(A)])).toEqual([])
    expect(await objects()).toEqual(old)
  })

  it.each(OUTSIDERS)('AC-7501.6: %s 사용자는 사진을 못 보고 못 올리고 못 지운다', async (_label, user) => {
    await seedObject(photoOf(A))
    if (hospital[user]) await seedObject(photoOf(user))
    const old = await objects()
    await become(user)
    expect(await rows(`select name from storage.objects`)).toEqual([])
    const own = hospital[user] ? photoOf(user, OTHER_ID) : `${OTHER_ID}/${PHOTO_ID}.jpg`
    for (const name of [own, photoOf(A, OTHER_ID)]) {
      await become(user)
      await expect(upload(name)).rejects.toThrow(/row-level security/)
    }
    await become(user)
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(old)
  })

  it('AC-7501.6: anon은 사진을 못 보고 못 올리고 못 고치고 못 지운다', async () => {
    await seedObject(photoOf(A))
    const old = await objects()
    await becomeAnon()
    expect(await rows(`select name from storage.objects`)).toEqual([])
    await expect(upload(photoOf(A, OTHER_ID))).rejects.toThrow(/row-level security/)
    await becomeAnon()
    expect(await rows(`update storage.objects set metadata = '{}'::jsonb returning name`)).toEqual([])
    expect(await rows(`delete from storage.objects returning name`)).toEqual([])
    expect(await objects()).toEqual(old)
  })
})

describe('AC-7501.7 다른 것은 그대로', SLOW, () => {
  it('AC-7501.7: 표 일곱·함수 다섯·사진 바구니와 그 정책 셋만 더하고, my_hospital_id()·다른 표·함수·정책·Storage 정책·버킷은 그대로다', () => {
    expect(before.columns.some((c) => isOurs(c.table_name))).toBe(false)
    expect(withoutInventory(after)).toEqual(before)
    expect(after.access.filter((t) => isOurs(t.relname)).map((t) => t.relname)).toEqual([...TABLES].sort())
    expect(after.functions.filter((f) => FUNCTIONS.includes(String(f.fn))).map((f) => f.fn)).toEqual(FUNCTIONS)
    expect(after.policies.filter((p) => p.schemaname === 'storage').length).toBe(before.policies.filter((p) => p.schemaname === 'storage').length + 3)
    expect(after.buckets.map((b) => b.id)).toEqual([...before.buckets.map((b) => b.id), BUCKET].sort())
    const mine = (shape: Shape) => shape.functions.filter((f) => f.fn === 'my_hospital_id()')
    expect(mine(before)).toHaveLength(1)
    expect(mine(after)).toEqual(mine(before))
    // 앞 migration이 만든 Storage 정책(병원 로고)이 비교에 들어 있다(빈 비교가 아니다)
    expect(before.policies.filter((p) => p.schemaname === 'storage').length).toBeGreaterThan(0)
  })
})

describe('AC-7501.1 두 번 붙여 넣기', SLOW, () => {
  it('AC-7501.1: 다시 붙여도 오류가 없고, 모양·권한·정책·함수·버킷 설정은 이 파일 값이며 넣어 둔 줄·사진은 그대로다', async () => {
    const cat = await seedCategory(A)
    const x = await seedItem(A, cat, { bit_code: 'XH0201' })
    await saveCount(A, seoulDay(-1), [{ item_id: x, qty: 3, expiry: '2027-05-31' }])
    await tick()
    await saveReceipt(A, seoulDay(), '가짜상사', `${hospital[A]}/${PHOTO_ID}.jpg`, [line(x, 2, 200, 100)])
    await become(A)
    await postgrestInsert('public.inventory_aliases', [{ alias: '가짜 거즈 1봉', item_id: x }])
    await operator()
    await rows(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, `${hospital[A]}/${PHOTO_ID}.jpg`])
    // 누가 관리 화면에서 바구니를 공개로 바꿔 두었어도 다시 붙이면 이 파일 값으로 돌아온다
    await rows(`update storage.buckets set public = true, file_size_limit = 1, allowed_mime_types = null where id = $1`, [BUCKET])
    const data = await dump()

    await db.exec(INVENTORY_MIGRATION)

    expect(await shapeOf(db)).toEqual(after)
    expect(await dump()).toEqual(data)
    expect(data.inventory_receipts).toHaveLength(1)
    expect(data.objects).toHaveLength(1)
    // 다시 붙인 뒤에도 함수·권한이 그대로 돈다
    await saveReceipt(A, seoulDay(), null, null, [line(x, 1)])
    expect(await itemNow(x)).toMatchObject({ qty: 6 })
  }, 120_000)
})
