// 앱 탭 줄의 항목 (tab-frame REQ-302, design.md '탭 목록'). 12개 모두 자기 주소(path)로 가는 링크다.
// 탭 띠에는 주요 메뉴 넷(primary)만 있고, 나머지는 [더보기] 판에 MENU 차례로 있다(dashboard-ux REQ-2702).
// 매출 탭은 통계 매출 칸으로 옮겨 없앴다. 옛 주소 /revenue는 next.config.ts가 /stats로 넘긴다(stats-revenue AC-4110.1·AC-4110.2).
// 화면이 아직 없는 기능은 그 주소의 '준비 중' 화면이다. 비트 PC 연결 화면(/claim/setup)은 설정 탭 자리에 속한다(owns).
// 관리자 화면은 탭이 아니라 계정 메뉴의 [가입 승인](ADMIN_LINK)이다
export type MenuLabel =
  | '대시보드'
  | '통계'
  | '청구'
  | '고시·공지'
  | '환자'
  | 'AI 리포트'
  | '서식'
  | '직원'
  | '업무일지'
  | '재고'
  | '주소록'
  | '설정'
export type MenuPath =
  | '/dashboard'
  | '/stats'
  | '/claim'
  | '/notices'
  | '/patients'
  | '/ai-report'
  | '/forms'
  | '/staff'
  | '/worklog'
  | '/inventory'
  | '/contacts'
  | '/settings'
/** 기능 자신의 화면이 있는 주소. 다음 명세가 화면을 만들면 여기에 더한다 */
export type MenuHref = '/dashboard' | '/stats' | '/claim' | '/patients' | '/ai-report' | '/forms' | '/worklog' | '/settings'

export type MenuItem = {
  label: MenuLabel
  /** 탭이 가는 곳(모두 있다). 화면이 없는 기능은 그 기능 주소의 '준비 중' 화면 */
  path: MenuPath
  /** 기능 자신의 화면. 아직 없으면 null. 있으면 path와 같다.
   *  SetupScreen이 설정의 이 값으로 [청구·연락] 링크를 정한다 */
  href: MenuHref | null
  /** 이 탭 자리에 속하는 다른 화면 경로(설정 탭의 비트 PC 연결 /claim/setup) */
  owns?: readonly string[]
  /** 지금 쓸 수 있는 화면이 있다. false면 그 주소는 '준비 중' 화면이고 [더보기] 판에 "준비 중" 칩이 붙는다(dashboard-ux AC-2702.2).
   *  false인 주소들은 common/notReadyFeatures.ts의 NOT_READY_FEATURES와 같다(시험이 견준다) */
  ready: boolean
  /** 탭 띠의 주요 메뉴(대시보드·통계·청구·환자). false면 [더보기] 판에 있다(dashboard-ux AC-2702.1) */
  primary: boolean
}

export const MENU: readonly MenuItem[] = [
  { label: '대시보드', path: '/dashboard', href: '/dashboard', ready: true, primary: true },
  { label: '통계', path: '/stats', href: '/stats', ready: true, primary: true },
  { label: '청구', path: '/claim', href: '/claim', ready: true, primary: true },
  { label: '고시·공지', path: '/notices', href: null, ready: false, primary: false },
  { label: '환자', path: '/patients', href: '/patients', ready: true, primary: true },
  { label: 'AI 리포트', path: '/ai-report', href: '/ai-report', ready: true, primary: false },
  { label: '서식', path: '/forms', href: '/forms', ready: true, primary: false }, // 휴진 안내 서식 화면(forms AC-3501.1)
  { label: '직원', path: '/staff', href: null, ready: false, primary: false },
  { label: '업무일지', path: '/worklog', href: '/worklog', ready: true, primary: false },
  { label: '재고', path: '/inventory', href: null, ready: false, primary: false },
  { label: '주소록', path: '/contacts', href: null, ready: false, primary: false },
  // 설정 화면 /settings(precheck AC-012.6). 비트 PC 연결(/claim/setup)에 있어도 설정 탭이 지금 탭이다.
  // SetupScreen의 [청구·연락]은 이 href로 가는 링크가 된다
  { label: '설정', path: '/settings', href: '/settings', owns: ['/claim/setup'], ready: true, primary: false },
]

/** 탭 띠의 주요 메뉴 넷(MENU 차례) */
export const PRIMARY_MENU: readonly MenuItem[] = MENU.filter((item) => item.primary)
/** [더보기] 판의 나머지(MENU 차례) */
export const MORE_MENU: readonly MenuItem[] = MENU.filter((item) => !item.primary)

// 관리자만, 계정 메뉴 첫 항목(REQ-304)
export const ADMIN_LINK: { label: '가입 승인'; href: '/admin' } = { label: '가입 승인', href: '/admin' }

/** 그 경로이거나 그 아래 경로 */
export const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

/** 지금 화면의 탭 이름. 탭의 path·owns 중 가장 길게 맞는 경로가 이긴다(/claim/setup은 청구 /claim보다 설정 /claim/setup이 길게 맞는다, AC-302.4) */
export function currentMenuLabel(pathname: string): MenuLabel | null {
  let best: { label: MenuLabel; length: number } | null = null
  for (const item of MENU) {
    for (const base of [item.path, ...(item.owns ?? [])]) {
      if (isUnder(pathname, base) && (best === null || base.length > best.length)) {
        best = { label: item.label, length: base.length }
      }
    }
  }
  return best?.label ?? null
}
