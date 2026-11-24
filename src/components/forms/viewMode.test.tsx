// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClinicProfile, type ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { readLogoBitmap, readLogoPixels } from '@/lib/forms/png'
import { backgroundPick } from '@/lib/forms/themes'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { deleteBackground, listBackgrounds, readBackgroundImage, saveBackground } from '@/lib/storage/formBackgrounds'
import { deleteGuide, insertGuide, listGuides, updateGuide } from '@/lib/storage/formGuides'
import { deleteNotice, insertNotice, listNotices, updateNotice } from '@/lib/storage/formNotices'
import type { SavedBackground } from '@/types/formBackground'
import type { GuideContent, SavedGuide } from '@/types/formGuide'
import type { SavedNotice } from '@/types/forms'
import { FormsScreen } from './FormsScreen'

// 보는 중 서식 (admin-view REQ-8011 AC-8011.1, design.md '탭마다 읽기만' 서식 줄).
// 관리자가 다른 의원을 보는 중이면 [저장]·[+ 새로 만들기]·[지우기]·카드·줄 더하기·빼기·[처음대로]·[정리하기](AI)·[AI로 배경 만들기]·
// [이 배경 지우기]·[AI로 그림 그리기]가 없고, 입력 칸은 막혀(disabled) 값만 보인다. 저장한 안내문 목록·열어 보기·[인쇄·PDF]·[그림 파일]은 그대로다.
// viewing={null}이면 지금과 같다. 저장 모듈·fetch(AI 경로)·병원 정보 훅·그림 읽기는 흉내다(실제 서버·Supabase에 붙지 않는다). 글은 지어낸 것이다

vi.mock('@/lib/storage/formNotices', () => ({ listNotices: vi.fn(), insertNotice: vi.fn(), updateNotice: vi.fn(), deleteNotice: vi.fn() }))
vi.mock('@/lib/storage/formGuides', () => ({ listGuides: vi.fn(), insertGuide: vi.fn(), updateGuide: vi.fn(), deleteGuide: vi.fn() }))
vi.mock('@/lib/storage/formBackgrounds', () => ({ listBackgrounds: vi.fn(), saveBackground: vi.fn(), readBackgroundImage: vi.fn(), deleteBackground: vi.fn() }))
vi.mock('@/lib/forms/png', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forms/png')>()),
  downloadPosterPng: vi.fn(),
  downloadGuidePng: vi.fn(),
  readLogoPixels: vi.fn(),
  readLogoBitmap: vi.fn(),
  bitmapToPngUrl: vi.fn(),
}))
vi.mock('@/components/clinic/useClinicProfile', () => ({ useClinicProfile: vi.fn() }))

const VIEWING: Viewing = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '가짜다른의원' }
const TODAY = '2026-11-10'
const clinicView = (): ClinicProfileView => ({
  state: 'ready',
  profile: defaultProfile(),
  saved: true,
  signupName: '가입한 의원',
  signupPhone: null,
  name: '가짜다른의원',
  logoDataUrl: null,
  reload: vi.fn(),
})
const BG_ID = '0a1b2c3d-1111-4222-8333-444455556666'
const BG: SavedBackground = { id: BG_ID, words: '봄 벚꽃', accent: '#c0507a', thumb: 'AAAA', path: `h/${BG_ID}.jpg`, createdAt: '2026-11-01T01:00:00.000Z' }
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
const MAY: SavedNotice = { id: 'may', year: 2027, month: 5, cards: [{ start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }], theme: backgroundPick(BG_ID), updatedAt: '2026-11-09T01:00:00.000Z' }
const INSURANCE: GuideContent = {
  tag: '보험 서류 안내',
  subtitle: '보험사에 낼 서류는',
  big1: '수납할 때',
  big2: '말씀해 주세요',
  firstSmall: false,
  boxTop: '이렇게 말씀해 주세요',
  boxBottom: '"보험 서류 필요해요"',
  picture: 'document',
  drawing: null,
  bandTitle: '이런 서류가 필요하실 때',
  mark: 'check',
  lines: [
    { text: '진단서', em: '' },
    { text: '진료비 영수증', em: '' },
  ],
  note: '필요한 서류는 보험사마다 다르니 미리 확인해 주세요',
}
const SAVED_INS: SavedGuide = { id: 'ins', updatedAt: '2026-11-12T01:00:00.000Z', content: INSURANCE }

const WRITES = [insertNotice, updateNotice, deleteNotice, insertGuide, updateGuide, deleteGuide, saveBackground, deleteBackground]
/** 보는 중에 없어야 할 단추(쓰기·AI·고치기) */
const WRITE_BUTTON = /^(?:저장|다시 저장|\+ 새로 만들기|지우기|정리하기|\+ 카드 더하기|\+ 줄 더하기|빼기|처음대로|AI로 배경 만들기|이 배경 지우기|내 배경으로 저장|다시 만들기|안 쓰기|AI로 그림 그리기)$/

const fetchSpy = vi.fn<typeof fetch>()
const printSpy = vi.fn()

beforeEach(() => {
  vi.mocked(listNotices).mockResolvedValue([MAY, AUG])
  vi.mocked(listGuides).mockResolvedValue([SAVED_INS])
  vi.mocked(listBackgrounds).mockResolvedValue([BG])
  vi.mocked(readBackgroundImage).mockResolvedValue(null)
  vi.mocked(useClinicProfile).mockReturnValue(clinicView())
  vi.mocked(readLogoPixels).mockResolvedValue(null)
  vi.mocked(readLogoBitmap).mockResolvedValue(null)
  vi.stubGlobal('fetch', fetchSpy)
  window.print = printSpy
  window.confirm = vi.fn(() => true)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const inView = (viewing: Viewing | null, children: ReactNode) => <ViewingProvider viewing={viewing}>{children}</ViewingProvider>
const writeButtons = () => screen.queryAllByRole('button').filter((b) => WRITE_BUTTON.test((b.textContent ?? '').trim()))
const preview = () => screen.getByRole('region', { name: '미리보기' })
/** 보이는 '만들기' 칸의 입력·고르기 칸(글 칸·날짜·달·고르기·밀대·체크·색) */
const fieldsIn = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('input, select, textarea'))
const isOff = (el: HTMLElement) => el.matches(':disabled')

async function open(viewing: Viewing | null) {
  const user = userEvent.setup()
  render(inView(viewing, <FormsScreen today={TODAY} />))
  await screen.findByRole('button', { name: /2026년 8월 · 광복절·대체공휴일/ })
  return user
}

describe('AC-8011.1: 보는 중 서식 — 휴진 안내', () => {
  it('AC-8011.1: 쓰기·AI 단추가 없고 [인쇄·PDF]·[그림 파일]은 그대로다', async () => {
    await open(VIEWING)
    expect(writeButtons().map((b) => b.textContent)).toEqual([])
    expect(within(preview()).getByRole('button', { name: '인쇄·PDF' })).toBeTruthy()
    expect(within(preview()).getByRole('button', { name: '그림 파일' })).toBeTruthy()
    expect(within(preview()).queryByRole('button', { name: '저장' })).toBeNull()
  })

  it('AC-8011.1: 저장한 안내문을 눌러 열어 보고(카드 글이 칸에 보임) 인쇄·그림 파일을 쓸 수 있다 — 입력 칸은 모두 막혀 있다', async () => {
    const user = await open(VIEWING)
    await user.click(screen.getByRole('button', { name: /2026년 8월 · 광복절·대체공휴일/ }))
    const editor = screen.getByRole('region', { name: '만들기' }).parentElement as HTMLElement
    const fields = fieldsIn(editor)
    expect(fields.length).toBeGreaterThan(5)
    expect(fields.filter((el) => !isOff(el)).map((el) => el.getAttribute('aria-label') ?? el.id)).toEqual([])
    expect((within(editor).getAllByLabelText('이름')[0] as HTMLInputElement).value).toBe('광복절')
    expect(writeButtons()).toEqual([])
    const print = within(preview()).getByRole('button', { name: '인쇄·PDF' }) as HTMLButtonElement
    expect(print.disabled).toBe(false)
    await user.click(print)
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('AC-8011.1: 내 배경을 쓴 안내문을 열어도 [AI로 배경 만들기]·[이 배경 지우기]가 없다', async () => {
    const user = await open(VIEWING)
    await user.click(screen.getByRole('button', { name: /2027년 5월 · 어린이날/ }))
    expect(await screen.findByText('고른 배경: 봄 벚꽃')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'AI로 배경 만들기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '이 배경 지우기' })).toBeNull()
    expect(writeButtons()).toEqual([])
  })

  it('AC-8011.1: 보는 중에는 저장 함수·AI 경로를 부르지 않는다', async () => {
    const user = await open(VIEWING)
    await user.click(screen.getByRole('button', { name: /2026년 8월 · 광복절·대체공휴일/ }))
    for (const write of WRITES) expect(write).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('AC-8011.1: 보는 중 서식 — 환자 안내문', () => {
  it('AC-8011.1: [정리하기]·[AI로 그림 그리기]·줄 더하기·빼기·[저장]·[+ 새로 만들기]가 없고 입력 칸은 막혀 있으며 [인쇄·PDF]·[그림 파일]은 그대로다', async () => {
    const user = await open(VIEWING)
    await user.click(within(screen.getByRole('group', { name: '서식 도구' })).getByRole('button', { name: '환자 안내문' }))
    const list = screen.getByRole('region', { name: '저장한 환자 안내문' })
    await user.click(await within(list).findByRole('button', { name: '보험 서류 안내 11월 12일 고침' }))
    expect(writeButtons()).toEqual([])
    const editor = screen.getByRole('region', { name: '만들기' })
    const fields = fieldsIn(editor)
    expect(fields.length).toBeGreaterThan(5)
    expect(fields.filter((el) => !isOff(el)).map((el) => el.getAttribute('aria-label') ?? el.id)).toEqual([])
    expect((within(editor).getByLabelText('머리표') as HTMLInputElement).value).toBe('보험 서류 안내')
    expect(within(preview()).getByRole('button', { name: '인쇄·PDF' })).toBeTruthy()
    expect(within(preview()).getByRole('button', { name: '그림 파일' })).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('AC-8011.1: viewing={null}이면 지금과 같다', () => {
  it('AC-8011.1: 쓰기 단추가 있고 입력 칸은 열려 있다', async () => {
    const user = await open(null)
    expect(screen.getByRole('button', { name: '+ 새로 만들기' })).toBeTruthy()
    expect(within(preview()).getByRole('button', { name: '저장' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '정리하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ 카드 더하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '처음대로' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /2026년 8월 · 광복절·대체공휴일/ }))
    expect(within(preview()).getByRole('button', { name: '지우기' })).toBeTruthy()
    const editor = screen.getByRole('region', { name: '만들기' }).parentElement as HTMLElement
    expect(fieldsIn(editor).filter(isOff)).toEqual([])
    expect(editor.querySelector('fieldset[disabled]')).toBeNull()
  })
})
