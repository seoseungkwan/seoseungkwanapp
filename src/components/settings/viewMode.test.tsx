// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { neutralPhrases } from '@/lib/precheck/memo'
import { defaultProfile, loadClinicProfile, loadSignup, removeLogo, saveClinicProfile, uploadLogo } from '@/lib/storage/clinicProfile'
import { readHospitalSettings, readRuleRows, startHospitalSettings, writeHospitalSettings, writeRuleSettings } from '@/lib/storage/claimSettings'
import { addDeskMember, listDeskMembers, removeDeskMember } from '@/lib/storage/desk'
import { latestInstallFiles } from '@/lib/storage/installFiles'
import { readRuleBadges } from '@/lib/storage/ruleChanges'
import { readTabAccess, readTabOwner, saveTabAccess } from '@/lib/storage/tabAccess'
import { loadCashFloatSetting, saveCashFloatSetting } from '@/lib/storage/worklogSettings'
import type { ClinicProfile } from '@/types/clinicProfile'
import type { RuleSummary } from '@/types/precheck'
import { SettingsPage } from './SettingsPage'

// 보는 중 설정 (admin-view REQ-8011 AC-8011.3, design.md '탭마다 읽기만' 설정 줄).
// 관리자가 다른 의원을 보는 중이면 모든 칸의 쓰기 단추([저장]·[다시 저장]·[기본값으로]·[되돌리기]·로고·사람·휴진일·줄 더하기·빼기·데스크 [더하기]·[빼기]·
// [처음 질문 하기]·[기본 문구로 바로 시작])가 없고 입력 칸은 막혀(disabled·readOnly) 값만 보인다. [비트 PC 연결]로 가는 길(안쪽 메뉴)과
// '관리자만 보는 탭' 칸은 그리지 않는다. 데스크 계정 칸은 보는 의원의 데스크 메일 목록을 보이고, 설치 파일 작은 칸의 [자료실 열기](library AC-8109.1)는 그대로다.
// 설치 파일 칸은 목록을 읽지 않는다(옛 받기 표·[비트 PC 연결 확인하러 가기 →]는 없다).
// 찾기·거르기(규칙 찾기·묶음·등급, 처방코드 찾기·[전체 보기])와 병원 문구 묶음 단추·'메모 시험'은 읽기라 그대로다. viewing={null}이면 지금과 같다.
// 저장 함수·Worker·supabaseBrowser는 흉내다(실제 Supabase에 붙지 않는다). 이름·메일·번호는 모두 지어낸 것이다

vi.setConfig({ testTimeout: 60_000 })

const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/settings' }))
vi.mock('@/lib/storage/clinicProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/clinicProfile')>()),
  loadClinicProfile: vi.fn(),
  loadSignup: vi.fn(),
  loadSignupEmr: async () => null,
  downloadLogo: vi.fn(),
  saveClinicProfile: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
  normalizeLogo: vi.fn(),
}))
vi.mock('@/lib/storage/installFiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/installFiles')>()),
  latestInstallFiles: vi.fn(),
  downloadInstallFile: vi.fn(),
}))
vi.mock('@/lib/storage/claimSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/claimSettings')>()),
  readRuleRows: vi.fn(),
  readRuleSettings: vi.fn(),
  writeRuleSettings: vi.fn(),
  readHospitalSettings: vi.fn(),
  writeHospitalSettings: vi.fn(),
  startHospitalSettings: vi.fn(),
}))
vi.mock('@/lib/storage/ruleChanges', () => ({ readRuleBadges: vi.fn() }))
vi.mock('@/components/stats/useRxCatalog', () => ({ useRxCatalog: () => ({ days: [], state: 'ready', open: () => {}, retry: () => {} }) }))
vi.mock('@/lib/storage/worklogSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/worklogSettings')>()),
  loadCashFloatSetting: vi.fn(),
  saveCashFloatSetting: vi.fn(),
}))
vi.mock('@/lib/storage/desk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/desk')>()),
  listDeskMembers: vi.fn(),
  addDeskMember: vi.fn(),
  removeDeskMember: vi.fn(),
}))
vi.mock('@/lib/storage/tabAccess', () => ({ readTabOwner: vi.fn(), readTabAccess: vi.fn(), saveTabAccess: vi.fn() }))

// 점검 규칙 목록은 Worker가 준다: 가짜 Worker는 ruleList에 정해 둔 답을 준다
const rule = (id: string, title: string, domain: string, grade: RuleSummary['grade'], number: string): RuleSummary => ({
  id,
  title,
  domain,
  grade,
  basis: [{ doc: '문서', number }],
  enabled_default: true,
})
const RULES = [rule('LA-01', '신경차단술 12개월 횟수', '신경차단술', '확인필요', '고시 제2025-001호'), rule('PT-02', '같은 날 물리치료 3가지', '물리치료', '알림', '심사기준 2024-7')]
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessageerror: ((event: unknown) => void) | null = null
  postMessage() {
    queueMicrotask(() => this.onmessage?.({ data: { type: 'ruleList', ok: true, rules: RULES } } as MessageEvent))
  }
  terminate() {}
}

const VIEWING: Viewing = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '가짜다른의원' }
const PROFILE: ClinicProfile = {
  ...defaultProfile(),
  displayName: '가짜다른의원',
  phone: '0311234567',
  address: '가짜시 가짜로 1',
  closedDates: ['2026-12-25'],
  staff: [{ id: 'p-1', name: '김원장', role: 'doctor', mark: '김', color: 'blueberry', calendar: true }],
  logoPath: null,
}
const CREATED = '2026-11-17T01:00:00.000Z'
const DESK_EMAIL = 'desk1@fake.test'
const WRITES = [saveClinicProfile, uploadLogo, removeLogo, writeRuleSettings, writeHospitalSettings, startHospitalSettings, saveCashFloatSetting, addDeskMember, removeDeskMember, saveTabAccess]
/** 보는 중에도 눌리는 단추(읽기, 첫 화면): 없다 — 설치 파일 칸은 [자료실 열기] 링크 하나다(library AC-8109.1). 병원 문구 묶음 단추는 탭(role=tab)이다 */
const READ_BUTTONS: string[] = []
const PHRASE_TABS = ['기본', '시술별 문구와 약', '처방코드', '표기 규칙', '사유 문장', '차트 줄임말', '메모 시험', '학습']
/** 보는 중에도 열린 칸(읽기): 점검 규칙 찾기·거르기 */
const READ_FIELDS = ['규칙 찾기', '묶음', '등급']

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker)
  vi.mocked(loadClinicProfile).mockResolvedValue(PROFILE)
  vi.mocked(loadSignup).mockResolvedValue({ name: '가짜다른의원 가입', phone: '0311234567' })
  vi.mocked(readRuleRows).mockResolvedValue([{ rule_id: 'PT-02', enabled: false, grade: null, updated_at: '2026-10-30T02:00:00Z' }])
  vi.mocked(readRuleBadges).mockResolvedValue(new Map())
  vi.mocked(readHospitalSettings).mockResolvedValue({ phrases: neutralPhrases(), dxLinks: [['MM001', 'M5456', '가짜 상병', 0, 's']] })
  vi.mocked(loadCashFloatSetting).mockResolvedValue(300_000)
  vi.mocked(listDeskMembers).mockResolvedValue([{ id: 'd-1', email: DESK_EMAIL, addedAt: CREATED, signedInAt: CREATED }])
  vi.mocked(readTabOwner).mockResolvedValue(true)
  vi.mocked(readTabAccess).mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const inView = (viewing: Viewing | null, children: ReactNode) => <ViewingProvider viewing={viewing}>{children}</ViewingProvider>
const nameOf = (el: Element) => (el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent ?? '').trim()
const isOff = (el: Element) => el.matches(':disabled') || (el as HTMLInputElement).readOnly === true
const enabledButtons = () => screen.queryAllByRole('button').filter((b) => !isOff(b)).map(nameOf)
const openFields = (root: ParentNode = document.body) =>
  Array.from(root.querySelectorAll('input, select, textarea'))
    .filter((el) => !isOff(el))
    .map(nameOf)

/** 설정 화면을 그리고 칸마다 읽기가 끝날 때까지 기다린다 */
async function open(viewing: Viewing | null) {
  render(inView(viewing, <SettingsPage />))
  await screen.findByDisplayValue('가짜시 가짜로 1') // 병원 정보
  await screen.findByText('신경차단술 12개월 횟수') // 점검 규칙
  await screen.findByRole('tablist', { name: '병원 문구 묶음' }) // 병원 문구
  await screen.findByDisplayValue('M5456') // 상병 연결표
  await screen.findByDisplayValue('300,000') // 현금 시재
  await screen.findByText(DESK_EMAIL) // 데스크 계정
  await screen.findByRole('link', { name: '자료실 열기' }) // 설치 파일
}

describe('AC-8011.3: 보는 중 설정', () => {
  it('AC-8011.3·AC-8109.1: [비트 PC 연결]로 가는 길(안쪽 메뉴)과 [처음 질문 다시 하기]가 없고, 안쪽 메뉴 [설정]·설치 파일 칸 [자료실 열기]는 그대로다', async () => {
    await open(VIEWING)
    const nav = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['설정'])
    expect(screen.queryByRole('link', { name: /비트 PC 연결/ })).toBeNull()
    expect(document.querySelector('a[href="/claim/setup"]')).toBeNull()
    expect(document.querySelector('a[href="/settings/first-run"]')).toBeNull()
    const install = screen.getByRole('region', { name: '설치 파일' })
    expect(within(install).getByRole('link', { name: '자료실 열기' }).getAttribute('href')).toBe('/library')
    expect(within(install).queryAllByRole('button')).toEqual([])
    expect(latestInstallFiles).not.toHaveBeenCalled()
  })

  it("AC-8011.3: '관리자만 보는 탭' 칸을 그리지 않고 주 관리자 확인도 부르지 않는다", async () => {
    await open(VIEWING)
    expect(screen.queryByRole('region', { name: '관리자만 보는 탭' })).toBeNull()
    expect(screen.queryByText('관리자만 보는 탭')).toBeNull()
    expect(readTabOwner).not.toHaveBeenCalled()
    expect(readTabAccess).not.toHaveBeenCalled()
  })

  it('AC-8011.3·AC-8109.1·AC-9304.1: 쓰기 단추가 하나도 없다 — 눌리는 것은 병원 문구 묶음 탭뿐이다(끝에 학습 탭, 설치 파일 칸은 [자료실 열기] 링크)', async () => {
    await open(VIEWING)
    expect(enabledButtons().sort()).toEqual([...READ_BUTTONS].sort())
    const tabs = within(screen.getByRole('tablist', { name: '병원 문구 묶음' })).getAllByRole('tab')
    expect(tabs.filter((t) => !isOff(t)).map((t) => t.textContent)).toEqual(PHRASE_TABS)
    for (const word of ['저장', '다시 저장', '기본값으로', '되돌리기', '로고 고르기', '로고 바꾸기', '로고 빼기', '사람 더하기', '더하기', '줄 더하기', '기본 문구로 바로 시작']) {
      expect(screen.queryByRole('button', { name: word }), word).toBeNull()
    }
    expect(screen.queryAllByRole('button', { name: /빼기$|위로$|아래로$/ })).toEqual([])
  })

  it('AC-8011.3: 입력 칸은 모두 막혀 값만 글자로 보인다 — 열린 칸은 점검 규칙 찾기·거르기뿐이다', async () => {
    await open(VIEWING)
    expect(openFields().sort()).toEqual([...READ_FIELDS].sort())
    const clinic = screen.getByRole('region', { name: '병원 정보' })
    expect(within(clinic).getByDisplayValue('가짜다른의원')).toBeTruthy()
    expect(within(clinic).getByDisplayValue('031-123-4567')).toBeTruthy()
    expect(within(clinic).getByDisplayValue('김원장')).toBeTruthy()
    expect(within(clinic).getByText('2026-12-25 (금)')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'PT-02 켜기' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('checkbox', { name: 'PT-02 켜기' }).matches(':disabled')).toBe(true)
    expect(screen.getByRole('combobox', { name: 'LA-01 등급' }).matches(':disabled')).toBe(true)
    expect((screen.getByRole('textbox', { name: '시재 금액' }) as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByRole('textbox', { name: '1번 줄 상병코드' }) as HTMLInputElement).readOnly).toBe(true)
  })

  it('AC-8011.3: 병원 문구 묶음을 옮겨 다녀도 칸은 막혀 있다(메모 시험만 열림, 처방코드는 찾기·[전체 보기]만)', async () => {
    await open(VIEWING)
    const tabs = within(screen.getByRole('tablist', { name: '병원 문구 묶음' })).getAllByRole('tab')
    for (const tab of tabs) {
      fireEvent.click(tab)
      const name = tab.textContent ?? ''
      const panel = screen.getByRole('tabpanel')
      const open = openFields(panel)
      const pressable = within(panel)
        .queryAllByRole('button')
        .filter((b) => !isOff(b))
        .map(nameOf)
      if (name === '메모 시험') {
        expect(open.length, name).toBeGreaterThan(0)
        continue
      }
      if (name === '처방코드') {
        expect(open, name).toEqual(['코드나 이름으로 찾기'])
        expect(pressable, name).toEqual(['전체 보기'])
        expect(within(panel).queryByRole('button', { name: '새 코드 모두 제외' }), name).toBeNull()
        continue
      }
      expect(open, name).toEqual([])
      expect(pressable, name).toEqual([])
    }
  })

  it('AC-8011.3: 데스크 계정 칸은 보는 의원의 데스크 메일 목록을 보이고 [더하기]·메일 칸·[빼기]가 없다', async () => {
    await open(VIEWING)
    const desk = screen.getByRole('region', { name: '데스크 계정' })
    expect(within(within(desk).getByRole('list', { name: '데스크 계정 목록' })).getByText(DESK_EMAIL)).toBeTruthy()
    expect(within(desk).queryByRole('textbox')).toBeNull()
    expect(within(desk).queryAllByRole('button')).toEqual([])
  })

  it('AC-8011.3: 병원 문구가 없는 의원이면 [처음 질문 하기]·[기본 문구로 바로 시작]이 없고 안내 글만 있다', async () => {
    vi.mocked(readHospitalSettings).mockResolvedValue(null)
    render(inView(VIEWING, <SettingsPage />))
    expect(await screen.findByRole('status', { name: '처음 질문' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '처음 질문 하기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '기본 문구로 바로 시작' })).toBeNull()
  })

  it('AC-8011.3: 보는 중에는 저장 함수를 하나도 부르지 않는다', async () => {
    await open(VIEWING)
    fireEvent.keyDown(screen.getByRole('textbox', { name: '시재 금액' }), { key: 'Enter' })
    await waitFor(() => expect(listDeskMembers).toHaveBeenCalled())
    for (const write of WRITES) expect(write).not.toHaveBeenCalled()
  })
})

describe('AC-8011.3: viewing={null}이면 지금과 같다', () => {
  it('AC-8011.3·AC-8109.1: [비트 PC 연결] 길(안쪽 메뉴)·설치 파일 칸 [자료실 열기]·쓰기 단추·열린 칸·관리자만 보는 탭 칸이 그대로 있다', async () => {
    await open(null)
    const nav = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    // google-link AC-8528.1: 보지 않는 모드에는 [구글 캘린더](꼬리표 '새')도 있다
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['설정', '비트 PC 연결', '구글 캘린더새'])
    expect(screen.getByRole('link', { name: '자료실 열기' }).getAttribute('href')).toBe('/library')
    // 옛 설치 파일 칸 아래 링크는 없어졌다(설정 안 메뉴에 [비트 PC 연결]이 있음)
    expect(screen.queryByRole('link', { name: '비트 PC 연결 확인하러 가기 →' })).toBeNull()
    expect(document.querySelectorAll('a[href="/claim/setup"]')).toHaveLength(1)
    expect(screen.getByRole('link', { name: '처음 질문 다시 하기' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '저장' }).length).toBeGreaterThanOrEqual(4)
    expect(screen.getByRole('button', { name: '사람 더하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: `${DESK_EMAIL} 빼기` })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '시재 금액' }) as HTMLInputElement).readOnly).toBe(false)
    expect(screen.getByRole('checkbox', { name: 'PT-02 켜기' }).matches(':disabled')).toBe(false)
    expect(document.querySelector('fieldset[disabled]')).toBeNull()
    expect(await screen.findByRole('region', { name: '관리자만 보는 탭' })).toBeTruthy()
  })
})
