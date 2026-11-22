// 입지 분석 화면의 부르기(specs/location TASK-24, REQ-7908 · AC-7908.2, design.md 1·3·5절). 실제 서버·파일을 부르지 않는다(fetch 흉내).
// 바깥 자료는 같은 origin 경로(POST /api/ai/location/query)로만, 정적 파일은 /location/dongs·/location/transit에서만 받는다.
// 지역 이름·코드·숫자는 모두 지어낸 값이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Query } from '@/types/location'
import { queryLocation, readBus, readDongIndex, readDongs, readKeys, readRail, readTransitIndex } from './clients'

const SECRET = 'secret detail'
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const
const FAILED = { ok: false, code: 'failed' }

type Init = RequestInit & { signal: AbortSignal }
const fetchMock = vi.fn<(input: string, init: Init) => Promise<Response>>()

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))
const reply = (body: unknown, status = 200) => fetchMock.mockImplementation(() => json(body, status))
/** 끝나지 않다가 끊기면(abort) 던지는 부르기 */
const hang = () =>
  fetchMock.mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
  )
const lastCall = () => {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [input, init] = fetchMock.mock.calls[0]
  return { input, init }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  for (const method of CONSOLE_METHODS) vi.spyOn(console, method)
})
afterEach(() => {
  for (const method of CONSOLE_METHODS) expect(console[method]).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ── 바깥 자료 ────────────────────────────────────────────────

const POP: Query = { kind: 'pop-age', dongs: ['9999051500'], ym: '2025-10' }
const OK_REPLY = { ok: true, value: [{ code10: '9999051500', bands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }], src: 'pop-age', asOf: '2025-10-31' }

describe('queryLocation — POST /api/ai/location/query', () => {
  it('AC-7908.2: 같은 origin 경로로 POST(redirect error·no-store·JSON)하고 몸통은 검사한 칸만 담는다', async () => {
    reply(OK_REPLY)
    expect(await queryLocation(POP)).toEqual(OK_REPLY)
    const { input, init } = lastCall()
    expect(input).toBe('/api/ai/location/query')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', headers: { 'Content-Type': 'application/json' } })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init.body))).toEqual(POP)

    fetchMock.mockClear()
    reply(OK_REPLY)
    await queryLocation({ kind: 'k-address', q: '  가나시청  ' })
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ kind: 'k-address', q: '가나시청' })
  })

  it('AC-7908.2: 정해 두지 않은 칸(카카오 주소 글 등)이 붙거나 범위를 벗어난 몸통은 보내지 않고 failed', async () => {
    const bad: unknown[] = [
      { ...POP, address: '가나시 다라로 77' },
      { kind: 'stores', at: { lat: 37.5, lng: 127 }, r: 5000 },
      { kind: 'k-near', at: { lat: 40, lng: 127 }, r: 500, cat: 'PM9' },
      { kind: 'nope' },
      null,
    ]
    for (const q of bad) expect(await queryLocation(q as Query)).toEqual(FAILED)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-7908.2: 답은 정해 둔 칸만 새로 담고(출처·기준 날짜), 못 됨은 까닭(열쇠 없음이면 어느 열쇠)만 돌려준다', async () => {
    reply({ ...OK_REPLY, debug: SECRET })
    expect(await queryLocation(POP)).toEqual(OK_REPLY)

    const cases: [unknown, unknown][] = [
      [{ ok: false, code: 'no-key', key: 'data' }, { ok: false, code: 'no-key', key: 'data' }],
      [{ ok: false, code: 'no-key', key: 'kakao', message: SECRET }, { ok: false, code: 'no-key', key: 'kakao' }],
      [{ ok: false, code: 'not-applied' }, { ok: false, code: 'not-applied' }],
      [{ ok: false, code: 'failed' }, FAILED],
      [{ ok: false, code: 'boom' }, FAILED],
      [{ ok: false, code: 'no-key', key: 'naver' }, FAILED],
      [{ ok: true, value: 1, asOf: '2025-10-31' }, FAILED], // 출처 없음
      [{ ok: true, value: 1, src: 'pop-age', asOf: 20251031 }, FAILED],
      [{ ok: true, src: 'pop-age', asOf: '2025-10-31' }, FAILED], // 값 없음
      [[OK_REPLY], FAILED],
      ['ok', FAILED],
    ]
    for (const [body, expected] of cases) {
      fetchMock.mockReset()
      reply(body)
      expect(await queryLocation(POP)).toEqual(expected)
    }
  })

  it('AC-7908.2: 200이 아님·JSON이 아님·연결 실패·돌려보냄(redirect: error가 던짐)은 failed(오류 글 없음)', async () => {
    for (const status of [400, 401, 403, 404, 500, 302]) {
      fetchMock.mockReset()
      fetchMock.mockImplementation(() => Promise.resolve(new Response(status === 302 ? null : JSON.stringify(OK_REPLY), { status })))
      expect(await queryLocation(POP)).toEqual(FAILED)
    }
    fetchMock.mockReset()
    fetchMock.mockImplementation(() => Promise.resolve(new Response(`<html>${SECRET}</html>`, { status: 200 })))
    expect(await queryLocation(POP)).toEqual(FAILED)
    fetchMock.mockReset()
    fetchMock.mockImplementation(() => Promise.reject(new TypeError(`redirect ${SECRET}`)))
    const result = await queryLocation(POP)
    expect(result).toEqual(FAILED)
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('AC-7908.2: 10초 안에 답이 없으면 끊고 failed', async () => {
    vi.useFakeTimers()
    hang()
    let done: unknown = 'waiting'
    void queryLocation(POP).then((r) => (done = r))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(done).toBe('waiting')
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toEqual(FAILED)
    expect(lastCall().init.signal.aborted).toBe(true)
  })
})

describe('readKeys — GET /api/ai/location/keys', () => {
  it('AC-7908.2: 같은 origin GET(redirect error·no-store)으로 열쇠 둘의 상태만 받는다', async () => {
    reply({ data: 'ok', kakao: 'missing', extra: SECRET })
    expect(await readKeys()).toEqual({ data: 'ok', kakao: 'missing' })
    const { input, init } = lastCall()
    expect(input).toBe('/api/ai/location/keys')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('AC-7908.2: 모양이 틀리거나 못 받으면 둘 다 failed', async () => {
    const failedKeys = { data: 'failed', kakao: 'failed' }
    for (const [body, status] of [
      [{ data: 'ok', kakao: 'open' }, 200],
      [{ data: 'ok' }, 200],
      [{ data: 'ok', kakao: 'ok' }, 403],
    ] as const) {
      fetchMock.mockReset()
      reply(body, status)
      expect(await readKeys()).toEqual(failedKeys)
    }
    fetchMock.mockReset()
    fetchMock.mockImplementation(() => Promise.reject(new TypeError(SECRET)))
    expect(await readKeys()).toEqual(failedKeys)
  })
})

// ── 정적 파일(동 경계·정류장·역 좌표) ───────────────────────

const ring = [
  [127.01, 37.51],
  [127.02, 37.51],
  [127.02, 37.52],
  [127.01, 37.51],
]
const DONG_INDEX = {
  asOf: '2025-06-30',
  sidos: [{ code2: '99', name: '가나도', sggs: [{ code5: '99910', name: '가나시', bbox: [127.0, 37.5, 127.1, 37.6] }] }],
}
const DONG_FILE = {
  asOf: '2025-06-30',
  dongs: [
    { code10: '9991051000', name: '가동', areaM2: 1200000, center: [127.015, 37.515], rings: [ring] },
    { code10: '9991052000', name: '나동', areaM2: 800000, center: [127.03, 37.53], rings: null, unmatched: true },
  ],
}
const TRANSIT_INDEX = { asOf: '2025-09-30', sggs: ['99910', '99920'] }
const BUS_FILE = {
  asOf: '2025-09-30',
  src: 'bus-stops',
  stops: [
    { no: '1001', name: '가나역', ars: '01-001', lng: 127.01, lat: 37.51 },
    { no: '1002', name: '다라시장', ars: null, lng: 127.02, lat: 37.52 },
  ],
}
const RAIL_FILE = { asOf: '2025-09-30', src: 'rail-stations', stations: [{ name: '가나', line: '9호선', lng: 127.01, lat: 37.51 }] }

describe('정적 파일 읽기 — 같은 origin /location/…', () => {
  const readers: [string, () => Promise<unknown>, string, unknown][] = [
    ['readDongIndex', () => readDongIndex(), '/location/dongs/index.json', DONG_INDEX],
    ['readDongs', () => readDongs('99910'), '/location/dongs/99910.json', DONG_FILE],
    ['readTransitIndex', () => readTransitIndex(), '/location/transit/index.json', TRANSIT_INDEX],
    ['readRail', () => readRail(), '/location/transit/rail.json', RAIL_FILE],
    ['readBus', () => readBus('99910'), '/location/transit/bus/99910.json', BUS_FILE],
  ]

  it.each(readers)('AC-7908.2: %s — 정해 둔 파일 자리를 GET(redirect error)하고 모양을 본 값을 돌려준다', async (_name, read, path, body) => {
    reply(body)
    expect(await read()).toEqual(body)
    const { input, init } = lastCall()
    expect(input).toBe(path)
    expect(init.redirect).toBe('error')
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each(readers)('AC-7908.2: %s — 없음(404)·JSON 아님·연결 실패·틀린 머리 모양은 null', async (_name, read) => {
    for (const make of [
      () => json({ error: SECRET }, 404),
      () => Promise.resolve(new Response('<html>', { status: 200 })),
      () => Promise.reject(new TypeError(SECRET)),
      () => json({ asOf: 20250630 }),
      () => json([]),
    ]) {
      fetchMock.mockReset()
      fetchMock.mockImplementation(make)
      expect(await read()).toBeNull()
    }
  })

  it.each(readers)('AC-7908.2: %s — 10초 안에 다 못 받으면 끊고 null', async (_name, read) => {
    vi.useFakeTimers()
    hang()
    let done: unknown = 'waiting'
    void read().then((r) => (done = r))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(done).toBe('waiting')
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBeNull()
  })

  it('AC-7908.2: 시군구 코드가 5자리 숫자가 아니면 부르지 않고 null(다른 자리를 못 고르게)', async () => {
    for (const code of ['', '9991', '999100', '../99', '99a10', 'index']) {
      expect(await readDongs(code)).toBeNull()
      expect(await readBus(code)).toBeNull()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-7908.2: 줄 모양이 틀린 동·시군구·정류장·역은 빼고 나머지를 돌려준다', async () => {
    reply({
      ...DONG_FILE,
      dongs: [
        ...DONG_FILE.dongs,
        { code10: '999105', name: '짧은동', areaM2: 1, center: [127, 37.5], rings: null },
        { code10: '9991053000', name: '점틀림', areaM2: 1, center: [127, 'x'], rings: null },
        { code10: '9991054000', name: '고리틀림', areaM2: 1, center: [127, 37.5], rings: [[[127, 37.5], [127]]] },
        { code10: '9991055000', name: '넓이틀림', areaM2: -1, center: [127, 37.5], rings: null },
        null,
      ],
    })
    expect(await readDongs('99910')).toEqual(DONG_FILE)

    fetchMock.mockReset()
    reply({
      ...DONG_INDEX,
      sidos: [
        { ...DONG_INDEX.sidos[0], sggs: [...DONG_INDEX.sidos[0].sggs, { code5: '9991', name: '짧은시', bbox: [1, 2, 3, 4] }, { code5: '99920', name: '네모틀림', bbox: [1, 2, 3] }] },
        { code2: '9', name: '짧은도', sggs: [] },
      ],
    })
    expect(await readDongIndex()).toEqual(DONG_INDEX)

    fetchMock.mockReset()
    reply({ ...TRANSIT_INDEX, sggs: [...TRANSIT_INDEX.sggs, '999', 99930] })
    expect(await readTransitIndex()).toEqual(TRANSIT_INDEX)

    fetchMock.mockReset()
    reply({ ...BUS_FILE, stops: [...BUS_FILE.stops, { no: '1003', name: '마바', ars: 7, lng: 127, lat: 37.5 }, { no: '1004', name: '사아', ars: null, lng: 'x', lat: 37.5 }] })
    expect(await readBus('99910')).toEqual(BUS_FILE)

    fetchMock.mockReset()
    reply({ ...RAIL_FILE, stations: [...RAIL_FILE.stations, { name: '자차', lng: 127, lat: 37.5 }] })
    expect(await readRail()).toEqual(RAIL_FILE)
  })
})
