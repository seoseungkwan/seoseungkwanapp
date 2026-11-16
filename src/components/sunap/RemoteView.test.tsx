// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    expect(visits.getByText('8.7%')).toBeTruthy() // 초진 9/104
    expect(visits.getByText('58.7%')).toBeTruthy() // 물리치료 61/104
    const rates = card(/^예약 · Block 전환/)
    expect(rates.getByText('66.7%')).toBeTruthy() // 초진 예약률 6/9
    expect(rates.getByText('초진 9명 중 6명 · 주사치료·진료(경과) 예약만')).toBeTruthy()
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
