// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
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
  updateSpend,
  type SunapSpend,
} from '@/lib/storage/sunap'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { DEFAULT_RSV_KINDS, type Ledger, type LedgerRow } from '@/types/sunap'
import type { SunapLedgerView } from '@/workers/sunap/messages'
import { SunapScreen } from './SunapScreen'
import { useSunapWorker, useSunapWorkerObject } from './useSunapWorker'

// 다른 의원 보는 중 수납일지 (admin-view REQ-8009 AC-8009.2, design.md '탭마다 읽기만' 수납일지 줄·'환자 칸 숨김'·기본값 9).
// 보는 중이면 이 PC가 비트 준비·도우미 0.8.0 이상·오늘(62일 안)이어도 늘 서버 숫자 화면(RemoteView)이다:
// Worker·비트 통로·PC 저장소를 만들지 않고, 환자 칸이 든 장부(LedgerRows의 차트·이름·찾기 칸, PaidRows, RsvPicker)를 그리지 않는다.
// [마감하기]·[마감 풀기]·[설정]·지출 줄 더하기·지우기·[비트에서 다시 불러오기]가 없고, 서버 숫자·지출 메모·[다시 불러오기]는 그대로다.
// viewing={null}이면 지금처럼 접수 PC 장부다. 통로·Worker 훅·서버 저장 함수는 흉내 내고 이름·차트번호는 지어낸 값이다

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
// 가짜 Worker 훅: load를 받으면 그 날 장부(환자 줄)를 돌려준다
const fake = vi.hoisted(() => ({ load: vi.fn(), set: null as null | ((next: unknown) => void) }))
vi.mock('./useSunapWorker', async () => {
  const React = await import('react')
  return {
    useSunapWorkerObject: vi.fn(() => ({})),
    useSunapWorker: vi.fn(() => {
      const [state, setState] = React.useState<unknown>({ view: null, loading: false, loadedAt: null, error: null })
      fake.set = setState
      return { ...(state as object), load: fake.load, edit: vi.fn(), close: vi.fn(), reopen: vi.fn() }
    }),
  }
})

const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
const TODAY = '2026-11-16'
const VIEWING: Viewing = { hospitalId: '00000000-0000-4000-8000-00000000b001', name: '가짜다른의원' }

const base: LedgerRow = {
  chart: '',
  name: '',
  time: '09:00',
  kind: 're',
  cash: 0,
  card: 0,
  transfer: 0,
  unpaid: 0,
  health: 0,
  free: false,
  block: false,
  pt: false,
  rsv: { kind: 'none', source: 'bit', at: null },
  note: '',
  edited: [],
  doctor: null,
}
const ROWS: LedgerRow[] = [
  { ...base, chart: '90231', name: '가상환자가', time: '09:02', card: 15000, block: true, pt: true, rsv: { kind: 'inj', source: 'bit', at: '202611191030' } },
  { ...base, chart: '90877', name: '가상환자나', time: '09:05', cash: 4700, pt: true },
]
const PAID = [{ chart: '90788', name: '가상환자다', time: '', cash: 10000, card: 0 }]
const ledgerOf = (day: string): Ledger => ({ day, unsure: false, rows: ROWS, paid: PAID, closedAt: null, late: false, doctors: [] })
const TOTALS = dayTotals(ledgerOf(TODAY))
const SPENDS: SunapSpend[] = [
  { id: 's1', kind: 'cash', memo: '가상 택배비', amount: 5000 },
  { id: 's2', kind: 'card', memo: '가상 사무용품', amount: 48000 },
]
const PATIENT_TEXT = ['90231', '가상환자가', '90877', '가상환자나', '90788', '가상환자다']

const bridge = vi.mocked(useBridge)

function withViewing(viewing: Viewing | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ViewingProvider viewing={viewing}>{children}</ViewingProvider>
  }
}

async function open(viewing: Viewing | null) {
  const view = render(<SunapScreen initialToday={TODAY} />, { wrapper: withViewing(viewing) })
  await act(async () => {})
  return view
}

const button = (name: string) => screen.queryByRole('button', { name })

beforeEach(() => {
  // 이 PC는 장부를 그릴 수 있는 접수 PC다(비트 준비 · 도우미 0.8.0 · 오늘)
  bridge.mockReset().mockReturnValue({
    state: 'ready',
    hello: { state: 'ready', helperVersion: '0.8.0', extensionVersion: '0.1.0', helperUpdateAvailable: false },
    helloError: null,
    helperUpdateAvailable: false,
    call: vi.fn(),
    stream: vi.fn(),
    onProgress: vi.fn(),
    close: vi.fn(),
    retry: vi.fn(),
  } as unknown as ReturnType<typeof useBridge>)
  vi.mocked(useSunapWorkerObject).mockClear()
  vi.mocked(useSunapWorker).mockClear()
  vi.mocked(listStatsRxGroups).mockReset().mockResolvedValue([])
  vi.mocked(loadSunapSettings).mockReset().mockResolvedValue({ blockGroup: null, ptGroup: null, kinds: DEFAULT_RSV_KINDS })
  vi.mocked(loadSunapDay).mockReset().mockResolvedValue(null)
  vi.mocked(listSpends).mockReset().mockResolvedValue(SPENDS)
  for (const write of [closeSunapDay, reopenSunapDay, saveSunapSettings, addSpend, updateSpend, deleteSpend]) vi.mocked(write).mockReset()
  fake.load.mockReset().mockImplementation((ask: { day: string }) => {
    const view: SunapLedgerView = { ...ledgerOf(ask.day), totals: TOTALS, doctors: null }
    fake.set!({ view, loading: false, loadedAt: new Date('2026-11-16T00:40:00.000Z'), error: null })
  })
})

afterEach(cleanup)

describe('AC-8009.2 보는 중 수납일지는 늘 서버 숫자 화면', () => {
  it('AC-8009.2: 비트 준비·도우미 0.8.0·62일 안이어도 Worker·통로·PC 저장소·장부 설정을 만들거나 읽지 않는다', async () => {
    await open(VIEWING)
    expect(useSunapWorkerObject).not.toHaveBeenCalled()
    expect(useSunapWorker).not.toHaveBeenCalled()
    expect(bridge).not.toHaveBeenCalled()
    expect(fake.load).not.toHaveBeenCalled()
    expect(loadSunapSettings).not.toHaveBeenCalled()
    expect(listStatsRxGroups).not.toHaveBeenCalled()
    expect(screen.getByText('이 기기에서는 마감한 날의 합계·비율만 보여요. 환자 장부는 접수 PC에서만 열려요.')).toBeTruthy()
  })

  it('AC-8009.2: 환자 칸이 든 장부(LedgerRows 차트·이름·찾기 칸, PaidRows, RsvPicker)를 그리지 않는다', async () => {
    const { container } = await open(VIEWING)
    expect(screen.queryByRole('columnheader', { name: '차트' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: '이름' })).toBeNull()
    expect(screen.queryByRole('searchbox', { name: '이름·차트번호 찾기' })).toBeNull()
    expect(screen.queryByText('미수 입금')).toBeNull()
    expect(screen.queryByRole('button', { name: /다음 예약/ })).toBeNull()
    for (const text of PATIENT_TEXT) expect(container.textContent).not.toContain(text)
  })

  it('AC-8009.2: [마감하기]·[마감 풀기]·[설정]·[비트에서 다시 불러오기]·지출 줄 더하기·지우기가 없고, 지출 메모는 글자로 보인다', async () => {
    await open(VIEWING)
    for (const name of ['마감하기', '마감 풀기', '설정', '비트에서 다시 불러오기']) expect(button(name)).toBeNull()
    const spends = screen.getByRole('region', { name: '지출 목록' })
    expect(within(spends).getByText('가상 택배비')).toBeTruthy()
    expect(within(spends).getByText('가상 사무용품')).toBeTruthy()
    expect(within(spends).queryAllByRole('textbox')).toEqual([])
    expect(within(spends).queryAllByRole('combobox')).toEqual([])
    expect(screen.queryAllByRole('button', { name: /지우기/ })).toEqual([])
    expect(screen.queryAllByRole('textbox')).toEqual([])
  })

  it('AC-8009.2: 이 PC를 연결하러 가는 길(/claim/setup)이 없다 — 보는 의원 장부는 이 PC 비트로 볼 수 없다', async () => {
    await open(VIEWING)
    expect(screen.queryByRole('link', { name: '이 PC 연결하기' })).toBeNull()
    expect(screen.queryByText('이 PC에 비트가 깔려 있으면 확장·도우미를 깔고 연결해서 장부를 볼 수 있어요.')).toBeNull()
    expect(screen.getByText('환자 장부는 접수 PC에서만 보여요')).toBeTruthy()
  })

  it('AC-8009.2: 보는 의원이 마감한 날은 서버 합계 카드가 보이고 날짜를 옮기면 그날 서버 숫자를 다시 읽는다. 쓰기는 부르지 않는다', async () => {
    vi.mocked(loadSunapDay).mockResolvedValue({ day: TODAY, closedAt: '2026-11-16T09:00:00.000Z', late: false, totals: TOTALS })
    await open(VIEWING)
    expect(loadSunapDay).toHaveBeenCalledWith(CLIENT, TODAY)
    expect(listSpends).toHaveBeenCalledWith(CLIENT, TODAY)
    expect(screen.getByTestId('sunap-state').textContent).not.toBe('마감 전')
    await userEvent.click(screen.getByRole('button', { name: '전날' }))
    await act(async () => {})
    expect(loadSunapDay).toHaveBeenLastCalledWith(CLIENT, '2026-11-15')
    for (const write of [closeSunapDay, reopenSunapDay, saveSunapSettings, addSpend, updateSpend, deleteSpend]) expect(write).not.toHaveBeenCalled()
  })

  it('AC-8009.2: 서버 숫자를 못 읽으면 [다시 불러오기]가 그대로 있고 누르면 다시 읽는다', async () => {
    vi.mocked(loadSunapDay).mockRejectedValueOnce(new Error('offline'))
    await open(VIEWING)
    const retry = screen.getByRole('button', { name: '다시 불러오기' })
    await userEvent.click(retry)
    await act(async () => {})
    expect(loadSunapDay).toHaveBeenCalledTimes(2)
  })

  it('AC-8009.2: viewing={null}이면 지금처럼 접수 PC 장부(차트·이름 칸·[마감하기]·[설정])다', async () => {
    await open(null)
    await act(async () => {})
    expect(useSunapWorkerObject).toHaveBeenCalled()
    expect(fake.load).toHaveBeenCalled()
    expect(screen.getAllByRole('columnheader', { name: '차트' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('searchbox', { name: '이름·차트번호 찾기' })).toBeTruthy()
    expect(button('마감하기')).toBeTruthy()
    expect(button('설정')).toBeTruthy()
    expect(screen.getAllByText('가상환자가').length).toBeGreaterThan(0)
  })
})
