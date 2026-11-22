import 'server-only'
import type { KeyKind, SiteRequest, SourceFail, SourceResult } from '@/types/location'

// 입지 분석 바깥 부르기 규칙(specs/location design.md 3절, ADR-042, AC-7903.3·AC-7903.4).
// 정해 둔 host만(열쇠 종류와 맞는 host) · https · GET · 돌려보내기 안 따라감(redirect: 'error') · 8초 · 2,000,000바이트 · 브라우저 모양 UA ·
// 쿠키·캐시 없음. 열쇠는 여기서만 싣는다: 카카오는 Authorization: KakaoAK <열쇠>, 공공은 serviceKey=<디코딩 열쇠>(URLSearchParams가 인코딩).
// 결과에는 실패 종류(http면 상태 번호)만 담는다(오류 글·주소·열쇠 없음). 아무것도 담아 두지 않고, 이 파일은 console을 쓰지 않는다

export const SOURCE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
export const SOURCE_TIMEOUT_MS = 8_000
export const SOURCE_MAX_BYTES = 2_000_000

// 열쇠 종류마다 부를 수 있는 host(사람 흐름도 apis.data.go.kr, design.md 3절)
const HOSTS: Readonly<Record<KeyKind, readonly string[]>> = {
  kakao: ['dapi.kakao.com'],
  data: ['apis.data.go.kr', 'api.data.go.kr', 'api.odcloud.kr'],
}

export type SourceFetch = (url: string, init: RequestInit) => Promise<Response>
export type SourceKey = { kind: KeyKind; value: string }

const fail = (kind: SourceFail, status?: number): SourceResult =>
  status === undefined ? { ok: false, fail: kind } : { ok: false, fail: kind, status }

/** 열쇠는 서버 환경 변수 둘에서만 읽는다(앞뒤 공백 뺌). 비었으면 null */
export function readKey(kind: KeyKind): string | null {
  const raw = kind === 'kakao' ? process.env.KAKAO_REST_KEY : kind === 'data' ? process.env.DATA_GO_KR_KEY : undefined
  const value = raw?.trim() ?? ''
  return value === '' ? null : value
}

// 공공데이터포털이 열쇠를 받지 않은 답: 미등록 열쇠(30)·접근 거부(20) — 활용신청이 안 됐거나 아직 반영 전이다(design.md 3절)
const REFUSAL_NAME = /SERVICE_KEY_IS_NOT_REGISTERED_ERROR|SERVICE_ACCESS_DENIED_ERROR/
const REFUSAL_XML = /<(?:returnReasonCode|resultCode)>\s*(?:20|30)\s*<\//
const REFUSAL_JSON = /"(?:returnReasonCode|resultCode)"\s*:\s*"?(?:20|30)"?\s*[,}]/
export function isNotRegistered(text: string): boolean {
  return REFUSAL_NAME.test(text) || REFUSAL_XML.test(text) || REFUSAL_JSON.test(text)
}

// 정해 둔 host면 실제로 보낼 주소(공공은 serviceKey를 하나만 싣는다), 아니면 null
function targetOf(req: SiteRequest, key: SourceKey): string | null {
  if (!Object.hasOwn(HOSTS, key.kind) || typeof key.value !== 'string' || key.value === '') return null
  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' || url.hash !== '') return null
  if (!HOSTS[key.kind].includes(url.hostname)) return null
  if (key.kind === 'data') {
    const params = new URLSearchParams()
    for (const [name, value] of url.searchParams) if (name.toLowerCase() !== 'servicekey') params.append(name, value)
    params.append('serviceKey', key.value)
    url.search = params.toString()
  }
  return url.href
}

function requestInit(key: SourceKey, signal: AbortSignal): RequestInit {
  const headers: Record<string, string> = {
    'User-Agent': SOURCE_USER_AGENT,
    Accept: 'application/json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  }
  if (key.kind === 'kakao') headers.Authorization = `KakaoAK ${key.value}`
  return { method: 'GET', headers, redirect: 'error', credentials: 'omit', cache: 'no-store', signal }
}

// 크기 머리가 한도를 넘는다고 미리 말하면 받지 않는다. 압축된 답의 머리는 풀기 전 크기라 받으면서 센다
function declaredTooBig(headers: Headers): boolean {
  const encoding = headers.get('content-encoding')?.trim().toLowerCase()
  if (encoding && encoding !== 'identity') return false
  const length = Number(headers.get('content-length') ?? '')
  return Number.isFinite(length) && length > SOURCE_MAX_BYTES
}

// 한도를 넘는 순간 그만 읽는다(남은 몸통은 부른 쪽이 끊는다)
async function readCapped(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array | 'too-big'> {
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > SOURCE_MAX_BYTES) return 'too-big'
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

async function callOnce(fetchImpl: SourceFetch, href: string, key: SourceKey): Promise<SourceResult> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  // 시간 한도는 답 머리와 몸통 받기 모두에 건다. 넘으면 부름을 끊는다
  const expired = new Promise<'expired'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('expired')
    }, SOURCE_TIMEOUT_MS)
  })
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const res = await Promise.race([fetchImpl(href, requestInit(key, controller.signal)), expired])
    if (res === 'expired') return fail('timeout')
    reader = res.body?.getReader()
    // 돌려보내기(3xx)·돌려보내진 답도 여기서 끝난다
    if (res.status !== 200 || res.redirected) return fail('http', res.status)
    if (declaredTooBig(res.headers)) return fail('too-big')
    const bytes = reader ? await Promise.race([readCapped(reader), expired]) : new Uint8Array(0)
    if (bytes === 'expired') return fail('timeout')
    if (bytes === 'too-big') return fail('too-big')
    return { ok: true, text: new TextDecoder().decode(bytes) }
  } catch {
    // 연결 실패·끊김·돌려보내기 오류(redirect: 'error'). 오류 글은 버린다(주소에 열쇠가 들 수 있다)
    return fail('http')
  } finally {
    clearTimeout(timer)
    reader?.cancel().catch(() => undefined)
  }
}

/** 정해 둔 규칙으로 바깥을 부르는 함수를 만든다(시험은 가짜 fetch를 넣는다). 부를 때마다 새로 부르고 아무것도 담아 두지 않는다 */
export function createFetchSource(deps: { fetchImpl?: SourceFetch } = {}): (req: SiteRequest, key: SourceKey) => Promise<SourceResult> {
  const fetchImpl: SourceFetch = deps.fetchImpl ?? ((url, init) => fetch(url, init))
  return async (req, key) => {
    const href = targetOf(req, key)
    if (href === null) return fail('blocked-url')
    return callOnce(fetchImpl, href, key)
  }
}

/** 서버 경로가 쓰는 기본 부르기(이 런타임의 fetch) */
export const fetchSource = createFetchSource()
