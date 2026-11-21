// 대시보드 고시·공지 경고·칸의 아이콘. 그림은 승인 시안 docs/mockups/notices/index.html의 I.warn·I.arrow 그대로다.
// 늘 꾸밈이다(aria-hidden). 색은 글자색(currentColor) → 놓는 자리가 text-* 토큰 클래스로 정한다

export function WarnIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M10 3 18 17H2z" />
      <path d="M10 8v4M10 14.5v.5" />
    </svg>
  )
}

export function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}
