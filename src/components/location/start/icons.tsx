// 처음·열쇠 없음 화면의 그림 셋(시안 docs/mockups/location/index.html ICON.key·info·plus 그대로).
// 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor), 크기·선은 시안 값

export function KeyIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <circle cx="5" cy="10.5" r="3" />
      <path d="M7.2 8.3 13.5 2M11 4.5l1.8 1.8M9.5 6l1.3 1.3" />
    </svg>
  )
}

export function InfoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-0.5 shrink-0 text-muted">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 7.2v4M8 4.8v.2" strokeLinecap="round" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}
