// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STYLE, type FormStyle } from '@/lib/forms/style'
import { StyleControls } from './StyleControls'

// 서식 '글씨·로고' 칸(spec form-style REQ-6801 AC-6801.1~AC-6801.4·AC-6801.6~AC-6801.8, design.md 8절,
// 승인 시안 docs/mockups/form-style/index.html). 줄: 제목 글씨 · 본문 글씨 · (강조 색, 진료일정 안내만) · 로고, 도움말, [처음대로]

const NOTICE_HELP =
  "제목은 '진료일정안내', 본문은 위 안내 두 줄과 카드 속 글씨예요. 본문 색은 안내 두 줄과 카드 이름에 들고, 'N월'·날짜 띠·상태 글씨는 '강조 색'을 따라요. [자동]은 로고가 있으면 로고 색이에요. 자리보다 크게는 커지지 않아요."
const GUIDE_HELP = '제목은 큰 문구 두 줄, 본문은 진회색 띠 안의 줄 글이에요. [자동]이면 제목은 띠 색, 본문은 흰색이에요. 자리보다 크게는 커지지 않아요.'
const LOCKED = '배경이 있는 로고라 색을 바꿀 수 없어요. 원래 색으로 그려요'
const STARTS = { title: '#262626', body: '#3a3a3a', logo: '#1f5fbf' }
const SWATCHES = ['#1f5fbf', '#d9d21f']

type Props = Parameters<typeof StyleControls>[0]
function draw(patch: Partial<Props> = {}) {
  const onStyle = vi.fn<(s: FormStyle) => void>()
  const onReset = vi.fn()
  const props: Props = {
    tool: 'notice',
    style: DEFAULT_STYLE,
    logoSwatches: SWATCHES,
    starts: STARTS,
    logoTintable: true,
    onStyle,
    onReset,
    accentRow: <div data-testid="accent-row">강조 색 줄</div>,
    ...patch,
  }
  const view = render(<StyleControls {...props} />)
  return { onStyle, onReset, rerender: (next: Partial<Props>) => view.rerender(<StyleControls {...props} {...next} />) }
}

const box = () => screen.getByRole('group', { name: '글씨·로고' })
const rowTitles = () => within(box()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
const slider = (name: string) => within(box()).getByRole('slider', { name }) as HTMLInputElement
const chooser = (name: string) => within(box()).getByRole('group', { name })
const colorInput = (name: string) => within(box()).getByLabelText(`${name} 직접 고르기`) as HTMLInputElement

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AC-6801.1: 묶음과 줄 차례', () => {
  it("AC-6801.1: 진료일정 안내는 이름표 '글씨·로고' 묶음(fieldset) 안에 '제목 글씨'·'본문 글씨'·강조 색 줄·'로고' 줄, 도움말, [처음대로]가 이 차례다", () => {
    draw()
    const group = box()
    expect(group.localName).toBe('fieldset')
    expect(group.querySelector('legend')?.textContent).toBe('글씨·로고')
    expect(rowTitles()).toEqual(['제목 글씨', '본문 글씨', '로고'])
    const order = [
      within(group).getByRole('heading', { name: '제목 글씨' }),
      within(group).getByRole('heading', { name: '본문 글씨' }),
      screen.getByTestId('accent-row'),
      within(group).getByRole('heading', { name: '로고' }),
      within(group).getByText(NOTICE_HELP),
      within(group).getByRole('button', { name: '처음대로' }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}번째 차례`).toBeTruthy()
    }
    expect(group.contains(screen.getByTestId('accent-row'))).toBe(true)
  })

  it("AC-6801.1: 환자 안내문은 같은 묶음이되 강조 색 줄이 없다(넘기지 않는다)", () => {
    draw({ tool: 'guide', accentRow: undefined, starts: { title: '#2e2e2e', body: '#ffffff', logo: '#111111' } })
    expect(rowTitles()).toEqual(['제목 글씨', '본문 글씨', '로고'])
    expect(within(box()).queryByRole('group', { name: '강조 색' })).toBeNull()
    expect(within(box()).getByRole('button', { name: '처음대로' })).toBeTruthy()
  })
})

describe('AC-6801.2: 크기 밀대', () => {
  it("AC-6801.2: '제목 글씨 크기'·'본문 글씨 크기'는 80~130·5씩, '로고 크기'는 60~150·5씩이고 지금 값 N%가 보인다", () => {
    draw({ style: { ...DEFAULT_STYLE, titleScale: 115, bodyScale: 85, logoScale: 140 } })
    const spec = (name: string) => {
      const s = slider(name)
      return [s.type, s.min, s.max, s.step, s.value]
    }
    expect(spec('제목 글씨 크기')).toEqual(['range', '80', '130', '5', '115'])
    expect(spec('본문 글씨 크기')).toEqual(['range', '80', '130', '5', '85'])
    expect(spec('로고 크기')).toEqual(['range', '60', '150', '5', '140'])
    for (const text of ['115%', '85%', '140%']) expect(within(box()).getByText(text)).toBeTruthy()
    expect(within(box()).getAllByText('크기')).toHaveLength(3)
  })

  it('AC-6801.2: 밀면 그 값(숫자)이 서식 값에 바로 들어간다(다른 값은 그대로)', () => {
    const style: FormStyle = { ...DEFAULT_STYLE, titleColor: '#dc2626' }
    const { onStyle } = draw({ style })
    fireEvent.change(slider('제목 글씨 크기'), { target: { value: '125' } })
    fireEvent.change(slider('본문 글씨 크기'), { target: { value: '90' } })
    fireEvent.change(slider('로고 크기'), { target: { value: '60' } })
    expect(onStyle.mock.calls).toEqual([
      [{ ...style, titleScale: 125 }],
      [{ ...style, bodyScale: 90 }],
      [{ ...style, logoScale: 60 }],
    ])
  })
})

describe('AC-6801.3·AC-6801.4: 줄마다 색 고르기', () => {
  it("AC-6801.3: '제목 글씨 색'·'본문 글씨 색'은 첫 단추 '자동', '로고 색'은 '원래 색'이고 색 칸의 처음 값은 줄마다 시작 색이다", () => {
    draw()
    expect(within(chooser('제목 글씨 색')).getAllByRole('button')[0].textContent).toBe('자동')
    expect(within(chooser('본문 글씨 색')).getAllByRole('button')[0].textContent).toBe('자동')
    expect(within(chooser('로고 색')).getAllByRole('button')[0].textContent).toBe('원래 색')
    expect([colorInput('제목 글씨 색').value, colorInput('본문 글씨 색').value, colorInput('로고 색').value]).toEqual([STARTS.title, STARTS.body, STARTS.logo])
    // 로고 색 칩은 세 고르기 모두에 있다
    for (const name of ['제목 글씨 색', '본문 글씨 색', '로고 색']) {
      expect(within(chooser(name)).getByRole('button', { name: `${name} 로고 색 2` })).toBeTruthy()
    }
  })

  it('AC-6801.3: 지금 값과 같은 칩·첫 단추만 눌린다', () => {
    draw({ style: { ...DEFAULT_STYLE, titleColor: '#dc2626', logoColor: SWATCHES[0] } })
    const on = (name: string) =>
      within(chooser(name))
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(on('제목 글씨 색')).toEqual(['제목 글씨 색 빨강'])
    expect(on('본문 글씨 색')).toEqual(['자동'])
    expect(on('로고 색')).toEqual(['로고 색 로고 색 1'])
  })

  it('AC-6801.4: 칩·색 칸·첫 단추로 고른 값이 그 줄의 색(titleColor·bodyColor·logoColor)에 들어간다', async () => {
    const user = userEvent.setup()
    const style: FormStyle = { ...DEFAULT_STYLE, titleScale: 120, bodyColor: '#16a34a' }
    const { onStyle } = draw({ style })
    await user.click(within(chooser('제목 글씨 색')).getByRole('button', { name: '제목 글씨 색 남색' }))
    await user.click(within(chooser('본문 글씨 색')).getByRole('button', { name: '자동' }))
    fireEvent.input(colorInput('로고 색'), { target: { value: '#ABCDEF' } })
    expect(onStyle.mock.calls).toEqual([
      [{ ...style, titleColor: '#1f2a44' }],
      [{ ...style, bodyColor: null }],
      [{ ...style, logoColor: '#abcdef' }],
    ])
  })
})

describe('AC-6801.6: 도움말', () => {
  it('AC-6801.6: 진료일정 안내 도움말 글자 그대로', () => {
    draw()
    expect(within(box()).getByText(NOTICE_HELP)).toBeTruthy()
    expect(within(box()).queryByText(GUIDE_HELP)).toBeNull()
  })

  it('AC-6801.6: 환자 안내문 도움말 글자 그대로', () => {
    draw({ tool: 'guide', accentRow: undefined })
    expect(within(box()).getByText(GUIDE_HELP)).toBeTruthy()
    expect(within(box()).queryByText(NOTICE_HELP)).toBeNull()
  })
})

describe('AC-6801.7: [처음대로]', () => {
  it('AC-6801.7: [처음대로]를 누르면 onReset을 부른다(값 바꾸기는 부르는 쪽이 한다)', async () => {
    const user = userEvent.setup()
    const { onReset, onStyle } = draw({ style: { ...DEFAULT_STYLE, titleScale: 130 } })
    const reset = within(box()).getByRole('button', { name: '처음대로' })
    expect(reset.getAttribute('type')).toBe('button')
    await user.click(reset)
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onStyle).not.toHaveBeenCalled()
  })
})

describe('AC-6801.8: 색을 칠할 수 없는 로고', () => {
  it('AC-6801.8: 로고 색 고르기의 단추·칩·색 칸이 막히고 그 아래 까닭 글이 보이며, 크기 밀대와 글씨 색은 그대로 쓸 수 있다', async () => {
    const user = userEvent.setup()
    const style: FormStyle = { ...DEFAULT_STYLE, logoColor: '#ffffff' }
    const { onStyle } = draw({ style, logoTintable: false })
    const logo = chooser('로고 색')
    for (const b of within(logo).getAllByRole('button') as HTMLButtonElement[]) expect(b.disabled).toBe(true)
    expect(colorInput('로고 색').disabled).toBe(true)
    const note = within(box()).getByText(LOCKED)
    expect(logo.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 저장된 로고 색 값은 지우지 않는다(눌린 상태 그대로, 아무것도 보내지 않는다)
    expect(within(logo).getByRole('button', { name: '로고 색 흰색' }).getAttribute('aria-pressed')).toBe('true')
    expect(onStyle).not.toHaveBeenCalled()

    expect(slider('로고 크기').disabled).toBe(false)
    fireEvent.change(slider('로고 크기'), { target: { value: '120' } })
    expect(onStyle).toHaveBeenLastCalledWith({ ...style, logoScale: 120 })
    await user.click(within(chooser('제목 글씨 색')).getByRole('button', { name: '제목 글씨 색 빨강' }))
    expect(onStyle).toHaveBeenLastCalledWith({ ...style, titleColor: '#dc2626' })
  })

  it('AC-6801.8: 칠할 수 있는 로고면 까닭 글이 없고 로고 색 고르기가 열려 있다', () => {
    const { rerender } = draw({ logoTintable: false })
    expect(within(box()).getByText(LOCKED)).toBeTruthy()
    rerender({ logoTintable: true })
    expect(within(box()).queryByText(LOCKED)).toBeNull()
    expect(colorInput('로고 색').disabled).toBe(false)
  })
})
