// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    ['diff', '다른 메모 있음', '비트에 우리 메모와 다른 메모가 있어요. [바꾸지 않기]를 눌렀거나 직접 확인한 사람이에요. [이 메모로 바꾸기]를 누르면 들어가요.'],
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

  it(`AC-018.14·AC-018.26: '메모 바꿈' 줄에 누르지 않아도 두 메모가 늘 보이고 [바꾸지 않기]가 그 사람을 뺀다`, async () => {
    const on = show(targets({ batch: [row('d', { compare: '다름', inBit: '비트에 있는 글', replaces: '비트에 있는 글', chip: '메모 바꿈' })], replacing: 1 }))
    const list = screen.getByRole('region', { name: '입력할 사람과 빠지는 사람' })
    expect(screen.getByRole('button', { name: /가상환자d/ }).textContent).toContain('메모 바꿈')
    expect(list.textContent).toContain('비트에 있는 메모')
    expect(list.textContent).toContain('비트에 있는 글')
    expect(list.textContent).toContain('우리 메모 d')
    await userEvent.setup().click(screen.getByRole('button', { name: '바꾸지 않기' }))
    expect(on.onApprove).toHaveBeenCalledWith('d', false)
  })

  it(`AC-018.14·AC-2204.3: '메모 바꿈' 줄에는 [바꾸지 않기]·[메모 고치기]만 있고(묻지 않기가 켜져 있어도 같은 줄이다) 두 메모는 보인다`, () => {
    show(targets({ batch: [row('d', { compare: '다름', inBit: '비트에 있는 글', replaces: '비트에 있는 글', chip: '메모 바꿈' })], replacing: 1 }))
    expect(screen.queryByRole('button', { name: '이 메모로 바꾸기' })).toBeNull()
    expect(screen.getByRole('button', { name: '바꾸지 않기' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '입력할 사람과 빠지는 사람' }).textContent).toContain('비트에 있는 글')
  })

  it(`AC-018.14: '새 메모' 줄에는 [바꾸지 않기]가 없다`, () => {
    show(targets({ batch: [row('a')] }))
    expect(screen.queryByRole('button', { name: '바꾸지 않기' })).toBeNull()
  })

  it('AC-018.14: 비트 메모를 읽는 동안 [이 메모로 바꾸기]를 누를 수 없고, 입력 중에는 두 단추 다 못 누른다', () => {
    const value = targets({ batch: [row('b', { compare: '다름', inBit: '글', replaces: '글', chip: '메모 바꿈' })], left: [{ reason: 'diff', rows: [diff] }] })
    show(value, { reading: true })
    expect((screen.getByRole('button', { name: '이 메모로 바꾸기' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '바꾸지 않기' }) as HTMLButtonElement).disabled).toBe(false)
    cleanup()
    show(value, { locked: true })
    expect((screen.getByRole('button', { name: '이 메모로 바꾸기' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '바꾸지 않기' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('REQ-2203 목록의 메모 줄마다 [메모 고치기]', () => {
  const EDIT = '메모 고치기'
  const all = () =>
    targets({
      batch: [row('a'), row('m', { compare: '다름', inBit: '비트 글 m', replaces: '비트 글 m', chip: '메모 바꿈' })],
      left: [
        { reason: 'done', rows: [row('d', { compare: '같음', inBit: '우리 메모 d', chip: null }), row('e', { text: ' 　', compare: '다름', inBit: '비트 글 e', chip: null })] },
        { reason: 'nomemo', rows: [row('n', { hasMemo: false, text: '사람이 친 글', chip: null }), row('w', { text: '  ', chip: null })] },
        { reason: 'mark', rows: [row('k', { text: '글 [부위 확인] 끝', unfinished: true, chip: null })] },
        { reason: 'manual', rows: [row('u', { sameDay: 2, chip: null })] },
        { reason: 'diff', rows: [row('f', { compare: '다름', inBit: '비트 글 f', chip: null })] },
        { reason: 'unread', rows: [row('r', { compare: '조회 못함', chip: null })] },
        { reason: 'held', rows: [row('h', { chip: null })] },
      ],
    })
  const lineOf = (key: string) => screen.getByRole('button', { name: new RegExp(`가상환자${key}`) }).closest('li')!
  const editIn = (key: string) => within(lineOf(key)).queryByRole('button', { name: EDIT }) as HTMLButtonElement | null

  it('AC-2203.1: 우리 메모 글이 있는 줄마다 [메모 고치기]가 하나 있고, 메모 없음 줄과 글이 공백뿐인 줄에는 없다', () => {
    show(all())
    for (const key of ['a', 'm', 'd', 'k', 'u', 'f', 'r', 'h']) expect(within(lineOf(key)).getAllByRole('button', { name: EDIT }), key).toHaveLength(1)
    for (const key of ['e', 'n', 'w']) expect(editIn(key), key).toBeNull()
    expect(screen.getAllByRole('button', { name: EDIT })).toHaveLength(8)
    expect(within(screen.getByRole('group', { name: '메모 없음' })).queryByRole('button', { name: EDIT })).toBeNull()
  })

  it('AC-2203.2: 누르면 onEdit이고, 고치는 줄은 [메모 고치기] 자리에 칸이 있으며 칸 밖을 누르면 onEditDone이다. 같은 줄의 다른 단추는 그대로다', async () => {
    const user = userEvent.setup()
    const on = show(all())
    await user.click(editIn('d')!)
    expect(on.onEdit).toHaveBeenCalledWith('d')
    cleanup()
    const edit = show(all(), { editing: 'd' })
    expect(editIn('d')).toBeNull()
    const box = within(lineOf('d')).getByRole('textbox', { name: '가상환자d 메모 고치기' }) as HTMLTextAreaElement
    expect(box.value).toBe('우리 메모 d')
    await user.type(box, ' 고침')
    await user.tab()
    expect(edit.onEditDone).toHaveBeenCalledWith('d', '우리 메모 d 고침')
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    cleanup()
    show(all(), { editing: 'f' })
    expect(within(lineOf('f')).getByRole('button', { name: '이 메모로 바꾸기' })).toBeTruthy()
    expect(within(lineOf('f')).getByRole('textbox', { name: '가상환자f 메모 고치기' })).toBeTruthy()
    expect(editIn('f')).toBeNull()
    cleanup()
    show(all(), { editing: 'm' })
    expect(within(lineOf('m')).getByRole('button', { name: '바꾸지 않기' })).toBeTruthy()
    expect(within(lineOf('m')).getByRole('textbox', { name: '가상환자m 메모 고치기' })).toBeTruthy()
  })

  it('AC-2203.3: 입력 중에는 모든 [메모 고치기]가 막히고, 비트 메모 읽는 중·startBlocked로는 막지 않는다', () => {
    show(all(), { locked: true })
    const locked = screen.getAllByRole('button', { name: EDIT })
    expect(locked).toHaveLength(8)
    for (const button of locked) expect((button as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    show(all(), { reading: true, startBlocked: true })
    const open = screen.getAllByRole('button', { name: EDIT })
    expect(open).toHaveLength(8)
    for (const button of open) expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-2203.3: 고치는 칸이 열린 채 입력이 시작되면(locked) 칸은 읽기 전용이고 칸 밖을 눌러도 알리지 않는다. 풀리면 다시 고칠 수 있다', async () => {
    const user = userEvent.setup()
    const value = all()
    const on = handlers()
    const view = render(<MemoRows targets={value} locked={true} reading={false} open={new Set()} editing="d" card={() => null} {...on} />)
    const box = () => screen.getByRole('textbox', { name: '가상환자d 메모 고치기' }) as HTMLTextAreaElement
    expect(box().readOnly).toBe(true)
    await user.click(box())
    await user.type(box(), '더')
    expect(box().value).toBe('우리 메모 d')
    await user.tab()
    expect(on.onEditDone).not.toHaveBeenCalled()
    view.rerender(<MemoRows targets={value} locked={false} reading={false} open={new Set()} editing="d" card={() => null} {...on} />)
    expect(box().readOnly).toBe(false)
    await user.click(box())
    await user.type(box(), '더')
    await user.tab()
    expect(on.onEditDone).toHaveBeenCalledWith('d', '우리 메모 d더')
  })

  it('AC-2204.2: 환자 줄 두 파일은 정한 것만 불러오고(MemoRows의 새 불러오기는 memoCompare의 isBlankMemo 하나) 네트워크·저장소·console·supabase가 없다', () => {
    const source = (name: string) => readFileSync(join(process.cwd(), 'src/components/claim/rows', name), 'utf-8')
    const imports = (text: string) => [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((match) => match[1])
    const rows = source('MemoRows.tsx')
    const table = source('MemoTable.tsx')
    expect(imports(rows)).toEqual(['react', '@/components/ui/classes', '@/lib/precheck/memoCompare', '@/types/precheck', '../dateList'])
    expect(rows).toContain("import { isBlankMemo } from '@/lib/precheck/memoCompare'")
    expect(imports(table)).toEqual(['react', '@/components/ui/classes', '@/types/precheck', '../dateList'])
    for (const text of [rows, table]) {
      expect(text).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console|supabase)\b/)
      expect(text).not.toMatch(/\bimport\(/)
    }
  })

  it('AC-2203.4: [메모 고치기]는 [바꾸지 않기]·[이 메모로 바꾸기]의 오른쪽 같은 줄이고, 있던 단추는 이름·막힘이 그대로다', () => {
    show(all(), { reading: true, startBlocked: true })
    for (const [key, name] of [
      ['m', '바꾸지 않기'],
      ['f', '이 메모로 바꾸기'],
    ] as const) {
      const other = within(lineOf(key)).getByRole('button', { name })
      const edit = editIn(key)!
      expect(edit.parentElement).toBe(other.parentElement)
      expect(other.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect((within(lineOf('m')).getByRole('button', { name: '바꾸지 않기' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(lineOf('f')).getByRole('button', { name: '이 메모로 바꾸기' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '다시 하기 (1명)' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('group', { name: '이미 입력됨' }).textContent).toContain('비트 메모가 우리 메모와 같아요. 다시 넣지 않아요.')
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
