import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANSWER_MS, answerOpenTabs, askOpenTabs, OPEN_TABS_CHANNEL } from './openTabs'

// 열린 창 이름 묻기(claim-learn AC-9313.5, design.md 11절). 같은 브라우저의 다른 탭은 같은 이름의 가짜 BroadcastChannel로 흉내 낸다.
// 진짜 BroadcastChannel처럼 보낸 채널 자신에게는 가지 않고, 같은 창(탭)의 다른 채널에는 간다

let channels: FakeBroadcastChannel[] = []
class FakeBroadcastChannel {
  onmessage: ((e: { data: unknown }) => void) | null = null
  closed = false
  posted: unknown[] = []
  constructor(public name: string) {
    channels.push(this)
  }
  postMessage(m: unknown) {
    if (this.closed) throw new Error('닫힌 채널')
    this.posted.push(m)
    for (const other of channels) {
      if (other !== this && other.name === this.name && !other.closed) other.onmessage?.({ data: m })
    }
  }
  close() {
    this.closed = true
  }
}
/** 다른 탭 하나: 받은 것을 적고, who가 오면 replies를 차례로 답한다 */
function otherTab(...replies: ((id: string) => unknown)[]) {
  const tab = new FakeBroadcastChannel(OPEN_TABS_CHANNEL)
  const got: unknown[] = []
  tab.onmessage = ({ data }) => {
    got.push(data)
    const who = data as { type?: string; id?: string }
    if (who.type === 'who' && typeof who.id === 'string') for (const reply of replies) tab.postMessage(reply(who.id))
  }
  return { tab, got }
}
const here = (label: unknown) => (id: string) => ({ type: 'here', id, label })

beforeEach(() => {
  channels = []
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-9313.5 askOpenTabs', () => {
  it("AC-9313.5: 'ssk-open-tabs'에 {type:'who', id}를 보내고 0.3초 동안 그 id의 here를 모아, 메뉴 이름을 받은 차례대로 한 번씩 돌려준다", () => {
    const one = otherTab(here('수납일지'))
    otherTab(here('통계'), here('수납일지'))
    const done = vi.fn()
    askOpenTabs(done)
    expect(ANSWER_MS).toBe(300)
    const who = one.got[0] as { type: string; id: string }
    expect(who).toEqual({ type: 'who', id: expect.any(String) })
    expect(who.id).not.toBe('')
    vi.advanceTimersByTime(299)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(done).toHaveBeenCalledExactlyOnceWith(['수납일지', '통계'])
  })

  it('AC-9313.5: 메뉴 목록에 없는 이름·글자가 아닌 이름·다른 id·모양이 다른 답은 버린다', () => {
    otherTab(here('관리자 몰래 화면'), here(42), here('<b>통계</b>'), () => ({ type: 'here', id: 'someone-else', label: '통계' }), () => 'here', () => null, here('자료실'))
    const done = vi.fn()
    askOpenTabs(done)
    vi.advanceTimersByTime(300)
    expect(done).toHaveBeenCalledExactlyOnceWith(['자료실'])
  })

  it('AC-9313.5: 0.3초가 지난 뒤 온 답은 버리고 채널을 닫는다', () => {
    const late = new FakeBroadcastChannel(OPEN_TABS_CHANNEL)
    const done = vi.fn()
    askOpenTabs(done)
    const asked = channels[1] // 묻는 쪽 채널(late 다음에 만들어졌다)
    const id = (asked.posted[0] as { id: string }).id
    vi.advanceTimersByTime(300)
    expect(done).toHaveBeenCalledExactlyOnceWith([])
    late.postMessage({ type: 'here', id, label: '통계' })
    expect(done).toHaveBeenCalledTimes(1)
    expect(asked.closed).toBe(true)
  })

  it('AC-9313.5: 돌려받은 멈추기를 0.3초 전에 부르면 답을 알리지 않고 채널을 닫는다', () => {
    otherTab(here('통계'))
    const done = vi.fn()
    const stop = askOpenTabs(done)
    stop()
    vi.advanceTimersByTime(1_000)
    expect(done).not.toHaveBeenCalled()
    expect(channels.at(-1)!.closed).toBe(true)
  })

  it('AC-9313.5: BroadcastChannel이 없는 곳에서는 묻지 않고 던지지도 않는다', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const done = vi.fn()
    expect(() => askOpenTabs(done)()).not.toThrow()
    vi.advanceTimersByTime(1_000)
    expect(done).not.toHaveBeenCalled()
  })
})

describe('AC-9313.5 answerOpenTabs', () => {
  it("AC-9313.5: 다른 창의 who에 지금 화면 메뉴 이름으로 {type:'here', id, label}을 답한다", () => {
    let label: string | null = '예약'
    answerOpenTabs(() => label)
    const asker = new FakeBroadcastChannel(OPEN_TABS_CHANNEL)
    asker.postMessage({ type: 'who', id: 'tab-a' })
    expect(channels[0].posted).toEqual([{ type: 'here', id: 'tab-a', label: '예약' }])
    label = '통계' // 답할 때의 화면이다
    asker.postMessage({ type: 'who', id: 'tab-b' })
    expect(channels[0].posted.at(-1)).toEqual({ type: 'here', id: 'tab-b', label: '통계' })
  })

  it('AC-9313.5: 메뉴 밖 화면(null·메뉴에 없는 이름)이거나 who 모양이 아니면 답하지 않는다', () => {
    let label: string | null = null
    answerOpenTabs(() => label)
    const asker = new FakeBroadcastChannel(OPEN_TABS_CHANNEL)
    asker.postMessage({ type: 'who', id: 'tab-a' })
    label = '가입 승인'
    asker.postMessage({ type: 'who', id: 'tab-b' })
    label = '통계'
    for (const bad of [{ type: 'who' }, { type: 'who', id: 7 }, { type: 'here', id: 'x', label: '통계' }, 'who', null]) asker.postMessage(bad)
    expect(channels[0].posted).toEqual([])
  })

  it('AC-9313.5: 같은 창이 물은 who에는 답하지 않는다(자기 창 이름이 다른 창으로 보이지 않게)', () => {
    answerOpenTabs(() => '청구')
    const done = vi.fn()
    askOpenTabs(done)
    vi.advanceTimersByTime(300)
    expect(done).toHaveBeenCalledExactlyOnceWith([])
  })

  it('AC-9313.5: 돌려받은 끄기는 채널을 닫는다. BroadcastChannel이 없으면 아무것도 하지 않는다', () => {
    const off = answerOpenTabs(() => '청구')
    off()
    expect(channels[0].closed).toBe(true)
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(() => answerOpenTabs(() => '청구')()).not.toThrow()
  })
})
