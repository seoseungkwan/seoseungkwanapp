// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { BATCH_NAME, LEFT_GROUPS, LIST_ORDER } from './leftGroups'
import { MemoList, RowTags, type ListGroup, type ListRow, type Show } from './MemoList'

// 왼쪽 환자 목록(memo-split REQ-3101, 시안 4의 .listpane). 줄은 props로만 받는다. 이름·차트·글은 모두 지어낸 것이다

afterEach(cleanup)

/** A → 9001, B → 9002 … */
const chartOf = (key: string) => `9${String(key.charCodeAt(0) - 64).padStart(3, '0')}`
const row = (key: string, over: Partial<ListRow> = {}): ListRow => ({
  key,
  date: '2026-11-02',
  text: `◈가상 메모 ${key}`,
  hasMemo: true,
  unfinished: false,
  compare: '비트에 없음',
  chart: chartOf(key),
  name: `가상환자${key}`,
  rx: ['LA901'],
  rxNames: ['가상시술 가'],
  warned: false,
  sameDay: 1,
  foundByPc: false,
  chip: '새 메모',
  done: false,
  chartLines: [{ kind: 'subj', text: '가상 허리 통증 글' }],
  rxRows: [{ kind: 'proc', code: 'LA901', name: '가상신경차단술', short: 'GNB', qty: 2, benefit: true }],
  ...over,
})
/** 묶음 하나. 입력할 사람 줄에는 memoSplit.listGroups처럼 거르기 전 차례(no)를 싣는다(따로 준 no가 있으면 그것) */
const group = (id: ListGroup['id'], rows: ListRow[], total = rows.length): ListGroup => ({
  id,
  name: id === 'batch' ? BATCH_NAME : LEFT_GROUPS[id].name,
  rows: id === 'batch' ? rows.map((item, index) => ({ no: index + 1, ...item })) : rows,
  total,
})
const left = (key: string, over: Partial<ListRow> = {}) => row(key, { chip: null, ...over })

type Props = Parameters<typeof MemoList>[0]
function show(groups: ListGroup[], over: Partial<Props> = {}) {
  const on = { onShow: vi.fn(), onPick: vi.fn() }
  const props: Props = { groups, counts: { all: 5, todo: 3, done: 2 }, show: 'all', selectedKey: null, failed: new Set(), empty: '이 조건에 맞는 진료가 없어요.', ...on, ...over }
  const view = render(<MemoList {...props} />)
  return { on, view, props }
}
const lineOf = (key: string) => screen.getByRole('button', { name: new RegExp(`가상환자${key}`) })
const icon = (name: 'check' | 'x') => renderToStaticMarkup(<Icon name={name} size={12} />)

const SAMPLE = () => [group('batch', [row('A'), row('B', { chip: '메모 바꿈', compare: '다름', inBit: '◈가상 비트 글' })]), group('mark', [left('K', { unfinished: true })]), group('done', [left('L', { done: true, compare: '같음' })], 3)]

describe('REQ-3101 왼쪽 환자 목록', () => {
  it('AC-3101.1: 왼쪽은 "환자 목록" 칸이고, 위에 보기 단추 줄(전체 n · 미완료 n · 완료 n)과 그 아래 따로 스크롤되는 목록이 있다', () => {
    show(SAMPLE())
    const pane = screen.getByRole('region', { name: '환자 목록' })
    expect(pane.textContent).toContain('보기')
    const seg = within(pane).getByRole('group', { name: '완료로 골라 보기' })
    expect(within(seg).getAllByRole('button').map((button) => button.textContent)).toEqual(['전체 5', '미완료 3', '완료 2'])
    const list = within(pane).getByRole('group', { name: BATCH_NAME }).parentElement!
    expect(list.className).toContain('overflow-y-auto')
    expect(list.className).toContain('overscroll-contain')
    expect(list.contains(seg)).toBe(false)
  })

  it('AC-3101.1: 보기 단추는 지금 보기만 aria-pressed이고, 누르면 그 보기를 알린다', async () => {
    const { on } = show(SAMPLE(), { show: 'todo' satisfies Show })
    const seg = screen.getByRole('group', { name: '완료로 골라 보기' })
    expect(within(seg).getAllByRole('button').map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    await userEvent.setup().click(within(seg).getByRole('button', { name: '완료 2' }))
    expect(on.onShow).toHaveBeenCalledWith('done')
  })

  it('AC-9307.1·AC-3101.2: 빠지는 묶음 차례는 확인 필요 → 다른 메모 있음 → 직접 입력 → 지난번 건너뜀 → 비트 메모를 읽지 못함 → 이미 입력됨 → 메모 없음이다(입력할 사람은 그 앞, 빈칸 있는 사람이 있으면 확인 필요가 맨 위 — memoSplit)', () => {
    expect(LIST_ORDER).toEqual(['mark', 'diff', 'manual', 'held', 'unread', 'done', 'nomemo'])
    expect(BATCH_NAME).toBe('입력할 사람')
    expect([BATCH_NAME, ...LIST_ORDER.map((reason) => LEFT_GROUPS[reason].name)]).toEqual(['입력할 사람', '확인 필요', '다른 메모 있음', '직접 입력', '지난번 건너뜀', '비트 메모를 읽지 못함', '이미 입력됨', '메모 없음'])
  })

  it.each([
    ['done', '이미 입력됨', '비트 메모가 우리 메모와 같아요. 다시 넣지 않아요.'],
    ['nomemo', '메모 없음', '이 진료에는 넣을 메모가 없어요.'],
    ['mark', '확인 필요', '메모에 확인 표시가 남아 있어요. 고치면 들어가요. 묻지 않기가 켜져 있어도 넣지 않아요.'],
    ['manual', '직접 입력', '같은 사람의 같은 날 진료가 여럿이라 어느 진료에 넣을지 알 수 없어요. 비트에서 직접 넣어 주세요.'],
    ['diff', '다른 메모 있음', '비트에 우리 메모와 다른 메모가 있어요. [바꾸지 않기]를 눌렀거나 직접 확인한 사람이에요. [이 메모로 바꾸기]를 누르면 들어가요.'],
    ['unread', '비트 메모를 읽지 못함', '비어 있다고 보고 넣으면 두 번 들어갈 수 있어 뺐어요. 자료를 다시 불러와 주세요.'],
    ['held', '지난번 건너뜀', '지난 입력에서 건너뛴 뒤 메모가 그대로예요. 메모를 고치거나 [다시 하기]를 눌러 주세요.'],
  ] as const)('AC-3101.2: %s 묶음의 이름과 까닭(LEFT_GROUPS)은 지금 글 그대로다', (reason, name, why) => {
    expect(LEFT_GROUPS[reason]).toEqual({ name, why })
  })

  it('AC-3101.2: 묶음은 받은 차례대로 그린다', () => {
    show([group('batch', [row('A')]), group('nomemo', [left('N', { hasMemo: false, text: '' })]), group('mark', [left('K', { unfinished: true })])])
    const pane = screen.getByRole('region', { name: '환자 목록' })
    const names = within(pane)
      .getAllByRole('group')
      .map((element) => element.getAttribute('aria-label'))
      .filter((name) => name !== '완료로 골라 보기')
    expect(names).toEqual(['입력할 사람', '메모 없음', '확인 필요'])
  })

  it("AC-3101.2: 묶음 머리는 목록 위에 붙고(sticky top-0) 이름과 'n명', 보기로 걸러지면 'n / 전체명'이다", () => {
    show(SAMPLE())
    const head = (name: string) => screen.getByRole('group', { name }).firstElementChild as HTMLElement
    expect(head('입력할 사람').textContent).toBe('입력할 사람2명')
    expect(head('확인 필요').textContent).toBe('확인 필요1명')
    expect(head('이미 입력됨').textContent).toBe('이미 입력됨1 / 3명')
    for (const name of ['입력할 사람', '이미 입력됨']) {
      expect(head(name).className).toContain('sticky')
      expect(head(name).className).toContain('top-0')
      expect(head(name).className).toContain('bg-canvas')
    }
  })

  it('AC-3101.2: 사람이 없는 묶음은 그리지 않는다', () => {
    show([group('batch', [row('A')]), group('held', [], 2)])
    expect(screen.queryByRole('group', { name: '지난번 건너뜀' })).toBeNull()
    expect(screen.getByRole('group', { name: '입력할 사람' })).toBeTruthy()
  })

  it('AC-3101.3: 줄은 단추 하나이고 번호(입력할 사람만, 1부터)·이름·진료일(M/D (요일))·차트번호·상태 표만 있다', () => {
    show(SAMPLE())
    for (const key of ['A', 'B', 'K', 'L']) expect(within(lineOf(key).closest('li')!).getAllByRole('button')).toHaveLength(1)
    expect(lineOf('A').textContent).toBe('1가상환자A11/2 (월)9001새 메모')
    expect(lineOf('B').textContent).toBe('2가상환자B11/2 (월)9002! 메모 바꿈')
    expect(lineOf('K').textContent).toBe('가상환자K11/2 (월)9011! 확인 필요')
    expect(lineOf('L').textContent).toBe('가상환자L11/2 (월)9012완료')
  })

  it('AC-3101.3: 보기로 걸러도 번호는 줄이 가진 거르기 전 차례(no) 그대로다(보이는 차례로 다시 세지 않는다)', () => {
    show([group('batch', [row('B', { no: 2 }), row('E', { no: 5 })], 6), group('done', [left('L', { done: true, compare: '같음' })], 3)], { show: 'done' })
    expect(lineOf('B').textContent).toBe('2가상환자B11/2 (월)9002새 메모')
    expect(lineOf('E').textContent).toBe('5가상환자E11/2 (월)9005새 메모')
    expect(lineOf('L').textContent).toBe('가상환자L11/2 (월)9012완료')
  })

  it('AC-3101.3: 줄에는 차트 원문·처방 이름·메모 글·비트 메모가 없다', () => {
    show(SAMPLE())
    const pane = screen.getByRole('region', { name: '환자 목록' })
    for (const text of ['가상 허리 통증 글', '가상시술 가', '가상신경차단술', 'GNB', 'LA901', '◈가상 메모', '◈가상 비트 글']) expect(pane.textContent).not.toContain(text)
  })

  it.each([
    ['복사 실패 · 완료 · 확인 필요', left('A', { done: true, unfinished: true }), 'batch', true, [['복사 못 함', ds.chip.negative, 'x'], ['완료', ds.chip.positive, 'check'], ['! 확인 필요', ds.chip.warning, null]]],
    ['확인 필요가 메모 바꿈보다 앞선다', row('A', { unfinished: true, chip: '메모 바꿈' }), 'batch', false, [['! 확인 필요', ds.chip.warning, null]]],
    ['입력할 사람의 메모 바꿈', row('A', { chip: '메모 바꿈' }), 'batch', false, [['! 메모 바꿈', ds.chip.warning, null]]],
    ['입력할 사람의 새 메모', row('A'), 'batch', false, [['새 메모', ds.chip.neutral, null]]],
    ['완료한 입력할 사람', row('A', { done: true }), 'batch', false, [['완료', ds.chip.positive, 'check'], ['새 메모', ds.chip.neutral, null]]],
    ['빠지는 묶음에는 메모 바꿈·새 메모 표가 없다', row('A', { chip: '메모 바꿈' }), 'diff', false, []],
    ['이미 입력됨', left('A', { done: true }), 'done', false, [['완료', ds.chip.positive, 'check']]],
    ['아무 표 없음', left('A'), 'nomemo', false, []],
  ] as const)('AC-3101.3: 상태 표 차례 — %s', (_, value, id, failed, expected) => {
    render(
      <span data-testid="tags">
        <RowTags row={value} group={id} failed={failed} />
      </span>,
    )
    const tags = [...screen.getByTestId('tags').children] as HTMLElement[]
    expect(tags.map((tag) => tag.textContent)).toEqual(expected.map(([text]) => text))
    tags.forEach((tag, index) => {
      const [, className, mark] = expected[index]
      expect(tag.className).toBe(className)
      expect(tag.querySelector('svg')?.outerHTML ?? null).toBe(mark ? icon(mark) : null)
    })
  })

  it('AC-3101.3: 복사하지 못한 사람(failed) 줄에는 복사 못 함 표가 붙는다', () => {
    show(SAMPLE(), { failed: new Set(['B']) })
    expect(lineOf('B').textContent).toBe('2가상환자B11/2 (월)9002복사 못 함! 메모 바꿈')
    expect(lineOf('A').textContent).not.toContain('복사 못 함')
  })

  it('AC-3101.4: 고른 줄은 aria-current="true"·파란 바탕·왼쪽 3px 진한 파란 선·이름 굵게·작은 글 진하게, 다른 줄은 "false"·투명 선이다', () => {
    show(SAMPLE(), { selectedKey: 'B' })
    const on = lineOf('B')
    expect(on.getAttribute('aria-current')).toBe('true')
    for (const name of ['bg-accent-soft', 'border-l-3', 'border-l-accent-strong']) expect(on.className).toContain(name)
    expect(within(on).getByText('가상환자B').className).toContain('font-semibold')
    expect(within(on).getByText('11/2 (월)').className).toContain('text-ink-2')
    expect(within(on).getByText('9002').className).toContain('text-ink-2')
    for (const key of ['A', 'K', 'L']) {
      const off = lineOf(key)
      expect(off.getAttribute('aria-current')).toBe('false')
      expect(off.className).toContain('border-l-3')
      expect(off.className).toContain('border-l-transparent')
      expect(off.className).not.toContain('bg-accent-soft')
      expect(within(off).getByText(`가상환자${key}`).className).not.toContain('font-semibold')
      expect(within(off).getByText(chartOf(key)).className).toContain('text-muted')
    }
  })

  it('AC-3101.4: 줄을 누르면 그 사람의 내원번호를 알린다', async () => {
    const { on } = show(SAMPLE(), { selectedKey: 'A' })
    await userEvent.setup().click(lineOf('K'))
    expect(on.onPick).toHaveBeenCalledWith('K')
  })

  it('AC-3101.4: 고른 사람이 없으면 aria-current="true"인 줄이 없다', () => {
    show(SAMPLE())
    expect(screen.getByRole('region', { name: '환자 목록' }).querySelector('[aria-current="true"]')).toBeNull()
  })

  describe('AC-3101.4 고른 줄 보이게 하기', () => {
    const calls: [Element, unknown][] = []
    beforeEach(() => {
      calls.length = 0
      Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
        calls.push([this, arg])
      }
    })
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    })

    it('AC-3101.4: 고른 사람이 바뀌면 그 줄이 보이게 목록을 움직이고(block nearest), 같은 사람이면 다시 움직이지 않는다', () => {
      const { view, props } = show(SAMPLE(), { selectedKey: 'A' })
      expect(calls).toEqual([[lineOf('A'), { block: 'nearest' }]])
      view.rerender(<MemoList {...props} selectedKey="L" />)
      expect(calls).toHaveLength(2)
      expect(calls[1]).toEqual([lineOf('L'), { block: 'nearest' }])
      // 메모 보기를 다시 받아도(저장 뒤 등) 같은 사람이면 목록을 움직이지 않는다(AC-3101.8)
      view.rerender(<MemoList {...props} groups={SAMPLE()} selectedKey="L" />)
      expect(calls).toHaveLength(2)
    })

    it('AC-3101.4: 두 칸 높이(fitHeight)가 맞춰지거나 바뀌면 그 높이로 고른 줄이 보이게 다시 움직이고, 같은 높이로 다시 그리면 움직이지 않는다', () => {
      const { view, props } = show(SAMPLE(), { selectedKey: 'L' })
      expect(calls).toHaveLength(1)
      view.rerender(<MemoList {...props} fitHeight="622px" />)
      expect(calls).toHaveLength(2)
      expect(calls[1]).toEqual([lineOf('L'), { block: 'nearest' }])
      // 메모 보기를 다시 받아도 높이가 같으면 목록 스크롤은 그대로다(AC-3101.8)
      view.rerender(<MemoList {...props} groups={SAMPLE()} fitHeight="622px" />)
      expect(calls).toHaveLength(2)
      view.rerender(<MemoList {...props} groups={SAMPLE()} fitHeight="722px" />)
      expect(calls).toHaveLength(3)
      expect(calls[2]).toEqual([lineOf('L'), { block: 'nearest' }])
    })
  })

  it('AC-3101.4: scrollIntoView가 없는 환경에서도 고른 줄을 그린다', () => {
    expect('scrollIntoView' in Element.prototype).toBe(false)
    show(SAMPLE(), { selectedKey: 'K' })
    expect(lineOf('K').getAttribute('aria-current')).toBe('true')
  })

  it.each(['모두 완료했어요.', '완료한 환자가 없어요.', '이 조건에 맞는 진료가 없어요.', '처방코드를 넣거나 위 코드 단추를 고르면 그 처방이 있는 환자만 여기에 나와요.'])(
    'AC-3101.7: 보일 사람이 없으면 받은 까닭 글(%s)을 쓰고, 보기 단추 줄은 그대로다',
    (empty) => {
      show([], { empty })
      const pane = screen.getByRole('region', { name: '환자 목록' })
      expect(within(pane).getByText(empty)).toBeTruthy()
      expect(within(pane).getByRole('group', { name: '완료로 골라 보기' })).toBeTruthy()
      expect(within(pane).queryAllByRole('button', { name: /가상환자/ })).toEqual([])
    },
  )

  it('AC-3101.7: 묶음이 있어도 모두 비었으면 까닭 글을 쓴다', () => {
    show([group('batch', [], 3), group('done', [], 2)], { empty: '모두 완료했어요.' })
    expect(screen.getByText('모두 완료했어요.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '입력할 사람' })).toBeNull()
  })
})

// claim-memo-fit: 목록을 272px로 좁히고 표시를 차트번호 바로 뒤로 붙인다(lg 이상만, 그 아래는 그대로)
describe('REQ-4802 목록 표시를 왼쪽으로', () => {
  const classes = (el: Element) => el.className.split(/\s+/)

  it('AC-4802.2: lg 이상에서 이름 묶음은 남은 폭을 채우지 않고(lg:flex-none) 표시 묶음이 그 바로 뒤에 왼쪽 정렬(lg:justify-start)로 붙는다. lg 미만은 그대로(flex-1 · justify-end)', () => {
    show(SAMPLE())
    const line = lineOf('B')
    const nameBox = within(line).getByText('가상환자B').parentElement!
    expect(classes(nameBox)).toEqual(expect.arrayContaining(['flex-1', 'lg:flex-none', 'min-w-0']))
    const tagBox = within(line).getByText('! 메모 바꿈').parentElement!
    expect(classes(tagBox)).toEqual(expect.arrayContaining(['shrink-0', 'justify-end', 'lg:justify-start']))
    expect(nameBox.nextElementSibling).toBe(tagBox)
    // 줄 글과 차례는 그대로다(AC-3101.3)
    expect(line.textContent).toBe('2가상환자B11/2 (월)9002! 메모 바꿈')
  })

  it('AC-4806.1: lg 미만 목록 줄 class는 이 기능 전과 같다(lg: class만 더했다)', () => {
    show(SAMPLE())
    const line = lineOf('B')
    const base = (el: Element) => classes(el).filter((name) => !name.startsWith('lg:'))
    expect(base(within(line).getByText('가상환자B').parentElement!)).toEqual(['flex', 'min-w-0', 'flex-1', 'flex-wrap', 'items-baseline', 'gap-x-2'])
    expect(base(within(line).getByText('! 메모 바꿈').parentElement!)).toEqual(['flex', 'shrink-0', 'flex-wrap', 'justify-end', 'gap-1'])
  })

  it('AC-4806.2: 이 기능이 고친 환자 줄 파일(MemoList·MemoDetail·BitMemoCard)은 네트워크·저장소·console·supabase를 쓰지 않는다', () => {
    const read = (name: string) => readFileSync(join(process.cwd(), 'src/components/claim/rows', name), 'utf-8')
    for (const name of ['MemoList.tsx', 'MemoDetail.tsx', 'BitMemoCard.tsx']) {
      const text = read(name)
      expect(text).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console|supabase)\b/)
      expect(text).not.toMatch(/\bimport\(/)
    }
  })

  it('AC-4802.3: 목록 위 보기 단추는 lg 이상에서 안쪽 여백이 좁다(lg:px-2). 공용 단추 class(ds.segment.button)는 그대로 쓴다', () => {
    show(SAMPLE())
    const buttons = within(screen.getByRole('group', { name: '완료로 골라 보기' })).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(classes(button)).toContain('lg:px-2')
      expect(button.className).toContain(ds.segment.button)
    }
  })
})

describe('AC-3107.3 환자 줄 울타리', () => {
  const source = (name: string) => readFileSync(join(process.cwd(), 'src/components/claim/rows', name), 'utf-8')
  const imports = (text: string) => [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((match) => match[1])

  it('AC-3107.3: 목록 두 파일은 정한 것만 불러오고 네트워크·저장소·console·supabase·클립보드가 없다(줄은 props로만 받는다)', () => {
    const list = source('MemoList.tsx')
    const groups = source('leftGroups.ts')
    // './leftGroups'는 이 시험이 같이 막는 옆 파일이다(붙임 이름 APPEND_NAME, clinic-profile AC-6611.1)
    expect(imports(list)).toEqual(['react', '@/components/common/Icon', '@/components/ui/classes', '@/types/precheck', '../dateList', './leftGroups'])
    expect(imports(groups)).toEqual(['@/types/precheck'])
    for (const text of [list, groups]) {
      expect(text).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console|supabase|navigator|clipboard|execCommand)\b/)
      expect(text).not.toMatch(/\bimport\(/)
    }
  })

  it('AC-3107.3: 쓰다 멈춘 사람 띠(StuckBand)는 LEFT_GROUPS를 leftGroups에서 불러온다(MemoRows를 지워도 된다)', () => {
    const band = source('StuckBand.tsx')
    expect(band).toContain("import { LEFT_GROUPS } from './leftGroups'")
    expect(band).not.toContain('./MemoRows')
  })

  it('AC-3107.3: 같은 props면 같은 목록이다(안에 쥔 자료가 없다)', () => {
    const groups = SAMPLE()
    const props: Props = { groups, counts: { all: 4, todo: 3, done: 1 }, show: 'all', selectedKey: 'B', failed: new Set(['A']), empty: '', onShow: () => {}, onPick: () => {} }
    const first = render(<MemoList {...props} />).container.innerHTML
    cleanup()
    expect(render(<MemoList {...props} />).container.innerHTML).toBe(first)
  })
})

// [뒤에 붙이기]를 고른 사람(clinic-profile AC-6611.1): 입력할 사람이고 chip은 '메모 바꿈' 그대로지만 덮지 않으므로
// 목록 줄도 상세 머리(MemoDetail)와 같은 이름·조건으로 '메모 뒤에 붙임'이다. 비트 글 자체는 목록에 나오지 않는다
describe('AC-6611.1 목록 줄의 붙임 표시', () => {
  const tagsOf = (value: ListRow, id: ListGroup['id']) => {
    render(
      <span data-testid="tags">
        <RowTags row={value} group={id} failed={false} />
      </span>,
    )
    return [...screen.getByTestId('tags').children] as HTMLElement[]
  }

  it("AC-6611.1: 입력할 사람에서 붙이기를 고른 줄은 '! 메모 바꿈' 대신 '메모 뒤에 붙임'(accent)이다", () => {
    const tags = tagsOf(row('A', { chip: '메모 바꿈', appended: '◈가상 비트 글' }), 'batch')
    expect(tags.map((tag) => tag.textContent)).toEqual(['메모 뒤에 붙임'])
    expect(tags[0].className).toBe(ds.chip.accent)
    expect(screen.getByTestId('tags').textContent).not.toContain('가상 비트 글')
  })

  it("AC-6611.1: 붙이기를 골랐어도 확인 필요가 앞서고, 빠지는 묶음에는 표가 없다(상세 머리와 같은 조건)", () => {
    expect(tagsOf(row('A', { chip: '메모 바꿈', appended: '◈가상 비트 글', unfinished: true }), 'batch').map((tag) => tag.textContent)).toEqual(['! 확인 필요'])
    cleanup()
    expect(tagsOf(row('A', { chip: '메모 바꿈', appended: '◈가상 비트 글' }), 'diff')).toEqual([])
  })
})

// 청구 메모 학습(claim-learn): 빈칸 수·학습 확인 필요·학습 꼬리표·하루 두 번(notes '메모 단계' 글 그대로). 목록 줄과 상세 머리가 같은 RowTags를 쓴다
describe('AC-9307.1·AC-9302.6·AC-9309.1 목록 줄의 학습 표시', () => {
  const tagsOf = (value: ListRow, id: ListGroup['id'] = 'batch') => {
    render(
      <span data-testid="tags">
        <RowTags row={value} group={id} failed={false} />
      </span>,
    )
    return ([...screen.getByTestId('tags').children] as HTMLElement[]).map((tag) => [tag.textContent, tag.className])
  }

  it("AC-9307.1: 빈칸이 있는 줄은 '! 확인 필요' 대신 '빈칸 {n}'(노랑)이다. 빈칸 없는 확인 표시는 지금 그대로다", () => {
    expect(tagsOf(left('A', { unfinished: true, holes: 2 }), 'mark')).toEqual([['빈칸 2', ds.chip.warning]])
    cleanup()
    expect(tagsOf(left('A', { unfinished: true }), 'mark')).toEqual([['! 확인 필요', ds.chip.warning]])
  })

  it("AC-9302.6: 남은 확인이 1 이상인 학습이 쓰인 줄은 '확인 필요'(노랑)와 첫 학습 이름 꼬리표 '학습: {이름}'이다. 0이면 꼬리표만 있다", () => {
    const learned = [
      { id: 'l0000a001', name: 'LA358 · 허리', left: 0 },
      { id: 'l0000a002', name: 'KK090 · 무릎', left: 2 },
    ]
    expect(tagsOf(row('A', { learned }))).toEqual([['새 메모', ds.chip.neutral], ['확인 필요', ds.chip.warning], ['학습: LA358 · 허리', ds.chip.neutral]])
    cleanup()
    expect(tagsOf(row('A', { learned: [{ id: 'l0000a001', name: 'LA358 · 허리', left: 0 }] }))).toEqual([['새 메모', ds.chip.neutral], ['학습: LA358 · 허리', ds.chip.neutral]])
  })

  it("AC-9309.1: 같은 차트·같은 날 진료가 둘 이상이면 '하루 두 번'(빨강)이 맨 뒤에 붙는다", () => {
    expect(tagsOf(row('A', { sameDay: 2 }))).toEqual([['새 메모', ds.chip.neutral], ['하루 두 번', ds.chip.negative]])
    cleanup()
    expect(tagsOf(left('A', { sameDay: 3 }), 'manual')).toEqual([['하루 두 번', ds.chip.negative]])
    cleanup()
    expect(tagsOf(row('A', { sameDay: 1 }))).toEqual([['새 메모', ds.chip.neutral]])
  })

  it('AC-9307.1: 목록 줄에 빈칸 표시가 보인다(줄 글 그대로)', () => {
    show([group('mark', [left('K', { unfinished: true, holes: 1 })])])
    expect(lineOf('K').textContent).toBe('가상환자K11/2 (월)9011빈칸 1')
  })

  it("AC-9302.6·AC-9309.1: 272px 목록(lg)에서 꼬리표가 많으면 꼬리표 묶음이 이름 묶음 아래 둘째 줄로 감겨 잘리지 않는다('새 메모' 뒤 '확인 필요'·'학습: {이름}'·'하루 두 번'). lg 미만 class는 그대로다", () => {
    const learned = [{ id: 'l0000a001', name: 'LA358 · 허리', left: 2 }]
    show([group('batch', [row('A', { learned, sameDay: 2 })])])
    const line = lineOf('A')
    const classes = (el: Element) => el.className.split(/\s+/)
    const nameBox = within(line).getByText('가상환자A').parentElement!
    const tagBox = within(line).getByText('하루 두 번').parentElement!
    // 이름 묶음과 꼬리표 묶음을 함께 감싸는 줄: lg에서 남은 폭을 쓰고 넘치면 줄을 바꾼다. lg 미만은 상자가 없다(contents)
    const wrap = tagBox.parentElement!
    expect(wrap).not.toBe(line)
    expect(nameBox.parentElement).toBe(wrap)
    expect(nameBox.nextElementSibling).toBe(tagBox)
    expect(wrap.parentElement).toBe(line)
    expect(classes(wrap)).toEqual(expect.arrayContaining(['contents', 'lg:flex', 'lg:min-w-0', 'lg:flex-1', 'lg:flex-wrap']))
    expect(classes(wrap).filter((name) => !name.startsWith('lg:'))).toEqual(['contents'])
    // 꼬리표 묶음은 lg에서 줄 폭보다 길면 줄어들고 안에서 꼬리표끼리 줄을 바꾼다(잘리지 않음)
    expect(classes(tagBox)).toEqual(expect.arrayContaining(['flex-wrap', 'lg:min-w-0', 'lg:shrink']))
    expect(line.textContent).toBe('1가상환자A11/2 (월)9001새 메모확인 필요학습: LA358 · 허리하루 두 번')
  })
})
