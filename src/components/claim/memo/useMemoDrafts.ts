'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

// 메모 고치기(AC-018.2). 칸에는 고친 글이 바로 보이고, 1초 동안 더 고치지 않으면 Worker에 보낸다. Worker가 store.save로 그 PC에 저장한다. 브라우저 저장소는 쓰지 않는다.
// 입력을 시작하기 전·다시 점검 전·화면을 내릴 때는 남은 글을 모두 보낸다. 화면을 내릴 때는 그리기 단계(레이아웃 효과)에서 보내 통로를 닫는 효과보다 먼저 Worker에 간다
// 새 점검 뒤에는 이미 보낸 글을 칸에서 놓는다(resetSettled). 고쳤다 되돌린 글은 Worker가 받지 않으므로, 쥐고 있으면 자동 메모가 달라져도 칸에 옛 글이 남아 들어가지 않을 글을 보인다

const DELAY = 1_000

export function useMemoDrafts(send: (visitKey: string, text: string) => void) {
  const [typed, setTyped] = useState<ReadonlyMap<string, string>>(new Map())
  const pending = useRef(new Map<string, { text: string; timer: ReturnType<typeof setTimeout> }>())
  const sendRef = useRef(send)
  sendRef.current = send

  const flush = useCallback((key: string) => {
    const waiting = pending.current.get(key)
    if (!waiting) return
    clearTimeout(waiting.timer)
    pending.current.delete(key)
    sendRef.current(key, waiting.text)
  }, [])

  const flushAll = useCallback(() => {
    for (const key of [...pending.current.keys()]) flush(key)
  }, [flush])

  const change = useCallback(
    (key: string, text: string) => {
      const waiting = pending.current.get(key)
      if (waiting) clearTimeout(waiting.timer)
      pending.current.set(key, { text, timer: setTimeout(() => flush(key), DELAY) })
      setTyped((now) => new Map(now).set(key, text))
    },
    [flush],
  )

  const valueOf = useCallback((key: string, base: string) => typed.get(key) ?? base, [typed])

  /** 아직 보내지 않은 글만 남기고 칸을 받은 글로 돌린다 */
  const resetSettled = useCallback(() => {
    setTyped((now) => {
      const kept = new Map([...now].filter(([key]) => pending.current.has(key)))
      return kept.size === now.size ? now : kept
    })
  }, [])

  useLayoutEffect(() => flushAll, [flushAll])

  return { change, flush, flushAll, valueOf, resetSettled }
}
