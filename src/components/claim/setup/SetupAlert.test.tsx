// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { BusyCard, CLAIM_WHY, ClaimReasonBand, claimSetupHref, readSetupFrom, SetupAlert, STORE_SETUP_HREF } from './SetupAlert'

// 비트 PC 연결 안내 부품의 claim-learn 다듬기(REQ-9313, design.md 11절): '청구에서 옴' 띠·주소의 from·why · 다른 창 카드의 '어느 창' 줄.
// 다른 창은 가짜 BroadcastChannel로 흉내 낸다(같은 이름의 다른 채널에 { data }로 간다). 실제 탭·확장·도우미는 없다

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
/** 다른 열린 창: who가 오면 그 이름으로 답한다 */
function otherTab(label: string) {
  const tab = new FakeBroadcastChannel('ssk-open-tabs')
  tab.onmessage = ({ data }) => {
    const who = data as { type?: string; id?: string }
    if (who.type === 'who') tab.postMessage({ type: 'here', id: who.id, label })
  }
  return tab
}
const LINE = /^지금 열린 다른 창:/

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

describe('AC-9313.1 청구에서 옴', () => {
  it('AC-9313.1: 까닭 넷의 글은 시안 notes 그대로다', () => {
    expect(CLAIM_WHY).toEqual({
      'no-helper': '도우미가 없어요',
      'update-helper': '도우미를 업데이트해야 해요',
      'update-extension': '확장을 업데이트해야 해요',
      disconnected: '도우미 연결이 끊겼어요',
    })
  })

  it.each(Object.keys(CLAIM_WHY) as (keyof typeof CLAIM_WHY)[])('AC-9313.1: %s 띠는 "청구 점검을 하려면 … ({까닭})" 한 줄이고 노란 띠다', (why) => {
    render(<ClaimReasonBand why={why} />)
    const band = screen.getByText(`청구 점검을 하려면 이 PC 연결을 먼저 마쳐야 해요. (${CLAIM_WHY[why]})`)
    expect(band.getAttribute('class')).toContain('bg-warning-soft')
    expect(claimSetupHref(why)).toBe(`/claim/setup?from=claim&why=${why}`)
  })

  it('AC-9313.1·AC-9313.4: 주소의 from·why는 정해진 값만 받는다(다른 값은 없음과 같다)', () => {
    for (const why of Object.keys(CLAIM_WHY)) expect(readSetupFrom(`?from=claim&why=${why}`)).toEqual({ from: 'claim', why })
    expect(readSetupFrom('?why=no-helper&from=claim')).toEqual({ from: 'claim', why: 'no-helper' })
    expect(readSetupFrom('?from=store')).toEqual({ from: 'store' })
    expect(readSetupFrom('?from=store&why=no-helper')).toEqual({ from: 'store' })
    for (const bad of ['', '?from=claim', '?from=claim&why=', '?from=claim&why=%3Cb%3E', '?from=claim&why=toString', '?from=claim&why=No-Helper', '?from=elsewhere&why=no-helper', '?next=dashboard']) {
      expect(readSetupFrom(bad), bad).toBeNull()
    }
    expect(STORE_SETUP_HREF).toBe('/claim/setup?from=store')
  })
})

describe('AC-9313.5 다른 창 카드의 어느 창', () => {
  const busyCard = () => render(<BusyCard onRetry={() => {}} outside={null} />)

  it('AC-9313.5: 다른 열린 창이 0.3초 안에 답한 메뉴 이름이 제목 바로 아래 "지금 열린 다른 창: ‘…’"으로 붙는다(여럿이면 · 로, 같은 이름은 한 번)', () => {
    otherTab('수납일지')
    otherTab('통계')
    otherTab('수납일지')
    busyCard()
    expect(screen.queryByText(LINE)).toBeNull() // 모으는 동안은 그리지 않는다
    act(() => vi.advanceTimersByTime(300))
    const title = screen.getByRole('heading', { level: 2, name: errorInfo('E-BRIDGE-BUSY').what })
    expect(title.nextElementSibling?.textContent).toBe('지금 열린 다른 창: ‘수납일지’ · ‘통계’')
    // 지금 글은 그대로 그 아래다
    expect(screen.getByText(errorInfo('E-BRIDGE-BUSY').fix)).toBeTruthy()
    expect(screen.getByText('오류 번호 E-BRIDGE-BUSY')).toBeTruthy()
  })

  it('AC-9313.5: 답이 없으면 지금 글 그대로다(어느 창 줄이 없다)', () => {
    busyCard()
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.queryByText(LINE)).toBeNull()
    const title = screen.getByRole('heading', { level: 2 })
    expect(title.nextElementSibling?.textContent).toBe(errorInfo('E-BRIDGE-BUSY').fix)
  })

  it('AC-9313.5: 연결 화면 위 오류 상자(SetupAlert)도 E-BRIDGE-BUSY면 "무엇이" 바로 아래에 붙는다. 다른 번호는 묻지도 않는다', () => {
    otherTab('청구')
    render(<SetupAlert code="E-BRIDGE-BUSY" />)
    act(() => vi.advanceTimersByTime(300))
    const what = screen.getByText(errorInfo('E-BRIDGE-BUSY').what)
    expect(what.nextElementSibling?.textContent).toBe('지금 열린 다른 창: ‘청구’')
    cleanup()
    const before = channels.flatMap((c) => c.posted).length
    render(<SetupAlert code="E-BIT-DB-FAILED" />)
    act(() => vi.advanceTimersByTime(300))
    expect(screen.queryByText(LINE)).toBeNull()
    expect(channels.flatMap((c) => c.posted).length).toBe(before)
  })
})
