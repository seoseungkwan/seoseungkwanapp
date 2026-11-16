'use client'

import { useEffect, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'

// 장부 칸 위에 뜨는 작은 판(시안 ?s=pick의 .pop: 340px·누른 칸 아래 6px·흐린 바탕). 받은 글을 그리기만 한다 → 장부 줄 화면(rows)도 쓴다.
// 휴대폰은 좌우 16px·위 120px에 붙는다. Esc·바탕 누름은 닫기다

/** 누른 칸 자리(화면 기준) */
export type Anchor = { bottom: number; left: number }

export function anchorOf(element: Element): Anchor {
  const rect = element.getBoundingClientRect()
  return { bottom: rect.bottom, left: rect.left }
}

export function Pop({ anchor, titleId, onClose, children }: { anchor: Anchor; titleId: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const top = Math.max(16, Math.min(anchor.bottom + 6, window.innerHeight - 470))
  const left = Math.max(16, Math.min(anchor.left, window.innerWidth - 356))
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ top, left }}
        className={`${ds.layer} fixed z-50 grid w-85 gap-3 p-4 max-md:right-4! max-md:left-4! max-md:top-30! max-md:w-auto`}
      >
        {children}
      </div>
    </>
  )
}

/** 판 머리: 제목(15px 600) + 작은 회색 한 줄 */
export function PopHead({ id, title, who }: { id: string; title: string; who: string }) {
  return (
    <div>
      <h4 id={id} className="text-body font-semibold text-ink">
        {title}
      </h4>
      <p className="text-caption text-muted">{who}</p>
    </div>
  )
}
