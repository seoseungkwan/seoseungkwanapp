'use client'

import { useCallback, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { DateRange } from '@/types/dates'
import { checkedAtText } from '../setup/checkedAt'
import { runMemoReload, type BitReadState, type ClaimChannel, type ClaimStream } from '../claimLoad'
import { bitErrorText, bitSpan, type BitCardState } from '../rows/BitMemoCard'

// [비트 메모 전체 불러오기](AC-018.24·AC-018.27, design.md 19-12). claim.memos만 고른 기간으로 다시 읽는다. 읽기만 하고 비트 로그인 창도 PC 확인 창도 뜨지 않는다.
// [자료 불러오기]의 claim.memos는 '한 번 받음'에 들지 않는다(AC-018.24). 읽는 동안도 번호 검사는 그대로다: 화면을 다시 그리면 막음이 풀려 겹칠 수 있다(AC-016.7)

export type BitMemoState = BitCardState & { received: boolean }

type Options = {
  channel: ClaimChannel
  stream: ClaimStream
  load: number
  visible: DateRange
  /** [자료 불러오기] 때 받은 시각(HH:MM). 받은 적이 없으면 null */
  loadedAt: string | null
  got: { has: boolean; count: number; period: DateRange | null }
  onChanged(): void
  now?: () => string
  /** 다녀올 동안 맡긴 상태(AC-013.6) */
  initial?: BitReadState | null
  onState?: (state: BitReadState) => void
}

const clock = () => checkedAtText(new Date()).slice(-5)
const NEVER: BitReadState = { status: 'never', at: null, code: null, received: false, asked: false }

export function useBitMemo({ channel, stream, load, visible, loadedAt, got, onChanged, now = clock, initial, onState }: Options) {
  const [read, setRead] = useState<BitReadState>(initial ?? NEVER)
  const [reading, setReading] = useState(false)
  const busy = useRef(false)
  const asked = useRef(initial?.asked ?? false)

  const start = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    asked.current = true
    setReading(true)
    const answer = await runMemoReload(channel, stream, load, visible)
    if (answer.status === 'replaced') return // 새 번호나 새 [자료 불러오기]가 맡았다
    busy.current = false
    setReading(false)
    setRead((previous) => {
      const next: BitReadState = answer.status === 'ok' ? { status: 'ok', at: now(), code: null, received: true, asked: true } : { ...previous, status: 'failed', code: answer.code, asked: true }
      onState?.(next)
      return next
    })
    onChanged()
  }, [channel, stream, load, visible, now, onChanged, onState])

  /** 줄을 처음 열 때 한 번만 저절로 읽는다(AC-018.27). 실패해도 다시 읽지 않는다 */
  const readOnce = useCallback(() => {
    if (!asked.current) void start()
  }, [start])

  const state: BitMemoState = {
    status: reading ? 'reading' : read.status,
    at: read.at ?? loadedAt,
    count: got.count,
    period: got.period,
    has: got.has,
    code: read.code,
    received: read.received,
  }
  return { state, read: () => void start(), readOnce }
}

export function BitMemoButton({ state, blocked, onRead }: { state: BitMemoState; blocked: boolean; onRead(): void }) {
  const reading = state.status === 'reading'
  const label = reading ? '비트 메모 불러오는 중…' : state.received ? '비트 메모 전체 다시 불러오기' : '비트 메모 전체 불러오기'
  const line = reading
    ? '비트에서 기간 전체 청구메모를 불러오는 중이에요…'
    : state.status === 'failed'
      ? `불러오지 못했어요. ${bitErrorText(state.code)}${state.has && state.at ? ` 지금 보이는 비트 메모는 ${state.at}에 불러온 내용이에요.` : ''}`
      : state.status === 'ok'
        ? `${bitSpan(state)} · ${state.at}에 불러옴. 목록에서 사람 줄을 누르면 우리 메모와 함께 보여요.`
        : ''
  return (
    <div className="flex flex-col gap-1.5 border-b border-line pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.secondarySmall} disabled={blocked || reading} onClick={onRead}>
          {label}
        </button>
        <span className={ds.help}>비트에서 읽기만 해요. 비트 로그인 창은 뜨지 않아요.</span>
      </div>
      {line && (
        <p role="status" className={state.status === 'failed' ? 'text-caption font-medium text-negative' : ds.help}>
          {line}
        </p>
      )}
    </div>
  )
}
