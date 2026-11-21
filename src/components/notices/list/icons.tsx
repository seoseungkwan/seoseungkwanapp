// 글 목록 화면의 아이콘. 그림은 승인 시안 docs/mockups/notices/index.html의 I(star·search·clock·check·flag·warn·ext) 그대로다.
// 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor) → 놓는 자리가 text-* 토큰 클래스로 정한다

export function StarIcon({ on }: { on: boolean }) {
  return (
    <svg aria-hidden="true" className="shrink-0" width="18" height="18" viewBox="0 0 20 20" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" />
    </svg>
  )
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  )
}

export function ClockIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  )
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  )
}

export function FlagIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 1.5h1.6v13H3z" />
      <path d="M4.6 2h8.4l-2 3.2 2 3.3H4.6z" />
    </svg>
  )
}

export function WarnIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M10 3 18 17H2z" />
      <path d="M10 8v4M10 14.5v.5" />
    </svg>
  )
}

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 3h4v4M13 3 7.5 8.5M12 9.5V13H3V4h3.5" />
    </svg>
  )
}
