import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Adapter, QueryOf } from '@/types/location'
import { checkQuery } from '@/lib/location/query'

// POST /api/ai/location/query — 입지 분석 바깥 자료(specs/location REQ-7903 AC-7903.1~4, design.md 3·4절).
// readMe·registry는 가짜, 바깥 fetch는 전역 가짜(진짜 카카오·공공데이터포털에 붙지 않는다). 열쇠는 지어낸 글자다
const mocks = vi.hoisted(() => ({
  readMe: vi.fn(),
  supabaseServer: vi.fn(),
  registry: {} as Record<string, unknown>,
}))
vi.mock('@/lib/auth/hospital.server', () => {
  class NotSignedInError extends Error {}
  class HospitalReadError extends Error {}
  return { readMe: mocks.readMe, NotSignedInError, HospitalReadError }
})
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: mocks.supabaseServer }))
vi.mock('../registry', () => ({ REGISTRY: mocks.registry }))

import { NotSignedInError } from '@/lib/auth/hospital.server'
import * as route from './route'

const { POST } = route
const LOG = '[api/ai/location]'
const KAKAO_KEY = 'kakao-rest-FAKE-0001'
const DATA_KEY = 'DATA+FAKE/key==0002'
const AT = { lat: 37.566535, lng: 126.977969 }

const HOSPITAL = {
  id: 'hosp-7f3a',
  name: '가나정형외과의원',
  applicantName: '김원장',
  phone: null,
  email: 'clinic@ga.na',
  status: 'approved',
  createdAt: '2026-10-01T00:00:00Z',
}
const ADMIN = { email: 'admin@ga.na', hospital: HOSPITAL, isAdmin: true }

// ── 가짜 읽는 곳(registry) ─────────────────────────────
const ADDRESS_ANSWER = '{"documents":[{"address_name":"서울 중구 태평로1가 31","x":"126.977969","y":"37.566535"}],"meta":{"total_count":1}}'

function kakaoAddress(): Adapter<'k-address'> {
  return {
    kind: 'k-address',
    src: 'kakao-local',
    key: 'kakao',
    requests: vi.fn((q: QueryOf<'k-address'>) => [{ url: `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q.q)}` }]),
    parse: vi.fn((texts: string[], _q: QueryOf<'k-address'>, today: string) => ({
      ok: true as const,
      value: { names: (JSON.parse(texts[0]) as { documents: { address_name: string }[] }).documents.map((d) => d.address_name) },
      asOf: today,
    })),
  }
}

// 쪽 수만큼 요청을 만드는 공공 자료(인구). 답 글자를 차례대로 모은다
function popAge(pages: number): Adapter<'pop-age'> {
  return {
    kind: 'pop-age',
    src: 'mois-pop-age',
    key: 'data',
    requests: vi.fn((q: QueryOf<'pop-age'>) =>
      Array.from({ length: pages }, (_, i) => ({
        url: `https://apis.data.go.kr/1741000/admmSexdAgePpltn/selectAdmmSexdAgePpltn?admmCd=${q.dongs[0]}&srchFrYm=${q.ym.replace('-', '')}&pageNo=${i + 1}&type=JSON`,
      })),
    ),
    parse: vi.fn((texts: string[]) => ({ ok: true as const, value: texts, asOf: '2026-09-30' })),
  }
}

const ADDRESS_Q = { kind: 'k-address', q: '서울특별시청' }
const POP_Q = { kind: 'pop-age', dongs: ['1111051500'], ym: '2026-09' }

// ── 가짜 바깥 fetch ─────────────────────────────────────
type Seen = { url: string; init: RequestInit }
function site(answer: (url: string, n: number) => Response | Promise<Response> = () => new Response(ADDRESS_ANSWER)) {
  const seen: Seen[] = []
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    seen.push({ url, init })
    return answer(url, seen.length)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, seen }
}

// 답을 시험이 정한 차례로 주는 가짜 fetch. 끊기면(abort) 진짜 fetch처럼 던진다
type Pending = { url: string; signal: AbortSignal; answer: (res: Response) => void; fail: () => void }
function gate(): Pending[] {
  const pending: Pending[] = []
  const fn = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init.signal as AbortSignal
        signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')))
        pending.push({ url, signal, answer: resolve, fail: () => reject(new TypeError('fetch failed')) })
      }),
  )
  vi.stubGlobal('fetch', fn)
  return pending
}
// 진짜 차례 넘김(setImmediate는 가짜 시계가 아니다)으로 약속을 다 풀어 준다
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r))
}

// TASK-47 진짜 미등록 답 모양(HTTP 403 또는 401 + JSON 몸통)
const NOT_REGISTERED_JSON = '{"response":{"header":{"resultCode":"30","resultMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}'

function post(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/location/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'sb-token=SECRET-COOKIE' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

async function bodyOf(res: Response): Promise<unknown> {
  const text = await res.text()
  return text === '' ? null : JSON.parse(text)
}

function setRegistry(...adapters: Adapter[]) {
  for (const k of Object.keys(mocks.registry)) delete mocks.registry[k]
  for (const a of adapters) mocks.registry[a.kind] = a
}

let errorSpy: ReturnType<typeof vi.spyOn>
let otherSpies: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T16:00:00Z')) // 한국 2026-11-22 01:00 — UTC로는 아직 11-21
  mocks.readMe.mockReset()
  mocks.supabaseServer.mockReset()
  mocks.readMe.mockResolvedValue(ADMIN)
  vi.stubEnv('KAKAO_REST_KEY', KAKAO_KEY)
  vi.stubEnv('DATA_GO_KR_KEY', DATA_KEY)
  setRegistry(kakaoAddress(), popAge(1))
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  otherSpies = (['log', 'warn', 'info', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})
afterEach(() => {
  // error 밖의 console은 어떤 시험에서도 불리지 않고, 서버는 DB 클라이언트를 만들지 않는다
  for (const spy of otherSpies) expect(spy).not.toHaveBeenCalled()
  expect(mocks.supabaseServer).not.toHaveBeenCalled()
  for (const spy of otherSpies) spy.mockRestore()
  errorSpy.mockRestore()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

// 로그·답 어디에도 열쇠·바깥 오류 글이 없다
function expectNoSecrets(...texts: string[]) {
  const logged = JSON.stringify(errorSpy.mock.calls)
  for (const t of [logged, ...texts]) {
    expect(t).not.toContain(KAKAO_KEY)
    expect(t).not.toContain(DATA_KEY)
    expect(t).not.toContain(encodeURIComponent(DATA_KEY))
    expect(t).not.toContain('SECRET-COOKIE')
  }
}

describe('경로 설정', () => {
  it('AC-7903.5: nodejs 런타임 · 120초(비급여 한 번 60초 + 의원 목록) · Next가 아는 이름(POST·runtime·maxDuration)만 내보낸다', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBe(120)
    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime'])
  })
})

describe('AC-7903.1 로그인·관리자', () => {
  it('AC-7903.1: 로그인 안 함은 401(몸통 없음)이고 몸통을 보기 전에 막아 바깥을 부르지 않는다', async () => {
    const f = site()
    mocks.readMe.mockRejectedValue(new NotSignedInError('로그인하지 않았어요'))
    for (const req of [post(ADDRESS_Q), post('{깨진', true)]) {
      const res = await POST(req)
      expect(res.status).toBe(401)
      expect(await res.text()).toBe('')
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect(f.fn).not.toHaveBeenCalled()
    expect(mocks.registry['k-address']).toBeDefined()
    expect((mocks.registry['k-address'] as Adapter).requests).not.toHaveBeenCalled()
  })

  it('AC-7903.1: 관리자 아님·데스크·승인 대기는 403(몸통 없음)이고 바깥을 부르지 않는다', async () => {
    const f = site()
    for (const me of [
      { ...ADMIN, isAdmin: false },
      { email: 'desk@ga.na', hospital: null, isAdmin: false, desk: { hospitalId: 'hosp-7f3a', hospitalName: '가나정형외과의원' } },
      { ...ADMIN, hospital: { ...HOSPITAL, status: 'pending' } },
    ]) {
      mocks.readMe.mockResolvedValueOnce(me)
      const res = await POST(post(ADDRESS_Q))
      expect(res.status).toBe(403)
      expect(await res.text()).toBe('')
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect(f.fn).not.toHaveBeenCalled()
  })
})

describe('AC-7903.2 몸통·열쇠', () => {
  it('AC-7903.2: 깨진 JSON·모르는 종류·칸 더함·범위 밖은 400(몸통 없음)이고 바깥을 부르지 않는다', async () => {
    const f = site()
    const bad: [unknown, boolean][] = [
      ['{깨진', true],
      ['', true],
      [{ kind: 'k-search', q: '서울특별시청' }, false],
      [{ ...ADDRESS_Q, serviceKey: 'x' }, false],
      [{ kind: 'k-near', at: AT, r: 20_001, cat: 'PM9' }, false],
      [{ kind: 'k-point', at: { lat: 40, lng: 127 } }, false],
      [[ADDRESS_Q], false],
    ]
    for (const [body, raw] of bad) {
      const res = await POST(post(body, raw))
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(await res.text()).toBe('')
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect(f.fn).not.toHaveBeenCalled()
  })

  it('AC-7903.2: 읽는 곳은 검사해 정리한 몸통을 받는다', async () => {
    site()
    const adapter = kakaoAddress()
    setRegistry(adapter)
    await POST(post({ kind: 'k-address', q: '  서울특별시청 ' }))
    expect(adapter.requests).toHaveBeenCalledWith({ kind: 'k-address', q: '서울특별시청' })
    expect(checkQuery({ kind: 'k-address', q: '  서울특별시청 ' })).toEqual({ kind: 'k-address', q: '서울특별시청' })
  })

  it('AC-7903.2: 카카오 열쇠는 KAKAO_REST_KEY, 공공 열쇠는 DATA_GO_KR_KEY에서 읽어 바깥 부르기에만 싣는다', async () => {
    const f = site((url) => new Response(url.startsWith('https://dapi.kakao.com') ? ADDRESS_ANSWER : '{"n":1}'))
    setRegistry(kakaoAddress(), popAge(1))
    const a = await POST(post(ADDRESS_Q))
    const b = await POST(post(POP_Q))
    expect(new Headers(f.seen[0].init.headers).get('authorization')).toBe(`KakaoAK ${KAKAO_KEY}`)
    expect(new URL(f.seen[1].url).searchParams.get('serviceKey')).toBe(DATA_KEY)
    expect(new Headers(f.seen[1].init.headers).get('authorization')).toBeNull()
    // 쿠키는 바깥으로 넘기지 않는다
    for (const s of f.seen) expect(new Headers(s.init.headers).get('cookie')).toBeNull()
    expectNoSecrets(await a.text(), await b.text())
  })

  it('AC-7903.2: 바깥 오류 글·열쇠는 답과 로그에 들지 않는다', async () => {
    const answers = [
      () => new Response(`<error>invalid key ${KAKAO_KEY} at upstream-7</error>`, { status: 401 }),
      () => new Response(`Internal Server Error: ${DATA_KEY}`, { status: 500 }),
      () => Promise.reject(new Error(`getaddrinfo ENOTFOUND serviceKey=${DATA_KEY} ${KAKAO_KEY}`)),
    ]
    for (const answer of answers) {
      site(answer)
      for (const q of [ADDRESS_Q, POP_Q]) {
        const res = await POST(post(q))
        const text = await res.text()
        expect(JSON.parse(text)).toEqual({ ok: false, code: 'failed' })
        expect(text).not.toMatch(/upstream-7|Internal Server Error|ENOTFOUND/)
        expectNoSecrets(text)
      }
    }
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/upstream-7|Internal Server Error|ENOTFOUND/)
  })
})

describe('AC-7903.3 답 모양', () => {
  it('AC-7903.3: 되면 { ok: true, value, src, asOf }이고 읽는 곳은 답 글자·몸통·한국 오늘을 받는다', async () => {
    site()
    const adapter = kakaoAddress()
    setRegistry(adapter)
    const res = await POST(post(ADDRESS_Q))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await bodyOf(res)).toEqual({ ok: true, value: { names: ['서울 중구 태평로1가 31'] }, src: 'kakao-local', asOf: '2026-11-22' })
    expect(adapter.parse).toHaveBeenCalledWith([ADDRESS_ANSWER], ADDRESS_Q, '2026-11-22')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-7903.3: 열쇠가 없으면 바깥을 부르지 않고 { ok: false, code: no-key, key }', async () => {
    const f = site()
    vi.stubEnv('KAKAO_REST_KEY', '')
    vi.stubEnv('DATA_GO_KR_KEY', '  ')
    const a = await POST(post(ADDRESS_Q))
    expect(a.status).toBe(200)
    expect(await bodyOf(a)).toEqual({ ok: false, code: 'no-key', key: 'kakao' })
    expect(await bodyOf(await POST(post(POP_Q)))).toEqual({ ok: false, code: 'no-key', key: 'data' })
    vi.stubEnv('KAKAO_REST_KEY', undefined)
    expect(await bodyOf(await POST(post(ADDRESS_Q)))).toEqual({ ok: false, code: 'no-key', key: 'kakao' })
    expect(f.fn).not.toHaveBeenCalled()
    expect((mocks.registry['k-address'] as Adapter).requests).not.toHaveBeenCalled()
  })

  it('AC-7903.3: 공공데이터포털 미등록 열쇠 답(코드 30·20)은 not-applied이고 읽는 곳에 넘기지 않는다', async () => {
    site(
      () =>
        new Response(
          '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
        ),
    )
    const adapter = popAge(3)
    setRegistry(adapter)
    const res = await POST(post(POP_Q))
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({ ok: false, code: 'not-applied' })
    expect(adapter.parse).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'not-applied', 'pop-age']])
  })

  it('AC-7903.3: 공공 열쇠의 401·403 + 미등록 몸통(TASK-47 진짜 답 모양)도 not-applied이고 읽는 곳에 넘기지 않는다', async () => {
    for (const status of [401, 403]) {
      site(() => new Response(NOT_REGISTERED_JSON, { status, headers: { 'content-type': 'application/json' } }))
      const adapter = popAge(3)
      setRegistry(adapter)
      const res = await POST(post(POP_Q))
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(JSON.parse(text)).toEqual({ ok: false, code: 'not-applied' })
      expect(text).not.toContain('SERVICE_KEY')
      expect(adapter.parse).not.toHaveBeenCalled()
    }
    expect(errorSpy.mock.calls).toEqual([
      [LOG, 'not-applied', 'pop-age'],
      [LOG, 'not-applied', 'pop-age'],
    ])
    expectNoSecrets(JSON.stringify(errorSpy.mock.calls))
  })

  it('AC-7903.3: 401·403이라도 몸통이 미등록 답이 아니거나 카카오 열쇠면 failed', async () => {
    site(() => new Response('{"response":{"header":{"resultCode":"22","resultMsg":"LIMITED"}}}', { status: 403 }))
    expect(await bodyOf(await POST(post(POP_Q)))).toEqual({ ok: false, code: 'failed' })
    site(() => new Response(NOT_REGISTERED_JSON, { status: 401 }))
    expect(await bodyOf(await POST(post(ADDRESS_Q)))).toEqual({ ok: false, code: 'failed' })
    expect(errorSpy.mock.calls).toEqual([
      [LOG, 'E-LOC-SOURCE', 'pop-age'],
      [LOG, 'E-LOC-SOURCE', 'k-address'],
    ])
  })

  it('AC-7903.3: not-applied는 failed보다 먼저 — 다른 하위 부르기가 실패해도 미등록 답이 하나라도 오면 not-applied', async () => {
    const orders: [string, (p: Pending[]) => void][] = [
      [
        '실패 먼저, 403 미등록 뒤',
        (p) => {
          p[0].answer(new Response('x', { status: 500 }))
          p[1].answer(new Response(NOT_REGISTERED_JSON, { status: 403 }))
        },
      ],
      [
        '403 미등록 먼저, 실패 뒤',
        (p) => {
          p[0].answer(new Response(NOT_REGISTERED_JSON, { status: 403 }))
          p[1].answer(new Response('x', { status: 502 }))
        },
      ],
      [
        '끊김 먼저, 200 미등록 코드 뒤',
        (p) => {
          p[0].fail()
          p[1].answer(new Response(NOT_REGISTERED_JSON))
        },
      ],
    ]
    for (const [label, play] of orders) {
      errorSpy.mockClear()
      const pending = gate()
      const adapter = popAge(4)
      setRegistry(adapter)
      const done = POST(post(POP_Q))
      await settle()
      expect(pending, label).toHaveLength(2)
      play(pending)
      const res = await done
      expect(await bodyOf(res), label).toEqual({ ok: false, code: 'not-applied' })
      // 남은 쪽은 새로 부르지 않는다
      expect(pending, label).toHaveLength(2)
      expect(adapter.parse).not.toHaveBeenCalled()
      expect(errorSpy.mock.calls, label).toEqual([[LOG, 'not-applied', 'pop-age']])
    }
  })

  it('AC-7922.2: 하위 부르기는 읽는 곳의 timeoutMs(비급여 60초)로 끊고, 없으면 8초로 끊는다', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-21T16:00:00Z') })
    for (const [timeoutMs, limit] of [
      [undefined, 8_000],
      [60_000, 60_000],
    ] as const) {
      const pending = gate()
      const adapter = popAge(1)
      if (timeoutMs !== undefined) adapter.timeoutMs = timeoutMs
      setRegistry(adapter)
      let res: Response | undefined
      void POST(post(POP_Q)).then((r) => {
        res = r
      })
      await settle()
      expect(pending).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(limit - 1)
      await settle()
      expect(res, String(timeoutMs)).toBeUndefined()
      expect(pending[0].signal.aborted, String(timeoutMs)).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await settle()
      expect(pending[0].signal.aborted, String(timeoutMs)).toBe(true)
      expect(res, String(timeoutMs)).toBeDefined()
      if (res) expect(await bodyOf(res)).toEqual({ ok: false, code: 'failed' })
    }
    expect(errorSpy.mock.calls).toEqual([
      [LOG, 'E-LOC-SOURCE', 'pop-age'],
      [LOG, 'E-LOC-SOURCE', 'pop-age'],
    ])
  })

  it('AC-7903.3: 읽는 곳이 not-applied·failed라고 하면 그대로 알린다', async () => {
    site(() => new Response('{"n":1}'))
    const notApplied = popAge(1)
    notApplied.parse = vi.fn(() => ({ ok: false as const, code: 'not-applied' as const }))
    setRegistry(notApplied)
    expect(await bodyOf(await POST(post(POP_Q)))).toEqual({ ok: false, code: 'not-applied' })
    const failed = popAge(1)
    failed.parse = vi.fn(() => ({ ok: false as const, code: 'failed' as const }))
    setRegistry(failed)
    expect(await bodyOf(await POST(post(POP_Q)))).toEqual({ ok: false, code: 'failed' })
    expect(errorSpy.mock.calls).toEqual([
      [LOG, 'not-applied', 'pop-age'],
      [LOG, 'E-LOC-SOURCE', 'pop-age'],
    ])
  })

  it('AC-7903.3: HTTP 실패·연결 끊김·모양 틀림(읽는 곳이 던짐)·요청 만들기 실패는 failed', async () => {
    const cases: [() => Response | Promise<Response>, (a: Adapter<'pop-age'>) => void][] = [
      [() => new Response('x', { status: 500 }), () => {}],
      [() => new Response('x', { status: 302, headers: { location: 'https://evil.example.com/' } }), () => {}],
      [() => Promise.reject(new TypeError('fetch failed')), () => {}],
      [
        () => new Response('<html>점검 중</html>'),
        (a) => {
          a.parse = vi.fn(() => {
            throw new SyntaxError('Unexpected token <')
          })
        },
      ],
      [
        () => new Response('{"n":1}'),
        (a) => {
          a.requests = vi.fn(() => {
            throw new Error('bad')
          })
        },
      ],
    ]
    for (const [answer, change] of cases) {
      site(answer)
      const adapter = popAge(1)
      change(adapter)
      setRegistry(adapter)
      const res = await POST(post(POP_Q))
      expect(res.status).toBe(200)
      expect(await bodyOf(res)).toEqual({ ok: false, code: 'failed' })
    }
    expect(errorSpy.mock.calls).toEqual(Array.from({ length: cases.length }, () => [LOG, 'E-LOC-SOURCE', 'pop-age']))
  })

  it('AC-7903.3: 읽는 곳이 아직 없거나(빈 판) 다른 종류를 이어 놓았으면 바깥을 부르지 않고 failed', async () => {
    const f = site()
    setRegistry()
    expect(await bodyOf(await POST(post(ADDRESS_Q)))).toEqual({ ok: false, code: 'failed' })
    mocks.registry['k-address'] = popAge(1)
    expect(await bodyOf(await POST(post(ADDRESS_Q)))).toEqual({ ok: false, code: 'failed' })
    expect(f.fn).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([
      [LOG, 'E-LOC-SOURCE', 'k-address'],
      [LOG, 'E-LOC-SOURCE', 'k-address'],
    ])
  })

  it('AC-7903.3: 한 요청 안 하위 부르기는 30번까지, 넘으면 하나도 부르지 않고 failed', async () => {
    const f = site(() => new Response('{"n":1}'))
    setRegistry(popAge(30))
    expect(await bodyOf(await POST(post(POP_Q)))).toMatchObject({ ok: true })
    expect(f.fn).toHaveBeenCalledTimes(30)
    f.fn.mockClear()
    setRegistry(popAge(31))
    expect(await bodyOf(await POST(post(POP_Q)))).toEqual({ ok: false, code: 'failed' })
    expect(f.fn).not.toHaveBeenCalled()
  })
})

describe('AC-7903.4 바깥 부르기 규칙', () => {
  it('AC-7903.4: 정해 둔 host 밖 주소를 만든 읽는 곳은 부르지 않고 failed', async () => {
    const f = site()
    for (const url of ['https://evil.example.com/v2/local/search/address.json?query=a', 'http://dapi.kakao.com/v2/local/search/address.json']) {
      const adapter = kakaoAddress()
      adapter.requests = vi.fn(() => [{ url }])
      setRegistry(adapter)
      expect(await bodyOf(await POST(post(ADDRESS_Q)))).toEqual({ ok: false, code: 'failed' })
    }
    expect(f.fn).not.toHaveBeenCalled()
  })

  it('AC-7903.4: 돌려보내기를 따라가지 않게 부른다(redirect: error)', async () => {
    const f = site()
    await POST(post(ADDRESS_Q))
    expect(f.seen).toHaveLength(1)
    expect(f.seen[0].init.redirect).toBe('error')
  })

  it('AC-7903.4: 하위 부르기는 동시에 2개까지이고 답 글자는 요청 차례대로 읽는 곳에 간다', async () => {
    const pending: { url: string; answer: (text: string) => void }[] = []
    let running = 0
    let most = 0
    const fn = vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          running += 1
          most = Math.max(most, running)
          pending.push({
            url,
            answer: (text) => {
              running -= 1
              resolve(new Response(text))
            },
          })
        }),
    )
    vi.stubGlobal('fetch', fn)
    const adapter = popAge(5)
    setRegistry(adapter)
    const done = POST(post(POP_Q))
    const settle = async () => {
      for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r))
    }
    await settle()
    expect(pending).toHaveLength(2)
    // 늦게 시작한 것부터 답해도 차례는 요청 차례
    pending[1].answer('p2')
    await settle()
    expect(pending).toHaveLength(3)
    pending[0].answer('p1')
    await settle()
    pending[3].answer('p4')
    pending[2].answer('p3')
    await settle()
    expect(pending).toHaveLength(5)
    pending[4].answer('p5')
    const res = await done
    expect(most).toBe(2)
    expect(await bodyOf(res)).toEqual({ ok: true, value: ['p1', 'p2', 'p3', 'p4', 'p5'], src: 'mois-pop-age', asOf: '2026-09-30' })
    expect(pending.map((p) => new URL(p.url).searchParams.get('pageNo'))).toEqual(['1', '2', '3', '4', '5'])
  })

  it('AC-7903.4: 하위 부르기 하나가 실패하면 남은 쪽은 새로 부르지 않는다', async () => {
    const f = site((_url, n) => (n === 1 ? new Response('x', { status: 500 }) : new Response('{"n":1}')))
    setRegistry(popAge(10))
    expect(await bodyOf(await POST(post(POP_Q)))).toEqual({ ok: false, code: 'failed' })
    expect(f.fn.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('AC-7903.4: 카카오 답을 담아 두지 않는다 — 같은 몸통도 부를 때마다 바깥을 다시 부른다', async () => {
    const f = site((_url, n) => new Response(`{"documents":[{"address_name":"답 ${n}"}],"meta":{"total_count":1}}`))
    const first = await bodyOf(await POST(post(ADDRESS_Q)))
    const second = await bodyOf(await POST(post(ADDRESS_Q)))
    expect(f.fn).toHaveBeenCalledTimes(2)
    expect(first).toMatchObject({ value: { names: ['답 1'] } })
    expect(second).toMatchObject({ value: { names: ['답 2'] } })
  })

  it('AC-7903.4: 로그는 [api/ai/location] + 오류 번호 + 종류뿐이다(좌표·주소·답 없음)', async () => {
    site(() => new Response(`{"documents":[], "error":"서울 중구 ${AT.lat}"}`, { status: 500 }))
    const adapter = kakaoAddress()
    setRegistry(adapter)
    await POST(post({ kind: 'k-address', q: '서울특별시 중구 세종대로 110' }))
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-LOC-SOURCE', 'k-address']])
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain('세종대로')
    expect(logged).not.toContain(String(AT.lat))
  })
})

describe('AC-7903.4 서버 파일 규칙(소스 글자)', () => {
  const DIR = 'src/app/api/ai/location'
  const FILES = ['guard.ts', 'fetchSource.ts', 'registry.ts', 'query/route.ts', 'keys/route.ts']
  const read = (rel: string) => readFileSync(join(process.cwd(), DIR, rel), 'utf8').replace(/\r\n/g, '\n')
  const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')

  it("AC-7903.4: route 밖 새 서버 파일은 첫 줄이 import 'server-only'다", () => {
    for (const rel of FILES.filter((f) => !f.endsWith('route.ts'))) expect(read(rel).split('\n')[0], rel).toBe("import 'server-only'")
  })

  it('AC-7903.4: 서버는 DB에 쓰지 않는다 — supabase를 불러오지 않고 쓰기 부르기가 없다', () => {
    for (const rel of FILES) {
      const text = code(rel)
      expect(text, rel).not.toMatch(/supabase/i)
      // 표 쓰기는 .from('표').insert(…) 모양이다(URLSearchParams.delete 같은 것은 표 쓰기가 아니다)
      expect(text, rel).not.toMatch(/\.(?:insert|upsert|rpc)\s*\(|\.from\s*\(\s*['"`]/)
    }
  })

  it('AC-7903.4: 서버 메모리에 담아 두지 않는다 — 맨 위 let·var·Map·Set·전역 쓰기가 없다', () => {
    for (const rel of FILES) {
      const text = code(rel)
      expect(text, rel).not.toMatch(/^(?:export\s+)?(?:let|var)\s/m)
      expect(text, rel).not.toMatch(/\bnew\s+(?:Map|Set|WeakMap|WeakSet|WeakRef)\b/)
      expect(text, rel).not.toMatch(/\bglobalThis\s*\.\s*\w+\s*=[^=]/)
    }
  })

  it('AC-7903.4: console은 query 경로의 console.error 한 곳뿐이다', () => {
    for (const rel of FILES) {
      const uses = code(rel).match(/\bconsole\s*\.\s*\w+/g) ?? []
      if (rel === 'query/route.ts') expect(uses).toEqual(['console.error'])
      else expect(uses, rel).toEqual([])
    }
  })
})
