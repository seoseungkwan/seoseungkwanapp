'use client'

import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { ds } from '@/components/ui/classes'

// 한 번 묻는 확인 창(staff AC-7612.2 파일 지우기 · AC-7612.5 퇴사자 지우기). 틀과 키 처리는 관리자 거절 확인 창(AdminApplications)과 같다.
// 단추 차례는 시안 그대로 [지우기]·[취소]. 지우는 일이라 열리면 초점은 [취소]에 둔다. Esc는 [취소], Tab은 두 단추 사이만 돈다

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  busy: boolean
  onConfirm(): void
  onCancel(): void
}) {
  const titleId = useId()
  const bodyId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

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
    const [first, last] = [confirmRef.current, cancelRef.current]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === e.currentTarget)) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && (active === last || active === e.currentTarget)) {
      e.preventDefault()
      first?.focus()
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
        <h2 id={titleId} className="text-lead font-semibold text-ink">
          {title}
        </h2>
        <p id={bodyId} className="break-all text-body text-ink-2">
          {body}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={confirmRef} type="button" aria-busy={busy || undefined} onClick={() => !busy && onConfirm()} className={ds.button.danger}>
            {confirmLabel}
          </button>
          <button ref={cancelRef} type="button" onClick={onCancel} className={ds.button.secondary}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
