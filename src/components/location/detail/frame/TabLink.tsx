import Link from 'next/link'
import type { MouseEvent, ReactNode } from 'react'

// '근거와 출처' 안쪽 탭의 한 줄로 가는 링크(법 근거 `#law-<id>`·점수 매기는 법 `#src-score`, TASK-28 닻).
// 여는 콜백을 주면 그냥 누를 때 주소 이동 대신 그 콜백을 부른다(새 탭 누르기는 그대로) — common/SourceLine과 같은 방식

const plainClick = (e: MouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey

export const lawHref = (id: string) => `/location?tab=sources#law-${id}`

export function TabLink({ href, className, onOpen, children }: { href: string; className: string; onOpen?: () => void; children: ReactNode }) {
  const onClick = onOpen
    ? (e: MouseEvent<HTMLAnchorElement>) => {
        if (!plainClick(e)) return
        e.preventDefault()
        onOpen()
      }
    : undefined
  return (
    <Link href={href} prefetch={false} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}
