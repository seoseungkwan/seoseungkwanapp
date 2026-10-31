// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { errorInfo } from '@/lib/errors'
import LoginPage from './page'

// 로그인 요청은 components/auth/LoginCard.test.tsx가 본다. 여기서는 쿼리 → 화면만 본다
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signInWithOAuth: vi.fn() } }) }))

type SearchParams = Record<string, string | string[] | undefined>
const pageWith = async (searchParams: SearchParams) => render(await LoginPage({ searchParams: Promise.resolve(searchParams) }))

const INTRO = '로그인하면 우리 의원의 오늘 숫자, AI 리포트, 급여와 보고를 한 곳에서 이어서 봅니다.'
// a가 문서에서 b보다 앞에 있다
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

afterEach(cleanup)

describe('/login 화면', () => {
  it('AC-003.1: 위쪽 띠(로고)와 본문(main) 틀 안에 로그인 폼, 옆 칸(aside "미리보기") 안에 소개 문장과 미리보기가 있다', async () => {
    await pageWith({})
    const banner = screen.getByRole('banner')
    expect(banner.textContent).toBe('')
    expect(banner.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    // 목업 머리띠에는 메뉴·단추가 없다
    expect(within(banner).queryAllByRole('link')).toHaveLength(0)
    expect(within(banner).queryAllByRole('button')).toHaveLength(0)
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('로그인')
    expect(within(main).getByRole('region', { name: '로그인' })).toBeTruthy()
    expect(main.textContent).not.toContain(INTRO)
    const aside = screen.getByRole('complementary', { name: '미리보기' })
    expect(within(aside).getByText(INTRO)).toBeTruthy()
    expect(within(aside).getByText('예시 숫자')).toBeTruthy()
    expect(isBefore(within(aside).getByText(INTRO), within(aside).getByText('예시 숫자'))).toBe(true)
    expect(aside.contains(main) || main.contains(aside)).toBe(false)
  })

  it('AC-003.1: error 쿼리가 없으면 오류 카드 없이 [구글로 시작하기]', async () => {
    await pageWith({})
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '구글로 시작하기' }).disabled).toBe(false)
  })

  it('AC-003.5: /login?error=1이면 "구글 로그인을 마치지 못했어요" 카드 + E-AUTH-CALLBACK + [다시 구글로 시작하기]', async () => {
    await pageWith({ error: '1' })
    const alert = screen.getByRole('alert')
    const info = errorInfo('E-AUTH-CALLBACK')
    expect(info.what).toBe('구글 로그인을 마치지 못했어요')
    expect(within(alert).getByText(info.what)).toBeTruthy()
    expect(within(alert).getByText(info.fix)).toBeTruthy()
    expect(within(alert).getByText('오류 번호 E-AUTH-CALLBACK')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '로그인' })).getByRole('alert')).toBe(alert)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '다시 구글로 시작하기' }).disabled).toBe(false)
  })

  it('AC-003.5: error 값은 "1"인지만 본다(다른 값·여러 값이면 카드 없음)', async () => {
    for (const error of ['0', 'true', '', ['1', '1']]) {
      await pageWith({ error })
      expect(screen.queryByRole('alert'), JSON.stringify(error)).toBeNull()
      cleanup()
    }
  })

  it('AC-003.5: error 쿼리 값을 화면에 그대로 찍지 않는다', async () => {
    const injected = '<img src=x onerror=alert(1)>피싱 안내: 010-1234-5678로 전화하세요'
    await pageWith({ error: injected })
    expect(document.body.textContent).not.toContain('피싱')
    expect(document.querySelector('img')).toBeNull()
    cleanup()
    await pageWith({ error: ['1', injected] })
    expect(document.body.textContent).not.toContain('피싱')
  })
})

// 승인 대기·거절 화면(목업 Pending·Rejected)은 머리띠 오른쪽 끝에 [로그아웃]을 둔다 → 틀이 그 자리를 마련한다
describe('AuthFrame 머리띠 오른쪽 끝 자리(headerEnd)', () => {
  // 위 줄 = <header> 자신(b2b-redesign AC-213.1: 로고 · 끝 자리가 header 안에 바로 든다)
  const headerInner = () => screen.getByRole('banner')
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

  it('AC-003.6: headerEnd가 없으면 머리띠에 로고만 있다(빈 자리도 그리지 않는다)', () => {
    render(<AuthFrame>본문</AuthFrame>)
    expect([...headerInner().children].map((el) => el.tagName.toLowerCase())).toEqual(['svg'])
    expect(screen.getByRole('banner').querySelector('.ml-auto')).toBeNull()
  })

  it('AC-003.6: headerEnd를 주면 머리띠 맨 끝(로고 뒤, ml-auto 슬롯으로 오른쪽 끝)에 그린다', () => {
    render(<AuthFrame headerEnd={<button type="button">로그아웃</button>}>본문</AuthFrame>)
    const banner = screen.getByRole('banner')
    const button = within(banner).getByRole('button', { name: '로그아웃' })
    const slot = button.parentElement as HTMLElement
    expect(classesOf(slot)).toContain('ml-auto')
    expect(headerInner().lastElementChild).toBe(slot)
    expect(headerInner().children).toHaveLength(2)
    expect(within(screen.getByRole('main')).queryByRole('button')).toBeNull()
  })

  it('AC-003.6: 로그인 화면 머리띠에는 오른쪽 끝 자리가 없다', async () => {
    await pageWith({})
    expect(screen.getByRole('banner').querySelector('.ml-auto')).toBeNull()
    expect(headerInner().children).toHaveLength(1)
  })
})

// 페이지 파일은 그리는 틀(AuthFrame)과 그 props만 바뀐다 (b2b-redesign REQ-213 AC-213.3, REQ-201 AC-201.1).
// 주석 줄을 뺀 파일 글자를 import 줄과 나머지로 나눠, 나머지(문지기·dynamic·쿼리 판단·그리는 JSX)를 공백만 줄여 통째로 비교한다
const ROOT = process.cwd()
const squash = (text: string) => text.replace(/\s+/g, ' ').trim()
function pageParts(rel: string) {
  const lines = readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
  return {
    imports: lines.filter((line) => line.startsWith('import ')),
    rest: squash(lines.filter((line) => !line.startsWith('import ')).join('\n')),
  }
}

describe('AC-213.3: 로그인·가입 신청·승인 대기 페이지 파일은 AuthFrame과 그 props만 바뀐다', () => {
  const LOGIN = {
    file: 'src/app/login/page.tsx',
    imports: [
      "import { AuthFrame } from '@/components/auth/AuthFrame'",
      "import { LoginAside } from '@/components/auth/LoginAside'",
      "import { LoginCard } from '@/components/auth/LoginCard'",
    ],
    rest: `export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
      const { error } = await searchParams
      return (
        <AuthFrame aside={<LoginAside />}>
          <LoginCard failed={error === '1'} />
        </AuthFrame>
      )
    }`,
  }
  const SIGNUP = {
    file: 'src/app/(onboarding)/signup/page.tsx',
    imports: [
      "import { AuthFrame } from '@/components/auth/AuthFrame'",
      "import { SignupForm } from '@/components/auth/SignupForm'",
      "import { guardPage } from '@/lib/auth/guard.server'",
    ],
    rest: `export const dynamic = 'force-dynamic'
    export default async function SignupPage() {
      const me = await guardPage('/signup')
      return (
        <AuthFrame>
          <SignupForm email={me.email} />
        </AuthFrame>
      )
    }`,
  }
  const PENDING = {
    file: 'src/app/(onboarding)/pending/page.tsx',
    imports: [
      "import { AuthFrame } from '@/components/auth/AuthFrame'",
      "import { HeaderSignOut, PendingCard, type PendingHospital } from '@/components/auth/PendingCard'",
      "import { guardPage } from '@/lib/auth/guard.server'",
      "import type { Hospital } from '@/lib/auth/hospital.server'",
    ],
    rest: `export const dynamic = 'force-dynamic'
    const isWaiting = (hospital: Hospital | null): hospital is PendingHospital =>
      hospital !== null && (hospital.status === 'pending' || hospital.status === 'rejected')
    export default async function PendingPage() {
      const me = await guardPage('/pending')
      if (!isWaiting(me.hospital)) throw new Error('승인 대기·거절 상태가 아니에요')
      return (
        <AuthFrame headerEnd={<HeaderSignOut />}>
          <PendingCard hospital={me.hospital} />
        </AuthFrame>
      )
    }`,
  }

  it.each([
    ["로그인 — aside={<LoginAside />}, 쿼리는 error === '1'만 본다, 문지기·dynamic 없음 그대로", LOGIN],
    ["가입 신청 — AuthFrame 그대로, 문지기 guardPage('/signup')·dynamic 그대로", SIGNUP],
    ["승인 대기 — 지금처럼 headerEnd={<HeaderSignOut />}, 문지기 guardPage('/pending')·dynamic 그대로", PENDING],
  ])('AC-213.3: %s', (_name, { file, imports, rest }) => {
    const parts = pageParts(file)
    expect(parts.imports).toEqual(imports)
    expect(parts.rest).toBe(squash(rest))
  })
})
