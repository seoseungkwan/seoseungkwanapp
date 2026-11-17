// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLedger, dayTotals } from '@/lib/sunap/ledger'
import { DEFAULT_RSV_KINDS, SUNAP_TOTAL_KEYS, type LedgerSettings, type SunapReply, type SunapTotals } from '@/types/sunap'
import { SunapCards } from './SunapCards'

// 수납일지 요약 네 칸의 FREE 줄(spec clinic-calendar AC-5908.4). 건강생활유지비로 낸 줄은 dayTotals의 free_n에 들지 않고, 카드는 그 free_n을 보인다.
// 시험 자료는 지어낸 가짜 환자다(이름 '가상환자NN')

afterEach(cleanup)

const SETTINGS: LedgerSettings = { kinds: DEFAULT_RSV_KINDS, blockDef: null, ptDef: null }
// 도우미 0.10.0(v3) 답: 줄 끝이 [진료의, 건강생활]. 1·2는 네 칸이 0원(2는 건강생활 1,500원), 3은 현금 5,000원
const REPLY3: SunapReply = {
  v: 3,
  day: '2026-11-16',
  unsure: false,
  rows: [
    ['10231', '가상환자01', '09:02', 're', 0, 0, 0, 0, [], null, null, 0],
    ['10232', '가상환자02', '09:15', 're', 0, 0, 0, 0, [], null, null, 1500],
    ['10233', '가상환자03', '10:40', 'new', 5000, 0, 0, 0, [], null, null, 0],
  ],
  paid: [],
  doctors: [],
}
const zero = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key) => [key, 0])) as SunapTotals

const payCard = () => within(screen.getByRole('region', { name: /^수납/ }))
// Kv 줄은 이름 · 가운데(건수) · 값 세 칸이 차례로 붙어 있다
const countOf = (name: string) => payCard().getByText(name).nextElementSibling?.textContent

describe('AC-5908.4 SunapCards FREE 건수 = dayTotals의 free_n', () => {
  it('AC-5908.4: 건강생활유지비로 낸 줄은 FREE에 들지 않는다 — 네 칸과 건강생활이 모두 0인 줄만 FREE 1건', () => {
    const totals = dayTotals(buildLedger(REPLY3, {}, SETTINGS))
    expect(totals.free_n).toBe(1)
    render(<SunapCards totals={totals} spends={[]} reserved={null} />)
    expect(countOf('FREE')).toBe('1건')
    expect(countOf('현금')).toBe('1건')
    // 수납 건수 = 결제 건수 + FREE 건수(건강생활 줄은 어느 칸에도 들지 않는다)
    expect(screen.getByRole('heading', { name: '수납 2건' })).toBeTruthy()
  })

  it('AC-5908.4: FREE 줄은 받은 free_n 그대로다(서버 숫자 화면도 같다)', () => {
    render(<SunapCards totals={{ ...zero, free_n: 6 }} spends={[]} reserved={null} />)
    expect(countOf('FREE')).toBe('6건')
  })
})
