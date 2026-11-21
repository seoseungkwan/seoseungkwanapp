// 내 낱말 칸의 아이콘. 그림은 승인 시안 docs/mockups/notices/index.html의 I(tag·plus·x·info·stop) 그대로다.
// 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor) → 놓는 자리가 text-* 토큰 클래스로 정한다

export function TagIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M2 2.5h5.5l6.5 6.5-5 5-6.5-6.5z" />
      <circle cx="5.2" cy="5.7" r="1" />
    </svg>
  )
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function XIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}

export function InfoIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2v3.8M8 5v.4" />
    </svg>
  )
}

export function StopIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.5 13.5l7-7" />
    </svg>
  )
}
