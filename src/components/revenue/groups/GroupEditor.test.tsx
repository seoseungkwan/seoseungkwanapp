// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { RxGroupStoreError } from '@/lib/storage/rxGroups'
import { nestedBoxes } from '@/testing/boxes'
import type { RxGroup } from '@/types/rxGroups'
import { GroupEditor } from './GroupEditor'
import { knownCodes, type KnownCode } from './known'

// 묶음 고치기 화면 (TASK-14, REQ-014 · AC-014.2~AC-014.6, 시안 gen.py group_editor()). 처방 코드·이름·금액은 모두 지어낸 값이고 환자 자료가 없다

const GROUPS: RxGroup[] = [
  { id: 'g1', name: '도수치료', codes: ['도수'], sortOrder: 0 },
  { id: 'g2', name: '체외충격파', codes: ['ESWT1', 'ESWT2'], sortOrder: 1 },
]
const KNOWN: KnownCode[] = [
  { code: '도수', name: '가짜 도수', amount: 49_812_000 },
  { code: 'ESWT1', name: '가짜 충격파 1', amount: 11_204_500 },
  { code: 'ESWT2', name: '가짜 충격파 2', amount: null },
  { code: 'HP01', name: '가짜 핫팩', amount: 1_960_000 },
  { code: 'MT101', name: '가짜 신장분사', amount: 3_120_000 },
]
const CHIP = '제안 묶음 · 아직 저장 안 함'
const INTRO_SUGGESTED = '처음에는 지금 쓰시는 일일 보고의 다섯 가지로 채워 두었어요.'
const DUPLICATE = '같은 이름의 묶음이 있어요. 다른 이름을 써 주세요.'
const SAVE_FAILED = 'E-REVENUE-GROUP-SAVE-FAILED'

type Save = (after: RxGroup[]) => Promise<RxGroup[]>

function draw(over: { groups?: RxGroup[]; known?: KnownCode[]; save?: Save } = {}) {
  const save = vi.fn<Save>(over.save ?? (async (after) => after))
  const onCancel = vi.fn()
  const onSaved = vi.fn()
  const view = render(<GroupEditor groups={over.groups ?? GROUPS} known={over.known ?? KNOWN} month="2026-10" save={save} onCancel={onCancel} onSaved={onSaved} />)
  return { save, onCancel, onSaved, user: userEvent.setup(), ...view }
}

const nameFields = () => screen.getAllByRole<HTMLInputElement>('textbox', { name: '묶음 이름' })
const row = (code: string) => screen.getByText(code).closest('li')!
const moveSelect = (code: string) => within(row(code)).getByRole<HTMLSelectElement>('combobox', { name: '옮길 묶음' })
const block = (index: number) => nameFields()[index]!.closest('section')!
const button = (name: string) => screen.getAllByRole<HTMLButtonElement>('button', { name })[0]!
const rename = (index: number, value: string) => fireEvent.change(nameFields()[index]!, { target: { value } })
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
const reasonOf = (field: HTMLElement) => document.getElementById(field.getAttribute('aria-describedby') ?? '')

afterEach(cleanup)

describe('AC-014.1 열 때 초점', () => {
  it('AC-014.1 열면 초점이 제목 줄로 간다: Tab 차례에는 없고, 붙어 있는 띠에 가리지 않으며, 코드로 옮긴 초점이라 고리가 없다', () => {
    draw()
    const title = screen.getByRole('heading', { level: 1 }).parentElement!
    expect(document.activeElement).toBe(title)
    expect(title.getAttribute('tabindex')).toBe('-1')
    expect(classesOf(title)).toEqual(expect.arrayContaining(['focus:outline-none', 'scroll-mt-25.5', 'max-md:scroll-mt-23.5']))
  })

  it('AC-014.1 제목 줄에 PC의 [취소]·[저장]이 함께 있다', () => {
    draw()
    const title = screen.getByRole('heading', { level: 1 }).parentElement!
    expect(within(title).getByRole('button', { name: '취소' })).toBeTruthy()
    expect(within(title).getByRole('button', { name: '저장' })).toBeTruthy()
  })
})

describe('AC-014.2 묶음 블록·처방 줄·그 밖 처방', () => {
  it('AC-014.2 시안 글자: 제목·안내·묶음 수·[새 묶음]·찾기 칸·안내 글', () => {
    draw()
    expect(screen.getByRole('heading', { level: 1, name: '치료 묶음 고치기' })).toBeTruthy()
    expect(screen.getByText(/^묶음 이름을 짓고, 묶음에 넣을 처방을 고르세요\. 처방 하나는 한 묶음에만 들어가요\. 어느 묶음에도 없는 처방은 '그 밖 처방'으로 세요\./)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '묶음 2개' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '새 묶음' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '그 밖 처방 2개' })).toBeTruthy()
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '처방 찾기' }).placeholder).toBe('처방 이름이나 코드로 찾기')
    expect(screen.getByText('최근 13달 동안 비트에서 나온 처방만 보여요. 처방 이름과 코드만 쓰고, 환자 정보는 없어요.')).toBeTruthy()
  })

  it('AC-014.2 묶음마다 이름 칸·처방 수·[묶음 지우기]와 처방 줄(코드·이름·고른 달 금액·옮길 묶음)', () => {
    draw()
    expect(nameFields().map((field) => field.value)).toEqual(['도수치료', '체외충격파'])
    expect(within(block(1)).getByText('처방 2개')).toBeTruthy()
    expect(within(block(1)).getByRole('button', { name: '묶음 지우기' })).toBeTruthy()

    const eswt = row('ESWT1')
    expect(block(1).contains(eswt)).toBe(true)
    expect(within(eswt).getByText('가짜 충격파 1')).toBeTruthy()
    expect(within(eswt).getByText('10월 1,120만 원')).toBeTruthy()
    expect(moveSelect('ESWT1').value).toBe('1')
    expect(Array.from(moveSelect('ESWT1').options).map((option) => option.text)).toEqual(['도수치료', '체외충격파', '묶음 없음'])
  })

  it('AC-014.2 고른 달 금액이 없으면 지어내지 않고 "–"다', () => {
    draw()
    expect(within(row('ESWT2')).getByText('10월 –')).toBeTruthy()
  })

  it('AC-014.2 폰은 금액을 숨긴다(max-md:hidden)', () => {
    draw()
    expect(classesOf(within(row('ESWT1')).getByText('10월 1,120만 원'))).toContain('max-md:hidden')
  })

  it('AC-014.2 그 밖 처방은 어느 묶음에도 없는 처방이고 금액 없이 "묶음 없음"을 고른 줄이다', () => {
    draw()
    const rest = screen.getByRole('heading', { level: 2, name: '그 밖 처방 2개' }).parentElement!.parentElement!
    expect(within(rest).getAllByRole('listitem').map((item) => item.textContent?.includes('HP01') || item.textContent?.includes('MT101'))).toEqual([true, true])
    expect(within(rest).queryByText('ESWT1')).toBeNull()
    expect(moveSelect('HP01').value).toBe('')
    expect(row('HP01').textContent).not.toContain('10월')
  })

  it('AC-014.2 찾기 칸은 그 밖 처방을 코드·이름으로 거르고(대소문자 무시) 묶음 안 줄은 건드리지 않는다', async () => {
    const { user } = draw()
    const find = screen.getByRole('textbox', { name: '처방 찾기' })
    await user.type(find, 'mt1')
    expect(screen.getByText('MT101')).toBeTruthy()
    expect(screen.queryByText('HP01')).toBeNull()
    expect(screen.getByText('ESWT1')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '그 밖 처방 2개' })).toBeTruthy()

    await user.clear(find)
    await user.type(find, '핫팩')
    expect(screen.getByText('HP01')).toBeTruthy()
    expect(screen.queryByText('MT101')).toBeNull()

    await user.clear(find)
    await user.type(find, '없는 처방')
    expect(screen.queryByText('HP01')).toBeNull()
    expect(screen.queryByText('MT101')).toBeNull()
  })

  it('AC-014.2 처방을 고르면 그 묶음으로 옮기고 수가 바뀐다. 저장은 부르지 않는다', async () => {
    const { user, save } = draw()
    await user.selectOptions(moveSelect('HP01'), '체외충격파')
    expect(block(1).contains(row('HP01'))).toBe(true)
    expect(within(block(1)).getByText('처방 3개')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '그 밖 처방 1개' })).toBeTruthy()

    await user.selectOptions(moveSelect('도수'), '체외충격파')
    expect(within(block(0)).getByText('처방 0개')).toBeTruthy()
    expect(within(block(1)).getByText('처방 4개')).toBeTruthy()

    await user.selectOptions(moveSelect('ESWT1'), '묶음 없음')
    expect(block(1).contains(row('ESWT1'))).toBe(false)
    expect(screen.getByRole('heading', { level: 2, name: '그 밖 처방 2개' })).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-014.2 13달 밖이라 목록에 없는 코드도 묶음에서 사라지지 않고 줄로 보이며 그대로 저장된다', async () => {
    const groups: RxGroup[] = [{ id: 'g1', name: '오래된 묶음', codes: ['OLD1', 'HP01'], sortOrder: 0 }]
    const { user, save } = draw({ groups })
    expect(within(row('OLD1')).getByText('–')).toBeTruthy()
    expect(within(row('OLD1')).getByText('10월 –')).toBeTruthy()
    expect(within(block(0)).getByText('처방 2개')).toBeTruthy()
    await user.click(button('저장'))
    expect(save.mock.calls[0]![0][0]!.codes).toEqual(['OLD1', 'HP01'])
  })

  it('AC-014.2 [새 묶음]은 이름 칸에 초점을 주며 끝에 더하고, 이름이 겹치지 않으며, 저장은 부르지 않는다', async () => {
    const { user, save } = draw()
    await user.click(screen.getByRole('button', { name: '새 묶음' }))
    expect(nameFields().map((field) => field.value)).toEqual(['도수치료', '체외충격파', '새 묶음'])
    expect(document.activeElement).toBe(nameFields()[2])
    expect(screen.getByRole('heading', { level: 2, name: '묶음 3개' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '새 묶음' }))
    expect(nameFields()[3]!.value).toBe('새 묶음 2')
    expect(screen.queryByText(DUPLICATE)).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-014.2 묶음이 50개면 더 만들지 않고 까닭을 말하며, 지우면 그 말이 없어진다', async () => {
    const groups = Array.from({ length: 50 }, (_, sortOrder): RxGroup => ({ id: `g${sortOrder}`, name: `묶음 ${sortOrder}`, codes: [], sortOrder }))
    const { user } = draw({ groups })
    await user.click(screen.getByRole('button', { name: '새 묶음' }))
    expect(nameFields()).toHaveLength(50)
    expect(screen.getByText('묶음은 50개까지 만들 수 있어요.')).toBeTruthy()

    await user.click(within(block(0)).getByRole('button', { name: '묶음 지우기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지우기' }))
    expect(screen.queryByText('묶음은 50개까지 만들 수 있어요.')).toBeNull()
  })
})

describe('AC-014.2 처방 목록(저장된 sales_codes 최근 13달)', () => {
  const rows = [
    { month: '2026-10', code: 'B', name: '나중 이름', count: 1, amount: 200 },
    { month: '2026-09', code: 'B', name: '옛 이름', count: 1, amount: 100 },
    { month: '2026-10', code: '_REST', name: null, count: 9, amount: 999 },
    { month: '2026-09', code: 'A', name: '가', count: 1, amount: 300 },
    { month: '2026-10', code: 'C', name: null, count: 1, amount: null },
    { month: '2026-08', code: 'C', name: '이름이 있던 달', count: 1, amount: 50 },
  ]

  it('AC-014.2 코드마다 한 줄, 가장 늦은 이름, 고른 달 금액(그 달에 없으면 null), _REST 없음', () => {
    expect(knownCodes(rows, '2026-10')).toEqual([
      { code: 'A', name: '가', amount: null },
      { code: 'B', name: '나중 이름', amount: 200 },
      { code: 'C', name: '이름이 있던 달', amount: null },
    ])
  })

  it('AC-014.2 고른 달이 바뀌면 금액만 그 달 것이다', () => {
    expect(knownCodes(rows, '2026-09').map((item) => item.amount)).toEqual([300, 100, null])
    expect(knownCodes(rows, '2026-09')[1]!.name).toBe('나중 이름')
  })

  it('AC-014.2 _REST는 묶음에 넣을 수 없어서(DB가 거부한다) 화면 목록에도 없다', () => {
    draw({ known: knownCodes(rows, '2026-10'), groups: [] })
    expect(screen.queryByText('_REST')).toBeNull()
  })
})

describe('AC-014.3 저장된 묶음이 없으면 제안 다섯 개', () => {
  const known: KnownCode[] = [...KNOWN, { code: 'CRYO', name: '가짜 냉동', amount: 100 }]

  it('AC-014.3 제안 다섯 개로 채우고 칩과 안내 끝 문장을 보이며, 코드는 규칙대로 들어가고, 저절로 저장하지 않는다', () => {
    const { save } = draw({ groups: [], known })
    expect(nameFields().map((field) => field.value)).toEqual(['도수치료', '체외충격파', 'C-arm 주사', '초음파', '냉동치료'])
    expect(screen.getByText(CHIP)).toBeTruthy()
    expect(classesOf(screen.getByText(CHIP))).toEqual(expect.arrayContaining(ds.chip.accent.split(' ')))
    expect(screen.getByText(new RegExp(INTRO_SUGGESTED))).toBeTruthy()
    expect(block(1).contains(row('ESWT1'))).toBe(true)
    expect(block(4).contains(row('CRYO'))).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-014.3 저장된 묶음이면 칩도 "처음에는 … 채워 두었어요" 문장도 없다', () => {
    draw()
    expect(screen.queryByText(CHIP)).toBeNull()
    expect(screen.queryByText(new RegExp(INTRO_SUGGESTED))).toBeNull()
  })

  it('AC-014.3 제안을 고치지 않고 [저장]해도 다섯 개가 새 줄(id 없음)로 한 번 저장된다', async () => {
    const { user, save } = draw({ groups: [], known })
    await user.click(button('저장'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0].map((group) => [group.id, group.name, group.sortOrder])).toEqual([
      [null, '도수치료', 0],
      [null, '체외충격파', 1],
      [null, 'C-arm 주사', 2],
      [null, '초음파', 3],
      [null, '냉동치료', 4],
    ])
  })
})

describe('AC-014.4 이름 칸 검사', () => {
  it.each([
    ['빈 이름', '', '묶음 이름을 써 주세요.'],
    ['공백만', '   ', '묶음 이름을 써 주세요.'],
    ['31자', '가'.repeat(31), '묶음 이름은 30자까지 쓸 수 있어요.'],
    ['겹침', '도수치료', DUPLICATE],
    ['앞뒤 공백만 다른 겹침', ' 도수치료 ', DUPLICATE],
    ['제어 문자', '가\u0007나', '줄바꿈 같은 제어 문자는 넣을 수 없어요.'],
    ['전화번호 모양', '01012345678', '숫자를 6개 이상 이어 쓸 수 없어요.'],
  ])('AC-014.4 %s → 칸 아래 이유 글(aria-describedby)·저장 안 부름·초점은 그 칸', async (_, value, reason) => {
    const { user, save, onSaved } = draw()
    rename(1, value)
    const field = nameFields()[1]!
    expect(field.getAttribute('aria-invalid')).toBe('true')
    const text = reasonOf(field)!
    expect(text.textContent).toBe(reason)
    expect(classesOf(text)).toEqual(expect.arrayContaining(ds.fieldError.split(' ')))
    expect(block(1).contains(text)).toBe(true)

    await user.click(button('저장'))
    expect(save).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(field)
  })

  it('AC-014.4 긴 이름을 붙여 넣어도 잘리지 않고 이유 글이 보인다(칸이 글자를 자르지 않는다)', async () => {
    const { user } = draw()
    const field = nameFields()[1]!
    await user.clear(field)
    await user.paste('가'.repeat(31))
    expect(field.value).toHaveLength(31)
    expect(reasonOf(field)?.textContent).toBe('묶음 이름은 30자까지 쓸 수 있어요.')
  })

  it('AC-014.4 겹치는 이름은 시안처럼 뒤쪽 칸에만 이유를 보인다. 앞 칸을 고쳐 겹쳐도 [저장]이 그 칸으로 데려간다', async () => {
    const { user, save } = draw()
    rename(1, '도수치료')
    expect(nameFields()[0]!.getAttribute('aria-invalid')).toBeNull()
    expect(screen.getAllByText(DUPLICATE)).toHaveLength(1)

    rename(1, '체외충격파')
    expect(screen.queryByText(DUPLICATE)).toBeNull()
    rename(0, '체외충격파')
    await user.click(button('저장'))
    expect(save).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(nameFields()[1])
  })

  it('AC-014.4 맞는 이름이면 이유 글이 없고, 입력은 공백까지 그대로 두었다가 앞뒤 공백을 떼어 저장한다', async () => {
    const { user, save } = draw()
    rename(1, '도수치료')
    expect(screen.getByText(DUPLICATE)).toBeTruthy()
    rename(1, ' 충격파 치료 ')
    expect(screen.queryByText(DUPLICATE)).toBeNull()
    expect(nameFields()[1]!.getAttribute('aria-invalid')).toBeNull()
    expect(nameFields()[1]!.getAttribute('aria-describedby')).toBeNull()
    expect(nameFields()[1]!.value).toBe(' 충격파 치료 ')

    await user.click(button('저장'))
    expect(save.mock.calls[0]![0][1]!.name).toBe('충격파 치료')
  })

  it('AC-014.4 30자·숫자 5개는 맞는 이름이다', async () => {
    const { user, save } = draw()
    rename(0, '가'.repeat(30))
    rename(1, '충격파12345')
    await user.click(button('저장'))
    expect(save.mock.calls[0]![0].map((group) => group.name)).toEqual(['가'.repeat(30), '충격파12345'])
  })

  it('AC-014.4 다시 저장도 이름을 먼저 본다', async () => {
    const { user, save } = draw({ save: async () => Promise.reject(new RxGroupStoreError(SAVE_FAILED)) })
    await user.click(button('저장'))
    await screen.findByRole('alert')
    rename(0, '')
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('AC-014.4 묶음 지우기 확인 창', () => {
  const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(block(1)).getByRole('button', { name: '묶음 지우기' }))
    return screen.getByRole('dialog', { name: "'체외충격파' 묶음을 지울까요?" })
  }

  it('AC-014.4 시안 글자·모양: dialog·aria-modal, 처방 수, 처음 초점은 [취소], [취소] 보조·[지우기] 위험', async () => {
    const { user, save } = draw()
    const dialog = await openDialog(user)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(within(dialog).getByText("이 묶음의 처방 2개는 '그 밖 처방'으로 가요. [저장]을 누르기 전에는 되돌릴 수 있어요.")).toBeTruthy()
    expect(classesOf(dialog)).toEqual(expect.arrayContaining(ds.layer.split(' ')))
    const [cancel, confirm] = within(dialog).getAllByRole('button')
    expect(cancel!.textContent).toBe('취소')
    expect(confirm!.textContent).toBe('지우기')
    expect(classesOf(cancel!)).toEqual(expect.arrayContaining(ds.button.secondary.split(' ')))
    expect(classesOf(confirm!)).toEqual(expect.arrayContaining(ds.button.danger.split(' ')))
    expect(document.activeElement).toBe(cancel)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-014.4 [취소]는 그대로 둔다', async () => {
    const { user } = draw()
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nameFields()).toHaveLength(2)
    expect(block(1).contains(row('ESWT1'))).toBe(true)
  })

  it('AC-014.4 Esc는 [취소]와 같고, Tab은 창 안에서만 돈다', async () => {
    const { user } = draw()
    const dialog = await openDialog(user)
    const [cancel, confirm] = within(dialog).getAllByRole('button')
    await user.tab()
    expect(document.activeElement).toBe(confirm)
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(confirm)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nameFields()).toHaveLength(2)
  })

  it('AC-014.4 끝 줄을 지우면 창을 연 단추가 없어지므로 초점은 [새 묶음]으로 간다', async () => {
    const { user } = draw()
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: '지우기' }))
    expect(nameFields()).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '새 묶음' }))
  })

  it('AC-014.4 하나뿐인 묶음을 지워도 초점은 [새 묶음]이다', async () => {
    const { user } = draw({ groups: [GROUPS[0]!] })
    await user.click(screen.getByRole('button', { name: '묶음 지우기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지우기' }))
    expect(screen.queryAllByRole('textbox', { name: '묶음 이름' })).toHaveLength(0)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '새 묶음' }))
  })

  it('AC-014.4 끝 줄이 아니면 초점은 같은 자리의 [묶음 지우기]이고, [취소]면 연 단추로 돌아간다', async () => {
    const { user } = draw()
    const opener = within(block(0)).getByRole('button', { name: '묶음 지우기' })
    await user.click(opener)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
    expect(document.activeElement).toBe(opener)

    await user.click(opener)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지우기' }))
    expect(nameFields().map((field) => field.value)).toEqual(['체외충격파'])
    expect(document.activeElement).toBe(within(block(0)).getByRole('button', { name: '묶음 지우기' }))
  })

  it('AC-014.4 [지우기]는 처방을 그 밖으로 보내고, 저장은 [저장]을 누를 때 지운 줄 없이 한 번이다', async () => {
    const { user, save } = draw()
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: '지우기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nameFields().map((field) => field.value)).toEqual(['도수치료'])
    expect(screen.getByRole('heading', { level: 2, name: '묶음 1개' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '그 밖 처방 4개' })).toBeTruthy()
    expect(moveSelect('ESWT1').value).toBe('')
    expect(Array.from(moveSelect('ESWT1').options).map((option) => option.text)).toEqual(['도수치료', '묶음 없음'])
    expect(save).not.toHaveBeenCalled()

    await user.click(button('저장'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0].map((group) => group.id)).toEqual(['g1'])
  })
})

describe('AC-014.5 저장', () => {
  it('AC-014.5 [저장]은 고친 목록으로 한 번 부르고 답을 onSaved로 넘긴다', async () => {
    const answer: RxGroup[] = [{ id: 'server', name: '답', codes: [], sortOrder: 0 }]
    const { user, save, onSaved } = draw({ save: async () => answer })
    await user.selectOptions(moveSelect('HP01'), '도수치료')
    rename(1, '충격파')
    await user.click(button('저장'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith([
      { id: 'g1', name: '도수치료', codes: ['도수', 'HP01'], sortOrder: 0 },
      { id: 'g2', name: '충격파', codes: ['ESWT1', 'ESWT2'], sortOrder: 1 },
    ])
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(answer))
  })

  it('AC-014.5 기다리는 동안 다시 눌러도 한 번이고, [저장]은 aria-busy, [취소]는 막힌다', async () => {
    let finish: (groups: RxGroup[]) => void = () => {}
    const { user, save, onSaved, onCancel } = draw({ save: () => new Promise((resolve) => { finish = resolve }) })
    await user.click(button('저장'))
    await user.click(button('저장'))
    expect(save).toHaveBeenCalledTimes(1)
    for (const el of screen.getAllByRole('button', { name: '저장' })) expect(el.getAttribute('aria-busy')).toBe('true')
    for (const el of screen.getAllByRole<HTMLButtonElement>('button', { name: '취소' })) expect(el.disabled).toBe(true)
    await user.click(button('취소'))
    expect(onCancel).not.toHaveBeenCalled()

    finish([])
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })

  it('AC-014.5 RxGroupStoreError면 오류 카드(lib/errors 글·번호)와 [다시 저장], 고친 것은 그대로, 초점은 [다시 저장](폰에서 카드가 화면 밖이어도 보이게)', async () => {
    const { user, onSaved } = draw({ save: async () => Promise.reject(new RxGroupStoreError(SAVE_FAILED)) })
    await user.selectOptions(moveSelect('HP01'), '도수치료')
    rename(1, '고친 이름')
    await user.click(button('저장'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('치료 묶음을 저장하지 못했어요')
    expect(alert.textContent).toContain('인터넷 연결과 이름이 겹치지 않는지 보고 [다시 저장]을 눌러 주세요')
    expect(alert.textContent).toContain(`오류 번호 ${SAVE_FAILED}`)
    const retry = screen.getByRole('button', { name: '다시 저장' })
    expect(document.activeElement).toBe(retry)
    expect(nameFields()[1]!.value).toBe('고친 이름')
    expect(block(0).contains(row('HP01'))).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
    for (const el of screen.getAllByRole('button', { name: '저장' })) expect(el.getAttribute('aria-busy')).toBe('false')
  })

  it('AC-014.5 [다시 저장]은 같은 목록을 다시 보내고, 되면 onSaved로 간다. 그동안 카드는 남아 있다', async () => {
    let finish: (groups: RxGroup[]) => void = () => {}
    const save = vi.fn<Save>().mockRejectedValueOnce(new RxGroupStoreError(SAVE_FAILED)).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { user, onSaved } = draw({ save })
    rename(1, '고친 이름')
    await user.click(button('저장'))
    await user.click(await screen.findByRole('button', { name: '다시 저장' }))
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]![0]).toEqual(save.mock.calls[0]![0])
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 저장' }).getAttribute('aria-busy')).toBe('true')

    finish([])
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([]))
  })

  it('AC-014.5 다른 오류여도 카드로 받고 원래 오류 글은 보이지 않는다', async () => {
    const { user, container } = draw({ save: async () => Promise.reject(new Error('원래 오류 내용')) })
    await user.click(button('저장'))
    expect((await screen.findByRole('alert')).textContent).toContain(`오류 번호 ${SAVE_FAILED}`)
    expect(container.textContent).not.toContain('원래 오류 내용')
  })

  it('AC-014.5 실패한 뒤 [취소]를 누르면 돌아갈 수 있다(계속 실패할 때 나가는 길)', async () => {
    const { user, onCancel } = draw({ save: async () => Promise.reject(new RxGroupStoreError(SAVE_FAILED)) })
    await user.click(button('저장'))
    await screen.findByRole('alert')
    await user.click(button('취소'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('AC-014.1 [취소]는 아무것도 보내지 않는다(PC·폰 단추 모두)', async () => {
    const { user, save, onCancel } = draw()
    rename(0, '고친 이름')
    for (const el of screen.getAllByRole('button', { name: '취소' })) await user.click(el)
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('AC-014.6 폰·화면 규칙', () => {
  it('AC-014.6 입력은 ds.input이라 44px·폰 16px, 고르기도 폰 44px·16px', () => {
    draw()
    for (const field of screen.getAllByRole('textbox')) expect(classesOf(field)).toEqual(expect.arrayContaining(ds.input.split(' ')))
    expect(ds.input).toContain('h-11')
    expect(ds.input).toContain('max-md:text-lead')
    for (const select of screen.getAllByRole('combobox')) expect(classesOf(select)).toEqual(expect.arrayContaining(['max-md:h-11', 'max-md:text-lead']))
  })

  it('AC-014.6 단추는 모두 폰 44px이고 [묶음 지우기]는 시안대로 빨간 글자만이다', () => {
    draw()
    for (const el of screen.getAllByRole('button')) expect(classesOf(el), el.textContent ?? '').toContain('max-md:h-11')
    const remove = classesOf(within(block(0)).getByRole('button', { name: '묶음 지우기' }))
    expect(remove).toContain('text-negative')
    expect(remove).not.toContain('text-ink-2')
  })

  it('AC-014.6 PC는 위에 [취소] 글자만·[저장], 폰은 아래에 [취소] 보조·[저장]을 반씩', () => {
    draw()
    const [topCancel, footCancel] = screen.getAllByRole('button', { name: '취소' })
    const [topSave, footSave] = screen.getAllByRole('button', { name: '저장' })
    expect(topCancel!.parentElement).toBe(topSave!.parentElement)
    expect(classesOf(topCancel!.parentElement!)).toContain('max-md:hidden')
    expect(classesOf(topCancel!)).toEqual(expect.arrayContaining(ds.button.ghost.split(' ')))
    expect(footCancel!.parentElement).toBe(footSave!.parentElement)
    expect(classesOf(footCancel!.parentElement!)).toEqual(expect.arrayContaining(['md:hidden', 'grid', 'grid-cols-2']))
    expect(classesOf(footCancel!)).toEqual(expect.arrayContaining([...ds.button.secondary.split(' '), 'w-full']))
    expect(classesOf(footSave!)).toEqual(expect.arrayContaining([...ds.button.primary.split(' '), 'w-full']))
  })

  it('AC-014.6 폰은 한 줄 배치이고 PC는 12칸(왼쪽 7·오른쪽 5)이다', () => {
    draw()
    const left = screen.getByRole('heading', { level: 2, name: '묶음 2개' }).parentElement!.parentElement!
    const right = screen.getByRole('heading', { level: 2, name: '그 밖 처방 2개' }).parentElement!.parentElement!
    expect(left.parentElement).toBe(right.parentElement)
    expect(classesOf(left.parentElement!)).toEqual(expect.arrayContaining(['md:grid', 'md:grid-cols-12']))
    expect(classesOf(left)).toContain('md:col-span-7')
    expect(classesOf(right)).toContain('md:col-span-5')
  })

  it('AC-014.6 상자 안 상자가 없다(확인 창·오류 카드를 함께 그려도)', async () => {
    const { user, container } = draw({ save: async () => Promise.reject(new RxGroupStoreError(SAVE_FAILED)) })
    await user.click(button('저장'))
    await screen.findByRole('alert')
    await user.click(within(block(0)).getByRole('button', { name: '묶음 지우기' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-014.6 통로를 쓰지 않는다(폰·연결 안 된 PC에서도 된다): 저장은 받은 함수 하나뿐이다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/revenue/groups/GroupEditor.tsx'), 'utf8')
    expect(source.startsWith("'use client'")).toBe(true)
    expect(source).not.toMatch(/useBridge|lib\/bridge|supabase/)
  })
})
