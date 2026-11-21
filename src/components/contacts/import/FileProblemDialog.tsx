'use client'

import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { ReadProblem } from '@/lib/contacts/workbook'
import type { ErrorCode } from '@/types/errors'
import { look } from '../parts/look'
import { FileIcon } from './icons'
import { TemplateLink } from './TemplateLink'
import { UploadButton, type UploadRead } from './UploadButton'

// 올린 파일을 못 쓸 때 확인 창(requirements.md '화면 글자' 오류 6~9·파일 큼, 시안 ?s=upload-bad-file, AC-6506.2).
// 시안대로 제목 = what, 파일 이름, 본문 = fix('form'만 한 줄 더). 오류 번호 줄은 그리지 않는다(design.md '오류 번호').
// 틀·키 처리는 RedoDialog와 같다: Esc·뒤 가림막·[닫기] = onClose, Tab은 창 안에서만 돈다, 열리면 [닫기]에 초점

const CODE: Record<ReadProblem, ErrorCode> = {
  form: 'E-CONTACTS-FILE-FORM',
  'not-xlsx': 'E-CONTACTS-FILE-NOT-XLSX',
  locked: 'E-CONTACTS-FILE-LOCKED',
  empty: 'E-CONTACTS-FILE-EMPTY',
  big: 'E-CONTACTS-FILE-BIG',
}
export const FORM_KEEP_NAMES = '시트 이름(연락처·장비)과 첫 줄 칸 이름은 바꾸지 말아 주세요.'

export function FileProblemDialog({
  problem,
  fileName,
  onClose,
  onDownloaded,
  onRead,
}: {
  problem: ReadProblem
  fileName: string
  onClose: () => void
  onDownloaded: () => void
  onRead: (read: UploadRead) => void
}) {
  const info = errorInfo(CODE[problem])
  const titleId = useId()
  const bodyId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // 열릴 때 한 번만(화면이 다시 그려 onClose가 새 함수가 되어도 초점을 옮기지 않게)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const onDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const controls = [...(boxRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])]
    const first = controls[0]
    const last = controls.at(-1)
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
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div onClick={closeOnBackdrop} className="fixed inset-0 z-30 flex items-center justify-center bg-ink/36 p-4">
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className={`${ds.layer} grid w-full max-w-100 gap-3 p-6 outline-hidden`}
      >
        <h2 id={titleId} className="text-lead font-semibold text-ink">
          {info.what}
        </h2>
        <p className="flex items-center gap-1.5 text-small text-ink-2 tabular-nums">
          <FileIcon className="shrink-0 text-muted" />
          <span className="min-w-0 break-all">{fileName}</span>
        </p>
        <p id={bodyId} className="text-body text-ink-2">
          {info.fix}
        </p>
        {problem === 'form' && <p className="text-small text-muted">{FORM_KEEP_NAMES}</p>}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button ref={closeRef} type="button" onClick={onClose} className={look.button}>
            닫기
          </button>
          <TemplateLink onDownloaded={onDownloaded} />
          <UploadButton onRead={onRead} label="다른 파일 고르기" primary />
        </div>
      </div>
    </div>
  )
}
