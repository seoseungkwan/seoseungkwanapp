import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 고시·공지 탭의 DB 표 아홉·권한·함수 (notices REQ-7402·REQ-7403, design.md 3절, ADR-036·ADR-037).
// clinicEmr.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 차례로
// (auth → … → 데스크 → 이 파일) 그대로 돌린다. 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth)만 흉내 낸다.
// 메일·글·주소·번호는 모두 지어낸 것이다
const fileOf = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel: string) => readFileSync(fileOf(rel), 'utf-8')
const AUTH_MIGRATION = read('./migrations/20261028000000_auth.sql')
// 앞 migration: clinicEmr.rls.test.ts와 같은 차례(auth → … → 예약 → 데스크). 데스크 계정을 만들려고 데스크까지 돌린다
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
const NOTICES_PATH = fileOf('./migrations/20261121000000_notices.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·함수가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const NOTICES_MIGRATION = existsSync(NOTICES_PATH) ? readFileSync(NOTICES_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 설명으로 다른 낱말을 말할 수 있다)
const NOTICES_SQL = NOTICES_MIGRATION.split('\n')
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

// 갈래 규칙 C1: 다른 갈래와 글자까지 같아야 어느 순서로 붙여 넣어도 된다
const C1_MY_HOSPITAL_ID = `create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
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
// 공용 표를 못 읽는 계정(승인된 원장·모으기 계정 밖)
const NO_READ: [string, string][] = [
  ['승인 대기 원장', P],
  ['거절된 원장', R],
  ['데스크', K],
  ['병원 없는 계정', E],
  ['관리자(병원 없음)', ADMIN],
]

type Row = Record<string, unknown>
type Page = { total: number; unread: number; rows: Row[] }

const TABLES = [
  'notices',
  'notice_posts',
  'notice_sources',
  'notice_weeks',
  'notice_runs',
  'notice_collectors',
  'notice_marks',
  'notice_ask_days',
  'notice_ask_holds',
]
const SHARED = ['notices', 'notice_posts', 'notice_sources', 'notice_weeks']
const CLOSED = ['notice_collectors', 'notice_ask_days', 'notice_ask_holds']
// 표마다 고치기 시험에 쓰는 칸 하나
const SOME_COLUMN: Record<string, string> = {
  notices: 'title',
  notice_posts: 'title',
  notice_sources: 'state',
  notice_weeks: 'top3',
  notice_runs: 'counts',
  notice_collectors: 'user_id',
  notice_marks: 'memo',
  notice_ask_days: 'count',
  notice_ask_holds: 'day',
}
// 넣기·고치기 칸 권한(authenticated). id·created_at·updated_at·rule_count·hospital_id는 DB만 정한다
const NOTICE_COLUMNS = [
  'group_key',
  'title',
  'kind',
  'posted_on',
  'notice_no',
  'body',
  'attach_text',
  'read_mode',
  'related',
  'summary',
  'rule_hits',
  'state',
  'tries',
  'batch_id',
]
const POST_COLUMNS = ['notice_id', 'source', 'source_key', 'title', 'url', 'posted_on', 'attachments']
const SOURCE_COLUMNS = ['source', 'state', 'error_code', 'checked_at', 'last_ok_at', 'stopped_since', 'cursor', 'backfill_done']
const WEEK_COLUMNS = ['week_start', 'top3']
// notice_id는 upsert(onConflict hospital_id,notice_id)가 SET에 같은 값을 다시 쓰므로 고치기 칸에도 있다
const MARK_COLUMNS = ['notice_id', 'read_at', 'starred', 'memo', 'memo_at', 'rules_checked_at']
const GRANTS: Record<string, { table: string[]; write: string[] }> = {
  notices: { table: ['SELECT'], write: NOTICE_COLUMNS },
  notice_posts: { table: ['SELECT'], write: POST_COLUMNS },
  notice_sources: { table: ['SELECT'], write: SOURCE_COLUMNS },
  notice_weeks: { table: ['SELECT'], write: WEEK_COLUMNS },
  notice_runs: { table: ['SELECT'], write: [] },
  notice_collectors: { table: [], write: [] },
  notice_marks: { table: ['SELECT'], write: MARK_COLUMNS },
  notice_ask_days: { table: [], write: [] },
  notice_ask_holds: { table: [], write: [] },
}
// 새 함수: [regprocedure, 정의자인가]. 모두 search_path 빔이고 authenticated만 부른다
const FUNCTIONS: [string, boolean][] = [
  ['public.notice_links_ok(jsonb)', false],
  ['public.notice_top3_ok(jsonb)', false],
  ['public.is_notice_collector()', true],
  ['public.notice_start_run()', true],
  ['public.notice_add_run_usage(uuid,bigint,bigint,bigint)', true],
  ['public.notice_finish_run(uuid,jsonb)', true],
  ['public.take_notice_ask()', true],
  ['public.end_notice_ask(uuid,boolean)', true],
  ['public.notice_ask_left()', true],
  ['public.notice_search(text)', false],
  ['public.notice_list(boolean,text[],boolean,uuid[],boolean,integer,integer)', false],
  ['public.notice_unread_count()', false],
  ['public.notice_rule_alerts()', false],
]
const TOUCH = 'public.notices_touch()' // 트리거만 부른다
const NEW_FUNCTION_NAMES = [...FUNCTIONS.map(([fn]) => fn), TOUCH].map((fn) => fn.replace(/^public\./, '').replace(/\(.*$/, ''))

const HIRA_URL = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=12353'
const FILE_URL = 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157'
const CRTR_URL = 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=20261118&sno=1&mtgMtrRegSno=2'
const MOHW_URL = 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1488000&act=view'
const SUMMARY = {
  related: true,
  what: '체외충격파 수가가 바뀌어요',
  when: '2026년 12월 1일부터',
  who: '의원급 의료기관',
  forUs: '우리 의원도 청구 코드를 확인해요',
  amends: ['2026-183'],
}
const NOTICE: Row = {
  group_key: 'gosi:2026-218',
  title: '[행위] 고시 제2026-218호 개정',
  kind: 'gosi',
  posted_on: '2026-11-18',
  notice_no: '2026-218',
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
  title: '[행위] 고시 제2026-218호 개정',
  url: HIRA_URL,
  posted_on: '2026-11-18',
  attachments: [{ name: '붙임1.pdf', url: FILE_URL }],
}
const TOP3 = [
  { head: '체외충격파 수가 변경', body: '12월 1일부터 바뀌어요' },
  { head: '주사 횟수 기준', body: '기준이 넓어져요' },
  { head: '서식 바뀜', body: '새 서식을 써요' },
]
const SOURCES = ['hira_notice', 'hira_crtr', 'mohw_rss']

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const RLS_DENIED = { code: '42501', message: expect.stringMatching(/row-level security/) }
const CHECK_FAILED = { code: '23514' }
const NOT_NULL = { code: '23502' }
const BAD_VALUE = { code: '22023' }
const RLS_OR_NULL = /row-level security|null value/

let db: PGlite
let hospital: Record<string, string> = {}
let seq = 0

async function migrateChain(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  for (const sql of CHAIN) await target.exec(sql)
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
  if (await hasTable('public.notice_collectors', target)) {
    await target.query('insert into public.notice_collectors (user_id) values ($1)', [COL])
  }
  return ids
}

const SEED_SOURCES = `insert into public.notice_sources (source, backfill_done) values ('hira_notice', false), ('hira_crtr', false), ('mohw_rss', true)`

// 시험마다 빈 표에서 시작한다(병원·표시·묻기 줄은 auth.users를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  if (await hasTable('public.notices')) {
    await db.exec('truncate public.notices, public.notice_weeks, public.notice_runs, public.notice_sources cascade')
    await db.exec(SEED_SOURCES)
  }
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

/** 2026-01-01에서 n일 뒤 */
function dayOf2026(n: number) {
  const d = new Date('2026-01-01T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 운영자가 묶음 하나를 넣고 id를 돌려준다(겹치지 않는 group_key) */
async function seedNotice(values: Row = {}, target: PGlite = db) {
  await operator(target)
  seq += 1
  const result = await postgrestInsert('public.notices', [{ ...NOTICE, group_key: `post:hira_notice:k${seq}`, ...values }], null, target, 'returning id')
  return result.rows[0].id as string
}

/** 운영자가 그 묶음에 출처 글 하나를 넣는다(겹치지 않는 source_key) */
async function seedPost(noticeId: string, values: Row = {}, target: PGlite = db) {
  await operator(target)
  seq += 1
  await postgrestInsert('public.notice_posts', [{ ...POST, source_key: `k${seq}`, ...values, notice_id: noticeId }], null, target)
}

/** 운영자가 그 원장 병원의 표시 줄을 넣는다 */
async function seedMark(owner: string, noticeId: string, values: Row, target: PGlite = db) {
  await operator(target)
  await postgrestInsert('public.notice_marks', [{ hospital_id: hospital[owner], notice_id: noticeId, ...values }], null, target)
}

/** 운영자 눈으로 본 표 전체(차례 고정) */
async function tableNow(table: string, order: string, target: PGlite = db) {
  await operator(target)
  return rows(`select * from public.${table} order by ${order}`, [], target)
}

/** 운영자가 트리거를 끈 채 그 표의 updated_at을 옛 시각으로 돌린다(고친 시각 트리거를 시험하려고) */
async function backdate(table: string) {
  await operator()
  await db.exec(
    `set session_replication_role = replica; update public.${table} set updated_at = '2026-01-02T00:00:00Z'; reset session_replication_role`,
  )
  expect(await rows(`select bool_or(updated_at > now() - interval '1 hour') as fresh from public.${table}`)).toEqual([{ fresh: false }])
}

async function marksNow() {
  await operator()
  return rows(
    `select hospital_id, notice_id, read_at, starred, memo, memo_at, rules_checked_at from public.notice_marks order by hospital_id, notice_id`,
  )
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

/** 그 사용자로 notice_search → 글 id 차례 */
async function search(user: string, q: string | null) {
  await become(user)
  return (await rows(`select id from public.notice_search($1::text) as id`, [q])).map((r) => r.id)
}

/** 운영자 눈으로 본 묻기 횟수·표 */
async function askDays() {
  await operator()
  return rows(`select hospital_id, day::text as day, count from public.notice_ask_days order by hospital_id, day`)
}
async function askHolds() {
  await operator()
  return rows(`select token, hospital_id, day::text as day from public.notice_ask_holds order by hospital_id, created_at, token`)
}

/** 그 사용자로 take_notice_ask n번 → 표들 */
async function takeAsks(user: string, n: number) {
  await become(user)
  const tokens: unknown[] = []
  for (let i = 0; i < n; i += 1) tokens.push(await call('public.take_notice_ask()'))
  return tokens
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

const isNoticeTable = (name: unknown) => /^(public\.)?notice(s|_[a-z_]+)$/.test(String(name))

/** 이 파일이 만든 것(표 아홉에 딸린 것·새 함수)을 뺀 모양 */
function withoutNotices(shape: Shape): Shape {
  return {
    columns: shape.columns.filter((c) => !isNoticeTable(c.table_name)),
    constraints: shape.constraints.filter((c) => !isNoticeTable(c.tbl)),
    access: shape.access.filter((t) => !isNoticeTable(t.relname)),
    indexes: shape.indexes.filter((i) => !isNoticeTable(i.tablename)),
    policies: shape.policies.filter((p) => !isNoticeTable(p.tablename)),
    triggers: shape.triggers.filter((t) => !isNoticeTable(t.tbl)),
    functions: shape.functions.filter((f) => !NEW_FUNCTION_NAMES.includes(String(f.name))),
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await migrateChain(db)
  await db.exec(NOTICES_MIGRATION)
}, 180_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-7402.1 표 아홉·RLS·anon·두 번 붙여 넣기', SLOW, () => {
  it('AC-7402.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·먼저 들어갈 auth.sql·두 번 붙여도 됨·모으기 계정 넣는 줄·REQ가 있다', () => {
    expect(NOTICES_MIGRATION).not.toBe('')
    expect(NOTICES_MIGRATION).not.toContain('\r')
    const lines = NOTICES_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toMatch(/먼저[^\n]*20261028000000_auth\.sql/)
    expect(head).toMatch(/두 번 붙여 넣어도/)
    expect(head).toContain("insert into public.notice_collectors (user_id) select id from auth.users where email = '<모으기 메일>';")
    expect(head).toContain('REQ-7402')
    expect(head).toContain('REQ-7403')
    expect(head).toContain('ADR-037')
  })

  it('AC-7402.1: 두 번 돌려도 되는 문장만 쓴다(표·색인 if not exists, 함수·트리거 or replace, 정책 지우고 다시 만들기, 출처 줄은 없을 때만)', () => {
    expect(NOTICES_SQL).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists\s)/i)
    expect(NOTICES_SQL).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists\s)/i)
    expect(NOTICES_SQL).not.toMatch(/create\s+function/i)
    expect(NOTICES_SQL).not.toMatch(/create\s+trigger/i)
    expect(NOTICES_SQL).not.toMatch(/\btruncate\b|\bdrop\s+(table|function|column|trigger)\b|service_role/i)
    const policies = [...NOTICES_SQL.matchAll(/create policy ("[^"]+") on (public\.\w+)/g)]
    expect(policies.length).toBeGreaterThan(0)
    for (const [, name, table] of policies) expect(NOTICES_SQL).toContain(`drop policy if exists ${name} on ${table};`)
    expect(NOTICES_SQL).toMatch(/insert into public\.notice_sources[^;]*on conflict \(source\) do nothing;/)
  })

  it('AC-7402.1: my_hospital_id()는 cross-branch C1 글자 그대로다', () => {
    expect(NOTICES_MIGRATION).toContain(C1_MY_HOSPITAL_ID)
  })

  it('AC-7402.1: 표 아홉이 있고 모두 RLS가 켜져 있다', async () => {
    const found = await rows(
      `select c.relname, c.relrowsecurity from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname ~ '^notice(s|_)'`,
    )
    const byName = (x: Row, y: Row) => String(x.relname).localeCompare(String(y.relname))
    expect(found.sort(byName)).toEqual(TABLES.map((relname) => ({ relname, relrowsecurity: true })).sort(byName))
  })

  it.each(TABLES)('AC-7402.1: anon은 %s를 읽고 넣고 고치고 지우지 못한다(권한 없음)', async (table) => {
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

  it('AC-7402.1: anon·PUBLIC은 표 아홉에 표·칸 권한이 하나도 없다', async () => {
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

  it.each(TABLES)('AC-7402.1: authenticated의 %s 표 권한은 정해 둔 것뿐이고 넣기·고치기는 정해 둔 칸만이다(지우기 없음)', async (table) => {
    const expected = GRANTS[table]
    expect(await hasTable(`public.${table}`)).toBe(true)
    const found = await rows(
      `select privilege_type from information_schema.table_privileges where grantee = 'authenticated' and table_schema = 'public' and table_name = $1`,
      [table],
    )
    expect(found.map((r) => r.privilege_type).sort()).toEqual(expected.table)
    const columns = await rows(
      `select column_name, privilege_type from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = $1 and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')`,
      [table],
    )
    for (const privilege of ['INSERT', 'UPDATE']) {
      expect([table, privilege, columns.filter((r) => r.privilege_type === privilege).map((r) => r.column_name).sort()]).toEqual([
        table,
        privilege,
        [...expected.write].sort(),
      ])
    }
    expect(columns.filter((r) => r.privilege_type === 'REFERENCES')).toEqual([])
  })

  it('AC-7402.1: 정책은 공용 표 넷·표시 표에 읽기·넣기·고치기, 실행 기록에 읽기뿐이고 지우기 정책과 닫힌 표 셋의 정책은 없다', async () => {
    const found = await rows(`select tablename, cmd, roles::text[] as roles from pg_policies where schemaname = 'public' and tablename ~ '^notice(s|_)'`)
    const cmdsOf = (table: string) =>
      found
        .filter((p) => p.tablename === table)
        .map((p) => p.cmd)
        .sort()
    for (const table of [...SHARED, 'notice_marks']) expect([table, cmdsOf(table)]).toEqual([table, ['INSERT', 'SELECT', 'UPDATE']])
    expect(cmdsOf('notice_runs')).toEqual(['SELECT'])
    for (const table of CLOSED) expect([table, cmdsOf(table)]).toEqual([table, []])
    for (const p of found) expect(p.roles).toEqual(['authenticated'])
  })

  it.each(FUNCTIONS)('AC-7402.1: 함수 %s는 정의자=%s·search_path 빔이고 authenticated만 부른다(anon·PUBLIC 못 부름)', async (fn, definer) => {
    const [found] = await rows(`select p.prosecdef as definer, p.proconfig as config from pg_proc p where p.oid = to_regprocedure($1)`, [fn])
    expect(found).toEqual({ definer, config: ['search_path=""'] })
    for (const [role, ok] of [
      ['authenticated', true],
      ['anon', false],
      ['public', false],
    ] as const) {
      const [r] = await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn])
      expect([fn, role, r.ok]).toEqual([fn, role, ok])
    }
  })

  it('AC-7402.1: 고친 시각 트리거 함수는 누구도 바로 부르지 못하고, notices·notice_sources·notice_marks를 고칠 때만 돈다', async () => {
    const [found] = await rows(`select p.prosecdef as definer, p.proconfig as config from pg_proc p where p.oid = to_regprocedure($1)`, [TOUCH])
    expect(found).toEqual({ definer: false, config: ['search_path=""'] })
    for (const role of ['authenticated', 'anon', 'public']) {
      expect((await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, TOUCH]))[0].ok).toBe(false)
    }
    const triggers = await rows(
      `select tgrelid::regclass::text as tbl, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal and tgfoid = to_regprocedure($1)`,
      [TOUCH],
    )
    expect(triggers.map((t) => t.tbl).sort()).toEqual(['notice_marks', 'notice_sources', 'notices'])
    for (const t of triggers) expect(t.def).toMatch(/BEFORE UPDATE ON .* FOR EACH ROW EXECUTE FUNCTION notices_touch\(\)/)
  })

  it('AC-7402.1: anon은 새 함수를 하나도 부르지 못한다(권한 없음)', async () => {
    const calls = [
      "public.notice_links_ok('[]')",
      "public.notice_top3_ok('[]')",
      'public.is_notice_collector()',
      'public.notice_start_run()',
      `public.notice_add_run_usage('${A}', 1, 1, 1)`,
      `public.notice_finish_run('${A}', '{}')`,
      'public.take_notice_ask()',
      `public.end_notice_ask('${A}', false)`,
      'public.notice_ask_left()',
      "public.notice_search('고시')",
      'public.notice_list(false, null, false, null, false, 50, 0)',
      'public.notice_unread_count()',
      'public.notice_rule_alerts()',
    ]
    expect(calls).toHaveLength(FUNCTIONS.length)
    for (const sql of calls) {
      await becomeAnon()
      await expect(db.query(`select * from ${sql}`)).rejects.toMatchObject(DENIED)
    }
  })

  it('AC-7402.1: 출처 세 줄이 들어가 있다(복지부만 채움 끝, 모두 ok·확인 전·쪽 표시 빔)', async () => {
    await operator()
    const fresh = await PGlite.create()
    try {
      await migrateChain(fresh)
      await fresh.exec(NOTICES_MIGRATION)
      const found = await rows(
        `select source, state, error_code, checked_at, last_ok_at, stopped_since, cursor, backfill_done from public.notice_sources order by source`,
        [],
        fresh,
      )
      expect(found).toEqual(
        ['hira_crtr', 'hira_notice', 'mohw_rss'].map((source) => ({
          source,
          state: 'ok',
          error_code: null,
          checked_at: null,
          last_ok_at: null,
          stopped_since: null,
          cursor: {},
          backfill_done: source === 'mohw_rss',
        })),
      )
    } finally {
      await fresh.close()
    }
  })

  it('AC-7402.1: auth.sql만 들어간 DB에도 오류 없이 붙는다', async () => {
    const bare = await PGlite.create()
    try {
      await bare.exec(SUPABASE_MOCK)
      await bare.exec(AUTH_MIGRATION)
      await bare.exec(NOTICES_MIGRATION)
      const [r] = await rows(`select count(*)::int as n from pg_class where relnamespace = 'public'::regnamespace and relname ~ '^notice(s|_)' and relkind = 'r'`, [], bare)
      expect(r.n).toBe(9)
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
      await fresh.exec(NOTICES_MIGRATION)
      once = await shapeOf(fresh)
      ids = await seedPeople(fresh)
    }, 240_000)

    afterAll(async () => {
      await fresh.close()
    })

    it('AC-7402.1: 이 파일 밖의 표·칸·제약·권한·색인·정책·트리거·함수는 그대로이고, 새 함수는 정해 둔 것뿐이다', () => {
      expect(withoutNotices(once)).toEqual(before)
      const added = once.functions.filter((f) => !before.functions.some((b) => b.fn === f.fn)).map((f) => String(f.name))
      expect(added.sort()).toEqual([...NEW_FUNCTION_NAMES].sort())
    })

    it('AC-7402.1: 두 번째로 붙여도 오류가 없고, 모양과 이미 있던 줄(출처 상태·글·표시·실행 기록·묻기 수)이 그대로다', async () => {
      const noticeId = await seedNotice({ related: true, state: 'done', summary: SUMMARY }, fresh)
      await seedPost(noticeId, {}, fresh)
      await operator(fresh)
      await fresh.query(
        `update public.notice_sources set state = 'stopped', error_code = 'shape', checked_at = now(), cursor = '{"page": 7}', backfill_done = true where source = 'hira_notice'`,
      )
      await fresh.query(`insert into public.notice_marks (hospital_id, notice_id, starred, memo) values ($1, $2, true, '메모')`, [ids[A], noticeId])
      await fresh.query(`insert into public.notice_weeks (week_start, top3) values ('2026-11-16', $1::jsonb)`, [JSON.stringify(TOP3)])
      await fresh.query(`insert into public.notice_runs (counts, input_tokens) values ('{"new": {}}', 12)`)
      await fresh.query(`insert into public.notice_ask_days (hospital_id, day, count) values ($1, '2026-11-20', 3)`, [ids[A]])
      const dump = async () => ({
        sources: await tableNow('notice_sources', 'source', fresh),
        notices: await tableNow('notices', 'id', fresh),
        posts: await tableNow('notice_posts', 'id', fresh),
        marks: await tableNow('notice_marks', 'notice_id', fresh),
        weeks: await tableNow('notice_weeks', 'week_start', fresh),
        runs: await tableNow('notice_runs', 'id', fresh),
        days: await tableNow('notice_ask_days', 'day', fresh),
        collectors: await tableNow('notice_collectors', 'user_id', fresh),
      })
      const data = await dump()
      await operator(fresh)
      await fresh.exec(NOTICES_MIGRATION)
      expect(await shapeOf(fresh)).toEqual(once)
      expect(await dump()).toEqual(data)
      expect(data.sources.find((s) => s.source === 'hira_notice')).toMatchObject({ state: 'stopped', cursor: { page: 7 }, backfill_done: true })
    })
  })
})

describe('AC-7402.2 공용 표 넷 읽기', SLOW, () => {
  async function seedShared() {
    const first = await seedNotice({ related: true, state: 'done', summary: SUMMARY })
    const second = await seedNotice({ kind: 'case', notice_no: null, posted_on: '2026-11-19' })
    await seedPost(first)
    await seedPost(second, { source: 'hira_crtr', url: CRTR_URL, attachments: [] })
    await operator()
    await db.query(`insert into public.notice_weeks (week_start, top3) values ('2026-11-16', $1::jsonb)`, [JSON.stringify(TOP3)])
    const dump: Record<string, Row[]> = {}
    for (const table of SHARED) dump[table] = await tableNow(table, table === 'notice_sources' ? 'source' : table === 'notice_weeks' ? 'week_start' : 'id')
    return dump
  }

  it.each<[string, string]>([
    ['원장 A', A],
    ['원장 B', B],
  ])('AC-7402.2: 승인된 %s는 공용 표 넷의 모든 줄을 본다', async (_name, user) => {
    const dump = await seedShared()
    expect(dump.notices).toHaveLength(2)
    expect(dump.notice_posts).toHaveLength(2)
    expect(dump.notice_sources).toHaveLength(3)
    expect(dump.notice_weeks).toHaveLength(1)
    for (const table of SHARED) {
      await become(user)
      const order = table === 'notice_sources' ? 'source' : table === 'notice_weeks' ? 'week_start' : 'id'
      expect([table, await rows(`select * from public.${table} order by ${order}`)]).toEqual([table, dump[table]])
    }
  })

  it('AC-7402.2: 승인된 원장의 넣기는 RLS가 거부하고, 고치기는 0줄, 지우기는 권한 없음이며 줄은 그대로다', async () => {
    const dump = await seedShared()
    const [noticeId] = dump.notices.map((n) => n.id as string)
    const inserts: [string, Row][] = [
      ['public.notices', { ...NOTICE, group_key: 'post:hira_notice:by-owner' }],
      ['public.notice_posts', { ...POST, source_key: 'by-owner', notice_id: noticeId }],
      ['public.notice_weeks', { week_start: '2026-11-09', top3: [] }],
    ]
    for (const [table, body] of inserts) {
      await become(A)
      await expect(postgrestInsert(table, [body])).rejects.toMatchObject(RLS_DENIED)
    }
    await become(A)
    await expect(db.query(`update public.notice_sources set state = 'stopped'`)).resolves.toMatchObject({ affectedRows: 0 })
    for (const table of SHARED) {
      await become(A)
      expect([table, (await db.query(`update public.${table} set ${SOME_COLUMN[table]} = ${SOME_COLUMN[table]}`)).affectedRows]).toEqual([table, 0])
      await become(A)
      await expect(db.query(`delete from public.${table}`)).rejects.toMatchObject(DENIED)
    }
    for (const table of SHARED) {
      const order = table === 'notice_sources' ? 'source' : table === 'notice_weeks' ? 'week_start' : 'id'
      expect([table, await tableNow(table, order)]).toEqual([table, dump[table]])
    }
  })

  it.each(NO_READ)('AC-7402.2: %s는 공용 표 넷에서 0줄이고 넣기는 거부된다', async (_name, user) => {
    const dump = await seedShared()
    for (const table of SHARED) {
      await become(user)
      expect([table, await rows(`select * from public.${table}`)]).toEqual([table, []])
    }
    await become(user)
    await expect(postgrestInsert('public.notices', [{ ...NOTICE, group_key: 'post:hira_notice:by-other' }])).rejects.toMatchObject(RLS_DENIED)
    await become(user)
    expect((await db.query(`update public.notice_sources set state = 'stopped'`)).affectedRows).toBe(0)
    expect(await tableNow('notices', 'id')).toEqual(dump.notices)
  })
})

describe('AC-7402.3 모으기 계정만 공용 표에 넣고 고친다', SLOW, () => {
  it('AC-7402.3: 모으기 계정은 공용 표 넷에 넣고(되돌려 받기 포함) 읽는다', async () => {
    await become(COL)
    const inserted = await postgrestInsert('public.notices', [{ ...NOTICE }], null, db, 'returning id')
    const noticeId = inserted.rows[0].id as string
    await become(COL)
    await postgrestInsert('public.notice_posts', [{ ...POST, notice_id: noticeId }])
    await become(COL)
    await postgrestInsert('public.notice_weeks', [{ week_start: '2026-11-16', top3: TOP3 }])
    await operator()
    await db.exec(`delete from public.notice_sources where source = 'hira_crtr'`)
    await become(COL)
    await postgrestInsert('public.notice_sources', [{ source: 'hira_crtr', state: 'ok', cursor: { '01': 2 }, backfill_done: false }])
    await become(COL)
    expect(await rows(`select id, group_key, title, state, tries, rule_count from public.notices`)).toEqual([
      { id: noticeId, group_key: NOTICE.group_key, title: NOTICE.title, state: 'wait', tries: 0, rule_count: 0 },
    ])
    await become(COL)
    expect(await rows(`select notice_id, source, url, attachments from public.notice_posts`)).toEqual([
      { notice_id: noticeId, source: 'hira_notice', url: HIRA_URL, attachments: POST.attachments },
    ])
    await become(COL)
    expect(await rows(`select week_start::text as week_start, top3 from public.notice_weeks`)).toEqual([{ week_start: '2026-11-16', top3: TOP3 }])
    await become(COL)
    expect(await rows(`select source, cursor from public.notice_sources order by source`)).toEqual([
      { source: 'hira_crtr', cursor: { '01': 2 } },
      { source: 'hira_notice', cursor: {} },
      { source: 'mohw_rss', cursor: {} },
    ])
  })

  it('AC-7402.3: 모으기 계정은 공용 표 넷을 고치고(upsert 포함) rule_count는 rule_hits 수를 따른다', async () => {
    const noticeId = await seedNotice({ ...NOTICE })
    await seedPost(noticeId, { source_key: '12353' })
    await become(COL)
    const hits = [
      { id: 'DX-01', title: '규칙 하나' },
      { id: 'IN-02', title: '규칙 둘' },
    ]
    const updated = await db.query(
      `update public.notices set state = 'done', related = true, summary = $1::jsonb, rule_hits = $2::jsonb, read_mode = 'full', tries = 1 where id = $3`,
      [JSON.stringify(SUMMARY), JSON.stringify(hits), noticeId],
    )
    expect(updated.affectedRows).toBe(1)
    await become(COL)
    // upsert는 보낸 칸만 SET에 쓴다(요약 칸은 보내지 않아 그대로)
    await postgrestInsert(
      'public.notices',
      [{ group_key: NOTICE.group_key, title: '바뀐 제목', kind: 'gosi', posted_on: NOTICE.posted_on, body: '새 본문' }],
      'group_key',
    )
    await become(COL)
    await postgrestInsert('public.notice_posts', [{ ...POST, notice_id: noticeId, title: '바뀐 글 제목' }], 'source, source_key')
    await become(COL)
    expect((await db.query(`update public.notice_sources set checked_at = now(), last_ok_at = now(), cursor = '{"page": 3}' where source = 'hira_notice'`)).affectedRows).toBe(1)
    await become(COL)
    await postgrestInsert('public.notice_weeks', [{ week_start: '2026-11-16', top3: [] }])
    await become(COL)
    await postgrestInsert('public.notice_weeks', [{ week_start: '2026-11-16', top3: TOP3 }], 'week_start')
    await operator()
    expect(await rows(`select title, body, state, related, rule_count, tries from public.notices`)).toEqual([
      { title: '바뀐 제목', body: '새 본문', state: 'done', related: true, rule_count: 2, tries: 1 },
    ])
    expect(await rows(`select title from public.notice_posts`)).toEqual([{ title: '바뀐 글 제목' }])
    expect(await rows(`select cursor from public.notice_sources where source = 'hira_notice'`)).toEqual([{ cursor: { page: 3 } }])
    expect(await rows(`select top3 from public.notice_weeks`)).toEqual([{ top3: TOP3 }])
  })

  it('AC-7402.3: 모으기 계정이 고치면 notices·notice_sources의 updated_at이 지금으로 바뀐다(꾸밀 수 없다)', async () => {
    const noticeId = await seedNotice()
    await backdate('notices')
    await backdate('notice_sources')
    await become(COL)
    await db.query(`update public.notices set tries = 1 where id = $1`, [noticeId])
    await become(COL)
    await db.query(`update public.notice_sources set state = 'stopped', error_code = 'http' where source = 'hira_crtr'`)
    await operator()
    const [n] = await rows(`select updated_at > now() - interval '1 hour' as fresh from public.notices`)
    expect(n.fresh).toBe(true)
    expect(await rows(`select source, updated_at > now() - interval '1 hour' as fresh from public.notice_sources order by source`)).toEqual([
      { source: 'hira_crtr', fresh: true },
      { source: 'hira_notice', fresh: false },
      { source: 'mohw_rss', fresh: false },
    ])
    await become(COL)
    await expect(db.query(`update public.notices set updated_at = now()`)).rejects.toMatchObject(DENIED)
  })

  it.each<[string, string]>([
    ['notices', `update public.notices set id = gen_random_uuid()`],
    ['notices', `update public.notices set created_at = now()`],
    ['notice_posts', `update public.notice_posts set created_at = now()`],
    ['notice_sources', `update public.notice_sources set updated_at = now()`],
    ['notice_weeks', `update public.notice_weeks set created_at = now()`],
  ])('AC-7402.3: 모으기 계정도 %s의 DB가 정하는 칸은 못 고친다(%s)', async (_table, sql) => {
    const noticeId = await seedNotice()
    await seedPost(noticeId)
    await operator()
    await db.exec(`insert into public.notice_weeks (week_start) values ('2026-11-16')`)
    await become(COL)
    await expect(db.query(sql)).rejects.toMatchObject(DENIED)
  })

  it('AC-7402.3: 모으기 계정도 id·rule_count·created_at을 넣어 보내면 권한 없음이다', async () => {
    for (const extra of [{ id: A }, { created_at: '2026-01-02T00:00:00Z' }, { updated_at: '2026-01-02T00:00:00Z' }]) {
      await become(COL)
      await expect(postgrestInsert('public.notices', [{ ...NOTICE, ...extra }])).rejects.toMatchObject(DENIED)
    }
    await become(COL)
    await expect(db.query(`insert into public.notices (group_key, title, kind, posted_on, rule_count) values ('gosi:2026-1', '제목', 'gosi', '2026-11-18', 3)`)).rejects.toThrow()
    expect(await tableNow('notices', 'id')).toEqual([])
  })

  it('AC-7402.3: 모으기 계정도 공용 표 넷의 줄을 지우지 못한다(권한 없음)', async () => {
    const noticeId = await seedNotice()
    await seedPost(noticeId)
    await operator()
    await db.exec(`insert into public.notice_weeks (week_start) values ('2026-11-16')`)
    for (const table of SHARED) {
      await become(COL)
      await expect(db.query(`delete from public.${table}`)).rejects.toMatchObject(DENIED)
    }
    expect(await tableNow('notices', 'id')).toHaveLength(1)
    expect(await tableNow('notice_posts', 'id')).toHaveLength(1)
    expect(await tableNow('notice_sources', 'source')).toHaveLength(3)
    expect(await tableNow('notice_weeks', 'week_start')).toHaveLength(1)
  })

  it.each<[string, string]>([
    ['관리자', ADMIN],
    ['원장 A', A],
    ['데스크', K],
  ])('AC-7402.3: 목록에 없는 %s는 공용 표에 넣지 못하고(RLS) 고치기는 0줄이다', async (_name, user) => {
    const noticeId = await seedNotice()
    const inserts: [string, Row][] = [
      ['public.notices', { ...NOTICE, group_key: 'post:hira_notice:by-other' }],
      ['public.notice_posts', { ...POST, source_key: 'by-other', notice_id: noticeId }],
      ['public.notice_weeks', { week_start: '2026-11-09', top3: [] }],
    ]
    for (const [table, body] of inserts) {
      await become(user)
      await expect(postgrestInsert(table, [body])).rejects.toMatchObject(RLS_DENIED)
    }
    await operator()
    await db.exec(`delete from public.notice_sources where source = 'mohw_rss'`)
    await become(user)
    await expect(postgrestInsert('public.notice_sources', [{ source: 'mohw_rss', backfill_done: true }])).rejects.toMatchObject(RLS_DENIED)
    await become(user)
    expect((await db.query(`update public.notices set title = '바꿈'`)).affectedRows).toBe(0)
    await become(user)
    expect((await db.query(`update public.notice_sources set state = 'stopped'`)).affectedRows).toBe(0)
    expect((await tableNow('notices', 'id')).map((n) => n.title)).toEqual([NOTICE.title])
  })

  it.each<[string, string]>([
    ['원장 A', A],
    ['관리자', ADMIN],
    ['모으기 계정', COL],
    ['데스크', K],
  ])('AC-7402.3: %s도 notice_collectors를 읽고 넣고 고치고 지우지 못한다(SQL 편집기만)', async (_name, user) => {
    await become(user)
    await expect(db.query(`select * from public.notice_collectors`)).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`insert into public.notice_collectors (user_id) values ($1)`, [user])).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`update public.notice_collectors set user_id = $1`, [user])).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`delete from public.notice_collectors`)).rejects.toMatchObject(DENIED)
    expect(await tableNow('notice_collectors', 'user_id')).toMatchObject([{ user_id: COL }])
  })

  it.each<[string, string, boolean]>([
    ['모으기 계정', COL, true],
    ['관리자', ADMIN, false],
    ['원장 A', A, false],
    ['데스크', K, false],
    ['병원 없는 계정', E, false],
  ])('AC-7402.3: is_notice_collector()는 %s에게 %s다', async (_name, user, expected) => {
    await become(user)
    expect(await call('public.is_notice_collector()')).toBe(expected)
  })
})

describe('AC-7402.4 줄 제약', SLOW, () => {
  const ATTACH = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `붙임${i}.pdf`, url: FILE_URL }))
  const HITS = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `DX-${String(i).padStart(2, '0')}`, title: '규칙' }))

  it('AC-7402.4: 한도 끝 값(제목 300자·본문과 붙임 글자 20,000자·rule_hits 50개·붙임 10개·주소 500자·이름 200자·월요일)은 들어간다', async () => {
    await become(COL)
    const inserted = await postgrestInsert(
      'public.notices',
      [
        {
          ...NOTICE,
          group_key: `crtr:01:2026-11-18:${'가'.repeat(180)}`,
          title: '가'.repeat(300),
          notice_no: '2026-1',
          body: 'a'.repeat(20000),
          attach_text: '가'.repeat(20000),
          rule_hits: HITS(50),
          summary: SUMMARY,
          read_mode: 'text',
          state: 'batch',
          tries: 5,
          batch_id: 'msgbatch_01ABCdef_9',
          posted_on: '2026-01-01',
        },
      ],
      null,
      db,
      'returning id, rule_count',
    )
    expect(inserted.rows[0].rule_count).toBe(50)
    const noticeId = inserted.rows[0].id as string
    for (const [key, url] of [
      ['a1', 'https://www.hira.or.kr/'.padEnd(500, 'a')],
      ['a2', 'https://www.mohw.go.kr/'],
      ['a3', MOHW_URL],
    ]) {
      await become(COL)
      await postgrestInsert('public.notice_posts', [
        { ...POST, source: 'mohw_rss', source_key: key.padEnd(100, 'k'), title: '가'.repeat(300), url, notice_id: noticeId, attachments: [] },
      ])
    }
    await become(COL)
    await postgrestInsert('public.notice_posts', [
      { ...POST, source_key: 'b1', notice_id: noticeId, attachments: [...ATTACH(9), { name: '가'.repeat(200), url: 'https://www.mohw.go.kr/'.padEnd(500, 'b') }] },
    ])
    await become(COL)
    await postgrestInsert('public.notice_weeks', [{ week_start: '2026-11-16', top3: [{ head: '가'.repeat(60), body: '나'.repeat(120) }] }])
    await become(COL)
    await postgrestInsert('public.notice_weeks', [{ week_start: '2026-01-05', top3: [] }])
    await become(COL)
    await db.query(`update public.notice_sources set cursor = $1::jsonb where source = 'hira_crtr'`, [
      JSON.stringify({ '01': 3, '02': 1, '09': 2, '10': 4, done: ['01'] }),
    ])
    expect(await tableNow('notice_posts', 'id')).toHaveLength(4)
    expect(await tableNow('notice_weeks', 'week_start')).toHaveLength(2)
  })

  it.each<[string, Row]>([
    ['group_key 2자', { group_key: 'ab' }],
    ['group_key 201자', { group_key: 'g'.repeat(201) }],
    ['제목 빈 글자', { title: '' }],
    ['제목 301자', { title: '가'.repeat(301) }],
    ['kind 밖', { kind: 'other' }],
    ['kind 대문자', { kind: 'GOSI' }],
    ['posted_on 2025-12-31', { posted_on: '2025-12-31' }],
    ['notice_no 숫자 다섯 자리', { notice_no: '2026-12345' }],
    ['notice_no 연도 두 자리', { notice_no: '26-218' }],
    ['notice_no 제…호', { notice_no: '제2026-218호' }],
    ['body 20,001자', { body: 'a'.repeat(20001) }],
    ['attach_text 20,001자', { attach_text: '가'.repeat(20001) }],
    ['read_mode 밖', { read_mode: 'pdf' }],
    ['summary 배열', { summary: [] }],
    ['summary 4,000바이트 넘음', { summary: { ...SUMMARY, what: '가'.repeat(1400) } }],
    ['rule_hits 51개', { rule_hits: HITS(51) }],
    ['rule_hits 객체', { rule_hits: { id: 'DX-01' } }],
    ['state 밖', { state: 'summarized' }],
    ['tries 6', { tries: 6 }],
    ['tries -1', { tries: -1 }],
    ['batch_id 빈칸 섞임', { batch_id: 'msg batch' }],
    ['batch_id 빈 글자', { batch_id: '' }],
    ['batch_id 101자', { batch_id: 'a'.repeat(101) }],
  ])('AC-7402.4: notices에 %s면 거부된다(23514)', async (_name, values) => {
    await become(COL)
    await expect(postgrestInsert('public.notices', [{ ...NOTICE, ...values }])).rejects.toMatchObject(CHECK_FAILED)
    expect(await tableNow('notices', 'id')).toEqual([])
  })

  it.each<[string, Row]>([
    ['source 밖', { source: 'kma' }],
    ['source_key 빈 글자', { source_key: '' }],
    ['source_key 101자', { source_key: 'k'.repeat(101) }],
    ['제목 빈 글자', { title: '' }],
    ['제목 301자', { title: '가'.repeat(301) }],
    ['주소 http', { url: 'http://www.hira.or.kr/bbsDummy.do' }],
    ['주소 www 없음', { url: 'https://hira.or.kr/bbsDummy.do' }],
    ['주소 뒤에 다른 host', { url: 'https://www.hira.or.kr.evil.example/x' }],
    ['주소 점 대신 다른 글자', { url: 'https://wwwxhira.or.kr/x' }],
    ['주소 / 없음', { url: 'https://www.hira.or.kr' }],
    ['복지부 주소 / 없음', { url: 'https://www.mohw.go.kr' }],
    ['다른 사이트', { url: 'https://www.example.com/' }],
    ['javascript 주소', { url: 'javascript:alert(1)' }],
    ['앞 빈칸', { url: ' https://www.hira.or.kr/x' }],
    ['대문자 HTTPS', { url: 'HTTPS://www.hira.or.kr/x' }],
    ['주소 501자', { url: 'https://www.hira.or.kr/'.padEnd(501, 'a') }],
    ['붙임 11개', { attachments: ATTACH(11) }],
    ['붙임이 배열 아님', { attachments: { name: 'a', url: FILE_URL } }],
    ['붙임 항목이 글자', { attachments: ['붙임.pdf'] }],
    ['붙임 항목이 null', { attachments: [null] }],
    ['붙임 칸 더 있음', { attachments: [{ name: 'a.pdf', url: FILE_URL, size: 10 }] }],
    ['붙임 주소 없음', { attachments: [{ name: 'a.pdf' }] }],
    ['붙임 이름 없음', { attachments: [{ url: FILE_URL }] }],
    ['붙임 이름 빈 글자', { attachments: [{ name: '', url: FILE_URL }] }],
    ['붙임 이름 201자', { attachments: [{ name: '가'.repeat(201), url: FILE_URL }] }],
    ['붙임 이름이 숫자', { attachments: [{ name: 12, url: FILE_URL }] }],
    ['붙임 이름이 null', { attachments: [{ name: null, url: FILE_URL }] }],
    ['붙임 주소 http', { attachments: [{ name: 'a.pdf', url: 'http://www.hira.or.kr/bbs/x' }] }],
    ['붙임 주소 다른 사이트', { attachments: [{ name: 'a.pdf', url: 'https://files.example.com/a.pdf' }] }],
    ['붙임 주소 501자', { attachments: [{ name: 'a.pdf', url: 'https://www.hira.or.kr/'.padEnd(501, 'a') }] }],
    ['붙임 주소가 배열', { attachments: [{ name: 'a.pdf', url: [FILE_URL] }] }],
    ['붙임 하나는 맞고 하나는 틀림', { attachments: [{ name: 'a.pdf', url: FILE_URL }, { name: 'b.pdf', url: 'https://evil.example/b.pdf' }] }],
  ])('AC-7402.4: notice_posts에 %s면 거부된다(23514)', async (_name, values) => {
    const noticeId = await seedNotice()
    await become(COL)
    await expect(postgrestInsert('public.notice_posts', [{ ...POST, ...values, notice_id: noticeId }])).rejects.toMatchObject(CHECK_FAILED)
    expect(await tableNow('notice_posts', 'id')).toEqual([])
  })

  it.each<[string, Row]>([
    ['화요일', { week_start: '2026-11-17' }],
    ['일요일', { week_start: '2026-11-15' }],
    ['꼭 알 것 4개', { top3: [...TOP3, TOP3[0]] }],
    ['꼭 알 것이 객체', { top3: { head: 'a', body: 'b' } }],
    ['항목에 body 없음', { top3: [{ head: 'a' }] }],
    ['항목 칸 더 있음', { top3: [{ head: 'a', body: 'b', extra: 'c' }] }],
    ['head가 숫자', { top3: [{ head: 1, body: 'b' }] }],
    ['head 61자', { top3: [{ head: '가'.repeat(61), body: 'b' }] }],
    ['body 121자', { top3: [{ head: 'a', body: '가'.repeat(121) }] }],
    ['항목이 글자', { top3: ['a'] }],
  ])('AC-7402.4: notice_weeks에 %s면 거부된다(23514)', async (_name, values) => {
    await become(COL)
    await expect(postgrestInsert('public.notice_weeks', [{ week_start: '2026-11-16', top3: TOP3, ...values }])).rejects.toMatchObject(CHECK_FAILED)
    expect(await tableNow('notice_weeks', 'week_start')).toEqual([])
  })

  it.each<[string, string, string]>([
    ['state 밖', 'state', 'paused'],
    ['error_code 밖', 'error_code', 'timeout'],
    ['cursor 배열', 'cursor', '[]'],
    ['cursor 1,000바이트 넘음', 'cursor', JSON.stringify({ page: 'a'.repeat(1000) })],
  ])('AC-7402.4: notice_sources %s면 거부된다(23514)', async (_name, column, value) => {
    const before = await tableNow('notice_sources', 'source')
    await become(COL)
    const cast = column === 'cursor' ? '::jsonb' : ''
    await expect(db.query(`update public.notice_sources set ${column} = $1${cast} where source = 'hira_notice'`, [value])).rejects.toMatchObject(
      CHECK_FAILED,
    )
    await operator()
    await db.exec(`delete from public.notice_sources where source = 'mohw_rss'`)
    await become(COL)
    await expect(postgrestInsert('public.notice_sources', [{ source: 'mohw_rss', [column]: column === 'cursor' ? JSON.parse(value) : value }])).rejects.toMatchObject(
      CHECK_FAILED,
    )
    expect((await tableNow('notice_sources', 'source')).filter((s) => s.source !== 'mohw_rss')).toEqual(before.filter((s) => s.source !== 'mohw_rss'))
  })

  it('AC-7402.4: notice_sources에 정한 출처 밖 이름은 거부된다(23514)', async () => {
    await become(COL)
    await expect(postgrestInsert('public.notice_sources', [{ source: 'kma' }])).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-7402.4: 같은 group_key 묶음·같은 출처·key 글은 둘이 될 수 없다(23505)', async () => {
    const noticeId = await seedNotice({ group_key: 'gosi:2026-218' })
    await seedPost(noticeId, { source_key: '12353' })
    await become(COL)
    await expect(postgrestInsert('public.notices', [{ ...NOTICE, group_key: 'gosi:2026-218' }])).rejects.toMatchObject({ code: '23505' })
    await become(COL)
    await expect(postgrestInsert('public.notice_posts', [{ ...POST, source_key: '12353', notice_id: noticeId }])).rejects.toMatchObject({ code: '23505' })
    await become(COL)
    await postgrestInsert('public.notice_posts', [{ ...POST, source: 'hira_crtr', source_key: '12353', url: CRTR_URL, notice_id: noticeId }])
    expect(await tableNow('notice_posts', 'id')).toHaveLength(2)
  })

  it('AC-7402.4: 칸 모양·기본값: 글자 칸은 비울 수 없고 body·attach_text·rule_hits·state·tries·attachments·top3·cursor·counts는 기본값이 있다', async () => {
    await become(COL)
    const inserted = await db.query<Row>(
      `insert into public.notices (group_key, title, kind, posted_on) values ('post:mohw_rss:1', '제목', 'notice', '2026-11-18')
       returning body, attach_text, read_mode, related, summary, rule_hits, rule_count, state, tries, batch_id, notice_no`,
    )
    expect(inserted.rows).toEqual([
      { body: '', attach_text: '', read_mode: null, related: null, summary: null, rule_hits: [], rule_count: 0, state: 'wait', tries: 0, batch_id: null, notice_no: null },
    ])
    await become(COL)
    await expect(db.query(`insert into public.notices (group_key, kind, posted_on) values ('post:mohw_rss:2', 'notice', '2026-11-18')`)).rejects.toMatchObject(NOT_NULL)
    await become(COL)
    await expect(postgrestInsert('public.notices', [{ ...NOTICE, group_key: 'post:mohw_rss:3', body: null }])).rejects.toMatchObject(NOT_NULL)
    await operator()
    const [w] = await rows(`insert into public.notice_weeks (week_start) values ('2026-11-16') returning top3`)
    expect(w.top3).toEqual([])
    const [run] = await rows(`insert into public.notice_runs default values returning counts, input_tokens, output_tokens, cost_micro_usd, finished_at`)
    expect(run).toEqual({ counts: {}, input_tokens: 0, output_tokens: 0, cost_micro_usd: 0, finished_at: null })
  })

  it('AC-7402.4: notice_runs의 counts는 객체 2,000바이트까지이고 토큰·비용은 0 이상이다', async () => {
    await operator()
    await expect(db.query(`insert into public.notice_runs (counts) values ('[]')`)).rejects.toMatchObject(CHECK_FAILED)
    await expect(db.query(`insert into public.notice_runs (counts) values ($1::jsonb)`, [JSON.stringify({ x: 'a'.repeat(2000) })])).rejects.toMatchObject(CHECK_FAILED)
    for (const column of ['input_tokens', 'output_tokens', 'cost_micro_usd']) {
      await expect(db.query(`insert into public.notice_runs (${column}) values (-1)`)).rejects.toMatchObject(CHECK_FAILED)
    }
    await expect(db.query(`insert into public.notice_ask_days (hospital_id, day, count) values ($1, '2026-11-20', 21)`, [hospital[A]])).rejects.toMatchObject(
      CHECK_FAILED,
    )
    await expect(db.query(`insert into public.notice_ask_days (hospital_id, day, count) values ($1, '2026-11-20', -1)`, [hospital[A]])).rejects.toMatchObject(
      CHECK_FAILED,
    )
  })

  it('AC-7402.4: 묶음을 지우면 그 출처 글·표시 줄도 함께 지워진다(SQL 편집기에서만)', async () => {
    const first = await seedNotice()
    const second = await seedNotice()
    await seedPost(first)
    await seedPost(second)
    await seedMark(A, first, { starred: true })
    await seedMark(A, second, { starred: true })
    await operator()
    await db.query(`delete from public.notices where id = $1`, [first])
    expect((await tableNow('notice_posts', 'id')).map((p) => p.notice_id)).toEqual([second])
    expect((await marksNow()).map((m) => m.notice_id)).toEqual([second])
  })
})

describe('AC-7402.5 notice_marks(내 병원 표시)', SLOW, () => {
  it('AC-7402.5: 원장 A는 hospital_id 없이 넣고 그 줄은 A 병원 줄이 된다(기본값 my_hospital_id())', async () => {
    const noticeId = await seedNotice()
    await become(A)
    await postgrestInsert('public.notice_marks', [{ notice_id: noticeId, read_at: '2026-11-20T01:00:00Z' }])
    const [mark] = await marksNow()
    expect(mark).toMatchObject({ hospital_id: hospital[A], notice_id: noticeId, starred: false, memo: '', memo_at: null, rules_checked_at: null })
    expect((mark.read_at as Date).toISOString()).toBe('2026-11-20T01:00:00.000Z')
    const [column] = await rows(
      `select column_default from information_schema.columns where table_schema = 'public' and table_name = 'notice_marks' and column_name = 'hospital_id'`,
    )
    expect(column.column_default).toBe('my_hospital_id()')
  })

  it('AC-7402.5: 원장 A는 upsert(onConflict hospital_id,notice_id)로 표시를 넣고 다시 저장해 고치며, 고치기로도 바꾼다', async () => {
    const noticeId = await seedNotice()
    await become(A)
    await postgrestInsert('public.notice_marks', [{ notice_id: noticeId, starred: true }], 'hospital_id, notice_id')
    await become(A)
    await postgrestInsert('public.notice_marks', [{ notice_id: noticeId, memo: '12월 회의 때 알리기', memo_at: '2026-11-20T02:00:00Z' }], 'hospital_id, notice_id')
    await become(A)
    expect((await db.query(`update public.notice_marks set rules_checked_at = now() where notice_id = $1`, [noticeId])).affectedRows).toBe(1)
    await become(A)
    expect(await rows(`select starred, memo, memo_at is not null as memo_set, rules_checked_at is not null as checked from public.notice_marks`)).toEqual([
      { starred: true, memo: '12월 회의 때 알리기', memo_set: true, checked: true },
    ])
    expect(await marksNow()).toHaveLength(1)
  })

  it('AC-7402.5: 원장도 표시 줄을 지우지 못하고(권한 없음) hospital_id를 넣거나 고치지 못한다', async () => {
    const noticeId = await seedNotice()
    await seedMark(A, noticeId, { starred: true })
    await become(A)
    await expect(db.query(`delete from public.notice_marks`)).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(postgrestInsert('public.notice_marks', [{ hospital_id: hospital[A], notice_id: noticeId }])).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(db.query(`update public.notice_marks set hospital_id = $1`, [hospital[B]])).rejects.toMatchObject(DENIED)
    await become(A)
    await expect(db.query(`update public.notice_marks set updated_at = now()`)).rejects.toMatchObject(DENIED)
    expect(await marksNow()).toMatchObject([{ hospital_id: hospital[A], notice_id: noticeId, starred: true }])
  })

  it('AC-7402.5: A는 B의 표시를 읽지도 고치지도 못하고, 같은 글에 둘이 따로 표시한다', async () => {
    const noticeId = await seedNotice()
    await seedMark(B, noticeId, { starred: true, memo: 'B 메모' })
    await become(A)
    expect(await rows(`select * from public.notice_marks`)).toEqual([])
    await become(A)
    expect((await db.query(`update public.notice_marks set memo = '바꿈'`)).affectedRows).toBe(0)
    await become(A)
    await postgrestInsert('public.notice_marks', [{ notice_id: noticeId, memo: 'A 메모' }], 'hospital_id, notice_id')
    expect((await marksNow()).map((m) => [m.hospital_id, m.memo]).sort()).toEqual(
      [
        [hospital[A], 'A 메모'],
        [hospital[B], 'B 메모'],
      ].sort(),
    )
    await become(A)
    expect(await rows(`select memo from public.notice_marks`)).toEqual([{ memo: 'A 메모' }])
  })

  it('AC-7402.5: memo는 500자까지이고 501자는 거부(23514), null은 거부(23502)된다', async () => {
    const noticeId = await seedNotice()
    await become(A)
    await postgrestInsert('public.notice_marks', [{ notice_id: noticeId, memo: '가'.repeat(500) }])
    await become(A)
    await expect(db.query(`update public.notice_marks set memo = $1`, ['가'.repeat(501)])).rejects.toMatchObject(CHECK_FAILED)
    await become(A)
    await expect(db.query(`update public.notice_marks set memo = null`)).rejects.toMatchObject(NOT_NULL)
    expect((await marksNow())[0].memo).toBe('가'.repeat(500))
  })

  it('AC-7402.5: 원장이 고치면 updated_at이 지금으로 바뀐다', async () => {
    const noticeId = await seedNotice()
    await seedMark(A, noticeId, {})
    await backdate('notice_marks')
    await become(A)
    await db.query(`update public.notice_marks set starred = true`)
    await operator()
    expect(await rows(`select updated_at > now() - interval '1 hour' as fresh from public.notice_marks`)).toEqual([{ fresh: true }])
  })

  it.each<[string, string]>([
    ['데스크', K],
    ['모으기 계정', COL],
    ['승인 대기 원장', P],
    ['거절된 원장', R],
    ['병원 없는 계정', E],
    ['관리자(병원 없음)', ADMIN],
  ])('AC-7402.5: %s는 표시를 읽지도 넣지도 고치지도 못한다', async (_name, user) => {
    const noticeId = await seedNotice()
    await seedMark(A, noticeId, { starred: true })
    await seedMark(B, noticeId, { memo: 'B 메모' })
    const before = await marksNow()
    await become(user)
    expect(await rows(`select * from public.notice_marks`)).toEqual([])
    await become(user)
    await expect(postgrestInsert('public.notice_marks', [{ notice_id: noticeId, starred: true }])).rejects.toThrow(RLS_OR_NULL)
    await become(user)
    expect((await db.query(`update public.notice_marks set memo = '바꿈'`)).affectedRows).toBe(0)
    expect(await marksNow()).toEqual(before)
  })

  it('AC-7402.5: 병원을 지우면 그 병원 표시도 지워지고 다른 병원 표시는 그대로다', async () => {
    const noticeId = await seedNotice()
    await seedMark(A, noticeId, { starred: true })
    await seedMark(B, noticeId, { starred: true })
    await operator()
    await db.query(`delete from public.hospitals where id = $1`, [hospital[B]])
    expect((await marksNow()).map((m) => m.hospital_id)).toEqual([hospital[A]])
  })
})

describe('AC-7402.6 실행 기록·묻기 표', SLOW, () => {
  it.each<[string, string, number]>([
    ['관리자', ADMIN, 2],
    ['모으기 계정', COL, 2],
    ['원장 A', A, 0],
    ['원장 B', B, 0],
    ['데스크', K, 0],
    ['승인 대기 원장', P, 0],
    ['병원 없는 계정', E, 0],
  ])('AC-7402.6: %s는 notice_runs를 %i줄 본다', async (_name, user, n) => {
    await operator()
    await db.exec(`insert into public.notice_runs (counts, input_tokens) values ('{"summarized": 3}', 10), ('{}', 0)`)
    await become(user)
    expect(await rows(`select * from public.notice_runs`)).toHaveLength(n)
  })

  it.each<[string, string]>([
    ['모으기 계정', COL],
    ['관리자', ADMIN],
    ['원장 A', A],
  ])('AC-7402.6: %s도 notice_runs에 바로 넣고 고치고 지우지 못한다(함수로만)', async (_name, user) => {
    await operator()
    await db.exec(`insert into public.notice_runs (counts) values ('{}')`)
    const before = await tableNow('notice_runs', 'id')
    await become(user)
    await expect(db.query(`insert into public.notice_runs default values`)).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`update public.notice_runs set input_tokens = 999`)).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`delete from public.notice_runs`)).rejects.toMatchObject(DENIED)
    expect(await tableNow('notice_runs', 'id')).toEqual(before)
  })

  it.each(
    (['notice_ask_days', 'notice_ask_holds'] as const).flatMap((table) =>
      (
        [
          ['원장 A', A],
          ['모으기 계정', COL],
          ['관리자', ADMIN],
          ['데스크', K],
        ] as const
      ).map(([name, user]) => [table, name, user] as [string, string, string]),
    ),
  )('AC-7402.6: %s는 %s도 읽고 넣고 고치고 지우지 못한다(함수로만)', async (table, _name, user) => {
    await operator()
    await db.query(`insert into public.notice_ask_days (hospital_id, day, count) values ($1, '2026-11-20', 3)`, [hospital[A]])
    await db.query(`insert into public.notice_ask_holds (hospital_id, day) values ($1, '2026-11-20')`, [hospital[A]])
    const column = SOME_COLUMN[table]
    await become(user)
    await expect(db.query(`select * from public.${table}`)).rejects.toMatchObject(DENIED)
    await become(user)
    const values = table === 'notice_ask_days' ? `(hospital_id, day, count) values ('${hospital[A]}', '2026-11-21', 0)` : `(hospital_id, day) values ('${hospital[A]}', '2026-11-21')`
    await expect(db.query(`insert into public.${table} ${values}`)).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`update public.${table} set ${column} = ${column}`)).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`delete from public.${table}`)).rejects.toMatchObject(DENIED)
    expect(await askDays()).toEqual([{ hospital_id: hospital[A], day: '2026-11-20', count: 3 }])
    expect(await askHolds()).toHaveLength(1)
  })
})

describe('AC-7403.1 실행 시작·사용량·마감', SLOW, () => {
  it('AC-7403.1: 모으기 계정이 notice_start_run()을 부르면 새 실행 줄 id이고, 끝나지 않은 그 실행이 있으면 다음은 null이다', async () => {
    await become(COL)
    const id = await call('public.notice_start_run()')
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    await become(COL)
    expect(await call('public.notice_start_run()')).toBeNull()
    await operator()
    expect(await rows(`select id, finished_at, started_at > now() - interval '1 minute' as fresh from public.notice_runs`)).toEqual([
      { id, finished_at: null, fresh: true },
    ])
  })

  it('AC-7403.1: 끝나지 않은 실행이 6분 안(5분 50초 전)이면 null, 6분이 지났으면(6분 10초 전) 새 줄이다', async () => {
    await operator()
    await db.exec(`insert into public.notice_runs (started_at) values (now() - interval '5 minutes 50 seconds')`)
    await become(COL)
    expect(await call('public.notice_start_run()')).toBeNull()
    await operator()
    await db.exec(`update public.notice_runs set started_at = now() - interval '6 minutes 10 seconds'`)
    await become(COL)
    const id = await call('public.notice_start_run()')
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await tableNow('notice_runs', 'started_at')).toHaveLength(2)
  })

  it('AC-7403.1: 앞 실행이 끝났으면(finished_at 있음) 바로 새 줄이다', async () => {
    await become(COL)
    const first = await call('public.notice_start_run()')
    await become(COL)
    await call('public.notice_finish_run($1::uuid, $2::jsonb)', [first, JSON.stringify({ summarized: 1 })])
    await become(COL)
    const second = await call('public.notice_start_run()')
    expect(second).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
  })

  it('AC-7403.1: notice_start_run은 실행 표를 잠근 뒤 본다(같은 때 두 실행이 와도 하나만)', async () => {
    const [fn] = await rows(`select prosrc from pg_proc where oid = to_regprocedure('public.notice_start_run()')`)
    expect(String(fn.prosrc)).toMatch(/lock table public\.notice_runs in (share row exclusive|exclusive) mode/i)
  })

  it('AC-7403.1: notice_add_run_usage는 그 실행 줄에 토큰·비용을 더하고 notice_finish_run은 끝 시각·건수를 적는다', async () => {
    await become(COL)
    const id = await call('public.notice_start_run()')
    await become(COL)
    await call('public.notice_add_run_usage($1::uuid, $2::bigint, $3::bigint, $4::bigint)', [id, 1200, 300, 45000])
    await become(COL)
    await call('public.notice_add_run_usage($1::uuid, $2::bigint, $3::bigint, $4::bigint)', [id, 800, 200, 5000])
    const counts = { new: { hira_notice: 3, hira_crtr: 0, mohw_rss: 1 }, stopped: ['hira_crtr'], summarized: 2, batched: 0, collected: 0, failed: 0 }
    await become(COL)
    await call('public.notice_finish_run($1::uuid, $2::jsonb)', [id, JSON.stringify(counts)])
    await operator()
    expect(
      await rows(
        `select input_tokens::int as i, output_tokens::int as o, cost_micro_usd::int as c, counts, finished_at > now() - interval '1 minute' as done from public.notice_runs`,
      ),
    ).toEqual([{ i: 2000, o: 500, c: 50000, counts, done: true }])
  })

  it('AC-7403.1: 사용량이 음수거나 비면 22023이고, 건수가 2,000바이트를 넘으면 23514이며 줄은 그대로다', async () => {
    await become(COL)
    const id = await call('public.notice_start_run()')
    for (const args of [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
      [null, 0, 0],
    ]) {
      await become(COL)
      await expect(db.query(`select public.notice_add_run_usage($1::uuid, $2::bigint, $3::bigint, $4::bigint)`, [id, ...args])).rejects.toMatchObject(BAD_VALUE)
    }
    await become(COL)
    await expect(db.query(`select public.notice_finish_run($1::uuid, $2::jsonb)`, [id, JSON.stringify({ x: 'a'.repeat(2000) })])).rejects.toMatchObject(CHECK_FAILED)
    await operator()
    expect(await rows(`select input_tokens::int as i, finished_at from public.notice_runs`)).toEqual([{ i: 0, finished_at: null }])
  })

  it.each<[string, string]>([
    ['관리자', ADMIN],
    ['원장 A', A],
    ['데스크', K],
    ['병원 없는 계정', E],
  ])('AC-7403.1: %s가 세 함수를 부르면 42501이고 실행 표는 그대로다', async (_name, user) => {
    await operator()
    const [run] = await rows(`insert into public.notice_runs (started_at) values (now() - interval '1 hour') returning id`)
    const before = await tableNow('notice_runs', 'id')
    await become(user)
    await expect(db.query(`select public.notice_start_run()`)).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`select public.notice_add_run_usage($1::uuid, 1, 1, 1)`, [run.id])).rejects.toMatchObject(DENIED)
    await become(user)
    await expect(db.query(`select public.notice_finish_run($1::uuid, '{}')`, [run.id])).rejects.toMatchObject(DENIED)
    expect(await tableNow('notice_runs', 'id')).toEqual(before)
  })
})

describe('AC-7403.2 take_notice_ask(하루 20번)', SLOW, () => {
  it('AC-7403.2: 원장 A는 한국 날짜 하루에 20번째까지 표(서로 다른 uuid)를 받고 21번째부터 null이다', async () => {
    const tokens = await takeAsks(A, 22)
    const given = tokens.slice(0, 20)
    for (const t of given) expect(t).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Set(given).size).toBe(20)
    expect(tokens.slice(20)).toEqual([null, null])
    expect(await askDays()).toEqual([{ hospital_id: hospital[A], day: daysBefore(0), count: 20 }])
    const holds = await askHolds()
    expect(holds).toHaveLength(20)
    expect(holds.map((h) => h.token).sort()).toEqual([...given].sort())
    for (const h of holds) expect(h).toMatchObject({ hospital_id: hospital[A], day: daysBefore(0) })
  })

  it('AC-7403.2: 병원마다 따로 센다(A가 20번을 다 써도 B는 받는다)', async () => {
    await takeAsks(A, 20)
    const [b] = await takeAsks(B, 1)
    expect(b).toMatch(/^[0-9a-f-]{36}$/)
    expect(await askDays()).toEqual(
      [
        { hospital_id: hospital[A], day: daysBefore(0), count: 20 },
        { hospital_id: hospital[B], day: daysBefore(0), count: 1 },
      ].sort((x, y) => x.hospital_id.localeCompare(y.hospital_id)),
    )
  })

  it('AC-7403.2: 다음 날에는 다시 표를 받고, 하루 지난 표는 이때 지워진다(어제 수는 그대로)', async () => {
    await takeAsks(A, 20)
    await takeAsks(B, 2)
    await operator()
    await db.exec(`update public.notice_ask_days set day = day - 1; update public.notice_ask_holds set day = day - 1`)
    const [t] = await takeAsks(A, 1)
    expect(t).toMatch(/^[0-9a-f-]{36}$/)
    expect((await askDays()).filter((d) => d.hospital_id === hospital[A])).toEqual([
      { hospital_id: hospital[A], day: daysBefore(1), count: 20 },
      { hospital_id: hospital[A], day: daysBefore(0), count: 1 },
    ])
    expect(await askHolds()).toEqual([{ token: t, hospital_id: hospital[A], day: daysBefore(0) }])
  })

  it.each<[string, string]>([
    ['승인 대기 원장', P],
    ['거절된 원장', R],
    ['데스크', K],
    ['병원 없는 계정', E],
    ['모으기 계정', COL],
    ['관리자(병원 없음)', ADMIN],
  ])('AC-7403.2: %s는 42501이고 아무 줄도 생기지 않는다', async (_name, user) => {
    await become(user)
    await expect(db.query(`select public.take_notice_ask()`)).rejects.toMatchObject(DENIED)
    expect(await askDays()).toEqual([])
    expect(await askHolds()).toEqual([])
  })
})

describe('AC-7403.3 end_notice_ask·notice_ask_left', SLOW, () => {
  it('AC-7403.3: end_notice_ask(표, false)는 그 표를 지우고 그날 수를 1 되돌린다', async () => {
    const [first, second] = await takeAsks(A, 2)
    await become(A)
    await call('public.end_notice_ask($1::uuid, false)', [first])
    expect(await askDays()).toEqual([{ hospital_id: hospital[A], day: daysBefore(0), count: 1 }])
    expect((await askHolds()).map((h) => h.token)).toEqual([second])
  })

  it('AC-7403.3: end_notice_ask(표, true)는 표만 지우고 수는 그대로다', async () => {
    const [first, second] = await takeAsks(A, 2)
    await become(A)
    await call('public.end_notice_ask($1::uuid, true)', [first])
    expect(await askDays()).toEqual([{ hospital_id: hospital[A], day: daysBefore(0), count: 2 }])
    expect((await askHolds()).map((h) => h.token)).toEqual([second])
  })

  it('AC-7403.3: 없는 표·다른 병원 표·이미 쓴 표·어제 표는 아무것도 바꾸지 않는다', async () => {
    const [a1, a2] = await takeAsks(A, 2)
    const [b1] = await takeAsks(B, 1)
    await become(A)
    await call('public.end_notice_ask($1::uuid, true)', [a1])
    const days = await askDays()
    const holds = await askHolds()
    for (const token of [a1, b1, '00000000-0000-4000-8000-00000000ffff', null]) {
      await become(A)
      await call('public.end_notice_ask($1::uuid, false)', [token])
    }
    expect(await askDays()).toEqual(days)
    expect(await askHolds()).toEqual(holds)
    await operator()
    await db.query(`update public.notice_ask_holds set day = day - 1 where token = $1`, [a2])
    const shifted = await askHolds()
    await become(A)
    await call('public.end_notice_ask($1::uuid, false)', [a2])
    expect(await askDays()).toEqual(days)
    expect(await askHolds()).toEqual(shifted)
  })

  it('AC-7403.3: 원장이 아닌 계정이 end_notice_ask를 불러도 아무것도 바뀌지 않는다', async () => {
    const [a1] = await takeAsks(A, 1)
    const days = await askDays()
    for (const user of [K, COL, P, E]) {
      await become(user)
      await call('public.end_notice_ask($1::uuid, false)', [a1])
    }
    expect(await askDays()).toEqual(days)
    expect(await askHolds()).toHaveLength(1)
  })

  it('AC-7403.3: notice_ask_left()는 20 − 오늘 수다(처음 20, 3번 받으면 17, 하나 되돌리면 18, 다 쓰면 0, 어제 수는 안 셈)', async () => {
    await become(A)
    expect(await call('public.notice_ask_left()')).toBe(20)
    const [t] = await takeAsks(A, 3)
    await become(A)
    expect(await call('public.notice_ask_left()')).toBe(17)
    await become(A)
    await call('public.end_notice_ask($1::uuid, false)', [t])
    await become(A)
    expect(await call('public.notice_ask_left()')).toBe(18)
    await takeAsks(A, 18)
    await become(A)
    expect(await call('public.notice_ask_left()')).toBe(0)
    await become(B)
    expect(await call('public.notice_ask_left()')).toBe(20)
    await operator()
    await db.exec(`update public.notice_ask_days set day = day - 1`)
    await become(A)
    expect(await call('public.notice_ask_left()')).toBe(20)
  })

  it.each<[string, string]>([
    ['데스크', K],
    ['승인 대기 원장', P],
    ['모으기 계정', COL],
  ])('AC-7403.3: %s의 notice_ask_left()는 42501이다', async (_name, user) => {
    await become(user)
    await expect(db.query(`select public.notice_ask_left()`)).rejects.toMatchObject(DENIED)
  })

  it('AC-7403.3: 묻기 함수들은 한국 날짜로 센다(Asia/Seoul, current_date 안 씀)', async () => {
    for (const fn of ['public.take_notice_ask()', 'public.end_notice_ask(uuid,boolean)', 'public.notice_ask_left()']) {
      const [found] = await rows(`select prosrc from pg_proc where oid = to_regprocedure($1)`, [fn])
      expect([fn, String(found.prosrc).includes("now() at time zone 'Asia/Seoul'")]).toEqual([fn, true])
      expect(String(found.prosrc)).not.toMatch(/current_date/i)
    }
  })
})

describe('AC-7403.4 notice_search', SLOW, () => {
  async function seedSearch() {
    const ids = {
      title: await seedNotice({ title: '체외충격파 수가 개정 MRI', body: '물리치료 기준', posted_on: '2026-11-10' }),
      body: await seedNotice({ title: '공지', body: '체외충격파 급여 기준', attach_text: '도수치료 안내', posted_on: '2026-11-12' }),
      attach: await seedNotice({ title: '붙임 안내', body: '', attach_text: '체외충격파 서식', posted_on: '2026-11-05' }),
      what: await seedNotice({ title: '요약만', body: '', summary: { ...SUMMARY, what: '주사 횟수가 줄어요', when: '', who: '', forUs: '' }, posted_on: '2026-11-01' }),
      when: await seedNotice({ title: '언제', body: '', summary: { ...SUMMARY, what: '', when: '내년 봄부터', who: '', forUs: '' }, posted_on: '2026-10-30' }),
      who: await seedNotice({ title: '누구', body: '', summary: { ...SUMMARY, what: '', when: '', who: '요양병원 대상', forUs: '' }, posted_on: '2026-10-29' }),
      forUs: await seedNotice({ title: '우리', body: '', summary: { ...SUMMARY, what: '', when: '', who: '', forUs: '해당 없어요 확인' }, posted_on: '2026-10-28' }),
      other: await seedNotice({
        title: '다른 칸',
        body: '',
        summary: { ...SUMMARY, what: '', when: '', who: '', forUs: '', amends: ['숨은낱말'], note: '숨은낱말' },
        posted_on: '2026-10-27',
      }),
      percent: await seedNotice({ title: '본인부담 30% 인하', body: '', posted_on: '2026-10-20' }),
      plain: await seedNotice({ title: '본인부담 30 인하 ab', body: '', posted_on: '2026-10-19' }),
      under: await seedNotice({ title: '코드 a_b 변경', body: '', posted_on: '2026-10-18' }),
      slash: await seedNotice({ title: '경로 c:\\hira 안내', body: '', posted_on: '2026-10-17' }),
    }
    return ids
  }

  it('AC-7403.4: 낱말이 제목·본문·붙임 글자에 든 글 id를 최근 글부터 돌려준다', async () => {
    const ids = await seedSearch()
    expect(await search(A, '체외충격파')).toEqual([ids.body, ids.title, ids.attach])
    expect(await search(A, '도수치료')).toEqual([ids.body])
  })

  it('AC-7403.4: 요약 글은 what·when·who·forUs 네 칸만 찾고 다른 칸(amends 등)은 찾지 않는다', async () => {
    const ids = await seedSearch()
    expect(await search(A, '주사')).toEqual([ids.what])
    expect(await search(A, '내년')).toEqual([ids.when])
    expect(await search(A, '요양병원')).toEqual([ids.who])
    expect(await search(A, '해당 없어요')).toEqual([ids.forUs])
    expect(await search(A, '숨은낱말')).toEqual([])
  })

  it('AC-7403.4: 빈칸으로 나눈 낱말이 모두 든 글만이고(칸이 달라도 됨) 탭·여러 빈칸도 나눈다', async () => {
    const ids = await seedSearch()
    expect(await search(A, '체외충격파 물리치료')).toEqual([ids.title])
    expect(await search(A, '공지 도수치료')).toEqual([ids.body])
    expect(await search(A, '체외충격파\t \n물리치료')).toEqual([ids.title])
    expect(await search(A, '체외충격파 없는낱말')).toEqual([])
  })

  it('AC-7403.4: 낱말은 5개까지만 보고 6번째부터는 버린다', async () => {
    const ids = await seedSearch()
    expect(await search(A, '체외충격파 수가 개정 물리치료 기준 없는낱말')).toEqual([ids.title])
    expect(await search(A, '체외충격파 수가 개정 물리치료 없는낱말 기준')).toEqual([])
  })

  it('AC-7403.4: %·_·\\는 글자 그대로 찾는다', async () => {
    const ids = await seedSearch()
    expect(await search(A, '30%')).toEqual([ids.percent])
    expect(await search(A, '%')).toEqual([ids.percent])
    expect(await search(A, 'a_b')).toEqual([ids.under])
    expect(await search(A, '_')).toEqual([ids.under])
    expect(await search(A, '\\')).toEqual([ids.slash])
    expect(await search(A, 'c:\\hira')).toEqual([ids.slash])
  })

  it('AC-7403.4: 영문은 대소문자를 가리지 않고, 앞뒤 공백은 뗀다', async () => {
    const ids = await seedSearch()
    expect(await search(A, 'mri')).toEqual([ids.title])
    expect(await search(A, '  \t주사\n ')).toEqual([ids.what])
  })

  it('AC-7403.4: 앞뒤 공백을 뗀 1~50자가 아니면 빈 목록이다(빈 글자·공백만·51자·null), 50자는 찾는다', async () => {
    await seedSearch()
    const fifty = '가'.repeat(50)
    const target = await seedNotice({ title: `제목 ${fifty}`, posted_on: '2026-11-15' })
    expect(await search(A, '')).toEqual([])
    expect(await search(A, '   ')).toEqual([])
    expect(await search(A, null)).toEqual([])
    expect(await search(A, `${fifty}가`)).toEqual([])
    expect(await search(A, `  ${fifty}  `)).toEqual([target])
  })

  it('AC-7403.4: 맞는 글이 200개를 넘으면 최근 글부터 200개다', async () => {
    await operator()
    await db.query(
      `insert into public.notices (group_key, title, kind, posted_on)
       select 'post:hira_notice:many' || n, '공통낱말 ' || n, 'notice', date '2026-01-01' + n from generate_series(0, 204) as n`,
    )
    await become(A)
    const found = await rows(`select n.id, n.posted_on::text as day from public.notice_search('공통낱말') s join public.notices n on n.id = s`)
    expect(found).toHaveLength(200)
    expect(found[0].day).toBe(dayOf2026(204))
    expect(found.at(-1)?.day).toBe(dayOf2026(5))
    const days = found.map((r) => String(r.day))
    expect(days).toEqual([...days].sort().reverse())
  })

  it.each<[string, string]>([
    ['데스크', K],
    ['승인 대기 원장', P],
    ['병원 없는 계정', E],
  ])('AC-7403.4: %s는 빈 목록이다', async (_name, user) => {
    await seedSearch()
    expect(await search(user, '체외충격파')).toEqual([])
  })
})

describe('AC-7403.5 notice_list', SLOW, () => {
  it('AC-7403.5: { total, unread, rows }이고 줄은 글 칸·출처 글들·내 표시·unread만 담는다(본문·붙임 글자 없음)', async () => {
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
      body: '본문은 목록에 없다',
      attach_text: '붙임 글자도 없다',
    })
    await seedPost(id, { source: 'hira_notice', title: '심평원 공지 제목', url: HIRA_URL, posted_on: daysBefore(1), attachments: [{ name: '붙임1.pdf', url: FILE_URL }] })
    await seedPost(id, { source: 'mohw_rss', title: '복지부 제목', url: MOHW_URL, posted_on: daysBefore(2), attachments: [] })
    await seedMark(A, id, { read_at: '2026-11-20T01:02:03Z', starred: true, memo: '회의 때 알리기', memo_at: '2026-11-20T02:00:00Z' })
    const page = await list(A)
    expect(page).toEqual({
      total: 1,
      unread: 0,
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
          mark: { readAt: expect.any(String), starred: true, memo: '회의 때 알리기', memoAt: expect.any(String), rulesCheckedAt: null },
          unread: false,
        },
      ],
    })
    const mark = page.rows[0].mark as Row
    expect(new Date(String(mark.readAt)).toISOString()).toBe('2026-11-20T01:02:03.000Z')
    expect(new Date(String(mark.memoAt)).toISOString()).toBe('2026-11-20T02:00:00.000Z')
  })

  it('AC-7403.5: 출처 글은 복지부 → 심평원 공지 → 심평원 심사기준 차례이고, 내 표시가 없으면 기본 모양이며 남의 표시는 섞이지 않는다', async () => {
    const id = await seedNotice({ posted_on: daysBefore(20) })
    await seedPost(id, { source: 'hira_crtr', url: CRTR_URL, attachments: [] })
    await seedPost(id, { source: 'hira_notice' })
    await seedPost(id, { source: 'mohw_rss', url: MOHW_URL, attachments: [] })
    await seedMark(B, id, { read_at: '2026-11-20T01:00:00Z', starred: true, memo: 'B 메모', rules_checked_at: '2026-11-20T01:00:00Z' })
    const [row] = (await list(A)).rows
    expect((row.posts as Row[]).map((p) => p.source)).toEqual(['mohw_rss', 'hira_notice', 'hira_crtr'])
    expect(row.mark).toEqual({ readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: null })
    const empty = await seedNotice({ posted_on: daysBefore(21) })
    const page = await list(A)
    expect(page.rows.find((r) => r.id === empty)?.posts).toEqual([])
  })

  it('AC-7403.5: p_related 참이면 관련 글과 요약 전(wait·batch)·실패 글만이고, 요약이 끝난 무관 글은 빠진다', async () => {
    const related = await seedNotice({ related: true, state: 'done', posted_on: '2026-11-10' })
    const unrelated = await seedNotice({ related: false, state: 'done', posted_on: '2026-11-09' })
    const waiting = await seedNotice({ state: 'wait', posted_on: '2026-11-08' })
    const batch = await seedNotice({ state: 'batch', posted_on: '2026-11-07' })
    const failed = await seedNotice({ state: 'failed', tries: 3, posted_on: '2026-11-06' })
    const again = await seedNotice({ related: false, state: 'wait', tries: 1, posted_on: '2026-11-05' })
    expect(idsOf(await list(A, { related: true }))).toEqual([related, waiting, batch, failed, again])
    expect(idsOf(await list(A, { related: false }))).toEqual([related, unrelated, waiting, batch, failed, again])
    expect((await list(A, { related: true })).total).toBe(5)
  })

  it('AC-7403.5: p_sources는 그 출처 글이 하나라도 든 묶음만이고 null이면 거르지 않으며 빈 목록이면 없다', async () => {
    const hira = await seedNotice({ posted_on: '2026-11-10' })
    await seedPost(hira, { source: 'hira_notice' })
    const both = await seedNotice({ posted_on: '2026-11-09' })
    await seedPost(both, { source: 'mohw_rss', url: MOHW_URL, attachments: [] })
    await seedPost(both, { source: 'hira_notice' })
    const crtr = await seedNotice({ posted_on: '2026-11-08' })
    await seedPost(crtr, { source: 'hira_crtr', url: CRTR_URL, attachments: [] })
    const none = await seedNotice({ posted_on: '2026-11-07' })
    expect(idsOf(await list(A, { sources: ['mohw_rss'] }))).toEqual([both])
    expect(idsOf(await list(A, { sources: ['hira_notice'] }))).toEqual([hira, both])
    expect(idsOf(await list(A, { sources: ['hira_crtr', 'mohw_rss'] }))).toEqual([both, crtr])
    expect(idsOf(await list(A, { sources: SOURCES }))).toEqual([hira, both, crtr])
    expect(idsOf(await list(A, { sources: null }))).toEqual([hira, both, crtr, none])
    expect(await list(A, { sources: [] })).toEqual({ total: 0, unread: 0, rows: [] })
  })

  it('AC-7403.5: p_starred는 내 병원이 별표한 글만이다', async () => {
    const mine = await seedNotice({ posted_on: '2026-11-10' })
    const theirs = await seedNotice({ posted_on: '2026-11-09' })
    const unstarred = await seedNotice({ posted_on: '2026-11-08' })
    await seedMark(A, mine, { starred: true })
    await seedMark(A, unstarred, { starred: false, memo: '메모만' })
    await seedMark(B, theirs, { starred: true })
    expect(idsOf(await list(A, { starred: true }))).toEqual([mine])
    expect(idsOf(await list(B, { starred: true }))).toEqual([theirs])
    expect(idsOf(await list(A, { starred: false }))).toEqual([mine, theirs, unstarred])
  })

  it('AC-7403.5: p_ids는 그 id만(최근 글부터, 없는 id는 무시)이고 빈 목록이면 없다', async () => {
    const first = await seedNotice({ posted_on: '2026-11-01' })
    const second = await seedNotice({ posted_on: '2026-11-03' })
    await seedNotice({ posted_on: '2026-11-02' })
    expect(idsOf(await list(A, { ids: [first, second, '00000000-0000-4000-8000-00000000ffff'] }))).toEqual([second, first])
    expect((await list(A, { ids: [first] })).total).toBe(1)
    expect(await list(A, { ids: [] })).toEqual({ total: 0, unread: 0, rows: [] })
  })

  it('AC-7403.5: unread는 올라온 지 14일(한국 날짜, 오늘 포함) 안이고 내 읽음 표시가 없는 글이다', async () => {
    const today = await seedNotice({ posted_on: daysBefore(0) })
    const day13 = await seedNotice({ posted_on: daysBefore(13) })
    const day14 = await seedNotice({ posted_on: daysBefore(14) })
    const readByMe = await seedNotice({ posted_on: daysBefore(1) })
    const readByB = await seedNotice({ posted_on: daysBefore(2) })
    const starredOnly = await seedNotice({ posted_on: daysBefore(3) })
    await seedMark(A, readByMe, { read_at: '2026-11-20T00:00:00Z' })
    await seedMark(B, readByB, { read_at: '2026-11-20T00:00:00Z' })
    await seedMark(A, starredOnly, { starred: true })
    const page = await list(A)
    const unreadOf = Object.fromEntries(page.rows.map((r) => [r.id, r.unread]))
    expect(unreadOf).toEqual({ [today]: true, [day13]: true, [day14]: false, [readByMe]: false, [readByB]: true, [starredOnly]: true })
    expect(page.total).toBe(6)
    expect(page.unread).toBe(4)
    expect(idsOf(await list(A, { unreadOnly: true }))).toEqual([today, readByB, starredOnly, day13])
    expect(await list(A, { unreadOnly: true })).toMatchObject({ total: 4, unread: 4 })
    expect((await list(B)).unread).toBe(4)
  })

  it('AC-7403.5: rows는 최근 글부터 p_limit개(1~50으로 맞춤)·p_offset부터이고 total·unread는 거른 전체 수다', async () => {
    await operator()
    await db.query(
      `insert into public.notices (group_key, title, kind, posted_on)
       select 'post:hira_notice:p' || n, '글 ' || n, 'notice', date '2026-01-01' + n from generate_series(0, 59) as n`,
    )
    const first = await list(A, { limit: 50, offset: 0 })
    expect(first.total).toBe(60)
    expect(first.rows).toHaveLength(50)
    expect(first.rows[0].postedOn).toBe(dayOf2026(59))
    expect(first.rows[49].postedOn).toBe(dayOf2026(10))
    const second = await list(A, { limit: 50, offset: 50 })
    expect(second.total).toBe(60)
    expect(second.rows.map((r) => r.postedOn)).toEqual(Array.from({ length: 10 }, (_, i) => dayOf2026(9 - i)))
    expect((await list(A, { offset: 60 })).rows).toEqual([])
    expect((await list(A, { limit: 100 })).rows).toHaveLength(50)
    expect((await list(A, { limit: 0 })).rows).toHaveLength(1)
    expect((await list(A, { limit: 3, offset: -5 })).rows.map((r) => r.postedOn)).toEqual([dayOf2026(59), dayOf2026(58), dayOf2026(57)])
  })

  it('AC-7403.5: 고르기는 함께 걸린다(관련 · 출처 · 별표 · 안 읽음 · id)', async () => {
    const hit = await seedNotice({ related: true, state: 'done', posted_on: daysBefore(1) })
    await seedPost(hit, { source: 'mohw_rss', url: MOHW_URL, attachments: [] })
    const wrongSource = await seedNotice({ related: true, state: 'done', posted_on: daysBefore(1) })
    await seedPost(wrongSource, { source: 'hira_crtr', url: CRTR_URL, attachments: [] })
    const unrelated = await seedNotice({ related: false, state: 'done', posted_on: daysBefore(1) })
    await seedPost(unrelated, { source: 'mohw_rss', url: MOHW_URL, attachments: [] })
    const read = await seedNotice({ related: true, state: 'done', posted_on: daysBefore(1) })
    await seedPost(read, { source: 'mohw_rss', url: MOHW_URL, attachments: [] })
    for (const id of [hit, wrongSource, unrelated]) await seedMark(A, id, { starred: true })
    await seedMark(A, read, { starred: true, read_at: '2026-11-20T00:00:00Z' })
    const all = { related: true, sources: ['mohw_rss'], starred: true, unreadOnly: true }
    expect(idsOf(await list(A, all))).toEqual([hit])
    expect(idsOf(await list(A, { ...all, ids: [read, wrongSource] }))).toEqual([])
    expect(idsOf(await list(A, { ...all, unreadOnly: false })).sort()).toEqual([hit, read].sort())
  })

  it.each<[string, string]>([
    ['데스크', K],
    ['승인 대기 원장', P],
    ['병원 없는 계정', E],
  ])('AC-7403.5: %s는 { total: 0, unread: 0, rows: [] }이다', async (_name, user) => {
    await seedNotice({ related: true, state: 'done', posted_on: daysBefore(0) })
    expect(await list(user, { related: true })).toEqual({ total: 0, unread: 0, rows: [] })
  })
})

describe('AC-7403.6 notice_unread_count·notice_rule_alerts', SLOW, () => {
  it('AC-7403.6: notice_unread_count()는 관련 글(관련·요약 전·실패) 가운데 unread인 수다', async () => {
    const relatedNew = await seedNotice({ related: true, state: 'done', posted_on: daysBefore(0) })
    await seedNotice({ related: true, state: 'done', posted_on: daysBefore(5) })
    await seedNotice({ state: 'wait', posted_on: daysBefore(1) })
    await seedNotice({ state: 'failed', tries: 3, posted_on: daysBefore(2) })
    await seedNotice({ related: false, state: 'done', posted_on: daysBefore(0) })
    await seedNotice({ related: true, state: 'done', posted_on: daysBefore(14) })
    const read = await seedNotice({ related: true, state: 'done', posted_on: daysBefore(0) })
    await seedMark(A, read, { read_at: '2026-11-20T00:00:00Z' })
    await become(A)
    expect(await call('public.notice_unread_count()')).toBe(4)
    await become(A)
    await postgrestInsert('public.notice_marks', [{ notice_id: relatedNew, read_at: '2026-11-21T00:00:00Z' }], 'hospital_id, notice_id')
    await become(A)
    expect(await call('public.notice_unread_count()')).toBe(3)
    await become(B)
    expect(await call('public.notice_unread_count()')).toBe(5)
    expect((await list(A, { related: true })).unread).toBe(3)
  })

  it('AC-7403.6: notice_rule_alerts()는 규칙 연결이 있고 내 규칙 확인이 없는 글의 id·고시 번호·제목·규칙 수(최근 글부터)다', async () => {
    const older = await seedNotice({
      title: '고시 제2026-218호',
      notice_no: '2026-218',
      posted_on: '2026-11-18',
      rule_hits: [
        { id: 'DX-01', title: '규칙 하나' },
        { id: 'IN-02', title: '규칙 둘' },
      ],
    })
    const newer = await seedNotice({ title: '심사지침 바뀜', notice_no: null, kind: 'guide', posted_on: '2026-11-19', rule_hits: [{ id: 'DX-01', title: '규칙 하나' }] })
    await seedNotice({ title: '규칙 없음', posted_on: '2026-11-20', rule_hits: [] })
    await become(A)
    expect(await rows(`select * from public.notice_rule_alerts()`)).toEqual([
      { id: newer, notice_no: null, title: '심사지침 바뀜', rule_count: 1 },
      { id: older, notice_no: '2026-218', title: '고시 제2026-218호', rule_count: 2 },
    ])
    await seedMark(A, newer, { rules_checked_at: '2026-11-20T03:00:00Z' })
    await seedMark(A, older, { starred: true, read_at: '2026-11-20T03:00:00Z' })
    await become(A)
    expect((await rows(`select id from public.notice_rule_alerts()`)).map((r) => r.id)).toEqual([older])
    await become(B)
    expect((await rows(`select id from public.notice_rule_alerts()`)).map((r) => r.id)).toEqual([newer, older])
  })

  it.each<[string, string]>([
    ['데스크', K],
    ['승인 대기 원장', P],
    ['병원 없는 계정', E],
  ])('AC-7403.6: %s는 0·빈 목록이다', async (_name, user) => {
    await seedNotice({ related: true, state: 'done', posted_on: daysBefore(0), rule_hits: [{ id: 'DX-01', title: '규칙 하나' }] })
    await become(user)
    expect(await call('public.notice_unread_count()')).toBe(0)
    await become(user)
    expect(await rows(`select * from public.notice_rule_alerts()`)).toEqual([])
  })
})
