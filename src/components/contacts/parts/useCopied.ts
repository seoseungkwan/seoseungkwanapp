'use client'

import { useEffect, useRef, useState } from 'react'

// 복사와 '복사했어요' 1.6초(spec contacts AC-6505.3, 시안 기본값 7). 복사가 막히면(clipboard 없음·거부) 글을 바꾸지 않는다

export const COPIED_MS = 1600

export function useCopied() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  return { copied, copy }
}
