// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { TargetRow } from '@/types/precheck'
import { BATCH_NAME, LEFT_GROUPS, LIST_ORDER } from './leftGroups'
import { MemoList, RowTags, type ListGroup, type Show } from './MemoList'

// 왼쪽 환자 목록(memo-split REQ-3101, 시안 4의 .listpane). 줄은 props로만 받는다. 이름·차트·글은 모두 지어낸 것이다

afterEach(cleanup)

/** A → 9001, B → 9002 … */
const chartOf = (key: string) => `9${String(key.charCodeAt(0) - 64).padStart(3, '0')}`
const row = (key: string, over: Partial<TargetRow> = {}): TargetRow => ({
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
const group = (id: ListGroup['id'], rows: TargetRow[], total = rows.length): ListGroup => ({ id, name: id === 'batch' ? BATCH_NAME : LEFT_GROUPS[id].name, rows, total })
const left = (key: string, over: Partial<TargetRow> = {}) => row(key, { chip: null, ...over })

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

  it('AC-3101.2: 목록 차례는 입력할 사람 → 확인 필요 → 다른 메모 있음 → 직접 입력 → 지난번 건너뜀 → 비트 메모를 읽지 못함 → 이미 입력됨 → 메모 없음이다', () => {
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

describe('AC-3107.3 환자 줄 울타리', () => {
  const source = (name: string) => readFileSync(join(process.cwd(), 'src/components/claim/rows', name), 'utf-8')
  const imports = (text: string) => [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((match) => match[1])

  it('AC-3107.3: 목록 두 파일은 정한 것만 불러오고 네트워크·저장소·console·supabase·클립보드가 없다(줄은 props로만 받는다)', () => {
    const list = source('MemoList.tsx')
    const groups = source('leftGroups.ts')
    expect(imports(list)).toEqual(['react', '@/components/common/Icon', '@/components/ui/classes', '@/types/precheck', '../dateList'])
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
