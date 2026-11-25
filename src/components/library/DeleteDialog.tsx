'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { deleteNote, KIND_LABEL, type LibraryFile } from '@/lib/library/files'
import { deleteLibraryFile } from '@/lib/storage/library'
import { keepTabInside, useEscape, useReturnFocus } from './dialogBits'
import { look } from './look'

// 지우기 확인 창(spec library REQ-8107 AC-8107.1~AC-8107.3, 시안 layerHtml delete: alertdialog 폭 400).
// 제목 '{이름} 파일을 지울까요?' · '모든 의원의 자료실에서 사라져요.' + (그 종류 최신 판이면 deleteNote로) 다음 판이 최신이 된다 / 받기 단추가 눌리지 않는다 · 되돌릴 수 없음.
// 초점은 [취소]에서 시작하고 Tab은 창 안에서만 돈다. [지우기] → deleteLibraryFile: 되면 onDone, 실패면 창 그대로 단추 줄 위 E-LIBRARY-DELETE-FAILED 카드.
// [취소]·바깥 누름·Esc는 지우지 않고 닫는다(지우는 동안은 기다린다)

type DeleteDialogProps = {
  file: LibraryFile
  /** 지금 자료실 파일(다음 판 찾기) */
  files: readonly LibraryFile[]
  onDone(): void
  onClose(): void
}

/** 본문 둘째 문장(앞에 띄어쓰기 하나). 최신 판이 아니거나 판 번호 없는 파일이면 빈 글자 */
function nextNote(files: readonly LibraryFile[], file: LibraryFile): string {
  const note = deleteNote(files, file)
  if (note === null) return ''
  const button = `[${KIND_LABEL[note.kind]} 내려받기]`
  return note.next
    ? ` 지우면 ${note.next.fileName}이 최신이 되고, 비트 PC 연결 화면의 ${button}도 그 판을 줘요.`
    : ` 지우면 비트 PC 연결 화면의 ${button}가 눌리지 않아요.`
}

export function DeleteDialog({ file, files, onDone, onClose }: DeleteDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useReturnFocus()
  useEscape(onClose, busy)
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  async function confirm() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setFailed(false)
    try {
      await deleteLibraryFile(file)
      onDone()
    } catch {
      setFailed(true)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const close = () => {
    if (!sending.current) onClose()
  }

  return (
    <>
      <div data-scrim aria-hidden="true" onClick={close} className="fixed inset-0 z-40 bg-ink/36" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keepTabInside}
        className={`fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-32px)] w-100 max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto p-6 ${look.layer}`}
      >
        <h2 id={titleId} className="text-subtitle font-semibold wrap-anywhere text-ink">
          {`${file.name} 파일을 지울까요?`}
        </h2>
        <p className="text-ink-2">{`모든 의원의 자료실에서 사라져요.${nextNote(files, file)}`}</p>
        <p className="text-small text-muted">지우면 되돌릴 수 없어요.</p>
        {failed && <ErrorCard code="E-LIBRARY-DELETE-FAILED" />}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={close} className={look.button}>
            취소
          </button>
          <button type="button" aria-busy={busy || undefined} onClick={() => void confirm()} className={look.danger}>
            지우기
          </button>
        </div>
      </div>
    </>
  )
}
