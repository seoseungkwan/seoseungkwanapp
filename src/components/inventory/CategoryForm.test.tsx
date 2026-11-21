// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addCategory, deleteCategory, renameCategory, saveCategoryOrder } from '@/lib/storage/inventory'
import type { InvCategory, InvItem } from '@/types/inventory'
import { CategoryForm } from './CategoryForm'

// 분류 고치기 판 (spec inventory REQ-7506 AC-7506.3, design.md 6절, 시안 ?s=cats). 저장 모듈은 가짜다. 이름·물품은 지어낸 예시
vi.mock('@/lib/storage/inventory', () => ({
  addCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  saveCategoryOrder: vi.fn(),
}))

const add = vi.mocked(addCategory)
const rename = vi.mocked(renameCategory)
const remove = vi.mocked(deleteCategory)
const reorder = vi.mocked(saveCategoryOrder)

// 받은 차례가 아니라 sortOrder 차례로 그린다
const CATS: InvCategory[] = [
  { id: 'c-sup', name: '치료 소모품', sortOrder: 1 },
  { id: 'c-med', name: '약품', sortOrder: 0 },
  { id: 'c-off', name: '사무·생활', sortOrder: 3 },
  { id: 'c-ort', name: '보조기·깁스', sortOrder: 2 },
]
const make = (id: string, categoryId: string, hidden = false): InvItem => ({
  id,
  categoryId,
  name: id,
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
  hidden,
  orderedAt: null,
})
// 사무·생활에는 안 쓰는 물품 하나만 있다(그래도 못 지운다). 보조기·깁스는 비었다
const ITEMS = [make('a', 'c-med'), make('b', 'c-med'), make('c', 'c-sup'), make('d', 'c-off', true)]

beforeEach(() => {
  add.mockImplementation(async (name) => ({ id: `c-new-${name}`, name, sortOrder: 9 }))
  rename.mockResolvedValue('ok')
  remove.mockResolvedValue('ok')
  reorder.mockResolvedValue('ok')
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function open() {
  const onDone = vi.fn()
  render(<CategoryForm categories={CATS} items={ITEMS} onDone={onDone} />)
  return { onDone, user: userEvent.setup(), dialog: screen.getByRole('dialog', { name: '분류 고치기' }) }
}

const rows = () => within(screen.getByRole('list', { name: '분류 차례' })).getAllByRole('listitem')
const nameBox = (n: number) => screen.getByRole('textbox', { name: `${n}번째 분류 이름` }) as HTMLInputElement
const names = () => rows().map((_, i) => nameBox(i + 1).value)
const button = (name: string) => screen.getByRole('button', { name })
const errorOf = (n: number) => {
  const id = nameBox(n).getAttribute('aria-describedby')
  return id ? (document.getElementById(id)?.textContent ?? '') : ''
}

describe('AC-7506.3 분류 고치기 판 (시안 ?s=cats)', () => {
  it('AC-7506.3: 안내 글, 분류 차례대로 번호·이름 칸·"물품 n개"(안 쓰는 물품 포함)·▲▼·지우기, [+ 분류 더하기]·[취소]·[저장]', () => {
    open()
    expect(screen.getByText('목록·세기 표·세기 종이가 이 차례로 나와요. 물품이 있는 분류는 지울 수 없어요(물품을 다른 분류로 옮긴 뒤 지워요).')).toBeTruthy()
    expect(names()).toEqual(['약품', '치료 소모품', '보조기·깁스', '사무·생활'])
    expect(rows().map((li) => within(li).getByText(/^물품 \d+개$/).textContent)).toEqual(['물품 2개', '물품 1개', '물품 0개', '물품 1개'])
    expect(within(rows()[0]).getByText('1')).toBeTruthy()
    expect(nameBox(1).maxLength).toBe(20)
    expect(button('약품 위로').getAttribute('aria-disabled')).toBe('true')
    expect(button('약품 아래로').getAttribute('aria-disabled')).toBe('false')
    expect(button('사무·생활 아래로').getAttribute('aria-disabled')).toBe('true')
    expect(button('+ 분류 더하기')).toBeTruthy()
    expect(button('취소')).toBeTruthy()
    expect(button('저장')).toBeTruthy()
  })

  it('AC-7506.3: 물품이 있는 분류(안 쓰는 물품 포함)는 지우기 단추가 꺼져 있고 눌러도 그대로다', async () => {
    const { user } = open()
    for (const name of ['약품', '치료 소모품', '사무·생활']) {
      const del = button(`${name} 지우기`)
      expect(del.getAttribute('aria-disabled')).toBe('true')
      expect(del.getAttribute('title')).toBe('물품이 있는 분류는 지울 수 없어요')
    }
    expect(button('보조기·깁스 지우기').getAttribute('aria-disabled')).toBe('false')
    await user.click(button('사무·생활 지우기'))
    expect(names()).toEqual(['약품', '치료 소모품', '보조기·깁스', '사무·생활'])
  })

  it('AC-7506.3: 바꾼 것은 [저장] 전에는 보내지 않고, [저장]하면 지우기·이름 고치기·더하기·차례를 보낸 뒤 onDone(true)', async () => {
    const { user, onDone } = open()
    await user.click(button('보조기·깁스 지우기'))
    expect(names()).toEqual(['약품', '치료 소모품', '사무·생활'])
    fireEvent.change(nameBox(2), { target: { value: ' 소모품 ' } })
    await user.click(button('+ 분류 더하기'))
    expect(document.activeElement).toBe(nameBox(4))
    await user.type(nameBox(4), '소독·위생')
    await user.click(button('소독·위생 위로'))
    expect(names()).toEqual(['약품', ' 소모품 ', '소독·위생', '사무·생활'])
    expect(remove).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    await user.click(button('저장'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true))
    expect(remove).toHaveBeenCalledWith('c-ort')
    expect(rename).toHaveBeenCalledWith('c-sup', '소모품')
    expect(rename).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith('소독·위생')
    expect(reorder).toHaveBeenCalledWith(['c-med', 'c-sup', 'c-new-소독·위생', 'c-off'])
  })

  it('AC-7506.3: ▲▼만 바꾸면 차례만 보낸다', async () => {
    const { user, onDone } = open()
    await user.click(button('사무·생활 위로'))
    await user.click(button('약품 아래로'))
    expect(names()).toEqual(['치료 소모품', '약품', '사무·생활', '보조기·깁스'])
    await user.click(button('저장'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true))
    expect(reorder).toHaveBeenCalledWith(['c-sup', 'c-med', 'c-off', 'c-ort'])
    expect(rename).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('AC-7506.3: 새 분류를 끝에 더하기만 하면 차례는 보내지 않는다(더하기가 끝에 붙인다)', async () => {
    const { user } = open()
    await user.click(button('+ 분류 더하기'))
    await user.type(nameBox(5), '소독·위생')
    await user.click(button('저장'))
    await waitFor(() => expect(add).toHaveBeenCalledWith('소독·위생'))
    expect(reorder).not.toHaveBeenCalled()
  })

  it('AC-7506.3: 더했다가 지운 새 분류는 보내지 않는다', async () => {
    const { user, onDone } = open()
    await user.click(button('+ 분류 더하기'))
    await user.click(button('5번째 분류 지우기'))
    expect(names()).toHaveLength(4)
    await user.click(button('저장'))
    expect(add).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledWith(false)
  })

  it('AC-7506.3: 이름은 1~20자, 겹치지 않음 — 어기면 칸 아래 오류 글이고 아무것도 보내지 않는다', async () => {
    const { user } = open()
    fireEvent.change(nameBox(1), { target: { value: '  ' } })
    fireEvent.change(nameBox(2), { target: { value: '가'.repeat(21) } })
    fireEvent.change(nameBox(4), { target: { value: '보조기·깁스' } })
    await user.click(button('저장'))
    expect(errorOf(1)).toBe('분류 이름을 적어 주세요')
    expect(errorOf(2)).toBe('분류 이름은 20자까지 적어요')
    expect(errorOf(3)).toBe('')
    expect(errorOf(4)).toBe('같은 이름 분류가 있어요')
    expect(nameBox(4).getAttribute('aria-invalid')).toBe('true')
    expect(rename).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(reorder).not.toHaveBeenCalled()
  })

  it('AC-7506.3: 아무것도 안 바꾸고 [저장]이나 [취소]면 보내지 않고 onDone(false)', async () => {
    const { user, onDone } = open()
    await user.click(button('저장'))
    expect(onDone).toHaveBeenLastCalledWith(false)
    await user.click(button('취소'))
    expect(onDone).toHaveBeenLastCalledWith(false)
    expect(rename).not.toHaveBeenCalled()
  })

  it('AC-7506.3: 이름 겹침(duplicate)은 E-INV-DUPLICATE 오류 카드, 판은 열려 있고 [다시 저장]이다', async () => {
    rename.mockResolvedValue('duplicate')
    const { user, onDone } = open()
    fireEvent.change(nameBox(1), { target: { value: '의약품' } })
    await user.click(button('저장'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-DUPLICATE')
    expect(onDone).not.toHaveBeenCalled()
    expect(button('다시 저장')).toBeTruthy()
  })

  it('AC-7506.3: 지우기가 in-use면 E-INV-IN-USE, 그 밖 실패는 E-INV-SAVE-FAILED 오류 카드다', async () => {
    remove.mockResolvedValueOnce('in-use')
    const { user } = open()
    await user.click(button('보조기·깁스 지우기'))
    await user.click(button('저장'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-IN-USE')
    remove.mockResolvedValueOnce('failed')
    await user.click(button('다시 저장'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-INV-SAVE-FAILED'))
  })

  it('AC-7506.3: 중간에 실패한 뒤 [다시 저장]은 이미 저장된 것을 다시 보내지 않는다, 닫으면 onDone(true)', async () => {
    reorder.mockResolvedValueOnce('failed')
    const { user, onDone } = open()
    await user.click(button('+ 분류 더하기'))
    await user.type(nameBox(5), '소독·위생')
    await user.click(button('소독·위생 위로'))
    await user.click(button('저장'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-INV-SAVE-FAILED')
    expect(add).toHaveBeenCalledTimes(1)
    await user.click(button('다시 저장'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true))
    expect(add).toHaveBeenCalledTimes(1)
    expect(reorder).toHaveBeenCalledTimes(2)
    expect(reorder).toHaveBeenLastCalledWith(['c-med', 'c-sup', 'c-ort', 'c-new-소독·위생', 'c-off'])
  })

  it('AC-7506.3: 저장 중 실패 뒤 [취소]는 이미 저장된 것이 있으면 onDone(true)', async () => {
    reorder.mockResolvedValue('failed')
    const { user, onDone } = open()
    fireEvent.change(nameBox(1), { target: { value: '의약품' } })
    // 단추 이름은 적은 이름을 따른다
    await user.click(button('의약품 아래로'))
    await user.click(button('저장'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    await act(async () => {})
    await user.click(button('취소'))
    expect(onDone).toHaveBeenCalledWith(true)
  })
})
