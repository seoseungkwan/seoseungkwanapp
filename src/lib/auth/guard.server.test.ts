import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guardPage } from './guard.server'
import { HospitalReadError, NotSignedInError, readMe, type Hospital, type Me } from './hospital.server'

// 서버(node)에서 돈다. 읽기(readMe)만 흉내 내고 오류 종류는 진짜 그대로, 경로 결정은 진짜 gate를 쓴다
vi.mock('./hospital.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./hospital.server')>()),
  readMe: vi.fn(),
}))
// redirect()는 Next에서 던져서 그리기를 멈춘다 → 같은 모양으로 흉내 낸다
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((to: string): never => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect,
}))

const read = vi.mocked(readMe)
const FIXED_PATHS = ['/login', '/signup', '/pending', '/dashboard']

function hospital(status: Hospital['status']): Hospital {
  return {
    id: 'hospital-1',
    name: '가나정형외과의원',
    applicantName: '김가나',
    phone: '0212345678',
    email: 'me@example.com',
    status,
    createdAt: '2026-10-28T01:00:00+00:00',
  }
}
function me(status: Hospital['status'] | null, isAdmin = false): Me {
  return { email: 'me@example.com', hospital: status === null ? null : hospital(status), isAdmin }
}

beforeEach(() => {
  read.mockReset()
  redirect.mockClear()
})

describe('guardPage(): 화면을 그리기 전 병원 상태 확인', () => {
  it('AC-002.2: 맨 첫 줄에서 server-only를 불러온다', () => {
    const source = readFileSync(fileURLToPath(new URL('./guard.server.ts', import.meta.url)), 'utf-8')
    expect(source.split('\n')[0]).toBe("import 'server-only'")
  })

  it.each(['/login', '/pending', '/dashboard', '/admin'])('AC-002.2: 병원 줄이 없으면 %s → /signup', async (path) => {
    read.mockResolvedValue(me(null))
    await expect(guardPage(path)).rejects.toThrow('NEXT_REDIRECT /signup')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/signup')
  })

  it('AC-002.2: 병원 줄이 없으면 /signup은 그대로 열고 Me를 돌려준다', async () => {
    const value = me(null)
    read.mockResolvedValue(value)
    await expect(guardPage('/signup')).resolves.toBe(value)
    expect(redirect).not.toHaveBeenCalled()
  })

  it.each([
    ['pending', '/login'],
    ['pending', '/signup'],
    ['pending', '/dashboard'],
    ['pending', '/admin'],
    ['rejected', '/login'],
    ['rejected', '/signup'],
    ['rejected', '/dashboard'],
    ['rejected', '/admin'],
  ] as const)('AC-002.3: %s 상태로 %s → /pending', async (status, path) => {
    read.mockResolvedValue(me(status))
    await expect(guardPage(path)).rejects.toThrow('NEXT_REDIRECT /pending')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/pending')
  })

  it.each(['pending', 'rejected'] as const)('AC-002.3: %s 상태로 /pending은 그대로 열고 Me를 돌려준다', async (status) => {
    const value = me(status)
    read.mockResolvedValue(value)
    await expect(guardPage('/pending')).resolves.toBe(value)
    expect(redirect).not.toHaveBeenCalled()
  })

  // 승인 전에는 관리자여도 상태가 먼저다
  it('AC-002.3: 관리자여도 pending이면 /admin → /pending', async () => {
    read.mockResolvedValue(me('pending', true))
    await expect(guardPage('/admin')).rejects.toThrow('NEXT_REDIRECT /pending')
  })

  it.each(['/login', '/signup', '/pending'])('AC-002.4: approved 상태로 %s → /dashboard', async (path) => {
    read.mockResolvedValue(me('approved'))
    await expect(guardPage(path)).rejects.toThrow('NEXT_REDIRECT /dashboard')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  it('AC-002.4: approved 상태로 /dashboard는 그대로 열고 Me를 돌려준다', async () => {
    const value = me('approved')
    read.mockResolvedValue(value)
    await expect(guardPage('/dashboard')).resolves.toBe(value)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('AC-002.5: 승인된 관리자는 /admin을 그대로 연다', async () => {
    const value = me('approved', true)
    read.mockResolvedValue(value)
    await expect(guardPage('/admin')).resolves.toBe(value)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('AC-002.5: 승인됐지만 admins에 없으면 /admin → /dashboard', async () => {
    read.mockResolvedValue(me('approved', false))
    await expect(guardPage('/admin')).rejects.toThrow('NEXT_REDIRECT /dashboard')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  // 보낼 곳은 gate가 고른 고정 경로뿐 — 받은 경로로 주소를 만들지 않는다(열린 리디렉트 금지)
  it.each([
    [null, '//evil.example/dashboard'],
    [null, 'https://evil.example/'],
    ['pending', '/dashboard?next=https://evil.example'],
    ['rejected', '/\\evil.example'],
  ] as const)('AC-002.2·AC-002.3: 상태 %s, 경로 %s여도 보내는 곳은 고정 경로', async (status, path) => {
    read.mockResolvedValue(me(status))
    await guardPage(path).catch(() => undefined)
    expect(redirect).toHaveBeenCalledTimes(1)
    expect(FIXED_PATHS).toContain(redirect.mock.calls[0][0])
  })

  it.each(['/dashboard', '/signup', '/pending', '/admin'])('AC-002.1: 로그인이 풀렸으면(NotSignedInError) %s → /login', async (path) => {
    read.mockRejectedValue(new NotSignedInError('로그인하지 않았어요'))
    await expect(guardPage(path)).rejects.toThrow('NEXT_REDIRECT /login')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/login')
  })

  // 로그인한 채로 /login에 가면 middleware가 /dashboard로 되돌린다 → 다시 읽기 실패 → 끝없이 돈다(ERR_TOO_MANY_REDIRECTS)
  it.each(['/dashboard', '/signup', '/pending', '/admin'])(
    'AC-002.8: 읽기 실패(HospitalReadError)는 %s에서 어디로도 보내지 않고 그대로 던진다(오류 화면)',
    async (path) => {
      const failed = new HospitalReadError('내 병원을 읽지 못했어요')
      read.mockRejectedValue(failed)
      await expect(guardPage(path)).rejects.toBe(failed)
      expect(redirect).not.toHaveBeenCalled()
    },
  )

  it('AC-002.8: 그 밖의 오류(열쇠 없음 등)도 /login으로 보내지 않고 그대로 던진다', async () => {
    const failed = new Error('NEXT_PUBLIC_SUPABASE_URL이 없어요')
    read.mockRejectedValue(failed)
    await expect(guardPage('/dashboard')).rejects.toBe(failed)
    expect(redirect).not.toHaveBeenCalled()
  })

  // 빌드 때 cookies()가 던지는 Next 신호를 삼키면 화면이 '늘 /login으로 보냄'으로 굳는다 → 그대로 던진다
  it('AC-002.8: Next 내부 신호(동적 렌더링)는 /login으로 바꾸지 않고 그대로 던진다', async () => {
    const dynamic = Object.assign(new Error('Dynamic server usage: cookies'), { digest: 'DYNAMIC_SERVER_USAGE' })
    read.mockRejectedValue(dynamic)
    await expect(guardPage('/dashboard')).rejects.toBe(dynamic)
    expect(redirect).not.toHaveBeenCalled()
  })
})
