// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { deleteLibraryFile, downloadLibraryFile, LibraryError, listLibraryFiles, uploadLibraryFile } from '@/lib/storage/library'
import { LibraryScreen } from './LibraryScreen'
import { deferred, E040, F1, F2, F3, FILES, H110, H120, H133, libraryFile, X1 } from './library.test.data'

// 자료실 화면 — 목록·받기·보는 중 (spec library REQ-8105 · AC-8106.1, design.md '화면', 승인 시안 docs/mockups/library/index.html ?s=user·admin·empty·error).
// 저장 함수(lib/storage/library)와 supabaseBrowser는 흉내다(실제 Supabase에 붙지 않는다). 줄 만들기·글자는 진짜 lib/library/files를 쓴다.
// 파일 이름·크기·날짜는 모두 지어낸 것이다(library.test.data.ts)

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ fake: 'client' }) }))
vi.mock('@/lib/storage/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/library')>()),
  listLibraryFiles: vi.fn(),
  downloadLibraryFile: vi.fn(),
  uploadLibraryFile: vi.fn(),
  deleteLibraryFile: vi.fn(),
}))

const VIEWING: Viewing = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '가짜다른의원' }
const LEAD = '의원 PC에 깔 파일과 설명서를 여기서 받아요.'
const FOOT = '로그인하고 승인된 사람(데스크 포함)은 누구나 받을 수 있어요. 올리기·지우기는 관리자만 해요. 어떤 파일이든 한 파일에 50MB까지 올릴 수 있어요.'

beforeEach(() => {
  vi.mocked(listLibraryFiles).mockResolvedValue(FILES)
  vi.mocked(downloadLibraryFile).mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function show(isAdmin: boolean, viewing: Viewing | null = null) {
  const view = (children: ReactNode) => <ViewingProvider viewing={viewing}>{children}</ViewingProvider>
  return render(view(<LibraryScreen isAdmin={isAdmin} />))
}
const table = () => screen.findByRole('table', { name: '자료실 파일' })
const bodyRows = (t: HTMLElement) => Array.from(t.querySelectorAll('tbody > tr')) as HTMLElement[]
/** 줄마다 짧은 모양: 파일 줄은 보이는 이름(+ 최신), 접기 줄은 단추 글자 */
const rowNames = (t: HTMLElement) =>
  bodyRows(t).map((row) => {
    const name = row.querySelector('b')?.textContent
    if (name) return within(row).queryByText('최신') ? `${name} [최신]` : name
    return row.textContent ?? ''
  })
const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
const chipGroup = () => screen.getByRole('group', { name: '분류' })
const chip = (label: string) => within(chipGroup()).getByRole('button', { name: new RegExp(`^${label}`) })

describe('AC-8105.1: 자료실 화면 차례 — 머리 · 칩 · 표', () => {
  it('AC-8105.1: h1 자료실 · 파일 {n}개 · 안내 글 → 분류 칩(전체 눌림) → 표(머리 다섯 칸) 차례다', async () => {
    show(false)
    const t = await table()
    const h1 = screen.getByRole('heading', { level: 1, name: '자료실' })
    const count = screen.getByText('파일 8개')
    const lead = screen.getByText(LEAD)
    const chips = chipGroup()
    expect(before(h1, count) && before(count, lead) && before(lead, chips) && before(chips, t)).toBe(true)
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['전체8', '설치 파일6', '설명서1', '그 밖1'])
    expect(chip('전체').getAttribute('aria-pressed')).toBe('true')
    for (const other of ['설치 파일', '설명서', '그 밖']) expect(chip(other).getAttribute('aria-pressed')).toBe('false')
    const heads = within(t).getAllByRole('columnheader')
    expect(heads.map((h) => h.textContent)).toEqual(['이름', '분류', '크기', '올린 날', '받기'])
    // 단추 칸 머리 '받기'는 화면 읽기만(보이지 않는 글자)
    expect(heads[4]!.querySelector('.sr-only')?.textContent).toBe('받기')
  })

  it('AC-8105.1: 줄은 새로 올린 것 먼저이고, 줄마다 이름(굵게)·최신 칩·설명 · 분류 · 크기 · 올린 날 · [받기]다', async () => {
    show(false)
    const t = await table()
    expect(rowNames(t)).toEqual([
      F1.name,
      F2.name,
      F3.name,
      `${H133.name} [최신]`,
      '옛 판 2개 보기',
      `${E040.name} [최신]`,
      X1.name,
    ])
    const cells = (row: HTMLElement) => Array.from(row.querySelectorAll('td')).map((td) => td.textContent)
    const [first, , third, helper, , extension, sheet] = bodyRows(t)
    expect(cells(first!)).toEqual([`${F1.name}${F1.description}`, '설치 파일', '2.4MB', '11월 25일', '받기'])
    expect(cells(third!)).toEqual([`${F3.name}${F3.description}`, '설명서', '640KB', '11월 24일', '받기'])
    expect(cells(helper!)).toEqual([`${H133.name}최신${H133.description}`, '설치 파일', '1.1MB', '11월 23일', '받기'])
    expect(cells(extension!)).toEqual([`${E040.name}최신${E040.description}`, '설치 파일', '8KB', '11월 20일', '받기'])
    expect(cells(sheet!)).toEqual([`${X1.name}${X1.description}`, '그 밖', '46KB', '11월 18일', '받기'])
    // 이름은 굵게, 최신은 초록 칩, 설명은 흐린 글자 한 줄
    const name = within(first!).getByText(F1.name)
    expect(name.tagName).toBe('B')
    expect(name.className).toContain('font-semibold')
    expect(within(helper!).getByText('최신').className).toContain('bg-positive-soft')
    expect(within(first!).getByText(F1.description).className).toContain('text-muted')
    // [받기]의 화면 읽기 이름은 {이름} 받기
    expect(within(first!).getByRole('button', { name: `${F1.name} 받기` }).textContent).toBe('받기')
  })

  it('AC-8105.1: 설명이 없는 파일은 이름만 있다', async () => {
    vi.mocked(listLibraryFiles).mockResolvedValue([{ ...F1, description: '' }])
    show(false)
    const t = await table()
    const td = bodyRows(t)[0]!.querySelector('td')!
    expect(td.textContent).toBe(F1.name)
    expect(td.querySelectorAll('span.block')).toHaveLength(0)
  })

  it('AC-8105.1: 표 감싸개는 옆으로 밀리고(overflow-x-auto), 화면에 폰 전용 모양(화면 폭 앞말)이 없다', async () => {
    const { container } = show(true)
    const t = await table()
    expect(t.parentElement?.className).toContain('overflow-x-auto')
    const classes = Array.from(container.querySelectorAll<HTMLElement>('[class]')).flatMap((el) => el.getAttribute('class')!.split(/\s+/))
    expect(classes.filter((c) => /(^|:)(?:max-|min-)?(?:sm|md|lg|\d*xl):/.test(c) || /(^|:)(?:min|max)-\[[^\]]*\]:/.test(c))).toEqual([])
  })
})

describe('AC-8105.2: 판 번호 파일 — 최신 칩과 옛 판 접기', () => {
  it('AC-8105.2: 가장 높은 판 줄에 최신, 그 아래 [옛 판 2개 보기](aria-expanded 거짓)이고 누르면 옛 판이 판 높은 차례로 펼쳐지며 [옛 판 2개 접기]가 된다', async () => {
    show(false)
    const t = await table()
    const toggle = within(t).getByRole('button', { name: '옛 판 2개 보기' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(t).queryByText(H120.name)).toBeNull()
    fireEvent.click(toggle)
    const opened = within(t).getByRole('button', { name: '옛 판 2개 접기' })
    expect(opened.getAttribute('aria-expanded')).toBe('true')
    expect(rowNames(t).slice(3, 7)).toEqual([`${H133.name} [최신]`, '옛 판 2개 접기', H120.name, H110.name])
    // 옛 판 줄은 옅은 바탕 + 꺾인 화살표 + 보통 굵기 이름, 최신 칩 없음
    const old = within(t).getByText(H120.name).closest('tr')!
    expect(old.className).toContain('bg-canvas')
    expect(old.querySelector('td svg')).not.toBeNull()
    expect(within(old).getByText(H120.name).className).toContain('font-medium')
    expect(within(old).queryByText('최신')).toBeNull()
    fireEvent.click(opened)
    expect(within(t).getByRole('button', { name: '옛 판 2개 보기' }).getAttribute('aria-expanded')).toBe('false')
    expect(within(t).queryByText(H120.name)).toBeNull()
  })

  it('AC-8105.2: 옛 판이 없는 판 번호 파일(확장 하나)은 최신 칩만 있고 접기 줄이 없다', async () => {
    vi.mocked(listLibraryFiles).mockResolvedValue([E040, F1])
    show(false)
    const t = await table()
    expect(rowNames(t)).toEqual([F1.name, `${E040.name} [최신]`])
    expect(within(t).queryByRole('button', { name: /옛 판/ })).toBeNull()
  })
})

describe('AC-8105.3: 분류 칩으로 거르기', () => {
  it('AC-8105.3: 칩을 누르면 그 분류 줄만 보이고(눌린 칩 aria-pressed 참), 칩 숫자는 거르기와 상관없이 전체 수다', async () => {
    show(false)
    const t = await table()
    fireEvent.click(chip('설명서'))
    expect(rowNames(t)).toEqual([F3.name])
    expect(chip('설명서').getAttribute('aria-pressed')).toBe('true')
    expect(chip('전체').getAttribute('aria-pressed')).toBe('false')
    expect(within(chipGroup()).getAllByRole('button').map((b) => b.textContent)).toEqual(['전체8', '설치 파일6', '설명서1', '그 밖1'])
    fireEvent.click(chip('설치 파일'))
    expect(rowNames(t)).toEqual([F1.name, F2.name, `${H133.name} [최신]`, '옛 판 2개 보기', `${E040.name} [최신]`])
    fireEvent.click(chip('전체'))
    expect(rowNames(t)).toHaveLength(7)
  })

  it('AC-8105.3: 남은 줄이 없으면 이 분류에는 파일이 없어요. 이고, 0인 칩의 숫자는 흐리다', async () => {
    vi.mocked(listLibraryFiles).mockResolvedValue([F1, F3])
    show(false)
    const t = await table()
    const zero = chip('그 밖')
    expect(zero.textContent).toBe('그 밖0')
    expect(zero.querySelector('span')!.className).toContain('text-faint')
    expect(chip('설명서').querySelector('span')!.className).not.toContain('text-faint')
    fireEvent.click(zero)
    expect(bodyRows(t)).toHaveLength(1)
    expect(within(t).getByText('이 분류에는 파일이 없어요.')).toBeTruthy()
    expect(within(t).queryByText('아직 올린 파일이 없어요')).toBeNull()
  })
})

describe('AC-8105.4: [받기]', () => {
  it('AC-8105.4: 누르면 그 파일로 downloadLibraryFile을 한 번 부르고, 끝날 때까지 aria-busy라 다시 눌러도 또 부르지 않는다', async () => {
    const wait = deferred<void>()
    vi.mocked(downloadLibraryFile).mockReturnValue(wait.promise)
    show(false)
    await table()
    const button = screen.getByRole('button', { name: `${F3.name} 받기` })
    fireEvent.click(button)
    expect(downloadLibraryFile).toHaveBeenCalledTimes(1)
    expect(downloadLibraryFile).toHaveBeenCalledWith(F3)
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(downloadLibraryFile).toHaveBeenCalledTimes(1)
    // 다른 줄의 [받기]는 그대로다
    expect(screen.getByRole('button', { name: `${F1.name} 받기` }).getAttribute('aria-busy')).toBeNull()
    await act(async () => wait.resolve())
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-8105.4: 실패면 안내 글 아래·표 위에 오류 카드 E-LIBRARY-DOWNLOAD-FAILED가 보인다', async () => {
    vi.mocked(downloadLibraryFile).mockRejectedValue(new LibraryError('E-LIBRARY-DOWNLOAD-FAILED'))
    show(false)
    const t = await table()
    fireEvent.click(screen.getByRole('button', { name: `${F1.name} 받기` }))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('파일을 받지 못했어요.')
    expect(card.textContent).toContain('오류 번호 E-LIBRARY-DOWNLOAD-FAILED')
    expect(before(screen.getByText(LEAD), card) && before(card, t) && before(card, chipGroup())).toBe(true)
    expect(screen.getByRole('button', { name: `${F1.name} 받기` }).getAttribute('aria-busy')).toBeNull()
  })
})

describe('AC-8105.5: 빈 자료실(관리자 아님)', () => {
  it('AC-8105.5: 표 안에 아직 올린 파일이 없어요 / 관리자가 파일을 올리면 여기에 보여요. 만 있고 파일 {n}개·칩·표 아래 줄이 없다', async () => {
    vi.mocked(listLibraryFiles).mockResolvedValue([])
    show(false)
    const t = await table()
    expect(bodyRows(t)).toHaveLength(1)
    const cell = bodyRows(t)[0]!.querySelector('td')!
    expect(cell.getAttribute('colspan')).toBe('5')
    expect(within(cell).getByText('아직 올린 파일이 없어요')).toBeTruthy()
    expect(within(cell).getByText('관리자가 파일을 올리면 여기에 보여요.')).toBeTruthy()
    expect(within(cell).queryByRole('button')).toBeNull()
    expect(screen.queryByText(/^파일 \d+개$/)).toBeNull()
    expect(screen.queryByRole('group', { name: '분류' })).toBeNull()
    expect(screen.queryByText(FOOT)).toBeNull()
    expect(screen.queryByRole('button', { name: '파일 올리기' })).toBeNull()
  })
})

describe('AC-8105.6: 읽는 중 · 읽기 실패 · [다시 읽기]', () => {
  it('AC-8105.6: 읽는 중에는 h1·안내 글만 있다(칩·표·파일 수·[파일 올리기] 없음)', async () => {
    vi.mocked(listLibraryFiles).mockReturnValue(new Promise(() => {}))
    show(true)
    expect(screen.getByRole('heading', { level: 1, name: '자료실' })).toBeTruthy()
    expect(screen.getByText(LEAD)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('group', { name: '분류' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/^파일 \d+개$/)).toBeNull()
  })

  it('AC-8105.6: 실패면 오류 카드 E-LIBRARY-READ-FAILED(폭 640px까지)와 [다시 읽기]만 있고, 다시 읽기가 되면 표와 짧은 알림 다시 읽었어요. 가 뜬다', async () => {
    vi.mocked(listLibraryFiles).mockRejectedValueOnce(new LibraryError('E-LIBRARY-READ-FAILED'))
    show(true)
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('자료실 목록을 읽지 못했어요.')
    expect(card.textContent).toContain('인터넷 연결을 확인하고 [다시 읽기]를 눌러 보세요. 계속되면 오류 번호와 함께 알려 주세요.')
    expect(card.textContent).toContain('오류 번호 E-LIBRARY-READ-FAILED')
    expect(card.parentElement?.className).toContain('max-w-160')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('group', { name: '분류' })).toBeNull()
    expect(screen.queryByRole('button', { name: '파일 올리기' })).toBeNull()
    expect(screen.queryByText(/^파일 \d+개$/)).toBeNull()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['다시 읽기'])
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(await table()).toBeTruthy()
    expect(await screen.findByText('다시 읽었어요.')).toBeTruthy()
    expect(listLibraryFiles).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-8105.6: 다시 읽기도 실패하면 실패 카드가 그대로이고 다시 읽었어요. 는 없다', async () => {
    vi.mocked(listLibraryFiles).mockRejectedValue(new LibraryError('E-LIBRARY-READ-FAILED'))
    show(false)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(await screen.findByRole('button', { name: '다시 읽기' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('E-LIBRARY-READ-FAILED')
    expect(screen.queryByText('다시 읽었어요.')).toBeNull()
  })
})

describe('AC-8105.7: 관리자 아님 · 보는 중 — 쓰기 단추 없음', () => {
  it.each<[string, boolean, Viewing | null]>([
    ['관리자가 아닌 원장·데스크', false, null],
    ['다른 의원을 보는 중인 관리자', true, VIEWING],
  ])('AC-8105.7: %s는 [파일 올리기]·[지우기]·표 아래 줄이 없고 [받기]는 그대로다', async (_who, isAdmin, viewing) => {
    show(isAdmin, viewing)
    const t = await table()
    expect(screen.queryByRole('button', { name: '파일 올리기' })).toBeNull()
    expect(screen.queryAllByRole('button', { name: /지우기$/ })).toEqual([])
    expect(screen.queryByText(FOOT)).toBeNull()
    expect(within(t).getAllByRole('button', { name: /받기$/ })).toHaveLength(6)
    fireEvent.click(within(t).getByRole('button', { name: '옛 판 2개 보기' }))
    expect(within(t).getAllByRole('button', { name: /받기$/ })).toHaveLength(8)
    expect(within(t).queryAllByRole('button', { name: /지우기$/ })).toEqual([])
  })

  it('AC-8105.7: 보는 중인 관리자의 빈 자료실 글은 관리자 아닌 사람의 글이다', async () => {
    vi.mocked(listLibraryFiles).mockResolvedValue([])
    show(true, VIEWING)
    const t = await table()
    expect(within(t).getByText('관리자가 파일을 올리면 여기에 보여요.')).toBeTruthy()
    expect(within(t).queryByText(/첫 파일을 올려 보세요/)).toBeNull()
    expect(screen.queryByRole('button', { name: '파일 올리기' })).toBeNull()
  })

  it('AC-8105.7: 보는 중에도 [받기]는 downloadLibraryFile을 부른다', async () => {
    show(true, VIEWING)
    await table()
    fireEvent.click(screen.getByRole('button', { name: `${F2.name} 받기` }))
    expect(downloadLibraryFile).toHaveBeenCalledWith(F2)
    expect(uploadLibraryFile).not.toHaveBeenCalled()
    expect(deleteLibraryFile).not.toHaveBeenCalled()
  })
})

describe('AC-8106.1: 관리자(보는 중 아님) 화면', () => {
  it('AC-8106.1: 오른쪽 위 [파일 올리기](주 단추)와 줄마다 [지우기](빨간 글자), 표 아래 줄이 있다', async () => {
    show(true)
    const t = await table()
    const upload = screen.getByRole('button', { name: '파일 올리기' })
    expect(upload.className).toContain('bg-accent')
    expect(upload.querySelector('svg')).not.toBeNull()
    // 머리 줄(h1과 같은 줄) 안, 안내 글보다 앞
    expect(before(upload, screen.getByText(LEAD))).toBe(true)
    const del = within(t).getByRole('button', { name: `${F1.name} 지우기` })
    expect(del.textContent).toBe('지우기')
    expect(del.className).toContain('text-negative')
    expect(within(t).getAllByRole('button', { name: /지우기$/ })).toHaveLength(6)
    const foot = screen.getByText(FOOT)
    expect(before(t, foot)).toBe(true)
  })

  it('AC-8106.1: 빈 자료실이면 표 안 글이 관리자 글 + [파일 올리기]이고 표 아래 줄은 없다', async () => {
    vi.mocked(listLibraryFiles).mockResolvedValue([])
    show(true)
    const t = await table()
    const cell = bodyRows(t)[0]!.querySelector('td')!
    expect(within(cell).getByText('아직 올린 파일이 없어요')).toBeTruthy()
    expect(within(cell).getByText('[파일 올리기]로 첫 파일을 올려 보세요. 올린 파일은 모든 의원이 여기서 받아요.')).toBeTruthy()
    const inside = within(cell).getByRole('button', { name: '파일 올리기' })
    expect(inside.className).toContain('bg-accent')
    expect(within(cell).queryByText('관리자가 파일을 올리면 여기에 보여요.')).toBeNull()
    expect(screen.queryByText(FOOT)).toBeNull()
    fireEvent.click(inside)
    expect(screen.getByRole('dialog', { name: '파일 올리기' })).toBeTruthy()
  })

  it('AC-8106.1: 판 번호 없는 파일만 있으면 최신 칩·접기 줄이 없다', async () => {
    vi.mocked(listLibraryFiles).mockResolvedValue([libraryFile('n1', '안내.pdf', 'guide', 2048, '2026-11-25T00:00:00Z')])
    show(true)
    const t = await table()
    expect(rowNames(t)).toEqual(['안내.pdf'])
    expect(screen.getByText('파일 1개')).toBeTruthy()
  })
})
