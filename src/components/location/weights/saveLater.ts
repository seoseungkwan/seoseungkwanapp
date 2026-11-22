// 고친 뒤 멈추면 한 번 저장하기 — 점수 무게 판(ScoreWeights)과 과목 고르기 판(kinds/DeptPicker)이 같이 쓴다(design.md 18절 '점수 무게 판처럼').
// 마지막으로 고친 뒤 SAVE_DELAY_MS가 지나면 마지막 값을 onSave로 한 번. 판이 사라지면 기다리던 것을 바로 저장한다.
// 저장은 콜백뿐 — 무엇을 어디에 저장할지는 부르는 쪽이 정한다
import { useEffect, useMemo, useRef } from 'react'

/** 마지막으로 고친 뒤 저장까지 기다리는 시간(막대를 끄는 동안 저장이 몰리지 않게) */
export const SAVE_DELAY_MS = 800

type Saver<T> = { timer: ReturnType<typeof setTimeout> | null; pending: T | null; onSave: (value: T) => void }

function flush<T>(s: Saver<T>) {
  if (s.timer !== null) clearTimeout(s.timer)
  s.timer = null
  const value = s.pending
  s.pending = null
  if (value !== null) s.onSave(value)
}

export type SaveLater<T> = {
  /** 이 값을 SAVE_DELAY_MS 뒤 저장한다(기다리던 것은 버림). null이면 기다리던 저장만 버린다(틀린 칸이 생겼을 때) */
  later: (value: T | null) => void
  /** 기다리던 것을 바로 저장한다(판을 닫을 때) */
  now: () => void
}

export function useSaveLater<T>(onSave: (value: T) => void): SaveLater<T> {
  const saver = useRef<Saver<T>>({ timer: null, pending: null, onSave })
  useEffect(() => {
    saver.current.onSave = onSave
  })
  useEffect(() => {
    const s = saver.current
    return () => flush(s)
  }, [])
  return useMemo<SaveLater<T>>(
    () => ({
      later(value) {
        const s = saver.current
        if (s.timer !== null) clearTimeout(s.timer)
        s.timer = null
        s.pending = value
        if (value !== null) s.timer = setTimeout(() => flush(s), SAVE_DELAY_MS)
      },
      now() {
        flush(saver.current)
      },
    }),
    [],
  )
}
