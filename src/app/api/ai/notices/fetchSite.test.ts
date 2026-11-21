import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteRequest, SiteResult } from '@/types/notices'
import {
  FILE_MAX_BYTES,
  FILE_TIMEOUT_MS,
  HOST_GAP_MS,
  HOST_MAX_RUNNING,
  PAGE_MAX_BYTES,
  PAGE_TIMEOUT_MS,
  SITE_USER_AGENT,
  createFetchSite,
  fetchSite,
  type SiteFetch,
} from './fetchSite'

// 사이트 읽기 규칙(specs/notices requirements REQ-7404, design 2·4·5절).
// 진짜 사이트는 부르지 않는다. fetch는 시험이 넣는 가짜이고, 시간은 가짜 시계로 잰다

const HIRA_LIST = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1'
const HIRA_VIEW = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=12353'
const HIRA_FILE = 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157'
const CRTR_LIST = 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrList.do?pgmid=HIRAA030069000410'
const CRTR_POPUP = 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=20261112&sno=1&mtgMtrRegSno=0004'
const MOHW_RSS = 'https://www.mohw.go.kr/rss/board.es?mid=a10409020000&bid=0026'

const page = (url: string): SiteRequest => ({ url, kind: 'page' })
const file = (url: string): SiteRequest => ({ url, kind: 'file' })
const crtr = (form: string | undefined): SiteRequest => ({ url: CRTR_LIST, method: 'POST', form, kind: 'page' })
const listPage = (n: number) => page(`https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=${n}`)

const ALLOWED: SiteRequest[] = [
  page(HIRA_LIST),
  { url: HIRA_LIST, method: 'GET', kind: 'page' },
  page(HIRA_VIEW),
  file(HIRA_FILE),
  crtr('tabGbn=01&decIteTpCd=01&pageIndex=1'),
  crtr('tabGbn=02&decIteTpCd=02&pageIndex=2'),
  crtr('tabGbn=09&decIteTpCd=09&pageIndex=3'),
  crtr('tabGbn=10&decIteTpCd=10&pageIndex=40'),
  page(CRTR_POPUP),
  page(MOHW_RSS),
]

type Seen = { url: string; init: RequestInit }

// 답을 정해 주는 가짜 fetch. 받은 주소·설정을 적어 둔다
function fake(answer: (call: number) => Response | Promise<Response> = () => new Response('ok')) {
  const seen: Seen[] = []
  const fn = vi.fn<SiteFetch>(async (url, init) => {
    seen.push({ url, init })
    return answer(seen.length)
  })
  return { fn, seen }
}

// 시험이 손으로 답하는 가짜 fetch. 부름이 시작된 가짜 시각을 적어 둔다
type Pending = { url: string; at: number; init: RequestInit; answer: (r?: Response) => void; fail: (e: unknown) => void }
function manual() {
  const calls: Pending[] = []
  const fn = vi.fn<SiteFetch>(
    (url, init) =>
      new Promise<Response>((resolve, reject) => {
        calls.push({ url, at: Date.now(), init, answer: (r = new Response('ok')) => resolve(r), fail: reject })
      }),
  )
  return { fn, calls }
}

async function run(req: SiteRequest, answer: (call: number) => Response | Promise<Response>): Promise<SiteResult> {
  return createFetchSite({ fetchImpl: fake(answer).fn })(req)
}

// 끝없이 1,000,000바이트씩 주는 몸통. 몇 번 당겼는지·끊겼는지 본다
function endless(chunk = 1_000_000) {
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

const pageIndexOf = (url: string) => new URL(url).searchParams.get('pageIndex')
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-7404.1 정해 둔 길만 부른다', () => {
  it.each(ALLOWED)('AC-7404.1: 정해 둔 길은 부른다 — $method $url $form', async (req) => {
    const { fn, seen } = fake()
    const result = await createFetchSite({ fetchImpl: fn })(req)
    expect(result.ok).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe(new URL(req.url).href)
    expect(seen[0].init.method).toBe(req.method ?? 'GET')
  })

  const BLOCKED: [string, SiteRequest][] = [
    ['심평원 /co/', page('https://www.hira.or.kr/co/login.do')],
    ['심평원 첫 화면', page('https://www.hira.or.kr/main.do')],
    ['복지부 글 보기 board.es?…act=view', page('https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1492620&act=view')],
    ['복지부 RSS 길에 act=view', page(`${MOHW_RSS}&act=view`)],
    ['복지부 다른 게시판 RSS', page('https://www.mohw.go.kr/rss/board.es?mid=a10501010000&bid=0003')],
    ['http:', page(HIRA_LIST.replace('https:', 'http:'))],
    ['다른 host', page('https://evil.example/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1')],
    ['www 없는 host', page('https://hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1')],
    ['뒤에 다른 이름이 붙은 host', page('https://www.hira.or.kr.evil.example/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1')],
    ['@ 뒤의 다른 host', page('https://www.hira.or.kr@evil.example/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1')],
    ['사용자·비밀번호가 붙은 주소', page('https://user:pw@www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1')],
    ['다른 port', page('https://www.hira.or.kr:8443/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1')],
    ['.. 로 돌아 다른 길', page('https://www.hira.or.kr/bbs/../co/login.do')],
    ['%2e%2e 로 돌아 다른 길', page('https://www.hira.or.kr/bbs/%2e%2e/co/login.do')],
    ['길 대소문자가 다름', page('https://www.hira.or.kr/BBSDUMMY.do?pgmid=HIRAA020002000100&pageIndex=1')],
    ['다른 게시판 pgmid', page('https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020041000100&pageIndex=1')],
    ['pgmid 없음', page('https://www.hira.or.kr/bbsDummy.do?pageIndex=1')],
    ['모르는 칸', page(`${HIRA_LIST}&act=view`)],
    ['같은 칸 두 번', page(`${HIRA_LIST}&pageIndex=2`)],
    ['숫자가 아닌 값', page(`${HIRA_VIEW}%27`)],
    ['빈 값', page('https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=')],
    ['칸이 빠진 붙임 주소', file('https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2')],
    ['칸이 빠진 팝업 주소', page('https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=20261112&sno=1')],
    ['# 붙은 주소', page(`${HIRA_LIST}#top`)],
    ['심사기준 목록을 GET으로', page(CRTR_LIST)],
    ['공지 목록을 POST로', { url: HIRA_LIST, method: 'POST', form: 'pageIndex=1', kind: 'page' }],
    ['GET에 몸통', { url: HIRA_LIST, form: 'pageIndex=1', kind: 'page' }],
    ['심사기준 목록에 몸통 없음', crtr(undefined)],
    ['심사기준 목록에 없는 탭', crtr('tabGbn=03&decIteTpCd=03&pageIndex=1')],
    ['심사기준 목록 몸통에 모르는 칸', crtr('tabGbn=01&decIteTpCd=01&pageIndex=1&searchWrd=x')],
    ['심사기준 목록 몸통에 쪽 없음', crtr('tabGbn=01&decIteTpCd=01')],
    ['심사기준 목록 몸통에 decIteTpCd 없음(2026-11-22 전 모양)', crtr('tabGbn=01&pageIndex=1')],
    ['심사기준 목록 두 탭 칸이 다름', crtr('tabGbn=01&decIteTpCd=02&pageIndex=1')],
    ['javascript:', page('javascript:alert(1)')],
    ['file:', page('file:///etc/passwd')],
    ['주소가 아닌 글', page('주소 아님')],
    ['빈 글', page('')],
  ]

  it.each(BLOCKED)('AC-7404.1: %s → 부르지 않고 blocked-url', async (_name, req) => {
    const { fn } = fake()
    expect(await createFetchSite({ fetchImpl: fn })(req)).toEqual({ ok: false, fail: 'blocked-url' })
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('AC-7404.2 보내는 모양', () => {
  it('AC-7404.2: 정해 둔 브라우저 모양 User-Agent를 보내고 쿠키·인증 머리는 없다', async () => {
    expect(SITE_USER_AGENT).toMatch(
      /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/,
    )
    for (const req of ALLOWED) {
      const { fn, seen } = fake()
      await createFetchSite({ fetchImpl: fn })(req)
      const headers = new Headers(seen[0].init.headers)
      expect(headers.get('user-agent')).toBe(SITE_USER_AGENT)
      for (const name of ['cookie', 'authorization', 'proxy-authorization']) expect(headers.has(name)).toBe(false)
      expect(seen[0].init.credentials).toBe('omit')
    }
  })

  it('AC-7404.2: 심사기준 목록은 정해 둔 몸통을 form 모양 POST로 보낸다', async () => {
    const { fn, seen } = fake()
    await createFetchSite({ fetchImpl: fn })(crtr('tabGbn=09&decIteTpCd=09&pageIndex=3'))
    expect(seen[0].init.method).toBe('POST')
    expect(seen[0].init.body).toBe('tabGbn=09&decIteTpCd=09&pageIndex=3')
    expect(new Headers(seen[0].init.headers).get('content-type')).toMatch(/^application\/x-www-form-urlencoded\b/)
  })

  it('AC-7404.2: GET에는 몸통이 없다', async () => {
    const { fn, seen } = fake()
    await createFetchSite({ fetchImpl: fn })(page(HIRA_VIEW))
    expect(seen[0].init.body ?? null).toBeNull()
  })

  it.each([301, 302, 303, 307, 308])('AC-7404.2: 돌려보내기 %i는 따라가지 않고 http로 끝낸다', async (status) => {
    const { fn, seen } = fake(() => new Response(null, { status, headers: { location: 'https://evil.example/' } }))
    expect(await createFetchSite({ fetchImpl: fn })(page(HIRA_LIST))).toEqual({ ok: false, fail: 'http' })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(seen[0].init.redirect).toBe('manual')
  })

  it('AC-7404.2: 기본 fetchSite도 이 런타임의 fetch를 같은 규칙으로 부른다', async () => {
    const { fn, seen } = fake(() => new Response('<rss></rss>'))
    vi.stubGlobal('fetch', fn)
    expect(await fetchSite(page(MOHW_RSS))).toEqual({ ok: true, text: '<rss></rss>' })
    expect(seen[0].url).toBe(MOHW_RSS)
    expect(new Headers(seen[0].init.headers).get('user-agent')).toBe(SITE_USER_AGENT)
    expect(seen[0].init.redirect).toBe('manual')
    expect(await fetchSite(page('https://www.hira.or.kr/co/login.do'))).toEqual({ ok: false, fail: 'blocked-url' })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('AC-7404.3 받는 크기·답·시간', () => {
  it('AC-7404.3: 글은 UTF-8 글자로, 붙임은 받은 바이트 그대로 돌려준다', async () => {
    const html = '<p>보건복지부 고시 제2026-218호 · 붙임 1부</p>'
    expect(await run(page(HIRA_VIEW), () => new Response(new TextEncoder().encode(html)))).toEqual({ ok: true, text: html })
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0x80])
    const got = await run(file(HIRA_FILE), () => new Response(bytes))
    expect(got).toEqual({ ok: true, bytes })
    expect(await run(page(MOHW_RSS), () => new Response(null))).toEqual({ ok: true, text: '' })
  })

  it('AC-7404.3: 글은 3,000,000바이트까지 받고 넘으면 too-big', async () => {
    expect(PAGE_MAX_BYTES).toBe(3_000_000)
    const exact = await run(page(HIRA_LIST), () => new Response(new Uint8Array(3_000_000).fill(0x61)))
    expect(exact.ok && 'text' in exact ? exact.text.length : -1).toBe(3_000_000)
    const over = await run(page(HIRA_LIST), () => new Response(new Uint8Array(3_000_001).fill(0x61)))
    expect(over).toEqual({ ok: false, fail: 'too-big' })
  })

  it('AC-7404.3: 붙임은 15,000,000바이트까지 받고 넘으면 too-big', async () => {
    expect(FILE_MAX_BYTES).toBe(15_000_000)
    const exact = await run(file(HIRA_FILE), () => new Response(new Uint8Array(15_000_000)))
    expect(exact.ok && 'bytes' in exact ? exact.bytes.byteLength : -1).toBe(15_000_000)
    const over = await run(file(HIRA_FILE), () => new Response(new Uint8Array(15_000_001)))
    expect(over).toEqual({ ok: false, fail: 'too-big' })
  })

  it.each([
    ['글', page(HIRA_LIST), 3],
    ['붙임', file(HIRA_FILE), 15],
  ] as const)('AC-7404.3: %s이 한도를 넘으면 그 자리에서 그만 받고 몸통을 끊는다', async (_name, req, megabytes) => {
    const { stream, state } = endless()
    expect(await run(req, () => new Response(stream))).toEqual({ ok: false, fail: 'too-big' })
    expect(state.cancelled).toBe(true)
    expect(state.pulls).toBeLessThanOrEqual(megabytes + 3)
  })

  it('AC-7404.3: 크기 머리(content-length)가 한도를 넘으면 몸통을 읽지 않고 too-big', async () => {
    const { stream, state } = endless()
    const res = () => new Response(stream, { headers: { 'content-length': '3000001' } })
    expect(await run(page(HIRA_LIST), res)).toEqual({ ok: false, fail: 'too-big' })
    expect(state.cancelled).toBe(true)
    expect(state.pulls).toBeLessThanOrEqual(1)
  })

  it.each([201, 204, 206, 304, 403, 404, 500, 503])('AC-7404.3: 200이 아닌 %i는 http', async (status) => {
    expect(await run(page(HIRA_LIST), () => new Response(null, { status }))).toEqual({ ok: false, fail: 'http' })
  })

  it('AC-7404.3: 200이 아닌 답의 몸통은 읽지 않고 끊는다', async () => {
    const { stream, state } = endless()
    expect(await run(page(HIRA_LIST), () => new Response(stream, { status: 500 }))).toEqual({ ok: false, fail: 'http' })
    expect(state.cancelled).toBe(true)
  })

  it.each([
    ['글', page(HIRA_LIST), 15_000],
    ['붙임', file(HIRA_FILE), 30_000],
  ] as const)('AC-7404.3: %s은 답이 없으면 %i ms에 timeout이고 부름을 끊는다', async (_name, req, ms) => {
    expect(PAGE_TIMEOUT_MS).toBe(15_000)
    expect(FILE_TIMEOUT_MS).toBe(30_000)
    vi.useFakeTimers({ now: 0 })
    const { fn, seen } = fake(() => new Promise<Response>(() => {}))
    let result: SiteResult | undefined
    void createFetchSite({ fetchImpl: fn })(req).then((r) => {
      result = r
    })
    await tick(ms - 1)
    expect(result).toBeUndefined()
    expect(seen[0].init.signal?.aborted).toBe(false)
    await tick(1)
    expect(result).toEqual({ ok: false, fail: 'timeout' })
    expect(seen[0].init.signal?.aborted).toBe(true)
  })

  it('AC-7404.3: 몸통을 받다가 멈춰도 시간이 넘으면 timeout이고 몸통을 끊는다', async () => {
    vi.useFakeTimers({ now: 0 })
    const state = { cancelled: false }
    const stalled = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('<html>'))
      },
      cancel() {
        state.cancelled = true
      },
    })
    let result: SiteResult | undefined
    void run(page(HIRA_VIEW), () => new Response(stalled)).then((r) => {
      result = r
    })
    await tick(14_999)
    expect(result).toBeUndefined()
    await tick(1)
    expect(result).toEqual({ ok: false, fail: 'timeout' })
    expect(state.cancelled).toBe(true)
  })

  it('AC-7404.3: 연결이 끊겨도 결과는 실패 종류 하나뿐이고 오류 글·주소를 담지 않는다(로그도 없음)', async () => {
    const logs = (['error', 'warn', 'log', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const message = `fetch failed: ECONNRESET ${HIRA_VIEW}`
    const thrown = await run(page(HIRA_VIEW), () => Promise.reject(new TypeError(message)))
    const broken = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([0x3c]))
        c.error(new Error(message))
      },
    })
    const midway = await run(page(HIRA_VIEW), () => new Response(broken))
    for (const r of [thrown, midway]) {
      expect(r).toEqual({ ok: false, fail: 'timeout' })
      expect(Object.keys(r).sort()).toEqual(['fail', 'ok'])
      expect(JSON.stringify(r)).not.toMatch(/hira|ECONNRESET|fetch failed/)
    }
    for (const spy of logs) expect(spy).not.toHaveBeenCalled()
  })
})

describe('AC-7404.4 host마다 동시 2개 · 시작 간격 300ms', () => {
  it('AC-7404.4: 한 host에 동시에 2개까지이고, 같은 host 부름 시작 사이는 300ms 이상이며 온 차례대로 시작한다', async () => {
    expect(HOST_MAX_RUNNING).toBe(2)
    expect(HOST_GAP_MS).toBe(300)
    vi.useFakeTimers({ now: 0 })
    const { fn, calls } = manual()
    const site = createFetchSite({ fetchImpl: fn })
    const all = Promise.all([1, 2, 3, 4, 5].map((n) => site(listPage(n))))
    const starts = () => calls.map((c) => [c.at, pageIndexOf(c.url)])

    await tick(0)
    expect(starts()).toEqual([[0, '1']])
    await tick(299)
    expect(starts()).toHaveLength(1)
    await tick(1)
    expect(starts()).toEqual([
      [0, '1'],
      [300, '2'],
    ])
    await tick(5_000) // t=5300: 둘이 아직 돌고 있으면 셋째는 기다린다
    expect(starts()).toHaveLength(2)

    calls[0].answer()
    await tick(0)
    expect(starts()[2]).toEqual([5_300, '3'])
    calls[1].answer()
    await tick(0)
    expect(starts()).toHaveLength(3) // 자리는 났지만 셋째 시작부터 300ms가 안 됐다
    await tick(299)
    expect(starts()).toHaveLength(3)
    await tick(1)
    expect(starts()[3]).toEqual([5_600, '4'])

    calls[2].answer()
    calls[3].answer()
    await tick(300)
    expect(starts()[4]).toEqual([5_900, '5'])
    calls[4].answer()
    expect(await all).toEqual(Array.from({ length: 5 }, () => ({ ok: true, text: 'ok' })))

    const times = calls.map((c) => c.at)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(300)
  })

  it('AC-7404.4: 다른 host는 따로 센다(심평원이 기다려도 복지부는 바로 시작)', async () => {
    vi.useFakeTimers({ now: 0 })
    const { fn, calls } = manual()
    const site = createFetchSite({ fetchImpl: fn })
    void site(listPage(1))
    void site(listPage(2))
    void site(page(MOHW_RSS))
    await tick(0)
    expect(calls.map((c) => [c.at, new URL(c.url).host])).toEqual([
      [0, 'www.hira.or.kr'],
      [0, 'www.mohw.go.kr'],
    ])
    await tick(300)
    expect(calls.map((c) => [c.at, new URL(c.url).host])[2]).toEqual([300, 'www.hira.or.kr'])
  })

  it('AC-7404.4: 실패(끊김·200 아님)로 끝난 부름도 자리를 돌려준다', async () => {
    vi.useFakeTimers({ now: 0 })
    const at: number[] = []
    const { fn } = fake((call) => {
      at.push(Date.now())
      if (call === 1) return Promise.reject(new TypeError('fetch failed'))
      if (call === 2) return new Response(null, { status: 500 })
      return new Response('ok')
    })
    const site = createFetchSite({ fetchImpl: fn })
    const all = Promise.all([1, 2, 3, 4].map((n) => site(listPage(n))))
    await tick(1_000)
    expect(await all).toEqual([
      { ok: false, fail: 'timeout' },
      { ok: false, fail: 'http' },
      { ok: true, text: 'ok' },
      { ok: true, text: 'ok' },
    ])
    expect(at).toEqual([0, 300, 600, 900])
  })

  it('AC-7404.4: 시간이 넘어 끝난 부름도 자리를 돌려준다', async () => {
    vi.useFakeTimers({ now: 0 })
    const { fn, calls } = manual()
    const site = createFetchSite({ fetchImpl: fn })
    const first = site(listPage(1))
    void site(listPage(2))
    void site(listPage(3))
    await tick(14_999)
    expect(calls).toHaveLength(2)
    await tick(1)
    expect(await first).toEqual({ ok: false, fail: 'timeout' })
    expect(calls.map((c) => c.at)).toEqual([0, 300, 15_000])
  })

  it('AC-7404.4: 막힌 주소는 자리를 기다리지 않고 바로 blocked-url이다', async () => {
    vi.useFakeTimers({ now: 0 })
    const { fn, calls } = manual()
    const site = createFetchSite({ fetchImpl: fn })
    void site(listPage(1))
    void site(listPage(2))
    let result: SiteResult | undefined
    void site(page('https://www.hira.or.kr/co/login.do')).then((r) => {
      result = r
    })
    await tick(0)
    expect(result).toEqual({ ok: false, fail: 'blocked-url' })
    expect(calls).toHaveLength(1)
  })
})
