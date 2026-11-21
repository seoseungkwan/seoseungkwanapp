// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { addItem, deleteAlias, listAliases, updateItem } from '@/lib/storage/inventory'
import type { InvCategory, InvItem } from '@/types/inventory'
import { ItemForm } from './ItemForm'

// 물품 더하기·고치기 판 (spec inventory REQ-7506 AC-7506.2, REQ-7514 AC-7514.5, design.md 6절, 시안 ?s=edit).
// 저장 모듈은 가짜다. 물품·숫자는 지어낸 예시
vi.mock('@/lib/storage/inventory', () => ({
  addItem: vi.fn(),
  updateItem: vi.fn(),
  listAliases: vi.fn(),
  deleteAlias: vi.fn(),
}))

const add = vi.mocked(addItem)
const update = vi.mocked(updateItem)
const aliases = vi.mocked(listAliases)
const unalias = vi.mocked(deleteAlias)

const TODAY = '2026-11-21'
const CATS: InvCategory[] = [
  { id: 'c-sup', name: '치료 소모품', sortOrder: 1 },
  { id: 'c-med', name: '약품', sortOrder: 0 },
  { id: 'c-ort', name: '보조기·깁스', sortOrder: 2 },
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
const HA = make({
  id: 'i-ha',
  categoryId: 'c-med',
  name: '히알루론산 주사 2mL',
  sortOrder: 0,
  qty: 4,
  lastCountQty: 4,
  minQty: 10,
  expiry: '2027-03-31',
  vendor: '한빛약품',
  unitPrice: 18500,
  bitCode: 'XH0201',
})
const SYR5 = make({ id: 'i-syr5', categoryId: 'c-sup', name: '주사기 5cc', sortOrder: 1, hidden: true })
const GAUZE = make({ id: 'i-gauze', categoryId: 'c-sup', name: '멸균 거즈', unit: '봉', sortOrder: 2, qty: 22 })
const ITEMS = [HA, SYR5, GAUZE]

beforeEach(() => {
  add.mockResolvedValue({ id: 'i-new' })
  update.mockResolvedValue('ok')
  aliases.mockResolvedValue([
    { alias: '히알루론산나트륨주 2ml', itemId: 'i-ha' },
    { alias: 'ha 주사 2ml', itemId: 'i-ha' },
    { alias: '거즈 4x4', itemId: 'i-gauze' },
  ])
  unalias.mockResolvedValue('ok')
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function openAdd() {
  const onDone = vi.fn()
  render(<ItemForm mode="add" categories={CATS} items={ITEMS} today={TODAY} onDone={onDone} />)
  return { onDone, user: userEvent.setup(), dialog: screen.getByRole('dialog', { name: '물품 더하기' }) }
}
async function openEdit(item: InvItem = HA) {
  const onDone = vi.fn()
  render(<ItemForm mode="edit" item={item} categories={CATS} items={ITEMS} today={TODAY} onDone={onDone} />)
  const dialog = screen.getByRole('dialog', { name: '물품 고치기' })
  await waitFor(() => expect(aliases).toHaveBeenCalled())
  await act(async () => {})
  return { onDone, user: userEvent.setup(), dialog }
}

const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement
const NAME = '물품 이름 필수'
const UNIT = '단위 필수'
const MIN = '최소 수량 선택'
const QTY = '지금 수량 선택'
const VENDOR = '거래처 선택'
const PRICE = '단가 선택'
const expiryBox = () => screen.getByLabelText('가장 빠른 유통기한 선택') as HTMLInputElement
const category = () => screen.getByRole('combobox', { name: '분류' }) as HTMLSelectElement
const button = (name: string) => screen.getByRole('button', { name })
const errorOf = (name: string) => {
  const input = box(name)
  const id = input.getAttribute('aria-describedby') ?? ''
  return id
    .split(/\s+/)
    .map((part) => document.getElementById(part))
    .filter((el) => el !== null && tokens(el).includes('text-negative'))
    .map((el) => el!.textContent)
    .join('')
}
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

describe('AC-7506.2 물품 더하기 판', () => {
  it('AC-7506.2: 제목 "물품 더하기", 칸(이름·분류·단위·최소 수량·지금 수량·유통기한·거래처·단가)과 [취소]·[저장], 고치기 칸(맞춘 이름·안 씀·비트 코드)은 없다', () => {
    openAdd()
    expect(box(NAME).value).toBe('')
    expect(category().value).toBe('c-med') // 분류 차례 첫째
    expect([...category().options].map((o) => o.textContent)).toEqual(['약품', '치료 소모품', '보조기·깁스'])
    for (const name of [UNIT, MIN, QTY, VENDOR, PRICE]) expect(box(name).value).toBe('')
    expect(expiryBox().type).toBe('date')
    expect(screen.getByText('하나만 써요. 세기·입고 수량이 모두 이 단위예요.')).toBeTruthy()
    expect(screen.getByText("이보다 적으면 '주문하세요'. 비우면 알림이 없어요.")).toBeTruthy()
    expect(screen.getByText("30일 안으로 다가오면 '기한 가까움'이 떠요.")).toBeTruthy()
    expect(screen.queryByText('수량은 [세기]에서 고쳐요.')).toBeNull()
    expect(screen.queryByText('명세서에서 맞춘 이름')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('비트 코드')).toBeNull()
    expect(aliases).not.toHaveBeenCalled()
    expect(button('취소')).toBeTruthy()
    expect(tokens(button('저장'))).toEqual(expect.arrayContaining(ds.button.primary.split(/\s+/)))
  })

  it('AC-7506.2: 이름·단위가 비면 칸 아래 오류 글이고 보내지 않는다', async () => {
    const { user, onDone } = openAdd()
    await user.click(button('저장'))
    expect(errorOf(NAME)).toBe('물품 이름을 적어 주세요')
    expect(errorOf(UNIT)).toBe('단위를 적어 주세요')
    expect(box(NAME).getAttribute('aria-invalid')).toBe('true')
    expect(add).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('AC-7506.2: 이름 41자·단위 11자는 오류 글(40자·10자까지)이다', async () => {
    const { user } = openAdd()
    fireEvent.change(box(NAME), { target: { value: '가'.repeat(41) } })
    fireEvent.change(box(UNIT), { target: { value: '나'.repeat(11) } })
    await user.click(button('저장'))
    expect(errorOf(NAME)).toBe('물품 이름은 40자까지 적어요')
    expect(errorOf(UNIT)).toBe('단위는 10자까지 적어요')
    expect(add).not.toHaveBeenCalled()
    fireEvent.change(box(NAME), { target: { value: '가'.repeat(40) } })
    fireEvent.change(box(UNIT), { target: { value: '나'.repeat(10) } })
    await user.click(button('저장'))
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('AC-7506.2: 수가 0~1,000,000 정수가 아니면(소수·음수·글자·넘침) 칸 아래 오류 글이고 보내지 않는다', async () => {
    const { user } = openAdd()
    await user.type(box(NAME), '테이핑 테이프 5cm')
    await user.type(box(UNIT), '개')
    for (const bad of ['1.5', '-1', '열', '1000001']) {
      fireEvent.change(box(MIN), { target: { value: bad } })
      fireEvent.change(box(QTY), { target: { value: bad } })
      await user.click(button('저장'))
      expect(errorOf(MIN)).toBe('0부터 1,000,000까지 정수로 적어요')
      expect(errorOf(QTY)).toBe('0부터 1,000,000까지 정수로 적어요')
    }
    fireEvent.change(box(PRICE), { target: { value: '100000001' } })
    fireEvent.change(box(MIN), { target: { value: '1,000,000' } })
    fireEvent.change(box(QTY), { target: { value: '0' } })
    await user.click(button('저장'))
    expect(errorOf(PRICE)).toBe('0부터 100,000,000까지 정수로 적어요')
    expect(errorOf(MIN)).toBe('')
    expect(add).not.toHaveBeenCalled()
  })

  it('AC-7506.2: 겹치는 이름(안 쓰는 물품 포함, 앞뒤·여러 빈칸·영문 대소문자 무시)은 "같은 이름 물품이 있어요(안 쓰는 물품 포함)"다', async () => {
    const { user } = openAdd()
    await user.type(box(NAME), '  주사기   5CC ')
    await user.type(box(UNIT), '개')
    await user.click(button('저장'))
    expect(errorOf(NAME)).toBe('같은 이름 물품이 있어요(안 쓰는 물품 포함)')
    expect(add).not.toHaveBeenCalled()
  })

  it('AC-7506.2: 저장하면 칸(앞뒤 빈칸 뗌·빈 칸은 null·쉼표 뗀 수)과 지금 수량·오늘로 addItem을 부르고 onDone(true)', async () => {
    const { user, onDone } = openAdd()
    await user.type(box(NAME), ' 테이핑 테이프 5cm ')
    await user.selectOptions(category(), 'c-sup')
    await user.type(box(UNIT), '개')
    await user.type(box(MIN), '10')
    await user.type(box(QTY), '12')
    fireEvent.change(expiryBox(), { target: { value: '2027-08-31' } })
    await user.type(box(VENDOR), ' 메디팜 ')
    await user.type(box(PRICE), '4,500')
    await user.click(button('저장'))
    expect(add).toHaveBeenCalledWith(
      { categoryId: 'c-sup', name: '테이핑 테이프 5cm', unit: '개', minQty: 10, expiry: '2027-08-31', vendor: '메디팜', unitPrice: 4500 },
      12,
      TODAY,
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true))
  })

  it('AC-7506.2: 선택 칸을 비우면 null로 보내고 지금 수량도 null(세기 없음)이다', async () => {
    const { user } = openAdd()
    await user.type(box(NAME), '핸드타월')
    await user.type(box(UNIT), '박스')
    await user.click(button('저장'))
    expect(add).toHaveBeenCalledWith(
      { categoryId: 'c-med', name: '핸드타월', unit: '박스', minQty: null, expiry: null, vendor: null, unitPrice: null },
      null,
      TODAY,
    )
  })

  it('AC-7506.2: 저장 쪽이 이름 겹침(duplicate)이라 하면 이름 칸 아래 그 글이고 판은 열려 있다', async () => {
    add.mockResolvedValue('duplicate')
    const { user, onDone } = openAdd()
    await user.type(box(NAME), '새 물품')
    await user.type(box(UNIT), '개')
    await user.click(button('저장'))
    await waitFor(() => expect(errorOf(NAME)).toBe('같은 이름 물품이 있어요(안 쓰는 물품 포함)'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('AC-7506.2: 저장이 실패하면 적은 값은 그대로, 오류 카드(E-INV-SAVE-FAILED)와 [다시 저장]이다', async () => {
    add.mockResolvedValueOnce('failed')
    const { user, onDone } = openAdd()
    await user.type(box(NAME), '새 물품')
    await user.type(box(UNIT), '개')
    await user.click(button('저장'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(box(NAME).value).toBe('새 물품')
    await user.click(button('다시 저장'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true))
    expect(add).toHaveBeenCalledTimes(2)
  })

  it('AC-7506.2: 물품은 들어가고 처음 수량만 실패하면(countFailed) 판을 닫고 다시 읽게 onDone(true, "물품은 더했어요. 처음 수량은 [세기]에서 적어 주세요.")', async () => {
    add.mockResolvedValue({ id: 'i-new', countFailed: true })
    const { user, onDone } = openAdd()
    await user.type(box(NAME), '핫팩')
    await user.type(box(UNIT), '개')
    await user.type(box(QTY), '12')
    await user.click(button('저장'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true, '물품은 더했어요. 처음 수량은 [세기]에서 적어 주세요.'))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7506.2: [취소]·닫기·Esc는 보내지 않고 onDone(false)', async () => {
    const { user, onDone } = openAdd()
    await user.click(button('취소'))
    expect(onDone).toHaveBeenLastCalledWith(false)
    await user.click(button('닫기'))
    await user.keyboard('{Escape}')
    expect(onDone).toHaveBeenCalledTimes(3)
    expect(onDone.mock.calls.every(([changed]) => changed === false)).toBe(true)
    expect(add).not.toHaveBeenCalled()
  })
})

describe('AC-7506.2 물품 고치기 판', () => {
  it('AC-7506.2: 제목 "물품 고치기", 지금 값이 든 칸, 지금 수량은 읽기만("수량은 [세기]에서 고쳐요")', async () => {
    await openEdit()
    expect(box(NAME).value).toBe('히알루론산 주사 2mL')
    expect(category().value).toBe('c-med')
    expect(box(UNIT).value).toBe('개')
    expect(box(MIN).value).toBe('10')
    expect(expiryBox().value).toBe('2027-03-31')
    expect(box(VENDOR).value).toBe('한빛약품')
    expect(box(PRICE).value).toBe('18,500')
    expect(screen.queryByRole('textbox', { name: QTY })).toBeNull()
    expect(screen.getByText('4개')).toBeTruthy()
    expect(screen.getByText('수량은 [세기]에서 고쳐요.')).toBeTruthy()
  })

  it('AC-7506.2: 판 아래 "명세서에서 맞춘 이름" 목록(그 물품 것만)과 [지우기] — 누르면 deleteAlias로 지우고 목록에서 뺀다', async () => {
    const { user, onDone } = await openEdit()
    const list = screen.getByRole('list', { name: '명세서에서 맞춘 이름' })
    expect(within(list).getAllByRole('listitem').map((li) => li.firstChild?.textContent)).toEqual(['히알루론산나트륨주 2ml', 'ha 주사 2ml'])
    expect(screen.getByText('다음 명세서에 이 이름이 있으면 이 물품으로 골라요.')).toBeTruthy()
    await user.click(within(list).getByRole('button', { name: 'ha 주사 2ml 지우기' }))
    expect(unalias).toHaveBeenCalledWith('ha 주사 2ml')
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1))
    // 지운 것은 이미 저장됐다 → 칸을 안 고치고 닫아도 바뀐 것이 있다
    await user.click(button('취소'))
    expect(onDone).toHaveBeenCalledWith(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('AC-7506.2: 맞춘 이름 지우기가 실패하면 그 줄은 남고 오류 카드(E-INV-SAVE-FAILED)다', async () => {
    unalias.mockResolvedValue('failed')
    const { user } = await openEdit()
    const list = screen.getByRole('list', { name: '명세서에서 맞춘 이름' })
    await user.click(within(list).getByRole('button', { name: 'ha 주사 2ml 지우기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })

  it('AC-7506.2: 맞춘 이름이 없으면 "아직 없어요", 읽기 실패면 오류 카드(E-INV-READ-FAILED)와 [다시 읽기]', async () => {
    aliases.mockResolvedValueOnce('failed')
    const { user } = await openEdit(GAUZE)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-READ-FAILED')
    aliases.mockResolvedValueOnce([])
    await user.click(button('다시 읽기'))
    expect(await screen.findByText('아직 없어요.')).toBeTruthy()
  })

  it("AC-7506.2: 판 맨 아래 '안 씀' 체크 상자 — 체크하고 저장하면 hidden만 보낸다", async () => {
    const { user, onDone } = await openEdit()
    const hide = screen.getByRole('checkbox', { name: /안 씀/ }) as HTMLInputElement
    expect(hide.checked).toBe(false)
    expect(screen.getByText('목록·세기·알림에서 숨겨요. 지난 기록은 그대로 남아요.')).toBeTruthy()
    await user.click(hide)
    await user.click(button('저장'))
    expect(update).toHaveBeenCalledWith('i-ha', { hidden: true })
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true))
  })

  it('AC-7506.2: 바꾼 칸만 updateItem으로 보낸다(이름·분류·최소 수량 비움·유통기한 비움·단가)', async () => {
    const { user } = await openEdit()
    fireEvent.change(box(NAME), { target: { value: '히알루론산 주사 2mL(새 포장)' } })
    await user.selectOptions(category(), 'c-sup')
    await user.clear(box(MIN))
    fireEvent.change(expiryBox(), { target: { value: '' } })
    fireEvent.change(box(PRICE), { target: { value: '19,000' } })
    await user.click(button('저장'))
    expect(update).toHaveBeenCalledWith('i-ha', {
      name: '히알루론산 주사 2mL(새 포장)',
      categoryId: 'c-sup',
      minQty: null,
      expiry: null,
      unitPrice: 19000,
    })
  })

  it('AC-7506.2: 고치기의 이름 겹침은 자기 자신을 빼고 본다, 아무것도 안 바꾸고 저장하면 보내지 않고 onDone(false)', async () => {
    const { user, onDone } = await openEdit()
    fireEvent.change(box(NAME), { target: { value: '히알루론산 주사 2ML' } })
    await user.click(button('저장'))
    expect(update).toHaveBeenCalledWith('i-ha', { name: '히알루론산 주사 2ML' })
    cleanup()
    update.mockClear()
    const again = await openEdit()
    await again.user.click(button('저장'))
    expect(update).not.toHaveBeenCalled()
    expect(again.onDone).toHaveBeenCalledWith(false)
    expect(onDone).toHaveBeenCalledWith(true)
  })

  it('AC-7506.2: 고치기에서 이름이 그대로(제 옛 이름과 normalizeName이 같음)면 겹침을 보지 않는다 — 이름이 같아 보이는 다른 물품이 이미 있어도 다른 칸을 고친다', async () => {
    // 예전에 들어간 같은 이름(영문 대소문자만 다름)의 안 쓰는 물품
    const twin = make({ id: 'i-ha-old', categoryId: 'c-med', name: '히알루론산 주사 2ML', sortOrder: 3, hidden: true })
    const onDone = vi.fn()
    render(<ItemForm mode="edit" item={HA} categories={CATS} items={[...ITEMS, twin]} today={TODAY} onDone={onDone} />)
    await waitFor(() => expect(aliases).toHaveBeenCalled())
    await act(async () => {})
    const user = userEvent.setup()
    fireEvent.change(box(MIN), { target: { value: '5' } })
    await user.click(button('저장'))
    expect(errorOf(NAME)).toBe('')
    expect(update).toHaveBeenCalledWith('i-ha', { minQty: 5 })
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true))
    // 빈칸만 다르게 고쳐도(normalizeName이 같음) 겹침을 보지 않고 보낸다(DB가 마지막으로 본다)
    cleanup()
    update.mockClear()
    render(<ItemForm mode="edit" item={HA} categories={CATS} items={[...ITEMS, twin]} today={TODAY} onDone={onDone} />)
    await act(async () => {})
    fireEvent.change(box(NAME), { target: { value: '히알루론산  주사 2mL' } })
    await userEvent.setup().click(button('저장'))
    expect(errorOf(NAME)).toBe('')
    expect(update).toHaveBeenCalledWith('i-ha', { name: '히알루론산  주사 2mL' })
  })

  it('AC-7506.2: 고치기에서 다른 물품(안 쓰는 물품 포함) 이름이면 겹침 오류다', async () => {
    const { user } = await openEdit()
    fireEvent.change(box(NAME), { target: { value: '주사기 5cc' } })
    await user.click(button('저장'))
    expect(errorOf(NAME)).toBe('같은 이름 물품이 있어요(안 쓰는 물품 포함)')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('AC-7514.5 비트 코드 줄과 [연결 끊기]', () => {
  it('AC-7514.5: 비트 코드가 있는 물품은 코드가 읽기만으로 보이고 [연결 끊기]를 누르면 bit_code만 비운다', async () => {
    const { user, onDone } = await openEdit()
    const field = screen.getByText('비트 코드').closest('[data-field]') as HTMLElement
    expect(within(field).getByText('XH0201')).toBeTruthy()
    expect(within(field).queryByRole('textbox')).toBeNull()
    expect(within(field).getByText('[비트 코드에서 고르기]로 이어진 코드예요. 끊으면 그 목록에서 다시 고를 수 있어요.')).toBeTruthy()
    await user.click(within(field).getByRole('button', { name: '연결 끊기' }))
    expect(update).toHaveBeenCalledWith('i-ha', { bitCode: null })
    await waitFor(() => expect(screen.queryByText('XH0201')).toBeNull())
    await user.click(button('취소'))
    expect(onDone).toHaveBeenCalledWith(true)
  })

  it('AC-7514.5: [연결 끊기]가 실패하면 코드는 그대로이고 오류 카드(E-INV-SAVE-FAILED)다', async () => {
    update.mockResolvedValue('failed')
    const { user } = await openEdit()
    await user.click(button('연결 끊기'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(screen.getByText('XH0201')).toBeTruthy()
  })

  it('AC-7514.5: 비트 코드가 없는 물품은 비트 코드 줄이 없다', async () => {
    await openEdit(GAUZE)
    expect(screen.queryByText('비트 코드')).toBeNull()
    expect(screen.queryByRole('button', { name: '연결 끊기' })).toBeNull()
  })
})
