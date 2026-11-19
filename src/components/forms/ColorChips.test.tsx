// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BASIC_COLORS } from './colorChoices'
import { ColorChips } from './ColorChips'

// 서식 색 고르기 한 벌(spec form-style REQ-6801 AC-6801.3·AC-6801.4·AC-6801.8, REQ-6802 AC-6802.2, design.md 8절,
// 승인 시안 docs/mockups/form-style/index.html chooser()). 첫 단추 → 로고 색 칩 → 기본 색 16가지 → 직접 고르기 색 칸

const LOGO = ['#1f5fbf', '#d9d21f'] // 로고에서 뽑은 색(지어낸 값)
const START = '#123456' // 값이 없을 때 색 칸의 처음 값
const OWN = '#0b7a5c' // 어느 칩과도 다른 색

type Props = Parameters<typeof ColorChips>[0]
function draw(patch: Partial<Props> = {}) {
  const onChange = vi.fn<(value: string | null) => void>()
  const props: Props = { label: '제목 글씨 색', first: '자동', value: null, start: START, logoSwatches: LOGO, onChange, ...patch }
  const view = render(<ColorChips {...props} />)
  return { onChange, rerender: (next: Partial<Props>) => view.rerender(<ColorChips {...props} {...next} />) }
}

const box = (label = '제목 글씨 색') => screen.getByRole('group', { name: label })
const buttons = (label?: string) => within(box(label)).getAllByRole('button') as HTMLButtonElement[]
const names = (label?: string) => buttons(label).map((b) => b.getAttribute('aria-label') ?? b.textContent)
const pressed = (label?: string) => buttons(label).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label') ?? b.textContent)
const colorInput = (label = '제목 글씨 색') => screen.getByLabelText(`${label} 직접 고르기`) as HTMLInputElement

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AC-6801.3: 색 고르기 차례와 이름', () => {
  it("AC-6801.3: 묶음(이름 = 고르기 이름) 안에 첫 단추 '자동' → '로고 색' 글과 칩 → '기본 색' 글과 16가지 칩 → '직접 고르기' 색 칸이 차례로 있다", () => {
    draw()
    const group = box()
    expect(group.getAttribute('role')).toBe('group')
    expect(names()).toEqual([
      '자동',
      '제목 글씨 색 로고 색 1',
      '제목 글씨 색 로고 색 2',
      ...BASIC_COLORS.map((c) => `제목 글씨 색 ${c.name}`),
    ])
    for (const b of buttons()) expect(b.getAttribute('type')).toBe('button')
    // 글·칩·색 칸의 놓인 차례
    const order = [
      within(group).getByRole('button', { name: '자동' }),
      within(group).getByText('로고 색'),
      within(group).getByRole('button', { name: '제목 글씨 색 로고 색 1' }),
      within(group).getByText('기본 색'),
      within(group).getByRole('button', { name: '제목 글씨 색 검정' }),
      within(group).getByRole('button', { name: '제목 글씨 색 갈색' }),
      within(group).getByText('직접 고르기'),
      colorInput(),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}번째 차례`).toBeTruthy()
    }
    expect(colorInput().getAttribute('type')).toBe('color')
    expect(group.contains(colorInput())).toBe(true)
  })

  it("AC-6801.3: 로고 고르기의 첫 단추는 '원래 색'이고, 칩 이름은 '로고 색 로고 색 1'처럼 고르기 이름이 앞에 붙는다", () => {
    draw({ label: '로고 색', first: '원래 색' })
    expect(names('로고 색').slice(0, 3)).toEqual(['원래 색', '로고 색 로고 색 1', '로고 색 로고 색 2'])
    expect(colorInput('로고 색').getAttribute('aria-label')).toBe('로고 색 직접 고르기')
  })

  it('AC-6801.3: 칩 바탕은 그 칩 색이고 사용자 색은 style 속성으로만 넣는다(클래스에 색 글자가 없다)', () => {
    draw()
    const chip = within(box()).getByRole('button', { name: '제목 글씨 색 빨강' })
    expect(chip.style.backgroundColor).toBe('rgb(220, 38, 38)') // #dc2626
    expect(within(box()).getByRole('button', { name: '제목 글씨 색 로고 색 1' }).style.backgroundColor).toBe('rgb(31, 95, 191)')
    for (const el of [...box().querySelectorAll('*')]) expect(el.getAttribute('class') ?? '').not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it('AC-6801.3: 값이 null이면 첫 단추만 눌려 있고 색 칸은 시작 색, 눌린 표시(data-own)가 없다', () => {
    draw()
    expect(pressed()).toEqual(['자동'])
    expect(colorInput().value).toBe(START)
    expect(colorInput().getAttribute('data-own')).toBeNull()
  })

  it('AC-6801.3: 값이 기본 색이면 그 칩만, 로고 색이면 그 로고 칩만 눌리고 색 칸은 그 값이며 data-own이 없다', () => {
    const { rerender } = draw({ value: '#dc2626' })
    expect(pressed()).toEqual(['제목 글씨 색 빨강'])
    expect(colorInput().value).toBe('#dc2626')
    expect(colorInput().getAttribute('data-own')).toBeNull()
    rerender({ value: LOGO[1] })
    expect(pressed()).toEqual(['제목 글씨 색 로고 색 2'])
    expect(colorInput().value).toBe(LOGO[1])
    expect(colorInput().getAttribute('data-own')).toBeNull()
  })

  it('AC-6801.3: 값이 어느 칩과도 다르면 아무 단추도 눌리지 않고 색 칸이 그 값에 data-own="true"(테두리)다', () => {
    draw({ value: OWN })
    expect(pressed()).toEqual([])
    expect(colorInput().value).toBe(OWN)
    expect(colorInput().getAttribute('data-own')).toBe('true')
    expect(colorInput().className).toContain('border-accent')
  })
})

describe('AC-6802.2: 로고 색 칩이 없을 때', () => {
  it("AC-6802.2: 로고 색 칩이 비어 있으면 '로고 색' 글과 로고 칩이 없고 기본 색 16가지만 있다", () => {
    draw({ logoSwatches: [] })
    expect(within(box()).queryByText('로고 색')).toBeNull()
    expect(names()).toEqual(['자동', ...BASIC_COLORS.map((c) => `제목 글씨 색 ${c.name}`)])
    expect(within(box()).getByText('기본 색')).toBeTruthy()
  })

  it('AC-6802.2: 로고 칩과 같은 색이 기본 색에도 있으면 둘 다 눌린 상태다', () => {
    draw({ logoSwatches: ['#111111'], value: '#111111' })
    expect(pressed()).toEqual(['제목 글씨 색 로고 색 1', '제목 글씨 색 검정'])
  })
})

describe('AC-6801.4: 고르면 그 값', () => {
  it('AC-6801.4: 칩을 누르면 그 색, 로고 칩이면 그 로고 색, 첫 단추를 누르면 null을 보낸다', async () => {
    const user = userEvent.setup()
    const { onChange } = draw({ value: OWN })
    await user.click(within(box()).getByRole('button', { name: '제목 글씨 색 파랑' }))
    await user.click(within(box()).getByRole('button', { name: '제목 글씨 색 로고 색 1' }))
    await user.click(within(box()).getByRole('button', { name: '자동' }))
    expect(onChange.mock.calls).toEqual([['#2563eb'], [LOGO[0]], [null]])
  })

  it('AC-6801.4: 색 칸에서 고르면 그 색을 소문자 #rrggbb로 보낸다(input·change 어느 쪽이 와도)', () => {
    const { onChange } = draw()
    fireEvent.input(colorInput(), { target: { value: '#ABCDEF' } })
    expect(onChange).toHaveBeenLastCalledWith('#abcdef')
    fireEvent.change(colorInput(), { target: { value: '#0B7A5C' } })
    expect(onChange).toHaveBeenLastCalledWith('#0b7a5c')
    for (const [value] of onChange.mock.calls) expect(value).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('AC-6801.8: 막힌 고르기', () => {
  it('AC-6801.8: disabled면 첫 단추·칩·색 칸이 모두 막히고 눌러도 아무것도 보내지 않으며, 값(눌린 상태)은 그대로 보인다', async () => {
    const user = userEvent.setup()
    const { onChange } = draw({ label: '로고 색', first: '원래 색', value: '#ffffff', disabled: true })
    for (const b of buttons('로고 색')) expect(b.disabled, b.getAttribute('aria-label') ?? b.textContent ?? '').toBe(true)
    expect(colorInput('로고 색').disabled).toBe(true)
    expect(pressed('로고 색')).toEqual(['로고 색 흰색'])
    await user.click(within(box('로고 색')).getByRole('button', { name: '로고 색 검정' }))
    await user.click(within(box('로고 색')).getByRole('button', { name: '원래 색' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('AC-6801.8: disabled가 아니면 막힌 것이 없다', () => {
    draw()
    expect(buttons().every((b) => !b.disabled)).toBe(true)
    expect(colorInput().disabled).toBe(false)
  })
})
