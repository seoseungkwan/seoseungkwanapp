// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 실제 Supabase에 붙지 않는다. signOut을 언제 부르고, 그 뒤에 쿠키 지우기·다른 탭 알림·/login 이동을 하는지 본다
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))

const SESSION = 'sb-abcd-auth-token'
const SECRET = 'refresh failed: secret-detail'

// 일어난 순서를 적는다(signOut 끝·알림·이동)
let events: string[] = []

// jsdom의 location.assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로
const assign = vi.fn((path: string) => events.push(`assign ${path}`))
function openedOver(protocol: 'http:' | 'https:') {
  const origin = `${protocol}//localhost:3000`
  vi.stubGlobal('location', { protocol, origin, href: `${origin}/dashboard`, assign, replace: vi.fn() })
}

// 같은 이름끼리 이어지는 가짜 BroadcastChannel(다른 탭 흉내)
let channels: FakeBroadcastChannel[] = []
class FakeBroadcastChannel {
  closed = false
  posted: unknown[] = []
  constructor(public name: string) {
    channels.push(this)
  }
  postMessage(m: unknown) {
    this.posted.push(m)
    events.push(`post ${this.name} ${String(m)}`)
  }
  close() {
    this.closed = true
  }
}

// leaving은 모듈 하나에 하나다 → 시험마다 새로 불러온다
async function load() {
  vi.resetModules()
  return import('./leave')
}

// jsdom 문서에 실제로 남은 쿠키 이름
const cookieJar = () =>
  document.cookie
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => name !== '')

function plantCookies() {
  for (const cookie of [
    `${SESSION}=whole`,
    `${SESSION}.0=a`,
    `${SESSION}.1=b`,
    `${SESSION}-code-verifier=v`,
    'app-active=1',
    'theme=dark',
  ]) {
    document.cookie = `${cookie}; Path=/`
  }
}

// 미뤄 둔 일(Promise)을 모두 돌린다
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

beforeEach(() => {
  events = []
  channels = []
  signOut.mockReset()
  signOut.mockImplementation(async () => {
    events.push('signOut done')
    return { error: null }
  })
  assign.mockClear()
  openedOver('http:')
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  plantCookies()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const name of cookieJar()) document.cookie = `${name}=; Max-Age=0; Path=/`
  document.body.innerHTML = ''
})

describe('signOutAndLeave()', () => {
  it.each([
    ['성공', () => signOut.mockResolvedValue({ error: null })],
    ['오류를 돌려줌', () => signOut.mockResolvedValue({ error: new Error(SECRET) })],
    ['던짐', () => signOut.mockRejectedValue(new Error(SECRET))],
  ])(
    'AC-403.1: signOut()이 %s — 세션 쿠키(조각 포함)와 app-active를 지우고 다른 쿠키는 남긴 뒤 /login을 새로 연다',
    async (_label, arrange) => {
      arrange()
      const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
      const { signOutAndLeave } = await load()
      await signOutAndLeave()
      expect(signOut).toHaveBeenCalledTimes(1)
      expect(signOut).toHaveBeenCalledWith() // 기본(global) 로그아웃 → 갱신 토큰까지 끊는다
      expect(cookieJar().sort()).toEqual([`${SESSION}-code-verifier`, 'theme'])
      expect(assign).toHaveBeenCalledTimes(1)
      expect(assign).toHaveBeenCalledWith('/login')
      // 오류 내용은 화면·로그에 보이지 않는다
      expect(document.body.textContent).not.toContain('secret-detail')
      expect(logs.map((log) => log.mock.calls.length)).toEqual(logs.map(() => 0))
    },
  )

  it('AC-403.1: signOut()이 끝나기 전에는 쿠키를 지우지도 이동하지도 않는다', async () => {
    let finish: (value: { error: null }) => void = () => {}
    signOut.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { signOutAndLeave } = await load()
    const leaving = signOutAndLeave()
    await flush()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(cookieJar()).toContain(`${SESSION}.0`)
    expect(cookieJar()).toContain('app-active')
    expect(assign).not.toHaveBeenCalled()
    expect(channels).toEqual([])

    finish({ error: null })
    await leaving
    expect(cookieJar()).not.toContain(`${SESSION}.0`)
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('AC-403.1: isLeaving()은 부르기 전 거짓, signOut을 기다리는 동안 참, /login으로 보낸 뒤 다시 거짓', async () => {
    let finish: (value: { error: null }) => void = () => {}
    signOut.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { signOutAndLeave, isLeaving } = await load()
    let duringAssign: boolean | undefined
    assign.mockImplementationOnce((path: string) => {
      duringAssign = isLeaving()
      return events.push(`assign ${path}`)
    })
    expect(isLeaving()).toBe(false)
    const leaving = signOutAndLeave()
    expect(isLeaving()).toBe(true)
    await flush()
    expect(isLeaving()).toBe(true) // 아직 signOut을 기다린다
    expect(assign).not.toHaveBeenCalled()

    finish({ error: null })
    await leaving
    expect(assign).toHaveBeenCalledWith('/login')
    expect(duringAssign).toBe(true) // /login으로 보낸 뒤에야 푼다
    expect(isLeaving()).toBe(false)
  })

  it('AC-403.1: signOut을 기다리는 동안 다시 부르면 아무것도 하지 않는다(두 번 눌러도 signOut 한 번)', async () => {
    let finish: (value: { error: null }) => void = () => {}
    signOut.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { signOutAndLeave } = await load()
    const first = signOutAndLeave()
    const second = signOutAndLeave()
    await second
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(assign).not.toHaveBeenCalled()
    finish({ error: null })
    await first
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledTimes(1)
    expect(channels).toHaveLength(1)
  })

  it('AC-403.1: 끝난 뒤 다시 부르면 처음처럼 한 번 더 로그아웃한다(뒤로 가기로 되살아난 화면)', async () => {
    const { signOutAndLeave } = await load()
    await signOutAndLeave()
    plantCookies() // 되살아난 화면에 다시 생긴 쿠키
    await signOutAndLeave()
    expect(signOut).toHaveBeenCalledTimes(2)
    expect(cookieJar().sort()).toEqual([`${SESSION}-code-verifier`, 'theme'])
    expect(assign).toHaveBeenCalledTimes(2)
    expect(channels).toHaveLength(2)
    expect(events).toEqual([
      'signOut done',
      'post auth-signout signout',
      'assign /login',
      'signOut done',
      'post auth-signout signout',
      'assign /login',
    ])
  })

  it('AC-403.2: /login으로 가기 전에 auth-signout 채널로 signout을 보내고 채널을 닫는다', async () => {
    const { signOutAndLeave, SIGNOUT_CHANNEL, SIGNOUT_MESSAGE } = await load()
    expect([SIGNOUT_CHANNEL, SIGNOUT_MESSAGE]).toEqual(['auth-signout', 'signout'])
    await signOutAndLeave()
    expect(channels).toHaveLength(1)
    expect(channels[0].name).toBe('auth-signout')
    expect(channels[0].posted).toEqual(['signout'])
    expect(channels[0].closed).toBe(true)
    expect(events).toEqual(['signOut done', 'post auth-signout signout', 'assign /login'])
  })

  it('AC-403.2: BroadcastChannel이 없는 브라우저에서도 로그아웃된다', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const { signOutAndLeave } = await load()
    await signOutAndLeave()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(cookieJar().sort()).toEqual([`${SESSION}-code-verifier`, 'theme'])
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('AC-403.2: 채널을 만들다 던져도 로그아웃된다', async () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('blocked')
        }
      },
    )
    const { signOutAndLeave } = await load()
    await signOutAndLeave()
    expect(cookieJar().sort()).toEqual([`${SESSION}-code-verifier`, 'theme'])
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('AC-403.5: signOut()이 끝나지 않으면 5초 뒤 기다리지 않고 지우기·알림·이동을 한다', async () => {
    vi.useFakeTimers()
    signOut.mockReturnValue(new Promise(() => {})) // 끝나지 않는다(인터넷이 반쯤 끊김)
    const { signOutAndLeave, SIGNOUT_WAIT_MS } = await load()
    expect(SIGNOUT_WAIT_MS).toBe(5_000)
    const leaving = signOutAndLeave()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(cookieJar()).toContain(`${SESSION}.0`)
    expect(channels).toEqual([])
    expect(assign).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await leaving
    expect(cookieJar().sort()).toEqual([`${SESSION}-code-verifier`, 'theme'])
    expect(channels[0].posted).toEqual(['signout'])
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('AC-403.5: signOut()이 먼저 끝나면 남은 5초 타이머가 없다', async () => {
    vi.useFakeTimers()
    const { signOutAndLeave } = await load()
    await signOutAndLeave()
    expect(assign).toHaveBeenCalledWith('/login')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['https:', true],
    ['http:', false],
  ] as const)('AC-405.2: %s로 연 페이지면 지우기 글자에 Secure가 붙는다: %s', async (protocol, secure) => {
    openedOver(protocol)
    const writes: string[] = []
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(function (this: Document, value: string) {
      writes.push(value)
      original.set!.call(this, value)
    })
    const { signOutAndLeave } = await load()
    await signOutAndLeave()
    expect(writes.map((w) => w.split('=')[0]).sort()).toEqual(['app-active', SESSION, `${SESSION}.0`, `${SESSION}.1`])
    for (const write of writes) {
      expect(write).toContain('=; Max-Age=0; Path=/; SameSite=Lax')
      expect(write.endsWith('; Secure')).toBe(secure)
    }
  })
})
