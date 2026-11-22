// 동네 훑기 그림 셋(시안 docs/mockups/location/index.html ICON.plus·ext·warn 그대로). 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor)
// — 경고 세모 안의 느낌표만 바탕색 토큰(text-surface)

export function WarnIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-warning">
      <path d="M8 1.8 15 14H1z" fill="currentColor" />
      <path d="M8 6v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-surface" />
      <circle cx="8" cy="11.7" r=".9" fill="currentColor" className="text-surface" />
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

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
      <path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  )
}
