// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { loadInventory, setOrdered } from '@/lib/storage/inventory'
import type { InvCategory, InvInventory, InvItem } from '@/types/inventory'
import { AlertBar } from './AlertBar'

// 목록 도구 맨 위 '챙길 것' (spec inventory REQ-7511 AC-7511.1·AC-7511.2, design.md 6절 TASK-13, 시안 docs/mockups/inventory ?s=list · notes.md 4).
// 저장 모듈은 가짜(loadInventory·setOrdered). 오늘은 prop 2026-11-21(토). [주문함]을 누른 시각은 Date만 가짜로 2026-11-21 한국 낮이다

vi.mock('@/lib/storage/inventory', () => ({
  loadInventory: vi.fn(),
  setOrdered: vi.fn(),
}))

const TODAY = '2026-11-21'
const NOW = new Date('2026-11-21T03:00:00.000Z') // 한국 2026-11-21 12:00

const CATS: InvCategory[] = [
  { id: 'c2', name: '치료 소모품', sortOrder: 1 },
  { id: 'c1', name: '약품', sortOrder: 0 },
]
const item = (over: Partial<InvItem> & Pick<InvItem, 'id' | 'name'>): InvItem => ({
  categoryId: 'c1',
  unit: '개',
  minQty: null,
  qty: 0,
  lastCountQty: null,
  lastCountedAt: null,
  expiry: null,
  vendor: null,
  unitPrice: null,
  bitCode: null,
  sortOrder: 0,
  hidden: false,
  orderedAt: null,
  ...over,
})
const HYAL = item({ id: 'a', name: '히알루론산 주사 2mL', qty: 4, minQty: 10, expiry: '2027-03-31', vendor: '한빛약품', sortOrder: 0 })
const LIDO = item({ id: 'b', name: '리도카인 주사 2% 20mL', unit: '병', qty: 26, minQty: 10, expiry: '2026-12-05', vendor: '한빛약품', sortOrder: 1 })
const SYRINGE = item({ id: 'c', categoryId: 'c2', name: '주사기 3cc', qty: 40, minQty: 100, vendor: '메디팜', sortOrder: 0, orderedAt: '2026-11-20T02:00:00.000Z' })
const SWAB = item({ id: 'd', categoryId: 'c2', name: '알코올 솜', unit: '통', qty: 3, minQty: 4, expiry: '2027-08-31', vendor: '메디팜', sortOrder: 1 })
const GEL = item({ id: 'e', categoryId: 'c2', name: '초음파 젤', unit: '통', qty: 5, minQty: 3, expiry: '2026-11-18', vendor: '메디팜', sortOrder: 2 })
const GAUZE = item({ id: 'f', categoryId: 'c2', name: '멸균 거즈', unit: '봉', qty: 22, minQty: 10, expiry: TODAY, sortOrder: 3 })
const HIDDEN = item({ id: 'g', categoryId: 'c2', name: '주사기 5cc', qty: 0, minQty: 100, expiry: '2026-11-01', sortOrder: 4, hidden: true })
const FINE = item({ id: 'h', categoryId: 'c2', name: '전기치료 패드', qty: 60, minQty: 40, sortOrder: 5 })
// 일부러 목록 차례가 아닌 차례로 준다 → 화면은 sortItems 차례(분류 → sort_order)로 그린다
const ITEMS = [GAUZE, SWAB, HIDDEN, SYRINGE, LIDO, FINE, GEL, HYAL]
const loaded = (items: InvItem[] = ITEMS): InvInventory => ({ categories: CATS, items })

const load = vi.mocked(loadInventory)
const order = vi.mocked(setOrdered)

const section = () => screen.getByRole('region', { name: '챙길 것' })
const rows = () => within(section()).getAllByRole('listitem')
const names = () => rows().map((li) => li.children[1]!.textContent)
const rowOf = (name: string) => rows().find((li) => li.children[1]!.textContent === name)!
const headChips = () => within(section()).getByRole('heading', { name: '챙길 것' }).parentElement!

async function shown(props: Partial<Parameters<typeof AlertBar>[0]> = {}) {
  const view = render(<AlertBar today={TODAY} {...props} />)
  await screen.findAllByRole('listitem')
  return view
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  load.mockReset().mockResolvedValue(loaded())
  order.mockReset().mockResolvedValue('ok')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-7511.1: 챙길 것 — 머리·칩·줄 글자', () => {
  it('AC-7511.1: 머리 "챙길 것"과 칩 주문하세요 n·기한 가까움 n(주문함은 수에서 빠짐), 숨긴 물품은 없다', async () => {
    await shown()
    expect(within(section()).getByRole('heading', { level: 2, name: '챙길 것' })).toBeTruthy()
    const head = headChips()
    expect(within(head).getByText('주문하세요 2')).toBeTruthy()
    expect(within(head).getByText('기한 가까움 3')).toBeTruthy()
    expect(within(head).getByText('주문함 1개는 들어오면 저절로 풀려요')).toBeTruthy()
    expect(section().textContent).not.toContain('주사기 5cc')
    expect(section().textContent).not.toContain('전기치료 패드')
  })

  it('AC-7511.1: 줄 차례는 주문하세요 → 기한 가까움 → 주문함, 각각 목록 차례(분류 → sort_order)', async () => {
    await shown()
    expect(names()).toEqual(['히알루론산 주사 2mL', '알코올 솜', '리도카인 주사 2% 20mL', '초음파 젤', '멸균 거즈', '주사기 3cc'])
  })

  it('AC-7511.1: 주문하세요 줄 = 칩 "주문하세요" + "남은 a단위 · 최소 b" + 거래처', async () => {
    await shown()
    const row = rowOf('히알루론산 주사 2mL')
    expect(row.children[0]!.textContent).toBe('주문하세요')
    expect(row.children[2]!.textContent).toBe('남은 4개 · 최소 10')
    expect(row.children[3]!.textContent).toBe('한빛약품')
    expect(rowOf('알코올 솜').children[2]!.textContent).toBe('남은 3통 · 최소 4')
  })

  it('AC-7511.1: 기한 줄 = 칩 기한 가까움(지난 것은 기한 지남) + "기한 m월 d일 · n일 남음 / 오늘까지 / n일 지났어요 · 남은 a단위"', async () => {
    await shown()
    const lido = rowOf('리도카인 주사 2% 20mL')
    expect(lido.children[0]!.textContent).toBe('기한 가까움')
    expect(lido.children[2]!.textContent).toBe('기한 12월 5일 · 14일 남음 · 남은 26병')
    const gel = rowOf('초음파 젤')
    expect(gel.children[0]!.textContent).toBe('기한 지남')
    expect(gel.children[2]!.textContent).toBe('기한 11월 18일 · 3일 지났어요 · 남은 5통')
    const gauze = rowOf('멸균 거즈')
    expect(gauze.children[0]!.textContent).toBe('기한 가까움')
    expect(gauze.children[2]!.textContent).toBe('기한 11월 21일 · 오늘까지 · 남은 22봉')
    expect(gauze.children[3]!.textContent).toBe('')
  })

  it('AC-7511.1: 수량은 쉼표로 끊어 쓴다', async () => {
    load.mockResolvedValue(loaded([item({ id: 'x', name: '일회용 장갑 M', unit: '갑', qty: 1200, minQty: 1500 })]))
    await shown()
    expect(rowOf('일회용 장갑 M').children[2]!.textContent).toBe('남은 1,200갑 · 최소 1,500')
    // 주문함이 없으면 머리 옆 글은 기한 기준
    expect(within(headChips()).getByText('기한 가까움 = 30일 안')).toBeTruthy()
    expect(within(headChips()).queryByText(/기한 가까움 \d/)).toBeNull()
  })

  it('AC-7511.1: [주문함]은 주문하세요 줄에만 있고 기한 줄에는 단추가 없다', async () => {
    await shown()
    for (const name of ['히알루론산 주사 2mL', '알코올 솜']) {
      expect(within(rowOf(name)).getByRole('button', { name: `${name} 주문함` }).textContent).toBe('주문함')
    }
    for (const name of ['리도카인 주사 2% 20mL', '초음파 젤', '멸균 거즈']) expect(within(rowOf(name)).queryAllByRole('button')).toEqual([])
  })

  it('AC-7511.1: 알림이 없으면 "챙길 것이 없어요." 한 줄(칩·목록 없음)', async () => {
    load.mockResolvedValue(loaded([FINE, HIDDEN]))
    render(<AlertBar today={TODAY} />)
    expect(await screen.findByText('챙길 것이 없어요.')).toBeTruthy()
    expect(within(section()).queryAllByRole('listitem')).toEqual([])
    expect(section().textContent).toBe('챙길 것챙길 것이 없어요.')
  })

  it('AC-7511.1: 물품이 없어도 "챙길 것이 없어요."', async () => {
    load.mockResolvedValue(loaded([]))
    render(<AlertBar today={TODAY} />)
    expect(await screen.findByText('챙길 것이 없어요.')).toBeTruthy()
  })

  it('AC-7511.1: 처음 분류를 넣지 않고 읽는다(seed: false), 읽는 동안은 "챙길 것이 없어요."를 보이지 않는다', async () => {
    let resolve: (value: InvInventory) => void = () => {}
    load.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<AlertBar today={TODAY} />)
    expect(load).toHaveBeenCalledWith({ seed: false })
    expect(section().textContent).toBe('챙길 것')
    await act(async () => resolve(loaded()))
    expect(rows()).toHaveLength(6)
  })

  it('AC-7511.1: 읽기 실패면 오류 카드 E-INV-READ-FAILED + [다시 읽기]로 다시 읽는다', async () => {
    load.mockResolvedValueOnce('failed')
    const user = userEvent.setup()
    render(<AlertBar today={TODAY} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-INV-READ-FAILED').what)
    expect(alert.textContent).toContain('오류 번호 E-INV-READ-FAILED')
    await user.click(within(section()).getByRole('button', { name: '다시 읽기' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(6)
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7511.1: reloadKey가 바뀌면 다시 읽는다', async () => {
    const view = await shown({ reloadKey: 0 })
    load.mockResolvedValue(loaded([HYAL]))
    view.rerender(<AlertBar today={TODAY} reloadKey={1} />)
    await vi.waitFor(() => expect(names()).toEqual(['히알루론산 주사 2mL']))
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('AC-7511.2: [주문함]·[주문 취소]', () => {
  it('AC-7511.2: 주문함인 줄 = 칩 "주문함 m/d"(누른 한국 날짜) + [주문 취소], 흐린 글, 맨 아래', async () => {
    await shown()
    const row = rowOf('주사기 3cc')
    expect(row.children[0]!.textContent).toBe('주문함 11/20')
    expect(row.children[2]!.textContent).toBe('남은 40개 · 최소 100')
    expect(within(row).getByRole('button', { name: '주사기 3cc 주문함 표시 취소' }).textContent).toBe('주문 취소')
    expect(names().at(-1)).toBe('주사기 3cc')
  })

  it('AC-7511.2: [주문함]을 누르면 setOrdered(id, true) → 그 줄은 "주문함 m/d" + [주문 취소]로 맨 아래 묶음, 알림 수에서 빠지고 onChanged', async () => {
    const onChanged = vi.fn()
    const user = userEvent.setup()
    await shown({ onChanged })
    await user.click(within(rowOf('히알루론산 주사 2mL')).getByRole('button', { name: '히알루론산 주사 2mL 주문함' }))
    expect(order).toHaveBeenCalledWith('a', true)
    // 맨 아래 주문함 묶음으로 간다(묶음 안은 다른 줄처럼 목록 차례)
    await vi.waitFor(() => expect(names()).toEqual(['알코올 솜', '리도카인 주사 2% 20mL', '초음파 젤', '멸균 거즈', '히알루론산 주사 2mL', '주사기 3cc']))
    const row = rowOf('히알루론산 주사 2mL')
    expect(row.children[0]!.textContent).toBe('주문함 11/21')
    expect(within(row).getByRole('button', { name: '히알루론산 주사 2mL 주문함 표시 취소' })).toBeTruthy()
    expect(within(headChips()).getByText('주문하세요 1')).toBeTruthy()
    expect(within(headChips()).getByText('기한 가까움 3')).toBeTruthy()
    expect(within(headChips()).getByText('주문함 2개는 들어오면 저절로 풀려요')).toBeTruthy()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('AC-7511.2: 주문하세요가 모두 주문함이면 주문하세요 칩이 없다(기한 가까움은 남는다)', async () => {
    const user = userEvent.setup()
    await shown()
    await user.click(within(rowOf('히알루론산 주사 2mL')).getByRole('button', { name: '히알루론산 주사 2mL 주문함' }))
    await vi.waitFor(() => expect(within(headChips()).getByText('주문하세요 1')).toBeTruthy())
    await user.click(within(rowOf('알코올 솜')).getByRole('button', { name: '알코올 솜 주문함' }))
    await vi.waitFor(() => expect(within(headChips()).queryByText(/^주문하세요/)).toBeNull())
    expect(within(headChips()).getByText('기한 가까움 3')).toBeTruthy()
  })

  it('AC-7511.2: [주문 취소]는 setOrdered(id, false)로 되돌려 다시 주문하세요 줄(목록 차례 자리)과 수에 든다', async () => {
    const onChanged = vi.fn()
    const user = userEvent.setup()
    await shown({ onChanged })
    await user.click(within(rowOf('주사기 3cc')).getByRole('button', { name: '주사기 3cc 주문함 표시 취소' }))
    expect(order).toHaveBeenCalledWith('c', false)
    await vi.waitFor(() => expect(names()).toEqual(['히알루론산 주사 2mL', '주사기 3cc', '알코올 솜', '리도카인 주사 2% 20mL', '초음파 젤', '멸균 거즈']))
    const row = rowOf('주사기 3cc')
    expect(row.children[0]!.textContent).toBe('주문하세요')
    expect(within(row).getByRole('button', { name: '주사기 3cc 주문함' })).toBeTruthy()
    expect(within(headChips()).getByText('주문하세요 3')).toBeTruthy()
    expect(within(headChips()).getByText('기한 가까움 = 30일 안')).toBeTruthy()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('AC-7511.2: 주문함은 주문하세요 칩만 바꾸고 같은 물품의 기한 줄은 그대로 남는다', async () => {
    const both = item({ id: 'z', name: '케토프로펜 패치', unit: '봉', qty: 2, minQty: 20, expiry: '2026-12-01', orderedAt: '2026-11-19T01:00:00.000Z' })
    load.mockResolvedValue(loaded([both]))
    await shown()
    const all = rows()
    expect(all).toHaveLength(2)
    expect(all[0]!.children[0]!.textContent).toBe('기한 가까움')
    expect(all[0]!.children[2]!.textContent).toBe('기한 12월 1일 · 10일 남음 · 남은 2봉')
    expect(within(all[0]!).queryAllByRole('button')).toEqual([])
    expect(all[1]!.children[0]!.textContent).toBe('주문함 11/19')
    expect(within(headChips()).queryByText(/^주문하세요/)).toBeNull()
    expect(within(headChips()).getByText('기한 가까움 1')).toBeTruthy()
  })

  it('AC-7511.2: 저장이 실패하면 줄은 그대로이고 오류 카드 E-INV-SAVE-FAILED, onChanged는 부르지 않는다', async () => {
    order.mockResolvedValue('failed')
    const onChanged = vi.fn()
    const user = userEvent.setup()
    await shown({ onChanged })
    await user.click(within(rowOf('히알루론산 주사 2mL')).getByRole('button', { name: '히알루론산 주사 2mL 주문함' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(names()[0]).toBe('히알루론산 주사 2mL')
    expect(rowOf('히알루론산 주사 2mL').children[0]!.textContent).toBe('주문하세요')
    expect(within(headChips()).getByText('주문하세요 2')).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('AC-7511.2: 저장을 기다리는 동안 그 단추는 aria-busy이고 다시 눌러도 한 번만 보낸다', async () => {
    let finish: (value: 'ok') => void = () => {}
    order.mockReturnValue(new Promise((r) => (finish = r)))
    const user = userEvent.setup()
    await shown()
    const button = within(rowOf('히알루론산 주사 2mL')).getByRole('button', { name: '히알루론산 주사 2mL 주문함' })
    await user.click(button)
    expect(button.getAttribute('aria-busy')).toBe('true')
    await user.click(button)
    expect(order).toHaveBeenCalledTimes(1)
    await act(async () => finish('ok'))
    expect(rowOf('히알루론산 주사 2mL').children[0]!.textContent).toBe('주문함 11/21')
  })
})
