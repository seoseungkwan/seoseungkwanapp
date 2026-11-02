// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { isBorderBox } from '@/testing/boxes'
import type { BridgeState } from '@/types/bridge'
import ClaimPage from './page'

// /claim (REQ-006, ui-90 REQ-413, precheck REQ-013): 연결이 안 된 PC 크롬이면 비트 PC 연결(/claim/setup)이 먼저 나오고(목업 화면 1),
// 확장 없는 곳·휴대폰이면 "이 PC에서는 청구 점검을 열 수 없어요"(시안 docs/mockups/ui-90/app/gen.py claim_body) + '준비 중' 칩 자리에 건수(precheck AC-019.5),
// 연결됐으면 청구 화면(ClaimScreen, TASK-13), 다른 창에서 작업 중이면 카드(BUSY, 그대로)
const { replace, openClaimChannel, claimScreen, counts } = vi.hoisted(() => ({
  replace: vi.fn(),
  openClaimChannel: vi.fn(),
  claimScreen: vi.fn(),
  /** 서버 건수 표의 줄. 실제 DB에 붙지 않는다 */
  counts: { days: [] as unknown[], fail: false },
}))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: (table: string) => ({
      select: () => {
        const reply = counts.fail ? { data: null, error: { code: '500', message: 'relation secret' }, status: 500 } : { data: table === 'claim_day_counts' ? counts.days : [], error: null, status: 200 }
        const query = { order: () => query, limit: () => query, then: (ok: (value: unknown) => unknown) => Promise.resolve(reply).then(ok) }
        return query
      },
    }),
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => '/claim' }))
vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))
vi.mock('@/components/claim/claimLoad', () => ({ openClaimChannel }))
vi.mock('@/components/claim/ClaimScreen', () => ({
  ClaimScreen: (props: unknown) => {
    claimScreen(props)
    return <h2>청구 화면 자리</h2>
  },
}))

const bridge = vi.mocked(useBridge)
const retry = vi.fn()
const call = vi.fn()
const stream = vi.fn()
const CHANNEL = { worker: { postMessage: vi.fn() } }
function withState(state: BridgeState, helloError: string | null = null) {
  bridge.mockReturnValue({
    state,
    hello: null,
    helloError,
    helperUpdateAvailable: false,
    call,
    stream,
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

const countRow = (visit_date: string, need_memo: number, entered: number, updated_at: string) => ({ visit_date, visits: 9, need_memo, entered, needs_check: 0, skipped: 0, updated_at })
const COUNTS = [
  countRow('2026-11-03', 4, 4, '2026-11-04T07:41:00+00:00'), // 끝난 날. 한국 시각 11월 4일 (수) 16:41
  countRow('2026-11-02', 6, 5, '2026-11-03T01:05:00+00:00'), // 한국 시각 11월 3일 (화) 10:05
]
const EMPTY_NOTICE = '아직 올린 건수가 없어요'
/** 건수를 다 읽은 뒤의 '메모 입력 현황' 패널. 읽기 전에 본 시험은 틀린 화면에서도 통과한다 */
const memoPanel = async () => (await screen.findByRole('heading', { level: 2, name: '메모 입력 현황' })).closest('section') as HTMLElement
/** 목업 화면 11에만 있고 이 자리에는 넣지 않는 것(AC-019.5) */
function expectNoMockup11Extras(container: Element) {
  for (const text of ['설치·연결 확인', '설정 열기', '비트 PC가 아닌 곳에서 보는 화면이에요', '환자 정보와 삭감 경고는 비트 PC에서만 볼 수 있어요', '월말 마감 남은 일', '연락 남은 건수', '준비 중']) {
    expect(container.textContent).not.toContain(text)
  }
}

beforeEach(() => {
  replace.mockClear()
  retry.mockClear()
  claimScreen.mockClear()
  bridge.mockClear()
  openClaimChannel.mockReset()
  openClaimChannel.mockReturnValue(CHANNEL)
  counts.days = []
  counts.fail = false
})
afterEach(cleanup)

describe('/claim 자리', () => {
  it('AC-013.8·AC-006.5·AC-413.1: 확장 없는 곳·휴대폰이면 점검 칸 없이 건수 자리와 연결 링크다. 청구 화면을 그리지 않는다', async () => {
    withState('no-extension')
    openClaimChannel.mockReturnValue(null)
    render(<ClaimPage />)
    await memoPanel()
    expect(claimScreen).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '자료 불러오기' })).toBeNull()
    expect(screen.getByText('다른 PC에서는 건수만 볼 수 있어요')).toBeTruthy()
    expect(screen.getByRole('link', { name: '이 PC를 비트 PC로 연결' }).getAttribute('href')).toBe('/claim/setup')
  })

  it('AC-006.5·AC-413.1·AC-019.5: 확장 없는 곳·휴대폰이면 "이 PC에서는 청구 점검을 열 수 없어요" — 점 목록 둘, [이 PC를 비트 PC로 연결], 건수 줄과 건수. 상자는 건수 패널 하나이고 h1은 하나', async () => {
    withState('no-extension')
    const { container } = render(<ClaimPage />)
    const panel = await memoPanel()
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

    // 위 1px line 아래 "다른 PC에서는 건수만 볼 수 있어요". '준비 중' 칩은 건수가 들어와 빠졌다(AC-019.5)
    const other = screen.getByText('다른 PC에서는 건수만 볼 수 있어요').parentElement as HTMLElement
    expectClasses(other, 'border-t border-line text-small text-muted')
    expect(within(other).queryByText('준비 중')).toBeNull()

    // 건수를 읽은 뒤에도 옛 "밖에서 보는 건수"·"설치·연결 확인"이 없다. 패널 상자가 없다는 글은 건수가 든 이 자리에 쓰지 않는다: 상자는 건수 패널 하나뿐이다(AC-019.5)
    expect(container.textContent).not.toContain('밖에서 보는 건수')
    expect(container.textContent).not.toContain('설치·연결 확인')
    expect(screen.queryByRole('heading', { level: 1, name: '청구' })).toBeNull()
    expect(allOf(container).filter(isBorderBox)).toEqual([panel])
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

  it('AC-018.6: 다른 창에서 이미 청구 화면이 연결됨이면 그 안내만 보이고 불러오기·입력 단추가 없다', () => {
    withState('busy')
    render(<ClaimPage />)
    expect(screen.getByRole('alert').textContent).toContain(errorInfo('E-BRIDGE-BUSY').what)
    expect(screen.queryByRole('button', { name: '자료 불러오기' })).toBeNull()
    expect(screen.queryByRole('button', { name: /비트에 입력/ })).toBeNull()
  })

  it('AC-006.1·AC-413.3·AC-019.5: 다른 창에서 작업 중이면 카드 그대로 — [다시 확인]은 다시 붙고, [건수만 보기]는 h1 "청구" + "건수만 볼 수 있어요" + 건수 + [다시 확인](보조)', async () => {
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
    await memoPanel()
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.map(textOf)).toEqual(['청구'])
    const line = screen.getByText('건수만 볼 수 있어요').parentElement as HTMLElement
    expect(within(line).queryByText('준비 중')).toBeNull()
    expect(screen.queryByText('밖에서 보는 건수')).toBeNull()

    // [다시 확인](보조): 다시 붙기를 부르고 카드로 돌아간다
    const again = screen.getByRole('button', { name: '다시 확인' })
    expectClasses(again, ds.button.secondary)
    await user.click(again)
    expect(retry).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('건수만 볼 수 있어요')).toBeNull()
  })

  it('AC-013.2·AC-006.2: 연결됐으면(ready) 보내지 않고 h1 "청구" 아래 청구 화면이 열린다. 준비 중 화면이 없다', () => {
    withState('ready')
    const { container } = render(<ClaimPage />)
    expect(screen.getAllByRole('heading', { level: 1 }).map(textOf)).toEqual(['청구'])
    expect(screen.getByRole('heading', { level: 2, name: '청구 화면 자리' })).toBeTruthy()
    expect(claimScreen).toHaveBeenCalledWith(expect.objectContaining({ channel: CHANNEL, call, stream }))
    expect(container.textContent).not.toContain('청구 점검 화면은 준비 중이에요')
    expect(replace).not.toHaveBeenCalled()
  })

  it('AC-013.12: 통로에 넘기는 Worker는 번호 칸과 같은 Worker다', () => {
    withState('ready')
    render(<ClaimPage />)
    expect(bridge).toHaveBeenCalledWith({ worker: CHANNEL.worker })
    expect(openClaimChannel).toHaveBeenCalledTimes(1)
  })

  it('AC-013.8: Worker가 없는 곳에서는 통로에 Worker를 넘기지 않는다', () => {
    withState('no-extension')
    openClaimChannel.mockReturnValue(null)
    render(<ClaimPage />)
    expect(bridge).toHaveBeenCalledWith({ worker: undefined })
  })

  it('AC-013.5: 연결됐는데 Worker를 만들지 못하면 오류 카드다(점검 칸을 그리지 않는다)', () => {
    withState('ready')
    openClaimChannel.mockReturnValue(null)
    render(<ClaimPage />)
    expect(claimScreen).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-RULES-LOAD-FAILED')
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
    expect(screen.queryByText(EMPTY_NOTICE)).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: '메모 입력 현황' })).toBeNull()
    expect(screen.queryByText('이 PC에서는 청구 점검을 열 수 없어요')).toBeNull()
    expect(screen.queryByText('청구 점검 화면은 준비 중이에요')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 }).map(textOf)).toEqual(['청구'])
  })
})

// 건수가 들어가는 자리(AC-019.5). ui-90 화면을 두고 '준비 중' 칩 자리에 마지막으로 바뀐 시각 줄과 '메모 입력 현황' 패널 하나만 넣는다. 모두 건수를 읽은 뒤에 본다
describe('AC-019.5 /claim의 건수 자리', () => {
  it('AC-019.5: 확장 없는 곳·휴대폰: 읽은 뒤 남은 날과 그 줄의 바뀐 시각이 보이고, 위쪽 화면은 그대로다', async () => {
    counts.days = COUNTS
    withState('no-extension')
    const { container } = render(<ClaimPage />)
    const panel = await memoPanel()

    const table = within(panel).getByRole('table', { name: '메모 입력 현황' })
    const lines = within(table).getAllByRole('row').slice(1)
    expect(lines).toHaveLength(1)
    expect(textOf(lines[0])).toContain('11/2 (월)')
    expect(textOf(lines[0])).toContain('11월 3일 (화) 10:05에 바뀜')
    expect(textOf(table)).not.toContain('11/3 (화)')
    expect(textOf(container)).toContain('마지막으로 바뀐 시각 11월 4일 (수) 16:41 · 비트 PC에서 올라옴')

    expect(screen.getAllByRole('heading', { level: 1 }).map(textOf)).toEqual(['이 PC에서는 청구 점검을 열 수 없어요'])
    expect(screen.getByRole('link', { name: '이 PC를 비트 PC로 연결' }).getAttribute('href')).toBe('/claim/setup')
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2)
    expectNoMockup11Extras(container)
  })

  it('AC-019.5: 확장 없는 곳: 건수는 "다른 PC에서는…" 줄 뒤에 오고, 패널은 위쪽 화면과 같은 600px 자리를 다 쓴다(자기 폭 제한이 없다)', async () => {
    counts.days = COUNTS
    withState('no-extension')
    render(<ClaimPage />)
    const panel = await memoPanel()
    const line = screen.getByText('다른 PC에서는 건수만 볼 수 있어요').parentElement as HTMLElement
    expect(line.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const wrapper = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement
    expectClasses(wrapper, 'max-w-150')
    expect(wrapper.contains(panel)).toBe(true)
    expect(classesOf(panel).filter((name) => /^(max-w|w|col-span)-/.test(name))).toEqual([])
  })

  it('AC-019.5: [건수만 보기]: 읽은 뒤 건수가 보이고 h1은 "청구" 하나, [다시 확인]이 그대로다', async () => {
    counts.days = COUNTS
    withState('busy')
    const { container } = render(<ClaimPage />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '건수만 보기' }))
    const panel = await memoPanel()

    expect(textOf(within(panel).getByRole('table', { name: '메모 입력 현황' }))).toContain('11/2 (월)')
    expect(textOf(container)).toContain('마지막으로 바뀐 시각 11월 4일 (수) 16:41')
    expect(screen.getAllByRole('heading', { level: 1 }).map(textOf)).toEqual(['청구'])
    expect(screen.getByText('건수만 볼 수 있어요')).toBeTruthy()
    const again = screen.getByRole('button', { name: '다시 확인' })
    expectClasses(again, ds.button.secondary)
    expect(panel.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expectNoMockup11Extras(container)
  })

  it.each([
    ['확장 없는 곳', 'no-extension' as const],
    ['[건수만 보기]', 'busy' as const],
  ])('AC-019.5: %s: 올린 건수가 없으면 패널 안에 빈 안내 한 줄이고, 읽은 뒤에도 설치·연결 확인이 없다', async (_name, state) => {
    withState(state)
    const { container } = render(<ClaimPage />)
    if (state === 'busy') await userEvent.setup().click(screen.getByRole('button', { name: '건수만 보기' }))
    const panel = await memoPanel()
    expect(within(panel).getByText(EMPTY_NOTICE)).toBeTruthy()
    expect(screen.getAllByText(EMPTY_NOTICE)).toHaveLength(1)
    expect(within(panel).queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expectNoMockup11Extras(container)
  })

  it('AC-019.5: 건수를 읽지 못해도 위쪽 화면과 [다시 확인]은 그대로다. 오류 번호만 보이고 원래 오류 글이 없다', async () => {
    counts.fail = true
    withState('no-extension')
    const { unmount } = render(<ClaimPage />)
    const noExtension = await screen.findByRole('alert')
    expect(noExtension.textContent).toContain('오류 번호 E-COUNTS-FAILED')
    expect(noExtension.textContent).not.toContain('relation')
    expect(screen.getByRole('link', { name: '이 PC를 비트 PC로 연결' })).toBeTruthy()
    unmount()

    withState('busy')
    render(<ClaimPage />)
    await userEvent.setup().click(screen.getByRole('button', { name: '건수만 보기' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-COUNTS-FAILED'))
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy()
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
