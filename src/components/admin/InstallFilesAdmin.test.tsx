// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import { InstallFilesAdmin } from './InstallFilesAdmin'

// 관리자 화면(가입 승인)의 '설치 파일' 작은 칸 (specs/library TASK-5, REQ-8109 · AC-8109.2, design.md '설정·관리자 칸과 받기 단추',
// 승인 시안 docs/mockups/library ?s=admin-tab의 .mini-card). 옛 올리기 표 자리(제목 묶음 아래·신청 탭 위)에 h2 · 관리자 글 · [자료실 열기 →](/library)만 둔다.
// 설치 파일 올리기·지우기는 자료실이 맡는다. 이 칸은 아무것도 읽지 않는다 — 저장 함수와 Supabase는 흉내라 불리면 안 된다
const store = vi.hoisted(() => ({ latest: vi.fn(), list: vi.fn(), upload: vi.fn() }))
vi.mock('@/lib/storage/installFiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/installFiles')>()),
  latestInstallFiles: store.latest,
}))
vi.mock('@/lib/storage/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/library')>()),
  listLibraryFiles: store.list,
  uploadLibraryFile: store.upload,
}))
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const TITLE = '설치 파일'
const TEXT = '설치 파일은 이제 자료실에서 올리고 지워요. 자료실에는 설명서 같은 다른 파일도 올릴 수 있어요.'
const OPEN = '자료실 열기'
const SOURCE = readFileSync(join(process.cwd(), 'src/components/admin/InstallFilesAdmin.tsx'), 'utf8')

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect(tokens(el.getAttribute('class') ?? '')).toEqual(expect.arrayContaining(tokens(classes)))
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

const card = () => screen.getByRole('region', { name: TITLE })
const link = () => within(card()).getByRole('link', { name: OPEN }) as HTMLAnchorElement

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset().mockReturnValue(new Promise(() => {}))
  supabaseBrowser.mockReset()
})
afterEach(() => cleanup())

describe('AC-8109.2 관리자 화면의 설치 파일 작은 칸', () => {
  it("AC-8109.2: 칸(화면 읽기 이름 '설치 파일') 하나에 h2 '설치 파일'(패널 제목) · 관리자 글 · [자료실 열기]가 이 차례로 있다", () => {
    render(<InstallFilesAdmin />)
    expect(screen.getAllByRole('region')).toHaveLength(1)
    const title = within(card()).getByRole('heading', { level: 2, name: TITLE })
    hasAll(title, ds.panelTitle)
    const text = within(card()).getByText(TEXT)
    expect(text.tagName).toBe('P')
    hasAll(text, 'mt-0.5 text-body text-ink-2')
    expect(isBefore(title, text)).toBe(true)
    expect(isBefore(text, link())).toBe(true)
    expect(card().textContent).toBe(`${TITLE}${TEXT}${OPEN}`)
  })

  it('AC-8109.2: 설정 칸과 같은 모양(시안 .mini-card) — 패널 + 가로 줄(양 끝 정렬, 사이 16px, 안쪽 20px)이고 상자 안 상자가 없다', () => {
    const { container } = render(<InstallFilesAdmin />)
    expect(card().tagName).toBe('SECTION')
    hasAll(card(), `${ds.panel} flex items-center justify-between gap-4 p-5`)
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-8109.2: [자료실 열기]는 /library로 가는 보조 단추 모양 링크이고 글 뒤에 오른쪽 화살표 그림이 있다(새 탭 없음)', () => {
    render(<InstallFilesAdmin />)
    const a = link()
    expect(a.getAttribute('href')).toBe('/library')
    expect(a.getAttribute('target')).toBeNull()
    hasAll(a, ds.button.secondary)
    expect(a.textContent).toBe(OPEN)
    const svg = a.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(a.lastElementChild).toBe(svg)
  })

  it('AC-8109.2: 올리기 표·파일 고르기·[새 파일 올리기]·옛 안내(도우미-설치파일 폴더·이름 모양·5MB)가 없다', () => {
    render(<InstallFilesAdmin />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(document.querySelector('input')).toBeNull()
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryByRole('status')).toBeNull()
    expect(within(card()).getAllByRole('link')).toHaveLength(1)
    for (const old of ['새 파일 올리기', '도우미-설치파일', 'precheck-helper', '5MB', 'Claude']) expect(document.body.textContent, old).not.toContain(old)
  })

  it('AC-8109.2: 아무것도 읽지 않는다 — 설치 파일·자료실 저장 함수와 Supabase를 부르지 않는다', () => {
    render(<InstallFilesAdmin />)
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
    expect(supabaseBrowser).not.toHaveBeenCalled()
    expect(SOURCE).not.toMatch(/@\/lib\/storage|uploadInstallFile|install-files|supabase|useEffect|useState/)
  })

  it('AC-8109.2: 서버 그리기에서도 h2 `설치 파일`과 /library 링크가 그대로 나온다(관리자 화면 차례 시험이 이 h2를 본다)', () => {
    const html = renderToStaticMarkup(<InstallFilesAdmin />)
    expect(html).toMatch(/^<section\b[^>]*aria-label="설치 파일"/)
    expect(html).toMatch(/<h2\b[^>]*>설치 파일<\/h2>/)
    expect(html).toMatch(/<a\b[^>]*href="\/library"[^>]*>자료실 열기<svg\b/)
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })

  it('AC-8109.2: 폰 전용 모양을 만들지 않는다 — 소스에 폰 폭 클래스(max-md: 등)가 없다', () => {
    expect(SOURCE).not.toMatch(/\b(max-)?(sm|md|lg|xl):/)
  })
})
