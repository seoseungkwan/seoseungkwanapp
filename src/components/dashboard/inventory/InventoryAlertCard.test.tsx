// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadInventory } from '@/lib/storage/inventory'
import type { InvCategory, InvInventory, InvItem } from '@/types/inventory'
import { InventoryAlertCard } from './InventoryAlertCard'

// 대시보드 재고 칸 (spec inventory REQ-7511 AC-7511.3, design.md 6절 TASK-13·8절, 시안 docs/mockups/inventory ?s=dash · notes.md '대시보드 칸').
// 저장 모듈은 가짜(loadInventory). 두 모양: children(보고 문장)이 있으면 12칸 왼쪽 1~7 children · 오른쪽 9~12 재고 칸, 없으면 재고 칸만(맨 위 자리).
// 알림 0개·물품 없음·읽는 중·읽기 실패면 재고 칸을 그리지 않는다(children만). 대시보드에서는 처음 분류를 넣지 않는다(seed: false)

vi.mock('@/lib/storage/inventory', () => ({
  loadInventory: vi.fn(),
  setOrdered: vi.fn(),
}))

const TODAY = '2026-11-21'
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
const HYAL = item({ id: 'a', name: '히알루론산 주사 2mL', qty: 4, minQty: 10, sortOrder: 0 })
const LIDO = item({ id: 'b', name: '리도카인 주사 2% 20mL', unit: '병', qty: 26, minQty: 10, expiry: '2026-12-05', sortOrder: 1 })
const SYRINGE = item({ id: 'c', categoryId: 'c2', name: '주사기 3cc', qty: 40, minQty: 100, sortOrder: 0, orderedAt: '2026-11-20T02:00:00.000Z' })
const SWAB = item({ id: 'd', categoryId: 'c2', name: '알코올 솜', unit: '통', qty: 3, minQty: 4, sortOrder: 1 })
const GEL = item({ id: 'e', categoryId: 'c2', name: '초음파 젤', unit: '통', qty: 5, minQty: 3, expiry: '2026-11-18', sortOrder: 2 })
const GAUZE = item({ id: 'f', categoryId: 'c2', name: '멸균 거즈', unit: '봉', qty: 22, minQty: 10, expiry: TODAY, sortOrder: 3 })
const HIDDEN = item({ id: 'g', categoryId: 'c2', name: '주사기 5cc', qty: 0, minQty: 100, sortOrder: 4, hidden: true })
const FINE = item({ id: 'h', categoryId: 'c2', name: '전기치료 패드', qty: 60, minQty: 40, sortOrder: 5 })
// 목록 차례가 아닌 차례로 준다 → 칸은 sortItems 차례로 고른다
const ITEMS = [GAUZE, SWAB, HIDDEN, SYRINGE, LIDO, FINE, GEL, HYAL]
const loaded = (items: InvItem[] = ITEMS): InvInventory => ({ categories: CATS, items })

const load = vi.mocked(loadInventory)

const card = () => screen.getByRole('region', { name: '재고' })
const lines = () => within(card()).getAllByRole('listitem')
const lineText = () => lines().map((li) => [li.children[0]!.textContent, li.children[1]!.textContent])
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
const hasAll = (el: Element, classes: string) => {
  for (const c of classes.split(' ')) expect(classesOf(el), c).toContain(c)
}
const Sentence = () => <p data-testid="sentence">원장님 보고 문장</p>

// 읽기가 끝날 때까지 기다린다(그리지 않는 모양도 읽기는 끝나야 한다)
async function settled() {
  await vi.waitFor(() => expect(load).toHaveBeenCalled())
  await act(async () => {})
}

beforeEach(() => {
  load.mockReset().mockResolvedValue(loaded())
})
afterEach(cleanup)

describe('AC-7511.3: 대시보드 재고 칸 — 글자·숫자·줄', () => {
  it('AC-7511.3: h2 "재고" + [재고 탭에서 보기 →](/inventory)', async () => {
    render(<InventoryAlertCard today={TODAY} />)
    await screen.findByRole('region', { name: '재고' })
    expect(within(card()).getByRole('heading', { level: 2, name: '재고' })).toBeTruthy()
    const link = within(card()).getByRole('link', { name: '재고 탭에서 보기' })
    expect(link.getAttribute('href')).toBe('/inventory')
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-7511.3: 숫자 두 칸 "주문하세요 n개"·"기한 가까움 n개"(주문함·숨긴 물품은 세지 않음)', async () => {
    render(<InventoryAlertCard today={TODAY} />)
    await screen.findByRole('region', { name: '재고' })
    const low = within(card()).getByText('주문하세요').parentElement!
    const soon = within(card()).getByText('기한 가까움').parentElement!
    expect(low.textContent).toBe('주문하세요2개')
    expect(soon.textContent).toBe('기한 가까움3개')
  })

  it('AC-7511.3: 물품 4줄까지(주문함이 아닌 줄, 챙길 것 차례: 주문하세요 "남은 a단위", 기한 "n일 남음·오늘까지·n일 지났어요") + "외 n개"', async () => {
    render(<InventoryAlertCard today={TODAY} />)
    await screen.findByRole('region', { name: '재고' })
    expect(lineText()).toEqual([
      ['히알루론산 주사 2mL', '남은 4개'],
      ['알코올 솜', '남은 3통'],
      ['리도카인 주사 2% 20mL', '14일 남음'],
      ['초음파 젤', '3일 지났어요'],
    ])
    expect(within(card()).getByText('외 1개')).toBeTruthy()
    expect(card().textContent).not.toContain('주사기 3cc')
  })

  it('AC-7511.3: 오늘까지인 기한은 "오늘까지", 4줄 이하면 "외 n개"가 없다, 수량은 쉼표로 끊는다', async () => {
    load.mockResolvedValue(loaded([GAUZE, item({ id: 'x', name: '일회용 장갑 M', unit: '갑', qty: 1200, minQty: 1500, sortOrder: 9 }), SYRINGE]))
    render(<InventoryAlertCard today={TODAY} />)
    await screen.findByRole('region', { name: '재고' })
    expect(lineText()).toEqual([
      ['일회용 장갑 M', '남은 1,200갑'],
      ['멸균 거즈', '오늘까지'],
    ])
    expect(within(card()).queryByText(/^외 \d+개$/)).toBeNull()
  })

  it('AC-7511.3: 대시보드 칸에는 단추가 없다([주문함]은 재고 탭에서만)', async () => {
    render(<InventoryAlertCard today={TODAY} />)
    await screen.findByRole('region', { name: '재고' })
    expect(within(card()).queryAllByRole('button')).toEqual([])
  })

  it('AC-7511.3: 읽을 때 처음 분류 넷을 넣지 않는다(loadInventory({ seed: false }) 한 번)', async () => {
    render(<InventoryAlertCard today={TODAY} />)
    await screen.findByRole('region', { name: '재고' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith({ seed: false })
  })
})

describe('AC-7511.3: 두 모양 — children 있음·없음', () => {
  it('AC-7511.3: children이 있고 알림이 있으면 12칸 그리드 왼쪽 1~7 children · 오른쪽 9~12 재고 칸', async () => {
    render(
      <InventoryAlertCard today={TODAY}>
        <Sentence />
      </InventoryAlertCard>,
    )
    await screen.findByRole('region', { name: '재고' })
    const left = screen.getByTestId('sentence').parentElement!
    const right = card().parentElement!
    const grid = left.parentElement!
    expect(right.parentElement).toBe(grid)
    expect([...grid.children]).toEqual([left, right])
    hasAll(grid, 'lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6')
    hasAll(left, 'min-w-0 lg:col-span-7')
    hasAll(right, 'lg:col-span-4 lg:col-start-9')
  })

  it('AC-7511.3: children이 없으면 재고 칸만(대시보드 맨 위 자리, 아래 여백)', async () => {
    const { container } = render(<InventoryAlertCard today={TODAY} />)
    await screen.findByRole('region', { name: '재고' })
    expect(container.children).toHaveLength(1)
    const top = container.firstElementChild!
    expect(top.contains(card())).toBe(true)
    hasAll(top, 'mb-12 max-md:mb-8')
  })

  it.each([
    ['알림 0개', () => load.mockResolvedValue(loaded([FINE, HIDDEN, SYRINGE]))],
    ['물품 없음', () => load.mockResolvedValue(loaded([]))],
    ['읽기 실패', () => load.mockResolvedValue('failed')],
  ])('AC-7511.3: %s면 재고 칸을 그리지 않는다 — children은 감싸지 않고 그대로, 없으면 아무것도 없음', async (_, arrange) => {
    arrange()
    const withChildren = render(
      <InventoryAlertCard today={TODAY}>
        <Sentence />
      </InventoryAlertCard>,
    )
    await settled()
    expect(screen.queryByRole('region', { name: '재고' })).toBeNull()
    expect([...withChildren.container.children]).toEqual([screen.getByTestId('sentence')])
    withChildren.unmount()

    const alone = render(<InventoryAlertCard today={TODAY} />)
    await settled()
    expect(alone.container.innerHTML).toBe('')
  })

  it('AC-7511.3: 읽는 동안은 재고 칸 없이 children만, 읽기가 끝나면 재고 칸이 붙는다', async () => {
    let resolve: (value: InvInventory) => void = () => {}
    load.mockReturnValue(new Promise((r) => (resolve = r)))
    const { container } = render(
      <InventoryAlertCard today={TODAY}>
        <Sentence />
      </InventoryAlertCard>,
    )
    expect(screen.queryByRole('region', { name: '재고' })).toBeNull()
    expect([...container.children]).toEqual([screen.getByTestId('sentence')])
    await act(async () => resolve(loaded()))
    expect(screen.getByRole('region', { name: '재고' })).toBeTruthy()
    expect(screen.getByTestId('sentence')).toBeTruthy()
  })

  it('AC-7511.3: 읽기가 끝나기 전에 사라지면 그 답으로 그리지 않는다', async () => {
    let resolve: (value: InvInventory) => void = () => {}
    load.mockReturnValue(new Promise((r) => (resolve = r)))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = render(<InventoryAlertCard today={TODAY} />)
    view.unmount()
    await act(async () => resolve(loaded()))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
