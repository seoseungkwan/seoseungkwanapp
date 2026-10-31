// 앱 탭 줄의 항목 (REQ-008, 시안 A 순서 + 청구 사전점검 목업 '탭 자리': 청구는 매출 바로 뒤). 화면이 있는 것만 href를 둔다.
// href null = 아직 없는 화면 → 링크가 아니라 '준비 중' 단추(design.md '아직 없는 탭은 링크가 아니고 준비 중 툴팁')
export type MenuHref = '/dashboard' | '/claim'
export type MenuItem = {
  label: string
  href: MenuHref | null
  /** 이 탭 자리에 속하는 다른 화면 경로(목업: 설치·연결 확인은 설정 탭 안 [비트 연결]) */
  owns?: readonly string[]
}

export const MENU: readonly MenuItem[] = [
  { label: '대시보드', href: '/dashboard' },
  { label: '통계', href: null },
  { label: 'AI 리포트', href: null },
  { label: '매출', href: null },
  { label: '청구', href: '/claim' },
  { label: '재고', href: null },
  { label: '급여', href: null },
  { label: '일일마감·보고', href: null },
  { label: '월간 PDF', href: null },
  { label: '설정', href: null, owns: ['/claim/setup'] },
]

// 관리자만, 설정 뒤 세로 구분선 다음(AC-008.2)
export const ADMIN_ITEM: { label: '관리자'; href: '/admin' } = { label: '관리자', href: '/admin' }

/** 그 경로이거나 그 아래 경로 */
export const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

/** 지금 화면의 탭 이름. 탭의 href·owns 중 가장 길게 맞는 경로가 이긴다(/claim/setup은 청구가 아니라 설정 자리, AC-006.4) */
export function currentMenuLabel(pathname: string): string | null {
  let best: { label: string; length: number } | null = null
  for (const item of MENU) {
    for (const base of [item.href, ...(item.owns ?? [])]) {
      if (base !== null && isUnder(pathname, base) && (best === null || base.length > best.length)) {
        best = { label: item.label, length: base.length }
      }
    }
  }
  return best?.label ?? null
}
