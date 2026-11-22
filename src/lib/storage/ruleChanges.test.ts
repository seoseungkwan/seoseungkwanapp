// 점검 규칙 저절로 바꾸기 — 화면 읽기·쓰기(specs/rule-auto TASK-6, REQ-7812). 실제 Supabase에 붙지 않는다.
// notices.test.ts와 같은 흉내: 가짜 클라이언트가 어느 표·함수에 어떤 칸·몸통·거르기가 나갔는지 적어 둔다.
// 표 권한·RLS·함수 동작은 supabase/ruleAuto.rls.test.ts가 증명한다. 글·id·규칙은 모두 지어낸 값이다
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuleHit } from '@/types/notices'
import type { RuleUpdate } from '@/types/precheck'
import type { NoticeRuleView, RuleBadge, RuleChangeAlert } from '@/types/ruleAuto'
import { NOTICES_CHANGED } from './notices'
import { readNoticeRules, readRuleBadges, readRuleUpdates, ruleChangeAlerts, seeRuleChanges, setRuleReverted } from './ruleChanges'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const RAW_ERROR = { code: '42501', message: `permission denied (${SECRET})`, details: SECRET, hint: SECRET }
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const
// 한국 날짜는 2026-11-21(새벽 1시 30분), UTC 날짜는 2026-11-20이다 — 오늘을 한국 날짜로 고르는지 본다
const NOW = '2026-11-20T16:30:00.000Z'

const NOTICE = '44444444-4444-4444-8444-444444444444'
const NOTICE2 = '55555555-5555-4555-8555-555555555555'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [C1, C2, C3, C4, C5, C6, C7, C8] = [1, 2, 3, 4, 5, 6, 7, 8].map(uuid)

type Call = {
  kind: 'from' | 'rpc'
  name: string
  args?: unknown
  op?: 'select' | 'upsert'
  columns?: string[]
  body?: unknown
  options?: unknown
  filters: [string, string, unknown][]
  orders: [string, { ascending?: boolean } | undefined][]
  limit?: number
}
type Reply = { data?: unknown; error?: unknown }

/** 부른 표·함수·칸·몸통·거르기를 적는 가짜 클라이언트. 브라우저 클라이언트 자리에도 둔다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Call) => Reply = () => ({ data: [] })) {
  const calls: Call[] = []
  const builderOf = (call: Call) => {
    const builder = {
      select(columns: string) {
        call.op ??= 'select'
        call.columns = columns.split(',').map((column) => column.trim())
        return builder
      },
      upsert(body: unknown, options?: unknown) {
        call.op = 'upsert'
        call.body = body
        call.options = options
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
      order(column: string, options?: { ascending?: boolean }) {
        call.orders.push([column, options])
        return builder
      },
      limit(count: number) {
        call.limit = count
        return builder
      },
      then(ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) {
        return Promise.resolve()
          .then(() => reply(call))
          .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null }))
          .then(ok, bad)
      },
    }
    return builder
  }
  const client = {
    from(name: string) {
      const call: Call = { kind: 'from', name, filters: [], orders: [] }
      calls.push(call)
      return builderOf(call)
    },
    rpc(name: string, args?: unknown) {
      const call: Call = { kind: 'rpc', name, args, filters: [], orders: [] }
      calls.push(call)
      return builderOf(call)
    },
  }
  supabaseBrowser.mockReturnValue(client)
  return { client: client as unknown as SupabaseClient, calls }
}

/** 표 이름마다 답을 정한다(없는 표는 빈 목록) */
const byTable =
  (replies: Record<string, Reply>) =>
  (call: Call): Reply =>
    replies[call.name] ?? { data: [] }

function watchChanged() {
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  const seen = { count: 0 }
  target.addEventListener(NOTICES_CHANGED, () => {
    seen.count += 1
  })
  return seen
}

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

const ruleOf = (id: string, from: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `${id} 새 제목`,
  message: '고시가 바꾼 기준이에요',
  params: { max: 3 },
  effective_from: from,
  effective_to: null,
  ...over,
})

// ── AC-7812.1 readRuleUpdates ─────────────────────────────

describe('AC-7812.1 readRuleUpdates', () => {
  const changeRow = (id: string, ruleId: string, from: string, over: Record<string, unknown> = {}) => ({
    id,
    rule_id: ruleId,
    effective_from: from,
    base_version: '2026-10-19',
    rule: ruleOf(ruleId, from),
    ...over,
  })
  const ROWS = [changeRow(C1, 'MT-03', '2026-11-01'), changeRow(C2, 'IN-12', '2026-11-15'), changeRow(C3, 'MT-03', '2026-12-01')]
  const update = (row: ReturnType<typeof changeRow>): RuleUpdate => ({
    changeId: row.id,
    ruleId: row.rule_id,
    from: row.effective_from,
    baseVersion: row.base_version,
    rule: row.rule,
  })

  it('AC-7812.1: 받은 클라이언트로 live change 줄을 시행일·만든 때 차례로 201개까지 읽고, 내 병원이 되돌린 판을 빼 RuleUpdate로 돌려준다', async () => {
    const { client, calls } = fakeClient(byTable({ rule_changes: { data: structuredClone(ROWS) }, rule_change_marks: { data: [{ change_id: C2 }] } }))
    supabaseBrowser.mockClear()
    const result = await readRuleUpdates(client)
    expect(result).toEqual([update(ROWS[0]), update(ROWS[2])])
    expect(supabaseBrowser).not.toHaveBeenCalled()
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ kind: 'from', name: 'rule_changes', op: 'select', limit: 201 })
    expect(calls[0].columns?.toSorted()).toEqual(['base_version', 'effective_from', 'id', 'rule', 'rule_id'])
    expect(calls[0].filters).toEqual([
      ['eq', 'verdict', 'change'],
      ['eq', 'state', 'live'],
    ])
    expect(calls[0].orders).toEqual([
      ['effective_from', { ascending: true }],
      ['created_at', { ascending: true }],
    ])
    expect(calls[1]).toMatchObject({ kind: 'from', name: 'rule_change_marks', op: 'select', columns: ['change_id'] })
    expect(calls[1].filters).toEqual([['eq', 'reverted', true]])
  })

  it('AC-7812.1: live change 줄이 없으면 빈 목록이고 내 표시를 읽지 않는다', async () => {
    const { client, calls } = fakeClient(byTable({ rule_changes: { data: [] } }))
    expect(await readRuleUpdates(client)).toEqual([])
    expect(calls.map((c) => c.name)).toEqual(['rule_changes'])
  })

  it('AC-7812.1: 칸이 틀린 줄(id·규칙 번호·날짜·판·규칙)은 빼고 정해 둔 다섯 칸만 담는다', async () => {
    const bad = [
      changeRow('x', 'MT-03', '2026-11-01'),
      changeRow(C4, '', '2026-11-01'),
      changeRow(C5, 'MT-03', 'soon'),
      changeRow(C6, 'MT-03', '2026-11-01', { base_version: '' }),
      changeRow(C7, 'MT-03', '2026-11-01', { rule: null }),
      null,
      'row',
    ]
    const good = changeRow(C1, 'MT-03', '2026-11-01', { hospital_id: SECRET, why: SECRET })
    const { client } = fakeClient(byTable({ rule_changes: { data: [...bad, good] } }))
    const result = await readRuleUpdates(client)
    expect(result).toEqual([update(changeRow(C1, 'MT-03', '2026-11-01'))])
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('AC-7812.1: 200개는 돌려주고 201개면 던진다(청구 화면이 사본으로 점검)', async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => changeRow(uuid(100 + i), 'MT-03', '2026-11-01'))
    const two = fakeClient(byTable({ rule_changes: { data: many(200) } }))
    expect(await readRuleUpdates(two.client)).toHaveLength(200)
    const over = fakeClient(byTable({ rule_changes: { data: many(201) } }))
    await expect(readRuleUpdates(over.client)).rejects.toThrow()
  })

  it('AC-7812.1: 돌려줄 목록의 JSON이 600,000바이트(UTF-8)를 넘으면 던진다 — 글자 수가 아니라 바이트로 잰다', async () => {
    // '가'는 3바이트: 200,001자 = 600,003바이트(글자 수로는 600,000보다 한참 적다)
    const big = changeRow(C1, 'MT-03', '2026-11-01', { rule: ruleOf('MT-03', '2026-11-01', { message: '가'.repeat(200_001) }) })
    const { client } = fakeClient(byTable({ rule_changes: { data: [big] } }))
    await expect(readRuleUpdates(client)).rejects.toThrow()
  })

  it('AC-7812.1: 크기는 되돌린 판을 뺀 뒤 잰다(빼고 나서 600,000바이트 안이면 돌려준다)', async () => {
    const half = (id: string, ruleId: string) =>
      changeRow(id, ruleId, '2026-11-01', { rule: ruleOf(ruleId, '2026-11-01', { message: '가'.repeat(110_000) }) })
    const rows = [half(C1, 'MT-03'), half(C2, 'IN-12')]
    const both = fakeClient(byTable({ rule_changes: { data: structuredClone(rows) } }))
    await expect(readRuleUpdates(both.client)).rejects.toThrow()
    const one = fakeClient(byTable({ rule_changes: { data: structuredClone(rows) }, rule_change_marks: { data: [{ change_id: C2 }] } }))
    const result = await readRuleUpdates(one.client)
    expect(result.map((u) => u.changeId)).toEqual([C1])
  })

  const THROWS: [string, (call: Call) => Reply][] = [
    ['판 읽기 오류 답', byTable({ rule_changes: { error: RAW_ERROR } })],
    ['판 답이 목록이 아님', byTable({ rule_changes: { data: { id: C1 } } })],
    ['내 표시 읽기 오류 답', byTable({ rule_changes: { data: ROWS }, rule_change_marks: { error: RAW_ERROR } })],
    ['내 표시 답이 목록이 아님', byTable({ rule_changes: { data: ROWS }, rule_change_marks: { data: null } })],
    ['내 표시가 한 번 읽기 상한(1000줄)만큼 꽉 차게 옴', byTable({ rule_changes: { data: ROWS }, rule_change_marks: { data: Array.from({ length: 1000 }, (_, i) => ({ change_id: uuid(5000 + i) })) } })],
    [
      '보내다 예외(네트워크)',
      () => {
        throw new Error(SECRET)
      },
    ],
  ]
  for (const [name, reply] of THROWS) {
    it(`AC-7812.1: ${name}면 던지고, 던진 오류에 서버 글이 없으며 console이 없다`, async () => {
      const { client } = fakeClient(reply)
      const error = await readRuleUpdates(client).then(
        () => null,
        (e: unknown) => e,
      )
      expect(error).toBeInstanceOf(Error)
      expect(String((error as Error).message)).not.toContain(SECRET)
      expectNoConsole()
    })
  }
})

// ── AC-7812.2 readNoticeRules ─────────────────────────────

describe('AC-7812.2 readNoticeRules', () => {
  const HITS: RuleHit[] = [
    { id: 'MT-03', title: '도수치료 횟수' },
    { id: 'IN-12', title: '주사 간격' },
    { id: 'DX-02', title: '상병 확인' },
    { id: 'LA-05', title: '검사 주기' },
    { id: 'PT-07', title: '물리치료 묶음' },
  ]
  const judged = (id: string, ruleId: unknown, verdict: string, over: Record<string, unknown> = {}) => ({
    id,
    rule_id: ruleId,
    verdict,
    why: `${ruleId} 까닭`,
    before_text: '',
    after_text: '',
    effective_from: null,
    title: null,
    state: 'live',
    ...over,
  })
  const ROWS = [
    judged(C5, 'XR-01', 'same'), // ruleHits에 없는 규칙(글의 연결이 뒤에 바뀜) — 제목은 규칙 번호
    judged(C3, 'DX-02', 'none'),
    judged(C1, 'MT-03', 'change', { before_text: '주 2회', after_text: '주 3회', effective_from: '2026-12-01', title: '도수치료 주 3회' }),
    judged(C4, 'LA-05', 'change', { effective_from: '2026-11-01', title: '검사 주기 새 판', state: 'old' }), // old만 있음 → 어디에도 없음
    judged(C2, 'IN-12', 'human', { why: 'AI가 이 규칙을 살펴보지 못했어요. 직접 확인해 주세요.' }),
  ]
  const MARK_C1 = { change_id: C1, seen_at: '2026-11-20T03:00:00+00:00', reverted: true, reverted_at: '2026-11-20T05:00:00+00:00' }

  it('AC-7812.2: 그 글의 판정 줄(모든 state)과 live change 줄의 내 표시를 읽어 live 줄은 RuleCheckView, 판정 줄이 없는 규칙은 pending으로 준다', async () => {
    const { calls } = fakeClient(byTable({ rule_changes: { data: structuredClone(ROWS) }, rule_change_marks: { data: [MARK_C1] } }))
    const expected: NoticeRuleView = {
      rows: [
        {
          changeId: C1,
          ruleId: 'MT-03',
          verdict: 'change',
          why: 'MT-03 까닭',
          before: '주 2회',
          after: '주 3회',
          from: '2026-12-01',
          title: '도수치료 주 3회',
          seen: true,
          reverted: true,
          revertedAt: '2026-11-20T05:00:00+00:00',
        },
        {
          changeId: C2,
          ruleId: 'IN-12',
          verdict: 'human',
          why: 'AI가 이 규칙을 살펴보지 못했어요. 직접 확인해 주세요.',
          before: '',
          after: '',
          from: null,
          title: '주사 간격',
          seen: false,
          reverted: false,
          revertedAt: null,
        },
        { changeId: C3, ruleId: 'DX-02', verdict: 'none', why: 'DX-02 까닭', before: '', after: '', from: null, title: '상병 확인', seen: false, reverted: false, revertedAt: null },
        { changeId: C5, ruleId: 'XR-01', verdict: 'same', why: 'XR-01 까닭', before: '', after: '', from: null, title: 'XR-01', seen: false, reverted: false, revertedAt: null },
      ],
      pending: [{ id: 'PT-07', title: '물리치료 묶음' }],
    }
    expect(await readNoticeRules(NOTICE, HITS)).toEqual(expected)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ kind: 'from', name: 'rule_changes', op: 'select', filters: [['eq', 'notice_id', NOTICE]] })
    expect(calls[0].columns?.toSorted()).toEqual(['after_text', 'before_text', 'effective_from', 'id', 'rule_id', 'state', 'title:rule->>title', 'verdict', 'why'])
    expect(calls[1]).toMatchObject({ kind: 'from', name: 'rule_change_marks', op: 'select', filters: [['in', 'change_id', [C1]]] })
    expect(calls[1].columns?.toSorted()).toEqual(['change_id', 'reverted', 'reverted_at', 'seen_at'])
  })

  it('AC-7812.2: 내 표시가 없는 change 줄은 안 봄·되돌리지 않음이고, 새 규칙 제목이 없으면 ruleHits의 제목이다', async () => {
    const row = judged(C1, 'MT-03', 'change', { effective_from: '2026-12-01', title: null, before_text: '주 2회', after_text: '주 3회' })
    fakeClient(byTable({ rule_changes: { data: [row] }, rule_change_marks: { data: [] } }))
    const result = await readNoticeRules(NOTICE, HITS.slice(0, 1))
    expect(result).toEqual({
      rows: [{ changeId: C1, ruleId: 'MT-03', verdict: 'change', why: 'MT-03 까닭', before: '주 2회', after: '주 3회', from: '2026-12-01', title: '도수치료 횟수', seen: false, reverted: false, revertedAt: null }],
      pending: [],
    })
  })

  it('AC-7812.2: live change 줄이 없으면 내 표시를 읽지 않고, 판정 줄이 하나도 없으면 ruleHits 모두가 pending이다', async () => {
    const some = fakeClient(byTable({ rule_changes: { data: [judged(C2, 'IN-12', 'human'), judged(C4, 'LA-05', 'change', { effective_from: '2026-11-01', state: 'old' })] } }))
    const result = await readNoticeRules(NOTICE, HITS)
    if (result === 'failed') throw new Error('읽어야 한다')
    expect(result.rows.map((r) => r.ruleId)).toEqual(['IN-12'])
    expect(result.pending.map((h) => h.id)).toEqual(['MT-03', 'DX-02', 'PT-07'])
    expect(some.calls.map((c) => c.name)).toEqual(['rule_changes'])
    fakeClient(byTable({ rule_changes: { data: [] } }))
    expect(await readNoticeRules(NOTICE, HITS)).toEqual({ rows: [], pending: HITS })
  })

  it('AC-7812.2: 칸이 틀린 줄(id·규칙 번호·판정·state·change의 날짜)은 빼고, 글 칸이 글이 아니면 빈 글자다', async () => {
    const rows = [
      judged('x', 'MT-03', 'none'),
      judged(C6, 3, 'none'),
      judged(C7, 'MT-03', 'maybe'),
      judged(C8, 'MT-03', 'none', { state: 'gone' }),
      judged(uuid(9), 'MT-03', 'change', { effective_from: null }),
      null,
      judged(C2, 'IN-12', 'human', { why: null, before_text: 5, after_text: undefined, hospital_id: SECRET }),
    ]
    fakeClient(byTable({ rule_changes: { data: rows } }))
    const result = await readNoticeRules(NOTICE, HITS.slice(0, 2))
    expect(result).toEqual({
      rows: [{ changeId: C2, ruleId: 'IN-12', verdict: 'human', why: '', before: '', after: '', from: null, title: '주사 간격', seen: false, reverted: false, revertedAt: null }],
      pending: [{ id: 'MT-03', title: '도수치료 횟수' }],
    })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it("AC-7812.2: 글 id가 uuid 모양이 아니면 부르지 않고 'failed'다", async () => {
    const { calls } = fakeClient()
    expect(await readNoticeRules('not-a-uuid', HITS)).toBe('failed')
    expect(calls).toHaveLength(0)
  })

  const FAILS: [string, () => void][] = [
    ['판정 줄 오류 답', () => fakeClient(byTable({ rule_changes: { error: RAW_ERROR } }))],
    ['판정 줄 답이 목록이 아님', () => fakeClient(byTable({ rule_changes: { data: { id: C1 } } }))],
    ['내 표시 오류 답', () => fakeClient(byTable({ rule_changes: { data: ROWS }, rule_change_marks: { error: RAW_ERROR } }))],
    ['내 표시 답이 목록이 아님', () => fakeClient(byTable({ rule_changes: { data: ROWS }, rule_change_marks: { data: 'x' } }))],
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
  for (const [name, arrange] of FAILS) {
    it(`AC-7812.2: ${name}면 'failed'이고 console이 없다`, async () => {
      arrange()
      expect(await readNoticeRules(NOTICE, HITS)).toBe('failed')
      expectNoConsole()
    })
  }
})

// ── AC-7812.3 setRuleReverted · seeRuleChanges ──────────────────

describe('AC-7812.3 setRuleReverted · seeRuleChanges', () => {
  const ON_CONFLICT = { onConflict: 'hospital_id,change_id' }

  it('AC-7812.3: setRuleReverted는 rule_change_marks에 { change_id, reverted }만 upsert하고(hospital_id 없음) true, 그 뒤 notices:changed를 한 번 알린다', async () => {
    const seen = watchChanged()
    const { calls } = fakeClient(() => ({}))
    expect(await setRuleReverted(C1, true)).toBe(true)
    expect(seen.count).toBe(1)
    expect(await setRuleReverted(C2, false)).toBe(true)
    expect(seen.count).toBe(2)
    expect(calls.map((c) => [c.kind, c.name, c.op, c.body, c.options])).toEqual([
      ['from', 'rule_change_marks', 'upsert', { change_id: C1, reverted: true }, ON_CONFLICT],
      ['from', 'rule_change_marks', 'upsert', { change_id: C2, reverted: false }, ON_CONFLICT],
    ])
  })

  it('AC-7812.3: seeRuleChanges는 see_rule_changes를 { p_notice: 글 id }로 불러 true, 그 뒤 notices:changed를 한 번 알린다', async () => {
    const seen = watchChanged()
    const { calls } = fakeClient(() => ({ data: 2 }))
    expect(await seeRuleChanges(NOTICE)).toBe(true)
    expect(calls.map((c) => [c.kind, c.name, c.args])).toEqual([['rpc', 'see_rule_changes', { p_notice: NOTICE }]])
    expect(seen.count).toBe(1)
  })

  it('AC-7812.3: id가 uuid 모양이 아니면 보내지 않고 false이며 알리지 않는다', async () => {
    const seen = watchChanged()
    const { calls } = fakeClient(() => ({}))
    expect(await setRuleReverted('x', true)).toBe(false)
    expect(await seeRuleChanges('')).toBe(false)
    expect(calls).toHaveLength(0)
    expect(seen.count).toBe(0)
  })

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
  const WRITES: [string, () => Promise<boolean>][] = [
    ['setRuleReverted', () => setRuleReverted(C1, true)],
    ['seeRuleChanges', () => seeRuleChanges(NOTICE)],
  ]
  for (const [failure, arrange] of FAILURES) {
    for (const [name, run] of WRITES) {
      it(`AC-7812.3: ${name} — ${failure}면 false이고(오류 글 없음) 알리지 않으며 console이 없다`, async () => {
        const seen = watchChanged()
        arrange()
        expect(await run()).toBe(false)
        expect(seen.count).toBe(0)
        expectNoConsole()
      })
    }
  }
})

// ── AC-7812.4 ruleChangeAlerts · readRuleBadges ─────────────────

describe('AC-7812.4 ruleChangeAlerts', () => {
  it('AC-7812.4: rule_change_alerts를 인자 없이 불러 줄을 { id, noticeNo, title, changeCount }로 바꾼다(차례 그대로, 틀린 줄은 뺀다)', async () => {
    const { calls } = fakeClient(() => ({
      data: [
        { id: NOTICE, notice_no: '2026-218', title: '도수치료 급여기준 개정', change_count: 2 },
        { id: NOTICE2, notice_no: null, title: '주사 심사지침', change_count: 1 },
        { id: NOTICE2, notice_no: null, title: '', change_count: 1 },
        { id: 3, notice_no: null, title: 'x', change_count: 1 },
        { id: NOTICE2, notice_no: null, title: 'x', change_count: '1' },
        null,
      ],
    }))
    const expected: RuleChangeAlert[] = [
      { id: NOTICE, noticeNo: '2026-218', title: '도수치료 급여기준 개정', changeCount: 2 },
      { id: NOTICE2, noticeNo: null, title: '주사 심사지침', changeCount: 1 },
    ]
    expect(await ruleChangeAlerts()).toEqual(expected)
    expect(calls.map((c) => [c.kind, c.name, c.args])).toEqual([['rpc', 'rule_change_alerts', undefined]])
  })

  const FAILS: [string, () => void][] = [
    ['오류 답', () => fakeClient(() => ({ error: RAW_ERROR }))],
    ['답이 목록이 아님', () => fakeClient(() => ({ data: { id: NOTICE } }))],
    [
      '보내다 예외(네트워크)',
      () =>
        fakeClient(() => {
          throw new Error(SECRET)
        }),
    ],
  ]
  for (const [name, arrange] of FAILS) {
    it(`AC-7812.4: ruleChangeAlerts — ${name}면 'failed'이고 console이 없다`, async () => {
      arrange()
      expect(await ruleChangeAlerts()).toBe('failed')
      expectNoConsole()
    })
  }
})

describe('AC-7812.4 readRuleBadges (기본값 12)', () => {
  const basisOf = (number: string) => [{ doc: '보건복지부 고시', number, effective: '2026-11-21' }]
  const version = (id: string, ruleId: string, from: string, over: Record<string, unknown> = {}) => ({
    id,
    rule_id: ruleId,
    effective_from: from,
    title: `${ruleId} ${from} 제목`,
    basis: basisOf(`${ruleId}-${from}`),
    ...over,
  })
  const VERSIONS = [
    // MT-03: 오늘(한국 날짜 11-21) 판 + 아직 안 온 판 → 칩 날짜는 늦은 판, 제목·근거는 오늘 판
    version(C1, 'MT-03', '2026-11-21'),
    version(C2, 'MT-03', '2026-12-01'),
    // IN-12: 아직 날짜가 안 온 판뿐 → 제목·근거 없음(원래 제목)
    version(C3, 'IN-12', '2026-12-15'),
    // DX-02: 늦은 판을 되돌림 → 칩 날짜·제목은 남은 판
    version(C4, 'DX-02', '2026-11-01', { basis: [{ doc: '고시', number: '2025-1' }, { doc: 3 }, null, { doc: '고시', number: '2025-2', url: 5 }] }),
    version(C5, 'DX-02', '2026-11-10'),
    // LA-05: 모두 되돌림 → 되돌림 칩, 날짜는 가장 늦은 판
    version(C6, 'LA-05', '2026-11-05'),
    version(C7, 'LA-05', '2026-11-12'),
    // PT-07: 오늘 판의 제목·근거 칸이 틀림 → 없음
    version(C8, 'PT-07', '2026-11-03', { title: null, basis: 'x' }),
  ]
  const REVERTED = [{ change_id: C5 }, { change_id: C6 }, { change_id: C7 }]

  it('AC-7812.4: live change 줄과 내가 되돌린 표시를 읽어 규칙 id마다 { from, title, basis, reverted }를 준다(오늘은 한국 날짜)', async () => {
    const { calls } = fakeClient(byTable({ rule_changes: { data: structuredClone(VERSIONS) }, rule_change_marks: { data: REVERTED } }))
    const result = await readRuleBadges()
    if (result === 'failed') throw new Error('읽어야 한다')
    const expected: [string, RuleBadge][] = [
      ['MT-03', { from: '2026-12-01', title: 'MT-03 2026-11-21 제목', basis: basisOf('MT-03-2026-11-21'), reverted: false }],
      ['IN-12', { from: '2026-12-15', title: null, basis: null, reverted: false }],
      [
        'DX-02',
        {
          from: '2026-11-01',
          title: 'DX-02 2026-11-01 제목',
          basis: [
            { doc: '고시', number: '2025-1' },
            { doc: '고시', number: '2025-2' },
          ],
          reverted: false,
        },
      ],
      ['LA-05', { from: '2026-11-12', title: null, basis: null, reverted: true }],
      ['PT-07', { from: '2026-11-03', title: null, basis: null, reverted: false }],
    ]
    expect(new Map(result)).toEqual(new Map(expected))
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ kind: 'from', name: 'rule_changes', op: 'select' })
    expect(calls[0].columns?.toSorted()).toEqual(['basis:rule->basis', 'effective_from', 'id', 'rule_id', 'title:rule->>title'])
    expect(calls[0].filters).toEqual([
      ['eq', 'verdict', 'change'],
      ['eq', 'state', 'live'],
    ])
    expect(calls[1]).toMatchObject({ kind: 'from', name: 'rule_change_marks', op: 'select', columns: ['change_id'], filters: [['eq', 'reverted', true]] })
  })

  it('AC-7812.4: 바뀐 판이 없으면 빈 모음이고 내 표시를 읽지 않는다. 칸이 틀린 줄은 뺀다', async () => {
    const { calls } = fakeClient(byTable({ rule_changes: { data: [] } }))
    expect((await readRuleBadges()) as Map<string, RuleBadge>).toEqual(new Map())
    expect(calls.map((c) => c.name)).toEqual(['rule_changes'])
    fakeClient(byTable({ rule_changes: { data: [version('x', 'MT-03', '2026-11-01'), version(C1, '', '2026-11-01'), version(C2, 'MT-03', 'soon'), null] } }))
    expect((await readRuleBadges()) as Map<string, RuleBadge>).toEqual(new Map())
  })

  const FAILS: [string, () => void][] = [
    ['판 읽기 오류 답', () => fakeClient(byTable({ rule_changes: { error: RAW_ERROR } }))],
    ['판 답이 목록이 아님', () => fakeClient(byTable({ rule_changes: { data: null } }))],
    ['판이 한 번 읽기 상한(1000줄)만큼 꽉 차게 옴', () => fakeClient(byTable({ rule_changes: { data: Array.from({ length: 1000 }, (_, i) => version(uuid(100 + i), 'MT-03', '2026-11-01')) } }))],
    ['내 표시 오류 답', () => fakeClient(byTable({ rule_changes: { data: VERSIONS }, rule_change_marks: { error: RAW_ERROR } }))],
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
  for (const [name, arrange] of FAILS) {
    it(`AC-7812.4: readRuleBadges — ${name}면 'failed'이고 console이 없다`, async () => {
      arrange()
      expect(await readRuleBadges()).toBe('failed')
      expectNoConsole()
    })
  }
})
