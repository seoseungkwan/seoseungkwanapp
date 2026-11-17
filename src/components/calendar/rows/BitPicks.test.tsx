// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BitPicks, type BitPick, type BitPicksProps } from './BitPicks'

// 더하기 판의 비트 찾기 결과(spec clinic-calendar AC-5905.6, 시안 ?s=new·기본값 14번). 울타리 안 부품:
// Worker found 결과(성별·나이·마지막 내원)를 그리기만 하고, 고르면 이름·차트번호 두 칸만 위로 넘긴다. 이름은 ○○로 가린 가짜

afterEach(cleanup)

const TODAY = '2026-11-17'
const ROWS: BitPick[] = [
  { chart: '10231', name: '김○○', sex: '여', age: 56, last: '2026-11-12' },
  { chart: '20785', name: '김○○', sex: '남', age: 34, last: '2026-10-02' },
  { chart: '31406', name: '김○○', sex: '여', age: 71, last: '2025-08-19' },
]

function renderPicks(over: Partial<BitPicksProps> = {}) {
  const props: BitPicksProps = { rows: ROWS, more: false, filled: null, today: TODAY, onPick: vi.fn(), ...over }
  const view = render(<BitPicks {...props} />)
  return { ...view, props }
}

describe('AC-5905.6: 같은 이름 고르기 목록(성별·나이·마지막 내원)', () => {
  it('AC-5905.6: 여럿이면 "비트에 같은 이름이 N명 있어요 · 골라 주세요" 목록에 사람마다 차트번호·이름·`성별 · 나이세 · 마지막 내원 날`이다', () => {
    renderPicks()
    const list = screen.getByRole('listbox', { name: '같은 이름 고르기' })
    expect(within(list).getByText('비트에 같은 이름이 3명 있어요 · 골라 주세요')).toBeTruthy()
    const options = within(list).getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(within(options[0]).getByText('10231')).toBeTruthy()
    expect(within(options[0]).getByText('김○○')).toBeTruthy()
    expect(within(options[0]).getByText('여 · 56세 · 마지막 내원 11/12')).toBeTruthy()
    expect(within(options[1]).getByText('남 · 34세 · 마지막 내원 10/02')).toBeTruthy()
    // 올해가 아니면 해까지
    expect(within(options[2]).getByText('여 · 71세 · 마지막 내원 2025/08/19')).toBeTruthy()
  })

  it('AC-5905.6: 고르면 이름·차트번호 두 칸만 onPick으로 넘긴다(성별·나이·마지막 내원은 넘기지 않는다)', () => {
    const { props } = renderPicks()
    fireEvent.click(screen.getAllByRole('option')[1])
    expect(props.onPick).toHaveBeenCalledTimes(1)
    const picked = vi.mocked(props.onPick).mock.calls[0][0]
    expect(picked).toEqual({ name: '김○○', chart: '20785' })
    expect(Object.keys(picked).sort()).toEqual(['chart', 'name'])
  })

  it('AC-5905.6: 성별을 모르면·나이를 모르면 그 조각을 빼고, 마지막 내원이 없으면 "–"다', () => {
    renderPicks({
      rows: [
        { chart: '10318', name: '이○○', sex: '', age: null, last: null },
        { chart: '20944', name: '이○○', sex: '남', age: null, last: '2026-11-13' },
      ],
    })
    expect(screen.getByText('마지막 내원 –')).toBeTruthy()
    expect(screen.getByText('남 · 마지막 내원 11/13')).toBeTruthy()
  })

  it('AC-5905.6: 20명을 넘으면(more) 목록 아래 "찾은 환자가 많아요" 안내가 있다', () => {
    renderPicks({ more: true })
    expect(screen.getByText('찾은 환자가 많아요. 이름을 더 적거나 차트번호로 찾아 주세요')).toBeTruthy()
    cleanup()
    renderPicks()
    expect(screen.queryByText(/찾은 환자가 많아요/)).toBeNull()
  })
})

describe('AC-5905.6: 한 명·없음·찾기 전', () => {
  it("AC-5905.6: 없으면 '비트에 없어요. 신환이면 차트번호는 비워 두세요.'다", () => {
    renderPicks({ rows: [] })
    expect(screen.getByText('비트에 없어요. 신환이면 차트번호는 비워 두세요.')).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('AC-5905.6: 한 명이라 화면이 채웠으면 무엇을 채웠는지 알린다(목록 없음)', () => {
    renderPicks({ rows: [ROWS[0]], filled: 'chart' })
    expect(screen.getByText('✓ 비트에서 찾아 차트번호를 채웠어요')).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
    cleanup()
    renderPicks({ rows: [ROWS[0]], filled: 'name' })
    expect(screen.getByText('✓ 비트에서 찾아 이름을 채웠어요')).toBeTruthy()
  })

  it('AC-5905.6: 찾기 전(rows null)이거나 한 명인데 아직 안 채웠으면 아무것도 그리지 않는다', () => {
    const { container } = renderPicks({ rows: null })
    expect(container.textContent).toBe('')
    cleanup()
    const second = renderPicks({ rows: [ROWS[0]] })
    expect(second.container.textContent).toBe('')
  })
})
