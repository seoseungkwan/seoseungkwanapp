// 주간 모음 화면의 아이콘. 그림은 승인 시안 docs/mockups/notices/index.html의 I(left·right·print·info) 그대로다.
// 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor) → 놓는 자리가 text-* 토큰 클래스로 정한다

export function LeftIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  )
}

export function RightIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  )
}

export function PrintIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M4.5 6V2h7v4M4.5 12H2.5V6.5h11V12h-2" />
      <path d="M4.5 9.5h7V14h-7z" />
    </svg>
  )
}

export function InfoIcon() {
  return (
    <svg aria-hidden="true" className="mt-px shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2v3.8M8 5v.4" />
    </svg>
  )
}
