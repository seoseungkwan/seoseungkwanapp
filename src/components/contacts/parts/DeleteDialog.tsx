'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { particle } from '@/lib/contacts/korean'
import { keepTabInside, useReturnFocus } from './formBits'
import { look } from './look'
import type { SaveResult } from './types'

// 지우기 확인 창(spec contacts AC-6505.7, 시안 dlgHtml del-company·del-equip). 업체·장비만 한 번 더 묻는다(담당자·수리 기록은 묻지 않음).
// 을(를)·이(가)는 받침으로 하나만(lib/contacts particle, 한글이 아니면 받침 있음). 초점은 [그만두기]에서 시작하고 Tab은 창 안에서만 돌며, 닫히면 누른 단추로 돌아간다.
// [지우기] → onConfirm(): 되면 onDone, 실패하면 창 안에 E-CONTACTS-SAVE-FAILED 카드(창은 그대로, 다시 누를 수 있음)

export type DeleteTarget =
  | { kind: 'company'; name: string; people: number; equipment: number; repairs: number }
  | { kind: 'equipment'; name: string; repairs: number }

/** 지운 뒤 알림: {이름}을(를) 지웠어요. */
export const deleteNotice = (name: string) => `${name}${particle(name, '을/를')} 지웠어요.`

const NO_UNDO = '지우면 되돌릴 수 없어요.'

/** 업체 창 셋째 줄: 있는 것만 ' · '로 잇고 마지막 말 받침으로 이/가 */
function companyCounts(target: Extract<DeleteTarget, { kind: 'company' }>) {
  const parts = [
    target.people > 0 ? `담당자 ${target.people}명` : null,
    target.equipment > 0 ? `장비 ${target.equipment}대` : null,
    target.repairs > 0 ? `수리 기록 ${target.repairs}줄` : null,
  ].filter((part) => part !== null)
  if (parts.length === 0) return NO_UNDO
  const list = parts.join(' · ')
  return `이 업체에는 ${list}${particle(list, '이/가')} 있어요. ${NO_UNDO}`
}

type DeleteDialogProps = {
  target: DeleteTarget
  onCancel(): void
  onConfirm(): Promise<SaveResult>
  onDone(): void
}

export function DeleteDialog({ target, onCancel, onConfirm, onDone }: DeleteDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useReturnFocus()

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function confirm() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    let result: SaveResult
    try {
      result = await onConfirm()
    } catch {
      result = { ok: false, reason: 'failed' }
    }
    setBusy(false)
    if (result.ok) onDone()
    else setFailed(true)
  }

  const title = `${target.name}${particle(target.name, '을/를')} 지울까요?`
  const lines =
    target.kind === 'company'
      ? ['담당자·장비·수리 기록도 함께 지워져요.', companyCounts(target)]
      : [target.repairs > 0 ? `수리 기록 ${target.repairs}줄도 함께 지워져요.` : '이 장비를 주소록에서 지워요.', NO_UNDO]

  return (
    <>
      <div data-scrim aria-hidden="true" onClick={onCancel} className="fixed inset-0 z-40 bg-ink/36" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keepTabInside}
        className={`fixed top-1/2 left-1/2 z-50 grid w-100 max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 gap-3 p-6 ${look.layer}`}
      >
        <h2 id={titleId} className="text-subtitle font-semibold wrap-anywhere text-ink">
          {title}
        </h2>
        <p className="text-ink-2">{lines[0]}</p>
        <p className="text-small text-muted">{lines[1]}</p>
        {failed && <ErrorCard code="E-CONTACTS-SAVE-FAILED" />}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={look.button}>
            그만두기
          </button>
          <button type="button" aria-busy={busy || undefined} onClick={() => void confirm()} className={look.danger}>
            지우기
          </button>
        </div>
      </div>
    </>
  )
}
