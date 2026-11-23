// 다른 의원 보기의 보기 열쇠 (admin-view REQ-8004, design.md '보기 열쇠 · 브라우저 쓰기 막기', ADR-046).
// 열쇠는 이 브라우저의 세션 쿠키 ssk_view에 두고, 브라우저·서버 Supabase 클라이언트가 요청 머리 x-ssk-view로 보낸다.
// DB(admin_view_hospital_id)가 '부른 관리자의 열린 보기 줄'일 때만 읽기를 그 의원으로 바꾸고 쓰기를 모두 막는다.
// 여기 readOnlyFetch는 그 위에 한 겹 더 — 보는 중 브라우저가 쓰기 요청을 아예 보내지 않게 거른다

export const VIEW_COOKIE = 'ssk_view'
export const VIEW_HEADER = 'x-ssk-view'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ATTRIBUTES = 'Path=/; SameSite=Lax; Secure'

/** 쿠키 값 하나가 uuid 모양이면 소문자 열쇠, 아니면 null (서버 쿠키 저장소의 값에 쓴다) */
export function viewKeyOf(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !UUID.test(value)) return null
  return value.toLowerCase()
}

/** 쿠키 글에서 열쇠(uuid 모양만, 소문자). 없으면 null */
export function readViewKey(cookieText: string): string | null {
  for (const part of cookieText.split(';')) {
    const at = part.indexOf('=')
    if (at < 0 || part.slice(0, at).trim() !== VIEW_COOKIE) continue
    return viewKeyOf(part.slice(at + 1).trim())
  }
  return null
}

/** 'ssk_view=<key>; Path=/; SameSite=Lax; Secure' (Max-Age 없음 = 세션 쿠키) */
export function viewCookie(key: string): string {
  return `${VIEW_COOKIE}=${key}; ${ATTRIBUTES}`
}

/** 'ssk_view=; Path=/; SameSite=Lax; Secure; Max-Age=0' */
export function clearViewCookie(): string {
  return `${VIEW_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`
}

export function setViewKey(key: string): void {
  document.cookie = viewCookie(key)
}

export function dropViewKey(): void {
  document.cookie = clearViewCookie()
}

/** 보는 중에도 보내는 함수(읽기만 하거나 보기 시작·끝·관리자 함수) */
export const VIEW_READ_RPCS: readonly string[] = [
  'sales_code_totals',
  'notice_list',
  'notice_search',
  'notice_unread_count',
  'notice_ask_left',
  'notice_rule_alerts',
  'rule_change_alerts',
  'desk_members',
  'my_desk',
  'my_signup_emr',
  'admin_hospitals',
  'admin_view_hospitals',
  'admin_view_log',
  'admin_rows',
  'my_admin_view',
  'start_admin_view',
  'stop_admin_view',
]

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const READONLY_BODY = '{"code":"E-VIEW-READONLY"}'

/** 관리자 화면(/admin과 그 아래). components/shell/viewPaths.ts의 isAdminScreen과 같은 규칙(같은 Phase라 서로 부르지 않는다) */
function isAdminScreen(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/')
}

/** 요청을 보낼 때의 지금 페이지가 관리자 화면인가(문서 밖 = 아님) */
function onAdminScreen(): boolean {
  const pathname = (globalThis as { location?: { pathname?: unknown } }).location?.pathname
  return typeof pathname === 'string' && isAdminScreen(pathname)
}

function requestOf(input: RequestInfo | URL, init: RequestInit | undefined): { method: string; path: string } {
  const isRequest = typeof Request !== 'undefined' && input instanceof Request
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
  const method = (init?.method ?? (isRequest ? (input as Request).method : 'GET')).toUpperCase()
  // 주소 표준화(../ 풀기) 뒤의 경로. 겹친 /는 하나로 본다
  const path = new URL(url, 'http://localhost').pathname.replace(/\/{2,}/g, '/')
  return { method, path }
}

/** 보내도 되는 요청인가 (design.md '거르기 규칙') */
function allowed(method: string, path: string): boolean {
  if (!WRITE_METHODS.has(method)) return true
  if (path.startsWith('/auth/v1/')) return true
  if (method === 'POST') {
    const rpc = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(path)
    if (rpc !== null && VIEW_READ_RPCS.includes(rpc[1])) return true
    if (path.startsWith('/storage/v1/object/sign/') || path.startsWith('/storage/v1/object/list/')) return true
  }
  return !path.startsWith('/rest/v1/') && !path.startsWith('/storage/v1/')
}

/** 보는 중 브라우저 쓰기 거르기. 감싼 fetch를 돌려준다(막은 요청은 보내지 않고 403 {"code":"E-VIEW-READONLY"}) */
export function readOnlyFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (!onAdminScreen()) {
      const { method, path } = requestOf(input, init)
      if (!allowed(method, path)) {
        return new Response(READONLY_BODY, { status: 403, headers: { 'content-type': 'application/json' } })
      }
    }
    return base(input, init)
  }
}
