// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadPosterPng } from '@/lib/forms/png'
import { deleteNotice, insertNotice, listNotices, updateNotice } from '@/lib/storage/formNotices'
import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'
import type { NoticeCard, SavedNotice } from '@/types/forms'
import { FormsScreen } from './FormsScreen'

// 서식 화면(spec forms TASK-12, REQ-3501~3507, design.md 10절, 승인 시안 docs/mockups/forms/screen.html).
// 가짜: fetch(AI 경로)·저장 모듈·window.print·downloadPosterPng·confirm. 나머지(검사·테마·배치·안내문 그림)는 진짜를 지난다.
// 오늘은 prop으로 2026-11-10(한국 날짜)을 준다

vi.mock('@/lib/storage/formNotices', () => ({
  listNotices: vi.fn(),
  insertNotice: vi.fn(),
  updateNotice: vi.fn(),
  deleteNotice: vi.fn(),
}))
vi.mock('@/lib/forms/png', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/png')>()),
  downloadPosterPng: vi.fn(),
}))

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

  it('AC-3603.3: 인쇄 면(인쇄 사본)에도 미리보기와 같은 병원 로고 image가 맨 위에 있다', async () => {
    await readyScreen()
    const logoOf = (svg: Element | null | undefined) => {
      const last = svg?.lastElementChild
      return last?.localName === 'image' ? ['href', 'x', 'y', 'width', 'height'].map((n) => last.getAttribute(n)) : null
    }
    const copy = document.querySelector('[data-print-copy]')?.querySelector('svg')
    expect(logoOf(poster())).toEqual(['/poster/logo.png', '227', '1011', '340', '58'])
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
