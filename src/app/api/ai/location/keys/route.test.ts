import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Adapter, QueryOf } from '@/types/location'
import { checkQuery } from '@/lib/location/query'

// GET /api/ai/location/keys — 열쇠 상태(specs/location REQ-7903 AC-7903.1·AC-7903.5, design.md 3절).
// 열쇠마다 비었으면 missing, 있으면 작은 부르기 하나(카카오 k-address '서울특별시청', 공공 활용신청이 된 pop-age 행정동 하나 1111051500·2025-10)로 ok·rejected·failed.
// readMe·registry는 가짜, 바깥 fetch는 전역 가짜. 아무것도 저장하지 않는다
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

const { GET } = route
const KAKAO_KEY = 'kakao-rest-FAKE-0001'
const DATA_KEY = 'DATA+FAKE/key==0002'
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

// 쪽을 여러 개 만드는 읽는 곳이어도 열쇠 확인은 첫 요청 하나만 부른다
function kakaoAddress(): Adapter<'k-address'> {
  return {
    kind: 'k-address',
    src: 'kakao-local',
    key: 'kakao',
    requests: vi.fn((q: QueryOf<'k-address'>) =>
      [1, 2, 3].map((page) => ({ url: `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q.q)}&page=${page}` })),
    ),
    parse: vi.fn(() => ({ ok: true as const, value: null, asOf: '2026-11-22' })),
  }
}
function popAge(): Adapter<'pop-age'> {
  return {
    kind: 'pop-age',
    src: 'mois-pop-age',
    key: 'data',
    requests: vi.fn((q: QueryOf<'pop-age'>) =>
      q.dongs.map((dong) => ({ url: `https://apis.data.go.kr/1741000/admmSexdAgePpltn/selectAdmmSexdAgePpltn?admmCd=${dong}&numOfRows=1&type=JSON` })),
    ),
    parse: vi.fn(() => ({ ok: true as const, value: null, asOf: '2025-10-31' })),
  }
}
// 세대 수(household)는 활용신청 전 미등록 답이 '열쇠가 맞지 않아요'로 잘못 보여 확인에 쓰지 않는다(design.md 3절)
function household(): Adapter<'household'> {
  return {
    kind: 'household',
    src: 'mois-household',
    key: 'data',
    requests: vi.fn((q: QueryOf<'household'>) =>
      q.dongs.map((dong) => ({ url: `https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus?admmCd=${dong}&numOfRows=1&type=JSON` })),
    ),
    parse: vi.fn(() => ({ ok: true as const, value: null, asOf: '2025-10-31' })),
  }
}

type Seen = { url: string; init: RequestInit }
function site(answer: (url: string) => Response | Promise<Response>) {
  const seen: Seen[] = []
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    seen.push({ url, init })
    return answer(url)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, seen }
}
const isKakao = (url: string) => new URL(url).host === 'dapi.kakao.com'
// 카카오·공공 답을 따로 정한다
const answers = (kakao: () => Response | Promise<Response>, data: () => Response | Promise<Response>) =>
  site((url) => (isKakao(url) ? kakao() : data()))

const KAKAO_OK = () => new Response('{"documents":[],"meta":{"total_count":0,"is_end":true}}')
const DATA_OK = () => new Response('{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE"},"body":{"totalCount":1}}}')
const NOT_REGISTERED = () =>
  new Response(
    '<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
  )

// 이 경로는 요청 몸통·머리를 읽지 않는다(로그인은 readMe가 쿠키로 본다)
const get = () => GET()

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
  mocks.readMe.mockReset()
  mocks.supabaseServer.mockReset()
  mocks.readMe.mockResolvedValue(ADMIN)
  vi.stubEnv('KAKAO_REST_KEY', KAKAO_KEY)
  vi.stubEnv('DATA_GO_KR_KEY', DATA_KEY)
  setRegistry(kakaoAddress(), popAge())
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  otherSpies = (['log', 'warn', 'info', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})
afterEach(() => {
  for (const spy of otherSpies) expect(spy).not.toHaveBeenCalled()
  // 아무것도 저장하지 않는다 — DB 클라이언트를 만들지 않는다
  expect(mocks.supabaseServer).not.toHaveBeenCalled()
  // 로그에 열쇠가 없다
  const logged = JSON.stringify(errorSpy.mock.calls)
  expect(logged).not.toContain(KAKAO_KEY)
  expect(logged).not.toContain(DATA_KEY)
  for (const spy of otherSpies) spy.mockRestore()
  errorSpy.mockRestore()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('경로 설정', () => {
  it('AC-7903.5: nodejs 런타임 · Next가 아는 이름(GET·runtime·maxDuration)만 내보낸다', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBe(30)
    expect(Object.keys(route).sort()).toEqual(['GET', 'maxDuration', 'runtime'])
  })
})

describe('AC-7903.1 로그인·관리자', () => {
  it('AC-7903.1: 로그인 안 함 401·관리자 아님 403, 몸통 없고 바깥을 부르지 않는다', async () => {
    const f = answers(KAKAO_OK, DATA_OK)
    mocks.readMe.mockRejectedValueOnce(new NotSignedInError('로그인하지 않았어요'))
    const a = await get()
    expect(a.status).toBe(401)
    expect(await a.text()).toBe('')
    for (const me of [
      { ...ADMIN, isAdmin: false },
      { email: 'desk@ga.na', hospital: null, isAdmin: false, desk: { hospitalId: 'hosp-7f3a', hospitalName: '가나정형외과의원' } },
      { ...ADMIN, hospital: { ...HOSPITAL, status: 'pending' } },
    ]) {
      mocks.readMe.mockResolvedValueOnce(me)
      const res = await get()
      expect(res.status).toBe(403)
      expect(await res.text()).toBe('')
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect(f.fn).not.toHaveBeenCalled()
  })
})

describe('AC-7903.5 열쇠마다 ok · missing · rejected · failed', () => {
  it('AC-7903.5: 둘 다 되면 { data: ok, kakao: ok }이고 열쇠마다 작은 부르기 하나뿐이다', async () => {
    const f = answers(KAKAO_OK, DATA_OK)
    const kakao = kakaoAddress()
    const data = popAge()
    setRegistry(kakao, data)
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await bodyOf(res)).toEqual({ data: 'ok', kakao: 'ok' })
    expect(f.fn).toHaveBeenCalledTimes(2)
    expect(f.seen.filter((s) => isKakao(s.url))).toHaveLength(1)
    // 카카오는 '서울특별시청' 주소 찾기, 공공은 활용신청이 된 pop-age 행정동 하나(종로구 청운효자동 1111051500·2025-10)
    // — 둘 다 정해 둔 몸통 검사를 지나는 몸통
    expect(kakao.requests).toHaveBeenCalledWith({ kind: 'k-address', q: '서울특별시청' })
    expect(data.requests).toHaveBeenCalledTimes(1)
    const dataQ = vi.mocked(data.requests).mock.calls[0][0]
    expect(dataQ).toEqual({ kind: 'pop-age', dongs: ['1111051500'], ym: '2025-10' })
    expect(checkQuery(dataQ)).toEqual(dataQ)
    expect(checkQuery({ kind: 'k-address', q: '서울특별시청' })).not.toBeNull()
    // 열쇠는 머리·주소로만 가고 답을 읽지는 않는다
    const kakaoCall = f.seen.find((s) => isKakao(s.url))
    const dataCall = f.seen.find((s) => !isKakao(s.url))
    expect(new Headers(kakaoCall?.init.headers).get('authorization')).toBe(`KakaoAK ${KAKAO_KEY}`)
    expect(new URL(dataCall?.url ?? '').searchParams.get('serviceKey')).toBe(DATA_KEY)
    expect(kakaoCall?.init.redirect).toBe('error')
    expect(kakao.parse).not.toHaveBeenCalled()
    expect(data.parse).not.toHaveBeenCalled()
  })

  it('AC-7903.5: 비었거나 없는 열쇠는 부르지 않고 missing', async () => {
    const f = answers(KAKAO_OK, DATA_OK)
    vi.stubEnv('KAKAO_REST_KEY', '')
    vi.stubEnv('DATA_GO_KR_KEY', undefined)
    expect(await bodyOf(await get())).toEqual({ data: 'missing', kakao: 'missing' })
    expect(f.fn).not.toHaveBeenCalled()
    vi.stubEnv('KAKAO_REST_KEY', KAKAO_KEY)
    expect(await bodyOf(await get())).toEqual({ data: 'missing', kakao: 'ok' })
    expect(f.fn).toHaveBeenCalledTimes(1)
  })

  it('AC-7903.5: 401·403·공공데이터포털 미등록 열쇠 답은 rejected', async () => {
    answers(
      () => new Response('{"errorType":"AccessDeniedError","message":"cannot find appkey"}', { status: 401 }),
      () => new Response('Forbidden', { status: 403 }),
    )
    expect(await bodyOf(await get())).toEqual({ data: 'rejected', kakao: 'rejected' })
    answers(() => new Response('{"errorType":"NotAuthorizedError"}', { status: 403 }), NOT_REGISTERED)
    expect(await bodyOf(await get())).toEqual({ data: 'rejected', kakao: 'rejected' })
    answers(KAKAO_OK, () => new Response('{"response":{"header":{"resultCode":"30","resultMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}'))
    expect(await bodyOf(await get())).toEqual({ data: 'rejected', kakao: 'ok' })
  })

  it('AC-7903.5: 공공 401·403 + 미등록 몸통(TASK-47 진짜 답 모양)·몸통이 다른 401·403은 모두 rejected, 몸통 글은 답에 없다', async () => {
    const NOT_REGISTERED_JSON = '{"response":{"header":{"resultCode":"30","resultMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}'
    for (const status of [401, 403]) {
      answers(KAKAO_OK, () => new Response(NOT_REGISTERED_JSON, { status, headers: { 'content-type': 'application/json' } }))
      const text = await (await get()).text()
      expect(JSON.parse(text), String(status)).toEqual({ data: 'rejected', kakao: 'ok' })
      expect(text).not.toContain('SERVICE_KEY')
      answers(KAKAO_OK, () => new Response('{"response":{"header":{"resultCode":"22"}}}', { status }))
      expect(await bodyOf(await get()), String(status)).toEqual({ data: 'rejected', kakao: 'ok' })
    }
    // 카카오 401·403은 몸통과 상관없이 rejected
    answers(() => new Response(NOT_REGISTERED_JSON, { status: 403 }), DATA_OK)
    expect(await bodyOf(await get())).toEqual({ data: 'ok', kakao: 'rejected' })
  })

  it('AC-7903.5: 공공 확인은 pop-age로만 — 세대 수(household) 읽는 곳만 있으면 부르지 않고 failed', async () => {
    const f = answers(KAKAO_OK, DATA_OK)
    const onlyHousehold = household()
    setRegistry(kakaoAddress(), onlyHousehold)
    expect(await bodyOf(await get())).toEqual({ data: 'failed', kakao: 'ok' })
    expect(onlyHousehold.requests).not.toHaveBeenCalled()
    expect(f.seen.every((s) => isKakao(s.url))).toBe(true)
  })

  it('AC-7903.5: 다른 HTTP 실패·연결 끊김·읽는 곳이 아직 없음은 failed(바깥 오류 글은 답에 없다)', async () => {
    answers(
      () => new Response(`server error ${KAKAO_KEY}`, { status: 500 }),
      () => Promise.reject(new Error(`ENOTFOUND serviceKey=${DATA_KEY}`)),
    )
    const res = await get()
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ data: 'failed', kakao: 'failed' })
    expect(text).not.toContain(KAKAO_KEY)
    expect(text).not.toContain(DATA_KEY)
    expect(text).not.toMatch(/server error|ENOTFOUND/)

    const f = answers(KAKAO_OK, DATA_OK)
    setRegistry()
    expect(await bodyOf(await get())).toEqual({ data: 'failed', kakao: 'failed' })
    expect(f.fn).not.toHaveBeenCalled()
  })

  it('AC-7903.5: 읽는 곳이 다른 열쇠 종류·host 밖 주소·요청 없음이면 부르지 않고 failed', async () => {
    const f = answers(KAKAO_OK, DATA_OK)
    const wrongKey = kakaoAddress()
    wrongKey.key = 'data'
    const offHost = popAge()
    offHost.requests = vi.fn(() => [{ url: 'https://evil.example.com/x?admmCd=1' }])
    setRegistry(wrongKey, offHost)
    expect(await bodyOf(await get())).toEqual({ data: 'failed', kakao: 'failed' })
    const empty = popAge()
    empty.requests = vi.fn(() => [])
    setRegistry(kakaoAddress(), empty)
    expect(await bodyOf(await get())).toEqual({ data: 'failed', kakao: 'ok' })
    expect(f.seen.every((s) => isKakao(s.url))).toBe(true)
  })

  it('AC-7903.5: 부를 때마다 새로 확인한다(결과를 담아 두지 않는다)', async () => {
    let kakaoStatus = 200
    const f = answers(() => (kakaoStatus === 200 ? KAKAO_OK() : new Response('', { status: kakaoStatus })), DATA_OK)
    expect(await bodyOf(await get())).toEqual({ data: 'ok', kakao: 'ok' })
    kakaoStatus = 401
    expect(await bodyOf(await get())).toEqual({ data: 'ok', kakao: 'rejected' })
    expect(f.fn).toHaveBeenCalledTimes(4)
  })
})
