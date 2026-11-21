// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCountLines, listReceiptLines, loadInventory } from '@/lib/storage/inventory'
import type { InvCategory, InvCountLine, InvItem, InvReceiptLine } from '@/types/inventory'
import { MonthlyTool } from './MonthlyTool'

// 달별 도구 (spec inventory REQ-7510 AC-7510.1·AC-7510.2, 시안 docs/mockups/inventory ?s=month).
// 저장 모듈은 가짜(vi.mock), 계산은 진짜 monthlyReport다. 물품 이름·숫자는 시험 안에서 지은 가짜다

vi.mock('@/lib/storage/inventory', () => ({
  loadInventory: vi.fn(),
  listCountLines: vi.fn(),
  listReceiptLines: vi.fn(),
}))

const load = vi.mocked(loadInventory)
const countLines = vi.mocked(listCountLines)
const receiptLines = vi.mocked(listReceiptLines)

const TODAY = '2026-11-21'
const MINUS = '−'
const C_MED = 'c-med'
const C_SUP = 'c-sup'
// 일부러 분류 차례를 거꾸로 준다(sort_order로 다시 맞추는지 본다)
const CATEGORIES: InvCategory[] = [
  { id: C_SUP, name: '치료 소모품', sortOrder: 1 },
  { id: C_MED, name: '약품', sortOrder: 0 },
]

function item(over: Partial<InvItem> & Pick<InvItem, 'id' | 'categoryId' | 'name' | 'unit' | 'sortOrder'>): InvItem {
  return {
    minQty: null,
    qty: 0,
    lastCountQty: null,
    lastCountedAt: null,
    expiry: null,
    vendor: null,
    unitPrice: null,
    bitCode: null,
    hidden: false,
    orderedAt: null,
    ...over,
  }
}

const ITEMS: InvItem[] = [
  item({ id: 'i3', categoryId: C_SUP, name: '주사기 3cc', unit: '개', sortOrder: 0 }),
  item({ id: 'i1', categoryId: C_MED, name: '히알루론산 주사 2mL', unit: '개', sortOrder: 0 }),
  item({ id: 'i2', categoryId: C_MED, name: '리도카인 주사 2% 20mL', unit: '병', sortOrder: 1 }),
  item({ id: 'i4', categoryId: C_SUP, name: '알코올 솜', unit: '통', sortOrder: 1 }),
  item({ id: 'i5', categoryId: C_SUP, name: '주사기 5cc', unit: '개', sortOrder: 2, hidden: true }),
]

const saved = (day: string, hour = '01') => `${day}T${hour}:00:00+00:00`
const count = (itemId: string, day: string, qty: number): InvCountLine => ({ itemId, day, savedAt: saved(day), qty })
const receipt = (itemId: string, day: string, savedAt: string, qty: number, amount: number): InvReceiptLine => ({
  itemId,
  day,
  savedAt,
  qty,
  unitPrice: null,
  amount,
})

// 10월 쓴 양: i1 30(10/24→10/31), i2 21. 11월 쓴 양: i1 20+14 = 34, i2 (9+20−20)+(20−11) = 18, i3 40(새로 생김), i4 3→8 = 빠진 입고(0)
const COUNTS: InvCountLine[] = [
  count('i1', '2026-10-24', 100),
  count('i1', '2026-10-31', 70),
  count('i1', '2026-11-07', 50),
  count('i1', '2026-11-14', 36),
  count('i2', '2026-10-24', 30),
  count('i2', '2026-10-31', 9),
  count('i2', '2026-11-07', 20),
  count('i2', '2026-11-14', 11),
  count('i3', '2026-11-07', 100),
  count('i3', '2026-11-14', 60),
  count('i4', '2026-11-07', 3),
  count('i4', '2026-11-14', 8),
]
// 11월 구입비: i2 28,000(11/2) + i1 185,000(11/15, 마지막 세기 뒤 저장) = 213,000, 2건. 10월: i1 370,000 + i3 19,000 = 389,000, 1건
const RECEIPTS: InvReceiptLine[] = [
  receipt('i2', '2026-11-02', saved('2026-11-02', '02'), 20, 28_000),
  receipt('i1', '2026-11-15', saved('2026-11-15', '03'), 10, 185_000),
  receipt('i1', '2026-10-15', saved('2026-10-15', '03'), 20, 370_000),
  receipt('i3', '2026-10-15', saved('2026-10-15', '03'), 200, 19_000),
]

function feed({ counts = COUNTS, receipts = RECEIPTS }: { counts?: InvCountLine[]; receipts?: InvReceiptLine[] } = {}) {
  load.mockResolvedValue({ categories: CATEGORIES, items: ITEMS })
  countLines.mockResolvedValue(counts)
  receiptLines.mockResolvedValue(receipts)
}

/** 그 글을 가진 칸이 있는 줄의 칸 글자들 */
function rowOf(text: string, table: HTMLElement): string[] {
  const cell = within(table).getByText(text)
  const row = cell.closest('tr')
  if (row === null) throw new Error(`줄이 없어요: ${text}`)
  return [...row.children].map((c) => c.textContent ?? '')
}

/** 표 머리(thead). 물품별 표의 분류 머리 줄(th scope=colgroup)은 몸에 있다 */
function headOf(table: HTMLElement): HTMLElement {
  const head = table.querySelector('thead')
  if (head === null) throw new Error('표 머리가 없어요')
  return head
}

async function ready() {
  return screen.findByRole('table', { name: '물품별 쓴 양 · 구입비' })
}

beforeEach(() => {
  vi.clearAllMocks()
  feed()
})
afterEach(cleanup)

describe('MonthlyTool', () => {
  it('AC-7510.1: 이번 달이 기본이고 ◀ yyyy년 m월 ▶ — 이번 달보다 뒤로는 못 간다', async () => {
    render(<MonthlyTool today={TODAY} />)
    await ready()
    expect(screen.getByText('2026년 11월')).toBeTruthy()
    const next = screen.getByRole('button', { name: '12월' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    const prev = screen.getByRole('button', { name: '10월' }) as HTMLButtonElement
    expect(prev.disabled).toBe(false)
  })

  it('AC-7510.1: 고른 달 첫날 − 1달 − 35일부터 그 달 끝까지 세기·입고 줄을 읽는다', async () => {
    render(<MonthlyTool today={TODAY} />)
    await ready()
    expect(load).toHaveBeenCalledTimes(1)
    expect(countLines).toHaveBeenCalledWith({ from: '2026-08-27', to: '2026-11-30' })
    expect(receiptLines).toHaveBeenCalledWith({ from: '2026-08-27', to: '2026-11-30' })
  })

  it('AC-7510.1: ◀로 지난달을 고르면 그 달 구간으로 다시 읽고, ▶로 이번 달에 돌아온다', async () => {
    const user = userEvent.setup()
    render(<MonthlyTool today={TODAY} />)
    await ready()
    await user.click(screen.getByRole('button', { name: '10월' }))
    expect(await screen.findByText('2026년 10월')).toBeTruthy()
    await waitFor(() => expect(countLines).toHaveBeenLastCalledWith({ from: '2026-07-28', to: '2026-10-31' }))
    expect(receiptLines).toHaveBeenLastCalledWith({ from: '2026-07-28', to: '2026-10-31' })
    expect(await screen.findByText(/10월에 끝난 세기 2번/)).toBeTruthy()
    const next = screen.getByRole('button', { name: '11월' }) as HTMLButtonElement
    expect(next.disabled).toBe(false)
    await user.click(next)
    expect(await screen.findByText('2026년 11월')).toBeTruthy()
    expect((screen.getByRole('button', { name: '12월' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-7510.1: 해가 바뀌는 달도 고른다(1월 ◀ = 12월)', async () => {
    const user = userEvent.setup()
    render(<MonthlyTool today="2027-01-05" />)
    await ready()
    expect(screen.getByText('2027년 1월')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '12월' }))
    expect(await screen.findByText('2026년 12월')).toBeTruthy()
    await waitFor(() => expect(countLines).toHaveBeenLastCalledWith({ from: '2026-09-27', to: '2026-12-31' }))
  })

  it('AC-7510.2: 그 달에 끝난 세기 날짜와 쓴 양 구간이 보인다', async () => {
    render(<MonthlyTool today={TODAY} />)
    await ready()
    expect(screen.getByText('11월에 끝난 세기 2번: 11월 7일 · 14일 (10월 31일 ~ 11월 14일에 쓴 양)')).toBeTruthy()
    expect(
      screen.getByText(`쓴 양 = 지난 세기 + 그 사이 들어온 것 ${MINUS} 이번 세기. 그 달에 끝난 주를 더해요(달을 걸친 주는 끝난 날의 달). 구입비 = 그 달 들어온 기록 금액의 합.`),
    ).toBeTruthy()
  })

  it('AC-7510.2: 숫자 세 칸(구입비·들어온 기록·세기)이 원 단위 정수와 지난달로 보인다', async () => {
    render(<MonthlyTool today={TODAY} />)
    await ready()
    const tiles = screen.getByRole('list', { name: '11월 숫자' })
    const items = within(tiles).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual([
      `11월 구입비213,000원10월 389,000원 · ${MINUS}176,000원 (${MINUS}45.2%)줄어듦`,
      '들어온 기록2건10월 1건',
      '세기2번빠진 입고 1개',
    ])
  })

  it('AC-7510.2: 분류별 구입비 표는 분류 차례 줄과 합계 줄이고, 0원은 –다', async () => {
    render(<MonthlyTool today={TODAY} />)
    await ready()
    const table = screen.getByRole('table', { name: '분류별 구입비' })
    const head = within(headOf(table))
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(head).toEqual(['분류', '11월 구입비', '10월', '지난달보다'])
    const body = within(table).getAllByRole('row').slice(1)
    expect(body.map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['약품', '213,000원', '370,000원', `${MINUS}157,000원 (${MINUS}42.4%)줄어듦`],
      ['치료 소모품', '–', '19,000원', `${MINUS}19,000원 (${MINUS}100.0%)줄어듦`],
      ['합계', '213,000원', '389,000원', `${MINUS}176,000원 (${MINUS}45.2%)줄어듦`],
    ])
  })

  it('AC-7510.2: 물품별 표는 분류 머리 줄에 분류 합계, 물품마다 쓴 양·지난달·증감·구입비이고 안 쓰는 물품은 자료가 없으면 빠진다', async () => {
    const table = await (render(<MonthlyTool today={TODAY} />), ready())
    const head = within(headOf(table))
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(head).toEqual(['이름', '11월 쓴 양', '10월', '지난달보다', '11월 구입비', '10월'])
    expect(rowOf('약품', table)).toEqual(['약품2개', '213,000원', '370,000원'])
    expect(rowOf('히알루론산 주사 2mL', table)).toEqual(['히알루론산 주사 2mL', '34개', '30', '+4 (+13.3%)늘어남', '185,000원', '370,000원'])
    expect(rowOf('리도카인 주사 2% 20mL', table)).toEqual([
      '리도카인 주사 2% 20mL',
      '18병',
      '21',
      `${MINUS}3 (${MINUS}14.2%)줄어듦`,
      '28,000원',
      '–',
    ])
    expect(rowOf('치료 소모품', table)).toEqual(['치료 소모품2개', '0원', '19,000원'])
    expect(rowOf('주사기 3cc', table)).toEqual(['주사기 3cc', '40개', '–', '새로 생김', '–', '19,000원'])
    expect(within(table).queryByText('주사기 5cc')).toBeNull()
    // 차례: 약품 → 히알루론산 → 리도카인 → 치료 소모품 → 주사기 3cc → 알코올 솜
    const firsts = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => tr.children[0].textContent)
    expect(firsts).toEqual(['약품2개', '히알루론산 주사 2mL', '리도카인 주사 2% 20mL', '치료 소모품2개', '주사기 3cc', '알코올 솜'])
    expect(screen.getByText("'–' = 그 달 세기가 없었거나 그 달에 들어온 기록이 없어요.")).toBeTruthy()
  })

  it('AC-7510.2: 빠진 입고가 있는 물품은 쓴 양 0에 "빠진 입고" 표시가 붙는다', async () => {
    const table = await (render(<MonthlyTool today={TODAY} />), ready())
    expect(rowOf('알코올 솜', table)).toEqual(['알코올 솜', '빠진 입고0통', '–', '–', '–', '–'])
    expect(within(table).getAllByText('빠진 입고')).toHaveLength(1)
    expect(screen.getByText(/'빠진 입고' = 센 수량이 지난 수량과 그 사이 들어온 것보다 많았어요/)).toBeTruthy()
  })

  it('AC-7510.2: 증감은 색 없이 화살표 + 글이다(늘어남·줄어듦은 읽기 글, 초록·빨강 없음)', async () => {
    const { container } = render(<MonthlyTool today={TODAY} />)
    const table = await ready()
    const up = within(table).getByText('+4 (+13.3%)')
    expect(up.querySelector('svg')).not.toBeNull()
    expect(up.className).toContain('text-ink-2')
    const down = within(table).getByText(`${MINUS}3 (${MINUS}14.2%)`)
    expect(down.querySelector('svg')).not.toBeNull()
    expect(down.className).toContain('text-ink-2')
    const fresh = within(table).getByText('새로 생김')
    expect(fresh.querySelector('svg')).toBeNull()
    expect(fresh.className).toContain('text-muted')
    expect(container.innerHTML).not.toMatch(/text-positive|text-negative|bg-positive|bg-negative/)
  })

  it('AC-7510.2: 세기가 없는 달은 쓴 양 자리에 "이 달에 끝난 세기가 없어요"다', async () => {
    feed({ counts: [] })
    render(<MonthlyTool today={TODAY} />)
    await ready()
    expect(screen.getByText('이 달에 끝난 세기가 없어요')).toBeTruthy()
    expect(screen.queryByText(/에 끝난 세기 \d+번/)).toBeNull()
    const tiles = screen.getByRole('list', { name: '11월 숫자' })
    expect(within(tiles).getAllByRole('listitem')[2].textContent).toBe('세기0번빠진 입고 없음')
  })

  it('AC-7510.2: 두 표는 제 상자 안에서 옆으로 밀린다', async () => {
    render(<MonthlyTool today={TODAY} />)
    await ready()
    for (const name of ['분류별 구입비', '물품별 쓴 양 · 구입비']) {
      const table = screen.getByRole('table', { name })
      expect(table.parentElement?.className).toContain('overflow-x-auto')
    }
  })

  it('AC-7510.1: 읽기에 실패하면 오류 카드와 [다시 읽기], 누르면 다시 읽어 그린다', async () => {
    const user = userEvent.setup()
    load.mockResolvedValueOnce('failed')
    render(<MonthlyTool today={TODAY} />)
    expect(await screen.findByText('재고를 읽지 못했어요')).toBeTruthy()
    expect(screen.getByText('오류 번호 E-INV-READ-FAILED')).toBeTruthy()
    // 달 고르기는 실패해도 그대로 있다
    expect(screen.getByText('2026년 11월')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    await ready()
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('재고를 읽지 못했어요')).toBeNull()
  })

  it('AC-7510.1: 세기·입고 줄 읽기 실패도 오류 카드다', async () => {
    receiptLines.mockResolvedValueOnce('failed')
    render(<MonthlyTool today={TODAY} />)
    expect(await screen.findByText('재고를 읽지 못했어요')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
