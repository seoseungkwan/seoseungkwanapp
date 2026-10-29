// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ui } from '@/components/ui/classes'
import { AdminError } from '@/lib/auth/admin'
import { errorInfo } from '@/lib/errors'
import { AdminApplications } from './AdminApplications'

// 관리자 · 가입 신청 목록 (REQ-007, design.md '관리자', UI_GUIDE '앱 화면' 화면 안 탭·표·칩·확인 창·폰).
// 문구·순서는 목업 docs/mockups/auth/Admin.dc.html. 실제 Supabase에 붙지 않는다 — 진짜 listApplications·setHospitalStatus를 거쳐
// hospitals 읽기와 set_hospital_status 호출이 어떤 값으로 몇 번 나가는지만 본다. jsdom은 CSS를 계산하지 않는다 → 모양은 클래스로 본다
const { from, select, order, rpc } = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  return { order, select, from: vi.fn(() => ({ select })), rpc: vi.fn() }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ from, rpc }) }))

const RAW = 'permission denied for function set_hospital_status secret-detail'
// DB가 신청일 내림차순으로 준다(order는 listApplications가 건다)
const DB_ROWS = [
  { id: 'r1', name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01000001234', email: 'manager@example.com', status: 'pending', created_at: '2026-10-28T01:00:00+00:00' },
  { id: 'r2', name: '다라 통증의학과의원', applicant_name: '김철수', phone: null, email: 'chulsoo@example.com', status: 'pending', created_at: '2026-10-26T16:30:00+00:00' },
  { id: 'r4', name: '사아 의원', applicant_name: '박민수', phone: null, email: 'minsu@example.com', status: 'rejected', created_at: '2026-10-22T03:00:00+00:00' },
  { id: 'r3', name: '마바 정형외과의원', applicant_name: '이영희', phone: '0212345678', email: 'younghee@example.com', status: 'approved', created_at: '2026-10-20T03:00:00+00:00' },
]
const COLUMNS = ['신청일', '병원 이름', '신청자', '이메일', '연락처', '동작']
const INTRO = '승인하면 그 계정은 바로 대시보드를 쓸 수 있습니다. 거절한 신청은 거절 탭에서 되돌릴 수 있습니다.'
const CONFIRM_BODY = '거절하면 이 계정은 대시보드를 쓸 수 없습니다. 거절 탭에서 언제든 되돌릴 수 있습니다.'

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}

const tablist = () => screen.getByRole('tablist', { name: '신청 상태' })
const tabNamed = (label: '대기' | '승인' | '거절') => screen.getByRole('tab', { name: new RegExp(`^${label} \\d+$`) })
const tabNames = () => within(tablist()).getAllByRole('tab').map((t) => t.textContent?.replace(/\s+/g, ' ').trim())
const table = () => screen.getByRole('table')
const bodyRows = () => within(table()).getAllByRole('row').slice(1) // 첫 줄은 머리
const rowOf = (clinic: string) => {
  const tr = screen.getByRole('cell', { name: clinic }).closest('tr')
  if (tr === null) throw new Error(`${clinic} 줄 없음`)
  return tr
}
const cellTexts = (tr: HTMLElement) => within(tr).getAllByRole('cell').map((c) => c.textContent)
const actionCell = (tr: HTMLElement) => within(tr).getAllByRole('cell')[5]
const dialog = () => screen.getByRole('dialog', { name: '이 신청을 거절할까요?' })
const status = () => screen.getByRole('status')

async function renderLoaded() {
  const user = userEvent.setup()
  render(<AdminApplications />)
  await screen.findByRole('tablist', { name: '신청 상태' })
  return user
}

beforeEach(() => {
  order.mockReset()
  order.mockResolvedValue({ data: DB_ROWS, error: null, status: 200 })
  select.mockClear()
  from.mockClear()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null, status: 204 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AdminApplications: 처음 그리기', () => {
  it('AC-007.1: 제목·안내는 목업 그대로, 탭 줄(대기·승인·거절)마다 줄 수 칩, 처음 탭은 대기', async () => {
    await renderLoaded()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('가입 신청')
    expect(screen.getByText(INTRO)).toBeTruthy()
    expect(tabNames()).toEqual(['대기 2', '승인 1', '거절 1'])
    expect(tabNamed('대기').getAttribute('aria-selected')).toBe('true')
    expect(tabNamed('승인').getAttribute('aria-selected')).toBe('false')
    expect(tabNamed('거절').getAttribute('aria-selected')).toBe('false')
  })

  it('AC-007.1: 표 칸은 신청일·병원 이름·신청자·이메일·연락처·동작, 대기 줄만 받은 순서(신청일 내림차순)로', async () => {
    await renderLoaded()
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(COLUMNS)
    expect(table().getAttribute('aria-label')).toBe('대기 신청')
    expect(bodyRows().map((tr) => cellTexts(tr).slice(0, 5))).toEqual([
      ['2026-10-28', '가나 정형외과의원', '홍길동', 'manager@example.com', '010-0000-1234'],
      ['2026-10-27', '다라 통증의학과의원', '김철수', 'chulsoo@example.com', '—'], // 신청일은 한국 날짜, 빈 연락처는 "—"
    ])
  })

  it('AC-007.1: 탭 패널은 지금 탭과 이어진다(tab ↔ tabpanel)', async () => {
    await renderLoaded()
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tabNamed('대기').id)
    expect(tabNamed('대기').getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.contains(table())).toBe(true)
  })

  it('AC-007.1: 목록은 브라우저에서 한 번 읽는다(hospitals, RLS로 관리자는 전체). 읽는 동안에는 탭·표를 그리지 않는다', async () => {
    let resolve: (v: unknown) => void = () => {}
    order.mockReturnValue(new Promise((r) => (resolve = r)))
    const { container } = render(<AdminApplications />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('가입 신청')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
    await act(async () => resolve({ data: DB_ROWS, error: null, status: 200 }))
    expect(tablist()).toBeTruthy()
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('false')
    expect(from).toHaveBeenCalledExactlyOnceWith('hospitals')
    expect(order).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-007.1: 목록을 읽지 못하면 그리기를 멈추고 던진다 → 화면 오류(app/error.tsx, E-PAGE-FAILED)가 [다시 시도]와 함께 안내', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    order.mockResolvedValue({ data: null, error: { code: '42501', message: RAW }, status: 403 })
    let caught: unknown = null
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch(error: unknown) {
        caught = error
      }
      render() {
        return this.state.failed ? <p>오류 화면</p> : this.props.children
      }
    }
    render(
      <Boundary>
        <AdminApplications />
      </Boundary>,
    )
    expect(await screen.findByText('오류 화면')).toBeTruthy()
    expect(caught).toBeInstanceOf(AdminError)
    expect(document.body.textContent).not.toContain('secret-detail')
  })

  it('AC-007.1: 탭을 누르면 그 탭 줄만 보이고 aria-selected가 옮겨 간다', async () => {
    const user = await renderLoaded()
    await user.click(tabNamed('승인'))
    expect(tabNamed('승인').getAttribute('aria-selected')).toBe('true')
    expect(tabNamed('대기').getAttribute('aria-selected')).toBe('false')
    expect(table().getAttribute('aria-label')).toBe('승인 신청')
    expect(bodyRows().map((tr) => cellTexts(tr).slice(0, 5))).toEqual([
      ['2026-10-20', '마바 정형외과의원', '이영희', 'younghee@example.com', '02-1234-5678'],
    ])
    await user.click(tabNamed('거절'))
    expect(bodyRows().map((tr) => cellTexts(tr)[1])).toEqual(['사아 의원'])
  })

  it('AC-007.1: 탭 줄은 키보드로 옮긴다 — ←·→(끝에서 돌아감)·Home·End, 지금 탭만 Tab 순서에 든다', async () => {
    const user = await renderLoaded()
    const tabIndexes = () => within(tablist()).getAllByRole('tab').map((t) => t.getAttribute('tabindex'))
    expect(tabIndexes()).toEqual(['0', '-1', '-1'])
    tabNamed('대기').focus()
    await user.keyboard('{ArrowRight}')
    expect(tabNamed('승인').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabNamed('승인'))
    expect(tabIndexes()).toEqual(['-1', '0', '-1'])
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(tabNamed('대기'))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(tabNamed('거절'))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(tabNamed('대기'))
    await user.keyboard('{End}')
    expect(tabNamed('거절').getAttribute('aria-selected')).toBe('true')
  })

  it('AC-007.1·AC-013.2: 앱 틀을 한 번 더 그리지 않는다 — 위쪽 띠·탭 띠·<main>·.app-ui는 (app)/layout 몫', async () => {
    await renderLoaded()
    const html = document.body.innerHTML
    for (const mark of [/<main\b/, /<header\b/, /<nav\b/, /\bapp-ui\b/]) expect(html).not.toMatch(mark)
  })
})

describe('AdminApplications: 승인', () => {
  it('AC-007.2: [승인] → set_hospital_status(id, approved) 한 번, 성공하면 줄이 승인 탭으로 옮겨지고 완료 줄을 보인다', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_status', { p_hospital_id: 'r1', p_status: 'approved' })
    expect(status().textContent).toBe('가나 정형외과의원 신청을 승인했습니다.')
    expect(tabNames()).toEqual(['대기 1', '승인 2', '거절 1'])
    expect(bodyRows().map((tr) => cellTexts(tr)[1])).toEqual(['다라 통증의학과의원'])
    await user.click(tabNamed('승인'))
    expect(bodyRows().map((tr) => cellTexts(tr)[1])).toEqual(['가나 정형외과의원', '마바 정형외과의원'])
    expect(status().textContent).toBe('') // 탭을 바꾸면 완료 줄은 지운다(목업). 자리(role=status)는 남는다
    expect(screen.queryByRole('dialog')).toBeNull() // 승인은 확인 창 없이 바로
  })

  it('AC-007.2: 보내는 동안 동작 단추는 막히고(두 번 보내지 않음), 끝나면 풀린다', async () => {
    let resolve: (v: unknown) => void = () => {}
    rpc.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = await renderLoaded()
    const approve = within(rowOf('가나 정형외과의원')).getByRole<HTMLButtonElement>('button', { name: '승인' })
    await user.click(approve)
    const buttons = within(table()).getAllByRole<HTMLButtonElement>('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b.disabled, b.textContent ?? '').toBe(true)
    await user.click(approve)
    expect(rpc).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ data: null, error: null, status: 204 }))
    for (const b of within(table()).getAllByRole<HTMLButtonElement>('button')) expect(b.disabled).toBe(false)
  })
})

describe('AdminApplications: 완료 알림 자리와 초점', () => {
  it('AC-007.2: 완료 줄 자리(role="status")는 처음부터 늘 있고 글만 바뀐다 — 화면 읽기가 새 글을 놓치지 않는다. 비었을 때는 자리를 차지하지 않는다', async () => {
    const user = await renderLoaded()
    const region = status()
    expect(region.textContent).toBe('')
    hasAll(region, 'empty:sr-only')
    hasNone(region, 'empty:hidden hidden')
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    expect(status()).toBe(region)
    expect(region.textContent).toBe('가나 정형외과의원 신청을 승인했습니다.')
    await user.click(tabNamed('승인'))
    expect(status()).toBe(region)
    expect(region.textContent).toBe('')
    expect(region.childNodes).toHaveLength(0) // :empty — 체크 아이콘도 남지 않는다
  })

  it('AC-007.2·AC-007.3·AC-007.4: 바꾸기가 끝나면 초점은 지금 탭으로 간다(누른 단추의 줄이 다른 탭으로 옮겨져 사라져도 초점이 문서 처음으로 떨어지지 않는다)', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    expect(document.activeElement).toBe(tabNamed('대기'))
    await user.click(within(rowOf('다라 통증의학과의원')).getByRole('button', { name: '거절' }))
    await user.click(within(dialog()).getByRole('button', { name: '거절' }))
    expect(document.activeElement).toBe(tabNamed('대기'))
    await user.click(tabNamed('거절'))
    await user.click(within(rowOf('사아 의원')).getByRole('button', { name: '되돌리기' }))
    expect(document.activeElement).toBe(tabNamed('거절'))
  })

  it('AC-007.2: 보내는 동안 다른 탭으로 옮겼으면, 끝난 뒤 초점은 그때의 지금 탭으로 간다', async () => {
    let finish: (value: unknown) => void = () => {}
    rpc.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    await user.click(tabNamed('거절'))
    await act(async () => finish({ data: null, error: null, status: 204 }))
    expect(document.activeElement).toBe(tabNamed('거절'))
  })

  it('AC-007.6: 실패하면 초점은 처음 누른 단추로 돌아온다(줄이 그대로라 단추도 그대로 있다)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: RAW }, status: 403 })
    const user = await renderLoaded()
    const approve = within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' })
    await user.click(approve)
    expect(document.activeElement).toBe(approve)
    const opener = within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' })
    await user.click(opener)
    await user.click(within(dialog()).getByRole('button', { name: '거절' }))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-ADMIN-FAILED')
    expect(document.activeElement).toBe(opener)
  })
})

describe('AdminApplications: 거절 확인 창', () => {
  it('AC-007.3: [거절] → 먼저 확인 창(dialog·aria-modal)에 신청 내용과 목업 문구, 처음 초점은 [취소]. 아직 함수를 부르지 않는다', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    const d = dialog()
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(within(d).getByText('가나 정형외과의원')).toBeTruthy()
    expect(within(d).getByText('홍길동 · manager@example.com')).toBeTruthy()
    expect(within(d).getByText(CONFIRM_BODY)).toBeTruthy()
    expect(within(d).getAllByRole('button').map((b) => b.textContent)).toEqual(['취소', '거절'])
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: '취소' }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-007.3: [취소]면 아무것도 안 한다 — 창이 닫히고 줄은 그대로, 초점은 누른 [거절]로 돌아간다', async () => {
    const user = await renderLoaded()
    const opener = within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' })
    await user.click(opener)
    await user.click(within(dialog()).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(tabNames()).toEqual(['대기 2', '승인 1', '거절 1'])
    expect(status().textContent).toBe('')
    expect(document.activeElement).toBe(opener)
  })

  it('AC-007.3: Esc는 [취소]와 같다', async () => {
    const user = await renderLoaded()
    const opener = within(rowOf('다라 통증의학과의원')).getByRole('button', { name: '거절' })
    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(opener)
  })

  it('AC-007.3: 창 안에서 Tab은 두 단추 사이만 돈다(뒤 화면으로 나가지 않는다)', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    const [cancel, confirm] = within(dialog()).getAllByRole('button')
    await user.tab()
    expect(document.activeElement).toBe(confirm)
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('AC-007.3: 창 안 빈 곳(글자)을 눌러도 초점은 창에 남고(창 tabIndex=-1), 그 뒤 Tab·Shift+Tab도 창 밖으로 나가지 않는다', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    const d = dialog()
    expect(d.getAttribute('tabindex')).toBe('-1')
    const [cancel, confirm] = within(d).getAllByRole('button')
    await user.click(within(d).getByText(CONFIRM_BODY))
    expect(d.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
    await user.click(within(d).getByText(CONFIRM_BODY))
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    // 창에 초점이 와도 고리를 그리지 않는다(누른 자리일 뿐 조작 요소가 아니다)
    hasAll(d, 'outline-hidden')
  })

  it('AC-007.3: 창의 [거절]이면 rejected로 바꾸고, 줄이 거절 탭으로 옮겨지고 완료 줄을 보인다', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('다라 통증의학과의원')).getByRole('button', { name: '거절' }))
    await user.click(within(dialog()).getByRole('button', { name: '거절' }))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_status', { p_hospital_id: 'r2', p_status: 'rejected' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(status().textContent).toBe('다라 통증의학과의원 신청을 거절했습니다.')
    expect(tabNames()).toEqual(['대기 1', '승인 1', '거절 2'])
    await user.click(tabNamed('거절'))
    expect(bodyRows().map((tr) => cellTexts(tr)[1])).toEqual(['다라 통증의학과의원', '사아 의원'])
  })
})

describe('AdminApplications: 되돌리기·승인 줄', () => {
  it('AC-007.4: 거절 줄의 [되돌리기] → pending으로 바꾸고 "○○ 신청을 대기로 되돌렸습니다."', async () => {
    const user = await renderLoaded()
    await user.click(tabNamed('거절'))
    const row = rowOf('사아 의원')
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['되돌리기'])
    await user.click(within(row).getByRole('button', { name: '되돌리기' }))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_status', { p_hospital_id: 'r4', p_status: 'pending' })
    expect(status().textContent).toBe('사아 의원 신청을 대기로 되돌렸습니다.')
    expect(tabNames()).toEqual(['대기 3', '승인 1', '거절 0'])
    expect(screen.queryByRole('dialog')).toBeNull() // 되돌리기는 확인 창 없이 바로
  })

  it('AC-007.4: 승인 줄에는 동작 단추가 없고 "승인됨" 완료 칩만 있다', async () => {
    const user = await renderLoaded()
    await user.click(tabNamed('승인'))
    const cell = actionCell(rowOf('마바 정형외과의원'))
    expect(within(cell).queryAllByRole('button')).toEqual([])
    const chip = within(cell).getByText('승인됨')
    hasAll(chip, ui.chip.done)
    expect(chip.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-007.2·AC-007.4: 대기 줄은 [승인]·[거절] 두 단추(그 순서)', async () => {
    await renderLoaded()
    expect(within(rowOf('가나 정형외과의원')).getAllByRole('button').map((b) => b.textContent)).toEqual(['승인', '거절'])
  })
})

describe('AdminApplications: 빈 탭', () => {
  it.each([
    ['대기', [], '대기 중인 신청이 없습니다', '새 가입 신청이 오면 여기에 보입니다.'],
    ['승인', DB_ROWS.filter((r) => r.status !== 'approved'), '승인한 신청이 없습니다', '승인한 계정이 여기에 모입니다.'],
    ['거절', DB_ROWS.filter((r) => r.status !== 'rejected'), '거절한 신청이 없습니다', '거절한 신청은 여기에서 되돌릴 수 있습니다.'],
  ] as const)('AC-007.5: %s 탭이 비면 표 머리는 두고 칸 전체를 잇는 한 줄에 목업 안내', async (label, data, title, body) => {
    order.mockResolvedValue({ data, error: null, status: 200 })
    const user = await renderLoaded()
    await user.click(tabNamed(label))
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(COLUMNS)
    const rows = bodyRows()
    expect(rows).toHaveLength(1)
    const cells = within(rows[0]).getAllByRole('cell')
    expect(cells).toHaveLength(1)
    expect(cells[0].getAttribute('colspan')).toBe('6')
    expect(cells[0].textContent).toContain(title)
    expect(cells[0].textContent).toContain(body)
    // 제목과 설명은 한 문장으로 이어지지 않게 따로 줄(블록)로 — 목업처럼 <p> 둘
    expect([...cells[0].querySelectorAll('p')].map((el) => el.textContent)).toEqual([title, body])
    expect([...cells[0].childNodes].every((n) => n.nodeType !== Node.TEXT_NODE)).toBe(true)
    hasAll(cells[0], ui.table.emptyRow)
    expect(within(table()).queryAllByRole('button')).toEqual([])
  })
})

describe('AdminApplications: 함수 호출 실패', () => {
  it('AC-007.6: [승인]이 실패하면 줄 상태는 그대로이고 E-ADMIN-FAILED 카드를 보인다(원래 오류 문구 없음)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: RAW }, status: 403 })
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    const card = screen.getByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-ADMIN-FAILED').what)
    expect(card.textContent).toContain('오류 번호 E-ADMIN-FAILED')
    expect(document.body.textContent).not.toContain('secret-detail')
    expect(status().textContent).toBe('')
    expect(tabNames()).toEqual(['대기 2', '승인 1', '거절 1'])
    expect(bodyRows().map((tr) => cellTexts(tr)[1])).toEqual(['가나 정형외과의원', '다라 통증의학과의원'])
    expect(rpc).toHaveBeenCalledTimes(1) // 저절로 다시 보내지 않는다
  })

  it('AC-007.6: 카드는 완료 줄과 같은 자리(탭 줄과 표 사이), 다시 눌러 성공하면 카드가 완료 줄로 바뀐다', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: RAW }, status: 0 })
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    const card = screen.getByRole('alert')
    expect(tablist().compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(table()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(status().textContent).toBe('가나 정형외과의원 신청을 승인했습니다.')
    expect(tablist().compareDocumentPosition(status()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(status().compareDocumentPosition(table()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-007.6: 거절·되돌리기가 실패해도 줄은 그대로, 창은 닫히고 E-ADMIN-FAILED 카드', async () => {
    rpc.mockRejectedValue(new Error(`fetch failed ${RAW}`))
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    await user.click(within(dialog()).getByRole('button', { name: '거절' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-ADMIN-FAILED')
    expect(tabNames()).toEqual(['대기 2', '승인 1', '거절 1'])

    await user.click(tabNamed('거절'))
    expect(screen.queryByRole('alert')).toBeNull() // 탭을 바꾸면 카드도 지운다
    await user.click(within(rowOf('사아 의원')).getByRole('button', { name: '되돌리기' }))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-ADMIN-FAILED')
    expect(tabNames()).toEqual(['대기 2', '승인 1', '거절 1'])
    expect(document.body.textContent).not.toContain('secret-detail')
  })
})

describe('AdminApplications: 폰(768px 미만)', () => {
  it('AC-007.7: 표 머리를 숨기고, 표는 옆으로 밀지 않고 줄을 세로로 쌓는다', async () => {
    await renderLoaded()
    const thead = table().querySelector('thead')
    expect(thead).not.toBeNull()
    hasAll(thead as Element, 'max-md:hidden')
    hasAll(table(), 'max-md:block')
    hasAll(table().querySelector('tbody') as Element, 'max-md:flex max-md:flex-col max-md:gap-3')
    hasAll(table().parentElement as Element, `${ui.table.wrap} max-md:overflow-visible`)
  })

  it('AC-007.7: 줄마다 카드처럼(흰 바탕·1px 선·6px) 병원 이름·신청자·이메일·연락처·신청일 / 상태 칩 / 단추 순서로 쌓는다', async () => {
    await renderLoaded()
    const tr = rowOf('가나 정형외과의원')
    hasAll(tr, 'max-md:flex max-md:flex-col max-md:rounded-card max-md:border max-md:border-line max-md:bg-surface max-md:p-4')
    const [date, clinic, applicant, email, phone, action] = within(tr).getAllByRole('cell')
    // DOM 순서는 PC 칸 순서(신청일 먼저) → 폰은 order로 신청일을 연락처 뒤, 동작 칸을 맨 끝으로
    hasAll(date, 'max-md:order-1')
    hasAll(action, 'max-md:order-2')
    for (const c of [clinic, applicant, email, phone]) expect(classesOf(c).some((t) => t.startsWith('max-md:order-'))).toBe(false)
    hasAll(clinic, 'max-md:text-body max-md:font-semibold')
    for (const c of [date, clinic, applicant, email, phone, action]) hasAll(c, 'max-md:whitespace-normal max-md:border-b-0')
    hasAll(email, 'max-md:break-all') // 긴 이메일도 가로 스크롤 없이
    // 칸 이름은 폰에서만 값 앞에 보인다(PC는 표 머리)
    expect([date, applicant, email, phone].map((c) => c.getAttribute('data-label'))).toEqual(['신청일', '신청자', '이메일', '연락처'])
    for (const c of [date, applicant, email, phone]) hasAll(c, 'max-md:before:content-[attr(data-label)] max-md:before:text-muted')
  })

  it('AC-007.7: 대기·거절 줄은 폰에서 상태 칩(대기·거절됨)을 보이고, PC에서는 숨긴다(탭이 상태다)', async () => {
    const user = await renderLoaded()
    const waiting = within(actionCell(rowOf('가나 정형외과의원'))).getByText('대기')
    hasAll(waiting, `${ui.chip.waiting} md:hidden`)
    await user.click(tabNamed('거절'))
    const rejected = within(actionCell(rowOf('사아 의원'))).getByText('거절됨')
    hasAll(rejected, `${ui.chip.rejected} md:hidden`)
    await user.click(tabNamed('승인'))
    const done = within(actionCell(rowOf('마바 정형외과의원'))).getByText('승인됨')
    hasNone(done, 'md:hidden') // 승인됨은 PC에서도 동작 칸에 보인다
  })

  it('AC-007.7·AC-013.4: 동작 단추는 폰에서 전체 폭으로 나란히, 높이 44px(max-md:h-11)', async () => {
    const user = await renderLoaded()
    const action = actionCell(rowOf('가나 정형외과의원'))
    hasAll(action, 'max-md:flex max-md:flex-col max-md:gap-3')
    for (const b of within(action).getAllByRole('button')) hasAll(b, 'max-md:h-11 max-md:flex-1')
    hasAll(within(action).getByRole('button', { name: '승인' }).parentElement as Element, 'flex gap-2')
    await user.click(tabNamed('거절'))
    hasAll(within(rowOf('사아 의원')).getByRole('button', { name: '되돌리기' }), 'max-md:h-11 max-md:flex-1')
  })

  it('AC-007.7·AC-013.4: 화면 안 탭은 폰에서 높이 44px, 제목은 title-sm', async () => {
    await renderLoaded()
    for (const t of within(tablist()).getAllByRole('tab')) hasAll(t, 'max-md:h-11')
    hasAll(screen.getByRole('heading', { level: 1 }), 'text-title max-md:text-title-sm font-semibold text-ink')
  })

  it('AC-007.7·AC-013.4: 확인 창 단추는 폰에서 나란히 반씩(44px)', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    for (const b of within(dialog()).getAllByRole('button')) hasAll(b, 'max-md:h-11 max-md:flex-1')
  })
})

describe('AdminApplications: 모양 (UI_GUIDE 앱 화면)', () => {
  it('AC-007.1·AC-013.3: 화면 안 탭 — 같은 밑줄 모양(40px·body), 지금 탭 accent 700 + 3px 밑줄, 나머지 ink-2 500, 개수는 범주 칩', async () => {
    await renderLoaded()
    hasAll(tablist(), 'flex border-b border-line')
    const current = tabNamed('대기')
    hasAll(current, 'h-10 text-body font-bold text-accent after:absolute after:bottom-0 after:h-0.75 after:bg-accent')
    hasAll(current, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    for (const idle of [tabNamed('승인'), tabNamed('거절')]) {
      hasAll(idle, 'h-10 text-body font-medium text-ink-2 hover:text-ink')
      hasNone(idle, 'text-accent font-bold after:bg-accent')
    }
    for (const t of within(tablist()).getAllByRole('tab')) hasAll(t.querySelector('span:last-child') as Element, ui.chip.neutral)
  })

  it('AC-013.3: 표는 ui.table(머리 th·칸 td, 보조 칸은 ink-2), 표는 패널(흰 바탕·1px 선·6px) 안에 있다', async () => {
    await renderLoaded()
    hasAll(table(), ui.table.table)
    for (const th of within(table()).getAllByRole('columnheader')) hasAll(th, ui.table.th)
    const [date, clinic, applicant, email, phone, action] = within(rowOf('가나 정형외과의원')).getAllByRole('cell')
    for (const c of [date, email, phone]) hasAll(c, ui.table.tdSub)
    for (const c of [clinic, applicant, action]) hasAll(c, ui.table.td)
    hasAll(rowOf('가나 정형외과의원'), ui.table.row)
    hasAll(screen.getByRole('tabpanel'), ui.panel)
  })

  it('AC-007.1·AC-013.3: PC 표는 칸 폭을 정해 둔다(table-fixed) — 승인으로 줄이 바뀌거나 탭이 비어도 칸 자리가 움직이지 않는다', async () => {
    const user = await renderLoaded()
    const widths = () =>
      within(table()).getAllByRole('columnheader').map((th) => classesOf(th).filter((t) => /^(max-|md:)?w-/.test(t)))
    // 신청일·신청자·연락처·동작은 정한 폭, 병원 이름·이메일은 남은 폭을 반씩
    const FIXED = [['w-28'], [], ['w-28'], [], ['w-32'], ['w-36']]
    hasAll(table(), 'md:table-fixed md:min-w-250')
    expect(widths()).toEqual(FIXED)
    // 정한 폭이 없는 두 칸은 PC에서 넘치면 말줄임(옆 칸을 덮지 않는다). 폰은 줄바꿈 그대로
    const cells = within(rowOf('가나 정형외과의원')).getAllByRole('cell')
    for (const c of [cells[1], cells[2], cells[3]]) hasAll(c, 'md:truncate')
    // 말줄임으로 잘려도 전체 값은 마우스를 올리면 보인다(title)
    expect([cells[1], cells[2], cells[3]].map((c) => c.getAttribute('title'))).toEqual(['가나 정형외과의원', '홍길동', 'manager@example.com'])
    // 빈 탭에서도 머리 폭은 같다
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    await user.click(within(rowOf('다라 통증의학과의원')).getByRole('button', { name: '승인' }))
    expect(bodyRows()).toHaveLength(1)
    expect(widths()).toEqual(FIXED)
    hasAll(table(), 'md:table-fixed')
  })

  it('AC-013.3: 표 안 단추 — [승인] 주(small), [거절]·[되돌리기] 보조(small)', async () => {
    const user = await renderLoaded()
    const row = rowOf('가나 정형외과의원')
    hasAll(within(row).getByRole('button', { name: '승인' }), ui.button.primarySmall)
    hasAll(within(row).getByRole('button', { name: '거절' }), ui.button.secondarySmall)
    await user.click(tabNamed('거절'))
    hasAll(within(rowOf('사아 의원')).getByRole('button', { name: '되돌리기' }), ui.button.secondarySmall)
  })

  it('AC-013.3: 완료 줄은 table·ok 글자 + 체크 아이콘(꾸밈)', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    hasAll(status(), 'flex items-center text-table text-ok')
    expect(status().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-013.3: 확인 창 — 떠 있는 층(ui.layer, shadow-float)·폭 400px·안쪽 24px, 뒤 가림막 ink 36%, [취소] 보조·[거절] 위험, 오른쪽 끝', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    const d = dialog()
    hasAll(d, `${ui.layer} w-full max-w-100 p-6`)
    hasAll(d.parentElement as Element, 'fixed inset-0 bg-ink/36 flex items-center justify-center')
    hasAll(within(d).getByRole('heading', { name: '이 신청을 거절할까요?' }), 'text-lead font-semibold text-ink')
    hasAll(within(d).getByText(CONFIRM_BODY), 'text-body text-ink-2')
    const [cancel, confirm] = within(d).getAllByRole('button')
    hasAll(cancel, ui.button.secondary)
    hasAll(confirm, ui.button.danger)
    hasAll(cancel.parentElement as Element, 'flex justify-end gap-2')
  })

  it('AC-013.3: 그림자는 확인 창 하나에만, accent는 지금 탭(글자·밑줄)과 초점 고리에만', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    const all = Array.from(document.body.querySelectorAll('*'))
    const withShadow = all.filter((el) => classesOf(el).some((t) => t.split(':').pop()?.startsWith('shadow')))
    expect(withShadow).toEqual([dialog()])
    const isFocus = (t: string) => t.split(':').some((v) => v === 'focus-visible' || v === 'focus' || v === 'focus-within')
    const withAccent = all.filter((el) => classesOf(el).some((t) => !isFocus(t) && /accent/.test(t)))
    expect(withAccent).toEqual([tabNamed('대기')])
  })
})

describe('AdminApplications: 읽기 결과를 기다린다', () => {
  it('AC-007.1: 화면을 떠난 뒤 목록이 와도 오류 없이 무시한다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolve: (v: unknown) => void = () => {}
    order.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = render(<AdminApplications />)
    unmount()
    await act(async () => resolve({ data: DB_ROWS, error: null, status: 200 }))
    await waitFor(() => expect(order).toHaveBeenCalledTimes(1))
    expect(error).not.toHaveBeenCalled()
  })
})
