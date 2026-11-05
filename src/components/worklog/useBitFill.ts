'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useBridge } from '@/components/claim/useBridge'
import { bitValuesFrom, type BitValues } from '@/lib/worklog/bitFill'
import type { BridgeState } from '@/types/bridge'

// 업무일지 비트 읽기 (specs/worklog REQ-017, design.md 20-1·20-5절). 새 읽기 코드를 만들지 않고 매출 명령 revenue.days 하나를 불러 쓴다:
// 숫자 명령이라 환자 줄이 없고, 답 모양은 통로(lib/bridge)가 검사한다. 화면에 넘기는 것은 채우는 칸의 숫자(BitValues)뿐이다.
// 열 때·날짜를 옮길 때·오늘이면 보이는 동안 10분마다·[지금 불러오기](reload) 때 읽는다. 터치 기기(보기만)는 읽지 않는다.
// 요청 번호로 늦게 온 옛 답(날짜를 옮김·끊김·앞 읽기)을 버린다. 맞추기·저장은 화면이 한다(읽기가 끝난 날에만, AC-017.8)

export type BitFillStatus = 'off' | 'reading' | 'ready' | 'unconfirmed' | 'failed' | 'not-connected' | 'setup-needed'
export type BitFill = {
  status: BitFillStatus
  ymd: string // 이 답의 날짜. 고른 날과 다르면 아직 그날 답이 없다
  values: BitValues
  lastReadAt: Date | null // 이 ymd의 마지막 성공 읽기가 끝난 때
  reload(): void // [지금 불러오기]. ready·unconfirmed·failed일 때만 읽고, 오늘이면 10분 타이머를 누른 때부터 다시 건다
}

type ReadPhase = 'reading' | 'ready' | 'unconfirmed' | 'failed' | 'setup-needed'
type Read = { ymd: string; phase: ReadPhase; values: BitValues; lastReadAt: Date | null }

const REREAD_MS = 10 * 60_000
// 확장·도우미가 revenue.days를 모른다: 읽기 실패가 아니라 새 버전 안내다(매출 설계 5절과 같음)
const SETUP_CODES: ReadonlySet<string> = new Set(['E-BRIDGE-REJECTED', 'E-HELPER-UNKNOWN-COMMAND'])
const RELOADABLE: readonly BitFillStatus[] = ['ready', 'unconfirmed', 'failed']

const codeOf = (error: unknown): string | null =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null

// useBridge 상태 → 읽기 전 상태(design.md 20-5절 표 아래 줄). ready만 읽기에 따른다(null)
function bridgeStatus(state: BridgeState, helloError: string | null): BitFillStatus | null {
  switch (state) {
    case 'ready':
      return null
    // 의원 PC를 열 때마다 거치므로 '연결 안 됨'을 잠깐 띄우지 않는다. hello가 오류로 멈추면 그 자리에 갇히지 않게 새 버전 안내
    case 'connecting':
      return helloError ? 'setup-needed' : 'reading'
    case 'busy':
    case 'disconnected':
      return 'not-connected'
    case 'no-extension':
    case 'no-helper':
    case 'update-helper':
    case 'update-extension':
      return 'setup-needed'
  }
}

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

export function useBitFill({ ymd, today, readOnly }: { ymd: string; today: string; readOnly: boolean }): BitFill {
  const { state, helloError, call } = useBridge()
  const live = state === 'ready' && !readOnly
  const [read, setRead] = useState<Read>({ ymd, phase: 'reading', values: {}, lastReadAt: null })
  const latest = useRef(read) // 타이머가 부를 때 지금 읽는 중인지 본다
  latest.current = read
  const request = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  // 그날을 바로 읽는다. 다시 읽는 동안 같은 날의 앞 값·시각은 그대로 둔다('다름' 목록·표시가 깜빡이지 않게).
  // 오늘이면 이 때부터 10분 뒤 다음 읽기를 건다(누른 때부터 다시 센다). 안 보이면 읽지 않고 다음 10분을 기다린다
  const readNow = useCallback(
    (target: string, isToday: boolean) => {
      const mine = ++request.current
      stopTimer()
      if (isToday) {
        const wait = () => {
          timer.current = setTimeout(() => {
            if (isVisible() && latest.current.phase !== 'reading') readNow(target, true)
            else wait()
          }, REREAD_MS)
        }
        wait()
      }
      setRead((prev) => (prev.ymd === target ? { ...prev, phase: 'reading' } : { ymd: target, phase: 'reading', values: {}, lastReadAt: null }))
      // async로 감싼다: 통로가 바로 던지거나 모양이 틀려도 읽기 실패로 다룬다
      void (async () => {
        let next: (prev: Read) => Read
        try {
          const result = await call('revenue.days', { from: target, to: target })
          const { values, unconfirmed } = bitValuesFrom(result.days.find((day) => day.date === target) ?? null)
          const done: Read = { ymd: target, phase: unconfirmed ? 'unconfirmed' : 'ready', values, lastReadAt: new Date() }
          next = () => done
        } catch (error) {
          // 실패해도 그날 앞서 읽은 값·시각은 그대로 둔다(상태만 바뀐다)
          const code = codeOf(error)
          const phase: ReadPhase = code !== null && SETUP_CODES.has(code) ? 'setup-needed' : 'failed'
          next = (prev) => (prev.ymd === target ? { ...prev, phase } : { ymd: target, phase, values: {}, lastReadAt: null })
        }
        if (mine === request.current) setRead(next)
      })()
    },
    [call, stopTimer],
  )

  // 연결·날짜·오늘이 바뀌면 처음부터. 떠나면 앞 읽기의 답을 버리고 타이머를 멈춘다
  useEffect(() => {
    if (!live) return
    readNow(ymd, ymd === today)
    return () => {
      request.current += 1
      stopTimer()
    }
  }, [live, readNow, stopTimer, today, ymd])

  let status: BitFillStatus
  if (readOnly) status = 'off'
  else status = bridgeStatus(state, helloError) ?? (read.ymd === ymd ? read.phase : 'reading')

  const reload = useCallback(() => {
    if (live && RELOADABLE.includes(status)) readNow(ymd, ymd === today)
  }, [live, readNow, status, today, ymd])

  return { status, ymd: read.ymd, values: read.values, lastReadAt: read.lastReadAt, reload }
}
