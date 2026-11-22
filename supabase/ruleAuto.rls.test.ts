import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 점검 규칙 저절로 바꾸기 DB: 표 셋(rule_changes·rule_change_marks·rule_review_tries)·권한·함수 넷·트리거·notice_rule_alerts 다시 만들기
// (rule-auto REQ-7805·REQ-7806, design.md 7절, ADR-040).
// noticeKeywords.rls.test.ts와 같은 방법: 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 차례로
// (auth → … → 데스크 → 20261121000000_notices.sql → 20261121000001_notice_keywords.sql → 이 파일) 그대로 돌린다.
// 실제 Supabase에는 붙지 않는다. Supabase가 미리 갖춘 것(역할·auth)만 흉내 낸다. 메일·글·주소·규칙은 모두 지어낸 것이다
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
const KEYWORDS_MIGRATION = read('./migrations/20261121000001_notice_keywords.sql')
const RULE_AUTO_PATH = fileOf('./migrations/20261122000000_rule_auto.sql')
// 파일이 아직 없으면 빈 글자로 돌아, 시험마다 '표·함수가 없다'로 실패한다(무엇이 빠졌는지 시험별로 보인다)
const RULE_AUTO_MIGRATION = existsSync(RULE_AUTO_PATH) ? readFileSync(RULE_AUTO_PATH, 'utf-8') : ''
// 주석을 뺀 SQL 글자(머리 주석이 설명으로 다른 낱말을 말할 수 있다)
const RULE_AUTO_SQL = RULE_AUTO_MIGRATION.split('\n')
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
const ADMIN = '00000000-0000-4000-8000-0000000000a1' // 관리자(병원 줄 없음, 모으기 계정 아님)
const COL = '00000000-0000-4000-8000-0000000000c1' // 모으기 계정(병원 줄 없음, notice_collectors에 있음)
const USERS = [A, B, P, R, E, K, ADMIN, COL]
const STATUS: Record<string, 'approved' | 'pending' | 'rejected'> = { [A]: 'approved', [B]: 'approved', [P]: 'pending', [R]: 'rejected' }
const DESK_EMAIL: Record<string, string> = { [K]: 'desk-a@fake.test' }
const emailOf = (user: string) => DESK_EMAIL[user] ?? `u${user.slice(-2)}@fake.test`
// 승인된 원장도 모으기 계정도 아닌 계정
const OTHERS: [string, string][] = [
  ['승인 대기 원장', P],
  ['거절된 원장', R],
  ['데스크', K],
  ['병원 없는 계정', E],
  ['관리자(병원 없음)', ADMIN],
]
// 병원 표시를 못 다루는 계정(승인된 원장 밖, 모으기 계정 포함)
const NO_HOSPITAL: [string, string][] = [...OTHERS, ['모으기 계정', COL]]

type Row = Record<string, unknown>

const TABLES = ['rule_changes', 'rule_change_marks', 'rule_review_tries']
const SOME_COLUMN: Record<string, string> = { rule_changes: 'state', rule_change_marks: 'reverted', rule_review_tries: 'tries' }
// 모으기 계정이 넣는 칸(id·state·created_at은 DB가 정한다)
const CHANGE_INSERT = [
  'notice_id',
  'rule_id',
  'base_version',
  'verdict',
  'by_ai',
  'check_code',
  'why',
  'before_text',
  'after_text',
  'effective_from',
  'rule',
]
// 원장이 넣고 고치는 칸(hospital_id는 DB 기본값, reverted_at·updated_at은 트리거). change_id는 화면의 upsert(onConflict hospital_id,change_id)가
// SET에 같은 값을 다시 쓰므로 고치기 칸에도 있다 — 다른 값으로 바꾸는 것은 트리거가 막는다
const MARK_INSERT = ['change_id', 'seen_at', 'reverted']
const MARK_UPDATE = ['change_id', 'seen_at', 'reverted']
const GRANTS: Record<string, { table: string[]; insert: string[]; update: string[] }> = {
  rule_changes: { table: ['SELECT'], insert: CHANGE_INSERT, update: ['state'] },
  rule_change_marks: { table: ['SELECT'], insert: MARK_INSERT, update: MARK_UPDATE },
  rule_review_tries: { table: [], insert: [], update: [] },
}
// 새 함수: [regprocedure, 정의자인가, authenticated가 부르는가]. 모두 search_path 빔이고 anon·PUBLIC은 못 부른다
const NEW_FUNCTIONS: [string, boolean, boolean][] = [
  ['public.rule_review_waiting(date,integer)', true, true],
  ['public.rule_review_failed(uuid)', true, true],
  ['public.rule_change_alerts()', false, true],
  ['public.see_rule_changes(uuid)', false, true],
  ['public.rule_change_marks_touch()', false, false],
]
// 다시 만드는 함수 하나(인자·돌려주는 모양·호출자·권한 그대로)
const REMADE = 'public.notice_rule_alerts()'
const nameOf = (fn: string) => fn.replace(/^public\./, '').replace(/\(.*$/, '')
const NEW_FUNCTION_NAMES = NEW_FUNCTIONS.map(([fn]) => nameOf(fn))
const REMADE_NAME = nameOf(REMADE)

const HIRA_URL = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=12353'
const HIRA_URL_2 = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=12354'
const CRTR_URL = 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=20261118&sno=1&mtgMtrRegSno=2'
const MOHW_URL = 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1488000&act=view'
const SUMMARY = {
  related: true,
  what: '체외충격파 횟수 기준이 바뀌어요',
  when: '2026년 12월 1일부터',
  who: '의원급 의료기관',
  forUs: '우리 의원도 횟수를 확인해요',
  amends: ['2026-183'],
}
const HITS = [
  { id: 'ES-04', title: '체외충격파 횟수' },
  { id: 'IN-02', title: '관절강내 주사 횟수' },
  { id: 'LA-01', title: '물리치료 같은 날' },
]
const CUTOFF = '2026-10-19'
const VERSION = '2026-10-19'
const FROM = '2026-12-01'
const NOTICE: Row = {
  group_key: 'gosi:2026-218',
  title: '[행위] 고시 제2026-218호 개정',
  kind: 'gosi',
  posted_on: '2026-11-18',
  notice_no: '2026-218',
  body: '본문',
  attach_text: '붙임 글자',
  read_mode: 'full',
  related: true,
  summary: SUMMARY,
  rule_hits: HITS,
  state: 'done',
  tries: 0,
  batch_id: null,
}
const POST: Row = {
  source: 'hira_notice',
  source_key: '12353',
  title: '[행위] 고시 제2026-218호 개정',
  url: HIRA_URL,
  posted_on: '2026-11-18',
  attachments: [],
}

const SLOW = { timeout: 60_000 }
const DENIED = { code: '42501' } // 권한 없음
const RLS_DENIED = { code: '42501', message: expect.stringMatching(/row-level security/) }
const CHECK_FAILED = { code: '23514' }
const DUPLICATE = { code: '23505' }
const RLS_OR_NULL = /row-level security|null value/

let db: PGlite
let hospital: Record<string, string> = {}
let seq = 0

async function migrateChain(target: PGlite) {
  await target.exec(SUPABASE_MOCK)
  for (const sql of CHAIN) await target.exec(sql)
  await target.exec(NOTICES_MIGRATION)
  await target.exec(KEYWORDS_MIGRATION)
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

// PostgREST upsert(ignoreDuplicates)와 같은 모양: 겹치면 아무것도 하지 않는다(모으기의 saveRuleChanges)
function postgrestInsertIgnore(table: string, body: Row[], conflict: string, target: PGlite = db) {
  const columns = Object.keys(body[0] ?? {})
  const list = columns.join(', ')
  return target.query<Row>(
    `insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json) on conflict (${conflict}) do nothing`,
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

// 시험마다 빈 표에서 시작한다(병원·글·판정·표시·실패 수 줄은 auth.users·notices를 따라 함께 비워진다). 운영자(superuser)는 RLS를 건너뛴다
async function resetData() {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.exec('truncate public.notices cascade')
  hospital = await seedPeople(db)
}

/** 운영자가 글 하나를 넣고 id를 돌려준다(겹치지 않는 group_key) */
async function seedNotice(values: Row = {}, target: PGlite = db) {
  await operator(target)
  seq += 1
  const result = await postgrestInsert('public.notices', [{ ...NOTICE, group_key: `post:hira_notice:k${seq}`, ...values }], null, target, 'returning id')
  return result.rows[0].id as string
}

/** 운영자가 그 글에 출처 글 하나를 넣는다(겹치지 않는 source_key) */
async function seedPost(noticeId: string, values: Row = {}, target: PGlite = db) {
  await operator(target)
  seq += 1
  await postgrestInsert('public.notice_posts', [{ ...POST, source_key: `k${seq}`, ...values, notice_id: noticeId }], null, target)
}

/** 바뀐 판 규칙(검사 전 모양 — DB는 객체·크기·id·시행일만 본다) */
function ruleOf(ruleId: string, from = FROM, extra: Row = {}): Row {
  return {
    id: ruleId,
    domain: 'physio',
    type: 'count_window',
    title: '체외충격파 횟수',
    message: '1년 6회까지예요',
    params: { codes: ['MM301'], window_days: 365, thresholds: [{ count: 6, grade: 'warn' }] },
    effective_from: from,
    effective_to: null,
    ...extra,
  }
}

/** 바꿈 판정 줄(모으기가 넣는 칸만) */
function changeRow(noticeId: string, ruleId: string, from = FROM, over: Row = {}): Row {
  return {
    notice_id: noticeId,
    rule_id: ruleId,
    base_version: VERSION,
    verdict: 'change',
    by_ai: true,
    check_code: null,
    why: '횟수 기준이 1년 6회로 바뀌었어요',
    before_text: '1년 5회까지 봐요',
    after_text: '1년 6회까지 봐요',
    effective_from: from,
    rule: ruleOf(ruleId, from),
    ...over,
  }
}

/** 바꿈이 아닌 판정 줄(none·same·human) */
function judgedRow(noticeId: string, ruleId: string, verdict: 'none' | 'same' | 'human' = 'human', over: Row = {}): Row {
  return {
    notice_id: noticeId,
    rule_id: ruleId,
    base_version: VERSION,
    verdict,
    by_ai: true,
    check_code: verdict === 'human' ? 'names' : null,
    why: verdict === 'human' ? 'AI가 고친 규칙이 점검 규칙 모양에 맞지 않아 직접 확인해야 해요.' : '상관없어요',
    before_text: '',
    after_text: '',
    effective_from: null,
    rule: null,
    ...over,
  }
}

/** 운영자가 판정 줄 하나를 넣고 id를 돌려준다(state 칸도 줄 수 있다) */
async function seedChange(row: Row, target: PGlite = db) {
  await operator(target)
  const result = await postgrestInsert('public.rule_changes', [row], null, target, 'returning id')
  return result.rows[0].id as string
}

/** 운영자가 트리거를 끈 채 그 원장 병원의 표시 줄을 넣는다(트리거가 맞추기 전 모양을 만들려고) */
async function seedMarkRaw(owner: string, changeId: string, values: Row) {
  await operator()
  await db.exec('set session_replication_role = replica')
  try {
    await postgrestInsert('public.rule_change_marks', [{ hospital_id: hospital[owner], change_id: changeId, ...values }])
  } finally {
    await db.exec('reset session_replication_role')
  }
}

/** 운영자 눈으로 본 표시 줄(시각은 '방금'인지·그대로인지로) */
async function marksNow() {
  await operator()
  const owners: Record<string, string> = { [hospital[A]]: 'A', [hospital[B]]: 'B' }
  const found = await rows(
    `select hospital_id, change_id, reverted,
            case when seen_at is null then null when seen_at > now() - interval '1 hour' then 'now' else seen_at::text end as seen,
            case when reverted_at is null then null when reverted_at > now() - interval '1 hour' then 'now' else reverted_at::text end as reverted_at,
            updated_at > now() - interval '1 hour' as touched
       from public.rule_change_marks order by hospital_id, change_id`,
  )
  return found.map((m): Row => ({ ...m, hospital_id: owners[String(m.hospital_id)] ?? m.hospital_id }))
}

/** 운영자 눈으로 본 판정 표 */
async function changesNow(target: PGlite = db) {
  await operator(target)
  return rows(`select * from public.rule_changes order by id`, [], target)
}

/** 지금 역할로 함수 하나를 불러 첫 칸 값을 돌려준다 */
async function call(sql: string, params: unknown[] = []) {
  const [row] = await rows(`select ${sql} as v`, params)
  return row.v
}

/** 그 사용자로 rule_review_waiting */
async function waiting(user: string, cutoff: string | null = CUTOFF, limit: number | null = 3) {
  await become(user)
  return (await call('public.rule_review_waiting($1::date, $2::integer)', [cutoff, limit])) as Row[]
}

/** 그 사용자로 표를 돌려주는 함수 하나 */
async function tableCall(user: string, sql: string, params: unknown[] = []) {
  await become(user)
  return rows(`select * from ${sql}`, params)
}

/** 운영자가 그 원장 병원의 고시·공지 표시(규칙 확인 시각)를 넣는다 */
async function checkRulesOf(owner: string, noticeId: string) {
  await operator()
  await db.query(`insert into public.notice_marks (hospital_id, notice_id, rules_checked_at) values ($1, $2, now())`, [hospital[owner], noticeId])
}

/** 운영자가 트리거를 끈 채 그 표의 updated_at을 옛 시각으로 돌린다(고친 시각 트리거를 시험하려고) */
async function backdate(table: string) {
  await operator()
  await db.exec(
    `set session_replication_role = replica; update public.${table} set updated_at = '2026-01-02T00:00:00Z'; reset session_replication_role`,
  )
  expect(await rows(`select bool_or(updated_at > now() - interval '1 hour') as fresh from public.${table}`)).toEqual([{ fresh: false }])
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

/** 이 파일이 만든 것(표 셋에 딸린 것·새 함수·새 트리거)과 다시 만든 notice_rule_alerts를 뺀 모양 */
function withoutRuleAuto(shape: Shape): Shape {
  const mine = (name: unknown) => TABLES.includes(String(name).replace(/^public\./, ''))
  return {
    columns: shape.columns.filter((c) => !mine(c.table_name)),
    constraints: shape.constraints.filter((c) => !mine(c.tbl)),
    access: shape.access.filter((t) => !mine(t.relname)),
    indexes: shape.indexes.filter((i) => !mine(i.tablename)),
    policies: shape.policies.filter((p) => !mine(p.tablename)),
    triggers: shape.triggers.filter((t) => !mine(t.tbl)),
    functions: shape.functions.filter((f) => ![...NEW_FUNCTION_NAMES, REMADE_NAME].includes(String(f.name))),
  }
}

/** 다시 만든 함수의 본문 밖 모양(이름·인자·정의자·search_path·권한) */
const remadeOf = (shape: Shape) =>
  shape.functions.filter((f) => f.name === REMADE_NAME).map((f) => ({ fn: f.fn, definer: f.definer, config: f.config, acl: f.acl }))

beforeAll(async () => {
  db = await PGlite.create()
  await migrateChain(db)
  await db.exec(RULE_AUTO_MIGRATION)
}, 180_000)

afterAll(async () => {
  await db.close()
})

beforeEach(resetData)

describe('AC-7805.1 표 셋·RLS·anon·두 번 붙여 넣기', SLOW, () => {
  it('AC-7805.1: 파일이 있고 줄 끝이 LF이며, 머리 주석에 붙여 넣는 방법·먼저 들어갈 notices 두 파일·두 번 붙여도 됨·notices를 다시 붙이면 이 파일도·REQ가 있다', () => {
    expect(RULE_AUTO_MIGRATION).not.toBe('')
    expect(RULE_AUTO_MIGRATION).not.toContain('\r')
    const lines = RULE_AUTO_MIGRATION.split('\n')
    const head = lines.slice(0, lines.findIndex((line) => !/^(--|\s*$)/.test(line))).join('\n')
    expect(head).toContain('운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다')
    expect(head).toMatch(/먼저[^\n]*20261121000000_notices\.sql[^\n]*20261121000001_notice_keywords\.sql/)
    expect(head).toMatch(/두 번 붙여 넣어도/)
    // notices.sql을 다시 붙이면 notice_rule_alerts가 규칙 연결 수로 세는 옛 판으로 돌아가므로 이 파일도 다시 붙인다(design 13절)
    expect(head).toMatch(/20261121000000_notices\.sql을 다시 붙이면[^\n]*이 파일도 다시/)
    expect(head).toContain('REQ-7805')
    expect(head).toContain('REQ-7806')
    expect(head).toContain('ADR-040')
  })

  it('AC-7805.1: 두 번 돌려도 되는 문장만 쓴다(표·색인 if not exists, 함수·트리거 or replace, 정책 지우고 다시 만들기)', () => {
    expect(RULE_AUTO_SQL).not.toBe('')
    expect(RULE_AUTO_SQL).not.toMatch(/create\s+table\s+(?!if\s+not\s+exists\s)/i)
    expect(RULE_AUTO_SQL).not.toMatch(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists\s)/i)
    expect(RULE_AUTO_SQL).not.toMatch(/create\s+function/i)
    expect(RULE_AUTO_SQL).not.toMatch(/create\s+trigger/i)
    expect(RULE_AUTO_SQL).not.toMatch(/\btruncate\b|\bdrop\s+(table|function|column|trigger)\b|service_role/i)
    const policies = [...RULE_AUTO_SQL.matchAll(/create policy ("[^"]+") on (public\.\w+)/g)]
    expect(policies.length).toBeGreaterThan(0)
    for (const [, name, table] of policies) expect(RULE_AUTO_SQL).toContain(`drop policy if exists ${name} on ${table};`)
  })

  it('AC-7805.1: 앞 파일의 공용 함수(my_hospital_id·is_notice_collector)는 다시 만들지 않고, 만드는 함수는 새 다섯과 notice_rule_alerts뿐이다', () => {
    const made = [...RULE_AUTO_SQL.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])
    expect(made.sort()).toEqual([...NEW_FUNCTION_NAMES, REMADE_NAME].sort())
    expect(RULE_AUTO_SQL).toContain('public.my_hospital_id()')
    expect(RULE_AUTO_SQL).toContain('public.is_notice_collector()')
  })

  it('AC-7805.1: 표 셋이 있고 모두 RLS가 켜져 있다', async () => {
    const found = await rows(
      `select c.relname, c.relrowsecurity from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname = any ($1::text[]) order by c.relname`,
      [TABLES],
    )
    expect(found).toEqual([...TABLES].sort().map((relname) => ({ relname, relrowsecurity: true })))
  })

  it.each(TABLES)('AC-7805.1: anon은 %s를 읽고 넣고 고치고 지우지 못한다(권한 없음)', async (table) => {
    expect(await hasTable(`public.${table}`)).toBe(true)
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

  it('AC-7805.1: anon·PUBLIC은 표 셋에 표·칸 권한이 하나도 없다', async () => {
    expect(await hasTable('public.rule_changes')).toBe(true)
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

  it.each(TABLES)('AC-7805.1: authenticated의 %s 표 권한은 정해 둔 것뿐이고 넣기·고치기는 정해 둔 칸만이다(지우기 없음)', async (table) => {
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
    const of = (privilege: string) =>
      columns
        .filter((r) => r.privilege_type === privilege)
        .map((r) => r.column_name)
        .sort()
    expect([table, 'INSERT', of('INSERT')]).toEqual([table, 'INSERT', [...expected.insert].sort()])
    expect([table, 'UPDATE', of('UPDATE')]).toEqual([table, 'UPDATE', [...expected.update].sort()])
    expect(of('REFERENCES')).toEqual([])
  })

  it('AC-7805.1: 정책은 판정 표·표시 표에 읽기·넣기·고치기뿐이고(지우기 없음) 실패 수 표에는 없으며, 모두 authenticated다', async () => {
    const found = await rows(
      `select tablename, cmd, roles::text[] as roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = any ($1::text[])`,
      [TABLES],
    )
    const cmdsOf = (table: string) =>
      found
        .filter((p) => p.tablename === table)
        .map((p) => p.cmd)
        .sort()
    expect(cmdsOf('rule_changes')).toEqual(['INSERT', 'SELECT', 'UPDATE'])
    expect(cmdsOf('rule_change_marks')).toEqual(['INSERT', 'SELECT', 'UPDATE'])
    expect(cmdsOf('rule_review_tries')).toEqual([])
    for (const p of found) expect(p.roles).toEqual(['authenticated'])
    for (const p of found.filter((x) => x.tablename === 'rule_change_marks')) {
      for (const expr of [p.qual, p.with_check].filter((x) => x !== null)) {
        expect(String(expr)).toMatch(/^\(hospital_id = \( SELECT my_hospital_id\(\) AS my_hospital_id\)\)$/)
      }
    }
    const update = found.find((p) => p.tablename === 'rule_changes' && p.cmd === 'UPDATE')
    expect(String(update?.qual)).toMatch(/is_notice_collector\(\)/)
    expect(String(update?.with_check)).toMatch(/is_notice_collector\(\)[\s\S]*state = 'old'/)
  })

  it.each(NEW_FUNCTIONS)('AC-7805.1: 새 함수 %s는 정의자=%s·search_path 빔이고 authenticated 부름=%s(anon·PUBLIC 못 부름)', async (fn, definer, callable) => {
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

  it('AC-7805.1: 표시 트리거는 rule_change_marks의 넣기·고치기 앞에만 걸린다', async () => {
    const found = await rows(
      `select tgrelid::regclass::text as tbl, tgname, pg_get_triggerdef(oid) as def from pg_trigger
       where not tgisinternal and tgfoid = to_regprocedure('public.rule_change_marks_touch()')`,
    )
    expect(found.map((t) => [t.tbl, t.tgname])).toEqual([['rule_change_marks', 'rule_change_marks_touch']])
    expect(String(found[0].def)).toMatch(
      /BEFORE INSERT OR UPDATE ON public\.rule_change_marks FOR EACH ROW EXECUTE FUNCTION rule_change_marks_touch\(\)/,
    )
  })

  it('AC-7805.1: anon은 새 함수·다시 만든 notice_rule_alerts를 부르지 못한다(권한 없음)', async () => {
    const calls = [
      `public.rule_review_waiting('${CUTOFF}', 3)`,
      `public.rule_review_failed('${A}')`,
      'public.rule_change_alerts()',
      `public.see_rule_changes('${A}')`,
      'public.notice_rule_alerts()',
    ]
    for (const sql of calls) {
      await becomeAnon()
      await expect(db.query(`select * from ${sql}`)).rejects.toMatchObject(DENIED)
    }
  })

  it('AC-7805.1: auth.sql·notices 두 파일만 들어간 DB에도 오류 없이 붙는다', async () => {
    const bare = await PGlite.create()
    try {
      await bare.exec(SUPABASE_MOCK)
      await bare.exec(AUTH_MIGRATION)
      await bare.exec(NOTICES_MIGRATION)
      await bare.exec(KEYWORDS_MIGRATION)
      await bare.exec(RULE_AUTO_MIGRATION)
      const [r] = await rows(
        `select count(*)::int as n from pg_class where relnamespace = 'public'::regnamespace and relname = any ($1::text[]) and relkind = 'r'`,
        [TABLES],
        bare,
      )
      expect(r.n).toBe(3)
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
      await fresh.exec(RULE_AUTO_MIGRATION)
      once = await shapeOf(fresh)
      ids = await seedPeople(fresh)
    }, 240_000)

    afterAll(async () => {
      await fresh.close()
    })

    async function dump() {
      await operator(fresh)
      return {
        changes: await rows(`select * from public.rule_changes order by id`, [], fresh),
        marks: await rows(`select * from public.rule_change_marks order by hospital_id, change_id`, [], fresh),
        tries: await rows(`select * from public.rule_review_tries order by notice_id`, [], fresh),
        notices: await rows(`select * from public.notices order by id`, [], fresh),
      }
    }

    it('AC-7805.1: 이 파일 밖의 표·칸·제약·권한·색인·정책·트리거·함수는 그대로이고, notice_rule_alerts는 본문만 바뀐다', () => {
      expect(withoutRuleAuto(once)).toEqual(withoutRuleAuto(before))
      expect(remadeOf(once)).toEqual(remadeOf(before))
      expect(remadeOf(once)).toEqual([{ fn: 'notice_rule_alerts()', definer: false, config: ['search_path=""'], acl: expect.any(Array) }])
      const added = once.functions.filter((f) => !before.functions.some((b) => b.fn === f.fn)).map((f) => String(f.name))
      expect(added.sort()).toEqual([...NEW_FUNCTION_NAMES].sort())
      const alertsDef = (s: Shape) => String(s.functions.find((f) => f.name === REMADE_NAME)?.def)
      expect(alertsDef(before)).not.toContain('rule_changes')
      expect(alertsDef(once)).toContain('rule_changes')
    })

    it('AC-7805.1: 두 번째로 붙여도 오류가 없고, 모양과 이미 있던 판정·표시·실패 수·글 줄이 그대로다', async () => {
      const noticeId = await seedNotice({}, fresh)
      const changeId = await seedChange(changeRow(noticeId, 'ES-04'), fresh)
      await seedChange(judgedRow(noticeId, 'IN-02'), fresh)
      await operator(fresh)
      await fresh.query(`update public.rule_changes set state = 'old' where rule_id = 'IN-02'`)
      await fresh.query(`insert into public.rule_change_marks (hospital_id, change_id, reverted) values ($1, $2, true)`, [ids[A], changeId])
      await fresh.query(`insert into public.rule_review_tries (notice_id, tries) values ($1, 2)`, [noticeId])
      const data = await dump()
      expect(data.changes).toHaveLength(2)
      expect(data.marks).toHaveLength(1)
      await operator(fresh)
      await fresh.exec(RULE_AUTO_MIGRATION)
      expect(await shapeOf(fresh)).toEqual(once)
      expect(await dump()).toEqual(data)
    })

    it('AC-7805.1: notices 두 파일을 다시 붙인 뒤 이 파일을 다시 붙여도 오류가 없고 모양·줄이 그대로다(design 13절)', async () => {
      const data = await dump()
      await operator(fresh)
      await fresh.exec(NOTICES_MIGRATION)
      await fresh.exec(KEYWORDS_MIGRATION)
      await fresh.exec(RULE_AUTO_MIGRATION)
      expect(await shapeOf(fresh)).toEqual(once)
      expect(await dump()).toEqual(data)
    })
  })
})

describe('AC-7805.2 rule_changes 공용 판정 표', SLOW, () => {
  /** 글 하나에 바꿈·사람이 봐야 함 줄 하나씩 → 운영자 눈으로 본 표 */
  async function seedShared() {
    const noticeId = await seedNotice()
    await seedChange(changeRow(noticeId, 'ES-04'))
    await seedChange(judgedRow(noticeId, 'IN-02'))
    return { noticeId, dump: await changesNow() }
  }

  it.each<[string, string]>([
    ['원장 A', A],
    ['원장 B', B],
    ['모으기 계정', COL],
  ])('AC-7805.2: %s는 모든 줄을 읽는다', async (_name, user) => {
    const { dump } = await seedShared()
    expect(dump).toHaveLength(2)
    await become(user)
    expect(await rows(`select * from public.rule_changes order by id`)).toEqual(dump)
  })

  it.each(OTHERS)('AC-7805.2: %s는 0줄이다', async (_name, user) => {
    await seedShared()
    await become(user)
    expect(await rows(`select * from public.rule_changes`)).toEqual([])
  })

  it('AC-7805.2: 모으기 계정은 정한 칸만 넣고(upsert ignoreDuplicates) id·state·created_at은 DB가 정하며, 같은 글·규칙 줄은 그대로 둔다', async () => {
    const noticeId = await seedNotice()
    await become(COL)
    const first = await postgrestInsertIgnore('public.rule_changes', [changeRow(noticeId, 'ES-04'), judgedRow(noticeId, 'IN-02', 'none')], 'notice_id, rule_id')
    expect(first.affectedRows).toBe(2)
    await operator()
    const found = await rows(
      `select rule_id, verdict, state, id is not null as has_id, created_at > now() - interval '1 hour' as fresh from public.rule_changes order by rule_id`,
    )
    expect(found).toEqual([
      { rule_id: 'ES-04', verdict: 'change', state: 'live', has_id: true, fresh: true },
      { rule_id: 'IN-02', verdict: 'none', state: 'live', has_id: true, fresh: true },
    ])
    const dump = await changesNow()
    await become(COL)
    const again = await postgrestInsertIgnore('public.rule_changes', [judgedRow(noticeId, 'ES-04', 'human')], 'notice_id, rule_id')
    expect(again.affectedRows).toBe(0)
    expect(await changesNow()).toEqual(dump)
  })

  it.each<[string, Row]>([
    ['id', { id: '00000000-0000-4000-8000-00000000ffff' }],
    ['state', { state: 'old' }],
    ['created_at', { created_at: '2026-01-01T00:00:00Z' }],
  ])('AC-7805.2: 모으기 계정도 %s를 넣어 보내면 거부된다(권한 없음)', async (_column, extra) => {
    const noticeId = await seedNotice()
    await become(COL)
    await expect(postgrestInsert('public.rule_changes', [{ ...changeRow(noticeId, 'ES-04'), ...extra }])).rejects.toMatchObject(DENIED)
    expect(await changesNow()).toEqual([])
  })

  it('AC-7805.2: 모으기 계정은 live를 old로만 고치고, old를 live로 되살리지 못한다', async () => {
    const { noticeId } = await seedShared()
    await seedChange(judgedRow(noticeId, 'LA-01', 'same', { base_version: '2026-09-01' }))
    await become(COL)
    const retired = await db.query(`update public.rule_changes set state = 'old' where state = 'live' and base_version <> $1`, [VERSION])
    expect(retired.affectedRows).toBe(1)
    await operator()
    expect(await rows(`select rule_id, state from public.rule_changes order by rule_id`)).toEqual([
      { rule_id: 'ES-04', state: 'live' },
      { rule_id: 'IN-02', state: 'live' },
      { rule_id: 'LA-01', state: 'old' },
    ])
    const dump = await changesNow()
    await become(COL)
    await expect(db.query(`update public.rule_changes set state = 'live' where rule_id = 'LA-01'`)).rejects.toMatchObject(RLS_DENIED)
    expect(await changesNow()).toEqual(dump)
  })

  it.each<[string, string]>([
    ['verdict', `verdict = 'none'`],
    ['why', `why = '바뀐 까닭'`],
    ['rule', `rule = null`],
    ['effective_from', `effective_from = '2026-12-02'`],
    ['notice_id', `notice_id = notice_id`],
  ])('AC-7805.2: 모으기 계정도 state 밖 칸(%s)은 고치지 못한다(권한 없음)', async (_column, set) => {
    const { dump } = await seedShared()
    await become(COL)
    await expect(db.query(`update public.rule_changes set ${set}`)).rejects.toMatchObject(DENIED)
    expect(await changesNow()).toEqual(dump)
  })

  it.each<[string, string]>([
    ['모으기 계정', COL],
    ['원장 A', A],
    ['관리자', ADMIN],
  ])('AC-7805.2: %s도 지우지 못한다(권한 없음)', async (_name, user) => {
    const { dump } = await seedShared()
    await become(user)
    await expect(db.query(`delete from public.rule_changes`)).rejects.toMatchObject(DENIED)
    expect(await changesNow()).toEqual(dump)
  })

  it.each<[string, string]>([
    ['원장 A', A],
    ['원장 B', B],
    ['관리자', ADMIN],
    ['데스크', K],
    ['승인 대기 원장', P],
  ])('AC-7805.2: 목록에 없는 %s의 넣기는 RLS가 거부하고, 고치기는 0줄이다', async (_name, user) => {
    const { noticeId, dump } = await seedShared()
    await become(user)
    await expect(postgrestInsertIgnore('public.rule_changes', [changeRow(noticeId, 'LA-01')], 'notice_id, rule_id')).rejects.toMatchObject(RLS_DENIED)
    await become(user)
    expect((await db.query(`update public.rule_changes set state = 'old'`)).affectedRows).toBe(0)
    expect(await changesNow()).toEqual(dump)
  })
})

describe('AC-7805.3 rule_changes 줄 제약', SLOW, () => {
  let noticeId = ''
  beforeEach(async () => {
    noticeId = await seedNotice()
  })

  const insertOne = (row: Row) => seedChange(row)

  it.each<[string, string]>([
    ['두 자리 번호', 'ES-04'],
    ['세 자리 번호', 'ES-104'],
    ['끝 소문자 하나', 'ES-04a'],
  ])('AC-7805.3: rule_id %s(%s)는 받는다', async (_name, ruleId) => {
    await expect(insertOne(changeRow(noticeId, ruleId))).resolves.toEqual(expect.any(String))
  })

  it.each<[string, string]>([
    ['소문자 앞', 'es-04'],
    ['한 자리 번호', 'ES-4'],
    ['네 자리 번호', 'ES-0404'],
    ['끝 소문자 둘', 'ES-04ab'],
    ['앞 글자 셋', 'ESS-04'],
    ['빈 글자', ''],
  ])('AC-7805.3: rule_id %s(%s)는 거부된다', async (_name, ruleId) => {
    await expect(insertOne(judgedRow(noticeId, ruleId))).rejects.toMatchObject(CHECK_FAILED)
  })

  it.each<[string, Row]>([
    ['verdict 밖 값', { verdict: 'maybe' }],
    ['state 밖 값', { state: 'dead' }],
    ['check_code 밖 값', { check_code: 'other' }],
    ['human인데 rule이 있음', { rule: ruleOf('ES-04') }],
    ['human인데 effective_from이 있음', { effective_from: FROM }],
    ['why 121자', { why: '가'.repeat(121) }],
    ['before_text 101자', { before_text: '가'.repeat(101) }],
    ['after_text 101자', { after_text: '가'.repeat(101) }],
    ['why 줄바꿈', { why: '첫 줄\n둘째 줄' }],
    ['before_text 탭', { before_text: '앞\t뒤' }],
    ['after_text 제어 문자', { after_text: '앞\u0007뒤' }],
    ['base_version 빈 글자', { base_version: '' }],
    ['base_version 41자', { base_version: 'v'.repeat(41) }],
  ])('AC-7805.3: 바꿈 아닌 줄의 %s는 거부된다', async (_name, over) => {
    await expect(insertOne(judgedRow(noticeId, 'ES-04', 'human', over))).rejects.toMatchObject(CHECK_FAILED)
  })

  it.each<[string, Row]>([
    ['rule 없음', { rule: null }],
    ['effective_from 없음', { effective_from: null }],
    ['rule이 배열', { rule: [ruleOf('ES-04')] }],
    ['rule이 글자', { rule: 'ES-04' }],
    ['rule의 id가 다름', { rule: ruleOf('IN-02') }],
    ['rule에 id가 없음', { rule: { ...ruleOf('ES-04'), id: undefined } }],
    ['rule의 effective_from이 다름', { rule: ruleOf('ES-04', '2026-12-02') }],
    ['rule에 effective_from이 없음', { rule: { ...ruleOf('ES-04'), effective_from: undefined } }],
    ['check_code 밖 값', { check_code: 'later' }],
  ])('AC-7805.3: 바꿈 줄의 %s는 거부된다', async (_name, over) => {
    await expect(insertOne(changeRow(noticeId, 'ES-04', FROM, over))).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-7805.3: 정한 값·한도 끝은 받는다(verdict 넷·check_code 열·why 120자·전후 100자·base_version 40자)', async () => {
    const codes = ['no-auto', 'fixed', 'shape', 'size', 'names', 'removed', 'grade', 'status', 'date', 'tries']
    for (const [i, code] of codes.entries()) {
      await expect(insertOne(judgedRow(noticeId, `HU-${String(10 + i)}`, 'human', { check_code: code }))).resolves.toEqual(expect.any(String))
    }
    await expect(insertOne(judgedRow(noticeId, 'NO-01', 'none', { check_code: null }))).resolves.toEqual(expect.any(String))
    await expect(insertOne(judgedRow(noticeId, 'SA-01', 'same', { by_ai: false }))).resolves.toEqual(expect.any(String))
    const long = { why: '가'.repeat(120), before_text: '나'.repeat(100), after_text: '다'.repeat(100), base_version: 'v'.repeat(40) }
    await expect(insertOne(changeRow(noticeId, 'ES-04', FROM, long))).resolves.toEqual(expect.any(String))
    await operator()
    expect(await rows(`select count(*)::int as n from public.rule_changes`)).toEqual([{ n: codes.length + 3 }])
  })

  it('AC-7805.3: rule은 8,000바이트까지 받고 넘으면 거부된다(jsonb 글자 기준)', async () => {
    await operator()
    const sizeOf = async (rule: Row) => (await rows(`select octet_length($1::jsonb::text)::int as n`, [JSON.stringify(rule)]))[0].n as number
    const pad = 8000 - (await sizeOf(ruleOf('ES-04', FROM, { notes: '' })))
    const fits = ruleOf('ES-04', FROM, { notes: 'x'.repeat(pad) })
    expect(await sizeOf(fits)).toBe(8000)
    await expect(insertOne(changeRow(noticeId, 'ES-04', FROM, { rule: fits }))).resolves.toEqual(expect.any(String))
    const over = ruleOf('IN-02', FROM, { notes: 'x'.repeat(pad + 1) })
    expect(await sizeOf(over)).toBe(8001)
    await expect(insertOne(changeRow(noticeId, 'IN-02', FROM, { rule: over }))).rejects.toMatchObject(CHECK_FAILED)
  })

  it('AC-7805.3: (notice_id, rule_id)는 하나뿐이다(판정이 달라도)', async () => {
    await insertOne(judgedRow(noticeId, 'ES-04', 'none'))
    await expect(insertOne(changeRow(noticeId, 'ES-04'))).rejects.toMatchObject(DUPLICATE)
  })

  it('AC-7805.3: live인 바꿈 줄은 (rule_id, effective_from)마다 하나뿐이고, old 줄·다른 날짜·바꿈 아닌 줄은 겹쳐도 된다', async () => {
    const other = await seedNotice()
    const third = await seedNotice()
    await insertOne(changeRow(noticeId, 'ES-04'))
    await expect(insertOne(changeRow(other, 'ES-04'))).rejects.toMatchObject(DUPLICATE)
    await expect(insertOne(changeRow(other, 'ES-04', '2027-01-01'))).resolves.toEqual(expect.any(String))
    await expect(insertOne(changeRow(third, 'ES-04', FROM, { state: 'old' }))).resolves.toEqual(expect.any(String))
    await expect(insertOne(judgedRow(noticeId, 'IN-02'))).resolves.toEqual(expect.any(String))
    await expect(insertOne(judgedRow(other, 'IN-02'))).resolves.toEqual(expect.any(String))
    // 앞 줄이 old가 되면 같은 날짜의 새 live 줄이 들어갈 수 있다
    await operator()
    await db.query(`update public.rule_changes set state = 'old' where notice_id = $1 and rule_id = 'ES-04'`, [noticeId])
    const fourth = await seedNotice()
    await expect(insertOne(changeRow(fourth, 'ES-04'))).resolves.toEqual(expect.any(String))
  })

  it('AC-7805.3: 글을 지우면 그 글의 판정 줄도 지워진다', async () => {
    await insertOne(changeRow(noticeId, 'ES-04'))
    await operator()
    await db.query(`delete from public.notices where id = $1`, [noticeId])
    expect(await changesNow()).toEqual([])
  })
})

describe('AC-7805.4 rule_change_marks 병원마다 표시', SLOW, () => {
  let noticeId = ''
  let c1 = ''
  let c2 = ''
  beforeEach(async () => {
    noticeId = await seedNotice()
    c1 = await seedChange(changeRow(noticeId, 'ES-04'))
    c2 = await seedChange(changeRow(noticeId, 'IN-02'))
  })

  /** 화면의 setRuleReverted와 같은 모양: upsert({ change_id, reverted }, { onConflict: 'hospital_id,change_id' }) */
  async function setReverted(user: string, changeId: string, reverted: boolean) {
    await become(user)
    return postgrestInsert('public.rule_change_marks', [{ change_id: changeId, reverted }], 'hospital_id, change_id')
  }

  it('AC-7805.4: 원장 A가 되돌리면(upsert) A 병원 줄이 되고 트리거가 되돌린 시각·본 시각·고친 시각을 적는다', async () => {
    await setReverted(A, c1, true)
    expect(await marksNow()).toEqual([{ hospital_id: 'A', change_id: c1, reverted: true, seen: 'now', reverted_at: 'now', touched: true }])
  })

  it('AC-7805.4: 다시 적용하면(upsert 거짓) 되돌린 시각이 비고 본 시각은 그대로이며, 또 되돌리면 시각을 다시 적는다', async () => {
    await seedMarkRaw(A, c1, { seen_at: '2026-11-01T00:00:00Z', reverted: true, reverted_at: '2026-11-02T00:00:00Z' })
    await setReverted(A, c1, false)
    const seenText = (await marksNow())[0].seen
    expect(await marksNow()).toEqual([{ hospital_id: 'A', change_id: c1, reverted: false, seen: seenText, reverted_at: null, touched: true }])
    expect(seenText).not.toBe('now')
    await setReverted(A, c1, true)
    expect(await marksNow()).toEqual([{ hospital_id: 'A', change_id: c1, reverted: true, seen: seenText, reverted_at: 'now', touched: true }])
  })

  it('AC-7805.4: 거짓에서 참이 될 때만 되돌린 시각을 적는다(참인 채로 본 시각만 고치면 되돌린 시각 그대로)', async () => {
    await seedMarkRaw(A, c1, { seen_at: null, reverted: true, reverted_at: '2026-11-02T00:00:00Z' })
    await become(A)
    expect((await db.query(`update public.rule_change_marks set seen_at = now() where change_id = $1`, [c1])).affectedRows).toBe(1)
    const [mark] = await marksNow()
    expect(mark).toMatchObject({ reverted: true, seen: 'now', touched: true })
    expect(String(mark.reverted_at)).toMatch(/^2026-11-02/)
  })

  it('AC-7805.4: 고치기로 참이 되면 비었던 본 시각을 지금으로 채우고, 이미 있으면 그대로 둔다', async () => {
    await seedMarkRaw(A, c1, { seen_at: null, reverted: false })
    await seedMarkRaw(A, c2, { seen_at: '2026-11-01T00:00:00Z', reverted: false })
    await become(A)
    expect((await db.query(`update public.rule_change_marks set reverted = true`)).affectedRows).toBe(2)
    const found = await marksNow()
    const byId = Object.fromEntries(found.map((m) => [m.change_id, m]))
    expect(byId[c1]).toMatchObject({ reverted: true, seen: 'now', reverted_at: 'now', touched: true })
    expect(byId[c2]).toMatchObject({ reverted: true, reverted_at: 'now', touched: true })
    expect(String(byId[c2].seen)).toMatch(/^2026-11-01/)
  })

  it('AC-7805.4: 고칠 때마다 updated_at을 지금으로 적는다', async () => {
    await setReverted(A, c1, false)
    await backdate('rule_change_marks')
    await become(A)
    await db.query(`update public.rule_change_marks set seen_at = now()`)
    expect((await marksNow()).map((m) => m.touched)).toEqual([true])
  })

  it('AC-7805.4: 원장마다 내 병원 줄만 보고, 남의 병원 줄은 고치지 못한다(0줄)', async () => {
    await setReverted(A, c1, true)
    await setReverted(B, c2, true)
    await become(A)
    expect((await rows(`select change_id from public.rule_change_marks`)).map((m) => m.change_id)).toEqual([c1])
    await become(B)
    expect((await rows(`select change_id from public.rule_change_marks`)).map((m) => m.change_id)).toEqual([c2])
    await become(A)
    expect((await db.query(`update public.rule_change_marks set reverted = false where change_id = $1`, [c2])).affectedRows).toBe(0)
    const after = (await marksNow()).map((m) => [m.hospital_id, m.change_id, m.reverted])
    expect(after.sort((x, y) => String(x[0]).localeCompare(String(y[0])))).toEqual([
      ['A', c1, true],
      ['B', c2, true],
    ])
  })

  it.each<[string, Row]>([
    ['hospital_id', { hospital_id: '00000000-0000-4000-8000-00000000ffff' }],
    ['reverted_at', { reverted_at: '2026-01-01T00:00:00Z' }],
    ['updated_at', { updated_at: '2026-01-01T00:00:00Z' }],
  ])('AC-7805.4: 원장도 %s를 넣어 보내면 거부된다(권한 없음)', async (_column, extra) => {
    await become(A)
    await expect(postgrestInsert('public.rule_change_marks', [{ change_id: c1, reverted: true, ...extra }])).rejects.toMatchObject(DENIED)
    expect(await marksNow()).toEqual([])
  })

  it.each<[string, string]>([
    ['hospital_id', `hospital_id = '00000000-0000-4000-8000-00000000ffff'`],
    ['reverted_at', `reverted_at = null`],
    ['updated_at', `updated_at = now()`],
    ['change_id(다른 판으로)', `change_id = '__C2__'`],
  ])('AC-7805.4: 원장도 seen_at·reverted 밖 칸(%s)은 고치지 못한다', async (_column, set) => {
    await setReverted(A, c1, true)
    const before = await marksNow()
    await become(A)
    await expect(db.query(`update public.rule_change_marks set ${set.replace('__C2__', c2)}`)).rejects.toMatchObject(DENIED)
    expect(await marksNow()).toEqual(before)
  })

  it('AC-7805.4: 원장도 지우지 못한다(권한 없음)', async () => {
    await setReverted(A, c1, true)
    await become(A)
    await expect(db.query(`delete from public.rule_change_marks`)).rejects.toMatchObject(DENIED)
    expect(await marksNow()).toHaveLength(1)
  })

  it.each(NO_HOSPITAL)('AC-7805.4: %s는 표시를 읽지도 넣지도 고치지도 못한다', async (_name, user) => {
    await setReverted(A, c1, true)
    const before = await marksNow()
    await become(user)
    expect(await rows(`select * from public.rule_change_marks`)).toEqual([])
    await become(user)
    await expect(postgrestInsert('public.rule_change_marks', [{ change_id: c2, reverted: true }])).rejects.toThrow(RLS_OR_NULL)
    await become(user)
    expect((await db.query(`update public.rule_change_marks set reverted = false`)).affectedRows).toBe(0)
    expect(await marksNow()).toEqual(before)
  })

  it('AC-7805.4: 판정 줄을 지우면 그 판의 표시도 지워진다', async () => {
    await setReverted(A, c1, true)
    await operator()
    await db.query(`delete from public.rule_changes where id = $1`, [c1])
    expect(await marksNow()).toEqual([])
  })
})

describe('AC-7805.5 rule_review_tries는 정의자 함수만', SLOW, () => {
  it.each<[string, string]>([
    ['모으기 계정', COL],
    ['원장 A', A],
    ['관리자', ADMIN],
  ])('AC-7805.5: %s도 실패 수 표를 읽고 넣고 고치고 지우지 못한다(권한 없음)', async (_name, user) => {
    const noticeId = await seedNotice()
    await operator()
    await db.query(`insert into public.rule_review_tries (notice_id, tries) values ($1, 1)`, [noticeId])
    for (const sql of [
      `select * from public.rule_review_tries`,
      `insert into public.rule_review_tries (notice_id, tries) values ('${noticeId}', 2)`,
      `update public.rule_review_tries set tries = 0`,
      `delete from public.rule_review_tries`,
    ]) {
      await become(user)
      await expect(db.query(sql)).rejects.toMatchObject(DENIED)
    }
    await operator()
    expect(await rows(`select notice_id, tries from public.rule_review_tries`)).toEqual([{ notice_id: noticeId, tries: 1 }])
  })

  it('AC-7805.5: 실패 수는 0~3이고 글을 지우면 같이 지워진다', async () => {
    const noticeId = await seedNotice()
    await operator()
    await expect(db.query(`insert into public.rule_review_tries (notice_id, tries) values ($1, 4)`, [noticeId])).rejects.toMatchObject(CHECK_FAILED)
    await expect(db.query(`insert into public.rule_review_tries (notice_id, tries) values ($1, -1)`, [noticeId])).rejects.toMatchObject(CHECK_FAILED)
    await db.query(`insert into public.rule_review_tries (notice_id, tries) values ($1, 3)`, [noticeId])
    await db.query(`delete from public.notices where id = $1`, [noticeId])
    expect(await rows(`select * from public.rule_review_tries`)).toEqual([])
  })
})

describe('AC-7806.1 rule_review_waiting', SLOW, () => {
  it('AC-7806.1: 글마다 정한 칸을 주고, pending은 판정 줄(state 상관없음)이 없는 규칙을 rule_hits 차례로, 출처는 보건복지부 → 심평원 공지 → 심평원 심사기준 차례의 첫 글이다', async () => {
    const id = await seedNotice({ body: '고시 본문', attach_text: '붙임 글자' })
    await seedPost(id, { source: 'hira_crtr', url: CRTR_URL, posted_on: '2026-11-16' })
    await seedPost(id, { source: 'hira_notice', url: HIRA_URL, posted_on: '2026-11-19' })
    await seedPost(id, { source: 'hira_notice', url: HIRA_URL_2, posted_on: '2026-11-18' })
    await seedChange(judgedRow(id, 'IN-02', 'none', { state: 'old' }))
    expect(await waiting(COL)).toEqual([
      {
        id,
        title: NOTICE.title,
        noticeNo: '2026-218',
        postedOn: '2026-11-18',
        kind: 'gosi',
        body: '고시 본문',
        attachText: '붙임 글자',
        summary: SUMMARY,
        url: HIRA_URL_2,
        source: 'hira_notice',
        ruleHits: HITS,
        pending: ['ES-04', 'LA-01'],
        tries: 0,
      },
    ])
    await seedPost(id, { source: 'mohw_rss', url: MOHW_URL, posted_on: '2026-11-20' })
    expect(await waiting(COL)).toMatchObject([{ id, url: MOHW_URL, source: 'mohw_rss' }])
  })

  it('AC-7806.1: 심평원 공지가 없으면 심사기준 글, 출처 글이 하나도 없으면 url·source가 null이다', async () => {
    const crtr = await seedNotice({ posted_on: '2026-11-19', notice_no: null, kind: 'case' })
    await seedPost(crtr, { source: 'hira_crtr', url: CRTR_URL })
    const bare = await seedNotice({ posted_on: '2026-11-18' })
    expect(await waiting(COL)).toMatchObject([
      { id: crtr, noticeNo: null, kind: 'case', url: CRTR_URL, source: 'hira_crtr' },
      { id: bare, url: null, source: null },
    ])
  })

  it('AC-7806.1: done·요약 있음·posted_on > cutoff·판정 없는 규칙 있음·실패 수 3 미만인 글만 고른다', async () => {
    const ok = await seedNotice({ posted_on: '2026-10-20' })
    await seedNotice({ posted_on: CUTOFF })
    await seedNotice({ posted_on: '2026-10-01' })
    await seedNotice({ state: 'wait' })
    await seedNotice({ state: 'batch' })
    await seedNotice({ state: 'failed' })
    await seedNotice({ summary: null })
    await seedNotice({ rule_hits: [] })
    const judged = await seedNotice()
    for (const hit of HITS) await seedChange(judgedRow(judged, hit.id, 'same'))
    const tried3 = await seedNotice()
    const tried2 = await seedNotice({ posted_on: '2026-11-17' })
    await operator()
    await db.query(`insert into public.rule_review_tries (notice_id, tries) values ($1, 3), ($2, 2)`, [tried3, tried2])
    const found = await waiting(COL, CUTOFF, 20)
    expect(found.map((n) => [n.id, n.tries])).toEqual([
      [tried2, 2],
      [ok, 0],
    ])
  })

  it('AC-7806.1: 최근 글부터 p_limit개이고 p_limit은 1~20으로 맞춘다(비면 20)', async () => {
    const days = Array.from({ length: 25 }, (_, i) => {
      const d = new Date('2026-11-01T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      return d.toISOString().slice(0, 10)
    })
    for (const day of days) await seedNotice({ posted_on: day })
    const latest = [...days].reverse()
    expect((await waiting(COL, CUTOFF, 3)).map((n) => n.postedOn)).toEqual(latest.slice(0, 3))
    expect((await waiting(COL, CUTOFF, 0)).map((n) => n.postedOn)).toEqual(latest.slice(0, 1))
    expect((await waiting(COL, CUTOFF, -5)).map((n) => n.postedOn)).toEqual(latest.slice(0, 1))
    expect((await waiting(COL, CUTOFF, 50)).map((n) => n.postedOn)).toEqual(latest.slice(0, 20))
    expect((await waiting(COL, CUTOFF, null)).map((n) => n.postedOn)).toEqual(latest.slice(0, 20))
  })

  it('AC-7806.1: 고를 글이 없으면 빈 배열이고, cutoff가 비면 아무 글도 고르지 않는다', async () => {
    expect(await waiting(COL)).toEqual([])
    await seedNotice()
    expect(await waiting(COL, null)).toEqual([])
  })

  it.each([...OTHERS, ['원장 A', A] as [string, string], ['원장 B', B] as [string, string]])(
    'AC-7806.1: %s가 부르면 42501이다',
    async (_name, user) => {
      await seedNotice()
      await become(user)
      await expect(db.query(`select public.rule_review_waiting($1::date, 3)`, [CUTOFF])).rejects.toMatchObject(DENIED)
    },
  )
})

describe('AC-7806.2 rule_review_failed', SLOW, () => {
  it('AC-7806.2: 모으기 계정이 부르면 실패 수를 1씩 올려 새 값을 주고 3에서 멈추며, 3이 된 글은 살필 글에서 빠진다', async () => {
    const id = await seedNotice()
    const other = await seedNotice({ posted_on: '2026-11-17' })
    await become(COL)
    const values: unknown[] = []
    for (let i = 0; i < 4; i += 1) values.push(await call('public.rule_review_failed($1::uuid)', [id]))
    expect(values).toEqual([1, 2, 3, 3])
    expect(await call('public.rule_review_failed($1::uuid)', [other])).toBe(1)
    await operator()
    expect(await rows(`select notice_id, tries, updated_at > now() - interval '1 hour' as fresh from public.rule_review_tries order by tries`)).toEqual([
      { notice_id: other, tries: 1, fresh: true },
      { notice_id: id, tries: 3, fresh: true },
    ])
    expect((await waiting(COL)).map((n) => [n.id, n.tries])).toEqual([[other, 1]])
  })

  it.each([...OTHERS, ['원장 A', A] as [string, string]])('AC-7806.2: %s가 부르면 42501이고 실패 수는 그대로다', async (_name, user) => {
    const id = await seedNotice()
    await become(user)
    await expect(db.query(`select public.rule_review_failed($1::uuid)`, [id])).rejects.toMatchObject(DENIED)
    await operator()
    expect(await rows(`select * from public.rule_review_tries`)).toEqual([])
  })
})

describe('AC-7806.3 rule_change_alerts', SLOW, () => {
  /** 글 넷: n1(바꿈 live 둘·old 하나·사람 하나) · n2(바꿈 live 하나, 더 최근) · n3(사람만) · n4(바꿈 old만) */
  async function seedAlerts() {
    const n1 = await seedNotice({ posted_on: '2026-11-18', title: '첫 고시', notice_no: '2026-218' })
    const n2 = await seedNotice({ posted_on: '2026-11-19', title: '둘째 글', notice_no: null })
    const n3 = await seedNotice({ posted_on: '2026-11-20' })
    const n4 = await seedNotice({ posted_on: '2026-11-21' })
    const c1 = await seedChange(changeRow(n1, 'ES-04'))
    const c2 = await seedChange(changeRow(n1, 'IN-02'))
    await seedChange(changeRow(n1, 'LA-01', '2026-12-02', { state: 'old' }))
    await seedChange(judgedRow(n1, 'LA-02'))
    const c4 = await seedChange(changeRow(n2, 'ES-04', '2027-01-01'))
    await seedChange(judgedRow(n3, 'ES-04'))
    await seedChange(changeRow(n4, 'IN-02', '2027-02-01', { state: 'old' }))
    return { n1, n2, c1, c2, c4 }
  }

  it('AC-7806.3: 승인된 원장에게 안 본·되돌리지 않은 live 바꿈 줄이 있는 글을 최근 글부터 그 줄 수와 준다', async () => {
    const { n1, n2 } = await seedAlerts()
    expect(await tableCall(A, 'public.rule_change_alerts()')).toEqual([
      { id: n2, notice_no: null, title: '둘째 글', change_count: 1 },
      { id: n1, notice_no: '2026-218', title: '첫 고시', change_count: 2 },
    ])
  })

  it('AC-7806.3: 본 줄·되돌린 줄은 세지 않고, 다른 병원 표시는 섞이지 않는다', async () => {
    const { n1, c1, c2, c4 } = await seedAlerts()
    await seedMarkRaw(A, c1, { seen_at: '2026-11-20T00:00:00Z', reverted: false })
    await seedMarkRaw(A, c4, { seen_at: null, reverted: true })
    await seedMarkRaw(B, c2, { seen_at: '2026-11-20T00:00:00Z', reverted: false })
    expect(await tableCall(A, 'public.rule_change_alerts()')).toEqual([{ id: n1, notice_no: '2026-218', title: '첫 고시', change_count: 1 }])
    expect((await tableCall(B, 'public.rule_change_alerts()')).map((r) => r.change_count)).toEqual([1, 1])
    await seedMarkRaw(A, c2, { seen_at: '2026-11-21T00:00:00Z', reverted: false })
    expect(await tableCall(A, 'public.rule_change_alerts()')).toEqual([])
  })

  it.each(NO_HOSPITAL)('AC-7806.3: %s는 빈 목록이다', async (_name, user) => {
    await seedAlerts()
    expect(await tableCall(user, 'public.rule_change_alerts()')).toEqual([])
  })
})

describe('AC-7806.4 notice_rule_alerts 다시 만들기', SLOW, () => {
  it('AC-7806.4: live human 줄이 있고 내 병원이 규칙 확인하지 않은 글만, rule_count는 그 human 줄 수다(rule_hits만 있는 글은 빠짐)', async () => {
    const n1 = await seedNotice({ posted_on: '2026-11-18', title: '첫 고시', notice_no: '2026-218' })
    const n2 = await seedNotice({ posted_on: '2026-11-19' })
    const n3 = await seedNotice({ posted_on: '2026-11-20' })
    const n4 = await seedNotice({ posted_on: '2026-11-21' })
    const n5 = await seedNotice({ posted_on: '2026-11-17', title: '다섯째 고시', notice_no: '2026-210' })
    await seedChange(judgedRow(n1, 'ES-04'))
    await seedChange(judgedRow(n1, 'IN-02'))
    await seedChange(judgedRow(n1, 'LA-01', 'human', { state: 'old' }))
    await seedChange(changeRow(n1, 'LA-02'))
    // n2: rule_hits 셋만 있고 판정 줄 없음 · n3: 상관없음·바뀔 것 없음만 · n4: human이지만 old
    await seedChange(judgedRow(n3, 'ES-04', 'none'))
    await seedChange(judgedRow(n3, 'IN-02', 'same'))
    await seedChange(judgedRow(n4, 'ES-04', 'human', { state: 'old' }))
    await seedChange(judgedRow(n5, 'ES-04'))
    await checkRulesOf(A, n5)
    void n2
    expect(await tableCall(A, 'public.notice_rule_alerts()')).toEqual([{ id: n1, notice_no: '2026-218', title: '첫 고시', rule_count: 2 }])
    expect(await tableCall(B, 'public.notice_rule_alerts()')).toEqual([
      { id: n1, notice_no: '2026-218', title: '첫 고시', rule_count: 2 },
      { id: n5, notice_no: '2026-210', title: '다섯째 고시', rule_count: 1 },
    ])
  })

  it.each(OTHERS)('AC-7806.4: %s는 빈 목록이다(공용 글을 못 읽음)', async (_name, user) => {
    const id = await seedNotice()
    await seedChange(judgedRow(id, 'ES-04'))
    expect(await tableCall(user, 'public.notice_rule_alerts()')).toEqual([])
  })
})

describe('AC-7806.5 see_rule_changes', SLOW, () => {
  /** n1: 바꿈 live 둘(c1·c2)·바꿈 old 하나·사람 하나 · n2: 바꿈 live 하나(c4) */
  async function seedSee() {
    const n1 = await seedNotice({ posted_on: '2026-11-18' })
    const n2 = await seedNotice({ posted_on: '2026-11-19' })
    const c1 = await seedChange(changeRow(n1, 'ES-04'))
    const c2 = await seedChange(changeRow(n1, 'IN-02'))
    await seedChange(changeRow(n1, 'LA-01', '2026-12-02', { state: 'old' }))
    await seedChange(judgedRow(n1, 'LA-02'))
    const c4 = await seedChange(changeRow(n2, 'ES-04', '2027-01-01'))
    return { n1, n2, c1, c2, c4 }
  }

  it('AC-7806.5: 그 글의 live 바꿈 줄마다 내 병원 표시를 만들어 본 시각을 적고, 바꾼 줄 수를 준다(두 번째는 0)', async () => {
    const { n1, c1, c2 } = await seedSee()
    await become(A)
    expect(await call('public.see_rule_changes($1::uuid)', [n1])).toBe(2)
    const byId = (a: string, b: string) => a.localeCompare(b)
    expect(await marksNow()).toEqual(
      [c1, c2].sort(byId).map((change_id) => ({ hospital_id: 'A', change_id, reverted: false, seen: 'now', reverted_at: null, touched: true })),
    )
    await become(A)
    expect(await call('public.see_rule_changes($1::uuid)', [n1])).toBe(0)
  })

  it('AC-7806.5: 본 시각이 이미 있으면 그대로 두고, 비었으면 채우며, reverted는 건드리지 않는다', async () => {
    const { n1, c1, c2 } = await seedSee()
    await seedMarkRaw(A, c1, { seen_at: '2026-11-01T00:00:00Z', reverted: false })
    await seedMarkRaw(A, c2, { seen_at: null, reverted: true, reverted_at: '2026-11-02T00:00:00Z' })
    await become(A)
    expect(await call('public.see_rule_changes($1::uuid)', [n1])).toBe(1)
    const found = Object.fromEntries((await marksNow()).map((m) => [m.change_id, m]))
    expect(String(found[c1].seen)).toMatch(/^2026-11-01/)
    expect(found[c1].reverted).toBe(false)
    expect(found[c2]).toMatchObject({ seen: 'now', reverted: true })
    expect(String(found[c2].reverted_at)).toMatch(/^2026-11-02/)
  })

  it('AC-7806.5: 다른 글·다른 병원의 표시는 그대로다', async () => {
    const { n1, c4 } = await seedSee()
    await become(B)
    expect(await call('public.see_rule_changes($1::uuid)', [n1])).toBe(2)
    await become(A)
    expect(await call('public.see_rule_changes($1::uuid)', [n1])).toBe(2)
    const found = await marksNow()
    expect(found.filter((m) => m.hospital_id === 'A')).toHaveLength(2)
    expect(found.filter((m) => m.hospital_id === 'B')).toHaveLength(2)
    expect(found.some((m) => m.change_id === c4)).toBe(false)
  })

  it.each(NO_HOSPITAL)('AC-7806.5: %s가 부르면 42501이고 표시는 생기지 않는다', async (_name, user) => {
    const { n1 } = await seedSee()
    await become(user)
    await expect(db.query(`select public.see_rule_changes($1::uuid)`, [n1])).rejects.toMatchObject(DENIED)
    expect(await marksNow()).toEqual([])
  })
})
