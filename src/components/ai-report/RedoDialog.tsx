'use client'

import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { ds } from '@/components/ui/classes'
import { shortMonth } from '@/lib/ai/reportScreen'

// 다시 분석 확인 창(spec ai-report-screen AC-711.1·AC-711.2). 틀과 키 처리는 AdminApplications 확인 창과 같다.
// 다른 점: 열리면 초점이 [취소]가 아니라 [다시 분석]이고, 뒤 가림막을 눌러도 닫힌다. 단추는 시안대로 주 단추다(위험 모양 아님).
// 닫힌 뒤 초점을 머리 단추로 돌려주는 일은 화면(AiReportScreen)이 한다

export function RedoDialog({ month, onCancel, onConfirm }: { month: string; onCancel: () => void; onConfirm: () => void }) {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // 열릴 때 한 번만. 화면이 다시 그려 onCancel이 새 함수가 되어도 초점을 옮기지 않게 키 처리와 나눈다
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const onDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // 머리 단추에서 Enter를 누른 채면 창이 열리자마자 자동 반복이 초점 받은 [다시 분석]을 누른다.
    // 그러면 확인 없이 옛 리포트를 덮어쓰고 비용이 든다(AC-711.1). 새로 누른 Enter만 받는다
    if (e.key === 'Enter' && e.repeat) {
      e.preventDefault()
      return
    }
    // 창 안 빈 곳을 누르면 초점은 창 자신(tabIndex=-1)에 남는다 → 거기서도 Tab은 [취소]·[다시 분석] 사이만 돈다
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

  // 가림막 자신을 눌렀을 때만 닫는다(창 안에서 올라온 누름은 target이 다르다)
  const closeOnBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel()
  }

  return (
    <div onClick={closeOnBackdrop} className="fixed inset-0 z-30 flex items-center justify-center bg-ink/36 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className={`${ds.layer} w-full max-w-100 p-6 outline-hidden`}
      >
        <h2 id={titleId} className="text-lead font-semibold text-ink">
          {`${shortMonth(month)} 리포트를 다시 만들까요?`}
        </h2>
        <p id={bodyId} className="mt-2 text-body text-ink-2">
          지금 리포트를 덮어써요. 옛 리포트는 남지 않고, AI 비용이 한 번 더 들어요.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`${ds.button.secondary} max-md:flex-1`}>
            취소
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className={`${ds.button.primary} max-md:flex-1`}>
            다시 분석
          </button>
        </div>
      </div>
    </div>
  )
}
