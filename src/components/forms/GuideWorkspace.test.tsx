// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { downloadGuidePng, downloadPosterPng } from '@/lib/forms/png'
import { deleteGuide, insertGuide, listGuides, updateGuide } from '@/lib/storage/formGuides'
import { listNotices } from '@/lib/storage/formNotices'
import type { ErrorCode } from '@/types/errors'
import { PICTURES, type GuideContent, type GuideDrawing, type GuideLine, type SavedGuide } from '@/types/formGuide'
import type { SavedNotice } from '@/types/forms'
import { FormsScreen } from './FormsScreen'

// 서식 화면 — 도구 단추와 환자 안내문 한 벌(spec forms-guide TASK-10, REQ-4501·4502·4506·4507·4509·4513, design.md 9절,
// 승인 시안 docs/mockups/forms-guide/index.html ?s=screen · go=draw|drawing).
// 서식 화면(FormsScreen)을 그려 [환자 안내문]을 눌러 들어간다. 가짜: fetch(AI 두 경로)·저장 모듈 둘·window.print·confirm·그림 파일 내려받기.
// 나머지(칸 검사·배치·안내문 그림·화면 상태)는 진짜를 지난다

vi.mock('@/lib/storage/formNotices', () => ({
  listNotices: vi.fn(),
  insertNotice: vi.fn(),
  updateNotice: vi.fn(),
  deleteNotice: vi.fn(),
}))
vi.mock('@/lib/storage/formGuides', () => ({
  listGuides: vi.fn(),
  insertGuide: vi.fn(),
  updateGuide: vi.fn(),
  deleteGuide: vi.fn(),
}))
vi.mock('@/lib/forms/png', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/png')>()),
  downloadPosterPng: vi.fn(),
  downloadGuidePng: vi.fn(),
}))

const TODAY = '2026-11-10'
const L = (text: string, em = ''): GuideLine => ({ text, em })

// 요청서 예시(design.md 10절) 1·2·5·6번
const INSURANCE: GuideContent = {
  tag: '보험 서류 안내', subtitle: '보험사에 낼 서류는', big1: '수납할 때', big2: '말씀해 주세요', firstSmall: false,
  boxTop: '이렇게 말씀해 주세요', boxBottom: '"보험 서류 필요해요"', picture: 'document', drawing: null, bandTitle: '이런 서류가 필요하실 때', mark: 'check',
  lines: [L('진단서'), L('진료비 영수증'), L('진료비 세부내역서'), L('통원 확인서')], note: '필요한 서류는 보험사마다 다르니 미리 확인해 주세요',
}
const CD: GuideContent = {
  tag: '영상 CD 안내', subtitle: '다른 병원 영상 CD는', big1: '접수할 때', big2: '먼저 주세요', firstSmall: false,
  boxTop: '이렇게 말씀해 주세요', boxBottom: '"영상 CD 가져왔어요"', picture: 'disc', drawing: null, bandTitle: '이런 영상을 가져오셨다면', mark: 'check',
  lines: [L('엑스레이'), L('CT'), L('MRI')], note: '미리 주시면 진료 때 바로 확인할 수 있습니다',
}
const CLOCK: GuideContent = {
  tag: '진료 시작 전 안내', subtitle: '지금은 진료 시작 전입니다', big1: '순서 대기표를', big2: '적어 주세요', firstSmall: false,
  boxTop: '순서 대기표는', boxBottom: '왼쪽 아래에 있습니다', picture: 'clock', drawing: null, bandTitle: '', mark: 'number',
  lines: [L('순서 대기표를 작성해 주세요'), L('자리에 앉아 기다려 주세요'), L('적으신 순서대로 접수해 드립니다')], note: '진료는 오전 9시, 오후 2시에 시작합니다',
}
const MANUAL: GuideContent = {
  tag: '도수치료 안내', subtitle: '도수치료 관리급여 적용', big1: '1회 비용', big2: '43,850원', firstSmall: true,
  boxTop: '2026년 7월 1일부터', boxBottom: '건강보험 적용 중입니다', picture: 'spine', drawing: null, bandTitle: '도수치료 전에 꼭 확인하세요', mark: 'check',
  lines: [
    L('물리치료를 먼저 2주 이상 · 4회 이상 받은 뒤', '2주 이상 · 4회 이상'),
    L('물리치료로 좋아지지 않을 때 적용', '좋아지지 않을 때'),
    L('도수치료는 주 2회, 1년 15회까지', '주 2회, 1년 15회'),
  ],
  note: '',
}
const SAVED_INS: SavedGuide = { id: 'ins', updatedAt: '2026-11-12T01:00:00.000Z', content: INSURANCE }
const SAVED_CLOCK: SavedGuide = { id: 'clock', updatedAt: '2026-11-03T01:00:00.000Z', content: CLOCK }
const INS_ITEM = '보험 서류 안내 11월 12일 고침'
const CLOCK_ITEM = '진료 시작 전 안내 11월 3일 고침'
const INS_LABEL = '보험 서류 안내: 보험사에 낼 서류는 수납할 때 말씀해 주세요'

// AI로 그린 그림(앱이 받는 모양: 도형·색 이름·숫자)
const WHEELCHAIR: GuideDrawing = {
  subject: '휠체어',
  shapes: [
    { kind: 'circle', nums: [85, 85, 50], d: '', fill: 'yellow', stroke: 'dark', width: 8 },
    { kind: 'rect', nums: [60, 60, 50, 30, 4], d: '', fill: 'white', stroke: 'dark', width: 6 },
  ],
}

const AUG: SavedNotice = {
  id: 'aug',
  year: 2026,
  month: 8,
  cards: [{ start: '2026-08-15', end: null, name: '광복절', status: '휴진' }],
  theme: null,
  updatedAt: '2026-08-03T01:00:00.000Z',
}

const MEMO_NOTE = '전화번호·주민번호·메일 주소는 적지 마세요. 적은 글은 정리할 때만 AI로 보내고 저장하지 않아요. AI는 적은 글에 없는 숫자를 넣지 않아요'
const DRAW_NOTE = '적은 낱말만 AI로 보내요. 마음에 안 들면 다시 눌러 새로 그려요'
const OUTPUTS = ['저장', '인쇄·PDF', '그림 파일']

const fetchSpy = vi.fn<typeof fetch>()
const printSpy = vi.fn()
const confirmSpy = vi.fn<(message?: string) => boolean>()

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const tidyAnswer = (guide: GuideContent, truncated = false) => json({ guide, truncated })
const drawAnswer = (drawing: GuideDrawing) => json({ drawing })

beforeEach(() => {
  vi.mocked(listNotices).mockResolvedValue([AUG])
  vi.mocked(listGuides).mockResolvedValue([SAVED_INS, SAVED_CLOCK])
  vi.mocked(insertGuide).mockImplementation(async (content) => ({ id: 'new1', updatedAt: '2026-11-15T05:00:00.000Z', content }))
  vi.mocked(updateGuide).mockImplementation(async (id, content) => ({ id, updatedAt: '2026-11-15T06:00:00.000Z', content }))
  vi.mocked(deleteGuide).mockResolvedValue(true)
  vi.mocked(downloadGuidePng).mockResolvedValue(true)
  vi.mocked(downloadPosterPng).mockResolvedValue(true)
  fetchSpy.mockResolvedValue(tidyAnswer(INSURANCE))
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

// ── 찾기 ─────────────────────────────────────────────
// 숨긴 도구(hidden)의 칸은 역할 찾기에 잡히지 않는다. 글 칸은 보이는 '만들기' 안에서 찾는다
const tools = () => screen.getByRole('group', { name: '서식 도구' })
const tool = (name: '휴진 안내' | '환자 안내문') => within(tools()).getByRole('button', { name })
const listRegion = () => screen.getByRole('region', { name: '저장한 환자 안내문' })
const editor = () => screen.getByRole('region', { name: '만들기' })
const preview = () => screen.getByRole('region', { name: '미리보기' })
const poster = () => within(preview()).getByRole('img')
const input = (label: string) => within(editor()).getByLabelText(label) as HTMLInputElement
const memoBox = () => within(editor()).getByRole('textbox', { name: '대충 적기' }) as HTMLTextAreaElement
const pictureBox = () => within(editor()).getByRole('combobox', { name: '그림' }) as HTMLSelectElement
const subjectBox = () => within(editor()).getByRole('textbox', { name: '새로 그릴 것' }) as HTMLInputElement
const firstSmallBox = () => within(editor()).getByRole('checkbox', { name: '윗줄 작게' }) as HTMLInputElement
const tidyButton = () => within(editor()).getByRole('button', { name: /^(?:정리하기|정리하는 중…)$/ }) as HTMLButtonElement
const drawButton = () => within(editor()).getByRole('button', { name: /^(?:AI로 그림 그리기|그리는 중…)$/ }) as HTMLButtonElement
const markButton = (name: '✓ 체크' | '1·2·3 번호') => within(within(editor()).getByRole('group', { name: '줄 표시' })).getByRole('button', { name })
const lineBox = (n: number) => input(`줄 ${n}`)
const emBox = (n: number) => input(`줄 ${n} 노랑 강조`)
const lineBoxes = () => within(editor()).queryAllByRole('textbox', { name: /^줄 \d$/ }) as HTMLInputElement[]
const removeButtons = () => within(editor()).getAllByRole('button', { name: '빼기' }) as HTMLButtonElement[]
const addLineButton = () => within(editor()).getByRole('button', { name: '+ 줄 더하기' }) as HTMLButtonElement
const output = (name: string) => within(preview()).getByRole('button', { name }) as HTMLButtonElement
const listItem = (name: string) => within(listRegion()).getByRole('button', { name })
const listTexts = () => within(listRegion()).getAllByRole('button', { name: /고침$/ }).map((b) => b.textContent)
const printCopies = () => Array.from(document.querySelectorAll('[data-print-copy]'))
const drawnShapes = () => Array.from(poster().querySelectorAll('g[clip-path] > *'))
const reasonOf = (box: HTMLElement) => document.getElementById(box.getAttribute('aria-describedby') ?? '')?.textContent

const change = (box: HTMLElement, value: string) => fireEvent.change(box, { target: { value } })

// 서식 화면을 열고 [환자 안내문]을 눌러 목록이 읽힐 때까지
async function openGuide(waitFor: string | RegExp = INS_ITEM) {
  const user = userEvent.setup()
  render(<FormsScreen today={TODAY} />)
  await screen.findByRole('button', { name: /광복절/ })
  await user.click(tool('환자 안내문'))
  if (typeof waitFor === 'string') await within(listRegion()).findByRole('button', { name: waitFor })
  else await within(listRegion()).findByText(waitFor)
  return user
}

async function tidy(user: ReturnType<typeof userEvent.setup>, text = '보험 서류 필요하면 수납할 때 말해 달라고') {
  await user.type(memoBox(), text)
  await user.click(tidyButton())
}

async function draw(user: ReturnType<typeof userEvent.setup>, subject = '휠체어') {
  await user.type(subjectBox(), subject)
  await user.click(drawButton())
}

const expectError = (code: ErrorCode) => {
  const alert = screen.getAllByRole('alert').find((el) => el.textContent?.includes(code))
  expect(alert, code).toBeDefined()
  expect(alert?.textContent).toContain(errorInfo(code).what)
  expect(alert?.textContent).toContain(errorInfo(code).fix)
}

// ── REQ-4501: 도구 단추 ─────────────────────────────────

describe('AC-4501.1~AC-4501.4: 도구 단추와 서식 종류 나누기', () => {
  it('AC-4501.1: 처음에는 도구 줄에 [휴진 안내](눌림)·[환자 안내문](안 눌림)이 이 차례로 있고 휴진 안내 목록이 보인다', async () => {
    render(<FormsScreen today={TODAY} />)
    await screen.findByRole('button', { name: /광복절/ })
    const buttons = within(tools()).getAllByRole('button')
    expect(buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['휴진 안내', 'true'],
      ['환자 안내문', 'false'],
    ])
    expect(screen.getByRole('region', { name: '저장한 안내문' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: '저장한 환자 안내문' })).toBeNull()
  })

  it('AC-4501.2: [환자 안내문]을 누르면 눌린 상태가 되고 환자 안내문 목록·만들기·미리보기만 보이며, 목록은 처음 누를 때 한 번만 읽는다', async () => {
    const user = userEvent.setup()
    render(<FormsScreen today={TODAY} />)
    await screen.findByRole('button', { name: /광복절/ })
    expect(listGuides).not.toHaveBeenCalled() // 서식 화면을 열 때는 읽지 않는다

    await user.click(tool('환자 안내문'))
    expect(tool('환자 안내문').getAttribute('aria-pressed')).toBe('true')
    expect(tool('휴진 안내').getAttribute('aria-pressed')).toBe('false')
    await within(listRegion()).findByRole('button', { name: INS_ITEM })
    // 휴진 안내의 목록·칸·미리보기는 보이지 않는다
    expect(screen.queryByRole('region', { name: '저장한 안내문' })).toBeNull()
    expect(screen.queryByRole('group', { name: '카드 1' })).toBeNull()
    expect(screen.getAllByRole('region', { name: '만들기' })).toHaveLength(1)
    expect(screen.getAllByRole('region', { name: '미리보기' })).toHaveLength(1)
    expect(within(editor()).getByRole('group', { name: '노란 윗단' })).toBeTruthy()
    expect(within(editor()).getByRole('group', { name: '진회색 띠' })).toBeTruthy()
    // 미리보기는 환자 안내문 그림(로고 400×68이 x 197에)이다
    const logo = poster().lastElementChild
    expect(['href', 'x', 'y', 'width', 'height'].map((n) => logo?.getAttribute(n))).toEqual(['/poster/logo.png', '197', '1005', '400', '68'])

    await user.click(tool('휴진 안내'))
    expect(screen.getByRole('region', { name: '저장한 안내문' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: '저장한 환자 안내문' })).toBeNull()
    await user.click(tool('환자 안내문'))
    expect(listRegion()).toBeTruthy()
    expect(listGuides).toHaveBeenCalledTimes(1)
  })

  it('AC-4501.3: 한쪽에서 고치던 내용·적은 글은 다른 도구로 갔다 와도 그대로이고 버릴지 묻지 않는다', async () => {
    const user = userEvent.setup()
    render(<FormsScreen today={TODAY} />)
    await screen.findByRole('button', { name: /광복절/ })
    const closureMemo = () => within(screen.getByRole('region', { name: '만들기' })).getByRole('textbox', { name: '대충 적기' }) as HTMLTextAreaElement
    const closureName = () => within(screen.getByRole('group', { name: '카드 1' })).getByLabelText('이름') as HTMLInputElement
    change(closureMemo(), '5/5 어린이날 휴진')
    change(closureName(), '학회')

    await user.click(tool('환자 안내문'))
    await within(listRegion()).findByRole('button', { name: INS_ITEM })
    change(memoBox(), '휠체어 빌려 준다고')
    change(input('머리표'), '휠체어 안내')
    change(subjectBox(), '휠체어')

    await user.click(tool('휴진 안내'))
    expect(closureMemo().value).toBe('5/5 어린이날 휴진')
    expect(closureName().value).toBe('학회')

    await user.click(tool('환자 안내문'))
    expect(memoBox().value).toBe('휠체어 빌려 준다고')
    expect(input('머리표').value).toBe('휠체어 안내')
    expect(subjectBox().value).toBe('휠체어')
    expect(within(preview()).getByText('저장하지 않은 내용이 있어요')).toBeTruthy()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('AC-4501.4: 인쇄 사본은 보이는 도구의 안내문 하나뿐이다', async () => {
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    expect(printCopies()).toHaveLength(1)
    expect(printCopies()[0]!.querySelector('svg')?.getAttribute('aria-label')).toBe(INS_LABEL)

    await user.click(tool('휴진 안내'))
    expect(printCopies()).toHaveLength(1)
    expect(printCopies()[0]!.querySelector('svg')?.getAttribute('aria-label')).toMatch(/진료일정안내/)

    await user.click(tool('환자 안내문'))
    expect(printCopies()).toHaveLength(1)
    expect(printCopies()[0]!.querySelector('svg')?.getAttribute('aria-label')).toBe(INS_LABEL)
  })
})

// ── REQ-4509: 인쇄·그림 파일 ────────────────────────────

describe('AC-4509.1·AC-4509.2: 뽑기', () => {
  it('AC-4509.1: [인쇄·PDF]는 인쇄 창을 열고, 인쇄 면에는 A4 한 장의 환자 안내문 그림만 나온다', async () => {
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    await user.click(output('인쇄·PDF'))
    expect(printSpy).toHaveBeenCalledTimes(1)
    const pageRules = Array.from(document.querySelectorAll('style')).filter((s) => s.textContent?.includes('@page'))
    expect(pageRules.map((s) => s.textContent)).toEqual(['@media print { @page { size: A4 portrait; margin: 0 } }'])
    const [copy] = printCopies()
    expect(copy?.className).toMatch(/(^| )hidden( |$)/)
    expect(copy?.className).toContain('print:block')
    expect(copy?.querySelectorAll('svg')).toHaveLength(1)
    expect(copy?.querySelector('svg')?.getAttribute('aria-label')).toBe(poster().getAttribute('aria-label'))
    expect(copy?.firstElementChild?.className).toContain('h-[297mm] w-[210mm]')
    // 화면 칸(목록·만들기·미리보기)은 인쇄 면에서 숨는다
    expect(listRegion().closest('.print\\:hidden')).not.toBeNull()
    expect(preview().closest('.print\\:hidden')).not.toBeNull()
  })

  it('AC-4509.2: [그림 파일]은 미리보기 그림을 환자안내문_<머리표>.png로 내려받고, 못 만들면 E-FORMS-IMAGE-FAILED가 보였다가 다시 되면 사라진다', async () => {
    vi.mocked(downloadGuidePng).mockResolvedValueOnce(false)
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    await user.click(output('그림 파일'))
    expect(downloadGuidePng).toHaveBeenCalledTimes(1)
    const [svg, fileName] = vi.mocked(downloadGuidePng).mock.calls[0]!
    expect(svg).toBe(poster())
    expect(fileName).toBe('환자안내문_보험 서류 안내.png')
    expect(downloadPosterPng).not.toHaveBeenCalled()
    await within(preview()).findByText(/E-FORMS-IMAGE-FAILED/)
    expectError('E-FORMS-IMAGE-FAILED')
    await user.click(output('그림 파일'))
    expect(downloadGuidePng).toHaveBeenCalledTimes(2)
    expect(within(preview()).queryByText(/E-FORMS-IMAGE-FAILED/)).toBeNull()
  })
})

// ── REQ-4506: 대충 적고 AI로 정리하기 ───────────────────

describe('AC-4506.1~AC-4506.3: 대충 적고 AI로 정리하기', () => {
  it('AC-4506.1: 500자까지만 들어가고 n/500이 보이며, 빈 글이면 [정리하기]가 막혀 있고, 칸 아래 안내가 늘 보인다', async () => {
    const user = await openGuide()
    expect(within(editor()).getByText(MEMO_NOTE)).toBeTruthy()
    expect(memoBox().getAttribute('maxlength')).toBe('500')
    expect(within(editor()).getByText('0/500')).toBeTruthy()
    expect(tidyButton().disabled).toBe(true)
    await user.type(memoBox(), '  ')
    expect(within(editor()).getByText('2/500')).toBeTruthy()
    expect(tidyButton().disabled).toBe(true)
    change(memoBox(), '가'.repeat(520))
    expect(within(editor()).getByText('500/500')).toBeTruthy()
    expect(memoBox().value).toBe('가'.repeat(500))
    expect(tidyButton().disabled).toBe(false)
  })

  it('AC-4506.2: 정리한 답으로 칸 12개(머리표~아래 작은 글, 줄·강조 포함)가 모두 바뀌고 미리보기가 바로 바뀐다', async () => {
    fetchSpy.mockResolvedValue(tidyAnswer(MANUAL))
    const user = await openGuide()
    change(input('아래 작은 글'), '지울 글')
    change(lineBox(1), '지울 줄')
    await tidy(user, '도수치료 43850원 주2회 1년15회')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('/api/ai/forms/guide')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({ text: '도수치료 43850원 주2회 1년15회' })

    await within(editor()).findByDisplayValue('도수치료 안내')
    expect(input('작은 제목').value).toBe('도수치료 관리급여 적용')
    expect(input('큰 문구 윗줄').value).toBe('1회 비용')
    expect(input('큰 문구 아랫줄').value).toBe('43,850원')
    expect(firstSmallBox().checked).toBe(true)
    expect(input('흰 상자 윗줄').value).toBe('2026년 7월 1일부터')
    expect(input('흰 상자 아랫줄').value).toBe('건강보험 적용 중입니다')
    expect(pictureBox().value).toBe('spine')
    expect(input('띠 제목').value).toBe('도수치료 전에 꼭 확인하세요')
    expect(markButton('✓ 체크').getAttribute('aria-pressed')).toBe('true')
    expect(lineBoxes().map((b) => b.value)).toEqual(MANUAL.lines.map((l) => l.text))
    expect([1, 2, 3].map((n) => emBox(n).value)).toEqual(MANUAL.lines.map((l) => l.em))
    expect(input('아래 작은 글').value).toBe('')
    expect(poster().getAttribute('aria-label')).toBe('도수치료 안내: 도수치료 관리급여 적용 1회 비용 43,850원')
    expect(memoBox().value).toBe('도수치료 43850원 주2회 1년15회')
    expect(within(editor()).queryByText('줄은 4개까지라 앞의 4개만 넣었어요')).toBeNull()
  })

  it("AC-4506.2: 지금 그림이 'AI로 그린 그림'이면 정리해도 그림은 그대로이고, 줄이 넘쳤다는 표시가 있으면 한 줄 안내가 보인다", async () => {
    fetchSpy.mockResolvedValueOnce(drawAnswer(WHEELCHAIR)).mockResolvedValueOnce(tidyAnswer(INSURANCE, true))
    const user = await openGuide()
    await draw(user)
    await within(editor()).findByRole('option', { name: 'AI로 그린 그림: 휠체어' })
    await tidy(user)
    await within(editor()).findByDisplayValue('보험 서류 안내')
    expect(pictureBox().value).toBe('custom')
    expect(drawnShapes()).toHaveLength(2)
    expect(within(editor()).getByText('줄은 4개까지라 앞의 4개만 넣었어요')).toBeTruthy()
  })

  it('AC-4506.3: 전화번호 모양이 든 글이면 아무것도 보내지 않고 E-FORMS-PRIVATE 문구가 보인다', async () => {
    const user = await openGuide()
    await tidy(user, '보험 서류 문의 010-1234-5678')
    expect(fetchSpy).not.toHaveBeenCalled()
    expectError('E-FORMS-PRIVATE')
  })

  it('AC-4506.3: 답을 기다리는 동안 [정리하는 중…]으로 막혀 두 번 보내지 않고, 적은 글과 칸은 그대로다', async () => {
    let answer: (r: Response) => void = () => {}
    fetchSpy.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    const user = await openGuide()
    change(input('머리표'), '학회 안내')
    await tidy(user)
    expect(tidyButton().textContent).toBe('정리하는 중…')
    expect(tidyButton().disabled).toBe(true)
    fireEvent.click(tidyButton())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(memoBox().value).toBe('보험 서류 필요하면 수납할 때 말해 달라고')
    expect(input('머리표').value).toBe('학회 안내')
    await act(async () => answer(tidyAnswer(INSURANCE)))
    expect(tidyButton().textContent).toBe('정리하기')
    expect(input('머리표').value).toBe('보험 서류 안내')
  })

  it.each([
    ['E-AI-BUSY', 503],
    ['E-AI-LIMIT', 402],
    ['E-AI-FAILED', 502],
  ] as const)('AC-4506.3: 경로가 %s로 답하면 그 문구가 보이고 적은 글·칸은 그대로다', async (code, status) => {
    fetchSpy.mockResolvedValue(json({ code }, status))
    const user = await openGuide()
    change(input('머리표'), '학회 안내')
    await tidy(user)
    await within(editor()).findByText(new RegExp(code))
    expectError(code)
    expect(memoBox().value).toBe('보험 서류 필요하면 수납할 때 말해 달라고')
    expect(input('머리표').value).toBe('학회 안내')
    expect(tidyButton().textContent).toBe('정리하기')
  })

  it('AC-4506.3: 연결이 끊기면 E-AI-BUSY로 보인다', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = await openGuide()
    await tidy(user)
    await within(editor()).findByText(/E-AI-BUSY/)
    expectError('E-AI-BUSY')
  })
})

// ── REQ-4506·4502: 만들기 칸과 까닭 ─────────────────────

describe('AC-4506.4·AC-4502.3: 안내 내용 직접 고치기와 칸 까닭', () => {
  it('AC-4506.4: 만들기에 노란 윗단·진회색 띠의 칸이 모두 있고(한도 maxlength), 고르기는 없음 + 그림 16개다', async () => {
    await openGuide()
    const limits: [string, string][] = [
      ['머리표', '10'],
      ['작은 제목', '14'],
      ['큰 문구 윗줄', '8'],
      ['큰 문구 아랫줄', '8'],
      ['흰 상자 윗줄', '16'],
      ['흰 상자 아랫줄', '14'],
      ['띠 제목', '16'],
      ['줄 1', '28'],
      ['아래 작은 글', '28'],
    ]
    for (const [label, max] of limits) expect(input(label).getAttribute('maxlength'), label).toBe(max)
    const top = within(editor()).getByRole('group', { name: '노란 윗단' })
    for (const label of ['머리표', '작은 제목', '큰 문구 윗줄', '큰 문구 아랫줄', '흰 상자 윗줄', '흰 상자 아랫줄']) {
      expect(within(top).getByLabelText(label), label).toBeTruthy()
    }
    expect(within(top).getByRole('checkbox', { name: '윗줄 작게' })).toBeTruthy()
    expect(within(top).getByRole('combobox', { name: '그림' })).toBeTruthy()
    const band = within(editor()).getByRole('group', { name: '진회색 띠' })
    for (const label of ['띠 제목', '줄 1', '줄 1 노랑 강조', '아래 작은 글']) expect(within(band).getByLabelText(label), label).toBeTruthy()
    expect(within(band).getByRole('button', { name: '빼기' })).toBeTruthy()
    expect(within(band).getByRole('button', { name: '+ 줄 더하기' })).toBeTruthy()
    expect([markButton('✓ 체크'), markButton('1·2·3 번호')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    expect(Array.from(pictureBox().options).map((o) => [o.value, o.textContent])).toEqual([
      ['', '없음'],
      ...PICTURES.map((p) => [p.id, p.name]),
    ])
    expect(pictureBox().value).toBe('')
  })

  it('AC-4506.4: 칸을 직접 고치면 미리보기가 바로 바뀐다(글·윗줄 작게·그림·줄 표시)', async () => {
    const user = await openGuide()
    change(input('머리표'), '휠체어 안내')
    change(input('작은 제목'), '휠체어가 필요하시면')
    change(input('큰 문구 윗줄'), '접수대에')
    change(input('큰 문구 아랫줄'), '말씀해 주세요')
    expect(poster().getAttribute('aria-label')).toBe('휠체어 안내: 휠체어가 필요하시면 접수대에 말씀해 주세요')
    change(lineBox(1), '걷기 힘드실 때')
    expect(poster().textContent).toContain('걷기 힘드실 때')

    const pictureAt = () => poster().querySelector('g[transform="translate(566 468)"]')
    expect(pictureAt()).toBeNull()
    fireEvent.change(pictureBox(), { target: { value: 'chair' } })
    expect(pictureBox().value).toBe('chair')
    expect(pictureAt()).not.toBeNull()
    fireEvent.change(pictureBox(), { target: { value: '' } })
    expect(pictureAt()).toBeNull()

    await user.click(firstSmallBox())
    expect(firstSmallBox().checked).toBe(true)
    await user.click(markButton('1·2·3 번호'))
    expect(markButton('1·2·3 번호').getAttribute('aria-pressed')).toBe('true')
    expect(markButton('✓ 체크').getAttribute('aria-pressed')).toBe('false')
    expect(poster().textContent).not.toContain('✓')
    await user.click(markButton('✓ 체크'))
    expect(poster().textContent).toContain('✓')
  })

  it('AC-4506.4: 줄이 4개면 [줄 더하기]가, 1개면 [빼기]가 막힌다', async () => {
    const user = await openGuide()
    expect(lineBoxes()).toHaveLength(1)
    expect(removeButtons()[0]!.disabled).toBe(true)
    for (let i = 0; i < 3; i += 1) await user.click(addLineButton())
    expect(lineBoxes()).toHaveLength(4)
    expect(addLineButton().disabled).toBe(true)
    expect(removeButtons().every((b) => !b.disabled)).toBe(true)
    change(lineBox(2), '둘째 줄')
    await user.click(removeButtons()[0]!)
    expect(lineBoxes().map((b) => b.value)).toEqual(['둘째 줄', '', ''])
    expect(addLineButton().disabled).toBe(false)
  })

  it('AC-4502.3: 그 줄에 없는 낱말을 강조하면 그 강조 칸 아래 까닭이 보이고 [저장]·[인쇄·PDF]·[그림 파일]이 막힌다', async () => {
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    for (const name of OUTPUTS) expect(output(name).disabled, name).toBe(false)
    change(emBox(1), '없는 낱말')
    expect(emBox(1).getAttribute('aria-invalid')).toBe('true')
    expect(reasonOf(emBox(1))).toBe('그 줄에 있는 낱말만 강조할 수 있어요')
    for (const name of OUTPUTS) expect(output(name).disabled, name).toBe(true)
    change(emBox(1), '진단서')
    expect(emBox(1).getAttribute('aria-invalid')).toBe('false')
    for (const name of OUTPUTS) expect(output(name).disabled, name).toBe(false)
  })

  it('AC-4506.4: 글 칸의 까닭(한도 넘침·윗줄만)과 띠 넘침 까닭이 그 칸 아래에 보인다', async () => {
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    change(input('머리표'), '가'.repeat(11)) // AI 답처럼 한도를 넘는 글도 칸에 들어온다
    expect(input('머리표').getAttribute('aria-invalid')).toBe('true')
    expect(reasonOf(input('머리표'))).toBe('10자까지 적을 수 있어요')
    change(input('머리표'), '보험 서류 안내')
    change(input('흰 상자 아랫줄'), '')
    expect(reasonOf(input('흰 상자 아랫줄'))).toBe('윗줄만 쓸 수는 없어요. 아랫줄을 적어 주세요')
    change(input('흰 상자 아랫줄'), '"보험 서류 필요해요"')
    expect(input('흰 상자 아랫줄').getAttribute('aria-invalid')).toBe('false')

    // 시안 go=over: 긴 줄 넷(한 열) + 띠 제목 + 아래 작은 글
    const long = ['환자 본인이 오신 뒤에 접수해 주세요', '가족·지인 접수는 대신 할 수 없습니다', '보호자는 옆에서 도와주실 수 있습니다', '접수 뒤에는 자리에서 기다려 주세요']
    long.forEach((text, i) => change(lineBox(i + 1), text))
    expect(within(editor()).getByText('띠에 다 들어가지 않아요. 줄을 하나 빼거나, 띠 제목·아래 작은 글을 비워 주세요')).toBeTruthy()
    for (const name of OUTPUTS) expect(output(name).disabled, name).toBe(true)
  })

  it('AC-4506.4: 새 빈 안내문은 필수 칸 까닭을 숨기고, 한 칸이라도 적으면 빈 필수 칸 까닭이 보인다', async () => {
    await openGuide()
    expect(within(editor()).queryByText('머리표를 적어 주세요')).toBeNull()
    expect(input('머리표').getAttribute('aria-invalid')).toBe('false')
    for (const name of OUTPUTS) expect(output(name).disabled, name).toBe(true)
    change(input('작은 제목'), '보험사에 낼 서류는')
    expect(reasonOf(input('머리표'))).toBe('머리표를 적어 주세요')
    expect(within(editor()).getByText('줄을 하나 이상 적어 주세요')).toBeTruthy()
  })
})

// ── REQ-4507: 저장·목록 ─────────────────────────────────

describe('AC-4507.1~AC-4507.4: 저장·목록', () => {
  it('AC-4507.2: 목록에 머리표와 "M월 D일 고침"이 최근 고친 차례로 보이고, 누르면 그 안내문이 열린다', async () => {
    const user = await openGuide()
    expect(listTexts()).toEqual([INS_ITEM, CLOCK_ITEM])
    expect(within(listRegion()).getByRole('list').className.split(/\s+/)).toContain('list-none')
    await user.click(listItem(CLOCK_ITEM))
    expect(input('머리표').value).toBe('진료 시작 전 안내')
    expect(markButton('1·2·3 번호').getAttribute('aria-pressed')).toBe('true')
    expect(lineBoxes().map((b) => b.value)).toEqual(CLOCK.lines.map((l) => l.text))
    expect(pictureBox().value).toBe('clock')
    expect(listItem(CLOCK_ITEM).getAttribute('aria-current')).toBe('true')
    expect(within(preview()).getByText('저장됨')).toBeTruthy()
    expect(poster().getAttribute('aria-label')).toBe('진료 시작 전 안내: 지금은 진료 시작 전입니다 순서 대기표를 적어 주세요')
  })

  it('AC-4507.2: 하나도 없으면 "아직 저장한 환자 안내문이 없어요"', async () => {
    vi.mocked(listGuides).mockResolvedValue([])
    await openGuide(/^아직 저장한 환자 안내문이 없어요$/)
    expect(within(listRegion()).getByText('아직 저장한 환자 안내문이 없어요')).toBeTruthy()
  })

  it('AC-4507.1: 새 안내문을 저장하면 넣기를 부르고(열쇠 13개, 대충 적은 글 없음) 목록 맨 위에 나타나며 저장됨이 보인다. 고쳐 저장하면 그 줄을 고친다', async () => {
    fetchSpy.mockResolvedValue(tidyAnswer(CD))
    const user = await openGuide()
    await tidy(user, '다른 병원 영상 CD 접수할 때 먼저')
    await within(editor()).findByDisplayValue('영상 CD 안내')
    expect(within(preview()).getByText('저장하지 않은 내용이 있어요')).toBeTruthy()
    await user.click(output('저장'))
    expect(insertGuide).toHaveBeenCalledTimes(1)
    expect(insertGuide).toHaveBeenCalledWith(CD)
    expect(Object.keys(vi.mocked(insertGuide).mock.calls[0]![0])).toHaveLength(13)
    await within(preview()).findByText('저장됨')
    expect(listTexts()).toEqual(['영상 CD 안내 11월 15일 고침', INS_ITEM, CLOCK_ITEM])
    expect(listItem('영상 CD 안내 11월 15일 고침').getAttribute('aria-current')).toBe('true')

    change(input('띠 제목'), ' 이런 영상을 주세요 ')
    expect(within(preview()).getByText('저장하지 않은 내용이 있어요')).toBeTruthy()
    await user.click(output('저장'))
    expect(updateGuide).toHaveBeenCalledWith('new1', { ...CD, bandTitle: '이런 영상을 주세요' })
    expect(insertGuide).toHaveBeenCalledTimes(1)
    await within(preview()).findByText('저장됨')
  })

  it('AC-4507.3: 바뀐 내용이 있으면 다른 안내문 열기·[새로 만들기] 전에 묻고, [취소]면 그대로 둔다', async () => {
    const user = await openGuide()
    change(input('머리표'), '학회 안내')
    confirmSpy.mockReturnValue(false)
    await user.click(listItem(INS_ITEM))
    await user.click(within(listRegion()).getByRole('button', { name: '+ 새로 만들기' }))
    expect(confirmSpy).toHaveBeenCalledTimes(2)
    expect(confirmSpy).toHaveBeenCalledWith('저장하지 않은 내용이 있어요. 버릴까요?')
    expect(input('머리표').value).toBe('학회 안내')

    confirmSpy.mockReturnValue(true)
    await user.click(within(listRegion()).getByRole('button', { name: '+ 새로 만들기' }))
    expect(input('머리표').value).toBe('')
  })

  it("AC-4507.3·AC-4513.1: [새로 만들기]·열기 뒤에는 '새로 그릴 것' 칸도 비고, 바뀐 내용이 없으면 묻지 않는다", async () => {
    const user = await openGuide()
    change(subjectBox(), '휠체어')
    await user.click(within(listRegion()).getByRole('button', { name: '+ 새로 만들기' }))
    expect(subjectBox().value).toBe('')
    change(subjectBox(), '우산')
    await user.click(listItem(INS_ITEM))
    expect(input('머리표').value).toBe('보험 서류 안내')
    expect(subjectBox().value).toBe('')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('AC-4507.3: 연 안내문에서 [지우기]를 누르고 확인하면 그 줄을 지우고 새 안내문이 된다. [취소]면 지우지 않는다', async () => {
    const user = await openGuide()
    expect(within(preview()).queryByRole('button', { name: '지우기' })).toBeNull()
    await user.click(listItem(INS_ITEM))
    confirmSpy.mockReturnValueOnce(false)
    await user.click(output('지우기'))
    expect(deleteGuide).not.toHaveBeenCalled()

    change(subjectBox(), '휠체어')
    await user.click(output('지우기'))
    expect(confirmSpy).toHaveBeenLastCalledWith('이 안내문을 지울까요?')
    expect(deleteGuide).toHaveBeenCalledWith('ins')
    await within(preview()).findByText((_, el) => el?.getAttribute('role') === 'status' && el.textContent === '')
    expect(listTexts()).toEqual([CLOCK_ITEM])
    expect(input('머리표').value).toBe('')
    expect(subjectBox().value).toBe('')
    expect(within(preview()).queryByRole('button', { name: '지우기' })).toBeNull()
  })

  it('AC-4507.4: 저장이 실패하면 적은 값은 그대로이고 E-FORMS-SAVE-FAILED와 [다시 저장]이 보인다', async () => {
    vi.mocked(updateGuide).mockResolvedValueOnce('failed')
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    change(input('띠 제목'), '이럴 때 말씀해 주세요')
    await user.click(output('저장'))
    await within(preview()).findByText(/E-FORMS-SAVE-FAILED/)
    expectError('E-FORMS-SAVE-FAILED')
    expect(input('띠 제목').value).toBe('이럴 때 말씀해 주세요')
    await user.click(within(preview()).getByRole('button', { name: '다시 저장' }))
    expect(updateGuide).toHaveBeenCalledTimes(2)
    await within(preview()).findByText('저장됨')
    expect(within(preview()).queryByText(/E-FORMS-SAVE-FAILED/)).toBeNull()
  })

  it('AC-4507.4: 지우기가 실패하면 E-FORMS-SAVE-FAILED가 보이고 안내문은 그대로 열려 있다', async () => {
    vi.mocked(deleteGuide).mockResolvedValueOnce(false)
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    await user.click(output('지우기'))
    await within(preview()).findByText(/E-FORMS-SAVE-FAILED/)
    expectError('E-FORMS-SAVE-FAILED')
    expect(input('머리표').value).toBe('보험 서류 안내')
    expect(output('지우기')).toBeTruthy()
  })

  it('AC-4507.4: 목록 읽기가 실패하면 E-FORMS-READ-FAILED와 [다시 읽기]가 보이고, 다시 읽는다', async () => {
    vi.mocked(listGuides).mockResolvedValueOnce('failed')
    const user = await openGuide(/E-FORMS-READ-FAILED/)
    expectError('E-FORMS-READ-FAILED')
    await user.click(within(listRegion()).getByRole('button', { name: '다시 읽기' }))
    await within(listRegion()).findByRole('button', { name: INS_ITEM })
    expect(listGuides).toHaveBeenCalledTimes(2)
    expect(within(listRegion()).queryByText(/E-FORMS-READ-FAILED/)).toBeNull()
  })
})

// ── REQ-4513: AI로 그림 그리기 ──────────────────────────

describe('AC-4513.1~AC-4513.3: AI로 그림 그리기', () => {
  it("AC-4513.1: 그림 고르기 아래에 '새로 그릴 것'(20자)과 [AI로 그림 그리기]·안내가 있고, 글이 비었으면 단추가 막힌다", async () => {
    const user = await openGuide()
    const top = within(editor()).getByRole('group', { name: '노란 윗단' })
    expect(within(top).getByRole('textbox', { name: '새로 그릴 것' })).toBe(subjectBox())
    expect(subjectBox().getAttribute('maxlength')).toBe('20')
    expect(within(top).getByText(DRAW_NOTE)).toBeTruthy()
    // 차례: 그림 고르기 → 새로 그릴 것 → [AI로 그림 그리기]
    expect(pictureBox().compareDocumentPosition(subjectBox()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(subjectBox().compareDocumentPosition(drawButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(drawButton().textContent).toBe('AI로 그림 그리기')
    expect(drawButton().disabled).toBe(true)
    await user.type(subjectBox(), '  ')
    expect(drawButton().disabled).toBe(true)
    await user.type(subjectBox(), '휠체어')
    expect(drawButton().disabled).toBe(false)
    expect(within(editor()).queryByRole('option', { name: /^AI로 그린 그림/ })).toBeNull()
  })

  it("AC-4513.2: 그리면 그림이 'AI로 그린 그림: <그릴 것>'으로 바뀌고 미리보기에 그 그림이 보인다", async () => {
    fetchSpy.mockResolvedValue(drawAnswer(WHEELCHAIR))
    const user = await openGuide()
    await draw(user)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('/api/ai/forms/guide/picture')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({ text: '휠체어' })
    await within(editor()).findByRole('option', { name: 'AI로 그린 그림: 휠체어' })
    expect(pictureBox().value).toBe('custom')
    expect(pictureBox().selectedOptions[0]?.textContent).toBe('AI로 그린 그림: 휠체어')
    expect(poster().querySelectorAll('clipPath')).toHaveLength(1)
    expect(drawnShapes().map((el) => el.localName)).toEqual(['circle', 'rect'])
    expect(drawnShapes()[0]!.getAttribute('r')).toBe('50')
    expect(drawButton().textContent).toBe('AI로 그림 그리기')
  })

  it('AC-4513.2: 기다리는 동안 [그리는 중…]으로 막혀 두 번 보내지 않고, 지금 그림은 그대로다', async () => {
    let answer: (r: Response) => void = () => {}
    fetchSpy.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    await draw(user)
    expect(drawButton().textContent).toBe('그리는 중…')
    expect(drawButton().disabled).toBe(true)
    fireEvent.click(drawButton())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(pictureBox().value).toBe('document')
    await act(async () => answer(drawAnswer(WHEELCHAIR)))
    expect(drawButton().textContent).toBe('AI로 그림 그리기')
    expect(pictureBox().value).toBe('custom')
  })

  it('AC-4513.2: 그릴 것에 전화번호 모양이 있으면 보내지 않고 E-FORMS-PRIVATE가 보인다', async () => {
    const user = await openGuide()
    await draw(user, '010-1234-5678')
    expect(fetchSpy).not.toHaveBeenCalled()
    expectError('E-FORMS-PRIVATE')
    expect(pictureBox().value).toBe('')
  })

  it.each([
    ['E-AI-BUSY', 503],
    ['E-AI-LIMIT', 402],
    ['E-AI-FAILED', 502],
  ] as const)('AC-4513.2: 그림 경로가 %s로 답하면 그 문구가 보이고 지금 그림은 그대로다', async (code, status) => {
    fetchSpy.mockResolvedValue(json({ code }, status))
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    await draw(user)
    await within(editor()).findByText(new RegExp(code))
    expectError(code)
    expect(pictureBox().value).toBe('document')
    expect(poster().querySelector('clipPath')).toBeNull()
    expect(subjectBox().value).toBe('휠체어')
    expect(drawButton().textContent).toBe('AI로 그림 그리기')
  })

  it('AC-4513.2: 연결이 끊기면 E-AI-BUSY로 보이고, 모르는 답(잘못된 그림)은 E-AI-FAILED다', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json({ drawing: { subject: '휠체어', shapes: [] } }))
    const user = await openGuide()
    await draw(user)
    await within(editor()).findByText(/E-AI-BUSY/)
    expectError('E-AI-BUSY')
    await user.click(drawButton())
    await within(editor()).findByText(/E-AI-FAILED/)
    expectError('E-AI-FAILED')
    expect(pictureBox().value).toBe('')
  })

  it("AC-4513.3: 다른 그림을 골라도 그린 그림은 고르기에 남아 다시 고를 수 있고, 저장은 고른 것이 'AI로 그린 그림'일 때만 drawing을 보낸다", async () => {
    fetchSpy.mockResolvedValue(drawAnswer(WHEELCHAIR))
    const user = await openGuide()
    await user.click(listItem(INS_ITEM))
    await draw(user)
    await within(editor()).findByRole('option', { name: 'AI로 그린 그림: 휠체어' })
    await user.click(output('저장'))
    expect(updateGuide).toHaveBeenLastCalledWith('ins', { ...INSURANCE, picture: 'custom', drawing: WHEELCHAIR })
    await within(preview()).findByText('저장됨')

    fireEvent.change(pictureBox(), { target: { value: 'document' } })
    expect(poster().querySelector('clipPath')).toBeNull()
    expect(within(editor()).getByRole('option', { name: 'AI로 그린 그림: 휠체어' })).toBeTruthy()
    await user.click(output('저장'))
    expect(updateGuide).toHaveBeenLastCalledWith('ins', { ...INSURANCE, picture: 'document', drawing: null })
    await within(preview()).findByText('저장됨')

    fireEvent.change(pictureBox(), { target: { value: 'custom' } })
    expect(pictureBox().value).toBe('custom')
    expect(drawnShapes()).toHaveLength(2)
    fireEvent.change(pictureBox(), { target: { value: '' } })
    expect(poster().querySelector('g[transform="translate(566 468)"]')).toBeNull()
    expect(within(editor()).getByRole('option', { name: 'AI로 그린 그림: 휠체어' })).toBeTruthy()
  })
})
