// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { dayTotals } from '@/lib/sunap/ledger'
import { DEFAULT_RSV_KINDS, type LedgerRow, type PaidRow, type RsvKindDef } from '@/types/sunap'
import { chipTeal } from '../labels'
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
  doctor: null,
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
const TOTALS = dayTotals({ day: '2026-11-16', unsure: false, rows: ROWS, paid: [], closedAt: null, late: false, doctors: [] })

function renderRows(editable = true, closed = !editable, kinds: readonly RsvKindDef[] = DEFAULT_RSV_KINDS, rows: readonly LedgerRow[] = ROWS) {
  const onEdit = vi.fn()
  render(<LedgerRows rows={rows} totals={TOTALS} kinds={kinds} editable={editable} closed={closed} onEdit={onEdit} />)
  return { onEdit, user: userEvent.setup() }
}

const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row')

describe('AC-4905.1 장부 표(시안 ?s=open)', () => {
  it('AC-4905.1: 머리 칸은 시안 글자 그대로이고 원장님 칸은 없다', () => {
    renderRows()
    expect(screen.getByRole('heading', { name: '환자 장부' })).toBeTruthy()
    expect(screen.getByText('칸을 누르면 고칠 수 있어요')).toBeTruthy()
    // 세우기 화살표(▲·▼·↕·▾, spec sunap-sort AC-5302.1)는 빼고 본다
    const heads = screen.getAllByRole('columnheader').map((th) => th.textContent?.replace(/[▲▼↕▾]/g, ''))
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

// ── 줄 세우기(spec sunap-sort REQ-5302, 시안 docs/mockups/sunap-sort). NO는 접수 번호라 세운 차례를 NO로 본다 ─────────
const shownNos = () => bodyRows().map((tr) => Number(within(tr).getAllByRole('cell')[0]!.textContent))
const RECEIPT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const head = (name: string) => screen.getByRole('columnheader', { name })
const headButton = (name: string) => within(head(name)).getByRole('button')
const SORTABLE = ['이름', '구분', '현금', '카드', '계좌', '미수', 'Block', '물리치료']
const rsvHead = () => screen.getByRole('columnheader', { name: /^다음 예약/ })
const rsvButton = () => within(rsvHead()).getByRole('button')
/** 표 위 한 줄(굵은 부분 포함 전체 글) */
const noteIs = (text: string) => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)
const SORT_HINT = '제목(이름·구분·금액·Block·물리치료·다음 예약)을 누르면 줄을 세워요'

// 시험 줄 10줄의 차례(ledgerSort 규칙 그대로): [제목, 오름차순 NO, 내림차순 NO, 숫자 칸(화살표가 글자 왼쪽)]
const COLUMN_ORDERS: [string, number[], number[], boolean][] = [
  ['이름', [6, 1, 3, 8, 7, 2, 10, 5, 4, 9], [9, 4, 5, 10, 2, 7, 8, 3, 1, 6], false],
  ['구분', [3, 10, 5, 1, 2, 4, 6, 7, 8, 9], [1, 2, 4, 6, 7, 8, 9, 5, 3, 10], false],
  ['현금', [1, 3, 4, 5, 6, 7, 8, 10, 2, 9], [9, 2, 1, 3, 4, 5, 6, 7, 8, 10], true],
  ['카드', [2, 6, 10, 4, 9, 1, 5, 3, 7, 8], [8, 7, 3, 5, 1, 9, 4, 2, 6, 10], true],
  ['계좌', RECEIPT, RECEIPT, true],
  ['미수', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [10, 1, 2, 3, 4, 5, 6, 7, 8, 9], true],
  ['Block', [2, 4, 6, 9, 10, 1, 3, 5, 7, 8], [1, 3, 5, 7, 8, 2, 4, 6, 9, 10], false],
  ['물리치료', [5, 7, 8, 1, 2, 3, 4, 6, 9, 10], [1, 2, 3, 4, 6, 9, 10, 5, 7, 8], false],
]
const RSV_ORDERS = {
  kindAsc: [1, 5, 8, 4, 3, 9, 10, 7, 2, 6],
  kindDesc: [7, 9, 3, 10, 8, 5, 1, 4, 2, 6],
  dateAsc: [3, 1, 5, 7, 9, 8, 4, 10, 2, 6],
  dateDesc: [8, 9, 7, 5, 1, 3, 4, 10, 2, 6],
}

describe('AC-5302.1 제목을 눌러 세우기', () => {
  it.each(COLUMN_ORDERS)('AC-5302.1: [%s]를 누를 때마다 오름차순(▲) → 내림차순(▼) → 접수 순(↕)', async (label, asc, desc, num) => {
    const { user } = renderRows()
    const text = (arrow: string) => (num ? `${arrow}${label}` : `${label}${arrow}`)
    expect(head(label).getAttribute('aria-sort')).toBe('none')
    expect(head(label).textContent).toBe(text('↕'))
    await user.click(headButton(label))
    expect(head(label).getAttribute('aria-sort')).toBe('ascending')
    expect(head(label).textContent).toBe(text('▲'))
    expect(shownNos()).toEqual(asc)
    await user.click(headButton(label))
    expect(head(label).getAttribute('aria-sort')).toBe('descending')
    expect(head(label).textContent).toBe(text('▼'))
    expect(shownNos()).toEqual(desc)
    await user.click(headButton(label))
    expect(head(label).getAttribute('aria-sort')).toBe('none')
    expect(head(label).textContent).toBe(text('↕'))
    expect(shownNos()).toEqual(RECEIPT)
  })

  it('AC-5302.1: 다른 제목을 누르면 그 칸 오름차순부터이고, 세운 칸 밖의 제목은 aria-sort none(세우지 않는 칸에는 aria-sort가 없다)', async () => {
    const { user } = renderRows()
    await user.click(headButton('이름'))
    await user.click(headButton('이름'))
    expect(head('이름').getAttribute('aria-sort')).toBe('descending')
    await user.click(headButton('카드'))
    expect(head('카드').getAttribute('aria-sort')).toBe('ascending')
    expect(shownNos()).toEqual(COLUMN_ORDERS[3]![1])
    for (const label of SORTABLE.filter((l) => l !== '카드')) expect(head(label).getAttribute('aria-sort'), label).toBe('none')
    expect(rsvHead().getAttribute('aria-sort')).toBe('none')
    for (const label of ['NO', '접수', '차트', '비고']) expect(head(label).getAttribute('aria-sort'), label).toBeNull()
  })
})

describe('AC-5302.2 다음 예약 세우는 기준 목록', () => {
  const MENU_ITEMS: [string, string][] = [
    ['종류 순 ▲', '설정에 둔 종류 순서대로'],
    ['종류 순 ▼', '거꾸로'],
    ['날짜 순 ▲', '가까운 예약부터'],
    ['날짜 순 ▼', '먼 예약부터'],
    ['접수 순', '처음 순서로'],
  ]
  const item = (label: string) => within(screen.getByRole('menu')).getByRole('menuitemradio', { name: new RegExp(`^${label}`) })

  it('AC-5302.2: [다음 예약]을 누르면 목록(role="menu")이 펼쳐지고 항목은 차례대로 다섯, 지금 기준(접수 순)이 골라져 초점을 받는다', async () => {
    const { user } = renderRows()
    expect(rsvButton().getAttribute('aria-haspopup')).toBe('menu')
    expect(rsvButton().getAttribute('aria-expanded')).toBe('false')
    expect(rsvHead().textContent).toBe('다음 예약↕▾')
    await user.click(rsvButton())
    expect(rsvButton().getAttribute('aria-expanded')).toBe('true')
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items).toHaveLength(5)
    items.forEach((el, index) => {
      const [label, sub] = MENU_ITEMS[index]!
      expect(within(el).getByText(label)).toBeTruthy()
      expect(within(el).getByText(sub)).toBeTruthy()
    })
    expect(items.map((el) => el.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false', 'true'])
    expect(document.activeElement).toBe(item('접수 순'))
    // 표가 옆으로 밀리는 칸 안이라 목록은 화면 기준(fixed)으로 누른 제목 아래에 뜬다. 바탕 흐림이 없다
    expect(menu.className).toMatch(/(^|\s)fixed(\s|$)/)
    expect(menu.style.top).not.toBe('')
    expect(screen.getByRole('table').contains(menu)).toBe(false)
  })

  it.each([
    ['종류 순 ▲', RSV_ORDERS.kindAsc, '다음 예약 · 종류▲▾', 'ascending'],
    ['종류 순 ▼', RSV_ORDERS.kindDesc, '다음 예약 · 종류▼▾', 'descending'],
    ['날짜 순 ▲', RSV_ORDERS.dateAsc, '다음 예약 · 날짜▲▾', 'ascending'],
    ['날짜 순 ▼', RSV_ORDERS.dateDesc, '다음 예약 · 날짜▼▾', 'descending'],
  ] as const)('AC-5302.2: [%s]를 고르면 목록이 닫히고 그 기준으로 세우며 제목이 바뀐다', async (label, order, title, sort) => {
    const { user } = renderRows()
    await user.click(rsvButton())
    await user.click(item(label))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(shownNos()).toEqual([...order])
    expect(rsvHead().textContent).toBe(title)
    expect(rsvHead().getAttribute('aria-sort')).toBe(sort)
    expect(rsvButton().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(rsvButton())
    // 다시 열면 고른 기준이 골라져 초점을 받는다
    await user.click(rsvButton())
    expect(item(label).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(item(label))
  })

  it('AC-5302.2: [접수 순]을 고르면 처음 순서로 돌아가고 제목은 다음 예약 ↕', async () => {
    const { user } = renderRows()
    await user.click(rsvButton())
    await user.click(item('날짜 순 ▲'))
    await user.click(rsvButton())
    await user.click(item('접수 순'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(shownNos()).toEqual(RECEIPT)
    expect(rsvHead().textContent).toBe('다음 예약↕▾')
    expect(rsvHead().getAttribute('aria-sort')).toBe('none')
  })

  it('AC-5302.2: 다음 예약으로 세운 뒤 다른 제목을 누르면 그 칸 오름차순이고 다음 예약 제목은 처음대로', async () => {
    const { user } = renderRows()
    await user.click(rsvButton())
    await user.click(item('종류 순 ▼'))
    await user.click(headButton('이름'))
    expect(head('이름').getAttribute('aria-sort')).toBe('ascending')
    expect(rsvHead().getAttribute('aria-sort')).toBe('none')
    expect(rsvHead().textContent).toBe('다음 예약↕▾')
    expect(shownNos()).toEqual(COLUMN_ORDERS[0]![1])
  })

  it('AC-5302.2: Esc를 누르면 목록이 닫히고(차례는 그대로) 초점은 제목 단추로', async () => {
    const { user } = renderRows()
    await user.click(rsvButton())
    await user.click(item('종류 순 ▲'))
    await user.click(rsvButton())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(rsvButton())
    expect(shownNos()).toEqual(RSV_ORDERS.kindAsc)
  })

  it('AC-5302.2: 목록 바깥을 누르면 닫히고, 제목을 다시 눌러도 닫힌다', async () => {
    const { user } = renderRows()
    await user.click(rsvButton())
    await user.click(screen.getByRole('heading', { name: '환자 장부' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(shownNos()).toEqual(RECEIPT)
    await user.click(rsvButton())
    expect(screen.getByRole('menu')).toBeTruthy()
    await user.click(rsvButton())
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('AC-5302.3 표 위 한 줄', () => {
  it('AC-5302.3: 세우지 않았을 때 안내, 칸으로 세우면 오름차순·내림차순 글, 다시 접수 순이면 처음 안내', async () => {
    const { user } = renderRows()
    expect(noteIs(SORT_HINT)).toBeTruthy()
    await user.click(headButton('이름'))
    expect(noteIs('이름 오름차순 · 한 번 더 누르면 내림차순')).toBeTruthy()
    // 굵은 부분
    expect(screen.getByText('이름 오름차순').tagName).toBe('B')
    await user.click(headButton('이름'))
    expect(noteIs('이름 내림차순 · 한 번 더 누르면 접수 순')).toBeTruthy()
    expect(screen.getByText('이름 내림차순').tagName).toBe('B')
    await user.click(headButton('이름'))
    expect(noteIs(SORT_HINT)).toBeTruthy()
  })

  it.each(SORTABLE)('AC-5302.3: [%s]로 세우면 그 칸 이름으로 적는다', async (label) => {
    const { user } = renderRows()
    await user.click(headButton(label))
    expect(noteIs(`${label} 오름차순 · 한 번 더 누르면 내림차순`)).toBeTruthy()
    await user.click(headButton(label))
    expect(noteIs(`${label} 내림차순 · 한 번 더 누르면 접수 순`)).toBeTruthy()
  })

  it.each([
    ['종류 순 ▲', '다음 예약 종류 순 ▲'],
    ['종류 순 ▼', '다음 예약 종류 순 ▼'],
    ['날짜 순 ▲', '다음 예약 날짜 순 ▲'],
    ['날짜 순 ▼', '다음 예약 날짜 순 ▼'],
  ])('AC-5302.3: 다음 예약 [%s]로 세우면 기준과 늘 맨 뒤 안내', async (label, strong) => {
    const { user } = renderRows()
    await user.click(rsvButton())
    await user.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: new RegExp(`^${label}`) }))
    expect(noteIs(`${strong} · '예약 안 하고 가심'은 늘 맨 뒤 · 제목을 눌러 다른 기준·접수 순`)).toBeTruthy()
    expect(screen.getByText(strong).tagName).toBe('B')
  })
})

describe('AC-5302.4 세운 표', () => {
  it('AC-5302.4: NO는 접수 번호 그대로, 합계 줄은 그대로', async () => {
    const { user } = renderRows()
    const foot = () => within(within(screen.getAllByRole('rowgroup')[2]!).getByRole('row')).getAllByRole('cell').map((td) => td.textContent)
    const before = foot()
    await user.click(headButton('카드'))
    await user.click(headButton('카드'))
    expect(within(bodyRows()[0]!).getAllByRole('cell').map((td) => td.textContent).slice(0, 4)).toEqual(['8', '10:25', '10344', '서○○'])
    expect(foot()).toEqual(before)
  })

  it('AC-5302.4: 위 칩 거르기·이름 찾기와 함께 쓰인다', async () => {
    const { user } = renderRows()
    await user.click(headButton('카드'))
    await user.click(headButton('카드'))
    await user.click(screen.getByRole('button', { name: 'Block 5' }))
    expect(shownNos()).toEqual([8, 7, 3, 5, 1])
    await user.click(screen.getByRole('button', { name: '전체 10' }))
    await user.type(screen.getByRole('searchbox', { name: '이름·차트번호 찾기' }), '10')
    // 차트번호에 10이 든 줄: 10231·10877·21004·10552·10013·10344·21006 → 카드 내림차순(0원은 접수 차례)
    expect(shownNos()).toEqual([8, 3, 1, 4, 2, 6, 10])
    expect(head('카드').getAttribute('aria-sort')).toBe('descending')
  })

  it('AC-5302.4: 마감한 날(고칠 수 없는 날)에도 제목·다음 예약 목록으로 세울 수 있다', async () => {
    const { user } = renderRows(false)
    await user.click(headButton('이름'))
    expect(shownNos()).toEqual(COLUMN_ORDERS[0]![1])
    await user.click(rsvButton())
    await user.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /^날짜 순 ▼/ }))
    expect(shownNos()).toEqual(RSV_ORDERS.dateDesc)
  })

  it('AC-5302.4: 세운 상태는 저장하지 않는다(다시 열면 접수 순)', async () => {
    const { user } = renderRows()
    await user.click(headButton('구분'))
    expect(shownNos()).toEqual(COLUMN_ORDERS[1]![1])
    cleanup()
    renderRows()
    expect(shownNos()).toEqual(RECEIPT)
    expect(head('구분').getAttribute('aria-sort')).toBe('none')
    expect(noteIs(SORT_HINT)).toBeTruthy()
  })
})

// ── 다음 예약 종류 목록(spec sunap-kinds REQ-5503, 시안 docs/mockups/sunap-kinds ?s=open·pick). 설정 목록 차례·이름·예약률을 따른다 ─────────
// 경과 보기(visit) → 도수치료(새) → 신경주사(inj, 이름 바꿈) → 기타 → 체외충격파(새)
const MY_KINDS: RsvKindDef[] = [
  { id: 'visit', label: '경과 보기', counts: true, words: ['경과'] },
  { id: 'kdosu01', label: '도수치료', counts: true, words: ['도수'] },
  { id: 'inj', label: '신경주사', counts: true, words: ['주사'] },
  { id: 'etc', label: '기타', counts: false, words: ['기타'] },
  { id: 'kshock1', label: '체외충격파', counts: false, words: ['충격파'] },
]
// 시험 줄 10줄 + 새 종류·기타 줄
const MORE_ROWS: LedgerRow[] = [
  ...ROWS,
  row({ chart: '21007', name: '신○○', time: '10:33', kind: 'new', card: 19700, rsv: { kind: 'kdosu01', source: 'bit', at: '202611191000' } }),
  row({ chart: '10498', name: '장○○', time: '10:50', transfer: 25000, rsv: { kind: 'etc', source: 'bit', at: '202611231000' } }),
]
const chipOf = (name: string, text: string) => within(rowOf(name)).getByText(text)

describe('AC-5503.5 장부 칩·설명 줄·종류 순', () => {
  it('AC-5503.5: 다음 예약 칩 글은 설정 이름이고 색은 주사치료 파랑·진료(경과) 청록·종류 모름 노랑·기타와 새 종류 회색이다', () => {
    renderRows(true, false, MY_KINDS, MORE_ROWS)
    expect(chipOf('김○○', '신경주사').className).toBe(ds.chip.accent)
    expect(chipOf('박○○', '경과 보기').className).toBe(chipTeal)
    expect(chipOf('윤○○', '종류 모름').className).toBe(ds.chip.warning)
    expect(chipOf('신○○', '도수치료').className).toBe(ds.chip.neutral)
    expect(chipOf('장○○', '기타').className).toBe(ds.chip.neutral)
    expect(within(rowOf('이○○')).getByText('예약 안 하고 가심')).toBeTruthy()
    expect(screen.queryByText('주사치료')).toBeNull()
    expect(screen.queryByText('진료(경과)')).toBeNull()
  })

  it('AC-5503.5: 장부 아래 설명 줄에 회색 칩(목록에서 inj·visit 아닌 첫 종류 이름)과 "설정에서 더한 종류·기타는 회색"', () => {
    renderRows(true, false, MY_KINDS, MORE_ROWS)
    const said = screen.getByText('설정에서 더한 종류·기타는 회색')
    const legend = said.parentElement!
    expect(legend.textContent).toBe('도수치료설정에서 더한 종류·기타는 회색')
    expect(within(legend).getByText('도수치료').className).toBe(ds.chip.neutral)
    // 기본 목록이면 기타
    cleanup()
    renderRows()
    expect(screen.getByText('설정에서 더한 종류·기타는 회색').parentElement!.textContent).toBe('기타설정에서 더한 종류·기타는 회색')
  })

  it('AC-5503.5: 줄 세우기 메뉴 [종류 순 ▲] 아래 글은 "설정에 둔 종류 순서대로"이고, 종류 순은 설정 목록 차례 → 종류 모름 → 예약 안 하고 가심이다', async () => {
    const { user } = renderRows(true, false, MY_KINDS)
    await user.click(rsvButton())
    const first = within(screen.getByRole('menu')).getAllByRole('menuitemradio')[0]!
    expect(first.textContent).toBe('종류 순 ▲설정에 둔 종류 순서대로')
    await user.click(first)
    // 경과 보기(3·9·10) → 신경주사(1·5·8·4) → 종류 모름(7) → 예약 안 하고 가심(2·6)
    expect(shownNos()).toEqual([3, 9, 10, 1, 5, 8, 4, 7, 2, 6])
    await user.click(rsvButton())
    await user.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /^종류 순 ▼/ }))
    expect(shownNos()).toEqual([7, 8, 5, 1, 4, 9, 3, 10, 2, 6])
  })
})

describe('AC-5503.4 다음 예약 고르기 판(시안 ?s=pick)', () => {
  const TIP_2 = '종류를 더하거나 예약률 ○·✕를 바꾸려면 [설정] → 다음 예약 종류에서 해요.'

  it('AC-5503.4: 선택지는 비트 따라가기 · 예약 안 하고 가심(예약률 ✕) · 가는 선 · 설정 목록 차례대로 모든 종류(예약률 ○·✕)이고 팁 아래에 설정 안내가 있다', async () => {
    const { user } = renderRows(true, false, MY_KINDS, MORE_ROWS)
    await user.click(screen.getByRole('button', { name: '윤○○ 다음 예약' }))
    const pop = screen.getByRole('dialog', { name: '다음 예약 · 윤○○' })
    const radios = within(pop).getAllByRole('radio')
    expect(radios.map((radio) => radio.closest('label')!.textContent)).toEqual([
      '비트 따라가기지금: 11/21 (토) 예약 있음 · 종류 모름—',
      '예약 안 하고 가심예약률 ✕',
      '경과 보기예약률 ○',
      '도수치료예약률 ○',
      '신경주사예약률 ○',
      '기타예약률 ✕',
      '체외충격파예약률 ✕',
    ])
    // 예약 안 하고 가심과 종류 사이 가는 선
    const line = radios[1]!.closest('label')!.nextElementSibling!
    expect(line.tagName).not.toBe('LABEL')
    expect(line.getAttribute('aria-hidden')).toBe('true')
    // 판 머리 글(차트 · 구분) 다음의 두 팁
    const tips = [...pop.querySelectorAll('p')].map((p) => p.textContent)
    expect(tips.slice(1)).toEqual([
      '직접 고르면 비트 예약보다 이 값을 써요. 비트에 없는 예약(전화·종이 예약)도 여기서 고르면 돼요. 마감을 풀었다 다시 해도 직접 고른 값은 그대로예요.',
      TIP_2,
    ])
  })

  it('AC-5503.4: 비트 따라가기 아래 글의 종류 이름도 설정 이름이고, 새 종류를 고르면 그 id를 넘긴다', async () => {
    const { user, onEdit } = renderRows(true, false, MY_KINDS, MORE_ROWS)
    await user.click(screen.getByRole('button', { name: '김○○ 다음 예약' }))
    const pop = screen.getByRole('dialog', { name: '다음 예약 · 김○○' })
    expect(within(pop).getByText('지금: 11/19 (목) 예약 있음 · 신경주사')).toBeTruthy()
    await user.click(within(pop).getByRole('radio', { name: /^도수치료/ }))
    await user.click(within(pop).getByRole('button', { name: '고르기' }))
    expect(onEdit).toHaveBeenCalledWith('10231', { rsv: 'kdosu01' })
  })

  it('AC-5503.4: 기본 목록이면 지금처럼 다섯 선택지이고 설정 안내 팁이 있다', async () => {
    const { user } = renderRows()
    await user.click(screen.getByRole('button', { name: '윤○○ 다음 예약' }))
    const pop = screen.getByRole('dialog', { name: '다음 예약 · 윤○○' })
    expect(within(pop).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual([
      '비트 따라가기지금: 11/21 (토) 예약 있음 · 종류 모름—',
      '예약 안 하고 가심예약률 ✕',
      '주사치료예약률 ○',
      '진료(경과)예약률 ○',
      '기타예약률 ✕',
    ])
    expect([...pop.querySelectorAll('p')].map((p) => p.textContent)).toContain(TIP_2)
  })
})
