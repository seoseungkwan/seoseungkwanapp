// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPreview } from '@/components/preview/DashboardPreview'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import { LoginAside } from './LoginAside'
import { LoginCard } from './LoginCard'

// 실제 Supabase에 붙지 않는다. 로그인 요청이 어떤 값으로 나가는지만 본다
const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signInWithOAuth } }) }))

const KAKAO =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36;KAKAOTALK 2410420'
const GOOGLE = { name: '구글로 시작하기' }
const GOOGLE_AGAIN = { name: '다시 구글로 시작하기' }
const IN_APP_TITLE = '크롬·엣지에서 열어 주세요'
const PRIVACY = '환자 개인정보는 병원 PC 밖으로 나가지 않습니다'
const PRIVACY_MORE = '환자 파일은 이 브라우저 안에서만 읽고, 서버에는 집계 숫자만 저장합니다.'
const LEAD = '구글 계정으로 로그인합니다. 처음이면 가입 신청으로 이어집니다.'
const NOTE = '처음 가입하면 관리자가 승인한 뒤부터 쓸 수 있습니다.'
const INTRO = '로그인하면 우리 의원의 오늘 숫자, AI 리포트, 급여와 보고를 한 곳에서 이어서 봅니다.'
const CHIPS = ['환자 통계', 'AI 리포트', '급여·인센티브', '일일마감·보고']
// 시안 parts.mjs의 방패 아이콘(Icon shield) 첫 path
const SHIELD_D = 'M8 1.75 3 3.6v3.9c0 3 2.1 5.5 5 6.75 2.9-1.25 5-3.75 5-6.75V3.6L8 1.75z'

const googleButton = (name = GOOGLE) => screen.getByRole<HTMLButtonElement>('button', name)
const loginSection = () => screen.getByRole('region', { name: '로그인' })
// a가 문서에서 b보다 앞에 있다
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
// 요소가 그 묶음(ds.*)의 클래스를 모두 가진다
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(el ? classesOf(el) : []).toEqual(expect.arrayContaining(wanted))
// 테두리·바탕 클래스(border·border-t·bg-* …, 화면 폭 접두사 포함)
const frameClasses = (el: Element) => classesOf(el).filter((c) => /^(?:[\w-]+:)?(?:border(?:-|$)|bg-)/.test(c))
const ARBITRARY_COLOR = /\[#|rgba?\(|hsla?\(|color-mix\(/
const noArbitraryColor = () => {
  for (const el of document.querySelectorAll('[class]')) expect(el.getAttribute('class') ?? '').not.toMatch(ARBITRARY_COLOR)
}

beforeEach(() => {
  signInWithOAuth.mockReset()
  signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.com/x' }, error: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LoginCard: 목업 로그인(Main.dc.html)', () => {
  it('AC-003.1: 로그인 카드 — 제목 "로그인" · 설명 · [구글로 시작하기] · 개인정보 안내, 카드 밖 아래에 승인 안내', () => {
    render(<LoginCard failed={false} />)
    const section = loginSection()
    const title = within(section).getByRole('heading', { level: 1, name: '로그인' })
    const lead = within(section).getByText('구글 계정으로 로그인합니다. 처음이면 가입 신청으로 이어집니다.')
    const button = within(section).getByRole('button', GOOGLE)
    const privacy = within(section).getByText(PRIVACY)
    const privacyMore = within(section).getByText('환자 파일은 이 브라우저 안에서만 읽고, 서버에는 집계 숫자만 저장합니다.')
    const note = within(section).getByText('처음 가입하면 관리자가 승인한 뒤부터 쓸 수 있습니다.')
    const order = [title, lead, button, privacy, privacyMore, note]
    for (let i = 1; i < order.length; i++) expect(isBefore(order[i - 1], order[i])).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(IN_APP_TITLE)).toBeNull()
  })

  it('AC-003.1: 구글 단추의 이름은 글자뿐(구글 로고는 읽지 않는다)', () => {
    render(<LoginCard failed={false} />)
    const button = googleButton()
    expect(button.getAttribute('type')).toBe('button')
    expect(button.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-214.1: 상자(카드) 없이 이 순서 — h1 "로그인" → 설명 → [구글로 시작하기] → 안내 줄(방패·두 문장) → 승인 안내, 모두 <section aria-labelledby> 하나 안(테두리·바탕 없음)', () => {
    const { container } = render(<LoginCard failed={false} />)
    const section = loginSection()
    expect(section.tagName).toBe('SECTION')
    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(frameClasses(section)).toEqual([])
    const title = within(section).getByRole('heading', { level: 1, name: '로그인' })
    expect(section.getAttribute('aria-labelledby')).toBe(title.id)
    expect(container.querySelectorAll('h1, h2, h3')).toHaveLength(1)
    const lead = within(section).getByText(LEAD)
    expect(lead.tagName).toBe('P')
    const button = within(section).getByRole('button', GOOGLE)
    const shield = section.querySelector(`path[d="${SHIELD_D}"]`)?.closest('svg') as Element
    expect(shield).not.toBeNull()
    const order = [title, lead, button, shield, within(section).getByText(PRIVACY), within(section).getByText(PRIVACY_MORE), within(section).getByText(NOTE)]
    for (let i = 1; i < order.length; i++) expect(isBefore(order[i - 1], order[i]), String(i)).toBe(true)
    // 카드 상자가 없다: 그린 폼 안에 네 변 테두리 상자가 하나도 없다
    expect([container, ...container.querySelectorAll('*')].filter(isBorderBox).map((el) => el.outerHTML.slice(0, 80))).toEqual([])
  })

  it('AC-214.1: "SIGN IN"·기능 칩 4개·두 줄 소개 제목·소개 문장이 없다(소개 문장은 LoginAside), 임의 색 없음', () => {
    render(<LoginCard failed={false} />)
    expect(screen.queryByText('SIGN IN')).toBeNull()
    for (const chip of CHIPS) expect(screen.queryByText(chip), chip).toBeNull()
    expect(document.body.textContent).not.toContain('통증 의원 관리자를 위한')
    expect(document.body.textContent).not.toContain(INTRO)
    expect(document.querySelector('br')).toBeNull()
    noArbitraryColor()
  })

  it('AC-214.1: 글자 — h1은 heading-m → heading(768px 이상) 600 ink, 설명은 ink-2(위 8px), 승인 안내는 caption muted(위 16px)', () => {
    render(<LoginCard failed={false} />)
    expectClasses(screen.getByRole('heading', { level: 1, name: '로그인' }), 'text-heading-m', 'md:text-heading', 'font-semibold', 'text-ink')
    expectClasses(screen.getByText(LEAD), 'text-ink-2', 'mt-2')
    expectClasses(screen.getByText(NOTE), 'text-caption', 'text-muted', 'mt-4')
  })

  it.each([
    ['처음', false, GOOGLE],
    ['다시 시작(failed)', true, GOOGLE_AGAIN],
  ] as const)('AC-214.1: %s — 구글 단추는 ds.button.googleLarge 전체 폭(위 24px)이고 안에 GoogleMark 18(aria-hidden, 흰 사각형 없이) + 글자', (_name, failed, name) => {
    render(<LoginCard failed={failed} />)
    const button = googleButton(name)
    hasAll(button, ds.button.googleLarge)
    expectClasses(button, 'w-full', 'mt-6')
    const [mark, label] = Array.from(button.children)
    // 구글 G는 단추 바로 안(감싸는 흰 사각형 없음)
    expect(mark?.tagName.toLowerCase()).toBe('svg')
    expect(mark?.getAttribute('viewBox')).toBe('0 0 48 48')
    expect(mark?.getAttribute('width')).toBe('18')
    expect(mark?.getAttribute('height')).toBe('18')
    expect(mark?.getAttribute('aria-hidden')).toBe('true')
    expect(label?.textContent).toBe(name.name)
    expect(button.children).toHaveLength(2)
    expect(button.querySelector('.bg-surface')).toBeNull()
  })

  it('AC-214.1: 안내 줄 — 위 24px·위 1px line, 방패 16px(muted) + "환자 개인정보…"(small 600) + "환자 파일은…"(small muted)', () => {
    render(<LoginCard failed={false} />)
    const privacy = screen.getByText(PRIVACY)
    expectClasses(privacy, 'text-small', 'font-semibold')
    expectClasses(screen.getByText(PRIVACY_MORE), 'text-small', 'text-muted')
    const row = privacy.closest('.border-t') as HTMLElement
    expect(row).not.toBeNull()
    expectClasses(row, 'mt-6', 'border-t', 'border-line', 'pt-6')
    const shield = row.querySelector('svg') as Element
    expect(shield.querySelector(`path[d="${SHIELD_D}"]`)).not.toBeNull()
    expect(shield.getAttribute('width')).toBe('16')
    expect(shield.getAttribute('aria-hidden')).toBe('true')
    expectClasses(shield, 'text-muted')
    expect(row.contains(screen.getByText(PRIVACY_MORE))).toBe(true)
  })
})

// 상자 겹침(AC-204.7): 세 상태 모두 상자 안에 상자가 없다
describe('AC-204.7: 로그인 폼 — 상자 안 상자 없음', () => {
  it('AC-204.7: 일반 상태', () => {
    const { container } = render(<LoginCard failed={false} />)
    expect(screen.getByRole('button', GOOGLE)).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-204.7: 앱 안 브라우저 상태(안내 상자 + 읽기 전용 주소 칸)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(KAKAO)
    const { container } = render(<LoginCard failed={false} />)
    expect(screen.getByText(IN_APP_TITLE)).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-204.7: failed 상태(오류 카드 + [다시 구글로 시작하기])', () => {
    const { container } = render(<LoginCard failed />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('AC-214.3: LoginAside — 소개 문장 → 미리보기', () => {
  it('AC-214.3: "로그인하면 …"(small ink-2, 최대 480px) → <DashboardPreview /> 순서이고 사이 16px', () => {
    const { container } = render(<LoginAside />)
    const root = container.firstElementChild as HTMLElement
    expectClasses(root, 'flex', 'flex-col', 'gap-4')
    expect(root.children).toHaveLength(2)
    const [intro, preview] = Array.from(root.children)
    expect(intro?.tagName).toBe('P')
    expect(intro?.textContent).toBe(INTRO)
    expectClasses(intro, 'text-small', 'text-ink-2', 'max-w-120')
    const alone = render(<DashboardPreview />).container.firstElementChild
    expect(alone).not.toBeNull()
    expect(preview?.outerHTML).toBe(alone?.outerHTML)
  })
})

describe('LoginCard: 구글 로그인 시작', () => {
  it('AC-003.1: 누르면 signInWithOAuth({ provider: google, redirectTo: <현재 origin>/auth/callback })', async () => {
    // 기본(localhost)이 아닌 origin → 주소를 박아 두었다면 틀린다
    vi.stubGlobal('location', { origin: 'https://example.test', href: 'https://example.test/login' })
    const user = userEvent.setup()
    render(<LoginCard failed={false} />)
    await user.click(googleButton())
    expect(signInWithOAuth).toHaveBeenCalledTimes(1)
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://example.test/auth/callback' },
    })
  })

  it('AC-003.1: 구글로 넘어가는 동안 단추를 막아 두 번 보내지 않는다', async () => {
    signInWithOAuth.mockReturnValue(new Promise(() => {})) // 구글로 넘어가면 이 페이지는 끝난다
    const user = userEvent.setup()
    render(<LoginCard failed={false} />)
    await user.click(googleButton())
    expect(googleButton().disabled).toBe(true)
    await user.click(googleButton())
    expect(signInWithOAuth).toHaveBeenCalledTimes(1)
  })

  it('AC-003.1: 구글 화면에서 [뒤로]로 돌아오면(뒤로 가기 캐시, pageshow persisted) 단추를 다시 푼다', async () => {
    signInWithOAuth.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<LoginCard failed={false} />)
    await user.click(googleButton())
    expect(googleButton().disabled).toBe(true)
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    expect(googleButton().disabled).toBe(false)
  })

  it('AC-003.1: 화면이 사라지면 pageshow 듣기를 멈춘다', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<LoginCard failed={false} />)
    unmount()
    expect(remove.mock.calls.some(([type]) => type === 'pageshow')).toBe(true)
  })

  it.each([
    [
      '오류를 돌려주면',
      () =>
        signInWithOAuth.mockResolvedValue({
          data: { provider: 'google', url: null },
          error: new Error('provider is not enabled'),
        }),
    ],
    ['던지면', () => signInWithOAuth.mockRejectedValue(new Error('NEXT_PUBLIC_SUPABASE_URL이 비었어요'))],
  ])('AC-003.5: signInWithOAuth가 %s 같은 카드에 E-AUTH-START, 단추는 [다시 구글로 시작하기]로 다시 풀린다', async (_name, fail) => {
    fail()
    const user = userEvent.setup()
    render(<LoginCard failed={false} />)
    await user.click(googleButton())
    const alert = await screen.findByRole('alert')
    const info = errorInfo('E-AUTH-START')
    expect(within(alert).getByText(info.what)).toBeTruthy()
    expect(within(alert).getByText(info.fix)).toBeTruthy()
    expect(within(alert).getByText('오류 번호 E-AUTH-START')).toBeTruthy()
    expect(googleButton(GOOGLE_AGAIN).disabled).toBe(false)
    // 오류 내용은 화면에 없다
    expect(document.body.textContent).not.toMatch(/provider is not enabled|SUPABASE/)
  })

  it('AC-003.5: 오류 카드는 로그인 카드 안, 설명과 구글 단추 사이(목업 로그인 실패)', async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: new Error('x') })
    const user = userEvent.setup()
    render(<LoginCard failed={false} />)
    await user.click(googleButton())
    const alert = await screen.findByRole('alert')
    const section = loginSection()
    expect(section.contains(alert)).toBe(true)
    const lead = within(section).getByText('구글 계정으로 로그인합니다. 처음이면 가입 신청으로 이어집니다.')
    expect(isBefore(lead, alert)).toBe(true)
    expect(isBefore(alert, googleButton(GOOGLE_AGAIN))).toBe(true)
  })

  it('AC-003.5: 다시 누르면 앞서 보인 E-AUTH-START 카드를 지운다(구글로 넘어가는 동안·뒤로 가기로 돌아와도 남지 않게)', async () => {
    signInWithOAuth.mockResolvedValueOnce({ data: { provider: 'google', url: null }, error: new Error('x') })
    signInWithOAuth.mockReturnValueOnce(new Promise(() => {})) // 두 번째는 오류 없이 구글로 넘어간다
    const user = userEvent.setup()
    render(<LoginCard failed={false} />)
    await user.click(googleButton())
    expect(await screen.findByText('오류 번호 E-AUTH-START')).toBeTruthy()
    await user.click(googleButton(GOOGLE_AGAIN))
    expect(signInWithOAuth).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(googleButton().disabled).toBe(false)
  })

  it('AC-003.5: failed면 E-AUTH-CALLBACK 카드와 [다시 구글로 시작하기]', () => {
    render(<LoginCard failed />)
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('오류 번호 E-AUTH-CALLBACK')).toBeTruthy()
    expect(googleButton(GOOGLE_AGAIN).disabled).toBe(false)
    expect(screen.queryByRole('button', GOOGLE)).toBeNull()
  })

  it('AC-003.5: 콜백 실패 뒤 다시 시작도 실패하면 카드는 하나, 번호는 E-AUTH-START', async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: new Error('x') })
    const user = userEvent.setup()
    render(<LoginCard failed />)
    await user.click(googleButton(GOOGLE_AGAIN))
    expect(await screen.findByText('오류 번호 E-AUTH-START')).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByText('오류 번호 E-AUTH-CALLBACK')).toBeNull()
  })
})

describe('LoginCard: 앱 안 브라우저(카카오톡·네이버·인스타그램 등)', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(KAKAO)
  })

  it('AC-003.2: 구글 단추 대신 "크롬·엣지에서 열어 주세요" 안내와 [주소 복사], 나머지 카드는 그대로', () => {
    render(<LoginCard failed={false} />)
    expect(screen.queryByRole('button', GOOGLE)).toBeNull()
    expect(screen.queryByRole('button', GOOGLE_AGAIN)).toBeNull()
    const section = loginSection()
    expect(within(section).getByText(IN_APP_TITLE)).toBeTruthy()
    expect(within(section).getByRole('button', { name: '주소 복사' })).toBeTruthy()
    expect(within(section).getByText(PRIVACY)).toBeTruthy()
    // 안내는 설명 뒤, 개인정보 안내 앞(구글 단추 자리)
    expect(isBefore(within(section).getByText(IN_APP_TITLE), within(section).getByText(PRIVACY))).toBe(true)
  })

  it('AC-003.2: [주소 복사]는 <현재 origin>/login을 복사하고 "복사했어요."를 보인다(로그인은 시작하지 않는다)', async () => {
    const user = userEvent.setup() // 가짜 클립보드를 단다
    render(<LoginCard failed={false} />)
    await user.click(screen.getByRole('button', { name: '주소 복사' }))
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/login`)
    expect(await screen.findByText('복사했어요.')).toBeTruthy()
    expect(signInWithOAuth).not.toHaveBeenCalled()
  })

  it('AC-003.2: 복사가 막히면 주소를 직접 복사하라고 알린다(주소는 늘 보인다)', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    render(<LoginCard failed={false} />)
    expect(screen.getByText(`${window.location.origin}/login`)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '주소 복사' }))
    expect(await screen.findByText('복사하지 못했어요. 위 주소를 길게 눌러 복사해 주세요.')).toBeTruthy()
    expect(screen.queryByText('복사했어요.')).toBeNull()
    expect(document.body.textContent).not.toContain('denied')
  })

  it('AC-214.2: 앱 안 안내 상자는 canvas 바탕·4px이고 테두리가 없다 — 안의 읽기 전용 주소 칸(ds.readonly, 전체 선택)이 테두리를 가진다 + [주소 복사] 보조 단추', () => {
    render(<LoginCard failed={false} />)
    const address = screen.getByText(`${window.location.origin}/login`)
    hasAll(address, ds.readonly)
    expect(classesOf(address)).toContain('select-all')
    expect(classesOf(address)).toContain('border')
    hasAll(screen.getByRole('button', { name: '주소 복사' }), ds.button.secondary)
    const box = address.parentElement as HTMLElement
    expectClasses(box, 'bg-canvas', 'rounded-control')
    expect(frameClasses(box)).toEqual(['bg-canvas'])
    expect(box.contains(screen.getByText(IN_APP_TITLE))).toBe(true)
    expect(box.contains(screen.getByRole('button', { name: '주소 복사' }))).toBe(true)
    noArbitraryColor()
  })

  it('AC-003.2: 설명 문장 속 "크롬·엣지"는 한 덩이로 줄을 바꾼다(줄 첫머리가 "·"로 시작하지 않게)', () => {
    render(<LoginCard failed={false} />)
    const sentence = screen.getByText((_, el) =>
      el?.tagName === 'P' && el.textContent === '구글은 앱 안에서 여는 로그인을 막아요. 주소를 복사해 크롬·엣지 주소창에 붙여 넣어 주세요.',
    )
    const names = within(sentence).getByText('크롬·엣지')
    expect(names.tagName).toBe('SPAN')
    expect(classesOf(names)).toContain('whitespace-nowrap')
  })

  it('AC-003.2: 앱 안 브라우저에서도 /login?error=1 카드는 보인다', () => {
    render(<LoginCard failed />)
    expect(within(screen.getByRole('alert')).getByText('오류 번호 E-AUTH-CALLBACK')).toBeTruthy()
    expect(screen.getByText(IN_APP_TITLE)).toBeTruthy()
  })
})

describe('LoginCard: 서버에서 그릴 때', () => {
  it('AC-003.2: 브라우저를 모르므로 구글 단추도 앱 안 안내도 그리지 않는다(화면에서 다시 그릴 때 어긋나지 않게)', () => {
    const html = renderToStaticMarkup(<LoginCard failed={false} />)
    expect(html).not.toContain('구글로 시작하기')
    expect(html).not.toContain(IN_APP_TITLE)
    expect(html).toContain(PRIVACY)
  })

  it('AC-003.5: failed면 오류 카드는 서버에서도 그린다(브라우저와 상관없음)', () => {
    const html = renderToStaticMarkup(<LoginCard failed />)
    expect(html).toContain('오류 번호 E-AUTH-CALLBACK')
  })
})
