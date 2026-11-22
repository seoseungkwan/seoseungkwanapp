import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteRequest, SourceResult } from '@/types/location'
import {
  SOURCE_MAX_BYTES,
  SOURCE_TIMEOUT_MS,
  SOURCE_USER_AGENT,
  createFetchSource,
  fetchSource,
  isNotRegistered,
  readKey,
  type SourceFetch,
  type SourceKey,
} from './fetchSource'

// 입지 분석 바깥 부르기(specs/location REQ-7903 AC-7903.2~4, design.md 3절).
// 진짜 사이트는 부르지 않는다. fetch는 시험이 넣는 가짜이고, 시간은 가짜 시계로 잰다. 열쇠는 지어낸 글자다

const KAKAO_KEY = 'kakao-rest-FAKE-0001'
// 공공데이터포털 디코딩 열쇠 모양(+ · / · = 가 섞임)
const DATA_KEY = 'DATA+FAKE/key==0002'
const KAKAO: SourceKey = { kind: 'kakao', value: KAKAO_KEY }
const DATA: SourceKey = { kind: 'data', value: DATA_KEY }

const KAKAO_URL = 'https://dapi.kakao.com/v2/local/search/address.json?query=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C%EC%B2%AD'
const DATA_URL =
  'https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus?admmCd=1111051500&srchFrYm=202510&srchToYm=202510&numOfRows=1&type=JSON'
const STD_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_trdit_mrkt_api?pageNo=1&numOfRows=100&type=json'
const ODCLOUD_URL = 'https://api.odcloud.kr/api/15114136/v1/uddi:fake-0000?page=1&perPage=100'

type Seen = { url: string; init: RequestInit }

// 답을 정해 주는 가짜 fetch. 받은 주소·설정을 적어 둔다
function fake(answer: (call: number) => Response | Promise<Response> = () => new Response('ok')) {
  const seen: Seen[] = []
  const fn = vi.fn<SourceFetch>(async (url, init) => {
    seen.push({ url, init })
    return answer(seen.length)
  })
  return { fn, seen }
}

async function run(req: SiteRequest, key: SourceKey, answer: (call: number) => Response | Promise<Response>): Promise<SourceResult> {
  return createFetchSource({ fetchImpl: fake(answer).fn })(req, key)
}

// 끝없이 chunk 바이트씩 주는 몸통. 몇 번 당겼는지·끊겼는지 본다
function endless(chunk = 500_000) {
  const state = { pulls: 0, cancelled: false }
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      state.pulls += 1
      c.enqueue(new Uint8Array(chunk))
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { stream, state }
}

const headerOf = (init: RequestInit, name: string) => new Headers(init.headers).get(name)
const hasKey = (value: unknown) => {
  const text = JSON.stringify(value)
  return text.includes(KAKAO_KEY) || text.includes(DATA_KEY) || text.includes(encodeURIComponent(DATA_KEY))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('AC-7903.4 정해 둔 host만', () => {
  it('AC-7903.4: 카카오 열쇠는 dapi.kakao.com, 공공 열쇠는 apis.data.go.kr·api.data.go.kr·api.odcloud.kr만 부른다', async () => {
    const cases: [string, SourceKey][] = [
      [KAKAO_URL, KAKAO],
      [DATA_URL, DATA],
      [STD_URL, DATA],
      [ODCLOUD_URL, DATA],
    ]
    for (const [url, key] of cases) {
      const f = fake()
      expect(await createFetchSource({ fetchImpl: f.fn })({ url }, key), url).toEqual({ ok: true, text: 'ok' })
      expect(f.seen).toHaveLength(1)
      expect(new URL(f.seen[0].url).host).toBe(new URL(url).host)
    }
  })

  it('AC-7903.4: 정해 둔 host 밖·https 아님·사용자 이름·포트·# 붙은 주소·열쇠와 host가 어긋난 주소는 부르지 않는다', async () => {
    const blocked: [string, SourceKey][] = [
      ['http://dapi.kakao.com/v2/local/search/address.json?query=a', KAKAO],
      ['http://apis.data.go.kr/1741000/x', DATA],
      ['https://evil.example.com/v2/local/search/address.json', KAKAO],
      ['https://evil.example.com/1741000/x', DATA],
      ['https://dapi.kakao.com.evil.example/v2/local', KAKAO],
      ['https://apis.data.go.kr.evil.example/1741000/x', DATA],
      ['https://map.kakao.com/link/to/a', KAKAO],
      ['https://www.data.go.kr/data/15108071/openapi.do', DATA],
      ['https://openapi.seoul.go.kr:8088/x', DATA],
      ['https://user:pw@apis.data.go.kr/1741000/x', DATA],
      ['https://apis.data.go.kr:8443/1741000/x', DATA],
      ['https://apis.data.go.kr/1741000/x#top', DATA],
      ['ftp://apis.data.go.kr/x', DATA],
      ['/api/ai/location/query', DATA],
      ['not a url', DATA],
      ['', KAKAO],
      // 열쇠가 다른 곳으로 새지 않게: 카카오 열쇠를 공공 host로, 공공 열쇠를 카카오 host로 보내지 않는다
      [DATA_URL, KAKAO],
      [ODCLOUD_URL, KAKAO],
      [KAKAO_URL, DATA],
    ]
    for (const [url, key] of blocked) {
      const f = fake()
      expect(await createFetchSource({ fetchImpl: f.fn })({ url }, key), `${url} ${key.kind}`).toEqual({ ok: false, fail: 'blocked-url' })
      expect(f.fn, url).not.toHaveBeenCalled()
    }
  })

  it('AC-7903.4: 열쇠가 비었거나 열쇠 종류를 모르면 부르지 않는다', async () => {
    for (const key of [
      { kind: 'kakao', value: '' },
      { kind: 'data', value: '' },
      { kind: 'seoul', value: 'x' },
    ] as SourceKey[]) {
      const f = fake()
      expect(await createFetchSource({ fetchImpl: f.fn })({ url: KAKAO_URL }, key)).toEqual({ ok: false, fail: 'blocked-url' })
      expect(f.fn).not.toHaveBeenCalled()
    }
  })

  it('AC-7903.4: 돌려보내기는 따라가지 않고(redirect: error) 쿠키·캐시 없이 GET 하나만 보낸다', async () => {
    for (const [url, key] of [
      [KAKAO_URL, KAKAO],
      [DATA_URL, DATA],
    ] as const) {
      const f = fake()
      await createFetchSource({ fetchImpl: f.fn })({ url }, key)
      const { init } = f.seen[0]
      expect(init.redirect).toBe('error')
      expect(init.credentials).toBe('omit')
      expect(init.cache).toBe('no-store')
      expect(init.method).toBe('GET')
      expect(init.body).toBeUndefined()
      expect(init.signal).toBeInstanceOf(AbortSignal)
      expect(headerOf(init, 'user-agent')).toBe(SOURCE_USER_AGENT)
      expect(SOURCE_USER_AGENT).toMatch(/^Mozilla\/5\.0 /)
      expect(headerOf(init, 'cookie')).toBeNull()
    }
  })

  it('AC-7903.4: 카카오는 Authorization: KakaoAK <열쇠> 머리로만, 주소에는 열쇠를 싣지 않는다', async () => {
    const f = fake()
    await createFetchSource({ fetchImpl: f.fn })({ url: KAKAO_URL }, KAKAO)
    const { url, init } = f.seen[0]
    expect(headerOf(init, 'authorization')).toBe(`KakaoAK ${KAKAO_KEY}`)
    expect(url).toBe(KAKAO_URL)
    expect(url).not.toContain(KAKAO_KEY)
  })

  it('AC-7903.4: 공공은 serviceKey=<디코딩 열쇠>를 주소에 한 번만(URLSearchParams가 인코딩), 인증 머리는 없다', async () => {
    const f = fake()
    await createFetchSource({ fetchImpl: f.fn })({ url: DATA_URL }, DATA)
    const { url, init } = f.seen[0]
    expect(headerOf(init, 'authorization')).toBeNull()
    const sent = new URL(url)
    expect(sent.searchParams.getAll('serviceKey')).toEqual([DATA_KEY])
    expect(url).toContain('serviceKey=DATA%2BFAKE%2Fkey%3D%3D0002')
    // 다른 칸은 그대로
    expect(sent.searchParams.get('admmCd')).toBe('1111051500')
    expect(sent.searchParams.get('type')).toBe('JSON')
    expect(sent.pathname).toBe('/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus')
  })

  it('AC-7903.4: 읽는 곳이 넣은 열쇠 칸(대소문자 상관없이)은 지우고 서버 열쇠 하나만 싣는다', async () => {
    const f = fake()
    await createFetchSource({ fetchImpl: f.fn })({ url: `${DATA_URL}&serviceKey=OTHER&ServiceKey=OTHER2&SERVICEKEY=OTHER3` }, DATA)
    const sent = new URL(f.seen[0].url)
    const keyNames = [...sent.searchParams.keys()].filter((k) => k.toLowerCase() === 'servicekey')
    expect(keyNames).toEqual(['serviceKey'])
    expect(sent.searchParams.get('serviceKey')).toBe(DATA_KEY)
    expect(f.seen[0].url).not.toContain('OTHER')
  })

  it('AC-7903.4: 기본 fetchSource는 이 런타임의 fetch를 부른다(담아 두지 않고 부를 때마다)', async () => {
    const f = fake((n) => new Response(`answer-${n}`))
    vi.stubGlobal('fetch', f.fn)
    expect(await fetchSource({ url: KAKAO_URL }, KAKAO)).toEqual({ ok: true, text: 'answer-1' })
    expect(await fetchSource({ url: KAKAO_URL }, KAKAO)).toEqual({ ok: true, text: 'answer-2' })
    expect(f.fn).toHaveBeenCalledTimes(2)
  })
})

describe('AC-7903.3 바깥 실패(HTTP·8초·2MB)', () => {
  it('AC-7903.3: 200이면 UTF-8 글자를 그대로 준다', async () => {
    expect(await run({ url: DATA_URL }, DATA, () => new Response('{"name":"가나시장"}'))).toEqual({ ok: true, text: '{"name":"가나시장"}' })
    expect(await run({ url: DATA_URL }, DATA, () => new Response(null))).toEqual({ ok: true, text: '' })
  })

  it('AC-7903.3: 200이 아니면(3xx 포함) http와 상태 번호만 준다(답 글은 버린다)', async () => {
    for (const status of [201, 204, 301, 302, 400, 401, 403, 404, 429, 500, 503]) {
      const body = status === 204 ? null : `server says ${KAKAO_KEY}`
      expect(await run({ url: KAKAO_URL }, KAKAO, () => new Response(body, { status })), String(status)).toEqual({ ok: false, fail: 'http', status })
    }
  })

  it('AC-7903.3: 돌려보내기 오류·연결 끊김(fetch가 던짐)은 http, 오류 글·주소는 담지 않는다', async () => {
    const thrown = [
      new TypeError('fetch failed', { cause: new Error('unexpected redirect') }),
      new Error(`getaddrinfo ENOTFOUND ${DATA_URL}&serviceKey=${DATA_KEY}`),
    ]
    for (const err of thrown) {
      const result = await run({ url: DATA_URL }, DATA, () => Promise.reject(err))
      expect(result).toEqual({ ok: false, fail: 'http' })
      expect(hasKey(result)).toBe(false)
    }
  })

  it('AC-7903.3: 돌려보내진 답(redirected)은 받지 않는다', async () => {
    const res = new Response('moved')
    Object.defineProperty(res, 'redirected', { value: true })
    expect(await run({ url: KAKAO_URL }, KAKAO, () => res)).toEqual({ ok: false, fail: 'http', status: 200 })
  })

  it('AC-7903.3: 답 머리가 8초 안에 안 오면 timeout이고 부름을 끊는다', async () => {
    vi.useFakeTimers({ now: 0 })
    expect(SOURCE_TIMEOUT_MS).toBe(8_000)
    let signal: AbortSignal | undefined
    const fetchImpl = vi.fn<SourceFetch>((_url, init) => {
      signal = init.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    let result: SourceResult | undefined
    void createFetchSource({ fetchImpl })({ url: DATA_URL }, DATA).then((r) => {
      result = r
    })
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS - 1)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toEqual({ ok: false, fail: 'timeout' })
    expect(signal?.aborted).toBe(true)
  })

  it('AC-7903.3: 머리는 왔어도 몸통이 8초 안에 다 오지 않으면 timeout', async () => {
    vi.useFakeTimers({ now: 0 })
    const state = { cancelled: false }
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"documents":['))
      },
      cancel() {
        state.cancelled = true
      },
    })
    let result: SourceResult | undefined
    void run({ url: KAKAO_URL }, KAKAO, () => new Response(stream)).then((r) => {
      result = r
    })
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS)
    expect(result).toEqual({ ok: false, fail: 'timeout' })
    expect(state.cancelled).toBe(true)
  })

  it('AC-7903.3: 크기 머리가 2,000,000바이트를 넘으면 몸통을 읽지 않고 too-big', async () => {
    expect(SOURCE_MAX_BYTES).toBe(2_000_000)
    const { stream, state } = endless()
    const result = await run({ url: DATA_URL }, DATA, () => new Response(stream, { headers: { 'content-length': '2000001' } }))
    expect(result).toEqual({ ok: false, fail: 'too-big' })
    expect(state.pulls).toBeLessThanOrEqual(1)
  })

  it('AC-7903.3: 받는 도중 2,000,000바이트를 넘으면 그만 읽고 too-big', async () => {
    const { stream, state } = endless(500_000)
    expect(await run({ url: DATA_URL }, DATA, () => new Response(stream))).toEqual({ ok: false, fail: 'too-big' })
    expect(state.pulls).toBeLessThanOrEqual(6)
    expect(state.cancelled).toBe(true)
  })

  it('AC-7903.3: 꼭 2,000,000바이트는 받는다', async () => {
    const result = await run({ url: DATA_URL }, DATA, () => new Response('a'.repeat(SOURCE_MAX_BYTES)))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toHaveLength(SOURCE_MAX_BYTES)
  })
})

describe('AC-7903.3 활용신청 안 됨(not-applied) 알아보기', () => {
  it('AC-7903.3: 공공데이터포털 미등록·접근 거부 답(코드 30·20)은 활용신청 안 됨이다', () => {
    const refused = [
      '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
      '<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_ACCESS_DENIED_ERROR</returnAuthMsg><returnReasonCode>20</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
      '<response><header><resultCode>30</resultCode><resultMsg>등록되지 않은 서비스키</resultMsg></header></response>',
      '{"response":{"header":{"resultCode":"30","resultMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}',
      '{"header":{"resultCode":20,"resultMsg":"SERVICE ACCESS DENIED"}}',
      'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
    ]
    for (const text of refused) expect(isNotRegistered(text), text).toBe(true)
  })

  it('AC-7903.3: 정상 답·자료 없음·다른 오류 코드·숫자 30이 든 정상 칸은 활용신청 안 됨이 아니다', () => {
    const normal = [
      '<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><totalCount>30</totalCount><numOfRows>30</numOfRows></body></response>',
      '<response><header><resultCode>03</resultCode><resultMsg>NODATA_ERROR</resultMsg></header></response>',
      '<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
      '{"response":{"header":{"resultCode":"300"}}}',
      '<resultCode>130</resultCode>',
      '{"currentCount":30,"data":[],"page":1,"perPage":30,"totalCount":30}',
      '{"documents":[],"meta":{"total_count":30,"is_end":true}}',
      '',
    ]
    for (const text of normal) expect(isNotRegistered(text), text).toBe(false)
  })
})

describe('AC-7903.2 열쇠는 서버 환경 변수 둘에서만', () => {
  it('AC-7903.2: 공공은 DATA_GO_KR_KEY, 카카오는 KAKAO_REST_KEY(앞뒤 공백 뺌)', () => {
    vi.stubEnv('DATA_GO_KR_KEY', ` ${DATA_KEY} `)
    vi.stubEnv('KAKAO_REST_KEY', KAKAO_KEY)
    expect(readKey('data')).toBe(DATA_KEY)
    expect(readKey('kakao')).toBe(KAKAO_KEY)
  })

  it('AC-7903.2: 비었거나 공백뿐이거나 없으면 null', () => {
    vi.stubEnv('DATA_GO_KR_KEY', '')
    vi.stubEnv('KAKAO_REST_KEY', '   ')
    expect(readKey('data')).toBeNull()
    expect(readKey('kakao')).toBeNull()
    vi.stubEnv('DATA_GO_KR_KEY', undefined)
    vi.stubEnv('KAKAO_REST_KEY', undefined)
    expect(readKey('data')).toBeNull()
    expect(readKey('kakao')).toBeNull()
  })

  it('AC-7903.2: 다른 이름(브라우저 지도 열쇠·비슷한 이름)은 읽지 않는다', () => {
    vi.stubEnv('DATA_GO_KR_KEY', undefined)
    vi.stubEnv('KAKAO_REST_KEY', undefined)
    vi.stubEnv('NEXT_PUBLIC_KAKAO_MAP_KEY', 'map-js-key')
    vi.stubEnv('KAKAO_KEY', 'other-1')
    vi.stubEnv('DATA_KEY', 'other-2')
    vi.stubEnv('SERVICE_KEY', 'other-3')
    expect(readKey('data')).toBeNull()
    expect(readKey('kakao')).toBeNull()
  })

  it('AC-7903.2: 어떤 실패 결과에도 열쇠가 들지 않는다', async () => {
    const answers: (() => Response | Promise<Response>)[] = [
      () => new Response(`bad key ${DATA_KEY}`, { status: 401 }),
      () => Promise.reject(new Error(`boom ${DATA_KEY} ${KAKAO_KEY}`)),
      () => new Response(endless().stream, { headers: { 'content-length': '9999999' } }),
    ]
    for (const answer of answers) {
      expect(hasKey(await run({ url: DATA_URL }, DATA, answer))).toBe(false)
      expect(hasKey(await run({ url: KAKAO_URL }, KAKAO, answer))).toBe(false)
    }
    expect(hasKey(await run({ url: 'https://evil.example.com/x' }, DATA, () => new Response('x')))).toBe(false)
  })
})
