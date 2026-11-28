// @vitest-environment jsdom
// /claim 입구가 청구 화면에 도우미 판을 넘기는지(spec clinic-profile REQ-6611 AC-6611.1, design.md 13절).
// [뒤에 붙이기]는 도우미 판이 APPEND_HELPER(0.12.0) 이상일 때만 보이고 판을 모르면 숨기므로, 입구가 hello의 helperVersion을 넘겨야 한다.
// 통로(useBridge)·Worker 통로·청구 화면은 모두 가짜다. 실제 확장·도우미·Supabase에 붙지 않는다
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useBridge: vi.fn(),
  screenProps: [] as Record<string, unknown>[],
  channel: { worker: {} },
  replace: vi.fn(),
}))
// Next처럼 같은 router를 늘 돌려준다(옮긴 주소를 본다)
const router = vi.hoisted(() => ({ replace: (href: string) => mocks.replace(href) }))

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('../useBridge', () => ({ useBridge: mocks.useBridge }))
vi.mock('../claimLoad', () => ({ openClaimChannel: () => mocks.channel }))
vi.mock('../OutsideCounts', () => ({ OutsideCounts: () => null }))
vi.mock('../ClaimScreen', () => ({
  ClaimScreen: (props: Record<string, unknown>) => {
    mocks.screenProps.push(props)
    return <p>청구 화면</p>
  },
}))

import { ClaimEntry } from './ClaimEntry'

const bridge = (hello: { helperVersion: string } | null, state = 'ready', helloError: string | null = null, retry = vi.fn()) => ({
  state,
  hello,
  helloError,
  helperUpdateAvailable: false,
  retry,
  call: vi.fn(),
  stream: vi.fn(),
  onProgress: vi.fn(),
})

afterEach(() => {
  cleanup()
  mocks.screenProps.length = 0
  mocks.useBridge.mockReset()
  mocks.replace.mockReset()
})

describe('AC-6611.1 청구 화면에 도우미 판 넘기기', () => {
  it('AC-6611.1: 연결되면 hello의 helperVersion을 청구 화면에 그대로 넘긴다([뒤에 붙이기]를 보일지 정하는 값)', () => {
    mocks.useBridge.mockReturnValue(bridge({ helperVersion: '0.12.0' }))
    render(<ClaimEntry />)
    expect(mocks.screenProps.at(-1)?.helperVersion).toBe('0.12.0')
    expect(mocks.screenProps.at(-1)?.channel).toBe(mocks.channel)
  })

  it('AC-6611.1: hello가 아직 없으면 판을 넘기지 않는다(판을 모르면 청구 화면이 [뒤에 붙이기]를 숨긴다)', () => {
    mocks.useBridge.mockReturnValue(bridge(null))
    render(<ClaimEntry />)
    expect(mocks.screenProps.at(-1)?.helperVersion).toBeUndefined()
  })
})

/** 청구 화면(가짜)이 마지막으로 받은 값 */
const lastScreen = () => mocks.screenProps.at(-1) as { onWorking?(working: boolean): void; reconnect?(): Promise<boolean> }
const HELLO = { helperVersion: '0.15.0' }

describe('AC-9313.1 청구에서 연결 화면으로 옮길 때 까닭을 싣는다', () => {
  it.each(['no-helper', 'update-helper', 'update-extension', 'disconnected'])('AC-9313.1: %s이면 /claim/setup?from=claim&why=그 까닭으로 옮긴다', (state) => {
    mocks.useBridge.mockReturnValue(bridge(null, state))
    render(<ClaimEntry />)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/claim/setup?from=claim&why=${state}`)
  })

  it('AC-9313.1: hello가 오류 번호로 끝나 연결 중에 멈췄으면 끊김(disconnected) 까닭으로 옮긴다', () => {
    mocks.useBridge.mockReturnValue(bridge(null, 'connecting', 'E-BRIDGE-BAD-REPLY'))
    render(<ClaimEntry />)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/claim/setup?from=claim&why=disconnected')
  })
})

describe('AC-9313.2 연결 확인 중', () => {
  it('AC-9313.2: 연결을 확인하는 동안 제목 아래 "이 PC 연결을 확인하는 중…"이 보이고, 붙으면 사라진다', () => {
    mocks.useBridge.mockReturnValue(bridge(null, 'connecting'))
    const { rerender } = render(<ClaimEntry />)
    const h1 = screen.getByRole('heading', { level: 1, name: '청구' })
    const note = screen.getByText('이 PC 연결을 확인하는 중…')
    expect(h1.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mocks.replace).not.toHaveBeenCalled()
    mocks.useBridge.mockReturnValue(bridge(HELLO))
    rerender(<ClaimEntry />)
    expect(screen.queryByText('이 PC 연결을 확인하는 중…')).toBeNull()
  })

  it('AC-9313.2: hello가 오류 번호로 끝났으면(연결 화면으로 옮김) 확인 중 글이 없다', () => {
    mocks.useBridge.mockReturnValue(bridge(null, 'connecting', 'E-BRIDGE-BAD-REPLY'))
    render(<ClaimEntry />)
    expect(screen.queryByText('이 PC 연결을 확인하는 중…')).toBeNull()
  })
})

describe('AC-9315.1 일하는 중에 도우미가 멈추면 옮기지 않는다', () => {
  it('AC-9315.1: 청구 화면이 일하는 중이라고 알린 동안 no-helper가 되면 연결 화면으로 옮기지 않고 청구 화면을 그대로 둔다. 일이 끝나도(멈춤 안내를 보는 동안) 옮기지 않는다', () => {
    mocks.useBridge.mockReturnValue(bridge(HELLO))
    const { rerender } = render(<ClaimEntry />)
    act(() => lastScreen().onWorking?.(true))
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'no-helper'))
    rerender(<ClaimEntry />)
    expect(screen.getByText('청구 화면')).toBeTruthy()
    act(() => lastScreen().onWorking?.(false))
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getByText('청구 화면')).toBeTruthy()
  })

  it('AC-9315.1: 일하는 중이 아닐 때 끊기면 지금처럼 연결 화면으로 옮긴다', () => {
    mocks.useBridge.mockReturnValue(bridge(HELLO))
    const { rerender } = render(<ClaimEntry />)
    act(() => lastScreen().onWorking?.(false))
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'no-helper'))
    rerender(<ClaimEntry />)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/claim/setup?from=claim&why=no-helper')
  })

  it('AC-9315.1: 멈춘 뒤 [다시 불러오기](reconnect)는 다시 붙기(retry)를 부르고 붙으면 참이다. 그 뒤 끊기면 다시 옮긴다', async () => {
    const retry = vi.fn()
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'ready', null, retry))
    const { rerender } = render(<ClaimEntry />)
    act(() => lastScreen().onWorking?.(true))
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'no-helper', null, retry))
    rerender(<ClaimEntry />)
    act(() => lastScreen().onWorking?.(false))

    let answer: Promise<boolean> = Promise.resolve(false)
    act(() => {
      answer = lastScreen().reconnect!()
    })
    expect(retry).toHaveBeenCalledTimes(1)
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'connecting', null, retry))
    rerender(<ClaimEntry />)
    expect(screen.getByText('청구 화면')).toBeTruthy() // 다시 붙는 동안에도 화면을 그대로 둔다
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'ready', null, retry))
    rerender(<ClaimEntry />)
    await expect(answer).resolves.toBe(true)
    expect(mocks.replace).not.toHaveBeenCalled()

    mocks.useBridge.mockReturnValue(bridge(HELLO, 'no-helper', null, retry))
    rerender(<ClaimEntry />)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/claim/setup?from=claim&why=no-helper')
  })

  it('AC-9315.1: 다시 붙지 못하면(도우미가 아직 없음) 거짓이고 청구 화면은 멈춤 안내를 그대로 둔다', async () => {
    const retry = vi.fn()
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'ready', null, retry))
    const { rerender } = render(<ClaimEntry />)
    act(() => lastScreen().onWorking?.(true))
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'no-helper', null, retry))
    rerender(<ClaimEntry />)
    act(() => lastScreen().onWorking?.(false))
    let answer: Promise<boolean> = Promise.resolve(true)
    act(() => {
      answer = lastScreen().reconnect!()
    })
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'connecting', null, retry))
    rerender(<ClaimEntry />)
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'no-helper', null, retry))
    rerender(<ClaimEntry />)
    await expect(answer).resolves.toBe(false)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getByText('청구 화면')).toBeTruthy()
  })

  it('AC-9315.1: 붙어 있을 때 reconnect는 다시 붙지 않고 바로 참이다', async () => {
    const retry = vi.fn()
    mocks.useBridge.mockReturnValue(bridge(HELLO, 'ready', null, retry))
    render(<ClaimEntry />)
    await expect(lastScreen().reconnect!()).resolves.toBe(true)
    expect(retry).not.toHaveBeenCalled()
  })
})
