// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClinicProfile, type ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { LOGO, LOGO_MAX, layoutPoster, scaleLogoRect } from '@/lib/forms/layout'
import { logoPalette, logoSwatches, onWhite } from '@/lib/forms/logoColors'
import type { LogoBitmap } from '@/lib/forms/logoFit'
import { bitmapToPngUrl, downloadPosterPng, readLogoBitmap, readLogoPixels } from '@/lib/forms/png'
import { DEFAULT_STYLE, logoTintable, type FormStyle } from '@/lib/forms/style'
import { defaultProfile, removeLogo, saveClinicProfile, uploadLogo } from '@/lib/storage/clinicProfile'
import { deleteNotice, insertNotice, listNotices, updateNotice } from '@/lib/storage/formNotices'
import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'
import type { ClosureNotice, NoticeCard, SavedNotice } from '@/types/forms'
import { FormsScreen } from './FormsScreen'
import { NOTICE_INK, NOTICE_LEAD } from './noticeColors'

// 서식 화면(spec forms TASK-12, REQ-3501~3507, design.md 10절, 승인 시안 docs/mockups/forms/screen.html).
// 가짜: fetch(AI 경로)·저장 모듈·window.print·downloadPosterPng·confirm·병원 정보 훅(useClinicProfile)·로고 점 읽기(readLogoPixels)·
// 로고 준비의 큰 그림 읽기(readLogoBitmap)·PNG 만들기(bitmapToPngUrl) — jsdom에는 그림 읽기·canvas가 없다(spec logo-fit design.md 3절).
// 나머지(검사·테마·배치·안내문 그림·로고 흰 배경 지우기와 자르기 fitLogo)는 진짜를 지난다. 오늘은 prop으로 2026-11-10(한국 날짜)을 준다

vi.mock('@/lib/storage/formNotices', () => ({
  listNotices: vi.fn(),
  insertNotice: vi.fn(),
  updateNotice: vi.fn(),
  deleteNotice: vi.fn(),
}))
vi.mock('@/lib/forms/png', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/png')>()),
  downloadPosterPng: vi.fn(),
  readLogoPixels: vi.fn(),
  readLogoBitmap: vi.fn(),
  bitmapToPngUrl: vi.fn(),
}))
vi.mock('@/components/clinic/useClinicProfile', () => ({ useClinicProfile: vi.fn() }))
// 병원 정보 저장·로고 올리기·지우기는 서식 화면이 부르지 않는다(spec logo-fit AC-6701.4)
vi.mock('@/lib/storage/clinicProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/clinicProfile')>()),
  saveClinicProfile: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}))

// 병원 정보(지어낸 값): 로고는 PNG data: 주소, 이름은 병원 정보 이름
const LOGO_URL = `data:image/png;base64,iVBORw0KGgo${'C'.repeat(40)}`
const CLINIC_NAME = '서승관정형외과의원'
const clinicView = (patch: Partial<ClinicProfileView> = {}): ClinicProfileView => ({
  state: 'ready',
  profile: defaultProfile(),
  saved: true,
  signupName: '가입한 의원',
  signupPhone: null,
  name: CLINIC_NAME,
  logoDataUrl: LOGO_URL,
  reload: vi.fn(),
  ...patch,
})
// 로고 점: 회색뿐(색이 없다)
const GRAY_PIXELS = { data: new Uint8ClampedArray(16 * 4).fill(128), width: 16, height: 1 }

const TODAY = '2026-11-10'
const CHILDREN: NoticeCard = { start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }
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
const MAY: SavedNotice = { id: 'may', year: 2027, month: 5, cards: [CHILDREN], theme: null, updatedAt: '2026-11-10T05:32:00.000Z' }

const fetchSpy = vi.fn<typeof fetch>()
const printSpy = vi.fn()
const confirmSpy = vi.fn<(message?: string) => boolean>()

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const tidyAnswer = (cards: NoticeCard[], truncated = false) => json({ cards, truncated })

beforeEach(() => {
  vi.mocked(listNotices).mockResolvedValue([AUG])
  vi.mocked(insertNotice).mockResolvedValue(MAY)
  vi.mocked(updateNotice).mockImplementation(async (id, n) => ({ ...n, id, updatedAt: '2026-11-10T06:00:00.000Z' }))
  vi.mocked(deleteNotice).mockResolvedValue(true)
  vi.mocked(downloadPosterPng).mockResolvedValue(true)
  vi.mocked(useClinicProfile).mockReturnValue(clinicView())
  vi.mocked(readLogoPixels).mockResolvedValue(GRAY_PIXELS)
  // 기본은 준비 실패(큰 그림을 못 읽음) → 원래 로고를 원래 상자에(spec logo-fit AC-6702.2). 준비 성공은 아래 logo-fit 시험이 정한다
  vi.mocked(readLogoBitmap).mockResolvedValue(null)
  vi.mocked(bitmapToPngUrl).mockReturnValue(null)
  fetchSpy.mockResolvedValue(tidyAnswer([CHILDREN]))
  vi.stubGlobal('fetch', fetchSpy)
  window.print = printSpy
  window.confirm = confirmSpy
  confirmSpy.mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function open() {
  const user = userEvent.setup()
  render(<FormsScreen today={TODAY} />)
  await screen.findByRole('button', { name: /2026년 8월 · 광복절·대체공휴일/ })
  return user
}

const memoBox = () => screen.getByRole('textbox', { name: '대충 적기' }) as HTMLTextAreaElement
const tidyButton = () => screen.getByRole('button', { name: /정리하기|정리하는 중…/ })
const card = (n: number) => screen.getByRole('group', { name: `카드 ${n}` })
const field = (n: number, label: string) => within(card(n)).getByLabelText(label) as HTMLInputElement
const poster = () => within(screen.getByRole('region', { name: '미리보기' })).getByRole('img')
const monthBox = () => screen.getByLabelText('안내 달') as HTMLInputElement
const themeBox = () => screen.getByRole('combobox', { name: '테마' }) as HTMLSelectElement
const button = (name: string) => screen.getByRole('button', { name })
const OUTPUTS = ['저장', '인쇄·PDF', '그림 파일']

function setCard(n: number, values: Partial<Record<'시작 날짜' | '끝 날짜' | '이름' | '아래 글', string>>) {
  for (const [label, value] of Object.entries(values)) fireEvent.change(field(n, label), { target: { value } })
}

async function tidy(user: ReturnType<typeof userEvent.setup>, text = '5/5 어린이날 휴진') {
  await user.type(memoBox(), text)
  await user.click(tidyButton())
}

const expectError = (code: ErrorCode) => {
  const alert = screen.getAllByRole('alert').find((el) => el.textContent?.includes(code))
  expect(alert, code).toBeDefined()
  expect(alert?.textContent).toContain(errorInfo(code).what)
  expect(alert?.textContent).toContain(errorInfo(code).fix)
}

describe('AC-3501.3: 화면 머리', () => {
  it('AC-3501.3: 제목 서식과 도구 단추 줄에 눌린 [휴진 안내] 하나가 있다', async () => {
    await open()
    expect(screen.getByRole('heading', { level: 1, name: '서식' })).toBeTruthy()
    const tools = screen.getByRole('group', { name: '서식 도구' })
    const buttons = within(tools).getAllByRole('button')
    expect(buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['휴진 안내', 'true'], ['환자 안내문', 'false']])
  })
})

describe('AC-3502.1~AC-3502.7: 대충 적고 AI로 정리하기', () => {
  it('AC-3502.7: 글 칸 아래 안내 한 줄이 늘 보인다', async () => {
    await open()
    expect(screen.getByText('전화번호·주민번호·메일 주소는 적지 마세요. 적은 글은 정리할 때만 AI로 보내고 저장하지 않아요')).toBeTruthy()
  })

  it('AC-3502.2: 500자까지만 들어가고 n/500이 보이며, 빈 글이면 [정리하기]가 막혀 있다', async () => {
    const user = await open()
    expect(memoBox().getAttribute('maxlength')).toBe('500')
    expect(screen.getByText('0/500')).toBeTruthy()
    expect((tidyButton() as HTMLButtonElement).disabled).toBe(true)
    await user.type(memoBox(), '   ')
    expect(screen.getByText('3/500')).toBeTruthy()
    expect((tidyButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(memoBox(), { target: { value: '가'.repeat(520) } })
    expect(screen.getByText('500/500')).toBeTruthy()
    expect((tidyButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-3502.1: 정리한 답으로 카드 칸이 바뀌고 안내 달은 2027년 5월, 미리보기가 바로 바뀐다', async () => {
    const user = await open()
    await tidy(user)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/ai/forms')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ text: '5/5 어린이날 휴진' })
    await screen.findByDisplayValue('어린이날')
    expect(field(1, '시작 날짜').value).toBe('2027-05-05')
    expect(field(1, '끝 날짜').value).toBe('')
    expect(field(1, '아래 글').value).toBe('휴진')
    expect(monthBox().value).toBe('2027-05')
    expect(poster().getAttribute('aria-label')).toBe('2027년 5월 진료일정안내: 5월 5일(수) 어린이날 휴진')
    expect(memoBox().value).toBe('5/5 어린이날 휴진')
  })

  it('AC-3502.3: 전화번호 모양이 있으면 아무것도 보내지 않고 E-FORMS-PRIVATE 문구가 보인다', async () => {
    const user = await open()
    await tidy(user, '5/5 어린이날 휴진, 문의 010-1234-5678')
    expect(fetchSpy).not.toHaveBeenCalled()
    expectError('E-FORMS-PRIVATE')
  })

  it('AC-3502.4: 답을 기다리는 동안 [정리하는 중…]으로 막혀 두 번 보내지 않고, 적은 글과 카드 칸은 그대로다', async () => {
    let answer: (r: Response) => void = () => {}
    fetchSpy.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    const user = await open()
    setCard(1, { 이름: '학회' })
    await tidy(user)
    expect(tidyButton().textContent).toBe('정리하는 중…')
    expect((tidyButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(tidyButton())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(memoBox().value).toBe('5/5 어린이날 휴진')
    expect(field(1, '이름').value).toBe('학회')
    await act(async () => answer(tidyAnswer([CHILDREN])))
    expect(tidyButton().textContent).toBe('정리하기')
    expect(field(1, '이름').value).toBe('어린이날')
  })

  it.each([
    ['E-AI-BUSY', 503],
    ['E-AI-LIMIT', 402],
    ['E-AI-FAILED', 502],
    ['E-FORMS-NO-DATE', 422],
  ] as const)('AC-3502.5: 경로가 %s로 답하면 그 문구가 보이고 적은 글·카드 칸은 그대로다', async (code, status) => {
    fetchSpy.mockResolvedValue(json({ code }, status))
    const user = await open()
    setCard(1, { 이름: '학회' })
    await tidy(user)
    await screen.findByText(new RegExp(code))
    expectError(code)
    expect(memoBox().value).toBe('5/5 어린이날 휴진')
    expect(field(1, '이름').value).toBe('학회')
  })

  it('AC-3502.5: 연결이 끊기면 E-AI-BUSY로 보인다', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = await open()
    await tidy(user)
    await screen.findByText(/E-AI-BUSY/)
    expectError('E-AI-BUSY')
  })

  it('AC-3502.6: 넘쳤다는 표시가 있으면 한 줄 안내가 보인다', async () => {
    fetchSpy.mockResolvedValue(tidyAnswer([CHILDREN], true))
    const user = await open()
    await tidy(user)
    expect(await screen.findByText('카드는 4장까지라 앞의 4장만 넣었어요')).toBeTruthy()
  })
})

describe('AC-3503.1·AC-3503.2·AC-3503.4·AC-3503.5: 안내 내용 직접 고치기', () => {
  it('AC-3503.1: 카드마다 시작·끝·이름·아래 글 네 칸과 [빼기]가 있고, 새 카드의 아래 글은 휴진이다', async () => {
    const user = await open()
    for (const label of ['시작 날짜', '끝 날짜', '이름', '아래 글']) expect(field(1, label)).toBeTruthy()
    expect(within(card(1)).getByRole('button', { name: '빼기' })).toBeTruthy()
    await user.click(button('+ 카드 더하기'))
    expect(field(2, '아래 글').value).toBe('휴진')
    expect(field(2, '이름').getAttribute('maxlength')).toBe('10')
    expect(field(2, '아래 글').getAttribute('maxlength')).toBe('6')
  })

  it('AC-3503.2: 4장이면 [카드 더하기]가, 1장이면 [빼기]가 막혀 있다', async () => {
    const user = await open()
    expect((within(card(1)).getByRole('button', { name: '빼기' }) as HTMLButtonElement).disabled).toBe(true)
    for (let i = 0; i < 3; i += 1) await user.click(button('+ 카드 더하기'))
    expect((button('+ 카드 더하기') as HTMLButtonElement).disabled).toBe(true)
    expect((within(card(4)).getByRole('button', { name: '빼기' }) as HTMLButtonElement).disabled).toBe(false)
    await user.click(within(card(4)).getByRole('button', { name: '빼기' }))
    expect(screen.queryByRole('group', { name: '카드 4' })).toBeNull()
    expect((button('+ 카드 더하기') as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-3503.4: 어긋난 칸은 그 칸 아래에 까닭이 보이고 [저장]·[인쇄·PDF]·[그림 파일]이 막힌다', async () => {
    await open()
    setCard(1, { '시작 날짜': '2027-05-05', '끝 날짜': '2027-05-04', 이름: '어린이날' })
    const end = field(1, '끝 날짜')
    expect(end.getAttribute('aria-invalid')).toBe('true')
    const reason = document.getElementById(end.getAttribute('aria-describedby') ?? '')
    expect(reason?.textContent).toBe('끝 날짜는 시작 날짜보다 뒤여야 해요')
    for (const name of OUTPUTS) expect((button(name) as HTMLButtonElement).disabled, name).toBe(true)
    setCard(1, { '끝 날짜': '2027-05-06' })
    expect(field(1, '끝 날짜').getAttribute('aria-invalid')).toBe('false')
    for (const name of OUTPUTS) expect((button(name) as HTMLButtonElement).disabled, name).toBe(false)
  })

  it('AC-3503.4: 날짜 글은 카드 아래에 요일과 함께 보인다', async () => {
    await open()
    setCard(1, { '시작 날짜': '2026-10-03', '끝 날짜': '2026-10-05' })
    expect(within(card(1)).getByText('10월 3일(토)~5일(월)')).toBeTruthy()
  })

  it('AC-3503.5: 새 안내문의 안내 달은 오늘의 달이고, 카드 날짜를 따라 바뀌며, 직접 고른 뒤에는 그대로다', async () => {
    await open()
    expect(monthBox().value).toBe('2026-11')
    setCard(1, { '시작 날짜': '2027-05-05' })
    expect(monthBox().value).toBe('2027-05')
    fireEvent.change(monthBox(), { target: { value: '2027-04' } })
    setCard(1, { '시작 날짜': '2027-06-06' })
    expect(monthBox().value).toBe('2027-04')
    expect(poster().getAttribute('aria-label')).toMatch(/^2027년 4월 진료일정안내/)
  })
})

describe('AC-3504.3: 테마 고르기', () => {
  it('AC-3504.3: 저절로(지금: …)가 지금 테마를 보이고, 고른 테마는 카드를 바꿔도 그대로, 저절로로 되돌릴 수 있다', async () => {
    await open()
    expect(themeBox().value).toBe('auto')
    expect(within(themeBox()).getByRole('option', { name: '저절로(지금: 11월)' })).toBeTruthy()
    setCard(1, { '시작 날짜': '2027-05-05', 이름: '어린이날' })
    expect(within(themeBox()).getByRole('option', { name: '저절로(지금: 어린이날)' })).toBeTruthy()
    expect(poster().querySelector('image')?.getAttribute('href')).toBe('/poster/themes/children.svg')

    fireEvent.change(themeBox(), { target: { value: 'liberation' } })
    setCard(1, { 이름: '성탄절' })
    expect(themeBox().value).toBe('liberation')
    expect(poster().querySelector('image')?.getAttribute('href')).toBe('/poster/themes/liberation.svg')

    fireEvent.change(themeBox(), { target: { value: 'auto' } })
    expect(poster().querySelector('image')?.getAttribute('href')).toBe('/poster/themes/christmas.svg')
    expect(within(themeBox()).getAllByRole('option')).toHaveLength(24)
  })
})

describe('AC-3505.4: 빈 미리보기', () => {
  it('AC-3505.4: 시작 날짜가 하나도 없으면 점선 상자 안내가 보이고 뽑기·저장 단추가 막혀 있다', async () => {
    await open()
    expect(screen.getByText('날짜를 적으면 여기에 카드가 생겨요')).toBeTruthy()
    for (const name of OUTPUTS) expect((button(name) as HTMLButtonElement).disabled, name).toBe(true)
    setCard(1, { '시작 날짜': '2027-05-05' })
    expect(screen.queryByText('날짜를 적으면 여기에 카드가 생겨요')).toBeNull()
  })
})

describe('AC-3506.1·AC-3506.2·AC-3506.3: 뽑기', () => {
  async function readyScreen() {
    const user = await open()
    setCard(1, { '시작 날짜': '2027-05-05', 이름: '어린이날' })
    return user
  }

  it('AC-3506.1: [인쇄·PDF]는 브라우저 인쇄 창을 열고, 인쇄 면에는 A4 한 장의 안내문만 나온다', async () => {
    const user = await readyScreen()
    await user.click(button('인쇄·PDF'))
    expect(printSpy).toHaveBeenCalledTimes(1)
    const style = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n')
    expect(style).toContain('@media print { @page { size: A4 portrait; margin: 0 } }')
    const copy = document.querySelector('[data-print-copy]')
    expect(copy?.className).toMatch(/(^| )hidden( |$)/)
    expect(copy?.className).toContain('print:block')
    expect(copy?.querySelector('svg')?.getAttribute('aria-label')).toBe(poster().getAttribute('aria-label'))
    expect(screen.getByRole('heading', { level: 1, name: '서식' }).closest('.print\\:hidden')).not.toBeNull()
  })

  it('AC-3603.3·AC-6604.1: 인쇄 면(인쇄 사본)에도 미리보기와 같은 병원 로고 image(병원 정보 로고)가 맨 위에 있다', async () => {
    await readyScreen()
    const logoOf = (svg: Element | null | undefined) => {
      const last = svg?.lastElementChild
      return last?.localName === 'image' ? ['href', 'x', 'y', 'width', 'height'].map((n) => last.getAttribute(n)) : null
    }
    const copy = document.querySelector('[data-print-copy]')?.querySelector('svg')
    await waitFor(() => expect(logoOf(poster())).toEqual([LOGO_URL, '227', '1011', '340', '58']))
    expect(logoOf(copy)).toEqual(logoOf(poster()))
  })

  it('AC-3506.2: [그림 파일]은 미리보기 그림을 휴진안내_2027-05.png로 내려받는다', async () => {
    const user = await readyScreen()
    await user.click(button('그림 파일'))
    expect(downloadPosterPng).toHaveBeenCalledTimes(1)
    const [svg, fileName] = vi.mocked(downloadPosterPng).mock.calls[0]
    expect(svg).toBe(poster())
    expect(fileName).toBe('휴진안내_2027-05.png')
    expect(screen.queryByText(/E-FORMS-IMAGE-FAILED/)).toBeNull()
  })

  it('AC-3506.3: 그림 파일을 못 만들면 E-FORMS-IMAGE-FAILED 문구가 보이고, 다시 되면 사라진다', async () => {
    vi.mocked(downloadPosterPng).mockResolvedValueOnce(false)
    const user = await readyScreen()
    await user.click(button('그림 파일'))
    await screen.findByText(/E-FORMS-IMAGE-FAILED/)
    expectError('E-FORMS-IMAGE-FAILED')
    await user.click(button('그림 파일'))
    expect(screen.queryByText(/E-FORMS-IMAGE-FAILED/)).toBeNull()
  })
})

describe('AC-3507.1~AC-3507.5: 저장·목록', () => {
  it('AC-3507.2: 목록에 제목과 고친 날짜가 보이고, 누르면 그 안내문이 열린다', async () => {
    vi.mocked(listNotices).mockResolvedValue([MAY, AUG])
    const user = userEvent.setup()
    render(<FormsScreen today={TODAY} />)
    const may = await screen.findByRole('button', { name: /2027년 5월 · 어린이날/ })
    expect(may.textContent).toContain('11월 10일')
    expect(button('2026년 8월 · 광복절·대체공휴일 8월 3일 고침')).toBeTruthy()
    await user.click(button('2026년 8월 · 광복절·대체공휴일 8월 3일 고침'))
    expect(field(1, '이름').value).toBe('광복절')
    expect(field(2, '이름').value).toBe('대체공휴일')
    expect(monthBox().value).toBe('2026-08')
    expect(button('2026년 8월 · 광복절·대체공휴일 8월 3일 고침').getAttribute('aria-current')).toBe('true')
    expect(screen.getByText('저장됨')).toBeTruthy()
  })

  it('AC-3507.2: 목록은 글머리 점 없이 보인다(화면 확인에서 찾은 점 — 앱은 ul 기본 점을 지우지 않는다)', async () => {
    await open()
    const list = within(screen.getByRole('region', { name: '저장한 안내문' })).getByRole('list')
    expect(list.className.split(/\s+/)).toContain('list-none')
  })

  it('AC-3507.2: 하나도 없으면 "아직 저장한 안내문이 없어요"', async () => {
    vi.mocked(listNotices).mockResolvedValue([])
    render(<FormsScreen today={TODAY} />)
    expect(await screen.findByText('아직 저장한 안내문이 없어요')).toBeTruthy()
  })

  it('AC-3507.1: 새 안내문을 저장하면 넣기를 부르고 목록 맨 위에 나타나며 저장됨이 보인다. 고쳐 저장하면 그 줄을 고친다', async () => {
    const user = await open()
    setCard(1, { '시작 날짜': '2027-05-05', 이름: ' 어린이날 ' })
    expect(screen.getByText('저장하지 않은 내용이 있어요')).toBeTruthy()
    await user.click(button('저장'))
    expect(insertNotice).toHaveBeenCalledWith({ year: 2027, month: 5, cards: [CHILDREN], theme: null })
    await screen.findByText('저장됨')
    const items = within(screen.getByRole('region', { name: '저장한 안내문' })).getAllByRole('button', { name: /고침$/ })
    expect(items.map((b) => b.textContent)).toEqual(['2027년 5월 · 어린이날 11월 10일 고침', '2026년 8월 · 광복절·대체공휴일 8월 3일 고침'])

    setCard(1, { '아래 글': '오전진료' })
    expect(screen.getByText('저장하지 않은 내용이 있어요')).toBeTruthy()
    await user.click(button('저장'))
    expect(updateNotice).toHaveBeenCalledWith('may', { year: 2027, month: 5, cards: [{ ...CHILDREN, status: '오전진료' }], theme: null })
    expect(insertNotice).toHaveBeenCalledTimes(1)
    await screen.findByText('저장됨')
  })

  it('AC-3507.3: 바뀐 내용이 있으면 다른 안내문 열기·[새로 만들기] 전에 묻고, [취소]면 그대로 둔다', async () => {
    const user = await open()
    setCard(1, { 이름: '학회' })
    confirmSpy.mockReturnValue(false)
    await user.click(button('2026년 8월 · 광복절·대체공휴일 8월 3일 고침'))
    await user.click(button('+ 새로 만들기'))
    expect(confirmSpy).toHaveBeenCalledTimes(2)
    expect(confirmSpy).toHaveBeenCalledWith('저장하지 않은 내용이 있어요. 버릴까요?')
    expect(field(1, '이름').value).toBe('학회')

    confirmSpy.mockReturnValue(true)
    await user.click(button('+ 새로 만들기'))
    expect(field(1, '이름').value).toBe('')
  })

  it('AC-3507.3: 바뀐 내용이 없으면 묻지 않고 연다', async () => {
    const user = await open()
    await user.click(button('2026년 8월 · 광복절·대체공휴일 8월 3일 고침'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(field(1, '이름').value).toBe('광복절')
  })

  it('AC-3507.4: 연 안내문에서 [지우기]를 누르고 확인하면 그 줄을 지우고 새 안내문 화면이 된다', async () => {
    const user = await open()
    expect(screen.queryByRole('button', { name: '지우기' })).toBeNull()
    await user.click(button('2026년 8월 · 광복절·대체공휴일 8월 3일 고침'))
    await user.click(button('지우기'))
    expect(confirmSpy).toHaveBeenCalledWith('이 안내문을 지울까요?')
    expect(deleteNotice).toHaveBeenCalledWith('aug')
    expect(await screen.findByText('아직 저장한 안내문이 없어요')).toBeTruthy()
    expect(field(1, '이름').value).toBe('')
    expect(screen.queryByRole('button', { name: '지우기' })).toBeNull()
  })

  it('AC-3507.4: 지우기 확인에서 [취소]면 지우지 않는다', async () => {
    const user = await open()
    await user.click(button('2026년 8월 · 광복절·대체공휴일 8월 3일 고침'))
    confirmSpy.mockReturnValue(false)
    await user.click(button('지우기'))
    expect(deleteNotice).not.toHaveBeenCalled()
  })

  it('AC-3507.5: 저장이 실패하면 적은 값은 그대로이고 E-FORMS-SAVE-FAILED와 [다시 저장]이 보인다', async () => {
    vi.mocked(insertNotice).mockResolvedValueOnce('failed')
    const user = await open()
    setCard(1, { '시작 날짜': '2027-05-05', 이름: '어린이날' })
    await user.click(button('저장'))
    await screen.findByText(/E-FORMS-SAVE-FAILED/)
    expectError('E-FORMS-SAVE-FAILED')
    expect(field(1, '이름').value).toBe('어린이날')
    await user.click(button('다시 저장'))
    expect(insertNotice).toHaveBeenCalledTimes(2)
    await screen.findByText('저장됨')
    expect(screen.queryByText(/E-FORMS-SAVE-FAILED/)).toBeNull()
  })

  it('AC-3507.5: 지우기가 실패하면 E-FORMS-SAVE-FAILED가 보이고 안내문은 그대로 열려 있다', async () => {
    vi.mocked(deleteNotice).mockResolvedValueOnce(false)
    const user = await open()
    await user.click(button('2026년 8월 · 광복절·대체공휴일 8월 3일 고침'))
    await user.click(button('지우기'))
    await screen.findByText(/E-FORMS-SAVE-FAILED/)
    expect(field(1, '이름').value).toBe('광복절')
    expect(button('지우기')).toBeTruthy()
  })

  it('AC-3507.5: 목록 읽기가 실패하면 E-FORMS-READ-FAILED와 [다시 읽기]가 보이고, 다시 읽는다', async () => {
    vi.mocked(listNotices).mockResolvedValueOnce('failed')
    const user = userEvent.setup()
    render(<FormsScreen today={TODAY} />)
    await screen.findByText(/E-FORMS-READ-FAILED/)
    expectError('E-FORMS-READ-FAILED')
    await user.click(button('다시 읽기'))
    await screen.findByRole('button', { name: /2026년 8월 · 광복절·대체공휴일/ })
    expect(listNotices).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/E-FORMS-READ-FAILED/)).toBeNull()
  })
})

// ── 병원 정보 로고 (spec clinic-profile REQ-6604 AC-6604.1·AC-6604.2, design.md 6절) ──

describe('AC-6604.1·AC-6604.2: 휴진 안내 로고 자리 — 병원 정보 로고', () => {
  const printCopy = () => document.querySelector('[data-print-copy]')?.querySelector('svg') ?? null
  const outputs = () => OUTPUTS.map((name) => (button(name) as HTMLButtonElement).disabled)
  // 마지막 자식(로고 자리)의 모양: 그림이면 [image, 주소, 맞춤], 글자면 [text, 글, 굵기]
  const logoSlot = (svg: Element | null) => {
    const last = svg?.lastElementChild
    if (last?.localName === 'image') return ['image', last.getAttribute('href'), last.getAttribute('preserveAspectRatio')]
    if (last?.localName === 'text' && last.textContent === CLINIC_NAME) return ['text', last.textContent, last.getAttribute('font-weight')]
    return null
  }
  async function readyNotice() {
    const user = await open()
    setCard(1, { '시작 날짜': '2027-05-05', 이름: '어린이날' })
    return user
  }

  it('AC-6604.1: 병원 정보를 로고까지 받아 읽고(useClinicProfile({ logo: true })), 미리보기·인쇄 사본의 로고 자리에 그 로고 그림을 비율을 지켜 그린다', async () => {
    await readyNotice()
    expect(useClinicProfile).toHaveBeenCalledWith({ logo: true })
    await waitFor(() => expect(logoSlot(poster())).toEqual(['image', LOGO_URL, 'xMidYMid meet']))
    expect(logoSlot(printCopy())).toEqual(logoSlot(poster()))
    expect(readLogoPixels).toHaveBeenCalledWith(LOGO_URL)
    expect(document.body.innerHTML).not.toContain('/poster/logo.png')
  })

  it('AC-6604.1: 로고가 없으면 로고 자리에 병원 이름이 굵은(900) 글자로 들어가고 로고 점은 읽지 않는다', async () => {
    vi.mocked(useClinicProfile).mockReturnValue(clinicView({ logoDataUrl: null }))
    await readyNotice()
    expect(logoSlot(poster())).toEqual(['text', CLINIC_NAME, '900'])
    expect(logoSlot(printCopy())).toEqual(logoSlot(poster()))
    expect(readLogoPixels).not.toHaveBeenCalled()
    expect(document.body.innerHTML).not.toContain('/poster/logo.png')
    expect(outputs()).toEqual([false, false, false])
  })

  it('AC-6604.2: 병원 정보·로고를 읽는 중에는 [인쇄·PDF]·[그림 파일]을 누를 수 없고([저장]은 된다) 로고 자리가 비며, 다 읽으면 된다', async () => {
    vi.mocked(useClinicProfile).mockReturnValue(clinicView({ state: 'loading', logoDataUrl: null, name: '' }))
    await readyNotice()
    expect(outputs()).toEqual([false, true, true])
    expect(logoSlot(poster())).toBeNull()
    await userEvent.setup().click(button('그림 파일'))
    expect(downloadPosterPng).not.toHaveBeenCalled()

    vi.mocked(useClinicProfile).mockReturnValue(clinicView())
    setCard(1, { 이름: '어린이 날' }) // 다시 그리게 한다(훅이 새 값을 준다)
    await waitFor(() => expect(logoSlot(poster())).toEqual(['image', LOGO_URL, 'xMidYMid meet']))
    expect(outputs()).toEqual([false, false, false])
  })

  it('AC-6604.2: 로고 그림의 점을 읽는 동안에도 막혀 있고, 다 읽으면 풀린다', async () => {
    let finish: (value: Awaited<ReturnType<typeof readLogoPixels>>) => void = () => {}
    vi.mocked(readLogoPixels).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await readyNotice()
    expect(outputs()).toEqual([false, true, true])
    expect(logoSlot(poster())).toBeNull()
    await act(async () => finish(GRAY_PIXELS))
    expect(outputs()).toEqual([false, false, false])
    expect(logoSlot(poster())).toEqual(['image', LOGO_URL, 'xMidYMid meet'])
  })

  it('AC-6604.2: 로고 그림을 못 읽으면(그림이 깨짐) 병원 이름 글자로 그리고 뽑기가 된다', async () => {
    vi.mocked(readLogoPixels).mockResolvedValue(null)
    await readyNotice()
    await waitFor(() => expect(logoSlot(poster())).toEqual(['text', CLINIC_NAME, '900']))
    expect(outputs()).toEqual([false, false, false])
  })

  it('AC-6604.2: 병원 정보 읽기가 실패해도(failed) 가입 이름 글자로 그리고 뽑기가 된다', async () => {
    vi.mocked(useClinicProfile).mockReturnValue(clinicView({ state: 'failed', saved: false, logoDataUrl: null, name: CLINIC_NAME }))
    await readyNotice()
    expect(logoSlot(poster())).toEqual(['text', CLINIC_NAME, '900'])
    expect(outputs()).toEqual([false, false, false])
  })

  it('AC-6604.1·AC-6604.3: [그림 파일]에 넘기는 그림에도 병원 정보 로고가 들어 있다', async () => {
    const user = await readyNotice()
    await waitFor(() => expect(logoSlot(poster())).toEqual(['image', LOGO_URL, 'xMidYMid meet']))
    await user.click(button('그림 파일'))
    const [svg] = vi.mocked(downloadPosterPng).mock.calls[0]
    expect(logoSlot(svg)).toEqual(['image', LOGO_URL, 'xMidYMid meet'])
  })
})

// ── 로고 준비 (spec logo-fit REQ-6701·REQ-6702 AC-6701.4·AC-6702.2, design.md 1·6절) ──

// 흰 배경(8×6) 가운데에 진한 네모 3×2(x 2~4, y 2~3)가 있는 로고 → 흰 배경을 지우고 자르면 3×2 진한 점만 남는다
const DARK = [20, 40, 90, 255]
const bitmapOf = (width: number, height: number, dark: (x: number, y: number) => boolean): LogoBitmap => ({
  data: Uint8ClampedArray.from(Array.from({ length: width * height }, (_, i) => (dark(i % width, Math.floor(i / width)) ? DARK : [255, 255, 255, 255])).flat()),
  width,
  height,
})
const RAW_LOGO = bitmapOf(8, 6, (x, y) => x >= 2 && x <= 4 && y >= 2 && y <= 3)
const BLANK_LOGO = bitmapOf(8, 6, () => false) // 모두 흰 그림: 지우고 나면 남는 점이 없다
const FITTED_URL = `data:image/png;base64,Rml0dGVk${'E'.repeat(40)}` // 준비한 그림(지어낸 값)
// 3×2를 휴진 안내 로고 자리(227,990 · 340×100)에 가장 크게: 높이에 묶여 150×100, 가운데 397 → x 322
const FITTED_AT = ['322', '990', '150', '100']
const ORIGINAL_AT = ['227', '1011', '340', '58']

describe('AC-6701.4·AC-6702.2: 휴진 안내 — 서식 화면이 로고를 준비해 넘긴다', () => {
  const printCopy = () => document.querySelector('[data-print-copy]')?.querySelector('svg') ?? null
  const outputs = () => OUTPUTS.map((name) => (button(name) as HTMLButtonElement).disabled)
  // 마지막 자식(로고 자리)이 그림이면 [주소, x, y, 폭, 높이, 맞춤]
  const logoOf = (svg: Element | null | undefined) => {
    const last = svg?.lastElementChild
    return last?.localName === 'image' ? ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'].map((n) => last.getAttribute(n)) : null
  }
  async function readyNotice() {
    const user = await open()
    setCard(1, { '시작 날짜': '2027-05-05', 이름: '어린이날' })
    return user
  }
  function prepareOk() {
    vi.mocked(readLogoBitmap).mockResolvedValue(RAW_LOGO)
    vi.mocked(bitmapToPngUrl).mockReturnValue(FITTED_URL)
  }

  it('AC-6701.4: 원래 로고를 크게 읽어 흰 배경을 지우고 잘라(3×2) PNG로 만들고, 미리보기·인쇄 사본은 그 준비한 그림을 로고 자리(logoRect)에 그린다', async () => {
    prepareOk()
    await readyNotice()
    await waitFor(() => expect(logoOf(poster())).toEqual([FITTED_URL, ...FITTED_AT, 'xMidYMid meet']))
    expect(logoOf(printCopy())).toEqual(logoOf(poster()))
    expect(readLogoBitmap).toHaveBeenCalledTimes(1)
    expect(readLogoBitmap).toHaveBeenCalledWith(LOGO_URL)
    expect(bitmapToPngUrl).toHaveBeenCalledTimes(1)
    const fitted = vi.mocked(bitmapToPngUrl).mock.calls[0][0]
    expect([fitted.width, fitted.height]).toEqual([3, 2])
    expect(Array.from(fitted.data)).toEqual(Array.from({ length: 6 }, () => DARK).flat())
    expect(outputs()).toEqual([false, false, false])
    expect(document.body.innerHTML).not.toContain(LOGO_URL) // 원래 로고 그림은 그리지 않는다
  })

  it('AC-6701.4: 로고 색은 준비한 그림으로 다시 읽는다(원래 로고 표본 → 준비한 그림 차례)', async () => {
    prepareOk()
    await readyNotice()
    await waitFor(() => expect(logoOf(poster())?.[0]).toBe(FITTED_URL))
    expect(vi.mocked(readLogoPixels).mock.calls.map(([href]) => href)).toEqual([LOGO_URL, FITTED_URL])
  })

  it('AC-6701.4: [인쇄·PDF]·[그림 파일]도 준비한 그림을 쓰고, 병원 정보 저장·로고 올리기·안내문 저장·서버 호출은 없다', async () => {
    prepareOk()
    const user = await readyNotice()
    await waitFor(() => expect(logoOf(poster())?.[0]).toBe(FITTED_URL))
    await user.click(button('인쇄·PDF'))
    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(logoOf(printCopy())).toEqual([FITTED_URL, ...FITTED_AT, 'xMidYMid meet'])
    await user.click(button('그림 파일'))
    const [svg] = vi.mocked(downloadPosterPng).mock.calls[0]
    expect(logoOf(svg)).toEqual([FITTED_URL, ...FITTED_AT, 'xMidYMid meet'])
    for (const fn of [saveClinicProfile, uploadLogo, removeLogo, insertNotice, updateNotice, deleteNotice]) expect(fn).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(vi.mocked(useClinicProfile).mock.results.every((r) => (r.value as ClinicProfileView).logoDataUrl === LOGO_URL)).toBe(true)
  })

  it('AC-6701.4·AC-6604.2: 준비하는 동안에는 로고 자리가 비고 [인쇄·PDF]·[그림 파일]이 막히며, 다 되면 준비한 그림이 들어가고 풀린다', async () => {
    let finish: (value: LogoBitmap | null) => void = () => {}
    vi.mocked(readLogoBitmap).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    vi.mocked(bitmapToPngUrl).mockReturnValue(FITTED_URL)
    await readyNotice()
    await waitFor(() => expect(readLogoBitmap).toHaveBeenCalled())
    expect(outputs()).toEqual([false, true, true])
    expect(logoOf(poster())).toBeNull()
    await act(async () => finish(RAW_LOGO))
    await waitFor(() => expect(logoOf(poster())).toEqual([FITTED_URL, ...FITTED_AT, 'xMidYMid meet']))
    expect(outputs()).toEqual([false, false, false])
  })

  it.each([
    ['큰 그림 읽기 실패', () => vi.mocked(readLogoBitmap).mockResolvedValue(null), false],
    ['지우고 자른 뒤 남는 점 없음(모두 흰 그림)', () => vi.mocked(readLogoBitmap).mockResolvedValue(BLANK_LOGO), false],
    ['준비한 그림(PNG) 만들기 실패', () => vi.mocked(readLogoBitmap).mockResolvedValue(RAW_LOGO), true],
    // 준비 중 뜻밖의 오류(거부)도 같은 길 — 로고 자리·뽑기 단추가 '읽는 중'에 멈추지 않는다
    ['준비 중 뜻밖의 오류', () => vi.mocked(readLogoBitmap).mockRejectedValue(new Error('x')), false],
  ] as const)('AC-6702.2: %s이면 원래 로고 그림을 원래 상자(227,1011 · 340×58)에 그리고 뽑기가 된다', async (_, arrange, madePng) => {
    arrange()
    vi.mocked(bitmapToPngUrl).mockReturnValue(madePng ? null : FITTED_URL)
    await readyNotice()
    await waitFor(() => expect(logoOf(poster())).toEqual([LOGO_URL, ...ORIGINAL_AT, 'xMidYMid meet']))
    expect(logoOf(printCopy())).toEqual(logoOf(poster()))
    expect(readLogoBitmap).toHaveBeenCalledWith(LOGO_URL)
    expect(bitmapToPngUrl).toHaveBeenCalledTimes(madePng ? 1 : 0)
    expect(vi.mocked(readLogoPixels).mock.calls.map(([href]) => href)).toEqual([LOGO_URL]) // 색은 원래 표본
    expect(outputs()).toEqual([false, false, false])
    expect(document.body.innerHTML).not.toContain(FITTED_URL)
  })

  it('AC-6702.2·AC-6604.2: 로고 표본조차 못 읽으면 준비하지 않고 지금처럼 병원 이름 글자로 그린다', async () => {
    prepareOk()
    vi.mocked(readLogoPixels).mockResolvedValue(null)
    await readyNotice()
    await waitFor(() => expect(poster().lastElementChild?.textContent).toBe(CLINIC_NAME))
    expect(poster().lastElementChild?.localName).toBe('text')
    expect(readLogoBitmap).not.toHaveBeenCalled()
    expect(bitmapToPngUrl).not.toHaveBeenCalled()
    expect(outputs()).toEqual([false, false, false])
  })

  it('AC-6701.4: 로고가 없으면(병원 이름 글자) 준비하지 않는다', async () => {
    prepareOk()
    vi.mocked(useClinicProfile).mockReturnValue(clinicView({ logoDataUrl: null }))
    await readyNotice()
    expect(poster().lastElementChild?.textContent).toBe(CLINIC_NAME)
    expect(readLogoBitmap).not.toHaveBeenCalled()
    expect(bitmapToPngUrl).not.toHaveBeenCalled()
  })
})

// ── 글씨·로고 칸 (spec form-style TASK-6, REQ-6801·REQ-6802·REQ-6803·REQ-6805, design.md 8절, 승인 시안 docs/mockups/form-style) ──

const pixelsOf = (rgba: readonly number[], n = 16) => ({ data: Uint8ClampedArray.from(Array.from({ length: n }, () => rgba).flat()), width: n, height: 1 })
const BLUE_PIXELS = pixelsOf([31, 95, 191, 255]) // 파란 로고
const LIGHT_PIXELS = pixelsOf([240, 240, 240, 255]) // 옅은 점뿐: 로고 색 칩이 남지 않는다
// 흰 배경(8×6)에 진한 점 두 개((2,2)·(4,3)) → 흰 배경을 지우고 자르면 3×2 중 4점이 투명 → 색을 칠할 수 있는 로고(tintable)
const TINT_LOGO = bitmapOf(8, 6, (x, y) => (x === 2 && y === 2) || (x === 4 && y === 3))
const LOCKED = '배경이 있는 로고라 색을 바꿀 수 없어요. 원래 색으로 그려요'
const NOTICE_HELP =
  "제목은 '진료일정안내', 본문은 위 안내 두 줄과 카드 속 글씨예요. 본문 색은 안내 두 줄과 카드 이름에 들고, 'N월'·날짜 띠·상태 글씨는 '강조 색'을 따라요. [자동]은 로고가 있으면 로고 색이에요. 자리보다 크게는 커지지 않아요."
const DIRTY = '저장하지 않은 내용이 있어요'
const RED = '#dc2626'
const NAVY = '#1f2a44'
const BLACK = '#111111'
// 카드 1에 어린이날을 적은 미리보기 값(배치 기대를 셈한다)
const BASE: ClosureNotice = { year: 2027, month: 5, theme: null, cards: [CHILDREN] }
const layoutOf = (style: FormStyle) => layoutPoster({ ...BASE, style })

const styleBox = () => screen.getByRole('group', { name: '글씨·로고' })
const slider = (name: string) => within(styleBox()).getByRole('slider', { name }) as HTMLInputElement
const chooser = (name: string) => within(styleBox()).getByRole('group', { name })
const pick = (name: string) => within(styleBox()).getByRole('button', { name })
const firstOf = (name: string) => within(chooser(name)).getAllByRole('button')[0] as HTMLButtonElement
const colorStart = (name: string) => within(styleBox()).getByLabelText(`${name} 직접 고르기`) as HTMLInputElement
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
// 그 고르기의 로고 색 칩 바탕색들(차례대로)
const logoChips = (name: string) =>
  within(chooser(name))
    .queryAllByRole('button', { name: new RegExp(`^${name} 로고 색 \\d$`) })
    .map((b) => (b as HTMLElement).style.backgroundColor)
const printCopyOf = () => document.querySelector('[data-print-copy]')?.querySelector('svg') ?? null
const textOf = (svg: Element | null | undefined, content: string) => [...(svg?.querySelectorAll('text') ?? [])].find((t) => t.textContent === content)
// 로고 자리(마지막 자식) 그림의 칠하기 필터 색: 필터 이름(url(#…))이 가리키는 filter의 feFlood flood-color. 칠하지 않으면 null
function tintOf(svg: Element | null | undefined): string | null {
  const image = svg?.lastElementChild
  const id = /^url\(#(.+)\)$/.exec(image?.getAttribute('filter') ?? '')?.[1]
  if (!svg || !id) return null
  const filter = [...svg.querySelectorAll('*')].find((el) => el.localName === 'filter' && el.getAttribute('id') === id)
  const flood = filter ? [...filter.children].find((el) => el.localName === 'feFlood') : undefined
  return flood?.getAttribute('flood-color') ?? null
}
const floods = (svg: Element | null | undefined) => [...(svg?.querySelectorAll('*') ?? [])].filter((el) => el.localName === 'feFlood').length

async function readyStyled() {
  const user = await open()
  setCard(1, { '시작 날짜': '2027-05-05', 이름: '어린이날' })
  return user
}

describe('AC-6801.1·AC-6801.6: 진료일정 안내 글씨·로고 칸', () => {
  it("AC-6801.1·AC-6801.6: 편집 칸 맨 아래(배경 칸 다음)에 '글씨·로고' 묶음이 있고 그 안에 '제목 글씨'·'본문 글씨'·'강조 색'·'로고' 줄과 도움말, [처음대로]가 있다", async () => {
    await open()
    const box = styleBox()
    const bg = screen.getByRole('region', { name: '배경' })
    expect(bg.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bg.contains(box)).toBe(false)
    expect(screen.getByRole('region', { name: '만들기' }).parentElement?.lastElementChild).toBe(box)
    expect(within(box).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['제목 글씨', '본문 글씨', '강조 색', '로고'])
    expect(within(box).getByText(NOTICE_HELP)).toBeTruthy()
    expect(within(box).getByRole('button', { name: '처음대로' })).toBeTruthy()
    expect([firstOf('제목 글씨 색'), firstOf('본문 글씨 색'), firstOf('강조 색'), firstOf('로고 색')].map((b) => b.textContent)).toEqual(['자동', '자동', '자동', '원래 색'])
  })
})

describe('AC-6801.2·AC-6801.4·AC-6805.4: 고른 크기·색이 미리보기·인쇄 사본·그림 파일에', () => {
  it('AC-6801.2·AC-6805.4: 제목·본문 크기 밀대를 밀면 N%가 바뀌고 진료일정안내·안내 두 줄·카드 이름 크기가 그 값의 배치대로다(미리보기·인쇄 사본·그림 파일)', async () => {
    const user = await readyStyled()
    await waitFor(() => expect(poster().lastElementChild?.localName).toBe('image'))
    expect(within(styleBox()).getAllByText('100%')).toHaveLength(3)
    const before = layoutOf(DEFAULT_STYLE)
    expect(textOf(poster(), '진료일정안내')?.getAttribute('font-size')).toBe(String(before.title.size))

    fireEvent.change(slider('제목 글씨 크기'), { target: { value: '80' } })
    fireEvent.change(slider('본문 글씨 크기'), { target: { value: '130' } })
    expect(within(styleBox()).getByText('80%')).toBeTruthy()
    expect(within(styleBox()).getByText('130%')).toBeTruthy()
    const after = layoutOf({ ...DEFAULT_STYLE, titleScale: 80, bodyScale: 130 })
    expect(after.title.size).toBeLessThan(before.title.size)
    const sizes = (svg: Element | null | undefined) =>
      ['진료일정안내', after.lead[0].text, after.lead[1].text, '어린이날'].map((t) => textOf(svg, t)?.getAttribute('font-size'))
    const want = [after.title.size, after.lead[0].size, after.lead[1].size, after.cards[0].name.size].map(String)
    expect(sizes(poster())).toEqual(want)
    expect(sizes(printCopyOf())).toEqual(want)
    await user.click(button('그림 파일'))
    expect(sizes(vi.mocked(downloadPosterPng).mock.calls[0][0])).toEqual(want)
  })

  it('AC-6801.2: 로고 크기 밀대를 밀면 로고가 가운데를 지킨 채 그 %로 커진다(미리보기·인쇄 사본)', async () => {
    await readyStyled()
    const at = (svg: Element | null | undefined) => ['x', 'y', 'width', 'height'].map((n) => svg?.lastElementChild?.getAttribute(n))
    await waitFor(() => expect(at(poster())).toEqual(ORIGINAL_AT))
    fireEvent.change(slider('로고 크기'), { target: { value: '150' } })
    expect(within(styleBox()).getByText('150%')).toBeTruthy()
    const big = scaleLogoRect(LOGO, 150, LOGO_MAX)
    expect(at(poster())).toEqual([big.x, big.y, big.width, big.height].map(String))
    expect(at(printCopyOf())).toEqual(at(poster()))
  })

  it("AC-6801.4: '제목 글씨 색' 칩은 진료일정안내만, '본문 글씨 색' 칩은 안내 두 줄과 카드 이름을 그 색으로 바꾸고(아래 글은 그대로), [자동]은 지금 색으로 되돌린다", async () => {
    const user = await readyStyled()
    const L = layoutOf(DEFAULT_STYLE)
    const fills = (svg: Element | null | undefined) =>
      ['진료일정안내', L.lead[0].text, L.lead[1].text, '어린이날', '휴진'].map((t) => textOf(svg, t)?.getAttribute('fill'))
    const before = fills(poster())
    expect(before.slice(0, 4)).toEqual([NOTICE_INK, NOTICE_LEAD, NOTICE_LEAD, NOTICE_INK])
    await user.click(pick('제목 글씨 색 빨강'))
    expect(fills(poster())).toEqual([RED, NOTICE_LEAD, NOTICE_LEAD, NOTICE_INK, before[4]])
    expect(pick('제목 글씨 색 빨강').getAttribute('aria-pressed')).toBe('true')
    await user.click(pick('본문 글씨 색 남색'))
    expect(fills(poster())).toEqual([RED, NAVY, NAVY, NAVY, before[4]])
    expect(fills(printCopyOf())).toEqual(fills(poster()))
    await user.click(firstOf('제목 글씨 색'))
    expect(fills(poster())[0]).toBe(NOTICE_INK)
    expect(firstOf('제목 글씨 색').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('AC-6801.3·AC-6803.2: 시작 색과 [자동] = 로고 색', () => {
  it('AC-6803.2·AC-6801.3: 로고 두 색이 있으면 [자동] 강조 색은 onWhite(main)이라 지금 색 글·강조 색 칸 시작 색·N월이 그 색이고, 제목 칸 시작 색은 dark, 본문은 #3a3a3a, 로고는 로고 색 칩 첫째다', async () => {
    vi.mocked(readLogoPixels).mockResolvedValue(BLUE_PIXELS)
    const colors = logoPalette(BLUE_PIXELS.data, BLUE_PIXELS.width, BLUE_PIXELS.height)
    expect(colors).not.toBeNull()
    const auto = onWhite(colors!.main)
    const user = await readyStyled()
    await waitFor(() => expect(within(styleBox()).getByText(`자동 ${auto}`)).toBeTruthy())
    expect(colorStart('강조 색').value).toBe(auto)
    expect(colorStart('제목 글씨 색').value).toBe(colors!.dark)
    expect(colorStart('본문 글씨 색').value).toBe(NOTICE_LEAD)
    expect(colorStart('로고 색').value).toBe(logoSwatches(BLUE_PIXELS.data, BLUE_PIXELS.width, BLUE_PIXELS.height)[0])
    const monthFill = (svg: Element | null | undefined) =>
      [...(svg?.querySelectorAll('text') ?? [])].find((t) => /^\d{1,2}월$/.test(t.textContent ?? ''))?.getAttribute('fill')
    expect(monthFill(poster())).toBe(auto)
    expect(monthFill(printCopyOf())).toBe(auto)
    expect(textOf(poster(), '진료일정안내')?.getAttribute('fill')).toBe(colors!.dark)
    expect(textOf(printCopyOf(), '진료일정안내')?.getAttribute('fill')).toBe(colors!.dark)

    // 직접 고른 강조 색은 로고가 있어도 늘 그 색이다
    await user.click(pick('강조 색 빨강'))
    expect(within(styleBox()).getByText(RED)).toBeTruthy()
    expect(monthFill(poster())).toBe(RED)
    expect(monthFill(printCopyOf())).toBe(RED)
  })

  it('AC-6801.3: 로고 두 색이 없으면 제목 시작 색은 지금 색, 로고 시작 색은 로고 색 칩 첫째, 칩이 없으면(이름 글자 로고) 검정이다', async () => {
    await readyStyled()
    await waitFor(() => expect(logoChips('로고 색')).toHaveLength(1))
    expect(colorStart('제목 글씨 색').value).toBe(NOTICE_INK)
    expect(colorStart('로고 색').value).toBe(logoSwatches(GRAY_PIXELS.data, GRAY_PIXELS.width, GRAY_PIXELS.height)[0])
    cleanup()
    vi.mocked(useClinicProfile).mockReturnValue(clinicView({ logoDataUrl: null }))
    await readyStyled()
    expect(logoChips('로고 색')).toEqual([])
    expect(colorStart('로고 색').value).toBe(BLACK)
  })
})

describe('AC-6802.2·AC-6802.3: 로고 색 칩', () => {
  it('AC-6802.3: 로고 색 칩은 logoPalette와 같은 표본(준비에 성공하면 준비한 그림)에서 뽑아 네 고르기 모두에 넘기고, readLogoPixels를 더 부르지 않는다', async () => {
    vi.mocked(readLogoBitmap).mockResolvedValue(RAW_LOGO)
    vi.mocked(bitmapToPngUrl).mockReturnValue(FITTED_URL)
    vi.mocked(readLogoPixels).mockImplementation(async (href) => (href === FITTED_URL ? BLUE_PIXELS : GRAY_PIXELS))
    await readyStyled()
    const want = logoSwatches(BLUE_PIXELS.data, BLUE_PIXELS.width, BLUE_PIXELS.height).map(rgb)
    expect(want.length).toBeGreaterThan(0)
    await waitFor(() => expect(logoChips('제목 글씨 색')).toEqual(want))
    for (const name of ['본문 글씨 색', '강조 색', '로고 색']) expect(logoChips(name), name).toEqual(want)
    expect(within(chooser('제목 글씨 색')).getByText('로고 색')).toBeTruthy()
    expect(vi.mocked(readLogoPixels).mock.calls.map(([href]) => href)).toEqual([LOGO_URL, FITTED_URL])
  })

  it('AC-6802.3: 준비에 실패하면 로고 색 칩은 원래 표본에서 뽑는다(readLogoPixels 한 번)', async () => {
    vi.mocked(readLogoPixels).mockResolvedValue(BLUE_PIXELS)
    await readyStyled()
    await waitFor(() => expect(logoChips('제목 글씨 색')).toEqual(logoSwatches(BLUE_PIXELS.data, BLUE_PIXELS.width, BLUE_PIXELS.height).map(rgb)))
    expect(vi.mocked(readLogoPixels).mock.calls.map(([href]) => href)).toEqual([LOGO_URL])
  })

  it.each([
    ['로고가 없음(이름 글자)', () => vi.mocked(useClinicProfile).mockReturnValue(clinicView({ logoDataUrl: null }))],
    ['로고 표본을 못 읽음', () => vi.mocked(readLogoPixels).mockResolvedValue(null)],
    ['남는 점이 없음(옅은 점뿐)', () => vi.mocked(readLogoPixels).mockResolvedValue(LIGHT_PIXELS)],
  ] as const)("AC-6802.2: %s이면 색 고르기에 '로고 색' 글과 칩이 없고 기본 색 16가지만 있다", async (_, arrange) => {
    arrange()
    await readyStyled()
    await waitFor(() => expect((button('그림 파일') as HTMLButtonElement).disabled).toBe(false)) // 로고를 다 읽었다
    for (const name of ['제목 글씨 색', '본문 글씨 색', '강조 색', '로고 색']) {
      expect(logoChips(name), name).toEqual([])
      expect(within(chooser(name)).queryByText('로고 색'), name).toBeNull()
      expect(within(chooser(name)).getByText('기본 색'), name).toBeTruthy()
    }
  })
})

describe('AC-6805.3·AC-6801.8: 로고 색 칠하기와 막기', () => {
  it('AC-6805.3·AC-6805.4: 준비한 그림에 투명 점이 넉넉하면(tintable) 로고 색을 고를 수 있고, 고른 색으로 모양만 칠한다(미리보기·인쇄 사본·그림 파일), [원래 색]이면 칠하지 않는다', async () => {
    vi.mocked(readLogoBitmap).mockResolvedValue(TINT_LOGO)
    vi.mocked(bitmapToPngUrl).mockReturnValue(FITTED_URL)
    const user = await readyStyled()
    await waitFor(() => expect(poster().lastElementChild?.getAttribute('href')).toBe(FITTED_URL))
    expect(logoTintable(vi.mocked(bitmapToPngUrl).mock.calls[0][0])).toBe(true)
    expect(within(styleBox()).queryByText(LOCKED)).toBeNull()
    expect(colorStart('로고 색').disabled).toBe(false)
    expect(tintOf(poster())).toBeNull()

    await user.click(pick('로고 색 흰색'))
    expect(tintOf(poster())).toBe('#ffffff')
    expect(tintOf(printCopyOf())).toBe('#ffffff')
    await user.click(button('그림 파일'))
    expect(tintOf(vi.mocked(downloadPosterPng).mock.calls[0][0])).toBe('#ffffff')

    await user.click(firstOf('로고 색'))
    expect(tintOf(poster())).toBeNull()
    expect(floods(poster())).toBe(0)
  })

  it.each([
    ['배경이 남은 준비한 그림(투명 점 10% 미만)', true],
    ['준비에 실패해 원래 그림을 쓴 경우', false],
  ] as const)('AC-6801.8·AC-6805.3: %s이면 로고 색 고르기가 막히고 까닭 글이 보이며, 저장된 로고 색은 지우지 않고 칠하지도 않는다(크기 밀대는 된다)', async (_, prepared) => {
    if (prepared) {
      vi.mocked(readLogoBitmap).mockResolvedValue(RAW_LOGO)
      vi.mocked(bitmapToPngUrl).mockReturnValue(FITTED_URL)
    }
    const styled: SavedNotice = { ...MAY, id: 'sty', style: { ...DEFAULT_STYLE, logoColor: '#ffffff' } }
    vi.mocked(listNotices).mockResolvedValue([AUG, styled])
    const user = await open()
    await user.click(screen.getByRole('button', { name: /^2027년 5월 · 어린이날/ }))
    await waitFor(() => expect(poster().lastElementChild?.getAttribute('href')).toBe(prepared ? FITTED_URL : LOGO_URL))
    if (prepared) expect(logoTintable(vi.mocked(bitmapToPngUrl).mock.calls[0][0])).toBe(false)
    for (const b of within(chooser('로고 색')).getAllByRole('button') as HTMLButtonElement[]) expect(b.disabled).toBe(true)
    expect(colorStart('로고 색').disabled).toBe(true)
    expect(within(styleBox()).getByText(LOCKED)).toBeTruthy()
    expect(pick('로고 색 흰색').getAttribute('aria-pressed')).toBe('true')
    expect(tintOf(poster())).toBeNull()
    expect(floods(poster())).toBe(0)

    expect(slider('로고 크기').disabled).toBe(false)
    fireEvent.change(slider('로고 크기'), { target: { value: '120' } })
    await user.click(button('저장'))
    expect(updateNotice).toHaveBeenCalledWith('sty', expect.objectContaining({ style: { ...DEFAULT_STYLE, logoColor: '#ffffff', logoScale: 120 } }))
  })

  it('AC-6805.3: 이름 글자 로고는 로고 색을 고를 수 있고 글자를 그 색으로 그린다(미리보기·인쇄 사본)', async () => {
    vi.mocked(useClinicProfile).mockReturnValue(clinicView({ logoDataUrl: null }))
    const user = await readyStyled()
    expect(within(styleBox()).queryByText(LOCKED)).toBeNull()
    await user.click(pick('로고 색 빨강'))
    expect(poster().lastElementChild?.textContent).toBe(CLINIC_NAME)
    expect(poster().lastElementChild?.getAttribute('fill')).toBe(RED)
    expect(printCopyOf()?.lastElementChild?.getAttribute('fill')).toBe(RED)
  })
})

describe('AC-6801.7: [처음대로]', () => {
  it('AC-6801.7: [처음대로]를 누르면 크기 셋이 100, 색 셋이 자동·원래 색, 강조 색도 자동이 되고 연 안내문의 바뀐 내용이 사라진다', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /^2026년 8월 · 광복절·대체공휴일/ }))
    expect(screen.queryByText(DIRTY)).toBeNull()
    fireEvent.change(slider('제목 글씨 크기'), { target: { value: '120' } })
    fireEvent.change(slider('본문 글씨 크기'), { target: { value: '85' } })
    fireEvent.change(slider('로고 크기'), { target: { value: '140' } })
    await user.click(pick('제목 글씨 색 빨강'))
    await user.click(pick('본문 글씨 색 남색'))
    await user.click(pick('강조 색 초록'))
    expect(screen.getByText(DIRTY)).toBeTruthy()

    await user.click(within(styleBox()).getByRole('button', { name: '처음대로' }))
    expect(['제목 글씨 크기', '본문 글씨 크기', '로고 크기'].map((name) => slider(name).value)).toEqual(['100', '100', '100'])
    expect(within(styleBox()).getAllByText('100%')).toHaveLength(3)
    for (const name of ['제목 글씨 색', '본문 글씨 색', '강조 색', '로고 색']) expect(firstOf(name).getAttribute('aria-pressed'), name).toBe('true')
    expect(within(styleBox()).getByText(/^자동 #[0-9a-f]{6}$/)).toBeTruthy()
    expect(screen.queryByText(DIRTY)).toBeNull()
    expect(textOf(poster(), '진료일정안내')?.getAttribute('font-size')).toBe(String(layoutPoster(AUG).title.size))
  })
})
