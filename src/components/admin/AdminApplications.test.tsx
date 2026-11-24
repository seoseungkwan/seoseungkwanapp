// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ViewingProvider } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { SIDO_LIST } from '@/lib/admin/region'
import { AdminError } from '@/lib/auth/admin'
import { AdminViewError } from '@/lib/auth/adminView'
import { AdminSyncError } from '@/lib/auth/adminSync'
import { errorInfo } from '@/lib/errors'
import { nestedBoxes } from '@/testing/boxes'
import { AdminApplications } from './AdminApplications'

// 관리자 · 가입 승인 (REQ-007, ui-90 REQ-417, design.md '관리자', UI_GUIDE '관리자' 화면 안 탭·표·칩·확인 창·폰).
// 순서는 목업 docs/mockups/auth/Admin.dc.html, 이름·문구(~요)는 ui-90 시안 docs/mockups/ui-90/app/gen.py admin_body. 실제 Supabase에 붙지 않는다 — 진짜 listApplications·setHospitalStatus를 거쳐
// hospitals 읽기와 set_hospital_status 호출이 어떤 값으로 몇 번 나가는지만 본다. jsdom은 CSS를 계산하지 않는다 → 모양은 클래스로 본다
const { from, select, order, rpc, marksRpc, viewRpc, uploadRpc, setViewKey } = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  return { order, select, from: vi.fn(() => ({ select })), rpc: vi.fn(), marksRpc: vi.fn(), viewRpc: vi.fn(), uploadRpc: vi.fn(), setViewKey: vi.fn() }
})
// rpc 흉내는 이름으로 나눠 답한다(multi-admin design.md '시험 계획'): 관리자 표시 읽기 admin_hospitals → marksRpc,
// 보기 목록 읽기 admin_view_hospitals → viewRpc(admin-view AC-8012.5), 저절로 올림 상태 읽기 admin_auto_upload_list → uploadRpc(AC-8022.5),
// 바꾸기(set_hospital_status·set_admin·set_hospital_region·set_auto_upload_months)와 보기 시작(start_admin_view) → rpc. 그래서 rpc를 세는 시험은 바꾸기·시작 부르기만 센다
const READS: Record<string, typeof rpc> = { admin_hospitals: marksRpc, admin_view_hospitals: viewRpc, admin_auto_upload_list: uploadRpc }
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from,
    rpc: (name: string, ...args: unknown[]) => (READS[name] ?? rpc)(name, ...args),
  }),
}))
// 보기 열쇠 쿠키 쓰기는 흉내로 센다(쿠키 글 모양은 src/lib/supabase/viewKey.test.ts 몫)
vi.mock('@/lib/supabase/viewKey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/viewKey')>()),
  setViewKey,
}))

const RAW = 'permission denied for function set_hospital_status secret-detail'
// DB가 신청일 내림차순으로 준다(order는 listApplications가 건다)
const DB_ROWS = [
  { id: 'r1', name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01000001234', email: 'manager@example.com', status: 'pending', emr: 'uisarang', created_at: '2026-10-28T01:00:00+00:00' },
  { id: 'r2', name: '다라 통증의학과의원', applicant_name: '김철수', phone: null, email: 'chulsoo@example.com', status: 'pending', emr: 'egis', created_at: '2026-10-26T16:30:00+00:00' },
  { id: 'r4', name: '사아 의원', applicant_name: '박민수', phone: null, email: 'minsu@example.com', status: 'rejected', emr: 'other', created_at: '2026-10-22T03:00:00+00:00' },
  { id: 'r3', name: '마바 정형외과의원', applicant_name: '이영희', phone: '0212345678', email: 'younghee@example.com', status: 'approved', created_at: '2026-10-20T03:00:00+00:00' },
]
// 대기·거절 탭 칸. 신청자·이메일은 한 칸 두 줄 '신청자 · 이메일'(admin-view AC-8022.1)
const COLUMNS = ['신청일', '의원 이름', 'EMR', '신청자 · 이메일', '연락처', '동작']
// '승인' 탭은 의원 이름 다음에 '지역'(admin-view AC-8012.2), 그 다음 '채울 기간'·'저절로 올림'(2차 AC-8022.2 — 시안 칸 차례
// 신청일 · 의원 이름 · 지역 · 채울 기간 · 저절로 올림 · EMR · 신청자 · 이메일 · 연락처 · 동작, 신청자·이메일은 한 칸)
const APPROVED_COLUMNS = ['신청일', '의원 이름', '지역', '채울 기간', '저절로 올림', 'EMR', '신청자 · 이메일', '연락처', '동작']
// multi-admin requirements.md '화면 글자' INTRO 전체(지금 두 문장 끝에 한 문장을 더함)
const MULTI_ADMIN_INTRO = '승인하면 그 계정은 바로 대시보드를 쓸 수 있어요. 거절한 신청은 거절 탭에서 되돌릴 수 있어요. 승인 탭에서 관리자를 정하거나 뺄 수 있어요.'
// admin-view AC-8012.1: 그 끝에 한 문장 더(시안 T.adminIntro 그대로)
const INTRO = `${MULTI_ADMIN_INTRO} 의원 이름을 누르면 그 의원 화면을 읽기만 할 수 있어요.`
// admin_view_hospitals() 답(승인된 의원, admin-view AC-8012.5). 주소는 지어낸 값
const DB_VIEWS = [{ hospital_id: 'r3', name: '마바 정형외과의원', address: '서울특별시 가짜구 가짜로 1', region_set: false, region: null, is_me: false }]
// 시안에 없는 거절 확인 창 문구는 말끝만 "~요"로 바꾼다(design.md '시안과 다른 점' 11)
const CONFIRM_BODY = '거절하면 이 계정은 대시보드를 쓸 수 없어요. 거절 탭에서 언제든 되돌릴 수 있어요.'

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
// 의원 이름 칸(title = 의원 이름)으로 줄을 찾는다 — 관리자 표가 붙은 줄은 칸 글자에 '관리자'·'주 관리자'가 더해진다(multi-admin)
const rowOf = (clinic: string) => {
  const tr = within(table()).getAllByRole('cell').find((c) => c.getAttribute('title') === clinic)?.closest('tr') ?? null
  if (tr === null) throw new Error(`${clinic} 줄 없음`)
  return tr
}
// 칸 글자. 지역 칸(고르기 상자)은 고른 값의 글자만
const cellText = (c: HTMLElement) => {
  const box = c.querySelector('select')
  return box === null ? c.textContent : (box.selectedOptions[0]?.textContent ?? '')
}
const cellTexts = (tr: HTMLElement) => within(tr).getAllByRole('cell').map(cellText)
// 칸 이름(머리 줄)으로 그 줄의 칸을 찾는다 — '승인' 탭은 지역 칸이 더해져 칸 차례가 다르다(admin-view AC-8012.2)
const cellUnder = (tr: HTMLElement, label: string) => {
  const at = within(table()).getAllByRole('columnheader').findIndex((th) => th.textContent === label)
  if (at < 0) throw new Error(`${label} 칸 없음`)
  return within(tr).getAllByRole('cell')[at]
}
// 동작 칸은 늘 맨 끝
const actionCell = (tr: HTMLElement) => within(tr).getAllByRole('cell').at(-1) as HTMLElement
// 신청자 · 이메일 칸의 두 줄(첫 줄 이름, 둘째 줄 메일, admin-view AC-8022.1)
const whoLines = (tr: HTMLElement) => {
  const box = cellUnder(tr, '신청자 · 이메일').firstElementChild
  if (box === null) throw new Error('신청자 · 이메일 줄 없음')
  return Array.from(box.children) as HTMLElement[]
}
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
  marksRpc.mockReset()
  marksRpc.mockResolvedValue({ data: [], error: null, status: 200 })
  viewRpc.mockReset()
  viewRpc.mockResolvedValue({ data: DB_VIEWS, error: null, status: 200 })
  uploadRpc.mockReset()
  uploadRpc.mockResolvedValue({ data: [], error: null, status: 200 })
  setViewKey.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AdminApplications: 처음 그리기', () => {
  it('AC-007.1·AC-417.1: 제목 "가입 승인"·안내는 시안 그대로, 탭 줄(대기·승인·거절)마다 줄 수(글자), 처음 탭은 대기', async () => {
    await renderLoaded()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('가입 승인')
    expect(screen.getByText(INTRO)).toBeTruthy()
    expect(tabNames()).toEqual(['대기 2', '승인 1', '거절 1'])
    expect(tabNamed('대기').getAttribute('aria-selected')).toBe('true')
    expect(tabNamed('승인').getAttribute('aria-selected')).toBe('false')
    expect(tabNamed('거절').getAttribute('aria-selected')).toBe('false')
  })

  it('AC-007.1·AC-417.1·AC-7304.1·AC-8022.1: 표 칸은 신청일·의원 이름·EMR·신청자 · 이메일·연락처·동작, 대기 줄만 받은 순서(신청일 내림차순)로', async () => {
    await renderLoaded()
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(COLUMNS)
    expect(table().getAttribute('aria-label')).toBe('대기 신청')
    // 신청자 · 이메일 칸은 두 줄(이름 / 메일)이라 칸 글자는 둘이 이어 붙는다
    expect(bodyRows().map((tr) => cellTexts(tr).slice(0, 5))).toEqual([
      ['2026-10-28', '가나 정형외과의원', '의사랑', '홍길동manager@example.com', '010-0000-1234'],
      ['2026-10-27', '다라 통증의학과의원', '이지스', '김철수chulsoo@example.com', '—'], // 신청일은 한국 날짜, 빈 연락처는 "—"
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
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('가입 승인')
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
    // '승인' 탭은 의원 이름 다음에 지역 칸(주소에서 읽은 시·도, admin-view AC-8012.2), 그 다음 채울 기간·저절로 올림(상태 줄 없음 → 2달·아직 없음, 2차 AC-8022.2)
    expect(bodyRows().map((tr) => cellTexts(tr).slice(0, 8))).toEqual([
      ['2026-10-20', '마바 정형외과의원', '서울', '2달', '아직 없음', '비트', '이영희younghee@example.com', '02-1234-5678'],
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

  it('AC-007.1·AC-013.2·AC-8012.4: 앱 틀을 한 번 더 그리지 않는다 — 위쪽 띠·탭 띠·<main>·.app-ui는 (app)/layout 몫. <nav>는 관리자 안쪽 메뉴 하나뿐', async () => {
    await renderLoaded()
    const html = document.body.innerHTML
    for (const mark of [/<main\b/, /<header\b/, /\bapp-ui\b/]) expect(html).not.toMatch(mark)
    expect(Array.from(document.querySelectorAll('nav')).map((n) => n.getAttribute('aria-label'))).toEqual(['관리자 안 메뉴'])
  })
})

describe('AdminApplications: 승인', () => {
  it('AC-007.2: [승인] → set_hospital_status(id, approved) 한 번, 성공하면 줄이 승인 탭으로 옮겨지고 완료 줄을 보인다', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_status', { p_hospital_id: 'r1', p_status: 'approved' })
    expect(status().textContent).toBe('가나 정형외과의원 신청을 승인했어요.')
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
    expect(region.textContent).toBe('가나 정형외과의원 신청을 승인했어요.')
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
    expect(status().textContent).toBe('다라 통증의학과의원 신청을 거절했어요.')
    expect(tabNames()).toEqual(['대기 1', '승인 1', '거절 2'])
    await user.click(tabNamed('거절'))
    expect(bodyRows().map((tr) => cellTexts(tr)[1])).toEqual(['다라 통증의학과의원', '사아 의원'])
  })
})

describe('AdminApplications: 되돌리기·승인 줄', () => {
  it('AC-007.4·AC-417.1: 거절 줄의 [되돌리기] → pending으로 바꾸고 "○○ 신청을 대기로 되돌렸어요."', async () => {
    const user = await renderLoaded()
    await user.click(tabNamed('거절'))
    const row = rowOf('사아 의원')
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['되돌리기'])
    await user.click(within(row).getByRole('button', { name: '되돌리기' }))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_status', { p_hospital_id: 'r4', p_status: 'pending' })
    expect(status().textContent).toBe('사아 의원 신청을 대기로 되돌렸어요.')
    expect(tabNames()).toEqual(['대기 3', '승인 1', '거절 0'])
    expect(screen.queryByRole('dialog')).toBeNull() // 되돌리기는 확인 창 없이 바로
  })

  it('AC-007.4·AC-7703.3: 승인 줄(관리자 아님)의 동작 칸은 [관리자로 정하기] 하나뿐이고 "승인됨" 완료 칩은 없다', async () => {
    const user = await renderLoaded()
    await user.click(tabNamed('승인'))
    const cell = actionCell(rowOf('마바 정형외과의원'))
    expect(within(cell).getAllByRole('button').map((b) => b.textContent)).toEqual(['관리자로 정하기'])
    expect(within(cell).queryByText('승인됨')).toBeNull()
    expect(cell.querySelector('span')).toBeNull()
  })

  it('AC-007.2·AC-007.4: 대기 줄은 [승인]·[거절] 두 단추(그 순서)', async () => {
    await renderLoaded()
    expect(within(rowOf('가나 정형외과의원')).getAllByRole('button').map((b) => b.textContent)).toEqual(['승인', '거절'])
  })
})

describe('AdminApplications: 빈 탭', () => {
  it.each([
    ['대기', [], '대기 중인 신청이 없어요', '새 가입 신청이 오면 여기에 보여요.', COLUMNS],
    ['승인', DB_ROWS.filter((r) => r.status !== 'approved'), '승인한 신청이 없어요', '승인한 계정이 여기에 모여요.', APPROVED_COLUMNS],
    ['거절', DB_ROWS.filter((r) => r.status !== 'rejected'), '거절한 신청이 없어요', '거절한 신청은 여기에서 되돌릴 수 있어요.', COLUMNS],
  ] as const)('AC-007.5·AC-417.1: %s 탭이 비면 표 머리는 두고 칸 전체를 잇는 한 줄에 목업 안내', async (label, data, title, body, columns) => {
    order.mockResolvedValue({ data, error: null, status: 200 })
    const user = await renderLoaded()
    await user.click(tabNamed(label))
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(columns)
    const rows = bodyRows()
    expect(rows).toHaveLength(1)
    const cells = within(rows[0]).getAllByRole('cell')
    expect(cells).toHaveLength(1)
    expect(cells[0].getAttribute('colspan')).toBe(String(columns.length))
    expect(cells[0].textContent).toContain(title)
    expect(cells[0].textContent).toContain(body)
    // 제목과 설명은 한 문장으로 이어지지 않게 따로 줄(블록)로 — 목업처럼 <p> 둘
    expect([...cells[0].querySelectorAll('p')].map((el) => el.textContent)).toEqual([title, body])
    expect([...cells[0].childNodes].every((n) => n.nodeType !== Node.TEXT_NODE)).toBe(true)
    hasAll(cells[0], ds.table.emptyRow)
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
    expect(status().textContent).toBe('가나 정형외과의원 신청을 승인했어요.')
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
    const tbody = table().querySelector('tbody') as Element
    hasAll(tbody, 'max-md:flex max-md:flex-col')
    // 줄 사이는 띄우지 않고 1px 선으로 나눈다(AC-220.2)
    expect(classesOf(tbody).filter((t) => /^max-md:gap/.test(t))).toEqual([])
    hasAll(table().parentElement as Element, `${ds.table.wrap} max-md:overflow-visible`)
  })

  it('AC-220.2: 표는 본문 좌우 끝까지 닿는 띠(위아래 1px line), 줄은 상자 없이 줄 사이 1px line·안쪽 12px 16px', async () => {
    await renderLoaded()
    // 띠: 본문 좌우 여백(16px)만큼 밖으로 → 화면 끝까지. 위아래 선은 표가 준다(PC와 같다)
    hasAll(table().parentElement as Element, 'max-md:-mx-4')
    hasAll(table(), 'border-y border-line bg-surface')
    const rows = bodyRows()
    for (const tr of rows) {
      hasAll(tr, 'max-md:grid max-md:border-b max-md:border-line max-md:last:border-b-0 max-md:px-4 max-md:py-3')
      // 옛 카드 줄(네 변 선·모서리·흰 바탕) 없음
      hasNone(tr, 'max-md:border max-md:rounded-card max-md:rounded-control max-md:bg-surface max-md:p-4 max-md:gap-1.5')
      for (const c of within(tr).getAllByRole('cell')) hasAll(c, 'max-md:h-auto max-md:border-b-0 max-md:p-0')
    }
  })

  it('AC-220.2·AC-7304.1·AC-8022.1: 줄 안 순서 — 의원 이름(600, 말줄임) + 오른쪽 신청일(caption muted) → EMR(small ink-2) → 신청자 · 이메일(small ink-2, 한 칸) → 연락처(small muted) + 오른쪽 단추', async () => {
    await renderLoaded()
    const tr = rowOf('가나 정형외과의원')
    const [date, clinic, emr, who, phone, action] = within(tr).getAllByRole('cell')
    // DOM은 PC 칸 순서(신청일 먼저). 폰은 네 줄 격자에 놓는다
    hasAll(clinic, 'max-md:row-start-1 max-md:col-start-1 max-md:col-end-3 truncate text-body font-semibold')
    hasAll(date, 'max-md:row-start-1 max-md:col-start-3 max-md:justify-self-end max-md:text-caption')
    hasAll(date.firstElementChild as Element, 'text-muted tabular-nums')
    hasAll(emr, 'max-md:row-start-2 max-md:col-start-1 max-md:col-end-4 text-ink-2')
    // 신청자 · 이메일은 한 칸(셋째 줄 전체 폭). 폰 격자는 그대로 두고 그 안 글 차례만 이름 → 메일(admin-view AC-8022.1, 새 폰 모양 없음).
    // 긴 이름(DB는 30자까지)도 줄을 넓히지 않는다: 휴대폰에서 줄바꿈하고, 첫 칸은 줄 폭의 반까지만 자란다 → 신청일·단추 칸(셋째 칸)이 늘 화면 안에 남는다
    hasAll(who, 'max-md:row-start-3 max-md:col-start-1 max-md:col-end-4 max-md:self-start max-md:whitespace-normal max-md:text-ink-2')
    const [name, email] = whoLines(tr)
    expect([name.textContent, email.textContent]).toEqual(['홍길동', 'manager@example.com'])
    hasAll(name, 'wrap-anywhere')
    hasAll(email, 'wrap-anywhere') // 이메일은 "@" 뒤에서만 줄바꿈(아래 TASK-19 시험)
    // 두 줄에는 폰 전용 클래스가 없다(사용자 규칙 2026-11-21)
    for (const line of [name, email]) expect(classesOf(line).filter((t) => t.startsWith('max-md:'))).toEqual([])
    hasAll(tr, 'max-md:grid-cols-[fit-content(50%)_1fr_auto]')
    expect(classesOf(tr).filter((t) => t.startsWith('max-md:grid-cols-'))).toEqual(['max-md:grid-cols-[fit-content(50%)_1fr_auto]'])
    hasAll(phone, 'max-md:row-start-4 max-md:col-start-1 max-md:col-end-3 max-md:text-muted')
    hasAll(action, 'max-md:row-start-4 max-md:col-start-3 max-md:justify-self-end')
    // 칸 이름(data-label)은 보이지 않는다
    for (const c of [date, emr, who, phone]) {
      expect(c.getAttribute('data-label')).toBeNull()
      hasNone(c, 'max-md:before:content-[attr(data-label)]')
    }
  })

  it('AC-220.2: 빈 연락처는 지금처럼 "—"(시안의 "연락처 없음"은 쓰지 않는다)', async () => {
    await renderLoaded()
    expect(cellUnder(rowOf('다라 통증의학과의원'), '연락처').textContent).toBe('—')
    expect(screen.queryByText('연락처 없음')).toBeNull()
  })

  it('AC-220.1·AC-220.2·AC-7703.3: 줄에 상태 칩(대기·거절됨)이 없다(탭이 상태다). 승인 줄의 "승인됨" 완료 칩도 없다 — 관리자가 아닌 줄에는 칩이 하나도 없다', async () => {
    const user = await renderLoaded()
    const chipKeys = Object.values(ds.chip)
    const chipsIn = (el: Element) => Array.from(el.querySelectorAll('span')).filter((s) => chipKeys.some((c) => tokens(c).every((t) => classesOf(s).includes(t))))
    expect(chipsIn(table())).toEqual([])
    expect(within(table()).queryAllByText('대기')).toEqual([])
    await user.click(tabNamed('거절'))
    expect(chipsIn(table())).toEqual([])
    expect(within(table()).queryAllByText('거절됨')).toEqual([])
    await user.click(tabNamed('승인'))
    expect(chipsIn(table())).toEqual([])
    expect(within(table()).queryAllByText('승인됨')).toEqual([])
  })

  it('AC-007.7·AC-013.4: 동작 단추는 폰에서 오른쪽에 나란히, 높이 44px(max-md:h-11)', async () => {
    const user = await renderLoaded()
    const action = actionCell(rowOf('가나 정형외과의원'))
    for (const b of within(action).getAllByRole('button')) {
      hasAll(b, 'max-md:h-11')
      hasNone(b, 'max-md:flex-1')
    }
    hasAll(within(action).getByRole('button', { name: '승인' }).parentElement as Element, 'flex justify-end gap-2')
    await user.click(tabNamed('거절'))
    const restore = within(rowOf('사아 의원')).getByRole('button', { name: '되돌리기' })
    hasAll(restore, 'max-md:h-11')
    hasNone(restore, 'max-md:flex-1')
    hasAll(restore.parentElement as Element, 'flex justify-end gap-2')
  })

  it('AC-007.7·AC-013.4: 화면 안 탭은 폰에서 높이 44px, 제목은 title', async () => {
    await renderLoaded()
    for (const t of within(tablist()).getAllByRole('tab')) hasAll(t, 'max-md:h-11')
    hasAll(screen.getByRole('heading', { level: 1 }), 'text-title font-semibold text-ink')
    hasNone(screen.getByRole('heading', { level: 1 }), 'max-md:text-title-sm')
  })

  it('AC-007.7·AC-013.4: 확인 창 단추는 폰에서 나란히 반씩(44px)', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    for (const b of within(dialog()).getAllByRole('button')) hasAll(b, 'max-md:h-11 max-md:flex-1')
  })
})

describe('AdminApplications: 모양 (UI_GUIDE 앱 화면)', () => {
  it('AC-220.1·AC-417.1·AC-8012.4: h1 "가입 승인"(title 600) → 안쪽 메뉴(위 12px) → 안내(시안 문구, ink-2, 위 16px) → 화면 안 탭(위 16px) → 표(위 16px)', async () => {
    const { container } = render(<AdminApplications />)
    await screen.findByRole('tablist', { name: '신청 상태' })
    const h1 = screen.getByRole('heading', { level: 1 })
    hasAll(h1, 'text-title font-semibold text-ink')
    const intro = screen.getByText(INTRO)
    expect(intro.tagName).toBe('P')
    hasAll(intro, 'text-body text-ink-2')
    // 제목 묶음(관리자 · 가입 승인, 사이 4px) → 안쪽 메뉴(사이 12px)가 머리 하나(시안 .ahead), 안내는 그 아래(시안 .intro, 사이 16px)
    const titleGroup = h1.parentElement as Element
    hasAll(titleGroup, 'flex flex-col gap-1')
    const head = titleGroup.parentElement as Element
    hasAll(head, 'flex flex-col gap-3')
    expect(Array.from(head.children)).toEqual([titleGroup, screen.getByRole('navigation', { name: '관리자 안 메뉴' })])
    const root = container.firstElementChild as Element
    hasAll(root, 'flex flex-col gap-4')
    expect(head.parentElement).toBe(root)
    expect(head.nextElementSibling).toBe(intro)
    expect(intro.parentElement).toBe(root)
    expect(tablist().parentElement).toBe(root)
    expect(screen.getByRole('tabpanel').parentElement).toBe(root)
  })

  it('AC-220.1: 화면 안 탭 — 40px·body·아래 1px line, 지금 탭 ink 600 + 아래 2px accent 밑줄, 나머지 ink-2 500, 개수는 글자(muted 500, 칩 아님)', async () => {
    await renderLoaded()
    hasAll(tablist(), 'flex border-b border-line')
    const current = tabNamed('대기')
    hasAll(current, 'h-10 text-body font-semibold text-ink after:absolute after:h-0.5 after:bg-accent')
    hasNone(current, 'text-accent font-bold after:h-0.75')
    hasAll(current, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    for (const idle of [tabNamed('승인'), tabNamed('거절')]) {
      hasAll(idle, 'h-10 text-body font-medium text-ink-2 hover:text-ink')
      hasNone(idle, 'text-accent font-semibold font-bold after:bg-accent')
    }
    for (const t of within(tablist()).getAllByRole('tab')) {
      const count = t.querySelector('span:last-child') as Element
      expect(count.textContent).toMatch(/^\d+$/)
      hasAll(count, 'text-muted font-medium tabular-nums')
      for (const chip of Object.values(ds.chip)) expect(tokens(chip).every((c) => classesOf(count).includes(c))).toBe(false)
      hasNone(count, 'border rounded-control rounded-chip h-5 h-5.5')
      // 굵기가 바뀌어도 폭이 흔들리지 않게 잡는 글자도 600(700 없음)
      hasAll(t.querySelector('span:first-child') as Element, 'after:font-semibold')
      hasNone(t.querySelector('span:first-child') as Element, 'after:font-bold')
    }
  })

  it('AC-220.1: 표는 ds.table(머리 th·칸 td), 패널 틀 없이 본문 위에 바로 — surface·위아래 1px line·모서리 없음, 몸 줄 56px, 머리 small 500 muted', async () => {
    await renderLoaded()
    hasAll(table(), `${ds.table.table} border-y border-line bg-surface`)
    expect(classesOf(table()).filter((t) => /(?:^|:)rounded/.test(t))).toEqual([])
    for (const th of within(table()).getAllByRole('columnheader')) hasAll(th, ds.table.th)
    const [date, clinic, emr, who, phone, action] = within(rowOf('가나 정형외과의원')).getAllByRole('cell')
    for (const c of [date, emr, phone]) hasAll(c, ds.table.tdSub)
    // 신청자 · 이메일 칸은 이름 줄이 몸 칸(ink), 메일 줄은 caption muted(admin-view AC-8022.1, 시안 .who2 .e 12px muted)
    for (const c of [clinic, who, action]) hasAll(c, ds.table.td)
    hasAll(rowOf('가나 정형외과의원'), `${ds.table.row} md:h-14`)
    // 패널 틀(흰 상자·선·안쪽 여백)이 없다: 탭 패널과 표 감싸개에 테두리·바탕·안쪽 여백이 없다
    for (const el of [screen.getByRole('tabpanel'), table().parentElement as Element]) {
      expect(classesOf(el).filter((t) => /(?:^|:)(?:border|rounded|bg-|p[xytblr]?-|shadow)/.test(t))).toEqual([])
    }
  })

  it('AC-220.1·AC-8022.1: 칸 — 신청일(muted 고정폭) · 의원 이름(600) · 신청자 · 이메일(메일 줄 caption muted) · 연락처(ink-2 고정폭) · 동작(오른쪽)', async () => {
    const user = await renderLoaded()
    const [date, clinic, , , phone, action] = within(rowOf('가나 정형외과의원')).getAllByRole('cell')
    hasAll(date.firstElementChild as Element, 'text-muted tabular-nums')
    expect(date.firstElementChild?.textContent).toBe('2026-10-28')
    hasAll(clinic, 'font-semibold')
    hasAll(whoLines(rowOf('가나 정형외과의원'))[1], 'text-caption text-muted') // 시안 .who2 .e 12px muted
    hasAll(phone, 'text-ink-2 tabular-nums')
    hasAll(within(table()).getAllByRole('columnheader')[5], 'md:text-right')
    hasAll(within(action).getByRole('button', { name: '승인' }).parentElement as Element, 'flex justify-end')
    await user.click(tabNamed('승인'))
    hasAll(within(actionCell(rowOf('마바 정형외과의원'))).getByRole('button', { name: '관리자로 정하기' }).parentElement as Element, 'flex justify-end')
  })

  it('AC-220.1: 표 아래 "대기 중인 신청 N건" 줄은 두지 않는다(개수는 탭에 있다)', async () => {
    await renderLoaded()
    expect(document.body.textContent).not.toMatch(/대기 중인 신청 \d+건/)
    expect(screen.getByRole('tabpanel').lastElementChild).toBe(table().parentElement)
  })

  it('AC-007.1·AC-220.1·AC-7703.4: PC 표는 칸 폭을 정해 둔다(table-fixed) — 승인으로 줄이 바뀌거나 탭이 비어도 칸 자리가 움직이지 않는다', async () => {
    const user = await renderLoaded()
    const widths = () =>
      within(table()).getAllByRole('columnheader').map((th) => classesOf(th).filter((t) => /^(max-|md:)?w-/.test(t)))
    // 신청일 120px, EMR 112px, 연락처·동작 150px, 의원 이름·신청자 · 이메일은 남은 폭을 반씩(신청자·이메일 한 칸, admin-view AC-8022.1)
    const FIXED = [['w-30'], [], ['w-28'], [], ['w-37.5'], ['w-37.5']]
    hasAll(table(), 'md:table-fixed')
    expect(widths()).toEqual(FIXED)
    // AC-222.1(TASK-24): 768~1023px(본문 720~975px)에서도 모든 칸·단추가 옆으로 밀지 않고 보인다 —
    // 표에 최소 폭이 없고, 정한 칸은 글자 폭에 맞춰 줄인다(신청일 116 · EMR 96 · 연락처 136).
    // 동작 칸은 1023px 이하에서도 150px 그대로다 — 140px이면 [관리자로 정하기]가 겨우 들어간다(multi-admin AC-7703.4, 시안 notes.md '칸 폭')
    expect(classesOf(table()).filter((t) => /min-w-/.test(t))).toEqual([])
    const tabletWidths = within(table())
      .getAllByRole('columnheader')
      .map((th) => classesOf(th).filter((t) => /^max-lg:w-/.test(t)))
    expect(tabletWidths).toEqual([['max-lg:w-29'], [], ['max-lg:w-24'], [], ['max-lg:w-34'], []])
    // 정한 폭이 없는 두 칸(의원 이름 칸, 신청자 · 이메일 칸의 두 줄)은 PC에서 넘치면 말줄임(옆 칸을 덮지 않는다). 폰은 줄바꿈 그대로
    const cells = within(rowOf('가나 정형외과의원')).getAllByRole('cell')
    const [name, email] = whoLines(rowOf('가나 정형외과의원'))
    for (const c of [cells[1], name, email]) expect(classesOf(c).some((t) => t === 'truncate' || t === 'md:truncate')).toBe(true)
    // 768~1023px(글 칸이 좁다)에서는 말줄임 대신 줄바꿈 — 터치·키보드로도 전체 의원 이름·신청자·이메일을 보고 [승인]을 누른다(1024px 이상은 말줄임 그대로)
    for (const c of [cells[1], name]) hasAll(c, 'md:max-lg:whitespace-normal md:max-lg:break-all')
    hasAll(email, 'md:max-lg:whitespace-normal wrap-anywhere') // 이메일은 "@" 뒤에서만(아래 TASK-19 시험)
    // 말줄임으로 잘려도 전체 값은 마우스를 올리면 보인다(title)
    expect([cells[1], name, email].map((c) => c.getAttribute('title'))).toEqual(['가나 정형외과의원', '홍길동', 'manager@example.com'])
    // 빈 탭에서도 머리 폭은 같다
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    await user.click(within(rowOf('다라 통증의학과의원')).getByRole('button', { name: '승인' }))
    expect(bodyRows()).toHaveLength(1)
    expect(widths()).toEqual(FIXED)
    hasAll(table(), 'md:table-fixed')
  })

  // ui-90 TASK-19 채점: 768px 표가 이메일을 낱말 중간(barun@exampl / e.com)에서 잘랐다 → "@" 바로 뒤에만 줄을 바꿀 자리를 둔다
  it('AC-220.1·ui-90 TASK-19: 이메일은 "@" 바로 뒤(<wbr>)에서만 줄을 바꾼다 — break-all 없음, 도메인이 칸보다 길 때만 그 안에서(wrap-anywhere)', async () => {
    await renderLoaded()
    // 메일은 신청자 · 이메일 칸의 둘째 줄(admin-view AC-8022.1)
    const email = whoLines(rowOf('가나 정형외과의원'))[1]
    // 글자·title은 그대로, 줄 바꿀 자리는 "@" 뒤 하나뿐
    expect(email.textContent).toBe('manager@example.com')
    expect(email.getAttribute('title')).toBe('manager@example.com')
    const nodes = Array.from(email.childNodes).map((n) => (n.nodeType === Node.TEXT_NODE ? n.textContent : (n as Element).tagName.toLowerCase()))
    expect(nodes).toEqual(['manager@', 'wbr', 'example.com'])
    expect(email.querySelectorAll('wbr')).toHaveLength(1)
    // 크롬은 nowrap 안에서도 <wbr>에서 줄을 바꾼다 → 말줄임하는 1024px 이상에서는 뺀다(PC 표 모양 그대로)
    hasAll(email.querySelector('wbr') as Element, 'lg:hidden')
    // 어느 폭에서도 글자 중간을 마음대로 자르지 않는다(break-all 없음). 1024px 이상은 말줄임 그대로
    expect(classesOf(email).filter((t) => /(?:^|:)break-all$/.test(t))).toEqual([])
    hasAll(email, 'wrap-anywhere md:truncate md:max-lg:whitespace-normal')
    hasAll(cellUnder(rowOf('가나 정형외과의원'), '신청자 · 이메일'), 'max-md:whitespace-normal') // 폰 줄바꿈은 칸이 그대로 준다
  })

  it('AC-220.1: 표 안 단추 — [승인] 강조 테두리(ds.button.accentOutlineSmall), [거절]·[되돌리기] 보조(ds.button.secondarySmall)', async () => {
    const user = await renderLoaded()
    const row = rowOf('가나 정형외과의원')
    hasAll(within(row).getByRole('button', { name: '승인' }), ds.button.accentOutlineSmall)
    hasAll(within(row).getByRole('button', { name: '거절' }), ds.button.secondarySmall)
    await user.click(tabNamed('거절'))
    hasAll(within(rowOf('사아 의원')).getByRole('button', { name: '되돌리기' }), ds.button.secondarySmall)
  })

  it('AC-013.3: 완료 줄은 small·positive 글자 + 체크 아이콘(꾸밈)', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    hasAll(status(), 'flex items-center text-small text-positive')
    expect(status().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-013.3: 확인 창 — 떠 있는 층(ds.layer, shadow-float)·폭 400px·안쪽 24px, 뒤 가림막 ink 36%, [취소] 보조·[거절] 위험, 오른쪽 끝', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    const d = dialog()
    hasAll(d, `${ds.layer} w-full max-w-100 p-6`)
    hasAll(d.parentElement as Element, 'fixed inset-0 bg-ink/36 flex items-center justify-center')
    hasAll(within(d).getByRole('heading', { name: '이 신청을 거절할까요?' }), 'text-lead font-semibold text-ink')
    hasAll(within(d).getByText(CONFIRM_BODY), 'text-body text-ink-2')
    const [cancel, confirm] = within(d).getAllByRole('button')
    hasAll(cancel, ds.button.secondary)
    hasAll(confirm, ds.button.danger)
    hasAll(cancel.parentElement as Element, 'flex justify-end gap-2')
  })

  it('AC-220.3: 거절 확인 창 — ds.layer(8px·그림자)·폭 400px·안쪽 24px(폭마다 같음), 뒤 가림막 ink 36%, [취소] ds.button.secondary · [거절] ds.button.danger(폰 나란히 반씩 44px)', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    const d = dialog()
    hasAll(d, 'rounded-float shadow-float border border-line bg-surface w-full max-w-100 p-6')
    expect(classesOf(d).filter((t) => /^(?:md|max-md|lg|max-lg):p[xytblr]?-/.test(t))).toEqual([])
    hasAll(d.parentElement as Element, 'bg-ink/36')
    const [cancel, confirm] = within(d).getAllByRole('button')
    expect([cancel.textContent, confirm.textContent]).toEqual(['취소', '거절'])
    hasAll(cancel, `${ds.button.secondary} max-md:flex-1`)
    hasAll(confirm, `${ds.button.danger} max-md:flex-1`)
    // 신청 내용 줄은 상자 안 상자가 되지 않게 테두리 없이 canvas 바탕만
    const summary = within(d).getByText('가나 정형외과의원').parentElement as Element
    hasAll(summary, 'bg-canvas')
    expect(classesOf(summary).filter((t) => /(?:^|:)border(?:$|-)/.test(t))).toEqual([])
    hasAll(within(d).getByText('홍길동 · manager@example.com'), 'text-small text-ink-2')
  })

  it('AC-013.3·AC-220.1: 그림자는 확인 창 하나에만, accent는 지금 탭 밑줄·[승인] 테두리와 초점 고리에만', async () => {
    const user = await renderLoaded()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    const all = Array.from(document.body.querySelectorAll('*'))
    const withShadow = all.filter((el) => classesOf(el).some((t) => t.split(':').pop()?.startsWith('shadow')))
    expect(withShadow).toEqual([dialog()])
    const isFocus = (t: string) => t.split(':').some((v) => v === 'focus-visible' || v === 'focus' || v === 'focus-within')
    const withAccent = all.filter((el) => classesOf(el).some((t) => !isFocus(t) && /accent/.test(t)))
    const approves = within(table()).getAllByRole('button', { name: '승인' })
    expect(approves).toHaveLength(2)
    // 안쪽 메뉴의 지금 링크 밑줄(admin-view AC-8012.4)도 같은 accent 밑줄이다
    const navCurrent = within(screen.getByRole('navigation', { name: '관리자 안 메뉴' })).getByRole('link', { name: '가입 승인' })
    expect(withAccent).toEqual([navCurrent, tabNamed('대기'), ...approves])
  })

  it('AC-204.7: 상자 안 상자가 없다 — 세 탭(대기·승인·거절)과 확인 창', async () => {
    const user = await renderLoaded()
    for (const label of ['대기', '승인', '거절'] as const) {
      await user.click(tabNamed(label))
      expect(nestedBoxes(document.body), label).toEqual([])
    }
    await user.click(tabNamed('대기'))
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    expect(dialog()).toBeTruthy()
    expect(nestedBoxes(document.body), '확인 창').toEqual([])
  })
})

describe('AdminApplications: 가입 승인 이름·말투 (ui-90 REQ-417)', () => {
  it('AC-417.1: h1 위에 작은 "관리자" 표시 — 제목 묶음의 첫 줄, Icon userCheck 14(꾸밈) + small muted', async () => {
    await renderLoaded()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('가입 승인')
    const loc = h1.previousElementSibling
    if (loc === null) throw new Error('h1 위 "관리자" 줄 없음')
    expect(loc.tagName).toBe('P')
    expect(loc.textContent).toBe('관리자')
    expect(h1.parentElement?.firstElementChild).toBe(loc)
    hasAll(loc, 'flex items-center gap-1.5 text-small font-semibold text-muted')
    const svg = loc.querySelector('svg')
    if (svg === null) throw new Error('"관리자" 아이콘 없음')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('width')).toBe('14')
    expect(svg.getAttribute('height')).toBe('14')
    // 그림은 Icon 한 곳의 userCheck(시안 ICONS['userCheck']) 그대로다
    const { container } = render(<Icon name="userCheck" size={14} />)
    expect(svg.innerHTML).toBe(container.querySelector('svg')?.innerHTML)
  })

  it('AC-417.1: 읽는 동안에도 "관리자" 표시와 h1 "가입 승인"이 먼저 보인다', () => {
    order.mockReturnValue(new Promise(() => {}))
    render(<AdminApplications />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('가입 승인')
    expect(h1.previousElementSibling?.textContent).toBe('관리자')
  })

  it('AC-417.1: 안내는 시안 문구(~요) · body ink-2 · 최대 폭 max-w-140(시안 40em × body 14px = 560px에 가장 가까운 4px 단위 폭 단계, 대괄호 값 없음)', async () => {
    await renderLoaded()
    const intro = screen.getByText(INTRO)
    hasAll(intro, 'text-body text-ink-2 max-w-140')
    expect(classesOf(intro).filter((t) => t.includes('['))).toEqual([])
  })

  it('AC-417.1: 표 머리는 "의원 이름", 거절 확인 창 문구는 말끝 "~요"', async () => {
    const user = await renderLoaded()
    expect(within(table()).getByRole('columnheader', { name: '의원 이름' })).toBeTruthy()
    expect(within(table()).queryByRole('columnheader', { name: '병원 이름' })).toBeNull()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '거절' }))
    expect(within(dialog()).getByText(CONFIRM_BODY)).toBeTruthy()
  })

  it('AC-417.1: 화면 어디에도 "가입 신청" h1·"병원 이름"·"니다." 글자가 없다 — 세 탭·빈 탭·완료 줄·확인 창', async () => {
    const seen: string[] = []
    const snap = () => {
      seen.push(document.body.textContent ?? '')
      expect(screen.queryByRole('heading', { name: '가입 신청' })).toBeNull()
    }
    const user = await renderLoaded()
    snap()
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    snap() // 승인 완료 줄
    await user.click(within(rowOf('다라 통증의학과의원')).getByRole('button', { name: '거절' }))
    snap() // 확인 창
    await user.click(within(dialog()).getByRole('button', { name: '거절' }))
    snap() // 거절 완료 줄 + 비어 버린 대기 탭
    await user.click(tabNamed('거절'))
    await user.click(within(rowOf('사아 의원')).getByRole('button', { name: '되돌리기' }))
    snap() // 되돌리기 완료 줄
    await user.click(tabNamed('승인'))
    snap()
    cleanup()
    order.mockResolvedValue({ data: [], error: null, status: 200 })
    const empty = await renderLoaded()
    for (const label of ['대기', '승인', '거절'] as const) {
      await empty.click(tabNamed(label))
      snap() // 빈 탭 안내
    }
    const all = seen.join('\n')
    // 빈 검사가 아니다: 새 문구가 실제로 그려졌다
    for (const text of ['신청을 승인했어요.', '신청을 거절했어요.', '신청을 대기로 되돌렸어요.', '대기 중인 신청이 없어요', '승인한 신청이 없어요', '거절한 신청이 없어요', CONFIRM_BODY]) {
      expect(all).toContain(text)
    }
    expect(all).not.toMatch(/병원 이름|니다\./)
  })

  it('AC-417.2: 화면 안 탭의 개수 글자는 지금 그대로 — 탭마다 줄 수(muted 500 글자, 칩 아님), 바꾼 뒤에도 다시 센다', async () => {
    const user = await renderLoaded()
    expect(tabNames()).toEqual(['대기 2', '승인 1', '거절 1'])
    for (const t of within(tablist()).getAllByRole('tab')) {
      const count = t.querySelector('span:last-child') as Element
      hasAll(count, 'font-medium tabular-nums text-muted')
      for (const chip of Object.values(ds.chip)) expect(tokens(chip).every((c) => classesOf(count).includes(c))).toBe(false)
    }
    await user.click(within(rowOf('가나 정형외과의원')).getByRole('button', { name: '승인' }))
    expect(tabNames()).toEqual(['대기 1', '승인 2', '거절 1'])
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

describe('AC-5104.3 제목 아래 top 자리', () => {
  it('AC-5104.3: top으로 넘긴 칸은 제목 묶음(관리자·가입 승인·안내) 바로 아래, 신청 상태 탭 위에 그린다', async () => {
    render(<AdminApplications top={<section aria-label="위 칸">위 칸</section>} />)
    const tabs = await screen.findByRole('tablist', { name: '신청 상태' })
    const h1 = screen.getByRole('heading', { level: 1, name: '가입 승인' })
    const top = screen.getByRole('region', { name: '위 칸' })
    expect(h1.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(top.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-5104.3: top이 없으면 지금 그대로다(위 칸 없음)', async () => {
    render(<AdminApplications />)
    await screen.findByRole('tablist', { name: '신청 상태' })
    expect(screen.queryByRole('region', { name: '위 칸' })).toBeNull()
  })
})

describe('AC-7304.1 가입 신청 EMR 칸 (emr-signup)', () => {
  const emrOf = (clinic: string) => cellUnder(rowOf(clinic), 'EMR')

  it("AC-7304.1: 머리 줄 '의원 이름' 다음에 'EMR' 칸이 있다", async () => {
    await renderLoaded()
    const heads = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads.slice(1, 3)).toEqual(['의원 이름', 'EMR'])
  })

  it("AC-7304.1: 대기·승인·거절 탭 모두 줄마다 그 신청의 EMR 글('의사랑'·'이지스'·'그 밖의 EMR', emr 없는 옛 줄은 '비트')이 보인다", async () => {
    const user = await renderLoaded()
    expect(emrOf('가나 정형외과의원').textContent).toBe('의사랑')
    expect(emrOf('다라 통증의학과의원').textContent).toBe('이지스')
    await user.click(tabNamed('승인'))
    expect(emrOf('마바 정형외과의원').textContent).toBe('비트')
    await user.click(tabNamed('거절'))
    expect(emrOf('사아 의원').textContent).toBe('그 밖의 EMR')
  })

  it('AC-7304.1: EMR 칸은 보조 칸 색(ds.table.tdSub)·PC body 글자이고, 다른 칸·단추는 그대로다(동작 칸은 맨 끝)', async () => {
    await renderLoaded()
    const tr = rowOf('가나 정형외과의원')
    const cells = within(tr).getAllByRole('cell')
    expect(cells).toHaveLength(6) // 신청자·이메일 한 칸(admin-view AC-8022.1)
    hasAll(cells[2], `${ds.table.tdSub} md:text-body`)
    expect(within(cells[5]).getAllByRole('button').map((b) => b.textContent)).toEqual(['승인', '거절'])
  })
})

// ── multi-admin: '승인' 탭에서 관리자 정하기·빼기 (REQ-7703·REQ-7704, 시안 docs/mockups/multi-admin/index.html · notes.md).
// 자료는 시안의 지어낸 값이다(의원 이름·사람 이름·@example.com 메일). 주 관리자(원장님 계정) = 한결정형외과의원(h5), 다른 관리자 = 새봄재활의학과의원(h3)
const MA_ROWS = [
  { id: 'p1', name: '맑은정형외과의원', applicant_name: '윤맑음', phone: '0215559876', email: 'malgeum@example.com', status: 'pending', emr: 'bit', created_at: '2026-11-21T01:00:00+00:00' },
  { id: 'h1', name: '바른정형외과의원', applicant_name: '김바른', phone: '0255512345', email: 'barun@example.com', status: 'approved', emr: 'bit', created_at: '2026-11-20T01:00:00+00:00' },
  { id: 'h2', name: '하늘마취통증의학과의원', applicant_name: '이하늘', phone: '03177723456', email: 'haneul.pain@example.com', status: 'approved', emr: 'uisarang', created_at: '2026-11-14T01:00:00+00:00' },
  { id: 'h3', name: '새봄재활의학과의원', applicant_name: '정새봄', phone: '0425558899', email: 'saebom@example.com', status: 'approved', emr: 'egis', created_at: '2026-11-06T01:00:00+00:00' },
  { id: 'r1', name: '시험정형외과', applicant_name: '오시험', phone: null, email: 'test@example.com', status: 'rejected', emr: 'other', created_at: '2026-11-02T01:00:00+00:00' },
  { id: 'h5', name: '한결정형외과의원', applicant_name: '최한결', phone: '01012345678', email: 'hangyeol@example.com', status: 'approved', emr: 'bit', created_at: '2026-10-28T01:00:00+00:00' },
]
// admin_hospitals() 답(주인이 관리자인 승인된 병원만). 주 관리자(한결)가 볼 때 = 시안 ?s=list
const MARKS_OWNER = [
  { hospital_id: 'h5', is_me: true, is_owner: true },
  { hospital_id: 'h3', is_me: false, is_owner: false },
]
// 다른 관리자(새봄)가 볼 때 = 시안 ?s=other
const MARKS_OTHER = [
  { hospital_id: 'h5', is_me: false, is_owner: true },
  { hospital_id: 'h3', is_me: true, is_owner: false },
]
const ADD_TITLE = '이 계정을 관리자로 정할까요?'
const ADD_BODY = '관리자는 가입 승인·거절, 설치 파일 올리기, 관리자 정하기·빼기를 할 수 있어요.'
const REMOVE_TITLE = '관리자에서 뺄까요?'
const REMOVE_BODY = '빼도 이 계정은 지금처럼 대시보드를 써요. 가입 승인 화면만 열 수 없어요.'
const ROLE_RAW = 'permission denied for function set_admin secret-detail'

const clinicCell = (tr: HTMLElement) => within(tr).getAllByRole('cell')[1]
const actionButtons = (clinic: string) => within(actionCell(rowOf(clinic))).queryAllByRole('button').map((b) => b.textContent)
// 의원 이름 뒤 표(ds.chip.accent): 그 줄 의원 이름 칸 안의 칩 글자. 없으면 null
const badgeOf = (clinic: string) => {
  const chips = Array.from(clinicCell(rowOf(clinic)).querySelectorAll('span')).filter((s) => tokens(ds.chip.accent).every((t) => classesOf(s).includes(t)))
  expect(chips.length, clinic).toBeLessThanOrEqual(1)
  return chips[0]?.textContent ?? null
}
const addDialog = () => screen.getByRole('dialog', { name: ADD_TITLE })
const removeDialog = () => screen.getByRole('dialog', { name: REMOVE_TITLE })
const rowButton = (clinic: string, name: '관리자로 정하기' | '관리자 빼기') =>
  within(actionCell(rowOf(clinic))).getByRole<HTMLButtonElement>('button', { name })

async function renderApproved(marks: readonly object[] = MARKS_OWNER) {
  order.mockResolvedValue({ data: MA_ROWS, error: null, status: 200 })
  marksRpc.mockResolvedValue({ data: marks, error: null, status: 200 })
  const user = await renderLoaded()
  await user.click(tabNamed('승인'))
  return user
}

describe('AC-7703.1·AC-7703.2 가입 승인 화면 안내·읽기 (multi-admin)', () => {
  it('AC-7703.1·AC-8012.1: 안내 글은 화면 글자 INTRO 전체(끝에 "승인 탭에서 관리자를 정하거나 뺄 수 있어요.") 뒤에 admin-view 한 문장 — 글자 하나까지 같다, 제목 묶음·탭은 그대로', async () => {
    await renderLoaded()
    const intro = screen.getByText(INTRO)
    expect(intro.textContent).toBe(
      '승인하면 그 계정은 바로 대시보드를 쓸 수 있어요. 거절한 신청은 거절 탭에서 되돌릴 수 있어요. 승인 탭에서 관리자를 정하거나 뺄 수 있어요. 의원 이름을 누르면 그 의원 화면을 읽기만 할 수 있어요.',
    )
    expect(intro.textContent?.startsWith(MULTI_ADMIN_INTRO)).toBe(true)
    expect(screen.getByRole('heading', { level: 1 }).previousElementSibling?.textContent).toBe('관리자')
    expect(tabNames()).toEqual(['대기 2', '승인 1', '거절 1'])
  })

  it('AC-7703.2: 신청 목록(hospitals)과 관리자 표시(rpc admin_hospitals, 인자 없음)를 한 번씩 읽는다 — 관리자 표시가 오기 전에는 탭·표를 그리지 않는다', async () => {
    let resolve: (v: unknown) => void = () => {}
    marksRpc.mockReturnValue(new Promise((r) => (resolve = r)))
    const { container } = render(<AdminApplications />)
    await waitFor(() => expect(order).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('가입 승인')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
    await act(async () => resolve({ data: MARKS_OWNER, error: null, status: 200 }))
    expect(tablist()).toBeTruthy()
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('false')
    expect(from).toHaveBeenCalledExactlyOnceWith('hospitals')
    expect(order).toHaveBeenCalledTimes(1)
    expect(marksRpc).toHaveBeenCalledExactlyOnceWith('admin_hospitals')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-7703.2: 신청 목록이 늦게 와도 둘 다 온 뒤에 그린다(관리자 표시만 먼저 와도 탭·표 없음)', async () => {
    let resolve: (v: unknown) => void = () => {}
    order.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<AdminApplications />)
    await waitFor(() => expect(marksRpc).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(screen.queryByRole('tablist')).toBeNull()
    await act(async () => resolve({ data: DB_ROWS, error: null, status: 200 }))
    expect(tablist()).toBeTruthy()
  })

  it.each([
    ['답 오류', { data: null, error: { code: '42501', message: ROLE_RAW }, status: 403 }],
    ['목록이 아님', { data: { hospital_id: 'h5' }, error: null, status: 200 }],
    ['줄 모양 틀림', { data: [{ hospital_id: 'h5', is_me: true }], error: null, status: 200 }],
  ])('AC-7703.2: 관리자 표시를 읽지 못하면(%s) 신청 목록 읽기 실패와 같이 던진다 → 화면 오류(E-PAGE-FAILED + [다시 시도])', async (_label, answer) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    marksRpc.mockResolvedValue(answer)
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

  it('AC-7703.2: 화면을 떠난 뒤 관리자 표시가 와도 오류 없이 버린다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolve: (v: unknown) => void = () => {}
    marksRpc.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = render(<AdminApplications />)
    await waitFor(() => expect(marksRpc).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => resolve({ data: MARKS_OWNER, error: null, status: 200 }))
    expect(error).not.toHaveBeenCalled()
  })
})

describe('AC-7703.3·AC-7703.4 승인 탭 줄의 관리자 표시·단추 (multi-admin)', () => {
  it('AC-7703.3: 주 관리자가 볼 때(시안 ?s=list) — 내 줄 `주 관리자` 표 + 흐린 `내 계정`, 다른 관리자 `관리자` 표 + [관리자 빼기], 나머지 [관리자로 정하기]', async () => {
    await renderApproved(MARKS_OWNER)
    expect(bodyRows().map((tr) => clinicCell(tr).getAttribute('title'))).toEqual(['바른정형외과의원', '하늘마취통증의학과의원', '새봄재활의학과의원', '한결정형외과의원'])
    expect(badgeOf('한결정형외과의원')).toBe('주 관리자')
    expect(actionButtons('한결정형외과의원')).toEqual([])
    expect(actionCell(rowOf('한결정형외과의원')).textContent).toBe('내 계정')
    expect(badgeOf('새봄재활의학과의원')).toBe('관리자')
    expect(actionButtons('새봄재활의학과의원')).toEqual(['관리자 빼기'])
    for (const clinic of ['바른정형외과의원', '하늘마취통증의학과의원']) {
      expect(badgeOf(clinic), clinic).toBeNull()
      expect(actionButtons(clinic), clinic).toEqual(['관리자로 정하기'])
    }
    expect(within(table()).queryAllByText('승인됨')).toEqual([])
  })

  it('AC-7703.3: 다른 관리자가 볼 때(시안 ?s=other) — 주 관리자 줄 `주 관리자` 표 + 동작 칸 비움, 내 줄 `관리자` 표 + `내 계정`, 나머지 [관리자로 정하기]', async () => {
    await renderApproved(MARKS_OTHER)
    expect(badgeOf('한결정형외과의원')).toBe('주 관리자')
    const ownerAction = actionCell(rowOf('한결정형외과의원'))
    expect(ownerAction.textContent).toBe('')
    expect(within(ownerAction).queryAllByRole('button')).toEqual([])
    expect(ownerAction.childElementCount).toBe(0) // 단추·글자 없이 칸(td)만
    expect(badgeOf('새봄재활의학과의원')).toBe('관리자')
    expect(actionButtons('새봄재활의학과의원')).toEqual([])
    expect(actionCell(rowOf('새봄재활의학과의원')).textContent).toBe('내 계정')
    for (const clinic of ['바른정형외과의원', '하늘마취통증의학과의원']) {
      expect(badgeOf(clinic), clinic).toBeNull()
      expect(actionButtons(clinic), clinic).toEqual(['관리자로 정하기'])
    }
  })

  it('AC-7703.3: `내 계정`은 단추가 아닌 small muted 글자, 줄 단추 둘은 보조 작은 단추(ds.button.secondarySmall), 오른쪽 끝', async () => {
    await renderApproved(MARKS_OWNER)
    const mine = within(actionCell(rowOf('한결정형외과의원'))).getByText('내 계정')
    expect(mine.tagName).toBe('SPAN')
    hasAll(mine, 'text-small text-muted')
    hasAll(mine.parentElement as Element, 'flex justify-end gap-2')
    for (const [clinic, name] of [['바른정형외과의원', '관리자로 정하기'], ['새봄재활의학과의원', '관리자 빼기']] as const) {
      const b = rowButton(clinic, name)
      hasAll(b, ds.button.secondarySmall)
      hasAll(b.parentElement as Element, 'flex justify-end gap-2')
    }
    cleanup()
    await renderApproved(MARKS_OTHER)
    hasAll(within(actionCell(rowOf('새봄재활의학과의원'))).getByText('내 계정'), 'text-small text-muted')
  })

  it('AC-7703.3: 표는 의원 이름 바로 뒤(사이 6px) ds.chip.accent — 이름만 말줄임되고 표는 늘 보인다. 칸 클래스·title(이름)은 관리자가 아닌 줄과 같다', async () => {
    await renderApproved(MARKS_OWNER)
    const plain = clinicCell(rowOf('바른정형외과의원'))
    expect(plain.textContent).toBe('바른정형외과의원')
    expect(plain.childElementCount).toBe(0) // 관리자가 아닌 줄은 지금 그대로(글자만)
    for (const [clinic, badge] of [['새봄재활의학과의원', '관리자'], ['한결정형외과의원', '주 관리자']] as const) {
      const cell = clinicCell(rowOf(clinic))
      expect(cell.getAttribute('title')).toBe(clinic)
      expect(classesOf(cell)).toEqual(classesOf(plain))
      expect(cell.children).toHaveLength(1)
      const group = cell.firstElementChild as Element
      hasAll(group, 'flex min-w-0 items-center gap-1.5')
      const [name, chip] = Array.from(group.children)
      expect([name.tagName, name.textContent]).toEqual(['SPAN', clinic])
      hasAll(name, 'truncate')
      expect([chip.tagName, chip.textContent]).toEqual(['SPAN', badge])
      hasAll(chip, ds.chip.accent)
      hasNone(chip, 'truncate hidden')
      expect(group.children).toHaveLength(2)
    }
  })

  it('AC-7703.3: 대기·거절 탭 줄·단추는 그대로다(관리자 표 없음, [승인]·[거절] / [되돌리기])', async () => {
    const user = await renderApproved(MARKS_OWNER)
    await user.click(tabNamed('대기'))
    expect(actionButtons('맑은정형외과의원')).toEqual(['승인', '거절'])
    expect(badgeOf('맑은정형외과의원')).toBeNull()
    expect(clinicCell(rowOf('맑은정형외과의원')).childElementCount).toBe(0)
    await user.click(tabNamed('거절'))
    expect(actionButtons('시험정형외과')).toEqual(['되돌리기'])
    expect(badgeOf('시험정형외과')).toBeNull()
  })

  it('AC-7703.3·AC-204.7: 관리자 표가 있는 승인 탭에도 상자 안 상자가 없다', async () => {
    await renderApproved(MARKS_OWNER)
    expect(nestedBoxes(document.body)).toEqual([])
  })

  it('AC-7703.4: 새 요소(관리자·주 관리자 표·이름 묶음·`내 계정`)에는 max-md: 클래스가 없고, 줄 단추 둘의 max-md:는 ds 단추 값에 이미 든 것뿐이다', async () => {
    await renderApproved(MARKS_OWNER)
    const phoneTokens = (el: Element) => classesOf(el).filter((t) => t.startsWith('max-md:'))
    for (const clinic of ['새봄재활의학과의원', '한결정형외과의원']) {
      const group = clinicCell(rowOf(clinic)).firstElementChild as Element
      for (const el of [group, ...Array.from(group.children)]) expect(phoneTokens(el), `${clinic} ${el.textContent}`).toEqual([])
    }
    expect(phoneTokens(within(actionCell(rowOf('한결정형외과의원'))).getByText('내 계정'))).toEqual([])
    const allowed = tokens(ds.button.secondarySmall).filter((t) => t.startsWith('max-md:'))
    for (const b of [rowButton('바른정형외과의원', '관리자로 정하기'), rowButton('새봄재활의학과의원', '관리자 빼기')]) {
      for (const t of phoneTokens(b)) expect(allowed, `${b.textContent} ${t}`).toContain(t)
    }
    // 칸(td)·줄(tr) 클래스는 관리자 표가 있어도 다른 줄과 같다(폰 모양 그대로)
    const plain = rowOf('바른정형외과의원')
    for (const clinic of ['새봄재활의학과의원', '한결정형외과의원']) {
      const tr = rowOf(clinic)
      expect(classesOf(tr)).toEqual(classesOf(plain))
      within(tr)
        .getAllByRole('cell')
        .forEach((c, i) => expect(classesOf(c), `${clinic} ${i}`).toEqual(classesOf(within(plain).getAllByRole('cell')[i])))
    }
  })

  it('AC-7703.4: 두 확인 창의 가림막·창 틀·제목·신청 내용 칸·본문·단추 줄·[취소] 클래스는 거절 창과 같고, 확인 단추만 정하기 ds.button.primary · 빼기 ds.button.danger다', async () => {
    const user = await renderApproved(MARKS_OWNER)
    const shape = (d: HTMLElement) => {
      const [title, summary, body, buttons] = Array.from(d.children)
      const [cancel, confirm] = within(d).getAllByRole('button')
      return {
        frame: { scrim: classesOf(d.parentElement as Element), dialog: classesOf(d), title: classesOf(title), summary: classesOf(summary), summaryLines: Array.from(summary.children).map(classesOf), body: classesOf(body), buttons: classesOf(buttons), cancel: classesOf(cancel) },
        confirm: classesOf(confirm),
        tags: Array.from(d.children).map((c) => c.tagName),
      }
    }
    await user.click(tabNamed('대기'))
    await user.click(within(rowOf('맑은정형외과의원')).getByRole('button', { name: '거절' }))
    const reject = shape(dialog())
    await user.keyboard('{Escape}')
    await user.click(tabNamed('승인'))
    await user.click(rowButton('바른정형외과의원', '관리자로 정하기'))
    const add = shape(addDialog())
    await user.keyboard('{Escape}')
    await user.click(rowButton('새봄재활의학과의원', '관리자 빼기'))
    const remove = shape(removeDialog())
    await user.keyboard('{Escape}')
    expect(add.frame).toEqual(reject.frame)
    expect(remove.frame).toEqual(reject.frame)
    expect(add.tags).toEqual(reject.tags)
    expect(remove.tags).toEqual(reject.tags)
    expect(reject.confirm).toEqual(tokens(`${ds.button.danger} max-md:flex-1`))
    expect(add.confirm).toEqual(tokens(`${ds.button.primary} max-md:flex-1`))
    expect(remove.confirm).toEqual(tokens(`${ds.button.danger} max-md:flex-1`))
    expect(add.frame.cancel).toEqual(tokens(`${ds.button.secondary} max-md:flex-1`))
  })

  it('AC-7703.4·AC-8012.2·AC-8022.1·AC-8022.2: 승인 탭 칸 폭은 2차 시안 — 동작 144px(w-36만, max-lg:·max-md: 폭 없음 → [관리자로 정하기]가 들어간다), 지역 108px, 신청자·이메일 한 칸은 남은 폭', async () => {
    await renderApproved(MARKS_OWNER)
    const heads = within(table()).getAllByRole('columnheader')
    expect(classesOf(heads[8]).filter((t) => /(?:^|:)w-/.test(t))).toEqual(['w-36'])
    hasAll(heads[8], 'md:text-right')
    expect(heads.map((th) => classesOf(th).filter((t) => /(?:^|:)w-/.test(t)))).toEqual([
      ['w-28'],
      ['w-46'],
      ['w-27'],
      ['w-22'],
      ['w-62'],
      ['w-15'],
      [],
      ['w-33'],
      ['w-36'],
    ])
  })
})

describe('AC-7704.1·AC-7704.2 정하기·빼기 확인 창 (multi-admin)', () => {
  it('AC-7704.1: [관리자로 정하기] → 정하기 확인 창(dialog·aria-modal, 제목으로 이름·본문으로 설명), 신청 내용 칸, [취소] [관리자로 정하기] 주 단추 오른쪽 끝, 처음 초점 [취소], 아직 함수를 부르지 않는다', async () => {
    const user = await renderApproved(MARKS_OWNER)
    await user.click(rowButton('바른정형외과의원', '관리자로 정하기'))
    const d = addDialog()
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(within(d).getByRole('heading', { level: 2 }).textContent).toBe(ADD_TITLE)
    expect(document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(ADD_TITLE)
    expect(document.getElementById(d.getAttribute('aria-describedby') ?? '')?.textContent).toBe(ADD_BODY)
    expect(within(d).getByText('바른정형외과의원')).toBeTruthy()
    expect(within(d).getByText('김바른 · barun@example.com')).toBeTruthy()
    expect(within(d).getAllByRole('button').map((b) => b.textContent)).toEqual(['취소', '관리자로 정하기'])
    const [cancel, confirm] = within(d).getAllByRole('button')
    hasAll(cancel, ds.button.secondary)
    hasAll(confirm, ds.button.primary)
    hasAll(cancel.parentElement as Element, 'flex justify-end gap-2')
    expect(document.activeElement).toBe(cancel)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('AC-7704.1: [관리자 빼기] → 빼기 확인 창(제목·신청 내용·본문), [취소] [빼기] 위험 단추, 처음 초점 [취소], 아직 함수를 부르지 않는다', async () => {
    const user = await renderApproved(MARKS_OWNER)
    await user.click(rowButton('새봄재활의학과의원', '관리자 빼기'))
    const d = removeDialog()
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(d.getAttribute('aria-describedby') ?? '')?.textContent).toBe(REMOVE_BODY)
    expect(within(d).getByText('새봄재활의학과의원')).toBeTruthy()
    expect(within(d).getByText('정새봄 · saebom@example.com')).toBeTruthy()
    expect(within(d).getAllByRole('button').map((b) => b.textContent)).toEqual(['취소', '빼기'])
    hasAll(within(d).getByRole('button', { name: '빼기' }), ds.button.danger)
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: '취소' }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['정하기', '바른정형외과의원', '관리자로 정하기', ADD_TITLE, ADD_BODY],
    ['빼기', '새봄재활의학과의원', '관리자 빼기', REMOVE_TITLE, REMOVE_BODY],
  ] as const)('AC-7704.1: %s 창 — Tab·Shift+Tab은 두 단추 사이만 돌고, 창 안 빈 곳을 눌러도 초점이 창에 남는다(거절 창과 같다)', async (_label, clinic, opener, title, body) => {
    const user = await renderApproved(MARKS_OWNER)
    await user.click(rowButton(clinic, opener))
    const d = screen.getByRole('dialog', { name: title })
    expect(d.getAttribute('tabindex')).toBe('-1')
    const [cancel, confirm] = within(d).getAllByRole('button')
    await user.tab()
    expect(document.activeElement).toBe(confirm)
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
    await user.click(within(d).getByText(body))
    expect(d.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
    await user.click(within(d).getByText(body))
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    hasAll(d, 'outline-hidden')
  })

  it.each([
    ['정하기 [취소]', '바른정형외과의원', '관리자로 정하기', 'cancel'],
    ['정하기 Esc', '바른정형외과의원', '관리자로 정하기', 'escape'],
    ['빼기 [취소]', '새봄재활의학과의원', '관리자 빼기', 'cancel'],
    ['빼기 Esc', '새봄재활의학과의원', '관리자 빼기', 'escape'],
  ] as const)('AC-7704.2: %s — 창이 닫히고 아무 함수도 부르지 않으며 줄은 그대로, 초점은 누른 줄 단추로 돌아간다', async (_label, clinic, opener, how) => {
    const user = await renderApproved(MARKS_OWNER)
    const button = rowButton(clinic, opener)
    const before = { badge: badgeOf(clinic), buttons: actionButtons(clinic) }
    await user.click(button)
    if (how === 'cancel') await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
    else await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    expect({ badge: badgeOf(clinic), buttons: actionButtons(clinic) }).toEqual(before)
    expect(status().textContent).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

describe('AC-7704.3·AC-7704.4 정하기·빼기 보내기·끝 알림·실패 (multi-admin)', () => {
  it('AC-7704.3: 정하기 확인 → set_admin(그 병원, true) 한 번, 줄은 승인 탭에 그대로 `관리자` 표 + [관리자 빼기], 끝 알림, 초점은 지금 탭, 목록을 다시 읽지 않는다', async () => {
    const user = await renderApproved(MARKS_OWNER)
    await user.click(rowButton('바른정형외과의원', '관리자로 정하기'))
    await user.click(within(addDialog()).getByRole('button', { name: '관리자로 정하기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_admin', { p_hospital_id: 'h1', p_admin: true })
    expect(badgeOf('바른정형외과의원')).toBe('관리자')
    expect(actionButtons('바른정형외과의원')).toEqual(['관리자 빼기'])
    expect(status().textContent).toBe('바른정형외과의원 계정을 관리자로 정했어요.')
    hasAll(status(), 'flex items-center text-small text-positive')
    expect(status().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.activeElement).toBe(tabNamed('승인'))
    expect(tabNames()).toEqual(['대기 1', '승인 4', '거절 1'])
    expect(table().getAttribute('aria-label')).toBe('승인 신청')
    // 다른 줄은 그대로
    expect(badgeOf('하늘마취통증의학과의원')).toBeNull()
    expect(actionButtons('하늘마취통증의학과의원')).toEqual(['관리자로 정하기'])
    expect(badgeOf('새봄재활의학과의원')).toBe('관리자')
    expect(badgeOf('한결정형외과의원')).toBe('주 관리자')
    // 다시 읽지 않는다
    expect(order).toHaveBeenCalledTimes(1)
    expect(marksRpc).toHaveBeenCalledTimes(1)
  })

  it('AC-7704.3: 빼기 확인 → set_admin(그 병원, false) 한 번, 표 없음 + [관리자로 정하기], 끝 알림, 초점은 지금 탭, 다시 읽지 않는다', async () => {
    const user = await renderApproved(MARKS_OWNER)
    await user.click(rowButton('새봄재활의학과의원', '관리자 빼기'))
    await user.click(within(removeDialog()).getByRole('button', { name: '빼기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_admin', { p_hospital_id: 'h3', p_admin: false })
    expect(badgeOf('새봄재활의학과의원')).toBeNull()
    expect(clinicCell(rowOf('새봄재활의학과의원')).childElementCount).toBe(0)
    expect(actionButtons('새봄재활의학과의원')).toEqual(['관리자로 정하기'])
    expect(status().textContent).toBe('새봄재활의학과의원 계정을 관리자에서 뺐어요.')
    expect(document.activeElement).toBe(tabNamed('승인'))
    expect(badgeOf('한결정형외과의원')).toBe('주 관리자')
    expect(order).toHaveBeenCalledTimes(1)
    expect(marksRpc).toHaveBeenCalledTimes(1)
  })

  it('AC-7704.3: 정한 줄을 다시 빼면 처음 모양으로 돌아온다. 확인 창이 떠 있는 동안 앞 끝 알림은 그대로다', async () => {
    const user = await renderApproved(MARKS_OWNER)
    await user.click(rowButton('바른정형외과의원', '관리자로 정하기'))
    await user.click(within(addDialog()).getByRole('button', { name: '관리자로 정하기' }))
    await user.click(rowButton('바른정형외과의원', '관리자 빼기'))
    expect(removeDialog()).toBeTruthy()
    expect(status().textContent).toBe('바른정형외과의원 계정을 관리자로 정했어요.')
    await user.click(within(removeDialog()).getByRole('button', { name: '빼기' }))
    expect(rpc.mock.calls).toEqual([
      ['set_admin', { p_hospital_id: 'h1', p_admin: true }],
      ['set_admin', { p_hospital_id: 'h1', p_admin: false }],
    ])
    expect(badgeOf('바른정형외과의원')).toBeNull()
    expect(actionButtons('바른정형외과의원')).toEqual(['관리자로 정하기'])
    expect(status().textContent).toBe('바른정형외과의원 계정을 관리자에서 뺐어요.')
  })

  it('AC-7704.3: 보내는 동안 표의 동작 단추가 모두 막히고(두 번 보내지 않음), 끝나면 풀린다', async () => {
    let resolve: (v: unknown) => void = () => {}
    rpc.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = await renderApproved(MARKS_OWNER)
    const button = rowButton('바른정형외과의원', '관리자로 정하기')
    await user.click(button)
    await user.click(within(addDialog()).getByRole('button', { name: '관리자로 정하기' }))
    const buttons = within(table()).getAllByRole<HTMLButtonElement>('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['관리자로 정하기', '관리자로 정하기', '관리자 빼기'])
    for (const b of buttons) expect(b.disabled, b.textContent ?? '').toBe(true)
    await user.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ data: null, error: null, status: 204 }))
    for (const b of within(table()).getAllByRole<HTMLButtonElement>('button')) expect(b.disabled).toBe(false)
  })

  it('AC-7704.4: set_admin이 실패하면 줄·표시·단추는 그대로, 탭 줄과 표 사이에 E-ADMIN-ROLE 카드(원래 오류 글 없음), 초점은 처음 누른 줄 단추, 저절로 다시 보내지 않는다', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: ROLE_RAW }, status: 403 })
    const user = await renderApproved(MARKS_OWNER)
    const opener = rowButton('바른정형외과의원', '관리자로 정하기')
    await user.click(opener)
    await user.click(within(addDialog()).getByRole('button', { name: '관리자로 정하기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const card = screen.getByRole('alert')
    expect(card.textContent).toContain('관리자를 정하거나 빼지 못했어요')
    expect(card.textContent).toContain('인터넷 연결을 확인하고 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.')
    expect(card.textContent).toContain('오류 번호 E-ADMIN-ROLE')
    expect(card.textContent).toContain(errorInfo('E-ADMIN-ROLE').what)
    expect(card.textContent).not.toContain('E-ADMIN-FAILED')
    expect(document.body.textContent).not.toContain('secret-detail')
    expect(tablist().compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(table()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(status().textContent).toBe('')
    expect(badgeOf('바른정형외과의원')).toBeNull()
    expect(actionButtons('바른정형외과의원')).toEqual(['관리자로 정하기'])
    expect(document.activeElement).toBe(opener)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('AC-7704.4: 빼기가 던져도(연결 끊김) 줄은 그대로 E-ADMIN-ROLE 카드, 다시 해서 되면 카드가 끝 알림으로 바뀐다', async () => {
    rpc.mockRejectedValueOnce(new Error(`fetch failed ${ROLE_RAW}`))
    const user = await renderApproved(MARKS_OWNER)
    const opener = rowButton('새봄재활의학과의원', '관리자 빼기')
    await user.click(opener)
    await user.click(within(removeDialog()).getByRole('button', { name: '빼기' }))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-ADMIN-ROLE')
    expect(badgeOf('새봄재활의학과의원')).toBe('관리자')
    expect(actionButtons('새봄재활의학과의원')).toEqual(['관리자 빼기'])
    expect(document.activeElement).toBe(opener)
    expect(document.body.textContent).not.toContain('secret-detail')
    await user.click(rowButton('새봄재활의학과의원', '관리자 빼기'))
    await user.click(within(removeDialog()).getByRole('button', { name: '빼기' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(status().textContent).toBe('새봄재활의학과의원 계정을 관리자에서 뺐어요.')
    expect(badgeOf('새봄재활의학과의원')).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('AC-7704.4: 탭을 바꾸면 끝 알림·E-ADMIN-ROLE 카드가 지워진다. 가입 상태 바꾸기 실패는 지금처럼 E-ADMIN-FAILED다', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: ROLE_RAW }, status: 0 })
    const user = await renderApproved(MARKS_OWNER)
    await user.click(rowButton('바른정형외과의원', '관리자로 정하기'))
    await user.click(within(addDialog()).getByRole('button', { name: '관리자로 정하기' }))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-ADMIN-ROLE')
    await user.click(tabNamed('대기'))
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(tabNamed('승인'))
    await user.click(rowButton('바른정형외과의원', '관리자로 정하기'))
    await user.click(within(addDialog()).getByRole('button', { name: '관리자로 정하기' }))
    expect(status().textContent).toBe('바른정형외과의원 계정을 관리자로 정했어요.')
    await user.click(tabNamed('대기'))
    expect(status().textContent).toBe('')
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: RAW }, status: 403 })
    await user.click(within(rowOf('맑은정형외과의원')).getByRole('button', { name: '승인' }))
    const cards = screen.getAllByRole('alert')
    expect(cards).toHaveLength(1)
    expect(cards[0].textContent).toContain('오류 번호 E-ADMIN-FAILED')
    expect(cards[0].textContent).not.toContain('E-ADMIN-ROLE')
  })
})

// ── admin-view: '승인' 탭 이름 눌러 보기·지역 칸·안쪽 메뉴·세 목록 함께 읽기·신청자 · 이메일 한 칸
// (REQ-8012·REQ-8022, design.md '관리자 화면'·'가입 승인 표 2차', 시안 docs/mockups/admin-view ?s=admin-list).
// 자료는 지어낸 값이다(의원 이름·사람 이름·@fake.test 메일·가짜 주소). 내 의원 = 가나(주 관리자), 다른 관리자 = 사아
const AV_ROWS = [
  { id: 'p-beoseo', name: '버서 정형외과의원', applicant_name: '서버서', phone: '0255501111', email: 'beoseo@fake.test', status: 'pending', emr: 'bit', created_at: '2026-11-23T01:00:00+00:00' },
  { id: 'h-dara', name: '다라 정형외과의원', applicant_name: '이다라', phone: '0255502345', email: 'dara@fake.test', status: 'approved', emr: 'bit', created_at: '2026-11-20T01:00:00+00:00' },
  { id: 'h-reomeo', name: '러머 정형외과의원', applicant_name: '오러머', phone: null, email: 'reomeo@fake.test', status: 'approved', emr: 'bit', created_at: '2026-11-17T01:00:00+00:00' },
  { id: 'h-kata', name: '카타 통증의학과의원', applicant_name: '최카타', phone: '03155506789', email: 'kata@fake.test', status: 'approved', emr: 'bit', created_at: '2026-11-10T01:00:00+00:00' },
  { id: 'h-saa', name: '사아 재활의학과의원', applicant_name: '정사아', phone: '0255504567', email: 'saa@fake.test', status: 'approved', emr: 'bit', created_at: '2026-11-06T01:00:00+00:00' },
  { id: 'r-test', name: '시험 정형외과', applicant_name: '오시험', phone: null, email: 'test@fake.test', status: 'rejected', emr: 'other', created_at: '2026-11-02T01:00:00+00:00' },
  { id: 'h-gana', name: '가나 정형외과의원', applicant_name: '김가나', phone: '01055501234', email: 'gana@fake.test', status: 'approved', emr: 'bit', created_at: '2026-09-14T01:00:00+00:00' },
]
const AV_MARKS = [
  { hospital_id: 'h-gana', is_me: true, is_owner: true },
  { hospital_id: 'h-saa', is_me: false, is_owner: false },
]
// admin_view_hospitals() 답. 지역 = 관리자가 정한 값 → 주소에서 읽은 시·도 → 지역 모름
const AV_VIEWS = [
  { hospital_id: 'h-dara', name: '다라 정형외과의원', address: '서울특별시 가짜구 가짜로 1', region_set: false, region: null, is_me: false }, // 주소 → 서울
  { hospital_id: 'h-reomeo', name: '러머 정형외과의원', address: null, region_set: false, region: null, is_me: false }, // 주소 없음 → 지역 모름
  { hospital_id: 'h-kata', name: '카타 통증의학과의원', address: '서울 예시구 예시로 12', region_set: true, region: '경기' }, // 정한 값 먼저 → 경기
  { hospital_id: 'h-saa', name: '사아 재활의학과의원', address: '부산광역시 예시구 예시로 3', region_set: true, region: null, is_me: false }, // 지역 모름으로 정함
  { hospital_id: 'h-gana', name: '가나 정형외과의원', address: '서울시 예시구 예시로 12, 3층', region_set: false, region: null, is_me: true },
].map((v) => ({ is_me: false, ...v }))
const VIEW_KEY = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0'
const VIEW_RAW = 'permission denied for function start_admin_view secret-detail'
const UNKNOWN_TIP = '병원 정보에 주소가 없어 지역을 몰라요. 골라 주세요.'
const NOT_MINE = ['다라 정형외과의원', '러머 정형외과의원', '카타 통증의학과의원', '사아 재활의학과의원']

const nameCell = (clinic: string) => cellUnder(rowOf(clinic), '의원 이름')
const viewButton = (clinic: string) => within(nameCell(clinic)).queryByRole<HTMLButtonElement>('button')
const regionBox = (clinic: string) => within(cellUnder(rowOf(clinic), '지역')).getByRole<HTMLSelectElement>('combobox')
const chosen = (box: HTMLSelectElement) => box.selectedOptions[0]?.textContent

async function renderAdminView(ui: ReactNode = <AdminApplications />) {
  order.mockResolvedValue({ data: AV_ROWS, error: null, status: 200 })
  marksRpc.mockResolvedValue({ data: AV_MARKS, error: null, status: 200 })
  viewRpc.mockResolvedValue({ data: AV_VIEWS, error: null, status: 200 })
  const user = userEvent.setup()
  render(ui)
  await screen.findByRole('tablist', { name: '신청 상태' })
  await user.click(tabNamed('승인'))
  return user
}

// jsdom의 location.assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로(SignOutButton.test.tsx와 같은 방법)
const fakeLocation = () => {
  const assign = vi.fn()
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/admin', pathname: '/admin', assign, replace: vi.fn() })
  return assign
}

describe('AC-8012.1 승인 줄 의원 이름 눌러 보기', () => {
  it('AC-8012.1: 안내 글 끝에 `의원 이름을 누르면 그 의원 화면을 읽기만 할 수 있어요.`(시안 T.adminIntro 그대로)', async () => {
    await renderLoaded()
    const intro = screen.getByText(INTRO)
    expect(intro.textContent?.endsWith(' 의원 이름을 누르면 그 의원 화면을 읽기만 할 수 있어요.')).toBe(true)
  })

  it('AC-8012.1: 내 줄이 아닌 의원 이름은 눈 14 + 파랑(accent-strong) 600 글자 단추 — 마우스 글 `{의원 이름} 화면 보기 (읽기만)`, 관리자 칩은 그 뒤', async () => {
    await renderAdminView()
    const eye = render(<Icon name="eye" size={14} />).container.querySelector('svg')?.innerHTML
    for (const clinic of NOT_MINE) {
      const b = viewButton(clinic)
      if (b === null) throw new Error(`${clinic} 이름 단추 없음`)
      expect(b.textContent, clinic).toBe(clinic)
      expect(b.getAttribute('title')).toBe(`${clinic} 화면 보기 (읽기만)`)
      expect(b.getAttribute('type')).toBe('button')
      hasAll(b, 'inline-flex min-w-0 max-w-full items-center gap-1.5 font-semibold text-accent-strong')
      const svg = b.querySelector('svg')
      expect(svg?.getAttribute('aria-hidden')).toBe('true')
      expect([svg?.getAttribute('width'), svg?.getAttribute('height')]).toEqual(['14', '14'])
      expect(svg?.innerHTML).toBe(eye)
      hasAll(b.querySelector('span') as Element, 'truncate')
      const group = b.parentElement as Element
      expect(group.parentElement).toBe(nameCell(clinic))
      hasAll(group, 'flex min-w-0 items-center gap-1.5')
      expect(group.firstElementChild).toBe(b)
    }
    // 다른 관리자 줄(사아): 칩은 단추 뒤
    const saa = viewButton('사아 재활의학과의원') as HTMLButtonElement
    expect(saa.nextElementSibling?.textContent).toBe('관리자')
    hasAll(saa.nextElementSibling as Element, ds.chip.accent)
    // 칸 title은 지금처럼 의원 이름 그대로
    expect(nameCell('다라 정형외과의원').getAttribute('title')).toBe('다라 정형외과의원')
  })

  it('AC-8012.1: 이름 단추는 올리면 밑줄(아래 3px), 키보드 초점 고리, 보내는 동안 막힘 모양 — 폰 전용 클래스 없음', async () => {
    await renderAdminView()
    const b = viewButton('다라 정형외과의원') as HTMLButtonElement
    hasAll(b, `underline-offset-3 not-disabled:hover:underline cursor-pointer rounded-control ${ds.focusRing} disabled:cursor-not-allowed disabled:opacity-40`)
    expect(classesOf(b).filter((t) => t.startsWith('max-md:'))).toEqual([])
    expect(classesOf(b).filter((t) => /^(?:bg-|border)/.test(t))).toEqual([]) // 글자 단추(바탕·테두리 없음)
  })

  it('AC-8012.1: 내 줄 이름은 보통 글자(단추 없음) — 칩만 뒤에', async () => {
    await renderAdminView()
    expect(viewButton('가나 정형외과의원')).toBeNull()
    const group = nameCell('가나 정형외과의원').firstElementChild as Element
    expect(Array.from(group.children).map((el) => [el.tagName, el.textContent])).toEqual([
      ['SPAN', '가나 정형외과의원'],
      ['SPAN', '주 관리자'],
    ])
  })

  it('AC-8012.1: 대기·거절 탭의 의원 이름은 단추가 아니다(보기는 승인된 의원만)', async () => {
    const user = await renderAdminView()
    await user.click(tabNamed('대기'))
    expect(viewButton('버서 정형외과의원')).toBeNull()
    expect(nameCell('버서 정형외과의원').textContent).toBe('버서 정형외과의원')
    await user.click(tabNamed('거절'))
    expect(viewButton('시험 정형외과')).toBeNull()
  })

  it('AC-8012.1: 누르면 확인 창 없이 start_admin_view(그 병원) 한 번 → 받은 열쇠를 보기 쿠키에(setViewKey) → /dashboard를 새로 연다', async () => {
    const assign = fakeLocation()
    rpc.mockResolvedValueOnce({ data: VIEW_KEY.toUpperCase(), error: null, status: 200 })
    const user = await renderAdminView()
    await user.click(viewButton('다라 정형외과의원') as HTMLButtonElement)
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith('/dashboard'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('start_admin_view', { p_hospital_id: 'h-dara' })
    expect(setViewKey).toHaveBeenCalledExactlyOnceWith(VIEW_KEY)
    // 차례: 시작 → 쿠키 → 새로 열기
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(setViewKey.mock.invocationCallOrder[0])
    expect(setViewKey.mock.invocationCallOrder[0]).toBeLessThan(assign.mock.invocationCallOrder[0])
    // 목록은 다시 읽지 않는다
    expect(order).toHaveBeenCalledTimes(1)
    expect(viewRpc).toHaveBeenCalledTimes(1)
  })

  it('AC-8012.1: 보기를 여는 동안 표의 단추·지역 상자는 막힌다(두 번 열지 않음)', async () => {
    fakeLocation()
    rpc.mockReturnValueOnce(new Promise(() => {}))
    const user = await renderAdminView()
    await user.click(viewButton('다라 정형외과의원') as HTMLButtonElement)
    for (const b of within(table()).getAllByRole<HTMLButtonElement>('button')) expect(b.disabled, b.textContent ?? '').toBe(true)
    expect(regionBox('다라 정형외과의원').disabled).toBe(true)
    await user.click(viewButton('러머 정형외과의원') as HTMLButtonElement)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('AC-8012.1: 시작이 실패하면 그 자리(탭 줄과 표 사이)에 E-VIEW-START 카드 — 쿠키·이동 없음, 원래 오류 글 없음, 초점은 누른 이름, 다시 누를 수 있다', async () => {
    const assign = fakeLocation()
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: VIEW_RAW }, status: 400 })
    const user = await renderAdminView()
    const b = viewButton('다라 정형외과의원') as HTMLButtonElement
    await user.click(b)
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-VIEW-START').what)
    expect(card.textContent).toContain('오류 번호 E-VIEW-START')
    expect(tablist().compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(table()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(setViewKey).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('secret-detail')
    expect(status().textContent).toBe('')
    await waitFor(() => expect(document.activeElement).toBe(viewButton('다라 정형외과의원')))
    expect((viewButton('다라 정형외과의원') as HTMLButtonElement).disabled).toBe(false)
    // 열쇠 모양이 아닌 답도 같은 카드
    cleanup()
    rpc.mockResolvedValueOnce({ data: 'not-a-key', error: null, status: 200 })
    const again = await renderAdminView()
    await again.click(viewButton('러머 정형외과의원') as HTMLButtonElement)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-VIEW-START')
    expect(setViewKey).not.toHaveBeenCalled()
  })
})

describe('AC-8012.2 승인 탭 지역 칸', () => {
  it('AC-8012.2·AC-8022.2: 승인 탭만 의원 이름 다음에 새 칸 `지역`(2차 폭 108px) — 대기·거절 탭에는 없다', async () => {
    const user = await renderAdminView()
    const heads = () => within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads()).toEqual(APPROVED_COLUMNS)
    hasAll(within(table()).getByRole('columnheader', { name: '지역' }), `${ds.table.th} w-27`)
    await user.click(tabNamed('대기'))
    expect(heads()).toEqual(COLUMNS)
    expect(within(table()).queryAllByRole('combobox')).toEqual([])
    await user.click(tabNamed('거절'))
    expect(heads()).toEqual(COLUMNS)
    expect(within(table()).queryAllByRole('combobox')).toEqual([])
  })

  it('AC-8012.2: 값 = 관리자가 정한 지역 → 주소에서 읽은 시·도 → `지역 모름`(정함 포함), 고르기 = 17개(시안 차례) + `지역 모름`', async () => {
    await renderAdminView()
    expect(NOT_MINE.concat('가나 정형외과의원').map((c) => chosen(regionBox(c)))).toEqual(['서울', '지역 모름', '경기', '지역 모름', '서울'])
    const box = regionBox('다라 정형외과의원')
    expect(Array.from(box.options).map((o) => [o.value, o.textContent])).toEqual([...SIDO_LIST.map((s) => [s, s]), ['', '지역 모름']])
    expect(box.getAttribute('aria-label')).toBe('다라 정형외과의원 지역')
  })

  it('AC-8012.2: 고르기 상자는 32px(설정 예약 칸 SELECT 모양) — `지역 모름`은 주황 글자 500 + 마우스 글, 아는 지역은 ink·마우스 글 없음', async () => {
    await renderAdminView()
    const known = regionBox('다라 정형외과의원')
    const unknown = regionBox('러머 정형외과의원')
    for (const box of [known, unknown]) {
      hasAll(box, `h-8 cursor-pointer rounded-control border border-line-strong bg-surface px-1.5 text-small ${ds.focusRing}`)
      expect(classesOf(box).filter((t) => t.startsWith('max-md:'))).toEqual([])
    }
    hasAll(known, 'text-ink')
    expect(classesOf(known)).not.toContain('text-warning')
    expect(known.getAttribute('title')).toBeNull()
    hasAll(unknown, 'text-warning font-medium')
    expect(classesOf(unknown)).not.toContain('text-ink')
    expect(unknown.getAttribute('title')).toBe(UNKNOWN_TIP)
    hasAll(cellUnder(rowOf('다라 정형외과의원'), '지역'), ds.table.td)
  })

  it('AC-8012.2: 바꾸면 set_hospital_region(그 병원, 고른 지역) 한 번 → 그 줄 값만 바뀌고 완료 줄 `{의원 이름} 지역을 {지역}로/으로 바꿨어요.` — 다시 읽지 않고 초점은 그 상자', async () => {
    const user = await renderAdminView()
    await user.selectOptions(regionBox('다라 정형외과의원'), '부산')
    await waitFor(() => expect(status().textContent).toBe('다라 정형외과의원 지역을 부산으로 바꿨어요.'))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_region', { p_hospital_id: 'h-dara', p_sido: '부산' })
    expect(chosen(regionBox('다라 정형외과의원'))).toBe('부산')
    expect(NOT_MINE.concat('가나 정형외과의원').map((c) => chosen(regionBox(c)))).toEqual(['부산', '지역 모름', '경기', '지역 모름', '서울'])
    expect(order).toHaveBeenCalledTimes(1)
    expect(marksRpc).toHaveBeenCalledTimes(1)
    expect(viewRpc).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(regionBox('다라 정형외과의원'))
    hasAll(status(), 'text-small text-positive')
  })

  it('AC-8012.2: 받침 따라 로·으로 — 지역 모름 → 경기는 `경기로`(주황 글자·마우스 글이 사라짐), 서울(ㄹ 받침)은 `서울로`', async () => {
    const user = await renderAdminView()
    await user.selectOptions(regionBox('러머 정형외과의원'), '경기')
    await waitFor(() => expect(status().textContent).toBe('러머 정형외과의원 지역을 경기로 바꿨어요.'))
    expect(classesOf(regionBox('러머 정형외과의원'))).not.toContain('text-warning')
    expect(regionBox('러머 정형외과의원').getAttribute('title')).toBeNull()
    await user.selectOptions(regionBox('카타 통증의학과의원'), '서울')
    await waitFor(() => expect(status().textContent).toBe('카타 통증의학과의원 지역을 서울로 바꿨어요.'))
    expect(rpc).toHaveBeenLastCalledWith('set_hospital_region', { p_hospital_id: 'h-kata', p_sido: '서울' })
  })

  it('AC-8012.2: `지역 모름`을 고르면 p_sido null로 한 번 — `지역 모름으로`, 주황 글자 + 마우스 글', async () => {
    const user = await renderAdminView()
    await user.selectOptions(regionBox('다라 정형외과의원'), '지역 모름')
    await waitFor(() => expect(status().textContent).toBe('다라 정형외과의원 지역을 지역 모름으로 바꿨어요.'))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_hospital_region', { p_hospital_id: 'h-dara', p_sido: null })
    expect(chosen(regionBox('다라 정형외과의원'))).toBe('지역 모름')
    hasAll(regionBox('다라 정형외과의원'), 'text-warning font-medium')
    expect(regionBox('다라 정형외과의원').getAttribute('title')).toBe(UNKNOWN_TIP)
  })

  it('AC-8012.2: 실패하면 그 자리 E-REGION-SAVE 카드이고 값은 그대로 — 완료 줄 없음, 원래 오류 글 없음, 저절로 다시 보내지 않음, 초점은 그 상자', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'invalid region secret-detail' }, status: 400 })
    const user = await renderAdminView()
    await user.selectOptions(regionBox('다라 정형외과의원'), '부산')
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-REGION-SAVE').what)
    expect(card.textContent).toContain('오류 번호 E-REGION-SAVE')
    expect(chosen(regionBox('다라 정형외과의원'))).toBe('서울')
    expect(status().textContent).toBe('')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('secret-detail')
    await waitFor(() => expect(document.activeElement).toBe(regionBox('다라 정형외과의원')))
    // 다시 골라 되면 카드가 완료 줄로 바뀐다
    rpc.mockResolvedValue({ data: null, error: null, status: 204 })
    await user.selectOptions(regionBox('다라 정형외과의원'), '부산')
    await waitFor(() => expect(status().textContent).toBe('다라 정형외과의원 지역을 부산으로 바꿨어요.'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-8012.1·AC-8012.2: 보기 목록(admin_view_hospitals)에 없는 승인 줄(이 화면에서 막 승인한 줄)은 이름이 보통 글자이고 `지역 모름`, 고치면 그 값으로 바뀐다', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 204 })
    const user = await renderAdminView()
    await user.click(tabNamed('대기'))
    await user.click(within(rowOf('버서 정형외과의원')).getByRole('button', { name: '승인' }))
    await user.click(tabNamed('승인'))
    expect(chosen(regionBox('버서 정형외과의원'))).toBe('지역 모름')
    // 보기 단추는 DB가 준 보기 목록의 줄에만(다시 읽으면 생긴다)
    expect(viewButton('버서 정형외과의원')).toBeNull()
    expect(nameCell('버서 정형외과의원').textContent).toBe('버서 정형외과의원')
    await user.selectOptions(regionBox('버서 정형외과의원'), '대구')
    await waitFor(() => expect(status().textContent).toBe('버서 정형외과의원 지역을 대구로 바꿨어요.'))
    expect(chosen(regionBox('버서 정형외과의원'))).toBe('대구')
  })

  it('AC-8012.2·AC-8022.2: 칸이 늘어난 승인 표는 PC에서 1232px보다 좁으면 옆으로 밀린다(2차 md:min-w-308) — 대기·거절 표에는 최소 폭이 없다', async () => {
    const user = await renderAdminView()
    expect(classesOf(table()).filter((t) => /min-w-/.test(t))).toEqual(['md:min-w-308'])
    hasAll(table().parentElement as Element, ds.table.wrap)
    await user.click(tabNamed('대기'))
    expect(classesOf(table()).filter((t) => /min-w-/.test(t))).toEqual([])
  })

  it('AC-8012.2·AC-204.7: 지역 칸이 있는 승인 탭에도 상자 안 상자가 없고, 줄·칸 클래스는 줄마다 같다', async () => {
    await renderAdminView()
    expect(nestedBoxes(document.body)).toEqual([])
    const first = rowOf('다라 정형외과의원')
    for (const clinic of NOT_MINE.slice(1).concat('가나 정형외과의원')) {
      expect(classesOf(rowOf(clinic))).toEqual(classesOf(first))
      within(rowOf(clinic))
        .getAllByRole('cell')
        .forEach((c, i) => expect(classesOf(c), `${clinic} ${i}`).toEqual(classesOf(within(first).getAllByRole('cell')[i])))
    }
  })
})

describe('AC-8012.4 관리자 화면 안쪽 메뉴 · 보는 중에도 숨김 없음', () => {
  it('AC-8012.4: 제목 바로 아래 안쪽 메뉴 `가입 승인`(지금) | `의원 비교`(/admin/compare), 안내 글은 그 아래', async () => {
    await renderLoaded()
    const nav = screen.getByRole('navigation', { name: '관리자 안 메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')])).toEqual([
      ['가입 승인', '/admin', 'page'],
      ['의원 비교', '/admin/compare', null],
    ])
    const h1 = screen.getByRole('heading', { level: 1, name: '가입 승인' })
    expect(h1.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nav.compareDocumentPosition(screen.getByText(INTRO)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-8012.4: 읽는 동안에도 안쪽 메뉴는 보인다(목록과 상관없음)', () => {
    order.mockReturnValue(new Promise(() => {}))
    render(<AdminApplications />)
    expect(screen.getByRole('navigation', { name: '관리자 안 메뉴' })).toBeTruthy()
  })

  it('AC-8012.4: 다른 의원을 보는 중(ViewingProvider viewing)이어도 숨김이 없다 — 승인·거절·되돌리기·관리자 정하기·빼기·지역·이름 단추가 지금처럼 있고 된다', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 204 })
    const user = await renderAdminView(
      <ViewingProvider viewing={{ hospitalId: 'h-dara', name: '다라 정형외과의원' }}>
        <AdminApplications />
      </ViewingProvider>,
    )
    for (const clinic of NOT_MINE) expect(viewButton(clinic), clinic).not.toBeNull()
    expect(actionButtons('다라 정형외과의원')).toEqual(['관리자로 정하기'])
    expect(actionButtons('사아 재활의학과의원')).toEqual(['관리자 빼기'])
    await user.selectOptions(regionBox('다라 정형외과의원'), '부산')
    await waitFor(() => expect(status().textContent).toBe('다라 정형외과의원 지역을 부산으로 바꿨어요.'))
    await user.click(tabNamed('대기'))
    expect(actionButtons('버서 정형외과의원')).toEqual(['승인', '거절'])
    await user.click(tabNamed('거절'))
    expect(actionButtons('시험 정형외과')).toEqual(['되돌리기'])
  })

  it('AC-8012.4: 관리자 화면 부품은 읽기만 바탕(useReadOnly·WriteOnly·useViewing)을 쓰지 않는다 — 설치 파일 칸(InstallFilesAdmin)은 고치지 않음', () => {
    for (const file of ['./AdminApplications.tsx', './AdminViewLog.tsx', './AdminNav.tsx', './InstallFilesAdmin.tsx']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
      expect(source, file).not.toMatch(/useReadOnly|WriteOnly|useViewing|ReadOnlyArea|shell\/viewing/)
    }
  })
})

describe('AC-8012.5 세 목록을 한 번에', () => {
  it('AC-8012.5: listApplications(hospitals)·listAdminHospitals(admin_hospitals)·listViewHospitals(admin_view_hospitals)를 한 번씩 — 셋이 다 온 뒤에 탭·표를 그린다', async () => {
    let resolve: (v: unknown) => void = () => {}
    viewRpc.mockReturnValue(new Promise((r) => (resolve = r)))
    const { container } = render(<AdminApplications />)
    await waitFor(() => expect(viewRpc).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(order).toHaveBeenCalledTimes(1)
    expect(marksRpc).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
    await act(async () => resolve({ data: DB_VIEWS, error: null, status: 200 }))
    expect(tablist()).toBeTruthy()
    expect(viewRpc).toHaveBeenCalledExactlyOnceWith('admin_view_hospitals')
    expect(from).toHaveBeenCalledExactlyOnceWith('hospitals')
    expect(marksRpc).toHaveBeenCalledExactlyOnceWith('admin_hospitals')
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['답 오류', { data: null, error: { code: '42501', message: VIEW_RAW }, status: 403 }],
    ['목록이 아님', { data: { hospital_id: 'r3' }, error: null, status: 200 }],
    ['줄 모양 틀림', { data: [{ hospital_id: 'r3', name: '마바 정형외과의원' }], error: null, status: 200 }],
  ])('AC-8012.5: 보기 목록을 읽지 못하면(%s) 다른 목록 실패와 같이 던진다 → 화면 오류(E-PAGE-FAILED + [다시 시도])', async (_label, answer) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    viewRpc.mockResolvedValue(answer)
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
    expect(caught).toBeInstanceOf(AdminViewError)
    expect(document.body.textContent).not.toContain('secret-detail')
  })

  it('AC-8012.5: 화면을 떠난 뒤 보기 목록이 와도 오류 없이 버린다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolve: (v: unknown) => void = () => {}
    viewRpc.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = render(<AdminApplications />)
    await waitFor(() => expect(viewRpc).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => resolve({ data: DB_VIEWS, error: null, status: 200 }))
    expect(error).not.toHaveBeenCalled()
  })
})

describe('AC-8012.3 bottom 자리(본 기록)', () => {
  it('AC-8012.3: bottom으로 넘긴 칸은 신청 표(탭 패널) 아래에 그린다', async () => {
    render(<AdminApplications bottom={<section aria-label="아래 칸">아래 칸</section>} />)
    await screen.findByRole('tablist', { name: '신청 상태' })
    const bottom = screen.getByRole('region', { name: '아래 칸' })
    expect(screen.getByRole('tabpanel').compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-8012.3: bottom이 없으면 지금 그대로다(아래 칸 없음)', async () => {
    render(<AdminApplications />)
    await screen.findByRole('tablist', { name: '신청 상태' })
    expect(screen.queryByRole('region', { name: '아래 칸' })).toBeNull()
  })
})

describe('AC-8022.1 신청자 · 이메일 한 칸 두 줄', () => {
  it('AC-8022.1: 승인·대기·거절 세 탭 모두 `신청자`·`이메일` 두 칸 대신 한 칸 `신청자 · 이메일` — 첫 줄 이름, 둘째 줄 메일(caption muted, 시안 .who2 .e), 메일 줄 바꿈 자리는 `@` 뒤', async () => {
    const user = await renderAdminView()
    for (const [label, clinic, name, mail] of [
      ['승인', '다라 정형외과의원', '이다라', 'dara@fake.test'],
      ['대기', '버서 정형외과의원', '서버서', 'beoseo@fake.test'],
      ['거절', '시험 정형외과', '오시험', 'test@fake.test'],
    ] as const) {
      await user.click(tabNamed(label))
      const heads = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
      expect(heads.filter((h) => h === '신청자 · 이메일'), label).toHaveLength(1)
      expect(heads.filter((h) => h === '신청자' || h === '이메일'), label).toEqual([])
      const lines = whoLines(rowOf(clinic))
      expect(lines.map((el) => [el.tagName, el.textContent, el.getAttribute('title')]), label).toEqual([
        ['SPAN', name, name],
        ['SPAN', mail, mail],
      ])
      hasAll(lines[0].parentElement as Element, 'flex min-w-0 flex-col')
      hasAll(lines[1], 'text-caption text-muted')
      expect(classesOf(lines[0])).not.toContain('text-small')
      const nodes = Array.from(lines[1].childNodes).map((n) => (n.nodeType === Node.TEXT_NODE ? n.textContent : (n as Element).tagName.toLowerCase()))
      expect(nodes, label).toEqual([mail.slice(0, mail.indexOf('@') + 1), 'wbr', mail.slice(mail.indexOf('@') + 1)])
    }
  })

  it('AC-8022.1: 다른 칸·단추는 그대로 — 신청자 · 이메일 칸 안에 단추·고르기가 없고, 칸 클래스는 몸 칸(ds.table.td)', async () => {
    await renderAdminView()
    const who = cellUnder(rowOf('다라 정형외과의원'), '신청자 · 이메일')
    expect(within(who).queryAllByRole('button')).toEqual([])
    expect(within(who).queryAllByRole('combobox')).toEqual([])
    hasAll(who, `${ds.table.td} md:text-body`)
    expect(who.getAttribute('title')).toBeNull() // 마우스 글은 줄마다
  })
})

// ── admin-view 2차: '승인' 표 채울 기간 · 저절로 올림 칸 (REQ-8022 AC-8022.2~AC-8022.5, design.md '가입 승인 표 2차',
// 시안 docs/mockups/admin-view ?s=admin-list 2차 — .tnote · .sel · .au · 칸 폭). 오늘은 한국 2026-11-24(화) 낮으로 둔다(Date만 가짜 —
// 채우는 중인지는 오늘의 채울 기간 첫날로 센다). admin_auto_upload_list() 답은 시안 AUTO와 같은 모양의 지어낸 값
const UPLOAD_RAW = 'permission denied for function admin_auto_upload_list secret-detail'
const AV_UPLOADS = [
  { hospital_id: 'h-dara', months: 2, through_day: '2026-11-23', filled_from: '2026-09-01', last_ok_at: '2026-11-23T23:52:00+00:00', error_code: null, error_at: null }, // 다 올라옴
  { hospital_id: 'h-kata', months: 12, through_day: '2026-11-23', filled_from: '2026-02-01', last_ok_at: '2026-11-24T00:30:00+00:00', error_code: null, error_at: null }, // 채우는 중
  { hospital_id: 'h-saa', months: 3, through_day: '2026-11-20', filled_from: '2026-08-01', last_ok_at: '2026-11-20T23:47:00+00:00', error_code: 'E-HELPER-OLD', error_at: '2026-11-21T00:10:00+00:00' }, // 실패
  { hospital_id: 'h-reomeo', months: 2, through_day: null, filled_from: null, last_ok_at: null, error_code: null, error_at: null }, // 아직 없음
  { hospital_id: 'h-gana', months: 120, through_day: '2026-11-23', filled_from: '2024-03-01', last_ok_at: '2026-11-23T23:05:00+00:00', error_code: null, error_at: null }, // 10년 채우는 중
]
// 시안 '화면 글자' 2차 표 위 안내 줄(T.autoNoteB · T.autoNote)
const AUTO_NOTE =
  '저절로 올림 · 의원 비트 PC에서 그날 처음 앱을 열면, 어제까지 아직 안 올라온 날의 매출·통계 숫자를 사이트에 올려요. 채울 기간이 길면 최근 달부터 한 번에 5분쯤씩 나눠 채우고, 다음에 열 때 이어서 채워요. 의원 화면에는 아무것도 보이지 않아요.'
const ALL_APPROVED = [...NOT_MINE, '가나 정형외과의원']

const fillBox = (clinic: string) => within(cellUnder(rowOf(clinic), '채울 기간')).getByRole<HTMLSelectElement>('combobox')
// 저절로 올림 칸: 칸 안 두 줄 묶음과 그 줄 글
const autoBox = (clinic: string) => cellUnder(rowOf(clinic), '저절로 올림').firstElementChild as HTMLElement
const autoLines = (clinic: string) => Array.from(autoBox(clinic).children) as HTMLElement[]
const autoTexts = (clinic: string) => autoLines(clinic).map((el) => el.textContent)
const isNote = (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === AUTO_NOTE
const autoNote = () => screen.getByText(isNote)

async function renderUploads(uploads: readonly object[] = AV_UPLOADS) {
  uploadRpc.mockResolvedValue({ data: uploads, error: null, status: 200 })
  return renderAdminView()
}

describe('AC-8022.2~AC-8022.5 승인 표 채울 기간 · 저절로 올림 (2차)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-24T03:00:00+00:00')) // 한국 11월 24일 (화) 12:00
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('AC-8022.2 칸 차례 · 폭 · 안내 줄', () => {
    it('AC-8022.2: 승인 탭 칸 차례 — 신청일 · 의원 이름 · 지역 · 채울 기간 · 저절로 올림 · EMR · 신청자 · 이메일 · 연락처 · 동작. 대기·거절 탭에는 새 두 칸이 없다', async () => {
      const user = await renderUploads()
      const heads = () => within(table()).getAllByRole('columnheader').map((th) => th.textContent)
      expect(heads()).toEqual(['신청일', '의원 이름', '지역', '채울 기간', '저절로 올림', 'EMR', '신청자 · 이메일', '연락처', '동작'])
      for (const clinic of ALL_APPROVED) expect(within(rowOf(clinic)).getAllByRole('cell'), clinic).toHaveLength(9)
      expect(cellTexts(rowOf('다라 정형외과의원'))).toEqual([
        '2026-11-20',
        '다라 정형외과의원',
        '서울',
        '2달',
        '11월 23일까지',
        '비트',
        '이다라dara@fake.test',
        '02-5550-2345',
        '관리자로 정하기',
      ])
      for (const label of ['대기', '거절'] as const) {
        await user.click(tabNamed(label))
        expect(heads(), label).toEqual(COLUMNS)
        expect(within(table()).queryAllByRole('combobox'), label).toEqual([])
      }
    })

    it('AC-8022.2: 칸 폭은 시안 — 신청일 112 · 이름 184 · 지역 108 · 채울 기간 88 · 저절로 올림 248 · EMR 60 · 신청자·이메일(남은 폭) · 연락처 132 · 동작 144, 표 최소 폭 1232px(1440은 다 보이고 더 좁으면 표만 옆으로 밀림)', async () => {
      const user = await renderUploads()
      const widths = () => within(table()).getAllByRole('columnheader').map((th) => classesOf(th).filter((t) => /(?:^|:)w-/.test(t)))
      // 4px 단위: 28×4 = 112 · 46×4 = 184 · 27×4 = 108 · 22×4 = 88 · 62×4 = 248 · 15×4 = 60 · 33×4 = 132 · 36×4 = 144, 308×4 = 1232
      expect(widths()).toEqual([['w-28'], ['w-46'], ['w-27'], ['w-22'], ['w-62'], ['w-15'], [], ['w-33'], ['w-36']])
      hasAll(table(), 'md:table-fixed md:min-w-308')
      // 승인 표는 폭마다 다른 칸 폭이 없다(더 좁으면 표 전체가 옆으로 밀린다) — 대기·거절 표의 768~1023px 폭(max-lg:)은 그대로
      for (const th of within(table()).getAllByRole('columnheader')) expect(classesOf(th).filter((t) => /^max-(?:lg|md):w-/.test(t))).toEqual([])
      hasAll(table().parentElement as Element, ds.table.wrap)
      await user.click(tabNamed('대기'))
      expect(widths()).toEqual([['w-30', 'max-lg:w-29'], [], ['w-28', 'max-lg:w-24'], [], ['w-37.5', 'max-lg:w-34'], ['w-37.5']])
      expect(classesOf(table()).filter((t) => /min-w-/.test(t))).toEqual([])
    })

    it('AC-8022.2: 표 위 안내 줄 — 올림 아이콘(16, 꾸밈, muted) + `저절로 올림`(600 ink) · 안내 글(시안 그대로), small ink-2, 최대 폭 920px', async () => {
      await renderUploads()
      const note = autoNote()
      expect(note.textContent).toBe(AUTO_NOTE)
      hasAll(note, 'flex max-w-230 items-start gap-2 text-small text-ink-2')
      const icon = note.querySelector('svg') as SVGElement
      expect(note.firstElementChild).toBe(icon)
      expect(icon.getAttribute('aria-hidden')).toBe('true')
      expect(icon.getAttribute('width')).toBe('16')
      hasAll(icon, 'mt-0.5 shrink-0 text-muted')
      const upload = render(<Icon name="upload" size={16} />).container.querySelector('svg')
      expect(icon.innerHTML).toBe(upload?.innerHTML)
      const bold = note.querySelector('b') as HTMLElement
      expect(bold.textContent).toBe('저절로 올림')
      hasAll(bold, 'font-semibold text-ink')
      for (const el of [note, icon, bold]) expect(classesOf(el).filter((t) => t.startsWith('max-md:'))).toEqual([])
    })

    it('AC-8022.2: 안내 줄 자리는 탭 줄 다음 · 완료 줄과 표 앞(시안 차례). 대기·거절 탭에는 없다', async () => {
      const user = await renderUploads()
      const note = autoNote()
      expect(note.parentElement).toBe(tablist().parentElement)
      expect(tablist().nextElementSibling).toBe(note)
      expect(note.compareDocumentPosition(status()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(status().compareDocumentPosition(table()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      await user.click(tabNamed('대기'))
      expect(screen.queryByText(isNote)).toBeNull()
      expect(tablist().nextElementSibling).toBe(status())
      await user.click(tabNamed('거절'))
      expect(screen.queryByText(isNote)).toBeNull()
    })
  })

  describe('AC-8022.3 채울 기간 칸', () => {
    it('AC-8022.3: 값 = 그 의원 months(목록에 없으면 2달), 고르기 = FILL_CHOICES 아홉 — 지역 고르기와 같은 32px 상자', async () => {
      await renderUploads(AV_UPLOADS.filter((u) => u.hospital_id !== 'h-dara'))
      expect(ALL_APPROVED.map((c) => fillBox(c).selectedOptions[0]?.textContent)).toEqual(['2달', '2달', '1년', '3달', '10년'])
      const box = fillBox('카타 통증의학과의원')
      expect(Array.from(box.options).map((o) => o.textContent)).toEqual(['1달', '2달', '3달', '6달', '1년', '2년', '3년', '5년', '10년'])
      expect(box.getAttribute('aria-label')).toBe('카타 통증의학과의원 채울 기간')
      // 같은 모양: 아는 지역 상자(ink)와 클래스가 같다
      expect([...classesOf(box)].sort()).toEqual([...classesOf(regionBox('다라 정형외과의원'))].sort())
      hasAll(box, `h-8 cursor-pointer rounded-control border border-line-strong bg-surface px-1.5 text-small text-ink ${ds.focusRing}`)
      hasAll(cellUnder(rowOf('카타 통증의학과의원'), '채울 기간'), ds.table.td)
    })

    it('AC-8022.3: 늘리면 확인 창 없이 set_auto_upload_months 한 번 → 그 줄 값만 바뀌고 완료 줄 `{의원} 채울 기간을 {기간}로/으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.` — 다시 읽지 않고 초점은 그 상자', async () => {
      const user = await renderUploads()
      await user.selectOptions(fillBox('다라 정형외과의원'), '1년')
      await waitFor(() => expect(status().textContent).toBe('다라 정형외과의원 채울 기간을 1년으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.'))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(rpc).toHaveBeenCalledExactlyOnceWith('set_auto_upload_months', { p_hospital_id: 'h-dara', p_months: 12 })
      expect(ALL_APPROVED.map((c) => fillBox(c).selectedOptions[0]?.textContent)).toEqual(['1년', '2달', '1년', '3달', '10년'])
      expect(order).toHaveBeenCalledTimes(1)
      expect(marksRpc).toHaveBeenCalledTimes(1)
      expect(viewRpc).toHaveBeenCalledTimes(1)
      expect(uploadRpc).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(fillBox('다라 정형외과의원'))
      hasAll(status(), 'text-small text-positive')
    })

    it('AC-8022.3: 줄이면 `… 바꿨어요. 이미 올라온 숫자는 지우지 않아요.` — 받침 규칙은 지역과 같음(`2달`→`로`, `1년`·`10년`→`으로`, `1달`→`로`)', async () => {
      const user = await renderUploads()
      await user.selectOptions(fillBox('가나 정형외과의원'), '2달')
      await waitFor(() => expect(status().textContent).toBe('가나 정형외과의원 채울 기간을 2달로 바꿨어요. 이미 올라온 숫자는 지우지 않아요.'))
      expect(rpc).toHaveBeenLastCalledWith('set_auto_upload_months', { p_hospital_id: 'h-gana', p_months: 2 })
      await user.selectOptions(fillBox('카타 통증의학과의원'), '10년')
      await waitFor(() => expect(status().textContent).toBe('카타 통증의학과의원 채울 기간을 10년으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.'))
      await user.selectOptions(fillBox('카타 통증의학과의원'), '1년')
      await waitFor(() => expect(status().textContent).toBe('카타 통증의학과의원 채울 기간을 1년으로 바꿨어요. 이미 올라온 숫자는 지우지 않아요.'))
      await user.selectOptions(fillBox('사아 재활의학과의원'), '1달')
      await waitFor(() => expect(status().textContent).toBe('사아 재활의학과의원 채울 기간을 1달로 바꿨어요. 이미 올라온 숫자는 지우지 않아요.'))
      expect(rpc).toHaveBeenCalledTimes(4)
      expect(uploadRpc).toHaveBeenCalledTimes(1)
    })

    it('AC-8022.3: 실패하면 그 자리(탭 줄과 표 사이) E-AUTO-MONTHS 카드이고 값은 그대로 — 완료 줄 없음, 원래 오류 글 없음, 저절로 다시 보내지 않음, 초점은 그 상자', async () => {
      rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'invalid months secret-detail' }, status: 400 })
      const user = await renderUploads()
      await user.selectOptions(fillBox('다라 정형외과의원'), '5년')
      const card = await screen.findByRole('alert')
      expect(card.textContent).toContain(errorInfo('E-AUTO-MONTHS').what)
      expect(card.textContent).toContain('오류 번호 E-AUTO-MONTHS')
      expect(tablist().compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(card.compareDocumentPosition(table()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(fillBox('다라 정형외과의원').selectedOptions[0]?.textContent).toBe('2달')
      expect(autoTexts('다라 정형외과의원')).toEqual(['11월 23일까지'])
      expect(status().textContent).toBe('')
      expect(rpc).toHaveBeenCalledTimes(1)
      expect(document.body.textContent).not.toContain('secret-detail')
      await waitFor(() => expect(document.activeElement).toBe(fillBox('다라 정형외과의원')))
      // 다시 골라 되면 카드가 완료 줄로 바뀐다
      rpc.mockResolvedValue({ data: null, error: null, status: 204 })
      await user.selectOptions(fillBox('다라 정형외과의원'), '5년')
      await waitFor(() => expect(status().textContent).toBe('다라 정형외과의원 채울 기간을 5년으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.'))
      expect(screen.queryByRole('alert')).toBeNull()
      expect(fillBox('다라 정형외과의원').selectedOptions[0]?.textContent).toBe('5년')
    })

    it('AC-8022.3: 연결이 끊겨 던져도 E-AUTO-MONTHS 카드(값 그대로), 탭을 바꾸면 카드가 지워진다', async () => {
      rpc.mockRejectedValueOnce(new TypeError('Failed to fetch secret-detail'))
      const user = await renderUploads()
      await user.selectOptions(fillBox('러머 정형외과의원'), '3달')
      expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-AUTO-MONTHS')
      expect(fillBox('러머 정형외과의원').selectedOptions[0]?.textContent).toBe('2달')
      expect(document.body.textContent).not.toContain('secret-detail')
      await user.click(tabNamed('대기'))
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('AC-8022.3: 보내는 동안 표의 단추·지역·채울 기간 상자는 모두 막히고(두 번 보내지 않음), 끝나면 풀린다', async () => {
      let resolve: (v: unknown) => void = () => {}
      rpc.mockReturnValueOnce(new Promise((r) => (resolve = r)))
      const user = await renderUploads()
      await user.selectOptions(fillBox('다라 정형외과의원'), '6달')
      for (const b of within(table()).getAllByRole<HTMLButtonElement>('button')) expect(b.disabled, b.textContent ?? '').toBe(true)
      for (const box of within(table()).getAllByRole<HTMLSelectElement>('combobox')) expect(box.disabled, box.getAttribute('aria-label') ?? '').toBe(true)
      await user.selectOptions(fillBox('카타 통증의학과의원'), '6달')
      expect(rpc).toHaveBeenCalledTimes(1)
      await act(async () => resolve({ data: null, error: null, status: 204 }))
      expect(status().textContent).toBe('다라 정형외과의원 채울 기간을 6달로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.')
      for (const box of within(table()).getAllByRole<HTMLSelectElement>('combobox')) expect(box.disabled).toBe(false)
    })

    it('AC-8022.3: 상태 목록에 없는 승인 줄(이 화면에서 막 승인한 줄)은 `2달` · `아직 없음`, 바꾸면 그 값으로 바뀐다', async () => {
      rpc.mockResolvedValue({ data: null, error: null, status: 204 })
      const user = await renderUploads()
      await user.click(tabNamed('대기'))
      await user.click(within(rowOf('버서 정형외과의원')).getByRole('button', { name: '승인' }))
      await user.click(tabNamed('승인'))
      expect(fillBox('버서 정형외과의원').selectedOptions[0]?.textContent).toBe('2달')
      expect(autoTexts('버서 정형외과의원')).toEqual(['아직 없음'])
      await user.selectOptions(fillBox('버서 정형외과의원'), '2년')
      await waitFor(() => expect(status().textContent).toBe('버서 정형외과의원 채울 기간을 2년으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.'))
      expect(rpc).toHaveBeenLastCalledWith('set_auto_upload_months', { p_hospital_id: 'p-beoseo', p_months: 24 })
      expect(fillBox('버서 정형외과의원').selectedOptions[0]?.textContent).toBe('2년')
      expect(autoTexts('버서 정형외과의원')).toEqual(['아직 없음'])
    })
  })

  describe('AC-8022.4 저절로 올림 칸', () => {
    it('AC-8022.4: 값은 uploadStatus 글 — 다 올라옴·채우는 중·실패·아직 없음, 색 보통 ink · 채우는 중 둘째 줄 accent-strong · 실패 첫 줄 negative 500 · 아직 없음 muted, 마우스 글', async () => {
      await renderUploads()
      expect(ALL_APPROVED.map(autoTexts)).toEqual([
        ['11월 23일까지'],
        ['아직 없음'],
        ['11월 23일까지', '2026년 2월까지 채움'],
        ['도우미를 업데이트하세요', 'E-HELPER-OLD · 11월 20일까지'],
        ['11월 23일까지', '2024년 3월까지 채움'],
      ])
      hasAll(autoLines('다라 정형외과의원')[0], 'text-small text-ink')
      hasAll(autoLines('카타 통증의학과의원')[1], 'text-caption text-accent-strong')
      hasAll(autoLines('사아 재활의학과의원')[0], 'font-medium text-negative')
      hasAll(autoLines('사아 재활의학과의원')[1], 'text-caption text-muted')
      hasAll(autoLines('러머 정형외과의원')[0], 'text-muted')
      expect(ALL_APPROVED.map((c) => autoBox(c).getAttribute('title'))).toEqual([
        '마지막으로 올린 때 11월 24일 (화) 08:52',
        '이 의원 비트 PC에서 아직 올라온 날이 없어요.',
        '마지막으로 올린 때 11월 24일 (화) 09:30 · 채울 기간 1년 가운데 2026년 2월까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.',
        '마지막으로 올린 때 11월 21일 (토) 08:47',
        '마지막으로 올린 때 11월 24일 (화) 08:05 · 채울 기간 10년 가운데 2024년 3월까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.',
      ])
      hasAll(cellUnder(rowOf('다라 정형외과의원'), '저절로 올림'), ds.table.td)
    })

    it('AC-8022.4: 채울 기간을 바꾸면 다시 읽지 않고 손에 든 값으로 글이 바로 바뀐다 — 카타 1년(채우는 중) → 6달(다 올라옴), 다라 2달(다 올라옴) → 1년(채우는 중)', async () => {
      rpc.mockResolvedValue({ data: null, error: null, status: 204 })
      const user = await renderUploads()
      await user.selectOptions(fillBox('카타 통증의학과의원'), '6달')
      await waitFor(() => expect(autoTexts('카타 통증의학과의원')).toEqual(['11월 23일까지']))
      expect(autoBox('카타 통증의학과의원').getAttribute('title')).toBe('마지막으로 올린 때 11월 24일 (화) 09:30')
      // 다라는 9월부터 채웠다 → 1년(2025년 11월 1일부터)이면 다시 채우는 중
      await user.selectOptions(fillBox('다라 정형외과의원'), '1년')
      await waitFor(() => expect(autoTexts('다라 정형외과의원')).toEqual(['11월 23일까지', '2026년 9월까지 채움']))
      hasAll(autoLines('다라 정형외과의원')[1], 'text-accent-strong')
      expect(autoBox('다라 정형외과의원').getAttribute('title')).toContain('채울 기간 1년 가운데 2026년 9월까지 채웠어요.')
      // 다른 줄 글은 그대로, 상태 목록은 다시 읽지 않는다
      expect(autoTexts('가나 정형외과의원')).toEqual(['11월 23일까지', '2024년 3월까지 채움'])
      expect(uploadRpc).toHaveBeenCalledExactlyOnceWith('admin_auto_upload_list')
    })

    it('AC-8022.4·AC-204.7: 새 두 칸은 몸 칸(ds.table.td)이고 줄마다 칸 클래스가 같다, 상자 안 상자 없음, 칸 안 새 요소에 폰 전용 클래스 없음', async () => {
      await renderUploads()
      expect(nestedBoxes(document.body)).toEqual([])
      const first = rowOf('다라 정형외과의원')
      for (const clinic of ALL_APPROVED.slice(1)) {
        within(rowOf(clinic))
          .getAllByRole('cell')
          .forEach((c, i) => expect(classesOf(c), `${clinic} ${i}`).toEqual(classesOf(within(first).getAllByRole('cell')[i])))
      }
      for (const clinic of ALL_APPROVED) {
        for (const el of [fillBox(clinic), autoBox(clinic), ...autoLines(clinic)]) {
          expect(classesOf(el).filter((t) => t.startsWith('max-md:')), clinic).toEqual([])
        }
      }
    })
  })

  describe('AC-8022.5 네 목록을 한 번에', () => {
    it('AC-8022.5: listApplications·listAdminHospitals·listViewHospitals·listUploadStatus(admin_auto_upload_list, 인자 없음)를 한 번씩 — 넷이 다 온 뒤에 탭·표를 그린다', async () => {
      let resolve: (v: unknown) => void = () => {}
      uploadRpc.mockReturnValue(new Promise((r) => (resolve = r)))
      const { container } = render(<AdminApplications />)
      await waitFor(() => expect(uploadRpc).toHaveBeenCalledTimes(1))
      await act(async () => {})
      expect(order).toHaveBeenCalledTimes(1)
      expect(marksRpc).toHaveBeenCalledTimes(1)
      expect(viewRpc).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('tablist')).toBeNull()
      expect(screen.queryByRole('table')).toBeNull()
      expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
      await act(async () => resolve({ data: [], error: null, status: 200 }))
      expect(tablist()).toBeTruthy()
      expect(uploadRpc).toHaveBeenCalledExactlyOnceWith('admin_auto_upload_list')
      expect(from).toHaveBeenCalledExactlyOnceWith('hospitals')
      expect(marksRpc).toHaveBeenCalledExactlyOnceWith('admin_hospitals')
      expect(viewRpc).toHaveBeenCalledExactlyOnceWith('admin_view_hospitals')
      expect(rpc).not.toHaveBeenCalled()
    })

    it('AC-8022.5: 다른 목록이 늦게 와도 넷 다 온 뒤에 그린다(상태 목록만 먼저 와도 탭·표 없음)', async () => {
      let resolve: (v: unknown) => void = () => {}
      viewRpc.mockReturnValue(new Promise((r) => (resolve = r)))
      render(<AdminApplications />)
      await waitFor(() => expect(uploadRpc).toHaveBeenCalledTimes(1))
      await act(async () => {})
      expect(screen.queryByRole('tablist')).toBeNull()
      await act(async () => resolve({ data: DB_VIEWS, error: null, status: 200 }))
      expect(tablist()).toBeTruthy()
    })

    it.each([
      ['답 오류', { data: null, error: { code: '42501', message: UPLOAD_RAW }, status: 403 }],
      ['목록이 아님', { data: { hospital_id: 'h-dara' }, error: null, status: 200 }],
      ['줄 모양 틀림', { data: [{ hospital_id: 'h-dara', months: 7 }], error: null, status: 200 }],
    ])('AC-8022.5: 상태 목록을 읽지 못하면(%s) 다른 목록 실패와 같이 던진다 → 화면 오류(지금처럼 E-PAGE-FAILED + [다시 시도])', async (_label, answer) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      uploadRpc.mockResolvedValue(answer)
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
      expect(caught).toBeInstanceOf(AdminSyncError)
      expect(document.body.textContent).not.toContain('secret-detail')
    })

    it('AC-8022.5: 화면을 떠난 뒤 상태 목록이 와도 오류 없이 버린다', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      let resolve: (v: unknown) => void = () => {}
      uploadRpc.mockReturnValue(new Promise((r) => (resolve = r)))
      const { unmount } = render(<AdminApplications />)
      await waitFor(() => expect(uploadRpc).toHaveBeenCalledTimes(1))
      unmount()
      await act(async () => resolve({ data: AV_UPLOADS, error: null, status: 200 }))
      expect(error).not.toHaveBeenCalled()
    })
  })
})
