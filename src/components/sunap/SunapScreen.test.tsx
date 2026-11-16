// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { errorInfo } from '@/lib/errors'
import { dayTotals } from '@/lib/sunap/ledger'
import {
  addSpend,
  closeSunapDay,
  deleteSpend,
  listSpends,
  loadSunapDay,
  loadSunapSettings,
  reopenSunapDay,
  saveSunapSettings,
  SunapStorageError,
  updateSpend,
  type SunapDay,
  type SunapSpend,
} from '@/lib/storage/sunap'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import type { BridgeState } from '@/types/bridge'
import type { StatsRxGroup } from '@/types/rxGroups'
import { DEFAULT_RSV_WORDS, type Ledger, type LedgerRow, type SunapSettings } from '@/types/sunap'
import { screenMode, SunapScreen } from './SunapScreen'

// 수납일지 화면(spec sunap-ilji REQ-4905, 시안 docs/mockups/sunap-ilji ?s=open·pick·closed·late·settings·remote).
// 통로(useBridge)·장부 Worker 훅(useSunapWorker)·서버 저장 함수는 흉내 낸다. 가짜 Worker 훅은 load를 받으면 그 날 장부를 돌려준다

vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/statsRxGroups', () => ({ listStatsRxGroups: vi.fn() }))
vi.mock('@/lib/storage/sunap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/sunap')>()),
  closeSunapDay: vi.fn(),
  reopenSunapDay: vi.fn(),
  loadSunapDay: vi.fn(),
  listSpends: vi.fn(),
  addSpend: vi.fn(),
  updateSpend: vi.fn(),
  deleteSpend: vi.fn(),
  loadSunapSettings: vi.fn(),
  saveSunapSettings: vi.fn(),
}))

type FakeState = { view: (Ledger & { totals: ReturnType<typeof dayTotals> }) | null; loading: boolean; loadedAt: Date | null; error: { op: string; code: string } | null }
const fake = vi.hoisted(() => ({
  worker: {},
  state: null as unknown,
  set: null as null | ((update: (prev: never) => unknown) => void),
  load: vi.fn(),
  edit: vi.fn(),
  close: vi.fn(),
  reopen: vi.fn(),
}))
vi.mock('./useSunapWorker', async () => {
  const React = await import('react')
  return {
    useSunapWorkerObject: () => fake.worker,
    useSunapWorker: () => {
      const [state, setState] = React.useState(() => ({ view: null, loading: false, loadedAt: null, error: null }))
      fake.state = state
      fake.set = setState as never
      return { ...state, load: fake.load, edit: fake.edit, close: fake.close, reopen: fake.reopen }
    },
  }
})

const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
const TODAY = '2026-11-16'

const base: LedgerRow = {
  chart: '',
  name: '',
  time: '09:00',
  kind: 're',
  cash: 0,
  card: 0,
  transfer: 0,
  unpaid: 0,
  free: false,
  block: false,
  pt: false,
  rsv: { kind: 'none', source: 'bit', at: null },
  note: '',
  edited: [],
}
const row = (over: Partial<LedgerRow>): LedgerRow => {
  const r = { ...base, ...over }
  return { ...r, free: r.cash + r.card + r.transfer + r.unpaid === 0 }
}
const ROWS: LedgerRow[] = [
  row({ chart: '10231', name: '김○○', time: '09:02', card: 15000, block: true, pt: true, rsv: { kind: 'inj', source: 'bit', at: '202611191030' } }),
  row({ chart: '10877', name: '이○○', time: '09:05', cash: 4700, pt: true }),
  row({ chart: '21004', name: '박○○', time: '09:11', kind: 'new', card: 23400, block: true, pt: true, rsv: { kind: 'visit', source: 'bit', at: '202611181000' } }),
  row({ chart: '10552', name: '최○○', time: '09:14', card: 9800, pt: true, rsv: { kind: 'inj', source: 'hand', at: null } }),
  row({ chart: '19870', name: '정○○', time: '09:20', kind: 'd90', card: 18200, block: true, rsv: { kind: 'inj', source: 'bit', at: '202611201100' } }),
  row({ chart: '10013', name: '강○○', time: '09:31', pt: true }),
  row({ chart: '15220', name: '윤○○', time: '09:44', card: 31500, block: true, rsv: { kind: 'unknown', source: 'bit', at: '202611210930' } }),
  row({ chart: '10344', name: '서○○', time: '10:25', card: 42800, block: true, edited: ['block'], rsv: { kind: 'inj', source: 'bit', at: '202611261000' } }),
  row({ chart: '16455', name: '황○○', time: '10:47', cash: 5000, card: 10000, pt: true, edited: ['cash'], rsv: { kind: 'visit', source: 'bit', at: '202611241400' } }),
  row({ chart: '21006', name: '임○○', time: '10:03', kind: 'new', unpaid: 16300, pt: true, rsv: { kind: 'visit', source: 'hand', at: null } }),
]
const PAID = [
  { chart: '20788', name: '문○○', time: '', cash: 10000, card: 0 },
  { chart: '11530', name: '배○○', time: '', cash: 0, card: 15000 },
]
const ledgerOf = (day: string, closedAt: string | null = null, late = false): Ledger => ({ day, unsure: false, rows: ROWS, paid: PAID, closedAt, late })
const TOTALS = dayTotals(ledgerOf(TODAY))

const GROUPS: StatsRxGroup[] = [
  { id: 'g-block', name: '신경차단술', codes: ['MM110', 'MM120'], sortOrder: 0 },
  { id: 'g-pt', name: '기본 물리치료', codes: ['MM301', 'MM302', 'MM303'], sortOrder: 1 },
]
const SETTINGS: SunapSettings = { blockGroup: 'g-block', ptGroup: 'g-pt', words: DEFAULT_RSV_WORDS }
const SPENDS: SunapSpend[] = [
  { id: 's1', kind: 'cash', memo: '택배비', amount: 5000 },
  { id: 's2', kind: 'card', memo: '사무용품', amount: 48000 },
]

// 그 날 PC 저장의 마감 상태(가짜 Worker가 장부에 싣는다)
let localClosed: Record<string, { closedAt: string; late: boolean }> = {}
const bridge = vi.mocked(useBridge)

function withBridge(state: BridgeState, helperVersion?: string, helloError: string | null = null) {
  bridge.mockReturnValue({
    state,
    hello: helperVersion ? { state, helperVersion, extensionVersion: '0.1.0', helperUpdateAvailable: false } : null,
    helloError,
    helperUpdateAvailable: false,
    call: vi.fn(),
    stream: vi.fn(),
    onProgress: vi.fn(),
    close: vi.fn(),
    retry: vi.fn(),
  } as unknown as ReturnType<typeof useBridge>)
}

const setFake = (update: (prev: FakeState) => FakeState) => act(() => fake.set!(update as never))
const viewNow = () => (fake.state as FakeState).view

beforeEach(() => {
  localClosed = {}
  withBridge('ready', '0.8.0')
  vi.mocked(listStatsRxGroups).mockResolvedValue(GROUPS)
  vi.mocked(loadSunapSettings).mockResolvedValue(SETTINGS)
  vi.mocked(loadSunapDay).mockResolvedValue(null)
  vi.mocked(listSpends).mockResolvedValue(SPENDS)
  vi.mocked(closeSunapDay).mockResolvedValue(undefined)
  vi.mocked(reopenSunapDay).mockResolvedValue(undefined)
  vi.mocked(saveSunapSettings).mockResolvedValue(undefined)
  vi.mocked(addSpend).mockImplementation(async (_c, _d, spend) => ({ id: 'new-1', ...spend }))
  vi.mocked(updateSpend).mockImplementation(async (_c, id, patch) => ({ ...SPENDS.find((s) => s.id === id)!, ...patch, id }))
  vi.mocked(deleteSpend).mockResolvedValue(undefined)
  fake.load.mockReset().mockImplementation((ask: { day: string }) => {
    const closed = localClosed[ask.day]
    const ledger = ledgerOf(ask.day, closed?.closedAt ?? null, closed?.late ?? false)
    fake.set!((() => ({ view: { ...ledger, totals: TOTALS }, loading: false, loadedAt: new Date('2026-11-16T09:40:00.000Z'), error: null })) as never)
  })
  fake.edit.mockReset()
  fake.close.mockReset().mockImplementation(async () => {
    const view = viewNow()!
    const closedAt = view.closedAt ?? new Date().toISOString()
    setFake((prev) => ({ ...prev, view: { ...prev.view!, closedAt } }))
    return { day: view.day, totals: TOTALS, late: view.late }
  })
  fake.reopen.mockReset().mockImplementation(async () => {
    setFake((prev) => ({ ...prev, view: { ...prev.view!, closedAt: null } }))
    return { ok: true }
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

async function open() {
  const user = userEvent.setup()
  render(<SunapScreen initialToday={TODAY} />)
  await screen.findByRole('heading', { name: '환자 장부' })
  return user
}

// 글자 전체가 같은 가장 안쪽 요소(굵은 글자처럼 안에 요소가 섞인 줄)
const fullText = (text: string) =>
  screen.getByText((_, el) => el !== null && el.textContent === text && ![...el.children].some((child) => child.textContent === text))
const chip = () => screen.getByTestId('sunap-state')
const region = (name: RegExp | string) => within(screen.getByRole('region', { name }))

describe('AC-4905.1 도우미 0.8.0 이상이 연결된 PC(시안 ?s=open)', () => {
  it('AC-4905.1: 날짜 이동·상태 칩·[비트에서 다시 불러오기]·[설정]·[마감하기], 불러온 시각', async () => {
    await open()
    expect(screen.getByRole('heading', { level: 1, name: '수납일지' })).toBeTruthy()
    expect(screen.getByText('11월 16일 (월)')).toBeTruthy()
    expect(screen.getByText('2026년')).toBeTruthy()
    expect(chip().textContent).toBe('마감 전')
    expect(screen.getByRole('button', { name: '전날' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '다음 날' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '오늘' })).toBeNull()
    for (const name of ['비트에서 다시 불러오기', '설정', '마감하기']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByText('비트에서 18:40 불러옴')).toBeTruthy()
  })

  it('AC-4905.1: 잠금 한 줄·요약 네 칸·환자 장부·미수 입금·지출이 보이고 원장님별 표는 없다', async () => {
    await open()
    expect(fullText('환자 이름 줄과 고친 칸은 이 접수 PC 안에만 저장돼요. 서버에는 마감할 때 합계·비율 숫자만 올라가요.')).toBeTruthy()
    const pay = region(/^수납/)
    expect(pay.getByText('12건')).toBeTruthy()
    expect(pay.getByText('185,400')).toBeTruthy()
    expect(region(/^지출 \d/).getByText('53,000')).toBeTruthy()
    expect(region(/^내원/).getByText('10')).toBeTruthy()
    expect(region(/^예약 · Block 전환/).getByText('60.0%')).toBeTruthy() // 재진+Block 3/5
    expect(screen.getByRole('heading', { name: '미수 입금' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '지출 목록' })).toBeTruthy()
    expect(screen.queryByText(/원장님/)).toBeNull()
  })

  it('AC-4905.1: 장부는 설정의 묶음 정의·메모 말로 그 날을 불러온다', async () => {
    await open()
    expect(fake.load).toHaveBeenCalledTimes(1)
    expect(fake.load).toHaveBeenCalledWith({
      day: TODAY,
      words: DEFAULT_RSV_WORDS,
      blockDef: expect.objectContaining({ codes: ['MM110', 'MM120'] }),
      ptDef: expect.objectContaining({ codes: ['MM301', 'MM302', 'MM303'] }),
    })
    expect(loadSunapDay).toHaveBeenCalledWith(CLIENT, TODAY)
    expect(listSpends).toHaveBeenCalledWith(CLIENT, TODAY)
  })

  it("AC-4905.1: 예약 종류 모름 줄이 있으면 안내 한 줄(메모 말은 설정 값)", async () => {
    await open()
    expect(
      fullText("예약 종류 모름 1줄 — 비트 예약은 있는데 메모에 정해진 말('주사', '경과')이 없어요. 다음 예약 칸을 눌러 직접 고르거나 비트 메모를 고쳐 주세요."),
    ).toBeTruthy()
  })

  it('AC-4905.1: [전날]·[오늘]로 날짜를 옮기면 그 날을 불러온다. 오늘 뒤로는 못 간다', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '전날' }))
    await waitFor(() => expect(fake.load).toHaveBeenLastCalledWith(expect.objectContaining({ day: '2026-11-15' })))
    expect(screen.getByText('11월 15일 (일)')).toBeTruthy()
    expect(listSpends).toHaveBeenLastCalledWith(CLIENT, '2026-11-15')
    expect((screen.getByRole('button', { name: '다음 날' }) as HTMLButtonElement).disabled).toBe(false)
    await user.click(screen.getByRole('button', { name: '오늘' }))
    await waitFor(() => expect(fake.load).toHaveBeenLastCalledWith(expect.objectContaining({ day: TODAY })))
    expect(screen.queryByRole('button', { name: '오늘' })).toBeNull()
  })

  it('AC-4905.1: [비트에서 다시 불러오기]는 같은 날을 다시 불러온다', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '비트에서 다시 불러오기' }))
    await waitFor(() => expect(fake.load).toHaveBeenCalledTimes(2))
    expect(fake.load).toHaveBeenLastCalledWith(expect.objectContaining({ day: TODAY }))
  })

  it('AC-4905.1: 장부를 읽지 못하면 오류 번호 카드를 보인다', async () => {
    await open()
    setFake((prev) => ({ ...prev, view: null, error: { op: 'load', code: 'E-BIT-READ-FAILED' } }))
    expect(screen.getByText(errorInfo('E-BIT-READ-FAILED').what)).toBeTruthy()
    expect(screen.getByText('오류 번호 E-BIT-READ-FAILED')).toBeTruthy()
  })

  it('AC-4905.1: 연결을 확인하는 동안은 불러오지 않는다', async () => {
    withBridge('connecting')
    render(<SunapScreen initialToday={TODAY} />)
    expect(await screen.findByText('비트 PC 연결을 확인하는 중이에요')).toBeTruthy()
    expect(fake.load).not.toHaveBeenCalled()
  })
})

describe('AC-4905.2·AC-4905.3 장부 고치기는 Worker edit로 간다', () => {
  it('AC-4905.2: 금액 칸을 고치면 edit(차트, 바꾼 칸)', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '김○○ 카드' }))
    const pop = screen.getByRole('dialog', { name: '금액 · 김○○' })
    await user.clear(within(pop).getByRole('textbox', { name: '카드' }))
    await user.type(within(pop).getByRole('textbox', { name: '카드' }), '20000')
    await user.click(within(pop).getByRole('button', { name: '저장' }))
    expect(fake.edit).toHaveBeenCalledWith('10231', { card: 20000 })
  })

  it('AC-4905.2: Block을 누르면 edit(차트, {block})', async () => {
    const user = await open()
    await user.click(screen.getByRole('checkbox', { name: '이○○ Block' }))
    expect(fake.edit).toHaveBeenCalledWith('10877', { block: true })
  })

  it('AC-4905.3: 다음 예약을 고르면 edit(차트, {rsv})', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '윤○○ 다음 예약' }))
    const pop = screen.getByRole('dialog', { name: '다음 예약 · 윤○○' })
    await user.click(within(pop).getByRole('radio', { name: /^진료\(경과\)/ }))
    await user.click(within(pop).getByRole('button', { name: '고르기' }))
    expect(fake.edit).toHaveBeenCalledWith('15220', { rsv: 'visit' })
  })
})

describe('AC-4905.4 마감하기·마감 풀기', () => {
  it('AC-4905.4: [마감하기] → Worker close → closeSunapDay 차례, 상태 칩이 마감됨 · 시각이 되고 장부·지출은 고칠 수 없다', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T09:52:00.000Z') })
    const user = await open()
    await user.click(screen.getByRole('button', { name: '마감하기' }))
    await waitFor(() => expect(closeSunapDay).toHaveBeenCalledWith(CLIENT, TODAY, TOTALS, false))
    expect(fake.close.mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(closeSunapDay).mock.invocationCallOrder[0]!)
    await waitFor(() => expect(chip().textContent).toBe('마감됨 · 18:52'))
    expect(
      fullText(
        '11월 16일 마감했어요. 합계·비율 숫자를 서버에 올렸어요(원장님 폰·통계에서 보여요). 예약은 지금 값으로 고정돼요. 고치려면 [마감 풀기]를 누르세요.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '마감 풀기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '마감하기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '비트에서 다시 불러오기' })).toBeNull()
    expect(screen.getByText('마감한 날이라 고칠 수 없어요')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '김○○ 카드' })).toBeNull()
    const spends = region('지출 목록')
    expect(spends.queryByRole('button', { name: '+ 지출 줄 더하기' })).toBeNull()
    expect(spends.queryAllByRole('textbox')).toHaveLength(0)
    expect(spends.getByText('택배비')).toBeTruthy()
  })

  it('AC-4905.4: 서버 저장이 실패하면 오류 글을 보이고 상태를 바꾸지 않는다. [마감하기]를 다시 누르면 다시 올린다', async () => {
    vi.mocked(closeSunapDay).mockRejectedValueOnce(new SunapStorageError('failed'))
    const user = await open()
    await user.click(screen.getByRole('button', { name: '마감하기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('마감 숫자를 서버에 올리지 못했어요')
    expect(chip().textContent).toBe('마감 전')
    await user.click(screen.getByRole('button', { name: '마감하기' }))
    await waitFor(() => expect(closeSunapDay).toHaveBeenCalledTimes(2))
    expect(fake.close).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(chip().textContent).toMatch(/^마감됨 · \d\d:\d\d$/))
    expect(screen.queryByText(/마감 숫자를 서버에 올리지 못했어요/)).toBeNull()
  })

  it('AC-4905.4: Worker가 마감을 거절하면 서버에 올리지 않는다', async () => {
    fake.close.mockResolvedValueOnce({ code: 'E-STORE-FAILED' })
    const user = await open()
    await user.click(screen.getByRole('button', { name: '마감하기' }))
    expect(await screen.findByText(errorInfo('E-STORE-FAILED').what)).toBeTruthy()
    expect(closeSunapDay).not.toHaveBeenCalled()
    expect(chip().textContent).toBe('마감 전')
  })

  it('AC-4905.4: [마감 풀기]는 reopenSunapDay → Worker reopen 차례이고 다시 고칠 수 있다', async () => {
    localClosed[TODAY] = { closedAt: '2026-11-16T09:52:00.000Z', late: false }
    vi.mocked(loadSunapDay).mockResolvedValue({ day: TODAY, closedAt: '2026-11-16T09:52:00.000Z', late: false, totals: TOTALS } satisfies SunapDay)
    const user = await open()
    await waitFor(() => expect(chip().textContent).toBe('마감됨 · 18:52'))
    await user.click(screen.getByRole('button', { name: '마감 풀기' }))
    await waitFor(() => expect(fake.reopen).toHaveBeenCalledTimes(1))
    expect(reopenSunapDay).toHaveBeenCalledWith(CLIENT, TODAY)
    expect(vi.mocked(reopenSunapDay).mock.invocationCallOrder[0]!).toBeLessThan(fake.reopen.mock.invocationCallOrder[0]!)
    await waitFor(() => expect(chip().textContent).toBe('마감 전'))
    expect(screen.getByRole('button', { name: '김○○ 카드' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '마감하기' })).toBeTruthy()
  })

  it('AC-4905.4: 마감 풀기 서버 저장이 실패하면 오류 글을 보이고 Worker는 그대로 둔다', async () => {
    localClosed[TODAY] = { closedAt: '2026-11-16T09:52:00.000Z', late: false }
    vi.mocked(loadSunapDay).mockResolvedValue({ day: TODAY, closedAt: '2026-11-16T09:52:00.000Z', late: false, totals: TOTALS })
    vi.mocked(reopenSunapDay).mockRejectedValueOnce(new SunapStorageError('offline'))
    const user = await open()
    await waitFor(() => expect(chip().textContent).toBe('마감됨 · 18:52'))
    await user.click(screen.getByRole('button', { name: '마감 풀기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('서버에서 마감을 풀지 못했어요')
    expect(fake.reopen).not.toHaveBeenCalled()
    expect(chip().textContent).toBe('마감됨 · 18:52')
  })

  it("AC-4905.4: 늦은 마감은 '늦은 마감 · 날짜 시각'과 늦은 마감 안내(시안 ?s=late)", async () => {
    localClosed['2026-11-13'] = { closedAt: '2026-11-16T09:55:00.000Z', late: true }
    vi.mocked(loadSunapDay).mockImplementation(async (_c, ymd) =>
      ymd === '2026-11-13' ? { day: ymd, closedAt: '2026-11-16T09:55:00.000Z', late: true, totals: TOTALS } : null,
    )
    const user = await open()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: '전날' }))
    await waitFor(() => expect(chip().textContent).toBe('늦은 마감 · 11월 16일 18:55'))
    expect(screen.getByText('11월 13일 (금)')).toBeTruthy()
    expect(
      fullText(
        "이 날은 다음 날 이후에 마감했어요. 그 사이 전화로 잡은 예약도 '예약함'으로 들어갔을 수 있어서, 예약률이 실제보다 조금 높을 수 있어요. 통계에도 이 표시가 같이 붙어요.",
      ),
    ).toBeTruthy()
  })
})

describe('AC-4905.5 설정(시안 ?s=settings)', () => {
  it('AC-4905.5: Block·물리치료 묶음 고르기(통계 처방 묶음)와 예약 메모 말 세 줄이 있다', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '설정' }))
    const drawer = within(screen.getByRole('dialog', { name: '수납일지 설정' }))
    const block = drawer.getByRole('combobox', { name: 'Block으로 셀 처방' }) as HTMLSelectElement
    expect(block.value).toBe('g-block')
    expect([...block.options].map((o) => o.textContent)).toEqual(['고르지 않음', '신경차단술 (코드 2개)', '기본 물리치료 (코드 3개)'])
    expect((drawer.getByRole('combobox', { name: '물리치료로 셀 처방' }) as HTMLSelectElement).value).toBe('g-pt')
    expect(drawer.getByText('통계 탭에 만들어 둔 처방 묶음 중 하나를 골라요. 묶음 안 코드를 바꾸면 수납일지·통계가 같이 바뀌어요.')).toBeTruthy()
    expect(drawer.getByText('같은 방법으로 처방 묶음 하나를 골라요.')).toBeTruthy()
    expect(drawer.getByRole('link', { name: '처방 묶음 고치러 가기 →' }).getAttribute('href')).toBe('/stats')
    expect(drawer.getByText('비트 예약 메모에 이 말이 들어 있으면 예약 종류를 자동으로 정해요. 여러 말이 겹치면 위 줄이 이겨요.')).toBeTruthy()
    for (const word of ['주사', '블록', '경과', '진료', '기타']) expect(drawer.getByRole('button', { name: `${word} 지우기` })).toBeTruthy()
    for (const lab of ['주사치료', '진료(경과)', '기타']) expect(drawer.getByRole('button', { name: `${lab} 말 더하기` })).toBeTruthy()
    // 지출 종류 이름 바꾸기는 뺐다(design.md '시안과 다른 곳')
    expect(drawer.queryByText('지출 종류')).toBeNull()
    expect(drawer.getByRole('button', { name: '취소' })).toBeTruthy()
  })

  it('AC-4905.5: [저장]은 saveSunapSettings이고, 새 설정으로 장부를 다시 불러온다. 묶음을 안 고르면 안내 한 줄', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '설정' }))
    const drawer = within(screen.getByRole('dialog', { name: '수납일지 설정' }))
    await user.selectOptions(drawer.getByRole('combobox', { name: 'Block으로 셀 처방' }), '')
    await user.click(drawer.getByRole('button', { name: '블록 지우기' }))
    await user.click(drawer.getByRole('button', { name: '주사치료 말 더하기' }))
    await user.type(drawer.getByRole('textbox', { name: '주사치료 새 말' }), ' 시술 {Enter}')
    await user.click(drawer.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(saveSunapSettings).toHaveBeenCalledWith(CLIENT, {
        blockGroup: null,
        ptGroup: 'g-pt',
        words: { inj: ['주사', '시술'], visit: ['경과', '진료'], etc: ['기타'] },
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(fake.load).toHaveBeenCalledTimes(2))
    expect(fake.load).toHaveBeenLastCalledWith(
      expect.objectContaining({ blockDef: null, words: { inj: ['주사', '시술'], visit: ['경과', '진료'], etc: ['기타'] } }),
    )
    expect(screen.getByText('설정에서 Block·물리치료 묶음을 골라 주세요')).toBeTruthy()
  })

  it('AC-4905.5: [취소]는 저장하지 않는다', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(within(screen.getByRole('dialog', { name: '수납일지 설정' })).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(saveSunapSettings).not.toHaveBeenCalled()
  })

  it('AC-4905.5: 저장이 실패하면 판을 닫지 않고 오류 카드를 보인다', async () => {
    vi.mocked(saveSunapSettings).mockRejectedValueOnce(new SunapStorageError('failed'))
    const user = await open()
    await user.click(screen.getByRole('button', { name: '설정' }))
    const drawer = within(screen.getByRole('dialog', { name: '수납일지 설정' }))
    await user.click(drawer.getByRole('button', { name: '저장' }))
    expect(await drawer.findByText(errorInfo('E-SETTINGS-FAILED').what)).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '수납일지 설정' })).toBeTruthy()
  })

  it('AC-4905.5: 묶음을 아직 안 골랐거나 지운 묶음이면 정의 없이 불러오고 안내 한 줄이 보인다', async () => {
    vi.mocked(loadSunapSettings).mockResolvedValue({ blockGroup: null, ptGroup: 'gone', words: DEFAULT_RSV_WORDS })
    await open()
    expect(fake.load).toHaveBeenCalledWith(expect.objectContaining({ blockDef: null, ptDef: null }))
    expect(screen.getByText('설정에서 Block·물리치료 묶음을 골라 주세요')).toBeTruthy()
  })

  it('AC-4905.5: 설정을 읽지 못하면 장부를 불러오지 않고 오류 카드와 [다시 불러오기]', async () => {
    vi.mocked(loadSunapSettings).mockRejectedValueOnce(new SunapStorageError('offline'))
    const user = userEvent.setup()
    render(<SunapScreen initialToday={TODAY} />)
    expect(await screen.findByText(errorInfo('E-SETTINGS-FAILED').what)).toBeTruthy()
    expect(fake.load).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '설정 다시 불러오기' }))
    await waitFor(() => expect(fake.load).toHaveBeenCalledTimes(1))
  })
})

describe('AC-4905.6 지출은 서버에 바로 저장된다', () => {
  const spendRow = (memo: string) =>
    within(screen.getAllByRole('row').find((tr) => within(tr).queryByDisplayValue(memo) !== null)!)

  it('AC-4905.6: 시안 글자 그대로 — 종류·내용·금액 칸, [+ 지출 줄 더하기], 합계', async () => {
    await open()
    const panel = region('지출 목록')
    expect(panel.getByRole('heading', { name: '지출' })).toBeTruthy()
    expect(panel.getByText('손으로 적어요 · 환자 정보가 없어 서버에도 저장돼요')).toBeTruthy()
    expect(panel.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['종류', '내용', '금액', ''])
    const kinds = panel.getAllByRole('combobox') as HTMLSelectElement[]
    expect(kinds.map((s) => s.value)).toEqual(['cash', 'card'])
    expect([...kinds[0]!.options].map((o) => o.textContent)).toEqual(['현금', '카드', '기타', '현금(주차지원)'])
    expect(panel.getByDisplayValue('5,000')).toBeTruthy()
    expect(panel.getByText('합계 · 2건')).toBeTruthy()
    expect(panel.getByText('53,000')).toBeTruthy()
    expect(panel.getByRole('button', { name: '+ 지출 줄 더하기' })).toBeTruthy()
  })

  it('AC-4905.6: 내용·금액을 고치고 칸을 나가면 updateSpend, 종류를 바꾸면 바로 updateSpend', async () => {
    const user = await open()
    const first = spendRow('택배비')
    await user.clear(first.getByRole('textbox', { name: '지출 내용' }))
    await user.type(first.getByRole('textbox', { name: '지출 내용' }), '택배비 2건')
    await user.clear(first.getByRole('textbox', { name: '지출 금액' }))
    await user.type(first.getByRole('textbox', { name: '지출 금액' }), '6,000')
    await user.click(screen.getByRole('heading', { name: '미수 입금' }))
    await waitFor(() => expect(updateSpend).toHaveBeenCalledWith(CLIENT, 's1', { memo: '택배비 2건', amount: 6000 }))
    await user.selectOptions(spendRow('사무용품').getByRole('combobox', { name: '지출 종류' }), 'parking')
    await waitFor(() => expect(updateSpend).toHaveBeenLastCalledWith(CLIENT, 's2', { kind: 'parking' }))
    await waitFor(() => expect(region('지출 목록').getByText('54,000')).toBeTruthy())
  })

  it('AC-4905.6: 줄을 더하고 내용을 적고 나가면 addSpend', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '+ 지출 줄 더하기' }))
    const memos = region('지출 목록').getAllByRole('textbox', { name: '지출 내용' })
    const fresh = memos[memos.length - 1]!
    await user.type(fresh, '다과')
    const amounts = region('지출 목록').getAllByRole('textbox', { name: '지출 금액' })
    await user.type(amounts[amounts.length - 1]!, '30000')
    await user.click(screen.getByRole('heading', { name: '미수 입금' }))
    await waitFor(() => expect(addSpend).toHaveBeenCalledWith(CLIENT, TODAY, { kind: 'cash', memo: '다과', amount: 30000 }))
    await waitFor(() => expect(region('지출 목록').getByText('합계 · 3건')).toBeTruthy())
    expect(region(/^지출 \d/).getByText('83,000')).toBeTruthy()
  })

  it('AC-4905.6: [지우기]는 deleteSpend', async () => {
    const user = await open()
    await user.click(spendRow('사무용품').getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(deleteSpend).toHaveBeenCalledWith(CLIENT, 's2'))
    await waitFor(() => expect(region('지출 목록').getByText('합계 · 1건')).toBeTruthy())
    expect(region('지출 목록').queryByDisplayValue('사무용품')).toBeNull()
  })

  it('AC-4905.6: 개인정보 모양 내용은 저장하지 않고 까닭을 보인다', async () => {
    vi.mocked(addSpend).mockResolvedValueOnce('blocked')
    const user = await open()
    await user.click(screen.getByRole('button', { name: '+ 지출 줄 더하기' }))
    const memos = region('지출 목록').getAllByRole('textbox', { name: '지출 내용' })
    await user.type(memos[memos.length - 1]!, '010-1234-5678 택시')
    await user.click(screen.getByRole('heading', { name: '미수 입금' }))
    expect((await region('지출 목록').findByRole('alert')).textContent).toBe(
      '전화번호·주민번호 같은 글자가 있어 저장하지 않았어요. 환자 정보는 적지 말아 주세요.',
    )
    expect(region('지출 목록').getByText('합계 · 2건')).toBeTruthy()
  })

  it('AC-4905.6: 서버 저장이 실패하면 까닭을 보인다', async () => {
    vi.mocked(updateSpend).mockRejectedValueOnce(new SunapStorageError('offline'))
    const user = await open()
    const first = spendRow('택배비')
    await user.type(first.getByRole('textbox', { name: '지출 내용' }), ' 외')
    await user.click(screen.getByRole('heading', { name: '미수 입금' }))
    expect((await region('지출 목록').findByRole('alert')).textContent).toBe('지출을 저장하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.')
  })

  it('AC-4905.6: 틀린 금액은 저장하지 않는다', async () => {
    const user = await open()
    const first = spendRow('택배비')
    await user.clear(first.getByRole('textbox', { name: '지출 금액' }))
    await user.type(first.getByRole('textbox', { name: '지출 금액' }), '1억')
    await user.click(screen.getByRole('heading', { name: '미수 입금' }))
    expect((await region('지출 목록').findByRole('alert')).textContent).toBe('금액은 0원부터 99,999,999원까지 숫자로 적어 주세요')
    expect(updateSpend).not.toHaveBeenCalled()
  })
})

describe('AC-4905.7 도우미 없는 기기·옛 도우미는 서버 숫자만(시안 ?s=remote)', () => {
  it('AC-4905.7: 확장·도우미가 없으면 그날 서버 합계·지출과 "환자 장부는 접수 PC에서만 보여요"', async () => {
    withBridge('no-extension')
    vi.mocked(loadSunapDay).mockResolvedValue({ day: TODAY, closedAt: '2026-11-16T09:52:00.000Z', late: false, totals: TOTALS })
    render(<SunapScreen initialToday={TODAY} />)
    expect(await screen.findByText('환자 장부는 접수 PC에서만 보여요')).toBeTruthy()
    await waitFor(() => expect(chip().textContent).toBe('마감됨 · 18:52'))
    expect(region(/^수납/).getByText('185,400')).toBeTruthy()
    expect(region('지출 목록').getByText('2건 · 53,000원')).toBeTruthy()
    for (const name of ['마감하기', '마감 풀기', '설정', '비트에서 다시 불러오기']) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.queryByRole('heading', { name: '환자 장부' })).toBeNull()
    expect(fake.load).not.toHaveBeenCalled()
    expect(loadSunapSettings).not.toHaveBeenCalled()
  })

  it('AC-4905.7: 마감 안 한 날은 "아직 마감 전이에요"', async () => {
    withBridge('no-helper')
    render(<SunapScreen initialToday={TODAY} />)
    expect(await screen.findByText('아직 마감 전이에요')).toBeTruthy()
    expect(chip().textContent).toBe('마감 전')
  })

  it('AC-4905.7: 0.8.0 미만 도우미 PC는 "도우미 새 판(0.8.0)을 깔면 장부가 보여요"', async () => {
    withBridge('ready', '0.7.0')
    render(<SunapScreen initialToday={TODAY} />)
    expect(await screen.findByText('도우미 새 판(0.8.0)을 깔면 장부가 보여요')).toBeTruthy()
    expect(fake.load).not.toHaveBeenCalled()
  })

  it('AC-4905.7: 갈래 — 연결·도우미 판·날짜(오늘−62일보다 이르면 서버 숫자만)', () => {
    const ready = { state: 'ready' as const, helperVersion: '0.8.0', helloError: null }
    expect(screenMode(ready, TODAY, TODAY)).toBe('ledger')
    expect(screenMode(ready, '2026-09-15', TODAY)).toBe('ledger')
    expect(screenMode(ready, '2026-09-14', TODAY)).toBe('old-day')
    expect(screenMode({ ...ready, helperVersion: '0.7.9' }, TODAY, TODAY)).toBe('old-helper')
    expect(screenMode({ ...ready, helperVersion: undefined }, TODAY, TODAY)).toBe('old-helper')
    expect(screenMode({ state: 'update-helper', helloError: null }, TODAY, TODAY)).toBe('old-helper')
    expect(screenMode({ state: 'connecting', helloError: null }, TODAY, TODAY)).toBe('connecting')
    expect(screenMode({ state: 'connecting', helloError: 'E-BRIDGE-BAD-REPLY' }, TODAY, TODAY)).toBe('device')
    for (const state of ['no-extension', 'no-helper', 'busy', 'disconnected', 'update-extension'] as const) {
      expect(screenMode({ state, helloError: null }, TODAY, TODAY)).toBe('device')
    }
  })
})
