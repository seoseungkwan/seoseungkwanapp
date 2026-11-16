// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayTotals } from '@/lib/sunap/ledger'
import type { LedgerRow, PaidRow } from '@/types/sunap'
import { LedgerRows } from './LedgerRows'
import { PaidRows } from './PaidRows'

// 수납일지 환자 장부 줄(spec sunap-ilji REQ-4905, 시안 ?s=open·pick·closed). 울타리 안 화면: 받은 줄을 그리고 고친 값은 onEdit으로만 넘긴다.
// 이름은 ○○로 가린 가짜, 차트번호·금액은 지어낸 값

afterEach(cleanup)

const base: LedgerRow = {
  chart: '',
  name: '',
  time: '09:00',
  kind: 're',
  cash: 0,
  card: 0,
  transfer: 0,
  unpaid: 0,
  free: false,
  block: false,
  pt: false,
  rsv: { kind: 'none', source: 'bit', at: null },
  note: '',
  edited: [],
}
function row(over: Partial<LedgerRow>): LedgerRow {
  const r = { ...base, ...over }
  return { ...r, free: r.cash + r.card + r.transfer + r.unpaid === 0 }
}

const ROWS: LedgerRow[] = [
  row({ chart: '10231', name: '김○○', time: '09:02', card: 15000, block: true, pt: true, rsv: { kind: 'inj', source: 'bit', at: '202611191030' } }),
  row({ chart: '10877', name: '이○○', time: '09:05', cash: 4700, pt: true }),
  row({ chart: '21004', name: '박○○', time: '09:11', kind: 'new', card: 23400, block: true, pt: true, rsv: { kind: 'visit', source: 'bit', at: '202611181000' }, note: '허리 MRI 결과 보러 오심' }),
  row({ chart: '10552', name: '최○○', time: '09:14', card: 9800, pt: true, rsv: { kind: 'inj', source: 'hand', at: null }, note: '전화로 예약하신다고 함' }),
  row({ chart: '19870', name: '정○○', time: '09:20', kind: 'd90', card: 18200, block: true, rsv: { kind: 'inj', source: 'bit', at: '202611201100' } }),
  row({ chart: '10013', name: '강○○', time: '09:31', pt: true }),
  row({ chart: '15220', name: '윤○○', time: '09:44', card: 31500, block: true, rsv: { kind: 'unknown', source: 'bit', at: '202611210930' } }),
  row({ chart: '10344', name: '서○○', time: '10:25', card: 42800, block: true, edited: ['block'], rsv: { kind: 'inj', source: 'bit', at: '202611261000' } }),
  row({ chart: '16455', name: '황○○', time: '10:47', cash: 5000, card: 10000, pt: true, edited: ['cash'], rsv: { kind: 'visit', source: 'bit', at: '202611241400' } }),
  row({ chart: '21006', name: '임○○', time: '10:03', kind: 'new', unpaid: 16300, pt: true, rsv: { kind: 'visit', source: 'hand', at: null }, note: '카드 두고 오심, 내일 입금' }),
]
const TOTALS = dayTotals({ day: '2026-11-16', unsure: false, rows: ROWS, paid: [], closedAt: null, late: false })

function renderRows(editable = true, closed = !editable) {
  const onEdit = vi.fn()
  render(<LedgerRows rows={ROWS} totals={TOTALS} editable={editable} closed={closed} onEdit={onEdit} />)
  return { onEdit, user: userEvent.setup() }
}

const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row')

describe('AC-4905.1 장부 표(시안 ?s=open)', () => {
  it('AC-4905.1: 머리 칸은 시안 글자 그대로이고 원장님 칸은 없다', () => {
    renderRows()
    expect(screen.getByRole('heading', { name: '환자 장부' })).toBeTruthy()
    expect(screen.getByText('칸을 누르면 고칠 수 있어요')).toBeTruthy()
    const heads = screen.getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['NO', '접수', '차트', '이름', '구분', '현금', '카드', '계좌', '미수', 'Block', '물리치료', '다음 예약', '비고'])
    expect(screen.queryByText('원장님')).toBeNull()
  })

  it('AC-4905.1: 줄마다 번호·접수·차트·이름·구분 칩·금액(0원은 빈 칸)·비고(없으면 –)', () => {
    renderRows()
    const first = rowOf('김○○')
    const cells = within(first).getAllByRole('cell').map((td) => td.textContent)
    expect(cells.slice(0, 9)).toEqual(['1', '09:02', '10231', '김○○', '재진', '', '15,000', '', ''])
    expect(cells[12]).toBe('–')
    expect(within(rowOf('박○○')).getByText('초진')).toBeTruthy()
    expect(within(rowOf('정○○')).getByText('90일초진')).toBeTruthy()
    expect(within(rowOf('박○○')).getByText('허리 MRI 결과 보러 오심')).toBeTruthy()
    expect(within(rowOf('임○○')).getAllByRole('cell')[8]!.textContent).toBe('16,300')
  })

  it('AC-4905.1: 네 칸이 다 0원이면 한 칸에 FREE · 0원', () => {
    renderRows()
    const free = rowOf('강○○')
    expect(within(free).getByText('FREE · 0원')).toBeTruthy()
    expect(within(free).getAllByRole('cell')).toHaveLength(10)
  })

  it('AC-4905.1: 다음 예약 칸 — 종류 칩·날짜·비트/직접 표시, 예약 없음, 종류 모름', () => {
    renderRows()
    const kim = within(rowOf('김○○'))
    expect(kim.getByText('주사치료')).toBeTruthy()
    expect(kim.getByText('11/19 (목)')).toBeTruthy()
    expect(kim.getByText('비트')).toBeTruthy()
    expect(within(rowOf('최○○')).getByText('직접')).toBeTruthy()
    expect(within(rowOf('이○○')).getByText('예약 안 하고 가심')).toBeTruthy()
    const yoon = within(rowOf('윤○○'))
    expect(yoon.getByText('종류 모름')).toBeTruthy()
    expect(yoon.getByText('11/21 (토)')).toBeTruthy()
    expect(within(rowOf('박○○')).getByText('진료(경과)')).toBeTruthy()
  })

  it('AC-4905.1: 아래 합계 줄과 설명 줄', () => {
    renderRows()
    const foot = within(screen.getAllByRole('rowgroup')[2]!).getByRole('row')
    const cells = within(foot).getAllByRole('cell').map((td) => td.textContent)
    expect(cells).toEqual(['합계 · 10명', '9,700', '150,700', '', '16,300', '5', '7', '예약 8명', ''])
    expect(screen.getByText(/직원이 고친 칸\(비트 값과 다름\) — 눌러서 \[비트 값으로 되돌리기\]/)).toBeTruthy()
    expect(screen.getByText('비트 예약 메모로 정한 종류')).toBeTruthy()
    expect(screen.getByText('직원이 고른 예약')).toBeTruthy()
    expect(screen.getByText('FREE = 그날 낸 돈 0원')).toBeTruthy()
  })

  it('AC-4905.1: 거르기 칩(전체·초진·90일초진·Block·예약 종류 모름·고친 칸 있는 줄)과 이름·차트번호 찾기', async () => {
    const { user } = renderRows()
    expect(screen.getByRole('button', { name: '전체 10' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: '초진 2' }))
    expect(bodyRows().map((tr) => within(tr).getAllByRole('cell')[3]!.textContent)).toEqual(['박○○', '임○○'])
    // 번호는 전체 줄의 번호 그대로
    expect(within(bodyRows()[0]!).getAllByRole('cell')[0]!.textContent).toBe('3')
    await user.click(screen.getByRole('button', { name: '90일초진 1' }))
    expect(bodyRows()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Block 5' }))
    expect(bodyRows()).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: '예약 종류 모름 1' }))
    expect(within(bodyRows()[0]!).getAllByRole('cell')[3]!.textContent).toBe('윤○○')
    await user.click(screen.getByRole('button', { name: '고친 칸 있는 줄 2' }))
    expect(bodyRows().map((tr) => within(tr).getAllByRole('cell')[3]!.textContent)).toEqual(['서○○', '황○○'])
    await user.click(screen.getByRole('button', { name: '전체 10' }))
    await user.type(screen.getByRole('searchbox', { name: '이름·차트번호 찾기' }), '1087')
    expect(bodyRows().map((tr) => within(tr).getAllByRole('cell')[3]!.textContent)).toEqual(['이○○'])
    await user.clear(screen.getByRole('searchbox', { name: '이름·차트번호 찾기' }))
    await user.type(screen.getByRole('searchbox', { name: '이름·차트번호 찾기' }), '황')
    expect(bodyRows()).toHaveLength(1)
  })
})

describe('AC-4905.2 칸 고치기', () => {
  it('AC-4905.2: 금액 칸을 누르면 네 금액 칸이 뜨고, 바꾼 칸만 onEdit으로 넘긴다', async () => {
    const { user, onEdit } = renderRows()
    await user.click(screen.getByRole('button', { name: '김○○ 카드' }))
    const pop = screen.getByRole('dialog', { name: '금액 · 김○○' })
    expect(within(pop).getByText('10231 · 재진')).toBeTruthy()
    const card = within(pop).getByRole('textbox', { name: '카드' })
    expect((card as HTMLInputElement).value).toBe('15,000')
    await user.clear(card)
    await user.type(card, '20,000원')
    await user.type(within(pop).getByRole('textbox', { name: '현금' }), '3000')
    await user.click(within(pop).getByRole('button', { name: '저장' }))
    expect(onEdit).toHaveBeenCalledWith('10231', { cash: 3000, card: 20000 })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-4905.2: FREE 칸을 눌러도 네 금액 칸이 뜬다', async () => {
    const { user, onEdit } = renderRows()
    await user.click(screen.getByRole('button', { name: '강○○ 금액' }))
    const pop = screen.getByRole('dialog', { name: '금액 · 강○○' })
    await user.type(within(pop).getByRole('textbox', { name: '계좌' }), '25000')
    await user.click(within(pop).getByRole('button', { name: '저장' }))
    expect(onEdit).toHaveBeenCalledWith('10013', { transfer: 25000 })
  })

  it('AC-4905.2: 틀린 금액은 넘기지 않고 까닭을 보인다', async () => {
    const { user, onEdit } = renderRows()
    await user.click(screen.getByRole('button', { name: '김○○ 카드' }))
    const pop = screen.getByRole('dialog', { name: '금액 · 김○○' })
    const card = within(pop).getByRole('textbox', { name: '카드' })
    await user.clear(card)
    await user.type(card, '1억')
    await user.click(within(pop).getByRole('button', { name: '저장' }))
    expect(onEdit).not.toHaveBeenCalled()
    expect(card.getAttribute('aria-invalid')).toBe('true')
    expect(within(pop).getByText('금액은 0원부터 99,999,999원까지 숫자로 적어 주세요')).toBeTruthy()
  })

  it('AC-4905.2: 고친 칸에는 고친 칸 표시가 있고, 누르면 [비트 값으로 되돌리기]가 있다', async () => {
    const { user, onEdit } = renderRows()
    const hwang = rowOf('황○○')
    expect(within(hwang).getAllByText('고친 칸')).toHaveLength(1)
    expect(within(rowOf('김○○')).queryByText('고친 칸')).toBeNull()
    await user.click(within(hwang).getByRole('button', { name: '황○○ 현금' }))
    const pop = screen.getByRole('dialog', { name: '금액 · 황○○' })
    // 고친 칸(현금)에만 있다
    expect(within(pop).getAllByRole('button', { name: /비트 값으로 되돌리기/ })).toHaveLength(1)
    await user.click(within(pop).getByRole('button', { name: '현금 비트 값으로 되돌리기' }))
    expect(onEdit).toHaveBeenCalledWith('16455', { revert: 'cash' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-4905.2: Block·물리치료는 누르면 바로 바뀐다(다시 누르면 비트 값으로 돌아간다). 고친 Block 칸에 표시가 있다', async () => {
    const { user, onEdit } = renderRows()
    const block = screen.getByRole('checkbox', { name: '이○○ Block' })
    expect(block.getAttribute('aria-checked')).toBe('false')
    await user.click(block)
    expect(onEdit).toHaveBeenLastCalledWith('10877', { block: true })
    await user.click(screen.getByRole('checkbox', { name: '김○○ 물리치료' }))
    expect(onEdit).toHaveBeenLastCalledWith('10231', { pt: false })
    expect(within(rowOf('서○○')).getAllByText('고친 칸')).toHaveLength(1)
  })

  it('AC-4905.2: 비고를 적으면 onEdit으로 넘긴다(100자까지)', async () => {
    const { user, onEdit } = renderRows()
    await user.click(screen.getByRole('button', { name: '김○○ 비고' }))
    const pop = screen.getByRole('dialog', { name: '비고 · 김○○' })
    const note = within(pop).getByRole('textbox', { name: '비고' })
    expect(note.getAttribute('maxlength')).toBe('100')
    await user.type(note, '다음 주 MRI')
    await user.click(within(pop).getByRole('button', { name: '저장' }))
    expect(onEdit).toHaveBeenCalledWith('10231', { note: '다음 주 MRI' })
  })

  it('AC-4905.2: [닫기]는 아무것도 넘기지 않는다', async () => {
    const { user, onEdit } = renderRows()
    await user.click(screen.getByRole('button', { name: '박○○ 비고' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('AC-4905.3 다음 예약 고르기(시안 ?s=pick)', () => {
  it('AC-4905.3: 다음 예약 칸을 누르면 고르기 판이 시안 글자 그대로 뜬다', async () => {
    const { user } = renderRows()
    await user.click(screen.getByRole('button', { name: '윤○○ 다음 예약' }))
    const pop = screen.getByRole('dialog', { name: '다음 예약 · 윤○○' })
    expect(within(pop).getByText('15220 · 재진')).toBeTruthy()
    const radios = within(pop).getAllByRole('radio')
    expect(radios).toHaveLength(5)
    expect(within(pop).getByText('지금: 11/21 (토) 예약 있음 · 종류 모름')).toBeTruthy()
    expect(within(pop).getAllByText('예약률 ○')).toHaveLength(2)
    expect(within(pop).getAllByText('예약률 ✕')).toHaveLength(2)
    for (const label of ['비트 따라가기', '예약 안 하고 가심', '주사치료', '진료(경과)', '기타']) {
      expect(within(pop).getByRole('radio', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}`) })).toBeTruthy()
    }
    // 지금 값(비트)이 골라져 있다
    expect((within(pop).getByRole('radio', { name: /^비트 따라가기/ }) as HTMLInputElement).checked).toBe(true)
    expect(
      within(pop).getByText(
        '직접 고르면 비트 예약보다 이 값을 써요. 비트에 없는 예약(전화·종이 예약)도 여기서 고르면 돼요. 마감을 풀었다 다시 해도 직접 고른 값은 그대로예요.',
      ),
    ).toBeTruthy()
    expect(within(pop).getByRole('button', { name: '닫기' })).toBeTruthy()
  })

  it('AC-4905.3: 고르고 [고르기]를 누르면 직접 고른 값을 넘긴다', async () => {
    const { user, onEdit } = renderRows()
    await user.click(screen.getByRole('button', { name: '윤○○ 다음 예약' }))
    const pop = screen.getByRole('dialog', { name: '다음 예약 · 윤○○' })
    await user.click(within(pop).getByRole('radio', { name: /^주사치료/ }))
    await user.click(within(pop).getByRole('button', { name: '고르기' }))
    expect(onEdit).toHaveBeenCalledWith('15220', { rsv: 'inj' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-4905.3: 직접 고른 줄에서 [비트 따라가기]를 고르면 직접 고른 값을 지운다', async () => {
    const { user, onEdit } = renderRows()
    await user.click(screen.getByRole('button', { name: '최○○ 다음 예약' }))
    const pop = screen.getByRole('dialog', { name: '다음 예약 · 최○○' })
    expect((within(pop).getByRole('radio', { name: /^주사치료/ }) as HTMLInputElement).checked).toBe(true)
    await user.click(within(pop).getByRole('radio', { name: /^비트 따라가기/ }))
    await user.click(within(pop).getByRole('button', { name: '고르기' }))
    expect(onEdit).toHaveBeenCalledWith('10552', { revert: 'rsv' })
  })

  it('AC-4905.3: 예약 안 하고 가심을 고를 수 있다', async () => {
    const { user, onEdit } = renderRows()
    await user.click(screen.getByRole('button', { name: '김○○ 다음 예약' }))
    const pop = screen.getByRole('dialog', { name: '다음 예약 · 김○○' })
    await user.click(within(pop).getByRole('radio', { name: /^예약 안 하고 가심/ }))
    await user.click(within(pop).getByRole('button', { name: '고르기' }))
    expect(onEdit).toHaveBeenCalledWith('10231', { rsv: 'none' })
  })
})

describe('AC-4905.4 마감한 날(시안 ?s=closed)은 고칠 수 없다', () => {
  it('AC-4905.4: 마감 전인데 잠깐 못 고칠 때(불러오는 중·마감하는 중)는 마감 안내를 띄우지 않는다', () => {
    renderRows(false, false)
    expect(screen.getByText('칸을 누르면 고칠 수 있어요')).toBeTruthy()
    expect(screen.queryByText('마감한 날이라 고칠 수 없어요')).toBeNull()
    expect(screen.queryByRole('button', { name: '김○○ 카드' })).toBeNull()
  })

  it('AC-4905.4: 안내 글이 바뀌고 금액·비고·예약 칸은 누를 수 없고 Block·물리치료는 막혀 있다', () => {
    renderRows(false)
    expect(screen.getByText('마감한 날이라 고칠 수 없어요')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '김○○ 카드' })).toBeNull()
    expect(screen.queryByRole('button', { name: '김○○ 비고' })).toBeNull()
    expect(screen.queryByRole('button', { name: '김○○ 다음 예약' })).toBeNull()
    expect((screen.getByRole('checkbox', { name: '김○○ Block' }) as HTMLButtonElement).disabled).toBe(true)
    // 값은 그대로 보인다
    expect(within(rowOf('김○○')).getByText('15,000')).toBeTruthy()
    expect(within(rowOf('김○○')).getByText('주사치료')).toBeTruthy()
  })
})

describe('AC-4905.1 미수 입금(예전 미수를 그날 낸 분)', () => {
  const PAID: PaidRow[] = [
    { chart: '20788', name: '문○○', time: '', cash: 10000, card: 0 },
    { chart: '11530', name: '배○○', time: '15:42', cash: 0, card: 15000 },
  ]

  it("AC-4905.1: 시안 글자 그대로이고 '미수 생긴 날' 칸은 없다. 비트에 시각이 없으면 –", () => {
    render(<PaidRows paid={PAID} />)
    expect(screen.getByRole('heading', { name: '미수 입금' })).toBeTruthy()
    expect(screen.getByText('예전 미수를 오늘 내신 분 · 내원 수에는 안 들어가요')).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['접수', '차트', '이름', '현금', '카드'])
    expect(within(screen.getByRole('row', { name: /문○○/ })).getAllByRole('cell').map((td) => td.textContent)).toEqual([
      '–',
      '20788',
      '문○○',
      '10,000',
      '',
    ])
    expect(within(screen.getByRole('row', { name: /배○○/ })).getAllByRole('cell')[4]!.textContent).toBe('15,000')
  })

  it('AC-4905.1: 없으면 한 줄로 알린다', () => {
    render(<PaidRows paid={[]} />)
    expect(screen.getByText('미수 입금이 없어요')).toBeTruthy()
  })
})
