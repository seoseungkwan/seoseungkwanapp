// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import { ERRORS, EXCEL_FAILED, errorInfo } from '@/lib/errors'
import type { DayCount } from '@/types/bridge'
import type { CheckSettings, ClaimView, ClaimVisitView, Finding, Grade, MemoScreenView, PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import { claimChannel } from './claimLoad'
import { SETUP_CODES } from './ClaimError'
import { ClaimScreen } from './ClaimScreen'

// 청구 화면(REQ-013). 가짜 통로·가짜 Worker로 화면만 본다. 이름·차트번호는 모두 지어낸 것이다. 실제 DB에 붙지 않는다

const db = vi.hoisted(() => ({
  rules: [] as unknown[],
  hospital: null as unknown,
  counts: [] as unknown[],
  failSettings: false,
  failCounts: false,
  /** 완료 표시 표(claim-day-done). error면 그 답을 준다 */
  closes: [] as unknown[],
  closesError: null as null | { code: string; message: string; status: number },
  /** 표마다 gte·lte로 물은 날짜 */
  ranges: [] as { table: string; op: string; value: unknown }[],
  /** 보낸 쓰기(claim-day-done-pc). 성공하면 claim_day_closes는 서버처럼 바뀐다 */
  writes: [] as { table: string; method: string; payload: unknown; options: unknown; filters: unknown[][] }[],
  writeFail: false,
  /** 있으면 쓰기가 이것을 기다린다 */
  writeGate: null as Promise<void> | null,
  userId: 'user-1' as string | null,
  ruleReads: 0,
  /** 있으면 설정 표 읽기가 이것을 기다린다(건수 표는 그대로) */
  settingsGate: null as Promise<void> | null,
  /** 고시로 바뀐 규칙 판(rule-auto): 살아 있는 change 줄(rule_changes)과 내 병원이 되돌린 표시(rule_change_marks) */
  changes: [] as unknown[],
  marks: [] as unknown[],
  /** 이 표 읽기만 실패한다 */
  failTable: null as string | null,
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: db.userId ? { user: { id: db.userId } } : null }, error: null }) },
    from(table: string) {
      if (table === 'claim_rule_settings') db.ruleReads += 1
      const answer = () => {
        if (table === 'claim_day_counts') return db.failCounts ? { data: null, error: { code: '500', message: 'x' }, status: 500 } : { data: db.counts, error: null, status: 200 }
        if (table === 'claim_day_closes') return db.closesError ? { data: null, error: db.closesError, status: db.closesError.status } : { data: db.closes, error: null, status: 200 }
        if (db.failSettings || db.failTable === table) return { data: null, error: { message: 'x' } }
        if (table === 'rule_changes') return { data: db.changes, error: null }
        if (table === 'rule_change_marks') return { data: db.marks, error: null }
        return table === 'claim_rule_settings' ? { data: db.rules, error: null } : { data: db.hospital, error: null }
      }
      const gate = table === 'claim_day_counts' || table === 'claim_day_closes' ? null : db.settingsGate
      const read = () => (gate ? gate.then(answer) : Promise.resolve(answer()))
      const query = {
        gte: (_column: string, value: unknown) => (db.ranges.push({ table, op: 'gte', value }), query),
        lte: (_column: string, value: unknown) => (db.ranges.push({ table, op: 'lte', value }), query),
        // 바뀐 판 읽기(lib/storage/ruleChanges readRuleUpdates)의 거르기·차례·상한. 가짜 표에는 살아 있는 change 줄·되돌린 표시만 둔다
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: read,
        then: (ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) => read().then(ok, no),
      }
      const write = (method: string, payload: unknown, options: unknown, filters: unknown[][]) => {
        db.writes.push({ table, method, payload, options, filters })
        const answer = () => {
          if (db.writeFail) return { error: { code: '500', message: 'x' } }
          if (table === 'claim_day_closes' && method === 'upsert') {
            for (const { visit_date } of payload as { visit_date: string }[]) {
              if (!(db.closes as { visit_date: string }[]).some((c) => c.visit_date === visit_date)) db.closes = [...db.closes, { visit_date, closed_at: '2026-11-08T01:05:00+00:00' }]
            }
          }
          if (table === 'claim_day_closes' && method === 'delete') {
            const gone = filters[0][2] as string[]
            db.closes = (db.closes as { visit_date: string }[]).filter((c) => !gone.includes(c.visit_date))
          }
          return { error: null }
        }
        const gate = db.writeGate
        return { then: (ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) => (gate ? gate.then(answer) : Promise.resolve().then(answer)).then(ok, no) }
      }
      return {
        select: () => query,
        upsert: (rows: unknown, options: unknown) => write('upsert', rows, options, []),
        delete: () => ({ in: (column: string, values: unknown) => write('delete', null, null, [['in', column, values]]) }),
        // 입력 방식 저장(clinic-profile AC-6610.2): update(값).eq(칸, 값)
        update: (payload: unknown) => ({ eq: (column: string, value: unknown) => write('update', payload, null, [['eq', column, value]]) }),
      }
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
  { visit_date: '2026-10-24', visits: 20, need_memo: 2, entered: 2, needs_check: 0, skipped: 0, updated_at: '2026-10-24T07:41:00+00:00' },
  { visit_date: '2026-10-27', visits: 50, need_memo: 8, entered: 8, needs_check: 0, skipped: 0, updated_at: '2026-10-27T07:41:00+00:00' },
  { visit_date: '2026-10-28', visits: 51, need_memo: 7, entered: 2, needs_check: 0, skipped: 0, updated_at: '2026-10-28T07:41:00+00:00' },
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
  const errorListeners = new Set<Listener>()
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
      if (type === 'error') errorListeners.add(fn)
    },
    /** Worker가 시작하지 못함 */
    fail() {
      for (const fn of errorListeners) fn(new Event('error'))
    },
  }
}
type Fake = ReturnType<typeof fakeWorker>

/** 도우미 등록: bit.check 답. 기관기호는 지어낸 것이다 */
const REGISTERED = { steps: [{ name: 'find', ok: true }, { name: 'db', ok: true }, { name: 'registration', ok: true }], registered: true, institutionCode: '12345678' }

function bridge(over: { month?: () => Promise<{ id: string; count: number }>; memos?: () => Promise<{ id: string; count: number }>; store?: (args: Record<string, unknown>) => Promise<{ id: string; count: number }>; dates?: () => Promise<{ days: DayCount[] }>; check?: () => Promise<unknown> } = {}) {
  let next = 0
  const stream = vi.fn((cmd: string, args: unknown) => {
    const made = cmd === 'claim.month' ? over.month : cmd === 'claim.memos' ? over.memos : over.store
    return made ? made(args as Record<string, unknown>) : Promise.resolve({ id: `${cmd}-${++next}`, count: 1 })
  })
  const call = vi.fn((cmd: string, _args: unknown) => {
    void _args
    if (cmd === 'bit.check') return over.check ? over.check() : Promise.resolve(REGISTERED)
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
  db.closes = []
  db.closesError = null
  db.ranges = []
  db.writes = []
  db.writeFail = false
  db.writeGate = null
  db.userId = 'user-1'
  db.ruleReads = 0
  db.settingsGate = null
  db.changes = []
  db.marks = []
  db.failTable = null
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
    db.counts = many.map((d) => ({ visit_date: d.date, visits: d.visits, need_memo: 1, entered: 1, needs_check: 0, skipped: 0, updated_at: `${d.date}T01:00:00+00:00` }))
    show(fakeWorker(), bridge({ dates: () => Promise.resolve({ days: many }) }))
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    expect(within(table).queryByText('10/1 (목)')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: '끝난 날짜 더 보기' }))
    expect(within(table).getByText('10/1 (목)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '끝난 날짜 더 보기' })).toBeNull()
  })
})

describe('claim-day-done: 비트 PC 화면도 완료로 바꾼 날을 끝난 날로 본다(REQ-2804)', () => {
  const close = (visit_date: string) => ({ visit_date, closed_at: '2026-11-07T22:30:00+00:00' })
  const listRows = async () => within(await screen.findByRole('table', { name: '진료한 날짜' })).getAllByRole('row').slice(1).map((r) => r.textContent ?? '')

  it('AC-2804.4: 날짜 목록을 읽을 때 완료 표시도 읽어, 완료로 바꾼 날은 끝난 날 묶음에 완료로 든다', async () => {
    db.closes = [close('2026-10-28')]
    show()
    const rows = await listRows()
    const finishedAt = rows.indexOf('입력이 끝난 날짜')
    const at = rows.findIndex((r) => r.includes('10/28 (수)'))
    expect(finishedAt).toBeGreaterThan(-1)
    expect(at).toBeGreaterThan(finishedAt)
    expect(rows[at]).toContain('완료')
    expect(screen.getByText('아직 입력 안 된 날짜 1일')).toBeTruthy()
  })

  it('AC-2804.4: 완료 표시는 건수와 같은 400일 범위로 읽는다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    const of = (table: string) => db.ranges.filter((r) => r.table === table).map((r) => [r.op, r.value])
    expect(of('claim_day_closes')).toEqual(of('claim_day_counts'))
    expect(of('claim_day_closes')).toHaveLength(2)
  })

  it('AC-2804.4: 완료로 바꾼 옛날 날은 claim.dates로 묻는 기간을 늘리지 않는다', async () => {
    db.counts = [...COUNTS, { visit_date: '2026-06-02', visits: 9, need_memo: 3, entered: 1, needs_check: 0, skipped: 0, updated_at: '2026-06-02T01:00:00+00:00' }]
    const { link } = show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(link.call).toHaveBeenCalledWith('claim.dates', expect.objectContaining({ from: '2026-06-02' }))
    cleanup()
    db.closes = [close('2026-06-02')]
    const again = show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(again.link.call).toHaveBeenCalledWith('claim.dates', expect.objectContaining({ from: expect.any(String) }))
    expect(again.link.call).not.toHaveBeenCalledWith('claim.dates', expect.objectContaining({ from: '2026-06-02' }))
  })

  it('AC-2804.4: 완료 표시만 못 읽으면 읽은 건수로 목록을 그리고, 건수를 못 읽었을 때와 같이 알린다', async () => {
    db.closesError = { code: '500', message: 'x', status: 500 }
    show()
    const rows = await listRows()
    expect(rows.find((r) => r.includes('10/28 (수)'))).toContain('진행중 2/7')
    expect(rows.find((r) => r.includes('10/27 (화)'))).toContain('완료')
    expect(screen.getByText('입력 건수를 읽지 못해 비트 자료만으로 보여요.')).toBeTruthy()
  })

  it('AC-2804.4: 완료 표시 표가 아직 없으면(마이그레이션 전) 완료 표시 없음이고 실패가 아니다', async () => {
    db.closesError = { code: 'PGRST205', message: 'x', status: 404 }
    show()
    const rows = await listRows()
    expect(rows.find((r) => r.includes('10/28 (수)'))).toContain('진행중 2/7')
    expect(screen.queryByText('입력 건수를 읽지 못해 비트 자료만으로 보여요.')).toBeNull()
  })

  it('AC-2804.4: 창 초점이 돌아와 새로 읽을 때도 완료 표시를 읽는다', async () => {
    show()
    expect((await listRows()).find((r) => r.includes('10/28 (수)'))).toContain('진행중 2/7')
    db.closes = [close('2026-10-28')]
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(screen.getByText('아직 입력 안 된 날짜 1일')).toBeTruthy())
  })

  it('AC-2804.4: 새로 읽을 때 완료 표시를 못 읽으면 보던 목록을 둔다', async () => {
    db.closes = [close('2026-10-28')]
    show()
    await screen.findByText('아직 입력 안 된 날짜 1일')
    db.closesError = { code: '500', message: 'x', status: 500 }
    db.closes = []
    window.dispatchEvent(new Event('focus'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(screen.getByText('아직 입력 안 된 날짜 1일')).toBeTruthy()
    expect(screen.queryByText('입력 건수를 읽지 못해 비트 자료만으로 보여요.')).toBeNull()
  })

  it('AC-2903.2: 비트 PC 화면에는 휴대폰용 체크 칸(… 고르기)·"완료로 바꾼 날" 접는 칸이 없다(claim-day-done AC-2804.5를 대신한다)', async () => {
    db.closes = [close('2026-10-28')]
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(screen.queryByRole('checkbox', { name: /고르기$/ })).toBeNull()
    expect(screen.queryByText(/완료로 바꾼 날/)).toBeNull()
  })
})

describe('claim-day-done-pc: 비트 PC 화면에서 고른 기간의 날짜를 완료로 저장(REQ-2901·2902·2903)', () => {
  const close = (visit_date: string, closed_at = '2026-11-07T22:30:00+00:00') => ({ visit_date, closed_at })
  const bar = async () => (await screen.findByText(/^고른 기간에서 아직 입력 안 된 날|일을 완료로 바꿨어요$/)).parentElement as HTMLElement
  const saveButton = () => screen.getByRole('button', { name: /^(고른 날 완료로 저장|저장 중…)$/ }) as HTMLButtonElement
  const table = () => screen.getByRole('table', { name: '진료한 날짜' })
  const rowOf = (label: string) => within(table()).getAllByRole('row').find((r) => (r.textContent ?? '').includes(label)) as HTMLElement
  const groupOf = (label: string) => {
    const texts = within(table()).getAllByRole('row').map((r) => r.textContent ?? '')
    const at = texts.findIndex((t) => t.includes(label))
    const finishedAt = texts.indexOf('입력이 끝난 날짜')
    return finishedAt > -1 && at > finishedAt ? 'finished' : 'unfinished'
  }

  it('AC-2901.1: 표 위 고르기 줄에 고른 기간의 아직 입력 안 된 날 수와 [고른 날 완료로 저장]이 있다. 0일이면 단추가 막힌다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect((await bar()).textContent).toContain('고른 기간에서 아직 입력 안 된 날 2일')
    expect(saveButton().disabled).toBe(false)
    cleanup()
    db.closes = [close('2026-10-28'), close('2026-10-29')]
    show()
    await screen.findByText('아직 입력 안 된 날짜 0일')
    expect((await bar()).textContent).toContain('고른 기간에서 아직 입력 안 된 날 0일')
    expect(saveButton().disabled).toBe(true)
  })

  it('AC-2901.2: 체크 칸으로 기간을 바꾸면 날 수가 바로 바뀐다', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    await user.click(screen.getByRole('checkbox', { name: '10월 29일' }))
    expect((await bar()).textContent).toContain('고른 기간에서 아직 입력 안 된 날 1일')
  })

  it('AC-2901.3·AC-2903.1: [고른 날 완료로 저장]은 claim_day_closes에 고른 기간의 덜 끝난 날만 visit_date 하나씩 한 번 보낸다. 기다리는 동안 "저장 중…"으로 막힌다', async () => {
    const user = userEvent.setup()
    let open = () => {}
    db.writeGate = new Promise<void>((resolve) => {
      open = resolve
    })
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    await user.click(screen.getByRole('checkbox', { name: '10월 27일' })) // 끝난 날을 기간에 넣어도 보내지 않는다
    await user.click(saveButton())
    expect(saveButton().textContent).toBe('저장 중…')
    expect(saveButton().disabled).toBe(true)
    expect(db.writes).toHaveLength(1)
    expect(db.writes[0].table).toBe('claim_day_closes')
    expect(db.writes[0].method).toBe('upsert')
    expect(db.writes[0].payload).toEqual([{ visit_date: '2026-10-28' }, { visit_date: '2026-10-29' }])
    await act(async () => open())
  })

  it('AC-2901.4·AC-2902.1: 저장이 성공하면 다시 읽어 그 날들이 끝난 날로 내려가고 "완료로 바꿈 · 시각"·[되돌리기]가 있다. 알림 줄은 "2일을 완료로 바꿨어요"와 [되돌리기]다', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    await user.click(saveButton())
    await screen.findByText('2일을 완료로 바꿨어요')
    await waitFor(() => expect(screen.getByText('아직 입력 안 된 날짜 0일')).toBeTruthy())
    expect(groupOf('10/28 (수)')).toBe('finished')
    expect(rowOf('10/28 (수)').textContent).toContain('완료로 바꿈 · 11월 8일 (일) 10:05')
    expect(rowOf('10/28 (수)').textContent).toContain('7명') // 숫자는 그대로
    expect(within(rowOf('10/28 (수)')).getByRole('button', { name: '10/28 (수) 되돌리기' })).toBeTruthy()
    // 숫자로 끝난 날에는 [되돌리기]가 없다(줄 끝 [이 날만]은 모든 줄에 있다, claim-learn AC-9311.1)
    expect(within(rowOf('10/27 (화)')).queryByRole('button', { name: /되돌리기/ })).toBeNull()
  })

  it('AC-2901.4: 알림의 [되돌리기]는 방금 바꾼 날을 지우는 요청 하나이고, 기간을 바꾸면 알림이 사라진다', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    await user.click(saveButton())
    await screen.findByText('2일을 완료로 바꿨어요')
    await user.click(within(await bar()).getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(screen.getByText('아직 입력 안 된 날짜 2일')).toBeTruthy())
    expect(db.writes.map((w) => [w.table, w.method])).toEqual([
      ['claim_day_closes', 'upsert'],
      ['claim_day_closes', 'delete'],
    ])
    expect((db.writes[1].filters[0][2] as string[]).slice().sort()).toEqual(['2026-10-28', '2026-10-29'])
    await user.click(saveButton())
    await screen.findByText('2일을 완료로 바꿨어요')
    await user.click(screen.getByRole('checkbox', { name: '10월 27일' })) // 끝난 날은 앞 3줄만 보인다
    await waitFor(() => expect(screen.queryByText('2일을 완료로 바꿨어요')).toBeNull())
    expect((await bar()).textContent).toContain('고른 기간에서 아직 입력 안 된 날')
  })

  it('AC-2901.5: 저장이 실패하면 목록·기간은 그대로이고 E-DAYCLOSE-FAILED 안내가 보이며, 다시 누르면 안내가 사라진다', async () => {
    const user = userEvent.setup()
    db.writeFail = true
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    await user.click(saveButton())
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('E-DAYCLOSE-FAILED')
    expect(screen.getByText('아직 입력 안 된 날짜 2일')).toBeTruthy()
    expect(saveButton().disabled).toBe(false)
    db.writeFail = false
    await user.click(saveButton())
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await screen.findByText('2일을 완료로 바꿨어요')
  })

  it('AC-2902.2: 끝난 날 줄의 [되돌리기]는 그 날짜 하나를 지우고, 다시 읽어 아직 입력 안 된 날짜로 돌아간다', async () => {
    const user = userEvent.setup()
    db.closes = [close('2026-10-28')]
    show()
    await screen.findByText('아직 입력 안 된 날짜 1일')
    expect(groupOf('10/28 (수)')).toBe('finished')
    await user.click(within(rowOf('10/28 (수)')).getByRole('button', { name: '10/28 (수) 되돌리기' }))
    await waitFor(() => expect(screen.getByText('아직 입력 안 된 날짜 2일')).toBeTruthy())
    expect(groupOf('10/28 (수)')).toBe('unfinished')
    expect(db.writes).toHaveLength(1)
    expect(db.writes[0]).toMatchObject({ table: 'claim_day_closes', method: 'delete', filters: [['in', 'visit_date', ['2026-10-28']]] })
  })

  it('AC-2902.2: 되돌리기가 실패하면 그 줄은 끝난 날에 그대로이고 E-DAYCLOSE-FAILED 안내다', async () => {
    const user = userEvent.setup()
    db.closes = [close('2026-10-28')]
    db.writeFail = true
    show()
    await screen.findByText('아직 입력 안 된 날짜 1일')
    await user.click(within(rowOf('10/28 (수)')).getByRole('button', { name: '10/28 (수) 되돌리기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('E-DAYCLOSE-FAILED')
    expect(groupOf('10/28 (수)')).toBe('finished')
  })

  it('AC-2902.3: 완료 표시 날도 끝난 날 묶음의 같은 차례(최근 날부터)다', async () => {
    db.closes = [close('2026-10-28')]
    show()
    await screen.findByText('아직 입력 안 된 날짜 1일')
    const texts = within(table()).getAllByRole('row').map((r) => r.textContent ?? '')
    const finished = texts.slice(texts.indexOf('입력이 끝난 날짜') + 1).map((t) => t.match(/^\d+\/\d+ \(.\)/)?.[0])
    expect(finished).toEqual(['10/28 (수)', '10/27 (화)', '10/24 (토)'])
  })

  it('AC-2901.1: 고른 기간이 불러올 수 없는 기간(35일 넘음)이면 [고른 날 완료로 저장]도 막힌다', async () => {
    const user = userEvent.setup()
    const days = [{ date: '2026-09-01', visits: 9, memoInBit: 0 }, ...DAYS]
    db.counts = [...COUNTS, { visit_date: '2026-09-01', visits: 9, need_memo: 3, entered: 1, needs_check: 0, skipped: 0, updated_at: '2026-09-01T01:00:00+00:00' }]
    show(fakeWorker(), bridge({ dates: () => Promise.resolve({ days }) }))
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(saveButton().disabled).toBe(false)
    await user.click(screen.getByRole('checkbox', { name: '10월 29일' })) // 9/1~10/29: 59일
    await waitFor(() => expect(saveButton().disabled).toBe(true))
  })

  it('AC-2901.1: 건수나 완료 표시를 읽지 못해 비트 자료만으로 보이면 [고른 날 완료로 저장]이 막힌다(끝난 날·이미 바꾼 날을 보낼 수 있어서)', async () => {
    db.closesError = { code: '500', message: 'x', status: 500 }
    show()
    await screen.findByText('입력 건수를 읽지 못해 비트 자료만으로 보여요.')
    expect(saveButton().disabled).toBe(true)
  })

  it('AC-2901.4: 저장하는 사이에 기간을 바꾸면 끝난 뒤 옛 기간의 알림을 띄우지 않는다', async () => {
    const user = userEvent.setup()
    let open = () => {}
    db.writeGate = new Promise<void>((resolve) => {
      open = resolve
    })
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    await user.click(saveButton())
    await user.click(screen.getByRole('checkbox', { name: '10월 27일' }))
    await act(async () => open())
    await waitFor(() => expect(saveButton().textContent).toBe('고른 날 완료로 저장'))
    expect(screen.queryByText('2일을 완료로 바꿨어요')).toBeNull()
  })

  it('AC-2901.4: [자료 불러오기]를 누르면 저장 알림을 거둔다', async () => {
    const user = userEvent.setup()
    show(fakeWorker(), bridge({ month: () => new Promise(() => {}) }))
    await screen.findByRole('table', { name: '진료한 날짜' })
    await user.click(saveButton())
    await screen.findByText('2일을 완료로 바꿨어요')
    await user.click(screen.getByRole('button', { name: '자료 불러오기' }))
    await waitFor(() => expect(screen.queryByText('2일을 완료로 바꿨어요')).toBeNull())
  })

  it('AC-2901.6: 자료를 불러오는 중에는 [고른 날 완료로 저장]과 [되돌리기]가 막힌다', async () => {
    const user = userEvent.setup()
    db.closes = [close('2026-10-24')]
    show(fakeWorker(), bridge({ month: () => new Promise(() => {}) }))
    await screen.findByRole('table', { name: '진료한 날짜' })
    await user.click(screen.getByRole('button', { name: '자료 불러오기' }))
    await waitFor(() => expect(saveButton().disabled).toBe(true))
    expect((within(rowOf('10/24 (토)')).getByRole('button', { name: '10/24 (토) 되돌리기' }) as HTMLButtonElement).disabled).toBe(true)
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

  it.each(['0002-10-28', '0020-10-28', '202610-10-29'])('AC-013.2: 연도를 치는 중간 값 %s가 들어가도 화면이 깨지지 않고 표·기간이 그대로다', async (value) => {
    show()
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    const from = screen.getByLabelText('시작') as HTMLInputElement
    fireEvent.change(from, { target: { value } })
    expect(from.value).toBe(value)
    expect(screen.getByRole('table', { name: '진료한 날짜' })).toBe(table)
    expect((screen.getByLabelText('끝') as HTMLInputElement).value).toBe('2026-10-29')
    expect(screen.getByText('날짜를 골라 주세요')).toBeTruthy()
    expect((screen.getByRole('button', { name: '자료 불러오기' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.setup().click(within(table).getByRole('checkbox', { name: '10월 28일' }))
    expect(from.value).toBe('2026-10-28')
    expect((screen.getByLabelText('끝') as HTMLInputElement).value).toBe('2026-10-28')
  })

  it('AC-013.2: 끝 칸의 중간 값도 같다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    fireEvent.change(screen.getByLabelText('끝'), { target: { value: '0020-10-28' } })
    expect(screen.getByText('날짜를 골라 주세요')).toBeTruthy()
  })

  it('AC-013.2: 날짜 칸은 연도를 네 자리까지만 받는다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(screen.getByLabelText('시작').getAttribute('max')).toBe('9999-12-31')
    expect(screen.getByLabelText('끝').getAttribute('max')).toBe('9999-12-31')
  })

  it('AC-013.2: 건수 표가 없어 60일이 모두 덜 끝난 날이어도 [입력 안 된 날짜 모두]가 35일 안내로 막히지 않는다', async () => {
    db.counts = []
    const days: DayCount[] = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), visits: 1, memoInBit: 0 }))
    show(fakeWorker(), bridge({ dates: () => Promise.resolve({ days }) }))
    await screen.findByRole('table', { name: '진료한 날짜' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '이번 주' }))
    await user.click(screen.getByRole('button', { name: '입력 안 된 날짜 모두' }))
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe('2026-09-01')
    expect((screen.getByLabelText('끝') as HTMLInputElement).value).toBe('2026-10-05')
    expect(screen.queryByText('한 번에 35일까지 고를 수 있어요.')).toBeNull()
    expect((screen.getByRole('button', { name: '자료 불러오기' }) as HTMLButtonElement).disabled).toBe(false)
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
    expect(within(screen.getByRole('status')).getByText('비트에서 읽는 중')).toBeTruthy() // 화면 읽기 도구도 진행을 듣는다
    expect(screen.getByText('다른 탭으로 옮기면 불러오기가 멈춰요')).toBeTruthy()
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

  it('AC-013.3: 나중에 확인·없는 화면으로 가는 단추를 그리지 않는다. 메모가 없는 진료에는 메모 초안이 없다', async () => {
    await toResult()
    for (const name of [/메모 이어서/, /월말 마감/]) {
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

  it('AC-013.4: 실패 글은 결과가 남아 있고 그 단추를 다시 누르면 된다고 말한다. 없는 [다시 불러오기]·멈춘 점검을 말하지 않고, 다시 누르면 된다', async () => {
    const worker = fakeWorker({ excel: (m) => ({ type: 'excel', check: m.check, ok: false, code: 'E-CLAIM-PARTIAL' }) })
    const { user } = await toResult(worker)
    await user.click(screen.getByRole('button', { name: '엑셀 내려받기' }))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain(EXCEL_FAILED.what)
    expect(card.textContent).toContain(EXCEL_FAILED.fix)
    expect(card.textContent).toContain('[엑셀 내려받기]')
    expect(card.textContent).not.toContain('[다시 불러오기]')
    expect(card.textContent).not.toContain('점검을 멈췄어요')
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
    expect(screen.queryByRole('link', { name: '비트 PC 연결 확인' })).toBeNull()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    delete worker.answers.excel
    await user.click(screen.getByRole('button', { name: '엑셀 내려받기' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(worker.of('excel')).toHaveLength(2)
  })

  it('AC-013.4: Worker가 시작하지 못했으면 [만드는 중…]에 멈추지 않고 오류 카드다', async () => {
    const worker = fakeWorker()
    const { user } = await toResult(worker)
    worker.fail()
    await user.click(screen.getByRole('button', { name: '엑셀 내려받기' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: '엑셀 내려받기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '만드는 중…' })).toBeNull()
    expect(worker.of('excel')).toEqual([])
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

  it('AC-018.17: 달 파일이 다른 병원 파일이면 멈추지 않고 점검하며 안내 카드를 보인다', async () => {
    const store = (args: Record<string, unknown>) => (args.months ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: 'copy1', count: 1 }))
    const worker = fakeWorker()
    await toResult(worker, bridge({ store }))
    const card = screen.getByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-BIT-HOSPITAL-MISMATCH')
    expect(card.textContent).not.toContain('[다시 등록]')
    expect(worker.of('check')).toHaveLength(1)
  })

  it('AC-013.11: claim.memos가 다른 번호로 거절되면 멈춘다', async () => {
    const worker = fakeWorker()
    const card = await failing(worker, bridge({ memos: () => Promise.reject(new BridgeError('E-BIT-READ-FAILED')) }))
    expect(card.textContent).toContain('E-BIT-READ-FAILED')
    expect(worker.of('check')).toEqual([])
  })
})

describe('AC-013.5 비트 PC 연결로 가는 길', () => {
  const setupLink = () => screen.queryByRole('link', { name: '비트 PC 연결 확인' })
  const failLoad = async (link: Bridge) => {
    show(fakeWorker(), link)
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    return screen.findByRole('alert')
  }

  it('AC-013.5: 날짜를 읽다 E-BIT-NOT-REGISTERED면 [다시 불러오기] 옆에 링크가 있다', async () => {
    show(fakeWorker(), bridge({ dates: () => Promise.reject(new BridgeError('E-BIT-NOT-REGISTERED')) }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(setupLink()?.getAttribute('href')).toBe('/claim/setup')
  })

  it('AC-013.5: 달을 읽다 E-BIT-NOT-REGISTERED여도 같다', async () => {
    await failLoad(bridge({ month: () => Promise.reject(new BridgeError('E-BIT-NOT-REGISTERED')) }))
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(setupLink()?.getAttribute('href')).toBe('/claim/setup')
  })

  it('AC-013.5: 링크를 붙이는 번호는 글에 비트 PC 연결 화면의 단추가 나오는 번호 그대로다', () => {
    const named = Object.entries(ERRORS)
      .filter(([, info]) => /\[(다시 확인|처음 등록|다시 등록)\]/.test(info.fix))
      .map(([code]) => code)
    expect([...SETUP_CODES].sort()).toEqual(named.sort())
  })

  it.each(['E-BRIDGE-BUSY', 'E-BIT-IN-USE'])('AC-013.5: 대시보드 쪽 글이 [다시 확인]을 말하는 %s에도 비트 PC 연결 링크가 붙는다', (code) => {
    expect(SETUP_CODES.has(code)).toBe(true)
  })

  it.each(['E-BIT-EXPORT-FAILED', 'E-CLAIM-PARTIAL'])('AC-013.5: [다시 불러오기]로 풀리는 %s에는 링크가 없다', async (code) => {
    await failLoad(bridge({ month: () => Promise.reject(new BridgeError(code)) }))
    expect(setupLink()).toBeNull()
  })

  it('AC-013.5: 이 PC의 비트가 등록과 다른 달 읽기 거절은 [다시 등록]으로 풀려 링크가 있다', async () => {
    await failLoad(bridge({ month: () => Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) }))
    expect(setupLink()).toBeTruthy()
  })

  it('AC-018.17: 달 파일의 E-BIT-HOSPITAL-MISMATCH는 다시 등록해도 풀리지 않아 링크를 붙이지 않는다', async () => {
    const store = (args: Record<string, unknown>) => (args.months ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: 'copy1', count: 1 }))
    await toResult(fakeWorker(), bridge({ store }))
    expect(setupLink()).toBeNull()
  })

  it('AC-013.5·AC-609.7: 저장 폴더 거절(E-STORE-FAILED)은 글에 단추 이름이 없어 링크가 없다. 같은 자리의 E-BIT-NOT-REGISTERED에는 링크가 있다', async () => {
    const storeFails = (code: string) => (args: Record<string, unknown>) => (args.months ? Promise.reject(new BridgeError(code)) : Promise.resolve({ id: 'copy1', count: 1 }))
    await failLoad(bridge({ store: storeFails('E-STORE-FAILED') }))
    expect(setupLink()).toBeNull()
    cleanup()
    await failLoad(bridge({ store: storeFails('E-BIT-NOT-REGISTERED') }))
    expect(setupLink()?.getAttribute('href')).toBe('/claim/setup')
  })
})

describe('AC-013.6 설정이 바뀌었을 때', () => {
  const focus = () => window.dispatchEvent(new Event('focus'))

  it('AC-013.6: 점검 뒤 설정이 그대로면 띠가 없다', async () => {
    await toResult()
    focus()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByText('설정이 바뀌었어요, 다시 점검하세요')).toBeNull()
  })

  it('AC-013.6: 창 초점이 돌아올 때 다시 읽어 다르면 띠와 [다시 점검]이 보이고, 누르면 달을 다시 받지 않고 새 설정으로 점검한다', async () => {
    const worker = fakeWorker()
    const link = bridge()
    const { user } = await toResult(worker, link)
    db.rules = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]
    focus()
    await screen.findByText('설정이 바뀌었어요, 다시 점검하세요')
    expect(screen.getByRole('heading', { level: 2, name: '환자' })).toBeTruthy() // 결과는 그대로 보인다
    const streamed = link.stream.mock.calls.length
    await user.click(screen.getByRole('button', { name: '다시 점검' }))
    await waitFor(() => expect(screen.queryByText('설정이 바뀌었어요, 다시 점검하세요')).toBeNull())
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
    expect(screen.queryByText('설정이 바뀌었어요, 다시 점검하세요')).toBeNull()
  })

  it('AC-013.6: 도로 같아지면 띠가 사라진다', async () => {
    await toResult()
    db.rules = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]
    focus()
    await screen.findByText('설정이 바뀌었어요, 다시 점검하세요')
    db.rules = []
    focus()
    await waitFor(() => expect(screen.queryByText('설정이 바뀌었어요, 다시 점검하세요')).toBeNull())
  })

  it('AC-013.3·AC-013.6: 고른 규칙이 다시 점검으로 사라지면 그 거르기도 풀린다(경고가 없는 것처럼 보이지 않게)', async () => {
    const worker = fakeWorker()
    const { user } = await toResult(worker)
    await user.selectOptions(screen.getByLabelText('규칙으로 거르기'), 'IJ-05')
    expect(namesInList()).toEqual(['가상환자A'])
    worker.answers.check = (m) => ({
      type: 'check',
      check: m.check,
      load: m.load,
      ok: true,
      usedCopy: null,
      view: { ...VIEW, groups: VIEW.groups.filter((g) => g.ruleId !== 'IJ-05'), visits: VIEW.visits.map((v) => ({ ...v, findings: v.findings.filter((f) => f.ruleId !== 'IJ-05') })) },
    })
    db.rules = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]
    focus()
    await user.click(await screen.findByRole('button', { name: '다시 점검' }))
    await waitFor(() => expect(screen.queryByText('설정이 바뀌었어요, 다시 점검하세요')).toBeNull())
    expect((screen.getByLabelText('규칙으로 거르기') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByText('조건에 맞는 환자가 없어요.')).toBeNull()
    expect(namesInList()).toEqual(['가상환자A', '가상환자B', '가상환자C', '가상환자E'])
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

  it('AC-013.9·AC-7813.1: 서버 설정을 읽으면 그 설정을 Worker에 넘긴다(바뀐 규칙 판이 없으면 ruleUpdates는 빈 목록)', async () => {
    db.hospital = { phrases: { a: 1 }, dx_links: [['A', 'B', 'C', 0, 't']] }
    const worker = fakeWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings).toEqual({ rules: { schema: 1, off: [], on: [], grade: [] }, phrases: { a: 1 }, dxLinks: [['A', 'B', 'C', 0, 't']], ruleUpdates: [] })
  })

  it('AC-013.9·AC-7813.1: 병원 설정 줄이 없으면 phrases는 null, 연결표는 비어 있다', async () => {
    const worker = fakeWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings).toEqual({ rules: { schema: 1, off: [], on: [], grade: [] }, phrases: null, dxLinks: [], ruleUpdates: [] })
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
    expect(await screen.findByText('설정이 바뀌었어요, 다시 점검하세요')).toBeTruthy()
  })
})

describe('AC-7813 청구 화면이 고시로 바뀐 규칙 판을 Worker에 넘긴다(rule-auto REQ-7813)', () => {
  const band = '설정이 바뀌었어요, 다시 점검하세요'
  const COPY: CheckSettings = { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: null, dxLinks: [] }
  const focus = () => window.dispatchEvent(new Event('focus'))
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10))
  /** rule_changes의 살아 있는 change 줄 하나(규칙 내용은 Worker가 다시 거르므로 여기서는 모양만) */
  const change = (n: number, over: Record<string, unknown> = {}) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    rule_id: 'IJ-05',
    effective_from: '2026-11-01',
    base_version: '2026-10-19',
    rule: { id: 'IJ-05', title: `관절 주사 간격 판 ${n}`, effective_from: '2026-11-01' },
    ...over,
  })
  /** 그 줄이 Worker로 가는 모양(RuleUpdate) */
  const updateOf = (row: ReturnType<typeof change>) => ({ changeId: row.id, ruleId: row.rule_id, from: row.effective_from, baseVersion: row.base_version, rule: row.rule })
  const C1 = change(1)
  const C2 = change(2, { rule_id: 'PT-01', effective_from: '2026-12-01', rule: { id: 'PT-01', title: '물리치료 판', effective_from: '2026-12-01' } })
  const C3 = change(3, { effective_from: '2027-01-01', rule: { id: 'IJ-05', title: '관절 주사 간격 판 3', effective_from: '2027-01-01' } })
  const copyWorker = () => fakeWorker({ check: (m) => ({ type: 'check', check: m.check, load: m.load, ok: true, view: VIEW, usedCopy: COPY }) })

  it('AC-7813.1: 규칙 설정·병원 설정과 함께 바뀐 판(내 병원이 되돌린 것은 뺌)을 settings.ruleUpdates에 담아 check로 보낸다', async () => {
    db.hospital = { phrases: { a: 1 }, dx_links: [] }
    db.changes = [C1, C2]
    db.marks = [{ change_id: C2.id }]
    const worker = fakeWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings).toEqual({ rules: { schema: 1, off: [], on: [], grade: [] }, phrases: { a: 1 }, dxLinks: [], ruleUpdates: [updateOf(C1)] })
    expect(screen.queryByText('서버에 닿지 않아 마지막으로 받은 설정을 씁니다')).toBeNull()
  })

  it.each([
    ['규칙 설정', 'claim_rule_settings'],
    ['병원 설정', 'claim_hospital_settings'],
    ['바뀐 판', 'rule_changes'],
    ['되돌린 표시', 'rule_change_marks'],
  ])('AC-7813.1: %s 읽기 하나만 실패해도 settings: null로 물어 도우미 사본으로 점검한다(지금 동작)', async (_, table) => {
    db.changes = [C1]
    db.failTable = table
    const worker = copyWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings).toBeNull()
    expect(screen.getByText('서버에 닿지 않아 마지막으로 받은 설정을 씁니다')).toBeTruthy()
  })

  it('AC-7813.1: 바뀐 판이 200개를 넘으면 서버 판을 쓰지 않고 사본으로 점검한다', async () => {
    db.changes = Array.from({ length: 201 }, (_, i) => change(i + 1))
    const worker = copyWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings).toBeNull()
  })

  it('AC-7813.1: 바뀐 판이 200개면 그대로 넘긴다', async () => {
    db.changes = Array.from({ length: 200 }, (_, i) => change(i + 1))
    const worker = fakeWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings?.ruleUpdates).toHaveLength(200)
  })

  it('AC-7813.1: 넘길 판의 JSON이 600,000바이트를 넘으면 서버 판을 쓰지 않고 사본으로 점검한다(도우미 한 메시지 한도)', async () => {
    db.changes = Array.from({ length: 100 }, (_, i) => change(i + 1, { rule: { id: 'IJ-05', effective_from: '2026-11-01', message: '가'.repeat(2100) } }))
    const worker = copyWorker()
    await toResult(worker)
    expect(worker.of('check')[0].settings).toBeNull()
  })

  it("AC-7813.2: 점검 뒤 우리 병원의 다른 계정이 판을 되돌리면 창 초점에 '설정이 바뀌었어요' 띠가 뜨고, [다시 점검]은 그 판 없이 점검한다", async () => {
    db.changes = [C1, C2]
    const worker = fakeWorker()
    const link = bridge()
    const { user } = await toResult(worker, link)
    expect(screen.queryByText(band)).toBeNull()
    db.marks = [{ change_id: C1.id }]
    focus()
    await screen.findByText(band)
    const streamed = link.stream.mock.calls.length
    await user.click(screen.getByRole('button', { name: '다시 점검' }))
    await waitFor(() => expect(screen.queryByText(band)).toBeNull())
    expect(link.stream.mock.calls.length).toBe(streamed)
    const checks = worker.of('check')
    expect(checks).toHaveLength(2)
    expect(checks[0].settings?.ruleUpdates).toEqual([updateOf(C1), updateOf(C2)])
    expect(checks[1].settings?.ruleUpdates).toEqual([updateOf(C2)])
  })

  it('AC-7813.2: 점검 뒤 새 판이 생기면 띠가 뜬다', async () => {
    db.changes = [C1]
    await toResult()
    db.changes = [C1, C3]
    focus()
    expect(await screen.findByText(band)).toBeTruthy()
  })

  it('AC-7813.2: 되돌린 판을 다시 적용해 점검 때와 같아지면 띠가 사라진다', async () => {
    db.changes = [C1]
    await toResult()
    db.marks = [{ change_id: C1.id }]
    focus()
    await screen.findByText(band)
    db.marks = []
    focus()
    await waitFor(() => expect(screen.queryByText(band)).toBeNull())
  })

  it('AC-7813.2: 판의 차례만 달라지면 띠가 없다', async () => {
    db.changes = [C1, C2]
    await toResult()
    db.changes = [C2, C1]
    focus()
    await settle()
    expect(screen.queryByText(band)).toBeNull()
  })

  it('AC-7813.2: 다시 읽을 때 바뀐 판만 읽지 못하면 띠를 그대로 둔다(띠 없음)', async () => {
    db.changes = [C1]
    await toResult()
    db.changes = [C1, C3]
    db.failTable = 'rule_changes'
    focus()
    await settle()
    expect(screen.queryByText(band)).toBeNull()
  })

  it('AC-7813.2: 판 칸이 없는 옛 사본으로 점검한 뒤 서버에 판이 생겼으면 띠가 뜨고, 서버에도 판이 없으면 띠가 없다', async () => {
    db.failSettings = true
    await toResult(copyWorker())
    db.failSettings = false
    focus()
    await settle()
    expect(screen.queryByText(band)).toBeNull()
    db.changes = [C1]
    focus()
    expect(await screen.findByText(band)).toBeTruthy()
  })

  it('AC-7813.2: 다른 탭에 다녀오는 사이 판이 되돌려졌으면 돌아올 때 창 초점 없이 띠가 뜬다', async () => {
    db.changes = [C1, C2]
    const made = await toResult()
    made.unmount()
    db.marks = [{ change_id: C2.id }]
    show(made.worker, made.link)
    expect(await screen.findByText(band)).toBeTruthy()
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
    await screen.findByRole('heading', { level: 2, name: '환자' }) // 결과가 남아 있어 1단계로 돌아가 다시 부른다
    await userEvent.setup().click(screen.getByRole('button', { name: /날짜 고르기/ }))
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('heading', { level: 2, name: '환자' })
    const loads = worker.of('loadStart').map((m) => m.load)
    expect(new Set(loads).size).toBe(loads.length)
    expect([...loads].sort((a, b) => a - b)).toEqual(loads)
    const checks = worker.of('check').map((m) => m.check)
    expect(new Set(checks).size).toBe(checks.length)
  })

  it('불러오는 중에 화면을 떠나면 불러오기를 버린다(loadStart로 달을 비운다)', async () => {
    const worker = fakeWorker()
    const first = show(worker, bridge({ month: () => new Promise(() => {}) }))
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByText('비트에서 읽는 중')
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

describe('AC-013.6 다른 탭에 다녀와도 결과가 남는다', () => {
  const OFF_IJ = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]
  const band = '설정이 바뀌었어요, 다시 점검하세요'
  const patients = () => screen.queryByRole('heading', { level: 2, name: '환자' })
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  const stubDownload = () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  }
  /** 띠를 띄우고 [다시 점검]을 눌러 답을 기다리게 한다 */
  const recheckPending = async (made: Awaited<ReturnType<typeof toResult>>) => {
    db.rules = OFF_IJ
    window.dispatchEvent(new Event('focus'))
    made.worker.answers.check = () => null
    await made.user.click(await screen.findByRole('button', { name: '다시 점검' }))
    await waitFor(() => expect(made.worker.of('check')).toHaveLength(2))
    return made.worker.of('check')[1]
  }

  it('AC-013.6: 결과가 있으면 떠나도 달을 버리지 않고, 돌아오면 달을 다시 읽지 않고 같은 결과를 보인다', async () => {
    const made = await toResult()
    const line = screen.getByText(/환자 5명/).textContent
    const streams = made.link.stream.mock.calls.length
    made.unmount()
    expect(made.worker.of('loadStart')).toHaveLength(1)
    show(made.worker, made.link)
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(screen.getByText(/환자 5명/).textContent).toBe(line)
    expect(screen.getByRole('button', { name: '가상환자A' })).toBeTruthy()
    expect(made.link.stream.mock.calls.length).toBe(streams)
    expect(made.worker.of('loadStart')).toHaveLength(1)
    expect(made.worker.of('check')).toHaveLength(1)
  })

  it('AC-013.6: 돌아오면 창 초점 없이 설정을 한 번 읽어 바뀌었으면 띠가 뜨고, [다시 점검]은 Worker에 남은 달로 된다', async () => {
    const made = await toResult()
    const streams = made.link.stream.mock.calls.length
    made.unmount()
    db.rules = OFF_IJ
    db.ruleReads = 0
    show(made.worker, made.link)
    await screen.findByText(band)
    expect(db.ruleReads).toBe(1)
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 점검' }))
    await waitFor(() => expect(screen.queryByText(band)).toBeNull())
    const checks = made.worker.of('check')
    expect(checks).toHaveLength(2)
    expect(checks[1].load).toBe(checks[0].load)
    expect(checks[1].settings?.rules.off).toEqual(['IJ-05'])
    expect(made.worker.of('loadStart')).toHaveLength(1)
    expect(made.link.stream.mock.calls.length).toBe(streams)
  })

  it('AC-013.6: 돌아온 뒤 설정이 그대로면 띠가 없다', async () => {
    const made = await toResult()
    made.unmount()
    db.ruleReads = 0
    show(made.worker, made.link)
    await screen.findByRole('heading', { level: 2, name: '환자' })
    await waitFor(() => expect(db.ruleReads).toBe(1))
    await flush()
    expect(screen.queryByText(band)).toBeNull()
  })

  it('AC-013.6: 떠날 때 띠가 떠 있었으면 돌아와 설정을 못 읽어도 띠가 남는다(읽지 못하면 그대로 둔다, design.md 6-5)', async () => {
    const made = await toResult()
    db.rules = OFF_IJ
    window.dispatchEvent(new Event('focus'))
    await screen.findByText(band)
    made.unmount()
    db.failSettings = true
    show(made.worker, made.link)
    expect(await screen.findByText(band)).toBeTruthy()
  })

  it('AC-013.4·AC-013.6: 돌아와서 [엑셀 내려받기]는 그 점검 번호로 묻고 내려받는다', async () => {
    stubDownload()
    const made = await toResult()
    made.unmount()
    show(made.worker, made.link)
    await screen.findByRole('heading', { level: 2, name: '환자' })
    await userEvent.setup().click(screen.getByRole('button', { name: '엑셀 내려받기' }))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
    expect(made.worker.of('excel')).toEqual([{ type: 'excel', check: made.worker.of('check')[0].check }])
  })

  it('AC-013.6: 날짜 고르기에 있다 떠나면 그 단계와 고친 기간으로 돌아오고 [점검 결과]도 열려 있다', async () => {
    const made = await toResult()
    await made.user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    fireEvent.change(screen.getByLabelText('시작'), { target: { value: '2026-10-27' } })
    made.unmount()
    show(made.worker, made.link)
    await waitFor(() => expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe('2026-10-27'))
    expect(patients()).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: /점검 결과/ }))
    expect(patients()).toBeTruthy()
    expect(made.worker.of('loadStart')).toHaveLength(1)
  })

  it('AC-013.6: 돌아와서 누구 것인지 확인이 끝나기 전에는 환자 글자를 그리지 않는다', async () => {
    let answer!: (value: unknown) => void
    const check = vi.fn<() => Promise<unknown>>(() => Promise.resolve(REGISTERED))
    const made = await toResult(fakeWorker(), bridge({ check }))
    made.unmount()
    check.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    show(made.worker, made.link)
    await flush()
    expect(screen.getByText('지난 점검 결과를 확인하는 중이에요…')).toBeTruthy()
    expect(screen.queryByText('가상환자A')).toBeNull()
    expect(patients()).toBeNull()
    answer(REGISTERED)
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(screen.queryByText('지난 점검 결과를 확인하는 중이에요…')).toBeNull()
  })

  const gone = async (made: { worker: Fake; channel: ReturnType<typeof claimChannel> }) => {
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(screen.queryByText('가상환자A')).toBeNull()
    expect(patients()).toBeNull()
    expect((screen.getByRole('button', { name: /점검 결과/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(made.channel.kept()).toBeNull()
    expect(made.worker.of('loadStart')).toHaveLength(2) // Worker의 달도 버렸다
  }

  it('AC-013.6: 그새 다른 사람(다른 의원)으로 로그인했으면 남긴 결과를 보이지 않고 Worker의 달도 버린다', async () => {
    const made = await toResult()
    made.unmount()
    db.userId = 'user-2'
    show(made.worker, made.link)
    await gone(made)
  })

  it('AC-013.6: 그새 로그인이 풀렸어도 같다', async () => {
    const made = await toResult()
    made.unmount()
    db.userId = null
    show(made.worker, made.link)
    await gone(made)
  })

  it('AC-013.6: 그새 도우미에 다른 의원을 등록했으면 같다', async () => {
    const check = vi.fn<() => Promise<unknown>>(() => Promise.resolve(REGISTERED))
    const made = await toResult(fakeWorker(), bridge({ check }))
    made.unmount()
    check.mockImplementation(() => Promise.resolve({ ...REGISTERED, institutionCode: '87654321' }))
    show(made.worker, made.link)
    await gone(made)
  })

  it('AC-005.15·AC-013.6: 도우미에 기관기호가 없어도(번호 못 찾은 등록) 남기고, 돌아오면 같은 결과를 보인다', async () => {
    const { institutionCode: _code, ...noCode } = REGISTERED
    void _code
    const check = vi.fn<() => Promise<unknown>>(() => Promise.resolve(noCode))
    const made = await toResult(fakeWorker(), bridge({ check }))
    expect(made.channel.kept()).not.toBeNull()
    made.unmount()
    show(made.worker, made.link)
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(screen.getByRole('button', { name: '가상환자A' })).toBeTruthy()
    expect(made.worker.of('loadStart')).toHaveLength(1)
  })

  it('AC-005.15·AC-013.6: 기관기호 없이 남긴 뒤 번호가 생기면(다시 등록) 버린다', async () => {
    const { institutionCode: _code, ...noCode } = REGISTERED
    void _code
    const check = vi.fn<() => Promise<unknown>>(() => Promise.resolve(noCode))
    const made = await toResult(fakeWorker(), bridge({ check }))
    made.unmount()
    check.mockImplementation(() => Promise.resolve(REGISTERED))
    show(made.worker, made.link)
    await gone(made)
  })

  it('AC-013.6: 도우미 등록을 확인하지 못해도 같다(모르면 보이지 않는다)', async () => {
    const check = vi.fn<() => Promise<unknown>>(() => Promise.resolve(REGISTERED))
    const made = await toResult(fakeWorker(), bridge({ check }))
    made.unmount()
    check.mockImplementation(() => Promise.reject(new BridgeError('E-BIT-READ-FAILED')))
    show(made.worker, made.link)
    await gone(made)
  })

  // 기관기호는 등록 파일 값이라 비트가 다른 의원이어도 온다. 실패는 steps로만 온다(AC-005.7). 모양은 BitCheck.Run 그대로: 실패한 단계부터 뒤는 모두 같은 번호다
  it.each([
    { code: 'E-BIT-HOSPITAL-MISMATCH', steps: [{ name: 'find', ok: true }, { name: 'db', ok: true }, { name: 'registration', ok: false, code: 'E-BIT-HOSPITAL-MISMATCH' }] },
    { code: 'E-BIT-DB-FAILED', steps: [{ name: 'find', ok: true }, { name: 'db', ok: false, code: 'E-BIT-DB-FAILED' }, { name: 'registration', ok: false, code: 'E-BIT-DB-FAILED' }] },
  ])('AC-013.6: 도우미가 같은 기관기호를 줘도 bit.check 단계가 $code 이면 같다', async ({ steps }) => {
    const check = vi.fn<() => Promise<unknown>>(() => Promise.resolve(REGISTERED))
    const made = await toResult(fakeWorker(), bridge({ check }))
    made.unmount()
    check.mockImplementation(() => Promise.resolve({ ...REGISTERED, steps }))
    show(made.worker, made.link)
    await gone(made)
  })

  it('AC-013.6: 화면이 그려진 뒤 확인을 시작하기 전에 맡긴 결과가 없어져도 "확인하는 중"에 멈추지 않는다', async () => {
    const made = await toResult()
    const kept = made.channel.kept()
    made.unmount()
    made.channel.keep(null)
    vi.spyOn(made.channel, 'kept').mockReturnValueOnce(kept) // 첫 그림의 useState만 맡긴 결과를 본다
    show(made.worker, made.link)
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(screen.queryByText('지난 점검 결과를 확인하는 중이에요…')).toBeNull()
  })

  it('AC-013.6: 결과를 낼 때 누구 것인지 몰랐으면 남기지 않는다: 결과는 보이고, 떠나면 달을 버린다', async () => {
    db.userId = null
    const made = await toResult()
    expect(patients()).toBeTruthy()
    expect(made.channel.kept()).toBeNull()
    made.unmount()
    expect(made.worker.of('loadStart')).toHaveLength(2)
  })

  it('AC-013.6: 돌아와 다시 불러오면 남긴 결과는 없어진다. 그 불러오기가 실패하면 옛 결과가 되살아나지 않는다', async () => {
    const month = vi.fn().mockResolvedValueOnce({ id: 'm1', count: 1 }).mockRejectedValue(new BridgeError('E-BIT-READ-FAILED'))
    const made = await toResult(fakeWorker(), bridge({ month }))
    await made.user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    await made.user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('alert')
    expect(made.channel.kept()).toBeNull()
    made.unmount()
    show(made.worker, made.link)
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(patients()).toBeNull()
  })

  it('AC-013.5·AC-013.6: [다시 점검]이 실패하면 남긴 결과도 없어지고 떠날 때 달을 버린다', async () => {
    const made = await toResult()
    await recheckPending(made)
    const asked = made.worker.of('check')[1]
    made.worker.emit({ type: 'check', check: asked.check, load: asked.load, ok: false, code: 'E-SETTINGS-FAILED' })
    await screen.findByRole('alert')
    expect(made.channel.kept()).toBeNull()
    const before = made.worker.of('loadStart').length
    made.unmount()
    expect(made.worker.of('loadStart')).toHaveLength(before + 1)
  })

  it('AC-013.6: [다시 점검] 답이 떠나 있는 동안 오면 돌아올 때 새 결과이고 엑셀도 새 번호로 묻는다', async () => {
    stubDownload()
    const made = await toResult()
    const asked = await recheckPending(made)
    made.unmount()
    made.worker.emit({ type: 'check', check: asked.check, load: asked.load, ok: true, view: { ...VIEW, enabledRules: 100 }, usedCopy: null })
    await flush()
    show(made.worker, made.link)
    await screen.findByText(/켜진 규칙 100개/)
    expect(made.worker.of('check')).toHaveLength(2)
    await userEvent.setup().click(screen.getByRole('button', { name: '엑셀 내려받기' }))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
    expect(made.worker.of('excel')).toEqual([{ type: 'excel', check: asked.check }])
  })

  it('AC-013.6: [다시 점검] 답을 기다리는 사이 돌아오면 다시 점검해 마지막 답만 쓴다', async () => {
    const made = await toResult()
    const asked = await recheckPending(made)
    made.unmount()
    made.worker.answers.check = (m) => ({ type: 'check', check: m.check, load: m.load, ok: true, view: { ...VIEW, enabledRules: 200 }, usedCopy: null })
    show(made.worker, made.link)
    await screen.findByText(/켜진 규칙 200개/)
    const checks = made.worker.of('check')
    expect(checks).toHaveLength(3)
    expect(checks[2].check).toBeGreaterThan(asked.check)
    made.worker.emit({ type: 'check', check: asked.check, load: asked.load, ok: true, view: { ...VIEW, enabledRules: 100 }, usedCopy: null })
    await flush()
    expect(screen.getByText(/켜진 규칙 200개/)).toBeTruthy()
    expect(screen.queryByText(/켜진 규칙 100개/)).toBeNull()
  })

  it('AC-013.5·AC-013.6: 떠나 있는 동안 [다시 점검]이 실패하면 달을 버리고 돌아와도 결과가 없다', async () => {
    const made = await toResult()
    const asked = await recheckPending(made)
    made.unmount()
    const before = made.worker.of('loadStart').length
    made.worker.emit({ type: 'check', check: asked.check, load: asked.load, ok: false, code: 'E-SETTINGS-FAILED' })
    await flush()
    expect(made.channel.kept()).toBeNull()
    expect(made.worker.of('loadStart')).toHaveLength(before + 1)
    show(made.worker, made.link)
    await screen.findByRole('table', { name: '진료한 날짜' })
    expect(patients()).toBeNull()
  })

  describe('설정을 읽는 사이', () => {
    /** 설정 표 읽기를 붙잡는다. 돌려준 함수가 놓는다 */
    const holdSettings = () => {
      let release!: () => void
      db.settingsGate = new Promise((resolve) => (release = resolve))
      return () => {
        db.settingsGate = null
        release()
      }
    }
    /** 마이크로태스크가 모두 끝날 때까지 */
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve))
    /** [엑셀 내려받기]가 그 번호로 묻고 내려받는다. Worker는 마지막 점검 번호만 받는다(jobs.ts runExcel) */
    const excelWorksWith = async (made: { worker: Fake }, check: number) => {
      await userEvent.setup().click(screen.getByRole('button', { name: '엑셀 내려받기' }))
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
      expect(made.worker.of('excel')).toEqual([{ type: 'excel', check }])
    }
    /** 띠를 띄우고 설정 읽기를 붙잡은 채 [다시 점검]을 누른다: 아직 번호를 받지 않았다 */
    const pressRecheckHeld = async (made: Awaited<ReturnType<typeof toResult>>) => {
      db.rules = OFF_IJ
      window.dispatchEvent(new Event('focus'))
      const button = await screen.findByRole('button', { name: '다시 점검' })
      await settle() // 초점 비교는 붙잡기 전에 끝낸다
      const release = holdSettings()
      await made.user.click(button)
      return release
    }

    it('AC-013.5·AC-013.6: 돌아와 다시 점검할 설정을 읽는 사이 옛 답이 실패로 와도 달을 버리지 않고, 새 답을 보이며 엑셀도 된다', async () => {
      stubDownload()
      const made = await toResult()
      const asked = await recheckPending(made)
      made.unmount()
      made.worker.answers.check = (m) => ({ type: 'check', check: m.check, load: m.load, ok: true, view: { ...VIEW, enabledRules: 200 }, usedCopy: null })
      const release = holdSettings()
      show(made.worker, made.link)
      await screen.findByRole('heading', { level: 2, name: '환자' })
      const loads = made.worker.of('loadStart').length
      made.worker.emit({ type: 'check', check: asked.check, load: asked.load, ok: false, code: 'E-SETTINGS-FAILED' })
      await settle()
      expect(made.worker.of('loadStart')).toHaveLength(loads)
      expect(made.channel.kept()).not.toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
      release()
      await screen.findByText(/켜진 규칙 200개/)
      const last = made.worker.of('check').at(-1)!
      expect(last.check).toBeGreaterThan(asked.check)
      await excelWorksWith(made, last.check)
    })

    it('AC-013.4·AC-013.6: [다시 점검]이 설정을 읽는 사이 떠나면 새 번호를 받지 않고, 돌아와 띠가 그대로이며 옛 번호로 엑셀이 된다', async () => {
      stubDownload()
      const made = await toResult()
      const release = await pressRecheckHeld(made)
      made.unmount()
      release()
      await settle()
      expect(made.worker.of('check')).toHaveLength(1)
      show(made.worker, made.link)
      await screen.findByText(band)
      expect(made.worker.of('check')).toHaveLength(1)
      await excelWorksWith(made, made.worker.of('check')[0].check)
    })

    it('AC-013.4·AC-013.6: 그 읽기가 끝나기 전에 돌아와도 옛 화면은 새 번호를 받지 않는다', async () => {
      stubDownload()
      const made = await toResult()
      const release = await pressRecheckHeld(made)
      made.unmount()
      show(made.worker, made.link)
      await screen.findByRole('heading', { level: 2, name: '환자' })
      release()
      await settle()
      expect(made.worker.of('check')).toHaveLength(1)
      await excelWorksWith(made, made.worker.of('check')[0].check)
    })
  })

  it('AC-013.6: 떠났다 돌아와도 환자 자료를 저장소·주소·제목·로그에 두지 않는다', async () => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level))
    const stored = vi.spyOn(Storage.prototype, 'setItem')
    const href = location.href
    const title = document.title
    const made = await toResult()
    made.unmount()
    show(made.worker, made.link)
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(stored).not.toHaveBeenCalled()
    expect(location.href).toBe(href)
    expect(document.title).toBe(title)
    expect(JSON.stringify(history.state ?? null)).not.toContain('가상환자')
    for (const spy of logs) expect(spy).not.toHaveBeenCalled()
  })
})

describe('AC-013.2 불러오기 앞에 묻는 claim.dates', () => {
  const later = () => {
    let open: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    return { gate, open }
  }
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  const months = (link: Bridge) => link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.month').length

  it('AC-013.2: 고른 기간을 먼저 묻고 그 답을 받은 뒤에 loadStart를 보낸다', async () => {
    let dates = () => Promise.resolve({ days: DAYS })
    const link = bridge({ dates: () => dates() })
    const worker = fakeWorker()
    show(worker, link)
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: '자료 불러오기' })
    const { gate, open } = later()
    dates = () => gate.then(() => ({ days: DAYS }))
    await user.click(button)
    const asked = link.call.mock.calls.filter(([cmd]) => cmd === 'claim.dates').at(-1)
    expect(asked?.[1]).toEqual({ from: (screen.getByLabelText('시작') as HTMLInputElement).value, to: (screen.getByLabelText('끝') as HTMLInputElement).value })
    expect(worker.of('loadStart')).toEqual([])
    expect(months(link)).toBe(0)
    open()
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(worker.of('loadStart')).toHaveLength(1)
    expect(months(link)).toBe(1)
  })

  it('AC-013.2: 묻지 못해도 불러오기를 막지 않는다', async () => {
    let dates: () => Promise<{ days: DayCount[] }> = () => Promise.resolve({ days: DAYS })
    const link = bridge({ dates: () => dates() })
    const worker = fakeWorker()
    show(worker, link)
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: '자료 불러오기' })
    dates = () => Promise.reject(new BridgeError('E-BIT-READ-FAILED'))
    await user.click(button)
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(worker.of('loadStart')).toHaveLength(1)
  })

  it('AC-013.2: 답을 기다리는 사이에 화면을 떠나면 loadStart를 보내지 않고 맡긴 결과가 남는다', async () => {
    let dates = () => Promise.resolve({ days: DAYS })
    const link = bridge({ dates: () => dates() })
    const worker = fakeWorker()
    const made = await toResult(worker, link)
    await made.user.click(screen.getByRole('button', { name: '날짜 고르기' }))
    const button = await screen.findByRole('button', { name: '자료 불러오기' })
    await settle()
    const loads = worker.of('loadStart').length
    const reads = months(link)
    const kept = made.channel.kept()
    expect(kept).not.toBeNull()

    const { gate, open } = later()
    dates = () => gate.then(() => ({ days: DAYS }))
    await made.user.click(button)
    made.unmount()
    open()
    await settle()

    expect(worker.of('loadStart')).toHaveLength(loads)
    expect(months(link)).toBe(reads)
    expect(made.channel.kept()).toBe(kept)

    // 돌아오면 날짜 칸에 있었으므로 날짜 칸이고, 그 결과가 그대로 있어 점검 결과로 갈 수 있다
    dates = () => Promise.resolve({ days: DAYS })
    show(worker, link)
    const toCheck = (await screen.findByRole('button', { name: '점검 결과' })) as HTMLButtonElement
    await waitFor(() => expect(toCheck.disabled).toBe(false))
    await made.user.click(toCheck)
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(worker.of('loadStart')).toHaveLength(loads)
  })

  it('AC-013.2: 답을 기다리는 사이에 [멈추기]를 누르면 멈춘 불러오기가 되살아나지 않는다', async () => {
    let dates = () => Promise.resolve({ days: DAYS })
    const link = bridge({ dates: () => dates() })
    const worker = fakeWorker()
    show(worker, link)
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: '자료 불러오기' })
    const { gate, open } = later()
    dates = () => gate.then(() => ({ days: DAYS }))
    await user.click(button)
    await user.click(screen.getByRole('button', { name: '멈추기' }))
    expect(worker.of('loadStart')).toHaveLength(1) // [멈추기] 자신의 것
    open()
    await settle()
    expect(worker.of('loadStart')).toHaveLength(1)
    expect(months(link)).toBe(0)
    expect(worker.of('check')).toEqual([])
    expect(screen.getByRole('button', { name: '자료 불러오기' })).toBeTruthy()
  })

  // 기다리는 동안에는 lastLoad가 그대로라 옛 점검 답이 'replaced'가 되지 않는다. 답을 쓰면 [멈추기]가 사라지고 옛 결과로 건너뛴다
  describe('[다시 점검] 답이 claim.dates를 기다리는 동안 온다', () => {
    const CHANGED_RULES = [{ rule_id: 'IJ-05', enabled: false, grade: null, updated_at: '2026-10-28T00:00:00+00:00' }]

    /** 결과 띠의 [다시 점검](답은 붙잡아 둔다) → [날짜 고르기] → [자료 불러오기](claim.dates 답도 붙잡아 둔다) */
    async function recheckThenPress() {
      let dates = () => Promise.resolve({ days: DAYS })
      const ask = later()
      const state = { monthFails: false }
      const link = bridge({
        dates: () => dates(),
        month: () => (state.monthFails ? Promise.reject(new BridgeError('E-BIT-READ-FAILED')) : Promise.resolve({ id: 'month', count: 1 })),
      })
      const worker = fakeWorker()
      const made = await toResult(worker, link)
      db.rules = CHANGED_RULES
      window.dispatchEvent(new Event('focus'))
      const again = await screen.findByRole('button', { name: '다시 점검' })

      worker.answers.check = () => null
      await made.user.click(again)
      await settle()
      const asked = worker.of('check').at(-1)!

      await made.user.click(screen.getByRole('button', { name: '날짜 고르기' }))
      await settle()
      delete worker.answers.check // 새 불러오기의 점검에는 보통대로 답한다
      dates = () => ask.gate.then(() => ({ days: DAYS }))
      await made.user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
      await settle()
      expect(screen.getByRole('button', { name: '멈추기' })).toBeTruthy()

      const answer = async (over: Partial<Extract<PrecheckToScreen, { type: 'check' }>> = { ok: true, view: VIEW, usedCopy: null }) => {
        await act(async () => {
          worker.emit({ type: 'check', check: asked.check, load: asked.load, ...over } as PrecheckToScreen)
          await new Promise((resolve) => setTimeout(resolve, 0))
        })
      }
      return { ...made, worker, link, ask, state, asked, answer }
    }
    const expectStillLoading = () => {
      expect(screen.getByRole('button', { name: '멈추기' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: '다음: 메모 확인' })).toBeNull()
      expect(screen.queryByRole('heading', { level: 2, name: '환자' })).toBeNull()
      expect(screen.getByRole('button', { name: '날짜 고르기' }).getAttribute('aria-current')).toBe('step')
    }

    it('AC-013.2: 점검 답이 와도 [멈추기]와 진행 표시가 남고 결과 단계로 건너뛰지 않는다', async () => {
      const made = await recheckThenPress()
      const loads = made.worker.of('loadStart').length
      await made.answer()
      expectStillLoading()
      expect(made.worker.of('loadStart')).toHaveLength(loads)
    })

    it('AC-013.2: 실패한 점검 답이 와도 오류 카드 없이 [멈추기]가 남는다', async () => {
      const made = await recheckThenPress()
      const kept = made.channel.kept()
      await made.answer({ ok: false, code: 'E-SETTINGS-FAILED' })
      expectStillLoading()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(made.channel.kept()).toBe(kept) // 답을 쓰지 않았다
    })

    it('AC-013.5: 그 뒤 달 읽기가 실패하면 오류 카드만 있고 옛 결과가 없다', async () => {
      const made = await recheckThenPress()
      const loads = made.worker.of('loadStart').length
      await made.answer()
      made.state.monthFails = true
      made.ask.open()
      await settle()
      await settle()
      expect(made.worker.of('loadStart')).toHaveLength(loads + 1)
      expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BIT-READ-FAILED')
      expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: '다음: 메모 확인' })).toBeNull()
      expect(screen.queryByRole('heading', { level: 2, name: '환자' })).toBeNull()
      expect(screen.queryByRole('button', { name: '멈추기' })).toBeNull()
      expect(made.channel.kept()).toBeNull()
    })

    it('AC-013.2: 그 뒤 불러오기가 성공하면 새 번호로 점검한 결과가 보인다', async () => {
      const made = await recheckThenPress()
      await made.answer()
      made.ask.open()
      await screen.findByRole('heading', { level: 2, name: '환자' })
      const last = made.worker.of('check').at(-1)!
      expect(last.load).toBe(made.channel.lastLoad())
      expect(last.load).toBeGreaterThan(made.asked.load)
      expect(made.channel.kept()?.result.load).toBe(last.load)
    })

    it('AC-013.6: 기다리다 화면을 떠난 뒤에 온 점검 답은 맡긴 결과에 그대로 반영한다', async () => {
      const made = await recheckThenPress()
      const loads = made.worker.of('loadStart').length
      expect(made.channel.kept()?.result.check).not.toBe(made.asked.check)
      made.unmount()
      await made.answer()
      expect(made.channel.kept()?.result.check).toBe(made.asked.check)
      made.ask.open()
      await settle()
      expect(made.worker.of('loadStart')).toHaveLength(loads) // 떠났으므로 불러오기는 시작하지 않는다
      expect(made.channel.kept()?.result.check).toBe(made.asked.check)
    })
  })
})

describe('AC-6610 입력 방식 기억', () => {
  const MEMO_VIEW: MemoScreenView = {
    period: VIEW.period,
    memoBlocked: null,
    noAsk: false,
    targets: { problem: null, range: VIEW.period, code: null, batch: [], left: [], chips: [], typedOverChip: false, replacing: 0 },
    table: [],
    stuck: null,
    bit: { has: false, count: 0, period: null },
  }
  const memoWorker = () => fakeWorker({ memoView: (m) => ({ type: 'memoView', ask: m.ask, ok: true, view: MEMO_VIEW }) })
  async function toInputMode(worker: Fake = memoWorker()) {
    const made = await toResult(worker)
    await made.user.click(screen.getByRole('button', { name: '다음: 메모 확인' }))
    await screen.findByRole('region', { name: '입력 방식' })
    return made
  }
  const radio = (name: '처방코드별' | '날짜별') => screen.getByRole('radio', { name }) as HTMLInputElement
  const modeWrites = () => db.writes.filter((w) => w.table === 'claim_hospital_settings')
  const settle = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))

  it("AC-6610.1: 저장된 방식이 'code'면 비트 입력 칸을 열 때 처방코드별이 처음 골라져 있고 Worker에도 처음부터 그 방식으로 묻는다", async () => {
    db.hospital = { hospital_id: 'h-1', input_mode: 'code', phrases: {}, dx_links: [] }
    const { worker } = await toInputMode()
    expect(radio('처방코드별').checked).toBe(true)
    expect(worker.of('memoView').length).toBeGreaterThan(0)
    expect(worker.of('memoView').map((m) => m.selection.mode)).toEqual(worker.of('memoView').map(() => 'code'))
    expect(modeWrites()).toEqual([])
  })

  it.each([
    ['병원 설정 줄이 없음', null],
    ['input_mode가 비었음', { hospital_id: 'h-1', input_mode: null, phrases: {}, dx_links: [] }],
    ["input_mode가 'date'", { hospital_id: 'h-1', input_mode: 'date', phrases: {}, dx_links: [] }],
    ['모르는 값', { hospital_id: 'h-1', input_mode: 'week', phrases: {}, dx_links: [] }],
  ])('AC-6610.1: %s이면 지금처럼 날짜별이 골라져 있다', async (_, hospital) => {
    db.hospital = hospital
    const { worker } = await toInputMode()
    expect(radio('날짜별').checked).toBe(true)
    expect(worker.of('memoView').at(-1)!.selection.mode).toBe('date')
  })

  it('AC-6610.1: 저장된 방식을 읽지 못해도 날짜별로 열리고 따로 알리지 않는다', async () => {
    db.failSettings = true
    await toInputMode()
    expect(radio('날짜별').checked).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("AC-6610.2: 입력 방식을 고르면 그 값만 내 병원 줄에 저장하고(병원 문구는 보내지 않는다) '설정이 바뀌었어요' 띠가 뜨지 않는다", async () => {
    db.hospital = { hospital_id: 'h-1', input_mode: null, phrases: { a: 1 }, dx_links: [] }
    const { user, worker } = await toInputMode()
    expect(radio('날짜별').checked).toBe(true)
    await user.click(radio('처방코드별'))
    await waitFor(() => expect(modeWrites()).toHaveLength(1))
    expect(modeWrites()[0]).toMatchObject({ method: 'update', payload: { input_mode: 'code' }, filters: [['eq', 'hospital_id', 'h-1']] })
    expect(Object.keys(modeWrites()[0].payload as object)).toEqual(['input_mode'])
    expect(worker.of('memoView').at(-1)!.selection.mode).toBe('code')
    // 서버 줄에 저장된 뒤 창 초점이 돌아와 설정을 다시 견주어도 병원 문구는 그대로라 띠가 없다
    db.hospital = { hospital_id: 'h-1', input_mode: 'code', phrases: { a: 1 }, dx_links: [] }
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await settle()
    expect(screen.queryByText('설정이 바뀌었어요, 다시 점검하세요')).toBeNull()
    await user.click(radio('날짜별'))
    await waitFor(() => expect(modeWrites()).toHaveLength(2))
    expect(modeWrites()[1].payload).toEqual({ input_mode: 'date' })
    // 방식이 아닌 칸(날짜 고르는 법)을 바꾸면 저장하지 않는다
    await user.click(screen.getByRole('radio', { name: '하루' }))
    await settle()
    expect(modeWrites()).toHaveLength(2)
  })

  it('AC-6610.1·AC-6610.2: 고른 방식은 메모 칸을 다시 열어도 처음 골라져 있다', async () => {
    db.hospital = { hospital_id: 'h-1', input_mode: 'date', phrases: {}, dx_links: [] }
    const { user } = await toInputMode()
    await user.click(radio('처방코드별'))
    await waitFor(() => expect(modeWrites()).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: /점검 결과/ }))
    await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
    await screen.findByRole('region', { name: '입력 방식' })
    expect(radio('처방코드별').checked).toBe(true)
  })

  it('AC-6610.2: 저장이 실패해도 고른 방식을 그대로 쓰고 따로 알리지 않는다', async () => {
    db.hospital = { hospital_id: 'h-1', input_mode: 'date', phrases: {}, dx_links: [] }
    db.writeFail = true
    const { user, worker } = await toInputMode()
    await user.click(radio('처방코드별'))
    await waitFor(() => expect(modeWrites()).toHaveLength(1))
    await settle()
    expect(radio('처방코드별').checked).toBe(true)
    expect(worker.of('memoView').at(-1)!.selection.mode).toBe('code')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status', { name: /저장/ })).toBeNull()
  })

  it('AC-6610.2: 병원 설정 줄이 없으면 고른 방식은 화면에서만 쓰고 저장하지 않는다', async () => {
    const { user, worker } = await toInputMode()
    await user.click(radio('처방코드별'))
    await settle()
    expect(modeWrites()).toEqual([])
    expect(worker.of('memoView').at(-1)!.selection.mode).toBe('code')
  })
})

describe('AC-9311.1 날짜 줄의 [이 날만]', () => {
  it('AC-9311.1: [이 날만]을 누르면 시작·끝이 그 날 하나가 되고 요약도 그 하루다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    await userEvent.setup().click(screen.getByRole('button', { name: '10/29 (목) 이 날만' }))
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe('2026-10-29')
    expect((screen.getByLabelText('끝') as HTMLInputElement).value).toBe('2026-10-29')
    expect(screen.getByText(/^진료한 날 1일 · 진료 환자 49명/)).toBeTruthy()
  })
})

describe('AC-9315.1 불러오는 중에 도우미가 멈춤', () => {
  const STOPPED = errorInfo('E-HELPER-STOPPED')
  const missing = () => bridge({ month: () => Promise.reject(new BridgeError('E-HELPER-MISSING')) })

  it('AC-9315.1: 불러오는 중에 E-HELPER-MISSING이 오면 그 자리에 E-HELPER-STOPPED 안내와 [다시 불러오기]·[비트 PC 연결 확인]이 보인다', async () => {
    show(fakeWorker(), missing())
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain(STOPPED.what)
    expect(card.textContent).toContain(STOPPED.fix)
    expect(card.textContent).toContain('오류 번호 E-HELPER-STOPPED')
    expect(document.body.textContent).not.toContain('E-HELPER-MISSING')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '비트 PC 연결 확인' }).getAttribute('href')).toBe('/claim/setup')
  })

  it('AC-9315.1: 날짜 목록을 읽다(일하는 중이 아님) E-HELPER-MISSING이면 지금 그대로다', async () => {
    show(fakeWorker(), bridge({ dates: () => Promise.reject(new BridgeError('E-HELPER-MISSING')) }))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-HELPER-MISSING')
  })

  it('AC-9315.1: 불러오는 동안 일하는 중이라고 위로 알리고, 멈춤 안내가 뜨면 거둔다', async () => {
    const onWorking = vi.fn()
    let fail: (error: Error) => void = () => {}
    const link = bridge({ month: () => new Promise((_, reject) => (fail = reject)) })
    const worker = fakeWorker()
    render(<ClaimScreen channel={claimChannel(worker)} call={link.call as never} stream={link.stream as never} onWorking={onWorking} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await waitFor(() => expect(onWorking).toHaveBeenLastCalledWith(true))
    await act(async () => fail(new BridgeError('E-HELPER-MISSING')))
    await screen.findByText('오류 번호 E-HELPER-STOPPED')
    expect(onWorking).toHaveBeenLastCalledWith(false)
  })

  it('AC-9315.1: [다시 불러오기]는 연결을 다시 맞춘 뒤(reconnect) 다시 불러온다. 다시 붙지 못하면 달을 묻지 않고 멈춤 안내를 그대로 둔다', async () => {
    let fails = true
    const link = bridge({ month: () => (fails ? Promise.reject(new BridgeError('E-HELPER-MISSING')) : Promise.resolve({ id: 'month-ok', count: 1 })) })
    const reconnect = vi.fn(() => Promise.resolve(false))
    const worker = fakeWorker()
    render(<ClaimScreen channel={claimChannel(worker)} call={link.call as never} stream={link.stream as never} reconnect={reconnect} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByText('오류 번호 E-HELPER-STOPPED')
    const months = () => link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.month').length
    expect(months()).toBe(1)

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(reconnect).toHaveBeenCalledTimes(1)
    await screen.findByText('오류 번호 E-HELPER-STOPPED')
    expect(months()).toBe(1)

    fails = false
    reconnect.mockImplementation(() => Promise.resolve(true))
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(months()).toBe(2)
    expect(screen.queryByText('오류 번호 E-HELPER-STOPPED')).toBeNull()
  })
})

describe('AC-9315.2 저장 파일이 깨진 달', () => {
  const BAND = '이 PC에 저장된 2026년 10월 고친 메모·완료 표시를 읽지 못해 빈 채로 시작했어요. 이 달 메모는 다시 확인해 주세요.'

  it('AC-9315.2: E-STORE-BROKEN 뒤 [다시 불러오기]로 그 달을 빈 채로 시작하면 메모 단계에 그 달의 띠가 보이고, 다음 불러오기에는 없다', async () => {
    let broken = true
    const link = bridge({ store: (args) => (args.months && broken ? Promise.reject(new BridgeError('E-STORE-BROKEN')) : Promise.resolve({ id: `store-${String(args.months ?? 'copy')}`, count: 1 })) })
    show(fakeWorker(), link)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-STORE-BROKEN')
    broken = false // 도우미가 깨진 파일을 비키고 빈 채로 시작한다
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByRole('heading', { level: 2, name: '환자' })
    expect(screen.queryByText(BAND)).toBeNull() // 점검 결과 단계에는 없다
    await user.click(screen.getByRole('button', { name: '다음: 메모 확인' }))
    const band = await screen.findByText(BAND)
    expect(band.getAttribute('class')).toContain('bg-warning-soft')

    // 다음 불러오기(그 불러오기가 끝남)에는 없다
    await user.click(screen.getByRole('button', { name: '날짜 고르기' }))
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('heading', { level: 2, name: '환자' })
    await user.click(screen.getByRole('button', { name: '다음: 메모 확인' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '메모 확인' }).getAttribute('aria-current')).toBe('step'))
    expect(screen.queryByText(BAND)).toBeNull()
  })
})
