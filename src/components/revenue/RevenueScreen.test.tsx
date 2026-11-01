// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eachDay, monthOf } from '@/lib/analytics/dates'
import type { BridgeState } from '@/types/bridge'
import type { RevenueCodeRow, RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import { RevenueScreen } from './RevenueScreen'

// 매출 화면 (TASK-9, REQ-009 · AC-009.1~AC-009.4). 가짜 useBridge·가짜 store를 넣는다. 자료는 모두 가짜 숫자다. 오늘은 2026-11-01(날짜만 멈춘다)

const fake = vi.hoisted(() => ({
  bridge: null as unknown,
  store: null as unknown,
  groups: null as unknown,
  useBridge: null as unknown as (...args: unknown[]) => unknown,
}))

vi.mock('@/components/claim/useBridge', () => ({ useBridge: (...args: unknown[]) => fake.useBridge(...args) }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: () => fake.store }))
vi.mock('@/lib/storage/rxGroups', () => ({ createRxGroupStore: () => fake.groups }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({}) }))

const FETCHED_AT = '2026-10-31T22:10:00Z' // 한국 시각 11월 1일 07:10
const CONNECT = '비트 PC를 연결하면 매출이 여기에 채워져요'
const FETCHING = '비트에서 매출을 가져오고 있어요'
const NO_RECORD = '이 달에는 비트에 수납 기록이 없어요'
const HELPER_OLD = '매출을 읽으려면 도우미를 새로 깔아야 해요'
const EXTENSION_OLD = '매출을 읽으려면 확장 프로그램을 새 버전으로 바꿔야 해요'
const NOT_CONNECTED = '이 PC는 비트와 연결되어 있지 않아요.'
const BUSY_WHAT = '청구 화면이 다른 창에서 열려 있어요'
const LATEST_MONTHS = ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11', '2025-10']

const day = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow => ({
  date,
  visits: 10,
  newPatients: 2,
  returnVisits: 8,
  total: 1_000_000,
  insurer: 600_000,
  noncovered: 250_000,
  copay: 100_000,
  otherTotal: 50_000,
  cash: 200_000,
  card: 700_000,
  transfer: 100_000,
  receivableIn: 0,
  unconfirmed: false,
  splitUnconfirmed: false,
  ...over,
})
const REST = { visits: 0, newPatients: 0, returnVisits: 0, total: 0, insurer: 0, noncovered: 0, copay: 0, otherTotal: 0, cash: 0, card: 0, transfer: 0 }

const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
const rangeOf = (month: string) => ({ from: `${month}-01`, to: `${month}-${String(lastDay(month)).padStart(2, '0')}` })
const rowsOf = (...months: string[]) => months.flatMap((month) => eachDay(rangeOf(month)).map((date) => day(date)))

const CODES: RevenueCodeRow[] = [{ code: 'MANUAL1', name: '가짜 처방', count: 2, amount: 300_000 }]
const answerOf = (range: { from: string; to: string }): RevenueDaysResult => ({ days: eachDay(range).map((date) => day(date)), codes: CODES })
const coded = (code: string) => Object.assign(new Error(code), { code })

type Call = (cmd: string, args: { from: string; to: string }) => Promise<RevenueDaysResult>
type Setup = { state?: BridgeState; rows?: RevenueDayRow[]; call?: Call; helloError?: string | null; groups?: RxGroup[] }

function setup({ state = 'ready', rows = [], call, helloError = null, groups = [] }: Setup = {}) {
  const saved = new Map(rows.map((row) => [row.date, row]))
  const store = {
    saveMonth: vi.fn(async (_month: string, result: RevenueDaysResult) => {
      for (const row of result.days) saved.set(row.date, row)
    }),
    loadRevenue: vi.fn(async () => ({
      days: [...saved.values()].sort((a, b) => a.date.localeCompare(b.date)),
      codes: [...new Set([...saved.keys()].map(monthOf))].flatMap((month) => CODES.map((code) => ({ ...code, month }))),
      fetchedAt: saved.size > 0 ? FETCHED_AT : null,
    })),
  }
  const groupStore = { listGroups: vi.fn(async (): Promise<RxGroup[]> => groups), saveGroups: vi.fn() }
  const bridge = {
    state,
    hello: null,
    helloError,
    helperUpdateAvailable: false,
    call: vi.fn<Call>(call ?? (async (_cmd, range) => answerOf(range))),
    stream: vi.fn(),
    onProgress: vi.fn(),
    retry: vi.fn(),
  }
  fake.store = store
  fake.groups = groupStore
  fake.bridge = bridge
  fake.useBridge = vi.fn(() => fake.bridge)
  return { store, groupStore, bridge }
}

// 답을 잡아 두는 통로. 끊김을 시험할 때 진짜 통로의 차례(client.ts finishAll: 상태를 먼저 바꾸고 그 뒤에 기다리던 요청을 거절)대로 움직이려고 쓴다
function heldCall() {
  const rejects: ((error: Error) => void)[] = []
  const call: Call = () =>
    new Promise((_resolve, reject) => {
      rejects.push(reject)
    })
  return { call, rejects }
}

// 앞 차례가 남은 일을 다 하도록 기다린다
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
})

const monthsCalled = (call: { mock: { calls: unknown[][] } }) => call.mock.calls.map(([, range]) => monthOf((range as { from: string }).from))
const ALL_SAVED = rowsOf(...LATEST_MONTHS)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-01T03:00:00+09:00'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-009.1 한 쪽: 제목 줄 → 달 고르기 → 네 덩어리', () => {
  it('AC-009.1 제목 줄(가져온 시각, [다시 가져오기]) → 달 고르기 → 네 덩어리 차례이고 도구 단추 줄이 없다', async () => {
    setup({ rows: ALL_SAVED })
    const { container } = render(<RevenueScreen />)
    expect(await screen.findByRole('heading', { level: 2, name: '매출 추이' })).toBeTruthy()

    expect(screen.getByRole('heading', { level: 1, name: '매출' })).toBeTruthy()
    expect(screen.getByText('11월 1일 07:10에 비트에서 가져왔어요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 가져오기' })).toBeTruthy()
    expect(screen.getByText('2026년 10월')).toBeTruthy()
    expect(screen.getByText('10월 1일 – 31일 · 수납한 날 기준')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['매출 추이', '급여·비급여·기타', '치료별 매출', '건당 진료비'])

    // 차례: 제목 → 달 고르기 → 첫 덩어리
    const text = container.textContent ?? ''
    expect(text.indexOf('다시 가져오기')).toBeLessThan(text.indexOf('2026년 10월'))
    expect(text.indexOf('2026년 10월')).toBeLessThan(text.indexOf('매출 추이'))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('AC-009.1 달 고르기는 어제가 속한 달에서 시작해 최근 13달 안에서만 움직이고, 네 덩어리가 그 달로 바뀐다', async () => {
    setup({ rows: ALL_SAVED })
    render(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    const user = userEvent.setup()
    const next = screen.getByRole<HTMLButtonElement>('button', { name: '다음 달' })
    const previous = screen.getByRole<HTMLButtonElement>('button', { name: '지난달' })
    expect(next.disabled).toBe(true)
    expect(screen.getByText('10월 매출')).toBeTruthy()

    await user.click(previous)
    expect(screen.getByText('2026년 9월')).toBeTruthy()
    expect(screen.getByText('9월 매출')).toBeTruthy()
    expect(screen.getByText('9월 건당 진료비')).toBeTruthy()
    expect(next.disabled).toBe(false)

    for (let i = 0; i < 11; i += 1) await user.click(previous)
    expect(screen.getByText('2025년 10월')).toBeTruthy()
    expect(previous.disabled).toBe(true)
  })

  it('AC-009.1 통로는 useBridge를 Worker 없이 쓴다', async () => {
    setup({ rows: ALL_SAVED })
    render(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(fake.useBridge).toHaveBeenCalledWith()
  })
})

describe('AC-009.2 연결된 PC는 열 때 저절로 가져온다', () => {
  it('AC-009.2 연결되면 첫 그림부터 가져오는 중이다: 읽기 전에 "수납 기록이 없어요"가 보이지 않는다', async () => {
    const { store, bridge } = setup()
    store.loadRevenue.mockImplementation(() => new Promise(() => {}))
    render(<RevenueScreen />)
    expect(screen.getByRole('heading', { level: 2, name: FETCHING })).toBeTruthy()
    expect(screen.queryByText(new RegExp(NO_RECORD))).toBeNull()
    expect(screen.queryByText('자료 없음')).toBeNull()
    await waitFor(() => expect(store.loadRevenue).toHaveBeenCalled())
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.2 연결 중에는 부르지 않고(그때는 E-BRIDGE-REJECTED가 온다), 연결되면 저장된 날을 먼저 읽은 뒤 한 번만 가져온다', async () => {
    const { store, bridge } = setup({ state: 'connecting', rows: rowsOf(...LATEST_MONTHS.slice(1)) })
    const { rerender } = render(<RevenueScreen />)
    expect(screen.getByRole('heading', { level: 1, name: '매출' })).toBeTruthy()
    await Promise.resolve()
    expect(bridge.call).not.toHaveBeenCalled()
    expect(screen.queryByText(CONNECT)).toBeNull()
    expect(screen.queryByText(EXTENSION_OLD)).toBeNull()

    bridge.state = 'ready'
    rerender(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(store.loadRevenue.mock.invocationCallOrder[0]!).toBeLessThan(bridge.call.mock.invocationCallOrder[0]!)
    expect(bridge.call.mock.calls).toEqual([['revenue.days', { from: '2026-10-01', to: '2026-10-31' }]])

    rerender(<RevenueScreen />)
    expect(bridge.call).toHaveBeenCalledTimes(1)
  })

  it('AC-009.2 저장된 달은 읽지 않는다(planFetch): 최근 달부터 빠진 달만', async () => {
    const { bridge } = setup({ rows: rowsOf(...LATEST_MONTHS.slice(2, 12)) })
    render(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(monthsCalled(bridge.call)).toEqual(['2026-10', '2026-09', '2025-10'])
  })

  it('AC-009.2 진행: "13달 가운데 n달"과 정적인 막대, 읽는 중인 달은 끝난 달이 아니라 다음 달이다. 끝나면 저장된 숫자로 다시 그린다', async () => {
    const answers: (() => void)[] = []
    const { store } = setup({
      call: (_cmd, range) =>
        new Promise((resolve) => {
          answers.push(() => resolve(answerOf(range)))
        }),
    })
    const { container } = render(<RevenueScreen />)

    await waitFor(() => expect(answers).toHaveLength(1))
    const status = () => within(screen.getByRole('status')).getByText(/달 가운데/).closest('p')!.textContent
    expect(status()).toContain('13달 가운데 0달을 가져왔어요')
    expect(status()).toContain('2026년 10월 읽는 중')

    answers[0]!()
    await waitFor(() => expect(answers).toHaveLength(2))
    await waitFor(() => expect(status()).toContain('13달 가운데 1달을 가져왔어요'))
    expect(status()).toContain('2026년 9월 읽는 중')
    expect(status()).not.toContain('2026년 10월 읽는 중')
    expect(container.querySelector('[style*="width: 7.69%"]')).not.toBeNull()
    expect(container.innerHTML).not.toMatch(/animate-|transition-all/)

    for (let i = 1; i < 13; i += 1) {
      answers[i]!()
      await waitFor(() => expect(answers.length).toBe(Math.min(13, i + 2)))
    }
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(store.loadRevenue).toHaveBeenCalledTimes(2)
    expect(store.saveMonth).toHaveBeenCalledTimes(13)
    expect(screen.queryByText(FETCHING)).toBeNull()
    expect(screen.getAllByText('3,100만 원').length).toBeGreaterThan(0)
  })

  it('AC-009.2 제목 줄의 [다시 가져오기]는 고른 달만 다시 읽는다', async () => {
    const { bridge, store } = setup({ rows: ALL_SAVED })
    render(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(bridge.call).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '지난달' }))
    await user.click(screen.getByRole('button', { name: '다시 가져오기' }))
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(bridge.call.mock.calls).toEqual([['revenue.days', { from: '2026-09-01', to: '2026-09-30' }]])
    expect(store.saveMonth).toHaveBeenCalledTimes(1)
    expect(screen.getByText('2026년 9월')).toBeTruthy()
  })
})

describe('AC-009.3 확장이 없는 PC·폰', () => {
  it('AC-009.3 확장이 없으면 저장된 숫자만 보이고 [다시 가져오기]가 없다, "의원 PC에서 …에 가져온 숫자예요"', async () => {
    const { bridge } = setup({ state: 'no-extension', rows: ALL_SAVED })
    render(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(screen.queryByRole('button', { name: '다시 가져오기' })).toBeNull()
    expect(screen.getByText('의원 PC에서 11월 1일 07:10에 가져온 숫자예요')).toBeTruthy()
    expect(screen.getByText('이 PC는 비트와 연결되어 있지 않아요.')).toBeTruthy()
    expect(screen.getByRole<HTMLAnchorElement>('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.3 저장된 줄도 없으면 비트 PC 연결 필요([비트 PC 연결] → /claim/setup)', async () => {
    const { bridge } = setup({ state: 'no-extension' })
    render(<RevenueScreen />)
    expect(await screen.findByRole('heading', { level: 2, name: CONNECT })).toBeTruthy()
    expect(screen.getByText('비트 PC 연결 전')).toBeTruthy()
    expect(screen.getByRole<HTMLAnchorElement>('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
    expect(screen.getByText('연결하면 생기는 것 4가지')).toBeTruthy()
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.3 저장된 줄을 읽기 전에는 연결 필요 화면이 잠깐도 보이지 않는다', async () => {
    const { store } = setup({ state: 'no-extension', rows: ALL_SAVED })
    store.loadRevenue.mockImplementation(() => new Promise(() => {}))
    render(<RevenueScreen />)
    await waitFor(() => expect(store.loadRevenue).toHaveBeenCalled())
    expect(screen.queryByText(CONNECT)).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: '매출' })).toBeTruthy()
  })
})

describe('AC-009.4 상태', () => {
  it('AC-009.4 고른 달에 기록이 없으면 자료 없음: 숫자는 "–"와 "자료 없음", 빈 그래프 틀이 없다', async () => {
    setup({
      rows: rowsOf('2026-10'),
      call: async (_cmd, range) => ({ days: eachDay(range).map((date) => day(date, REST)), codes: [] }),
    })
    const { container } = render(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    await userEvent.setup().click(screen.getByRole('button', { name: '지난달' }))
    expect(screen.getByRole('heading', { level: 2, name: '자료 없음' })).toBeTruthy()
    expect(screen.getByText(new RegExp(NO_RECORD))).toBeTruthy()
    expect(screen.getAllByText('–').length).toBe(4)
    expect(container.querySelector('[aria-hidden="true"] [style*="height"]')).toBeNull()
  })

  it.each<[string, BridgeState, string, string]>([
    ['옛 도우미', 'update-helper', HELPER_OLD, 'E-HELPER-UNKNOWN-COMMAND'],
    ['옛 확장', 'update-extension', EXTENSION_OLD, 'E-BRIDGE-REJECTED'],
  ])('AC-009.4 %s 상태면 새 버전 화면이다(일반 오류 카드·[다시 확인]이 아님)', async (_name, state, heading, code) => {
    const { bridge } = setup({ state })
    render(<RevenueScreen />)
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    expect(screen.getByText(`오류 번호 ${code}`)).toBeTruthy()
    expect(screen.getByRole<HTMLAnchorElement>('link').getAttribute('href')).toBe('/claim/setup')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
    await waitFor(() => expect(bridge.call).not.toHaveBeenCalled())
  })

  it.each<[string, string, string]>([
    ['E-HELPER-UNKNOWN-COMMAND', '옛 도우미', HELPER_OLD],
    ['E-BRIDGE-REJECTED', '옛 확장', EXTENSION_OLD],
  ])('AC-009.4 연결된 PC가 가져오다 %s를 받으면 %s 화면이다(일반 오류 카드·[다시 확인]이 아님)', async (code, _name, heading) => {
    setup({
      call: async () => {
        throw coded(code)
      },
    })
    render(<RevenueScreen />)
    expect(await screen.findByRole('heading', { level: 2, name: heading })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
  })

  it('AC-009.4 통로 오류로 멈추면(상태가 먼저 바뀌고 거절은 그 뒤) 오류 카드와 [다시 확인]이고, 누르면 다시 가져온다', async () => {
    const { call, rejects } = heldCall()
    const { bridge } = setup({ call })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))

    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    rejects[0]!(coded('E-BRIDGE-DISCONNECTED'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('도우미와 연결이 끊겼어요')
    expect(alert.textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')

    bridge.call.mockImplementation(async (_cmd, range) => answerOf(range))
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))
    expect(bridge.retry).toHaveBeenCalledTimes(1)
    bridge.state = 'connecting'
    rerender(<RevenueScreen />)
    bridge.state = 'ready'
    rerender(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(bridge.call.mock.calls.length).toBe(14)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-009.4 저장된 줄이 없는 PC에서 가져오다 끊기면 연결 필요가 아니라 오류 카드이고, 거절이 오기 전에도 뒤에 저장된 줄을 읽은 뒤에도 그렇다', async () => {
    const { call, rejects } = heldCall()
    const { bridge, store } = setup({ call })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))

    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    expect(screen.queryByText(CONNECT)).toBeNull()
    rejects[0]!(coded('E-BRIDGE-DISCONNECTED'))

    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    await waitFor(() => expect(store.loadRevenue).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(screen.queryByText(CONNECT)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))
    expect(bridge.retry).toHaveBeenCalledTimes(1)
  })

  it('AC-009.4 저장된 줄이 있는 PC에서 가져오다 끊겨도 "연결되어 있지 않아요"가 아니라 오류 카드와 [다시 확인]이다', async () => {
    const { call, rejects } = heldCall()
    const { bridge, store } = setup({ call, rows: rowsOf(...LATEST_MONTHS.slice(1)) })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))

    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    rejects[0]!(coded('E-BRIDGE-DISCONNECTED'))

    await screen.findByRole('alert')
    await waitFor(() => expect(store.loadRevenue).toHaveBeenCalledTimes(3))
    expect(screen.queryByText(NOT_CONNECTED)).toBeNull()
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy()
  })

  it('AC-009.4 저장된 줄을 읽는 사이에 끊겨도(가져오는 중이라고 말하던 때) 오류 카드다', async () => {
    const { bridge, store } = setup()
    let finishLoad = () => {}
    store.loadRevenue.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLoad = () => resolve({ days: [], codes: [], fetchedAt: null })
        }),
    )
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(store.loadRevenue).toHaveBeenCalledTimes(1))
    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    finishLoad()
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(screen.queryByText(CONNECT)).toBeNull()
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.4 끊긴 뒤 [다시 확인]의 연결 확인이 번호로 끝나면 그 번호를 보이고 연결 필요로 바뀌지 않는다', async () => {
    const { call, rejects } = heldCall()
    const { bridge } = setup({ call })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))
    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    rejects[0]!(coded('E-BRIDGE-DISCONNECTED'))
    await screen.findByRole('alert')

    bridge.helloError = 'E-BRIDGE-BAD-REPLY'
    rerender(<RevenueScreen />)
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BRIDGE-BAD-REPLY')
    expect(screen.queryByText(CONNECT)).toBeNull()
  })

  it('AC-009.4 끊겨서 [다시 확인]을 눌러 돌아오면 읽기 전에 "수납 기록이 없어요"를 보이지 않고 가져오는 중이다(앞 차례가 끝난 뒤 다시 읽다 끊긴 때도)', async () => {
    const { bridge, store } = setup({
      call: async () => {
        throw coded('E-BIT-READ-FAILED')
      },
    })
    const { rerender } = render(<RevenueScreen />)
    const lead = await screen.findByText('13달을 가져오지 못했어요.')

    const { call, rejects } = heldCall()
    bridge.call.mockImplementation(call)
    const user = userEvent.setup()
    await user.click(within(lead.closest<HTMLElement>('[role="status"]')!).getByRole('button', { name: '다시 가져오기' }))
    await waitFor(() => expect(rejects).toHaveLength(1))
    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    rejects[0]!(coded('E-BRIDGE-DISCONNECTED'))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: '다시 확인' }))

    store.loadRevenue.mockImplementation(() => new Promise(() => {}))
    bridge.state = 'connecting'
    rerender(<RevenueScreen />)
    bridge.state = 'ready'
    rerender(<RevenueScreen />)
    expect(screen.getByRole('heading', { level: 2, name: FETCHING })).toBeTruthy()
    expect(screen.queryByText(new RegExp(NO_RECORD))).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each<[string, RevenueDayRow[], string]>([
    ['저장된 줄 없음', [], CONNECT],
    ['저장된 줄 있음', ALL_SAVED, NOT_CONNECTED],
  ])('AC-009.3 이 화면에서 가져온 적 없이 처음부터 끊겨 있으면 도중 끊김이 아니다(%s): 오류 카드 없이 그대로다', async (_name, rows, text) => {
    const { bridge } = setup({ state: 'disconnected', rows })
    render(<RevenueScreen />)
    expect(await screen.findByText(text)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.3 가져오기가 다 끝난 뒤에 끊기면 도중 끊김이 아니다: 저장된 숫자만 보이고 오류 카드가 없다', async () => {
    const { bridge } = setup({ rows: rowsOf(...LATEST_MONTHS.slice(1)) })
    const { rerender } = render(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    expect(await screen.findByText(NOT_CONNECTED)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 가져오기' })).toBeNull()
  })

  it('AC-009.3 비트 쪽 오류로 멈춘 뒤에 끊기면 도중 끊김이 아니다: 끊김 번호를 보이지 않는다', async () => {
    const { bridge } = setup({
      call: async () => {
        throw coded('E-BIT-DB-FAILED')
      },
    })
    const { rerender } = render(<RevenueScreen />)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-BIT-DB-FAILED')
    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    expect(await screen.findByText(CONNECT)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each<[string, RevenueDayRow[], string]>([
    ['저장된 줄 없음', [], CONNECT],
    ['저장된 줄 있음', rowsOf(...LATEST_MONTHS.slice(1)), NOT_CONNECTED],
  ])('AC-009.4 가져오다 도우미가 꺼지면(상태 no-helper가 먼저, E-HELPER-MISSING 거절은 그 뒤) 끊김 오류 카드와 [다시 확인]이다(%s)', async (_name, rows, wrong) => {
    const { call, rejects } = heldCall()
    const { bridge, store } = setup({ call, rows })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))

    bridge.state = 'no-helper'
    rerender(<RevenueScreen />)
    expect(screen.queryByText(wrong)).toBeNull()
    rejects[0]!(coded('E-HELPER-MISSING'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(alert.textContent).not.toContain('도우미가 없어요')
    await waitFor(() => expect(store.loadRevenue).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(screen.queryByText(wrong)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))
    expect(bridge.retry).toHaveBeenCalledTimes(1)
  })

  it('AC-009.4 도우미가 꺼져 [다시 확인]을 누른 뒤 정말 없으면 연결 필요로 간다', async () => {
    const { call, rejects } = heldCall()
    const { bridge } = setup({ call })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))
    bridge.state = 'no-helper'
    rerender(<RevenueScreen />)
    rejects[0]!(coded('E-HELPER-MISSING'))
    await screen.findByRole('alert')
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))

    bridge.state = 'connecting'
    rerender(<RevenueScreen />)
    bridge.state = 'no-helper'
    rerender(<RevenueScreen />)
    expect(await screen.findByText(CONNECT)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-009.4 도우미가 꺼져 [다시 확인]을 누른 뒤 돌아오면 이어서 가져온다', async () => {
    const { call, rejects } = heldCall()
    const { bridge } = setup({ call })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))
    bridge.state = 'no-helper'
    rerender(<RevenueScreen />)
    rejects[0]!(coded('E-HELPER-MISSING'))
    await screen.findByRole('alert')
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))

    bridge.call.mockImplementation(async (_cmd, range) => answerOf(range))
    bridge.state = 'connecting'
    rerender(<RevenueScreen />)
    bridge.state = 'ready'
    rerender(<RevenueScreen />)
    expect(screen.getByRole('heading', { level: 2, name: FETCHING })).toBeTruthy()
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(bridge.call).toHaveBeenCalledTimes(14)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-009.4 첫 연결 확인 중에 끊겨 번호가 남으면(disconnected + helloError) 연결 필요가 아니라 오류 카드와 [다시 확인]이다', async () => {
    const { bridge } = setup({ state: 'disconnected', helloError: 'E-BRIDGE-DISCONNECTED' })
    render(<RevenueScreen />)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(screen.queryByText(CONNECT)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))
    expect(bridge.retry).toHaveBeenCalledTimes(1)
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it.each<[string, RevenueDayRow[], string]>([
    ['저장된 줄 없음', [], CONNECT],
    ['저장된 줄 있음', ALL_SAVED, NOT_CONNECTED],
  ])('AC-009.3·AC-009.4 이 화면에서 가져온 적 없이 처음부터 도우미가 없으면 도중 끊김이 아니다(%s): 오류 카드 없이 그대로다', async (_name, rows, text) => {
    const { bridge } = setup({ state: 'no-helper', rows })
    render(<RevenueScreen />)
    expect(await screen.findByText(text)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.4 끊긴 때 저장 중이던 앞 차례는 저장이 끝나도 새 연결로 읽지 않는다: 새 연결에서 달마다 한 번씩만 읽는다', async () => {
    const { bridge, store } = setup()
    let releaseSave = () => {}
    store.saveMonth.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve
        }),
    )
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(store.saveMonth).toHaveBeenCalledTimes(1))

    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    await userEvent.setup().click(await screen.findByRole('button', { name: '다시 확인' }))
    bridge.call.mockClear()
    bridge.state = 'connecting'
    rerender(<RevenueScreen />)
    bridge.state = 'ready'
    rerender(<RevenueScreen />)
    releaseSave()

    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    await settle()
    expect(monthsCalled(bridge.call)).toEqual(LATEST_MONTHS)
  })

  it('AC-009.4 앞 차례가 늦게 끝나도 새 차례의 도중 끊김 표시를 지우지 않는다', async () => {
    const { bridge, store } = setup({ rows: rowsOf(...LATEST_MONTHS.slice(1)) })
    let releaseSave = () => {}
    store.saveMonth.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve
        }),
    )
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(store.saveMonth).toHaveBeenCalledTimes(1))

    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    await userEvent.setup().click(await screen.findByRole('button', { name: '다시 확인' }))
    const { call, rejects } = heldCall()
    bridge.call.mockImplementation(call)
    bridge.state = 'connecting'
    rerender(<RevenueScreen />)
    bridge.state = 'ready'
    rerender(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))

    // 앞 차례의 마지막 달 저장이 이제 끝난다: 앞 차례는 멈추지 않고 끝난다
    releaseSave()
    await settle()

    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    rejects[0]!(coded('E-BRIDGE-DISCONNECTED'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(screen.queryByText(NOT_CONNECTED)).toBeNull()
  })

  // 진짜 통로에서는 거절이 화면 다시 그리기보다 먼저 처리된다(그때는 아직 앞 차례가 끝나지 않았다)
  it.each<[string, BridgeState, string]>([
    ['포트 끊김', 'disconnected', 'E-BRIDGE-DISCONNECTED'],
    ['도우미 꺼짐', 'no-helper', 'E-HELPER-MISSING'],
  ])('AC-009.4 %s: 거절을 화면 다시 그리기보다 먼저 처리해도 오류 카드가 남는다', async (_name, state, code) => {
    const { call, rejects } = heldCall()
    const { bridge } = setup({ call })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))

    rejects[0]!(coded(code))
    await settle()
    bridge.state = state
    rerender(<RevenueScreen />)

    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(screen.queryByText(CONNECT)).toBeNull()
    await settle()
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
  })

  it.each<[string, BridgeState, string, RevenueDayRow[], string]>([
    ['포트 끊김·저장된 줄 없음', 'disconnected', 'E-BRIDGE-DISCONNECTED', [], CONNECT],
    ['도우미 꺼짐·저장된 줄 있음', 'no-helper', 'E-HELPER-MISSING', rowsOf(...LATEST_MONTHS.slice(1)), NOT_CONNECTED],
  ])('AC-009.4 %s: [다시 확인]을 눌러도 연결 상태가 바뀌기 전에는 틀린 안내가 그려지지 않고 카드가 남는다', async (_name, state, code, rows, wrong) => {
    const { call, rejects } = heldCall()
    const { bridge } = setup({ call, rows })
    const { rerender } = render(<RevenueScreen />)
    await waitFor(() => expect(rejects).toHaveLength(1))
    bridge.state = state
    rerender(<RevenueScreen />)
    rejects[0]!(coded(code))
    await screen.findByRole('alert')

    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))
    expect(bridge.retry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(wrong)).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
  })

  it('AC-009.3·AC-009.4 다른 창이 통로를 쓰는 중이고 저장된 줄이 없으면 연결 필요가 아니라 E-BRIDGE-BUSY 오류 카드와 [다시 확인]이다', async () => {
    const { bridge } = setup({ state: 'busy' })
    const { rerender } = render(<RevenueScreen />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(BUSY_WHAT)
    expect(alert.textContent).toContain('오류 번호 E-BRIDGE-BUSY')
    expect(screen.getByRole('heading', { level: 1, name: '매출' })).toBeTruthy()
    expect(screen.queryByText(CONNECT)).toBeNull()
    expect(bridge.call).not.toHaveBeenCalled()

    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))
    expect(bridge.retry).toHaveBeenCalledTimes(1)
    bridge.state = 'connecting'
    rerender(<RevenueScreen />)
    bridge.state = 'ready'
    rerender(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(bridge.call).toHaveBeenCalledTimes(13)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-009.3·AC-009.4 다른 창이 통로를 쓰는 중이고 저장된 줄이 있으면 숫자는 두고 알림 줄 자리에 E-BRIDGE-BUSY 오류 카드와 [다시 확인]이 있다', async () => {
    const { bridge } = setup({ state: 'busy', rows: ALL_SAVED })
    const { container } = render(<RevenueScreen />)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['매출 추이', '급여·비급여·기타', '치료별 매출', '건당 진료비'])
    expect(screen.getByText('의원 PC에서 11월 1일 07:10에 가져온 숫자예요')).toBeTruthy()
    expect(screen.queryByText(NOT_CONNECTED)).toBeNull()
    expect(screen.queryByRole('link', { name: '비트 PC 연결' })).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 가져오기' })).toBeNull()

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(BUSY_WHAT)
    expect(alert.textContent).toContain('오류 번호 E-BRIDGE-BUSY')
    // 자리: 달 고르기 → 오류 카드 → 첫 덩어리
    const text = container.textContent ?? ''
    expect(text.indexOf('수납한 날 기준')).toBeLessThan(text.indexOf(BUSY_WHAT))
    expect(text.indexOf(BUSY_WHAT)).toBeLessThan(text.indexOf('매출 추이'))

    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))
    expect(bridge.retry).toHaveBeenCalledTimes(1)
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.4 연결 확인이 오류 번호로 끝나면 오류 카드와 [다시 확인]이고 E-BRIDGE-REJECTED여도 옛 확장으로 말하지 않는다', async () => {
    const { bridge } = setup({ state: 'connecting', helloError: 'E-BRIDGE-REJECTED' })
    render(<RevenueScreen />)
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BRIDGE-REJECTED')
    expect(screen.queryByText(EXTENSION_OLD)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))
    expect(bridge.retry).toHaveBeenCalledTimes(1)
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.4 저장된 숫자를 읽지 못하면 오류 카드이고 빠진 달을 잘못 세어 가져오지 않는다. [다시 시도]로 다시 읽는다', async () => {
    const { store, bridge } = setup({ rows: ALL_SAVED })
    store.loadRevenue.mockRejectedValueOnce(coded('E-PAGE-FAILED'))
    render(<RevenueScreen />)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-PAGE-FAILED')
    expect(bridge.call).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-009.4 저장 실패면 오류 카드와 [다시 저장]이고, 누르면 그 달만 다시 읽어 저장한다', async () => {
    const { store, bridge } = setup({ rows: rowsOf(...LATEST_MONTHS.slice(1)) })
    store.saveMonth.mockRejectedValueOnce(coded('E-REVENUE-SAVE-FAILED'))
    render(<RevenueScreen />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('매출 숫자를 저장하지 못했어요')
    expect(alert.textContent).toContain('[다시 저장]')
    expect(alert.textContent).toContain('오류 번호 E-REVENUE-SAVE-FAILED')
    // 고른 달의 기록이 없다고 말하지 않는다
    expect(screen.queryByText(new RegExp(NO_RECORD))).toBeNull()
    // 알림 줄의 [다시 가져오기]가 겹쳐 나오지 않는다
    expect(screen.queryByRole('button', { name: '다시 가져오기' })).toBeNull()

    bridge.call.mockClear()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 저장' }))
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(monthsCalled(bridge.call)).toEqual(['2026-10'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-009.4 가져오지 못한 달이 있으면 알림 줄에 수와 달 목록이 있고, 그 줄의 [다시 가져오기]는 그 달들만 읽는다', async () => {
    let broken = true
    const { bridge } = setup({
      rows: rowsOf('2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-10'),
      call: async (_cmd, range) => {
        if (broken) throw coded('E-BIT-READ-FAILED')
        return answerOf(range)
      },
    })
    render(<RevenueScreen />)
    const lead = await screen.findByText('2달을 가져오지 못했어요.')
    const banner = lead.closest<HTMLElement>('[role="status"]')!
    expect(banner.textContent).toContain('2025년 11월·12월')
    expect(banner.textContent).toContain('나머지 달은 그대로 볼 수 있어요.')
    expect(screen.getByRole('heading', { level: 2, name: '매출 추이' })).toBeTruthy()

    broken = false
    bridge.call.mockClear()
    await userEvent.setup().click(within(banner).getByRole('button', { name: '다시 가져오기' }))
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(monthsCalled(bridge.call)).toEqual(['2025-11', '2025-12'])
    expect(screen.queryByText('2달을 가져오지 못했어요.')).toBeNull()
  })

  it('AC-009.4 제목 줄로 다른 달을 다시 읽어도 가져오지 못한 달의 알림은 남는다', async () => {
    let broken = true
    const { bridge } = setup({
      rows: rowsOf(...LATEST_MONTHS.filter((month) => month !== '2025-12')),
      call: async (_cmd, range) => {
        if (broken) throw coded('E-BIT-READ-FAILED')
        return answerOf(range)
      },
    })
    render(<RevenueScreen />)
    await screen.findByText('1달을 가져오지 못했어요.')

    broken = false
    bridge.call.mockClear()
    const user = userEvent.setup()
    const refreshes = screen.getAllByRole('button', { name: '다시 가져오기' })
    await user.click(refreshes[0]!)
    await screen.findByRole('heading', { level: 2, name: '매출 추이' })
    expect(monthsCalled(bridge.call)).toEqual(['2026-10'])
    expect(screen.getByText('1달을 가져오지 못했어요.')).toBeTruthy()
  })

  it('AC-009.4 가져오지 못한 달을 고르면 기록이 없다고 말하지 않는다', async () => {
    setup({
      rows: rowsOf(...LATEST_MONTHS.filter((month) => month !== '2026-09')),
      call: async () => {
        throw coded('E-BIT-READ-FAILED')
      },
    })
    render(<RevenueScreen />)
    await screen.findByText('1달을 가져오지 못했어요.')
    await userEvent.setup().click(screen.getByRole('button', { name: '지난달' }))
    expect(screen.getByText(/이 달은 가져오지 못했어요/)).toBeTruthy()
    expect(screen.queryByText(new RegExp(NO_RECORD))).toBeNull()
    expect(screen.getByText('1달을 가져오지 못했어요.')).toBeTruthy()
  })

  it('AC-009.4 묶음을 읽지 못하면 제안으로 바꾸지 않고 [다시 불러오기]가 있다', async () => {
    const saved: RxGroup[] = [{ id: 'g1', name: '가짜 묶음', codes: ['MANUAL1'], sortOrder: 0 }]
    const { groupStore } = setup({ rows: ALL_SAVED })
    groupStore.listGroups.mockRejectedValueOnce(coded('E-REVENUE-GROUP-LOAD-FAILED'))
    groupStore.listGroups.mockResolvedValue(saved)
    render(<RevenueScreen />)
    expect((await screen.findByRole('alert')).textContent).toContain('치료 묶음을 불러오지 못했어요')
    expect(screen.getByText('오류 번호 E-REVENUE-GROUP-LOAD-FAILED')).toBeTruthy()
    expect(screen.queryByText('제안 묶음 · 아직 저장 안 함')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(await screen.findByText('가짜 묶음')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-009.4 저장된 묶음이 없으면 제안 묶음 표시가 있다', async () => {
    setup({ rows: ALL_SAVED })
    render(<RevenueScreen />)
    expect(await screen.findByText('제안 묶음 · 아직 저장 안 함')).toBeTruthy()
  })
})
