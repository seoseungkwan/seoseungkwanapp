// 서식 탭 환자 안내문 읽기·저장(spec forms-guide TASK-6, REQ-4507 · AC-4507.1·4507.2·4507.5). 실제 Supabase에 붙지 않는다.
// formNotices.test.ts와 같은 흉내: 가짜 클라이언트가 어느 표에 어떤 칸·몸통·거르기가 나갔는지 적어 둔다.
// 표 권한·RLS는 supabase/formGuides.rls.test.ts가 증명한다. 글·id는 모두 지어낸 값이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STYLE, type FormStyle } from '@/lib/forms/style'
import type { DrawShape, GuideContent, GuideDrawing, GuideLine, SavedGuide } from '@/types/formGuide'
import { deleteGuide, insertGuide, listGuides, updateGuide } from './formGuides'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const TABLE = 'form_guides'
const COLUMNS = ['id', 'content', 'updated_at']
const CONTENT_KEYS = ['bandTitle', 'big1', 'big2', 'boxBottom', 'boxTop', 'drawing', 'firstSmall', 'lines', 'mark', 'note', 'picture', 'subtitle', 'tag']
const SAVED_KEYS = ['content', 'id', 'updatedAt']
const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const RAW_ERROR = { code: '42501', message: `permission denied for table form_guides (${SECRET})`, details: SECRET, hint: SECRET }
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const

const ID = 'fake-guide-1'
const UPDATED = '2026-11-15T01:02:03.456789+00:00'
const L = (text: string, em = ''): GuideLine => ({ text, em })

// 요청서 예시 1·6·4 (design.md 10절, guide.test.ts와 같은 값)
const INSURANCE: GuideContent = {
  tag: '보험 서류 안내', subtitle: '보험사에 낼 서류는', big1: '수납할 때', big2: '말씀해 주세요', firstSmall: false,
  boxTop: '이렇게 말씀해 주세요', boxBottom: '"보험 서류 필요해요"', picture: 'document', drawing: null, bandTitle: '이런 서류가 필요하실 때', mark: 'check',
  lines: [L('진단서'), L('진료비 영수증'), L('진료비 세부내역서'), L('통원 확인서')], note: '필요한 서류는 보험사마다 다르니 미리 확인해 주세요',
}
const MANUAL: GuideContent = {
  tag: '도수치료 안내', subtitle: '도수치료 관리급여 적용', big1: '1회 비용', big2: '43,850원', firstSmall: true,
  boxTop: '2026년 7월 1일부터', boxBottom: '건강보험 적용 중입니다', picture: 'spine', drawing: null, bandTitle: '도수치료 전에 꼭 확인하세요', mark: 'check',
  lines: [
    L('물리치료를 먼저 2주 이상 · 4회 이상 받은 뒤', '2주 이상 · 4회 이상'),
    L('물리치료로 좋아지지 않을 때 적용', '좋아지지 않을 때'),
    L('도수치료는 주 2회, 1년 15회까지', '주 2회, 1년 15회'),
  ],
  note: '',
}
const PROXY: GuideContent = {
  tag: '접수 안내', subtitle: '다른 분을 대신하는', big1: '대리 접수는', big2: '안 됩니다', firstSmall: false,
  boxTop: '접수는', boxBottom: '환자 본인만 가능합니다', picture: 'nosign', drawing: null, bandTitle: '이렇게 해 주세요', mark: 'check',
  lines: [L('환자 본인이 오신 뒤에 접수해 주세요'), L('가족·지인 접수는 대신 할 수 없습니다')], note: '본인 확인과 공정한 순서를 위해 양해 부탁드립니다',
}
// 4번 예시에 더하면 띠가 넘치는 28자 안의 줄 둘 (guideLayout.test.ts와 같음)
const OVER_LINES = [L('보호자는 옆에서 도와주실 수 있습니다'), L('접수 뒤에는 자리에서 기다려 주세요')]

// 시안 '휠체어' AI 그림 (guideDrawing.test.ts와 같음)
const SH = (kind: DrawShape['kind'], nums: number[], fill: DrawShape['fill'], stroke: DrawShape['stroke'], width: number, d = ''): DrawShape => ({
  kind, nums, d, fill, stroke, width,
})
const WHEELCHAIR: GuideDrawing = {
  subject: '휠체어',
  shapes: [
    SH('circle', [78, 108, 34], 'yellow', 'dark', 9), SH('circle', [78, 108, 9], 'white', 'dark', 5),
    SH('path', [], 'none', 'dark', 10, 'M58 46 L58 90 L108 90'), SH('path', [], 'none', 'dark', 9, 'M108 90 L120 122 L134 122'),
    SH('circle', [122, 132, 7], 'white', 'dark', 5), SH('path', [], 'none', 'dark', 9, 'M58 46 L44 46'),
  ],
}
const CUSTOM: GuideContent = { ...INSURANCE, picture: 'custom', drawing: WHEELCHAIR }

const guide = (change: Record<string, unknown> = {}, base: GuideContent = INSURANCE) => ({ ...structuredClone(base), ...change })

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

/** 표에서 읽은 줄 그대로(select한 세 칸). 값은 복사해 둔다 */
const dbRow = (id: string, updatedAt: string, content: unknown = INSURANCE) => ({ id, content: structuredClone(content), updated_at: updatedAt })
const savedOf = (id: string, updatedAt: string, content: GuideContent = INSURANCE): SavedGuide => ({ id, updatedAt, content })

/** 넣기·고치기 흉내: 보낸 몸통에 id·updated_at을 붙여 돌려준다 */
const echoRow = (call: Call): Reply => ({ data: { id: ID, ...(call.body as object), updated_at: UPDATED } })

// 하나라도 걸리면 그 줄은 목록에서 빠진다(고쳐 쓰지 않는다)
const BAD_ROWS: [string, unknown][] = [
  ['content에 다른 열쇠(memo)가 섞임', dbRow('bad-1', UPDATED, guide({ memo: '대충 적은 글' }))],
  ['content 열쇠 하나(drawing)가 빠짐', dbRow('bad-2', UPDATED, Object.fromEntries(Object.entries(guide()).filter(([key]) => key !== 'drawing')))],
  ['줄에 다른 열쇠가 섞임', dbRow('bad-3', UPDATED, guide({ lines: [{ text: '진단서', em: '', memo: 'x' }] }))],
  ['아래 작은 글이 메일 주소 모양', dbRow('bad-4', UPDATED, guide({ note: 'a@b.kr 로 보내 주세요' }))],
  ['머리표가 빈 글', dbRow('bad-5', UPDATED, guide({ tag: '' }))],
  ['머리표가 10자 넘음', dbRow('bad-6', UPDATED, guide({ tag: '가'.repeat(11) }))],
  ['줄 0개', dbRow('bad-7', UPDATED, guide({ lines: [] }))],
  ['줄 5개', dbRow('bad-8', UPDATED, guide({ lines: [...INSURANCE.lines, L('입퇴원 확인서')] }))],
  ['강조가 그 줄에 없음', dbRow('bad-9', UPDATED, guide({ lines: [L('진단서', '영수증')] }))],
  ['목록에 없는 그림', dbRow('bad-10', UPDATED, guide({ picture: 'unknown-picture' }))],
  ['그림이 custom인데 drawing이 null', dbRow('bad-11', UPDATED, guide({ picture: 'custom', drawing: null }))],
  ['그림이 custom인데 도형이 잘못됨', dbRow('bad-12', UPDATED, guide({ picture: 'custom', drawing: { ...WHEELCHAIR, shapes: [SH('circle', [85, 85, 999], 'yellow', 'dark', 6)] } }))],
  ['그림이 16개 중 하나인데 drawing이 있음', dbRow('bad-13', UPDATED, guide({ drawing: WHEELCHAIR }))],
  ['줄 표시가 둘 밖', dbRow('bad-14', UPDATED, guide({ mark: 'star' }))],
  ['윗줄 작게가 글', dbRow('bad-15', UPDATED, guide({ firstSmall: 'true' }))],
  ['띠가 넘침(4번 예시 + 줄 둘)', dbRow('bad-16', UPDATED, guide({ lines: [...PROXY.lines, ...OVER_LINES] }, PROXY))],
  ['content가 배열', dbRow('bad-17', UPDATED, [INSURANCE])],
  ['content가 JSON 글', dbRow('bad-18', UPDATED, JSON.stringify(INSURANCE))],
  ['content가 null', dbRow('bad-19', UPDATED, null)],
  ['id가 글이 아님', { ...dbRow('x', UPDATED), id: 1 }],
  ['id가 빈 글', dbRow('', UPDATED)],
  ['updated_at이 null', { ...dbRow('bad-22', UPDATED), updated_at: null }],
  ['updated_at 칸이 없음', { id: 'bad-23', content: structuredClone(INSURANCE) }],
  ['content 칸이 없음', { id: 'bad-24', updated_at: UPDATED }],
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

describe('AC-4507.2 listGuides 읽기', () => {
  it('AC-4507.2: form_guides에서 id·content·updated_at 세 칸만 updated_at 내림차순(최근 고친 차례)으로 최대 100개 한 번 읽는다(병원으로 거르지 않는다, RLS 몫)', async () => {
    const calls = fakeClient()
    await listGuides()
    expect(supabaseBrowser).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'select', limit: 100, filters: [], single: false })
    expect(calls[0].columns).toEqual(COLUMNS)
    expect(calls[0].orders.map(([column]) => column)).toEqual(['updated_at'])
    expect(calls[0].orders[0][1]?.ascending).toBe(false)
  })

  it('AC-4507.2: 받은 줄을 서버 차례 그대로 SavedGuide({ id, updatedAt, content })로 바꾼다(content는 열쇠 13개)', async () => {
    fakeClient(() => ({
      data: [dbRow('fake-guide-2', '2026-11-15T09:00:00+00:00', MANUAL), dbRow(ID, '2026-11-14T09:00:00+00:00')],
    }))
    const list = await listGuides()
    expect(list).toEqual([savedOf('fake-guide-2', '2026-11-15T09:00:00+00:00', MANUAL), savedOf(ID, '2026-11-14T09:00:00+00:00')])
    for (const saved of list as SavedGuide[]) {
      expect(Object.keys(saved).sort()).toEqual(SAVED_KEYS)
      expect(Object.keys(saved.content).sort()).toEqual(CONTENT_KEYS)
      for (const line of saved.content.lines) expect(Object.keys(line).sort()).toEqual(['em', 'text'])
    }
  })

  it('AC-4507.2: AI로 그린 그림(custom)이 담긴 줄은 그림 그대로 읽는다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, CUSTOM)] }))
    await expect(listGuides()).resolves.toEqual([savedOf(ID, UPDATED, CUSTOM)])
  })

  it('AC-4507.2: 줄에 다른 칸(hospital_id·created_at)이 묻어 와도 결과에는 정해 둔 칸만 있다', async () => {
    fakeClient(() => ({ data: [{ ...dbRow(ID, UPDATED), hospital_id: 'fake-hospital', created_at: UPDATED }] }))
    const list = (await listGuides()) as SavedGuide[]
    expect(list).toEqual([savedOf(ID, UPDATED)])
    expect(Object.keys(list[0]).sort()).toEqual(SAVED_KEYS)
  })

  it('AC-4507.2: 줄이 없으면 빈 목록이다(실패가 아니다)', async () => {
    fakeClient(() => ({ data: [] }))
    await expect(listGuides()).resolves.toEqual([])
  })

  it.each([
    ...FAILURES,
    ['오류 없이 줄 목록이 안 옴(null)', () => fakeClient(() => ({ data: null }))],
    ['오류 없이 배열이 아닌 답', () => fakeClient(() => ({ data: { rows: [] } }))],
  ] as [string, () => void][])("AC-4507.2: %s → 빈 목록이 아니라 'failed'", async (_, arrange) => {
    arrange()
    await expect(listGuides()).resolves.toBe('failed')
  })
})

describe('AC-4507.5 읽은 줄도 저장할 때와 같은 검사(checkGuideValue)', () => {
  it.each(BAD_ROWS)('AC-4507.5: %s → 그 줄은 목록에서 뺀다', async (_, bad) => {
    fakeClient(() => ({ data: [bad] }))
    await expect(listGuides()).resolves.toEqual([])
  })

  it('AC-4507.5: 못 넘는 줄만 빼고 나머지는 차례 그대로 둔다(목록 전체를 실패로 만들지 않는다)', async () => {
    fakeClient(() => ({
      data: [dbRow('good-1', '2026-11-15T09:00:00+00:00'), ...BAD_ROWS.map(([, bad]) => bad), dbRow('good-2', '2026-11-01T09:00:00+00:00', MANUAL)],
    }))
    await expect(listGuides()).resolves.toEqual([
      savedOf('good-1', '2026-11-15T09:00:00+00:00'),
      savedOf('good-2', '2026-11-01T09:00:00+00:00', MANUAL),
    ])
  })

  it('AC-4507.5: 못 넘는 줄을 고쳐 쓰지 않는다 — 넘치는 머리표를 잘라 돌려주지 않고 뺀다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, guide({ tag: '보험 서류 안내 꼭 보세요' }))] }))
    const list = await listGuides()
    expect(list).toEqual([])
    expect(JSON.stringify(list)).not.toContain('보험')
  })
})

describe('AC-4507.1 insertGuide 넣기', () => {
  it('AC-4507.1: form_guides에 한 줄을 넣고 세 칸을 돌려받아 한 줄(single)로 읽는다', async () => {
    const calls = fakeClient(echoRow)
    await insertGuide(INSURANCE)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'insert', filters: [], single: true })
    expect(calls[0].columns).toEqual(COLUMNS)
    expect(calls[0].body).toEqual({ content: INSURANCE })
  })

  it('AC-4507.1: 돌려받은 줄을 SavedGuide로 바꾼다(id·updatedAt은 DB가 준 값)', async () => {
    fakeClient(echoRow)
    const saved = await insertGuide(INSURANCE)
    expect(saved).toEqual(savedOf(ID, UPDATED))
    expect(Object.keys(saved as SavedGuide).sort()).toEqual(SAVED_KEYS)
  })

  it("AC-4507.1: 돌려받은 줄이 검사를 못 넘으면 'failed'다", async () => {
    fakeClient(() => ({ data: dbRow(ID, UPDATED, guide({ picture: 'unknown-picture' })) }))
    await expect(insertGuide(INSURANCE)).resolves.toBe('failed')
  })

  it("AC-4507.1: 돌려받은 줄이 없으면(null) 'failed'다", async () => {
    fakeClient(() => ({ data: null }))
    await expect(insertGuide(INSURANCE)).resolves.toBe('failed')
  })

  it.each(FAILURES)("AC-4507.1: %s → 'failed'", async (_, arrange) => {
    arrange()
    await expect(insertGuide(INSURANCE)).resolves.toBe('failed')
  })
})

describe('AC-4507.1 updateGuide 고치기', () => {
  it('AC-4507.1: 새 줄이 아니라 그 id 줄 하나만 고치고 세 칸을 돌려받는다', async () => {
    const calls = fakeClient(echoRow)
    await updateGuide(ID, MANUAL)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'update', single: true })
    expect(calls[0].filters).toEqual([['id', ID]])
    expect(calls[0].columns).toEqual(COLUMNS)
    expect(calls[0].body).toEqual({ content: MANUAL })
  })

  it('AC-4507.1: 돌려받은 줄을 SavedGuide로 바꾼다', async () => {
    fakeClient(echoRow)
    await expect(updateGuide(ID, MANUAL)).resolves.toEqual(savedOf(ID, UPDATED, MANUAL))
  })

  it("AC-4507.1: 고칠 줄이 없어 single이 오류를 주면(지워진 줄·다른 병원 줄) 'failed'다", async () => {
    fakeClient(() => ({ error: { code: 'PGRST116', message: `0 rows (${SECRET})` } }))
    await expect(updateGuide('fake-missing', INSURANCE)).resolves.toBe('failed')
  })

  it("AC-4507.1: 돌려받은 줄이 검사를 못 넘으면 'failed'다", async () => {
    fakeClient(() => ({ data: { ...dbRow(ID, UPDATED), updated_at: null } }))
    await expect(updateGuide(ID, INSURANCE)).resolves.toBe('failed')
  })

  it.each(FAILURES)("AC-4507.1: %s → 'failed'", async (_, arrange) => {
    arrange()
    await expect(updateGuide(ID, INSURANCE)).resolves.toBe('failed')
  })
})

describe('AC-4507.5 보내는 몸통은 { content } 하나', () => {
  const SAVES: [string, (c: GuideContent) => Promise<unknown>][] = [
    ['insertGuide', (c) => insertGuide(c)],
    ['updateGuide', (c) => updateGuide(ID, c)],
  ]
  const MEMO = '대충 적은 글 보험 서류 필요하면 수납할 때 말하기'

  // 화면이 들고 있는 값에 대충 적은 글·그릴 것·다른 칸이 묻어 있어도 정해 둔 칸만 나간다
  const carrying = () =>
    ({
      ...structuredClone(INSURANCE),
      memo: MEMO,
      subject: '그릴 것 휠체어',
      id: 'other-guide',
      updatedAt: '2020-01-01T00:00:00Z',
      hospital_id: 'other-hospital',
      lines: INSURANCE.lines.map((line, i) => ({ ...line, memo: MEMO, draft: i })),
    }) as unknown as GuideContent

  it.each(SAVES)('AC-4507.5: %s — 몸통 열쇠는 content 하나, content는 열쇠 13개·줄마다 text·em 둘뿐이고 대충 적은 글은 없다', async (_, save) => {
    const calls = fakeClient(echoRow)
    await save(carrying())
    const body = calls[0].body as { content: GuideContent }
    expect(Object.keys(body)).toEqual(['content'])
    expect(Object.keys(body.content).sort()).toEqual(CONTENT_KEYS)
    for (const line of body.content.lines) expect(Object.keys(line).sort()).toEqual(['em', 'text'])
    expect(body).toEqual({ content: INSURANCE })
    const sent = JSON.stringify(body)
    for (const leak of ['대충 적은 글', 'memo', 'subject', '그릴 것', 'other-guide', 'other-hospital', 'updatedAt', 'draft']) {
      expect(sent).not.toContain(leak)
    }
  })

  it.each(SAVES)('AC-4507.5: %s — 글 칸·줄·강조의 앞뒤 공백을 뗀 값을 보낸다', async (_, save) => {
    const calls = fakeClient(echoRow)
    const spaced = guide({ tag: '  보험 서류 안내 ', note: ` ${INSURANCE.note}\t`, lines: [L(' 진단서 '), L('진료비 영수증 ', ' 영수증 ')] })
    await save(spaced)
    expect(calls[0].body).toEqual({ content: { ...INSURANCE, lines: [L('진단서'), L('진료비 영수증', '영수증')] } })
  })

  it.each(SAVES)('AC-4507.5: %s — 그림이 custom이 아니면 화면에 남겨 둔 AI 그림은 보내지 않는다(drawing null)', async (_, save) => {
    const calls = fakeClient(echoRow)
    await expect(save(guide({ drawing: structuredClone(WHEELCHAIR) }))).resolves.toEqual(savedOf(ID, UPDATED))
    const body = calls[0].body as { content: GuideContent }
    expect(body.content.picture).toBe('document')
    expect(body.content.drawing).toBeNull()
    expect(JSON.stringify(body)).not.toContain('휠체어')
  })

  it.each(SAVES)('AC-4507.5: %s — 그림이 custom이면 AI 그림을 그대로 보낸다', async (_, save) => {
    const calls = fakeClient(echoRow)
    await expect(save(structuredClone(CUSTOM))).resolves.toEqual(savedOf(ID, UPDATED, CUSTOM))
    expect(calls[0].body).toEqual({ content: CUSTOM })
  })

  it.each(SAVES)('AC-4507.5: %s — 받은 값을 펼쳐 쓰지 않고 새 객체로 보내며, 받은 값은 고치지 않는다', async (_, save) => {
    const calls = fakeClient(echoRow)
    const input = structuredClone(CUSTOM)
    const before = structuredClone(input)
    await save(input)
    const body = calls[0].body as { content: GuideContent }
    expect(body.content).not.toBe(input)
    expect(body.content.lines).not.toBe(input.lines)
    body.content.lines.forEach((line, i) => expect(line).not.toBe(input.lines[i]))
    expect(body.content.drawing).not.toBe(input.drawing)
    expect(input).toEqual(before)
  })

  it.each([
    ['메일 주소 모양 글', guide({ note: 'a@b.kr 로 보내 주세요' })],
    ['빈 머리표', guide({ tag: ' ' })],
    ['줄 0개', guide({ lines: [] })],
    ['띠 넘침', guide({ lines: [...PROXY.lines, ...OVER_LINES] }, PROXY)],
    ['custom인데 그림 없음', guide({ picture: 'custom', drawing: null })],
    ['custom인데 잘못된 도형', guide({ picture: 'custom', drawing: { ...WHEELCHAIR, shapes: [SH('circle', [85, 85, 50], 'red' as DrawShape['fill'], 'dark', 6)] } })],
  ] as [string, GuideContent][])("AC-4507.5: 검사(checkGuideValue)를 못 넘는 값(%s)은 넣기·고치기 모두 보내지 않고 'failed'다", async (_, bad) => {
    for (const [, save] of SAVES) {
      const calls = fakeClient(echoRow)
      await expect(save(structuredClone(bad))).resolves.toBe('failed')
      expect(calls).toEqual([])
    }
  })
})

describe('AC-4507.1 deleteGuide 지우기', () => {
  it('AC-4507.1: 그 id 줄 하나만 지우고 몸통·돌려받는 칸이 없다. 오류가 없으면 true', async () => {
    const calls = fakeClient(() => ({ data: null }))
    await expect(deleteGuide(ID)).resolves.toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'delete', single: false })
    expect(calls[0].filters).toEqual([['id', ID]])
    expect(calls[0].body).toBeUndefined()
    expect(calls[0].columns).toBeUndefined()
  })

  it.each(FAILURES)('AC-4507.1: %s → false', async (_, arrange) => {
    arrange()
    await expect(deleteGuide(ID)).resolves.toBe(false)
  })
})

describe('AC-4507.2 오류 내용을 밖에 내지 않는다', () => {
  const RUNS: [string, () => Promise<unknown>][] = [
    ['listGuides', () => listGuides()],
    ['insertGuide', () => insertGuide(INSURANCE)],
    ['updateGuide', () => updateGuide(ID, INSURANCE)],
    ['deleteGuide', () => deleteGuide(ID)],
  ]

  it.each(RUNS)('AC-4507.2: %s — 실패해도 던지지 않고, 답에도 console에도 서버 오류 글이 없다', async (_, run) => {
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

// 환자 안내문 색(spec clinic-profile REQ-6604 AC-6604.6): [직접 고르기]로 고른 두 색은 content 안 colors 열쇠로 함께 저장한다.
// [자동]은 열쇠 없이(옛 안내문과 같은 모양) 보내고, 모양이 틀린 색은 보내지 않는다
describe('AC-6604.6 안내문 색 저장·읽기', () => {
  const PICKED = { main: '#3b82c4', dark: '#16324a' }

  it('AC-6604.6: 직접 고른 색이 있으면 열쇠 13개에 colors를 더해 보내고, 돌려받은 줄도 색을 그대로 갖는다', async () => {
    const calls = fakeClient(echoRow)
    const saved = await insertGuide({ ...INSURANCE, colors: PICKED } as GuideContent)
    expect(calls[0].body).toEqual({ content: { ...INSURANCE, colors: PICKED } })
    expect(Object.keys((calls[0].body as { content: object }).content).sort()).toEqual([...CONTENT_KEYS, 'colors'].sort())
    expect((saved as SavedGuide).content).toEqual({ ...INSURANCE, colors: PICKED })
  })

  it('AC-6604.6: 고치기(updateGuide)도 같은 몸통으로 색을 함께 보낸다', async () => {
    const calls = fakeClient(echoRow)
    await updateGuide(ID, { ...INSURANCE, colors: PICKED } as GuideContent)
    expect(calls[0]).toMatchObject({ table: TABLE, op: 'update', filters: [['id', ID]] })
    expect(calls[0].body).toEqual({ content: { ...INSURANCE, colors: PICKED } })
  })

  it('AC-6604.6: [자동](colors 없음·null)은 열쇠 13개만 보낸다 — 색을 저장하지 않은 옛 안내문과 같은 모양', async () => {
    const calls = fakeClient(echoRow)
    await insertGuide(INSURANCE)
    await insertGuide({ ...INSURANCE, colors: null } as GuideContent)
    for (const call of calls) expect(Object.keys((call.body as { content: object }).content).sort()).toEqual(CONTENT_KEYS)
  })

  it("AC-6604.6: 모양이 틀린 색(색 이름 글·한 색만·다른 열쇠가 섞임)은 보내지 않고 'failed'다", async () => {
    for (const bad of [{ main: 'red', dark: '#16324a' }, { main: '#3b82c4' }, { ...PICKED, memo: 'x' }]) {
      const calls = fakeClient(echoRow)
      expect(await insertGuide({ ...INSURANCE, colors: bad } as unknown as GuideContent)).toBe('failed')
      expect(calls).toHaveLength(0)
    }
  })

  it('AC-6604.6: 색이 저장된 줄을 읽으면 색이 그대로 남고, 색이 없는 옛 줄은 colors 없이([자동]) 읽는다', async () => {
    fakeClient(() => ({ data: [dbRow(ID, UPDATED, { ...INSURANCE, colors: PICKED }), dbRow('old-1', UPDATED)] }))
    const list = (await listGuides()) as SavedGuide[]
    expect(list[0].content).toEqual({ ...INSURANCE, colors: PICKED })
    expect(Object.keys(list[1].content).sort()).toEqual(CONTENT_KEYS)
  })
})

// 환자 안내문 글씨·로고 값(spec form-style REQ-6806 AC-6806.3, design.md 7-3절): 처음대로가 아니면 content 안 style 열쇠로 함께 저장한다(SQL 없음).
// 처음대로(열쇠 없음·DEFAULT_STYLE)는 열쇠 없이(옛 안내문과 같은 모양) 보내고, 틀린 값은 보내지 않는다
describe('AC-6806.3 안내문 글씨·로고 값 저장·읽기', () => {
  // 작게 고른 크기라 줄이 넘치지 않는다
  const STYLED: FormStyle = { titleScale: 90, bodyScale: 90, logoScale: 120, titleColor: '#1f2a44', bodyColor: null, logoColor: '#dc2626' }
  const PICKED = { main: '#3b82c4', dark: '#16324a' }
  const SAVES: [string, (c: GuideContent) => Promise<unknown>][] = [
    ['insertGuide', (c) => insertGuide(c)],
    ['updateGuide', (c) => updateGuide(ID, c)],
  ]

  it.each(SAVES)('AC-6806.3: %s — 처음대로가 아닌 style은 열쇠 13개에 style을 더해 보내고, 돌려받은 줄도 그 값을 갖는다', async (_, save) => {
    const calls = fakeClient(echoRow)
    const saved = await save({ ...INSURANCE, style: STYLED } as GuideContent)
    expect(calls[0].body).toEqual({ content: { ...INSURANCE, style: STYLED } })
    expect(Object.keys((calls[0].body as { content: object }).content).sort()).toEqual([...CONTENT_KEYS, 'style'].sort())
    expect((saved as SavedGuide).content).toEqual({ ...INSURANCE, style: STYLED })
  })

  it.each(SAVES)('AC-6806.3: %s — 고른 색과 글씨·로고 값을 함께 보낸다', async (_, save) => {
    const calls = fakeClient(echoRow)
    await save({ ...INSURANCE, colors: PICKED, style: STYLED } as GuideContent)
    expect(calls[0].body).toEqual({ content: { ...INSURANCE, colors: PICKED, style: STYLED } })
  })

  it.each(SAVES)('AC-6806.3: %s — 처음대로(style 없음·DEFAULT_STYLE)면 열쇠 13개만 보낸다 — 옛 안내문과 같은 모양', async (_, save) => {
    const calls = fakeClient(echoRow)
    await save(INSURANCE)
    await save({ ...INSURANCE, style: { ...DEFAULT_STYLE } } as GuideContent)
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.body).toEqual({ content: INSURANCE })
      expect(Object.keys((call.body as { content: object }).content).sort()).toEqual(CONTENT_KEYS)
    }
  })

  it.each(SAVES)('AC-6806.3: %s — 보내는 style은 받은 값을 그대로 쓰지 않고 새 객체이며, 받은 값은 고치지 않는다', async (_, save) => {
    const calls = fakeClient(echoRow)
    const input = { ...structuredClone(INSURANCE), style: { ...STYLED } } as GuideContent & { style: FormStyle }
    const before = structuredClone(input)
    await save(input)
    const sent = (calls[0].body as { content: { style: FormStyle } }).content.style
    expect(sent).toEqual(STYLED)
    expect(sent).not.toBe(input.style)
    expect(input).toEqual(before)
  })

  it.each(SAVES)("AC-6806.3: %s — 틀린 style(범위 밖·5의 배수 아님·대문자 색·열쇠 하나 더/덜·null)은 보내지 않고 'failed'다", async (_, save) => {
    const four = Object.fromEntries(Object.entries(DEFAULT_STYLE).slice(0, 5))
    for (const bad of [
      { ...DEFAULT_STYLE, titleScale: 75 },
      { ...DEFAULT_STYLE, bodyScale: 83 },
      { ...DEFAULT_STYLE, logoScale: 155 },
      { ...DEFAULT_STYLE, bodyColor: '#ABCDEF' },
      { ...DEFAULT_STYLE, memo: 'x' },
      four,
      null,
    ]) {
      const calls = fakeClient(echoRow)
      expect(await save({ ...INSURANCE, style: bad } as unknown as GuideContent), JSON.stringify(bad)).toBe('failed')
      expect(calls).toHaveLength(0)
    }
  })

  it('AC-6806.3: style이 저장된 줄을 읽으면 그 값이 남고, 처음대로 값이 적힌 줄·style이 없는 옛 줄은 style 없이 읽는다', async () => {
    fakeClient(() => ({
      data: [
        dbRow(ID, UPDATED, { ...INSURANCE, style: STYLED }),
        dbRow('plain-1', UPDATED, { ...INSURANCE, style: DEFAULT_STYLE }),
        dbRow('old-1', UPDATED),
      ],
    }))
    const list = (await listGuides()) as SavedGuide[]
    expect(list.map((g) => g.id)).toEqual([ID, 'plain-1', 'old-1'])
    expect(list[0].content).toEqual({ ...INSURANCE, style: STYLED })
    expect(Object.keys(list[1].content).sort()).toEqual(CONTENT_KEYS)
    expect(Object.keys(list[2].content).sort()).toEqual(CONTENT_KEYS)
  })

  it('AC-6806.3: style이 틀린 줄만 빼고 나머지는 차례 그대로 둔다', async () => {
    fakeClient(() => ({
      data: [
        dbRow('good-1', UPDATED, { ...INSURANCE, style: STYLED }),
        dbRow('bad-1', UPDATED, { ...INSURANCE, style: { ...STYLED, logoScale: 55 } }),
        dbRow('bad-2', UPDATED, { ...INSURANCE, style: null }),
        dbRow('good-2', UPDATED),
      ],
    }))
    const list = (await listGuides()) as SavedGuide[]
    expect(list.map((g) => g.id)).toEqual(['good-1', 'good-2'])
  })
})
