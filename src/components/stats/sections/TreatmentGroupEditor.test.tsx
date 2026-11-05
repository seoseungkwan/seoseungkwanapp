// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import type { RxGroup } from '@/types/rxGroups'
import type { RxLine } from '../view'
import { TreatmentGroupEditor } from './TreatmentGroupEditor'

// 묶음 고치기 화면 (spec treatment-trend TASK-10, REQ-1210·REQ-1212, 시안 docs/mockups/treatment-trend 고치기 화면). props만 받는다(훅·저장 코드 없음).
// 처방 이름·코드·건수·묶음 이름은 모두 이 파일에서 지어낸 값이다

type Props = ComponentProps<typeof TreatmentGroupEditor>

const INTRO =
  '묶음 이름을 짓고, 넣을 처방을 고르세요. 처방 하나는 한 묶음에만 들어가요. 어느 묶음에도 없는 처방은 이 칸에 나오지 않아요. 여기서 바꿔도 매출 탭 묶음은 그대로예요.'
const WARN = '처방을 넣거나 뺀 묶음과 새로 만든 묶음은, 다시 불러온 뒤부터 숫자가 나와요. 이름과 순서만 바꾸면 바로 바뀌어요.'
const NO_CODES = '넣은 처방이 없어요'
const NO_MATCH = '맞는 처방이 없어요. 불러온 숫자에 있는 처방만 찾아요.'
const READING = '처방 목록을 더 읽는 중이에요'
const READ_FAILED = '전체 처방 목록을 읽지 못해 지금 보는 기간의 처방만 보여요.'
const TOO_MANY = '묶음은 50개까지 만들 수 있어요.'
const KEPT = '고치던 내용은 이 화면에 그대로 있어요.'

// 일부러 가나다 차례가 아니게 둔다
const LINES: RxLine[] = [
  { code: 'TH02', name: '나무 온열치료' },
  { code: 'TH01', name: '가상 도수치료' },
  { code: 'IN03', name: '다람 주사' },
  { code: 'MS04', name: '라온 근막치료' },
]
// 열쇠는 대문자 코드(rxPeriodCounts)
const COUNTS = new Map([
  ['TH01', 214],
  ['TH02', 1234],
  ['IN03', 5],
])

const GROUPS: RxGroup[] = [
  { id: 'a1', name: '도수치료', codes: ['TH01'], sortOrder: 0 },
  { id: 'b2', name: '온열', codes: ['TH02', 'IN03'], sortOrder: 1 },
  { id: 'c3', name: '빈 묶음', codes: [], sortOrder: 2 },
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function propsOf(over: Partial<Props> = {}): Props {
  return {
    groups: GROUPS,
    lines: LINES,
    counts: COUNTS,
    periodName: '최근 30일',
    catalogState: 'ready',
    onOpenCatalog: vi.fn(),
    onRetryCatalog: vi.fn(),
    saving: false,
    saveFailed: false,
    onSave: vi.fn(async () => true),
    onCancel: vi.fn(),
    ...over,
  }
}

function draw(over: Partial<Props> = {}) {
  const props = propsOf(over)
  const view = render(<TreatmentGroupEditor {...props} />)
  return { props, view }
}

const nameFields = () => screen.getAllByRole('textbox', { name: '묶음 이름' }) as HTMLInputElement[]
const names = () => nameFields().map((field) => field.value)
// 묶음 한 칸(이름 칸이 든 목록 줄)
const groupAt = (index: number) => nameFields()[index]!.closest('li')!
const button = (name: string) => screen.getByRole('button', { name })
const search = () => screen.getByRole('textbox', { name: '넣을 처방 찾기' }) as HTMLInputElement
const found = () => screen.queryByRole('list', { name: '찾은 처방' })
const foundNames = () => within(found()!).getAllByRole('button').map((row) => row.textContent)
const classOf = (element: Element) => (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const hasAll = (element: Element, classes: string) => expect(classOf(element)).toEqual(expect.arrayContaining(classes.split(/\s+/).filter(Boolean)))
const openAdder = async (user: ReturnType<typeof userEvent.setup>, index: number) => user.click(within(groupAt(index)).getByRole('button', { name: '+ 처방 넣기' }))
const codesIn = (index: number) => within(groupAt(index)).queryAllByRole('button', { name: '빼기' }).map((rm) => rm.closest('li')!.textContent)

describe('AC-1210.2: 안내 글과 묶음 목록', () => {
  it('AC-1210.2: 안내 글이 글자 그대로 있고 받은 묶음이 차례대로 이름 칸으로 나온다', () => {
    draw()
    expect(screen.getByText(INTRO)).toBeTruthy()
    expect(names()).toEqual(['도수치료', '온열', '빈 묶음'])
  })

  it('AC-1210.2: 고치는 내용은 이 화면에만 있다 — 받은 묶음을 바꾸지 않고 [저장] 전에는 저장·그만두기를 부르지 않는다', async () => {
    const user = userEvent.setup()
    const frozen = GROUPS.map((group) => Object.freeze({ ...group, codes: Object.freeze([...group.codes]) as unknown as string[] }))
    const { props } = draw({ groups: Object.freeze(frozen) as unknown as RxGroup[] })
    await user.type(nameFields()[0]!, ' 바뀜')
    await user.click(button('온열 위로'))
    await user.click(within(groupAt(0)).getAllByRole('button', { name: '빼기' })[0]!)
    await user.click(button('+ 묶음 더하기'))
    expect(frozen.map((group) => group.name)).toEqual(['도수치료', '온열', '빈 묶음'])
    expect(frozen[1]!.codes).toEqual(['TH02', 'IN03'])
    expect(props.onSave).not.toHaveBeenCalled()
    expect(props.onCancel).not.toHaveBeenCalled()
  })
})

describe('AC-1210.3: 묶음 한 칸 — ▲▼·이름 칸·[묶음 지우기]', () => {
  it('AC-1210.3: ▲▼ 이름표는 묶음 이름을 쓰고, 맨 위 ▲·맨 아래 ▼는 막혀 있다', () => {
    draw()
    expect((button('도수치료 위로') as HTMLButtonElement).disabled).toBe(true)
    expect((button('도수치료 아래로') as HTMLButtonElement).disabled).toBe(false)
    expect((button('온열 위로') as HTMLButtonElement).disabled).toBe(false)
    expect((button('온열 아래로') as HTMLButtonElement).disabled).toBe(false)
    expect((button('빈 묶음 아래로') as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-1210.3: 이름이 비면 ▲▼ 이름표가 `이 묶음 위로`·`이 묶음 아래로`다', async () => {
    draw()
    fireEvent.change(nameFields()[1]!, { target: { value: '  ' } })
    expect(button('이 묶음 위로')).toBeTruthy()
    expect(button('이 묶음 아래로')).toBeTruthy()
  })

  it('AC-1210.3: 이름 칸은 이름표·안내 글 `묶음 이름`이고 오른쪽에 위험 글자 단추 [묶음 지우기]가 있다', () => {
    draw()
    for (const field of nameFields()) expect(field.getAttribute('placeholder')).toBe('묶음 이름')
    const deletes = screen.getAllByRole('button', { name: '묶음 지우기' })
    expect(deletes).toHaveLength(3)
    hasAll(deletes[0]!, 'text-negative')
    expect(classOf(deletes[0]!)).not.toContain('text-accent')
    // 같은 줄에서 이름 칸 뒤(오른쪽)
    const field = nameFields()[0]!
    expect(field.compareDocumentPosition(deletes[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-1210.3: ▼를 누르면 차례가 바뀌고 초점은 옮겨 간 묶음의 같은 단추에 있다', async () => {
    const user = userEvent.setup()
    draw()
    await user.click(button('도수치료 아래로'))
    expect(names()).toEqual(['온열', '도수치료', '빈 묶음'])
    expect(document.activeElement).toBe(button('도수치료 아래로'))
  })

  it('AC-1210.3: 옮겨 간 자리에서 같은 단추가 막히면 초점은 다른 단추에 있다', async () => {
    const user = userEvent.setup()
    draw()
    await user.click(button('온열 위로'))
    expect(names()).toEqual(['온열', '도수치료', '빈 묶음'])
    expect((button('온열 위로') as HTMLButtonElement).disabled).toBe(true)
    expect(document.activeElement).toBe(button('온열 아래로'))
    await user.click(button('도수치료 아래로'))
    expect(names()).toEqual(['온열', '빈 묶음', '도수치료'])
    expect(document.activeElement).toBe(button('도수치료 위로'))
  })

  it('AC-1210.3: [묶음 지우기]는 다시 묻지 않고 목록에서 뺀다(저장은 부르지 않는다)', async () => {
    const user = userEvent.setup()
    const { props } = draw()
    await user.click(within(groupAt(1)).getByRole('button', { name: '묶음 지우기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(names()).toEqual(['도수치료', '빈 묶음'])
    expect(props.onSave).not.toHaveBeenCalled()
  })
})

describe('AC-1210.4: 묶음 안 처방 줄', () => {
  it('AC-1210.4: 줄마다 처방 이름, 코드(caption muted), `<기간 이름> n건`, [빼기]가 있다', () => {
    draw()
    const row = within(groupAt(1)).getByText('나무 온열치료').closest('li')!
    const code = within(row).getByText('TH02')
    hasAll(code, 'text-caption text-muted')
    expect(within(row).getByText('최근 30일 1,234건')).toBeTruthy()
    expect(within(row).getByRole('button', { name: '빼기' })).toBeTruthy()
    expect(within(groupAt(0)).getByText('최근 30일 214건')).toBeTruthy()
  })

  it('AC-1210.4: 기간 이름은 받은 글자이고, 이 기간에 없는 처방은 0건이며 건수는 대소문자를 가리지 않는다', () => {
    draw({ periodName: '최근 7일', groups: [{ id: 'a1', name: '근막', codes: ['ms04', 'th01'], sortOrder: 0 }] })
    expect(within(groupAt(0)).getByText('최근 7일 0건')).toBeTruthy()
    expect(within(groupAt(0)).getByText('최근 7일 214건')).toBeTruthy()
    // 이름은 대소문자만 다른 코드의 찾기 목록 줄에서 온다
    expect(within(groupAt(0)).getByText('라온 근막치료')).toBeTruthy()
  })

  it('AC-1210.4: 찾기 목록에 없는 코드는 코드만 보인다', () => {
    draw({ groups: [{ id: 'a1', name: '옛 처방', codes: ['ZZ99'], sortOrder: 0 }] })
    const rows = codesIn(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('ZZ99')
    expect(within(groupAt(0)).getAllByText('ZZ99')).toHaveLength(1)
  })

  it('AC-1210.4: 처방이 없으면 `넣은 처방이 없어요`다', () => {
    draw()
    expect(within(groupAt(2)).getByText(NO_CODES)).toBeTruthy()
    expect(within(groupAt(0)).queryByText(NO_CODES)).toBeNull()
  })

  it('AC-1210.4: [빼기]는 그 처방을 뺀다', async () => {
    const user = userEvent.setup()
    draw()
    const row = within(groupAt(1)).getByText('나무 온열치료').closest('li')!
    await user.click(within(row).getByRole('button', { name: '빼기' }))
    expect(within(groupAt(1)).queryByText('나무 온열치료')).toBeNull()
    expect(within(groupAt(1)).getByText('다람 주사')).toBeTruthy()
    // 다 빼면 빈 줄 글
    await user.click(within(groupAt(1)).getByRole('button', { name: '빼기' }))
    expect(within(groupAt(1)).getByText(NO_CODES)).toBeTruthy()
  })
})

describe('AC-1210.5: [+ 처방 넣기]와 찾기 목록', () => {
  it('AC-1210.5: 누르면 그 자리에 찾기 칸·목록이 열리고 초점이 찾기 칸에 간다', async () => {
    const user = userEvent.setup()
    draw()
    expect(found()).toBeNull()
    await openAdder(user, 2)
    expect(search().getAttribute('placeholder')).toBe('처방 이름이나 코드로 찾기')
    expect(document.activeElement).toBe(search())
    expect(found()).not.toBeNull()
    // 그 묶음 안에 열리고, 그 묶음의 [+ 처방 넣기] 자리를 바꾼다
    expect(groupAt(2).contains(search())).toBe(true)
    expect(within(groupAt(2)).queryByRole('button', { name: '+ 처방 넣기' })).toBeNull()
  })

  it('AC-1210.5: 한 번에 한 묶음의 목록만 열린다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 0)
    await openAdder(user, 1)
    expect(screen.getAllByRole('list', { name: '찾은 처방' })).toHaveLength(1)
    expect(groupAt(1).contains(found())).toBe(true)
    expect(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' })).toBeTruthy()
  })

  it('AC-1210.5: 목록은 처방 이름 가나다 차례이고 줄마다 이름·코드·이 기간 `n건`이 있다', async () => {
    const user = userEvent.setup()
    draw({ groups: [{ id: 'a1', name: '새 묶음', codes: [], sortOrder: 0 }] })
    await openAdder(user, 0)
    expect(foundNames()).toEqual(['가상 도수치료TH01214건', '나무 온열치료TH021,234건', '다람 주사IN035건', '라온 근막치료MS040건'])
  })

  it('AC-1210.5: 적은 글자(앞뒤 빈칸 뺌, 영문 대소문자 무시)가 이름이나 코드에 든 줄만 나온다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 2)
    fireEvent.change(search(), { target: { value: '  th0 ' } })
    expect(foundNames().map((row) => row!.slice(0, 6))).toEqual(['가상 도수치', '나무 온열치'])
    fireEvent.change(search(), { target: { value: '주사' } })
    expect(foundNames()).toHaveLength(1)
  })

  it('AC-1210.5: 이 묶음에 이미 있으면 `이 묶음에 있음`이고 누를 수 없다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 0)
    const row = within(found()!).getByRole('button', { name: /가상 도수치료/ }) as HTMLButtonElement
    expect(row.textContent).toContain('이 묶음에 있음')
    expect(row.textContent).not.toContain('214건')
    expect(row.disabled).toBe(true)
    await user.click(row)
    expect(codesIn(0)).toHaveLength(1)
  })

  it('AC-1210.5: 맞는 줄이 없으면 안내 글이 나온다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 0)
    fireEvent.change(search(), { target: { value: '없는처방' } })
    expect(within(found()!).queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText(NO_MATCH)).toBeTruthy()
  })
})

describe('AC-1210.6: 다른 묶음의 처방 고르기', () => {
  it('AC-1210.6: 다른 묶음에 있는 줄 아래에 경고 색으로 그 묶음 이름이 있다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 2)
    const row = within(found()!).getByRole('button', { name: /나무 온열치료/ })
    const where = within(row).getByText('온열에 있어요. 고르면 이 묶음으로 옮겨요')
    hasAll(where, 'text-warning')
    expect(within(found()!).getByRole('button', { name: /라온 근막치료/ }).textContent).not.toContain('있어요')
  })

  it('AC-1210.6: 그 묶음 이름이 비면 `이름 없는 묶음`이다', async () => {
    const user = userEvent.setup()
    draw()
    fireEvent.change(nameFields()[1]!, { target: { value: ' ' } })
    await openAdder(user, 2)
    // 온열의 두 처방 줄 모두
    expect(within(found()!).getAllByText('이름 없는 묶음에 있어요. 고르면 이 묶음으로 옮겨요')).toHaveLength(2)
  })

  it('AC-1210.6: 누르면 그 묶음에서 빠지고 이 묶음 끝에 들어가며 옮긴 글이 이 묶음 아래에 있다. 목록은 열려 있고 초점은 찾기 칸이다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 0)
    await user.click(within(found()!).getByRole('button', { name: /나무 온열치료/ }))
    expect(codesIn(0).map((row) => row!.slice(0, 7))).toEqual(['가상 도수치료', '나무 온열치료'])
    expect(codesIn(1).map((row) => row!.slice(0, 5))).toEqual(['다람 주사'])
    const note = within(groupAt(0)).getByText('TH02을(를) 온열에서 옮겨 왔어요.')
    hasAll(note, 'text-warning')
    expect(within(groupAt(1)).queryByText(/옮겨 왔어요/)).toBeNull()
    expect(found()).not.toBeNull()
    expect(document.activeElement).toBe(search())
  })

  it('AC-1210.6: 대소문자만 다른 코드도 그 묶음에서 빠진다', async () => {
    const user = userEvent.setup()
    draw({
      groups: [
        { id: 'a1', name: '도수치료', codes: ['th02'], sortOrder: 0 },
        { id: 'b2', name: '온열', codes: [], sortOrder: 1 },
      ],
    })
    await openAdder(user, 1)
    await user.click(within(found()!).getByRole('button', { name: /나무 온열치료/ }))
    expect(within(groupAt(0)).getByText(NO_CODES)).toBeTruthy()
    expect(codesIn(1)).toHaveLength(1)
    expect(within(groupAt(1)).getByText('TH02을(를) 도수치료에서 옮겨 왔어요.')).toBeTruthy()
  })

  it('AC-1210.6: 다른 묶음에 없는 줄을 누르면 이 묶음 끝에 들어가고 옮긴 글이 없다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 0)
    await user.click(within(found()!).getByRole('button', { name: /라온 근막치료/ }))
    expect(codesIn(0).map((row) => row!.slice(0, 7))).toEqual(['가상 도수치료', '라온 근막치료'])
    expect(screen.queryByText(/옮겨 왔어요/)).toBeNull()
    expect(document.activeElement).toBe(search())
  })

  it('AC-1210.6: 옮긴 글은 묶음 차례를 바꿔도 그 묶음에 붙어 있다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 2)
    await user.click(within(found()!).getByRole('button', { name: /가상 도수치료/ }))
    await user.click(button('빈 묶음 위로'))
    expect(names()).toEqual(['도수치료', '빈 묶음', '온열'])
    expect(within(groupAt(1)).getByText('TH01을(를) 도수치료에서 옮겨 왔어요.')).toBeTruthy()
  })
})

describe('AC-1210.7: 목록 닫기', () => {
  it('AC-1210.7: [닫기]를 누르면 닫히고 초점은 그 묶음의 [+ 처방 넣기]로 간다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 1)
    await user.click(button('닫기'))
    expect(found()).toBeNull()
    expect(document.activeElement).toBe(within(groupAt(1)).getByRole('button', { name: '+ 처방 넣기' }))
  })

  it('AC-1210.7: Esc를 누르면 닫히고 초점은 그 묶음의 [+ 처방 넣기]로 간다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 1)
    await user.keyboard('{Escape}')
    expect(found()).toBeNull()
    expect(document.activeElement).toBe(within(groupAt(1)).getByRole('button', { name: '+ 처방 넣기' }))
  })
})

describe('AC-1210.8: 찾기 목록 읽기 알림(그리기)', () => {
  it('AC-1210.8: 넓은 범위 읽기는 목록을 열 때 알리고, 열기 전에는 알리지 않는다', async () => {
    const user = userEvent.setup()
    const { props } = draw({ catalogState: 'idle' })
    expect(props.onOpenCatalog).not.toHaveBeenCalled()
    await openAdder(user, 0)
    expect(props.onOpenCatalog).toHaveBeenCalledTimes(1)
  })

  it('AC-1210.8: 열린 채 목록 상태가 처음(idle)으로 돌아오면 다시 알린다', async () => {
    const user = userEvent.setup()
    const { props, view } = draw({ catalogState: 'ready' })
    await openAdder(user, 0)
    expect(props.onOpenCatalog).toHaveBeenCalledTimes(1)
    view.rerender(<TreatmentGroupEditor {...props} catalogState="idle" />)
    expect(props.onOpenCatalog).toHaveBeenCalledTimes(2)
  })

  it('AC-1210.8: 읽는 중이면 목록 아래 `처방 목록을 더 읽는 중이에요`다', async () => {
    const user = userEvent.setup()
    draw({ catalogState: 'reading' })
    await openAdder(user, 0)
    const note = screen.getByText(READING)
    expect(found()!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-1210.8: 읽기 실패면 안내 글과 [다시 읽기]가 있고 누르면 다시 읽기를 알린다', async () => {
    const user = userEvent.setup()
    const { props } = draw({ catalogState: 'failed' })
    await openAdder(user, 0)
    expect(screen.getByText(READ_FAILED)).toBeTruthy()
    await user.click(button('다시 읽기'))
    expect(props.onRetryCatalog).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(search())
  })
})

describe('AC-1210.9: [+ 묶음 더하기]', () => {
  it('AC-1210.9: 이름이 빈 새 묶음이 끝에 생기고 초점이 그 이름 칸에 간다', async () => {
    const user = userEvent.setup()
    draw()
    await user.click(button('+ 묶음 더하기'))
    expect(names()).toEqual(['도수치료', '온열', '빈 묶음', ''])
    expect(document.activeElement).toBe(nameFields()[3])
    expect(within(groupAt(3)).getByText(NO_CODES)).toBeTruthy()
    expect(button('이 묶음 위로')).toBeTruthy()
  })

  it('AC-1210.9: 묶음이 50개면 더하지 않고 한도 글을 보인다', async () => {
    const user = userEvent.setup()
    const fifty: RxGroup[] = Array.from({ length: 50 }, (_, i) => ({ id: `g${i}`, name: `묶음 ${i + 1}`, codes: [], sortOrder: i }))
    draw({ groups: fifty })
    expect(screen.queryByText(TOO_MANY)).toBeNull()
    await user.click(button('+ 묶음 더하기'))
    expect(nameFields()).toHaveLength(50)
    expect(screen.getByText(TOO_MANY)).toBeTruthy()
  })
})

describe('AC-1210.10: 아래 안내와 단추', () => {
  it('AC-1210.10: 목록 아래에 경고 색 글과 [그만두기](보조)·[저장](주)이 있다', () => {
    draw()
    const warn = screen.getByText(WARN)
    hasAll(warn, 'text-warning')
    expect(groupAt(2).compareDocumentPosition(warn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    hasAll(button('그만두기'), ds.button.secondary)
    hasAll(button('저장'), ds.button.primary)
    expect(warn.compareDocumentPosition(button('저장')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('AC-1210.11: [저장] 전 이름 검사', () => {
  it.each([
    ['', '이름이 빈 묶음이 있어요. 이름을 적어 주세요.'],
    [' 도수치료 ', '"도수치료" 묶음이 두 개예요. 이름을 다르게 적어 주세요.'],
    ['가'.repeat(31), '묶음 이름은 30자까지 쓸 수 있어요.'],
    // 한 줄 입력 칸은 줄바꿈을 지우므로(jsdom·브라우저 같음) 다른 제어 문자(탭)로 본다
    ['온열\t치료', '줄바꿈 같은 제어 문자는 넣을 수 없어요.'],
    ['온열123456', '숫자를 6개 이상 이어 쓸 수 없어요.'],
  ])('AC-1210.11: 이름 %j → 단추 옆 알림 글, 그 칸 aria-invalid·초점, 저장하지 않음', async (name, message) => {
    const user = userEvent.setup()
    const { props } = draw()
    fireEvent.change(nameFields()[1]!, { target: { value: name } })
    await user.click(button('저장'))
    const alert = screen.getByText(message)
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.parentElement!.contains(button('저장'))).toBe(true)
    expect(nameFields()[1]!.getAttribute('aria-invalid')).toBe('true')
    expect(nameFields()[0]!.getAttribute('aria-invalid')).toBeNull()
    expect(document.activeElement).toBe(nameFields()[1])
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('AC-1210.11: 걸린 칸이 여럿이면 모두 aria-invalid이고 초점은 첫 칸에 간다', async () => {
    const user = userEvent.setup()
    draw()
    fireEvent.change(nameFields()[2]!, { target: { value: '' } })
    fireEvent.change(nameFields()[1]!, { target: { value: '' } })
    await user.click(button('저장'))
    expect(nameFields().map((field) => field.getAttribute('aria-invalid'))).toEqual([null, 'true', 'true'])
    expect(document.activeElement).toBe(nameFields()[1])
  })

  it('AC-1210.11: 검사 전에는 알림 글이 없고 aria-invalid도 없다', () => {
    draw()
    fireEvent.change(nameFields()[1]!, { target: { value: '' } })
    expect(screen.queryByText('이름이 빈 묶음이 있어요. 이름을 적어 주세요.')).toBeNull()
    expect(nameFields()[1]!.getAttribute('aria-invalid')).toBeNull()
  })

  it('AC-1210.11: 고친 뒤 다시 [저장]하면 저장한다', async () => {
    const user = userEvent.setup()
    const { props } = draw()
    fireEvent.change(nameFields()[1]!, { target: { value: '' } })
    await user.click(button('저장'))
    fireEvent.change(nameFields()[1]!, { target: { value: '온열' } })
    await user.click(button('저장'))
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })
})

describe('AC-1210.12: 저장 부름·기다림', () => {
  it('AC-1210.12: 앞뒤 빈칸을 뗀 이름과 지금 차례(sortOrder 0부터)로 저장을 한 번 부른다', async () => {
    const user = userEvent.setup()
    const { props } = draw()
    fireEvent.change(nameFields()[0]!, { target: { value: '  도수 치료  ' } })
    await user.click(button('온열 위로'))
    await user.click(button('저장'))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledWith([
      { id: 'b2', name: '온열', codes: ['TH02', 'IN03'], sortOrder: 0 },
      { id: 'a1', name: '도수 치료', codes: ['TH01'], sortOrder: 1 },
      { id: 'c3', name: '빈 묶음', codes: [], sortOrder: 2 },
    ])
  })

  it('AC-1210.12: 기다리는 동안 단추는 `저장하는 중`(aria-busy)이고 다시 눌러도 부르지 않는다', async () => {
    const user = userEvent.setup()
    let finish: (ok: boolean) => void = () => {}
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    draw({ onSave })
    await user.click(button('저장'))
    const busy = button('저장하는 중')
    expect(busy.getAttribute('aria-busy')).toBe('true')
    await user.click(busy)
    expect(onSave).toHaveBeenCalledTimes(1)
    await act(async () => finish(false))
    expect(button('저장').getAttribute('aria-busy')).toBeNull()
  })

  it('AC-1210.12: 부르는 쪽이 저장하는 중이라고 주면 단추가 `저장하는 중`이다', () => {
    draw({ saving: true })
    expect(button('저장하는 중').getAttribute('aria-busy')).toBe('true')
  })
})

describe('AC-1210.13: 저장 실패', () => {
  it('AC-1210.13: 오류 카드와 `고치던 내용은 이 화면에 그대로 있어요.`가 단추 위에 있고 고치던 내용이 그대로다. [저장]을 다시 누를 수 있다', async () => {
    const user = userEvent.setup()
    const { props, view } = draw()
    fireEvent.change(nameFields()[0]!, { target: { value: '도수 바뀜' } })
    view.rerender(<TreatmentGroupEditor {...props} saveFailed />)
    expect(screen.getByText('오류 번호 E-STATS-GROUP-SAVE-FAILED')).toBeTruthy()
    const kept = screen.getByText(KEPT)
    expect(kept.compareDocumentPosition(button('저장')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(kept.compareDocumentPosition(button('그만두기')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(names()).toEqual(['도수 바뀜', '온열', '빈 묶음'])
    await user.click(button('저장'))
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('AC-1210.13: 실패가 아니면 오류 카드가 없다', () => {
    draw()
    expect(screen.queryByText(KEPT)).toBeNull()
    expect(screen.queryByText(/E-STATS-GROUP-SAVE-FAILED/)).toBeNull()
  })
})

describe('AC-1210.14: [그만두기]', () => {
  it('AC-1210.14: 누르면 그만두기를 알리고 저장을 부르지 않는다', async () => {
    const user = userEvent.setup()
    const { props } = draw()
    fireEvent.change(nameFields()[0]!, { target: { value: '버릴 이름' } })
    await user.click(button('그만두기'))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(props.onSave).not.toHaveBeenCalled()
  })
})

describe('AC-1212.2: 휴대폰 모양(768px 미만)', () => {
  it('AC-1212.2: 이름 칸·찾기 칸은 폭 전체·44px·16px 글자이고 넓은 화면의 폭 제한은 md: 접두사뿐이다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 0)
    for (const field of [...nameFields(), search()]) {
      hasAll(field, 'h-11 w-full max-md:text-lead')
      expect(classOf(field).filter((name) => /max-w-/.test(name) && !/^md:/.test(name))).toEqual([])
    }
    hasAll(search().parentElement!, 'max-md:max-w-none')
  })

  it('AC-1212.2: ▲▼·글자 단추·[닫기]·[그만두기]·[저장]·[+ 묶음 더하기]는 44px 이상이다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 0)
    hasAll(button('온열 위로'), 'max-md:h-11 max-md:w-11')
    hasAll(button('온열 아래로'), 'max-md:h-11 max-md:w-11')
    for (const text of [screen.getAllByRole('button', { name: '묶음 지우기' })[0]!, screen.getAllByRole('button', { name: '빼기' })[0]!, within(groupAt(1)).getByRole('button', { name: '+ 처방 넣기' })]) {
      hasAll(text, 'max-md:min-h-11')
    }
    hasAll(button('닫기'), 'min-h-11')
    for (const name of ['그만두기', '저장', '+ 묶음 더하기']) hasAll(button(name), 'max-md:h-11')
  })

  it('AC-1212.2: [그만두기]·[저장]은 나란히 반씩이다', () => {
    draw()
    const row = button('저장').parentElement!
    expect(row.contains(button('그만두기'))).toBe(true)
    hasAll(row, 'max-md:w-full')
    hasAll(button('그만두기'), 'max-md:flex-1')
    hasAll(button('저장'), 'max-md:flex-1')
  })

  it('AC-1212.2: 묶음 안 처방 목록·빈 글·옮긴 글·찾기 칸은 휴대폰에서 들여쓰지 않는다', async () => {
    const user = userEvent.setup()
    draw()
    await openAdder(user, 2)
    await user.click(within(found()!).getByRole('button', { name: /나무 온열치료/ }))
    const blocks = [
      within(groupAt(0)).getByText('가상 도수치료').closest('ul')!,
      within(groupAt(2)).getByText('TH02을(를) 온열에서 옮겨 왔어요.'),
      search().parentElement!.parentElement!,
    ]
    for (const block of blocks) {
      expect(classOf(block).some((name) => /^ml-/.test(name))).toBe(true)
      hasAll(block, 'max-md:ml-0')
    }
    fireEvent.change(search(), { target: { value: '' } })
    await user.click(button('닫기'))
    // 빈 묶음 글
    await user.click(screen.getAllByRole('button', { name: '묶음 지우기' })[2]!)
    await user.click(button('+ 묶음 더하기'))
    hasAll(within(groupAt(2)).getByText(NO_CODES), 'max-md:ml-0')
  })

  it('AC-1212.2: 상자 안 상자가 없다(목록 열림·저장 실패)', async () => {
    const user = userEvent.setup()
    draw({ saveFailed: true, catalogState: 'failed' })
    await openAdder(user, 0)
    expect(nestedBoxes(document.body)).toEqual([])
  })
})
