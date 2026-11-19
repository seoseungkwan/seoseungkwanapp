// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jpegDataUrl, readBackground } from '@/lib/forms/backgroundImage'
import { downloadPosterPng } from '@/lib/forms/png'
import { isLightAccent, themeOf } from '@/lib/forms/themes'
import { deleteBackground, listBackgrounds, readBackgroundImage, saveBackground } from '@/lib/storage/formBackgrounds'
import { insertNotice, listNotices, updateNotice } from '@/lib/storage/formNotices'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { SavedBackground } from '@/types/formBackground'
import type { SavedNotice } from '@/types/forms'
import { FormsScreen } from './FormsScreen'

// 휴진 안내 '강조 색' 줄(AccentPicker)과 서식 화면 잇기 (spec forms-accent TASK-5, REQ-4701~4703, design.md 7절).
// spec form-style AC-6801.5(TASK-6)로 '배경' 칸 아래 '글자 색' 칸이 '글씨·로고' 묶음의 '강조 색' 줄이 됐다 — 이름·자리·고르기 모양(ColorChips:
// [자동] · 로고 색 칩 · 기본 색 16가지 · 직접 고르기)을 바꾸고 forms-accent AC-4701~4703의 뜻은 그대로 본다(승인 시안 docs/mockups/form-style).
// FormsScreen을 통째로 그려 본다(ThemePicker.test.tsx 본뜸).
// 가짜: fetch(AI 배경 경로)·안내문 저장(formNotices)·내 배경 저장(formBackgrounds)·readBackground·downloadPosterPng·confirm·print.
// [저장] 몸통 시험 하나만 진짜 저장 모듈을 가짜 Supabase 클라이언트로 돌려 보낸 몸통을 본다. 오늘은 prop으로 2026-11-10(한국 날짜)

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
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/forms/backgroundImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/backgroundImage')>()),
  readBackground: vi.fn(),
}))
vi.mock('@/lib/forms/png', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/png')>()),
  downloadPosterPng: vi.fn(),
}))

const TODAY = '2026-11-10'
const HOSPITAL = '11111111-1111-4111-8111-111111111111'
const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_NEW = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

// 고른 글자 색 — 테마 23개·배경 강조색과 다른 값. LIGHT는 시안 ?s=light의 옅은 노랑
const PICKED = '#c8102e'
const OTHER = '#0b7a5c'
const LIGHT = '#f6d365'
const WARN = '옅은 색이라 흰 글자·흰 카드 위 글이 잘 안 보일 수 있어요'
const DIRTY = '저장하지 않은 내용이 있어요'
const helpOf = (month: number) => `'${month}월'·날짜 띠·카드 아래 글이 이 색이에요. 자동은 로고가 있으면 로고 색, 없으면 테마·배경에 맞춰 골라요`
const RED = '#dc2626' // 기본 색 '빨강'

const saved = (id: string, words: string, accent: string, thumb: string, createdAt: string): SavedBackground => ({
  id,
  words,
  accent,
  thumb,
  path: `${HOSPITAL}/${id}.jpg`,
  createdAt,
})
const WINTER = saved(ID_A, '겨울 눈 덮인 숲', '#3a6ea5', '/9j/AAAA', '2026-11-13T01:00:00.000Z')

const JPEG = '/9j/4AAQ'
const TRIAL = { image: 'data:image/jpeg;base64,/9j/TRIAL1==', accent: '#c2456e', thumb: '/9j/TTTT' }
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
// 글자 색을 직접 골라 저장한 안내문(테마 그림 — 저절로 성탄절)
const DEC: SavedNotice = {
  id: 'dec',
  year: 2026,
  month: 12,
  cards: [
    { start: '2026-12-24', end: null, name: '학회', status: '휴진' },
    { start: '2026-12-25', end: null, name: '성탄절', status: '휴진' },
  ],
  theme: null,
  accent: PICKED,
  updatedAt: '2026-11-09T01:00:00.000Z',
}
// 글자 색을 직접 골라 저장한 안내문(내 배경)
const JAN: SavedNotice = {
  id: 'jan',
  year: 2027,
  month: 1,
  cards: [{ start: '2027-01-01', end: null, name: '신정', status: '휴진' }],
  theme: `bg-${ID_A}`,
  accent: OTHER,
  updatedAt: '2026-11-08T01:00:00.000Z',
}

const fetchSpy = vi.fn<typeof fetch>()
const confirmSpy = vi.fn<(message?: string) => boolean>()
const printSpy = vi.fn()
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

beforeEach(() => {
  vi.mocked(listNotices).mockResolvedValue([AUG])
  vi.mocked(insertNotice).mockImplementation(async (n) => ({ ...n, id: 'may', updatedAt: '2026-11-10T06:00:00.000Z' }))
  vi.mocked(updateNotice).mockImplementation(async (id, n) => ({ ...n, id, updatedAt: '2026-11-10T07:00:00.000Z' }))
  vi.mocked(listBackgrounds).mockResolvedValue([WINTER])
  vi.mocked(saveBackground).mockResolvedValue(saved(ID_NEW, '봄 벚꽃', TRIAL.accent, TRIAL.thumb, '2026-11-15T01:00:00.000Z'))
  vi.mocked(readBackgroundImage).mockResolvedValue(BYTES)
  vi.mocked(deleteBackground).mockResolvedValue(true)
  vi.mocked(readBackground).mockResolvedValue(TRIAL)
  vi.mocked(downloadPosterPng).mockResolvedValue(true)
  fetchSpy.mockImplementation(async () => json({ image: JPEG }))
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

async function open(notices: SavedNotice[] = [AUG]) {
  vi.mocked(listNotices).mockResolvedValue(notices)
  const user = userEvent.setup()
  render(<FormsScreen today={TODAY} />)
  await screen.findAllByRole('button', { name: /고침$/ })
  return user
}

// 카드 1에 어린이날(2027-05-05)을 적어 뽑기·저장 단추가 열리게 한다(저절로 테마 children, 안내 달 5월)
async function readyScreen(notices: SavedNotice[] = [AUG]) {
  const user = await open(notices)
  const card = screen.getByRole('group', { name: '카드 1' })
  fireEvent.change(within(card).getByLabelText('시작 날짜'), { target: { value: '2027-05-05' } })
  fireEvent.change(within(card).getByLabelText('이름'), { target: { value: '어린이날' } })
  return user
}

const styleBox = () => screen.getByRole('group', { name: '글씨·로고' })
const accentBox = () => screen.getByRole('group', { name: '강조 색' })
const autoButton = () => within(accentBox()).getByRole('button', { name: '자동' })
const chip = (name: string) => within(accentBox()).getByRole('button', { name: `강조 색 ${name}` })
// 눌린 단추(첫 단추 '자동' 또는 칩 이름)
const pressed = () =>
  within(accentBox())
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent)
const AUTO_ON = ['자동']
const colorInput = () => screen.getByLabelText('강조 색 직접 고르기') as HTMLInputElement
// 직접 고른 색(어느 칩과도 다름)이면 색 칸에 눌린 표시(data-own)
const own = () => colorInput().getAttribute('data-own') === 'true'
// 지금 색 글: 고른 색이면 그 값, 자동이면 '자동 <색>'
const shownText = () => within(styleBox()).getByText(/^(?:자동 )?#[0-9a-f]{6}$/).textContent
const pickColor = (value: string) => fireEvent.input(colorInput(), { target: { value } })

const bgBox = () => screen.getByRole('region', { name: '배경' })
const kind = (name: '테마 그림' | '내 배경') => within(within(bgBox()).getByRole('group', { name: '배경 종류' })).getByRole('button', { name })
const art = (n: 1 | 2) => within(within(bgBox()).getByRole('group', { name: '그림' })).getByRole('button', { name: `그림 ${n}` })
const themeBox = () => screen.getByRole('combobox', { name: '테마' }) as HTMLSelectElement
const wordsBox = () => within(bgBox()).getByRole('textbox', { name: 'AI 배경 만들기' }) as HTMLInputElement
const previewRegion = () => screen.getByRole('region', { name: '미리보기' })
const poster = () => within(previewRegion()).getByRole('img')
const printCopy = () => document.querySelector('[data-print-copy] svg')
const firstHref = (svg: Element | null) => svg?.querySelector('image')?.getAttribute('href')
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const outputsDisabled = () => ['저장', '인쇄·PDF', '그림 파일'].map((name) => button(name).disabled)

// SVG 요소 이름은 대소문자를 가린다 — localName으로 찾는다
const all = (root: Element, name: string) => [...root.querySelectorAll('*')].filter((el) => el.localName === name)
// 'N월'·날짜 띠(카드 위 path)·카드 아래 글('휴진')의 색과, 그 색을 쓴 요소 수
function paint(svg: Element | null) {
  if (!svg) throw new Error('svg가 없다')
  const texts = all(svg, 'text')
  return {
    month: texts.find((t) => /^\d{1,2}월$/.test(t.textContent ?? ''))?.getAttribute('fill'),
    bands: all(svg, 'path').map((p) => p.getAttribute('fill')),
    status: texts.filter((t) => t.textContent === '휴진').map((t) => t.getAttribute('fill')),
  }
}
const painted = (color: string, cards: number) => ({ month: color, bands: Array(cards).fill(color), status: Array(cards).fill(color) })
const usedBy = (svg: Element | null, color: string) => (svg ? [...svg.querySelectorAll('*')].filter((el) => el.getAttribute('fill') === color).length : 0)

async function mine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(kind('내 배경'))
  await within(bgBox()).findByText(/^\d+\/30장$/)
}

async function chooseWinter(user: ReturnType<typeof userEvent.setup>) {
  await mine(user)
  await user.click(within(bgBox()).getByRole('button', { name: `${WINTER.words} 배경` }))
  await screen.findByText(`고른 배경: ${WINTER.words}`)
  await vi.waitFor(() => expect(firstHref(poster())).toBe(jpegDataUrl(BYTES)))
}

// 진짜 저장 모듈(lib/storage/formNotices)을 가짜 Supabase 클라이언트로 돌린다 — 넣기·고치기 몸통을 적어 둔다
async function realStorage() {
  const real = await vi.importActual<typeof import('@/lib/storage/formNotices')>('@/lib/storage/formNotices')
  const sent: { kind: 'insert' | 'update'; body: Record<string, unknown> }[] = []
  const reply = (id: string, body: Record<string, unknown>) => ({
    select: () => ({ single: async () => ({ data: { id, updated_at: '2026-11-10T06:00:00.000Z', ...body }, error: null }) }),
  })
  const client = {
    from: () => ({
      insert: (body: Record<string, unknown>) => {
        sent.push({ kind: 'insert', body })
        return reply('new', body)
      },
      update: (body: Record<string, unknown>) => ({
        eq: (_column: string, id: string) => {
          sent.push({ kind: 'update', body })
          return reply(id, body)
        },
      }),
    }),
  }
  vi.mocked(supabaseBrowser).mockReturnValue(client as never)
  vi.mocked(insertNotice).mockImplementation(real.insertNotice)
  vi.mocked(updateNotice).mockImplementation(real.updateNotice)
  return sent
}

describe('AC-4701.1·AC-6801.5: 강조 색 줄', () => {
  it("AC-4701.1·AC-6801.5: '배경' 칸 아래 '글자 색' 칸은 없고, '글씨·로고' 묶음 안 '본문 글씨'와 '로고' 사이에 '강조 색' 줄(고르기 묶음 이름 '강조 색')·지금 색 글·도움말이 있다", async () => {
    await open()
    expect(screen.queryByRole('group', { name: '글자 색' })).toBeNull()
    expect(screen.queryByLabelText('글자 색 고르기')).toBeNull()
    expect(screen.queryByText('글자 색')).toBeNull()

    const group = accentBox()
    expect(styleBox().contains(group)).toBe(true)
    expect(within(styleBox()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['제목 글씨', '본문 글씨', '강조 색', '로고'])
    expect(pressed()).toEqual(AUTO_ON)
    for (const b of within(group).getAllByRole('button')) expect(b.getAttribute('type')).toBe('button')
    expect(chip('빨강')).toBeTruthy()
    expect(colorInput().getAttribute('type')).toBe('color')
    expect(group.contains(colorInput())).toBe(true)
    expect(shownText()).toMatch(/^자동 #[0-9a-f]{6}$/)
    const help = within(styleBox()).getByText(helpOf(11))
    expect(group.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // 놓인 자리: '배경' 칸 뒤(배경 칸 밖), 미리보기보다 앞, 만들기 패널 안
    expect(bgBox().compareDocumentPosition(styleBox()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bgBox().contains(group)).toBe(false)
    expect(group.compareDocumentPosition(previewRegion()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('region', { name: '만들기' }).parentElement?.contains(group)).toBe(true)
  })

  it("AC-4701.1·AC-6801.5: 도움말의 'N월'은 안내 달을 따른다", async () => {
    await readyScreen()
    expect(screen.getByText(helpOf(5))).toBeTruthy()
    fireEvent.change(screen.getByLabelText('안내 달'), { target: { value: '2027-12' } })
    expect(screen.getByText(helpOf(12))).toBeTruthy()
    expect(screen.queryByText(helpOf(5))).toBeNull()
  })
})

describe('AC-4701.2: 처음은 [자동]', () => {
  it('AC-4701.2: 새 안내문은 [자동]만 눌려 있고, 색 칸은 미리보기에 쓰이는 테마 강조색에서 시작하며(눌린 표시 없음) 지금 색 글은 자동 #…이다', async () => {
    await open()
    const auto = themeOf('m11').accent
    expect(firstHref(poster())).toBe('/poster/themes/m11.svg')
    expect(pressed()).toEqual(AUTO_ON)
    expect(colorInput().value).toBe(auto)
    expect(own()).toBe(false)
    expect(colorInput().disabled).toBe(false)
    expect(shownText()).toBe(`자동 ${auto}`)
    expect(paint(poster()).month).toBe(auto)
  })

  it('AC-4701.2: 자동 색은 미리보기 테마를 따라 바뀐다(저절로 고른 테마·직접 고른 테마)', async () => {
    await readyScreen()
    const children = themeOf('children').accent
    expect(colorInput().value).toBe(children)
    expect(shownText()).toBe(`자동 ${children}`)
    fireEvent.change(themeBox(), { target: { value: 'christmas' } })
    const christmas = themeOf('christmas').accent
    expect(colorInput().value).toBe(christmas)
    expect(shownText()).toBe(`자동 ${christmas}`)
    expect(paint(poster())).toEqual(painted(christmas, 1))
  })

  it('AC-4701.2: 글자 색이 없는 저장 안내문을 열면 [자동]이고 그 테마의 자동 색이 보인다', async () => {
    const user = await open([AUG, DEC])
    await user.click(screen.getByRole('button', { name: /^2026년 8월 · 광복절·대체공휴일 / }))
    const auto = themeOf('liberation').accent
    expect(pressed()).toEqual(AUTO_ON)
    expect(colorInput().value).toBe(auto)
    expect(own()).toBe(false)
    expect(shownText()).toBe(`자동 ${auto}`)
  })

  it('AC-4701.2: 내 배경·만든 배경을 미리보기에 쓰면 자동 색은 그 배경의 강조색이다', async () => {
    const user = await readyScreen()
    await chooseWinter(user)
    expect(colorInput().value).toBe(WINTER.accent)
    expect(shownText()).toBe(`자동 ${WINTER.accent}`)

    fireEvent.change(wordsBox(), { target: { value: '봄 벚꽃' } })
    await user.click(within(bgBox()).getByRole('button', { name: 'AI로 배경 만들기' }))
    await within(bgBox()).findByText('만든 배경: 봄 벚꽃')
    expect(firstHref(poster())).toBe(TRIAL.image)
    expect(colorInput().value).toBe(TRIAL.accent)
    expect(shownText()).toBe(`자동 ${TRIAL.accent}`)
  })
})

describe('AC-4701.3: 색 칸·칩·[자동]', () => {
  it("AC-4701.3: 색 칸에서 색을 고르면 그 색(소문자)이 되고 아무 단추도 눌리지 않은 채 색 칸에 눌린 표시, 지금 색 글이 #rrggbb, 미리보기·인쇄 사본의 'N월'·날짜 띠·카드 아래 글이 그 색이다", async () => {
    await readyScreen()
    pickColor(PICKED.toUpperCase())
    expect(pressed()).toEqual([])
    expect(own()).toBe(true)
    expect(colorInput().value).toBe(PICKED)
    expect(shownText()).toBe(PICKED)
    expect(paint(poster())).toEqual(painted(PICKED, 1))
    expect(paint(printCopy())).toEqual(painted(PICKED, 1))
    expect(usedBy(poster(), PICKED)).toBe(3) // 그 밖의 글자·카드는 그 색이 아니다
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')

    // change 이벤트로 와도 같다
    fireEvent.change(colorInput(), { target: { value: OTHER } })
    expect(shownText()).toBe(OTHER)
    expect(paint(poster())).toEqual(painted(OTHER, 1))
    expect(paint(printCopy())).toEqual(painted(OTHER, 1))
  })

  it('AC-4701.3·AC-6801.4: 기본 색 칩을 누르면 그 색이 되고 그 칩만 눌리며(색 칸 눌린 표시 없음), 고른 뒤 테마를 바꿔도 그대로다', async () => {
    const user = await readyScreen()
    await user.click(chip('빨강'))
    expect(pressed()).toEqual(['강조 색 빨강'])
    expect(own()).toBe(false)
    expect(colorInput().value).toBe(RED)
    expect(shownText()).toBe(RED)
    expect(paint(poster())).toEqual(painted(RED, 1))
    expect(paint(printCopy())).toEqual(painted(RED, 1))

    fireEvent.change(themeBox(), { target: { value: 'christmas' } })
    expect(shownText()).toBe(RED)
    expect(paint(poster())).toEqual(painted(RED, 1))
  })

  it('AC-4701.3: [자동]을 누르면 글자 색이 없어지고 자동 색(색 칸 시작 색·자동 #…)으로 돌아간다', async () => {
    const user = await readyScreen()
    pickColor(PICKED)
    await user.click(autoButton())
    const auto = themeOf('children').accent
    expect(pressed()).toEqual(AUTO_ON)
    expect(colorInput().value).toBe(auto)
    expect(shownText()).toBe(`자동 ${auto}`)
    expect(own()).toBe(false)
    expect(paint(poster())).toEqual(painted(auto, 1))
    expect(paint(printCopy())).toEqual(painted(auto, 1))
  })
})

describe('AC-4701.4·AC-6801.5: 옅은 색 경고', () => {
  it('AC-4701.4·AC-6801.5: 직접 고른 색이 흰색과 4.5 미만이면 경고가 경고색으로 보이고, [저장]·[인쇄·PDF]·[그림 파일]은 막히지 않고 그대로 된다', async () => {
    expect(isLightAccent(LIGHT)).toBe(true)
    const user = await readyScreen()
    pickColor(LIGHT)
    const note = screen.getByText(WARN)
    expect(note.className.split(/\s+/)).toContain('text-warning')
    expect(outputsDisabled()).toEqual([false, false, false])

    await user.click(button('저장'))
    expect(insertNotice).toHaveBeenCalledWith(expect.objectContaining({ accent: LIGHT }))
    await screen.findByText('저장됨')
    await user.click(button('인쇄·PDF'))
    expect(printSpy).toHaveBeenCalledTimes(1)
    await user.click(button('그림 파일'))
    expect(downloadPosterPng).toHaveBeenCalledTimes(1)
    expect(paint(vi.mocked(downloadPosterPng).mock.calls[0][0])).toEqual(painted(LIGHT, 1))
  })

  it('AC-4701.4·AC-6801.5: 4.5 이상인 색이거나 [자동]이면(자동 색이 옅어도) 경고가 없다', async () => {
    expect(isLightAccent(PICKED)).toBe(false)
    expect(isLightAccent(themeOf('children').accent)).toBe(true)
    const user = await readyScreen()
    expect(screen.queryByText(WARN)).toBeNull()
    pickColor(PICKED)
    expect(screen.queryByText(WARN)).toBeNull()
    pickColor(LIGHT)
    expect(screen.getByText(WARN)).toBeTruthy()
    await user.click(autoButton())
    expect(screen.queryByText(WARN)).toBeNull()
  })

  it('AC-6801.5: 옅은 기본 색 칩(흰색·노랑)을 골라도 경고가 보이고, 진한 칩(남색)이면 없다', async () => {
    const user = await readyScreen()
    for (const [name, light] of [
      ['흰색', true],
      ['노랑', true],
      ['남색', false],
    ] as const) {
      await user.click(chip(name))
      expect(pressed()).toEqual([`강조 색 ${name}`])
      expect(screen.queryByText(WARN) !== null, name).toBe(light)
    }
  })
})

describe('AC-4702.1: 어느 그림 위에서도 고른 색', () => {
  it("AC-4702.1: 테마 그림 1·2 위에서 고른 색이고, [그림 파일]에 넘긴 SVG의 'N월'·띠·아래 글도 그 색이다", async () => {
    const user = await readyScreen()
    pickColor(PICKED)
    await user.click(art(2))
    expect(firstHref(poster())).toBe('/poster/themes/children-2.svg')
    expect(paint(poster())).toEqual(painted(PICKED, 1))
    expect(paint(printCopy())).toEqual(painted(PICKED, 1))
    await user.click(button('그림 파일'))
    const [svg] = vi.mocked(downloadPosterPng).mock.calls[0]
    expect(svg).toBe(poster())
    expect(firstHref(svg)).toBe('/poster/themes/children-2.svg')
    expect(paint(svg)).toEqual(painted(PICKED, 1))
  })

  it('AC-4702.1: 내 배경 위에서 고른 색이 들고 배경 그림은 그대로이며, [그림 파일]도 그 색이다', async () => {
    const user = await readyScreen()
    await chooseWinter(user)
    pickColor(PICKED)
    expect(firstHref(poster())).toBe(jpegDataUrl(BYTES))
    expect(paint(poster())).toEqual(painted(PICKED, 1))
    expect(firstHref(printCopy())).toBe(jpegDataUrl(BYTES))
    expect(paint(printCopy())).toEqual(painted(PICKED, 1))
    expect(usedBy(poster(), WINTER.accent)).toBe(0)

    await user.click(button('그림 파일'))
    const [svg] = vi.mocked(downloadPosterPng).mock.calls[0]
    expect(firstHref(svg)).toBe(jpegDataUrl(BYTES))
    expect(paint(svg)).toEqual(painted(PICKED, 1))
    await user.click(button('저장'))
    expect(insertNotice).toHaveBeenCalledWith(expect.objectContaining({ theme: `bg-${ID_A}`, accent: PICKED }))
  })

  it('AC-4702.1: 저장 전 만든 배경(AI 배경) 위에서도 고른 색이고, [안 쓰기]로 테마 그림에 돌아가도 그 색이다', async () => {
    const user = await readyScreen()
    await mine(user)
    fireEvent.change(wordsBox(), { target: { value: '봄 벚꽃' } })
    await user.click(within(bgBox()).getByRole('button', { name: 'AI로 배경 만들기' }))
    await within(bgBox()).findByText('만든 배경: 봄 벚꽃')
    pickColor(PICKED)
    expect(firstHref(poster())).toBe(TRIAL.image)
    expect(paint(poster())).toEqual(painted(PICKED, 1))
    expect(paint(printCopy())).toEqual(painted(PICKED, 1))

    await user.click(within(bgBox()).getByRole('button', { name: '안 쓰기' }))
    expect(firstHref(poster())).toBe('/poster/themes/children.svg')
    expect(paint(poster())).toEqual(painted(PICKED, 1))
  })
})

// 저장 몸통 열쇠: 다섯 칸 + 글씨·로고 여섯 칸(spec form-style AC-6806.2 — 처음대로면 여섯 칸 모두 null)
const BODY_KEYS = ['accent', 'body_color', 'body_scale', 'cards', 'logo_color', 'logo_scale', 'month', 'theme', 'title_color', 'title_scale', 'year']
const STYLE_COLUMNS = ['title_scale', 'body_scale', 'logo_scale', 'title_color', 'body_color', 'logo_color']

describe('AC-4703.1: [저장] 몸통의 accent', () => {
  it('AC-4703.1: 직접 고른 색은 accent(소문자 #rrggbb)로, 자동은 accent: null로 몸통에 들어간다(칸이 빠지지 않는다)', async () => {
    const sent = await realStorage()
    const user = await readyScreen()
    await user.click(button('저장'))
    await screen.findByText('저장됨')
    expect(sent).toHaveLength(1)
    expect(sent[0].kind).toBe('insert')
    expect(Object.keys(sent[0].body).sort()).toEqual(BODY_KEYS)
    expect(sent[0].body.accent).toBeNull()
    expect(STYLE_COLUMNS.map((key) => sent[0].body[key])).toEqual(Array(6).fill(null))

    pickColor(PICKED.toUpperCase())
    expect(screen.getByText(DIRTY)).toBeTruthy()
    await user.click(button('저장'))
    await screen.findByText('저장됨')
    expect(sent[1].kind).toBe('update')
    expect(sent[1].body.accent).toBe(PICKED)
    expect(updateNotice).toHaveBeenCalledWith('new', expect.objectContaining({ accent: PICKED }))

    await user.click(autoButton())
    expect(screen.getByText(DIRTY)).toBeTruthy()
    await user.click(button('저장'))
    await screen.findByText('저장됨')
    expect(sent[2].kind).toBe('update')
    expect(Object.keys(sent[2].body).sort()).toEqual(BODY_KEYS)
    expect(sent[2].body.accent).toBeNull()
  })
})

describe('AC-4703.2: 열기·바뀐 내용·새로 만들기', () => {
  it("AC-4703.2: 글자 색을 저장한 안내문을 열면 그 색으로 열리고, 바꾸면 '저장하지 않은 내용이 있어요', 처음 색으로 되돌리면 사라진다", async () => {
    const user = await open([AUG, DEC])
    await user.click(screen.getByRole('button', { name: /^2026년 12월 · 학회·성탄절 / }))
    expect(pressed()).toEqual([])
    expect(own()).toBe(true)
    expect(colorInput().value).toBe(PICKED)
    expect(shownText()).toBe(PICKED)
    expect(paint(poster())).toEqual(painted(PICKED, 2))
    expect(paint(printCopy())).toEqual(painted(PICKED, 2))
    expect(screen.getByText('저장됨')).toBeTruthy()
    expect(screen.queryByText(DIRTY)).toBeNull()

    pickColor(OTHER)
    expect(screen.getByText(DIRTY)).toBeTruthy()
    pickColor(PICKED)
    expect(screen.queryByText(DIRTY)).toBeNull()
    expect(screen.getByText('저장됨')).toBeTruthy()

    // [자동] → 바뀐 내용. 색 칸은 자동 색(성탄절)에서 시작해 아직 다르다. 처음 색을 고르면 사라진다
    await user.click(autoButton())
    expect(screen.getByText(DIRTY)).toBeTruthy()
    expect(colorInput().value).toBe(themeOf('christmas').accent)
    expect(shownText()).toBe(`자동 ${themeOf('christmas').accent}`)
    pickColor(PICKED)
    expect(screen.queryByText(DIRTY)).toBeNull()
  })

  it('AC-4703.2: 글자 색이 없는 저장 안내문은 자동으로 열리고, 색을 고르면 바뀐 내용이 되며 [자동]으로 되돌리면 사라진다', async () => {
    const user = await open([AUG])
    await user.click(screen.getByRole('button', { name: /^2026년 8월 · 광복절·대체공휴일 / }))
    expect(pressed()).toEqual(AUTO_ON)
    expect(screen.queryByText(DIRTY)).toBeNull()
    pickColor(PICKED)
    expect(screen.getByText(DIRTY)).toBeTruthy()
    await user.click(autoButton())
    expect(screen.queryByText(DIRTY)).toBeNull()
    expect(screen.getByText('저장됨')).toBeTruthy()
  })

  it('AC-4703.2: 내 배경을 쓰는 저장 안내문(글자 색 있음)을 열면 그 배경 위에 그 색으로 그린다', async () => {
    const user = await open([AUG, JAN])
    await user.click(screen.getByRole('button', { name: /^2027년 1월 · 신정 / }))
    await screen.findByText(`고른 배경: ${WINTER.words}`)
    await vi.waitFor(() => expect(firstHref(poster())).toBe(jpegDataUrl(BYTES)))
    expect(own()).toBe(true)
    expect(shownText()).toBe(OTHER)
    expect(paint(poster())).toEqual(painted(OTHER, 1))
    expect(paint(printCopy())).toEqual(painted(OTHER, 1))
    expect(screen.queryByText(DIRTY)).toBeNull()
  })

  it('AC-4703.2: [새로 만들기]는 자동으로 시작한다(연 안내문의 색·고치던 색 모두)', async () => {
    const user = await open([AUG, DEC])
    await user.click(screen.getByRole('button', { name: /^2026년 12월 · 학회·성탄절 / }))
    expect(own()).toBe(true)
    await user.click(button('+ 새로 만들기'))
    const auto = themeOf('m11').accent
    expect(pressed()).toEqual(AUTO_ON)
    expect(colorInput().value).toBe(auto)
    expect(shownText()).toBe(`자동 ${auto}`)
    expect(paint(poster()).month).toBe(auto)

    // 새 안내문에서 고르던 색도 [새로 만들기]면 버린다(바뀐 내용이 있으면 먼저 묻는다)
    const card = screen.getByRole('group', { name: '카드 1' })
    fireEvent.change(within(card).getByLabelText('시작 날짜'), { target: { value: '2027-05-05' } })
    await user.click(chip('빨강'))
    await user.click(button('+ 새로 만들기'))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(pressed()).toEqual(AUTO_ON)
    expect(shownText()).toBe(`자동 ${auto}`)
  })
})
