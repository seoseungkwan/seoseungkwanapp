import type { MouseEvent, ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { FRAME_TEXT as T } from './text'

// 왼쪽 목차(시안 .toc, AC-7909.1): 묶음마다 `#sec-{닻}` 링크(닻 = 묶음이 그리는 id, 없으면 id). 누르면 주소를 바꾸지 않고 그 자리로 건너뛴다(onJump(id)).
// 붙는 표시: 위험 신호 수(빨간 칩) · 종합 점수 · 경쟁 의원 수 · 둘레 다른 과 의원 수

export type TocItem = { id: string; title: string; anchor?: string; badge?: ReactNode }

const LINK = `flex min-h-8.5 items-center justify-between gap-1.5 border-b border-line py-1.5 pr-2 text-small text-ink-2 no-underline hover:bg-canvas hover:text-ink ${ds.focusRing}`

export function Toc({ items, onJump }: { items: readonly TocItem[]; onJump: (id: string) => void }) {
  const jump = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    onJump(id)
  }
  return (
    <nav aria-label={T.toc} className="sticky top-4 grid border-t border-line-strong">
      {items.map((it) => (
        <a key={it.id} href={`#sec-${it.anchor ?? it.id}`} className={LINK} onClick={jump(it.id)}>
          <span>{it.title}</span>
          {it.badge}
        </a>
      ))}
    </nav>
  )
}
