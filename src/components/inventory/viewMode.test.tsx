// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { lastCountDay, listCountLines, listReceiptLines, listReceipts, loadInventory, saveCount, saveOrder, setOrdered, updateItem } from '@/lib/storage/inventory'
import type { InvCategory, InvItem, InvReceipt } from '@/types/inventory'
import { downloadTemplate } from './ExcelImport'
import { InventoryScreen } from './InventoryScreen'

// 다른 의원 보기 — 재고 읽기만 (specs/admin-view TASK-10 · REQ-8010 AC-8010.3, design.md '탭마다 읽기만' 재고 줄).
// 화면 부품은 진짜를 그리고 저장소만 흉내 낸다(Supabase에 닿지 않음). 보는 중(ViewingProvider viewing=가짜)과 아닐 때(viewing=null)를 견준다.
// 물품·거래처·숫자는 지어낸 예시다
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/storage/inventory', () => ({
  loadInventory: vi.fn(),
  lastCountDay: vi.fn(),
  listCountLines: vi.fn(),
  listReceiptLines: vi.fn(),
  listReceipts: vi.fn(),
  listAliases: vi.fn(),
  readPhoto: vi.fn(),
  saveCount: vi.fn(),
  saveOrder: vi.fn(),
  setOrdered: vi.fn(),
  updateItem: vi.fn(),
  addItem: vi.fn(),
  addBitItems: vi.fn(),
  listBitCodeMonths: vi.fn(),
  importItems: vi.fn(),
  addCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  saveCategoryOrder: vi.fn(),
  deleteAlias: vi.fn(),
}))
vi.mock('./ExcelImport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ExcelImport')>()),
  downloadTemplate: vi.fn(async () => true),
}))
vi.mock('@/components/clinic/useClinicProfile', () => ({
  useClinicProfile: () => ({ state: 'ready', name: '가짜정형외과의원', logoDataUrl: null, reload: () => undefined }),
}))
const nav = vi.hoisted(() => ({ search: '', push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}))

const VIEW: Viewing = { hospitalId: '00000000-0000-4000-8000-0000000000a1', name: '가짜하늘정형외과의원' }
const TODAY = '2026-11-24'

const CATEGORIES: InvCategory[] = [
  { id: 'cat-1', name: '주사·약', sortOrder: 0 },
  { id: 'cat-2', name: '소모품', sortOrder: 1 },
]
function item(over: Partial<InvItem> = {}): InvItem {
  return {
    id: 'item-1',
    categoryId: 'cat-1',
    name: '히알루론산 주사',
    unit: '개',
    minQty: 20,
    qty: 5,
    lastCountQty: 5,
    lastCountedAt: '2026-11-20T01:00:00.000Z',
    expiry: null,
    vendor: '가짜약품',
    unitPrice: 12000,
    bitCode: null,
    sortOrder: 0,
    hidden: false,
    orderedAt: null,
    ...over,
  }
}
const LOW = item()
const ORDERED = item({ id: 'item-2', categoryId: 'cat-2', name: '일회용 장갑 M', unit: '갑', minQty: 10, qty: 2, orderedAt: '2026-11-23T01:00:00.000Z', sortOrder: 1 })
const HIDDEN = item({ id: 'item-3', categoryId: 'cat-2', name: '거즈 대', minQty: null, qty: 30, hidden: true, sortOrder: 2 })
const RECEIPT: InvReceipt = {
  id: 'rc-1',
  day: '2026-11-21',
  vendor: '가짜약품',
  photoPath: '00000000-0000-4000-8000-0000000000a1/rc-1.jpg',
  lines: [{ itemId: 'item-1', day: '2026-11-21', savedAt: '2026-11-21T02:00:00.000Z', qty: 10, unitPrice: 12000, amount: 120000 }],
}

const wrap = (viewing: Viewing | null, node: ReactNode) => <ViewingProvider viewing={viewing}>{node}</ViewingProvider>
const show = (viewing: Viewing | null, tool = 'list') => {
  nav.search = `tool=${tool}`
  return render(wrap(viewing, <InventoryScreen today={TODAY} />))
}
const button = (name: string | RegExp) => screen.queryByRole('button', { name })
/** loadInventory를 부른 인자 모두 */
const loadArgs = () => vi.mocked(loadInventory).mock.calls

beforeEach(() => {
  vi.mocked(loadInventory).mockResolvedValue({ categories: CATEGORIES, items: [LOW, ORDERED, HIDDEN] })
  vi.mocked(lastCountDay).mockResolvedValue('2026-11-20')
  vi.mocked(listCountLines).mockResolvedValue([])
  vi.mocked(listReceiptLines).mockResolvedValue([])
  vi.mocked(listReceipts).mockResolvedValue([RECEIPT])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AC-8010.3: 보는 중 재고 — 목록', () => {
  it('AC-8010.3: 처음 분류 넣기 없이 읽고(loadInventory는 늘 seed: false), 목록·챙길 것은 보이며 쓰기 단추는 없다 — [양식 받기]만 그대로', async () => {
    show(VIEW)
    await screen.findByRole('heading', { name: '물품 목록' })
    await screen.findByText('주문하세요 1')
    expect(screen.getAllByText('히알루론산 주사').length).toBeGreaterThan(0)
    expect(loadArgs().length).toBeGreaterThan(0)
    expect(loadArgs().every((args) => JSON.stringify(args) === JSON.stringify([{ seed: false }]))).toBe(true)
    for (const name of ['물품 더하기', '분류 고치기', '순서 바꾸기', '엑셀 올리기', '비트 코드에서 고르기', '히알루론산 주사 고치기', '히알루론산 주사 주문함', '일회용 장갑 M 주문함 표시 취소']) {
      expect(button(name), name).toBeNull()
    }
    // 숨긴 물품 보기는 읽기라 그대로, 숨긴 물품의 [다시 쓰기]는 없다
    fireEvent.click(screen.getByRole('button', { name: '보기' }))
    expect(screen.getByText('거즈 대')).toBeTruthy()
    expect(button('거즈 대 다시 쓰기')).toBeNull()
    // [양식 받기]는 그대로 — 처음 분류 넣기 없이 읽는다
    fireEvent.click(screen.getByRole('button', { name: '양식 받기' }))
    await waitFor(() => expect(downloadTemplate).toHaveBeenCalledWith({ seed: false }))
    for (const write of [saveOrder, setOrdered, updateItem]) expect(write).not.toHaveBeenCalled()
  })

  it('AC-8010.3: 물품이 하나도 없는 의원이어도 분류를 넣지 않고(seed: false) 빈 상태의 쓰기 단추가 없다 — [양식 받기]는 그대로', async () => {
    vi.mocked(loadInventory).mockResolvedValue({ categories: [], items: [] })
    show(VIEW)
    await screen.findByRole('heading', { name: '아직 물품이 없어요' })
    expect(loadArgs().every((args) => JSON.stringify(args) === JSON.stringify([{ seed: false }]))).toBe(true)
    expect(screen.getByRole('button', { name: '양식 받기' })).toBeTruthy()
    for (const name of ['엑셀 올리기', '물품 더하기', '비트 코드에서 고르기', '분류 고치기']) expect(button(name), name).toBeNull()
  })

  it('AC-8010.3: 보는 중이 아니면(viewing=null) 지금과 같다 — 처음 분류 넣기를 하는 읽기(인자 없음)와 쓰기 단추가 있다', async () => {
    show(null)
    await screen.findByRole('heading', { name: '물품 목록' })
    await screen.findByText('주문하세요 1')
    // 목록 도구는 지금처럼 인자 없이(처음 분류 넣기 포함), 챙길 것만 seed: false
    expect(loadArgs()).toContainEqual([])
    for (const name of ['물품 더하기', '분류 고치기', '순서 바꾸기', '엑셀 올리기', '비트 코드에서 고르기', '양식 받기', '히알루론산 주사 고치기', '히알루론산 주사 주문함']) {
      expect(button(name), name).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: '양식 받기' }))
    await waitFor(() => expect(downloadTemplate).toHaveBeenCalledWith())
  })
})

describe('AC-8010.3: 보는 중 재고 — 세기 · 들어온 기록 · 달별', () => {
  it('AC-8010.3: 세기 — 표는 보이고 칸은 읽기만, [저장]·[입고 적기]가 없고 saveCount를 부르지 않는다. [세기 종이 인쇄]는 그대로', async () => {
    show(VIEW, 'count')
    await screen.findByRole('heading', { name: '수량 세기' })
    expect(loadArgs().every((args) => JSON.stringify(args) === JSON.stringify([{ seed: false }]))).toBe(true)
    const qty = screen.getByRole('textbox', { name: '히알루론산 주사 센 수량' }) as HTMLInputElement
    expect(qty.readOnly).toBe(true)
    const day = screen.getByLabelText('센 날') as HTMLInputElement
    expect(day.readOnly).toBe(true)
    const expiry = screen.getByLabelText('히알루론산 주사 가장 빠른 유통기한') as HTMLInputElement
    expect(expiry.readOnly).toBe(true)
    expect(button('저장')).toBeNull()
    expect(button('다시 저장')).toBeNull()
    expect(button('입고 적기')).toBeNull()
    expect(screen.getByRole('button', { name: '세기 종이 인쇄' })).toBeTruthy()
    expect(saveCount).not.toHaveBeenCalled()
  })

  it('AC-8010.3: 들어온 기록 — 기록·[사진 보기]는 보이고 [사진 없이 적기]·[사진 올리기]·[고치기]가 없다', async () => {
    show(VIEW, 'in')
    await screen.findByRole('heading', { name: '들어온 기록' })
    const table = await screen.findByRole('table')
    expect(within(table).getByText('가짜약품')).toBeTruthy()
    expect(within(table).getByRole('button', { name: '사진 보기' })).toBeTruthy()
    expect(loadArgs().every((args) => JSON.stringify(args) === JSON.stringify([{ seed: false }]))).toBe(true)
    for (const name of ['사진 없이 적기', '사진 올리기', '고치기']) expect(button(name), name).toBeNull()
  })

  it('AC-8010.3: 달별 — 처음 분류 넣기 없이(seed: false) 읽는다', async () => {
    show(VIEW, 'month')
    await waitFor(() => expect(loadInventory).toHaveBeenCalled())
    expect(loadArgs().every((args) => JSON.stringify(args) === JSON.stringify([{ seed: false }]))).toBe(true)
  })

  it('AC-8010.3: 보는 중이 아니면(viewing=null) 세기 [저장]·들어온 기록 쓰기 단추가 지금처럼 있다', async () => {
    show(null, 'count')
    await screen.findByRole('heading', { name: '수량 세기' })
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '히알루론산 주사 센 수량' }) as HTMLInputElement).readOnly).toBe(false)
    cleanup()
    show(null, 'in')
    await screen.findByRole('table')
    for (const name of ['사진 없이 적기', '사진 올리기', '고치기']) expect(button(name), name).toBeTruthy()
  })
})
