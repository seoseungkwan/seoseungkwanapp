import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VIEW_COOKIE,
  VIEW_HEADER,
  VIEW_READ_RPCS,
  clearViewCookie,
  dropViewKey,
  readOnlyFetch,
  readViewKey,
  setViewKey,
  viewCookie,
  viewKeyOf,
} from './viewKey'

// 보기 열쇠 쿠키·요청 머리·보는 중 브라우저 쓰기 거르기 (admin-view REQ-8004, design.md '보기 열쇠 · 브라우저 쓰기 막기').
// 실제 Supabase에 붙지 않는다. 진짜 fetch 대신 가짜(base)를 넘겨 부른 것만 본다
const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e'
const UPPER = '0F8FAD5B-D9CB-469F-A165-70867728950E'
const BASE = 'https://abcd.supabase.co'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AC-8004.1 쿠키 이름·머리 이름', () => {
  it('AC-8004.1: 쿠키는 ssk_view, 요청 머리는 x-ssk-view다', () => {
    expect(VIEW_COOKIE).toBe('ssk_view')
    expect(VIEW_HEADER).toBe('x-ssk-view')
  })
})

describe('AC-8004.1 readViewKey — 쿠키 글에서 열쇠 읽기', () => {
  it.each([
    ['열쇠 하나', `ssk_view=${KEY}`, KEY],
    ['다른 쿠키 사이', `sb-abcd-auth-token=base64-abc; ssk_view=${KEY}; theme=dark`, KEY],
    ['빈칸 없이 이어 붙음', `a=1;ssk_view=${KEY}`, KEY],
    ['끝에 ;', `ssk_view=${KEY};`, KEY],
    ['대문자 → 소문자', `ssk_view=${UPPER}`, KEY],
  ])('AC-8004.1: uuid 모양이면 그 값(소문자)이다 — %s', (_, text, expected) => {
    expect(readViewKey(text)).toBe(expected)
  })

  it.each([
    ['빈 글', ''],
    ['쿠키 없음', 'sb-abcd-auth-token=base64-abc; theme=dark'],
    ['값 비었음', 'ssk_view='],
    ['uuid 아님', 'ssk_view=not-a-uuid'],
    ['uuid 뒤에 더 붙음', `ssk_view=${KEY}-x`],
    ['중괄호', `ssk_view={${KEY}}`],
    ['따옴표', `ssk_view="${KEY}"`],
    ['한 자리 모자람', `ssk_view=${KEY.slice(0, -1)}`],
    ['16진수 아닌 글자', `ssk_view=${KEY.slice(0, -1)}g`],
    ['이름이 더 김(앞)', `xssk_view=${KEY}`],
    ['이름이 더 김(뒤)', `ssk_view2=${KEY}`],
    ['다른 쿠키 값 안에 이름', `note=ssk_view=${KEY}`],
  ])('AC-8004.1: 아니면 null이다 — %s', (_, text) => {
    expect(readViewKey(text)).toBeNull()
  })
})

describe('AC-8004.1 viewKeyOf — 쿠키 값 하나 보기(서버 쿠키 저장소용)', () => {
  it.each([
    [KEY, KEY],
    [UPPER, KEY],
    ['', null],
    ['not-a-uuid', null],
    [`${KEY};Path=/`, null],
    [undefined, null],
    [null, null],
  ])('AC-8004.1: %s → %s', (value, expected) => {
    expect(viewKeyOf(value)).toBe(expected)
  })
})

describe('AC-8004.1 쿠키 쓰기 글', () => {
  it('AC-8004.1: viewCookie는 세션 쿠키다(Max-Age·Expires 없음 = 브라우저를 닫으면 사라짐)', () => {
    expect(viewCookie(KEY)).toBe(`ssk_view=${KEY}; Path=/; SameSite=Lax; Secure`)
    expect(viewCookie(KEY)).not.toMatch(/max-age|expires/i)
  })

  it('AC-8004.1: clearViewCookie는 같은 이름·경로에 Max-Age=0이다', () => {
    expect(clearViewCookie()).toBe('ssk_view=; Path=/; SameSite=Lax; Secure; Max-Age=0')
  })

  it('AC-8004.1: setViewKey는 document.cookie에 viewCookie 글을 쓴다', () => {
    const doc = { cookie: '' }
    vi.stubGlobal('document', doc)
    setViewKey(KEY)
    expect(doc.cookie).toBe(`ssk_view=${KEY}; Path=/; SameSite=Lax; Secure`)
  })

  it('AC-8004.1: dropViewKey는 document.cookie에 clearViewCookie 글을 쓴다', () => {
    const doc = { cookie: `ssk_view=${KEY}` }
    vi.stubGlobal('document', doc)
    dropViewKey()
    expect(doc.cookie).toBe('ssk_view=; Path=/; SameSite=Lax; Secure; Max-Age=0')
  })
})

describe('AC-8004.3 VIEW_READ_RPCS — 보는 중에도 보내는 함수', () => {
  it('AC-8004.3: design.md의 목록 그대로다', () => {
    expect([...VIEW_READ_RPCS]).toEqual([
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
    ])
  })
})

// 가짜 진짜 fetch. 부르면 200 답
function fakeBase() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input
    void init
    return new Response('[]', { status: 200 })
  })
}

const PASS: [string, string][] = [
  ['GET', '/rest/v1/tasks?select=*'],
  ['get', '/rest/v1/tasks?select=*'],
  ['HEAD', '/rest/v1/tasks?select=*'],
  ['GET', '/storage/v1/object/authenticated/inventory-photos/h1/a.jpg'],
  ['POST', '/auth/v1/token?grant_type=refresh_token'],
  ['POST', '/auth/v1/logout'],
  ['PUT', '/auth/v1/user'],
  ['DELETE', '/auth/v1/factors/f1'],
  ...VIEW_READ_RPCS.map((name): [string, string] => ['POST', `/rest/v1/rpc/${name}`]),
  ['POST', '/rest/v1/rpc/notice_list?limit=20'],
  ['POST', '/storage/v1/object/sign/inventory-photos/h1/a.jpg'],
  ['POST', '/storage/v1/object/sign/inventory-photos'],
  ['POST', '/storage/v1/object/list/inventory-photos'],
]

const BLOCK: [string, string][] = [
  ['POST', '/rest/v1/tasks'],
  ['post', '/rest/v1/tasks'],
  ['PATCH', '/rest/v1/tasks?id=eq.1'],
  ['PUT', '/rest/v1/tasks?id=eq.1'],
  ['DELETE', '/rest/v1/tasks?id=eq.1'],
  ['POST', '/rest/v1/rpc/save_fake_note'],
  ['POST', '/rest/v1/rpc/notice_listx'],
  ['POST', '/rest/v1/rpc/'],
  ['POST', '/rest/v1/rpc/notice_list/extra'],
  ['PATCH', '/rest/v1/rpc/notice_list'],
  ['POST', '/storage/v1/object/inventory-photos/h1/a.jpg'],
  ['PUT', '/storage/v1/object/inventory-photos/h1/a.jpg'],
  ['DELETE', '/storage/v1/object/inventory-photos'],
  ['POST', '/storage/v1/object/move'],
  ['POST', '/storage/v1/object/copy'],
  ['POST', '/storage/v1/object/upload/sign/inventory-photos/h1/a.jpg'],
  ['PUT', '/storage/v1/object/sign/inventory-photos/h1/a.jpg'],
  ['POST', '/storage/v1/bucket'],
  // 경로 비틀기: 주소 표준화 뒤의 경로로 본다
  ['POST', '/auth/v1/../../rest/v1/tasks'],
  ['POST', '/auth/v1/%2e%2e/%2e%2e/rest/v1/tasks'],
  ['POST', '/storage/v1/object/sign/../inventory-photos/a.jpg'],
  ['POST', '//rest/v1/tasks'],
  ['POST', '/rest//v1/tasks'],
]

async function expectBlocked(response: Response, base: ReturnType<typeof fakeBase>) {
  expect(base).not.toHaveBeenCalled()
  expect(response.status).toBe(403)
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(await response.text()).toBe('{"code":"E-VIEW-READONLY"}')
}

describe('AC-8004.3 readOnlyFetch — 보는 중 쓰기 거르기', () => {
  it.each(PASS)('AC-8004.3: %s %s는 그대로 보낸다', async (method, path) => {
    const base = fakeBase()
    const init = { method, headers: { apikey: 'anon-key' } }
    const response = await readOnlyFetch(base)(`${BASE}${path}`, init)
    expect(base).toHaveBeenCalledExactlyOnceWith(`${BASE}${path}`, init)
    expect(response.status).toBe(200)
  })

  it.each(BLOCK)('AC-8004.3: %s %s는 보내지 않고 403 {"code":"E-VIEW-READONLY"}다', async (method, path) => {
    const base = fakeBase()
    const response = await readOnlyFetch(base)(`${BASE}${path}`, { method, body: '{}' })
    await expectBlocked(response, base)
  })

  it('AC-8004.3: 방법이 없으면 GET으로 보고 그대로 보낸다', async () => {
    const base = fakeBase()
    await readOnlyFetch(base)(`${BASE}/rest/v1/tasks`)
    expect(base).toHaveBeenCalledOnce()
  })

  it('AC-8004.3: URL 꼴 주소도 같은 규칙이다', async () => {
    const base = fakeBase()
    const response = await readOnlyFetch(base)(new URL(`${BASE}/rest/v1/tasks`), { method: 'POST' })
    await expectBlocked(response, base)
  })

  it('AC-8004.3: Request 꼴이면 그 방법으로 본다(쓰기는 막고 읽기는 보낸다)', async () => {
    const base = fakeBase()
    const blocked = await readOnlyFetch(base)(new Request(`${BASE}/rest/v1/tasks`, { method: 'DELETE' }))
    await expectBlocked(blocked, base)
    const read = new Request(`${BASE}/rest/v1/tasks`)
    await readOnlyFetch(base)(read)
    expect(base).toHaveBeenCalledExactlyOnceWith(read, undefined)
  })

  it('AC-8004.3: Request가 GET이어도 init 방법이 쓰기면 막는다', async () => {
    const base = fakeBase()
    const response = await readOnlyFetch(base)(new Request(`${BASE}/rest/v1/tasks`), { method: 'PATCH' })
    await expectBlocked(response, base)
  })

  it('AC-8004.3: 보낸 답은 진짜 fetch의 답 그대로다', async () => {
    const answer = new Response('{"ok":1}', { status: 201 })
    const base = vi.fn(async () => answer)
    const response = await readOnlyFetch(base)(`${BASE}/rest/v1/rpc/my_admin_view`, { method: 'POST' })
    expect(response).toBe(answer)
  })
})

describe('AC-8004.3 readOnlyFetch — 관리자 화면(/admin과 그 아래)에서는 거르지 않는다', () => {
  // viewPaths.ts의 isAdminScreen과 같은 주소 표(AC-8007.3)
  const ADMIN = ['/admin', '/admin/compare', '/admin/x']
  const NOT_ADMIN = ['/administrator', '/location', '/dashboard', '/', '/claim/admin']

  it.each(ADMIN)('AC-8004.3: 지금 페이지가 %s이면 막을 요청도 모두 그대로 보낸다', async (pathname) => {
    vi.stubGlobal('location', { pathname })
    for (const [method, path] of BLOCK) {
      const base = fakeBase()
      const init = { method, body: '{}' }
      const response = await readOnlyFetch(base)(`${BASE}${path}`, init)
      expect(base).toHaveBeenCalledExactlyOnceWith(`${BASE}${path}`, init)
      expect(response.status).toBe(200)
    }
  })

  it.each(NOT_ADMIN)('AC-8004.3: 지금 페이지가 %s이면 거른다', async (pathname) => {
    vi.stubGlobal('location', { pathname })
    for (const [method, path] of BLOCK) {
      const base = fakeBase()
      const response = await readOnlyFetch(base)(`${BASE}${path}`, { method })
      await expectBlocked(response, base)
    }
  })

  it('AC-8004.3: 페이지 주소는 만들 때가 아니라 요청을 보낼 때 본다', async () => {
    const page = { pathname: '/dashboard' }
    vi.stubGlobal('location', page)
    const base = fakeBase()
    const wrapped = readOnlyFetch(base)
    await expectBlocked(await wrapped(`${BASE}/rest/v1/hospital_regions`, { method: 'POST' }), base)
    page.pathname = '/admin'
    await wrapped(`${BASE}/rest/v1/hospital_regions`, { method: 'POST' })
    expect(base).toHaveBeenCalledOnce()
  })
})
