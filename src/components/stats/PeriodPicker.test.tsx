// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PERIOD_BUTTON, PERIOD_GROUP, PERIOD_OFF, PERIOD_ON, PeriodPicker } from './PeriodPicker'
import type { StatsChoice } from './periodPick'

// 기간 고르기 부품 (stats-period REQ-1702·REQ-1703, design.md 'PeriodPicker.tsx', 승인 시안 BEpX6zDbmmBmvBhZqCKmno).
// props만 받는다: choice·lastDay·todayDone·onChoose. 빠른 단추 넷은 통계 화면(TASK-8)이 그리고, 이 부품은 '기간 골라 보기' 쪽이다.
// 시험의 오늘은 2026-11-06(금)이고 오늘이 끝나지 않았으면 끝난 날(lastDay)은 2026-11-05다. 날짜는 모두 지어낸 것이다

const LAST_DAY = '2026-11-05'

afterEach(cleanup)

// 고른 것을 들고 있는 바깥(통계 화면 대신). onChoose를 부르면 그 값으로 다시 그린다
function Harness({ initial, lastDay, todayDone, onChoose }: { initial: StatsChoice; lastDay: string; todayDone: boolean; onChoose: (c: StatsChoice) => void }) {
  const [choice, setChoice] = useState<StatsChoice>(initial)
  return (
    <PeriodPicker
      choice={choice}
      lastDay={lastDay}
      todayDone={todayDone}
      onChoose={(next) => {
        onChoose(next)
        setChoice(next)
      }}
    />
  )
}

function draw(initial: StatsChoice = '30d', over: { lastDay?: string; todayDone?: boolean } = {}) {
  const onChoose = vi.fn()
  const view = render(<Harness initial={initial} lastDay={over.lastDay ?? LAST_DAY} todayDone={over.todayDone ?? false} onChoose={onChoose} />)
  return { ...view, onChoose }
}

const unitGroup = () => screen.getAllByRole('group', { name: '보는 단위' })[0]!
const unitButton = (name: '일별' | '주별' | '월별') => within(unitGroup()).getByRole('button', { name })
const pressed = (el: HTMLElement) => el.getAttribute('aria-pressed')
const unitsPressed = () => (['일별', '주별', '월별'] as const).map((name) => pressed(unitButton(name)))
const stepper = () => screen.getByRole('group', { name: '기간 옮기기' })
// 가운데 글(◀ ▶로 바뀐 달·해를 화면 읽기에도 알린다)
const stepLabel = () => {
  const label = stepper().querySelector('[aria-live="polite"]')
  expect(label).toBeTruthy()
  return label as HTMLElement
}
const stepText = () => stepLabel().textContent
const prevButton = () => within(stepper()).getAllByRole('button')[0]!
const nextButton = () => within(stepper()).getAllByRole('button')[1]!
const customButton = () => screen.getByRole('button', { name: /^직접 날짜/ })
const dialog = () => screen.getByRole('dialog', { name: '직접 날짜 고르기' })
const queryDialog = () => screen.queryByRole('dialog', { name: '직접 날짜 고르기' })
const startInput = () => within(dialog()).getByLabelText('시작 날짜') as HTMLInputElement
const endInput = () => within(dialog()).getByLabelText('끝 날짜') as HTMLInputElement
const panelUnit = (name: '일별' | '주별' | '월별') => within(within(dialog()).getByRole('group', { name: '보는 단위' })).getByRole('button', { name })
const applyButton = () => within(dialog()).getByRole('button', { name: '이 기간 보기' })
const closeButton = () => within(dialog()).getByRole('button', { name: '닫기' })
const setDates = (from: string, to: string) => {
  fireEvent.change(startInput(), { target: { value: from } })
  fireEvent.change(endInput(), { target: { value: to } })
}
const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

describe('TASK-5: 단추 모양 글 — 통계 화면 빠른 단추와 같은 값을 이 파일이 내보낸다', () => {
  it('AC-1703.2: PERIOD_GROUP·PERIOD_BUTTON·PERIOD_ON·PERIOD_OFF는 지금 빠른 단추 모양 그대로다', () => {
    expect(PERIOD_GROUP).toBe('inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:grid-cols-4')
    expect(PERIOD_BUTTON).toBe(
      'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-1',
    )
    expect(PERIOD_ON).toBe('bg-accent-soft font-semibold text-accent-strong')
    expect(PERIOD_OFF).toBe('font-medium text-ink-2 transition hover:bg-canvas')
  })
})

describe('AC-1703.2: 위쪽 [일별][주별][월별]과 ◀ ▶', () => {
  it('AC-1703.2: 빠른 단추가 눌린 동안 [일별][주별][월별]·[직접 날짜]는 안 눌려 있고 가운데 글은 지난달 "2026년 10월"(흐림)이다', () => {
    draw('30d')
    expect(screen.getByText('기간 골라 보기')).toBeTruthy()
    expect(unitsPressed()).toEqual(['false', 'false', 'false'])
    expect(pressed(customButton())).toBe('false')
    expect(customButton().textContent).toBe('직접 날짜')
    expect(stepText()).toBe('2026년 10월')
    expect(classesOf(stepLabel())).toContain('text-muted')
    expect(queryDialog()).toBeNull()
  })

  it('AC-1703.2: [일별]을 누르면 지난달(2026-10) 일별을 고르고 [일별]만 눌린다. 가운데 글은 진하게 "2026년 10월"이다', () => {
    const { onChoose } = draw('30d')
    fireEvent.click(unitButton('일별'))
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'day', month: '2026-10' })
    expect(unitsPressed()).toEqual(['true', 'false', 'false'])
    expect(stepText()).toBe('2026년 10월')
    const label = stepLabel()
    expect(classesOf(label)).toEqual(expect.arrayContaining(['font-semibold', 'text-ink']))
    expect(classesOf(label)).not.toContain('text-muted')
    expect(pressed(customButton())).toBe('false')
  })

  it('AC-1703.2: ◀는 "2026년 9월", [주별]은 고른 달 그대로(2026년 9월 주별), [월별]은 그 달의 해 "2026년"이다', () => {
    const { onChoose } = draw('30d')
    fireEvent.click(unitButton('일별'))
    expect(prevButton().getAttribute('aria-label')).toBe('이전 달')
    expect(nextButton().getAttribute('aria-label')).toBe('다음 달')
    fireEvent.click(prevButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'day', month: '2026-09' })
    expect(stepText()).toBe('2026년 9월')
    fireEvent.click(unitButton('주별'))
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'week', month: '2026-09' })
    expect(stepText()).toBe('2026년 9월')
    expect(unitsPressed()).toEqual(['false', 'true', 'false'])
    fireEvent.click(unitButton('월별'))
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'year', year: '2026' })
    expect(stepText()).toBe('2026년')
    expect(unitsPressed()).toEqual(['false', 'false', 'true'])
    expect(prevButton().getAttribute('aria-label')).toBe('이전 해')
    expect(nextButton().getAttribute('aria-label')).toBe('다음 해')
  })

  it('AC-1703.2: [월별]에서 [일별]·[주별]은 그 해 12월이고, 끝난 날의 해면 지난달이다', () => {
    const { onChoose } = draw({ kind: 'year', year: '2025' })
    fireEvent.click(unitButton('주별'))
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'week', month: '2025-12' })
    expect(stepText()).toBe('2025년 12월')

    cleanup()
    const again = draw({ kind: 'year', year: '2026' })
    fireEvent.click(unitButton('일별'))
    expect(again.onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'day', month: '2026-10' })
  })

  it('AC-1703.2: 빠른 단추에서 [주별]·[월별]도 바로 간다 — 지난달 주별, 끝난 날의 해', () => {
    const { onChoose } = draw('7d')
    fireEvent.click(unitButton('주별'))
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'week', month: '2026-10' })
    cleanup()
    const again = draw('90d')
    fireEvent.click(unitButton('월별'))
    expect(again.onChoose).toHaveBeenLastCalledWith({ kind: 'year', year: '2026' })
  })

  it('AC-1703.2: 지난달 = 끝난 날이 든 달의 앞 달 — 11월 1일에 오늘이 안 끝났으면(끝난 날 10월 31일) [일별]은 2026-09다', () => {
    const { onChoose } = draw('30d', { lastDay: '2026-10-31' })
    fireEvent.click(unitButton('일별'))
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'day', month: '2026-09' })
  })

  it('AC-1703.2: 고른 것이 다시 빠른 단추([최근 7일])가 되면 고르기가 모두 풀린다 — 단위·[직접 날짜] 안 눌림, 가운데 글 흐림', () => {
    const { rerender } = draw()
    rerender(<PeriodPicker choice={{ kind: 'month', unit: 'week', month: '2026-09' }} lastDay={LAST_DAY} todayDone={false} onChoose={() => {}} />)
    expect(unitsPressed()).toEqual(['false', 'true', 'false'])
    rerender(<PeriodPicker choice="7d" lastDay={LAST_DAY} todayDone={false} onChoose={() => {}} />)
    expect(unitsPressed()).toEqual(['false', 'false', 'false'])
    expect(pressed(customButton())).toBe('false')
    expect(classesOf(stepLabel())).toContain('text-muted')
  })

  it('AC-1703.2: 빠른 단추일 때 ◀는 지난달의 앞 달(2026년 9월) 일별로 간다', () => {
    const { onChoose } = draw('30d')
    fireEvent.click(prevButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'day', month: '2026-09' })
  })
})

describe('AC-1702.1: 못 가는 ▶·◀는 disabled — ◀는 2020년 1월(월별은 2020년)까지', () => {
  it('AC-1702.1: 2026-10은 ▶로 2026-11에 가고, 2026-11에서는 ▶가 disabled다', () => {
    const { onChoose } = draw({ kind: 'month', unit: 'day', month: '2026-10' })
    expect((nextButton() as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(nextButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'day', month: '2026-11' })
    expect(stepText()).toBe('2026년 11월')
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true)
    expect((prevButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-1702.1: 해 2026은 ▶가 disabled이고 ◀는 2025로 간다', () => {
    const { onChoose } = draw({ kind: 'year', year: '2026' })
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(prevButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'year', year: '2025' })
    expect((nextButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-1702.1: 11월 1일에 오늘이 안 끝났으면(끝난 날 10월 31일) 2026-10에서도 ▶가 disabled다', () => {
    draw({ kind: 'month', unit: 'week', month: '2026-10' }, { lastDay: '2026-10-31' })
    expect((nextButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-1702.1: ◀는 2021년 1월에서 2020년 12월로 간다', () => {
    const { onChoose } = draw({ kind: 'month', unit: 'day', month: '2021-01' })
    expect((prevButton() as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(prevButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'day', month: '2020-12' })
  })

  it('AC-1702.1: 2020년 1월(일별·주별)에서는 ◀가 disabled이고 눌러도 고르지 않는다. ▶는 된다', () => {
    for (const unit of ['day', 'week'] as const) {
      const { onChoose, unmount } = draw({ kind: 'month', unit, month: '2020-01' })
      expect(stepText()).toBe('2020년 1월')
      expect((prevButton() as HTMLButtonElement).disabled).toBe(true)
      expect((nextButton() as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(prevButton())
      expect(onChoose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('AC-1702.1: 월별은 2020년에서 ◀가 disabled이고, 2021년에서는 2020년으로 간다', () => {
    const { onChoose } = draw({ kind: 'year', year: '2021' })
    expect((prevButton() as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(prevButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'year', year: '2020' })
    expect(stepText()).toBe('2020년')
    expect((prevButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-1702.1: disabled인 ▶를 눌러도 고르지 않는다', () => {
    const { onChoose } = draw({ kind: 'year', year: '2026' })
    fireEvent.click(nextButton())
    expect(onChoose).not.toHaveBeenCalled()
  })
})

describe('AC-1703.3: [직접 날짜] 판', () => {
  it('AC-1703.3: 누르면 판(role="dialog", 이름 "직접 날짜 고르기")에 시작·끝 날짜(type="date", min = 2020-01-01, max = 끝난 날), 보는 단위 셋, [닫기]·[이 기간 보기]가 있다', () => {
    draw({ kind: 'month', unit: 'day', month: '2026-10' })
    expect(customButton().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(customButton())
    expect(customButton().getAttribute('aria-expanded')).toBe('true')
    const panel = dialog()
    expect(within(panel).getByText('직접 날짜 고르기')).toBeTruthy()
    for (const input of [startInput(), endInput()]) {
      expect(input.type).toBe('date')
      expect(input.min).toBe('2020-01-01')
      expect(input.max).toBe(LAST_DAY)
    }
    expect(within(within(panel).getByRole('group', { name: '보는 단위' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['일별', '주별', '월별'])
    expect(closeButton()).toBeTruthy()
    expect(applyButton()).toBeTruthy()
  })

  it('AC-1703.3: 판은 고른 기간의 날짜·단위로 열리고 초점은 시작 날짜에 간다', () => {
    draw({ kind: 'month', unit: 'week', month: '2026-10' })
    fireEvent.click(customButton())
    expect(startInput().value).toBe('2026-10-01')
    expect(endInput().value).toBe('2026-10-31')
    expect(pressed(panelUnit('주별'))).toBe('true')
    expect(document.activeElement).toBe(startInput())
  })

  it('AC-1703.3: 빠른 단추에서 열면 그 기간(끝난 날까지)·일별로, 최근 12개월이면 월별로 열린다', () => {
    draw('30d')
    fireEvent.click(customButton())
    expect(startInput().value).toBe('2026-10-07')
    expect(endInput().value).toBe('2026-11-05')
    expect(pressed(panelUnit('일별'))).toBe('true')
    cleanup()
    draw('12m')
    fireEvent.click(customButton())
    expect(startInput().value).toBe('2025-12-01')
    expect(endInput().value).toBe('2026-11-05')
    expect(pressed(panelUnit('월별'))).toBe('true')
  })

  it('AC-1703.3: 맞는 날짜면 "고른 기간: {label} · N일"을 보인다', () => {
    draw()
    fireEvent.click(customButton())
    setDates('2026-08-01', '2026-11-05')
    fireEvent.click(panelUnit('주별'))
    expect(within(dialog()).getByText('고른 기간: 2026년 8월 1일 – 11월 5일 · 97일')).toBeTruthy()
  })

  it('AC-1703.3: [이 기간 보기]는 직접 날짜를 고르고 판을 닫는다 — 단추 글 "직접 날짜 · {label}"(눌림), 초점은 [직접 날짜]', () => {
    const { onChoose } = draw()
    fireEvent.click(customButton())
    setDates('2026-10-01', '2026-11-05')
    fireEvent.click(panelUnit('주별'))
    fireEvent.click(applyButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'custom', unit: 'week', from: '2026-10-01', to: '2026-11-05' })
    expect(queryDialog()).toBeNull()
    expect(customButton().textContent).toBe('직접 날짜 · 2026년 10월 1일 – 11월 5일')
    expect(pressed(customButton())).toBe('true')
    expect(customButton().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(customButton())
    expect(unitsPressed()).toEqual(['false', 'true', 'false'])
  })

  it('AC-1703.3: Esc는 판을 닫고 초점을 [직접 날짜]로 돌린다 — 고르지 않는다', () => {
    const { onChoose } = draw()
    fireEvent.click(customButton())
    setDates('2026-10-01', '2026-10-20')
    fireEvent.keyDown(startInput(), { key: 'Escape' })
    expect(queryDialog()).toBeNull()
    expect(document.activeElement).toBe(customButton())
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('AC-1703.3: [닫기]는 판을 닫고 초점을 [직접 날짜]로 돌린다 — 고르지 않는다', () => {
    const { onChoose } = draw()
    fireEvent.click(customButton())
    fireEvent.click(closeButton())
    expect(queryDialog()).toBeNull()
    expect(document.activeElement).toBe(customButton())
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('AC-1703.3: [직접 날짜]를 다시 누르면 판이 닫힌다', () => {
    draw()
    fireEvent.click(customButton())
    fireEvent.click(customButton())
    expect(queryDialog()).toBeNull()
  })

  it('AC-1703.3: 판이 열린 동안 고른 것이 바깥에서 바뀌면(빠른 단추) 판이 닫힌다', () => {
    const { rerender } = render(<PeriodPicker choice="30d" lastDay={LAST_DAY} todayDone={false} onChoose={() => {}} />)
    fireEvent.click(customButton())
    expect(queryDialog()).not.toBeNull()
    rerender(<PeriodPicker choice="7d" lastDay={LAST_DAY} todayDone={false} onChoose={() => {}} />)
    expect(queryDialog()).toBeNull()
  })

  it('AC-1703.3: 위쪽 [일별][주별][월별]을 누르면 열린 판은 닫힌다(직접 날짜가 아닐 때)', () => {
    draw()
    fireEvent.click(customButton())
    fireEvent.click(unitButton('주별'))
    expect(queryDialog()).toBeNull()
  })
})

describe('AC-1702.2: 판의 오류 글 — 오류 동안 [이 기간 보기]는 disabled', () => {
  it('AC-1702.2: 날짜가 비면 "시작 날짜와 끝 날짜를 모두 골라 주세요."', () => {
    draw()
    fireEvent.click(customButton())
    setDates('', '2026-10-31')
    expect(within(dialog()).getByText('시작 날짜와 끝 날짜를 모두 골라 주세요.')).toBeTruthy()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-1702.2: 끝 < 시작이면 "끝 날짜가 시작 날짜보다 앞이에요."', () => {
    const { onChoose } = draw()
    fireEvent.click(customButton())
    setDates('2026-10-10', '2026-10-09')
    expect(within(dialog()).getByText('끝 날짜가 시작 날짜보다 앞이에요.')).toBeTruthy()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(applyButton())
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('AC-1702.2: 끝 > 끝난 날이면 오늘이 안 끝났을 때 "어제(11월 5일)까지만 고를 수 있어요."', () => {
    draw()
    fireEvent.click(customButton())
    setDates('2026-10-10', '2026-11-06')
    expect(within(dialog()).getByText('어제(11월 5일)까지만 고를 수 있어요.')).toBeTruthy()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-1702.2: 오늘 진료 끝(todayDone)이면 끝난 날은 오늘이고 글은 "오늘(11월 6일)까지만 고를 수 있어요."', () => {
    draw('30d', { lastDay: '2026-11-06', todayDone: true })
    fireEvent.click(customButton())
    expect(startInput().max).toBe('2026-11-06')
    setDates('2026-10-10', '2026-11-06')
    expect((applyButton() as HTMLButtonElement).disabled).toBe(false)
    setDates('2026-10-10', '2026-11-07')
    expect(within(dialog()).getByText('오늘(11월 6일)까지만 고를 수 있어요.')).toBeTruthy()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-1702.2: 오류가 있으면 "고른 기간:" 글이 없고, 고치면 오류가 사라지고 [이 기간 보기]가 다시 된다', () => {
    draw()
    fireEvent.click(customButton())
    setDates('2026-10-10', '2026-10-09')
    expect(within(dialog()).queryByText(/^고른 기간:/)).toBeNull()
    setDates('2026-10-01', '2026-10-09')
    expect(within(dialog()).queryByText('끝 날짜가 시작 날짜보다 앞이에요.')).toBeNull()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-1702.2: 해를 한 자리씩 쳐서 잠깐 먼 날짜가 되어도 판이 깨지지 않는다', () => {
    draw()
    fireEvent.click(customButton())
    setDates('0002-10-01', '2026-10-31')
    expect(dialog()).toBeTruthy()
    fireEvent.click(panelUnit('주별'))
    expect(dialog()).toBeTruthy()
  })
})

describe('AC-1702.4: 판의 날짜 한도 오류 — 2020-01-01부터, 한 번에 5년(1827일)까지', () => {
  it('AC-1702.4: 시작이 2020-01-01보다 앞이면 "2020년 1월 1일부터 고를 수 있어요."이고 [이 기간 보기]는 disabled다', () => {
    const { onChoose } = draw()
    fireEvent.click(customButton())
    setDates('2019-12-31', '2020-01-31')
    expect(within(dialog()).getByText('2020년 1월 1일부터 고를 수 있어요.')).toBeTruthy()
    expect(within(dialog()).queryByText(/^고른 기간:/)).toBeNull()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(applyButton())
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('AC-1702.4: 2020-01-01 시작은 볼 수 있다', () => {
    draw()
    fireEvent.click(customButton())
    setDates('2020-01-01', '2020-01-31')
    expect(within(dialog()).queryByText('2020년 1월 1일부터 고를 수 있어요.')).toBeNull()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-1702.4: 1827일을 넘으면 "한 번에 5년까지 볼 수 있어요."이고 [이 기간 보기]는 disabled다 — 일별도 92일 경고가 아니라 이 오류다', () => {
    draw()
    fireEvent.click(customButton())
    setDates('2021-11-04', '2026-11-05')
    for (const unit of ['월별', '주별', '일별'] as const) {
      fireEvent.click(panelUnit(unit))
      expect(within(dialog()).getByText('한 번에 5년까지 볼 수 있어요.')).toBeTruthy()
      expect(within(dialog()).queryByText(/^일별은 92일까지/)).toBeNull()
      expect((applyButton() as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('AC-1702.4: 1827일(5년)은 볼 수 있다', () => {
    draw()
    fireEvent.click(customButton())
    setDates('2021-11-05', '2026-11-05')
    fireEvent.click(panelUnit('월별'))
    expect(within(dialog()).queryByText('한 번에 5년까지 볼 수 있어요.')).toBeNull()
    // 날 수는 경고 글처럼 세 자리 쉼표다
    expect(within(dialog()).getByText('고른 기간: 2021년 11월 5일 – 2026년 11월 5일 · 1,827일')).toBeTruthy()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('AC-1702.3: 일별 92일 경고 — [주별로 보기]·[월별로 보기]는 판의 단위만 바꾼다', () => {
  const WARN = '일별은 92일까지 볼 수 있어요. 고른 기간이 93일이라 주별이나 월별로 보면 한눈에 보여요.'

  it('AC-1702.3: 일별 93일이면 경고가 보이고 [이 기간 보기]는 disabled다', () => {
    draw()
    fireEvent.click(customButton())
    fireEvent.click(panelUnit('일별'))
    setDates('2026-08-05', '2026-11-05') // 93일
    expect(within(dialog()).getByText(WARN)).toBeTruthy()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it("AC-1702.3: 경고 글과 '고른 기간' 줄의 날 수는 같은 세 자리 쉼표 글이다(1,040일)", () => {
    draw()
    fireEvent.click(customButton())
    fireEvent.click(panelUnit('일별'))
    setDates('2024-01-01', '2026-11-05') // 366 + 365 + 309 = 1,040일
    expect(within(dialog()).getByText('일별은 92일까지 볼 수 있어요. 고른 기간이 1,040일이라 주별이나 월별로 보면 한눈에 보여요.')).toBeTruthy()
    expect(within(dialog()).getByText('고른 기간: 2024년 1월 1일 – 2026년 11월 5일 · 1,040일')).toBeTruthy()
  })

  it('AC-1702.3: 92일은 경고 없이 볼 수 있다', () => {
    draw()
    fireEvent.click(customButton())
    fireEvent.click(panelUnit('일별'))
    setDates('2026-08-06', '2026-11-05') // 92일
    expect(within(dialog()).queryByText(/일별은 92일까지/)).toBeNull()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-1702.3: 경고의 [주별로 보기]는 판의 단위만 주별로 바꾼다 — 판은 열린 채, 아직 고르지 않는다', () => {
    const { onChoose } = draw()
    fireEvent.click(customButton())
    fireEvent.click(panelUnit('일별'))
    setDates('2026-08-05', '2026-11-05')
    fireEvent.click(within(dialog()).getByRole('button', { name: '주별로 보기' }))
    expect(queryDialog()).not.toBeNull()
    expect(pressed(panelUnit('주별'))).toBe('true')
    expect(within(dialog()).queryByText(WARN)).toBeNull()
    expect((applyButton() as HTMLButtonElement).disabled).toBe(false)
    expect(onChoose).not.toHaveBeenCalled()
    expect(unitsPressed()).toEqual(['false', 'false', 'false'])
  })

  it('AC-1702.3: 경고의 [월별로 보기]는 판의 단위만 월별로 바꾼다', () => {
    draw()
    fireEvent.click(customButton())
    fireEvent.click(panelUnit('일별'))
    setDates('2026-08-05', '2026-11-05')
    fireEvent.click(within(dialog()).getByRole('button', { name: '월별로 보기' }))
    expect(pressed(panelUnit('월별'))).toBe('true')
    expect(within(dialog()).queryByText(WARN)).toBeNull()
  })

  it('AC-1702.3: 주별·월별은 400일도 볼 수 있다', () => {
    const { onChoose } = draw()
    fireEvent.click(customButton())
    setDates('2025-10-02', '2026-11-05') // 400일
    for (const unit of ['주별', '월별'] as const) {
      fireEvent.click(panelUnit(unit))
      expect(within(dialog()).queryByText(/일별은 92일까지/)).toBeNull()
      expect((applyButton() as HTMLButtonElement).disabled).toBe(false)
    }
    fireEvent.click(applyButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'custom', unit: 'month', from: '2025-10-02', to: '2026-11-05' })
  })
})

describe('AC-1703.7: 직접 날짜 중 위쪽 [일별][주별][월별]은 그 기간의 단위만 바꾼다', () => {
  const CUSTOM: StatsChoice = { kind: 'custom', unit: 'week', from: '2026-10-01', to: '2026-11-05' }

  it('AC-1703.7: [월별]은 직접 날짜 그대로 단위만 월별 — [직접 날짜 · {label}]은 눌린 채, 달·해 고르기로 가지 않는다', () => {
    const { onChoose } = draw(CUSTOM)
    expect(customButton().textContent).toBe('직접 날짜 · 2026년 10월 1일 – 11월 5일')
    expect(pressed(customButton())).toBe('true')
    expect(unitsPressed()).toEqual(['false', 'true', 'false'])
    fireEvent.click(unitButton('월별'))
    expect(onChoose).toHaveBeenLastCalledWith({ ...CUSTOM, unit: 'month' })
    expect(pressed(customButton())).toBe('true')
    expect(customButton().textContent).toBe('직접 날짜 · 2026년 10월 1일 – 11월 5일')
    expect(unitsPressed()).toEqual(['false', 'false', 'true'])
  })

  it('AC-1703.7: [일별]은 36일이라 바로 일별이 된다', () => {
    const { onChoose } = draw(CUSTOM)
    fireEvent.click(unitButton('일별'))
    expect(onChoose).toHaveBeenLastCalledWith({ ...CUSTOM, unit: 'day' })
    expect(queryDialog()).toBeNull()
  })

  it('AC-1703.7: 93일 이상이면 [일별]은 바꾸지 않고 판을 그 날짜·일별로 열어 92일 경고를 보인다', () => {
    const long: StatsChoice = { kind: 'custom', unit: 'week', from: '2026-08-01', to: '2026-11-05' } // 97일
    const { onChoose } = draw(long)
    fireEvent.click(unitButton('일별'))
    expect(onChoose).not.toHaveBeenCalled()
    expect(startInput().value).toBe('2026-08-01')
    expect(endInput().value).toBe('2026-11-05')
    expect(pressed(panelUnit('일별'))).toBe('true')
    expect(within(dialog()).getByText('일별은 92일까지 볼 수 있어요. 고른 기간이 97일이라 주별이나 월별로 보면 한눈에 보여요.')).toBeTruthy()
    expect(unitsPressed()).toEqual(['false', 'true', 'false'])
  })

  it('AC-1703.7: 직접 날짜 중 ◀ ▶는 지난달(같은 단위) 기준으로 달 고르기로 간다 — 직접 날짜는 옮기지 않는다', () => {
    const { onChoose } = draw(CUSTOM)
    expect(stepText()).toBe('2026년 10월')
    fireEvent.click(prevButton())
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'month', unit: 'week', month: '2026-09' })
    expect(pressed(customButton())).toBe('false')
    expect(customButton().textContent).toBe('직접 날짜')
  })
})

describe('AC-1703.5: 768px 미만 — 한 줄씩 전체 폭·44px, 판은 단추 바로 아래 문서 흐름 안', () => {
  it('AC-1703.5: 단위 묶음·◀ ▶ 줄·[직접 날짜]가 max-md:w-full이고 줄은 휴대폰에서 세로로 쌓인다', () => {
    draw()
    expect(classesOf(unitGroup())).toContain('max-md:w-full')
    expect(classesOf(stepper())).toContain('max-md:w-full')
    expect(classesOf(customButton())).toContain('max-md:w-full')
    const row = unitGroup().parentElement!
    expect(row.contains(stepper())).toBe(true)
    expect(row.contains(customButton())).toBe(true)
    expect(classesOf(row)).toEqual(expect.arrayContaining(['max-md:flex-col', 'max-md:items-stretch']))
  })

  it('AC-1703.5: 누름 칸은 휴대폰에서 44px(max-md:h-11)이다 — 단위 단추·◀ ▶ 줄·[직접 날짜]·판의 단추', () => {
    draw()
    for (const name of ['일별', '주별', '월별'] as const) expect(classesOf(unitButton(name))).toContain('max-md:h-11')
    expect(classesOf(stepper())).toContain('max-md:h-11')
    for (const arrow of [prevButton(), nextButton()]) expect(classesOf(arrow)).toContain('h-full')
    expect(classesOf(customButton())).toContain('max-md:h-11')
    fireEvent.click(customButton())
    fireEvent.click(panelUnit('일별'))
    setDates('2026-08-05', '2026-11-05')
    const panelButtons = within(dialog()).getAllByRole('button')
    expect(panelButtons.length).toBe(7) // 단위 셋 · 경고 둘 · 닫기 · 이 기간 보기
    for (const button of panelButtons) expect(classesOf(button), button.textContent ?? '').toContain('max-md:h-11')
    for (const input of [startInput(), endInput()]) expect(classesOf(input)).toContain('h-11')
  })

  it('AC-1703.5: 판은 768px 이상에서 단추 아래 뜬 판(absolute top-full, 층 그림자)이고 미만에서는 문서 흐름 안(max-md:static, 전체 폭)이다', () => {
    draw()
    fireEvent.click(customButton())
    const panel = dialog()
    expect(classesOf(panel)).toEqual(expect.arrayContaining(['absolute', 'top-full', 'md:shadow-float', 'max-md:static', 'max-md:w-full']))
    expect(classesOf(panel.parentElement)).toContain('relative')
    // 판은 [직접 날짜] 뒤에 온다(문서 흐름에서 단추 바로 아래)
    expect(customButton().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
