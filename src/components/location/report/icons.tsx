// 한 장 보고서 도구 줄의 그림 셋(시안 docs/mockups/location/index.html ICON.left·download·print 그대로).
// 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor), 크기·선은 시안 값

export function LeftIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  )
}

export function DownloadIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <path d="M8 2.5v8M5 7.5l3 3 3-3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" />
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
