// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryFile } from '@/lib/library/files'
import { LibraryError, LibraryStopped, listLibraryFiles, uploadLibraryFile, type UploadOptions } from '@/lib/storage/library'
import { LibraryScreen } from './LibraryScreen'
import { deferred, F3, FILES, H133, H140, HELPER_DESC, libraryFile, MB, pickFile } from './library.test.data'

// 자료실 올리기 창 (spec library REQ-8106 AC-8106.2~AC-8106.8, design.md '화면' UploadDialog, 승인 시안 ?s=upload·uploading·too-big·done).
// 관리자 화면에서 [파일 올리기]로 연다. 저장 함수(lib/storage/library)는 흉내다: 진행률(onProgress)·멈춤(signal → LibraryStopped)·실패 번호를 흉내 낸다.
// 고른 파일 검사·분류 짐작·크기 글자는 진짜 lib/library/files를 쓴다. 파일 이름·크기는 모두 지어낸 것이다

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ fake: 'client' }) }))
vi.mock('@/lib/storage/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/library')>()),
  listLibraryFiles: vi.fn(),
  downloadLibraryFile: vi.fn(),
  uploadLibraryFile: vi.fn(),
  deleteLibraryFile: vi.fn(),
}))

const HELP = '어떤 파일이든 돼요. 한 파일에 50MB까지.'
const NAME_HELP = '자료실 목록에 보이는 이름이에요. 파일을 고르면 파일 이름으로 채워지고, 고쳐도 돼요.'
const HELPER_ZIP = 'precheck-helper-0.14.0.zip'
const HELPER_SIZE = 1_258_291 // 1.2MB

beforeEach(() => {
  vi.mocked(listLibraryFiles).mockResolvedValue(FILES)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function openUpload() {
  render(<LibraryScreen isAdmin />)
  await screen.findByRole('table', { name: '자료실 파일' })
  fireEvent.click(screen.getByRole('button', { name: '파일 올리기' }))
  return screen.getByRole('dialog', { name: '파일 올리기' })
}
const nameBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: '이름' }) as HTMLInputElement
const descBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: /^설명 한 줄/ }) as HTMLInputElement
const options = (d: HTMLElement) => within(within(d).getByRole('group', { name: '분류' })).getAllByRole('button')
const option = (d: HTMLElement, label: string) => within(within(d).getByRole('group', { name: '분류' })).getByRole('button', { name: label })
const sendButton = (d: HTMLElement) => within(d).getByRole('button', { name: /^(올리기|올리는 중…)$/ }) as HTMLButtonElement
const pickButton = (d: HTMLElement) => within(d).getByRole('button', { name: '파일 고르기' }) as HTMLButtonElement
const scrim = () => document.querySelector<HTMLElement>('[data-scrim]')!
const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

/** 올리기 흉내: 끝나지 않고, 진행률 함수와 멈춤 신호를 잡아 둔다. 멈추면 LibraryStopped */
function holdUpload() {
  const held: { options?: UploadOptions; input?: Parameters<typeof uploadLibraryFile>[0]; finish?: (file: LibraryFile) => void; fail?: (e: unknown) => void } = {}
  vi.mocked(uploadLibraryFile).mockImplementation(
    (input, opts) =>
      new Promise<LibraryFile>((resolve, reject) => {
        held.input = input
        held.options = opts
        held.finish = resolve
        held.fail = reject
        opts?.signal?.addEventListener('abort', () => reject(new LibraryStopped()))
      }),
  )
  return held
}

describe('AC-8106.2: 창 열기 · 파일 고르기', () => {
  it('AC-8106.2: 창(제목 파일 올리기)이 열리고 초점은 [파일 고르기], 고르기 전에는 아직 고른 파일이 없어요. 이고 칸들과 [올리기]가 눌리지 않는다', async () => {
    const d = await openUpload()
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(within(d).getByRole('heading', { level: 2, name: '파일 올리기' })).toBeTruthy()
    expect(document.activeElement).toBe(pickButton(d))
    expect(within(d).getByText('아직 고른 파일이 없어요.')).toBeTruthy()
    expect(within(d).getByText(HELP)).toBeTruthy()
    expect(within(d).getByText(NAME_HELP)).toBeTruthy()
    expect(nameBox(d).disabled).toBe(true)
    expect(descBox(d).disabled).toBe(true)
    expect(options(d).map((b) => [b.textContent, (b as HTMLButtonElement).disabled, b.getAttribute('aria-pressed')])).toEqual([
      ['설치 파일', true, 'false'],
      ['설명서', true, 'false'],
      ['그 밖', true, 'false'],
    ])
    expect(sendButton(d).disabled).toBe(true)
    expect(sendButton(d).textContent).toBe('올리기')
    expect(within(d).getByRole('button', { name: '취소' })).toBeTruthy()
  })

  it('AC-8106.2: 파일 칸은 형식 제한이 없고(accept 없음), 고르면 {파일 이름} · {크기}가 보이며 이름 = 파일 이름, 분류 = 짐작한 분류가 눌린 채 열린다', async () => {
    const d = await openUpload()
    const input = d.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.hasAttribute('accept')).toBe(false)
    expect(input.multiple).toBe(false)
    pickFile(HELPER_ZIP, HELPER_SIZE, 'application/zip')
    expect(within(d).queryByText('아직 고른 파일이 없어요.')).toBeNull()
    expect(within(d).getByText(HELPER_ZIP)).toBeTruthy()
    const size = within(d).getByText('· 1.2MB')
    expect(size.className).not.toContain('text-negative')
    expect(nameBox(d).value).toBe(HELPER_ZIP)
    expect(nameBox(d).disabled).toBe(false)
    expect(descBox(d).disabled).toBe(false)
    expect(options(d).map((b) => [b.textContent, (b as HTMLButtonElement).disabled, b.getAttribute('aria-pressed')])).toEqual([
      ['설치 파일', false, 'true'],
      ['설명서', false, 'false'],
      ['그 밖', false, 'false'],
    ])
    expect(sendButton(d).disabled).toBe(false)
    expect(within(d).getByText(HELP)).toBeTruthy()
  })

  it.each([
    ['마감일지_쓰는법.pdf', '설명서'],
    ['안내문.HWPX', '설명서'],
    ['수납일지_새양식.xlsx', '그 밖'], // 자료실에 없는 이름(수납일지_샘플.xlsx는 이미 있어 FILE-EXISTS로 잠긴다)
    ['README', '그 밖'],
    ['setup.EXE', '설치 파일'],
  ])('AC-8106.2: %s를 고르면 분류 %s가 눌린다(바꿀 수 있다)', async (fileName, label) => {
    const d = await openUpload()
    pickFile(fileName, 2 * MB)
    expect(option(d, label).getAttribute('aria-pressed')).toBe('true')
    const other = label === '그 밖' ? '설명서' : '그 밖'
    fireEvent.click(option(d, other))
    expect(option(d, other).getAttribute('aria-pressed')).toBe('true')
    expect(option(d, label).getAttribute('aria-pressed')).toBe('false')
  })

  it('AC-8106.2: 이름은 고칠 수 있고(200자까지), 설명은 60자까지만 들어간다', async () => {
    const d = await openUpload()
    pickFile(HELPER_ZIP, HELPER_SIZE)
    expect(nameBox(d).maxLength).toBe(200)
    expect(descBox(d).maxLength).toBe(60)
    expect(descBox(d).placeholder).toBe('예) 청구 도우미 · 비트 자료를 읽는 PC 프로그램')
    fireEvent.change(nameBox(d), { target: { value: '청구 도우미 새 판' } })
    expect(nameBox(d).value).toBe('청구 도우미 새 판')
    expect(within(d).getByText('선택 · 60자까지')).toBeTruthy()
  })

  it('AC-8106.2: 다른 파일을 다시 고르면 이름이 새 파일 이름으로 바뀌고 설명은 그대로다', async () => {
    const d = await openUpload()
    pickFile(HELPER_ZIP, HELPER_SIZE)
    fireEvent.change(descBox(d), { target: { value: HELPER_DESC } })
    pickFile('마감일지_쓰는법.pdf', 1.6 * MB)
    expect(nameBox(d).value).toBe('마감일지_쓰는법.pdf')
    expect(descBox(d).value).toBe(HELPER_DESC)
    expect(within(d).getByText('· 1.6MB')).toBeTruthy()
  })
})

describe('AC-8106.3: 고른 파일 검사(올리기 전)', () => {
  it('AC-8106.3: 50MB 넘는 파일은 도움 글 자리에 E-LIBRARY-FILE-SIZE 카드, 크기는 빨간 굵은 글자, 이름 칸은 비고 칸들과 [올리기]가 눌리지 않는다', async () => {
    const d = await openUpload()
    pickFile('비트_사진_모음.zip', 66_479_718)
    const card = within(d).getByRole('alert')
    expect(card.textContent).toContain('파일이 너무 커요.')
    expect(card.textContent).toContain('한 파일에 50MB까지 올릴 수 있어요. 나눠서 압축하거나 더 작은 파일을 고르세요.')
    expect(card.textContent).toContain('오류 번호 E-LIBRARY-FILE-SIZE')
    expect(within(d).queryByText(HELP)).toBeNull()
    const size = within(d).getByText('· 63.4MB')
    expect(size.className).toContain('text-negative')
    expect(size.className).toContain('font-semibold')
    expect(nameBox(d).value).toBe('')
    expect(nameBox(d).disabled).toBe(true)
    expect(descBox(d).disabled).toBe(true)
    expect(options(d).every((b) => (b as HTMLButtonElement).disabled && b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(sendButton(d).disabled).toBe(true)
    fireEvent.click(sendButton(d))
    expect(uploadLibraryFile).not.toHaveBeenCalled()
  })

  it('AC-8106.3: 꼭 50MB(52,428,800바이트)는 올릴 수 있다', async () => {
    const d = await openUpload()
    pickFile('딱맞음.zip', 52_428_800)
    expect(within(d).queryByRole('alert')).toBeNull()
    expect(sendButton(d).disabled).toBe(false)
  })

  it('AC-8106.3: 파일 이름이 200자를 넘으면 E-LIBRARY-FILE-NAME 카드이고 크기 글자는 빨갛지 않다', async () => {
    const d = await openUpload()
    const long = `${'가'.repeat(197)}.zip` // 201자
    pickFile(long, 2048)
    const card = within(d).getByRole('alert')
    expect(card.textContent).toContain('파일 이름이 너무 길어요.')
    expect(card.textContent).toContain('오류 번호 E-LIBRARY-FILE-NAME')
    expect(within(d).getByText('· 2KB').className).not.toContain('text-negative')
    expect(nameBox(d).value).toBe('')
    expect(sendButton(d).disabled).toBe(true)
  })

  it('AC-8106.3: 같은 파일 이름이 자료실에 있으면 E-LIBRARY-FILE-EXISTS 카드이고, 다른 파일을 고르면 사라진다', async () => {
    const d = await openUpload()
    pickFile(H133.fileName, H133.size)
    const card = within(d).getByRole('alert')
    expect(card.textContent).toContain('같은 이름의 파일이 이미 있어요.')
    expect(card.textContent).toContain('오류 번호 E-LIBRARY-FILE-EXISTS')
    expect(nameBox(d).value).toBe('')
    expect(nameBox(d).disabled).toBe(true)
    pickFile(HELPER_ZIP, HELPER_SIZE)
    expect(within(d).queryByRole('alert')).toBeNull()
    expect(within(d).getByText(HELP)).toBeTruthy()
    expect(nameBox(d).value).toBe(HELPER_ZIP)
    expect(sendButton(d).disabled).toBe(false)
    expect(uploadLibraryFile).not.toHaveBeenCalled()
    expect(listLibraryFiles).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8106.4: 이름을 비우고 [올리기]', () => {
  it.each(['', '   '])('AC-8106.4: 이름 칸이 %j이면 올리지 않고 이름을 적어 주세요. · aria-invalid · 초점은 이름 칸', async (value) => {
    const d = await openUpload()
    pickFile(HELPER_ZIP, HELPER_SIZE)
    fireEvent.change(nameBox(d), { target: { value } })
    fireEvent.click(sendButton(d))
    expect(uploadLibraryFile).not.toHaveBeenCalled()
    expect(within(d).getByText('이름을 적어 주세요.')).toBeTruthy()
    expect(within(d).queryByText(NAME_HELP)).toBeNull()
    expect(nameBox(d).getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(nameBox(d))
    // 이름을 적고 다시 누르면 올린다
    holdUpload()
    fireEvent.change(nameBox(d), { target: { value: '도우미' } })
    fireEvent.click(sendButton(d))
    expect(uploadLibraryFile).toHaveBeenCalledTimes(1)
    expect(within(d).queryByText('이름을 적어 주세요.')).toBeNull()
    expect(nameBox(d).getAttribute('aria-invalid')).toBeNull()
  })
})

describe('AC-8106.5: 올리는 중', () => {
  it('AC-8106.5: 고른 파일·적은 이름·분류·설명으로 uploadLibraryFile을 부르고, 진행률이 오면 올리는 중… {pct}% · {보낸} / {전체} · 막대 · 안내가 보이며 칸이 잠긴다', async () => {
    const held = holdUpload()
    const d = await openUpload()
    const file = pickFile(HELPER_ZIP, HELPER_SIZE, 'application/zip')
    fireEvent.change(descBox(d), { target: { value: HELPER_DESC } })
    fireEvent.click(sendButton(d))
    expect(uploadLibraryFile).toHaveBeenCalledTimes(1)
    expect(held.input).toEqual({ file, name: HELPER_ZIP, category: 'install', description: HELPER_DESC })
    expect(typeof held.options?.onProgress).toBe('function')
    expect(held.options?.signal).toBeInstanceOf(AbortSignal)
    expect(within(d).getByText('올리는 중… 0%')).toBeTruthy()
    expect(within(d).getByText('0.0MB / 1.2MB')).toBeTruthy()
    act(() => held.options!.onProgress!(734_003, HELPER_SIZE))
    expect(within(d).getByText('올리는 중… 58%')).toBeTruthy()
    expect(within(d).getByText('0.7MB / 1.2MB')).toBeTruthy()
    expect(within(d).getByText('다 올라갈 때까지 이 창을 열어 두세요.')).toBeTruthy()
    const bar = d.querySelector<HTMLElement>('[data-bar]')!
    expect(bar.style.width).toBe('58%')
    // 칸·[파일 고르기] 잠김, [올리기]는 올리는 중…(aria-busy), 분류는 하나도 눌린 모양이 아니다
    expect(nameBox(d).disabled).toBe(true)
    expect(descBox(d).disabled).toBe(true)
    expect(pickButton(d).disabled).toBe(true)
    expect(options(d).every((b) => (b as HTMLButtonElement).disabled && b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(sendButton(d).textContent).toBe('올리는 중…')
    expect(sendButton(d).getAttribute('aria-busy')).toBe('true')
    // 다시 눌러도 또 부르지 않는다
    fireEvent.click(sendButton(d))
    expect(uploadLibraryFile).toHaveBeenCalledTimes(1)
    // 진행 상자는 단추 줄 위
    expect(before(within(d).getByText('다 올라갈 때까지 이 창을 열어 두세요.'), sendButton(d))).toBe(true)
  })

  it('AC-8106.5: 올리는 중에는 바깥 누름·Esc로 닫히지 않는다', async () => {
    holdUpload()
    const d = await openUpload()
    pickFile(HELPER_ZIP, HELPER_SIZE)
    fireEvent.click(sendButton(d))
    fireEvent.click(scrim())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '파일 올리기' })).toBeTruthy()
  })

  it('AC-8106.5: [취소]를 누르면 멈추고(signal) 적은 값 그대로 창에 남으며 짧은 알림이 뜬다', async () => {
    const held = holdUpload()
    const d = await openUpload()
    pickFile('마감일지_쓰는법.pdf', 1.6 * MB)
    fireEvent.change(nameBox(d), { target: { value: '마감일지 쓰는 법' } })
    fireEvent.change(descBox(d), { target: { value: '사진 열두 장' } })
    fireEvent.click(sendButton(d))
    await act(async () => fireEvent.click(within(d).getByRole('button', { name: '취소' })))
    expect(held.options?.signal?.aborted).toBe(true)
    expect(await screen.findByText('올리기를 멈췄어요. 아무것도 올라가지 않았어요.')).toBeTruthy()
    const again = screen.getByRole('dialog', { name: '파일 올리기' })
    expect(nameBox(again).value).toBe('마감일지 쓰는 법')
    expect(descBox(again).value).toBe('사진 열두 장')
    expect(option(again, '설명서').getAttribute('aria-pressed')).toBe('true')
    expect(nameBox(again).disabled).toBe(false)
    expect(sendButton(again).textContent).toBe('올리기')
    expect(sendButton(again).getAttribute('aria-busy')).toBeNull()
    expect(within(again).queryByText(/올리는 중… /)).toBeNull()
    expect(within(again).queryByRole('alert')).toBeNull()
    expect(listLibraryFiles).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8106.6: 올리기 성공', () => {
  it('AC-8106.6: 창이 닫히고 칩이 전체로, 목록을 다시 읽고(그동안 지금 표 그대로), 초록 상자 + 받기 단추 줄, 새 줄은 옅은 파랑이다', async () => {
    const held = holdUpload()
    const second = deferred<LibraryFile[]>()
    vi.mocked(listLibraryFiles).mockResolvedValueOnce(FILES).mockReturnValueOnce(second.promise)
    render(<LibraryScreen isAdmin />)
    const t = await screen.findByRole('table', { name: '자료실 파일' })
    fireEvent.click(within(screen.getByRole('group', { name: '분류' })).getByRole('button', { name: /^설명서/ }))
    fireEvent.click(screen.getByRole('button', { name: '파일 올리기' }))
    const d = screen.getByRole('dialog', { name: '파일 올리기' })
    pickFile(HELPER_ZIP, HELPER_SIZE)
    fireEvent.click(sendButton(d))
    await act(async () => held.finish!(H140))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(listLibraryFiles).toHaveBeenCalledTimes(2)
    const chips = screen.getByRole('group', { name: '분류' })
    expect(within(chips).getByRole('button', { name: /^전체/ }).getAttribute('aria-pressed')).toBe('true')
    // 다시 읽는 동안 지금 표(시안 여덟)가 그대로 있다
    expect(screen.getByRole('table', { name: '자료실 파일' })).toBe(t)
    expect(screen.getByText('파일 8개')).toBeTruthy()
    const box = screen.getByText(`${HELPER_ZIP} 파일을 올렸어요`).parentElement!.parentElement!
    expect(box.className).toContain('bg-positive-soft')
    expect(within(box).getByText('이제 모든 의원이 받을 수 있어요. 비트 PC 연결 화면의 [도우미 내려받기]도 이 판을 줘요.')).toBeTruthy()
    expect(before(box, chips)).toBe(true)
    expect(before(screen.getByText('의원 PC에 깔 파일과 설명서를 여기서 받아요.'), box)).toBe(true)
    await act(async () => second.resolve([...FILES, H140]))
    expect(screen.getByText('파일 9개')).toBeTruthy()
    const fresh = within(t).getByText(H140.name).closest('tr')!
    expect(fresh.className).toContain('bg-accent-soft')
    expect(within(fresh).getByText('최신')).toBeTruthy()
    expect(within(t).getByRole('button', { name: '옛 판 3개 보기' })).toBeTruthy()
    // [파일 올리기]를 다시 누르면 상자와 파랑 바탕이 사라진다
    fireEvent.click(screen.getByRole('button', { name: '파일 올리기' }))
    expect(screen.queryByText(`${HELPER_ZIP} 파일을 올렸어요`)).toBeNull()
    expect(within(t).getByText(H140.name).closest('tr')!.className).not.toContain('bg-accent-soft')
  })

  it.each<[string, LibraryFile]>([
    ['더 낮은 옛 판', libraryFile('h100', 'precheck-helper-0.10.0.zip', 'install', 900_000, '2026-11-25T01:40:00Z')],
    ['판 번호 없는 파일', libraryFile('g1', '마감일지_쓰는법.pdf', 'guide', 1_677_722, '2026-11-25T01:40:00Z')],
  ])('AC-8106.6: %s를 올리면 둘째 줄은 일반 줄(이제 모든 의원이 자료실에서 받을 수 있어요.)이다', async (_what, uploaded) => {
    const held = holdUpload()
    const d = await openUpload()
    pickFile(uploaded.fileName, uploaded.size)
    fireEvent.click(sendButton(d))
    await act(async () => held.finish!(uploaded))
    expect(screen.getByText(`${uploaded.fileName} 파일을 올렸어요`)).toBeTruthy()
    expect(screen.getByText('이제 모든 의원이 자료실에서 받을 수 있어요.')).toBeTruthy()
    expect(screen.queryByText(/내려받기\]도 이 판을 줘요/)).toBeNull()
  })

  it('AC-8106.6: 처음 올리는 확장 판이면 둘째 줄이 [확장 내려받기]다', async () => {
    vi.mocked(listLibraryFiles).mockResolvedValue([F3])
    const held = holdUpload()
    const d = await openUpload()
    const ext = libraryFile('e050', 'precheck-extension-0.5.0.zip', 'install', 9000, '2026-11-25T01:40:00Z')
    pickFile(ext.fileName, ext.size)
    fireEvent.click(sendButton(d))
    await act(async () => held.finish!(ext))
    expect(screen.getByText('이제 모든 의원이 받을 수 있어요. 비트 PC 연결 화면의 [확장 내려받기]도 이 판을 줘요.')).toBeTruthy()
  })

  it('AC-8106.6: 올린 뒤 다시 읽기가 실패하면 실패 카드다', async () => {
    const held = holdUpload()
    vi.mocked(listLibraryFiles).mockResolvedValueOnce(FILES).mockRejectedValueOnce(new LibraryError('E-LIBRARY-READ-FAILED'))
    const d = await openUpload()
    pickFile(HELPER_ZIP, HELPER_SIZE)
    fireEvent.click(sendButton(d))
    await act(async () => held.finish!(H140))
    expect((await screen.findByRole('alert')).textContent).toContain('E-LIBRARY-READ-FAILED')
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('AC-8106.7: 올리기 실패', () => {
  it.each(['E-LIBRARY-FILE-EXISTS', 'E-LIBRARY-UPLOAD-FAILED', 'E-LIBRARY-FILE-SIZE', 'E-LIBRARY-FILE-NAME'] as const)(
    'AC-8106.7: %s면 창 안 단추 줄 위에 그 번호 카드가 보이고 칸은 적은 값 그대로 다시 열린다',
    async (code) => {
      vi.mocked(uploadLibraryFile).mockRejectedValue(new LibraryError(code))
      const d = await openUpload()
      pickFile(HELPER_ZIP, HELPER_SIZE)
      fireEvent.change(nameBox(d), { target: { value: '청구 도우미' } })
      fireEvent.change(descBox(d), { target: { value: HELPER_DESC } })
      await act(async () => fireEvent.click(sendButton(d)))
      const card = within(d).getByRole('alert')
      expect(card.textContent).toContain(`오류 번호 ${code}`)
      expect(before(card, sendButton(d))).toBe(true)
      expect(before(descBox(d), card)).toBe(true)
      expect(nameBox(d).value).toBe('청구 도우미')
      expect(nameBox(d).disabled).toBe(false)
      expect(descBox(d).value).toBe(HELPER_DESC)
      expect(option(d, '설치 파일').getAttribute('aria-pressed')).toBe('true')
      expect(sendButton(d).textContent).toBe('올리기')
      expect(sendButton(d).disabled).toBe(false)
      expect(screen.getByRole('dialog', { name: '파일 올리기' })).toBe(d)
      expect(listLibraryFiles).toHaveBeenCalledTimes(1)
    },
  )

  it('AC-8106.7: 번호 없는 실패(던진 값이 LibraryError가 아님)는 E-LIBRARY-UPLOAD-FAILED다', async () => {
    vi.mocked(uploadLibraryFile).mockRejectedValue(new Error('boom'))
    const d = await openUpload()
    pickFile(HELPER_ZIP, HELPER_SIZE)
    await act(async () => fireEvent.click(sendButton(d)))
    expect(within(d).getByRole('alert').textContent).toContain('오류 번호 E-LIBRARY-UPLOAD-FAILED')
    expect(within(d).getByRole('alert').textContent).not.toContain('boom')
  })
})

describe('AC-8106.8: 올리는 중이 아닌 창 닫기', () => {
  it.each<[string, () => void]>([
    ['[취소]', () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))],
    ['바깥 누름', () => fireEvent.click(scrim())],
    ['Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('AC-8106.8: %s면 올리지 않고 닫힌다', async (_how, close) => {
    await openUpload()
    pickFile(HELPER_ZIP, HELPER_SIZE)
    close()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(uploadLibraryFile).not.toHaveBeenCalled()
    expect(screen.queryByText('올리기를 멈췄어요. 아무것도 올라가지 않았어요.')).toBeNull()
  })

  it('AC-8106.8: 닫으면 초점은 연 단추([파일 올리기])로 돌아간다', async () => {
    render(<LibraryScreen isAdmin />)
    await screen.findByRole('table', { name: '자료실 파일' })
    const opener = screen.getByRole('button', { name: '파일 올리기' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
  })
})
