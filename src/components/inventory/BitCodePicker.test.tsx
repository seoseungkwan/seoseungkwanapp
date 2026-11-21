// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvBitMonth, InvCategory, InvItem } from '@/types/inventory'
import { BitCodePicker } from './BitCodePicker'

// 비트 코드에서 고르기 판 (spec inventory REQ-7514 AC-7514.4, design.md 6절 TASK-14, 시안 docs/mockups/inventory ?s=bit·bit-empty).
// 저장 모듈(lib/storage/inventory.ts)은 가짜로 바꾼다. 목록 만들기·찾기(lib/inventory/bitCodes.ts)는 진짜를 쓴다.
// 코드·이름·수는 시안처럼 지어낸 것이다(환자 정보 없음)

const store = vi.hoisted(() => ({ load: vi.fn(), months: vi.fn(), add: vi.fn() }))
vi.mock('@/lib/storage/inventory', () => ({ loadInventory: store.load, listBitCodeMonths: store.months, addBitItems: store.add }))

const CATEGORIES: InvCategory[] = [
  { id: 'c-drug', name: '약품', sortOrder: 0 },
  { id: 'c-supply', name: '치료 소모품', sortOrder: 1 },
  { id: 'c-ortho', name: '보조기·깁스', sortOrder: 2 },
  { id: 'c-office', name: '사무·생활', sortOrder: 3 },
]

const item = (over: Partial<InvItem> & Pick<InvItem, 'id' | 'name'>): InvItem => ({
  categoryId: 'c-drug',
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
// 코드로 이어진 물품(코드 글자 크기가 달라도 같은 코드) · 같은 이름의 안 쓰는 물품
const ITEMS: InvItem[] = [
  item({ id: 'i-ha', name: '히알루론산 주사', bitCode: 'xh0201' }),
  item({ id: 'i-lido', name: '리도카인염산염주 2%', hidden: true }),
]

const rx = (code: string, name: string, patients: number) => ({ code, name, type: '주사', patients, newPatients: 0, returning: patients })
const MONTHS: InvBitMonth[] = [
  { month: '2026-08', rx: [rx('XH0201', '히알루론산나트륨주 2ml', 640), rx('XE0410', '탄력붕대 4인치', 342), rx('XL0510', '리도카인 젤리 2%', 9)] },
  { month: '2026-09', rx: [] },
  {
    month: '2026-11',
    rx: [rx('XH0201', '히알루론산나트륨주 2ml', 600), rx('XL0402', '리도카인염산염주 2%', 986), rx('XE0410', '탄력붕대 4인치', 400), rx('XB1103', '반깁스(Fiberglass) 3인치', 205), rx('XE0610', '탄력붕대 6인치', 121)],
  },
]
// 많이 쓴 차례(건수 = 달마다 환자 수의 합)
const ORDER = ['히알루론산나트륨주 2ml', '리도카인염산염주 2%', '탄력붕대 4인치', '반깁스(Fiberglass) 3인치', '탄력붕대 6인치', '리도카인 젤리 2%']
const HELP = '통계에서 불러온 비트 자료(2026년 8월 ~ 11월)의 처방 코드예요. 많이 쓴 차례.'
const EMPTY = '불러온 처방 코드가 없어요. 통계에서 비트 자료를 불러오면 고를 수 있어요.'

const dialog = () => screen.getByRole('dialog', { name: '비트 코드에서 고르기' })
const search = () => screen.getByRole('searchbox', { name: '이름이나 코드로 찾기' }) as HTMLInputElement
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
const shownNames = () => screen.queryAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))
const rowOf = (name: string) => box(name).closest('tr') as HTMLTableRowElement
const addButton = () => screen.getByRole('button', { name: /개 더하기$/ }) as HTMLButtonElement
const categorySelect = () => screen.getByRole('combobox', { name: '넣을 분류' }) as HTMLSelectElement

function open() {
  const onAdded = vi.fn()
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(<BitCodePicker onAdded={onAdded} onClose={onClose} />)
  return { user, onAdded, onClose }
}
async function openReady() {
  const opened = open()
  await screen.findByRole('searchbox', { name: '이름이나 코드로 찾기' })
  return opened
}

beforeEach(() => {
  store.load.mockReset().mockResolvedValue({ categories: CATEGORIES, items: ITEMS })
  store.months.mockReset().mockResolvedValue(MONTHS)
  store.add.mockReset().mockResolvedValue('ok')
})
afterEach(cleanup)

describe('AC-7514.4 비트 코드에서 고르기 판 — 열면 보이는 것', () => {
  it('AC-7514.4: 열면 물품과 저장된 처방 코드를 한 번씩 읽고, 이름 붙은 가운데 창(dialog·aria-modal)이 뜬다', async () => {
    await openReady()
    expect(store.load).toHaveBeenCalledTimes(1)
    expect(store.months).toHaveBeenCalledTimes(1)
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    expect(within(dialog()).getByRole('heading', { level: 2, name: '비트 코드에서 고르기' })).toBeTruthy()
    expect(store.add).not.toHaveBeenCalled()
  })

  it('AC-7514.4: 위에 찾기 칸("이름이나 코드")과 출처 한 줄이 있고, 열리면 찾기 칸에 초점이 간다', async () => {
    await openReady()
    expect(search().type).toBe('search')
    expect(search().placeholder).toBe('이름이나 코드')
    expect(screen.getByText(HELP)).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(search()))
  })

  it('AC-7514.4: 표 머리는 고르기·이름·코드·쓴 건수이고, 줄은 건수 큰 차례로 체크 상자·이름·코드(muted)·"n건"이다', async () => {
    await openReady()
    const heads = within(dialog())
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(heads).toEqual(['고르기', '이름', '코드', '쓴 건수'])
    expect(shownNames()).toEqual(ORDER)
    const cells = within(rowOf('탄력붕대 4인치')).getAllByRole('cell')
    expect(cells.map((td) => td.textContent)).toEqual(['', '탄력붕대 4인치', 'XE0410', '742건'])
    expect(cells[2]!.className).toContain('text-muted')
    // 천 단위 쉼표
    expect(within(rowOf('히알루론산나트륨주 2ml')).getByText('1,240건')).toBeTruthy()
  })

  it('AC-7514.4: 물품 비트 코드(글자 크기 무시)이거나 같은 이름 물품(안 쓰는 물품 포함)이 있는 코드는 "이미 있음" 칩이고 고를 수 없다', async () => {
    const { user } = await openReady()
    for (const name of ['히알루론산나트륨주 2ml', '리도카인염산염주 2%']) {
      expect(within(rowOf(name)).getByText('이미 있음')).toBeTruthy()
      expect(box(name).disabled).toBe(true)
    }
    for (const name of ['탄력붕대 4인치', '반깁스(Fiberglass) 3인치', '탄력붕대 6인치', '리도카인 젤리 2%']) {
      expect(within(rowOf(name)).queryByText('이미 있음')).toBeNull()
      expect(box(name).disabled).toBe(false)
    }
    await user.click(box('히알루론산나트륨주 2ml'))
    expect(box('히알루론산나트륨주 2ml').checked).toBe(false)
    expect(addButton().textContent).toBe('0개 더하기')
  })

  it('AC-7514.4: 아래에 넣을 분류 고르기(분류 차례, 기본 첫 분류)와 [취소]·[0개 더하기](꺼짐)가 있다', async () => {
    await openReady()
    const select = categorySelect()
    expect([...select.options].map((o) => o.textContent)).toEqual(['약품', '치료 소모품', '보조기·깁스', '사무·생활'])
    expect(select.value).toBe('c-drug')
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy()
    expect(addButton().textContent).toBe('0개 더하기')
    expect(addButton().disabled).toBe(true)
  })
})

describe('AC-7514.4 찾기·고르기', () => {
  it('AC-7514.4: 찾기는 이름이나 코드(글자 크기·앞뒤 빈칸 무시)이고 맞는 것이 없으면 "맞는 코드가 없어요."', async () => {
    const { user } = await openReady()
    await user.type(search(), '붕대')
    expect(shownNames()).toEqual(['탄력붕대 4인치', '탄력붕대 6인치'])
    await user.clear(search())
    await user.type(search(), '  xl0  ')
    expect(shownNames()).toEqual(['리도카인염산염주 2%', '리도카인 젤리 2%'])
    expect(screen.queryByText('맞는 코드가 없어요.')).toBeNull()
    await user.clear(search())
    await user.type(search(), '없는말')
    expect(shownNames()).toEqual([])
    expect(screen.getByText('맞는 코드가 없어요.')).toBeTruthy()
    await user.clear(search())
    expect(shownNames()).toEqual(ORDER)
  })

  it('AC-7514.4: 고른 수만큼 [n개 더하기]가 켜지고, 찾기로 가려진 줄도 고른 채로 센다', async () => {
    const { user } = await openReady()
    await user.click(box('탄력붕대 4인치'))
    expect(addButton().textContent).toBe('1개 더하기')
    expect(addButton().disabled).toBe(false)
    await user.click(screen.getByText('반깁스(Fiberglass) 3인치')) // 이름 글자를 눌러도 고른다
    expect(box('반깁스(Fiberglass) 3인치').checked).toBe(true)
    expect(addButton().textContent).toBe('2개 더하기')
    await user.type(search(), '6인치')
    await user.click(box('탄력붕대 6인치'))
    expect(addButton().textContent).toBe('3개 더하기')
    await user.clear(search())
    expect(box('탄력붕대 4인치').checked).toBe(true)
    await user.click(box('탄력붕대 4인치'))
    expect(addButton().textContent).toBe('2개 더하기')
  })
})

describe('AC-7514.4 같은 이름 코드', () => {
  // 이름(normalizeName: 빈칸·영문 글자 크기 무시)이 같은 다른 코드가 있는 처방 달
  const SAME_NAME: InvBitMonth[] = [
    {
      month: '2026-11',
      rx: [rx('XE0410', '탄력붕대 4인치', 400), rx('XE0411', '탄력붕대  4인치', 120), rx('XB1103', '반깁스(Fiberglass) 3인치', 205), rx('XB1199', '반깁스(FIBERGLASS) 3인치', 30), rx('XE0610', '탄력붕대 6인치', 121)],
    },
  ]
  const codeBox = (code: string) => {
    const row = within(dialog()).getByText(code).closest('tr')
    if (row === null) throw new Error(`${code} 줄 없음`)
    return { row, box: within(row).getByRole('checkbox') as HTMLInputElement }
  }

  it('AC-7514.4: 한 코드를 고르면 이름이 같은 다른 코드는 "같은 이름 고름"이고 고를 수 없으며, 풀면 다시 고를 수 있다', async () => {
    store.months.mockResolvedValue(SAME_NAME)
    const { user } = await openReady()
    expect(within(dialog()).queryByText('같은 이름 고름')).toBeNull()
    for (const code of ['XE0410', 'XE0411', 'XB1103', 'XB1199']) expect(codeBox(code).box.disabled).toBe(false)

    await user.click(codeBox('XE0410').box)
    expect(within(codeBox('XE0411').row).getByText('같은 이름 고름')).toBeTruthy()
    expect(codeBox('XE0411').box.disabled).toBe(true)
    expect(within(codeBox('XE0410').row).queryByText('같은 이름 고름')).toBeNull()
    expect(codeBox('XE0610').box.disabled).toBe(false)
    await user.click(codeBox('XE0411').box)
    expect(codeBox('XE0411').box.checked).toBe(false)
    expect(addButton().textContent).toBe('1개 더하기')

    // 영문 글자 크기만 달라도 같은 이름
    await user.click(codeBox('XB1199').box)
    expect(within(codeBox('XB1103').row).getByText('같은 이름 고름')).toBeTruthy()
    expect(codeBox('XB1103').box.disabled).toBe(true)
    expect(addButton().textContent).toBe('2개 더하기')

    // 풀면 다시 고를 수 있다
    await user.click(codeBox('XE0410').box)
    expect(within(codeBox('XE0411').row).queryByText('같은 이름 고름')).toBeNull()
    expect(codeBox('XE0411').box.disabled).toBe(false)
    await user.click(codeBox('XE0411').box)
    expect(codeBox('XE0411').box.checked).toBe(true)
    expect(codeBox('XE0410').box.disabled).toBe(true)

    await user.click(addButton())
    await waitFor(() => expect(store.add).toHaveBeenCalledTimes(1))
    expect(store.add).toHaveBeenCalledWith('c-drug', [
      { code: 'XE0411', name: '탄력붕대 4인치' },
      { code: 'XB1199', name: '반깁스(FIBERGLASS) 3인치' },
    ])
  })
})

describe('AC-7514.4 [n개 더하기]', () => {
  it('AC-7514.4: 누르면 고른 분류에 고른 코드를 목록 차례로 한 번에 넣고(addBitItems), 성공하면 목록을 다시 읽게 알리고 판을 닫는다', async () => {
    const { user, onAdded, onClose } = await openReady()
    await user.click(box('리도카인 젤리 2%'))
    await user.click(box('탄력붕대 4인치'))
    await user.selectOptions(categorySelect(), '보조기·깁스')
    await user.click(addButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(store.add).toHaveBeenCalledTimes(1)
    expect(store.add).toHaveBeenCalledWith('c-ortho', [
      { code: 'XE0410', name: '탄력붕대 4인치' },
      { code: 'XL0510', name: '리도카인 젤리 2%' },
    ])
    expect(onAdded).toHaveBeenCalledTimes(1)
  })

  it('AC-7514.4: 기다리는 동안 단추는 aria-busy이고 다시 눌러도 한 번만 넣는다', async () => {
    let finish: (value: 'ok') => void = () => {}
    store.add.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const { user, onAdded, onClose } = await openReady()
    await user.click(box('탄력붕대 6인치'))
    await user.click(addButton())
    expect(addButton().getAttribute('aria-busy')).toBe('true')
    await user.click(addButton())
    expect(store.add).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    finish('ok')
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AC-7514.4: 저장이 실패하면 판을 닫지 않고 고른 것은 그대로 두고 오류 카드(E-INV-SAVE-FAILED)다', async () => {
    store.add.mockResolvedValue('failed')
    const { user, onAdded, onClose } = await openReady()
    await user.click(box('탄력붕대 4인치'))
    await user.click(box('탄력붕대 6인치'))
    await user.click(addButton())
    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('저장하지 못했어요')
    expect(alert.textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(onAdded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(box('탄력붕대 4인치').checked).toBe(true)
    expect(box('탄력붕대 6인치').checked).toBe(true)
    expect(addButton().textContent).toBe('2개 더하기')
    expect(addButton().disabled).toBe(false)
    expect(addButton().getAttribute('aria-busy')).not.toBe('true')
    // 다시 누르면 같은 것을 다시 넣고, 성공하면 닫는다
    store.add.mockResolvedValue('ok')
    await user.click(addButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(store.add).toHaveBeenCalledTimes(2)
    expect(store.add.mock.calls[1]).toEqual(store.add.mock.calls[0])
  })

  it('AC-7514.4: 이름이 겹쳐 실패하면(duplicate) 오류 카드는 E-INV-DUPLICATE다', async () => {
    store.add.mockResolvedValue('duplicate')
    const { user, onClose } = await openReady()
    await user.click(box('반깁스(Fiberglass) 3인치'))
    await user.click(addButton())
    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('같은 이름이 이미 있어요')
    expect(alert.textContent).toContain('오류 번호 E-INV-DUPLICATE')
    expect(onClose).not.toHaveBeenCalled()
    expect(box('반깁스(Fiberglass) 3인치').checked).toBe(true)
  })
})

describe('AC-7514.4 닫기·빈 때·읽기 실패', () => {
  it('AC-7514.4: [취소]·머리 [닫기]·Esc는 넣지 않고 판을 닫는다', async () => {
    const { user, onClose, onAdded } = await openReady()
    await user.click(box('탄력붕대 4인치'))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(within(dialog()).getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(store.add).not.toHaveBeenCalled()
    expect(onAdded).not.toHaveBeenCalled()
  })

  it('AC-7514.4: 저장된 처방 코드가 없으면 "불러온 처방 코드가 없어요. …"와 [닫기]만 있다(찾기 칸·표·더하기 없음)', async () => {
    store.months.mockResolvedValue([
      { month: '2026-10', rx: null },
      { month: '2026-11', rx: [] },
    ])
    const { user, onClose } = open()
    expect(await screen.findByText(EMPTY)).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button', { name: /개 더하기$/ })).toBeNull()
    const closes = within(dialog()).getAllByRole('button', { name: '닫기' })
    expect(closes.length).toBe(2) // 머리 X · 아래 [닫기]
    await user.click(closes[1]!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AC-7514.4: 통계 달 줄이 하나도 없어도 같은 빈 글이다', async () => {
    store.months.mockResolvedValue([])
    open()
    expect(await screen.findByText(EMPTY)).toBeTruthy()
  })

  it('AC-7514.4: 읽기가 실패하면 오류 카드(E-INV-READ-FAILED)와 [다시 읽기]이고, 누르면 다시 읽어 목록을 보인다', async () => {
    store.months.mockResolvedValueOnce('failed')
    const { user } = open()
    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-INV-READ-FAILED')
    expect(screen.queryByRole('searchbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    await screen.findByRole('searchbox', { name: '이름이나 코드로 찾기' })
    expect(store.load).toHaveBeenCalledTimes(2)
    expect(store.months).toHaveBeenCalledTimes(2)
    expect(shownNames()).toEqual(ORDER)
  })

  it('AC-7514.4: 물품 읽기가 실패해도 같은 오류 카드다', async () => {
    store.load.mockResolvedValue('failed')
    open()
    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-INV-READ-FAILED')
  })
})
