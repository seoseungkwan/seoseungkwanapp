// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lastCountDay, loadInventory, saveCount } from '@/lib/storage/inventory'
import type { InvCategory, InvInventory, InvItem } from '@/types/inventory'
import { CountTool } from './CountTool'

// 세기 도구 (spec inventory REQ-7507 AC-7507.1~AC-7507.4, design.md 6절, 시안 docs/mockups/inventory ?s=count·print).
// 저장 모듈은 가짜(vi.mock). [입고 적기]는 onManualReceipt를 부르는지만 본다(입고 도구와 잇기는 TASK-15). 병원 이름 훅도 가짜다.
// 물품 이름·숫자는 시험 안에서 지은 가짜다

vi.mock('@/lib/storage/inventory', () => ({
  loadInventory: vi.fn(),
  lastCountDay: vi.fn(),
  saveCount: vi.fn(),
}))

vi.mock('@/components/clinic/useClinicProfile', () => ({
  useClinicProfile: () => ({
    state: 'ready',
    profile: { displayName: '튼튼정형외과의원', phone: null, address: null, honorific: '원장님', hours: [], closedDates: [], staff: [], logoPath: null },
    saved: true,
    signupName: '',
    signupPhone: null,
    name: '튼튼정형외과의원',
    logoDataUrl: null,
    reload: () => undefined,
  }),
}))

const load = vi.mocked(loadInventory)
const lastDay = vi.mocked(lastCountDay)
const save = vi.mocked(saveCount)

const TODAY = '2026-11-21'
const LAST = '2026-11-14'
const C_MED = 'c-med'
const C_SUP = 'c-sup'
// 일부러 분류 차례를 거꾸로 준다(sort_order로 다시 맞추는지 본다)
const CATEGORIES: InvCategory[] = [
  { id: C_SUP, name: '치료 소모품', sortOrder: 1 },
  { id: C_MED, name: '약품', sortOrder: 0 },
]

function item(over: Partial<InvItem> & Pick<InvItem, 'id' | 'categoryId' | 'name' | 'unit' | 'qty' | 'sortOrder'>): InvItem {
  return {
    minQty: null,
    lastCountQty: over.qty,
    lastCountedAt: '2026-11-14T01:00:00.000Z',
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
  item({ id: 'i-hya', categoryId: C_MED, name: '히알루론산 주사 2mL', unit: '개', qty: 4, sortOrder: 1, expiry: '2027-03-31' }),
  item({ id: 'i-lido', categoryId: C_MED, name: '리도카인 주사 2% 20mL', unit: '병', qty: 26, sortOrder: 0, expiry: '2026-12-05' }),
  item({ id: 'i-tri', categoryId: C_MED, name: '트리암시놀론 주사 40mg', unit: '병', qty: 15, lastCountQty: 5, sortOrder: 2 }),
  item({ id: 'i-syr5', categoryId: C_SUP, name: '주사기 5cc', unit: '개', qty: 0, sortOrder: 2, hidden: true }),
  item({ id: 'i-syr3', categoryId: C_SUP, name: '주사기 3cc', unit: '개', qty: 1240, sortOrder: 0 }),
  item({ id: 'i-cast', categoryId: C_SUP, name: '반깁스 재료 4인치', unit: '개', qty: 8, lastCountQty: null, lastCountedAt: null, sortOrder: 1 }),
]
const INVENTORY: InvInventory = { categories: CATEGORIES, items: ITEMS }
const SHOWN = ['리도카인 주사 2% 20mL', '히알루론산 주사 2mL', '트리암시놀론 주사 40mg', '주사기 3cc', '반깁스 재료 4인치']

beforeEach(() => {
  load.mockReset().mockResolvedValue(INVENTORY)
  lastDay.mockReset().mockResolvedValue(LAST)
  save.mockReset().mockResolvedValue('ok')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

type Props = Partial<{ reloadKey: number; onChanged: () => void; onManualReceipt: () => void }>
async function draw(props: Props = {}) {
  const calls = { onChanged: vi.fn(), onManualReceipt: vi.fn() }
  const view = render(<CountTool today={TODAY} onChanged={calls.onChanged} onManualReceipt={calls.onManualReceipt} {...props} />)
  await screen.findByRole('table')
  return { ...calls, view }
}

const countInput = (name: string) => screen.getByRole('textbox', { name: `${name} 센 수량` }) as HTMLInputElement
const expiryInput = (name: string) => screen.getByLabelText(`${name} 가장 빠른 유통기한`) as HTMLInputElement
const dayInput = () => screen.getByLabelText('센 날') as HTMLInputElement
const rowOf = (name: string) => countInput(name).closest('tr')!
const cellTexts = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
const saveButton = () => screen.getByRole('button', { name: /^(저장|다시 저장)$/ }) as HTMLButtonElement
const fill = () => document.querySelector('[data-count-fill]')?.textContent
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } })
const warningOf = (name: string) => document.querySelector(`[data-warning-for="${rowOf(name).dataset.item}"]`)

describe('AC-7507.1: 세기 표 — 센 날과 숨기지 않은 물품', () => {
  it('AC-7507.1: 머리 "수량 세기"·안내 글과 [세기 종이 인쇄]', async () => {
    await draw()
    expect(screen.getByRole('heading', { level: 2, name: '수량 세기' })).toBeTruthy()
    expect(screen.getByText('종이에 적어 온 숫자를 넣어요. 비운 칸은 지난 수량 그대로예요. 가장 빠른 유통기한도 여기서 고쳐요.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '세기 종이 인쇄' })).toBeTruthy()
  })

  it('AC-7507.1: 센 날은 기본 오늘이고 마지막 세기 날짜~오늘만 고를 수 있다', async () => {
    await draw()
    expect(dayInput().type).toBe('date')
    expect(dayInput().value).toBe(TODAY)
    expect(dayInput().min).toBe(LAST)
    expect(dayInput().max).toBe(TODAY)
    expect(screen.getByText('지난 세기 11월 14일(토)')).toBeTruthy()
  })

  it('AC-7507.1: 세기가 한 번도 없으면 앞 한도가 없다', async () => {
    lastDay.mockResolvedValue(null)
    await draw()
    expect(dayInput().min).toBe('')
    expect(dayInput().max).toBe(TODAY)
    expect(screen.getByRole('columnheader', { name: '지난 수량' })).toBeTruthy()
  })

  it('AC-7507.1: 칸 이름은 물품 이름 · 단위 · 지난 수량 (마지막 세기 m/d) · 그 뒤 들어옴 · 센 수량 · 가장 빠른 유통기한', async () => {
    await draw()
    const heads = screen.getAllByRole('columnheader').filter((th) => th.getAttribute('scope') !== 'colgroup')
    expect(heads.map((th) => th.textContent)).toEqual(['물품 이름', '단위', '지난 수량 (11/14)', '그 뒤 들어옴', '센 수량', '가장 빠른 유통기한'])
  })

  it('AC-7507.1: 숨긴 물품은 빠지고 목록 차례(분류 sort_order → 물품 sort_order)로 그린다', async () => {
    await draw()
    const names = screen.getAllByRole('textbox', { name: /센 수량$/ }).map((input) => input.getAttribute('aria-label')!.replace(/ 센 수량$/, ''))
    expect(names).toEqual(SHOWN)
    expect(screen.queryByText('주사기 5cc')).toBeNull()
  })

  it('AC-7507.1: 분류 머리 줄(이름 + n개)이 그 분류 물품 앞에 온다', async () => {
    await draw()
    const groups = screen.getAllByRole('columnheader').filter((th) => th.getAttribute('scope') === 'colgroup')
    expect(groups.map((th) => th.textContent)).toEqual(['약품3개', '치료 소모품2개'])
  })

  it('AC-7507.1: 줄마다 이름 · 단위 · 지난 수량(없으면 –) · 그 뒤 들어옴(+n, 없으면 –)', async () => {
    await draw()
    expect(cellTexts(rowOf('리도카인 주사 2% 20mL')).slice(0, 4)).toEqual(['리도카인 주사 2% 20mL', '병', '26', '–'])
    expect(cellTexts(rowOf('트리암시놀론 주사 40mg')).slice(0, 4)).toEqual(['트리암시놀론 주사 40mg', '병', '5', '+10'])
    expect(cellTexts(rowOf('주사기 3cc')).slice(0, 4)).toEqual(['주사기 3cc', '개', '1,240', '–'])
    expect(cellTexts(rowOf('반깁스 재료 4인치')).slice(0, 4)).toEqual(['반깁스 재료 4인치', '개', '–', '+8'])
  })

  it('AC-7507.1: 센 수량 칸은 비어 있고 placeholder "그대로", 유통기한 칸은 지금 값(없으면 빈칸)', async () => {
    await draw()
    for (const name of SHOWN) {
      expect(countInput(name).value).toBe('')
      expect(countInput(name).placeholder).toBe('그대로')
      expect(countInput(name).inputMode).toBe('numeric')
      expect(expiryInput(name).type).toBe('date')
    }
    expect(expiryInput('리도카인 주사 2% 20mL').value).toBe('2026-12-05')
    expect(expiryInput('히알루론산 주사 2mL').value).toBe('2027-03-31')
    expect(expiryInput('주사기 3cc').value).toBe('')
  })

  it('AC-7507.1: 센 수량 칸은 숫자만 받는다', async () => {
    await draw()
    type(countInput('주사기 3cc'), '1,2a3')
    expect(countInput('주사기 3cc').value).toBe('123')
  })

  it('AC-7507.1: 물품·마지막 세기 날짜를 읽고(분류 넣기는 기본), 읽기 실패면 E-INV-READ-FAILED 카드와 [다시 읽기]', async () => {
    load.mockResolvedValueOnce('failed')
    render(<CountTool today={TODAY} />)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-READ-FAILED')
    expect(screen.queryByRole('table')).toBeNull()
    expect(load).toHaveBeenCalledWith()
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await screen.findByRole('table')
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7507.1: 마지막 세기 날짜 읽기가 실패해도 E-INV-READ-FAILED 카드다', async () => {
    lastDay.mockResolvedValueOnce('failed')
    render(<CountTool today={TODAY} />)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-READ-FAILED')
  })

  it('AC-7507.1: reloadKey가 바뀌면 다시 읽는다', async () => {
    const { view } = await draw({ reloadKey: 1 })
    expect(load).toHaveBeenCalledTimes(1)
    view.rerender(<CountTool today={TODAY} reloadKey={2} />)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await screen.findByRole('table')
  })
})

describe('AC-7507.2: 지금 수량보다 많이 센 줄 — 경고와 [입고 적기]', () => {
  it('AC-7507.2: countWarning 글이 그 줄 바로 아래에 [입고 적기]와 함께 나온다', async () => {
    await draw()
    type(countInput('반깁스 재료 4인치'), '18')
    const warning = warningOf('반깁스 재료 4인치')!
    expect(warning).toBeTruthy()
    expect(warning.textContent).toContain('센 수량 18이 지난 수량 0 + 들어온 8 = 8보다 많아요. 입고 기록이 빠졌을 수 있어요.')
    expect(warning.closest('tr')!.previousElementSibling).toBe(rowOf('반깁스 재료 4인치'))
    expect(within(warning as HTMLElement).getByRole('button', { name: '입고 적기' })).toBeTruthy()
    expect(countInput('반깁스 재료 4인치').getAttribute('aria-invalid')).toBeNull()
  })

  it('AC-7507.2: 지난 수량 + 그 뒤 들어옴 이하로 센 줄은 경고가 없다', async () => {
    await draw()
    type(countInput('트리암시놀론 주사 40mg'), '15')
    type(countInput('리도카인 주사 2% 20mL'), '3')
    expect(warningOf('트리암시놀론 주사 40mg')).toBeNull()
    expect(warningOf('리도카인 주사 2% 20mL')).toBeNull()
    expect(screen.queryByRole('button', { name: '입고 적기' })).toBeNull()
  })

  it('AC-7507.2: 칸을 다시 줄이거나 비우면 경고가 사라진다', async () => {
    await draw()
    type(countInput('트리암시놀론 주사 40mg'), '16')
    expect(warningOf('트리암시놀론 주사 40mg')!.textContent).toContain('센 수량 16이 지난 수량 5 + 들어온 10 = 15보다 많아요.')
    type(countInput('트리암시놀론 주사 40mg'), '')
    expect(warningOf('트리암시놀론 주사 40mg')).toBeNull()
  })

  it('AC-7507.2: [입고 적기]는 onManualReceipt를 부른다', async () => {
    const calls = await draw()
    type(countInput('트리암시놀론 주사 40mg'), '20')
    fireEvent.click(screen.getByRole('button', { name: '입고 적기' }))
    expect(calls.onManualReceipt).toHaveBeenCalledTimes(1)
  })

  it('AC-7507.2: 경고가 있어도 저장은 막지 않는다', async () => {
    await draw()
    type(countInput('트리암시놀론 주사 40mg'), '20')
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())
    await waitFor(() => expect(save).toHaveBeenCalledWith(TODAY, [{ itemId: 'i-tri', qty: 20 }]))
  })
})

describe('AC-7507.3: 아래 붙는 줄과 [저장]', () => {
  it('AC-7507.3: 바꾼 줄이 없으면 "n개 가운데 0개"이고 [저장]은 꺼져 있다', async () => {
    await draw()
    expect(fill()).toBe('5개 가운데 0개 적었어요 · 비운 5개는 그대로예요')
    expect(saveButton().disabled).toBe(true)
  })

  it('AC-7507.3: 적은 칸 수를 세어 보이고 [저장]이 켜진다', async () => {
    await draw()
    type(countInput('리도카인 주사 2% 20mL'), '24')
    type(countInput('주사기 3cc'), '1100')
    expect(fill()).toBe('5개 가운데 2개 적었어요 · 비운 3개는 그대로예요')
    expect(saveButton().disabled).toBe(false)
  })

  it('AC-7507.3: 기한만 바꾼 줄도 [저장]을 켠다(적은 수는 그대로 0개)', async () => {
    await draw()
    type(expiryInput('주사기 3cc'), '2028-09-30')
    expect(fill()).toBe('5개 가운데 0개 적었어요 · 비운 5개는 그대로예요')
    expect(saveButton().disabled).toBe(false)
  })

  it('AC-7507.3: 기한을 바꿨다가 처음 값으로 되돌리면 바꾼 줄이 아니다', async () => {
    await draw()
    type(expiryInput('리도카인 주사 2% 20mL'), '2027-01-31')
    type(expiryInput('리도카인 주사 2% 20mL'), '2026-12-05')
    expect(saveButton().disabled).toBe(true)
  })

  it('AC-7507.3: [저장]은 바꾼 줄만 고른 날짜로 saveCount에 보낸다(수량·기한은 바꾼 열쇠만, 기한 비움은 null)', async () => {
    await draw()
    type(dayInput(), '2026-11-20')
    type(countInput('리도카인 주사 2% 20mL'), '24')
    type(expiryInput('리도카인 주사 2% 20mL'), '2027-01-31')
    type(countInput('주사기 3cc'), '0')
    type(expiryInput('히알루론산 주사 2mL'), '')
    type(expiryInput('반깁스 재료 4인치'), '2028-02-28')
    fireEvent.click(saveButton())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith('2026-11-20', [
      { itemId: 'i-lido', qty: 24, expiry: '2027-01-31' },
      { itemId: 'i-hya', expiry: null },
      { itemId: 'i-syr3', qty: 0 },
      { itemId: 'i-cast', expiry: '2028-02-28' },
    ])
  })

  it('AC-7507.3: 성공하면 다시 읽어 새 지금 수량으로 그리고 칸을 비우며 onChanged를 부른다', async () => {
    const calls = await draw()
    const after: InvInventory = {
      categories: CATEGORIES,
      items: ITEMS.map((it) => (it.id === 'i-lido' ? { ...it, qty: 24, lastCountQty: 24, lastCountedAt: '2026-11-21T01:00:00.000Z' } : it)),
    }
    load.mockResolvedValueOnce(after)
    lastDay.mockResolvedValueOnce(TODAY)
    type(countInput('리도카인 주사 2% 20mL'), '24')
    fireEvent.click(saveButton())
    await waitFor(() => expect(cellTexts(rowOf('리도카인 주사 2% 20mL'))[2]).toBe('24'))
    expect(countInput('리도카인 주사 2% 20mL').value).toBe('')
    expect(fill()).toBe('5개 가운데 0개 적었어요 · 비운 5개는 그대로예요')
    expect(dayInput().min).toBe(TODAY)
    expect(load).toHaveBeenCalledTimes(2)
    expect(calls.onChanged).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7507.3: 실패하면 적은 값은 그대로 두고 E-INV-SAVE-FAILED 카드와 [다시 저장]', async () => {
    const calls = await draw()
    save.mockResolvedValueOnce('failed')
    type(countInput('리도카인 주사 2% 20mL'), '24')
    type(expiryInput('주사기 3cc'), '2028-09-30')
    fireEvent.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(countInput('리도카인 주사 2% 20mL').value).toBe('24')
    expect(expiryInput('주사기 3cc').value).toBe('2028-09-30')
    expect(saveButton().textContent).toBe('다시 저장')
    expect(calls.onChanged).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(1)

    fireEvent.click(saveButton())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(calls.onChanged).toHaveBeenCalledTimes(1)
  })

  it('AC-7507.3: 저장하는 동안에는 다시 눌러도 한 번만 보낸다', async () => {
    await draw()
    let finish: (value: 'ok') => void = () => undefined
    save.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    type(countInput('주사기 3cc'), '1000')
    fireEvent.click(saveButton())
    expect(saveButton().getAttribute('aria-busy')).toBe('true')
    fireEvent.click(saveButton())
    expect(save).toHaveBeenCalledTimes(1)
    finish('ok')
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBeNull())
  })

  it('AC-7507.3: 센 날이 마지막 세기 날짜보다 앞이거나 오늘 뒤면 보내지 않고 E-INV-COUNT-DATE 카드', async () => {
    await draw()
    type(countInput('주사기 3cc'), '1000')
    type(dayInput(), '2026-11-13')
    fireEvent.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-COUNT-DATE')
    type(dayInput(), '2026-11-22')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-INV-COUNT-DATE')
    type(dayInput(), '')
    fireEvent.click(saveButton())
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-INV-COUNT-DATE')
    expect(save).not.toHaveBeenCalled()
    expect(countInput('주사기 3cc').value).toBe('1000')

    type(dayInput(), LAST)
    fireEvent.click(saveButton())
    await waitFor(() => expect(save).toHaveBeenCalledWith(LAST, [{ itemId: 'i-syr3', qty: 1000 }]))
  })
})

describe('AC-7507.4: [세기 종이 인쇄] → 미리 보기', () => {
  it('AC-7507.4: 누르면 세기 표 대신 "세기 종이 미리 보기"(같은 물품·차례, 병원 이름·오늘 날짜)가 나온다', async () => {
    await draw()
    fireEvent.click(screen.getByRole('button', { name: '세기 종이 인쇄' }))
    expect(screen.getByRole('heading', { level: 2, name: '세기 종이 미리 보기' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '수량 세기' })).toBeNull()
    const paper = screen.getByRole('article', { name: '세기 종이' })
    const names = within(paper)
      .getAllByRole('row')
      .filter((row) => row.hasAttribute('data-item'))
      .map((row) => within(row).getAllByRole('cell')[0].textContent)
    expect(names).toEqual(SHOWN)
    expect(within(paper).getByText(/^튼튼정형외과의원 · 인쇄 2026-11-21 · /)).toBeTruthy()
  })

  it('AC-7507.4: [세기로 돌아가기]는 적던 값을 그대로 둔 세기 표로 돌아간다', async () => {
    await draw()
    type(countInput('주사기 3cc'), '1100')
    fireEvent.click(screen.getByRole('button', { name: '세기 종이 인쇄' }))
    fireEvent.click(screen.getByRole('button', { name: '세기로 돌아가기' }))
    expect(screen.getByRole('heading', { level: 2, name: '수량 세기' })).toBeTruthy()
    expect(countInput('주사기 3cc').value).toBe('1100')
  })

  it('AC-7507.4: 미리 보기의 [인쇄]는 window.print()', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    await draw()
    fireEvent.click(screen.getByRole('button', { name: '세기 종이 인쇄' }))
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }))
    expect(print).toHaveBeenCalledTimes(1)
  })
})
