// 동네 훑기 그림 둘(시안 docs/mockups/location/index.html ICON.plus·ext 그대로). 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor)

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
