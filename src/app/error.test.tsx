// @vitest-environment jsdom
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { nestedBoxes } from '@/testing/boxes'
import PageError from './error'

// [로그아웃](AC-003.7)은 실제 Supabase에 붙지 않는다. signOut을 부르는지와 그 뒤 어디로 가는지만 본다
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))

// Next는 error.tsx에 { error, reset }을 넘긴다. 이 화면은 그 값을 받지 않는다 → 넘겨도 보이지 않음을 확인한다
type NextErrorProps = { error: Error & { digest?: string }; reset: () => void }
const leak = Object.assign(new Error('relation "public.hospitals" does not exist'), {
  stack: 'Error: relation "public.hospitals" does not exist\n    at readMe (hospital.server.ts:12:7)',
  digest: '4213370001',
})
const reset = vi.fn()
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const page = () => render(createElement(PageError as ComponentType<NextErrorProps>, { error: leak, reset }))

const INFO = errorInfo('E-PAGE-FAILED')
const FALLBACK_MAIL = 'admin@example.com'
// 위 줄(AuthFrame 머리·로고)은 보지 않는다(ui-90 TASK-16이 로고를 바꾼다) → 본문(main)만 본다
const main = () => screen.getByRole('main')
const chip = () => within(main()).getByText('문제가 생겼어요').closest('span') as HTMLElement
const retry = () => within(main()).getByRole('button', { name: '다시 시도' })
const toDashboard = () => within(main()).getByRole('link', { name: '대시보드로' })
const signOutButton = () => within(main()).getByRole('button', { name: '로그아웃' })
const lineOf = (text: string) => within(main()).getByText((_, el) => el?.tagName === 'P' && el.textContent === text)
const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

// jsdom의 location.reload·assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로
const reload = vi.fn()
const assign = vi.fn()
const replace = vi.fn()
const fetchSpy = vi.fn()

beforeEach(() => {
  reload.mockReset()
  assign.mockReset()
  replace.mockReset()
  reset.mockReset()
  fetchSpy.mockReset()
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', reload, assign, replace })
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubEnv('NEXT_PUBLIC_ADMIN_CONTACT_EMAIL', '')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

// ui-90 REQ-411: 한 칸 AuthFrame 안 칩 → h1 → 안내 → 오류 번호 · 관리자 메일 → 단추 셋. 빨간 오류 카드는 없다
// (b2b-redesign AC-217.2의 '오류 카드 + 단추 둘'과 auth AC-002.8·AC-003.7의 짜임 기대를 대체한다)
describe('app/error.tsx: 오류 화면 짜임 (AC-411.1)', () => {
  it('AC-411.1: 본문 글자는 칩 → h1 → 안내 → 오류 번호 → 관리자 메일 → [다시 시도]·[대시보드로]·[로그아웃] 차례 그대로다', () => {
    page()
    expect(main().textContent).toBe(
      `문제가 생겼어요${INFO.what}${INFO.fix}오류 번호 E-PAGE-FAILED관리자 메일: ${FALLBACK_MAIL}다시 시도대시보드로로그아웃`,
    )
    const order = [
      chip(),
      screen.getByRole('heading', { level: 1 }),
      lineOf(INFO.fix),
      lineOf('오류 번호 E-PAGE-FAILED'),
      lineOf(`관리자 메일: ${FALLBACK_MAIL}`),
      retry(),
      toDashboard(),
      signOutButton(),
    ]
    for (let i = 1; i < order.length; i += 1) expect(before(order[i - 1], order[i]), `${i - 1} → ${i}`).toBe(true)
  })

  it('AC-411.1: 칩은 negative 칩(ds.chip.negative)이고 안에 Icon stop 12 + "문제가 생겼어요"이며, 본문 맨 위에서 24px 띄운다', () => {
    page()
    const el = chip()
    expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(ds.chip.negative)))
    expect(el.textContent).toBe('문제가 생겼어요')
    const svgs = el.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0].outerHTML).toBe(renderToStaticMarkup(createElement(Icon, { name: 'stop', size: 12 })))
    // 칩 자리는 본문 첫 칸이고 위 24px(가입 신청·승인 대기·밖 404와 같은 시작 높이)
    const first = main().firstElementChild as HTMLElement
    expect(first.contains(el)).toBe(true)
    expect(classesOf(first)).toContain('mt-6')
  })

  it('AC-411.1: h1은 하나이고 "화면을 열지 못했어요"(= E-PAGE-FAILED.what), heading-m → 768px 이상 heading', () => {
    page()
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0].textContent).toBe('화면을 열지 못했어요')
    expect(h1s[0].textContent).toBe(INFO.what)
    expect(classesOf(h1s[0])).toEqual(expect.arrayContaining(['text-heading-m', 'md:text-heading', 'font-semibold']))
    expect(screen.queryAllByRole('heading').filter((h) => h.tagName !== 'H1')).toEqual([])
  })

  it('AC-411.1: 안내는 E-PAGE-FAILED.fix 글자이고, 오류 번호·관리자 메일 줄은 ink-2 이상(muted·faint 아님)', () => {
    page()
    expect(lineOf(INFO.fix).textContent).toBe('잠시 뒤 [다시 시도]를 눌러 주세요. 계속되면 아래 오류 번호를 관리자에게 메일로 알려 주세요.')
    for (const text of ['오류 번호 E-PAGE-FAILED', `관리자 메일: ${FALLBACK_MAIL}`]) {
      // 줄 자신 또는 줄을 담은 칸이 글자색을 정한다 → 가장 가까운 text-ink·text-ink-2·text-muted·text-faint를 본다
      let el: HTMLElement | null = lineOf(text)
      let color: string | undefined
      while (el && el !== main() && !color) {
        color = classesOf(el).find((t) => /^text-(ink|ink-2|muted|faint)$/.test(t))
        el = el.parentElement
      }
      expect(['text-ink', 'text-ink-2'], text).toContain(color)
    }
  })

  it('AC-411.1: 단추 줄은 [다시 시도] 주 · [대시보드로] 보조 /dashboard 링크 · [로그아웃] 글자만 기본(ds.button.ghost) 셋이다', () => {
    page()
    expect(classesOf(retry())).toEqual(expect.arrayContaining(tokens(ds.button.primary)))
    expect(toDashboard().tagName).toBe('A')
    expect(toDashboard().getAttribute('href')).toBe('/dashboard')
    // 단추 모양 링크라 밑줄이 없다(시안 .btn)
    expect(classesOf(toDashboard())).toEqual(expect.arrayContaining([...tokens(ds.button.secondary), 'no-underline']))
    expect(classesOf(signOutButton())).toEqual(expect.arrayContaining(tokens(ds.button.ghost)))
    // 위 줄(AuthFrame 머리)은 보지 않는다 → 본문 안 단추·링크만 센다
    expect(within(main()).getAllByRole('button').map((b) => b.textContent)).toEqual(['다시 시도', '로그아웃'])
    expect(within(main()).getAllByRole('link').map((a) => a.textContent)).toEqual(['대시보드로'])
  })

  it('AC-411.1·AC-003.7: 세 단추는 한 줄(flex·flex-wrap·gap-2, 위 24px)에 차례로 있고 flex-[1_1_160px]로 휴대폰에서 접힌다 — [로그아웃]만 768px 이상 md:flex-none(PC 한 줄), 임의 색 없음', () => {
    page()
    const row = retry().parentElement as HTMLElement
    expect(Array.from(row.children)).toEqual([retry(), toDashboard(), signOutButton()])
    expect(classesOf(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-2', 'mt-6']))
    expect(main().lastElementChild).toBe(row)
    // flex 크기를 정하는 클래스는 폭마다 하나(shrink-0 같은 것이 겹치면 어느 쪽이 이길지 모른다 — classes.ts 규칙).
    // 시안 .er-a: 주·보조는 늘어나고 글자만 단추는 PC에서 늘지 않는다(flex: none) → 480 칸에 셋이 한 줄
    const flexSizeOf = (el: Element) =>
      classesOf(el).filter((t) => /^(flex-(?!col|row|wrap|nowrap)|grow|shrink|basis-)/.test(t.split(':').pop() ?? ''))
    expect(flexSizeOf(retry())).toEqual(['flex-[1_1_160px]'])
    expect(flexSizeOf(toDashboard())).toEqual(['flex-[1_1_160px]'])
    expect(flexSizeOf(signOutButton())).toEqual(['flex-[1_1_160px]', 'md:flex-none'])
    for (const el of main().querySelectorAll('[class]')) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/\[#|rgba?\(|hsla?\(|color-mix\(/)
    }
  })

  it('AC-411.1·AC-204.7: 빨간 오류 카드(role=alert·negative-soft 상자)가 없고 상자 안 상자도 없다', () => {
    page()
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
    // 한 칸 AuthFrame이다(옆 미리보기 칸 aside 없음)
    expect(screen.queryByRole('complementary')).toBeNull()
    // negative-soft 바탕은 칩 하나뿐이다
    const reds = Array.from(main().querySelectorAll('[class]')).filter((el) => classesOf(el).includes('bg-negative-soft'))
    expect(reds).toEqual([chip()])
    expect(nestedBoxes(main())).toEqual([])
  })
})

describe('app/error.tsx: 오류 내용·이동 (AC-411.2)', () => {
  it('AC-411.2·AC-012.2: Next가 넘긴 오류의 메시지·스택·digest는 화면에 보이지 않는다', () => {
    page()
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('relation')
    expect(text).not.toContain('hospitals')
    expect(text).not.toContain('hospital.server.ts')
    expect(text).not.toContain('4213370001')
    expect(document.body.innerHTML).not.toContain('4213370001')
  })

  it('AC-411.2·AC-002.8: 저절로 다른 주소로 보내지 않고(이동 없음, /login 링크 없음) 오류를 어디로도 보내지 않는다(fetch 없음)', () => {
    page()
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
    expect(location.href).toBe('http://localhost:3000/dashboard')
    // 본문 링크는 [대시보드로] 하나뿐(/login 링크 없음). 위 줄(AuthFrame 머리)은 보지 않는다
    const hrefs = within(main()).queryAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/dashboard'])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('app/error.tsx: 탭 이름 (AC-411.3)', () => {
  it('AC-411.3: 탭 이름은 "오류 · 병원 업무 도구"다(React <title>)', () => {
    page()
    expect(document.title).toBe('오류 · 병원 업무 도구')
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
  })
})

describe('app/error.tsx: 관리자 메일 설정값 (AC-411.4)', () => {
  it('AC-411.4: 설정값(NEXT_PUBLIC_ADMIN_CONTACT_EMAIL)이 있으면 그 메일을 보인다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONTACT_EMAIL', 'help@clinic.example')
    page()
    expect(lineOf('관리자 메일: help@clinic.example')).toBeTruthy()
    expect(main().textContent).not.toContain(FALLBACK_MAIL)
  })

  it('AC-411.4: 설정값이 비었으면 대체 주소 admin@example.com을 보인다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONTACT_EMAIL', '')
    page()
    expect(lineOf(`관리자 메일: ${FALLBACK_MAIL}`)).toBeTruthy()
  })
})

describe('app/error.tsx: [다시 시도]·[로그아웃] 동작', () => {
  it('AC-002.8: [다시 시도]는 페이지를 새로 연다(서버가 처음부터 다시 읽는다)', async () => {
    const user = userEvent.setup()
    page()
    await user.click(retry())
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it('AC-003.7: [로그아웃]을 누르면 signOut() 뒤 /login을 새로 연다(AC-003.6과 같은 동작)', async () => {
    const user = userEvent.setup()
    page()
    expect(signOut).not.toHaveBeenCalled()
    await user.click(signOutButton())
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(reload).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
  })

  it('AC-003.7: signOut()이 실패해도 /login으로 간다', async () => {
    signOut.mockRejectedValue(new Error('network'))
    const user = userEvent.setup()
    page()
    await user.click(signOutButton())
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(document.body.textContent).not.toContain('network')
  })
})
