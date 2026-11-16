// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import type { MemoTableRow, TargetRow } from '@/types/precheck'
import { LEFT_GROUPS, LIST_ORDER } from './leftGroups'
import { MemoDetail, type CopyStatus } from './MemoDetail'

// 오른쪽 고른 환자 상세(memo-split REQ-3105·REQ-3103의 상태 줄, 시안 4의 .detail). 줄은 props로만 받는다. 이름·차트·글은 모두 지어낸 것이다

afterEach(cleanup)

const row = (over: Partial<TargetRow> = {}): TargetRow => ({
  key: 'A',
  date: '2026-11-02',
  text: '◈가상 메모 A\n◈가상 둘째 줄',
  hasMemo: true,
  unfinished: false,
  compare: '비트에 없음',
  chart: '9001',
  name: '가상환자A',
  rx: ['LA901'],
  rxNames: ['가상시술 가'],
  warned: false,
  sameDay: 1,
  foundByPc: false,
  chip: '새 메모',
  done: false,
  chartLines: [],
  rxRows: [],
  ...over,
})
const tableRow = (over: Partial<MemoTableRow> = {}): MemoTableRow => ({
  key: 'A',
  date: '2026-11-02',
  text: '◈가상 메모 A',
  hasMemo: true,
  unfinished: false,
  compare: '비트에 없음',
  chart: '9001',
  name: '가상환자A',
  rxNames: [],
  edited: false,
  missing: [],
  done: false,
  unsaved: false,
  afterEntry: false,
  ...over,
})

type Props = Parameters<typeof MemoDetail>[0]
function show(over: Partial<Props> = {}) {
  const on = { onPrev: vi.fn(), onNext: vi.fn(), onCopy: vi.fn(), onUndone: vi.fn(), onEdit: vi.fn(), onEditDone: vi.fn(), onApprove: vi.fn(), onHeldRetry: vi.fn() }
  const props: Props = {
    row: row(),
    group: 'batch',
    groupName: '입력할 사람',
    position: { index: 2, total: 10 },
    tableRow: undefined,
    canPrev: true,
    canNext: true,
    status: 'ready',
    copying: false,
    failed: false,
    copyDisabled: false,
    undoDisabled: false,
    editing: false,
    locked: false,
    reading: false,
    startBlocked: false,
    showUnsaved: false,
    heldCount: 0,
    card: (
      <div role="group" aria-label="비트에 저장된 청구메모">
        가짜 비트 카드
      </div>
    ),
    ...on,
    ...over,
  }
  const view = render(<MemoDetail {...props} />)
  return { on: { ...on, ...over }, view, props }
}
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const copyButton = () => button(/복사/)
const actionBar = () => copyButton().parentElement as HTMLElement
const statusLine = () => actionBar().lastElementChild as HTMLElement
const markup = (name: 'check' | 'x', size: number) => renderToStaticMarkup(<Icon name={name} size={size} />)

describe('AC-3105.1 머리', () => {
  it("AC-3105.1: 맨 위에 '{묶음 이름} {i} / {n}'(파랑), 크게 이름과 상태 표, '진료일 M/D (요일) | 차트 번호'가 있다", () => {
    show()
    const position = screen.getByText('입력할 사람 2 / 10')
    expect(position.className).toContain('text-accent-strong')
    const name = screen.getByRole('heading', { name: '가상환자A' })
    expect(name.className).toContain('text-title')
    expect(name.className).toContain('font-semibold')
    expect(name.parentElement!.textContent).toBe('가상환자A새 메모')
    expect(screen.getByText('진료일').parentElement!.textContent).toBe('진료일 11/2 (월) | 차트 9001')
  })

  it('AC-3105.1·AC-3103.3: 머리의 상태 표는 목록과 같다(복사 못 함 → 완료 → 메모 바꿈)', () => {
    show({ row: row({ done: true, chip: '메모 바꿈', compare: '다름', inBit: '◈가상 비트 글' }), failed: true })
    const tags = [...screen.getByRole('heading', { name: '가상환자A' }).parentElement!.children].slice(1)
    expect(tags.map((tag) => tag.textContent)).toEqual(['복사 못 함', '완료', '! 메모 바꿈'])
    expect(tags[0].querySelector('svg')!.outerHTML).toBe(markup('x', 12))
    expect(tags[1].querySelector('svg')!.outerHTML).toBe(markup('check', 12))
  })

  it('AC-3105.1: 오른쪽에 [↑ 앞 사람]·[↓ 다음 사람]이 있고 맨 앞·맨 뒤면 막히며, 누르면 알린다. 옆에 키보드 ↑ ↓ 안내가 있다', async () => {
    const user = userEvent.setup()
    const first = show({ canPrev: false, canNext: true })
    expect(button('↑ 앞 사람').disabled).toBe(true)
    expect(button('↓ 다음 사람').disabled).toBe(false)
    await user.click(button('↓ 다음 사람'))
    expect(first.on.onNext).toHaveBeenCalledTimes(1)
    const hint = screen.getByText('키보드')
    expect(hint.textContent).toBe('키보드 ↑ ↓')
    expect([...hint.querySelectorAll('kbd')].map((kbd) => kbd.textContent)).toEqual(['↑', '↓'])
    cleanup()
    const last = show({ canPrev: true, canNext: false })
    expect(button('↑ 앞 사람').disabled).toBe(false)
    expect(button('↓ 다음 사람').disabled).toBe(true)
    await user.click(button('↑ 앞 사람'))
    expect(last.on.onPrev).toHaveBeenCalledTimes(1)
  })

  it.each(LIST_ORDER)('AC-3105.1: 빠지는 묶음(%s)이면 그 묶음의 까닭 글이 머리 아래 있다', (reason) => {
    show({ group: reason, groupName: LEFT_GROUPS[reason].name, row: row({ chip: null }) })
    expect(screen.getByText(LEFT_GROUPS[reason].why)).toBeTruthy()
    expect(screen.getByText(`${LEFT_GROUPS[reason].name} 2 / 10`)).toBeTruthy()
  })

  it('AC-3105.1: 입력할 사람 묶음에는 까닭 글이 없다', () => {
    show()
    const text = document.body.textContent!
    for (const reason of LIST_ORDER) expect(text).not.toContain(LEFT_GROUPS[reason].why)
  })

  it("AC-3105.1: 직접 입력이면 '같은 날 진료 n건' 또는 '지난 입력 때 PC가 찾아냈어요.'가 있다", () => {
    show({ group: 'manual', groupName: '직접 입력', row: row({ chip: null, sameDay: 3 }) })
    expect(screen.getByText('같은 날 진료 3건')).toBeTruthy()
    expect(screen.queryByText('지난 입력 때 PC가 찾아냈어요.')).toBeNull()
    cleanup()
    show({ group: 'manual', groupName: '직접 입력', row: row({ chip: null, sameDay: 1, foundByPc: true }) })
    expect(screen.getByText('지난 입력 때 PC가 찾아냈어요.')).toBeTruthy()
    expect(screen.queryByText(/같은 날 진료 \d+건/)).toBeNull()
    cleanup()
    show({ group: 'held', groupName: '지난번 건너뜀', row: row({ chip: null, sameDay: 2 }) })
    expect(screen.queryByText(/같은 날 진료 \d+건/)).toBeNull()
  })

  it("AC-3105.1: 점검 경고가 있으면 '점검 경고 있음 · 입력은 돼요'가 있다", () => {
    show({ row: row({ warned: true }) })
    expect(screen.getByText('점검 경고 있음 · 입력은 돼요')).toBeTruthy()
    cleanup()
    show()
    expect(screen.queryByText('점검 경고 있음 · 입력은 돼요')).toBeNull()
  })
})

describe('AC-3105.2 단추 줄', () => {
  it('AC-3105.2: 옅은 회색 칸 맨 앞에 초록 [C 복사(완료)](kbd C)가 있고 누르면 onCopy를 부른다', async () => {
    const { on } = show()
    const copy = button('C 복사(완료)')
    for (const name of ['bg-positive', 'text-surface', 'font-semibold']) expect(copy.className).toContain(name)
    expect(copy.querySelector('kbd')!.textContent).toBe('C')
    expect(copy.textContent).toBe('C복사(완료)')
    expect(copy.disabled).toBe(false)
    expect(actionBar().firstElementChild).toBe(copy)
    for (const name of ['bg-canvas', 'border', 'border-line']) expect(actionBar().className).toContain(name)
    await userEvent.setup().click(copy)
    expect(on.onCopy).toHaveBeenCalledTimes(1)
  })

  it("AC-3105.2: 단추 이름은 완료면 'C 다시 복사', 복사 중이면 '복사 중…'이다", () => {
    show({ row: row({ done: true }), status: 'done' })
    expect(button('C 다시 복사').textContent).toBe('C다시 복사')
    cleanup()
    show({ copying: true, copyDisabled: true })
    expect(button('복사 중…').disabled).toBe(true)
    expect(button('복사 중…').textContent).toBe('C복사 중…')
  })

  it.each<[string, CopyStatus]>([
    ['AC-3103.5', 'mark'],
    ['AC-3103.5', 'none'],
    ['AC-3103.6', 'locked'],
    ['AC-3103.6', 'stuck'],
    ['AC-3103.8', 'editing'],
  ])('%s: 초록 단추의 막힘은 받은 copyDisabled 그대로다(%s)', async (_, status) => {
    const { on } = show({ status, copyDisabled: true })
    expect(copyButton().disabled).toBe(true)
    await userEvent.setup().click(copyButton())
    expect(on.onCopy).not.toHaveBeenCalled()
  })

  it('AC-3103.2: 완료한 사람은 [C 다시 복사] 옆에 [완료 풀기]가 있고 누르면 onUndone, undoDisabled면 막힌다', async () => {
    const { on } = show({ row: row({ done: true, compare: '다름', inBit: '◈가상 비트 글' }), status: 'copied' })
    const undo = button('완료 풀기')
    expect(undo.disabled).toBe(false)
    expect(copyButton().nextElementSibling).toBe(undo)
    await userEvent.setup().click(undo)
    expect(on.onUndone).toHaveBeenCalledTimes(1)
    cleanup()
    show({ row: row({ done: true }), status: 'stuck', undoDisabled: true, copyDisabled: true })
    expect(button('완료 풀기').disabled).toBe(true)
  })

  it('AC-3103.2: 완료가 아니면 [완료 풀기]가 없다', () => {
    show()
    expect(screen.queryByRole('button', { name: '완료 풀기' })).toBeNull()
  })

  it("AC-3104.3: 비트 메모가 우리 메모와 같아서 완료인 사람(비교 '같음')은 [완료 풀기]가 없다", () => {
    show({ row: row({ done: true, compare: '같음', inBit: '◈가상 메모 A' }), group: 'done', groupName: '이미 입력됨', status: 'done' })
    expect(button('C 다시 복사')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '완료 풀기' })).toBeNull()
  })

  it('AC-3105.2: 오른쪽 [메모 고치기]는 우리 메모가 있는 사람에게 있고 누르면 onEdit, 입력 중이면 막힌다. 메모가 없는 사람에게는 없다', async () => {
    const { on } = show()
    await userEvent.setup().click(button('메모 고치기'))
    expect(on.onEdit).toHaveBeenCalledTimes(1)
    cleanup()
    show({ locked: true, status: 'locked', copyDisabled: true })
    expect(button('메모 고치기').disabled).toBe(true)
    cleanup()
    show({ row: row({ hasMemo: false, text: '', chip: null }), group: 'nomemo', groupName: '메모 없음', status: 'none', copyDisabled: true })
    expect(screen.queryByRole('button', { name: '메모 고치기' })).toBeNull()
  })

  it("AC-3105.2: 글을 다 지워 '메모 없음'으로 간 사람(우리 메모는 있고 글이 빔)도 [메모 고치기]가 있어 다시 쓸 수 있다. 복사는 막힌 채다", async () => {
    const user = userEvent.setup()
    const blank = { row: row({ hasMemo: true, text: '   \n ', chip: null }), group: 'nomemo', groupName: '메모 없음', status: 'none', copyDisabled: true } as const
    const { on } = show(blank)
    expect(copyButton().disabled).toBe(true)
    expect(screen.getByRole('group', { name: '우리 메모' }).textContent).toBe('우리 메모우리 메모가 없어요.')
    const edit = button('메모 고치기')
    expect(edit.disabled).toBe(false)
    await user.click(edit)
    expect(on.onEdit).toHaveBeenCalledTimes(1)
    cleanup()
    // 고치는 칸이 열리고 쓴 글로 칸 밖에서 onEditDone을 부른다
    const editing = show({ ...blank, row: row({ hasMemo: true, text: '', chip: null }), editing: true, status: 'editing' })
    const box = screen.getByRole('textbox', { name: '가상환자A 우리 메모 고치기' }) as HTMLTextAreaElement
    expect(box.value).toBe('')
    expect(document.activeElement).toBe(box)
    await user.type(box, '◈가상 새 글')
    await user.tab()
    expect(editing.on.onEditDone).toHaveBeenCalledWith('◈가상 새 글')
  })

  it('AC-3105.2: [바꾸지 않기]는 입력할 사람 가운데 메모 바꿈에만 있고 누르면 onApprove(false), 입력 중이면 막힌다', async () => {
    const changing = row({ chip: '메모 바꿈', compare: '다름', inBit: '◈가상 비트 글' })
    const { on } = show({ row: changing })
    const keep = button('바꾸지 않기')
    expect(keep.disabled).toBe(false)
    expect(button('메모 고치기').compareDocumentPosition(keep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.setup().click(keep)
    expect(on.onApprove).toHaveBeenCalledWith(false)
    cleanup()
    show({ row: changing, locked: true })
    expect(button('바꾸지 않기').disabled).toBe(true)
    cleanup()
    show()
    expect(screen.queryByRole('button', { name: '바꾸지 않기' })).toBeNull()
  })

  it('AC-3105.2: [이 메모로 바꾸기]는 다른 메모 있음 묶음에만 있고 누르면 onApprove(true), 입력 중·비트 메모 읽는 중이면 막힌다', async () => {
    const diff = { group: 'diff', groupName: '다른 메모 있음', row: row({ chip: null, compare: '다름', inBit: '◈가상 비트 글', declined: true }) } as const
    const { on } = show(diff)
    await userEvent.setup().click(button('이 메모로 바꾸기'))
    expect(on.onApprove).toHaveBeenCalledWith(true)
    for (const over of [{ locked: true }, { reading: true }]) {
      cleanup()
      show({ ...diff, ...over })
      expect(button('이 메모로 바꾸기').disabled).toBe(true)
    }
    cleanup()
    show()
    expect(screen.queryByRole('button', { name: '이 메모로 바꾸기' })).toBeNull()
  })

  it('AC-3105.2: [다시 하기 (n명)]는 지난번 건너뜀 묶음에만 있고 누르면 onHeldRetry, 입력 중·시작이 막혔으면 막힌다', async () => {
    const held = { group: 'held', groupName: '지난번 건너뜀', row: row({ chip: null }), heldCount: 3 } as const
    const { on } = show(held)
    await userEvent.setup().click(button('다시 하기 (3명)'))
    expect(on.onHeldRetry).toHaveBeenCalledTimes(1)
    for (const over of [{ locked: true }, { startBlocked: true }]) {
      cleanup()
      show({ ...held, ...over })
      expect(button('다시 하기 (3명)').disabled).toBe(true)
    }
    cleanup()
    show({ heldCount: 3 })
    expect(screen.queryByRole('button', { name: /다시 하기/ })).toBeNull()
  })

  it('AC-3105.2: 상태 줄은 단추 줄 맨 아래 한 줄이다', () => {
    show({ row: row({ done: true }), status: 'done' })
    expect(statusLine().tagName).toBe('P')
    expect(statusLine().className).toContain('basis-full')
    expect(statusLine().textContent).toContain('완료한 환자예요.')
  })
})

describe('REQ-3103 상태 줄', () => {
  it.each<[string, CopyStatus, string, string, 'alert' | 'status' | null, 'check' | 'x' | '!' | null]>([
    ['AC-3103.8', 'editing', '우리 메모를 고치는 중이에요. 칸 밖을 누르면 반영돼요.', 'text-muted', null, null],
    ['AC-3103.6', 'locked', '입력 중에는 복사할 수 없어요.', 'text-muted', null, null],
    ['AC-3103.6', 'stuck', '저장이 막혀 있는 동안에는 복사할 수 없어요.', 'text-muted', null, null],
    ['AC-3103.3', 'failed', '복사하지 못했어요. 완료로 바뀌지 않았어요. 다시 눌러 주세요.', 'text-negative', 'alert', 'x'],
    ['AC-3103.3', 'failedAgain', '다시 복사하지 못했어요. 완료는 그대로예요. 다시 눌러 주세요.', 'text-negative', 'alert', 'x'],
    ['AC-3104.6', 'reopened', '메모를 고쳐서 완료가 풀렸어요. 고친 메모를 다시 복사(완료)해 주세요.', 'text-warning', null, '!'],
    ['AC-3103.5', 'mark', '확인 표시가 남아 있어 복사할 수 없어요. [메모 고치기]로 표시를 지운 뒤 눌러 주세요.', 'text-warning', null, '!'],
    ['AC-3103.5', 'none', '우리 메모가 없어 복사할 게 없어요.', 'text-muted', null, null],
    ['AC-3103.2', 'copied', '복사했고 완료했어요. 비트 메모 칸에 붙여 넣으세요.', 'text-positive', 'status', 'check'],
    ['AC-3103.7', 'done', '완료한 환자예요. 다시 복사해도 완료는 그대로예요.', 'text-positive', null, 'check'],
  ])('%s·AC-4804.2: 상태 %s의 상태 줄 글·색·역할은 그대로다', (_, status, text, tone, role, mark) => {
    show({ status })
    const line = statusLine()
    expect(line.textContent).toBe(mark === '!' ? `!${text}` : text)
    expect(line.className).toContain(tone)
    expect(line.getAttribute('role')).toBe(role)
    if (mark === null) {
      expect(line.querySelector('b')).toBeNull()
      expect(line.querySelector('svg')).toBeNull()
      return
    }
    // 앞 기호(✕ ! ✓)는 따로 굵게, 첫 문장도 굵게(시안 .status .ic · b)
    const sign = line.firstElementChild as HTMLElement
    expect(sign.className).toContain('font-semibold')
    if (mark === '!') expect(sign.textContent).toBe('!')
    else expect(sign.innerHTML).toBe(markup(mark, 14))
    expect(line.querySelector('b')!.textContent).toBe(`${text.split('. ')[0]}.`)
  })

  it('AC-3103.3: 복사하지 못하면 상태 줄이 알림(role=alert)으로 읽힌다', () => {
    show({ status: 'failed', failed: true })
    expect(screen.getByRole('alert').textContent).toBe('복사하지 못했어요. 완료로 바뀌지 않았어요. 다시 눌러 주세요.')
  })

  it('AC-3103.2: 복사하고 완료하면 상태 줄이 상태 알림(role=status)으로 읽힌다', () => {
    show({ status: 'copied', row: row({ done: true }) })
    expect(screen.getByRole('status').textContent).toBe('복사했고 완료했어요. 비트 메모 칸에 붙여 넣으세요.')
  })

  it("AC-4804.1: 상태가 ready(기본)면 단추 상자에 상태 줄이 없다('누르면 우리 메모가 복사되고…' 글 없음, AC-3103.7을 대신함)", () => {
    show({ status: 'ready' })
    expect(actionBar().querySelector('p')).toBeNull()
    expect(statusLine().tagName).toBe('BUTTON')
    expect(statusLine().textContent).toBe('메모 고치기')
    expect(document.body.textContent).not.toContain('누르면 우리 메모가 복사되고')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    // 지운 글은 파일에도 남지 않는다(상태 이름 ready는 memoSplit이 그대로 돌려준다)
    const text = readFileSync(join(process.cwd(), 'src/components/claim/rows/MemoDetail.tsx'), 'utf-8')
    expect(text).not.toContain('누르면 우리 메모가 복사되고')
  })

  it.each<CopyStatus>(['editing', 'locked', 'stuck', 'failed', 'failedAgain', 'reopened', 'mark', 'none', 'copied', 'done'])(
    'AC-4804.2: ready가 아닌 상태(%s)는 상태 줄이 단추 상자 맨 아래에 그대로 있다',
    (status) => {
      show({ status, row: row({ done: status === 'copied' || status === 'done' }) })
      expect(statusLine().tagName).toBe('P')
      expect(statusLine().className).toContain('basis-full')
      expect(statusLine().textContent).not.toBe('')
    },
  )
})

describe('AC-3105.3 두 칸', () => {
  it('AC-3105.3: 단추 줄 아래에 같은 크기 두 칸(왼쪽 우리 메모 | 오른쪽 비트 메모 카드)이 나란히 있다', () => {
    show()
    const ours = screen.getByRole('group', { name: '우리 메모' })
    const card = screen.getByRole('group', { name: '비트에 저장된 청구메모' })
    expect(ours.textContent).toBe('우리 메모◈가상 메모 A\n◈가상 둘째 줄')
    expect(within(ours).getByText(/◈가상 메모 A/).className).toContain('whitespace-pre-wrap')
    expect(card.textContent).toBe('가짜 비트 카드')
    const grid = ours.parentElement!
    expect(card.parentElement).toBe(grid)
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.firstElementChild).toBe(ours)
    expect(actionBar().compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("AC-3105.3: 우리 메모가 없으면 '우리 메모가 없어요.'", () => {
    show({ row: row({ hasMemo: false, text: '', chip: null }), group: 'nomemo', groupName: '메모 없음', status: 'none' })
    expect(screen.getByRole('group', { name: '우리 메모' }).textContent).toBe('우리 메모우리 메모가 없어요.')
  })

  it("AC-3105.3: 우리 메모 칸 아래에 '빠진 문장: …'과 저장되지 않은 고친 글의 '저장 안 됨'(저장이 막혔거나 실패일 때만)이 있다", () => {
    show({ tableRow: tableRow({ missing: ['가상 사유 가', '가상 사유 나'], unsaved: true }), showUnsaved: true })
    expect(screen.getByText('빠진 문장: 가상 사유 가 · 가상 사유 나')).toBeTruthy()
    const unsaved = screen.getByText('저장 안 됨')
    expect(unsaved.className).toContain('text-negative')
    const ours = screen.getByRole('group', { name: '우리 메모' })
    expect(ours.compareDocumentPosition(unsaved) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(ours.contains(unsaved)).toBe(false)
    cleanup()
    show({ tableRow: tableRow({ unsaved: true }), showUnsaved: false })
    expect(screen.queryByText('저장 안 됨')).toBeNull()
    expect(screen.queryByText(/빠진 문장/)).toBeNull()
  })

  it.each([
    ['check', '확인 필요'],
    ['skipped', '건너뜀'],
    ['skippedByHand', '직접 확인'],
    ['writing', '쓰다 멈춤'],
    ['writeUnconfirmed', '쓰다 멈춤'],
  ])("AC-3105.3: 완료가 아니고 지난 입력 기록이 %s이면 '지난 입력: %s'", (journal, text) => {
    show({ tableRow: tableRow({ lastJournal: journal }) })
    expect(screen.getByText(`지난 입력: ${text}`)).toBeTruthy()
    cleanup()
    show({ row: row({ done: true }), status: 'done', tableRow: tableRow({ lastJournal: journal, done: true }) })
    expect(screen.queryByText(/지난 입력/)).toBeNull()
  })

  it('AC-3105.3: 지난 입력 기록이 없거나 done이면 지난 입력 글이 없다', () => {
    for (const lastJournal of [undefined, 'done']) {
      show({ tableRow: tableRow(lastJournal ? { lastJournal } : {}) })
      expect(screen.queryByText(/지난 입력/)).toBeNull()
      cleanup()
    }
  })
})

describe('AC-3105.4 고치는 칸', () => {
  it('AC-3105.4: 고치는 중이면 우리 메모 칸이 그 자리에서 고치는 칸(파란 테두리·이름 붙은 라벨·초점)이 되고 [메모 고치기]는 없다', () => {
    show({ editing: true, status: 'editing', copyDisabled: true })
    const box = screen.getByRole('textbox', { name: '가상환자A 우리 메모 고치기' }) as HTMLTextAreaElement
    expect(box.tagName).toBe('TEXTAREA')
    expect(box.value).toBe('◈가상 메모 A\n◈가상 둘째 줄')
    expect(document.activeElement).toBe(box)
    expect(box.className).toContain('border-accent')
    expect(box.readOnly).toBe(false)
    expect(screen.getByRole('group', { name: '우리 메모' }).contains(box)).toBe(true)
    expect(screen.queryByRole('button', { name: '메모 고치기' })).toBeNull()
  })

  it('AC-3105.4: 칸 밖을 누르면 고친 글로 onEditDone을 부른다', async () => {
    const user = userEvent.setup()
    const { on } = show({ editing: true, status: 'editing', copyDisabled: true })
    const box = screen.getByRole('textbox', { name: '가상환자A 우리 메모 고치기' })
    await user.click(box)
    await user.type(box, ' 더')
    expect(on.onEditDone).not.toHaveBeenCalled()
    await user.tab()
    expect(on.onEditDone).toHaveBeenCalledWith('◈가상 메모 A\n◈가상 둘째 줄 더')
  })

  it('AC-3105.4: 입력 중에는 읽기 전용이고 칸 밖을 눌러도 알리지 않는다', async () => {
    const user = userEvent.setup()
    const { on } = show({ editing: true, locked: true, status: 'locked', copyDisabled: true, undoDisabled: true })
    const box = screen.getByRole('textbox', { name: '가상환자A 우리 메모 고치기' }) as HTMLTextAreaElement
    expect(box.readOnly).toBe(true)
    await user.click(box)
    await user.type(box, '더')
    expect(box.value).toBe('◈가상 메모 A\n◈가상 둘째 줄')
    await user.tab()
    expect(on.onEditDone).not.toHaveBeenCalled()
  })
})

describe('AC-3105.5 증상·처방 표', () => {
  // 모두 지어낸 차트 글과 처방이다
  const LINES: TargetRow['chartLines'] = [
    { kind: 'subj', text: '가상 왼쪽 통증' },
    { kind: 'exam', text: 'Td(+): 가상 부위' },
    { kind: 'dx', text: '가상 진단 글' },
    { kind: 'img', text: 'sono: 가상 소견' },
    { kind: 'proc', text: '가상시술 가 나' },
    { kind: 'rx', text: 'med' },
    { kind: 'plan', text: '1주 뒤 가상 계획' },
    { kind: null, text: '머리말 없는 가상 줄' },
  ]
  const RX: TargetRow['rxRows'] = [
    { kind: 'proc', code: 'LA901', name: '가상신경차단술-가', short: 'GNB', qty: 2, benefit: true },
    { kind: 'proc', code: 'LA902', name: '가상신경차단술-나', short: '', qty: 1, benefit: true },
    { kind: 'drug', code: 'A901', name: '가상주사_(20mL)', short: '가상약', qty: 0.2, benefit: true },
    { kind: 'other', code: 'B901', name: '가상관절주', short: '', qty: null, benefit: false },
    { kind: 'other', code: 'B902', name: '가상물리치료', short: '', qty: 3, benefit: true },
  ]
  const full = () => show({ row: row({ chartLines: LINES, rxRows: RX }) })
  const cells = (tr: Element) => [...tr.querySelectorAll('td')].map((td) => td.textContent)

  it('AC-3105.5: 증상 · 차트 원문 표는 종류 이름표 | 원문이고 바탕색이 없으며 시술 줄의 이름표는 굵다', () => {
    full()
    const chart = screen.getByRole('region', { name: '증상 · 차트 원문' })
    expect(within(chart).getByRole('heading').textContent).toBe('증상 · 차트 원문 8줄')
    const rows = within(chart).getAllByRole('row')
    expect(rows.map(cells)).toEqual([
      ['호소', '가상 왼쪽 통증'],
      ['검사', 'Td(+): 가상 부위'],
      ['진단', '가상 진단 글'],
      ['영상', 'sono: 가상 소견'],
      ['시술', '가상시술 가 나'],
      ['처치', 'med'],
      ['계획', '1주 뒤 가상 계획'],
      ['', '머리말 없는 가상 줄'],
    ])
    for (const element of [...rows, ...chart.querySelectorAll('td')]) expect(element.className).not.toMatch(/(^|\s)bg-/)
    const label = (index: number) => rows[index].querySelector('td')!.className
    expect(label(4)).toContain('font-semibold')
    expect(label(4)).toContain('text-ink')
    for (const index of [0, 1, 2, 3, 5, 6]) {
      expect(label(index)).toContain('text-muted')
      expect(label(index)).not.toContain('font-semibold')
    }
    expect(rows[0].querySelectorAll('td')[1].className).toContain('whitespace-pre-wrap')
  })

  it('AC-3105.5: 처방내역 표는 종류 · 코드 · 처방명(짧은 이름) · 총투여량 ×n(못 읽으면 ×? 주황) · 급여/비급여이고 줄 차례는 받은 그대로다', () => {
    full()
    const rx = screen.getByRole('region', { name: '처방내역' })
    expect(within(rx).getByRole('heading').textContent).toBe('처방내역 5줄 · 시술 2')
    expect(within(rx).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['종류', '코드', '처방명', '총투여량', '급여'])
    const rows = within(rx).getAllByRole('row').slice(1)
    expect(rows.map(cells)).toEqual([
      ['시술', 'LA901', '가상신경차단술-가 GNB', '×2', '급여'],
      ['시술', 'LA902', '가상신경차단술-나', '×1', '급여'],
      ['약제', 'A901', '가상주사_(20mL) 가상약', '×0.2', '급여'],
      ['기타', 'B901', '가상관절주', '×?', '비급여'],
      ['기타', 'B902', '가상물리치료', '×3', '급여'],
    ])
    const td = (index: number, column: number) => rows[index].querySelectorAll('td')[column]
    expect(td(0, 1).className).toContain('font-semibold')
    expect(within(td(0, 2)).getByText('GNB').className).toContain('text-muted')
    expect(td(3, 3).className).toContain('text-warning')
    expect(td(4, 3).className).not.toContain('text-warning')
    expect(td(0, 0).className).toContain('font-semibold')
    expect(td(2, 0).className).toContain('text-muted')
    for (const element of [...rows, ...rx.querySelectorAll('tbody td')]) expect(element.className).not.toMatch(/(^|\s)bg-/)
  })

  it("AC-3105.5: 처방이 없으면 '처방내역이 없어요.'", () => {
    show()
    const rx = screen.getByRole('region', { name: '처방내역' })
    expect(within(rx).getByRole('heading').textContent).toBe('처방내역 0줄 · 시술 0')
    expect(within(rx).getByText('처방내역이 없어요.')).toBeTruthy()
    expect(within(rx).queryByRole('table')).toBeNull()
  })

  it('AC-3105.5: 두 표는 두 칸 아래에 2 : 3 너비로 나란히 있다', () => {
    full()
    const chart = screen.getByRole('region', { name: '증상 · 차트 원문' })
    const rx = screen.getByRole('region', { name: '처방내역' })
    expect(chart.parentElement).toBe(rx.parentElement)
    expect(chart.parentElement!.className).toContain('grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')
    expect(chart.nextElementSibling).toBe(rx)
    const memos = screen.getByRole('group', { name: '우리 메모' })
    expect(memos.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('REQ-4803 lg 이상: 머리 한 줄 · 아래 세 칸', () => {
  // lg 미만은 지금 class 그대로이고 lg: class만 더한다(jsdom은 배치를 재지 않아 class·차례·구조를 본다). 처방·증상은 지어낸 것이다
  const classes = (element: Element) => (element.getAttribute('class') ?? '').split(/\s+/)
  const has = (element: Element, names: string) => expect(classes(element)).toEqual(expect.arrayContaining(names.split(' ')))
  const RX: TargetRow['rxRows'] = [
    { kind: 'proc', code: 'LA901', name: '가상신경차단술-아주 긴 처방 이름 가', short: 'GNB', qty: 2, benefit: true },
    { kind: 'other', code: 'B901', name: '가상관절주', short: '', qty: null, benefit: false },
  ]
  const LINES: TargetRow['chartLines'] = [
    { kind: 'subj', text: '가상 왼쪽 통증이 오래 이어지는 아주 긴 호소 글 가상 왼쪽 통증이 오래 이어지는 아주 긴 호소 글' },
    { kind: 'proc', text: '가상시술 가 나' },
  ]
  const root = (view: ReturnType<typeof show>['view']) => view.container.firstElementChild as HTMLElement
  const head = (view: ReturnType<typeof show>['view']) => root(view).firstElementChild as HTMLElement

  it('AC-4803.1: 머리는 lg에서 한 줄이다: 왼쪽 묶음 lg:contents, 위치 글 lg:order-2 lg:ml-auto, 단추 묶음 lg:order-3 lg:flex-row', () => {
    const { view } = show()
    const top = head(view)
    has(top, 'flex items-start justify-between gap-3 lg:flex-wrap lg:items-center lg:justify-start lg:gap-x-2 lg:gap-y-1')
    expect(top.children).toHaveLength(2)
    const [left, nav] = [...top.children]
    has(left, 'flex min-w-0 flex-col gap-0.5 lg:contents')
    const position = screen.getByText('입력할 사람 2 / 10')
    expect(position.parentElement).toBe(left)
    has(position, 'text-caption font-semibold text-accent-strong lg:order-2 lg:ml-auto')
    expect(nav.contains(button('↑ 앞 사람'))).toBe(true)
    expect(nav.contains(screen.getByText('키보드'))).toBe(true)
    has(nav, 'flex shrink-0 flex-col items-end gap-1 lg:order-3 lg:flex-row lg:items-center')
    // 이름·표시·진료일 줄은 차례(order)를 주지 않아 위치 글·단추 묶음보다 앞(왼쪽)에 선다
    for (const element of [screen.getByRole('heading', { name: '가상환자A' }).parentElement!, screen.getByText('진료일').parentElement!]) {
      expect(element.parentElement).toBe(left)
      expect(classes(element).some((name) => name.includes('order'))).toBe(false)
    }
  })

  it('AC-4803.1: 안내(까닭·PC가 찾음·점검 경고)는 머리 왼쪽 묶음 안 진료일 줄 바로 뒤에 있고 lg에서 가로로 잇는다', () => {
    const { view } = show({ group: 'manual', groupName: '직접 입력', row: row({ chip: null, sameDay: 3, warned: true }) })
    const left = head(view).firstElementChild as HTMLElement
    const info = screen.getByText('점검 경고 있음 · 입력은 돼요').parentElement!
    expect(info.parentElement).toBe(left)
    expect(screen.getByText('진료일').parentElement!.nextElementSibling).toBe(info)
    expect(left.lastElementChild).toBe(info)
    expect([...info.children].map((element) => element.textContent)).toEqual([LEFT_GROUPS.manual.why, '같은 날 진료 3건', '점검 경고 있음 · 입력은 돼요'])
    has(info, 'flex flex-col gap-0.5 text-small text-ink-2 lg:flex-row lg:flex-wrap lg:gap-x-2')
    // 머리 밖(아래)에는 따로 안내 묶음이 없다: 뿌리는 머리 · 아래 둘뿐
    expect(root(view).children).toHaveLength(2)
    cleanup()
    const plain = show()
    expect(head(plain.view).firstElementChild!.children).toHaveLength(3)
  })

  it('AC-4803.2: 머리 아래는 lg에서 세 칸 격자이고 차례는 ① 단추 상자·메모 ② 증상 ③ 처방이다. 뿌리는 남은 높이를 채운다', () => {
    const { view } = show({ row: row({ chartLines: LINES, rxRows: RX }) })
    has(root(view), 'flex min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:gap-2')
    const lower = root(view).lastElementChild as HTMLElement
    has(lower, 'flex flex-col gap-3 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[clamp(13.75rem,30%,18.75rem)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]')
    expect(lower.children).toHaveLength(2)
    const [side, tables] = [...lower.children]
    has(side, 'flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:gap-2')
    expect(side.firstElementChild).toBe(actionBar())
    const memos = screen.getByRole('group', { name: '우리 메모' }).parentElement!
    expect(side.lastElementChild).toBe(memos)
    // 표 묶음은 lg에서 상자가 없어져(lg:contents) 증상·처방이 바깥 격자의 ②·③ 칸이 된다. lg 미만 2 : 3 두 칸은 그대로
    const chart = screen.getByRole('region', { name: '증상 · 차트 원문' })
    const rx = screen.getByRole('region', { name: '처방내역' })
    has(tables, 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 lg:contents')
    expect([...tables.children]).toEqual([chart, rx])
  })

  it('AC-4803.3: ① 칸의 우리 메모와 비트 메모 카드는 lg에서 남은 높이를 똑같이 나누고, 알림 글은 우리 메모 바로 아래에 온다', () => {
    show({ tableRow: tableRow({ missing: ['가상 사유 가'], unsaved: true, lastJournal: 'check' }), showUnsaved: true })
    const ours = screen.getByRole('group', { name: '우리 메모' })
    const memos = ours.parentElement!
    has(memos, 'grid grid-cols-2 gap-x-3 gap-y-1 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-2')
    has(ours, 'flex min-h-28 min-w-0 flex-col gap-1 rounded-control border border-line bg-canvas px-3 py-2 lg:-order-2 lg:min-h-24 lg:flex-1 lg:overflow-y-auto')
    const notes = screen.getByText('빠진 문장: 가상 사유 가').parentElement!
    has(notes, 'col-start-1 flex flex-col gap-0.5 lg:-order-1')
    expect(notes.textContent).toBe('빠진 문장: 가상 사유 가저장 안 됨지난 입력: 확인 필요')
    // DOM 차례는 그대로(우리 메모 · 비트 메모 카드 · 알림 글)라 lg 미만 두 칸 모양은 같다. lg에서는 order로 우리 메모 → 알림 글 → 카드
    const card = screen.getByRole('group', { name: '비트에 저장된 청구메모' })
    expect([...memos.children]).toEqual([ours, card, notes])
    expect(classes(card).some((name) => name.includes('order'))).toBe(false)
  })

  it('AC-4803.4: 단추 상자는 lg에서 복사 단추가 한 줄을 다 쓰고, 빈 칸은 숨고, 그 밖의 단추는 아래 줄에 나눠 선다', () => {
    show({ row: row({ done: true, compare: '다름', inBit: '◈가상 비트 글', chip: '메모 바꿈' }), status: 'done' })
    has(actionBar(), 'flex flex-wrap items-center gap-2 rounded-control border border-line bg-canvas px-3 py-2 lg:gap-1.5')
    has(copyButton(), 'lg:basis-full')
    const spacer = [...actionBar().children].find((element) => element.tagName === 'SPAN')!
    has(spacer, 'flex-1 lg:hidden')
    for (const name of ['완료 풀기', '메모 고치기', '바꾸지 않기']) has(button(name), 'lg:flex-1')
    cleanup()
    show({ group: 'diff', groupName: '다른 메모 있음', row: row({ chip: null, compare: '다름', inBit: '◈가상 비트 글', declined: true }) })
    has(button('이 메모로 바꾸기'), 'lg:flex-1')
    cleanup()
    show({ group: 'held', groupName: '지난번 건너뜀', row: row({ chip: null }), heldCount: 2 })
    has(button('다시 하기 (2명)'), 'lg:flex-1')
    // 복사 단추는 늘 맨 앞, 상태 줄은 늘 맨 뒤(그대로)
    expect(actionBar().firstElementChild).toBe(copyButton())
    expect(classes(copyButton())).not.toContain('lg:flex-1')
  })

  it('AC-4803.5: 증상 표는 lg에서 칸 안에서 스크롤되고 글은 자르지 않고 다음 줄로 넘긴다', () => {
    show({ row: row({ chartLines: LINES, rxRows: RX }) })
    const chart = screen.getByRole('region', { name: '증상 · 차트 원문' })
    has(chart, 'flex min-w-0 flex-col gap-1.5 lg:min-h-0')
    const table = within(chart).getByRole('table')
    has(table, 'w-full table-fixed border-collapse border border-line text-small lg:border-0')
    const box = table.parentElement!
    expect(box.tagName).toBe('DIV')
    expect(box.parentElement).toBe(chart)
    has(box, 'lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:border lg:border-line')
    const text = within(chart).getByText(LINES[0].text)
    has(text, 'whitespace-pre-wrap break-words')
    expect(chart.querySelector('[class*="truncate"]')).toBeNull()
    expect(chart.querySelector('[class*="ellipsis"]')).toBeNull()
  })

  it('AC-4803.6: 처방 표는 lg에서 칸 안에서 스크롤되고 표 머리는 위에 붙으며, 처방명은 한 줄로 잘리고 title에 전체 이름이 있다. 짧은 이름은 잘리지 않는다', () => {
    show({ row: row({ chartLines: LINES, rxRows: RX }) })
    const rx = screen.getByRole('region', { name: '처방내역' })
    const table = within(rx).getByRole('table')
    has(table, 'lg:border-0')
    const box = table.parentElement!
    expect(box.parentElement).toBe(rx)
    has(box, 'lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:border lg:border-line')
    has(rx, 'lg:min-h-0')
    for (const th of within(rx).getAllByRole('columnheader')) has(th, 'whitespace-nowrap bg-canvas lg:sticky lg:top-0 lg:z-1')
    const [first, second] = within(rx).getAllByRole('row').slice(1)
    const nameCell = first.querySelectorAll('td')[2]
    has(nameCell, 'break-words')
    const wrap = nameCell.firstElementChild as HTMLElement
    expect(nameCell.children).toHaveLength(1)
    has(wrap, 'lg:flex lg:min-w-0 lg:items-baseline lg:gap-1')
    const name = wrap.firstElementChild as HTMLElement
    expect(name.textContent).toBe('가상신경차단술-아주 긴 처방 이름 가')
    expect(name.getAttribute('title')).toBe('가상신경차단술-아주 긴 처방 이름 가')
    has(name, 'lg:min-w-0 lg:truncate')
    const short = within(wrap).getByText('GNB')
    has(short, 'text-caption text-muted lg:shrink-0 lg:whitespace-nowrap')
    expect(classes(short)).not.toContain('lg:truncate')
    expect(nameCell.textContent).toBe('가상신경차단술-아주 긴 처방 이름 가 GNB')
    // 짧은 이름이 없는 줄도 같은 틀이고 title이 있다
    const plain = second.querySelectorAll('td')[2].firstElementChild!.firstElementChild!
    expect(plain.getAttribute('title')).toBe('가상관절주')
    expect(second.querySelectorAll('td')[2].textContent).toBe('가상관절주')
  })

  it('AC-4803.6: 좁은 lg(1024px 근처)에서도 처방 표는 최소 20rem 폭이라(표 칸 안에서 옆으로 스크롤) 처방명 칸이 0이 되지 않고, 처방명 칸은 넘친 글을 잘라 짧은 이름이 옆 칸(총투여량)과 겹치지 않는다', () => {
    show({ row: row({ chartLines: LINES, rxRows: RX }) })
    const rx = screen.getByRole('region', { name: '처방내역' })
    const table = within(rx).getByRole('table')
    has(table, 'w-full table-fixed lg:min-w-80')
    const nameCell = within(rx).getAllByRole('row')[1].querySelectorAll('td')[2]
    has(nameCell, 'lg:overflow-hidden')
    // 1024px 아래는 그대로(줄바꿈)
    has(nameCell, 'break-words')
  })

  it('AC-4805.1: 짧은 이름이 처방명과 같으면(앞뒤 빈칸 빼고) 쓰지 않고, 다르면 처방명 뒤에 쓴다', () => {
    const rows: TargetRow['rxRows'] = [
      { kind: 'other', code: 'AA901', name: '가상진찰료', short: '가상진찰료', qty: 1, benefit: true },
      { kind: 'other', code: 'AA902', name: '가상관리료 ', short: ' 가상관리료', qty: 1, benefit: true },
      { kind: 'drug', code: 'A901', name: '가상주사_(20mL)', short: '가상약', qty: 1, benefit: true },
      { kind: 'other', code: 'B901', name: '가상물리치료', short: '  ', qty: 1, benefit: true },
    ]
    show({ row: row({ rxRows: rows }) })
    const rx = screen.getByRole('region', { name: '처방내역' })
    const names = within(rx).getAllByRole('row').slice(1).map((tr) => tr.querySelectorAll('td')[2])
    expect(names.map((td) => td.textContent)).toEqual(['가상진찰료', '가상관리료 ', '가상주사_(20mL) 가상약', '가상물리치료'])
    for (const index of [0, 1, 3]) expect(names[index].querySelector('.text-muted')).toBeNull()
    expect(within(names[2]).getByText('가상약').className).toContain('text-muted')
  })
})

describe('AC-3107.3 환자 줄 울타리', () => {
  it('AC-3107.3: 상세 파일은 정한 것만 불러오고 네트워크·저장소·console·supabase·클립보드가 없다(줄은 props로만 받는다)', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/claim/rows/MemoDetail.tsx'), 'utf-8')
    const imports = [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((match) => match[1])
    expect(imports).toEqual(['react', '@/components/common/Icon', '@/components/ui/classes', '@/types/precheck', '../dateList', './leftGroups', './MemoList'])
    expect(text).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console|supabase|navigator|clipboard|execCommand)\b/)
    expect(text).not.toMatch(/\bimport\(/)
    expect(text).toMatch(/row\.chartLines/)
    expect(text).toMatch(/row\.rxRows/)
  })

  it('AC-3107.3: 같은 props면 같은 상세다(안에 쥔 자료가 없다)', () => {
    const first = show({ status: 'copied', row: row({ done: true }) }).view.container.innerHTML
    cleanup()
    expect(show({ status: 'copied', row: row({ done: true }) }).view.container.innerHTML).toBe(first)
  })
})
