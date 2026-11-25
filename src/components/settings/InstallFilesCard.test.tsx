// @vitest-environment jsdom
// 설정 탭의 '설치 파일' 작은 칸 (specs/library TASK-5, REQ-8109 · AC-8109.1, design.md '설정·관리자 칸과 받기 단추', 승인 시안 docs/mockups/library ?s=settings의 .mini-card).
// 옛 '비트 PC 연결 · 설치 파일' 받기 표 자리(병원 정보 칸 다음)에 h2 · 설정 글 한 줄 · [자료실 열기 →](/library)만 둔다. 목록은 읽지 않는다.
// 저장 함수(설치 파일·자료실 목록)는 흉내라 불리면 안 된다. 다른 설정 칸은 이 시험에서 빈 칸으로 바꾼다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import { InstallFilesCard } from './InstallFilesCard'
import { SettingsPage } from './SettingsPage'

const store = vi.hoisted(() => ({ latest: vi.fn(), download: vi.fn(), list: vi.fn(), get: vi.fn() }))
vi.mock('@/lib/storage/installFiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/installFiles')>()),
  latestInstallFiles: store.latest,
  downloadInstallFile: store.download,
}))
vi.mock('@/lib/storage/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/library')>()),
  listLibraryFiles: store.list,
  downloadLibraryFile: store.get,
}))
// 설정 화면의 다른 칸(지금 그대로): 이 시험은 차례만 본다
vi.mock('./RuleSettings', () => ({ RuleSettings: () => <section aria-label="처방 규칙 칸" /> }))
vi.mock('./HospitalPhrases', () => ({ HospitalPhrases: () => <section aria-label="병원 문구 칸" /> }))
vi.mock('./DxLinks', () => ({ DxLinks: () => <section aria-label="상병 연결표 칸" /> }))
vi.mock('./CashFloatSetting', () => ({ CashFloatSetting: () => <section aria-label="시재금 칸" /> }))
vi.mock('./DeskAccounts', () => ({ DeskAccounts: () => <section aria-label="데스크 계정 칸" /> }))

const TITLE = '설치 파일'
const TEXT = '설치 파일은 자료실에서 받아요. 청구 도우미·크롬 확장과 설명서가 모두 거기 있어요.'
const OPEN = '자료실 열기'
const VIEWING: Viewing = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '가짜다른의원' }
const SOURCE = readFileSync(join(process.cwd(), 'src/components/settings/InstallFilesCard.tsx'), 'utf8')

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect(tokens(el.getAttribute('class') ?? '')).toEqual(expect.arrayContaining(tokens(classes)))
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

const card = () => screen.getByRole('region', { name: TITLE })
const link = () => within(card()).getByRole('link', { name: OPEN }) as HTMLAnchorElement

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset().mockReturnValue(new Promise(() => {}))
})
afterEach(() => cleanup())

describe('AC-8109.1 설정 탭의 설치 파일 작은 칸', () => {
  it("AC-8109.1: 칸(화면 읽기 이름 '설치 파일') 하나에 h2 '설치 파일'(패널 제목) · 설정 글 · [자료실 열기]가 이 차례로 있다", () => {
    render(<InstallFilesCard />)
    expect(screen.getAllByRole('region')).toHaveLength(1)
    const title = within(card()).getByRole('heading', { level: 2, name: TITLE })
    hasAll(title, ds.panelTitle)
    const text = within(card()).getByText(TEXT)
    expect(text.tagName).toBe('P')
    hasAll(text, 'mt-0.5 text-body text-ink-2')
    expect(isBefore(title, text)).toBe(true)
    expect(isBefore(text, link())).toBe(true)
    // 글 묶음(제목·글)과 링크 둘뿐
    expect(card().textContent).toBe(`${TITLE}${TEXT}${OPEN}`)
  })

  it('AC-8109.1: 칸 모양은 시안 .mini-card — 패널 + 가로 줄(양 끝 정렬, 사이 16px, 안쪽 20px)이고 상자 안 상자가 없다', () => {
    const { container } = render(<InstallFilesCard />)
    expect(card().tagName).toBe('SECTION')
    hasAll(card(), `${ds.panel} flex items-center justify-between gap-4 p-5`)
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-8109.1: [자료실 열기]는 /library로 가는 보조 단추 모양 링크이고 글 뒤에 오른쪽 화살표 그림이 있다(새 탭 없음)', () => {
    render(<InstallFilesCard />)
    const a = link()
    expect(a.tagName).toBe('A')
    expect(a.getAttribute('href')).toBe('/library')
    expect(a.getAttribute('target')).toBeNull()
    hasAll(a, ds.button.secondary)
    expect(a.textContent).toBe(OPEN)
    const svg = a.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(a.lastElementChild).toBe(svg)
  })

  it('AC-8109.1: 받기 표·[내려받기] 단추·[비트 PC 연결 확인하러 가기 →]가 없다', () => {
    render(<InstallFilesCard />)
    expect(within(card()).queryByRole('table')).toBeNull()
    expect(within(card()).queryAllByRole('button')).toEqual([])
    expect(within(card()).getAllByRole('link')).toHaveLength(1)
    expect(document.querySelector('a[href="/claim/setup"]')).toBeNull()
    expect(card().textContent).not.toContain('내려받기')
    expect(card().textContent).not.toContain('비트 PC 연결 확인하러 가기')
    expect(screen.queryByRole('heading', { name: '비트 PC 연결 · 설치 파일' })).toBeNull()
  })

  it('AC-8109.1: 목록을 읽지 않는다 — 설치 파일·자료실 저장 함수를 하나도 부르지 않는다', () => {
    render(<InstallFilesCard />)
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
    expect(SOURCE).not.toMatch(/@\/lib\/storage|useInstallFiles|DownloadButton|supabase/)
  })

  it('AC-8109.1: 보는 중(다른 의원을 읽기만)에도 같은 칸이다', () => {
    const { container: plain } = render(<InstallFilesCard />)
    const before = plain.innerHTML
    cleanup()
    const { container: viewing } = render(
      <ViewingProvider viewing={VIEWING}>
        <InstallFilesCard />
      </ViewingProvider>,
    )
    expect(viewing.innerHTML).toBe(before)
    expect(link().getAttribute('href')).toBe('/library')
  })

  it('AC-8109.1: 폰 전용 모양을 만들지 않는다 — 소스에 폰 폭 클래스(max-md: 등)가 없다', () => {
    expect(SOURCE).not.toMatch(/\b(max-)?(sm|md|lg|xl):/)
  })

  // clinic-profile AC-6602.1: 맨 위는 '병원 정보' 칸이고, 이 칸은 그 바로 다음이다(옛 칸 자리 그대로)
  it("AC-8109.1·AC-6602.1: 설정 화면(SettingsPage)은 제목·안쪽 메뉴 아래 맨 위 '병원 정보' 칸 바로 다음에 이 칸을 두고, 지금 칸들은 그 아래 그대로다", async () => {
    render(<SettingsPage />)
    const install = await screen.findByRole('region', { name: TITLE })
    const nav = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    const sections = Array.from(document.body.querySelectorAll('section'))
    expect(sections.map((s) => s.getAttribute('aria-label') ?? s.querySelector('h2')?.textContent)).toEqual([
      '병원 정보',
      TITLE,
      '처방 규칙 칸',
      '병원 문구 칸',
      '상병 연결표 칸',
      '시재금 칸',
      '데스크 계정 칸',
    ])
    expect(sections[1]).toBe(install)
    expect(isBefore(nav, install)).toBe(true)
    // 안쪽 메뉴를 감싼 머리 다음 형제가 병원 정보 칸이고, 그다음 형제가 이 칸이다
    expect(nav.parentElement?.nextElementSibling).toBe(sections[0])
    expect(sections[0].nextElementSibling).toBe(install)
    expect(store.latest).not.toHaveBeenCalled()
    expect(store.list).not.toHaveBeenCalled()
  })
})
