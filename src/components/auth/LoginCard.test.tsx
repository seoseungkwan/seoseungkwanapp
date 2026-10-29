// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ui } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
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

const googleButton = (name = GOOGLE) => screen.getByRole<HTMLButtonElement>('button', name)
const loginSection = () => screen.getByRole('region', { name: '로그인' })
// a가 문서에서 b보다 앞에 있다
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
// 요소가 그 묶음(ui.*)의 클래스를 모두 가진다
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
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
  it('AC-003.1: 왼쪽 소개 — SIGN IN · 제목 · 설명 · 칩 4개(환자 통계·AI 리포트·급여·인센티브·일일마감·보고)', () => {
    render(<LoginCard failed={false} />)
    expect(screen.getByText('SIGN IN')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('통증 의원 관리자를 위한AI 업무 도구')
    expect(screen.getByText('로그인하면 우리 의원의 오늘 숫자, AI 리포트, 급여와 보고를 한 곳에서 이어서 봅니다.')).toBeTruthy()
    const chips = ['환자 통계', 'AI 리포트', '급여·인센티브', '일일마감·보고'].map((t) => screen.getByText(t))
    for (let i = 1; i < chips.length; i++) expect(isBefore(chips[i - 1], chips[i])).toBe(true)
    // 소개가 로그인 카드보다 앞(왼쪽)
    expect(isBefore(screen.getByText('SIGN IN'), loginSection())).toBe(true)
  })

  it('AC-003.1: 로그인 카드 — 제목 "로그인" · 설명 · [구글로 시작하기] · 개인정보 안내, 카드 밖 아래에 승인 안내', () => {
    render(<LoginCard failed={false} />)
    const section = loginSection()
    const title = within(section).getByRole('heading', { level: 2, name: '로그인' })
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

  it('AC-003.1·AC-013.2·AC-013.3: 모양 — [구글로 시작하기]는 주 단추 전체 폭, 기능 칩 4개는 범주(중립) 칩, 카드는 ui.card, 임의 색 없음', () => {
    render(<LoginCard failed={false} />)
    const button = googleButton()
    hasAll(button, ui.button.primary)
    expect(classesOf(button)).toContain('w-full')
    for (const label of ['환자 통계', 'AI 리포트', '급여·인센티브', '일일마감·보고']) {
      const chip = screen.getByText(label)
      hasAll(chip, ui.chip.neutral)
      // 색 칩(완료·진행중·거절 바탕, 강조색)이 아니다
      expect(classesOf(chip).filter((c) => c.endsWith('-soft') || c.includes('accent')), label).toEqual([])
    }
    const card = loginSection().firstElementChild as HTMLElement
    hasAll(card, ui.card)
    expect(card.contains(button)).toBe(true)
    expect(card.contains(screen.getByText(PRIVACY))).toBe(true)
    noArbitraryColor()
  })

  it('AC-003.1·AC-013.3: 글자 — SIGN IN은 caption 600 muted, 제목 title 600, 설명 body ink-2, 개인정보 안내는 위 1px 선 + muted 방패 + table ink-2', () => {
    render(<LoginCard failed={false} />)
    expect(classesOf(screen.getByText('SIGN IN'))).toEqual(expect.arrayContaining(['text-caption', 'font-semibold', 'text-muted']))
    expect(classesOf(screen.getByRole('heading', { level: 1 }))).toEqual(expect.arrayContaining(['text-title', 'font-semibold']))
    expect(classesOf(screen.getByRole('heading', { level: 2, name: '로그인' }))).toEqual(
      expect.arrayContaining(['text-title-sm', 'font-semibold']),
    )
    expect(
      classesOf(screen.getByText('로그인하면 우리 의원의 오늘 숫자, AI 리포트, 급여와 보고를 한 곳에서 이어서 봅니다.')),
    ).toEqual(expect.arrayContaining(['text-body', 'text-ink-2']))
    const privacy = screen.getByText(PRIVACY)
    expect(classesOf(privacy)).toEqual(expect.arrayContaining(['text-table', 'text-ink-2']))
    const box = privacy.closest('.border-t') as HTMLElement
    expect(box).not.toBeNull()
    expect(classesOf(box)).toContain('border-line')
    expect(classesOf(box.querySelector('svg') as Element)).toContain('text-muted')
    expect(classesOf(screen.getByText('처음 가입하면 관리자가 승인한 뒤부터 쓸 수 있습니다.'))).toEqual(
      expect.arrayContaining(['text-caption', 'text-muted']),
    )
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

  it('AC-003.2·AC-013.3: 앱 안 안내는 canvas 상자(1px 선·6px) + 읽기 전용 주소 칸(전체 선택) + [주소 복사] 보조 단추', () => {
    render(<LoginCard failed={false} />)
    const address = screen.getByText(`${window.location.origin}/login`)
    hasAll(address, ui.readonly)
    expect(classesOf(address)).toContain('select-all')
    hasAll(screen.getByRole('button', { name: '주소 복사' }), ui.button.secondary)
    const box = address.parentElement as HTMLElement
    expect(classesOf(box)).toEqual(expect.arrayContaining(['bg-canvas', 'border', 'border-line', 'rounded-card']))
    expect(box.contains(screen.getByText(IN_APP_TITLE))).toBe(true)
    noArbitraryColor()
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
