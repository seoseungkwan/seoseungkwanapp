// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { errorInfo } from '@/lib/errors'
import { ComparePage } from './ComparePage'

// 의원 비교 화면 잇기(spec admin-view REQ-8017 AC-8017.1~AC-8017.4, REQ-8023 AC-8023.4, REQ-8015 AC-8015.5, design.md '의원 비교 — 불러오기와 한도'·'화면 글자').
// 시안 docs/mockups/admin-view ?s=compare · compare-region · empty: 통계 화면과 같은 회색 바탕 + 머리·고르기·바로가기 + 순위 → 나란히 보기 → 월급 → 매출.
// 진짜 브라우저 함수(adminView·adminSync·adminRows)를 돌리고 Supabase 클라이언트만 흉내 낸다 — 부른 rpc 이름·인자를 모두 적어 쓰기가 없는지 본다.
// 의원·주소·금액은 모두 지어낸 것이다. 오늘 = 2026-11-24(화), 지난달 = 2026년 10월

type Reply = { data: unknown; error: unknown }

const { supabaseBrowser, rpcCalls, fromCalls, answer } = vi.hoisted(() => {
  const rpcCalls: { name: string; args: Record<string, unknown> | undefined }[] = []
  const fromCalls: unknown[] = []
  type Answer = (name: string, args: Record<string, unknown> | undefined) => Promise<{ data: unknown; error: unknown }>
  const answer: { current: Answer } = { current: () => Promise.resolve({ data: null, error: null }) }
  const client = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      const reply = answer.current(name, args)
      return {
        then: (ok: (value: unknown) => unknown, bad?: (reason: unknown) => unknown) => reply.then(ok, bad),
        range: (first: number, last: number) =>
          reply.then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data as unknown[]).slice(first, last + 1) : r.data })),
      }
    },
    from: (table: unknown) => {
      fromCalls.push(table)
      throw new Error('표를 바로 읽거나 쓰지 않는다')
    },
  }
  return { supabaseBrowser: () => client, rpcCalls, fromCalls, answer }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))
// 비트 연결을 만들지 않는지 센다
vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))

const TODAY = '2026-11-24'
const READ_RPCS = ['admin_view_hospitals', 'admin_compare_first_month', 'admin_rows']

// admin_view_hospitals 답 줄(DB 모양). 가나 = 내 의원(서울), 사아 = 지역 모름으로 정함
const HOSPITALS = [
  { hospital_id: 'h-ga', name: '가나 정형외과의원', address: '서울 가짜구 가짜로 1', region_set: false, region: null, is_me: true },
  { hospital_id: 'h-da', name: '다라 정형외과의원', address: '서울시 예시구 예시로 12, 3층', region_set: false, region: null, is_me: false },
  { hospital_id: 'h-ma', name: '마바 정형외과의원', address: '부산광역시 가짜구 가짜로 7', region_set: false, region: null, is_me: false },
  { hospital_id: 'h-sa', name: '사아 재활의학과의원', address: null, region_set: true, region: null, is_me: false },
]
const TOTAL: Record<string, number> = { 'h-ga': 132_610_000, 'h-da': 98_000_000, 'h-ma': 51_000_000, 'h-sa': 20_000_000 }

const salesDay = (day: string, total: number) => ({
  day,
  visits: 120,
  new_patients: 12,
  return_visits: 108,
  total,
  insurer: null,
  noncovered: null,
  copay: null,
  other_total: null,
  cash: 0,
  card: total,
  transfer: 0,
  receivable_in: 0,
  unconfirmed: false,
  split_unconfirmed: true,
  rough_total: null,
  day_codes: true,
})

let firstMonthReply: () => Promise<Reply>
let failing: Set<string>
let holds: Map<string, Promise<void>>

function rowsReply(args: Record<string, unknown>): Promise<Reply> {
  const id = (args.p_hospital_ids as string[])[0]!
  const to = args.p_to as string
  const kind = args.p_kind as string
  const go = async (): Promise<Reply> => {
    await holds.get(id)
    if (failing.has(id)) return { data: null, error: { message: '가짜 실패' } }
    const month = to.slice(0, 7)
    const rows =
      kind === 'sales_days'
        ? [salesDay(`${month}-01`, TOTAL[id]!)]
        : kind === 'staff_members'
          ? [{ id: `${id}-s1`, job: '간호사', employment: 'regular', hired_on: '2025-01-02', left_on: null }]
          : kind === 'staff_pay'
            ? [{ month, staff_id: `${id}-s1`, amounts: { base: 2_520_000 }, incentives: [], adjust: 0 }]
            : []
    return { data: rows.map((row) => ({ hospital_id: id, row })), error: null }
  }
  return go()
}

beforeEach(() => {
  rpcCalls.length = 0
  fromCalls.length = 0
  failing = new Set()
  holds = new Map()
  firstMonthReply = () => Promise.resolve({ data: '2025-03-01', error: null })
  answer.current = (name, args) => {
    if (name === 'admin_view_hospitals') return Promise.resolve({ data: HOSPITALS, error: null })
    if (name === 'admin_compare_first_month') return firstMonthReply()
    if (name === 'admin_rows') return rowsReply(args ?? {})
    return Promise.resolve({ data: null, error: { message: '모르는 함수' } })
  }
  vi.mocked(useBridge).mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const callsOf = (name: string) => rpcCalls.filter((call) => call.name === name)
const loadsOf = (id: string) => callsOf('admin_rows').filter((call) => (call.args?.p_hospital_ids as string[])[0] === id && call.args?.p_kind === 'sales_days').length

/** 고르기가 그려지고 지역 안 의원을 모두 읽을 때까지 */
async function ready() {
  await screen.findByRole('group', { name: '달 고르기' })
  await waitFor(() => expect(screen.queryByText('불러오는 중')).toBeNull())
}
const card = (id: string) => document.getElementById(id)!
const regionSelect = () => screen.getByRole('combobox', { name: '지역' })

describe('AC-8017.1 · AC-8015.5 화면 짜임', () => {
  it('AC-8017.1·AC-8015.5: 통계 화면과 같은 회색 바탕(data-st-canvas) 위에 관리자 · h1 의원 비교 · 관리자 안 메뉴(의원 비교가 지금) · 안내 · 고르기 · 바로가기, 그 아래 순위 → 나란히 보기 → 월급 → 매출(시안 차례)', async () => {
    const { container } = render(<ComparePage today={TODAY} />)
    await ready()
    const canvas = container.firstElementChild!
    expect(canvas.hasAttribute('data-st-canvas')).toBe(true)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('의원 비교')
    const nav = screen.getByRole('navigation', { name: '관리자 안 메뉴' })
    expect(within(nav).getByRole('link', { name: '의원 비교' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: '가입 승인' }).getAttribute('href')).toBe('/admin')
    expect(screen.getByText('승인한 의원들의 한 달 숫자를 나란히 봐요. 의원마다 저장된 숫자로 세고, 환자 이름 같은 개인정보는 없어요.')).toBeTruthy()
    const ids = [...canvas.querySelectorAll('[id^="cmp-"]')].map((el) => el.id)
    expect(ids).toEqual(['cmp-rank', 'cmp-side', 'cmp-pay', 'cmp-sales'])
    // 흰 큰 카드(StatsCard) 셋과 카드 아닌 나란히 보기
    for (const id of ['cmp-rank', 'cmp-pay', 'cmp-sales']) expect(card(id).tagName).toBe('SECTION')
    expect(within(card('cmp-rank')).getByRole('heading', { level: 2 }).textContent).toBe('의원 순위')
    expect(within(card('cmp-side')).getByRole('heading', { level: 2 }).textContent).toBe('통계 나란히 보기')
    expect(within(card('cmp-pay')).getByRole('heading', { level: 2 }).textContent).toBe('직군별 월급')
    expect(within(card('cmp-sales')).getByRole('heading', { level: 2 }).textContent).toBe('매출·환자 수')
  })

  it('AC-8015.1·AC-8015.5: 바로가기 띠가 화면 끝까지 붙도록 고르기 묶음 바깥 상자를 풀어(contents) 띠가 회색 바탕 상자의 자식처럼 놓인다', async () => {
    const { container } = render(<ComparePage today={TODAY} />)
    await ready()
    const canvas = container.firstElementChild!
    const toc = screen.getByRole('navigation', { name: '의원 비교 바로가기' })
    expect(toc.parentElement).toBe(canvas.firstElementChild)
    expect(canvas.getAttribute('class')?.split(/\s+/)).toContain('[&>div:first-child]:contents')
  })

  it('AC-8015.5: 폰 전용 모양(max-md:)이 없다 — 이 화면의 새 파일 둘', () => {
    for (const file of ['ComparePage.tsx', 'useCompareData.ts']) {
      expect(readFileSync(join(process.cwd(), 'src/components/admin/compare', file), 'utf8'), file).not.toMatch(/max-md:/)
    }
  })

  it('AC-8017.1: 처음 읽는 동안은 머리(관리자 · 의원 비교 · 안쪽 메뉴)와 불러오는 중 한 줄만 그리고, 그 동안 의원 숫자는 읽지 않는다', async () => {
    let release!: () => void
    firstMonthReply = () =>
      new Promise((resolve) => {
        release = () => resolve({ data: '2025-03-01', error: null })
      })
    render(<ComparePage today={TODAY} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('의원 비교')
    expect(screen.getByRole('navigation', { name: '관리자 안 메뉴' })).toBeTruthy()
    expect(screen.getByText('불러오는 중')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '달 고르기' })).toBeNull()
    await waitFor(() => expect(callsOf('admin_compare_first_month')).toHaveLength(1))
    expect(callsOf('admin_rows')).toHaveLength(0)
    await act(async () => release())
    await ready()
  })
})

describe('AC-8017.3 · AC-8017.4 같은 지역·달', () => {
  it('AC-8017.3: 지역 전체면 나란히 보기는 `지역을 골라 주세요` 안내이고, 서울을 고르면 다시 읽지 않고 서울 의원 칸(가나·다라)을 그린다', async () => {
    const user = userEvent.setup()
    render(<ComparePage today={TODAY} />)
    await ready()
    expect(within(card('cmp-side')).getByText('지역을 골라 주세요')).toBeTruthy()
    expect(card('cmp-side').textContent).toContain('지역을 고르면 그 지역 의원들의 통계 카드를 나란히 보여 줘요.')
    const before = callsOf('admin_rows').length
    await user.selectOptions(regionSelect(), '서울')
    await waitFor(() => expect(within(card('cmp-side')).queryByText('지역을 골라 주세요')).toBeNull())
    expect(card('cmp-side').textContent).toContain('2026년 10월 · 서울 2곳')
    // 의원 이름은 칸 머리와 줄마다의 작은 카드에 나온다
    expect(within(card('cmp-side')).getAllByText('가나 정형외과의원').length).toBeGreaterThan(0)
    expect(within(card('cmp-side')).getAllByText('다라 정형외과의원').length).toBeGreaterThan(0)
    expect(within(card('cmp-side')).queryByText('마바 정형외과의원')).toBeNull()
    expect(callsOf('admin_rows')).toHaveLength(before)
  })

  it('AC-8017.4: 네 칸이 모두 같은 지역·달 — 고르기 아래 줄·순위·나란히 보기·월급·매출이 같은 달이고, 달을 바꾸면 넷 다 새 달, 지역을 바꾸면 넷 다 그 지역 의원', async () => {
    const user = userEvent.setup()
    render(<ComparePage today={TODAY} />)
    await ready()
    const sameMonth = (text: string) => {
      for (const id of ['cmp-rank', 'cmp-side', 'cmp-pay', 'cmp-sales']) expect(card(id).textContent, id).toContain(text)
    }
    sameMonth('2026년 10월')
    expect(screen.getByText(/· 10월 1일 – 10월 31일 · 의원 4곳/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '앞 달' }))
    await ready()
    sameMonth('2026년 9월')
    for (const id of ['cmp-rank', 'cmp-side', 'cmp-pay', 'cmp-sales']) expect(card(id).textContent, id).not.toContain('2026년 10월')
    expect(screen.getByText(/· 9월 1일 – 9월 30일 · 의원 4곳/)).toBeTruthy()

    await user.selectOptions(regionSelect(), '부산')
    await ready()
    sameMonth('2026년 9월')
    expect(screen.getByText(/· 9월 1일 – 9월 30일 · 부산 의원 1곳/)).toBeTruthy()
    for (const id of ['cmp-rank', 'cmp-side', 'cmp-pay', 'cmp-sales']) {
      expect(card(id).textContent, id).toContain('마바 정형외과의원')
      expect(card(id).textContent, id).not.toContain('가나 정형외과의원')
    }
  })

  it('AC-8017.4: Web Worker·비트 연결·쓰기 요청이 없다 — rpc는 읽기 셋(의원 목록·가장 이른 달·admin_rows)뿐, 표를 바로 부르지 않고(from 없음), 쓰기 단추가 없다', async () => {
    const worker = vi.fn()
    vi.stubGlobal('Worker', worker)
    const user = userEvent.setup()
    render(<ComparePage today={TODAY} />)
    await ready()
    await user.selectOptions(regionSelect(), '서울')
    await user.click(screen.getByRole('button', { name: '앞 달' }))
    await ready()
    expect(worker).not.toHaveBeenCalled()
    expect(vi.mocked(useBridge)).not.toHaveBeenCalled()
    expect(fromCalls).toEqual([])
    expect(new Set(rpcCalls.map((call) => call.name))).toEqual(new Set(READ_RPCS))
    // 단추는 달 옮기기·줄 세우기(칸 이름)뿐
    const sortLabels = ['총진료비', '내원 수', '신환', '재진', '하루 평균 내원', '간호사', '간호조무사', '물리치료사', '방사선사', '원무', '기타']
    for (const button of screen.getAllByRole('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? ''
      const isSort = within(card('cmp-rank')).queryAllByRole('button').includes(button)
      expect(isSort || ['앞 달', '다음 달'].includes(name), name).toBe(true)
    }
    expect(within(card('cmp-rank')).getAllByRole('button').map((button) => button.textContent)).toEqual(expect.arrayContaining(sortLabels))
  })

  it('AC-8017.4: 이 화면의 소스는 Worker·비트 연결·저장 함수를 부르지 않는다(useBridge·workers·statsClient·.insert/.update/.upsert/.delete 없음)', () => {
    for (const file of ['ComparePage.tsx', 'useCompareData.ts']) {
      const source = readFileSync(join(process.cwd(), 'src/components/admin/compare', file), 'utf8')
      // Supabase 지우기는 인자 없는 .delete()다(Set.delete(key)는 손에 든 읽기 차례 정리라 뺀다)
      expect(source, file).not.toMatch(/useBridge|@\/workers|statsClient|new Worker|\.insert\(|\.update\(|\.upsert\(|\.delete\(\s*\)|\.rpc\(|\.from\(|supabaseBrowser/)
    }
  })
})

describe('AC-8017.2 읽기 실패한 의원', () => {
  it('AC-8017.2: 전체에서 한 의원만 읽지 못하면 그 의원 이름 + E-COMPARE-READ 카드 + [다시 불러오기], 다른 의원 숫자는 그대로이고 누르면 그 의원만 다시 읽는다', async () => {
    failing.add('h-da')
    const user = userEvent.setup()
    render(<ComparePage today={TODAY} />)
    await ready()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-COMPARE-READ').what)
    expect(alert.textContent).toContain('E-COMPARE-READ')
    expect(screen.getByText('다라 정형외과의원', { selector: 'p' })).toBeTruthy()
    // 다른 의원 숫자는 순위 표에 그대로(가나 1억 3,261만 원)
    expect(card('cmp-rank').textContent).toContain('1억 3,261만 원')
    expect(loadsOf('h-da')).toBe(1)
    expect(loadsOf('h-ga')).toBe(1)

    failing.delete('h-da')
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(loadsOf('h-da')).toBe(2)
    expect(loadsOf('h-ga')).toBe(1)
    expect(card('cmp-rank').textContent).toContain('9,800만 원')
  })

  it('AC-8017.2: 지역을 골랐을 때는 실패한 의원의 나란히 보기 칸에 E-COMPARE-READ + [다시 불러오기](판 위 카드는 없음)', async () => {
    failing.add('h-da')
    const user = userEvent.setup()
    render(<ComparePage today={TODAY} />)
    await ready()
    await user.selectOptions(regionSelect(), '서울')
    await waitFor(() => expect(within(card('cmp-side')).queryAllByRole('alert').length).toBeGreaterThan(0))
    // 오류 카드는 모두 나란히 보기 안(다라 칸 줄마다)에만 있다 — 고르기 아래 판 위 카드는 없다
    expect(screen.getAllByRole('alert').every((alert) => card('cmp-side').contains(alert))).toBe(true)
    expect(screen.getAllByRole('alert').every((alert) => alert.textContent?.includes('E-COMPARE-READ'))).toBe(true)
    failing.delete('h-da')
    await user.click(within(card('cmp-side')).getAllByRole('button', { name: '다시 불러오기' })[0]!)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(loadsOf('h-da')).toBe(2)
  })

  it('AC-8017.2: 숫자가 하나도 오지 않은 채 읽는 동안은 표가 `자료 없음` 대신 불러오는 중이다', async () => {
    let release!: () => void
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    for (const h of HOSPITALS) holds.set(h.hospital_id, wait)
    render(<ComparePage today={TODAY} />)
    await screen.findByRole('group', { name: '달 고르기' })
    for (const id of ['cmp-rank', 'cmp-pay', 'cmp-sales']) {
      expect(card(id).textContent, id).toContain('불러오는 중')
      expect(card(id).textContent, id).not.toContain('자료 없음')
      expect(card(id).textContent, id).not.toContain('급여 없음')
    }
    await act(async () => release())
    await ready()
    expect(card('cmp-rank').textContent).toContain('1억 3,261만 원')
  })
})

describe('AC-8023.4 가장 이른 달', () => {
  it('AC-8023.4: 화면을 열 때 가장 이른 달을 한 번 읽어 달 고르기 옆 글에 넘기고(2025년 3월부터 2026년 10월까지), 지역·달을 바꿔도 다시 읽지 않는다', async () => {
    const user = userEvent.setup()
    render(<ComparePage today={TODAY} />)
    await ready()
    expect(screen.getByText('2025년 3월부터 2026년 10월까지 고를 수 있어요 · 저장된 숫자가 있는 달, 10년까지')).toBeTruthy()
    await user.selectOptions(regionSelect(), '서울')
    await user.selectOptions(screen.getByRole('combobox', { name: '연도' }), '2025')
    await ready()
    await user.selectOptions(regionSelect(), '전체')
    await ready()
    expect(callsOf('admin_compare_first_month')).toHaveLength(1)
    expect(callsOf('admin_view_hospitals')).toHaveLength(1)
  })

  it('AC-8023.4: 가장 이른 달을 읽지 못하면 화면 오류(E-PAGE-FAILED) 카드 + [다시 불러오기], 누르면 다시 읽어 고르기·표를 그린다', async () => {
    firstMonthReply = () => Promise.resolve({ data: null, error: { message: '가짜 실패' } })
    const user = userEvent.setup()
    render(<ComparePage today={TODAY} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-PAGE-FAILED').what)
    expect(alert.textContent).toContain('E-PAGE-FAILED')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('의원 비교')
    expect(screen.queryByRole('group', { name: '달 고르기' })).toBeNull()
    expect(callsOf('admin_rows')).toHaveLength(0)

    firstMonthReply = () => Promise.resolve({ data: '2025-03-01', error: null })
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await ready()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(callsOf('admin_compare_first_month')).toHaveLength(2)
    expect(card('cmp-rank').textContent).toContain('1억 3,261만 원')
  })
})
