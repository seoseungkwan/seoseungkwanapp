// 도우미에 묻기 api.js (TASK-18, design.md 4·5·6·10절). getBoard({ fresh })·getHistory(k, from)·setXray(k, on):
// 같은 PC 길('/api/…')만, 5초 넘으면 끊음(AbortController), 200(쓰기는 204)이 아니거나 모양이 틀린 답은 실패다(AC-1407.4).
// 쓰기는 도우미 문 지키기(ClientGuard.WriteOk)가 받는 모양이다: POST · X-Reception: 1 · Content-Type: application/json · 몸 256바이트 이하.
// 가짜 fetch·가짜 시계만 쓴다. 자료는 가짜다(fixtures.ts)
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'

type Reason = 'network' | 'timeout' | 'status' | 'shape' | 'aborted' | 'input'

interface ApiErrorLike extends Error {
  reason: Reason
}

interface ApiJs {
  getBoard: (options?: { fresh?: boolean; signal?: AbortSignal }) => Promise<unknown>
  getHistory: (k: string, from: number, options?: { signal?: AbortSignal }) => Promise<unknown>
  setXray: (k: string, on: boolean, options?: { signal?: AbortSignal }) => Promise<void>
  ApiError: new (reason: Reason) => ApiErrorLike
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const API_JS = '../www/api.js'
let api: ApiJs

beforeAll(async () => {
  // 아직 없으면(RED) 늘 실패하는 대역으로 시험마다 실패를 보인다
  class Missing extends Error {
    reason: Reason = 'network'
  }
  const fail = () => Promise.reject(new Missing('api.js 없음'))
  const missing: ApiJs = { getBoard: fail, getHistory: fail, setXray: fail, ApiError: Missing as unknown as ApiJs['ApiError'] }
  api = ((await import(/* @vite-ignore */ API_JS).catch(() => missing)) ?? missing) as ApiJs
})

interface Call {
  url: string
  init: RequestInit
}

let calls: Call[]

/** fetch를 가짜로 바꾼다. answer가 부를 때마다 답(Promise<Response>)을 만든다 */
function fakeFetch(answer: (call: Call) => Promise<Response>) {
  const fetch = vi.fn((url: unknown, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    return answer(call)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }))
}

/** 오지 않는 답. 끊기면(signal) 브라우저처럼 AbortError로 떨어진다 */
function never(call: Call): Promise<Response> {
  return new Promise((_, reject) => {
    call.init.signal?.addEventListener('abort', () => reject(new DOMException('끊김', 'AbortError')))
  })
}

/** 바로 끝나는 일(마이크로태스크)을 다 돌린다 */
async function settle() {
  await vi.advanceTimersByTimeAsync(0)
}

/** 약속의 결과를 시험이 기다리지 않고 들여다본다 */
function watch<T>(p: Promise<T>) {
  const seen: { done: boolean; value?: T; error?: unknown } = { done: false }
  p.then(
    (value) => Object.assign(seen, { done: true, value }),
    (error) => Object.assign(seen, { done: true, error }),
  )
  return seen
}

async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (e) {
    expect(e).toBeInstanceOf(api.ApiError)
    return (e as ApiErrorLike).reason
  }
}

/** 상세 첫 쪽의 종이 기록부 자료(reception-paper design.md 2절). 가짜 자료 */
function fakePaper(over: Record<string, unknown> = {}) {
  return {
    res: '720304-*******',
    addr: '가상시 가상구 예시로 12',
    tel: '',
    cel: '010-0000-1234',
    special: '가상 특이사항\n둘째 줄',
    room: '1진료실',
    ins: '국민건강보험',
    sym: '가상 증상\n\n가상 주사 1차',
    dx: [
      { code: 'M5436', name: '가상 좌골신경통', main: true },
      { code: 'M5456', name: '가상 허리 긴장', main: false },
    ],
    rx: [{ code: 'LA272', name: '가상 말초차단', qty: '2.5', tms: '1', day: '1' }],
    out: [{ code: '641901140', name: '가상정200mg', qty: '1', tms: '2', day: '7' }],
    ...over,
  }
}

/** 상세 답(design.md 5절, HistoryBuilder.cs ToJson). from=0 답에는 paper가 붙는다. 가짜 자료 */
function fakeHistory(over: Record<string, unknown> = {}) {
  return {
    visits: [
      { date: '10월 29일', ago: '7일 전', sym: '오른쪽 어깨 통증', rx: [{ name: '체외충격파', code: 'ESWT7' }, { name: '도수치료 20분', code: 'DS20' }] },
      { date: '10월 22일', ago: '14일 전', sym: '', rx: [{ name: '', code: 'PT01' }] },
    ],
    next: 5,
    more: 31,
    first: '2024년 3월 12일',
    total: 37,
    todaySym: '',
    paper: fakePaper(),
    ...over,
  }
}

beforeEach(() => {
  calls = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('api.js getBoard', () => {
  it('AC-1407.3: getBoard()는 GET /api/board 하나를 같은 PC에 묻고 답(JSON)을 그대로 돌려준다', async () => {
    const board = fx.mockupBoard()
    fakeFetch(() => json(board))
    await expect(api.getBoard()).resolves.toEqual(board)
    expect(calls.map((c) => c.url)).toEqual(['/api/board'])
    const init = calls[0].init
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.cache).toBe('no-store')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('AC-1407.10: getBoard({ fresh: true })는 GET /api/board?fresh=1을 한 번 묻는다. fresh가 true가 아니면 보통 읽기다', async () => {
    fakeFetch(() => json(fx.mockupBoard('13:42:31')))
    await expect(api.getBoard({ fresh: true })).resolves.toMatchObject({ at: '13:42:31' })
    await api.getBoard({ fresh: false })
    await api.getBoard({})
    expect(calls.map((c) => c.url)).toEqual(['/api/board?fresh=1', '/api/board', '/api/board'])
  })

  it('AC-1407.4: 연결이 안 되면(fetch가 떨어짐) network 실패다', async () => {
    fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await reasonOf(api.getBoard())).toBe('network')
  })

  it('AC-1407.4: 5초가 넘으면 그 요청을 끊고(AbortController) timeout 실패다. 4.999초까지는 기다린다', async () => {
    fakeFetch(never)
    const seen = watch(api.getBoard())
    await vi.advanceTimersByTimeAsync(4999)
    expect(seen.done).toBe(false)
    expect(calls[0].init.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(seen.done).toBe(true)
    expect((seen.error as ApiErrorLike).reason).toBe('timeout')
    expect(calls[0].init.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-1407.4: 끊어도 떨어지지 않는 fetch라도 5초에 timeout 실패이고, 그 뒤 온 답은 버린다', async () => {
    let late: (r: Response) => void = () => {}
    fakeFetch(() => new Promise<Response>((resolve) => (late = resolve)))
    const seen = watch(api.getBoard())
    await vi.advanceTimersByTimeAsync(5000)
    expect((seen.error as ApiErrorLike)?.reason).toBe('timeout')
    late(new Response(JSON.stringify(fx.mockupBoard()), { status: 200 }))
    await settle()
    expect(seen.value).toBeUndefined()
  })

  it('AC-1407.4: 5초는 몸(JSON)을 다 읽을 때까지다. 머리만 오고 몸이 멈추면 timeout 실패다', async () => {
    fakeFetch((call) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"state":"ok",'))
          call.init.signal?.addEventListener('abort', () => controller.error(new DOMException('끊김', 'AbortError')))
        },
      })
      return Promise.resolve(new Response(body, { status: 200 }))
    })
    const seen = watch(api.getBoard())
    await vi.advanceTimersByTimeAsync(4999)
    expect(seen.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((seen.error as ApiErrorLike)?.reason).toBe('timeout')
  })

  it('AC-1407.4: 200이 아닌 답(볼 수 없음 503·404·500·204)은 status 실패다', async () => {
    for (const status of [503, 404, 500, 204]) {
      fakeFetch(() => (status === 204 ? Promise.resolve(new Response(null, { status })) : json({ state: 'unavailable' }, status)))
      expect(await reasonOf(api.getBoard()), String(status)).toBe('status')
    }
  })

  it('AC-1407.4: 모양이 틀린 답(JSON 아님·state가 ok 아님·칸 빠짐·글 칸이 글이 아님·열쇠 모양 틀림·기준 시각 모양 틀림·every 없음이나 2~60 밖)은 shape 실패다', async () => {
    const good = fx.mockupBoard()
    const row = good.lists.wait[0]
    const bad: Array<[string, unknown]> = [
      ['null', null],
      ['배열', []],
      ['state', { ...good, state: 'unavailable' }],
      ['at 없음', { ...good, at: undefined }],
      ['at 모양', { ...good, at: '13:42' }],
      ['every 없음', { ...good, every: undefined }],
      ['every null', { ...good, every: null }],
      ['every 글', { ...good, every: '5' }],
      ['every 1', { ...good, every: 1 }],
      ['every 0', { ...good, every: 0 }],
      ['every 음수', { ...good, every: -5 }],
      ['every 61', { ...good, every: 61 }],
      ['every 10000(밀리초)', { ...good, every: 10000 }],
      ['every 정수 아님', { ...good, every: 2.5 }],
      ['every 무한', { ...good, every: Infinity }],
      ['counts 없음', { ...good, counts: undefined }],
      ['counts 글', { ...good, counts: { ...good.counts, wait: '3' } }],
      ['counts 음수', { ...good, counts: { ...good.counts, hold: -1 } }],
      ['lists 없음', { ...good, lists: undefined }],
      ['lists 칸 빠짐', { ...good, lists: { ...good.lists, done: undefined } }],
      ['lists 배열 아님', { ...good, lists: { ...good.lists, pay: {} } }],
      ['줄이 글', { ...good, lists: { ...good.lists, wait: ['가상환자01'] } }],
      ['열쇠 모양', { ...good, lists: { ...good.lists, wait: [{ ...row, k: 'V1234' }] } }],
      ['열쇠 대문자', { ...good, lists: { ...good.lists, wait: [{ ...row, k: row.k.toUpperCase().replace(/^3F9A/, 'ABCD') }] } }],
      ['칸 이름', { ...good, lists: { ...good.lists, wait: [{ ...row, lane: 'cancel' }] } }],
      ['이름이 숫자', { ...good, lists: { ...good.lists, wait: [{ ...row, name: 1 }] } }],
      ['차트번호 없음', { ...good, lists: { ...good.lists, wait: [{ ...row, chart: undefined }] } }],
      ['long 글', { ...good, lists: { ...good.lists, wait: [{ ...row, long: 'false' }] } }],
      ['pos 글', { ...good, lists: { ...good.lists, queue: [{ ...row, pos: '1' }] } }],
      ['xray 모양', { ...good, lists: { ...good.lists, hold: [{ ...good.lists.hold[0], xray: { at: 1055 } }] } }],
      ['xray 글', { ...good, lists: { ...good.lists, hold: [{ ...good.lists.hold[0], xray: '10:55' }] } }],
    ]
    for (const [name, body] of bad) {
      fakeFetch(() => json(body))
      expect(await reasonOf(api.getBoard()), name).toBe('shape')
    }
    fakeFetch(() => Promise.resolve(new Response('<html>가상환자01</html>', { status: 200 })))
    expect(await reasonOf(api.getBoard()), 'JSON 아님').toBe('shape')
  })

  it('AC-1407.4: 아직 못 읽은 칸(이름·메모 "")과 엑스레이 칸 null·{ at: null }·{ at: "HH:MM" }, 빈 칸 목록은 맞는 모양이다', async () => {
    const empty = fx.boardOf({})
    const partial = fx.boardOf({ wait: [fx.fakeRow({ name: '', memo: '' })], hold: [fx.fakeRow({ lane: 'hold', xray: { at: '10:55' } })] })
    for (const body of [empty, partial, fx.mockupBoard()]) {
      fakeFetch(() => json(body))
      await expect(api.getBoard()).resolves.toEqual(body)
    }
  })

  it('AC-1407.4: 읽기 간격 every(초)는 2~60 정수면 맞는 모양이고 받은 그대로 돌려준다(AC-1403.9: 간격은 PC가 정한다)', async () => {
    for (const every of [2, 3, 5, 60]) {
      const body = { ...fx.mockupBoard(), every }
      fakeFetch(() => json(body))
      await expect(api.getBoard(), String(every)).resolves.toEqual(body)
    }
  })

  it('AC-1407.11: 밖에서 준 signal을 끊으면 그 자리에서 aborted 실패이고 나가 있던 fetch도 끊긴다. 이미 끊긴 signal이면 묻지 않는다', async () => {
    fakeFetch(never)
    const outside = new AbortController()
    const seen = watch(api.getBoard({ signal: outside.signal }))
    await settle()
    expect(seen.done).toBe(false)
    outside.abort()
    await settle()
    expect((seen.error as ApiErrorLike)?.reason).toBe('aborted')
    expect(calls[0].init.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    calls = []
    expect(await reasonOf(api.getBoard({ signal: outside.signal }))).toBe('aborted')
    expect(calls).toEqual([])
  })

  it('AC-1407.11: 끊긴 뒤 늦게 온 답(fetch가 끊김을 모름)은 돌려주지 않는다', async () => {
    let late: (r: Response) => void = () => {}
    fakeFetch(() => new Promise<Response>((resolve) => (late = resolve)))
    const outside = new AbortController()
    const seen = watch(api.getBoard({ signal: outside.signal }))
    outside.abort()
    late(new Response(JSON.stringify(fx.mockupBoard()), { status: 200 }))
    await settle()
    expect((seen.error as ApiErrorLike)?.reason).toBe('aborted')
    expect(seen.value).toBeUndefined()
  })
})

describe('api.js getHistory', () => {
  it('AC-1413.2: getHistory(k, from)은 GET /api/visit/{열쇠}/history?from=N 하나를 묻고 답을 그대로 돌려준다', async () => {
    const history = fakeHistory()
    fakeFetch(() => json(history))
    const k = fx.fakeKey(2)
    await expect(api.getHistory(k, 0)).resolves.toEqual(history)
    await api.getHistory(k, 5)
    expect(calls.map((c) => c.url)).toEqual([`/api/visit/${k}/history?from=0`, `/api/visit/${k}/history?from=5`])
    expect(calls[0].init.cache).toBe('no-store')
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it('AC-1407.4: 상세도 5초 끊음·200 아님·모양 틀림이면 실패다', async () => {
    const k = fx.fakeKey(2)
    fakeFetch(never)
    const seen = watch(api.getHistory(k, 0))
    await vi.advanceTimersByTimeAsync(5000)
    expect((seen.error as ApiErrorLike)?.reason).toBe('timeout')

    fakeFetch(() => json({}, 404))
    expect(await reasonOf(api.getHistory(k, 0))).toBe('status')

    const bad: Array<[string, unknown]> = [
      ['visits 없음', fakeHistory({ visits: undefined })],
      ['visit 글', fakeHistory({ visits: ['10월 29일'] })],
      ['rx 배열 아님', fakeHistory({ visits: [{ date: '10월 29일', ago: '7일 전', sym: '', rx: 'ESWT7' }] })],
      ['rx 코드 숫자', fakeHistory({ visits: [{ date: '10월 29일', ago: '7일 전', sym: '', rx: [{ name: '체외충격파', code: 7 }] }] })],
      ['next 글', fakeHistory({ next: '5' })],
      ['more 없음', fakeHistory({ more: undefined })],
      ['first 숫자', fakeHistory({ first: 2024 })],
      ['total 글', fakeHistory({ total: '37' })],
      ['todaySym 없음', fakeHistory({ todaySym: undefined })],
    ]
    for (const [name, body] of bad) {
      fakeFetch(() => json(body))
      expect(await reasonOf(api.getHistory(k, 0)), name).toBe('shape')
    }
    fakeFetch(() => json(fakeHistory({ visits: [], next: null, more: 0, total: 1 })))
    await expect(api.getHistory(k, 0)).resolves.toMatchObject({ next: null })
  })

  it('AC-1502.5: from=0 답에 paper가 없거나 칸 종류가 design.md 2절과 다르면 모양 틀림(shape)이다', async () => {
    const k = fx.fakeKey(2)
    const bad: Array<[string, unknown]> = [
      ['paper 없음', fakeHistory({ paper: undefined })],
      ['paper null', fakeHistory({ paper: null })],
      ['paper 글', fakeHistory({ paper: '종이' })],
      ['paper 배열', fakeHistory({ paper: [] })],
      ...['res', 'addr', 'tel', 'cel', 'special', 'room', 'ins', 'sym'].flatMap((name): Array<[string, unknown]> => [
        [`${name} 없음`, fakeHistory({ paper: fakePaper({ [name]: undefined }) })],
        [`${name} 숫자`, fakeHistory({ paper: fakePaper({ [name]: 7 }) })],
        [`${name} null`, fakeHistory({ paper: fakePaper({ [name]: null }) })],
      ]),
      ...['dx', 'rx', 'out'].flatMap((name): Array<[string, unknown]> => [
        [`${name} 없음`, fakeHistory({ paper: fakePaper({ [name]: undefined }) })],
        [`${name} 배열 아님`, fakeHistory({ paper: fakePaper({ [name]: {} }) })],
        [`${name} 줄이 글`, fakeHistory({ paper: fakePaper({ [name]: ['M5436'] }) })],
        [`${name} 줄 null`, fakeHistory({ paper: fakePaper({ [name]: [null] }) })],
      ]),
      ['dx code 숫자', fakeHistory({ paper: fakePaper({ dx: [{ code: 5436, name: '가상 병', main: true }] }) })],
      ['dx name 없음', fakeHistory({ paper: fakePaper({ dx: [{ code: 'M5436', main: true }] }) })],
      ['dx main 글', fakeHistory({ paper: fakePaper({ dx: [{ code: 'M5436', name: '가상 병', main: '1' }] }) })],
      ['dx main 없음', fakeHistory({ paper: fakePaper({ dx: [{ code: 'M5436', name: '가상 병' }] }) })],
      ...['code', 'name', 'qty', 'tms', 'day'].flatMap((name): Array<[string, unknown]> => [
        [`rx ${name} 숫자`, fakeHistory({ paper: fakePaper({ rx: [{ code: 'LA272', name: '가상', qty: '1', tms: '1', day: '1', [name]: 1 }] }) })],
        [`out ${name} 없음`, fakeHistory({ paper: fakePaper({ out: [{ code: 'LA272', name: '가상', qty: '1', tms: '1', day: '1', [name]: undefined }] }) })],
      ]),
    ]
    for (const [name, body] of bad) {
      fakeFetch(() => json(body))
      expect(await reasonOf(api.getHistory(k, 0)), name).toBe('shape')
    }

    // 빈 글·빈 배열은 맞는 모양이고(진료 전·특이사항 없음) 받은 그대로 돌려준다
    const blank = fakeHistory({ paper: fakePaper({ res: '', addr: '', tel: '', cel: '', special: '', room: '', ins: '', sym: '', dx: [], rx: [], out: [] }) })
    fakeFetch(() => json(blank))
    await expect(api.getHistory(k, 0)).resolves.toEqual(blank)
    const full = fakeHistory()
    fakeFetch(() => json(full))
    await expect(api.getHistory(k, 0)).resolves.toEqual(full)

    // from>0 답에는 paper가 없다(AC-1501.1). 없어도 맞는 모양이다
    fakeFetch(() => json(fakeHistory({ paper: undefined })))
    await expect(api.getHistory(k, 5)).resolves.toMatchObject({ next: 5 })
  })

  it('AC-1413.2: 열쇠가 16자리 소문자 16진수가 아니거나 시작 위치가 0 이상의 정수가 아니면 묻지 않고 input 실패다', async () => {
    fakeFetch(() => json(fakeHistory()))
    for (const [k, from] of [
      ['../board', 0],
      ['3f9a00000000000', 0],
      ['V1234', 0],
      [`${fx.fakeKey(1)}/x`, 0],
      [fx.fakeKey(1), -1],
      [fx.fakeKey(1), 1.5],
      [fx.fakeKey(1), Number.NaN],
    ] as Array<[string, number]>)
      expect(await reasonOf(api.getHistory(k, from)), `${k} ${from}`).toBe('input')
    expect(calls).toEqual([])
  })

  it('AC-1407.11: 밖에서 준 signal을 끊으면 상세 읽기도 aborted 실패이고 늦은 답은 돌려주지 않는다', async () => {
    let late: (r: Response) => void = () => {}
    fakeFetch(() => new Promise<Response>((resolve) => (late = resolve)))
    const outside = new AbortController()
    const seen = watch(api.getHistory(fx.fakeKey(2), 0, { signal: outside.signal }))
    outside.abort()
    late(new Response(JSON.stringify(fakeHistory()), { status: 200 }))
    await settle()
    expect((seen.error as ApiErrorLike)?.reason).toBe('aborted')
    expect(calls[0].init.signal?.aborted).toBe(true)
  })
})

describe('api.js setXray', () => {
  it('AC-1413.2: setXray(k, on)은 POST /api/xray 하나를 X-Reception: 1·Content-Type: application/json·몸 { k, on }(256바이트 이하)로 보내고 204면 끝난다', async () => {
    fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    const k = fx.fakeKey(4)
    await expect(api.setXray(k, true)).resolves.toBeUndefined()
    await api.setXray(k, false)
    expect(calls.map((c) => c.url)).toEqual(['/api/xray', '/api/xray'])
    for (const [i, on] of [true, false].entries()) {
      const init = calls[i].init
      expect(init.method).toBe('POST')
      const headers = new Headers(init.headers)
      expect(headers.get('X-Reception')).toBe('1')
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(typeof init.body).toBe('string')
      expect(JSON.parse(init.body as string)).toEqual({ k, on })
      expect(new TextEncoder().encode(init.body as string).length).toBeLessThanOrEqual(256)
      expect(init.cache).toBe('no-store')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('AC-1407.4: 쓰기도 204가 아니면(200·400·404·405·503) status 실패, 연결 안 됨은 network, 5초 넘으면 timeout이다', async () => {
    const k = fx.fakeKey(4)
    for (const status of [200, 400, 404, 405, 503]) {
      fakeFetch(() => json({}, status))
      expect(await reasonOf(api.setXray(k, true)), String(status)).toBe('status')
    }
    fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await reasonOf(api.setXray(k, true))).toBe('network')
    fakeFetch(never)
    const seen = watch(api.setXray(k, true))
    await vi.advanceTimersByTimeAsync(5000)
    expect((seen.error as ApiErrorLike)?.reason).toBe('timeout')
  })

  it('AC-1413.2: 열쇠 모양이 틀리거나 on이 참·거짓이 아니면 보내지 않고 input 실패다', async () => {
    fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    expect(await reasonOf(api.setXray('V1234', true))).toBe('input')
    expect(await reasonOf(api.setXray(fx.fakeKey(4), 'true' as unknown as boolean))).toBe('input')
    expect(calls).toEqual([])
  })
})

describe('api.js 같은 PC에만 묻는다', () => {
  it('AC-1413.2: 세 함수가 보내는 요청은 모두 같은 주소의 /api/… 길이다(바깥 주소·//·http 없음, 같은 곳 방식·쿠키 없음·되돌림 따라가지 않음)', async () => {
    fakeFetch((call) =>
      call.url.startsWith('/api/xray')
        ? Promise.resolve(new Response(null, { status: 204 }))
        : call.url.startsWith('/api/visit/')
          ? json(fakeHistory())
          : json(fx.mockupBoard()),
    )
    await api.getBoard()
    await api.getBoard({ fresh: true })
    await api.getHistory(fx.fakeKey(1), 0)
    await api.getHistory(fx.fakeKey(1), 25)
    await api.setXray(fx.fakeKey(4), true)
    expect(calls.length).toBe(5)
    for (const { url, init } of calls) {
      expect(url).toMatch(/^\/api\/[a-z]/)
      expect(url).not.toMatch(/^\/\/|:\/\/|\\/)
      expect(init.mode).toBe('same-origin')
      expect(init.credentials).toBe('omit')
      expect(init.redirect).toBe('error')
    }
  })

  it("AC-1406.3: 쓰기(setXray·setArrange)는 referrerPolicy 'same-origin'으로 보낸다(아이패드·아이폰 WebKit은 'no-referrer'면 Origin: null을 붙여 도우미 쓰기 검사에 403으로 막힌다). 읽기는 'no-referrer' 그대로", async () => {
    fakeFetch((call) =>
      call.url.startsWith('/api/xray') || call.url.startsWith('/api/arrange')
        ? Promise.resolve(new Response(null, { status: 204 }))
        : call.url.startsWith('/api/visit/')
          ? json(fakeHistory())
          : json(fx.mockupBoard()),
    )
    await api.setXray(fx.fakeKey(4), true)
    await arrangeApi().setArrange(fx.fakeKey(23), 'step', 'sono')
    await api.getBoard()
    await api.getHistory(fx.fakeKey(1), 0)
    expect(calls.map((c) => [c.init.method ?? 'GET', c.init.referrerPolicy])).toEqual([
      ['POST', 'same-origin'],
      ['POST', 'same-origin'],
      ['GET', 'no-referrer'],
      ['GET', 'no-referrer'],
    ])
  })
})

// ---- 어레인지 (reception-arrange design.md 7·8·9절, TASK-11) --------------------------------------------------

interface ArrangeApi {
  setArrange?: (k: string, op: string, col?: string, v?: string, options?: { signal?: AbortSignal }) => Promise<void>
  getPrev?: (k: string, options?: { signal?: AbortSignal }) => Promise<unknown>
}

/** 아직 없으면(RED) 늘 실패하는 대역 */
function arrangeApi(): Required<ArrangeApi> {
  const more = api as unknown as ArrangeApi
  const fail = () => Promise.reject(new Error('없음'))
  return { setArrange: more.setArrange ?? fail, getPrev: more.getPrev ?? fail }
}

describe('api.js getBoard의 어레인지 자료', () => {
  it('AC-3308.1: 판의 arrange(rows·ended)는 모양이 맞으면 그대로 돌려주고, 없으면(옛 도우미) 맞는 모양으로 그대로 받는다(화면이 빈 표로 본다)', async () => {
    const board = fx.arrangeMockupBoard()
    fakeFetch(() => json(board))
    await expect(api.getBoard()).resolves.toEqual(board)
    fakeFetch(() => json(fx.mockupBoard()))
    await expect(api.getBoard()).resolves.toEqual(fx.mockupBoard())
    // 빈 표도 맞는 모양이다
    fakeFetch(() => json(fx.withArrange(fx.mockupBoard(), { rows: [], ended: [] })))
    await expect(api.getBoard()).resolves.toMatchObject({ arrange: { rows: [], ended: [] } })
  })

  it('AC-3308.1: arrange 모양이 틀리면(줄 열쇠·칸 단계·칸 이름 모양·자리비움·PT 먼저·끝난 줄 시각·allDone) shape 실패다', async () => {
    const bad: Array<(b: ReturnType<typeof fx.arrangeMockupBoard>) => void> = [
      (b) => ((b.arrange as unknown as Record<string, unknown>).rows = 'x'),
      (b) => ((b.arrange!.rows[0] as unknown as Record<string, unknown>).k = 'V1234'),
      (b) => ((b.arrange!.rows[0]!.cells.xray as unknown as Record<string, unknown>).st = 'gone'),
      (b) => ((b.arrange!.rows[0]!.cells.xray as unknown as Record<string, unknown>).manual = 'no'),
      (b) => ((b.arrange!.rows[0]!.cells.xray as unknown as Record<string, unknown>).at = 935),
      (b) => ((b.arrange!.rows[1]!.cells.carm as unknown as Record<string, unknown>).ord = 0),
      (b) => ((b.arrange!.rows[1]!.cells.carm as unknown as Record<string, unknown>).part = 3),
      (b) => ((b.arrange!.rows[0] as unknown as Record<string, unknown>).away = '오늘'),
      (b) => ((b.arrange!.rows[5] as unknown as Record<string, unknown>).ptf = { st: 'left', at: '10:40' }),
      (b) => ((b.arrange!.rows[0] as unknown as Record<string, unknown>).allDone = 1),
      (b) => ((b.arrange!.rows[0] as unknown as Record<string, unknown>).last = null),
      (b) => ((b.arrange!.ended[0] as unknown as Record<string, unknown>).endedAt = 1040),
      (b) => ((b.arrange!.rows[0]!.cells as unknown as Record<string, unknown>).xray = 'done'),
    ]
    for (const [i, change] of bad.entries()) {
      const board = fx.arrangeMockupBoard()
      change(board)
      fakeFetch(() => json(board))
      expect(await reasonOf(api.getBoard()), String(i)).toBe('shape')
    }
  })
})

describe('api.js getBoard의 어레인지 칸 시각', () => {
  it('AC-3308.15: 끝난 줄의 paid(참·거짓·없음)를 받고, 시각이 null인 끝난 줄은 paid일 때만 받는다. paid가 참·거짓이 아니면 shape 실패다', async () => {
    const base = fx.arrangeMockupBoard()
    const good = fx.withArrange(base, {
      rows: base.arrange!.rows,
      ended: [
        { k: fx.ARRANGE_KEYS.j, endedAt: '10:52', paid: true },
        { k: fx.ARRANGE_KEYS.i, endedAt: null, paid: true },
        { k: fx.ARRANGE_KEYS.h, endedAt: '10:15', paid: false },
      ],
    })
    fakeFetch(() => json(good))
    await expect(api.getBoard()).resolves.toEqual(good)
    const bad: Array<fx.FakeArrange["ended"]> = [
      [{ k: fx.ARRANGE_KEYS.j, endedAt: null, paid: false }],
      [{ k: fx.ARRANGE_KEYS.j, endedAt: null }],
      [{ k: fx.ARRANGE_KEYS.j, endedAt: '10:52', paid: 'yes' as unknown as boolean }],
      [{ k: fx.ARRANGE_KEYS.j, endedAt: '수납', paid: true }],
    ]
    for (const [i, ended] of bad.entries()) {
      fakeFetch(() => json(fx.withArrange(base, { rows: base.arrange!.rows, ended })))
      expect(await reasonOf(api.getBoard()), String(i)).toBe('shape')
    }
  })

  it('AC-3308.1: 칸 시각을 모르는 칸(at null, 비트 처방 시각이 빈 줄)이 있어도 판을 그대로 받는다(한 줄 때문에 끊김 화면이 되지 않는다)', async () => {
    const board = fx.arrangeMockupBoard()
    board.arrange!.rows[0]!.cells.xray!.at = null
    fakeFetch(() => json(board))
    await expect(api.getBoard()).resolves.toEqual(board)
  })
})

describe('api.js setArrange', () => {
  it('AC-3308.5: setArrange(k, op, col, v)는 POST /api/arrange 하나를 X-Reception: 1·Content-Type: application/json·몸 { k, op, col?, v? }(256바이트 이하)로 보내고 204면 끝난다', async () => {
    fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    const k = fx.fakeKey(23)
    await expect(arrangeApi().setArrange(k, 'step', 'sono')).resolves.toBeUndefined()
    await arrangeApi().setArrange(k, 'part', 'carm', '오른 무릎')
    await arrangeApi().setArrange(k, 'away', undefined, 'on')
    expect(calls.map((c) => c.url)).toEqual(['/api/arrange', '/api/arrange', '/api/arrange'])
    expect(calls.map((c) => JSON.parse(String(c.init.body)))).toEqual([
      { k, op: 'step', col: 'sono' },
      { k, op: 'part', col: 'carm', v: '오른 무릎' },
      { k, op: 'away', v: 'on' },
    ])
    for (const { init } of calls) {
      expect(init.method).toBe('POST')
      expect(new Headers(init.headers).get('X-Reception')).toBe('1')
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
      expect(new TextEncoder().encode(String(init.body)).length).toBeLessThanOrEqual(256)
      expect(init.credentials).toBe('omit')
      expect(init.mode).toBe('same-origin')
    }
  })

  it('AC-3308.9: 204가 아니면(200·400·404·503) status, 연결 안 됨은 network, 5초 넘으면 timeout 실패다', async () => {
    const k = fx.fakeKey(23)
    for (const status of [200, 400, 404, 503]) {
      fakeFetch(() => Promise.resolve(new Response(status === 200 ? '{}' : null, { status })))
      expect(await reasonOf(arrangeApi().setArrange(k, 'step', 'sono')), String(status)).toBe('status')
    }
    fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await reasonOf(arrangeApi().setArrange(k, 'step', 'sono'))).toBe('network')
    fakeFetch(never)
    const seen = watch(arrangeApi().setArrange(k, 'step', 'sono'))
    await vi.advanceTimersByTimeAsync(5000)
    expect((seen.error as ApiErrorLike)?.reason).toBe('timeout')
  })

  it('AC-3308.9 · AC-3502.5: 열쇠·op·칸 모양이 틀리거나 v가 글이 아니거나 몸이 1024바이트를 넘으면 보내지 않고 input 실패다', async () => {
    fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    const k = fx.fakeKey(23)
    expect(await reasonOf(arrangeApi().setArrange('V1234', 'step', 'sono'))).toBe('input')
    expect(await reasonOf(arrangeApi().setArrange(k, 'jump', 'sono'))).toBe('input')
    expect(await reasonOf(arrangeApi().setArrange(k, 'step', 'mri'))).toBe('input')
    expect(await reasonOf(arrangeApi().setArrange(k, 'part', 'sono', 3 as unknown as string))).toBe('input')
    expect(await reasonOf(arrangeApi().setArrange(k, 'part', 'sono', '가'.repeat(340)))).toBe('input')
    expect(calls).toEqual([])
  })
})

// ---- 고르기 목록 (reception-pick-lists design.md 3절, TASK-4) ----------------------------------------------------

interface PickApi {
  setArrange?: (k: string, op: string, col?: string, v?: string, t?: string, options?: { signal?: AbortSignal }) => Promise<void>
  setLists?: (picks: unknown, options?: { signal?: AbortSignal }) => Promise<void>
}

/** 아직 없으면(RED) 늘 실패하는 대역 */
function pickApi(): Required<PickApi> {
  const more = api as unknown as PickApi
  const fail = () => Promise.reject(new Error('없음'))
  return { setArrange: more.setArrange ?? fail, setLists: more.setLists ?? fail }
}

/** JSON 한 번 거친 사본(시험이 마음대로 고친다) */
function copyOf<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** 고르기 목록 규칙(AC-3501.2)이 받는 가장 긴 목록: 이름은 모두 10글자(한글 9 + 숫자 1), 개수는 모두 한도까지 */
function longestPicks(): fx.FakePicks {
  const names = (n: number, head: string) => Array.from({ length: n }, (_, i) => `${head}${'가'.repeat(7)}${String(i).padStart(2, '0')}`)
  return {
    carm: { procs: names(12, '시').map((n, i) => ({ n, noDrug: i === 0 })), drugs: names(12, '약') },
    sono: { parts: names(40, '부'), plains: names(12, '없'), withs: names(12, '같') },
  }
}

describe('api.js 판의 고르기 목록(picks)과 칸 이름표(tags)', () => {
  it('AC-3502.5: 칸 tags(글 목록)와 맨 위 picks가 맞으면 판을 그대로 돌려주고, picks가 없는 판(어레인지를 보내지 않음·옛 판)도 받는다', async () => {
    const board = fx.arrangeMockupBoard()
    expect(board.picks).toEqual(fx.defaultPicks())
    board.arrange!.rows[0]!.cells.sono!.tags = ['채혈']
    board.arrange!.rows[1]!.cells.carm!.tags = ['TP']
    board.arrange!.rows[6]!.cells.sono!.part = '오른 어깨|왼 무릎'
    board.arrange!.rows[6]!.cells.sono!.tags = ['DNA', '채혈']
    fakeFetch(() => json(board))
    await expect(api.getBoard()).resolves.toEqual(board)
    // 비어 있는 무리도 맞는 모양이다(개수 규칙은 도우미가 본다)
    const few = copyOf(board)
    few.picks = { carm: { procs: [{ n: '허리', noDrug: false }], drugs: [] }, sono: { parts: [], plains: ['소독'], withs: [] } }
    fakeFetch(() => json(few))
    await expect(api.getBoard()).resolves.toEqual(few)
    const none = copyOf(board)
    delete none.picks
    fakeFetch(() => json(none))
    await expect(api.getBoard()).resolves.toEqual(none)
    fakeFetch(() => json(fx.mockupBoard()))
    await expect(api.getBoard()).resolves.toEqual(fx.mockupBoard())
  })

  it('AC-3502.5: 칸 tags가 없거나 글 목록이 아니면, picks 모양(C-ARM 시술 { n, noDrug }·약재, SONO 부위·부위 없이·같이 하는 것)이 틀리면 shape 실패다', async () => {
    type Loose = Record<string, unknown>
    const bad: Array<(b: fx.FakeBoard) => void> = [
      (b) => delete (b.arrange!.rows[0]!.cells.xray as unknown as Loose).tags,
      (b) => ((b.arrange!.rows[0]!.cells.sono as unknown as Loose).tags = '채혈'),
      (b) => ((b.arrange!.rows[1]!.cells.carm as unknown as Loose).tags = [3]),
      (b) => ((b.arrange!.rows[1]!.cells.carm as unknown as Loose).tags = null),
      (b) => ((b as unknown as Loose).picks = null),
      (b) => ((b as unknown as Loose).picks = []),
      (b) => delete (b.picks as unknown as Loose).carm,
      (b) => delete (b.picks as unknown as Loose).sono,
      (b) => ((b.picks!.carm as unknown as Loose).procs = '목'),
      (b) => ((b.picks!.carm.procs as unknown[])[0] = '목'),
      (b) => ((b.picks!.carm.procs[0] as unknown as Loose).n = 3),
      (b) => ((b.picks!.carm.procs[3] as unknown as Loose).noDrug = 'yes'),
      (b) => delete (b.picks!.carm.procs[0] as unknown as Loose).noDrug,
      (b) => ((b.picks!.carm.drugs as unknown[])[0] = 1),
      (b) => delete (b.picks!.carm as unknown as Loose).drugs,
      (b) => ((b.picks!.sono as unknown as Loose).parts = '어깨'),
      (b) => ((b.picks!.sono.plains as unknown[])[1] = null),
      (b) => delete (b.picks!.sono as unknown as Loose).withs,
    ]
    for (const [i, change] of bad.entries()) {
      const board = copyOf(fx.arrangeMockupBoard())
      change(board)
      fakeFetch(() => json(board))
      expect(await reasonOf(api.getBoard()), String(i)).toBe('shape')
    }
  })
})

describe('api.js setArrange의 이름표(t)', () => {
  it('AC-3502.5: setArrange(k, op, col, v, t)는 t(이름표를 "|"로 이은 글)가 있으면 몸에 더하고 빈 글이면 뺀다. 6번째 인자가 signal이다', async () => {
    fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    const k = fx.fakeKey(23)
    await expect(pickApi().setArrange(k, 'add', 'carm', '허리', 'TP')).resolves.toBeUndefined()
    await pickApi().setArrange(k, 'part', 'sono', '오른 어깨|왼 무릎', 'DNA|채혈')
    await pickApi().setArrange(k, 'add', 'sono', '소독', '')
    await pickApi().setArrange(k, 'add', 'carm', '리덕션', undefined)
    await pickApi().setArrange(k, 'step', 'sono')
    expect(calls.map((c) => [c.url, JSON.parse(String(c.init.body))])).toEqual([
      ['/api/arrange', { k, op: 'add', col: 'carm', v: '허리', t: 'TP' }],
      ['/api/arrange', { k, op: 'part', col: 'sono', v: '오른 어깨|왼 무릎', t: 'DNA|채혈' }],
      ['/api/arrange', { k, op: 'add', col: 'sono', v: '소독' }],
      ['/api/arrange', { k, op: 'add', col: 'carm', v: '리덕션' }],
      ['/api/arrange', { k, op: 'step', col: 'sono' }],
    ])
    fakeFetch(never)
    const controller = new AbortController()
    const seen = watch(pickApi().setArrange(k, 'add', 'carm', '허리', 'TP', { signal: controller.signal }))
    await settle()
    controller.abort()
    await settle()
    expect((seen.error as ApiErrorLike)?.reason).toBe('aborted')
  })

  it('AC-3502.5: /api/arrange 몸은 1024바이트까지 보낸다(가장 긴 SONO 6줄 + 같이 하는 것 12개). 넘거나 t가 글이 아니면 보내지 않고 input 실패다', async () => {
    fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    const k = fx.fakeKey(23)
    const v = Array.from({ length: 6 }, () => `양 ${'가'.repeat(10)}`).join('|')
    const t = longestPicks().sono.withs.join('|')
    await expect(pickApi().setArrange(k, 'part', 'sono', v, t)).resolves.toBeUndefined()
    expect(calls.length).toBe(1)
    // 1024바이트를 갓 넘는 몸(1025~1027바이트)
    const room = 1024 - new TextEncoder().encode(String(calls[0]!.init.body)).length
    const over = '가'.repeat(Math.floor(room / 3) + 1)
    expect(await reasonOf(pickApi().setArrange(k, 'part', 'sono', v, t + over))).toBe('input')
    expect(await reasonOf(pickApi().setArrange(k, 'add', 'carm', '허리', 3 as unknown as string))).toBe('input')
    expect(await reasonOf(pickApi().setArrange(k, 'add', 'carm', '허리', ['TP'] as unknown as string))).toBe('input')
    expect(calls.length).toBe(1)
  })
})

describe('api.js setLists', () => {
  it('AC-3502.5: setLists(picks)는 POST /api/lists 하나를 쓰기 모양(X-Reception: 1·JSON·같은 곳·리퍼러 same-origin)으로, 몸은 picks 모양 칸만 담아 보내고 204면 끝난다', async () => {
    fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    const picks = fx.defaultPicks()
    await expect(pickApi().setLists(picks)).resolves.toBeUndefined()
    const extra = { ...copyOf(picks), x: '더 붙은 칸', carm: { ...picks.carm, y: 1, procs: picks.carm.procs.map((p) => ({ ...p, z: true })) } }
    await pickApi().setLists(extra)
    expect(calls.map((c) => c.url)).toEqual(['/api/lists', '/api/lists'])
    for (const { init } of calls) {
      expect(JSON.parse(String(init.body))).toEqual(picks)
      expect(init.method).toBe('POST')
      expect(new Headers(init.headers).get('X-Reception')).toBe('1')
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
      expect(init.referrerPolicy).toBe('same-origin')
      expect(init.credentials).toBe('omit')
      expect(init.mode).toBe('same-origin')
      expect(init.redirect).toBe('error')
    }
  })

  it('AC-3502.5: 204가 아니면(200·400·403·404·503) status, 연결 안 됨은 network, 5초 넘으면 timeout, 밖 signal이 끊기면 aborted 실패다', async () => {
    const picks = fx.defaultPicks()
    for (const status of [200, 400, 403, 404, 503]) {
      fakeFetch(() => Promise.resolve(new Response(status === 200 ? '{}' : null, { status })))
      expect(await reasonOf(pickApi().setLists(picks)), String(status)).toBe('status')
    }
    fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await reasonOf(pickApi().setLists(picks))).toBe('network')
    fakeFetch(never)
    const late = watch(pickApi().setLists(picks))
    await vi.advanceTimersByTimeAsync(5000)
    expect((late.error as ApiErrorLike)?.reason).toBe('timeout')
    const controller = new AbortController()
    const cut = watch(pickApi().setLists(picks, { signal: controller.signal }))
    await settle()
    controller.abort()
    await settle()
    expect((cut.error as ApiErrorLike)?.reason).toBe('aborted')
  })

  it('AC-3502.5: 몸은 4096바이트까지 보낸다(규칙이 받는 가장 긴 목록). picks 모양이 틀리거나 몸이 4096바이트를 넘으면 보내지 않고 input 실패다', async () => {
    fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    await expect(pickApi().setLists(longestPicks())).resolves.toBeUndefined()
    expect(calls.length).toBe(1)
    const big = longestPicks()
    big.sono.parts = Array.from({ length: 130 }, () => '가'.repeat(10))
    expect(new TextEncoder().encode(JSON.stringify(big)).length).toBeGreaterThan(4096)
    expect(await reasonOf(pickApi().setLists(big))).toBe('input')
    const wrong: unknown[] = [
      null,
      [],
      '목',
      { carm: fx.defaultPicks().carm },
      { sono: fx.defaultPicks().sono },
      { ...fx.defaultPicks(), carm: { procs: ['목'], drugs: [] } },
      { ...fx.defaultPicks(), carm: { procs: [{ n: '목', noDrug: 'no' }], drugs: [] } },
      { ...fx.defaultPicks(), carm: { procs: [{ n: '목', noDrug: false }], drugs: [1] } },
      { ...fx.defaultPicks(), sono: { parts: '어깨', plains: [], withs: [] } },
      { ...fx.defaultPicks(), sono: { parts: [], plains: [], withs: [null] } },
    ]
    for (const [i, picks] of wrong.entries()) expect(await reasonOf(pickApi().setLists(picks)), String(i)).toBe('input')
    expect(calls.length).toBe(1)
  })
})

describe('api.js getPrev', () => {
  it('AC-3309.1: getPrev(k)는 GET /api/visit/{열쇠}/prev 하나를 묻고 prev(지난 내원이 없으면 null)를 돌려준다', async () => {
    const prev = fx.fakePrev()
    fakeFetch(() => json({ prev }))
    await expect(arrangeApi().getPrev(fx.fakeKey(21))).resolves.toEqual(prev)
    fakeFetch(() => json({ prev: null }))
    await expect(arrangeApi().getPrev(fx.fakeKey(23))).resolves.toBeNull()
    expect(calls.map((c) => c.url)).toEqual([`/api/visit/${fx.fakeKey(21)}/prev`, `/api/visit/${fx.fakeKey(23)}/prev`])
    expect(calls.every((c) => (c.init.method ?? 'GET') === 'GET' && c.init.credentials === 'omit')).toBe(true)
  })

  it('AC-3309.5: 200이 아니거나 모양이 틀린 답(prev 없음·날짜·글 칸·상병·처방 모양)은 실패다. 열쇠 모양이 틀리면 묻지 않는다', async () => {
    const k = fx.fakeKey(21)
    fakeFetch(() => json({ prev: null }, 503))
    expect(await reasonOf(arrangeApi().getPrev(k))).toBe('status')
    for (const body of [
      {},
      { prev: 'x' },
      { prev: { ...fx.fakePrev(), date: 20261026 } },
      { prev: { ...fx.fakePrev(), sym: null } },
      { prev: { ...fx.fakePrev(), dx: [{ code: 'M1', name: '가상' }] } },
      { prev: { ...fx.fakePrev(), rx: [{ code: 'G1', name: '가상' }] } },
      { prev: { ...fx.fakePrev(), out: 'x' } },
    ]) {
      fakeFetch(() => json(body))
      expect(await reasonOf(arrangeApi().getPrev(k)), JSON.stringify(body)).toBe('shape')
    }
    calls = []
    expect(await reasonOf(arrangeApi().getPrev('V1234'))).toBe('input')
    expect(calls).toEqual([])
  })
})

// ---- 지난 진료기록부 여러 장 (reception-memo-papers design.md 4절, TASK-7) ------------------------------------------

type GetPapers = (k: string, from: number, options?: { signal?: AbortSignal }) => Promise<unknown>

/** 아직 없으면(RED) 늘 실패하는 대역 */
function papersApi(): GetPapers {
  const more = api as unknown as { getPapers?: GetPapers }
  return more.getPapers ?? (() => Promise.reject(new Error('없음')))
}

describe('api.js getPapers', () => {
  it('AC-3404.3: getPapers(k, 0)는 GET /api/visit/{열쇠}/papers?from=0 하나를 묻고 답 { papers, total, next }를 그대로 돌려준다(지난 내원이 없으면 빈 papers)', async () => {
    const page = fx.fakePapers(36, 0)
    fakeFetch(() => json(page))
    await expect(papersApi()(fx.fakeKey(21), 0)).resolves.toEqual(page)
    fakeFetch(() => json({ papers: [], total: 0, next: null }))
    await expect(papersApi()(fx.fakeKey(23), 0)).resolves.toEqual({ papers: [], total: 0, next: null })
    expect(calls.map((c) => c.url)).toEqual([`/api/visit/${fx.fakeKey(21)}/papers?from=0`, `/api/visit/${fx.fakeKey(23)}/papers?from=0`])
    expect(calls.every((c) => (c.init.method ?? 'GET') === 'GET' && c.init.credentials === 'omit' && c.init.redirect === 'error')).toBe(true)
  })

  it('AC-3404.4: getPapers(k, next)는 그 from으로 묻고, 끝 쪽(next null)도 받는다', async () => {
    const page = fx.fakePapers(36, 2)
    expect(page.papers).toHaveLength(3)
    fakeFetch(() => json(page))
    await expect(papersApi()(fx.fakeKey(21), 2)).resolves.toEqual(page)
    const last = fx.fakePapers(7, 5)
    expect(last.next).toBeNull()
    fakeFetch(() => json(last))
    await expect(papersApi()(fx.fakeKey(21), 5)).resolves.toEqual(last)
    expect(calls.map((c) => c.url)).toEqual([`/api/visit/${fx.fakeKey(21)}/papers?from=2`, `/api/visit/${fx.fakeKey(21)}/papers?from=5`])
  })

  it('AC-3404.4 · AC-3404.5: 200이 아니거나 모양이 틀린 답(papers·total·next·종이 칸)은 실패다. 열쇠·from 모양이 틀리면 묻지 않는다', async () => {
    const k = fx.fakeKey(21)
    fakeFetch(() => json(fx.fakePapers(36, 0), 503))
    expect(await reasonOf(papersApi()(k, 0))).toBe('status')
    const good = fx.fakePapers(36, 0)
    for (const body of [
      {},
      { ...good, papers: 'x' },
      { ...good, papers: [{ ...good.papers[0], date: 20261029 }] },
      { ...good, papers: [{ ...good.papers[0], sym: null }] },
      { ...good, papers: [{ ...good.papers[0], dx: [{ code: 'M1', name: '가상' }] }] },
      { ...good, papers: [{ ...good.papers[0], rx: [{ code: 'G1', name: '가상' }] }] },
      { ...good, total: -1 },
      { ...good, total: '36' },
      { ...good, next: '2' },
      { ...good, next: 0 },
      { ...good, next: 37 },
    ]) {
      fakeFetch(() => json(body))
      expect(await reasonOf(papersApi()(k, 0)), JSON.stringify(body)).toBe('shape')
    }
    calls = []
    expect(await reasonOf(papersApi()('V1234', 0))).toBe('input')
    expect(await reasonOf(papersApi()(k, -1))).toBe('input')
    expect(await reasonOf(papersApi()(k, 1.5))).toBe('input')
    expect(calls).toEqual([])
  })
})
