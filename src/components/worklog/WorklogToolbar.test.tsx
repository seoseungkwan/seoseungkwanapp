// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { ErrorCode } from '@/types/errors'
import { MEMO_FONT_PTS, type MemoFontPt } from '@/types/worklog'
import { WorklogToolbar, type MemoFontControl, type ToolbarStatus } from './WorklogToolbar'

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

  it('AC-8009.1: 보는 중(viewing)이면 상태 글이 비어 있다 — 휴대폰 보기만 글·적으면 저장 글이 없고 새 글도 없다', () => {
    setup({ status: 'viewing', savedAt: SAVED_AT })
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.queryByText('휴대폰에서는 보기만 할 수 있어요')).toBeNull()
    expect(screen.queryByText('적으면 바로 저장돼요')).toBeNull()
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

// ── worklog-memo-font REQ-1506·REQ-1507: 날짜 줄 아래 업무사항 글씨 [가−] 숫자 [가+]와 잘림 안내 (design.md '날짜 줄', 승인 시안 docs/mockups/worklog/memo-font.html).
// 자리는 시안과 다르게 날짜 줄 바로 아래 줄 오른쪽 끝이다(design.md '시안과 다른 곳' 첫 줄). 위 시험의 setup은 memoFont를 주지 않는다(터치 기기와 같다)
const CUT_TEXT = '업무사항 글이 칸보다 길어서 인쇄하면 아랫부분이 잘려요. 글씨를 줄이면 다 들어갈 수 있어요.'
type ToolbarProps = ComponentProps<typeof WorklogToolbar>

function fontProps(font: Partial<MemoFontControl> = {}, overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  const memoFont: MemoFontControl = { pt: 11, disabled: false, overflow: false, onStep: vi.fn(), ...font }
  return {
    ymd: PAST,
    today: TODAY,
    status: 'saved',
    savedAt: SAVED_AT,
    blockedYmd: null,
    onDate: vi.fn(),
    onRetrySave: vi.fn(),
    onReload: vi.fn(),
    onPrint: vi.fn(),
    memoFont,
    ...overrides,
  }
}

function setupFont(font: Partial<MemoFontControl> = {}, overrides: Partial<ToolbarProps> = {}) {
  const onStep = vi.fn<(step: -1 | 1) => void>()
  const props = fontProps({ onStep, ...font }, overrides)
  const view = render(<WorklogToolbar {...props} />)
  return { props, onStep, rerender: (next: ToolbarProps) => view.rerender(<WorklogToolbar {...next} />) }
}

const fontGroup = () => screen.getByRole('group', { name: '업무사항 글씨 크기' })
const queryFontGroup = () => screen.queryByRole('group', { name: '업무사항 글씨 크기' })
const smaller = () => button('업무사항 글씨 작게') as HTMLButtonElement
const bigger = () => button('업무사항 글씨 크게') as HTMLButtonElement
const cutNotice = () => screen.queryByText(CUT_TEXT)?.closest('p') ?? null
const toolbarRoot = () => document.body.firstElementChild?.firstElementChild as HTMLElement
const buttonNames = (within_: HTMLElement = document.body) =>
  within(within_)
    .queryAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent)
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
// 공용 아이콘을 따로 그린 안쪽 그림(같은 jsdom 글자로 견준다)
function iconInner(name: 'alert' | 'info'): string {
  const { container, unmount } = render(<Icon name={name} />)
  const inner = container.querySelector('svg')?.innerHTML ?? ''
  unmount()
  return inner
}

describe('AC-1506.1 업무사항 글씨 묶음 자리·차례', () => {
  it('AC-1506.1: 묶음(role="group", 이름 "업무사항 글씨 크기")이 있고 차례대로 글자 "업무사항 글씨"·[가−]·숫자·[가+]다', () => {
    setupFont()
    const parts = [...fontGroup().children].map((el) => [el.tagName, el.textContent, el.getAttribute('aria-label')])
    expect(parts).toEqual([
      ['SPAN', '업무사항 글씨', null],
      ['BUTTON', '가−', '업무사항 글씨 작게'],
      ['OUTPUT', '11', null],
      ['BUTTON', '가+', '업무사항 글씨 크게'],
    ])
  })

  it('AC-1506.1: 단추 이름은 "업무사항 글씨 작게"·"업무사항 글씨 크게"이고 보이는 글자는 "가" + 작은 −·+다', () => {
    setupFont()
    for (const [el, sign] of [
      [smaller(), '−'],
      [bigger(), '+'],
    ] as const) {
      expect(el.type).toBe('button')
      const small = el.querySelector('span')
      expect(small?.textContent).toBe(sign)
      expect(small?.classList.contains('text-caption')).toBe(true)
      expect(el.textContent).toBe(`가${sign}`)
    }
  })

  it.each(MEMO_FONT_PTS)('AC-1506.1: 크기 %i이면 숫자 칸(output, aria-live="polite")이 그 숫자다', (pt) => {
    setupFont({ pt })
    const output = within(fontGroup()).getByRole('status')
    expect(output.tagName).toBe('OUTPUT')
    expect(output.getAttribute('aria-live')).toBe('polite')
    expect(output.textContent).toBe(String(pt))
  })

  it('AC-1506.1: 묶음은 날짜 줄(첫 줄) 바로 아래 줄에 혼자 있고 그 줄은 오른쪽 끝 정렬이다', () => {
    setupFont()
    const [firstRow, fontRow] = [...toolbarRoot().children] as HTMLElement[]
    const group = fontGroup()
    expect(firstRow?.contains(dateInput())).toBe(true)
    expect(firstRow?.contains(group)).toBe(false)
    expect(fontRow?.parentElement).toBe(toolbarRoot())
    expect([...(fontRow?.children ?? [])]).toEqual([group])
    expect(hasClasses(fontRow as HTMLElement, 'flex justify-end')).toBe(true)
    expect(follows(button('인쇄'), group)).toBe(true)
  })

  it('AC-1506.1: 첫 줄(전날·날짜 고르기·다음 날·오늘로·상태 글·[인쇄])의 글·단추·차례는 묶음이 없을 때와 똑같다', () => {
    setup({ ymd: PAST, status: 'saved', savedAt: SAVED_AT })
    const before = toolbarRoot().firstElementChild?.outerHTML
    cleanup()

    setupFont()
    const firstRow = toolbarRoot().firstElementChild as HTMLElement
    expect(firstRow.outerHTML).toBe(before)
    expect(buttonNames(firstRow)).toEqual(['전날', '다음 날', '오늘로', '인쇄'])
    expect(firstRow.querySelector('[role="status"]')?.textContent).toBe('저장했어요 · 14:05')
    expect(buttonNames()).toEqual(['전날', '다음 날', '오늘로', '인쇄', '업무사항 글씨 작게', '업무사항 글씨 크게'])
  })

  it('AC-1506.1·AC-1507.1: 글씨 줄 → 잘림 안내 → 오류 카드 차례다(안내는 글씨 줄 바로 아래)', () => {
    setupFont({ overflow: true }, { status: 'failed', blockedYmd: PAST })
    const [, fontRow, notice] = [...toolbarRoot().children] as HTMLElement[]
    expect(fontRow?.contains(fontGroup())).toBe(true)
    expect(notice).toBe(cutNotice())
    const cards = screen.getAllByRole('alert')
    expect(cards).toHaveLength(2)
    for (const card of cards) expect(follows(notice as HTMLElement, card)).toBe(true)
  })
})

describe('AC-1506.2 [가−]·[가+] 누름', () => {
  it('AC-1506.2: [가−]를 누르면 onStep(-1), [가+]를 누르면 onStep(1)을 한 번씩 부른다', async () => {
    const { onStep } = setupFont({ pt: 11 })
    await userEvent.click(smaller())
    expect(onStep).toHaveBeenCalledExactlyOnceWith(-1)
    await userEvent.click(bigger())
    expect(onStep).toHaveBeenCalledTimes(2)
    expect(onStep).toHaveBeenLastCalledWith(1)
  })

  it.each(MEMO_FONT_PTS.map((pt) => [pt, pt === 8, pt === 16] as const))(
    'AC-1506.2: 크기 %i이면 [가−] 막힘 %s · [가+] 막힘 %s',
    async (pt, smallerOff, biggerOff) => {
      const { onStep } = setupFont({ pt: pt as MemoFontPt })
      expect(smaller().disabled).toBe(smallerOff)
      expect(bigger().disabled).toBe(biggerOff)
      await userEvent.click(smaller())
      await userEvent.click(bigger())
      expect(onStep.mock.calls).toEqual([...(smallerOff ? [] : [[-1]]), ...(biggerOff ? [] : [[1]])])
    },
  )

  it.each<MemoFontPt>([8, 11, 16])('AC-1506.2: disabled가 참이면(불러오는 중·불러오기 실패) 크기 %i에서 두 단추가 다 막히고 숫자는 보인다', async (pt) => {
    const { onStep } = setupFont({ pt, disabled: true }, { status: 'loading' })
    expect(smaller().disabled).toBe(true)
    expect(bigger().disabled).toBe(true)
    await userEvent.click(smaller())
    await userEvent.click(bigger())
    expect(onStep).not.toHaveBeenCalled()
    expect(within(fontGroup()).getByRole('status').textContent).toBe(String(pt))
  })
})

describe('AC-1506.3 memoFont가 없으면(터치 기기) 묶음·안내 없음', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
  ] as const)('AC-1506.3·AC-1507.2: memoFont가 %s이면 글씨 묶음·잘림 안내가 없고 단추 수는 지금과 같다', (_label, memoFont) => {
    setup({ ymd: PAST, status: 'view-only', memoFont })
    expect(queryFontGroup()).toBeNull()
    expect(screen.queryByText('업무사항 글씨')).toBeNull()
    expect(cutNotice()).toBeNull()
    expect(buttonNames()).toEqual(['전날', '다음 날', '오늘로', '인쇄'])
    expect(toolbarRoot().children).toHaveLength(1)
  })

  it('AC-1506.3: 글씨 묶음·잘림 안내도 print:hidden인 맨 바깥 안에 있어 찍히지 않는다', () => {
    setupFont({ overflow: true })
    const root = toolbarRoot()
    expect(root.classList.contains('print:hidden')).toBe(true)
    expect(root.contains(fontGroup())).toBe(true)
    expect(root.contains(cutNotice())).toBe(true)
  })
})

describe('AC-1506.4 단추·숫자 칸 모양', () => {
  it('AC-1506.4: [가−]·[가+]는 보조 단추(ds.button.secondary) 정사각형이다(36px, 좌우 여백 0, 768px 미만 44×44)', () => {
    setupFont()
    for (const el of [smaller(), bigger()]) {
      expect(hasClasses(el, ds.button.secondary)).toBe(true)
      expect(hasClasses(el, 'h-9 w-9 max-md:h-11 max-md:w-11')).toBe(true)
      // ds.button.secondary의 px-4보다 이겨야 정사각형이다(같은 속성 둘이면 Tailwind 차례가 정한다)
      expect(el.classList.contains('px-0!')).toBe(true)
    }
  })

  it('AC-1509.1·AC-1506.4: [가−]·[가+]의 글자는 시안처럼 굵다(600, ds.button.secondary의 font-medium보다 이기게 !)', () => {
    // 화면 확인(TASK-8)에서 찾은 차이: 시안 .fontctl .btn은 font-weight 600, ds 보조 단추는 500
    setupFont()
    for (const el of [smaller(), bigger()]) {
      expect(el.classList.contains('font-semibold!')).toBe(true)
    }
  })

  it('AC-1506.4: 숫자 칸은 단추와 같은 높이(36px, 768px 미만 44px)·1px line-strong 선·4px 모서리·가운데 정렬이다', () => {
    setupFont()
    const output = within(fontGroup()).getByRole('status')
    expect(hasClasses(output, 'h-9 max-md:h-11 border border-line-strong rounded-control bg-surface place-items-center text-ink tabular-nums')).toBe(true)
  })

  it('AC-1506.4: 글자 "업무사항 글씨"는 small ink-2이고 묶음 안 사이는 6px이다', () => {
    setupFont()
    expect(hasClasses(screen.getByText('업무사항 글씨'), 'text-small text-ink-2 whitespace-nowrap')).toBe(true)
    expect(hasClasses(fontGroup(), 'flex items-center gap-1.5')).toBe(true)
  })

  it('AC-1506.4: 날짜 줄은 양식 CSS Module을 쓰지 않는다(앱 규칙)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/worklog/WorklogToolbar.tsx'), 'utf8')
    expect(src).not.toMatch(/\.module\.css/)
    expect(src).not.toMatch(/style=\{/)
  })
})

describe('AC-1507.1 잘림 안내', () => {
  it('AC-1507.1: overflow가 참이고 disabled가 거짓이면 글씨 줄 바로 아래에 경고 그림 + 안내 글 한 줄이 있다', () => {
    setupFont({ overflow: true })
    const notice = cutNotice() as HTMLElement
    expect(notice).not.toBeNull()
    expect(notice.textContent).toBe(CUT_TEXT)
    expect(notice.tagName).toBe('P')
    expect(hasClasses(notice, 'flex items-start gap-1.5 text-small text-ink-2')).toBe(true)
    const fontRow = fontGroup().parentElement as HTMLElement
    expect(fontRow.nextElementSibling).toBe(notice)
  })

  it('AC-1507.1: 경고 그림은 공용 아이콘 alert(text-negative)이고 info 그림이 아니다', () => {
    setupFont({ overflow: true })
    const svg = cutNotice()?.querySelector('svg') as SVGElement
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(hasClasses(svg, 'text-negative shrink-0 mt-0.5')).toBe(true)
    const shown = svg.innerHTML
    cleanup()
    expect(shown).toBe(iconInner('alert'))
    expect(shown).not.toBe(iconInner('info'))
  })

  it('AC-1507.1: 안내는 오류 카드가 아니다(role="alert"·ErrorCard 없음)', () => {
    setupFont({ overflow: true })
    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(cutNotice()?.closest('[role]')).toBeNull()
    expect(cutNotice()?.getAttribute('role')).toBeNull()
  })
})

describe('AC-1507.2 잘림 안내가 없을 때', () => {
  it.each<[string, Partial<MemoFontControl>]>([
    ['overflow 거짓', { overflow: false, disabled: false }],
    ['disabled 참(overflow 참)', { overflow: true, disabled: true }],
    ['overflow 거짓·disabled 참', { overflow: false, disabled: true }],
  ])('AC-1507.2: %s이면 안내 줄이 없다(글씨 묶음은 있다)', (_label, font) => {
    setupFont(font)
    expect(cutNotice()).toBeNull()
    expect(fontGroup()).toBeTruthy()
    expect(toolbarRoot().children).toHaveLength(2)
  })

  it('AC-1507.2: overflow가 참 → 거짓이 되면 안내가 사라지고, 다시 참이면 나오고, disabled가 참이 되면 사라진다', () => {
    const { rerender } = setupFont({ overflow: true })
    expect(cutNotice()).not.toBeNull()
    rerender(fontProps({ overflow: false }))
    expect(cutNotice()).toBeNull()
    rerender(fontProps({ overflow: true }))
    expect(cutNotice()).not.toBeNull()
    rerender(fontProps({ overflow: true, disabled: true }))
    expect(cutNotice()).toBeNull()
  })
})
