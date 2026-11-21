// 고시·공지 화면 자료 읽고 쓰기(specs/notices TASK-16, REQ-7418 · AC-7424.7). 실제 Supabase에 붙지 않는다.
// formGuides.test.ts와 같은 흉내: 가짜 클라이언트가 어느 표·함수에 어떤 칸·몸통·거르기가 나갔는지 적어 둔다.
// 표 권한·RLS·함수 동작은 supabase/notices.rls.test.ts·noticeKeywords.rls.test.ts가 증명한다. 글·id는 모두 지어낸 값이다
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FillProgress, NoticeFilter, NoticeView, NoticeWeek, RuleAlert, SourceView } from '@/types/notices'
import {
  addKeyword,
  askLeft,
  checkRules,
  fillProgress,
  listNotices,
  markRead,
  NOTICES_CHANGED,
  openNotice,
  readKeywords,
  readWeek,
  removeKeyword,
  ruleAlerts,
  saveMemo,
  setStar,
  sourceStates,
  unreadCount,
} from './notices'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const RAW_ERROR = { code: '42501', message: `permission denied (${SECRET})`, details: SECRET, hint: SECRET }
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const
const NOW = '2026-11-21T01:02:03.000Z'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const ID3 = '33333333-3333-4333-8333-333333333333'

type Call = {
  kind: 'from' | 'rpc'
  name: string // 표 또는 함수 이름
  args?: unknown // rpc 인자
  op?: 'select' | 'insert' | 'upsert' | 'delete'
  columns?: string[]
  selectOptions?: unknown
  body?: unknown
  options?: unknown // upsert 설정
  filters: [string, string, unknown][] // [eq|in|gte|lte, 칸, 값]
  orders: [string, { ascending?: boolean } | undefined][]
  limit?: number
  maybeSingle: boolean
}
type Reply = { data?: unknown; error?: unknown; count?: number | null }

/** 부른 표·함수·칸·몸통·거르기를 적는 가짜 클라이언트를 브라우저 클라이언트 자리에 둔다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Call) => Reply = () => ({ data: [] })) {
  const calls: Call[] = []
  const builderOf = (call: Call) => {
    const builder = {
      select(columns: string, options?: unknown) {
        call.op ??= 'select'
        call.columns = columns.split(',').map((column) => column.trim())
        call.selectOptions = options
        return builder
      },
      insert(body: unknown) {
        call.op = 'insert'
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
      eq(column: string, value: unknown) {
        call.filters.push(['eq', column, value])
        return builder
      },
      in(column: string, value: unknown) {
        call.filters.push(['in', column, value])
        return builder
      },
      gte(column: string, value: unknown) {
        call.filters.push(['gte', column, value])
        return builder
      },
      lte(column: string, value: unknown) {
        call.filters.push(['lte', column, value])
        return builder
      },
      order(column: string, options?: { ascending?: boolean }) {
        call.orders.push([column, options])
        return builder
      },
      limit(count: number) {
        call.limit = count
        return builder
      },
      maybeSingle() {
        call.maybeSingle = true
        return builder
      },
      // 진짜 빌더처럼 await할 때 답한다
      then(ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) {
        return Promise.resolve()
          .then(() => reply(call))
          .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null, count: r.count ?? null }))
          .then(ok, bad)
      },
    }
    return builder
  }
  const client = {
    from(name: string) {
      const call: Call = { kind: 'from', name, filters: [], orders: [], maybeSingle: false }
      calls.push(call)
      return builderOf(call)
    },
    rpc(name: string, args?: unknown) {
      const call: Call = { kind: 'rpc', name, args, filters: [], orders: [], maybeSingle: false }
      calls.push(call)
      return builderOf(call)
    },
  }
  supabaseBrowser.mockReturnValue(client)
  return calls
}

// ── 목록 줄 견본 (notice_list의 camelCase 줄, design 11절 NoticeView + 15절 keywords) ──

const SUMMARY = { related: true, what: '도수치료 횟수 기준이 바뀌어요', when: '2026년 12월 1일부터', who: '의원급 외래', forUs: '청구 전에 횟수를 확인해요', amends: ['2025-100'] }
const POSTS = [
  { source: 'mohw_rss', title: '건강보험 행위 급여 고시 개정', url: 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1', postedOn: '2026-11-18', attachments: [] },
  {
    source: 'hira_notice',
    title: '보건복지부 고시 제2026-218호 안내',
    url: 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=1',
    postedOn: '2026-11-19',
    attachments: [{ name: '붙임1.pdf', url: 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=1&apndBrdTyNo=2&apndBltNo=3' }],
  },
]
const MARK = { readAt: null, starred: true, memo: '회의 때 알리기', memoAt: '2026-11-20T03:00:00+00:00', rulesCheckedAt: null }
const EMPTY_MARK = { readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: null }

function listRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID1,
    title: '도수치료 급여기준 개정',
    kind: 'gosi',
    postedOn: '2026-11-18',
    noticeNo: '2026-218',
    related: true,
    summary: structuredClone(SUMMARY),
    readMode: 'full',
    state: 'done',
    ruleHits: [{ id: 'manual-15', title: '도수치료 횟수' }],
    posts: structuredClone(POSTS),
    mark: structuredClone(MARK),
    unread: true,
    keywords: ['도수치료'],
    ...over,
  }
}

const VIEW1: NoticeView = {
  id: ID1,
  title: '도수치료 급여기준 개정',
  kind: 'gosi',
  postedOn: '2026-11-18',
  noticeNo: '2026-218',
  related: true,
  summary: SUMMARY,
  readMode: 'full',
  state: 'done',
  ruleHits: [{ id: 'manual-15', title: '도수치료 횟수' }],
  posts: POSTS as NoticeView['posts'],
  mark: MARK,
  unread: true,
  keywords: ['도수치료'],
}

// 요약 전 글(요약·읽는 방법 없음, 규칙 연결 없음, 내 표시 없음, 맞은 낱말 없음)
const WAIT_ROW = listRow({
  id: ID2,
  title: '심사지침 안내',
  kind: 'guide',
  noticeNo: null,
  related: null,
  summary: null,
  readMode: null,
  state: 'wait',
  ruleHits: [],
  posts: [{ source: 'hira_crtr', title: '심사지침 안내', url: 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrList.do?pgmid=HIRAA030069000410', postedOn: '2026-11-17', attachments: [] }],
  mark: structuredClone(EMPTY_MARK),
  unread: false,
  keywords: [],
})
const WAIT_VIEW: NoticeView = {
  ...VIEW1,
  id: ID2,
  title: '심사지침 안내',
  kind: 'guide',
  noticeNo: null,
  related: null,
  summary: null,
  readMode: null,
  state: 'wait',
  ruleHits: [],
  posts: WAIT_ROW.posts as NoticeView['posts'],
  mark: EMPTY_MARK,
  unread: false,
  keywords: [],
}

const page = (rows: unknown[], total = rows.length, unread = 1) => ({ total, unread, rows })
/** 그 열쇠들을 뺀 얕은 사본 */
const without = (obj: object, ...keys: string[]) => Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)))
const FILTER: NoticeFilter = { related: true, sources: ['hira_notice', 'hira_crtr', 'mohw_rss'], starred: false, q: '', offset: 0 }

/** 화면에 알린 'notices:changed' 수를 센다. node 환경이라 window 자리에 EventTarget을 둔다 */
function watchChanged() {
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  const seen = { count: 0 }
  target.addEventListener(NOTICES_CHANGED, () => {
    seen.count += 1
  })
  return seen
}

// 오류 답·예외·클라이언트 만들기 실패
const FAILURES: [string, () => void][] = [
  ['오류 답', () => fakeClient(() => ({ error: RAW_ERROR }))],
  [
    '보내다 예외(네트워크)',
    () =>
      fakeClient(() => {
        throw new Error(SECRET)
      }),
  ],
  [
    '클라이언트 만들기 실패',
    () =>
      supabaseBrowser.mockImplementation(() => {
        throw new Error(SECRET)
      }),
  ],
]

beforeEach(() => {
  supabaseBrowser.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  for (const method of CONSOLE_METHODS) vi.spyOn(console, method).mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function expectNoConsole() {
  for (const method of CONSOLE_METHODS) expect(console[method]).not.toHaveBeenCalled()
}

// ── AC-7418.1 목록 · 글 하나 ───────────────────────────────

describe('AC-7418.1 listNotices · openNotice', () => {
  it('AC-7418.1: 찾는 말이 없으면 notice_list를 거르기 그대로 50개씩 한 번 부르고 NoticeView 목록과 total·unread를 돌려준다', async () => {
    const calls = fakeClient((call) => (call.name === 'notice_list' ? { data: page([listRow(), WAIT_ROW], 120, 7) } : { data: [] }))
    const result = await listNotices(FILTER)
    expect(result).toEqual({ total: 120, unread: 7, rows: [VIEW1, WAIT_VIEW] })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'rpc', name: 'notice_list' })
    expect(calls[0].args).toEqual({
      p_related: true,
      p_sources: ['hira_notice', 'hira_crtr', 'mohw_rss'],
      p_starred: false,
      p_ids: null,
      p_unread_only: false,
      p_limit: 50,
      p_offset: 0,
    })
  })

  it('AC-7418.1: 전체·별표만·출처 하나·다음 쪽(offset 50) 거르기를 그대로 넘긴다. 빈칸뿐인 찾는 말은 찾지 않는다', async () => {
    const calls = fakeClient(() => ({ data: page([]) }))
    await listNotices({ related: false, sources: ['mohw_rss'], starred: true, q: '   ', offset: 50 })
    expect(calls.map((c) => c.name)).toEqual(['notice_list'])
    expect(calls[0].args).toEqual({ p_related: false, p_sources: ['mohw_rss'], p_starred: true, p_ids: null, p_unread_only: false, p_limit: 50, p_offset: 50 })
  })

  it('AC-7418.1: 찾는 말이 있으면 앞뒤 공백을 뗀 말로 notice_search를 부르고 그 id로 notice_list를 거른다', async () => {
    const calls = fakeClient((call) => {
      if (call.name === 'notice_search') return { data: [ID1, ID3] }
      return { data: page([listRow()], 1, 1) }
    })
    const result = await listNotices({ ...FILTER, q: '  도수 횟수 ', offset: 50 })
    expect(result).toEqual({ total: 1, unread: 1, rows: [VIEW1] })
    expect(calls.map((c) => [c.kind, c.name])).toEqual([
      ['rpc', 'notice_search'],
      ['rpc', 'notice_list'],
    ])
    expect(calls[0].args).toEqual({ p_q: '도수 횟수' })
    expect(calls[1].args).toEqual({
      p_related: true,
      p_sources: FILTER.sources,
      p_starred: false,
      p_ids: [ID1, ID3],
      p_unread_only: false,
      p_limit: 50,
      p_offset: 50,
    })
  })

  it('AC-7418.1: notice_search 줄이 { notice_search: id } 꼴로 와도 id만 골라 쓰고, 틀린 줄은 버린다', async () => {
    const calls = fakeClient((call) => {
      if (call.name === 'notice_search') return { data: [{ notice_search: ID2 }, ID3, 12, null, { other: ID1 }] }
      return { data: page([]) }
    })
    await listNotices({ ...FILTER, q: '심사' })
    expect((calls[1].args as { p_ids: unknown }).p_ids).toEqual([ID2, ID3])
  })

  it('AC-7418.1: 찾은 글이 없으면 notice_list를 부르지 않고 빈 쪽이다', async () => {
    const calls = fakeClient((call) => (call.name === 'notice_search' ? { data: [] } : { data: page([listRow()]) }))
    expect(await listNotices({ ...FILTER, q: '없는말' })).toEqual({ total: 0, unread: 0, rows: [] })
    expect(calls.map((c) => c.name)).toEqual(['notice_search'])
  })

  it('AC-7418.1: 줄의 정해 둔 칸만 새로 만들어 담는다(본문·붙임 글자 같은 다른 칸은 옮기지 않는다)', async () => {
    fakeClient(() => ({ data: page([listRow({ body: SECRET, attachText: SECRET, groupKey: SECRET })]) }))
    const result = await listNotices(FILTER)
    expect(result).toEqual({ total: 1, unread: 1, rows: [VIEW1] })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('AC-7418.1: 모양이 틀린 줄(id·제목·종류·날짜·상태·안 읽음)은 뺀다', async () => {
    const bad = [
      listRow({ id: 1 }),
      listRow({ id: '' }),
      listRow({ title: null }),
      listRow({ kind: 'memo' }),
      listRow({ postedOn: 20261118 }),
      listRow({ state: 'gone' }),
      listRow({ unread: 'yes' }),
      null,
      [listRow()],
      'row',
    ]
    fakeClient(() => ({ data: page([...bad, listRow()], 11, 1) }))
    expect(await listNotices(FILTER)).toEqual({ total: 11, unread: 1, rows: [VIEW1] })
  })

  it('AC-7418.1: 안쪽 칸이 틀리면 그 칸만 빈 값으로 둔다(요약·읽는 방법·관련·번호·규칙·출처 글·붙임·내 표시)', async () => {
    fakeClient(() => ({
      data: page([
        listRow({
          noticeNo: 2026,
          related: 'true',
          summary: { what: '무엇' }, // 칸이 모자람
          readMode: 'pdf',
          ruleHits: [{ id: 'r1', title: '규칙 하나' }, { id: 2, title: 'x' }, null],
          posts: [
            { ...POSTS[0], attachments: [{ name: '붙임', url: 1 }, { name: '좋은 붙임', url: 'https://www.mohw.go.kr/a' }] },
            { ...POSTS[1], source: 'kma' },
            null,
          ],
          mark: { readAt: 5, starred: 'no', memo: null, memoAt: '2026-11-20T03:00:00+00:00', rulesCheckedAt: null },
          keywords: ['도수치료', 3, null, '체외충격파'],
        }),
        listRow({ id: ID3, ruleHits: 'x', posts: null, mark: null, keywords: 'x', summary: [] }),
      ]),
    }))
    const result = await listNotices(FILTER)
    if (result === 'failed') throw new Error('목록을 읽어야 한다')
    expect(result.rows[0]).toEqual({
      ...VIEW1,
      noticeNo: null,
      related: null,
      summary: null,
      readMode: null,
      ruleHits: [{ id: 'r1', title: '규칙 하나' }],
      posts: [{ ...POSTS[0], attachments: [{ name: '좋은 붙임', url: 'https://www.mohw.go.kr/a' }] }],
      mark: { readAt: null, starred: false, memo: '', memoAt: '2026-11-20T03:00:00+00:00', rulesCheckedAt: null },
      keywords: ['도수치료', '체외충격파'],
    })
    expect(result.rows[1]).toEqual({ ...VIEW1, id: ID3, ruleHits: [], posts: [], mark: EMPTY_MARK, keywords: [], summary: null })
  })

  it('AC-7418.1: 요약의 amends가 없거나 틀리면 빈 목록, 요약 안 related가 없으면 줄의 related를 쓴다', async () => {
    const rest = without(SUMMARY, 'amends', 'related')
    fakeClient(() => ({ data: page([listRow({ summary: { ...rest, amends: [1, '2024-5'] } }), listRow({ id: ID3, related: false, summary: rest })]) }))
    const result = await listNotices(FILTER)
    if (result === 'failed') throw new Error('목록을 읽어야 한다')
    expect(result.rows[0].summary).toEqual({ ...SUMMARY, amends: ['2024-5'] })
    expect(result.rows[1].summary).toEqual({ ...SUMMARY, related: false, amends: [] })
  })

  it('AC-7418.1: openNotice(id)는 그 id 하나만 notice_list로 거르고(관련·출처·별표 거르기 없음) 그 글이다', async () => {
    const calls = fakeClient(() => ({ data: page([listRow()]) }))
    expect(await openNotice(ID1)).toEqual(VIEW1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'rpc', name: 'notice_list' })
    expect(calls[0].args).toEqual({ p_related: false, p_sources: null, p_starred: false, p_ids: [ID1], p_unread_only: false, p_limit: 1, p_offset: 0 })
  })

  it('AC-7418.1: openNotice는 글이 없거나(빈 줄·다른 id 줄) id가 uuid 모양이 아니면 null이다(모양이 틀리면 부르지 않는다)', async () => {
    fakeClient(() => ({ data: page([]) }))
    expect(await openNotice(ID1)).toBeNull()
    fakeClient(() => ({ data: page([listRow({ id: ID2 })]) }))
    expect(await openNotice(ID1)).toBeNull()
    const calls = fakeClient(() => ({ data: page([listRow()]) }))
    expect(await openNotice('not-a-uuid')).toBeNull()
    expect(await openNotice('')).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

// ── AC-7424.7 목록 줄의 내 낱말 ──────────────────────────────

describe('AC-7424.7 NoticeView.keywords', () => {
  it('AC-7424.7: listNotices·openNotice 줄의 keywords는 notice_list 줄의 keywords(넣은 차례 그대로)다', async () => {
    fakeClient(() => ({ data: page([listRow({ keywords: ['체외충격파', '도수치료'] })]) }))
    const list = await listNotices(FILTER)
    if (list === 'failed') throw new Error('목록을 읽어야 한다')
    expect(list.rows[0].keywords).toEqual(['체외충격파', '도수치료'])
    expect(await openNotice(ID1)).toEqual({ ...VIEW1, keywords: ['체외충격파', '도수치료'] })
  })

  it('AC-7424.7: 줄에 keywords 칸이 없으면(낱말 migration 전) 빈 목록이다', async () => {
    fakeClient(() => ({ data: page([without(listRow(), 'keywords')]) }))
    expect(await openNotice(ID1)).toEqual({ ...VIEW1, keywords: [] })
  })
})

// ── AC-7418.2 내 표시 쓰기 ──────────────────────────────────

describe('AC-7418.2 markRead · setStar · saveMemo · checkRules', () => {
  const MARKS = 'notice_marks'
  const ON_CONFLICT = { onConflict: 'hospital_id,notice_id' }

  it('AC-7418.2: markRead는 notice_marks에 { notice_id, read_at: 지금 }만 upsert하고 true, 그 뒤 notices:changed를 한 번 알린다', async () => {
    const seen = watchChanged()
    const calls = fakeClient(() => ({}))
    expect(await markRead(ID1)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'from', name: MARKS, op: 'upsert', options: ON_CONFLICT })
    expect(calls[0].body).toEqual({ notice_id: ID1, read_at: NOW })
    expect(seen.count).toBe(1)
  })

  it('AC-7418.2: setStar는 { notice_id, starred }만 upsert한다(별표 하기·빼기)', async () => {
    const calls = fakeClient(() => ({}))
    expect(await setStar(ID1, true)).toBe(true)
    expect(await setStar(ID2, false)).toBe(true)
    expect(calls.map((c) => [c.name, c.op, c.body, c.options])).toEqual([
      [MARKS, 'upsert', { notice_id: ID1, starred: true }, ON_CONFLICT],
      [MARKS, 'upsert', { notice_id: ID2, starred: false }, ON_CONFLICT],
    ])
  })

  it('AC-7418.2: saveMemo는 checkMemo가 ok면 { notice_id, memo(앞뒤 공백 뗌), memo_at: 지금 }만 upsert하고 true다. 빈 메모는 지우기로 보낸다', async () => {
    const calls = fakeClient(() => ({}))
    expect(await saveMemo(ID1, '  12월 회의 때 원장님들께 알리기\n')).toBe(true)
    expect(await saveMemo(ID2, '')).toBe(true)
    expect(calls.map((c) => [c.name, c.op, c.body, c.options])).toEqual([
      [MARKS, 'upsert', { notice_id: ID1, memo: '12월 회의 때 원장님들께 알리기', memo_at: NOW }, ON_CONFLICT],
      [MARKS, 'upsert', { notice_id: ID2, memo: '', memo_at: NOW }, ON_CONFLICT],
    ])
  })

  it('AC-7418.2: saveMemo는 checkMemo가 ok가 아니면 보내지 않고 그 결과(환자 정보 모양·길이·제어 문자)를 돌려준다', async () => {
    const calls = fakeClient(() => ({}))
    expect(await saveMemo(ID1, '010-1234-5678 환자 연락')).toEqual({ private: ['tel'] })
    expect(await saveMemo(ID1, '차트번호 12345')).toEqual({ private: ['chart'] })
    expect(await saveMemo(ID1, '가'.repeat(501))).toBe('too-long')
    expect(await saveMemo(ID1, '메모\u0007')).toBe('control')
    expect(calls).toHaveLength(0)
  })

  it('AC-7418.2: checkRules는 { notice_id, rules_checked_at: 지금 }만 upsert한다', async () => {
    const calls = fakeClient(() => ({}))
    expect(await checkRules(ID1)).toBe(true)
    expect(calls[0]).toMatchObject({ name: MARKS, op: 'upsert', options: ON_CONFLICT })
    expect(calls[0].body).toEqual({ notice_id: ID1, rules_checked_at: NOW })
  })

  it('AC-7418.2: 별표·메모·규칙 확인은 notices:changed를 알리지 않는다(읽음만 알린다)', async () => {
    const seen = watchChanged()
    fakeClient(() => ({}))
    await setStar(ID1, true)
    await saveMemo(ID1, '메모')
    await checkRules(ID1)
    expect(seen.count).toBe(0)
  })

  it('AC-7418.2: 글 id가 uuid 모양이 아니면 보내지 않고 false다', async () => {
    const seen = watchChanged()
    const calls = fakeClient(() => ({}))
    expect(await markRead('x')).toBe(false)
    expect(await setStar('', true)).toBe(false)
    expect(await saveMemo('x', '메모')).toBe(false)
    expect(await checkRules('x')).toBe(false)
    expect(calls).toHaveLength(0)
    expect(seen.count).toBe(0)
  })
})

// ── AC-7418.3 숫자 · 경고 · 출처 상태 · 채우기 · 남은 묻기 · 주간 모음 ──────

describe('AC-7418.3 unreadCount · ruleAlerts · sourceStates · fillProgress · askLeft · readWeek', () => {
  it('AC-7418.3: unreadCount는 notice_unread_count를 인자 없이 불러 그 수다', async () => {
    const calls = fakeClient(() => ({ data: 12 }))
    expect(await unreadCount()).toBe(12)
    expect(calls.map((c) => [c.kind, c.name, c.args])).toEqual([['rpc', 'notice_unread_count', undefined]])
  })

  it('AC-7418.3: unreadCount·askLeft의 답이 0 이상 정수가 아니면 failed다', async () => {
    for (const data of [null, '3', -1, 1.5, Number.NaN, {}]) {
      fakeClient(() => ({ data }))
      expect(await unreadCount()).toBe('failed')
      expect(await askLeft()).toBe('failed')
    }
  })

  it('AC-7418.3: ruleAlerts는 notice_rule_alerts 줄을 { id, noticeNo, title, ruleCount }로 바꾼다(차례 그대로, 틀린 줄은 뺀다)', async () => {
    const calls = fakeClient(() => ({
      data: [
        { id: ID1, notice_no: '2026-218', title: '도수치료 급여기준 개정', rule_count: 2 },
        { id: ID2, notice_no: null, title: '심사지침', rule_count: 1 },
        { id: ID3, notice_no: null, title: '', rule_count: 1 },
        { id: 3, notice_no: null, title: 'x', rule_count: 1 },
        { id: ID3, notice_no: null, title: 'x', rule_count: '1' },
        null,
      ],
    }))
    const expected: RuleAlert[] = [
      { id: ID1, noticeNo: '2026-218', title: '도수치료 급여기준 개정', ruleCount: 2 },
      { id: ID2, noticeNo: null, title: '심사지침', ruleCount: 1 },
    ]
    expect(await ruleAlerts()).toEqual(expected)
    expect(calls.map((c) => [c.kind, c.name, c.args])).toEqual([['rpc', 'notice_rule_alerts', undefined]])
  })

  it('AC-7418.3: sourceStates는 notice_sources의 상태 칸(쪽 표시 cursor 빼고)을 출처 칩 차례로 돌려준다', async () => {
    const calls = fakeClient(() => ({
      data: [
        { source: 'mohw_rss', state: 'ok', error_code: null, checked_at: '2026-11-20T22:05:00+00:00', last_ok_at: '2026-11-20T22:05:00+00:00', stopped_since: null, backfill_done: true },
        { source: 'hira_crtr', state: 'stopped', error_code: 'shape', checked_at: '2026-11-20T22:06:00+00:00', last_ok_at: '2026-11-18T22:06:00+00:00', stopped_since: '2026-11-19T22:06:00+00:00', backfill_done: false },
        { source: 'hira_notice', state: 'ok', error_code: null, checked_at: null, last_ok_at: null, stopped_since: null, backfill_done: false },
        { source: 'kma', state: 'ok', error_code: null, checked_at: null, last_ok_at: null, stopped_since: null, backfill_done: true },
        { source: 'hira_notice', state: 'paused', error_code: null, checked_at: null, last_ok_at: null, stopped_since: null, backfill_done: true },
      ],
    }))
    const expected: SourceView[] = [
      { source: 'hira_notice', state: 'ok', errorCode: null, checkedAt: null, lastOkAt: null, stoppedSince: null, backfillDone: false },
      { source: 'hira_crtr', state: 'stopped', errorCode: 'shape', checkedAt: '2026-11-20T22:06:00+00:00', lastOkAt: '2026-11-18T22:06:00+00:00', stoppedSince: '2026-11-19T22:06:00+00:00', backfillDone: false },
      { source: 'mohw_rss', state: 'ok', errorCode: null, checkedAt: '2026-11-20T22:05:00+00:00', lastOkAt: '2026-11-20T22:05:00+00:00', stoppedSince: null, backfillDone: true },
    ]
    expect(await sourceStates()).toEqual(expected)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'from', name: 'notice_sources', op: 'select' })
    expect(calls[0].columns?.toSorted()).toEqual(['backfill_done', 'checked_at', 'error_code', 'last_ok_at', 'source', 'state', 'stopped_since'])
  })

  it('AC-7418.3: fillProgress는 글 수 셋(전체·요약 끝(done·failed)·일괄 중(batch))을 머리만(head) 세어 돌려준다', async () => {
    const calls = fakeClient((call) => {
      const filter = call.filters[0]
      if (!filter) return { count: 1240 }
      return filter[0] === 'in' ? { count: 530 } : { count: 300 }
    })
    const expected: FillProgress = { total: 1240, done: 530, batching: 300 }
    expect(await fillProgress()).toEqual(expected)
    expect(calls).toHaveLength(3)
    for (const call of calls) {
      expect(call).toMatchObject({ kind: 'from', name: 'notices', op: 'select' })
      expect(call.selectOptions).toEqual({ count: 'exact', head: true })
    }
    expect(calls.map((c) => c.filters)).toEqual([[], [['in', 'state', ['done', 'failed']]], [['eq', 'state', 'batch']]])
  })

  it('AC-7418.3: fillProgress는 수 하나라도 없거나 틀리면 failed다', async () => {
    fakeClient((call) => (call.filters.length === 0 ? { count: 10 } : { count: null }))
    expect(await fillProgress()).toBe('failed')
  })

  it('AC-7418.3: askLeft는 notice_ask_left를 인자 없이 불러 오늘 남은 수다', async () => {
    const calls = fakeClient(() => ({ data: 17 }))
    expect(await askLeft()).toBe(17)
    expect(calls.map((c) => [c.kind, c.name, c.args])).toEqual([['rpc', 'notice_ask_left', undefined]])
  })

  const WEEK_ROW = { week_start: '2026-11-09', top3: [{ head: '도수치료 횟수', body: '12월부터 바뀌어요' }], created_at: '2026-11-15T22:10:00+00:00' }
  const WEEK_NOTICES = [
    { id: ID1, title: '도수치료 급여기준 개정', kind: 'gosi', posted_on: '2026-11-14', related: true, summary: structuredClone(SUMMARY), state: 'done', notice_posts: [{ source: 'hira_notice' }, { source: 'mohw_rss' }] },
    { id: ID2, title: '치과 급여 안내', kind: 'notice', posted_on: '2026-11-10', related: false, summary: { ...SUMMARY, related: false }, state: 'done', notice_posts: [{ source: 'hira_notice' }] },
    { id: ID3, title: '심사지침', kind: 'guide', posted_on: '2026-11-09', related: null, summary: null, state: 'wait', notice_posts: [{ source: 'hira_crtr' }, { source: 'kma' }] },
    { id: 'bad', title: null, kind: 'gosi', posted_on: '2026-11-09', related: null, summary: null, state: 'wait', notice_posts: [] },
  ]
  const WEEK: NoticeWeek = {
    weekStart: '2026-11-09',
    createdAt: '2026-11-15T22:10:00+00:00',
    top3: [{ head: '도수치료 횟수', body: '12월부터 바뀌어요' }],
    items: [
      { id: ID1, title: '도수치료 급여기준 개정', kind: 'gosi', postedOn: '2026-11-14', related: true, summary: SUMMARY, state: 'done', posts: [{ source: 'mohw_rss' }, { source: 'hira_notice' }] },
      { id: ID2, title: '치과 급여 안내', kind: 'notice', postedOn: '2026-11-10', related: false, summary: { ...SUMMARY, related: false }, state: 'done', posts: [{ source: 'hira_notice' }] },
      { id: ID3, title: '심사지침', kind: 'guide', postedOn: '2026-11-09', related: null, summary: null, state: 'wait', posts: [{ source: 'hira_crtr' }] },
    ],
  }

  function weekClient(week: unknown = WEEK_ROW) {
    return fakeClient((call) => (call.name === 'notice_weeks' ? { data: week } : { data: structuredClone(WEEK_NOTICES) }))
  }

  it("AC-7418.3: readWeek('latest')는 가장 최근 모음 하나와 그 주(월~일)에 올라온 글들(최근 글부터)이다", async () => {
    const calls = weekClient()
    expect(await readWeek('latest')).toEqual(WEEK)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ kind: 'from', name: 'notice_weeks', op: 'select', maybeSingle: true, limit: 1, filters: [] })
    expect(calls[0].columns?.toSorted()).toEqual(['created_at', 'top3', 'week_start'])
    expect(calls[0].orders).toEqual([['week_start', { ascending: false }]])
    expect(calls[1]).toMatchObject({ kind: 'from', name: 'notices', op: 'select' })
    expect(calls[1].columns).toEqual(['id', 'title', 'kind', 'posted_on', 'related', 'summary', 'state', 'notice_posts(source)'])
    expect(calls[1].filters).toEqual([
      ['gte', 'posted_on', '2026-11-09'],
      ['lte', 'posted_on', '2026-11-15'],
    ])
    expect(calls[1].orders[0]).toEqual(['posted_on', { ascending: false }])
  })

  it('AC-7418.3: readWeek(월요일)은 그 주 모음을 week_start로 고른다', async () => {
    const calls = weekClient()
    expect(await readWeek('2026-11-09')).toEqual(WEEK)
    expect(calls[0]).toMatchObject({ name: 'notice_weeks', maybeSingle: true, filters: [['eq', 'week_start', '2026-11-09']] })
  })

  it('AC-7418.3: readWeek는 모음이 없으면 null이고 글을 읽지 않는다. 월요일이 아닌 날·날짜 모양이 아니면 부르지 않고 null이다', async () => {
    const calls = weekClient(null)
    expect(await readWeek('latest')).toBeNull()
    expect(calls.map((c) => c.name)).toEqual(['notice_weeks'])
    const none = weekClient()
    expect(await readWeek('2026-11-10')).toBeNull()
    expect(await readWeek('2026-13-02')).toBeNull()
    expect(await readWeek('x')).toBeNull()
    expect(none).toHaveLength(0)
  })

  it('AC-7418.3: readWeek의 꼭 알 것은 { head, body } 글인 것만 3개까지다', async () => {
    weekClient({ ...WEEK_ROW, top3: [{ head: '하나', body: '1' }, { head: 2, body: 'x' }, null, { head: '둘', body: '2' }, { head: '셋', body: '3' }, { head: '넷', body: '4' }] })
    const week = await readWeek('latest')
    if (week === null || week === 'failed') throw new Error('모음을 읽어야 한다')
    expect(week.top3).toEqual([
      { head: '하나', body: '1' },
      { head: '둘', body: '2' },
      { head: '셋', body: '3' },
    ])
  })

  it('AC-7418.3: readWeek는 모음 줄 모양이 틀리거나 글 목록이 목록이 아니면 failed다', async () => {
    weekClient({ week_start: 20261109, top3: [], created_at: 'x' })
    expect(await readWeek('latest')).toBe('failed')
    fakeClient((call) => (call.name === 'notice_weeks' ? { data: WEEK_ROW } : { data: null }))
    expect(await readWeek('latest')).toBe('failed')
  })
})

// ── AC-7424.7 내 낱말 ──────────────────────────────────────

describe('AC-7424.7 readKeywords · addKeyword · removeKeyword', () => {
  it('AC-7424.7: readKeywords는 notice_keywords의 word를 넣은 차례(created_at, 같으면 word_norm)로 돌려준다', async () => {
    const calls = fakeClient(() => ({ data: [{ word: '도수치료' }, { word: 'MRI' }, { word: 3 }, null, { word: '관절강내 주사' }] }))
    expect(await readKeywords()).toEqual(['도수치료', 'MRI', '관절강내 주사'])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'from', name: 'notice_keywords', op: 'select', columns: ['word'] })
    expect(calls[0].orders).toEqual([
      ['created_at', { ascending: true }],
      ['word_norm', { ascending: true }],
    ])
  })

  it('AC-7424.7: readKeywords는 답이 목록이 아니면(빈 목록으로 보이지 않게) failed다', async () => {
    fakeClient(() => ({ data: null }))
    expect(await readKeywords()).toBe('failed')
  })

  it('AC-7424.7: addKeyword는 { word } 하나만 넣고(병원 id 없음) true, 그 뒤 notices:changed를 알린다', async () => {
    const seen = watchChanged()
    const calls = fakeClient(() => ({}))
    expect(await addKeyword('체외충격파')).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'from', name: 'notice_keywords', op: 'insert' })
    expect(calls[0].body).toEqual({ word: '체외충격파' })
    expect(seen.count).toBe(1)
  })

  it('AC-7424.7: addKeyword가 거부되면(겹침 23505·31번째·제약) false이고 알리지 않는다', async () => {
    const seen = watchChanged()
    for (const code of ['23505', '23514', 'P0001']) {
      fakeClient(() => ({ error: { ...RAW_ERROR, code } }))
      expect(await addKeyword('도수치료')).toBe(false)
    }
    expect(seen.count).toBe(0)
  })

  it('AC-7424.7: removeKeyword는 그 word 줄을 지우고 true, 그 뒤 notices:changed를 알린다', async () => {
    const seen = watchChanged()
    const calls = fakeClient(() => ({}))
    expect(await removeKeyword('관절강내 주사')).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'from', name: 'notice_keywords', op: 'delete', filters: [['eq', 'word', '관절강내 주사']] })
    expect(seen.count).toBe(1)
  })
})

// ── AC-7418.4 · AC-7424.7 실패 ─────────────────────────────

describe('AC-7418.4 읽기 실패는 failed, 쓰기 실패는 false(오류 글은 밖에 내지 않는다)', () => {
  const READS: [string, () => Promise<unknown>][] = [
    ['listNotices', () => listNotices(FILTER)],
    ['listNotices(찾기)', () => listNotices({ ...FILTER, q: '도수' })],
    ['openNotice', () => openNotice(ID1)],
    ['unreadCount', () => unreadCount()],
    ['ruleAlerts', () => ruleAlerts()],
    ['sourceStates', () => sourceStates()],
    ['fillProgress', () => fillProgress()],
    ['askLeft', () => askLeft()],
    ['readWeek', () => readWeek('latest')],
    ['readWeek(월요일)', () => readWeek('2026-11-09')],
    ['readKeywords', () => readKeywords()],
  ]
  const WRITES: [string, () => Promise<unknown>][] = [
    ['markRead', () => markRead(ID1)],
    ['setStar', () => setStar(ID1, true)],
    ['saveMemo', () => saveMemo(ID1, '메모')],
    ['checkRules', () => checkRules(ID1)],
    ['addKeyword', () => addKeyword('도수치료')],
    ['removeKeyword', () => removeKeyword('도수치료')],
  ]

  for (const [failure, arrange] of FAILURES) {
    for (const [name, run] of READS) {
      it(`AC-7418.4: ${name} — ${failure}면 'failed'이고 오류 글·console이 없다`, async () => {
        arrange()
        const result = await run()
        expect(result).toBe('failed')
        expectNoConsole()
      })
    }
    for (const [name, run] of WRITES) {
      it(`AC-7418.4 AC-7424.7: ${name} — ${failure}면 false이고 알리지 않으며 오류 글·console이 없다`, async () => {
        const seen = watchChanged()
        arrange()
        expect(await run()).toBe(false)
        expect(seen.count).toBe(0)
        expectNoConsole()
      })
    }
  }

  it('AC-7418.4: 목록 답 모양이 틀리면(쪽이 객체가 아님·rows가 목록이 아님·수가 숫자가 아님) failed다', async () => {
    for (const data of [null, [], 'x', { total: 1, unread: 0 }, { total: '1', unread: 0, rows: [] }, { total: 1, unread: null, rows: [] }]) {
      fakeClient(() => ({ data }))
      expect(await listNotices(FILTER)).toBe('failed')
      expect(await openNotice(ID1)).toBe('failed')
    }
  })

  it('AC-7418.4: 찾기 답이 목록이 아니면 failed이고 notice_list를 부르지 않는다', async () => {
    const calls = fakeClient((call) => (call.name === 'notice_search' ? { data: { id: ID1 } } : { data: page([]) }))
    expect(await listNotices({ ...FILTER, q: '도수' })).toBe('failed')
    expect(calls.map((c) => c.name)).toEqual(['notice_search'])
  })

  it('AC-7418.4: 경고·출처 상태 답이 목록이 아니면 failed다', async () => {
    fakeClient(() => ({ data: { id: ID1 } }))
    expect(await ruleAlerts()).toBe('failed')
    expect(await sourceStates()).toBe('failed')
  })
})

// ── 공용 타입(이 TASK가 types/notices.ts를 맡는다) ─────────────

describe('AC-7414.8 공용 타입 CollectorStore.weekPending (기본값 22)', () => {
  // 타입은 시험이 돌 때 사라지므로 선언 글자를 본다. 모양이 맞는지는 tsc가, 동작은 collectStore·collector 시험이 증명한다
  it('AC-7414.8: CollectorStore에 weekPending(weekStart: string): Promise<boolean>이 weekExists 바로 뒤에 있다', () => {
    const source = readFileSync(fileURLToPath(new URL('../../types/notices.ts', import.meta.url)), 'utf-8')
    const body = /export interface CollectorStore \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
    expect(body).toMatch(/weekExists\(weekStart: string\): Promise<boolean>\n\s*weekPending\(weekStart: string\): Promise<boolean>\n/)
  })
})
