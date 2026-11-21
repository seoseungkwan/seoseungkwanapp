// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '@/lib/analytics/dates'
import { errorInfo } from '@/lib/errors'
import { listAliases, listReceipts, loadInventory, readPhoto, saveReceipt, updateReceipt } from '@/lib/storage/inventory'
import type { InvCategory, InvItem, InvReceipt } from '@/types/inventory'
import { shrinkPhoto } from './photo'
import { ReceiptsTool } from './ReceiptsTool'

// 들어온 기록 도구 (spec inventory AC-7508.1·7508.3·7508.5, 시안 ?s=in-list·in-photo·in-check·in-manual).
// 저장 모듈과 사진 줄이기(캔버스)는 가짜, 명세서 읽기 경로는 fetch 가짜(진짜 invoiceClient). 물품·거래처·숫자는 지어낸 예시다

vi.mock('@/lib/storage/inventory', () => ({
  loadInventory: vi.fn(),
  listAliases: vi.fn(),
  listReceipts: vi.fn(),
  readPhoto: vi.fn(),
  addItem: vi.fn(),
  saveReceipt: vi.fn(),
  updateReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
  saveAliases: vi.fn(),
}))
vi.mock('./photo', async (actual) => ({ ...(await actual<typeof import('./photo')>()), shrinkPhoto: vi.fn() }))

const TODAY = '2026-11-21' // 토요일
const PHOTO_PATH = 'h-1/0b8f6e2a-1111-4222-8333-944455556666.jpg'

const CATEGORIES: InvCategory[] = [
  { id: 'cat-med', name: '약품', sortOrder: 0 },
  { id: 'cat-sup', name: '치료 소모품', sortOrder: 1 },
]
function item(over: Partial<InvItem> & Pick<InvItem, 'id' | 'categoryId' | 'name'>): InvItem {
  return {
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
  }
}
const ITEMS: InvItem[] = [
  item({ id: 'i-glove', categoryId: 'cat-sup', name: '일회용 장갑 M', unit: '갑', unitPrice: 8900, sortOrder: 2 }),
  item({ id: 'i-lido', categoryId: 'cat-med', name: '리도카인 주사 2% 20mL', unit: '병', unitPrice: 1400, sortOrder: 0 }),
  item({ id: 'i-syr', categoryId: 'cat-sup', name: '주사기 3cc', unit: '개', unitPrice: 95, sortOrder: 0 }),
  item({ id: 'i-alc', categoryId: 'cat-sup', name: '알코올 솜', unit: '통', unitPrice: 3000, sortOrder: 1 }),
]
const line = (itemId: string, day: string, qty: number, unitPrice: number | null, amount: number) => ({
  itemId,
  day,
  savedAt: `${day}T01:00:00Z`,
  qty,
  unitPrice,
  amount,
})
// 줄 저장 차례는 목록 차례와 다르다(화면은 목록 차례로 그린다)
const RECEIPTS: InvReceipt[] = [
  {
    id: 'r-1121',
    day: '2026-11-21',
    vendor: '메디팜',
    photoPath: PHOTO_PATH,
    lines: [line('i-glove', '2026-11-21', 4, 8900, 35600), line('i-syr', '2026-11-21', 200, 95, 19000), line('i-alc', '2026-11-21', 5, 3200, 16000)],
  },
  { id: 'r-1112', day: '2026-11-12', vendor: '오피스마트', photoPath: null, lines: [line('i-lido', '2026-11-12', 2, 1400, 2800)] },
  { id: 'r-1030', day: '2026-10-30', vendor: null, photoPath: null, lines: [line('i-syr', '2026-10-30', 100, 95, 9500)] },
]

const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], { type: 'image/jpeg' })
const ANSWER = {
  date: '2026-11-21',
  vendor: '메디팜',
  lines: [
    { name: '일회용주사기 3ml', qty: 200, unitPrice: 95, amount: 19000, itemId: null, unsure: false },
    { name: '알콜솜 100매', qty: 5, unitPrice: 3200, amount: 16000, itemId: 'i-alc', unsure: false },
  ],
}

const fetchMock = vi.fn<typeof fetch>()
const onChanged = vi.fn()

beforeEach(() => {
  vi.mocked(loadInventory).mockReset().mockResolvedValue({ categories: CATEGORIES, items: ITEMS })
  vi.mocked(listAliases).mockReset().mockResolvedValue([{ alias: '일회용주사기 3ml', itemId: 'i-syr' }])
  vi.mocked(listReceipts).mockReset().mockResolvedValue(RECEIPTS)
  vi.mocked(readPhoto).mockReset().mockResolvedValue(JPEG)
  vi.mocked(saveReceipt).mockReset().mockResolvedValue({ id: 'r-new' })
  vi.mocked(updateReceipt).mockReset().mockResolvedValue('ok')
  vi.mocked(shrinkPhoto).mockReset().mockResolvedValue(JPEG)
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify(ANSWER), { status: 200 }))
  onChanged.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake-photo'), revokeObjectURL: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function showTool(props: { startManual?: boolean } = {}) {
  const view = render(<ReceiptsTool today={TODAY} onChanged={onChanged} {...props} />)
  await screen.findByRole('heading', { name: props.startManual ? '사진 없이 적기' : '들어온 기록' })
  if (!props.startManual) await screen.findByText('메디팜')
  return view
}

const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement

describe('들어온 기록 목록 (AC-7508.5)', () => {
  it('AC-7508.5: 오늘까지 90일을 읽고 머리에 [사진 없이 적기]·[사진 올리기]가 있다', async () => {
    await showTool()
    expect(listReceipts).toHaveBeenCalledWith({ from: addDays(TODAY, -89), to: TODAY })
    expect(screen.getByText('거래명세서·영수증·주문 화면 캡처 사진을 올리면 AI가 읽어 줘요. 사진은 기록과 함께 보관해요.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '사진 없이 적기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '사진 올리기' })).toBeTruthy()
    const input = screen.getByLabelText('명세서 사진 파일') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/jpeg,image/png,image/webp')
  })

  it('AC-7508.5: 달로 묶고 이번 달은 펼침, 지난달은 접힌 머리 한 줄이다', async () => {
    await showTool()
    const nov = screen.getByRole('rowheader', { name: /^11월/ })
    expect(nov.textContent).toContain('2건')
    expect(nov.closest('tr')?.textContent).toContain('73,400원')
    const oct = screen.getByRole('rowheader', { name: /^10월/ })
    expect(oct.closest('tr')?.textContent).toContain('1건')
    expect(oct.closest('tr')?.textContent).toContain('9,500원')
    expect(screen.queryByText('주사기 3cc 100개')).toBeNull()
    const open = within(oct.closest('tr') as HTMLElement).getByRole('button', { name: /펼치기/ })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(open)
    expect(screen.getByText('주사기 3cc 100개')).toBeTruthy()
    expect(within(oct.closest('tr') as HTMLElement).getByRole('button', { name: /접기/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('AC-7508.5: 줄마다 날짜·거래처·첫 물품 외 n줄·금액·[사진 보기] 또는 사진 없음·[고치기]', async () => {
    await showTool()
    const first = rowOf('메디팜')
    expect(first.textContent).toContain('11월 21일(토)')
    expect(within(first).getByRole('button', { name: '주사기 3cc 200개 외 2줄' })).toBeTruthy()
    expect(first.textContent).toContain('70,600원')
    expect(within(first).getByRole('button', { name: '사진 보기' })).toBeTruthy()
    expect(within(first).getByRole('button', { name: '고치기' })).toBeTruthy()
    const second = rowOf('오피스마트')
    expect(second.textContent).toContain('11월 12일(목)')
    expect(within(second).getByRole('button', { name: '리도카인 주사 2% 20mL 2병' })).toBeTruthy()
    expect(second.textContent).toContain('사진 없음')
    expect(within(second).queryByRole('button', { name: '사진 보기' })).toBeNull()
  })

  it('AC-7508.5: 첫 물품 줄을 누르면 물품 줄이 목록 차례로 펼쳐진다', async () => {
    await showTool()
    const toggle = within(rowOf('메디팜')).getByRole('button', { name: '주사기 3cc 200개 외 2줄' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const detail = (rowOf('메디팜').nextElementSibling as HTMLElement).textContent ?? ''
    const at = (text: string) => detail.indexOf(text)
    expect(at('주사기 3cc')).toBeGreaterThanOrEqual(0)
    expect(at('주사기 3cc')).toBeLessThan(at('알코올 솜'))
    expect(at('알코올 솜')).toBeLessThan(at('일회용 장갑 M'))
    expect(detail).toContain('5통 × 3,200원')
    expect(detail).toContain('35,600원')
  })

  it('AC-7508.5: [사진 보기]는 사진을 내려받아 가운데 창에 크게 보이고, 닫으면 주소를 거둔다', async () => {
    await showTool()
    fireEvent.click(within(rowOf('메디팜')).getByRole('button', { name: '사진 보기' }))
    const dialog = await screen.findByRole('dialog', { name: '11월 21일(토) · 메디팜 사진' })
    expect(readPhoto).toHaveBeenCalledWith(PHOTO_PATH)
    const img = (await within(dialog).findByRole('img')) as HTMLImageElement
    expect(img.getAttribute('src')).toBe('blob:fake-photo')
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-photo')
  })

  it('AC-7508.5: 사진을 못 받으면 창 안에 그 말이 보인다', async () => {
    vi.mocked(readPhoto).mockResolvedValueOnce(null)
    await showTool()
    fireEvent.click(within(rowOf('메디팜')).getByRole('button', { name: '사진 보기' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('사진을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.')).toBeTruthy()
  })

  it('AC-7508.5: [고치기]는 그 기록 값으로 확인 화면을 열고 update_inventory_receipt로 저장한 뒤 다시 읽는다', async () => {
    await showTool()
    fireEvent.click(within(rowOf('오피스마트')).getByRole('button', { name: '고치기' }))
    expect(await screen.findByRole('heading', { name: '들어온 기록 고치기' })).toBeTruthy()
    expect((screen.getByLabelText('1번째 줄 목록 물품') as HTMLSelectElement).value).toBe('i-lido')
    fireEvent.change(screen.getByLabelText('1번째 줄 수량'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByRole('heading', { name: '들어온 기록' })
    expect(updateReceipt).toHaveBeenCalledWith('r-1112', { day: '2026-11-12', vendor: '오피스마트', lines: [{ itemId: 'i-lido', qty: 3, unitPrice: 1400, amount: 4200 }] })
    await waitFor(() => expect(listReceipts).toHaveBeenCalledTimes(2))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('AC-7508.5: 사진이 있는 기록을 고칠 때 그 사진도 보인다', async () => {
    await showTool()
    fireEvent.click(within(rowOf('메디팜')).getByRole('button', { name: '고치기' }))
    expect(await screen.findByRole('img', { name: '올린 명세서 사진' })).toBeTruthy()
    expect(readPhoto).toHaveBeenCalledWith(PHOTO_PATH)
  })

  it('AC-7508.5: 기록이 없으면 빈 줄 안내', async () => {
    vi.mocked(listReceipts).mockResolvedValue([])
    render(<ReceiptsTool today={TODAY} />)
    expect(await screen.findByText('최근 90일 동안 들어온 기록이 없어요.')).toBeTruthy()
  })

  it('AC-7508.5: 읽기가 실패하면 오류 카드와 [다시 읽기]', async () => {
    vi.mocked(listReceipts).mockResolvedValueOnce('failed')
    render(<ReceiptsTool today={TODAY} />)
    await screen.findByText(errorInfo('E-INV-READ-FAILED').what)
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(await screen.findByText('메디팜')).toBeTruthy()
    expect(listReceipts).toHaveBeenCalledTimes(2)
  })
})

describe('사진 올리기 (AC-7508.1)', () => {
  it('AC-7508.1: 고른 사진을 줄여 경로로 보내고, 읽는 동안 읽는 중 표시, 답은 확인 화면으로 미리 골라 보인다', async () => {
    let answer: (value: Response) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    const user = userEvent.setup()
    await showTool()
    const file = new File([new Uint8Array([1, 2, 3])], '명세서_1121.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('명세서 사진 파일'), file)
    expect(shrinkPhoto).toHaveBeenCalledWith(file)
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('사진을 읽는 중이에요')
    expect(screen.getByRole('button', { name: '사진 올리기' }).getAttribute('aria-busy')).toBe('true')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { image: string }
    expect(body.image.startsWith('/9j/')).toBe(true)
    await act(async () => answer(new Response(JSON.stringify(ANSWER), { status: 200 })))
    expect(await screen.findByRole('heading', { name: '들어온 것 확인' })).toBeTruthy()
    expect((screen.getByLabelText('1번째 줄 목록 물품') as HTMLSelectElement).value).toBe('i-syr')
    expect(screen.getByText('기억한 이름')).toBeTruthy()
    expect(screen.getByText('명세서_1121.png')).toBeTruthy()
    expect(screen.getByText('사진은 Claude가 읽어요. 환자 이름이 보이는 사진은 올리지 마세요.')).toBeTruthy()
  })

  it('AC-7508.1: 줄이지 못하면 보내지 않고 E-INV-PHOTO 오류 카드', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValueOnce(null)
    const user = userEvent.setup()
    await showTool()
    await user.upload(screen.getByLabelText('명세서 사진 파일'), new File([new Uint8Array([1])], 'a.webp', { type: 'image/webp' }))
    expect(await screen.findByText(errorInfo('E-INV-PHOTO').what)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-7508.1: 경로가 물품 줄을 못 찾으면 E-INV-NO-LINES 오류 카드이고 목록은 그대로다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'E-INV-NO-LINES' }), { status: 422 }))
    const user = userEvent.setup()
    await showTool()
    await user.upload(screen.getByLabelText('명세서 사진 파일'), new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText(errorInfo('E-INV-NO-LINES').what)).toBeTruthy()
    expect(screen.getByText('메디팜')).toBeTruthy()
  })

  it('AC-7508.4: 확인 화면에서 저장하면 사진과 함께 저장하고 목록으로 돌아와 다시 읽는다', async () => {
    const user = userEvent.setup()
    await showTool()
    await user.upload(screen.getByLabelText('명세서 사진 파일'), new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))
    await screen.findByRole('heading', { name: '들어온 것 확인' })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByRole('heading', { name: '들어온 기록' })
    expect(saveReceipt).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-11-21', vendor: '메디팜', photo: JPEG }))
    expect(onChanged).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(listReceipts).toHaveBeenCalledTimes(2))
    expect(loadInventory).toHaveBeenCalledTimes(2)
  })

  it('AC-7508.2: [사진 다시 올리기]는 사진 고르기를 다시 연다', async () => {
    const user = userEvent.setup()
    await showTool()
    const input = screen.getByLabelText('명세서 사진 파일') as HTMLInputElement
    await user.upload(input, new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))
    await screen.findByRole('heading', { name: '들어온 것 확인' })
    const click = vi.spyOn(screen.getByLabelText('명세서 사진 파일') as HTMLInputElement, 'click')
    fireEvent.click(screen.getByRole('button', { name: '사진 다시 올리기' }))
    expect(click).toHaveBeenCalled()
  })

  it('AC-7508.2: [취소]는 저장하지 않고 목록으로 돌아간다', async () => {
    const user = userEvent.setup()
    await showTool()
    await user.upload(screen.getByLabelText('명세서 사진 파일'), new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))
    await screen.findByRole('heading', { name: '들어온 것 확인' })
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(await screen.findByRole('heading', { name: '들어온 기록' })).toBeTruthy()
    expect(saveReceipt).not.toHaveBeenCalled()
  })
})

describe('사진 없이 적기 (AC-7508.3)', () => {
  it('AC-7508.3: [사진 없이 적기]는 빈 줄 하나인 같은 화면을 연다', async () => {
    await showTool()
    fireEvent.click(screen.getByRole('button', { name: '사진 없이 적기' }))
    expect(await screen.findByRole('heading', { name: '사진 없이 적기' })).toBeTruthy()
    expect(screen.getByLabelText('1번째 줄 이름')).toBeTruthy()
    expect(screen.queryByLabelText('2번째 줄 이름')).toBeNull()
    expect(screen.getByRole('button', { name: '사진 올리기' })).toBeTruthy()
  })

  it('AC-7508.3: startManual이면 처음부터 사진 없이 적기를 연다(세기 경고의 [입고 적기])', async () => {
    await showTool({ startManual: true })
    expect(screen.getByLabelText('1번째 줄 이름')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(await screen.findByRole('heading', { name: '들어온 기록' })).toBeTruthy()
  })
})
