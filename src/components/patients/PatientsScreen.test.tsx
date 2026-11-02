// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import type { ContactCount, FollowupRow, FollowupView, PatientsWorkerMessage, RecallRow, RecallView } from '@/types/patients'
import { PatientsScreen } from './PatientsScreen'
import type { PatientsTool } from './tools'
import type { PatientsBridge, PatientsWorkerHandle } from './usePatientsWorker'

// 비트 PC 환자 탭 틀(AC-610, 목업 loadingView·errorView). 불러오는 중·오류·도구 자리를 그리고, 도구 자리에 FollowupTool(AC-611)·RecallTool(AC-612)이 들어간다. 문자 문구 도구는 연결 상태와 상관없이 살아 있어야 해서 이 화면 밖(PatientsEntry)에 있다(AC-613.5)
const sb = vi.hoisted(() => ({
  reads: 0,
  upserts: [] as { table: string; body: unknown; options: unknown }[],
  saveFails: false,
  // 있으면 이것이 끝날 때까지 건수 올리기의 답을 잡아 둔다
  hold: null as Promise<void> | null,
}))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          order: async () => {
            sb.reads += 1
            return { data: [], error: null }
          },
        }),
      }),
      upsert: async (body: unknown, options: unknown) => {
        sb.upserts.push({ table, body, options })
        await sb.hold
        return { data: null, error: sb.saveFails ? { message: 'permission denied (secret detail)' } : null }
      },
    }),
  }),
}))

beforeEach(() => {
  sb.reads = 0
  sb.upserts = []
  sb.saveFails = false
  sb.hold = null
})
afterEach(cleanup)

const R1 = { from: '2026-07-06', to: '2026-08-05' }
const R2 = { from: '2026-08-06', to: '2026-09-05' }
const M1 = { from: '2026-10-01', to: '2026-10-31' }
const FOLLOWUP_VIEW = { read: R1, base: '2026-11-02', rows: [], undecided: [], phoneLoaded: true, marksLoaded: true }
const RECALL_VIEW = { rows: [], coverage: { records: 0, from: null, short: [], trimmed: 0 } }
const FU_LOADING = '비트에서 F/U 명단을 읽는 중이에요'
const RC_LOADING = '정기 주사 기록을 읽는 중이에요'

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

function setup(tool: PatientsTool) {
  const streams: { cmd: string; ok(id: string): void }[] = []
  const stream = vi.fn(
    (cmd: string) =>
      new Promise((resolve) => {
        streams.push({ cmd, ok: (id) => resolve({ id, count: 1 }) })
      }),
  )
  const posted: ({ type: string } & Record<string, unknown>)[] = []
  const listeners = new Set<(event: MessageEvent) => void>()
  const worker: PatientsWorkerHandle = {
    postMessage: (message) => void posted.push(message as { type: string } & Record<string, unknown>),
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  }
  const bridge = { stream: stream as unknown as PatientsBridge['stream'] }
  const view = render(<PatientsScreen tool={tool} bridge={bridge} worker={worker} />)
  const reply = async (message: PatientsWorkerMessage) => {
    for (const listener of [...listeners]) listener({ data: message } as MessageEvent)
    await flush()
  }
  const answer = async (id: string) => {
    streams[streams.length - 1]!.ok(id)
    await flush()
  }
  const toViews = async (message: Omit<Extract<PatientsWorkerMessage, { type: 'views' }>, 'type'>) => {
    await answer('store-1')
    await reply({ type: 'stored', ok: true, recall: [] })
    await reply({ type: 'plan', followup: [], recall: [] })
    await reply({ type: 'views', ...message })
  }
  const show = (next: PatientsTool) => view.rerender(<PatientsScreen tool={next} bridge={bridge} worker={worker} />)
  const slot = (name: PatientsTool) => view.container.querySelector<HTMLElement>(`[data-tool-slot="${name}"]`)
  const storeLoads = () => stream.mock.calls.filter(([cmd]) => cmd === 'store.load').length
  return { ...view, stream, streams, posted, reply, answer, toViews, show, slot, storeLoads }
}

describe('PatientsScreen: 불러오는 중', () => {
  it('AC-610.2: F/U 도구 — 도구 머리(목업 글자)와 읽는 중 글, plan 전에는 숫자가 없다', () => {
    const t = setup('followup')
    expect(screen.getByRole('heading', { level: 2, name: 'F/U 명단' })).toBeTruthy()
    expect(screen.getByText('다시 오시기로 한 날이 다가온 분이에요. 오시기 전날 문자로 알려 드려요.')).toBeTruthy()
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(FU_LOADING)
    expect(status.textContent).toContain('최근 120일을 네 번에 나눠 읽어요. 다 읽을 때까지 이 창을 열어 두세요.')
    expect(status.textContent).not.toMatch(/\d+\/\d+/)
    expect(t.slot('followup')).toBeNull()
  })

  it('AC-610.2: F/U 진행은 몇 번째를 읽는지 "n/전체"로 올라간다', async () => {
    const t = setup('followup')
    await t.answer('store-1')
    await t.reply({ type: 'stored', ok: true, recall: [] })
    await t.reply({ type: 'plan', followup: [R1, R2], recall: [] })
    expect(screen.getByRole('status').textContent).toContain('1/2')
    await t.answer('f1')
    await t.reply({ type: 'piece', id: 'f1', ok: true })
    expect(screen.getByRole('status').textContent).toContain('2/2')
    await t.answer('f2')
    await t.reply({ type: 'piece', id: 'f2', ok: true })
    // 다 읽고 보기 모양을 기다리는 동안 전체를 넘지 않는다
    expect(screen.getByRole('status').textContent).toContain('2/2')
  })

  it('AC-610.2: 정기 주사 도구 — 도구 머리와 달 진행 "n/전체 달". 첫 읽기인지 모르므로 "처음"·"7개월" 글이 없다', async () => {
    const t = setup('recall')
    expect(screen.getByRole('heading', { level: 2, name: '정기 주사 문자 명단' })).toBeTruthy()
    expect(screen.getByText('연골주사 · 비타민D 주사처럼 때마다 맞는 주사의 다음 날짜가 다가온 분이에요.')).toBeTruthy()
    await t.answer('store-1')
    await t.reply({ type: 'stored', ok: true, recall: [M1] })
    await t.reply({ type: 'plan', followup: [R1], recall: [M1] })
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(RC_LOADING)
    expect(status.textContent).toContain('1/1 달')
    expect(status.textContent).toContain('다 읽을 때까지 이 창을 열어 두세요.')
    expect(status.textContent).not.toMatch(/처음|7개월/)
  })

  it('AC-610.2: 문자 문구 도구는 명단을 읽는 동안에도 불러오는 중이 아니다. 도구 자리는 PatientsEntry가 둔다(그쪽 AC-613.5 시험)', () => {
    const t = setup('messages')
    expect(screen.queryByRole('status')).toBeNull()
    expect(t.slot('messages')).toBeNull()
    // 탭에 들어왔으니 명단은 뒤에서 읽어 둔다
    expect(t.storeLoads()).toBe(1)
  })
})

describe('PatientsScreen: 오류는 그 도구에만 (AC-604.3)', () => {
  it('AC-610.2: F/U가 실패하면 F/U 도구는 errors.ts 글·번호 + [다시 불러오기], 정기 주사 도구는 자기 자리', async () => {
    const t = setup('followup')
    await t.toViews({ followup: null, recall: RECALL_VIEW, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
    const alert = screen.getByRole('alert')
    const info = errorInfo('E-BIT-READ-FAILED')
    expect(alert.textContent).toContain(info.what)
    expect(alert.textContent).toContain(info.fix)
    expect(alert.textContent).toContain('오류 번호 E-BIT-READ-FAILED')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.getByText('다른 도구는 그대로 쓸 수 있어요.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'F/U 명단' })).toBeTruthy()

    t.show('recall')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
    expect(t.slot('recall')).not.toBeNull()

    t.show('messages')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.slot('messages')).toBeNull()
  })

  it('AC-610.2: 반대도 같다 — 정기 주사만 실패하면 F/U 도구는 자기 자리', async () => {
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: null, counts: null, codes: { recall: 'E-BIT-READ-FAILED' } })
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BIT-READ-FAILED')
    t.show('followup')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.slot('followup')).not.toBeNull()
  })

  it('AC-604.8: store.load가 실패하면 정기 주사 도구만 오류이고 F/U는 자기 자리다', async () => {
    const t = setup('recall')
    await t.toViews({ followup: { ...FOLLOWUP_VIEW, marksLoaded: false }, recall: null, counts: null, codes: { recall: 'E-STORE-BROKEN' } })
    const info = errorInfo('E-STORE-BROKEN')
    expect(screen.getByRole('alert').textContent).toContain(info.what)
    expect(screen.getByRole('alert').textContent).toContain(info.fix)
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-STORE-BROKEN')
    t.show('followup')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.slot('followup')).not.toBeNull()
  })

  it('AC-610.2: errors.ts에 없는 번호(도우미가 새로 준 번호)는 번호만 보이고 멈추지 않는다', async () => {
    const t = setup('followup')
    await t.toViews({ followup: null, recall: RECALL_VIEW, counts: null, codes: { followup: 'E-HELPER-NEW-CODE' } })
    expect(screen.getByRole('alert').textContent).toBe('오류 번호 E-HELPER-NEW-CODE')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(t.slot('followup')).toBeNull()
  })

  it('AC-610.2: 저장 실패 번호(codes.store)만 왔으면 도구 오류가 아니다', async () => {
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: null, codes: { store: 'E-STORE-FAILED' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.slot('recall')).not.toBeNull()
  })
})

describe('PatientsScreen: [다시 불러오기]·도구 바꾸기', () => {
  it('AC-604.8: [다시 불러오기]는 Worker에 reload를 먼저 보내고 다시 store.load를 부르며, 도구는 불러오는 중으로 돌아간다', async () => {
    const user = userEvent.setup()
    const t = setup('followup')
    await t.toViews({ followup: null, recall: RECALL_VIEW, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
    t.posted.length = 0
    expect(t.storeLoads()).toBe(1)

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(t.posted[0]).toEqual({ type: 'reload' })
    expect(t.storeLoads()).toBe(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(FU_LOADING)
  })

  it('AC-604.8: 도구를 바꿔도·다시 그려도 store.load는 한 번이다. 오류가 있어도 저절로 다시 읽지 않는다', async () => {
    const t = setup('followup')
    t.show('recall')
    t.show('messages')
    t.show('followup')
    expect(t.storeLoads()).toBe(1)
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: null, counts: null, codes: { recall: 'E-STORE-BROKEN' } })
    t.show('recall')
    t.show('followup')
    t.show('recall')
    await flush()
    expect(t.storeLoads()).toBe(1)
    // 번호는 누를 때까지 그대로 남는다
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-STORE-BROKEN')
  })

})

describe('PatientsScreen: F/U 도구 자리 (AC-611)', () => {
  const NEXT = '2026-08-06'
  const KEY = `f|1|100|${NEXT}`
  const ROW: FollowupRow = {
    key: KEY,
    chart: '100',
    name: '시험가',
    phone: '010-0000-0001',
    lastVisit: '2026-07-20',
    next: NEXT,
    nextLabel: '8/6',
    plan: '예정',
    visitKind: 'F/U',
    site: '',
    tx: '',
    evidence: '2주 뒤 재진',
    contacted: false,
  }
  const VIEW: FollowupView = { ...FOLLOWUP_VIEW, base: R1.to, rows: [ROW] }
  const BOX = '시험가 연락함'
  const NO_COPY = { list: '', listWithDate: '' }

  const filters = (t: ReturnType<typeof setup>) => t.posted.filter((m) => m.type === 'filter' && m.tool === 'followup')
  const mainBox = () => within(screen.getAllByRole('table')[0]!).getByRole('checkbox', { name: BOX }) as HTMLInputElement
  const toRows = async (t: ReturnType<typeof setup>, view: FollowupView = VIEW) => {
    await t.toViews({ followup: view, recall: RECALL_VIEW, counts: null, codes: {} })
    await t.reply({ type: 'filtered', tool: 'followup', rows: view.rows, undecided: [], copy: NO_COPY })
  }

  it('AC-611.2: 불러오는 중에는 도구가 없고 읽는 중 글뿐이다(지어낸 줄 없음)', () => {
    const t = setup('followup')
    expect(screen.getByRole('status').textContent).toContain(FU_LOADING)
    expect(screen.queryByRole('table')).toBeNull()
    expect(filters(t)).toEqual([])
  })

  it('AC-611.2: 실패면 오류 카드 + [다시 불러오기]뿐이고 도구는 없다', async () => {
    const t = setup('followup')
    await t.toViews({ followup: null, recall: RECALL_VIEW, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BIT-READ-FAILED')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(filters(t)).toEqual([])
    expect(t.slot('followup')).toBeNull()
  })

  it('AC-611.1: 다 읽으면 자리에 도구가 들어가 처음 고르기를 Worker에 보내고, 답한 줄을 그린다. 도구 머리는 그대로다', async () => {
    const t = setup('followup')
    await t.toViews({ followup: VIEW, recall: RECALL_VIEW, counts: null, codes: {} })
    expect(filters(t)).toEqual([{ type: 'filter', tool: 'followup', filters: { kind: '', from: NEXT, to: NEXT, includeCond: false, includePast: false } }])
    expect(screen.getByRole('heading', { level: 2, name: 'F/U 명단' })).toBeTruthy()
    expect(screen.getByText('다시 오시기로 한 날이 다가온 분이에요. 오시기 전날 문자로 알려 드려요.')).toBeTruthy()
    await t.reply({ type: 'filtered', tool: 'followup', rows: [ROW], undecided: [], copy: NO_COPY })
    expect(mainBox().checked).toBe(false)
    expect(t.slot('followup')?.textContent).toContain('1명 · 아직 연락 안 한 분 1명')
  })

  it('AC-611.3: 눌러서 marked·views가 오면 Worker에 다시 물어 줄을 바꾼다(실제 훅 경로). 그래도 store.load는 한 번이다', async () => {
    const user = userEvent.setup()
    const t = setup('followup')
    await toRows(t)
    await user.click(mainBox())
    expect(t.posted.at(-1)).toEqual({ type: 'mark', key: KEY, on: true, today: R1.to })
    expect(mainBox().getAttribute('aria-busy')).toBe('true')

    await t.reply({ type: 'marked', key: KEY, ok: true, counts: { followup_left: 0, injection_left: 0 } })
    expect(mainBox().checked).toBe(true)
    const sent = filters(t).length
    const marked: FollowupView = { ...VIEW, rows: [{ ...ROW, contacted: true }] }
    await t.reply({ type: 'views', followup: marked, recall: RECALL_VIEW, counts: { followup_left: 0, injection_left: 0 }, codes: {} })
    expect(filters(t)).toHaveLength(sent + 1)
    await t.reply({ type: 'filtered', tool: 'followup', rows: marked.rows, undecided: [], copy: NO_COPY })
    expect(mainBox().checked).toBe(true)
    expect(t.storeLoads()).toBe(1)
  })

  it('AC-604.8: store.load가 실패하면 F/U는 연락 표시 없이 보이고 [연락함]이 막힌다. views.codes.recall의 번호를 보인다', async () => {
    const user = userEvent.setup()
    const t = setup('followup')
    const view: FollowupView = { ...VIEW, marksLoaded: false }
    await t.toViews({ followup: view, recall: null, counts: null, codes: { recall: 'E-STORE-BROKEN' } })
    await t.reply({ type: 'filtered', tool: 'followup', rows: view.rows, undecided: [], copy: NO_COPY })
    expect(mainBox().disabled).toBe(true)
    expect(screen.getByText('오류 번호 E-STORE-BROKEN')).toBeTruthy()
    await user.click(mainBox())
    expect(t.posted.filter((m) => m.type === 'mark')).toEqual([])
    expect(t.storeLoads()).toBe(1)

    // 누를 때만 다시 읽는다
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(t.storeLoads()).toBe(2)
    expect(screen.getByRole('status').textContent).toContain(FU_LOADING)
  })

  it('AC-611.1: 다른 도구로 갔다 돌아와도 고른 기간이 남고 그 사이 온 답을 놓치지 않는다. store.load는 한 번이다', async () => {
    const user = userEvent.setup()
    const t = setup('followup')
    await toRows(t)
    await user.click(screen.getByRole('button', { name: '이번 주' }))
    await t.reply({ type: 'filtered', tool: 'followup', rows: [ROW], undecided: [], copy: NO_COPY })
    await user.click(mainBox())

    t.show('recall')
    expect(screen.queryByRole('table')).toBeNull()
    expect(t.slot('recall')).not.toBeNull()
    await t.reply({ type: 'marked', key: KEY, ok: false, code: 'E-STORE-FAILED', counts: null })
    t.show('messages')
    expect(screen.queryByRole('table')).toBeNull()
    t.show('followup')
    expect(screen.getByRole('button', { name: '이번 주' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByText('오류 번호 E-STORE-FAILED').length).toBeGreaterThan(0)
    expect(t.storeLoads()).toBe(1)
  })

  it('AC-611.4: 문구는 F/U를 열 때 읽는다. 다른 도구에 있는 동안에는 읽지 않고, 돌아오면 다시 읽는다', async () => {
    const t = setup('recall')
    await t.toViews({ followup: VIEW, recall: null, counts: null, codes: { recall: 'E-BIT-READ-FAILED' } })
    await flush()
    expect(sb.reads).toBe(0)
    t.show('followup')
    await flush()
    expect(sb.reads).toBe(1)
    t.show('messages')
    await flush()
    t.show('followup')
    await flush()
    expect(sb.reads).toBe(2)
    expect(t.storeLoads()).toBe(1)
  })

  it('AC-611.1: 정기 주사 filtered 답은 이 도구와 상관없다', async () => {
    const t = setup('followup')
    await toRows(t)
    await t.reply({ type: 'filtered', tool: 'recall', rows: [], copy: { list: '', phones: '', missingPhones: 0 } })
    expect(mainBox()).toBeTruthy()
  })

  it('AC-604.8: [다시 불러오기] 뒤 다시 다 읽으면 도구를 새로 만들어 처음 고르기(내일)로 묻는다', async () => {
    const user = userEvent.setup()
    const t = setup('followup')
    const view: FollowupView = { ...VIEW, marksLoaded: false }
    await t.toViews({ followup: view, recall: null, counts: null, codes: { recall: 'E-STORE-BROKEN' } })
    await t.reply({ type: 'filtered', tool: 'followup', rows: view.rows, undecided: [], copy: NO_COPY })
    await user.click(screen.getByRole('button', { name: '이번 주' }))
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    t.posted.length = 0
    await t.toViews({ followup: VIEW, recall: RECALL_VIEW, counts: null, codes: {} })
    expect(filters(t)).toEqual([{ type: 'filter', tool: 'followup', filters: { kind: '', from: NEXT, to: NEXT, includeCond: false, includePast: false } }])
    expect(t.storeLoads()).toBe(2)
  })
})

describe('PatientsScreen: 정기 주사 도구 자리 (AC-612)', () => {
  const READ_DAY = R1.to // F/U 보기 모양의 읽은 날
  const IN_30 = '2026-09-04'
  const KEY = 'r|cartilage|100|2026-08-20'
  const ROW: RecallRow = {
    key: KEY,
    ruleId: 'cartilage',
    label: '연골주사',
    months: 6,
    chart: '100',
    name: '시험가',
    phone: '010-0000-0001',
    last: '2026-02-20',
    due: '2026-08-20',
    status: '15일 남음',
    evidence: '연골주사 3차 맞음',
    contacted: false,
  }
  const VIEW: RecallView = { rows: [ROW], coverage: { records: 3, from: '2026-02-01', short: [], trimmed: 0 } }
  const BOX = '시험가 연락함'
  const COPY = { list: '시험가', phones: '01000000001', missingPhones: 0 }
  const FIRST = { from: READ_DAY, to: IN_30, overdue: true }

  const filters = (t: ReturnType<typeof setup>) => t.posted.filter((m) => m.type === 'filter' && m.tool === 'recall')
  const mainBox = () => within(screen.getByRole('table')).getByRole('checkbox', { name: BOX }) as HTMLInputElement
  const toRows = async (t: ReturnType<typeof setup>, view: RecallView = VIEW) => {
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: view, counts: null, codes: {} })
    await t.reply({ type: 'filtered', tool: 'recall', rows: view.rows, copy: COPY })
  }

  it('AC-612.4: 불러오는 중에는 도구가 없고 읽는 중 글뿐이다(지어낸 줄 없음)', () => {
    const t = setup('recall')
    expect(screen.getByRole('status').textContent).toContain(RC_LOADING)
    expect(screen.queryByRole('table')).toBeNull()
    expect(filters(t)).toEqual([])
    expect(t.slot('recall')).toBeNull()
  })

  it('AC-612.2: 처음 읽기는 달 진행 "n/전체 달"로 올라간다', async () => {
    const t = setup('recall')
    const M2 = { from: '2026-11-01', to: '2026-11-30' }
    await t.answer('store-1')
    await t.reply({ type: 'stored', ok: true, recall: [M1, M2] })
    await t.reply({ type: 'plan', followup: [], recall: [M1, M2] })
    expect(screen.getByRole('status').textContent).toContain('1/2 달')
    await t.answer('r1')
    await t.reply({ type: 'piece', id: 'r1', ok: true })
    expect(screen.getByRole('status').textContent).toContain('2/2 달')
    await t.answer('r2')
    await t.reply({ type: 'piece', id: 'r2', ok: true })
    expect(screen.getByRole('status').textContent).toContain('2/2 달')
  })

  it('AC-612.4: 실패면 오류 카드 + [다시 불러오기]뿐이고 도구는 없다', async () => {
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: null, counts: null, codes: { recall: 'E-BIT-READ-FAILED' } })
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BIT-READ-FAILED')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(filters(t)).toEqual([])
    expect(t.slot('recall')).toBeNull()
  })

  it('AC-612.1: 다 읽으면 자리에 도구가 들어가 처음 고르기(읽은 날 ~ 30일 뒤, 지난 예정 켬)를 Worker에 보내고, 답한 줄을 그린다. 도구 머리는 그대로다', async () => {
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: VIEW, counts: { followup_left: 1, injection_left: 2 }, codes: {} })
    expect(filters(t)).toEqual([{ type: 'filter', tool: 'recall', filters: FIRST }])
    expect(screen.getByRole('heading', { level: 2, name: '정기 주사 문자 명단' })).toBeTruthy()
    expect(screen.getByText('연골주사 · 비타민D 주사처럼 때마다 맞는 주사의 다음 날짜가 다가온 분이에요.')).toBeTruthy()
    // 답이 오기 전에는 지어낸 줄이 없다
    expect(screen.queryByRole('table')).toBeNull()

    await t.reply({ type: 'filtered', tool: 'recall', rows: [ROW], copy: COPY })
    expect(mainBox().checked).toBe(false)
    expect(t.slot('recall')?.textContent).toContain('1명 · 아직 연락 안 한 분 1명')
    expect(t.slot('recall')?.textContent).toContain('이 PC에 쌓인 정기 주사 기록 3건')
  })

  it('AC-612.1: F/U가 실패해 읽은 날을 모르면 오늘(한국 날짜)부터다', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-10T03:00:00+09:00') })
    try {
      const t = setup('recall')
      await t.toViews({ followup: null, recall: VIEW, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
      expect(filters(t)).toEqual([{ type: 'filter', tool: 'recall', filters: { from: '2026-03-10', to: '2026-04-09', overdue: true } }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC-612.3: 눌러서 marked·views가 오면 Worker에 다시 물어 줄을 바꾼다(실제 훅 경로). 그래도 store.load는 한 번이다', async () => {
    const user = userEvent.setup()
    const t = setup('recall')
    await toRows(t)
    await user.click(mainBox())
    expect(t.posted.at(-1)).toEqual({ type: 'mark', key: KEY, on: true, today: READ_DAY })
    expect(mainBox().getAttribute('aria-busy')).toBe('true')

    await t.reply({ type: 'marked', key: KEY, ok: true, counts: { followup_left: 0, injection_left: 0 } })
    expect(mainBox().checked).toBe(true)
    const sent = filters(t).length
    const marked: RecallView = { ...VIEW, rows: [{ ...ROW, contacted: true }] }
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: marked, counts: { followup_left: 0, injection_left: 0 }, codes: {} })
    expect(filters(t)).toHaveLength(sent + 1)
    await t.reply({ type: 'filtered', tool: 'recall', rows: marked.rows, copy: COPY })
    expect(mainBox().checked).toBe(true)
    expect(t.storeLoads()).toBe(1)
  })

  it('AC-612.4: 기록 저장 실패(codes.store)면 명단은 보이고 오류 줄이 나온다. 저절로 다시 읽지 않고, 누를 때만 다시 읽는다', async () => {
    const user = userEvent.setup()
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: VIEW, counts: null, codes: { store: 'E-STORE-FAILED' } })
    await t.reply({ type: 'filtered', tool: 'recall', rows: [ROW], copy: COPY })
    expect(mainBox()).toBeTruthy()
    expect(screen.getByText('기록을 이 PC에 저장하지 못했어요. 명단은 그대로 볼 수 있어요.')).toBeTruthy()
    expect(screen.getByText('오류 번호 E-STORE-FAILED')).toBeTruthy()
    await flush()
    expect(t.storeLoads()).toBe(1)

    t.posted.length = 0
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(t.posted[0]).toEqual({ type: 'reload' })
    expect(t.storeLoads()).toBe(2)
    expect(screen.getByRole('status').textContent).toContain(RC_LOADING)
  })

  it('AC-612.1: 다른 도구로 갔다 돌아와도 고른 날짜가 남고 그 사이 온 답을 놓치지 않는다. store.load는 한 번이다', async () => {
    const user = userEvent.setup()
    const t = setup('recall')
    await toRows(t)
    fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2026-10-31' } })
    await t.reply({ type: 'filtered', tool: 'recall', rows: [ROW], copy: COPY })
    await user.click(mainBox())

    t.show('followup')
    expect(t.slot('recall')?.hidden).toBe(true)
    await t.reply({ type: 'marked', key: KEY, ok: false, code: 'E-STORE-FAILED', counts: null })
    t.show('messages')
    expect(screen.queryByRole('table')).toBeNull()
    t.show('recall')
    expect(t.slot('recall')?.hidden).toBe(false)
    expect((screen.getByLabelText('끝 날짜') as HTMLInputElement).value).toBe('2026-10-31')
    expect(screen.getAllByText('오류 번호 E-STORE-FAILED').length).toBeGreaterThan(0)
    expect(t.storeLoads()).toBe(1)
  })

  it('AC-612.3: 문구는 정기 주사를 열 때 읽는다. 다른 도구에 있는 동안에는 읽지 않고, 돌아오면 다시 읽는다', async () => {
    const t = setup('messages')
    await t.toViews({ followup: null, recall: VIEW, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
    await flush()
    expect(sb.reads).toBe(0)
    t.show('recall')
    await flush()
    expect(sb.reads).toBe(1)
    t.show('messages')
    await flush()
    t.show('recall')
    await flush()
    expect(sb.reads).toBe(2)
    expect(t.storeLoads()).toBe(1)
  })

  it('AC-612.1: F/U filtered 답은 이 도구와 상관없다', async () => {
    const t = setup('recall')
    await toRows(t)
    await t.reply({ type: 'filtered', tool: 'followup', rows: [], undecided: [], copy: { list: '', listWithDate: '' } })
    expect(mainBox()).toBeTruthy()
  })

  it('AC-612.1: 두 도구는 함께 살아 있어도 지금 도구만 보인다', async () => {
    const t = setup('recall')
    await toRows(t)
    expect(t.slot('recall')?.hidden).toBe(false)
    expect(t.slot('followup')?.hidden).toBe(true)
    t.show('followup')
    expect(t.slot('recall')?.hidden).toBe(true)
    expect(t.slot('followup')?.hidden).toBe(false)
    expect(screen.queryByRole('checkbox', { name: BOX })).toBeNull()
  })

  it('AC-604.8: [다시 불러오기] 뒤 다시 다 읽으면 도구를 새로 만들어 처음 고르기로 묻는다', async () => {
    const user = userEvent.setup()
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: VIEW, counts: null, codes: { store: 'E-STORE-FAILED' } })
    await t.reply({ type: 'filtered', tool: 'recall', rows: [ROW], copy: COPY })
    fireEvent.change(screen.getByLabelText('끝 날짜'), { target: { value: '2026-10-31' } })
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    t.posted.length = 0
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: VIEW, counts: null, codes: {} })
    expect(filters(t)).toEqual([{ type: 'filter', tool: 'recall', filters: FIRST }])
    expect(t.storeLoads()).toBe(2)
  })
})

describe('PatientsScreen: 문자 문구 도구 (AC-613.5)', () => {
  it('AC-613.5: 이 화면은 문자 문구 도구를 그리지 않고 문구도 읽지 않는다(연결이 바뀌어도 도구가 다시 만들어지지 않게 PatientsEntry가 둔다)', async () => {
    const t = setup('messages')
    await flush()
    expect(screen.queryByRole('heading', { name: '문자 문구' })).toBeNull()
    expect(sb.reads).toBe(0)
    expect(t.storeLoads()).toBe(1)
  })
})

describe('PatientsScreen: 남은 건수 올리기 (AC-614)', () => {
  // 가짜 값이다. 올리는 몸통과 실패 줄에 나오면 안 된다
  const NAME = '가짜환자'
  const PHONE = '010-9999-8888'
  const CHART = '900123'
  const NEXT = '2026-08-06'
  const FU_ROW: FollowupRow = {
    key: `f|1|${CHART}|${NEXT}`,
    chart: CHART,
    name: NAME,
    phone: PHONE,
    lastVisit: '2026-07-20',
    next: NEXT,
    nextLabel: '8/6',
    plan: '예정',
    visitKind: 'F/U',
    site: '',
    tx: '',
    evidence: '2주 뒤 재진',
    contacted: false,
  }
  const RC_ROW: RecallRow = {
    key: `r|cartilage|${CHART}|2026-08-20`,
    ruleId: 'cartilage',
    label: '연골주사',
    months: 6,
    chart: CHART,
    name: NAME,
    phone: PHONE,
    last: '2026-02-20',
    due: '2026-08-20',
    status: '15일 남음',
    evidence: '연골주사 3차 맞음',
    contacted: false,
  }
  const FU: FollowupView = { ...FOLLOWUP_VIEW, base: R1.to, rows: [FU_ROW] }
  const RC: RecallView = { rows: [RC_ROW], coverage: { records: 3, from: '2026-02-01', short: [], trimmed: 0 } }
  const A: ContactCount = { followup_left: 1, injection_left: 2 }
  const B: ContactCount = { followup_left: 0, injection_left: 2 }
  const C: ContactCount = { followup_left: 0, injection_left: 1 }
  const KEY = FU_ROW.key
  const FAILED_TEXT = '휴대폰에서 볼 남은 건수를 올리지 못했어요. 명단은 그대로 쓸 수 있어요.'
  const RETRY = '다시 올리기'

  const bodies = () => sb.upserts.map((upsert) => upsert.body)
  const both = (t: ReturnType<typeof setup>, counts: ContactCount | null) => t.toViews({ followup: FU, recall: RC, counts, codes: {} })
  const reloads = (t: ReturnType<typeof setup>) => t.posted.filter((m) => m.type === 'reload')
  const retryButton = () => screen.queryByRole('button', { name: RETRY })
  // 불러오기를 다시 시작한다(읽기는 usePatientsWorker 한 곳)
  const reload = async (t: ReturnType<typeof setup>) => {
    await t.reply({ type: 'views', followup: null, recall: RC, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 불러오기' }))
  }
  // 응답을 잡아 둔다. 돌려주는 함수를 부르면 답이 온다
  const holdReplies = () => {
    let release = () => {}
    sb.hold = new Promise((resolve) => {
      release = resolve
    })
    return async () => {
      release()
      sb.hold = null
      await flush()
      await flush()
    }
  }

  it('AC-614.1: 다 읽기 전에는 올리지 않는다', async () => {
    const t = setup('followup')
    await t.answer('store-1')
    await t.reply({ type: 'stored', ok: true, recall: [] })
    await flush()
    expect(sb.upserts).toEqual([])
  })

  it.each([
    ['F/U만 있고 정기 주사 실패', { followup: FU, recall: null, codes: { recall: 'E-BIT-READ-FAILED' } }],
    ['정기 주사만 있고 F/U 실패', { followup: null, recall: RC, codes: { followup: 'E-BIT-READ-FAILED' } }],
    ['연락 표시를 못 불러옴', { followup: { ...FU, marksLoaded: false }, recall: null, codes: { recall: 'E-STORE-BROKEN' } }],
  ])('AC-614.1: %s이면 Worker 건수가 null이라 올리지 않는다', async (_name, message) => {
    const t = setup('followup')
    await t.toViews({ ...message, counts: null })
    await flush()
    expect(sb.upserts).toEqual([])
  })

  it('AC-614.1: 두 명단이 다 있어도 Worker 건수가 null이면 올리지 않는다', async () => {
    const t = setup('followup')
    await both(t, null)
    await flush()
    expect(sb.upserts).toEqual([])
  })

  it.each([
    ['F/U만', { followup: FU, recall: null, codes: { recall: 'E-BIT-READ-FAILED' } }],
    ['정기 주사만', { followup: null, recall: RC, codes: { followup: 'E-BIT-READ-FAILED' } }],
  ])('AC-614.1: 보기 모양이 %s 있으면 건수가 와도 올리지 않는다(한쪽을 0으로 덮지 않는다)', async (_name, message) => {
    const t = setup('followup')
    await t.toViews({ ...message, counts: A })
    await flush()
    expect(sb.upserts).toEqual([])
  })

  it('AC-614.1: 둘 다 오면 그 건수를 한 번 올린다. store.load·reload를 더 부르지 않는다', async () => {
    const t = setup('followup')
    await both(t, A)
    await flush()
    expect(sb.upserts).toEqual([{ table: 'contact_counts', body: A, options: { onConflict: 'hospital_id' } }])
    expect(t.storeLoads()).toBe(1)
    expect(reloads(t)).toEqual([])
  })

  it('AC-614.1: 기록 저장만 실패(codes.store)면 두 명단과 연락 표시가 있으니 올린다', async () => {
    const t = setup('followup')
    await t.toViews({ followup: FU, recall: RC, counts: A, codes: { store: 'E-STORE-FAILED' } })
    await flush()
    expect(bodies()).toEqual([A])
  })

  it('AC-614.1: [다시 불러오기] 동안은 보내지 않고, 같은 값으로 돌아오면 다시 보내지 않는다', async () => {
    const t = setup('followup')
    await both(t, A)
    await reload(t)
    await flush()
    expect(sb.upserts).toHaveLength(1)
    await both(t, { ...A })
    await flush()
    expect(sb.upserts).toHaveLength(1)
  })

  it('AC-614.1: 다시 읽기가 실패해 건수가 null이면 보내지 않고, 다음에 값이 바뀌면 그 값만 보낸다', async () => {
    const t = setup('followup')
    await both(t, A)
    await reload(t)
    await t.toViews({ followup: FU, recall: null, counts: null, codes: { recall: 'E-BIT-READ-FAILED' } })
    await flush()
    expect(sb.upserts).toHaveLength(1)
    await reload(t)
    await both(t, B)
    expect(bodies()).toEqual([A, B])
  })

  it('AC-614.2: 연락 표시로 건수가 바뀌면 marked로 다시 올리고, 같은 값의 views가 뒤따라도 더 보내지 않는다', async () => {
    const t = setup('followup')
    await both(t, A)
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: B })
    expect(bodies()).toEqual([A, B])
    await t.reply({ type: 'views', followup: FU, recall: RC, counts: { ...B }, codes: {} })
    await flush()
    expect(bodies()).toEqual([A, B])
  })

  it('AC-614.2: 건수가 그대로인 marked는 보내지 않는다', async () => {
    const t = setup('followup')
    await both(t, A)
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: { ...A } })
    await flush()
    expect(sb.upserts).toHaveLength(1)
  })

  it('AC-614.2: marked가 건수 null을 줘도 보내지 않고 올린 기록을 잃지 않는다', async () => {
    const t = setup('followup')
    await both(t, A)
    await t.reply({ type: 'marked', key: KEY, ok: false, code: 'E-STORE-FAILED', counts: null })
    await flush()
    expect(sb.upserts).toHaveLength(1)
    await t.reply({ type: 'marked', key: KEY, ok: false, code: 'E-STORE-FAILED', counts: { ...A } })
    await flush()
    expect(sb.upserts).toHaveLength(1)
  })

  it('AC-614.2: 다시 읽은 새 views가 옛 marked 값을 이긴다. 읽는 동안 늦게 온 marked는 보내지 않는다', async () => {
    const t = setup('followup')
    await both(t, A)
    await reload(t)
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: B })
    await flush()
    expect(bodies()).toEqual([A])
    await both(t, C)
    await flush()
    expect(bodies()).toEqual([A, C])
  })

  it('AC-614.2: 읽는 동안 늦게 온 marked 값은 새 views 건수가 null이면 사라진다', async () => {
    const t = setup('followup')
    await both(t, A)
    await reload(t)
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: B })
    await t.toViews({ followup: FU, recall: RC, counts: null, codes: {} })
    await flush()
    expect(bodies()).toEqual([A])
  })

  it('AC-614.2: 읽는 동안 온 옛 흐름의 views 건수는 보내지 않는다', async () => {
    const t = setup('followup')
    await both(t, A)
    await reload(t)
    await t.reply({ type: 'views', followup: FU, recall: RC, counts: B, codes: {} })
    await flush()
    expect(bodies()).toEqual([A])
  })

  it('AC-614.2: 다 읽은 뒤에 온 marked는 그 뒤의 값으로 올린다(다시 읽은 값을 지우지 않는다)', async () => {
    const t = setup('followup')
    await both(t, A)
    await reload(t)
    await both(t, C)
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: B })
    expect(bodies()).toEqual([A, C, B])
  })

  it('AC-614.2: 요청이 나가 있는 사이 연락 표시가 바뀌면 답 뒤에 마지막 값만 보낸다', async () => {
    const t = setup('followup')
    const answer = holdReplies()
    await both(t, A)
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: B })
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: C })
    expect(bodies()).toEqual([A])
    await answer()
    expect(bodies()).toEqual([A, C])
    expect(retryButton()).toBeNull()
  })

  it('AC-614.3: 몸통은 정확히 정수 두 칸이고 이름·전화·차트번호·날짜 글자가 없다', async () => {
    const t = setup('followup')
    await both(t, A)
    await t.reply({ type: 'filtered', tool: 'followup', rows: [FU_ROW], undecided: [], copy: { list: `${NAME}\t${PHONE}`, listWithDate: `${NAME}\t${PHONE}\t${NEXT}` } })
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: B })
    expect(sb.upserts).toHaveLength(2)
    for (const { body } of sb.upserts) {
      expect(Object.keys(body as object).sort()).toEqual(['followup_left', 'injection_left'])
      for (const value of Object.values(body as object)) expect(Number.isInteger(value)).toBe(true)
      const text = JSON.stringify(body)
      for (const secret of [NAME, PHONE, CHART, NEXT, '2026']) expect(text).not.toContain(secret)
    }
  })

  it('AC-614.3: Worker 건수에 다른 칸이 끼어 있으면 보내지 않고, 실패 줄에도 그 값이 없다', async () => {
    const t = setup('followup')
    await both(t, { ...A, name: NAME, phone: PHONE } as ContactCount)
    await flush()
    expect(sb.upserts).toEqual([])
    expect(screen.getByRole('alert').textContent).toBe(`${FAILED_TEXT}오류 번호 E-PATIENTS-COUNTS-SAVE${RETRY}`)
  })

  it('AC-614.4: 실패해도 명단은 그대로고, 도구 자리 위에 목업의 작은 줄과 [다시 올리기]가 나온다. 환자 값은 없고 다시 읽지 않는다', async () => {
    sb.saveFails = true
    const t = setup('followup')
    await both(t, A)
    await t.reply({ type: 'filtered', tool: 'followup', rows: [FU_ROW], undecided: [], copy: { list: '', listWithDate: '' } })
    const line = screen.getByRole('alert')
    expect(line.textContent).toBe(`${FAILED_TEXT}오류 번호 E-PATIENTS-COUNTS-SAVE${RETRY}`)
    for (const secret of [NAME, PHONE, CHART, 'secret detail']) expect(line.textContent).not.toContain(secret)
    // 명단은 그대로
    expect(within(screen.getAllByRole('table')[0]!).getByRole('checkbox', { name: `${NAME} 연락함` })).toBeTruthy()
    // 줄은 도구 몸통 위에 있다(목업 page: 도구 줄 → 줄 → 몸통)
    expect(line.compareDocumentPosition(t.slot('followup')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(t.slot('followup')!.contains(line)).toBe(false)
    expect(t.storeLoads()).toBe(1)
    expect(reloads(t)).toEqual([])
  })

  it('AC-614.4: [다시 올리기]는 지금 값을 다시 보내고, 저장되면 줄이 없어진다. store.load·reload를 부르지 않는다', async () => {
    const user = userEvent.setup()
    sb.saveFails = true
    const t = setup('followup')
    await both(t, A)
    sb.saveFails = false
    await user.click(retryButton()!)
    await flush()
    expect(bodies()).toEqual([A, A])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.storeLoads()).toBe(1)
    expect(reloads(t)).toEqual([])
  })

  it('AC-614.4: [다시 올리기]를 두 번 눌러도 한 번 보낸다', async () => {
    const user = userEvent.setup()
    sb.saveFails = true
    const t = setup('followup')
    await both(t, A)
    sb.saveFails = false
    const answer = holdReplies()
    await user.dblClick(retryButton()!)
    await flush()
    expect(sb.upserts).toHaveLength(2)
    await answer()
    expect(sb.upserts).toHaveLength(2)
    expect(retryButton()).toBeNull()
  })

  it('AC-614.4: 저절로 다시 보내지 않는다. 다시 그려도·도구를 바꿔도·같은 값이 다시 와도 그대로다', async () => {
    sb.saveFails = true
    const t = setup('followup')
    await both(t, A)
    t.show('recall')
    t.show('messages')
    t.show('followup')
    await t.reply({ type: 'views', followup: FU, recall: RC, counts: { ...A }, codes: {} })
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: { ...A } })
    await flush()
    expect(sb.upserts).toHaveLength(1)
    expect(retryButton()).not.toBeNull()
  })

  it('AC-614.4: 줄은 세 도구 모두에서 보인다(목업: 문자 문구 포함)', async () => {
    sb.saveFails = true
    const t = setup('followup')
    await both(t, A)
    for (const tool of ['recall', 'messages', 'followup'] as const) {
      t.show(tool)
      expect(screen.getByRole('alert').textContent).toContain(FAILED_TEXT)
    }
  })

  it('AC-614.4: 바뀐 값이 저장되면 줄이 없어진다. 저장되기 전에는 남는다', async () => {
    sb.saveFails = true
    const t = setup('followup')
    await both(t, A)
    sb.saveFails = false
    const answer = holdReplies()
    await t.reply({ type: 'marked', key: KEY, ok: true, counts: B })
    expect(bodies()).toEqual([A, B])
    expect(retryButton()).not.toBeNull()
    await answer()
    expect(retryButton()).toBeNull()
  })

  it('AC-614.4: 불러오는 동안에는 줄이 없고, 같은 값으로 돌아오면 보내지 않은 채 줄이 다시 나온다. 누르면 그때 보낸다', async () => {
    const user = userEvent.setup()
    sb.saveFails = true
    const t = setup('followup')
    await both(t, A)
    await reload(t)
    expect(retryButton()).toBeNull()
    await t.answer('store-2')
    await t.reply({ type: 'stored', ok: true, recall: [] })
    await t.reply({ type: 'plan', followup: [], recall: [] })
    expect(retryButton()).toBeNull()
    await t.reply({ type: 'views', followup: FU, recall: RC, counts: { ...A }, codes: {} })
    expect(sb.upserts).toHaveLength(1)
    sb.saveFails = false
    await user.click(retryButton()!)
    await flush()
    expect(bodies()).toEqual([A, A])
    expect(retryButton()).toBeNull()
  })

  it('AC-614.4: 다시 읽기가 실패해 보낼 값이 없으면 누를 수 없는 줄을 보이지 않는다', async () => {
    sb.saveFails = true
    const t = setup('followup')
    await both(t, A)
    await reload(t)
    await t.toViews({ followup: FU, recall: null, counts: null, codes: { recall: 'E-BIT-READ-FAILED' } })
    expect(retryButton()).toBeNull()
    expect(sb.upserts).toHaveLength(1)
  })
})
