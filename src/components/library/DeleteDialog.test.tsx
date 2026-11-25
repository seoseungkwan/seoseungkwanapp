// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryFile } from '@/lib/library/files'
import { deleteLibraryFile, LibraryError, listLibraryFiles } from '@/lib/storage/library'
import { LibraryScreen } from './LibraryScreen'
import { deferred, E040, F1, FILES, H110, H120, H133 } from './library.test.data'

// 자료실 지우기 확인 창 (spec library REQ-8107 AC-8107.1~AC-8107.3, design.md '화면' DeleteDialog, 승인 시안 ?s=delete).
// 관리자 화면에서 줄의 [지우기]로 연다. 저장 함수(lib/storage/library)는 흉내다. 둘째 문장은 진짜 lib/library/files의 deleteNote로 만든다.
// 파일 이름·크기·날짜는 모두 지어낸 것이다

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ fake: 'client' }) }))
vi.mock('@/lib/storage/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/library')>()),
  listLibraryFiles: vi.fn(),
  downloadLibraryFile: vi.fn(),
  uploadLibraryFile: vi.fn(),
  deleteLibraryFile: vi.fn(),
}))

const GONE = '모든 의원의 자료실에서 사라져요.'
const NO_UNDO = '지우면 되돌릴 수 없어요.'

beforeEach(() => {
  vi.mocked(listLibraryFiles).mockResolvedValue(FILES)
  vi.mocked(deleteLibraryFile).mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function openDelete(file: LibraryFile, files: LibraryFile[] = FILES) {
  vi.mocked(listLibraryFiles).mockResolvedValue(files)
  render(<LibraryScreen isAdmin />)
  const t = await screen.findByRole('table', { name: '자료실 파일' })
  const toggle = within(t).queryByRole('button', { name: /^옛 판 \d+개 보기$/ })
  if (toggle) fireEvent.click(toggle)
  fireEvent.click(within(t).getByRole('button', { name: `${file.name} 지우기` }))
  return screen.getByRole('alertdialog', { name: `${file.name} 파일을 지울까요?` })
}
const body = (d: HTMLElement) => within(d).getByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith(GONE))
const scrim = () => document.querySelector<HTMLElement>('[data-scrim]')!
const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('AC-8107.1: 확인 창 열기', () => {
  it('AC-8107.1: 옛 판 줄의 [지우기]도 확인 창(alertdialog)을 제목·본문·되돌릴 수 없음·[취소][지우기]로 열고 초점은 [취소]다', async () => {
    const d = await openDelete(H110)
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(within(d).getByRole('heading', { level: 2, name: `${H110.name} 파일을 지울까요?` })).toBeTruthy()
    expect(body(d).textContent).toBe(GONE)
    expect(within(d).getByText(NO_UNDO)).toBeTruthy()
    expect(within(d).getAllByRole('button').map((b) => b.textContent)).toEqual(['취소', '지우기'])
    expect(within(d).getByRole('button', { name: '지우기' }).className).toContain('text-negative')
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: '취소' }))
    expect(deleteLibraryFile).not.toHaveBeenCalled()
  })
})

describe('AC-8107.2: 최신 판을 지울 때 둘째 문장', () => {
  it('AC-8107.2: 다음 판이 있으면 지우면 {다음 판 파일 이름}이 최신이 되고, … [도우미 내려받기]도 그 판을 줘요.', async () => {
    const d = await openDelete(H133)
    expect(body(d).textContent).toBe(`${GONE} 지우면 ${H120.fileName}이 최신이 되고, 비트 PC 연결 화면의 [도우미 내려받기]도 그 판을 줘요.`)
  })

  it('AC-8107.2: 마지막 한 판이면 지우면 비트 PC 연결 화면의 [확장 내려받기]가 눌리지 않아요.', async () => {
    const d = await openDelete(E040)
    expect(body(d).textContent).toBe(`${GONE} 지우면 비트 PC 연결 화면의 [확장 내려받기]가 눌리지 않아요.`)
  })

  it('AC-8107.2: 보이는 이름을 고친 최신 판도 파일 이름으로 판을 보고, 다음 판은 파일 이름으로 적는다', async () => {
    const renamed = { ...H133, name: '청구 도우미 새 판' }
    const d = await openDelete(renamed, [renamed, { ...H120, name: '청구 도우미 옛 판' }])
    expect(within(d).getByRole('heading', { name: '청구 도우미 새 판 파일을 지울까요?' })).toBeTruthy()
    expect(body(d).textContent).toBe(`${GONE} 지우면 ${H120.fileName}이 최신이 되고, 비트 PC 연결 화면의 [도우미 내려받기]도 그 판을 줘요.`)
  })

  it.each<[string, LibraryFile]>([
    ['최신이 아닌 옛 판', H120],
    ['판 번호 없는 파일', F1],
  ])('AC-8107.2: %s는 둘째 문장이 붙지 않는다', async (_what, file) => {
    const d = await openDelete(file)
    expect(body(d).textContent).toBe(GONE)
  })
})

describe('AC-8107.3: [지우기] · 닫기', () => {
  it('AC-8107.3: 성공하면 창이 닫히고 목록을 다시 읽고 짧은 알림 {이름} 파일을 지웠어요. 가 뜬다', async () => {
    const d = await openDelete(F1)
    vi.mocked(listLibraryFiles).mockResolvedValue(FILES.filter((f) => f.id !== F1.id))
    await act(async () => fireEvent.click(within(d).getByRole('button', { name: '지우기' })))
    expect(deleteLibraryFile).toHaveBeenCalledTimes(1)
    expect(deleteLibraryFile).toHaveBeenCalledWith(F1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(listLibraryFiles).toHaveBeenCalledTimes(2)
    expect(await screen.findByText(`${F1.name} 파일을 지웠어요.`)).toBeTruthy()
    expect(await screen.findByText('파일 7개')).toBeTruthy()
    expect(screen.queryByRole('button', { name: `${F1.name} 받기` })).toBeNull()
  })

  it('AC-8107.3: 지우는 동안 [지우기]는 aria-busy이고 다시 눌러도 또 부르지 않는다', async () => {
    const wait = deferred<void>()
    vi.mocked(deleteLibraryFile).mockReturnValue(wait.promise)
    const d = await openDelete(F1)
    const del = within(d).getByRole('button', { name: '지우기' })
    fireEvent.click(del)
    expect(del.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(del)
    expect(deleteLibraryFile).toHaveBeenCalledTimes(1)
    await act(async () => wait.resolve())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('AC-8107.3: 실패면 창이 열린 채 단추 줄 위에 오류 카드 E-LIBRARY-DELETE-FAILED가 보이고 목록은 다시 읽지 않는다', async () => {
    vi.mocked(deleteLibraryFile).mockRejectedValue(new LibraryError('E-LIBRARY-DELETE-FAILED'))
    const d = await openDelete(H133)
    await act(async () => fireEvent.click(within(d).getByRole('button', { name: '지우기' })))
    const card = within(d).getByRole('alert')
    expect(card.textContent).toContain('파일을 지우지 못했어요.')
    expect(card.textContent).toContain('인터넷 연결을 확인하고 [지우기]를 다시 눌러 보세요. 계속되면 오류 번호와 함께 알려 주세요.')
    expect(card.textContent).toContain('오류 번호 E-LIBRARY-DELETE-FAILED')
    expect(before(within(d).getByText(NO_UNDO), card)).toBe(true)
    expect(before(card, within(d).getByRole('button', { name: '취소' }))).toBe(true)
    expect(screen.getByRole('alertdialog')).toBe(d)
    expect(within(d).getByRole('button', { name: '지우기' }).getAttribute('aria-busy')).toBeNull()
    expect(listLibraryFiles).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/파일을 지웠어요\.$/)).toBeNull()
  })

  it.each<[string, () => void]>([
    ['[취소]', () => fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '취소' }))],
    ['바깥 누름', () => fireEvent.click(scrim())],
    ['Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('AC-8107.3: %s는 지우지 않고 닫는다', async (_how, close) => {
    await openDelete(F1)
    close()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(deleteLibraryFile).not.toHaveBeenCalled()
    expect(listLibraryFiles).toHaveBeenCalledTimes(1)
  })

  it('AC-8107.3: 닫으면 초점은 연 [지우기]로 돌아간다', async () => {
    render(<LibraryScreen isAdmin />)
    const t = await screen.findByRole('table', { name: '자료실 파일' })
    const opener = within(t).getByRole('button', { name: `${F1.name} 지우기` })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '취소' }))
    expect(document.activeElement).toBe(opener)
  })
})
