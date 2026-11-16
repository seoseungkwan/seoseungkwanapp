// @vitest-environment jsdom
// 설정 탭 맨 위 '비트 PC 연결 · 설치 파일' 칸 (specs/helper-download TASK-2, REQ-5103 · AC-5103.2·AC-5103.3, design.md '화면', 시안 docs/mockups/helper-download ?s=settings).
// 보관함은 가짜다: latestInstallFiles·downloadInstallFile만 바꾸고 판·크기 글자는 진짜 installMeta를 쓴다. 다른 설정 칸은 이 시험에서 빈 칸으로 바꾼다
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { InstallFile, InstallKind } from '@/lib/storage/installFiles'
import type { ErrorCode } from '@/types/errors'
import { InstallFilesCard } from './InstallFilesCard'
import { SettingsPage } from './SettingsPage'

const store = vi.hoisted(() => ({ latest: vi.fn(), download: vi.fn() }))
vi.mock('@/lib/storage/installFiles', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/installFiles')>()
  return { ...real, latestInstallFiles: store.latest, downloadInstallFile: store.download }
})
// 설정 화면의 다른 칸(지금 그대로): 이 시험은 차례만 본다
vi.mock('./RuleSettings', () => ({ RuleSettings: () => <section aria-label="처방 규칙 칸" /> }))
vi.mock('./HospitalPhrases', () => ({ HospitalPhrases: () => <section aria-label="병원 문구 칸" /> }))
vi.mock('./DxLinks', () => ({ DxLinks: () => <section aria-label="상병 연결표 칸" /> }))
vi.mock('./CashFloatSetting', () => ({ CashFloatSetting: () => <section aria-label="시재금 칸" /> }))

const CREATED = '2026-11-17T01:00:00.000Z' // 한국 11월 17일 10시
const HELPER: InstallFile = { kind: 'helper', version: [0, 9, 0], name: 'precheck-helper-0.9.0.zip', path: 'helper/precheck-helper-0.9.0.zip', size: 889_612, uploadedAt: CREATED }
const EXTENSION: InstallFile = { kind: 'extension', version: [0, 3, 0], name: 'precheck-extension-0.3.0.zip', path: 'extension/precheck-extension-0.3.0.zip', size: 6_480, uploadedAt: CREATED }
const BOTH: Record<InstallKind, InstallFile | null> = { helper: HELPER, extension: EXTENSION }

const TITLE = '비트 PC 연결 · 설치 파일'
const DESC = '비트를 쓰는 PC(접수·진료실)에 확장과 도우미를 깔아야 청구·통계·환자·수납일지가 비트 자료를 읽어요. 새 판이 나오면 여기서 다시 받아 덮어 설치하세요.'
const GO = '비트 PC 연결 확인하러 가기 →'
const GO_NOTE = '설치 순서와 연결 확인은 이 화면에서 해요(청구 탭 아래)'
const NONE = '아직 받을 파일이 없어요. 관리자에게 알려 주세요.'

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect(tokens(el.getAttribute('class') ?? '')).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(tokens(el.getAttribute('class') ?? ''), t).not.toContain(t)
}
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
function expectInfo(el: HTMLElement, code: ErrorCode) {
  const info = errorInfo(code)
  expect(el.textContent).toContain(info.what)
  expect(el.textContent).toContain(info.fix)
  expect(el.textContent).toContain(`오류 번호 ${code}`)
}

const card = () => screen.getByRole('region', { name: TITLE })
const table = () => within(card()).getByRole('table')
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const rowOf = (kind: string) => bodyRows().find((tr) => tr.querySelector('td')?.textContent?.startsWith(kind)) as HTMLElement
const cellsOf = (tr: HTMLElement) => Array.from(tr.querySelectorAll('td'))
const button = (name: string) => within(card()).getByRole('button', { name }) as HTMLButtonElement

async function renderCard() {
  render(<InstallFilesCard />)
  await within(card()).findByText('0.9.0')
}

beforeEach(() => {
  store.latest.mockReset().mockResolvedValue(BOTH)
  store.download.mockReset().mockResolvedValue(undefined)
})
afterEach(() => cleanup())

describe('AC-5103.2 설정 탭의 설치 파일 칸', () => {
  it("AC-5103.2: 제목 '비트 PC 연결 · 설치 파일'(패널 제목)과 설명 글이 시안 그대로다", async () => {
    await renderCard()
    const title = within(card()).getByRole('heading', { level: 2, name: TITLE })
    hasAll(title, ds.panelTitle)
    const desc = within(card()).getByText(DESC)
    expect(desc.tagName).toBe('P')
    expect(isBefore(title, desc)).toBe(true)
    expect(isBefore(desc, table())).toBe(true)
  })

  it('AC-5103.2: 표 머리는 종류·지금 판·크기(단추 칸은 이름 없음), 줄은 크롬 확장 → 도우미 차례로 이름·설명·지금 판·크기·보조 단추다', async () => {
    await renderCard()
    const heads = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['종류', '지금 판', '크기', ''])
    expect(bodyRows()).toHaveLength(2)
    const [ext, helper] = bodyRows()
    expect(cellsOf(ext).map((td) => td.textContent)).toEqual(['크롬 확장크롬에 붙이는 작은 프로그램', '0.3.0', '6KB', '확장 내려받기'])
    expect(cellsOf(helper).map((td) => td.textContent)).toEqual(['도우미비트 자료를 읽는 PC 프로그램', '0.9.0', '889KB', '도우미 내려받기'])
    // 이름은 굵게, 설명은 작은 흐린 글
    hasAll(within(ext).getByText('크롬 확장'), 'font-semibold text-ink')
    hasAll(within(ext).getByText('크롬에 붙이는 작은 프로그램'), 'text-small text-muted')
    expect(within(ext).getByRole('button', { name: '확장 내려받기' })).toBe(button('확장 내려받기'))
    expect(within(helper).getByRole('button', { name: '도우미 내려받기' })).toBe(button('도우미 내려받기'))
  })

  it('AC-5103.2: 두 단추는 보조 단추이고(이 칸에 주 단추가 없다) 누르면 그 줄의 파일을 받는다', async () => {
    await renderCard()
    for (const name of ['확장 내려받기', '도우미 내려받기']) {
      hasAll(button(name), ds.button.secondary)
      hasNone(button(name), 'bg-accent text-surface')
      expect(button(name).disabled).toBe(false)
    }
    const user = userEvent.setup()
    await user.click(button('확장 내려받기'))
    expect(store.download).toHaveBeenLastCalledWith(EXTENSION)
    await user.click(button('도우미 내려받기'))
    expect(store.download).toHaveBeenLastCalledWith(HELPER)
    expect(store.download).toHaveBeenCalledTimes(2)
    // 판·크기는 칸에 있고 단추 옆에 다시 쓰지 않는다
    expect(card().textContent).not.toContain('올림')
  })

  it("AC-5103.2: 아래에 '비트 PC 연결 확인하러 가기 →' 링크(/claim/setup)와 옆 글이 있다", async () => {
    await renderCard()
    const go = within(card()).getByRole('link', { name: GO })
    expect(go.getAttribute('href')).toBe('/claim/setup')
    expect(go.getAttribute('target')).toBeNull()
    hasAll(go, `${ds.button.secondary} no-underline`)
    const note = within(card()).getByText(GO_NOTE)
    hasAll(note, 'text-small text-muted')
    expect(isBefore(table(), go)).toBe(true)
    expect(isBefore(go, note)).toBe(true)
  })

  it('AC-5103.2: 목록은 칸 하나에서 한 번만 읽는다', async () => {
    await renderCard()
    expect(store.latest).toHaveBeenCalledTimes(1)
  })

  it('AC-5103.2: 768px 미만은 지금 판·크기 칸을 숨기고(시안 hide-sm) 단추·링크는 44px 전체 폭이다', async () => {
    await renderCard()
    const heads = within(table()).getAllByRole('columnheader')
    hasNone(heads[0], 'max-md:hidden')
    hasAll(heads[1], 'max-md:hidden')
    hasAll(heads[2], 'max-md:hidden')
    for (const tr of bodyRows()) {
      const tds = cellsOf(tr)
      hasNone(tds[0], 'max-md:hidden')
      hasAll(tds[1], 'max-md:hidden')
      hasAll(tds[2], 'max-md:hidden')
      hasNone(tds[3], 'max-md:hidden')
    }
    for (const name of ['확장 내려받기', '도우미 내려받기']) hasAll(button(name), 'max-md:h-11 max-md:w-full')
    hasAll(within(card()).getByRole('link', { name: GO }), 'max-md:h-11 max-md:w-full')
  })

  it("AC-5103.2·AC-5103.1: 한 종류 파일이 없으면 그 줄의 판·크기는 '—', 단추는 눌리지 않고 '아직 받을 파일이 없어요. 관리자에게 알려 주세요.'", async () => {
    store.latest.mockResolvedValue({ helper: HELPER, extension: null })
    await renderCard()
    const ext = rowOf('크롬 확장')
    expect(cellsOf(ext)[1].textContent).toBe('—')
    expect(cellsOf(ext)[2].textContent).toBe('—')
    expect(button('확장 내려받기').disabled).toBe(true)
    expect(within(ext).getByText(NONE)).toBeTruthy()
    expect(button('도우미 내려받기').disabled).toBe(false)
    expect(within(rowOf('도우미')).queryByText(NONE)).toBeNull()
  })

  it("AC-5103.2: 설정 화면(SettingsPage)은 제목·안쪽 메뉴 바로 아래 맨 위에 이 칸을 두고, 지금 칸들은 그 아래 그대로다", async () => {
    render(<SettingsPage />)
    const install = await screen.findByRole('region', { name: TITLE })
    const nav = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    const sections = Array.from(document.body.querySelectorAll('section'))
    expect(sections.map((s) => s.getAttribute('aria-label') ?? s.querySelector('h2')?.textContent)).toEqual([
      TITLE,
      '처방 규칙 칸',
      '병원 문구 칸',
      '상병 연결표 칸',
      '시재금 칸',
    ])
    expect(sections[0]).toBe(install)
    expect(isBefore(nav, install)).toBe(true)
    // 안쪽 메뉴를 감싼 머리 다음 형제가 이 칸이다
    expect(nav.parentElement?.nextElementSibling).toBe(install)
  })
})

describe('AC-5103.3 설정 칸의 실패', () => {
  it('AC-5103.3: 목록 읽기가 실패하면 칸 안에 E-INSTALL-READ-FAILED 안내가 한 번만 보이고 두 단추는 눌리지 않는다', async () => {
    store.latest.mockRejectedValue(new Error('StorageApiError secret'))
    render(<InstallFilesCard />)
    const alert = await within(card()).findByRole('alert')
    expectInfo(alert, 'E-INSTALL-READ-FAILED')
    expect(within(card()).getAllByRole('alert')).toHaveLength(1)
    expect(card().textContent?.split('오류 번호 E-INSTALL-READ-FAILED')).toHaveLength(2)
    expect(button('확장 내려받기').disabled).toBe(true)
    expect(button('도우미 내려받기').disabled).toBe(true)
    expect(card().textContent).not.toContain('secret')
    expect(card().textContent).not.toContain(NONE)
  })

  it('AC-5103.3: 받기가 실패하면 누른 단추의 줄에 E-INSTALL-DOWNLOAD-FAILED 안내(무엇이·어떻게·번호)가 보인다', async () => {
    store.download.mockRejectedValue(new Error('StorageApiError secret'))
    await renderCard()
    await userEvent.setup().click(button('도우미 내려받기'))
    const alert = await within(rowOf('도우미')).findByRole('alert')
    expectInfo(alert, 'E-INSTALL-DOWNLOAD-FAILED')
    expect(within(rowOf('크롬 확장')).queryByRole('alert')).toBeNull()
    expect(card().textContent).not.toContain('secret')
  })
})
