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

/** 상세 답(design.md 5절, HistoryBuilder.cs ToJson). 가짜 자료 */
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
})
