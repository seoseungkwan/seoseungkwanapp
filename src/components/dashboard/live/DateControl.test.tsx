// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { DateControl } from './DateControl'

// 날짜 고르기 (bit-dashboard REQ-605, design.md '### 날짜 고르기', 시안 docs/mockups/bit-dashboard/gen.py date_ctl·pick, css_extra.css .dp-*).
// jsdom은 CSS를 계산하지 않는다 → 짜임·글자는 DOM으로, 모양은 정해 둔 클래스로 본다

const TODAY = '2026-11-02' // 월요일
const EARLIEST = '2026-07-25' // 100일 전
const PAST = '2026-10-26'

afterEach(cleanup)

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect((el.getAttribute('class') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(tokens(classes)))

function draw(selected: string, today = TODAY) {
  const onChange = vi.fn()
  const view = render(<DateControl today={today} selected={selected} onChange={onChange} />)
  return { onChange, ...view }
}
const group = () => screen.getByRole('group', { name: '날짜 고르기' })
const dateInput = () => within(group()).getByLabelText('날짜 고르기') as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const put = (value: string) => fireEvent.change(dateInput(), { target: { value } })

describe('AC-605.1: 날짜 줄', () => {
  it('AC-605.1: [이전 날] · 날짜 고르기 칸 · [다음 날] 차례이고, 오늘이면 [오늘로]가 없다', () => {
    draw(TODAY)
    const parts = Array.from(group().children)
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe(button('이전 날'))
    expect(parts[1]!.tagName).toBe('LABEL')
    expect(parts[1]!.contains(dateInput())).toBe(true)
    expect(parts[2]).toBe(button('다음 날'))
    expect(screen.queryByRole('button', { name: '오늘로' })).toBeNull()
  })

  it('AC-605.1: 칸에는 고른 날이 "{월}월 {일}일 {요일}요일" 글자로 보이고, 입력 값도 고른 날이다', () => {
    draw(PAST)
    expect(within(group()).getByText('10월 26일 월요일').tagName).toBe('SPAN')
    expect(dateInput().value).toBe(PAST)
    expect(dateInput().type).toBe('date')
  })

  it('AC-605.1: 오늘이 아니면 맨 뒤에 [오늘로]가 있고 누르면 오늘을 고른다', async () => {
    const { onChange } = draw(PAST)
    expect(Array.from(group().children).at(-1)).toBe(button('오늘로'))
    await userEvent.setup().click(button('오늘로'))
    expect(onChange.mock.calls).toEqual([[TODAY]])
  })

  it('AC-605.1: [이전 날]·[다음 날]은 하루씩 옮긴다(달이 넘어가도 맞다)', async () => {
    const user = userEvent.setup()
    const first = draw(PAST)
    await user.click(button('이전 날'))
    await user.click(button('다음 날'))
    expect(first.onChange.mock.calls).toEqual([['2026-10-25'], ['2026-10-27']])
    first.unmount()

    const second = draw('2026-11-01')
    await user.click(button('이전 날'))
    expect(second.onChange.mock.calls).toEqual([['2026-10-31']])
    second.unmount()

    const third = draw('2026-10-31')
    await user.click(button('다음 날'))
    expect(third.onChange.mock.calls).toEqual([['2026-11-01']])
  })
})

describe('AC-605.5: 고를 수 있는 범위', () => {
  it('AC-605.5: 입력의 범위는 오늘부터 100일 전까지다', () => {
    draw(TODAY)
    expect(dateInput().min).toBe(EARLIEST)
    expect(dateInput().max).toBe(TODAY)
  })

  it('AC-605.5: 오늘에서는 [다음 날]이 막히고 [이전 날]은 열려 있다', async () => {
    const { onChange } = draw(TODAY)
    expect(button('다음 날').disabled).toBe(true)
    expect(button('이전 날').disabled).toBe(false)
    await userEvent.setup().click(button('다음 날'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('AC-605.5: 100일 전에서는 [이전 날]이 막히고 [다음 날]은 열려 있다', async () => {
    const { onChange } = draw(EARLIEST)
    expect(button('이전 날').disabled).toBe(true)
    expect(button('다음 날').disabled).toBe(false)
    await userEvent.setup().click(button('이전 날'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('AC-605.5: 양 끝 바로 안쪽에서는 둘 다 열려 있다', () => {
    const near = draw('2026-07-26')
    expect(button('이전 날').disabled).toBe(false)
    expect(button('다음 날').disabled).toBe(false)
    near.unmount()
    draw('2026-11-01')
    expect(button('이전 날').disabled).toBe(false)
    expect(button('다음 날').disabled).toBe(false)
  })

  it.each([
    ['100일 전보다 하루 앞', '2026-07-24'],
    ['오늘보다 하루 뒤', '2026-11-03'],
    ['한참 옛날', '2020-01-01'],
    ['지운 칸', ''],
  ])('AC-605.5: 범위 밖 날짜를 넣으면 고른 날이 바뀌지 않는다 — %s', (_, value) => {
    const { onChange } = draw(PAST)
    put(value)
    expect(onChange).not.toHaveBeenCalled()
    expect(dateInput().value).toBe(PAST)
  })

  it.each([
    ['100일 전', EARLIEST],
    ['오늘', TODAY],
    ['그 사이', '2026-09-15'],
  ])('AC-605.5: 범위 안 날짜를 넣으면 그 날을 고른다 — %s', (_, value) => {
    const { onChange } = draw(PAST)
    put(value)
    expect(onChange.mock.calls).toEqual([[value]])
  })

  it('AC-605.5: 범위는 받은 today를 따른다', () => {
    draw('2027-01-15', '2027-01-15')
    expect(dateInput().min).toBe('2026-10-07')
    expect(dateInput().max).toBe('2027-01-15')
  })
})

describe('AC-605.8: 월말 덧말', () => {
  const MONTH_END = '2026-10-31'
  const note = () => within(group()).queryByText('이번 달 마지막 날')

  it('AC-605.8: 오늘이 그 달 마지막 날이고 고른 날이 오늘이면 [다음 날] 뒤에 "·"과 "이번 달 마지막 날"이 붙는다', () => {
    draw(MONTH_END, MONTH_END)
    const parts = Array.from(group().children)
    expect(parts).toHaveLength(4)
    expect(parts[2]).toBe(button('다음 날'))
    expect(parts[3]).toBe(note())
    expect(parts[3]!.textContent).toBe('· 이번 달 마지막 날')
    expect(parts[3]!.firstElementChild!.textContent).toBe('·')
  })

  it('AC-605.8: 글자는 날짜 줄과 같은 small muted이고, "·"과 덧말이 한 덩어리라 줄이 넘치면 함께 내려간다(시안 .dp-n: 사이 8px, 앞 8px, 폰 앞 12px)', () => {
    draw(MONTH_END, MONTH_END)
    hasAll(note()!, 'inline-flex gap-2 pl-2 max-md:pl-3 text-small text-muted')
  })

  it('AC-605.8: 다른 날을 고르면 붙지 않고, 그 자리 끝은 [오늘로]다', () => {
    draw('2026-10-30', MONTH_END)
    expect(note()).toBeNull()
    expect(Array.from(group().children).at(-1)).toBe(button('오늘로'))
  })

  it('AC-605.8: 고른 날이 지난달 마지막 날이어도 오늘이 아니면 붙지 않는다', () => {
    draw(MONTH_END, TODAY)
    expect(within(group()).getByText('10월 31일 토요일')).toBeTruthy()
    expect(note()).toBeNull()
  })

  it.each(['2026-11-02', '2028-02-28', '2026-12-30'])('AC-605.8: 오늘이 월말이 아니면 없다 — %s', (today) => {
    draw(today, today)
    expect(note()).toBeNull()
    expect(Array.from(group().children)).toHaveLength(3)
  })

  it.each(['2027-02-28', '2028-02-29', '2026-12-31'])('AC-605.8: 2월·해 끝의 마지막 날도 붙는다 — %s', (today) => {
    draw(today, today)
    expect(note()).not.toBeNull()
  })
})

describe('모양 (시안 css_extra.css .dp-*)', () => {
  it('AC-605.1: 줄은 왼쪽으로 조금 내어 아이콘을 아래 글자에 맞추고, 사이는 4px, 좁으면 줄을 바꾼다', () => {
    draw(TODAY)
    hasAll(group(), 'flex flex-wrap items-center gap-1 -ml-1.5 max-md:-ml-3')
  })

  it('AC-605.1: 옮김 단추는 32px(폰 44px)·ink-2·초점 고리이고, 막히면 line-strong 글자색에 기본 커서다', () => {
    draw(TODAY)
    for (const name of ['이전 날', '다음 날']) {
      hasAll(button(name), `size-8 max-md:size-11 rounded-control text-ink-2 ${ds.focusRing} disabled:text-line-strong disabled:cursor-default`)
    }
  })

  it('AC-605.1: 옮김 단추의 꺾쇠는 16px이고 왼쪽·오른쪽을 가리킨다', () => {
    draw(TODAY)
    const prev = button('이전 날').querySelector('svg')!
    const next = button('다음 날').querySelector('svg')!
    expect([prev.getAttribute('width'), next.getAttribute('width')]).toEqual(['16', '16'])
    hasAll(prev, 'rotate-90')
    hasAll(next, '-rotate-90')
  })

  it('AC-605.1: 날짜 칸은 32px(폰 44px)·1px line-strong·body 600이고, 안쪽에 초점이 오면 고리를 그린다', () => {
    draw(TODAY)
    const label = dateInput().closest('label')!
    hasAll(label, 'relative inline-flex items-center gap-1 h-8 max-md:h-11 px-2 border border-line-strong rounded-control text-body font-semibold text-ink')
    hasAll(label, 'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent')
    const chevron = label.querySelector('svg')!
    expect(chevron.getAttribute('width')).toBe('14')
    hasAll(chevron, 'text-muted')
  })

  it('AC-605.1: 입력은 날짜 글자 위에 투명하게 겹치고, 달력 표시도 칸 전체를 덮는다', () => {
    draw(TODAY)
    hasAll(dateInput(), 'absolute inset-0 size-full opacity-0 cursor-pointer')
    hasAll(dateInput(), '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full')
  })

  it('AC-605.1: [오늘로]는 작은 보조 단추이고 앞을 4px 더 띄운다', () => {
    draw(PAST)
    hasAll(button('오늘로'), `${ds.button.secondarySmall} ml-1`)
  })

  it('design: 브라우저 부품이고, 날짜 계산은 lib/analytics/dates.ts만 쓴다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/dashboard/live/DateControl.tsx'), 'utf8')
    expect(text.startsWith("'use client'")).toBe(true)
    expect(text).toMatch(/from '@\/lib\/analytics\/dates'/)
    expect(text).not.toMatch(/new Date|Date\.UTC|Date\.now|\.getUTC|\.setUTC/)
  })
})
