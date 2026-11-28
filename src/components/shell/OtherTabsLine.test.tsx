// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OtherTabsLine } from './OtherTabsLine'

// '어느 창' 줄(claim-learn AC-9313.5, 시안 notes '어느 창'). 다른 탭은 같은 이름의 가짜 BroadcastChannel로 흉내 낸다

let channels: FakeBroadcastChannel[] = []
class FakeBroadcastChannel {
  onmessage: ((e: { data: unknown }) => void) | null = null
  closed = false
  posted: unknown[] = []
  constructor(public name: string) {
    channels.push(this)
  }
  postMessage(m: unknown) {
    this.posted.push(m)
    for (const other of channels) {
      if (other !== this && other.name === this.name && !other.closed) other.onmessage?.({ data: m })
    }
  }
  close() {
    this.closed = true
  }
}
function otherTab(label: string) {
  const tab = new FakeBroadcastChannel('ssk-open-tabs')
  tab.onmessage = ({ data }) => {
    const who = data as { type?: string; id?: string }
    if (who.type === 'who') tab.postMessage({ type: 'here', id: who.id, label })
  }
  return tab
}

beforeEach(() => {
  channels = []
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-9313.5 OtherTabsLine', () => {
  it('AC-9313.5: 0.3초 동안 답을 모아 "지금 열린 다른 창: ‘{화면 이름}’"을 그린다. 여럿이면 ` · `로 잇는다', () => {
    otherTab('수납일지')
    otherTab('통계')
    render(<OtherTabsLine />)
    expect(screen.queryByText(/지금 열린 다른 창/)).toBeNull()
    act(() => vi.advanceTimersByTime(300))
    expect(screen.getByText('지금 열린 다른 창: ‘수납일지’ · ‘통계’')).toBeTruthy()
  })

  it('AC-9313.5: 하나면 그 이름 하나다', () => {
    otherTab('청구')
    render(<OtherTabsLine />)
    act(() => vi.advanceTimersByTime(300))
    expect(screen.getByText('지금 열린 다른 창: ‘청구’')).toBeTruthy()
  })

  it('AC-9313.5: 답이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<OtherTabsLine />)
    act(() => vi.advanceTimersByTime(1_000))
    expect(container.innerHTML).toBe('')
  })

  it('AC-9313.5: 모으는 사이에 화면을 떠나면 채널을 닫고 그 뒤에 그리지 않는다', () => {
    otherTab('통계')
    const { unmount } = render(<OtherTabsLine />)
    const asker = channels.at(-1)!
    unmount()
    expect(asker.closed).toBe(true)
    act(() => vi.advanceTimersByTime(1_000))
  })
})
