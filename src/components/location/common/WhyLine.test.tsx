// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Why } from '@/types/location'
import { RefreshBusy } from './RefreshBusy'
import { refreshingText } from './text'
import { WhyLine } from './WhyLine'

afterEach(cleanup)

describe('AC-7917.2: 자료 없음 글 WhyLine', () => {
  it.each<[Why, string, string]>([
    ['no-key', 'hosp-list', '병원정보서비스: 열쇠를 넣으면 보여요.'],
    ['no-key', 'kakao-local', '카카오 장소 찾기 열쇠: 열쇠를 넣으면 보여요.'],
    ['not-applied', 'nonpay', "공공데이터포털에서 '비급여진료비정보조회서비스' 활용신청을 하면 보여요."],
    ['failed', 'hosp-list', '지금 받지 못했어요.'],
    ['none', 'accident', '범위 안에 교통사고 다발 지점이 없어요.'],
    ['outside', 'flow-volume', '이 지역은 자료 없음'],
  ])('AC-7917.2: %s(%s) → design.md 15절 글', (why, src, text) => {
    render(<WhyLine why={why} src={src} />)
    expect(screen.getByText(text)).toBeTruthy()
  })

  it('AC-7917.2: capped → `{n}곳 넘게 있어요. 가까운 {n}곳만 셌어요.`', () => {
    render(<WhyLine why="capped" count={45} />)
    expect(screen.getByText('45곳 넘게 있어요. 가까운 45곳만 셌어요.')).toBeTruthy()
  })

  it('AC-7917.2: failed는 [다시 받기] 단추가 있고 누르면 다시 받기 콜백을 한 번 부른다', () => {
    const onRetry = vi.fn()
    render(<WhyLine why="failed" src="hosp-list" onRetry={onRetry} />)
    const button = screen.getByRole('button', { name: '다시 받기' })
    expect(button.getAttribute('type')).toBe('button')
    fireEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-7917.2: failed에 옛 값이 있으면 `지난 값 · 기준 {날짜}`가 함께 보인다', () => {
    render(<WhyLine why="failed" src="hosp-list" prevAsOf="2026-11-15" onRetry={() => {}} />)
    expect(screen.getByText('지금 받지 못했어요.')).toBeTruthy()
    expect(screen.getByText('지난 값 · 기준 2026년 11월 15일')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeTruthy()
  })

  it('AC-7917.2: 옛 값이 없으면 `지난 값` 글이 없다', () => {
    render(<WhyLine why="failed" src="hosp-list" onRetry={() => {}} />)
    expect(screen.queryByText(/지난 값/)).toBeNull()
  })

  it.each<Why>(['no-key', 'not-applied', 'none', 'outside'])('AC-7917.2: %s에는 [다시 받기]가 없다', (why) => {
    render(<WhyLine why={why} src="hosp-list" onRetry={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('AC-7917.2: 다시 받기 콜백을 주지 않으면 failed에도 단추가 없다(글만)', () => {
    render(<WhyLine why="failed" src="hosp-list" />)
    expect(screen.getByText('지금 받지 못했어요.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('AC-7917.2: SOURCES에 없는 출처 id면 아무것도 그리지 않는다', () => {
    const { container } = render(<WhyLine why="none" src="no-such-source" />)
    expect(container.innerHTML).toBe('')
  })
})

// 다시 받는 중(AC-7917.4, design.md 15절, TASK-95 — 사용자 '칸마다 다시 받는 중')
describe('AC-7917.4: 다시 받는 중이면 못 받은 칸에 그 글', () => {
  it('AC-7917.4: 글은 `다시 받는 중이에요 · 자료 {받은 수}/{모두}`', () => {
    expect(refreshingText(12, 40)).toBe('다시 받는 중이에요 · 자료 12/40')
  })

  it('AC-7917.4: 받는 중이면 failed + [다시 받기] 자리에 그 글만(단추 없음), 옛 값 줄은 그대로', () => {
    render(
      <RefreshBusy.Provider value={refreshingText(12, 40)}>
        <WhyLine why="failed" src="hosp-list" prevAsOf="2026-10-31" onRetry={vi.fn()} />
      </RefreshBusy.Provider>,
    )
    expect(screen.getByText('다시 받는 중이에요 · 자료 12/40')).toBeTruthy()
    expect(screen.queryByText('지금 받지 못했어요.')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 받기' })).toBeNull()
    expect(screen.getByText(/지난 값/)).toBeTruthy()
  })

  it('AC-7917.4: 카카오 값 칸·단추 없는 칸·다른 까닭은 받는 중이어도 그대로', () => {
    render(
      <RefreshBusy.Provider value={refreshingText(1, 2)}>
        <WhyLine why="failed" src="kakao-local" onRetry={vi.fn()} />
        <WhyLine why="failed" src="gym" />
        <WhyLine why="not-applied" src="nonpay" onRetry={vi.fn()} />
      </RefreshBusy.Provider>,
    )
    expect(screen.queryByText('다시 받는 중이에요 · 자료 1/2')).toBeNull()
    expect(screen.getAllByText('지금 받지 못했어요.')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '다시 받기' })).toHaveLength(1)
  })

  it('AC-7917.4: 받는 중이 아니면(null) 지금처럼 글과 [다시 받기]', () => {
    render(
      <RefreshBusy.Provider value={null}>
        <WhyLine why="failed" src="hosp-list" onRetry={vi.fn()} />
      </RefreshBusy.Provider>,
    )
    expect(screen.getByText('지금 받지 못했어요.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeTruthy()
  })
})
