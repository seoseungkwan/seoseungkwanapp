// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import type { FlowChoice } from './flow'
import { PeriodButtons } from './PeriodButtons'

// 추이 조회 기간 묶음 (dashboard-ux REQ-2703 AC-2703.2, design.md §4, 시안 docs/mockups/dashboard-ux .scope·.seg).
// 이름 "추이 조회 기간" 아래 빠른 단추 셋 + 통계 탭 기간 고르기(오른쪽 끝 맞춤 판) + 적용 글. 고른 것은 부르는 쪽이 쥔다(props만 받는다).
// 시험의 오늘은 2026-11-06(금)이고 오늘이 끝나지 않아 끝난 날(lastDay)은 2026-11-05다. 날짜는 모두 지어낸 것이다

const LAST_DAY = '2026-11-05'
const OCTOBER = { kind: 'month', unit: 'day', month: '2026-10' } as const

afterEach(cleanup)

function draw(over: { choice?: FlowChoice; showPicker?: boolean } = {}) {
  const onChoose = vi.fn()
  const choice = over.choice ?? 30
  render(
    <PeriodButtons
      choice={choice}
      picker={typeof choice === 'number' ? (`${choice}d` as const) : choice}
      lastDay={LAST_DAY}
      todayDone={false}
      onChoose={onChoose}
      {...(over.showPicker === undefined ? {} : { showPicker: over.showPicker })}
    />,
  )
  return { onChoose }
}

const scope = () => screen.getByRole('group', { name: '추이 조회 기간' })
const quick = () => within(scope()).getByRole('group', { name: '기간' })
const quickButtons = () => within(quick()).getAllByRole('button')
const pressed = () => quickButtons().map((b) => b.getAttribute('aria-pressed'))
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null | undefined) => tokens(el?.getAttribute('class') ?? '')
const following = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const NOTE = '아래 그래프 4개에 적용 · 기준일과 따로예요'

describe('AC-2703.2: 추이 조회 기간 묶음', () => {
  it('AC-2703.2: 묶음(role="group")의 이름은 위의 보이는 글 "추이 조회 기간"(aria-labelledby)이고, 빠른 단추 최근 7·30·90일과 [기간 골라 보기]가 이 한 묶음 안, 그 아래에 적용 글이 있다', () => {
    draw()
    const group = scope()
    const caption = document.getElementById(group.getAttribute('aria-labelledby') ?? '')
    expect(caption?.textContent).toBe('추이 조회 기간')
    expect(group.contains(caption)).toBe(true)
    expect(quickButtons().map((b) => b.textContent)).toEqual(['최근 7일', '최근 30일', '최근 90일'])
    const picker = within(group).getByRole('group', { name: '기간 골라 보기' })
    const note = within(group).getByText(NOTE)
    // 이름 → 빠른 단추 → 기간 골라 보기 → 적용 글 차례
    expect(following(caption as HTMLElement, quick())).toBe(true)
    expect(following(quick(), picker)).toBe(true)
    expect(following(picker, note)).toBe(true)
    expect(picker.contains(note)).toBe(false)
  })

  it('AC-2703.2: 고른 빠른 단추만 aria-pressed="true"(ds.segment.on)이고 나머지는 false(ds.segment.off)다. 누르면 onChoose(7·30·90)', () => {
    const { onChoose } = draw({ choice: 30 })
    expect(pressed()).toEqual(['false', 'true', 'false'])
    const [seven, thirty] = quickButtons()
    expect(classesOf(thirty).sort()).toEqual(tokens(`${ds.segment.button} ${ds.segment.on}`).sort())
    expect(classesOf(seven).sort()).toEqual(tokens(`${ds.segment.button} ${ds.segment.off}`).sort())
    fireEvent.click(within(quick()).getByRole('button', { name: '최근 7일' }))
    expect(onChoose).toHaveBeenLastCalledWith(7)
    fireEvent.click(within(quick()).getByRole('button', { name: '최근 90일' }))
    expect(onChoose).toHaveBeenLastCalledWith(90)
  })

  it('AC-2703.2: 고른 기간(기간 골라 보기)이면 빠른 단추는 모두 안 눌림이다', () => {
    draw({ choice: OCTOBER })
    expect(pressed()).toEqual(['false', 'false', 'false'])
  })

  it('AC-2703.2·AC-2703.3: [기간 골라 보기]에서 고른 기간은 onChoose로 넘기고, 직접 날짜 판은 오른쪽 끝 맞춤(align="end")이다', () => {
    const { onChoose } = draw()
    const picker = within(scope()).getByRole('group', { name: '기간 골라 보기' })
    fireEvent.click(within(within(picker).getByRole('group', { name: '보는 단위' })).getByRole('button', { name: '일별' }))
    expect(onChoose).toHaveBeenLastCalledWith(OCTOBER)
    fireEvent.click(within(picker).getByRole('button', { name: /^직접 날짜/ }))
    expect(classesOf(screen.getByRole('dialog', { name: '직접 날짜 고르기' }))).toEqual(expect.arrayContaining(['md:right-0', 'md:left-auto']))
  })

  it('AC-2703.2: showPicker가 false면 [기간 골라 보기]를 그리지 않고 이름·빠른 단추·적용 글은 그대로다', () => {
    draw({ showPicker: false })
    expect(within(scope()).queryByRole('group', { name: '기간 골라 보기' })).toBeNull()
    expect(quickButtons()).toHaveLength(3)
    expect(within(scope()).getByText(NOTE)).toBeTruthy()
  })

  it('AC-2703.2: 빠른 단추 묶음은 ds.segment 모양이고 휴대폰(768px 미만)은 셋이 같은 폭 세 칸·44px이다', () => {
    draw()
    expect(classesOf(quick()).sort()).toEqual(tokens(`${ds.segment.group} max-md:grid-cols-3`).sort())
    for (const button of quickButtons()) {
      expect(button.getAttribute('type')).toBe('button')
      expect(classesOf(button)).toContain('max-md:h-11')
    }
  })
})
