// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addKeyword, readKeywords, removeKeyword } from '@/lib/storage/notices'
import { KeywordsControl } from './KeywordsControl'

// 내 낱말 단추·칸(specs/notices TASK-25 · AC-7424.8 · AC-7424.9, 시안 ?s=keywords · ?s=keywords-empty).
// 저장소만 가짜이고 글자 도구(lib/notices/keywords·askCheck)는 진짜다. 낱말은 지어낸 예시이고 환자 자료가 없다
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  readKeywords: vi.fn(),
  addKeyword: vi.fn(),
  removeKeyword: vi.fn(),
}))

const read = vi.mocked(readKeywords)
const add = vi.mocked(addKeyword)
const remove = vi.mocked(removeKeyword)

// 시안 예시: 추천에서 셋 + 직접 적은 하나
const MINE = ['도수치료', '체외충격파', '관절강내 주사', '실손보험']
const RECOMMENDED = ['도수치료', '체외충격파', '물리치료', '관절강내 주사', '신경차단술', '증식치료', 'MRI', '초음파', '골다공증', '비급여', '본인부담', '비대면 진료']
const LEDE =
  '고른 낱말이 제목·본문·붙임 파일·AI 요약에 들어 있으면 ‘꼭 볼 글’로 표시해요. 꼭 볼 글은 관련 글만 보기에 늘 나오고, 탭 옆 숫자와 대시보드에도 들어가요.'
const SPACE_HELP = '띄어쓰기와 영문 대소문자는 가리지 않아요. ‘관절강내 주사’로 적어도 ‘관절강내주사’가 든 글을 찾아요. 낱말마다 20자까지예요.'
const FULL = '낱말은 30개까지 고를 수 있어요. 하나를 빼고 더해 주세요.'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// 목록의 고르기 첫 줄(flex-wrap)처럼 감싸지 않고 그대로 놓는다
function mount() {
  return render(
    <div data-testid="row" className="flex flex-wrap">
      <KeywordsControl />
    </div>,
  )
}

async function opened(words: string[] | 'failed', name: string) {
  read.mockResolvedValue(words)
  const view = mount()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name }))
  return { ...view, user, panel: screen.getByRole('region', { name: '내 낱말' }) }
}

const box = () => screen.getByRole('textbox', { name: '더할 낱말' }) as HTMLInputElement
const recNames = (panel: HTMLElement) =>
  within(panel)
    .queryAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '')
    .filter((label) => label.endsWith(' 더하기'))

beforeEach(() => {
  read.mockReset().mockResolvedValue(MINE)
  add.mockReset().mockResolvedValue(true)
  remove.mockReset().mockResolvedValue(true)
})

afterEach(() => {
  cleanup()
})

describe('AC-7424.8: 내 낱말 단추와 펼친 칸', () => {
  it('AC-7424.8: 고른 낱말이 0개면 단추는 `내 낱말 고르기`(aria-expanded false)이고 칸은 접혀 있다', async () => {
    read.mockResolvedValue([])
    mount()
    const button = await screen.findByRole('button', { name: '내 낱말 고르기' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: '내 낱말' })).toBeNull()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('AC-7424.8: 고른 낱말이 있으면 단추는 `내 낱말 {n}개`이고, 누르면 aria-expanded true와 칸(제목 내 낱말 · 닫기 · 안내 글)이 펼쳐진다', async () => {
    const { panel } = await opened(MINE, '내 낱말 4개')
    expect(screen.getByRole('button', { name: '내 낱말 4개' }).getAttribute('aria-expanded')).toBe('true')
    expect(within(panel).getByRole('heading', { name: '내 낱말' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: '닫기' })).toBeTruthy()
    expect(within(panel).getByText(LEDE)).toBeTruthy()
  })

  it('AC-7424.8: 펼친 칸은 단추 바로 뒤 형제로 그려지고(감싸지 않음) basis-full order-last로 고르기 첫 줄 아래로 꽉 차게 내려온다', async () => {
    const { panel } = await opened(MINE, '내 낱말 4개')
    const row = screen.getByTestId('row')
    const toggle = screen.getByRole('button', { name: '내 낱말 4개' })
    expect(Array.from(row.children)).toEqual([toggle, panel])
    expect(panel.className.split(/\s+/)).toEqual(expect.arrayContaining(['basis-full', 'order-last']))
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id)
  })

  it('AC-7424.8: 고른 낱말 {n}개 · 30개까지와 낱말마다 칩·빼기 단추(화면 읽기 {낱말} 빼기)가 넣은 차례로 있다', async () => {
    const { panel } = await opened(MINE, '내 낱말 4개')
    expect(within(panel).getByText('고른 낱말 4개')).toBeTruthy()
    expect(within(panel).getByText('30개까지')).toBeTruthy()
    const chips = within(panel).getAllByRole('listitem')
    expect(chips.map((li) => li.textContent)).toEqual(MINE)
    for (const word of MINE) expect(within(panel).getByRole('button', { name: `${word} 빼기` })).toBeTruthy()
    expect(within(panel).queryByText('아직 고른 낱말이 없어요')).toBeNull()
  })

  it('AC-7424.8: 0개면 `아직 고른 낱말이 없어요` · `추천 낱말을 누르거나 직접 적어 더해 주세요.`와 추천 낱말 12개(차례 그대로)다', async () => {
    const { panel } = await opened([], '내 낱말 고르기')
    expect(within(panel).getByText('고른 낱말 0개')).toBeTruthy()
    expect(within(panel).getByText('아직 고른 낱말이 없어요')).toBeTruthy()
    expect(within(panel).getByText('추천 낱말을 누르거나 직접 적어 더해 주세요.')).toBeTruthy()
    expect(within(panel).queryAllByRole('listitem')).toHaveLength(0)
    expect(recNames(panel)).toEqual(RECOMMENDED.map((w) => `${w} 더하기`))
  })

  it('AC-7424.8: 더할 칸(화면 읽기 더할 낱말, 칸 안 글 예: 실손보험, 20자까지) · 더하기 · 띄어쓰기 도움말이 있다', async () => {
    const { panel } = await opened(MINE, '내 낱말 4개')
    const input = box()
    expect(input.getAttribute('placeholder')).toBe('예: 실손보험')
    expect(input.maxLength).toBe(20)
    expect(input.getAttribute('aria-invalid')).not.toBe('true')
    expect(within(panel).getByRole('button', { name: '더하기' })).toBeTruthy()
    expect(within(panel).getByText(SPACE_HELP)).toBeTruthy()
  })

  it('AC-7424.8: 추천 낱말 · 눌러서 더해요와 아직 안 고른 추천 칩만(차례 그대로, 화면 읽기 {낱말} 더하기) 있다', async () => {
    const { panel } = await opened(MINE, '내 낱말 4개')
    expect(within(panel).getByText('추천 낱말')).toBeTruthy()
    expect(within(panel).getByText('눌러서 더해요')).toBeTruthy()
    const left = RECOMMENDED.filter((w) => !MINE.includes(w))
    expect(recNames(panel)).toEqual(left.map((w) => `${w} 더하기`))
    expect(within(panel).getByRole('button', { name: '물리치료 더하기' }).textContent).toBe('물리치료')
  })

  it('AC-7424.8: 띄어쓰기·영문 대소문자만 다른 낱말을 고른 추천은 고른 것으로 보고 칩을 빼고, 남은 추천이 없으면 추천 칸이 없다', async () => {
    const { panel, unmount } = await opened(['mri', '관절강내주사'], '내 낱말 2개')
    expect(recNames(panel)).not.toContain('MRI 더하기')
    expect(recNames(panel)).not.toContain('관절강내 주사 더하기')
    expect(recNames(panel)).toHaveLength(10)
    unmount()

    const all = await opened(RECOMMENDED, '내 낱말 12개')
    expect(recNames(all.panel)).toHaveLength(0)
    expect(within(all.panel).queryByText('추천 낱말')).toBeNull()
    expect(within(all.panel).queryByText('눌러서 더해요')).toBeNull()
  })

  it('AC-7424.8: 닫기를 누르면 접히고, 단추를 다시 눌러도 접힌다', async () => {
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.click(within(panel).getByRole('button', { name: '닫기' }))
    const toggle = screen.getByRole('button', { name: '내 낱말 4개' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: '내 낱말' })).toBeNull()

    await user.click(toggle)
    expect(screen.getByRole('region', { name: '내 낱말' })).toBeTruthy()
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: '내 낱말' })).toBeNull()
  })

  it('AC-7424.8: notices:changed가 오면 낱말을 다시 읽어 단추 수를 고친다', async () => {
    mount()
    await screen.findByRole('button', { name: '내 낱말 4개' })
    read.mockResolvedValue([...MINE, '비급여'])
    act(() => {
      window.dispatchEvent(new Event('notices:changed'))
    })
    expect(await screen.findByRole('button', { name: '내 낱말 5개' })).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)
  })
})

describe('AC-7424.9: 더하기 · 빼기 · 막힘 · 실패', () => {
  it('AC-7424.9: 적고 더하기를 누르면 다듬은 낱말로 addKeyword를 부르고, 성공하면 칸을 비우고 낱말을 더한다', async () => {
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.type(box(), '  실비   청구 ')
    await user.click(within(panel).getByRole('button', { name: '더하기' }))
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith('실비 청구')
    await waitFor(() => expect(box().value).toBe(''))
    expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual([...MINE, '실비 청구'])
    expect(within(panel).getByText('고른 낱말 5개')).toBeTruthy()
    expect(screen.getByRole('button', { name: '내 낱말 5개' })).toBeTruthy()
  })

  it('AC-7424.9: 칸에서 Enter를 눌러도 더한다', async () => {
    const { user, panel } = await opened([], '내 낱말 고르기')
    await user.type(box(), '실손보험{Enter}')
    expect(add).toHaveBeenCalledWith('실손보험')
    await waitFor(() => expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['실손보험']))
    expect(box().value).toBe('')
  })

  it('AC-7424.9: 추천 칩을 누르면 그 낱말로 addKeyword를 부르고 성공하면 고른 낱말로 옮긴다', async () => {
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.click(within(panel).getByRole('button', { name: '물리치료 더하기' }))
    expect(add).toHaveBeenCalledWith('물리치료')
    await waitFor(() => expect(within(panel).queryByRole('button', { name: '물리치료 더하기' })).toBeNull())
    expect(within(panel).getByRole('button', { name: '물리치료 빼기' })).toBeTruthy()
  })

  it('AC-7424.9: 같은 낱말(띄어쓰기만 다름)이면 addKeyword를 부르지 않고 `이미 고른 낱말이에요`와 칸 aria-invalid이며 적은 글은 그대로다', async () => {
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.type(box(), '관절강내주사')
    await user.click(within(panel).getByRole('button', { name: '더하기' }))
    expect(add).not.toHaveBeenCalled()
    const alert = within(panel).getByRole('alert')
    expect(alert.textContent).toBe('이미 고른 낱말이에요')
    expect(box().getAttribute('aria-invalid')).toBe('true')
    expect(box().getAttribute('aria-describedby')).toBe(alert.id)
    expect(box().value).toBe('관절강내주사')
  })

  it('AC-7424.9: 환자 정보 모양이면 addKeyword를 부르지 않고 기본값 13의 두 글(종류는 kindsText)과 칸 aria-invalid다', async () => {
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.type(box(), '010-1234-5678')
    await user.click(within(panel).getByRole('button', { name: '더하기' }))
    expect(add).not.toHaveBeenCalled()
    const alert = within(panel).getByRole('alert')
    expect(within(alert).getByText('환자 정보로 보이는 글자가 있어 저장하지 않았어요')).toBeTruthy()
    expect(within(alert).getByText('전화번호로 보이는 글자를 지우고 다시 눌러 주세요.')).toBeTruthy()
    expect(box().getAttribute('aria-invalid')).toBe('true')
    expect(box().value).toBe('010-1234-5678')
  })

  it('AC-7424.9: 빈 글자(공백만)면 아무것도 하지 않는다', async () => {
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.type(box(), '   ')
    await user.click(within(panel).getByRole('button', { name: '더하기' }))
    expect(add).not.toHaveBeenCalled()
    expect(within(panel).queryByRole('alert')).toBeNull()
    expect(box().getAttribute('aria-invalid')).not.toBe('true')
  })

  it('AC-7424.9: 30개면 `낱말은 30개까지 고를 수 있어요. 하나를 빼고 더해 주세요.`와 칸·더하기·추천 칩이 막힌다', async () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `낱말${i + 1}`)
    const { panel } = await opened(thirty, '내 낱말 30개')
    expect(within(panel).getByText(FULL)).toBeTruthy()
    expect(box().disabled).toBe(true)
    expect((within(panel).getByRole('button', { name: '더하기' }) as HTMLButtonElement).disabled).toBe(true)
    const recs = within(panel)
      .getAllByRole('button')
      .filter((b) => (b.getAttribute('aria-label') ?? '').endsWith(' 더하기')) as HTMLButtonElement[]
    expect(recs).toHaveLength(12)
    for (const rec of recs) expect(rec.disabled).toBe(true)
    expect((within(panel).getByRole('button', { name: '낱말1 빼기' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-7424.9: 빼기 단추는 removeKeyword를 부르고 성공하면 그 칩이 빠지고 추천 칩으로 돌아온다', async () => {
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.click(within(panel).getByRole('button', { name: '도수치료 빼기' }))
    expect(remove).toHaveBeenCalledWith('도수치료')
    await waitFor(() => expect(within(panel).queryByRole('button', { name: '도수치료 빼기' })).toBeNull())
    expect(within(panel).getByRole('button', { name: '도수치료 더하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '내 낱말 3개' })).toBeTruthy()
  })

  it('AC-7424.9: 더하기 저장 실패면 E-NOTICE-WORDS 오류 상자이고 낱말 목록과 적은 글은 그대로다', async () => {
    add.mockResolvedValue(false)
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.type(box(), '실손보험2')
    await user.click(within(panel).getByRole('button', { name: '더하기' }))
    const alert = await within(panel).findByRole('alert')
    expect(within(alert).getByText('낱말을 저장하지 못했어요')).toBeTruthy()
    expect(within(alert).getByText('잠시 뒤 다시 눌러 주세요. 고른 낱말은 그대로 있어요')).toBeTruthy()
    expect(within(alert).getByText('오류 번호 E-NOTICE-WORDS')).toBeTruthy()
    expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual(MINE)
    expect(box().value).toBe('실손보험2')
  })

  it('AC-7424.9: 빼기 저장 실패면 E-NOTICE-WORDS 오류 상자이고 칩은 그대로다', async () => {
    remove.mockResolvedValue(false)
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.click(within(panel).getByRole('button', { name: '체외충격파 빼기' }))
    const alert = await within(panel).findByRole('alert')
    expect(within(alert).getByText('오류 번호 E-NOTICE-WORDS')).toBeTruthy()
    expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual(MINE)
  })

  it('AC-7424.9: 저장을 기다리는 동안 다시 눌러도 addKeyword를 한 번만 부른다', async () => {
    const wait = deferred<boolean>()
    add.mockReturnValue(wait.promise)
    const { user, panel } = await opened(MINE, '내 낱말 4개')
    await user.click(within(panel).getByRole('button', { name: '물리치료 더하기' }))
    await user.click(within(panel).getByRole('button', { name: '신경차단술 더하기' }))
    expect(add).toHaveBeenCalledTimes(1)
    await act(async () => {
      wait.resolve(true)
      await wait.promise
    })
    expect(within(panel).getByRole('button', { name: '물리치료 빼기' })).toBeTruthy()
  })

  it('AC-7424.9: 낱말을 못 읽으면 칸에 E-NOTICE-READ 상자이고 다시 읽기로 다시 읽는다', async () => {
    const { user, panel } = await opened('failed', '내 낱말 고르기')
    const alert = within(panel).getByRole('alert')
    expect(within(alert).getByText('고시·공지를 읽지 못했어요')).toBeTruthy()
    expect(within(alert).getByText('오류 번호 E-NOTICE-READ')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '더할 낱말' })).toBeNull()

    read.mockResolvedValue(MINE)
    await user.click(within(panel).getByRole('button', { name: '다시 읽기' }))
    expect(await screen.findByRole('button', { name: '내 낱말 4개' })).toBeTruthy()
    expect(within(panel).queryByRole('alert')).toBeNull()
    expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual(MINE)
  })
})
