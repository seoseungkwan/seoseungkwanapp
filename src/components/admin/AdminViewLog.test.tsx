// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { nestedBoxes } from '@/testing/boxes'
import { AdminViewLog } from './AdminViewLog'

// 관리자 화면 '본 기록' 칸 (admin-view REQ-8012 AC-8012.3, design.md '관리자 화면'·기본값 11, 시안 docs/mockups/admin-view ?s=admin-list '본 기록').
// 실제 Supabase에 붙지 않는다 — 진짜 readViewLog를 거쳐 rpc('admin_view_log')가 몇 번 나가는지와 그린 글만 본다.
// 자료는 지어낸 값이다(의원 이름·@fake.test 메일). 시각은 DB 시각(UTC) → 한국 시각으로 그린다(시험은 TZ=Asia/Seoul이지만 글은 PC 시간대와 상관없다)
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ rpc }) }))

const RAW = 'permission denied for function admin_view_log secret-detail'
// DB 답(최근 30일). 일부러 차례를 섞었다 — 화면은 새 것이 위
const LOG = [
  { started_at: '2026-11-23T08:40:00+00:00', viewer_name: '사아 재활의학과의원', viewer_email: 'saa@fake.test', hospital_id: 'h-jacha', hospital_name: '자차 정형외과의원' },
  { started_at: '2026-11-24T00:12:00+00:00', viewer_name: '가나 정형외과의원', viewer_email: 'gana@fake.test', hospital_id: 'h-dara', hospital_name: '다라 정형외과의원' },
  { started_at: '2026-11-02T23:55:00+00:00', viewer_name: '가나 정형외과의원', viewer_email: 'gana@fake.test', hospital_id: 'h-maba', hospital_name: '마바 정형외과의원' },
]

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))

const panel = () => screen.getByRole('region', { name: '본 기록' })
const table = () => within(panel()).getByRole('table', { name: '본 기록' })
const bodyRows = () => within(table()).queryAllByRole('row').slice(1)
const rowTexts = () => bodyRows().map((tr) => within(tr).getAllByRole('cell').map((c) => c.textContent))

async function renderRead() {
  const user = userEvent.setup()
  render(<AdminViewLog />)
  await screen.findByText(/^최근 30일 · \d+번$/)
  return user
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: LOG, error: null, status: 200 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AC-8012.3 본 기록 칸', () => {
  it('AC-8012.3: 제목 `본 기록` · 오른쪽 `최근 30일 · {n}번` · 설명 · 칸 `본 때`·`본 관리자`·`본 의원`(시안 글 그대로)', async () => {
    await renderRead()
    expect(within(panel()).getByRole('heading', { level: 2 }).textContent).toBe('본 기록')
    expect(within(panel()).getByText('최근 30일 · 3번')).toBeTruthy()
    expect(within(panel()).getByText('관리자가 다른 의원 화면을 열 때마다 적어요.')).toBeTruthy()
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['본 때', '본 관리자', '본 의원'])
  })

  it('AC-8012.3: readViewLog()로 rpc(admin_view_log)를 한 번(인자 없음) 읽고, 새 것이 위인 줄 — 때는 한국 시각 `11월 24일 (화) 09:12` 모양, 관리자는 `{의원 이름} · {메일}`', async () => {
    await renderRead()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_view_log')
    expect(rowTexts()).toEqual([
      ['11월 24일 (화) 09:12', '가나 정형외과의원 · gana@fake.test', '다라 정형외과의원'],
      ['11월 23일 (월) 17:40', '사아 재활의학과의원 · saa@fake.test', '자차 정형외과의원'],
      ['11월 3일 (화) 08:55', '가나 정형외과의원 · gana@fake.test', '마바 정형외과의원'],
    ])
  })

  it('AC-8012.3: 한국 시각 자정 넘김(UTC 15:00 = 다음 날 00:00)도 한국 날짜·요일로 그린다', async () => {
    rpc.mockResolvedValue({ data: [{ ...LOG[0], started_at: '2026-11-20T15:00:00+00:00' }], error: null, status: 200 })
    await renderRead()
    expect(rowTexts()[0][0]).toBe('11월 21일 (토) 00:00')
  })

  it('AC-8012.3: 본 관리자의 의원 이름·메일이 없으면 있는 것만(둘 다 없으면 —)', async () => {
    rpc.mockResolvedValue({
      data: [
        { ...LOG[1], started_at: '2026-11-24T00:12:00+00:00', viewer_name: null },
        { ...LOG[1], started_at: '2026-11-24T00:11:00+00:00', viewer_email: null },
        { ...LOG[1], started_at: '2026-11-24T00:10:00+00:00', viewer_name: null, viewer_email: null },
      ],
      error: null,
      status: 200,
    })
    await renderRead()
    expect(rowTexts().map((r) => r[1])).toEqual(['gana@fake.test', '가나 정형외과의원', '—'])
  })

  it('AC-8012.3: 줄이 없으면 `최근 30일 · 0번`이고 표 몸통이 빈다(머리는 남는다)', async () => {
    rpc.mockResolvedValue({ data: [], error: null, status: 200 })
    await renderRead()
    expect(within(panel()).getByText('최근 30일 · 0번')).toBeTruthy()
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(3)
    expect(bodyRows()).toEqual([])
    expect(table().querySelector('tbody')?.childElementCount).toBe(0)
  })

  it('AC-8012.3: 읽는 동안에는 개수 글이 없고 칸이 기다림(aria-busy)이다', () => {
    rpc.mockReturnValue(new Promise(() => {}))
    render(<AdminViewLog />)
    expect(panel().getAttribute('aria-busy')).toBe('true')
    expect(within(panel()).queryByText(/최근 30일/)).toBeNull()
  })

  it('AC-8012.3: 읽기 실패는 그 칸 안 E-VIEW-LOG 카드 + [다시 불러오기] — 원래 오류 글 없음, 화면 오류로 던지지 않는다(다른 칸은 그대로)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: RAW }, status: 403 })
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
        <p>옆 칸</p>
        <AdminViewLog />
      </Boundary>,
    )
    const alert = await within(panel()).findByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-VIEW-LOG').what)
    expect(alert.textContent).toContain('오류 번호 E-VIEW-LOG')
    expect(within(panel()).getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(within(panel()).queryByRole('table')).toBeNull()
    expect(within(panel()).queryByText(/최근 30일/)).toBeNull()
    expect(screen.getByText('옆 칸')).toBeTruthy()
    expect(caught).toBeNull()
    expect(document.body.textContent).not.toContain('secret-detail')
  })

  it('AC-8012.3: [다시 불러오기]를 누르면 한 번 더 읽고, 되면 카드 대신 표를 그린다', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: RAW }, status: 403 })
    const user = userEvent.setup()
    render(<AdminViewLog />)
    await user.click(await within(panel()).findByRole('button', { name: '다시 불러오기' }))
    await screen.findByText('최근 30일 · 3번')
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(within(panel()).queryByRole('alert')).toBeNull()
    expect(bodyRows()).toHaveLength(3)
  })

  it('AC-8012.3: 화면을 떠난 뒤 답이 와도 오류 없이 버린다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolve: (v: unknown) => void = () => {}
    rpc.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = render(<AdminViewLog />)
    unmount()
    await act(async () => resolve({ data: LOG, error: null, status: 200 }))
    expect(error).not.toHaveBeenCalled()
  })
})

describe('AC-8012.3 본 기록 모양 (시안 ds.panel — 설치 파일 칸과 같은 틀)', () => {
  it('AC-8012.3: 칸은 ds.panel(section), 머리 ds.panelHead · 제목 ds.panelTitle(h2) · 오른쪽 개수 ds.count, 설명 small ink-2', async () => {
    await renderRead()
    expect(panel().tagName).toBe('SECTION')
    hasAll(panel(), ds.panel)
    const title = within(panel()).getByRole('heading', { level: 2 })
    hasAll(title, ds.panelTitle)
    hasAll(title.parentElement as Element, ds.panelHead)
    const count = within(panel()).getByText('최근 30일 · 3번')
    hasAll(count, ds.count)
    expect(count.parentElement).toBe(title.parentElement)
    hasAll(within(panel()).getByText('관리자가 다른 의원 화면을 열 때마다 적어요.'), 'text-small text-ink-2')
  })

  it('AC-8012.3: 표는 ds.table(칸 폭 고정 table-fixed · 본 때 220px · 본 의원 40%), 본 때는 보조 칸 고정폭 숫자, 관리자 메일은 muted', async () => {
    await renderRead()
    hasAll(table(), `${ds.table.table} table-fixed`)
    hasAll(table().parentElement as Element, ds.table.wrap)
    const heads = within(table()).getAllByRole('columnheader')
    for (const th of heads) hasAll(th, ds.table.th)
    hasAll(heads[0], 'w-55')
    hasAll(heads[2], 'w-2/5')
    const [when, who, what] = within(bodyRows()[0]).getAllByRole('cell')
    hasAll(when, `${ds.table.tdSub} tabular-nums`)
    hasAll(who, ds.table.td)
    hasAll(what, ds.table.td)
    hasAll(within(who).getByText('· gana@fake.test'), 'text-muted')
    hasAll(bodyRows()[0], ds.table.row)
  })

  it('AC-8012.3: 상자 안 상자가 없고(실패 카드 포함) 새 클래스에 폰 전용 모양(max-md:)이 없다 — ds 값에 든 것뿐', async () => {
    await renderRead()
    expect(nestedBoxes(document.body)).toEqual([])
    const allowed = new Set(Object.values(ds).flatMap((v) => (typeof v === 'string' ? tokens(v) : Object.values(v).flatMap((s) => tokens(String(s))))))
    for (const el of Array.from(panel().querySelectorAll('*'))) {
      for (const t of classesOf(el).filter((c) => c.startsWith('max-md:'))) expect(allowed.has(t), t).toBe(true)
    }
    cleanup()
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: RAW }, status: 403 })
    render(<AdminViewLog />)
    await within(panel()).findByRole('alert')
    expect(nestedBoxes(document.body)).toEqual([])
  })
})
