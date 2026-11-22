import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectorStore, GroupRow, NoticeSummary, PostRow, SourceRow } from '@/types/notices'
import type { RuleDef } from '@/types/precheck'
import type { LiveChange, ReviewNotice, RuleChangeRow, RuleReviewStore } from '@/types/ruleAuto'
import type { BatchNotice, BatchReadingStore } from './collector'
import { STORE_READ_FAILED, collectorClient, collectorStore } from './collectStore'

// 모으기 흐름(collector.ts)이 받는 가게 모양 그대로(규칙 살피기 쪽 RuleReviewStore 포함, specs/rule-auto REQ-7811)
type Store = CollectorStore & BatchReadingStore & RuleReviewStore

// 진짜 Supabase에 붙지 않는다. collectorClient 시험은 createClient를 가짜로 바꾸고,
// store 시험은 from·rpc만 있는 가짜 클라이언트(fakeDb)에 부른 표·칸·조건·값을 모두 남긴다
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

// ── 가짜 DB ────────────────────────────────────────────────

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'rpc'
type Call = {
  table: string | null
  op: Op
  fn: string | null
  args: unknown
  columns: string | null
  payload: unknown
  options: unknown
  filters: { name: string; args: unknown[] }[]
  single: 'single' | 'maybe' | null
}
type Answer = { data: unknown; error: unknown }
type Responder = (call: Call) => Answer | Promise<Answer>

function fakeDb(respond: Responder) {
  const calls: Call[] = []
  const thenable = (call: Call) => ({
    then<A, B>(ok?: (v: Answer) => A | PromiseLike<A>, bad?: (e: unknown) => B | PromiseLike<B>) {
      return Promise.resolve()
        .then(() => respond(call))
        .then(ok, bad)
    },
  })
  const builder = (call: Call) => {
    const filter =
      (name: string) =>
      (...args: unknown[]) => {
        call.filters.push({ name, args })
        return b
      }
    const write = (op: Op) => (payload: unknown, options?: unknown) => {
      call.op = op
      call.payload = payload
      call.options = options
      return b
    }
    const b = {
      select(columns?: string) {
        call.columns = columns ?? '*'
        return b
      },
      insert: write('insert'),
      update: write('update'),
      upsert: write('upsert'),
      eq: filter('eq'),
      neq: filter('neq'),
      in: filter('in'),
      gt: filter('gt'),
      gte: filter('gte'),
      lte: filter('lte'),
      order: filter('order'),
      limit: filter('limit'),
      maybeSingle() {
        call.single = 'maybe'
        return thenable(call)
      },
      single() {
        call.single = 'single'
        return thenable(call)
      },
      then: thenable(call).then,
    }
    return b
  }
  const blank = (): Call => ({ table: null, op: 'select', fn: null, args: undefined, columns: null, payload: undefined, options: undefined, filters: [], single: null })
  const client = {
    from(table: string) {
      const call = { ...blank(), table }
      calls.push(call)
      return builder(call)
    },
    rpc(fn: string, args?: unknown) {
      const call: Call = { ...blank(), op: 'rpc', fn, args }
      calls.push(call)
      return thenable(call)
    },
  } as unknown as SupabaseClient
  const store: Store = collectorStore(client)
  return { client, calls, store }
}

const ok = (data: unknown = null): Answer => ({ data, error: null })
const SECRET = 'secret-db-text 42501 row 2026-183'
const dbError = (): Answer => ({ data: null, error: { message: SECRET, code: '42501', details: SECRET } })

// ── 견본 값 ────────────────────────────────────────────────

const RUN_ID = '11111111-1111-4111-8111-111111111111'
const NOTICE_ID = '22222222-2222-4222-8222-222222222222'
const NOTICE_ID2 = '33333333-3333-4333-8333-333333333333'
const NEW_ID = '44444444-4444-4444-8444-444444444444'
const HIRA_URL = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=12353'
const FILE_URL = 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157'
const MOHW_URL = 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1'

const SUMMARY: NoticeSummary = { related: true, what: '도수치료 기준이 바뀌어요', when: '2026-12-01부터', who: '의원', forUs: '청구 전에 확인해요', amends: ['2025-12'] }

const dbPost = (over: Record<string, unknown> = {}) => ({
  source: 'hira_notice',
  title: '심평원 공지 글',
  url: HIRA_URL,
  posted_on: '2026-11-20',
  attachments: [{ name: '붙임.pdf', url: FILE_URL }],
  created_at: '2026-11-20T22:00:00.123456+00:00',
  ...over,
})
const MOHW_DB_POST = dbPost({ source: 'mohw_rss', title: '복지부 고시 글', url: MOHW_URL, attachments: [], posted_on: '2026-11-19', created_at: '2026-11-21T01:00:00+00:00' })

const dbNotice = (over: Record<string, unknown> = {}) => ({
  id: NOTICE_ID,
  group_key: 'gosi:2026-218',
  title: '복지부 고시 글',
  kind: 'gosi',
  posted_on: '2026-11-19',
  notice_no: '2026-218',
  body: '[복지부 고시 글]\n본문',
  state: 'wait',
  tries: 0,
  batch_id: null,
  related: true,
  summary: SUMMARY,
  read_mode: 'full',
  attach_text: '붙임.pdf\n글자',
  updated_at: '2026-11-20T00:00:00+00:00',
  // 일부러 늦게 들어온 글을 앞에 둔다(가게는 들어온 차례로 다시 놓아야 한다)
  notice_posts: [MOHW_DB_POST, dbPost()],
  ...over,
})

const DB_SOURCE = {
  source: 'hira_crtr',
  state: 'stopped',
  error_code: 'shape',
  checked_at: '2026-11-20T22:01:00+00:00',
  last_ok_at: '2026-11-19T22:01:00+00:00',
  stopped_since: '2026-11-20T22:01:00+00:00',
  cursor: { '01': 3, done: ['02'] },
  backfill_done: false,
}
const SOURCE: SourceRow = {
  source: 'hira_crtr',
  state: 'stopped',
  errorCode: 'shape',
  checkedAt: '2026-11-20T22:01:00+00:00',
  lastOkAt: '2026-11-19T22:01:00+00:00',
  stoppedSince: '2026-11-20T22:01:00+00:00',
  cursor: { '01': 3, done: ['02'] },
  backfillDone: false,
}

const POST: PostRow = { source: 'hira_notice', sourceKey: '12353', title: '심평원 공지 글', url: HIRA_URL, postedOn: '2026-11-20', attachments: [{ name: '붙임.pdf', url: FILE_URL }] }
const NEW_GROUP: GroupRow = {
  groupKey: 'gosi:2026-218',
  title: '심평원 공지 글',
  kind: 'gosi',
  postedOn: '2026-11-20',
  noticeNo: '2026-218',
  body: '[심평원 공지 글]\n본문',
  state: 'wait',
  tries: 0,
  posts: [{ source: 'hira_notice', title: '심평원 공지 글', url: HIRA_URL, postedOn: '2026-11-20', attachments: [{ name: '붙임.pdf', url: FILE_URL }] }],
}
const OLD_GROUP: GroupRow = { ...NEW_GROUP, id: NOTICE_ID, title: '복지부 고시 글', postedOn: '2026-11-19', body: '[복지부 고시 글]\n본문\n\n[심평원 공지 글]\n본문' }

// 표마다 읽을 수 있는 칸과 넣고 고칠 수 있는 칸(migration 20261121000000_notices.sql의 표·grant 그대로)
const WRITE_COLUMNS: Record<string, string[]> = {
  notices: ['group_key', 'title', 'kind', 'posted_on', 'notice_no', 'body', 'attach_text', 'read_mode', 'related', 'summary', 'rule_hits', 'state', 'tries', 'batch_id'],
  notice_posts: ['notice_id', 'source', 'source_key', 'title', 'url', 'posted_on', 'attachments'],
  notice_sources: ['source', 'state', 'error_code', 'checked_at', 'last_ok_at', 'stopped_since', 'cursor', 'backfill_done'],
  notice_weeks: ['week_start', 'top3'],
}
const READ_COLUMNS: Record<string, string[]> = {
  notices: [...WRITE_COLUMNS.notices, 'id', 'rule_count', 'created_at', 'updated_at'],
  notice_posts: [...WRITE_COLUMNS.notice_posts, 'id', 'created_at'],
  notice_sources: [...WRITE_COLUMNS.notice_sources, 'updated_at'],
  notice_weeks: [...WRITE_COLUMNS.notice_weeks, 'created_at'],
}
const RPCS = ['notice_start_run', 'notice_add_run_usage', 'notice_finish_run']

// select 글('a, b, notice_posts(c, d)') → [표, 칸] 목록
function selectedColumns(table: string, columns: string): [string, string][] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of columns) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  const out: [string, string][] = []
  for (const raw of parts.map((p) => p.trim())) {
    const embed = /^(\w+)\(([\s\S]*)\)$/.exec(raw)
    if (embed) out.push(...selectedColumns(embed[1], embed[2]))
    else out.push([table, raw])
  }
  return out
}

const keysOf = (payload: unknown): string[] => (Array.isArray(payload) ? payload : [payload]).flatMap((row) => Object.keys(row as object))

// 모든 함수가 끝까지 가도록 모양이 맞는 답
function happy(call: Call): Answer {
  if (call.op === 'rpc') return ok(call.fn === 'notice_start_run' ? RUN_ID : null)
  if (call.table === 'notices') {
    if (call.op === 'insert') return ok({ id: NEW_ID })
    if (call.op === 'update') return ok([{ id: NOTICE_ID }])
    return ok(call.single ? dbNotice({ state: 'batch', batch_id: 'msgbatch_01' }) : [dbNotice({ state: 'batch', batch_id: 'msgbatch_01' })])
  }
  if (call.table === 'notice_posts') return ok(call.op === 'select' ? [{ source_key: '12353' }] : null)
  if (call.table === 'notice_sources') return ok(call.op === 'select' ? [DB_SOURCE] : [{ source: 'hira_crtr' }])
  if (call.table === 'notice_weeks') return ok(call.op === 'select' ? null : null)
  return ok()
}

const USAGE = { inputTokens: 1200, outputTokens: 300, costMicroUsd: 18000 }
const SAVED = { summary: SUMMARY, readMode: 'full' as const, attachText: '붙임.pdf\n글자', ruleHits: [{ id: 'DX-01', title: '규칙' }] }
const READING = { readMode: 'text' as const, attachText: '붙임.hwpx\n글자' }

// 쓰기(true/false)와 읽기(값 또는 던짐) 모두
const WRITES: [string, (s: Store) => Promise<boolean>][] = [
  ['addRunUsage', (s) => s.addRunUsage(RUN_ID, USAGE)],
  ['finishRun', (s) => s.finishRun(RUN_ID, { new: { hira_notice: 2 }, stopped: [], summarized: 1 })],
  ['saveSource', (s) => s.saveSource(SOURCE)],
  ['saveGroup(새 묶음)', (s) => s.saveGroup(NEW_GROUP, POST)],
  ['saveGroup(있던 묶음)', (s) => s.saveGroup(OLD_GROUP, POST)],
  ['saveSummary', (s) => s.saveSummary(NOTICE_ID, SAVED)],
  ['failSummary', (s) => s.failSummary(NOTICE_ID)],
  ['markBatch', (s) => s.markBatch([NOTICE_ID], 'msgbatch_01')],
  ['saveWeek', (s) => s.saveWeek({ weekStart: '2026-11-16', top3: [{ head: '머리', body: '몸' }] })],
  ['saveReading', (s) => s.saveReading(NOTICE_ID, READING)],
]
const READS: [string, (s: Store) => Promise<unknown>][] = [
  ['startRun', (s) => s.startRun()],
  ['sources', (s) => s.sources()],
  ['knownKeys', (s) => s.knownKeys('hira_notice', ['12353', '12354'])],
  ['groupOf', (s) => s.groupOf('gosi:2026-218')],
  ['waiting', (s) => s.waiting(40)],
  ['openBatches', (s) => s.openBatches()],
  ['weekExists', (s) => s.weekExists('2026-11-16')],
  ['weekPending', (s) => s.weekPending('2026-11-16')],
  ['weekNotices', (s) => s.weekNotices('2026-11-16')],
  ['batchNotices', (s) => s.batchNotices([NOTICE_ID, NOTICE_ID2])],
]

// ── collectorClient ────────────────────────────────────────

describe('collectorClient (AC-7415.1)', () => {
  const session = { access_token: 'access', refresh_token: 'refresh' }
  let signInWithPassword: ReturnType<typeof vi.fn>
  let fakeClient: { auth: { signInWithPassword: typeof signInWithPassword } }

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv('NOTICES_COLLECTOR_EMAIL', ' collector@example.com ')
    vi.stubEnv('NOTICES_COLLECTOR_PASSWORD', 'a-very-long-password-1234')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-secret')
    signInWithPassword = vi.fn(async () => ({ data: { session, user: { id: 'u1' } }, error: null }))
    fakeClient = { auth: { signInWithPassword } }
    createClient.mockReset()
    createClient.mockImplementation(() => fakeClient)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('AC-7415.1: 공개(anon) 열쇠 클라이언트를 세션 저장·자동 갱신 끈 채 만들고, 비밀번호로 로그인한 그 클라이언트를 돌려준다', async () => {
    const client = await collectorClient()
    expect(client).toBe(fakeClient)
    expect(createClient).toHaveBeenCalledTimes(1)
    const [url, key, options] = createClient.mock.calls[0] as [string, string, { auth: Record<string, unknown> }]
    expect(url).toBe('https://abcd.supabase.co')
    expect(key).toBe('anon-key')
    expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false })
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'collector@example.com', password: 'a-very-long-password-1234' })
  })

  it.each([
    ['메일 없음', 'NOTICES_COLLECTOR_EMAIL', undefined],
    ['메일 빈칸', 'NOTICES_COLLECTOR_EMAIL', '   '],
    ['비밀번호 없음', 'NOTICES_COLLECTOR_PASSWORD', undefined],
    ['비밀번호 빈 글', 'NOTICES_COLLECTOR_PASSWORD', ''],
  ])('AC-7415.1: %s이면 클라이언트를 만들지 않고 null이다', async (_name, envName, value) => {
    vi.stubEnv(envName, value)
    expect(await collectorClient()).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('AC-7415.1: 공개 주소·열쇠가 없으면 null이다(던지지 않는다)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    await expect(collectorClient()).resolves.toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each([
    ['로그인 오류', async () => ({ data: { session: null, user: null }, error: { message: `Invalid login ${SECRET}` } })],
    ['세션 없음', async () => ({ data: { session: null, user: null }, error: null })],
    [
      '던짐',
      async () => {
        throw new Error(`network ${SECRET}`)
      },
    ],
  ])('AC-7415.1: %s이면 null이고 오류 글은 버린다(console에도 남기지 않는다)', async (_name, impl) => {
    signInWithPassword.mockImplementation(impl)
    const spies = (['error', 'warn', 'log', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    await expect(collectorClient()).resolves.toBeNull()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-7415.1: service role 키는 읽지 않는다(만들 때 넘긴 값에 없고, 파일에 그 이름이 없다)', async () => {
    await collectorClient()
    expect(JSON.stringify(createClient.mock.calls)).not.toContain('service-role-secret')
    const source = readFileSync(fileURLToPath(new URL('./collectStore.ts', import.meta.url)), 'utf-8')
    expect(source).not.toMatch(/service_role|SERVICE_ROLE|serviceRole|SECRET_KEY/)
  })
})

// ── CollectorStore: 표·칸 ──────────────────────────────────

describe('collectorStore — 표·칸 (AC-7415.2)', () => {
  it('AC-7415.2: 모든 함수가 design 3절의 표·칸·함수만 쓰고, 쓰는 칸은 grant 칸뿐이며, 병원 조건·지우기가 없다', async () => {
    const { store, calls } = fakeDb(happy)
    for (const [, run] of WRITES) expect(await run(store)).toBe(true)
    for (const [, run] of READS) await run(store)

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      if (call.op === 'rpc') {
        expect(RPCS).toContain(call.fn)
        continue
      }
      const table = call.table as string
      expect(Object.keys(READ_COLUMNS)).toContain(table)
      if (call.columns !== null) {
        for (const [t, c] of selectedColumns(table, call.columns)) expect(READ_COLUMNS[t] ?? [], `${t}.${c}`).toContain(c)
      }
      if (call.op !== 'select') for (const k of keysOf(call.payload)) expect(WRITE_COLUMNS[table], `${table}.${k}`).toContain(k)
      for (const f of call.filters) {
        if (f.name === 'limit') continue
        expect(READ_COLUMNS[table], `${f.name}(${String(f.args[0])})`).toContain(f.args[0])
      }
    }
    expect(JSON.stringify(calls)).not.toMatch(/hospital/)
  })

  it('AC-7415.2: startRun·addRunUsage·finishRun은 DB 함수 notice_start_run·notice_add_run_usage·notice_finish_run을 부른다', async () => {
    const { store, calls } = fakeDb(happy)
    expect(await store.startRun()).toBe(RUN_ID)
    expect(await store.addRunUsage(RUN_ID, USAGE)).toBe(true)
    const counts = { new: { hira_notice: 2 }, stopped: ['mohw_rss'], summarized: 1, batched: 0, collected: 0, failed: 0 }
    expect(await store.finishRun(RUN_ID, counts)).toBe(true)
    expect(calls.map((c) => [c.fn, c.args])).toEqual([
      ['notice_start_run', undefined],
      ['notice_add_run_usage', { p_id: RUN_ID, p_input: 1200, p_output: 300, p_cost: 18000 }],
      ['notice_finish_run', { p_id: RUN_ID, p_counts: counts }],
    ])
  })

  it('AC-7415.2: startRun은 다른 실행이 돌면(null) null이다', async () => {
    const { store } = fakeDb(() => ok(null))
    expect(await store.startRun()).toBeNull()
  })

  it('AC-7415.2: sources는 notice_sources 줄을 SourceRow로 바꾼다', async () => {
    const { store, calls } = fakeDb(() => ok([DB_SOURCE, { ...DB_SOURCE, source: 'mohw_rss', state: 'ok', error_code: null, checked_at: null, last_ok_at: null, stopped_since: null, cursor: {}, backfill_done: true }]))
    expect(await store.sources()).toEqual([
      SOURCE,
      { source: 'mohw_rss', state: 'ok', errorCode: null, checkedAt: null, lastOkAt: null, stoppedSince: null, cursor: {}, backfillDone: true },
    ])
    expect(calls[0].table).toBe('notice_sources')
  })

  it('AC-7415.2: saveSource는 출처 줄 하나를 source로 맞춰 넣거나 고친다', async () => {
    const { store, calls } = fakeDb(() => ok([{ source: 'hira_crtr' }]))
    expect(await store.saveSource(SOURCE)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'notice_sources', op: 'upsert', options: { onConflict: 'source' } })
    expect(calls[0].payload).toEqual(DB_SOURCE)
  })

  it('AC-7415.2: saveSource는 고친 줄이 없으면(권한 없음 등) false다', async () => {
    const { store } = fakeDb(() => ok([]))
    expect(await store.saveSource(SOURCE)).toBe(false)
  })

  it('AC-7415.2: knownKeys는 그 출처에서 이미 있는 key만 돌려주고, 빈 목록은 DB를 부르지 않는다', async () => {
    const { store, calls } = fakeDb(() => ok([{ source_key: '12353' }]))
    expect(await store.knownKeys('hira_notice', ['12353', '12354', '12353'])).toEqual(new Set(['12353']))
    expect(calls[0]).toMatchObject({ table: 'notice_posts', op: 'select' })
    expect(calls[0].filters).toEqual([
      { name: 'eq', args: ['source', 'hira_notice'] },
      { name: 'in', args: ['source_key', ['12353', '12354']] },
    ])
    expect(await store.knownKeys('hira_notice', [])).toEqual(new Set())
    expect(calls).toHaveLength(1)
  })

  it('AC-7415.2: groupOf는 묶음 열쇠로 한 줄을 읽어 출처 글을 들어온 차례로 담은 GroupRow다. 없으면 null', async () => {
    const { store, calls } = fakeDb(() => ok(dbNotice()))
    expect(await store.groupOf('gosi:2026-218')).toEqual({
      id: NOTICE_ID,
      groupKey: 'gosi:2026-218',
      title: '복지부 고시 글',
      kind: 'gosi',
      postedOn: '2026-11-19',
      noticeNo: '2026-218',
      body: '[복지부 고시 글]\n본문',
      state: 'wait',
      tries: 0,
      posts: [
        { source: 'hira_notice', title: '심평원 공지 글', url: HIRA_URL, postedOn: '2026-11-20', attachments: [{ name: '붙임.pdf', url: FILE_URL }] },
        { source: 'mohw_rss', title: '복지부 고시 글', url: MOHW_URL, postedOn: '2026-11-19', attachments: [] },
      ],
    } satisfies GroupRow)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'select', single: 'maybe' })
    expect(calls[0].filters).toEqual([{ name: 'eq', args: ['group_key', 'gosi:2026-218'] }])

    const none = fakeDb(() => ok(null))
    expect(await none.store.groupOf('gosi:2026-999')).toBeNull()
  })

  it('AC-7415.2: saveGroup(새 묶음)은 notices에 넣어 받은 id로 notice_posts 한 줄을 넣는다(붙임은 name·url만)', async () => {
    const { store, calls } = fakeDb((call) => (call.table === 'notices' ? ok({ id: NEW_ID }) : ok(null)))
    const post: PostRow = { ...POST, attachments: [{ name: '붙임.pdf', url: FILE_URL, extra: 'x' } as PostRow['attachments'][number]] }
    expect(await store.saveGroup(NEW_GROUP, post)).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'insert', single: 'single' })
    expect(calls[0].payload).toEqual({
      group_key: 'gosi:2026-218',
      title: '심평원 공지 글',
      kind: 'gosi',
      posted_on: '2026-11-20',
      notice_no: '2026-218',
      body: '[심평원 공지 글]\n본문',
      state: 'wait',
      tries: 0,
    })
    expect(calls[1]).toMatchObject({ table: 'notice_posts', op: 'insert' })
    expect(calls[1].payload).toEqual({
      notice_id: NEW_ID,
      source: 'hira_notice',
      source_key: '12353',
      title: '심평원 공지 글',
      url: HIRA_URL,
      posted_on: '2026-11-20',
      attachments: [{ name: '붙임.pdf', url: FILE_URL }],
    })
  })

  it('AC-7415.2: saveGroup(있던 묶음)은 그 id 줄을 고치고 같은 id로 출처 글을 넣는다', async () => {
    const { store, calls } = fakeDb((call) => (call.table === 'notices' ? ok([{ id: NOTICE_ID }]) : ok(null)))
    expect(await store.saveGroup({ ...OLD_GROUP, state: 'wait' }, POST)).toBe(true)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'update' })
    expect(calls[0].filters).toEqual([{ name: 'eq', args: ['id', NOTICE_ID] }])
    expect(calls[0].payload).toEqual({
      title: '복지부 고시 글',
      kind: 'gosi',
      posted_on: '2026-11-19',
      notice_no: '2026-218',
      body: '[복지부 고시 글]\n본문\n\n[심평원 공지 글]\n본문',
      state: 'wait',
      tries: 0,
    })
    expect(calls[1].payload).toMatchObject({ notice_id: NOTICE_ID, source_key: '12353' })
  })

  it('AC-7415.2: saveGroup(있던 묶음)은 고친 줄이 없으면 출처 글을 넣지 않고 false다', async () => {
    const { store, calls } = fakeDb(() => ok([]))
    expect(await store.saveGroup(OLD_GROUP, POST)).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it.each([
    ['글 주소가 두 사이트 밖', { url: 'http://www.hira.or.kr/x' }],
    ['붙임 주소가 두 사이트 밖', { attachments: [{ name: 'a.pdf', url: 'https://evil.example.com/a.pdf' }] }],
    ['붙임 11개', { attachments: Array.from({ length: 11 }, (_, i) => ({ name: `${i}.pdf`, url: FILE_URL })) }],
    ['붙임 이름이 빈 글', { attachments: [{ name: '', url: FILE_URL }] }],
    ['제목 301자', { title: '가'.repeat(301) }],
    ['key 101자', { sourceKey: '1'.repeat(101) }],
  ])('AC-7415.2: saveGroup은 출처 글이 notice_posts 제약(%s)에 맞지 않으면 아무것도 쓰지 않고 false다', async (_name, over) => {
    const { store, calls } = fakeDb(happy)
    expect(await store.saveGroup(NEW_GROUP, { ...POST, ...over } as PostRow)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('AC-7415.2: waiting은 요약 기다리는(wait) 글을 최근 글부터 limit개 읽는다', async () => {
    const { store, calls } = fakeDb(() => ok([dbNotice({ tries: 1 })]))
    expect(await store.waiting(40)).toEqual([
      {
        id: NOTICE_ID,
        title: '복지부 고시 글',
        kind: 'gosi',
        postedOn: '2026-11-19',
        noticeNo: '2026-218',
        body: '[복지부 고시 글]\n본문',
        tries: 1,
        posts: [
          { source: 'hira_notice', title: '심평원 공지 글', url: HIRA_URL, postedOn: '2026-11-20', attachments: [{ name: '붙임.pdf', url: FILE_URL }] },
          { source: 'mohw_rss', title: '복지부 고시 글', url: MOHW_URL, postedOn: '2026-11-19', attachments: [] },
        ],
      },
    ])
    expect(calls[0].table).toBe('notices')
    expect(calls[0].filters).toEqual([
      { name: 'eq', args: ['state', 'wait'] },
      { name: 'order', args: ['posted_on', { ascending: false }] },
      { name: 'order', args: ['created_at', { ascending: false }] },
      { name: 'limit', args: [40] },
    ])
  })

  it('AC-7415.2: saveSummary는 요약(여섯 칸)·관련·읽은 방법·붙임 글자·규칙 연결을 적고 done으로 바꾼다', async () => {
    const { store, calls } = fakeDb(() => ok([{ id: NOTICE_ID }]))
    expect(await store.saveSummary(NOTICE_ID, { ...SAVED, summary: { ...SUMMARY, related: false } })).toBe(true)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'update' })
    expect(calls[0].filters).toEqual([{ name: 'eq', args: ['id', NOTICE_ID] }])
    expect(calls[0].payload).toEqual({
      summary: { ...SUMMARY, related: false },
      related: false,
      read_mode: 'full',
      attach_text: '붙임.pdf\n글자',
      rule_hits: [{ id: 'DX-01', title: '규칙' }],
      state: 'done',
      batch_id: null,
    })
  })

  it('AC-7415.2: saveSummary는 고친 줄이 없으면(없는 id·권한 없음) false다', async () => {
    const { store } = fakeDb(() => ok([]))
    expect(await store.saveSummary(NOTICE_ID, SAVED)).toBe(false)
  })

  it.each([
    [0, { tries: 1, state: 'wait', batch_id: null }],
    [1, { tries: 2, state: 'wait', batch_id: null }],
    [2, { tries: 3, state: 'failed', batch_id: null }],
  ])('AC-7415.2: failSummary는 tries %i → 하나 올리고 3이 되면 failed다', async (tries, payload) => {
    const { store, calls } = fakeDb((call) => (call.op === 'select' ? ok({ tries }) : ok([{ id: NOTICE_ID }])))
    expect(await store.failSummary(NOTICE_ID)).toBe(true)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'select', single: 'maybe' })
    expect(calls[0].filters).toEqual([{ name: 'eq', args: ['id', NOTICE_ID] }])
    expect(calls[1]).toMatchObject({ table: 'notices', op: 'update', payload })
    expect(calls[1].filters).toEqual([
      { name: 'eq', args: ['id', NOTICE_ID] },
      { name: 'eq', args: ['tries', tries] },
    ])
  })

  it('AC-7415.2: failSummary는 없는 글이면 고치지 않고 false다', async () => {
    const { store, calls } = fakeDb(() => ok(null))
    expect(await store.failSummary(NOTICE_ID)).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('AC-7415.2: markBatch는 그 글들을 batch와 일괄 id로 적고, 모두 고쳤을 때만 true다. 빈 목록은 DB를 부르지 않는다', async () => {
    const { store, calls } = fakeDb(() => ok([{ id: NOTICE_ID }, { id: NOTICE_ID2 }]))
    expect(await store.markBatch([NOTICE_ID, NOTICE_ID2, NOTICE_ID], 'msgbatch_01')).toBe(true)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'update', payload: { state: 'batch', batch_id: 'msgbatch_01' } })
    expect(calls[0].filters).toEqual([{ name: 'in', args: ['id', [NOTICE_ID, NOTICE_ID2]] }])

    const part = fakeDb(() => ok([{ id: NOTICE_ID }]))
    expect(await part.store.markBatch([NOTICE_ID, NOTICE_ID2], 'msgbatch_01')).toBe(false)

    const empty = fakeDb(happy)
    expect(await empty.store.markBatch([], 'msgbatch_01')).toBe(true)
    expect(empty.calls).toHaveLength(0)
  })

  it('AC-7415.2: openBatches는 batch 글을 일괄 id마다 묶고 가장 이른 고친 시각을 oldest로 준다(이른 일괄부터)', async () => {
    const { store, calls } = fakeDb(() =>
      ok([
        { id: NOTICE_ID, batch_id: 'msgbatch_B', updated_at: '2026-11-21T03:00:00+00:00' },
        { id: NOTICE_ID2, batch_id: 'msgbatch_A', updated_at: '2026-11-21T01:00:00.5+00:00' },
        { id: NEW_ID, batch_id: 'msgbatch_B', updated_at: '2026-11-21T02:00:00+00:00' },
      ]),
    )
    expect(await store.openBatches()).toEqual([
      { batchId: 'msgbatch_A', ids: [NOTICE_ID2], oldest: '2026-11-21T01:00:00.500Z' },
      { batchId: 'msgbatch_B', ids: [NOTICE_ID, NEW_ID], oldest: '2026-11-21T02:00:00.000Z' },
    ])
    expect(calls[0].filters[0]).toEqual({ name: 'eq', args: ['state', 'batch'] })
  })

  it('AC-7415.2: weekExists는 그 주 모음이 있으면 true, 없으면 false다', async () => {
    const yes = fakeDb(() => ok({ week_start: '2026-11-16' }))
    expect(await yes.store.weekExists('2026-11-16')).toBe(true)
    expect(yes.calls[0]).toMatchObject({ table: 'notice_weeks', single: 'maybe' })
    expect(yes.calls[0].filters).toEqual([{ name: 'eq', args: ['week_start', '2026-11-16'] }])
    const no = fakeDb(() => ok(null))
    expect(await no.store.weekExists('2026-11-16')).toBe(false)
  })

  it('AC-7415.2: weekPending은 그 주(월~일) posted_on 글 가운데 wait·batch 글이 하나라도 있으면 true다(한 줄만 읽는다, 기본값 22)', async () => {
    const { store, calls } = fakeDb(() => ok([{ id: NOTICE_ID }]))
    expect(await store.weekPending('2026-11-16')).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'select', columns: 'id' })
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        { name: 'in', args: ['state', ['wait', 'batch']] },
        { name: 'gte', args: ['posted_on', '2026-11-16'] },
        { name: 'lte', args: ['posted_on', '2026-11-22'] },
        { name: 'limit', args: [1] },
      ]),
    )
    expect(calls[0].filters).toHaveLength(4)
  })

  it('AC-7415.2: weekPending은 맞는 글이 없으면 false다', async () => {
    const { store } = fakeDb(() => ok([]))
    expect(await store.weekPending('2026-11-16')).toBe(false)
  })

  it.each(['2026-11-17', '2026-11-22', '2026-11-1', '2026-02-30', ''])(
    'AC-7415.3: weekPending은 월요일 YYYY-MM-DD가 아니면(%s) DB를 부르지 않고 고정 글로 던진다',
    async (weekStart) => {
      const { store, calls } = fakeDb(() => ok([]))
      await expect(store.weekPending(weekStart)).rejects.toThrow(new Error(STORE_READ_FAILED))
      expect(calls).toHaveLength(0)
    },
  )

  it('AC-7415.2: weekNotices는 그 주(월~일) 요약이 끝난 관련 글의 종류·제목·요약이고, 요약 모양이 틀린 줄은 건너뛴다', async () => {
    const { store, calls } = fakeDb(() =>
      ok([
        { kind: 'gosi', title: '고시 글', summary: SUMMARY },
        { kind: 'notice', title: '모양 틀림', summary: { what: 1 } },
        { kind: 'case', title: '사례 글', summary: { ...SUMMARY, amends: [] } },
      ]),
    )
    expect(await store.weekNotices('2026-11-16')).toEqual([
      { kind: 'gosi', title: '고시 글', summary: SUMMARY },
      { kind: 'case', title: '사례 글', summary: { ...SUMMARY, amends: [] } },
    ])
    expect(calls[0].table).toBe('notices')
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        { name: 'eq', args: ['state', 'done'] },
        { name: 'eq', args: ['related', true] },
        { name: 'gte', args: ['posted_on', '2026-11-16'] },
        { name: 'lte', args: ['posted_on', '2026-11-22'] },
        { name: 'limit', args: [60] },
      ]),
    )
  })

  it('AC-7415.2: saveWeek는 그 주 월요일과 꼭 알 것(head·body만)을 넣는다', async () => {
    const { store, calls } = fakeDb(() => ok(null))
    const top3 = [{ head: '머리', body: '몸', extra: 'x' } as { head: string; body: string }]
    expect(await store.saveWeek({ weekStart: '2026-11-16', top3 })).toBe(true)
    expect(calls[0]).toMatchObject({ table: 'notice_weeks', op: 'insert', payload: { week_start: '2026-11-16', top3: [{ head: '머리', body: '몸' }] } })
  })

  // ── 일괄 글의 읽기 결과(BatchReadingStore) ──

  it('AC-7415.2: saveReading은 그 글 한 줄의 read_mode·attach_text만 고치고, 한 줄을 고쳤을 때 true다', async () => {
    const { store, calls } = fakeDb(() => ok([{ id: NOTICE_ID }]))
    expect(await store.saveReading(NOTICE_ID, READING)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'update' })
    expect(calls[0].payload).toEqual({ read_mode: 'text', attach_text: '붙임.hwpx\n글자' })
    expect(calls[0].filters).toEqual([{ name: 'eq', args: ['id', NOTICE_ID] }])
  })

  it.each([
    ['고친 줄 없음(없는 id·권한 없음)', [] as unknown[]],
    ['고친 줄 둘', [{ id: NOTICE_ID }, { id: NOTICE_ID2 }]],
  ])('AC-7415.2: saveReading은 %s이면 false다', async (_name, rows) => {
    const { store } = fakeDb(() => ok(rows))
    expect(await store.saveReading(NOTICE_ID, READING)).toBe(false)
  })

  it('AC-7415.2: saveReading은 붙임 글자가 notices 제약 끝(20,000자, 글자 수는 DB char_length처럼 셈)이면 쓴다', async () => {
    const { store, calls } = fakeDb(() => ok([{ id: NOTICE_ID }]))
    // 이모지 20,000개 = JS 길이 40,000이지만 DB 글자 수는 20,000
    const attachText = '😀'.repeat(20000)
    expect(await store.saveReading(NOTICE_ID, { readMode: 'body', attachText })).toBe(true)
    expect(calls[0].payload).toEqual({ read_mode: 'body', attach_text: attachText })
  })

  it.each([
    ['읽은 방법이 정한 값 밖', { readMode: 'pdf', attachText: '' }],
    ['읽은 방법이 null', { readMode: null, attachText: '' }],
    ['붙임 글자 20,001자', { readMode: 'full', attachText: '가'.repeat(20001) }],
    ['붙임 글자가 글자가 아님', { readMode: 'full', attachText: null }],
  ])('AC-7415.2: saveReading은 notices 제약(%s)에 맞지 않으면 DB를 부르지 않고 false다', async (_name, reading) => {
    const { store, calls } = fakeDb(happy)
    expect(await store.saveReading(NOTICE_ID, reading as unknown as typeof READING)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('AC-7415.2: batchNotices는 그 id들의 글(상태 상관없음)을 id로 읽어 id·고시 번호·본문·읽은 방법·붙임 글자를 돌려준다', async () => {
    const { store, calls } = fakeDb(() =>
      ok([
        { id: NOTICE_ID, notice_no: '2026-218', body: '[복지부 고시 글]\n본문', read_mode: 'full', attach_text: '붙임.pdf\n글자' },
        { id: NOTICE_ID2, notice_no: null, body: '', read_mode: null, attach_text: '' },
      ]),
    )
    expect(await store.batchNotices([NOTICE_ID, NOTICE_ID2, NOTICE_ID])).toEqual([
      { id: NOTICE_ID, noticeNo: '2026-218', body: '[복지부 고시 글]\n본문', readMode: 'full', attachText: '붙임.pdf\n글자' },
      { id: NOTICE_ID2, noticeNo: null, body: '', readMode: null, attachText: '' },
    ] satisfies BatchNotice[])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'select', single: null })
    expect(
      selectedColumns('notices', calls[0].columns as string)
        .map(([, c]) => c)
        .sort(),
    ).toEqual(['attach_text', 'body', 'id', 'notice_no', 'read_mode'])
    // 상태 조건 없이 id로만(같은 id는 한 번)
    expect(calls[0].filters).toEqual([{ name: 'in', args: ['id', [NOTICE_ID, NOTICE_ID2]] }])
  })

  it('AC-7415.2: batchNotices는 빈 목록이면 DB를 부르지 않고 빈 목록이다', async () => {
    const { store, calls } = fakeDb(happy)
    expect(await store.batchNotices([])).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('AC-7415.2: batchNotices는 모양이 틀린 줄을 건너뛴다(그 글은 거둘 때 없는 글이 된다)', async () => {
    const good = { id: NOTICE_ID, notice_no: '2026-218', body: '본문', read_mode: 'text', attach_text: '붙임' }
    const { store } = fakeDb(() =>
      ok([
        { ...good, id: 42 },
        { ...good, read_mode: 'pdf' },
        { ...good, body: null },
        { ...good, attach_text: undefined },
        { ...good, notice_no: 218 },
        null,
        'row',
        good,
      ]),
    )
    expect(await store.batchNotices([NOTICE_ID])).toEqual([{ id: NOTICE_ID, noticeNo: '2026-218', body: '본문', readMode: 'text', attachText: '붙임' }])
  })
})

// ── CollectorStore: 오류 ───────────────────────────────────

describe('collectorStore — 오류 (AC-7415.3)', () => {
  const throwing: Responder = () => {
    throw new Error(`thrown ${SECRET}`)
  }

  describe.each([
    ['DB 오류', dbError as Responder],
    ['던짐', throwing],
  ])('%s', (_name, respond) => {
    it.each(WRITES)('AC-7415.3: 쓰기 %s는 false다', async (_fn, run) => {
      const { store } = fakeDb(respond)
      await expect(run(store)).resolves.toBe(false)
    })

    it.each(READS)('AC-7415.3: 읽기 %s는 고정 글로 던지고 받은 오류 글은 담지 않는다', async (_fn, run) => {
      const { store } = fakeDb(respond)
      const error = await run(store).then(
        () => null,
        (e: unknown) => e,
      )
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(STORE_READ_FAILED)
      expect(JSON.stringify(error)).not.toContain('secret')
      expect((error as Error).cause).toBeUndefined()
    })
  })

  it('AC-7415.3: saveGroup은 출처 글 넣기가 실패하면 false다', async () => {
    const { store } = fakeDb((call) => (call.table === 'notices' ? ok({ id: NEW_ID }) : dbError()))
    expect(await store.saveGroup(NEW_GROUP, POST)).toBe(false)
  })

  it('AC-7415.3: failSummary는 고치기가 실패하면 false다', async () => {
    const { store } = fakeDb((call) => (call.op === 'select' ? ok({ tries: 0 }) : dbError()))
    expect(await store.failSummary(NOTICE_ID)).toBe(false)
  })

  it.each([
    ['sources(목록이 아님)', (s: Store) => s.sources(), ok({ not: 'array' })],
    ['sources(정한 값 밖 출처)', (s: Store) => s.sources(), ok([{ ...DB_SOURCE, source: 'kma' }])],
    ['groupOf(출처 글이 목록이 아님)', (s: Store) => s.groupOf('gosi:2026-218'), ok(dbNotice({ notice_posts: null }))],
    ['waiting(종류가 정한 값 밖)', (s: Store) => s.waiting(40), ok([dbNotice({ kind: 'memo' })])],
    ['startRun(글자가 아님)', (s: Store) => s.startRun(), ok(42)],
    ['openBatches(시각이 아님)', (s: Store) => s.openBatches(), ok([{ id: NOTICE_ID, batch_id: 'msgbatch_A', updated_at: 'yesterday' }])],
    ['batchNotices(목록이 아님)', (s: Store) => s.batchNotices([NOTICE_ID]), ok({ not: 'array' })],
    ['weekPending(목록이 아님)', (s: Store) => s.weekPending('2026-11-16'), ok({ id: NOTICE_ID })],
  ])('AC-7415.3: 읽은 줄 모양이 틀리면(%s) 고정 글로 던진다', async (_name, run, answer) => {
    const { store } = fakeDb(() => answer)
    await expect(run(store)).rejects.toThrow(new Error(STORE_READ_FAILED))
  })
})

// ── RuleReviewStore: 규칙 살피기 쪽(specs/rule-auto REQ-7811) ──

const BASE_VERSION = '2026-10-19'
const CUTOFF = '2026-10-19'

// rule_changes 칸과 grant(specs/rule-auto design 7절 그대로). 넣기는 정한 칸만, 고치기는 state만
const RULE_CHANGE_INSERT = ['notice_id', 'rule_id', 'base_version', 'verdict', 'by_ai', 'check_code', 'why', 'before_text', 'after_text', 'effective_from', 'rule']
const RULE_READ_COLUMNS: Record<string, string[]> = {
  notices: READ_COLUMNS.notices,
  rule_changes: [...RULE_CHANGE_INSERT, 'id', 'state', 'created_at'],
}
const RULE_INSERT_COLUMNS: Record<string, string[]> = { rule_changes: RULE_CHANGE_INSERT }
// notices는 이 쪽에서 rule_hits만 고친다(clearOldRuleHits)
const RULE_UPDATE_COLUMNS: Record<string, string[]> = { notices: ['rule_hits'], rule_changes: ['state'] }
const RULE_RPCS = ['rule_review_waiting', 'rule_review_failed']

// rule_review_waiting이 돌려주는 jsonb 글 하나(AC-7806.1 칸 이름 그대로)
const dbReview = (over: Record<string, unknown> = {}) => ({
  id: NOTICE_ID,
  title: '복지부 고시 글',
  noticeNo: '2026-218',
  postedOn: '2026-11-19',
  kind: 'gosi',
  body: '[복지부 고시 글]\n본문',
  attachText: '붙임.pdf\n글자',
  summary: SUMMARY,
  url: MOHW_URL,
  source: 'mohw_rss',
  ruleHits: [
    { id: 'ES-04', title: '충격파 횟수' },
    { id: 'DX-01', title: '상병 규칙' },
  ],
  pending: ['ES-04', 'DX-01'],
  tries: 1,
  ...over,
})
const REVIEW: ReviewNotice = {
  id: NOTICE_ID,
  title: '복지부 고시 글',
  noticeNo: '2026-218',
  postedOn: '2026-11-19',
  kind: 'gosi',
  body: '[복지부 고시 글]\n본문',
  attachText: '붙임.pdf\n글자',
  summary: SUMMARY,
  url: MOHW_URL,
  source: 'mohw_rss',
  ruleHits: [
    { id: 'ES-04', title: '충격파 횟수' },
    { id: 'DX-01', title: '상병 규칙' },
  ],
  pending: ['ES-04', 'DX-01'],
  tries: 1,
}

const RULE_DEF = {
  id: 'ES-04',
  title: '충격파 한 달 6번',
  message: '충격파는 한 달 6번까지예요',
  params: { limit: 6 },
  effective_from: '2026-12-01',
  effective_to: null,
} as unknown as RuleDef
const DB_LIVE = { rule_id: 'ES-04', effective_from: '2026-12-01', rule: { id: 'ES-04', title: '충격파 한 달 6번' } }

const CHANGE_ROW: RuleChangeRow = {
  noticeId: NOTICE_ID,
  ruleId: 'ES-04',
  baseVersion: BASE_VERSION,
  verdict: 'change',
  byAi: true,
  checkCode: null,
  why: '충격파 횟수가 늘었어요',
  before: '한 달 4번까지 봐요',
  after: '한 달 6번까지 봐요',
  effectiveFrom: '2026-12-01',
  rule: RULE_DEF,
}
const TRIES_ROW: RuleChangeRow = {
  noticeId: NOTICE_ID,
  ruleId: 'DX-01',
  baseVersion: BASE_VERSION,
  verdict: 'human',
  byAi: false,
  checkCode: 'tries',
  why: 'AI가 세 번 못 살폈어요',
  before: '',
  after: '',
  effectiveFrom: null,
  rule: null,
}
const DB_CHANGE_ROW = {
  notice_id: NOTICE_ID,
  rule_id: 'ES-04',
  base_version: BASE_VERSION,
  verdict: 'change',
  by_ai: true,
  check_code: null,
  why: '충격파 횟수가 늘었어요',
  before_text: '한 달 4번까지 봐요',
  after_text: '한 달 6번까지 봐요',
  effective_from: '2026-12-01',
  rule: RULE_DEF,
}
const DB_TRIES_ROW = {
  notice_id: NOTICE_ID,
  rule_id: 'DX-01',
  base_version: BASE_VERSION,
  verdict: 'human',
  by_ai: false,
  check_code: 'tries',
  why: 'AI가 세 번 못 살폈어요',
  before_text: '',
  after_text: '',
  effective_from: null,
  rule: null,
}

// 여섯 함수가 끝까지 가도록 모양이 맞는 답
function ruleHappy(call: Call): Answer {
  if (call.op === 'rpc') return ok(call.fn === 'rule_review_waiting' ? [dbReview()] : 2)
  if (call.op === 'update') return ok([{ id: NOTICE_ID }, { id: NOTICE_ID2 }])
  if (call.table === 'rule_changes' && call.op === 'select') return ok([DB_LIVE])
  return ok(null)
}

// 고친 수를 주는 쓰기(-1) · 참거짓 쓰기(false) · 읽기(던짐)
const RULE_COUNTS: [string, (s: Store) => Promise<number>][] = [
  ['clearOldRuleHits', (s) => s.clearOldRuleHits(CUTOFF)],
  ['retireOldChanges', (s) => s.retireOldChanges(BASE_VERSION)],
  ['reviewFailed', (s) => s.reviewFailed(NOTICE_ID)],
]
const RULE_WRITES: [string, (s: Store) => Promise<boolean>][] = [['saveRuleChanges', (s) => s.saveRuleChanges([CHANGE_ROW, TRIES_ROW])]]
const RULE_READS: [string, (s: Store) => Promise<unknown>][] = [
  ['reviewWaiting', (s) => s.reviewWaiting(CUTOFF, 3)],
  ['liveChanges', (s) => s.liveChanges(['ES-04', 'DX-01'], BASE_VERSION)],
]

describe('collectorStore — 규칙 살피기 표·칸 (AC-7811.1)', () => {
  it('AC-7811.1: 여섯 함수가 design 7절의 표·칸·함수만 쓰고, 넣는 칸·고치는 칸은 grant 칸뿐이며, 병원 조건·지우기가 없다', async () => {
    const { store, calls } = fakeDb(ruleHappy)
    for (const [, run] of RULE_COUNTS) expect(await run(store)).toBeGreaterThanOrEqual(0)
    for (const [, run] of RULE_WRITES) expect(await run(store)).toBe(true)
    for (const [, run] of RULE_READS) await run(store)

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      if (call.op === 'rpc') {
        expect(RULE_RPCS).toContain(call.fn)
        continue
      }
      const table = call.table as string
      expect(Object.keys(RULE_READ_COLUMNS)).toContain(table)
      if (call.columns !== null) {
        for (const [t, c] of selectedColumns(table, call.columns)) expect(RULE_READ_COLUMNS[t] ?? [], `${t}.${c}`).toContain(c)
      }
      if (call.op === 'insert' || call.op === 'upsert') for (const k of keysOf(call.payload)) expect(RULE_INSERT_COLUMNS[table] ?? [], `${table}.${k}`).toContain(k)
      if (call.op === 'update') for (const k of keysOf(call.payload)) expect(RULE_UPDATE_COLUMNS[table] ?? [], `${table}.${k}`).toContain(k)
      for (const f of call.filters) {
        if (f.name === 'limit') continue
        expect(RULE_READ_COLUMNS[table], `${f.name}(${String(f.args[0])})`).toContain(f.args[0])
      }
    }
    // 병원마다 표시(rule_change_marks)·실패 수 표(rule_review_tries)는 직접 다루지 않는다
    expect(calls.map((c) => c.table)).not.toContain('rule_change_marks')
    expect(calls.map((c) => c.table)).not.toContain('rule_review_tries')
    expect(JSON.stringify(calls)).not.toMatch(/hospital/)
  })

  it('AC-7811.1: clearOldRuleHits는 규칙표 날짜까지 올라온 글 가운데 규칙 연결이 있는 글의 rule_hits를 빈 목록으로 고치고 고친 수를 준다', async () => {
    const { store, calls } = fakeDb(() => ok([{ id: NOTICE_ID }, { id: NOTICE_ID2 }]))
    expect(await store.clearOldRuleHits(CUTOFF)).toBe(2)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'notices', op: 'update', payload: { rule_hits: [] }, columns: 'id' })
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        { name: 'lte', args: ['posted_on', CUTOFF] },
        { name: 'gt', args: ['rule_count', 0] },
      ]),
    )
    expect(calls[0].filters).toHaveLength(2)

    const none = fakeDb(() => ok([]))
    expect(await none.store.clearOldRuleHits(CUTOFF)).toBe(0)
  })

  it('AC-7811.1: retireOldChanges는 다른 규칙표 판(base_version)의 살아 있는 줄을 old로 고치고 고친 수를 준다', async () => {
    const { store, calls } = fakeDb(() => ok([{ id: NOTICE_ID }]))
    expect(await store.retireOldChanges(BASE_VERSION)).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'rule_changes', op: 'update', payload: { state: 'old' }, columns: 'id' })
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        { name: 'eq', args: ['state', 'live'] },
        { name: 'neq', args: ['base_version', BASE_VERSION] },
      ]),
    )
    expect(calls[0].filters).toHaveLength(2)

    const none = fakeDb(() => ok([]))
    expect(await none.store.retireOldChanges(BASE_VERSION)).toBe(0)
  })

  it('AC-7811.1: reviewWaiting은 DB 함수 rule_review_waiting(p_cutoff, p_limit)을 불러 글을 ReviewNotice로 바꾼다(정한 칸만 담는다)', async () => {
    const { store, calls } = fakeDb(() =>
      ok([
        dbReview({ extra: 'x', ruleHits: [{ id: 'ES-04', title: '충격파 횟수', extra: 'x' }, { id: 'DX-01', title: '상병 규칙' }] }),
        dbReview({ id: NOTICE_ID2, noticeNo: null, summary: null, url: null, source: null, pending: [], tries: 0 }),
      ]),
    )
    expect(await store.reviewWaiting(CUTOFF, 3)).toEqual([
      REVIEW,
      { ...REVIEW, id: NOTICE_ID2, noticeNo: null, summary: null, url: null, source: null, pending: [], tries: 0 },
    ] satisfies ReviewNotice[])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ op: 'rpc', fn: 'rule_review_waiting', args: { p_cutoff: CUTOFF, p_limit: 3 } })
  })

  it('AC-7811.1: reviewWaiting은 살필 글이 없으면(빈 목록·null) 빈 목록이다', async () => {
    expect(await fakeDb(() => ok([])).store.reviewWaiting(CUTOFF, 3)).toEqual([])
    expect(await fakeDb(() => ok(null)).store.reviewWaiting(CUTOFF, 3)).toEqual([])
  })

  it('AC-7811.1: reviewWaiting은 모양이 틀린 글을 뺀다(다른 글은 그대로 살핀다)', async () => {
    const { store } = fakeDb(() =>
      ok([
        dbReview({ id: 42 }),
        dbReview({ title: null }),
        dbReview({ noticeNo: 218 }),
        dbReview({ postedOn: 'yesterday' }),
        dbReview({ kind: 'memo' }),
        dbReview({ body: null }),
        dbReview({ attachText: undefined }),
        dbReview({ summary: { what: 1 } }),
        dbReview({ url: 42 }),
        dbReview({ source: 'kma' }),
        dbReview({ ruleHits: 'ES-04' }),
        dbReview({ ruleHits: [{ id: 'ES-04' }] }),
        dbReview({ pending: 'ES-04' }),
        dbReview({ pending: ['ES-04', 4] }),
        dbReview({ tries: 1.5 }),
        dbReview({ tries: '1' }),
        null,
        'row',
        dbReview(),
      ]),
    )
    expect(await store.reviewWaiting(CUTOFF, 3)).toEqual([REVIEW])
  })

  it('AC-7811.1: liveChanges는 그 규칙들의 같은 규칙표 판 살아 있는 change 줄의 규칙 번호·시행일·규칙을 읽는다', async () => {
    const { store, calls } = fakeDb(() => ok([DB_LIVE, { rule_id: 'DX-01', effective_from: '2027-01-01', rule: { id: 'DX-01' } }]))
    expect(await store.liveChanges(['ES-04', 'DX-01', 'ES-04'], BASE_VERSION)).toEqual([
      { ruleId: 'ES-04', effectiveFrom: '2026-12-01', rule: { id: 'ES-04', title: '충격파 한 달 6번' } },
      { ruleId: 'DX-01', effectiveFrom: '2027-01-01', rule: { id: 'DX-01' } },
    ] satisfies LiveChange[])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'rule_changes', op: 'select', single: null })
    expect(
      selectedColumns('rule_changes', calls[0].columns as string)
        .map(([, c]) => c)
        .sort(),
    ).toEqual(['effective_from', 'rule', 'rule_id'])
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        { name: 'eq', args: ['verdict', 'change'] },
        { name: 'eq', args: ['state', 'live'] },
        { name: 'eq', args: ['base_version', BASE_VERSION] },
        // 같은 번호는 한 번
        { name: 'in', args: ['rule_id', ['ES-04', 'DX-01']] },
      ]),
    )
    expect(calls[0].filters).toHaveLength(4)
  })

  it('AC-7811.1: liveChanges는 빈 목록이면 DB를 부르지 않고 빈 목록이고, 묻지 않은 규칙 줄은 뺀다', async () => {
    const empty = fakeDb(ruleHappy)
    expect(await empty.store.liveChanges([], BASE_VERSION)).toEqual([])
    expect(empty.calls).toHaveLength(0)

    const { store } = fakeDb(() => ok([DB_LIVE, { rule_id: 'XX-99', effective_from: '2026-12-01', rule: {} }]))
    expect(await store.liveChanges(['ES-04'], BASE_VERSION)).toEqual([{ ruleId: 'ES-04', effectiveFrom: '2026-12-01', rule: DB_LIVE.rule }])
  })

  it('AC-7811.1: saveRuleChanges는 rule_changes에 정한 칸만 (notice_id,rule_id)가 겹치면 건너뛰는 넣기로 쓴다', async () => {
    const { store, calls } = fakeDb(() => ok(null))
    expect(await store.saveRuleChanges([CHANGE_ROW, TRIES_ROW])).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'rule_changes', op: 'upsert', options: { onConflict: 'notice_id,rule_id', ignoreDuplicates: true } })
    expect(calls[0].payload).toEqual([DB_CHANGE_ROW, DB_TRIES_ROW])
  })

  it('AC-7811.1: saveRuleChanges는 빈 목록이면 DB를 부르지 않고 true다', async () => {
    const { store, calls } = fakeDb(ruleHappy)
    expect(await store.saveRuleChanges([])).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('AC-7811.1: reviewFailed는 DB 함수 rule_review_failed(p_notice)를 불러 새 실패 수를 준다', async () => {
    const { store, calls } = fakeDb(() => ok(3))
    expect(await store.reviewFailed(NOTICE_ID)).toBe(3)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ op: 'rpc', fn: 'rule_review_failed', args: { p_notice: NOTICE_ID } })
  })
})

describe('collectorStore — 규칙 살피기 오류 (AC-7811.2)', () => {
  const throwing: Responder = () => {
    throw new Error(`thrown ${SECRET}`)
  }
  const consoleSpies = () => (['error', 'warn', 'log', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe.each([
    ['DB 오류', dbError as Responder],
    ['던짐', throwing],
  ])('%s', (_name, respond) => {
    it.each(RULE_COUNTS)('AC-7811.2: 고친 수를 주는 %s는 -1이다', async (_fn, run) => {
      const spies = consoleSpies()
      const { store } = fakeDb(respond)
      await expect(run(store)).resolves.toBe(-1)
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    })

    it.each(RULE_WRITES)('AC-7811.2: 쓰기 %s는 false다', async (_fn, run) => {
      const spies = consoleSpies()
      const { store } = fakeDb(respond)
      await expect(run(store)).resolves.toBe(false)
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    })

    it.each(RULE_READS)('AC-7811.2: 읽기 %s는 고정 글로 던지고 받은 오류 글은 담지 않는다', async (_fn, run) => {
      const spies = consoleSpies()
      const { store } = fakeDb(respond)
      const error = await run(store).then(
        () => null,
        (e: unknown) => e,
      )
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(STORE_READ_FAILED)
      expect(JSON.stringify(error)).not.toContain('secret')
      expect((error as Error).cause).toBeUndefined()
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['clearOldRuleHits(목록이 아님)', (s: Store) => s.clearOldRuleHits(CUTOFF), ok({ id: NOTICE_ID })],
    ['retireOldChanges(목록이 아님)', (s: Store) => s.retireOldChanges(BASE_VERSION), ok(null)],
    ['reviewFailed(정수가 아님)', (s: Store) => s.reviewFailed(NOTICE_ID), ok('2')],
    ['reviewFailed(null)', (s: Store) => s.reviewFailed(NOTICE_ID), ok(null)],
    ['reviewFailed(소수)', (s: Store) => s.reviewFailed(NOTICE_ID), ok(1.5)],
  ])('AC-7811.2: 고친 수 답 모양이 틀리면(%s) -1이다', async (_name, run, answer) => {
    const { store } = fakeDb(() => answer)
    await expect(run(store)).resolves.toBe(-1)
  })

  it.each([
    ['날짜가 아닌 cutoff', (s: Store) => s.clearOldRuleHits('2026-10-1')],
    ['빈 cutoff', (s: Store) => s.clearOldRuleHits('')],
    // 빈 판 이름이면 살아 있는 줄이 모두 old가 된다(되살릴 수 없다)
    ['빈 판 이름', (s: Store) => s.retireOldChanges('')],
    ['41자 판 이름', (s: Store) => s.retireOldChanges('v'.repeat(41))],
  ])('AC-7811.2: 여러 줄을 고치는 함수는 값이 틀리면(%s) DB를 부르지 않고 -1이다', async (_name, run) => {
    const { store, calls } = fakeDb(ruleHappy)
    await expect(run(store)).resolves.toBe(-1)
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['reviewWaiting(목록이 아님)', (s: Store) => s.reviewWaiting(CUTOFF, 3), ok({ not: 'array' })],
    ['reviewWaiting(글자)', (s: Store) => s.reviewWaiting(CUTOFF, 3), ok('[]')],
    ['liveChanges(목록이 아님)', (s: Store) => s.liveChanges(['ES-04'], BASE_VERSION), ok({ not: 'array' })],
    ['liveChanges(시행일이 날짜가 아님)', (s: Store) => s.liveChanges(['ES-04'], BASE_VERSION), ok([{ ...DB_LIVE, effective_from: 'soon' }])],
    ['liveChanges(규칙 번호가 글자가 아님)', (s: Store) => s.liveChanges(['ES-04'], BASE_VERSION), ok([{ ...DB_LIVE, rule_id: 4 }])],
    ['liveChanges(줄이 객체가 아님)', (s: Store) => s.liveChanges(['ES-04'], BASE_VERSION), ok(['ES-04'])],
  ])('AC-7811.2: 읽은 모양이 틀리면(%s) 고정 글로 던진다', async (_name, run, answer) => {
    const { store } = fakeDb(() => answer)
    await expect(run(store)).rejects.toThrow(new Error(STORE_READ_FAILED))
  })
})
