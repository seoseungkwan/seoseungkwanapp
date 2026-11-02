'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// [복사]·[표 복사] (stats REQ-513 AC-513.6, design.md '복사 단추는 통계 폴더에'). 대시보드 ReportBlock의 복사 동작을 옮겼다:
// 성공 2초 "복사했어요"(aria-live), 실패는 직접 복사 안내, 폭 흔들림 없음(최소 112px). 문구는 이 파일 안에 둔다(오류 번호가 없는 안내라 lib/errors.ts 틀에 맞지 않는다)

type Label = '복사' | '표 복사'

const COPIED = '복사했어요'
const COPIED_MS = 2000
const FAILED: Record<Label, string> = {
  복사: '복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요.',
  '표 복사': '복사하지 못했어요. 표를 길게 눌러 직접 복사해 주세요.',
}

// text null = 복사할 글이 없음(막힌 단추). fullOnPhone: 768px 미만에서 전체 폭(보고 문장, 시안 .rp-bar .cpy)
export function CopyButton({ text, label, fullOnPhone = false }: { text: string | null; label: Label; fullOnPhone?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'done' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  // 성공 뒤 2초 되돌림 타이머. 새 결과(성공·실패)가 오면 먼저 지운다 — 남은 타이머가 실패 안내를 지우지 않게
  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }

  async function copy(value: string) {
    try {
      if (!navigator.clipboard) throw new Error('clipboard')
      await navigator.clipboard.writeText(value)
    } catch {
      if (!alive.current) return
      clearTimer()
      setStatus('failed')
      return
    }
    if (!alive.current) return
    clearTimer()
    setStatus('done')
    timer.current = setTimeout(() => {
      timer.current = null
      setStatus('idle')
    }, COPIED_MS)
  }

  return (
    <span className={`inline-flex flex-col items-end ${fullOnPhone ? 'max-md:w-full' : ''}`}>
      <button
        type="button"
        aria-disabled={text === null || undefined}
        onClick={text === null ? undefined : () => void copy(text)}
        className={`${ds.button.secondarySmall} min-w-28 ${fullOnPhone ? 'max-md:w-full' : ''}`}
      >
        {status === 'done' ? (
          <>
            <Icon name="check" size={14} className="text-positive" />
            <span>{COPIED}</span>
          </>
        ) : (
          <>
            <Icon name="copy" size={14} className="text-ink-2" />
            <span>{label}</span>
          </>
        )}
      </button>
      {/* 성공은 화면 읽기에만(단추 글자가 보인다), 실패·클립보드 없음은 보이는 안내 */}
      <span aria-live="polite" className="sr-only">
        {status === 'done' ? COPIED : ''}
      </span>
      <span aria-live="polite" className="max-w-64 text-right text-caption text-ink-2">
        {status === 'failed' && <span className="mt-1 block">{FAILED[label]}</span>}
      </span>
    </span>
  )
}
