import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupScreen } from '@/components/claim/setup/SetupScreen'
import { guardPage } from '@/lib/auth/guard.server'
import { readMe, type Hospital, type Me } from '@/lib/auth/hospital.server'
import ClaimSetupPage, { dynamic } from './page'

// /claim/setup 비트 PC 연결 페이지 (REQ-006, design.md 7절·9-1, ui-90 REQ-412). 서버는 (app)/layout과 같은 길(guardPage)로 내 병원 줄만 읽고,
// 화면에는 사이트에 등록한 병원 이름을 넘긴다(도우미는 병원 이름을 주지 않는다, AC-006.4). 통로는 브라우저(SetupScreen)가 연다
vi.mock('@/lib/auth/hospital.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/hospital.server')>()),
  readMe: vi.fn(),
}))
vi.mock('@/lib/auth/guard.server', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/guard.server')>()
  return { ...real, guardPage: vi.fn(real.guardPage) }
})
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((to: string): never => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))
vi.mock('next/navigation', () => ({ redirect }))

const read = vi.mocked(readMe)
const guard = vi.mocked(guardPage)
const SOURCE = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')

const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: null,
  email: 'manager@example.com',
  status: 'approved',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const me = (status: Hospital['status'] | null): Me => ({
  email: 'manager@example.com',
  hospital: status === null ? null : { ...HOSPITAL, status },
  isAdmin: false,
})

beforeEach(() => {
  read.mockReset()
  read.mockResolvedValue(me('approved'))
  guard.mockClear()
  redirect.mockClear()
})

/** 주소의 ?next= 값 그대로 페이지를 부른다. 같은 이름이 여러 번이면 Next가 배열로 준다 */
const open = (next?: string | string[]) =>
  ClaimSetupPage({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }) as Promise<
    ReactElement<{ clinicName: string; returnTo?: string }>
  >

describe('/claim/setup 페이지', () => {
  it('AC-006.4: 승인된 사용자면 비트 PC 연결 화면에 사이트의 병원 이름(me.hospital.name)을 넘긴다', async () => {
    const page = await open()
    expect(page.type).toBe(SetupScreen)
    expect(page.props.clinicName).toBe('가나 정형외과의원')
    expect(redirect).not.toHaveBeenCalled()
  })

  it("AC-006.4: 그리기 전에 문지기를 '/claim/setup' 경로로 한 번 부른다((app)/layout과 같은 길)", async () => {
    await open()
    expect(guard).toHaveBeenCalledExactlyOnceWith('/claim/setup')
  })

  it('AC-603.2: next=dashboard로 열면 돌아갈 곳 /dashboard를 넘긴다', async () => {
    const page = await open('dashboard')
    expect(page.type).toBe(SetupScreen)
    expect(page.props.returnTo).toBe('/dashboard')
    expect(page.props.clinicName).toBe('가나 정형외과의원')
  })

  it.each<[string, string | string[] | undefined]>([
    ['next 없음', undefined],
    ['빈 값', ''],
    ['바깥 주소', 'https://evil.example'],
    ['// 로 시작하는 바깥 주소', '//evil.example'],
    ['같은 사이트의 다른 경로', '/admin'],
    ['앞에 / 붙은 값', '/dashboard'],
    ['대소문자 다른 값', 'Dashboard'],
    ['뒤에 글자 붙은 값', 'dashboard/../admin'],
    ['여러 번 쓴 값', ['dashboard', 'https://evil.example']],
    ['배열 하나', ['dashboard']],
  ])('AC-603.3: %s이면 돌아갈 곳을 넘기지 않는다(받는 값은 dashboard 하나, 열린 리디렉트 금지)', async (_name, next) => {
    const page = await open(next)
    expect(page.type).toBe(SetupScreen)
    expect(page.props.returnTo).toBeUndefined()
  })

  it.each([
    ['pending', '/pending'],
    ['rejected', '/pending'],
    [null, '/signup'],
  ] as const)('AC-006.4: 병원 상태가 %s이면 %s로 보내고 그리지 않는다', async (status, to) => {
    read.mockResolvedValue(me(status))
    await expect(open()).rejects.toThrow(`NEXT_REDIRECT ${to}`)
  })

  // desk-feedback AC-6305.4: 데스크는 앱 틀(DeskGate)이 막힌 화면을 그린다. 페이지가 던지면 앱 틀 대신 오류 화면이 뜬다 → 아무것도 그리지 않는다
  it('AC-6305.4: 데스크(병원 줄 없음 + desk)면 문지기가 보내지 않고, 페이지는 던지지 않고 아무것도 그리지 않는다', async () => {
    read.mockResolvedValue({ email: 'desk@example.com', hospital: null, isAdmin: false, desk: { hospitalId: 'h1', hospitalName: '가나 정형외과의원' } })
    await expect(open('dashboard')).resolves.toBeNull()
    expect(guard).toHaveBeenCalledExactlyOnceWith('/claim/setup')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('AC-6305.4: 원장은 지금과 같다 — 비트 PC 연결 화면에 병원 이름을 넘긴다', async () => {
    const page = await open()
    expect(page.type).toBe(SetupScreen)
    expect(page.props.clinicName).toBe('가나 정형외과의원')
  })

  it('AC-006.4: 요청의 로그인 세션으로만 그린다(빌드 때 미리 그리지 않는다)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-006.6: 서버 경로·Server Action을 만들지 않고, 통로·병원 값을 서버에서 읽지 않는다', () => {
    expect(SOURCE).not.toMatch(/['"]use server['"]/)
    expect(SOURCE).not.toMatch(/lib\/bridge|institution|supabase/)
  })
})
