// 후보 자세히 틀의 그림(시안 docs/mockups/location/index.html ICON.flag·warn·clock·print 그대로).
// 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor) — 경고 세모 안의 느낌표만 바탕색 토큰(text-surface)

export function FlagIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <path d="M3.5 1.5v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 2.2h8.6l-1.9 3.1 1.9 3.1H4z" fill="currentColor" />
    </svg>
  )
}

export function WarnIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <path d="M8 1.8 15 14H1z" fill="currentColor" />
      <path d="M8 6v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-surface" />
      <circle cx="8" cy="11.7" r=".9" fill="currentColor" className="text-surface" />
    </svg>
  )
}

export function ClockIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  )
}

export function PrintIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <path d="M4.5 6V2h7v4M4.5 11.5h-2v-5h11v5h-2" />
      <path d="M4.5 9.5h7V14h-7z" />
    </svg>
  )
}
