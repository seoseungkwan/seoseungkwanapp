'use client'

import { useEffect, useRef } from 'react'

// 두 칸 보기의 키(AC-3102.3·AC-3102.4·AC-3103.1): ↑↓는 사람 옮기기, C는 복사(완료). 문서에 하나만 건다.
// 글 칸·글자 칸(동그라미 제외)·고르는 칸, Ctrl·Alt·⌘, 한글 조합 중, 꺼져 있을 때(알림 창·입력 중·결과 화면)는 그 칸의 보통 동작 그대로 둔다

/** 키를 그 칸에 맡기는 곳: 동그라미에 초점이 있어도 ↑↓는 사람을 옮긴다(방식이 바뀌지 않게) */
const OWN_KEYS = 'textarea, select, input:not([type="radio"]), [contenteditable=""], [contenteditable="true"]'

export function useSplitKeys({ enabled, onMove, onCopy }: { enabled: boolean; onMove(step: 1 | -1): void; onCopy(): void }) {
  const moveRef = useRef(onMove)
  const copyRef = useRef(onCopy)
  useEffect(() => {
    moveRef.current = onMove
    copyRef.current = onCopy
  })

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return
      const target = event.target
      if (target instanceof Element && target.closest(OWN_KEYS)) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveRef.current(event.key === 'ArrowDown' ? 1 : -1)
      } else if (event.code === 'KeyC') {
        event.preventDefault()
        if (!event.repeat) copyRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}
