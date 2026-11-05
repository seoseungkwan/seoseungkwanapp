// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadWorklogDay, saveWorklogDay, WorklogStorageError } from '@/lib/storage/worklogDays'
import { emptyWorklogDay, type WorklogDay, type WorklogSavedDay } from '@/types/worklog'
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
const statusText = () => screen.getByRole('status').textContent
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
