// @vitest-environment jsdom
// /claim 입구가 청구 화면에 도우미 판을 넘기는지(spec clinic-profile REQ-6611 AC-6611.1, design.md 13절).
// [뒤에 붙이기]는 도우미 판이 APPEND_HELPER(0.12.0) 이상일 때만 보이고 판을 모르면 숨기므로, 입구가 hello의 helperVersion을 넘겨야 한다.
// 통로(useBridge)·Worker 통로·청구 화면은 모두 가짜다. 실제 확장·도우미·Supabase에 붙지 않는다
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useBridge: vi.fn(),
  screenProps: [] as Record<string, unknown>[],
  channel: { worker: {} },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
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

const bridge = (hello: { helperVersion: string } | null) => ({
  state: 'ready',
  hello,
  helloError: null,
  helperUpdateAvailable: false,
  retry: vi.fn(),
  call: vi.fn(),
  stream: vi.fn(),
  onProgress: vi.fn(),
})

afterEach(() => {
  cleanup()
  mocks.screenProps.length = 0
  mocks.useBridge.mockReset()
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
