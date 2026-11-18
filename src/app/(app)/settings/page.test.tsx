// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import type { RuleSummary } from '@/types/precheck'
import SettingsRoute, { metadata } from './page'

// 시험 내용과 상관없이, PC가 바쁠 때 기본 5초를 넘겨 실패하는 일만 막는다
vi.setConfig({ testTimeout: 60_000 })

// /settings 설정 화면 (precheck REQ-012 AC-012.6, 목업 화면 10). 문지기와 앱 틀은 (app)/layout이 준다.
// 실제 Supabase·실제 Worker에 붙지 않는다
const { supabaseBrowser } = vi.hoisted(() => {
  const client = { from: () => ({ select: () => ({ then: (ok: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) }) }) }
  return { supabaseBrowser: () => client }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))
// 데스크 계정 칸(desk-feedback AC-6304.2)의 저장 함수는 흉내 낸다(실제 rpc 없음). 목록은 빈 것
const desk = vi.hoisted(() => ({ list: vi.fn(async () => []), add: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/storage/desk', () => ({ listDeskMembers: desk.list, addDeskMember: desk.add, removeDeskMember: desk.remove }))
// 병원 정보 칸(clinic-profile AC-6602.1)의 읽기는 흉내 낸다: 저장한 적 없는 병원(줄 없음) + 지어낸 가입 이름. 저장 뒤 router.refresh는 가짜 라우터
const clinic = vi.hoisted(() => ({
  load: vi.fn(async () => null),
  signup: vi.fn(async () => ({ name: '가짜정형외과의원', phone: '0212345678' })),
}))
vi.mock('@/lib/storage/clinicProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/clinicProfile')>()),
  loadClinicProfile: clinic.load,
  loadSignup: clinic.signup,
  downloadLogo: vi.fn(async () => null),
  saveClinicProfile: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }))

const RULE: RuleSummary = {
  id: 'LA-01',
  title: '신경차단술 12개월 횟수',
  domain: '신경차단술',
  grade: '확인필요',
  basis: [{ doc: '문서', number: '고시 제2025-001호' }],
  enabled_default: true,
}

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror = null
  onmessageerror = null
  postMessage() {
    queueMicrotask(() => this.onmessage?.({ data: { type: 'ruleList', ok: true, rules: [RULE] } } as MessageEvent))
  }
  terminate() {}
}

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker)
  clinic.load.mockClear()
  clinic.signup.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('/settings 페이지', () => {
  it('AC-012.6: 브라우저 탭 이름은 설정이다', () => {
    expect(metadata.title).toBe('설정')
  })

  it('AC-012.6·AC-5201.1·AC-6602.1: 제목 "설정"과 안쪽 메뉴 — [설정](옛 [청구])은 지금 화면, [비트 PC 연결]은 /claim/setup 링크, 옛 이름 청구·연락 글자 없음', async () => {
    render(<SettingsRoute />)
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeTruthy()
    const sub = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    expect(within(sub).getAllByRole('link').map((a) => a.textContent)).toEqual(['설정', '비트 PC 연결'])
    expect(within(sub).queryByRole('link', { name: '청구' })).toBeNull()
    const here = within(sub).getByRole('link', { name: '설정' })
    expect(here.getAttribute('href')).toBe('/settings')
    expect(here.getAttribute('aria-current')).toBe('page')
    const setup = within(sub).getByRole('link', { name: '비트 PC 연결' })
    expect(setup.getAttribute('href')).toBe('/claim/setup')
    expect(setup.hasAttribute('aria-current')).toBe(false)
    await screen.findByText('LA-01')
    expect(document.body.textContent).not.toContain('청구·연락')
  })

  it("AC-012.6: '청구'에 '점검 규칙' 칸이 있고 규칙 줄이 나온다", async () => {
    render(<SettingsRoute />)
    expect(screen.getByRole('heading', { level: 2, name: '점검 규칙' })).toBeTruthy()
    expect(await screen.findByText('신경차단술 12개월 횟수')).toBeTruthy()
  })

  it("AC-6304.2: 맨 아래 칸은 '데스크 계정'이다(현금 시재 다음)", async () => {
    render(<SettingsRoute />)
    const titles = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(titles.at(-1)).toBe('데스크 계정')
    expect(titles.at(-2)).toBe('현금 시재')
    await screen.findByRole('textbox', { name: '데스크 구글 메일' })
    expect(desk.list).toHaveBeenCalled()
    expect(desk.add).not.toHaveBeenCalled()
  })

  it("AC-6602.1: 원장에게는 맨 위(설치 파일 칸 앞) 첫 칸이 '병원 정보'다", async () => {
    render(<SettingsRoute />)
    const titles = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(titles[0]).toBe('병원 정보')
    expect(titles.filter((t) => t === '병원 정보')).toHaveLength(1)
    await screen.findByRole('textbox', { name: '병원 이름' })
    expect(clinic.load).toHaveBeenCalled()
  })

  it("AC-6602.7: 데스크에게는 '병원 정보' 칸이 없고 병원 정보를 읽지도 않는다", async () => {
    render(
      <RoleProvider desk>
        <SettingsRoute />
      </RoleProvider>,
    )
    await screen.findByText('LA-01')
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles).not.toContain('병원 정보')
    expect(screen.queryByRole('textbox', { name: '병원 이름' })).toBeNull()
    expect(clinic.load).not.toHaveBeenCalled()
  })

  it('AC-012.6: 새 서버 경로 없음 — 페이지는 화면을 그리기만 한다(문지기는 레이아웃, DB는 브라우저 + RLS)', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(app)/settings/page.tsx'), 'utf8')
    expect(source).not.toMatch(/use server|supabase|\bfetch\(/)
  })
})
