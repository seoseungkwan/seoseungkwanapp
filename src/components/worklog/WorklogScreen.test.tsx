// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadWorklogDay, saveWorklogDay, WorklogStorageError } from '@/lib/storage/worklogDays'
import { BIT_FILL_KEYS, mergeBit } from '@/lib/worklog/bitFill'
import type { RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import { emptyWorklogDay, type MemoFontPt, type WorklogDay, type WorklogNumberKey, type WorklogSavedDay } from '@/types/worklog'
import s from './sheet.module.css'
import { WorklogScreen } from './WorklogScreen'
import { startWorklogSession, worklogAutosave } from './worklogSession'

// 업무일지 화면 전체(읽기·자동 저장·다시 읽기·자정·로그아웃). 저장소와 Supabase만 가짜이고 자동 저장 제어는 진짜다.
// 값은 둥근 가짜 숫자와 "가상" 글자이고 환자·의원 자료가 없다
const client = vi.hoisted(() => ({ auth: { onAuthStateChange: vi.fn() } }))

vi.mock('@/lib/storage/worklogDays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/worklogDays')>()),
  loadWorklogDay: vi.fn(),
  saveWorklogDay: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => client }))
// 비트 PC 통로(useBridge)는 가짜다(worklog REQ-017). 기본은 연결 안 됨이라 Phase 2·3 시험은 비트를 읽지 않는다
const bridge = vi.hoisted(() => ({
  state: 'disconnected' as string,
  helloError: null as string | null,
  call: vi.fn<(cmd: string, args: { from: string; to: string }) => Promise<RevenueDaysResult>>(),
}))
vi.mock('@/components/claim/useBridge', () => ({
  useBridge: () => ({ state: bridge.state, helloError: bridge.helloError, call: bridge.call }),
}))
// 맞추기는 진짜 함수다. 부른 횟수만 본다(AC-017.8 합치지 않음)
vi.mock('@/lib/worklog/bitFill', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/worklog/bitFill')>()
  return { ...real, mergeBit: vi.fn(real.mergeBit) }
})

const TODAY = '2026-10-28' // 수요일
const PAST = '2026-10-27'
const TOMORROW = '2026-10-29'
const SUNDAY = '2026-10-25'
const NOON_TODAY = new Date('2026-10-28T03:00:00Z') // 한국 시각 12:00
const AFTER_MIDNIGHT = new Date('2026-10-28T15:00:10Z') // 한국 시각 10월 29일 00:00:10
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'
const FAKE_PHONE = '010-0000-0000'

const load = vi.mocked(loadWorklogDay)
const save = vi.mocked(saveWorklogDay)
const unsubscribe = vi.fn()
const media = { touch: false, listeners: new Set<() => void>() }
let emitAuth: (event: string) => void

const dayWith = (cells: Partial<WorklogDay> = {}): WorklogDay => ({ ...emptyWorklogDay(), ...cells })
// 읽기가 돌려주는 모양(AC-016.1). 비트 칸 목록은 비어 있다(비트 표시는 TASK-17)
const saved = (cells: Partial<WorklogDay> = {}): WorklogSavedDay => ({ day: dayWith(cells), bitFields: [] })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function open(cells: Partial<WorklogDay> | null = null) {
  load.mockResolvedValueOnce(cells === null ? null : saved(cells))
  const view = render(<WorklogScreen initialToday={TODAY} />)
  await settle()
  return view
}

// 날짜마다 다른 서버 값을 돌려준다
function serverByDate(values: Record<string, Partial<WorklogDay> | null>) {
  load.mockImplementation(async (_client, ymd) => {
    const cells = values[ymd]
    return cells ? saved(cells) : null
  })
}

const cell = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
const type = (label: string, value: string) => fireEvent.change(cell(label), { target: { value } })
const focusOn = (el: HTMLElement) =>
  act(() => {
    el.focus()
  })
const blurFrom = (el: HTMLElement) =>
  act(() => {
    el.blur()
  })
const button = (name: string) => screen.getByRole('button', { name })
const dateInput = () => screen.getByLabelText<HTMLInputElement>('날짜 고르기')
// 저장 상태 글 하나. 업무사항 글씨 크기 숫자 칸(<output>)도 role="status"라 그것은 뺀다(worklog-memo-font design.md '기존 명세·시험과의 관계')
const statusText = () => {
  const lines = screen.getAllByRole('status').filter((el) => el.tagName !== 'OUTPUT')
  expect(lines).toHaveLength(1)
  return lines[0].textContent
}
const cardCodes = () => screen.queryAllByRole('alert').map((card) => card.textContent?.match(/E-[A-Z-]+/)?.[0])
const sheetCells = () => within(screen.getByRole('table', { name: '업무일지' })).getAllByRole<HTMLInputElement>('textbox')
const expectLocked = () => expect(sheetCells().every((el) => el.readOnly)).toBe(true)
const expectOpen = () => expect(sheetCells().every((el) => !el.readOnly)).toBe(true)
const received = () => screen.getByText('수납액').nextElementSibling?.textContent

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  fireEvent(document, new Event('visibilitychange'))
}

function leaveIsBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

const signOut = () =>
  act(() => {
    emitAuth('SIGNED_OUT')
  })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOON_TODAY)
  vi.clearAllMocks()
  load.mockReset()
  save.mockReset()
  load.mockResolvedValue(null)
  save.mockResolvedValue(undefined)
  bridge.state = 'disconnected'
  bridge.helloError = null
  bridge.call.mockReset()
  client.auth.onAuthStateChange.mockImplementation((callback: (event: string, session: null) => void) => {
    emitAuth = (event) => callback(event, null)
    return { data: { subscription: { unsubscribe } } }
  })
  media.touch = false
  media.listeners.clear()
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === TOUCH_QUERY && media.touch,
    media: query,
    addEventListener: (_type: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => media.listeners.delete(listener),
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  startWorklogSession()()
  worklogAutosave().dispose()
  Reflect.deleteProperty(document, 'visibilityState')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('AC-010.1 열기', () => {
  it('AC-010.1: 받은 오늘의 양식으로 열리고, 다 읽기 전에는 칸이 읽기 전용이며 "불러오는 중이에요"다', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(client, TODAY)
    expect(dateInput().value).toBe(TODAY)
    expect(dateInput().max).toBe(TODAY)
    expect(screen.getByText('2026/10/28 수')).toBeTruthy()
    expectLocked()
    expect(statusText()).toBe('불러오는 중이에요')

    await act(async () => reply.resolve(saved({ cashIn: '100000' })))

    expectOpen()
    expect(cell('현금수납').value).toBe('100,000원')
    expect(received()).toBe('100,000원')
    expect(statusText()).toBe('적으면 바로 저장돼요')
  })

  it('AC-010.1: 읽는 동안 잠긴 칸은 고쳐지지 않고 저장도 부르지 않는다', async () => {
    load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)
    render(<WorklogScreen initialToday={TODAY} />)
    type('현금수납', '100000')
    await settle(5000)
    expect(cell('현금수납').value).toBe('')
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-010.1: 서버에서 먼저 그려도 잠긴 양식이고 읽기·브라우저 기능을 부르지 않는다', () => {
    const html = renderToString(<WorklogScreen initialToday={TODAY} />)
    expect(html).toContain('불러오는 중이에요')
    expect(html).toContain('2026/10/28 수')
    expect(load).not.toHaveBeenCalled()
    expect(window.matchMedia).not.toHaveBeenCalled()
    expect(client.auth.onAuthStateChange).not.toHaveBeenCalled()
  })

  it('AC-010.1: StrictMode에서도 마지막 읽기로 열리고 저장을 부르지 않는다', async () => {
    load.mockResolvedValue(saved({ cashIn: '100000' }))
    render(
      <StrictMode>
        <WorklogScreen initialToday={TODAY} />
      </StrictMode>,
    )
    await settle(5000)
    expectOpen()
    expect(cell('현금수납').value).toBe('100,000원')
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-010.1: 감싸개는 시안 폭(737px) 가운데이고 날짜 줄과 양식 사이가 12px이다', async () => {
    const { container } = await open()
    const wrap = container.firstElementChild as HTMLElement
    for (const name of ['mx-auto', 'w-full', 'max-w-184.25', 'gap-3']) expect(wrap.classList.contains(name)).toBe(true)
  })

  it('AC-010.1: 화면 파일은 sheet.module.css를 불러오지 않는다(예외는 WorklogSheet.tsx 하나)', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/worklog/WorklogScreen.tsx'), 'utf8')
    expect(source).not.toContain('module.css')
  })
})

describe('AC-010.2 줄 없는 날', () => {
  it('AC-010.2: 서버 줄이 없으면 빈 양식이고, 적기 전에는 저장을 부르지 않는다', async () => {
    await open(null)
    expectOpen()
    expect(cell('현금수납').value).toBe('')
    expect(cell('업무사항').value).toBe('')
    expect(received()).toBe('원')
    await settle(120_000)
    expect(save).not.toHaveBeenCalled()
    expect(statusText()).toBe('적으면 바로 저장돼요')
  })

  it('AC-010.2: 일요일로 옮겨도 빈 양식이고 저장을 부르지 않는다', async () => {
    serverByDate({ [SUNDAY]: null })
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    fireEvent.change(dateInput(), { target: { value: SUNDAY } })
    await settle()
    expect(load).toHaveBeenLastCalledWith(client, SUNDAY)
    expectOpen()
    expect(screen.getByText('2026/10/25 일')).toBeTruthy()
    await settle(5000)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('AC-010.3 칸 고치기', () => {
  it('AC-010.3: 숫자 칸을 치면 자동 칸이 바로 바뀌고, 800ms 뒤 그 칸만 저장한다', async () => {
    await open({ cashIn: '100000' })
    type('카드수납', '200000')
    expect(received()).toBe('300,000원')
    expect(statusText()).toBe('저장하는 중이에요')
    expect(save).not.toHaveBeenCalled()

    await settle(799)
    expect(save).not.toHaveBeenCalled()
    await settle(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cardIn: '200000' })
    expect(statusText()).toContain('저장했어요')
  })

  it.each([
    ['업무사항', 'memo', '가상 업무 글'],
    ['지출 현금 비고', 'noteCash', '가상 비고'],
    ['현금수납 항목 이름', 'nameCashIn', '가상 항목'],
  ])('AC-010.3: %s도 같은 길로 그 칸만 저장한다', async (label, key, text) => {
    await open({ cashIn: '100000' })
    type(label, text)
    expect(cell(label).value).toBe(text)
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { [key]: text })
  })

  it('AC-010.3: 막는 모양을 치면 바로 빨갛고, 저장에 그 칸이 없으며, 다른 칸은 저장한다', async () => {
    await open()
    type('업무사항', `가상 ${FAKE_PHONE}`)
    expect(cell('업무사항').getAttribute('aria-invalid')).toBe('true')
    expect(cardCodes()).toContain('E-WORKLOG-NOTE-PRIVATE')

    type('현금수납', '100000')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '100000' })
    expect(statusText()).toContain('빨간 칸 빼고 저장했어요')
  })

  it('AC-010.3: 막는 모양만 있으면 저장을 부르지 않고, 지우면 빨강이 풀린다', async () => {
    await open()
    type('지출 현금 비고', FAKE_PHONE)
    await settle(800)
    expect(save).not.toHaveBeenCalled()
    expect(cell('지출 현금 비고').getAttribute('aria-invalid')).toBe('true')

    type('지출 현금 비고', '')
    expect(cell('지출 현금 비고').getAttribute('aria-invalid')).toBeNull()
    expect(cardCodes()).toEqual([])
  })

  it('AC-010.3: 막힌 칸이 다른 날에 있으면 그 날짜를 알린다', async () => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    type('업무사항', FAKE_PHONE)
    fireEvent.click(button('전날'))
    await settle()
    expect(cardCodes()).toContain('E-WORKLOG-NOTE-PRIVATE')
    expect(screen.getByText('막힌 칸은 2026/10/28 수에 있어요')).toBeTruthy()
    expect(cell('업무사항').getAttribute('aria-invalid')).toBeNull()
  })

  it('AC-010.3: 저장이 세 번 더 실패해야 오류 카드이고, [다시 저장]으로 다시 한다', async () => {
    save.mockRejectedValue(new WorklogStorageError('failed'))
    await open()
    type('현금수납', '100000')

    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(statusText()).toBe('저장하는 중이에요')
    expect(cardCodes()).toEqual([])

    await settle(2000 + 5000 + 15000)
    expect(save).toHaveBeenCalledTimes(4)
    expect(cardCodes()).toEqual(['E-WORKLOG-SAVE-FAILED'])
    expect(statusText()).toBe('')
    expect(cell('현금수납').value).toBe('100,000원')
    expect(leaveIsBlocked()).toBe(true)

    save.mockResolvedValue(undefined)
    fireEvent.click(button('다시 저장'))
    expect(save).toHaveBeenCalledTimes(5)
    await settle()
    expect(cardCodes()).toEqual([])
    expect(statusText()).toContain('저장했어요')
  })

  it('AC-010.3: 친 글자는 저장 길 말고 console·브라우저 저장소·다른 네트워크로 가지 않는다', async () => {
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) => vi.spyOn(console, name))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await open()
    save.mockRejectedValueOnce(new WorklogStorageError('failed'))
    type('업무사항', '가상 업무 글')
    type('현금수납', '가상 200,000 별도')
    await settle(800)
    await settle(2000)
    setVisibility('hidden')
    signOut()

    for (const spy of consoles) expect(spy).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(window.location.href).not.toContain(encodeURIComponent('가상'))
  })
})

describe('AC-010.4 날짜 옮김·다시 읽기', () => {
  it('AC-010.4: 다른 날로 옮기면 기다리던 저장을 옛 날짜로 바로 시작한다', async () => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    type('현금수납', '100000')
    await settle(300)
    expect(save).not.toHaveBeenCalled()

    fireEvent.click(button('전날'))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '100000' })
    expect(dateInput().value).toBe(PAST)
  })

  it('AC-010.4: 처음 여는 날은 읽는 동안 칸을 잠그고 옛 날짜 값을 보이지 않는다', async () => {
    await open({ cashIn: '100000' })
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)

    fireEvent.click(button('전날'))

    expect(load).toHaveBeenLastCalledWith(client, PAST)
    expectLocked()
    expect(cell('현금수납').value).toBe('')
    expect(statusText()).toBe('불러오는 중이에요')
    expect(screen.getByText('2026/10/27 화')).toBeTruthy()

    await act(async () => reply.resolve(saved({ cashIn: '200000' })))
    expectOpen()
    expect(cell('현금수납').value).toBe('200,000원')
  })

  it('AC-010.4: 늦게 온 옛 날짜 응답은 버린다', async () => {
    const late = deferred<WorklogSavedDay | null>()
    const now = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(late.promise).mockReturnValueOnce(now.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    fireEvent.click(button('전날'))

    await act(async () => now.resolve(saved({ cashIn: '200000' })))
    await act(async () => late.resolve(saved({ cashIn: '100000' })))

    expect(cell('현금수납').value).toBe('200,000원')
    expect(dateInput().value).toBe(PAST)
  })

  it('AC-010.4: 이미 연 날로 돌아오면 화면 값을 바로 보이고 잠그지 않은 채 다시 읽는다', async () => {
    await open({ cashIn: '100000' })
    load.mockResolvedValueOnce(null)
    fireEvent.click(button('전날'))
    await settle()

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    fireEvent.click(button('오늘로'))

    expect(load).toHaveBeenLastCalledWith(client, TODAY)
    expectOpen()
    expect(cell('현금수납').value).toBe('100,000원')

    await act(async () => reply.resolve(saved({ cashIn: '200000' })))
    expect(cell('현금수납').value).toBe('200,000원')
  })

  it('AC-010.4: 보이는 동안 60초마다 다시 읽고, 안 보일 때는 읽지 않으며, 다시 보이면 읽는다', async () => {
    await open({ cashIn: '100000' })
    expect(load).toHaveBeenCalledTimes(1)

    load.mockResolvedValue(saved({ cashIn: '100000' }))
    await settle(59_999)
    expect(load).toHaveBeenCalledTimes(1)
    await settle(1)
    expect(load).toHaveBeenCalledTimes(2)
    await settle(60_000)
    expect(load).toHaveBeenCalledTimes(3)

    setVisibility('hidden')
    await settle(180_000)
    expect(load).toHaveBeenCalledTimes(3)

    load.mockResolvedValue(saved({ cashIn: '200000' }))
    setVisibility('visible')
    expect(load).toHaveBeenCalledTimes(4)
    expect(load).toHaveBeenLastCalledWith(client, TODAY)
    await settle()
    expect(cell('현금수납').value).toBe('200,000원')
  })

  it('AC-010.4: 초점 칸에 치다가 날짜를 옮기면 다음 글자가 옛 글자에 붙지 않고 새 날로 가지 않는다', async () => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    const input = cell('현금수납')
    focusOn(input)
    type('현금수납', '가상12')
    expect(input.value).toBe('가상12')

    fireEvent.click(button('전날'))
    await settle()

    expect(document.activeElement).not.toBe(input)
    expect(cell('현금수납').value).toBe('')

    // 사람이 다시 칠 때처럼 지금 칸 글자 뒤에 한 글자를 더한다
    focusOn(cell('현금수납'))
    type('현금수납', `${cell('현금수납').value}5`)
    await settle(800)

    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '가상12' })
    expect(save).toHaveBeenCalledWith(client, PAST, { cashIn: '5' })
    expect(save).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['현금수납 항목 이름', 'nameCashIn'],
    ['지출 현금 비고', 'noteCash'],
    ['업무사항', 'memo'],
  ])('AC-010.4: %s에 치다가 날짜를 옮겨도 친 글자가 새 날로 가지 않는다', async (label, key) => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    focusOn(cell(label))
    type(label, '가상12')

    fireEvent.click(button('전날'))
    await settle()

    expect(document.activeElement).not.toBe(cell(label))
    expect(cell(label).value).not.toContain('가상12')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { [key]: '가상12' })
  })
})

describe('AC-010.5 자정 넘김', () => {
  it('AC-010.5: 옛 오늘을 보고 있었으면 30초 안에 새 날 양식이 되고, 옛 날짜에 친 값은 옛 날짜로 저장한다', async () => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    type('현금수납', '100000')

    vi.setSystemTime(AFTER_MIDNIGHT)
    expect(save).not.toHaveBeenCalled()
    await settle(30_000)

    expect(dateInput().value).toBe(TOMORROW)
    expect(dateInput().max).toBe(TOMORROW)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '100000' })
    expect(load).toHaveBeenLastCalledWith(client, TOMORROW)
    expect(cell('현금수납').value).toBe('')
  })

  it('AC-010.5: 화면이 다시 보일 때도 날짜를 확인해 옮긴다', async () => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    setVisibility('hidden')
    vi.setSystemTime(AFTER_MIDNIGHT)
    setVisibility('visible')
    expect(dateInput().value).toBe(TOMORROW)
    await settle()
    expect(load).toHaveBeenLastCalledWith(client, TOMORROW)
    expect(load.mock.calls.filter(([, ymd]) => ymd === TODAY)).toHaveLength(1)
  })

  it('AC-010.5: 지난 날을 보고 있었으면 그대로이고 날짜 고르기 최대만 바뀐다', async () => {
    serverByDate({ [PAST]: { cashIn: '100000' } })
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    fireEvent.click(button('전날'))
    await settle()

    vi.setSystemTime(AFTER_MIDNIGHT)
    await settle(30_000)

    expect(dateInput().value).toBe(PAST)
    expect(dateInput().max).toBe(TOMORROW)
    expect(cell('현금수납').value).toBe('100,000원')
    expect(load.mock.calls.some(([, ymd]) => ymd === TOMORROW)).toBe(false)
  })

  it('AC-010.5: 양식 칸에 초점이 있으면 초점이 나간 뒤에 옮기고, 칸끼리 옮길 때는 기다린다', async () => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    const input = cell('현금수납')
    focusOn(input)
    type('현금수납', '가상12')

    vi.setSystemTime(AFTER_MIDNIGHT)
    await settle(30_000)

    expect(dateInput().value).toBe(TODAY)
    expect(dateInput().max).toBe(TOMORROW)
    expect(input.value).toBe('가상12')

    focusOn(cell('카드수납'))
    expect(dateInput().value).toBe(TODAY)

    blurFrom(cell('카드수납'))
    expect(dateInput().value).toBe(TOMORROW)
    await settle()
    expect(load).toHaveBeenLastCalledWith(client, TOMORROW)
    expect(cell('현금수납').value).toBe('')
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '가상12' })
  })

  it('AC-010.5: 초점이 날짜 줄에 있으면 기다리지 않는다', async () => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    focusOn(dateInput())
    vi.setSystemTime(AFTER_MIDNIGHT)
    await settle(30_000)
    expect(dateInput().value).toBe(TOMORROW)
  })
})

describe('AC-010.6 떠나기·가려짐·연결', () => {
  it('AC-010.6: 저장 안 된 값이 있으면 떠나기 확인을 묻고, 저장되면 묻지 않는다', async () => {
    await open()
    expect(leaveIsBlocked()).toBe(false)
    type('현금수납', '100000')
    expect(leaveIsBlocked()).toBe(true)
    await settle(800)
    expect(leaveIsBlocked()).toBe(false)
  })

  it('AC-010.6: 화면이 가려지면 기다리던 저장을 바로 시작한다', async () => {
    await open()
    type('현금수납', '100000')
    await settle(300)
    expect(save).not.toHaveBeenCalled()
    setVisibility('hidden')
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '100000' })
  })

  it('AC-010.6: 끊기면 상태 글이 알리고, 인터넷이 다시 연결되면 바로 저장한다', async () => {
    save.mockRejectedValueOnce(new WorklogStorageError('offline'))
    await open()
    type('현금수납', '100000')
    await settle(800)
    expect(statusText()).toBe('인터넷이 끊겼어요. 다시 연결되면 저장해요')
    expect(save).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(save).toHaveBeenCalledTimes(2)
    await settle()
    expect(statusText()).toContain('저장했어요')
  })
})

describe('AC-010.7 터치 기기는 보기만', () => {
  it('AC-010.7: 터치 기기는 칸이 읽기 전용이고 저장이 없으며, 업무사항·고친 항목 이름은 보인다', async () => {
    media.touch = true
    const change = vi.spyOn(worklogAutosave(), 'change')
    await open({ cashIn: '100000', memo: '가상 업무 글', nameCashIn: '가상 항목' })

    expect(window.matchMedia).toHaveBeenCalledWith(TOUCH_QUERY)
    expectLocked()
    expect(cell('업무사항').value).toBe('가상 업무 글')
    expect(cell('현금수납 항목 이름').value).toBe('가상 항목')
    expect(cell('현금수납').value).toBe('100,000원')

    type('현금수납', '200000')
    await settle(5000)
    expect(change).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(cell('현금수납').value).toBe('100,000원')
    change.mockRestore()
  })

  it('AC-010.17: 터치 기기는 빈 날이든 값이 있는 날이든 "휴대폰에서는 보기만 할 수 있어요"이고 "적으면 바로 저장돼요"가 없다', async () => {
    media.touch = true
    await open({})
    expect(statusText()).toBe('휴대폰에서는 보기만 할 수 있어요')

    load.mockResolvedValue(saved({ cashIn: '100000' }))
    await settle(60_000)
    expect(cell('현금수납').value).toBe('100,000원')
    expect(statusText()).toBe('휴대폰에서는 보기만 할 수 있어요')
  })

  it('AC-010.7: 터치 기기도 다시 읽기를 한다', async () => {
    media.touch = true
    await open({ memo: '가상 옛 글' })
    load.mockResolvedValue(saved({ memo: '가상 새 글' }))
    await settle(60_000)
    expect(cell('업무사항').value).toBe('가상 새 글')
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-010.7: 조건이 바뀌면 칸도 따라 바뀐다', async () => {
    await open()
    expectOpen()
    act(() => {
      media.touch = true
      for (const listener of media.listeners) listener()
    })
    expectLocked()
  })
})

describe('AC-010.10 좁은 PC 창', () => {
  it('AC-010.10: 폭 600에 마우스면 칸과 업무사항을 그대로 고치고 저장한다', async () => {
    const width = window.innerWidth
    window.innerWidth = 600
    await open()
    expectOpen()
    type('현금수납', '100000')
    type('업무사항', '가상 업무 글')
    await settle(800)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '100000', memo: '가상 업무 글' })
    window.innerWidth = width
  })
})

describe('AC-010.8 불러오기 실패', () => {
  it('AC-010.8: 칸은 읽기 전용으로 남고 오류 카드와 [다시 불러오기]가 보이며, 누르면 다시 읽는다', async () => {
    load.mockRejectedValueOnce(new WorklogStorageError('failed'))
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()

    expectLocked()
    expect(cardCodes()).toEqual(['E-WORKLOG-LOAD-FAILED'])
    expect(statusText()).toBe('')

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    fireEvent.click(button('다시 불러오기'))

    expect(load).toHaveBeenCalledTimes(2)
    expect(statusText()).toBe('불러오는 중이에요')
    expect(cardCodes()).toEqual([])
    expectLocked()

    await act(async () => reply.resolve(saved({ cashIn: '100000' })))
    expectOpen()
    expect(cell('현금수납').value).toBe('100,000원')
  })

  it('AC-010.8: 실패한 채로는 60초 다시 읽기가 돌지 않는다', async () => {
    load.mockRejectedValueOnce(new WorklogStorageError('failed'))
    render(<WorklogScreen initialToday={TODAY} />)
    await settle(180_000)
    expect(load).toHaveBeenCalledTimes(1)
    expect(cardCodes()).toEqual(['E-WORKLOG-LOAD-FAILED'])
  })
})

describe('AC-010.9 인쇄', () => {
  it('AC-010.9: [인쇄]는 기다리던 저장을 시작하고 브라우저 인쇄를 연다', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await open()
    type('현금수납', '100000')
    await settle(300)

    fireEvent.click(button('인쇄'))

    expect(save).toHaveBeenCalledTimes(1)
    expect(print).toHaveBeenCalledTimes(1)
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(print.mock.invocationCallOrder[0])
  })
})

describe('AC-010.11 앱 안 이동', () => {
  it('AC-010.11: 앱 안 이동 = 바로 저장. 실패해도 2초 뒤 다시 하고, 돌아오면 저장 안 된 값이 칸에 있다', async () => {
    save.mockRejectedValue(new WorklogStorageError('failed'))
    const { unmount } = await open()
    type('현금수납', '100000')
    await settle(300)
    expect(save).not.toHaveBeenCalled()

    unmount()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '100000' })
    expect(worklogAutosave().hasUnsaved()).toBe(true)

    await settle(2000)
    expect(save).toHaveBeenCalledTimes(2)

    load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)
    render(<WorklogScreen initialToday={TODAY} />)
    expect(cell('현금수납').value).toBe('100,000원')
    expect(statusText()).toBe('저장하는 중이에요')
    expect(leaveIsBlocked()).toBe(true)
  })

  it('AC-010.11: 내려갈 때 자동 저장 제어를 비우지 않고 구독만 뗀다', async () => {
    const autosave = worklogAutosave()
    const dispose = vi.spyOn(autosave, 'dispose')
    const realSubscribe = autosave.subscribe
    const left = vi.fn()
    vi.spyOn(autosave, 'subscribe').mockImplementation((listener) => {
      const off = realSubscribe(listener)
      return () => {
        left()
        off()
      }
    })
    const { unmount } = await open()
    expect(left).not.toHaveBeenCalled()

    unmount()

    expect(left).toHaveBeenCalledTimes(1)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('AC-010.11: 다른 화면에 있어도 떠나기 확인과 인터넷 연결 듣기는 남는다', async () => {
    save.mockRejectedValueOnce(new WorklogStorageError('offline'))
    const { unmount } = await open()
    type('현금수납', '100000')
    unmount()
    await settle()
    expect(leaveIsBlocked()).toBe(true)
    window.dispatchEvent(new Event('online'))
    expect(save).toHaveBeenCalledTimes(2)
    await settle()
    expect(leaveIsBlocked()).toBe(false)
  })

  it('AC-010.11: 저장이 끝나 돌아오면 서버 값으로 열리고 칸이 풀린다', async () => {
    const { unmount } = await open()
    type('현금수납', '100000')
    unmount()
    await settle()

    await open({ cashIn: '100000' })
    expectOpen()
    expect(cell('현금수납').value).toBe('100,000원')
    expect(statusText()).toContain('저장했어요')
  })
})

describe('AC-010.12 로그아웃', () => {
  it('AC-010.12: 로그아웃이면 떠나기 확인을 떼고 칸·업무사항을 비우고 저장을 멈춘다', async () => {
    await open({ cashIn: '100000', memo: '가상 업무 글', nameCashIn: '가상 항목' })
    type('카드수납', '200000')
    expect(leaveIsBlocked()).toBe(true)

    signOut()

    expect(leaveIsBlocked()).toBe(false)
    expect(cell('현금수납').value).toBe('')
    expect(cell('카드수납').value).toBe('')
    expect(cell('업무사항').value).toBe('')
    expect(cell('현금수납 항목 이름').value).toBe('현금수납')
    expect(received()).toBe('원')
    expectLocked()
    expect(worklogAutosave().pendingDay(TODAY)).toBeNull()

    await settle(120_000)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-010.12: 그 뒤 온 읽기 응답이 칸을 채우지 않는다', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)

    signOut()
    await act(async () => reply.resolve(saved({ cashIn: '100000', memo: '가상 업무 글' })))

    expect(cell('현금수납').value).toBe('')
    expect(cell('업무사항').value).toBe('')
    expectLocked()
  })

  it('AC-010.12: 다시 읽는 중 로그아웃해도 그 응답이 칸을 채우지 않는다', async () => {
    await open({ cashIn: '100000' })
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    await settle(60_000)
    expect(load).toHaveBeenCalledTimes(2)

    signOut()
    await act(async () => reply.resolve(saved({ cashIn: '100000' })))

    expect(cell('현금수납').value).toBe('')
  })

  it('AC-010.12: 로그아웃 뒤에는 다시 읽기·날짜 옮김이 읽지 않고 칸도 열리지 않는다', async () => {
    await open({ cashIn: '100000' })
    expect(load).toHaveBeenCalledTimes(1)
    signOut()

    await settle(180_000)
    setVisibility('hidden')
    setVisibility('visible')
    fireEvent.click(button('전날'))
    await settle()

    expect(load).toHaveBeenCalledTimes(1)
    expectLocked()
  })

  it.each([
    ['현금수납', '가상12'],
    ['현금수납 항목 이름', '가상 항목'],
    ['지출 현금 비고', '가상 비고'],
    ['업무사항', '가상 업무 글'],
  ])('AC-010.12: %s에 치다가 로그아웃하면 친 글자가 칸에 남지 않는다', async (label, text) => {
    await open()
    const input = cell(label)
    focusOn(input)
    type(label, text)
    expect(input.value).toBe(text)

    signOut()

    expect(document.activeElement).not.toBe(input)
    expect(input.value).not.toContain(text)
    expect(document.body.textContent).not.toContain(text)
    type(label, `${input.value}5`)
    await settle(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-010.12: 자정 넘김을 기다리던 칸에 치다가 로그아웃하면 날짜가 옮겨지지 않고 읽지 않는다', async () => {
    await open()
    const input = cell('현금수납')
    focusOn(input)
    vi.setSystemTime(AFTER_MIDNIGHT)
    await settle(30_000)
    expect(dateInput().value).toBe(TODAY)
    expect(dateInput().max).toBe(TOMORROW)

    signOut()
    await settle()

    expect(dateInput().value).toBe(TODAY)
    expect(load.mock.calls.some(([, ymd]) => ymd === TOMORROW)).toBe(false)
  })

  it('AC-010.12: 다른 화면에 있을 때 로그아웃해도 제어가 비고, 뗀 화면은 불리지 않는다', async () => {
    const { unmount } = await open()
    type('현금수납', '100000')
    save.mockReturnValueOnce(deferred<void>().promise)
    unmount()
    expect(worklogAutosave().hasUnsaved()).toBe(true)

    emitAuth('SIGNED_OUT')

    expect(worklogAutosave().hasUnsaved()).toBe(false)
    expect(worklogAutosave().pendingDay(TODAY)).toBeNull()
    expect(leaveIsBlocked()).toBe(false)
  })

  it('AC-010.12: 로그아웃 뒤 화면을 다시 열면 듣기가 다시 걸리고 값은 서버 값뿐이다', async () => {
    const first = await open({ cashIn: '100000' })
    type('카드수납', '200000')
    signOut()
    first.unmount()

    await open({ cashIn: '300000' })
    expectOpen()
    expect(cell('현금수납').value).toBe('300,000원')
    expect(cell('카드수납').value).toBe('')
    type('카드수납', '100000')
    expect(leaveIsBlocked()).toBe(true)
  })
})

describe('AC-010.13 다시 읽은 값 반영', () => {
  it('AC-010.13: 다른 PC 값이 칸·업무사항·항목 이름·자동 칸에 반영되고, 저장을 부르지 않는다', async () => {
    await open({ cashIn: '100000', memo: '가상 옛 글' })
    load.mockResolvedValue(saved({ cashIn: '300000', memo: '가상 새 글', nameCashIn: '가상 항목' }))

    await settle(60_000)

    expect(cell('현금수납').value).toBe('300,000원')
    expect(cell('업무사항').value).toBe('가상 새 글')
    expect(cell('현금수납 항목 이름').value).toBe('가상 항목')
    expect(received()).toBe('300,000원')
    expect(statusText()).toBe('적으면 바로 저장돼요')
    await settle(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-010.13: 저장 안 된 칸과 초점 칸은 그대로이고, 빠진 칸은 다음 때 반영된다', async () => {
    await open({ cashIn: '100000', cardIn: '100000', transferIn: '100000' })
    await settle(59_500)

    // 초점만 둔 칸과 방금 친 칸(800ms를 아직 안 기다림)
    const focused = cell('계좌이체')
    focusOn(focused)
    type('카드수납', '200000')

    load.mockResolvedValue(saved({ cashIn: '300000', cardIn: '300000', transferIn: '300000' }))
    await settle(500)

    expect(cell('현금수납').value).toBe('300,000원')
    expect(cell('카드수납').value).toBe('200,000원')
    expect(focused.value).toBe('100,000')
    expect(received()).toBe('600,000원')
    await settle(300)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cardIn: '200000' })

    blurFrom(focused)
    expect(focused.value).toBe('100,000원')

    load.mockResolvedValue(saved({ cashIn: '300000', cardIn: '200000', transferIn: '300000' }))
    await settle(60_000)
    expect(focused.value).toBe('300,000원')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('AC-010.13: 초점 칸에 치던 글자를 빼앗지 않는다', async () => {
    await open({ memo: '가상 옛 글' })
    focusOn(cell('업무사항'))
    await settle(59_000)
    type('업무사항', '가상 치는 글')
    load.mockResolvedValue(saved({ memo: '가상 다른 PC 글' }))
    await settle(1000)
    expect(cell('업무사항').value).toBe('가상 치는 글')
  })

  it('AC-010.13: 날짜를 옮긴 뒤에는 옛 초점 칸을 건너뛰지 않고 반영한다', async () => {
    serverByDate({})
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    focusOn(cell('현금수납'))

    fireEvent.click(button('전날'))
    await settle()
    serverByDate({ [PAST]: { cashIn: '300000' } })
    await settle(60_000)

    expect(cell('현금수납').value).toBe('300,000원')
  })

  it('AC-010.13: 로그아웃 없이 다시 그려도 초점 칸 표시가 남아 있지 않다', async () => {
    const first = await open({ cashIn: '100000' })
    focusOn(cell('현금수납'))
    first.unmount()

    await open({ cashIn: '100000' })
    load.mockResolvedValue(saved({ cashIn: '300000' }))
    await settle(60_000)
    expect(cell('현금수납').value).toBe('300,000원')
  })
})

describe('AC-010.14 다시 읽기 실패', () => {
  it.each([
    ['failed', new WorklogStorageError('failed')],
    ['offline', new WorklogStorageError('offline')],
  ])('AC-010.14: 실패(%s)해도 오류 카드 없이 값을 그대로 두고, 다음 때 다시 한다', async (_kind, error) => {
    await open({ cashIn: '100000' })
    load.mockRejectedValueOnce(error)

    await settle(60_000)

    expect(load).toHaveBeenCalledTimes(2)
    expect(cardCodes()).toEqual([])
    expect(statusText()).toBe('적으면 바로 저장돼요')
    expect(cell('현금수납').value).toBe('100,000원')
    expectOpen()

    load.mockResolvedValueOnce(saved({ cashIn: '200000' }))
    await settle(60_000)
    expect(load).toHaveBeenCalledTimes(3)
    expect(cell('현금수납').value).toBe('200,000원')
  })

  it('AC-010.14: 읽기를 시작한 뒤 그 날 저장이 오갔으면 응답을 버린다', async () => {
    await open()
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    await settle(60_000)
    expect(load).toHaveBeenCalledTimes(2)

    type('현금수납', '100000')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => reply.resolve(saved({ memo: '가상 옛 글' })))

    expect(cell('현금수납').value).toBe('100,000원')
    expect(cell('업무사항').value).toBe('')
  })
})

describe('AC-010.15 지난 날', () => {
  it('AC-010.15: 지난 날도 오늘과 똑같이 고치고, 고친 사람·시각을 보이지 않는다', async () => {
    serverByDate({ [PAST]: { cashIn: '100000', memo: '가상 업무 글' } })
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    fireEvent.click(button('전날'))
    await settle()

    expectOpen()
    expect(cell('업무사항').value).toBe('가상 업무 글')
    expect(document.body.textContent).not.toContain('고친 사람')
    expect(document.body.textContent).not.toContain('수정')

    type('카드수납', '200000')
    expect(received()).toBe('300,000원')
    await settle(800)
    expect(save).toHaveBeenCalledWith(client, PAST, { cardIn: '200000' })
  })
})

describe('AC-010.16 첫 읽기 중 저장', () => {
  it('AC-010.16: 첫 읽기 중 저장이 끝나면 잠근 채 다시 읽고, 방금 저장한 값이 남으며 다음 저장에 다시 가지 않는다', async () => {
    const saving = deferred<void>()
    const { unmount } = await open()
    save.mockReturnValueOnce(saving.promise)
    type('현금수납', '100000')
    await settle(300)
    unmount()
    expect(save).toHaveBeenCalledTimes(1)

    const old = deferred<WorklogSavedDay | null>()
    const fresh = deferred<WorklogSavedDay | null>()
    load.mockReset()
    load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    expect(load).toHaveBeenCalledTimes(1)
    expect(cell('현금수납').value).toBe('100,000원')
    expectLocked()

    await act(async () => saving.resolve())
    await act(async () => old.resolve(null))

    expect(load).toHaveBeenCalledTimes(2)
    expectLocked()
    expect(cell('현금수납').value).toBe('100,000원')

    await act(async () => fresh.resolve(saved({ cashIn: '100000' })))

    expectOpen()
    expect(cell('현금수납').value).toBe('100,000원')

    type('카드수납', '200000')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(client, TODAY, { cardIn: '200000' })
  })
})

// ── 비트에서 채우기 (worklog REQ-017, design.md 20-1·20-4·20-5절, 시안 docs/mockups/worklog/bitfill.html v2) ─────────────
// 통로·저장소는 가짜이고 자동 저장 제어·맞추기는 진짜다. revenue.days 답은 둥근 가짜 숫자다
const MINUTE = 60_000
const mergeBitSpy = vi.mocked(mergeBit)
const LEGEND = '표시한 칸은 비트에서 불러온 숫자예요'
const DIFFERS_TITLE = '비트 숫자와 다른 칸이 있어요'
const NOTICE = {
  notConnected: '비트 PC가 연결되지 않아 직접 적어요',
  setup: '비트 PC 연결을 마치면 숫자를 저절로 채워요',
  reading: '비트 숫자를 불러오는 중이에요',
  failed: '비트 숫자를 불러오지 못했어요. 직접 적어도 돼요',
  unconfirmed: '이 날은 비트 금액 확인이 필요해요. 금액은 직접 적어 주세요',
}
// revenueRow(TODAY)로 채우는 여덟 칸(design.md 20-2절 표)
const FILLED: Partial<WorklogDay> = {
  newPatients: '12',
  returnPatients: '48',
  totalFee: '1000000',
  claimAmount: '600000',
  cashIn: '100000',
  cardIn: '300000',
  transferIn: '50000',
  unpaidPaid: '10000',
}

const revenueRow = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow => ({
  date,
  visits: 60,
  newPatients: 12,
  returnVisits: 48,
  total: 1000000,
  insurer: 600000,
  noncovered: 200000,
  copay: 100000,
  otherTotal: 100000,
  cash: 100000,
  card: 300000,
  transfer: 50000,
  receivableIn: 10000,
  unconfirmed: false,
  splitUnconfirmed: false,
  ...over,
})
const bitAnswer = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDaysResult => ({ days: [revenueRow(date, over)], codes: [] })
const UNCONFIRMED: Partial<RevenueDayRow> = {
  unconfirmed: true,
  total: null,
  insurer: null,
  noncovered: null,
  copay: null,
  otherTotal: null,
  cash: null,
  card: null,
  transfer: null,
  receivableIn: null,
}
const bridgeError = (code: string) => Object.assign(new Error(code), { code })

// 비트 PC가 연결된 의원 PC. 답은 차례로 돌려준다
function connect(...answers: RevenueDaysResult[]) {
  bridge.state = 'ready'
  for (const answer of answers) bridge.call.mockResolvedValueOnce(answer)
}

// 저장한 값을 다시 읽으면 돌려주는 가짜 서버(다시 읽기가 빈 줄로 칸을 지우지 않게). bit_fields는 목록을 받았을 때만 바꾼다
function fakeServer(rows: Record<string, { cells?: Partial<WorklogDay>; bitFields?: WorklogNumberKey[] }>) {
  const db = new Map<string, WorklogSavedDay>(
    Object.entries(rows).map(([ymd, row]) => [ymd, { day: dayWith(row.cells), bitFields: [...(row.bitFields ?? [])] }]),
  )
  load.mockImplementation(async (_client, ymd) => {
    const row = db.get(ymd)
    return row ? { day: { ...row.day }, bitFields: [...row.bitFields] } : null
  })
  save.mockImplementation(async (_client, ymd, changes, bitFields) => {
    const row = db.get(ymd) ?? { day: emptyWorklogDay(), bitFields: [] }
    db.set(ymd, { day: { ...row.day, ...changes }, bitFields: bitFields ? [...bitFields] : row.bitFields })
  })
  return db
}

async function openScreen() {
  const view = render(<WorklogScreen initialToday={TODAY} />)
  await settle()
  return view
}

const tdOf = (label: string) => cell(label).closest('td') as HTMLTableCellElement
const marked = (label: string) => tdOf(label).classList.contains(s.bit)
const rowTexts = () => screen.queryAllByRole('listitem').map((item) => item.firstElementChild?.textContent)
const hiddenInPrint = (el: Element) => el.closest('[class~="print:hidden"]') !== null
const loadButton = () => screen.queryByRole<HTMLButtonElement>('button', { name: /지금 불러오기|불러오는 중/ })
const sheetTable = () => screen.getByRole('table', { name: '업무일지' })
const follows = (first: Element, second: Element) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('AC-017.1 비트 PC에서 열면 채우기', () => {
  it('AC-017.1: 연결된 PC에서 날짜를 열면 그날 비트 숫자로 빈 칸을 채우고, 바뀐 칸과 비트 칸 목록을 자동 저장한다(단추를 누르지 않아도 된다)', async () => {
    connect(bitAnswer(TODAY))
    fakeServer({ [TODAY]: { cells: { spendCash: '20000' } } })
    await openScreen()

    expect(bridge.call).toHaveBeenCalledTimes(1)
    expect(bridge.call).toHaveBeenCalledWith('revenue.days', { from: TODAY, to: TODAY })
    expect(cell('신환').value).toBe('12')
    expect(cell('재진').value).toBe('48')
    expect(cell('총진료비').value).toBe('1,000,000원')
    expect(cell('조합청구액').value).toBe('600,000원')
    expect(cell('현금수납').value).toBe('100,000원')
    expect(cell('카드수납').value).toBe('300,000원')
    expect(cell('계좌이체').value).toBe('50,000원')
    expect(cell('미수입금').value).toBe('10,000원')
    expect(cell('지역화폐').value).toBe('')
    expect(cell('미수발생').value).toBe('')
    expect(received()).toBe('450,000원')
    expect(save).not.toHaveBeenCalled()

    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    const [, ymd, changes, fields] = save.mock.calls[0]
    expect(ymd).toBe(TODAY)
    expect(changes).toEqual(FILLED)
    expect([...(fields ?? [])].sort()).toEqual([...BIT_FILL_KEYS].sort())
    expect(statusText()).toContain('저장했어요')
  })

  it('AC-017.1: 오늘은 보이는 동안 10분마다 다시 읽어 비트 칸이 따라가고, 바뀐 칸만 저장한다(목록이 그대로면 목록은 보내지 않는다)', async () => {
    connect(bitAnswer(TODAY), bitAnswer(TODAY, { newPatients: 13, cash: 130000 }))
    fakeServer({})
    await openScreen()
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    save.mockClear()

    await settle(10 * MINUTE - 800)
    expect(bridge.call).toHaveBeenCalledTimes(2)
    expect(cell('신환').value).toBe('13')
    expect(cell('현금수납').value).toBe('130,000원')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { newPatients: '13', cashIn: '130000' })
  })

  it('AC-017.1: 치기 전 초점 칸도 비트 숫자로 맞춰 보이고, 친 칸은 다음 읽기에서 바꾸지 않고 다름으로 알린다', async () => {
    bridge.state = 'ready'
    const first = deferred<RevenueDaysResult>()
    bridge.call.mockReturnValueOnce(first.promise).mockResolvedValueOnce(bitAnswer(TODAY, { cash: 130000 }))
    fakeServer({})
    await openScreen()

    focusOn(cell('현금수납'))
    await act(async () => first.resolve(bitAnswer(TODAY)))
    expect(cell('현금수납').value).toBe('100,000')
    type('현금수납', '90000')
    blurFrom(cell('현금수납'))
    expect(marked('현금수납')).toBe(false)

    await settle(10 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(2)
    expect(cell('현금수납').value).toBe('90,000원')
    expect(rowTexts()).toEqual(['현금수납 · 적은 값 90,000원 · 비트 130,000원'])
  })
})

describe('AC-017.2 비트 칸 표시', () => {
  it('AC-017.2: 비트 칸에는 표시가 있고 양식 아래 "표시한 칸은 비트에서 불러온 숫자예요"이며, 손으로 적은 칸·비트에 없는 칸에는 표시가 없다. 인쇄에서는 숨는다', async () => {
    connect(bitAnswer(TODAY))
    fakeServer({ [TODAY]: { cells: { cashIn: '90000' } } })
    await openScreen()

    for (const label of ['신환', '재진', '총진료비', '조합청구액', '카드수납', '계좌이체', '미수입금']) expect(marked(label), label).toBe(true)
    for (const label of ['현금수납', '지역화폐', '미수발생', '지출 현금 금액']) expect(marked(label), label).toBe(false)
    const legend = screen.getByText(LEGEND)
    expect(hiddenInPrint(legend)).toBe(true)
    expect(follows(sheetTable(), legend)).toBe(true)
    expect(cell('카드수납').getAttribute('aria-describedby')).toBe(legend.closest('[id]')?.id)
  })

  it('AC-017.2: 비트 칸이 없는 날에는 설명 줄이 없다', async () => {
    await open({ cashIn: '100000' })
    expect(screen.queryByText(LEGEND)).toBeNull()
    expect(marked('현금수납')).toBe(false)
  })
})

describe('AC-017.3 비트 숫자와 다른 칸', () => {
  it('AC-017.3: 손으로 적은 칸이 비트와 다르면 덮지 않고 목록에 보이며, [비트 숫자로 바꾸기]를 누를 때만 그 칸을 바꾼다', async () => {
    connect(bitAnswer(TODAY, { cash: 125000 }))
    fakeServer({ [TODAY]: { cells: { newPatients: '11', cashIn: '120,000 별도' } } })
    await openScreen()

    expect(cell('신환').value).toBe('11')
    expect(cell('현금수납').value).toBe('120,000 별도')
    expect(screen.getByText(DIFFERS_TITLE)).toBeTruthy()
    expect(rowTexts()).toEqual(['신환 · 적은 값 11 · 비트 12', '현금수납 · 적은 값 120,000 별도 · 비트 125,000원'])
    await settle(800)
    expect(save.mock.calls[0][2]).not.toHaveProperty('cashIn')
    expect(save.mock.calls[0][2]).not.toHaveProperty('newPatients')
    save.mockClear()

    fireEvent.click(button('현금수납 칸을 비트 숫자로 바꾸기'))
    expect(cell('현금수납').value).toBe('125,000원')
    expect(marked('현금수납')).toBe(true)
    expect(rowTexts()).toEqual(['신환 · 적은 값 11 · 비트 12'])
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    const [, , changes, fields] = save.mock.calls[0]
    expect(changes).toEqual({ cashIn: '125000' })
    expect(fields).toContain('cashIn')
    expect(fields).not.toContain('newPatients')
  })

  it('AC-017.3: 항목 이름을 고친 칸에도 비트 숫자가 채워지고(칸 위치로 채움), 다름 목록에는 그날 이름이 보인다', async () => {
    connect(bitAnswer(TODAY, { cash: 125000 }))
    fakeServer({ [TODAY]: { cells: { nameCardIn: '가상 카드', nameCashIn: '가상 현금', cashIn: '120000' } } })
    await openScreen()

    expect(cell('카드수납').value).toBe('300,000원')
    expect(marked('카드수납')).toBe(true)
    expect(rowTexts()).toEqual(['가상 현금 · 적은 값 120,000원 · 비트 125,000원'])
    expect(button('가상 현금 칸을 비트 숫자로 바꾸기')).toBeTruthy()
  })

  it('AC-017.3: 적은 숫자가 비트 숫자와 같으면 목록에 없다', async () => {
    connect(bitAnswer(TODAY))
    fakeServer({ [TODAY]: { cells: { cashIn: '100,000원' } } })
    await openScreen()
    expect(screen.queryByText(DIFFERS_TITLE)).toBeNull()
    expect(marked('현금수납')).toBe(false)
  })
})

describe('AC-017.4 비트를 못 읽을 때', () => {
  it.each([
    ['busy', null, NOTICE.notConnected, false],
    ['disconnected', null, NOTICE.notConnected, false],
    ['no-extension', null, NOTICE.setup, true],
    ['no-helper', null, NOTICE.setup, true],
    ['update-helper', null, NOTICE.setup, true],
    ['update-extension', null, NOTICE.setup, true],
    ['connecting', 'E-BRIDGE-BAD-REPLY', NOTICE.setup, true],
  ] as const)(
    'AC-017.4·AC-017.9: useBridge %s(helloError %s)면 안내 한 줄 "%s"만 보이고 [지금 불러오기]가 없으며, 칸은 손으로 적어 저장한다',
    async (state, helloError, text, link) => {
      bridge.state = state
      bridge.helloError = helloError
      await open({ memo: '가상 업무 글' })

      expect(screen.getByText(text)).toBeTruthy()
      expect(screen.queryByRole('link', { name: '연결하러 가기' })?.getAttribute('href') ?? null).toBe(link ? '/claim/setup' : null)
      expect(loadButton()).toBeNull()
      expect(cardCodes()).toEqual([])
      expectOpen()
      type('현금수납', '100000')
      await settle(800)
      expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '100000' })
      expect(bridge.call).not.toHaveBeenCalled()
    },
  )

  it('AC-017.4·AC-017.8: 비트 읽기가 실패하면 "비트 숫자를 불러오지 못했어요. 직접 적어도 돼요"와 [지금 불러오기]이고, 칸을 채우거나 저장하지 않으며 막지 않는다', async () => {
    bridge.state = 'ready'
    bridge.call.mockRejectedValueOnce(bridgeError('E-BIT-READ-FAILED'))
    await open({ memo: '가상 업무 글' })

    expect(screen.getByText(NOTICE.failed)).toBeTruthy()
    expect(button('지금 불러오기')).toBeTruthy()
    expect(cardCodes()).toEqual([])
    expect(cell('현금수납').value).toBe('')
    await settle(5000)
    expect(save).not.toHaveBeenCalled()
    expectOpen()
  })

  it('AC-017.4: 통로 오류 E-HELPER-UNKNOWN-COMMAND(도우미 옛 판)는 읽기 실패가 아니라 "연결을 마치면" 안내와 링크이고 단추가 없다', async () => {
    bridge.state = 'ready'
    bridge.call.mockRejectedValueOnce(bridgeError('E-HELPER-UNKNOWN-COMMAND'))
    await open()
    expect(screen.getByText(NOTICE.setup)).toBeTruthy()
    expect(screen.queryByText(NOTICE.failed)).toBeNull()
    expect(screen.getByRole('link', { name: '연결하러 가기' }).getAttribute('href')).toBe('/claim/setup')
    expect(loadButton()).toBeNull()
  })

  it('AC-017.4·AC-017.9: 금액 확인이 필요한 날은 금액 칸을 비우고 신환·재진만 채우며, 그 안내와 [지금 불러오기]가 함께 있다', async () => {
    connect({ days: [revenueRow(TODAY, UNCONFIRMED)], codes: [] })
    fakeServer({})
    await openScreen()

    expect(screen.getByText(NOTICE.unconfirmed)).toBeTruthy()
    expect(button('지금 불러오기')).toBeTruthy()
    expect(cell('신환').value).toBe('12')
    expect(cell('재진').value).toBe('48')
    for (const label of ['총진료비', '조합청구액', '현금수납', '카드수납', '계좌이체', '미수입금']) expect(cell(label).value, label).toBe('')
    await settle(800)
    expect(save).toHaveBeenCalledWith(client, TODAY, { newPatients: '12', returnPatients: '48' }, ['newPatients', 'returnPatients'])
  })
})

describe('AC-017.5 휴대폰·다른 PC', () => {
  it('AC-017.5·AC-017.9: 터치 기기는 비트를 읽지 않고 비트 안내 줄·[지금 불러오기]가 없으며, "휴대폰에서는 보기만 할 수 있어요"와 저장된 표시·설명 줄만 보인다', async () => {
    media.touch = true
    bridge.state = 'ready'
    bridge.call.mockResolvedValue(bitAnswer(TODAY))
    fakeServer({ [TODAY]: { cells: { newPatients: '12', cashIn: '100000' }, bitFields: ['newPatients', 'cashIn'] } })
    await openScreen()
    await settle(30 * MINUTE)

    expect(bridge.call).not.toHaveBeenCalled()
    expect(statusText()).toBe('휴대폰에서는 보기만 할 수 있어요')
    for (const text of Object.values(NOTICE)) expect(screen.queryByText(text), text).toBeNull()
    expect(screen.queryByText(/에 불러왔어요$/)).toBeNull()
    expect(loadButton()).toBeNull()
    expect(marked('신환')).toBe(true)
    expect(marked('현금수납')).toBe(true)
    expect(marked('카드수납')).toBe(false)
    expect(screen.getByText(LEGEND)).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-017.5: 연결 안 된 다른 PC도 저장된 표시를 그대로 보이고 비트를 읽지 않는다', async () => {
    fakeServer({ [TODAY]: { cells: { cashIn: '100000' }, bitFields: ['cashIn'] } })
    await openScreen()
    expect(screen.getByText(NOTICE.notConnected)).toBeTruthy()
    expect(marked('현금수납')).toBe(true)
    expect(screen.getByText(LEGEND)).toBeTruthy()
    expect(bridge.call).not.toHaveBeenCalled()
  })
})

describe('AC-017.6 오가는 것', () => {
  it('AC-017.6: 비트 때문에 나가는 저장에는 채운 칸의 숫자 글자와 비트 칸 목록뿐이고, 업무사항·항목 이름·지출·비고는 가지 않는다', async () => {
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) => vi.spyOn(console, name))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    connect(bitAnswer(TODAY))
    fakeServer({ [TODAY]: { cells: { memo: '가상 업무 글', nameCashIn: '가상 현금', spendCash: '20000', noteCash: '가상 비고' } } })
    await openScreen()
    await settle(800)

    expect(save).toHaveBeenCalledTimes(1)
    const [, , changes, fields] = save.mock.calls[0]
    for (const [key, value] of Object.entries(changes)) {
      expect(BIT_FILL_KEYS, key).toContain(key)
      expect(value, key).toMatch(/^\d+$/)
    }
    for (const key of fields ?? []) expect(BIT_FILL_KEYS, key).toContain(key)
    expect(bridge.call.mock.calls.every(([cmd]) => cmd === 'revenue.days')).toBe(true)
    for (const spy of consoles) expect(spy).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('AC-017.7 표시를 지우지 않는다', () => {
  it('AC-017.7: 표시가 저장된 날을 연결 안 된 PC에서 비트 칸 밖 칸을 고치면 저장에 비트 칸 목록이 없다', async () => {
    const db = fakeServer({ [TODAY]: { cells: { cashIn: '100000' }, bitFields: ['cashIn'] } })
    await openScreen()
    type('지출 현금 금액', '20000')
    await settle(800)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { spendCash: '20000' })
    expect(save.mock.calls[0]).toHaveLength(3)
    expect(db.get(TODAY)?.bitFields).toEqual(['cashIn'])
    expect(marked('현금수납')).toBe(true)
  })

  it('AC-017.7: 비트 칸을 손으로 고치면 그 칸 표시가 사라지고 줄어든 목록을 보낸다', async () => {
    fakeServer({ [TODAY]: { cells: { newPatients: '12', cashIn: '100000' }, bitFields: ['newPatients', 'cashIn'] } })
    await openScreen()
    type('현금수납', '120000')
    expect(marked('현금수납')).toBe(false)
    expect(marked('신환')).toBe(true)
    await settle(800)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '120000' }, ['newPatients'])
  })

  it('AC-017.7: 앱 안 이동(화면이 내려감) 뒤 바로 저장해도 표시를 지우지 않고, 돌아오면 표시가 그대로다', async () => {
    const db = fakeServer({ [TODAY]: { cells: { cashIn: '100000' }, bitFields: ['cashIn'] } })
    const view = await openScreen()
    type('지출 현금 금액', '20000')
    view.unmount()
    await settle()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]).toHaveLength(3)
    expect(db.get(TODAY)?.bitFields).toEqual(['cashIn'])
    await openScreen()
    expect(marked('현금수납')).toBe(true)
    expect(cell('지출 현금 금액').value).toBe('20,000원')
  })

  it('AC-017.7: 다시 읽은 비트 칸 목록이 표시로 보이고, 저장 안 된 목록은 그대로다', async () => {
    const db = fakeServer({ [TODAY]: { cells: { cashIn: '100000', cardIn: '200000' } } })
    await openScreen()
    expect(marked('현금수납')).toBe(false)

    db.set(TODAY, { day: dayWith({ cashIn: '100000', cardIn: '200000' }), bitFields: ['cashIn', 'cardIn'] }) // 비트 PC가 저장했다
    await settle(60_000)
    expect(marked('현금수납')).toBe(true)
    expect(marked('카드수납')).toBe(true)

    type('카드수납', '250000')
    setVisibility('visible') // 저장 전에 다시 읽기
    await settle()
    expect(marked('카드수납')).toBe(false)
    expect(marked('현금수납')).toBe(true)
  })
})

describe('AC-017.8 합치는 때', () => {
  it('AC-017.8: 비트 답이 첫 읽기보다 먼저 오면 그때는 합치거나 저장하지 않고, 읽기가 끝난 뒤 합친다(서버 값이 있는 칸은 다름으로 남는다)', async () => {
    connect(bitAnswer(TODAY, { cash: 125000 }))
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    await settle(5000)

    expect(bridge.call).toHaveBeenCalledTimes(1)
    expect(mergeBitSpy).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(cell('현금수납').value).toBe('')

    await act(async () => reply.resolve(saved({ cashIn: '120000' })))
    expect(cell('현금수납').value).toBe('120,000원')
    expect(cell('카드수납').value).toBe('300,000원')
    expect(rowTexts()).toEqual(['현금수납 · 적은 값 120,000원 · 비트 125,000원'])
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][2]).not.toHaveProperty('cashIn')
    expect(save.mock.calls[0][2]).toHaveProperty('cardIn', '300000')
  })

  it('AC-017.8: 불러오기에 실패한 날은 합치지 않고 저장하지 않으며, [다시 불러오기]로 열리면 그때 합친다', async () => {
    connect(bitAnswer(TODAY))
    load.mockRejectedValueOnce(new WorklogStorageError('failed'))
    render(<WorklogScreen initialToday={TODAY} />)
    await settle(5000)

    expect(cardCodes()).toEqual(['E-WORKLOG-LOAD-FAILED'])
    expect(mergeBitSpy).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(cell('현금수납').value).toBe('')

    load.mockResolvedValueOnce(saved({}))
    fireEvent.click(button('다시 불러오기'))
    await settle()
    expect(cell('현금수납').value).toBe('100,000원')
    expect(marked('현금수납')).toBe(true)
  })

  it('AC-017.8: 날짜를 옮긴 뒤 온 옛 날짜 답은 버린다', async () => {
    bridge.state = 'ready'
    const old = deferred<RevenueDaysResult>()
    bridge.call.mockReturnValueOnce(old.promise).mockResolvedValueOnce(bitAnswer(PAST, { cash: 70000 }))
    fakeServer({})
    await openScreen()
    fireEvent.click(button('전날'))
    await settle()

    expect(bridge.call).toHaveBeenLastCalledWith('revenue.days', { from: PAST, to: PAST })
    expect(cell('현금수납').value).toBe('70,000원')
    await act(async () => old.resolve(bitAnswer(TODAY, { cash: 990000 })))
    await settle()
    expect(cell('현금수납').value).toBe('70,000원')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][1]).toBe(PAST)
  })
})

describe('AC-017.9 [지금 불러오기]', () => {
  it('AC-017.9: 읽기에 성공하면 날짜 줄 아래 "비트 숫자를 14:20에 불러왔어요"와 [지금 불러오기]이고, 누르면 같은 { from, to }로 바로 다시 읽어 바뀐 칸만 저장한다', async () => {
    vi.setSystemTime(new Date('2026-10-28T05:20:00Z')) // 한국 시각 14:20
    connect(bitAnswer(TODAY))
    fakeServer({})
    await openScreen()
    await settle(800)
    const line = screen.getByText('비트 숫자를 14:20에 불러왔어요')
    expect(follows(screen.getByLabelText('날짜 고르기'), line)).toBe(true)
    expect(follows(line, sheetTable())).toBe(true)
    save.mockClear()

    await settle(5 * MINUTE - 800)
    const again = deferred<RevenueDaysResult>()
    bridge.call.mockReturnValueOnce(again.promise)
    fireEvent.click(button('지금 불러오기'))

    expect(bridge.call).toHaveBeenCalledTimes(2)
    expect(bridge.call).toHaveBeenLastCalledWith('revenue.days', { from: TODAY, to: TODAY })
    const busy = button('불러오는 중') as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(screen.getByText(NOTICE.reading)).toBeTruthy()
    fireEvent.click(busy)
    expect(bridge.call).toHaveBeenCalledTimes(2)

    await act(async () => again.resolve(bitAnswer(TODAY, { card: 320000 })))
    expect(screen.getByText('비트 숫자를 14:25에 불러왔어요')).toBeTruthy()
    expect(cell('카드수납').value).toBe('320,000원')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cardIn: '320000' })
  })

  it('AC-017.9: 오늘은 누른 때부터 10분 뒤에 다음 읽기이고, 누르기 전 타이머로는 읽지 않는다', async () => {
    bridge.state = 'ready'
    bridge.call.mockResolvedValue(bitAnswer(TODAY))
    fakeServer({})
    await openScreen()
    await settle(4 * MINUTE)
    fireEvent.click(button('지금 불러오기'))
    await settle()
    expect(bridge.call).toHaveBeenCalledTimes(2)

    await settle(6 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(2)
    await settle(4 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(3)
  })

  it('AC-017.9: 읽기 실패한 날에 누른 읽기가 성공하면 실패 안내가 사라지고 시각 줄이 되며 칸을 채운다', async () => {
    bridge.state = 'ready'
    bridge.call.mockRejectedValueOnce(bridgeError('E-BIT-READ-FAILED')).mockResolvedValueOnce(bitAnswer(TODAY))
    fakeServer({})
    await openScreen()
    expect(screen.getByText(NOTICE.failed)).toBeTruthy()

    fireEvent.click(button('지금 불러오기'))
    await settle()
    expect(screen.queryByText(NOTICE.failed)).toBeNull()
    expect(screen.getByText('비트 숫자를 12:00에 불러왔어요')).toBeTruthy()
    expect(cell('현금수납').value).toBe('100,000원')
  })

  it('AC-017.9·AC-017.8: 첫 읽기가 끝나기 전에 누른 답은 그때 저장하지 않고, 읽기가 끝난 뒤 그 답으로 합친다', async () => {
    connect(bitAnswer(TODAY), bitAnswer(TODAY, { cash: 140000 }))
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    fireEvent.click(button('지금 불러오기'))
    await settle(5000)

    expect(bridge.call).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
    expect(cell('현금수납').value).toBe('')

    await act(async () => reply.resolve(saved({})))
    expect(cell('현금수납').value).toBe('140,000원')
    await settle(800)
    expect(save.mock.calls[0][2]).toHaveProperty('cashIn', '140000')
  })

  it('AC-017.9·AC-017.8: 불러오기 실패한 날에 눌러도 합치지 않고 저장하지 않는다', async () => {
    bridge.state = 'ready'
    bridge.call.mockResolvedValue(bitAnswer(TODAY))
    load.mockRejectedValueOnce(new WorklogStorageError('failed'))
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    fireEvent.click(button('지금 불러오기'))
    await settle(5000)

    expect(bridge.call).toHaveBeenCalledTimes(2)
    expect(mergeBitSpy).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(cell('현금수납').value).toBe('')
  })

  it('AC-017.9: 연결 중(connecting)이면 "비트 숫자를 불러오는 중이에요"와 눌리지 않는 "불러오는 중"이고 읽지 않는다', async () => {
    bridge.state = 'connecting'
    await open()
    expect(screen.getByText(NOTICE.reading)).toBeTruthy()
    const busy = button('불러오는 중') as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-017.9·AC-011.3: 날짜 줄 아래 줄·설명 줄·다름 목록(단추 포함)은 모두 인쇄에서 숨는다', async () => {
    connect(bitAnswer(TODAY, { cash: 125000 }))
    fakeServer({ [TODAY]: { cells: { cashIn: '120000' } } })
    await openScreen()

    for (const el of [
      screen.getByText(/^비트 숫자를 \d\d:\d\d에 불러왔어요$/),
      button('지금 불러오기'),
      screen.getByText(LEGEND),
      screen.getByText(DIFFERS_TITLE),
      button('현금수납 칸을 비트 숫자로 바꾸기'),
    ]) {
      expect(hiddenInPrint(el), el.textContent ?? '').toBe(true)
    }
    expect(follows(sheetTable(), screen.getByText(DIFFERS_TITLE))).toBe(true)
    expect(hiddenInPrint(sheetTable())).toBe(false)
  })
})

// ── 업무사항 글씨 크기(worklog-memo-font REQ-1508, design.md '화면 잇기'). 양식은 진짜 WorklogSheet이고,
// jsdom은 크기를 재지 않아 업무사항 textarea의 글 높이(scrollHeight)·칸 높이(clientHeight)만 시험이 정한다
const TWO_AGO = '2026-10-26'
const CUT = '업무사항 글이 칸보다 길어서 인쇄하면 아랫부분이 잘려요. 글씨를 줄이면 다 들어갈 수 있어요.'
const fontGroup = () => screen.queryByRole('group', { name: '업무사항 글씨 크기' })
const fontShown = () => within(screen.getByRole('group', { name: '업무사항 글씨 크기' })).getByRole('status').textContent
const memoPt = () => tdOf('업무사항').style.getPropertyValue('--memo-pt')
const bigger = () => button('업무사항 글씨 크게') as HTMLButtonElement
const smaller = () => button('업무사항 글씨 작게') as HTMLButtonElement
const withFont = (memoFontPt: MemoFontPt, cells: Partial<WorklogDay> = {}): WorklogSavedDay => ({ ...saved(cells), memoFontPt })

// 업무사항 칸의 크기를 정한다. 값은 box를 바꾸면 따라 바뀐다
function memoSize(box: { scroll: number; client: number }) {
  const el = cell('업무사항')
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => box.scroll })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => box.client })
}
// 창 크기가 바뀌면 양식이 다시 잰다
const remeasure = () =>
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })

// 크기를 든 가짜 서버. 저장은 바뀐 칸과, 받았을 때만 목록·크기를 그 줄에 넣는다
function fontServer(rows: Record<string, { cells?: Partial<WorklogDay>; bitFields?: WorklogNumberKey[]; memoFontPt?: MemoFontPt }>) {
  const db = new Map<string, Required<Omit<WorklogSavedDay, 'cash'>>>(
    Object.entries(rows).map(([ymd, row]): [string, Required<Omit<WorklogSavedDay, 'cash'>>] => [
      ymd,
      { day: dayWith(row.cells), bitFields: [...(row.bitFields ?? [])], memoFontPt: row.memoFontPt ?? 11 },
    ]),
  )
  load.mockImplementation(async (_client, ymd) => {
    const row = db.get(ymd)
    return row ? { day: { ...row.day }, bitFields: [...row.bitFields], memoFontPt: row.memoFontPt } : null
  })
  save.mockImplementation(async (_client, ymd, changes, bitFields, memoFontPt) => {
    const row: Required<Omit<WorklogSavedDay, 'cash'>> = db.get(ymd) ?? { day: emptyWorklogDay(), bitFields: [], memoFontPt: 11 }
    db.set(ymd, {
      day: { ...row.day, ...changes },
      bitFields: bitFields ? [...bitFields] : row.bitFields,
      memoFontPt: memoFontPt ?? row.memoFontPt,
    })
  })
  return db
}

describe('AC-1508.1 그날 크기로 열기', () => {
  it('AC-1508.1: 서버에 14가 저장된 날은 읽기가 끝나면 업무사항 칸 --memo-pt와 날짜 줄 숫자가 14다(읽는 동안은 11)', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    expect(memoPt()).toBe('11')
    expect(fontShown()).toBe('11')

    await act(async () => reply.resolve(withFont(14, { memo: '가상 업무 글' })))

    expect(memoPt()).toBe('14')
    expect(fontShown()).toBe('14')
    expect(cell('업무사항').value).toBe('가상 업무 글')
  })

  it.each([
    ['줄이 없는 날', null],
    ['memoFontPt가 없는 응답', saved({ memo: '가상 업무 글' })],
  ])('AC-1508.1: %s은 11이다', async (_name, reply) => {
    load.mockResolvedValueOnce(reply)
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    expectOpen()
    expect(memoPt()).toBe('11')
    expect(fontShown()).toBe('11')
  })

  it('AC-1508.1: 전날이 14여도 처음 여는 다음 날은 11이다(이어받지 않는다)', async () => {
    fontServer({ [TWO_AGO]: { memoFontPt: 14 } })
    await openScreen()
    fireEvent.change(dateInput(), { target: { value: TWO_AGO } })
    await settle()
    expect(fontShown()).toBe('14')

    fireEvent.click(button('다음 날'))
    await settle()
    expect(dateInput().value).toBe(PAST)
    expect(fontShown()).toBe('11')
    expect(memoPt()).toBe('11')
  })
})

describe('AC-1508.2 [가−]·[가+]', () => {
  it('AC-1508.2: [가+]를 누르면 화면이 바로 12가 되고 changeMemoFont(그날, 12)가 한 번 불리며, saveWorklogDay(클라이언트, 그날, {}, undefined, 12)로 저장하고 상태 글은 다른 칸과 같다', async () => {
    const changeMemoFont = vi.spyOn(worklogAutosave(), 'changeMemoFont')
    await open({ memo: '가상 업무 글' })

    fireEvent.click(bigger())

    expect(fontShown()).toBe('12')
    expect(memoPt()).toBe('12')
    expect(changeMemoFont).toHaveBeenCalledTimes(1)
    expect(changeMemoFont).toHaveBeenCalledWith(TODAY, 12)
    expect(statusText()).toBe('저장하는 중이에요')
    expect(save).not.toHaveBeenCalled()

    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, {}, undefined, 12)
    expect(statusText()).toBe('저장했어요 · 12:00')
  })

  it('AC-1508.2: [가−]는 한 칸 작게(11 → 10) 바꾸고 칸 고치기와 함께면 한 번에 저장한다', async () => {
    await open()
    fireEvent.click(smaller())
    type('현금수납', '100000')
    expect(fontShown()).toBe('10')
    expect(memoPt()).toBe('10')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, { cashIn: '100000' }, undefined, 10)
  })

  it.each([
    ['불러오는 중', () => load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)],
    ['불러오기 실패', () => load.mockRejectedValueOnce(new WorklogStorageError('failed'))],
  ])('AC-1508.2: %s인 날은 두 단추가 눌리지 않고 눌러도 아무 일이 없다(숫자는 보인다)', async (_name, arrange) => {
    arrange()
    const changeMemoFont = vi.spyOn(worklogAutosave(), 'changeMemoFont')
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()

    expect(bigger().disabled).toBe(true)
    expect(smaller().disabled).toBe(true)
    fireEvent.click(bigger())
    fireEvent.click(smaller())
    expect(fontShown()).toBe('11')
    expect(memoPt()).toBe('11')
    expect(changeMemoFont).not.toHaveBeenCalled()
    await settle(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it.each([
    [16, '크게', '작게'],
    [8, '작게', '크게'],
  ] as const)('AC-1508.2: 끝 크기 %i에서는 [가%s]가 눌리지 않고 눌러도 아무 일이 없다', async (pt, end, other) => {
    load.mockResolvedValueOnce(withFont(pt))
    const changeMemoFont = vi.spyOn(worklogAutosave(), 'changeMemoFont')
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()

    const stuck = button(`업무사항 글씨 ${end}`) as HTMLButtonElement
    expect(stuck.disabled).toBe(true)
    expect((button(`업무사항 글씨 ${other}`) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(stuck)
    expect(fontShown()).toBe(String(pt))
    expect(changeMemoFont).not.toHaveBeenCalled()
    await settle(5000)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('AC-1508.3 날짜 옮김·앱 안 이동', () => {
  it('AC-1508.3: 크기를 바꾼 날은 다른 날로 옮겼다 돌아와도 저장 안 된 크기가 보이고, 옮겨 간 날은 그날 크기다', async () => {
    fontServer({ [PAST]: { memoFontPt: 16 } })
    save.mockReturnValue(deferred<void>().promise) // 저장이 끝나지 않는다
    await openScreen()
    fireEvent.click(bigger())
    expect(fontShown()).toBe('12')

    fireEvent.click(button('전날'))
    await settle()
    expect(fontShown()).toBe('16')
    expect(memoPt()).toBe('16')

    fireEvent.click(button('다음 날'))
    await settle()
    expect(fontShown()).toBe('12')
    expect(memoPt()).toBe('12')
  })

  it('AC-1508.3: 앱 안 다른 탭에 갔다 오면 저장 안 된 크기가 읽기 전부터 보인다', async () => {
    save.mockReturnValue(deferred<void>().promise)
    const { unmount } = await open()
    fireEvent.click(bigger())
    fireEvent.click(bigger())
    expect(fontShown()).toBe('14')

    unmount()
    expect(save).toHaveBeenCalledWith(client, TODAY, {}, undefined, 14)

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    expect(fontShown()).toBe('14')
    expect(memoPt()).toBe('14')
    await act(async () => reply.resolve(null))
    expect(fontShown()).toBe('14')
  })
})

describe('AC-1508.4 다시 읽기', () => {
  it('AC-1508.4: 다른 PC가 바꾼 크기는 60초 다시 읽기에 반영되고, 다시 읽기만으로는 저장하지 않는다', async () => {
    const db = fontServer({ [TODAY]: { cells: { memo: '가상 업무 글' } } })
    await openScreen()
    expect(fontShown()).toBe('11')

    db.set(TODAY, { ...db.get(TODAY)!, memoFontPt: 16 })
    await settle(60_000)

    expect(fontShown()).toBe('16')
    expect(memoPt()).toBe('16')
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-1508.4: 이 화면에 저장 안 된 크기가 있으면 다시 읽어도 그대로이고, 그 크기가 저장된다', async () => {
    const db = fontServer({ [TODAY]: {} })
    await openScreen()
    fireEvent.click(bigger())
    db.set(TODAY, { ...db.get(TODAY)!, memoFontPt: 16 })

    setVisibility('visible')
    await settle()
    expect(load).toHaveBeenCalledTimes(2)
    expect(fontShown()).toBe('12')

    await settle(800)
    expect(save).toHaveBeenCalledWith(client, TODAY, {}, undefined, 12)
    expect(fontShown()).toBe('12')
  })
})

describe('AC-1508.5 비트 채우기·칸 고치기는 크기를 두고 보내지 않는다', () => {
  it('AC-1508.5: 크기 14인 날에 비트 숫자가 저절로 채워져도 크기는 14이고, 그 저장에 다섯째 인자가 없다', async () => {
    connect(bitAnswer(TODAY))
    fontServer({ [TODAY]: { cells: { spendCash: '20000' }, memoFontPt: 14 } })
    await openScreen()

    expect(cell('현금수납').value).toBe('100,000원')
    expect(fontShown()).toBe('14')
    expect(memoPt()).toBe('14')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]).toHaveLength(4)
    expect(fontShown()).toBe('14')
  })

  it('AC-1508.5: [비트 숫자로 바꾸기]·[지금 불러오기]·칸 고치기 뒤에도 크기 14 그대로이고, 그 저장들에 다섯째 인자가 없다', async () => {
    connect(bitAnswer(TODAY, { cash: 125000 }), bitAnswer(TODAY, { cash: 125000, card: 320000 }))
    fontServer({ [TODAY]: { cells: { cashIn: '120,000 별도' }, memoFontPt: 14 } })
    await openScreen()
    await settle(800)

    fireEvent.click(button('현금수납 칸을 비트 숫자로 바꾸기'))
    expect(cell('현금수납').value).toBe('125,000원')
    expect(fontShown()).toBe('14')
    await settle(800)

    fireEvent.click(button('지금 불러오기'))
    await settle()
    expect(cell('카드수납').value).toBe('320,000원')
    expect(fontShown()).toBe('14')
    await settle(800)

    type('업무사항', '가상 업무 글')
    type('지출 현금 금액', '30000')
    expect(fontShown()).toBe('14')
    await settle(800)

    expect(memoPt()).toBe('14')
    expect(save).toHaveBeenCalledTimes(4)
    for (const call of save.mock.calls) expect(call.length).toBeLessThan(5)
  })
})

describe('AC-1508.6 터치 기기', () => {
  it('AC-1508.6: 터치 기기는 크기 14로 보이고, 글씨 묶음·잘림 안내가 없으며 저장을 부르지 않는다', async () => {
    media.touch = true
    const changeMemoFont = vi.spyOn(worklogAutosave(), 'changeMemoFont')
    load.mockResolvedValueOnce(withFont(14, { memo: '가상 긴 업무 글' }))
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()

    expect(memoPt()).toBe('14')
    expect(fontGroup()).toBeNull()
    expect(screen.queryByRole('button', { name: /업무사항 글씨/ })).toBeNull()
    memoSize({ scroll: 120, client: 84 })
    remeasure()
    expect(screen.queryByText(CUT)).toBeNull()
    expect(statusText()).toBe('휴대폰에서는 보기만 할 수 있어요')

    await settle(5000)
    expect(changeMemoFont).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
})

describe('AC-1508.7 잘림 안내', () => {
  it('AC-1508.7: 업무사항 글이 칸을 넘으면 잘림 안내가 보이고, 글씨를 줄여 다 들어가면 사라진다', async () => {
    await open({ memo: '가상 긴 업무 글' })
    expect(screen.queryByText(CUT)).toBeNull()
    const box = { scroll: 120, client: 84 }
    memoSize(box)
    remeasure()
    expect(screen.getByText(CUT)).toBeTruthy()

    box.scroll = 80
    fireEvent.click(smaller())
    expect(fontShown()).toBe('10')
    expect(screen.queryByText(CUT)).toBeNull()
  })

  it('AC-1508.7: 글을 지워 다 들어가면 사라진다', async () => {
    await open({ memo: '가상 긴 업무 글' })
    const box = { scroll: 120, client: 84 }
    memoSize(box)
    remeasure()
    expect(screen.getByText(CUT)).toBeTruthy()

    box.scroll = 84
    type('업무사항', '가상')
    expect(screen.queryByText(CUT)).toBeNull()
  })

  it('AC-1508.7: 불러오는 중인 날에는 글이 넘쳐도 안내가 없고, 읽기가 끝나면 보인다', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    memoSize({ scroll: 120, client: 84 })
    remeasure()
    expect(screen.queryByText(CUT)).toBeNull()

    await act(async () => reply.resolve(saved({ memo: '가상 긴 업무 글' })))
    expect(screen.getByText(CUT)).toBeTruthy()
  })

  it('AC-1508.7: 불러오기 실패인 날에는 글이 넘쳐도 안내가 없다', async () => {
    load.mockRejectedValueOnce(new WorklogStorageError('failed'))
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    memoSize({ scroll: 120, client: 84 })
    remeasure()
    expect(cardCodes()).toContain('E-WORKLOG-LOAD-FAILED')
    expect(screen.queryByText(CUT)).toBeNull()
  })
})

describe('AC-1508.9 로그아웃', () => {
  it('AC-1508.9: 로그아웃하면 크기도 지워져 그 뒤 그림은 11이고, 바꾸던 크기를 저장하지 않는다', async () => {
    load.mockResolvedValueOnce(withFont(14, { memo: '가상 업무 글' }))
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    fireEvent.click(bigger())
    expect(fontShown()).toBe('16')

    signOut()

    expect(fontShown()).toBe('11')
    expect(memoPt()).toBe('11')
    await settle(120_000)
    expect(save).not.toHaveBeenCalled()
  })
})
