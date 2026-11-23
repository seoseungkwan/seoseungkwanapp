'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ds } from '@/components/ui/classes'
import { COMPARE_TEXT as T } from './text'

// 후보 지우기 확인 창(spec location AC-7914.3, design.md 14절, TASK-93). 틀과 키 처리는 직원 탭 확인 창(staff/roster/ConfirmDialog)과 같다.
// 단추 차례는 사용자가 고른 모양 그대로 [그만두기]·[지우기]. 지우는 일이라 열리면 초점은 [그만두기]. Esc = 그만두기, Tab은 두 단추 사이만.
// [지우기] → onConfirm()이 끝날 때까지 바쁨(다시 눌러도 한 번), 끝나면 onDone. 실패 알림은 부르는 쪽(useLocation saveError)이 낸다
// 단추 모양은 이 폴더 안에서 정한다(ds.button은 폰 크기 앞말이 있어 쓰지 않음 — PC 모양 하나)
const BTN = `inline-flex h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-control border border-line-strong bg-surface px-4 text-body font-medium transition hover:bg-canvas aria-busy:cursor-progress aria-busy:opacity-60 ${ds.focusRing}`
const CANCEL = `${BTN} text-ink`
const DANGER = `${BTN} text-negative`

export function DeleteCandidateDialog({ name, onConfirm, onCancel, onDone }: { name: string; onConfirm(): Promise<void>; onCancel(): void; onDone(): void }) {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const [first, last] = [cancelRef.current, confirmRef.current]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === e.currentTarget)) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && (active === last || active === e.currentTarget)) {
      e.preventDefault()
      first?.focus()
    }
  }

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      onDone()
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/36 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`${ds.layer} flex w-full max-w-100 flex-col gap-4 p-6 outline-hidden`}
      >
        <h2 id={titleId} className="break-all text-lead font-semibold text-ink">
          {T.deleteTitle(name)}
        </h2>
        <p id={bodyId} className="text-body text-ink-2">
          {T.deleteBody}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={CANCEL}>
            {T.deleteCancel}
          </button>
          <button ref={confirmRef} type="button" aria-busy={busy || undefined} onClick={() => void confirm()} className={DANGER}>
            {T.delete}
          </button>
        </div>
      </div>
    </div>
  )
}
