// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon, type IconName } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { ViewHospital } from '@/lib/auth/adminView'
import { ViewPicker } from './ViewPicker'

// 위쪽 띠 '보는 의원' 단추와 판 (admin-view REQ-8006 AC-8006.4·AC-8006.5·AC-8006.7, design.md '앱 틀'·'화면 글자', 시안 .vp).
// 실제 Supabase에 붙지 않는다 — 브라우저 함수(listViewHospitals·startAdminView·stopAdminView)는 가짜, 쿠키·location은 흉내 낸다.
// 의원 이름·주소·열쇠는 모두 지어낸 값이다

const { listViewHospitals, startAdminView, stopAdminView } = vi.hoisted(() => ({
  listViewHospitals: vi.fn(),
  startAdminView: vi.fn(),
  stopAdminView: vi.fn(),
}))
vi.mock('@/lib/auth/adminView', () => ({ listViewHospitals, startAdminView, stopAdminView }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ replace: vi.fn() }) }))

const MINE = '11111111-1111-4111-8111-111111111111'
const DARA = '22222222-2222-4222-8222-222222222222'
const SAA = '44444444-4444-4444-8444-444444444444'
const JACHA = '55555555-5555-4555-8555-555555555555'
const KATA = '66666666-6666-4666-8666-666666666666'
const KEY = '33333333-3333-4333-8333-333333333333'

const H = (hospitalId: string, name: string, extra: Partial<ViewHospital> = {}): ViewHospital => ({
  hospitalId,
  name,
  address: null,
  regionSet: false,
  region: null,
  mine: false,
  ...extra,
})
// 받은 차례는 이름 차례가 아니다(판이 이름 차례로 세운다)
const LIST: ViewHospital[] = [
  H(SAA, '사아 재활의학과의원', { address: '서울 가짜구 가짜로 1', regionSet: true, region: '경기' }),
  H(MINE, '가나 정형외과의원', { address: '서울특별시 예시구 예시로 12', mine: true }),
  H(KATA, '카타 정형외과의원'),
  H(DARA, '다라 정형외과의원', { address: '부산광역시 예시구 예시로 3' }),
  H(JACHA, '자차 정형외과의원', { address: '대구 예시구 1', regionSet: true, region: null }),
]
const VIEWING = { hospitalId: DARA, name: '다라 정형외과의원' }
const SET = `ssk_view=${KEY}; Path=/; SameSite=Lax; Secure`
const CLEAR = 'ssk_view=; Path=/; SameSite=Lax; Secure; Max-Age=0'

let writes: string[] = []
const events: string[] = []
const assign = vi.fn((to: string) => events.push(`assign ${to}`))

beforeEach(() => {
  listViewHospitals.mockReset()
  listViewHospitals.mockResolvedValue(LIST)
  startAdminView.mockReset()
  startAdminView.mockImplementation(async () => {
    events.push('start')
    return KEY
  })
  stopAdminView.mockReset()
  stopAdminView.mockImplementation(async () => {
    events.push('stop')
  })
  writes = []
  events.length = 0
  assign.mockClear()
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => '',
    set: (text: string) => {
      writes.push(text)
      events.push(`cookie ${text}`)
    },
  })
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', pathname: '/dashboard', assign, reload: vi.fn(), replace: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (document as unknown as Record<string, unknown>).cookie
})

const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect(tokens(el)).toEqual(expect.arrayContaining(classes.split(/\s+/).filter(Boolean)))
const iconInner = (name: IconName) => renderToStaticMarkup(<Icon name={name} />).replace(/^<svg\b[^>]*>|<\/svg>$/g, '')
const opener = () => screen.getByRole('button', { name: '보는 의원' })
const panel = () => screen.getByRole('dialog', { name: '다른 의원 보기' })
const rows = () => within(panel()).queryAllByRole('button')
const row = (name: string) => within(panel()).getByRole('button', { name: new RegExp(`^${name}`) })

async function open(viewing: typeof VIEWING | null = null) {
  const user = userEvent.setup()
  render(<ViewPicker viewing={viewing} />)
  await user.click(opener())
  await waitFor(() => expect(within(panel()).getByText('내 의원')).toBeTruthy())
  return user
}

describe('AC-8006.4 ViewPicker — 단추', () => {
  it('AC-8006.4: 단추 글은 "보는 의원"이고 눈 아이콘 + 글 + 아래 화살표 차례다. 판(dialog)을 여는 단추이고 처음엔 닫혀 있다', () => {
    render(<ViewPicker viewing={null} />)
    const button = opener()
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const [eye, label, chev] = Array.from(button.children)
    expect(button.children).toHaveLength(3)
    expect(eye!.innerHTML).toBe(iconInner('eye'))
    expect(label!.textContent).toBe('보는 의원')
    expect(chev!.innerHTML).toBe(iconInner('chev'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(listViewHospitals).not.toHaveBeenCalled()
  })

  it('AC-8006.4: 평소 모양은 ds.button.secondarySmall, 보는 중에는 accentOutline 모양(켜짐)이다', () => {
    const { rerender } = render(<ViewPicker viewing={null} />)
    hasAll(opener(), ds.button.secondarySmall)
    rerender(<ViewPicker viewing={VIEWING} />)
    hasAll(opener(), ds.button.accentOutlineSmall)
    expect(tokens(opener())).not.toContain('border-line-strong')
  })
})

describe('AC-8006.4 ViewPicker — 판', () => {
  it('AC-8006.4: 누르면 판이 열리고 listViewHospitals()를 한 번 읽는다. 제목·설명·찾기 칸·묶음 이름은 시안 글 그대로다', async () => {
    await open()
    expect(opener().getAttribute('aria-expanded')).toBe('true')
    expect(listViewHospitals).toHaveBeenCalledTimes(1)
    expect(listViewHospitals).toHaveBeenCalledWith()
    expect(within(panel()).getByText('다른 의원 보기')).toBeTruthy()
    expect(within(panel()).getByText('고르면 그 의원 화면을 읽기만 해요. 예약·환자·청구 탭은 보이지 않아요.')).toBeTruthy()
    const find = within(panel()).getByRole('searchbox', { name: '의원 이름으로 찾기' })
    expect(find.getAttribute('placeholder')).toBe('의원 이름으로 찾기')
    expect(document.activeElement).toBe(find)
    expect(within(panel()).getByText('내 의원')).toBeTruthy()
    expect(within(panel()).getByText('다른 의원 4곳')).toBeTruthy()
  })

  it('AC-8006.4: 줄 = 의원 이름 + 오른쪽 지역. 내 의원 한 줄 뒤에 다른 의원이 이름 차례로 온다. 지역은 정한 값 먼저, 없으면 주소에서, 모르면 "지역 모름"', async () => {
    await open()
    expect(rows().map((b) => b.textContent)).toEqual([
      '가나 정형외과의원서울',
      '다라 정형외과의원부산',
      '사아 재활의학과의원경기',
      '자차 정형외과의원지역 모름',
      '카타 정형외과의원지역 모름',
    ])
    const list = within(panel()).getByText('내 의원').parentElement as HTMLElement
    expect(Array.from(list.children).map((el) => el.textContent)).toEqual([
      '내 의원',
      '가나 정형외과의원서울',
      '다른 의원 4곳',
      '다라 정형외과의원부산',
      '사아 재활의학과의원경기',
      '자차 정형외과의원지역 모름',
      '카타 정형외과의원지역 모름',
    ])
  })

  it('AC-8006.4: 보는 중이 아니면 내 의원 줄이 지금 줄(체크 + 파랑 굵게)이다', async () => {
    await open(null)
    expect(row('가나 정형외과의원').getAttribute('aria-current')).toBe('true')
    expect(row('다라 정형외과의원').getAttribute('aria-current')).toBeNull()
    expect(row('가나 정형외과의원').querySelector('svg')!.innerHTML).toBe(iconInner('check'))
    expect(row('다라 정형외과의원').querySelector('svg')).toBeNull()
  })

  it('AC-8006.4: 보는 중이면 그 의원 줄이 체크 + 파랑 굵게(accent-strong 600)이고 단추는 켜짐 모양이다', async () => {
    await open(VIEWING)
    const current = row('다라 정형외과의원')
    expect(current.getAttribute('aria-current')).toBe('true')
    expect(row('가나 정형외과의원').getAttribute('aria-current')).toBeNull()
    expect(current.querySelector('svg')!.innerHTML).toBe(iconInner('check'))
    hasAll(current, 'font-semibold text-accent-strong')
    expect(tokens(row('사아 재활의학과의원'))).not.toContain('text-accent-strong')
    hasAll(row('사아 재활의학과의원'), 'text-ink')
  })

  it('AC-8006.4: 찾기 칸 글자가 든 이름만 남는다(묶음 수는 그대로). 내 의원이 안 맞으면 내 의원 묶음이 없다', async () => {
    const user = await open()
    await user.type(within(panel()).getByRole('searchbox'), '카타')
    expect(rows().map((b) => b.textContent)).toEqual(['카타 정형외과의원지역 모름'])
    expect(within(panel()).queryByText('내 의원')).toBeNull()
    expect(within(panel()).getByText('다른 의원 4곳')).toBeTruthy()
    expect(listViewHospitals).toHaveBeenCalledTimes(1)
  })

  it('AC-8006.4: 찾는 것이 없으면 "찾는 의원이 없어요"', async () => {
    const user = await open()
    await user.type(within(panel()).getByRole('searchbox'), '없는이름')
    expect(within(panel()).getByText('찾는 의원이 없어요')).toBeTruthy()
    expect(rows()).toHaveLength(0)
    expect(within(panel()).getByText('다른 의원 4곳')).toBeTruthy()
  })

  it('AC-8006.4: 내 의원만 맞으면 다른 의원 묶음에 "찾는 의원이 없어요"', async () => {
    const user = await open()
    await user.type(within(panel()).getByRole('searchbox'), '가나')
    expect(rows().map((b) => b.textContent)).toEqual(['가나 정형외과의원서울'])
    expect(within(panel()).getByText('찾는 의원이 없어요')).toBeTruthy()
  })

  it('AC-8006.4: 바깥을 누르면 닫힌다(안쪽 누름은 그대로)', async () => {
    await open()
    fireEvent.pointerDown(within(panel()).getByText('다른 의원 보기'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-8006.4: Esc로 닫히고 초점은 단추로 돌아간다', async () => {
    const user = await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener())
  })

  it('AC-8006.4: 단추를 다시 누르면 닫히고, 또 열면 다시 한 번 읽는다', async () => {
    const user = await open()
    await user.click(opener())
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(opener())
    await waitFor(() => expect(within(panel()).getByText('내 의원')).toBeTruthy())
    expect(listViewHospitals).toHaveBeenCalledTimes(2)
  })

  it('AC-8006.4: 읽기 실패는 판 안 E-VIEW-START 카드이고 목록이 없다(원래 오류 글은 보이지 않는다)', async () => {
    listViewHospitals.mockRejectedValue(new Error('secret detail'))
    const user = userEvent.setup()
    render(<ViewPicker viewing={null} />)
    await user.click(opener())
    const alert = await within(panel()).findByRole('alert')
    expect(alert.textContent).toContain('다른 의원 화면을 열지 못했어요')
    expect(alert.textContent).toContain('오류 번호 E-VIEW-START')
    expect(rows()).toHaveLength(0)
    expect(document.body.textContent).not.toContain('secret detail')
    expect(writes).toEqual([])
  })
})

describe('AC-8006.4·AC-8006.5 ViewPicker — 고르기', () => {
  it('AC-8006.4: 다른 의원을 고르면 확인 창 없이 startAdminView(id) → 받은 열쇠로 보기 쿠키 → /dashboard를 새로 연다', async () => {
    const user = await open()
    await user.click(row('다라 정형외과의원'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
    expect(startAdminView).toHaveBeenCalledTimes(1)
    expect(startAdminView).toHaveBeenCalledWith(DARA)
    expect(events).toEqual(['start', `cookie ${SET}`, 'assign /dashboard'])
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(stopAdminView).not.toHaveBeenCalled()
  })

  it('AC-8006.4: 보는 중에 다른 의원을 고르면 그 의원으로 바로 바꾼다', async () => {
    const user = await open(VIEWING)
    await user.click(row('사아 재활의학과의원'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
    expect(startAdminView).toHaveBeenCalledExactlyOnceWith(SAA)
    expect(writes).toEqual([SET])
  })

  it('AC-8006.4: 시작이 실패하면 판 안 E-VIEW-START 카드이고 쿠키를 쓰지 않고 옮기지 않는다', async () => {
    startAdminView.mockRejectedValue(new Error('secret detail'))
    const user = await open()
    await user.click(row('다라 정형외과의원'))
    const alert = await within(panel()).findByRole('alert')
    expect(alert.textContent).toContain('다른 의원 화면을 열지 못했어요')
    expect(alert.textContent).toContain('오류 번호 E-VIEW-START')
    expect(writes).toEqual([])
    expect(assign).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('secret detail')
  })

  it('AC-8006.4: 시작하는 동안 다른 줄을 눌러도 한 번만 시작한다', async () => {
    let finish: (key: string) => void = () => {}
    startAdminView.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)))
    const user = await open()
    await user.click(row('다라 정형외과의원'))
    await user.click(row('사아 재활의학과의원'))
    expect(startAdminView).toHaveBeenCalledTimes(1)
    await act(async () => finish(KEY))
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1))
  })

  it('AC-8006.5: 보는 중에 내 의원 줄을 고르면 [내 의원으로]와 같다 — stopAdminView() 한 번 → 쿠키 지움 → /dashboard', async () => {
    const user = await open(VIEWING)
    await user.click(row('가나 정형외과의원'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
    expect(stopAdminView).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['stop', `cookie ${CLEAR}`, 'assign /dashboard'])
    expect(startAdminView).not.toHaveBeenCalled()
  })

  it('AC-8006.5: 보는 중에 내 의원 줄을 고르면 stopAdminView()가 실패해도 쿠키를 지우고 /dashboard로 간다', async () => {
    stopAdminView.mockRejectedValue(new Error('down'))
    const user = await open(VIEWING)
    await user.click(row('가나 정형외과의원'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
    expect(writes).toEqual([CLEAR])
  })

  it('AC-8006.4: 보는 중이 아니면 내 의원 줄은 닫기만 한다(부르기·쿠키·옮기기 없음)', async () => {
    const user = await open(null)
    await user.click(row('가나 정형외과의원'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(startAdminView).not.toHaveBeenCalled()
    expect(stopAdminView).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    expect(assign).not.toHaveBeenCalled()
  })

  it('AC-8006.4: 지금 보는 의원 줄을 다시 고르면 닫기만 한다(본 기록을 새로 남기지 않는다)', async () => {
    const user = await open(VIEWING)
    await user.click(row('다라 정형외과의원'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(startAdminView).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('AC-8006.4·AC-8006.7 ViewPicker — 모양(시안 .vp, 토큰만)', () => {
  it('AC-8006.4: 판은 계정 메뉴와 같은 떠 있는 층(ds.layer) · 폭 320 · 안쪽 4 · 단추 오른쪽 끝 아래', async () => {
    await open()
    hasAll(panel(), `${ds.layer} absolute top-full right-0 z-20 mt-1 w-80 p-1`)
  })

  it('AC-8006.4: 찾기 칸 36px · 목록 최대 340px 안에서 내림 · 줄 36px · 묶음 이름 caption 500 muted · 지역 caption muted', async () => {
    await open()
    hasAll(within(panel()).getByRole('searchbox'), 'h-9 w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-muted')
    const list = within(panel()).getByText('내 의원').parentElement as HTMLElement
    hasAll(list, 'max-h-85 overflow-y-auto border-t border-line pt-1')
    hasAll(within(panel()).getByText('내 의원'), 'px-3 pt-2 pb-1 text-caption font-medium text-muted')
    for (const b of rows()) hasAll(b, 'flex h-9 w-full items-center gap-2 rounded-control px-3 text-left text-body hover:bg-canvas')
    hasAll(within(row('다라 정형외과의원')).getByText('부산'), 'shrink-0 text-caption text-muted')
    hasAll(within(row('다라 정형외과의원')).getByText('다라 정형외과의원'), 'min-w-0 flex-1 truncate')
  })

  it('AC-8006.4: 제목 small 600 ink · 설명 caption muted · 찾는 것 없음 small muted', async () => {
    const user = await open()
    hasAll(within(panel()).getByText('다른 의원 보기'), 'text-small font-semibold text-ink')
    hasAll(within(panel()).getByText('고르면 그 의원 화면을 읽기만 해요. 예약·환자·청구 탭은 보이지 않아요.'), 'text-caption text-muted')
    await user.type(within(panel()).getByRole('searchbox'), '없는이름')
    hasAll(within(panel()).getByText('찾는 의원이 없어요'), 'text-small text-muted')
  })

  it('AC-8006.7: 소스에 폰 전용 모양(max-md:)·임의 색이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/shell/ViewPicker.tsx'), 'utf8')
    expect(source).not.toContain('max-md:')
    expect(source).not.toMatch(/\[#|\b(?:rgba?|hsla?|oklch|color-mix)\(/)
  })
})
