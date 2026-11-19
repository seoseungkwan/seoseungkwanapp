// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import type { SunapDay, SunapSpend } from '@/lib/storage/sunap'
import { SUNAP_TOTAL_KEYS, type SunapTotals } from '@/types/sunap'
import { RemoteView, type ServerDayView } from './RemoteView'

// 다른 기기(도우미 없는 PC·폰·옛 도우미)의 수납일지(spec sunap-ilji AC-4905.7, 시안 ?s=remote). 서버 숫자(마감한 날 합계)와 지출만, 고치기 없음

afterEach(cleanup)

const zero = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key) => [key, 0])) as SunapTotals
// 시안 하루 숫자(104명)
const TOTALS: SunapTotals = {
  ...zero,
  visits: 104,
  first_n: 9,
  d90_n: 6,
  ret_n: 89,
  block_n: 23,
  pt_n: 61,
  rsv_first: 6,
  rsv_d90: 3,
  first_block: 4,
  d90_block: 2,
  ret_block: 17,
  cash_n: 12,
  cash_won: 156000,
  card_n: 70,
  card_won: 902300,
  transfer_n: 5,
  transfer_won: 88000,
  paid_cash_n: 1,
  paid_cash_won: 10000,
  paid_card_n: 1,
  paid_card_won: 15000,
  free_n: 6,
  unpaid_n: 3,
  unpaid_won: 42000,
}
const CLOSED: SunapDay = { day: '2026-11-16', closedAt: '2026-11-16T09:52:00.000Z', late: false, totals: TOTALS }
const SPENDS: SunapSpend[] = [
  { id: 's1', kind: 'cash', memo: '택배비', amount: 5000 },
  { id: 's2', kind: 'cash', memo: '다과', amount: 30000 },
  { id: 's3', kind: 'card', memo: '사무용품', amount: 48000 },
  { id: 's4', kind: 'parking', memo: '주차 지원 3건', amount: 9000 },
]

function show(server: ServerDayView, reason: 'device' | 'old-helper' | 'old-day' = 'device') {
  const onRetry = vi.fn()
  render(<RemoteView server={server} reason={reason} onRetry={onRetry} />)
  return { onRetry }
}

const card = (name: RegExp) => within(screen.getByRole('region', { name }))

describe('AC-4905.7 다른 기기: 마감한 날의 합계·지출만', () => {
  it('AC-4905.7: 잠금 한 줄과 요약 네 칸(시안 숫자)이 보인다', () => {
    show({ status: 'ready', closed: CLOSED, spends: SPENDS })
    expect(screen.getByText('이 기기에서는 마감한 날의 합계·비율만 보여요. 환자 장부는 접수 PC에서만 열려요.')).toBeTruthy()
    const pay = card(/^수납/)
    expect(pay.getByText('95건')).toBeTruthy()
    expect(pay.getByText('1,171,300')).toBeTruthy()
    for (const label of ['현금', '카드', '계좌이체', '미수 입금(현금)', '미수 입금(카드)', 'FREE', '오늘 생긴 미수']) expect(pay.getByText(label)).toBeTruthy()
    expect(pay.getByText('42,000')).toBeTruthy()
    const spend = card(/^지출 \d/)
    expect(spend.getByText('4건')).toBeTruthy()
    expect(spend.getByText('92,000')).toBeTruthy()
    expect(spend.getByText('현금(주차지원)')).toBeTruthy()
    const visits = card(/^내원/)
    expect(visits.getByText('총 내원 대비')).toBeTruthy()
    expect(visits.getByText('104')).toBeTruthy()
    expect(visits.getByText('8.7%')).toBeTruthy() // 신환 9/104
    expect(visits.getByText('58.7%')).toBeTruthy() // 물리치료 61/104
    const rates = card(/^예약 · Block 전환/)
    expect(rates.getByText('66.7%')).toBeTruthy() // 신환 예약률 6/9
    expect(rates.getByText('신환 9명 중 6명 · 예약률 ○ 종류 예약만')).toBeTruthy()
    expect(rates.getByText('90일초진 6명 중 3명')).toBeTruthy()
    expect(rates.getByText('17/23')).toBeTruthy()
    expect(rates.getByText('73.9%')).toBeTruthy()
  })

  it('AC-4905.7: 지출은 보기만(입력·지우기·더하기 없음)', () => {
    show({ status: 'ready', closed: CLOSED, spends: SPENDS })
    const panel = within(screen.getByRole('region', { name: '지출 목록' }))
    expect(panel.getByText('4건 · 92,000원')).toBeTruthy()
    expect(panel.getByText('주차 지원 3건')).toBeTruthy()
    expect(panel.getByText('48,000')).toBeTruthy()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('AC-4905.7: "환자 장부는 접수 PC에서만 보여요" 상자', () => {
    show({ status: 'ready', closed: CLOSED, spends: SPENDS })
    expect(screen.getByText('환자 장부는 접수 PC에서만 보여요')).toBeTruthy()
    expect(screen.getByText('이름·차트번호가 든 줄은 서버로 올리지 않아요. 고치거나 마감하려면 접수 PC에서 수납일지를 여세요.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '환자 장부' })).toBeNull()
  })

  it('AC-4905.7: 0.8.0 미만 도우미 PC는 "도우미 새 판(0.8.0)을 깔면 장부가 보여요"', () => {
    show({ status: 'ready', closed: CLOSED, spends: SPENDS }, 'old-helper')
    expect(screen.getByText('도우미 새 판(0.8.0)을 깔면 장부가 보여요')).toBeTruthy()
    expect(screen.queryByText('환자 장부는 접수 PC에서만 보여요')).toBeNull()
  })

  it('AC-4905.7: 마감 안 한 날은 "아직 마감 전이에요"이고 요약 칸이 없다(지출은 보인다)', () => {
    show({ status: 'ready', closed: null, spends: SPENDS.slice(0, 1) })
    expect(screen.getByText('아직 마감 전이에요')).toBeTruthy()
    expect(screen.queryByRole('region', { name: /^수납/ })).toBeNull()
    expect(within(screen.getByRole('region', { name: '지출 목록' })).getByText('1건 · 5,000원')).toBeTruthy()
  })

  it('AC-4905.7: 62일보다 지난 날도 서버 숫자만 보인다', () => {
    show({ status: 'ready', closed: CLOSED, spends: [] }, 'old-day')
    expect(screen.getByText('62일 넘게 지난 날은 합계·지출만 보여요')).toBeTruthy()
    expect(card(/^수납/).getByText('1,171,300')).toBeTruthy()
  })

  it('AC-4905.7: 서버를 읽지 못하면 까닭과 [다시 불러오기]', async () => {
    const { onRetry } = show({ status: 'failed', closed: null, spends: [] })
    expect(screen.getByRole('alert').textContent).toContain('서버에서 수납일지 숫자를 읽지 못했어요')
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-4905.7: 읽는 중', () => {
    show({ status: 'loading', closed: null, spends: [] })
    expect(screen.getByRole('status').textContent).toBe('불러오는 중이에요')
  })
})

// ── 2026-11-17 검토 고침(spec sunap-kinds AC-5503.7): 서버 숫자 화면은 설정을 읽지 않으니 종류 이름을 늘어놓지 않는다 ─────────
describe('AC-5503.7 서버 숫자 화면의 예약률 아래 글', () => {
  it.each(['device', 'old-helper', 'old-day'] as const)('AC-5503.7: %s 화면은 "예약률 ○ 종류 예약만"이고 종류 이름을 늘어놓지 않는다', (reason) => {
    show({ status: 'ready', closed: CLOSED, spends: SPENDS }, reason)
    const rates = card(/^예약 · Block 전환/)
    expect(rates.getByText('신환 9명 중 6명 · 예약률 ○ 종류 예약만')).toBeTruthy()
    expect(rates.queryByText(/주사치료·진료\(경과\) 예약만/)).toBeNull()
  })
})

// ── desk-setup REQ-7004: 수납일지 안내 칸에서 비트 PC 연결 화면(/claim/setup)으로. 데스크·원장 같다 ─────────
describe('AC-7004 안내 칸의 연결 단추', () => {
  const MORE = '이 PC에 비트가 깔려 있으면 확장·도우미를 깔고 연결해서 장부를 볼 수 있어요.'
  // 자물쇠·제목·글이 든 안내 상자(제목 글자로 찾는다)
  const awayBox = (title: string) => screen.getByText(title).closest('section') as HTMLElement

  function showAs(reason: 'device' | 'old-helper' | 'old-day', desk: boolean) {
    render(
      <RoleProvider desk={desk}>
        <RemoteView server={{ status: 'ready', closed: CLOSED, spends: SPENDS }} reason={reason} onRetry={vi.fn()} />
      </RoleProvider>,
    )
  }

  it.each([true, false])('AC-7004.1: device(desk=%s) 안내 상자는 지금 제목·글 아래 한 줄과 링크 단추 [이 PC 연결하기](/claim/setup)가 있다', (desk) => {
    showAs('device', desk)
    const box = awayBox('환자 장부는 접수 PC에서만 보여요')
    const body = within(box).getByText('이름·차트번호가 든 줄은 서버로 올리지 않아요. 고치거나 마감하려면 접수 PC에서 수납일지를 여세요.')
    const more = within(box).getByText(MORE)
    expect(more.tagName).toBe('P')
    expect(more.className).toBe(body.className)
    const link = within(box).getByRole('link', { name: '이 PC 연결하기' })
    expect(link.getAttribute('href')).toBe('/claim/setup')
    expect(link.className.split(' ')).toEqual(expect.arrayContaining(ds.button.secondary.split(' ')))
    expect(link.className).not.toContain('w-full')
    // 순서: 제목 → 글 → 한 줄 → 단추
    const kids = Array.from(box.children)
    expect(kids.indexOf(body)).toBeLessThan(kids.indexOf(more))
    expect(kids.indexOf(more)).toBeLessThan(kids.indexOf(link))
    expect(box.lastElementChild).toBe(link)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: '도우미 새 판 받기' })).toBeNull()
  })

  it.each([true, false])('AC-7004.2: old-helper(desk=%s) 안내 상자는 지금 제목·글 아래 링크 단추 [도우미 새 판 받기](/claim/setup)이고 device의 한 줄은 없다', (desk) => {
    showAs('old-helper', desk)
    const box = awayBox('도우미 새 판(0.8.0)을 깔면 장부가 보여요')
    const body = within(box).getByText('이름·차트번호가 든 줄은 서버로 올리지 않아요. 새 도우미를 깐 뒤 이 화면을 다시 열어 주세요.')
    const link = within(box).getByRole('link', { name: '도우미 새 판 받기' })
    expect(link.getAttribute('href')).toBe('/claim/setup')
    expect(link.className.split(' ')).toEqual(expect.arrayContaining(ds.button.secondary.split(' ')))
    expect(body.nextElementSibling).toBe(link)
    expect(box.lastElementChild).toBe(link)
    expect(screen.queryByText(MORE)).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: '이 PC 연결하기' })).toBeNull()
  })

  it.each([true, false])('AC-7004.3: old-day(desk=%s) 안내 상자는 지금 그대로 — 단추와 한 줄이 없다', (desk) => {
    showAs('old-day', desk)
    const box = awayBox('62일 넘게 지난 날은 합계·지출만 보여요')
    const body = within(box).getByText('비트에서 장부를 다시 읽을 수 있는 날은 오늘부터 62일 전까지예요.')
    expect(box.lastElementChild).toBe(body)
    expect(screen.queryByText(MORE)).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(document.querySelector('a[href="/claim/setup"]')).toBeNull()
  })
})
