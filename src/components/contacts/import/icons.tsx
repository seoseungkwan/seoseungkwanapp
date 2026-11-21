// 올리기 부품 그림 넷. 그림은 승인 시안 docs/mockups/contacts/index.html의 ICON.upload·download·file·warn 그대로다(16 칸).
// 늘 꾸밈이다(aria-hidden). 선 그림은 글자색(currentColor)을 따른다 → 놓는 자리가 text-* 토큰으로 색을 정한다

const LINE = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true } as const

export function UploadIcon({ className }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" />
    </svg>
  )
}

export function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M8 2.5v8M5 7.5l3 3 3-3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" />
    </svg>
  )
}

export function FileIcon({ className }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z" />
      <path d="M9.5 1.5V5H13M5.5 8.5l5 4M10.5 8.5l-5 4" />
    </svg>
  )
}

// 채운 세모(warning) 안 흰 느낌표(surface)
export function WarnIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 ${className ?? ''}`}>
      <path d="M8 1.8 15 14H1z" className="fill-warning" />
      <path d="M8 6v3.6" strokeWidth="1.6" strokeLinecap="round" className="stroke-surface" />
      <circle cx="8" cy="11.7" r=".9" className="fill-surface" />
    </svg>
  )
}
