'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'

// 자료실 창 둘(올리기·지우기)이 같이 쓰는 조각(spec library design.md '화면' 창 공통): 닫으면 연 단추로 초점 돌리기 · Tab은 창 안에서만 · Esc로 닫기

/** 열릴 때 초점이 있던 단추를 기억했다가 닫히면(부품이 빠지면) 그 단추로 초점을 돌린다. 그 단추가 이미 없으면 그대로 */
export function useReturnFocus() {
  useEffect(() => {
    const opener = document.activeElement
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
}

/** Esc를 누르면 onEscape(). 막힘(blocked)이면 아무것도 하지 않는다(올리는 중·지우는 중) */
export function useEscape(onEscape: () => void, blocked: boolean) {
  const latest = useRef({ onEscape, blocked })
  useEffect(() => {
    latest.current = { onEscape, blocked }
  })
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || latest.current.blocked) return
      event.preventDefault()
      latest.current.onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 창 안에서만 Tab이 돈다(끝에서 Tab이면 처음으로, 처음에서 Shift+Tab이면 끝으로) */
export function keepTabInside(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden)
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || active === event.currentTarget)) {
    event.preventDefault()
    first.focus()
  }
}
