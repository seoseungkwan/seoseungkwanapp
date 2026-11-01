// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eachDay, monthOf } from '@/lib/analytics/dates'
import { RxGroupStoreError } from '@/lib/storage/rxGroups'
import type { BridgeState } from '@/types/bridge'
import type { RevenueCodeRow, RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import { RevenueScreen } from './RevenueScreen'

// 매출 화면 (TASK-9·TASK-14, REQ-009 · AC-009.1~AC-009.4 · REQ-014 · AC-014.1·014.3·014.5·014.6). 가짜 useBridge·가짜 store를 넣는다. 자료는 모두 가짜 숫자다. 오늘은 2026-11-01(날짜만 멈춘다)

const fake = vi.hoisted(() => ({
  bridge: null as unknown,
  store: null as unknown,
  groups: null as unknown,
  useBridge: null as unknown as (...args: unknown[]) => unknown,
}))

vi.mock('@/components/claim/useBridge', () => ({ useBridge: (...args: unknown[]) => fake.useBridge(...args) }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: () => fake.store }))
vi.mock('@/lib/storage/rxGroups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/rxGroups')>()), // 편집 화면이 RxGroupStoreError를 알아본다
  createRxGroupStore: () => fake.groups,
}))
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

describe('AC-014 [묶음 고치기] → 편집 화면', () => {
  const EDITOR = { level: 1, name: /^치료 묶음 고치기/ } as const
  const CHIP = '제안 묶음 · 아직 저장 안 함'
  const LOAD_FAILED = '치료 묶음을 불러오지 못했어요'
  const SAVE_FAILED = 'E-REVENUE-GROUP-SAVE-FAILED'
  const G1: RxGroup = { id: 'g1', name: '가짜 묶음', codes: [], sortOrder: 0 }
  const G2: RxGroup = { id: 'g2', name: '다른 곳에서 지울 묶음', codes: [], sortOrder: 1 }

  const editButton = () => screen.findByRole<HTMLButtonElement>('button', { name: '묶음 고치기' })
  const nameField = (index = 0) => screen.getAllByRole<HTMLInputElement>('textbox', { name: '묶음 이름' })[index]!
  const firstButton = (name: string) => screen.getAllByRole('button', { name })[0]!
  const moveSelect = (code: string) => within(screen.getByText(code).closest('li')!).getByRole('combobox', { name: '옮길 묶음' })
  const backOnScreen = () => screen.findByRole('heading', { level: 2, name: '치료별 매출' })

  async function open(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await editButton())
    return screen.findByRole('heading', EDITOR)
  }

  /** DB처럼 움직이는 묶음 저장소: 없는 id면 'not my group'으로 실패한다(save_rx_groups) */
  function fakeServer(groupStore: ReturnType<typeof setup>['groupStore'], first: RxGroup[]) {
    const server = { rows: first }
    groupStore.listGroups.mockImplementation(async () => server.rows)
    groupStore.saveGroups.mockImplementation(async (after: RxGroup[]) => {
      const ids = new Set(server.rows.map((row) => row.id))
      if (after.some((row) => row.id !== null && !ids.has(row.id))) throw new RxGroupStoreError(SAVE_FAILED)
      server.rows = after.map((row, index) => ({ ...row, id: row.id ?? `new-${index}` }))
      return server.rows
    })
    return server
  }

  it('AC-014.1 [묶음 고치기]는 매출 탭 안에서 편집 화면을 열고 네 덩어리를 대신한다. [취소]는 고친 것을 버리고 아무것도 보내지 않는다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1] })
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    expect(screen.queryByRole('heading', { level: 2, name: '매출 추이' })).toBeNull()

    await user.clear(nameField())
    await user.type(nameField(), '버릴 이름')
    await user.click(firstButton('취소'))
    expect(await backOnScreen()).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '매출 추이' })).toBeTruthy()
    expect(groupStore.saveGroups).not.toHaveBeenCalled()

    await open(user)
    expect(nameField().value).toBe('가짜 묶음')
  })

  it('AC-014.1 머리의 [묶음 고치기]는 보조 작은 단추이고 저장된 숫자만 있어도 눌린다', async () => {
    setup({ state: 'no-helper', rows: ALL_SAVED, groups: [G1] })
    render(<RevenueScreen />)
    const edit = await editButton()
    expect(edit.disabled).toBe(false)
    expect(edit.getAttribute('aria-disabled')).toBeNull()
    expect(edit.className).toContain('max-md:h-11')
    expect(edit.closest('section')?.querySelector('h2')?.textContent).toBe('치료별 매출')
  })

  it('AC-014.2 편집 화면의 처방 목록에 _REST가 없고, 금액은 고른 달 것이다', async () => {
    const { store } = setup({ rows: ALL_SAVED, groups: [{ ...G1, codes: ['MANUAL1'] }] })
    const load = store.loadRevenue.getMockImplementation()!
    store.loadRevenue.mockImplementation(async () => {
      const rows = await load()
      return { ...rows, codes: [...rows.codes, { month: '2026-09', code: '_REST', name: null, count: 3, amount: 900_000 }, { month: '2026-09', code: 'HP01', name: '가짜 핫팩', count: 1, amount: 100_000 }] }
    })
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await editButton()
    await user.click(screen.getByRole('button', { name: '지난달' }))
    await open(user)
    expect(screen.queryByText('_REST')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: '그 밖 처방 1개' })).toBeTruthy()
    expect(screen.getByText('9월 30만 원')).toBeTruthy()
  })

  it('AC-014.3 저장된 묶음이 없으면 치료별 매출과 편집 화면 모두 제안 표시이고, 다섯 개로 채우며 저절로 저장하지 않는다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED })
    render(<RevenueScreen />)
    const user = userEvent.setup()
    expect(await screen.findByText(CHIP)).toBeTruthy()
    await open(user)
    expect(screen.getByText(CHIP)).toBeTruthy()
    expect(screen.getAllByRole('textbox', { name: '묶음 이름' })).toHaveLength(5)
    expect(groupStore.saveGroups).not.toHaveBeenCalled()
  })

  it('AC-014.3 묶음 읽기가 실패하면 안내·[다시 불러오기]가 있고 제안 칩이 없으며 [묶음 고치기]는 눌리지 않는다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED })
    groupStore.listGroups.mockRejectedValueOnce(coded('E-REVENUE-GROUP-LOAD-FAILED'))
    groupStore.listGroups.mockResolvedValue([{ ...G1, codes: ['MANUAL1'] }]) // 금액이 있어야 치료별 매출에 줄이 나온다
    render(<RevenueScreen />)
    const user = userEvent.setup()
    expect((await screen.findByRole('alert')).textContent).toContain(LOAD_FAILED)
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.queryByText(CHIP)).toBeNull()

    const edit = await editButton()
    expect(edit.disabled).toBe(true)
    expect(edit.getAttribute('aria-disabled')).toBe('true')
    const reads = groupStore.listGroups.mock.calls.length
    await user.click(edit)
    expect(screen.queryByRole('heading', EDITOR)).toBeNull()
    expect(groupStore.listGroups).toHaveBeenCalledTimes(reads)

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByText('가짜 묶음')
    expect((await editButton()).disabled).toBe(false)
    await open(user)
    expect(nameField().value).toBe('가짜 묶음')
  })

  it('AC-014.3 열 때 묶음을 다시 읽다 실패하면 편집을 열지 않고 제안으로 바꾸지 않는다. 기다리는 동안 [묶음 고치기]는 aria-busy이고 다시 눌러도 한 번 읽는다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1] })
    render(<RevenueScreen />)
    const user = userEvent.setup()
    const edit = await editButton()
    const reads = groupStore.listGroups.mock.calls.length
    let fail: (error: Error) => void = () => {}
    groupStore.listGroups.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    await user.click(edit)
    await user.click(edit)
    expect(edit.getAttribute('aria-busy')).toBe('true')
    expect(groupStore.listGroups).toHaveBeenCalledTimes(reads + 1)

    await act(async () => fail(coded('E-REVENUE-GROUP-LOAD-FAILED')))
    expect((await screen.findByRole('alert')).textContent).toContain(LOAD_FAILED)
    expect(screen.queryByRole('heading', EDITOR)).toBeNull()
    expect(screen.queryByText(CHIP)).toBeNull()
    expect((await editButton()).disabled).toBe(true)
  })

  it('AC-014.5 [저장]이 되면 돌아와 listGroups를 다시 읽고 치료별 매출을 저장한 묶음으로 그린다. 비트에서 다시 가져오지는 않는다', async () => {
    const { groupStore, bridge } = setup({ rows: ALL_SAVED, groups: [G1] })
    fakeServer(groupStore, [G1])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.selectOptions(moveSelect('MANUAL1'), '가짜 묶음')
    await user.clear(nameField())
    await user.type(nameField(), '새 이름')
    const reads = groupStore.listGroups.mock.calls.length
    const fetches = bridge.call.mock.calls.length
    await user.click(firstButton('저장'))

    const heading = await backOnScreen()
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(1)
    expect(groupStore.saveGroups).toHaveBeenCalledWith([{ id: 'g1', name: '새 이름', codes: ['MANUAL1'], sortOrder: 0 }])
    await waitFor(() => expect(groupStore.listGroups).toHaveBeenCalledTimes(reads + 1))
    await settle()
    expect(bridge.call.mock.calls.length).toBe(fetches)
    const block = heading.closest('section')!
    const items = within(block).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]!.textContent).toContain('새 이름')
    expect(screen.getByText(/내가 만든 묶음/)).toBeTruthy()
  })

  it('AC-014.5 제안을 저장하면 제안 표시가 없어진다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED })
    fakeServer(groupStore, [])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.click(firstButton('저장'))
    await backOnScreen()
    await waitFor(() => expect(screen.queryByText(CHIP)).toBeNull())
    expect(screen.getByText(/내가 만든 묶음/)).toBeTruthy()
  })

  it('AC-014.5 저장은 됐는데 다시 읽기가 실패하면 저장한 묶음을 그대로 그린다("불러오지 못했어요"라고 하지 않는다)', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [{ ...G1, codes: ['MANUAL1'] }] })
    groupStore.saveGroups.mockImplementation(async (after: RxGroup[]) => after)
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.clear(nameField())
    await user.type(nameField(), '새 이름')
    const reads = groupStore.listGroups.mock.calls.length
    groupStore.listGroups.mockRejectedValue(coded('E-REVENUE-GROUP-LOAD-FAILED'))
    await user.click(firstButton('저장'))

    expect(await screen.findByText('새 이름')).toBeTruthy()
    await waitFor(() => expect(groupStore.listGroups).toHaveBeenCalledTimes(reads + 1))
    await settle()
    expect(screen.getByText('새 이름')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect((await editButton()).disabled).toBe(false)
  })

  it('AC-014.5 저장이 실패하면 오류 카드·[다시 저장]이고 고친 것은 그대로이며, 다시 저장이 되면 돌아간다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1] })
    groupStore.saveGroups.mockRejectedValueOnce(new RxGroupStoreError(SAVE_FAILED))
    groupStore.saveGroups.mockImplementation(async (after: RxGroup[]) => after)
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.clear(nameField())
    await user.type(nameField(), '고친 이름')
    await user.click(firstButton('저장'))

    expect((await screen.findByRole('alert')).textContent).toContain('치료 묶음을 저장하지 못했어요')
    expect(screen.getByRole('heading', EDITOR)).toBeTruthy()
    expect(nameField().value).toBe('고친 이름')

    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    expect(await backOnScreen()).toBeTruthy()
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(2)
    expect(await screen.findByText(/내가 만든 묶음/)).toBeTruthy()
  })

  it('AC-014.5 편집 중에 다른 곳에서 지운 묶음: 고친 것을 새 줄(id 없음)로 되살려 저장하고 오류 카드가 없다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1, G2] })
    const server = fakeServer(groupStore, [G1, G2])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.selectOptions(moveSelect('MANUAL1'), G2.name)
    await user.clear(nameField(1))
    await user.type(nameField(1), '고친 이름')

    server.rows = [G1] // 폰에서 지웠다
    await user.click(firstButton('저장'))
    const heading = await backOnScreen()

    expect(groupStore.saveGroups).toHaveBeenCalledTimes(2)
    expect(groupStore.saveGroups.mock.lastCall![0]).toEqual([G1, { id: null, name: '고친 이름', codes: ['MANUAL1'], sortOrder: 1 }])
    expect(server.rows.map((row) => row.name)).toEqual([G1.name, '고친 이름'])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(heading.closest('section')!).getByText('고친 이름')).toBeTruthy()
  })

  it('AC-014.5 편집 중에 묶음이 모두 다른 곳에서 지워졌으면(다시 읽은 줄이 없으면) 모두 새 줄로 되살려 저장한다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1, G2] })
    const server = fakeServer(groupStore, [G1, G2])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.clear(nameField(1))
    await user.type(nameField(1), '고친 이름')

    server.rows = []
    await user.click(firstButton('저장'))
    await backOnScreen()

    expect(groupStore.saveGroups).toHaveBeenCalledTimes(2)
    expect(groupStore.saveGroups.mock.lastCall![0]).toEqual([
      { ...G1, id: null },
      { ...G2, id: null, name: '고친 이름' },
    ])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-014.5 편집 중에 다른 계정으로 바뀌었으면(다시 읽은 줄과 겹치는 id가 없으면) 다시 보내지 않는다: 그 계정의 묶음은 그대로이고 오류 카드이며 고친 것은 그대로다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1, G2] })
    const server = fakeServer(groupStore, [G1, G2])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.clear(nameField(1))
    await user.type(nameField(1), '고친 이름')

    const others: RxGroup[] = [
      { id: 'other-1', name: '다른 계정 묶음 1', codes: ['MANUAL1'], sortOrder: 0 },
      { id: 'other-2', name: '다른 계정 묶음 2', codes: [], sortOrder: 1 },
    ]
    server.rows = others // 다른 탭에서 다른 승인 계정으로 로그인했다
    await user.click(firstButton('저장'))

    expect((await screen.findByRole('alert')).textContent).toContain('치료 묶음을 저장하지 못했어요')
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(1)
    expect(server.rows).toEqual(others)
    expect(screen.getByRole('heading', EDITOR)).toBeTruthy()
    expect(nameField(1).value).toBe('고친 이름')
  })

  it('AC-014.5 지운 묶음을 확인하는 다시 읽기가 실패하면 오류 카드·[다시 저장]이고 고친 것은 그대로다. 읽을 수 있게 되면 [다시 저장]이 된다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1, G2] })
    const server = fakeServer(groupStore, [G1, G2])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.clear(nameField(1))
    await user.type(nameField(1), '고친 이름')

    server.rows = [G1]
    groupStore.listGroups.mockRejectedValueOnce(coded('E-REVENUE-GROUP-LOAD-FAILED'))
    await user.click(firstButton('저장'))
    expect((await screen.findByRole('alert')).textContent).toContain('치료 묶음을 저장하지 못했어요')
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', EDITOR)).toBeTruthy()
    expect(nameField(1).value).toBe('고친 이름')

    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    await backOnScreen()
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(3)
    expect(groupStore.saveGroups.mock.lastCall![0][1]).toEqual({ ...G2, id: null, name: '고친 이름' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-014.5 다시 읽기가 실패해 카드가 남아도 [취소] 뒤 다시 열면 새로 읽은 목록이라 지워진 묶음 없이 저장된다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1, G2] })
    const server = fakeServer(groupStore, [G1, G2])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    expect(screen.getAllByRole('textbox', { name: '묶음 이름' })).toHaveLength(2)

    server.rows = [G1] // 폰에서 지웠다
    groupStore.listGroups.mockRejectedValueOnce(coded('E-REVENUE-GROUP-LOAD-FAILED'))
    await user.click(firstButton('저장'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('heading', EDITOR)).toBeTruthy()

    await user.click(firstButton('취소'))
    await backOnScreen()
    await open(user)
    expect(screen.getAllByRole('textbox', { name: '묶음 이름' }).map((field) => (field as HTMLInputElement).value)).toEqual(['가짜 묶음'])
    await user.click(firstButton('저장'))
    await backOnScreen()
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(2)
    expect(groupStore.saveGroups.mock.lastCall![0]).toEqual([G1])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-014.5 되살려 보낸 저장도 실패하면 오류 카드이고 고친 것은 그대로다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1, G2] })
    const server = fakeServer(groupStore, [G1, G2])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.clear(nameField(1))
    await user.type(nameField(1), '고친 이름')

    server.rows = [G1]
    groupStore.saveGroups.mockRejectedValue(new RxGroupStoreError(SAVE_FAILED))
    await user.click(firstButton('저장'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(2)
    expect(nameField(1).value).toBe('고친 이름')
  })

  it('AC-014.5 화면을 연 뒤 다른 곳에서 지운 묶음: 편집은 늘 새로 읽어 열어서 첫 저장부터 된다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1, G2] })
    const server = fakeServer(groupStore, [G1, G2])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await editButton()
    server.rows = [G1]
    await open(user)
    expect(screen.getAllByRole('textbox', { name: '묶음 이름' })).toHaveLength(1)
    await user.click(firstButton('저장'))
    await backOnScreen()
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(1)
  })

  it('AC-014.5 화면을 연 뒤 다른 곳에서 처음 저장한 묶음: 제안(새 줄)으로 잘못 열지 않는다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED })
    const server = fakeServer(groupStore, [])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await screen.findByText(CHIP)
    server.rows = [G1]
    await open(user)
    expect(screen.queryByText(CHIP)).toBeNull()
    expect(nameField().value).toBe('가짜 묶음')
  })

  it('AC-014.3 묶음을 모두 지우고 저장하면 빈 목록을 보내고, 저장된 묶음이 없으니 제안 표시로 돌아간다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1] })
    fakeServer(groupStore, [G1])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: '묶음 지우기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지우기' }))
    await user.click(firstButton('저장'))
    await backOnScreen()
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(1)
    expect(groupStore.saveGroups).toHaveBeenCalledWith([])
    expect(await screen.findByText(CHIP)).toBeTruthy()
  })

  it('AC-014.1 열면 초점이 제목 줄로 간다: 세 번째 덩어리에서 눌러도 제목과 [취소]·[저장]이 화면에 들어온다', async () => {
    setup({ rows: ALL_SAVED, groups: [G1] })
    render(<RevenueScreen />)
    const heading = await open(userEvent.setup())
    expect(document.activeElement).toBe(heading.parentElement)
  })

  it('AC-014.1 [취소]로 돌아오면 초점이 [묶음 고치기]로 간다: 그 덩어리가 화면에 들어오고 붙어 있는 띠에 가리지 않는다', async () => {
    setup({ rows: ALL_SAVED, groups: [G1] })
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.click(firstButton('취소'))
    await backOnScreen()
    const edit = await editButton()
    expect(document.activeElement).toBe(edit)
    expect(edit.className.split(/\s+/)).toEqual(expect.arrayContaining(['scroll-mt-25.5', 'max-md:scroll-mt-23.5']))
  })

  it('AC-014.5 [저장]으로 돌아와도 초점이 [묶음 고치기]로 간다: 다시 그린 치료별 매출이 화면에 들어온다', async () => {
    const { groupStore } = setup({ rows: ALL_SAVED, groups: [G1] })
    fakeServer(groupStore, [G1])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.click(firstButton('저장'))
    await backOnScreen()
    expect(document.activeElement).toBe(await editButton())
  })

  it('AC-014.1 돌아올 때 말고는 초점을 옮기지 않는다: 처음 그릴 때·달을 바꿀 때·돌아온 뒤 통로 상태가 바뀔 때', async () => {
    const { bridge } = setup({ state: 'no-helper', rows: ALL_SAVED, groups: [G1] })
    const { rerender } = render(<RevenueScreen />)
    const user = userEvent.setup()
    await editButton()
    await settle()
    expect(document.activeElement).toBe(document.body)

    const previous = screen.getByRole('button', { name: '지난달' })
    await user.click(previous)
    await settle()
    expect(document.activeElement).toBe(previous)

    await open(user)
    await user.click(firstButton('취소'))
    await backOnScreen()
    const next = screen.getByRole('button', { name: '지난달' })
    next.focus()
    bridge.state = 'disconnected'
    rerender(<RevenueScreen />)
    await settle()
    expect(document.activeElement).toBe(next)
  })

  it('AC-014.6 연결 안 된 PC에서도 고치고 저장한다: 통로를 부르지 않는다', async () => {
    const { groupStore, bridge } = setup({ state: 'no-helper', rows: ALL_SAVED, groups: [G1] })
    fakeServer(groupStore, [G1])
    render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.selectOptions(moveSelect('MANUAL1'), '가짜 묶음')
    await user.click(firstButton('저장'))
    await backOnScreen()
    expect(groupStore.saveGroups).toHaveBeenCalledTimes(1)
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-014.6 고치는 동안 통로 상태가 바뀌거나 묶음 다시 읽기가 실패해도 편집 화면과 고친 것이 그대로다', async () => {
    const { groupStore, bridge } = setup({ rows: ALL_SAVED, groups: [G1] })
    const { rerender } = render(<RevenueScreen />)
    const user = userEvent.setup()
    await open(user)
    await user.clear(nameField())
    await user.type(nameField(), '고치는 중')

    groupStore.listGroups.mockRejectedValue(coded('E-REVENUE-GROUP-LOAD-FAILED'))
    for (const state of ['connecting', 'disconnected', 'no-helper', 'busy', 'ready'] as BridgeState[]) {
      bridge.state = state
      rerender(<RevenueScreen />)
      await settle()
      expect(screen.getByRole('heading', EDITOR)).toBeTruthy()
      expect(nameField().value).toBe('고치는 중')
    }
  })
})
