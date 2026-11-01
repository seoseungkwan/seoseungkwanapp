// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { isBorderBox } from '@/testing/boxes'
import type { BridgeState } from '@/types/bridge'
import ClaimPage from './page'

// /claim (REQ-006, ui-90 REQ-413): 연결이 안 된 PC 크롬이면 비트 PC 연결(/claim/setup)이 먼저 나오고(목업 화면 1),
// 확장 없는 곳·휴대폰이면 "이 PC에서는 청구 점검을 열 수 없어요"(시안 docs/mockups/ui-90/app/gen.py claim_body),
// 연결됐으면 준비 중 화면 모양(claim_ready_body), 다른 창에서 작업 중이면 카드(BUSY, 그대로). 점검 화면은 TASK-13
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

// 모양은 정해 둔 클래스가 있는지로 본다(jsdom은 CSS를 계산하지 않는다)
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null | undefined) => tokens(el?.getAttribute('class') ?? '')
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted.flatMap(tokens)))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const allOf = (root: Element) => [root, ...Array.from(root.querySelectorAll('*'))]

beforeEach(() => {
  replace.mockClear()
  retry.mockClear()
})
afterEach(cleanup)

describe('/claim 자리', () => {
  it('AC-006.5·AC-413.1: 확장 없는 곳·휴대폰이면 "이 PC에서는 청구 점검을 열 수 없어요" — 점 목록 둘, [이 PC를 비트 PC로 연결], 건수 줄. 밖에서 보는 건수·상자가 없고 h1은 하나', () => {
    withState('no-extension')
    const { container } = render(<ClaimPage />)
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(textOf(h1s[0])).toBe('이 PC에서는 청구 점검을 열 수 없어요')
    // heading-m(폰) → heading(768 이상) 600
    expectClasses(h1s[0], 'text-heading-m md:text-heading font-semibold text-ink')

    // 점 목록 두 줄(시안 글자 그대로), 꾸밈 점은 accent
    const list = screen.getByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items.map(textOf)).toEqual([
      '환자 정보와 삭감 경고는 비트 PC(비트가 깔린 의원 PC)에서만 보여요.',
      '이 PC는 아직 비트 PC로 연결되지 않았어요.',
    ])
    for (const item of items) {
      const dot = item.querySelector('[aria-hidden="true"]')
      expectClasses(dot, 'bg-accent')
    }

    // [이 PC를 비트 PC로 연결]: 주 큰 단추 + 꾸밈 화살표, 폰 전체 폭
    const connect = screen.getByRole('link', { name: '이 PC를 비트 PC로 연결' })
    expect(connect.getAttribute('href')).toBe('/claim/setup')
    expectClasses(connect, ds.button.primaryLarge, 'max-md:w-full')
    expect(connect.querySelector('svg[aria-hidden="true"]')).not.toBeNull()

    // 위 1px line 아래 "다른 PC에서는 건수만 볼 수 있어요" + neutral 칩 "준비 중"
    const other = screen.getByText('다른 PC에서는 건수만 볼 수 있어요').parentElement as HTMLElement
    expectClasses(other, 'border-t border-line text-small text-muted')
    const chip = within(other).getByText('준비 중')
    expectClasses(chip, ds.chip.neutral)

    // 옛 "밖에서 보는 건수"·"설치·연결 확인"·패널 상자가 없다
    expect(container.textContent).not.toContain('밖에서 보는 건수')
    expect(container.textContent).not.toContain('설치·연결 확인')
    expect(screen.queryByRole('heading', { level: 1, name: '청구' })).toBeNull()
    expect(allOf(container).filter(isBorderBox)).toEqual([])
    expect(replace).not.toHaveBeenCalled()
  })

  it.each(['no-helper', 'update-helper', 'update-extension', 'disconnected'] as const)(
    'AC-006.1·AC-413.3: 확장은 있는데 %s이면 비트 PC 연결(/claim/setup)로 보낸다',
    (state) => {
      withState(state)
      render(<ClaimPage />)
      expect(replace).toHaveBeenCalledExactlyOnceWith('/claim/setup')
    },
  )

  it('AC-006.1·AC-413.3: 다른 창에서 작업 중이면 카드 그대로 — [다시 확인]은 다시 붙고, [건수만 보기]는 h1 "청구" + "건수만 볼 수 있어요" + 준비 중 칩 + [다시 확인](보조)', async () => {
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
    expect(screen.queryByRole('alert')).toBeNull()
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.map(textOf)).toEqual(['청구'])
    const line = screen.getByText('건수만 볼 수 있어요').parentElement as HTMLElement
    expectClasses(within(line).getByText('준비 중'), ds.chip.neutral)
    expect(screen.queryByText('아직 올린 건수가 없어요.')).toBeNull()
    expect(screen.queryByText('밖에서 보는 건수')).toBeNull()

    // [다시 확인](보조): 다시 붙기를 부르고 카드로 돌아간다
    const again = screen.getByRole('button', { name: '다시 확인' })
    expectClasses(again, ds.button.secondary)
    await user.click(again)
    expect(retry).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('건수만 볼 수 있어요')).toBeNull()
  })

  it('AC-006.2·AC-413.2: 연결됐으면(ready) 보내지 않고 준비 중 화면 모양 — h1·소개·만들 것 넷·[비트 PC 연결 다시 확인](보조), "그동안 쓸 수 있어요"와 따로 "청구" h1이 없다', () => {
    withState('ready')
    const { container } = render(<ClaimPage />)
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.map(textOf)).toEqual(['청구 점검 화면은 준비 중이에요'])
    expect(screen.getByText('이 PC는 비트와 연결됐어요. 점검 화면이 만들어지면 이 탭에서 바로 열려요.')).toBeTruthy()
    const made = screen.getByRole('heading', { level: 2, name: '만들 것' }).nextElementSibling as HTMLElement
    expect(within(made).getAllByRole('listitem').map(textOf)).toEqual(['삭감 예방 사전점검', '청구메모', '상병 확인', '월말 마감'])

    const again = screen.getByRole('link', { name: '비트 PC 연결 다시 확인' })
    expect(again.getAttribute('href')).toBe('/claim/setup')
    expectClasses(again, ds.button.secondary)
    expect(screen.queryByRole('link', { name: /대시보드로 돌아가기/ })).toBeNull()
    expect(container.textContent).not.toContain('그동안 쓸 수 있어요')
    expect(container.textContent).not.toContain('준비 중입니다')
    expect(container.textContent).not.toContain('설치·연결 확인')
    expect(replace).not.toHaveBeenCalled()
  })

  it('AC-006.1·AC-006.6·AC-413.3: hello가 오류 번호로 끝나 연결 중에 멈췄으면(helloError) 비트 PC 연결로 보낸다(거기서 번호와 [다시 확인])', () => {
    withState('connecting', 'E-BRIDGE-BAD-REPLY')
    render(<ClaimPage />)
    expect(replace).toHaveBeenCalledExactlyOnceWith('/claim/setup')
  })

  it('AC-006.1·AC-413.3: 연결을 확인하는 동안(connecting)은 보내지도 다른 화면을 그리지도 않고 h1 "청구"만', () => {
    withState('connecting')
    render(<ClaimPage />)
    expect(replace).not.toHaveBeenCalled()
    expect(screen.queryByText('아직 올린 건수가 없어요.')).toBeNull()
    expect(screen.queryByText('이 PC에서는 청구 점검을 열 수 없어요')).toBeNull()
    expect(screen.queryByText('청구 점검 화면은 준비 중이에요')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 }).map(textOf)).toEqual(['청구'])
  })
})

// ui-90 TASK-5: 청구 폴더가 규칙 시험에 들며 단계 밖 간격만 가까운 단계로 고친다(보이는 모양은 그대로). 문구·짜임은 TASK-10이 바꿨다.
describe('AC-408.2 /claim 자리 간격은 가까운 단계', () => {
  it('AC-408.2: 다른 창 카드는 다른 상태처럼 왼쪽 정렬·제목 아래 24px(사이 16 + 8)·폭 520px·안쪽 24px(폰 16px)', () => {
    withState('busy')
    render(<ClaimPage />)
    const card = screen.getByRole('alert')
    expect(classesOf(card)).toEqual(expect.arrayContaining(['mt-2', 'w-130', 'max-w-full', 'p-6', 'max-md:p-4']))
    expect(classesOf(card)).not.toContain('self-center')
    expect(classesOf(card)).not.toContain('mx-auto')
    expect(classesOf(card)).not.toContain('mt-16')
  })

  it('AC-408.2·AC-413.1: 건수 줄은 위 32·선 아래 16, 사이 8 · 줄 사이 6(시안 6px 8px), 단계 밖 간격이 없다', () => {
    withState('no-extension')
    render(<ClaimPage />)
    const line = screen.getByText('다른 PC에서는 건수만 볼 수 있어요').parentElement as HTMLElement
    expectClasses(line, 'flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-8 pt-4')
    expect(classesOf(line)).not.toContain('gap-2.5')
  })
})
