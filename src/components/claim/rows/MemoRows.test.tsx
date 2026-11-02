// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InputTargets, TargetRow } from '@/types/precheck'
import { MemoRows } from './MemoRows'

// 입력할 사람·빠지는 사람(AC-018.14·AC-018.26·AC-018.27). 줄은 props로만 받는다. 이름은 지어낸 것이다

afterEach(cleanup)

const row = (key: string, over: Partial<TargetRow> = {}): TargetRow => ({
  key,
  date: '2026-10-28',
  text: `우리 메모 ${key}`,
  hasMemo: true,
  unfinished: false,
  compare: '비트에 없음',
  chart: `9${key}`,
  name: `가상환자${key}`,
  rx: ['LA358'],
  rxNames: ['가상시술 가'],
  warned: false,
  sameDay: 1,
  foundByPc: false,
  chip: '새 메모',
  ...over,
})
const targets = (over: Partial<InputTargets> = {}): InputTargets => ({ problem: null, range: { from: '2026-10-28', to: '2026-10-28' }, code: null, batch: [], left: [], chips: [], typedOverChip: false, replacing: 0, ...over })
const handlers = () => ({ onToggle: vi.fn(), onApprove: vi.fn(), onEdit: vi.fn(), onEditDone: vi.fn(), onHeldRetry: vi.fn() })
function show(value: InputTargets, over: Partial<Parameters<typeof MemoRows>[0]> = {}) {
  const on = handlers()
  render(<MemoRows targets={value} locked={false} reading={false} open={new Set()} editing={null} card={(item) => <p>카드 {item.key}</p>} {...on} {...over} />)
  return on
}

describe('AC-018.26 묶음', () => {
  it('AC-018.26: 맨 위 수와 입력할 사람 줄(번호·이름·칩)', () => {
    show(targets({ batch: [row('a'), row('b', { warned: true })], left: [{ reason: 'nomemo', rows: [row('c', { chip: null })] }] }))
    expect(screen.getByRole('region', { name: '입력할 사람과 빠지는 사람' }).textContent).toContain('2명 입력해요')
    expect(screen.getByRole('region', { name: '입력할 사람과 빠지는 사람' }).textContent).toContain('빠지는 사람 1명')
    expect(screen.getByRole('button', { name: /가상환자a/ }).textContent).toContain('새 메모')
    expect(screen.getByRole('button', { name: /가상환자b/ }).textContent).toContain('점검 경고 있음 · 입력은 돼요')
  })

  it.each([
    ['done', '이미 입력됨', '비트 메모가 우리 메모와 같아요. 다시 넣지 않아요.'],
    ['nomemo', '메모 없음', '이 진료에는 넣을 메모가 없어요.'],
    ['mark', '확인 필요', '메모에 확인 표시가 남아 있어요. 고치면 들어가요. 묻지 않기가 켜져 있어도 넣지 않아요.'],
    ['manual', '직접 입력', '같은 사람의 같은 날 진료가 여럿이라 어느 진료에 넣을지 알 수 없어요. 비트에서 직접 넣어 주세요.'],
    ['diff', '다른 메모 있음', '비트에 우리 메모와 다른 메모가 있어요. [이 메모로 바꾸기]를 누른 사람만 들어가요.'],
    ['unread', '비트 메모를 읽지 못함', '비어 있다고 보고 넣으면 두 번 들어갈 수 있어 뺐어요. 자료를 다시 불러와 주세요.'],
    ['held', '지난번 건너뜀', '지난 입력에서 건너뛴 뒤 메모가 그대로예요. 메모를 고치거나 [다시 하기]를 눌러 주세요.'],
  ] as const)('AC-018.26: %s 묶음의 이름과 까닭', (reason, name, why) => {
    show(targets({ left: [{ reason, rows: [row('a', { chip: null, inBit: '비트 글' })] }] }))
    const group = screen.getByRole('group', { name })
    expect(group.textContent).toContain(why)
    expect(group.textContent).toContain('1명')
  })

  it('AC-018.26: 사람마다 넣고 빼는 체크가 없다', () => {
    show(targets({ batch: [row('a')], left: [{ reason: 'done', rows: [row('b', { chip: null })] }] }))
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('AC-018.26: 안내가 있고 맞는 사람이 없으면 안내 글, 입력할 사람이 없으면 없다는 글', () => {
    const { unmount } = render(<MemoRows targets={targets({ problem: '날짜를 골라 주세요' })} locked={false} reading={false} open={new Set()} editing={null} card={() => null} {...handlers()} />)
    expect(screen.getByText('위 안내대로 고르면 여기에 입력할 사람이 날짜 순서로 보여요.')).toBeTruthy()
    unmount()
    show(targets({ left: [{ reason: 'nomemo', rows: [row('a', { chip: null })] }] }))
    expect(screen.getByText('지금 입력할 사람이 없어요.')).toBeTruthy()
  })

  it('AC-018.13: 직접 입력 줄의 작은 글: 같은 날 진료 N건 · 지난 입력 때 PC가 찾아냈어요.', () => {
    show(targets({ left: [{ reason: 'manual', rows: [row('a', { sameDay: 2 }), row('b', { foundByPc: true })] }] }))
    const group = screen.getByRole('group', { name: '직접 입력' })
    expect(group.textContent).toContain('같은 날 진료 2건')
    expect(group.textContent).toContain('지난 입력 때 PC가 찾아냈어요.')
  })

  it('AC-018.26: 확인 필요 줄은 표시를 드러낸 우리 메모를 보이고, [메모 고치기]는 칸을 열고 칸 밖을 누르면 알린다', async () => {
    const user = userEvent.setup()
    const value = targets({ left: [{ reason: 'mark', rows: [row('a', { text: '글 [부위 확인] 끝', unfinished: true })] }] })
    const on = show(value)
    expect(screen.getByRole('group', { name: '확인 필요' }).textContent).toContain('[부위 확인]')
    await user.click(screen.getByRole('button', { name: '메모 고치기' }))
    expect(on.onEdit).toHaveBeenCalledWith('a')
    cleanup()
    const edit = show(value, { editing: 'a' })
    const box = screen.getByRole('textbox', { name: '가상환자a 메모 고치기' })
    await user.clear(box)
    await user.type(box, '고친 글')
    await user.tab()
    expect(edit.onEditDone).toHaveBeenCalledWith('a', '고친 글')
  })

  it(`AC-018.20: '지난번 건너뜀' 묶음에 [메모 고치기]와 그 사람들만 다시 묶는 [다시 하기 (N명)]가 있다`, async () => {
    const on = show(targets({ left: [{ reason: 'held', rows: [row('a'), row('b')] }] }))
    const group = screen.getByRole('group', { name: '지난번 건너뜀' })
    expect(within(group).getAllByRole('button', { name: '메모 고치기' })).toHaveLength(2)
    await userEvent.setup().click(within(group).getByRole('button', { name: '다시 하기 (2명)' }))
    expect(on.onHeldRetry).toHaveBeenCalledTimes(1)
  })
})

describe('AC-018.14 다른 메모', () => {
  const diff = row('d', { compare: '다름', inBit: '비트에 있는 글', chip: null })

  it(`AC-018.14: '다른 메모 있음' 줄은 누르지 않아도 두 메모가 나란히 보이고 [이 메모로 바꾸기]가 있다`, async () => {
    const on = show(targets({ left: [{ reason: 'diff', rows: [diff] }] }))
    const group = screen.getByRole('group', { name: '다른 메모 있음' })
    expect(group.textContent).toContain('비트에 있는 메모')
    expect(group.textContent).toContain('비트에 있는 글')
    expect(group.textContent).toContain('우리 메모')
    expect(group.textContent).toContain('우리 메모 d')
    await userEvent.setup().click(within(group).getByRole('button', { name: '이 메모로 바꾸기' }))
    expect(on.onApprove).toHaveBeenCalledWith('d', true)
  })

  it.each([
    ['메모 없음', 'nomemo'],
    ['이미 입력됨', 'done'],
    ['확인 필요', 'mark'],
    ['직접 입력', 'manual'],
  ] as const)('AC-018.14: %s 줄에는 다름이어도 단추가 없다', (_, reason) => {
    show(targets({ left: [{ reason, rows: [diff] }] }))
    expect(screen.queryByRole('button', { name: '이 메모로 바꾸기' })).toBeNull()
  })

  it(`AC-018.14: '메모 바꿈 · 승인함' 줄에도 두 메모가 늘 보이고 [바꾸지 않기]가 승인을 푼다`, async () => {
    const on = show(targets({ batch: [row('d', { compare: '다름', inBit: '비트에 있는 글', replaces: '비트에 있는 글', chip: '메모 바꿈 · 승인함' })], replacing: 1 }))
    const list = screen.getByRole('region', { name: '입력할 사람과 빠지는 사람' })
    expect(list.textContent).toContain('메모 바꿈 · 승인함')
    expect(list.textContent).toContain('비트에 있는 글')
    expect(list.textContent).toContain('우리 메모 d')
    await userEvent.setup().click(screen.getByRole('button', { name: '바꾸지 않기' }))
    expect(on.onApprove).toHaveBeenCalledWith('d', false)
  })

  it(`AC-018.14: 묻지 않기가 켜지면 '메모 바꿈 · 묻지 않기' 칩이고 단추가 없고 두 메모는 보인다`, () => {
    show(targets({ batch: [row('d', { compare: '다름', inBit: '비트에 있는 글', chip: '메모 바꿈 · 묻지 않기' })], replacing: 1 }))
    expect(screen.queryByRole('button', { name: '이 메모로 바꾸기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '바꾸지 않기' })).toBeNull()
    expect(screen.getByRole('region', { name: '입력할 사람과 빠지는 사람' }).textContent).toContain('비트에 있는 글')
  })

  it('AC-018.14: 비트 메모를 읽는 동안 [이 메모로 바꾸기]를 누를 수 없고, 입력 중에는 두 단추 다 못 누른다', () => {
    const value = targets({ batch: [row('b', { compare: '다름', inBit: '글', replaces: '글', chip: '메모 바꿈 · 승인함' })], left: [{ reason: 'diff', rows: [diff] }] })
    show(value, { reading: true })
    expect((screen.getByRole('button', { name: '이 메모로 바꾸기' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '바꾸지 않기' }) as HTMLButtonElement).disabled).toBe(false)
    cleanup()
    show(value, { locked: true })
    expect((screen.getByRole('button', { name: '이 메모로 바꾸기' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '바꾸지 않기' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('AC-018.27 열고 접기', () => {
  it('AC-018.27: 줄을 누르면 알리고, 열린 줄은 카드가 보이며 여럿 함께 열 수 있다', async () => {
    const value = targets({ batch: [row('a'), row('b')] })
    const on = show(value)
    const head = screen.getByRole('button', { name: /가상환자a/ })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(head.textContent).toContain('메모 보기')
    await userEvent.setup().click(head)
    expect(on.onToggle).toHaveBeenCalledWith('a')
    cleanup()
    show(value, { open: new Set(['a', 'b']) })
    expect(screen.getByRole('button', { name: /가상환자a/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /가상환자a/ }).textContent).toContain('접기')
    expect(screen.getByText('카드 a')).toBeTruthy()
    expect(screen.getByText('카드 b')).toBeTruthy()
    expect(screen.getByText('우리 메모 a')).toBeTruthy()
  })

  it('AC-018.25: 우리 메모가 없으면 없다고 쓴다', () => {
    show(targets({ left: [{ reason: 'nomemo', rows: [row('a', { text: '', hasMemo: false, chip: null })] }] }), { open: new Set(['a']) })
    expect(screen.getByText('우리 메모가 없어요.')).toBeTruthy()
  })
})
