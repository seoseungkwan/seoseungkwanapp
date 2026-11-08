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

  it('AC-3105.2: 오른쪽 [메모 고치기]는 우리 메모 글이 있을 때만 있고 누르면 onEdit, 입력 중이면 막힌다', async () => {
    const { on } = show()
    await userEvent.setup().click(button('메모 고치기'))
    expect(on.onEdit).toHaveBeenCalledTimes(1)
    cleanup()
    show({ locked: true, status: 'locked', copyDisabled: true })
    expect(button('메모 고치기').disabled).toBe(true)
    for (const over of [{ hasMemo: false, text: '' }, { hasMemo: true, text: '   \n ' }]) {
      cleanup()
      show({ row: row({ ...over, chip: null }), group: 'nomemo', groupName: '메모 없음', status: 'none', copyDisabled: true })
      expect(screen.queryByRole('button', { name: '메모 고치기' })).toBeNull()
    }
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
    show()
    expect(statusLine().tagName).toBe('P')
    expect(statusLine().className).toContain('basis-full')
    expect(statusLine().textContent).toContain('누르면 우리 메모가 복사되고')
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
    ['AC-3103.7', 'ready', '누르면 우리 메모가 복사되고 완료로 바뀌어요. 그다음 비트 메모 칸에 붙여 넣으세요.', 'text-muted', null, null],
  ])('%s: 상태 %s의 상태 줄 글·색·역할', (_, status, text, tone, role, mark) => {
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

describe('AC-3107.3 환자 줄 울타리', () => {
  it('AC-3107.3: 상세 파일은 정한 것만 불러오고 네트워크·저장소·console·supabase·클립보드가 없다(줄은 props로만 받는다)', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/claim/rows/MemoDetail.tsx'), 'utf-8')
    const imports = [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((match) => match[1])
    expect(imports).toEqual(['react', '@/components/common/Icon', '@/components/ui/classes', '@/lib/precheck/memoCompare', '@/types/precheck', '../dateList', './leftGroups', './MemoList'])
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
