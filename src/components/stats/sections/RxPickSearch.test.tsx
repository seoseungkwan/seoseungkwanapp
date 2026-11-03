// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { rxCatalog } from '../rxPickView'
import { codeKey, type RxLine } from '../view'
import { RxPickSearch } from './RxPickSearch'

// 찾기 칸·목록·칩·[모두 지우기] (rx-picker REQ-802·803·809, 시안 docs/mockups/rx-picker). props만 받는다. 처방 이름·코드·건수는 모두 이 파일에서 지어낸 값이다

type Props = ComponentProps<typeof RxPickSearch>

const LINES: RxLine[] = [
  { code: 'TH01', name: '가상 도수치료' },
  { code: 'TH02', name: '나무 온열치료' },
  { code: 'IN03', name: '다람 주사' },
]
const COUNTS = new Map([
  ['TH01', 1234],
  ['TH02', 5],
])
const HELP = '불러온 숫자에 있는 처방만 찾아요. 고른 처방은 다음에도 남아요.'
const EMPTY_TITLE = '아직 고른 처방이 없어요'
const EMPTY_BODY = '위 칸에 이름이나 코드를 적어 찾아보세요. 여러 개를 고를 수 있어요.'
const READING = '처방 목록을 더 읽는 중이에요'
const FAILED = '전체 처방 목록을 읽지 못해 지금 보는 기간의 처방만 보여요.'

const scrollIntoView = vi.fn()

beforeEach(() => {
  scrollIntoView.mockReset()
  // jsdom에는 scrollIntoView가 없다 → 누구에게 불렀는지 본다
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrollIntoView, configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  delete (Element.prototype as Partial<Element>).scrollIntoView
  vi.restoreAllMocks()
})

function propsOf(over: Partial<Props> = {}): Props {
  return {
    catalog: LINES,
    picks: [],
    counts: COUNTS,
    catalogState: 'ready',
    disabled: false,
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onClear: vi.fn(),
    onOpen: vi.fn(),
    onRetryCatalog: vi.fn(),
    ...over,
  }
}

function draw(over: Partial<Props> = {}) {
  const props = propsOf(over)
  render(<RxPickSearch {...props} />)
  return props
}

// 부르는 쪽(훅)처럼 고른 처방을 들고 있는 틀. 코드는 대문자로 견주고 빠질 때는 들고 있는 글자를 쓴다
function Live({ start = [], spy }: { start?: readonly RxLine[]; spy: Props }) {
  const [picks, setPicks] = useState<readonly RxLine[]>(start)
  return (
    <RxPickSearch
      {...spy}
      picks={picks}
      onToggle={(line) => {
        spy.onToggle(line)
        setPicks((now) => (now.some((pick) => codeKey(pick.code) === codeKey(line.code)) ? now.filter((pick) => codeKey(pick.code) !== codeKey(line.code)) : [...now, line]))
      }}
      onRemove={(code) => {
        spy.onRemove(code)
        setPicks((now) => now.filter((pick) => pick.code !== code))
      }}
      onClear={() => {
        spy.onClear()
        setPicks([])
      }}
    />
  )
}

function drawLive(start: readonly RxLine[] = [], over: Partial<Props> = {}) {
  const spy = propsOf(over)
  render(<Live start={start} spy={spy} />)
  return spy
}

const combo = () => screen.getByRole('combobox') as HTMLInputElement
const list = () => screen.queryByRole('listbox')
const options = () => screen.getAllByRole('option')
const namesInList = () => screen.queryAllByRole('option').map((row) => row.textContent)
const focusCombo = () => act(() => combo().focus())
const typeText = (text: string) => fireEvent.change(combo(), { target: { value: text } })
const press = (key: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(combo(), { key, ...init })
const classOf = (element: Element) => element.getAttribute('class')!.split(/\s+/)
const hasAll = (element: Element, classes: string) => expect(classOf(element)).toEqual(expect.arrayContaining(classes.split(/\s+/).filter(Boolean)))
// 칸 이름(label)·칸·도움말을 함께 담는 틀
const fieldRoot = () => screen.getByText('처방 찾기').parentElement!
const chipNames = () => screen.queryAllByRole('button', { name: /빼기$/ }).map((button) => button.getAttribute('aria-label'))

describe('AC-802.1: 찾기 칸', () => {
  it('AC-802.1: 칸 이름·안내 글·도움말이 있고 ds.input을 쓰며 넓은 화면에서 폭은 480px까지다', () => {
    draw()
    const input = screen.getByRole('combobox', { name: '처방 찾기' })
    expect(input.getAttribute('placeholder')).toBe('이름이나 코드를 적어 주세요')
    expect(screen.getByText(HELP)).toBeTruthy()
    hasAll(input, ds.input)
    hasAll(fieldRoot(), 'max-w-120')
  })

  it('AC-802.1: 도움말은 칸의 설명으로 이어져 있다', () => {
    draw()
    const help = document.getElementById(combo().getAttribute('aria-describedby')!)
    expect(help?.textContent).toBe(HELP)
  })
})

describe('AC-802.2: 글자를 적지 않으면 전체 목록', () => {
  it('AC-802.2: 그리기만 하면 목록이 닫혀 있고 넓은 읽기를 부르지 않는다', () => {
    const props = draw()
    expect(list()).toBeNull()
    expect(combo().getAttribute('aria-expanded')).toBe('false')
    expect(props.onOpen).not.toHaveBeenCalled()
  })

  it('AC-802.2: 초점이 오면 바로 열리고 부르는 쪽에 알린다', () => {
    const props = draw()
    focusCombo()
    expect(list()).not.toBeNull()
    expect(combo().getAttribute('aria-expanded')).toBe('true')
    expect(props.onOpen).toHaveBeenCalledTimes(1)
  })

  it('AC-802.2: 칸을 누르면 바로 열리고, 초점과 누름이 함께 와도 한 번만 알린다', async () => {
    const props = draw()
    await userEvent.setup().click(combo())
    expect(list()).not.toBeNull()
    expect(props.onOpen).toHaveBeenCalledTimes(1)
  })

  it('AC-802.2: 닫았다가 초점이 있는 칸을 다시 누르면 다시 열리고 다시 알린다(새 숫자를 다시 읽을 기회)', async () => {
    const user = userEvent.setup()
    const props = draw()
    await user.click(combo())
    press('Escape')
    expect(list()).toBeNull()
    await user.click(combo())
    expect(list()).not.toBeNull()
    expect(props.onOpen).toHaveBeenCalledTimes(2)
  })

  it('AC-802.2: 줄은 이름 가나다 차례(같으면 코드 차례)로 나온다', () => {
    const days = [
      {
        day: '2026-11-01',
        rx: [
          { code: 'B2', name: '하늘 치료', patients: 1, newPatients: 0, returning: 1 },
          { code: 'C3', name: '가상 치료', patients: 1, newPatients: 0, returning: 1 },
          { code: 'A1', name: '하늘 치료', patients: 1, newPatients: 0, returning: 1 },
        ],
      },
    ] as unknown as Parameters<typeof rxCatalog>[0]
    draw({ catalog: rxCatalog(days, [], () => true) })
    focusCombo()
    expect(namesInList().map((text) => text!.replace(/0건$/, ''))).toEqual(['가상 치료C3', '하늘 치료A1', '하늘 치료B2'])
  })

  it('AC-802.2: 줄마다 이름·코드(caption muted)·이 기간 건수(세 자리 쉼표)가 있고 건수가 없는 처방은 0건이다', () => {
    draw()
    focusCombo()
    const [first, , third] = options()
    expect(within(first!).getByText('가상 도수치료', { exact: false })).toBeTruthy()
    hasAll(within(first!).getByText('TH01'), 'text-caption text-muted')
    expect(within(first!).getByText('1,234건')).toBeTruthy()
    expect(within(third!).getByText('0건')).toBeTruthy()
  })

  it('AC-802.2: 고른 처방이면 고름이 있고 고르지 않은 처방에는 없다', () => {
    draw({ picks: [LINES[1]!] })
    focusCombo()
    const [first, second] = options()
    expect(within(second!).getByText('고름')).toBeTruthy()
    expect(within(first!).queryByText('고름')).toBeNull()
    expect(first!.getAttribute('aria-selected')).toBe('false')
    expect(second!.getAttribute('aria-selected')).toBe('true')
  })
})

describe('AC-802.3: 글자로 찾기', () => {
  it('AC-802.3: 이름 일부로 찾는다', () => {
    draw()
    typeText('온열')
    expect(options()).toHaveLength(1)
    expect(options()[0]!.textContent).toContain('TH02')
  })

  it('AC-802.3: 코드 일부로 찾는다', () => {
    draw()
    typeText('H0')
    expect(options().map((row) => within(row).getByText(/^TH/).textContent)).toEqual(['TH01', 'TH02'])
  })

  it('AC-802.3: 소문자로 적은 코드와 앞뒤 빈칸도 찾는다', () => {
    draw()
    typeText('  in03 ')
    expect(options()).toHaveLength(1)
    expect(options()[0]!.textContent).toContain('IN03')
  })

  it('AC-802.3: 닫힌 칸에 글자를 적으면 열리고 부르는 쪽에 알린다', () => {
    const props = draw()
    typeText('가상')
    expect(list()).not.toBeNull()
    expect(props.onOpen).toHaveBeenCalledTimes(1)
  })
})

describe('AC-802.4: 맞는 줄이 없을 때', () => {
  it('AC-802.4: 적은 글자를 넣은 안내가 나온다(앞뒤 빈칸은 뺀다)', () => {
    draw()
    typeText('  없는글자 ')
    expect(screen.getByText('“없는글자”에 맞는 처방이 없어요. 불러온 숫자에 있는 처방만 찾을 수 있어요.')).toBeTruthy()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('AC-802.4: 적은 글자가 없으면 빈 따옴표 안내를 만들지 않는다', () => {
    draw({ catalog: [] })
    focusCombo()
    expect(document.body.textContent).not.toContain('“”')
    expect(screen.getByText('불러온 숫자에 처방이 없어요.')).toBeTruthy()
  })

  it('AC-802.4: 빈칸만 적으면 글자가 없는 것과 같아 전체 목록이다', () => {
    draw()
    typeText('   ')
    expect(options()).toHaveLength(3)
  })
})

describe('AC-802.6: 목록을 더 읽는 중·읽기 실패의 글자', () => {
  it('AC-802.6: 읽는 중이면 받은 줄이 먼저 나오고 그 아래에 안내가 있다', () => {
    draw({ catalogState: 'reading' })
    focusCombo()
    expect(options()).toHaveLength(3)
    const note = screen.getByText(READING)
    expect(list()!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(FAILED)).toBeNull()
  })

  it('AC-802.6: 처방이 아직 없어도 읽는 중 안내만 나오고 없다는 말을 먼저 하지 않는다', () => {
    draw({ catalog: [], catalogState: 'reading' })
    focusCombo()
    expect(screen.getByText(READING)).toBeTruthy()
    expect(screen.queryByText('불러온 숫자에 처방이 없어요.')).toBeNull()
  })

  it('AC-802.6: 읽기에 실패하면 같은 줄들과 안내, [다시 읽기]가 있고 누르면 다시 읽는다', async () => {
    const props = draw({ catalogState: 'failed' })
    await userEvent.setup().click(combo())
    expect(options()).toHaveLength(3)
    expect(screen.getByText(FAILED)).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(props.onRetryCatalog).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(combo())
  })

  it('AC-802.6: 읽기에 실패해도 칩은 그대로다', () => {
    draw({ catalogState: 'failed', picks: [LINES[0]!] })
    expect(screen.getByRole('button', { name: '가상 도수치료 빼기' })).toBeTruthy()
  })

  it('AC-802.6: 다 읽었거나 아직 안 읽었으면 두 안내 모두 없다', () => {
    draw({ catalogState: 'ready' })
    focusCombo()
    expect(options()).toHaveLength(3)
    expect(screen.queryByText(READING)).toBeNull()
    expect(screen.queryByText(FAILED)).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 읽기' })).toBeNull()
    cleanup()
    draw({ catalogState: 'idle' })
    focusCombo()
    expect(options()).toHaveLength(3)
    expect(screen.queryByText(READING)).toBeNull()
    expect(screen.queryByText(FAILED)).toBeNull()
  })
})

describe('AC-802.7: 열린 목록에서 새 숫자가 저장됨(훅이 catalogState를 idle로 되돌림)', () => {
  it('AC-802.7: 열린 목록의 상태가 ready에서 idle로 돌아오면 onOpen을 한 번 더 부르고, 그대로 다시 그려도 더 부르지 않는다', () => {
    const props = propsOf({ catalogState: 'ready' })
    const { rerender } = render(<RxPickSearch {...props} />)
    focusCombo()
    expect(props.onOpen).toHaveBeenCalledTimes(1)
    rerender(<RxPickSearch {...props} catalogState="idle" />)
    expect(props.onOpen).toHaveBeenCalledTimes(2)
    rerender(<RxPickSearch {...props} catalogState="idle" />)
    const fresh = vi.fn()
    rerender(<RxPickSearch {...props} catalogState="idle" onOpen={fresh} />)
    expect(props.onOpen).toHaveBeenCalledTimes(2)
    expect(fresh).not.toHaveBeenCalled()
  })

  it('AC-802.7: 닫힌 목록은 ready에서 idle로 돌아와도 부르지 않고, 다음에 열 때 한 번만 부른다', () => {
    const props = propsOf({ catalogState: 'ready' })
    const { rerender } = render(<RxPickSearch {...props} />)
    rerender(<RxPickSearch {...props} catalogState="idle" />)
    expect(props.onOpen).not.toHaveBeenCalled()
    focusCombo()
    expect(list()).not.toBeNull()
    expect(props.onOpen).toHaveBeenCalledTimes(1)
  })

  it('AC-802.7: 처음 열 때 상태가 아직 idle이어도 onOpen은 한 번뿐이고 읽기가 끝나도 더 부르지 않는다', () => {
    const props = propsOf({ catalogState: 'idle' })
    const { rerender } = render(<RxPickSearch {...props} />)
    expect(props.onOpen).not.toHaveBeenCalled()
    focusCombo()
    expect(props.onOpen).toHaveBeenCalledTimes(1)
    rerender(<RxPickSearch {...props} catalogState="idle" />)
    rerender(<RxPickSearch {...props} catalogState="reading" />)
    rerender(<RxPickSearch {...props} catalogState="ready" />)
    expect(props.onOpen).toHaveBeenCalledTimes(1)
  })

  it('AC-802.7: 막힌 목록은 부르지 않는다(처음부터 막힘, 열린 뒤 막힘)', () => {
    const blocked = propsOf({ catalogState: 'ready', disabled: true })
    const first = render(<RxPickSearch {...blocked} />)
    first.rerender(<RxPickSearch {...blocked} catalogState="idle" />)
    expect(blocked.onOpen).not.toHaveBeenCalled()
    first.unmount()

    const later = propsOf({ catalogState: 'ready' })
    const second = render(<RxPickSearch {...later} />)
    focusCombo()
    expect(later.onOpen).toHaveBeenCalledTimes(1)
    second.rerender(<RxPickSearch {...later} disabled />)
    second.rerender(<RxPickSearch {...later} disabled catalogState="idle" />)
    expect(later.onOpen).toHaveBeenCalledTimes(1)
  })
})

describe('AC-802.8: 목록에서 고르고 빼기', () => {
  it('AC-802.8: 고르지 않은 줄을 누르면 끝에 더해지고 글자가 지워지며 목록은 열린 채이고 초점은 칸에 있다', async () => {
    const user = userEvent.setup()
    const spy = drawLive([LINES[2]!])
    await user.click(combo())
    await user.type(combo(), '온열')
    await user.click(options()[0]!)
    expect(spy.onToggle).toHaveBeenCalledWith(LINES[1])
    expect(chipNames()).toEqual(['다람 주사 빼기', '나무 온열치료 빼기'])
    expect(combo().value).toBe('')
    expect(list()).not.toBeNull()
    expect(document.activeElement).toBe(combo())
  })

  it('AC-802.8: 고른 줄을 다시 누르면 같은 방식으로 빠진다', async () => {
    const user = userEvent.setup()
    drawLive([LINES[0]!])
    await user.click(combo())
    await user.type(combo(), '도수')
    await user.click(options()[0]!)
    expect(chipNames()).toEqual([])
    expect(combo().value).toBe('')
    expect(list()).not.toBeNull()
    expect(document.activeElement).toBe(combo())
  })

  it('AC-802.8: 고르는 개수에 한도가 없다(250개)', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ code: `Z${String(i).padStart(3, '0')}`, name: `지은 처방 ${i}` }))
    drawLive([], { catalog: many })
    focusCombo()
    for (let i = 0; i < 250; i += 1) fireEvent.click(document.querySelectorAll('[role="option"]')[i]!)
    expect(document.querySelectorAll('button[aria-label$="빼기"]')).toHaveLength(250)
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(250)
  }, 60_000)
})

describe('AC-802.9: 키보드', () => {
  // 초점이 칸에 있고 Esc로 닫은 상태(초점만으로 열리는 길과 나눈다)
  const closedWithFocus = () => {
    focusCombo()
    expect(list()).not.toBeNull()
    press('Escape')
    expect(list()).toBeNull()
  }

  it('AC-802.9: 닫혀 있으면 ↓가 먼저 열고 줄은 아직 옮기지 않는다', () => {
    const props = draw()
    closedWithFocus()
    press('ArrowDown')
    expect(list()).not.toBeNull()
    expect(combo().hasAttribute('aria-activedescendant')).toBe(false)
    expect(props.onOpen).toHaveBeenCalledTimes(2)
  })

  it('AC-802.9: 닫혀 있으면 ↑도 먼저 연다', () => {
    draw()
    closedWithFocus()
    press('ArrowUp')
    expect(list()).not.toBeNull()
  })

  it('AC-802.9: ↓↑로 옮기면 aria-activedescendant가 그 줄을 가리키고 그 줄이 보이게 민다', () => {
    draw()
    focusCombo()
    press('ArrowDown')
    expect(combo().getAttribute('aria-activedescendant')).toBe(options()[0]!.id)
    press('ArrowDown')
    expect(combo().getAttribute('aria-activedescendant')).toBe(options()[1]!.id)
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(options()[1])
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
    press('ArrowUp')
    expect(combo().getAttribute('aria-activedescendant')).toBe(options()[0]!.id)
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(options()[0])
  })

  it('AC-802.9: 끝 줄과 첫 줄에서 더 밀어도 벗어나지 않는다', () => {
    draw()
    focusCombo()
    for (let i = 0; i < 5; i += 1) press('ArrowDown')
    expect(combo().getAttribute('aria-activedescendant')).toBe(options()[2]!.id)
    for (let i = 0; i < 5; i += 1) press('ArrowUp')
    expect(combo().getAttribute('aria-activedescendant')).toBe(options()[0]!.id)
  })

  it('AC-802.9: ↓↑는 글자 칸의 커서를 옮기지 않는다', () => {
    draw()
    focusCombo()
    expect(press('ArrowDown')).toBe(false)
    expect(press('ArrowUp')).toBe(false)
  })

  it('AC-802.9: Enter는 옮겨 간 줄을 고른다', () => {
    const props = draw()
    focusCombo()
    press('ArrowDown')
    press('ArrowDown')
    press('Enter')
    expect(props.onToggle).toHaveBeenCalledWith(LINES[1])
    expect(list()).not.toBeNull()
  })

  it('AC-802.9: 옮겨 간 줄이 없으면 Enter는 첫 줄을 고르고, 다시 누르면 빠지는 쪽으로 간다', () => {
    drawLive()
    focusCombo()
    press('Enter')
    expect(chipNames()).toEqual(['가상 도수치료 빼기'])
    press('Enter')
    expect(chipNames()).toEqual([])
  })

  it('AC-802.9: 글자를 바꾸면 옮겨 간 자리가 지워지고 줄어든 목록에서 벗어나지 않는다', () => {
    draw()
    focusCombo()
    press('ArrowDown')
    press('ArrowDown')
    expect(combo().hasAttribute('aria-activedescendant')).toBe(true)
    typeText('온열')
    expect(options()).toHaveLength(1)
    expect(combo().hasAttribute('aria-activedescendant')).toBe(false)
  })

  it('AC-802.9: 목록이 받은 값으로 줄어들어도 옮겨 간 자리는 남은 끝 줄을 가리킨다', () => {
    const props = propsOf()
    const { rerender } = render(<RxPickSearch {...props} />)
    focusCombo()
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    rerender(<RxPickSearch {...props} catalog={LINES.slice(0, 1)} />)
    expect(options()).toHaveLength(1)
    expect(combo().getAttribute('aria-activedescendant')).toBe(options()[0]!.id)
  })

  it('AC-802.9: Esc는 목록을 닫는다', () => {
    draw()
    focusCombo()
    press('ArrowDown')
    expect(combo().hasAttribute('aria-activedescendant')).toBe(true)
    press('Escape')
    expect(list()).toBeNull()
    expect(combo().getAttribute('aria-expanded')).toBe('false')
    expect(combo().hasAttribute('aria-activedescendant')).toBe(false)
  })

  it('AC-802.9: 한글 조합 중의 Enter는 아무것도 고르지 않는다', () => {
    const props = draw()
    focusCombo()
    press('ArrowDown')
    expect(combo().hasAttribute('aria-activedescendant')).toBe(true)
    press('Enter', { isComposing: true })
    expect(props.onToggle).not.toHaveBeenCalled()
    press('Enter')
    expect(props.onToggle).toHaveBeenCalledTimes(1)
  })

  it('AC-802.9: 사파리처럼 조합이 막 끝난 Enter(keyCode 229)도 아무것도 고르지 않는다', () => {
    const props = draw()
    focusCombo()
    press('Enter', { keyCode: 229 })
    expect(props.onToggle).not.toHaveBeenCalled()
    press('Enter', { keyCode: 13 })
    expect(props.onToggle).toHaveBeenCalledTimes(1)
  })

  it('AC-802.9: 닫힌 목록에서 Enter는 보이지 않는 줄을 고르지 않는다', () => {
    const props = draw()
    closedWithFocus()
    press('Enter')
    expect(props.onToggle).not.toHaveBeenCalled()
    expect(list()).toBeNull()
  })
})

describe('AC-802.10: 닫기·떠 있는 층·접근성', () => {
  it('AC-802.10: [닫기]를 누르면 닫히고 초점은 칸에 남는다', async () => {
    const user = userEvent.setup()
    draw()
    await user.click(combo())
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(list()).toBeNull()
    expect(document.activeElement).toBe(combo())
  })

  it('AC-802.10: 칸 밖을 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    render(
      <>
        <RxPickSearch {...propsOf()} />
        <p>칸 밖의 글</p>
      </>,
    )
    await user.click(combo())
    expect(list()).not.toBeNull()
    await user.click(screen.getByText('칸 밖의 글'))
    expect(list()).toBeNull()
    expect(combo().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-802.10: 칸의 이름을 눌러도 닫혔다 열리지 않는다', async () => {
    const user = userEvent.setup()
    const props = draw()
    await user.click(combo())
    await user.click(screen.getByText('처방 찾기'))
    expect(list()).not.toBeNull()
    expect(props.onOpen).toHaveBeenCalledTimes(1)
  })

  it('AC-802.10: 목록의 줄·안내·단추를 누르는 동안 초점이 칸을 떠나지 않는다', () => {
    draw({ catalogState: 'failed' })
    focusCombo()
    // fireEvent는 preventDefault를 부르면 false를 돌려준다
    expect(fireEvent.mouseDown(options()[0]!)).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: '닫기' }))).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: '다시 읽기' }))).toBe(false)
    expect(fireEvent.mouseDown(screen.getByText(FAILED))).toBe(false)
  })

  it('AC-802.10: 키보드로 칸에서 층의 단추로 옮겨 가면 열린 채이고, 칸 밖으로 나가면 닫힌다', async () => {
    const user = userEvent.setup()
    render(
      <>
        <RxPickSearch {...propsOf({ catalogState: 'failed' })} />
        <button type="button">칸 밖의 단추</button>
      </>,
    )
    await user.click(combo())
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '다시 읽기' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' }))
    expect(list()).not.toBeNull()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '칸 밖의 단추' }))
    expect(list()).toBeNull()
  })

  it('AC-802.10: 목록은 칸 바로 아래 떠 있는 층이고 줄 부분은 264px에서 세로로 밀린다', () => {
    draw()
    focusCombo()
    const layer = list()!.parentElement!
    hasAll(layer, 'absolute top-full rounded-float shadow-float')
    hasAll(layer.parentElement!, 'relative')
    expect(layer.parentElement!.contains(combo())).toBe(true)
    hasAll(list()!, 'max-h-66 overflow-y-auto')
  })

  it('AC-802.10: 칸·목록·줄의 역할과 이름', () => {
    draw({ picks: [LINES[0]!] })
    expect(combo().getAttribute('aria-expanded')).toBe('false')
    expect(combo().getAttribute('aria-autocomplete')).toBe('list')
    focusCombo()
    const box = screen.getByRole('listbox', { name: '찾은 처방' })
    expect(combo().getAttribute('aria-controls')).toBe(box.id)
    expect(combo().getAttribute('aria-expanded')).toBe('true')
    expect(box.getAttribute('aria-multiselectable')).toBe('true')
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true')
    expect(options()[1]!.getAttribute('aria-selected')).toBe('false')
  })

  it('AC-802.10: 닫혀 있어도 aria-controls가 가리키는 목록이 문서에 있다', () => {
    draw()
    const box = document.getElementById(combo().getAttribute('aria-controls')!)
    expect(box?.getAttribute('role')).toBe('listbox')
  })

  it('AC-802.10: 줄 높이와 [닫기]는 44px 이상이다', () => {
    draw()
    focusCombo()
    hasAll(options()[0]!, 'min-h-11')
    hasAll(screen.getByRole('button', { name: '닫기' }), 'min-h-11')
  })
})

describe('AC-802.12: 대소문자만 다른 코드', () => {
  it('AC-802.12: 저장된 abc가 있으면 목록 줄 ABC는 고름·aria-selected true다', () => {
    draw({ catalog: [{ code: 'ABC', name: '지은 처방' }], picks: [{ code: 'abc', name: '지은 처방' }] })
    focusCombo()
    const [row] = options()
    expect(row!.getAttribute('aria-selected')).toBe('true')
    expect(within(row!).getByText('고름')).toBeTruthy()
  })

  it('AC-802.12: 반대로 저장된 ABC가 있으면 목록 줄 abc도 고름·aria-selected true다', () => {
    draw({ catalog: [{ code: 'abc', name: '지은 처방' }], picks: [{ code: 'ABC', name: '지은 처방' }] })
    focusCombo()
    const [row] = options()
    expect(row!.getAttribute('aria-selected')).toBe('true')
    expect(within(row!).getByText('고름')).toBeTruthy()
  })

  it('AC-802.12: 목록 줄 코드가 소문자여도 대문자 열쇠의 이 기간 건수를 보인다', () => {
    draw({ catalog: [{ code: 'th01', name: '지은 처방' }] })
    focusCombo()
    expect(within(options()[0]!).getByText('1,234건')).toBeTruthy()
  })

  it('AC-802.12: 그 줄을 누르면 더하지 않고 뺀다(칩이 늘지 않는다)', () => {
    const spy = drawLive([{ code: 'abc', name: '지은 처방' }], { catalog: [{ code: 'ABC', name: '지은 처방' }] })
    focusCombo()
    fireEvent.click(options()[0]!)
    expect(spy.onToggle).toHaveBeenCalledWith({ code: 'ABC', name: '지은 처방' })
    expect(chipNames()).toEqual([])
  })

  it('AC-802.12: 칩의 빼기는 저장된 글자를 넘긴다', () => {
    const props = draw({ catalog: [{ code: 'ABC', name: '지은 처방' }], picks: [{ code: 'abc', name: '지은 처방' }] })
    fireEvent.click(screen.getByRole('button', { name: '지은 처방 빼기' }))
    expect(props.onRemove).toHaveBeenCalledWith('abc')
  })
})

describe('AC-803.1: 칩', () => {
  it('AC-803.1: 고른 차례대로 칩(이름 + 빼기 단추)과 [모두 지우기]가 찾기 칸 아래에 있다', () => {
    draw({ picks: [LINES[2]!, LINES[0]!] })
    expect(chipNames()).toEqual(['다람 주사 빼기', '가상 도수치료 빼기'])
    const remove = screen.getByRole('button', { name: '다람 주사 빼기' })
    expect(remove.parentElement!.textContent).toBe('다람 주사')
    const clear = screen.getByRole('button', { name: '모두 지우기' })
    expect(combo().compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(combo().compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(EMPTY_TITLE)).toBeNull()
  })

  it('AC-803.1: 칩의 이름은 받은 이름 그대로다(부르는 쪽이 표 줄의 이름을 넘긴다)', () => {
    draw({ catalog: [{ code: 'TH01', name: '목록의 이름' }], picks: [{ code: 'TH01', name: '표 줄의 이름' }] })
    expect(screen.getByRole('button', { name: '표 줄의 이름 빼기' })).toBeTruthy()
  })

  it('AC-803.1: 칩과 빼기 단추는 32px이다', () => {
    draw({ picks: [LINES[0]!] })
    const remove = screen.getByRole('button', { name: '가상 도수치료 빼기' })
    hasAll(remove.parentElement!, 'h-8')
    hasAll(remove, 'size-8')
  })

  it('AC-803.1: 긴 이름은 칩 안에서 줄어 쪽을 옆으로 밀지 않는다', () => {
    draw({ picks: [{ code: 'L1', name: '아주 긴 이름'.repeat(16) }] })
    const remove = screen.getByRole('button', { name: /빼기$/ })
    hasAll(remove.parentElement!, 'max-w-full')
    hasAll(within(remove.parentElement!).getByText(/아주 긴 이름/), 'min-w-0 truncate')
    hasAll(remove, 'shrink-0')
  })
})

describe('AC-803.2: 칩에서 빼기', () => {
  it('AC-803.2: 빼기를 누르면 칩이 사라지고 초점은 찾기 칸에 오며 목록은 닫혀 있고 넓은 읽기를 부르지 않는다', async () => {
    const spy = drawLive([LINES[0]!, LINES[1]!])
    await userEvent.setup().click(screen.getByRole('button', { name: '가상 도수치료 빼기' }))
    expect(spy.onRemove).toHaveBeenCalledWith('TH01')
    expect(chipNames()).toEqual(['나무 온열치료 빼기'])
    expect(document.activeElement).toBe(combo())
    expect(list()).toBeNull()
    expect(spy.onOpen).not.toHaveBeenCalled()
  })

  it('AC-803.2: 목록이 열려 있었어도 빼면 닫힌다', async () => {
    const user = userEvent.setup()
    drawLive([LINES[0]!])
    await user.click(combo())
    expect(list()).not.toBeNull()
    await user.click(screen.getByRole('button', { name: '가상 도수치료 빼기' }))
    expect(list()).toBeNull()
    expect(document.activeElement).toBe(combo())
  })

  it('AC-803.2: 그 처방을 다시 고르면 맨 뒤에 붙는다', async () => {
    const user = userEvent.setup()
    drawLive([LINES[0]!, LINES[1]!])
    await user.click(screen.getByRole('button', { name: '가상 도수치료 빼기' }))
    await user.click(combo())
    await user.click(options()[0]!)
    expect(chipNames()).toEqual(['나무 온열치료 빼기', '가상 도수치료 빼기'])
  })
})

describe('AC-803.3: [모두 지우기]', () => {
  it('AC-803.3: 다시 묻지 않고 모두 빠지며 빈 안내가 나온다', async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    const spy = drawLive([LINES[0]!, LINES[1]!])
    await userEvent.setup().click(screen.getByRole('button', { name: '모두 지우기' }))
    vi.unstubAllGlobals()
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(spy.onClear).toHaveBeenCalledTimes(1)
    expect(chipNames()).toEqual([])
    expect(screen.getByText(EMPTY_TITLE)).toBeTruthy()
  })

  it('AC-803.3: 눌렀던 단추가 사라지므로 초점은 찾기 칸으로 오고 목록은 열지 않는다', async () => {
    const spy = drawLive([LINES[0]!])
    await userEvent.setup().click(screen.getByRole('button', { name: '모두 지우기' }))
    expect(document.activeElement).toBe(combo())
    expect(list()).toBeNull()
    expect(spy.onOpen).not.toHaveBeenCalled()
  })
})

describe('AC-803.4: 고른 처방이 없을 때', () => {
  it('AC-803.4: 칩 없이 빈 안내 두 줄이 있다', () => {
    draw()
    expect(screen.getByText(EMPTY_TITLE)).toBeTruthy()
    expect(screen.getByText(EMPTY_BODY)).toBeTruthy()
    expect(chipNames()).toEqual([])
    expect(screen.queryByRole('button', { name: '모두 지우기' })).toBeNull()
  })
})

describe('AC-803.5: 이름이 빈 글자이거나 코드와 같은 처방', () => {
  const NAMELESS: RxLine[] = [
    { code: 'X1', name: '' },
    { code: 'X2', name: 'X2' },
    { code: 'X3', name: '   ' },
  ]

  it.each(NAMELESS)('AC-803.5: 칩은 코드 하나만 보이고 빼기 단추 이름도 그 코드다 ($code)', (line) => {
    draw({ picks: [line] })
    const remove = screen.getByRole('button', { name: `${line.code} 빼기` })
    expect(remove.parentElement!.textContent).toBe(line.code)
  })

  it.each(NAMELESS)('AC-803.5: 목록 줄도 코드 하나만 보인다 ($code)', (line) => {
    draw({ catalog: [line] })
    focusCombo()
    expect(options()[0]!.textContent).toBe(`${line.code}0건`)
  })
})

describe('AC-809.2: 768px 미만', () => {
  it('AC-809.2: 찾기 칸은 전체 폭이고 글자는 16px이다', () => {
    draw()
    hasAll(fieldRoot(), 'max-md:max-w-none')
    hasAll(combo(), 'w-full max-md:text-lead')
  })

  it('AC-809.2: 칩·빼기 단추·[모두 지우기]는 44px 이상이다', () => {
    draw({ picks: [LINES[0]!] })
    const remove = screen.getByRole('button', { name: '가상 도수치료 빼기' })
    hasAll(remove.parentElement!, 'max-md:h-11')
    hasAll(remove, 'max-md:size-11')
    hasAll(screen.getByRole('button', { name: '모두 지우기' }), 'max-md:min-h-11')
  })
})

describe('AC-812.1: 고른 처방을 읽는 동안 막힌 칸(자리는 TASK-9가 잇는다)', () => {
  it('AC-812.1: aria-disabled이고 초점·누름·키·글자로 목록이 열리지 않으며 넓은 읽기를 부르지 않는다', async () => {
    const props = draw({ disabled: true })
    expect(combo().getAttribute('aria-disabled')).toBe('true')
    await userEvent.setup().click(combo())
    focusCombo()
    press('ArrowDown')
    typeText('가상')
    expect(list()).toBeNull()
    expect(combo().value).toBe('')
    expect(props.onOpen).not.toHaveBeenCalled()
  })

  it('AC-812.1: 막혀 있으면 빈 안내를 먼저 보이지 않는다', () => {
    draw({ disabled: true })
    expect(combo().getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByText(EMPTY_TITLE)).toBeNull()
    expect(screen.queryByText(EMPTY_BODY)).toBeNull()
  })

  it('AC-812.1: 막혀 있지 않으면 aria-disabled가 없고 readOnly도 아니다', () => {
    draw()
    expect(combo().hasAttribute('aria-disabled')).toBe(false)
    expect(combo().readOnly).toBe(false)
    expect(screen.getByText(EMPTY_TITLE)).toBeTruthy()
  })
})
