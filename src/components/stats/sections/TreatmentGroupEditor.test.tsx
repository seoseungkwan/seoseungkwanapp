// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import type { RxGroup, StatsRxGroup } from '@/types/rxGroups'
import type { RxLine } from '../view'
import { TreatmentGroupEditor } from './TreatmentGroupEditor'

// 묶음 고치기 화면 (spec treatment-trend TASK-10, REQ-1210·REQ-1212, 시안 docs/mockups/treatment-trend 고치기 화면). props만 받는다(훅·저장 코드 없음).
// group-exclude TASK-14(REQ-3711, 시안 docs/mockups/group-exclude ?s=edit): 넣는 처방·빼는 처방 두 칸, [지우기], [조건 더하기]·조건 칸, 찾기 칸 셋, 묶음째 고르기.
// treatment-trend AC-1210의 안내 글·[빼기] 글자는 AC-3711.1·3711.3·3711.10이 대신한다.
// 처방 이름·코드·건수·묶음 이름은 모두 이 파일에서 지어낸 값이다

type Props = ComponentProps<typeof TreatmentGroupEditor>

const INTRO =
  '묶음 이름을 짓고, 넣을 처방을 고르세요. 처방 하나는 한 묶음에만 들어가요. 넣는 처방마다 [조건 더하기]로 같이 받으면 안 세는 처방을 정할 수 있어요. 빼는 처방을 고르면, 그날 그 처방을 하나라도 받은 환자는 이 묶음에서 빠져요. 여기서 바꿔도 매출 탭 묶음은 그대로예요.'
const WARN = '넣는 처방·빼는 처방·조건을 바꾼 묶음과 새로 만든 묶음은, 다시 불러온 뒤부터 숫자가 나와요. 이름과 순서만 바꾸면 바로 바뀌어요.'
const NO_CODES = '넣은 처방이 없어요'
const NO_OUT = '빼는 처방이 없어요'
const IN_HINT = '그날 이 중 하나라도 받으면 1건'
const OUT_HINT = '그날 이 중 하나라도 받은 환자는 빼요 · 충격파·도수뿐 아니라 주사·약·촬영 등 어떤 처방이든 골라요 · 없어도 돼요'
const COND_HINT = '(그날 다른 넣는 처방을 받았으면 그걸로 1건)'
const NO_COND = '아직 고른 처방이 없어요'
const WHOLE = '묶음째 고르기 · 누르면 그 묶음 처방이 한 번에 빼는 처방에 들어가요'
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
// 넣는 처방 목록(빼는 처방·조건 처방 줄은 들지 않는다)의 줄 글
const inList = (index: number) => within(groupAt(index)).queryByRole('list', { name: '넣는 처방' })
const codesIn = (index: number) => {
  const list = inList(index)
  return list ? within(list).getAllByRole('listitem').filter((item) => item.parentElement === list).map((item) => item.textContent) : []
}

describe('AC-1210.2·AC-3711.1: 안내 글과 묶음 목록', () => {
  it('AC-1210.2·AC-3711.1: 안내 글이 글자 그대로 있고 받은 묶음이 차례대로 이름 칸으로 나온다', () => {
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
    await user.click(within(groupAt(0)).getAllByRole('button', { name: '지우기' })[0]!)
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

describe('AC-1210.4·AC-3711.3: 묶음 안 처방 줄', () => {
  it('AC-1210.4·AC-3711.3: 줄마다 처방 이름, 코드(caption muted), `<기간 이름> n건`, [지우기]가 있다', () => {
    draw()
    const row = within(groupAt(1)).getByText('나무 온열치료').closest('li')!
    const code = within(row).getByText('TH02')
    hasAll(code, 'text-caption text-muted')
    expect(within(row).getByText('최근 30일 1,234건')).toBeTruthy()
    expect(within(row).getByRole('button', { name: '지우기' })).toBeTruthy()
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

  it('AC-1210.4·AC-3711.3: [지우기]는 그 처방을 뺀다', async () => {
    const user = userEvent.setup()
    draw()
    const row = within(groupAt(1)).getByText('나무 온열치료').closest('li')!
    await user.click(within(row).getByRole('button', { name: '지우기' }))
    expect(within(groupAt(1)).queryByText('나무 온열치료')).toBeNull()
    expect(within(groupAt(1)).getByText('다람 주사')).toBeTruthy()
    // 다 빼면 빈 줄 글
    await user.click(within(groupAt(1)).getByRole('button', { name: '지우기' }))
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

describe('AC-1210.10·AC-3711.10: 아래 안내와 단추', () => {
  it('AC-1210.10·AC-3711.10: 목록 아래에 경고 색 글과 [그만두기](보조)·[저장](주)이 있다', () => {
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
    for (const text of [screen.getAllByRole('button', { name: '묶음 지우기' })[0]!, screen.getAllByRole('button', { name: '지우기' })[0]!, within(groupAt(1)).getByRole('button', { name: '+ 처방 넣기' })]) {
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

  // 화면 확인(TASK-17)에서 찾음: 앱에는 기본 초기화(Preflight)가 없어 목록 표시를 지우지 않으면 묶음 앞에 `1.`·`2.`가 쪽 왼쪽 밖으로 나온다(시안 ol·ul은 표시 없음)
  it('AC-1215.1: 묶음 목록·묶음 안 처방 목록·찾은 처방 목록에 번호·점 표시가 없다(list-none)', async () => {
    const user = userEvent.setup()
    const { view } = draw()
    await openAdder(user, 0)
    const lists = [...view.container.querySelectorAll('ol, ul')]
    expect(lists.length).toBeGreaterThanOrEqual(3)
    for (const list of lists) hasAll(list, 'list-none')
  })

  it('AC-1212.2: 상자 안 상자가 없다(목록 열림·저장 실패)', async () => {
    const user = userEvent.setup()
    draw({ saveFailed: true, catalogState: 'failed' })
    await openAdder(user, 0)
    expect(nestedBoxes(document.body)).toEqual([])
  })
})

// ── 빼는 처방·조건 (group-exclude TASK-14, REQ-3711) ─────────────────
// 일부러 가나다 차례가 아니게 둔다. 이름·코드·건수는 지어낸 값이다
const PT_LINES: RxLine[] = [
  { code: 'MM080', name: '나라 간섭파' },
  { code: 'TH01', name: '바다 도수치료' },
  { code: 'MM010', name: '가나 물리치료' },
  { code: 'ESWT7', name: '다솜 충격파' },
  { code: 'MM020', name: '라온 온습포' },
  { code: 'TENS', name: '마루 전기자극' },
]
const PT_COUNTS = new Map([
  ['MM010', 120],
  ['MM080', 40],
  ['ESWT7', 30],
  ['MM020', 15],
  ['TENS', 9],
  ['TH01', 214],
])
const PT_GROUPS: StatsRxGroup[] = [
  { id: 'p1', name: '기본 PT', codes: ['MM010', 'MM080'], out: ['ESWT7'], cond: [{ code: 'MM080', unless: ['MM020'] }], sortOrder: 0 },
  { id: 'p2', name: '도수', codes: ['TH01'], sortOrder: 1 },
  { id: 'p3', name: '빈 묶음', codes: [], sortOrder: 2 },
]
const drawPt = (over: Partial<Props> = {}) => draw({ groups: PT_GROUPS, lines: PT_LINES, counts: PT_COUNTS, ...over })

const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const outList = (index: number) => within(groupAt(index)).queryByRole('list', { name: '빼는 처방' })
const outsIn = (index: number) => {
  const list = outList(index)
  return list ? within(list).getAllByRole('listitem').map((item) => item.textContent) : []
}
// 목록의 한 줄(맨 앞 글이 처방 이름인 바로 아래 줄)
const rowIn = (list: HTMLElement | null, name: string) => [...list!.children].find((item) => item.firstElementChild?.textContent === name) as HTMLElement
const inRow = (index: number, name: string) => rowIn(inList(index), name)
const outRow = (index: number, name: string) => rowIn(outList(index), name)
// 줄 바로 아래 단추(조건 칸 안 단추는 들지 않는다)
const ownButton = (row: Element, name: string) => [...row.querySelectorAll(':scope > button')].find((item) => item.textContent === name) as HTMLButtonElement | undefined
const condTitle = (code: string) => screen.queryByText(new RegExp(`^조건 · ${code}은\\(는\\)`))
const condBox = (code: string) => condTitle(code)!.parentElement!
const condList = (code: string) => within(condBox(code)).queryByRole('list', { name: `${code} 조건 처방` })
const condsIn = (code: string) => {
  const list = condList(code)
  return list ? within(list).getAllByRole('listitem').map((item) => item.textContent) : []
}
const condRow = (code: string, name: string) => rowIn(condList(code), name)
const outSearch = () => screen.getByRole('textbox', { name: '뺄 처방 찾기' }) as HTMLInputElement
const condSearch = (code: string) => screen.getByRole('textbox', { name: `${code}와 같이 받으면 안 셀 처방 찾기` }) as HTMLInputElement
const option = (name: RegExp) => within(found()!).getByRole('button', { name }) as HTMLButtonElement
const openOut = async (user: ReturnType<typeof userEvent.setup>, index: number) => user.click(within(groupAt(index)).getByRole('button', { name: '+ 빼는 처방 고르기' }))
const openCond = async (user: ReturnType<typeof userEvent.setup>, code: string) => user.click(within(condBox(code)).getByRole('button', { name: '+ 처방 고르기' }))
const head6 = (rows: (string | null)[]) => rows.map((row) => row!.slice(0, 6))

describe('AC-3711.2: 넣는 처방·빼는 처방 두 칸', () => {
  it('AC-3711.2: 이름 줄 아래에 `넣는 처방`(옆 글) 칸, 그 아래 negative 색 `빼는 처방`(옆 글) 칸이 차례로 있다', () => {
    drawPt()
    const g = within(groupAt(0))
    const inTitle = g.getByText('넣는 처방').closest('p')!
    const outTitle = g.getByText('빼는 처방').closest('p')!
    expect(within(inTitle).getByText(IN_HINT)).toBeTruthy()
    expect(within(outTitle).getByText(OUT_HINT)).toBeTruthy()
    hasAll(outTitle, 'text-negative')
    expect(classOf(inTitle)).not.toContain('text-negative')
    hasAll(within(outTitle).getByText(OUT_HINT), 'text-muted')
    expect(follows(nameFields()[0]!, inTitle)).toBe(true)
    expect(follows(inTitle, inList(0)!)).toBe(true)
    expect(follows(inList(0)!, outTitle)).toBe(true)
    expect(follows(outTitle, outList(0)!)).toBe(true)
  })

  it('AC-3711.2: 빈 칸 글은 `넣은 처방이 없어요`·`빼는 처방이 없어요`다(빼는 처방 칸이 없던 묶음도)', () => {
    drawPt()
    expect(within(groupAt(2)).getByText(NO_CODES)).toBeTruthy()
    expect(within(groupAt(2)).getByText(NO_OUT)).toBeTruthy()
    expect(within(groupAt(1)).getByText(NO_OUT)).toBeTruthy()
    expect(within(groupAt(0)).queryByText(NO_OUT)).toBeNull()
    expect(follows(within(groupAt(1)).getByText('빼는 처방'), within(groupAt(1)).getByText(NO_OUT))).toBe(true)
  })
})

describe('AC-3711.3: 넣는 처방 줄', () => {
  it('AC-3711.3: 이름·코드·`{기간 이름} n건`·(조건이 없으면) [조건 더하기]·[지우기]가 이 차례로 있다', () => {
    drawPt()
    const row = inRow(0, '가나 물리치료')
    expect(within(row).getByText('MM010')).toBeTruthy()
    const count = within(row).getByText('최근 30일 120건')
    const add = ownButton(row, '조건 더하기')!
    const remove = ownButton(row, '지우기')!
    expect(follows(count, add)).toBe(true)
    expect(follows(add, remove)).toBe(true)
    // 조건이 있는 처방 줄에는 [조건 더하기]가 없다
    const withCond = inRow(0, '나라 간섭파')
    expect(ownButton(withCond, '조건 더하기')).toBeUndefined()
    expect(ownButton(withCond, '지우기')).toBeTruthy()
  })

  it('AC-3711.3: [빼기] 글자는 어디에도 없다(찾기 칸 셋을 열어도)', async () => {
    const user = userEvent.setup()
    drawPt()
    expect(document.body.textContent).not.toContain('빼기')
    await openAdder(user, 0)
    expect(document.body.textContent).not.toContain('빼기')
    await openOut(user, 0)
    expect(document.body.textContent).not.toContain('빼기')
    await openCond(user, 'MM080')
    expect(document.body.textContent).not.toContain('빼기')
  })
})

describe('AC-3711.4: 조건 칸', () => {
  it('AC-3711.4: 조건이 있는 넣는 처방 줄 아래에 조건 칸(제목·조건 처방 줄·[+ 처방 고르기], 왼쪽 warning 선·warning-soft 바탕)이 있다', () => {
    drawPt()
    const title = condTitle('MM080')!
    expect(title.textContent).toBe(`조건 · MM080은(는) 아래 처방과 같은 날 받으면 세지 않아요 ${COND_HINT}`)
    const box = condBox('MM080')
    expect(inRow(0, '나라 간섭파').contains(box)).toBe(true)
    hasAll(box, 'border-l-2 border-warning bg-warning-soft')
    expect(condsIn('MM080')).toEqual(['라온 온습포MM020지우기'])
    expect(within(box).getByRole('button', { name: '+ 처방 고르기' })).toBeTruthy()
    expect(within(box).queryByText(NO_COND)).toBeNull()
    expect(condTitle('MM010')).toBeNull()
  })

  it('AC-3711.4·AC-3711.11: [조건 더하기]를 누르면 `아직 고른 처방이 없어요`와 열린 찾기 칸이 든 조건 칸이 생기고, 고르지 않고 닫으면 칸이 없어지고 [조건 더하기]가 다시 보인다(초점도 그 단추)', async () => {
    const user = userEvent.setup()
    const { props } = drawPt()
    await user.click(ownButton(inRow(0, '가나 물리치료'), '조건 더하기')!)
    const box = condBox('MM010')
    expect(within(box).getByText(NO_COND)).toBeTruthy()
    expect(box.contains(condSearch('MM010'))).toBe(true)
    expect(document.activeElement).toBe(condSearch('MM010'))
    expect(ownButton(inRow(0, '가나 물리치료'), '조건 더하기')).toBeUndefined()
    expect(props.onOpenCatalog).toHaveBeenCalledTimes(1)
    await user.click(button('닫기'))
    expect(condTitle('MM010')).toBeNull()
    const again = ownButton(inRow(0, '가나 물리치료'), '조건 더하기')!
    expect(document.activeElement).toBe(again)
  })

  it('AC-3711.4·AC-3711.11: 고르면 조건 처방 줄이 생기고, 찾기 칸을 닫아도 조건 칸이 남는다(초점은 그 칸의 [+ 처방 고르기])', async () => {
    const user = userEvent.setup()
    drawPt()
    await user.click(ownButton(inRow(0, '가나 물리치료'), '조건 더하기')!)
    await user.click(option(/^마루 전기자극/))
    expect(condsIn('MM010')).toEqual(['마루 전기자극TENS지우기'])
    expect(within(condBox('MM010')).queryByText(NO_COND)).toBeNull()
    await user.keyboard('{Escape}')
    expect(found()).toBeNull()
    expect(condTitle('MM010')).not.toBeNull()
    expect(document.activeElement).toBe(within(condBox('MM010')).getByRole('button', { name: '+ 처방 고르기' }))
    expect(ownButton(inRow(0, '가나 물리치료'), '조건 더하기')).toBeUndefined()
  })

  it('AC-3711.4: 조건 처방 줄의 [지우기]는 그 조건 처방만 뺀다', async () => {
    const user = userEvent.setup()
    drawPt({ groups: [{ id: 'p1', name: '기본 PT', codes: ['MM080'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS'] }], sortOrder: 0 }] })
    await user.click(ownButton(condRow('MM080', '라온 온습포'), '지우기')!)
    expect(condsIn('MM080')).toEqual(['마루 전기자극TENS지우기'])
    expect(codesIn(0)).toHaveLength(1)
  })
})

describe('AC-3711.5: 조건 찾기 칸', () => {
  it('AC-3711.5: 이름표는 `{code}와 같이 받으면 안 셀 처방 찾기`이고, 그 처방은 막혀 `이 처방`, 조건에 있는 처방은 막혀 `조건에 있음`, 나머지는 건수다', async () => {
    const user = userEvent.setup()
    drawPt()
    await openCond(user, 'MM080')
    expect(document.activeElement).toBe(condSearch('MM080'))
    expect(condBox('MM080').contains(condSearch('MM080'))).toBe(true)
    const self = option(/^나라 간섭파/)
    expect(self.disabled).toBe(true)
    expect(self.textContent).toContain('이 처방')
    expect(self.textContent).not.toContain('40건')
    const kept = option(/^라온 온습포/)
    expect(kept.disabled).toBe(true)
    expect(kept.textContent).toContain('조건에 있음')
    expect(kept.textContent).not.toContain('15건')
    // 같은 묶음의 다른 넣는 처방·빼는 처방도 고를 수 있다
    for (const [name, count] of [
      [/^가나 물리치료/, '120건'],
      [/^다솜 충격파/, '30건'],
      [/^바다 도수치료/, '214건'],
    ] as const) {
      expect(option(name).disabled).toBe(false)
      expect(option(name).textContent).toContain(count)
    }
  })

  it('AC-3711.5: 누르면 조건 끝에 들어가고 찾기 칸은 열린 채다(초점은 찾기 칸)', async () => {
    const user = userEvent.setup()
    drawPt()
    await openCond(user, 'MM080')
    await user.click(option(/^마루 전기자극/))
    expect(condsIn('MM080')).toEqual(['라온 온습포MM020지우기', '마루 전기자극TENS지우기'])
    expect(found()).not.toBeNull()
    expect(document.activeElement).toBe(condSearch('MM080'))
    expect(option(/^마루 전기자극/).textContent).toContain('조건에 있음')
  })
})

describe('AC-3711.6: 빼는 처방 줄과 [+ 빼는 처방 고르기]', () => {
  it('AC-3711.6: 줄마다 이름·코드·`{기간 이름} n건`·[지우기]가 있고 아래에 [+ 빼는 처방 고르기]가 있다', () => {
    drawPt()
    expect(outsIn(0)).toEqual(['다솜 충격파ESWT7최근 30일 30건지우기'])
    hasAll(within(outRow(0, '다솜 충격파')).getByText('ESWT7'), 'text-caption text-muted')
    const add = within(groupAt(0)).getByRole('button', { name: '+ 빼는 처방 고르기' })
    expect(follows(outList(0)!, add)).toBe(true)
    // 빼는 처방이 없는 묶음에도 있다
    expect(within(groupAt(1)).getByRole('button', { name: '+ 빼는 처방 고르기' })).toBeTruthy()
  })

  it('AC-3711.6: 누르면 그 자리에 `뺄 처방 찾기` 칸이 열리고 초점이 간다', async () => {
    const user = userEvent.setup()
    const { props } = drawPt()
    await openOut(user, 0)
    expect(document.activeElement).toBe(outSearch())
    expect(outSearch().getAttribute('placeholder')).toBe('처방 이름이나 코드로 찾기')
    expect(groupAt(0).contains(outSearch())).toBe(true)
    expect(follows(outList(0)!, outSearch())).toBe(true)
    expect(within(groupAt(0)).queryByRole('button', { name: '+ 빼는 처방 고르기' })).toBeNull()
    expect(props.onOpenCatalog).toHaveBeenCalledTimes(1)
  })

  it('AC-3711.6: [지우기]는 그 빼는 처방만 뺀다', async () => {
    const user = userEvent.setup()
    drawPt()
    await user.click(ownButton(outRow(0, '다솜 충격파'), '지우기')!)
    expect(outList(0)).toBeNull()
    expect(within(groupAt(0)).getByText(NO_OUT)).toBeTruthy()
    expect(codesIn(0)).toHaveLength(2)
    expect(condsIn('MM080')).toHaveLength(1)
  })
})

describe('AC-3711.7: 묶음째 고르기', () => {
  it('AC-3711.7: 처방이 든 다른 묶음이 있으면 목록 위(층 안 맨 위 줄)에 안내와 묶음마다 [{이름} ({넣는 처방 수}개)] 보조 작은 단추가 있다', async () => {
    const user = userEvent.setup()
    drawPt({ groups: [...PT_GROUPS, { id: 'p4', name: '', codes: ['MM020', 'TENS'], sortOrder: 3 }] })
    await openOut(user, 0)
    const row = screen.getByText(WHOLE).parentElement!
    expect(found()!.parentElement!.contains(row)).toBe(true)
    expect(follows(row, found()!)).toBe(true)
    hasAll(row, 'border-b border-line')
    const picks = within(row).getAllByRole('button')
    // 이 묶음 자신·처방 없는 묶음은 없다. 이름이 비면 '이름 없는 묶음'
    expect(picks.map((pick) => pick.textContent)).toEqual(['도수 (1개)', '이름 없는 묶음 (2개)'])
    for (const pick of picks) hasAll(pick, ds.button.secondarySmall)
  })

  it('AC-3711.7: 처방이 든 다른 묶음이 없으면 묶음째 고르기 줄이 없다', async () => {
    const user = userEvent.setup()
    drawPt({ groups: [PT_GROUPS[0]!, PT_GROUPS[2]!] })
    await openOut(user, 0)
    expect(screen.queryByText(WHOLE)).toBeNull()
    expect(found()).not.toBeNull()
  })

  it('AC-3711.7: 누르면 그 묶음 넣는 처방이 빼는 처방 끝에 복사되고 이 묶음 아래에 글이 있다. 그 묶음은 그대로이고 찾기 칸은 열린 채다', async () => {
    const user = userEvent.setup()
    drawPt()
    await openOut(user, 0)
    await user.click(button('도수 (1개)'))
    expect(head6(outsIn(0))).toEqual(['다솜 충격파', '바다 도수치'])
    const note = within(groupAt(0)).getByText('도수 묶음의 처방 1개를 빼는 처방에 넣었어요.')
    expect(follows(outList(0)!, note)).toBe(true)
    expect(codesIn(1)).toHaveLength(1)
    expect(found()).not.toBeNull()
    expect(document.activeElement).toBe(outSearch())
    await user.click(button('도수 (1개)'))
    expect(within(groupAt(0)).getByText('도수 묶음의 처방은 이미 다 들어 있어요.')).toBeTruthy()
    expect(outsIn(0)).toHaveLength(2)
    expect(within(groupAt(1)).queryByText(/빼는 처방에 넣었어요|이미 다 들어 있어요/)).toBeNull()
  })
})

describe('AC-3711.8: 빼는 처방 찾기 목록', () => {
  it('AC-3711.8: 이 묶음 빼는 처방은 막혀 `빼는 처방에 있음`, 넣는 처방은 막혀 `넣는 처방에 있음`, 다른 묶음 넣는 처방은 건수와 안내, 나머지는 건수다', async () => {
    const user = userEvent.setup()
    drawPt()
    await openOut(user, 0)
    const out = option(/^다솜 충격파/)
    expect(out.disabled).toBe(true)
    expect(out.textContent).toContain('빼는 처방에 있음')
    expect(out.textContent).not.toContain('30건')
    for (const name of [/^가나 물리치료/, /^나라 간섭파/]) {
      expect(option(name).disabled).toBe(true)
      expect(option(name).textContent).toContain('넣는 처방에 있음')
    }
    const other = option(/^바다 도수치료/)
    expect(other.disabled).toBe(false)
    expect(other.textContent).toContain('214건')
    expect(within(other).getByText('도수 묶음 처방이에요. 골라도 그 묶음은 그대로예요')).toBeTruthy()
    const plain = option(/^마루 전기자극/)
    expect(plain.disabled).toBe(false)
    expect(plain.textContent).toContain('9건')
    expect(plain.textContent).not.toContain('묶음 처방이에요')
  })

  it('AC-3711.8: 다른 묶음 넣는 처방을 골라도 그 묶음에서 옮기지 않는다(빼는 처방 끝에 들어가고 찾기 칸은 열린 채)', async () => {
    const user = userEvent.setup()
    drawPt()
    await openOut(user, 0)
    await user.click(option(/^바다 도수치료/))
    expect(head6(outsIn(0))).toEqual(['다솜 충격파', '바다 도수치'])
    expect(codesIn(1)).toHaveLength(1)
    expect(screen.queryByText(/옮겨 왔어요/)).toBeNull()
    expect(document.activeElement).toBe(outSearch())
    expect(option(/^바다 도수치료/).disabled).toBe(true)
  })
})

describe('AC-3711.9: 넣는 처방 찾기 목록', () => {
  it('AC-3711.9: 이 묶음 빼는 처방은 막혀 `빼는 처방에 있음`이고 그 밖은 지금 그대로다(이 묶음에 있음·다른 묶음에서 옮겨 옴)', async () => {
    const user = userEvent.setup()
    drawPt()
    await openAdder(user, 0)
    const out = option(/^다솜 충격파/)
    expect(out.disabled).toBe(true)
    expect(out.textContent).toContain('빼는 처방에 있음')
    expect(out.textContent).not.toContain('30건')
    expect(option(/^가나 물리치료/).textContent).toContain('이 묶음에 있음')
    expect(within(option(/^바다 도수치료/)).getByText('도수에 있어요. 고르면 이 묶음으로 옮겨요')).toBeTruthy()
    // 다른 묶음의 넣는 처방 찾기에서는 막지 않는다
    await openAdder(user, 1)
    expect(option(/^다솜 충격파/).disabled).toBe(false)
  })
})

describe('AC-3711.11: 찾기 칸 닫기·하나만 열림', () => {
  it.each(['esc', 'close'] as const)('AC-3711.11: 빼는 처방 찾기 칸을 닫으면(%s) 초점은 그 묶음의 [+ 빼는 처방 고르기]로 간다', async (how) => {
    const user = userEvent.setup()
    drawPt()
    await openOut(user, 1)
    if (how === 'esc') await user.keyboard('{Escape}')
    else await user.click(button('닫기'))
    expect(found()).toBeNull()
    expect(document.activeElement).toBe(within(groupAt(1)).getByRole('button', { name: '+ 빼는 처방 고르기' }))
  })

  it('AC-3711.11: 조건이 있는 처방의 찾기 칸을 [닫기]로 닫으면 초점은 그 조건 칸의 [+ 처방 고르기]로 간다', async () => {
    const user = userEvent.setup()
    drawPt()
    await openCond(user, 'MM080')
    await user.click(button('닫기'))
    expect(found()).toBeNull()
    expect(document.activeElement).toBe(within(condBox('MM080')).getByRole('button', { name: '+ 처방 고르기' }))
  })

  it('AC-3711.11: 찾기 칸은 화면에 하나만 열린다(넣는·빼는·조건 찾기 칸을 차례로 열어도)', async () => {
    const user = userEvent.setup()
    const { props } = drawPt()
    await openAdder(user, 0)
    await openOut(user, 1)
    expect(screen.getAllByRole('list', { name: '찾은 처방' })).toHaveLength(1)
    expect(groupAt(1).contains(found())).toBe(true)
    expect(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' })).toBeTruthy()
    await openCond(user, 'MM080')
    expect(screen.getAllByRole('list', { name: '찾은 처방' })).toHaveLength(1)
    expect(condBox('MM080').contains(found())).toBe(true)
    expect(within(groupAt(1)).getByRole('button', { name: '+ 빼는 처방 고르기' })).toBeTruthy()
    await user.click(ownButton(inRow(0, '가나 물리치료'), '조건 더하기')!)
    expect(screen.getAllByRole('textbox', { name: /찾기$/ })).toHaveLength(1)
    expect(screen.getAllByRole('list', { name: '찾은 처방' })).toHaveLength(1)
    expect(condBox('MM010').contains(found())).toBe(true)
    expect(within(condBox('MM080')).getByRole('button', { name: '+ 처방 고르기' })).toBeTruthy()
    expect(props.onOpenCatalog).toHaveBeenCalledTimes(4)
  })
})

describe('AC-3711.12: [지우기] 뒤 초점', () => {
  it('AC-3711.12: 넣는 처방 [지우기] 뒤 초점은 같은 목록의 다음 줄 [지우기], 없으면 앞 줄, 없으면 [+ 처방 넣기]다', async () => {
    const user = userEvent.setup()
    drawPt({ groups: [{ id: 'p1', name: '기본 PT', codes: ['MM010', 'MM080', 'TH01'], sortOrder: 0 }] })
    await user.click(ownButton(inRow(0, '가나 물리치료'), '지우기')!)
    expect(document.activeElement).toBe(ownButton(inRow(0, '나라 간섭파'), '지우기'))
    await user.click(ownButton(inRow(0, '바다 도수치료'), '지우기')!)
    expect(document.activeElement).toBe(ownButton(inRow(0, '나라 간섭파'), '지우기'))
    await user.click(ownButton(inRow(0, '나라 간섭파'), '지우기')!)
    expect(document.activeElement).toBe(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' }))
  })

  it('AC-3711.12: 빼는 처방 [지우기] 뒤 초점은 같은 목록의 다음 줄 [지우기], 없으면 앞 줄, 없으면 [+ 빼는 처방 고르기]다', async () => {
    const user = userEvent.setup()
    drawPt({ groups: [{ id: 'p1', name: '기본 PT', codes: ['MM010'], out: ['ESWT7', 'MM020', 'TENS'], sortOrder: 0 }] })
    await user.click(ownButton(outRow(0, '다솜 충격파'), '지우기')!)
    expect(document.activeElement).toBe(ownButton(outRow(0, '라온 온습포'), '지우기'))
    await user.click(ownButton(outRow(0, '마루 전기자극'), '지우기')!)
    expect(document.activeElement).toBe(ownButton(outRow(0, '라온 온습포'), '지우기'))
    await user.click(ownButton(outRow(0, '라온 온습포'), '지우기')!)
    expect(document.activeElement).toBe(within(groupAt(0)).getByRole('button', { name: '+ 빼는 처방 고르기' }))
  })

  it('AC-3711.12: 조건 처방 [지우기] 뒤 초점은 다음 줄 [지우기], 없으면 앞 줄, 다 지워 조건 칸이 없어지면 그 처방의 [조건 더하기]다', async () => {
    const user = userEvent.setup()
    drawPt({ groups: [{ id: 'p1', name: '기본 PT', codes: ['MM010', 'MM080'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS', 'ESWT7'] }], sortOrder: 0 }] })
    await user.click(ownButton(condRow('MM080', '라온 온습포'), '지우기')!)
    expect(document.activeElement).toBe(ownButton(condRow('MM080', '마루 전기자극'), '지우기'))
    await user.click(ownButton(condRow('MM080', '다솜 충격파'), '지우기')!)
    expect(document.activeElement).toBe(ownButton(condRow('MM080', '마루 전기자극'), '지우기'))
    await user.click(ownButton(condRow('MM080', '마루 전기자극'), '지우기')!)
    expect(condTitle('MM080')).toBeNull()
    expect(document.activeElement).toBe(ownButton(inRow(0, '나라 간섭파'), '조건 더하기'))
  })

  it('AC-3711.12·AC-3710.6: 조건이 있는 넣는 처방을 지우면 그 조건 칸도 없어지고 초점은 다음 줄 [지우기]다', async () => {
    const user = userEvent.setup()
    drawPt({ groups: [{ id: 'p1', name: '기본 PT', codes: ['MM080', 'MM010'], cond: [{ code: 'MM080', unless: ['MM020'] }], sortOrder: 0 }] })
    await user.click(ownButton(inRow(0, '나라 간섭파'), '지우기')!)
    expect(condTitle('MM080')).toBeNull()
    expect(document.activeElement).toBe(ownButton(inRow(0, '가나 물리치료'), '지우기'))
  })
})

describe('AC-3711.13: [저장]', () => {
  it('AC-3711.13: 빼는 처방·조건을 고친 뒤 [저장]하면 forSave 값(out·cond 포함)으로 한 번 부른다', async () => {
    const user = userEvent.setup()
    const { props } = drawPt()
    await openOut(user, 0)
    await user.click(option(/^마루 전기자극/))
    await user.click(button('닫기'))
    await user.click(ownButton(inRow(0, '가나 물리치료'), '조건 더하기')!)
    await user.click(option(/^라온 온습포/))
    await user.click(button('저장'))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledWith([
      {
        id: 'p1',
        name: '기본 PT',
        codes: ['MM010', 'MM080'],
        sortOrder: 0,
        out: ['ESWT7', 'TENS'],
        cond: [
          { code: 'MM080', unless: ['MM020'] },
          { code: 'MM010', unless: ['MM020'] },
        ],
      },
      { id: 'p2', name: '도수', codes: ['TH01'], sortOrder: 1 },
      { id: 'p3', name: '빈 묶음', codes: [], sortOrder: 2 },
    ])
  })

  it('AC-3711.13: 고치지 않고 저장하면 받은 빼는 처방·조건이 그대로이고, 칸이 없던 묶음은 지금 모양 그대로다', async () => {
    const user = userEvent.setup()
    const { props } = drawPt()
    await user.click(button('저장'))
    expect(vi.mocked(props.onSave).mock.calls[0]![0]).toStrictEqual([
      { id: 'p1', name: '기본 PT', codes: ['MM010', 'MM080'], sortOrder: 0, out: ['ESWT7'], cond: [{ code: 'MM080', unless: ['MM020'] }] },
      { id: 'p2', name: '도수', codes: ['TH01'], sortOrder: 1 },
      { id: 'p3', name: '빈 묶음', codes: [], sortOrder: 2 },
    ])
  })

  it('AC-3711.13·AC-3710.11: 빼는 처방·조건을 고쳐도 받은 묶음은 바뀌지 않는다', async () => {
    const user = userEvent.setup()
    const before = JSON.parse(JSON.stringify(PT_GROUPS))
    drawPt()
    await openOut(user, 0)
    await user.click(option(/^마루 전기자극/))
    await user.click(button('도수 (1개)'))
    await openCond(user, 'MM080')
    await user.click(option(/^마루 전기자극/))
    await user.click(ownButton(condRow('MM080', '라온 온습포'), '지우기')!)
    await user.click(ownButton(outRow(0, '다솜 충격파'), '지우기')!)
    await user.click(ownButton(inRow(0, '나라 간섭파'), '지우기')!)
    expect(PT_GROUPS).toEqual(before)
  })
})

describe('AC-3711.14: 휴대폰 모양(768px 미만)', () => {
  it('AC-3711.14: 새 단추([조건 더하기]·[지우기]·[+ 빼는 처방 고르기]·[+ 처방 고르기]·묶음째 고르기)는 휴대폰에서 44px 이상이다', async () => {
    const user = userEvent.setup()
    drawPt()
    const texts = [
      ownButton(inRow(0, '가나 물리치료'), '조건 더하기')!,
      ownButton(inRow(0, '가나 물리치료'), '지우기')!,
      ownButton(outRow(0, '다솜 충격파'), '지우기')!,
      ownButton(condRow('MM080', '라온 온습포'), '지우기')!,
      within(groupAt(0)).getByRole('button', { name: '+ 빼는 처방 고르기' }),
      within(condBox('MM080')).getByRole('button', { name: '+ 처방 고르기' }),
    ]
    for (const text of texts) hasAll(text, 'max-md:min-h-11')
    await openOut(user, 0)
    // 묶음째 고르기는 ds 보조 작은 단추(휴대폰 44px)
    hasAll(button('도수 (1개)'), 'max-md:h-11')
  })

  it('AC-3711.14: 두 칸 제목·빼는 처방 목록·빈 글·고르기 칸·묶음째 글·조건 칸은 휴대폰에서 들여 쓰지 않는다', async () => {
    const user = userEvent.setup()
    drawPt()
    const blocks: Element[] = [
      within(groupAt(0)).getByText('넣는 처방').closest('p')!,
      within(groupAt(0)).getByText('빼는 처방').closest('p')!,
      outList(0)!,
      within(groupAt(1)).getByText(NO_OUT),
      within(groupAt(1)).getByRole('button', { name: '+ 빼는 처방 고르기' }).parentElement!,
      condBox('MM080'),
    ]
    await openOut(user, 0)
    await user.click(button('도수 (1개)'))
    blocks.push(within(groupAt(0)).getByText('도수 묶음의 처방 1개를 빼는 처방에 넣었어요.'), outSearch().parentElement!.parentElement!)
    for (const block of blocks) {
      expect(classOf(block).some((name) => /^ml-/.test(name)), block.textContent ?? '').toBe(true)
      hasAll(block, 'max-md:ml-0')
    }
  })

  it('AC-3711.14·AC-1215.1: 빼는 처방·조건 처방 목록에도 번호·점 표시가 없다(list-none)', async () => {
    const user = userEvent.setup()
    const { view } = drawPt()
    await openCond(user, 'MM080')
    const lists = [...view.container.querySelectorAll('ol, ul')]
    expect(lists.length).toBeGreaterThanOrEqual(5)
    for (const list of lists) hasAll(list, 'list-none')
  })

  it('AC-3711.14: 상자 안 상자가 없다(빼는 처방 찾기 칸·조건 칸 안 찾기 칸)', async () => {
    const user = userEvent.setup()
    drawPt({ catalogState: 'failed' })
    await openOut(user, 0)
    expect(nestedBoxes(document.body)).toEqual([])
    await openCond(user, 'MM080')
    expect(nestedBoxes(document.body)).toEqual([])
  })
})
