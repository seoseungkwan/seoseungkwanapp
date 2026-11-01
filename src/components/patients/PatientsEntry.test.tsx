// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { errorInfo } from '@/lib/errors'
import { readContactCount } from '@/lib/storage/contactCounts'
import type { BridgeState } from '@/types/bridge'
import { PatientsEntry } from './PatientsEntry'
import type { PatientsTool } from './tools'

// 환자 탭 입구(AC-610.2·610.3·610.4, 목업 toolBody). 연결 상태로 도구 자리를 고른다(ClaimEntry와 같은 갈래). 가짜 통로·가짜 Worker·가짜 Supabase
vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({}) }))
vi.mock('@/lib/storage/contactCounts', () => ({ readContactCount: vi.fn() }))

const bridge = vi.mocked(useBridge)
const retry = vi.fn()
const stream = vi.fn()
const made: FakeWorker[] = []

class FakeWorker {
  posted: unknown[] = []
  terminate = vi.fn()
  constructor() {
    made.push(this)
  }
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  addEventListener() {}
  removeEventListener() {}
}

function withState(state: BridgeState, helloError: string | null = null) {
  bridge.mockReturnValue({
    state,
    hello: null,
    helloError,
    helperUpdateAvailable: false,
    call: vi.fn(),
    stream,
    onProgress: vi.fn(),
    retry,
  } as unknown as ReturnType<typeof useBridge>)
}

const COUNTS_TITLE = '이 PC에서는 남은 건수만 볼 수 있어요'
const CONNECT_TITLE = '비트 PC 연결이 먼저예요'
const BUSY_TITLE = '비트를 다른 창에서 읽고 있어요'
const LIST_TOOLS: readonly PatientsTool[] = ['followup', 'recall']

const heading2 = (name: string) => screen.queryByRole('heading', { level: 2, name })
const slot = (container: HTMLElement, tool: PatientsTool) => container.querySelector(`[data-tool-slot="${tool}"]`)
const currentTool = () =>
  within(screen.getByRole('navigation', { name: '환자 도구' }))
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent)

beforeEach(() => {
  made.length = 0
  bridge.mockReset()
  retry.mockClear()
  stream.mockReset()
  stream.mockImplementation(() => new Promise(() => {}))
  vi.mocked(readContactCount).mockReset()
  vi.mocked(readContactCount).mockResolvedValue({ followup_left: 5, injection_left: 2, updated_at: '2026-11-03T23:42:00+00:00' })
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PatientsEntry: 틀', () => {
  it.each<[BridgeState, PatientsTool, string]>([
    ['no-extension', 'followup', 'F/U 명단'],
    ['ready', 'recall', '정기 주사 문자 명단'],
    ['no-helper', 'messages', '문자 문구'],
    ['busy', 'recall', '정기 주사 문자 명단'],
    ['connecting', 'followup', 'F/U 명단'],
  ])('AC-610.2: 상태 %s에서도 h1 "환자"와 도구 단추 줄이 있고 고른 도구 %s에 aria-current', (state, tool, label) => {
    withState(state)
    render(<PatientsEntry tool={tool} />)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['환자'])
    expect(currentTool()).toEqual([label])
    expect(
      within(screen.getByRole('navigation', { name: '환자 도구' }))
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['F/U 명단', '/patients?tool=followup'],
      ['정기 주사 문자 명단', '/patients?tool=recall'],
      ['문자 문구', '/patients?tool=messages'],
    ])
  })
})

describe('PatientsEntry: Worker와 통로', () => {
  it('AC-610.4: Worker를 한 번 만들어 useBridge에 넘기고, Worker 없이 통로를 먼저 열지 않는다(옛 연결이 남아 다른 창으로 보이는 것을 막는다)', () => {
    withState('connecting')
    const { rerender } = render(<PatientsEntry tool="followup" />)
    expect(made).toHaveLength(1)
    expect(bridge.mock.calls.length).toBeGreaterThan(0)
    for (const [opts] of bridge.mock.calls) expect(opts?.worker).toBe(made[0])
    rerender(<PatientsEntry tool="recall" />)
    expect(made).toHaveLength(1)
    for (const [opts] of bridge.mock.calls) expect(opts?.worker).toBe(made[0])
  })

  it('AC-610.4: 진짜 useBridge로도 확장 연결은 한 번이고 Worker에 포트를 한 번 준다', async () => {
    const { useBridge: real } = await vi.importActual<typeof import('@/components/claim/useBridge')>('@/components/claim/useBridge')
    bridge.mockImplementation(real)
    const connect = vi.fn(() => ({
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    }))
    vi.stubGlobal('chrome', { runtime: { connect } })
    render(<PatientsEntry tool="followup" />)
    await act(async () => {})
    expect(connect).toHaveBeenCalledTimes(1)
    expect(made).toHaveLength(1)
    expect(made[0]!.posted).toEqual([{ type: 'bridge-port' }])
  })

  it('AC-610.4: 화면을 떠나면 Worker를 끝낸다', () => {
    withState('no-extension')
    const { unmount } = render(<PatientsEntry tool="followup" />)
    expect(made[0]!.terminate).not.toHaveBeenCalled()
    unmount()
    expect(made[0]!.terminate).toHaveBeenCalledTimes(1)
  })
})

describe('PatientsEntry: 확장 없는 곳·휴대폰 (AC-610.3)', () => {
  it.each(LIST_TOOLS)('AC-610.3: %s 도구는 명단 대신 건수만 보이고 통로를 부르지 않는다', async (tool) => {
    withState('no-extension')
    render(<PatientsEntry tool={tool} />)
    expect(await screen.findByText('5')).toBeTruthy()
    expect(heading2(COUNTS_TITLE)).toBeTruthy()
    expect(stream).not.toHaveBeenCalled()
    expect(heading2(CONNECT_TITLE)).toBeNull()
  })

  it('AC-610.3: 문자 문구 도구는 건수가 아니라 자기 자리다', () => {
    withState('no-extension')
    const { container } = render(<PatientsEntry tool="messages" />)
    expect(slot(container, 'messages')).not.toBeNull()
    expect(heading2(COUNTS_TITLE)).toBeNull()
    expect(readContactCount).not.toHaveBeenCalled()
  })
})

describe('PatientsEntry: 연결 안 됨 (AC-610.4)', () => {
  it.each<[BridgeState, string | null, string]>([
    ['no-helper', null, '이 PC에서 도우미를 찾지 못했어요. 도우미가 꺼져 있거나 아직 설치하지 않았어요. [비트 PC 연결]에서 하나씩 확인할 수 있어요.'],
    ['update-helper', null, '도우미나 크롬 확장 프로그램을 새 판으로 바꿔야 해요. [비트 PC 연결]에서 하나씩 확인할 수 있어요.'],
    ['update-extension', null, '도우미나 크롬 확장 프로그램을 새 판으로 바꿔야 해요. [비트 PC 연결]에서 하나씩 확인할 수 있어요.'],
    ['disconnected', null, '도우미와 연결이 끊겼어요. [비트 PC 연결]에서 하나씩 확인할 수 있어요.'],
    // hello가 번호로 끝나 연결 중에 멈췄으면 ClaimEntry처럼 연결 안내로(거기서 번호를 보인다)
    ['connecting', 'E-BRIDGE-BAD-REPLY', '도우미와 연결이 끊겼어요. [비트 PC 연결]에서 하나씩 확인할 수 있어요.'],
  ])('AC-610.4: 상태 %s(%s)이면 명단 대신 연결 안내와 [비트 PC 연결](/claim/setup)', (state, helloError, reason) => {
    withState(state, helloError)
    render(<PatientsEntry tool="followup" />)
    expect(heading2(CONNECT_TITLE)).toBeTruthy()
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '명단은 비트 PC(비트가 깔린 의원 PC)에서 비트를 읽어 만들어요.',
      reason,
    ])
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
    expect(screen.getByText('연결하지 않아도 문자 문구는 고칠 수 있어요')).toBeTruthy()
    expect(screen.getByRole('link', { name: '문자 문구 열기' }).getAttribute('href')).toBe('/patients?tool=messages')
    expect(stream).not.toHaveBeenCalled()
    expect(readContactCount).not.toHaveBeenCalled()
  })

  it('AC-610.4: 정기 주사 도구도 같다', () => {
    withState('disconnected')
    render(<PatientsEntry tool="recall" />)
    expect(heading2(CONNECT_TITLE)).toBeTruthy()
  })

  it('AC-610.4: 문자 문구 도구는 연결 안내가 아니라 자기 자리다', () => {
    withState('no-helper')
    const { container } = render(<PatientsEntry tool="messages" />)
    expect(slot(container, 'messages')).not.toBeNull()
    expect(heading2(CONNECT_TITLE)).toBeNull()
  })
})

describe('PatientsEntry: 다른 창 작업 중 (AC-610.4)', () => {
  it('AC-610.4: 환자 탭 글(목업)의 안내 + [다시 확인]·[건수만 보기], 청구 화면 글이 아니다', () => {
    withState('busy')
    render(<PatientsEntry tool="followup" />)
    const card = screen.getByRole('alert')
    expect(within(card).getByRole('heading', { level: 2, name: BUSY_TITLE })).toBeTruthy()
    expect(card.textContent).toContain('비트는 한 번에 한 창에서만 읽을 수 있어요. 청구나 환자 탭이 열린 다른 창으로 가서 계속하거나, 그 창을 닫아 주세요.')
    expect(card.textContent).toContain('다른 창을 닫았다면 [다시 확인]을 누르세요.')
    expect(card.textContent).toContain('오류 번호 E-BRIDGE-BUSY')
    expect(card.textContent).not.toContain(errorInfo('E-BRIDGE-BUSY').what)
    expect(within(card).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: '건수만 보기' })).toBeTruthy()
    expect(readContactCount).not.toHaveBeenCalled()
  })

  it('AC-610.4: [다시 확인]은 통로를 다시 확인한다', async () => {
    const user = userEvent.setup()
    withState('busy')
    render(<PatientsEntry tool="followup" />)
    await user.click(screen.getByRole('button', { name: '다시 확인' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('AC-610.4: [건수만 보기]를 누르면 그 자리에서 건수가 나오고, [다시 확인]은 안내로 돌아가며 다시 확인한다', async () => {
    const user = userEvent.setup()
    withState('busy')
    render(<PatientsEntry tool="recall" />)
    await user.click(screen.getByRole('button', { name: '건수만 보기' }))
    expect(await screen.findByText('5')).toBeTruthy()
    expect(heading2(COUNTS_TITLE)).toBeTruthy()
    expect(heading2(BUSY_TITLE)).toBeNull()

    await user.click(screen.getByRole('button', { name: '다시 확인' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(heading2(BUSY_TITLE)).toBeTruthy()
    expect(heading2(COUNTS_TITLE)).toBeNull()
  })

  it('AC-610.4: 문자 문구 도구는 안내가 아니라 자기 자리다', () => {
    withState('busy')
    const { container } = render(<PatientsEntry tool="messages" />)
    expect(slot(container, 'messages')).not.toBeNull()
    expect(heading2(BUSY_TITLE)).toBeNull()
  })
})

describe('PatientsEntry: 연결 중·연결됨', () => {
  it.each(LIST_TOOLS)('AC-610.4: 연결 중이면 %s 도구는 불러오는 중이고 건수·안내·통로 호출이 없다', (tool) => {
    withState('connecting')
    render(<PatientsEntry tool={tool} />)
    expect(screen.getByRole('status').textContent).toBe('비트 PC 연결을 확인하는 중이에요')
    expect(heading2(COUNTS_TITLE)).toBeNull()
    expect(heading2(CONNECT_TITLE)).toBeNull()
    expect(stream).not.toHaveBeenCalled()
  })

  it('AC-610.2: 연결되면 PatientsScreen이 읽기 시작한다(store.load 한 번)', () => {
    withState('ready')
    render(<PatientsEntry tool="followup" />)
    expect(stream.mock.calls).toEqual([['store.load', { contact: true }]])
    expect(screen.getByRole('status').textContent).toContain('비트에서 F/U 명단을 읽는 중이에요')
  })

  it('AC-604.8: 도구를 바꾸고 문자 문구로 가도 store.load는 한 번이다(화면을 새로 만들지 않는다)', () => {
    withState('ready')
    const { rerender, container } = render(<PatientsEntry tool="followup" />)
    rerender(<PatientsEntry tool="recall" />)
    rerender(<PatientsEntry tool="messages" />)
    expect(slot(container, 'messages')).not.toBeNull()
    rerender(<PatientsEntry tool="followup" />)
    expect(stream.mock.calls.filter(([cmd]) => cmd === 'store.load')).toHaveLength(1)
    expect(made).toHaveLength(1)
  })
})
