// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import {
  addCategory,
  addItem,
  deleteAlias,
  deleteCategory,
  lastCountDay,
  listAliases,
  loadInventory,
  renameCategory,
  saveCategoryOrder,
  saveOrder,
  updateItem,
} from '@/lib/storage/inventory'
import type { InvCategory, InvInventory, InvItem } from '@/types/inventory'
import { ItemsTool } from './ItemsTool'

// 재고 목록 도구 (spec inventory REQ-7506 AC-7506.1·7506.2·7506.4·7506.5·7506.6, REQ-7514 AC-7514.5, design.md 6절, 시안 ?s=list·order·empty).
// 저장 모듈은 가짜다(Supabase에 닿지 않는다). 챙길 것·엑셀·비트 코드 고르기는 props로만 받는다. 물품·숫자는 지어낸 예시
vi.mock('@/lib/storage/inventory', () => ({
  loadInventory: vi.fn(),
  lastCountDay: vi.fn(),
  saveOrder: vi.fn(),
  updateItem: vi.fn(),
  addItem: vi.fn(),
  listAliases: vi.fn(),
  deleteAlias: vi.fn(),
  addCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  saveCategoryOrder: vi.fn(),
}))

const load = vi.mocked(loadInventory)
const lastDay = vi.mocked(lastCountDay)
const order = vi.mocked(saveOrder)
const update = vi.mocked(updateItem)

const TODAY = '2026-11-21'
const CATS: InvCategory[] = [
  { id: 'c-med', name: '약품', sortOrder: 0 },
  { id: 'c-sup', name: '치료 소모품', sortOrder: 1 },
  { id: 'c-ort', name: '보조기·깁스', sortOrder: 2 },
  { id: 'c-off', name: '사무·생활', sortOrder: 3 },
]
type Need = Pick<InvItem, 'id' | 'categoryId' | 'name' | 'sortOrder'>
const make = (over: Need & Partial<InvItem>): InvItem => ({
  unit: '개',
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
})
const ITEMS: InvItem[] = [
  make({ id: 'i-ha', categoryId: 'c-med', name: '히알루론산 주사 2mL', sortOrder: 0, qty: 4, minQty: 10, expiry: '2027-03-31', vendor: '한빛약품', unitPrice: 18500 }),
  make({ id: 'i-lido', categoryId: 'c-med', name: '리도카인 주사 2% 20mL', unit: '병', sortOrder: 1, qty: 26, minQty: 10, expiry: '2026-12-05', vendor: '한빛약품', unitPrice: 1400 }),
  // 주문함: 한국 11월 20일 01:30(UTC로는 19일)
  make({ id: 'i-syr3', categoryId: 'c-sup', name: '주사기 3cc', sortOrder: 2, qty: 40, minQty: 100, vendor: '메디팜', unitPrice: 95, orderedAt: '2026-11-19T16:30:00.000Z' }),
  make({ id: 'i-syr5', categoryId: 'c-sup', name: '주사기 5cc', sortOrder: 3, hidden: true, minQty: 50, vendor: '메디팜', unitPrice: 110 }),
  make({ id: 'i-gel', categoryId: 'c-sup', name: '초음파 젤', unit: '통', sortOrder: 4, qty: 5, minQty: 3, expiry: '2026-11-18', vendor: '메디팜', unitPrice: 6800 }),
  make({ id: 'i-gauze', categoryId: 'c-sup', name: '멸균 거즈', unit: '봉', sortOrder: 5, qty: 22, minQty: 10, expiry: '2028-02-28', vendor: '메디팜', unitPrice: 2800 }),
  make({ id: 'i-knee', categoryId: 'c-ort', name: '무릎 보조기 L', sortOrder: 6, qty: -2 }),
]
const DATA: InvInventory = { categories: CATS, items: ITEMS }

beforeEach(() => {
  load.mockResolvedValue(DATA)
  lastDay.mockResolvedValue('2026-11-14')
  order.mockResolvedValue('ok')
  update.mockResolvedValue('ok')
  vi.mocked(addItem).mockResolvedValue({ id: 'i-new' })
  vi.mocked(listAliases).mockResolvedValue([])
  vi.mocked(deleteAlias).mockResolvedValue('ok')
  vi.mocked(addCategory).mockResolvedValue({ id: 'c-new', name: '새 분류', sortOrder: 4 })
  vi.mocked(renameCategory).mockResolvedValue('ok')
  vi.mocked(deleteCategory).mockResolvedValue('ok')
  vi.mocked(saveCategoryOrder).mockResolvedValue('ok')
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  Reflect.deleteProperty(document, 'elementFromPoint')
})

type Props = Partial<Parameters<typeof ItemsTool>[0]>
async function open(props: Props = {}) {
  const handlers = { onChanged: vi.fn(), onTemplate: vi.fn(), onUpload: vi.fn(), onBitPick: vi.fn() }
  const view = render(<ItemsTool today={TODAY} alerts={<div data-testid="alerts">챙길 것 자리</div>} {...handlers} {...props} />)
  await screen.findByRole('heading', { name: /물품 목록|순서 바꾸기|아직 물품이 없어요/ })
  return { ...view, ...handlers, user: userEvent.setup() }
}

const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const hasClasses = (el: Element, classes: string) => expect(tokens(el)).toEqual(expect.arrayContaining(classes.split(/\s+/)))
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const rowIds = () => [...document.querySelectorAll('tr[data-item]')].map((tr) => tr.getAttribute('data-item'))
const rowOf = (name: string) => {
  const tr = screen.getByText(name).closest('tr')
  if (tr === null) throw new Error(`${name} 줄 없음`)
  return tr
}
const cells = (name: string) => within(rowOf(name)).getAllByRole('cell').map((td) => td.textContent)
const headerButtons = () =>
  within(screen.getByRole('heading', { name: '물품 목록' }).closest('[data-head]') as HTMLElement)
    .getAllByRole('button')
    .map((b) => b.textContent)

describe('AC-7506.1 목록: 챙길 것 자리 · 머리 줄 단추 · 분류별 표 · 숨긴 물품 줄 (시안 ?s=list)', () => {
  it('AC-7506.1: 받은 alerts 부품이 목록 머리보다 위에 있고, 머리 글은 숨기지 않은 물품 수·마지막 세기 날짜다', async () => {
    await open()
    const alerts = screen.getByTestId('alerts')
    const head = screen.getByRole('heading', { name: '물품 목록' })
    expect(alerts.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('6개 · 마지막 세기 11월 14일(토) · 지금 수량 = 마지막 세기 + 그 뒤 들어온 것')).toBeTruthy()
    expect(load).toHaveBeenCalledWith()
  })

  it('AC-7506.1·AC-7514.5: 머리 줄 단추는 [양식 받기]·[엑셀 올리기]·[분류 고치기]·[순서 바꾸기]·[비트 코드에서 고르기]·[물품 더하기](주 단추) 차례다', async () => {
    await open()
    expect(headerButtons()).toEqual(['양식 받기', '엑셀 올리기', '분류 고치기', '순서 바꾸기', '비트 코드에서 고르기', '물품 더하기'])
    hasClasses(button('물품 더하기'), ds.button.primary)
    hasClasses(button('양식 받기'), ds.button.secondary)
    expect(screen.getByText('[양식 받기] = 지금 목록이 채워진 양식(엑셀)이에요. 고쳐서 [엑셀 올리기]로 넣으면 바뀐 줄만 고쳐져요.')).toBeTruthy()
  })

  it('AC-7506.1: 표 머리 칸과 분류별 묶음(물품이 있는 분류만, 분류 차례, "n개")', async () => {
    await open()
    const table = screen.getByRole('table')
    const heads = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['물품 이름', '지금 수량', '최소 수량', '가장 빠른 유통기한', '거래처', '단가', '상태', '고치기'])
    const groups = within(table).getAllByRole('rowheader').map((th) => th.textContent)
    expect(groups).toEqual(['약품2개', '치료 소모품3개', '보조기·깁스1개'])
    expect(rowIds()).toEqual(['i-ha', 'i-lido', 'i-syr3', 'i-gel', 'i-gauze', 'i-knee'])
  })

  it('AC-7506.1: 줄 칸 — 이름·지금 수량+단위·최소 수량·유통기한·거래처·단가·상태 칩·[고치기], 빈 값은 "–"', async () => {
    await open()
    expect(cells('히알루론산 주사 2mL')).toEqual(['히알루론산 주사 2mL', '4개', '10', '2027-03-31', '한빛약품', '18,500원', '주문하세요', '고치기'])
    expect(cells('리도카인 주사 2% 20mL')).toEqual(['리도카인 주사 2% 20mL', '26병', '10', '2026-12-05', '한빛약품', '1,400원', '기한 가까움', '고치기'])
    expect(cells('주사기 3cc')).toEqual(['주사기 3cc', '40개', '100', '–', '메디팜', '95원', '주문함 11/20', '고치기'])
    expect(cells('초음파 젤')).toEqual(['초음파 젤', '5통', '3', '2026-11-18', '메디팜', '6,800원', '기한 지남', '고치기'])
    expect(cells('멸균 거즈')).toEqual(['멸균 거즈', '22봉', '10', '2028-02-28', '메디팜', '2,800원', '', '고치기'])
    expect(cells('무릎 보조기 L')).toEqual(['무릎 보조기 L', '−2개', '–', '–', '–', '–', '', '고치기'])
    expect(within(rowOf('무릎 보조기 L')).getByRole('button', { name: '무릎 보조기 L 고치기' })).toBeTruthy()
  })

  it('AC-7506.1: 칩 색 — 주문하세요·기한 가까움·기한 지남은 warning, 주문함은 neutral, 음수 수량은 위험 색', async () => {
    await open()
    hasClasses(within(rowOf('히알루론산 주사 2mL')).getByText('주문하세요'), ds.chip.warning)
    hasClasses(within(rowOf('리도카인 주사 2% 20mL')).getByText('기한 가까움'), ds.chip.warning)
    hasClasses(within(rowOf('초음파 젤')).getByText('기한 지남'), ds.chip.warning)
    hasClasses(within(rowOf('주사기 3cc')).getByText('주문함 11/20'), ds.chip.neutral)
    expect(tokens(within(rowOf('무릎 보조기 L')).getByText('−2'))).toContain('text-negative')
    expect(tokens(within(rowOf('멸균 거즈')).getByText('22'))).not.toContain('text-negative')
  })

  it('AC-7506.1: 표 모양은 시안 그대로 — 분류 머리 줄은 흰 바탕(첫 묶음 32px), 물품 이름 500, 마지막 줄 아래 선, 양식 안내는 오른쪽, 숨긴 물품 줄은 흐린 글·20px 들임', async () => {
    await open()
    const groups = within(screen.getByRole('table')).getAllByRole('rowheader')
    expect(tokens(groups[0])).not.toContain('bg-canvas')
    hasClasses(groups[0], 'h-8 border-b border-line')
    hasClasses(groups[1], 'h-11 pt-3')
    hasClasses(within(rowOf('히알루론산 주사 2mL')).getAllByRole('cell')[0], 'font-medium')
    const last = rowOf('무릎 보조기 L')
    expect(tokens(last)).not.toContain('last:*:border-b-0')
    hasClasses(within(last).getAllByRole('cell')[0], 'border-b border-line')
    hasClasses(screen.getByText(/^\[양식 받기\] = /), 'text-right')
    hasClasses(screen.getByText('안 쓰는 물품 1개는 숨겨 뒀어요.', { exact: false }), 'text-muted pl-5')
  })

  it('AC-7506.1: 숨긴 물품이 있으면 "안 쓰는 물품 n개는 숨겨 뒀어요." [보기] → 흐린 줄 · "안 씀" 칩 · [다시 쓰기]', async () => {
    const { user } = await open()
    expect(screen.getByText('안 쓰는 물품 1개는 숨겨 뒀어요.')).toBeTruthy()
    expect(screen.queryByText('주사기 5cc')).toBeNull()
    await user.click(button('보기'))
    expect(rowIds()).toEqual(['i-ha', 'i-lido', 'i-syr3', 'i-syr5', 'i-gel', 'i-gauze', 'i-knee'])
    expect(cells('주사기 5cc')).toEqual(['주사기 5cc', '0개', '50', '–', '메디팜', '110원', '안 씀', '다시 쓰기'])
    hasClasses(within(rowOf('주사기 5cc')).getByText('안 씀'), ds.chip.neutral)
    expect(tokens(rowOf('주사기 5cc'))).toContain('opacity-60')
    expect(screen.getByText('안 쓰는 물품 1개도 흐리게 보여요.')).toBeTruthy()
    await user.click(button('숨기기'))
    expect(screen.queryByText('주사기 5cc')).toBeNull()
  })

  it('AC-7506.1: [다시 쓰기]는 그 물품의 hidden만 끄고, 저장하면 다시 읽고 onChanged를 부른다', async () => {
    const { user, onChanged } = await open()
    await user.click(button('보기'))
    load.mockResolvedValue({ categories: CATS, items: ITEMS.map((it) => (it.id === 'i-syr5' ? { ...it, hidden: false } : it)) })
    await user.click(button('주사기 5cc 다시 쓰기'))
    expect(update).toHaveBeenCalledWith('i-syr5', { hidden: false })
    await waitFor(() => expect(screen.queryByText('안 쓰는 물품 1개도 흐리게 보여요.')).toBeNull())
    expect(load).toHaveBeenCalledTimes(2)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('AC-7506.1: [다시 쓰기] 저장이 실패하면 오류 카드(E-INV-SAVE-FAILED)이고 onChanged는 부르지 않는다', async () => {
    const { user, onChanged } = await open()
    await user.click(button('보기'))
    update.mockResolvedValue('failed')
    await user.click(button('주사기 5cc 다시 쓰기'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('AC-7506.1: [양식 받기]·[비트 코드에서 고르기]는 받은 함수를 부르고, [엑셀 올리기]는 파일 고르기를 열어 고른 파일을 onUpload로 넘긴다', async () => {
    const { user, onTemplate, onBitPick, onUpload, container } = await open()
    await user.click(button('양식 받기'))
    expect(onTemplate).toHaveBeenCalledTimes(1)
    await user.click(button('비트 코드에서 고르기'))
    expect(onBitPick).toHaveBeenCalledTimes(1)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toContain('.xlsx')
    const pick = vi.spyOn(input, 'click')
    await user.click(button('엑셀 올리기'))
    expect(pick).toHaveBeenCalledTimes(1)
    const file = new File([new Uint8Array([0x50, 0x4b])], '재고.xlsx')
    await user.upload(input, file)
    expect(onUpload).toHaveBeenCalledWith(file)
  })

  it('AC-7506.1: reloadKey가 바뀌면 다시 읽는다', async () => {
    const { rerender } = await open({ reloadKey: 0 })
    expect(load).toHaveBeenCalledTimes(1)
    rerender(<ItemsTool today={TODAY} reloadKey={1} />)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })

  it('AC-7506.1: 읽기 실패면 오류 카드(E-INV-READ-FAILED)와 [다시 읽기]이고, 누르면 다시 읽는다', async () => {
    load.mockResolvedValueOnce('failed')
    render(<ItemsTool today={TODAY} />)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-READ-FAILED')
    await userEvent.setup().click(button('다시 읽기'))
    expect(await screen.findByRole('heading', { name: '물품 목록' })).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('AC-7506.1: 마지막 세기가 없거나 못 읽으면 머리 글에서 그 토막만 뺀다', async () => {
    lastDay.mockResolvedValue(null)
    await open()
    expect(screen.getByText('6개 · 지금 수량 = 마지막 세기 + 그 뒤 들어온 것')).toBeTruthy()
  })
})

describe('AC-7506.2 [물품 더하기]·[고치기]는 오른쪽 판을 연다', () => {
  it('AC-7506.2: [물품 더하기] → "물품 더하기" 판, [고치기] → 그 물품 값이 든 "물품 고치기" 판', async () => {
    const { user } = await open()
    await user.click(button('물품 더하기'))
    expect(screen.getByRole('dialog', { name: '물품 더하기' })).toBeTruthy()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(button('히알루론산 주사 2mL 고치기'))
    const dialog = screen.getByRole('dialog', { name: '물품 고치기' })
    expect((within(dialog).getByRole('textbox', { name: '물품 이름 필수' }) as HTMLInputElement).value).toBe('히알루론산 주사 2mL')
  })

  it('AC-7506.2: 판에서 저장하면 판을 닫고 다시 읽고 onChanged를 부른다', async () => {
    const { user, onChanged } = await open()
    await user.click(button('물품 더하기'))
    const dialog = screen.getByRole('dialog', { name: '물품 더하기' })
    await user.type(within(dialog).getByRole('textbox', { name: '물품 이름 필수' }), '테이핑 테이프 5cm')
    await user.type(within(dialog).getByRole('textbox', { name: '단위 필수' }), '개')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(vi.mocked(addItem)).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  const COUNT_FAILED = '물품은 더했어요. 처음 수량은 [세기]에서 적어 주세요.'
  async function addWithCountFailed(user: ReturnType<typeof userEvent.setup>) {
    vi.mocked(addItem).mockResolvedValue({ id: 'i-new', countFailed: true })
    await user.click(button('물품 더하기'))
    const dialog = screen.getByRole('dialog', { name: '물품 더하기' })
    await user.type(within(dialog).getByRole('textbox', { name: '물품 이름 필수' }), '핫팩')
    await user.type(within(dialog).getByRole('textbox', { name: '단위 필수' }), '개')
    await user.type(within(dialog).getByRole('textbox', { name: '지금 수량 선택' }), '12')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }

  it('AC-7506.2: 물품은 들어가고 처음 수량만 실패하면(countFailed) 판을 닫고 다시 읽고, 목록 위에 알림 줄(role="status")을 보인다', async () => {
    const { user, onChanged } = await open()
    await addWithCountFailed(user)
    const notice = await screen.findByRole('status')
    expect(notice.textContent).toBe(COUNT_FAILED)
    hasClasses(notice, 'text-small text-ink-2')
    expect(notice.compareDocumentPosition(screen.getByRole('table')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('heading', { name: '물품 목록' }).compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7506.2: 처음 수량 실패 알림은 다른 판을 열면 사라진다', async () => {
    const { user } = await open()
    await addWithCountFailed(user)
    expect(await screen.findByText(COUNT_FAILED)).toBeTruthy()
    await user.click(button('분류 고치기'))
    expect(screen.queryByText(COUNT_FAILED)).toBeNull()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
    expect(screen.queryByText(COUNT_FAILED)).toBeNull()
  })

  it('AC-7506.2: 처음 수량 실패 알림은 다른 저장(다시 쓰기)을 하면 사라진다', async () => {
    const { user } = await open()
    await addWithCountFailed(user)
    expect(await screen.findByText(COUNT_FAILED)).toBeTruthy()
    await user.click(button('보기'))
    await user.click(button('주사기 5cc 다시 쓰기'))
    await waitFor(() => expect(update).toHaveBeenCalledWith('i-syr5', { hidden: false }))
    expect(screen.queryByText(COUNT_FAILED)).toBeNull()
  })

  it('AC-7506.3: [분류 고치기] → "분류 고치기" 판, 아무것도 안 바꾸고 [취소]면 다시 읽지 않는다', async () => {
    const { user, onChanged } = await open()
    await user.click(button('분류 고치기'))
    expect(screen.getByRole('dialog', { name: '분류 고치기' })).toBeTruthy()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('AC-7506.4 [순서 바꾸기]: 끌기 손잡이 + ▲▼, 같은 분류 안에서만, [다 됐어요] = set_inventory_order (시안 ?s=order)', () => {
  it('AC-7506.4: 누르면 "순서 바꾸기" 머리·안내·[다 됐어요], 줄 앞 끌기 손잡이와 줄마다 ▲▼, 챙길 것·숨긴 물품 줄·머리 단추는 없다', async () => {
    const { user } = await open()
    await user.click(button('순서 바꾸기'))
    expect(screen.getByRole('heading', { name: '순서 바꾸기' })).toBeTruthy()
    expect(screen.getByText(/를 끌거나 ▲▼로 옮겨요\. 분류 안에서만 옮겨져요\. 분류 차례는 \[분류 고치기\]에서 바꿔요\./)).toBeTruthy()
    hasClasses(button('다 됐어요'), ds.button.primary)
    expect(screen.queryByTestId('alerts')).toBeNull()
    expect(screen.queryByText(/안 쓰는 물품/)).toBeNull()
    expect(screen.queryByRole('button', { name: '물품 더하기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '히알루론산 주사 2mL 고치기' })).toBeNull()
    for (const id of ['i-ha', 'i-lido', 'i-syr3', 'i-gel', 'i-gauze', 'i-knee']) {
      expect(document.querySelector(`tr[data-item="${id}"] [data-grip]`)).not.toBeNull()
    }
    expect(button('히알루론산 주사 2mL 위로').getAttribute('aria-disabled')).toBe('true')
    expect(button('히알루론산 주사 2mL 아래로').getAttribute('aria-disabled')).toBe('false')
    expect(button('리도카인 주사 2% 20mL 아래로').getAttribute('aria-disabled')).toBe('true')
    expect(button('주사기 3cc 위로').getAttribute('aria-disabled')).toBe('true')
    expect(rowIds()).toEqual(['i-ha', 'i-lido', 'i-syr3', 'i-gel', 'i-gauze', 'i-knee'])
  })

  it('AC-7506.4: ▲▼는 같은 분류 안에서 바로 옮기고, 분류 끝에서는 넘어가지 않는다', async () => {
    const { user } = await open()
    await user.click(button('순서 바꾸기'))
    await user.click(button('히알루론산 주사 2mL 아래로'))
    expect(rowIds()).toEqual(['i-lido', 'i-ha', 'i-syr3', 'i-gel', 'i-gauze', 'i-knee'])
    await user.click(button('히알루론산 주사 2mL 아래로'))
    expect(rowIds()).toEqual(['i-lido', 'i-ha', 'i-syr3', 'i-gel', 'i-gauze', 'i-knee'])
    await user.click(button('멸균 거즈 위로'))
    expect(rowIds()).toEqual(['i-lido', 'i-ha', 'i-syr3', 'i-gauze', 'i-gel', 'i-knee'])
    expect(order).not.toHaveBeenCalled()
  })

  it('AC-7506.4: 손잡이를 끌어 같은 분류의 다른 줄 위로 가면 바로 그 자리로 옮기고, 다른 분류 줄 위에서는 그대로다', async () => {
    const { user } = await open()
    await user.click(button('순서 바꾸기'))
    let under: Element = rowOf('멸균 거즈')
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => under.querySelector('td:nth-child(2)')) })
    const grip = document.querySelector('tr[data-item="i-syr3"] [data-grip]') as HTMLElement
    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: 120 })
    expect(rowIds()).toEqual(['i-ha', 'i-lido', 'i-gel', 'i-gauze', 'i-syr3', 'i-knee'])
    under = rowOf('무릎 보조기 L')
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: 200 })
    expect(rowIds()).toEqual(['i-ha', 'i-lido', 'i-gel', 'i-gauze', 'i-syr3', 'i-knee'])
    under = rowOf('히알루론산 주사 2mL')
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: 5 })
    expect(rowIds()).toEqual(['i-ha', 'i-lido', 'i-gel', 'i-gauze', 'i-syr3', 'i-knee'])
    fireEvent.pointerUp(document, { pointerId: 1 })
    // 놓은 뒤에는 움직여도 옮기지 않는다
    under = rowOf('초음파 젤')
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: 60 })
    expect(rowIds()).toEqual(['i-ha', 'i-lido', 'i-gel', 'i-gauze', 'i-syr3', 'i-knee'])
  })

  it('AC-7506.4: [다 됐어요]는 숨긴 물품을 제자리에 둔 전체 차례로 saveOrder를 부르고, 목록 모양으로 돌아가 새 차례를 보이고 onChanged를 부른다', async () => {
    const { user, onChanged } = await open()
    await user.click(button('순서 바꾸기'))
    await user.click(button('주사기 3cc 아래로'))
    await user.click(button('주사기 3cc 아래로'))
    await user.click(button('히알루론산 주사 2mL 아래로'))
    await user.click(button('다 됐어요'))
    expect(order).toHaveBeenCalledWith(['i-lido', 'i-ha', 'i-gel', 'i-syr5', 'i-gauze', 'i-syr3', 'i-knee'])
    expect(await screen.findByRole('heading', { name: '물품 목록' })).toBeTruthy()
    expect(rowIds()).toEqual(['i-lido', 'i-ha', 'i-gel', 'i-gauze', 'i-syr3', 'i-knee'])
    expect(onChanged).toHaveBeenCalledTimes(1)
    await user.click(button('보기'))
    expect(rowIds()).toEqual(['i-lido', 'i-ha', 'i-gel', 'i-syr5', 'i-gauze', 'i-syr3', 'i-knee'])
  })

  it('AC-7506.4: 저장이 실패하면 옛 차례로 돌아가고 오류 카드(E-INV-SAVE-FAILED)다', async () => {
    order.mockResolvedValue('failed')
    const { user, onChanged } = await open()
    await user.click(button('순서 바꾸기'))
    await user.click(button('히알루론산 주사 2mL 아래로'))
    await user.click(button('다 됐어요'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(screen.getByRole('heading', { name: '물품 목록' })).toBeTruthy()
    expect(rowIds()).toEqual(['i-ha', 'i-lido', 'i-syr3', 'i-gel', 'i-gauze', 'i-knee'])
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('AC-7506.4: 차례를 안 바꾸고 [다 됐어요]면 보내지 않고 목록으로 돌아간다', async () => {
    const { user } = await open()
    await user.click(button('순서 바꾸기'))
    await user.click(button('다 됐어요'))
    expect(order).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '물품 목록' })).toBeTruthy()
  })

  it('AC-7506.4: 저장을 기다리는 동안 [다 됐어요]는 aria-busy이고 다시 눌러도 한 번만 보낸다', async () => {
    let finish!: (v: 'ok') => void
    order.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const { user } = await open()
    await user.click(button('순서 바꾸기'))
    await user.click(button('히알루론산 주사 2mL 아래로'))
    await user.click(button('다 됐어요'))
    expect(button('다 됐어요').getAttribute('aria-busy')).toBe('true')
    await user.click(button('다 됐어요'))
    expect(order).toHaveBeenCalledTimes(1)
    await act(async () => finish('ok'))
    expect(await screen.findByRole('heading', { name: '물품 목록' })).toBeTruthy()
  })
})

describe('AC-7506.5 숨긴 물품은 목록에서 빠지고 챙길 것 칩이 없다', () => {
  it('AC-7506.5: 숨긴 물품은 기본으로 표·물품 수에 없고, 보여도 상태 칸은 "안 씀"뿐이다(최소 수량보다 적어도 주문하세요가 아님)', async () => {
    const { user } = await open()
    expect(rowIds()).not.toContain('i-syr5')
    expect(screen.getByText(/^6개 ·/)).toBeTruthy()
    await user.click(button('보기'))
    expect(within(rowOf('주사기 5cc')).queryByText('주문하세요')).toBeNull()
  })
})

describe('AC-7506.6·AC-7514.5 빈 상태 (시안 ?s=empty)', () => {
  beforeEach(() => {
    load.mockResolvedValue({ categories: CATS, items: [] })
    lastDay.mockResolvedValue(null)
  })

  it('AC-7506.6: "아직 물품이 없어요"·세 단계·안내 글·[물품 더하기] 글자 단추·시작 분류 넷과 [분류 고치기]', async () => {
    await open()
    expect(screen.getByRole('heading', { name: '아직 물품이 없어요' })).toBeTruthy()
    expect(screen.getByText('양식 받기 → 채우기 → 엑셀 올리기, 이 차례로 하면 목록이 한 번에 만들어져요.')).toBeTruthy()
    const steps = within(screen.getByRole('list', { name: '물품 넣는 차례' })).getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(within(steps[0]).getByText('1')).toBeTruthy()
    expect(within(steps[0]).getByText("빈 양식(엑셀), 시트 '물품'")).toBeTruthy()
    hasClasses(within(steps[0]).getByRole('button', { name: '양식 받기' }), ds.button.secondary)
    expect(within(steps[1]).getByText('채우기')).toBeTruthy()
    expect(within(steps[1]).getByText('한 줄에 물품 하나: 분류 · 물품 이름 · 단위 · 최소 수량 · 지금 수량 · 가장 빠른 유통기한 · 거래처 · 단가')).toBeTruthy()
    expect(within(steps[1]).queryByRole('button')).toBeNull()
    expect(within(steps[2]).getByText('넣기 전에 미리 보기로 확인해요')).toBeTruthy()
    hasClasses(within(steps[2]).getByRole('button', { name: '엑셀 올리기' }), ds.button.primary)
    expect(screen.getByText('갖고 계신 엑셀도 올릴 수 있어요(AI가 칸을 맞춰요).')).toBeTruthy()
    expect(screen.getByText('물품을 하나씩 더할 수도 있어요.')).toBeTruthy()
    hasClasses(button('물품 더하기'), ds.textButton)
    expect(screen.getByText('분류는 넷으로 시작해요')).toBeTruthy()
    expect(screen.getByText('약품 · 치료 소모품 · 보조기·깁스 · 사무·생활')).toBeTruthy()
    hasClasses(button('분류 고치기'), ds.textButton)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByTestId('alerts')).toBeNull()
  })

  it('AC-7506.6: 빈 상태 모양은 시안 그대로 — 세 단계는 960px까지 위아래 선·단계 사이 선(네 변 상자 아님), 글자 크기·색, 아래 나눔 선 560px', async () => {
    await open()
    hasClasses(screen.getByText('양식 받기 → 채우기 → 엑셀 올리기, 이 차례로 하면 목록이 한 번에 만들어져요.'), 'text-body text-ink-2')
    const steps = screen.getByRole('list', { name: '물품 넣는 차례' })
    hasClasses(steps, 'max-w-240 border-y border-line')
    expect(tokens(steps)).not.toContain('border')
    expect(tokens(steps)).not.toContain('rounded-control')
    const items = within(steps).getAllByRole('listitem')
    hasClasses(items[1], 'border-l border-line')
    hasClasses(within(items[0]).getByText('양식 받기', { selector: 'p' }), 'text-subtitle')
    hasClasses(within(items[0]).getByText("빈 양식(엑셀), 시트 '물품'"), 'text-small text-ink-2')
    hasClasses(screen.getByText('분류는 넷으로 시작해요'), 'text-small font-semibold text-muted')
    hasClasses(screen.getByText('약품 · 치료 소모품 · 보조기·깁스 · 사무·생활'), 'text-body text-ink-2')
    hasClasses(screen.getByText('분류는 넷으로 시작해요').parentElement as HTMLElement, 'max-w-140 border-t border-line')
  })

  it('AC-7514.5: 빈 상태에도 [비트 코드에서 고르기]가 있는 한 줄이 있고, 누르면 onBitPick', async () => {
    const { user, onBitPick } = await open()
    expect(screen.getByText('비트에서 쓰던 약·재료 코드에서 골라 넣을 수도 있어요.')).toBeTruthy()
    await user.click(button('비트 코드에서 고르기'))
    expect(onBitPick).toHaveBeenCalledTimes(1)
  })

  it('AC-7506.6: 빈 상태 단추 — [양식 받기] onTemplate, [엑셀 올리기] 파일 고르기, [물품 더하기]·[분류 고치기] 판', async () => {
    const { user, onTemplate, container } = await open()
    await user.click(button('양식 받기'))
    expect(onTemplate).toHaveBeenCalledTimes(1)
    const pick = vi.spyOn(container.querySelector('input[type="file"]') as HTMLInputElement, 'click')
    await user.click(button('엑셀 올리기'))
    expect(pick).toHaveBeenCalledTimes(1)
    await user.click(button('물품 더하기'))
    expect(screen.getByRole('dialog', { name: '물품 더하기' })).toBeTruthy()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
    await user.click(button('분류 고치기'))
    expect(screen.getByRole('dialog', { name: '분류 고치기' })).toBeTruthy()
  })
})
