// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { addItem, deleteReceipt, saveAliases, saveReceipt, updateReceipt } from '@/lib/storage/inventory'
import type { InvAlias, InvCategory, InvItem, InvReceipt } from '@/types/inventory'
import type { InvoiceRead } from './invoiceClient'
import { ReceiptConfirm, draftFromInvoice, draftFromReceipt, manualDraft, type ConfirmMode, type ReceiptDraft } from './ReceiptConfirm'

// "들어온 것 확인" 화면 (spec inventory AC-7508.1~7508.5, 시안 ?s=in-check·in-manual). 세 모양: 사진(photo)·사진 없이(manual)·고치기(edit).
// 저장 모듈은 가짜다(vi.mock). 물품 이름·거래처·숫자는 시안의 지어낸 예시다(환자 정보 없음)

vi.mock('@/lib/storage/inventory', () => ({
  addItem: vi.fn(),
  saveReceipt: vi.fn(),
  updateReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
  saveAliases: vi.fn(),
}))

const TODAY = '2026-11-21'
const PRIVACY = '사진은 Claude가 읽어요. 환자 이름이 보이는 사진은 올리지 마세요.'

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
  item({ id: 'i-syr', categoryId: 'cat-sup', name: '주사기 3cc', unit: '개', unitPrice: 95, sortOrder: 0, orderedAt: '2026-11-20T01:00:00Z' }),
  item({ id: 'i-alc', categoryId: 'cat-sup', name: '알코올 솜', unit: '통', unitPrice: 3000, sortOrder: 1 }),
  item({ id: 'i-old', categoryId: 'cat-sup', name: '주사기 5cc', hidden: true, sortOrder: 3 }),
]
const ALIASES: InvAlias[] = [{ alias: '일회용주사기 3ml', itemId: 'i-syr' }]

// 알콜솜 줄 금액은 세액을 더한 답 금액(5 × 3,200 = 16,000이 아님)
const INVOICE: InvoiceRead = {
  date: '2026-11-21',
  vendor: '메디팜',
  lines: [
    { name: '일회용주사기 3ml', qty: 200, unitPrice: 95, amount: 19000, itemId: null, unsure: false },
    { name: '알콜솜 100매', qty: 5, unitPrice: 3200, amount: 17600, itemId: 'i-alc', unsure: false },
    { name: '니트릴장갑 M', qty: 4, unitPrice: 8900, amount: 35600, itemId: 'i-glove', unsure: true },
    { name: '테이핑 테이프 5cm', qty: 12, unitPrice: 4500, amount: 54000, itemId: null, unsure: false },
  ],
}

const PHOTO = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })

const onPhoto = vi.fn()
const onCancel = vi.fn()
const onSaved = vi.fn()

beforeEach(() => {
  vi.mocked(addItem).mockReset().mockResolvedValue({ id: 'i-new' })
  vi.mocked(saveReceipt).mockReset().mockResolvedValue({ id: 'r-new' })
  vi.mocked(updateReceipt).mockReset().mockResolvedValue('ok')
  vi.mocked(deleteReceipt).mockReset().mockResolvedValue('ok')
  vi.mocked(saveAliases).mockReset().mockResolvedValue('ok')
  onPhoto.mockReset()
  onCancel.mockReset()
  onSaved.mockReset()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake-photo'), revokeObjectURL: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function show(mode: ConfirmMode, initial: ReceiptDraft, more: { photo?: Blob | null; receiptId?: string; items?: InvItem[] } = {}) {
  return render(
    <ReceiptConfirm
      mode={mode}
      today={TODAY}
      categories={CATEGORIES}
      items={more.items ?? ITEMS}
      initial={initial}
      photo={more.photo ?? null}
      photoName={mode === 'photo' ? '명세서_1121.jpg' : null}
      receiptId={more.receiptId}
      onPhoto={onPhoto}
      onCancel={onCancel}
      onSaved={onSaved}
    />,
  )
}

const showRead = () => show('photo', draftFromInvoice(INVOICE, ITEMS, ALIASES, CATEGORIES, TODAY), { photo: PHOTO })

function lineRows(): HTMLElement[] {
  const table = screen.getByRole('table')
  return within(table).getAllByRole('row').slice(1) // 머리 줄 빼고
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement & HTMLSelectElement
const change = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: '저장' }))

describe('들어온 것 확인 그리기 (AC-7508.2)', () => {
  it('AC-7508.2: 왼쪽 사진·날짜·거래처·줄 표와 단추가 있다', () => {
    showRead()
    expect(screen.getByRole('heading', { name: '들어온 것 확인' })).toBeTruthy()
    const photo = screen.getByRole('img', { name: '올린 명세서 사진' }) as HTMLImageElement
    expect(photo.getAttribute('src')).toBe('blob:fake-photo')
    expect(URL.createObjectURL).toHaveBeenCalledWith(PHOTO)
    expect(field('날짜').value).toBe('2026-11-21')
    expect(field('거래처').value).toBe('메디팜')
    const heads = within(screen.getByRole('table')).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['줄', '명세서에 적힌 이름', '목록 물품', '수량', '단가', '금액', '지우기'])
    for (const name of ['사진 다시 올리기', '+ 줄 더하기', '취소', '저장']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(lineRows()).toHaveLength(4)
  })

  it('AC-7508.1: 사진은 Claude가 읽는다는 안내가 늘 있다', () => {
    showRead()
    expect(screen.getByText(PRIVACY)).toBeTruthy()
    cleanup()
    show('manual', manualDraft(TODAY, CATEGORIES))
    expect(screen.getByText(PRIVACY)).toBeTruthy()
  })

  it('AC-7508.2: matchLines로 미리 고르고 칩을 단다(기억한 이름 · 확인해 주세요 · 새 물품)', () => {
    showRead()
    const rows = lineRows()
    expect(rows[0].textContent).toContain('일회용주사기 3ml')
    expect(field('1번째 줄 목록 물품').value).toBe('i-syr')
    expect(within(rows[0]).getByText('기억한 이름')).toBeTruthy()
    expect(field('2번째 줄 목록 물품').value).toBe('i-alc')
    expect(within(rows[1]).queryByText('기억한 이름')).toBeNull()
    expect(within(rows[2]).getByText('확인해 주세요')).toBeTruthy()
    expect(field('4번째 줄 목록 물품').value).toBe('new')
    expect(within(rows[3]).getByText('새 물품')).toBeTruthy()
    expect(field('4번째 줄 새 물품 분류').value).toBe('cat-med')
    expect(field('4번째 줄 새 물품 단위').value).toBe('개')
    expect(within(rows[0]).queryByLabelText('1번째 줄 새 물품 단위')).toBeNull()
  })

  it('AC-7508.2: 물품 고르기는 새 물품·넣지 않음·분류별 물품이고 안 쓰는 물품은 없다', () => {
    showRead()
    const select = field('1번째 줄 목록 물품')
    const options = [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(options).toEqual(['+ 새 물품으로 넣기', '넣지 않음', '리도카인 주사 2% 20mL', '주사기 3cc', '알코올 솜', '일회용 장갑 M'])
    expect([...select.querySelectorAll('optgroup')].map((g) => g.getAttribute('label'))).toEqual(['약품', '치료 소모품'])
  })

  it('AC-7508.2: 수량 옆에 고른 물품의 단위, 새 물품이면 적은 단위', () => {
    showRead()
    const rows = lineRows()
    expect(within(rows[0]).getByText('개')).toBeTruthy()
    expect(within(rows[1]).getByText('통')).toBeTruthy()
    change('2번째 줄 목록 물품', 'i-lido')
    expect(within(lineRows()[1]).getByText('병')).toBeTruthy()
    change('4번째 줄 새 물품 단위', '롤')
    expect(within(lineRows()[3]).getByText('롤')).toBeTruthy()
  })

  it('AC-7508.2: 금액은 답 금액이고 수량·단가를 고치면 수량 × 단가다. 합계도 바뀐다', () => {
    showRead()
    expect(lineRows()[1].textContent).toContain('17,600원')
    expect(screen.getByText(/4줄 · 합계/).textContent).toContain('126,200원')
    change('2번째 줄 수량', '6')
    expect(lineRows()[1].textContent).toContain('19,200원')
    change('2번째 줄 단가', '3,000')
    expect(lineRows()[1].textContent).toContain('18,000원')
    expect(screen.getByText(/4줄 · 합계/).textContent).toContain('126,600원')
  })

  it('AC-7508.2: 단가가 목록과 다르면 줄 아래 안내가 붙는다', () => {
    showRead()
    expect(lineRows()[1].textContent).toContain('목록 단가 3,000원 → 3,200원으로 바뀌어요')
    expect(lineRows()[0].textContent).not.toContain('목록 단가')
    change('2번째 줄 단가', '3000')
    expect(lineRows()[1].textContent).not.toContain('목록 단가')
  })

  it("AC-7508.2: '주문함' 물품이 들어오면 풀린다는 안내와 짝 기억 안내가 있다", () => {
    showRead()
    expect(screen.getByText("저장하면 주사기 3cc의 '주문함' 표시가 풀려요.")).toBeTruthy()
    expect(screen.getByText('고른 짝(명세서 이름 → 목록 물품)은 기억해서 다음 명세서에는 저절로 골라요.')).toBeTruthy()
    expect(screen.getByText('수량은 목록 단위로 적어요. 100개들이 2박스면 200이에요.')).toBeTruthy()
    expect(screen.getByText('단가를 적은 줄은 그 물품 단가도 이 값으로 바뀌어요.')).toBeTruthy()
  })

  it('AC-7508.2: 고른 물품을 바꾸면 기억한 이름 칩이 빠지고, 새 물품으로 바꾸면 분류·단위 칸이 열린다', () => {
    showRead()
    change('1번째 줄 목록 물품', 'new')
    const row = lineRows()[0]
    expect(within(row).queryByText('기억한 이름')).toBeNull()
    expect(within(row).getByText('새 물품')).toBeTruthy()
    expect(within(row).getByLabelText('1번째 줄 새 물품 분류')).toBeTruthy()
  })

  it('AC-7508.2: 줄 지우기·+ 줄 더하기·사진 다시 올리기·취소', () => {
    showRead()
    fireEvent.click(screen.getByRole('button', { name: '2번째 줄 지우기' }))
    expect(lineRows()).toHaveLength(3)
    expect(screen.queryByText('알콜솜 100매')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ 줄 더하기' }))
    expect(lineRows()).toHaveLength(4)
    expect(field('4번째 줄 이름').value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '사진 다시 올리기' }))
    expect(onPhoto).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('AC-7508.2: 저장 줄에 날짜·거래처·넣을 줄 수가 보인다', () => {
    showRead()
    expect(screen.getByText(/줄을 들어온 기록에 넣어요/).textContent).toBe('11월 21일 · 메디팜 · 4줄을 들어온 기록에 넣어요')
    change('3번째 줄 목록 물품', 'skip')
    expect(screen.getByText(/줄을 들어온 기록에 넣어요/).textContent).toBe('11월 21일 · 메디팜 · 3줄을 들어온 기록에 넣어요')
  })
})

describe('사진 없이 적기 (AC-7508.3)', () => {
  it('AC-7508.3: 사진 없는 같은 화면이고 빈 줄 하나, [사진 올리기]가 있다', () => {
    show('manual', manualDraft(TODAY, CATEGORIES))
    expect(screen.getByRole('heading', { name: '사진 없이 적기' })).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(lineRows()).toHaveLength(1)
    expect(field('1번째 줄 이름').value).toBe('')
    expect(field('1번째 줄 목록 물품').value).toBe('')
    expect(field('날짜').value).toBe(TODAY)
    expect(field('거래처').value).toBe('')
    expect(screen.queryByRole('button', { name: '사진 다시 올리기' })).toBeNull()
    const heads = within(screen.getByRole('table')).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads[1]).toBe('이름')
    fireEvent.click(screen.getByRole('button', { name: '사진 올리기' }))
    expect(onPhoto).toHaveBeenCalledTimes(1)
  })

  it('AC-7508.3: 고른 물품으로 적으면 사진 없이 저장하고 별칭은 기억하지 않는다', async () => {
    show('manual', manualDraft(TODAY, CATEGORIES))
    change('1번째 줄 목록 물품', 'i-lido')
    change('1번째 줄 수량', '3')
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(saveReceipt).toHaveBeenCalledWith({ day: TODAY, vendor: null, photo: null, lines: [{ itemId: 'i-lido', qty: 3, unitPrice: null, amount: 0 }] })
    expect(saveAliases).not.toHaveBeenCalled()
    expect(addItem).not.toHaveBeenCalled()
  })

  it('AC-7508.3: 적은 이름으로 새 물품을 만든다', async () => {
    show('manual', manualDraft(TODAY, CATEGORIES))
    change('거래처', ' 정형메디칼 ')
    change('1번째 줄 이름', '테이핑 테이프')
    change('1번째 줄 목록 물품', 'new')
    change('1번째 줄 새 물품 분류', 'cat-sup')
    change('1번째 줄 새 물품 단위', '롤')
    change('1번째 줄 수량', '12')
    change('1번째 줄 단가', '4,500')
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(addItem).toHaveBeenCalledWith(
      { categoryId: 'cat-sup', name: '테이핑 테이프', unit: '롤', minQty: null, expiry: null, vendor: null, unitPrice: null },
      null,
      TODAY,
    )
    expect(saveReceipt).toHaveBeenCalledWith({
      day: TODAY,
      vendor: '정형메디칼',
      photo: null,
      lines: [{ itemId: 'i-new', qty: 12, unitPrice: 4500, amount: 54000 }],
    })
  })
})

describe('저장 (AC-7508.4)', () => {
  it('AC-7508.4: 새 물품을 먼저 만들고 → 사진과 함께 입고 저장 → 다른 이름은 별칭으로 기억한다', async () => {
    showRead()
    change('4번째 줄 새 물품 분류', 'cat-sup')
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(addItem).toHaveBeenCalledTimes(1)
    expect(addItem).toHaveBeenCalledWith(
      { categoryId: 'cat-sup', name: '테이핑 테이프 5cm', unit: '개', minQty: null, expiry: null, vendor: null, unitPrice: null },
      null,
      TODAY,
    )
    expect(saveReceipt).toHaveBeenCalledWith({
      day: '2026-11-21',
      vendor: '메디팜',
      photo: PHOTO,
      lines: [
        { itemId: 'i-syr', qty: 200, unitPrice: 95, amount: 19000 },
        { itemId: 'i-alc', qty: 5, unitPrice: 3200, amount: 17600 },
        { itemId: 'i-glove', qty: 4, unitPrice: 8900, amount: 35600 },
        { itemId: 'i-new', qty: 12, unitPrice: 4500, amount: 54000 },
      ],
    })
    expect(saveAliases).toHaveBeenCalledWith([
      { alias: '일회용주사기 3ml', itemId: 'i-syr' },
      { alias: '알콜솜 100매', itemId: 'i-alc' },
      { alias: '니트릴장갑 m', itemId: 'i-glove' },
    ])
    const order = (fn: unknown) => vi.mocked(fn as typeof addItem).mock.invocationCallOrder[0]
    expect(order(addItem)).toBeLessThan(order(saveReceipt))
    expect(order(saveReceipt)).toBeLessThan(order(saveAliases))
  })

  it("AC-7508.4: '넣지 않음' 줄은 빼고 저장하고 기억하지도 않는다", async () => {
    showRead()
    change('3번째 줄 목록 물품', 'skip')
    change('4번째 줄 목록 물품', 'skip')
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(addItem).not.toHaveBeenCalled()
    const sent = vi.mocked(saveReceipt).mock.calls[0][0]
    expect(sent.lines.map((l) => l.itemId)).toEqual(['i-syr', 'i-alc'])
    expect(vi.mocked(saveAliases).mock.calls[0][0].map((a) => a.itemId)).toEqual(['i-syr', 'i-alc'])
  })

  it('AC-7508.4: 같은 새 이름 두 줄은 물품 하나로 만든다', async () => {
    const twice: InvoiceRead = { ...INVOICE, lines: [INVOICE.lines[3], { ...INVOICE.lines[3], qty: 3, amount: 13500 }] }
    show('photo', draftFromInvoice(twice, ITEMS, ALIASES, CATEGORIES, TODAY), { photo: PHOTO })
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(addItem).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveReceipt).mock.calls[0][0].lines.map((l) => l.itemId)).toEqual(['i-new', 'i-new'])
  })

  it('AC-7508.4: 수량이 1~1,000,000 정수가 아니면 칸 아래 오류이고 아무것도 보내지 않는다', async () => {
    showRead()
    for (const bad of ['0', '1.5', '1000001', '', '열']) {
      change('1번째 줄 수량', bad)
      save()
      expect(lineRows()[0].textContent).toContain('수량은 1~1,000,000 사이 숫자로 적어 주세요')
      expect(field('1번째 줄 수량').getAttribute('aria-invalid')).toBe('true')
    }
    change('2번째 줄 단가', '-5')
    save()
    expect(lineRows()[1].textContent).toContain('단가는 0 이상 숫자로 적어 주세요')
    expect(addItem).not.toHaveBeenCalled()
    expect(saveReceipt).not.toHaveBeenCalled()
  })

  it('AC-7508.4: 날짜가 비었거나 오늘보다 뒤면 오류이고 보내지 않는다', () => {
    showRead()
    change('날짜', '2026-11-22')
    save()
    expect(screen.getByText('오늘보다 뒤 날짜는 적을 수 없어요')).toBeTruthy()
    change('날짜', '')
    save()
    expect(screen.getByText('날짜를 골라 주세요')).toBeTruthy()
    expect(saveReceipt).not.toHaveBeenCalled()
  })

  it('AC-7508.4: 금액이 1,000,000,000원을 넘으면 오류다', () => {
    showRead()
    change('1번째 줄 수량', '1000000')
    change('1번째 줄 단가', '1001')
    save()
    expect(lineRows()[0].textContent).toContain('금액이 너무 커요')
    expect(saveReceipt).not.toHaveBeenCalled()
  })

  it('AC-7508.4: 물품을 고르지 않았거나 새 물품 단위가 비면 오류다', () => {
    show('manual', manualDraft(TODAY, CATEGORIES))
    change('1번째 줄 수량', '2')
    save()
    expect(lineRows()[0].textContent).toContain('목록 물품을 골라 주세요')
    change('1번째 줄 목록 물품', 'new')
    change('1번째 줄 새 물품 단위', ' ')
    save()
    expect(lineRows()[0].textContent).toContain('물품 이름을 적어 주세요')
    expect(lineRows()[0].textContent).toContain('단위를 1~10자로 적어 주세요')
    expect(addItem).not.toHaveBeenCalled()
  })

  it('AC-7508.4: 넣을 줄이 없으면 [저장]이 꺼져 있다', () => {
    showRead()
    for (const n of [1, 2, 3, 4]) change(`${n}번째 줄 목록 물품`, 'skip')
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true)
  })

  it('AC-7508.4: 저장이 실패하면 화면 값은 그대로이고 오류 카드, 다시 저장하면 만든 물품을 또 만들지 않는다', async () => {
    vi.mocked(saveReceipt).mockResolvedValueOnce('failed')
    showRead()
    change('2번째 줄 수량', '6')
    save()
    await screen.findByText(errorInfo('E-INV-SAVE-FAILED').what)
    expect(onSaved).not.toHaveBeenCalled()
    expect(field('2번째 줄 수량').value).toBe('6')
    expect(field('4번째 줄 목록 물품').value).toBe('new')
    expect(field('거래처').value).toBe('메디팜')
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(addItem).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveReceipt).mock.calls[1][0].lines.at(-1)?.itemId).toBe('i-new')
  })

  it('AC-7508.4: 새 물품 이름이 겹치면 E-INV-DUPLICATE이고 입고는 저장하지 않는다', async () => {
    vi.mocked(addItem).mockResolvedValueOnce('duplicate')
    showRead()
    save()
    await screen.findByText(errorInfo('E-INV-DUPLICATE').what)
    expect(saveReceipt).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('AC-7508.4: 저장하는 동안 [저장]은 기다림 표시이고 두 번 보내지 않는다', async () => {
    let finish: (value: { id: string }) => void = () => {}
    vi.mocked(saveReceipt).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    showRead()
    save()
    const busy = await screen.findByRole('button', { name: '저장하는 중…' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(busy)
    finish({ id: 'r-new' })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(saveReceipt).toHaveBeenCalledTimes(1)
  })

  it('AC-7508.4: 별칭 기억이 실패해도 입고는 저장된 것이다', async () => {
    vi.mocked(saveAliases).mockResolvedValueOnce('failed')
    showRead()
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })
})

describe('기록 고치기 (AC-7508.5)', () => {
  const RECEIPT: InvReceipt = {
    id: 'r-1121',
    day: '2026-11-18',
    vendor: '메디팜',
    photoPath: 'h-1/0b8f6e2a-1111-4222-8333-944455556666.jpg',
    lines: [
      { itemId: 'i-glove', day: '2026-11-18', savedAt: '2026-11-18T01:00:00Z', qty: 5, unitPrice: 8900, amount: 44500 },
      { itemId: 'i-syr', day: '2026-11-18', savedAt: '2026-11-18T01:00:00Z', qty: 100, unitPrice: null, amount: 9500 },
    ],
  }

  it('AC-7508.5: 그 기록 값으로 같은 화면을 열고 줄은 목록 차례다', () => {
    show('edit', draftFromReceipt(RECEIPT, ITEMS, CATEGORIES), { receiptId: RECEIPT.id, photo: PHOTO })
    expect(screen.getByRole('heading', { name: '들어온 기록 고치기' })).toBeTruthy()
    expect(field('날짜').value).toBe('2026-11-18')
    expect(field('거래처').value).toBe('메디팜')
    expect(field('1번째 줄 목록 물품').value).toBe('i-syr')
    expect(field('2번째 줄 목록 물품').value).toBe('i-glove')
    expect(lineRows()[0].textContent).toContain('9,500원')
    expect(field('2번째 줄 수량').value).toBe('5')
    expect(screen.getByRole('img', { name: '올린 명세서 사진' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '사진 다시 올리기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '사진 올리기' })).toBeNull()
  })

  it('AC-7508.5: [저장]은 update_inventory_receipt(고치기)로 보낸다', async () => {
    show('edit', draftFromReceipt(RECEIPT, ITEMS, CATEGORIES), { receiptId: RECEIPT.id })
    change('2번째 줄 수량', '6')
    change('거래처', '')
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateReceipt).toHaveBeenCalledWith('r-1121', {
      day: '2026-11-18',
      vendor: null,
      lines: [
        { itemId: 'i-syr', qty: 100, unitPrice: null, amount: 9500 },
        { itemId: 'i-glove', qty: 6, unitPrice: 8900, amount: 53400 },
      ],
    })
    expect(saveReceipt).not.toHaveBeenCalled()
    expect(saveAliases).not.toHaveBeenCalled()
  })

  it('AC-7508.5: 줄을 다 지우고 [저장]하면 확인 창 뒤 그 기록을 지운다', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    show('edit', draftFromReceipt(RECEIPT, ITEMS, CATEGORIES), { receiptId: RECEIPT.id })
    fireEvent.click(screen.getByRole('button', { name: '2번째 줄 지우기' }))
    fireEvent.click(screen.getByRole('button', { name: '1번째 줄 지우기' }))
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(false)
    save()
    expect(ask).toHaveBeenCalledTimes(1)
    expect(deleteReceipt).not.toHaveBeenCalled()
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(ask.mock.calls[1][0]).toBe('줄을 모두 지웠어요. 이 들어온 기록을 지울까요?')
    expect(deleteReceipt).toHaveBeenCalledWith('r-1121')
    expect(updateReceipt).not.toHaveBeenCalled()
  })

  it('AC-7508.5: 지우기가 실패하면 오류 카드이고 화면은 그대로다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteReceipt).mockResolvedValueOnce('failed')
    show('edit', draftFromReceipt(RECEIPT, ITEMS, CATEGORIES), { receiptId: RECEIPT.id })
    fireEvent.click(screen.getByRole('button', { name: '1번째 줄 지우기' }))
    fireEvent.click(screen.getByRole('button', { name: '1번째 줄 지우기' }))
    save()
    await screen.findByText(errorInfo('E-INV-SAVE-FAILED').what)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('AC-7508.5: 안 쓰는 물품 줄도 고르기에 그대로 보인다', () => {
    const hidden: InvReceipt = { ...RECEIPT, lines: [{ ...RECEIPT.lines[0], itemId: 'i-old' }] }
    show('edit', draftFromReceipt(hidden, ITEMS, CATEGORIES), { receiptId: RECEIPT.id })
    const select = field('1번째 줄 목록 물품')
    expect(select.value).toBe('i-old')
    expect(select.selectedOptions[0].textContent).toBe('주사기 5cc (안 씀)')
  })
})
