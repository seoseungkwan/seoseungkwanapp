// 앱 탭 줄의 항목 (REQ-008, 시안 A 순서). 화면이 있는 것만 href를 둔다.
// href null = 아직 없는 화면 → 링크가 아니라 '준비 중' 단추(design.md '아직 없는 탭은 링크가 아니고 준비 중 툴팁')
export type MenuItem = { label: string; href: '/dashboard' | null }

export const MENU: readonly MenuItem[] = [
  { label: '대시보드', href: '/dashboard' },
  { label: '통계', href: null },
  { label: 'AI 리포트', href: null },
  { label: '매출', href: null },
  { label: '재고', href: null },
  { label: '급여', href: null },
  { label: '일일마감·보고', href: null },
  { label: '월간 PDF', href: null },
  { label: '설정', href: null },
]

// 관리자만, 설정 뒤 세로 구분선 다음(AC-008.2)
export const ADMIN_ITEM: { label: '관리자'; href: '/admin' } = { label: '관리자', href: '/admin' }
