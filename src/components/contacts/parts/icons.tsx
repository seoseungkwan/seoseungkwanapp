// 주소록 부품의 그림 셋(시안 docs/mockups/contacts/index.html ICON.plus·search·ext 그대로). 공용 Icon(common/Icon.tsx)에 없는 것만 여기 둔다.
// 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor), 크기·선은 시안 값

export function PlusIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={`shrink-0 ${className}`}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  )
}

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
      <path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  )
}
