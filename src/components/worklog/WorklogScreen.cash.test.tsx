// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadWorklogDay, saveWorklogDay, WorklogStorageError } from '@/lib/storage/worklogDays'
import { loadCashFloatSetting, saveCashFloatSetting } from '@/lib/storage/worklogSettings'
import { BIT_FILL_KEYS } from '@/lib/worklog/bitFill'
import type { RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import {
  CASH_COUNT_KEYS,
  emptyWorklogCash,
  emptyWorklogDay,
  type MemoFontPt,
  type WorklogCash,
  type WorklogDay,
  type WorklogNumberKey,
  type WorklogSavedDay,
} from '@/types/worklog'
import { WorklogScreen } from './WorklogScreen'
import { startWorklogSession, worklogAutosave } from './worklogSession'

// 업무일지 화면에 이은 현금 시재 상자 (specs/worklog-cash-float REQ-1609·AC-1606.4·AC-1607.3, design.md '화면 잇기').
// 지금 화면 시험(WorklogScreen.test.tsx)과 같은 가짜(저장소·Supabase·비트 통로) + 병원 시재 설정 가짜. 자동 저장 제어는 진짜다.
// 숫자는 시안의 지어낸 예시다: 일지 현금수납 147,000 · 지출 현금 12,000 · 환불 8,000 · 미수입금 5,000, 비트 현금 142,000, 그날 시재 300,000, 설정 250,000
const client = vi.hoisted(() => ({ auth: { onAuthStateChange: vi.fn() } }))

vi.mock('@/lib/storage/worklogDays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/worklogDays')>()),
  loadWorklogDay: vi.fn(),
  saveWorklogDay: vi.fn(),
}))
vi.mock('@/lib/storage/worklogSettings', () => ({
  loadCashFloatSetting: vi.fn(),
  saveCashFloatSetting: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => client }))
// 비트 PC 통로(useBridge)는 가짜다. 기본은 연결 안 됨
const bridge = vi.hoisted(() => ({
  state: 'disconnected' as string,
  helloError: null as string | null,
  call: vi.fn<(cmd: string, args: { from: string; to: string }) => Promise<RevenueDaysResult>>(),
}))
vi.mock('@/components/claim/useBridge', () => ({
  useBridge: () => ({ state: bridge.state, helloError: bridge.helloError, call: bridge.call }),
}))

const TODAY = '2026-10-28' // 수요일
const PAST = '2026-10-27'
const NOON_TODAY = new Date('2026-10-28T03:00:00Z') // 한국 시각 12:00
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'
const FAKE_PHONE = '010-0000-0000'
const MINUTE = 60_000
const SETTING = 250000

const PIECE_NAMES = ['5만원권', '1만원권', '5천원권', '1천원권', '500원', '100원', '50원', '10원']
const SHORT = [6, 11, 1, 10, 6, 20, 0, 0] // 430,000원 → 그날 시재 300,000이면 5,000원 모자라요
const CELLS: Partial<WorklogDay> = { cashIn: '147000', spendCash: '12000', spendRefund: '8000', unpaidPaid: '5000' }
const LEGEND = '표시한 칸은 비트에서 불러온 숫자예요'
const GUESS_TITLE = '이렇게 생겼을 수 있어요'
const OTHER_PC = '비트 PC에서 열면 무엇이 틀렸을지 추측해 드려요'
const BIT_CASH_GUESS = '일지 현금수납(147,000원)이 비트(142,000원)보다 5,000원 많아요.'
const CHANGE_GUESS = '5천원권 1장을 거스름돈으로 더 줬을 수 있어요.'
const NOTICE_FAILED = '비트 숫자를 불러오지 못했어요. 직접 적어도 돼요'

const load = vi.mocked(loadWorklogDay)
const save = vi.mocked(saveWorklogDay)
const setting = vi.mocked(loadCashFloatSetting)
const saveSetting = vi.mocked(saveCashFloatSetting)
const unsubscribe = vi.fn()
const media = { touch: false, listeners: new Set<() => void>() }
let emitAuth: (event: string) => void

const dayWith = (cells: Partial<WorklogDay> = {}): WorklogDay => ({ ...emptyWorklogDay(), ...cells })

function cashOf(counts: number[], rest: Partial<WorklogCash> = {}): WorklogCash {
  const cash = emptyWorklogCash()
  CASH_COUNT_KEYS.forEach((key, i) => {
    cash[key] = counts[i]
  })
  return { ...cash, floatWon: 300000, ...rest }
}

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

async function openScreen() {
  const view = render(<WorklogScreen initialToday={TODAY} />)
  await settle()
  return view
}

// 시재까지 든 가짜 서버. 저장은 바뀐 칸과, 받았을 때만 목록·크기·시재 칸을 그 줄에 넣는다
type Row = { cells?: Partial<WorklogDay>; bitFields?: WorklogNumberKey[]; memoFontPt?: MemoFontPt; cash?: WorklogCash }
function cashServer(rows: Record<string, Row>) {
  const db = new Map<string, Required<WorklogSavedDay>>(
    Object.entries(rows).map(([ymd, row]): [string, Required<WorklogSavedDay>] => [
      ymd,
      { day: dayWith(row.cells), bitFields: [...(row.bitFields ?? [])], memoFontPt: row.memoFontPt ?? 11, cash: { ...(row.cash ?? emptyWorklogCash()) } },
    ]),
  )
  load.mockImplementation(async (_client, ymd) => {
    const row = db.get(ymd)
    return row ? { day: { ...row.day }, bitFields: [...row.bitFields], memoFontPt: row.memoFontPt, cash: { ...row.cash } } : null
  })
  save.mockImplementation(async (_client, ymd, changes, bitFields, memoFontPt, cash) => {
    const row: Required<WorklogSavedDay> = db.get(ymd) ?? { day: emptyWorklogDay(), bitFields: [], memoFontPt: 11, cash: emptyWorklogCash() }
    db.set(ymd, {
      day: { ...row.day, ...changes },
      bitFields: bitFields ? [...bitFields] : row.bitFields,
      memoFontPt: memoFontPt ?? row.memoFontPt,
      cash: { ...row.cash, ...cash },
    })
  })
  return db
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
  cash: 142000,
  card: 300000,
  transfer: 50000,
  receivableIn: 5000,
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
// 비트 칸은 이미 비트 숫자와 같고(합칠 것이 없다) 현금수납만 손으로 147,000을 적은 날
const BIT_CELLS: Partial<WorklogDay> = {
  ...CELLS,
  newPatients: '12',
  returnPatients: '48',
  totalFee: '1000000',
  claimAmount: '600000',
  cardIn: '300000',
  transferIn: '50000',
}
const BIT_LIST = BIT_FILL_KEYS.filter((key) => key !== 'cashIn')

function connect(...answers: RevenueDaysResult[]) {
  bridge.state = 'ready'
  for (const answer of answers) bridge.call.mockResolvedValueOnce(answer)
}

const cell = (label: string) => screen.getByLabelText<HTMLInputElement>(label)
const type = (label: string, value: string) => fireEvent.change(cell(label), { target: { value } })
const button = (name: string) => screen.getByRole('button', { name })
const statusText = () => {
  const lines = screen.getAllByRole('status').filter((el) => el.tagName !== 'OUTPUT')
  expect(lines).toHaveLength(1)
  return lines[0].textContent
}
const cardCodes = () => screen.queryAllByRole('alert').map((card) => card.textContent?.match(/E-[A-Z-]+/)?.[0])
const sheetTable = () => screen.getByRole('table', { name: '업무일지' })
const hiddenInPrint = (el: Element) => el.closest('[class~="print:hidden"]') !== null
const follows = (first: Element, second: Element) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

// 상자 안
const box = () => screen.getByRole('region', { name: '현금 시재' })
const inBox = (text: string) => within(box()).queryByText(text)
const countInput = (name: string) => within(box()).getByLabelText<HTMLInputElement>(`${name} 장수`)
const countValues = () => PIECE_NAMES.map((name) => countInput(name).value)
const countsLocked = () => PIECE_NAMES.every((name) => countInput(name).disabled)
const typeCount = (name: string, value: string) => fireEvent.change(countInput(name), { target: { value } })
const sumText = () => within(box()).getByRole('table', { name: '세어 본 현금' }).querySelector('tfoot td')?.textContent
// 시재 줄 오른쪽 금액과 작은 글("이 날 금액"·"설정 금액")
const floatLabel = () => within(box()).getByText(/^(이 날 금액|설정 금액)$/)
const floatShown = () => floatLabel().closest('div')?.lastElementChild?.textContent
const checkbox = (name: string) => within(box()).getByRole<HTMLInputElement>('checkbox', { name })
const reasonField = () => within(box()).getByLabelText<HTMLTextAreaElement>('차이 이유 (선택)')
// 추측 목록 글(단추 글 빼고)
const guessTexts = () => within(box()).queryAllByRole('listitem').map((item) => item.firstChild?.textContent)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOON_TODAY)
  vi.clearAllMocks()
  load.mockReset()
  save.mockReset()
  setting.mockReset()
  saveSetting.mockReset()
  load.mockResolvedValue(null)
  save.mockResolvedValue(undefined)
  setting.mockResolvedValue(SETTING)
  saveSetting.mockResolvedValue(undefined)
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
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('AC-1609.1 저장된 시재로 열기', () => {
  it('AC-1609.1: 서버에 시재가 있는 날을 PC에서 열면 읽기가 끝난 뒤 상자에 장수·확인란·이유와 그날 시재로 계산한 결과가 보인다(설정이 달라도)', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    expect(countValues()).toEqual(['', '', '', '', '', '', '', ''])
    expect(countsLocked()).toBe(true)

    await act(async () => reply.resolve({ day: dayWith(CELLS), bitFields: [], cash: cashOf(SHORT, { unpaidCash: true, reason: '가상 이유' }) }))

    expect(countsLocked()).toBe(false)
    expect(countValues()).toEqual(['6', '11', '1', '10', '6', '20', '', ''])
    expect(sumText()).toBe('430,000원')
    expect(floatShown()).toBe('300,000원')
    expect(floatLabel().textContent).toBe('이 날 금액')
    expect(checkbox('현금으로 돌려줌').checked).toBe(false)
    expect(checkbox('현금으로 받음').checked).toBe(true)
    // 300,000 + 147,000 − 12,000 + 5,000(현금으로 받음) = 440,000
    expect(inBox('10,000원 모자라요')).not.toBeNull()
    expect(inBox('세어 본 돈 430,000원 · 있어야 할 돈 440,000원')).not.toBeNull()
    expect(reasonField().value).toBe('가상 이유')
    expect(save).not.toHaveBeenCalled()
  })

  it.each<[string, WorklogSavedDay | null]>([
    ['줄이 없는 날', null],
    ['cash가 없는 응답', { day: dayWith(CELLS), bitFields: [] }],
  ])('AC-1609.1: %s은 빈 시재이고, 시재 줄은 설정 금액이다', async (_name, reply) => {
    load.mockResolvedValueOnce(reply)
    await openScreen()

    expect(countsLocked()).toBe(false)
    expect(countValues()).toEqual(['', '', '', '', '', '', '', ''])
    expect(sumText()).toBe('0원')
    expect(floatShown()).toBe('250,000원')
    expect(floatLabel().textContent).toBe('설정 금액')
    expect(inBox('장수를 적으면 맞는지 보여 드려요')).not.toBeNull()
    expect(within(box()).queryAllByRole('listitem')).toEqual([])
  })
})

describe('AC-1609.2 첫 장수와 그날 시재', () => {
  it('AC-1609.2: 안 센 날 첫 장수를 적으면 화면이 바로 바뀌고 changeCash가 설정 금액과 함께 불리며, saveWorklogDay(클라이언트, 그날, {}, undefined, undefined, { 장수, floatWon })로 나간다', async () => {
    cashServer({ [TODAY]: { cells: { cashIn: '100000' } } })
    const changeCash = vi.spyOn(worklogAutosave(), 'changeCash')
    await openScreen()
    expect(setting).toHaveBeenCalledTimes(1)
    expect(setting).toHaveBeenCalledWith(client)

    typeCount('5만원권', '7')

    expect(countInput('5만원권').value).toBe('7')
    expect(sumText()).toBe('350,000원')
    expect(inBox('맞아요')).not.toBeNull() // 250,000 + 100,000
    expect(floatShown()).toBe('250,000원')
    expect(floatLabel().textContent).toBe('이 날 금액')
    expect(changeCash).toHaveBeenCalledTimes(1)
    expect(changeCash).toHaveBeenCalledWith(TODAY, { ...emptyWorklogCash(), count50000: 7, floatWon: SETTING })
    expect(save).not.toHaveBeenCalled()

    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, {}, undefined, undefined, { count50000: 7, floatWon: SETTING })
    expect(save.mock.calls[0]).toHaveLength(6)
    expect(statusText()).toBe('저장했어요 · 12:00')
  })

  it('AC-1609.2: 이미 센 날은 설정이 달라도 그날 시재 그대로이고 floatWon을 보내지 않는다', async () => {
    cashServer({ [TODAY]: { cells: CELLS, cash: cashOf(SHORT) } })
    await openScreen()

    typeCount('5천원권', '2')

    expect(floatShown()).toBe('300,000원')
    expect(inBox('맞아요')).not.toBeNull() // 435,000
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, {}, undefined, undefined, { count5000: 2 })
  })

  it('AC-1609.2: 설정을 불러오는 중이면 안 센 날 장수 칸이 잠겨 저장하지 않고, 다 불러오면 그 금액으로 센다', async () => {
    const reply = deferred<number>()
    setting.mockReturnValueOnce(reply.promise)
    cashServer({ [TODAY]: { cells: CELLS } })
    await openScreen()

    expect(inBox('시재 금액을 불러오는 중이에요')).not.toBeNull()
    expect(countsLocked()).toBe(true)
    typeCount('5만원권', '1')
    await settle(5000)
    expect(countInput('5만원권').value).toBe('')
    expect(save).not.toHaveBeenCalled()

    await act(async () => reply.resolve(SETTING))
    expect(inBox('시재 금액을 불러오는 중이에요')).toBeNull()
    expect(countsLocked()).toBe(false)
    typeCount('5만원권', '1')
    await settle(800)
    expect(save).toHaveBeenCalledWith(client, TODAY, {}, undefined, undefined, { count50000: 1, floatWon: SETTING })
  })

  it('AC-1609.2: 설정 읽기가 실패하면 오류 카드가 아닌 줄과 [시재 금액 다시 불러오기]이고 안 센 날 장수 칸이 잠기며, 누르면 다시 읽는다', async () => {
    setting.mockRejectedValueOnce(new WorklogStorageError('failed'))
    cashServer({ [TODAY]: { cells: CELLS } })
    await openScreen()

    expect(inBox('시재 금액을 불러오지 못했어요. 장수를 적으려면 다시 불러와 주세요.')).not.toBeNull()
    expect(cardCodes()).toEqual([])
    expect(countsLocked()).toBe(true)

    fireEvent.click(button('시재 금액 다시 불러오기'))
    await settle()

    expect(setting).toHaveBeenCalledTimes(2)
    expect(inBox('시재 금액을 불러오지 못했어요. 장수를 적으려면 다시 불러와 주세요.')).toBeNull()
    expect(countsLocked()).toBe(false)
    expect(floatShown()).toBe('250,000원')
  })

  it('AC-1609.2: 설정 읽기가 실패해도 이미 센 날은 그날 시재로 고칠 수 있다', async () => {
    setting.mockRejectedValueOnce(new WorklogStorageError('failed'))
    cashServer({ [TODAY]: { cells: CELLS, cash: cashOf(SHORT) } })
    await openScreen()

    expect(countsLocked()).toBe(false)
    expect(floatShown()).toBe('300,000원')
    typeCount('5천원권', '2')
    await settle(800)
    expect(save).toHaveBeenCalledWith(client, TODAY, {}, undefined, undefined, { count5000: 2 })
  })

  it('AC-1609.2: 설정은 화면을 열 때 한 번 읽고, 날짜를 옮겨도 다시 읽지 않는다. 서버 그리기에서는 읽지 않는다', async () => {
    const html = renderToString(<WorklogScreen initialToday={TODAY} />)
    expect(html).toContain('현금 시재')
    expect(setting).not.toHaveBeenCalled()

    cashServer({})
    await openScreen()
    fireEvent.click(button('전날'))
    await settle()
    fireEvent.click(button('다음 날'))
    await settle()
    expect(setting).toHaveBeenCalledTimes(1)
  })
})

describe('AC-1609.3 날짜 옮김·앱 안 이동·다시 읽기', () => {
  it('AC-1609.3: 시재를 고친 날을 떠났다 돌아오면 저장 안 된 시재까지 그대로이고, 옮겨 간 날은 그날 시재다', async () => {
    cashServer({ [TODAY]: { cells: CELLS }, [PAST]: { cash: cashOf([1, 0, 0, 0, 0, 0, 0, 0], { floatWon: 200000 }) } })
    save.mockImplementationOnce(() => new Promise(() => {})) // 끝나지 않는 저장
    await openScreen()
    typeCount('5만원권', '6')

    fireEvent.click(button('전날'))
    await settle()
    expect(save).toHaveBeenCalledTimes(1)
    expect(countValues()[0]).toBe('1')
    expect(floatShown()).toBe('200,000원')

    fireEvent.click(button('다음 날'))
    await settle()
    expect(countValues()[0]).toBe('6')
    expect(floatShown()).toBe('250,000원')
    expect(sumText()).toBe('300,000원')
  })

  it('AC-1609.3: 앱 안 다른 탭에 갔다 오면 저장 안 된 시재가 읽기 전에 먼저 보이고, 읽은 뒤에도 그대로다', async () => {
    cashServer({ [TODAY]: { cells: CELLS } })
    save.mockImplementationOnce(() => new Promise(() => {}))
    const first = await openScreen()
    typeCount('5만원권', '6')
    first.unmount()
    expect(save).toHaveBeenCalledTimes(1)

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    render(<WorklogScreen initialToday={TODAY} />)
    await settle()
    expect(countValues()[0]).toBe('6')
    expect(countsLocked()).toBe(true)

    await act(async () => reply.resolve({ day: dayWith(CELLS), bitFields: [], cash: emptyWorklogCash() }))
    expect(countsLocked()).toBe(false)
    expect(countValues()[0]).toBe('6')
    expect(floatShown()).toBe('250,000원')
  })

  it('AC-1609.3: 다른 PC가 바꾼 시재는 다시 읽기에서 반영되고(저장 안 된 칸은 그대로) 저장을 부르지 않는다', async () => {
    const db = cashServer({ [TODAY]: { cells: CELLS, cash: cashOf(SHORT) } })
    save.mockImplementationOnce(() => new Promise(() => {}))
    await openScreen()
    typeCount('10원', '3')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)

    const row = db.get(TODAY)!
    row.cash = { ...row.cash, count5000: 2 } // 다른 PC
    await settle(MINUTE)

    expect(countValues()).toEqual(['6', '11', '2', '10', '6', '20', '', '3'])
    expect(sumText()).toBe('435,030원')
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('AC-1609.4 다른 저장은 시재를 두고 보내지 않는다', () => {
  it('AC-1609.4: 비트 채우기 뒤에도 시재가 그대로이고, 그 저장에 여섯째 인자가 없다', async () => {
    connect(bitAnswer(TODAY))
    cashServer({ [TODAY]: { cells: { spendCash: '12000' }, cash: cashOf(SHORT) } })
    await openScreen()
    expect(cell('현금수납').value).toBe('142,000원')
    await settle(800)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]).toHaveLength(4)
    expect(countValues()).toEqual(['6', '11', '1', '10', '6', '20', '', ''])
    expect(floatShown()).toBe('300,000원')
  })

  it('AC-1609.4: [비트 숫자로 바꾸기]·칸 고치기·글씨 크기 바꾸기 뒤에도 시재가 그대로이고, 그 저장들에 여섯째 인자가 없다', async () => {
    connect(bitAnswer(TODAY, { cash: 125000 }))
    cashServer({ [TODAY]: { cells: { cashIn: '120,000 별도' }, cash: cashOf(SHORT, { reason: '가상 이유' }) } })
    await openScreen()
    await settle(800)

    fireEvent.click(button('현금수납 칸을 비트 숫자로 바꾸기'))
    expect(cell('현금수납').value).toBe('125,000원')
    await settle(800)
    type('업무사항', '가상 업무 글')
    await settle(800)
    fireEvent.click(button('업무사항 글씨 크게'))
    await settle(800)

    expect(save).toHaveBeenCalledTimes(4)
    for (const call of save.mock.calls) expect(call.length).toBeLessThan(6)
    expect(countValues()).toEqual(['6', '11', '1', '10', '6', '20', '', ''])
    expect(floatShown()).toBe('300,000원')
  })
})

describe('AC-1606.4 추측 모드', () => {
  it('AC-1606.4: 비트 PC에서는 그날 읽기가 끝난 뒤에만 추측 목록이 나온다(읽기 전에는 추측 자리가 없다)', async () => {
    bridge.state = 'ready'
    const first = deferred<RevenueDaysResult>()
    bridge.call.mockReturnValueOnce(first.promise)
    cashServer({ [TODAY]: { cells: BIT_CELLS, bitFields: BIT_LIST, cash: cashOf(SHORT) } })
    await openScreen()

    expect(inBox('5,000원 모자라요')).not.toBeNull()
    expect(inBox(GUESS_TITLE)).toBeNull()
    expect(inBox(OTHER_PC)).toBeNull()

    await act(async () => first.resolve(bitAnswer(TODAY)))

    expect(inBox(GUESS_TITLE)).not.toBeNull()
    expect(guessTexts()).toEqual([BIT_CASH_GUESS, CHANGE_GUESS])
    expect(within(box()).getByRole('button', { name: '비트 숫자로 고치기' })).toBeTruthy()
    expect(inBox(OTHER_PC)).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-1606.4: 다시 읽기에 실패해도(failed) 그날 앞서 읽은 비트 현금으로 추측한다', async () => {
    connect(bitAnswer(TODAY))
    bridge.call.mockRejectedValueOnce(bridgeError('E-BIT-READ-FAILED'))
    cashServer({ [TODAY]: { cells: BIT_CELLS, bitFields: BIT_LIST, cash: cashOf(SHORT) } })
    await openScreen()

    fireEvent.click(button('지금 불러오기'))
    await settle()

    expect(screen.getByText(NOTICE_FAILED)).toBeTruthy()
    expect(guessTexts()).toEqual([BIT_CASH_GUESS, CHANGE_GUESS])
  })

  it('AC-1606.4: 금액 확인이 필요한 날은 비트 현금이 없어 현금수납 추측과 [비트 숫자로 고치기]가 없다', async () => {
    connect({ days: [revenueRow(TODAY, UNCONFIRMED)], codes: [] })
    cashServer({ [TODAY]: { cells: BIT_CELLS, bitFields: BIT_LIST, cash: cashOf(SHORT) } })
    await openScreen()

    expect(inBox(GUESS_TITLE)).not.toBeNull()
    expect(guessTexts()).toEqual([CHANGE_GUESS])
    expect(within(box()).queryByRole('button', { name: '비트 숫자로 고치기' })).toBeNull()
  })

  it.each([
    ['disconnected', '연결 안 됨'],
    ['no-helper', '연결 준비 전'],
  ])('AC-1606.4: useBridge %s(%s)면 추측 목록 대신 다른 PC 줄 하나다', async (state) => {
    bridge.state = state
    cashServer({ [TODAY]: { cells: BIT_CELLS, bitFields: BIT_LIST, cash: cashOf(SHORT) } })
    await openScreen()

    expect(inBox(OTHER_PC)).not.toBeNull()
    expect(inBox(GUESS_TITLE)).toBeNull()
    expect(within(box()).queryAllByRole('listitem')).toEqual([])
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-1606.4: 날짜를 옮겨 그날 비트 답이 아직 없으면 앞 날의 답으로 추측하지 않는다', async () => {
    connect(bitAnswer(TODAY))
    bridge.call.mockReturnValueOnce(deferred<RevenueDaysResult>().promise)
    cashServer({
      [TODAY]: { cells: BIT_CELLS, bitFields: BIT_LIST, cash: cashOf(SHORT) },
      [PAST]: { cells: BIT_CELLS, bitFields: BIT_LIST, cash: cashOf(SHORT) },
    })
    await openScreen()
    expect(guessTexts()).toEqual([BIT_CASH_GUESS, CHANGE_GUESS])

    fireEvent.click(button('전날'))
    await settle()

    expect(inBox('5,000원 모자라요')).not.toBeNull()
    expect(inBox(GUESS_TITLE)).toBeNull()
    expect(inBox(OTHER_PC)).toBeNull()
  })
})

describe('AC-1609.5 [비트 숫자로 고치기]', () => {
  it.each([
    ['상자의 [비트 숫자로 고치기]', () => within(box()).getByRole('button', { name: '비트 숫자로 고치기' })],
    ['다름 목록의 [비트 숫자로 바꾸기]', () => button('현금수납 칸을 비트 숫자로 바꾸기')],
  ])('AC-1609.5: %s를 누르면 현금수납 칸이 비트 숫자가 되고 결과가 다시 계산되며, 저장은 같은 모양이다(시재 없음)', async (_name, target) => {
    connect(bitAnswer(TODAY))
    cashServer({ [TODAY]: { cells: BIT_CELLS, bitFields: BIT_LIST, cash: cashOf(SHORT) } })
    await openScreen()
    expect(inBox('5,000원 모자라요')).not.toBeNull()

    fireEvent.click(target())

    expect(cell('현금수납').value).toBe('142,000원')
    expect(inBox('맞아요')).not.toBeNull()
    expect(inBox('세어 본 돈 430,000원 · 있어야 할 돈 430,000원')).not.toBeNull()
    expect(inBox(GUESS_TITLE)).toBeNull()
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]).toHaveLength(4)
    const [, ymd, changes, fields] = save.mock.calls[0]
    expect(ymd).toBe(TODAY)
    expect(changes).toEqual({ cashIn: '142000' })
    expect([...(fields ?? [])].sort()).toEqual([...BIT_FILL_KEYS].sort())
  })
})

describe('AC-1607 터치 기기·인쇄', () => {
  it('AC-1607.1: 터치 기기는 센 날 상자에 결과와 적어 둔 이유만 보이고, 입력 칸이 없으며 설정을 읽지 않고 저장하지 않는다', async () => {
    media.touch = true
    const changeCash = vi.spyOn(worklogAutosave(), 'changeCash')
    cashServer({ [TODAY]: { cells: CELLS, cash: cashOf(SHORT, { reason: '가상 이유' }) } })
    await openScreen()

    expect(within(box()).queryAllByRole('textbox')).toEqual([])
    expect(within(box()).queryAllByRole('checkbox')).toEqual([])
    expect(within(box()).queryByLabelText('5만원권 장수')).toBeNull()
    expect(inBox('5,000원 모자라요')).not.toBeNull()
    expect(inBox('가상 이유')).not.toBeNull()
    await settle(5000)
    expect(setting).not.toHaveBeenCalled()
    expect(changeCash).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-1607.1: 터치 기기에서 안 센 날은 "아직 센 돈을 적지 않았어요" 한 줄이다', async () => {
    media.touch = true
    cashServer({ [TODAY]: { cells: CELLS } })
    await openScreen()
    expect(inBox('아직 센 돈을 적지 않았어요')).not.toBeNull()
    expect(setting).not.toHaveBeenCalled()
  })

  it('AC-1607.3: 상자는 양식·비트 설명 줄 뒤에 있고 양식 밖이며, 인쇄에서 숨는다', async () => {
    cashServer({ [TODAY]: { cells: CELLS, bitFields: ['cashIn'], cash: cashOf(SHORT) } })
    await openScreen()

    const legend = screen.getByText(LEGEND)
    expect(follows(sheetTable(), box())).toBe(true)
    expect(follows(legend, box())).toBe(true)
    expect(sheetTable().contains(box())).toBe(false)
    expect(box().closest('table')).toBeNull()
    expect(hiddenInPrint(box())).toBe(true)
  })
})

describe('AC-1609.7 로그아웃·막힌 이유', () => {
  const signOut = () =>
    act(() => {
      emitAuth('SIGNED_OUT')
    })

  it('AC-1609.7: 로그아웃하면 상자의 시재도 지워진다', async () => {
    cashServer({ [TODAY]: { cells: CELLS, cash: cashOf(SHORT, { reason: '가상 이유' }) } })
    await openScreen()
    expect(countValues()[0]).toBe('6')

    signOut()

    expect(countValues()).toEqual(['', '', '', '', '', '', '', ''])
    expect(document.body.textContent).not.toContain('가상 이유')
    expect(document.body.textContent).not.toContain('430,000원')
  })

  it('AC-1609.7: 이유 칸에 개인정보 모양을 적으면 이유는 보내지 않고 날짜 줄에 E-WORKLOG-NOTE-PRIVATE 카드와 "빨간 칸 빼고 저장했어요"이며, 상자 머리도 같은 글이다', async () => {
    cashServer({ [TODAY]: { cells: CELLS } })
    await openScreen()
    typeCount('5만원권', '1')
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(within(box()).getByText(statusText() ?? '')).toBeTruthy()

    fireEvent.change(reasonField(), { target: { value: `가상 ${FAKE_PHONE}` } })
    await settle(800)

    expect(save).toHaveBeenCalledTimes(1)
    expect(cardCodes()).toEqual(['E-WORKLOG-NOTE-PRIVATE'])
    expect(statusText()).toBe('빨간 칸 빼고 저장했어요 · 12:00')
    expect(within(box()).getByText('빨간 칸 빼고 저장했어요 · 12:00')).toBeTruthy()
    expect(reasonField().getAttribute('aria-invalid')).toBe('true')
  })
})

describe('AC-1609.8 [이 날만 고치기]', () => {
  it('AC-1609.8: 시재 300,000으로 센 날에 [이 날만 고치기]로 280,000을 저장하면 계산이 바로 그 금액이고 { floatWon } 하나만 나가며, 설정 저장은 부르지 않고 다른 날은 그대로다', async () => {
    cashServer({ [TODAY]: { cells: CELLS, cash: cashOf(SHORT) }, [PAST]: { cells: CELLS } })
    await openScreen()
    expect(floatShown()).toBe('300,000원')

    fireEvent.click(within(box()).getByRole('button', { name: '이 날만 고치기' }))
    const input = within(box()).getByLabelText<HTMLInputElement>('이 날 시재 금액')
    expect(input.value).toBe('300,000')
    fireEvent.change(input, { target: { value: '280000' } })
    fireEvent.click(within(box()).getByRole('button', { name: '저장' }))

    expect(floatShown()).toBe('280,000원')
    // 280,000 + 147,000 − 12,000 = 415,000
    expect(inBox('15,000원 많아요')).not.toBeNull()
    await settle(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, TODAY, {}, undefined, undefined, { floatWon: 280000 })
    expect(saveSetting).not.toHaveBeenCalled()

    fireEvent.click(button('전날'))
    await settle()
    expect(floatShown()).toBe('250,000원')
    expect(floatLabel().textContent).toBe('설정 금액')

    fireEvent.click(button('다음 날'))
    await settle()
    expect(floatShown()).toBe('280,000원')
    expect(saveSetting).not.toHaveBeenCalled()
  })

  it('AC-1605.8: [이 날만 고치기] 칸에 적고 저장·취소 없이 다른 센 날로 옮기면 칸이 닫히거나 그날 금액이고, 아무것도 저장하지 않으며 그날 시재도 그대로다(돌아와도 같다)', async () => {
    const db = cashServer({ [TODAY]: { cells: CELLS, cash: cashOf(SHORT) }, [PAST]: { cells: CELLS, cash: cashOf(SHORT, { floatWon: 320000 }) } })
    await openScreen()
    const floatField = () => within(box()).queryByLabelText<HTMLInputElement>('이 날 시재 금액')
    fireEvent.click(within(box()).getByRole('button', { name: '이 날만 고치기' }))
    fireEvent.change(floatField()!, { target: { value: '280000' } })

    fireEvent.click(button('전날'))
    await settle()
    expect([null, '320,000']).toContain(floatField()?.value ?? null)
    // 320,000 + 147,000 − 12,000 = 455,000 → 430,000이면 25,000원 모자라요
    expect(inBox('25,000원 모자라요')).not.toBeNull()
    await settle(800)
    expect(save).not.toHaveBeenCalled()
    expect(db.get(PAST)?.cash.floatWon).toBe(320000)

    fireEvent.click(button('다음 날'))
    await settle()
    expect([null, '300,000']).toContain(floatField()?.value ?? null)
    expect(inBox('5,000원 모자라요')).not.toBeNull()
    await settle(800)
    expect(save).not.toHaveBeenCalled()
    expect(db.get(TODAY)?.cash.floatWon).toBe(300000)
    expect(db.get(PAST)?.cash.floatWon).toBe(320000)
  })
})
