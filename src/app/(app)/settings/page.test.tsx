// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAB_ACCESS_MENU } from '@/components/shell/menu'
import { RoleProvider } from '@/components/shell/role'
import type { RuleSummary } from '@/types/precheck'
import type { ReactElement } from 'react'
import { phraseOpenOf } from '@/components/settings/SettingsPage'
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
  loadSignupEmr: async () => null, // 가입 때 고른 EMR 없음(spec emr-signup AC-7302.3)
  downloadLogo: vi.fn(async () => null),
  saveClinicProfile: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }))
// '관리자만 보는 탭' 칸(multi-admin AC-7707.2)의 읽기·저장은 흉내 낸다. 기본은 주 관리자가 아님(지금 시험 그대로), 목록은 씨앗 12줄 '모두에게'
const tabs = vi.hoisted(() => ({ owner: vi.fn(), read: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/storage/tabAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/tabAccess')>()),
  readTabOwner: tabs.owner,
  readTabAccess: tabs.read,
  saveTabAccess: tabs.save,
}))

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
  tabs.owner.mockReset().mockResolvedValue(false)
  tabs.read.mockReset().mockResolvedValue(TAB_ACCESS_MENU.map((item) => ({ path: item.path, adminOnly: false })))
  tabs.save.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** 페이지를 주소 값(?ptab=…)과 함께 그린다. 주소가 없으면 빈 값(지금 화면 그대로) */
const route = async (params: Record<string, string | string[]> = {}) => (await SettingsRoute({ searchParams: Promise.resolve(params) })) as ReactElement<{ open: unknown }>

describe('/settings 페이지', () => {
  it('AC-012.6: 브라우저 탭 이름은 설정이다', () => {
    expect(metadata.title).toBe('설정')
  })

  it('AC-012.6·AC-5201.1·AC-6602.1·AC-8528.1: 제목 "설정"과 안쪽 메뉴 — [설정](옛 [청구])은 지금 화면, [비트 PC 연결]은 /claim/setup 링크, [구글 캘린더 새], 옛 이름 청구·연락 글자 없음', async () => {
    render(await route())
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeTruthy()
    const sub = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    expect(within(sub).getAllByRole('link').map((a) => a.textContent)).toEqual(['설정', '비트 PC 연결', '구글 캘린더새'])
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

  it("AC-8528.1: 설정 안 메뉴 셋째 칸은 '구글 캘린더'(/settings/google-calendar) + 작은 꼬리표 '새'이고 [비트 PC 연결] 칸과 같은 모양이다(지금 화면 아님)", async () => {
    render(await route())
    const sub = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    const links = within(sub).getAllByRole('link')
    const gcal = links[2]!
    expect(gcal.getAttribute('href')).toBe('/settings/google-calendar')
    expect(gcal.hasAttribute('aria-current')).toBe(false)
    expect(gcal.firstChild?.textContent).toBe('구글 캘린더')
    const badge = within(gcal).getByText('새')
    expect(badge.tagName).toBe('SPAN')
    for (const c of ['bg-accent-soft', 'text-caption', 'font-semibold', 'text-accent-strong']) expect(badge.classList.contains(c), c).toBe(true)
    expect(gcal.className).toBe(links[1]!.className)
    await screen.findByText('LA-01')
  })

  it("AC-012.6: '청구'에 '점검 규칙' 칸이 있고 규칙 줄이 나온다", async () => {
    render(await route())
    expect(screen.getByRole('heading', { level: 2, name: '점검 규칙' })).toBeTruthy()
    expect(await screen.findByText('신경차단술 12개월 횟수')).toBeTruthy()
  })

  it("AC-6304.2: 맨 아래 칸은 '데스크 계정'이다(현금 시재 다음)", async () => {
    render(await route())
    const titles = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(titles.at(-1)).toBe('데스크 계정')
    expect(titles.at(-2)).toBe('현금 시재')
    await screen.findByRole('textbox', { name: '데스크 구글 메일' })
    expect(desk.list).toHaveBeenCalled()
    expect(desk.add).not.toHaveBeenCalled()
  })

  it("AC-7707.2: 주 관리자에게는 맨 아래 칸이 '관리자만 보는 탭'이다(데스크 계정 다음)", async () => {
    tabs.owner.mockResolvedValue(true)
    render(await route())
    await screen.findByRole('heading', { level: 2, name: '관리자만 보는 탭' })
    await screen.findByRole('textbox', { name: '데스크 구글 메일' })
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles.at(-1)).toBe('관리자만 보는 탭')
    expect(titles.at(-2)).toBe('데스크 계정')
    expect(titles.filter((t) => t === '관리자만 보는 탭')).toHaveLength(1)
    expect(tabs.owner).toHaveBeenCalledTimes(1)
    expect(tabs.read).toHaveBeenCalledTimes(1)
    expect(tabs.save).not.toHaveBeenCalled()
  })

  it("AC-6602.1: 원장에게는 맨 위(설치 파일 칸 앞) 첫 칸이 '병원 정보'다", async () => {
    render(await route())
    const titles = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(titles[0]).toBe('병원 정보')
    expect(titles.filter((t) => t === '병원 정보')).toHaveLength(1)
    await screen.findByRole('textbox', { name: '병원 이름' })
    expect(clinic.load).toHaveBeenCalled()
  })

  it("AC-6602.7: 데스크에게는 '병원 정보' 칸이 없고 병원 정보를 읽지도 않는다", async () => {
    render(
      <RoleProvider desk>
        {await route()}
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

describe('AC-9306.2 주소로 병원 문구 탭·칸 열기', () => {
  it('AC-9306.2: 주소 ptab·field·learn을 골라 설정 화면에 넘긴다(주소가 없으면 null)', async () => {
    expect((await route()).props.open).toBeNull()
    expect((await route({ ptab: 'proc', field: 'ts' })).props.open).toEqual({ tab: 'proc', field: 'ts' })
    expect((await route({ ptab: 'learn', learn: 'l0000abcd' })).props.open).toEqual({ tab: 'learn', learn: 'l0000abcd' })
  })

  it('AC-9306.2: 탭은 병원 문구 탭 키만 받는다(모르는 키·여럿·물려받은 이름이면 null)', () => {
    expect(phraseOpenOf({})).toBeNull()
    for (const tab of ['basic', 'proc', 'codes', 'rules', 'reason', 'words', 'try', 'learn']) expect(phraseOpenOf({ ptab: tab }), tab).toEqual({ tab })
    expect(phraseOpenOf({ ptab: 'nope' })).toBeNull()
    expect(phraseOpenOf({ ptab: ['proc', 'reason'] })).toBeNull()
    expect(phraseOpenOf({ ptab: '__proto__' })).toBeNull()
    expect(phraseOpenOf({ ptab: 'toString' })).toBeNull()
  })

  it('AC-9306.2: 칸은 출처 표(fieldPlace)가 아는 칸이고 그 탭의 칸일 때만 받는다', () => {
    expect(phraseOpenOf({ ptab: 'reason', field: 'itv' })).toEqual({ tab: 'reason', field: 'itv' })
    expect(phraseOpenOf({ ptab: 'proc', field: 'byRegion.knee' })).toEqual({ tab: 'proc', field: 'byRegion.knee' })
    expect(phraseOpenOf({ ptab: 'proc', field: 'byProc.SSNB' })).toEqual({ tab: 'proc', field: 'byProc.SSNB' })
    expect(phraseOpenOf({ ptab: 'codes', field: 'CODEMAP.KK090.memo' })).toEqual({ tab: 'codes', field: 'CODEMAP.KK090.memo' })
    expect(phraseOpenOf({ ptab: 'proc', field: 'itv' })).toEqual({ tab: 'proc' })
    expect(phraseOpenOf({ ptab: 'proc', field: 'nope' })).toEqual({ tab: 'proc' })
    expect(phraseOpenOf({ ptab: 'proc', field: 'byRegion.nope' })).toEqual({ tab: 'proc' })
    expect(phraseOpenOf({ ptab: 'proc', field: ['ts', 'main'] })).toEqual({ tab: 'proc' })
    expect(phraseOpenOf({ ptab: 'proc', field: `byProc.${'가'.repeat(80)}` })).toEqual({ tab: 'proc' })
  })

  it("AC-9306.2: 학습 번호는 학습 탭에서 'l' + 16진수 8자 모양일 때만 받는다(환자 값 모양은 버린다)", () => {
    expect(phraseOpenOf({ ptab: 'learn', learn: 'l0000abcd' })).toEqual({ tab: 'learn', learn: 'l0000abcd' })
    expect(phraseOpenOf({ ptab: 'learn', learn: '홍길동' })).toEqual({ tab: 'learn' })
    expect(phraseOpenOf({ ptab: 'learn', learn: 'l0000ABCD' })).toEqual({ tab: 'learn' })
    expect(phraseOpenOf({ ptab: 'learn', learn: ['l0000abcd'] })).toEqual({ tab: 'learn' })
    expect(phraseOpenOf({ ptab: 'proc', learn: 'l0000abcd' })).toEqual({ tab: 'proc' })
  })
})
