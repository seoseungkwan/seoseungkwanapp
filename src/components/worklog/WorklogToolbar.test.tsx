// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import type { ErrorCode } from '@/types/errors'
import { WorklogToolbar, type ToolbarStatus } from './WorklogToolbar'

// 날짜 줄은 화면 상태를 받아 그리기만 한다. 날짜는 가짜 달력 값이고 환자·의원 자료가 없다
const TODAY = '2026-11-01'
const PAST = '2026-10-31'
const SAVED_AT = new Date('2026-10-30T05:05:00Z') // 한국 시각 14:05

function setup(overrides: Partial<ComponentProps<typeof WorklogToolbar>> = {}) {
  const props = {
    ymd: TODAY,
    today: TODAY,
    status: 'saved' as ToolbarStatus,
    savedAt: null,
    blockedYmd: null,
    onDate: vi.fn(),
    onRetrySave: vi.fn(),
    onReload: vi.fn(),
    onPrint: vi.fn(),
    ...overrides,
  }
  render(<WorklogToolbar {...props} />)
  return props
}

const button = (name: string) => screen.getByRole('button', { name })
const dateInput = () => screen.getByLabelText<HTMLInputElement>('날짜 고르기')
// 오류 카드(role="alert")에 적힌 번호를 위에서부터
const cardCodes = () => screen.queryAllByRole('alert').map((card) => card.textContent?.match(/E-[A-Z-]+/)?.[0] as ErrorCode)

const hasClasses = (el: Element, classes: string) => classes.split(/\s+/).every((name) => el.classList.contains(name))

afterEach(cleanup)

describe('AC-009.1 날짜 줄', () => {
  it('AC-009.1: [전날]·날짜 고르기 칸(최대 = 오늘, 값 = 고른 날)·[다음 날]이 있다', () => {
    setup({ ymd: PAST })
    expect(button('전날')).toBeTruthy()
    expect(button('다음 날')).toBeTruthy()
    const input = dateInput()
    expect(input.type).toBe('date')
    expect(input.max).toBe(TODAY)
    expect(input.value).toBe(PAST)
  })

  it('AC-009.1: [전날]·[다음 날]은 화살표 아이콘 + 글자이고 화살표는 서로 반대로 돌렸다', () => {
    setup({ ymd: PAST })
    expect(button('전날').textContent).toBe('전날')
    expect(button('다음 날').textContent).toBe('다음 날')
    expect(button('전날').querySelector('svg')?.classList.contains('rotate-90')).toBe(true)
    expect(button('다음 날').querySelector('svg')?.classList.contains('-rotate-90')).toBe(true)
  })

  it('AC-009.1: 오늘이면 [오늘로]가 없고 [다음 날]은 누를 수 없다', async () => {
    const props = setup({ ymd: TODAY })
    expect(screen.queryByRole('button', { name: '오늘로' })).toBeNull()
    const next = button('다음 날') as HTMLButtonElement
    expect(next.disabled).toBe(true)
    await userEvent.click(next)
    expect(props.onDate).not.toHaveBeenCalled()
  })

  it('AC-009.1: 오늘이 아니면 [오늘로]가 있고 누르면 오늘로 간다', async () => {
    const props = setup({ ymd: '2026-10-20' })
    await userEvent.click(button('오늘로'))
    expect(props.onDate).toHaveBeenCalledExactlyOnceWith(TODAY)
  })

  it('AC-009.1: 오늘이 아니면 [다음 날]을 눌러 다음 날로 간다(일요일도 건너뛰지 않는다)', async () => {
    const props = setup({ ymd: '2026-10-24' }) // 토요일
    expect((button('다음 날') as HTMLButtonElement).disabled).toBe(false)
    await userEvent.click(button('다음 날'))
    expect(props.onDate).toHaveBeenCalledExactlyOnceWith('2026-10-25') // 일요일
  })

  it('AC-009.1: [전날]을 눌러 전날로 간다(일요일도 건너뛰지 않는다)', async () => {
    const props = setup({ ymd: '2026-10-26' }) // 월요일
    await userEvent.click(button('전날'))
    expect(props.onDate).toHaveBeenCalledExactlyOnceWith('2026-10-25') // 일요일
  })

  it('AC-009.1: [전날]은 오늘에도 누를 수 있다', async () => {
    const props = setup({ ymd: TODAY })
    await userEvent.click(button('전날'))
    expect(props.onDate).toHaveBeenCalledExactlyOnceWith(PAST)
  })

  it.each(['2026-10-20', TODAY])('AC-009.1: 날짜 칸에서 %s를 고르면 그 날로 간다', (picked) => {
    const props = setup({ ymd: '2026-10-15' })
    fireEvent.change(dateInput(), { target: { value: picked } })
    expect(props.onDate).toHaveBeenCalledExactlyOnceWith(picked)
  })

  it.each([
    ['내일', '2026-11-02'],
    ['먼 미래', '2027-01-01'],
    ['빈 값', ''],
    ['없는 날', '2026-02-30'],
    ['날짜 아닌 글자', 'abc'],
  ])('AC-009.1: %s 고르기는 무시하고 칸은 고른 날 그대로다', (_label, picked) => {
    const props = setup({ ymd: PAST })
    fireEvent.change(dateInput(), { target: { value: picked } })
    expect(props.onDate).not.toHaveBeenCalled()
    expect(dateInput().value).toBe(PAST)
  })
})

describe('AC-009.2 저장 상태 글', () => {
  it.each<[ToolbarStatus, Date | null, string]>([
    ['loading', null, '불러오는 중이에요'],
    ['empty', null, '적으면 바로 저장돼요'],
    ['view-only', null, '휴대폰에서는 보기만 할 수 있어요'], // AC-010.17
    ['saving', null, '저장하는 중이에요'],
    ['saving', SAVED_AT, '저장하는 중이에요'],
    ['saved', SAVED_AT, '저장했어요 · 14:05'],
    ['blocked', SAVED_AT, '빨간 칸 빼고 저장했어요 · 14:05'],
    ['blocked', null, '빨간 칸은 저장하지 않았어요'],
    ['offline', null, '인터넷이 끊겼어요. 다시 연결되면 저장해요'],
    ['offline', SAVED_AT, '인터넷이 끊겼어요. 다시 연결되면 저장해요'],
  ])('AC-009.2: %s(저장 시각 %s)이면 "%s"다', (status, savedAt, text) => {
    setup({ status, savedAt })
    expect(screen.getByRole('status').textContent).toBe(text)
  })

  it('AC-009.2: 저장 시각이 없는 saved도 빈 시각을 그리지 않는다', () => {
    setup({ status: 'saved', savedAt: null })
    expect(screen.getByRole('status').textContent).toBe('저장했어요')
  })

  it.each<ToolbarStatus>(['failed', 'load-failed'])('AC-009.2: %s이면 저장됐다고 말하지 않는다(오류 카드가 말한다)', (status) => {
    setup({ status, savedAt: SAVED_AT })
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('AC-009.2: 상태 글은 small ink-2이고 끊김만 warning 글자 + 아이콘이다', () => {
    setup({ status: 'saved', savedAt: SAVED_AT })
    const saved = screen.getByRole('status')
    expect(hasClasses(saved, 'text-small text-ink-2')).toBe(true)
    expect(saved.querySelector('svg')).toBeNull()
    cleanup()

    setup({ status: 'offline' })
    const offline = screen.getByRole('status')
    expect(hasClasses(offline, 'text-small text-warning')).toBe(true)
    expect(offline.classList.contains('text-ink-2')).toBe(false)
    expect(offline.querySelector('svg')).not.toBeNull()
  })
})

describe('AC-009.3 오류 카드', () => {
  it('AC-009.3: 저장 실패는 E-WORKLOG-SAVE-FAILED 카드와 [다시 저장]이고 누르면 다시 저장한다', async () => {
    const props = setup({ status: 'failed' })
    expect(cardCodes()).toEqual(['E-WORKLOG-SAVE-FAILED'])
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
    await userEvent.click(button('다시 저장'))
    expect(props.onRetrySave).toHaveBeenCalledOnce()
    expect(props.onReload).not.toHaveBeenCalled()
  })

  it('AC-009.3: 불러오기 실패는 E-WORKLOG-LOAD-FAILED 카드와 [다시 불러오기]이고 누르면 다시 읽는다', async () => {
    const props = setup({ status: 'load-failed' })
    expect(cardCodes()).toEqual(['E-WORKLOG-LOAD-FAILED'])
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
    await userEvent.click(button('다시 불러오기'))
    expect(props.onReload).toHaveBeenCalledOnce()
    expect(props.onRetrySave).not.toHaveBeenCalled()
  })

  it('AC-009.3: 막힌 칸이 지금 보는 날에 있으면 E-WORKLOG-NOTE-PRIVATE 카드만 있고 날짜 글자와 다시 하기 단추가 없다', () => {
    setup({ ymd: PAST, status: 'blocked', blockedYmd: PAST })
    expect(cardCodes()).toEqual(['E-WORKLOG-NOTE-PRIVATE'])
    expect(screen.queryByText(/막힌 칸은/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^다시/ })).toBeNull()
  })

  it('AC-009.3: 막힌 칸이 다른 날에 있으면 카드 아래에 그 날짜 글자가 있다', () => {
    setup({ ymd: PAST, status: 'blocked', blockedYmd: '2026-10-30' })
    expect(cardCodes()).toEqual(['E-WORKLOG-NOTE-PRIVATE'])
    const where = screen.getByText('막힌 칸은 2026/10/30 금에 있어요')
    expect(hasClasses(where, 'text-small text-ink-2')).toBe(true)
    const card = screen.getByRole('alert')
    expect(card.compareDocumentPosition(where) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each<ToolbarStatus>(['offline', 'saving', 'saved', 'loading', 'empty'])(
    'AC-009.3: 전체 상태가 %s여도 막힌 칸이 있으면 막힌 칸 카드가 보인다',
    (status) => {
      setup({ ymd: TODAY, status, blockedYmd: PAST })
      expect(cardCodes()).toEqual(['E-WORKLOG-NOTE-PRIVATE'])
      expect(screen.getByText('막힌 칸은 2026/10/31 토에 있어요')).toBeTruthy()
    },
  )

  it('AC-009.3: 막힌 칸 카드는 전체 상태가 아니라 막힌 칸 목록으로 띄운다(blocked여도 막힌 날이 없으면 카드 없음)', () => {
    setup({ status: 'blocked', blockedYmd: null })
    expect(cardCodes()).toEqual([])
  })

  it('AC-009.3: 저장 실패와 막힌 칸이 겹치면 카드 둘이 위아래로 있고 [다시 저장]도 있다', () => {
    setup({ status: 'failed', blockedYmd: TODAY })
    expect(cardCodes()).toEqual(['E-WORKLOG-SAVE-FAILED', 'E-WORKLOG-NOTE-PRIVATE'])
    expect(button('다시 저장')).toBeTruthy()
  })

  it('AC-009.3: 불러오기 실패와 막힌 칸이 겹치면 카드 둘이 위아래로 있고 [다시 불러오기]도 있다', () => {
    setup({ status: 'load-failed', blockedYmd: PAST })
    expect(cardCodes()).toEqual(['E-WORKLOG-LOAD-FAILED', 'E-WORKLOG-NOTE-PRIVATE'])
    expect(button('다시 불러오기')).toBeTruthy()
  })

  it.each<ToolbarStatus>(['loading', 'empty', 'saving', 'saved', 'offline', 'blocked'])(
    'AC-009.3: %s이고 막힌 칸이 없으면 카드와 다시 하기 단추가 없다',
    (status) => {
      setup({ status })
      expect(cardCodes()).toEqual([])
      expect(screen.queryByRole('button', { name: /^다시/ })).toBeNull()
    },
  )

  it('AC-009.3: 오류 카드는 날짜 줄 아래에 있다', () => {
    setup({ status: 'failed' })
    expect(dateInput().compareDocumentPosition(screen.getByRole('alert')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button('인쇄').compareDocumentPosition(screen.getByRole('alert')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('AC-009.4 단추', () => {
  it('AC-009.4: [인쇄]는 보조 단추이고 누르면 인쇄를 부른다', async () => {
    const props = setup()
    expect(hasClasses(button('인쇄'), ds.button.secondary)).toBe(true)
    await userEvent.click(button('인쇄'))
    expect(props.onPrint).toHaveBeenCalledOnce()
  })

  it.each<ToolbarStatus>(['loading', 'empty', 'saving', 'saved', 'offline', 'blocked', 'load-failed'])(
    'AC-009.4: %s일 때 [저장] 단추가 없다(숨김 포함)',
    (status) => {
      setup({ status })
      expect(screen.queryAllByRole('button', { name: /저장$/, hidden: true })).toEqual([])
    },
  )

  it('AC-009.4: 저장 실패여도 저장으로 끝나는 단추는 [다시 저장] 하나뿐이다', () => {
    setup({ status: 'failed' })
    const saves = screen.queryAllByRole('button', { name: /저장$/, hidden: true })
    expect(saves.map((b) => b.textContent)).toEqual(['다시 저장'])
  })

  it.each<[ToolbarStatus, string[]]>([
    ['failed', ['전날', '다음 날', '오늘로', '인쇄', '다시 저장']],
    ['load-failed', ['전날', '다음 날', '오늘로', '인쇄', '다시 불러오기']],
  ])('AC-009.4: %s일 때 단추는 모두 보조 단추이고 휴대폰에서 44px이다', (status, names) => {
    setup({ ymd: PAST, status })
    for (const name of names) {
      const el = button(name)
      expect(hasClasses(el, ds.button.secondary)).toBe(true)
      expect(el.classList.contains('max-md:h-11')).toBe(true)
    }
    expect(screen.getAllByRole('button')).toHaveLength(names.length)
  })

  it('AC-009.4: 날짜 칸은 ds.input이고 모든 폭에서 44px이다', () => {
    setup()
    expect(hasClasses(dateInput(), ds.input)).toBe(true)
    expect(dateInput().classList.contains('h-11')).toBe(true)
  })
})

describe('AC-011.3 인쇄', () => {
  it('AC-011.3: 맨 바깥에 print:hidden이 있어 날짜 줄·저장 상태·[인쇄]·오류 카드가 모두 찍히지 않는다', () => {
    setup({ ymd: PAST, status: 'failed', blockedYmd: PAST })
    const root = document.body.firstElementChild?.firstElementChild as HTMLElement
    expect(root.classList.contains('print:hidden')).toBe(true)
    for (const el of [dateInput(), screen.getByRole('status'), button('인쇄'), ...screen.getAllByRole('alert')]) {
      expect(root.contains(el)).toBe(true)
    }
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })
})
