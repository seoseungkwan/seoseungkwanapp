// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import type { FollowupRow, FollowupView, PatientsWorkerMessage } from '@/types/patients'
import { PatientsScreen } from './PatientsScreen'
import type { PatientsTool } from './tools'
import type { PatientsBridge, PatientsWorkerHandle } from './usePatientsWorker'

// 비트 PC 환자 탭 틀(AC-610, 목업 loadingView·errorView). 불러오는 중·오류·도구 자리를 그리고, F/U 도구 자리에 FollowupTool이 들어간다(AC-611). 정기 주사·문자 문구 몸통은 TASK-12·13
const sb = vi.hoisted(() => ({ reads: 0 }))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          order: async () => {
            sb.reads += 1
            return { data: [], error: null }
          },
        }),
      }),
    }),
  }),
}))

beforeEach(() => {
  sb.reads = 0
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
  const slot = (name: PatientsTool) => view.container.querySelector(`[data-tool-slot="${name}"]`)
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

  it('AC-610.2: 문자 문구 도구는 명단을 읽는 동안에도 불러오는 중이 아니라 자기 자리다', () => {
    const t = setup('messages')
    expect(screen.queryByRole('status')).toBeNull()
    expect(t.slot('messages')).not.toBeNull()
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
    expect(t.slot('messages')).not.toBeNull()
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

  it('AC-610.2: 정기 주사 몸통은 아직 없다 — 다 읽어도 자리뿐이고 지어낸 줄이 없다', async () => {
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: { followup_left: 1, injection_left: 2 }, codes: {} })
    expect(t.slot('recall')?.textContent).toBe('')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
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

  const filters = (t: ReturnType<typeof setup>) => t.posted.filter((m) => m.type === 'filter')
  const mainBox = () => within(screen.getAllByRole('table')[0]!).getByRole('checkbox', { name: BOX }) as HTMLInputElement
  const toRows = async (t: ReturnType<typeof setup>, view: FollowupView = VIEW) => {
    await t.toViews({ followup: view, recall: RECALL_VIEW, counts: null, codes: {} })
    await t.reply({ type: 'filtered', tool: 'followup', rows: view.rows, undecided: [], copy: NO_COPY })
  }

  it('AC-611.2: 불러오는 중에는 도구가 없고 읽는 중 글뿐이다(지어낸 줄 없음)', () => {
    const t = setup('followup')
    expect(screen.getByRole('status').textContent).toContain(FU_LOADING)
    expect(screen.queryByRole('table')).toBeNull()
    expect(t.posted.filter((m) => m.type === 'filter')).toEqual([])
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
    await t.toViews({ followup: VIEW, recall: RECALL_VIEW, counts: null, codes: {} })
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
