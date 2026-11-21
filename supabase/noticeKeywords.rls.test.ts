import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 내 낱말(꼭 볼 글) DB: 표 둘(notice_keywords·notice_keyword_hits)·권한·맞춤 트리거·목록 함수 다시 만들기
// (notices REQ-7424 AC-7424.3~AC-7424.6, design.md 15절, ADR-035).
// notices.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 차례로
// (auth → … → 데스크 → 20261121000000_notices.sql → 이 파일) 그대로 돌린다. 실제 Supabase에는 붙지 않는다.
// Supabase가 미리 갖춘 것(역할·auth)만 흉내 낸다. 메일·글·낱말은 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
// 앞 migration: notices.rls.test.ts와 같은 차례(auth → … → 예약 → 데스크). 데스크 계정을 만들려고 데스크까지 돌린다
const CHAIN = [
  '20261028000000_auth.sql',
  '20261030000000_precheck_settings.sql',
  '20261101000100_worklog.sql',
  '20261101000110_worklog_bit_fields.sql',
  '20261105000200_worklog_memo_font.sql',
  '20261105000300_worklog_cash_float.sql',
  '20261105000100_stats_rx_groups.sql',
  '20261112000000_stats_rx_groups_exclude.sql',
  '20261116000000_sunap.sql',
  '20261117010000_calendar.sql',
  '20261118100000_desk_accounts.sql',
].map((name) => read(`./migrations/${name}`))
const NOTICES_MIGRATION = read('./migrations/20261121000000_notices.sql')
const KEYWORDS_PATH = fileOf('./migrations/20261121000001_notice_keywords.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·함수가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const KEYWORDS_MIGRATION = existsSync(KEYWORDS_PATH) ? readFileSync(KEYWORDS_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 설명으로 다른 낱말을 말할 수 있다)
const KEYWORDS_SQL = KEYWORDS_MIGRATION.split('\n')
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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A 원장
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B 원장
const P = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const R = '00000000-0000-4000-8000-00000000000d' // 거절
const E = '00000000-0000-4000-8000-00000000000e' // 병원 줄도 데스크 줄도 없는 사용자
const K = '00000000-0000-4000-8000-0000000000d1' // A의 데스크(병원 줄 없음)
const ADMIN = '00000000-0000-4000-8000-0000000000a1' // 관리자(병원 줄 없음)
const COL = '00000000-0000-4000-8000-0000000000c1' // 모으기 계정(병원 줄 없음, notice_collectors에 있음)
const USERS = [A, B, P, R, E, K, ADMIN, COL]
const STATUS: Record<string, 'approved' | 'pending' | 'rejected'> = { [A]: 'approved', [B]: 'approved', [P]: 'pending', [R]: 'rejected' }
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `u${user.slice(-2)}@fake.test`
// 내 낱말 두 표를 못 보는 계정(승인된 원장 밖)
const NO_ACCESS: [string, string][] = [
  ['데스크', K],
  ['승인 대기 원장', P],
  ['거절된 원장', R],
  ['병원 없는 계정', E],
  ['관리자(병원 없음)', ADMIN],
  ['모으기 계정', COL],
]

type Row = Record<string, unknown>
type Page = { total: number; unread: number; rows: Row[] }

const TABLES = ['notice_keywords', 'notice_keyword_hits']
const SOME_COLUMN: Record<string, string> = { notice_keywords: 'word', notice_keyword_hits: 'words' }
// [regprocedure, 정의자인가, authenticated가 부르는가]. 모두 search_path 빔이고 anon·PUBLIC은 못 부른다.
// notice_norm은 줄 제약·만든 칸(word_norm)이 부르므로 넣는 사람(authenticated)이 부를 수 있어야 한다
const NEW_FUNCTIONS: [string, boolean, boolean][] = [
  ['public.notice_norm(text)', false, true],
  ['public.notice_fields(public.notices)', false, false],
  ['public.notice_hit(text[],text)', false, false],
  ['public.notice_keywords_cap()', true, false],
  ['public.notice_keywords_hits()', true, false],
  ['public.notice_hits_rematch()', true, false],
]
// 다시 만드는 목록 함수 둘(인자·돌려주는 모양·호출자 그대로)
const REMADE: [string, string, string][] = [
  [
    'public.notice_list(boolean,text[],boolean,uuid[],boolean,integer,integer)',
    'p_related boolean, p_sources text[], p_starred boolean, p_ids uuid[], p_unread_only boolean, p_limit integer, p_offset integer',
    'jsonb',
  ],
  ['public.notice_unread_count()', '', 'integer'],
]
const nameOf = (fn: string) => fn.replace(/^public\./, '').replace(/\(.*$/, '')
const NEW_FUNCTION_NAMES = NEW_FUNCTIONS.map(([fn]) => nameOf(fn))
const REMADE_NAMES = REMADE.map(([fn]) => nameOf(fn))
const NEW_TRIGGERS = ['notice_keywords_cap', 'notice_keywords_hits', 'notice_hits_rematch']

const HIRA_URL = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=12353'
const FILE_URL = 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157'
const CRTR_URL = 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=20261118&sno=1&mtgMtrRegSno=2'
const MOHW_URL = 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1488000&act=view'
// 시험 낱말이 들지 않은 요약(칸마다 맞춤을 따로 보려고)
const SUMMARY = {
  related: true,
  what: '수가가 바뀌어요',
  when: '2026년 12월 1일부터',
  who: '의원급 의료기관',
  forUs: '우리 의원도 청구 코드를 확인해요',
  amends: ['2026-183'],
}
const NOTICE: Row = {
  group_key: 'gosi:2026-218',
  title: '고시 개정 안내',
  kind: 'gosi',
  posted_on: '2026-11-18',
  notice_no: null,
  body: '본문',
  attach_text: '',
  read_mode: null,
  related: null,
  summary: null,
  rule_hits: [],
  state: 'wait',
  tries: 0,
  batch_id: null,
}
const POST: Row = {
  source: 'hira_notice',
  source_key: '12353',
  title: '고시 개정 안내',
  url: HIRA_URL,
  posted_on: '2026-11-18',
  attachments: [{ name: '붙임1.pdf', url: FILE_URL }],
}

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const CHECK_FAILED = { code: '23514' }
const NOT_NULL = { code: '23502' }
const DUPLICATE = { code: '23505' }
const RLS_OR_NULL = /row-level security|null value/

let db: PGlite
let hospital: Record<string, string> = {}
let seq = 0

async function migrateChain(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  for (const sql of CHAIN) await target.exec(sql)
  await target.exec(NOTICES_MIGRATION)
}

async function operator(target: PGlite = db) {
  await target.exec('reset role; reset request.jwt.claims')
}

/** 그 사용자로 로그인한 것처럼(JWT의 sub·email) */
async function become(user: string, target: PGlite = db) {
  await operator(target)
  await target.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: emailOf(user) })])
  await target.exec('set role authenticated')
}

async function becomeAnon(target: PGlite = db) {
  await operator(target)
  await target.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = [], target: PGlite = db) {
  return (await target.query<Row>(sql, params)).rows
}

async function hasTable(name: string, target: PGlite = db) {
  return (await rows(`select to_regclass($1) is not null as ok`, [name], target))[0].ok === true
}

// PostgREST insert·upsert와 같은 모양: json 줄을 표 모양으로 풀어 보낸 칸만 넣고, upsert는 겹치면 보낸 칸을 모두 SET에 쓴다
function postgrestInsert(table: string, body: Row[], conflict: string | null = null, target: PGlite = db, returning = '') {
  const columns = Object.keys(body[0] ?? {})
  const list = columns.join(', ')
  const onConflict = conflict === null ? '' : `on conflict (${conflict}) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}`
  return target.query<Row>(
    `insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json) ${onConflict} ${returning}`,
    [JSON.stringify(body)],
  )
}

/** 사용자·병원·데스크·관리자·모으기 계정 줄을 넣고 병원 id를 돌려준다(운영자) */
async function seedPeople(target: PGlite) {
  await operator(target)
  const ids: Record<string, string> = {}
  for (const user of USERS) {
    await target.query('insert into auth.users (id, email) values ($1, $2)', [user, emailOf(user)])
    const status = STATUS[user]
    if (status === undefined) continue
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status) values ($1, $2, '홍길동', $3, $4) returning id`,
      [user, `가짜병원${user.slice(-1)}`, emailOf(user), status],
      target,
    )
    ids[user] = row.id as string
  }
  await target.query('insert into public.hospital_members (hospital_id, email) values ($1, $2)', [ids[A], emailOf(K)])
  await target.query('insert into public.admins (user_id) values ($1)', [ADMIN])
  await target.query('insert into public.notice_collectors (user_id) values ($1)', [COL])
  return ids
}

// 시험마다 빈 표에서 시작한다(병원·낱말·맞춤·표시 줄은 auth.users·notices를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.exec('truncate public.notices cascade')
  hospital = await seedPeople(db)
}

/** 한국 날짜 오늘에서 n일 앞('YYYY-MM-DD') */
function daysBefore(n: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** 운영자가 묶음 하나를 넣고 id를 돌려준다(겹치지 않는 group_key) */
async function seedNotice(values: Row = {}, target: PGlite = db) {
  await operator(target)
  seq += 1
  const result = await postgrestInsert('public.notices', [{ ...NOTICE, group_key: `post:hira_notice:k${seq}`, ...values }], null, target, 'returning id')
  return result.rows[0].id as string
}

/** 모으기 계정이 묶음 하나를 넣고 id를 돌려준다 */
async function collectNotice(values: Row = {}) {
  await become(COL)
  seq += 1
  const result = await postgrestInsert('public.notices', [{ ...NOTICE, group_key: `post:hira_notice:c${seq}`, ...values }], null, db, 'returning id')
  return result.rows[0].id as string
}

/** 모으기 계정이 그 묶음의 칸 하나를 고친다 */
async function collectorSets(noticeId: string, column: string, value: unknown) {
  await become(COL)
  const cast = column === 'summary' ? '::jsonb' : ''
  return db.query(`update public.notices set ${column} = $1${cast} where id = $2`, [
    column === 'summary' ? JSON.stringify(value) : value,
    noticeId,
  ])
}

/** 운영자가 그 묶음에 출처 글 하나를 넣는다(겹치지 않는 source_key) */
async function seedPost(noticeId: string, values: Row = {}) {
  await operator()
  seq += 1
  await postgrestInsert('public.notice_posts', [{ ...POST, source_key: `k${seq}`, ...values, notice_id: noticeId }])
}

/** 운영자가 그 원장 병원의 표시 줄을 넣는다 */
async function seedMark(owner: string, noticeId: string, values: Row) {
  await operator()
  await postgrestInsert('public.notice_marks', [{ hospital_id: hospital[owner], notice_id: noticeId, ...values }])
}

/** 그 원장이 화면처럼 낱말 하나를 넣는다(word만) */
async function addWord(user: string, word: string) {
  await become(user)
  return postgrestInsert('public.notice_keywords', [{ word }])
}

/** 그 원장이 화면처럼 낱말 하나를 지운다(word = 낱말) */
async function removeWord(user: string, word: string) {
  await become(user)
  return db.query(`delete from public.notice_keywords where word = $1`, [word])
}

/** 그 사용자 눈으로 본 낱말(화면 읽기 차례: created_at, word_norm) */
async function wordsSeenBy(user: string) {
  await become(user)
  return (await rows(`select word from public.notice_keywords order by created_at, word_norm`)).map((r) => r.word)
}

/** 운영자 눈으로 본 낱말 표 */
async function keywordsNow() {
  await operator()
  return rows(`select hospital_id, word, word_norm from public.notice_keywords order by hospital_id, created_at, word_norm`)
}

const OWNER_NAME = () => ({ [hospital[A]]: 'A', [hospital[B]]: 'B' }) as Record<string, string>

/** 운영자 눈으로 본 맞춤 줄: { 'A:<글 id>': [낱말…] } */
async function hitsNow() {
  await operator()
  const names = OWNER_NAME()
  const found = await rows(`select hospital_id, notice_id, words from public.notice_keyword_hits`)
  return Object.fromEntries(found.map((r) => [`${names[String(r.hospital_id)] ?? String(r.hospital_id)}:${String(r.notice_id)}`, r.words]))
}

/** 지금 역할로 함수 하나를 불러 첫 칸 값을 돌려준다 */
async function call(sql: string, params: unknown[] = []) {
  const [row] = await rows(`select ${sql} as v`, params)
  return row.v
}

type ListArgs = {
  related?: boolean
  sources?: string[] | null
  starred?: boolean
  ids?: string[] | null
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

/** 그 사용자로 notice_list */
async function list(user: string, a: ListArgs = {}) {
  await become(user)
  const [row] = await rows(`select public.notice_list($1::boolean, $2::text[], $3::boolean, $4::uuid[], $5::boolean, $6::integer, $7::integer) as r`, [
    a.related ?? false,
    a.sources === undefined ? null : a.sources,
    a.starred ?? false,
    a.ids ?? null,
    a.unreadOnly ?? false,
    a.limit ?? 50,
    a.offset ?? 0,
  ])
  return row.r as Page
}

const idsOf = (page: Page) => page.rows.map((r) => r.id)

async function unreadCount(user: string) {
  await become(user)
  return call('public.notice_unread_count()')
}

// 이 파일이 손댈 수 있는 것 전부: public 표의 칸·제약·권한(표·칸)·색인·트리거, 모든 정책, public 함수
async function shapeOf(target: PGlite) {
  await operator(target)
  const q = (sql: string) => rows(sql, [], target)
  return {
    columns: await q(
      `select table_name, column_name, data_type, is_nullable, column_default, is_generated, generation_expression from information_schema.columns
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
      `select p.proname as name, p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def, p.prosecdef as definer, p.proconfig as config,
              (select array_agg(item::text order by item::text) from unnest(p.proacl) item) as acl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 2`,
    ),
  }
}
type Shape = Awaited<ReturnType<typeof shapeOf>>

/** 이 파일이 만든 것(표 둘에 딸린 것·새 함수·새 트리거)과 다시 만든 목록 함수 둘을 뺀 모양 */
function withoutKeywords(shape: Shape): Shape {
  const mine = (name: unknown) => TABLES.includes(String(name).replace(/^public\./, ''))
  return {
    columns: shape.columns.filter((c) => !mine(c.table_name)),
    constraints: shape.constraints.filter((c) => !mine(c.tbl)),
    access: shape.access.filter((t) => !mine(t.relname)),
    indexes: shape.indexes.filter((i) => !mine(i.tablename)),
    policies: shape.policies.filter((p) => !mine(p.tablename)),
    triggers: shape.triggers.filter((t) => !mine(t.tbl) && !NEW_TRIGGERS.includes(String(t.tgname))),
    functions: shape.functions.filter((f) => ![...NEW_FUNCTION_NAMES, ...REMADE_NAMES].includes(String(f.name))),
  }
}

/** 다시 만든 목록 함수 둘의 본문 밖 모양(이름·인자·정의자·search_path·권한) */
const remadeOf = (shape: Shape) =>
  shape.functions.filter((f) => REMADE_NAMES.includes(String(f.name))).map((f) => ({ fn: f.fn, definer: f.definer, config: f.config, acl: f.acl }))

/** migration 글에서 함수 하나의 `create or replace function … $$;` 글 */
function functionText(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) return ''
  const end = sql.indexOf('\n$$;', start)
  return end < 0 ? '' : sql.slice(start, end + 4)
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrateChain(db)
  await db.exec(KEYWORDS_MIGRATION)
}, 180_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-7424.3 표 둘·RLS·권한·두 번 붙여 넣기', SLOW, () => {
  it('AC-7424.3: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·먼저 들어갈 notices.sql·두 번 붙여도 됨·REQ가 있다', () => {
    expect(KEYWORDS_MIGRATION).not.toBe('')
    expect(KEYWORDS_MIGRATION).not.toContain('\r')
    const lines = KEYWORDS_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toMatch(/먼저[^\n]*20261121000000_notices\.sql/)
    expect(head).toMatch(/두 번 붙여 넣어도/)
    // 첫 파일을 다시 붙이면 목록 함수가 낱말 없는 판으로 돌아가므로 이 파일도 다시 붙인다(design 13절)
    expect(head).toMatch(/20261121000000_notices\.sql을 다시 붙이면[^\n]*이 파일도 다시/)
    expect(head).toContain('REQ-7424')
    expect(head).toContain('ADR-035')
  })

  it('AC-7424.3: 두 번 돌려도 되는 문장만 쓴다(표·색인 if not exists, 함수·트리거 or replace, 정책 지우고 다시 만들기)', () => {
    expect(KEYWORDS_SQL).not.toBe('')
    expect(KEYWORDS_SQL).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists\s)/i)
    expect(KEYWORDS_SQL).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists\s)/i)
    expect(KEYWORDS_SQL).not.toMatch(/create\s+function/i)
    expect(KEYWORDS_SQL).not.toMatch(/create\s+trigger/i)
    expect(KEYWORDS_SQL).not.toMatch(/\btruncate\b|\bdrop\s+(table|function|column|trigger)\b|service_role/i)
    const policies = [...KEYWORDS_SQL.matchAll(/create policy ("[^"]+") on (public\.\w+)/g)]
    expect(policies.length).toBeGreaterThan(0)
    for (const [, name, table] of policies) expect(KEYWORDS_SQL).toContain(`drop policy if exists ${name} on ${table};`)
  })

  it('AC-7424.3: 첫 파일의 공용 함수(my_hospital_id·is_notice_collector 등)는 다시 만들지 않고 그대로 쓴다', () => {
    const made = [...KEYWORDS_SQL.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])
    expect(made.sort()).toEqual([...NEW_FUNCTION_NAMES, ...REMADE_NAMES].sort())
    expect(KEYWORDS_SQL).toContain('public.my_hospital_id()')
  })

  it('AC-7424.3: 표 둘이 있고 모두 RLS가 켜져 있다', async () => {
    const found = await rows(
      `select c.relname, c.relrowsecurity from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname in ('notice_keywords', 'notice_keyword_hits')
       order by c.relname`,
    )
    expect(found).toEqual([
      { relname: 'notice_keyword_hits', relrowsecurity: true },
      { relname: 'notice_keywords', relrowsecurity: true },
    ])
  })

  it.each(TABLES)('AC-7424.3: anon은 %s를 읽고 넣고 고치고 지우지 못한다(권한 없음)', async (table) => {
    const column = SOME_COLUMN[table]
    await becomeAnon()
    await expect(db.query(`select * from public.${table}`)).rejects.toMatchObject(DENIED)
    await becomeAnon()
    await expect(db.query(`insert into public.${table} default values`)).rejects.toMatchObject(DENIED)
    await becomeAnon()
    await expect(db.query(`update public.${table} set ${column} = ${column}`)).rejects.toMatchObject(DENIED)
    await becomeAnon()
    await expect(db.query(`delete from public.${table}`)).rejects.toMatchObject(DENIED)
  })

  it('AC-7424.3: anon·PUBLIC은 표 둘에 표·칸 권한이 하나도 없다', async () => {
    expect(await hasTable('public.notice_keywords')).toBe(true)
    for (const table of TABLES) {
      for (const role of ['anon', 'public']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const [r] = await rows(`select has_table_privilege($1, $2, $3) as ok`, [role, `public.${table}`, privilege])
          expect([table, role, privilege, r.ok]).toEqual([table, role, privilege, false])
        }
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
          const [r] = await rows(`select has_any_column_privilege($1, $2, $3) as ok`, [role, `public.${table}`, privilege])
          expect([table, role, privilege, r.ok]).toEqual([table, role, privilege, false])
        }
      }
    }
  })

  it.each<[string, string[], string[]]>([
    ['notice_keywords', ['DELETE', 'SELECT'], ['word']],
    ['notice_keyword_hits', ['SELECT'], []],
  ])('AC-7424.3: authenticated의 %s 표 권한은 %j이고 넣기 칸은 %j뿐이며 고치기 칸은 없다', async (table, tablePrivileges, insertColumns) => {
    expect(await hasTable(`public.${table}`)).toBe(true)
    const found = await rows(
      `select privilege_type from information_schema.table_privileges where grantee = 'authenticated' and table_schema = 'public' and table_name = $1`,
      [table],
    )
    expect(found.map((r) => r.privilege_type).sort()).toEqual(tablePrivileges)
    const columns = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = $1 and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')`,
      [table],
    )
    expect(columns.filter((r) => r.privilege_type === 'INSERT').map((r) => r.column_name)).toEqual(insertColumns)
    expect(columns.filter((r) => r.privilege_type !== 'INSERT')).toEqual([])
  })

  it('AC-7424.3: 정책은 낱말 표에 읽기·넣기·지우기, 맞춤 표에 읽기뿐이고 모두 authenticated·내 병원 조건이다', async () => {
    const found = await rows(
      `select tablename, cmd, roles::text[] as roles, qual, with_check from pg_policies
       where schemaname = 'public' and tablename in ('notice_keywords', 'notice_keyword_hits')`,
    )
    const cmdsOf = (table: string) =>
      found
        .filter((p) => p.tablename === table)
        .map((p) => p.cmd)
        .sort()
    expect(cmdsOf('notice_keywords')).toEqual(['DELETE', 'INSERT', 'SELECT'])
    expect(cmdsOf('notice_keyword_hits')).toEqual(['SELECT'])
    for (const p of found) {
      expect(p.roles).toEqual(['authenticated'])
      expect(String(p.qual ?? p.with_check)).toMatch(/^\(hospital_id = \( SELECT my_hospital_id\(\) AS my_hospital_id\)\)$/)
    }
  })

  it.each(NEW_FUNCTIONS)('AC-7424.3: 새 함수 %s는 정의자=%s·search_path 빔이고 authenticated 부름=%s(anon·PUBLIC 못 부름)', async (fn, definer, callable) => {
    const [found] = await rows(`select p.prosecdef as definer, p.proconfig as config from pg_proc p where p.oid = to_regprocedure($1)`, [fn])
    expect(found).toEqual({ definer, config: ['search_path=""'] })
    for (const [role, ok] of [
      ['authenticated', callable],
      ['anon', false],
      ['public', false],
    ] as const) {
      const [r] = await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn])
      expect([fn, role, r.ok]).toEqual([fn, role, ok])
    }
  })

  it('AC-7424.3: 맞춤 트리거는 낱말 표(넣기 앞 30개 세기·넣기와 지우기 뒤 맞춤)와 글 표(넣기·제목·본문·붙임·요약 고치기 뒤)에만 걸린다', async () => {
    const found = await rows(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where not tgisinternal and tgname = any ($1::text[]) order by tgname`,
      [NEW_TRIGGERS],
    )
    expect(found.map((t) => [t.tbl, t.tgname])).toEqual([
      ['notices', 'notice_hits_rematch'],
      ['notice_keywords', 'notice_keywords_cap'],
      ['notice_keywords', 'notice_keywords_hits'],
    ])
    const defOf = (name: string) => String(found.find((t) => t.tgname === name)?.def)
    expect(defOf('notice_keywords_cap')).toMatch(/BEFORE INSERT ON public\.notice_keywords FOR EACH ROW EXECUTE FUNCTION notice_keywords_cap\(\)/)
    expect(defOf('notice_keywords_hits')).toMatch(/AFTER INSERT OR DELETE ON public\.notice_keywords FOR EACH ROW EXECUTE FUNCTION notice_keywords_hits\(\)/)
    expect(defOf('notice_hits_rematch')).toMatch(
      /AFTER INSERT OR UPDATE OF title, body, attach_text, summary ON public\.notices FOR EACH ROW EXECUTE FUNCTION notice_hits_rematch\(\)/,
    )
  })

  it('AC-7424.3: anon은 낱말 정규화·목록 함수를 부르지 못한다(권한 없음)', async () => {
    for (const sql of ["public.notice_norm('MRI')", 'public.notice_list(false, null, false, null, false, 50, 0)', 'public.notice_unread_count()']) {
      await becomeAnon()
      await expect(db.query(`select * from ${sql}`)).rejects.toMatchObject(DENIED)
    }
  })

  it('AC-7424.3: auth.sql·notices.sql만 들어간 DB에도 오류 없이 붙는다', async () => {
    const bare = await PGlite.create()
    try {
      await bare.exec(SUPABASE_MOCK)
      await bare.exec(AUTH_MIGRATION)
      await bare.exec(NOTICES_MIGRATION)
      await bare.exec(KEYWORDS_MIGRATION)
      const [r] = await rows(
        `select count(*)::int as n from pg_class where relnamespace = 'public'::regnamespace and relname in ('notice_keywords', 'notice_keyword_hits') and relkind = 'r'`,
        [],
        bare,
      )
      expect(r.n).toBe(2)
    } finally {
      await bare.close()
    }
  })

  describe('이미 있는 DB에 붙여 넣기', () => {
    let fresh: PGlite
    let ids: Record<string, string> = {}
    let before: Shape
    let once: Shape

    beforeAll(async () => {
      fresh = await PGlite.create()
      await migrateChain(fresh)
      before = await shapeOf(fresh)
      await operator(fresh)
      await fresh.exec(KEYWORDS_MIGRATION)
      once = await shapeOf(fresh)
      ids = await seedPeople(fresh)
    }, 240_000)

    afterAll(async () => {
      await fresh.close()
    })

    async function dump() {
      return {
        keywords: await rows(`select * from public.notice_keywords order by hospital_id, word_norm`, [], fresh),
        hits: await rows(`select * from public.notice_keyword_hits order by hospital_id, notice_id`, [], fresh),
        notices: await rows(`select * from public.notices order by id`, [], fresh),
      }
    }

    it('AC-7424.3: 이 파일 밖의 표·칸·제약·권한·색인·정책·트리거·함수는 그대로이고, 목록 함수 둘은 본문만 바뀐다', () => {
      expect(withoutKeywords(once)).toEqual(withoutKeywords(before))
      expect(remadeOf(once)).toEqual(remadeOf(before))
      expect(remadeOf(once)).toHaveLength(2)
      const added = once.functions.filter((f) => !before.functions.some((b) => b.fn === f.fn)).map((f) => String(f.name))
      expect(added.sort()).toEqual([...NEW_FUNCTION_NAMES].sort())
      const listDef = (s: Shape) => String(s.functions.find((f) => f.name === 'notice_list')?.def)
      expect(listDef(before)).not.toContain('notice_keyword_hits')
      expect(listDef(once)).toContain('notice_keyword_hits')
    })

    it('AC-7424.3: 두 번째로 붙여도 오류가 없고, 모양과 이미 있던 낱말·맞춤·글 줄이 그대로다', async () => {
      await operator(fresh)
      seq += 1
      await postgrestInsert('public.notices', [{ ...NOTICE, group_key: `post:hira_notice:r${seq}`, body: '도수치료 기준' }], null, fresh)
      await fresh.query(`insert into public.notice_keywords (hospital_id, word) values ($1, '도수치료'), ($1, 'MRI'), ($2, '도수 치료')`, [
        ids[A],
        ids[B],
      ])
      const data = await dump()
      expect(data.hits).toHaveLength(2)
      await operator(fresh)
      await fresh.exec(KEYWORDS_MIGRATION)
      expect(await shapeOf(fresh)).toEqual(once)
      expect(await dump()).toEqual(data)
    })

    it('AC-7424.3: 첫 파일을 다시 붙인 뒤 이 파일을 다시 붙여도 오류가 없고 모양·줄이 그대로다(design 13절)', async () => {
      const data = await dump()
      await operator(fresh)
      await fresh.exec(NOTICES_MIGRATION)
      await fresh.exec(KEYWORDS_MIGRATION)
      expect(await shapeOf(fresh)).toEqual(once)
      expect(await dump()).toEqual(data)
    })
  })
})

describe('AC-7424.3 내 병원 낱말·맞춤 줄만', SLOW, () => {
  it('AC-7424.3: 원장 A는 word만 넣고 그 줄은 A 병원 줄이 되며 word_norm·created_at은 DB가 채운다', async () => {
    await addWord(A, '관절강내 주사')
    await operator()
    const found = await rows(`select hospital_id, word, word_norm, created_at > now() - interval '1 hour' as fresh from public.notice_keywords`)
    expect(found).toEqual([{ hospital_id: hospital[A], word: '관절강내 주사', word_norm: '관절강내주사', fresh: true }])
  })

  it.each<[string, Row, { code: string }]>([
    ['hospital_id', { word: '도수치료', hospital_id: '00000000-0000-4000-8000-00000000ffff' }, DENIED],
    ['created_at', { word: '도수치료', created_at: '2026-01-01T00:00:00Z' }, DENIED],
    // 만든 칸(generated)은 권한을 보기 전에 누구의 값도 받지 않는다(428C9)
    ['word_norm', { word: '도수치료', word_norm: '도수치료' }, { code: '428C9' }],
  ])('AC-7424.3: 원장도 %s를 넣어 보내면 거부된다', async (_column, body, error) => {
    await become(A)
    await expect(postgrestInsert('public.notice_keywords', [body])).rejects.toMatchObject(error)
    expect(await keywordsNow()).toEqual([])
  })

  it('AC-7424.3: 원장마다 내 병원 낱말만 넣은 차례로 보고, word로 내 줄만 지우며 남의 줄은 지우지 못한다', async () => {
    await addWord(A, '체외충격파')
    await addWord(A, '도수치료')
    await addWord(B, 'MRI')
    await addWord(B, '도수치료')
    expect(await wordsSeenBy(A)).toEqual(['체외충격파', '도수치료'])
    expect(await wordsSeenBy(B)).toEqual(['MRI', '도수치료'])
    expect((await removeWord(A, 'MRI')).affectedRows).toBe(0)
    expect((await removeWord(A, '도수치료')).affectedRows).toBe(1)
    expect(await wordsSeenBy(A)).toEqual(['체외충격파'])
    expect(await wordsSeenBy(B)).toEqual(['MRI', '도수치료'])
  })

  it('AC-7424.3: 원장도 낱말 줄을 고치지 못한다(권한 없음)', async () => {
    await addWord(A, '도수치료')
    await become(A)
    await expect(db.query(`update public.notice_keywords set word = '도수'`)).rejects.toMatchObject(DENIED)
    expect((await keywordsNow()).map((k) => k.word)).toEqual(['도수치료'])
  })

  it('AC-7424.3: 원장마다 내 병원 맞춤 줄만 본다', async () => {
    const id = await seedNotice({ body: '도수치료와 MRI 기준' })
    await addWord(A, '도수치료')
    await addWord(B, 'MRI')
    await become(A)
    expect(await rows(`select hospital_id, notice_id, words from public.notice_keyword_hits`)).toEqual([
      { hospital_id: hospital[A], notice_id: id, words: ['도수치료'] },
    ])
    await become(B)
    expect(await rows(`select hospital_id, notice_id, words from public.notice_keyword_hits`)).toEqual([
      { hospital_id: hospital[B], notice_id: id, words: ['MRI'] },
    ])
  })

  it.each<[string, string]>([
    ['원장 A', A],
    ['원장 B', B],
    ['모으기 계정', COL],
    ['관리자', ADMIN],
    ['데스크', K],
  ])('AC-7424.3: %s는 맞춤 줄을 직접 넣고 고치고 지우지 못한다(권한 없음)', async (_name, user) => {
    const id = await seedNotice({ body: '도수치료' })
    await addWord(A, '도수치료')
    const before = await hitsNow()
    await become(user)
    await expect(
      db.query(`insert into public.notice_keyword_hits (hospital_id, notice_id, words) values ($1, $2, '{가짜}')`, [hospital[A], id]),
    ).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`update public.notice_keyword_hits set words = '{가짜}'`)).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`delete from public.notice_keyword_hits`)).rejects.toMatchObject(DENIED)
    expect(await hitsNow()).toEqual(before)
  })

  it.each(NO_ACCESS)('AC-7424.3: %s는 두 표 모두 0줄이고 낱말 넣기는 거부되며 지우기는 0줄이다', async (_name, user) => {
    await seedNotice({ body: '도수치료' })
    await addWord(A, '도수치료')
    const before = { keywords: await keywordsNow(), hits: await hitsNow() }
    for (const table of TABLES) {
      await become(user)
      expect([table, await rows(`select * from public.${table}`)]).toEqual([table, []])
    }
    await become(user)
    await expect(postgrestInsert('public.notice_keywords', [{ word: 'MRI' }])).rejects.toThrow(RLS_OR_NULL)
    expect((await removeWord(user, '도수치료')).affectedRows).toBe(0)
    expect({ keywords: await keywordsNow(), hits: await hitsNow() }).toEqual(before)
  })

  it('AC-7424.3: 병원을 지우면 그 병원 낱말·맞춤 줄도 지워지고 다른 병원 줄은 그대로다', async () => {
    const id = await seedNotice({ body: '도수치료' })
    await addWord(A, '도수치료')
    await addWord(B, '도수치료')
    await operator()
    await db.query(`delete from public.hospitals where id = $1`, [hospital[A]])
    expect((await keywordsNow()).map((k) => k.hospital_id)).toEqual([hospital[B]])
    expect(await hitsNow()).toEqual({ [`B:${id}`]: ['도수치료'] })
  })
})

describe('AC-7424.4 낱말 줄 제약', SLOW, () => {
  it.each<[string, string]>([
    ['한 글자', '뼈'],
    ['20자', '가'.repeat(20)],
    ['가운데 빈칸', '관절강내 주사'],
    ['영문 대문자', 'MRI'],
    ['가운데 전각 빈칸', '비대면　진료'],
    ['문장 부호', 'X-ray·CT'],
  ])('AC-7424.4: %s 낱말은 들어간다', async (_name, word) => {
    await addWord(A, word)
    expect((await keywordsNow()).map((k) => k.word)).toEqual([word])
  })

  it.each<[string, string]>([
    ['빈 글자', ''],
    ['빈칸만', ' '],
    ['앞 빈칸', ' 도수치료'],
    ['뒤 빈칸', '도수치료 '],
    ['앞 전각 빈칸(U+3000)', '　도수치료'],
    ['뒤 줄바꿈 없는 빈칸(U+00A0)', '도수치료 '],
    ['줄바꿈 없는 빈칸만(정규화하면 빈 글자)', ' '],
    ['21자', '가'.repeat(21)],
    ['탭', '도수\t치료'],
    ['줄바꿈', '도수\n치료'],
    ['캐리지 리턴', '도수\r치료'],
    ['그 밖 제어 문자', '도수\u0007치료'],
  ])('AC-7424.4: %s 낱말은 거부된다(23514)', async (_name, word) => {
    await expect(addWord(A, word)).rejects.toMatchObject(CHECK_FAILED)
    expect(await keywordsNow()).toEqual([])
  })

  it('AC-7424.4: word가 null이면 거부된다(23502)', async () => {
    await become(A)
    await expect(db.query(`insert into public.notice_keywords (word) values (null)`)).rejects.toMatchObject(NOT_NULL)
  })

  it.each<[string, string]>([
    ['관절강내 주사', '관절강내주사'],
    ['관절강내주사', '관절강 내 주사'],
    ['MRI', 'mri'],
    ['Mri 검사', 'mRI검사'],
    ['도수치료', '도수치료'],
    ['비대면 진료', '비대면　진료'],
    ['비대면 진료', '비대면 진료'],
  ])('AC-7424.4: 정규화가 같은 낱말(%s · %s)은 한 병원에 하나만이다(23505)', async (first, second) => {
    await addWord(A, first)
    await expect(addWord(A, second)).rejects.toMatchObject(DUPLICATE)
    expect((await keywordsNow()).map((k) => k.word)).toEqual([first])
  })

  it('AC-7424.4: 정규화는 A~Z만 소문자로 바꿔 전각 영문은 다른 낱말이다', async () => {
    await addWord(A, 'MRI')
    await addWord(A, 'ＭＲＩ')
    expect((await keywordsNow()).map((k) => k.word_norm)).toEqual(['mri', 'ＭＲＩ'])
  })

  it('AC-7424.4: 다른 병원은 같은 낱말을 따로 가진다', async () => {
    await addWord(A, '도수치료')
    await addWord(B, '도수 치료')
    expect((await keywordsNow()).map((k) => [k.hospital_id, k.word_norm])).toEqual(
      [
        [hospital[A], '도수치료'],
        [hospital[B], '도수치료'],
      ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    )
  })

  it('AC-7424.4: 한 병원의 31번째 낱말은 거부되고(23514), 하나를 빼면 다시 넣으며, 다른 병원은 따로 센다', async () => {
    for (let i = 1; i <= 30; i += 1) await addWord(A, `낱말${i}`)
    await expect(addWord(A, '낱말31')).rejects.toMatchObject(CHECK_FAILED)
    expect(await keywordsNow()).toHaveLength(30)
    await addWord(B, '낱말31')
    await removeWord(A, '낱말1')
    await addWord(A, '낱말31')
    expect((await wordsSeenBy(A)).length).toBe(30)
    expect(await wordsSeenBy(A)).toContain('낱말31')
  })

  it('AC-7424.4: 한 문장에 여러 줄을 넣어도 31번째부터 거부되고 그 문장의 줄은 하나도 남지 않는다', async () => {
    await become(A)
    const words = Array.from({ length: 31 }, (_, i) => ({ word: `한꺼번에${i + 1}` }))
    await expect(postgrestInsert('public.notice_keywords', words)).rejects.toMatchObject(CHECK_FAILED)
    expect(await keywordsNow()).toEqual([])
    await become(A)
    await postgrestInsert('public.notice_keywords', words.slice(0, 30))
    expect(await keywordsNow()).toHaveLength(30)
  })

  it('AC-7424.4: 30개 세기는 병원마다 잠근 뒤 센다(같은 때 두 번 넣어도 31개가 되지 않게)', async () => {
    const [found] = await rows(`select pg_get_functiondef(to_regprocedure('public.notice_keywords_cap()')) as def`)
    expect(String(found.def)).toMatch(/pg_advisory_xact_lock\(/)
    expect(String(found.def)).toMatch(/>=\s*30/)
  })

  it('AC-7424.4: notice_norm은 빈칸·탭·줄바꿈·U+00A0·U+3000을 빼고 A~Z만 소문자로 바꾼다(normKeyword와 같은 규칙)', async () => {
    const cases: [string, string][] = [
      ['A B\tC\nD\rE F　G', 'abcdefg'],
      ['관절강 내주사', '관절강내주사'],
      ['MRI·X-ray', 'mri·x-ray'],
      ['ÄÖＭ', 'ÄÖＭ'],
      ['도수 치료', '도수 치료'],
      ['', ''],
    ]
    for (const [input, expected] of cases) {
      await become(A)
      expect([input, await call('public.notice_norm($1)', [input])]).toEqual([input, expected])
    }
    await become(A)
    expect(await call('public.notice_norm(null)')).toBeNull()
    const [volatility] = await rows(`select provolatile from pg_proc where oid = to_regprocedure('public.notice_norm(text)')`)
    expect(volatility.provolatile).toBe('i')
  })
})

describe('AC-7424.5 맞춤(낱말·글이 바뀌면 같은 문장 안에서)', SLOW, () => {
  it.each<[string, Row]>([
    ['제목', { title: '관절강 내주사 인정 기준' }],
    ['본문', { body: '앞 글\n관절강 내주사 인정 기준\n뒤 글' }],
    ['붙임 글자', { attach_text: '붙임: 관절강 내주사 기준표' }],
    ['요약 what', { summary: { ...SUMMARY, what: '관절강 내주사 기준이 바뀌어요' } }],
    ['요약 when', { summary: { ...SUMMARY, when: '관절강 내주사는 12월부터' } }],
    ['요약 who', { summary: { ...SUMMARY, who: '관절강 내주사 하는 의원' } }],
    ['요약 forUs', { summary: { ...SUMMARY, forUs: '관절강 내주사 청구를 확인해요' } }],
  ])('AC-7424.5: 낱말이 %s에 들면(띄어쓰기가 달라도) 원장이 넣는 문장 안에서 맞춤 줄이 생긴다', async (_field, values) => {
    const id = await seedNotice(values)
    await seedNotice({ summary: SUMMARY })
    await addWord(A, '관절강내 주사')
    expect(await hitsNow()).toEqual({ [`A:${id}`]: ['관절강내 주사'] })
  })

  it('AC-7424.5: 요약의 다른 칸(amends 등)은 보지 않고, 칸 끝과 다음 칸 처음을 이어서 맞추지 않는다', async () => {
    await seedNotice({ summary: { ...SUMMARY, amends: ['도수치료'] } })
    await seedNotice({ title: '안내 도수', body: '치료 기준' })
    await seedNotice({ body: '기준 도수', attach_text: '치료 붙임' })
    await seedNotice({ summary: { ...SUMMARY, what: '바뀌는 도수', when: '치료는 12월부터' } })
    await seedNotice({ attach_text: '붙임 도수', summary: { ...SUMMARY, what: '치료 바뀜' } })
    await addWord(A, '도수치료')
    expect(await hitsNow()).toEqual({})
  })

  it('AC-7424.5: 영문은 대소문자를 가리지 않고 맞춘다', async () => {
    const lower = await seedNotice({ body: 'mri 검사 기준' })
    const mixed = await seedNotice({ title: 'Mri 수가' })
    await seedNotice({ body: 'MRl 아님' })
    await addWord(A, 'MRI')
    expect(await hitsNow()).toEqual({ [`A:${lower}`]: ['MRI'], [`A:${mixed}`]: ['MRI'] })
  })

  it('AC-7424.5: 맞은 낱말은 넣은 차례이고, 낱말을 지우면 그 낱말만 빠지며 남은 낱말이 없으면 줄이 없다', async () => {
    const all = await seedNotice({ body: 'MRI와 도수치료와 체외충격파' })
    const onlyMri = await seedNotice({ body: 'MRI 기준' })
    await addWord(A, '체외충격파')
    await addWord(A, '도수치료')
    await addWord(A, 'MRI')
    expect(await hitsNow()).toEqual({ [`A:${all}`]: ['체외충격파', '도수치료', 'MRI'], [`A:${onlyMri}`]: ['MRI'] })
    await removeWord(A, '도수치료')
    expect(await hitsNow()).toEqual({ [`A:${all}`]: ['체외충격파', 'MRI'], [`A:${onlyMri}`]: ['MRI'] })
    await removeWord(A, 'MRI')
    expect(await hitsNow()).toEqual({ [`A:${all}`]: ['체외충격파'] })
    await removeWord(A, '체외충격파')
    expect(await hitsNow()).toEqual({})
  })

  it('AC-7424.5: 다른 병원 낱말은 섞이지 않는다(넣기·지우기 모두)', async () => {
    const id = await seedNotice({ body: 'MRI와 도수치료' })
    await addWord(A, '도수치료')
    await addWord(B, 'MRI')
    await addWord(B, '도수 치료')
    expect(await hitsNow()).toEqual({ [`A:${id}`]: ['도수치료'], [`B:${id}`]: ['MRI', '도수 치료'] })
    await removeWord(A, '도수치료')
    expect(await hitsNow()).toEqual({ [`B:${id}`]: ['MRI', '도수 치료'] })
  })

  it('AC-7424.5: 모으기 계정이 글을 넣으면 모든 병원 낱말로 맞춤 줄이 생긴다(낱말은 넣은 차례, 모으기 계정은 줄을 못 봄)', async () => {
    await addWord(A, '체외충격파')
    await addWord(A, '도수치료')
    await addWord(B, 'MRI')
    await addWord(B, '골다공증')
    const id = await collectNotice({ title: '도수치료 기준', attach_text: 'MRI 수가', summary: { ...SUMMARY, forUs: '체외충격파 청구 확인' } })
    await collectNotice({ body: '맞는 낱말 없음' })
    expect(await hitsNow()).toEqual({ [`A:${id}`]: ['체외충격파', '도수치료'], [`B:${id}`]: ['MRI'] })
    await become(COL)
    expect(await rows(`select * from public.notice_keyword_hits`)).toEqual([])
    await become(COL)
    expect(await rows(`select * from public.notice_keywords`)).toEqual([])
  })

  it.each<[string, unknown]>([
    ['title', '도수치료 고시'],
    ['body', '도수치료 본문'],
    ['attach_text', '도수치료 붙임'],
    ['summary', { ...SUMMARY, who: '도수치료 하는 의원' }],
  ])('AC-7424.5: 모으기 계정이 %s를 고치면 그 글의 맞춤 줄이 다시 맞춰진다(생기고 · 없어짐)', async (column, value) => {
    await addWord(A, '도수치료')
    await addWord(B, '도수치료')
    const id = await collectNotice({ summary: SUMMARY })
    const other = await collectNotice({ body: '도수치료 다른 글' })
    expect(await hitsNow()).toEqual({ [`A:${other}`]: ['도수치료'], [`B:${other}`]: ['도수치료'] })
    await collectorSets(id, column, value)
    expect(await hitsNow()).toEqual({
      [`A:${id}`]: ['도수치료'],
      [`B:${id}`]: ['도수치료'],
      [`A:${other}`]: ['도수치료'],
      [`B:${other}`]: ['도수치료'],
    })
    const plain = column === 'summary' ? SUMMARY : column === 'attach_text' ? '' : '평범한 글'
    await collectorSets(id, column, plain)
    expect(await hitsNow()).toEqual({ [`A:${other}`]: ['도수치료'], [`B:${other}`]: ['도수치료'] })
  })

  it('AC-7424.5: 모으기 계정의 upsert(onConflict group_key)도 다시 맞추고, 낱말 차례는 넣은 차례 그대로다', async () => {
    await addWord(A, '체외충격파')
    await addWord(A, '도수치료')
    await become(COL)
    await postgrestInsert('public.notices', [{ ...NOTICE, group_key: 'gosi:2026-300', body: '도수치료' }], 'group_key')
    await operator()
    const [{ id }] = await rows(`select id from public.notices where group_key = 'gosi:2026-300'`)
    expect(await hitsNow()).toEqual({ [`A:${id}`]: ['도수치료'] })
    await become(COL)
    await postgrestInsert('public.notices', [{ ...NOTICE, group_key: 'gosi:2026-300', body: '도수치료와 체외충격파' }], 'group_key')
    expect(await hitsNow()).toEqual({ [`A:${id}`]: ['체외충격파', '도수치료'] })
  })

  it('AC-7424.5: 맞춤과 상관없는 칸(state·tries 등)을 고치면 맞춤 줄은 그대로다', async () => {
    await addWord(A, '도수치료')
    const id = await collectNotice({ body: '도수치료' })
    const before = await hitsNow()
    await become(COL)
    await db.query(`update public.notices set state = 'batch', tries = 1, batch_id = 'msgbatch_1' where id = $1`, [id])
    expect(await hitsNow()).toEqual(before)
    expect(before).toEqual({ [`A:${id}`]: ['도수치료'] })
  })

  it('AC-7424.5: 문장이 실패하면 낱말도 맞춤 줄도 남지 않는다(같은 문장 안)', async () => {
    await seedNotice({ body: '도수치료와 MRI' })
    await become(A)
    await expect(postgrestInsert('public.notice_keywords', [{ word: '도수치료' }, { word: ' MRI' }])).rejects.toMatchObject(CHECK_FAILED)
    expect(await keywordsNow()).toEqual([])
    expect(await hitsNow()).toEqual({})
    await addWord(A, 'MRI')
    await become(COL)
    await expect(
      postgrestInsert('public.notices', [
        { ...NOTICE, group_key: 'post:hira_notice:ok', body: 'MRI 기준' },
        { ...NOTICE, group_key: 'post:hira_notice:bad', body: 'MRI', title: '' },
      ]),
    ).rejects.toMatchObject(CHECK_FAILED)
    await operator()
    expect(await rows(`select id from public.notices where group_key like 'post:hira_notice:%' and group_key in ('post:hira_notice:ok', 'post:hira_notice:bad')`)).toEqual([])
    // 남은 맞춤 줄은 앞서 운영자가 넣은 글의 MRI 하나뿐이다
    expect(Object.values(await hitsNow())).toEqual([['MRI']])
  })

  it('AC-7424.5: 글을 지우면(SQL 편집기) 그 글의 맞춤 줄도 지워진다', async () => {
    const gone = await seedNotice({ body: '도수치료' })
    const kept = await seedNotice({ body: '도수치료' })
    await addWord(A, '도수치료')
    await operator()
    await db.query(`delete from public.notices where id = $1`, [gone])
    expect(await hitsNow()).toEqual({ [`A:${kept}`]: ['도수치료'] })
  })
})

describe('AC-7424.6 notice_list·notice_unread_count 다시 만들기', SLOW, () => {
  it('AC-7424.6: 두 함수는 20261121000000 본문 그대로에 낱말 자리(맞춤 줄 잇기·keywords 칸·관련 조건)만 더했다', () => {
    const before = functionText(NOTICES_MIGRATION, 'notice_list')
    const after = functionText(KEYWORDS_MIGRATION, 'notice_list')
    expect(before).not.toBe('')
    expect(after).not.toBe('')
    const back = after
      .replace(",\n           coalesce(h.words, '{}'::text[]) as keywords", '')
      .replace('\n      left join public.notice_keyword_hits h on h.notice_id = n.id and h.hospital_id = me.hospital_id', '')
      .replace(" or n.state <> 'done' or h.notice_id is not null)", " or n.state <> 'done')")
      .replace("\n                 'keywords', g.keywords,", '')
    expect(back).toBe(before)
    expect(functionText(KEYWORDS_MIGRATION, 'notice_unread_count')).toBe(functionText(NOTICES_MIGRATION, 'notice_unread_count'))
  })

  it.each(REMADE)('AC-7424.6: %s는 인자(%s)·돌려주는 모양(%s)·호출자·search_path·권한이 그대로다', async (fn, args, returns) => {
    const [found] = await rows(
      `select pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as returns, p.prosecdef as definer, p.proconfig as config
       from pg_proc p where p.oid = to_regprocedure($1)`,
      [fn],
    )
    expect(found).toEqual({ args, returns, definer: false, config: ['search_path=""'] })
    for (const [role, ok] of [
      ['authenticated', true],
      ['anon', false],
      ['public', false],
    ] as const) {
      const [r] = await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn])
      expect([fn, role, r.ok]).toEqual([fn, role, ok])
    }
  })

  it('AC-7424.6: 줄마다 keywords(내 병원 맞은 낱말, 넣은 차례, 없으면 [])가 더해지고 그 밖 칸은 AC-7403.5 그대로다', async () => {
    const hits = [{ id: 'DX-01', title: '규칙 하나' }]
    const id = await seedNotice({
      group_key: 'gosi:2026-218',
      title: '보건복지부 고시 제2026-218호',
      kind: 'gosi',
      posted_on: daysBefore(2),
      notice_no: '2026-218',
      related: true,
      summary: SUMMARY,
      read_mode: 'full',
      state: 'done',
      rule_hits: hits,
      body: '체외충격파와 도수치료 본문은 목록에 없다',
      attach_text: '붙임 글자도 없다',
    })
    await seedPost(id, { source: 'hira_notice', title: '심평원 공지 제목', url: HIRA_URL, posted_on: daysBefore(1), attachments: [{ name: '붙임1.pdf', url: FILE_URL }] })
    await seedPost(id, { source: 'mohw_rss', title: '복지부 제목', url: MOHW_URL, posted_on: daysBefore(2), attachments: [] })
    await seedMark(A, id, { starred: true, memo: '회의 때 알리기', memo_at: '2026-11-20T02:00:00Z' })
    const plain = await seedNotice({ posted_on: daysBefore(3), title: '평범한 글' })
    await addWord(A, '체외충격파')
    await addWord(A, 'MRI')
    await addWord(A, '도수치료')
    await addWord(B, '본문')
    const page = await list(A)
    expect(page).toEqual({
      total: 2,
      unread: 2,
      rows: [
        {
          id,
          title: '보건복지부 고시 제2026-218호',
          kind: 'gosi',
          postedOn: daysBefore(2),
          noticeNo: '2026-218',
          related: true,
          summary: SUMMARY,
          readMode: 'full',
          state: 'done',
          ruleHits: hits,
          posts: [
            { source: 'mohw_rss', title: '복지부 제목', url: MOHW_URL, postedOn: daysBefore(2), attachments: [] },
            { source: 'hira_notice', title: '심평원 공지 제목', url: HIRA_URL, postedOn: daysBefore(1), attachments: [{ name: '붙임1.pdf', url: FILE_URL }] },
          ],
          mark: { readAt: null, starred: true, memo: '회의 때 알리기', memoAt: expect.any(String), rulesCheckedAt: null },
          unread: true,
          keywords: ['체외충격파', '도수치료'],
        },
        {
          id: plain,
          title: '평범한 글',
          kind: 'gosi',
          postedOn: daysBefore(3),
          noticeNo: null,
          related: null,
          summary: null,
          readMode: null,
          state: 'wait',
          ruleHits: [],
          posts: [],
          mark: { readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: null },
          unread: true,
          keywords: [],
        },
      ],
    })
    // B의 낱말('본문')은 B 목록에만 있다. 내 낱말이 없는 병원은 모두 []
    expect((await list(B)).rows.map((r) => [r.id, r.keywords])).toEqual([
      [id, ['본문']],
      [plain, ['본문']],
    ])
  })

  it('AC-7424.6: p_related 참이면 관련 글·요약 전·실패 글에 더해 내 낱말이 맞은 글(AI가 관련 아님으로 본 글 포함)도 든다', async () => {
    const related = await seedNotice({ related: true, state: 'done', posted_on: '2026-11-10' })
    const mustSee = await seedNotice({ related: false, state: 'done', posted_on: '2026-11-09', body: '체외충격파 장비 기준' })
    const unrelated = await seedNotice({ related: false, state: 'done', posted_on: '2026-11-08' })
    const waiting = await seedNotice({ state: 'wait', posted_on: '2026-11-07' })
    const failed = await seedNotice({ state: 'failed', tries: 3, posted_on: '2026-11-06' })
    await addWord(A, '체외충격파')
    expect(idsOf(await list(A, { related: true }))).toEqual([related, mustSee, waiting, failed])
    expect((await list(A, { related: true })).total).toBe(4)
    expect(idsOf(await list(B, { related: true }))).toEqual([related, waiting, failed])
    expect(idsOf(await list(A, { related: false }))).toEqual([related, mustSee, unrelated, waiting, failed])
    await removeWord(A, '체외충격파')
    expect(idsOf(await list(A, { related: true }))).toEqual([related, waiting, failed])
  })

  it('AC-7424.6: notice_unread_count()는 관련 글이거나 내 낱말이 맞은 글 가운데 unread인 수다', async () => {
    await seedNotice({ related: true, state: 'done', posted_on: daysBefore(0) })
    await seedNotice({ related: false, state: 'done', posted_on: daysBefore(0), body: '도수치료 새 기준' })
    await seedNotice({ related: false, state: 'done', posted_on: daysBefore(14), body: '도수치료 옛 기준' })
    const read = await seedNotice({ related: false, state: 'done', posted_on: daysBefore(1), body: '도수치료 읽은 글' })
    const later = await seedNotice({ related: false, state: 'done', posted_on: daysBefore(2), body: 'MRI 기준' })
    await seedMark(A, read, { read_at: '2026-11-20T00:00:00Z' })
    expect(await unreadCount(A)).toBe(1)
    expect(await unreadCount(B)).toBe(1)
    await addWord(A, '도수치료')
    expect(await unreadCount(A)).toBe(2)
    expect(await unreadCount(B)).toBe(1)
    await addWord(A, 'MRI')
    expect(await unreadCount(A)).toBe(3)
    expect((await list(A, { related: true })).unread).toBe(3)
    expect(idsOf(await list(A, { related: true, unreadOnly: true }))).toContain(later)
  })

  it('AC-7424.6: 찾기(notice_search id → notice_list p_ids)도 같은 관련 조건을 탄다', async () => {
    const id = await seedNotice({ related: false, state: 'done', body: '체외충격파 수가 바뀜' })
    await seedNotice({ related: false, state: 'done', body: '다른 수가 바뀜' })
    await addWord(A, '체외충격파')
    await become(A)
    const found = (await rows(`select id from public.notice_search($1::text) as id`, ['수가'])).map((r) => String(r.id))
    expect(found).toHaveLength(2)
    expect(idsOf(await list(A, { related: true, ids: found }))).toEqual([id])
    expect(idsOf(await list(B, { related: true, ids: found }))).toEqual([])
  })

  it('AC-7424.6: 다른 고르기(출처·별표·안 읽음)는 낱말이 맞은 글에도 그대로 함께 걸린다', async () => {
    const hit = await seedNotice({ related: false, state: 'done', posted_on: daysBefore(1), body: '도수치료' })
    await seedPost(hit, { source: 'mohw_rss', url: MOHW_URL, attachments: [] })
    const crtr = await seedNotice({ related: false, state: 'done', posted_on: daysBefore(1), body: '도수치료' })
    await seedPost(crtr, { source: 'hira_crtr', url: CRTR_URL, attachments: [] })
    const read = await seedNotice({ related: false, state: 'done', posted_on: daysBefore(1), body: '도수치료' })
    await seedPost(read, { source: 'mohw_rss', url: MOHW_URL, attachments: [] })
    for (const id of [hit, crtr]) await seedMark(A, id, { starred: true })
    await seedMark(A, read, { starred: true, read_at: '2026-11-20T00:00:00Z' })
    await addWord(A, '도수치료')
    const all = { related: true, sources: ['mohw_rss'], starred: true, unreadOnly: true }
    expect(idsOf(await list(A, all))).toEqual([hit])
    expect(idsOf(await list(A, { ...all, unreadOnly: false })).sort()).toEqual([hit, read].sort())
    expect(idsOf(await list(A, { ...all, sources: null })).sort()).toEqual([hit, crtr].sort())
  })

  it.each<[string, string]>([
    ['데스크', K],
    ['승인 대기 원장', P],
    ['병원 없는 계정', E],
  ])('AC-7424.6: %s는 원장 A에 낱말이 있어도 { total: 0, unread: 0, rows: [] }·0이다', async (_name, user) => {
    await seedNotice({ related: false, state: 'done', posted_on: daysBefore(0), body: '도수치료' })
    await addWord(A, '도수치료')
    expect(await list(user, { related: true })).toEqual({ total: 0, unread: 0, rows: [] })
    expect(await list(user)).toEqual({ total: 0, unread: 0, rows: [] })
    expect(await unreadCount(user)).toBe(0)
  })

  it('AC-7424.6: 모으기 계정(병원 없음)은 글을 읽어도 남의 병원 낱말이 섞이지 않는다(keywords [], 관련 글만에 안 듦)', async () => {
    await seedNotice({ related: false, state: 'done', posted_on: daysBefore(0), body: '도수치료' })
    await addWord(A, '도수치료')
    expect((await list(COL)).rows.map((r) => r.keywords)).toEqual([[]])
    expect(await list(COL, { related: true })).toEqual({ total: 0, unread: 0, rows: [] })
    expect(await unreadCount(COL)).toBe(0)
  })
})
