// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { PROTOCOL } from '@/lib/bridge/protocol'
import { LATEST_HELPER, LIST_HELPER, MIN_EXTENSION } from '@/lib/bridge/versions'
import { errorInfo } from '@/lib/errors'
import { readContactCount } from '@/lib/storage/contactCounts'
import type { BridgeState } from '@/types/bridge'
import { PatientsEntry } from './PatientsEntry'
import type { PatientsTool } from './tools'

// 환자 탭 입구(AC-610.2·610.3·610.4·613.5, 목업 toolBody). 연결 상태로 도구 자리를 고른다(ClaimEntry와 같은 갈래). 가짜 통로·가짜 Worker·가짜 Supabase
vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))
const sb = vi.hoisted(() => ({ reads: 0 }))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          order: async () => {
            sb.reads += 1
            return { data: [{ id: 'a', kind: 'injection', name: '주사 알림', body: '주사 글\n<<DATE>>', sort_order: 0 }], error: null }
          },
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/storage/contactCounts', () => ({ readContactCount: vi.fn() }))

const bridge = vi.mocked(useBridge)
const retry = vi.fn()
const stream = vi.fn()
const call = vi.fn()
const made: FakeWorker[] = []

/** 전역 Worker 자리의 가짜. 스크립트를 못 불러온 Worker처럼 받은 메시지에 답하지 않는다. fire로 error·messageerror를 낸다 */
class FakeWorker {
  posted: unknown[] = []
  terminate = vi.fn()
  private listeners = new Map<string, Set<(event: Event) => void>>()
  constructor() {
    made.push(this)
  }
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  private of(type: string) {
    let set = this.listeners.get(type)
    if (!set) this.listeners.set(type, (set = new Set()))
    return set
  }
  addEventListener(type: string, listener: (event: Event) => void) {
    this.of(type).add(listener)
  }
  removeEventListener(type: string, listener: (event: Event) => void) {
    this.of(type).delete(listener)
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((n, set) => n + set.size, 0)
  }
  fire(type: 'error' | 'messageerror') {
    const event = new Event(type, { cancelable: true })
    act(() => {
      for (const listener of [...this.of(type)]) listener(event)
    })
    return event
  }
}

function withState(state: BridgeState, helloError: string | null = null, helperVersion?: string) {
  bridge.mockReturnValue({
    state,
    hello: helperVersion ? { state, helperVersion, extensionVersion: MIN_EXTENSION, helperUpdateAvailable: false } : null,
    helloError,
    helperUpdateAvailable: false,
    call,
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
  sb.reads = 0
  bridge.mockReset()
  retry.mockClear()
  call.mockClear()
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
    ['ready', 'reservations', '예약 문자 명단'],
    ['no-extension', 'lapsed', '장기 미방문 명단'],
  ])('AC-610.2·AC-2802.1·AC-2806.3: 상태 %s에서도 h1 "환자"와 도구 단추 줄(다섯)이 있고 고른 도구 %s에 aria-current', (state, tool, label) => {
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
      ['예약 문자 명단', '/patients?tool=reservations'],
      ['정기 주사 문자 명단', '/patients?tool=recall'],
      ['장기 미방문 명단', '/patients?tool=lapsed'],
      ['문자 문구', '/patients?tool=messages'],
    ])
  })
})

describe('PatientsEntry: 비트 명단 두 도구 (AC-2802)', () => {
  const targets = () => stream.mock.calls.filter(([cmd]) => cmd === 'contact.targets')

  it.each<[PatientsTool, string, string]>([
    ['reservations', '예약 문자 명단', 'reservation'],
    ['lapsed', '장기 미방문 명단', 'lapsed'],
  ])('AC-2802.2: 연결되고 도우미가 새 버전이면 %s를 처음 열 때 그 종류만 읽는다(store.load도 한 번)', (tool, title, kind) => {
    withState('ready', null, LIST_HELPER)
    render(<PatientsEntry tool={tool} />)
    expect(heading2(title)).toBeTruthy()
    expect(targets().map(([, args]) => (args as { kind: string }).kind)).toEqual([kind])
    expect(stream.mock.calls.filter(([cmd]) => cmd === 'store.load')).toHaveLength(1)
  })

  it('AC-2802.2: 다른 도구로 들어오면 새 도구는 읽지 않는다', () => {
    withState('ready', null, LIST_HELPER)
    const { rerender } = render(<PatientsEntry tool="followup" />)
    rerender(<PatientsEntry tool="recall" />)
    rerender(<PatientsEntry tool="messages" />)
    expect(targets()).toEqual([])
  })

  it('AC-2802.5: hello의 도우미 버전이 낮으면 새 도구는 업데이트 안내이고 읽지 않는다', () => {
    withState('ready', null, '0.0.1')
    render(<PatientsEntry tool="reservations" />)
    expect(screen.getByText('도우미를 업데이트하면 보여요')).toBeTruthy()
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
    expect(targets()).toEqual([])
  })

  it.each<[PatientsTool, string]>([
    ['reservations', '예약 문자 명단'],
    ['lapsed', '장기 미방문 명단'],
  ])('AC-610.4: 연결 중이면 %s도 도구 머리와 연결 확인 중 글이다', (tool, title) => {
    withState('connecting')
    render(<PatientsEntry tool={tool} />)
    expect(heading2(title)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('비트 PC 연결을 확인하는 중이에요')
    expect(stream).not.toHaveBeenCalled()
  })

  it('AC-610.4: 연결이 안 됐으면 새 도구도 연결 안내다', () => {
    withState('no-helper')
    render(<PatientsEntry tool="lapsed" />)
    expect(heading2(CONNECT_TITLE)).toBeTruthy()
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

describe('PatientsEntry: Worker 오류 (AC-610.6)', () => {
  const FAILED = errorInfo('E-ANALYZE-FAILED')
  const FU_LOADING = '비트에서 F/U 명단을 읽는 중이에요'
  const CONNECTING = '비트 PC 연결을 확인하는 중이에요'
  const storeLoads = () => stream.mock.calls.filter(([cmd]) => cmd === 'store.load').length
  const expectCard = () => {
    expect(screen.getByRole('alert').textContent).toContain(FAILED.what)
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-ANALYZE-FAILED')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.queryByText(FU_LOADING)).toBeNull()
  }

  it.each<[BridgeState, string]>([
    ['no-extension', COUNTS_TITLE],
    ['no-helper', CONNECT_TITLE],
    ['disconnected', CONNECT_TITLE],
    ['busy', BUSY_TITLE],
    ['connecting', ''],
  ])('AC-610.6: 통로가 %s인 동안 Worker가 error를 내도 그 화면 그대로다. ready가 되어 명단 자리를 그리면 store.load 없이 E-ANALYZE-FAILED 카드다', async (state, title) => {
    withState(state)
    const { rerender } = render(<PatientsEntry tool="followup" />)
    const event = made[0]!.fire('error')
    rerender(<PatientsEntry tool="followup" />)
    if (title) expect(await screen.findByRole('heading', { level: 2, name: title })).toBeTruthy()
    else expect(screen.getByRole('status').textContent).toBe(CONNECTING)
    expect(screen.queryByText(FAILED.what)).toBeNull()

    withState('ready')
    rerender(<PatientsEntry tool="followup" />)
    expectCard()
    rerender(<PatientsEntry tool="recall" />)
    expectCard()
    expect(storeLoads()).toBe(0)
    expect(made).toHaveLength(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('AC-610.6: 통로가 열리기 전의 messageerror도 같다', () => {
    withState('connecting')
    const { rerender } = render(<PatientsEntry tool="followup" />)
    made[0]!.fire('messageerror')
    withState('ready')
    rerender(<PatientsEntry tool="followup" />)
    expectCard()
    expect(storeLoads()).toBe(0)
  })

  it('AC-610.6: 읽는 중에 error → 카드. 통로가 끊겼다 다시 ready가 되어 명단 자리를 다시 그려도 store.load를 부르지 않고 카드다', () => {
    withState('ready')
    const { rerender } = render(<PatientsEntry tool="followup" />)
    expect(storeLoads()).toBe(1)
    expect(screen.getByText(FU_LOADING)).toBeTruthy()
    const event = made[0]!.fire('error')
    expectCard()
    expect(event.defaultPrevented).toBe(true)

    withState('disconnected')
    rerender(<PatientsEntry tool="followup" />)
    expect(heading2(CONNECT_TITLE)).toBeTruthy()
    withState('ready')
    rerender(<PatientsEntry tool="followup" />)
    expectCard()
    expect(storeLoads()).toBe(1)
    expect(made).toHaveLength(1)
  })

  it('AC-610.6: 카드의 [다시 불러오기]는 오류를 낸 Worker를 끝내고 새 Worker를 만들어 통로에 넘긴다. 연결 중 → ready에서 store.load부터 다시 읽고, 새 Worker도 오류면 다시 카드다', async () => {
    const user = userEvent.setup()
    withState('ready')
    const { rerender } = render(<PatientsEntry tool="followup" />)
    made[0]!.fire('error')
    expectCard()

    // 새 Worker로 다시 붙는 동안은 연결 중이다(진짜 통로는 아래 시험)
    withState('connecting')
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(made).toHaveLength(2)
    expect(made[0]!.terminate).toHaveBeenCalledTimes(1)
    expect(made[0]!.listenerCount()).toBe(0)
    expect(made[1]!.terminate).not.toHaveBeenCalled()
    expect(bridge.mock.calls[bridge.mock.calls.length - 1]![0]?.worker).toBe(made[1])
    // 스크립트를 못 불러온 Worker는 다시 쓰지 않는다: 옛 Worker에도 새 Worker에도 reload를 보내지 않는다
    expect(made[0]!.posted).toEqual([])
    expect(made[1]!.posted).toEqual([])
    expect(screen.getByRole('status').textContent).toBe(CONNECTING)
    expect(storeLoads()).toBe(1)

    withState('ready')
    rerender(<PatientsEntry tool="followup" />)
    expect(storeLoads()).toBe(2)
    expect(screen.getByText(FU_LOADING)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    made[1]!.fire('error')
    expectCard()
    expect(made).toHaveLength(2)
  })

  describe('진짜 useBridge로', () => {
    class FakePort {
      sent: Record<string, unknown>[] = []
      disconnected = false
      private messageFns: ((m: unknown) => void)[] = []
      private disconnectFns: (() => void)[] = []
      onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
      onDisconnect = { addListener: (fn: () => void) => void this.disconnectFns.push(fn) }
      postMessage(m: unknown) {
        if (this.disconnected) throw new Error('Attempting to use a disconnected port object')
        this.sent.push(m as Record<string, unknown>)
      }
      disconnect() {
        this.disconnected = true
      }
      reply(m: unknown) {
        act(() => {
          for (const fn of this.messageFns) fn(m)
        })
      }
      helloOk() {
        const hello = this.sent.find((m) => m.cmd === 'hello')!
        this.reply({ v: PROTOCOL, id: hello.id, type: 'result', data: { helperVersion: LATEST_HELPER, protocol: PROTOCOL, extensionVersion: MIN_EXTENSION, extensionProtocol: PROTOCOL } })
      }
      busy() {
        act(() => {
          for (const fn of this.messageFns) fn({ v: PROTOCOL, id: '', type: 'error', code: 'E-BRIDGE-BUSY' })
          this.disconnected = true
          for (const fn of this.disconnectFns) fn()
        })
      }
      cmds() {
        return this.sent.map((m) => m.cmd)
      }
    }

    async function connectedWithDeadWorker() {
      const { useBridge: real } = await vi.importActual<typeof import('@/components/claim/useBridge')>('@/components/claim/useBridge')
      bridge.mockImplementation(real)
      const ports: FakePort[] = []
      vi.stubGlobal('chrome', {
        runtime: {
          connect: () => {
            const port = new FakePort()
            ports.push(port)
            return port
          },
        },
      })
      const user = userEvent.setup()
      render(<PatientsEntry tool="followup" />)
      await act(async () => {})
      ports[0]!.helloOk()
      expect(await screen.findByText(FU_LOADING)).toBeTruthy()
      expect(ports[0]!.cmds()).toEqual(['hello', 'store.load'])
      made[0]!.fire('error')
      expectCard()
      await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
      await act(async () => {})
      return ports
    }

    it('AC-610.6: 새 Worker에는 통로 포트를 새로 주고 확장 연결도 새로 연다(옛 연결은 닫는다). 연결 중 → ready에서 새 연결로 store.load부터 읽는다', async () => {
      const ports = await connectedWithDeadWorker()
      expect(made).toHaveLength(2)
      expect(made[0]!.terminate).toHaveBeenCalledTimes(1)
      expect(made[0]!.posted).toEqual([{ type: 'bridge-port' }])
      expect(made[1]!.posted).toEqual([{ type: 'bridge-port' }])
      expect(ports).toHaveLength(2)
      expect(ports[0]!.disconnected).toBe(true)
      expect(ports[0]!.cmds()).toEqual(['hello', 'store.load'])
      expect(screen.getByRole('status').textContent).toBe(CONNECTING)

      ports[1]!.helloOk()
      expect(await screen.findByText(FU_LOADING)).toBeTruthy()
      expect(ports[1]!.cmds()).toEqual(['hello', 'store.load'])
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('AC-610.6: 새 연결이 E-BRIDGE-BUSY면 AC-610.4의 다른 창 안내다', async () => {
      const ports = await connectedWithDeadWorker()
      ports[1]!.busy()
      expect(await screen.findByRole('heading', { level: 2, name: BUSY_TITLE })).toBeTruthy()
      expect(screen.getByRole('button', { name: '건수만 보기' })).toBeTruthy()
      expect(ports[1]!.cmds()).toEqual(['hello'])
    })
  })
})

describe('PatientsEntry: 문자 문구 도구 (AC-613.5)', () => {
  const nameBox = () => screen.getByLabelText(/^이름/) as HTMLInputElement
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  const storeLoads = () => stream.mock.calls.filter(([cmd]) => cmd === 'store.load').length

  it.each<[BridgeState, string | null]>([
    ['no-extension', null],
    ['no-helper', null],
    ['update-helper', null],
    ['update-extension', null],
    ['disconnected', null],
    ['busy', null],
    ['connecting', null],
    ['connecting', 'E-BRIDGE-HELLO'],
    ['ready', null],
  ])('AC-613.5: 상태 %s(%s)에서 같은 도구가 열리고 안내·건수가 없으며, 도구가 통로·store.load를 부르지 않는다', async (state, helloError) => {
    withState(state, helloError)
    const { container } = render(<PatientsEntry tool="messages" />)
    await flush()
    expect(heading2('문자 문구')).not.toBeNull()
    expect(nameBox().value).toBe('주사 알림')
    expect(screen.getByRole('button', { name: /^저장/ })).toBeTruthy()
    for (const title of [COUNTS_TITLE, CONNECT_TITLE, BUSY_TITLE]) expect(heading2(title)).toBeNull()
    expect(screen.queryByText('비트 PC 연결을 확인하는 중이에요')).toBeNull()
    expect(container.querySelectorAll('[data-tool-slot="messages"]')).toHaveLength(1)
    expect(sb.reads).toBe(1)
    expect(vi.mocked(readContactCount)).not.toHaveBeenCalled()
    expect(call).not.toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
    // 연결됐을 때 나가는 store.load는 탭 입구의 명단 읽기 한 번이다. 다른 상태에서는 아무것도 나가지 않는다
    expect(stream.mock.calls).toEqual(state === 'ready' ? [['store.load', { contact: true }]] : [])
  })

  it.each<BridgeState>(['connecting', 'no-extension', 'no-helper', 'disconnected', 'busy'])('AC-613.5: 고치는 동안 %s → 연결됨이 되어도 도구가 그대로이고 고친 글이 남으며, 문구도 명단도 또 읽지 않는다', async (from) => {
    withState(from)
    const { rerender } = render(<PatientsEntry tool="messages" />)
    await flush()
    const box = nameBox()
    fireEvent.change(box, { target: { value: '고치는 중' } })

    withState('ready')
    rerender(<PatientsEntry tool="messages" />)
    await flush()
    expect(nameBox()).toBe(box)
    expect(box.value).toBe('고치는 중')
    expect(sb.reads).toBe(1)
    expect(storeLoads()).toBe(1)
    expect(retry).not.toHaveBeenCalled()

    // 그 뒤 다시 그려도 그대로다
    rerender(<PatientsEntry tool="messages" />)
    await flush()
    expect(nameBox()).toBe(box)
    expect(storeLoads()).toBe(1)
  })

  it.each<BridgeState>(['ready', 'no-extension', 'no-helper', 'busy', 'connecting'])('AC-613.5: 상태 %s에서 다른 도구로 갔다 돌아와도 같은 도구이고 고친 글·날짜가 남는다. 숨어 있는 동안 안 보인다', async (state) => {
    withState(state)
    const { rerender, container } = render(<PatientsEntry tool="messages" />)
    await flush()
    const box = nameBox()
    fireEvent.change(box, { target: { value: '고치는 중' } })
    fireEvent.change(screen.getByLabelText('내원 날짜'), { target: { value: '2027-01-04' } })

    rerender(<PatientsEntry tool="followup" />)
    await flush()
    expect((slot(container, 'messages') as HTMLElement).hidden).toBe(true)
    expect(heading2('문자 문구')).toBeNull()
    rerender(<PatientsEntry tool="recall" />)
    await flush()
    expect((slot(container, 'messages') as HTMLElement).hidden).toBe(true)

    rerender(<PatientsEntry tool="messages" />)
    await flush()
    expect((slot(container, 'messages') as HTMLElement).hidden).toBe(false)
    expect(nameBox()).toBe(box)
    expect(box.value).toBe('고치는 중')
    expect((screen.getByLabelText('내원 날짜') as HTMLInputElement).value).toBe('2027-01-04')
    expect(sb.reads).toBe(1)
    expect(storeLoads()).toBe(state === 'ready' ? 1 : 0)
    expect(made).toHaveLength(1)
  })

  it('AC-613.5: 문구 도구를 열기 전에는 문구를 읽지 않는다. 처음 열 때 한 번 읽고, 숨겼다 다시 열어도 또 읽지 않는다', async () => {
    withState('no-extension')
    const { rerender, container } = render(<PatientsEntry tool="followup" />)
    await flush()
    expect(sb.reads).toBe(0)
    expect(slot(container, 'messages')).toBeNull()
    rerender(<PatientsEntry tool="messages" />)
    await flush()
    expect(sb.reads).toBe(1)
    rerender(<PatientsEntry tool="followup" />)
    rerender(<PatientsEntry tool="messages" />)
    await flush()
    expect(sb.reads).toBe(1)
  })

  it('AC-613.5: 연결됨에서 열고 있는 동안 명단 불러오는 중 글이 나오지 않는다', async () => {
    withState('ready')
    render(<PatientsEntry tool="messages" />)
    await flush()
    expect(screen.queryByText('비트에서 F/U 명단을 읽는 중이에요')).toBeNull()
    expect(heading2('문자 문구')).not.toBeNull()
  })
})
