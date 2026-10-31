// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { errorInfo } from '@/lib/errors'
import type { BridgeState } from '@/types/bridge'
import ClaimPage from './page'

// /claim (REQ-006 자리만): 연결이 안 된 PC 크롬이면 설치·연결 확인(/claim/setup)이 먼저 나오고(목업 화면 1),
// 확장 없는 곳·휴대폰이면 '밖에서 보는 건수' 자리(목업 화면 11, 건수는 TASK-19). 점검 화면은 TASK-13
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => '/claim' }))
vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))

const bridge = vi.mocked(useBridge)
const retry = vi.fn()
function withState(state: BridgeState, helloError: string | null = null) {
  bridge.mockReturnValue({
    state,
    hello: null,
    helloError,
    helperUpdateAvailable: false,
    call: vi.fn(),
    stream: vi.fn(),
    onProgress: vi.fn(),
    retry,
  } as unknown as ReturnType<typeof useBridge>)
}

beforeEach(() => {
  replace.mockClear()
  retry.mockClear()
})
afterEach(cleanup)

describe('/claim 자리', () => {
  it('AC-006.5: 확장 없는 곳·휴대폰이면 밖에서 보는 건수 자리 — "비트 PC의 크롬에서 엽니다"와 빈 안내 한 줄, 설치·연결 확인 링크', () => {
    withState('no-extension')
    render(<ClaimPage />)
    expect(screen.getByRole('heading', { level: 1, name: '청구' })).toBeTruthy()
    expect(screen.getByText('비트 PC가 아닌 곳에서 보는 화면이에요')).toBeTruthy()
    expect(screen.getByText('청구 점검은 비트 PC의 크롬에서 엽니다.')).toBeTruthy()
    expect(screen.getByText('아직 올린 건수가 없어요.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '설치·연결 확인' }).getAttribute('href')).toBe('/claim/setup')
    expect(replace).not.toHaveBeenCalled()
  })

  it.each(['no-helper', 'update-helper', 'update-extension', 'disconnected'] as const)(
    'AC-006.1: 확장은 있는데 %s이면 설치·연결 확인(/claim/setup)으로 보낸다',
    (state) => {
      withState(state)
      render(<ClaimPage />)
      expect(replace).toHaveBeenCalledExactlyOnceWith('/claim/setup')
    },
  )

  it('AC-006.1: 다른 창에서 작업 중이면 목업 화면 6의 카드 — [다시 확인]은 다시 붙고, [건수만 보기]는 밖에서 보는 건수 자리', async () => {
    withState('busy')
    render(<ClaimPage />)
    const card = screen.getByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-BRIDGE-BUSY').what)
    expect(card.textContent).toContain('오류 번호 E-BRIDGE-BUSY')
    expect(replace).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(within(card).getByRole('button', { name: '다시 확인' }))
    expect(retry).toHaveBeenCalledTimes(1)
    await user.click(within(card).getByRole('button', { name: '건수만 보기' }))
    expect(screen.getByText('아직 올린 건수가 없어요.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-006.2: 연결됐으면(ready) 보내지 않고 점검 화면 자리를 그린다', () => {
    withState('ready')
    render(<ClaimPage />)
    expect(screen.getByRole('heading', { level: 1, name: '청구' })).toBeTruthy()
    expect(screen.getByText('청구 점검 화면은 준비 중입니다')).toBeTruthy()
    expect(screen.getByRole('link', { name: '설치·연결 확인' }).getAttribute('href')).toBe('/claim/setup')
    expect(replace).not.toHaveBeenCalled()
  })

  it('AC-006.1·AC-006.6: hello가 오류 번호로 끝나 연결 중에 멈췄으면(helloError) 설치·연결 확인으로 보낸다(거기서 번호와 [다시 확인])', () => {
    withState('connecting', 'E-BRIDGE-BAD-REPLY')
    render(<ClaimPage />)
    expect(replace).toHaveBeenCalledExactlyOnceWith('/claim/setup')
  })

  it('AC-006.1: 연결을 확인하는 동안(connecting)은 보내지도 건수 자리를 그리지도 않는다', () => {
    withState('connecting')
    render(<ClaimPage />)
    expect(replace).not.toHaveBeenCalled()
    expect(screen.queryByText('아직 올린 건수가 없어요.')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: '청구' })).toBeTruthy()
  })
})
