// 자료실 그림 셋 — 공용 Icon(components/common/Icon.tsx)에 없는 것만 (spec library design.md '화면' 그림).
// 그림은 승인 시안 docs/mockups/library/index.html의 ICON.download·ICON.file·ICON.corner 그대로다. 늘 꾸밈이다(aria-hidden).
// 색은 글자색을 따른다(currentColor) → 놓는 자리가 text-* 토큰 클래스로 정한다

type IconProps = { className?: string }

/** [받기] 단추(16px) */
export function DownloadIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M8 2.5v8M5 7.5l3 3 3-3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" />
    </svg>
  )
}

/** 올리기 창의 고른 파일(16px) */
export function FileIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  )
}

/** 옛 판 줄 앞 꺾인 화살표(14px) */
export function CornerIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4 2.5v5a2 2 0 0 0 2 2h7M10 6.5l3 3-3 3" />
    </svg>
  )
}
