import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { ds } from '@/components/ui/classes'

// 묶음 지우기 확인 창(시안 gen.py group_editor(confirm=True), UI_GUIDE '오류 카드·확인 창'). 움직임은 관리자 거절 확인 창과 같다: 처음 초점 [취소], Esc = 취소, Tab은 창 안에서만 돈다

type Props = { name: string; codeCount: number; onCancel(): void; onConfirm(): void }

export function DeleteGroupDialog({ name, codeCount, onCancel, onConfirm }: Props) {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // 닫히면 초점을 연 단추로 돌려준다(지운 줄이 끝 줄이면 그 단추가 없어지므로 GroupEditor가 [새 묶음]으로 보낸다)
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => {
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const [first, last] = [cancelRef.current, confirmRef.current]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && (active === last || active === event.currentTarget)) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/36 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} tabIndex={-1} onKeyDown={trapTab} className={`${ds.layer} w-full max-w-100 p-6 outline-hidden`}>
        <h3 id={titleId} className="text-lead font-semibold text-ink">
          {`'${name}' 묶음을 지울까요?`}
        </h3>
        <p id={bodyId} className="mt-2 text-body text-ink-2">
          {`이 묶음의 처방 ${codeCount}개는 '그 밖 처방'으로 가요. [저장]을 누르기 전에는 되돌릴 수 있어요.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`${ds.button.secondary} w-full`}>
            취소
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className={`${ds.button.danger} w-full`}>
            지우기
          </button>
        </div>
      </div>
    </div>
  )
}
