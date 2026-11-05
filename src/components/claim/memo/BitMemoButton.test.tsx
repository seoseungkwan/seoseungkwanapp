// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import type { PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import { claimChannel, type ClaimStream } from '../claimLoad'
import { BitMemoButton, useBitMemo } from './BitMemoButton'

// [비트 메모 전체 불러오기](AC-018.24). 가짜 통로·가짜 Worker. claim.memos만 고른 기간으로 다시 읽는다

afterEach(cleanup)

const VISIBLE = { from: '2026-10-05', to: '2026-10-12' }
const GOT = { has: true, count: 12, period: VISIBLE }

function fake() {
  const listeners = new Set<(event: Event) => void>()
  const posted: PrecheckFromScreen[] = []
  return {
    posted,
    postMessage: (m: unknown) => void posted.push(m as PrecheckFromScreen),
    addEventListener(type: string, fn: (event: Event) => void) {
      if (type === 'message') listeners.add(fn)
    },
    emit(data: PrecheckToScreen) {
      for (const fn of listeners) fn({ data } as unknown as Event)
    },
  }
}
function pendingStream() {
  const calls: { cmd: string; args: unknown; resolve(id: string): void; reject(code: string): void }[] = []
  const stream = vi.fn((cmd: string, args: unknown) => new Promise((resolve, reject) => calls.push({ cmd, args, resolve: (id) => resolve({ id, count: 1 }), reject: (code) => reject(new BridgeError(code)) })))
  return { stream: stream as unknown as ClaimStream, calls }
}

function Harness({ channel, stream, blocked = false, at, onChanged }: { channel: ReturnType<typeof claimChannel>; stream: ClaimStream; blocked?: boolean; at?: string; onChanged?: () => void }) {
  const bit = useBitMemo({ channel, stream, load: 1, visible: VISIBLE, loadedAt: at ?? '09:00', got: GOT, onChanged: onChanged ?? (() => {}), now: () => '14:05' })
  return <BitMemoButton state={bit.state} blocked={blocked} onRead={bit.read} />
}

function setup(over: { blocked?: boolean; at?: string; onChanged?: () => void } = {}) {
  const worker = fake()
  const channel = claimChannel(worker)
  const { stream, calls } = pendingStream()
  const view = render(<Harness channel={channel} stream={stream} {...over} />)
  return { worker, channel, stream, calls, ...view }
}
const button = (name: RegExp | string) => screen.getByRole('button', { name }) as HTMLButtonElement

describe('AC-018.24 글자 셋과 상태 줄', () => {
  it('AC-018.24: 처음 글과 옆 글', () => {
    setup()
    expect(button('비트 메모 전체 불러오기')).toBeTruthy()
    expect(screen.getByText('비트에서 읽기만 해요. 비트 로그인 창은 뜨지 않아요.')).toBeTruthy()
  })

  it('AC-018.24: 읽는 동안 글과 상태 줄이고 눌러도 claim.memos를 다시 부르지 않는다. claim.month는 부르지 않는다', async () => {
    const user = userEvent.setup()
    const { calls } = setup()
    await user.click(button('비트 메모 전체 불러오기'))
    expect(screen.getByText('비트에서 기간 전체 청구메모를 불러오는 중이에요…')).toBeTruthy()
    const reading = button('비트 메모 불러오는 중…')
    expect(reading.disabled).toBe(true)
    await user.click(reading)
    expect(calls.map((call) => [call.cmd, call.args])).toEqual([['claim.memos', VISIBLE]])
  })

  it('AC-018.24: 받은 뒤 글과 상태 줄', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const { calls, worker } = setup({ onChanged })
    await user.click(button('비트 메모 전체 불러오기'))
    await act(async () => calls[0].resolve('r1'))
    await act(async () => worker.emit({ type: 'loadPart', part: 'memos', id: 'r1', load: 1, run: 1, ok: true }))
    expect(button('비트 메모 전체 다시 불러오기')).toBeTruthy()
    expect(screen.getByText('10/05~10/12 · 12건 · 14:05에 불러옴. 목록에서 사람 줄을 누르면 우리 메모와 함께 보여요.')).toBeTruthy()
    expect(onChanged).toHaveBeenCalled()
  })

  it('AC-018.24: 첫 읽기가 실패하면 [자료 불러오기] 때 받은 시각을 말하고 글은 그대로다', async () => {
    const user = userEvent.setup()
    const { calls } = setup({ at: '09:00' })
    await user.click(button('비트 메모 전체 불러오기'))
    await act(async () => calls[0].reject('E-BIT-READ-FAILED'))
    expect(screen.getByText('불러오지 못했어요. 비트 자료를 읽지 못했어요 지금 보이는 비트 메모는 09:00에 불러온 내용이에요.')).toBeTruthy()
    expect(button('비트 메모 전체 불러오기').disabled).toBe(false)
  })

  it('AC-018.24: 읽은 적이 없으면 실패 글에 시각이 없다', async () => {
    const user = userEvent.setup()
    const worker = fake()
    const channel = claimChannel(worker)
    const { stream, calls } = pendingStream()
    function NoData() {
      const bit = useBitMemo({ channel, stream, load: 1, visible: VISIBLE, loadedAt: null, got: { has: false, count: 0, period: null }, onChanged: () => {}, now: () => '14:05' })
      return <BitMemoButton state={bit.state} blocked={false} onRead={bit.read} />
    }
    render(<NoData />)
    await user.click(button('비트 메모 전체 불러오기'))
    await act(async () => calls[0].reject('E-BIT-READ-FAILED'))
    expect(screen.getByText('불러오지 못했어요. 비트 자료를 읽지 못했어요')).toBeTruthy()
  })

  it('AC-018.24: 막혀 있으면(달을 불러오기 전·입력 중) 누를 수 없다', async () => {
    const { calls } = setup({ blocked: true })
    expect(button('비트 메모 전체 불러오기').disabled).toBe(true)
    await userEvent.setup().click(button('비트 메모 전체 불러오기'))
    expect(calls).toEqual([])
  })

  it('AC-018.24: 다시 그려 막음이 풀린 뒤 누르면 새 run이고, 옛 답은 치지 않는다', async () => {
    const user = userEvent.setup()
    const { calls, channel, stream, worker, unmount } = setup()
    await user.click(button('비트 메모 전체 불러오기'))
    unmount()
    render(<Harness channel={channel} stream={stream} />)
    await user.click(button('비트 메모 전체 불러오기'))
    expect(worker.posted.filter((m) => m.type === 'memoReloadStart')).toEqual([{ type: 'memoReloadStart', run: 1 }, { type: 'memoReloadStart', run: 2 }])
    expect(calls).toHaveLength(2)
    await act(async () => calls[0].resolve('old'))
    await act(async () => worker.emit({ type: 'loadPart', part: 'memos', id: 'old', load: 1, run: 1, ok: true }))
    expect(button('비트 메모 불러오는 중…')).toBeTruthy()
  })
})
