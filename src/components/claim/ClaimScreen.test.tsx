// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import { errorInfo } from '@/lib/errors'
import type { DayCount } from '@/types/bridge'
import type { CheckSettings, ClaimView, ClaimVisitView, Finding, Grade, PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import { claimChannel } from './claimLoad'
import { ClaimScreen } from './ClaimScreen'

// 청구 화면(REQ-013). 가짜 통로·가짜 Worker로 화면만 본다. 이름·차트번호는 모두 지어낸 것이다. 실제 DB에 붙지 않는다

const db = vi.hoisted(() => ({
  rules: [] as unknown[],
  hospital: null as unknown,
  counts: [] as unknown[],
  failSettings: false,
  failCounts: false,
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from(table: string) {
      const answer = () => {
        if (table === 'claim_day_counts') return db.failCounts ? { data: null, error: { code: '500', message: 'x' }, status: 500 } : { data: db.counts, error: null, status: 200 }
        if (db.failSettings) return { data: null, error: { message: 'x' } }
        return table === 'claim_rule_settings' ? { data: db.rules, error: null } : { data: db.hospital, error: null }
      }
      const query = {
        gte: () => query,
        lte: () => query,
        maybeSingle: () => Promise.resolve(answer()),
        then: (ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) => Promise.resolve(answer()).then(ok, no),
      }
      return { select: () => query }
    },
  }),
}))

// ── 가짜 자료 ──────────

const DAYS: DayCount[] = [
  { date: '2026-10-24', visits: 20, memoInBit: 2 },
  { date: '2026-10-25', visits: 0, memoInBit: 0 },
  { date: '2026-10-27', visits: 50, memoInBit: 8 },
  { date: '2026-10-28', visits: 51, memoInBit: 2 },
  { date: '2026-10-29', visits: 49, memoInBit: 0 },
]
const COUNTS = [
  { visit_date: '2026-10-24', need_memo: 2, entered: 2, needs_check: 0, skipped: 0, updated_at: '2026-10-24T07:41:00+00:00' },
  { visit_date: '2026-10-27', need_memo: 8, entered: 8, needs_check: 0, skipped: 0, updated_at: '2026-10-27T07:41:00+00:00' },
  { visit_date: '2026-10-28', need_memo: 7, entered: 2, needs_check: 0, skipped: 0, updated_at: '2026-10-28T07:41:00+00:00' },
]

const finding = (ruleId: string, grade: Grade, key: string, message = `${ruleId} 내용`): Finding => ({
  visitKey: key,
  ruleId,
  grade,
  message,
  detail: '',
  basis: [{ doc: `${ruleId} 고시`, number: `고시 ${ruleId}` }],
})
const noDx = (key: string, over = {}) => ({ visitKey: key, missingDx: false, needsCheck: false, issues: [], recommendations: [], ...over })
const visit = (key: string, name: string, chart: string, findings: Finding[], over: Partial<ClaimVisitView> = {}): ClaimVisitView => ({
  key,
  chart,
  date: '2026-10-28',
  name,
  findings,
  skippedNoHistory: 0,
  skippedNoDx: 0,
  checked: 1,
  memo: null,
  rx: ['관절 주사'],
  dxNow: [{ c: 'M751', n: '회전근개', m: true, s: '', d: '', t: '' }],
  dx: noDx(key),
  ...over,
})
const VIEW: ClaimView = {
  period: { from: '2026-10-28', to: '2026-10-29' },
  hasDx: true,
  enabledRules: 254,
  memoBlocked: null,
  totals: { checked: 5, hi: 1, mid: 2, lo: 1, patients: 1, historySkips: 0 },
  groups: [
    { ruleId: 'IJ-05', title: '관절 주사 간격', domain: '주사', grade: '확인필요', visitKeys: ['v1'], basis: [] },
    { ruleId: 'PT-01', title: '물리치료 3가지', domain: '물리', grade: '알림', visitKeys: ['v1', 'v2'], basis: [] },
    { ruleId: 'ETC-1', title: '기타 안내', domain: '기타', grade: '참고', visitKeys: ['v3'], basis: [] },
  ],
  visits: [
    visit('v1', '가상환자A', '00012', [finding('IJ-05', '확인필요', 'v1'), finding('PT-01', '알림', 'v1')]),
    visit('v2', '가상환자B', '00031', [finding('PT-01', '알림', 'v2')]),
    visit('v3', '가상환자C', '00045', [finding('ETC-1', '참고', 'v3')]),
    visit('v4', '가상환자D', '00058', []),
    visit('v5', '가상환자E', '00063', [], { dx: noDx('v5', { missingDx: true, needsCheck: true }), dxNow: [] }),
  ],
}
const manyVisits = (n: number): ClaimView => ({
  ...VIEW,
  visits: Array.from({ length: n }, (_, i) => visit(`p${i}`, `가상환자${i}`, `9${String(i).padStart(4, '0')}`, [finding('ETC-1', '참고', `p${i}`)])),
})

// ── 가짜 Worker: 받은 메시지에 약속대로 답한다. 시험이 답을 바꿀 수 있다 ──────────

type Listener = (event: Event) => void
function fakeWorker(answers: Partial<{ [K in PrecheckFromScreen['type']]: (m: Extract<PrecheckFromScreen, { type: K }>) => PrecheckToScreen | null }> = {}) {
  const listeners = new Set<Listener>()
  const posted: PrecheckFromScreen[] = []
  const emit = (data: PrecheckToScreen) => {
    for (const fn of listeners) fn({ data } as unknown as Event)
  }
  const defaults = {
    month: (m: { id: string; load: number }): PrecheckToScreen => ({ type: 'month', id: m.id, load: m.load, ok: true, visits: 5, months: ['2026-10'] }),
    loadPart: (m: { part: 'memos' | 'store'; id: string; load: number }): PrecheckToScreen => ({ type: 'loadPart', part: m.part, id: m.id, load: m.load, ok: true }),
    check: (m: { check: number; load: number }): PrecheckToScreen => ({ type: 'check', check: m.check, load: m.load, ok: true, view: VIEW, usedCopy: null }),
    excel: (m: { check: number }): PrecheckToScreen => ({ type: 'excel', check: m.check, ok: true, bytes: new ArrayBuffer(4), fileName: '사전점검_2026-10-28_2026-10-29.xlsx' }),
  }
  return {
    posted,
    emit,
    answers,
    of: <T extends PrecheckFromScreen['type']>(type: T) => posted.filter((m) => m.type === type) as Extract<PrecheckFromScreen, { type: T }>[],
    postMessage(message: unknown) {
      const m = message as PrecheckFromScreen
      posted.push(m)
      const answer = (answers as Record<string, ((x: unknown) => PrecheckToScreen | null) | undefined>)[m.type] ?? (defaults as Record<string, ((x: unknown) => PrecheckToScreen) | undefined>)[m.type]
      const reply = answer?.(m)
      if (reply) queueMicrotask(() => emit(reply))
    },
    addEventListener(type: string, fn: Listener) {
      if (type === 'message') listeners.add(fn)
    },
  }
}
type Fake = ReturnType<typeof fakeWorker>

function bridge(over: { month?: () => Promise<{ id: string; count: number }>; memos?: () => Promise<{ id: string; count: number }>; store?: (args: Record<string, unknown>) => Promise<{ id: string; count: number }>; dates?: () => Promise<{ days: DayCount[] }> } = {}) {
  let next = 0
  const stream = vi.fn((cmd: string, args: unknown) => {
    const made = cmd === 'claim.month' ? over.month : cmd === 'claim.memos' ? over.memos : over.store
    return made ? made(args as Record<string, unknown>) : Promise.resolve({ id: `${cmd}-${++next}`, count: 1 })
  })
  const call = vi.fn((_cmd: string, _args: unknown) => {
    void _cmd
    void _args
    return over.dates ? over.dates() : Promise.resolve({ days: DAYS })
  })
  return { stream, call }
}
type Bridge = ReturnType<typeof bridge>

function show(worker: Fake = fakeWorker(), link: Bridge = bridge()) {
  const channel = claimChannel(worker)
  const view = render(<ClaimScreen channel={channel} call={link.call as never} stream={link.stream as never} />)
  return { worker, link, channel, ...view }
}

/** 날짜 목록이 그려진 뒤 [자료 불러오기]를 누르고 점검 결과까지 간다 */
async function toResult(worker: Fake = fakeWorker(), link: Bridge = bridge()) {
  const made = show(worker, link)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
  await screen.findByRole('heading', { level: 2, name: '환자' })
  return { ...made, user }
}
const pills = () => within(screen.getByRole('group', { name: '환자 거르기' }))
const namesInList = () => within(screen.getByRole('table', { name: '환자' })).getAllByRole('button').map((b) => b.textContent)

beforeEach(() => {
  db.rules = []
  db.hospital = null
  db.counts = COUNTS
  db.failSettings = false
  db.failCounts = false
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-013.1 날짜 목록', () => {
  it('AC-013.1: 도우미와 서버 건수로 덜 끝난 날(오래된 날부터)·다 끝난 날(최근 날부터)을 그린다. 진료 0건인 날은 없다', async () => {
    const { link } = show()
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    expect(link.call).toHaveBeenCalledWith('claim.dates', expect.objectContaining({ from: expect.any(String), to: expect.any(String) }))
    const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent ?? '')
    expect(rows[0]).toBe('아직 입력 안 된 날짜')
    expect(rows[1]).toContain('10/28 (수)')
    expect(rows[1]).toContain('51명')
    expect(rows[1]).toContain('7명')
    expect(rows[1]).toContain('2명')
    expect(rows[1]).toContain('진행중 2/7')
    expect(rows[2]).toContain('10/29 (목)')
    expect(rows[2]).toContain('입력 전')
    expect(rows[3]).toBe('입력이 끝난 날짜')
    expect(rows[4]).toContain('10/27 (화)')
    expect(rows[4]).toContain('완료')
    expect(rows[5]).toContain('10/24 (토)')
    expect(rows.some((r) => r.includes('10/25'))).toBe(false)
    expect(screen.getByText('아직 입력 안 된 날짜 2일')).toBeTruthy()
  })

  it('AC-013.1: 마지막으로 바뀐 시각을 보인다', async () => {
    show()
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    expect(within(table).getAllByRole('row')[2].textContent).toContain('10월 28일 (수) 16:41에 바뀜')
  })

  it('화면 확인: 진행 표시에 목록 번호가 겹치지 않고, 표의 빈 머리 칸은 숨긴 글자 대신 aria-label이다(숨긴 글자는 좁은 화면을 옆으로 민다)', async () => {
    const { container } = show()
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    expect(container.querySelector('ol')?.getAttribute('class')).toContain('list-none')
    expect(within(table).getAllByRole('columnheader').filter((th) => th.textContent === '').map((th) => th.getAttribute('aria-label'))).toEqual(['기간에 넣기', '안내'])
    expect(table.querySelector('.sr-only')).toBeNull()
  })

  it('AC-013.1: 건수 표가 없으면(마이그레이션 전) 모든 날이 아직 불러오지 않은 날이다', async () => {
    db.counts = []
    show()
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    expect(within(table).getAllByRole('row').slice(1).map((r) => r.textContent)[0]).toBe('아직 입력 안 된 날짜')
    expect(screen.getByText('아직 입력 안 된 날짜 4일')).toBeTruthy()
    expect(screen.queryByText('입력이 끝난 날짜')).toBeNull()
  })

  it('AC-013.1: 건수를 못 읽어도 날짜 목록은 나오고 그렇게 알린다', async () => {
    db.failCounts = true
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(screen.getByText('입력 건수를 읽지 못해 비트 자료만으로 보여요.')).toBeTruthy()
  })

  it('AC-013.1: 진료한 날이 없으면 조용한 빈 상태다', async () => {
    show(fakeWorker(), bridge({ dates: () => Promise.resolve({ days: [] }) }))
    expect(await screen.findByText('진료한 날짜가 없어요.')).toBeTruthy()
  })

  it('AC-013.5: 날짜를 못 읽으면 오류 카드와 [다시 불러오기]가 보이고 누르면 다시 읽는다', async () => {
    const dates = vi.fn().mockRejectedValueOnce(new BridgeError('E-BIT-READ-FAILED')).mockResolvedValue({ days: DAYS })
    show(fakeWorker(), bridge({ dates }))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-BIT-READ-FAILED')
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('목업: [끝난 날짜 더 보기]는 끝난 날이 많을 때만 있고 누르면 나머지를 보인다', async () => {
    const many: DayCount[] = Array.from({ length: 5 }, (_, i) => ({ date: `2026-10-0${i + 1}`, visits: 1, memoInBit: 0 }))
    db.counts = many.map((d) => ({ visit_date: d.date, need_memo: 1, entered: 1, needs_check: 0, skipped: 0, updated_at: `${d.date}T01:00:00+00:00` }))
    show(fakeWorker(), bridge({ dates: () => Promise.resolve({ days: many }) }))
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    expect(within(table).queryByText('10/1 (목)')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: '끝난 날짜 더 보기' }))
    expect(within(table).getByText('10/1 (목)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '끝난 날짜 더 보기' })).toBeNull()
  })
})

describe('AC-013.2 기간 고르기', () => {
  it('AC-013.2: 처음 기간은 덜 끝난 날 전체이고 요약이 함께 보인다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe('2026-10-28')
    expect((screen.getByLabelText('끝') as HTMLInputElement).value).toBe('2026-10-29')
    expect(screen.getByText('진료한 날 2일 · 진료 환자 100명 · 메모 필요 7명')).toBeTruthy()
  })

  it('AC-013.2: 달을 넘긴 기간이면 달마다 따로 마감한다고 알린다', async () => {
    const days: DayCount[] = [
      { date: '2026-10-30', visits: 3, memoInBit: 0 },
      { date: '2026-11-02', visits: 4, memoInBit: 0 },
    ]
    show(fakeWorker(), bridge({ dates: () => Promise.resolve({ days }) }))
    expect(await screen.findByText('10월 1일 + 11월 1일이 함께 들어 있어요. 월말 마감은 달마다 따로 해요.')).toBeTruthy()
  })

  it('AC-013.2: 35일을 넘으면 안내가 나오고 [자료 불러오기]가 막힌다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    const user = userEvent.setup()
    const from = screen.getByLabelText('시작')
    await user.clear(from)
    await user.type(from, '2026-09-01')
    expect(screen.getByText('한 번에 35일까지 고를 수 있어요.')).toBeTruthy()
    expect((screen.getByRole('button', { name: '자료 불러오기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('목업: 표의 체크로 기간을 넓히고 좁힌다', async () => {
    show()
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    const user = userEvent.setup()
    await user.click(within(table).getByRole('checkbox', { name: '10월 27일' }))
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe('2026-10-27')
    await user.click(within(table).getByRole('checkbox', { name: '10월 27일' }))
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe('2026-10-28')
  })

  it('목업: [입력 안 된 날짜 모두]·[이번 주]·[지난주]가 기간을 바꾼다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '지난주' }))
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).not.toBe('2026-10-28')
    await user.click(screen.getByRole('button', { name: '입력 안 된 날짜 모두' }))
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe('2026-10-28')
    expect((screen.getByLabelText('끝') as HTMLInputElement).value).toBe('2026-10-29')
    await user.click(screen.getByRole('button', { name: '이번 주' }))
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).not.toBe('2026-10-28')
  })

  it('AC-013.2: 누른 동안 단추 대신 진행 상태를 보이고 다 받기 전에는 점검하지 않는다', async () => {
    let finish!: (value: { id: string; count: number }) => void
    const month = () => new Promise<{ id: string; count: number }>((resolve) => (finish = resolve))
    const worker = fakeWorker()
    show(worker, bridge({ month }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    expect(screen.queryByRole('button', { name: '자료 불러오기' })).toBeNull()
    expect(screen.getByText('비트에서 읽는 중')).toBeTruthy()
    expect(screen.getByText('다 받기 전에는 점검하지 않아요.')).toBeTruthy()
    expect(screen.getAllByRole('list').at(-1)?.getAttribute('class')).toContain('list-none')
    expect(worker.of('check')).toEqual([])
    finish({ id: 'm1', count: 1 })
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(worker.of('check')).toHaveLength(1)
  })

  it('AC-013.2·AC-013.13: 부르는 차례와 기간. 앞쪽은 claim.month만 읽고 점검은 고른 기간만 보인다', async () => {
    const worker = fakeWorker()
    const link = bridge()
    await toResult(worker, link)
    expect(link.stream.mock.calls.map(([cmd, args]) => [cmd, args])).toEqual([
      ['claim.month', { from: '2026-09-29', to: '2026-10-29' }],
      ['claim.memos', { from: '2026-10-28', to: '2026-10-29' }],
      ['store.load', { months: ['2026-10'] }],
      ['store.load', { settings: true }],
    ])
    expect(worker.of('check')[0]).toMatchObject({ visible: { from: '2026-10-28', to: '2026-10-29' } })
  })

  it('목업 [멈추기]: 진행 중 불러오기를 버리고 날짜 고르기로 돌아간다. 옛 답으로 점검하지 않는다', async () => {
    let finish!: (value: { id: string; count: number }) => void
    const month = () => new Promise<{ id: string; count: number }>((resolve) => (finish = resolve))
    const worker = fakeWorker()
    show(worker, bridge({ month }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await user.click(screen.getByRole('button', { name: '멈추기' }))
    expect(screen.getByRole('button', { name: '자료 불러오기' })).toBeTruthy()
    finish({ id: 'm1', count: 1 })
    await waitFor(() => expect(worker.of('month')).toHaveLength(1))
    await Promise.resolve()
    expect(worker.of('check')).toEqual([])
    expect(screen.queryByRole('heading', { level: 2, name: '환자' })).toBeNull()
  })
})

describe('AC-013.3 점검 결과', () => {
  it('AC-013.3: 위 줄에 기간·환자 수·점검 시각·켜진 규칙 수가 보인다', async () => {
    await toResult()
    expect(screen.getByText(/환자 5명/).textContent).toMatch(/^10\/28 \(수\) ~ 10\/29 \(목\) · 환자 5명 · \d\d:\d\d에 점검함 · 켜진 규칙 254개$/)
  })

  it('AC-013.3: 첫 환자가 열리고 경고가 보인다. 다른 환자를 누르면 바뀐다', async () => {
    const { user } = await toResult()
    expect(screen.getByRole('heading', { level: 2, name: /가상환자A/ })).toBeTruthy()
    expect(screen.getByText('관절 주사 간격')).toBeTruthy()
    expect(screen.getByText('IJ-05 내용')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '가상환자B' }))
    expect(screen.getByRole('heading', { level: 2, name: /가상환자B/ })).toBeTruthy()
    expect(screen.queryByText('IJ-05 내용')).toBeNull()
  })

  it('AC-013.3: 거르기 수가 맞다. 처음에는 경고 있는 환자만 보인다(상병 경고만 있는 환자도)', async () => {
    await toResult()
    const pill = (name: RegExp) => pills().getByRole('button', { name })
    expect(pill(/경고 있는 환자/).textContent).toContain('4')
    expect(pill(/경고 있는 환자/).getAttribute('aria-pressed')).toBe('true')
    expect(pill(/확인 필요/).textContent).toContain('1')
    expect(pill(/알림/).textContent).toContain('1')
    expect(pill(/참고/).textContent).toContain('1')
    expect(pill(/추천 상병 확인/).textContent).toContain('1')
    expect(pill(/경고 없음/).textContent).toContain('1')
    expect(namesInList()).toEqual(['가상환자A', '가상환자B', '가상환자C', '가상환자E'])
  })

  it.each([
    [/확인 필요/, ['가상환자A']],
    [/알림/, ['가상환자B']],
    [/참고/, ['가상환자C']],
    [/추천 상병 확인/, ['가상환자E']],
    [/경고 없음/, ['가상환자D']],
  ])('AC-013.3: %s로 거른다', async (name, want) => {
    const { user } = await toResult()
    await user.click(pills().getByRole('button', { name }))
    expect(pills().getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true')
    expect(namesInList()).toEqual(want)
  })

  it('AC-013.3: 규칙으로 거른다', async () => {
    const { user } = await toResult()
    await user.selectOptions(screen.getByLabelText('규칙으로 거르기'), 'PT-01')
    expect(namesInList()).toEqual(['가상환자A', '가상환자B'])
    await user.selectOptions(screen.getByLabelText('규칙으로 거르기'), '')
    expect(namesInList()).toHaveLength(4)
  })

  it('AC-013.3: 이름이나 차트번호로 찾는다', async () => {
    const { user } = await toResult()
    const search = screen.getByLabelText('환자 찾기')
    await user.type(search, '00031')
    expect(namesInList()).toEqual(['가상환자B'])
    await user.clear(search)
    await user.type(search, '자C')
    expect(namesInList()).toEqual(['가상환자C'])
  })

  it('AC-013.3: 고른 환자가 걸러져 사라지면 남은 첫 환자를 보인다', async () => {
    const { user } = await toResult()
    await user.click(pills().getByRole('button', { name: /참고/ }))
    expect(screen.getByRole('heading', { level: 2, name: /가상환자C/ })).toBeTruthy()
  })

  it('AC-013.3: 거른 결과가 없으면 조용히 알린다', async () => {
    const { user } = await toResult()
    await user.type(screen.getByLabelText('환자 찾기'), '없는환자')
    expect(screen.getByText('조건에 맞는 환자가 없어요.')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: /가상환자/ })).toBeNull()
  })

  it('목업: 8명씩 보이고 [다음 8명]으로 더 본다', async () => {
    const worker = fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: true, view: manyVisits(10), usedCopy: null }) })
    const { user } = await toResult(worker)
    expect(screen.getByText('1–8 / 10명')).toBeTruthy()
    expect(namesInList()).toHaveLength(8)
    await user.click(screen.getByRole('button', { name: '다음 8명' }))
    expect(namesInList()).toHaveLength(10)
    expect(screen.getByText('1–10 / 10명')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다음 8명' })).toBeNull()
  })

  it('AC-013.3: 진료가 없는 기간이면 조용히 알린다', async () => {
    const empty = { ...VIEW, visits: [], groups: [] }
    await toResultEmpty(empty)
    expect(screen.getByText('이 기간에 진료가 없어요.')).toBeTruthy()
  })

  it('목업: 진행 표시 [날짜 고르기]로 돌아가고 [점검 결과]로 다시 온다', async () => {
    const { user } = await toResult()
    await user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    expect(screen.getByRole('table', { name: '진료한 날짜' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /점검 결과/ }))
    expect(screen.getByRole('heading', { level: 2, name: '환자' })).toBeTruthy()
  })

  it('TASK-18 전: [비트에 입력]·[다음: 메모 확인]·메모 칸·나중에 확인·없는 화면으로 가는 단추를 그리지 않는다', async () => {
    await toResult()
    for (const name of [/비트에 입력/, /메모 확인/, /메모 이어서/, /월말 마감/]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
      expect(screen.queryByRole('link', { name })).toBeNull()
    }
    expect(screen.queryByText('메모 초안')).toBeNull()
    expect(screen.queryByText(/나중에 확인/)).toBeNull()
  })

  it('화면이 환자 자료를 저장소·주소·제목·로그에 두지 않는다', async () => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level))
    const stored = vi.spyOn(Storage.prototype, 'setItem')
    const href = location.href
    const title = document.title
    await toResult()
    expect(stored).not.toHaveBeenCalled()
    expect(location.href).toBe(href)
    expect(document.title).toBe(title)
    expect(JSON.stringify(history.state ?? null)).not.toContain('가상환자')
    for (const spy of logs) expect(spy).not.toHaveBeenCalled()
  })
})

async function toResultEmpty(view: ClaimView) {
  const worker = fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: true, view, usedCopy: null }) })
  const made = show(worker)
  await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
  await screen.findByText('이 기간에 진료가 없어요.')
  return made
}

describe('AC-013.4 엑셀 내려받기', () => {
  it('AC-013.4: Worker가 만든 바이트를 그 PC에 파일로 내려받는다. 서버로 보내지 않는다', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const clicked: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download })
    })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const worker = fakeWorker()
    const { user } = await toResult(worker)
    await user.click(screen.getByRole('button', { name: '엑셀 내려받기' }))
    await waitFor(() => expect(clicked).toEqual([{ href: 'blob:fake', download: '사전점검_2026-10-28_2026-10-29.xlsx' }]))
    const sent = worker.of('excel')
    expect(sent).toEqual([{ type: 'excel', check: worker.of('check')[0].check }])
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('AC-013.4: 걸린 경고가 없으면 내보낼 것이 없어 단추가 막힌다(원본도 내보내지 않는다)', async () => {
    const quiet: ClaimView = { ...VIEW, groups: [], visits: [visit('v1', '가상환자A', '00012', [])] }
    const worker = fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: true, view: quiet, usedCopy: null }) })
    await toResult(worker)
    expect((screen.getByRole('button', { name: '엑셀 내려받기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-013.4: 만들지 못하면 오류 카드를 보이고 점검 결과는 그대로 둔다', async () => {
    const worker = fakeWorker({ excel: (m) => ({ type: 'excel', check: m.check, ok: false, code: 'E-CLAIM-PARTIAL' }) })
    const { user } = await toResult(worker)
    await user.click(screen.getByRole('button', { name: '엑셀 내려받기' }))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-CLAIM-PARTIAL')
    expect(screen.getByRole('heading', { level: 2, name: '환자' })).toBeTruthy()
  })

  it('AC-013.4: 만드는 동안 다시 눌러도 또 묻지 않는다', async () => {
    const worker = fakeWorker({ excel: () => null })
    const { user } = await toResult(worker)
    const button = screen.getByRole('button', { name: '엑셀 내려받기' })
    await user.click(button)
    const busy = screen.getByRole('button', { name: '만드는 중…' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    await user.click(busy)
    expect(worker.of('excel')).toHaveLength(1)
  })
})

describe('AC-013.5 오류 카드', () => {
  async function failing(worker: Fake, link: Bridge = bridge()) {
    show(worker, link)
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    return screen.findByRole('alert')
  }

  it.each([
    ['E-CLAIM-PARTIAL', () => fakeWorker({ month: (m) => ({ type: 'month', id: m.id, load: m.load, ok: false, code: 'E-CLAIM-PARTIAL' }) })],
    ['E-RULES-LOAD-FAILED', () => fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: false, code: 'E-RULES-LOAD-FAILED' }) })],
    ['E-SETTINGS-FAILED', () => fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: false, code: 'E-SETTINGS-FAILED' }) })],
  ] as const)('AC-013.5·AC-013.14: %s면 점검 결과 없이 오류 카드와 [다시 불러오기]', async (code, make) => {
    const card = await failing(make())
    expect(card.textContent).toContain(errorInfo(code).what)
    expect(card.textContent).toContain(`오류 번호 ${code}`)
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: '환자' })).toBeNull()
    expect(screen.queryByText('가상환자A')).toBeNull()
  })

  it('AC-013.5: 읽기 오류(stream 거절)도 같다', async () => {
    const card = await failing(fakeWorker(), bridge({ month: () => Promise.reject(new BridgeError('E-BIT-READ-FAILED')) }))
    expect(card.textContent).toContain(errorInfo('E-BIT-READ-FAILED').what)
  })

  it('AC-013.5: errors.ts에 없는 번호는 번호만 보인다', async () => {
    const card = await failing(fakeWorker(), bridge({ month: () => Promise.reject(new BridgeError('E-NEW-THING')) }))
    expect(card.textContent).toBe('오류 번호 E-NEW-THING')
  })

  it('AC-013.5: [다시 불러오기]를 누르면 새 번호로 처음부터 부르고, 되면 결과가 보인다', async () => {
    const month = vi.fn().mockRejectedValueOnce(new BridgeError('E-BIT-READ-FAILED')).mockResolvedValue({ id: 'm2', count: 1 })
    const worker = fakeWorker()
    await failing(worker, bridge({ month }))
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByRole('heading', { level: 2, name: '환자' })
    const loads = worker.of('loadStart').map((m) => m.load)
    expect(loads).toHaveLength(2)
    expect(loads[1]).toBeGreaterThan(loads[0])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-013.2: 도우미가 claim.memos·store.load를 모르면(Phase 3 전) 그 자료 없이 점검한다', async () => {
    const unknown = () => Promise.reject(new BridgeError('E-HELPER-UNKNOWN-COMMAND'))
    await toResult(fakeWorker(), bridge({ memos: unknown, store: unknown }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-013.9: settings.dat만 다른 병원 파일이면 사본 없이 점검한다(서버 설정이 있으면 결과가 나온다)', async () => {
    const store = (args: Record<string, unknown>) => (args.settings ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: 'store1', count: 1 }))
    await toResult(fakeWorker(), bridge({ store }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-013.2: 달 파일이 다른 병원 파일이면 멈추고 오류 카드다(AC-018.17 안내는 TASK-18)', async () => {
    const store = (args: Record<string, unknown>) => (args.months ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: 'copy1', count: 1 }))
    const worker = fakeWorker()
    const card = await failing(worker, bridge({ store }))
    expect(card.textContent).toContain('오류 번호 E-BIT-HOSPITAL-MISMATCH')
    expect(worker.of('check')).toEqual([])
  })

  it('AC-013.11: claim.memos가 다른 번호로 거절되면 멈춘다', async () => {
    const worker = fakeWorker()
    const card = await failing(worker, bridge({ memos: () => Promise.reject(new BridgeError('E-BIT-READ-FAILED')) }))
    expect(card.textContent).toContain('E-BIT-READ-FAILED')
    expect(worker.of('check')).toEqual([])
  })
})

describe('AC-013.6 설정이 바뀌었을 때', () => {
  const focus = () => window.dispatchEvent(new Event('focus'))

  it('AC-013.6: 점검 뒤 설정이 그대로면 띠가 없다', async () => {
    await toResult()
    focus()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByText('설정이 바뀌었어요. 다시 점검하세요')).toBeNull()
  })

  it('AC-013.6: 창 초점이 돌아올 때 다시 읽어 다르면 띠와 [다시 점검]이 보이고, 누르면 달을 다시 받지 않고 새 설정으로 점검한다', async () => {
    const worker = fakeWorker()
    const link = bridge()
    const { user } = await toResult(worker, link)
    db.rules = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]
    focus()
    await screen.findByText('설정이 바뀌었어요. 다시 점검하세요')
    expect(screen.getByRole('heading', { level: 2, name: '환자' })).toBeTruthy() // 결과는 그대로 보인다
    const streamed = link.stream.mock.calls.length
    await user.click(screen.getByRole('button', { name: '다시 점검' }))
    await waitFor(() => expect(screen.queryByText('설정이 바뀌었어요. 다시 점검하세요')).toBeNull())
    expect(link.stream.mock.calls.length).toBe(streamed)
    expect(worker.of('loadStart')).toHaveLength(1)
    const checks = worker.of('check')
    expect(checks).toHaveLength(2)
    expect(checks[1].settings?.rules.off).toEqual(['IJ-05'])
    expect(checks[1].check).toBeGreaterThan(checks[0].check)
  })

  it('AC-013.6: 다시 읽기가 실패하면 띠를 띄우지 않는다', async () => {
    await toResult()
    db.failSettings = true
    focus()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByText('설정이 바뀌었어요. 다시 점검하세요')).toBeNull()
  })

  it('AC-013.6: 도로 같아지면 띠가 사라진다', async () => {
    await toResult()
    db.rules = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]
    focus()
    await screen.findByText('설정이 바뀌었어요. 다시 점검하세요')
    db.rules = []
    focus()
    await waitFor(() => expect(screen.queryByText('설정이 바뀌었어요. 다시 점검하세요')).toBeNull())
  })

  it('AC-013.5: [다시 점검]이 실패하면 옛 결과를 보이지 않고 오류 카드다', async () => {
    const worker = fakeWorker()
    const { user } = await toResult(worker)
    worker.answers.check = (m) => ({ type: 'check', check: m.check, load: m.load, ok: false, code: 'E-SETTINGS-FAILED' })
    db.rules = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]
    focus()
    await user.click(await screen.findByRole('button', { name: '다시 점검' }))
    await screen.findByRole('alert')
    expect(screen.queryByText('가상환자A')).toBeNull()
  })
})

describe('AC-013.9 서버 설정을 읽지 못했을 때', () => {
  const COPY: CheckSettings = { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: null, dxLinks: [] }

  it('AC-013.9: 서버 설정을 읽으면 그 설정을 Worker에 넘긴다', async () => {
    db.hospital = { phrases: { a: 1 }, dx_links: [['A', 'B', 'C', 0, 't']] }
    const worker = fakeWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings).toEqual({ rules: { schema: 1, off: [], on: [], grade: [] }, phrases: { a: 1 }, dxLinks: [['A', 'B', 'C', 0, 't']] })
  })

  it('AC-013.9: 병원 설정 줄이 없으면 phrases는 null, 연결표는 비어 있다', async () => {
    const worker = fakeWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings).toEqual({ rules: { schema: 1, off: [], on: [], grade: [] }, phrases: null, dxLinks: [] })
  })

  it('AC-013.9: 못 읽으면 settings: null로 묻고, 사본으로 점검했다는 답이면 안내를 보인다', async () => {
    db.failSettings = true
    const worker = fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: true, view: VIEW, usedCopy: COPY }) })
    await toResult(worker)
    expect(worker.of('check')[0].settings).toBeNull()
    expect(screen.getByText('서버에 닿지 않아 마지막으로 받은 설정을 씁니다')).toBeTruthy()
  })

  it('AC-013.9: 사본도 없어 Worker가 E-SETTINGS-FAILED면 점검 결과 없이 오류 카드다', async () => {
    db.failSettings = true
    const worker = fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: false, code: 'E-SETTINGS-FAILED' }) })
    show(worker)
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-SETTINGS-FAILED')
  })

  it('AC-013.6·AC-013.9: 사본으로 점검한 뒤 서버 설정이 사본과 다르면 띠가 뜬다', async () => {
    db.failSettings = true
    const worker = fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: true, view: VIEW, usedCopy: COPY }) })
    await toResult(worker)
    db.failSettings = false
    db.rules = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]
    window.dispatchEvent(new Event('focus'))
    expect(await screen.findByText('설정이 바뀌었어요. 다시 점검하세요')).toBeTruthy()
  })
})

describe('AC-013.10·AC-013.12 번호', () => {
  it('AC-013.10: 마지막 번호의 month가 ok:true일 때만 점검한다(ok:false면 stream이 끝났어도 하지 않는다)', async () => {
    const worker = fakeWorker({ month: (m) => ({ type: 'month', id: m.id, load: m.load, ok: false, code: 'E-CLAIM-PARTIAL' }) })
    show(worker)
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('alert')
    expect(worker.of('check')).toEqual([])
  })

  it('AC-013.12: 화면을 내렸다 올린 뒤 같은 번호를 보내지 않는다', async () => {
    const worker = fakeWorker()
    const first = show(worker)
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('heading', { level: 2, name: '환자' })
    first.unmount()
    show(worker)
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('heading', { level: 2, name: '환자' })
    const loads = worker.of('loadStart').map((m) => m.load)
    expect(new Set(loads).size).toBe(loads.length)
    expect([...loads].sort((a, b) => a - b)).toEqual(loads)
    const checks = worker.of('check').map((m) => m.check)
    expect(new Set(checks).size).toBe(checks.length)
  })

  it('화면을 떠나면 Worker의 달을 버린다(loadStart로 비운다)', async () => {
    const worker = fakeWorker()
    const first = show(worker)
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('heading', { level: 2, name: '환자' })
    const before = worker.of('loadStart').length
    first.unmount()
    expect(worker.of('loadStart')).toHaveLength(before + 1)
  })

  it('AC-013.12: 떠난 화면의 답은 새 화면에 영향이 없다', async () => {
    let finish!: (value: { id: string; count: number }) => void
    const worker = fakeWorker()
    const first = show(worker, bridge({ month: () => new Promise((resolve) => (finish = resolve)) }))
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    first.unmount()
    show(worker)
    await screen.findByRole('button', { name: '자료 불러오기' })
    finish({ id: 'old', count: 1 })
    await waitFor(() => expect(worker.of('month')).toHaveLength(1))
    await Promise.resolve()
    expect(worker.of('check')).toEqual([])
    expect(screen.queryByRole('heading', { level: 2, name: '환자' })).toBeNull()
  })
})
