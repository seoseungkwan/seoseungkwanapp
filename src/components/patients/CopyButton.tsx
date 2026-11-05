'use client'

import { useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// 복사 단추와 결과 줄(AC-611.4, 목업 copyBtn·copyStatus). 결과 줄은 처음부터 있는 role="status" <p>라 화면 읽기가 바뀐 글을 읽어 준다(useCopy와 같은 방식).
// 오류 내용은 보이지 않고 결과만 남긴다. 목업은 단추 여럿이 줄 하나를 나눠 쓴다: 그럴 때는 onResult로 받아 놓는 자리가 CopyNoticeLine을 그린다
export type CopyNotice = { ok: boolean; text: string } | null

const COPY_DONE = '복사했어요'
const COPY_FAILED = '복사하지 못했어요. 다시 눌러 주세요. 계속되면 크롬에서 이 사이트의 클립보드 쓰기를 허용해 주세요.'

export function CopyNoticeLine({ notice }: { notice: CopyNotice }) {
  return (
    <p role="status" className="mt-2 min-h-5 text-small text-ink-2">
      {notice &&
        (notice.ok ? (
          <span className="inline-flex items-center gap-1 font-medium text-positive">
            <Icon name="check" size={14} />
            {notice.text}
          </span>
        ) : (
          notice.text
        ))}
    </p>
  )
}

export function CopyButton({
  text,
  label,
  disabled,
  doneText = COPY_DONE,
  unavailable,
  onResult,
}: {
  text: string | (() => string)
  label: string
  disabled?: boolean
  /** 됐을 때 보일 글 */
  doneText?: string
  /** 복사할 글이 없을 때 누르면 보일 글 */
  unavailable?: string
  /** 주면 결과 줄을 그리지 않고 결과를 넘긴다 */
  onResult?(notice: CopyNotice): void
}) {
  const [own, setOwn] = useState<CopyNotice>(null)
  const report = onResult ?? setOwn

  async function copy() {
    if (disabled) return
    if (unavailable) return report({ ok: false, text: unavailable })
    try {
      await navigator.clipboard.writeText(typeof text === 'function' ? text() : text)
      report({ ok: true, text: doneText })
    } catch {
      report({ ok: false, text: COPY_FAILED })
    }
  }

  return (
    <>
      <button type="button" aria-disabled={disabled ? true : undefined} className={`${ds.button.secondarySmall} max-md:w-full`} onClick={() => void copy()}>
        <Icon name="copy" />
        {label}
      </button>
      {!onResult && <CopyNoticeLine notice={own} />}
    </>
  )
}
