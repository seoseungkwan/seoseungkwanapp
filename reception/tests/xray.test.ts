// @vitest-environment jsdom
// 엑스레이 찍음 표시 띠 xray.js (TASK-20, REQ-1405, design.md 6절·10절). 승인 시안 Main.dc.html·Tablet.dc.html 진료보류 줄의 두 모양:
// 찍기 전 = "엑스레이 찍기 전" + [찍음 표시], 찍음 = "엑스레이 찍음 HH:MM" + [표시 취소].
// 누르면 setXray 한 번(누르는 동안 disabled, 두 번 못 누름) → 성공하면 다시 읽기 한 번. 줄 자리는 그대로다. 자료는 가짜다(fixtures.ts)
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard, FakeRow } from './fixtures'

interface XrayDeps {
  setXray?: (k: string, on: boolean, options?: { signal?: AbortSignal }) => Promise<unknown>
  readNow?: () => void
  signal?: () => AbortSignal | undefined
}

interface XrayJs {
  xrayBand: (row: FakeRow, deps?: XrayDeps) => HTMLElement | null
}

interface BoardJs {
  renderBoard: (host: HTMLElement, board: FakeBoard, view?: { lane?: string; xray?: (row: FakeRow) => Node | null }) => HTMLElement
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다. 경로를 값으로 두어 형 검사가 묻지 않게 한다
const XRAY_JS = '../www/xray.js'
const BOARD_JS = '../www/board.js'
let xray: XrayJs
let board: BoardJs

beforeAll(async () => {
  // 아직 없으면(RED) 빈 띠를 주는 대역으로 시험마다 실패를 보인다
  const missing: XrayJs = { xrayBand: () => document.createElement('div') }
  xray = ((await import(/* @vite-ignore */ XRAY_JS).catch(() => missing)) ?? missing) as XrayJs
  board = (await import(/* @vite-ignore */ BOARD_JS)) as BoardJs
})

afterEach(() => {
  document.body.replaceChildren()
})

/** 밖에서 끝낼 수 있는 약속(도우미 답을 기다리는 동안을 본다) */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve: () => void = () => {}
  let reject: (e: unknown) => void = () => {}
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

/** 약속 뒤 일(then)이 다 돌게 한다 */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

/** 바로 아래 아이들의 '태그.class' */
function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.className ? `.${c.className.split(' ').join('.')}` : ''}`)
}

function textOf(root: ParentNode | null | undefined, selector: string): string | null {
  return root?.querySelector(selector)?.textContent?.trim() ?? null
}

function buttonOf(root: ParentNode | null | undefined): HTMLButtonElement | null {
  return root?.querySelector<HTMLButtonElement>('button') ?? null
}

function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

function rowsOf(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('main.list > .rows > .row')]
}

/** 진료보류 줄 둘(가상환자04 찍기 전, 가상환자05 찍음 10:55)과 진료대기 줄 하나 */
function holdBoard(marks: { four?: string | null; five?: string | null } = {}, at = '13:42:10'): FakeBoard {
  return fx.boardOf(
    {
      wait: [fx.fakeRow({ k: fx.fakeKey(2), chart: '910234', name: '가상환자02', time: '10:42 접수' })],
      hold: [
        fx.fakeRow({ k: fx.fakeKey(4), lane: 'hold', chart: '910502', name: '가상환자04', time: '10:05 접수', waited: '보류 22분째', memo: '엑스레이 찍으러 감', rxLabel: '오늘', rx: '엑스레이 촬영(XR2)', xray: { at: marks.four ?? null } }),
        fx.fakeRow({ k: fx.fakeKey(5), lane: 'hold', chart: '910733', name: '가상환자05', time: '10:15 접수', waited: '보류 15분째', rxLabel: '오늘', rx: '엑스레이 촬영(XR2)', xray: { at: marks.five === undefined ? '10:55' : marks.five } }),
      ],
    },
    at,
  )
}

function beforeRow(n = 4): FakeRow {
  return fx.fakeRow({ k: fx.fakeKey(n), lane: 'hold', name: `가상환자0${n}`, xray: { at: null } })
}

function doneRow(n = 5, at = '10:55'): FakeRow {
  return fx.fakeRow({ k: fx.fakeKey(n), lane: 'hold', name: `가상환자0${n}`, xray: { at } })
}

describe('xray.js 찍음 표시 띠', () => {
  it('AC-1405.1: 찍기 전 줄은 시안 그대로 .xray > "엑스레이 찍기 전"(is-before) + [찍음 표시](btn-dark)', () => {
    const band = xray.xrayBand(beforeRow(), { setXray: vi.fn(), readNow: vi.fn() })
    expect(band?.tagName.toLowerCase()).toBe('div')
    expect(band?.className).toBe('xray')
    expect(shapeOf(band)).toEqual(['span.xray-tag.is-before', 'button.btn-dark'])
    expect(textOf(band, '.xray-tag')).toBe('엑스레이 찍기 전')
    expect(buttonOf(band)?.textContent).toBe('찍음 표시')
    expect(buttonOf(band)?.type).toBe('button')
    expect(buttonOf(band)?.disabled).toBe(false)
  })

  it('AC-1405.1: 찍음 표시가 있는 줄은 시안 그대로 .xray > "엑스레이 찍음 HH:MM"(is-done) + [표시 취소](btn-light)', () => {
    const band = xray.xrayBand(doneRow(5, '10:55'), { setXray: vi.fn(), readNow: vi.fn() })
    expect(band?.className).toBe('xray')
    expect(shapeOf(band)).toEqual(['span.xray-tag.is-done', 'button.btn-light'])
    expect(textOf(band, '.xray-tag')).toBe('엑스레이 찍음 10:55')
    expect(buttonOf(band)?.textContent).toBe('표시 취소')
    expect(buttonOf(band)?.disabled).toBe(false)
  })

  it('AC-1405.1: 엑스레이 칸이 없는 줄(진료보류 아님)에는 띠가 없다', () => {
    expect(xray.xrayBand(fx.fakeRow({ k: fx.fakeKey(2), lane: 'wait', xray: null }), { setXray: vi.fn(), readNow: vi.fn() })).toBeNull()
  })

  it('AC-1405.1: [찍음 표시]를 누르면 setXray(열쇠, true)를 한 번 부르고, 기다리는 동안 단추는 disabled라 더 눌러도 늘지 않고, 204 뒤 다시 읽기를 한 번 한다', async () => {
    const answer = deferred()
    const setXray = vi.fn(() => answer.promise)
    const readNow = vi.fn()
    const band = xray.xrayBand(beforeRow(4), { setXray, readNow })
    document.body.appendChild(band as HTMLElement)
    const button = buttonOf(band) as HTMLButtonElement

    button.click()
    expect(setXray).toHaveBeenCalledTimes(1)
    expect(setXray.mock.calls[0]?.slice(0, 2)).toEqual([fx.fakeKey(4), true])
    expect(button.disabled).toBe(true)
    // disabled여도 click()은 사건을 보내지 않는다. 처리기를 직접 불러도(빠른 두 번 누름) 요청은 하나다
    button.disabled = false
    button.click()
    button.click()
    expect(setXray).toHaveBeenCalledTimes(1)
    expect(readNow).not.toHaveBeenCalled()

    answer.resolve()
    await settle()
    expect(readNow).toHaveBeenCalledTimes(1)
    expect(setXray).toHaveBeenCalledTimes(1)
  })

  it('AC-1405.1: 그 PC 연결의 signal(poll.signal)을 setXray에 넘겨 끊김·숨김 때 함께 끊긴다', async () => {
    const live = new AbortController()
    const setXray = vi.fn(() => Promise.resolve())
    const band = xray.xrayBand(beforeRow(4), { setXray, readNow: vi.fn(), signal: () => live.signal })
    buttonOf(band)?.click()
    await settle()
    expect(setXray).toHaveBeenCalledWith(fx.fakeKey(4), true, { signal: live.signal })
  })

  it('AC-1405.1: 누르는 동안 목록이 다시 그려져도(10초 읽기) 그 줄의 새 단추도 disabled라 두 번 못 누른다', async () => {
    const answer = deferred()
    const setXray = vi.fn(() => answer.promise)
    const readNow = vi.fn()
    const first = xray.xrayBand(beforeRow(4), { setXray, readNow })
    buttonOf(first)?.click()

    const redrawn = xray.xrayBand(beforeRow(4), { setXray, readNow })
    expect(buttonOf(redrawn)?.disabled).toBe(true)
    // 다른 줄은 따로 누를 수 있다
    const other = xray.xrayBand(beforeRow(6), { setXray, readNow })
    expect(buttonOf(other)?.disabled).toBe(false)

    answer.resolve()
    await settle()
    expect(readNow).toHaveBeenCalledTimes(1)
    // 끝난 뒤 그린 띠는 다시 누를 수 있다
    expect(buttonOf(xray.xrayBand(doneRow(4, '13:42'), { setXray, readNow }))?.disabled).toBe(false)
  })

  it('AC-1405.1: setXray가 실패하면(ApiError) 다시 읽지 않고 단추를 다시 누를 수 있게 둔다. 그 사이 그린 단추도 풀린다', async () => {
    const answer = deferred()
    const setXray = vi.fn(() => answer.promise)
    const readNow = vi.fn()
    const band = xray.xrayBand(beforeRow(4), { setXray, readNow })
    const button = buttonOf(band) as HTMLButtonElement
    button.click()
    const redrawn = buttonOf(xray.xrayBand(beforeRow(4), { setXray, readNow })) as HTMLButtonElement
    expect(redrawn.disabled).toBe(true)

    answer.reject(Object.assign(new Error('접수 현황 PC에 연결하지 못했어요'), { name: 'ApiError', reason: 'network' }))
    await settle()
    expect(readNow).not.toHaveBeenCalled()
    expect(button.disabled).toBe(false)
    expect(redrawn.disabled).toBe(false)
    expect(textOf(band, '.xray-tag')).toBe('엑스레이 찍기 전')

    setXray.mockImplementation(() => Promise.resolve())
    redrawn.click()
    await settle()
    expect(setXray).toHaveBeenCalledTimes(2)
    expect(readNow).toHaveBeenCalledTimes(1)
  })

  it('AC-1405.1: 목록에서 [찍음 표시] → 다시 읽은 판에 "엑스레이 찍음 13:42" + [표시 취소]가 나오고 줄의 자리(차례)는 그대로다', async () => {
    const app = appHost()
    const setXray = vi.fn(() => Promise.resolve())
    let current = holdBoard()
    const draw = (): void => {
      board.renderBoard(app, current, { lane: 'queue', xray: (row) => xray.xrayBand(row, deps) })
    }
    const readNow = vi.fn(() => {
      // 도우미가 표시를 남긴 뒤의 판(같은 차례, 그 줄의 xray.at만 바뀜)
      current = holdBoard({ four: '13:42' }, '13:42:20')
      draw()
    })
    const deps: XrayDeps = { setXray, readNow }
    draw()
    const keysBefore = rowsOf(app).map((row) => row.dataset.k)
    expect(keysBefore).toEqual([fx.fakeKey(4), fx.fakeKey(5), fx.fakeKey(2)])

    const target = rowsOf(app)[0] as HTMLElement
    expect(textOf(target, '.xray > .xray-tag')).toBe('엑스레이 찍기 전')
    buttonOf(target.querySelector('.xray'))?.click()
    // 누르는 동안에도 줄은 그 자리다
    expect(rowsOf(app).map((row) => row.dataset.k)).toEqual(keysBefore)
    await settle()

    expect(setXray).toHaveBeenCalledTimes(1)
    expect(setXray.mock.calls[0]?.slice(0, 2)).toEqual([fx.fakeKey(4), true])
    expect(readNow).toHaveBeenCalledTimes(1)
    expect(rowsOf(app).map((row) => row.dataset.k)).toEqual(keysBefore)
    const after = rowsOf(app)[0] as HTMLElement
    expect(textOf(after, '.xray > .xray-tag.is-done')).toBe('엑스레이 찍음 13:42')
    expect(textOf(after, '.xray > button.btn-light')).toBe('표시 취소')
    expect(buttonOf(after.querySelector('.xray'))?.disabled).toBe(false)
  })

  it('AC-1405.2: [표시 취소]를 누르면 setXray(열쇠, false)를 한 번 부르고 기다리는 동안 disabled, 204 뒤 다시 읽기를 한 번 한다', async () => {
    const answer = deferred()
    const setXray = vi.fn(() => answer.promise)
    const readNow = vi.fn()
    const band = xray.xrayBand(doneRow(5, '10:55'), { setXray, readNow })
    const button = buttonOf(band) as HTMLButtonElement

    button.click()
    expect(setXray).toHaveBeenCalledTimes(1)
    expect(setXray.mock.calls[0]?.slice(0, 2)).toEqual([fx.fakeKey(5), false])
    expect(button.disabled).toBe(true)
    button.disabled = false
    button.click()
    expect(setXray).toHaveBeenCalledTimes(1)

    answer.resolve()
    await settle()
    expect(readNow).toHaveBeenCalledTimes(1)
  })

  it('AC-1405.2: 목록에서 [표시 취소] → 다시 읽은 판에 "엑스레이 찍기 전" + [찍음 표시]가 다시 나오고 줄의 자리는 그대로다', async () => {
    const app = appHost()
    const setXray = vi.fn(() => Promise.resolve())
    let current = holdBoard()
    const draw = (): void => {
      board.renderBoard(app, current, { lane: 'hold', xray: (row) => xray.xrayBand(row, deps) })
    }
    const readNow = vi.fn(() => {
      current = holdBoard({ five: null }, '13:42:20')
      draw()
    })
    const deps: XrayDeps = { setXray, readNow }
    draw()
    const keysBefore = rowsOf(app).map((row) => row.dataset.k)
    expect(keysBefore).toEqual([fx.fakeKey(4), fx.fakeKey(5)])

    const target = rowsOf(app)[1] as HTMLElement
    expect(textOf(target, '.xray > .xray-tag.is-done')).toBe('엑스레이 찍음 10:55')
    buttonOf(target.querySelector('.xray'))?.click()
    await settle()

    expect(setXray).toHaveBeenCalledTimes(1)
    expect(setXray.mock.calls[0]?.slice(0, 2)).toEqual([fx.fakeKey(5), false])
    expect(readNow).toHaveBeenCalledTimes(1)
    expect(rowsOf(app).map((row) => row.dataset.k)).toEqual(keysBefore)
    const after = rowsOf(app)[1] as HTMLElement
    expect(shapeOf(after.querySelector('.xray'))).toEqual(['span.xray-tag.is-before', 'button.btn-dark'])
    expect(textOf(after, '.xray > .xray-tag')).toBe('엑스레이 찍기 전')
    expect(textOf(after, '.xray > button')).toBe('찍음 표시')
  })

  it('AC-1405.1: 시각 글은 글자로만 들어간다(HTML로 읽히지 않는다)', () => {
    const band = xray.xrayBand(doneRow(5, '<b>10:55</b>'), { setXray: vi.fn(), readNow: vi.fn() })
    expect(band?.querySelector('b')).toBeNull()
    expect(textOf(band, '.xray-tag')).toBe('엑스레이 찍음 <b>10:55</b>')
  })
})
