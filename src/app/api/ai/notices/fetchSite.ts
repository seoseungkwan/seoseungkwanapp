import 'server-only'
import type { SiteRequest, SiteResult } from '@/types/notices'

// 바깥 사이트(심평원·보건복지부) 부르기 규칙(specs/notices REQ-7404, design 4·5절).
// 정해 둔 길만 · 브라우저 모양 UA · 쿠키·인증 머리 없음 · 돌려보내기(3xx) 안 따라감 · 크기·시간 한도 · host마다 동시 2개·시작 간격 300ms.
// 결과에는 실패 종류만 담는다(오류 글·주소 없음). 이 파일은 console을 쓰지 않는다

// curl 기본 UA는 심평원에서 답이 오지 않는다(2026-11-21 실측). 브라우저 모양 UA 하나로 고정한다
export const SITE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
export const PAGE_MAX_BYTES = 3_000_000
export const FILE_MAX_BYTES = 15_000_000
export const PAGE_TIMEOUT_MS = 15_000
export const FILE_TIMEOUT_MS = 30_000
export const HOST_MAX_RUNNING = 2
export const HOST_GAP_MS = 300

export type SiteFetch = (url: string, init: RequestInit) => Promise<Response>

type Fail = Extract<SiteResult, { ok: false }>['fail']
const fail = (kind: Fail): SiteResult => ({ ok: false, fail: kind })

// 정해 둔 길(design 5절). 칸 이름은 정확히 이것만(빠짐·더함·두 번 없음)이고 값은 모양에 맞아야 한다
type Fields = Readonly<Record<string, RegExp>>
type Route = { host: string; path: string; method: 'GET' | 'POST'; query: Fields; form?: Fields }
const HIRA = 'www.hira.or.kr'
const MOHW = 'www.mohw.go.kr'
const NUM = /^\d{1,20}$/
const NOTICE_BOARD = /^HIRAA020002000100$/
const ROUTES: readonly Route[] = [
  // 심평원 공지 목록 · 글
  { host: HIRA, path: '/bbsDummy.do', method: 'GET', query: { pgmid: NOTICE_BOARD, pageIndex: NUM } },
  { host: HIRA, path: '/bbsDummy.do', method: 'GET', query: { pgmid: NOTICE_BOARD, brdScnBltNo: NUM, brdBltNo: NUM } },
  // 심평원 공지 붙임
  { host: HIRA, path: '/bbs/bbsCDownLoad.do', method: 'GET', query: { apndNo: NUM, apndBrdBltNo: NUM, apndBrdTyNo: NUM, apndBltNo: NUM } },
  // 보험인정기준 목록(POST) · 팝업
  {
    host: HIRA,
    path: '/rc/insu/insuadtcrtr/InsuAdtCrtrList.do',
    method: 'POST',
    query: { pgmid: /^HIRAA030069000410$/ },
    form: { tabGbn: /^(?:01|02|09|10)$/, pageIndex: NUM },
  },
  { host: HIRA, path: '/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do', method: 'GET', query: { mtgHmeDd: NUM, sno: NUM, mtgMtrRegSno: NUM } },
  // 보건복지부 훈령/고시 RSS(robots가 board.es 쪽을 막아 RSS만 읽는다)
  { host: MOHW, path: '/rss/board.es', method: 'GET', query: { mid: /^a10409020000$/, bid: /^0026$/ } },
]

function fieldsMatch(params: URLSearchParams, fields: Fields): boolean {
  const keys = [...params.keys()]
  const names = Object.keys(fields)
  if (keys.length !== names.length || new Set(keys).size !== keys.length) return false
  return names.every((name) => {
    const value = params.get(name)
    return value !== null && fields[name].test(value)
  })
}

type Target = { host: string; href: string; method: 'GET' | 'POST'; body: string | undefined }

// 정해 둔 길이면 실제로 보낼 주소·몸통(URL이 정리한 모양), 아니면 null
function targetOf(req: SiteRequest): Target | null {
  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' || url.hash !== '') return null
  const method = req.method ?? 'GET'
  const route = ROUTES.find(
    (r) => r.host === url.hostname && r.path === url.pathname && r.method === method && fieldsMatch(url.searchParams, r.query),
  )
  if (!route) return null
  const base = { host: url.hostname, href: url.href, method }
  if (!route.form) return req.form === undefined ? { ...base, body: undefined } : null
  if (typeof req.form !== 'string') return null
  const form = new URLSearchParams(req.form)
  return fieldsMatch(form, route.form) ? { ...base, body: form.toString() } : null
}

// host 줄: 한 host에 동시에 HOST_MAX_RUNNING개까지, 시작 사이 HOST_GAP_MS 이상. 온 차례대로 시작한다
type Lane = { running: number; lastStart: number; freed: (() => void)[]; turn: Promise<void> }
const newLane = (): Lane => ({ running: 0, lastStart: -Infinity, freed: [], turn: Promise.resolve() })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function enter(lane: Lane): Promise<void> {
  const before = lane.turn
  let done!: () => void
  lane.turn = new Promise<void>((resolve) => {
    done = () => resolve()
  })
  await before
  try {
    while (lane.running >= HOST_MAX_RUNNING) await new Promise<void>((resolve) => lane.freed.push(resolve))
    const wait = lane.lastStart + HOST_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lane.lastStart = Date.now()
    lane.running += 1
  } finally {
    done()
  }
}

function leave(lane: Lane): void {
  lane.running -= 1
  lane.freed.shift()?.()
}

function requestInit(target: Target, isFile: boolean, signal: AbortSignal): RequestInit {
  const headers: Record<string, string> = {
    'User-Agent': SITE_USER_AGENT,
    Accept: isFile ? '*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  }
  if (target.body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
  return { method: target.method, headers, body: target.body, redirect: 'manual', credentials: 'omit', cache: 'no-store', signal }
}

// 크기 머리가 한도를 넘는다고 미리 말하면 받지 않는다. 압축된 답의 머리는 풀기 전 크기라 받으면서 센다
function declaredTooBig(headers: Headers, limit: number): boolean {
  const encoding = headers.get('content-encoding')?.trim().toLowerCase()
  if (encoding && encoding !== 'identity') return false
  const length = Number(headers.get('content-length') ?? '')
  return Number.isFinite(length) && length > limit
}

// 한도를 넘는 순간 그만 읽는다(남은 몸통은 부른 쪽이 끊는다)
async function readCapped(reader: ReadableStreamDefaultReader<Uint8Array>, limit: number): Promise<Uint8Array | 'too-big'> {
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) return 'too-big'
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}

async function callOnce(fetchImpl: SiteFetch, target: Target, kind: SiteRequest['kind']): Promise<SiteResult> {
  const isFile = kind === 'file'
  const limit = isFile ? FILE_MAX_BYTES : PAGE_MAX_BYTES
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  // 시간 한도는 답 머리와 몸통 받기 모두에 건다. 넘으면 부름을 끊는다
  const expired = new Promise<'expired'>((resolve) => {
    timer = setTimeout(
      () => {
        controller.abort()
        resolve('expired')
      },
      isFile ? FILE_TIMEOUT_MS : PAGE_TIMEOUT_MS,
    )
  })
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const res = await Promise.race([fetchImpl(target.href, requestInit(target, isFile, controller.signal)), expired])
    if (res === 'expired') return fail('timeout')
    reader = res.body?.getReader()
    if (res.status !== 200) return fail('http') // 돌려보내기(3xx)도 여기서 끝난다
    if (declaredTooBig(res.headers, limit)) return fail('too-big')
    const bytes = reader ? await Promise.race([readCapped(reader, limit), expired]) : new Uint8Array(0)
    if (bytes === 'expired') return fail('timeout')
    if (bytes === 'too-big') return fail('too-big')
    return isFile ? { ok: true, bytes } : { ok: true, text: new TextDecoder().decode(bytes) }
  } catch {
    // 연결 끊김(받는 도중 포함)은 제때 답을 받지 못한 것과 같이 본다. 오류 글은 버린다
    return fail('timeout')
  } finally {
    clearTimeout(timer)
    reader?.cancel().catch(() => undefined)
  }
}

/** 정해 둔 규칙으로 사이트를 부르는 함수를 만든다. host 줄은 만든 함수마다 따로다 */
export function createFetchSite(deps: { fetchImpl?: SiteFetch } = {}): (req: SiteRequest) => Promise<SiteResult> {
  const fetchImpl: SiteFetch = deps.fetchImpl ?? ((url, init) => fetch(url, init))
  const lanes = new Map<string, Lane>()
  return async (req) => {
    const target = targetOf(req)
    if (!target) return fail('blocked-url')
    let lane = lanes.get(target.host)
    if (!lane) {
      lane = newLane()
      lanes.set(target.host, lane)
    }
    await enter(lane)
    try {
      return await callOnce(fetchImpl, target, req.kind)
    } finally {
      leave(lane)
    }
  }
}

/** 모으기 실행이 쓰는 기본 부르기(이 런타임의 fetch). host 줄은 한 서버 실행 안에서 함께 쓴다 */
export const fetchSite = createFetchSite()
