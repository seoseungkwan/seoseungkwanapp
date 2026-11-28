// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEARN_MAX, ourClinicPhrases, type LearnRule, type PhraseError, type Phrases } from '@/lib/precheck/memo'
import { LearnTab } from './LearnTab'

// 설정 › 병원 문구 › 학습 탭(claim-learn AC-9304.1~.3·AC-9306.2, 시안 ?s=list, notes '설정 › 병원 문구 › 학습 탭'). draft만 고친다(저장은 아래 [저장] → 바뀐 부분 표).
// 학습 값은 지어낸 값이다

const RULES: LearnRule[] = [
  {
    id: 'l0000abcd',
    name: 'LA358 · 허리',
    kind: 'replace',
    from: '{좌우} {레벨} MBB 시행 (C-arm guide 하에)',
    to: '{좌우} {레벨} 내측지 신경차단술(MBB) 시행, C-arm 유도 하',
    after: '',
    when: { codes: ['LA358'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] },
    on: true,
    left: 2,
    made: '2026-11-28',
  },
  {
    id: 'l0000abce',
    name: 'LA358 · 허리',
    kind: 'add',
    from: '',
    to: '시술 후 30분 관찰함',
    after: '{좌우} {레벨} MBB 시행 (C-arm guide 하에)',
    when: { codes: ['LA358'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] },
    on: true,
    left: 0,
    made: '2026-11-28',
  },
  {
    id: 'l0000abcf',
    name: 'KK062 · 손목 (C-arm)',
    kind: 'remove',
    from: '{좌우} wrist 건초내주사 시행',
    to: '',
    after: '',
    when: { codes: ['KK062'], regions: ['wrist'], chartWords: ['C-arm'], withCodes: [], doctors: [] },
    on: false,
    left: 0,
    made: '2026-11-27',
  },
]
const withRules = (learned: LearnRule[] | undefined): Phrases => ({ ...ourClinicPhrases(), learned })

let latest: Phrases
function Harness({ start = withRules(RULES), errors = [], flashId, limit }: { start?: Phrases; errors?: PhraseError[]; flashId?: string | null; limit?: boolean }) {
  const [draft, setDraft] = useState(start)
  latest = draft
  return <LearnTab draft={draft} errors={errors} onChange={setDraft} flashId={flashId} limit={limit} />
}
const table = () => screen.getByRole('table', { name: '학습 목록' })
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)

const scrolled = vi.fn()
beforeEach(() => {
  scrolled.mockClear()
  Element.prototype.scrollIntoView = scrolled
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-9304.1 학습 목록', () => {
  it('AC-9304.1: 표 머리는 이름·할 일·조건·문장·남은 확인·만든 날이고, 학습마다 그 값과 [켜짐/꺼짐]·[고치기]·[지우기]가 있다', () => {
    render(<Harness />)
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['이름', '할 일', '조건', '문장', '남은 확인', '만든 날', ''])
    const [first, second, third] = bodyRows()
    expect(cells(first).slice(0, 6)).toEqual(['LA358 · 허리', '줄 바꿈', '처방 LA358 · 부위 허리', '{좌우} {레벨} 내측지 신경차단술(MBB) 시행, C-arm 유도 하', '2', '11/28'])
    expect(cells(second).slice(0, 6)).toEqual(['LA358 · 허리', '줄 더함', '처방 LA358 · 부위 허리', '시술 후 30분 관찰함', '0', '11/28'])
    expect(cells(third).slice(0, 6)).toEqual(['KK062 · 손목 (C-arm)', '줄 뺌', '처방 KK062 · 부위 손목 · 차트 말 ‘C-arm’', '(빼는 줄)', '0', '11/27'])
    const on = within(first).getByRole('switch', { name: '학습 1 켜기' })
    expect(on.getAttribute('aria-checked')).toBe('true')
    expect(on.textContent).toBe('켜짐')
    const off = within(third).getByRole('switch', { name: '학습 3 켜기' })
    expect(off.getAttribute('aria-checked')).toBe('false')
    expect(off.textContent).toBe('꺼짐')
    for (const [index, row] of bodyRows().entries()) {
      expect(within(row).getByRole('button', { name: `학습 ${index + 1} 고치기` }).textContent).toBe('고치기')
      expect(within(row).getByRole('button', { name: `학습 ${index + 1} 지우기` }).textContent).toBe('지우기')
    }
  })

  it("AC-9304.1: 학습이 없으면 표 대신 '학습 없음' 글이다", () => {
    render(<Harness start={withRules(undefined)} />)
    expect(screen.getByText('아직 학습이 없어요. 청구 메모를 고쳐 저장하면 저절로 학습해요. 청구 화면에서 [처음 학습]을 해 보세요.')).toBeTruthy()
    expect(screen.queryByRole('table', { name: '학습 목록' })).toBeNull()
  })

  it('AC-9304.1: [켜짐/꺼짐]을 누르면 draft의 그 학습만 켜고 끈다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('switch', { name: '학습 1 켜기' }))
    expect(latest.learned?.map((rule) => rule.on)).toEqual([false, true, false])
    expect(screen.getByRole('switch', { name: '학습 1 켜기' }).textContent).toBe('꺼짐')
    await user.click(screen.getByRole('switch', { name: '학습 3 켜기' }))
    expect(latest.learned?.map((rule) => rule.on)).toEqual([false, true, true])
  })
})

describe('AC-9304.2 고치기·지우기', () => {
  it("AC-9304.2: [지우기]는 '‘{이름}’ 학습을 지울까요?'를 묻고 [취소]면 그대로, [지우기]면 draft에서 지운다", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '학습 3 지우기' }))
    expect(screen.getByText('‘KK062 · 손목 (C-arm)’ 학습을 지울까요?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByText('‘KK062 · 손목 (C-arm)’ 학습을 지울까요?')).toBeNull()
    expect(latest.learned).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: '학습 3 지우기' }))
    await user.click(screen.getByRole('button', { name: '지우기' }))
    expect(latest.learned?.map((rule) => rule.id)).toEqual(['l0000abcd', 'l0000abce'])
    expect(screen.queryByText(/학습을 지울까요\?/)).toBeNull()
  })

  it('AC-9304.2: [고치기]는 학습 창과 같은 칸(이름·조건·문장·바뀌는 칸 단추)을 열고, 고친 값은 draft에 들어간다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const open = screen.getByRole('button', { name: '학습 1 고치기' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    await user.click(open)
    expect(open.getAttribute('aria-expanded')).toBe('true')
    const editor = screen.getByRole('region', { name: 'LA358 · 허리 고치기' })
    expect(within(editor).getByRole('textbox', { name: '이름' })).toBeTruthy()
    expect((within(editor).getByRole('checkbox', { name: '처방 코드' }) as HTMLInputElement).checked).toBe(true)
    expect(within(editor).getByRole('button', { name: 'LA358' }).getAttribute('aria-pressed')).toBe('true')
    for (const name of ['{좌우}', '{레벨}', '{부위}']) expect(within(editor).getByRole('button', { name })).toBeTruthy()
    const text = within(editor).getByRole('textbox', { name: '학습할 문장' })
    await user.clear(text)
    await user.type(text, 'Rt 내측지 시행')
    expect(latest.learned?.[0].to).toBe('Rt 내측지 시행')
    expect(within(editor).getByText('‘Rt’가 글자 그대로 있어요. 다른 환자에게도 ‘Rt’로 나와요.')).toBeTruthy()
    await user.click(within(editor).getByRole('button', { name: '{좌우}로 바꾸기' }))
    expect(latest.learned?.[0].to).toBe('{좌우} 내측지 시행')
    expect(latest.learned?.slice(1)).toEqual(RULES.slice(1))
    await user.click(open)
    expect(screen.queryByRole('region', { name: 'LA358 · 허리 고치기' })).toBeNull()
  })

  it('AC-9304.2: 검사에서 틀린 학습 칸은 그 학습 줄에 까닭이 보인다', () => {
    render(<Harness errors={[{ path: 'learned.2.when', message: '학습 조건을 하나 이상 골라 주세요.' }]} />)
    expect(within(bodyRows()[2]).getByText('학습 조건을 하나 이상 골라 주세요.')).toBeTruthy()
  })
})

describe('AC-9304.3 한도', () => {
  const many = (count: number): LearnRule[] => Array.from({ length: count }, (_, index) => ({ ...RULES[0], id: `l${index.toString(16).padStart(8, '0')}` }))

  it(`AC-9304.3: 학습이 한도(${LEARN_MAX}개)를 넘으면 notes '한도' 글이 보인다`, () => {
    render(<Harness start={withRules(many(LEARN_MAX + 1))} />)
    expect(screen.getByText(`학습은 ${LEARN_MAX}개까지 둘 수 있어요. 쓰지 않는 학습을 지운 뒤 더해 주세요.`)).toBeTruthy()
  })

  it('AC-9304.3: 한도 안이면 글이 없고, 위(저장)가 한도로 막았다고 알리면 보인다', () => {
    render(<Harness start={withRules(many(LEARN_MAX))} />)
    expect(screen.queryByText(/개까지 둘 수 있어요/)).toBeNull()
    cleanup()
    render(<Harness limit />)
    expect(screen.getByText(`학습은 ${LEARN_MAX}개까지 둘 수 있어요. 쓰지 않는 학습을 지운 뒤 더해 주세요.`)).toBeTruthy()
  })
})

describe('AC-9306.2 주소로 학습 열기', () => {
  it('AC-9306.2: flashId 학습 줄로 내려가 2초 강조한다', () => {
    vi.useFakeTimers()
    render(<Harness flashId="l0000abcf" />)
    const row = bodyRows()[2]
    expect(scrolled).toHaveBeenCalled()
    expect(scrolled.mock.contexts.at(-1)).toBe(row)
    expect(row.classList.contains('bg-accent-soft')).toBe(true)
    expect(bodyRows()[0].classList.contains('bg-accent-soft')).toBe(false)
    act(() => vi.advanceTimersByTime(2000))
    expect(bodyRows()[2].classList.contains('bg-accent-soft')).toBe(false)
  })

  it('AC-9306.2: 강조하는 2초 안에 강조할 학습이 비면(다른 고침) 강조도 바로 끝나 남지 않는다', () => {
    vi.useFakeTimers()
    const view = render(<Harness flashId="l0000abcf" />)
    expect(bodyRows()[2].classList.contains('bg-accent-soft')).toBe(true)
    view.rerender(<Harness flashId={null} />)
    expect(bodyRows()[2].classList.contains('bg-accent-soft')).toBe(false)
    view.rerender(<Harness flashId="l0000abcf" />)
    expect(bodyRows()[2].classList.contains('bg-accent-soft')).toBe(true)
    act(() => vi.advanceTimersByTime(2000))
    expect(bodyRows()[2].classList.contains('bg-accent-soft')).toBe(false)
  })

  it('AC-9306.2: 없는 학습 번호면 내려가지 않는다', () => {
    render(<Harness flashId="l9999ffff" />)
    expect(scrolled).not.toHaveBeenCalled()
  })
})
