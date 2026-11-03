// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InputSelection } from '@/types/precheck'
import { defaultSelection, InputMode } from './InputMode'

// 입력 방식 고르기(AC-018.8~AC-018.11). 안내 글은 Worker의 inputTargets가 정하고 여기서는 그리기만 한다

afterEach(cleanup)

const VISIBLE = { from: '2026-10-05', to: '2026-10-12' }
const CHIPS = [
  { code: 'LA358', name: '가상시술 가', count: 3 },
  { code: 'LB120', name: '가상시술 나', count: 1 },
]

function Harness({ problem = null, typedOverChip = false, locked = false, onChange }: { problem?: string | null; typedOverChip?: boolean; locked?: boolean; onChange?: (next: InputSelection) => void }) {
  const [selection, setSelection] = useState(defaultSelection(VISIBLE))
  return (
    <InputMode
      visible={VISIBLE}
      selection={selection}
      onSelection={(next) => {
        setSelection(next)
        onChange?.(next)
      }}
      problem={problem}
      chips={CHIPS}
      typedOverChip={typedOverChip}
      locked={locked}
    />
  )
}

describe('AC-018.8 처음 화면', () => {
  it('AC-018.8: 처방코드별(왼쪽)·날짜별이 있고 처방코드별이 골라져 있으며 시작·끝은 불러온 기간이다', () => {
    render(<Harness />)
    const radios = screen.getAllByRole('radio', { name: /처방코드별|날짜별/ }) as HTMLInputElement[]
    expect(radios.map((radio) => radio.value)).toEqual(['code', 'date'])
    expect(radios[0].checked).toBe(true)
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe(VISIBLE.from)
    expect((screen.getByLabelText('끝') as HTMLInputElement).value).toBe(VISIBLE.to)
    expect(screen.getByText('불러온 기간 10/5 (월) ~ 10/12 (월)')).toBeTruthy()
  })

  it('AC-018.8: 칸 아래 글이 방식마다 다르고, 날짜별은 하루(그 기간 첫날)로 시작한다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('입력 전에 비트 내원내역 창을 이 기간이 모두 들어가게 띄워 두세요. 처방코드 칸은 비우거나 같은 코드로 맞추고, 상병 검색칸은 비워 두세요.')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /날짜별/ }))
    expect(screen.getByText('입력 전에 비트 내원내역 창을 이 날짜가 모두 들어가게 띄워 두고, 처방코드·상병 검색칸은 비워 두세요.')).toBeTruthy()
    expect((screen.getByRole('radio', { name: '하루' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('날짜') as HTMLInputElement).value).toBe(VISIBLE.from)
    await user.click(screen.getByRole('radio', { name: '시작~끝' }))
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe(VISIBLE.from)
    expect((screen.getByLabelText('끝') as HTMLInputElement).value).toBe(VISIBLE.to)
  })

  it('AC-018.8: 확인 기다리는 중·입력 중에는 칸과 단추를 바꿀 수 없고 안내가 있다', () => {
    render(<Harness locked />)
    expect(screen.getByText('입력이 끝난 뒤 입력 방식을 바꿔 주세요')).toBeTruthy()
    for (const radio of screen.getAllByRole('radio')) expect((radio as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('시작') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('처방코드 넣기') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /LA358/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('AC-018.10 코드 단추', () => {
  it('AC-018.10: 코드·이름·건수가 보이고 아래 글이 있다', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: /LA358/ }).textContent).toContain('가상시술 가 · 3건')
    expect(screen.getByText('많은 차례예요. 건수는 불러온 기간에서 완료와 메모 없는 사람을 뺀 수예요.')).toBeTruthy()
  })

  it('AC-018.10: 단추를 고르고 다시 누르면 고름이 풀린다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const chip = screen.getByRole('button', { name: /LA358/ })
    await user.click(chip)
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ chip: 'LA358' })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    await user.click(chip)
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ chip: '' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
  })

  it('AC-018.10: 칸과 단추가 둘 다 있으면 안내를 보인다', () => {
    render(<Harness typedOverChip />)
    expect(screen.getByText('칸에 적은 코드를 먼저 써요. 단추를 쓰려면 칸을 비워 주세요.')).toBeTruthy()
  })
})

describe('AC-018.9·AC-018.10 안내', () => {
  it.each(['날짜를 골라 주세요', '불러온 기간 안에서 골라 주세요', '기간의 시작일이 종료일보다 늦습니다.', '코드 단추를 고르거나 처방코드를 넣어 주세요'])('AC-018.9: 안내 글을 고르는 즉시 보인다: %s', (problem) => {
    render(<Harness problem={problem} />)
    expect(screen.getByRole('status').textContent).toBe(problem)
  })

  it('AC-018.9: 잠겨 있으면 안내를 보이지 않는다', () => {
    render(<Harness problem="날짜를 골라 주세요" locked />)
    expect(screen.queryByText('날짜를 골라 주세요')).toBeNull()
  })

  it('AC-018.10: 날짜를 바꾸면 바로 알린다', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('시작'), { target: { value: '2026-10-08' } })
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ from: '2026-10-08' })
    fireEvent.change(screen.getByLabelText('처방코드 넣기'), { target: { value: 'la358' } })
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ typed: 'la358' })
  })
})
