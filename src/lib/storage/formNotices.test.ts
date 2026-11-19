// 서식 탭 휴진 안내문 읽기·저장(spec forms TASK-9, REQ-3507 · AC-3507.1·3507.2·3507.6·3507.7,
// 글자 색 accent는 spec forms-accent TASK-2 · AC-4703.1·AC-4703.3, 글씨·로고 여섯 칸은 spec form-style TASK-5 · AC-6806.2). 실제 Supabase에 붙지 않는다.
// 가짜 클라이언트가 어느 표에 어떤 칸·몸통·거르기가 나갔는지 적어 둔다. 표 권한·RLS는 supabase/formNotices.rls.test.ts가 증명한다.
// 이름·날짜·id는 모두 지어낸 값이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STYLE, type FormStyle } from '@/lib/forms/style'
import type { ClosureNotice, NoticeCard, SavedNotice } from '@/types/forms'
import { deleteNotice, insertNotice, listNotices, updateNotice } from './formNotices'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const TABLE = 'form_notices'
// 글씨·로고 여섯 칸(spec form-style AC-6806.2): 크기 100·색 없음은 null
const STYLE_COLUMNS = ['title_scale', 'body_scale', 'logo_scale', 'title_color', 'body_color', 'logo_color']
const NULL_STYLE = { title_scale: null, body_scale: null, logo_scale: null, title_color: null, body_color: null, logo_color: null }
const COLUMNS = ['id', 'year', 'month', 'cards', 'theme', 'accent', ...STYLE_COLUMNS, 'updated_at']
const BODY_KEYS = ['accent', 'cards', 'month', 'theme', 'year', ...STYLE_COLUMNS].sort()
const CARD_KEYS = ['end', 'name', 'start', 'status']
const SAVED_KEYS = ['cards', 'id', 'month', 'theme', 'updatedAt', 'year']
const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const RAW_ERROR = { code: '42501', message: `permission denied for table form_notices (${SECRET})`, details: SECRET, hint: SECRET }
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const

const ID = 'fake-notice-1'
const UPDATED = '2026-11-10T01:02:03.456789+00:00'
const CHILDREN: NoticeCard = { start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }
const MEETING: NoticeCard = { start: '2027-05-12', end: '2027-05-14', name: '학회', status: '단축진료' }
const NOTICE: ClosureNotice = { year: 2027, month: 5, cards: [CHILDREN, MEETING], theme: 'children' }
const AUTO: ClosureNotice = { year: 2027, month: 5, cards: [CHILDREN], theme: null } // 테마 저절로

type Call = {
  table: string
  op?: 'select' | 'insert' | 'update' | 'delete'
  body?: unknown
  columns?: string[] // 읽는 칸, 또는 넣기·고치기 뒤 돌려받는 칸
  orders: [string, { ascending?: boolean } | undefined][]
  limit?: number
  filters: [string, unknown][] // eq
  single: boolean
}
type Reply = { data?: unknown; error?: unknown }

/** 부른 표·칸·몸통·거르기를 적는 가짜 클라이언트를 브라우저 클라이언트 자리에 둔다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Call) => Reply = () => ({ data: [] })) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, orders: [], filters: [], single: false }
      calls.push(call)
      const builder = {
        select(columns: string) {
          call.op ??= 'select'
          call.columns = columns.split(',').map((column) => column.trim())
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
        delete() {
          call.op = 'delete'
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
        eq(column: string, value: unknown) {
          call.filters.push([column, value])
          return builder
        },
        single() {
          call.single = true
          return builder
        },
        // 진짜 빌더처럼 await할 때 답한다
        then(ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) {
          return Promise.resolve()
            .then(() => reply(call))
            .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null }))
            .then(ok, bad)
        },
      }
      return builder
    },
  }
  supabaseBrowser.mockReturnValue(client)
  return calls
}

/** 표에서 읽은 줄 그대로(select한 열세 칸). 글자 색·글씨·로고 여섯 칸은 실제 표처럼 늘 오고 기본은 null(자동·처음대로). 값은 복사해 둔다 */
const dbRow = (id: string, updatedAt: string, notice: Record<string, unknown> = NOTICE) => ({
  id,
  accent: null,
  ...NULL_STYLE,
  ...structuredClone(notice),
  updated_at: updatedAt,
})
const savedOf = (id: string, updatedAt: string, notice: ClosureNotice = NOTICE): SavedNotice => ({ id, updatedAt, ...notice })

/** 넣기·고치기 흉내: 보낸 몸통에 id·updated_at을 붙여 돌려준다 */
const echoRow = (call: Call): Reply => ({
  data: { id: ID, ...(call.body as object), updated_at: UPDATED },
})

const card = (change: Record<string, unknown>) => ({ ...CHILDREN, ...change })
const notice = (change: Record<string, unknown>) => ({ ...NOTICE, ...change })
const NO_THEME = { year: NOTICE.year, month: NOTICE.month, cards: NOTICE.cards }

// 하나라도 걸리면 그 줄은 목록에서 빠진다(고쳐 쓰지 않는다)
const BAD_ROWS: [string, unknown][] = [
  ['카드에 다른 열쇠(memo)가 섞임', dbRow('bad-1', UPDATED, notice({ cards: [{ ...CHILDREN, memo: '대충 적은 글' }] }))],
  ['카드 열쇠 하나(status)가 빠짐', dbRow('bad-2', UPDATED, notice({ cards: [{ start: '2027-05-05', end: null, name: '어린이날' }] }))],
  ['카드 아래 글이 메일 주소 모양', dbRow('bad-3', UPDATED, notice({ cards: [card({ status: 'a@b.kr' })] }))],
  ['카드 이름 앞뒤에 공백(다듬어 쓰지 않는다)', dbRow('bad-4', UPDATED, notice({ cards: [card({ name: ' 어린이날 ' })] }))],
  ['카드 이름이 10자 넘음', dbRow('bad-5', UPDATED, notice({ cards: [card({ name: '가'.repeat(11) })] }))],
  ['끝 날짜가 시작보다 앞', dbRow('bad-6', UPDATED, notice({ cards: [card({ end: '2027-05-04' })] }))],
  ['없는 날짜', dbRow('bad-7', UPDATED, notice({ cards: [card({ start: '2027-02-30' })] }))],
  ['끝 날짜가 빈 글', dbRow('bad-8', UPDATED, notice({ cards: [card({ end: '' })] }))],
  ['카드 0장', dbRow('bad-9', UPDATED, notice({ cards: [] }))],
  ['카드 5장', dbRow('bad-10', UPDATED, notice({ cards: Array.from({ length: 5 }, () => CHILDREN) }))],
  ['카드가 배열이 아닌 글', dbRow('bad-11', UPDATED, notice({ cards: JSON.stringify([CHILDREN]) }))],
  ['목록에 없는 테마', dbRow('bad-12', UPDATED, notice({ theme: 'unknown-theme' }))],
  ['테마가 빈 글', dbRow('bad-13', UPDATED, notice({ theme: '' }))],
  ['테마 칸이 없음', dbRow('bad-14', UPDATED, NO_THEME)],
  ['연도가 범위 밖(2019)', dbRow('bad-15', UPDATED, notice({ year: 2019 }))],
  ['달이 13', dbRow('bad-16', UPDATED, notice({ month: 13 }))],
  ['연도가 글', dbRow('bad-17', UPDATED, notice({ year: '2027' }))],
  ['id가 글이 아님', { ...dbRow('x', UPDATED), id: 1 }],
  ['id가 빈 글', dbRow('', UPDATED)],
  ['updated_at이 null', { ...dbRow('bad-20', UPDATED), updated_at: null }],
  ['updated_at 칸이 없음', { id: 'bad-21', ...structuredClone(NOTICE) }],
  ['줄이 null', null],
  ['줄이 배열', []],
]

// 오류 답·예외·클라이언트 만들기 실패
const FAILURES: [string, () => void][] = [
  ['오류 답', () => fakeClient(() => ({ error: RAW_ERROR }))],
  ['오류가 줄과 함께 옴', () => fakeClient((call) => ({ ...echoRow(call), error: RAW_ERROR }))],
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
  [
    '빌더 만들기 실패(from이 곧바로 던짐)',
    () =>
      supabaseBrowser.mockReturnValue({
        from: () => {
          throw new Error(SECRET)
        },
      }),
  ],
]

beforeEach(() => {
  supabaseBrowser.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AC-3507.2 listNotices 읽기', () => {
  it('AC-3507.2: form_notices에서 열세 칸만 updated_at 내림차순(최근 고친 차례)으로 최대 100개 한 번 읽는다(병원으로 거르지 않는다, RLS 몫)', async () => {
    const calls = fakeClient()
    await listNotices()
    expect(supabaseBrowser).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'select', limit: 100, filters: [], single: false })
    expect(calls[0].columns).toEqual(COLUMNS)
    expect(calls[0].orders.map(([column]) => column)).toEqual(['updated_at'])
    expect(calls[0].orders[0][1]?.ascending).toBe(false)
  })

  it('AC-3507.2: 받은 줄을 서버 차례 그대로 SavedNotice({ id, updatedAt, year, month, cards, theme })로 바꾼다', async () => {
    fakeClient(() => ({
      data: [dbRow('fake-notice-2', '2026-11-10T09:00:00+00:00'), dbRow(ID, '2026-11-09T09:00:00+00:00', AUTO)],
    }))
    const list = await listNotices()
    expect(list).toEqual([
      savedOf('fake-notice-2', '2026-11-10T09:00:00+00:00'),
      savedOf(ID, '2026-11-09T09:00:00+00:00', AUTO),
    ])
    for (const saved of list as SavedNotice[]) {
      expect(Object.keys(saved).sort()).toEqual(SAVED_KEYS)
      for (const c of saved.cards) expect(Object.keys(c).sort()).toEqual(CARD_KEYS)
    }
  })

  it('AC-3507.2: 줄에 다른 칸(hospital_id·kind)이 묻어 와도 결과에는 정해 둔 칸만 있다', async () => {
    fakeClient(() => ({ data: [{ ...dbRow(ID, UPDATED), hospital_id: 'fake-hospital', kind: 'closure' }] }))
    const list = (await listNotices()) as SavedNotice[]
    expect(list).toEqual([savedOf(ID, UPDATED)])
    expect(Object.keys(list[0]).sort()).toEqual(SAVED_KEYS)
  })

  it('AC-3507.2: 줄이 없으면 빈 목록이다(실패가 아니다)', async () => {
    fakeClient(() => ({ data: [] }))
    await expect(listNotices()).resolves.toEqual([])
  })

  it.each([
    ...FAILURES,
    ['오류 없이 줄 목록이 안 옴(null)', () => fakeClient(() => ({ data: null }))],
    ['오류 없이 배열이 아닌 답', () => fakeClient(() => ({ data: { rows: [] } }))],
  ] as [string, () => void][])('AC-3507.2: %s → 빈 목록이 아니라 \'failed\'', async (_, arrange) => {
    arrange()
    await expect(listNotices()).resolves.toBe('failed')
  })
})

describe('AC-3507.6 읽은 줄도 저장할 때와 같은 검사', () => {
  it.each(BAD_ROWS)('AC-3507.6: %s → 그 줄은 목록에서 뺀다', async (_, bad) => {
    fakeClient(() => ({ data: [bad] }))
    await expect(listNotices()).resolves.toEqual([])
  })

  it('AC-3507.6: 못 넘는 줄만 빼고 나머지는 차례 그대로 둔다(목록 전체를 실패로 만들지 않는다)', async () => {
    fakeClient(() => ({
      data: [dbRow('good-1', '2026-11-10T09:00:00+00:00'), ...BAD_ROWS.map(([, bad]) => bad), dbRow('good-2', '2026-11-01T09:00:00+00:00', AUTO)],
    }))
    await expect(listNotices()).resolves.toEqual([
      savedOf('good-1', '2026-11-10T09:00:00+00:00'),
      savedOf('good-2', '2026-11-01T09:00:00+00:00', AUTO),
    ])
  })

  it('AC-3507.6: 고쳐 쓰지 않는다 — 공백 붙은 이름을 다듬어 돌려주지 않고 뺀다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, notice({ cards: [card({ name: ' 어린이날' })] }))] }))
    const list = await listNotices()
    expect(list).toEqual([])
    expect(JSON.stringify(list)).not.toContain('어린이날')
  })
})

describe('AC-3507.1·AC-3507.7 insertNotice 넣기', () => {
  it('AC-3507.1: form_notices에 한 줄을 넣고 열세 칸을 돌려받아 한 줄(single)로 읽는다', async () => {
    const calls = fakeClient(echoRow)
    await insertNotice(NOTICE)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'insert', filters: [], single: true })
    expect(calls[0].columns).toEqual(COLUMNS)
    expect(calls[0].body).toEqual({ year: 2027, month: 5, cards: [CHILDREN, MEETING], theme: 'children', accent: null, ...NULL_STYLE })
  })

  it('AC-3507.1: 돌려받은 줄을 SavedNotice로 바꾼다(id·updatedAt은 DB가 준 값)', async () => {
    fakeClient(echoRow)
    const saved = await insertNotice(NOTICE)
    expect(saved).toEqual(savedOf(ID, UPDATED))
    expect(Object.keys(saved as SavedNotice).sort()).toEqual(SAVED_KEYS)
  })

  it('AC-3507.7: 테마 저절로는 빈 글이 아니라 null로 보낸다(칸은 빠지지 않는다)', async () => {
    const calls = fakeClient(echoRow)
    await expect(insertNotice(AUTO)).resolves.toEqual(savedOf(ID, UPDATED, AUTO))
    const body = calls[0].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(BODY_KEYS)
    expect(body.theme).toBeNull()
  })

  it('AC-3507.1: 돌려받은 줄이 검사를 못 넘으면 \'failed\'다', async () => {
    fakeClient(() => ({ data: dbRow(ID, UPDATED, notice({ theme: 'unknown-theme' })) }))
    await expect(insertNotice(NOTICE)).resolves.toBe('failed')
  })

  it('AC-3507.1: 돌려받은 줄이 없으면(null) \'failed\'다', async () => {
    fakeClient(() => ({ data: null }))
    await expect(insertNotice(NOTICE)).resolves.toBe('failed')
  })

  it.each(FAILURES)('AC-3507.1: %s → \'failed\'', async (_, arrange) => {
    arrange()
    await expect(insertNotice(NOTICE)).resolves.toBe('failed')
  })
})

describe('AC-3507.1 updateNotice 고치기', () => {
  it('AC-3507.1: 새 줄이 아니라 그 id 줄 하나만 고치고 열세 칸을 돌려받는다', async () => {
    const calls = fakeClient(echoRow)
    await updateNotice(ID, AUTO)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'update', single: true })
    expect(calls[0].filters).toEqual([['id', ID]])
    expect(calls[0].columns).toEqual(COLUMNS)
    expect(calls[0].body).toEqual({ year: 2027, month: 5, cards: [CHILDREN], theme: null, accent: null, ...NULL_STYLE })
  })

  it('AC-3507.1: 돌려받은 줄을 SavedNotice로 바꾼다', async () => {
    fakeClient(echoRow)
    await expect(updateNotice(ID, NOTICE)).resolves.toEqual(savedOf(ID, UPDATED))
  })

  it('AC-3507.1: 고칠 줄이 없어 single이 오류를 주면(지워진 줄·다른 병원 줄) \'failed\'다', async () => {
    fakeClient(() => ({ error: { code: 'PGRST116', message: `0 rows (${SECRET})` } }))
    await expect(updateNotice('fake-missing', NOTICE)).resolves.toBe('failed')
  })

  it('AC-3507.1: 돌려받은 줄이 검사를 못 넘으면 \'failed\'다', async () => {
    fakeClient(() => ({ data: { ...dbRow(ID, UPDATED), updated_at: null } }))
    await expect(updateNotice(ID, NOTICE)).resolves.toBe('failed')
  })

  it.each(FAILURES)('AC-3507.1: %s → \'failed\'', async (_, arrange) => {
    arrange()
    await expect(updateNotice(ID, NOTICE)).resolves.toBe('failed')
  })
})

describe('AC-3507.7 보내는 몸통은 다섯 + 글씨·로고 여섯 칸뿐', () => {
  const SAVES: [string, (n: ClosureNotice) => Promise<unknown>][] = [
    ['insertNotice', (n) => insertNotice(n)],
    ['updateNotice', (n) => updateNotice(ID, n)],
  ]
  const MEMO = '대충 적은 글 5/5 어린이날 쉬어요'

  // 화면이 들고 있는 값에 대충 적은 글·다른 칸이 묻어 있어도 정해 둔 칸만 나간다
  const carrying = () =>
    ({
      ...structuredClone(NOTICE),
      memo: MEMO,
      id: 'other-notice',
      updatedAt: '2020-01-01T00:00:00Z',
      hospital_id: 'other-hospital',
      kind: 'other',
      cards: [
        { ...CHILDREN, memo: MEMO, id: 'card-1', draft: true },
        { ...MEETING, raw: MEMO },
      ],
    }) as unknown as ClosureNotice

  it.each(SAVES)('AC-3507.7: %s — 몸통 열쇠는 year·month·cards·theme·accent 다섯과 글씨·로고 여섯 칸, 카드마다 start·end·name·status 넷뿐이다', async (_, save) => {
    const calls = fakeClient(echoRow)
    await save(carrying())
    const body = calls[0].body as { cards: Record<string, unknown>[] }
    expect(Object.keys(body).sort()).toEqual(BODY_KEYS)
    expect(body.cards).toHaveLength(2)
    for (const c of body.cards) expect(Object.keys(c).sort()).toEqual(CARD_KEYS)
    expect(body).toEqual({ year: 2027, month: 5, cards: [CHILDREN, MEETING], theme: 'children', accent: null, ...NULL_STYLE })
    const sent = JSON.stringify(body)
    for (const leak of ['대충 적은 글', 'memo', 'other-notice', 'other-hospital', 'updatedAt', 'kind', 'draft', 'raw', 'card-1']) {
      expect(sent).not.toContain(leak)
    }
  })

  it.each(SAVES)('AC-3507.7: %s — 받은 값을 펼쳐 쓰지 않고 새 객체로 보내며, 받은 값은 고치지 않는다', async (_, save) => {
    const calls = fakeClient(echoRow)
    const input = carrying()
    const before = structuredClone(input)
    await save(input)
    const body = calls[0].body as ClosureNotice
    expect(body).not.toBe(input)
    expect(body.cards).not.toBe(input.cards)
    body.cards.forEach((c, i) => expect(c).not.toBe(input.cards[i]))
    expect(input).toEqual(before)
  })

  it.each(SAVES)('AC-3507.7: %s — 검사를 못 넘는 값(메일 주소 모양 카드 글)은 보내지 않고 \'failed\'다', async (_, save) => {
    const calls = fakeClient(echoRow)
    await expect(save({ ...NOTICE, cards: [{ ...CHILDREN, status: 'a@b.kr' }] })).resolves.toBe('failed')
    expect(calls).toEqual([])
  })
})

// ---------- 글자 색 (spec forms-accent REQ-4703, design.md 4절, TASK-2) ----------

const RED = '#c62f2f' // 직접 고른 글자 색(소문자 #rrggbb)
const PICKED: ClosureNotice = { ...NOTICE, theme: 'christmas', accent: RED }

describe('AC-4703.1 글자 색 저장 — 몸통에 accent가 늘 들어간다', () => {
  const SAVES: [string, (n: ClosureNotice) => Promise<unknown>][] = [
    ['insertNotice', (n) => insertNotice(n)],
    ['updateNotice', (n) => updateNotice(ID, n)],
  ]

  it.each(SAVES)('AC-4703.1: %s — 고른 글자 색은 몸통 accent에 그대로 들어가고, 돌려받은 줄도 그 색으로 읽는다', async (_, save) => {
    const calls = fakeClient(echoRow)
    await expect(save(PICKED)).resolves.toEqual(savedOf(ID, UPDATED, PICKED))
    const body = calls[0].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(BODY_KEYS)
    expect(body).toEqual({ year: 2027, month: 5, cards: [CHILDREN, MEETING], theme: 'christmas', accent: RED, ...NULL_STYLE })
  })

  it.each(SAVES)('AC-4703.1: %s — 자동(accent 열쇠 없음·null)이면 accent: null로 보내고(칸이 빠지지 않는다), 돌려받은 값에는 accent 열쇠가 없다', async (_, save) => {
    for (const auto of [NOTICE, { ...NOTICE, accent: null }]) {
      const calls = fakeClient(echoRow)
      const saved = await save(auto)
      const body = calls[0].body as Record<string, unknown>
      expect(Object.keys(body).sort()).toEqual(BODY_KEYS)
      expect(body.accent).toBeNull()
      expect(saved).toEqual(savedOf(ID, UPDATED))
      expect(Object.keys(saved as SavedNotice).sort()).toEqual(SAVED_KEYS)
    }
  })

  it.each(SAVES)('AC-4703.1: %s — 화면 값에 다른 칸이 묻어 있어도 몸통은 정해 둔 열쇠만 골라 새로 만든다(받은 값은 고치지 않는다)', async (_, save) => {
    const calls = fakeClient(echoRow)
    const input = { ...structuredClone(PICKED), memo: '대충 적은 글', color: '#000000', hospital_id: 'other-hospital' } as unknown as ClosureNotice
    const before = structuredClone(input)
    await save(input)
    const body = calls[0].body as Record<string, unknown>
    expect(body).not.toBe(input)
    expect(body).toEqual({ year: 2027, month: 5, cards: [CHILDREN, MEETING], theme: 'christmas', accent: RED, ...NULL_STYLE })
    expect(input).toEqual(before)
  })

  it.each(SAVES)('AC-4703.1: %s — 모양이 틀린 글자 색(대문자·3자리·# 없음·색 이름)은 보내지 않고 \'failed\'다', async (_, save) => {
    for (const accent of ['#C62F2F', '#c62', 'c62f2f', 'red']) {
      const calls = fakeClient(echoRow)
      await expect(save({ ...NOTICE, accent }), accent).resolves.toBe('failed')
      expect(calls, accent).toEqual([])
    }
  })
})

describe('AC-4703.3 읽은 줄의 글자 색', () => {
  it('AC-4703.3: 읽는 칸에 accent가 있다', async () => {
    const calls = fakeClient()
    await listNotices()
    expect(calls[0].columns).toContain('accent')
  })

  it('AC-4703.3: accent가 null인 줄은 글자 색 없는 안내문(자동)으로 읽는다 — 결과에 accent 열쇠가 없다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, { ...NOTICE, accent: null })] }))
    const list = (await listNotices()) as SavedNotice[]
    expect(list).toEqual([savedOf(ID, UPDATED)])
    expect(Object.keys(list[0]).sort()).toEqual(SAVED_KEYS)
  })

  it('AC-4703.3: accent가 # + 소문자 16진수 6자리인 줄은 그 색으로 읽는다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, PICKED)] }))
    const list = (await listNotices()) as SavedNotice[]
    expect(list).toEqual([savedOf(ID, UPDATED, PICKED)])
    expect(list[0].accent).toBe(RED)
    expect(Object.keys(list[0]).sort()).toEqual(['accent', ...SAVED_KEYS].sort())
  })

  const BAD_ACCENTS: [string, unknown][] = [
    ['대문자', '#C62F2F'],
    ['3자리', '#abc'],
    ['# 없음', 'c62f2f'],
    ['8자리', '#c62f2f00'],
    ['색 이름', 'red'],
    ['빈 글', ''],
    ['숫자', 0xc62f2f],
  ]

  it.each(BAD_ACCENTS)('AC-4703.3: accent가 %s인 줄은 읽지 않는다(고쳐 쓰지 않는다)', async (_, accent) => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, { ...NOTICE, accent })] }))
    await expect(listNotices()).resolves.toEqual([])
  })

  it('AC-4703.3: accent 칸이 없는 줄(SQL을 붙이기 전 표 모양)은 읽지 않는다', async () => {
    fakeClient(() => ({ data: [{ id: ID, ...structuredClone(NOTICE), updated_at: UPDATED }] }))
    await expect(listNotices()).resolves.toEqual([])
  })

  it('AC-4703.3: 글자 색이 틀린 줄만 빼고 나머지는 차례 그대로 둔다', async () => {
    fakeClient(() => ({
      data: [
        dbRow('good-1', '2026-11-10T09:00:00+00:00', PICKED),
        ...BAD_ACCENTS.map(([, accent], i) => dbRow(`bad-${i}`, UPDATED, { ...NOTICE, accent })),
        dbRow('good-2', '2026-11-01T09:00:00+00:00', AUTO),
      ],
    }))
    await expect(listNotices()).resolves.toEqual([
      savedOf('good-1', '2026-11-10T09:00:00+00:00', PICKED),
      savedOf('good-2', '2026-11-01T09:00:00+00:00', AUTO),
    ])
  })
})

describe('AC-3507.1 deleteNotice 지우기', () => {
  it('AC-3507.1: 그 id 줄 하나만 지우고 몸통·돌려받는 칸이 없다. 오류가 없으면 true', async () => {
    const calls = fakeClient(() => ({ data: null }))
    await expect(deleteNotice(ID)).resolves.toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'delete', single: false })
    expect(calls[0].filters).toEqual([['id', ID]])
    expect(calls[0].body).toBeUndefined()
    expect(calls[0].columns).toBeUndefined()
  })

  it.each(FAILURES)('AC-3507.1: %s → false', async (_, arrange) => {
    arrange()
    await expect(deleteNotice(ID)).resolves.toBe(false)
  })
})

describe('AC-3507.2 오류 내용을 밖에 내지 않는다', () => {
  const RUNS: [string, () => Promise<unknown>][] = [
    ['listNotices', () => listNotices()],
    ['insertNotice', () => insertNotice(NOTICE)],
    ['updateNotice', () => updateNotice(ID, NOTICE)],
    ['deleteNotice', () => deleteNotice(ID)],
  ]

  it.each(RUNS)('AC-3507.2: %s — 실패해도 던지지 않고, 답에도 console에도 서버 오류 글이 없다', async (_, run) => {
    const spies = CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
    for (const [, arrange] of FAILURES) {
      supabaseBrowser.mockReset()
      arrange()
      const result = await run()
      expect(['failed', false]).toContain(result)
      expect(JSON.stringify(result)).not.toContain(SECRET)
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

// ---------- 글씨·로고 여섯 칸 (spec form-style REQ-6806, design.md 7-2절, TASK-5) ----------

// 고른 글씨·로고 값: 본문 크기는 처음대로(100), 본문 색은 자동(null)
const STYLED: FormStyle = { titleScale: 120, bodyScale: 100, logoScale: 60, titleColor: '#1f2a44', bodyColor: null, logoColor: '#dc2626' }
const STYLED_COLUMNS = { title_scale: 120, body_scale: null, logo_scale: 60, title_color: '#1f2a44', body_color: null, logo_color: '#dc2626' }

describe('AC-6806.2 글씨·로고 값 저장 — 몸통에 여섯 칸이 늘 들어간다', () => {
  const SAVES: [string, (n: ClosureNotice) => Promise<unknown>][] = [
    ['insertNotice', (n) => insertNotice(n)],
    ['updateNotice', (n) => updateNotice(ID, n)],
  ]

  it.each(SAVES)('AC-6806.2: %s — 고른 값은 여섯 칸으로 보내고(크기 100·색 없음은 null), 돌려받은 줄도 그 값으로 읽는다', async (_, save) => {
    const calls = fakeClient(echoRow)
    const saved = await save({ ...NOTICE, style: STYLED })
    const body = calls[0].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(BODY_KEYS)
    expect(body).toEqual({ year: 2027, month: 5, cards: [CHILDREN, MEETING], theme: 'children', accent: null, ...STYLED_COLUMNS })
    expect(saved).toEqual(savedOf(ID, UPDATED, { ...NOTICE, style: STYLED }))
  })

  it.each(SAVES)('AC-6806.2: %s — 처음대로(style 없음·DEFAULT_STYLE)면 여섯 칸 모두 null로 보내고(칸이 빠지지 않는다), 돌려받은 값에는 style 열쇠가 없다', async (_, save) => {
    for (const plain of [NOTICE, { ...NOTICE, style: DEFAULT_STYLE }]) {
      const calls = fakeClient(echoRow)
      const saved = await save(plain)
      const body = calls[0].body as Record<string, unknown>
      expect(Object.keys(body).sort()).toEqual(BODY_KEYS)
      expect(body).toEqual({ year: 2027, month: 5, cards: [CHILDREN, MEETING], theme: 'children', accent: null, ...NULL_STYLE })
      expect(saved).toEqual(savedOf(ID, UPDATED))
      expect(Object.keys(saved as SavedNotice).sort()).toEqual(SAVED_KEYS)
    }
  })

  it.each(SAVES)('AC-6806.2: %s — 크기 100만 null이고 80·130·150 같은 끝 값은 그대로 보낸다. style 열쇠 자체는 몸통에 없다', async (_, save) => {
    const calls = fakeClient(echoRow)
    await save({ ...NOTICE, style: { ...DEFAULT_STYLE, titleScale: 80, bodyScale: 130, logoScale: 150 } })
    const body = calls[0].body as Record<string, unknown>
    expect(body).toMatchObject({ title_scale: 80, body_scale: 130, logo_scale: 150, title_color: null, body_color: null, logo_color: null })
    expect('style' in body).toBe(false)
  })

  it.each(SAVES)("AC-6806.2: %s — 틀린 글씨·로고 값(범위 밖·5의 배수 아님·대문자 색·열쇠 빠짐)은 보내지 않고 'failed'다", async (_, save) => {
    const bads: unknown[] = [
      { ...DEFAULT_STYLE, titleScale: 75 },
      { ...DEFAULT_STYLE, bodyScale: 135 },
      { ...DEFAULT_STYLE, titleScale: 83 },
      { ...DEFAULT_STYLE, logoScale: 55 },
      { ...DEFAULT_STYLE, logoScale: 155 },
      { ...DEFAULT_STYLE, titleColor: '#ABCDEF' },
      { ...DEFAULT_STYLE, logoColor: 'red' },
      { titleScale: 100, bodyScale: 100, logoScale: 100, titleColor: null, bodyColor: null },
      null,
    ]
    for (const style of bads) {
      const calls = fakeClient(echoRow)
      await expect(save({ ...NOTICE, style } as unknown as ClosureNotice), JSON.stringify(style)).resolves.toBe('failed')
      expect(calls, JSON.stringify(style)).toEqual([])
    }
  })

  it.each(SAVES)("AC-6806.2: %s — 화면 값의 style에 다른 열쇠가 섞이면 보내지 않는다(받은 값은 고치지 않는다)", async (_, save) => {
    const calls = fakeClient(echoRow)
    const input = { ...structuredClone(NOTICE), style: { ...STYLED, memo: '대충 적은 글' } } as unknown as ClosureNotice
    const before = structuredClone(input)
    await expect(save(input)).resolves.toBe('failed')
    expect(calls).toEqual([])
    expect(input).toEqual(before)
  })
})

describe('AC-6806.2 읽은 줄의 글씨·로고 값', () => {
  it('AC-6806.2: 읽는 칸에 여섯 칸이 있다', async () => {
    const calls = fakeClient()
    await listNotices()
    for (const column of STYLE_COLUMNS) expect(calls[0].columns).toContain(column)
  })

  it('AC-6806.2: 여섯 칸이 모두 null인 줄은 처음대로로 읽는다 — 결과에 style 열쇠가 없다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED)] }))
    const list = (await listNotices()) as SavedNotice[]
    expect(list).toEqual([savedOf(ID, UPDATED)])
    expect(Object.keys(list[0]).sort()).toEqual(SAVED_KEYS)
  })

  it('AC-6806.2: 값이 든 줄은 null 크기 100·null 색 없음으로 채운 style로 읽는다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, { ...NOTICE, ...STYLED_COLUMNS })] }))
    const list = (await listNotices()) as SavedNotice[]
    expect(list).toEqual([savedOf(ID, UPDATED, { ...NOTICE, style: STYLED })])
    expect(list[0].style).toEqual(STYLED)
    expect(Object.keys(list[0]).sort()).toEqual(['style', ...SAVED_KEYS].sort())
  })

  it('AC-6806.2: 크기 100이 그대로 적힌 줄도 처음대로라 style 열쇠가 없다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, { ...NOTICE, title_scale: 100, body_scale: 100, logo_scale: 100 })] }))
    const list = (await listNotices()) as SavedNotice[]
    expect(list).toEqual([savedOf(ID, UPDATED)])
  })

  it('AC-6806.2: 끝 값(제목·본문 80·130, 로고 60·150)은 읽는다', async () => {
    fakeClient(() => ({
      data: [
        dbRow('edge-1', UPDATED, { ...NOTICE, title_scale: 80, body_scale: 130, logo_scale: 60 }),
        dbRow('edge-2', UPDATED, { ...NOTICE, title_scale: 130, body_scale: 80, logo_scale: 150 }),
      ],
    }))
    const list = (await listNotices()) as SavedNotice[]
    expect(list.map((n) => n.style)).toEqual([
      { ...DEFAULT_STYLE, titleScale: 80, bodyScale: 130, logoScale: 60 },
      { ...DEFAULT_STYLE, titleScale: 130, bodyScale: 80, logoScale: 150 },
    ])
  })

  const BAD_STYLES: [string, Record<string, unknown>][] = [
    ['제목 크기 75(범위 밖)', { title_scale: 75 }],
    ['본문 크기 135(범위 밖)', { body_scale: 135 }],
    ['제목 크기 83(5의 배수 아님)', { title_scale: 83 }],
    ['로고 크기 55(범위 밖)', { logo_scale: 55 }],
    ['로고 크기 155(범위 밖)', { logo_scale: 155 }],
    ['로고 크기 62(5의 배수 아님)', { logo_scale: 62 }],
    ['본문 크기가 글', { body_scale: '100' }],
    ['제목 색이 색 이름', { title_color: 'red' }],
    ['본문 색이 대문자', { body_color: '#ABCDEF' }],
    ['로고 색이 3자리', { logo_color: '#abc' }],
    ['로고 색이 빈 글', { logo_color: '' }],
    ['제목 크기 칸이 없음', { title_scale: undefined }],
    ['로고 색 칸이 없음', { logo_color: undefined }],
  ]

  // 줄 + 바꿀 칸. undefined인 칸은 줄에서 뺀다(SQL을 붙이기 전 표 모양)
  const badRow = (id: string, change: Record<string, unknown>) => {
    const row: Record<string, unknown> = { ...dbRow(id, UPDATED), ...change }
    for (const [key, value] of Object.entries(change)) if (value === undefined) delete row[key]
    return row
  }

  it.each(BAD_STYLES)('AC-6806.2: %s인 줄은 읽지 않는다(고쳐 쓰지 않는다)', async (_, change) => {
    fakeClient(() => ({ data: [badRow(ID, change)] }))
    await expect(listNotices()).resolves.toEqual([])
  })

  it('AC-6806.2: 글씨·로고 값이 틀린 줄만 빼고 나머지는 차례 그대로 둔다', async () => {
    fakeClient(() => ({
      data: [
        dbRow('good-1', '2026-11-10T09:00:00+00:00', { ...NOTICE, ...STYLED_COLUMNS }),
        ...BAD_STYLES.map(([, change], i) => badRow(`bad-${i}`, change)),
        dbRow('good-2', '2026-11-01T09:00:00+00:00', AUTO),
      ],
    }))
    await expect(listNotices()).resolves.toEqual([
      savedOf('good-1', '2026-11-10T09:00:00+00:00', { ...NOTICE, style: STYLED }),
      savedOf('good-2', '2026-11-01T09:00:00+00:00', AUTO),
    ])
  })

  it("AC-6806.2: 넣기·고치기 뒤 돌려받은 줄의 글씨·로고 칸이 틀리면 'failed'다", async () => {
    fakeClient(() => ({ data: { ...dbRow(ID, UPDATED), logo_scale: 155 } }))
    await expect(insertNotice(NOTICE)).resolves.toBe('failed')
    fakeClient(() => ({ data: { ...dbRow(ID, UPDATED), title_color: '#ABCDEF' } }))
    await expect(updateNotice(ID, NOTICE)).resolves.toBe('failed')
  })
})
