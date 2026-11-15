// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { base64ToBytes, jpegDataUrl, readBackground } from '@/lib/forms/backgroundImage'
import { downloadPosterPng } from '@/lib/forms/png'
import { deleteBackground, listBackgrounds, readBackgroundImage, saveBackground } from '@/lib/storage/formBackgrounds'
import { insertNotice, listNotices, updateNotice } from '@/lib/storage/formNotices'
import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'
import type { SavedBackground } from '@/types/formBackground'
import type { SavedNotice } from '@/types/forms'
import { FormsScreen } from './FormsScreen'

// 휴진 안내 '배경' 칸(ThemePicker·useBackgrounds)과 서식 화면 잇기 (spec forms-themes TASK-14, REQ-4610~4612, design.md 10절,
// 승인 시안 docs/mockups/forms-themes/screen.html). FormsScreen을 통째로 그려 본다.
// 가짜: fetch(AI 배경 경로)·안내문 저장(formNotices)·내 배경 저장(formBackgrounds)·readBackground·downloadPosterPng·confirm·print.
// 나머지(배경 칸 상태·고른 그림 값·안내문 그림·base64ToBytes·jpegDataUrl)는 진짜를 지난다. 오늘은 prop으로 2026-11-10(한국 날짜)

vi.mock('@/lib/storage/formNotices', () => ({
  listNotices: vi.fn(),
  insertNotice: vi.fn(),
  updateNotice: vi.fn(),
  deleteNotice: vi.fn(),
}))
vi.mock('@/lib/storage/formBackgrounds', () => ({
  listBackgrounds: vi.fn(),
  saveBackground: vi.fn(),
  readBackgroundImage: vi.fn(),
  deleteBackground: vi.fn(),
}))
vi.mock('@/lib/forms/backgroundImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/backgroundImage')>()),
  readBackground: vi.fn(),
}))
vi.mock('@/lib/forms/png', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/png')>()),
  downloadPosterPng: vi.fn(),
}))

const TODAY = '2026-11-10'
const BG_PATH = '/api/ai/forms/background'
const HOSPITAL = '11111111-1111-4111-8111-111111111111'
const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ID_NEW = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ID_GONE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const saved = (id: string, words: string, accent: string, thumb: string, createdAt: string): SavedBackground => ({
  id,
  words,
  accent,
  thumb,
  path: `${HOSPITAL}/${id}.jpg`,
  createdAt,
})
const WINTER = saved(ID_A, '겨울 눈 덮인 숲', '#2e5e9e', '/9j/AAAA', '2026-11-13T01:00:00.000Z')
const CHUSEOK = saved(ID_B, '추석 보름달', '#c8501e', '/9j/BBBB', '2026-11-14T01:00:00.000Z')
const LIST = [CHUSEOK, WINTER] // 최근 것부터(listBackgrounds가 그 차례로 준다)

// AI 경로 답(그림 base64)과 앱이 읽은 결과(readBackground 가짜)
const JPEG = '/9j/4AAQ'
const TRIAL = { image: 'data:image/jpeg;base64,/9j/TRIAL1==', accent: '#c2456e', thumb: '/9j/TTTT' }
const TRIAL2 = { image: 'data:image/jpeg;base64,/9j/TRIAL2==', accent: '#3f9142', thumb: '/9j/UUUU' }
// 내려받은 큰 그림(readBackgroundImage 가짜)
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe1])

const AUG: SavedNotice = {
  id: 'aug',
  year: 2026,
  month: 8,
  cards: [
    { start: '2026-08-15', end: null, name: '광복절', status: '휴진' },
    { start: '2026-08-17', end: null, name: '대체공휴일', status: '휴진' },
  ],
  theme: null,
  updatedAt: '2026-08-03T01:00:00.000Z',
}
const LIB: SavedNotice = {
  id: 'lib',
  year: 2025,
  month: 8,
  cards: [{ start: '2025-08-15', end: null, name: '광복절', status: '휴진' }],
  theme: 'liberation',
  updatedAt: '2025-08-01T01:00:00.000Z',
}
const DEC: SavedNotice = {
  id: 'dec',
  year: 2026,
  month: 12,
  cards: [
    { start: '2026-12-24', end: null, name: '학회', status: '휴진' },
    { start: '2026-12-25', end: null, name: '성탄절', status: '휴진' },
  ],
  theme: `bg-${ID_A}`,
  updatedAt: '2026-11-09T01:00:00.000Z',
}
const JUN: SavedNotice = {
  id: 'jun',
  year: 2026,
  month: 6,
  cards: [{ start: '2026-06-06', end: null, name: '현충일', status: '휴진' }],
  theme: `bg-${ID_GONE}`,
  updatedAt: '2026-05-28T01:00:00.000Z',
}

const fetchSpy = vi.fn<typeof fetch>()
const confirmSpy = vi.fn<(message?: string) => boolean>()
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  vi.mocked(listNotices).mockResolvedValue([AUG])
  vi.mocked(insertNotice).mockImplementation(async (n) => ({ ...n, id: 'may', updatedAt: '2026-11-10T06:00:00.000Z' }))
  vi.mocked(updateNotice).mockImplementation(async (id, n) => ({ ...n, id, updatedAt: '2026-11-10T07:00:00.000Z' }))
  vi.mocked(listBackgrounds).mockResolvedValue(LIST)
  vi.mocked(saveBackground).mockResolvedValue(saved(ID_NEW, '봄 벚꽃', TRIAL.accent, TRIAL.thumb, '2026-11-15T01:00:00.000Z'))
  vi.mocked(readBackgroundImage).mockResolvedValue(BYTES)
  vi.mocked(deleteBackground).mockResolvedValue(true)
  vi.mocked(readBackground).mockResolvedValue(TRIAL)
  vi.mocked(downloadPosterPng).mockResolvedValue(true)
  fetchSpy.mockImplementation(async () => json({ image: JPEG })) // 답 몸통은 한 번만 읽힌다 — 부를 때마다 새로 만든다
  vi.stubGlobal('fetch', fetchSpy)
  window.print = vi.fn()
  window.confirm = confirmSpy
  confirmSpy.mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function open(notices: SavedNotice[] = [AUG]) {
  vi.mocked(listNotices).mockResolvedValue(notices)
  const user = userEvent.setup()
  const view = render(<FormsScreen today={TODAY} />)
  await screen.findAllByRole('button', { name: /고침$/ })
  return { user, view }
}

// 카드 1에 어린이날(2027-05-05)을 적어 뽑기·저장 단추가 열리게 한다(저절로 테마 children)
async function readyScreen(notices: SavedNotice[] = [AUG]) {
  const opened = await open(notices)
  const card = screen.getByRole('group', { name: '카드 1' })
  fireEvent.change(within(card).getByLabelText('시작 날짜'), { target: { value: '2027-05-05' } })
  fireEvent.change(within(card).getByLabelText('이름'), { target: { value: '어린이날' } })
  return opened
}

const bgBox = () => screen.getByRole('region', { name: '배경' })
const kindGroup = () => within(bgBox()).getByRole('group', { name: '배경 종류' })
const kind = (name: '테마 그림' | '내 배경') => within(kindGroup()).getByRole('button', { name })
const artGroup = () => within(bgBox()).getByRole('group', { name: '그림' })
const art = (n: 1 | 2) => within(artGroup()).getByRole('button', { name: `그림 ${n}` })
const themeBox = () => screen.getByRole('combobox', { name: '테마' }) as HTMLSelectElement
const wordsBox = () => within(bgBox()).getByRole('textbox', { name: 'AI 배경 만들기' }) as HTMLInputElement
const makeButton = () => within(bgBox()).getByRole('button', { name: /^(AI로 배경 만들기|만드는 중…)$/ }) as HTMLButtonElement
const bgButton = (name: string) => within(bgBox()).getByRole('button', { name }) as HTMLButtonElement
const thumb = (item: SavedBackground) => bgButton(`${item.words} 배경`)
const thumbNames = () =>
  within(within(bgBox()).getByRole('list'))
    .getAllByRole('button')
    .map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])
const poster = () => within(screen.getByRole('region', { name: '미리보기' })).getByRole('img')
const printCopy = () => document.querySelector('[data-print-copy] svg')
const firstHref = (svg: Element | null) => svg?.querySelector('image')?.getAttribute('href')
const monthFill = (svg: Element | null) => svg?.querySelector('text')?.getAttribute('fill')
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const OUTPUTS = ['저장', '인쇄·PDF', '그림 파일']
const outputsDisabled = () => OUTPUTS.map((name) => button(name).disabled)
const bgCalls = () => fetchSpy.mock.calls.filter(([url]) => url === BG_PATH)
const sentText = (n: number) => JSON.parse(String(bgCalls()[n][1]?.body))

function expectError(code: ErrorCode) {
  const alert = within(bgBox())
    .queryAllByRole('alert')
    .find((el) => el.textContent?.includes(`오류 번호 ${code}`))
  expect(alert, code).toBeDefined()
  expect(alert?.textContent).toContain(errorInfo(code).what)
  expect(alert?.textContent).toContain(errorInfo(code).fix)
}

async function mine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(kind('내 배경'))
  await within(bgBox()).findByText(/^\d+\/30장$/)
}

async function makeTrial(user: ReturnType<typeof userEvent.setup>, words = '봄 벚꽃') {
  await mine(user)
  fireEvent.change(wordsBox(), { target: { value: words } })
  await user.click(makeButton())
  await within(bgBox()).findByText(`만든 배경: ${words}`)
}

async function choose(user: ReturnType<typeof userEvent.setup>, item: SavedBackground) {
  await user.click(thumb(item))
  await screen.findByText(`고른 배경: ${item.words}`)
}

describe('AC-4610.1: 배경 칸 — 테마 그림 1·2', () => {
  it('AC-4610.1: 만들기 맨 아래 배경 칸 제목 옆 배경 종류 [테마 그림](눌림)·[내 배경], 그 아래 테마 고르기(24개)·그림 [그림 1](눌림)·[그림 2]·도움말', async () => {
    await open()
    const editor = screen.getByRole('region', { name: '만들기' })
    expect(editor.lastElementChild).toBe(bgBox())
    expect(within(bgBox()).getByRole('heading', { level: 2, name: '배경' })).toBeTruthy()
    expect(within(kindGroup()).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['테마 그림', 'true'],
      ['내 배경', 'false'],
    ])
    expect(within(bgBox()).getByRole('combobox', { name: '테마' })).toBe(themeBox())
    expect(within(themeBox()).getAllByRole('option')).toHaveLength(24)
    expect(themeBox().value).toBe('auto')
    expect(within(artGroup()).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['그림 1', 'true'],
      ['그림 2', 'false'],
    ])
    expect(within(bgBox()).getByText('카드 이름에 공휴일 이름이 있으면 그 공휴일, 없으면 안내 달의 그림이 저절로 골라져요')).toBeTruthy()
    expect(firstHref(poster())).toBe('/poster/themes/m11.svg')
  })

  it('AC-4610.1: 지금 저장된 안내문(theme null·테마 열쇠)을 열면 [그림 1]이 눌려 있다', async () => {
    const { user } = await open([AUG, LIB])
    await user.click(screen.getByRole('button', { name: /^2025년 8월 · 광복절 / }))
    expect(themeBox().value).toBe('liberation')
    expect(art(1).getAttribute('aria-pressed')).toBe('true')
    expect(art(2).getAttribute('aria-pressed')).toBe('false')
    expect(firstHref(poster())).toBe('/poster/themes/liberation.svg')
    await user.click(screen.getByRole('button', { name: /^2026년 8월 · 광복절·대체공휴일 / }))
    expect(themeBox().value).toBe('auto')
    expect(art(1).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('AC-4610.2: 그림 2', () => {
  it('AC-4610.2: [그림 2]를 누르면 미리보기·인쇄 사본이 <열쇠>-2.svg, 저장 theme은 auto-2, 테마를 바꿔도 [그림 2]가 눌린 채 <열쇠>-2', async () => {
    const { user } = await readyScreen()
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
    await user.click(art(2))
    expect(art(2).getAttribute('aria-pressed')).toBe('true')
    expect(art(1).getAttribute('aria-pressed')).toBe('false')
    expect(firstHref(poster())).toBe('/poster/themes/children-2.svg')
    expect(firstHref(printCopy())).toBe('/poster/themes/children-2.svg')
    await user.click(button('저장'))
    expect(insertNotice).toHaveBeenCalledWith(expect.objectContaining({ theme: 'auto-2' }))
    await screen.findByText('저장됨')

    fireEvent.change(themeBox(), { target: { value: 'm05' } })
    expect(themeBox().value).toBe('m05')
    expect(art(2).getAttribute('aria-pressed')).toBe('true')
    expect(firstHref(poster())).toBe('/poster/themes/m05-2.svg')
    expect(firstHref(printCopy())).toBe('/poster/themes/m05-2.svg')
    await user.click(button('저장'))
    expect(updateNotice).toHaveBeenCalledWith('may', expect.objectContaining({ theme: 'm05-2' }))

    await user.click(art(1))
    expect(firstHref(poster())).toBe('/poster/themes/m05.svg')
    fireEvent.change(themeBox(), { target: { value: 'auto' } })
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
  })
})

describe('AC-4610.3: 지금 테마 고르기 그대로', () => {
  it('AC-4610.3: 테마 고르기는 이름 테마·저절로(지금: …)·옵션 24개 그대로이고, 서식 화면을 열 때는 내 배경을 읽지 않는다', async () => {
    await open()
    expect(themeBox().value).toBe('auto')
    expect(within(themeBox()).getByRole('option', { name: '저절로(지금: 11월)' })).toBeTruthy()
    expect(within(themeBox()).getAllByRole('group').map((g) => g.getAttribute('label'))).toEqual(['공휴일', '달마다'])
    expect(listBackgrounds).not.toHaveBeenCalled()
    expect(readBackgroundImage).not.toHaveBeenCalled()
    expect(bgCalls()).toHaveLength(0)
  })
})

describe('AC-4611.1: [내 배경] — AI 배경 만들기 칸', () => {
  it('AC-4611.1: [내 배경]을 누르면 테마 고르기·그림 단추 대신 만들기 칸·늘 보이는 안내·내 배경 목록이 보이고, 목록은 처음 한 번만 읽는다', async () => {
    const { user } = await open()
    await user.click(kind('내 배경'))
    expect(kind('내 배경').getAttribute('aria-pressed')).toBe('true')
    expect(kind('테마 그림').getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('combobox', { name: '테마' })).toBeNull()
    expect(within(bgBox()).queryByRole('group', { name: '그림' })).toBeNull()

    expect(wordsBox().getAttribute('maxlength')).toBe('30')
    expect(wordsBox().getAttribute('placeholder')).toBe('예) 봄 벚꽃')
    expect(within(bgBox()).getByText('0/30')).toBeTruthy()
    expect(makeButton().textContent).toBe('AI로 배경 만들기')
    expect(makeButton().disabled).toBe(true)
    expect(
      within(bgBox()).getByText('적은 말만 OpenAI 그림 AI로 보내요. 전화번호·주민번호·메일 주소는 적지 마세요. 한 장에 10초쯤 걸리고 약 80원이 들어요(하루 20장까지)'),
    ).toBeTruthy()
    expect(within(bgBox()).getByRole('heading', { level: 3, name: '내 배경' })).toBeTruthy()
    expect(await within(bgBox()).findByText('2/30장')).toBeTruthy()
    expect(listBackgrounds).toHaveBeenCalledTimes(1)

    await user.click(kind('테마 그림'))
    expect(themeBox()).toBeTruthy()
    await user.click(kind('내 배경'))
    expect(within(bgBox()).getByText('2/30장')).toBeTruthy()
    expect(listBackgrounds).toHaveBeenCalledTimes(1)
  })

  it('AC-4611.1: 글자 수 n/30이 보이고 30자까지만 들어가며, 비었거나 공백뿐이면 단추가 막힌다', async () => {
    const { user } = await open()
    await mine(user)
    await user.type(wordsBox(), '봄 벚꽃')
    expect(within(bgBox()).getByText('4/30')).toBeTruthy()
    expect(makeButton().disabled).toBe(false)
    fireEvent.change(wordsBox(), { target: { value: '   ' } })
    expect(makeButton().disabled).toBe(true)
    fireEvent.change(wordsBox(), { target: { value: '가'.repeat(31) } })
    expect(wordsBox().value).toBe('가'.repeat(30))
    expect(within(bgBox()).getByText('30/30')).toBeTruthy()
  })
})

describe('AC-4611.2: [AI로 배경 만들기]', () => {
  it.each([
    ['전화번호', '봄 010-1234-5678'],
    ['메일', '봄 a@b.co'],
    ['탭(제어 문자)', '봄\t벚꽃'],
  ])('AC-4611.2: %s 모양이 있으면 아무것도 보내지 않고 E-FORMS-PRIVATE가 보인다', async (_, words) => {
    const { user } = await open()
    await mine(user)
    fireEvent.change(wordsBox(), { target: { value: words } })
    await user.click(makeButton())
    expect(bgCalls()).toHaveLength(0)
    expect(readBackground).not.toHaveBeenCalled()
    expectError('E-FORMS-PRIVATE')
    expect(wordsBox().value).toBe(words)
  })

  it('AC-4611.2: { text }를 보내고 기다리는 동안 [만드는 중…]으로 막히고 안내 글이 보이며, 같은 틀 안에서 두 번 눌러도 한 번만 보낸다', async () => {
    const answer = deferred<Response>()
    fetchSpy.mockReturnValue(answer.promise)
    const { user } = await open()
    await mine(user)
    fireEvent.change(wordsBox(), { target: { value: '봄 벚꽃' } })
    act(() => {
      fireEvent.click(makeButton())
      fireEvent.click(makeButton())
    })
    expect(bgCalls()).toHaveLength(1)
    const [, init] = bgCalls()[0]
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(sentText(0)).toEqual({ text: '봄 벚꽃' })
    expect(init?.redirect).toBe('manual')
    expect(init?.cache).toBe('no-store')

    expect(makeButton().textContent).toBe('만드는 중…')
    expect(makeButton().disabled).toBe(true)
    expect(within(bgBox()).getByText('그림을 만드는 중이에요. 10초쯤 걸려요')).toBeTruthy()
    fireEvent.click(makeButton())
    expect(bgCalls()).toHaveLength(1)
    expect(wordsBox().value).toBe('봄 벚꽃')

    await act(async () => answer.resolve(json({ image: JPEG })))
    await within(bgBox()).findByText('만든 배경: 봄 벚꽃')
    expect(makeButton().textContent).toBe('AI로 배경 만들기')
    expect(within(bgBox()).queryByText('그림을 만드는 중이에요. 10초쯤 걸려요')).toBeNull()
  })
})

describe('AC-4611.3: 만든 배경', () => {
  it('AC-4611.3: 받은 그림을 readBackground로 읽어 미리보기·인쇄 사본이 만든 배경과 강조색으로 바뀌고, 만든 배경 칸이 보이며 [저장]·[인쇄·PDF]·[그림 파일]이 막힌다', async () => {
    const { user } = await readyScreen()
    expect(outputsDisabled()).toEqual([false, false, false])
    await makeTrial(user)
    expect(readBackground).toHaveBeenCalledTimes(1)
    expect(Array.from(vi.mocked(readBackground).mock.calls[0][0])).toEqual(Array.from(base64ToBytes(JPEG)))

    expect(firstHref(poster())).toBe(TRIAL.image)
    expect(monthFill(poster())).toBe(TRIAL.accent)
    expect(firstHref(printCopy())).toBe(TRIAL.image)
    expect(monthFill(printCopy())).toBe(TRIAL.accent)
    expect(within(bgBox()).getByText('미리보기에 얹어 보았어요. 저장해야 이 안내문에 쓰고 뽑을 수 있어요')).toBeTruthy()
    for (const name of ['내 배경으로 저장', '다시 만들기', '안 쓰기']) expect(bgButton(name).disabled, name).toBe(false)
    expect(outputsDisabled()).toEqual([true, true, true])

    // '테마 그림' 칸이 보이는 동안에는 미리보기에 얹지 않는다(만든 배경은 남는다)
    await user.click(kind('테마 그림'))
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
    expect(outputsDisabled()).toEqual([false, false, false])
    await user.click(kind('내 배경'))
    expect(firstHref(poster())).toBe(TRIAL.image)
    expect(outputsDisabled()).toEqual([true, true, true])
  })

  it('AC-4611.3: 그림을 못 읽으면(readBackground null) E-FORMS-BG-FAILED가 보이고 만든 배경 칸은 없다', async () => {
    vi.mocked(readBackground).mockResolvedValueOnce(null)
    const { user } = await open()
    await mine(user)
    fireEvent.change(wordsBox(), { target: { value: '봄 벚꽃' } })
    await user.click(makeButton())
    await within(bgBox()).findByText('오류 번호 E-FORMS-BG-FAILED')
    expectError('E-FORMS-BG-FAILED')
    expect(within(bgBox()).queryByText(/^만든 배경:/)).toBeNull()
    expect(makeButton().disabled).toBe(false)
  })
})

describe('AC-4611.4: [내 배경으로 저장]', () => {
  it('AC-4611.4: 저장하는 동안 [저장하는 중…]으로 막히고, 끝나면 목록 맨 위에 생겨 골라지며(theme = bg-<id>) 만든 배경 칸은 사라진다', async () => {
    vi.mocked(listBackgrounds).mockResolvedValue([WINTER])
    const store = deferred<SavedBackground | 'failed'>()
    vi.mocked(saveBackground).mockReturnValue(store.promise)
    const { user } = await readyScreen()
    await makeTrial(user)
    await user.click(bgButton('내 배경으로 저장'))
    expect(bgButton('저장하는 중…').disabled).toBe(true)
    expect(saveBackground).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(saveBackground).mock.calls[0][0]
    expect(Object.keys(sent).sort()).toEqual(['accent', 'image', 'thumb', 'words'])
    expect([sent.words, sent.accent, sent.thumb]).toEqual(['봄 벚꽃', TRIAL.accent, TRIAL.thumb])
    expect(Array.from(sent.image)).toEqual(Array.from(base64ToBytes(JPEG)))

    const item = saved(ID_NEW, '봄 벚꽃', TRIAL.accent, TRIAL.thumb, '2026-11-15T01:00:00.000Z')
    await act(async () => store.resolve(item))
    await screen.findByText('고른 배경: 봄 벚꽃')
    expect(thumbNames()).toEqual([
      ['봄 벚꽃 배경', 'true'],
      ['겨울 눈 덮인 숲 배경', 'false'],
    ])
    expect(within(bgBox()).getByText('2/30장')).toBeTruthy()
    expect(within(bgBox()).queryByText('만든 배경: 봄 벚꽃')).toBeNull()
    expect(firstHref(poster())).toBe(TRIAL.image)
    expect(monthFill(poster())).toBe(TRIAL.accent)
    expect(outputsDisabled()).toEqual([false, false, false])
    expect(readBackgroundImage).not.toHaveBeenCalled()

    await user.click(button('저장'))
    expect(insertNotice).toHaveBeenCalledWith(expect.objectContaining({ theme: `bg-${ID_NEW}` }))
  })

  it('AC-4611.4: 저장이 실패하면 E-FORMS-BG-STORE-FAILED가 보이고 만든 배경은 그대로다', async () => {
    vi.mocked(saveBackground).mockResolvedValueOnce('failed')
    const { user } = await readyScreen()
    await makeTrial(user)
    await user.click(bgButton('내 배경으로 저장'))
    await within(bgBox()).findByText('오류 번호 E-FORMS-BG-STORE-FAILED')
    expectError('E-FORMS-BG-STORE-FAILED')
    expect(within(bgBox()).getByText('만든 배경: 봄 벚꽃')).toBeTruthy()
    expect(bgButton('내 배경으로 저장').disabled).toBe(false)
    expect(firstHref(poster())).toBe(TRIAL.image)
    expect(thumbNames().map(([name]) => name)).toEqual(['추석 보름달 배경', '겨울 눈 덮인 숲 배경'])
  })

  it('AC-4611.4: 내 배경이 30장이면 [내 배경으로 저장]이 막히고 "내 배경은 30장까지예요. 안 쓰는 배경을 지워 주세요"가 보인다', async () => {
    const full = Array.from({ length: 30 }, (_, i) =>
      saved(`${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, `배경 ${i}`, '#2e5e9e', '/9j/AAAA', '2026-11-01T01:00:00.000Z'),
    )
    vi.mocked(listBackgrounds).mockResolvedValue(full)
    const { user } = await open()
    await makeTrial(user)
    expect(within(bgBox()).getByText('30/30장')).toBeTruthy()
    expect(bgButton('내 배경으로 저장').disabled).toBe(true)
    expect(within(bgBox()).getByText('내 배경은 30장까지예요. 안 쓰는 배경을 지워 주세요')).toBeTruthy()
    fireEvent.click(bgButton('내 배경으로 저장'))
    expect(saveBackground).not.toHaveBeenCalled()
  })
})

describe('AC-4611.5: [다시 만들기]·[안 쓰기]', () => {
  it('AC-4611.5: [다시 만들기]는 그 배경의 말로 다시 만들고 앞 그림은 버린다', async () => {
    const { user } = await open()
    await makeTrial(user)
    fireEvent.change(wordsBox(), { target: { value: '겨울 눈' } })
    vi.mocked(readBackground).mockResolvedValueOnce(TRIAL2)
    await user.click(bgButton('다시 만들기'))
    expect(bgCalls()).toHaveLength(2)
    expect(sentText(1)).toEqual({ text: '봄 벚꽃' })
    await vi.waitFor(() => expect(firstHref(poster())).toBe(TRIAL2.image))
    expect(monthFill(poster())).toBe(TRIAL2.accent)
    expect(within(bgBox()).getByText('만든 배경: 봄 벚꽃')).toBeTruthy()
    expect(wordsBox().value).toBe('겨울 눈')
  })

  it('AC-4611.5: [안 쓰기]를 누르면 만든 배경을 버리고 미리보기가 고른 테마·배경으로 돌아간다', async () => {
    const { user } = await readyScreen()
    await makeTrial(user)
    await user.click(bgButton('안 쓰기'))
    expect(within(bgBox()).queryByText('만든 배경: 봄 벚꽃')).toBeNull()
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
    expect(outputsDisabled()).toEqual([false, false, false])

    await choose(user, WINTER)
    await vi.waitFor(() => expect(firstHref(poster())).toBe(jpegDataUrl(BYTES)))
    fireEvent.change(wordsBox(), { target: { value: '봄 벚꽃' } })
    await user.click(makeButton())
    await within(bgBox()).findByText('만든 배경: 봄 벚꽃')
    expect(firstHref(poster())).toBe(TRIAL.image)
    await user.click(bgButton('안 쓰기'))
    expect(firstHref(poster())).toBe(jpegDataUrl(BYTES))
    expect(monthFill(poster())).toBe(WINTER.accent)
  })

  it('AC-4611.5: [다시 만들기]로 기다리는 동안에는 [안 쓰기]도 막힌다(늦게 온 그림이 버린 뒤 다시 얹히지 않게)', async () => {
    const { user } = await open()
    await makeTrial(user)
    const answer = deferred<Response>()
    fetchSpy.mockImplementationOnce(() => answer.promise)
    await user.click(bgButton('다시 만들기'))
    expect(bgButton('안 쓰기').disabled).toBe(true)
    answer.resolve(json({ image: JPEG }))
    await vi.waitFor(() => expect(bgButton('안 쓰기').disabled).toBe(false))
  })
})

describe('AC-4611.6: 만들기 오류', () => {
  it.each([
    ['E-FORMS-BG-LIMIT', 429],
    ['E-FORMS-BG-QUOTA', 402],
    ['E-FORMS-BG-FAILED', 502],
    ['E-AI-BUSY', 503],
  ] as const)('AC-4611.6: 경로가 %s로 답하면 그 오류 카드가 보이고 적은 말·고른 그림·만든 배경은 그대로다', async (code, status) => {
    const { user } = await readyScreen()
    await mine(user)
    await choose(user, WINTER)
    fireEvent.change(wordsBox(), { target: { value: '봄 벚꽃' } })
    await user.click(makeButton())
    await within(bgBox()).findByText('만든 배경: 봄 벚꽃')
    fetchSpy.mockResolvedValueOnce(json({ code }, status))
    await user.click(bgButton('다시 만들기'))
    await within(bgBox()).findByText(`오류 번호 ${code}`)
    expectError(code)
    expect(wordsBox().value).toBe('봄 벚꽃')
    expect(thumb(WINTER).getAttribute('aria-pressed')).toBe('true')
    expect(within(bgBox()).getByText('만든 배경: 봄 벚꽃')).toBeTruthy()
    expect(firstHref(poster())).toBe(TRIAL.image)
    expect(makeButton().disabled).toBe(false)
  })

  it('AC-4611.6: 연결이 끊기면 E-AI-BUSY, 모르는 답(504 JSON 아님·200 모양 틀림·모르는 번호)은 E-FORMS-BG-FAILED', async () => {
    const { user } = await open()
    await mine(user)
    fireEvent.change(wordsBox(), { target: { value: '봄 벚꽃' } })
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.click(makeButton())
    await within(bgBox()).findByText('오류 번호 E-AI-BUSY')
    expectError('E-AI-BUSY')

    const answers = [
      new Response('<html>Gateway Timeout</html>', { status: 504 }),
      json({ image: 'iVBORw0KGgo=' }),
      json({ code: 'E-AI-LIMIT' }, 402),
    ]
    for (const [i, answer] of answers.entries()) {
      fetchSpy.mockResolvedValueOnce(answer)
      await user.click(makeButton())
      await within(bgBox()).findByText('오류 번호 E-FORMS-BG-FAILED')
      expectError('E-FORMS-BG-FAILED')
      fireEvent.change(wordsBox(), { target: { value: `봄 벚꽃 ${i}` } }) // 글을 고치면 오류 카드는 사라진다
      expect(within(bgBox()).queryByText('오류 번호 E-FORMS-BG-FAILED')).toBeNull()
    }
    expect(readBackground).not.toHaveBeenCalled()
  })
})

describe('AC-4612.1: 내 배경 목록', () => {
  it('AC-4612.1: 제목 내 배경 옆 n/30장, 최근 것부터 작은 그림과 적은 말 단추(읽는 이름 <말> 배경), 고른 것은 눌림', async () => {
    const { user } = await open([DEC])
    await user.click(screen.getByRole('button', { name: /^2026년 12월 · 학회·성탄절 / }))
    expect(await within(bgBox()).findByText('2/30장')).toBeTruthy()
    expect(thumbNames()).toEqual([
      ['추석 보름달 배경', 'false'],
      ['겨울 눈 덮인 숲 배경', 'true'],
    ])
    for (const item of LIST) {
      const b = thumb(item)
      expect(b.textContent).toBe(item.words)
      expect(b.querySelector('img')?.getAttribute('src')).toBe(`data:image/jpeg;base64,${item.thumb}`)
      expect(b.querySelector('img')?.getAttribute('alt')).toBe('')
    }
  })

  it('AC-4612.1: 읽는 중이면 "내 배경을 읽는 중…", 실패면 E-FORMS-BG-STORE-FAILED와 [다시 읽기], 없으면 "아직 저장한 배경이 없어요"', async () => {
    const first = deferred<SavedBackground[] | 'failed'>()
    vi.mocked(listBackgrounds).mockReturnValueOnce(first.promise).mockResolvedValueOnce([])
    const { user } = await open()
    await user.click(kind('내 배경'))
    expect(within(bgBox()).getByText('내 배경을 읽는 중…')).toBeTruthy()
    await act(async () => first.resolve('failed'))
    expectError('E-FORMS-BG-STORE-FAILED')
    expect(within(bgBox()).queryByText('내 배경을 읽는 중…')).toBeNull()
    await user.click(bgButton('다시 읽기'))
    expect(await within(bgBox()).findByText('아직 저장한 배경이 없어요')).toBeTruthy()
    expect(within(bgBox()).getByText('0/30장')).toBeTruthy()
    expect(within(bgBox()).queryByText('오류 번호 E-FORMS-BG-STORE-FAILED')).toBeNull()
    expect(listBackgrounds).toHaveBeenCalledTimes(2)
  })
})

describe('AC-4612.2: 내 배경 고르기', () => {
  it('AC-4612.2: 누르면 theme = bg-<id>, 처음 쓸 때 한 번 내려받아 미리보기·인쇄 사본·그림 파일이 그 배경과 저장한 강조색으로, 내려받는 동안 "내 배경을 불러오는 중…"과 막힘', async () => {
    const image = deferred<Uint8Array | null>()
    vi.mocked(readBackgroundImage).mockReturnValueOnce(image.promise)
    const { user } = await readyScreen()
    await mine(user)
    await user.click(thumb(WINTER))
    expect(thumb(WINTER).getAttribute('aria-pressed')).toBe('true')
    expect(within(bgBox()).getByText('고른 배경: 겨울 눈 덮인 숲')).toBeTruthy()
    expect(within(bgBox()).getByText('내 배경을 불러오는 중…')).toBeTruthy()
    expect(outputsDisabled()).toEqual([true, true, true])
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
    expect(readBackgroundImage).toHaveBeenCalledWith(WINTER)

    await act(async () => image.resolve(BYTES))
    expect(within(bgBox()).queryByText('내 배경을 불러오는 중…')).toBeNull()
    expect(firstHref(poster())).toBe(jpegDataUrl(BYTES))
    expect(monthFill(poster())).toBe(WINTER.accent)
    expect(firstHref(printCopy())).toBe(jpegDataUrl(BYTES))
    expect(monthFill(printCopy())).toBe(WINTER.accent)
    expect(outputsDisabled()).toEqual([false, false, false])

    // 다른 배경을 골랐다가 돌아와도 다시 내려받지 않는다
    await choose(user, CHUSEOK)
    await vi.waitFor(() => expect(monthFill(poster())).toBe(CHUSEOK.accent))
    await choose(user, WINTER)
    expect(monthFill(poster())).toBe(WINTER.accent)
    expect(vi.mocked(readBackgroundImage).mock.calls.map(([b]) => b.id)).toEqual([ID_A, ID_B])

    await user.click(button('그림 파일'))
    expect(downloadPosterPng).toHaveBeenCalledTimes(1)
    const [svg] = vi.mocked(downloadPosterPng).mock.calls[0]
    expect(svg).toBe(poster())
    expect(firstHref(svg)).toBe(jpegDataUrl(BYTES))
    await user.click(button('저장'))
    expect(insertNotice).toHaveBeenCalledWith(expect.objectContaining({ theme: `bg-${ID_A}` }))
  })

  it('AC-4612.2: 못 내려받으면 E-FORMS-BG-STORE-FAILED와 [다시 읽기]가 보이고 막힌 채, [다시 읽기]로 다시 내려받는다', async () => {
    vi.mocked(readBackgroundImage).mockResolvedValueOnce(null)
    const { user } = await readyScreen()
    await mine(user)
    await choose(user, WINTER)
    await within(bgBox()).findByText('오류 번호 E-FORMS-BG-STORE-FAILED')
    expectError('E-FORMS-BG-STORE-FAILED')
    expect(outputsDisabled()).toEqual([true, true, true])
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
    await user.click(bgButton('다시 읽기'))
    await vi.waitFor(() => expect(firstHref(poster())).toBe(jpegDataUrl(BYTES)))
    expect(readBackgroundImage).toHaveBeenCalledTimes(2)
    expect(within(bgBox()).queryByText('오류 번호 E-FORMS-BG-STORE-FAILED')).toBeNull()
    expect(outputsDisabled()).toEqual([false, false, false])
  })
})

describe('AC-4612.3: [테마 그림]으로 돌아가기·내 배경 안내문 열기', () => {
  it('AC-4612.3: 내 배경을 쓰는 안내문에서 [테마 그림]을 누르면 theme이 null(저절로·그림 1)이 되고 테마 고르기와 그림 단추가 보인다', async () => {
    const { user } = await readyScreen()
    await mine(user)
    await choose(user, WINTER)
    await user.click(kind('테마 그림'))
    expect(kind('테마 그림').getAttribute('aria-pressed')).toBe('true')
    expect(themeBox().value).toBe('auto')
    expect(art(1).getAttribute('aria-pressed')).toBe('true')
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
    await user.click(button('저장'))
    expect(insertNotice).toHaveBeenCalledWith(expect.objectContaining({ theme: null }))
  })

  it('AC-4612.3: 내 배경을 쓰는 저장한 안내문을 열면 [내 배경]이 눌린 채 열리고 목록을 한 번 읽어 그 배경으로 그린다', async () => {
    const { user } = await open([AUG, DEC])
    expect(listBackgrounds).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^2026년 12월 · 학회·성탄절 / }))
    expect(kind('내 배경').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('combobox', { name: '테마' })).toBeNull()
    await screen.findByText('고른 배경: 겨울 눈 덮인 숲')
    await vi.waitFor(() => expect(firstHref(poster())).toBe(jpegDataUrl(BYTES)))
    expect(monthFill(poster())).toBe(WINTER.accent)
    expect(listBackgrounds).toHaveBeenCalledTimes(1)

    // 테마를 쓰는 안내문을 열면 테마 그림 칸으로 돌아온다(내 배경을 직접 누르지 않았으므로)
    await user.click(screen.getByRole('button', { name: /^2026년 8월 · 광복절·대체공휴일 / }))
    expect(kind('테마 그림').getAttribute('aria-pressed')).toBe('true')
    expect(firstHref(poster())).toBe('/poster/themes/liberation.svg')
    expect(listBackgrounds).toHaveBeenCalledTimes(1)
  })

  it('AC-4612.3: 내 배경을 쓰는 저장한 안내문을 열어 그 배경을 지워도 [내 배경] 칸에 남는다(시안 openNotice: 내 배경 값이면 내 배경 칸)', async () => {
    const { user } = await open([AUG, DEC])
    await user.click(screen.getByRole('button', { name: /^2026년 12월 · 학회·성탄절 / }))
    await screen.findByText('고른 배경: 겨울 눈 덮인 숲')
    await user.click(bgButton('이 배경 지우기'))
    await vi.waitFor(() => expect(thumbNames()).toEqual([['추석 보름달 배경', 'false']]))
    expect(kind('내 배경').getAttribute('aria-pressed')).toBe('true')
    expect(within(bgBox()).getByText('1/30장')).toBeTruthy()
  })

  it('AC-4612.3: [내 배경]을 직접 누른 뒤에도 테마를 쓰는 안내문을 열거나 새로 만들면 [테마 그림] 칸으로 열리고, 만든 배경은 남지만 미리보기에 얹지 않는다(시안 openNotice)', async () => {
    const { user } = await open([AUG, { ...LIB, theme: 'liberation-2' }])
    await makeTrial(user)
    await user.click(screen.getByRole('button', { name: /^2025년 8월 · 광복절 / }))
    expect(kind('테마 그림').getAttribute('aria-pressed')).toBe('true')
    expect(art(2).getAttribute('aria-pressed')).toBe('true')
    expect(firstHref(poster())).toBe('/poster/themes/liberation-2.svg')
    expect(outputsDisabled()).toEqual([false, false, false])

    // 만든 배경은 남아 있다: [내 배경]을 누르면 다시 얹힌다
    await user.click(kind('내 배경'))
    expect(within(bgBox()).getByText('만든 배경: 봄 벚꽃')).toBeTruthy()
    expect(firstHref(poster())).toBe(TRIAL.image)

    await user.click(screen.getByRole('button', { name: /새로 만들기/ }))
    expect(kind('테마 그림').getAttribute('aria-pressed')).toBe('true')
    expect(firstHref(poster())).not.toBe(TRIAL.image)
  })
})

describe('AC-4612.4: [이 배경 지우기]', () => {
  it('AC-4612.4: "고른 배경: <말>"과 [이 배경 지우기], 확인 글을 묻고 [확인]이면 지운 뒤 목록에서 빠지고 theme이 null이 된다', async () => {
    const { user } = await readyScreen()
    await mine(user)
    await choose(user, WINTER)
    await user.click(bgButton('이 배경 지우기'))
    expect(confirmSpy).toHaveBeenCalledWith('이 배경을 지울까요? 이 배경을 쓴 다른 안내문은 저절로 고른 테마로 보여요')
    expect(deleteBackground).toHaveBeenCalledWith(WINTER)
    await vi.waitFor(() => expect(thumbNames()).toEqual([['추석 보름달 배경', 'false']]))
    expect(within(bgBox()).getByText('1/30장')).toBeTruthy()
    expect(within(bgBox()).queryByText(/^고른 배경:/)).toBeNull()
    expect(within(bgBox()).queryByText('고른 내 배경이 지워져 저절로 고른 테마로 보여요')).toBeNull()
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
    await user.click(button('저장'))
    expect(insertNotice).toHaveBeenCalledWith(expect.objectContaining({ theme: null }))
  })

  it('AC-4612.4: [취소]면 그대로고, 지우기가 실패하면 E-FORMS-BG-STORE-FAILED가 보이고 배경은 남는다', async () => {
    const { user } = await readyScreen()
    await mine(user)
    await choose(user, WINTER)
    confirmSpy.mockReturnValueOnce(false)
    await user.click(bgButton('이 배경 지우기'))
    expect(deleteBackground).not.toHaveBeenCalled()
    expect(within(bgBox()).getByText('고른 배경: 겨울 눈 덮인 숲')).toBeTruthy()

    vi.mocked(deleteBackground).mockResolvedValueOnce(false)
    await user.click(bgButton('이 배경 지우기'))
    await within(bgBox()).findByText('오류 번호 E-FORMS-BG-STORE-FAILED')
    expectError('E-FORMS-BG-STORE-FAILED')
    expect(thumbNames()).toEqual([
      ['추석 보름달 배경', 'false'],
      ['겨울 눈 덮인 숲 배경', 'true'],
    ])
    expect(within(bgBox()).getByText('고른 배경: 겨울 눈 덮인 숲')).toBeTruthy()
  })
})

describe('AC-4612.5: 지운 배경', () => {
  it('AC-4612.5: 저장한 안내문의 bg-<id>가 읽은 목록에 없으면 저절로 고른 테마(그림 1)로 그리고 알림이 보이며 뽑기는 막지 않는다', async () => {
    const { user } = await open([JUN])
    await user.click(screen.getByRole('button', { name: /^2026년 6월 · 현충일 / }))
    expect(kind('내 배경').getAttribute('aria-pressed')).toBe('true')
    expect(await within(bgBox()).findByText('고른 내 배경이 지워져 저절로 고른 테마로 보여요')).toBeTruthy()
    expect(firstHref(poster())).toBe('/poster/themes/memorial.svg')
    expect(firstHref(printCopy())).toBe('/poster/themes/memorial.svg')
    expect(outputsDisabled()).toEqual([false, false, false])
    expect(readBackgroundImage).not.toHaveBeenCalled()
    expect(thumbNames().every(([, pressed]) => pressed === 'false')).toBe(true)
  })
})

describe('AC-4611.2·AC-4611.3: 늦게 온 답', () => {
  it('AC-4611.3: 화면이 사라진 뒤 온 AI 배경 답은 버린다(그림을 읽지 않는다)', async () => {
    const answer = deferred<Response>()
    fetchSpy.mockReturnValue(answer.promise)
    const { user, view } = await open()
    await mine(user)
    fireEvent.change(wordsBox(), { target: { value: '봄 벚꽃' } })
    await user.click(makeButton())
    expect(bgCalls()).toHaveLength(1)
    view.unmount()
    await act(async () => answer.resolve(json({ image: JPEG })))
    expect(readBackground).not.toHaveBeenCalled()
  })

  it('AC-4612.1: 화면이 사라진 뒤 온 목록·그림 답은 버린다(오류 없이 끝난다)', async () => {
    const list = deferred<SavedBackground[] | 'failed'>()
    vi.mocked(listBackgrounds).mockReturnValueOnce(list.promise)
    const { user, view } = await open([DEC])
    await user.click(screen.getByRole('button', { name: /^2026년 12월 · 학회·성탄절 / }))
    expect(listBackgrounds).toHaveBeenCalledTimes(1)
    view.unmount()
    await act(async () => list.resolve(LIST))
    expect(readBackgroundImage).not.toHaveBeenCalled()
  })
})
