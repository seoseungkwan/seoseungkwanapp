import { afterEach, describe, expect, it, vi } from 'vitest'
import { ERRORS } from '@/lib/errors'
import { CAL_ID, load, TEST_KEY } from '../../../google-code/test/fakeCalendar'
import { GCAL_TIMEOUT_MS, GcalCallError, gcalCall, isScriptUrl, pingGcal, readEvents, readReply } from './client'

// 예약 구글 코드 부르기(spec google-link REQ-8524, design.md 10-5·14절). 진짜 구글에는 붙지 않는다:
// fetch는 가짜로 바꾸고, 구글 코드 답은 google-code/calendar/Code.gs를 가짜 캘린더(node:vm)에서 돌려 받는다. 비밀 글자는 지어낸 값이다

const URL_PLAIN = 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec'
const URL_WORK = 'https://script.google.com/a/macros/clinic.fake.test/s/AKfycbFake0123456789abc/exec'
const LINK = { scriptUrl: URL_PLAIN, secret: TEST_KEY }
const OK_PING = JSON.stringify({ ok: true, version: '1', now: '2026-11-26T01:00:00.000Z', calendars: [] })

type FetchInit = { method: string; headers: Record<string, string>; body: string; credentials: string; redirect: string; signal: AbortSignal }

function stubFetch(answer: (url: string, init: FetchInit) => Promise<Response> | Response) {
  const fake = vi.fn(async (url: string, init: FetchInit) => answer(url, init))
  vi.stubGlobal('fetch', fake)
  return fake
}

const textReply = (text: string, status = 200) => () => new Response(text, { status })

async function failure(promise: Promise<unknown>): Promise<GcalCallError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof GcalCallError) return err
    throw err
  }
  throw new Error('실패해야 하는데 됐다')
}

/** 가짜 캘린더에서 도는 진짜 Code.gs로 답하는 fetch */
function stubGoogle(opts: Parameters<typeof load>[0] = {}) {
  const app = load(opts)
  const fake = stubFetch((_url, init) => new Response(JSON.stringify(app.postRaw(init.body)), { status: 200 }))
  return { app, fake }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AC-8524.1 부르기 모양: 주소 꼴일 때만 POST · text/plain · credentials omit · 30초', () => {
  it('AC-8524.1: 웹 앱 주소로 POST 한 번, 머리는 text/plain, 쿠키 없이(credentials omit), 넘김은 따라감, 비밀 글자는 본문에만', async () => {
    const fake = stubFetch(textReply(OK_PING))
    await gcalCall(LINK, 'ping')
    expect(fake).toHaveBeenCalledTimes(1)
    const [url, init] = fake.mock.calls[0]
    expect(url).toBe(URL_PLAIN)
    expect(url).not.toContain('?')
    expect(url).not.toContain(TEST_KEY)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' })
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('follow')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual({ key: TEST_KEY, action: 'ping' })
  })

  it('AC-8524.1: 받은 칸은 본문에 함께 가고, 칸이 key·action을 덮지 못한다', async () => {
    const fake = stubFetch(textReply(JSON.stringify({ ok: true, version: '1', now: 'x', events: [], next: null })))
    await gcalCall(LINK, 'list', { calendarId: CAL_ID, from: '2026-11-26', to: '2026-11-27', key: 'other', action: 'remove' })
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({ key: TEST_KEY, action: 'list', calendarId: CAL_ID, from: '2026-11-26', to: '2026-11-27' })
  })

  it('AC-8524.1: 회사(Workspace) 계정 주소 꼴도 부른다', async () => {
    const fake = stubFetch(textReply(OK_PING))
    await gcalCall({ scriptUrl: URL_WORK, secret: TEST_KEY }, 'ping')
    expect(fake.mock.calls[0][0]).toBe(URL_WORK)
    expect(isScriptUrl(URL_WORK)).toBe(true)
    expect(isScriptUrl(URL_PLAIN)).toBe(true)
  })

  it.each([
    ['http 주소', 'http://script.google.com/macros/s/AKfycbFake0123456789abc/exec'],
    ['/dev 시험 주소', 'https://script.google.com/macros/s/AKfycbFake0123456789abc/dev'],
    ['쿼리가 붙은 주소', 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec?key=x'],
    ['다른 곳', 'https://script.google.com.evil.test/macros/s/AKfycbFake0123456789abc/exec'],
    ['googleusercontent 주소', 'https://script.googleusercontent.com/macros/echo?user_content_key=x'],
    ['빈 글', ''],
  ])('AC-8524.1·AC-8524.2: %s는 부르지 않고 E-GCAL-URL', async (_label, scriptUrl) => {
    const fake = stubFetch(textReply(OK_PING))
    const err = await failure(gcalCall({ scriptUrl, secret: TEST_KEY }, 'ping'))
    expect(err.code).toBe('E-GCAL-URL')
    expect(fake).not.toHaveBeenCalled()
    expect(isScriptUrl(scriptUrl)).toBe(false)
  })

  it('AC-8524.1: 30초 안에 답이 없으면 끊고 E-GCAL-REACH(29.999초에는 아직 기다림)', async () => {
    vi.useFakeTimers()
    expect(GCAL_TIMEOUT_MS).toBe(30_000)
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    let settled = false
    const call = gcalCall(LINK, 'ping')
    const caught = failure(call).finally(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(GCAL_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await caught).code).toBe('E-GCAL-REACH')
  })

  it('AC-8524.1: 답 판이 1보다 낮거나 없으면 E-GCAL-OLD, 1 이상이면 된다', async () => {
    for (const [reply, code] of [
      [{ ok: true, version: '0' }, 'E-GCAL-OLD'],
      [{ ok: true }, 'E-GCAL-OLD'],
      [{ ok: false, error: 'bad_token' }, 'E-GCAL-OLD'], // 판 없는 옛 코드의 오류 답도 판부터 본다
    ] as const) {
      stubFetch(textReply(JSON.stringify(reply)))
      expect((await failure(gcalCall(LINK, 'ping'))).code).toBe(code)
    }
    for (const version of ['1', '2']) {
      stubFetch(textReply(JSON.stringify({ ok: true, version, now: 'n', calendars: [] })))
      await expect(gcalCall(LINK, 'ping')).resolves.toMatchObject({ ok: true, version })
    }
  })
})

describe('AC-8524.2 오류 번호 아홉', () => {
  it.each([
    ['token_not_set', 'E-GCAL-NOKEY'],
    ['bad_token', 'E-GCAL-KEY'],
    ['gone', 'E-GCAL-GONE'],
    ['limit', 'E-GCAL-LIMIT'],
    ['no_service', 'E-GCAL-SERVICE'],
    ['busy', 'E-GCAL-REACH'],
    ['failed', 'E-GCAL-REACH'],
    ['bad_request', 'E-GCAL-REACH'],
    ['what_is_this', 'E-GCAL-REACH'],
  ])('AC-8524.2: 구글 코드 답 %s → %s (code 칸을 읽고, 이름은 reason에 남김)', async (name, code) => {
    stubFetch(textReply(JSON.stringify({ ok: false, version: '1', error: name, code: name, message: '…' })))
    const err = await failure(gcalCall(LINK, 'ping'))
    expect(err.code).toBe(code)
    expect(err.reason).toBe(name)
  })

  it('AC-8524.2: code가 없으면 error 칸을 읽고, 둘 다 있으면 code가 이긴다', async () => {
    stubFetch(textReply(JSON.stringify({ ok: false, version: '1', error: 'gone' })))
    expect((await failure(gcalCall(LINK, 'ping'))).code).toBe('E-GCAL-GONE')
    stubFetch(textReply(JSON.stringify({ ok: false, version: '1', error: 'failed', code: 'limit' })))
    expect((await failure(gcalCall(LINK, 'ping'))).code).toBe('E-GCAL-LIMIT')
  })

  it('AC-8524.2: too_old는 번호가 아니라 reason으로만 알린다(받기가 처음부터 다시 받는다)', async () => {
    stubFetch(textReply(JSON.stringify({ ok: false, version: '1', error: 'too_old', code: 'too_old', message: '…' })))
    const err = await failure(gcalCall(LINK, 'changes', { calendarId: CAL_ID, since: '2026-01-01T00:00:00Z', from: '2026-11-26' }))
    expect(err.reason).toBe('too_old')
  })

  it('AC-8524.2: 로그인·안내 화면(HTML)이 오면 E-GCAL-LOGIN', async () => {
    stubFetch(textReply('  <!DOCTYPE html><html><body>Google 계정으로 로그인</body></html>'))
    expect((await failure(gcalCall(LINK, 'ping'))).code).toBe('E-GCAL-LOGIN')
    stubFetch(textReply('<html>Sorry, unable to open the file at this time.</html>', 404))
    expect((await failure(gcalCall(LINK, 'ping'))).code).toBe('E-GCAL-LOGIN')
  })

  it('AC-8524.2: 닿지 못함(네트워크 오류)·JSON 아닌 답·빈 답은 E-GCAL-REACH, 오류 글에 비밀 글자·답 글이 없다', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const net = await failure(gcalCall(LINK, 'ping'))
    expect(net.code).toBe('E-GCAL-REACH')
    expect(net.message).not.toContain(TEST_KEY)
    for (const text of ['oops 홍길동', '', '[1,2]', 'null']) {
      stubFetch(textReply(text, 500))
      const err = await failure(gcalCall(LINK, 'ping'))
      expect(err.code).toBe('E-GCAL-REACH')
      expect(err.message).not.toContain('홍길동')
    }
  })

  it('AC-8524.2: 번호마다 글은 lib/errors.ts의 design.md 14절 표 그대로다', () => {
    const table: [string, string, string][] = [
      ['E-GCAL-REACH', '구글 캘린더에 닿지 못했어요.', '인터넷이 되는지 확인해 주세요. 계속되면 설정 › 구글 캘린더에서 [연결 시험]을 눌러 보세요.'],
      ['E-GCAL-KEY', '비밀 글자가 맞지 않아요.', '설정에서 코드를 다시 복사해 붙여 주세요.'],
      ['E-GCAL-GONE', '고른 캘린더를 찾을 수 없거나 고칠 권한이 없어요.', '설정 › 구글 캘린더에서 캘린더를 다시 골라 주세요.'],
      ['E-GCAL-LIMIT', '구글이 오늘 부를 수 있는 횟수를 넘었어요.', '내일 저절로 다시 맞춰요(받아 오는 간격을 5분으로 늘려 주세요).'],
      ['E-GCAL-LOGIN', '구글이 코드 대신 로그인 화면을 보냈어요.', '배포할 때 액세스 권한을 [모든 사용자]로 했는지, 주소가 /exec로 끝나는지 확인해 주세요.'],
      ['E-GCAL-OLD', '구글 코드가 옛 판이에요.', '설정 › 구글 캘린더 › 잇기에서 [구글 코드 복사]로 새로 붙이고 새 버전으로 배포해 주세요.'],
      ['E-GCAL-SERVICE', '구글 코드에서 캘린더 서비스가 켜져 있지 않아요.', "구글 코드 편집기 왼쪽 [서비스] 옆 [+]에서 'Google Calendar API'를 추가하고 새 버전으로 배포해 주세요."],
      ['E-GCAL-URL', '코드 주소 모양이 맞지 않아요.', "구글이 준 '웹 앱 주소'(https://script.google.com/macros/s/…/exec)를 붙여 넣어 주세요."],
      ['E-GCAL-NOKEY', '구글 코드에 비밀 글자가 들어가지 않았어요.', '[구글 코드 복사]로 다시 복사해 붙여 주세요.'],
    ]
    for (const [code, what, fix] of table) expect(ERRORS[code as keyof typeof ERRORS]).toEqual({ what, fix })
  })
})

describe('AC-8524.1·AC-8524.2 진짜 Code.gs(가짜 캘린더)와 주고받기', () => {
  it('AC-8524.1: [연결 시험] ping — 캘린더 목록(id·이름·권한·색·지난 1년·앞으로 수)', async () => {
    const { app, fake } = stubGoogle()
    app.store.timed('evping001', '2026-11-27T10:00', '2026-11-27T10:30', { summary: '1234 홍길동 도수 30분 (호)' })
    const got = await pingGcal(LINK)
    expect(fake).toHaveBeenCalledTimes(1)
    expect(got.now).toBe('2026-11-26T01:00:00.000Z')
    expect(got.calendars).toEqual([{ id: CAL_ID, name: '시험의원 예약', access: 'owner', hex: '#4285F4', past: 0, future: 1 }])
  })

  it('AC-8524.2: 비밀 글자 틀림 → E-GCAL-KEY · 자리 글자 그대로 → E-GCAL-NOKEY · 서비스 꺼짐 → E-GCAL-SERVICE · 캘린더 없음 → E-GCAL-GONE', async () => {
    stubGoogle()
    expect((await failure(gcalCall({ scriptUrl: URL_PLAIN, secret: 'Wrong_0123456789-abcdefABCDEF-xyz' }, 'ping'))).code).toBe('E-GCAL-KEY')
    stubGoogle({ replaceKey: false })
    expect((await failure(gcalCall(LINK, 'ping'))).code).toBe('E-GCAL-NOKEY')
    stubGoogle({ noService: true })
    expect((await failure(gcalCall(LINK, 'ping'))).code).toBe('E-GCAL-SERVICE')
    stubGoogle()
    const gone = await failure(gcalCall(LINK, 'list', { calendarId: 'nope@group.calendar.fake.test', from: '2026-11-26', to: '2026-11-27' }))
    expect(gone.code).toBe('E-GCAL-GONE')
  })

  it('AC-8524.1: 일정 답 읽기 — 모양이 틀리거나 DB에 둘 수 없는 id(빼기·@)의 일정은 뺀다', () => {
    const reply = readReply(
      JSON.stringify({
        ok: true,
        version: '1',
        events: [
          { id: 'evgood001', status: 'confirmed', summary: '1234 홍길동', description: '', allDay: false, start: '2026-11-27T10:00', end: '2026-11-27T10:30', colorId: '3', updated: '2026-11-26T01:00:00.000Z', recurring: false },
          { id: 'evgone001', status: 'cancelled', summary: '', description: '', allDay: false, start: null, end: null, colorId: null, updated: '2026-11-26T01:00:01.000Z', recurring: false },
          { id: 'bad-id@x', status: 'confirmed', summary: 'x', description: '', allDay: false, start: '2026-11-27T10:00', end: '2026-11-27T10:30', colorId: null, updated: '2026-11-26T01:00:00.000Z', recurring: false },
          { id: 'evnoupd1', status: 'confirmed', summary: 'x', allDay: false, start: '2026-11-27T10:00', end: '2026-11-27T10:30' },
          'junk',
        ],
      }),
    )
    expect(readEvents(reply)).toEqual([
      { id: 'evgood001', status: 'confirmed', summary: '1234 홍길동', description: '', allDay: false, start: '2026-11-27T10:00', end: '2026-11-27T10:30', colorId: '3', updated: '2026-11-26T01:00:00.000Z', recurring: false },
      { id: 'evgone001', status: 'cancelled', summary: '', description: '', allDay: false, start: '', end: '', colorId: null, updated: '2026-11-26T01:00:01.000Z', recurring: false },
    ])
  })
})
